/**
 * 鹊动FAC健康看板（液态玻璃旗舰页）
 * 汇总当前账号下所有患者的重要信息：人群构成、BMI 分布、评估/方案完成情况、风险分层等
 * 支持「演示数据」一键模拟真实数据展示；配色与质感由全局皮肤引擎（themes.js）驱动
 */
(function () {
  'use strict';

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function countBy(arr, keyFn) {
    const map = {};
    arr.forEach(item => {
      const k = keyFn(item);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function donutChart(data, colors, size = 120) {
    const total = data.reduce((a, b) => a + b.value, 0);
    if (!total) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const r = size / 2 - 8;
    const cx = size / 2, cy = size / 2;
    let acc = 0;
    const segs = data.map((d, i) => {
      const a0 = acc / total * Math.PI * 2 - Math.PI / 2; acc += d.value;
      const a1 = acc / total * Math.PI * 2 - Math.PI / 2;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      return `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${colors[i % colors.length]}" opacity="0.92" />`;
    }).join('');
    return `
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex-shrink:0;">
        ${segs}
        <circle cx="${cx}" cy="${cy}" r="${size * 0.22}" fill="var(--skin-surface)" />
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${size * 0.16}" font-weight="800" fill="var(--text-primary)">${total}</text>
      </svg>`;
  }

  function barChart(items, max, color) {
    if (!items.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const h = 120;
    const barW = 28, gap = 18;
    const w = items.length * (barW + gap) + gap;
    const baseline = h - 20;
    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;">
        ${items.map((it, i) => {
          const bh = max ? (it.value / max) * (h - 30) : 0;
          const x = gap + i * (barW + gap);
          const y = baseline - bh;
          return `<g>
            <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${color}" opacity="0.9" />
            <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="var(--text-primary)">${it.value}</text>
            <text x="${x + barW / 2}" y="${baseline + 14}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${it.label}</text>
          </g>`;
        }).join('')}
        <line x1="${gap}" y1="${baseline}" x2="${w - gap}" y2="${baseline}" stroke="rgba(148,163,184,0.3)" stroke-width="1" />
      </svg>`;
  }

  function lineChart(points, color) {
    if (!points.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const w = 320, h = 120, pad = 24;
    const max = Math.max(...points.map(p => p.value), 1);
    const xStep = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (p.value / max) * (h - pad * 2);
      return { x, y, label: p.label, value: p.value };
    });
    const pathD = coords.map((c, i) => (i ? 'L' : 'M') + `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;">
        <defs><linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        <path d="${pathD} L${coords[coords.length-1].x},${h-pad} L${coords[0].x},${h-pad} Z" fill="url(#lineFill)" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('')}
        ${coords.filter((_, i) => i % 5 === 0 || i === coords.length - 1).map(c => `<text x="${c.x.toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${c.label}</text>`).join('')}
      </svg>`;
  }

  function hbarChart(items, color) {
    if (!items.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const h = 26, gap = 10;
    const max = Math.max(...items.map(i => i.value), 1);
    return `
      <div style="display:flex;flex-direction:column;gap:${gap}px;width:100%;">
        ${items.map(it => {
          const pct = (it.value / max) * 100;
          return `<div style="display:flex;align-items:center;gap:10px;font-size:12px;">
            <div style="width:80px;color:var(--text-muted);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${U.esc(it.label)}</div>
            <div style="flex:1;background:rgba(148,163,184,0.14);border-radius:6px;height:${h}px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;opacity:0.9;"></div>
            </div>
            <div style="width:36px;color:var(--text-primary);font-weight:700;">${it.value}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function legendHTML(items, colors) {
    return `<div class="bigdata-legend">
      ${items.map((d, i) => `<div><span style="background:${colors[i % colors.length]}"></span>${U.esc(d.label)} ${d.value} 人</div>`).join('')}
    </div>`;
  }

  // 数据展示动效：入场错峰、KPI 数字滚动、图表绘制动画（尊重 prefers-reduced-motion）
  function animateBigdata(root, reduce) {
    if (!root || !root.isConnected) {
      if (root && !root.isConnected) requestAnimationFrame(() => animateBigdata(root, reduce));
      return;
    }
    const cards = root.querySelectorAll('.bigdata-card');
    if (reduce) { cards.forEach(c => { c.style.opacity = ''; }); return; }

    const ease = 'cubic-bezier(.2,.8,.2,1)';

    // 1) 卡片入场（淡入 + 上滑），结束后清除内联样式交还 CSS hover
    cards.forEach((c, i) => {
      const a = c.animate(
        [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 480, delay: Math.min(i, 18) * 42, easing: ease, fill: 'both' }
      );
      a.onfinish = () => { c.style.opacity = ''; a.cancel(); };
    });

    // 2) KPI 数字滚动（easeOutCubic）
    root.querySelectorAll('.bigdata-kpi .bigdata-value').forEach(el => {
      const raw = el.textContent.trim();
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      const parts = raw.split('.');
      const decimals = parts.length > 1 ? parts[1].length : 0;
      const dur = 900, t0 = performance.now();
      (function step(t) {
        const p = Math.min((t - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = (num * e).toFixed(decimals);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = raw;
      })(t0);
    });

    // 3) 柱状图：自底生长
    root.querySelectorAll('.bigdata-chart-card svg rect').forEach((r, i) => {
      r.style.transformBox = 'fill-box';
      r.style.transformOrigin = 'bottom';
      const a = r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 620, delay: 140 + i * 70, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });

    // 4) 环形图：整体缩放入场（含中心圆与数值）
    root.querySelectorAll('.bigdata-chart-card svg').forEach((svg) => {
      if (svg.querySelector('path[fill="none"]')) return; // 折线图单独处理
      if (!svg.querySelector('circle')) return;           // 仅环形图（含中心圆），跳过柱状图
      svg.style.transformBox = 'fill-box';
      svg.style.transformOrigin = 'center';
      const a = svg.animate([{ transform: 'scale(.86)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 160, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });

    // 5) 折线图：描线 + 面积淡入 + 节点弹出
    root.querySelectorAll('.bigdata-chart-card svg').forEach((svg) => {
      const line = svg.querySelector('path[fill="none"]');
      if (!line) return;
      const area = svg.querySelector('path:not([fill="none"])');
      const dots = svg.querySelectorAll('circle');
      try {
        const L = line.getTotalLength();
        line.style.strokeDasharray = L;
        const a = line.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1000, easing: 'ease-in-out', fill: 'both' });
        a.onfinish = () => a.cancel();
      } catch (e) {}
      if (area) { const a2 = area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 320, fill: 'both' }); a2.onfinish = () => a2.cancel(); }
      dots.forEach((d, i) => {
        d.style.transformBox = 'fill-box'; d.style.transformOrigin = 'center';
        const a3 = d.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 320, delay: 520 + i * 60, easing: 'ease-out', fill: 'both' });
        a3.onfinish = () => a3.cancel();
      });
    });

    // 6) 横向条形（医生工作量 TOP5）：宽度增长
    root.querySelectorAll('.bigdata-chart-card').forEach((card) => {
      card.querySelectorAll('div[style*="width:"][style*="%"]').forEach((b, i) => {
        const target = b.style.width;
        if (!target || target === '0%') return;
        const a = b.animate([{ width: '0%' }, { width: target }], { duration: 820, delay: 220 + i * 90, easing: ease, fill: 'both' });
        a.onfinish = () => a.cancel();
      });
    });

    // 7) 漏斗项：错峰左滑入
    root.querySelectorAll('.bigdata-funnel-item').forEach((it, i) => {
      const a = it.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 460, delay: 220 + i * 110, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });
  }

  function fmtDate(d) {
    if (!d) return '';
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    return s.slice(0, 10);
  }

  function demoPatients() {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
    const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '杰', '勇', '军', '平', '刚', '桂英'];
    const doctors = ['王医生', '李医生', '张医生', '赵医生', '刘医生'];
    const arr = [];
    const today = new Date();
    for (let i = 0; i < 48; i++) {
      const gender = Math.random() > 0.45 ? 'female' : 'male';
      const age = clamp(Math.round(22 + Math.random() * 48), 18, 75);
      const birth = new Date(today.getFullYear() - age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      const h = clamp(Math.round(155 + Math.random() * 25), 150, 190);
      const w = clamp(Math.round((gender === 'female' ? 50 : 60) + Math.random() * 45), 45, 130);
      const bmi = U.round(w / Math.pow(h / 100, 2), 1);
      const waist = Math.round(gender === 'female' ? 68 + Math.random() * 35 : 75 + Math.random() * 35);
      const hip = Math.round(gender === 'female' ? 85 + Math.random() * 25 : 88 + Math.random() * 22);
      const whr = U.round(waist / hip, 2);
      const sbp = Math.round(105 + Math.random() * 55);
      const dbp = Math.round(65 + Math.random() * 35);
      const riskScore = (bmi >= 28 ? 2 : bmi >= 24 ? 1 : 0) + (age >= 55 ? 1 : 0) + (sbp >= 140 ? 1 : 0);
      const riskLabel = riskScore >= 3 ? '高风险' : riskScore >= 2 ? '中风险' : '低风险';
      const lifeScore = clamp(Math.round(40 + Math.random() * 55), 40, 98);
      const hasStrength = Math.random() > 0.55;
      const hasPlan = Math.random() > 0.4;
      const createdDaysAgo = Math.floor(Math.random() * 60);
      const createdAt = new Date(today);
      createdAt.setDate(createdAt.getDate() - createdDaysAgo);
      arr.push({
        id: 'demo-' + i,
        patientCode: 'QD-HET-' + String(i + 1).padStart(5, '0'),
        name: surnames[i % surnames.length] + names[i % names.length] + (i >= 15 ? (i >= 30 ? '某' : '') : ''),
        doctorId: doctors[i % doctors.length],
        createdAt: createdAt.toISOString(),
        data: {
          patient: { gender, birthDate: fmtDate(birth), height: h, weight: w, age },
          assessment: { bmi, waist, hip, whr, sbp, dbp, risk: { label: riskLabel } },
          plan: hasPlan ? {
            generatedAt: new Date().toISOString(),
            nutrition: {}, aerobic: {}, resistance: {}, flexibility: {}, balance: {}
          } : null,
          isokineticData: hasStrength && Math.random() > 0.5 ? [{ deviceId: '01', testDate: fmtDate(today) }] : [],
          isotonicData: hasStrength && Math.random() > 0.5 ? [{ deviceId: '03', testDate: fmtDate(today) }] : [],
          lifeSurvey: { _scored: { total: lifeScore, level: lifeScore >= 80 ? '优秀' : lifeScore >= 60 ? '良好' : lifeScore >= 45 ? '一般' : '较差' } }
        }
      });
    }
    return arr;
  }

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

  // 健康语义色（固定，保证风险/状态辨识度）
  const SEM = {
    bmi: ['#60a5fa', '#34d399', '#fbbf24', '#f87171'],
    risk: ['#34d399', '#fbbf24', '#f87171'],
    life: ['#34d399', '#22d3ee', '#fbbf24', '#f87171']
  };

  Pages.bigdata = async function () {
    const useDemo = AppState.bigdataDemo === true;
    if (useDemo && !AppState.bigdataDemoPatients) {
      AppState.bigdataDemoPatients = demoPatients();
    }
    const patients = useDemo ? (AppState.bigdataDemoPatients || []) : (AppState.patients || []);
    const s = calcStats(patients);
    const demoBadge = useDemo ? '<span class="bigdata-demo-badge">演示数据</span>' : '';

    const genderData = [
      { label: '男', value: s.male },
      { label: '女', value: s.female }
    ].filter(d => d.value);
    const ageData = Object.entries(s.ageGroups).map(([label, value]) => ({ label, value })).filter(d => d.value);
    const bmiData = [
      { label: '偏瘦', value: s.bmiGroups.under },
      { label: '正常', value: s.bmiGroups.normal },
      { label: '超重', value: s.bmiGroups.over },
      { label: '肥胖', value: s.bmiGroups.obese }
    ].filter(d => d.value);
    const riskData = [
      { label: '低风险', value: s.riskGroups.low },
      { label: '中风险', value: s.riskGroups.medium },
      { label: '高风险', value: s.riskGroups.high }
    ].filter(d => d.value);
    const lifeData = [
      { label: '优秀', value: s.lifeGroups.excellent },
      { label: '良好', value: s.lifeGroups.good },
      { label: '一般', value: s.lifeGroups.medium },
      { label: '较差', value: s.lifeGroups.poor }
    ].filter(d => d.value);
    const planTypeData = [
      { label: '饮食', value: s.planTypes.diet },
      { label: '有氧', value: s.planTypes.aerobic },
      { label: '抗阻', value: s.planTypes.resistance },
      { label: '柔韧', value: s.planTypes.flexibility },
      { label: '平衡', value: s.planTypes.balance }
    ].filter(d => d.value);

    const maxAge = Math.max(...Object.values(s.ageGroups), 1);
    const maxLife = Math.max(...Object.values(s.lifeGroups), 1);
    const maxPlanType = Math.max(...planTypeData.map(d => d.value), 1);

    const root = U.el(`
      <div class="bigdata-page">
        <div class="bigdata-hero">
          <div>
            <h2 class="bigdata-title">鹊动FAC健康看板 ${demoBadge}</h2>
            <p class="bigdata-subtitle">${U.esc(AppState.config.orgName || '鹊动FAC功能中心')} · 实时汇总 ${s.total} 位患者核心指标</p>
          </div>
          <div class="bigdata-actions">
            <div class="bigdata-date">${U.today()}</div>
            <button type="button" id="bd-demo-btn" class="btn ${useDemo ? 'btn-secondary' : 'btn-primary'}">
              ${useDemo ? '退出演示' : '演示数据'}
            </button>
          </div>
        </div>

        <div class="bigdata-grid">
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">患者总数</div>
            <div class="bigdata-value">${s.total}</div>
            <div class="bigdata-trend">近 7 天新增 ${s.recent7} 人 · 近 30 天 ${s.recent30} 人</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">已完成综合评估</div>
            <div class="bigdata-value">${s.assessed}</div>
            <div class="bigdata-trend">覆盖率 ${s.total ? Math.round(s.assessed / s.total * 100) : 0}%</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">已生成干预方案</div>
            <div class="bigdata-value">${s.planDone}</div>
            <div class="bigdata-trend">转化率 ${s.total ? Math.round(s.planDone / s.total * 100) : 0}%</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">肌力测评记录</div>
            <div class="bigdata-value">${s.strengthTests}</div>
            <div class="bigdata-trend">${s.strengthPatients} 人已测评</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">平均 BMI</div>
            <div class="bigdata-value">${s.avgBmi}</div>
            <div class="bigdata-trend">基于 ${s.bmiGroups.under + s.bmiGroups.normal + s.bmiGroups.over + s.bmiGroups.obese} 条有效数据</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">平均年龄</div>
            <div class="bigdata-value">${s.avgAge}</div>
            <div class="bigdata-trend">人群年龄中位数参考</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">腰围/腰臀比异常</div>
            <div class="bigdata-value">${s.abnormalWaist}</div>
            <div class="bigdata-trend">中心性肥胖风险关注</div>
          </div>
          <div class="bigdata-card bigdata-kpi">
            <div class="bigdata-label">高血压倾向</div>
            <div class="bigdata-value">${s.hypertension}</div>
            <div class="bigdata-trend">收缩压 ≥140 或 舒张压 ≥90</div>
          </div>
        </div>

        <div class="bigdata-grid-2">
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">性别构成</h3>
            <div class="bigdata-chart-row">
              ${donutChart(genderData, ['var(--skin-c1)', 'var(--skin-c2)'], 120)}
              ${legendHTML(genderData, ['var(--skin-c1)', 'var(--skin-c2)'])}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">年龄分布</h3>
            <div class="bigdata-chart-row" style="justify-content:center;">
              ${barChart(ageData, maxAge, 'var(--skin-c3)')}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">BMI 分布</h3>
            <div class="bigdata-chart-row">
              ${donutChart(bmiData, SEM.bmi, 120)}
              ${legendHTML(bmiData, SEM.bmi)}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">健康风险分层</h3>
            <div class="bigdata-chart-row">
              ${donutChart(riskData, SEM.risk, 120)}
              ${legendHTML(riskData, SEM.risk)}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">生活方式健康度</h3>
            <div class="bigdata-chart-row" style="justify-content:center;">
              ${barChart(lifeData, maxLife, 'var(--skin-c4)')}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">近 30 天建档趋势</h3>
            <div class="bigdata-chart-row" style="justify-content:center;">
              ${lineChart(s.trend30, 'var(--skin-c1)')}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">医生工作量 TOP5</h3>
            <div class="bigdata-chart-row" style="justify-content:center;">
              ${hbarChart(s.doctorData.slice(0, 5), 'var(--skin-c3)')}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">方案类型覆盖</h3>
            <div class="bigdata-chart-row" style="justify-content:center;">
              ${barChart(planTypeData, maxPlanType, 'var(--skin-c4)')}
            </div>
          </div>
          <div class="bigdata-card bigdata-chart-card">
            <h3 class="bigdata-card-title">业务完成漏斗</h3>
            <div class="bigdata-funnel">
              <div class="bigdata-funnel-item"><span>建档</span><b>${s.total}</b></div>
              <div class="bigdata-funnel-item"><span>完成评估</span><b>${s.assessed}</b></div>
              <div class="bigdata-funnel-item"><span>肌力测评</span><b>${s.strengthPatients}</b></div>
              <div class="bigdata-funnel-item"><span>生成方案</span><b>${s.planDone}</b></div>
            </div>
          </div>
        </div>
      </div>
    `.trim());

    U.qs('#bd-demo-btn', root).addEventListener('click', () => {
      AppState.bigdataDemo = !AppState.bigdataDemo;
      if (!AppState.bigdataDemo) AppState.bigdataDemoPatients = null;
      window.route && window.route();
    });

    // 数据动效：挂载后播放（尊重 prefers-reduced-motion；非降级时先隐藏卡片避免挂载瞬间闪现）
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion) root.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = '0'; });
    requestAnimationFrame(() => {
      try { animateBigdata(root, reduceMotion); }
      catch (err) {
        console.warn('bigdata animation error', err);
        root.querySelectorAll('.bigdata-card').forEach(c => { c.style.opacity = ''; });
      }
    });

    return root;
  };
})();
