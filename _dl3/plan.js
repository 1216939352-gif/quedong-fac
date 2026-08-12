/**
 * 智能营养与运动方案生成模块
 * 饮食处方 / 有氧 FITT-VP / 抗阻 / 柔韧（配图）/ 平衡功能训练（配图）/ 周日程 / 设备专项方案
 */
(function () {

  /* 优先从方案库读取动作；方案库为空则回退到内嵌 DIAGRAMS */
  async function getPlanExercises(category) {
    try {
      const list = await DB.getPlanLibrary();
      const filtered = list.filter(x => x.category === category);
      if (filtered.length) return filtered;
    } catch (e) { console.warn('读取方案库失败，回退到默认动作', e); }
    const D = window.DIAGRAMS || {};
    if (category === 'resistance') return D.RESIST || [];
    if (category === 'flexibility') return D.FLEX || [];
    if (category === 'balance') return D.BALANCE || [];
    return [];
  }

  /* ============ 平衡训练处方分级 ============ */
  async function balancePrescription(patient, survey, assessment) {
    const age = patient.age || 40;
    const self = survey.balanceSelf;
    const pain = Array.isArray(survey.painArea) ? survey.painArea : [];
    const posture = Array.isArray(survey.postureIssues) ? survey.postureIssues : [];
    const bmi = Calc.bmi(U.num(assessment.weight), U.num(assessment.height));

    let level = 3; // 默认起始等级
    if (self === 'ge30') level = 4;
    else if (self === 's15') level = 3;
    else if (self === 's5') level = 2;
    else if (self === 'lt5') level = 1;

    if (age >= 60) level = Math.max(1, level - 1);
    if (bmi && bmi >= 32.5) level = Math.max(1, level - 1);
    if (pain.filter(p => p !== 'none').length >= 2) level = Math.max(1, level - 1);

    const maxLevel = Math.min(5, level + 1);
    const balanceList = await getPlanExercises('balance');
    const selected = balanceList.filter(b => b.level != null && b.level <= maxLevel);

    const reasons = [];
    if (self) reasons.push(`单腿站立自评：${({ ge30: '≥30 秒', s15: '15-30 秒', s5: '5-15 秒', lt5: '<5 秒' })[self] || '未填写'}`);
    if (age >= 60) reasons.push(`年龄 ${age} 岁（≥60 岁跌倒风险上升）`);
    if (bmi && bmi >= 32.5) reasons.push(`BMI ${bmi}（重度肥胖影响重心控制）`);
    if (pain.filter(p => p !== 'none').length) reasons.push(`存在 ${pain.filter(p => p !== 'none').length} 处关节不适`);
    if (posture.filter(p => p !== 'none').length) reasons.push(`检出 ${posture.filter(p => p !== 'none').length} 项体态异常`);

    return {
      startLevel: level, maxLevel, exercises: selected, reasons,
      frequency: level <= 2 ? '每日 1 次（可拆分为早晚各 5 分钟）' : '每周 3-5 次',
      duration: level <= 2 ? '10-12 分钟/次' : '12-15 分钟/次',
      progressRule: '同一等级动作连续 3 次训练均可稳定完成规定时长且无扶手辅助，即可进阶至下一等级；进阶后如出现明显晃动或需扶持，回退一级巩固 1 周。',
      safety: [
        '训练环境：地面防滑无杂物，身旁 30cm 内有稳固扶手、墙面或椅背可随时支撑',
        '着装要求：穿包裹性好的运动鞋或赤足，避免拖鞋与厚袜',
        '闭眼训练与高阶双任务训练必须有人在旁看护',
        '出现头晕、视物旋转、下肢无力立即终止并坐下休息',
        '合并前庭功能障碍、严重周围神经病变者需先经康复医师评估'
      ],
      benefit: '平衡功能训练可改善本体感觉输入与姿势控制策略，降低跌倒风险；对减重人群而言，还能提升单腿支撑期稳定性，减少膝、踝代偿性损伤，为后续抗阻与有氧训练量的提升提供安全保障。'
    };
  }

  /* ============ 有氧运动优先级排序 ============ */
  function aerobicRanking(patient, assessment) {
    const joint = patient.jointIssue;
    const bmi = Calc.bmi(U.num(assessment.weight), U.num(assessment.height));
    let list = CONST.AEROBIC_PRIORITY.map(x => ({ ...x }));
    const needProtect = (joint && joint !== 'none') || (bmi && bmi >= 28);
    if (needProtect) {
      list = list.map(x => ({
        ...x,
        recommended: ['快走', '椭圆机', '游泳 / 水中运动', '骑行 / 功率自行车'].includes(x.name),
        blocked: x.name === '慢跑' || (joint === 'back' || joint === 'both') && x.name === '划船机'
      }));
    } else {
      list = list.map(x => ({ ...x, recommended: true, blocked: false }));
    }
    return { list, needProtect, reason: needProtect
      ? `患者${joint && joint !== 'none' ? '存在' + ({ knee: '膝关节不适', back: '腰部不适', both: '膝与腰均不适', other: '关节不适' })[joint] : ''}${bmi >= 28 ? `，BMI ${bmi} 属${bmi >= 32.5 ? '重度肥胖' : '肥胖'}` : ''}，运动方案已按护膝护腰原则重排优先级，暂缓高冲击项目。`
      : '患者无明显关节限制，可按标准优先级选择有氧方式。' };
  }

  /* ============ 设备专项方案匹配 ============ */
  function deviceProgram(strengthSummary, type) {
    if (!strengthSummary) return null;
    const weak = strengthSummary.weakPoints || [];
    const m = strengthSummary.metrics || {};
    const picks = [];

    const add = (id, reason, dose) => {
      const dev = CONST.DEVICES.find(d => d.id === id);
      if (dev && !picks.find(p => p.device.id === id)) picks.push({ device: dev, reason, dose });
    };

    const baseDose = strengthSummary.total >= 80
      ? { load: '70-80% 1RM', reps: '8-12 次', sets: '3-4 组', rest: '90 s' }
      : strengthSummary.total >= 70
        ? { load: '60-70% 1RM', reps: '10-12 次', sets: '3 组', rest: '75 s' }
        : { load: '40-55% 1RM', reps: '15-20 次', sets: '2-3 组', rest: '60 s' };

    // H/Q 失衡匹配
    if (m.hq !== null && m.hq !== undefined) {
      if (m.hq < 60) add('02', `H/Q 比值 ${U.round(m.hq, 1)}% 低于 60%，腘绳肌薄弱，优先强化屈膝肌群`, { ...baseDose, note: '弱侧单侧模式优先，离心阶段控制 3 秒' });
      else if (m.hq >= 80) add('01', `H/Q 比值 ${U.round(m.hq, 1)}% 偏高，伸膝肌群相对不足`, { ...baseDose, note: '重点训练末端 30° 伸膝范围' });
      else { add('01', 'H/Q 配比理想，维持伸膝肌群力量', baseDose); add('02', 'H/Q 配比理想，维持屈膝肌群力量', baseDose); }
    } else {
      add('01', '下肢基础伸膝肌力训练', baseDose);
      add('02', '下肢基础屈膝肌力训练', baseDose);
    }

    // LSI 失衡
    if (m.lsi !== null && m.lsi !== undefined && Math.abs(m.lsi) >= 15) {
      add('09', `双侧差值 ${U.round(Math.abs(m.lsi), 1)}%，需通过单侧蹬踏纠正代偿`, { ...baseDose, sets: '弱侧 4 组 / 强侧 3 组', note: '强制单侧独立模式，弱侧优先训练' });
    } else {
      add('09', '下肢整体力量与功能性蹬踏模式训练', baseDose);
    }

    // 耐力不足
    if (m.fi !== null && m.fi !== undefined && m.fi >= 60) {
      picks.forEach(p => { p.dose = { load: '40-50% 1RM', reps: '15-20 次', sets: '2-3 组', rest: '45 s', note: '耐力导向：疲劳指数偏高，先建立抗疲劳能力' }; });
    }

    // 核心与上肢
    add('03', '腹部核心肌群训练，改善腰椎稳定性与腹型肥胖', { load: '自重-40% 1RM', reps: '15 次', sets: '2-3 组', rest: '45 s', note: '避免颈部代偿发力' });
    add('04', '竖脊肌与臀大肌训练，纠正久坐导致的后链薄弱', { load: '40-55% 1RM', reps: '12-15 次', sets: '2-3 组', rest: '60 s', note: '腰痛者从小幅度开始' });
    add('05', '胸推训练，提升上肢推力与瘦体重储备', baseDose);
    add('06', '坐式划船，强化背部后链，改善圆肩驼背', baseDose);
    add('08', '高位下拉，增强背阔肌与肩胛稳定', baseDose);

    return {
      type, picks,
      cycle: strengthSummary.total >= 80 ? '8 周为一周期' : '12 周为一周期',
      frequency: strengthSummary.total >= 70 ? '2-3 次/周（间隔 ≥48 小时）' : '2 次/周（间隔 ≥72 小时）',
      safety: [
        '每次训练前完成 5-10 分钟低强度有氧热身，激活目标肌群',
        '设定 ROM 时以无痛活动范围为准，禁止超范围强行发力',
        '等速模式下速度设定：力量导向 60°/s，功能导向 120°/s，耐力导向 180°/s',
        '训练中保持均匀呼吸，发力时呼气，禁止憋气（瓦氏动作）',
        '出现关节弹响伴疼痛、放射性麻木立即停止并复评'
      ]
    };
  }

  /* ============ 徒手 / 哑铃 / 杠铃 减脂肌力训练方案 ============ */
  async function bodyweightProgram(strengthSummary, assessment) {
    const phase = strengthSummary && strengthSummary.total >= 80 ? 2 : (strengthSummary && strengthSummary.total >= 70 ? 1 : 0);
    const cfg = CONST.RESISTANCE_PHASES[phase];
    const resistList = await getPlanExercises('resistance');
    const source = resistList.length ? resistList : DIAGRAMS.RESIST;

    // 依据最近一次等张/等速肌力评估的 1RM，为哑铃/杠铃动作自动匹配负荷
    const oneRM = strengthSummary && strengthSummary.metrics && U.num(strengthSummary.metrics.oneRM);
    const bodyWeight = U.num(assessment && assessment.weight) || 70;
    const exercises = source.map(ex => {
      if (!ex.equipment || ex.basePercent == null) return ex;
      let load = null;
      let loadText = '';
      if (oneRM) {
        load = Math.round((oneRM * ex.basePercent) / 0.5) * 0.5;
        loadText = `${load} kg`;
      } else {
        // 无 1RM 数据时，按体重经验百分比给出估算提示
        const bwRatio = ex.equipment === 'barbell' ? 0.35 : 0.20;
        load = Math.round((bodyWeight * bwRatio) / 0.5) * 0.5;
        loadText = `${load} kg（估算）`;
      }
      return {
        ...ex,
        recommendedLoad: load,
        recommendedLoadText: loadText,
        dose: `${ex.reps || '10-12'} 次 × ${ex.sets || '3'} 组 · 负荷 ${loadText} · 间歇 ${ex.rest || '60 秒'}`
      };
    });

    return {
      phase: cfg,
      phaseIndex: phase,
      exercises,
      note: strengthSummary
        ? `依据肌力综合评分 ${strengthSummary.total} 分（${strengthSummary.grade}）${oneRM ? `· 实测 1RM ${oneRM} kg` : ''}，起始阶段定位为「${cfg.name}」；哑铃/杠铃动作已按 1RM 百分比自动配重。`
        : '尚未完成肌力测评，默认按适应期参数起始；哑铃/杠铃负荷按体重经验值估算。完成等速或等张测评后，系统将自动匹配更精准的 1RM 训练重量。'
    };
  }

  /* ============ 7 天周训练日程 ============ */
  function weekSchedule(riskLevel, aerobicPhase, resistFreq, balanceFreq) {
    const highRisk = riskLevel === 'high';
    const base = [
      { day: '周一', tags: [['aerobic', '有氧'], ['flexibility', '拉伸']], detail: '有氧 30 min（快走/椭圆机）+ 全身拉伸 15 min' },
      { day: '周二', tags: [['resistance', '抗阻'], ['balance', '平衡']], detail: '抗阻全身循环 2-3 组 + 平衡训练 12 min' },
      { day: '周三', tags: [['aerobic', '有氧']], detail: '有氧 30-40 min（中等强度持续）' },
      { day: '周四', tags: [['rest', '主动恢复'], ['flexibility', '拉伸']], detail: '休息日：散步 20 min + 静态拉伸 15 min' },
      { day: '周五', tags: [['resistance', '抗阻'], ['balance', '平衡']], detail: '抗阻全身循环 2-3 组 + 平衡训练 12 min' },
      { day: '周六', tags: [['aerobic', '有氧'], ['flexibility', '拉伸']], detail: '有氧 40-45 min（可户外快走/游泳）+ 拉伸 15 min' },
      { day: '周日', tags: [['rest', '完全休息']], detail: '完全休息，保证睡眠 7-8 小时' }
    ];
    if (highRisk) {
      base[2].detail = '有氧 20-25 min（低强度，需监护）';
      base[5].detail = '有氧 25-30 min（低强度）+ 拉伸 15 min';
    }
    return base;
  }

  /* ============ 页面渲染 ============ */
  Pages.plan = async function () {
    const p = AppState.patient || {};
    const a = AppState.assessment || {};
    if (!p.name) {
      return `<div class="alert alert-warning"><div><strong>请先完成患者首诊登记</strong>
        <a href="#/patient" class="btn btn-primary btn-sm mt-2">前往首诊登记 →</a></div></div>`;
    }
    if (!a.height || !a.weight) {
      return `${patientBar()}<div class="alert alert-warning"><div><strong>请先完成综合评估</strong>
        <p style="margin:6px 0 0;">智能方案依赖身高、体重、静息心率等评估数据。</p>
        <a href="#/assessment" class="btn btn-primary btn-sm mt-2">前往综合评估 →</a></div></div>`;
    }

    const plan = await buildPlan();
    AppState.plan = plan;

    const wrap = U.el(`<div>
      ${patientBar()}
      <div class="card mb-3 no-print">
        <div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;font-size:16px;">智能干预方案已生成</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
              生成时间：${U.fmtDate(plan.generatedAt, true)} · 依据 ${U.esc(p.name)} 最新评估数据</div>
          </div>
          <button class="btn btn-secondary" id="btn-regen">🔄 基于最新数据重新生成</button>
          <button class="btn btn-primary" id="btn-save-plan">保存方案</button>
          <a href="#/report" class="btn btn-success">生成完整报告 →</a>
        </div>
      </div>
      <div id="plan-body">${renderPlanHTML(plan)}</div>
    </div>`);

    U.qs('#btn-regen', wrap).onclick = async () => {
      const np = await buildPlan();
      AppState.plan = np;
      U.qs('#plan-body', wrap).innerHTML = renderPlanHTML(np);
      bindEdit(U.qs('#plan-body', wrap));
      U.toast('已基于最新评估数据重新生成全套方案', 'success');
    };
    U.qs('#btn-save-plan', wrap).onclick = async () => {
      AppState.trainingPlanHistory = AppState.trainingPlanHistory || [];
      AppState.trainingPlanHistory.push({ savedAt: new Date().toISOString(), summary: {
        calories: plan.nutrition.target, phase: plan.aerobic.currentPhase.name,
        balanceLevel: plan.balance.startLevel
      }});
      await persistPatient();
      U.toast('方案已保存至患者档案', 'success');
    };
    bindEdit(U.qs('#plan-body', wrap));
    bindPatientBar(wrap);
    return wrap;
  };

  /* ============ 方案构建 ============ */
  async function buildPlan() {
    const p = AppState.patient, a = AppState.assessment, s = AppState.lifeSurvey || {};
    const gender = p.gender, age = p.age;
    const w = U.num(a.weight), h = U.num(a.height), rhr = U.num(a.restHR);
    const coef = (CONST.ACTIVITY_LEVELS.find(l => l.key === a.activityLevel) || CONST.ACTIVITY_LEVELS[0]).coef;
    const stage = CONST.WEIGHT_STAGES.find(x => x.key === a.weightStage) || CONST.WEIGHT_STAGES[1];
    const bmr = U.num(a.measuredBMR) || Calc.bmr(gender, w, h, age);
    const tdee = Calc.tdee(bmr, coef);
    const tc = Calc.targetCalories(tdee, stage.deficit, gender, bmr);
    const macros = Calc.macros(w, tc.target);
    const meals = Calc.mealSplit(tc.target, macros);
    const risk = Calc.exerciseRisk(a, p);

    // 有氧阶段判定
    const freqMap = { none: 0, weekly1: 0, weekly3: 1, weekly5: 2 };
    let phaseIdx = freqMap[p.exerciseFreq] !== undefined ? freqMap[p.exerciseFreq] : 0;
    if (risk.level === 'high') phaseIdx = 0;
    const phase = CONST.AEROBIC_PHASES[phaseIdx];
    const hrZones = CONST.AEROBIC_PHASES.map(ph => ({
      name: ph.name,
      zone: Calc.karvonen(age, rhr, ph.intensityPct[0], ph.intensityPct[1])
    }));

    const strengthSum = getLatestStrengthSummary();
    const hasIso = (AppState.isokineticData || []).length > 0;
    const hasIto = (AppState.isotonicData || []).length > 0;

    const [resistance, balance, flexibilityList] = await Promise.all([
      bodyweightProgram(strengthSum, a),
      balancePrescription(p, s, a),
      getPlanExercises('flexibility')
    ]);

    return {
      generatedAt: new Date().toISOString(),
      nutrition: { bmr, tdee, coef, stage, target: tc.target, deficit: tc.actualDeficit,
        limited: tc.limited, limitReason: tc.limitReason, macros, meals,
        weeklyLoss: Calc.weeklyLoss(tc.actualDeficit) },
      aerobic: { phases: CONST.AEROBIC_PHASES, currentPhase: phase, currentIndex: phaseIdx,
        hrZones, ranking: aerobicRanking(p, a), risk },
      resistance,
      flexibility: { exercises: flexibilityList.length ? flexibilityList : DIAGRAMS.FLEX, frequency: '每周 2-3 次（建议运动后进行）',
        duration: '总时长 15-30 分钟', principle: '静态拉伸每个动作保持 30 秒，至轻微牵拉感（不痛），每侧重复 2 次，全程正常呼吸不憋气。' },
      balance,
      schedule: weekSchedule(risk.level, phase, 2, 2),
      strength: { summary: strengthSum, hasIso, hasIto,
        isoProgram: hasIso ? deviceProgram(Calc.isokineticScore(latest(AppState.isokineticData), p.gender), 'isokinetic') : null,
        itoProgram: hasIto ? deviceProgram(Calc.isotonicScore(latest(AppState.isotonicData), p.gender, w), 'isotonic') : null }
    };
  }
  function latest(arr) {
    return [...arr].sort((x, y) => new Date(y.testDate) - new Date(x.testDate))[0];
  }
  window.buildPlan = buildPlan;

  /* ============ 方案 HTML ============ */
  function renderPlanHTML(plan) {
    const n = plan.nutrition;
    const p = AppState.patient;

    return `
      <!-- 一、饮食方案 -->
      <div class="card">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🥗</span>一、个性化饮食方案</h3>
          <button class="btn btn-ghost btn-sm no-print" data-edit="nutrition">✎ 编辑</button></div>
        <div class="card-body">
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
            <div style="width:150px;flex-shrink:0;">${DIAGRAMS.BANNERS.nutrition}</div>
            <div style="flex:1;min-width:260px;">
              <div class="grid-3">
                ${miniStat('每日目标摄入', n.target, 'kcal')}
                ${miniStat('每日热量缺口', n.deficit, 'kcal')}
                ${miniStat('预期减重速度', n.weeklyLoss, 'kg/周')}
              </div>
            </div>
          </div>
          ${n.limited ? `<div class="alert alert-warning"><div><strong>热量安全下限保护</strong>
            <p style="margin:6px 0 0;font-size:13.5px;">${U.esc(n.limitReason)}</p></div></div>` : ''}

          <div class="grid-2 mt-3" style="align-items:start;">
            <div>
              <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">宏量营养素三色比例</div>
              ${macroPie(n.macros)}
            </div>
            <div>
              <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">每日营养素目标</div>
              <div class="table-wrap"><table>
                <tbody>
                  <tr><td>蛋白质</td><td><strong>${n.macros.proteinG} g</strong></td><td>${n.macros.proteinKcal} kcal（${n.macros.proteinPct}%）</td></tr>
                  <tr><td>脂肪</td><td><strong>${n.macros.fatG} g</strong></td><td>${n.macros.fatKcal} kcal（${n.macros.fatPct}%）</td></tr>
                  <tr><td>碳水化合物</td><td><strong>${n.macros.carbG} g</strong></td><td>${n.macros.carbKcal} kcal（${n.macros.carbPct}%）</td></tr>
                  <tr><td>膳食纤维</td><td colspan="2"><strong>${n.macros.fiberG} g/日</strong>（全谷物、蔬菜、豆类）</td></tr>
                  <tr><td>食盐</td><td colspan="2"><strong>${n.macros.saltG} g/日</strong>（含酱油、味精等隐形盐）</td></tr>
                  <tr><td>添加糖</td><td colspan="2"><strong>${n.macros.addedSugarG} g/日</strong>，最好控制在 &lt;10g</td></tr>
                  <tr><td>每日饮水</td><td colspan="2"><strong>${n.macros.waterMl} ml</strong>（30ml/kg 体重）</td></tr>
                </tbody></table></div>
            </div>
          </div>

          <div class="mt-3">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">三餐热量分配（3:4:3）</div>
            <div class="grid-3">
              ${n.meals.map(m => `
                <div style="border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--card-bg);">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <strong style="font-size:15px;">${m.name}</strong>
                    <span class="badge badge-primary">${m.kcal} kcal</span></div>
                  <div style="font-size:12.5px;color:var(--text-muted);margin-bottom:10px;">建议时间 ${m.time}</div>
                  <div style="display:flex;gap:10px;font-size:12.5px;flex-wrap:wrap;">
                    <span>蛋白 <strong>${m.protein}g</strong></span>
                    <span>脂肪 <strong>${m.fat}g</strong></span>
                    <span>碳水 <strong>${m.carb}g</strong></span></div>
                  <div style="font-size:12.5px;color:var(--text-secondary);margin-top:10px;line-height:1.7;
                    padding-top:10px;border-top:1px dashed var(--border);">${m.tip}</div>
                </div>`).join('')}
            </div>
          </div>

          <div class="mt-3" style="padding:18px;background:var(--bg-secondary);border-radius:14px;">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">标准化进餐行为指导</div>
            <div class="grid-2">
              <ul style="margin:0;padding-left:20px;font-size:13.2px;line-height:2;color:var(--text-secondary);">
                <li><strong>进餐顺序：</strong>汤/水 → 蔬菜 → 蛋白质 → 主食（可降低餐后血糖峰值 20-30%）</li>
                <li><strong>进餐时长：</strong>每餐 ≥20 分钟，每口咀嚼 20 次以上</li>
                <li><strong>餐具选择：</strong>使用小号餐盘（直径 ≤23cm）与小勺，视觉控量</li>
                <li><strong>专注进食：</strong>不看手机、不看电视，避免无意识过量摄入</li>
              </ul>
              <ul style="margin:0;padding-left:20px;font-size:13.2px;line-height:2;color:var(--text-secondary);">
                <li><strong>餐前饮水：</strong>餐前 30 分钟饮水 300ml，增加饱腹感</li>
                <li><strong>七分饱原则：</strong>感觉"不饿了但还能吃一点"时停止</li>
                <li><strong>晚餐时间：</strong>睡前 3 小时完成进食，避免夜间脂肪合成</li>
                <li><strong>外食策略：</strong>过水去油、主食减半、备注少油少盐</li>
              </ul>
            </div>
          </div>

          <div class="mt-3">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">食物红绿灯分类表</div>
            <div class="table-wrap"><table class="traffic-light-table">
              <thead><tr><th style="width:11%;">类别</th>
                <th style="width:30%;"><span class="light-green">🟢 绿灯 · 鼓励</span></th>
                <th style="width:29%;"><span class="light-yellow">🟡 黄灯 · 适量</span></th>
                <th style="width:30%;"><span class="light-red">🔴 红灯 · 限制</span></th></tr></thead>
              <tbody>${CONST.FOOD_TRAFFIC.map(f => `<tr>
                <td><strong>${f.category}</strong></td>
                <td style="font-size:12.8px;line-height:1.8;">${f.green}</td>
                <td style="font-size:12.8px;line-height:1.8;">${f.yellow}</td>
                <td style="font-size:12.8px;line-height:1.8;">${f.red}</td></tr>`).join('')}</tbody>
            </table></div>
          </div>
        </div>
      </div>

      <!-- 二、有氧训练 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏃</span>二、有氧训练方案（FITT-VP 三阶段）</h3>
          <span class="badge badge-primary">当前起始：${plan.aerobic.currentPhase.name}</span></div>
        <div class="card-body">
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:18px;">
            <div style="width:150px;flex-shrink:0;">${DIAGRAMS.BANNERS.aerobic}</div>
            <div style="flex:1;min-width:260px;">
              <div class="alert alert-${plan.aerobic.risk.level === 'high' ? 'danger' : (plan.aerobic.risk.level === 'medium' ? 'warning' : 'success')}" style="margin:0;">
                <div><strong>运动风险等级：${plan.aerobic.risk.label}</strong>
                <p style="margin:6px 0 0;font-size:13.3px;line-height:1.8;">${U.esc(plan.aerobic.risk.advice)}</p></div>
              </div>
            </div>
          </div>

          <div class="table-wrap"><table>
            <thead><tr><th>阶段</th><th>周期</th><th>频率</th><th>单次时长</th><th>强度（%HRR）</th>
              <th>目标心率</th><th>RPE</th><th>周总量</th></tr></thead>
            <tbody>${plan.aerobic.phases.map((ph, i) => {
              const z = plan.aerobic.hrZones[i].zone;
              const cur = i === plan.aerobic.currentIndex;
              return `<tr style="${cur ? 'background:rgba(242,101,34,0.07);' : ''}">
                <td><strong>${ph.name}</strong>${cur ? ' <span class="badge badge-primary">起始</span>' : ''}</td>
                <td>${ph.weeks}</td><td>${ph.frequency}</td><td>${ph.duration}</td>
                <td>${Math.round(ph.intensityPct[0] * 100)}-${Math.round(ph.intensityPct[1] * 100)}%</td>
                <td><strong>${z ? z.low + '-' + z.high : '—'}</strong> bpm</td>
                <td>${ph.rpe}</td><td>${ph.weeklyTotal}</td></tr>`;
            }).join('')}</tbody>
          </table></div>

          <div class="grid-3 mt-3">
            ${plan.aerobic.phases.map((ph, i) => `
              <div style="border:1px solid var(--border);border-radius:14px;padding:16px;
                ${i === plan.aerobic.currentIndex ? 'border-color:var(--primary);border-width:2px;' : ''}">
                <div style="font-weight:700;font-size:14.5px;margin-bottom:8px;">${ph.name} · ${ph.weeks}</div>
                <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
                  <div><strong>阶段目标：</strong>${ph.goal}</div>
                  <div style="margin-top:6px;"><strong>执行要点：</strong>${ph.note}</div></div>
              </div>`).join('')}
          </div>

          <div class="mt-3" style="padding:18px;background:var(--bg-secondary);border-radius:14px;">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:10px;">完整训练流程</div>
            <div style="display:flex;gap:10px;align-items:stretch;flex-wrap:wrap;">
              ${[['热身', '5-10 min', '关节活动 + 低强度快走，心率逐步提升至目标区间下限'],
                 ['主体训练', '20-60 min', '维持目标心率区间，可用"能说话但不能唱歌"判断强度'],
                 ['放松拉伸', '5-10 min', '低强度活动降心率 + 静态拉伸主要肌群']].map((x, i) => `
                <div style="flex:1;min-width:180px;border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--card-bg);">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${i + 1}</div>
                    <strong style="font-size:13.5px;">${x[0]}</strong>
                    <span class="badge badge-info">${x[1]}</span></div>
                  <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;">${x[2]}</div>
                </div>`).join('')}
            </div>
          </div>

          <div class="mt-3">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:8px;">有氧运动方式优先级排序（护膝护腰原则）</div>
            <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;line-height:1.7;">${U.esc(plan.aerobic.ranking.reason)}</p>
            <div class="table-wrap"><table>
              <thead><tr><th style="width:6%;">序</th><th style="width:18%;">运动方式</th><th style="width:12%;">关节冲击</th>
                <th style="width:16%;">能耗参考</th><th>适配说明</th><th style="width:10%;">推荐度</th></tr></thead>
              <tbody>${plan.aerobic.ranking.list.map((x, i) => `<tr>
                <td>${i + 1}</td><td><strong>${x.name}</strong></td><td>${x.impact}</td>
                <td>${x.kcal}</td><td style="font-size:12.8px;line-height:1.7;">${x.desc}</td>
                <td>${x.blocked ? '<span class="badge badge-danger">暂缓</span>'
                  : (x.recommended ? '<span class="badge badge-success">推荐</span>' : '<span class="badge badge-warning">可选</span>')}</td>
              </tr>`).join('')}</tbody>
            </table></div>
          </div>
        </div>
      </div>

      <!-- 三、抗阻训练 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">💪</span>三、基础抗阻训练方案（徒手 / 哑铃 / 杠铃）</h3>
          <span class="badge badge-primary">${plan.resistance.phase.name}</span></div>
        <div class="card-body">
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:18px;">
            <div style="width:150px;flex-shrink:0;">${DIAGRAMS.BANNERS.resistance}</div>
            <div style="flex:1;min-width:260px;">
              <p style="font-size:13.5px;line-height:1.85;color:var(--text-secondary);margin:0 0 10px;">${U.esc(plan.resistance.note)}</p>
              <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:13px;">
                <span class="badge badge-info">频率 ${plan.resistance.phase.frequency}</span>
                <span class="badge badge-info">强度 ${plan.resistance.phase.intensity}</span>
                <span class="badge badge-info">${plan.resistance.phase.reps} × ${plan.resistance.phase.sets}</span>
                <span class="badge badge-info">组间休息 ${plan.resistance.phase.rest}</span>
              </div>
            </div>
          </div>

          <div class="table-wrap mb-3"><table>
            <thead><tr><th>训练阶段</th><th>频率</th><th>强度</th><th>次数</th><th>组数</th><th>组间休息</th><th>阶段重点</th></tr></thead>
            <tbody>${CONST.RESISTANCE_PHASES.map((r, i) => `<tr style="${i === plan.resistance.phaseIndex ? 'background:rgba(242,101,34,0.07);' : ''}">
              <td><strong>${r.name}</strong>${i === plan.resistance.phaseIndex ? ' <span class="badge badge-primary">当前</span>' : ''}</td>
              <td>${r.frequency}</td><td>${r.intensity}</td><td>${r.reps}</td><td>${r.sets}</td><td>${r.rest}</td>
              <td style="font-size:12.8px;">${r.focus}</td></tr>`).join('')}</tbody>
          </table></div>

          <div style="font-weight:700;font-size:14.5px;margin-bottom:12px;">${plan.resistance.exercises.length} 套标准基础动作（含动作示意图）</div>
          <div class="grid-3">
            ${plan.resistance.exercises.map((ex, i) => exerciseCard(ex, i + 1, 'resist')).join('')}
          </div>
        </div>
      </div>

      <!-- 四、柔韧性训练 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧘</span>四、柔韧性训练方案（9 组标准拉伸序列 · 含示意图）</h3></div>
        <div class="card-body">
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:18px;">
            <div style="width:150px;flex-shrink:0;">${DIAGRAMS.BANNERS.flexibility}</div>
            <div style="flex:1;min-width:260px;">
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                <span class="badge badge-success">频率 ${plan.flexibility.frequency}</span>
                <span class="badge badge-success">${plan.flexibility.duration}</span>
              </div>
              <p style="font-size:13.5px;line-height:1.85;color:var(--text-secondary);margin:0;">
                <strong>执行原则：</strong>${U.esc(plan.flexibility.principle)}</p>
            </div>
          </div>
          <div class="grid-3">
            ${plan.flexibility.exercises.map((ex, i) => `
              <div class="card" style="margin:0;">
                <div class="card-body" style="padding:16px;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:var(--success);color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i + 1}</div>
                    <strong style="font-size:14px;">${ex.name}</strong></div>
                  <div class="exercise-diagram">${ex.svg}</div>
                  <div style="font-size:12.5px;line-height:1.8;color:var(--text-secondary);margin-top:10px;">
                    <div><strong style="color:var(--primary);">目标肌群：</strong>${ex.target}</div>
                    <div style="margin-top:4px;"><strong style="color:var(--primary);">时长组数：</strong>${ex.duration}</div>
                    <div style="margin-top:6px;padding-top:8px;border-top:1px dashed var(--border);">
                      <strong>动作要领：</strong>${ex.key}</div>
                    <div style="margin-top:6px;color:var(--danger);"><strong>注意：</strong>${ex.caution}</div>
                  </div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- 五、平衡功能训练 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🤸</span>五、平衡功能训练方案（含示意图）</h3>
          <span class="badge badge-primary">起始等级 L${plan.balance.startLevel}</span></div>
        <div class="card-body">
          <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:18px;">
            <div style="width:150px;flex-shrink:0;">${DIAGRAMS.BANNERS.balance}</div>
            <div style="flex:1;min-width:260px;">
              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
                <span class="badge badge-primary">频率 ${plan.balance.frequency}</span>
                <span class="badge badge-primary">${plan.balance.duration}</span>
                <span class="badge badge-info">开放等级 L1-L${plan.balance.maxLevel}</span>
              </div>
              <p style="font-size:13.5px;line-height:1.85;color:var(--text-secondary);margin:0 0 8px;">${U.esc(plan.balance.benefit)}</p>
              ${plan.balance.reasons.length ? `<div style="font-size:12.8px;color:var(--text-muted);">
                <strong>分级依据：</strong>${plan.balance.reasons.map(r => `<span class="badge badge-warning" style="margin:2px 4px 0 0;">${U.esc(r)}</span>`).join('')}
              </div>` : ''}
            </div>
          </div>

          <div class="alert alert-info">
            <div><strong>进阶与回退规则</strong>
            <p style="margin:6px 0 0;font-size:13.3px;line-height:1.8;">${U.esc(plan.balance.progressRule)}</p></div>
          </div>

          <div class="grid-3 mt-3">
            ${plan.balance.exercises.map(ex => `
              <div class="card" style="margin:0;${ex.level > plan.balance.startLevel ? 'opacity:.85;' : ''}">
                <div class="card-body" style="padding:16px;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                    <span class="badge ${ex.level <= plan.balance.startLevel ? 'badge-primary' : 'badge-info'}">L${ex.level} ${ex.levelText}</span>
                    <strong style="font-size:14px;">${ex.name}</strong></div>
                  <div class="exercise-diagram">${ex.svg}</div>
                  <div style="font-size:12.5px;line-height:1.8;color:var(--text-secondary);margin-top:10px;">
                    <div><strong style="color:var(--primary);">训练目标：</strong>${ex.target}</div>
                    <div style="margin-top:4px;"><strong style="color:var(--primary);">建议剂量：</strong>${ex.duration}</div>
                    <div style="margin-top:6px;padding-top:8px;border-top:1px dashed var(--border);">
                      <strong>动作要领：</strong>${ex.key}</div>
                    <div style="margin-top:6px;"><strong>进阶标准：</strong>${ex.progress}</div>
                    <div style="margin-top:6px;color:var(--danger);"><strong>安全：</strong>${ex.safety}</div>
                  </div>
                </div>
              </div>`).join('')}
          </div>

          <div class="mt-3" style="padding:18px;background:var(--bg-secondary);border-radius:14px;">
            <div style="font-weight:700;font-size:14.5px;margin-bottom:10px;">平衡训练安全须知</div>
            <ul style="margin:0;padding-left:20px;font-size:13.2px;line-height:2;color:var(--text-secondary);">
              ${plan.balance.safety.map(s => `<li>${U.esc(s)}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <!-- 六、周训练日程 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📅</span>六、7 天周训练日程表</h3></div>
        <div class="card-body">
          <div class="week-schedule">
            ${plan.schedule.map(d => `
              <div class="day-cell">
                <div class="day-name">${d.day}</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-bottom:8px;">
                  ${d.tags.map(([c, t]) => `<span class="day-tag ${c}">${t}</span>`).join('')}
                </div>
                <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;">${d.detail}</div>
              </div>`).join('')}
          </div>
          <div class="mt-3" style="display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--text-muted);">
            <span><span class="day-tag aerobic">有氧</span> 心肺耐力与脂肪氧化</span>
            <span><span class="day-tag resistance">抗阻</span> 保护瘦体重与基础代谢</span>
            <span><span class="day-tag balance">平衡</span> 姿势控制与跌倒预防</span>
            <span><span class="day-tag flexibility">拉伸</span> 柔韧性与恢复</span>
            <span><span class="day-tag rest">休息</span> 超量恢复必要环节</span>
          </div>
        </div>
      </div>

      <!-- 七、肌力专项方案 -->
      ${renderStrengthPrograms(plan)}

      <!-- 八、复评计划 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🔁</span>八、减重复评计划</h3></div>
        <div class="card-body">
          <div class="table-wrap"><table>
            <thead><tr><th style="width:16%;">复评节点</th><th>复评内容</th></tr></thead>
            <tbody>${CONST.FOLLOWUP_PLAN.map(f => `<tr>
              <td><strong>${f.time}</strong></td><td style="font-size:13.2px;line-height:1.8;">${f.items}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
  }
  window.renderPlanHTML = renderPlanHTML;

  /* 肌力专项方案区块 */
  function renderStrengthPrograms(plan) {
    const s = plan.strength;
    let html = `<div class="card mt-3">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">⚙️</span>七、鹊动设备专项肌力训练方案</h3></div>
      <div class="card-body">`;

    if (!s.hasIso && !s.hasIto) {
      html += `<div class="alert alert-warning"><div><strong>暂未录入肌力测评数据</strong>
        <p style="margin:6px 0 0;font-size:13.5px;line-height:1.8;">
        鹊动设备专项训练方案为数据驱动生成，需先完成等速或等张肌力测评。
        当前已为您生成上方通用徒手抗阻训练方案，可正常执行。</p>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;">
          <a href="#/isokinetic" class="btn btn-primary btn-sm">录入等速肌力数据 →</a>
          <a href="#/isotonic" class="btn btn-primary btn-sm">录入等张肌力数据 →</a>
        </div></div></div>`;
    } else {
      if (s.hasIso && s.isoProgram) html += programBlock(s.isoProgram, '等速肌力专项方案', 'isokinetic');
      else html += `<div class="alert alert-info"><div><strong>等速肌力专项方案未生成</strong>
        <p style="margin:6px 0 0;font-size:13.5px;">未检测到等速肌力测评数据，该板块已按业务规则隐藏。
        <a href="#/isokinetic">前往录入 →</a></p></div></div>`;

      if (s.hasIto && s.itoProgram) html += `<div class="mt-3">${programBlock(s.itoProgram, '等张肌力专项方案', 'isotonic')}</div>`;
      else html += `<div class="alert alert-info mt-3"><div><strong>等张肌力专项方案未生成</strong>
        <p style="margin:6px 0 0;font-size:13.5px;">未检测到等张肌力测评数据，该板块已按业务规则隐藏。
        <a href="#/isotonic">前往录入 →</a></p></div></div>`;
    }
    html += `</div></div>`;
    return html;
  }

  function programBlock(prog, title, type) {
    return `
      <div style="border:2px solid var(--primary);border-radius:16px;padding:20px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
          <strong style="font-size:16px;">${title}</strong>
          <span class="badge badge-primary">${prog.frequency}</span>
          <span class="badge badge-info">${prog.cycle}</span>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th style="width:12%;">设备</th><th style="width:16%;">训练单元</th><th style="width:24%;">匹配依据</th>
            <th style="width:11%;">负荷强度</th><th style="width:9%;">次数</th><th style="width:11%;">组数</th>
            <th style="width:8%;">间歇</th><th>执行提示</th></tr></thead>
          <tbody>${prog.picks.map(x => `<tr>
            <td><strong>${x.device.id} 号机</strong></td>
            <td>${x.device.short}<div style="font-size:11.5px;color:var(--text-muted);">${x.device.muscles.split('、').slice(0, 2).join('、')}</div></td>
            <td style="font-size:12.5px;line-height:1.7;">${U.esc(x.reason)}</td>
            <td>${x.dose.load}</td><td>${x.dose.reps}</td><td>${x.dose.sets}</td><td>${x.dose.rest}</td>
            <td style="font-size:12.3px;line-height:1.7;">${U.esc(x.dose.note || '标准执行')}</td></tr>`).join('')}</tbody>
        </table></div>

        <div class="grid-3 mt-3">
          ${prog.picks.slice(0, 6).map(x => `
            <div class="device-card" style="margin:0;">
              <img src="${x.device.img}" alt="${U.esc(x.device.name)}" onerror="this.style.display='none'">
              <div class="device-info" style="padding:12px;">
                <div class="device-name" style="font-size:13.5px;">${x.device.id} 号机 · ${x.device.short}</div>
                <div class="device-meta" style="font-size:11.5px;margin-top:6px;">${x.device.track}</div>
              </div>
            </div>`).join('')}
        </div>

        <div class="mt-3" style="padding:16px;background:var(--bg-secondary);border-radius:12px;">
          <div style="font-weight:700;font-size:13.8px;margin-bottom:8px;">设备训练安全提示</div>
          <ul style="margin:0;padding-left:20px;font-size:12.8px;line-height:1.95;color:var(--text-secondary);">
            ${prog.safety.map(s => `<li>${U.esc(s)}</li>`).join('')}
          </ul>
        </div>
      </div>`;
  }
  window.programBlock = programBlock;

  /* 动作卡片 */
  function exerciseCard(ex, idx, kind) {
    return `<div class="card" style="margin:0;">
      <div class="card-body" style="padding:16px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:#fff;
            display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${idx}</div>
          <strong style="font-size:14px;">${ex.name}</strong></div>
        <div class="exercise-diagram">${ex.svg}</div>
        <div style="font-size:12.5px;line-height:1.8;color:var(--text-secondary);margin-top:10px;">
          <div><strong style="color:var(--primary);">目标肌群：</strong>${ex.target}</div>
          <div style="margin-top:4px;"><strong style="color:var(--primary);">训练剂量：</strong>${ex.dose || ex.duration}</div>
          <div style="margin-top:6px;padding-top:8px;border-top:1px dashed var(--border);">
            <strong>动作要领：</strong>${ex.key}</div>
          ${ex.caution ? `<div style="margin-top:6px;color:var(--danger);"><strong>注意：</strong>${ex.caution}</div>` : ''}
        </div>
      </div>
    </div>`;
  }

  function miniStat(label, value, unit) {
    return `<div class="stat-card" style="padding:16px;">
      <div class="stat-value" style="font-size:24px;">${value === null ? '—' : value}
        <span style="font-size:12px;color:var(--text-muted);font-weight:500;">${unit}</span></div>
      <div class="stat-label">${label}</div></div>`;
  }

  function macroPie(m) {
    const total = m.proteinPct + m.fatPct + m.carbPct;
    const segs = [
      { pct: m.proteinPct, color: '#f26522', name: '蛋白质', grams: m.proteinG, kcal: m.proteinKcal },
      { pct: m.fatPct, color: '#f59e0b', name: '脂肪', grams: m.fatG, kcal: m.fatKcal },
      { pct: m.carbPct, color: '#22c55e', name: '碳水化合物', grams: m.carbG, kcal: m.carbKcal }
    ];
    const r = 70, innerR = 40, cx = 80, cy = 100;
    const rad = d => d * Math.PI / 180;

    // 饼图扇区（甜甜圈）
    let acc = 0;
    const arcs = segs.map(s => {
      const a0 = acc / total * 360 - 90; acc += s.pct;
      const a1 = acc / total * 360 - 90;
      const r0 = rad(a0), r1 = rad(a1);
      const x0o = cx + r * Math.cos(r0), y0o = cy + r * Math.sin(r0);
      const x1o = cx + r * Math.cos(r1), y1o = cy + r * Math.sin(r1);
      const x0i = cx + innerR * Math.cos(r0), y0i = cy + innerR * Math.sin(r0);
      const x1i = cx + innerR * Math.cos(r1), y1i = cy + innerR * Math.sin(r1);
      const large = (a1 - a0) > 180 ? 1 : 0;
      return `<path d="M${x0o.toFixed(2)},${y0o.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1o.toFixed(2)},${y1o.toFixed(2)} L${x1i.toFixed(2)},${y1i.toFixed(2)} A${innerR},${innerR} 0 ${large} 0 ${x0i.toFixed(2)},${y0i.toFixed(2)} Z" fill="${s.color}" opacity="0.92"/>`;
    }).join('');

    // 右侧图例：名称/百分比/克数/热量，彻底避免标签重叠
    const legend = segs.map((s, i) => {
      const y = 48 + i * 48;
      return `
        <g transform="translate(170, ${y})">
          <circle cx="10" cy="0" r="8" fill="${s.color}" opacity="0.92"/>
          <text x="28" y="-2" font-size="13" font-weight="700" fill="var(--text-primary)">${s.name} ${s.pct}%</text>
          <text x="28" y="16" font-size="11" fill="var(--text-muted)">${s.grams} g / ${s.kcal} kcal</text>
        </g>
      `;
    }).join('');

    return `<div class="macro-pie-wrap">
      <svg viewBox="0 0 320 200" class="macro-pie-svg">
        ${arcs}
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="var(--card-bg)"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text-primary)">宏量</text>
        <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="12" fill="var(--text-muted)">营养素</text>
        ${legend}
      </svg>
    </div>`;
  }

  /* 方案卡片在线编辑 */
  function bindEdit(root) {
    U.qsa('[data-edit]', root).forEach(btn => {
      btn.onclick = () => {
        const key = btn.dataset.edit;
        if (key === 'nutrition') {
          const n = AppState.plan.nutrition;
          U.modal({
            title: '编辑饮食方案参数',
            body: `<div class="form-row" style="grid-template-columns:1fr 1fr;">
              <div class="form-group"><label>每日目标摄入 kcal</label>
                <input type="number" id="edit-target" value="${n.target}"></div>
              <div class="form-group"><label>蛋白质系数 g/kg</label>
                <input type="number" step="0.1" id="edit-pro" value="1.2"></div>
            </div>
            <div class="alert alert-warning" style="margin:8px 0 0;"><div>
            <p style="margin:0;font-size:13px;">手动调整后将覆盖系统自动计算结果，请确保不低于安全下限。</p></div></div>`,
            footer: `<button class="btn btn-secondary" data-a="c">取消</button><button class="btn btn-primary" data-a="s">保存修改</button>`,
            onMount(ov, close) {
              ov.querySelector('[data-a="c"]').onclick = close;
              ov.querySelector('[data-a="s"]').onclick = () => {
                const t = U.num(ov.querySelector('#edit-target').value);
                const pc = U.num(ov.querySelector('#edit-pro').value, 1.2);
                const w = U.num(AppState.assessment.weight);
                if (!t) return U.toast('请输入有效热量值', 'warning');
                const macros = Calc.macros(w, t);
                macros.proteinG = Math.round(w * pc);
                macros.proteinKcal = macros.proteinG * 4;
                macros.proteinPct = U.round(macros.proteinKcal / t * 100, 1);
                macros.carbKcal = Math.max(0, t - macros.proteinKcal - macros.fatKcal);
                macros.carbG = Math.round(macros.carbKcal / 4);
                macros.carbPct = U.round(macros.carbKcal / t * 100, 1);
                AppState.plan.nutrition.target = t;
                AppState.plan.nutrition.macros = macros;
                AppState.plan.nutrition.meals = Calc.mealSplit(t, macros);
                AppState.plan.nutrition.edited = true;
                U.qs('#plan-body').innerHTML = renderPlanHTML(AppState.plan);
                bindEdit(U.qs('#plan-body'));
                close();
                U.toast('饮食方案已更新', 'success');
              };
            }
          });
        }
      };
    });
  }
})();
