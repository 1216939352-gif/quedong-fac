/**
 * SarcExerciseLib —— 老年肌少症模块·居家徒手动作库（36 个）+ 智能匹配推荐算法
 *
 * 数据来源：用户提供的《鹊动老年肌少症模块·居家徒手动作库+智能匹配推荐算法》
 * 对外暴露：window.SarcExerciseLib
 *   · CATS             6 大动作分类（握力上肢 / 下肢增肌 / 核心稳定 / 平衡防跌倒 / 温和有氧 / 放松维持）
 *   · EXERCISES        36 个徒手动作（分类 / 难度梯度 / 参数 / 要点 / 适配标签 / 姿态）
 *   · match(ctx)       按文档「6 步优先级 + 4 干预分级(A/B/C/D) + 跌倒风险分层 + SPPB 过滤」自动匹配
 *                      输出：热身 / 主训练 / 防跌倒平衡 / 有氧减脂 / 放松拉伸 分组 + 推荐/可选/禁止 标记
 *   · seedToSarcLibrary() 存入肌少症模块独立动作库 (SarcDB.exerciseLibrary)
 */
(function () {
  'use strict';

  const CATS = [
    { key: 'grip_upper', label: '握力 & 上肢肌力', range: '1–6' },
    { key: 'lower', label: '下肢抗阻增肌', range: '7–14' },
    { key: 'core', label: '核心稳定', range: '15–18' },
    { key: 'balance', label: '平衡 & 步态防跌倒', range: '19–25' },
    { key: 'aerobic', label: '温和有氧舒缓', range: '26–30' },
    { key: 'relax', label: '肌肉放松 & 日常维持', range: '31–36' }
  ];

  /* ---------- 每条动作的医嘱注释（管理员可在库内维护） ---------- */
  const NOTES = {
    'H01': '全程缓慢用力、不憋气，可每日分多次完成',
    'H02': '肩部下沉放松，肘不过伸，避免斜方肌代偿',
    'H03': '手臂打开幅度以不痛为度，保护肩袖',
    'H04': '上臂发力感集中胸前，不耸肩',
    'H05': '背部贴墙，手臂沿墙缓慢滑动防扭伤',
    'H06': '肩胛后缩停留 3 秒，改善含胸圆肩',
    'H07': '抬腿约 10cm 即可，膝保持伸直、勾脚尖，避免腰部代偿',
    'H08': '坐姿伸膝，膝关节零负重最安全',
    'H09': '扶稳椅背向后轻踢，不甩腿',
    'H10': '侧抬腿控制速度，避免惯性摆动',
    'H11': '最大屈膝 30°，严禁深蹲以保护膝关节',
    'H12': '踮脚停留 2 秒，强化小腿肌群与踝周力量',
    'H13': '勾脚/踩脚活化踝泵，预防血栓',
    'H14': '脚踝画圈缓慢，提升本体感觉',
    'H15': '腹式内收不憋气，腰贴椅背',
    'H16': '侧弯幅度温和，不代偿扭腰',
    'H17': '骨盆后倾贴墙，激活深层核心',
    'H18': '俯卧抬胸幅度小，腰部不可发力过猛',
    'H19': '手扶椅背并拢站立，高跌倒风险必练',
    'H20': '半串联脚尖对脚心，循序渐进',
    'H21': '仅低风险老人，需有人看护下进行',
    'H22': '重心左右慢移，转身不急',
    'H23': '慢踏步统一步频，改善拖沓步态',
    'H24': '横向小步移动，扶稳支撑物',
    'H25': '坐站不用手借力，缓慢可控发力，强化下肢起坐力量',
    'H26': '无扶手原地走，速度以能正常说话为准',
    'H27': '云手动作连贯，重心放低',
    'H28': '坐姿划圈摆臂，低强度燃脂',
    'H29': '摆臂慢走，心肺低负荷',
    'H30': '扶墙上下矮台阶，降低内脏脂肪',
    'H31': '拉脚背贴臀，大腿前侧有拉伸感即可',
    'H32': '体前探拉伸小腿，静态不弹振',
    'H33': '后撤腿沉髋，髋部有牵拉感',
    'H34': '头侧倾缓慢，不耸肩',
    'H35': '双手上伸展展躯干，配合呼吸',
    'H36': '腹式呼吸放松，缓解慢性疲劳、降低交感张力'
  };

  // posture: seated(坐姿) / prone(俯卧) / stand_support(扶椅/靠墙) / stand_free(无扶手站立进阶)
  // level: ['初级'] 或 ['初级','进阶']
  const RAW = [
    [1, 'grip_upper', '坐姿握拳舒张', ['初级'], 'seated', '每组15次，2组', '双手用力握拳3秒，缓慢张开', '所有老人，初级首选', '肌力减退、握力＜27kg(男)/＜18kg(女)、SARC-F力量项得分高'],
    [2, 'grip_upper', '坐姿手臂平举（徒手）', ['初级', '进阶'], 'seated', '初级手臂抬至胸前；进阶抬至肩平；每组12次，2组', '缓慢起落不耸肩', '上肢肌力维持', ''],
    [3, 'grip_upper', '坐姿肩部外展舒展', ['初级'], 'seated', '每组12次，2组', '双手贴身体，缓慢向两侧打开再收回，保护肩袖', '改善上肢无力', ''],
    [4, 'grip_upper', '坐姿上臂屈伸（自重）', ['初级'], 'seated', '每组12次，2组', '双手搭胸前，上臂缓慢向上发力', '改善上肢骨骼肌量', ''],
    [5, 'grip_upper', '靠墙肩部拉伸激活', ['初级'], 'stand_support', '每组10次，2组', '背部贴墙，手臂缓慢上下滑动', '改善上肢无力、抬手困难', ''],
    [6, 'grip_upper', '坐姿肩胛收缩训练', ['初级'], 'seated', '每组12次，2组', '双肩向后向内夹紧3秒放松', '改善含胸、上肢发力不足', ''],

    [7, 'lower', '坐姿直腿抬高（单侧）', ['初级', '进阶'], 'seated', '初级10次/侧，进阶15次/侧', '坐椅上，一条腿伸直抬高10cm停留3秒，左右交替', '下肢增肌核心', '小腿围不足、SMI偏低、步速≤0.8m/s、肌少症前期'],
    [8, 'lower', '坐姿伸膝抬腿（直腿抬高）', ['初级'], 'seated', '每组12次，2组', '坐姿小腿向上伸直抬起，强化大腿前侧（股四头肌），膝关节零负重', '下肢增肌', ''],
    [9, 'lower', '站姿后踢腿（扶椅）', ['初级'], 'stand_support', '12次/侧，2组', '手扶椅背稳定，单侧小腿向后轻踢', '刺激臀大肌、大腿后侧', ''],
    [10, 'lower', '站姿侧抬腿（扶椅）', ['初级', '进阶'], 'stand_support', '12次/侧，2组', '手扶支撑物，单侧腿向侧面缓慢抬起', '改善下肢单侧肌力不平衡', ''],
    [11, 'lower', '靠墙浅静蹲（最大屈膝30°，严禁深蹲）', ['初级'], 'stand_support', '浅蹲保持10–30秒，分2组', '背部贴墙，双脚前移，浅蹲保持', '提升下肢整体肌力，保护膝盖', ''],
    [12, 'lower', '站姿抬踵提小腿（扶椅）', ['初级', '进阶'], 'stand_support', '12次/组，2组', '手扶椅背，脚尖踮起停留2秒落下', '改善小腿围不足、踝关节肌力弱', '小腿围不足'],
    [13, 'lower', '坐姿脚踝屈伸', ['初级'], 'seated', '每组15次，2组', '坐椅子，脚尖向上勾、向下踩，反复循环', '改善踝关节无力、步态拖沓', ''],
    [14, 'lower', '坐姿脚踝内外翻', ['初级'], 'seated', '每组12次，2组', '左右转动脚踝，强化脚踝本体感觉', '降低转弯跌倒风险', ''],

    [15, 'core', '坐姿收腹慢收缩', ['初级'], 'seated', '每组12次，2组', '坐直，腹部向内收紧5秒放松，不憋气', '改善躯干失衡', ''],
    [16, 'core', '坐姿躯干侧屈舒缓', ['初级'], 'seated', '每组10次/侧，2组', '腰背挺直，上半身缓慢左右侧弯', '改善躯干僵硬、重心偏移', ''],
    [17, 'core', '靠墙骨盆后倾激活', ['初级'], 'stand_support', '保持5秒/次，12次/组，2组', '背部贴墙，小腹收紧骨盆向后贴墙', '强化深层核心，缓解腰痛', ''],
    [18, 'core', '俯卧温和收腰（床上完成）', ['初级'], 'prone', '每组10次，2组', '俯卧床上，缓慢收紧腰腹，小幅抬胸', '力度轻柔，禁止腰部发力过猛', ''],

    [19, 'balance', '扶椅双脚并拢静态站立', ['初级'], 'stand_support', '10秒/组，3组', '手扶椅背，双脚并拢站立', '静态平衡入门，高跌倒风险必选', ''],
    [20, 'balance', '扶椅半串联站立（一脚脚尖对另一脚脚心）', ['初级', '进阶'], 'stand_support', '10秒/组，3组', '平衡进阶动作', 'SPPB得分6–9分人群核心训练', ''],
    [21, 'balance', '串联站立（一字脚前后站立，无扶手）', ['进阶'], 'stand_free', '10秒/组，2组', 'SPPB高分进阶训练', '仅跌倒低风险、SPPB≥10分老人推荐', ''],
    [22, 'balance', '站姿重心左右转移（扶椅）', ['初级'], 'stand_support', '每组10次，2组', '双脚分开与肩同宽，重心缓慢左右切换', '改善转身失衡', ''],
    [23, 'balance', '原地慢踏步（扶椅辅助）', ['初级'], 'stand_support', '每组1–2分钟，2组', '慢速高抬脚踏步，统一步频步幅', '改善步速减慢、拖沓步态', ''],
    [24, 'balance', '原地侧向慢移步', ['初级'], 'stand_support', '每组1分钟，2组', '手扶支撑，小步左右横向移动', '提升动态平衡能力', ''],
    [25, 'balance', '坐姿五次缓慢坐站（无手借力）', ['初级'], 'seated', '5次/组，2–3组', 'SPPB五次坐立测试对应训练', '改善起身无力、起身跌倒', ''],

    [26, 'aerobic', '室内慢速原地走（无扶手）', ['初级'], 'stand_free', '每分钟60步，单次10分钟，分2段完成', '温和消耗脂肪不分解肌肉', '单纯减脂、肌少性肥胖', ''],
    [27, 'aerobic', '舒缓太极基础云手（简化版）', ['初级'], 'stand_support', '8 式连贯练习，每式 4–6 次，2 组，约 10 分钟', '低强度有氧，兼顾平衡与燃脂', '高龄衰弱老人', ''],
    [28, 'aerobic', '坐姿上肢循环划圈有氧', ['初级'], 'seated', '每组1–2分钟，2组', '坐椅子，双手缓慢大圈摆动', '轻度提升日常热量消耗', ''],
    [29, 'aerobic', '站姿原地摆臂慢踏步', ['初级'], 'stand_free', '每组1–2分钟，2组', '小幅摆臂慢走，心肺低负荷', '适合高龄衰弱老人', ''],
    [30, 'aerobic', '居家原地轻踏台阶（矮台阶/书本垫高5cm）', ['初级'], 'stand_support', '每侧10次，2组', '扶墙辅助，缓慢上下矮台阶', '提升下肢消耗、降低内脏脂肪', '内脏脂肪≥9级'],

    [31, 'relax', '坐姿大腿前侧静态拉伸', ['初级'], 'seated', '停留15秒', '坐椅，单侧手轻拉脚背贴臀部', '放松大腿肌群', ''],
    [32, 'relax', '坐姿小腿后侧拉伸', ['初级'], 'seated', '停留15秒/侧，2组', '一条腿伸直，身体缓慢向前轻探', '拉伸小腿肌肉', ''],
    [33, 'relax', '站姿髋部舒缓拉伸（扶椅）', ['初级'], 'stand_support', '停留15秒/侧，2组', '单腿向后小幅后撤，髋部缓慢下沉', '放松臀部紧张肌肉', ''],
    [34, 'relax', '颈部温和左右侧拉伸', ['初级'], 'seated', '每侧停留10秒，2组', '坐姿，头缓慢向左右倾斜', '放松肩颈，避免代偿发力', ''],
    [35, 'relax', '全身舒展抬手拉伸', ['初级'], 'stand_support', '停留10秒，2组', '站姿双手交叉向上伸展', '舒展躯干，改善久坐僵硬', ''],
    [36, 'relax', '腹式呼吸肌肉放松', ['初级'], 'seated', '每组 5 次深呼吸，3 组，组间休息 30 秒', '腹式呼吸放松，缓解慢性疲劳', '', '']
  ];

  let EXERCISES = RAW.map(r => ({
    id: 'H' + String(r[0]).padStart(2, '0'),
    no: r[0],
    cat: r[1],
    catLabel: (CATS.find(c => c.key === r[1]) || {}).label || r[1],
    name: r[2],
    levels: r[3],
    levelLabel: r[3].join('/'),
    posture: r[4],
    params: r[5],
    points: r[6],
    audience: r[7],
    tags: r[8] ? r[8].split('、').map(s => s.trim()).filter(Boolean) : [],
    note: NOTES['H' + String(r[0]).padStart(2, '0')] || '',
    video: '', image: ''
  }));
  // 快照副本，用于 resetDefault 精确还原（不受运行时编辑影响）
  const DEFAULT_EXERCISES = EXERCISES.map(e => Object.assign({}, e));

  /* ---------- 评估因子归一化 ---------- */
  function fallLevelKey(idx) {
    if (idx == null) return 'low';
    if (idx >= 61) return 'high';
    if (idx >= 31) return 'mid';
    return 'low';
  }
  function sppbLevelKey(t) {
    if (t == null) return 's6_9';
    if (t <= 5) return 's0_5';
    if (t <= 9) return 's6_9';
    return 's10_12';
  }
  function gripLow(v, gender) {
    if (v == null) return false;
    return gender === 'female' ? v < 18 : v < 27;
  }

  /* ---------- 分类抽取区间 ---------- */
  function idsIn(range) { return EXERCISES.filter(e => range.indexOf(e.no) >= 0).map(e => e.id); }
  const R = {
    gripUpper: [1, 2, 3, 4, 5, 6],
    lower: [7, 8, 9, 10, 11, 12, 13, 14],
    core: [15, 16, 17, 18],
    balance: [19, 20, 21, 22, 23, 24, 25],
    aerobic: [26, 27, 28, 29, 30],
    relax: [31, 32, 33, 34, 35, 36]
  };
  let byId = {}; EXERCISES.forEach(e => byId[e.id] = e);
  function rebuildIndex() { byId = {}; EXERCISES.forEach(e => byId[e.id] = e); }
  const idsOf = (arr) => arr.map(n => 'H' + String(n).padStart(2, '0'));

  /* ---------- 主匹配算法 ---------- */
  function match(ctx) {
    ctx = ctx || {};
    const gradeKey = ctx.gradeKey || 'A';
    const fallKey = fallLevelKey(ctx.fallIndex);
    const sppbKey = sppbLevelKey(ctx.sppbTotal);
    const gLow = gripLow(ctx.gripValue, ctx.gender);
    const flags = {
      gripLow: gLow,
      calfLow: !!ctx.calfLow,
      smiLow: !!ctx.smiLow,
      stepLow: ctx.gaitValue != null && ctx.gaitValue <= 0.8,
      visceralHigh: ctx.visceral != null && ctx.visceral >= 9,
      bmiHigh: ctx.bmi != null && ctx.bmi >= 28,
      cfsWeak: ctx.cfsValue != null && (ctx.cfsValue === 4 || ctx.cfsValue >= 5),
      fatHigh: ctx.bodyFat != null && (ctx.gender === 'female' ? ctx.bodyFat >= 35 : ctx.bodyFat >= 28)
    };

    // 状态：recommend / optional / forbidden
    const status = {};
    EXERCISES.forEach(e => status[e.id] = 'optional');

    // —— 四、按干预分级「精选」主训练动作（单项推荐均不超过 12 个）——
    const PRIMARY_PLAN = {
      A: [1, 2, 7, 8, 11, 12, 15, 16, 19, 20, 26, 27],               // 维持：均衡覆盖各肌群
      B: [1, 2, 3, 7, 8, 10, 12, 15, 17, 31, 32],                   // 单纯增肌：上肢+下肢+核心+放松
      C: [26, 27, 28, 1, 2, 3, 7, 8, 15, 19, 20, 22],               // 单纯减脂：有氧为主+保肌抗阻
      D: [1, 2, 3, 7, 8, 11, 12, 15, 16, 26, 28, 30]                // 肌少性肥胖：抗阻+有氧交替
    };
    const primary = idsOf(PRIMARY_PLAN[gradeKey] || PRIMARY_PLAN.A);
    primary.forEach(id => status[id] = 'recommend');

    // —— 三、SPPB 评分梯度自动过滤 ——
    EXERCISES.forEach(e => {
      if (sppbKey === 's0_5') {
        // 仅开放坐姿/俯卧初级；屏蔽所有站立动作
        if (e.posture !== 'seated' && e.posture !== 'prone') status[e.id] = 'forbidden';
      } else if (sppbKey === 's6_9') {
        // 仅初级；屏蔽无扶手站立进阶动作
        if (e.posture === 'stand_free') status[e.id] = 'forbidden';
        if (e.levels.indexOf('进阶') >= 0 && e.levels.indexOf('初级') < 0) status[e.id] = 'forbidden';
      }
      // s10_12：全部解锁
    });

    // —— 四(2)、跌倒风险指数分层强制干预（全局）——
    if (fallKey === 'high') {
      // 成套第一个模块固定为防跌倒平衡（19–25 初级）
      idsOf([19, 20, 22, 23, 24, 25]).forEach(id => { if (status[id] !== 'forbidden') status[id] = 'recommend'; });
      // 屏蔽串联站立等高难度平衡
      if (status['H21'] !== 'forbidden') status['H21'] = 'forbidden';
      // 减少长时间站姿有氧，替换为坐姿有氧
      if (status['H29'] !== 'forbidden') status['H29'] = 'optional';
      status['H28'] = 'recommend'; // 坐姿有氧优先
    } else if (fallKey === 'mid') {
      idsOf([19, 20, 22, 25, 13]).forEach(id => { if (status[id] !== 'forbidden') status[id] = 'recommend'; });
      if (status['H21'] !== 'forbidden') status['H21'] = 'forbidden'; // 串联站立隐藏
    }
    // low：平衡作为辅助，不强制

    // —— 五、单项客观指标修正因子（微调）——
    if (flags.gripLow) { status['H01'] = 'recommend'; }      // 加倍推送坐姿握拳舒张
    if (flags.calfLow) { status['H12'] = 'recommend'; }       // 强制增加站姿抬踵
    if (flags.visceralHigh) { status['H23'] = 'recommend'; status['H30'] = 'recommend'; } // 踏步/矮台阶
    if (flags.bmiHigh) { status['H28'] = (status['H28'] === 'forbidden') ? 'forbidden' : 'recommend'; } // 增加坐姿有氧、减少站姿负重
    if (flags.cfsWeak) { idsOf([19, 20, 22]).forEach(id => { if (status[id] !== 'forbidden') status[id] = 'recommend'; }); }

    // —— 六、标准化输出模板：热身 + 主训练 + 防跌倒 + 有氧减脂 + 放松拉伸 ——
    const warmup = idsOf([34, 6, 13, 23]);         // 颈部拉伸、肩胛收缩、脚踝屈伸、原地慢踏步（避开与主训练重复的肩外展 H03）
    const stretch = idsOf(R.relax);                 // 31–36 固定放松
    const aerobic = idsOf(R.aerobic);
    const balance = idsOf(R.balance);

    // 频次与单次时长（按分级 + 风险）
    const freq = {
      A: '每周 3 次徒手维持抗阻 + 3 次舒缓有氧',
      B: '每周 3 次抗阻隔天训练 + 2 次超轻度有氧',
      C: '每周 4 次温和有氧 + 2 次简易保肌抗阻',
      D: '每周 3 次徒手抗阻增肌 + 3 次分段温和有氧（抗阻与有氧交替）'
    }[gradeKey];
    let duration = '20–25 分钟（热身 5 + 主训 10–15 + 放松 5）';
    if (sppbKey === 's0_5') duration = '单次 ≤15 分钟，动作分组、延长组间休息';

    // 安全禁忌提示
    const safety = ['无跳跃、无深蹲、无负重、无快速扭转，全部慢节奏可控发力'];
    if (fallKey !== 'low') safety.push('所有站姿动作须扶椅/靠墙辅助，高风险禁止单脚长时间独立站立、禁止闭眼站立');
    if (sppbKey === 's0_5') safety.push('仅限坐姿/俯卧动作，禁止无扶手站立进阶动作');
    safety.push('急性病、骨折、未控制慢病发作期暂缓训练');

    // 复查
    const reviewDays = gradeKey === 'D' ? 60 : 90;

    const recommended = EXERCISES.filter(e => status[e.id] === 'recommend').map(e => e.id);
    const optional = EXERCISES.filter(e => status[e.id] === 'optional').map(e => e.id);
    const forbidden = EXERCISES.filter(e => status[e.id] === 'forbidden').map(e => e.id);

    function group(title, ids) {
      return { title, items: ids.filter(id => status[id] !== 'forbidden').map(id => ({ id, name: byId[id].name, params: byId[id].params, level: byId[id].levelLabel, note: byId[id].note, posture: byId[id].posture, status: status[id] })) };
    }

    return {
      gradeKey, gradeLabel: { A: 'A类·维持现状', B: 'B类·单纯增肌', C: 'C类·单纯减脂', D: 'D类·肌少性肥胖' }[gradeKey],
      fallKey, fallLevel: { low: '低', mid: '中', high: '高' }[fallKey],
      sppbKey, sppbLevel: { s0_5: '重度功能衰退(0–5)', s6_9: '轻度功能衰退(6–9)', s10_12: '功能正常(10–12)' }[sppbKey],
      flags,
      freq, duration, safety, reviewDays,
      warmup: group('热身模块（约 5 分钟）', warmup),
      main: group('核心训练模块（按干预分级匹配）', primary.filter(id => status[id] === 'recommend')),
      balance: group('防跌倒平衡组（风险分层）', balance),
      aerobic: group('有氧 / 减脂组', aerobic),
      stretch: group('放松拉伸模块（5 分钟）', stretch),
      recommended, optional, forbidden
    };
  }

  /* ---------- 存入肌少症模块独立动作库 ---------- */
  async function seedToSarcLibrary() {
    if (!window.SarcDB || !SarcDB.saveExerciseLibrary) return 0;
    const existing = await SarcDB.getExerciseLibrary();
    if (existing && existing.length >= EXERCISES.length) return 0;
    await SarcDB.saveExerciseLibrary(EXERCISES);
    return EXERCISES.length;
  }

  /* ---------- 动作示意图（按姿态生成简笔人形 SVG） ---------- */
  function figureSVG(posture) {
    const c = '#3b82f6';
    let body;
    if (posture === 'seated') {
      body = `<rect x="12" y="40" width="40" height="6" rx="3" fill="${c}" opacity=".22"/><circle cx="32" cy="20" r="6" fill="${c}"/><line x1="32" y1="26" x2="32" y2="40" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="40" x2="18" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="40" x2="46" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="30" x2="22" y2="34" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="30" x2="42" y2="34" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (posture === 'stand_support') {
      body = `<line x1="52" y1="12" x2="52" y2="56" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".4"/><circle cx="30" cy="18" r="6" fill="${c}"/><line x1="30" y1="24" x2="30" y2="42" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="42" x2="22" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="42" x2="38" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="28" x2="50" y2="30" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="28" x2="20" y2="32" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (posture === 'prone') {
      body = `<rect x="8" y="46" width="48" height="6" rx="3" fill="${c}" opacity=".22"/><circle cx="18" cy="42" r="5" fill="${c}"/><line x1="22" y1="42" x2="52" y2="42" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="52" y1="42" x2="57" y2="34" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else {
      body = `<circle cx="32" cy="15" r="6" fill="${c}"/><line x1="32" y1="21" x2="32" y2="42" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="42" x2="24" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="42" x2="40" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="27" x2="22" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="27" x2="42" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    }
    return `<svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;"><rect x="0" y="0" width="64" height="64" rx="10" fill="${c}" opacity=".06"/>${body}</svg>`;
  }

  /* ---------- 可写持久化层（管理员在动作库编辑页维护，覆盖默认动作库） ---------- */
  async function getExercises() {
    try {
      const list = window.SarcDB ? SarcDB.getExerciseLibrary() : null;
      if (Array.isArray(list) && list.length) return list.slice();
    } catch (e) {}
    return EXERCISES.slice(); // 返回副本，避免调用方 push/替换污染模块内默认数组
  }
  async function saveExercise(obj) {
    const list = await getExercises();
    const idx = list.findIndex(x => x.id === obj.id);
    if (idx >= 0) list[idx] = obj; else list.push(obj);
    if (window.SarcDB && SarcDB.saveExerciseLibrary) SarcDB.saveExerciseLibrary(list);
    return list;
  }
  async function deleteExercise(id) {
    const list = (await getExercises()).filter(x => x.id !== id);
    if (window.SarcDB && SarcDB.saveExerciseLibrary) SarcDB.saveExerciseLibrary(list);
    return list;
  }
  async function reload() { EXERCISES = await getExercises(); rebuildIndex(); return EXERCISES; }
  function resetDefault() {
    if (window.SarcDB && SarcDB.saveExerciseLibrary) try { SarcDB.saveExerciseLibrary(DEFAULT_EXERCISES); } catch (e) {}
    EXERCISES = DEFAULT_EXERCISES; rebuildIndex(); return EXERCISES;
  }

  window.SarcExerciseLib = {
    CATS, EXERCISES, byId, NOTES,
    fallLevelKey, sppbLevelKey, gripLow,
    match, seedToSarcLibrary, figureSVG,
    getExercises, saveExercise, deleteExercise, reload, resetDefault
  };
})();
