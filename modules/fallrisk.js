/**
 * 鹊动FAC功能评估与干预系统
 * ────────────────────────────────────────────────────────────────
 * 【独立方向模块】老年跌倒风险评估（Fall Risk Assessment）
 *
 * 与肌少症、体重管理并列的第三大评估方向。依据用户确认方案（2026-08-11）：
 *   · 导航归入「综合评估中心」与体重管理/肌少症平级
 *   · 数据复用患者主档案 AppState.patient.data（fallDraft / fallRecords），不新建独立表
 *   · 首期手动录入（蓝牙设备后续接入）
 *   · 三方向 Phase 1 全接入 AI（报告解读 + 方案推荐）
 *
 * 分级依据（简化临床常模，仅供辅助，不替代临床诊断）：
 *   单腿站立(睁眼) <5s / TUG >12s / 4m 步速 <0.8 / 近1年跌倒≥2次 / FES-I ≥19 → 高危因子
 * ────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ==================================================================
   * 0. 数据访问层（复用患者主档案 AppState.patient.data）
   * ================================================================== */
  function curPatient() {
    return (AppState && AppState.patient && AppState.patient.id) ? AppState.patient : null;
  }
  // 与肌少症 D() 同构，但底层落在患者主档案，满足「复用 patient.data」决策
  const D = () => ({
    getDraft() {
      const p = curPatient();
      return (p && p.data && p.data.fallDraft) || null;
    },
    saveDraft(d) {
      const p = curPatient();
      if (!p) return;
      p.data = p.data || {};
      p.data.fallDraft = d;
      if (window.persistPatient) window.persistPatient();
    },
    clearDraft() {
      const p = curPatient();
      if (!p || !p.data) return;
      delete p.data.fallDraft;
      if (window.persistPatient) window.persistPatient();
    },
    listRecords() {
      const p = curPatient();
      return (p && p.data && Array.isArray(p.data.fallRecords)) ? p.data.fallRecords : [];
    },
    saveRecord(rec) {
      const p = curPatient();
      if (!p) return;
      p.data = p.data || {};
      p.data.fallRecords = p.data.fallRecords || [];
      const i = p.data.fallRecords.findIndex(r => r.id === rec.id);
      if (i >= 0) p.data.fallRecords[i] = rec; else p.data.fallRecords.push(rec);
      if (window.persistPatient) window.persistPatient();
    },
    nextNo() {
      const p = curPatient();
      const arr = (p && p.data && p.data.fallRecords) || [];
      return 'FALL-' + String(arr.length + 1).padStart(3, '0');
    }
  });

  function activePatientId() { const d = D().getDraft(); return (d && d.patientId) || null; }
  function basePatient() {
    const p = curPatient() || {};
    const height = U.num(p.height), weight = U.num(p.weight);
    const bmi = (height && weight) ? U.round(weight / Math.pow(height / 100, 2), 1) : null;
    return {
      id: p.id || null, name: p.name || '', gender: p.gender || 'male',
      age: U.num(p.age), height, weight, bmi,
      phone: p.phone || '', chronic: p.chronic || null
    };
  }
  function needPatient() {
    const b = basePatient();
    if (!b || !b.id || !b.name) {
      return `<div class="alert alert-warning"><div><strong>请先在患者档案中登记或选择患者</strong>
        <p style="margin:6px 0 0;">跌倒风险评估复用患者主档案（姓名/性别/年龄/身高体重/BMI），
        需先在本系统完成患者登记并进入该患者工作上下文。</p>
        <div class="mt-2" style="display:flex;gap:8px;flex-wrap:wrap;">
          <a href="#/patient" class="btn btn-primary btn-sm">前往患者登记 →</a>
        </div></div></div>`;
    }
    return null;
  }

  /* 通用小组件 */
  function moduleBanner() {
    return `<div class="sarc-banner fall-banner">
      <div class="sarc-banner-l">
        <div class="sarc-banner-title">🤸 跌倒风险评估（独立方向）</div>
        <div class="sarc-banner-sub">与体重管理、肌少症并列的三大评估方向 · 复用患者主档案</div>
      </div>
    </div>`;
  }
  function tipBox(title, text) {
    return `<div class="sarc-tip"><span class="sarc-tip-ico">💡</span><div><b>${U.esc(title)}</b><p>${U.esc(text)}</p></div></div>`;
  }
  function radioRow(name, val, opts) {
    return `<div class="radio-group" data-radio="${U.esc(name)}">` + opts.map(o =>
      `<label class="radio-item"><input type="radio" name="${U.esc(name)}" value="${U.esc(o[1])}"${val === o[1] ? ' checked' : ''}><span>${U.esc(o[0])}</span></label>`
    ).join('') + '</div>';
  }

  /* ==================================================================
   * 1. 页面入口：5 步向导
   * ================================================================== */
  const STEPS = [
    { n: 1, t: '跌倒史与近因', i: 'Fall History' },
    { n: 2, t: '平衡功能', i: 'Balance' },
    { n: 3, t: '步态与移动', i: 'Gait & Mobility' },
    { n: 4, t: '感觉/认知/环境', i: 'Sensory & Env' },
    { n: 5, t: '风险报告与预防方案', i: 'Report & Plan' }
  ];

  Pages.fallRisk = function () {
    let warn = needPatient();
    if (warn) {
      // 安全网：已选中患者（currentPatientId 有值）但工作上下文未就绪时，给手动加载入口，
      // 避免刷新/异常后 AppState.patient 缺失 id 而误判"无患者"，导致无法进入评估。
      if (AppState && AppState.currentPatientId && typeof loadPatientContext === 'function') {
        return `<div class="card"><div class="card-body" style="text-align:center;padding:48px 24px;">
          <div style="font-size:48px;margin-bottom:16px;">👤</div>
          <h3 style="margin-bottom:8px;">当前患者上下文未就绪</h3>
          <p style="color:var(--text-muted);margin-bottom:20px;">系统已记录患者 ID，但本地工作区尚未加载。</p>
          <button class="btn btn-primary" onclick="loadFallPatientAndRoute()">加载当前患者并进入评估</button>
          <p style="margin-top:16px;font-size:12px;color:var(--text-muted);">或 <a href="#/patient">返回首诊登记</a> 重新选择患者</p>
        </div></div>`;
      }
      return warn;
    }
    const base = basePatient();
    const draft = D().getDraft();

    const S0 = {
      step: 1, id: 'fall_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: null, patientId: base.id, assessDate: U.today(),
      // 步骤1：跌倒史与近因
      history: { fallsPast1y: '', fracture: '', fearFall: '', fearFallScore: '', useAid: '', aidType: '' },
      // 步骤2：平衡功能
      balance: { singleLegSec: '', singleLegCannot: false, romberg: '', weightShift: '', tandem: '' },
      // 步骤3：步态与移动
      mobility: { gaitSpeed: '', tugSec: '', chair30: '', gaitAbnormal: '' },
      // 步骤4：感觉/认知/环境
      sensory: { vision: '', hearing: '', psychotropic: '', orthostatic: '', cognition: '', homeHazards: '' },
      result: null, saved: false, reportFile: null
    };
    let S = (draft && String(draft.patientId) === String(base.id)) ? Object.assign({}, S0, draft) : S0;
    S.history = Object.assign({}, S0.history, S.history || {});
    S.balance = Object.assign({}, S0.balance, S.balance || {});
    S.mobility = Object.assign({}, S0.mobility, S.mobility || {});
    S.sensory = Object.assign({}, S0.sensory, S.sensory || {});
    S.patientId = base.id;

    const wrap = U.el(`<div>
      ${moduleBanner()}
      <div class="card mb-3"><div class="card-body sarc-head">
        <div><span class="sarc-head-l">评估对象</span><div class="sarc-head-v" id="head-name">${U.esc(base.name)}</div></div>
        <div><span class="sarc-head-l">性别 / 年龄</span><div class="sarc-head-v">${base.gender === 'female' ? '女' : '男'} · ${base.age != null ? base.age + ' 岁' : '—'}</div></div>
        <div><span class="sarc-head-l">BMI</span><div class="sarc-head-v">${base.bmi != null ? base.bmi : '—'}</div></div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="btn-demo-fall">一键填充演示数据</button>
          <a class="btn btn-secondary btn-sm" href="#/patient">返回患者档案</a>
        </div>
      </div></div>

      <div class="sarc-stepper" id="fall-stepper"></div>
      <div id="fall-step-body"></div>

      <div class="card mt-3 no-print"><div class="card-body sarc-navbar">
        <button class="btn btn-secondary" id="fall-prev">← 上一步</button>
        <div class="sarc-nav-mid"><div id="fall-step-hint" class="sarc-hint"></div></div>
        <button class="btn btn-primary" id="fall-next">下一步 →</button>
      </div></div>
    </div>`);

    const bodyEl = U.qs('#fall-step-body', wrap);
    const stepperEl = U.qs('#fall-stepper', wrap);
    const prevBtn = U.qs('#fall-prev', wrap);
    const nextBtn = U.qs('#fall-next', wrap);
    const hintEl = U.qs('#fall-step-hint', wrap);

    let stepValidator = null;
    S.maxStep = Math.max(S.maxStep || 1, S.step || 1);

    const RANGE_RULES = {
      2: {
        '#f-singleleg': { min: 0, max: 60, label: '单腿站立', unit: '秒', soft: true, hint: '睁眼单腿站立，<5s 提示平衡差' },
        '#f-tug': { min: 3, max: 60, label: 'TUG 计时', unit: '秒', soft: true, hint: '起立-行走计时，>12s 为高危' }
      },
      3: {
        '#f-gait': { min: 0.1, max: 3, label: '4 米步速', unit: 'm/s', soft: true, hint: '<0.8 m/s 提示移动能力受限' },
        '#f-chair30': { min: 0, max: 40, label: '30 秒坐立次数', unit: '次', soft: true }
      }
    };

    function saveDraft() { try { D().saveDraft(S); } catch (e) {} }

    function renderStepper() {
      const maxN = S.maxStep || S.step;
      stepperEl.innerHTML = STEPS.map(s => {
        const st = s.n < S.step ? 'done' : (s.n === S.step ? 'cur' : 'todo');
        const locked = s.n > maxN;
        return `<div class="sarc-step ${st}" data-step="${s.n}" data-locked="${locked ? 1 : 0}">
          <div class="sarc-step-dot">${st === 'done' ? '✓' : (locked ? '🔒' : s.n)}</div>
          <div class="sarc-step-t"><b>${U.esc(s.t)}</b><span>${s.i} 步骤 ${s.n}</span></div></div>`;
      }).join('');
      U.qsa('.sarc-step', stepperEl).forEach(d => d.onclick = () => {
        const target = parseInt(d.dataset.step, 10);
        if (target === S.step) return;
        if (d.dataset.locked === '1') { U.toast(`步骤 ${target} 尚未解锁，请先完成前序步骤`, 'warning'); return; }
        S.step = target; render();
      });
    }

    function render() {
      S.maxStep = Math.max(S.maxStep || 1, S.step);
      stepValidator = null;
      renderStepper();
      bodyEl.innerHTML = stepHTML(S.step);
      bindStep(S.step);
      if (window.SmartForm) {
        SmartForm.collapsibleCards(bodyEl);
        const rules = RANGE_RULES[S.step];
        if (rules) stepValidator = SmartForm.bindRanges(bodyEl, rules);
      }
      prevBtn.style.visibility = S.step === 1 ? 'hidden' : 'visible';
      nextBtn.textContent = S.step === STEPS.length ? '完成并归档' : '下一步 →';
      hintEl.textContent = `步骤 ${S.step} / ${STEPS.length} · ${STEPS[S.step - 1].t}`;
      saveDraft();
      bodyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    /* ---------- 各步骤 HTML ---------- */
    function stepHTML(k) {
      switch (k) {
        case 1: return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">📋</span>步骤 1 · 跌倒史与近因</h3></div>
            <div class="card-body">
              ${tipBox('采集要点', '重点询问近 1 年跌倒次数、骨折史、跌倒恐惧（FES-I 简版）及助行器使用情况。')}
              <div class="sarc-sub-h">一、跌倒与损伤史</div>
              <div class="form-grid">
                <div class="form-group"><label>近 1 年跌倒次数</label>
                  <input type="number" step="1" min="0" id="h-falls" value="${U.esc(S.history.fallsPast1y != null ? S.history.fallsPast1y : '')}" placeholder="0"></div>
                <div class="form-group"><label>既往骨折史（跌倒相关）</label>
                  ${radioRow('h_fracture', S.history.fracture || '', [['无', 'no'], ['有', 'yes']])}</div>
                <div class="form-group"><label>近 1 年是否因跌倒就医</label>
                  ${radioRow('h_fearFall', S.history.fearFall || '', [['否', 'no'], ['是', 'yes']])}</div>
                <div class="form-group"><label>FES-I 跌倒效能量表（简版，0–20）</label>
                  <input type="number" step="1" min="0" max="20" id="h-fesscore" value="${U.esc(S.history.fearFallScore != null ? S.history.fearFallScore : '')}" placeholder="如 14"></div>
              </div>
              <div class="sarc-sub-h" style="margin-top:18px;">二、移动辅助</div>
              <div class="form-grid">
                <div class="form-group"><label>是否使用助行器</label>
                  ${radioRow('h_useAid', S.history.useAid || '', [['否', 'no'], ['是', 'yes']])}</div>
                <div class="form-group"><label>助行器类型</label>
                  <input type="text" id="h-aidtype" value="${U.esc(S.history.aidType || '')}" placeholder="如 四脚拐、助行架"></div>
              </div>
            </div></div>`;

        case 2: return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">⚖️</span>步骤 2 · 平衡功能测试</h3></div>
            <div class="card-body">
              ${tipBox('操作提示', '单腿站立（睁眼）与 TUG 为客观平衡核心指标；Romberg / 重心转移 / 串联站立为定性补充。')}
              <div class="sarc-sub-h">一、单腿站立（睁眼，秒）</div>
              <div class="form-grid">
                <div class="form-group"><label>维持秒数</label>
                  <input type="number" step="0.1" min="0" id="f-singleleg" value="${U.esc(S.balance.singleLegSec != null ? S.balance.singleLegSec : '')}" placeholder="如 8.5"></div>
                <div class="form-group"><label>无法完成单腿站立</label>
                  ${radioRow('f_singleCannot', S.balance.singleLegCannot ? 'yes' : 'no', [['否', 'no'], ['是', 'yes']])}</div>
              </div>
              <div class="sarc-sub-h" style="margin-top:18px;">二、静态/动态平衡</div>
              <div class="form-grid">
                <div class="form-group"><label>Romberg 试验（闭眼）</label>
                  ${radioRow('f_romberg', S.balance.romberg || '', [['稳定', 'stable'], ['轻度晃动', 'sway'], ['明显不稳/无法', 'unable']])}</div>
                <div class="form-group"><label>前后左右重心转移</label>
                  ${radioRow('f_weightShift', S.balance.weightShift || '', [['正常', 'ok'], ['欠稳', 'poor']])}</div>
                <div class="form-group"><label>串联站立（足跟接足尖）</label>
                  ${radioRow('f_tandem', S.balance.tandem || '', [['可完成', 'ok'], ['无法完成', 'unable']])}</div>
              </div>
            </div></div>`;

        case 3: return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🚶</span>步骤 3 · 步态与移动能力</h3></div>
            <div class="card-body">
              ${tipBox('采集要点', '4 米步速、TUG（起立-行走计时）、30 秒坐立为移动与下肢力量核心指标。')}
              <div class="sarc-sub-h">一、步速与转移计时</div>
              <div class="form-grid">
                <div class="form-group"><label>4 米步速（m/s）</label>
                  <input type="number" step="0.01" min="0.1" id="f-gait" value="${U.esc(S.mobility.gaitSpeed != null ? S.mobility.gaitSpeed : '')}" placeholder="如 0.9"></div>
                <div class="form-group"><label>TUG 计时（秒）</label>
                  <input type="number" step="0.1" min="3" id="f-tug" value="${U.esc(S.mobility.tugSec != null ? S.mobility.tugSec : '')}" placeholder="如 11.2"></div>
                <div class="form-group"><label>30 秒坐立次数</label>
                  <input type="number" step="1" min="0" id="f-chair30" value="${U.esc(S.mobility.chair30 != null ? S.mobility.chair30 : '')}" placeholder="如 12"></div>
              </div>
              <div class="sarc-sub-h" style="margin-top:18px;">二、步态观察</div>
              <div class="form-group" style="flex:1;">
                <label>步态异常描述（宽基底/拖曳/企鹅步等）</label>
                <input type="text" id="f-gaitabn" value="${U.esc(S.mobility.gaitAbnormal || '')}" placeholder="无异常 或 描述所见"></div>
            </div></div>`;

        case 4: return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">👁️</span>步骤 4 · 感觉 / 认知 / 环境</h3></div>
            <div class="card-body">
              ${tipBox('采集要点', '视力、听力、精神类/降压/降糖药物、体位性低血压、认知状态及居家环境隐患均为跌倒危险因子。')}
              <div class="sarc-sub-h">一、感觉与认知</div>
              <div class="form-grid">
                <div class="form-group"><label>视力</label>
                  ${radioRow('s_vision', S.sensory.vision || '', [['正常/矫正可', 'normal'], [' impaired', 'impaired']])}</div>
                <div class="form-group"><label>听力</label>
                  ${radioRow('s_hearing', S.sensory.hearing || '', [['正常', 'normal'], ['下降', 'impaired']])}</div>
                <div class="form-group"><label>认知状态</label>
                  ${radioRow('s_cognition', S.sensory.cognition || '', [['正常', 'normal'], ['下降', 'impaired']])}</div>
                <div class="form-group"><label>体位性低血压（立位头晕）</label>
                  ${radioRow('s_orthostatic', S.sensory.orthostatic || '', [['无', 'no'], ['有', 'yes']])}</div>
              </div>
              <div class="sarc-sub-h" style="margin-top:18px;">二、用药与环境</div>
              <div class="form-grid">
                <div class="form-group"><label>是否服用镇静/催眠/抗抑郁/降压药</label>
                  ${radioRow('s_psychotropic', S.sensory.psychotropic || '', [['否', 'no'], ['是', 'yes']])}</div>
                <div class="form-group"><label>居家环境隐患（光线/地面/扶手）</label>
                  ${radioRow('s_home', S.sensory.homeHazards || '', [['无', 'no'], ['有', 'yes']])}</div>
              </div>
            </div></div>`;

        case 5: {
          const R = compute();
          S.result = R;
          return `<div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">📑</span>步骤 5 · 跌倒风险报告与预防方案</h3></div>
              <div class="card-body">${reportHTML(R, base, S)}</div></div>`;
        }
      }
      return '';
    }

    /* ---------- 字段绑定 ---------- */
    function bindStep(k) {
      const g = (id) => U.qs('#' + id, bodyEl);
      const val = (id) => { const el = g(id); return el ? el.value : ''; };
      const rad = (name) => { const el = U.qs(`input[name="${name}"]:checked`, bodyEl); return el ? el.value : ''; };
      if (k === 1) {
        g('h-falls').oninput = () => { S.history.fallsPast1y = val('h-falls'); saveDraft(); };
        g('h-fesscore').oninput = () => { S.history.fearFallScore = val('h-fesscore'); saveDraft(); };
        g('h-aidtype').oninput = () => { S.history.aidType = val('h-aidtype'); saveDraft(); };
        ['h_fracture', 'h_fearFall', 'h_useAid'].forEach(n => U.qsa(`input[name="${n}"]`, bodyEl).forEach(r => r.onchange = () => {
          S.history[n.split('_')[1]] = rad(n); saveDraft();
        }));
      } else if (k === 2) {
        g('f-singleleg').oninput = () => { S.balance.singleLegSec = val('f-singleleg'); saveDraft(); };
        U.qsa('input[name="f_singleCannot"]', bodyEl).forEach(r => r.onchange = () => { S.balance.singleLegCannot = rad('f_singleCannot') === 'yes'; saveDraft(); });
        ['f_romberg', 'f_weightShift', 'f_tandem'].forEach(n => U.qsa(`input[name="${n}"]`, bodyEl).forEach(r => r.onchange = () => {
          S.balance[n.split('_')[1]] = rad(n); saveDraft();
        }));
      } else if (k === 3) {
        g('f-gait').oninput = () => { S.mobility.gaitSpeed = val('f-gait'); saveDraft(); };
        g('f-tug').oninput = () => { S.mobility.tugSec = val('f-tug'); saveDraft(); };
        g('f-chair30').oninput = () => { S.mobility.chair30 = val('f-chair30'); saveDraft(); };
        g('f-gaitabn').oninput = () => { S.mobility.gaitAbnormal = val('f-gaitabn'); saveDraft(); };
      } else if (k === 4) {
        ['s_vision', 's_hearing', 's_cognition', 's_orthostatic', 's_psychotropic', 's_home'].forEach(n => U.qsa(`input[name="${n}"]`, bodyEl).forEach(r => r.onchange = () => {
          const key = { s_vision: 'vision', s_hearing: 'hearing', s_cognition: 'cognition', s_orthostatic: 'orthostatic', s_psychotropic: 'psychotropic', s_home: 'homeHazards' }[n];
          S.sensory[key] = rad(n); saveDraft();
        }));
      } else if (k === 5) {
        wireStep5();
      }
    }

    /* ---------- 计算分级 ---------- */
    function compute() {
      const h = S.history, b = S.balance, m = S.mobility, s = S.sensory;
      const n = (x) => U.num(x);
      const factors = [];
      const push = (name, severity, value, advice) => factors.push({ name, severity, value, advice });

      const falls = n(h.fallsPast1y);
      if (falls >= 2) push('近1年跌倒≥2次', 'high', falls, '既往跌倒是再跌倒最强预测因子，需强化环境改造与肌力训练');
      else if (falls === 1) push('近1年跌倒1次', 'mid', falls, '存在再跌倒风险，建议预防性干预');

      const fes = n(h.fearFallScore);
      if (fes >= 19) push('FES-I 跌倒恐惧≥19', 'high', fes, '跌倒恐惧限制活动，形成「活动受限→衰弱」恶性循环');
      else if (fes >= 14) push('FES-I 偏高风险', 'mid', fes, '关注活动信心，渐进式平衡训练');

      if (h.fracture === 'yes') push('跌倒相关骨折史', 'high', '有', '骨密度评估与防跌并重');
      if (b.singleLegCannot) push('无法完成单腿站立', 'high', '无法', '静态平衡严重受损');
      else {
        const sl = n(b.singleLegSec);
        if (sl > 0 && sl < 5) push('单腿站立<5秒', 'high', sl + 's', '平衡能力差，优先平衡训练');
        else if (sl >= 5 && sl < 10) push('单腿站立5–10秒', 'mid', sl + 's', '平衡能力中等，持续训练');
      }
      if (b.romberg === 'unable') push('Romberg 明显不稳/无法', 'high', '无法', '本体感觉受损，需扶手辅助训练');
      else if (b.romberg === 'sway') push('Romberg 轻度晃动', 'mid', '晃动', '本体感觉下降');
      if (b.tandem === 'unable') push('无法串联站立', 'high', '无法', '动态平衡受损');
      if (b.weightShift === 'poor') push('重心转移欠稳', 'mid', '欠稳', '加强重心控制训练');

      const gait = n(m.gaitSpeed);
      if (gait > 0 && gait < 0.8) push('4米步速<0.8 m/s', 'high', gait + ' m/s', '移动能力受限，防跌倒重点人群');
      else if (gait >= 0.8 && gait < 1.0) push('4米步速0.8–1.0 m/s', 'mid', gait + ' m/s', '步速偏低，建议有氧+力量');
      const tug = n(m.tugSec);
      if (tug > 12) push('TUG>12秒', 'high', tug + 's', '转移能力显著下降');
      else if (tug >= 10 && tug <= 12) push('TUG 10–12秒', 'mid', tug + 's', '转移偏慢');
      const chair = n(m.chair30);
      if (chair > 0 && chair < 8) push('30秒坐立<8次', 'mid', chair + '次', '下肢力量不足');
      if (m.gaitAbnormal && m.gaitAbnormal.trim() && !/无/.test(m.gaitAbnormal)) push('步态异常', 'mid', m.gaitAbnormal, '结合神经科评估');

      if (s.vision === 'impaired') push('视力受损', 'mid', '受损', '改善照明、定期眼科');
      if (s.hearing === 'impaired') push('听力下降', 'mid', '下降', '助听与沟通安全');
      if (s.cognition === 'impaired') push('认知下降', 'high', '下降', '防走失与误服药物');
      if (s.orthostatic === 'yes') push('体位性低血压', 'high', '有', '起身缓慢、补液、药物复核');
      if (s.psychotropic === 'yes') push('服用镇静/降压/降糖药', 'high', '有', '用药复核，睡前给药避免夜起');
      if (s.homeHazards === 'yes') push('居家环境隐患', 'high', '有', '防滑、扶手、夜间照明改造');

      const high = factors.filter(f => f.severity === 'high').length;
      const mid = factors.filter(f => f.severity === 'mid').length;
      let level = 'low';
      if (high >= 1) level = 'high';
      else if (mid >= 2 || (mid >= 1 && falls >= 1)) level = 'mid';
      else if (mid >= 1) level = 'mid';

      const summary = level === 'high'
        ? '综合多项高危因子，判定为【高跌倒风险】，须立即启动多维度预防干预并尽快复核用药与环境。'
        : level === 'mid'
          ? '存在中度跌倒危险因子，建议开展平衡与下肢力量训练并优化居家环境。'
          : '当前危险因子较少，维持基础防跌健康教育与年度复评即可。';

      return { level, score: { high, mid, low: factors.length - high - mid }, factors, summary, input: { history: h, balance: b, mobility: m, sensory: s } };
    }

    /* ---------- 步骤 5 报告 + 方案 + AI ---------- */
    function reportHTML(R, base, S) {
      const levelText = { high: '高危', mid: '中危', low: '低危' }[R.level];
      const levelCls = { high: 'alert-danger', mid: 'alert-warning', low: 'alert-success' }[R.level];
      const factorRows = R.factors.length
        ? R.factors.map(f => `<tr><td>${U.esc(f.name)}</td><td><span class="fall-sev fall-sev-${f.severity}">${({high:'高危',mid:'中危',low:'低危'})[f.severity]}</span></td><td>${U.esc(String(f.value))}</td><td>${U.esc(f.advice || '')}</td></tr>`).join('')
        : '<tr><td colspan="4" class="text-muted">未识别到明显危险因子</td></tr>';

      return `
        <div class="alert ${levelCls}"><div><strong>跌倒风险等级：${levelText}</strong>
          <p style="margin:6px 0 0;font-size:13px;line-height:1.7;">${U.esc(R.summary)}</p>
          <div class="fall-score-chips">
            <span class="chip chip-high">高危 ${R.score.high}</span>
            <span class="chip chip-mid">中危 ${R.score.mid}</span>
            <span class="chip chip-low">低危 ${R.score.low}</span>
          </div></div></div>

        <div class="sarc-sub-h">危险因子清单</div>
        <div class="table-responsive"><table class="table table-sm fall-factor-table">
          <thead><tr><th>危险因子</th><th>等级</th><th>取值</th><th>处置建议</th></tr></thead>
          <tbody>${factorRows}</tbody></table></div>

        <div class="sarc-sub-h" style="margin-top:18px;">跌倒预防训练方案</div>
        ${fallPlanHTML(R)}

        <div class="sarc-sub-h" style="margin-top:18px;">居家环境改造与家属宣教</div>
        <ul class="fall-edu-list">
          <li>照明：走廊、卫生间夜间留低亮照明，开关触手可及。</li>
          <li>地面：去除门槛与松动地毯，浴室铺防滑垫并加装扶手/淋浴椅。</li>
          <li>起身：遵循「三步起床法」，避免体位性低血压致晕。</li>
          <li>用药：镇静/降压药睡前服用，定期复核种类与剂量。</li>
          <li>助行：按评估选配助行器并培训正确使用。</li>
        </ul>

        <div id="fall-ai-host" class="no-print" style="margin-top:18px;"></div>

        <div class="no-print mt-3" style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="fall-save">归档并纳入患者档案</button>
          <button class="btn btn-secondary" id="fall-print">打印报告</button>
          ${S.saved ? '<span class="fall-saved-tag">✓ 已归档</span>' : ''}
        </div>`;
    }

    function fallPlanHTML(R) {
      // 依据风险等级给出差异化处方（与 AI 方案推荐互补，AI 生成可覆盖）
      const plans = R.level === 'high'
        ? [
            { grp: '平衡训练', items: [
              { name: '扶椅单腿站立', sets: '3', reps: '每侧 10–20s', cues: '手扶稳固椅背，逐步减少支撑' },
              { name: '串联走（足跟接足尖）', sets: '3', reps: '走 6–8 步', cues: '沿直线，视线平视' },
              { name: '重心前后左右转移', sets: '3', reps: '每向 10 次', cues: '慢速可控，避免代偿' }
            ] },
            { grp: '下肢力量', items: [
              { name: '坐站训练（无负重）', sets: '3', reps: '8–12 次', cues: '坐姿起立不借手，控速 3 秒' },
              { name: '靠墙静蹲', sets: '3', reps: '10–20s', cues: '膝盖不超脚尖，角度安全' }
            ] },
            { grp: '步态与有氧', items: [
              { name: '扶杖室内步行', sets: '每日', reps: '10–15 min', cues: '助行器先出，患侧跟进' },
              { name: '节律踏步（节拍器）', sets: '3', reps: '2 min', cues: '稳定节奏，防拖曳' }
            ] }
          ]
        : R.level === 'mid'
          ? [
              { grp: '平衡训练', items: [
                { name: '并行单腿站立', sets: '3', reps: '每侧 15–30s', cues: '旁有扶手保护' },
                { name: '太极拳简化动作', sets: '每日', reps: '10 min', cues: '重心缓慢转移' }
              ] },
              { grp: '下肢力量', items: [
                { name: '坐站训练', sets: '3', reps: '10–12 次', cues: '控速起立' },
                { name: '踮脚提踵', sets: '3', reps: '10–15 次', cues: '扶墙防晃' }
              ] },
              { grp: '步态与有氧', items: [
                { name: '健步走', sets: '每日', reps: '20–30 min', cues: '匀速、穿防滑鞋' }
              ] }
            ]
          : [
              { grp: '维持性训练', items: [
                { name: '单腿站立', sets: '2', reps: '每侧 30s', cues: '旁有扶手' },
                { name: '每周有氧步行', sets: '5', reps: '30 min', cues: '保持活动量' }
              ] }
            ];
      return `<div class="fall-plan-grid">` + plans.map(g => `
        <div class="fall-plan-card">
          <div class="fall-plan-grp">${U.esc(g.grp)}</div>
          <table class="table table-sm"><thead><tr><th>动作</th><th>组</th><th>次/时长</th><th>要点</th></tr></thead>
          <tbody>${g.items.map(it => `<tr><td>${U.esc(it.name)}</td><td>${U.esc(it.sets)}</td><td>${U.esc(it.reps)}</td><td>${U.esc(it.cues)}</td></tr>`).join('')}</tbody></table>
        </div>`).join('') + `</div>`;
    }

    function buildFallAIContext(R, S) {
      const b = basePatient();
      return {
        module: 'fall-risk',
        patient: { id: b.id, name: b.name, gender: b.gender, age: b.age, height: b.height, weight: b.weight, bmi: b.bmi, phone: b.phone, chronic: b.chronic },
        assessment: {
          level: R.level,
          score: R.score,
          factors: R.factors.map(f => ({ name: f.name, severity: f.severity, value: f.value })),
          summary: R.summary,
          rawInput: { history: S.history, balance: S.balance, mobility: S.mobility, sensory: S.sensory }
        },
        note: '老年人跌倒风险评估报告（基于平衡/步态/肌力/用药/环境多因子）'
      };
    }

    function wireStep5() {
      const saveBtn = U.qs('#fall-save', bodyEl);
      const printBtn = U.qs('#fall-print', bodyEl);
      const aiHost = U.qs('#fall-ai-host', bodyEl);
      const R = S.result || compute();

      if (saveBtn) saveBtn.onclick = () => {
        const rec = {
          id: S.id, no: S.no || D().nextNo(), patientId: base.id, patientName: base.name,
          gender: base.gender, age: base.age, height: base.height, weight: base.weight, bmi: base.bmi,
          phone: base.phone, chronic: base.chronic,
          assessDate: S.assessDate,
          doctor: (AppState.currentUser && (AppState.currentUser.displayName || AppState.currentUser.username)) || '',
          input: { history: S.history, balance: S.balance, mobility: S.mobility, sensory: S.sensory },
          result: R
        };
        D().saveRecord(rec);
        S.no = rec.no; S.saved = true; saveDraft();
        U.toast(`跌倒评估已归档至患者档案（${rec.no}）`, 'success');
        render();
      };
      if (printBtn) printBtn.onclick = () => window.print();

      // AI 接入：报告解读 + 方案推荐（三方向统一，module=fall-risk）
      if (aiHost && window.AIReason && AIReason.aiControls) {
        try {
          const ctx = buildFallAIContext(R, S);
          AIReason.aiControls(aiHost, ctx, {
            systemEl: null,
            planRenderer: fallPlanSummaryHTML,
            onAdopt: function (plan, r) {
              const p = curPatient();
              if (!p) { U.toast('请先选择患者', 'warning'); return; }
              p.data = p.data || {};
              p.data.fallAIPlan = Object.assign({}, plan, { generatedBy: 'ai', generatedAt: new Date().toISOString(), aiProvider: (r && r.provider) || 'AI' });
              if (window.persistPatient) window.persistPatient();
              U.toast('已将 AI 跌倒预防方案存入患者档案', 'success');
            }
          });
        } catch (e) { console.warn('[fallrisk] AI 控件注入失败', e); }
      }
    }

    // 供 AI 方案推荐渲染（module=fall-risk 专有 schema）
    function fallPlanSummaryHTML(plan) {
      if (!plan) return '<p>AI 方案渲染失败</p>';
      const sec = (title, arr, cols) => {
        if (!Array.isArray(arr) || !arr.length) return '';
        const heads = cols.slice(1); // 去掉首个占位空列
        return `<div class="ai-plan-sec"><div class="ai-plan-sec-t">${U.esc(title)}</div>` +
          `<table class="table table-sm"><thead><tr>${heads.map(c => `<th>${U.esc(c)}</th>`).join('')}</tr></thead><tbody>` +
          arr.map(row => {
            const keys = Object.keys(row);
            return `<tr>${heads.map((_, i) => {
              const v = (i < keys.length) ? row[keys[i]] : '';
              return `<td>${U.esc(String(v != null ? v : ''))}</td>`;
            }).join('')}</tr>`;
          }).join('') +
          '</tbody></table></div>';
      };
      const safety = plan.safety || {};
      return `
        ${safety.contraindications && safety.contraindications.length ? `<div class="ai-plan-gate">⚠️ 禁忌：${U.esc(safety.contraindications.join('、'))}</div>` : ''}
        ${(safety.cautions && safety.cautions.length) ? `<div class="ai-plan-caution">注意：${U.esc(safety.cautions.join('、'))}</div>` : ''}
        ${sec('平衡训练', plan.balance, ['', '动作', '组', '次/时长', '要点'])}
        ${sec('下肢力量', plan.lowerLimb, ['', '动作', '组', '次', '要点'])}
        ${sec('步态与有氧', plan.gait, ['', '动作', '组', '时长', '要点'])}
        ${(Array.isArray(plan.education) && plan.education.length) ? `<div class="ai-plan-sec"><div class="ai-plan-sec-t">健康教育</div><ul>${plan.education.map(e => `<li>${U.esc(typeof e === 'string' ? e : (e.point || e.text || ''))}</li>`).join('')}</ul></div>` : ''}`;
    }

    /* ---------- 步骤流转 ---------- */
    function canNext() {
      if (stepValidator) {
        const errs = stepValidator.errors();
        if (errs.length) { U.toast(`有 ${errs.length} 项数据超出合理范围：${errs[0].msg}`, 'error'); return false; }
      }
      return true;
    }
    prevBtn.onclick = () => { if (S.step > 1) { S.step--; render(); } };
    nextBtn.onclick = () => {
      if (S.step === STEPS.length) {
        if (!S.saved) { U.toast('请先点击「归档并纳入患者档案」保存本次评估', 'warning'); return; }
        D().clearDraft();
        location.hash = '#/patient';
        return;
      }
      if (!canNext()) return;
      S.step++;
      S.maxStep = Math.max(S.maxStep || 1, S.step);
      render();
    };

    U.qs('#btn-demo-fall', wrap).onclick = () => {
      S.history = { fallsPast1y: '2', fracture: 'yes', fearFall: 'yes', fearFallScore: '21', useAid: 'yes', aidType: '四脚拐' };
      S.balance = { singleLegSec: '3', singleLegCannot: false, romberg: 'unable', weightShift: 'poor', tandem: 'unable' };
      S.mobility = { gaitSpeed: '0.62', tugSec: '15.4', chair30: '6', gaitAbnormal: '拖曳步态' };
      S.sensory = { vision: 'impaired', hearing: 'impaired', psychotropic: 'yes', orthostatic: 'yes', cognition: 'normal', homeHazards: 'yes' };
      saveDraft(); render();
      U.toast('已填充典型「高跌倒风险」演示数据', 'success');
    };

    render();
    return wrap;
  };

  /* 暴露给报告中心方向筛选使用 */
  window.FallDB = D;

  /* 安全网：从守卫页手动加载当前患者并重新进入跌倒评估（已融入肌少症-跌倒风险评估 → 步骤 9） */
  window.loadFallPatientAndRoute = async function () {
    const pid = AppState && AppState.currentPatientId;
    if (!pid) { U.toast('未选中患者，请先登记', 'warning'); location.hash = '#/patient'; return; }
    if (typeof loadPatientContext !== 'function') { U.toast('上下文加载函数不可用', 'error'); return; }
    try {
      await loadPatientContext(pid);
      if (AppState.patient && AppState.patient.id) {
        location.hash = '#/sarcopenia-assess';
      } else {
        U.toast('加载后仍缺少患者信息，请重新登记', 'warning');
        location.hash = '#/patient';
      }
    } catch (e) {
      console.error('[fallrisk] 加载患者上下文失败', e);
      U.toast('加载患者上下文失败：' + (e.message || e), 'error');
    }
  };
})();
