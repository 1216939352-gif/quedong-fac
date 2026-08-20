/**
 * 鹊动FAC功能评估与干预系统 - 报告管理中心（跨单元聚合版）
 * 覆盖三大单元：肌少症 / 体重管理 / 脊柱健康
 * 以患者为分类与检索依据；每份报告支持：预览 / 导出 / 打印 / 删除 / 二次编辑。
 * 数据来源：肌少症与脊柱共享 window.SarcDB（按 module 区分）；体重管理来自 window.DB（患者档案 data）。
 * 复用既有报告渲染器：buildSarcReport / buildSpineReport / buildReportDoc，打印复用 window.printReportHTML。
 */
(function () {
  'use strict';

  var UNITS = [
    { key: 'all', label: '全部', icon: '🗂️' },
    { key: 'sarcopenia', label: '肌少症', icon: '🧓' },
    { key: 'weight', label: '体重管理', icon: '⚖️' },
    { key: 'spine', label: '脊柱健康', icon: '🦴' },
    { key: 'muscle', label: '肌力报告解读', icon: '💪' }
  ];

  function num(v) { var x = parseFloat(v); return isFinite(x) ? x : null; }

  /* —— 肌力报告解读复合页（等速 + 等张同屏） —— */
  function muscleCtx() {
    return {
      patient: AppState.patient || {},
      assessment: AppState.assessment || {},
      lifeSurvey: AppState.lifeSurvey || {},
      plan: AppState.plan || {},
      isokineticData: AppState.isokineticData || [],
      isotonicData: AppState.isotonicData || [],
      config: AppState.config || {},
      systemTitle: (AppState.config && AppState.config.systemTitle) || ''
    };
  }
  function muscleBodyHTML(ctx, scope) {
    try {
      if (window.buildReportDoc) return window.buildReportDoc(ctx, scope);
    } catch (e) { console.warn('肌力报告渲染失败', e); }
    return '<div class="alert alert-warning">报告渲染器未就绪</div>';
  }
  function musclePatientOptions() {
    try {
      var api = window.CenterAPI;
      var patients = api ? (api.loadAll() || []) : [];
      var cur = (AppState.patient || {}).id;
      return patients.map(function (p) {
        var name = p.patientName || (p.data && p.data.patient && p.data.patient.name) || '未命名';
        var sel = (cur && p.id === cur) ? ' selected' : '';
        return '<option value="' + U.esc(p.id) + '"' + sel + '>' + U.esc(name) + '</option>';
      }).join('');
    } catch (e) { return ''; }
  }
  function musclePageHTML() {
    var ctx = muscleCtx();
    var curName = (ctx.patient || {}).name || '未选择患者';
    return '<div class="rc-muscle-page">' +
      '<div class="page-header no-print rc-muscle-header">' +
        '<div><h2 class="page-title">💪 肌力报告解读</h2>' +
        '<p class="text-muted">等速与等张肌力报告同屏查看 · 选择患者后自动加载两项报告</p></div>' +
        '<div class="topbar-actions no-print">' +
          '<button class="btn btn-primary" onclick="window.printMuscleComboReport()">🖨️ 打印 / 导出 PDF</button>' +
        '</div>' +
      '</div>' +
      '<div class="card no-print">' +
        '<div class="card-body">' +
          '<div class="form-row" style="align-items:flex-end;">' +
            '<div class="form-group" style="flex:1;min-width:240px;">' +
              '<label>选择患者</label>' +
              '<select id="muscle-rep-pick" onchange="window.loadMuscleComboPatient(this.value)">' +
                '<option value="">— 选择患者查看报告 —</option>' +
                musclePatientOptions() +
              '</select>' +
            '</div>' +
            '<div class="form-group" style="font-size:12px;color:var(--text-muted);">' +
              '当前：<span id="muscle-rep-cur">' + U.esc(curName) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rc-muscle-grid">' +
        '<div class="rc-muscle-col">' +
          '<div class="rc-muscle-col-title">⚙️ 等速肌力报告解读</div>' +
          '<div id="muscle-iso-body">' + muscleBodyHTML(ctx, 'isokinetic') + '</div>' +
        '</div>' +
        '<div class="rc-muscle-col">' +
          '<div class="rc-muscle-col-title">🏋️ 等张肌力报告解读</div>' +
          '<div id="muscle-iot-body">' + muscleBodyHTML(ctx, 'isotonic') + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  function bindMusclePage() {
    // select 通过 onchange 直接驱动；如未来需要初始化图表可在此扩展
  }
  window.loadMuscleComboPatient = async function (id) {
    if (!id) return;
    try {
      await loadPatientContext(id);
      var ctx = muscleCtx();
      var isoBody = U.qs('#muscle-iso-body');
      var iotBody = U.qs('#muscle-iot-body');
      var curLabel = U.qs('#muscle-rep-cur');
      if (isoBody) isoBody.innerHTML = muscleBodyHTML(ctx, 'isokinetic');
      if (iotBody) iotBody.innerHTML = muscleBodyHTML(ctx, 'isotonic');
      if (curLabel) curLabel.textContent = (ctx.patient || {}).name || '未命名';
      U.toast('已加载患者肌力报告', 'success');
    } catch (e) {
      console.error(e);
      U.toast('加载患者失败：' + (e.message || e), 'error');
    }
  };
  window.printMuscleComboReport = async function () {
    var iso = U.qs('#muscle-iso-body');
    var iot = U.qs('#muscle-iot-body');
    if (!iso || !iot) return;
    var html = '<div class="rc-muscle-print"><h2>肌力报告解读</h2>' +
      '<h3>等速肌力报告解读</h3>' + iso.innerHTML +
      '<h3>等张肌力报告解读</h3>' + iot.innerHTML + '</div>';
    try {
      var qb = await window.Share.buildPlanQrBlock({ mode: 'report', scope: 'muscle' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    if (window.printReportHTML) window.printReportHTML(html);
  };

  /* —— 数据聚合 —— */
  function weightReports() {
    if (!window.DB || !DB.getPatients) return [];
    try {
      return DB.getPatients().filter(function (p) {
        var d = p.data || {};
        return !!(d.assessment || (d.plan && d.plan.nutrition) || d.lifestyle);
      }).map(function (p) {
        var d = p.data || {};
        var name = (d.patient && d.patient.name) || p.patientName || '未命名';
        var pat = d.patient || {};
        return {
          unit: 'weight', unitLabel: '体重管理', id: p.id, patientId: p.id,
          name: name, gender: pat.gender || '', age: pat.age != null ? pat.age : '',
          date: p.updatedAt || p.createdAt || '', kind: '体重管理综合报告', payload: p
        };
      });
    } catch (e) { return []; }
  }

  function sarcReports(moduleFilter) {
    if (!window.SarcDB) return [];
    try {
      return SarcDB.list().filter(function (r) {
        var isSpine = r.module === 'spine';
        return moduleFilter === 'spine' ? isSpine : (!isSpine);
      }).map(function (r) {
        var p = (SarcDB.getPatient && SarcDB.getPatient(r.patientId)) || {};
        var name = r.name || p.name || '未命名';
        return {
          unit: moduleFilter === 'spine' ? 'spine' : 'sarcopenia',
          unitLabel: moduleFilter === 'spine' ? '脊柱健康' : '肌少症',
          id: r.id, patientId: r.patientId,
          name: name, gender: r.gender || p.gender || '', age: r.age != null ? r.age : (p.age || ''),
          date: r.assessDate || r.updatedAt || '',
          kind: moduleFilter === 'spine' ? '脊柱健康评估报告' : '肌少症评估报告', payload: r
        };
      });
    } catch (e) { return []; }
  }

  function collect(unitKey) {
    var all = [];
    if (unitKey === 'all' || unitKey === 'weight') all = all.concat(weightReports());
    if (unitKey === 'all' || unitKey === 'sarcopenia') all = all.concat(sarcReports('sarcopenia'));
    if (unitKey === 'all' || unitKey === 'spine') all = all.concat(sarcReports('spine'));
    return all;
  }

  function groupByPatient(list) {
    var map = {};
    list.forEach(function (r) {
      if (!r.patientId) return;
      if (!map[r.patientId]) map[r.patientId] = { pid: r.patientId, name: r.name, gender: r.gender, age: r.age, items: [] };
      map[r.patientId].items.push(r);
    });
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return (a.name || '').localeCompare(b.name || '', 'zh');
    });
  }

  /* —— 报告渲染 —— */
  function reportHTML(item) {
    try {
      if (item.unit === 'sarcopenia' && window.buildSarcReport) return window.buildSarcReport(item.payload);
      if (item.unit === 'spine' && window.buildSpineReport) return window.buildSpineReport(item.payload);
      if (item.unit === 'weight' && window.buildReportDoc) {
        var d = (item.payload && item.payload.data) || {};
        var ctx = {
          patient: d.patient || {}, assessment: d.assessment || {}, lifeSurvey: d.lifeSurvey || {},
          plan: d.plan || {}, isokineticData: d.isokineticData || [], isotonicData: d.isotonicData || [],
          config: AppState.config || {}, systemTitle: (AppState.config && AppState.config.systemTitle) || ''
        };
        return window.buildReportDoc(ctx, 'full');
      }
    } catch (e) { console.warn('报告渲染失败', e); }
    return '<div class="alert alert-warning">该报告暂无法预览</div>';
  }

  function exportPayload(item) {
    if (item.unit === 'weight') {
      var d = (item.payload && item.payload.data) || {};
      return { module: 'weight', patientId: item.patientId, name: item.name,
        assessment: d.assessment || {}, plan: d.plan || {}, lifestyle: d.lifestyle || {},
        exportedAt: new Date().toISOString() };
    }
    return item.payload;
  }

  /* —— 删除 / 二次编辑 —— */
  function deleteReport(item, done) {
    U.confirm('确认删除该报告？此操作不可撤销。', function () {
      try {
        if (item.unit === 'weight') {
          DB.updatePatient(item.patientId, { assessment: {}, plan: {}, lifestyle: {} });
        } else if (window.SarcDB) {
          SarcDB.remove(item.id);
        }
        U.toast('已删除报告', 'success');
        done();
      } catch (e) { U.toast('删除失败：' + e.message, 'error'); }
    }, { title: '删除报告', heading: '确认删除「' + U.esc(item.name) + '」的' + item.kind + '？', okText: '删除' });
  }

  function reEdit(item) {
    if (item.unit === 'sarcopenia') {
      AppState.sarcFocusId = item.patientId;
      U.toast('已打开肌少症台账，进入评估即可二次编辑', 'info');
      location.hash = '#/sarcopenia';
    } else if (item.unit === 'spine') {
      AppState.spineFocusId = item.patientId;
      U.toast('已打开脊柱健康台账，进入评估即可二次编辑', 'info');
      location.hash = '#/spine';
    } else {
      AppState.currentPatientId = item.patientId;
      U.toast('已打开体重管理台账，进入评估即可二次编辑', 'info');
      location.hash = '#/dashboard';
    }
  }

  /* —— 预览弹窗 —— */
  function openPreview(item) {
    var html = reportHTML(item);
    var overlay = U.el(
      '<div class="rc-modal-overlay">' +
        '<div class="rc-modal">' +
          '<div class="rc-modal-head no-print">' +
            '<div class="rc-modal-title">' + U.esc(item.name) + ' · ' + U.esc(item.kind) + '</div>' +
            '<div class="rc-modal-acts">' +
              '<button class="btn btn-sm btn-primary" id="rc-prt">🖨️ 打印 / 导出 PDF</button>' +
              '<button class="btn btn-sm btn-ghost" id="rc-close">关闭</button>' +
            '</div>' +
          '</div>' +
          '<div class="rc-modal-body" id="rc-body"></div>' +
        '</div>' +
      '</div>');
    document.body.appendChild(overlay);
    U.qs('#rc-body', overlay).innerHTML = html;
    U.qs('#rc-close', overlay).onclick = function () { overlay.remove(); };
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    U.qs('#rc-prt', overlay).onclick = function () {
      if (window.printReportHTML) window.printReportHTML(html);
    };
  }

  /* —— 主页面 —— */
  Pages.reportCenter = function () {
    var state = { unit: 'all', q: '', selPid: null };

    function tabsHTML() {
      return '<div class="rc-tabs no-print" role="tablist">' + UNITS.map(function (u) {
        return '<button type="button" class="rc-tab' + (u.key === state.unit ? ' is-active' : '') + '" data-unit="' + u.key + '">' +
          '<span class="rc-tab-ico">' + u.icon + '</span>' + U.esc(u.label) + '</button>';
      }).join('') + '</div>';
    }

    function build() {
      var wrap = U.el(
        '<div class="rc-page">' +
          '<div class="page-header no-print">' +
            '<div><h2 class="page-title">报告管理中心</h2>' +
              '<p class="text-muted">四大方向报告统一检索 · 以患者为分类依据 · 支持预览 / 导出 / 打印 / 删除 / 二次编辑</p></div>' +
            '<div class="topbar-actions"><button class="btn btn-secondary" id="rc-refresh">🔄 刷新</button></div>' +
          '</div>' +
          tabsHTML() +
          '<div class="rc-body' + (state.unit === 'muscle' ? ' is-muscle' : '') + '">' +
            '<aside class="rc-left no-print">' +
              '<div class="rc-search"><input type="text" id="rc-q" placeholder="搜索患者姓名…" value="' + U.esc(state.q) + '">' +
                '<span class="rc-search-count" id="rc-ptcount"></span></div>' +
              '<div class="rc-ptlist" id="rc-ptlist"></div>' +
            '</aside>' +
            '<section class="rc-right" id="rc-right"></section>' +
          '</div>' +
        '</div>');

      var ptlist = U.qs('#rc-ptlist', wrap);
      var right = U.qs('#rc-right', wrap);

      function renderLeft() {
        if (state.unit === 'muscle') {
          right.innerHTML = musclePageHTML();
          bindMusclePage();
          return;
        }
        var all = collect(state.unit);
        var groups = groupByPatient(all);
        var q = state.q.trim();
        if (q) groups = groups.filter(function (g) { return (g.name || '').indexOf(q) >= 0; });
        U.qs('#rc-ptcount', wrap).textContent = groups.length + ' 位患者';
        if (!groups.length) {
          ptlist.innerHTML = '<div class="rc-empty">当前单元暂无报告</div>';
          state.selPid = null;
          renderRight();
          return;
        }
        if (!state.selPid || !groups.some(function (g) { return g.pid === state.selPid; })) {
          state.selPid = groups[0].pid;
        }
        ptlist.innerHTML = groups.map(function (g) {
          var sub = g.items.map(function (it) { return it.unitLabel; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
          return '<button type="button" class="rc-pt' + (g.pid === state.selPid ? ' is-active' : '') + '" data-pid="' + U.esc(g.pid) + '">' +
            '<span class="rc-pt-ava">' + U.esc((g.name || '?').slice(0, 1)) + '</span>' +
            '<span class="rc-pt-main"><span class="rc-pt-name">' + U.esc(g.name) + '</span>' +
              '<span class="rc-pt-sub">' + g.items.length + ' 份报告 · ' + U.esc(sub) + '</span></span>' +
            '<span class="rc-pt-badge">' + g.items.length + '</span></button>';
        }).join('');
        U.qsa('.rc-pt', ptlist).forEach(function (el) {
          el.onclick = function () { state.selPid = el.getAttribute('data-pid'); renderLeft(); };
        });
        renderRight();
      }

      function renderRight() {
        if (!state.selPid) { right.innerHTML = '<div class="rc-empty">请选择左侧患者</div>'; return; }
        var all = collect(state.unit).filter(function (r) { return r.patientId === state.selPid; });
        if (!all.length) { right.innerHTML = '<div class="rc-empty">该患者在当前单元下暂无报告</div>'; return; }
        all.sort(function (a, b) { return new Date(b.date || 0) - new Date(a.date || 0); });
        right.innerHTML = all.map(function (it, idx) {
          return '<div class="card rc-report" data-idx="' + idx + '">' +
            '<div class="card-header rc-report-head">' +
              '<span class="rc-unit-badge rc-unit-' + it.unit + '">' + it.unitLabel + '</span>' +
              '<h3 class="card-title">' + U.esc(it.kind) + '</h3>' +
              '<span class="rc-report-date">' + U.esc(U.fmtDate(it.date) || '—') + '</span>' +
            '</div>' +
            '<div class="card-body rc-report-body">' +
              '<div class="rc-meta">患者：<b>' + U.esc(it.name) + '</b>' +
                (it.gender ? ' · ' + (it.gender === 'female' ? '女' : '男') : '') +
                (it.age != null && it.age !== '' ? ' · ' + it.age + ' 岁' : '') + '</div>' +
              '<div class="rc-actions no-print">' +
                '<button class="btn btn-sm btn-outline" data-act="preview">👁 预览</button>' +
                '<button class="btn btn-sm btn-outline" data-act="print">🖨️ 打印</button>' +
                '<button class="btn btn-sm btn-outline" data-act="export">⬇ 导出</button>' +
                '<button class="btn btn-sm btn-outline" data-act="edit">✎ 二次编辑</button>' +
                '<button class="btn btn-sm btn-ghost" data-act="delete" style="color:var(--danger)">🗑 删除</button>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('');
        U.qsa('.rc-report', right).forEach(function (card) {
          var it = all[+card.getAttribute('data-idx')];
          U.qsa('[data-act]', card).forEach(function (btn) {
            btn.onclick = function () {
              var act = btn.getAttribute('data-act');
              if (act === 'preview') openPreview(it);
              else if (act === 'print') { if (window.printReportHTML) window.printReportHTML(reportHTML(it)); }
              else if (act === 'export') { U.download('report-' + it.unit + '-' + (it.patientId || it.id) + '.json', JSON.stringify(exportPayload(it), null, 2)); U.toast('已导出 JSON', 'success'); }
              else if (act === 'edit') reEdit(it);
              else if (act === 'delete') deleteReport(it, renderLeft);
            };
          });
        });
      }

      U.qsa('.rc-tab', wrap).forEach(function (t) {
        t.onclick = function () { state.unit = t.getAttribute('data-unit'); state.selPid = null; renderLeft(); };
      });
      var qEl = U.qs('#rc-q', wrap);
      qEl.addEventListener('input', function () { state.q = qEl.value; renderLeft(); });
      U.qs('#rc-refresh', wrap).onclick = function () { renderLeft(); U.toast('已刷新', 'info'); };

      renderLeft();
      return wrap;
    }

    return build();
  };

})();
