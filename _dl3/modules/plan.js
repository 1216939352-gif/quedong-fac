/**
 * 智能营养与运动方案生成模块
 * 饮食处方 / 有氧 FITT-VP / 抗阻 / 柔韧（配图）/ 平衡功能训练（配图）/ 周日程 / 设备专项方案
 */
(function () {

  /* 构造供 AI 解读 / AI 方案推荐的上下文（患者 + 评估 + 当前方案摘要） */
  function buildAIContext() {
    const p = AppState.patient || {};
    const a = AppState.assessment || {};
    const plan = AppState.plan || {};
    return {
      module: 'weight-management',
      patient: { name: p.name, age: p.age, gender: p.gender, height: a.height, weight: a.weight },
      assessment: {
        bmi: plan.bmi,
        bmr: plan.bmr,
        restingHr: a.restingHr,
        waist: a.waist,
        hip: a.hip,
        bloodPressure: a.bloodPressure,
        medicalHistory: Array.isArray(a.medicalHistory) ? a.medicalHistory : []
      },
      planSummary: {
        targetCalories: plan.nutrition && plan.nutrition.target,
        aerobicPhase: plan.aerobic && plan.aerobic.currentPhase && plan.aerobic.currentPhase.name,
        balanceLevel: plan.balance && plan.balance.startLevel,
        resistanceFocus: plan.resistance && plan.resistance.focus,
        flexibilityFocus: plan.flexibility && plan.flexibility.focus,
        weeklyScheduleDays: Array.isArray(plan.weeklySchedule) ? plan.weeklySchedule.length : 0
      },
      fullPlan: plan
    };
  }

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
    // 排除 StrengthLib 器械动作库（32 个，已在「器械 1RM 自动配重」专区按文档算法匹配），避免与基础抗阻区重复
    const baseList = resistList.filter(x => !x.isStrengthLib);
    const source = baseList.length ? baseList : DIAGRAMS.RESIST;

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

  /* ============ 器械 1RM 自动配重训练方案（文档1算法） ============ */
  // 依据等张次极限测试（W/R）经 Brzycki 公式反推 1RM，再按训练目标百分比自动配重；
  // 同时输出弹力带等效档位与安全限制规则。无肌力数据则返回 null（页面隐藏该板块）。
  async function device1RMProgram(strengthSummary, patient, assessment, isotonicRec) {
    if (!window.StrengthLib || !StrengthLib.recommend) return null;
    const gender = patient.gender;
    const w = U.num(assessment.weight), h = U.num(assessment.height);
    const bmi = (w && h) ? Calc.bmi(w, h) : null;

    // 训练目标：依据体重管理方向
    const stage = assessment.weightStage;
    let goalKey = 'hypertrophy';
    if (stage === 'lose') goalKey = 'fatloss';
    else if (stage === 'maintain') goalKey = 'maintain';
    else if (stage === 'gain') goalKey = 'hypertrophy';

    // 1RM 来源：等张次极限测试（W/R）优先用于 Brzycki 反推；否则用肌力综合评分已算 1RM
    let oneRM = null, W = null, R = null;
    if (isotonicRec) {
      const lo = U.num(isotonicRec.loadL != null ? isotonicRec.loadL : isotonicRec.load);
      const ro = U.num(isotonicRec.repsL != null ? isotonicRec.repsL : isotonicRec.reps);
      const hi = U.num(isotonicRec.loadR != null ? isotonicRec.loadR : lo);
      const ho = U.num(isotonicRec.repsR != null ? isotonicRec.repsR : ro);
      const WL = (lo != null && hi != null) ? (lo + hi) / 2 : (lo != null ? lo : null);
      const RL = (ro != null && ho != null) ? (ro + ho) / 2 : (ro != null ? ro : null);
      if (WL != null && RL != null && RL >= 6 && RL <= 12) { W = Math.round(WL * 100) / 100; R = Math.round(RL); }
    }
    if (oneRM == null && strengthSummary && strengthSummary.metrics) oneRM = U.num(strengthSummary.metrics.oneRM);
    if (oneRM == null && W == null) return null; // 无肌力数据则不生成器械 1RM 方案

    // 训练基础 / 安全标记
    const hasData = !!(strengthSummary && strengthSummary.total != null);
    const age = U.num(patient.age);
    const trainingBase = !hasData ? 'zero' : 'beginner';
    const heavyFat = bmi != null && bmi >= 28;
    const oldInjury = patient.jointIssue && patient.jointIssue !== 'none';

    const prog = StrengthLib.recommend({
      goalKey, equips: ['dumbbell', 'barbell', 'band'],
      oneRM, W, R, trainingBase, heavyFat, oldInjury, gender
    });
    if (!prog) return null;
    prog.goalKey = goalKey;
    prog.bmi = bmi;
    prog.sourceNote = W != null
      ? `依据等张次极限测试（负荷 ${W}kg × ${R} 次）经 Brzycki 公式反推 1RM ${prog.oneRM != null ? prog.oneRM : '—'}kg，按训练目标百分比 ${prog.loadPct} 自动配重`
      : (oneRM != null ? `依据肌力测评综合 1RM ${oneRM}kg，按训练目标百分比 ${prog.loadPct} 自动配重` : '');
    return prog;
  }

  function device1RMHTML(prog) {
    if (!prog) return '';
    const parts = (prog.parts || []).map(part => {
      const items = part.items.map(it => window.PlanView ? window.PlanView.itemCard({
        name: it.name,
        device: it.equipLabel + ' 器械',
        img: '', video: '',
        params: { load: it.weight != null ? (it.weight + ' kg') : (it.bandLevel ? (it.bandLevel + ' 弹力带') : '') },
        dose: it.reps + ' 次 × ' + it.sets + ' 组 · 间歇 ' + it.rest,
        types: it.muscle ? ('目标肌群：' + it.muscle) : '',
        steps: it.points || '',
        safety: it.contraindication ? [it.contraindication] : []
      }, { unit: 'sarcopenia', mode: 'pc' }) : '').join('');
      const label = part.items[0] ? part.items[0].equipLabel : '器械';
      return `<div class="mt-3">
        <div style="font-weight:700;font-size:14.5px;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
          <span class="badge badge-secondary">${label}</span>共 ${part.items.length} 个动作</div>
        <div class="grid-3">${items}</div>
      </div>`;
    }).join('');

    return `<div class="card mt-3" style="--ac:#0D9488">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏋️</span>器械 1RM 自动配重训练方案（32 动作库 · Brzycki 公式）</h3>
        <span style="display:flex;gap:8px;align-items:center;">
          <span class="badge badge-primary">${prog.goalLabel}</span>
          <button class="btn btn-ghost btn-sm no-print" data-edit="device1rm-list">✎ 编辑动作</button>
        </span></div>
      <div class="card-body">
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-bottom:16px;">
          <div style="flex:1;min-width:260px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:13px;margin-bottom:10px;">
              <span class="badge badge-info">负荷区间 ${prog.loadPct} 1RM</span>
              ${prog.oneRM != null ? `<span class="badge badge-info">推算 1RM ${prog.oneRM} kg</span>` : ''}
              ${prog.bmi != null ? `<span class="badge badge-info">BMI ${prog.bmi}</span>` : ''}
            </div>
            <p style="font-size:13.3px;line-height:1.8;color:var(--text-secondary);margin:0;">${U.esc(prog.sourceNote)}</p>
          </div>
        </div>
        ${parts}
        <div class="mt-3" style="padding:16px;background:var(--bg-secondary);border-radius:12px;">
          <div style="font-weight:700;font-size:13.8px;margin-bottom:8px;">器械训练安全限制规则</div>
          <ul style="margin:0;padding-left:20px;font-size:12.8px;line-height:1.95;color:var(--text-secondary);">
            ${prog.safety.map(s => `<li>${U.esc(s)}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>`;
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

    // 若已采用 AI 方案（generatedBy==='ai'），不再用规则引擎覆盖，直接以 AI 方案为正式方案
    const plan = (AppState.plan && AppState.plan.generatedBy === 'ai') ? AppState.plan : await buildPlan();
    AppState.plan = plan;

    const ACCENT = '#0ea5a4';
    const wrap = U.el(`<div>
      ${patientBar()}
      <div class="plan-cockpit" style="--ac:${ACCENT}">
        <aside class="plan-rail"><div class="plan-rail-ttl"><span class="dot"></span>方案目录</div><div class="plan-rail-list" id="pl-rail"></div></aside>
        <div class="plan-main">
      <div class="card mb-3 no-print">
        <div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;font-size:16px;">智能干预方案已生成</div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">
              生成时间：${U.fmtDate(plan.generatedAt, true)} · 依据 ${U.esc(p.name)} 最新评估数据</div>
          </div>
          <div class="pm-view-toggle no-print" style="display:flex;align-items:center;gap:6px;padding-right:8px;border-right:1px solid var(--border);">
            <span style="font-size:13px;color:var(--text-muted);">方案视图</span>
            <button class="btn btn-sm btn-primary" id="view-standard">标准版</button>
            <button class="btn btn-sm btn-secondary" id="view-rigorous">严谨版</button>
          </div>
          <button class="btn btn-secondary" id="btn-regen">🔄 基于最新数据重新生成</button>
          <button class="btn btn-info" id="btn-aiimg-batch">🎨 一键为方案内动作配图</button>
          <button class="btn btn-primary" id="btn-save-plan">保存方案</button>
          <button class="btn btn-secondary" id="btn-plan-qr">📲 手机查看</button>
          <button class="btn btn-ai" id="btn-ai-plan"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能方案</button>
        </div>
      </div>
      <div id="plan-body">${renderPlanBody(plan)}</div>
      <div id="plan-ai-panel" style="margin-top:16px;"></div>
      <div class="card mt-3 no-print" id="aiimg-card">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🖼️</span>AI 配图 · 训练动作示意图</h3>
          <span class="badge badge-info" id="aiimg-count">—</span></div>
        <div class="card-body">
          <div class="text-muted" style="font-size:13px;margin-bottom:10px;">此处展示该患者档案内的 AI 生成配图（对话框 🖼️「存入该患者档案」或上方「一键配图」生成）。点击图片可放大查看，悬停右上角 ✕ 可删除。</div>
          <div id="aiimg-gallery"><div class="text-muted">读取中…</div></div>
        </div>
      </div>
        </div>
      </div>
    </div>`);

    var planViewMode = 'standard';
    var bodyEl = U.qs('#plan-body', wrap);
    async function showRigorous() {
      if (!window.PlanEngine) { U.toast('严谨版引擎未加载', 'error'); return; }
      bodyEl.innerHTML = U.skeleton(5, { title: true }); // S5：生成期骨架屏
      var rp = PlanEngine.generate({});
      if (rp.deviceMode === null) {
        var m = await PlanEngine.askDeviceMode();
        rp = PlanEngine.generate({ deviceMode: m });
      }
      bodyEl.innerHTML = PlanEngine.renderHTML(rp);
      buildPlanRail(wrap, '#plan-body');
      mountAIControls();
      U.toast('已生成严谨版方案（PlanEngine v1）', 'success');
    }
    function showStandard() {
      bodyEl.innerHTML = renderPlanBody(plan);
      buildPlanRail(wrap, '#plan-body');
      if (!plan.generatedBy) { bindEdit(bodyEl); bindPlanMedia(bodyEl); }
      mountAIControls();
      wirePlanBodyRevert();
    }
    // 若当前为 AI 采用方案，提供「重新生成系统方案」回退
    function wirePlanBodyRevert() {
      var rb = bodyEl && bodyEl.querySelector('#ai-revert-system');
      if (!rb) return;
      rb.onclick = async function () {
        rb.disabled = true; rb.textContent = '生成中…';
        try {
          var np = await buildPlan();
          AppState.plan = np;
          bodyEl.innerHTML = renderPlanBody(np);
          if (!np.generatedBy) { bindEdit(bodyEl); bindPlanMedia(bodyEl); }
          wirePlanBodyRevert();
          mountAIControls();
          U.toast('已重新生成系统规则方案', 'success');
        } catch (e) { rb.disabled = false; rb.textContent = '↺ 重新生成系统方案'; U.toast('生成失败：' + U.errMsg(e), 'error'); }
      };
    }
    function mountAIControls() {
      const aiEl = U.qs('#plan-ai-panel', wrap);
      if (!aiEl || !window.AIReason) return;
      aiEl.innerHTML = '';
      try {
        // 系统生成的方案容器作为「AI 优先」切换中的「系统生成」一侧
        const systemEl = U.qs('#plan-body', wrap);
        window.AIReason.aiControls(aiEl, buildAIContext(), { systemEl: systemEl });
      }
      catch (e) { console.warn('[plan] AI 控制面板挂载失败', e); }
    }
    U.qs('#view-rigorous', wrap).onclick = async () => {
      U.qs('#view-rigorous', wrap).className = 'btn btn-sm btn-primary';
      U.qs('#view-standard', wrap).className = 'btn btn-sm btn-secondary';
      planViewMode = 'rigorous'; await showRigorous();
    };
    U.qs('#view-standard', wrap).onclick = () => {
      U.qs('#view-standard', wrap).className = 'btn btn-sm btn-primary';
      U.qs('#view-rigorous', wrap).className = 'btn btn-sm btn-secondary';
      planViewMode = 'standard'; showStandard();
    };
    U.qs('#btn-regen', wrap).onclick = async (e) => {
      await U.withBtn(e.currentTarget, '生成中…', async () => {
        try {
          if (planViewMode === 'rigorous') { await showRigorous(); return; }
          bodyEl.innerHTML = U.skeleton(5, { title: true }); // S5：生成期骨架屏
          const np = await buildPlan();
          AppState.plan = np;
          bodyEl.innerHTML = renderPlanBody(np);
          if (!np.generatedBy) { bindEdit(bodyEl); bindPlanMedia(bodyEl); }
          wirePlanBodyRevert();
          mountAIControls();
          U.toast('已基于最新评估数据重新生成全套方案', 'success');
        } catch (err) { U.toast('生成失败：' + U.errMsg(err), 'error'); }
      });
    };
    U.qs('#btn-save-plan', wrap).onclick = async (e) => {
      await U.withBtn(e.currentTarget, '保存中…', async () => {
        try {
          AppState.trainingPlanHistory = AppState.trainingPlanHistory || [];
          var histSummary = (plan && plan.nutrition && plan.nutrition.target != null)
            ? { calories: plan.nutrition.target, phase: plan.aerobic && plan.aerobic.currentPhase && plan.aerobic.currentPhase.name, balanceLevel: plan.balance && plan.balance.startLevel }
            : { kind: 'ai', provider: (plan && plan.aiProvider) || 'AI' };
          AppState.trainingPlanHistory.push({ savedAt: new Date().toISOString(), summary: histSummary });
          await persistPatient();
          U.toast('方案已保存至患者档案', 'success');
        } catch (err) { U.toast('保存失败：' + U.errMsg(err), 'error'); }
      });
    };
    if (!plan.generatedBy) bindEdit(U.qs('#plan-body', wrap));
    bindPlanMedia(wrap);
    mountAIControls();
    wirePlanBodyRevert();
    const qrBtn = U.qs('#btn-plan-qr', wrap);
    if (qrBtn) qrBtn.onclick = () => {
      if (window.Share && typeof Share.openPlanQRModal === 'function') Share.openPlanQRModal({ scheme: 'weight' });
      else U.toast('分享组件未就绪', 'error');
    };
    const aiPlanBtn = U.qs('#btn-ai-plan', wrap);
    if (aiPlanBtn) {
      // AI 模式关闭的账号不显示「鹊动小Qoo 智能方案」入口（聊天问答除外，不受影响）
      if (!(window.AIReason && window.AIReason.aiEnabled && window.AIReason.aiEnabled())) {
        aiPlanBtn.style.display = 'none';
      } else {
        aiPlanBtn.onclick = function () {
      if (!window.AIReason) { U.toast('鹊动小Qoo 组件未加载', 'error'); return; }
      if (!U.qs('#ai-run', wrap)) mountAIControls();
      const box = U.qs('#plan-ai-panel', wrap);
      if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const tI = U.qs('#ai-tg-interp', wrap), tP = U.qs('#ai-tg-plan', wrap), run = U.qs('#ai-run', wrap);
      if (!run) { U.toast('鹊动小Qoo 控制面板未就绪', 'warning'); return; }
      if (tI) { tI.checked = true; if (tI.onchange) tI.onchange(); }
      if (tP) { tP.checked = true; if (tP.onchange) tP.onchange(); }
        };
      }
    }
    bindPatientBar(wrap);
    // AI 配图：批处理按钮 + 画廊
    const aiImgBtn = U.qs('#btn-aiimg-batch', wrap);
    if (aiImgBtn) aiImgBtn.onclick = function () { aiBatchIllustrate(this); };
    const galEl = U.qs('#aiimg-gallery', wrap);
    if (galEl && window.AIImgArchive) {
      window.AIImgArchive.renderGallery(window.AIImgArchive.currentPid(), galEl).then(function () {
        const c = U.qs('#aiimg-count', wrap);
        if (c) c.textContent = (galEl.querySelectorAll('.ai-img-cell').length) + ' 张';
      });
    }
    buildPlanRail(wrap, '#plan-body');
    return wrap;
  };

  /* ============ 肌少症综合干预方案（读取综合评估归档记录的真实 R.plan，经 PlanView 渲染） ============ */
  Pages.sarcopeniaPlan = async function () {
    // 关键：智能方案必须读「肌少症综合评估」归档记录的真实 R.plan，绝不能复用体重管理的 buildPlan()
    const DB = window.SarcDB;
    const rec = (DB && DB.list ? DB.list() : [])
      .filter(function (r) { return r && r.result && r.result.plan && r.result.plan.home && r.module !== 'spine'; })
      .sort(function (a, b) { return new Date(b.assessDate || 0) - new Date(a.assessDate || 0); })[0];

    if (!rec) {
      return `<div class="alert alert-warning"><div><strong>尚未找到肌少症综合评估归档记录</strong>
        <p style="margin:6px 0 0;">「智能方案」依据「肌少症-跌倒风险评估」综合评估（10 步流程，步骤 10「纳入台账 / 保存」）产出的真实推荐方案，并非体重管理方案。</p>
        <a href="#/sarcopenia-assess" class="btn btn-primary btn-sm mt-2">前往肌少症评估 →</a></div></div>`;
    }

    const R = rec.result, pl = R.plan;
    const sections = sarcPlanSections(pl);
    /* 富集动作库已上传的图片/视频：无则 SchemeCard 媒体块回退小Qoo 占位 */
    try {
      const lib = (window.DB && window.DB.getPlanLibrary) ? await window.DB.getPlanLibrary() : [];
      sections.forEach(function (s) { s.items.forEach(function (it) {
        if (it.device || it.img || it.video) return;
        const m = lib.filter(function (x) { return x && x.name === it.name; })[0];
        if (m) { if (m.image) it.img = m.image; if (m.video) it.video = m.video; }
      }); });
    } catch (e) {}
    const stat = (function () {
      let count = 0, video = 0;
      sections.forEach(function (s) { s.items.forEach(function (it) { count++; if (it.video) video++; }); });
      return { count: count, cats: sections.length, duration: (count * 3) + ' 分钟（估算）', video: video, cycle: (pl.reviewDays ? (pl.reviewDays + ' 天复评') : '8-12 周') };
    })();

    // 评估依据溯源条（SARC-F / 握力 / 步速 / SMI）—— 取自归档记录原始输入
    const inp = rec.input || {};
    const sarcoTrace = [];
    sarcoTrace.push({ label: 'SARC-F', value: (inp.sarcf && inp.sarcf.total != null) ? (inp.sarcf.total + ' / 10') : '—' });
    sarcoTrace.push({ label: '握力', value: (inp.grip != null) ? (U.num(inp.grip) + ' kg') : '—' });
    sarcoTrace.push({ label: '4 米步速', value: (inp.gait != null) ? (U.num(inp.gait) + ' m/s') : '—' });
    sarcoTrace.push({ label: 'SMI', value: (inp.body && inp.body.smi != null) ? (U.num(inp.body.smi) + ' kg/㎡') : '—' });
    const sarcoTraceHtml = window.PlanView ? ('<div style="--ac:#0D9488;margin:0 0 14px;">' + PlanView.traceBar(sarcoTrace) + '</div>') : '';

    const isMobile = (window.innerWidth <= 760);
    const planBodyHtml = window.SchemeCard
      ? window.SchemeCard.renderPlan(sections, { mode: isMobile ? 'mobile' : 'pc', lib: 'sarc' })
      : (isMobile ? PlanView.renderE('sarcopenia', sections, { patientName: rec.patientName || '' }) : PlanView.renderD('sarcopenia', sections, { trace: sarcoTrace, stat: stat }));

    const intro = '对象：' + U.esc(rec.patientName || '未选择') + '　性别：' + U.esc(rec.gender || '—') +
      '　年龄：' + U.esc(rec.age || '—') + '　首选：' + U.esc((pl.home && pl.home.title) || '徒手 + 设备综合') +
      '　复查：' + U.esc(rec.reviewDate || pl.reviewDate || '—');

    const wrap = U.el(`<div>
      ${patientBar()}
      <div class="plan-cockpit" style="--ac:#0D9488">
        <aside class="plan-rail"><div class="plan-rail-ttl"><span class="dot"></span>方案目录</div><div class="plan-rail-list" id="pl-rail"></div></aside>
        <div class="plan-main">
          <div class="card mb-3 no-print">
            <div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              <div style="flex:1;min-width:200px;">
                <div style="font-weight:700;font-size:16px;">肌少症综合干预方案（基于综合评估产出）</div>
                <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">${intro}</div>
              </div>
                  <button class="btn btn-outline" id="btn-print-sar">🖨️ 打印 / 导出方案</button>
            </div>
          </div>
          ${sarcoTraceHtml}
          <div id="sar-plan-body">${planBodyHtml}</div>
        </div>
      </div>
    </div>`);

    // 方案目录侧栏（基于 PlanView 分节，避免依赖体重方案 .card 结构）
    (function buildRail() {
      const list = U.qs('#pl-rail', wrap); if (!list) return;
      list.innerHTML = sections.map(function (s) {
        return '<a data-sec="plsec"><span class="ic">•</span><span class="pl-rail-t">' + U.esc(s.cat) + '</span></a>';
      }).join('');
      const secEls = (U.qs('#sar-plan-body', wrap) || wrap).querySelectorAll('.sc-section');
      Array.prototype.forEach.call(list.querySelectorAll('a'), function (a, i) {
        a.onclick = function () { if (secEls[i]) secEls[i].scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      });
    })();

    const printBtn = U.qs('#btn-print-sar', wrap);
    if (printBtn) printBtn.onclick = function () {
      U.toast('正在生成打印纸卡（含扫码）…', 'info');
      printSarcoPlan(pl, rec);
    };
    bindPatientBar(wrap);
    return wrap;
  };

  /* ============ 肌少症方案分节：来自综合评估真实产出的 R.plan（徒手分组动作 + 鹊动设备真实图） ============ */
  function sarcPlanSections(pl) {
    const secs = [];
    const ep = (pl && pl.home && pl.home.exercisePlan) || null;
    if (ep) {
      const GLABEL = { warmup: '热身激活', main: '主体抗阻训练（徒手 / 居家）', balance: '平衡防跌倒训练', aerobic: '有氧训练', stretch: '放松拉伸' };
      ['warmup', 'main', 'balance', 'aerobic', 'stretch'].forEach(function (g) {
        const grp = ep[g];
        if (!grp || !grp.items || !grp.items.length) return;
        secs.push({
          cat: GLABEL[g],
          items: grp.items.map(function (it) {
            const st = it.status === 'recommend' ? '推荐' : it.status === 'forbidden' ? '禁止' : it.status === 'optional' ? '可选' : '';
            return {
              name: it.name || '动作',
              posture: it.posture || '',
              levels: it.level || '',
              types: (st ? (st + ' · ') : '') + (it.posture ? ('体位：' + it.posture) : ''),
              dose: it.params || '',
              steps: it.note || '按要点规范完成，循序渐进',
              cautions: '',
              safety: [],
              device: '',
              svg: (window.SarcExerciseLib && window.SarcExerciseLib.figureSVG) ? window.SarcExerciseLib.figureSVG(it.posture) : '',
              img: '',
              video: ''
            };
          })
        });
      });
    } else if (pl && pl.home && pl.home.actions && pl.home.actions.length) {
      secs.push({
        cat: '居家徒手训练',
        items: pl.home.actions.map(function (a) {
          return { name: (Array.isArray(a) ? a[0] : a), posture: '', levels: '', types: '', dose: '', steps: (pl.home.rules || []).join('；'), cautions: '', safety: [], device: '', svg: '', img: '', video: '' };
        })
      });
    }
    if (pl && pl.device && pl.device.devices && pl.device.devices.length) {
      const all = (window.CONST && CONST.DEVICES) ? CONST.DEVICES : [];
      secs.push({
        cat: '鹊动设备训练',
        items: pl.device.devices.map(function (dv) {
          const d = all.filter(function (x) { return x.id === dv.id; })[0] || {};
          const name = dv.name || d.name || ('QD-' + dv.id);
          const code = d.code || ('QD-' + dv.id);
          return {
            code: code,
            name: name,
            device: (code + (d.name ? ' · ' + d.name : '')),
            img: d.img || dv.img || '',
            dose: dv.dose || '',
            params: { reason: dv.reason || '', note: dv.keyPoints || '' },
            steps: dv.keyPoints || '',
            cautions: dv.contraindication || '',
            safety: dv.contraindication ? [dv.contraindication] : [],
            video: ''
          };
        })
      });
    }
    return secs;
  }
  function sarcoToMobileEx(it, mcat) {
    return {
      id: it.name, name: it.name,
      meta: it.dose || (it.params && it.params.load) || '',
      cat: mcat || '',
      desc: (typeof it.steps === 'string' ? it.steps : (Array.isArray(it.steps) ? it.steps.join('；') : '')),
      video: it.video || '', image: it.img || '',
      device: it.device || '', params: it.params || null, safety: it.safety || null
    };
  }
  async function printSarcoPlan(pl, rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    const sections = sarcPlanSections(pl);
    /* 打印版同样生成系统示意图 + 富集动作库媒体（与屏幕版一致） */
    try {
      const lib = (window.DB && window.DB.getPlanLibrary) ? await window.DB.getPlanLibrary() : [];
      sections.forEach(function (s) { s.items.forEach(function (it) {
        if (!it.device && !it.svg) it.svg = (window.SarcExerciseLib && window.SarcExerciseLib.figureSVG) ? window.SarcExerciseLib.figureSVG(it.posture) : '';
        if (it.device || it.img || it.video) return;
        const m = lib.filter(function (x) { return x && x.name === it.name; })[0];
        if (m) { if (m.image) it.img = m.image; if (m.video) it.video = m.video; }
      }); });
    } catch (e) {}
    const exercises = [];
    sections.forEach(function (s) {
      const mcat = /抗阻/.test(s.cat) ? 'resistance' : /平衡/.test(s.cat) ? 'balance' : /拉伸|放松/.test(s.cat) ? 'flexibility' : /设备/.test(s.cat) ? 'device' : 'aerobic';
      s.items.forEach(function (it) { exercises.push(sarcoToMobileEx(it, mcat)); });
    });
    let qrHtml = '';
    try {
      qrHtml = (await window.Share.buildPlanQrBlock({
        mode: 'plan', scheme: 'sarcopenia',
        exercises: exercises,
        patient: { id: rec.id || '', name: rec.patientName || '', gender: rec.gender || '', age: rec.age || '' },
        title: (rec.patientName || '') + ' 肌少症训练方案'
      })) || '';
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    const name = (rec.patientName || '') + ' 肌少症综合干预方案';
    const sub = '对象：' + (rec.patientName || '未选择') + '　性别：' + (rec.gender || '—') + '　年龄：' + (rec.age || '—') + '　频次：渐进抗阻为主';
    const html = window.SchemeCard
      ? window.SchemeCard.renderPlan(sections, { mode: 'print', lib: 'sarc', title: name, sub: sub, qrHtml: qrHtml })
      : PlanView.renderF('sarcopenia', sections, { title: name, sub: sub, qrHtml: qrHtml });
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }

  /* ============ AI 配图（训练动作示意图） ============ */
  function collectPlanExercises(plan) {
    const out = [];
    ['resistance', 'balance', 'flexibility'].forEach(function (c) {
      const arr = plan[c] && plan[c].exercises;
      if (Array.isArray(arr)) arr.forEach(function (e) {
        out.push({ name: e.name || e.label || '', desc: e.desc || e.description || e.note || '', cat: c });
      });
    });
    if (plan.device1RM && Array.isArray(plan.device1RM.exercises)) plan.device1RM.exercises.forEach(function (e) {
      out.push({ name: e.name || '', desc: e.desc || '', cat: 'device' });
    });
    if (Array.isArray(plan.exercises)) plan.exercises.forEach(function (e) {
      out.push({ name: e.name || '', desc: '', cat: 'plan' });
    });
    return out.filter(function (e) { return e.name; });
  }
  function buildIllustPrompt(ex) {
    const catLabel = { resistance: '抗阻训练', balance: '平衡训练', flexibility: '柔韧拉伸', device: '器械训练', plan: '训练' }[ex.cat] || '训练';
    const desc = ex.desc ? ('，' + ex.desc) : '';
    return catLabel + '动作「' + ex.name + '」' + desc + ' 的标准姿势示意图：简洁线条、白底、人物正面或侧面清晰展示动作要领与关节角度，避免大段文字说明。';
  }
  async function aiBatchIllustrate(btn) {
    if (!window.AIImgArchive) { U.toast('AI 配图模块未加载', 'error'); return; }
    const pid = window.AIImgArchive.currentPid();
    if (!pid) { U.toast('请先登记或选择患者', 'error'); return; }
    if (!window.AIReason || !AIReason.generateImage) { U.toast('AI 图像生成未就绪', 'error'); return; }
    const plan = AppState.plan || {};
    const exs = collectPlanExercises(plan);
    if (!exs.length) { U.toast('当前方案暂无可供配图的动作', 'info'); return; }
    btn.disabled = true;
    const gal = document.getElementById('aiimg-gallery');
    const total = exs.length;
    let done = 0, ok = 0;
    U.toast('开始为 ' + total + ' 个动作生成配图（可继续操作，生成中请勿关闭页面）…', 'info', 3000);
    const queue = exs.slice();
    const POOL = 3;
    async function worker() {
      while (queue.length) {
        const ex = queue.shift();
        try {
          const r = await AIReason.generateImage(buildIllustPrompt(ex), { timeout: 120000 });
          if (r && r.url) { await window.AIImgArchive.save(pid, r.url, ex.name + ' 动作示意图'); ok++; }
        } catch (e) { console.warn('[AI配图] 失败:', ex.name, (e && e.message) || e); }
        done++;
        const c = document.getElementById('aiimg-count');
        if (c) c.textContent = '生成中 ' + done + '/' + total;
      }
    }
    const workers = [];
    for (let i = 0; i < Math.min(POOL, total); i++) workers.push(worker());
    await Promise.all(workers);
    btn.disabled = false;
    if (gal) {
      await window.AIImgArchive.renderGallery(pid, gal);
      const c = document.getElementById('aiimg-count');
      if (c) c.textContent = (gal.querySelectorAll('.ai-img-cell').length) + ' 张';
    }
    U.toast('配图完成：成功 ' + ok + ' / ' + total + ' 张，详见下方 AI 配图区', ok ? 'success' : 'warning', 3000);
  }

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

    // 器械 1RM 自动配重训练方案（文档1算法）：有等张/等速肌力数据时生成
    const isoRec = hasIto ? latest(AppState.isotonicData) : null;
    const device1RM = await device1RMProgram(strengthSum, p, a, isoRec);

    return {
      generatedAt: new Date().toISOString(),
      nutrition: { bmr, tdee, coef, stage, target: tc.target, deficit: tc.actualDeficit,
        limited: tc.limited, limitReason: tc.limitReason, macros, meals,
        weeklyLoss: Calc.weeklyLoss(tc.actualDeficit) },
      aerobic: { phases: CONST.AEROBIC_PHASES, currentPhase: phase, currentIndex: phaseIdx,
        hrZones, ranking: aerobicRanking(p, a), risk },
      resistance,
      device1RM,
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

  /* ============ 方案页媒体（方案库 / 设备档案库） ============ */
  // 方案库动作缩略图：仅当动作携带视频/图片时渲染；lib 对应媒体存储命名空间
  function exerciseMedia(ex, lib) {
    if (!ex || !ex.id || (!ex.video && !ex.image)) return '';
    return PlanMediaView.thumb(ex, lib, ex.id, 120);
  }
  // 设备档案库图片/视频查看入口（方案推荐页点击缩略图触发）
  function deviceMediaHTML(d) {
    if (!d || !d.id) return '';
    const hasVideo = !!(d.video);
    return `<button type="button" class="btn btn-ghost btn-sm no-print dev-media-open" data-device-id="${U.esc(d.id)}" style="margin-top:10px;">
      ${hasVideo ? '▶ 播放视频' : '查看图片 / 视频'}
    </button>`;
  }
  // 渲染后：补齐本地媒体缩略图 + 绑定设备图片/视频查看
  function bindPlanMedia(root) {
    if (!root) return;
    if (window.PlanMediaView && PlanMediaView.hydrate) PlanMediaView.hydrate(root);
    U.qsa('.dev-media-open, .dev-media-play, .dev-media-thumb', root).forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-device-id');
        const d = (window.CONST && CONST.DEVICES || []).find(x => x.id === id);
        if (!d) return;
        if (typeof window.openDeviceMedia === 'function') { window.openDeviceMedia(d); return; }
        if (typeof window.openDeviceVideo === 'function') { window.openDeviceVideo(d); return; }
        if (d.video && d.video !== '__local__') window.open(d.video, '_blank');
      });
    });
  }

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
          <span style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-primary">${plan.resistance.phase.name}</span>
            <button class="btn btn-ghost btn-sm no-print" data-edit="resist-list">✎ 编辑动作</button>
          </span></div>
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
          <div class="grid-3" id="resist-grid">
            ${plan.resistance.exercises.map((ex, i) => exerciseCard(ex, i + 1, 'resist')).join('')}
          </div>
        </div>
      </div>

      <!-- 三-B、器械 1RM 自动配重训练方案 -->
      ${plan.device1RM ? `<div id="device1rm-grid">${device1RMHTML(plan.device1RM)}</div>` : ''}

      <!-- 四、柔韧性训练 -->
      <div class="card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧘</span>四、柔韧性训练方案（9 组标准拉伸序列 · 含示意图）</h3>
          <button class="btn btn-ghost btn-sm no-print" data-edit="flex-list">✎ 编辑动作</button></div>
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
          <div class="grid-3" id="flex-grid">
            ${plan.flexibility.exercises.map((ex, i) => `
              <div class="card" style="margin:0;">
                <div class="card-body" style="padding:16px;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                    <div style="width:24px;height:24px;border-radius:50%;background:var(--success);color:#fff;
                      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;">${i + 1}</div>
                    <strong style="font-size:14px;">${ex.name}</strong></div>
                  <div class="exercise-diagram">${ex.svg}</div>
                  ${exerciseMedia(ex, 'plan')}
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
          <span style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-primary">起始等级 L${plan.balance.startLevel}</span>
            <button class="btn btn-ghost btn-sm no-print" data-edit="balance-list">✎ 编辑动作</button>
          </span></div>
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

          <div class="grid-3 mt-3" id="balance-grid">
            ${plan.balance.exercises.map(ex => `
              <div class="card" style="margin:0;${ex.level > plan.balance.startLevel ? 'opacity:.85;' : ''}">
                <div class="card-body" style="padding:16px;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                    <span class="badge ${ex.level <= plan.balance.startLevel ? 'badge-primary' : 'badge-info'}">L${ex.level} ${ex.levelText}</span>
                    <strong style="font-size:14px;">${ex.name}</strong></div>
                  <div class="exercise-diagram">${ex.svg}</div>
                  ${exerciseMedia(ex, 'plan')}
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

  /**
   * 方案主体渲染：若方案由 AI 采用（generatedBy==='ai'），复用 AIReason.planSummaryHTML，
   * 并附带「重新生成系统方案」回退入口；否则走原规则引擎渲染。
   */
  function renderPlanBody(pl) {
    if (pl && pl.generatedBy === 'ai') {
      const aiHtml = (window.AIReason && AIReason.planSummaryHTML) ? AIReason.planSummaryHTML(pl) : '<p>AI 方案渲染组件未就绪</p>';
      return '<div class="ai-plan-ai-tag">本方案由鹊动小Qoo AI 辅助生成，须经专业人员确认</div>' + aiHtml +
        '<div class="ai-plan-revert-row"><button type="button" class="btn btn-outline btn-sm" id="ai-revert-system">↺ 重新生成系统方案</button></div>';
    }
    return renderPlanHTML(pl);
  }
  window.renderPlanBody = renderPlanBody;

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
      <div style="border:2px solid var(--primary);border-radius:16px;padding:20px;--ac:#0D9488;">
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
            <td>${x.device.name || x.device.short || ''}<div style="font-size:11.5px;color:var(--text-muted);">${(x.device.muscles || '').split('、').slice(0, 2).join('、')}</div></td>
            <td style="font-size:12.5px;line-height:1.7;">${U.esc(x.reason)}</td>
            <td>${x.dose.load}</td><td>${x.dose.reps}</td><td>${x.dose.sets}</td><td>${x.dose.rest}</td>
            <td style="font-size:12.3px;line-height:1.7;">${U.esc(x.dose.note || '标准执行')}</td></tr>`).join('')}</tbody>
        </table></div>

        <div class="grid-3 mt-3">
          ${prog.picks.slice(0, 6).map(x => window.PlanView ? window.PlanView.itemCard({
            name: (x.device && (x.device.name || x.device.short)) || '设备训练',
            device: (x.device && x.device.id ? (x.device.id + ' 号机') : '鹊动设备'),
            img: (x.device && x.device.img) || '',
            video: '',
            params: { load: (x.dose && x.dose.load) || '', reason: x.reason || '' },
            dose: (x.dose ? (x.dose.reps + ' 次 × ' + x.dose.sets + ' 组 · 间歇 ' + x.dose.rest) : ''),
            types: (x.device && x.device.muscles) || '',
            steps: (x.dose && x.dose.note) || '',
            safety: (prog && prog.safety) || []
          }, { unit: 'sarcopenia', mode: 'pc' }) : '').join('')}
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
          ${exerciseMedia(ex, 'plan')}
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

  /* 重新渲染方案主体并重新绑定编辑器 */
  // ── 方案草稿自动保存（刷新/误关后可恢复内存态方案）──
  const PLAN_DRAFT_KEY = 'qd_plan_draft_v1';
  let _draftChecked = false;
  function _savePlanDraft() {
    try { if (AppState.plan && Object.keys(AppState.plan).length) localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(AppState.plan)); } catch (e) {}
  }
  function _clearPlanDraft() {
    try { localStorage.removeItem(PLAN_DRAFT_KEY); } catch (e) {}
  }
  function _getPlanDraft() {
    try { const s = localStorage.getItem(PLAN_DRAFT_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function _maybeRestoreDraft(pb) {
    if (_draftChecked || !pb) return;
    _draftChecked = true;
    const d = _getPlanDraft();
    if (!d) return;
    if (JSON.stringify(d) === JSON.stringify(AppState.plan || {})) { _clearPlanDraft(); return; }
    const banner = document.createElement('div');
    banner.className = 'plan-draft-banner';
    banner.innerHTML =
      '<span>📝 检测到上次未保存的方案草稿，是否恢复？</span>' +
      '<button type="button" class="btn btn-primary btn-sm" id="draft-restore">恢复</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="draft-discard">忽略</button>';
    pb.insertBefore(banner, pb.firstChild);
    banner.querySelector('#draft-restore').onclick = function () {
      AppState.plan = d; _clearPlanDraft(); rerenderPlan(); U.toast('已恢复上次方案草稿', 'success');
    };
    banner.querySelector('#draft-discard').onclick = function () { _clearPlanDraft(); banner.remove(); };
  }
  // 离开页面（刷新/关闭）前兜底保存当前方案态
  window.addEventListener('beforeunload', _savePlanDraft);

  function rerenderPlan() {
    const pb = U.qs('#plan-body');
    if (pb) { pb.innerHTML = renderPlanBody(AppState.plan); if (!(AppState.plan && AppState.plan.generatedBy)) bindEdit(pb); }
    _maybeRestoreDraft(pb);
  }

  /* 通用动作列表编辑器（抗阻 / 柔韧 / 平衡）—— 支持增加、删减、逐条调整参数 */
  function openExerciseEditor(title, list, schema, blank) {
    if (!Array.isArray(list)) return;

    /* 编辑前快照：用于「撤销全部修改」与关闭时的脏数据提示 */
    const snapshot = JSON.stringify(list);
    let dirty = false;

    const buildCards = () => list.map((ex, i) => `
      <div class="ex-edit-card" data-i="${i}">
        <div class="ex-edit-head">
          <strong>动作 ${i + 1}</strong>
          <span class="ex-edit-name">${U.esc(ex.name || ex.action || '未命名动作')}</span>
          <span class="ex-edit-ops">
            <button type="button" class="ex-op" data-move="up" data-i="${i}" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="ex-op" data-move="down" data-i="${i}" title="下移" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
            <button type="button" class="ex-op" data-dup="${i}" title="复制该动作">⧉</button>
            <button type="button" class="ex-op danger" data-remove="${i}" title="删除该动作">🗑</button>
          </span>
        </div>
        ${schema.map(f => {
          const val = ex[f.key] != null ? String(ex[f.key]) : '';
          const common = `data-i="${i}" data-f="${f.key}"`;
          if (f.type === 'textarea') return `<div class="form-group"><label>${f.label}</label>
            <textarea rows="2" ${common}>${U.esc(val)}</textarea></div>`;
          const inputType = f.type === 'number' ? 'number' : 'text';
          return `<div class="form-group"><label>${f.label}</label>
            <input type="${inputType}" ${common} value="${U.esc(val)}"></div>`;
        }).join('')}
      </div>`).join('');

    const paint = (host) => {
      const countEl = host.parentNode ? host.parentNode.querySelector('#ex-count') : null;
      host.innerHTML = list.length
        ? `<div style="max-height:56vh;overflow:auto;padding-right:6px;">${buildCards()}</div>`
        : `<div style="padding:34px 16px;text-align:center;color:var(--text-muted);font-size:13px;
             border:1px dashed var(--border);border-radius:12px;">
             暂无动作，点击下方「＋ 新增动作」开始编排</div>`;
      if (countEl) countEl.textContent = `共 ${list.length} 个动作${dirty ? ' · 有未保存修改' : ''}`;

      host.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => {
          dirty = true;
          list[+inp.dataset.i][inp.dataset.f] = inp.value;
          const card = inp.closest('.ex-edit-card');
          const nameEl = card && card.querySelector('.ex-edit-name');
          if (nameEl && inp.dataset.f === 'name') nameEl.textContent = inp.value || '未命名动作';
          if (countEl) countEl.textContent = `共 ${list.length} 个动作 · 有未保存修改`;
          /* 数值字段合理性即时提示（不清空输入） */
          if (inp.type === 'number' && window.SmartForm) {
            SmartForm.checkOne(inp, { min: 0, max: 999, label: '参数', soft: true });
          }
        });
      });
      host.querySelectorAll('[data-remove]').forEach(b => {
        b.addEventListener('click', () => {
          dirty = true; list.splice(+b.dataset.remove, 1); paint(host);
        });
      });
      host.querySelectorAll('[data-dup]').forEach(b => {
        b.addEventListener('click', () => {
          const i = +b.dataset.dup;
          dirty = true;
          list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i])));
          paint(host);
          U.toast('已复制动作，可直接修改参数', 'success');
        });
      });
      host.querySelectorAll('[data-move]').forEach(b => {
        b.addEventListener('click', () => {
          const i = +b.dataset.i;
          const j = b.dataset.move === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= list.length) return;
          dirty = true;
          const t = list[i]; list[i] = list[j]; list[j] = t;
          paint(host);
        });
      });
    };

    U.modal({
      title, width: '760px',
      body: `<div class="ex-edit-bar">
          <span id="ex-count" style="font-size:12.5px;color:var(--text-muted);"></span>
          <button type="button" class="btn btn-ghost btn-sm" id="ex-revert">↺ 撤销全部修改</button>
        </div>
        <div id="ex-host"></div>
        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="ex-add">＋ 新增动作</button>
          <span style="font-size:12.5px;color:var(--text-muted);">支持 ↑↓ 调整顺序、⧉ 复制动作；调整后点击「保存方案」写入患者档案</span>
        </div>`,
      footer: `<button type="button" class="btn btn-secondary" data-a="c">取消</button><button type="button" class="btn btn-primary" data-a="s">保存修改</button>`,
      onMount(ov, close) {
        const host = ov.querySelector('#ex-host');
        paint(host);
        ov.querySelector('#ex-add').addEventListener('click', () => {
          dirty = true;
          list.push(JSON.parse(JSON.stringify(blank)));
          paint(host);
          const cards = host.querySelectorAll('.ex-edit-card');
          const last = cards[cards.length - 1];
          if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); const f = last.querySelector('input,textarea'); if (f) f.focus(); }
        });
        ov.querySelector('#ex-revert').addEventListener('click', () => {
          if (!dirty) return U.toast('当前没有修改', 'info');
          U.confirm('确认撤销本次全部修改，恢复到打开编辑器时的状态？', () => {
            const orig = JSON.parse(snapshot);
            list.length = 0; orig.forEach(o => list.push(o));
            dirty = false; paint(host);
            U.toast('已恢复到编辑前状态', 'success');
          });
        });
        ov.querySelector('[data-a="c"]').addEventListener('click', () => {
          if (!dirty) return close();
          U.confirm('有未保存的修改，确认放弃并关闭？', () => {
            const orig = JSON.parse(snapshot);
            list.length = 0; orig.forEach(o => list.push(o));
            close();
          });
        });
        ov.querySelector('[data-a="s"]').addEventListener('click', () => {
          close(); rerenderPlan(); U.toast(`训练动作已更新（共 ${list.length} 个动作）`, 'success');
        });
      }
    });
  }

  /* 器械 1RM 方案编辑器（嵌套 parts → items）：支持逐设备分组增删与参数调整 */
  function openDevice1RMEditor() {
    const prog = AppState.plan.device1RM;
    if (!prog || !Array.isArray(prog.parts)) return;

    const deviceItemFields = (it) => {
      const f = [
        { key: 'name', label: '动作名称', type: 'text' },
        { key: 'muscle', label: '目标肌群', type: 'text' },
        { key: 'equipLabel', label: '器械标签', type: 'text' },
        { key: 'reps', label: '次数', type: 'text' },
        { key: 'sets', label: '组数', type: 'text' },
        { key: 'rest', label: '组间间歇', type: 'text' },
        { key: 'points', label: '动作要领', type: 'textarea' },
        { key: 'contraindication', label: '禁忌', type: 'textarea' }
      ];
      if (it.weight != null) f.splice(2, 0, { key: 'weight', label: '推荐负荷 (kg)', type: 'number' });
      if (it.bandLevel != null) f.splice(2, 0, { key: 'bandLevel', label: '弹力带档位', type: 'text' });
      return f;
    };

    const buildItems = (pi) => prog.parts[pi].items.map((it, i) => {
      const schema = deviceItemFields(it);
      const fields = schema.map(fld => {
        const val = it[fld.key] != null ? String(it[fld.key]) : '';
        const common = `data-pi="${pi}" data-i="${i}" data-f="${fld.key}"`;
        if (fld.type === 'textarea') return `<div class="form-group"><label>${fld.label}</label>
          <textarea rows="2" ${common}>${U.esc(val)}</textarea></div>`;
        const inputType = fld.type === 'number' ? 'number' : 'text';
        return `<div class="form-group"><label>${fld.label}</label>
          <input type="${inputType}" ${common} value="${U.esc(val)}"></div>`;
      }).join('');
      return `<div class="ex-edit-card" data-pi="${pi}" data-i="${i}" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card-bg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:13.5px;color:var(--primary);">${U.esc(prog.parts[pi].equipLabel || '器械')} · 动作 ${i + 1}</strong>
          <button type="button" class="btn btn-ghost btn-sm" data-remove-pi="${pi}" data-remove-i="${i}">🗑 删除</button>
        </div>${fields}</div>`;
    }).join('');

    const paint = (host) => {
      host.innerHTML = `<div style="max-height:60vh;overflow:auto;padding-right:6px;">
        ${prog.parts.map((part, pi) => `
          <div style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <span class="badge badge-secondary">${U.esc(part.equipLabel || '器械')}</span>
              <span style="font-size:12.5px;color:var(--text-muted);">${part.items.length} 个动作</span>
              <button type="button" class="btn btn-ghost btn-sm" data-add-pi="${pi}">＋ 新增</button>
            </div>
            ${buildItems(pi)}
          </div>`).join('')}
      </div>`;
      host.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => {
          const pi = +inp.dataset.pi, i = +inp.dataset.i;
          prog.parts[pi].items[i][inp.dataset.f] = inp.value;
        });
      });
      host.querySelectorAll('[data-remove-pi]').forEach(b => {
        b.addEventListener('click', () => {
          prog.parts[+b.dataset.removePi].items.splice(+b.dataset.removeI, 1); paint(host);
        });
      });
      host.querySelectorAll('[data-add-pi]').forEach(b => {
        b.addEventListener('click', () => {
          const pi = +b.dataset.addPi;
          const label = prog.parts[pi].equipLabel || '器械';
          prog.parts[pi].items.push({
            equip: 'dumbbell', equipLabel: label, name: '新动作', muscle: '',
            weight: 0, reps: '12', sets: '3', rest: '60 s', points: '', contraindication: ''
          });
          paint(host);
        });
      });
    };

    U.modal({
      title: '编辑器械 1RM 自动配重方案', width: '780px',
      body: `<div id="dev-host"></div>
        <div style="margin-top:12px;font-size:12.5px;color:var(--text-muted);">调整后仅保存在当前页面，点击“保存方案”可写入患者档案</div>`,
      footer: `<button type="button" class="btn btn-secondary" data-a="c">取消</button><button type="button" class="btn btn-primary" data-a="s">保存修改</button>`,
      onMount(ov, close) {
        const host = ov.querySelector('#dev-host');
        paint(host);
        ov.querySelector('[data-a="c"]').addEventListener('click', close);
        ov.querySelector('[data-a="s"]').addEventListener('click', () => {
          close(); rerenderPlan(); U.toast('器械方案已更新', 'success');
        });
      }
    });
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
                const pb = U.qs('#plan-body');
                pb.innerHTML = renderPlanBody(AppState.plan);
                bindEdit(pb);
                close();
                U.toast('饮食方案已更新', 'success');
              };
            }
          });
        } else if (key === 'resist-list') {
          openExerciseEditor('编辑基础抗阻训练动作', AppState.plan.resistance.exercises, [
            { key: 'name', label: '动作名称', type: 'text' },
            { key: 'target', label: '目标肌群', type: 'text' },
            { key: 'dose', label: '训练剂量（如 12 次 × 3 组 · 负荷 20kg · 间歇 60 秒）', type: 'text' },
            { key: 'key', label: '动作要领', type: 'textarea' },
            { key: 'caution', label: '注意事项', type: 'textarea' }
          ], { name: '新动作', target: '', dose: '', key: '', caution: '', svg: '' });
        } else if (key === 'flex-list') {
          openExerciseEditor('编辑柔韧性训练动作', AppState.plan.flexibility.exercises, [
            { key: 'name', label: '动作名称', type: 'text' },
            { key: 'target', label: '目标肌群', type: 'text' },
            { key: 'duration', label: '时长组数', type: 'text' },
            { key: 'key', label: '动作要领', type: 'textarea' },
            { key: 'caution', label: '注意事项', type: 'textarea' }
          ], { name: '新动作', target: '', duration: '', key: '', caution: '', svg: '' });
        } else if (key === 'balance-list') {
          openExerciseEditor('编辑平衡功能训练动作', AppState.plan.balance.exercises, [
            { key: 'name', label: '动作名称', type: 'text' },
            { key: 'level', label: '等级 (1-5)', type: 'number' },
            { key: 'target', label: '训练目标', type: 'text' },
            { key: 'duration', label: '建议剂量', type: 'text' },
            { key: 'key', label: '动作要领', type: 'textarea' },
            { key: 'progress', label: '进阶标准', type: 'textarea' },
            { key: 'safety', label: '安全提示', type: 'textarea' }
          ], { name: '新动作', level: 1, levelText: '', target: '', duration: '', key: '', progress: '', safety: '', svg: '' });
        } else if (key === 'device1rm-list') {
          openDevice1RMEditor();
        }
      };
    });
  }
})();
