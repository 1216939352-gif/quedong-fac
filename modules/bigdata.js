/**
 * 鹊动FAC健康看板（液态玻璃旗舰页）
 * 汇总当前账号下所有患者的重要信息：人群构成、BMI 分布、评估/方案完成情况、风险分层等
 * 支持「演示数据」一键模拟真实数据展示；图表/动效/卡片组件复用 DashCore。
 */
(function () {
  'use strict';
  const Dash = window.DashCore;
  const {
    donutChart, barChart, lineChart, hbarChart, legendHTML,
    animateBigdata, filterPatientsByRange, demoPatients,
    kpiCardHTML, chartCardHTML, miniList, downloadBlob, SEM, countBy
  } = Dash;

  function calcStats(patients) {
    const total = patients.length;
    const male = patients.filter(p => (p.data && p.data.patient && p.data.patient.gender) === 'male').length;
    const female = total - male;

    const ageGroups = { '<30': 0, '30-45': 0, '45-60': 0, '>60': 0 };
    let ageSum = 0, ageCount = 0;
    patients.forEach(p => {
      const age = p.data && p.data.patient ? U.calcAge(p.data.patient.birthDate) : null;
      if (age !== null) { ageSum += age; ageCount++; }
      if (age === null) return;
      if (age < 30) ageGroups['<30']++;
      else if (age < 45) ageGroups['30-45']++;
      else if (age < 60) ageGroups['45-60']++;
      else ageGroups['>60']++;
    });

    const bmiGroups = { under: 0, normal: 0, over: 0, obese: 0 };
    let bmiSum = 0, bmiCount = 0;
    let abnormalWaist = 0, hypertension = 0;
    patients.forEach(p => {
      const a = p.data && p.data.assessment ? p.data.assessment : {};
      const gender = p.data && p.data.patient ? p.data.patient.gender : 'male';
      let bmi = a.bmi;
      if (!bmi && p.data && p.data.patient) {
        const w = U.num(p.data.patient.weight), h = U.num(p.data.patient.height);
        if (w && h) bmi = U.round(w / Math.pow(h / 100, 2), 1);
      }
      if (bmi) { bmiSum += bmi; bmiCount++; }
      if (!bmi) return;
      if (bmi < 18.5) bmiGroups.under++;
      else if (bmi < 24) bmiGroups.normal++;
      else if (bmi < 28) bmiGroups.over++;
      else bmiGroups.obese++;
      if ((gender === 'male' && a.waist >= 90) || (gender === 'female' && a.waist >= 85)) abnormalWaist++;
      if (a.whr >= (gender === 'male' ? 0.9 : 0.85)) abnormalWaist++;
      if (a.sbp >= 140 || a.dbp >= 90) hypertension++;
    });

    const riskGroups = { low: 0, medium: 0, high: 0 };
    const lifeGroups = { excellent: 0, good: 0, medium: 0, poor: 0 };
    patients.forEach(p => {
      const risk = p.data && p.data.assessment && p.data.assessment.risk ? p.data.assessment.risk.label : '';
      if (risk.includes('高')) riskGroups.high++;
      else if (risk.includes('中')) riskGroups.medium++;
      else riskGroups.low++;
      const ls = p.data && p.data.lifeSurvey && p.data.lifeSurvey._scored ? p.data.lifeSurvey._scored.total : null;
      if (ls == null) return;
      if (ls >= 80) lifeGroups.excellent++;
      else if (ls >= 60) lifeGroups.good++;
      else if (ls >= 45) lifeGroups.medium++;
      else lifeGroups.poor++;
    });

    const assessed = patients.filter(p => {
      const a = p.data && p.data.assessment;
      return a && (a.weight || a.bmi || a.waist);
    }).length;

    const planDone = patients.filter(p => p.data && p.data.plan && p.data.plan.generatedAt).length;

    const strengthPatients = patients.filter(p => ((p.data && p.data.isokineticData || []).length + (p.data && p.data.isotonicData || []).length) > 0).length;
    const strengthTests = patients.reduce((sum, p) => {
      const d = p.data || {};
      return sum + (d.isokineticData || []).length + (d.isotonicData || []).length;
    }, 0);

    const recent7 = patients.filter(p => p.createdAt && U.daysBetween(p.createdAt, new Date().toISOString()) <= 7).length;
    const recent30 = patients.filter(p => p.createdAt && U.daysBetween(p.createdAt, new Date().toISOString()) <= 30).length;

    const planTypes = {
      diet: patients.filter(p => p.data && p.data.plan && p.data.plan.nutrition).length,
      aerobic: patients.filter(p => p.data && p.data.plan && p.data.plan.aerobic).length,
      resistance: patients.filter(p => p.data && p.data.plan && p.data.plan.resistance).length,
      flexibility: patients.filter(p => p.data && p.data.plan && p.data.plan.flexibility).length,
      balance: patients.filter(p => p.data && p.data.plan && p.data.plan.balance).length
    };

    const doctorMap = countBy(patients, p => p.doctorId || '未分配');
    const doctorData = Object.entries(doctorMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    const today = new Date();
    const trend30 = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const value = patients.filter(p => p.createdAt && p.createdAt.slice(0, 10) === ds).length;
      trend30.push({ label: i % 5 === 0 ? ds.slice(5) : '', value });
    }

    const avgBmi = bmiCount ? U.round(bmiSum / bmiCount, 1) : '—';
    const avgAge = ageCount ? Math.round(ageSum / ageCount) : '—';

    return {
      total, male, female, ageGroups, bmiGroups, riskGroups, lifeGroups,
      assessed, planDone, strengthPatients, strengthTests, recent7, recent30,
      planTypes, doctorData, trend30, avgBmi, avgAge, abnormalWaist, hypertension
    };
  }

  function genderAvgAge(patients) {
    const acc = { male: [], female: [] };
    patients.forEach(p => {
      const pd = p.data && p.data.patient; if (!pd) return;
      const a = U.calcAge(pd.birthDate); if (a == null) return;
      if (pd.gender === 'female') acc.female.push(a); else if (pd.gender === 'male') acc.male.push(a);
    });
    const avg = arr => arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
    return { male: avg(acc.male), female: avg(acc.female) };
  }
  function avgLifeScore(patients) {
    let s = 0, c = 0;
    patients.forEach(p => {
      const ls = p.data && p.data.lifeSurvey && p.data.lifeSurvey._scored ? p.data.lifeSurvey._scored.total : null;
      if (ls != null) { s += ls; c++; }
    });
    return c ? Math.round(s / c) : null;
  }
  function buildPanels(s, patients) {
    const T = s.total || 1;
    const gAvg = genderAvgAge(patients);
    const aLife = avgLifeScore(patients);
    const bg = s.bmiGroups, bSum = (bg.under + bg.normal + bg.over + bg.obese) || 1;
    const ag = s.ageGroups, aSum = (ag['<30'] + ag['30-45'] + ag['45-60'] + ag['>60']) || 1;
    const rg = s.riskGroups, lg = s.lifeGroups;
    let isoK = 0, isoT = 0;
    patients.forEach(p => { const d = p.data || {}; isoK += (d.isokineticData || []).length; isoT += (d.isotonicData || []).length; });
    const pan = {};
    pan.total = miniList([
      { label: '男性', value: s.male, pct: Math.round(s.male / T * 100) },
      { label: '女性', value: s.female, pct: Math.round(s.female / T * 100) },
      { label: '近 7 天新增', value: s.recent7 },
      { label: '近 30 天新增', value: s.recent30 }
    ]) + `<div class="bd-export-link" data-export="names">⬇ 导出当前名单（CSV）</div>`;
    pan.assessed = miniList([
      { label: '已完成评估', value: s.assessed, pct: Math.round(s.assessed / T * 100) },
      { label: '待评估', value: s.total - s.assessed, pct: Math.round((s.total - s.assessed) / T * 100) }
    ]) + `<div class="bd-drill-note">评估覆盖率 ${s.total ? Math.round(s.assessed / s.total * 100) : 0}%，未评估用户建议尽快安排体成分与肌力测评。</div>`;
    pan.planDone = miniList([
      { label: '已生成方案', value: s.planDone, pct: Math.round(s.planDone / T * 100) },
      { label: '未生成方案', value: s.total - s.planDone, pct: Math.round((s.total - s.planDone) / T * 100) }
    ]) + `<div class="bd-drill-note">评估→方案转化率 ${s.assessed ? Math.round(s.planDone / s.assessed * 100) : 0}%（基于已评估人数）。</div>`;
    pan.strength = miniList([
      { label: '等速肌力测试', value: isoK },
      { label: '等张肌力测试', value: isoT },
      { label: '测评人数', value: s.strengthPatients }
    ]) + `<div class="bd-drill-note">共 ${s.strengthTests} 条肌力测评记录，是抗阻处方与跌倒预防的核心依据。</div>`;
    pan.avgBmi = miniList([
      { label: '偏瘦 (<18.5)', value: bg.under, pct: Math.round(bg.under / bSum * 100) },
      { label: '正常 (18.5–24)', value: bg.normal, pct: Math.round(bg.normal / bSum * 100) },
      { label: '超重 (24–28)', value: bg.over, pct: Math.round(bg.over / bSum * 100) },
      { label: '肥胖 (≥28)', value: bg.obese, pct: Math.round(bg.obese / bSum * 100) }
    ]) + `<div class="bd-drill-note">人群平均 BMI ${s.avgBmi}，按《中国成人超重肥胖预防控制指南》四级分级。</div>`;
    pan.avgAge = miniList([
      { label: '<30 岁', value: ag['<30'], pct: Math.round(ag['<30'] / aSum * 100) },
      { label: '30–45 岁', value: ag['30-45'], pct: Math.round(ag['30-45'] / aSum * 100) },
      { label: '45–60 岁', value: ag['45-60'], pct: Math.round(ag['45-60'] / aSum * 100) },
      { label: '>60 岁', value: ag['>60'], pct: Math.round(ag['>60'] / aSum * 100) }
    ]) + `<div class="bd-drill-note">平均年龄 ${s.avgAge} 岁，45 岁以上为体重管理与肌少症重点人群。</div>`;
    pan.abnormalWaist = `<div class="bd-drill-note">共 <b>${s.abnormalWaist}</b> 人腰围/腰臀比异常（男腰围≥90 或腰臀比≥0.9；女腰围≥85 或腰臀比≥0.85），提示中心性肥胖，建议优先有氧 + 饮食干预。</div>`;
    pan.hypertension = `<div class="bd-drill-note">共 <b>${s.hypertension}</b> 人血压偏高（收缩压≥140 或 舒张压≥90），建议结合医学体检进一步评估。</div>`;
    pan.gender = miniList([
      { label: '男性', value: s.male, suffix: ' 人', pct: Math.round(s.male / T * 100) },
      { label: '女性', value: s.female, suffix: ' 人', pct: Math.round(s.female / T * 100) }
    ]) + `<div class="bd-drill-note">男性平均 ${gAvg.male != null ? gAvg.male : '—'} 岁，女性平均 ${gAvg.female != null ? gAvg.female : '—'} 岁。</div>`;
    const ageMaxKey = Object.entries(ag).sort((a, b) => b[1] - a[1])[0];
    pan.age = miniList([
      { label: '<30 岁', value: ag['<30'] },
      { label: '30–45 岁', value: ag['30-45'] },
      { label: '45–60 岁', value: ag['45-60'] },
      { label: '>60 岁', value: ag['>60'] }
    ]) + `<div class="bd-drill-note">${ageMaxKey[0]} 岁区间占比最高（${ageMaxKey[1]} 人），为干预核心人群。</div>`;
    pan.bmi = miniList([
      { label: '偏瘦', value: bg.under }, { label: '正常', value: bg.normal },
      { label: '超重', value: bg.over }, { label: '肥胖', value: bg.obese }
    ]) + `<div class="bd-drill-note">超重+肥胖合计 ${bg.over + bg.obese} 人（${Math.round((bg.over + bg.obese) / bSum * 100)}%），为重点管理人群。</div>`;
    pan.risk = miniList([
      { label: '低风险', value: rg.low }, { label: '中风险', value: rg.medium }, { label: '高风险', value: rg.high }
    ]) + `<div class="bd-drill-note">高风险 ${rg.high} 人需优先安排肌少症筛查与跌倒预防；其中 ${s.planDone} 人已生成方案。</div>`;
    pan.life = miniList([
      { label: '优秀', value: lg.excellent }, { label: '良好', value: lg.good },
      { label: '一般', value: lg.medium }, { label: '较差', value: lg.poor }
    ]) + `<div class="bd-drill-note">平均生活方式健康度 ${aLife != null ? aLife : '—'} 分（满分约 100），分数越高代表饮食/运动/睡眠习惯越好。</div>`;
    const sum30 = s.trend30.reduce((a, p) => a + p.value, 0);
    const peak = s.trend30.reduce((m, p) => p.value > m.value ? p : m, { value: 0, label: '' });
    pan.trend = `<div class="bd-drill-note">近 30 天日均建档约 ${(sum30 / 30).toFixed(1)} 人；单日峰值 ${peak.value} 人（${peak.label || '—'}）。</div>`;
    pan.doctor = miniList(s.doctorData.map(d => ({ label: d.label, value: d.value }))) + `<div class="bd-drill-note">共 ${s.doctorData.length} 位医生参与建档，TOP5 见上方条形图。</div>`;
    pan.planType = miniList(s.planTypes ? Object.entries(s.planTypes).map(([k, v]) => ({ label: ({ diet: '饮食', aerobic: '有氧', resistance: '抗阻', flexibility: '柔韧', balance: '平衡' })[k] || k, value: v, pct: Math.round(v / T * 100) })) : []) + `<div class="bd-drill-note">饮食 / 有氧 / 抗阻 / 柔韧 / 平衡五类处方覆盖情况，覆盖越全代表方案越完整。</div>`;
    const conv = (a, b) => b ? Math.round(a / b * 100) : 0;
    pan.funnel = miniList([
      { label: '建档 → 评估', value: conv(s.assessed, s.total) + '%' },
      { label: '评估 → 肌力测评', value: conv(s.strengthPatients, s.assessed) + '%' },
      { label: '评估 → 方案', value: conv(s.planDone, s.assessed) + '%' }
    ]) + `<div class="bd-drill-note">业务漏斗转化率，缺口环节可针对性加强。</div>`;
    return pan;
  }
  function buildInsightRail(s, range) {
    const T = s.total || 1;
    const obese = s.bmiGroups.obese + s.bmiGroups.over;
    const bSum = (s.bmiGroups.under + s.bmiGroups.normal + s.bmiGroups.over + s.bmiGroups.obese) || 1;
    const obesePct = Math.round(obese / bSum * 100);
    const items = [];
    if (obesePct >= 25) items.push({ level: 'warn', key: 'bmi', text: `<b>超重/肥胖占比 ${obesePct}%</b>（${obese} 人），建议加强有氧与饮食处方。` });
    if (s.abnormalWaist >= 1) items.push({ level: 'warn', key: 'abnormalWaist', text: `<b>${s.abnormalWaist} 人</b>腰围/腰臀比异常，提示中心性肥胖风险。` });
    if (s.riskGroups.high >= 1) items.push({ level: 'bad', key: 'risk', text: `<b>${s.riskGroups.high} 例</b>健康高风险，建议优先肌少症筛查与跌倒预防。` });
    if (s.assessed && s.planDone < s.assessed) items.push({ level: 'warn', key: 'planDone', text: `<b>${s.assessed - s.planDone} 人</b>已完成评估但尚未生成干预方案，可补生成。` });
    if (s.total && s.assessed < s.total) items.push({ level: 'warn', key: 'assessed', text: `<b>${s.total - s.assessed} 人</b>尚未完成综合评估，建议尽快安排。` });
    if (!items.length) items.push({ level: 'ok', key: 'total', text: `当前数据未见明显异常，整体人群指标平稳。` });
    const rangeLabel = range === '7d' ? '近 7 天' : range === '30d' ? '近 30 天' : '全部';
    return `<div class="bd-insight-rail">
      <div class="bd-insight-head">📡 智能洞察（${rangeLabel}）</div>
      ${items.map(it => `<div class="bd-insight ${it.level}" data-key="${it.key}"><span class="dot"></span><div>${it.text}</div></div>`).join('')}
    </div>`;
  }
  function controlBarHTML(range) {
    const segs = [['all', '全部'], ['30d', '近30天'], ['7d', '近7天']];
    return `<div class="bd-controlbar"><span style="font-size:13px;color:var(--text-muted);font-weight:600;">时间范围</span>
      <div class="bd-seg">${segs.map(([v, l]) => `<button data-range="${v}" class="${range === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>`;
  }
  function bdExportNames(patients) {
    if (!patients.length) return U.toast('暂无数据可导出', 'warning');
    const head = ['编号', '姓名', '性别', '年龄'];
    const rows = patients.map(p => [
      p.patientCode || '', p.name || '',
      (p.data && p.data.patient && p.data.patient.gender === 'female' ? '女' : '男'),
      (p.data && p.data.patient ? U.calcAge(p.data.patient.birthDate) : '')
    ]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `看板名单_${U.today()}.csv`);
    U.toast('名单已导出', 'success');
  }

  // #/bigdata?dir=weight|sarcopenia|fall —— 大数据看板统一入口
  // 架构：单外壳（hero + 顶部三分段控制 + 右上全屏/演示按钮 + body 容器），body 区域按 dir 局部刷新（不重渲染外壳）
  Pages.bigdata = function () {
    const curDir = parseBdDir();
    return renderBdShell(curDir);
  };

  function parseBdDir() {
    const hash = (location.hash || '');
    try {
      const q = hash.split('?')[1];
      if (q) {
        const u = new URLSearchParams(q);
        const d = u.get('dir');
        if (d === 'sarcopenia' || d === 'sarc') return 'sarcopenia';
        if (d === 'fall' || d === 'fall-risk') return 'fall';
      }
    } catch (e) { /* noop */ }
    return 'weight';
  }

  function renderBdShell(dir) {
    const titleMap = {
      weight: '🚀 体重管理看板 · 鹊动健康数据总览',
      sarcopenia: '🧓 老年肌少症-跌倒风险 · 数据看板',
      fall: '🤸 跌倒风险 · 数据看板'
    };
    const subMap = {
      weight: '实时汇总体重管理档案、评估、方案、肌力、生活方式等核心指标',
      sarcopenia: '覆盖肌少症老人首诊档案、SPPB / CFS / SARC-F / 跌倒风险等级分布',
      fall: '覆盖跌倒风险评估记录、复评依从、县区分布、高风险因素排序'
    };
    const segActive = (k) => k === dir ? 'is-active' : '';
    const wrap = U.el(`<div class="bigdata-page">
      <div class="bigdata-hero" id="bd-hero">
        <div>
          <h2 class="bigdata-title" id="bd-hero-title">${U.esc(titleMap[dir] || titleMap.weight)}</h2>
          <p class="bigdata-subtitle" id="bd-hero-sub">${U.esc(subMap[dir] || subMap.weight)}</p>
        </div>
        <div class="bigdata-actions">
          <div class="bigdata-date">${U.today()}</div>
          <button type="button" id="bd-demo-btn" class="btn ${(AppState[bdDemoKey(dir)] === true) ? 'btn-secondary' : 'btn-primary'}" title="演示数据开关">
            ${(AppState[bdDemoKey(dir)] === true) ? '退出演示' : '演示数据'}
          </button>
          <button type="button" id="bd-fs-btn-topright" class="btn bd-fs-topright" title="独立弹出大屏展示（不影响主系统）">
            <svg width="14" height="14" viewBox="0 0 32 32" aria-hidden="true"><path d="M 4 0 L 4 12 M 0 4 L 4 0 L 8 4 M 28 0 L 28 12 M 32 4 L 28 0 L 24 4 M 4 30 L 4 18 M 0 26 L 4 30 L 8 26 M 28 30 L 28 18 M 32 26 L 28 30 L 24 26" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>全屏展示</span>
          </button>
        </div>
      </div>

      <div class="bd-dir-seg no-print" role="tablist" aria-label="数据看板方向">
        <button type="button" class="bd-dir-seg-btn ${segActive('weight')}" data-bd-dir="weight" role="tab"><span class="bd-dir-icon">🚀</span><span class="bd-dir-text">体重管理</span></button>
        <button type="button" class="bd-dir-seg-btn ${segActive('sarcopenia')}" data-bd-dir="sarcopenia" role="tab"><span class="bd-dir-icon">🧓</span><span class="bd-dir-text">老年肌少症</span></button>
        <button type="button" class="bd-dir-seg-btn ${segActive('fall')}" data-bd-dir="fall" role="tab"><span class="bd-dir-icon">🤸</span><span class="bd-dir-text">跌倒风险</span></button>
      </div>

      <div id="bd-dir-body" data-cur-dir="${dir}">
        ${bdBuildBody(dir)}
      </div>
    </div>`);

    // 顶部方向切换 · 不走 hash · 走 window.bdSwitchDir 局部刷新
    wrap.querySelectorAll('.bd-dir-seg-btn').forEach(b => {
      b.addEventListener('click', () => window.bdSwitchDir(b.dataset.bdDir));
    });

    // 演示数据 · 按方向切换 AppState 标志
    const demoBtn = wrap.querySelector('#bd-demo-btn');
    if (demoBtn) demoBtn.addEventListener('click', () => {
      const k = bdDemoKey(window.bdCurrentDir ? window.bdCurrentDir() : dir);
      AppState[k] = !AppState[k];
      if (!AppState[k]) {
        // 退出演示时不强制清空 demo patients（bigdata / sarc 共用缓存）
      }
      window.bdSwitchDir(window.bdCurrentDir ? window.bdCurrentDir() : dir);
    });

    // 右上全屏 · 用 Fullscreen.open 注册的 key
    const fsBtn = wrap.querySelector('#bd-fs-btn-topright');
    if (fsBtn) fsBtn.addEventListener('click', () => {
      const k = bdFullscreenKey(window.bdCurrentDir ? window.bdCurrentDir() : dir);
      try { if (window.Fullscreen) window.Fullscreen.open(k); }
      catch (e) { U.toast('全屏打开失败：' + (e.message || e), 'error'); }
    });

    // 记录当前 dir（bdSwitchDir 调用后会更新）
    window.bdCurrentDir = function () { return wrap.querySelector('#bd-dir-body').dataset.curDir; };

    // 在 body 渲染完后，给容器内可展开卡与 navia 等绑定一次（首次）
    queueBdBodyBindings(wrap);

    return wrap;
  }

  function bdDemoKey(dir) {
    if (dir === 'sarcopenia') return 'sarcStatsDemo';
    if (dir === 'fall') return 'fallStatsDemo';
    return 'bigdataDemo';
  }
  function bdFullscreenKey(dir) {
    if (dir === 'sarcopenia') return 'sarc';
    if (dir === 'fall') return 'fall';
    return 'bigdata';
  }

  // 局部刷新：替换 #bd-dir-body 的 innerHTML，不重建 hero/segmented/按钮
  window.bdSwitchDir = function (dir) {
    const body = document.querySelector('#bd-dir-body');
    if (!body) return;
    if (body.dataset.curDir === dir) return;
    // 缓存当前 body 状态（如 bigdataRange）
    body.innerHTML = bdBuildBody(dir);
    body.dataset.curDir = dir;
    // 切换 segmented active
    document.querySelectorAll('.bd-dir-seg-btn').forEach(b => b.classList.toggle('is-active', b.dataset.bdDir === dir));
    // 切换 hero 标题
    const titleMap = {
      weight: '🚀 体重管理看板 · 鹊动健康数据总览',
      sarcopenia: '🧓 老年肌少症-跌倒风险 · 数据看板',
      fall: '🤸 跌倒风险 · 数据看板'
    };
    const subMap = {
      weight: '实时汇总体重管理档案、评估、方案、肌力、生活方式等核心指标',
      sarcopenia: '覆盖肌少症老人首诊档案、SPPB / CFS / SARC-F / 跌倒风险等级分布',
      fall: '覆盖跌倒风险评估记录、复评依从、县区分布、高风险因素排序'
    };
    const t = document.querySelector('#bd-hero-title'); if (t) t.innerHTML = U.esc(titleMap[dir] || titleMap.weight);
    const s = document.querySelector('#bd-hero-sub'); if (s) s.innerHTML = U.esc(subMap[dir] || subMap.weight);
    // 演示按钮文案跟随
    const dBtn = document.querySelector('#bd-demo-btn');
    if (dBtn) {
      const on = AppState[bdDemoKey(dir)] === true;
      dBtn.className = 'btn ' + (on ? 'btn-secondary' : 'btn-primary');
      dBtn.textContent = on ? '退出演示' : '演示数据';
    }
    // URL hash 同步（不触发 route 刷新）
    try { history.replaceState(null, '', '#/bigdata?dir=' + dir); } catch (e) { /* noop */ }
    // 重新绑定容器内的可展开卡 / 分段控件 / 导出
    queueBdBodyBindings(document.querySelector('.bigdata-page'));
  };

  // 绑定 body 内容区的交互（可展开卡 / 时间范围 / 洞察定位 / 名单导出 / 全屏局部按钮）
  function queueBdBodyBindings(root) {
    if (!root) return;
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 仅对 body 内的卡片做淡入；动画缺失或失败时必须复位 opacity，否则看板会整片空白（Phase 6 回归点）
    const bdBody = root.querySelector ? root.querySelector('#bd-dir-body') : null;
    const animTarget = bdBody || root;
    if (!reduceMotion && typeof animateBigdata === 'function') {
      animTarget.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = '0'; });
    }
    requestAnimationFrame(() => {
      try {
        if (typeof animateBigdata === 'function' && !reduceMotion) animateBigdata(animTarget, reduceMotion);
        else animTarget.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = ''; });
      } catch (e) {
        animTarget.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = ''; });
      }
    });
    root.querySelectorAll && root.querySelectorAll('.bigdata-card.is-expandable').forEach(card => {
      const t = card.querySelector('.bd-expand-toggle');
      if (t) t.addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('is-open'); });
    });
    root.querySelectorAll && root.querySelectorAll('.bd-seg button[data-range]').forEach(b => {
      b.addEventListener('click', () => { AppState.bigdataRange = b.dataset.range; window.bdSwitchDir && window.bdSwitchDir(window.bdCurrentDir ? window.bdCurrentDir() : 'weight'); });
    });
    root.querySelectorAll && root.querySelectorAll('.bd-insight[data-key]').forEach(el => {
      el.addEventListener('click', () => {
        const card = (root.querySelector ? root : document).querySelector('.bigdata-card[data-bd-key="' + el.dataset.key + '"]');
        if (card) { card.classList.add('is-open'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    });
    root.querySelectorAll && root.querySelectorAll('.bd-export-link[data-export="names"]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        try {
          const dir = (window.bdCurrentDir && window.bdCurrentDir()) || 'weight';
          if (dir === 'fall') {
            const recs = (window.Pages && window.Pages._fallBodyRecords) || [];
            if (window.Pages && window.Pages.bdExportFallNames) window.Pages.bdExportFallNames(recs);
            else U.toast('跌倒风险导出未就绪', 'warning');
            return;
          }
          const arr = (AppState.bigdataRange && AppState.bigdataRange !== 'all') ? filterPatientsByRange(AppState.bigdataDemo ? AppState.bigdataDemoPatients : (AppState.patients || []), AppState.bigdataRange) : (AppState.bigdataDemo ? AppState.bigdataDemoPatients : (AppState.patients || []));
          if (window.bdExportNames) window.bdExportNames(arr);
        } catch (err) { U.toast('导出失败：' + (err.message || err), 'error'); }
      });
    });
    // 体重方向的全屏（bd-fs-btn 兜底）
    const localFs = root.querySelector('#bd-fs-btn');
    if (localFs) localFs.addEventListener('click', () => { if (window.Fullscreen) window.Fullscreen.open('bigdata'); });
    // 体重方向的演示按钮（仅在 weight body 内）
    const localDemo = root.querySelector('#bd-demo-btn');
    if (localDemo && !localDemo.__bound) {
      localDemo.addEventListener('click', () => {
        AppState.bigdataDemo = !AppState.bigdataDemo;
        if (!AppState.bigdataDemo) AppState.bigdataDemoPatients = null;
        window.bdSwitchDir && window.bdSwitchDir('weight');
      });
      localDemo.__bound = true;
    }
    // 肌少症 / 跌倒嵌入体的专项交互（事件委托，仅挂载一次，避免 body 重渲染时重复绑定）
    if (!root.__bdDelegated) {
      root.__bdDelegated = true;
      root.addEventListener('click', bdDelegatedClick);
    }
  }

  // —— 嵌入体专项交互（事件委托）——
  function bdDelegatedClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const donut = t.closest('.bd-donut-seg');
    if (donut) { bdToggleSarcFilter(donut.dataset.dim, donut.dataset.val); return; }
    const chip = t.closest('.sarc-chip');
    if (chip) { bdToggleSarcFilter(chip.dataset.dim, chip.dataset.val); return; }
    const row = t.closest('.master-row');
    if (row) {
      row.classList.toggle('open');
      const sub = row.nextElementSibling;
      if (sub && sub.classList.contains('sub-row')) sub.classList.toggle('open');
      return;
    }
    if (t.closest('#fb-reset')) { AppState.sarcStatsFilter = {}; Pages._sarcBodyCache = null; bdRerenderBody(); return; }
    const view = t.closest('.sarc-view');
    if (view) { bdOpenSarcReport(view.dataset.id); return; }
    if (t.closest('#btn-export-csv')) { bdExportSarcCsv(); return; }
    if (t.closest('#btn-export-json')) { bdExportSarcJson(); return; }
    if (t.closest('#btn-clear-sarc')) { bdClearSarc(); return; }
  }
  function bdToggleSarcFilter(dim, val) {
    const F = AppState.sarcStatsFilter || {};
    if (F[dim] === val) delete F[dim]; else F[dim] = val;
    AppState.sarcStatsFilter = F;
    Pages._sarcBodyCache = null; // 强制按新筛选重新渲染
    bdRerenderBody();
  }
  function bdRerenderBody() {
    const body = document.querySelector('#bd-dir-body');
    if (!body) return;
    const dir = (window.bdCurrentDir && window.bdCurrentDir()) || 'weight';
    body.innerHTML = bdBuildBody(dir);
    body.dataset.curDir = dir;
    const page = document.querySelector('.bigdata-page');
    if (page) queueBdBodyBindings(page);
  }
  function bdOpenSarcReport(id) {
    const rec = (typeof D === 'function' ? D() : null);
    const r = rec && rec.byId ? rec.byId(id) : null;
    if (!r) { U.toast('记录不存在', 'error'); return; }
    U.modal({
      title: '肌少症专项评估报告 · ' + r.no, width: '1080px',
      body: '<div id="sarc-report-host" style="max-height:70vh;overflow:auto;">' + (window.buildSarcReport ? window.buildSarcReport(r) : '报告生成失败') + '</div>',
      footer: '<button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-success" id="m-print-sarc">打印 / 导出</button>',
      onMount: (m) => { const pb = U.qs('#m-print-sarc', m); if (pb) pb.onclick = () => { try { window.print(); } catch (e) {} }; }
    });
  }
  function bdExportSarcCsv() {
    const rec = (typeof D === 'function' ? D() : null);
    const all = rec && rec.list ? rec.list() : [];
    if (!all.length) return U.toast('暂无数据可导出', 'warning');
    const head = ['评估编号', '姓名', '性别', '年龄', '评估日期', '小腿围', '握力', '步速', 'SMI', '体脂率', '内脏脂肪', 'SPPB', 'CFS', 'SARC-F', '生活方式得分', '跌倒风险指数', '风险等级', '肌少症分级', '干预方向', '建议复查'];
    const rows = all.map(r => {
      const rs = r.result || {}, i = r.input || {}, b = i.body || {};
      return [r.no, r.patientName, r.gender === 'female' ? '女' : '男', r.age, r.assessDate,
        i.calf, i.grip, i.gait, b.smi, b.bodyFat, b.visceral,
        rs.sppb && rs.sppb.complete ? rs.sppb.total : '', rs.cfs && rs.cfs.has ? rs.cfs.value : '',
        rs.sarcf && rs.sarcf.complete ? rs.sarcf.total : '', rs.life ? rs.life.total : '',
        rs.fall ? rs.fall.index : '', rs.fall ? rs.fall.level : '',
        rs.direction ? rs.direction.sarcGrade : '', rs.direction ? rs.direction.full : '',
        r.reviewDate || (rs.plan && rs.plan.reviewDate) || ''];
    });
    const csv = '﻿' + [head, ...rows].map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\n');
    if (typeof downloadBlob === 'function') downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), '肌少症专项台账_' + U.today() + '.csv');
    U.toast('CSV 已导出', 'success');
  }
  function bdExportSarcJson() {
    const rec = (typeof D === 'function' ? D() : null);
    const data = rec && rec.exportAll ? rec.exportAll() : (rec && rec.list ? rec.list() : []);
    if (typeof downloadBlob === 'function') downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), '肌少症模块数据_' + U.today() + '.json');
    U.toast('JSON 已导出', 'success');
  }
  function bdClearSarc() {
    U.confirm('确认清空「老年人体重管理 & 肌少症专项模块」全部评估数据？该操作不可恢复，且不影响其他模块数据。', () => {
      const rec = (typeof D === 'function' ? D() : null);
      if (rec && rec.clearAll) rec.clearAll();
      AppState.sarcStatsFilter = {};
      Pages._sarcBodyCache = null;
      U.toast('本模块数据已清空', 'success');
      if (window.route) window.route();
    });
  }

  // 体重方向：保留原体重 body 计算（共享数据源）
  function bdBuildBody(dir) {
    if (dir === 'sarcopenia') {
      try {
        if (typeof Pages._sarcBodyHtml === 'function') return Pages._sarcBodyHtml();
      } catch (e) { /* noop */ }
      return '<div class="alert alert-warning">肌少症看板未加载</div>';
    }
    if (dir === 'fall') {
      try {
        if (typeof Pages._fallBodyHtml === 'function') return Pages._fallBodyHtml();
      } catch (e) { /* noop */ }
      return '<div class="alert alert-warning">跌倒风险看板未加载</div>';
    }
    return bdBuildWeightBody();
  }

  function bdBuildWeightBody() {
    const useDemo = AppState.bigdataDemo === true;
    if (useDemo && !AppState.bigdataDemoPatients) {
      AppState.bigdataDemoPatients = demoPatients();
    }
    const range = AppState.bigdataRange || 'all';
    const allPatients = useDemo ? (AppState.bigdataDemoPatients || []) : (AppState.patients || []);
    const patients = filterPatientsByRange(allPatients, range);
    const s = calcStats(patients);
    const pan = buildPanels(s, patients);
    const railHtml = buildInsightRail(s, range);
    const controlBarHtml = controlBarHTML(range);

    const genderData = [{ label: '男', value: s.male }, { label: '女', value: s.female }].filter(d => d.value);
    const ageData = Object.entries(s.ageGroups).map(([label, value]) => ({ label, value })).filter(d => d.value);
    const bmiData = [
      { label: '偏瘦', value: s.bmiGroups.under }, { label: '正常', value: s.bmiGroups.normal },
      { label: '超重', value: s.bmiGroups.over }, { label: '肥胖', value: s.bmiGroups.obese }
    ].filter(d => d.value);
    const riskData = [
      { label: '低风险', value: s.riskGroups.low },
      { label: '中风险', value: s.riskGroups.medium },
      { label: '高风险', value: s.riskGroups.high }
    ].filter(d => d.value);
    const lifeData = [
      { label: '优秀', value: s.lifeGroups.excellent }, { label: '良好', value: s.lifeGroups.good },
      { label: '一般', value: s.lifeGroups.medium }, { label: '较差', value: s.lifeGroups.poor }
    ].filter(d => d.value);
    const planTypeData = [
      { label: '饮食', value: s.planTypes.diet }, { label: '有氧', value: s.planTypes.aerobic },
      { label: '抗阻', value: s.planTypes.resistance }, { label: '柔韧', value: s.planTypes.flexibility },
      { label: '平衡', value: s.planTypes.balance }
    ].filter(d => d.value);

    const maxAge = Math.max(...Object.values(s.ageGroups), 1);
    const maxLife = Math.max(...Object.values(s.lifeGroups), 1);
    const maxPlanType = Math.max(...planTypeData.map(d => d.value), 1);

    // 县区分布 TOP 8
    let countyHtml = '';
    {
      const countyMap = new Map();
      (patients || []).forEach(p => {
        const c = (p.data && p.data.patient && p.data.patient.region && p.data.patient.region.county) || '';
        if (!c) return;
        countyMap.set(c, (countyMap.get(c) || 0) + 1);
      });
      if (countyMap.size) {
        const arr = Array.from(countyMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const max = Math.max(...arr.map(x => x[1]), 1);
        countyHtml = `<div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📍</span>体重管理患者 · 县区分布 TOP 8</h3><span class="text-muted" style="font-size:12px;">按覆盖人数</span></div>
          <div class="card-body">${arr.map(([k, v]) => `
            <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
              <span style="width:78px;font-size:12px;color:var(--text-secondary);">${U.esc(k)}</span>
              <div style="flex:1;height:14px;border-radius:7px;background:var(--bg-subtle);overflow:hidden;">
                <div style="height:100%;width:${Math.round(v / max * 100)}%;background:linear-gradient(90deg,#f2651e,#1d9e75);border-radius:7px;"></div>
              </div>
              <span style="width:24px;text-align:right;font-size:12px;font-weight:600;">${v}</span>
            </div>`).join('')}
          </div>
        </div>`;
      }
    }

    return `
      ${controlBarHtml}
      ${railHtml}
      ${countyHtml}
      <div class="bigdata-grid">
        ${kpiCardHTML({ key:'total', label:'患者总数', value:s.total, trend:`近 7 天新增 ${s.recent7} 人 · 近 30 天 ${s.recent30} 人`, panel:pan.total, narrative:'覆盖全部建档人群，展开看性别构成与近期新增。' })}
        ${kpiCardHTML({ key:'assessed', label:'已完成综合评估', value:s.assessed, trend:`覆盖率 ${s.total ? Math.round(s.assessed / s.total * 100) : 0}%`, panel:pan.assessed, narrative:'评估覆盖率，展开看待评估名单。' })}
        ${kpiCardHTML({ key:'planDone', label:'已生成干预方案', value:s.planDone, trend:`转化率 ${s.total ? Math.round(s.planDone / s.total * 100) : 0}%`, panel:pan.planDone, narrative:'评估到方案的转化情况。' })}
        ${kpiCardHTML({ key:'strength', label:'肌力测评记录', value:s.strengthTests, trend:`${s.strengthPatients} 人已测评`, panel:pan.strength, narrative:'等速 / 等张肌力测评总量。' })}
        ${kpiCardHTML({ key:'avgBmi', label:'平均 BMI', value:s.avgBmi, trend:`基于 ${s.bmiGroups.under + s.bmiGroups.normal + s.bmiGroups.over + s.bmiGroups.obese} 条有效数据`, panel:pan.avgBmi, narrative:'按中国标准四级划分 BMI。' })}
        ${kpiCardHTML({ key:'avgAge', label:'平均年龄', value:s.avgAge, trend:'人群年龄中位数参考', panel:pan.avgAge, narrative:'年龄结构，45 岁以上为重点。' })}
        ${kpiCardHTML({ key:'abnormalWaist', label:'腰围/腰臀比异常', value:s.abnormalWaist, trend:'中心性肥胖风险关注', panel:pan.abnormalWaist, narrative:'腰围 / 腰臀比异常人数。' })}
        ${kpiCardHTML({ key:'hypertension', label:'高血压倾向', value:s.hypertension, trend:'收缩压 ≥140 或 舒张压 ≥90', panel:pan.hypertension, narrative:'血压偏高人数。' })}
      </div>
      <div class="bigdata-grid-2">
        ${chartCardHTML({ key:'gender', title:'性别构成', chartRow: donutChart(genderData, ['var(--skin-c1)', 'var(--skin-c2)'], 120) + legendHTML(genderData, ['var(--skin-c1)', 'var(--skin-c2)']), panel: pan.gender, narrative:'男女比例与平均年龄，展开看明细。' })}
        ${chartCardHTML({ key:'age', title:'年龄分布', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${barChart(ageData, maxAge, 'var(--skin-c3)')}</div>`, panel: pan.age, narrative:'年龄分布，核心干预人群。' })}
        ${chartCardHTML({ key:'bmi', title:'BMI 分布', chartRow: donutChart(bmiData, SEM.bmi, 120) + legendHTML(bmiData, SEM.bmi), panel: pan.bmi, narrative:'中国标准四级 BMI 分布。' })}
        ${chartCardHTML({ key:'risk', title:'健康风险分层', chartRow: donutChart(riskData, SEM.risk, 120) + legendHTML(riskData, SEM.risk), panel: pan.risk, narrative:'健康风险低 / 中 / 高分层。' })}
        ${chartCardHTML({ key:'life', title:'生活方式健康度', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${barChart(lifeData, maxLife, 'var(--skin-c4)')}</div>`, panel: pan.life, narrative:'生活方式健康度分级。' })}
        ${chartCardHTML({ key:'trend', title:'近 30 天建档趋势', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${lineChart(s.trend30, 'var(--skin-c1)')}</div>`, panel: pan.trend, narrative:'近 30 天每日建档趋势。' })}
        ${chartCardHTML({ key:'doctor', title:'医生工作量 TOP5', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${hbarChart(s.doctorData.slice(0, 5), 'var(--skin-c3)')}</div>`, panel: pan.doctor, narrative:'医生建档量 TOP5。' })}
        ${chartCardHTML({ key:'planType', title:'方案类型覆盖', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${barChart(planTypeData, maxPlanType, 'var(--skin-c4)')}</div>`, panel: pan.planType, narrative:'五类方案覆盖率。' })}
        ${chartCardHTML({ key:'funnel', title:'业务完成漏斗', chartRow: `<div class="bigdata-funnel">
            <div class="bigdata-funnel-item"><span>建档</span><b>${s.total}</b></div>
            <div class="bigdata-funnel-item"><span>完成评估</span><b>${s.assessed}</b></div>
            <div class="bigdata-funnel-item"><span>肌力测评</span><b>${s.strengthPatients}</b></div>
            <div class="bigdata-funnel-item"><span>生成方案</span><b>${s.planDone}</b></div>
          </div>`, panel: pan.funnel, narrative:'业务漏斗各环节转化。' })}
      </div>`;
  }
})();
