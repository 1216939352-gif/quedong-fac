/**
 * 鹊动系统 — AI 能力配置层（密钥安全核心）
 *
 * 设计原则：
 *   1. 所有密钥（云 API Key）只存在于服务端环境变量，永不以任何形式下发到前端。
 *   2. 三种部署拓扑由环境变量决定，无需改代码：
 *        - 本地自托管：AI_LOCAL_URL=http://localhost:11434（Ollama）+ AI_LOCAL_MODEL=qwen2.5:7b
 *        - 云 API    ：AI_CLOUD_BASE_URL + AI_CLOUD_API_KEY + AI_CLOUD_MODEL
 *        - 混合      ：两者都配，请求优先本地、失败时回落云
 *   3. 任何一项都没配 → mode 自动降级为 'offline'，接口返回明确状态，前端静默降级到规则引擎。
 *
 * 兼容性：Node 22 原生 fetch / AbortController，零额外依赖。
 */
'use strict';

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

/**
 * 解析多模型列表（env 逗号分隔，每条 "id|展示名|baseUrl|apiKey" 格式）。
 * 例：AI_CLOUD_MODELS=doubao-seed-1-6-250615|豆包 Pro 1.6|https://ark.cn-beijing.volces.com/api/v3|<KEY>,deepseek-chat|DeepSeek V3|https://api.deepseek.com/v1|<KEY>
 * 兼容：每条 baseUrl/apiKey 可省略；未配置 envVal 时回退为单一模型（使用 fallbackBaseUrl/fallbackKey/fallbackId）。
 */
function parseModels(envVal, fallbackBaseUrl, fallbackKey, fallbackId) {
  const fbId = fallbackId || 'default';
  const fbBase = fallbackBaseUrl || '';
  const fbKey = fallbackKey || '';
  if (!envVal || !envVal.trim()) {
    return [{ id: fbId, label: fbId, baseUrl: fbBase, apiKey: fbKey }];
  }
  return envVal.split(',').map(s => {
    s = (s || '').trim();
    s = s.replace(/^["']|["']$/g, ''); // 兼容 .env 用引号包裹整条（如 "id|label"）
    if (!s) return null;
    const parts = s.split('|').map(x => x.trim());
    const id = parts[0];
    if (!id) return null;
    const label = parts[1] || id;
    const baseUrl = parts[2] || fbBase;
    const apiKey = parts[3] || fbKey;
    return { id, label, baseUrl, apiKey };
  }).filter(Boolean);
}

const cfg = {
  mode: (env('AI_MODE', 'hybrid') || 'hybrid').toLowerCase(),
  cloud: {
    baseUrl: env('AI_CLOUD_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
    apiKey: env('AI_CLOUD_API_KEY', ''),
    model: env('AI_CLOUD_MODEL', 'doubao-seed-1-6-250615'),
    models: parseModels(
      env('AI_CLOUD_MODELS', ''),
      env('AI_CLOUD_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, ''),
      env('AI_CLOUD_API_KEY', ''),
      env('AI_CLOUD_MODEL', 'doubao-seed-1-6-250615')
    ),
    defaultModel: env('AI_CLOUD_DEFAULT_MODEL', env('AI_CLOUD_MODEL', 'doubao-seed-1-6-250615')),
  },
  local: {
    url: env('AI_LOCAL_URL', 'http://localhost:11434').replace(/\/$/, ''),
    model: env('AI_LOCAL_MODEL', 'qwen2.5:7b'),
    models: parseModels(env('AI_LOCAL_MODELS', ''), env('AI_LOCAL_MODEL', 'qwen2.5:7b')),
    defaultModel: env('AI_LOCAL_DEFAULT_MODEL', env('AI_LOCAL_MODEL', 'qwen2.5:7b')),
  },
  timeoutMs: parseInt(env('AI_TIMEOUT_MS', '60000'), 10),
  maxTokens: parseInt(env('AI_MAX_TOKENS', '1024'), 10),
  systemPrompt: env(
    'AI_SYSTEM_PROMPT',
    '你是鹊动FAC功能评估与干预系统的临床辅助引擎。你只做辅助建议，所有方案须经专业人员确认。' +
      '回答需基于循证康复原则，强度必须引用客观测试（1RM / 峰力矩 / 握力），明确列出禁忌与注意事项，' +
      '不编造设备参数，不给出超出康复范围的医疗诊断。'
  ),
  imageGen: {
    enabled: env('AI_IMAGE_ENABLED', 'false') === 'true',
    // 未单独配置时回退到云（火山方舟）的 base / key，减少重复配置
    baseUrl: (env('AI_IMAGE_BASE_URL', '') || env('AI_CLOUD_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')).replace(/\/$/, ''),
    apiKey: env('AI_IMAGE_API_KEY', '') || env('AI_CLOUD_API_KEY', ''),
    model: env('AI_IMAGE_MODEL', ''),
  },
  vision: {
    enabled: env('AI_VISION_ENABLED', 'false') === 'true',
    baseUrl: env('AI_VISION_BASE_URL', '').replace(/\/$/, ''),
    apiKey: env('AI_VISION_API_KEY', ''),
    model: env('AI_VISION_MODEL', ''),
  },
  // 独立提供方「HY3」：OpenAI 兼容云端接口，复用云端调用链（callCloud/callCloudStream），
  // 仅在 AI_HY3_ENABLED=true 且 base/key 齐备时暴露给前端选择器并参与回落。
  hy3: {
    enabled: env('AI_HY3_ENABLED', 'false') === 'true',
    baseUrl: env('AI_HY3_BASE_URL', '').replace(/\/$/, ''),
    apiKey: env('AI_HY3_API_KEY', ''),
    model: env('AI_HY3_MODEL', 'hy3'),
    label: env('AI_HY3_LABEL', 'HY3'),
  },
};

function cloudConfigured() {
  return Boolean(cfg.cloud.baseUrl && cfg.cloud.apiKey);
}
function localConfigured() {
  return Boolean(cfg.local.url && cfg.local.model);
}
function imageGenConfigured() {
  return Boolean(cfg.imageGen.enabled && cfg.imageGen.baseUrl && cfg.imageGen.apiKey && cfg.imageGen.model);
}
function visionConfigured() {
  return Boolean(cfg.vision.enabled && cfg.vision.baseUrl && cfg.vision.apiKey && cfg.vision.model);
}
function hy3Configured() {
  return Boolean(cfg.hy3.enabled && cfg.hy3.baseUrl && cfg.hy3.apiKey);
}

/**
 * 探测本地 Ollama 是否可用（带 3s 超时，结果缓存 30s）。
 * 仅做 HEAD/GET /api/tags，不传输任何健康数据。
 */
let _localProbe = { ok: false, ts: 0 };
async function probeLocal() {
  const now = Date.now();
  if (now - _localProbe.ts < 30000) return _localProbe.ok;
  if (!localConfigured()) { _localProbe = { ok: false, ts: now }; return false; }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    const r = await fetch(cfg.local.url + '/api/tags', { signal: ac.signal });
    clearTimeout(t);
    _localProbe = { ok: r.ok, ts: now };
  } catch {
    _localProbe = { ok: false, ts: now };
  }
  return _localProbe.ok;
}

/**
 * 解析单次请求实际使用的提供方。
 * @param {'local'|'cloud'|'hybrid'|'auto'} requested 调用方指定的偏好（可选）
 * @returns {{primary:string, fallback:string|null, available:boolean}}
 */
async function resolveProvider(requested, modelId) {
  // 若请求显式指定 hy3 模型 id，则强制走 hy3 provider（OpenAI 兼容，复用云端调用链）
  if (modelId && modelId === cfg.hy3.model && hy3Configured()) {
    return { primary: 'hy3', fallback: null, available: true };
  }
  const want = (requested || cfg.mode).toLowerCase();
  const cloud = cloudConfigured();
  const local = await probeLocal();
  const hy3 = hy3Configured();
  if (want === 'hy3') return { primary: hy3 ? 'hy3' : 'offline', fallback: null, available: hy3 };
  if (want === 'cloud') return { primary: cloud ? 'cloud' : 'offline', fallback: null, available: cloud };
  if (want === 'local') return { primary: local ? 'local' : 'offline', fallback: null, available: local };
  // hybrid / auto：本地优先，云与 hy3 依次兜底
  if (local) return { primary: 'local', fallback: (cloud ? 'cloud' : (hy3 ? 'hy3' : null)), available: true };
  if (cloud) return { primary: 'cloud', fallback: (hy3 ? 'hy3' : null), available: true };
  if (hy3) return { primary: 'hy3', fallback: null, available: true };
  return { primary: 'offline', fallback: null, available: false };
}

/**
 * 返回前端模型选择器的可选模型列表（含 provider 标记）。
 * 仅在对应提供方已配置密钥/地址时才出现，未配置则不暴露。
 */
function getModels() {
  const out = [];
  if (hy3Configured()) {
    out.push({ id: cfg.hy3.model, label: cfg.hy3.label, provider: 'hy3' });
  }
  if (cloudConfigured()) {
    const list = (cfg.cloud.models && cfg.cloud.models.length) ? cfg.cloud.models : [{ id: cfg.cloud.model, label: cfg.cloud.model }];
    list.forEach(m => out.push({ id: m.id, label: m.label, provider: 'cloud' }));
  }
  if (localConfigured()) {
    const list = (cfg.local.models && cfg.local.models.length) ? cfg.local.models : [{ id: cfg.local.model, label: cfg.local.model }];
    list.forEach(m => out.push({ id: m.id, label: m.label + '（本地）', provider: 'local' }));
  }
  return out;
}

/**
 * 按模型 id 查找具体云端配置（带回退）。优先 cfg.cloud.models 中匹配；没有再回退到 cfg.cloud.* 默认值。
 */
function findCloudModel(modelId) {
  // hy3 作为独立提供方但走 OpenAI 兼容调用链，按 model id 命中即返回其专属 endpoint
  if (modelId && modelId === cfg.hy3.model && hy3Configured()) {
    return { id: cfg.hy3.model, label: cfg.hy3.label, baseUrl: cfg.hy3.baseUrl, apiKey: cfg.hy3.apiKey };
  }
  if (!modelId) return { id: cfg.cloud.defaultModel || cfg.cloud.model, label: cfg.cloud.model, baseUrl: cfg.cloud.baseUrl, apiKey: cfg.cloud.apiKey };
  const list = cfg.cloud.models || [];
  const m = list.find(x => x.id === modelId);
  if (m) return m;
  if (modelId === cfg.cloud.model) return { id: cfg.cloud.model, label: cfg.cloud.model, baseUrl: cfg.cloud.baseUrl, apiKey: cfg.cloud.apiKey };
  return { id: modelId, label: modelId, baseUrl: cfg.cloud.baseUrl, apiKey: cfg.cloud.apiKey };
}

/**
 * 解析单次请求实际使用的模型 id。
 * @param {'cloud'|'local'|string} provider 提供方
 * @param {string} [requestedId] 前端选择器传入的模型 id
 */
function resolveModel(provider, requestedId) {
  if (provider === 'cloud' || provider === 'local') {
    const src = provider === 'cloud' ? cfg.cloud : cfg.local;
    if (requestedId && src.models && src.models.some(m => m.id === requestedId)) return requestedId;
    if (requestedId && requestedId === src.model) return requestedId;
    return src.defaultModel || src.model;
  }
  if (cloudConfigured()) return cfg.cloud.defaultModel || cfg.cloud.model;
  if (localConfigured()) return cfg.local.defaultModel || cfg.local.model;
  return null;
}

module.exports = {
  cfg,
  cloudConfigured,
  localConfigured,
  imageGenConfigured,
  visionConfigured,
  hy3Configured,
  probeLocal,
  resolveProvider,
  resolveModel,
  findCloudModel,
  getModels,
  status() {
    return {
      mode: cfg.mode,
      cloudConfigured: cloudConfigured(),
      localConfigured: localConfigured(),
      localAvailable: _localProbe.ok,
      imageGenConfigured: imageGenConfigured(),
      visionConfigured: visionConfigured(),
      hy3Configured: hy3Configured(),
    };
  },
};
