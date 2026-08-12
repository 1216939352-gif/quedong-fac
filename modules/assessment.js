/**
 * 综合评估模块：体格测量 / 体成分 / 能量代谢 / 运动风险 / 生活习惯问卷 + 干预指导
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

  Pages.assessment = function () {
    if (!AppState.patient || !AppState.patient.name) {
      return `<div class="alert alert-warning"><div><strong>请先完成患者首诊登记</strong>
        <p style="margin:6px 0 0;">综合评估需要患者的性别、年龄等基础信息作为计算依据。</p>
        <a href="#/patient" class="btn btn-primary btn-sm mt-2">前往首诊登记 →</a></div></div>`;
    }

    const p = AppState.patient;
    const a = AppState.assessment || {};
    const recActivity = CONST.WORK_INTENSITY_MAP[p.workIntensity] || 'sedentary';

    const wrap = U.el(`<div>
      ${patientBar()}

      <div class="card mb-3">
        <div class="card-body" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
          <div><span style="color:var(--text-muted);font-size:13px;">患者</span>
            <div style="font-weight:700;font-size:17px;">${U.esc(p.name)}</div></div>
          <div><span style="color:var(--text-muted);font-size:13px;">性别 / 年龄</span>
            <div style="font-weight:600;">${p.gender === 'female' ? '女' : '男'} · ${p.age || '—'} 岁</div></div>
          <div><span style="color:var(--text-muted);font-size:13px;">工作体力等级</span>
            <div style="font-weight:600;">${(CONST.WORK_INTENSITY.find(w => w.key === p.workIntensity) || {}).label || '未填写'}</div></div>
          <div><span style="color:var(--text-muted);font-size:13px;">目标体重</span>
            <div style="font-weight:600;">${p.targetWeight ? p.targetWeight + ' kg' : '未设定'}</div></div>
          <div style="margin-left:auto;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            ${window.SmartForm ? SmartForm.autosaveHTML('assess-autosave', '录入将实时计算，点击底部按钮归档') : ''}
            <button class="btn btn-ghost btn-sm" id="btn-fold-all">折叠全部</button>
            <button class="btn btn-secondary btn-sm" id="btn-demo-assess">一键填充演示数据</button></div>
        </div>
      </div>

      <form id="assess-form">
        <!-- 体格测量 -->
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📏</span>一、体格测量</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>身高 cm <span class="required">*</span></label>
                <input type="number" name="height" step="0.1" class="calc-trigger" required></div>
              <div class="form-group"><label>体重 kg <span class="required">*</span></label>
                <input type="number" name="weight" step="0.1" class="calc-trigger" required></div>
              <div class="form-group"><label>静息心率 bpm <span class="required">*</span></label>
                <input type="number" name="restHR" class="calc-trigger" required placeholder="安静状态测量"></div>
              <div class="form-group"><label>腰围 cm</label>
                <input type="number" name="waist" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>臀围 cm</label>
                <input type="number" name="hip" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>颈围 cm</label>
                <input type="number" name="neck" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>收缩压 mmHg</label>
                <input type="number" name="sbp" class="calc-trigger"></div>
              <div class="form-group"><label>舒张压 mmHg</label>
                <input type="number" name="dbp" class="calc-trigger"></div>
            </div>
            <div id="physical-result" class="mt-2"></div>
          </div>
        </div>

        <!-- 体成分 -->
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧬</span>二、体成分数据（InBody 等设备）</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>体脂率 %</label><input type="number" name="bodyFat" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>骨骼肌量 kg</label><input type="number" name="muscleMass" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>体脂肪重量 kg</label><input type="number" name="fatMass" step="0.1" class="calc-trigger"></div>
              <div class="form-group"><label>内脏脂肪等级</label><input type="number" name="visceralFat" class="calc-trigger"></div>
              <div class="form-group"><label>实测基础代谢 kcal</label><input type="number" name="measuredBMR" class="calc-trigger" placeholder="设备实测值，留空则用公式"></div>
              <div class="form-group"><label>InBody 身体评分</label><input type="number" name="inbodyScore" class="calc-trigger"></div>
            </div>
            <div id="composition-result" class="mt-2"></div>
          </div>
        </div>

        <!-- 能量代谢 -->
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🔥</span>三、能量代谢自动计算</h3></div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group"><label>活动水平 <span class="required">*</span></label>
                <select name="activityLevel" class="calc-trigger" required>
                  ${CONST.ACTIVITY_LEVELS.map(l =>
                    `<option value="${l.key}" ${l.key === recActivity ? 'selected' : ''}>${l.label}（系数 ${l.coef}）</option>`).join('')}
                </select>
                <small style="color:var(--text-muted);font-size:12px;">根据工作体力等级推荐：${(CONST.ACTIVITY_LEVELS.find(l => l.key === recActivity) || {}).label || ''}</small>
              </div>
              <div class="form-group"><label>减重阶段 <span class="required">*</span></label>
                <select name="weightStage" class="calc-trigger" required>
                  ${CONST.WEIGHT_STAGES.map(s => `<option value="${s.key}">${s.label} · 缺口 ${s.deficit} kcal</option>`).join('')}
                </select></div>
            </div>
            <div id="metabolism-result" class="mt-2"></div>
          </div>
        </div>

        <!-- 运动风险 -->
        <div class="card mt-3">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">⚠️</span>四、运动风险自动判定</h3></div>
          <div class="card-body">
            <label style="font-weight:600;font-size:14px;margin-bottom:10px;display:block;">PAR-Q 体力活动准备问卷</label>
            <div class="table-wrap"><table>
              <thead><tr><th style="width:70%;">问题</th><th style="width:15%;">是</th><th style="width:15%;">否</th></tr></thead>
              <tbody>${PARQ.map((q, i) => `<tr>
                <td style="font-size:13.5px;line-height:1.6;">${i + 1}. ${q}</td>
                <td><label class="radio-item" style="border:none;padding:4px;"><input type="radio" name="parq${i}" value="yes" class="calc-trigger"></label></td>
                <td><label class="radio-item" style="border:none;padding:4px;"><input type="radio" name="parq${i}" value="no" class="calc-trigger" checked></label></td>
              </tr>`).join('')}</tbody>
            </table></div>
            <div class="form-row mt-3">
              <div class="form-group"><label>心血管风险等级</label>
                <select name="cvRisk" class="calc-trigger">
                  <option value="low">低（无危险因素）</option>
                  <option value="medium">中（1-2 项危险因素）</option>
                  <option value="high">高（≥3 项或已确诊心血管疾病）</option>
                </select></div>
              <div class="form-group full-width"><label>运动禁忌项</label>
                <input type="text" name="contraindication" class="calc-trigger" placeholder="如：不稳定型心绞痛、急性期损伤；无请留空"></div>
            </div>
            <div id="risk-result" class="mt-2"></div>
          </div>
        </div>


        <div class="card mt-3 no-print">
          <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary btn-lg">保存综合评估</button>
            <button type="button" class="btn btn-success btn-lg" id="btn-to-plan">保存并生成智能方案 →</button>
            <button type="button" class="btn btn-ai btn-lg" id="btn-ai-interpret"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 报告解读</button>
          </div>
        </div>
        <div class="card mt-3 no-print" id="assess-ai-card" style="display:none;">
          <div class="card-header"><h3 class="card-title"><span class="card-title-icon">${qooIcon('sm')}</span>鹊动小Qoo 综合评估报告解读</h3></div>
          <div class="card-body"><div id="assess-ai-box"></div></div>
        </div>
      </form>
    </div>`);

    const form = U.qs('#assess-form', wrap);
    U.bindChoiceStyle(form);
    U.bindNoneExclusive(form, 'postureIssues', 'none');
    U.bindNoneExclusive(form, 'painArea', 'none');

    // 回填
    if (Object.keys(a).length) {
      U.fillForm(form, a);
      if (Array.isArray(a.parq)) a.parq.forEach((v, i) => {
        const r = U.qs(`input[name="parq${i}"][value="${v}"]`, form);
        if (r) r.checked = true;
      });
    }
    U.bindChoiceStyle(form);

    // 自动获取首诊基础信息中的身高/体重（预填，用户仍可修改）
    if (p.height || p.weight) {
      const hf = U.qs('[name="height"]', form), wf = U.qs('[name="weight"]', form);
      if (p.height && !hf.value) hf.value = p.height;
      if (p.weight && !wf.value) wf.value = p.weight;
      recompute();
    }

    /* ---------- 实时计算 ---------- */
    function collect() {
      const d = U.formData(form);
      d.parq = PARQ.map((_, i) => d[`parq${i}`] || 'no');
      return d;
    }

    function recompute() {
      const d = collect();
      const gender = p.gender, age = p.age;
      const h = U.num(d.height), w = U.num(d.weight);

      /* 体格 */
      const bmi = Calc.bmi(w, h);
      const bmiG = Calc.bmiGrade(bmi);
      const whr = Calc.whr(U.num(d.waist), U.num(d.hip));
      const whrR = Calc.whrRisk(whr, gender);
      const waistR = Calc.waistRisk(U.num(d.waist), gender);
      const bp = Calc.bpGrade(U.num(d.sbp), U.num(d.dbp));

      U.qs('#physical-result', wrap).innerHTML = (bmi || whr || bp) ? `
        <div class="grid-4">
          ${bmi ? metricCard('BMI 体质指数', bmi, `kg/m²`, bmiG.label, bmiG.level, bmiG.advice) : ''}
          ${whr ? metricCard('腰臀比 WHR', whr, '', whrR.label, whrR.level,
            `${gender === 'female' ? '女性' : '男性'}参考切点 ${gender === 'female' ? '0.85' : '0.90'}`) : ''}
          ${waistR ? metricCard('腰围评价', U.num(d.waist), 'cm', waistR.label, waistR.level,
            `中心性肥胖切点 ${waistR.cut} cm`) : ''}
          ${bp ? metricCard('血压评价', `${d.sbp}/${d.dbp}`, 'mmHg', bp.label, bp.level, '安静休息 5 分钟后测量') : ''}
        </div>
        ${p.targetWeight && w ? `<div class="alert alert-info mt-2"><div>
          <strong>减重目标测算</strong><p style="margin:6px 0 0;font-size:13.5px;line-height:1.7;">
          当前体重 ${w} kg，目标体重 ${p.targetWeight} kg，需减重 <strong>${U.round(w - U.num(p.targetWeight), 1)} kg</strong>
          （占当前体重 ${U.round((w - U.num(p.targetWeight)) / w * 100, 1)}%）。
          临床推荐首阶段目标为减重 5%-10%（即 ${U.round(w * 0.05, 1)}-${U.round(w * 0.1, 1)} kg），
          即可显著改善血糖、血脂、血压与脂肪肝指标。</p></div></div>` : ''}` : '';

      /* 体成分 */
      const bf = U.num(d.bodyFat);
      const bfG = Calc.bodyFatGrade(bf, gender);
      const mm = U.num(d.muscleMass), vf = U.num(d.visceralFat);
      U.qs('#composition-result', wrap).innerHTML = (bf || mm || vf) ? `
        <div class="grid-4">
          ${bf ? metricCard('体脂率', bf, '%', bfG.label, bfG.level,
            `${gender === 'female' ? '女性' : '男性'}理想范围 ${gender === 'female' ? '18-28' : '10-20'}%`) : ''}
          ${mm ? metricCard('骨骼肌量', mm, 'kg', w ? `占体重 ${U.round(mm / w * 100, 1)}%` : '—', 'info',
            '减重期核心保护目标，流失应 <25% 总减重量') : ''}
          ${vf ? metricCard('内脏脂肪等级', vf, '级', vf > 14 ? '显著偏高' : (vf > 9 ? '偏高' : '正常'),
            vf > 14 ? 'danger' : (vf > 9 ? 'warning' : 'success'), '标准范围 1-9 级') : ''}
          ${d.inbodyScore ? metricCard('InBody 身体评分', d.inbodyScore, '分',
            U.num(d.inbodyScore) >= 80 ? '良好' : '待提升', U.num(d.inbodyScore) >= 80 ? 'success' : 'warning', '满分 100 分') : ''}
        </div>` : '';

      /* 能量代谢 */
      const coef = (CONST.ACTIVITY_LEVELS.find(l => l.key === d.activityLevel) || {}).coef;
      const stage = CONST.WEIGHT_STAGES.find(s => s.key === d.weightStage) || CONST.WEIGHT_STAGES[1];
      const formulaBMR = Calc.bmr(gender, w, h, age);
      const bmr = U.num(d.measuredBMR) || formulaBMR;
      const tdee = Calc.tdee(bmr, coef);
      const tc = Calc.targetCalories(tdee, stage.deficit, gender, bmr);
      const weekly = tc ? Calc.weeklyLoss(tc.actualDeficit) : null;

      const metaEl = U.qs('#metabolism-result', wrap);
      if (bmr && tdee && tc) {
        const macros = Calc.macros(w, tc.target);
        metaEl.innerHTML = `
          <div class="grid-4">
            ${metricCard('基础代谢 BMR', bmr, 'kcal/日',
              U.num(d.measuredBMR) ? '设备实测值' : 'Mifflin-St Jeor 公式', 'info',
              formulaBMR ? `公式推算值 ${formulaBMR} kcal` : '')}
            ${metricCard('每日总消耗 TDEE', tdee, 'kcal/日', `活动系数 ${coef}`, 'info', 'TDEE = BMR × 活动系数')}
            ${metricCard('每日目标摄入', tc.target, 'kcal/日',
              tc.limited ? '已触发安全下限' : `缺口 ${tc.actualDeficit} kcal`,
              tc.limited ? 'warning' : 'success', tc.limitReason || `${stage.label}`)}
            ${metricCard('预期减重速度', weekly, 'kg/周', weekly >= 1 ? '偏快需关注' : '安全区间',
              weekly >= 1 ? 'warning' : 'success', '7700 kcal ≈ 1 kg 脂肪')}
          </div>
          ${tc.limited ? `<div class="alert alert-warning mt-2"><div><strong>热量安全保护已生效</strong>
            <p style="margin:6px 0 0;font-size:13.5px;">${tc.limitReason}。过低热量摄入会引发基础代谢下降、肌肉流失与营养素缺乏，反而降低长期减重成功率。</p></div></div>` : ''}
          <div class="mt-2" style="padding:16px;background:var(--bg-secondary);border-radius:12px;">
            <div style="font-weight:600;margin-bottom:12px;font-size:14px;">宏量营养素目标分配（基于 ${tc.target} kcal）</div>
            ${U.barCompare([
              { label: `蛋白质 ${macros.proteinG}g（1.2g/kg 体重）`, value: macros.proteinPct, display: `${macros.proteinPct}%`, color: '#f26522' },
              { label: `脂肪 ${macros.fatG}g（总热量 25%）`, value: macros.fatPct, display: `${macros.fatPct}%`, color: '#f59e0b' },
              { label: `碳水化合物 ${macros.carbG}g（填充剩余）`, value: macros.carbPct, display: `${macros.carbPct}%`, color: '#22c55e' }
            ])}
          </div>`;
      } else {
        metaEl.innerHTML = '<div style="color:var(--text-muted);font-size:13.5px;">请先填写身高、体重与静息心率，系统将自动完成代谢计算</div>';
      }

      /* 运动风险 */
      const risk = Calc.exerciseRisk(d, p);
      const lvMap = { low: 'success', medium: 'warning', high: 'danger' };
      U.qs('#risk-result', wrap).innerHTML = `
        <div class="alert alert-${lvMap[risk.level]}">
          <div style="width:100%;">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <strong style="font-size:15px;">整体运动风险：</strong>
              <span class="badge badge-${lvMap[risk.level]}" style="font-size:13px;">${risk.label}（风险积分 ${risk.score}）</span>
            </div>
            ${risk.factors.length ? `<div style="margin-top:10px;font-size:13.5px;">
              <strong>识别到的风险因素：</strong>${risk.factors.map(f => `<span class="badge badge-warning" style="margin:3px 4px 0 0;">${U.esc(f)}</span>`).join('')}
            </div>` : '<div style="margin-top:8px;font-size:13.5px;">未识别到显著运动风险因素。</div>'}
            <p style="margin:10px 0 0;font-size:13.5px;line-height:1.75;"><strong>运动处方安全建议：</strong>${risk.advice}</p>
          </div>
        </div>`;

      // Karvonen 心率区间预览
      const hr = Calc.karvonen(age, U.num(d.restHR), 0.4, 0.75);
      if (hr) {
        U.qs('#risk-result', wrap).insertAdjacentHTML('beforeend', `
          <div class="mt-2" style="padding:14px 16px;background:var(--bg-secondary);border-radius:12px;font-size:13.5px;line-height:1.8;">
            <strong>Karvonen 目标心率区间</strong>（最大心率 ${hr.hrMax} bpm，储备心率 HRR ${hr.hrr} bpm）：
            适应期 <strong>${Calc.karvonen(age, U.num(d.restHR), 0.4, 0.5).low}-${Calc.karvonen(age, U.num(d.restHR), 0.4, 0.5).high}</strong> bpm ·
            强化期 <strong>${Calc.karvonen(age, U.num(d.restHR), 0.5, 0.65).low}-${Calc.karvonen(age, U.num(d.restHR), 0.5, 0.65).high}</strong> bpm ·
            巩固期 <strong>${Calc.karvonen(age, U.num(d.restHR), 0.6, 0.75).low}-${Calc.karvonen(age, U.num(d.restHR), 0.6, 0.75).high}</strong> bpm
          </div>`);
      }

      return { d, bmi, bmiG, bmr, tdee, tc, weekly, risk };
    }

    form.addEventListener('input', e => { if (e.target.classList.contains('calc-trigger')) recompute(); });
    form.addEventListener('change', e => { if (e.target.classList.contains('calc-trigger')) recompute(); });

    /* ---------- SmartForm：渐进披露 + 字段校验 + 状态指示 ---------- */
    let assessValidator = null;
    let folder = null;
    if (window.SmartForm) {
      /* 1) 分节折叠 + 完成度徽标（默认全部展开，用户自行控制折叠） */
      folder = SmartForm.collapsibleCards(form, { toolbar: false });
      const foldBtn = U.qs('#btn-fold-all', wrap);
      if (foldBtn) {
        let collapsed = false;
        foldBtn.onclick = () => {
          collapsed = !collapsed;
          collapsed ? folder.collapseAll() : folder.expandAll();
          foldBtn.textContent = collapsed ? '展开全部' : '折叠全部';
        };
      }
      /* 2) 关键体征字段范围校验（保留输入内容，仅红框 + 气泡） */
      assessValidator = SmartForm.bindRanges(form, {
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
      /* 3) 录入状态指示：改动即标脏，归档成功后转为已保存 */
      const dot = SmartForm.attachAutosave(U.qs('#assess-autosave', wrap));
      form.addEventListener('input', () => dot.mark());
      form.addEventListener('change', () => dot.mark());
      wrap.__assessDot = dot;
      /* 草稿自动保存（输入即落盘，刷新/误关后可续填） */
      const assessDraft = SmartForm.bindDraft(form, 'assess-form', { indicator: dot });
      wrap.__assessDraft = assessDraft;
    }



    /* ---------- 演示数据 ---------- */
    U.qs('#btn-demo-assess', wrap).onclick = () => {
      U.fillForm(form, {
        height: '176', weight: '96.5', restHR: '78', waist: '104', hip: '108', neck: '42',
        sbp: '138', dbp: '88', bodyFat: '32.4', muscleMass: '35.8', fatMass: '31.3',
        visceralFat: '15', measuredBMR: '1820', inbodyScore: '68',
        activityLevel: 'sedentary', weightStage: 'standard', cvRisk: 'medium', contraindication: ''
      });
      U.qs('input[name="parq4"][value="yes"]', form).checked = true;
      recompute();
      if (folder) { folder.expandAll(); folder.refreshAll(); }
      U.toast('已填充评估演示数据', 'success');
    };


    /* ---------- 保存 ---------- */
    async function save(next, btn) {
      const r = recompute();
      const d = r.d;
      if (!d.height || !d.weight || !d.restHR) return U.toast('请完整填写身高、体重、静息心率', 'warning');

      /* 字段范围硬校验：超出合理区间时不放行，并自动定位到第一处 */
      if (assessValidator) {
        const errs = assessValidator.errors();
        if (errs.length) {
          const first = assessValidator.focusFirstError();
          return U.toast(`有 ${errs.length} 项数据超出合理范围：${(first && first.msg) || errs[0].msg}`, 'error');
        }
        const warns = assessValidator.warnings();
        if (warns.length) {
          U.toast(`${warns.length} 项数据偏离常见区间（${warns.map(w => w.label).filter(Boolean).join('、')}），已放行，请复核`, 'warning');
        }
      }

      await U.withBtn(btn || U.qs('button[type=submit]', form) || U.qs('#btn-to-plan', wrap), '保存中…', async () => {
        AppState.assessment = d;
        try {
          await persistPatient();
          if (wrap.__assessDraft) wrap.__assessDraft.clear();
          if (wrap.__assessDot) wrap.__assessDot.ping();
          U.toast('综合评估数据已保存', 'success');
          if (next) location.hash = '#/plan';
      } catch (e) {
        if (wrap.__assessDot) wrap.__assessDot.fail('保存失败：' + U.errMsg(e));
        U.toast('保存失败：' + U.errMsg(e), 'error');
      }
      });
    }
    form.onsubmit = e => { e.preventDefault(); save(false); };
    U.qs('#btn-to-plan', wrap).onclick = (e) => save(true, e.currentTarget);

    /* ---------- AI 报告解读 ---------- */
    const aiInterpBtn = U.qs('#btn-ai-interpret', wrap);
    const aiCard = U.qs('#assess-ai-card', wrap);
    const aiBox = U.qs('#assess-ai-box', wrap);
    // AI 模式关闭的账号不显示「AI 报告解读」入口（聊天问答除外，不受影响）
    if (aiInterpBtn && !(window.AIReason && window.AIReason.aiEnabled && window.AIReason.aiEnabled())) {
      aiInterpBtn.style.display = 'none';
    }
    if (aiInterpBtn) aiInterpBtn.onclick = async function () {
      if (!window.AIReason || typeof window.AIReason.interpret !== 'function') { U.toast('鹊动小Qoo 组件未加载', 'error'); return; }
      if (!(window.AIReason.aiEnabled && window.AIReason.aiEnabled())) { U.toast('本账号未开通 AI 辅助', 'warning'); return; }
      const r = recompute();
      const d = r.d;
      if (!d.height || !d.weight || !d.restHR) { U.toast('请先填写身高、体重、静息心率再生成解读', 'warning'); return; }
      const ctx = {
        module: 'weight-management-assessment',
        patient: { name: p.name, age: p.age, gender: p.gender },
        assessment: {
          height: d.height, weight: d.weight, bmi: r.bmi,
          waist: d.waist, hip: d.hip, neck: d.neck,
          sbp: d.sbp, dbp: d.dbp, restHR: d.restHR,
          bodyFat: d.bodyFat, muscleMass: d.muscleMass, fatMass: d.fatMass,
          visceralFat: d.visceralFat, measuredBMR: d.measuredBMR, inbodyScore: d.inbodyScore,
          activityLevel: d.activityLevel, weightStage: d.weightStage,
          cvRisk: d.cvRisk, contraindication: d.contraindication, parq: d.parq,
          risk: r.risk
        }
      };
      if (aiCard) aiCard.style.display = '';
      aiBox.innerHTML = '<div class="sarc2-ai-body"><span class="ai-spin"></span> 鹊动小Qoo 正在解读综合评估…</div>';
      try {
        const res = await window.AIReason.interpret(ctx);
        const md = window.AIReason.renderMarkdown ? window.AIReason.renderMarkdown(res.reply || '') : U.esc(res.reply || '');
        aiBox.innerHTML = `<div class="sarc2-ai-head"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 综合评估报告解读<span class="sarc2-ai-badge">${U.esc(res.provider || 'AI')}</span></div><div class="ai-md">${md}</div><div class="sarc2-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认</div>`;
        if (aiCard) aiCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        aiBox.innerHTML = '<div class="sarc2-ai-body">鹊动小Qoo 解读暂不可用：' + U.esc((window.U && U.errMsg ? U.errMsg(e) : (e.message || e))) + '</div>';
      }
    };

    bindPatientBar(wrap);
    setTimeout(() => { recompute(); }, 30);

    return wrap;
  };

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
