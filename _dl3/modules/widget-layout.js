/* modules/widget-layout.js — 页面组件编辑器（widget layout engine）
 * 能力：每页组件注册表 + 按页布局模型 + 网格渲染(半宽/全宽) + 编辑器浮层(增/删/隐/排/改尺寸/自定义卡片) + 本地持久化
 * 零侵入业务代码：组件仅渲染 HTML 片段；删除=隐藏(可恢复)；布局存浏览器本地、按页分别保存
 * 还原基线(_dl3.snapshot-restore-base)不包含本文件；若本编辑器效果不好，可回退该基线
 */
(function () {
  if (window.WidgetLayout) return;
  var U = window.U;

  /* ============ 组件注册表（内置，只读；自定义卡片以布局实例存在，不进注册表） ============ */
  var BUILTINS = {
    'today-todo-sarc': {
      title: '今日待办（接入代办）', icon: '📌',
      render: function () {
        try {
          var all = (window.SarcDB && window.SarcDB.list) ? window.SarcDB.list() : [];
          var html = (window.TodayTodo && window.TodayTodo.renderSarcCard)
            ? window.TodayTodo.renderSarcCard(window.TodayTodo.buildSarc(all), {}) : '（组件不可用）';
          return '<div class="card wl-inner"><div class="card-body">' + html + '</div></div>';
        } catch (e) { return '<div class="card"><div class="card-body">今日待办加载失败</div></div>'; }
      }
    },
    'report-center': {
      title: '报告中心', icon: '📑',
      render: function () {
        return '<div class="card wl-inner"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">📑</span>报告中心</h3></div>'
          + '<div class="card-body"><p style="margin:0 0 10px;color:var(--text-muted)">查看与管理各单元生成的系统报告。</p>'
          + '<a class="btn btn-primary btn-sm" href="#/report-center">前往报告中心 →</a></div></div>';
      }
    },
    'follow-up': {
      title: '复诊追踪', icon: '⏰',
      render: function () {
        try {
          var D = window.SarcDB; if (!D) return '<div class="card"><div class="card-body">数据不可用</div></div>';
          var patients = (D.listPatients ? D.listPatients() : []) || [];
          var rows = [];
          patients.forEach(function (p) {
            var recs = (D.listByPatient ? D.listByPatient(p.id) : []).slice().sort(function (a, b) { return new Date(b.assessDate || 0) - new Date(a.assessDate || 0); });
            var latest = recs[0];
            if (latest && latest.result && latest.result.plan && latest.result.plan.reviewDate) {
              var days = (window.U && U.daysBetween) ? U.daysBetween(latest.result.plan.reviewDate, new Date()) : 0;
              if (days <= 30) rows.push({ name: p.name, date: latest.result.plan.reviewDate, days: days });
            }
          });
          if (!rows.length) return '<div class="card wl-inner"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>复诊追踪</h3></div>'
            + '<div class="card-body"><p style="margin:0 0 10px;color:var(--text-muted)">暂无临期复查登记人。</p>'
            + '<a class="btn btn-sm" href="#/sarcopenia-stats">随访看板 →</a></div></div>';
          var body = rows.map(function (r) { return '<tr><td>' + U.esc(r.name) + '</td><td>' + U.esc(r.date) + '</td><td>' + r.days + ' 天</td></tr>'; }).join('');
          return '<div class="card wl-inner"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>复诊追踪</h3><span class="badge badge-warning">' + rows.length + ' 位临期</span></div>'
            + '<div class="card-body"><div class="table-wrap"><table><thead><tr><th>登记人</th><th>建议复查</th><th>剩余</th></tr></thead><tbody>' + body + '</tbody></table></div>'
            + '<a class="btn btn-sm btn-primary" href="#/sarcopenia-stats" style="margin-top:8px">随访看板 →</a></div></div>';
        } catch (e) { return '<div class="card"><div class="card-body">复诊追踪加载失败</div></div>'; }
      }
    }
  };

  var DEFAULTS = {
    'sarcopenia-ledger': [
      { wid: 'w_todo', key: 'today-todo-sarc', title: '今日待办（接入代办）', size: 'half', visible: true },
      { wid: 'w_report', key: 'report-center', title: '报告中心', size: 'half', visible: true },
      { wid: 'w_follow', key: 'follow-up', title: '复诊追踪', size: 'half', visible: true }
    ]
  };

  function sk(pageKey) { return 'quedong_widget_layout_v1::' + pageKey; }
  function load(pageKey) { try { return JSON.parse(window.localStorage.getItem(sk(pageKey)) || 'null'); } catch (e) { return null; } }
  function save(pageKey, arr) { try { window.localStorage.setItem(sk(pageKey), JSON.stringify(arr)); } catch (e) {} }

  function getLayout(pageKey) {
    var s = load(pageKey);
    if (Array.isArray(s)) return s;
    var d = DEFAULTS[pageKey];
    return d ? JSON.parse(JSON.stringify(d)) : [];
  }

  var currentPage = null;
  var panelOpen = false;

  function injectStyle() {
    if (document.getElementById('wl-style')) return;
    var css = ''
      + '.wl-dock{margin-top:14px;}'
      + '.wl-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;align-items:start;}'
      + '.wl-size-full{grid-column:1/-1;}' + '.wl-size-half{grid-column:span 1;}'
      + '.wl-card{background:var(--card-bg,#fff);border:1px solid var(--border-color,#e6ebf1);border-radius:var(--radius-lg,12px);overflow:hidden;display:flex;flex-direction:column;}'
      + '.wl-card-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border-color,#eef1f5);font-size:13px;font-weight:600;color:var(--text-strong,#1f2d3d);}'
      + '.wl-card-ico{font-size:15px;}' + '.wl-card-title{flex:1;}' + '.wl-card-size{font-size:11px;color:var(--text-muted,#8a97a6);font-weight:400;}'
      + '.wl-card-body{padding:0;}' + '.wl-inner{margin:0;border:none;border-radius:0;}'
      + '.wl-hidden-tray{margin-top:10px;padding:8px 12px;background:#f6f8fb;border:1px dashed #d3d9e2;border-radius:10px;font-size:12px;color:#5b6b7d;display:flex;flex-wrap:wrap;gap:8px;align-items:center;}'
      + '.wl-hidden-tray button{font-size:12px;}'
      + '@media (max-width:760px){.wl-grid{grid-template-columns:1fr;}.wl-size-half,.wl-size-full{grid-column:1/-1;}}'
      + '#wl-fab{position:fixed;right:16px;top:72px;z-index:1200;width:44px;height:44px;border-radius:12px;border:none;background:#534AB7;color:#fff;font-size:18px;cursor:pointer;box-shadow:0 4px 14px rgba(83,74,183,.35);}'
      + '#wl-fab:hover{background:#3C3489;}'
      + '#wl-panel{position:fixed;right:16px;top:124px;width:320px;max-height:78vh;overflow:auto;z-index:1200;background:#fff;border:1px solid #e2e7ef;border-radius:14px;box-shadow:0 12px 40px rgba(20,30,50,.18);padding:14px;font-size:13px;}'
      + '.wl-p-h{font-weight:700;font-size:14px;margin-bottom:4px;}' + '.wl-p-sub{color:#8a97a6;font-size:12px;margin-bottom:10px;}'
      + '.wl-row{display:flex;align-items:center;gap:6px;padding:7px 0;border-top:1px solid #f0f2f6;}' + '.wl-row:first-of-type{border-top:none;}'
      + '.wl-row .wl-r-name{flex:1;font-size:13px;}' + '.wl-row .wl-r-name .off{color:#b3bcc8;text-decoration:line-through;}'
      + '.wl-row button{font-size:12px;padding:3px 7px;border-radius:7px;border:1px solid #dde3ec;background:#f7f9fc;cursor:pointer;}'
      + '.wl-add{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}' + '.wl-add button{font-size:12px;padding:5px 9px;border-radius:8px;border:1px solid #534AB7;background:#fff;color:#534AB7;cursor:pointer;}'
      + '.wl-act{display:flex;gap:6px;margin-top:10px;}' + '.wl-act button{font-size:12px;padding:5px 9px;border-radius:8px;border:1px solid #dde3ec;background:#f7f9fc;cursor:pointer;}';
    var st = document.createElement('style'); st.id = 'wl-style'; st.textContent = css; document.head.appendChild(st);
  }

  function renderGrid(layout, pageKey) {
    var vis = layout.filter(function (it) { return it.visible; });
    var hid = layout.filter(function (it) { return !it.visible; });
    var cards = vis.map(function (it) {
      var def = BUILTINS[it.key];
      var icon = (def && def.icon) || (it.key === '__custom__' ? '✦' : '▦');
      var body = '';
      try { body = def ? def.render() : (it.custom ? it.custom.html : ''); } catch (e) { body = '<div class="card-body">渲染失败</div>'; }
      return '<section class="wl-card wl-size-' + (it.size || 'half') + '" data-wid="' + it.wid + '">'
        + '<div class="wl-card-head"><span class="wl-card-ico">' + icon + '</span><span class="wl-card-title">' + U.esc(it.title || it.key) + '</span>'
        + '<span class="wl-card-size">' + (it.size === 'full' ? '全宽' : '半宽') + '</span></div>'
        + '<div class="wl-card-body">' + body + '</div></section>';
    }).join('');
    var tray = hid.length ? '<div class="wl-hidden-tray"><span>已隐藏 ' + hid.length + ' 个组件：</span>'
      + hid.map(function (it) { return '<button data-recover="' + it.wid + '">＋ ' + U.esc(it.title || it.key) + '</button>'; }).join('') + '</div>' : '';
    return '<div class="wl-grid">' + cards + '</div>' + tray;
  }

  function mount(pageKey, sel) {
    var host = U && U.qs ? U.qs(sel) : document.querySelector(sel);
    if (!host) return;
    currentPage = pageKey;
    injectStyle();
    var layout = getLayout(pageKey);
    host.classList.add('wl-dock');
    host.innerHTML = renderGrid(layout, pageKey);
    host.addEventListener('click', function (e) {
      var rb = e.target.closest('[data-recover]');
      if (rb) { var wid = rb.getAttribute('data-recover'); setVisible(pageKey, wid, true); }
    });
    ensureFab();
  }

  function persist(pageKey, layout) { save(pageKey, layout); var host = U.qs('#wl-dock'); if (host) host.innerHTML = renderGrid(layout, pageKey); if (panelOpen) renderPanel(); }

  function find(pageKey, wid) { var l = getLayout(pageKey); return { l: l, i: l.findIndex(function (x) { return x.wid === wid; }) }; }

  function setVisible(pageKey, wid, v) { var o = find(pageKey, wid); if (o.i >= 0) { o.l[o.i].visible = v; persist(pageKey, o.l); } }
  function cycleSize(pageKey, wid) { var o = find(pageKey, wid); if (o.i >= 0) { o.l[o.i].size = (o.l[o.i].size === 'full') ? 'half' : 'full'; persist(pageKey, o.l); } }
  function move(pageKey, wid, dir) {
    var o = find(pageKey, wid); if (o.i < 0) return;
    var j = o.i + dir; if (j < 0 || j >= o.l.length) return;
    var t = o.l[o.i]; o.l[o.i] = o.l[j]; o.l[j] = t; persist(pageKey, o.l);
  }
  function addBuiltin(pageKey, key) {
    var def = BUILTINS[key]; if (!def) return;
    var l = getLayout(pageKey);
    var ex = l.find(function (x) { return x.key === key; });
    if (ex) { if (!ex.visible) { ex.visible = true; persist(pageKey, l); } else { U.toast('该组件已在页面中', 'warning'); } return; }
    l.push({ wid: 'w_' + key + '_' + Date.now().toString(36), key: key, title: def.title, size: 'half', visible: true });
    persist(pageKey, l);
  }
  function addCustom(pageKey) {
    var l = getLayout(pageKey);
    var item = { wid: 'c_' + Date.now().toString(36), key: '__custom__', title: '自定义卡片', size: 'half', visible: true, custom: { html: '<p style="padding:14px;margin:0;color:var(--text-muted)">自定义内容（点编辑器「编辑」修改文字 / 图表）。</p>' } };
    l.push(item); persist(pageKey, l); editCustom(pageKey, item.wid);
  }
  function editCustom(pageKey, wid) {
    var o = find(pageKey, wid); if (o.i < 0) return; var it = o.l[o.i];
    var html = '<div style="font-size:14px"><div class="form-group"><label>卡片标题</label><input type="text" id="wl-c-title" value="' + U.esc(it.title || '') + '" class="form-control"></div>'
      + '<div class="form-group" style="margin-top:10px"><label>卡片内容（支持 HTML）</label><textarea id="wl-c-html" rows="6" class="form-control" style="width:100%;font-family:monospace;font-size:12px">' + U.esc((it.custom && it.custom.html) || '') + '</textarea></div></div>';
    U.modal({
      title: '编辑自定义卡片', body: html, width: 620,
      footer: '<button class="btn btn-ghost" data-act="cancel">取消</button><button class="btn btn-primary" data-act="save">保存</button>',
      onMount: function (ov, close) {
        ov.querySelector('[data-act=save]').onclick = function () {
          it.title = ov.querySelector('#wl-c-title').value || '自定义卡片';
          it.custom = { html: ov.querySelector('#wl-c-html').value };
          persist(pageKey, o.l); close();
        };
      }
    });
  }
  function resetPage(pageKey) { save(pageKey, JSON.parse(JSON.stringify(DEFAULTS[pageKey] || []))); var host = U.qs('#wl-dock'); if (host) host.innerHTML = renderGrid(getLayout(pageKey), pageKey); if (panelOpen) renderPanel(); U.toast('已重置本页布局', 'success'); }
  function exportLayout(pageKey) {
    var l = getLayout(pageKey);
    var txt = JSON.stringify({ page: pageKey, layout: l }, null, 2);
    try { if (navigator.clipboard) navigator.clipboard.writeText(txt); } catch (e) {}
    U.modal({ title: '本页布局 JSON（已复制）', body: '<pre style="font-size:11px;white-space:pre-wrap;max-height:50vh;overflow:auto;margin:0">' + U.esc(txt) + '</pre>', width: 560, footer: '<button class="btn btn-primary" data-act="ok">好的</button>' });
  }

  function ensureFab() {
    if (document.getElementById('wl-fab')) return;
    var fab = document.createElement('button'); fab.id = 'wl-fab'; fab.type = 'button'; fab.title = '编辑页面卡片'; fab.textContent = '🧩';
    fab.onclick = function () { panelOpen = !panelOpen; var p = document.getElementById('wl-panel'); if (p) p.style.display = panelOpen ? 'block' : 'none'; if (panelOpen) renderPanel(); };
    document.body.appendChild(fab);
    var panel = document.createElement('div'); panel.id = 'wl-panel'; panel.style.display = 'none';
    document.body.appendChild(panel);
  }

  function renderPanel() {
    var panel = document.getElementById('wl-panel'); if (!panel || !currentPage) return;
    var pageKey = currentPage; var l = getLayout(pageKey);
    var rows = l.map(function (it, idx) {
      var def = BUILTINS[it.key];
      var nm = '<span class="' + (it.visible ? '' : 'off') + '">' + U.esc(it.title || it.key) + '</span>';
      var ctrl = '';
      ctrl += '<button data-vis="' + it.wid + '">' + (it.visible ? '隐藏' : '显示') + '</button>';
      ctrl += '<button data-up="' + it.wid + '">↑</button><button data-down="' + it.wid + '">↓</button>';
      ctrl += '<button data-size="' + it.wid + '">' + (it.size === 'full' ? '改半宽' : '改全宽') + '</button>';
      if (it.key === '__custom__') ctrl += '<button data-edit="' + it.wid + '">编辑</button>';
      return '<div class="wl-row"><span class="wl-r-name">' + (idx + 1) + '. ' + nm + '</span>' + ctrl + '</div>';
    }).join('');
    var addBtns = Object.keys(BUILTINS).map(function (k) { return '<button data-add="' + k + '">＋ ' + BUILTINS[k].title + '</button>'; }).join('');
    panel.innerHTML = '<div class="wl-p-h">编辑页面卡片</div><div class="wl-p-sub">当前页：' + pageKey + '（布局按页保存于本地）</div>'
      + rows
      + '<div class="wl-add"><button data-add-custom="1">＋ 自定义卡片</button>' + addBtns + '</div>'
      + '<div class="wl-act"><button data-reset="1">重置本页</button><button data-export="1">导出 JSON</button></div>';
    panel.onclick = function (e) {
      var t = e.target; if (!t.getAttribute) return;
      var wid = t.getAttribute('data-vis') || t.getAttribute('data-up') || t.getAttribute('data-down') || t.getAttribute('data-size') || t.getAttribute('data-edit');
      if (t.hasAttribute('data-vis')) { var cur = getLayout(pageKey).find(function (x) { return x.wid === wid; }); setVisible(pageKey, wid, !(cur && cur.visible)); }
      else if (t.hasAttribute('data-up')) move(pageKey, wid, -1);
      else if (t.hasAttribute('data-down')) move(pageKey, wid, 1);
      else if (t.hasAttribute('data-size')) cycleSize(pageKey, wid);
      else if (t.hasAttribute('data-edit')) editCustom(pageKey, wid);
      else if (t.hasAttribute('data-add')) addBuiltin(pageKey, t.getAttribute('data-add'));
      else if (t.hasAttribute('data-add-custom')) addCustom(pageKey);
      else if (t.hasAttribute('data-reset')) resetPage(pageKey);
      else if (t.hasAttribute('data-export')) exportLayout(pageKey);
    };
  }

  window.WidgetLayout = { mount: mount, BUILTINS: BUILTINS, _get: getLayout };
})();
