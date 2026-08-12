/**
 * 鹊动FAC功能评估与干预系统 - 核心算法引擎
 * 代谢计算 / 心率区间 / 营养素分配 / 肌力评分 / 生活方式量化
 */
(function () {
  const Calc = {};

  /* ============ 体格指标 ============ */
  Calc.bmi = (weight, heightCm) => {
    if (!weight || !heightCm) return null;
    return U.round(weight / Math.pow(heightCm / 100, 2), 1);
  };

  Calc.bmiGrade = (bmi) => {
    if (bmi === null) return null;
    return CONST.BMI_GRADES.find(g => bmi < g.max) || CONST.BMI_GRADES[CONST.BMI_GRADES.length - 1];
  };

  Calc.whr = (waist, hip) => (!waist || !hip) ? null : U.round(waist / hip, 2);

  Calc.whrRisk = (whr, gender) => {
    if (whr === null) return null;
    const list = CONST.WHR_RISK[gender === 'female' ? 'female' : 'male'];
    return list.find(r => whr < r.max) || list[list.length - 1];
  };

  Calc.waistRisk = (waist, gender) => {
    if (!waist) return null;
    const cut = CONST.WAIST_RISK[gender === 'female' ? 'female' : 'male'];
    return waist >= cut
      ? { label: '中心性肥胖', level: 'danger', cut }
      : { label: '腰围正常', level: 'success', cut };
  };

  Calc.bodyFatGrade = (bf, gender) => {
    if (!bf) return null;
    const list = CONST.BODY_FAT_REF[gender === 'female' ? 'female' : 'male'];
    return list.find(r => bf < r.max) || list[list.length - 1];
  };

  Calc.bpGrade = (sbp, dbp) => {
    if (!sbp || !dbp) return null;
    if (sbp >= 180 || dbp >= 110) return { label: '3 级高血压', level: 'danger' };
    if (sbp >= 160 || dbp >= 100) return { label: '2 级高血压', level: 'danger' };
    if (sbp >= 140 || dbp >= 90) return { label: '1 级高血压', level: 'warning' };
    if (sbp >= 130 || dbp >= 85) return { label: '正常高值', level: 'warning' };
    if (sbp < 90 || dbp < 60) return { label: '偏低', level: 'info' };
    return { label: '血压正常', level: 'success' };
  };

  /* ============ 能量代谢（Mifflin-St Jeor）============ */
  Calc.bmr = (gender, weight, heightCm, age) => {
    if (!weight || !heightCm || age === null || age === undefined) return null;
    const base = 10 * weight + 6.25 * heightCm - 5 * age;
    return Math.round(gender === 'female' ? base - 161 : base + 5);
  };

  Calc.tdee = (bmr, coef) => (!bmr || !coef) ? null : Math.round(bmr * coef);

  /**
   * 目标热量：TDEE - 缺口，遵守男女最低热量安全底线且不低于 BMR
   * 返回 { target, actualDeficit, limited, limitReason }
   */
  Calc.targetCalories = (tdee, deficit, gender, bmr) => {
    if (!tdee) return null;
    const floor = CONST.CALORIE_FLOOR[gender === 'female' ? 'female' : 'male'];
    let target = tdee - deficit;
    let limited = false, reason = '';
    if (bmr && target < bmr) {
      target = bmr; limited = true;
      reason = `目标摄入已提升至基础代谢水平（${bmr} kcal），避免代谢适应性下降`;
    }
    if (target < floor) {
      target = floor; limited = true;
      reason = `目标摄入已提升至${gender === 'female' ? '女' : '男'}性安全下限 ${floor} kcal`;
    }
    return {
      target: Math.round(target),
      actualDeficit: Math.round(tdee - target),
      limited, limitReason: reason, floor
    };
  };

  Calc.weeklyLoss = (dailyDeficit) =>
    dailyDeficit ? U.round(dailyDeficit * 7 / CONST.FAT_KCAL_PER_KG, 2) : null;

  /* ============ Karvonen 目标心率 ============ */
  Calc.karvonen = (age, restHR, pctLow, pctHigh) => {
    if (age === null || !restHR) return null;
    const hrMax = 220 - age;
    const hrr = hrMax - restHR;
    return {
      hrMax,
      hrr,
      low: Math.round(hrr * pctLow + restHR),
      high: Math.round(hrr * pctHigh + restHR)
    };
  };

  /* ============ 宏量营养素分配 ============ */
  Calc.macros = (weight, calories) => {
    if (!weight || !calories) return null;
    const proteinG = Math.round(weight * 1.2);
    const proteinKcal = proteinG * 4;
    const fatKcal = Math.round(calories * 0.25);
    const fatG = Math.round(fatKcal / 9);
    const carbKcal = Math.max(0, calories - proteinKcal - fatKcal);
    const carbG = Math.round(carbKcal / 4);
    return {
      proteinG, proteinKcal, proteinPct: U.round(proteinKcal / calories * 100, 1),
      fatG, fatKcal, fatPct: U.round(fatKcal / calories * 100, 1),
      carbG, carbKcal, carbPct: U.round(carbKcal / calories * 100, 1),
      fiberG: '25-30', saltG: '<5', addedSugarG: '<25',
      waterMl: Math.max(1500, Math.round(weight * 30))
    };
  };

  /* 三餐 3:4:3 拆分 */
  Calc.mealSplit = (calories, macros) => {
    const ratios = [
      { name: '早餐', r: 0.3, time: '07:00-08:30', tip: '优先保证蛋白质，避免纯碳水开局' },
      { name: '午餐', r: 0.4, time: '11:30-12:30', tip: '主餐，蔬菜占餐盘一半，粗细粮搭配' },
      { name: '晚餐', r: 0.3, time: '17:30-19:00', tip: '适当减少主食，睡前 3 小时进食完毕' }
    ];
    return ratios.map(m => ({
      name: m.name, time: m.time, tip: m.tip,
      kcal: Math.round(calories * m.r),
      protein: Math.round(macros.proteinG * m.r),
      fat: Math.round(macros.fatG * m.r),
      carb: Math.round(macros.carbG * m.r)
    }));
  };

  /* ============ 运动风险判定 ============ */
  Calc.exerciseRisk = (assessment, patient) => {
    const parq = assessment.parq || [];
    const positives = parq.filter(v => v === 'yes').length;
    let score = 0;
    const factors = [];

    if (positives >= 2) { score += 3; factors.push(`PAR-Q 问卷 ${positives} 项阳性`); }
    else if (positives === 1) { score += 2; factors.push('PAR-Q 问卷 1 项阳性'); }

    const cvRisk = assessment.cvRisk;
    if (cvRisk === 'high') { score += 3; factors.push('心血管风险等级：高'); }
    else if (cvRisk === 'medium') { score += 1.5; factors.push('心血管风险等级：中'); }

    const hist = patient.medicalHistory || [];
    if (hist.includes('cardiovascular')) { score += 2; factors.push('既往心血管疾病史'); }
    if (hist.includes('osteoarthritis')) { score += 1; factors.push('骨关节疾病史，需限制冲击性运动'); }
    if (hist.includes('diabetes')) { score += 0.5; factors.push('糖尿病史，需关注运动中低血糖'); }
    if (hist.includes('osa')) { score += 0.5; factors.push('睡眠呼吸暂停，需控制高强度运动'); }

    const bp = Calc.bpGrade(U.num(assessment.sbp), U.num(assessment.dbp));
    if (bp && bp.level === 'danger') { score += 2; factors.push(`血压异常（${bp.label}）`); }
    else if (bp && bp.level === 'warning') { score += 1; factors.push(`血压${bp.label}`); }

    const bmi = Calc.bmi(U.num(assessment.weight), U.num(assessment.height));
    if (bmi && bmi >= 32.5) { score += 1.5; factors.push('重度肥胖，关节负荷显著增加'); }
    else if (bmi && bmi >= 28) { score += 0.5; factors.push('肥胖，建议低冲击运动起始'); }

    if (patient.jointIssue && patient.jointIssue !== 'none') {
      score += 1;
      factors.push({ knee: '膝关节不适', back: '腰部不适', both: '膝与腰均有不适', other: '其他关节不适' }[patient.jointIssue] || '关节不适');
    }
    if (assessment.contraindication) { score += 3; factors.push('存在明确运动禁忌项'); }

    let level, label, advice;
    if (score >= 5) {
      level = 'high'; label = '高风险';
      advice = '需在医师或康复治疗师现场监督下运动；起始强度控制在 40% HRR 以内，禁止高强度间歇训练；建议先完成心肺运动试验（CPET）或运动负荷试验。';
    } else if (score >= 2) {
      level = 'medium'; label = '中风险';
      advice = '建议前 4 周在专业指导下进行，采用低冲击有氧（快走/椭圆机/水中运动）；运动中监测心率与自觉疲劳度 RPE，出现胸闷、头晕立即终止。';
    } else {
      level = 'low'; label = '低风险';
      advice = '可按标准 FITT-VP 处方自主执行，注意循序渐进，运动前后完成热身与拉伸。';
    }
    return { score: U.round(score, 1), level, label, advice, factors };
  };

  /* ============ 生活方式问卷量化评分 ============ */
  Calc.lifeSurveyScore = (survey) => {
    if (!survey || !Object.keys(survey).length) return null;
    const dims = [];

    CONST.LIFE_SURVEY.forEach(sec => {
      let got = 0, max = 0;
      const details = [];
      sec.questions.forEach(q => {
        max += 4;
        let s = 0, answerText = '未填写';
        const val = survey[q.key];
        if (q.type === 'radio') {
          const opt = q.options.find(o => o.v === val);
          if (opt) { s = opt.score; answerText = opt.t; }
        } else {
          const arr = Array.isArray(val) ? val : (val ? [val] : []);
          if (arr.includes('none')) { s = 4; answerText = '无'; }
          else if (arr.length === 0) { s = 0; answerText = '未填写'; }
          else {
            s = Math.max(0, 4 - arr.length * 1.5);
            answerText = arr.map(v => (q.options.find(o => o.v === v) || {}).t || v).join('、');
          }
        }
        got += s;
        details.push({ label: q.label, answer: answerText, score: s });
      });
      const pct = max ? U.round(got / max * 100, 1) : 0;
      let level = pct >= 75 ? 'good' : (pct >= 50 ? 'fair' : 'poor');
      dims.push({
        dim: sec.dim, title: sec.title, icon: sec.icon,
        got: U.round(got, 1), max, pct, level,
        levelText: { good: '良好', fair: '需改善', poor: '亟需干预' }[level],
        color: { good: '#22c55e', fair: '#f59e0b', poor: '#dc2626' }[level],
        details
      });
    });

    const totalGot = dims.reduce((a, d) => a + d.got, 0);
    const totalMax = dims.reduce((a, d) => a + d.max, 0);
    const total = U.round(totalGot / totalMax * 100, 1);

    let grade, gradeLevel, summary;
    if (total >= 85) {
      grade = '优秀'; gradeLevel = 'success';
      summary = '整体生活方式健康度优秀，各维度习惯基本符合体重管理要求，重点在于长期维持与细节优化。';
    } else if (total >= 70) {
      grade = '良好'; gradeLevel = 'success';
      summary = '生活方式整体良好，存在少量可优化环节，针对性改进后可显著提升减重效率。';
    } else if (total >= 55) {
      grade = '一般'; gradeLevel = 'warning';
      summary = '生活方式存在多个明显短板，是当前体重增长与减重困难的重要驱动因素，需系统性整改。';
    } else if (total >= 40) {
      grade = '待改善'; gradeLevel = 'warning';
      summary = '生活方式健康度偏低，多维度习惯不良相互叠加，单纯依靠饮食控制难以取得持久效果，必须同步进行行为矫正。';
    } else {
      grade = '亟需干预'; gradeLevel = 'danger';
      summary = '生活方式健康度处于低水平，饮食、作息、活动等核心环节均存在严重问题，建议将行为矫正作为首要干预目标，配合定期随访强化依从性。';
    }

    // 短板排序
    const weakest = [...dims].sort((a, b) => a.pct - b.pct).slice(0, 3).filter(d => d.pct < 75);

    return { dims, total, grade, gradeLevel, summary, weakest };
  };

  /**
   * 生成生活方式改变指导建议（定性结论 + 定量指标 + 明确行动指令）
   */
  Calc.lifeAdvice = (surveyScore, assessment, patient, strengthSummary) => {
    if (!surveyScore) return null;
    const blocks = [];

    surveyScore.dims.forEach(d => {
      const pool = CONST.LIFE_ADVICE[d.dim] || {};
      const items = pool[d.level] || [];
      blocks.push({
        dim: d.dim, title: d.title, icon: d.icon,
        pct: d.pct, level: d.level, levelText: d.levelText, color: d.color,
        conclusion: buildConclusion(d),
        actions: items
      });
    });

    // 联动规则：结合体格与肌力数据补充交叉建议
    const cross = [];
    const bmi = Calc.bmi(U.num(assessment.weight), U.num(assessment.height));
    const bmiG = Calc.bmiGrade(bmi);
    if (bmiG && (bmiG.label === '肥胖' || bmiG.label === '重度肥胖')) {
      cross.push(`当前 BMI ${bmi}（${bmiG.label}），关节承重压力显著升高。运动方式限定为低冲击类别（快走／椭圆机／水中运动／功率自行车），暂缓跑跳类项目，待体重下降 5% 后再评估。`);
    }
    const sitDim = surveyScore.dims.find(d => d.dim === 'sedentary');
    if (sitDim && sitDim.pct < 55) {
      cross.push('久坐维度得分偏低且伴随超重，属于"低能量消耗型肥胖"。除结构化运动外，必须提升日常非运动性活动产热（NEAT），这是本类人群最易被忽视的能量缺口来源。');
    }
    const sleepDim = surveyScore.dims.find(d => d.dim === 'sleep');
    if (sleepDim && sleepDim.pct < 55) {
      cross.push('睡眠维度得分偏低会通过升高皮质醇、扰乱瘦素/饥饿素平衡直接削弱减重效果。建议将"22:30 前上床"设为与饮食控制同等优先级的干预目标。');
    }
    const postureDim = surveyScore.dims.find(d => d.dim === 'posture');
    if (postureDim && postureDim.pct < 60) {
      cross.push('存在体态异常或平衡能力不足，已在训练方案中自动纳入平衡功能训练与针对性拉伸序列，请按处方逐级进阶，避免直接进行高难度动作。');
    }
    if (strengthSummary && strengthSummary.total < 70) {
      cross.push(`肌力综合评分 ${strengthSummary.total} 分（${strengthSummary.grade}），提示瘦体重储备不足。减重期务必保证蛋白质摄入达标（1.2g/kg 体重）并坚持抗阻训练，否则减重过程中肌肉流失比例将显著升高。`);
    }
    if (strengthSummary && strengthSummary.weakPoints && strengthSummary.weakPoints.length) {
      cross.push(`肌力测评识别出薄弱环节：${strengthSummary.weakPoints.join('；')}。日常生活中应避免相关部位的突发大负荷动作（如猛然起身搬重物、快速转身）。`);
    }
    const dietDim = surveyScore.dims.find(d => d.dim === 'diet');
    if (dietDim && dietDim.pct < 55 && patient.takeoutFreq && ['weekly3', 'daily'].includes(patient.takeoutFreq)) {
      cross.push('高频外食叠加饮食结构不良，是热量超标的主因。建议每周至少自备 5 顿正餐（可批量备餐），外食时执行"过水去油 + 主食减半 + 先菜后饭"三原则。');
    }

    // 阶段化行动清单
    const roadmap = [
      { phase: '第 1-2 周｜启动期', focus: '建立记录与基础规律', items: [
        '每日记录饮食与体重（晨起排便后、空腹、同一台秤）',
        '固定三餐时间，戒断含糖饮料',
        '每日步数在基线上 +1000 步'
      ]},
      { phase: '第 3-4 周｜习惯期', focus: '结构改造与运动上量', items: [
        '完成餐盘法结构改造，蔬菜达 500g/日',
        '有氧运动达 3-4 次/周、每次 20-30 分钟',
        '固定就寝时间，睡眠时长达 7 小时'
      ]},
      { phase: '第 5-12 周｜强化期', focus: '负荷进阶与代谢改善', items: [
        '有氧达 150-225 分钟/周，抗阻 2-3 次/周',
        '加入柔韧与平衡训练，改善体态与稳定性',
        '第 8 周复评体成分与生活方式问卷'
      ]},
      { phase: '第 13 周起｜巩固期', focus: '防反弹与长期维持', items: [
        '有氧维持 ≥250 分钟/周（ACSM 防反弹推荐量）',
        '热量缺口逐步收窄至维持水平，避免代谢适应',
        '每 12 周复测肌力与体成分，动态调整训练负荷'
      ]}
    ];

    return { blocks, cross, roadmap, total: surveyScore.total, grade: surveyScore.grade, summary: surveyScore.summary };
  };

  function buildConclusion(d) {
    const map = {
      diet: {
        good: `饮食维度得分 ${d.pct} 分（良好）：膳食结构合理，蔬菜与蛋白摄入基本达标，进食行为规范。`,
        fair: `饮食维度得分 ${d.pct} 分（需改善）：膳食结构存在偏移，蔬菜或优质蛋白摄入不足，或存在重油／进食过快等行为问题。`,
        poor: `饮食维度得分 ${d.pct} 分（亟需干预）：膳食结构严重失衡，高能量密度食物占比过高，进食行为紊乱，是当前能量正平衡的核心来源。`
      },
      sleep: {
        good: `作息维度得分 ${d.pct} 分（良好）：作息规律、睡眠时长与质量达标，内分泌节律稳定。`,
        fair: `作息维度得分 ${d.pct} 分（需改善）：作息存在波动或睡眠时长不足，可能影响食欲调节激素水平。`,
        poor: `作息维度得分 ${d.pct} 分（亟需干预）：长期熬夜与睡眠不足，皮质醇升高、瘦素下降、饥饿素上升，直接导致食欲亢进与腹型肥胖倾向。`
      },
      sedentary: {
        good: `活动维度得分 ${d.pct} 分（良好）：日常活动量充足，久坐时间控制合理。`,
        fair: `活动维度得分 ${d.pct} 分（需改善）：久坐时间偏长，日常步数未达推荐水平，NEAT 能量消耗有提升空间。`,
        poor: `活动维度得分 ${d.pct} 分（亟需干预）：久坐时间过长且缺乏中断，日常活动性能量消耗严重不足，属于典型低消耗型生活模式。`
      },
      water: {
        good: `饮水维度得分 ${d.pct} 分（良好）：饮水量与时机合理，无含糖饮料依赖。`,
        fair: `饮水维度得分 ${d.pct} 分（需改善）：饮水量或分配方式欠佳，或存在一定频率的含糖饮品摄入。`,
        poor: `饮水维度得分 ${d.pct} 分（亟需干预）：饮水量明显不足并伴随高频含糖饮料摄入，构成显著的液体热量负担与代谢负担。`
      },
      posture: {
        good: `体态维度得分 ${d.pct} 分（良好）：无明显体态异常，平衡能力达标。`,
        fair: `体态维度得分 ${d.pct} 分（需改善）：存在轻度体态偏移或平衡能力下降，需纳入针对性训练预防疼痛发生。`,
        poor: `体态维度得分 ${d.pct} 分（亟需干预）：多部位体态异常并伴随疼痛或平衡能力不足，运动损伤与跌倒风险升高，需优先安排矫正与平衡训练。`
      },
      psych: {
        good: `心理维度得分 ${d.pct} 分（良好）：减重动机充足，情绪化进食少，支持系统健全。`,
        fair: `心理维度得分 ${d.pct} 分（需改善）：动机或支持度中等，存在偶发情绪化进食，需加强行为策略。`,
        poor: `心理维度得分 ${d.pct} 分（亟需干预）：情绪化进食频繁、动机不足或缺乏支持，是导致减重中断与反弹的高危因素，须优先建立行为支持体系。`
      }
    };
    return (map[d.dim] || {})[d.level] || `${d.title}得分 ${d.pct} 分。`;
  }

  /* ============ 肌力评分（等速）============ */
  /**
   * record: { gender, ptbwL, ptbwR, fiL, fiR, hqL, hqR, lsi, totalWorkL/R, avgPowerL/R, ... }
   */
  Calc.isokineticScore = (rec, gender) => {
    const g = gender === 'female' ? 'female' : 'male';
    const avg = (a, b) => {
      const arr = [a, b].filter(v => v !== null && v !== undefined && !isNaN(v));
      return arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
    };

    const ptbw = avg(U.num(rec.ptbwL), U.num(rec.ptbwR));
    const fi = avg(U.num(rec.fiL), U.num(rec.fiR));
    const hq = avg(U.num(rec.hqL), U.num(rec.hqR));
    const lsi = U.num(rec.lsi);

    let total = 70;
    const detail = [];

    let ptbwGrade = null;
    if (ptbw !== null) {
      ptbwGrade = CONST.PTBW_GRADES[g].find(x => ptbw >= x.min) || CONST.PTBW_GRADES[g][CONST.PTBW_GRADES[g].length - 1];
      total += ptbwGrade.score;
      detail.push({ name: '相对峰值力矩 PT/BW', value: `${U.round(ptbw, 2)} Nm/kg`, grade: ptbwGrade.label, delta: ptbwGrade.score, level: ptbwGrade.level });
    }
    let fiGrade = null;
    if (fi !== null) {
      fiGrade = CONST.FI_GRADES.find(x => fi <= x.max);
      total += fiGrade.score;
      detail.push({ name: '疲劳指数 FI', value: `${U.round(fi, 1)}%`, grade: fiGrade.label, delta: fiGrade.score, level: fiGrade.level });
    }
    let hqGrade = null;
    if (hq !== null) {
      hqGrade = CONST.HQ_GRADES.find(x => hq >= x.min);
      total += hqGrade.score;
      detail.push({ name: 'H/Q 屈伸比', value: `${U.round(hq, 1)}%`, grade: hqGrade.label, delta: hqGrade.score, level: hqGrade.level });
    }
    let lsiGrade = null;
    if (lsi !== null) {
      lsiGrade = CONST.LSI_GRADES.find(x => Math.abs(lsi) <= x.max);
      total += lsiGrade.score;
      detail.push({ name: '肢体对称指数 LSI', value: `${U.round(Math.abs(lsi), 1)}%`, grade: lsiGrade.label, delta: lsiGrade.score, level: lsiGrade.level });
    }

    total = Math.max(0, Math.min(100, Math.round(total)));
    const lv = CONST.STRENGTH_LEVELS.find(l => total >= l.min);

    /* 五维分项百分制 */
    const dims = [];
    // 1 肌力等级
    dims.push({
      key: 'level', name: '肌力等级',
      score: ptbwGrade ? ({ '优秀': 93, '良好': 83, '一般': 72, '偏低': 61, '较差': 45 })[ptbwGrade.label] : null,
      desc: ptbwGrade ? `PT/BW ${U.round(ptbw, 2)} Nm/kg，${ptbwGrade.label}` : '未采集'
    });
    // 2 肌力均衡度（H/Q）
    let balScore = null, balDesc = '未采集';
    if (hq !== null) {
      if (hq >= 60 && hq < 80) { balScore = 92; balDesc = `H/Q ${U.round(hq, 1)}%，屈伸肌配比理想`; }
      else if (hq >= 80) { balScore = Math.max(55, 92 - (hq - 80) * 2); balDesc = `H/Q ${U.round(hq, 1)}%，腘绳肌相对偏强`; }
      else { balScore = Math.max(30, 60 - (60 - hq) * 2); balDesc = `H/Q ${U.round(hq, 1)}%，腘绳肌薄弱`; }
    }
    dims.push({ key: 'balance', name: '肌力均衡度', score: balScore === null ? null : Math.round(balScore), desc: balDesc });
    // 3 双侧差值
    let symScore = null, symDesc = '未采集';
    if (lsi !== null) {
      const a = Math.abs(lsi);
      if (a < 15) symScore = 100 - a * 2;
      else if (a < 20) symScore = 70 - (a - 15) * 4;
      else symScore = Math.max(20, 50 - (a - 20) * 2);
      symDesc = `左右差值 ${U.round(a, 1)}%`;
    }
    dims.push({ key: 'symmetry', name: '双侧对称性', score: symScore === null ? null : Math.round(symScore), desc: symDesc });
    // 4 肌肉耐力
    let endScore = null, endDesc = '未采集';
    if (fi !== null) {
      if (fi <= 30) endScore = 95;
      else if (fi <= 50) endScore = 95 - (fi - 30);
      else if (fi <= 60) endScore = 75 - (fi - 50) * 1.5;
      else endScore = Math.max(25, 60 - (fi - 60) * 2);
      endDesc = `FI ${U.round(fi, 1)}%`;
    }
    dims.push({ key: 'endurance', name: '肌肉耐力', score: endScore === null ? null : Math.round(endScore), desc: endDesc });
    // 5 肢体运动功能（综合功率/总功 + 其他维度）
    const avgPower = avg(U.num(rec.avgPowerL), U.num(rec.avgPowerR));
    let funcScore = null, funcDesc = '未采集';
    const known = dims.filter(d => d.score !== null).map(d => d.score);
    if (known.length) {
      funcScore = Math.round(known.reduce((a, b) => a + b, 0) / known.length);
      funcDesc = avgPower !== null
        ? `平均功率 ${U.round(avgPower, 1)} W，综合功能评估`
        : '基于各分项综合推算';
      if (avgPower !== null) {
        const bonus = avgPower >= 100 ? 5 : (avgPower >= 60 ? 2 : -4);
        funcScore = Math.max(0, Math.min(100, funcScore + bonus));
      }
    }
    dims.push({ key: 'function', name: '肢体运动功能', score: funcScore, desc: funcDesc });

    /* 定性文字解读 */
    const weakPoints = [];
    const qualitative = [];

    qualitative.push(`【肌力整体水平】综合评分 ${total} 分，评级为「${lv.label}」。${ptbwGrade
      ? `相对峰值力矩 PT/BW 为 ${U.round(ptbw, 2)} Nm/kg，处于同性别人群${ptbwGrade.label}水平。`
      : '本次未采集 PT/BW 数据，建议补充完整测评以提升评估精度。'}`);

    if (hqGrade) {
      if (hqGrade.label === '偏低') {
        weakPoints.push('腘绳肌（屈膝肌群）相对薄弱');
        qualitative.push(`【薄弱肌群定位】H/Q 比值 ${U.round(hq, 1)}%，低于 60% 理想下限，提示腘绳肌相对股四头肌明显薄弱。该失衡是前交叉韧带损伤与腘绳肌拉伤的独立危险因素，需优先强化屈膝肌群（推荐鹊动 02 号机膝关节屈曲测训单元）。`);
      } else if (hqGrade.label === '偏高') {
        weakPoints.push('股四头肌（伸膝肌群）相对不足');
        qualitative.push(`【薄弱肌群定位】H/Q 比值 ${U.round(hq, 1)}%，高于 80%，提示伸膝肌群相对不足，上下楼梯及起立动作易出现膝前疼痛，需加强股四头肌（推荐鹊动 01 号机膝关节伸展测训单元）。`);
      } else {
        qualitative.push(`【薄弱肌群定位】H/Q 比值 ${U.round(hq, 1)}% 处于 60%-80% 理想区间，屈伸肌群配比协调，膝关节动态稳定性良好。`);
      }
    }

    if (lsiGrade) {
      const a = U.round(Math.abs(lsi), 1);
      const weakSide = (U.num(rec.ptbwL) !== null && U.num(rec.ptbwR) !== null)
        ? (U.num(rec.ptbwL) < U.num(rec.ptbwR) ? '左侧' : '右侧') : null;
      if (lsiGrade.label === '显著失衡') {
        weakPoints.push(`双侧肌力显著失衡（差值 ${a}%${weakSide ? '，' + weakSide + '为弱侧' : ''}）`);
        qualitative.push(`【关节运动损伤风险】双侧肢体对称指数差值达 ${a}%，超过 20% 显著失衡阈值${weakSide ? `，${weakSide}为弱侧` : ''}。长期代偿将导致强侧过度负荷、弱侧稳定性不足，步态与运动模式异常，跌倒与关节退变风险显著升高。训练方案已自动增加弱侧单侧强化组数。`);
      } else if (lsiGrade.label === '轻度失衡') {
        weakPoints.push(`双侧轻度失衡（差值 ${a}%${weakSide ? '，' + weakSide + '略弱' : ''}）`);
        qualitative.push(`【关节运动损伤风险】双侧差值 ${a}%，处于 15%-20% 轻度失衡区间${weakSide ? `，${weakSide}略弱` : ''}。建议采用单侧独立训练模式，弱侧较强侧增加 1 组，4-8 周后复测。`);
      } else {
        qualitative.push(`【关节运动损伤风险】双侧差值 ${a}%，在 15% 正常范围内，左右肢体力量对称性良好，无明显代偿风险。`);
      }
    }

    if (fiGrade) {
      if (fiGrade.label === '耐力显著下降') {
        weakPoints.push('肌肉抗疲劳能力显著不足');
        qualitative.push(`【肢体功能受限分析】疲劳指数 ${U.round(fi, 1)}%，超过 60% 警戒值，${fiGrade.desc}。表现为持续行走或爬楼后期动作变形、关节代偿增加，需优先安排低负荷（40-50% 1RM）、高次数（15-20 次）耐力导向训练。`);
      } else if (fiGrade.label === '需关注') {
        qualitative.push(`【肢体功能受限分析】疲劳指数 ${U.round(fi, 1)}%，处于 50%-60% 临界区间，${fiGrade.desc}。建议训练中后段注意动作质量，适当延长组间休息。`);
      } else {
        qualitative.push(`【肢体功能受限分析】疲劳指数 ${U.round(fi, 1)}%，抗疲劳能力良好，可耐受连续训练负荷，适合进入强化期训练安排。`);
      }
    }

    if (ptbwGrade && (ptbwGrade.label === '较差' || ptbwGrade.label === '偏低')) {
      weakPoints.push('整体肌力水平低于同性别参考值');
      qualitative.push('【减重期特别提示】肌力水平偏低意味着瘦体重储备不足，单纯热量限制会加速肌肉流失并降低基础代谢。必须同步保证蛋白质摄入（1.2g/kg 体重）与规律抗阻训练，建议将抗阻训练频率提升至 3 次/周。');
    }

    return {
      total, grade: lv.label, level: lv.level, color: lv.color,
      detail, dims, qualitative, weakPoints,
      metrics: { ptbw, fi, hq, lsi, avgPower }
    };
  };

  /* ============ 肌力评分（等张）============ */
  Calc.isotonicScore = (rec, gender, bodyWeight) => {
    const g = gender === 'female' ? 'female' : 'male';
    const oneRML = U.num(rec.oneRML), oneRMR = U.num(rec.oneRMR);
    const bw = U.num(bodyWeight);
    const avg = (a, b) => {
      const arr = [a, b].filter(v => v !== null && !isNaN(v));
      return arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : null;
    };
    const oneRM = avg(oneRML, oneRMR);
    const relStrength = (oneRM !== null && bw) ? U.round(oneRM / bw, 2) : null;

    // 双侧差值
    let lsi = U.num(rec.lsi);
    if (lsi === null && oneRML !== null && oneRMR !== null) {
      const mx = Math.max(oneRML, oneRMR);
      lsi = mx ? U.round(Math.abs(oneRML - oneRMR) / mx * 100, 1) : null;
    }

    let total = 70;
    const detail = [];

    // 相对肌力分级（沿用 PT/BW 阈值体系）
    let relGrade = null;
    if (relStrength !== null) {
      relGrade = CONST.PTBW_GRADES[g].find(x => relStrength >= x.min) || CONST.PTBW_GRADES[g][CONST.PTBW_GRADES[g].length - 1];
      total += relGrade.score;
      detail.push({ name: '相对肌力（1RM/体重）', value: `${relStrength}`, grade: relGrade.label, delta: relGrade.score, level: relGrade.level });
    }

    // 肌耐力：重复次数
    const reps = U.num(rec.reps);
    let repGrade = null;
    if (reps !== null) {
      if (reps >= 15) repGrade = { label: '耐力优秀', score: 5, level: 'success' };
      else if (reps >= 10) repGrade = { label: '耐力良好', score: 3, level: 'success' };
      else if (reps >= 6) repGrade = { label: '耐力一般', score: 0, level: 'warning' };
      else repGrade = { label: '耐力不足', score: -8, level: 'danger' };
      total += repGrade.score;
      detail.push({ name: `${U.num(rec.loadWeight) || '设定'}kg 负荷重复次数`, value: `${reps} 次`, grade: repGrade.label, delta: repGrade.score, level: repGrade.level });
    }

    let lsiGrade = null;
    if (lsi !== null) {
      lsiGrade = CONST.LSI_GRADES.find(x => Math.abs(lsi) <= x.max);
      total += lsiGrade.score;
      detail.push({ name: '双侧对称指数 LSI', value: `${U.round(Math.abs(lsi), 1)}%`, grade: lsiGrade.label, delta: lsiGrade.score, level: lsiGrade.level });
    }

    total = Math.max(0, Math.min(100, Math.round(total)));
    const lv = CONST.STRENGTH_LEVELS.find(l => total >= l.min);

    const dims = [
      { key: 'level', name: '肌力等级', score: relGrade ? ({ '优秀': 93, '良好': 83, '一般': 72, '偏低': 61, '较差': 45 })[relGrade.label] : null,
        desc: relStrength !== null ? `相对肌力 ${relStrength}（1RM ${U.round(oneRM, 1)}kg / 体重 ${bw}kg）` : '未采集' },
      { key: 'balance', name: '肌力均衡度', score: lsi !== null ? Math.max(20, Math.round(100 - Math.abs(lsi) * 2.5)) : null,
        desc: lsi !== null ? `双侧差值 ${U.round(Math.abs(lsi), 1)}%` : '未采集' },
      { key: 'symmetry', name: '双侧对称性', score: lsi !== null ? (Math.abs(lsi) < 15 ? Math.round(100 - Math.abs(lsi) * 2) : Math.max(20, Math.round(70 - (Math.abs(lsi) - 15) * 3))) : null,
        desc: lsi !== null ? `LSI ${U.round(Math.abs(lsi), 1)}%` : '未采集' },
      { key: 'endurance', name: '肌肉耐力', score: reps !== null ? Math.min(100, Math.round(45 + reps * 3.5)) : null,
        desc: reps !== null ? `${reps} 次重复` : '未采集' }
    ];
    const known = dims.filter(d => d.score !== null).map(d => d.score);
    dims.push({
      key: 'function', name: '肢体运动功能',
      score: known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null,
      desc: known.length ? '基于各分项综合推算' : '未采集'
    });

    const weakPoints = [];
    const qualitative = [];
    qualitative.push(`【肌力整体水平】等张测评综合评分 ${total} 分，评级「${lv.label}」。${relStrength !== null
      ? `相对肌力（1RM/体重）为 ${relStrength}，处于${relGrade.label}水平。`
      : '本次未采集完整 1RM 与体重数据，建议补充以获得相对肌力评价。'}`);

    if (relGrade && (relGrade.label === '较差' || relGrade.label === '偏低')) {
      weakPoints.push('最大动态肌力不足');
      qualitative.push('【薄弱环节定位】最大动态肌力低于同性别参考值，日常提举、上下楼、久站等功能性动作储备不足。建议以 60-70% 1RM 强度、10-12 次 ×3 组作为起始处方，每 2 周按 5% 递增负荷。');
    }
    if (repGrade && repGrade.label === '耐力不足') {
      weakPoints.push('肌肉耐力储备不足');
      qualitative.push('【肢体功能受限分析】设定负荷下重复次数不足 6 次，提示肌耐力储备低，持续性活动易早期疲劳。应先进行 4 周耐力导向训练（40-50% 1RM × 15-20 次 × 2-3 组）建立基础。');
    }
    if (lsiGrade) {
      const a = U.round(Math.abs(lsi), 1);
      const weakSide = (oneRML !== null && oneRMR !== null) ? (oneRML < oneRMR ? '左侧' : '右侧') : null;
      if (lsiGrade.label === '显著失衡') {
        weakPoints.push(`双侧显著失衡（${a}%${weakSide ? '，' + weakSide + '为弱侧' : ''}）`);
        qualitative.push(`【关节运动损伤风险】双侧 1RM 差值 ${a}% 超过 20% 阈值${weakSide ? `，${weakSide}为弱侧` : ''}。必须采用单侧独立训练模式纠正，禁止仅使用双侧同步器械训练（强侧会持续代偿）。`);
      } else if (lsiGrade.label === '轻度失衡') {
        weakPoints.push(`双侧轻度失衡（${a}%）`);
        qualitative.push(`【关节运动损伤风险】双侧差值 ${a}%，建议弱侧增加 1 组训练量，8 周后复测。`);
      } else {
        qualitative.push(`【关节运动损伤风险】双侧差值 ${a}%，对称性良好。`);
      }
    }

    return {
      total, grade: lv.label, level: lv.level, color: lv.color,
      detail, dims, qualitative, weakPoints,
      metrics: { oneRM, relStrength, reps, lsi }
    };
  };

  /* ============ 复测对比与方案迭代 ============ */
  Calc.compareStrength = (records, gender, bodyWeight, type) => {
    if (!records || records.length < 2) return null;
    const sorted = [...records].sort((a, b) => new Date(a.testDate) - new Date(b.testDate));
    const prev = sorted[sorted.length - 2], cur = sorted[sorted.length - 1];
    const scoreOf = r => type === 'isotonic'
      ? Calc.isotonicScore(r, gender, bodyWeight).total
      : Calc.isokineticScore(r, gender).total;
    const pS = scoreOf(prev), cS = scoreOf(cur);
    const delta = cS - pS;
    let trend, action, adjust;
    if (delta >= 5) {
      trend = 'up'; 
      action = '肌力提升';
      adjust = '训练负荷进阶：强度 +5%-10%，组数 +1 组，或将次数区间下移一档（如 12 次 → 10 次配合更高负荷）。';
    } else if (delta <= -5) {
      trend = 'down';
      action = '肌力下降';
      adjust = '训练负荷回调：强度 -10%，组数维持，优先恢复动作质量；同步排查蛋白质摄入、睡眠与训练依从性。';
    } else {
      trend = 'flat';
      action = '肌力持平';
      adjust = '维持当前负荷，调整训练变量（改变动作节奏为离心 3 秒、缩短组间休息 15 秒）打破平台期。';
    }
    return {
      prevDate: prev.testDate, curDate: cur.testDate,
      prevScore: pS, curScore: cS, delta, trend, action, adjust,
      intervalDays: U.daysBetween(prev.testDate, cur.testDate)
    };
  };

  window.Calc = Calc;
})();
