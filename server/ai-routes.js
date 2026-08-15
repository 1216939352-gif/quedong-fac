/**
 * 鹊动系统 — AI 路由层（提案 4.x：/api/ai/*）
 *
 * 挂载方式（server.js 中）：
 *   app.use('/api/ai', authMiddleware);
 *   require('./ai-routes')(app, db, verifyToken);
 *
 * 提供：
 *   GET  /api/ai/status             → 当前 AI 可用性与模式
 *   POST /api/ai/chat               → 问答（临床辅助聊天）
 *   POST /api/ai/generate-plan      → 基于评估结果产出结构化方案 + 规则闸门校验
 *
 * 关键安全属性：
 *   - 云 API Key 仅存于服务端 env，绝不出现在任何响应体或前端代码。
 *   - 前端只拿到「模型回复文本 / 结构化方案 / 闸门结论」，拿不到端点 Key。
 *   - 健康数据仅在服务端构造 prompt，不出本地网络（本地模式）。
 */
'use strict';

const ai = require('./ai-config');
const rag = require('./rag'); // 轻量检索增强（临床指引知识库）

/* AI 外部调用 HTTP 代理支持：Railway 等海外部署访问国内模型 API（火山方舟/腾讯 MaaS）常因网络不通失败。
   配置 AI_HTTP_PROXY（或 HTTPS_PROXY / HTTP_PROXY）后，所有云端/视觉/图像模型调用均经代理转发；
   本地地址（localhost/127.0.0.1）不走代理，Ollama 本地模式不受影响。未配置则直连，行为与先前一致。 */
let _proxyAgent = null;
function isLocalUrl(u) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(u || '');
}
(function initProxy() {
  const proxyUrl = process.env.AI_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxyUrl) return;
  try {
    const { ProxyAgent } = require('undici');
    _proxyAgent = new ProxyAgent(proxyUrl);
    const masked = proxyUrl.replace(/\/\/([^:@]+:)?[^@]+@/, '//***@');
    console.log('[AI] 已启用 HTTP 代理转发模型调用:', masked);
  } catch (e) {
    console.warn('[AI] 代理初始化失败（需依赖 undici，已忽略，将直连）:', e.message);
  }
})();

/** 统一超时 fetch（外部模型调用自动经代理，本地地址直连） */
async function fetchWithTimeout(url, options, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs || ai.cfg.timeoutMs);
  const opts = { ...options, signal: ac.signal };
  if (_proxyAgent && !isLocalUrl(url)) opts.dispatcher = _proxyAgent;
  try {
    return await fetch(url, opts);
  } finally {
    clearTimeout(t);
  }
}

/** 调用本地 Ollama /api/chat（非流式） */
async function callLocal(messages, opts) {
  const body = {
    model: (opts && opts.model) || ai.cfg.local.model,
    messages,
    stream: false,
    options: { temperature: 0.3, num_predict: ai.cfg.maxTokens },
  };
  const r = await fetchWithTimeout(ai.cfg.local.url + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('ollama ' + r.status);
  const j = await r.json();
  return (j.message && j.message.content) || '';
}

/** 调用云 Chat Completions（OpenAI 兼容）
 *  @param {boolean} jsonMode 是否要求模型输出 JSON；DeepSeek 等厂商强制要求 prompt 中出现 'json' 字样才接受 json_object。
 *  @param {number} [maxTokens] 覆盖默认输出长度上限（方案类需更长，避免被截断成半截 JSON）
 */
async function callCloud(messages, jsonMode, maxTokens, opts) {
  // 按模型 id 选择 baseUrl/apiKey（DeepSeek 等可携带独立 endpoint）
  const m = ai.findCloudModel(opts && opts.model) || {};
  const baseUrl = m.baseUrl || ai.cfg.cloud.baseUrl;
  const apiKey = m.apiKey || ai.cfg.cloud.apiKey;
  const body = {
    model: m.id || ai.cfg.cloud.model,
    messages,
    temperature: 0.3,
    max_tokens: maxTokens || ai.cfg.maxTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const r = await fetchWithTimeout(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('cloud ' + r.status);
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

/* ══════════════════════════════════════════════════════════════
 * 流式（SSE）调用层
 *   目标：把 10–30s 的整段等待，变成「首字 1–2s 到达 + 逐字增长」。
 *   两种上游协议差异：
 *     - Ollama  ：NDJSON，每行 {"message":{"content":"x"},"done":false}
 *     - OpenAI 兼容：SSE，每行 data: {"choices":[{"delta":{"content":"x"}}]}，以 data: [DONE] 收尾
 *   统一归一为 onDelta(text) 回调，向下游吐同一种 SSE 帧。
 * ══════════════════════════════════════════════════════════════ */

/** 空闲看门狗：流式不能用「总时长超时」，否则长回答会被腰斩；改为「N 毫秒无新数据才判死」 */
function makeIdleWatchdog(ac, idleMs) {
  let last = Date.now();
  const timer = setInterval(() => {
    if (Date.now() - last > idleMs) {
      try { ac.abort(); } catch {}
    }
  }, 2000);
  if (timer.unref) timer.unref();
  return {
    tick() { last = Date.now(); },
    stop() { clearInterval(timer); },
  };
}

/** 逐行读取上游响应体（兼容 \r\n），行回调式解析 */
async function readLines(body, onLine) {
  const reader = body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  }
  buf += dec.decode();
  if (buf.trim()) onLine(buf.trim());
}

/** 流式调用本地 Ollama（NDJSON → onDelta） */
async function callLocalStream(messages, onDelta, ac, model) {
  const dog = makeIdleWatchdog(ac, ai.cfg.timeoutMs);
  try {
    const r = await fetch(ai.cfg.local.url + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || ai.cfg.local.model,
        messages,
        stream: true,
        options: { temperature: 0.3, num_predict: ai.cfg.maxTokens },
      }),
      signal: ac.signal,
    });
    if (!r.ok || !r.body) throw new Error('ollama ' + r.status);
    await readLines(r.body, (line) => {
      dog.tick();
      let j;
      try { j = JSON.parse(line); } catch { return; }
      const t = j && j.message && j.message.content;
      if (t) onDelta(t);
    });
  } finally {
    dog.stop();
  }
}

/** 流式调用云端 OpenAI 兼容接口（SSE → onDelta） */
async function callCloudStream(messages, onDelta, ac, maxTokens, model) {
  const dog = makeIdleWatchdog(ac, ai.cfg.timeoutMs);
  try {
    // 按模型 id 选择 baseUrl/apiKey（DeepSeek 等可携带独立 endpoint）
    const m = ai.findCloudModel(model) || {};
    const baseUrl = m.baseUrl || ai.cfg.cloud.baseUrl;
    const apiKey = m.apiKey || ai.cfg.cloud.apiKey;
    const streamOpts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: m.id || ai.cfg.cloud.model,
        messages,
        temperature: 0.3,
        max_tokens: maxTokens || ai.cfg.maxTokens,
        stream: true,
      }),
      signal: ac.signal,
    };
    if (_proxyAgent && !isLocalUrl(baseUrl)) streamOpts.dispatcher = _proxyAgent;
    const r = await fetch(baseUrl + '/chat/completions', streamOpts);
    if (!r.ok || !r.body) throw new Error('cloud ' + r.status);
    let finished = false;
    await readLines(r.body, (line) => {
      dog.tick();
      if (finished) return;
      if (line.startsWith(':')) return;               // 上游心跳注释行
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') { finished = true; return; }
      let j;
      try { j = JSON.parse(payload); } catch { return; }
      const d = j.choices && j.choices[0] && j.choices[0].delta;
      const t = d && typeof d.content === 'string' ? d.content : '';
      if (t) onDelta(t);
    });
  } finally {
    dog.stop();
  }
}

/**
 * 流式统一入口：解析提供方 → 流式调用 → 失败回落。
 * 关键约束：**只有在尚未吐出任何 token 时才允许回落**，否则会出现前半段本地、后半段云端的拼接错乱。
 * @param {Array} messages
 * @param {{prefer?:string, maxTokens?:number, signal?:AbortSignal}} opts
 * @param {(t:string)=>void} onDelta
 * @returns {Promise<{provider:string, fellBack:boolean, text:string}>}
 */
async function chatStream(messages, opts, onDelta) {
  const o = opts || {};
  const prov = await ai.resolveProvider(o.prefer || null, o.model);
  if (prov.primary === 'offline') {
    const e = new Error('AI 未配置（离线模式）');
    e.code = 'ai_offline';
    throw e;
  }
  let text = '';
  let emitted = 0;
  const wrap = (t) => { text += t; emitted++; onDelta(t); };

  const run = async (who) => {
    const ac = new AbortController();
    if (o.signal) {
      if (o.signal.aborted) ac.abort();
      else o.signal.addEventListener('abort', () => { try { ac.abort(); } catch {} }, { once: true });
    }
    if (who === 'local') await callLocalStream(messages, wrap, ac, o.model);
    else await callCloudStream(messages, wrap, ac, o.maxTokens, o.model);
  };

  try {
    await run(prov.primary);
    return { provider: prov.primary, fellBack: false, text };
  } catch (e1) {
    if (emitted === 0 && prov.fallback) {
      try {
        await run(prov.fallback);
        return { provider: prov.fallback, fellBack: true, text };
      } catch (e2) {
        e2.code = 'ai_unavailable';
        throw e2;
      }
    }
    if (emitted > 0) {
      // 已经吐了一部分：不重来，交给上层作为「部分成功」收尾
      const e = new Error(e1.message || '流式中断');
      e.code = 'ai_stream_interrupted';
      e.partial = text;
      e.provider = prov.primary;
      throw e;
    }
    e1.code = e1.code || 'ai_unavailable';
    throw e1;
  }
}

/** 建立 SSE 下行通道（含反缓冲头 + 心跳 + 断连清理） */
function openSSE(req, res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx 反代下禁用缓冲，否则「流」会变成「一次性到达」
  });
  if (res.flushHeaders) res.flushHeaders();
  res.write(': open\n\n');

  let closed = false;
  const hb = setInterval(() => { if (!closed) { try { res.write(': ping\n\n'); } catch {} } }, 15000);
  if (hb.unref) hb.unref();

  const ac = new AbortController();
  const onClose = () => { closed = true; clearInterval(hb); try { ac.abort(); } catch {} };
  // ⚠️ 必须监听 res 而非 req：Node ≥16 中 express.json() 读完请求体后 req 立即触发 'close'，
  //    若挂在 req 上会导致 SSE 刚建立就自我 abort，响应永不结束、前端挂死。
  //    res 的 'close' 只在「客户端断开」或「我们自己 end()」时触发，后者时 closed 已为 true，幂等无害。
  res.on('close', onClose);

  return {
    signal: ac.signal,
    get closed() { return closed; },
    send(event, data) {
      if (closed) return;
      try {
        res.write('event: ' + event + '\n');
        res.write('data: ' + JSON.stringify(data) + '\n\n');
      } catch { closed = true; }
    },
    end() {
      if (closed) return;
      closed = true;
      clearInterval(hb);
      try { res.end(); } catch {}
    },
  };
}

/**
 * 按模式解析提供方并调用，primary 失败自动回落 fallback。
 * @param {Array} messages OpenAI 格式消息
 * @param {{prefer?:string, jsonMode?:boolean, maxTokens?:number}} opts
 */
async function chatOnce(messages, opts) {
  const prefer = (opts && opts.prefer) || null;
  const jsonMode = !!(opts && opts.jsonMode);
  const maxTokens = opts && opts.maxTokens;
  const prov = await ai.resolveProvider(prefer, opts && opts.model);
  if (prov.primary === 'offline') {
    const e = new Error('AI 未配置（离线模式）');
    e.code = 'ai_offline';
    throw e;
  }
  try {
    const reply =
      prov.primary === 'local' ? await callLocal(messages, opts) : await callCloud(messages, jsonMode, maxTokens, opts);
    return { reply, provider: prov.primary };
  } catch (e1) {
    if (prov.fallback) {
      try {
        const reply = prov.fallback === 'local' ? await callLocal(messages, opts) : await callCloud(messages, jsonMode, maxTokens, opts);
        return { reply, provider: prov.fallback, fellBack: true };
      } catch (e2) {
        e2.code = 'ai_unavailable';
        throw e2;
      }
    }
    e1.code = e1.code || 'ai_unavailable';
    throw e1;
  }
}

/** 构造评估上下文文本（脱敏：只留 gender/age/bmi/客观指标，含 SarcEngine2 结构化结果可直传） */
function buildContextText(context) {
  if (!context) return '(无附加评估数据)';
  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

/**
 * 检索增强块：依据评估上下文抽取 Top-K 临床指引片段，作为内部约束注入提示词。
 * 命中为空时返回空串（不影响离线/降级路径）。
 * @param {Object} context 评估上下文
 * @param {number} [k=4]
 */
function ragContextBlock(context, k) {
  const bits = rag.retrieve(buildContextText(context), k || 4);
  if (!bits.length) return '';
  return (
    '\n\n【参考临床指引（内部检索增强，仅作约束，请勿原样输出给用户）】\n' +
    bits.map((t, i) => (i + 1) + '. ' + t).join('\n') +
    '\n请优先依据上述指引中的客观强度范围、禁忌与注意事项，结合本次评估给出结论；不要编造超出指引与评估数据的设备参数或诊断。'
  );
}

/**
 * 服务端规则闸门（评估感知版）：对 AI 产出做安全兜底校验，并生成「可解释依据」。
 * 与前端 PlanEngine v1 的 safetyGate 同源原则：安全优先、强度锚定客观数据、老年/不对称特殊处理。
 * @param {Object} plan AI 生成的方案对象
 * @param {Object} [context] 原始评估上下文（patient/assessment），用于评估感知校验
 */
function gatePlan(plan, context) {
  const violations = [];
  const warnings = [];
  const reasons = [];
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  if (!plan || typeof plan !== 'object') {
    return { ok: false, violations: ['模型未返回可解析方案对象'], warnings, reasons };
  }
  const ctx = context || {};
  const patient = ctx.patient || {};
  const assessment = ctx.assessment || {};
  const age = num(patient.age) != null ? num(patient.age) : num(assessment.age);
  const elderly = age != null && age >= 65;

  // 1) 强度不越界 + 老年上限
  const cap = elderly ? 80 : 95;
  const intensities = [];
  JSON.stringify(plan, (k, v) => {
    if (/pct|percentage|intensity/i.test(k) && typeof v === 'number') intensities.push(v);
    return v;
  });
  for (const p of intensities) {
    if (p < 30 || p > 95) violations.push(`强度 ${p}% 超出安全区间 30–95%`);
    else if (p > cap) violations.push(`强度 ${p}% 超出${elderly ? '老年(≥65)' : '安全'}上限 ${cap}%`);
  }
  reasons.push(`强度锚定：采用${elderly ? '老年人群 ≤80%' : '一般人群 ≤95%'}上限${intensities.length ? '，本次最高 ' + Math.max(...intensities) + '%' : ''}。`);

  // 2) 安全字段：必须存在禁忌/注意事项字段
  const hasSafety =
    plan.safety || plan.contraindications || plan.cautions || plan.redFlags;
  if (!hasSafety) {
    warnings.push('方案缺少 safety 字段，前端已提示人工补充禁忌/注意事项。');
  } else {
    reasons.push('已纳入安全字段（禁忌/注意事项），与评估病史交叉核对。');
  }

  // 3) LSI 不对称：弱侧优先、双侧分设强度
  const lsiVal = assessment.lsi != null ? num(assessment.lsi)
    : (ctx.lsi != null ? num(ctx.lsi) : null);
  if (lsiVal != null && Math.abs(lsiVal) >= 15) {
    warnings.push(`肢体对称指数差异 ${lsiVal}% ≥15%：弱侧优先、双侧分设强度。`);
    reasons.push(`LSI=${lsiVal}%（≥15%）：采用弱侧优先、双侧分设强度策略。`);
  }

  if (plan.generatedBy !== 'ai' && plan.generatedBy !== 'hybrid') {
    plan.generatedBy = 'ai'; // 标注来源，便于前端区分规则引擎产出
  }
  return { ok: violations.length === 0, violations, warnings, reasons };
}

/** 尝试修复「尾部被 max_tokens 截断」的半截 JSON（仅当结构可推断时） */
function tryRepairTruncatedJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let body = text.slice(start).replace(/```+\s*$/, '');
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      if (!stack.length) return null;
      const top = stack.pop();
      if ((top === '{' && c !== '}') || (top === '[' && c !== ']')) return null;
    }
  }
  // 去掉尾随逗号后补全未闭合括号
  let fixed = body.replace(/,(\s*[}\]])/g, '$1');
  while (stack.length) {
    const top = stack.pop();
    fixed += top === '{' ? '}' : ']';
  }
  try { return JSON.parse(fixed); } catch { return null; }
}

/** 规范化常见模型 JSON 瑕疵：尾部逗号、C 风格注释、多余空白 */
function normalizeJSON(text) {
  return text
    .replace(/\/\/[^\n]*(?:\n|$)/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/\n/g, '\\n');
}

/** 从模型文本中尽量抽取 JSON 对象（兼容 markdown 代码块、直接 JSON、嵌套大括号、截断修复、规范化兜底） */
function extractJSON(text) {
  if (!text) return null;
  const s = text.trim().replace(/^\uFEFF/, '');

  // 1) markdown 代码块 ```json ... ``` / ``` ... ```（取最长的合法代码块）
  let bestCode = null;
  const codeRe = /```(?:json)?\s*([\s\S]*?)```/g;
  for (let m; (m = codeRe.exec(s)); ) {
    const inner = m[1].trim();
    try {
      const parsed = JSON.parse(inner);
      if (!bestCode || JSON.stringify(parsed).length > JSON.stringify(bestCode).length) bestCode = parsed;
    } catch {
      try {
        const parsed = JSON.parse(normalizeJSON(inner));
        if (!bestCode || JSON.stringify(parsed).length > JSON.stringify(bestCode).length) bestCode = parsed;
      } catch {}
    }
  }
  if (bestCode) return bestCode;

  // 2) 整段就是 JSON
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.parse(s); } catch {
      try { return JSON.parse(normalizeJSON(s)); } catch {}
    }
  }

  // 3) 大括号平衡截取（避开字符串中的花括号）
  let start = s.indexOf('{');
  if (start !== -1) {
    let best = null, bestLen = 0;
    // 可能有多个顶层 JSON（少见），遍历每个起始 { 取最大合法对象
    while (start !== -1) {
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === '{' || c === '[') depth++;
          else if (c === '}' || c === ']') {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
      }
      if (end !== -1) {
        const candidate = s.slice(start, end + 1);
        const len = candidate.length;
        try {
          const parsed = JSON.parse(candidate);
          if (len > bestLen) { best = parsed; bestLen = len; }
        } catch {
          try {
            const parsed = JSON.parse(normalizeJSON(candidate));
            if (len > bestLen) { best = parsed; bestLen = len; }
          } catch {}
        }
      }
      start = s.indexOf('{', start + 1);
    }
    if (best) return best;
    // 4) 截断修复兜底
    const repaired = tryRepairTruncatedJSON(s);
    if (repaired) return repaired;
  }
  return null;
}

/* ── 提示词构造（流式 / 非流式共用，避免两套 prompt 漂移） ── */

/** 问答消息体：system + 可选评估上下文 + 用户历史 */
function buildChatMessages(b) {
  const userMsgs = Array.isArray(b.messages) ? b.messages : [];
  const messages = [{ role: 'system', content: ai.cfg.systemPrompt }];
  if (b.context) {
    messages.push({ role: 'system', content: '参考评估上下文（已脱敏）：\n' + buildContextText(b.context) });
  }
  for (const m of userMsgs) {
    if (m && m.role && m.content) messages.push({ role: m.role, content: String(m.content) });
  }
  return messages;
}

/** 解读消息体：system(含 RAG 检索增强) + 评估结果 */
function buildInterpretMessages(context) {
  const sysMsg =
    ai.cfg.systemPrompt +
    '\n你是一名资深康复医师助理。请基于以下评估结果，用中文撰写一段结构化解读报告，输出 Markdown 格式。' +
    '要求：包含「## 总体评估」「## 风险与亮点」「## 康复重点」「## 注意事项」等小节；' +
    '使用标题、项目符号、加粗突出关键指标；必要时用表格；可引用客观指标（握力、峰力矩、SMI、BMI 等）；' +
    '不要编造未提供的数值；控制在 400 字以内。' +
    ragContextBlock(context, 4);
  return [
    { role: 'system', content: sysMsg },
    { role: 'user', content: '评估结果（已脱敏）：\n' + buildContextText(context) },
  ];
}

module.exports = function (app, db, verifyToken /*, settings */) {
  // ── 运维级 AI 总开关：被管理员在运维工作台关闭时，所有 AI 端点统一降级 ──
  // 直接读取 db（请求时查询，避免依赖模块加载时序），settings 表在迁移阶段已确保存在。
  function aiGloballyDisabled() {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('ai_enabled');
      const v = row ? row.value : null;
      return v === 'false' || v === '0';
    } catch (e) { return false; }
  }
  function guardAiDisabled(res) {
    res.status(503).json({ error: 'ai_disabled', message: 'AI 功能已被管理员在运维工作台全局关闭', mode: ai.cfg.mode });
    return true;
  }

  /**
   * SSE 端点通用执行器：建流 → meta → 逐字 delta → done/error。
   * 即便中途上游断开，只要已吐出内容就以 done(partial=true) 收尾，
   * 前端可保留已生成部分并提示「结果可能不完整」，而不是整段丢弃。
   */
  async function runSSE(req, res, messages, opts) {
    const sse = openSSE(req, res);
    const t0 = Date.now();
    let n = 0;
    try {
      const r = await chatStream(messages, { ...(opts || {}), signal: sse.signal }, (t) => {
        n++;
        sse.send('delta', { t });
      });
      sse.send('done', {
        provider: r.provider, fellBack: r.fellBack, mode: ai.cfg.mode,
        chunks: n, length: r.text.length, ms: Date.now() - t0, partial: false,
      });
    } catch (e) {
      if (e && e.code === 'ai_stream_interrupted') {
        sse.send('done', {
          provider: e.provider || ai.cfg.mode, fellBack: false, mode: ai.cfg.mode,
          chunks: n, length: (e.partial || '').length, ms: Date.now() - t0,
          partial: true, message: e.message,
        });
      } else {
        sse.send('error', {
          error: (e && e.code) || 'ai_error',
          message: (e && e.message) || '未知错误',
          mode: ai.cfg.mode,
        });
      }
    } finally {
      sse.end();
    }
  }

  // ── 状态 ─────────────────────────────────────────────
  app.get('/api/ai/status', async (req, res) => {
    const st = ai.status();
    // 实时补一次本地探测
    st.localAvailable = await ai.probeLocal();
    st.available = st.localAvailable || st.cloudConfigured;
    st.globallyDisabled = aiGloballyDisabled();
    res.json(st);
  });

  // ── 可选模型列表（前端选择器用） ──────────────────────
  app.get('/api/ai/models', async (req, res) => {
    res.json({ models: ai.getModels(), default: (ai.hy3Configured() && ai.cfg.hy3.model) || (ai.cloudConfigured() && (ai.cfg.cloud.defaultModel || ai.cfg.cloud.model)) || (ai.localConfigured() && ai.cfg.local.model) || null });
  });

  // ── 问答 ─────────────────────────────────────────────
  app.post('/api/ai/chat', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    if (!Array.isArray(b.messages) || !b.messages.length) {
      return res.status(400).json({ error: 'messages 不能为空' });
    }
    try {
      const { reply, provider, fellBack } = await chatOnce(buildChatMessages(b), { prefer: b.prefer, model: b.model });
      res.json({ reply, provider, fellBack: !!fellBack, mode: ai.cfg.mode });
    } catch (e) {
      const code = e.code === 'ai_offline' ? 503 : 502;
      res.status(code).json({ error: e.code || 'ai_error', message: e.message, mode: ai.cfg.mode });
    }
  });

  // ── 问答（SSE 流式） ─────────────────────────────────
  app.post('/api/ai/chat-stream', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    if (!Array.isArray(b.messages) || !b.messages.length) {
      return res.status(400).json({ error: 'messages 不能为空' });
    }
    await runSSE(req, res, buildChatMessages(b), { prefer: b.prefer, model: b.model });
  });

  // ── 方案生成 ─────────────────────────────────────────
  app.post('/api/ai/generate-plan', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    const context = b.context || b.assessment || {};
    const module = context.module || 'sarcopenia';

    let sysMsg, userContent;
    if (module === 'fall-risk') {
      // 跌倒风险：专属 schema（平衡 / 下肢力量 / 步态有氧 / 健康教育）
      sysMsg =
        ai.cfg.systemPrompt +
        '\n你是一名老年跌倒预防康复专家。请基于以下跌倒风险评估结果，输出一个合法 JSON 格式的跌倒预防干预方案。要求：' +
        '1) 只输出一个 JSON 对象，不要解释、前缀、后缀、markdown 代码块；' +
        '2) 顶层键：safety{ contraindications:[], cautions:[] }、' +
        'balance:[{name,sets,reps,cues}]、lowerLimb:[{name,sets,reps,cues}]、' +
        'gait:[{name,sets,duration,cues}]、education:[{point}]；' +
        '3) 所有字符串用双引号，数组/对象末尾不要多余逗号；' +
        '4) 方案须针对评估识别的危险因子（平衡差、步速慢、用药、环境隐患等）给出可执行动作；' +
        '5) cues/point 简短可执行，避免输出超长被截断。' +
        ragContextBlock(context, 4);
      userContent = '跌倒风险评估（已脱敏）：\n' + buildContextText(context);
    } else if (module === 'weight-management') {
      // 体重管理：专属 schema（营养 / 有氧 FITT-VP / 抗阻 / 柔韧 / 平衡 / 周日程）
      sysMsg =
        ai.cfg.systemPrompt +
        '\n你是一名资深体重管理 / 运动营养康复专家。请基于以下体重、体成分与生活方式评估结果，输出一个合法 JSON 格式的体重管理综合干预方案。要求：' +
        '1) 只输出一个 JSON 对象，不要解释、前缀、后缀、markdown 代码块；' +
        '2) 顶层键：safety{ contraindications:[], cautions:[] }、' +
        'nutrition:{ targetCalories(整数kcal), proteinG(整数g), carbG(整数g), fatG(整数g), notes:[] }、' +
        'aerobic:{ weeklyMin(整数分钟), phases:[{name,freq,intensity,min}] }、' +
        'resistance:[{name,sets,reps,rpe,cues:[]}]、flexibility:[{name,sets,holds,cues:[]}]、' +
        'balance:[{name,sets,duration,cues:[]}]、weeklySchedule:[{day,content}]；' +
        '3) 所有字符串用双引号，数组/对象末尾不要多余逗号；' +
        '4) 方案须结合 BMI、腰围、目标热量缺口、合并症与运动风险，给出可执行动作；' +
        '5) 营养处方须给出明确热量与三大营养素克数；运动处方须标注组数/次数/RPE；' +
        '6) cues/notes/point 简短可执行，避免输出超长被截断。' +
        ragContextBlock(context, 4);
      userContent = '体重与体成分评估（已脱敏）：\n' + buildContextText(context);
    } else {
      sysMsg =
        ai.cfg.systemPrompt +
        '\n请基于以下评估结果，输出一个合法 JSON 格式的康复干预方案。要求：' +
        '1) 只输出一个 JSON 对象，不要解释、前缀、后缀、markdown 代码块；' +
        '2) 顶层键：safety{ contraindications:[], cautions:[] }、qudong:[{deviceId,target,sets,reps,intensityPct,restSec,rationale}]、' +
        'bodyweight:[{pattern,name,sets,reps,rpe,regression,progression,cues:[]}]、aerobic{phases,weeklyMin}；' +
        '3) 所有字符串用双引号，数组/对象末尾不要多余逗号；' +
        '4) 强度 intensityPct 必须介于 30–95，且引用客观测试（1RM/峰力矩/握力）；' +
        '5) rationale/cues 尽量简短，避免输出超长被截断。' +
        ragContextBlock(context, 4);
      userContent = '评估结果（已脱敏）：\n' + buildContextText(context);
    }
    const messages = [
      { role: 'system', content: sysMsg },
      { role: 'user', content: userContent },
    ];
    // 方案 JSON 体量较大，单独放宽输出长度；若首轮结果为半截/不可解析，追加更严格约束重试一次
    const PLAN_MAX_TOKENS = 4096;
    let lastReply = '';
    try {
      let attempt = 0;
      while (attempt < 2) {
        const msgs = attempt === 0 ? messages
          : messages.concat([{ role: 'user', content: '上一次输出不是合法 JSON。请严格只输出一个完整、紧凑的 JSON 对象，不要解释、前缀、后缀、markdown 代码块；字符串用双引号；数组/对象末尾不要逗号。' }]);
        const { reply, provider, fellBack } = await chatOnce(msgs, { prefer: b.prefer, model: b.model || (ai.hy3Configured() ? ai.cfg.hy3.model : null), jsonMode: true, maxTokens: PLAN_MAX_TOKENS });
        lastReply = reply;
        const plan = extractJSON(reply);
        if (plan) {
          plan.module = module; // 标注来源方向，便于前端回显路由（体重管理 → 专属渲染器）
          const gate = gatePlan(plan, context);
          return res.json({ provider, fellBack: !!fellBack, mode: ai.cfg.mode, plan, raw: reply, gate });
        }
        attempt++;
      }
      return res.json({
        provider: ai.cfg.mode,
        fellBack: false,
        mode: ai.cfg.mode,
        plan: null,
        raw: lastReply,
        gate: { ok: false, violations: ['模型未返回可解析 JSON'], warnings: [] },
      });
    } catch (e) {
      const code = e.code === 'ai_offline' ? 503 : 502;
      res.status(code).json({ error: e.code || 'ai_error', message: e.message, mode: ai.cfg.mode });
    }
  });

  // ── 报告结构化解析（OCR 文本 / 图像 → 结构化字段，AI 兜底正则） ──
  const REPORT_SCHEMAS = {
    isokinetic:
      'deviceId(设备号),testDate(测试日期 YYYY-MM-DD),side(侧别 left/right/bilateral),speed(测试角速度 °/s),' +
      'concentricPT(向心峰力矩 Nm),concentricForce(向心峰力量 N),concentricAngle(向心峰力矩角度 °),concentricAvgPT(向心平均峰力矩),' +
      'concentricPtBw(向心峰力矩/体重),concentricMaxWork(向心最大做功),concentricAvgWork(向心平均做功),concentricTotalWork(向心总做功),' +
      'concentricMaxPower(向心最大功率),concentricAvgPower(向心平均功率),concentricFatigueIndex(向心疲劳指数 %),' +
      'eccentricPT,eccentricForce,eccentricAngle,eccentricAvgPT,eccentricPtBw,eccentricMaxWork,eccentricAvgWork,eccentricTotalWork,eccentricMaxPower,eccentricAvgPower,eccentricFatigueIndex(离心各项，字段含义同向心)',
    isotonic:
      'deviceId,testDate,side,age,gender(male/female),load(重量 kg),reps(重复次数),xrm(X-RM kg),rm(RM kg),rm1(1RM kg),rm1Bw(1RM/体重)',
    bodycomposition:
      'name,age,gender(male/female),height(cm),weight(kg),id,testDate,score(综合评分),bmi,smi(四肢骨骼肌指数 kg/m²),' +
      'bodyFat(体脂率 %),visceral(内脏脂肪面积 cm²),muscleMass(骨骼肌量 kg),bmr(基础代谢率 kcal),ecwRatio(细胞外水分比)',
  };

  app.post('/api/ai/parse-report', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    const layout = b.layout || b.typeHint || 'generic';
    const typeHint = b.typeHint || layout;
    const schema = REPORT_SCHEMAS[typeHint] || REPORT_SCHEMAS[layout] ||
      'name,age,gender,height,weight,deviceId,testDate,side 等报告中出现的数值指标';
    const images = Array.isArray(b.images) ? b.images.filter(x => typeof x === 'string' && x.length > 50).slice(0, 8) : [];
    const useVision = ai.visionConfigured() && images.length > 0;

    const sysMsg =
      ai.cfg.systemPrompt +
      '\n你是一名康复数据录入员。请严格从给定的报告（OCR 文本或页面图像）中抽取结构化字段，只输出 JSON，不要解释。' +
      '字段清单（英文键，未知则填 null，不要编造、不要推断图表坐标轴以外的数值）：\n' + schema +
      '\n角速度单位 °/s，力矩单位 Nm，力量单位 N，做功单位 J，功率单位 W；日期统一为 YYYY-MM-DD；侧别 left/right/bilateral。';

    const messages = [{ role: 'system', content: sysMsg }];
    if (useVision) {
      const content = [{ type: 'text', text: '请抽取该报告页面的结构化字段（JSON）。' }];
      for (const img of images) {
        content.push({ type: 'image_url', image_url: { url: img.startsWith('data:') ? img : 'data:image/png;base64,' + img } });
      }
      messages.push({ role: 'user', content });
    } else {
      const ocr = typeof b.ocrText === 'string' ? b.ocrText : '';
      messages.push({ role: 'user', content: '报告 OCR 文本如下：\n' + (ocr.slice(0, 8000) || '(无 OCR 文本)') });
    }

    try {
      let provider, reply;
      if (useVision) {
        provider = 'vision';
        const body = { model: ai.cfg.vision.model, messages, temperature: 0.2, max_tokens: ai.cfg.maxTokens, stream: false };
        const r = await fetchWithTimeout(ai.cfg.vision.baseUrl + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.cfg.vision.apiKey },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error('vision ' + r.status);
        const j = await r.json();
        reply = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      } else {
        const c = await chatOnce(messages, { prefer: b.prefer, model: b.model, jsonMode: true, maxTokens: 1536 });
        provider = c.provider; reply = c.reply;
      }
      const fields = extractJSON(reply);
      if (!fields) {
        return res.json({
          provider, usedVision: useVision, mode: ai.cfg.mode, fields: null, raw: reply,
          gate: { ok: false, violations: ['模型未返回可解析 JSON'], warnings: [] },
        });
      }
      const gate = { ok: Object.keys(fields).some(k => fields[k] != null), violations: [], warnings: [] };
      res.json({ provider, usedVision: useVision, mode: ai.cfg.mode, fields, raw: reply, gate });
    } catch (e) {
      const code = e.code === 'ai_offline' ? 503 : 502;
      res.status(code).json({ error: e.code || 'ai_error', message: e.message, mode: ai.cfg.mode });
    }
  });

  // ── 报告解读（Markdown，供前端富文本渲染） ──────────
  app.post('/api/ai/interpret', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    const context = b.context || b.assessment || {};
    try {
      const { reply, provider, fellBack } = await chatOnce(buildInterpretMessages(context), { prefer: b.prefer, model: b.model || (ai.hy3Configured() ? ai.cfg.hy3.model : null) });
      res.json({ provider, fellBack: !!fellBack, mode: ai.cfg.mode, reply });
    } catch (e) {
      const code = e.code === 'ai_offline' ? 503 : 502;
      res.status(code).json({ error: e.code || 'ai_error', message: e.message, mode: ai.cfg.mode });
    }
  });

  // ── 报告解读（SSE 流式，边生成边渲染） ───────────────
  app.post('/api/ai/interpret-stream', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    const b = req.body || {};
    const context = b.context || b.assessment || {};
    await runSSE(req, res, buildInterpretMessages(context), { prefer: b.prefer, model: b.model || (ai.hy3Configured() ? ai.cfg.hy3.model : null) });
  });

  // ── 图像生成（可选能力，未配置时优雅降级） ──────────
  app.post('/api/ai/generate-image', async (req, res) => {
    if (aiGloballyDisabled()) return guardAiDisabled(res);
    if (!ai.imageGenConfigured()) {
      return res.status(409).json({
        error: 'image_gen_not_configured',
        message: '未配置图像生成服务。如需 AI 配图，请在企业服务端 .env 中设置 AI_IMAGE_ENABLED=true 与 AI_IMAGE_BASE_URL / AI_IMAGE_API_KEY / AI_IMAGE_MODEL，并重启后端。',
      });
    }
    const b = req.body || {};
    const prompt = String(b.prompt || '').slice(0, 1000);
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    try {
      const model = b.model || ai.cfg.imageGen.model;
      // 火山方舟图像接口路径为 /images/generations（与文本 chat/completions 分开）
      const r = await fetchWithTimeout(ai.cfg.imageGen.baseUrl + '/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + ai.cfg.imageGen.apiKey,
        },
        // Seedream 5.0 不接受 1024x1024（要求 ≥1920×1920），省略 size 让模型回默认 2048x2048
        body: JSON.stringify({ prompt: prompt, model: model, n: 1 }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error('image gen ' + r.status + ' ' + t.slice(0, 200));
      }
      const j = await r.json();
      const item = (j.data && j.data[0]) || (j.output && j.output[0]);
      const remoteUrl = item ? (item.url || item.b64_json) : (j.url || null);
      if (!remoteUrl) throw new Error('图像服务未返回可用地址');
      // 把临时 TOS 地址（24h 过期）代理成 base64 内联，避免过期 / 跨域；失败则回退原始地址
      let finalUrl = remoteUrl;
      if (/^https?:/i.test(remoteUrl)) {
        try {
          const imgResp = await fetch(remoteUrl);
          if (imgResp.ok) {
            const buf = Buffer.from(await imgResp.arrayBuffer());
            const ct = imgResp.headers.get('content-type') || 'image/jpeg';
            finalUrl = 'data:' + ct + ';base64,' + buf.toString('base64');
          }
        } catch (e) { finalUrl = remoteUrl; }
      }
      res.json({ url: finalUrl, image: finalUrl, provider: model || 'image-gen', size: item && item.size });
    } catch (e) {
      res.status(502).json({ error: 'image_gen_failed', message: e.message });
    }
  });
};
