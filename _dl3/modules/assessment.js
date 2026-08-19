/**
 * 综合评估模块（体重管理）：体格测量 / 体成分 / 能量代谢 / 运动风险 / 生活习惯问卷 + 干预指导
 * 已接入评估驾驶舱（AssessCockpit）：左路径隧道 / 中人体图 + 部位锚点 / 右实时快照 + 六维风险雷达
 */
(function () {
  const PARQ = [
    '医生是否曾告知您患有心脏疾病，且只能进行医生推荐的体力活动？',
    '您在进行体力活动时是否感到胸部疼痛？',
    '过去一个月内，您在没有进行体力活动时是否也出现过胸痛？',
    '您是否曾因头晕失去平衡，或曾失去意识？',
    '您是否有骨或关节问题，可能因体力活动改变而加重？',
    '医生目前是否因血压或心脏问题给您开具药物？',
    '您是否知道任何其他不宜进行体力活动的原因？'
  ];

  /* 风险等级映射：Calc 的 success/warning/danger、low/medium/high → 雷达 low/mid/high */
  function lv(k) {
    if (!k) return 'na';
    if (k === 'success' || k === 'low') return 'low';
    if (k === 'warning' || k === 'medium') return 'mid';
    if (k === 'danger' || k === 'high') return 'high';
    return 'na';
  }
  function lvm(k) {
    if (!k) return 'ok';
    if (k === 'success' || k === 'low') return 'ok';
    if (k === 'warning' || k === 'medium') return 'warn';
    if (k === 'danger' || k === 'high') return 'bad';
    return 'ok';
  }

  /* 从状态 S 计算所有指标（不写 DOM），供保存 / 步骤 3 / 右栏雷达共用 */
  function recompute(S) {
    const p = AppState.patient;
    const d = S.d || {};
    const gender = p.gender, age = p.age;
    const h = U.num(d.height), w = U.num(d.weight);

    const bmi = Calc.bmi(w, h);
    const bmiG = Calc.bmiGrade(bmi);
    const whr = Calc.whr(U.num(d.waist), U.num(d.hip));
    const whrR = Calc.whrRisk(whr, gender);
    const waistR = Calc.waistRisk(U.num(d.waist), gender);
    const bp = Calc.bpGrade(U.num(d.sbp), U.num(d.dbp));

    const bf = U.num(d.bodyFat);
    const bfG = Calc.bodyFatGrade(bf, gender);
    const mm = U.num(d.muscleMass), vf = U.num(d.visceralFat);

    const coef = (CONST.ACTIVITY_LEVELS.find(l => l.key === d.activityLevel) || {}).coef;
    const stage = CONST.WEIGHT_STAGES.find(s => s.key === d.weightStage) || CONST.WEIGHT_STAGES[1];
    const formulaBMR = Calc.bmr(gender, w, h, age);
    const bmr = U.num(d.measuredBMR) || formulaBMR;
    const tdee = Calc.tdee(bmr, coef);
    const tc = Calc.targetCalories(tdee, stage.deficit, gender, bmr);
    const weekly = tc ? Calc.weeklyLoss(tc.actualDeficit) : null;
    const macros = (bmr && tdee && tc) ? Calc.macros(w, tc.target) : null;

    const risk = Calc.exerciseRisk(d, p);
    return { d, bmi, bmiG, whr, whrR, waistR, bp, bf, bfG, mm, vf, bmr, formulaBMR, tdee, tc, weekly, macros, risk };
  }

  /* 步骤 3：风险与处方评级（返回结果区 HTML，从 S 计算） */
  function resultHTML(S) {
    const p = AppState.patient;
    const gender = p.gender;
    const R = recompute(S);
    const d = R.d;
    let h = '';

    /* 体格 */
    if (R.bmi || R.whr || R.bp) {
      h += '<div class="grid-4">';
      if (R.bmi) h += metricCard('BMI 体质指数', R.bmi, 'kg/m²', R.bmiG.label, R.bmiG.level, R.bmiG.advice);
      if (R.whr) h += metricCard('腰臀比 WHR', R.whr, '', R.whrR.label, R.whrR.level, (gender === 'female' ? '女性' : '男性') + '参考切点 ' + (gender === 'female' ? '0.85' : '0.90'));
      if (R.waistR) h += metricCard('腰围评价', U.num(d.waist), 'cm', R.waistR.label, R.waistR.level, '中心性肥胖切点 ' + R.waistR.cut + ' cm');
      if (R.bp) h += metricCard('血压评价', d.sbp + '/' + d.dbp, 'mmHg', R.bp.label, R.bp.level, '安静休息 5 分钟后测量');
      h += '</div>';
      if (p.targetWeight && U.num(d.weight)) {
        const w = U.num(d.weight), tw = U.num(p.targetWeight);
        h += '<div class="alert alert-info mt-2"><div><strong>减重目标测算</strong><p style="margin:6px 0 0;font-size:13.5px;line-height:1.7;">当前体重 ' + w + ' kg，目标体重 ' + tw + ' kg，需减重 <strong>' + U.round(w - tw, 1) + ' kg</strong>（占当前体重 ' + U.round((w - tw) / w * 100, 1) + '%）。临床推荐首阶段目标为减重 5%-10%（即 ' + U.round(w * 0.05, 1) + '-' + U.round(w * 0.1, 1) + ' kg）。</p></div></div>';
      }
    }

    /* 体成分 */
    if (R.bf || R.mm || R.vf) {
      h += '<div class="grid-4" style="margin-top:14px;">';
      if (R.bf) h += metricCard('体脂率', R.bf, '%', R.bfG.label, R.bfG.level, (gender === 'female' ? '女性' : '男性') + '理想范围 ' + (gender === 'female' ? '18-28' : '10-20') + '%');
      if (R.mm) h += metricCard('骨骼肌量', R.mm, 'kg', U.num(d.weight) ? '占体重 ' + U.round(R.mm / U.num(d.weight) * 100, 1) + '%' : '—', 'info', '减重期核心保护目标，流失应 <25% 总减重量');
      if (R.vf) h += metricCard('内脏脂肪等级', R.vf, '级', R.vf > 14 ? '显著偏高' : (R.vf > 9 ? '偏高' : '正常'), R.vf > 14 ? 'danger' : (R.vf > 9 ? 'warning' : 'success'), '标准范围 1-9 级');
      if (d.inbodyScore) h += metricCard('InBody 身体评分', d.inbodyScore, '分', U.num(d.inbodyScore) >= 80 ? '良好' : '待提升', U.num(d.inbodyScore) >= 80 ? 'success' : 'warning', '满分 100 分');
      h += '</div>';
    }

    /* 能量代谢 */
    if (R.bmr && R.tdee && R.tc) {
      const m = R.macros;
      h += '<div style="margin-top:14px;padding:16px;background:var(--bg-secondary);border-radius:12px;">' +
        '<div style="font-weight:600;margin-bottom:12px;font-size:14px;">宏量营养素目标分配（基于 ' + R.tc.target + ' kcal）</div>' +
        U.barCompare([
          { label: '蛋白质 ' + m.proteinG + 'g（1.2g/kg 体重）', value: m.proteinPct, display: m.proteinPct + '%', color: '#f26522' },
          { label: '脂肪 ' + m.fatG + 'g（总热量 25%）', value: m.fatPct, display: m.fatPct + '%', color: '#f59e0b' },
          { label: '碳水化合物 ' + m.carbG + 'g（填充剩余）', value: m.carbPct, display: m.carbPct + '%', color: '#22c55e' }
        ]) + '</div>';
    } else {
      h += '<div style="color:var(--text-muted);font-size:13.5px;margin-top:14px;">请先在步骤 1 填写身高、体重与静息心率，系统将自动完成代谢计算</div>';
    }

    /* 运动风险 */
    const lvMap = { low: 'success', medium: 'warning', high: 'danger' };
    h += '<div class="alert alert-' + lvMap[R.risk.level] + '" style="margin-top:14px;"><div style="width:100%;">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><strong style="font-size:15px;">整体运动风险：</strong>' +
      '<span class="badge badge-' + lvMap[R.risk.level] + '" style="font-size:13px;">' + R.risk.label + '（风险积分 ' + R.risk.score + '）</span></div>' +
      (R.risk.factors.length ? '<div style="margin-top:10px;font-size:13.5px;"><strong>识别到的风险因素：</strong>' + R.risk.factors.map(f => '<span class="badge badge-warning" style="margin:3px 4px 0 0;">' + U.esc(f) + '</span>').join('') + '</div>' : '<div style="margin-top:8px;font-size:13.5px;">未识别到显著运动风险因素。</div>') +
      '<p style="margin:10px 0 0;font-size:13.5px;line-height:1.75;"><strong>运动处方安全建议：</strong>' + R.risk.advice + '</p></div></div>';

    /* Karvonen */
    const hr = Calc.karvonen(age, U.num(d.restHR), 0.4, 0.75);
    if (hr) {
      h += '<div class="mt-2" style="padding:14px 16px;background:var(--bg-secondary);border-radius:12px;font-size:13.5px;line-height:1.8;">' +
        '<strong>Karvonen 目标心率区间</strong>（最大心率 ' + hr.hrMax + ' bpm，储备心率 HRR ' + hr.hrr + ' bpm）：' +
        '适应期 <strong>' + Calc.karvonen(age, U.num(d.restHR), 0.4, 0.5).low + '-' + Calc.karvonen(age, U.num(d.restHR), 0.4, 0.5).high + '</strong> bpm · ' +
        '强化期 <strong>' + Calc.karvonen(age, U.num(d.restHR), 0.5, 0.65).low + '-' + Calc.karvonen(age, U.num(d.restHR), 0.5, 0.65).high + '</strong> bpm · ' +
        '巩固期 <strong>' + Calc.karvonen(age, U.num(d.restHR), 0.6, 0.75).low + '-' + Calc.karvonen(age, U.num(d.restHR), 0.6, 0.75).high + '</strong> bpm</div>';
    }
    return h;
  }

  /* 步骤 1：体成分录入表单（原四段录入，迁入状态 S.d） */
  function entryHTML(S) {
    const d = S.d || {};
    const p = AppState.patient;
    const recActivity = CONST.WORK_INTENSITY_MAP[p.workIntensity] || 'sedentary';
    const v = (k) => (d[k] != null && d[k] !== '' ? 'value="' + U.esc(d[k]) + '" ' : '');
    return '<form id="assess-form">' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">📏</span>一、体格测量</h3></div><div class="card-body"><div class="form-row">' +
      '<div class="form-group"><label>身高 cm <span class="required">*</span></label><input type="number" name="height" step="0.1" class="calc-trigger" ' + v('height') + 'required></div>' +
      '<div class="form-group"><label>体重 kg <span class="required">*</span></label><input type="number" name="weight" step="0.1" class="calc-trigger" ' + v('weight') + 'required></div>' +
      '<div class="form-group"><label>静息心率 bpm <span class="required">*</span></label><input type="number" name="restHR" class="calc-trigger" ' + v('restHR') + 'required placeholder="安静状态测量"></div>' +
      '<div class="form-group"><label>腰围 cm</label><input type="number" name="waist" step="0.1" class="calc-trigger" ' + v('waist') + '></div>' +
      '<div class="form-group"><label>臀围 cm</label><input type="number" name="hip" step="0.1" class="calc-trigger" ' + v('hip') + '></div>' +
      '<div class="form-group"><label>颈围 cm</label><input type="number" name="neck" step="0.1" class="calc-trigger" ' + v('neck') + '></div>' +
      '<div class="form-group"><label>收缩压 mmHg</label><input type="number" name="sbp" class="calc-trigger" ' + v('sbp') + '></div>' +
      '<div class="form-group"><label>舒张压 mmHg</label><input type="number" name="dbp" class="calc-trigger" ' + v('dbp') + '></div>' +
      '</div></div></div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧬</span>二、体成分数据（InBody 等设备）</h3></div><div class="card-body"><div class="form-row">' +
      '<div class="form-group"><label>体脂率 %</label><input type="number" name="bodyFat" step="0.1" class="calc-trigger" ' + v('bodyFat') + '></div>' +
      '<div class="form-group"><label>骨骼肌量 kg</label><input type="number" name="muscleMass" step="0.1" class="calc-trigger" ' + v('muscleMass') + '></div>' +
      '<div class="form-group"><label>体脂肪重量 kg</label><input type="number" name="fatMass" step="0.1" class="calc-trigger" ' + v('fatMass') + '></div>' +
      '<div class="form-group"><label>内脏脂肪等级</label><input type="number" name="visceralFat" class="calc-trigger" ' + v('visceralFat') + '></div>' +
      '<div class="form-group"><label>实测基础代谢 kcal</label><input type="number" name="measuredBMR" class="calc-trigger" ' + v('measuredBMR') + ' placeholder="设备实测值，留空则用公式"></div>' +
      '<div class="form-group"><label>InBody 身体评分</label><input type="number" name="inbodyScore" class="calc-trigger" ' + v('inbodyScore') + '></div>' +
      '</div></div></div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🔥</span>三、能量代谢自动计算</h3></div><div class="card-body"><div class="form-row">' +
      '<div class="form-group"><label>活动水平 <span class="required">*</span></label><select name="activityLevel" class="calc-trigger" required>' +
      CONST.ACTIVITY_LEVELS.map(l => '<option value="' + l.key + '" ' + (l.key === (d.activityLevel || recActivity) ? 'selected' : '') + '>' + l.label + '（系数 ' + l.coef + '）</option>').join('') + '</select>' +
      '<small style="color:var(--text-muted);font-size:12px;">根据工作体力等级推荐：' + ((CONST.ACTIVITY_LEVELS.find(l => l.key === recActivity) || {}).label || '') + '</small></div>' +
      '<div class="form-group"><label>减重阶段 <span class="required">*</span></label><select name="weightStage" class="calc-trigger" required>' +
      CONST.WEIGHT_STAGES.map(s => '<option value="' + s.key + '" ' + (s.key === (d.weightStage || 'standard') ? 'selected' : '') + '>' + s.label + ' · 缺口 ' + s.deficit + ' kcal</option>').join('') + '</select></div>' +
      '</div></div></div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⚠️</span>四、运动风险自动判定</h3></div><div class="card-body">' +
      '<label style="font-weight:600;font-size:14px;margin-bottom:10px;display:block;">PAR-Q 体力活动准备问卷</label>' +
      '<div class="table-wrap"><table><thead><tr><th style="width:70%;">问题</th><th style="width:15%;">是</th><th style="width:15%;">否</th></tr></thead><tbody>' +
      PARQ.map((q, i) => '<tr><td style="font-size:13.5px;line-height:1.6;">' + (i + 1) + '. ' + q + '</td>' +
        '<td><label class="radio-item" style="border:none;padding:4px;"><input type="radio" name="parq' + i + '" value="yes" class="calc-trigger" ' + ((d.parq && d.parq[i] === 'yes') ? 'checked' : '') + '></label></td>' +
        '<td><label class="radio-item" style="border:none;padding:4px;"><input type="radio" name="parq' + i + '" value="no" class="calc-trigger" ' + ((!d.parq || d.parq[i] !== 'yes') ? 'checked' : '') + '></label></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="form-row mt-3"><div class="form-group"><label>心血管风险等级</label><select name="cvRisk" class="calc-trigger">' +
      '<option value="low" ' + (d.cvRisk === 'low' ? 'selected' : '') + '>低（无危险因素）</option>' +
      '<option value="medium" ' + (d.cvRisk === 'medium' ? 'selected' : '') + '>中（1-2 项危险因素）</option>' +
      '<option value="high" ' + (d.cvRisk === 'high' ? 'selected' : '') + '>高（≥3 项或已确诊心血管疾病）</option></select></div>' +
      '<div class="form-group full-width"><label>运动禁忌项</label><input type="text" name="contraindication" class="calc-trigger" ' + v('contraindication') + ' placeholder="如：不稳定型心绞痛、急性期损伤；无请留空"></div></div>' +
      '</div></div>' +
      '</form>';
  }

  /* 步骤 1 摘要视图：显示已录入的关键数据 + 全屏填写按钮 */
  function entrySummaryHTML(S) {
    const d = S.d || {};
    const has = (k) => (d[k] != null && d[k] !== '');
    const R = (() => { try { return recompute(S); } catch (e) { return {}; } })();
    const ynTxt = (v) => v === 'yes' ? '是' : '否';
    const parqYes = (d.parq || []).filter(x => x === 'yes').length;
    const card = (label, val, unit, ok) => '<div class="entry-sum-card' + (ok ? ' ok' : '') + '"><div class="lbl">' + U.esc(label) + '</div><div class="val">' + U.esc(val == null ? '—' : val) + (unit ? ' <i>' + U.esc(unit) + '</i>' : '') + '</div></div>';
    return '<div class="entry-summary-wrap">' +
      '<div class="entry-sum-tip">点击右下角 <b>📝 填入/编辑数据</b> 按钮，弹出全屏表单填入体格、体成分、代谢、PQ-风险等 25+ 项数据；保存后自动返回并刷新右侧风险雷达与六维评级。</div>' +
      '<div class="entry-sum-section"><h4>一、体格测量</h4><div class="entry-sum-grid">' +
        card('身高', has('height') ? d.height : null, 'cm', has('height')) +
        card('体重', has('weight') ? d.weight : null, 'kg', has('weight')) +
        card('BMI', R.bmi || null, 'kg/m²', !!R.bmi) +
        card('静息心率', has('restHR') ? d.restHR : null, 'bpm', has('restHR')) +
        card('腰围', has('waist') ? d.waist : null, 'cm', has('waist')) +
        card('臀围', has('hip') ? d.hip : null, 'cm', has('hip')) +
        card('颈围', has('neck') ? d.neck : null, 'cm', has('neck')) +
        card('血压', (has('sbp') && has('dbp')) ? (d.sbp + '/' + d.dbp) : null, 'mmHg', has('sbp')) +
      '</div></div>' +
      '<div class="entry-sum-section"><h4>二、体成分</h4><div class="entry-sum-grid">' +
        card('体脂率', has('bodyFat') ? d.bodyFat : null, '%', has('bodyFat')) +
        card('骨骼肌量', has('muscleMass') ? d.muscleMass : null, 'kg', has('muscleMass')) +
        card('脂肪量', has('fatMass') ? d.fatMass : null, 'kg', has('fatMass')) +
        card('内脏脂肪', has('visceralFat') ? d.visceralFat : null, '级', has('visceralFat')) +
        card('BMR', has('measuredBMR') ? d.measuredBMR : R.formulaBMR, 'kcal', has('measuredBMR') || !!R.formulaBMR) +
        card('InBody 评分', has('inbodyScore') ? d.inbodyScore : null, '分', has('inbodyScore')) +
      '</div></div>' +
      '<div class="entry-sum-section"><h4>三、能量代谢 / 四、PQ-风险</h4><div class="entry-sum-grid">' +
        card('活动水平', d.activityLevel, '', !!d.activityLevel) +
        card('减重阶段', d.weightStage, '', !!d.weightStage) +
        card('心血管风险', d.cvRisk, '', !!d.cvRisk) +
        card('PAR-Q 是项数', parqYes, '/7', false) +
        card('运动禁忌', d.contraindication || '无', '', true) +
      '</div></div>' +
      '<div class="entry-sum-actions"><button class="btn btn-primary btn-lg" id="btn-open-entry-drawer">📝 填入 / 编辑数据（全屏）</button></div>' +
    '</div>';
  }

  /* 打开步骤 1 全屏填写抽屉 */
  function openEntryDrawer(S) {
    const formHTML = entryHTML(S);
    const modalRef = U.modal({
      title: '步骤 1 · 体成分录入 — 25+ 项数据填写',
      body: formHTML,
      width: '100vw',
      cls: 'ai-modal-full ac-step-fullscreen',
      footer:
        '<div class="ac-hint">填写完成后点「保存并关闭」自动返回主页面，右侧风险雷达 / 六维评级实时刷新</div>' +
        '<button class="btn btn-primary" id="entry-save-close">💾 保存并关闭</button>'
    });
    const modalBd = U.qs('.modal-body', modalRef.overlay);
    const form = U.qs('#assess-form', modalBd);
    if (form) {
      U.bindChoiceStyle(form);
      form.onsubmit = (e) => { e.preventDefault(); };
      const sync = () => {
        const fd = U.formData(form);
        fd.parq = PARQ.map((_, i) => fd['parq' + i] || 'no');
        S.d = fd;
        try {
          if (window.SmartForm) {
            SmartForm.collapsibleCards(form);
            SmartForm.bindRanges(form, {
              '[name="height"]': { min: 100, max: 230, label: '身高', unit: 'cm', required: true },
              '[name="weight"]': { min: 20, max: 300, label: '体重', unit: 'kg', required: true },
              '[name="restHR"]': { min: 30, max: 160, label: '静息心率', unit: 'bpm', required: true, hint: '安静休息 5 分钟后测量' },
              '[name="waist"]': { min: 40, max: 200, label: '腰围', unit: 'cm', soft: true },
              '[name="hip"]': { min: 50, max: 200, label: '臀围', unit: 'cm', soft: true },
              '[name="neck"]': { min: 20, max: 70, label: '颈围', unit: 'cm', soft: true },
              '[name="sbp"]': { min: 60, max: 260, label: '收缩压', unit: 'mmHg', soft: true },
              '[name="dbp"]': { min: 30, max: 180, label: '舒张压', unit: 'mmHg', soft: true },
              '[name="bodyFat"]': { min: 3, max: 70, label: '体脂率', unit: '%', soft: true },
              '[name="muscleMass"]': { min: 5, max: 80, label: '骨骼肌量', unit: 'kg', soft: true },
              '[name="fatMass"]': { min: 1, max: 150, label: '体脂肪重量', unit: 'kg', soft: true },
              '[name="visceralFat"]': { min: 1, max: 30, label: '内脏脂肪等级', unit: '级', soft: true },
              '[name="measuredBMR"]': { min: 600, max: 4000, label: '实测基础代谢', unit: 'kcal', soft: true },
              '[name="inbodyScore"]': { min: 0, max: 100, label: 'InBody 评分', unit: '分', soft: true }
            });
          }
        } catch (e) { /* 忽略 SmartForm 错误，不影响数据录入 */ }
      };
      form.addEventListener('input', (e) => { if (e.target.classList.contains('calc-trigger')) sync(); });
      form.addEventListener('change', (e) => { if (e.target.classList.contains('calc-trigger')) sync(); });
      // 首次打开立即同步一次
      try { sync(); } catch (e) {}
    }
    const saveBtn = U.qs('#entry-save-close', modalRef.overlay);
    if (saveBtn) saveBtn.onclick = () => { modalRef.close(); };
  }

  Pages.assessment = function () {
    if (!AppState.patient || !AppState.patient.name) {
      return `<div class="alert alert-warning"><div><strong>请先完成患者首诊登记</strong>
        <p style="margin:6px 0 0;">综合评估需要患者的性别、年龄等基础信息作为计算依据。</p>
        <a href="#/patient" class="btn btn-primary btn-sm mt-2">前往首诊登记 →</a></div></div>`;
    }
    const p = AppState.patient;

    const S = {
      step: 1,
      id: 'wt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: null, patientId: p.id, assessDate: U.today(),
      d: Object.assign({}, AppState.assessment || {}),
      result: null, saved: false
    };
    if (!S.d.parq) S.d.parq = PARQ.map(() => 'no');

    /* 人体图（body-front.png）锚点位置（按用户要求严格放置 + 标签全部置于身体外侧不遮挡） */
    const REGIONS = [
      /* 颈围：精确放在脖子上（头下方两侧胸锁关节区域） */
      { id: 'neck', label: '颈围', icon: '📏', x: 50, y: 16, lx: 78, risk: 'na', summary: '颈部脂肪堆积与睡眠呼吸风险', render: () => wtRegionNote('颈围', '测量甲状软骨下方最细处，反映上半身脂肪。男性 ≥38cm、女性 ≥34cm 提示睡眠呼吸暂停风险升高。') },
      /* 上臂：放在左侧大臂中段（三角肌下方） */
      { id: 'arm', label: '上臂', icon: '💪', x: 29, y: 32, lx: 8, risk: 'na', summary: '上臂围 / 肱三头肌皮褶', render: () => wtRegionNote('上臂围 / 肱三头肌皮褶', '反映四肢肌肉与皮下脂肪，是肌少症与营养不良筛查指标。') },
      /* 腰腹：放在左侧腰部（脐上方 2cm 旁） */
      { id: 'waist', label: '腰腹', icon: '🔥', x: 38, y: 46, lx: 8, risk: 'mid', summary: '中心性肥胖核心区', render: () => wtRegionNote('腰围', '中心性肥胖核心指标。男性 ≥90cm、女性 ≥85cm 为切点。') },
      /* 臀骨盆：放在右侧屁股（髂前上棘下方臀大肌） */
      { id: 'pelvis', label: '臀骨盆', icon: '🍑', x: 60, y: 60, lx: 78, risk: 'na', summary: '臀围与脂肪分布', render: () => wtRegionNote('臀围', '与腰围共同计算腰臀比 WHR。') },
      /* 左右大腿：放在右侧大腿中段 */
      { id: 'thigh', label: '左右大腿', icon: '🦵', x: 60, y: 76, lx: 78, risk: 'na', summary: '下肢肌量 / 皮褶', render: () => wtRegionNote('大腿围 / 皮褶', '反映下肢肌量与皮下脂肪。') }
    ];

    const steps = [
      { id: 1, title: '体成分录入', icon: '🧮', subtitle: '点击右侧按钮填入体格/体成分/代谢/风险', kind: 'input', hint: '步骤 1 / 4 · 录入后实时计算', render: (S) => entrySummaryHTML(S) },
      { id: 2, title: '部位定位', icon: '📍', subtitle: '点击身体锚点查看测量意义', kind: 'input', atlas: REGIONS, hint: '步骤 2 / 4 · 5 个测量部位', render: () => '<div class="ac-tip">点击人体图上的锚点（带文字标识）或右侧区域，查看各部位的测量意义与临床切点；具体数值请回到步骤 1 录入。</div>' },
      { id: 3, title: '风险与处方评级', icon: '⚖️', subtitle: '自动评级 + 处方', kind: 'compute', hint: '步骤 3 / 4 · 实时计算', render: (S) => resultHTML(S) },
      { id: 4, title: '方案随访', icon: '📄', subtitle: '归档 + 生成方案 + AI 解读', kind: 'report', hint: '步骤 4 / 4 · 归档', render: (S) => planHTML(S) }
    ];

    // 第一排直接由 AssessCockpit 承担：左「评估路径」+ 右「具体评估步骤视图」
    // （去掉患者选择行，避免占位；患者档案切换统一在台账页完成）
    const wrap = U.el('<div class="assessment-wrap"></div>');
    const cockpit = AssessCockpit({
      unit: 'weight', accent: '#0ea5a4', unitName: '体重管理',
      layout: 'rows',
      atlas: { mode: 'front', frontImg: 'assets/body-front.png', backImg: 'assets/body-back.png' },
      state: S, steps: steps, completeLabel: '完成并归档 →',
      snapshot: {
        metrics: (S) => {
          const R = recompute(S), d = R.d;
          return [
            { k: 'BMI', v: R.bmi || '—', unit: 'kg/m²', level: lvm(R.bmiG && R.bmiG.level), label: R.bmiG ? R.bmiG.label : '' },
            { k: '腰围', v: U.num(d.waist) || '—', unit: 'cm', level: lvm(R.waistR && R.waistR.level), label: R.waistR ? R.waistR.label : '' },
            { k: '体脂率', v: U.num(d.bodyFat) || '—', unit: '%', level: lvm(R.bfG && R.bfG.level), label: R.bfG ? R.bfG.label : '' },
            { k: '内脏脂肪', v: U.num(d.visceralFat) || '—', unit: '级', level: U.num(d.visceralFat) ? (U.num(d.visceralFat) > 14 ? 'bad' : (U.num(d.visceralFat) > 9 ? 'warn' : 'ok')) : 'ok', label: U.num(d.visceralFat) ? (U.num(d.visceralFat) > 14 ? '偏高' : (U.num(d.visceralFat) > 9 ? '偏高' : '正常')) : '' },
            { k: '骨骼肌量', v: U.num(d.muscleMass) || '—', unit: 'kg', level: 'ok', label: '' },
            { k: 'BMR', v: (U.num(d.measuredBMR) || (R.formulaBMR || '—')), unit: 'kcal', level: 'ok', label: U.num(d.measuredBMR) ? '实测' : '公式' }
          ];
        },
        riskCube: (S) => {
          const R = recompute(S), d = R.d;
          return {
            overall: R.risk.level === 'high' ? 'high' : R.risk.level === 'medium' ? 'mid' : 'low',
            dims: [
              { name: 'BMI', label: R.bmiG ? R.bmiG.label : '—', level: lv(R.bmiG && R.bmiG.level) },
              { name: '腰围', label: R.waistR ? R.waistR.label : '—', level: lv(R.waistR && R.waistR.level) },
              { name: '体脂率', label: R.bfG ? R.bfG.label : '—', level: lv(R.bfG && R.bfG.level) },
              { name: '内脏脂肪', label: U.num(d.visceralFat) ? (U.num(d.visceralFat) > 14 ? '显著偏高' : (U.num(d.visceralFat) > 9 ? '偏高' : '正常')) : '—', level: U.num(d.visceralFat) ? (U.num(d.visceralFat) > 14 ? 'high' : (U.num(d.visceralFat) > 9 ? 'mid' : 'low')) : 'na' },
              { name: '骨骼肌量', label: U.num(d.muscleMass) ? '已录入' : '未录入', level: U.num(d.muscleMass) ? 'low' : 'na' },
              { name: '基础代谢', label: U.num(d.measuredBMR) || R.formulaBMR ? '已算' : '未算', level: 'low' }
            ]
          };
        },
        footer: (S) => '多维风险雷达：BMI / 腰围 / 体脂率 / 内脏脂肪 / 骨骼肌量 / 基础代谢。颜色 + 文字双重编码（绿·观察 / 橙·干预 / 红·紧急）。'
      },
      onAfterRender: (S, step, bd) => {
        if (step.id === 1) {
          // 步骤 1 已改为摘要视图 + 全屏抽屉：绑定「填入/编辑数据」按钮
          const openBtn = U.qs('#btn-open-entry-drawer', bd);
          if (openBtn) openBtn.onclick = () => openEntryDrawer(S);
        }
        if (step.id === 2) {
          // 步骤 2 的人体图已在 cockpit 内部渲染，ac-anchor 事件已绑定
          // 这里可补充额外的区域卡片事件
        }
        if (step.id === 4) {
          const b1 = U.qs('#btn-save-assess', bd); if (b1) b1.onclick = () => save(S, false);
          const b2 = U.qs('#btn-to-plan', bd); if (b2) b2.onclick = () => save(S, true);
          const ba = U.qs('#btn-ai-interpret', bd);
          if (ba) {
            if (!(window.AIReason && window.AIReason.aiEnabled && window.AIReason.aiEnabled())) ba.style.display = 'none';
            ba.onclick = () => aiInterpret(S, bd);
          }
        }
      },
      onComplete: (S) => { save(S, true); }
    });
    wrap.appendChild(cockpit);

    // 体重评估页：路径卡片底部"本期评估状态"——填满原左侧路径卡底部空白，
    // 让左/右两卡视觉等高，并即时反馈当前步骤、进度与图例。
    (function injectPathStats() {
      const acRoot = wrap.querySelector('.ac.ac-rows');
      const pathCard = acRoot && acRoot.querySelector('.ac-row2 > .ac-path > .ac-path-card');
      if (!pathCard || pathCard.querySelector('.ac-path-stats')) return;
      const stats = document.createElement('div');
      stats.className = 'ac-path-stats';
      stats.innerHTML =
        '<div class="ac-stats-line"><span class="cur-ic" id="apr-cur-ic">·</span>当前：<span class="cur-tx" id="apr-cur-tx">—</span></div>' +
        '<div class="ac-stats-bar"><div class="bar-fill" id="apr-bar-fill" style="width:0%"></div></div>' +
        '<div class="ac-stats-meta"><span>已完成 <b id="apr-done">0</b>/' + steps.length + '</span><span>下一步：<b id="apr-next">—</b></span></div>' +
        '<div class="ac-stats-legend">' +
          '<span class="item"><span class="ld cur"></span>当前</span>' +
          '<span class="item"><span class="ld done"></span>已完成</span>' +
          '<span class="item"><span class="ld todo"></span>待录入</span>' +
        '</div>';
      pathCard.appendChild(stats);

      function refresh() {
        const cur = S.step || 1;
        const done = steps.filter(s => s.id < cur).length;
        const sCur = steps.find(s => s.id === cur) || steps[0];
        const sNext = steps.find(s => s.id === cur + 1);
        const curIc = stats.querySelector('#apr-cur-ic');
        const curTx = stats.querySelector('#apr-cur-tx');
        const bar = stats.querySelector('#apr-bar-fill');
        const doneEl = stats.querySelector('#apr-done');
        const nextEl = stats.querySelector('#apr-next');
        if (curIc) curIc.textContent = sCur ? sCur.id : '·';
        if (curTx) curTx.textContent = sCur ? sCur.title : '—';
        if (bar) bar.style.width = ((done / steps.length) * 100).toFixed(1) + '%';
        if (doneEl) doneEl.textContent = done;
        if (nextEl) nextEl.textContent = sNext ? ('步骤 ' + sNext.id + ' · ' + sNext.title) : '全部完成 ✓';
      }
      refresh();
      // 监听步骤切换：评估页自带 _rerender / 表单同步；间隔轮询当前步骤值
      let lastStep = S.step || 1;
      setInterval(function () {
        if ((S.step || 1) !== lastStep) {
          lastStep = S.step || 1;
          refresh();
        }
      }, 400);
    })();

    return wrap;
  };

  /* ===== 第一排：左「新建患者」按钮 + 右「选择患者」可搜索下拉 =====
     方案要求：去掉原来的选患者卡片形态，改为一行两块 —— 左侧新建入口、右侧带搜索的档案下拉。 */
  function assessPatientRow() {
    const list = AppState.patients || [];
    const cur = list.find(p => p.id === AppState.currentPatientId);
    return `
      <div class="apr-row">
        <a class="apr-new" href="#/patient" title="新建患者登记">
          <span class="apr-new-ic">＋</span>
          <span class="apr-new-tx"><b>新建患者</b><i>首诊登记入口</i></span>
        </a>
        <div class="apr-pick">
          <div class="apr-pick-hd">
            <span class="apr-pick-ttl">选择患者</span>
            ${cur ? `<span class="badge badge-success">${U.esc(cur.patientCode || cur.id)}</span>` : '<span class="apr-pick-none">未选择档案</span>'}
          </div>
          <div class="apr-pick-bd">
            <div class="apr-search">
              <span class="apr-search-ic">🔍</span>
              <input type="search" id="apr-search" placeholder="搜索姓名 / 档案编号…" autocomplete="off">
            </div>
            <select id="patient-switch" class="apr-select">
              <option value="">— 选择患者档案 —</option>
              ${list.map(p => `<option value="${p.id}" ${p.id === AppState.currentPatientId ? 'selected' : ''}>${U.esc(p.patientCode || p.id)} · ${U.esc(p.patientName)}（更新于 ${U.fmtDate(p.updatedAt)}）</option>`).join('')}
            </select>
          </div>
          <div class="apr-hint" id="apr-hint">共 ${list.length} 份档案</div>
        </div>
      </div>`;
  }

  function bindAssessPatientRow(root) {
    const sel = U.qs('#patient-switch', root);
    const box = U.qs('#apr-search', root);
    const hint = U.qs('#apr-hint', root);
    const all = (AppState.patients || []).slice();
    if (box && sel) {
      // 搜索：按姓名 / 档案编号过滤下拉选项（保留当前选中项不被过滤掉）
      box.oninput = () => {
        const q = (box.value || '').trim().toLowerCase();
        const hits = all.filter(p => !q
          || String(p.patientName || '').toLowerCase().includes(q)
          || String(p.patientCode || '').toLowerCase().includes(q)
          || String(p.id || '').toLowerCase().includes(q));
        sel.innerHTML = '<option value="">— 选择患者档案 —</option>' + hits.map(p =>
          `<option value="${p.id}" ${p.id === AppState.currentPatientId ? 'selected' : ''}>${U.esc(p.patientCode || p.id)} · ${U.esc(p.patientName)}（更新于 ${U.fmtDate(p.updatedAt)}）</option>`).join('');
        if (hint) hint.textContent = q ? `匹配 ${hits.length} / ${all.length} 份档案` : `共 ${all.length} 份档案`;
      };
      box.onkeydown = (e) => {
        // 回车：若仅剩唯一匹配则直接切换
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const opts = Array.prototype.slice.call(sel.options).filter(o => o.value);
        if (opts.length === 1) { sel.value = opts[0].value; sel.dispatchEvent(new Event('change')); }
      };
    }
    if (sel) {
      sel.onchange = async () => {
        if (!sel.value) { clearPatientContext(); AppState.currentPatientId = null; route(); return; }
        await loadPatientContext(sel.value);
        U.toast('已切换患者档案', 'success');
        route();
      };
    }
  }

  function wtRegionNote(title, desc) {
    return '<div style="font-size:14px;line-height:1.7;"><div style="font-weight:700;font-size:15px;margin-bottom:8px;">' + U.esc(title) + '</div>' +
      '<p style="color:var(--text-muted);margin:0;">' + U.esc(desc) + '</p>' +
      '<div class="alert alert-info mt-3">该部位的具体数值请在「步骤 1 · 体成分录入」中填写，系统将自动完成代谢与风险计算。</div></div>';
  }

  function planHTML(S) {
    return '<div class="ac-tip">评估已进入归档阶段。点击下方按钮保存数据并生成智能干预方案；AI 解读报告通过独立全屏弹窗查看，更便于回读与导出。</div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">💾</span>保存与生成方案</h3></div><div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;">' +
      '<button class="btn btn-primary btn-lg" id="btn-save-assess">保存综合评估</button>' +
      '<button class="btn btn-success btn-lg" id="btn-to-plan">保存并生成智能方案 →</button>' +
      '</div></div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">' + qooIcon('sm') + '</span>鹊动小Qoo 报告解读</h3></div><div class="card-body">' +
      '<div style="font-size:13.5px;color:var(--text-muted);line-height:1.7;margin-bottom:14px;">由鹊动小Qoo 对 BMI、腰围、体脂、内脏脂肪、BMR、PQ-风险、活动水平等 25+ 项数据进行综合分析，输出风险判读、关键发现、建议与随访重点。</div>' +
      '<button class="btn btn-ai btn-lg" id="btn-ai-interpret"><span class="ai-icon-wrap">' + qooIcon('sm') + '</span>打开 AI 解读报告（全屏）</button>' +
      '</div></div>';
  }

  async function save(S, next) {
    const R = recompute(S), d = R.d;
    if (!d.height || !d.weight || !d.restHR) { U.toast('请完整填写身高、体重、静息心率', 'warning'); return; }
    try {
      AppState.assessment = d;
      await persistPatient();
      U.toast('综合评估数据已保存', 'success');
      if (next) location.hash = '#/plan';
    } catch (e) {
      U.toast('保存失败：' + U.errMsg(e), 'error');
    }
  }

  async function aiInterpret(S, bd) {
    if (!window.AIReason || typeof window.AIReason.interpret !== 'function') { U.toast('鹊动小Qoo 组件未加载', 'error'); return; }
    if (!(window.AIReason.aiEnabled && window.AIReason.aiEnabled())) { U.toast('本账号未开通 AI 辅助', 'warning'); return; }
    const R = recompute(S), d = R.d;
    if (!d.height || !d.weight || !d.restHR) { U.toast('请先填写身高、体重、静息心率再生成解读', 'warning'); return; }
    const ctx = {
      module: 'weight-management-assessment',
      patient: { name: AppState.patient.name, age: AppState.patient.age, gender: AppState.patient.gender },
      assessment: {
        height: d.height, weight: d.weight, bmi: R.bmi, waist: d.waist, hip: d.hip, neck: d.neck,
        sbp: d.sbp, dbp: d.dbp, restHR: d.restHR, bodyFat: d.bodyFat, muscleMass: d.muscleMass,
        fatMass: d.fatMass, visceralFat: d.visceralFat, measuredBMR: d.measuredBMR, inbodyScore: d.inbodyScore,
        activityLevel: d.activityLevel, weightStage: d.weightStage, cvRisk: d.cvRisk, contraindication: d.contraindication, parq: d.parq, risk: R.risk
      }
    };
    /* AI 解读改用独立全屏弹窗显示，不再渲染到步骤卡片内 */
    const modalRef = U.modal({
      title: '鹊动小Qoo · 综合评估报告解读',
      body: '<div class="sarc2-ai-body"><span class="ai-spin"></span> 鹊动小Qoo 正在解读综合评估…</div>',
      width: '100vw',
      cls: 'ai-modal-full ac-step-fullscreen ac-ai-fullscreen',
      footer:
        '<div class="ac-hint">鹊动小Qoo 辅助生成，须经专业人员确认</div>' +
        '<button class="btn btn-secondary" id="ai-fs-close">关闭</button>' +
        '<button class="btn btn-primary" id="ai-fs-regen">🔄 重新生成</button>' +
        '<button class="btn btn-success" id="ai-fs-export">📄 导出报告</button>'
    });
    const aiBox = U.qs('.modal-body', modalRef.overlay);
    const renderRes = (res) => {
      const md = window.AIReason.renderMarkdown ? window.AIReason.renderMarkdown(res.reply || '') : U.esc(res.reply || '');
      aiBox.innerHTML = '<div class="sarc2-ai-head"><span class="ai-icon-wrap">' + qooIcon('sm') + '</span>鹊动小Qoo 综合评估报告解读<span class="sarc2-ai-badge">' + U.esc(res.provider || 'AI') + '</span></div><div class="ai-md">' + md + '</div><div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认</div>';
    };
    const fetchAI = async () => {
      aiBox.innerHTML = '<div class="sarc2-ai-body"><span class="ai-spin"></span> 鹊动小Qoo 正在解读综合评估…</div>';
      try {
        const res = await window.AIReason.interpret(ctx);
        renderRes(res);
      } catch (e) {
        aiBox.innerHTML = '<div class="sarc2-ai-body">鹊动小Qoo 解读暂不可用：' + U.esc((window.U && U.errMsg ? U.errMsg(e) : (e.message || e))) + '</div>';
      }
    };
    await fetchAI();
    /* 关闭按钮 */
    const closeBtn = U.qs('#ai-fs-close', modalRef.overlay);
    if (closeBtn) closeBtn.onclick = () => modalRef.close();
    /* 重新生成 */
    const regenBtn = U.qs('#ai-fs-regen', modalRef.overlay);
    if (regenBtn) regenBtn.onclick = () => fetchAI();
    /* 导出报告：以 window.print 简单导出（浏览器打印 → PDF） */
    const exportBtn = U.qs('#ai-fs-export', modalRef.overlay);
    if (exportBtn) exportBtn.onclick = () => {
      try {
        const w = window.open('', '_blank');
        if (!w) { U.toast('浏览器拦截了新窗口，请允许后重试', 'warning'); return; }
        w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>鹊动小Qoo 评估报告</title><style>body{font-family:system-ui;max-width:780px;margin:32px auto;padding:0 24px;color:#1e293b}h1{font-size:22px}h2{font-size:18px;color:#0f766e}h3{font-size:15px;color:#475569}.badge{display:inline-block;background:#dcfce7;color:#166534;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600}</style></head><body>' + aiBox.innerHTML + '</body></html>');
        w.document.close();
        setTimeout(() => { w.print(); }, 400);
      } catch (e) { U.toast('导出失败：' + (e.message || e), 'error'); }
    };
  }

  /* 指标卡片 */
  function metricCard(title, value, unit, grade, level, note) {
    return `<div class="stat-card" style="text-align:left;">
      <div class="stat-label" style="margin-bottom:6px;">${U.esc(title)}</div>
      <div class="stat-value" style="font-size:26px;">${value === null ? '—' : U.esc(String(value))}
        <span style="font-size:13px;color:var(--text-muted);font-weight:500;">${U.esc(unit || '')}</span></div>
      <div style="margin-top:8px;"><span class="badge badge-${level}">${U.esc(grade)}</span></div>
      ${note ? `<div style="font-size:11.5px;color:var(--text-muted);margin-top:8px;line-height:1.6;">${U.esc(note)}</div>` : ''}
    </div>`;
  }

  /* 获取最近一次肌力评估摘要（供联动分析使用） */
  function getLatestStrengthSummary() {
    const gender = AppState.patient.gender;
    const bw = U.num(AppState.assessment.weight);
    const iso = AppState.isokineticData || [], ito = AppState.isotonicData || [];
    if (iso.length) {
      const last = [...iso].sort((a, b) => new Date(b.testDate) - new Date(a.testDate))[0];
      return Calc.isokineticScore(last, gender);
    }
    if (ito.length) {
      const last = [...ito].sort((a, b) => new Date(b.testDate) - new Date(a.testDate))[0];
      return Calc.isotonicScore(last, gender, bw);
    }
    return null;
  }
  window.getLatestStrengthSummary = getLatestStrengthSummary;
})();
