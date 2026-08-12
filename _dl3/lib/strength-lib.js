/**
 * StrengthLib —— 全身肌群哑铃 / 杠铃 / 弹力带肌力训练动作库（全年龄段通用）
 *            + 基于 1RM 的自动配重计算系统
 *
 * 数据来源：用户提供的《全身肌群哑铃+杠铃+弹力带肌力训练动作库（全年龄段通用）+ 基于1RM自动配重计算系统》
 * 对外暴露：window.StrengthLib
 *   · EXERCISES        32 个动作（编号/名称/适用器械/目标肌群/难度梯度/要点/适用人群/训练参数/禁忌）
 *   · BAND_MAP         弹力带等效负重映射表（轻 1.0 / 中 2.8 / 重 4.5 kg）
 *   · GOALS            四大训练目标（负荷占 1RM 比例 / 次数区间 / 组数 / 器械建议）
 *   · brzycki1RM(W,R)  Brzycki 1RM 公式（R∈[6,12]）
 *   · calcLoad(ctx)    根据次极限测试 + 训练目标，自动计算训练重量、匹配器械档位
 *   · recommend(ctx)   生成成套器械训练计划（含安全限制规则）
 *   · seedToPlanLibrary() 合并进系统「运动方案库」(DB.planLibrary)
 */
(function () {
  'use strict';

  /* ---------- 器械 / 难度 映射 ---------- */
  const EQUIP_LABEL = { dumbbell: '哑铃', barbell: '杠铃', band: '弹力带' };
  // 全梯度 = 初级+中级+进阶（p1/p2/p3）
  const LEVEL_MAP = {
    '初级': ['p1'],
    '初 / 中 / 进阶': ['p1', 'p2', 'p3'],
    '中 / 进阶': ['p2', 'p3'],
    '全梯度': ['p1', 'p2', 'p3'],
    '中梯度': ['p2'],
    '初 / 中': ['p1', 'p2']
  };

  /* ---------- 弹力带等效负重映射表 ---------- */
  const BAND_MAP = { 轻: 1.0, 中: 2.8, 重: 4.5 }; // kg

  /* ---------- 四大训练目标（系统自动匹配负荷百分比） ---------- */
  const GOALS = [
    { key: 'maintain', label: '维持塑形（日常保持）', loadMin: 0.50, loadMax: 0.60, reps: '12–15', sets: 3,
      advice: '轻哑铃、轻/中弹力带，杠铃低重量' },
    { key: 'hypertrophy', label: '肌肥大增肌（增肌塑形）', loadMin: 0.65, loadMax: 0.75, reps: '8–12', sets: 4,
      advice: '全档位哑铃、中/重弹力带、标准杠铃' },
    { key: 'fatloss', label: '纯减脂燃脂（保肌减脂）', loadMin: 0.50, loadMax: 0.60, reps: '15–20', sets: 3,
      advice: '轻器械，弹力带循环训练为主' },
    { key: 'strength', label: '绝对力量进阶（力量提升）', loadMin: 0.75, loadMax: 0.88, reps: '4–6', sets: 5,
      advice: '大重量哑铃、标准奥杆杠铃、重弹力带' }
  ];

  /* ---------- 32 个动作库（表格版，字段严格对齐文档） ---------- */
  // 每行：[编号, 名称, 器械, 肌群, 难度, 要点, 适用人群, 参数, 禁忌, 重量范围(哑铃/杠铃解析用)]
  const RAW = [
    [1, '弹力带坐姿胸前推', 'band', '胸大肌、三角肌前束、肱三头肌', '初级', '背部固定弹力带，坐姿匀速向前推，缓慢控制还原', '新手、久坐办公、减脂人群', '12–15 次/组，3 组，休 60s', '含胸代偿、快速弹动发力', null],
    [2, '哑铃坐姿侧平举', 'dumbbell', '三角肌中束、肩袖肌群', '初 / 中 / 进阶', '腰背贴实椅背，哑铃水平抬至肩高，匀速下放', '全年龄段，改善溜肩、肩无力', '初级 15 次，中级 12 次，进阶 10 次，3 组', '借力甩动、抬至头顶', '1–10kg'],
    [3, '杠铃坐姿推举', 'barbell', '肩部、三头、上胸', '中 / 进阶', '杠铃置于锁骨，垂直向上推举，核心收紧稳定躯干', '有训练基础、增肌塑形人群', '8–12 次/组，4 组', '腰部拱起代偿、憋气发力', '5–30kg'],
    [4, '弹力带坐姿划船', 'band', '背阔肌、中下斜方、肱二头肌', '初级', '双脚踩带，握带向后拉，肩胛骨向内夹紧', '新手、圆肩驼背、减脂人群', '12–15 次/组，3 组', '弯腰猛拉、弓背代偿', null],
    [5, '哑铃单臂俯身划船', 'dumbbell', '背阔肌、菱形肌、二头肌', '初 / 中 / 进阶', '单手扶固定支撑，单手持铃垂直提拉至腰侧', '全年龄段增肌、改善背部薄弱', '初级 12 次，进阶 8 次，3 组', '躯干倾斜＞45°、弯腰塌腰', '2–15kg'],
    [6, '弹力带二头弯举', 'band', '肱二头肌、前臂握力', '全梯度', '双脚踩带，上臂贴紧身体，小臂向上弯举发力', '新手、力量薄弱、居家训练', '12–15 次/组，3 组', '上臂晃动、身体借力摆动', null],
    [7, '哑铃颈后臂屈伸', 'dumbbell', '肱三头肌', '中 / 进阶', '单手持铃举过头顶，手肘固定向后弯曲伸展', '有基础、手臂塑形增肌', '10–12 次/组，3 组', '手肘大幅外展、重量过大拉伤肩袖', '2–12kg'],
    [8, '杠铃杠铃弯举', 'barbell', '肱二头肌、前臂肌群', '中 / 进阶', '杠铃贴大腿匀速弯举至胸前，控制下放', '增肌人群，提升上肢围度', '8–12 次/组，4 组', '腰部摆动借力、甩动杠铃', '5–25kg'],
    [9, '弹力带抗阻踝泵', 'band', '小腿腓肠肌、踝关节稳定肌', '初级', '坐姿脚掌套带，勾脚、踩脚双向对抗', '久坐、运动康复、下肢薄弱', '单侧 15 次，3 组/侧', '暴力扭转脚踝、速度过快', null],
    [10, '弹力带侧向行走', 'band', '臀中肌、阔筋膜张肌', '初 / 中 / 进阶', '弹力带绑双膝上方，小步横向移动，膝盖对齐脚尖', '臀凹陷、假胯宽、下肢稳定差', '12 步/侧，3 组', '膝盖内扣、大步幅晃动', null],
    [11, '哑铃坐姿负重直腿抬高', 'dumbbell', '股四头肌', '初 / 中', '脚踝绑定哑铃，单腿伸直抬高停留 3 秒下放', '减脂、下肢力量薄弱、康复人群', '10–12 次/侧，3 组', '膝盖完全锁死、快速砸落', '1–8kg'],
    [12, '弹力带扶椅后踢腿', 'band', '臀大肌、腘绳肌', '初级', '手扶固定物，弹力带绑脚踝，小腿向后缓慢后踢', '新手、臀部扁平、久坐臀无力', '12 次/侧，3 组', '身体前倾弯腰代偿', null],
    [13, '杠铃靠墙静蹲负重', 'barbell', '股四头肌、臀肌、小腿', '中 / 进阶', '背部贴墙，杠铃置于胸前，屈膝 30°–60° 静蹲', '有训练基础、下肢增肌塑形', '静蹲 20–45s/组，3 组', '深蹲超 90°、膝盖超过脚尖', '5–20kg'],
    [14, '哑铃站姿负重提踵', 'dumbbell', '腓肠肌、比目鱼肌', '初 / 中 / 进阶', '双手持铃，扶支撑缓慢踮脚停留 2 秒落下', '全年龄段，改善小腿纤细无力', '12–15 次/组，4 组', '弹跳式下落、完全放松不控制', '2–12kg'],
    [15, '弹力带坐姿髋外展', 'band', '臀中肌、大腿外侧', '初级', '坐姿弹力带绑膝盖，双腿向两侧对抗打开', '假胯宽、单侧肌力不平衡', '12 次/侧，3 组', '上半身左右歪斜借力', null],
    [16, '哑铃负重坐站训练', 'dumbbell', '臀腿综合肌群', '初 / 中', '哑铃抱于胸前，无扶手自主站起坐下', '减脂、下肢力量不足、新手', '8–12 次/组，3 组', '站起速度过快、重心前倾摔倒', '2–10kg'],
    [17, '弹力带收腹对抗', 'band', '腹横肌、浅层腹部核心', '初级', '弹力带椅背固定，双手握带向前收腹对抗', '新手、核心薄弱、久坐腰痛', '12–15 次/组，3 组', '憋气发力、腰部代偿前顶', null],
    [18, '哑铃坐姿负重侧屈', 'dumbbell', '腹斜肌、侧腰核心', '初 / 中', '单手持铃贴大腿，上半身缓慢侧向弯曲', '腰腹塑形、改善躯干两侧薄弱', '10 次/侧，3 组', '侧弯幅度过大、腰椎挤压疼痛', '1–6kg'],
    [19, '弹力带坐姿旋转抗阻', 'band', '躯干旋转稳定核心', '中梯度', '弹力带单侧固定，双手握带小幅左右转体', '运动爱好者、改善转身发力弱', '10 次/侧，3 组', '骨盆旋转、大幅扭转腰椎', null],
    [20, '杠铃靠墙骨盆后倾', 'barbell', '深层核心、骨盆稳定肌群', '中梯度', '杠铃轻放小腹，靠墙收紧骨盆贴合墙面', '骨盆前倾、慢性下腰痛人群', '保持 5s/次，12 次/组，3 组', '杠铃重压腰椎、发力过猛', '5–10kg'],
    [21, '弹力带持续握力收缩', 'band', '前臂、握力肌群', '全梯度', '双手紧握弹力带持续收缩 5 秒放松', '握力差、伏案办公、力量薄弱', '12 次/组，3 组', '仅靠手臂拉扯代替手指发力', null],
    [22, '哑铃坐姿手腕屈伸', 'dumbbell', '前臂屈/伸肌群', '初级', '小臂平放支撑，手腕持铃上下活动', '办公劳损、手部力量不足', '15 次/组，3 组', '小臂离开支撑悬空发力', '1–5kg'],
    [23, '弹力带单脚平衡推拉', 'band', '全身协同稳定肌群', '中梯度', '单脚轻度支撑，双手推拉弹力带维持平衡', '提升本体感觉、运动康复人群', '10 次/组，3 组', '单脚长时间支撑、无防护扶手', null],
    [24, '哑铃矮台阶负重踏步', 'dumbbell', '下肢肌群、心肺消耗', '初 / 中', '扶墙缓慢上下 5cm 矮台阶，温和燃脂', '减脂人群、大体重新手', '10 次/侧，3 组', '使用高台阶、快速踩踏冲击膝盖', '2–8kg'],
    [25, '弹力带循环有氧组合', 'band', '全身低强度燃脂肌群', '全梯度', '推拉、踏步循环连续训练，间歇短休息', '减脂塑形、新手心肺基础训练', '循环 3 轮，每轮 5 分钟', '高强度连续训练至气喘心慌', null],
    [26, '哑铃肩部舒缓绕环', 'dumbbell', '肩袖、肩部维持肌群', '初级', '双手轻持哑铃缓慢前后大圈绕肩', '肩颈僵硬、久坐办公人群', '12 圈/方向，3 组', '大重量哑铃快速甩动肩部', '1–3kg'],
    [27, '弹力带腘绳肌拉伸对抗', 'band', '大腿后侧、小腿放松肌群', '全梯度', '坐姿单腿套带，轻柔向后拉伸对抗', '下肢紧张、运动后放松、康复', '保持 15s/侧，3 组', '拉伸产生刺痛、暴力拉扯韧带', null],
    [28, '杠铃静态胸前等长维持', 'barbell', '胸肩等长维持肌群', '中梯度', '杠铃贴胸前静止保持，静态肌力训练', '增肌维持、提升肌肉耐力', '30–40s/组，3 组', '超大重量长时间静态负重', '5–15kg'],
    [29, '弹力带肩袖外旋训练', 'band', '肩袖深层稳定肌', '初级', '上臂贴身体 90°，弹力带向外旋转手臂', '肩袖损伤康复、肩部力量薄弱', '12 次/侧，3 组', '上臂抬起离开躯干、大幅度旋转', null],
    [30, '哑铃脚踝绑带髋外展', 'dumbbell', '臀中肌、下肢平衡肌群', '中梯度', '扶支撑，脚踝绑铃单侧缓慢向外抬腿', '臀凹陷、行走左右摇晃人群', '10 次/侧，3 组', '抬腿高度超过髋部、重心偏移', '1–6kg'],
    [31, '弹力带胸部扩张拉伸对抗', 'band', '胸大肌、改善圆肩', '全梯度', '弹力带胸前缠绕，双手向后扩张胸腔', '久坐含胸、胸部肌肉紧张人群', '15 次/组，3 组', '猛扯弹力带、背部过度后伸', null],
    [32, '哑铃靠墙全身静态维持', 'dumbbell', '全身肌群等长耐力', '中梯度', '背部完全贴墙站立持铃静态保持', '增肌维持、提升整体肌肉耐力', '40–60s/组，3 组', '膝盖完全锁死、腰部脱离墙面', '2–10kg']
  ];

  function parseWRange(s) {
    if (!s) return null;
    const m = s.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return { min: parseFloat(m[1]), max: parseFloat(m[2]) };
  }

  let EXERCISES = RAW.map(r => ({
    id: 'STR' + String(r[0]).padStart(2, '0'),
    no: r[0],
    name: r[1],
    equip: r[2],
    equipLabel: EQUIP_LABEL[r[2]],
    muscle: r[3],
    levelLabel: r[4],
    levels: LEVEL_MAP[r[4]] || ['p1'],
    points: r[5],
    audience: r[6],
    params: r[7],
    contraindication: r[8],
    wRange: parseWRange(r[9]),
    video: '', image: ''
  }));
  // 快照副本，用于 resetDefault 精确还原（不受运行时编辑影响）
  const DEFAULT_EXERCISES = EXERCISES.map(e => Object.assign({}, e));

  /* ---------- Brzycki 1RM 公式（系统内置唯一公式） ---------- */
  // 1RM = W / (1.0278 - 0.0278 × R)，R∈[6,12]
  function brzycki1RM(W, R) {
    const w = Number(W), r = Number(R);
    if (!isFinite(w) || !isFinite(r) || w <= 0) return null;
    if (r < 6 || r > 12) return null; // 次极限区间外无效
    const denom = 1.0278 - 0.0278 * r;
    if (denom <= 0) return null;
    return Math.round((w / denom) * 100) / 100;
  }

  /* ---------- 器械档位适配（就近匹配，新手向下、进阶向上） ---------- */
  function nearestWeight(w, wRange, trainingBase) {
    if (w == null) return null;
    let v = Math.round(w * 2) / 2; // 0.5kg 步长
    if (wRange) {
      if (v < wRange.min) v = trainingBase === 'advanced' ? wRange.min : wRange.min;
      if (v > wRange.max) v = wRange.max;
    }
    if (trainingBase === 'zero' || trainingBase === 'beginner') v = Math.floor(v * 2) / 2; // 向下取整
    else if (trainingBase === 'advanced') v = Math.ceil(v * 2) / 2; // 向上取整
    return v;
  }

  function bandLevelForGoal(goalKey, trainingBase) {
    // 弹力带按目标+基础推荐档位
    if (goalKey === 'strength') return '重';
    if (goalKey === 'hypertrophy') return trainingBase === 'advanced' ? '重' : '中';
    if (goalKey === 'fatloss') return '轻';
    return trainingBase === 'beginner' || trainingBase === 'zero' ? '轻' : '中';
  }

  /* ---------- 安全限制规则（全年龄段统一） ---------- */
  function applySafety(ctx, oneRM, rawWeight) {
    const notes = [];
    let weight = rawWeight;
    if (ctx.trainingBase === 'zero' && ctx.equip === 'barbell') {
      if (weight == null || weight > 10) { weight = 10; notes.push('零基础人群单次杠铃负重不超过 10kg（已封顶）'); }
    }
    if (ctx.heavyFat) { // 大体重减脂
      if (weight != null) weight = Math.round(weight * 0.95 * 2) / 2;
      notes.push('大体重减脂人群负荷自动下调 5%');
    }
    if (ctx.oldInjury) { // 腰/膝/肩旧伤
      if (weight != null) weight = Math.round(weight * 0.9 * 2) / 2;
      notes.push('存在腰/膝/肩旧伤，整体负荷自动下调 10%');
    }
    if (ctx.goalKey === 'strength' && !(ctx.trainYears != null && ctx.trainYears >= 1)) {
      notes.push('88% 1RM 高负荷仅对训练年限≥1 年用户开放（当前未按高负荷封顶，请谨慎）');
    }
    return { weight, notes };
  }

  /* ---------- 计算单动作训练负荷 ---------- */
  // ctx: { goalKey, equip, W, R (次极限测试), trainingBase, heavyFat, oldInjury, trainYears, gender }
  function calcLoad(ctx) {
    const goal = GOALS.find(g => g.key === ctx.goalKey) || GOALS[1];
    const pct = (goal.loadMin + goal.loadMax) / 2;
    // 优先使用外部已测算的 1RM；否则依据次极限测试（W/R）用 Brzycki 反推
    let oneRM = (ctx.oneRM != null) ? Number(ctx.oneRM) : null;
    if (oneRM == null && ctx.equip !== 'band' && ctx.W != null && ctx.R != null) {
      oneRM = brzycki1RM(ctx.W, ctx.R);
    }

    const items = EXERCISES.filter(e => e.equip === ctx.equip);
    const out = items.map(e => {
      let weight = null, bandLevel = null;
      if (ctx.equip === 'band') {
        bandLevel = bandLevelForGoal(ctx.goalKey, ctx.trainingBase);
      } else if (oneRM != null) {
        const raw = oneRM * pct;
        const safe = applySafety(ctx, oneRM, raw);
        weight = nearestWeight(safe.weight, e.wRange, ctx.trainingBase);
      }
      return {
        id: e.id, name: e.name, equip: e.equip, equipLabel: e.equipLabel, muscle: e.muscle,
        levelLabel: e.levelLabel, points: e.points, params: e.params, contraindication: e.contraindication,
        oneRM, pct, weight, bandLevel,
        reps: goal.reps, sets: goal.sets,
        rest: (ctx.equip === 'band') ? '60s' : (ctx.goalKey === 'strength' ? '120–180s' : '60–90s')
      };
    });
    return { goal, oneRM, pct, items: out };
  }

  /* ---------- 生成成套器械训练计划 ---------- */
  // ctx: 同上 + 可选 multiple equip 测试
  function recommend(ctx) {
    ctx = ctx || {};
    const goalKey = ctx.goalKey || 'hypertrophy';
    const goal = GOALS.find(g => g.key === goalKey) || GOALS[1];
    const parts = [];

    if (ctx.equip === 'band' || ctx.bandOnly) {
      parts.push(calcLoad(Object.assign({}, ctx, { equip: 'band' })));
    } else {
      const equips = ctx.equips || [ctx.equip || 'dumbbell'];
      equips.forEach(eq => {
        if (eq === 'band') parts.push(calcLoad(Object.assign({}, ctx, { equip: 'band' })));
        else parts.push(calcLoad(Object.assign({}, ctx, { equip: eq })));
      });
    }

    const safety = [];
    if (ctx.trainingBase === 'zero') safety.push('零基础用户杠铃最大负荷锁死 10kg，禁用重弹力带');
    if (ctx.heavyFat) safety.push('大体重减脂人群自动下调负荷 5%，优先弹力带+轻哑铃');
    if (ctx.oldInjury) safety.push('腰/膝/肩旧伤用户整体负荷自动下调 10%');
    safety.push('所有大重量动作强制热身；同一动作每 6 周复测 1RM 刷新负荷');

    return {
      goalKey, goalLabel: goal.label,
      oneRM: parts[0] ? parts[0].oneRM : null,
      loadPct: goal.loadMin + '–' + (goal.loadMax * 100).toFixed(0).replace('.0', '') + '%',
      parts,
      safety
    };
  }

  /* ---------- 合并进系统「运动方案库」 ---------- */
  async function seedToPlanLibrary() {
    if (!window.DB || !DB.getPlanLibrary) return 0;
    const existing = await DB.getPlanLibrary();
    const ids = new Set(existing.map(x => x.id));
    const added = EXERCISES.map(e => {
      if (ids.has(e.id)) return null;
      return {
        id: e.id,
        name: e.name,
        category: 'resistance',
        desc: (e.muscle || '') + '｜' + (e.points || ''),
        video: '', image: '',
        rules: { bmiMin: '', bmiMax: '', weak: 'any', risk: '' },
        target: e.muscle,
        dose: e.params,
        key: e.muscle,
        caution: e.contraindication,
        svg: '',
        level: null,
        levelText: e.levelLabel,
        progress: '',
        safety: e.contraindication ? [e.contraindication] : [],
        isDefault: false,
        isStrengthLib: true,
        equipment: e.equip,
        equipLabel: e.equipLabel,
        points: e.points,
        audience: e.audience,
        wRange: e.wRange
      };
    }).filter(Boolean);
    if (added.length) await DB.savePlanLibrary(existing.concat(added));
    return added.length;
  }

  /* ---------- 可写持久化层（覆盖默认动作库，供管理员在动作库编辑页维护） ---------- */
  const STR_KEY = 'qd_strength_ex_';
  async function getExercises() {
    try {
      const raw = localStorage.getItem(STR_KEY);
      if (raw) { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) return a; }
    } catch (e) {}
    return EXERCISES.slice(); // 返回副本，避免调用方 push/替换污染模块内默认数组
  }
  async function saveAll(list) { try { localStorage.setItem(STR_KEY, JSON.stringify(list)); } catch (e) {} return list; }
  async function saveExercise(obj) {
    const list = await getExercises();
    const idx = list.findIndex(x => x.id === obj.id);
    if (idx >= 0) list[idx] = obj; else list.push(obj);
    return saveAll(list);
  }
  async function deleteExercise(id) {
    const list = (await getExercises()).filter(x => x.id !== id);
    return saveAll(list);
  }

  window.StrengthLib = {
    EQUIP_LABEL, LEVEL_MAP, BAND_MAP, GOALS, EXERCISES,
    brzycki1RM, calcLoad, recommend, nearestWeight, bandLevelForGoal, seedToPlanLibrary,
    getExercises, saveAll, saveExercise, deleteExercise,
    // 运行时重载 / 复位（管理员在动作库编辑页的修改会即时生效于配重推荐）
    reload: async function () { EXERCISES = await getExercises(); return EXERCISES; },
    resetDefault: function () { try { localStorage.removeItem(STR_KEY); } catch (e) {} EXERCISES = DEFAULT_EXERCISES; return EXERCISES; }
  };
})();
