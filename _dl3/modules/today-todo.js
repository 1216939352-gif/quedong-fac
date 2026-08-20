/* ==================================================================
 * modules/today-todo.js — 体重管理台账 / 肌少症-跌倒风险台账 共享的
 * 「今日待办」聚合与渲染模块
 *
 * 暴露：
 *   window.TodayTodo = {
 *     buildWeight(patients, opts?) -> { items:[{key,patientId,name,hint,level,...}],
 *                                       breakdown:{key:count}, total }
 *     buildSarc(records, opts?)    -> 同上
 *     renderWeightCard(todo, opts) -> HTML string
 *     renderSarcCard(todo, opts)   -> HTML string
 *     bindActions(rootEl, items)   -> 给卡片行绑跳转/载入事件
 *   }
 *
 * 严重度等级 level: 'critical' / 'warn' / 'info'
 *   渲染时按 critical → warn → info 排序
 * ================================================================== */
(function () {
  'use strict';

  function todayISO() {
    try { return (window.U && U.today()) || new Date().toISOString().slice(0, 10); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function daysBetween(a, b) {
    if (!a || !b) return null;
    try { return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000); } catch (e) { return null; }
  }
  function maxDate(...arr) {
    const xs = arr.filter(Boolean);
    if (!xs.length) return null;
    return xs.reduce((m, x) => (x > m ? x : m), xs[0]);
  }
  function lastRecord(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list.reduce((m, r) => {
      const d = r && (r.testDate || r.date || r.assessDate || r.createdAt);
      const md = m && (m.testDate || m.date || m.assessDate || m.createdAt);
      if (!m) return r;
      return new Date(d) > new Date(md) ? r : m;
    }, null);
  }
  function planReviewDate(plan) {
    if (!plan) return null;
    return plan.reviewDate || null;
  }

  /* ============== 体重管理方向 ============== */
  function buildWeight(patients, opts) {
    opts = opts || {};
    const cycle = (window.CONST && CONST.RETEST_CYCLE_DAYS) || 84;
    const today = todayISO();
    const items = [];
    const breakdown = { '待评估': 0, '待补生活方式问卷': 0, '待生成干预方案': 0, '待复测': 0, '高综合风险': 0, '方案临近复评': 0 };

    (patients || []).forEach(p => {
      const data = (p && p.data) || {};
      const id = p.id;
      const name = (p.patientName || (data.patient && data.patient.name) || '未命名患者');
      const age = data.patient ? data.patient.age : null;
      const gender = data.patient ? data.patient.gender : null;
      const a = data.assessment;
      const hasA = !!a && Object.keys(a).length > 0;
      const ls = data.lifeSurvey;
      const hasLS = !!(ls && (ls._scored || Object.keys(ls).filter(k => k !== '_scored' && k !== '_advice').length));
      const plan = data.plan || {};
      const hasPlan = !!(plan.generatedAt);
      const iso = (data.isokineticData || []);
      const iot = (data.isotonicData || []);
      const lsLast = maxDate(lastRecord(iso) && lastRecord(iso).testDate, lastRecord(iot) && lastRecord(iot).testDate);

      /* (1) 待评估：有 patient 没 assessment */
      if (!hasA) {
        items.push({ key: 'wait_assess', label: '待评估', level: 'critical', patientId: id, name, hint: '登记后未做体重管理评估', actionHash: '#/assessment' });
        breakdown['待评估']++;
      }
      /* (2) 待补生活方式问卷：评估完成但问卷空 */
      if (hasA && !hasLS) {
        items.push({ key: 'wait_lifestyle', label: '待补生活方式问卷', level: 'warn', patientId: id, name, hint: '完成评估后未填生活方式问卷', actionHash: '#/lifestyle' });
        breakdown['待补生活方式问卷']++;
      }
      /* (3) 待生成干预方案：有评估无方案 */
      if (hasA && !hasPlan) {
        items.push({ key: 'wait_plan', label: '待生成干预方案', level: 'warn', patientId: id, name, hint: '已评估但未生成运动 + 营养干预方案', actionHash: '#/plan' });
        breakdown['待生成干预方案']++;
      }
      /* (4) 待复测：肌力记录距 RETEST_CYCLE - 14d 即弹窗 */
      if (lsLast) {
        const d = daysBetween(lsLast, today);
        if (d != null && d >= cycle - 14) {
          items.push({ key: 'wait_retest', label: '待复测', level: d >= cycle ? 'critical' : 'warn', patientId: id, name, hint: '距上次肌力测评 ' + d + ' 天（阈值 ' + cycle + ' 天）', actionHash: iso.length ? '#/isokinetic' : '#/isotonic' });
          breakdown['待复测']++;
        }
      }
      /* (5) 高综合风险：Calc.exerciseRisk high */
      if (hasA && window.Calc && typeof Calc.exerciseRisk === 'function') {
        try {
          const r = Calc.exerciseRisk(a, data.patient || {});
          if (r && (r.level === 'high' || r.level === '极高' || (typeof r.score === 'number' && r.score >= 80))) {
            items.push({ key: 'high_risk', label: '高综合风险', level: 'critical', patientId: id, name, hint: '综合风险评分 ' + (r.score != null ? r.score : '—') + ' / ' + (r.level || ''), actionHash: '#/report' });
            breakdown['高综合风险']++;
          }
        } catch (e) {}
      }
      /* (6) 方案临近复评 */
      const rd = planReviewDate(plan);
      if (hasPlan && rd) {
        const d = daysBetween(today, rd);
        if (d != null && d <= 7 && d >= -3) {
          items.push({ key: 'plan_review', label: '方案临近复评', level: d <= 0 ? 'critical' : 'warn', patientId: id, name, hint: '方案复评日 ' + rd + '（' + (d <= 0 ? '已逾期 ' + (-d) + ' 天' : '还有 ' + d + ' 天') + '）', actionHash: '#/plan' });
          breakdown['方案临近复评']++;
        }
      }
    });

    /* 排序：critical → warn → info；同 level 按 patientName */
    const lvl = { critical: 0, warn: 1, info: 2 };
    items.sort((a, b) => (lvl[a.level] - lvl[b.level]) || a.name.localeCompare(b.name));
    return { items, breakdown, total: items.length };
  }

  /* ============== 肌少症-跌倒风险方向 ============== */
  function buildSarc(records, opts) {
    opts = opts || {};
    const today = todayISO();
    const items = [];
    const breakdown = { '待首评': 0, '待复评': 0, '跌倒高风险': 0, '严重肌少症': 0, '核心指标不完整': 0, '跌倒+肌少症双高': 0 };

    (records || []).forEach(r => {
      const result = (r && r.result) || {};
      const input = (r && r.input) || {};
      const body = input.body || {};
      const id = r.id;
      const pid = r.patientId;
      const name = r.patientName || '未命名';
      const sarcGrade = (result.direction && result.direction.sarcGrade) || null;
      const fallLvl = result.fall && result.fall.levelKey;
      const isHighFall = fallLvl === 'high';
      const isSarcSerious = sarcGrade === '严重肌少症' || sarcGrade === '确认肌少症';

      /* (1) 待复评：reviewDate <= today */
      const rd = r.reviewDate || (result.plan && result.plan.reviewDate);
      if (rd) {
        const d = daysBetween(today, rd);
        if (d != null && d <= 0) {
          items.push({ key: 'sarc_review', label: '待复评', level: 'critical', recordId: id, patientId: pid, name, hint: '复评日 ' + rd + '（已逾期 ' + (-d) + ' 天）', actionHash: '#/sarcopenia-assess' });
          breakdown['待复评']++;
        }
      }
      /* (2) 跌倒高风险 */
      if (isHighFall) {
        items.push({ key: 'sarc_fall_high', label: '跌倒高风险', level: 'critical', recordId: id, patientId: pid, name, hint: '跌倒风险等级：高 · ' + (result.fall.index || '') + '/100', actionHash: '#/sarcopenia-assess' });
        breakdown['跌倒高风险']++;
      }
      /* (3) 严重肌少症 */
      if (isSarcSerious) {
        items.push({ key: 'sarc_grade', label: '严重肌少症', level: 'critical', recordId: id, patientId: pid, name, hint: '肌少症分级：' + sarcGrade, actionHash: '#/sarcopenia-assess' });
        breakdown['严重肌少症']++;
      }
      /* (4) 核心指标不完整：SMI/握力/步速/小腿围 */
      const missing = [];
      if (body.smi == null) missing.push('SMI');
      if (input.grip == null) missing.push('握力');
      if (input.gait == null) missing.push('步速');
      if (input.calf == null) missing.push('小腿围');
      if (missing.length >= 2) {
        items.push({ key: 'sarc_missing', label: '核心指标不完整', level: 'warn', recordId: id, patientId: pid, name, hint: '缺失：' + missing.join('、'), actionHash: '#/sarcopenia-assess' });
        breakdown['核心指标不完整']++;
      }
      /* (5) 跌倒 + 肌少症 双高风险 */
      if (isHighFall && isSarcSerious) {
        items.push({ key: 'sarc_dual_high', label: '跌倒+肌少症双高', level: 'critical', recordId: id, patientId: pid, name, hint: '跌倒高 + ' + sarcGrade + ' · 建议本优先处理', actionHash: '#/sarcopenia-assess' });
        breakdown['跌倒+肌少症双高']++;
      }
    });

    const lvl = { critical: 0, warn: 1, info: 2 };
    items.sort((a, b) => (lvl[a.level] - lvl[b.level]) || a.name.localeCompare(b.name));
    return { items, breakdown, total: items.length };
  }

  /* ============== 渲染 ============== */
  function chipBadge(level) {
    if (level === 'critical') return '<span class="tt-level tt-critical">紧急</span>';
    if (level === 'warn') return '<span class="tt-level tt-warn">提醒</span>';
    return '<span class="tt-level tt-info">提示</span>';
  }
  function rowHTML(it) {
    const hash = it.actionHash || '#/dashboard';
    return `<li class="tt-row ${U.esc(it.level || 'info')}" data-tt-key="${U.esc(it.key || '')}" data-tt-pid="${U.esc(it.patientId || it.recordId || '')}" data-tt-hash="${U.esc(hash)}">
      <div class="tt-row-main">
        ${chipBadge(it.level)}
        <span class="tt-label">${U.esc(it.label || '')}</span>
        <span class="tt-name">${U.esc(it.name || '')}</span>
        <span class="tt-hint">${U.esc(it.hint || '')}</span>
      </div>
      <a class="tt-go btn btn-sm btn-ghost" href="${U.esc(hash)}">前往处理 →</a>
    </li>`;
  }
  function breakdownChips(breakdown) {
    const keys = Object.keys(breakdown).filter(k => breakdown[k] > 0);
    if (!keys.length) return '';
    return '<div class="tt-breakdown">' + keys.map(k => '<span class="tt-bd-chip"><b>' + breakdown[k] + '</b>' + U.esc(k) + '</span>').join('') + '</div>';
  }
  function renderWeightCard(todo, opts) {
    opts = opts || {};
    const top = todo.items.slice(0, opts.maxItems || 8);
    const more = todo.items.length - top.length;
    const empty = !todo.items.length
      ? '<div class="tt-empty">🎉 当前没有体重管理方向的待办 — 所有患者评估 · 方案 · 复测均在期限内。</div>'
      : '';
    return `<div class="card tt-card tt-card-weight">
      <div class="card-header">
        <h3 class="card-title"><span class="card-title-icon">📌</span>今日待办 · 体重管理</h3>
        <span class="badge ${todo.total ? 'badge-warning' : 'badge-success'}">${todo.total} 条待办</span>
        <a href="#/bigdata" class="btn btn-ghost btn-sm no-print" style="margin-left:auto;">鹊动FAC大数据看板 →</a>
      </div>
      <div class="card-body">
        ${empty}
        ${breakdownChips(todo.breakdown)}
        ${top.length ? '<ul class="tt-list">' + top.map(rowHTML).join('') + '</ul>' : ''}
        ${more > 0 ? '<div class="tt-more">还有 ' + more + ' 条未显示，到详细看板查看 →</div>' : ''}
      </div>
    </div>`;
  }
  function renderSarcCard(todo, opts) {
    opts = opts || {};
    const top = todo.items.slice(0, opts.maxItems || 8);
    const more = todo.items.length - top.length;
    const empty = !todo.items.length
      ? '<div class="tt-empty">🎉 当前没有肌少症-跌倒风险方向的待办 — 所有老人复评均在期限内。</div>'
      : '';
    return `<div class="card tt-card tt-card-sarc">
      <div class="card-header">
        <h3 class="card-title"><span class="card-title-icon">📌</span>今日待办 · 肌少症-跌倒风险</h3>
        <span class="badge ${todo.total ? 'badge-warning' : 'badge-success'}">${todo.total} 条待办</span>
        <a href="#/fall-risk-stats" class="btn btn-ghost btn-sm no-print" style="margin-left:auto;">跌倒看板 →</a>
      </div>
      <div class="card-body">
        ${empty}
        ${breakdownChips(todo.breakdown)}
        ${top.length ? '<ul class="tt-list">' + top.map(rowHTML).join('') + '</ul>' : ''}
        ${more > 0 ? '<div class="tt-more">还有 ' + more + ' 条未显示，到跌倒看板查看 →</div>' : ''}
      </div>
    </div>`;
  }

  /* 事件绑定：点击「前往处理」前先载入患者上下文再跳转
   *  - 体重管理直接 hash 跳转
   *  - 肌少症需要 patientId → loadPatientContext
   */
  function bindActions(rootEl, items, opts) {
    opts = opts || {};
    if (!rootEl) return;
    U.qsa('.tt-row', rootEl).forEach(row => {
      row.addEventListener('click', e => {
        e.preventDefault();
        const hash = row.dataset.ttHash || '#/dashboard';
        const pid = row.dataset.ttPid;
        if (opts.loadPatient && pid && typeof window.loadPatientContext === 'function') {
          window.loadPatientContext(pid).catch(() => 0).finally(() => {
            location.hash = hash;
          });
        } else {
          location.hash = hash;
        }
      });
    });
  }

  function renderCard(direction, items, breakdown) {
    const todo = { items, breakdown, total: items.length };
    const opts = { maxItems: 8 };
    if (direction === 'weight') {
      const html = renderWeightCard(todo, opts);
      setTimeout(() => bindActions(document.querySelector('.tt-card-weight')), 50);
      return html;
    }
    if (direction === 'sarc') {
      const html = renderSarcCard(todo, opts);
      setTimeout(() => bindActions(document.querySelector('.tt-card-sarc'), { loadPatient: true }), 50);
      return html;
    }
    return '';
  }

  window.TodayTodo = {
    buildWeight: buildWeight, buildSarc: buildSarc,
    renderWeightCard: renderWeightCard, renderSarcCard: renderSarcCard, renderCard: renderCard,
    bindActions: bindActions
  };
})();
