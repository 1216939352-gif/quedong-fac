/*
 * 实时排版布局编辑器（LayoutEditor）
 * 作用：可视化拖动滑块实时调整全站字号/间距/行高/圆角/字体族，所见即所得；
 *       - 按 location.hash 分别保存每页预设（切页自动套用）；
 *       - 一键导出 :root CSS 片段，方便定稿回源码；
 *       - 不改任何业务代码与现有 css，仅注入 <style id="le-override"> 覆盖根变量。
 *
 * 设计说明：真实 styles.css 的字号/间距为固定值（不引用 --k），故本编辑器按基准令牌
 * 乘以系数后"计算注入"覆盖值，可逆、可还原。基准值与 styles.css:63-94 保持一致。
 */
(function () {
  'use strict';

  var STORE = 'quedong_layout_presets_v1';
  var GLOBAL = '__global__';

  // 基准令牌（与 styles.css :root 一致）
  var FS = { xs: 12, sm: 13, base: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 34, '4xl': 42 };
  var LH = { xs: 1.5, sm: 1.55, base: 1.6, md: 1.6, lg: 1.5, xl: 1.4, '2xl': 1.3, '3xl': 1.2, '4xl': 1.12 };
  var SP = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };
  var RAD = { 'sm': 6, '': 10, 'lg': 16, 'xl': 24 };
  var FONTS = {
    yahei: "'Microsoft YaHei', 'PingFang SC', sans-serif",
    song: "'Songti SC', 'SimSun', serif"
  };

  function def() { return { k: 1, gap: 1, lh: 1.6, radius: 10, font: 'system' }; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function loadAll() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function saveAll(o) { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (e) {} }
  var presets = loadAll();

  function scope() { var h = location.hash || '#/home'; return h.split('?')[0]; }

  // 优先级：当前 hash 专属 > 全局默认 > 出厂默认
  function get() {
    var k = scope();
    var p = presets[k] || presets[GLOBAL];
    return Object.assign(def(), p || {});
  }
  function setCurrent(p) { presets[scope()] = p; saveAll(presets); }
  function setGlobal(p) { presets[GLOBAL] = p; saveAll(presets); }

  // 根据参数生成 :root 覆盖样式
  function buildCSS(p) {
    var L = [':root{'];
    var i;
    L.push('  --k: ' + r2(p.k) + ';');
    for (i in FS) { L.push('  --fs-' + i + ': ' + r2(FS[i] * p.k) + 'px;'); }
    var ls = p.lh / 1.6;
    for (i in LH) { L.push('  --lh-' + i + ': ' + r2(LH[i] * ls) + ';'); }
    for (i in SP) { L.push('  --space-' + i + ': ' + r2(SP[i] * p.gap) + 'px;'); }
    var rs = p.radius / 10;
    for (i in RAD) { var nm = i ? ('-' + i) : ''; L.push('  --radius' + nm + ': ' + r2(RAD[i] * rs) + 'px;'); }
    if (p.font && p.font !== 'system' && FONTS[p.font]) { L.push('  --font-sans: ' + FONTS[p.font] + ';'); }
    L.push('}');
    return L.join('\n');
  }

  function apply(p) {
    var el = document.getElementById('le-override');
    if (!el) { el = document.createElement('style'); el.id = 'le-override'; document.head.appendChild(el); }
    el.textContent = buildCSS(p);
  }

  // ---------- UI ----------
  var panel, fab, cur = get();

  var STYLE = '' +
    '.le-fab{position:fixed;left:20px;bottom:20px;width:48px;height:48px;border-radius:14px;' +
    'background:var(--primary,#f26522);color:#fff;font-size:18px;font-weight:700;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:1200;' +
    'box-shadow:0 10px 26px -6px rgba(0,0,0,.35);border:none;font-family:var(--font-sans);}' +
    '.le-fab:hover{transform:scale(1.06);}' +
    '.le-panel{position:fixed;top:0;right:0;height:100vh;width:340px;max-width:92vw;' +
    'background:var(--bg-card,#fff);border-left:1px solid var(--border-color,#e2e8f0);' +
    'box-shadow:-10px 0 30px -12px rgba(0,0,0,.2);z-index:1201;transform:translateX(100%);' +
    'transition:transform .25s ease;padding:18px;overflow-y:auto;font-family:var(--font-sans);' +
    'box-sizing:border-box;}' +
    '.le-panel.open{transform:translateX(0);}' +
    '.le-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}' +
    '.le-title{font-size:15px;font-weight:600;color:var(--text-primary,#0f172a);}' +
    '.le-x{background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted,#94a3b8);line-height:1;}' +
    '.le-scope{font-size:12px;color:var(--text-muted,#94a3b8);margin-bottom:14px;}' +
    '.le-scope code{background:var(--bg-hover,#f1f5f9);padding:2px 6px;border-radius:6px;}' +
    '.le-group{margin-bottom:16px;}' +
    '.le-group label{display:block;font-size:13px;color:var(--text-secondary,#475569);margin-bottom:6px;}' +
    '.le-group label b{color:var(--primary,#f26522);}' +
    '.le-group input[type=range]{width:100%;}' +
    '.le-group select{width:100%;padding:7px;border:1px solid var(--border-color,#e2e8f0);' +
    'border-radius:8px;font-size:13px;background:var(--bg-input,#fff);color:var(--text-primary,#0f172a);}' +
    '.le-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px;}' +
    '.le-actions button{flex:1;min-width:88px;padding:8px 6px;font-size:12px;' +
    'border:1px solid var(--border-color,#e2e8f0);border-radius:8px;background:var(--bg-hover,#f1f5f9);' +
    'color:var(--text-primary,#0f172a);cursor:pointer;font-family:var(--font-sans);}' +
    '.le-actions button:hover{background:var(--primary,#f26522);color:#fff;border-color:var(--primary,#f26522);}' +
    '#le-out{width:100%;height:120px;box-sizing:border-box;font-size:11px;font-family:var(--font-mono,monospace);' +
    'padding:8px;border:1px solid var(--border-color,#e2e8f0);border-radius:8px;' +
    'color:var(--text-secondary,#475569);resize:vertical;}' +
    '.le-toast{position:fixed;left:20px;bottom:78px;background:rgba(15,23,42,.92);color:#fff;' +
    'padding:8px 14px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;' +
    'pointer-events:none;z-index:1300;font-family:var(--font-sans);}' +
    '.le-toast.show{opacity:1;}';

  var HTML = '' +
    '<div class="le-fab" id="le-fab" title="排版布局编辑器">Aa</div>' +
    '<div class="le-panel" id="le-panel">' +
    '  <div class="le-head"><span class="le-title">排版布局编辑器</span>' +
    '    <button class="le-x" id="le-x" title="关闭">×</button></div>' +
    '  <div class="le-scope">当前页面：<code id="le-scope">#/home</code>（预设独立保存）</div>' +
    '  <div class="le-group"><label>整体字号系数 <b id="le-k-v">1.00</b>×</label>' +
    '    <input type="range" id="le-k" min="0.8" max="1.4" step="0.05"></div>' +
    '  <div class="le-group"><label>间距比例 <b id="le-gap-v">1.00</b>（紧凑←→宽松）</label>' +
    '    <input type="range" id="le-gap" min="0.7" max="1.4" step="0.05"></div>' +
    '  <div class="le-group"><label>正文行高 <b id="le-lh-v">1.60</b></label>' +
    '    <input type="range" id="le-lh" min="1.4" max="1.9" step="0.05"></div>' +
    '  <div class="le-group"><label>圆角 <b id="le-radius-v">10</b>px</label>' +
    '    <input type="range" id="le-radius" min="4" max="24" step="1"></div>' +
    '  <div class="le-group"><label>字体族</label>' +
    '    <select id="le-font"><option value="system">系统默认</option>' +
    '      <option value="yahei">微软雅黑</option>' +
    '      <option value="song">宋体</option></select></div>' +
    '  <div class="le-actions">' +
    '    <button id="le-reset">重置本页</button>' +
    '    <button id="le-global">存为全局默认</button>' +
    '    <button id="le-export">导出 CSS</button></div>' +
    '  <textarea id="le-out" readonly placeholder="点「导出 CSS」生成可复制的 :root 片段"></textarea>' +
    '</div>' +
    '<div class="le-toast" id="le-toast"></div>';

  function build() {
    var st = document.createElement('style'); st.id = 'le-styles'; st.textContent = STYLE;
    document.head.appendChild(st);
    var wrap = document.createElement('div'); wrap.innerHTML = HTML;
    document.body.appendChild(wrap);
    fab = document.getElementById('le-fab');
    panel = document.getElementById('le-panel');
    fab.addEventListener('click', function () { panel.classList.toggle('open'); });
    document.getElementById('le-x').addEventListener('click', function () { panel.classList.remove('open'); });
    bind('le-k', 'k'); bind('le-gap', 'gap'); bind('le-lh', 'lh'); bind('le-radius', 'radius');
    document.getElementById('le-font').addEventListener('change', function () { cur.font = this.value; commit(); });
    document.getElementById('le-reset').addEventListener('click', function () {
      delete presets[scope()]; saveAll(presets); cur = get(); apply(cur); sync(); toast('已重置本页');
    });
    document.getElementById('le-global').addEventListener('click', function () {
      setGlobal(cur); toast('已存为全局默认（新页面将套用）');
    });
    document.getElementById('le-export').addEventListener('click', exportCSS);
    document.getElementById('le-scope').textContent = scope();
  }

  function bind(id, key) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () { cur[key] = parseFloat(this.value); commit(); });
  }
  function commit() { setCurrent(cur); apply(cur); syncLabels(); }
  function sync() {
    var p = get(); cur = p;
    document.getElementById('le-k').value = p.k;
    document.getElementById('le-gap').value = p.gap;
    document.getElementById('le-lh').value = p.lh;
    document.getElementById('le-radius').value = p.radius;
    document.getElementById('le-font').value = p.font;
    syncLabels();
  }
  function syncLabels() {
    document.getElementById('le-k-v').textContent = r2(cur.k).toFixed(2);
    document.getElementById('le-gap-v').textContent = r2(cur.gap).toFixed(2);
    document.getElementById('le-lh-v').textContent = r2(cur.lh).toFixed(2);
    document.getElementById('le-radius-v').textContent = Math.round(cur.radius);
  }

  function exportCSS() {
    var ta = document.getElementById('le-out');
    ta.value = buildCSS(cur);
    ta.focus(); ta.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ta.value).then(
        function () { toast('CSS 已复制到剪贴板'); },
        function () { toast('已生成，请手动复制'); }
      );
    } else { toast('已生成，请手动复制'); }
  }

  function toast(msg) {
    var t = document.getElementById('le-toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  function onRoute() {
    cur = get(); apply(cur);
    if (panel) { document.getElementById('le-scope').textContent = scope(); sync(); }
  }

  function init() {
    if (document.getElementById('le-fab')) return;
    build();
    cur = get(); apply(cur); sync();
    window.addEventListener('hashchange', onRoute);
  }

  window.LayoutEditor = { init: init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
