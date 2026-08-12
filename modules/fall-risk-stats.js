/**
 * 跌倒风险看板（数据看板中心 · 第三大方向）
 * 汇总全部患者的跌倒风险评估记录：风险等级分布、高危危险因子频次、
 * 年龄/性别构成、核心量表均值（FES-I / TUG / 步速 等）、近 30 天评估趋势、
 * 重点干预命中与智能洞察。复用 DashCore 的图表/卡片/动效。
 */
(function () {
  'use strict';
  const Dash = window.DashCore;
  const {
    donutChart, barChart, lineChart, hbarChart, legendHTML,
    animateBigdata, kpiCardHTML, chartCardHTML, miniList, downloadBlob, SEM
  } = Dash;

  const LEVEL_LABEL = { high: '高危', mid: '中危', low: '低危' };
  const LEVEL_COLOR = { high: '#f87171', mid: '#fbbf24', low: '#34d399' };

  function allRecords() {
    const out = [];
    (AppState.patients || []).forEach(p => {
      const arr = (p && p.data && Array.isArray(p.data.fallRecords)) ? p.data.fallRecords : [];
      arr.forEach(r => out.push(r));
    });
    return out;
  }

  // 演示数据：随机生成若干跌倒评估记录（无真实数据时一键模拟）
  function demoFallRecords() {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
    const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '杰'];
    const doctors = ['王医生', '李医生', '张医生', '赵医生'];
    const arr = [];
    const today = new Date();
    for (let i = 0; i < 46; i++) {
      const gender = Math.random() > 0.5 ? 'female' : 'male';
      const age = Math.round(62 + Math.random() * 28);
      const isHigh = Math.random() > 0.62;
      const level = isHigh ? 'high' : (Math.random() > 0.5 ? 'mid' : 'low');
      const fes = Dash.clamp(Math.round(8 + Math.random() * 18), 0, 26);
      const tug = Dash.clamp(Math.round((level === 'high' ? 11 : 8) + Math.random() * 6), 5, 22);
      const gait = Dash.clamp(+(0.5 + Math.random() * 0.7).toFixed(2), 0.3, 1.4);
      const singleLeg = Dash.clamp(Math.round((level === 'high' ? 3 : 8) + Math.random() * 6), 0, 15);
      const chair = Dash.clamp(Math.round((level === 'high' ? 6 : 11) + Math.random() * 5), 2, 18);
      const falls = level === 'high' ? (Math.random() > 0.5 ? '2' : '1') : (Math.random() > 0.7 ? '1' : '0');
      const factors = [];
      if (fes >= 19) factors.push({ name: 'FES-I 跌倒恐惧≥19', severity: 'high', value: fes });
      else if (fes >= 14) factors.push({ name: 'FES-I 偏高风险', severity: 'mid', value: fes });
      if (tug > 12) factors.push({ name: 'TUG>12秒', severity: 'high', value: tug + 's' });
      else if (tug >= 10) factors.push({ name: 'TUG 10–12秒', severity: 'mid', value: tug + 's' });
      if (gait < 0.8) factors.push({ name: '4米步速<0.8 m/s', severity: 'high', value: gait + ' m/s' });
      else if (gait < 1.0) factors.push({ name: '4米步速0.8–1.0 m/s', severity: 'mid', value: gait + ' m/s' });
      if (singleLeg > 0 && singleLeg < 5) factors.push({ name: '单腿站立<5秒', severity: 'high', value: singleLeg + 's' });
      if (chair < 8) factors.push({ name: '30秒坐立<8次', severity: 'mid', value: chair + '次' });
      if (falls === '2') factors.push({ name: '近1年跌倒≥2次', severity: 'high', value: falls });
      else if (falls === '1') factors.push({ name: '近1年跌倒1次', severity: 'mid', value: falls });
      if (Math.random() > 0.7) factors.push({ name: '居家环境隐患', severity: 'high', value: '有' });
      if (Math.random() > 0.75) factors.push({ name: '服用镇静/降压/降糖药', severity: 'high', value: '有' });
      if (Math.random() > 0.8) factors.push({ name: '认知下降', severity: 'high', value: '下降' });
      const daysAgo = Math.floor(Math.random() * 60);
      const d = new Date(today); d.setDate(d.getDate() - daysAgo);
      arr.push({
        id: 'demo-fall-' + i,
        no: 'FALL-' + String(i + 1).padStart(3, '0'),
        patientName: surnames[i % surnames.length] + names[i % names.length],
        gender, age,
        assessDate: d.toISOString().slice(0, 10),
        doctor: doctors[i % doctors.length],
        result: { level, score: { high: factors.filter(f => f.severity === 'high').length, mid: factors.filter(f => f.severity === 'mid').length, low: 0 }, factors, summary: '' },
        input: { history: { fallsPast1y: falls, fearFallScore: String(fes) }, mobility: { tugSec: String(tug), gaitSpeed: String(gait), chair30: String(chair) }, balance: { singleLegSec: String(singleLeg) } }
      });
    }
    return arr;
  }

  function calc(recs) {
    const total = recs.length;
    const byLevel = { high: 0, mid: 0, low: 0 };
    const gender = { male: 0, female: 0 };
    const ageGroups = { '<65': 0, '65-74': 0, '75-84': 0, '≥85': 0 };
    const factCount = {};
    const factHigh = {};
    let fesSum = 0, fesN = 0, tugSum = 0, tugN = 0, gaitSum = 0, gaitN = 0, slSum = 0, slN = 0, chairSum = 0, chairN = 0;
    let ageSum = 0, ageCount = 0;
    const intervention = { env: 0, med: 0, cognition: 0, sensory: 0 };

    recs.forEach(r => {
      const lv = (r.result && r.result.level) || 'low';
      byLevel[lv] = (byLevel[lv] || 0) + 1;
      const g = r.gender === 'female' ? 'female' : 'male';
      gender[g]++;
      const a = U.num(r.age);
      if (a != null) { ageSum += a; ageCount++; if (a < 65) ageGroups['<65']++; else if (a < 75) ageGroups['65-74']++; else if (a < 85) ageGroups['75-84']++; else ageGroups['≥85']++; }
      (r.result && r.result.factors || []).forEach(f => {
        factCount[f.name] = (factCount[f.name] || 0) + 1;
        if (f.severity === 'high') factHigh[f.name] = (factHigh[f.name] || 0) + 1;
      });
      const inp = r.input || {};
      const fes = U.num(inp.history && inp.history.fearFallScore);
      if (fes != null) { fesSum += fes; fesN++; }
      const tug = U.num(inp.mobility && inp.mobility.tugSec);
      if (tug != null) { tugSum += tug; tugN++; }
      const gait = U.num(inp.mobility && inp.mobility.gaitSpeed);
      if (gait != null) { gaitSum += gait; gaitN++; }
      const sl = U.num(inp.balance && inp.balance.singleLegSec);
      if (sl != null) { slSum += sl; slN++; }
      const chair = U.num(inp.mobility && inp.mobility.chair30);
      if (chair != null) { chairSum += chair; chairN++; }
      const sensory = inp.sensory || {};
      const hist = inp.history || {};
      if (sensory.homeHazards === 'yes' || factHigh['居家环境隐患']) intervention.env++;
      if (sensory.psychotropic === 'yes' || factHigh['服用镇静/降压/降糖药']) intervention.med++;
      if (sensory.cognition === 'impaired' || factHigh['认知下降']) intervention.cognition++;
      if (sensory.vision === 'impaired' || sensory.hearing === 'impaired') intervention.sensory++;
    });

    // 危险因子频次 TOP（按出现总次数）
    const factorTop = Object.entries(factCount).map(([name, value]) => ({ label: name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    // 近 30 天评估趋势
    const trend30 = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const value = recs.filter(r => r.assessDate && String(r.assessDate).slice(0, 10) === ds).length;
      trend30.push({ label: i % 5 === 0 ? ds.slice(5) : '', value });
    }
    const recent30 = recs.filter(r => r.assessDate && U.daysBetween(r.assessDate, new Date().toISOString()) <= 30).length;

    const mean = (s, n) => n ? U.round(s / n, 1) : '—';
    const avgAge = ageCount ? Math.round(ageSum / ageCount) : '—';

    return {
      total, byLevel, gender, ageGroups, factorTop, intervention, trend30, recent30, avgAge,
      means: { fes: mean(fesSum, fesN), tug: mean(tugSum, tugN), gait: mean(gaitSum, gaitN), singleLeg: mean(slSum, slN), chair: mean(chairSum, chairN) }
    };
  }

  function buildPanels(s, recs) {
    const T = s.total || 1;
    const lv = s.byLevel;
    const lg = s.ageGroups, aSum = (lg['<65'] + lg['65-74'] + lg['75-84'] + lg['≥85']) || 1;
    const pan = {};
    pan.total = miniList([
      { label: '高危', value: lv.high, pct: Math.round(lv.high / T * 100) },
      { label: '中危', value: lv.mid, pct: Math.round(lv.mid / T * 100) },
      { label: '低危', value: lv.low, pct: Math.round(lv.low / T * 100) },
      { label: '近 30 天新增', value: s.recent30 }
    ]) + `<div class="bd-export-link" data-export="names">⬇ 导出评估名单（CSV）</div>`;
    pan.level = miniList([
      { label: '高危', value: lv.high, pct: Math.round(lv.high / T * 100) },
      { label: '中危', value: lv.mid, pct: Math.round(lv.mid / T * 100) },
      { label: '低危', value: lv.low, pct: Math.round(lv.low / T * 100) }
    ]) + `<div class="bd-drill-note">高危 ${lv.high} 例须立即启动多维度防跌干预；中危 ${lv.mid} 例建议平衡与力量训练。</div>`;
    pan.gender = miniList([
      { label: '男性', value: s.gender.male, pct: Math.round(s.gender.male / T * 100) },
      { label: '女性', value: s.gender.female, pct: Math.round(s.gender.female / T * 100) }
    ]) + `<div class="bd-drill-note">女性占比 ${Math.round(s.gender.female / T * 100)}%，老年女性跌倒与骨折风险相对更高。</div>`;
    pan.age = miniList([
      { label: '<65 岁', value: lg['<65'] }, { label: '65–74 岁', value: lg['65-74'] },
      { label: '75–84 岁', value: lg['75-84'] }, { label: '≥85 岁', value: lg['≥85'] }
    ]) + `<div class="bd-drill-note">75 岁以上合计 ${lg['75-84'] + lg['≥85']} 人（${Math.round((lg['75-84'] + lg['≥85']) / aSum * 100)}%），为防跌重点年龄段。</div>`;
    pan.factor = `<div class="bd-drill-note">出现频次最高的危险因子见上方条形图；跌倒史、FES-I 恐惧、TUG 延长与步速下降为再跌倒的核心预测因子。</div>`;
    pan.means = miniList([
      { label: 'FES-I 跌倒效能量表', value: s.means.fes, suffix: ' 分' },
      { label: 'TUG 起立行走', value: s.means.tug, suffix: ' s' },
      { label: '4 米步速', value: s.means.gait, suffix: ' m/s' },
      { label: '单腿站立', value: s.means.singleLeg, suffix: ' s' },
      { label: '30 秒坐立', value: s.means.chair, suffix: ' 次' }
    ]) + `<div class="bd-drill-note">TUG>12s 或 步速<0.8 m/s 提示转移/移动能力显著下降，应优先纳入训练。</div>`;
    pan.intervention = miniList([
      { label: '居家环境改造', value: s.intervention.env },
      { label: '用药复核（镇静/降压/降糖）', value: s.intervention.med },
      { label: '认知/防走失关注', value: s.intervention.cognition },
      { label: '视听功能跟进', value: s.intervention.sensory }
    ]) + `<div class="bd-drill-note">以上为需跨科室协同的重点干预命中量，建议纳入个案管理跟踪。</div>`;
    const sum30 = s.trend30.reduce((a, p) => a + p.value, 0);
    pan.trend = `<div class="bd-drill-note">近 30 天日均评估约 ${(sum30 / 30).toFixed(1)} 例。</div>`;
    return pan;
  }

  function buildInsightRail(s) {
    const T = s.total || 1;
    const items = [];
    if (s.byLevel.high >= 1) items.push({ level: 'bad', key: 'level', text: `<b>${s.byLevel.high} 例</b>高危跌倒风险，须立即启动防跌干预并复核用药与环境。` });
    if (s.intervention.env >= 1) items.push({ level: 'warn', key: 'intervention', text: `<b>${s.intervention.env} 例</b>存在居家环境隐患，建议防滑/扶手/照明改造。` });
    if (s.intervention.med >= 1) items.push({ level: 'warn', key: 'intervention', text: `<b>${s.intervention.med} 例</b>服用镇静/降压/降糖药，建议睡前给药并复核剂量。` });
    if (s.means.tug !== '—' && s.means.tug >= 12) items.push({ level: 'warn', key: 'means', text: `人群平均 TUG 达 <b>${s.means.tug}s</b>，转移能力整体偏弱。` });
    if (s.total && s.recent30 < s.total) items.push({ level: 'warn', key: 'total', text: `<b>${s.total - s.recent30} 例</b>评估超过 30 天，建议安排复评。` });
    if (!items.length) items.push({ level: 'ok', key: 'total', text: `当前跌倒风险人群整体可控，保持年度复评即可。` });
    return `<div class="bd-insight-rail">
      <div class="bd-insight-head">📡 智能洞察（全部）</div>
      ${items.map(it => `<div class="bd-insight ${it.level}" data-key="${it.key}"><span class="dot"></span><div>${it.text}</div></div>`).join('')}
    </div>`;
  }

  function controlBarHTML(range) {
    const segs = [['all', '全部'], ['30d', '近30天'], ['7d', '近7天']];
    return `<div class="bd-controlbar"><span style="font-size:13px;color:var(--text-muted);font-weight:600;">时间范围</span>
      <div class="bd-seg">${segs.map(([v, l]) => `<button data-range="${v}" class="${range === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>`;
  }

  function filterByRange(recs, range) {
    if (!range || range === 'all') return recs;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
    if (!days) return recs;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return recs.filter(r => r.assessDate && new Date(r.assessDate) >= cutoff);
  }

  function bdExportNames(recs) {
    if (!recs.length) return U.toast('暂无数据可导出', 'warning');
    const head = ['编号', '姓名', '性别', '年龄', '风险等级', 'FES-I', 'TUG(s)', '4m步速', '评估日期'];
    const rows = recs.map(r => [
      r.no || '', r.patientName || '',
      (r.gender === 'female' ? '女' : '男'), r.age || '',
      LEVEL_LABEL[(r.result && r.result.level) || 'low'] || '',
      (r.input && r.input.history && r.input.history.fearFallScore) || '',
      (r.input && r.input.mobility && r.input.mobility.tugSec) || '',
      (r.input && r.input.mobility && r.input.mobility.gaitSpeed) || '',
      (r.assessDate || '').slice(0, 10)
    ]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `跌倒风险评估名单_${U.today()}.csv`);
    U.toast('名单已导出', 'success');
  }
  Pages.bdExportFallNames = bdExportNames;

  Pages.fallRiskStats = function () {
    const useDemo = AppState.fallStatsDemo === true;
    if (useDemo && !AppState.fallStatsDemoRecords) AppState.fallStatsDemoRecords = demoFallRecords();
    const range = AppState.bigdataRange || 'all';
    const all = useDemo ? (AppState.fallStatsDemoRecords || []) : allRecords();
    const recs = filterByRange(all, range);
    Pages._fallBodyRecords = recs;
    const s = calc(recs);
    const pan = buildPanels(s, recs);
    const railHtml = buildInsightRail(s);
    const demoBadge = useDemo ? '<span class="bigdata-demo-badge">演示数据</span>' : '';

    const levelData = [
      { label: '高危', value: s.byLevel.high },
      { label: '中危', value: s.byLevel.mid },
      { label: '低危', value: s.byLevel.low }
    ].filter(d => d.value);
    const levelColors = levelData.map(d => LEVEL_COLOR[(d.label === '高危' ? 'high' : d.label === '中危' ? 'mid' : 'low')]);
    const genderData = [
      { label: '男', value: s.gender.male },
      { label: '女', value: s.gender.female }
    ].filter(d => d.value);
    const ageData = Object.entries(s.ageGroups).map(([label, value]) => ({ label, value })).filter(d => d.value);
    const factorData = s.factorTop;
    const maxFactor = Math.max(...factorData.map(d => d.value), 1);
    const meansData = [
      { label: 'FES-I', value: typeof s.means.fes === 'number' ? s.means.fes : 0 },
      { label: 'TUG', value: typeof s.means.tug === 'number' ? s.means.tug : 0 },
      { label: '步速', value: typeof s.means.gait === 'number' ? Math.round(s.means.gait * 100) : 0 },
      { label: '单腿', value: typeof s.means.singleLeg === 'number' ? s.means.singleLeg : 0 },
      { label: '坐立', value: typeof s.means.chair === 'number' ? s.means.chair : 0 }
    ];
    const maxMeans = Math.max(...meansData.map(d => d.value), 1);
    const intervData = [
      { label: '环境改造', value: s.intervention.env },
      { label: '用药复核', value: s.intervention.med },
      { label: '认知关注', value: s.intervention.cognition },
      { label: '视听跟进', value: s.intervention.sensory }
    ].filter(d => d.value);
    const maxInterv = Math.max(...intervData.map(d => d.value), 1);
    const maxAge = Math.max(...Object.values(s.ageGroups), 1);

    const root = U.el(`
      <div class="bigdata-page">
        <div class="bigdata-hero">
          <div>
            <h2 class="bigdata-title">跌倒风险看板 · 防跌管理数据总览 ${demoBadge}</h2>
            <p class="bigdata-subtitle">${U.esc(AppState.config.orgName || '鹊动健康管理中心')} · 汇总 ${s.total} 份跌倒风险评估记录</p>
          </div>
          <div class="bigdata-actions">
            <div class="bigdata-date">${U.today()}</div>
            <button type="button" id="fr-demo-btn" class="btn ${useDemo ? 'btn-secondary' : 'btn-primary'}">
              ${useDemo ? '退出演示' : '演示数据'}
            </button>
          </div>
        </div>

        ${controlBarHTML(range)}
        ${railHtml}

        <div class="bigdata-grid">
          ${kpiCardHTML({ key: 'total', label: '评估记录总数', value: s.total, trend: `近 30 天新增 ${s.recent30} 份`, panel: pan.total, narrative: '全部跌倒风险评估归档量，展开看等级构成与名单导出。' })}
          ${kpiCardHTML({ key: 'level', label: '高危人数', value: s.byLevel.high, trend: `占比 ${s.total ? Math.round(s.byLevel.high / s.total * 100) : 0}%`, panel: pan.level, narrative: '高危跌倒风险人数，须优先干预。' })}
          ${kpiCardHTML({ key: 'gender', label: '女性占比', value: s.gender.female, trend: `男 ${s.gender.male} / 女 ${s.gender.female}`, panel: pan.gender, narrative: '性别构成，女性骨折风险更高。' })}
          ${kpiCardHTML({ key: 'age', label: '平均年龄', value: s.avgAge, trend: '75+ 为重点人群', panel: pan.age, narrative: '年龄结构，展开看各年龄段分布。' })}
          ${kpiCardHTML({ key: 'means', label: '平均 TUG', value: s.means.tug, trend: '起立-行走计时（秒）', panel: pan.means, narrative: '核心平衡/移动量表均值，展开看全项。' })}
          ${kpiCardHTML({ key: 'intervention', label: '需环境改造', value: s.intervention.env, trend: `用药复核 ${s.intervention.med} · 认知 ${s.intervention.cognition}`, panel: pan.intervention, narrative: '重点干预命中量，跨科室协同。' })}
        </div>

        <div class="bigdata-grid-2">
          ${chartCardHTML({ key: 'level', title: '风险等级分布', chartRow: donutChart(levelData, levelColors, 120) + legendHTML(levelData, levelColors), panel: pan.level, narrative: '高/中/低危三级分布。' })}
          ${chartCardHTML({ key: 'factor', title: '高危危险因子频次 TOP', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${hbarChart(factorData, 'var(--skin-c1)')}</div>`, panel: pan.factor, narrative: '出现次数最多的危险因子。' })}
          ${chartCardHTML({ key: 'age', title: '年龄分布', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${barChart(ageData, maxAge, 'var(--skin-c3)')}</div>`, panel: pan.age, narrative: '各年龄段评估人数。' })}
          ${chartCardHTML({ key: 'gender', title: '性别构成', chartRow: donutChart(genderData, ['var(--skin-c1)', 'var(--skin-c2)'], 120) + legendHTML(genderData, ['var(--skin-c1)', 'var(--skin-c2)']), panel: pan.gender, narrative: '男女比例。' })}
          ${chartCardHTML({ key: 'means', title: '核心量表均值对比', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${barChart(meansData, maxMeans, 'var(--skin-c4)')}</div>`, panel: pan.means, narrative: 'FES-I / TUG / 步速 / 单腿 / 坐立 均值。' })}
          ${chartCardHTML({ key: 'intervention', title: '重点干预命中', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${hbarChart(intervData, 'var(--skin-c2)')}</div>`, panel: pan.intervention, narrative: '需跨科室协同的干预类型。' })}
          ${chartCardHTML({ key: 'trend', title: '近 30 天评估趋势', chartRow: `<div style="display:flex;justify-content:center;width:100%;">${lineChart(s.trend30, 'var(--skin-c1)')}</div>`, panel: pan.trend, narrative: '每日评估量趋势。' })}
        </div>
      </div>
    `.trim());

    U.qs('#fr-demo-btn', root).addEventListener('click', () => {
      AppState.fallStatsDemo = !AppState.fallStatsDemo;
      if (!AppState.fallStatsDemo) AppState.fallStatsDemoRecords = null;
      Pages._fallBodyCache = null;
      window.route && window.route();
    });

    root.querySelectorAll('.bigdata-card.is-expandable').forEach(card => {
      const t = card.querySelector('.bd-expand-toggle');
      if (t) t.addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('is-open'); });
    });
    root.querySelectorAll('.bd-seg button[data-range]').forEach(b => {
      b.addEventListener('click', () => { AppState.fallRange = b.dataset.range; window.route && window.route(); });
    });
    root.querySelectorAll('.bd-insight[data-key]').forEach(el => {
      el.addEventListener('click', () => {
        const card = root.querySelector('.bigdata-card[data-bd-key="' + el.dataset.key + '"]');
        if (card) { card.classList.add('is-open'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      });
    });
    root.querySelectorAll('.bd-export-link[data-export="names"]').forEach(el => {
      el.addEventListener('click', e => { e.stopPropagation(); bdExportNames(recs); });
    });

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) root.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = '0'; });
    requestAnimationFrame(() => {
      try { animateBigdata(root, reduceMotion); }
      catch (err) {
        console.warn('fallrisk-stats animation error', err);
        root.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = ''; });
      }
    });

    // 缓存 body HTML 给大数据看板嵌入复用（剥离 hero/segmented 在外部 _fallBodyHtml 处理）
    Pages._fallBodyCache = root.outerHTML;
    Pages._fallBodyCacheDemo = AppState.fallStatsDemo === true;

    return root;
  };

  // 大数据看板 body-only 版本：剥离 hero/segmented（外壳已提供），仅返回数据卡体 HTML
  Pages._fallBodyHtml = function () {
    const wantDemo = AppState.fallStatsDemo === true;
    if (!Pages._fallBodyCache || Pages._fallBodyCacheDemo !== wantDemo) {
      try { Pages.fallRiskStats(); } catch (e) { /* noop */ }
    }
    const html = Pages._fallBodyCache || '';
    if (!html) return '<div class="alert alert-warning">跌倒风险看板未加载</div>';
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const page = tpl.content.querySelector('.bigdata-page');
    if (page) {
      const h = page.querySelector('.bigdata-hero'); if (h) h.remove();
      const s = page.querySelector('.bd-dir-seg'); if (s) s.remove();
      return page.innerHTML;
    }
    return html;
  };
})();
