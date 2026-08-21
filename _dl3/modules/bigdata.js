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
        if (d === 'spine' || d === 'spine-health') return 'spine';
      }
    } catch (e) { /* noop */ }
    return 'weight';
  }

  function renderBdShell(dir) {
    const titleMap = {
      weight: '🚀 鹊动FAC大数据看板 · 鹊动健康数据总览',
      sarcopenia: '🧓 老年肌少症-跌倒风险 · 数据看板',
      fall: '🤸 跌倒风险 · 数据看板',
      spine: '🦴 青少年脊柱健康 · 数据看板'
    };
    const subMap = {
      weight: '实时汇总体重管理档案、评估、方案、肌力、生活方式等核心指标',
      sarcopenia: '覆盖肌少症老人首诊档案、SPPB / CFS / SARC-F / 跌倒风险等级分布',
      fall: '覆盖跌倒风险评估记录、复评依从、县区分布、高风险因素排序',
      spine: '覆盖青少年首诊登记、Cobb 角分布、风险分层、Lenke 弯型与年龄段分布'
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
        <button type="button" class="bd-dir-seg-btn ${segActive('spine')}" data-bd-dir="spine" role="tab"><span class="bd-dir-icon">🦴</span><span class="bd-dir-text">青少年脊柱</span></button>
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
    if (dir === 'spine') return 'spineStatsDemo';
    return 'bigdataDemo';
  }
  function bdFullscreenKey(dir) {
    if (dir === 'sarcopenia') return 'sarc';
    if (dir === 'fall') return 'fall';
    if (dir === 'spine') return 'spine';
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
      weight: '🚀 鹊动FAC大数据看板 · 鹊动健康数据总览',
      sarcopenia: '🧓 老年肌少症-跌倒风险 · 数据看板',
      fall: '🤸 跌倒风险 · 数据看板',
      spine: '🦴 青少年脊柱健康 · 数据看板'
    };
    const subMap = {
      weight: '实时汇总体重管理档案、评估、方案、肌力、生活方式等核心指标',
      sarcopenia: '覆盖肌少症老人首诊档案、SPPB / CFS / SARC-F / 跌倒风险等级分布',
      fall: '覆盖跌倒风险评估记录、复评依从、县区分布、高风险因素排序',
      spine: '覆盖青少年首诊登记、Cobb 角分布、风险分层、Lenke 弯型与年龄段分布'
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
      b.addEventListener('click', () => {
        const dir = window.bdCurrentDir ? window.bdCurrentDir() : 'weight';
        if (dir === 'spine' || dir === 'spine-health') AppState.spineStatsRange = b.dataset.range;
        else AppState.bigdataRange = b.dataset.range;
        window.bdSwitchDir && window.bdSwitchDir(dir);
      });
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
    if (dir === 'spine') {
      try { return bdBuildSpineBody(); } catch (e) { return '<div class="alert alert-warning">青少年脊柱健康看板渲染失败</div>'; }
    }
    return bdBuildWeightBody();
  }

  /* 青少年脊柱健康看板（方案第 13 条：演示数据 + 全屏展示） */
  function bdBuildSpineBody() {
    /* 脊柱大数据看板：与体重/肌少症看板共用 kpiCardHTML / chartCardHTML 组件。
       网格容器采用 bigdata-grid / bigdata-grid-2 的模块子类命名（bigdata-grid-spine-kpi、bigdata-grid-spine-charts），
       KPI 与图表 key 语义统一（total / avgCobb / risk / cobb …），便于 .bd-insight[data-key] 洞察联动渲染。 */
    /* 智能回退：无真实数据时自动启用演示，保证首次进入有内容可见；
       只有用户主动点击过「退出演示」才不自动开启 */
    const hasReal = (AppState.patients || []).some(p => p.module === 'spine' || p.spine || (p.result && p.result.riskName && p.base && p.base.staticCobb != null));
    if (!hasReal && AppState.spineStatsDemo !== false && !AppState.spineStatsDemoPatients) {
      AppState.spineStatsDemoPatients = spineDemoPatients();
      AppState.spineStatsDemo = true;
    }
    const useDemo = AppState.spineStatsDemo === true;
    const range = AppState.spineStatsRange || 'all';
    if (useDemo && !AppState.spineStatsDemoPatients) {
      AppState.spineStatsDemoPatients = spineDemoPatients();
    }
    const all = useDemo ? (AppState.spineStatsDemoPatients || []) : (AppState.patients || []);
    const patients = all.filter(p => p.module === 'spine' || p.spine || (p.result && p.result.riskName && p.base && p.base.staticCobb != null));
    if (!patients.length) return '<div class="alert alert-info">暂无青少年脊柱健康评估数据，点击右上角「演示数据」查看示例看板。</div>';

    /* 按时间范围过滤 */
    const rangeMs = range === '7d' ? 7 * 86400e3 : range === '30d' ? 30 * 86400e3 : Infinity;
    const ranged = range === 'all' ? patients : patients.filter(p => p.createdAt && (Date.now() - new Date(p.createdAt).getTime()) <= rangeMs);
    const s = spineCalcStats(ranged);
    const pan = spineBuildPanels(s);
    const controlBarHtml = spineControlBarHTML(range);

    /* 准备图表数据 */
    const riskData = [
      { label: '低风险', value: s.riskGroups.low },
      { label: '中风险', value: s.riskGroups.mid },
      { label: '高风险', value: s.riskGroups.high }
    ].filter(d => d.value);
    const cobbData = [
      { label: '10-24° (轻度)', value: s.cobbBuckets['10-24°'] },
      { label: '25-44° (中度)', value: s.cobbBuckets['25-44°'] },
      { label: '≥45° (重度)', value: s.cobbBuckets['≥45°'] }
    ].filter(d => d.value);
    const ageData = Object.entries(s.ageGroups).map(([label, value]) => ({ label, value })).filter(d => d.value);
    const genderData = [{ label: '男', value: s.male }, { label: '女', value: s.female }].filter(d => d.value);
    const risserData = Object.entries(s.risserGroups).map(([label, value]) => ({ label, value })).filter(d => d.value);
    const lenkeData = Object.entries(s.lenkeGroups).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const SEMspine = {
      risk: ['#34d399', '#fbbf24', '#f87171'],
      cobb: ['#34d399', '#fbbf24', '#f87171'],
      gender: ['#60a5fa', '#f472b6'],
      risser: ['#22d3ee', '#fbbf24', '#f87171']
    };
    const maxAge = Math.max(...Object.values(s.ageGroups), 1);
    const maxCobb = Math.max(...Object.values(s.cobbBuckets), 1);
    const maxLenke = Math.max(...lenkeData.map(d => d.value), 1);

    return `
      ${controlBarHtml}

      <div class="bigdata-grid bigdata-grid-spine-kpi">
        ${kpiCardHTML({ key: 'total', label: '总评估人数', value: s.total, trend: `近 7 天 ${s.recent7} 人 / 近 30 天 ${s.recent30} 人`, panel: pan.total, narrative: '全部青少年脊柱评估人数。' })}
        ${kpiCardHTML({ key: 'avgCobb', label: '平均 Cobb 角', value: s.avgCobb + '°', trend: `平均年龄 ${s.avgAge} 岁 · 参照 SRS 影像标准`, panel: pan.avgCobb, narrative: '基于静态 Cobb 角测量值。' })}
        ${kpiCardHTML({ key: 'highRisk', label: '需支具/手术评估', value: s.riskGroups.high, trend: `高风险占比 ${s.total ? Math.round(s.riskGroups.high / s.total * 100) : 0}%`, panel: pan.highRisk, narrative: 'Cobb 角 ≥25° 通常需要支具，≥45° 建议手术。' })}
        ${kpiCardHTML({ key: 'planRate', label: '方案转化率', value: s.total ? Math.round(s.planDone / s.total * 100) + '%' : '0%', trend: `已生成 ${s.planDone} 份干预方案`, panel: pan.planRate, narrative: '评估 → 干预方案的转化情况。' })}
      </div>

      <div class="bigdata-grid-2 bigdata-grid-spine-charts">
        ${chartCardHTML({ key: 'risk', title: '风险等级分布', chartRow: donutChart(riskData, SEMspine.risk, 120) + legendHTML(riskData, SEMspine.risk), panel: miniList(riskData.map(d => ({ label: d.label, value: d.value, pct: s.total ? Math.round(d.value / s.total * 100) : 0 }))), narrative: '高/中/低风险青少年人数分布。' })}
        ${chartCardHTML({ key: 'cobb', title: 'Cobb 角分级', chartRow: `<div class="bigdata-chart-canvas">${barChart(cobbData, maxCobb, '#60a5fa')}</div>` + legendHTML(cobbData, SEMspine.cobb), panel: miniList(cobbData.map(d => ({ label: d.label, value: d.value }))), narrative: '10-24° 轻度，25-44° 中度，≥45° 重度。' })}
        ${chartCardHTML({ key: 'lenke', title: 'Lenke 弯曲分型分布', chartRow: `<div class="bigdata-chart-canvas">${hbarChart(lenkeData, '#534AB7')}</div>`, panel: miniList(lenkeData.map(d => ({ label: d.label, value: d.value }))), narrative: 'Lenke 1-6 型分布，决定手术入路选择。' })}
        ${chartCardHTML({ key: 'age', title: '年龄段分布', chartRow: `<div class="bigdata-chart-canvas">${barChart(ageData, maxAge, '#22d3ee')}</div>`, panel: miniList(ageData.map(d => ({ label: d.label, value: d.value }))), narrative: '≥10 岁青少年脊柱侧弯高发期。' })}
        ${chartCardHTML({ key: 'gender', title: '性别构成', chartRow: donutChart(genderData, SEMspine.gender, 120) + legendHTML(genderData, SEMspine.gender), panel: miniList(genderData.map(d => ({ label: d.label === '男' ? '男性' : '女性', value: d.value, pct: s.total ? Math.round(d.value / s.total * 100) : 0 }))), narrative: '女性青春期脊柱侧弯发病率显著高于男性。' })}
        ${chartCardHTML({ key: 'risser', title: 'Risser 骨骼成熟度', chartRow: donutChart(risserData, SEMspine.risser, 120) + legendHTML(risserData, SEMspine.risser), panel: miniList(risserData.map(d => ({ label: d.label, value: d.value }))), narrative: 'Risser 0-2 进展风险高，4-5 已趋成熟。' })}
        ${chartCardHTML({ key: 'trend', title: '近 14 天评估趋势', chartRow: `<div class="bigdata-chart-canvas">${lineChart(s.trend14, '#22d3ee')}</div>`, panel: `<div class="bd-drill-note">14 天日均评估约 ${(s.trend14.reduce((sum, t) => sum + t.value, 0) / 14).toFixed(1)} 人；峰值 ${Math.max(...s.trend14.map(t => t.value))} 人。</div>`, narrative: '每日评估建档趋势。' })}
        ${chartCardHTML({ key: 'month', title: '近 6 月评估趋势', chartRow: `<div class="bigdata-chart-canvas">${barChart(s.trend6, Math.max(...s.trend6.map(t => t.value), 1), '#0ea5e9')}</div>`, panel: `<div class="bd-drill-note">近 6 个月每月评估人数 ${s.trend6.map(t => t.label + '：' + t.value).join(' · ')}。</div>`, narrative: '长周期评估趋势。' })}
        ${chartCardHTML({ key: 'doctor', title: '医生工作量 TOP5', chartRow: `<div class="bigdata-chart-canvas">${hbarChart(s.doctorData.slice(0, 5), '#534AB7')}</div>`, panel: miniList(s.doctorData.map(d => ({ label: d.label, value: d.value }))), narrative: '评估量 TOP5 医生。' })}
        ${chartCardHTML({ key: 'county', title: '县区分布 TOP8', chartRow: s.countyData.length ? `<div class="bigdata-chart-canvas">${hbarChart(s.countyData, '#22d3ee')}</div>` : '<div style="text-align:center;color:var(--text-muted);padding:24px;">暂无县区信息</div>', panel: miniList(s.countyData.map(d => ({ label: d.label, value: d.value }))), narrative: '青少年脊柱评估县区分布。' })}
        ${chartCardHTML({ key: 'funnel', title: '业务完成漏斗', chartRow: `<div class="bigdata-funnel">
            <div class="bigdata-funnel-item"><span>总评估</span><b>${s.total}</b></div>
            <div class="bigdata-funnel-item"><span>高风险</span><b>${s.riskGroups.high}</b></div>
            <div class="bigdata-funnel-item"><span>生成方案</span><b>${s.planDone}</b></div>
          </div>`, panel: miniList([
            { label: '评估 → 高风险识别率', value: s.total ? Math.round(s.riskGroups.high / s.total * 100) + '%' : '0%' },
            { label: '评估 → 方案转化', value: s.total ? Math.round(s.planDone / s.total * 100) + '%' : '0%' },
            { label: '高风险 → 方案转化', value: s.riskGroups.high ? Math.round(s.planDone / Math.max(1, s.riskGroups.high) * 100) + '%' : '0%' }
          ]) + `<div class="bd-drill-note">业务漏斗各环节转化，重点关注高风险人群是否及时生成方案。</div>`, narrative: '青少年脊柱业务漏斗。' })}
      </div>

      <div id="te-bd-block" data-te-bd></div>
    `;
  }

  function spineDemoPatients() {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
    const names = ['小明', '小红', '小丽', '小刚', '小芳', '小杰', '小敏', '小华', '小静', '小强'];
    const doctors = ['王医生', '李医生', '张医生', '赵医生', '刘医生', '孙医生'];
    const counties = ['海淀区', '朝阳区', '东城区', '西城区', '丰台区', '石景山', '通州区', '昌平区', '大兴区', '顺义区'];
    const lens = ['Lenke 1AN', 'Lenke 1BN', 'Lenke 2AN', 'Lenke 3', 'Lenke 4', 'Lenke 5', 'Lenke 6', '其他'];
    const out = [];
    const today = new Date();
    for (let i = 0; i < 96; i++) {
      const gender = Math.random() > 0.55 ? 'female' : 'male';
      const age = 10 + Math.floor(Math.random() * 10);  // 10-19
      const cobb = 10 + Math.round(Math.random() * 55); // 10-65
      const r = cobb >= 45 ? 'high' : cobb >= 25 ? 'mid' : 'low';
      const riskName = r === 'high' ? '高风险' : r === 'mid' ? '中风险' : '低风险';
      const risser = 0 + Math.floor(Math.random() * 6); // 0-5
      const hasPlan = r !== 'low' && Math.random() > 0.25;
      const createdDaysAgo = Math.floor(Math.random() * 60);
      const createdAt = new Date(today);
      createdAt.setDate(createdAt.getDate() - createdDaysAgo);
      out.push({
        id: 'spine_demo_' + i,
        module: 'spine',
        patientCode: 'QD-JZ-' + String(i + 1).padStart(5, '0'),
        name: surnames[i % surnames.length] + names[i % names.length],
        doctorId: doctors[i % doctors.length],
        createdAt: createdAt.toISOString(),
        data: { patient: { gender: gender, age: age, region: { county: counties[i % counties.length] } } },
        age: age,
        spine: { staticCobb: cobb, lenke: lens[Math.floor(Math.random() * lens.length)], risser: risser },
        result: { risk: r, riskName: riskName, base: { staticCobb: cobb, lenke: lens[i % lens.length] }, plan: hasPlan ? { generatedAt: new Date().toISOString() } : null }
      });
    }
    return out;
  }

  /* ===== 青少年脊柱专化统计（与体重看板相同的接口 / 字段） ===== */
  function spineCalcStats(patients) {
    const total = patients.length;
    const male = patients.filter(p => (p.data && p.data.patient && p.data.patient.gender) === 'male').length;
    const female = total - male;
    const ageGroups = { '≤12岁': 0, '13-15岁': 0, '16-18岁': 0, '>18岁': 0 };
    const cobbBuckets = { '10-24°': 0, '25-44°': 0, '≥45°': 0 };
    const riskGroups = { low: 0, mid: 0, high: 0 };
    const lenkeGroups = {};
    const risserGroups = { '0-1级': 0, '2-3级': 0, '4-5级': 0 };
    let ageSum = 0, ageCount = 0, cobbSum = 0, cobbN = 0;
    patients.forEach(p => {
      const sp = p.spine || {};
      const r = p.result && p.result.risk ? p.result.risk : null;
      const ag = (p.age != null ? p.age : (sp.age || (p.data && p.data.patient ? p.data.patient.age : null)));
      if (ag != null) { ageSum += ag; ageCount++; if (ag <= 12) ageGroups['≤12岁']++; else if (ag <= 15) ageGroups['13-15岁']++; else if (ag <= 18) ageGroups['16-18岁']++; else ageGroups['>18岁']++; }
      const cobb = parseFloat(sp.staticCobb);
      if (!isNaN(cobb) && cobb > 0) { cobbSum += cobb; cobbN++; if (cobb < 25) cobbBuckets['10-24°']++; else if (cobb < 45) cobbBuckets['25-44°']++; else cobbBuckets['≥45°']++; }
      if (r === 'high' || cobb >= 45) riskGroups.high++;
      else if (r === 'mid' || (cobb >= 25 && cobb < 45)) riskGroups.mid++;
      else riskGroups.low++;
      const lk = sp.lenke || '未分型'; lenkeGroups[lk] = (lenkeGroups[lk] || 0) + 1;
      const ris = parseInt(sp.risser);
      if (!isNaN(ris)) { if (ris <= 1) risserGroups['0-1级']++; else if (ris <= 3) risserGroups['2-3级']++; else risserGroups['4-5级']++; }
    });
    const recent7 = patients.filter(p => p.createdAt && ((Date.now() - new Date(p.createdAt).getTime()) <= 7 * 86400e3)).length;
    const recent30 = patients.filter(p => p.createdAt && ((Date.now() - new Date(p.createdAt).getTime()) <= 30 * 86400e3)).length;
    /* 月度趋势（最近 6 个月按 ISO 月份聚合） */
    const trend6 = [];
    const labels = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.getMonth() + 1 + '月';
      labels.push(label);
      const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const v = patients.filter(p => p.createdAt && p.createdAt.slice(0, 7) === ym).length;
      trend6.push({ label: label, value: v });
    }
    /* 14 天建档趋势（按用户日期粒度） */
    const trend14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const value = patients.filter(p => p.createdAt && p.createdAt.slice(0, 10) === ds).length;
      trend14.push({ label: i % 2 === 0 ? ds.slice(5) : '', value });
    }
    /* 医生工作量 TOP5 */
    const doctorMap = {};
    patients.forEach(p => { const d = p.doctorId || '未分配'; doctorMap[d] = (doctorMap[d] || 0) + 1; });
    const doctorData = Object.entries(doctorMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    /* 县区分布 TOP8 */
    const countyMap = {};
    patients.forEach(p => { const c = (p.data && p.data.patient && p.data.patient.region && p.data.patient.region.county) || ''; if (c) countyMap[c] = (countyMap[c] || 0) + 1; });
    const countyData = Object.entries(countyMap).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    /* 干预方案生成数 */
    const planDone = patients.filter(p => p.result && p.result.plan && p.result.plan.generatedAt).length;
    return {
      total, male, female, ageGroups, cobbBuckets, riskGroups, lenkeGroups, risserGroups,
      avgCobb: cobbN ? (cobbSum / cobbN).toFixed(1) : '—',
      avgAge: ageCount ? (ageSum / ageCount).toFixed(1) : '—',
      recent7, recent30, trend6, trend14, doctorData, countyData, planDone
    };
  }

  function spineBuildPanels(s) {
    const T = s.total || 1;
    return {
      total: miniList([
        { label: '总评估数', value: s.total },
        { label: '近 7 天新增', value: s.recent7 },
        { label: '近 30 天新增', value: s.recent30 },
        { label: '男性占比', value: T ? Math.round(s.male / T * 100) + '%' : '0%' },
        { label: '女性占比', value: T ? Math.round(s.female / T * 100) + '%' : '0%' }
      ]) + `<div class="bd-drill-note">青少年脊柱健康评估总人数；按性别与近期新增查看增长趋势。</div>`,
      avgCobb: miniList([
        { label: '平均 Cobb 角', value: s.avgCobb + '°' },
        { label: '10-24° 轻度', value: s.cobbBuckets['10-24°'], pct: T ? Math.round(s.cobbBuckets['10-24°'] / T * 100) : 0 },
        { label: '25-44° 中度', value: s.cobbBuckets['25-44°'], pct: T ? Math.round(s.cobbBuckets['25-44°'] / T * 100) : 0 },
        { label: '≥45° 重度', value: s.cobbBuckets['≥45°'], pct: T ? Math.round(s.cobbBuckets['≥45°'] / T * 100) : 0 }
      ]) + `<div class="bd-drill-note">Cobb 角是评估脊柱侧弯严重程度的核心指标，≥25° 通常需要支具治疗，≥45° 建议手术评估。</div>`,
      highRisk: miniList([
        { label: '高风险（Cobb≥45°）', value: s.riskGroups.high },
        { label: '中风险（Cobb 25-44°）', value: s.riskGroups.mid },
        { label: '低风险（Cobb<25°）', value: s.riskGroups.low },
        { label: '高风险占比', value: T ? Math.round(s.riskGroups.high / T * 100) + '%' : '0%' }
      ]) + `<div class="bd-drill-note">高风险患者需要尽快支具/手术评估；中风险每 3 月随访。</div>`,
      planRate: miniList([
        { label: '已生成方案', value: s.planDone },
        { label: '方案转化率', value: T ? Math.round(s.planDone / T * 100) + '%' : '0%' },
        { label: '未生成方案', value: T - s.planDone }
      ]) + `<div class="bd-drill-note">评估 → 干预方案转化情况，转化越高说明随访越紧密。</div>`
    };
  }

  function spineControlBarHTML(range) {
    const segs = [['all', '全部'], ['30d', '近30天'], ['7d', '近7天']];
    return `<div class="bd-controlbar"><span style="font-size:13px;color:var(--text-muted);font-weight:600;">时间范围</span>
      <div class="bd-seg">${segs.map(([v, l]) => `<button data-range="${v}" class="${range === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>`;
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
        ${chartCardHTML({ key:'age', title:'年龄分布', chartRow: `<div class="bigdata-chart-canvas">${barChart(ageData, maxAge, 'var(--skin-c3)')}</div>`, panel: pan.age, narrative:'年龄分布，核心干预人群。' })}
        ${chartCardHTML({ key:'bmi', title:'BMI 分布', chartRow: donutChart(bmiData, SEM.bmi, 120) + legendHTML(bmiData, SEM.bmi), panel: pan.bmi, narrative:'中国标准四级 BMI 分布。' })}
        ${chartCardHTML({ key:'risk', title:'健康风险分层', chartRow: donutChart(riskData, SEM.risk, 120) + legendHTML(riskData, SEM.risk), panel: pan.risk, narrative:'健康风险低 / 中 / 高分层。' })}
        ${chartCardHTML({ key:'life', title:'生活方式健康度', chartRow: `<div class="bigdata-chart-canvas">${barChart(lifeData, maxLife, 'var(--skin-c4)')}</div>`, panel: pan.life, narrative:'生活方式健康度分级。' })}
        ${chartCardHTML({ key:'trend', title:'近 30 天建档趋势', chartRow: `<div class="bigdata-chart-canvas">${lineChart(s.trend30, 'var(--skin-c1)')}</div>`, panel: pan.trend, narrative:'近 30 天每日建档趋势。' })}
        ${chartCardHTML({ key:'doctor', title:'医生工作量 TOP5', chartRow: `<div class="bigdata-chart-canvas">${hbarChart(s.doctorData.slice(0, 5), 'var(--skin-c3)')}</div>`, panel: pan.doctor, narrative:'医生建档量 TOP5。' })}
        ${chartCardHTML({ key:'planType', title:'方案类型覆盖', chartRow: `<div class="bigdata-chart-canvas">${barChart(planTypeData, maxPlanType, 'var(--skin-c4)')}</div>`, panel: pan.planType, narrative:'五类方案覆盖率。' })}
        ${chartCardHTML({ key:'funnel', title:'业务完成漏斗', chartRow: `<div class="bigdata-funnel">
            <div class="bigdata-funnel-item"><span>建档</span><b>${s.total}</b></div>
            <div class="bigdata-funnel-item"><span>完成评估</span><b>${s.assessed}</b></div>
            <div class="bigdata-funnel-item"><span>肌力测评</span><b>${s.strengthPatients}</b></div>
            <div class="bigdata-funnel-item"><span>生成方案</span><b>${s.planDone}</b></div>
          </div>`, panel: pan.funnel, narrative:'业务漏斗各环节转化。' })}
      </div>

      <div id="te-bd-block" data-te-bd></div>
    `;
  }
})();
