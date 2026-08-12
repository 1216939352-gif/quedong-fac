/* ============================================================
 * 看板「大屏展示」能力（独立弹出页面）
 * ------------------------------------------------------------
 * 设计要点：
 *  - 在主系统两个看板页（大数据健康看板 / 肌少症数据看板）上各放一个
 *    「🖥 全屏展示」按钮，点击后通过 window.open 打开一个【独立浏览器窗口】。
 *  - 新窗口读取 URL 上的 ?fs=bigdata|sarc 参数，进入 kiosk 模式：
 *      · 不渲染登录 / 侧边栏 / 顶栏，直接铺满渲染对应看板；
 *      · 顶部一条悬浮控制条（刷新数据 / 自动刷新 / 浏览器全屏 / 退出大屏）；
 *      · 与主系统【完全独立】—— 各自是独立的浏览上下文，互不影响对方操作；
 *      · 监听同源 localStorage 的 storage 事件，主系统数据更新时自动同步刷新。
 *  - 复用既有 Pages.bigdata() / Pages.sarcopeniaStats() 渲染逻辑，零重复实现。
 * ============================================================ */
(function () {
  'use strict';

  var TITLES = {
    bigdata: '大数据展示 · 鹊动FAC健康看板',
    sarc: '老年人体重与肌少症 · 数据看板',
    fall: '老年跌倒风险 · 数据看板'
  };
  var ROUTE_MAP = {
    bigdata: function () { return window.Pages.bigdata(); },
    sarc: function () { return window.Pages.sarcopeniaStats(); },
    fall: function () { return window.Pages.fallRiskStats(); }
  };

  function fsKind() {
    var p = new URLSearchParams(location.search).get('fs');
    return (p === 'bigdata' || p === 'sarc' || p === 'fall') ? p : null;
  }

  /* 入口 1：从看板页按钮触发，打开独立大屏窗口 */
  function openKiosk(kind) {
    if (kind !== 'bigdata' && kind !== 'sarc' && kind !== 'fall') return null;
    var url = location.pathname + '?fs=' + kind;
    var w = window.open(url, 'quedong_kiosk_' + kind, 'width=1440,height=900');
    if (!w) {
      if (window.U) U.toast('浏览器拦截了弹出窗口，请允许本站点弹出后重试', 'warning');
      return null;
    }
    try { w.focus(); } catch (e) {}
    return w;
  }

  var autoTimer = null;
  var stageEl = null;
  var curKind = null;
  var storageDebounce = null;

  var THEME_KEY = 'wm_theme';

  function applyThemeToDoc() {
    // 优先读取主系统已保存的主题；未保存时按系统偏好（暗色模式）自动跟随
    var saved = localStorage.getItem(THEME_KEY);
    var theme = (saved === 'dark' || saved === 'light') ? saved
      : ((window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
    if (typeof applyTheme === 'function') {
      applyTheme(theme);
    } else {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(THEME_KEY, theme);
    }
  }

  function updateThemeBtn() {
    var btn = document.getElementById('fs-theme');
    if (!btn) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = isDark ? '☀ 浅色主题' : '🌙 深色主题';
    btn.title = isDark ? '切换为亮色主题' : '切换为深色主题';
  }

  function toggleKioskTheme() {
    if (typeof toggleTheme === 'function') {
      toggleTheme();
    } else {
      var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      var next = cur === 'dark' ? 'light' : 'dark';
      if (typeof applyTheme === 'function') applyTheme(next); else {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
      }
    }
    updateThemeBtn();
  }

  async function renderStage() {
    if (!stageEl || !curKind) return;
    stageEl.style.opacity = '0';
    try {
      // 重新拉取最新数据（与主系统共享 localStorage，确保大屏数据最新）
      AppState.patients = await DB.getPatients();
      var content = await Promise.resolve(ROUTE_MAP[curKind]());
      stageEl.innerHTML = '';
      if (typeof content === 'string') stageEl.innerHTML = content;
      else if (content instanceof Node) stageEl.appendChild(content);
    } catch (e) {
      console.error('[kiosk] 渲染失败', e);
      stageEl.innerHTML = '<div class="alert alert-danger">看板加载失败：' + U.esc(U.errMsg(e)) + '</div>';
    }
    requestAnimationFrame(function () { stageEl.style.opacity = '1'; });
  }

  function toggleAuto() {
    var btn = document.getElementById('fs-auto');
    if (autoTimer) {
      clearInterval(autoTimer); autoTimer = null;
      if (btn) { btn.textContent = '自动刷新：关'; btn.classList.remove('on'); }
    } else {
      autoTimer = setInterval(renderStage, 30000);
      if (btn) { btn.textContent = '自动刷新：开'; btn.classList.add('on'); }
    }
  }

  function toggleBrowserFullscreen() {
    var btn = document.getElementById('fs-fs');
    var el = document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    var exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (!req) { if (window.U) U.toast('当前浏览器不支持全屏 API', 'warning'); return; }
      Promise.resolve(req.call(el)).then(function () {
        if (btn) btn.classList.add('on');
      }).catch(function () { if (window.U) U.toast('浏览器拒绝了全屏请求', 'warning'); });
    } else {
      if (exit) exit.call(document);
      if (btn) btn.classList.remove('on');
    }
  }

  function startClock() {
    var el = document.getElementById('fs-clock');
    if (!el) return;
    var tick = function () { el.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); };
    tick();
    setInterval(tick, 1000);
  }

  function onStorageChanged() {
    if (storageDebounce) clearTimeout(storageDebounce);
    storageDebounce = setTimeout(renderStage, 600);
  }

  /* 入口 2：kiosk 窗口启动时调用，返回 true 表示已接管渲染（init 应提前 return） */
  async function maybeRenderKiosk() {
    var kind = fsKind();
    if (!kind) return false;

    applyThemeToDoc();

    // 轻量引导：构造最小 AppState，使看板可直接渲染（无需登录）
    AppState.currentUser = { username: '__kiosk__', role: 'admin', displayName: '大屏展示' };
    try { AppState.config = await DB.getSystemConfig(); } catch (e) { AppState.config = {}; }
    try { AppState.patients = await DB.getPatients(); } catch (e) { AppState.patients = []; }

    curKind = kind;
    // 让看板内部的时间范围 / 演示数据 / 下钻筛选切换，在 kiosk 下触发整屏重渲染
    window.route = renderStage;

    var app = U.qs('#app');
    app.innerHTML = '' +
      '<div class="fs-kiosk">' +
        '<div class="fs-bar no-print">' +
          '<div class="fs-bar-left">' +
            '<span class="fs-dot"></span>' +
            '<span class="fs-title">' + U.esc(TITLES[kind]) + '</span>' +
            '<span class="fs-clock" id="fs-clock"></span>' +
          '</div>' +
          '<div class="fs-bar-right">' +
            '<button class="fs-btn" id="fs-refresh" title="重新读取最新数据">↻ 刷新数据</button>' +
            '<button class="fs-btn" id="fs-auto" title="每 30 秒自动刷新一次">自动刷新：关</button>' +
            '<button class="fs-btn" id="fs-theme" title="切换明暗主题">🌙 深色主题</button>' +
            '<button class="fs-btn" id="fs-fs" title="进入浏览器全屏（投影 / 大屏更沉浸）">⛶ 全屏</button>' +
            '<button class="fs-btn fs-btn-exit" id="fs-exit" title="关闭大屏（不影响主系统）">✕ 退出大屏</button>' +
          '</div>' +
        '</div>' +
        '<div class="fs-stage" id="fs-stage"></div>' +
      '</div>';

    stageEl = U.qs('#fs-stage', app);
    U.qs('#fs-refresh', app).onclick = renderStage;
    U.qs('#fs-auto', app).onclick = toggleAuto;
    U.qs('#fs-theme', app).onclick = toggleKioskTheme;
    U.qs('#fs-fs', app).onclick = toggleBrowserFullscreen;
    U.qs('#fs-exit', app).onclick = function () {
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
      try { window.close(); } catch (e) {}
      // 兜底：若浏览器不允许脚本关闭（非脚本打开的窗口），则退回主系统登录页
      setTimeout(function () { if (!window.closed) location.href = location.pathname; }, 200);
    };
    document.addEventListener('fullscreenchange', function () {
      var b = document.getElementById('fs-fs');
      if (b) b.classList.toggle('on', !!(document.fullscreenElement || document.webkitFullscreenElement));
    });
    document.addEventListener('webkitfullscreenchange', function () {
      var b = document.getElementById('fs-fs');
      if (b) b.classList.toggle('on', !!(document.fullscreenElement || document.webkitFullscreenElement));
    });
    // 主系统数据 / 主题变更时，自动同步刷新大屏
    window.addEventListener('storage', function (e) {
      if (e.key === THEME_KEY) {
        applyThemeToDoc();
        updateThemeBtn();
      } else {
        onStorageChanged();
      }
    });

    startClock();
    updateThemeBtn();
    await renderStage();
    return true;
  }

  window.Fullscreen = {
    open: openKiosk,
    maybeRenderKiosk: maybeRenderKiosk,
    kind: fsKind
  };
})();
