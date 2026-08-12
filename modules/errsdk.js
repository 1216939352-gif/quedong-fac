/**
 * 鹊动FAC功能评估与干预系统 — 前端统一报错采集 SDK（Phase 4）
 *
 * 设计要点：
 *   1) 零依赖、自包含 —— 本文件必须在 index.html 中「最先加载」，早于 lib/db.js 与所有模块，
 *      否则模块加载期抛出的错误无法被捕获。因此不得引用 U / DB / Sync 等任何全局。
 *   2) 离线优先 —— 后端不可达时静默写入 localStorage 队列，联网后自动补发，绝不打断业务。
 *   3) 绝不回环 —— SDK 自身产生的任何异常一律吞掉；上报请求失败不再触发新的上报。
 *   4) 去重限流 —— 相同错误签名 15s 内只记一次；单页会话最多上报 30 条，防止死循环刷爆后端。
 *
 * 上报落点：POST {API_BASE}/api/err-report   （后端 server/server.js，允许匿名）
 * 后端字段：{ level, msg, url, line, col, stack, meta }
 *
 * 对外 API：window.ErrSDK
 *   report(level, msg, extra)  手动上报（extra: {stack,url,line,col,meta}）
 *   flush()                    立即尝试补发队列，返回 Promise<{sent,left}>
 *   queue()                    读取当前未发送队列（数组副本）
 *   clear()                    清空本地队列
 *   status()                   { pending, sentThisSession, lastError, apiBase, enabled }
 *   setContext(obj)            附加业务上下文（如当前医生、当前患者），随每条上报带出
 *   setEnabled(bool)           运行时开关（持久化到 localStorage）
 */
(function () {
  'use strict';

  var LS = null;
  try { LS = window.localStorage; } catch (e) { LS = null; }

  var QUEUE_KEY = 'qd_err_queue';
  var ENABLED_KEY = 'qd_err_enabled';
  var CONSOLE_KEY = 'qd_err_capture_console';
  var MAX_QUEUE = 50;          // 本地队列上限（超出丢最旧的）
  var MAX_PER_SESSION = 30;    // 单页会话上报上限
  var DEDUP_MS = 15000;        // 相同签名去重窗口
  var FLUSH_DEBOUNCE = 1500;   // 上报防抖
  var FLUSH_INTERVAL = 60000;  // 定时补发间隔

  // ───────── 基础状态 ─────────
  var apiBase = '';
  try { apiBase = LS ? (LS.getItem('sync_api_base') || '') : ''; } catch (e) {}

  var enabled = true;
  try { if (LS && LS.getItem(ENABLED_KEY) === '0') enabled = false; } catch (e) {}

  var captureConsole = true;
  try { if (LS && LS.getItem(CONSOLE_KEY) === '0') captureConsole = false; } catch (e) {}

  var sentThisSession = 0;
  var lastError = null;        // SDK 自身最后一次发送失败原因（仅诊断用，不上报）
  var sending = false;         // 发送中标志，避免并发重复发
  var inReport = false;        // 防回环：正在处理上报时不再接受新的捕获
  var flushTimer = null;
  var seen = Object.create(null); // 签名 -> 上次上报时间戳
  var context = {};            // 业务上下文

  function deviceId() {
    try {
      var id = LS ? LS.getItem('sync_device_id') : null;
      return id || '';
    } catch (e) { return ''; }
  }

  // ───────── 队列存取 ─────────
  function readQueue() {
    if (!LS) return [];
    try {
      var raw = LS.getItem(QUEUE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeQueue(arr) {
    if (!LS) return;
    try {
      // 超限丢最旧的，保证 localStorage 不被撑爆
      var keep = arr.length > MAX_QUEUE ? arr.slice(arr.length - MAX_QUEUE) : arr;
      LS.setItem(QUEUE_KEY, JSON.stringify(keep));
    } catch (e) { /* 配额满等情况直接放弃，不影响业务 */ }
  }

  // ───────── 工具 ─────────
  function nowISO() { try { return new Date().toISOString(); } catch (e) { return ''; } }

  function curUrl() {
    try { return String(location.href).slice(0, 500); } catch (e) { return ''; }
  }

  function normMsg(m) {
    if (m == null) return '';
    if (typeof m === 'string') return m;
    if (m instanceof Error) return (m.name ? m.name + ': ' : '') + (m.message || '');
    try { return JSON.stringify(m); } catch (e) { return String(m); }
  }

  function normStack(e) {
    try {
      if (e && e.stack) return String(e.stack);
      if (e && e.error && e.error.stack) return String(e.error.stack);
      return '';
    } catch (err) { return ''; }
  }

  function sig(level, msg, line, col) {
    return level + '|' + String(msg).slice(0, 200) + '|' + (line || 0) + '|' + (col || 0);
  }

  function dedupPass(s) {
    var t = Date.now();
    var last = seen[s];
    if (last && (t - last) < DEDUP_MS) return false;
    seen[s] = t;
    return true;
  }

  // ───────── 核心：入队 ─────────
  function report(level, msg, extra) {
    if (!enabled) return;
    if (inReport) return;                       // 防回环
    if (sentThisSession >= MAX_PER_SESSION) return;
    inReport = true;
    try {
      extra = extra || {};
      var m = normMsg(msg);
      if (!m && !extra.stack) return;
      var s = sig(level, m, extra.line, extra.col);
      if (!dedupPass(s)) return;

      var meta = {};
      try {
        meta.device = deviceId();
        meta.route = (location.hash || '').slice(0, 120);
        meta.ts = nowISO();
        meta.screen = (window.screen ? (screen.width + 'x' + screen.height) : '');
        var ck = Object.keys(context);
        for (var i = 0; i < ck.length; i++) meta[ck[i]] = context[ck[i]];
        if (extra.meta && typeof extra.meta === 'object') {
          var ek = Object.keys(extra.meta);
          for (var j = 0; j < ek.length; j++) meta[ek[j]] = extra.meta[ek[j]];
        }
      } catch (e) {}

      var item = {
        level: level || 'error',
        msg: m.slice(0, 4000),
        url: (extra.url || curUrl()).slice(0, 500),
        line: extra.line || null,
        col: extra.col || null,
        stack: String(extra.stack || '').slice(0, 8000),
        meta: meta
      };

      var q = readQueue();
      q.push(item);
      writeQueue(q);
      scheduleFlush();
    } catch (e) {
      // SDK 自身异常一律吞掉
    } finally {
      inReport = false;
    }
  }

  // ───────── 核心：补发 ─────────
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () {
      flushTimer = null;
      flush();
    }, FLUSH_DEBOUNCE);
  }

  function postOne(item) {
    var url = (apiBase || '') + '/api/err-report';
    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    };
    // keepalive 让页面卸载时也有机会发出去（部分浏览器支持）
    try { opts.keepalive = true; } catch (e) {}
    return fetch(url, opts).then(function (r) {
      // 4xx 视为「后端明确拒绝」，不再重试，直接丢弃避免死队列
      if (r.status >= 400 && r.status < 500) return 'drop';
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return 'ok';
    });
  }

  function flush() {
    if (!enabled) return Promise.resolve({ sent: 0, left: readQueue().length });
    if (sending) return Promise.resolve({ sent: 0, left: readQueue().length });
    var q = readQueue();
    if (!q.length) return Promise.resolve({ sent: 0, left: 0 });
    if (typeof fetch !== 'function') return Promise.resolve({ sent: 0, left: q.length });

    sending = true;
    var sent = 0;
    var remain = q.slice();

    // 串行发送：后端不可达时第一条就失败，立即停止，避免 N 次超时拖慢页面
    function step() {
      if (!remain.length) return Promise.resolve();
      var item = remain[0];
      return postOne(item).then(function (r) {
        remain.shift();
        if (r === 'ok') { sent++; sentThisSession++; }
        writeQueue(remain);
        if (sentThisSession >= MAX_PER_SESSION) return;
        return step();
      });
    }

    return step().then(function () {
      lastError = null;
      sending = false;
      return { sent: sent, left: remain.length };
    }).catch(function (e) {
      lastError = String((e && e.message) || e);
      writeQueue(remain);      // 失败的留在队列里，下次再发
      sending = false;
      return { sent: sent, left: remain.length };
    });
  }

  // ───────── 全局捕获 ─────────
  function installHandlers() {
    // 1) 未捕获的 JS 异常 + 资源加载失败（capture 阶段才能拿到资源错误）
    try {
      window.addEventListener('error', function (ev) {
        try {
          var t = ev && ev.target;
          // 资源加载失败：target 是 <script>/<img>/<link> 等元素，没有 message
          if (t && t !== window && t.tagName) {
            var src = t.src || t.href || '';
            if (!src) return;
            report('resource', '资源加载失败: <' + String(t.tagName).toLowerCase() + '> ' + src, {
              url: String(src).slice(0, 500)
            });
            return;
          }
          report('error', ev.message || normMsg(ev.error), {
            url: ev.filename,
            line: ev.lineno,
            col: ev.colno,
            stack: normStack(ev.error || ev)
          });
        } catch (e) {}
      }, true);
    } catch (e) {}

    // 2) 未处理的 Promise rejection
    try {
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          var r = ev ? ev.reason : null;
          report('unhandledrejection', normMsg(r) || 'Promise rejected', { stack: normStack(r) });
        } catch (e) {}
      });
    } catch (e) {}

    // 3) console.error 兜底（很多异常被 try/catch 后只打了 console.error，线上就此消失）
    if (captureConsole) {
      try {
        var orig = console.error;
        console.error = function () {
          try {
            var parts = [];
            for (var i = 0; i < arguments.length; i++) parts.push(normMsg(arguments[i]));
            var stack = '';
            for (var j = 0; j < arguments.length; j++) {
              if (arguments[j] instanceof Error) { stack = normStack(arguments[j]); break; }
            }
            report('console', parts.join(' ').slice(0, 4000), { stack: stack });
          } catch (e) {}
          try { orig.apply(console, arguments); } catch (e) {}
        };
      } catch (e) {}
    }

    // 4) 联网 / 定时补发
    try { window.addEventListener('online', function () { flush(); }); } catch (e) {}
    try {
      setInterval(function () {
        if (readQueue().length) flush();
      }, FLUSH_INTERVAL);
    } catch (e) {}

    // 5) 页面卸载前尽力发一次（sendBeacon 不受卸载中断影响）
    try {
      window.addEventListener('pagehide', function () {
        try {
          var q = readQueue();
          if (!q.length || !navigator.sendBeacon) return;
          var url = (apiBase || '') + '/api/err-report';
          // sendBeacon 一次只发一条（后端按单条接收），发最新一条即可
          var blob = new Blob([JSON.stringify(q[q.length - 1])], { type: 'application/json' });
          navigator.sendBeacon(url, blob);
        } catch (e) {}
      });
    } catch (e) {}
  }

  // ───────── 对外 API ─────────
  window.ErrSDK = {
    report: function (level, msg, extra) { report(level || 'error', msg, extra); },
    error: function (msg, extra) { report('error', msg, extra); },
    warn: function (msg, extra) { report('warn', msg, extra); },
    info: function (msg, extra) { report('info', msg, extra); },
    flush: flush,
    queue: function () { return readQueue(); },
    clear: function () { writeQueue([]); seen = Object.create(null); },
    status: function () {
      return {
        pending: readQueue().length,
        sentThisSession: sentThisSession,
        lastError: lastError,
        apiBase: apiBase || '(同源)',
        enabled: enabled,
        captureConsole: captureConsole
      };
    },
    setContext: function (obj) {
      try { if (obj && typeof obj === 'object') { Object.keys(obj).forEach(function (k) { context[k] = obj[k]; }); } } catch (e) {}
    },
    setEnabled: function (v) {
      enabled = !!v;
      try { if (LS) LS.setItem(ENABLED_KEY, enabled ? '1' : '0'); } catch (e) {}
    },
    setCaptureConsole: function (v) {
      try { if (LS) LS.setItem(CONSOLE_KEY, v ? '1' : '0'); } catch (e) {}
    },
    // 供管理后台自检用：造一条测试报错
    test: function () {
      report('info', '【自检】前端报错通道测试 ' + nowISO(), { meta: { selfTest: true } });
      return flush();
    }
  };

  installHandlers();
  // 页面加载完成后补发上一次会话遗留的队列
  try {
    if (document.readyState === 'complete') setTimeout(flush, 800);
    else window.addEventListener('load', function () { setTimeout(flush, 800); });
  } catch (e) {}
})();
