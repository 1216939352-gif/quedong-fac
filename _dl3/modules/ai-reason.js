/**
 * 鹊动系统 — 前端 AI 接入层（提案 4.x 前端侧）
 *
 * 职责：
 *   - 统一访问后端 /api/ai/*（同源，令牌取自 window.QDAuth）
 *   - 在「严谨版方案」视图注入「鹊动小Qoo 辅助解读」区块（异步、不可用时静默降级）
 *   - 提供轻量问答面板（提案 P0：/api/ai/chat）
 *
 * 安全：绝不持有任何 API Key；密钥只在服务端。本模块只收发「回复文本 / 结构化方案 / 闸门结论」。
 */
(function () {
  'use strict';

  function base() {
    try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; }
  }
  function headers() {
    if (window.QDAuth && typeof window.QDAuth.authHeaders === 'function') return window.QDAuth.authHeaders();
    try { var t = localStorage.getItem('qd_admin_token'); return t ? { Authorization: 'Bearer ' + t } : {}; } catch (e) { return {}; }
  }
  function esc(s) {
    if (window.U && typeof window.U.esc === 'function') return window.U.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 统一小 Qoo 吉祥物图标（绝对路径，避免不同 hash 路由下相对路径解析错误）
  function qooIcon(sizeClass) {
    return '<img class="qoo-icon' + (sizeClass ? ' ' + sizeClass : '') + '" src="/assets/illustrations/小Qoo吉祥物.png" alt="鹊动小Qoo">';
  }

  // 统一加载动画：返回带 spinner 的 loading 片段（复用既有 .ai-spin 样式）
  function spinHTML(label) {
    return '<span class="ai-spin"></span> ' + (label || '加载中…');
  }

  // 统一的“低调降级提示”：小Qoo 图标 + 一行说明，不破坏规则引擎视图（L3-15）
  function mutedNote(host, text) {
    var d = document.createElement('div');
    d.className = 'sarc2-ai muted';
    d.innerHTML = '<span class="ai-icon-wrap">' + qooIcon('sm') + '</span>' + text;
    host.appendChild(d);
  }

  // 错误提示说人话：在 U.errMsg 基础上补充常见错误码的中文映射，避免暴露原始报错
  function aiErrMsg(e) {
    var msg = (window.U && typeof U.errMsg === 'function') ? U.errMsg(e) : (e && e.message ? e.message : String(e));
    if (!msg || msg === 'Error') msg = '服务暂时不可用，请稍后重试';
    if (/ai_offline|未配置/.test(msg)) return '鹊动小Qoo 辅助未启用（未部署模型或离线），请稍后重试或联系管理员';
    if (/503/.test(msg)) return 'AI 服务暂时不可用，请稍后重试';
    if (/502|ai_unavailable/.test(msg)) return 'AI 生成失败，请稍后重试';
    if (/401|403|未登录|无权限/.test(msg)) return '登录已失效，请刷新页面后重新登录';
    if (/timeout|超时|abort/i.test(msg)) return '请求超时，网络可能不稳定，请重试';
    if (/network|fetch|Failed to fetch|ECONNREFUSED|aborted/i.test(msg)) return '鹊动小Qoo 暂时无法连接（后端服务不可达），当前为规则引擎产出。请确认后端已启动。';
    return msg;
  }

  // 按钮防重复提交：点击期间禁用按钮并显示 loading，结束后恢复原始状态
  function lockButton(btn, fn) {
    if (!btn) return fn ? fn() : undefined;
    if (btn.dataset.locked === '1') return; // 已在执行，忽略重复点击
    var prevHTML = btn.innerHTML;
    var prevDisabled = btn.disabled;
    btn.dataset.locked = '1';
    btn.disabled = true;
    if (!btn.querySelector('.ai-spin')) {
      btn.innerHTML = '<span class="ai-spin"></span> ' + (btn.getAttribute('data-loading') || '处理中…');
    }
    var done = function () {
      btn.dataset.locked = '0';
      btn.disabled = prevDisabled;
      btn.innerHTML = prevHTML;
    };
    var p = fn();
    if (p && typeof p.then === 'function') p.then(done, function () { done(); });
    else done();
    return p;
  }

  // ── 报告导出（零依赖：构造 HTML → 隐藏 iframe → window.print）──
  // 不引入任何第三方库；打印样式内联，避免受主应用主题/打印样式干扰。
  function exportPDF(html, filename) {
    var styles = [
      '@page{margin:14mm;}',
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;}',
      'body{font-family:"Microsoft YaHei",-apple-system,"PingFang SC","Segoe UI",sans-serif;color:#1f2937;line-height:1.7;font-size:13px;background:#fff;}',
      '.pdf-wrap{max-width:780px;margin:0 auto;padding:4px 2px;}',
      '.pdf-head{border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:16px;}',
      '.pdf-title{font-size:20px;font-weight:700;color:#1e3a8a;margin:0 0 4px;}',
      '.pdf-meta{font-size:12px;color:#6b7280;}',
      '.pdf-foot{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;}',
      'h1,h2,h3,h4{color:#1e3a8a;line-height:1.4;margin:18px 0 8px;}',
      'h1{font-size:18px;}h2{font-size:16px;}h3{font-size:14px;}',
      'p{margin:8px 0;}',
      'ul,ol{margin:8px 0;padding-left:22px;}',
      'li{margin:4px 0;}',
      'table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px;}',
      'th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;}',
      'th{background:#eff6ff;}',
      'blockquote{margin:8px 0;padding:6px 12px;background:#f9fafb;border-left:3px solid #93c5fd;color:#374151;}',
      'code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:12px;}',
      'pre{background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;overflow:auto;}',
      'pre code{background:none;color:inherit;padding:0;}',
      '.ai-md-img{max-width:100%;height:auto;border-radius:6px;margin:6px 0;}',
      '.ai-plan-card{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin:8px 0;page-break-inside:avoid;}',
      '.ai-plan-card-head{display:flex;justify-content:space-between;font-weight:600;}',
      '.ai-plan-card-body{margin-top:4px;}',
      '.ai-plan-badge{display:inline-block;background:#eff6ff;color:#1e40af;border-radius:6px;padding:2px 8px;margin:2px 4px 2px 0;font-size:12px;}',
      '.ai-plan-safety{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px 12px;margin:8px 0;}',
      'strong{color:#111827;}'
    ].join('\n');
    var doc = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(filename || '鹊动小Qoo报告') +
      '</title><style>' + styles + '</style></head><body><div class="pdf-wrap">' + html + '</div></body></html>';
    try {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);
      var idoc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      idoc.open();
      idoc.write(doc);
      idoc.close();
      // 写完后稍等一帧再打印，确保内容已排版；多数浏览器同步调用亦可，但留缓冲更稳
      setTimeout(function () {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) {}
        setTimeout(function () {
          try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (e) {}
        }, 1000);
      }, 60);
    } catch (e) {
      if (window.U && U.toast) U.toast('导出 PDF 失败：' + (e.message || e), 'error');
    }
  }
  // 把页面上的某个 DOM 元素整体导出为 PDF（供评估报告等任何区块复用）
  function exportContainerPDF(el, filename) {
    if (!el) return;
    exportPDF(el.innerHTML, filename);
  }

  // 自包含 HTML 导出（可微信/浏览器直接打开，便于分享转发）
  function exportHTML(html, filename) {
    filename = filename || '鹊动小Qoo报告';
    var styles = [
      '@page{margin:14mm;}',
      '*{box-sizing:border-box;}',
      'html,body{margin:0;padding:0;}',
      'body{font-family:"Microsoft YaHei",-apple-system,"PingFang SC","Segoe UI",sans-serif;color:#1f2937;line-height:1.7;font-size:13px;background:#fff;}',
      '.pdf-wrap{max-width:780px;margin:0 auto;padding:4px 2px;}',
      '.pdf-head{border-bottom:2px solid #2563eb;padding-bottom:10px;margin-bottom:16px;}',
      '.pdf-title{font-size:20px;font-weight:700;color:#1e3a8a;margin:0 0 4px;}',
      '.pdf-meta{font-size:12px;color:#6b7280;}',
      '.pdf-foot{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;}',
      'h1,h2,h3,h4{color:#1e3a8a;line-height:1.4;margin:18px 0 8px;}',
      'h1{font-size:18px;}h2{font-size:16px;}h3{font-size:14px;}',
      'p{margin:8px 0;}',
      'ul,ol{margin:8px 0;padding-left:22px;}',
      'li{margin:4px 0;}',
      'table{border-collapse:collapse;width:100%;margin:10px 0;font-size:12px;}',
      'th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;}',
      'th{background:#eff6ff;}',
      'blockquote{margin:8px 0;padding:6px 12px;background:#f9fafb;border-left:3px solid #93c5fd;color:#374151;}',
      'code{background:#f3f4f6;padding:1px 4px;border-radius:3px;font-family:Consolas,monospace;font-size:12px;}',
      'pre{background:#0f172a;color:#e2e8f0;padding:10px;border-radius:6px;overflow:auto;}',
      'pre code{background:none;color:inherit;padding:0;}',
      '.ai-md-img{max-width:100%;height:auto;border-radius:6px;margin:6px 0;}',
      '.ai-plan-card{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin:8px 0;page-break-inside:avoid;}',
      '.ai-plan-card-head{display:flex;justify-content:space-between;font-weight:600;}',
      '.ai-plan-card-body{margin-top:4px;}',
      '.ai-plan-badge{display:inline-block;background:#eff6ff;color:#1e40af;border-radius:6px;padding:2px 8px;margin:2px 4px 2px 0;font-size:12px;}',
      '.ai-plan-safety{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;border-radius:8px;padding:8px 12px;margin:8px 0;}',
      'strong{color:#111827;}'
    ].join('\n');
    var doc = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + esc(filename) + '</title><style>' + styles + '</style></head><body><div class="pdf-wrap">' + html + '</div></body></html>';
    try {
      var blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = filename + '.html';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 1500);
    } catch (e) {
      if (window.U && U.toast) U.toast('导出 HTML 失败：' + (e.message || e), 'error');
    }
  }
  // 复制到剪贴板（带 execCommand 降级与提示）
  function fallbackCopy(str) {
    try { var ta = document.createElement('textarea'); ta.value = str; ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.top = '0'; ta.style.left = '0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); } catch (e) {}
  }
  function copyText(str, btn) {
    str = str || '';
    var restore = btn ? btn.textContent : '';
    var ok = function () { if (window.U && U.toast) U.toast('已复制到剪贴板', 'success'); if (btn) { btn.textContent = '✓ 已复制'; setTimeout(function () { btn.textContent = restore; }, 1200); } };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(str).then(ok, function () { fallbackCopy(str); ok(); });
      } else { fallbackCopy(str); ok(); }
    } catch (e) { fallbackCopy(str); ok(); }
  }
  // 统一的 AI 结果操作条：导出 PDF / 导出 HTML / 复制 / 分享 / 历史
  function aiActionBarHTML(savedHint, filename) {
    filename = filename || '鹊动小Qoo报告';
    return '<div class="ai-interp-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm ai-export-pdf" data-filename="' + esc(filename) + '">📄 导出 PDF</button>' +
      '<button type="button" class="btn btn-ghost btn-sm ai-export-html" data-filename="' + esc(filename) + '">🌐 导出 HTML</button>' +
      '<button type="button" class="btn btn-ghost btn-sm ai-copy">📋 复制</button>' +
      '<button type="button" class="btn btn-ghost btn-sm ai-share">📲 分享</button>' +
      '<button type="button" class="btn btn-ghost btn-sm ai-history">📚 历史</button>' +
      (savedHint ? '<span class="ai-interp-saved">✓ ' + savedHint + '</span>' : '') +
      '</div>';
  }
  function wireAIResultActions(scope, payload) {
    payload = payload || {};
    var exBtn = scope.querySelector('.ai-export-pdf');
    if (exBtn) exBtn.onclick = function () {
      var name = exBtn.getAttribute('data-filename') || '鹊动小Qoo报告';
      var html = payload.plan ? buildPlanReportHTML(payload.plan, payload.gate, { title: payload.title, patient: payload.patient, provider: payload.provider, raw: payload.raw })
                             : buildInterpReportHTML(payload.markdown || '', { title: payload.title, patient: payload.patient, provider: payload.provider });
      exportPDF(html, name);
    };
    var htmlBtn = scope.querySelector('.ai-export-html');
    if (htmlBtn) htmlBtn.onclick = function () {
      var name = htmlBtn.getAttribute('data-filename') || '鹊动小Qoo报告';
      var html = payload.plan ? buildPlanReportHTML(payload.plan, payload.gate, { title: payload.title, patient: payload.patient, provider: payload.provider, raw: payload.raw })
                              : buildInterpReportHTML(payload.markdown || '', { title: payload.title, patient: payload.patient, provider: payload.provider });
      exportHTML(html, name);
    };
    var copyBtn = scope.querySelector('.ai-copy');
    if (copyBtn) copyBtn.onclick = function () {
      var text = payload.plan ? (payload.raw || JSON.stringify(payload.plan)) : (payload.markdown || '');
      copyText(text, copyBtn);
    };
    var shareBtn = scope.querySelector('.ai-share');
    if (shareBtn) shareBtn.onclick = function () {
      if (window.Share && typeof window.Share.openAIQRModal === 'function') window.Share.openAIQRModal();
      else if (window.Share && typeof window.Share.openQRModal === 'function') window.Share.openQRModal();
      else copyText(window.location.href, shareBtn);
    };
    var histBtn = scope.querySelector('.ai-history');
    if (histBtn) histBtn.onclick = function () {
      if (window.AIReason && typeof window.AIReason.openHistory === 'function') window.AIReason.openHistory();
    };
  }
  // 生成失败：样式化错误卡片（可带重试按钮）
  function aiErrorCard(msg, withRetry) {
    return '<div class="sarc2-ai-error">' +
      '<div class="sarc2-ai-error-ico">⚠️</div>' +
      '<div class="sarc2-ai-error-msg">' + U.esc(msg || '生成失败') + '</div>' +
      (withRetry ? '<button type="button" class="btn btn-secondary btn-sm ai-retry-btn">↻ 重试生成</button>' : '') +
      '</div>';
  }
  // 捕获最近一次 AI 解读 / 方案，供「分享携带 AI 结果」使用（主系统 / 肌少症通用）
  // 写入 AppState.ai，由 modules/share.js 的 snapshotShareData 一并编码进分享链接。
  function storeAiShare(section, data) {
    try {
      AppState.ai = AppState.ai || {};
      if (section === 'interpret') {
        AppState.ai.interpret = {
          markdown: data.markdown || '',
          provider: data.provider || '鹊动小Qoo',
          ts: Date.now()
        };
      } else if (section === 'plan') {
        AppState.ai.plan = {
          plan: data.plan || null,
          raw: data.raw || '',
          gate: data.gate || null,
          provider: data.provider || '鹊动小Qoo',
          ts: Date.now()
        };
      }
    } catch (e) { /* AppState 不可用时静默忽略 */ }
  }

  // ── AI 解读历史（localStorage 持久化，便于复诊对比）──
  var HIST_KEY = 'qd_ai_interp_history_v1';
  var HIST_MAX = 100;
  function getInterpHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
  }
  function _summarizeCtx(ctx) {
    if (!ctx || typeof ctx !== 'object') return '';
    var p = ctx.patient || ctx;
    var name = p.name || p.patientName || ctx.name || '';
    var pid = p.pid || p.id || ctx.pid || ctx.id || '';
    var age = (p.age != null ? p.age : (ctx.age != null ? ctx.age : ''));
    var parts = [];
    if (name) parts.push('姓名 ' + name);
    if (age !== '') parts.push(age + ' 岁');
    if (pid) parts.push('编号 ' + pid);
    return parts.join(' · ');
  }
  function pushInterpHistory(entry) {
    entry = entry || {};
    entry.id = entry.id || ('ih_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    entry.ts = entry.ts || Date.now();
    try {
      var list = getInterpHistory();
      list.unshift(entry);
      if (list.length > HIST_MAX) list = list.slice(0, HIST_MAX);
      localStorage.setItem(HIST_KEY, JSON.stringify(list));
    } catch (e) {}
    return entry;
  }
  function clearInterpHistory() { try { localStorage.removeItem(HIST_KEY); } catch (e) {} }

  // 构造可导出的解读报告 HTML（含页眉/页脚/免责声明）
  function buildInterpReportHTML(markdown, meta) {
    meta = meta || {};
    var title = meta.title || '鹊动小Qoo 报告解读';
    var md = renderMarkdown(markdown || '');
    var patient = meta.patient || '';
    var provider = meta.provider || 'AI';
    var tsStr = new Date(meta.ts || Date.now()).toLocaleString('zh-CN');
    return '' +
      '<div class="pdf-head">' +
        '<div class="pdf-title">' + esc(title) + '</div>' +
        '<div class="pdf-meta">生成时间：' + esc(tsStr) + (patient ? ' ｜ ' + esc(patient) : '') + ' ｜ 来源：' + esc(provider) + '</div>' +
      '</div>' +
      '<div class="ai-md">' + md + '</div>' +
      '<div class="pdf-foot">本解读由「鹊动小Qoo」AI 辅助生成，仅供专业人员参考，须结合临床实际由具备资质的医务人员确认，不构成诊断或处方意见。</div>';
  }
  // 构造可导出的方案报告 HTML（复用 planSummaryHTML + gateHTML）
  function buildPlanReportHTML(plan, gate, meta) {
    meta = meta || {};
    var title = meta.title || '鹊动小Qoo 智能训练方案';
    var tsStr = new Date(meta.ts || Date.now()).toLocaleString('zh-CN');
    var body = plan ? planSummaryHTML(plan) : rawFallbackHTML(meta.raw || '');
    return '' +
      '<div class="pdf-head">' +
        '<div class="pdf-title">' + esc(title) + '</div>' +
        '<div class="pdf-meta">生成时间：' + esc(tsStr) + (meta.patient ? ' ｜ ' + esc(meta.patient) : '') + ' ｜ 来源：' + esc(meta.provider || 'AI') + '</div>' +
      '</div>' +
      body + gateHTML(gate) +
      '<div class="pdf-foot">本方案由「鹊动小Qoo」AI 辅助生成，须经专业人员确认后方可执行，不构成医疗处方。</div>';
  }

  // 解读历史查看器（模态）：列出每次成功解读，可导出/删除/清空，支持复诊对比
  function openHistory() {
    var existing = document.getElementById('ai-hist-modal');
    if (existing) { existing.style.display = 'flex'; return; }
    var modal = document.createElement('div');
    modal.id = 'ai-hist-modal';
    modal.className = 'ai-modal-overlay';
    modal.innerHTML =
      '<div class="ai-modal">' +
        '<div class="ai-modal-head"><b>📚 鹊动小Qoo 解读历史</b>' +
          '<div class="ai-modal-head-actions"><button class="btn btn-ghost btn-sm" id="ai-hist-clear">清空</button>' +
          '<button class="ai-modal-close" id="ai-hist-close" title="关闭">×</button></div></div>' +
        '<div class="ai-modal-body"><div id="ai-hist-list" class="ai-hist-list"></div></div>' +
      '</div>';
    document.body.appendChild(modal);
    function render() {
      var list = getInterpHistory();
      if (!list.length) {
        modal.querySelector('#ai-hist-list').innerHTML = '<div class="ai-hist-empty">暂无解读历史。每次成功生成「鹊动小Qoo 报告解读 / 智能方案」后将自动保存，便于复诊对比。</div>';
        return;
      }
      var items = list.map(function (it, idx) {
        var ts = new Date(it.ts || Date.now()).toLocaleString('zh-CN');
        var raw = (it.markdown || it.raw || '').replace(/[#>*`\-\s]/g, '');
        var preview = (raw.slice(0, 64) || '(空)') + (raw.length > 64 ? '…' : '');
        return '<div class="ai-hist-item" data-id="' + esc(it.id) + '">' +
          '<div class="ai-hist-meta"><b>' + esc(it.title || '解读') + '</b> · ' + esc(it.patient || '未关联患者') +
            ' · ' + esc(ts) + ' · ' + esc(it.provider || 'AI') + '</div>' +
          '<div class="ai-hist-prev">' + esc(preview) + '</div>' +
          '<div class="ai-hist-btns">' +
            '<button class="btn btn-ghost btn-sm ai-hist-export" data-idx="' + idx + '">📄 导出</button>' +
            '<button class="btn btn-ghost btn-sm ai-hist-del" data-idx="' + idx + '">🗑 删除</button>' +
          '</div></div>';
      }).join('');
      modal.querySelector('#ai-hist-list').innerHTML = items;
    }
    render();
    modal.querySelector('#ai-hist-close').onclick = function () { modal.style.display = 'none'; };
    modal.onclick = function (e) { if (e.target === modal) modal.style.display = 'none'; };
    modal.querySelector('#ai-hist-clear').onclick = function () {
      if (window.confirm('确定清空全部解读历史？此操作不可恢复。')) { clearInterpHistory(); render(); }
    };
    modal.querySelector('#ai-hist-list').addEventListener('click', function (e) {
      var t = e.target.closest('button'); if (!t) return;
      var idx = parseInt(t.getAttribute('data-idx'), 10);
      var list = getInterpHistory();
      var it = list[idx]; if (!it) return;
      if (t.classList.contains('ai-hist-export')) {
        if (it.kind === 'plan') {
          exportPDF(buildPlanReportHTML(it.plan || null, it.gate, { title: it.title || '鹊动小Qoo 智能训练方案', patient: it.patient, provider: it.provider, ts: it.ts, raw: it.raw }), (it.title || '鹊动小Qoo方案') + '_' + it.ts);
        } else {
          exportPDF(buildInterpReportHTML(it.markdown || it.raw || '', { title: it.title || '鹊动小Qoo 报告解读', patient: it.patient, provider: it.provider, ts: it.ts }), (it.title || '鹊动小Qoo报告') + '_' + it.ts);
        }
      } else if (t.classList.contains('ai-hist-del')) {
        var cur = getInterpHistory().filter(function (x) { return x.id !== it.id; });
        try { localStorage.setItem(HIST_KEY, JSON.stringify(cur)); } catch (e) {}
        render();
      }
    });
  }

  // ── 安全 Markdown 渲染（标题/段落/列表/表格/引用/代码/图片/emoji 图标）──
  function safeUrl(u) {
    u = (u || '').trim();
    if (/^(https?:|\/|#|data:image\/)/i.test(u)) return u;
    return '#';
  }
  function inlineMd(s) {
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      return '<img class="ai-md-img" alt="' + alt + '" src="' + safeUrl(url) + '" loading="lazy" onerror="this.style.display=\'none\'">';
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, url) {
      return '<a href="' + safeUrl(url) + '" target="_blank" rel="noopener">' + t + '</a>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code class="ai-md-code">$1</code>');
    return s;
  }
  function renderMarkdown(md) {
    if (!md) return '';
    var escLocal = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var lines = String(md).replace(/\r\n/g, '\n').split('\n');
    var html = ''; var i = 0; var listType = null;
    function closeList() { if (listType) { html += '</' + listType + '>'; listType = null; } }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line.trim())) {
        closeList();
        var buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
        i++;
        html += '<pre class="ai-md-pre"><code>' + escLocal(buf.join('\n')) + '</code></pre>';
        continue;
      }
      if (/^\|.+\|$/.test(line.trim()) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
        closeList();
        var head = line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        i += 2; var rows = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
          rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        html += '<table class="ai-md-table"><thead><tr>' + head.map(function (h) { return '<th>' + inlineMd(escLocal(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + inlineMd(escLocal(c)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
        continue;
      }
      var h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) { closeList(); var lvl = h[1].length; html += '<h' + lvl + ' class="ai-md-h">' + inlineMd(escLocal(h[2])) + '</h' + lvl + '>'; i++; continue; }
      if (/^(-{3,}|\*{3,})$/.test(line.trim())) { closeList(); html += '<hr class="ai-md-hr">'; i++; continue; }
      if (/^>\s?/.test(line)) { closeList(); html += '<blockquote class="ai-md-quote">' + inlineMd(escLocal(line.replace(/^>\s?/, ''))) + '</blockquote>'; i++; continue; }
      var ul = line.match(/^[-*]\s+(.*)$/);
      if (ul) { if (listType !== 'ul') { closeList(); html += '<ul class="ai-md-ul">'; listType = 'ul'; } html += '<li>' + inlineMd(escLocal(ul[1])) + '</li>'; i++; continue; }
      var ol = line.match(/^\d+\.\s+(.*)$/);
      if (ol) { if (listType !== 'ol') { closeList(); html += '<ol class="ai-md-ol">'; listType = 'ol'; } html += '<li>' + inlineMd(escLocal(ol[1])) + '</li>'; i++; continue; }
      if (line.trim() === '') { closeList(); i++; continue; }
      closeList();
      var para = line; i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|>\s?|[-*]\s|\d+\.\s|```|-{3,}|\*{3,}|\|.+\|)/.test(lines[i])) {
        para += '\n' + lines[i]; i++;
      }
      html += '<p class="ai-md-p">' + inlineMd(escLocal(para).replace(/\n/g, '<br>')) + '</p>';
    }
    closeList();
    return html;
  }

  async function status() {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(base() + '/api/ai/status', { headers: headers(), signal: ctrl.signal });
      if (!r.ok) throw new Error('status ' + r.status);
      return r.json();
    } finally { clearTimeout(to); }
  }

  async function chat(messages, opts) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 30000);
    try {
      const r = await fetch(base() + '/api/ai/chat', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ messages: messages, context: (opts && opts.context) || null, prefer: (opts && opts.prefer) || null, model: getModel() }),
        signal: ctrl.signal,
      });
      if (!r.ok) { let m = '鹊动小Qoo 调用失败'; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
      return r.json();
    } catch (e) {
      if (window.QDLogger) QDLogger.debug('ai-reason chat 失败:', e && e.message ? e.message : e);
      if (e && e.name === 'AbortError') throw new Error('鹊动小Qoo 请求超时（30 秒无响应）。请确认你是在本机浏览器直接打开 http://localhost:8080/ 而非预览面板。');
      throw e;
    } finally { clearTimeout(to); }
  }

  async function generatePlan(context, opts) {
    const ctrl = new AbortController();
    // 方案生成为非流式结构化 JSON，HY3 等云端模型在带完整评估上下文时
    // 常需 30s+；客户端超时须大于后端 60s 上限，否则会先于后端被误掐断。
    const to = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 90000);
    try {
      const r = await fetch(base() + '/api/ai/generate-plan', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ context: context, prefer: (opts && opts.prefer) || null, model: getModel() }),
        signal: ctrl.signal,
      });
      if (!r.ok) { let m = '鹊动小Qoo 方案生成失败'; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
      return r.json();
    } catch (e) {
      if (window.QDLogger) QDLogger.debug('ai-reason generatePlan 失败:', e && e.message ? e.message : e);
      if (e && e.name === 'AbortError') throw new Error('鹊动小Qoo 方案生成超时（30 秒无响应）。请确认你是在本机浏览器直接打开 http://localhost:8080/ 而非预览面板。');
      throw e;
    } finally { clearTimeout(to); }
  }

  async function interpret(context, opts) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 30000);
    try {
      const r = await fetch(base() + '/api/ai/interpret', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ context: context, prefer: (opts && opts.prefer) || null, model: getModel() }),
        signal: ctrl.signal,
      });
      if (!r.ok) { let m = '鹊动小Qoo 解读失败'; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
      return r.json();
    } catch (e) {
      if (window.QDLogger) QDLogger.debug('ai-reason interpret 失败:', e && e.message ? e.message : e);
      if (e && e.name === 'AbortError') throw new Error('鹊动小Qoo 解读超时（30 秒无响应）。请确认你是在本机浏览器直接打开 http://localhost:8080/ 而非预览面板。');
      throw e;
    } finally { clearTimeout(to); }
  }

  /* ══════════════════════════════════════════════════════════
   * SSE 流式接入：把「10–30 秒空白等待」变成「1–2 秒首字 + 逐字增长」
   *   - 传输：POST + fetch ReadableStream（EventSource 不支持 POST/自定义头，用不了）
   *   - 帧格式：event: delta|done|error + data: JSON（与 server/ai-routes.js openSSE 对齐）
   *   - 降级：老后端没有 *-stream 端点（404）、浏览器不支持流、或响应不是 SSE
   *           → 抛 code='no_stream'，由上层自动回落到原非流式接口，用户无感
   * ══════════════════════════════════════════════════════════ */

  /**
   * 通用 SSE 请求。
   * @param {string} path 形如 '/api/ai/interpret-stream'
   * @param {Object} payload 请求体
   * @param {{onDelta?:Function, idleMs?:number}} h
   * @returns {Promise<{text:string, meta:Object}>}
   */
  async function streamRequest(path, payload, h) {
    h = h || {};
    if (typeof window.fetch !== 'function' || typeof window.ReadableStream !== 'function') {
      var e0 = new Error('当前浏览器不支持流式输出'); e0.code = 'no_stream'; throw e0;
    }
    var ctrl = new AbortController();
    // 空闲超时（而非总时长超时）：长回答不会被腰斩，真卡死才中断
    var idleMs = h.idleMs || 45000;
    var timer = null;
    function kick() {
      clearTimeout(timer);
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, idleMs);
    }
    kick();

    var r;
    try {
      r = await fetch(base() + path, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }, headers()),
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      var en = new Error(e && e.message ? e.message : '网络错误');
      en.code = 'no_stream'; // 网络层失败也回落非流式，由那条路径给出规范报错
      throw en;
    }
    if (!r.ok || !r.body || (r.headers.get('content-type') || '').indexOf('text/event-stream') === -1) {
      clearTimeout(timer);
      var e1 = new Error('stream ' + r.status);
      e1.code = 'no_stream';
      throw e1;
    }

    var reader = r.body.getReader();
    var dec = new TextDecoder('utf-8');
    var buf = '', text = '', meta = null, errPayload = null;
    try {
      for (;;) {
        var c = await reader.read();
        if (c.done) break;
        kick();
        buf += dec.decode(c.value, { stream: true });
        var idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          var raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
          var ev = 'message', data = '';
          raw.split('\n').forEach(function (line) {
            line = line.replace(/\r$/, '');
            if (!line || line.charAt(0) === ':') return;      // 心跳注释行
            if (line.indexOf('event:') === 0) ev = line.slice(6).trim();
            else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
          });
          if (!data) continue;
          var j; try { j = JSON.parse(data); } catch (e) { continue; }
          if (ev === 'delta') { if (j.t) { text += j.t; if (h.onDelta) h.onDelta(j.t, text); } }
          else if (ev === 'done') meta = j;
          else if (ev === 'error') errPayload = j;
        }
      }
    } catch (e) {
      clearTimeout(timer);
      // 已经吐出内容 → 视为部分成功，保留已生成部分而不是整段丢弃
      if (text) return { text: text, meta: { partial: true, provider: (meta && meta.provider) || 'AI' } };
      var e2 = new Error(e && e.name === 'AbortError' ? '生成超时，请重试' : (e.message || '流式中断'));
      e2.code = e && e.name === 'AbortError' ? 'timeout' : 'ai_unavailable';
      throw e2;
    }
    clearTimeout(timer);

    if (errPayload) {
      var e3 = new Error(errPayload.message || errPayload.error || 'AI 生成失败');
      e3.code = errPayload.error;
      throw e3;
    }
    if (!text) { var e4 = new Error('AI 未返回内容'); e4.code = 'empty'; throw e4; }
    return { text: text, meta: meta || {} };
  }

  /** 流式解读；不支持流式时自动回落 /api/ai/interpret */
  async function interpretStream(context, opts, onDelta) {
    opts = opts || {};
    try {
      var r = await streamRequest('/api/ai/interpret-stream',
        { context: context, prefer: opts.prefer || null, model: getModel() }, { onDelta: onDelta, idleMs: opts.idleMs });
      return {
        reply: r.text, provider: (r.meta && r.meta.provider) || 'AI',
        streamed: true, partial: !!(r.meta && r.meta.partial),
      };
    } catch (e) {
      if (e && e.code === 'no_stream') {
        var j = await interpret(context, opts);
        return { reply: j.reply || '', provider: j.provider || 'AI', streamed: false, partial: false };
      }
      throw e;
    }
  }

  /** 流式问答；不支持流式时自动回落 /api/ai/chat */
  async function chatStream(messages, opts, onDelta) {
    opts = opts || {};
    try {
      var r = await streamRequest('/api/ai/chat-stream',
        { messages: messages, context: opts.context || null, prefer: opts.prefer || null, model: getModel() },
        { onDelta: onDelta, idleMs: opts.idleMs });
      return {
        reply: r.text, provider: (r.meta && r.meta.provider) || 'AI',
        streamed: true, partial: !!(r.meta && r.meta.partial),
      };
    } catch (e) {
      if (e && e.code === 'no_stream') {
        var j = await chat(messages, opts);
        return { reply: j.reply || '', provider: j.provider || 'AI', streamed: false, partial: false };
      }
      throw e;
    }
  }

  /**
   * 增量渲染器：逐字刷进容器。
   * rAF 节流（每帧最多一次重排），末尾挂打字光标；finish() 后去掉光标。
   * @param {HTMLElement} el 目标容器（内容会被整体替换）
   * @param {Function} [onPaint] 每次重绘后回调（聊天面板用来保持滚动到底）
   */
  function makeStreamRenderer(el, onPaint) {
    var buf = '', pending = false, finished = false;
    function paint() {
      pending = false;
      el.innerHTML = '<div class="ai-md ai-streaming">' + renderMarkdown(buf) +
        (finished ? '' : '<span class="ai-caret" aria-hidden="true"></span>') + '</div>';
      if (onPaint) { try { onPaint(); } catch (e) {} }
    }
    return {
      push: function (t) {
        buf += t;
        if (pending) return;
        pending = true;
        if (window.requestAnimationFrame) window.requestAnimationFrame(paint);
        else setTimeout(paint, 16);
      },
      get text() { return buf; },
      finish: function () { finished = true; paint(); return buf; },
    };
  }

  /**
   * 长任务计时器：在加载区追加「已用时 Ns」。
   * 用于无法流式的 JSON 类任务（方案生成），至少让用户看见"还在跑"。
   */
  function startElapsed(hostEl) {
    if (!hostEl) return function () {};
    var t0 = Date.now();
    var span = document.createElement('span');
    span.className = 'ai-elapsed';
    hostEl.appendChild(span);
    var tick = function () { span.textContent = ' · 已用时 ' + Math.round((Date.now() - t0) / 1000) + 's'; };
    tick();
    var id = setInterval(tick, 1000);
    return function () { clearInterval(id); try { span.remove(); } catch (e) {} };
  }

  async function generateImage(prompt, opts) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 60000);
    try {
      const r = await fetch(base() + '/api/ai/generate-image', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ prompt: prompt }),
        signal: ctrl.signal,
      });
      const j = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(j.message || j.error || ('图像生成 ' + r.status));
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('图像生成超时（60 秒无响应）。');
      throw e;
    } finally { clearTimeout(to); }
  }

  /** 将 PDF 逐页渲染为 base64 PNG（视觉兜底用）。返回不含前缀的 base64 数组。 */
  async function pdfToImages(file, maxPages) {
    if (!window.IsoOCR || typeof window.IsoOCR.renderPdfToCanvases !== 'function') return [];
    try {
      const canvases = await window.IsoOCR.renderPdfToCanvases(file, 1.5);
      const out = [];
      for (const c of canvases.slice(0, maxPages || 4)) {
        try { out.push(c.toDataURL('image/png').split(',')[1]); } catch (e) {}
      }
      return out;
    } catch (e) { return []; }
  }

  /**
   * 报告结构化解析（AI 兜底正则）。
   * @param {Object} opts { ocrText, typeHint, file?, useVision? }
   * @returns {Promise<{fields:Object|null, raw:string, provider:string, usedVision:boolean, gate:Object}>}
   */
  async function parseReport(opts) {
    opts = opts || {};
    if (!aiEnabled()) return null; // AI 模式关闭时，报告解析不调用 AI（仅使用系统正则/数字解析）
    const ocrText = typeof opts.ocrText === 'string' ? opts.ocrText : '';
    const typeHint = opts.typeHint || opts.layout || 'generic';
    let images = [];
    if (opts.useVision && opts.file) images = await pdfToImages(opts.file, 4);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000);
    try {
      const r = await fetch(base() + '/api/ai/parse-report', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
        body: JSON.stringify({ ocrText: ocrText, layout: typeHint, typeHint: typeHint, images: images }),
        signal: ctrl.signal,
      });
      if (!r.ok) { let m = '鹊动小Qoo 报告解析失败'; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
      return r.json();
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('鹊动小Qoo 报告解析超时（30 秒无响应）。请确认你是在本机浏览器直接打开 http://localhost:8080/ 而非预览面板。');
      throw e;
    } finally { clearTimeout(to); }
  }

  function badge(v, unit) {
    if (v == null || v === '') return '';
    return '<span class="ai-plan-badge">' + esc(v) + (unit ? '<small>' + unit + '</small>' : '') + '</span>';
  }
  function planSummaryHTML(plan) {
    if (!plan) return '';
    var html = '';

    // 安全提示置顶
    var safety = plan.safety || {};
    var contras = Array.isArray(safety.contraindications) ? safety.contraindications : [];
    var cautions = Array.isArray(safety.cautions) ? safety.cautions : [];
    if (contras.length || cautions.length) {
      html += '<div class="ai-plan-safety">';
      if (contras.length) {
        html += '<div class="ai-plan-safety-title">禁忌</div><ul>' + contras.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
      }
      if (cautions.length) {
        html += '<div class="ai-plan-safety-title ai-plan-warn">注意事项</div><ul>' + cautions.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
      }
      html += '</div>';
    }

    // 鹊动设备处方卡片
    if (plan.qudong && plan.qudong.length) {
      html += '<div class="ai-plan-section-title">鹊动设备处方</div><div class="ai-plan-cards">';
      plan.qudong.forEach(function (e) {
        html += '<div class="ai-plan-card">' +
          '<div class="ai-plan-card-head">' +
            '<span class="ai-plan-card-name">' + esc(e.target || e.deviceId || '训练动作') + '</span>' +
            (e.exerciseId ? '<span class="ai-plan-card-id">' + esc(e.exerciseId) + '</span>' : '') +
          '</div>' +
          '<div class="ai-plan-card-body">' +
            badge(e.sets, '组') + badge(e.reps, '次') + badge(e.intensityPct, '%') + badge(e.restSec, '秒间歇') +
          '</div>' +
          (e.rationale ? '<div class="ai-plan-card-note">' + esc(e.rationale) + '</div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    // 徒手方案卡片
    if (plan.bodyweight && plan.bodyweight.length) {
      html += '<div class="ai-plan-section-title">徒手/自由重量方案</div><div class="ai-plan-cards">';
      plan.bodyweight.forEach(function (e) {
        html += '<div class="ai-plan-card">' +
          '<div class="ai-plan-card-head">' +
            '<span class="ai-plan-card-name">' + esc(e.name || e.pattern || '动作') + '</span>' +
          '</div>' +
          '<div class="ai-plan-card-body">' +
            badge(e.sets, '组') + badge(e.reps, '次') + badge(e.rpe, 'RPE') +
          '</div>' +
          (e.cues && e.cues.length ? '<div class="ai-plan-card-note">要点：' + esc(e.cues.join('；')) + '</div>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    // 有氧方案
    if (plan.aerobic && typeof plan.aerobic === 'object') {
      var a = plan.aerobic;
      html += '<div class="ai-plan-section-title">有氧方案</div>' +
        '<div class="ai-plan-aerobic">' +
          (a.weeklyMin ? '<span>每周 ' + esc(a.weeklyMin) + ' 分钟</span>' : '') +
          (a.phases ? '<span>' + esc(Array.isArray(a.phases) ? a.phases.length + ' 个阶段' : a.phases) + '</span>' : '') +
        '</div>';
    }

    return html;
  }

  /** 规范化常见 JSON 瑕疵 */
  function normalizeJSONText(text) {
    return String(text)
      .replace(/\/\/[^\n]*(?:\n|$)/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\n/g, '\\n');
  }

  /** 当后端 plan 字段解析失败时，尝试从前端 raw 文本里抢救 JSON */
  function tryExtractPlan(raw) {
    if (!raw) return null;
    var s = String(raw).trim().replace(/^\uFEFF/, '');
    var best = null, bestLen = 0;
    function tryParse(t) {
      try { return JSON.parse(t); } catch (e) {
        try { return JSON.parse(normalizeJSONText(t)); } catch (e2) { return null; }
      }
    }
    function consider(t) {
      var parsed = tryParse(t);
      if (parsed && t.length > bestLen) { best = parsed; bestLen = t.length; }
    }
    // markdown 代码块（取最长合法块）
    var re = /```(?:json)?\s*([\s\S]*?)```/g, mm;
    while ((mm = re.exec(s)) !== null) { consider(mm[1].trim()); }
    if (best) return best;
    // 整段 JSON
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) { consider(s); }
    if (best) return best;
    // 大括号平衡截取（多个候选取最大合法）
    var start = s.indexOf('{');
    while (start !== -1) {
      var depth = 0, inStr = false, esc2 = false, end = -1;
      for (var i = start; i < s.length; i++) {
        var c = s[i];
        if (esc2) { esc2 = false; continue; }
        if (c === '\\' && inStr) { esc2 = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === '{' || c === '[') depth++;
          else if (c === '}' || c === ']') {
            depth--;
            if (depth === 0) { end = i; break; }
          }
        }
      }
      if (end !== -1) { consider(s.slice(start, end + 1)); }
      start = s.indexOf('{', start + 1);
    }
    return best;
  }

  /** 无法解析成结构化方案时，把 raw 折叠展示，避免一大段 JSON 直接铺满 */
  function rawFallbackHTML(raw) {
    if (!raw) return '<p>（模型未返回结构化方案）</p>';
    var snippet = String(raw).slice(0, 240).replace(/</g, '&lt;');
    return '<div class="ai-raw-fallback">' +
      '<p>⚠️ 鹊动小Qoo 返回了原始文本，未能自动解析为卡片式方案。可点击下方「查看原始 JSON」核对，或重试。</p>' +
      '<details><summary>查看原始 JSON（前 240 字符）</summary>' +
      '<pre class="ai-md-pre">' + esc(String(raw).slice(0, 2000)) + '</pre></details>' +
      '</div>';
  }

  function gateHTML(gate) {
    if (!gate) return '';
    var html = '';
    if (gate.violations && gate.violations.length) {
      html += '<div class="sarc2-ai-gate bad">⚠️ 规则闸门拦截：' + esc(gate.violations.join('；')) + '</div>';
    } else if (gate.warnings && gate.warnings.length) {
      html += '<div class="sarc2-ai-gate warn">⚠️ ' + esc(gate.warnings.join('；')) + '</div>';
    } else {
      html += '<div class="sarc2-ai-gate ok">✓ 通过规则闸门校验（评估感知）</div>';
    }
    if (gate.reasons && gate.reasons.length) {
      html += '<div class="sarc2-ai-reasons"><div class="sarc2-ai-reasons-title">可解释依据</div><ul>' +
        gate.reasons.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
    }
    return html;
  }

  /**
   * 在严谨版方案视图内追加 AI 解读区块（异步、失败静默）。
   * @param {HTMLElement} hostEl 容器（严谨版 HTML 已注入其中）
   * @param {Object} ctx SarcEngine2 结构化结果（或评估对象）
   */
  async function enrich(hostEl, ctx) {
    if (!hostEl) return;
    // 离线时直接提示，避免无谓的网络请求与失败报错
    if (window.Sync && window.Sync.isOnline && window.Sync.isOnline() === false) {
      mutedNote(hostEl, '鹊动小Qoo 辅助需联网，当前处于离线状态，请恢复网络后查看解读。');
      return;
    }
    var st;
    try { st = await status(); } catch (e) {
      // 后端不可达：不抛硬错、不破坏规则引擎视图，给出统一的降级提示（L3-15）
      mutedNote(hostEl, '鹊动小Qoo 暂时无法连接（后端服务未启动或不可达）。当前为规则引擎产出。');
      return;
    }
    if (!st || !st.available) {
      // 静默降级：补一行低调提示，不破坏规则引擎视图
      mutedNote(hostEl, '鹊动小Qoo 辅助未启用（未部署本地模型且未配置云端）。当前为规则引擎产出。');
      return;
    }
    var box = document.createElement('div');
    box.className = 'sarc2-ai';
    box.innerHTML =
      `<div class="sarc2-ai-head"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 辅助解读` +
        `<span class="sarc2-ai-badge">${esc(st.mode)}</span>` +
        `<span id="enrich-model-wrap" class="sarc2-ai-model-wrap"></span></div>` +
      `<div class="sarc2-ai-body">鹊动小Qoo 正在生成解读…</div>`;
    hostEl.appendChild(box);
    var body = box.querySelector('.sarc2-ai-body');
    var modelWrap = box.querySelector('#enrich-model-wrap');
    function runPlanInner() {
      body.innerHTML = spinHTML('正在生成方案…（预计 10–30 秒）');
      var _stop = startElapsed(body);
      return generatePlan(ctx).then(function (r) {
        _stop();
        var plan = r.plan || tryExtractPlan(r.raw);
        if (plan) {
          body.innerHTML = planSummaryHTML(plan) + gateHTML(r.gate) +
            '<div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认 · 来源：' + esc(r.provider || st.mode) + '</div>';
        } else {
          body.innerHTML = rawFallbackHTML(r.raw) + gateHTML(r.gate);
        }
      }).catch(function (e) {
        _stop();
        body.innerHTML = '鹊动小Qoo 方案暂不可用：' + aiErrMsg(e);
      });
    }
    if (modelWrap) modelWrap.appendChild(buildModelSelect({ id: 'enrich-model-select', onChange: function () { runPlanInner(); } }));
    try {
      await runPlanInner();
    } catch (e) {
      body.textContent = '鹊动小Qoo 解读暂不可用：' + aiErrMsg(e);
    }
  }

  // ── 轻量问答面板（提案 P0：/api/ai/chat） ──────────────
  var panel = null;
  var fabEl = null;
  var aiChatBuilt = false;
  var lastUser = '';
  // ── 多模型选择（前端） ───────────────────────────────
  var _modelCache = null;
  function getModel() {
    try { return (window.localStorage && localStorage.getItem('ai_model')) || ''; } catch (e) { return ''; }
  }
  function setModel(id) {
    try { if (window.localStorage) { if (id) localStorage.setItem('ai_model', id); else localStorage.removeItem('ai_model'); } } catch (e) {}
    // 广播模型变更，让浮窗下拉与各处内联选择器保持同步
    try { window.dispatchEvent(new CustomEvent('ai-model-changed', { detail: { id: id || '' } })); } catch (e) {}
  }
  async function models() {
    if (_modelCache) return _modelCache;
    try {
      const r = await fetch(base() + '/api/ai/models', { headers: headers() });
      if (!r.ok) return [];
      const j = await r.json();
      _modelCache = (j && j.models) || [];
      return _modelCache;
    } catch (e) { return []; }
  }

  /**
   * 构建一个与全局 ai_model 同步的内联模型选择器（<select>）。
   * 用于「严谨版方案」控制区与「辅助解读」区块，让方案生成 / 报告解读可直接手动选模型。
   * 复用 getModel/setModel（与浮窗下拉共享同一 localStorage 状态）。
   */
  function buildModelSelect(opts) {
    opts = opts || {};
    var sel = document.createElement('select');
    sel.className = 'sarc2-ai-model-select';
    if (opts.id) sel.id = opts.id;
    sel.setAttribute('aria-label', '选择 AI 模型');
    sel.innerHTML = '<option value="">加载模型…</option>';
    function paint() {
      models().then(function (list) {
        if (!list || !list.length) { sel.innerHTML = '<option value="">（AI 未配置：需在服务端设置 AI 密钥）</option>'; return; }
        var cur = getModel() || (list[0] ? list[0].id : '');
        var html = list.map(function (m) {
          var s = (m.id === cur) ? ' selected' : '';
          return '<option value="' + esc(m.id) + '"' + s + '>' + esc(m.label || m.id) + '</option>';
        }).join('');
        sel.innerHTML = html;
        if (sel.value !== cur) { try { sel.value = cur; } catch (e2) {} }
      }).catch(function () { sel.innerHTML = '<option value="">（加载失败）</option>'; });
    }
    sel.onchange = function () {
      setModel(sel.value || '');
      if (opts && typeof opts.onChange === 'function') opts.onChange(sel.value || '');
    };
    window.addEventListener('ai-model-changed', function (e) {
      var id = (e && e.detail && e.detail.id != null) ? e.detail.id : getModel();
      try { sel.value = id || ''; } catch (e2) {}
    });
    paint();
    return sel;
  }

  function openChat() {
    if (!aiChatBuilt) { buildAiChat(); aiChatBuilt = true; }
    if (fabEl) fabEl.style.display = 'none';
    panel.style.display = 'flex';
    setTimeout(function () { var ta = panel.querySelector('#ai-chat-text'); if (ta) ta.focus(); }, 80);
  }

  // 构建可浮动的问答窗口（只构建一次，其后仅做显隐切换）
  function buildAiChat() {
    // 悬浮球（最小化入口）：沿用旧版小Qoo 吉祥物 PNG
    fabEl = document.createElement('button');
    fabEl.id = 'ai-chat-fab';
    fabEl.className = 'ai-fab';
    fabEl.type = 'button';
    fabEl.title = '打开小Qoo 助手';
    fabEl.innerHTML = '<img class="qoo-icon qoo-fab-icon" src="/assets/illustrations/小Qoo吉祥物.png" alt="鹊动小Qoo"><span class="ai-fab-badge" style="display:none"></span>';
    fabEl.style.display = 'none';
    document.body.appendChild(fabEl);
    fabEl.onclick = function () { openChat(); };

    panel = document.createElement('div');
    panel.id = 'ai-chat-overlay';
    panel.className = 'ai-float-win';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="ai-chat-head" id="ai-chat-drag">' +
        '<div class="ai-avatar-wrap"><img src="/assets/illustrations/小Qoo吉祥物.png" alt="鹊动小Qoo" onerror="this.style.display=\'none\'"></div>' +
        '<div class="ai-title"><b>鹊动小Qoo</b>' +
          '<span class="sub">健康评估 · 方案 · 运动干预 AI 助手</span>' +
          '<span class="ai-online"><i></i>在线 · 可切换模型</span></div>' +
        '<div class="ai-ctrl">' +
          '<button id="ai-chat-min" type="button" title="最小化（缩成悬浮球）">—</button>' +
          '<button id="ai-chat-max" type="button" title="最大化 / 还原">▢</button>' +
          '<button id="ai-chat-fs" type="button" title="全屏">⛶</button>' +
          '<button id="ai-chat-close" type="button" class="close" title="收起（最小化到悬浮球）">×</button>' +
        '</div>' +
        '<div class="ai-model-wrap">' +
          '<div class="ai-model-pick" id="ai-chat-model-pick"><span class="dot"></span>' +
            '<span id="ai-chat-model-label">AI 模型</span><span class="chev">▼</span></div>' +
          '<div class="ai-model-menu" id="ai-chat-model-menu"><div class="lbl">选择 AI 模型</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="ai-chat-area" id="ai-chat-area">' +
        '<div class="ai-chat-log" id="ai-chat-log"><div class="ai-chat-sys">💡 鹊动小Qoo 仅作辅助，<b>所有结论须经专业人员确认</b>。可直接把报告 / 影像拖入下方聊天框。</div></div>' +
        '<div class="ai-drop" id="ai-chat-drop"><div class="big">📎</div><div>松开以上传到聊天框</div></div>' +
      '</div>' +
      '<div class="ai-chat-chips" id="ai-chat-chips">' +
        '<span class="ai-chip">帮我解读这份肌少症报告</span>' +
        '<span class="ai-chip">生成本周训练方案</span>' +
        '<span class="ai-chip">跌倒风险如何降低</span>' +
      '</div>' +
      '<div class="ai-chat-toolbar">' +
        '<button id="ai-chat-mic" type="button" class="ai-chat-tool" title="语音输入（需浏览器支持，建议本机 localhost 或 HTTPS）">🎤<span>语音</span></button>' +
        '<button id="ai-chat-img" type="button" class="ai-chat-tool" title="根据描述生成配图（需服务端配置图像生成）">🖼<span>图片</span></button>' +
        '<button id="ai-chat-hist" type="button" class="ai-chat-tool" title="查看 AI 解读历史（便于复诊对比）">📚<span>历史</span></button>' +
        '<span class="ai-chat-tool spacer"></span>' +
        '<span class="ai-chat-hint">拖动标题栏移动 · 拖右下角缩放 · 把文件拖入聊天框</span>' +
      '</div>' +
      '<div class="ai-chat-foot">' +
        '<textarea id="ai-chat-text" rows="3" placeholder="输入问题，Enter 发送…（Shift+Enter 换行，🎤 可语音输入）"></textarea>' +
        '<button id="ai-chat-send" type="button" class="ai-send" title="发送" data-loading="发送中…">➤</button>' +
      '</div>' +
      '<div class="ai-rz-handle ai-rz-n" data-rz="n" title="上下拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-ne" data-rz="ne" title="右上拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-e" data-rz="e" title="左右拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-se" data-rz="se" title="右下拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-s" data-rz="s" title="上下拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-sw" data-rz="sw" title="左下拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-w" data-rz="w" title="左右拉伸"></div>' +
      '<div class="ai-rz-handle ai-rz-nw" data-rz="nw" title="左上拉伸"></div>';
    document.body.appendChild(panel);

    var log = panel.querySelector('#ai-chat-log');

    function addBubble(cls, html) {
      var d = document.createElement('div'); d.className = cls; d.innerHTML = html; log.appendChild(d);
      log.scrollTop = log.scrollHeight; return d;
    }
    function send() {
      var ta = panel.querySelector('#ai-chat-text');
      var text = ta.value.trim();
      if (!text) return;
      var sendBtn = panel.querySelector('#ai-chat-send');
      lockButton(sendBtn, function () {
        lastUser = text;
        ta.value = '';
        ta.style.height = 'auto';
        addBubble('ai-chat-me', esc(text).replace(/\n/g, '<br>'));
        var wait = addBubble('ai-chat-ai ai-chat-think', spinHTML('思考中…'));
        var rend = null;
        var scrollBottom = function () { log.scrollTop = log.scrollHeight; };
        // 流式：首个 token 到达就把「思考中」气泡换成正文，边打字边滚动
        return chatStream([{ role: 'user', content: text }], {}, function (t) {
          if (!rend) { wait.className = 'ai-chat-ai'; wait.innerHTML = ''; rend = makeStreamRenderer(wait, scrollBottom); }
          rend.push(t);
        }).then(function (r) {
          if (rend) rend.finish();
          wait.className = 'ai-chat-ai';
          wait.innerHTML = '<div class="ai-md">' + renderMarkdown(r.reply || '(无回复)') + '</div>' +
            (r.partial ? '<div class="ai-partial-note">⚠️ 回复中断，以上为已生成部分。</div>' : '') +
            '<div class="ai-chat-ai-foot"><span class="ai-icon-wrap">' + qooIcon('xs') + '</span>鹊动小Qoo 辅助 · 源：' + esc(r.provider || '鹊动小Qoo') + ' · 须经专业人员确认</div>';
          scrollBottom();
        }).catch(function (e) {
          wait.className = 'ai-chat-ai';
          wait.textContent = '⚠️ ' + aiErrMsg(e);
        });
      });
    }
    panel.querySelector('#ai-chat-send').onclick = send;
    panel.querySelector('#ai-chat-text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    panel.querySelector('#ai-chat-img').onclick = function () {
      // 选取文字优先级：对话框内选中文字 > 输入框文字 > 最近一条 AI 回复（即 AI 生成的训练动作/方案）> 默认
      var src = (window.getSelection ? window.getSelection().toString() : '').trim();
      var ta = panel.querySelector('#ai-chat-text');
      if (!src && ta && ta.value.trim()) src = ta.value.trim();
      if (!src) {
        var ais = log.querySelectorAll('.ai-chat-ai');
        if (ais.length) {
          var lastAI = ais[ais.length - 1];
          var md = lastAI.querySelector('.ai-md');
          src = (md ? md.textContent : lastAI.textContent || '').trim();
        }
      }
      if (!src) src = lastUser;
      if (!src) src = '一张康复运动训练示意图，包含动作要领';
      var prompt = src + '（请生成一张清晰的动作示意图：简洁线条、白底、展示标准姿势与动作要领，避免大段文字说明）';
      lockButton(this, function () {
        var wait = addBubble('ai-chat-ai ai-chat-think', '<span class="ai-spin"></span> 🖼️ 配图生成中…');
        return generateImage(prompt).then(function (r) {
          if (r && r.url) {
            wait.className = 'ai-chat-ai';
            var cap = (src && src.length > 40 ? src.slice(0, 40) + '…' : (src || 'AI 配图'));
            wait.innerHTML = '<div class="ai-md"><img class="ai-md-img" alt="鹊动小Qoo 配图" src="' + safeUrl(r.url) + '" onerror="this.style.display=\'none\'">' +
              '<div class="ai-chat-img-actions">' +
                '<a class="ai-chat-img-dl" href="' + safeUrl(r.url) + '" download="鹊动小Qoo配图.png">⬇ 下载配图</a>' +
                '<button type="button" class="ai-chat-img-save">💾 存进该患者档案</button>' +
              '</div></div>' +
              '<div class="ai-chat-ai-foot">🖼️ 鹊动小Qoo 配图 · 源：' + esc(r.provider || 'image-gen') + (r.size ? ' · ' + esc(r.size) : '') + '</div>';
            var saveBtn = wait.querySelector('.ai-chat-img-save');
            if (saveBtn) saveBtn.onclick = function () {
              if (!window.AIImgArchive) { U.toast('AI 配图模块未加载', 'error'); return; }
              var pid = window.AIImgArchive.currentPid();
              if (!pid) { U.toast('请先登记或选择患者（当前无患者档案）', 'error'); return; }
              this.disabled = true; this.textContent = '存入中…';
              window.AIImgArchive.save(pid, r.url, cap).then(function (k) {
                U.toast(k ? '已存入该患者档案（方案页可查看）' : '存入失败', k ? 'success' : 'error');
              }).catch(function () { U.toast('存入失败', 'error'); });
            };
          } else {
            wait.className = 'ai-chat-ai';
            wait.textContent = '已生成，但未返回可用图片地址。';
          }
        }).catch(function (e) {
          wait.className = 'ai-chat-ai';
          wait.textContent = '⚠️ ' + aiErrMsg(e);
        });
      });
    };
    panel.querySelector('#ai-chat-hist').onclick = function () { openHistory(); };

    // ── 模型选择（浮窗 pill 下拉，支持手动切换 + 记忆） ──
    var modelMenu = panel.querySelector('#ai-chat-model-menu');
    var modelPick = panel.querySelector('#ai-chat-model-pick');
    var modelLabel = panel.querySelector('#ai-chat-model-label');
    var MODEL_COLORS = { 'DeepSeek': '#f2651e', '豆包': '#2f7de0', '本地': '#1d9e75', 'Ollama': '#1d9e75', 'Qwen': '#7c3aed', 'HY3': '#e0457b', 'hy3': '#e0457b' };
    function modelColor(label) { for (var k in MODEL_COLORS) { if (label && label.indexOf(k) >= 0) return MODEL_COLORS[k]; } return '#f2651e'; }
    function bindModelItems() {
      modelMenu.querySelectorAll('.ai-model-item').forEach(function (it) {
        it.onclick = function () {
          modelMenu.querySelectorAll('.ai-model-item').forEach(function (x) { x.classList.remove('active'); });
          it.classList.add('active');
          var id = it.getAttribute('data-id'); var label = it.getAttribute('data-label');
          setModel(id); modelLabel.textContent = label;
          modelMenu.classList.remove('show'); modelPick.classList.remove('open');
        };
      });
    }
    function refreshModelSelect() {
      AIReason.models().then(function (list) {
        if (!modelMenu) return;
        if (!list || !list.length) { if (modelPick) { modelPick.style.display = ''; modelLabel.textContent = 'AI 未配置（需设置密钥）'; } return; }
        if (modelPick) modelPick.style.display = '';
        var cur = getModel();
        if (!cur && list[0]) { setModel(list[0].id); cur = list[0].id; }
        var items = list.map(function (m) {
          var active = (m.id === cur) ? ' active' : '';
          return '<div class="ai-model-item' + active + '" data-id="' + esc(m.id) + '" data-label="' + esc(m.label) + '">' +
            '<span class="mi-dot" style="background:' + modelColor(m.label) + '"></span>' +
            '<div style="min-width:0"><div class="mi-name">' + esc(m.label) + '</div>' +
            (m.desc ? '<div class="mi-desc">' + esc(m.desc) + '</div>' : '') + '</div>' +
            '<span class="mi-check">✓</span></div>';
        }).join('');
        modelMenu.innerHTML = '<div class="lbl">选择 AI 模型</div>' + items;
        var curItem = list.filter(function (m) { return m.id === cur; })[0];
        modelLabel.textContent = curItem ? curItem.label : (list[0] ? list[0].label : 'AI 模型');
        bindModelItems();
      }).catch(function () { if (modelPick) modelPick.style.display = 'none'; });
    }
    if (modelPick) {
      modelPick.onclick = function (e) { e.stopPropagation(); modelPick.classList.toggle('open'); modelMenu.classList.toggle('show'); };
      refreshModelSelect();
      window.addEventListener('ai-model-changed', refreshModelSelect);
    }
    document.addEventListener('click', function (e) {
      if (!modelMenu || !modelPick) return;
      if (!modelMenu.contains(e.target) && !modelPick.contains(e.target)) {
        modelMenu.classList.remove('show'); modelPick.classList.remove('open');
      }
    });

    // 语音输入（Web Speech API，仅浮窗问答使用；不支持时静默隐藏）
    var micBtn = panel.querySelector('#ai-chat-mic');
    if (micBtn && window.VoiceInput && VoiceInput.supported()) {
      micBtn.style.display = '';
      var micActive = false;
      micBtn.onclick = function () {
        if (micActive) { VoiceInput.stop(); return; }
        var ta = panel.querySelector('#ai-chat-text');
        VoiceInput.start({
          lang: (window.AppState && AppState.config && AppState.config.locale === 'en' ? 'en-US' : 'zh-CN'),
          onStart: function () { micActive = true; micBtn.classList.add('ai-mic-on'); micBtn.title = '正在聆听… 点击停止'; },
          onInterim: function (t) { if (ta) ta.value = t; },
          onFinal: function (t) { if (ta) { ta.value = (ta.value ? ta.value + ' ' : '') + t; ta.focus(); } },
          onError: function (e) { U.toast && U.toast('语音输入失败：' + (e || '不支持'), 'warning'); },
          onEnd: function () { micActive = false; micBtn.classList.remove('ai-mic-on'); micBtn.title = '语音输入'; },
        });
      };
    } else if (micBtn) {
      micBtn.style.display = 'none';
    }

    // ── 最小化 / 还原 / 最大化 / 全屏 ──
    function minimize() { panel.style.display = 'none'; if (fabEl) fabEl.style.display = 'flex'; }
    panel.querySelector('#ai-chat-min').onclick = minimize;
    panel.querySelector('#ai-chat-close').onclick = minimize;
    panel.querySelector('#ai-chat-max').onclick = function () {
      var on = panel.classList.toggle('maximized');
      if (on) { panel.style.left = ''; panel.style.top = ''; panel.style.width = ''; panel.style.height = ''; }
    };
    panel.querySelector('#ai-chat-fs').onclick = function () {
      if (!document.fullscreenElement) { if (panel.requestFullscreen) panel.requestFullscreen(); }
      else if (document.exitFullscreen) document.exitFullscreen();
    };

    // ── 拖拽标题栏移动窗口（避开按钮 / 模型下拉） ──
    var handle = panel.querySelector('#ai-chat-drag');
    var drag = false, sx = 0, sy = 0, ox = 0, oy = 0;
    handle.addEventListener('mousedown', function (e) {
      if (panel.classList.contains('maximized')) return;
      if (e.target.closest('button, .ai-model-pick, .ai-model-menu')) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      var r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
      panel.style.left = ox + 'px'; panel.style.top = oy + 'px';
      panel.style.transition = 'none';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var nx = ox + (e.clientX - sx), ny = oy + (e.clientY - sy);
      nx = Math.max(0, Math.min(nx, window.innerWidth - panel.offsetWidth));
      ny = Math.max(0, Math.min(ny, window.innerHeight - panel.offsetHeight));
      panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', function () { drag = false; panel.style.transition = ''; });

    // ── 八向边框缩放：四边 + 四角均可拉动自定义长宽 ──
    var MIN_W = 380, MIN_H = 520, VIEWPAD = 16;
    var rzDir = null, rzStart = {};
    panel.querySelectorAll('.ai-rz-handle').forEach(function (h) {
      h.addEventListener('mousedown', function (e) {
        if (panel.classList.contains('maximized')) return;
        rzDir = h.getAttribute('data-rz');
        var r = panel.getBoundingClientRect();
        rzStart = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height };
        panel.style.transition = 'none';
        e.preventDefault(); e.stopPropagation();
      });
    });
    window.addEventListener('mousemove', function (e) {
      if (!rzDir) return;
      var dx = e.clientX - rzStart.x, dy = e.clientY - rzStart.y;
      var left = rzStart.left, top = rzStart.top, w = rzStart.w, h = rzStart.h;
      if (rzDir.indexOf('e') >= 0) {
        w = Math.max(MIN_W, Math.min(rzStart.w + dx, window.innerWidth - left - VIEWPAD));
      }
      if (rzDir.indexOf('s') >= 0) {
        h = Math.max(MIN_H, Math.min(rzStart.h + dy, window.innerHeight - top - VIEWPAD));
      }
      if (rzDir.indexOf('w') >= 0) {
        var newLeft = rzStart.left + dx;
        var newW = rzStart.w - dx;
        if (newW < MIN_W) { newLeft = rzStart.left + rzStart.w - MIN_W; newW = MIN_W; }
        if (newLeft < VIEWPAD) { newW -= (VIEWPAD - newLeft); newLeft = VIEWPAD; }
        if (newW < MIN_W) { newW = MIN_W; }
        left = newLeft; w = newW;
      }
      if (rzDir.indexOf('n') >= 0) {
        var newTop = rzStart.top + dy;
        var newH = rzStart.h - dy;
        if (newH < MIN_H) { newTop = rzStart.top + rzStart.h - MIN_H; newH = MIN_H; }
        if (newTop < VIEWPAD) { newH -= (VIEWPAD - newTop); newTop = VIEWPAD; }
        if (newH < MIN_H) { newH = MIN_H; }
        top = newTop; h = newH;
      }
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
    });
    window.addEventListener('mouseup', function () { rzDir = null; panel.style.transition = ''; });

    // ── 自适应：窄 / 矮窗口切换排版类（防畸形 / 重叠） ──
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        panel.classList.toggle('narrow', panel.offsetWidth < 392);
        panel.classList.toggle('short', panel.offsetHeight < 520);
      });
      ro.observe(panel);
    }

    // ── 拖文件进聊天框（仅聊天区触发遮罩） ──
    var chatArea = panel.querySelector('#ai-chat-area');
    var dropEl = panel.querySelector('#ai-chat-drop');
    function fileIcon(name) {
      var e = (name.split('.').pop() || '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].indexOf(e) >= 0) return '🖼';
      if (e === 'pdf') return '📄';
      if (['doc', 'docx'].indexOf(e) >= 0) return '📝';
      if (['xls', 'xlsx', 'csv'].indexOf(e) >= 0) return '📊';
      if (['zip', 'rar', '7z'].indexOf(e) >= 0) return '🗜';
      return '📎';
    }
    var dragDepth = 0;
    chatArea.addEventListener('dragenter', function (e) { e.preventDefault(); if (panel.classList.contains('maximized')) return; dragDepth++; dropEl.classList.add('show'); });
    chatArea.addEventListener('dragover', function (e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    chatArea.addEventListener('dragleave', function (e) { dragDepth--; if (dragDepth <= 0) { dragDepth = 0; dropEl.classList.remove('show'); } });
    chatArea.addEventListener('drop', function (e) {
      e.preventDefault(); dragDepth = 0; dropEl.classList.remove('show');
      var files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return;
      var f = files[0];
      addBubble('ai-chat-file', '<div class="ai-file-bubble"><div class="ic">' + fileIcon(f.name) + '</div>' +
        '<div class="meta"><div class="fn">' + esc(f.name) + '</div><div class="fs">' +
        (f.size ? (f.size / 1024).toFixed(0) + ' KB' : '已接收') + ' · 已接收，可直接提问</div></div></div>');
    });

    // ── 快捷 chips / 文本框自适应高度 ──
    panel.querySelectorAll('.ai-chip').forEach(function (c) {
      c.onclick = function () { var ta = panel.querySelector('#ai-chat-text'); if (ta) { ta.value = c.textContent; ta.focus(); } };
    });
    var ta = panel.querySelector('#ai-chat-text');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; });

    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') minimize(); });
    setTimeout(function () { var t = panel.querySelector('#ai-chat-text'); if (t) t.focus(); }, 80);
  }

  // ── AI 模式开关（账号级） ─────────────────────────────
  // 管理员为每个账号开关「AI 辅助」；关闭时本系统所有非聊天 AI 功能入口都不渲染。
  // 聊天对话（小Qoo 问答，openChat）不受此开关限制。
  function aiEnabled() {
    try {
      var u = window.AppState && AppState.currentUser;
      if (!u) return false;
      if (isAdminRole(u)) return true; // 管理员 / 超级管理员默认始终开通 AI 辅助
      return !!u.aiMode;
    } catch (e) { return false; }
  }

  // ── AI 优先展示：分段切换 [AI 生成 | 🧮 系统生成]，默认停在 AI，隐藏系统 ──
  // 仅当 aiMode 开启、且用户已生成 AI 内容后由各页面调用；返回控制器或 null。
  function installAIFirstView(systemEl, aiEl) {
    if (!aiEnabled()) return null;
    if (!systemEl || !aiEl) return null;
    if (systemEl._aiFirstInstalled) return systemEl._aiFirstInstalled; // 防重复安装
    var bar = document.createElement('div');
    bar.className = 'ai-first-bar no-print';
    bar.innerHTML =
      '<div class="seg-tabs ai-first-seg">' +
        '<button type="button" class="seg-tab active" data-view="ai">' + qooIcon('sm') + ' AI 生成</button>' +
        '<button type="button" class="seg-tab" data-view="sys">🧮 系统生成</button>' +
      '</div>';
    // 插入到 systemEl / aiEl 中 DOM 顺序靠前的那个之前
    var earliest = (systemEl.compareDocumentPosition(aiEl) & Node.DOCUMENT_POSITION_FOLLOWING) ? systemEl : aiEl;
    if (earliest.parentNode) earliest.parentNode.insertBefore(bar, earliest);
    function setActive(v) {
      bar.querySelectorAll('.seg-tab').forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-view') === v); });
    }
    function showAI() { if (systemEl) systemEl.style.display = 'none'; if (aiEl) aiEl.style.display = ''; setActive('ai'); }
    function showSys() { if (aiEl) aiEl.style.display = 'none'; if (systemEl) systemEl.style.display = ''; setActive('sys'); }
    bar.querySelectorAll('.seg-tab').forEach(function (t) {
      t.addEventListener('click', function () { (t.getAttribute('data-view') === 'ai') ? showAI() : showSys(); });
    });
    showAI(); // 默认 AI 优先
    var ctrl = { bar: bar, showAI: showAI, showSys: showSys, systemEl: systemEl, aiEl: aiEl };
    systemEl._aiFirstInstalled = ctrl; aiEl._aiFirstInstalled = ctrl;
    return ctrl;
  }

  // ── 严谨版方案：医生手动开关 AI 解读 / AI 方案 ──────────
  var TPREF_KEY = 'qd_ai_toggle_pref_v1';
  function readTogglePref() {
    try { return Object.assign({ interp: false, plan: false }, JSON.parse(localStorage.getItem(TPREF_KEY) || '{}')); }
    catch (e) { return { interp: false, plan: false }; }
  }
  function writeTogglePref(p) {
    try { localStorage.setItem(TPREF_KEY, JSON.stringify(p)); } catch (e) {}
  }
  async function aiControls(hostEl, ctx, opts) {
    if (!hostEl) return;
    if (!aiEnabled()) return; // AI 模式关闭 → 不渲染 AI 控制区
    opts = opts || {};
    var pref = readTogglePref();
    var mode = 'AI';
    function badgeHTML() { return '<span class="sarc2-ai-badge">' + esc(mode) + '</span>'; }
    // 关键：先同步渲染面板（不再 await status），避免预览/iFrame 环境后端不可达时
    // status 请求挂起导致整个 AI 控制区永不出现、按钮缺失。
    hostEl.innerHTML =
      `<div class="sarc2-ai-controls">` +
        `<div class="sarc2-ai-ctrl-title"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 辅助（医生手动开关）</div>` +
        `<div class="sarc2-ai-ctrl-model"><span class="sarc2-ai-ctrl-label">AI 模型</span><span id="ai-ctrl-model-wrap"></span></div>` +
        `<label class="sarc2-switch"><input type="checkbox" id="ai-tg-interp"${pref.interp ? ' checked' : ''}><span>鹊动小Qoo 报告解读</span></label>` +
        `<label class="sarc2-switch"><input type="checkbox" id="ai-tg-plan"${pref.plan ? ' checked' : ''}><span>鹊动小Qoo 方案推荐</span></label>` +
        `<button id="ai-run" class="sarc2-ai-run">生成</button>` +
      `</div>` +
      `<div id="ai-interp-box" class="sarc2-ai" style="display:${pref.interp ? '' : 'none'}"></div>` +
      `<div id="ai-plan-box" class="sarc2-ai" style="display:${pref.plan ? '' : 'none'}"></div>`;

    var tI = hostEl.querySelector('#ai-tg-interp');
    var tP = hostEl.querySelector('#ai-tg-plan');
    var run = hostEl.querySelector('#ai-run');
    var modelWrap = hostEl.querySelector('#ai-ctrl-model-wrap');
    if (modelWrap) modelWrap.appendChild(buildModelSelect({ id: 'ai-ctrl-model-select' }));
    function sync() {
      pref.interp = tI.checked; pref.plan = tP.checked; writeTogglePref(pref);
      var ib = hostEl.querySelector('#ai-interp-box');
      var pb = hostEl.querySelector('#ai-plan-box');
      if (ib) ib.style.display = pref.interp ? '' : 'none';
      if (pb) pb.style.display = pref.plan ? '' : 'none';
      // 若某 AI 框被隐藏且存在「AI 优先」切换条 → 切回系统视图，避免空白
      [ib, pb].forEach(function (bx) {
        if (bx && bx.style.display === 'none' && bx._aiFirstInstalled) bx._aiFirstInstalled.showSys();
      });
    }
    tI.onchange = function () { sync(); if (pref.interp) runInterpret(); };
    tP.onchange = function () { sync(); if (pref.plan) runPlan(); };
    run.onclick = function () {
      if (run.dataset.locked === '1') return; // 防重复：生成中忽略再次点击
      run.dataset.locked = '1'; run.disabled = true;
      var ph = run.innerHTML;
      run.innerHTML = '<span class="ai-spin"></span> 生成中…';
      var fin = function () { run.dataset.locked = '0'; run.disabled = false; run.innerHTML = ph; };
      var tasks = [];
      if (pref.interp) tasks.push(runInterpret());
      if (pref.plan) tasks.push(runPlan());
      if (!tasks.length) { fin(); return; }
      Promise.all(tasks).then(fin, fin);
    };
    // 后台非阻塞刷新运行模式（云/本地/混合）徽标
    status().then(function (st) {
      if (!st || !st.mode) return;
      mode = st.mode;
      var bs = hostEl.querySelectorAll('.sarc2-ai-badge');
      for (var i = 0; i < bs.length; i++) bs[i].textContent = mode;
    }).catch(function () {});

    function runInterpret() {
      var ib = hostEl.querySelector('#ai-interp-box'); if (!ib) return Promise.resolve();
      ib.style.display = '';
      ib.innerHTML = `<div class="sarc2-ai-head"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 报告解读${badgeHTML()}</div><div class="sarc2-ai-body">` + spinHTML('正在生成解读…') + '</div>';
      var _rend = null;
      var _stopEl = startElapsed(ib.querySelector('.sarc2-ai-body'));
      // 流式：首字到达即清掉 spinner，改为逐字增长
      return interpretStream(ctx, {}, function (t) {
        var bd = ib.querySelector('.sarc2-ai-body');
        if (!bd) return;
        if (!_rend) { _stopEl(); bd.innerHTML = ''; _rend = makeStreamRenderer(bd); }
        _rend.push(t);
      }).then(function (r) {
        _stopEl();
        if (_rend) _rend.finish();
        var body = ib.querySelector('.sarc2-ai-body');
        if (!body) return;
        var patient = _summarizeCtx(ctx);
        body.innerHTML = '<div class="ai-md">' + renderMarkdown(r.reply || '') + '</div>' +
          (r.partial ? '<div class="ai-partial-note">⚠️ 生成中途中断，以上为已完成部分，建议重新生成。</div>' : '') +
          aiActionBarHTML('已存入解读历史', '鹊动小Qoo报告解读') +
          '<div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认 · 源：' + esc(r.provider || mode) +
          (r.streamed ? ' · 流式' : '') + '</div>';
        pushInterpHistory({ title: '报告解读', patient: patient, markdown: r.reply || '', provider: r.provider || mode, kind: 'interp' });
        storeAiShare('interpret', { markdown: r.reply || '', provider: r.provider || mode });
        wireAIResultActions(body, { markdown: r.reply || '', title: '鹊动小Qoo 报告解读', patient: patient, provider: r.provider || mode, filename: '鹊动小Qoo报告解读' });
      }).catch(function (e) {
        _stopEl();
        var body = ib.querySelector('.sarc2-ai-body');
        if (body) {
          body.innerHTML = aiErrorCard('鹊动小Qoo 解读暂不可用：' + aiErrMsg(e), true);
          var rb = body.querySelector('.ai-retry-btn'); if (rb) rb.onclick = function () { runInterpret(); };
        }
        if (window.U && U.toast) U.toast('报告解读生成失败', 'error');
      });
    }
    function runPlan() {
      var pb = hostEl.querySelector('#ai-plan-box'); if (!pb) return Promise.resolve();
      pb.style.display = '';
      pb.innerHTML = `<div class="sarc2-ai-head"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 方案推荐${badgeHTML()}</div><div class="sarc2-ai-body">` + spinHTML('正在生成方案…（预计 10–60 秒，请稍候）') + '</div>';
      // 方案是结构化 JSON，逐字流出来只会是一堆花括号，反而更差；
      // 因此这里不做流式，改为显示「已用时」让等待可感知。
      var _stopEl = startElapsed(pb.querySelector('.sarc2-ai-body'));
      return generatePlan(ctx).then(function (r) {
        _stopEl();
        var body = pb.querySelector('.sarc2-ai-body');
        if (!body) return;
        var plan = r.plan || tryExtractPlan(r.raw);
        var patient = _summarizeCtx(ctx);
        if (plan) {
          var summaryHTML = (opts && typeof opts.planRenderer === 'function') ? opts.planRenderer(plan) : planSummaryHTML(plan);
          body.innerHTML = summaryHTML + gateHTML(r.gate) +
            '<div class="sarc2-ai-adopt-row"><button type="button" class="btn btn-primary btn-sm ai-adopt-plan-btn"><span class="ai-icon-wrap">' + qooIcon('sm') + '</span> 采用为正式方案</button><span class="ai-adopt-hint"></span></div>' +
            aiActionBarHTML('已存入解读历史', '鹊动小Qoo智能方案') +
            '<div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认 · 源：' + esc(r.provider || mode) + '</div>';
          // 「采用为正式方案」：人工审核后把 AI 方案写入患者正式方案（AppState.plan）并落库
          var adoptBtn = body.querySelector('.ai-adopt-plan-btn');
          if (adoptBtn) adoptBtn.addEventListener('click', function () {
            if (!window.AppState || !AppState.currentPatientId) { U.toast('请先在患者档案中登记或选择患者，才能保存方案', 'warning'); return; }
            // 自定义落库钩子：如跌倒风险模块把 AI 方案存入 data.fallAIPlan，而非覆盖体重管理 AppState.plan
            if (opts && typeof opts.onAdopt === 'function') { opts.onAdopt(plan, r); return; }
            var hint = body.querySelector('.ai-adopt-hint');
            adoptBtn.disabled = true; adoptBtn.textContent = '保存中…';
            var adopted = Object.assign({}, plan);
            adopted.generatedBy = 'ai';
            adopted.generatedAt = adopted.generatedAt || new Date().toISOString();
            adopted.aiProvider = (r && r.provider) || mode;
            AppState.plan = adopted;
            Promise.resolve().then(function () { return window.persistPatient(); }).then(function () {
              adoptBtn.textContent = '✓ 已写入正式方案';
              if (hint) hint.textContent = '已保存至患者档案';
              U.toast('已将 AI 方案写入患者正式方案', 'success');
            }).catch(function (e) {
              adoptBtn.disabled = false; adoptBtn.textContent = '采用为正式方案';
              U.toast('保存失败：' + U.errMsg(e), 'error');
            });
          });
          pushInterpHistory({ title: '智能训练方案', patient: patient, plan: plan, gate: r.gate, provider: r.provider || mode, kind: 'plan' });
          storeAiShare('plan', { plan: plan, raw: r.raw, gate: r.gate, provider: r.provider || mode });
          wireAIResultActions(body, { plan: plan, gate: r.gate, raw: r.raw, title: '鹊动小Qoo 智能训练方案', patient: patient, provider: r.provider || mode, filename: '鹊动小Qoo智能方案' });
          // AI 优先展示：系统方案 ↔ AI 方案 分段切换，默认 AI
          if (opts.systemEl) {
            if (pb._aiFirstInstalled) pb._aiFirstInstalled.showAI();
            else installAIFirstView(opts.systemEl, pb);
          }
        } else {
          body.innerHTML = rawFallbackHTML(r.raw) + gateHTML(r.gate) +
            '<button class="btn btn-secondary btn-sm ai-retry-btn" style="margin-top:8px;">↻ 重试生成</button>';
        }
        var rb = body.querySelector('.ai-retry-btn');
        if (rb) rb.onclick = function () { runPlan(); };
      }).catch(function (e) {
        _stopEl();
        var body = pb.querySelector('.sarc2-ai-body');
        if (body) {
          body.innerHTML = aiErrorCard('鹊动小Qoo 方案暂不可用：' + aiErrMsg(e), true);
          var rb = body.querySelector('.ai-retry-btn'); if (rb) rb.onclick = function () { runPlan(); };
        }
        if (window.U && U.toast) U.toast('方案生成失败', 'error');
      });
    }

    if (pref.interp) runInterpret();
    if (pref.plan) runPlan();
  }

  /**
   * 在宿主元素内挂载一个「鹊动小Qoo 报告解读」按钮 + 结果框。
   * 点击即基于 getCtx() 返回的评估上下文调用 /api/ai/interpret，复用既有样式与降级逻辑。
   * @param {HTMLElement} hostEl 放置按钮的容器（每次重渲染报告后可重复调用）
   * @param {Function} getCtx () => contextObject  点击时动态取最新上下文
   * @param {Object} [opts] { title }
   */
  function attachInterpretButton(hostEl, getCtx, opts) {
    opts = opts || {};
    if (!hostEl) return;
    if (!aiEnabled()) return; // AI 模式关闭 → 不渲染解读按钮
    if (typeof window.AIReason === 'undefined' || !window.AIReason.interpret) {
      // 组件未就绪时不渲染，避免空按钮
      return;
    }
    var title = opts.title || '鹊动小Qoo 报告解读';
    var wrap = document.createElement('div');
    wrap.className = 'ai-report-interp';
    wrap.innerHTML =
      '<button class="btn btn-secondary btn-sm" type="button" data-loading="解读中…">' +
        '<span class="ai-icon-wrap">' + qooIcon('sm') + '</span>' + esc(title) + '</button>' +
      '<div class="ai-report-interp-box"></div>';
    hostEl.appendChild(wrap);
    var btn = wrap.querySelector('button');
    var box = wrap.querySelector('.ai-report-interp-box');
    btn.onclick = function () {
      lockButton(btn, function () {
        if (!window.AIReason || typeof window.AIReason.interpret !== 'function') {
          if (window.U && U.toast) U.toast('鹊动小Qoo 组件未加载', 'error');
          return;
        }
        // 离线时静默提示，不发请求
        if (window.Sync && window.Sync.isOnline && window.Sync.isOnline() === false) {
          box.innerHTML = '<div class="sarc2-ai muted"><span class="ai-icon-wrap">' + qooIcon('sm') +
            '</span>鹊动小Qoo 辅助需联网，当前处于离线状态，请恢复网络后查看解读。</div>';
          return;
        }
        var ctx;
        try { ctx = getCtx(); } catch (e) { ctx = {}; }
        box.innerHTML =
          '<div class="sarc2-ai-head"><span class="ai-icon-wrap">' + qooIcon('sm') + '</span>鹊动小Qoo 报告解读' +
            '<span class="sarc2-ai-badge ai-live-badge">生成中</span></div>' +
          '<div class="sarc2-ai-body">' + spinHTML('鹊动小Qoo 正在解读…') + '</div>';
        var sBody = box.querySelector('.sarc2-ai-body');
        var stopEl = startElapsed(sBody);
        var rend = null;
        return interpretStream(ctx, {}, function (t) {
          if (!rend) { stopEl(); sBody.innerHTML = ''; rend = makeStreamRenderer(sBody); }
          rend.push(t);
        }).then(function (res) {
          stopEl();
          if (rend) rend.finish();
          var md = renderMarkdown(res.reply || '');
          var patient = _summarizeCtx(ctx);
          box.innerHTML =
            '<div class="sarc2-ai-head"><span class="ai-icon-wrap">' + qooIcon('sm') + '</span>鹊动小Qoo 报告解读' +
              '<span class="sarc2-ai-badge">' + esc(res.provider || 'AI') + '</span></div>' +
            '<div class="ai-md">' + md + '</div>' +
            (res.partial ? '<div class="ai-partial-note">⚠️ 生成中途中断，以上为已完成部分，建议重新生成。</div>' : '') +
            aiActionBarHTML('已存入解读历史', '鹊动小Qoo报告解读') +
            '<div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认' + (res.streamed ? ' · 流式' : '') + '</div>';
          // 自动持久化到解读历史，便于复诊对比
          pushInterpHistory({ title: '报告解读', patient: patient, markdown: res.reply || '', provider: res.provider || 'AI', kind: 'interp' });
          storeAiShare('interpret', { markdown: res.reply || '', provider: res.provider || 'AI' });
          wireAIResultActions(box, { markdown: res.reply || '', title: '鹊动小Qoo 报告解读', patient: patient, provider: res.provider || 'AI', filename: '鹊动小Qoo报告解读' });
          // AI 优先展示：系统报告 ↔ AI 解读 分段切换，默认 AI
          if (opts.systemEl) {
            if (box._aiFirstInstalled) box._aiFirstInstalled.showAI();
            else installAIFirstView(opts.systemEl, box);
          }
        }).catch(function (e) {
          stopEl();
          box.innerHTML = '<div class="sarc2-ai-body">' + aiErrorCard('鹊动小Qoo 解读暂不可用：' + aiErrMsg(e)) + '</div>';
          if (window.U && U.toast) U.toast('报告解读生成失败', 'error');
        });
      });
    };
  }

  window.AIReason = {
    status: status, chat: chat, generatePlan: generatePlan, enrich: enrich, openChat: openChat,
    interpret: interpret, generateImage: generateImage, renderMarkdown: renderMarkdown, aiControls: aiControls,
    // 流式（SSE）：不支持时内部自动回落非流式，调用方无需判断
    interpretStream: interpretStream, chatStream: chatStream,
    streamRequest: streamRequest, makeStreamRenderer: makeStreamRenderer,
    attachInterpretButton: attachInterpretButton,
    parseReport: parseReport, pdfToImages: pdfToImages,
    exportPDF: exportPDF, exportContainerPDF: exportContainerPDF, openHistory: openHistory,
    getInterpHistory: getInterpHistory, clearInterpHistory: clearInterpHistory,
    aiEnabled: aiEnabled, installAIFirstView: installAIFirstView,
    planSummaryHTML: planSummaryHTML, gateHTML: gateHTML,
    getModel: getModel, setModel: setModel, models: models,
  };
  // 全局暴露吉祥物图标构造器，供其他模块在 HTML 模板中调用
  window.qooIcon = qooIcon;

  // 说明：独立的 AI 浮窗启动按钮已取消，AI 问答入口已合并到「鹊动小Qoo」图标上
  // （见 modules/qoo-pet.js：点击小Qoo 即调用 window.AIReason.openChat()）。
})();
