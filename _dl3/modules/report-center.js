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
          '<div class="rc-body">' +
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
          ptlist.innerHTML = '<div class="rc-empty">肌力报告解读为独立报告，点击下方入口打开</div>';
          right.innerHTML = '<div class="rc-muscle-entry">' +
            '<a class="rc-muscle-card" href="#/isokinetic-report"><span class="rc-muscle-ico">⚙️</span><span class="rc-muscle-title">等速肌力报告解读</span><span class="rc-muscle-desc">峰力矩 / 双侧不对称 / 力矩衰减率解读</span></a>' +
            '<a class="rc-muscle-card" href="#/isotonic-report"><span class="rc-muscle-ico">🏋️</span><span class="rc-muscle-title">等张肌力报告解读</span><span class="rc-muscle-desc">1RM / 训练负荷换算解读</span></a>' +
            '</div>';
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
