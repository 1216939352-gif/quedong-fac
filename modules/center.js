/**
 * 鹊动FAC功能评估与干预系统 - 医生工作台报告中心
 * 聚合当前医生名下全部患者全周期档案，支持检索、预览、批量导出、趋势图表
 */
(function () {
  'use strict';

  function loadAll() {
    const u = AppState.currentUser;
    return (isAdminRole(u) ? DB.getPatients() : DB.getPatientsByDoctor(u.username));
  }

  function summarize(p) {
    const d = p.data || {};
    const a = d.assessment || {};
    const iso = d.isokineticData || [];
    const iot = d.isotonicData || [];
    const lastIso = iso.slice(-1)[0];
    const lastIot = iot.slice(-1)[0];
    return {
      id: p.id, name: p.patientName, updatedAt: p.updatedAt,
      bmi: a.bmi, weight: (d.patient || {}).weight,
      tdee: a.tdee, target: a.targetCalories,
      planGen: !!(d.plan && d.plan.generatedAt),
      lifeScore: (d.lifeSurvey && d.lifeSurvey._scored) ? d.lifeSurvey._scored.total : null,
      isoScore: lastIso && lastIso._scored ? lastIso._scored.total : null,
      iotScore: lastIot && lastIot._scored ? lastIot._scored.total : null,
      isoCount: iso.length, iotCount: iot.length
    };
  }

  function groupByDate(list) {
    const map = {};
    list.forEach(p => {
      const day = U.fmtDate(p.updatedAt);
      (map[day] = map[day] || []).push(p);
    });
    return Object.keys(map).sort().reverse().map(day => ({ day, items: map[day] }));
  }

  function renderList(filtered) {
    if (!filtered.length) return '<div class="empty-state">未找到匹配的患者档案</div>';
    const groups = groupByDate(filtered);
    return groups.map(g => `
      <div class="center-group">
        <div class="center-group-date">📅 ${g.day}（${g.items.length} 条）</div>
        <table class="data-table">
          <thead><tr><th>患者</th><th>BMI</th><th>体重(kg)</th><th>目标热量</th><th>生活方式分</th><th>肌力</th><th>操作</th></tr></thead>
          <tbody>
            ${g.items.map(p => {
              const s = summarize(p);
              return `<tr>
                <td><strong>${U.esc(s.name)}</strong></td>
                <td>${s.bmi ?? '—'}</td>
                <td>${s.weight ?? '—'}</td>
                <td>${s.target ?? '—'}</td>
                <td>${s.lifeScore ?? '—'}</td>
                <td>${s.isoScore != null ? '等速 '+s.isoScore : ''}${s.iotScore != null ? ' 等张 '+s.iotScore : ''}${s.isoScore==null && s.iotScore==null ? '—' : ''}</td>
                <td>
                  <button class="btn btn-ghost btn-sm center-preview" data-id="${p.id}">预览</button>
                  <button class="btn btn-secondary btn-sm center-load" data-id="${p.id}">打开</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`).join('');
  }

  function statsHtml(list) {
    const n = list.length;
    const withPlan = list.filter(p => (p.data && p.data.plan && p.data.plan.generatedAt)).length;
    const withStrength = list.filter(p => ((p.data.isokineticData || []).length + (p.data.isotonicData || []).length) > 0).length;
    const avgLife = (() => {
      const arr = list.map(p => (p.data.lifeSurvey && p.data.lifeSurvey._scored && p.data.lifeSurvey._scored.total)).filter(v => v != null);
      return arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
    })();
    return `
    <div class="grid-4">
      <div class="metric-card"><div class="metric-value">${n}</div><div class="metric-label">患者总数</div></div>
      <div class="metric-card"><div class="metric-value">${withPlan}</div><div class="metric-label">已生成方案</div></div>
      <div class="metric-card"><div class="metric-value">${withStrength}</div><div class="metric-label">已做肌力测评</div></div>
      <div class="metric-card"><div class="metric-value">${avgLife ?? '—'}</div><div class="metric-label">平均生活方式分</div></div>
    </div>`;
  }

  function trendHtml(list) {
    const pts = list.filter(p => p.data && p.data.assessment && p.data.assessment.bmi)
      .slice(-10).map(p => ({ label: U.fmtDate(p.updatedAt).slice(5), value: p.data.assessment.bmi }));
    return U.lineChart(pts, { id: 'centertrend', color: '#f26522' });
  }

  Pages.center = async function () {
    let all = await loadAll();
    all = all.map(p => p);
    const html = `
    <div class="page-header">
      <div><h2 class="page-title">医生报告中心</h2><p class="text-muted">${isAdminRole(AppState.currentUser) ? '全平台数据' : '当前医生名下全部患者'}</p></div>
    </div>
    <div id="center-stats">${statsHtml(all)}</div>
    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">检索筛选</h3></div>
      <div class="card-body">
        <div class="form-row" style="grid-template-columns: 2fr 1fr 1fr auto;">
          <div class="form-group"><label>患者姓名</label><input type="text" id="center-name" placeholder="精确匹配姓名" /></div>
          <div class="form-group"><label>起始日期</label><input type="date" id="center-from" /></div>
          <div class="form-group"><label>结束日期</label><input type="date" id="center-to" /></div>
          <div class="form-group" style="display:flex; align-items:flex-end;"><button class="btn btn-primary" id="center-export">批量导出 JSON</button></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">减重趋势（BMI）</h3></div>
      <div class="card-body">${trendHtml(all)}</div>
    </div>
    <div id="center-list" style="margin-top:18px;">${renderList(all)}</div>`;
    const root = U.el(`<div>${html}</div>`);

    function applyFilter() {
      const name = U.qs('#center-name', root).value.trim();
      const from = U.qs('#center-from', root).value;
      const to = U.qs('#center-to', root).value;
      let f = all;
      if (name) f = f.filter(p => p.patientName.includes(name));
      if (from) f = f.filter(p => U.fmtDate(p.updatedAt) >= from);
      if (to) f = f.filter(p => U.fmtDate(p.updatedAt) <= to);
      U.qs('#center-stats', root).innerHTML = statsHtml(f);
      U.qs('#center-list', root).innerHTML = renderList(f);
      bindList();
    }

    U.qs('#center-name', root).addEventListener('input', applyFilter);
    U.qs('#center-from', root).addEventListener('change', applyFilter);
    U.qs('#center-to', root).addEventListener('change', applyFilter);

    U.qs('#center-export', root).addEventListener('click', () => {
      if (!confirm('确认导出当前筛选结果（全平台 JSON 档案）？')) return;
      const payload = { exportedBy: AppState.currentUser.username, exportedAt: new Date().toISOString(), patients: all };
      U.download(`report-center-${U.today()}.json`, JSON.stringify(payload, null, 2));
      U.toast('success', '已导出 JSON 档案');
    });

    function bindList() {
      U.qsa('.center-preview', root).forEach(btn => btn.addEventListener('click', async () => {
        const p = all.find(x => x.id === btn.dataset.id);
        if (!p) return;
        const lf = summarize(p);
        U.modal(`<h3 style="margin:0 0 8px;">${U.esc(lf.name)} 档案预览</h3>
          <p>BMI：${lf.bmi ?? '—'} ｜ 体重：${lf.weight ?? '—'}kg ｜ 目标热量：${lf.target ?? '—'}</p>
          <p>生活方式分：${lf.lifeScore ?? '—'} ｜ 等速肌力：${lf.isoScore ?? '—'} ｜ 等张肌力：${lf.iotScore ?? '—'}</p>
          <p>肌力测评次数：等速 ${lf.isoCount} ｜ 等张 ${lf.iotCount}</p>`);
      }));
      U.qsa('.center-load', root).forEach(btn => btn.addEventListener('click', async () => {
        await loadPatientContext(btn.dataset.id);
        location.hash = '#/report';
      }));
    }
    bindList();
    return root;
  };

  /* 暴露给报告管理中心复用（检索/趋势/批量导出/汇总） */
  window.CenterAPI = { loadAll, summarize, renderList, statsHtml, trendHtml, groupByDate };
})();
