/**
 * 鹊动FAC功能评估与干预系统 - 全局业务常量
 * 所有算法阈值、训练参数、设备档案集中定义，便于统一维护
 */

const CONST = {
  SYSTEM_NAME: '鹊动FAC功能评估与干预系统',
  VERSION: '内测版 V3.0.1',

  /* ============ 活动系数 ============ */
  ACTIVITY_LEVELS: [
    { key: 'sedentary', label: '久坐少动（办公室工作，几乎不运动）', coef: 1.2 },
    { key: 'light', label: '轻度活动（每周运动 1-3 天）', coef: 1.375 },
    { key: 'moderate', label: '中度活动（每周运动 3-5 天）', coef: 1.55 },
    { key: 'active', label: '高度活动（每周运动 6-7 天）', coef: 1.725 },
    { key: 'veryActive', label: '极高活动（体力劳动 / 双份训练）', coef: 1.9 }
  ],

  /* 工作体力等级 → 推荐活动系数联动 */
  WORK_INTENSITY_MAP: {
    sedentary: 'sedentary',
    light: 'light',
    moderate: 'moderate',
    heavy: 'active'
  },

  WORK_INTENSITY: [
    { key: 'sedentary', label: '久坐（办公室/驾驶）' },
    { key: 'light', label: '轻度体力（教师/销售）' },
    { key: 'moderate', label: '中度体力（护士/服务业）' },
    { key: 'heavy', label: '重度体力（搬运/建筑）' }
  ],

  /* ============ 减重阶段与热量缺口 ============ */
  WEIGHT_STAGES: [
    { key: 'mild', label: '温和减重（每周 0.3-0.4kg）', deficit: 300 },
    { key: 'standard', label: '标准减重（每周 0.45-0.5kg）', deficit: 500 },
    { key: 'intensive', label: '强化减重（每周 0.65-0.7kg）', deficit: 750 }
  ],

  CALORIE_FLOOR: { male: 1200, female: 1000 },
  FAT_KCAL_PER_KG: 7700,

  /* ============ BMI 分级（中国成人标准 WS/T 428-2013）============ */
  BMI_GRADES: [
    { max: 18.5, label: '偏瘦', level: 'info', advice: '体重低于健康范围，不建议减重' },
    { max: 24, label: '正常', level: 'success', advice: '体重处于健康范围，以体成分优化为主' },
    { max: 28, label: '超重', level: 'warning', advice: '需启动生活方式干预，目标减重 5%-10%' },
    { max: 32.5, label: '肥胖', level: 'danger', advice: '需系统性减重干预，目标减重 10%-15%' },
    { max: 999, label: '重度肥胖', level: 'danger', advice: '建议多学科联合管理，必要时评估药物或手术指征' }
  ],

  /* 腰臀比风险 */
  WHR_RISK: {
    male: [
      { max: 0.9, label: '低风险', level: 'success' },
      { max: 0.95, label: '中风险', level: 'warning' },
      { max: 99, label: '高风险', level: 'danger' }
    ],
    female: [
      { max: 0.8, label: '低风险', level: 'success' },
      { max: 0.85, label: '中风险', level: 'warning' },
      { max: 99, label: '高风险', level: 'danger' }
    ]
  },

  /* 腰围风险（中国标准，cm） */
  WAIST_RISK: { male: 90, female: 85 },

  /* 体脂率参考 */
  BODY_FAT_REF: {
    male: [
      { max: 10, label: '偏低', level: 'info' },
      { max: 20, label: '理想', level: 'success' },
      { max: 25, label: '偏高', level: 'warning' },
      { max: 99, label: '肥胖', level: 'danger' }
    ],
    female: [
      { max: 18, label: '偏低', level: 'info' },
      { max: 28, label: '理想', level: 'success' },
      { max: 32, label: '偏高', level: 'warning' },
      { max: 99, label: '肥胖', level: 'danger' }
    ]
  },

  /* ============ 肌力评估分级常量 ============ */
  PTBW_GRADES: {
    male: [
      { min: 2.0, label: '优秀', score: 15, level: 'success' },
      { min: 1.5, label: '良好', score: 10, level: 'success' },
      { min: 1.0, label: '一般', score: 0, level: 'warning' },
      { min: 0.8, label: '偏低', score: -5, level: 'warning' },
      { min: 0, label: '较差', score: -15, level: 'danger' }
    ],
    female: [
      { min: 1.5, label: '优秀', score: 15, level: 'success' },
      { min: 1.2, label: '良好', score: 10, level: 'success' },
      { min: 0.9, label: '一般', score: 0, level: 'warning' },
      { min: 0.7, label: '偏低', score: -5, level: 'warning' },
      { min: 0, label: '较差', score: -15, level: 'danger' }
    ]
  },

  FI_GRADES: [
    { max: 50, label: '耐力正常', score: 5, level: 'success', desc: '肌肉抗疲劳能力良好，可耐受连续训练负荷' },
    { max: 60, label: '需关注', score: 0, level: 'warning', desc: '肌肉耐力临界，训练中后段易出现动作变形' },
    { max: 999, label: '耐力显著下降', score: -10, level: 'danger', desc: '抗疲劳能力不足，需优先安排低负荷高次数耐力训练' }
  ],

  HQ_GRADES: [
    { min: 80, label: '偏高', score: 0, level: 'warning', desc: '腘绳肌相对股四头肌偏强，需加强伸膝肌群' },
    { min: 60, label: '理想', score: 10, level: 'success', desc: '屈伸肌群配比理想，膝关节动态稳定性好' },
    { min: 0, label: '偏低', score: -15, level: 'danger', desc: '腘绳肌薄弱，前交叉韧带及腘绳肌拉伤风险升高' }
  ],

  LSI_GRADES: [
    { max: 15, label: '双侧对称正常', score: 5, level: 'success', desc: '左右侧肌力差值在正常范围' },
    { max: 20, label: '轻度失衡', score: 0, level: 'warning', desc: '存在轻度双侧不对称，需针对弱侧强化' },
    { max: 999, label: '显著失衡', score: -10, level: 'danger', desc: '双侧差值≥20%，运动损伤及代偿性疼痛风险显著升高' }
  ],

  STRENGTH_LEVELS: [
    { min: 90, label: '优秀', level: 'success', color: '#16a34a' },
    { min: 80, label: '良好', level: 'success', color: '#22c55e' },
    { min: 70, label: '一般', level: 'warning', color: '#f59e0b' },
    { min: 60, label: '薄弱', level: 'warning', color: '#f97316' },
    { min: 0, label: '异常', level: 'danger', color: '#dc2626' }
  ],

  /* ============ 鹊动 9 台设备档案 ============ */
  DEVICES: [
    {
      id: '01', code: 'QD-01', name: '膝关节伸展测训单元', short: '伸膝',
      img: 'images/devices/quedong-01.jpg',
      muscles: '股四头肌', joints: '膝关节、踝关节',
      posture: '挺直身体坐于椅上，面向屏幕，双腿或单腿置于软垫下方，勾脚使足背抵住软垫，股四头肌发力带动膝关节伸展。',
      track: '小腿向上抬起，完成伸膝动作',
      isokinetic: true, muscleGroup: 'quadriceps',
      speeds: [60, 120, 180], rom: '0°-90°'
    },
    {
      id: '02', code: 'QD-02', name: '膝关节屈曲测训单元', short: '屈膝',
      img: 'images/devices/quedong-02.jpg',
      muscles: '股二头肌、半腱肌、半膜肌、腓肠肌', joints: '膝关节',
      posture: '挺直身体坐于椅上，双腿或单腿置于软垫上方，勾脚，腘绳肌发力带动膝关节屈曲。',
      track: '小腿下压，完成屈膝动作',
      isokinetic: true, muscleGroup: 'hamstrings',
      speeds: [60, 120, 180], rom: '0°-90°'
    },
    {
      id: '03', code: 'QD-03', name: '腹肌测训单元', short: '腹屈',
      img: 'images/devices/quedong-03.jpg',
      muscles: '腹直肌、腹外斜肌、腹内斜肌、髂腰肌', joints: '腰椎 L1-L5',
      posture: '挺直身体坐于椅上，双臂从下方抱住软垫，腹部肌群发力带动腰椎向前屈曲。',
      track: '收腹，躯干前屈',
      isokinetic: false, muscleGroup: 'abdominal',
      speeds: [], rom: '0°-45°'
    },
    {
      id: '04', code: 'QD-04', name: '背肌测训单元', short: '背伸',
      img: 'images/devices/quedong-04.jpg',
      muscles: '竖脊肌、臀大肌', joints: '腰椎、髋关节',
      posture: '挺直身体坐于椅上，后背紧贴软垫，腰部肌群发力带动腰椎向后伸展。',
      track: '向后仰躺，躯干后伸',
      isokinetic: false, muscleGroup: 'erector',
      speeds: [], rom: '0°-30°'
    },
    {
      id: '05', code: 'QD-05', name: '胸推测训单元', short: '胸推',
      img: 'images/devices/quedong-05.jpg',
      muscles: '胸大肌、背阔肌、三角肌、肱三头肌、肘肌', joints: '肩、肘关节',
      posture: '挺直身体坐于椅上，肩关节前屈外展，肘关节屈曲，双手紧握把手，肩胸肌群发力带动双臂向前推。',
      track: '水平向前推把手，完成胸推动作',
      isokinetic: true, muscleGroup: 'chest',
      speeds: [60, 120], rom: '全程'
    },
    {
      id: '06', code: 'QD-06', name: '坐式划船测训单元', short: '划船',
      img: 'images/devices/quedong-06.jpg',
      muscles: '斜方肌、菱形肌、三角肌、背阔肌、肱二头肌、肱肌、肱桡肌', joints: '肩、肘关节',
      posture: '挺直身体坐于椅上，肩关节前屈外展，肘关节伸直，双手紧握把手，肩背胸肌群发力带动双臂向后拉。',
      track: '水平后拉把手，完成模拟划船动作',
      isokinetic: true, muscleGroup: 'back',
      speeds: [60, 120], rom: '全程'
    },
    {
      id: '07', code: 'QD-07', name: '下压复合测训单元', short: '下压',
      img: 'images/devices/quedong-07.jpg',
      muscles: '菱形肌、背阔肌、胸大肌、肩胛下肌、冈下肌、小圆肌、大圆肌、三角肌、肱三头肌', joints: '肩、肘关节',
      posture: '挺直身体坐于椅上，肩关节外展，肘关节屈曲，双手紧握把手，背部肌群发力带动双臂向下压。',
      track: '垂直向下压把手，完成下压动作',
      isokinetic: true, muscleGroup: 'back',
      speeds: [60, 120], rom: '全程'
    },
    {
      id: '08', code: 'QD-08', name: '高拉复合测训单元', short: '高拉',
      img: 'images/devices/quedong-08.jpg',
      muscles: '斜方肌、菱形肌、三角肌后束、背阔肌、冈下肌、小圆肌、大圆肌、肱二头肌', joints: '肩、肘关节',
      posture: '挺直身体坐于椅上，肩关节前屈双臂上举，肘关节伸直，双手紧握把手，背部肌群发力带动双臂从高位向下拉。',
      track: '将把手向下拉，完成高位下拉动作',
      isokinetic: true, muscleGroup: 'back',
      speeds: [60, 120], rom: '全程'
    },
    {
      id: '09', code: 'QD-09', name: '下肢蹬踏测训单元', short: '蹬踏',
      img: 'images/devices/quedong-09.jpg',
      muscles: '小腿三头肌、股四头肌、臀大肌', joints: '髋、膝关节',
      posture: '挺直身体紧靠椅背，双腿屈髋屈膝，脚放于踏板上，双手紧握把手，下肢肌群发力用力蹬踏。',
      track: '伸膝带动座椅向后滑动，完成下肢蹬踏动作',
      isokinetic: true, muscleGroup: 'legs',
      speeds: [60, 120], rom: '全程'
    }
  ],

  /* ============ 有氧训练 FITT-VP 三阶段 ============ */
  AEROBIC_PHASES: [
    {
      key: 'adapt', name: '适应期', weeks: '第 1-4 周',
      frequency: '3-4 次/周', duration: '20-30 min/次',
      intensityPct: [0.40, 0.50], rpe: '9-11（轻松—有点吃力）',
      weeklyTotal: '90-120 min/周',
      goal: '建立运动习惯，提升关节耐受度与心肺基础，避免运动损伤',
      note: '以低冲击有氧为主，允许分段累积（如每次 10min × 3 段）'
    },
    {
      key: 'build', name: '强化期', weeks: '第 5-12 周',
      frequency: '4-5 次/周', duration: '30-45 min/次',
      intensityPct: [0.50, 0.65], rpe: '12-14（有点吃力—吃力）',
      weeklyTotal: '150-225 min/周',
      goal: '达到 ACSM 减重推荐运动量，最大化脂肪氧化效率',
      note: '可引入 1 次/周低强度间歇（如快走 3min + 慢走 2min × 6 组）'
    },
    {
      key: 'consolidate', name: '巩固期', weeks: '第 13 周起',
      frequency: '5-6 次/周', duration: '45-60 min/次',
      intensityPct: [0.60, 0.75], rpe: '13-15（吃力）',
      weeklyTotal: '250-300 min/周',
      goal: '维持减重成果、防止体重反弹，提升最大摄氧量',
      note: 'ACSM 建议长期维持 ≥250 min/周有氧以预防减重反弹'
    }
  ],

  /* 护膝护腰运动优先级（低冲击优先） */
  AEROBIC_PRIORITY: [
    { name: '快走', impact: '极低', desc: '关节负荷最小，适合 BMI≥28 及膝腰不适人群起始首选', kcal: '250-350 kcal/h' },
    { name: '椭圆机', impact: '极低', desc: '足部无腾空冲击，上下肢协同，能耗高于快走', kcal: '400-500 kcal/h' },
    { name: '游泳 / 水中运动', impact: '无', desc: '浮力卸载关节压力，适合重度肥胖与骨关节炎人群', kcal: '400-550 kcal/h' },
    { name: '骑行 / 功率自行车', impact: '低', desc: '坐位支撑体重，注意坐垫高度避免髌股关节压力', kcal: '350-500 kcal/h' },
    { name: '慢跑', impact: '中高', desc: '落地冲击约 2-3 倍体重，建议 BMI<28 且无膝痛者采用', kcal: '500-700 kcal/h' },
    { name: '划船机', impact: '低（但腰椎要求高）', desc: '腰背核心力量不足者易代偿腰痛，需先掌握动作模式', kcal: '450-600 kcal/h' }
  ],

  /* ============ 抗阻训练分阶段参数 ============ */
  RESISTANCE_PHASES: [
    { key: 'adapt', name: '适应期（1-4 周）', frequency: '2 次/周', intensity: '自重 / 40-50% 1RM', reps: '12-15 次', sets: '1-2 组', rest: '60-90 s', focus: '学习动作模式，建立神经肌肉控制' },
    { key: 'build', name: '强化期（5-12 周）', frequency: '2-3 次/周', intensity: '60-70% 1RM', reps: '10-12 次', sets: '2-3 组', rest: '60 s', focus: '提升肌肉量，保护减重期瘦体重' },
    { key: 'consolidate', name: '巩固期（13 周起）', frequency: '3 次/周', intensity: '70-80% 1RM', reps: '8-12 次', sets: '3-4 组', rest: '90-120 s', focus: '提升最大肌力与基础代谢率' }
  ],

  /* ============ 食物红绿灯分类 ============ */
  FOOD_TRAFFIC: [
    {
      category: '主食类',
      green: '燕麦、糙米、藜麦、荞麦面、玉米、红薯、山药、全麦面包',
      yellow: '白米饭、白面条、馒头、米粉（控制在每餐 1 拳大小）',
      red: '油条、炸糕、酥饼、方便面、加糖面包、糯米制品'
    },
    {
      category: '蛋白类',
      green: '鸡胸肉、鱼虾、鸡蛋白、脱脂牛奶、无糖豆浆、北豆腐、瘦牛肉',
      yellow: '全蛋、瘦猪肉、全脂牛奶、奶酪、鸭肉（去皮）',
      red: '肥肉、五花肉、香肠、培根、午餐肉、炸鸡、鱼丸/蟹棒'
    },
    {
      category: '蔬菜类',
      green: '西兰花、菠菜、生菜、芹菜、黄瓜、番茄、菌菇、白萝卜（每日≥500g）',
      yellow: '土豆、莲藕、豌豆、南瓜（需计入主食份额）',
      red: '油焖茄子、干煸豆角、地三鲜等重油烹调蔬菜'
    },
    {
      category: '水果类',
      green: '草莓、蓝莓、柚子、苹果、猕猴桃、圣女果（每日 200-350g）',
      yellow: '香蕉、葡萄、芒果、荔枝（控制 100g 以内）',
      red: '果汁、果脯、罐头水果、水果捞（加糖加奶盖）'
    },
    {
      category: '脂肪类',
      green: '橄榄油、山茶油、亚麻籽油（每日 20-25g）、原味坚果 10g',
      yellow: '花生油、大豆油、牛油果、芝麻酱',
      red: '黄油、猪油、棕榈油、植脂末、奶油、油炸食品'
    },
    {
      category: '饮品类',
      green: '白开水、淡茶、黑咖啡（无糖）、无糖气泡水',
      yellow: '无糖豆浆、脱脂奶、低糖酸奶（≤5g 糖/100g）',
      red: '含糖饮料、奶茶、果汁、能量饮料、酒精饮品'
    }
  ],

  /* ============ 生活方式问卷维度 ============ */
  LIFE_SURVEY: [
    {
      dim: 'diet', title: '日常饮食结构', icon: '🍚',
      questions: [
        { key: 'dietStructure', label: '您的日常饮食结构以哪类为主？', type: 'radio', options: [
          { v: 'balanced', t: '均衡（主食+蛋白+蔬菜齐全）', score: 4 },
          { v: 'carbHeavy', t: '主食占比偏高，蛋白蔬菜少', score: 2 },
          { v: 'meatHeavy', t: '重油重肉，蔬菜摄入少', score: 1 },
          { v: 'irregular', t: '饥一顿饱一顿，无固定结构', score: 0 }
        ]},
        { key: 'vegIntake', label: '每日蔬菜摄入量（生重）', type: 'radio', options: [
          { v: 'ge500', t: '≥500g（约 2 大碗）', score: 4 },
          { v: 'g300', t: '300-500g', score: 3 },
          { v: 'g150', t: '150-300g', score: 1 },
          { v: 'lt150', t: '<150g', score: 0 }
        ]},
        { key: 'friedFreq', label: '油炸/重油食品摄入频率', type: 'radio', options: [
          { v: 'never', t: '基本不吃', score: 4 },
          { v: 'weekly1', t: '每周 1-2 次', score: 3 },
          { v: 'weekly3', t: '每周 3-5 次', score: 1 },
          { v: 'daily', t: '几乎每天', score: 0 }
        ]},
        { key: 'eatSpeed', label: '平均一餐进食时长', type: 'radio', options: [
          { v: 'ge20', t: '≥20 分钟，细嚼慢咽', score: 4 },
          { v: 'm15', t: '15-20 分钟', score: 3 },
          { v: 'm10', t: '10-15 分钟', score: 1 },
          { v: 'lt10', t: '<10 分钟，狼吞虎咽', score: 0 }
        ]},
        { key: 'snackNight', label: '夜宵/加餐频率', type: 'radio', options: [
          { v: 'never', t: '从不', score: 4 },
          { v: 'weekly1', t: '每周 1-2 次', score: 2 },
          { v: 'weekly3', t: '每周 3-5 次', score: 1 },
          { v: 'daily', t: '几乎每天', score: 0 }
        ]}
      ]
    },
    {
      dim: 'sleep', title: '作息规律与熬夜', icon: '🌙',
      questions: [
        { key: 'sleepRegular', label: '作息规律程度', type: 'radio', options: [
          { v: 'veryRegular', t: '非常规律，每天固定时间睡起', score: 4 },
          { v: 'regular', t: '基本规律，偶有波动', score: 3 },
          { v: 'irregular', t: '不太规律，波动大于 2 小时', score: 1 },
          { v: 'chaos', t: '完全不规律 / 倒班', score: 0 }
        ]},
        { key: 'stayUpFreq', label: '熬夜频率（23:30 后入睡）', type: 'radio', options: [
          { v: 'never', t: '基本不熬夜', score: 4 },
          { v: 'weekly1', t: '每周 1-2 次', score: 3 },
          { v: 'weekly3', t: '每周 3-5 次', score: 1 },
          { v: 'daily', t: '几乎每天', score: 0 }
        ]},
        { key: 'sleepDuration2', label: '每日实际睡眠时长', type: 'radio', options: [
          { v: 'h7', t: '7-9 小时', score: 4 },
          { v: 'h6', t: '6-7 小时', score: 2 },
          { v: 'lt6', t: '<6 小时', score: 0 },
          { v: 'gt9', t: '>9 小时但仍疲乏', score: 1 }
        ]},
        { key: 'sleepQuality2', label: '睡眠质量自评', type: 'radio', options: [
          { v: 'good', t: '入睡快、少醒、晨起精神好', score: 4 },
          { v: 'fair', t: '一般，偶尔夜醒', score: 2 },
          { v: 'poor', t: '入睡困难或频繁夜醒', score: 0 }
        ]}
      ]
    },
    {
      dim: 'sedentary', title: '久坐与日常活动', icon: '🪑',
      questions: [
        { key: 'sitHours', label: '每日累计久坐时长（含办公、看屏）', type: 'radio', options: [
          { v: 'lt4', t: '<4 小时', score: 4 },
          { v: 'h4', t: '4-6 小时', score: 3 },
          { v: 'h6', t: '6-8 小时', score: 1 },
          { v: 'ge8', t: '≥8 小时', score: 0 }
        ]},
        { key: 'breakFreq', label: '久坐中途起身活动频率', type: 'radio', options: [
          { v: 'q30', t: '每 30-60 分钟起身活动一次', score: 4 },
          { v: 'q120', t: '约每 2 小时一次', score: 2 },
          { v: 'rare', t: '很少主动起身', score: 0 }
        ]},
        { key: 'dailySteps', label: '日均步数（手机/手环记录）', type: 'radio', options: [
          { v: 'ge10000', t: '≥10000 步', score: 4 },
          { v: 's7000', t: '7000-10000 步', score: 3 },
          { v: 's4000', t: '4000-7000 步', score: 1 },
          { v: 'lt4000', t: '<4000 步', score: 0 }
        ]}
      ]
    },
    {
      dim: 'water', title: '饮水习惯', icon: '💧',
      questions: [
        { key: 'waterAmount', label: '每日饮水量（不含含糖饮料）', type: 'radio', options: [
          { v: 'ge2000', t: '≥2000 ml', score: 4 },
          { v: 'ml1500', t: '1500-2000 ml', score: 3 },
          { v: 'ml1000', t: '1000-1500 ml', score: 1 },
          { v: 'lt1000', t: '<1000 ml', score: 0 }
        ]},
        { key: 'waterTiming', label: '饮水时机', type: 'radio', options: [
          { v: 'even', t: '全天均匀，主动定时饮水', score: 4 },
          { v: 'thirsty', t: '口渴才喝', score: 1 },
          { v: 'concentrated', t: '集中在某个时段大量喝', score: 2 }
        ]},
        { key: 'sugarDrink2', label: '含糖饮料（奶茶/可乐/果汁）频率', type: 'radio', options: [
          { v: 'never', t: '从不', score: 4 },
          { v: 'weekly1', t: '每周 1-2 次', score: 2 },
          { v: 'weekly3', t: '每周 3-5 次', score: 1 },
          { v: 'daily', t: '每天≥1 杯', score: 0 }
        ]}
      ]
    },
    {
      dim: 'posture', title: '不良体态与身体不适', icon: '🧍',
      questions: [
        { key: 'postureIssues', label: '存在以下哪些体态问题？（可多选）', type: 'checkbox', options: [
          { v: 'forwardHead', t: '头前伸 / 圆肩驼背' },
          { v: 'lordosis', t: '骨盆前倾 / 腰椎前凸加大' },
          { v: 'kneeValgus', t: '膝内扣 X 型腿' },
          { v: 'flatFoot', t: '扁平足 / 足弓塌陷' },
          { v: 'scoliosis', t: '高低肩 / 脊柱侧弯倾向' },
          { v: 'none', t: '无明显体态问题' }
        ]},
        { key: 'painArea', label: '近 3 个月出现疼痛/不适部位（可多选）', type: 'checkbox', options: [
          { v: 'neck', t: '颈肩' },
          { v: 'lowBack', t: '腰部' },
          { v: 'knee', t: '膝关节' },
          { v: 'ankle', t: '踝/足底' },
          { v: 'none', t: '无不适' }
        ]},
        { key: 'balanceSelf', label: '平衡能力自评（单腿站立可维持时间）', type: 'radio', options: [
          { v: 'ge30', t: '≥30 秒稳定', score: 4 },
          { v: 's15', t: '15-30 秒', score: 3 },
          { v: 's5', t: '5-15 秒', score: 1 },
          { v: 'lt5', t: '<5 秒或无法完成', score: 0 }
        ]}
      ]
    },
    {
      dim: 'psych', title: '情绪压力与减重动机', icon: '🧠',
      questions: [
        { key: 'stressEat', label: '情绪化进食（压力大时暴食）', type: 'radio', options: [
          { v: 'never', t: '从不', score: 4 },
          { v: 'sometimes', t: '偶尔', score: 2 },
          { v: 'often', t: '经常', score: 0 }
        ]},
        { key: 'motivation', label: '减重动机与执行信心', type: 'radio', options: [
          { v: 'high', t: '动机强烈，愿意长期坚持', score: 4 },
          { v: 'medium', t: '有意愿，但担心难坚持', score: 2 },
          { v: 'low', t: '被动配合，信心不足', score: 0 }
        ]},
        { key: 'socialSupport', label: '家庭/同伴支持度', type: 'radio', options: [
          { v: 'strong', t: '家人共同参与，支持度高', score: 4 },
          { v: 'some', t: '部分支持', score: 2 },
          { v: 'none', t: '缺乏支持甚至有阻力', score: 0 }
        ]}
      ]
    }
  ],

  /* 生活方式各维度改善建议库（按维度得分率分档输出） */
  LIFE_ADVICE: {
    diet: {
      poor: [
        '【立即执行】采用"餐盘法"重构每餐结构：1/2 餐盘非淀粉类蔬菜、1/4 优质蛋白、1/4 全谷主食，无需称重即可控量。',
        '【本周目标】将白米白面替换 1/3 为糙米、燕麦、藜麦等全谷物，膳食纤维目标 25-30g/日。',
        '【烹饪改造】家中备控油壶（每日 25g 限量）、厨房秤；用蒸、煮、炖、凉拌替代煎炸，每周油炸食品 ≤1 次。',
        '【进食行为】每口咀嚼 20 次以上，单餐进食时间延长至 20 分钟；进餐顺序固定为：汤/水 → 蔬菜 → 蛋白 → 主食。',
        '【夜宵管理】设定"厨房关门时间"（睡前 3 小时），如确需加餐，选择 200ml 无糖酸奶或 1 个水煮蛋。'
      ],
      fair: [
        '【结构微调】在现有基础上把每日蔬菜提升至 500g，其中深色蔬菜占一半以上。',
        '【蛋白前置】三餐均分配优质蛋白（每餐 20-30g），避免蛋白集中在晚餐。',
        '【外食策略】外卖点餐时主动备注"少油少盐"，优先选择清蒸/白灼类，涮水去油后食用。'
      ],
      good: [
        '【维持巩固】当前饮食结构良好，继续保持餐盘法与固定进餐顺序。',
        '【精细优化】关注隐形糖与隐形盐（酱料、腌制品），每日食盐 <5g、添加糖 <25g。'
      ]
    },
    sleep: {
      poor: [
        '【睡眠优先】睡眠不足会升高饥饿素（ghrelin）、降低瘦素（leptin），直接削弱减重效果——把规律作息作为本阶段第一优先级。',
        '【固定锚点】设定固定起床时间（含周末浮动 ≤1 小时），起床后 30 分钟内接受 10 分钟自然光照，重置生物钟。',
        '【睡前程序】睡前 1 小时断电子屏幕，改为拉伸/温水泡脚/呼吸训练（4-7-8 呼吸法 5 轮）。',
        '【环境改造】卧室温度 18-22℃、全暗、安静；床只用于睡眠。',
        '【咖啡因管理】14:00 后停止摄入咖啡、浓茶；睡前 3 小时禁酒。'
      ],
      fair: [
        '【时长达标】将睡眠时长稳定在 7-8 小时，逐步把入睡时间提前，每 3 天提前 15 分钟。',
        '【减少夜醒】晚餐避免过饱及高脂，睡前 2 小时限制饮水量。'
      ],
      good: [
        '【继续保持】作息规律、睡眠质量良好，是减重成功的重要保障。',
        '【周期监测】可用手环记录深睡比例，训练强度提升期注意睡眠恢复。'
      ]
    },
    sedentary: {
      poor: [
        '【打断久坐】设置每 45 分钟起身提醒，进行 3 分钟活动（原地踏步/靠墙静蹲/深蹲 10 次），全天累积"运动零钱"。',
        '【NEAT 提升】增加非运动性活动产热：提前一站下车步行、爬楼替代电梯、站立办公 2 小时/日，可额外消耗 200-400 kcal/日。',
        '【步数阶梯】以当前日均步数为基线，每周递增 1000 步，4 周内达到 8000 步/日。',
        '【工位改造】使用升降桌或站立会议；把水杯放远，制造起身机会。'
      ],
      fair: [
        '【稳步提升】日均步数目标 8000-10000 步，其中中等强度快走 ≥30 分钟。',
        '【碎片活动】午休后步行 10 分钟，有助于餐后血糖控制。'
      ],
      good: [
        '【保持活跃】日常活动量良好，继续维持并注意运动后拉伸恢复。'
      ]
    },
    water: {
      poor: [
        '【定量定时】准备 500ml 水杯，每日 4 杯（晨起/上午/下午/傍晚），总量 1500-2000ml，餐前 30 分钟饮水 300ml 有助于降低进食量。',
        '【戒糖饮】含糖饮料是减重最大隐形陷阱（1 杯全糖奶茶≈400-500 kcal）。采用阶梯戒断：全糖→半糖→无糖茶→白水，2 周完成过渡。',
        '【替代方案】用柠檬片水、无糖气泡水、淡茶替代甜饮，满足口感需求。'
      ],
      fair: [
        '【均匀分配】避免集中大量饮水，改为全天小口多次。',
        '【运动补水】运动前 500ml、运动中每 15-20 分钟 150-200ml。'
      ],
      good: [
        '【维持习惯】饮水量与时机良好，继续保持无糖饮品习惯。'
      ]
    },
    posture: {
      poor: [
        '【体态矫正】针对检出的体态问题，纳入每日 10 分钟"松解 + 激活"程序：松解紧张肌（胸小肌、髂腰肌、腓肠肌），激活薄弱肌（下斜方肌、臀中肌、深层核心）。',
        '【疼痛管理】存在关节疼痛部位，运动方案自动切换为低冲击模式（快走/椭圆机/水中运动），避免跑跳类动作。',
        '【平衡强化】平衡能力不足是跌倒与运动损伤的独立危险因素，需按平衡训练处方逐级进阶。',
        '【专业评估】如疼痛持续 >4 周或伴放射痛/麻木，建议至康复医学科完成专项评估。'
      ],
      fair: [
        '【预防为主】每日完成拉伸序列，重点关注颈肩与髋前侧。',
        '【核心稳定】每周 2-3 次核心稳定训练（死虫式、鸟狗式、平板支撑）。'
      ],
      good: [
        '【维持良好】体态与平衡能力良好，保持规律拉伸即可。'
      ]
    },
    psych: {
      poor: [
        '【识别触发】记录"情绪-进食"日记，标注暴食前的情绪与场景，找出高危时段并预设替代行为（散步/听音乐/给朋友打电话）。',
        '【压力管理】每日 10 分钟正念呼吸或渐进性肌肉放松；每周 ≥2 次户外活动。',
        '【目标拆解】把总减重目标拆为每月 2-3kg 的小目标，达成即给予非食物奖励（如新运动装备）。',
        '【支持系统】邀请 1 位家人共同参与饮食改造，或加入医院体重管理随访群，提高依从性。'
      ],
      fair: [
        '【增强动机】使用体重、腰围、体脂三指标共同追踪，避免单一体重波动打击信心。',
        '【预案准备】提前规划聚餐、出差等高风险场景的应对策略。'
      ],
      good: [
        '【动机充足】保持良好心态与支持系统，长期依从性是减重成功的关键。'
      ]
    }
  },

  /* 复评时间节点 */
  FOLLOWUP_PLAN: [
    { time: '第 2 周', items: '体重、腰围、依从性回访；饮食日记复盘' },
    { time: '第 4 周', items: '体重、腰围、体成分复测；有氧强度进阶评估' },
    { time: '第 8 周', items: '体成分 + 生活方式问卷复评；训练方案迭代' },
    { time: '第 12 周', items: '全套复评：体格、体成分、肌力（等速/等张）、生活方式；生成阶段总结报告' },
    { time: '第 24 周', items: '维持期评估，制定长期防反弹策略' }
  ],

  /* 肌力复测提醒周期（天） */
  RETEST_CYCLE_DAYS: 84
};

window.CONST = CONST;
