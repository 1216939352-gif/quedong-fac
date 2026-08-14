/**
 * 鹊动FAC功能评估与干预系统 - 报告管理中心 / 报告构建模块
 * 四类报告：综合评估报告 / 鹊动等速肌力评估报告 / 鹊动等张肌力评估报告 / 智能训练方案
 * 支持：分别打印、勾选组合导出打印；并合并原「医生报告中心」的检索/趋势/批量导出能力
 */
(function () {
  'use strict';

  function appCtx() {
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
  function ctxFromPatient(p) {
    const d = p.data || {};
    return {
      patient: d.patient || {},
      assessment: d.assessment || {},
      lifeSurvey: d.lifeSurvey || {},
      plan: d.plan || {},
      isokineticData: d.isokineticData || [],
      isotonicData: d.isotonicData || [],
      config: AppState.config || {},
      systemTitle: (AppState.config && AppState.config.systemTitle) || ''
    };
  }

  function get(key, def, ctx) {
    const src = ctx || appCtx();
    return (src[key] != null) ? src[key] : (def === undefined ? {} : def);
  }
  function safe(fn, fallback) { try { return fn(); } catch (e) { console.warn('report section render failed:', e); return fallback || ''; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function genderOf(ctx) { return (get('patient', {}, ctx).gender === 'female') ? 'female' : 'male'; }
  function weightOf(ctx) { return U.num(get('patient', {}, ctx).weight) || 70; }

  function banner(name) {
    const d = (window.DIAGRAMS && DIAGRAMS.BANNERS && DIAGRAMS.BANNERS[name]) || '';
    return d ? `<div class="report-banner">${d}</div>` : '';
  }
  const TRAIN_ICONS = {
    diet: 'images/train-diet.png',
    aerobic: 'images/train-aerobic.png',
    resistance: 'images/train-resistance.png',
    flexibility: 'images/train-flexibility.png',
    balance: 'images/train-balance.png'
  };
  function section(title, html, bannerName, iconSrc) {
    if (!html) return '';
    const icon = iconSrc ? `<img src="${U.esc(iconSrc)}" alt="" class="report-section-icon" onerror="this.style.display='none'">` : '';
    return `
    <section class="report-section">
      ${bannerName ? banner(bannerName) : ''}
      <h3 class="report-h3">${icon}${U.esc(title)}</h3>
      ${html}
    </section>`;
  }

  function renderMeta(ctx) {
    const p = get('patient', {}, ctx);
    const a = get('assessment', {}, ctx);
    const gender = (p.gender === 'female') ? '女' : (p.gender === 'male' ? '男' : '—');
    const age = (p.age != null) ? p.age + ' 岁'
      : (U.calcAge(p.birthDate) != null ? U.calcAge(p.birthDate) + ' 岁' : '—');
    const bmi = (a.bmi != null) ? a.bmi
      : (U.num(p.weight) && U.num(p.height))
        ? U.round(U.num(p.weight) / Math.pow(U.num(p.height) / 100, 2), 1) : '—';
    const whr = (a.whr != null) ? a.whr
      : (U.num(a.waist) && U.num(a.hip)) ? U.round(U.num(a.waist) / U.num(a.hip), 2) : '—';
    const bp = (a.sbp && a.dbp) ? `${a.sbp}/${a.dbp}` : '—';
    return `
    <div class="report-meta-grid">
      <div><span>姓名</span><b>${U.esc(p.name || '—')}</b></div>
      <div><span>性别</span><b>${gender}</b></div>
      <div><span>年龄</span><b>${age}</b></div>
      <div><span>出生日期</span><b>${p.birthDate || '—'}</b></div>
      <div><span>联系电话</span><b>${U.esc(p.phone || '—')}</b></div>
      <div><span>职业</span><b>${U.esc(p.occupation || '—')}</b></div>
      <div><span>建档日期</span><b>${p.registerDate || '—'}</b></div>
      <div><span>身高</span><b>${p.height != null ? p.height + ' cm' : '—'}</b></div>
      <div><span>体重</span><b>${p.weight != null ? p.weight + ' kg' : '—'}</b></div>
      <div><span>BMI</span><b>${bmi}</b></div>
      <div><span>腰围</span><b>${a.waist != null ? a.waist + ' cm' : '—'}</b></div>
      <div><span>腰臀比</span><b>${whr}</b></div>
      <div><span>体脂率</span><b>${a.bodyFat != null ? a.bodyFat + ' %' : '—'}</b></div>
      <div><span>静息心率</span><b>${a.restHR != null ? a.restHR + ' bpm' : '—'}</b></div>
      <div><span>血压</span><b>${bp}</b></div>
      <div><span>报告日期</span><b>${U.today()}</b></div>
    </div>`;
  }

  function scoreRing(total, sub) {
    return `<div class="mascot-score-ring">
      <img src="images/mascot.png" alt="小Qoo" class="score-mascot" onerror="this.style.display='none';this.parentElement.classList.add('mascot-score-fallback')"/>
      <div class="mascot-score-text"><strong>${total}</strong><small>${U.esc(sub || '综合评分')}</small></div>
    </div>`;
  }

  function strengthCardHTML(scored, rec) {
    const dev = CONST.DEVICES.find(d => d.id === rec.deviceId) || { name: rec.deviceId || '设备' };
    const header = `<div class="report-strength-head"><b>${U.esc(dev.name)}</b> · ${U.esc(rec.testDate || '')} · ${{left:'左侧',right:'右侧',bilateral:'双侧'}[rec.side] || '双侧'}</div>`;
    const card = (scored && scored._err) ? `<div class="alert alert-info" style="margin-top:8px;">该条记录数据不完整，无法生成解读</div>` : window.buildStrengthScoreCard(scored);
    return header + card;
  }

  function isoCardsHTML(ctx) {
    const iso = arr(get('isokineticData', [], ctx));
    if (!iso.length) return '';
    const html = iso.map(r => {
      const scored = safe(() => Calc.isokineticScore(r, genderOf(ctx)), { _err: true });
      return strengthCardHTML(scored, r);
    }).join('');
    return section('等速肌力评估', html);
  }
  function iotCardsHTML(ctx) {
    const iot = arr(get('isotonicData', [], ctx));
    if (!iot.length) return '';
    const html = iot.map(r => {
      const scored = safe(() => Calc.isotonicScore({
        oneRML: r.oneRML, oneRMR: r.oneRMR,
        reps: r.repsL != null ? r.repsL : r.repsR,
        loadWeight: r.loadL != null ? r.loadL : r.loadR,
        lsi: r.lsi
      }, genderOf(ctx), weightOf(ctx)), { _err: true });
      return strengthCardHTML(scored, r);
    }).join('');
    return section('等张肌力评估', html);
  }
  function renderStrengthSection(ctx) {
    return isoCardsHTML(ctx) + iotCardsHTML(ctx);
  }

  /* ---- 方案报告渲染辅助 ---- */
  function kpi(value, label, icon) {
    const img = icon ? `<img src="${U.esc(icon)}" alt="" class="report-kpi-icon" onerror="this.style.display='none'">` : '';
    return `<div class="report-kpi ${icon ? 'has-icon' : ''}">${img}<div class="report-kpi-text"><b>${value != null && value !== '' ? value : '—'}</b><span>${U.esc(label)}</span></div></div>`;
  }
  function mealCard(m) {
    return `<div class="report-meal">
      <div class="report-meal-head"><strong>${U.esc(m.name)}</strong><span class="badge badge-primary">${m.kcal} kcal</span></div>
      <div class="report-meal-meta">${U.esc(m.time || '')}</div>
      <div class="report-meal-macros"><span>蛋白 ${m.protein}g</span><span>脂肪 ${m.fat}g</span><span>碳水 ${m.carb}g</span></div>
      ${m.tip ? `<div class="report-meal-tip">${U.esc(m.tip)}</div>` : ''}
    </div>`;
  }
  function strengthProgramSection(prog, title) {
    return section(title, `
      <div class="report-kpi-row">
        ${kpi(prog.frequency, '训练频率')}
        ${kpi(prog.cycle, '训练周期')}
      </div>
      <table class="data-table"><thead><tr><th>设备</th><th>训练单元</th><th>匹配依据</th><th>负荷</th><th>次数</th><th>组数</th><th>间歇</th></tr></thead>
      <tbody>${prog.picks.map(x => `<tr>
        <td><strong>${U.esc(x.device.id)} 号机</strong><br><span class="text-muted">${U.esc(x.device.name || x.device.short || '')}</span></td>
        <td>${U.esc(x.device.muscles || '')}</td>
        <td style="font-size:12.5px;line-height:1.6;">${U.esc(x.reason || '')}</td>
        <td>${U.esc(x.dose.load)}</td><td>${U.esc(x.dose.reps)}</td><td>${U.esc(x.dose.sets)}</td><td>${U.esc(x.dose.rest)}</td>
      </tr>`).join('')}</tbody></table>
      ${arr(prog.safety).length ? `<ul class="report-safety">${prog.safety.map(s => `<li>${U.esc(s)}</li>`).join('')}</ul>` : ''}
    `);
  }

  function renderPlanSections(ctx) {
    const plan = get('plan', {}, ctx);
    if (!plan || !(plan.generatedAt || plan.generatedBy)) return '';
    // AI 采用的方案（generatedBy==='ai'）：用 AIReason.planSummaryHTML 渲染，与方案页/AI 结果保持一致
    if (plan.generatedBy === 'ai') {
      const aiHtml = (window.AIReason && AIReason.planSummaryHTML) ? AIReason.planSummaryHTML(plan) : '<p>AI 方案渲染组件未就绪</p>';
      return section('智能训练方案（鹊动小Qoo AI 生成）',
        '<div class="ai-plan-ai-tag">本方案由鹊动小Qoo AI 辅助生成，须经专业人员确认</div>' + aiHtml, 'plan', null);
    }
    let html = '';

    /* 一、饮食方案 */
    if (plan.nutrition) {
      const n = plan.nutrition, m = n.macros || {};
      html += section('个性化饮食方案', `
        <div class="report-kpi-row">
          ${kpi(n.target, '每日目标摄入 (kcal)', 'images/diet-kpi-icon.png')}
          ${kpi(n.deficit, '每日热量缺口 (kcal)')}
          ${kpi(n.weeklyLoss, '预期减重 (kg/周)')}
        </div>
        <table class="data-table">
          <thead><tr><th>营养素</th><th>克数 (g)</th><th>占比</th></tr></thead>
          <tbody>
            <tr><td>蛋白质</td><td><b>${m.proteinG != null ? m.proteinG : '—'}</b></td><td>${m.proteinPct != null ? m.proteinPct + '%' : '—'}</td></tr>
            <tr><td>脂肪</td><td><b>${m.fatG != null ? m.fatG : '—'}</b></td><td>${m.fatPct != null ? m.fatPct + '%' : '—'}</td></tr>
            <tr><td>碳水化合物</td><td><b>${m.carbG != null ? m.carbG : '—'}</b></td><td>${m.carbPct != null ? m.carbPct + '%' : '—'}</td></tr>
            <tr><td>膳食纤维</td><td colspan="2">${m.fiberG != null ? m.fiberG : '—'} g/日</td></tr>
            <tr><td>食盐 / 添加糖 / 饮水</td><td colspan="2">${m.saltG != null ? m.saltG : '—'} g / ${m.addedSugarG != null ? m.addedSugarG : '—'} g / ${m.waterMl != null ? m.waterMl : '—'} ml</td></tr>
          </tbody>
        </table>
        ${arr(n.meals).length ? `<h4 class="report-sub">三餐热量分配（3:4:3）</h4><div class="report-meals">${n.meals.map(mealCard).join('')}</div>` : ''}
      `, 'nutrition', TRAIN_ICONS.diet);
    }

    /* 二、有氧训练 FITT-VP */
    if (plan.aerobic && arr(plan.aerobic.phases).length) {
      const a = plan.aerobic;
      html += section('有氧训练方案（FITT-VP 三阶段）', `
        ${a.risk ? `<div class="report-banner">运动风险等级：<b>${U.esc(a.risk.label || '—')}</b> — ${U.esc(a.risk.advice || '')}</div>` : ''}
        <table class="data-table">
          <thead><tr><th>阶段</th><th>周期</th><th>频率</th><th>时长</th><th>强度(%HRR)</th><th>目标心率</th></tr></thead>
          <tbody>${a.phases.map((ph, i) => {
            const z = (a.hrZones && a.hrZones[i] && a.hrZones[i].zone) || null;
            const cur = i === a.currentIndex;
            return `<tr style="${cur ? 'background:rgba(242,101,34,0.07);' : ''}">
              <td><strong>${U.esc(ph.name)}</strong>${cur ? ' <span class="badge badge-primary">起始</span>' : ''}</td>
              <td>${U.esc(ph.weeks || '—')}</td><td>${U.esc(ph.frequency || '—')}</td>
              <td>${U.esc(ph.duration || '—')}</td>
              <td>${ph.intensityPct ? Math.round(ph.intensityPct[0]*100) + '-' + Math.round(ph.intensityPct[1]*100) + '%' : '—'}</td>
              <td><strong>${z ? z.low + '-' + z.high : '—'}</strong> bpm</td></tr>`;
          }).join('')}</tbody>
        </table>
        ${a.ranking && a.ranking.list ? `<h4 class="report-sub">有氧方式优先级（护膝护腰原则）</h4>
          <table class="data-table"><thead><tr><th>序</th><th>方式</th><th>推荐度</th><th>适配说明</th></tr></thead>
          <tbody>${a.ranking.list.map((x, i) => `<tr><td>${i+1}</td><td><strong>${U.esc(x.name)}</strong></td>
            <td>${x.blocked ? '<span class="badge badge-danger">暂缓</span>' : (x.recommended ? '<span class="badge badge-success">推荐</span>' : '<span class="badge badge-warning">可选</span>')}</td>
            <td style="font-size:12.8px;line-height:1.6;">${U.esc(x.desc || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      `, 'aerobic', TRAIN_ICONS.aerobic);
    }

    /* 三、抗阻训练 */
    if (plan.resistance && arr(plan.resistance.exercises).length) {
      const r = plan.resistance;
      html += section('基础抗阻训练方案（徒手 / 哑铃 / 杠铃）', `
        <div class="report-kpi-row">
          ${kpi(r.phase ? r.phase.name : '—', '起始阶段')}
          ${kpi(r.phase ? r.phase.frequency : '—', '训练频率')}
          ${kpi(r.phase ? (r.phase.reps + ' × ' + r.phase.sets) : '—', '次数 × 组数')}
        </div>
        ${r.note ? `<div class="report-banner" style="justify-content:flex-start;gap:8px;background:var(--primary-bg);border-left:4px solid var(--primary);"><span>ℹ️</span><span>${U.esc(r.note)}</span></div>` : ''}
        <div class="report-plan-cards">${r.exercises.map((ex, i) => `
          <div class="report-ex-card"><div class="report-ex-no">${i+1}</div>
            <b>${U.esc(ex.name)}</b>
            ${ex.dose ? `<p><span class="text-muted">剂量：</span>${U.esc(ex.dose)}</p>` : ''}
            <p><span class="text-muted">目标肌群：</span>${U.esc(ex.target || '')}</p>
            <p><span class="text-muted">要领：</span>${U.esc(ex.key || '')}</p>
            ${ex.caution ? `<p class="report-caution">注意：${U.esc(ex.caution)}</p>` : ''}
          </div>`).join('')}</div>
      `, 'resistance', TRAIN_ICONS.resistance);
    }

    /* 四、柔韧 */
    if (plan.flexibility && arr(plan.flexibility.exercises).length) {
      const f = plan.flexibility;
      html += section('柔韧性训练方案（9 组标准拉伸序列 · 含示意图）', `
        <p class="text-muted">${U.esc(f.frequency || '')} ｜ ${U.esc(f.duration || '')} ｜ ${U.esc(f.principle || '')}</p>
        <div class="report-plan-cards">${f.exercises.map((ex, i) => `
          <div class="report-ex-card"><div class="report-ex-no">${i+1}</div>
            <b>${U.esc(ex.name)}</b>
            ${ex.svg ? `<div class="report-ex-diagram">${ex.svg}</div>` : ''}
            <p><span class="text-muted">目标：</span>${U.esc(ex.target || '')}</p>
            <p><span class="text-muted">要领：</span>${U.esc(ex.key || '')}</p>
          </div>`).join('')}</div>
      `, 'flexibility', TRAIN_ICONS.flexibility);
    }

    /* 五、平衡 */
    if (plan.balance && arr(plan.balance.exercises).length) {
      const b = plan.balance;
      html += section('平衡功能训练方案（含示意图）', `
        <div class="report-kpi-row">
          ${kpi('L' + (b.startLevel != null ? b.startLevel : '—'), '起始等级')}
          ${kpi('L1-L' + (b.maxLevel != null ? b.maxLevel : '—'), '开放等级')}
          ${kpi(b.frequency || '—', '训练频率')}
        </div>
        <div class="report-plan-cards">${b.exercises.map((ex) => `
          <div class="report-ex-card">
            <div class="report-ex-badge">L${ex.level} ${U.esc(ex.levelText || '')}</div>
            <b>${U.esc(ex.name)}</b>
            ${ex.svg ? `<div class="report-ex-diagram">${ex.svg}</div>` : ''}
            <p><span class="text-muted">目标：</span>${U.esc(ex.target || '')}</p>
            <p><span class="text-muted">剂量：</span>${U.esc(ex.duration || '')}</p>
          </div>`).join('')}</div>
      `, 'balance', TRAIN_ICONS.balance);
    }

    /* 六、周训练日程 */
    if (arr(plan.schedule).length) {
      html += section('7 天周训练日程', `
        <table class="data-table"><thead><tr><th>星期</th><th>训练内容</th></tr></thead>
        <tbody>${plan.schedule.map(d => `<tr><td><strong>${U.esc(d.day)}</strong></td><td>${U.esc(d.detail || '')}</td></tr>`).join('')}</tbody></table>
      `);
    }

    /* 七、肌力专项方案 */
    if (plan.strength) {
      const s = plan.strength;
      if (s.isoProgram) html += strengthProgramSection(s.isoProgram, '鹊动等速肌力专项方案');
      if (s.itoProgram) html += strengthProgramSection(s.itoProgram, '鹊动等张肌力专项方案');
    }

    return html;
  }

  function lifestyleParts(ctx) {
    const ls = get('lifeSurvey', {}, ctx);
    const rawKeys = Object.keys(ls).filter(k => k !== '_scored' && k !== '_advice');
    if (!ls || (!rawKeys.length && !ls._scored)) return null;
    let s = ls._scored;
    if (!s && rawKeys.length) { try { s = Calc.lifeSurveyScore(ls); } catch (e) { s = null; } }
    if (!s || !s.dims) return null;
    let advice = ls._advice;
    if (!advice && s) {
      try { advice = Calc.lifeAdvice(s, get('assessment', {}, ctx), get('patient', {}, ctx), null); } catch (e) { advice = {}; }
    }
    advice = advice || {};
    const ring = scoreRing(s.total, '生活方式总分');
    const summary = s.summary || '';
    const dims = arr(s.dims).map(d => `
      <div class="dim-cell">
        <div class="dim-head"><span>${d.icon || ''} ${U.esc(d.title)}</span><b style="color:${d.color}">${d.pct} 分</b></div>
        <div class="dim-bar"><span style="width:${d.pct}%;background:${d.color}"></span></div>
        <div class="dim-level" style="color:${d.color}">${d.levelText || ''}</div>
      </div>`).join('');
    const adviceHtml = arr(advice.blocks).length ? advice.blocks.map(b => `
      <div class="ls-advice-block" style="border-left-color:${b.color};">
        <div class="ls-advice-head"><b>${b.icon || ''} ${U.esc(b.title)}</b>
          <span class="badge" style="background:${b.color}22;color:${b.color}">${b.pct} 分 · ${b.levelText || ''}</span></div>
        <p class="ls-advice-concl">${U.esc(b.conclusion || '')}</p>
        ${arr(b.actions).length ? `<ul class="ls-advice-actions">${b.actions.map(a => `<li>${U.esc(a)}</li>`).join('')}</ul>` : ''}
      </div>`).join('') : '<p>暂无针对性建议</p>';
    const cross = arr(advice.cross).length
      ? `<h4>跨维度联动干预提示</h4>${advice.cross.map(c => `<div class="alert alert-warning" style="margin-bottom:10px;"><div>${U.esc(c)}</div></div>`).join('')}`
      : '';
    const road = arr(advice.roadmap).length
      ? `<h4>阶段化行动路线图</h4><div class="roadmap">${advice.roadmap.map((r, i) => `
        <div class="roadmap-phase"><div class="roadmap-num">${i + 1}</div>
          <div class="roadmap-body"><div class="roadmap-title">${U.esc(r.phase)}</div>
          <div class="roadmap-focus">${U.esc(r.focus)}</div>
          <ul>${r.items.map(it => `<li>${U.esc(it)}</li>`).join('')}</ul></div></div>`).join('')}</div>`
      : '';
    return { ring, summary, dims, adviceHtml, cross, road, radar: U.radarChart(arr(s.dims).map(d => d.title), arr(s.dims).map(d => d.pct), { color: '#f26522' }) };
  }

  function lifestyleInner(ctx) {
    const parts = lifestyleParts(ctx);
    if (!parts) return '<div class="alert alert-warning">暂无生活方式问卷评估数据（请先在「生活方式问卷评估」中完成问卷并生成报告）</div>';
    return `
      <div class="life-overview">
        ${parts.ring}
        <div class="life-radar">${parts.radar}</div>
        <p class="life-summary">${U.esc(parts.summary)}</p>
      </div>
      <div class="dim-grid">${parts.dims}</div>
      <h4>明确改变指导建议</h4>
      ${parts.adviceHtml}
      ${parts.cross}
      ${parts.road}`;
  }

  function lifestyleReportSections(ctx) {
    const parts = lifestyleParts(ctx);
    if (!parts) return '<div class="alert alert-warning">暂无生活方式问卷评估数据（请先在「生活方式问卷评估」中完成问卷并生成报告）</div>';
    return `
      ${section('二、生活方式健康度总评', `
        <div class="life-overview">
          ${parts.ring}
          <div class="life-radar">${parts.radar}</div>
          <p class="life-summary">${U.esc(parts.summary)}</p>
        </div>`)}
      ${section('三、分维度定量结论', `<div class="dim-grid">${parts.dims}</div>`)}
      ${section('四、生活方式干预建议', parts.adviceHtml + parts.cross)}
      ${section('五、阶段化行动路线图', parts.road)}
    `;
  }

  function renderLifeAdvice(ctx) {
    return section('生活习惯干预指导', lifestyleInner(ctx));
  }

  const SCOPE_TITLES = {
    full: '体重管理综合评估报告',
    isokinetic: '鹊动等速肌力评估报告',
    isotonic: '鹊动等张肌力评估报告',
    plan: '智能训练方案',
    lifestyle: '鹊动生活方式评估报告'
  };

  /* ================= 分享页「今日任务」 ================= */
  function ttTaskItem(icon, label, detail) {
    return `<li class="tt-item"><span class="tt-box">☐</span><div class="tt-body"><span class="tt-ico">${icon}</span><b>${U.esc(label)}</b><span class="tt-detail">${U.esc(detail)}</span></div></li>`;
  }
  // 从方案中抽取「今日任务」：优先按 7 天周日程匹配今日星期；无日程则按方案组件兜底
  function buildTodayTasks(ctx) {
    ctx = ctx || appCtx();
    const plan = get('plan', {}, ctx);
    if (!plan || !plan.generatedAt) return '';
    const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date().getDay()];
    const sched = arr(plan.schedule).find(d => d.day === wd) || null;
    const tagSet = new Set(sched && sched.tags ? sched.tags.map(t => t[0]) : []);
    const items = [];
    // 饮食（每日必做）
    if (plan.nutrition) {
      const n = plan.nutrition;
      const cal = n.target != null ? n.target + ' kcal' : '—';
      const def = n.deficit != null ? '，缺口 ' + n.deficit + ' kcal' : '';
      items.push(ttTaskItem('🍽', '饮食管理', '每日目标 ' + cal + def + '（3:4:3 三餐分配）'));
    }
    const ensure = (key, icon, label, detail) => {
      if ((sched && tagSet.has(key)) || (!sched && planComponentHas(plan, key))) {
        items.push(ttTaskItem(icon, label, detail));
      }
    };
    if (plan.aerobic && arr(plan.aerobic.phases).length) {
      const a = plan.aerobic, ph = a.phases[a.currentIndex] || a.phases[0];
      ensure('aerobic', '🏃', '有氧训练', ph ? ((ph.frequency || '每周数次') + '，' + (ph.duration || '30-40 min') + (ph.intensityPct ? ('，强度 ' + Math.round(ph.intensityPct[0] * 100) + '-' + Math.round(ph.intensityPct[1] * 100) + '%HRR') : '')) : '按方案执行');
    }
    if (plan.resistance && arr(plan.resistance.exercises).length) {
      const r = plan.resistance;
      ensure('resistance', '💪', '抗阻训练', r.phase ? (r.phase.reps + ' × ' + r.phase.sets + (r.phase.frequency ? ('，' + r.phase.frequency) : '')) : '按方案执行');
    }
    if (plan.flexibility && arr(plan.flexibility.exercises).length) {
      const f = plan.flexibility;
      ensure('flexibility', '🤸', '柔韧拉伸', (f.frequency || '每日') + (f.duration ? ('，' + f.duration) : ''));
    }
    if (plan.balance && arr(plan.balance.exercises).length) {
      const b = plan.balance;
      ensure('balance', '⚖️', '平衡训练', b.frequency || '按方案执行');
    }
    if (plan.strength && (plan.strength.isoProgram || plan.strength.itoProgram)) {
      if (!sched || tagSet.has('strength')) items.push(ttTaskItem('🏋', '肌力专项', '等速/等张肌力专项（见方案七）'));
    }
    if (sched && tagSet.has('rest')) items.push(ttTaskItem('😴', '休息恢复', sched.detail));
    if (!items.length) return '';
    return `
      <div class="today-tasks" id="today-tasks">
        <div class="tt-head">📅 今日任务 <span class="tt-day">${wd}</span></div>
        ${sched ? `<div class="tt-schedule">今日安排：<b>${U.esc(sched.detail)}</b></div>` : '<div class="tt-schedule">暂无专属日程，以下为常规训练任务</div>'}
        <ul class="tt-list">${items.join('')}</ul>
        <p class="tt-foot">点击可打勾（只读分享，进度不保存）。具体动作与要领请见下方完整方案。</p>
      </div>`;
  }
  function planComponentHas(plan, key) {
    if (key === 'aerobic') return !!(plan.aerobic && arr(plan.aerobic.phases).length);
    if (key === 'resistance') return !!(plan.resistance && arr(plan.resistance.exercises).length);
    if (key === 'flexibility') return !!(plan.flexibility && arr(plan.flexibility.exercises).length);
    if (key === 'balance') return !!(plan.balance && arr(plan.balance.exercises).length);
    return false;
  }
  window.buildTodayTasks = buildTodayTasks;

  /* 构建单类报告正文（被导出/分享/打印共用）。ctx 缺省取当前 AppState；scope 指定报告类型 */
  window.buildReportDoc = function (ctx, scope) {
    ctx = ctx || appCtx();
    scope = scope || 'full';
    const a = get('assessment', {}, ctx);
    const sysTitle = ctx.systemTitle || '';
    const title = SCOPE_TITLES[scope] || SCOPE_TITLES.full;
    let body = '';
    if (scope === 'full') {
      body += safe(() => section('一、患者基础信息', renderMeta(ctx)));
      body += safe(() => (a && a.bmi) ? section('二、体格与体成分评估', `
        <p>BMI <b>${a.bmi}</b>（${a.bmiGradeLabel || ''}）｜ 腰围 ${a.waist != null ? a.waist : '—'} cm ｜ 腰臀比 ${a.whr != null ? a.whr : '—'} ｜ 体脂率 ${a.bodyFatRate != null ? a.bodyFatRate : '—'}%</p>
      `) : '');
      body += safe(() => (a && a.tdee) ? section('三、能量代谢计算', `
        <p>BMR <b>${a.bmr}</b> kcal ｜ TDEE <b>${a.tdee}</b> kcal ｜ 每日目标热量 <b>${a.targetCalories}</b> kcal ｜ 每周减重 <b>${a.weeklyLoss}</b> kg</p>
        <p>目标心率区间：${a.hrZone || '—'}</p>
      `) : '');
      body += safe(() => renderLifeAdvice(ctx));
      body += safe(() => renderPlanSections(ctx));
      body += safe(() => renderStrengthSection(ctx));
      body += `<div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>
        <div class="report-footer">本报告依据国家减重指南与 ACSM 运动处方规范生成，仅供临床参考。</div>`;
    } else if (scope === 'isokinetic') {
      body += safe(() => section('一、患者基础信息', renderMeta(ctx)));
      body += safe(() => isoCardsHTML(ctx)) || '<div class="alert alert-warning">暂无等速肌力测评数据</div>';
    } else if (scope === 'isotonic') {
      body += safe(() => section('一、患者基础信息', renderMeta(ctx)));
      body += safe(() => iotCardsHTML(ctx)) || '<div class="alert alert-warning">暂无等张肌力测评数据</div>';
    } else if (scope === 'plan') {
      body += safe(() => section('一、患者基础信息', renderMeta(ctx)));
      body += safe(() => renderPlanSections(ctx)) || '<div class="alert alert-warning">暂未生成智能训练方案</div>';
    } else if (scope === 'lifestyle') {
      body += safe(() => section('一、患者基础信息', renderMeta(ctx)));
      body += safe(() => lifestyleReportSections(ctx));
      body += `<div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>
        <div class="report-footer">本报告依据国家减重指南与 ACSM 运动处方规范生成，仅供临床参考。</div>`;
    }
    const p = get('patient', {}, ctx);
    const orgName = (ctx.config && ctx.config.orgName) || '鹊动健康体重管理门诊';
    const reportNo = 'QD-' + U.today().replace(/-/g, '') + '-' + (p.id ? String(p.id).slice(-4) : (p.name || '0000').length ? (p.name || '').slice(0, 2).charCodeAt(0).toString(36).toUpperCase() : '0000');
    return `
      <div class="report-doc" data-scope="${scope}">
        <div class="report-cover">
          <img src="images/mascot.png" alt="" class="report-cover-watermark" onerror="this.style.display='none'"/>
          <img src="images/logo.png" alt="Logo" class="report-logo" onerror="this.style.display='none'"/>
          <div class="report-cover-org">${U.esc(orgName)}</div>
          <h1>${U.esc(CONST.SYSTEM_NAME)}</h1>
          <h2>${U.esc(title)}</h2>
          <p>${U.esc(sysTitle)}</p>
          <div class="report-cover-meta">
            <span>患者：${U.esc(p.name || '—')}</span>
            <span>生成日期：${U.today()}</span>
          </div>
          <div class="report-cover-no">报告编号：${U.esc(reportNo)}</div>
        </div>
        ${body}
      </div>`;
  };

  /* ================= 独立报告解读页（等速 / 等张，两类人群共用，可脱离主线单独使用） ================= */
  function reportBodyHTML(ctx, scope) {
    const key = scope === 'isotonic' ? 'isotonicData' : 'isokineticData';
    const label = scope === 'isotonic' ? '等张' : '等速';
    const data = arr(get(key, [], ctx));
    if (!data.length) {
      return `<div class="alert alert-info">当前患者暂无${label}肌力测评数据。请在上方切换患者，或先到「${label}肌力评估」录入数据后再查看解读。</div>`;
    }
    return window.buildReportDoc(ctx, scope);
  }

  function reportPatientOptions(ctx) {
    const cur = get('patient', {}, ctx) || {};
    const api = window.CenterAPI;
    const patients = api ? (api.loadAll() || []) : [];
    return patients.map(p => {
      const name = p.patientName || (p.data && p.data.patient && p.data.patient.name) || '未命名';
      const sel = (cur.id && p.id === cur.id) ? ' selected' : '';
      return `<option value="${U.esc(p.id)}"${sel}>${U.esc(name)}</option>`;
    }).join('');
  }

  function reportPageShell(scope) {
    const isIso = scope !== 'isotonic';
    const ctx = appCtx();
    const cur = get('patient', {}, ctx) || {};
    const title = isIso ? '等速肌力报告解读' : '等张肌力报告解读';
    const label = isIso ? '等速' : '等张';
    const bodyId = isIso ? 'iso-report-body' : 'iot-report-body';
    const pickId = isIso ? 'iso-rep-pick' : 'iot-rep-pick';
    const loadFn = isIso ? 'window.loadIsoReportPatient(this.value)' : 'window.loadIotReportPatient(this.value)';
    const printFn = isIso ? 'window.printIsoReport()' : 'window.printIotReport()';
    const shareFn = isIso ? 'window.shareIsoReport()' : 'window.shareIotReport()';
    return `
      <div class="page-header no-print">
        <div><h2 class="page-title">${title}</h2><p class="text-muted">独立报告解读 · 老年筛查 / 体重管理两类人群共用 · 可脱离评估主线单独使用</p></div>
        <div class="topbar-actions no-print">
          <button class="btn btn-secondary" onclick="${shareFn}">📲 分享</button>
          <button class="btn btn-primary" onclick="${printFn}">📄 打印 / 导出 PDF</button>
        </div>
      </div>
      <div class="card no-print" style="margin-bottom:16px;">
        <div class="card-body">
          <div class="form-row" style="align-items:flex-end;">
            <div class="form-group" style="flex:1;min-width:240px;">
              <label>选择患者</label>
              <select id="${pickId}" onchange="${loadFn}">
                <option value="">— 选择患者查看报告 —</option>
                ${reportPatientOptions(ctx)}
              </select>
            </div>
            <div class="form-group" style="font-size:12px;color:var(--text-muted);">
              当前：${U.esc(cur.name || '未选择患者')}
            </div>
          </div>
        </div>
      </div>
      <div id="${bodyId}">${reportBodyHTML(ctx, scope)}</div>`;
  }

  Pages.isokineticReport = function () { return reportPageShell('isokinetic'); };
  Pages.isotonicReport = function () { return reportPageShell('isotonic'); };

  window.loadIsoReportPatient = async function (id) {
    if (!id) return;
    try {
      await loadPatientContext(id);
      const body = U.qs('#iso-report-body');
      if (body) body.innerHTML = reportBodyHTML(appCtx(), 'isokinetic');
      U.toast('已载入患者等速报告', 'success');
    } catch (e) { console.error(e); U.toast('加载患者失败：' + (e.message || e), 'error'); }
  };
  window.loadIotReportPatient = async function (id) {
    if (!id) return;
    try {
      await loadPatientContext(id);
      const body = U.qs('#iot-report-body');
      if (body) body.innerHTML = reportBodyHTML(appCtx(), 'isotonic');
      U.toast('已载入患者等张报告', 'success');
    } catch (e) { console.error(e); U.toast('加载患者失败：' + (e.message || e), 'error'); }
  };
  window.printIsoReport = async function () {
    const body = U.qs('#iso-report-body');
    if (!body) return;
    let html = body.innerHTML;
    try {
      const qb = await window.Share.buildPlanQrBlock({ mode: 'report' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    window.printReportHTML(html);
  };
  window.printIotReport = async function () {
    const body = U.qs('#iot-report-body');
    if (!body) return;
    let html = body.innerHTML;
    try {
      const qb = await window.Share.buildPlanQrBlock({ mode: 'report' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    window.printReportHTML(html);
  };
  window.shareIsoReport = function () {
    if (!AppState.patient || !AppState.patient.id) { U.toast('请先在上方选择患者', 'warning'); return; }
    if (window.Share) window.Share.openQRModal(); else U.toast('分享组件未加载', 'warning');
  };
  window.shareIotReport = function () {
    if (!AppState.patient || !AppState.patient.id) { U.toast('请先在上方选择患者', 'warning'); return; }
    if (window.Share) window.Share.openQRModal(); else U.toast('分享组件未加载', 'warning');
  };

  /* ================= 报告管理中心 ================= */
  function getStage() {
    let stage = U.qs('#report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    return stage;
  }
  function printHTML(html) {
    const stage = getStage();
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 60);
  }
  window.printReportHTML = printHTML;

  function isoSummary(ctx) {
    const iso = arr(get('isokineticData', [], ctx));
    if (!iso.length) return '暂无等速测评数据';
    const last = iso.slice(-1)[0];
    const s = safe(() => Calc.isokineticScore(last, genderOf(ctx)), null);
    return `等速设备 ${iso.length} 台 ｜ 最新 ${last.testDate || '—'} ｜ 综合评分 ${s ? s.total : '—'}`;
  }
  function iotSummary(ctx) {
    const iot = arr(get('isotonicData', [], ctx));
    if (!iot.length) return '暂无等张测评数据';
    const last = iot.slice(-1)[0];
    return `等张记录 ${iot.length} 条 ｜ 最新 ${last.testDate || '—'} ｜ 1RM ${last.oneRML != null ? last.oneRML : '—'} kg`;
  }
  function planSummary(ctx) {
    const plan = get('plan', {}, ctx);
    if (!plan || !(plan.generatedAt || plan.generatedBy)) return '暂未生成智能训练方案';
    if (plan.generatedBy === 'ai') {
      const segs = [];
      if (plan.safety) segs.push('安全核查');
      if (plan.qudong && plan.qudong.length) segs.push('设备处方');
      if (plan.bodyweight && plan.bodyweight.length) segs.push('徒手方案');
      if (plan.aerobic) segs.push('有氧');
      return `已生成（AI · ${String(plan.generatedAt || plan.aiProvider || '').slice(0, 10)}）｜ 含 ${segs.join('/') || '—'}`;
    }
    const parts = [];
    if (plan.nutrition) parts.push('饮食');
    if (plan.aerobic && plan.aerobic.phases) parts.push('有氧');
    if (plan.resistance) parts.push('抗阻');
    if (plan.flexibility) parts.push('柔韧');
    if (plan.balance) parts.push('平衡');
    if (plan.strength && (plan.strength.isoProgram || plan.strength.itoProgram)) parts.push('肌力专项');
    return `已生成（${String(plan.generatedAt).slice(0, 10)}）｜ 含 ${parts.join('/') || '—'}`;
  }
  function lifeSummary(ctx) {
    const ls = get('lifeSurvey', {}, ctx);
    if (!ls || !ls._scored) return '暂无生活方式问卷数据';
    const dims = arr(ls._scored.dims).length;
    return `生活方式评分 ${ls._scored.total} 分（${ls._scored.grade}）｜ ${dims} 个维度`;
  }

  function sarcSummary(ctx) {
    const pid = (ctx.patient && ctx.patient.id) || '';
    let n = 0, last = '—';
    try {
      const list = (window.SarcDB && pid) ? window.SarcDB.listByPatient(pid) : [];
      n = list.length;
      if (n) {
        const sorted = list.slice().sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0));
        last = sorted[0].assessDate || sorted[0].no || '—';
        const g = sorted[0].result && sorted[0].result.direction && sorted[0].result.direction.sarcGrade;
        return `肌少症评估 ${n} 次 ｜ 最新 ${last}${g ? ' ｜ 分级：' + g : ''}`;
      }
    } catch (e) {}
    return '暂无肌少症评估记录';
  }
  function fallSummary(ctx) {
    const pid = (ctx.patient && ctx.patient.id) || '';
    let n = 0, last = '—', level = '';
    try {
      const list = (window.FallDB && pid) ? window.FallDB().listRecords(pid) : [];
      n = list.length;
      if (n) {
        const sorted = list.slice().sort((a, b) => new Date(b.assessDate || b.updatedAt || 0) - new Date(a.assessDate || a.updatedAt || 0));
        last = sorted[0].assessDate || '—';
        level = sorted[0].result && sorted[0].result.level ? sorted[0].result.level : '';
      }
    } catch (e) {}
    return `跌倒评估 ${n} 次 ｜ 最新 ${last}${level ? ' ｜ 风险：' + ({ high: '高', mid: '中', low: '低' }[level] || level) : ''}`;
  }

  /* 按方向分组的报告类别：体重管理 / 老年肌少症-跌倒风险 / 肌力评估 */
  const DIRECTIONS = [
    {
      key: 'weight',
      label: '体重管理',
      icon: '⚖️',
      cats: [
        { key: 'full', title: '综合评估报告', sum: c => '体格/体成分/能量代谢/方案/肌力 全量合并', docable: true },
        { key: 'plan', title: '智能训练方案', sum: planSummary, docable: true },
        { key: 'lifestyle', title: '鹊动生活方式评估报告', sum: lifeSummary, docable: true }
      ]
    },
    {
      key: 'sarc_fall',
      label: '老年肌少症-跌倒风险',
      icon: '🧓',
      cats: [
        { key: 'sarcopenia', title: '肌少症评估报告', sum: sarcSummary, docable: false, nav: '#/sarcopenia' },
        { key: 'fall', title: '跌倒风险评估报告', sum: fallSummary, docable: false, nav: '#/fall-risk-stats' }
      ]
    },
    {
      key: 'strength',
      label: '肌力评估',
      icon: '⚙️',
      cats: [
        { key: 'isokinetic', title: '鹊动等速肌力评估报告', sum: isoSummary, docable: true },
        { key: 'isotonic', title: '鹊动等张肌力评估报告', sum: iotSummary, docable: true }
      ]
    }
  ];

  function catHas(c, ctx) {
    const key = c.key;
    if (key === 'full') return true;
    if (key === 'plan') return !!(ctx.plan && ctx.plan.generatedAt);
    if (key === 'lifestyle') return !!(ctx.lifeSurvey && ctx.lifeSurvey._scored);
    if (key === 'isokinetic') return arr(ctx.isokineticData).length > 0;
    if (key === 'isotonic') return arr(ctx.isotonicData).length > 0;
    if (key === 'sarcopenia') { try { return !!(window.SarcDB && ctx.patient && ctx.patient.id && window.SarcDB.listByPatient(ctx.patient.id).length); } catch (e) { return false; } }
    if (key === 'fall') { try { return !!(window.FallDB && ctx.patient && ctx.patient.id && window.FallDB().listRecords(ctx.patient.id).length); } catch (e) { return false; } }
    return false;
  }

  function renderDirectionCats(directionKey, p) {
    const dir = DIRECTIONS.find(d => d.key === directionKey) || DIRECTIONS[0];
    const ctx = ctxFromPatient(p);
    return `
      <div class="report-cats-grid">
        ${dir.cats.map(c => {
          const has = catHas(c, ctx);
          const sum = (c.sum && typeof c.sum === 'function') ? c.sum(ctx) : '';
          const viewBtn = c.docable
            ? `<button class="btn btn-sm btn-primary cat-view" data-key="${c.key}">查看 / 打印</button>`
            : `<a class="btn btn-sm btn-primary" href="${c.nav}">进入模块查看 →</a>`;
          return `
          <div class="report-cat-card">
            <label class="report-cat-check"><input type="checkbox" class="cat-check" value="${c.key}" ${has ? 'checked' : ''} ${c.docable ? '' : 'disabled'}/> 加入组合导出</label>
            <h4 class="report-cat-title">${U.esc(c.title)}</h4>
            <p class="text-muted" style="font-size:12px;min-height:32px;">${U.esc(sum)}</p>
            <div class="no-print">${viewBtn}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  Pages.report = async function () {
    const api = window.CenterAPI;
    let all = api ? api.loadAll() : [];
    const ctxOf = (id) => { const p = all.find(x => x.id === id); return p ? ctxFromPatient(p) : appCtx(); };

    const dirTabsHTML = `
      <div class="rep-dir-seg no-print" role="tablist" aria-label="报告方向">
        ${DIRECTIONS.map((d, i) => `
          <button type="button" class="rep-dir-seg-btn ${i === 0 ? 'is-active' : ''}" data-dir="${d.key}" role="tab" aria-selected="${i === 0}">
            <span class="rep-dir-icon">${d.icon}</span><span class="rep-dir-text">${U.esc(d.label)}</span>
          </button>`).join('')}
      </div>
      <div class="rep-kpi-row no-print">
        <div class="rep-kpi"><div class="rep-kpi-l">本方向档案</div><div class="rep-kpi-v" id="rep-kpi-count">—</div></div>
        <div class="rep-kpi"><div class="rep-kpi-l">最新报告</div><div class="rep-kpi-v" id="rep-kpi-latest">—</div></div>
        <div class="rep-kpi"><div class="rep-kpi-l">覆盖县区</div><div class="rep-kpi-v" id="rep-kpi-region">—</div></div>
      </div>`;

    const root = U.el(`
      <div>
        <div class="page-header no-print">
          <div><h2 class="page-title">报告管理中心</h2><p class="text-muted">按方向查看 / 打印 / 导出报告 · 支持跨方向组合打印</p></div>
          <div class="topbar-actions">
            <button class="btn btn-secondary" id="rep-export-json">批量导出 JSON</button>
            ${window.SmartForm ? SmartForm.autosaveHTML('rep-filter-dot', '筛选条件自动记忆已开启') : ''}
          </div>
        </div>

        ${dirTabsHTML}

        <div id="rep-stats">${api ? api.statsHtml(all.filter(hasAnyDirection)) : ''}</div>

        <div class="rep-qoo-tip no-print">
          <span class="rep-qoo-ava" aria-hidden="true">🐧</span>
          <div><b>小Qoo 提示</b> · 切换上方方向 segmented control 可同步筛选患者列表、趋势图与可导出报告类别 — 不必二次刷新。</div>
        </div>

        <div class="card no-print" style="margin-top:18px;">
          <div class="card-header"><h3 class="card-title">检索筛选</h3></div>
          <div class="card-body">
            <div class="form-row rep-fr-4">
              <div class="form-group"><label>患者姓名</label><input type="text" id="rep-name" placeholder="精确匹配姓名" /></div>
              <div class="form-group"><label>起始日期</label><input type="date" id="rep-from" /></div>
              <div class="form-group"><label>结束日期</label><input type="date" id="rep-to" /></div>
              <div class="form-group" style="display:flex;align-items:flex-end;">
                <button class="btn btn-primary" id="rep-refresh">刷新</button>
              </div>
            </div>
            <div class="form-row" style="margin-top:8px;"><div class="form-group" style="flex:1;">
              <label>快速选择患者</label>
              <select id="rep-pick"><option value="">— 选择患者查看其报告 —</option>
                ${all.filter(hasAnyDirection).map(p => `<option value="${p.id}">${U.esc(p.patientName || (p.data && p.data.patient && p.data.patient.name) || '未命名')}</option>`).join('')}
              </select>
            </div></div>
          </div>
        </div>

        <div class="card no-print" style="margin-top:18px;">
          <div class="card-header"><h3 class="card-title">体重管理趋势（BMI）</h3></div>
          <div class="card-body" id="rep-trend-body">${api ? api.trendHtml(all.filter(p => hasDirection(p, 'weight'))) : ''}</div>
        </div>

        <div id="rep-list" style="margin-top:18px;">${api ? api.renderList(all.filter(hasAnyDirection)) : ''}</div>

        <div id="rep-cats" class="no-print"></div>
      </div>`);

    /* 按评估方向过滤：检查患者主档案与方向独立台账 */
    function hasDirection(p, dir) {
      const data = p.data || {};
      if (dir === 'weight') {
        return !!(data.assessment || (data.plan && data.plan.nutrition) || data.lifestyle);
      }
      if (dir === 'sarcopenia') {
        try { return !!(window.SarcDB && window.SarcDB.listByPatient(p.id).length); } catch (e) { return false; }
      }
      if (dir === 'fall') {
        try {
          if (!window.FallDB) return false;
          const fd = window.FallDB();
          const list = fd.listRecords ? fd.listRecords(p.id) : (fd.listRecords ? fd.listRecords() : []);
          return !!(Array.isArray(list) ? list.filter(r => r.patientId === p.id).length : 0);
        } catch (e) { return false; }
      }
      return false;
    }
    function hasAnyDirection(p) {
      return hasDirection(p, 'weight') || hasDirection(p, 'sarcopenia') || hasDirection(p, 'fall');
    }
    function directionChips(p) {
      const chips = [];
      if (hasDirection(p, 'weight')) chips.push('<span class="badge badge-info" style="margin-right:4px;">体重管理</span>');
      if (hasDirection(p, 'sarcopenia')) chips.push('<span class="badge badge-warning" style="margin-right:4px;">肌少症</span>');
      if (hasDirection(p, 'fall')) chips.push('<span class="badge badge-danger" style="margin-right:4px;">跌倒</span>');
      return chips.join('') || '<span style="color:var(--text-muted);font-size:12px;">未开展</span>';
    }

    let activeDir = DIRECTIONS[0].key;

    function applyFilter() {
      const name = U.qs('#rep-name', root).value.trim();
      const from = U.qs('#rep-from', root).value;
      const to = U.qs('#rep-to', root).value;
      let f = all.filter(hasAnyDirection);
      if (name) f = f.filter(p => (p.patientName || (p.data && p.data.patient && p.data.patient.name) || '').includes(name));
      if (from) f = f.filter(p => U.fmtDate(p.updatedAt) >= from);
      if (to) f = f.filter(p => U.fmtDate(p.updatedAt) <= to);
      if (activeDir === 'weight') f = f.filter(p => hasDirection(p, 'weight'));
      else if (activeDir === 'sarc_fall') f = f.filter(p => hasDirection(p, 'sarcopenia') || hasDirection(p, 'fall'));
      else if (activeDir === 'strength') f = f.filter(p => (p.data?.isokineticData?.length || 0) + (p.data?.isotonicData?.length || 0) > 0);
      U.qs('#rep-stats', root).innerHTML = api ? api.statsHtml(f) : '';
      U.qs('#rep-list', root).innerHTML = api ? api.renderList(f) : '';
      const trendEl = U.qs('#rep-trend-body', root);
      if (trendEl) trendEl.innerHTML = api ? api.trendHtml(all.filter(p => hasDirection(p, 'weight'))) : '';
      bindList();
      U.qs('#rep-cats', root).innerHTML = '';
      /* 同步刷新 KPI */
      const kpiCount = U.qs('#rep-kpi-count', root);
      const kpiLatest = U.qs('#rep-kpi-latest', root);
      const kpiRegion = U.qs('#rep-kpi-region', root);
      if (kpiCount) kpiCount.textContent = String(f.length);
      if (kpiLatest) {
        const top = f.slice().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
        kpiLatest.textContent = top ? ((top.patientName || (top.data && top.data.patient && top.data.patient.name) || '未命名') + ' · ' + U.fmtDate(top.updatedAt)) : '—';
      }
      if (kpiRegion) {
        const counties = new Set(f.map(p => (p.data && p.data.patient && p.data.patient.region && p.data.patient.region.county) || '').filter(Boolean));
        kpiRegion.textContent = counties.size ? counties.size + ' 个县区' : '—';
      }
    }

    U.qs('#rep-name', root).addEventListener('input', applyFilter);
    U.qs('#rep-from', root).addEventListener('change', applyFilter);
    U.qs('#rep-to', root).addEventListener('change', applyFilter);
    U.qs('#rep-refresh', root).addEventListener('click', () => { all = api ? api.loadAll() : []; applyFilter(); U.toast('已刷新', 'info'); });

    /* 方向 tab 切换 */
    U.qsa('.rep-dir-seg-btn', root).forEach(btn => btn.addEventListener('click', () => {
      U.qsa('.rep-dir-seg-btn', root).forEach(b => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-selected', b === btn); });
      activeDir = btn.dataset.dir;
      applyFilter();
    }));

    U.qs('#rep-export-json', root).addEventListener('click', () => {
      if (!confirm('确认导出当前全部患者档案（JSON）？')) return;
      const payload = { exportedBy: AppState.currentUser.username, exportedAt: new Date().toISOString(), patients: all };
      U.download(`report-center-${U.today()}.json`, JSON.stringify(payload, null, 2));
      U.toast('已导出 JSON 档案', 'success');
    });

    function showCats(p) {
      const catsEl = U.qs('#rep-cats', root);
      catsEl.innerHTML = `
        <div class="report-cats-head no-print">
          <h3 class="card-title">${U.esc(p.patientName || (p.data && p.data.patient && p.data.patient.name) || '患者')} 的报告 · ${U.esc(DIRECTIONS.find(d => d.key === activeDir)?.label || '')}</h3>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" id="rep-export-pdf">📄 导出 PDF</button>
            <button class="btn btn-sm btn-success" id="rep-combine">组合导出打印（勾选）</button>
            <button class="btn btn-sm btn-secondary" id="rep-share">📲 分享二维码</button>
          </div>
        </div>
        ${renderDirectionCats(activeDir, p)}`;
      catsEl.scrollIntoView({ behavior: 'smooth' });

      U.qsa('.cat-view', catsEl).forEach(btn => btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        printHTML(window.buildReportDoc(ctxOf(p.id), key));
      }));
      U.qs('#rep-combine', catsEl).addEventListener('click', () => {
        const keys = U.qsa('.cat-check', catsEl).filter(c => c.checked && !c.disabled).map(c => c.value);
        if (!keys.length) { U.toast('请至少勾选一类报告', 'warning'); return; }
        const order = ['full', 'plan', 'lifestyle', 'isokinetic', 'isotonic'];
        const validKeys = order.filter(k => keys.includes(k));
        const html = validKeys.map(k => window.buildReportDoc(ctxOf(p.id), k)).join('<hr class="report-divider"/>');
        printHTML(html);
      });
      U.qs('#rep-export-pdf', catsEl).addEventListener('click', () => {
        const ctx = ctxOf(p.id);
        const allCats = DIRECTIONS.flatMap(d => d.cats);
        const order = allCats.filter(c => c.docable && catHas(c, ctx)).map(c => c.key);
        if (!order.length) { U.toast('该患者在当前方向无可打印报告', 'warning'); return; }
        const html = order.map(k => window.buildReportDoc(ctx, k)).join('<hr class="report-divider"/>');
        printHTML(html);
      });
      U.qs('#rep-share', catsEl).addEventListener('click', async () => {
        await loadPatientContext(p.id);
        if (window.Share) window.Share.openQRModal();
      });
    }

    function bindList() {
      if (!api) return;
      U.qsa('.center-load', root).forEach(btn => btn.addEventListener('click', async () => {
        const p = all.find(x => x.id === btn.dataset.id);
        if (!p) return;
        await loadPatientContext(p.id);
        location.hash = '#/report';
        showCats(p);
      }));
      U.qsa('.center-preview', root).forEach(btn => btn.addEventListener('click', async () => {
        const p = all.find(x => x.id === btn.dataset.id);
        if (!p) return;
        const s = api.summarize(p);
        U.modal(`<h3 style="margin:0 0 8px;">${U.esc(s.name)} 档案预览</h3>
          <div style="margin-bottom:8px;">${directionChips(p)}</div>
          <p>BMI：${s.bmi ?? '—'} ｜ 体重：${s.weight ?? '—'}kg ｜ 目标热量：${s.target ?? '—'}</p>
          <p>生活方式分：${s.lifeScore ?? '—'} ｜ 等速肌力：${s.isoScore ?? '—'} ｜ 等张肌力：${s.iotScore ?? '—'}</p>
          <p>肌力测评次数：等速 ${s.isoCount} ｜ 等张 ${s.iotCount}</p>`);
      }));
      // 在列表行增加「报告中心」按钮
      U.qsa('.center-preview', root).forEach(() => {});
      U.qsa('tr', root).forEach(tr => {
        if (!tr.querySelector('.center-load')) return;
        let td = tr.querySelector('td:last-child');
        if (td && !td.querySelector('.center-report')) {
          const id = tr.querySelector('.center-load').dataset.id;
          const b = document.createElement('button');
          b.className = 'btn btn-ghost btn-sm center-report';
          b.textContent = '报告';
          b.dataset.id = id;
          td.appendChild(document.createTextNode(' '));
          td.appendChild(b);
          b.addEventListener('click', () => {
            const p = all.find(x => x.id === id);
            if (p) showCats(p);
          });
        }
      });
    }
    bindList();

    U.qs('#rep-pick', root).addEventListener('change', () => {
      const id = U.qs('#rep-pick', root).value;
      if (!id) return;
      const p = all.find(x => x.id === id);
      if (p) showCats(p);
    });

    /* ---- P2：报告中心智能交互（渐进披露 + 筛选条件自动记忆 + 日期校验）---- */
    if (window.SmartForm) {
      const dot = SmartForm.attachAutosave(U.qs('#rep-filter-dot', root));
      const FKEY = 'qd_report_filter_v1';
      const saveFilter = () => {
        try {
          const f = {
            name: U.qs('#rep-name', root).value.trim(),
            from: U.qs('#rep-from', root).value,
            to: U.qs('#rep-to', root).value
          };
          localStorage.setItem(FKEY, JSON.stringify(f));
          dot.ping();
        } catch (e) { dot.fail('筛选条件记忆失败'); }
      };
      // 字段校验：起始日期不能晚于结束日期，自动对调纠正
      const guardDates = () => {
        const from = U.qs('#rep-from', root), to = U.qs('#rep-to', root);
        if (from.value && to.value && from.value > to.value) {
          U.toast('起始日期晚于结束日期，已自动对调', 'warning');
          const t = from.value; from.value = to.value; to.value = t;
        }
      };
      // 渐进披露：检索 / 趋势卡片可折叠（与综合评估页一致）
      SmartForm.collapsibleCards(root);
      // 恢复上次筛选条件
      let restored = false;
      try {
        const raw = localStorage.getItem(FKEY);
        if (raw) {
          const f = JSON.parse(raw);
          if (f.name != null) U.qs('#rep-name', root).value = f.name;
          if (f.from != null) U.qs('#rep-from', root).value = f.from;
          if (f.to != null) U.qs('#rep-to', root).value = f.to;
          restored = !!(f.name || f.from || f.to);
        }
      } catch (e) { /* 忽略损坏的本地缓存 */ }
      U.qs('#rep-name', root).addEventListener('input', saveFilter);
      U.qs('#rep-from', root).addEventListener('change', () => { guardDates(); saveFilter(); });
      U.qs('#rep-to', root).addEventListener('change', () => { guardDates(); saveFilter(); });
      U.qs('#rep-refresh', root).addEventListener('click', saveFilter);
      if (restored) { applyFilter(); dot.ping(); }
    }

    return root;
  };
})();
