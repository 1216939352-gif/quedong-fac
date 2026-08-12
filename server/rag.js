'use strict';
/**
 * 轻量检索增强（RAG）— 鹊动 AI 临床指引知识库
 *
 * 设计：
 *   - 内置一份经人工整理的循证康复临床指引 + 方案模板知识库（非联网抓取，可离线）。
 *   - 每次生成请求到达时，依据评估上下文做轻量关键词打分检索，取 Top-K 片段注入
 *     系统提示，约束模型引用客观范围、列明禁忌、减少幻觉。
 *   - 无命中时自动跳过，不影响离线 / 降级路径。
 *
 * 注意：注入片段一律标注为「内部检索增强，仅作约束」，禁止模型原样回显给用户。
 */

const KB = [
  {
    tags: ['sarcopenia', 'elderly', '肌少症', '老年', '抗阻', 'strength', 'strengthtraining'],
    text:
      '老年肌少症运动处方（AWGS 2019 / EWGSOP2）：抗阻训练 2–3 次/周，强度 50%–80% 1RM（体弱者 50%–60% 起步），' +
      '每次 8–10 个多关节动作，每组 8–12 次、2–3 组；配合每周 ≥150 分钟中等强度有氧；蛋白质摄入 1.0–1.2 g/kg/d。' +
      '应避免 Valsalva 与高冲击动作，平衡训练防跌倒。',
  },
  {
    tags: ['isokinetic', '等速', '峰力矩', 'pt', 'strength', '肌力', 'peaktorque'],
    text:
      '等速肌力训练原则：60°/s 慢速测试反映最大峰力矩（PT），180–300°/s 反映肌肉耐力与疲劳指数；' +
      '向心/离心训练均有益，离心训练对肌腱适应更佳。双侧不对称（LSI<85% 或差异≥15%）须弱侧优先、双侧分设强度，避免代偿。',
  },
  {
    tags: ['isotonic', '等张', '1rm', 'rm', 'strength', '肌力', '负荷', 'load'],
    text:
      '等张肌力与 1RM：采用 Epley 公式由 XRM 估算 1RM（1RM≈负荷×(1+次数/30)）。训练强度须基于 1RM 锚定：' +
      '一般人群 60%–80% 1RM，康复/老年 40%–60% 1RM 起步；每次 2–4 组、每组 8–12 次，渐进超负荷。',
  },
  {
    tags: ['balance', '平衡', '柔韧', 'fall', '跌倒', 'proprioception', '平衡'],
    text:
      '平衡与跌倒预防：每周 ≥3 次平衡训练（太极、单脚站、平衡垫、重心转移），配合柔韧/ROM 训练' +
      '（每个大肌群静态拉伸 15–30 秒、2–4 组）。跌倒高危者先坐位/扶靠训练，再渐进至动态不稳平面。',
  },
  {
    tags: ['aerobic', '有氧', 'cardio', '心肺', 'endurance', 'endurance'],
    text:
      '有氧训练处方：每周 ≥150 分钟中等强度（40%–59% HRR 或主观 RPE 11–13）或 ≥75 分钟高强度，可分 3–5 次完成；' +
      '优选步行、骑车、水中运动等低冲击方式。心血管病史者须医学监护下渐进。',
  },
  {
    tags: ['osteoarthritis', '关节', 'oa', '置换', 'knee', 'hip', '膝', '髋', 'contraindication', '禁忌'],
    text:
      '骨关节炎 / 关节置换术后：避免深蹲至终末 ROM、高冲击与轴向超载；ROM 训练控制在无痛区间（如 0–60° 渐进），渐进抗阻；' +
      '肿胀期以等长、低负荷为主。禁忌：急性炎症、未控制疼痛、关节不稳定。',
  },
  {
    tags: ['cardiac', '心血管', 'hypertension', '高血压', 'contraindication', '禁忌', 'valsalva'],
    text:
      '心血管安全：避免屏气（Valsalva）；高血压未控制者暂缓高强度；冠心病/心衰者须症状限制、医学监护下运动，' +
      '强度 ≤40%–50% 储备心率起步。警惕心绞痛、异常气促、眩晕等红旗症状。',
  },
  {
    tags: ['neuro', '神经', 'stroke', '偏瘫', 'parkinson', '帕金森', '脊髓'],
    text:
      '神经肌肉疾病（卒中偏瘫、帕金森等）：以任务导向、重复训练与平衡本体感觉为主；抗阻采用低负荷高次数、' +
      '双侧不对称时健侧带动患侧；避免跌倒；注意痉挛与共济失调限制。',
  },
  {
    tags: ['frailty', '虚弱', 'cancer', '肿瘤', 'cachexia', '消耗'],
    text:
      '虚弱 / 肿瘤消耗状态：低起始强度（30%–40% 1RM）、短时段多次（每次 10–15 分钟、每日可分 2–3 次），' +
      '优先维持肌量与功能；营养（蛋白质+热量）与运动同步。',
  },
  {
    tags: ['lowback', '腰痛', 'lumbar', 'core', '核心', 'posture'],
    text:
      '慢性腰痛：以核心稳定（腹横肌、多裂肌、臀桥）与髋铰链模式训练为先，结合屈伸/旋转控制；' +
      '避免脊柱终末段过度负荷与弹震动作；McGill 式支撑优于传统仰卧起坐。',
  },
  {
    tags: ['pulmonary', '呼吸', 'copd', '肺', '呼吸康复'],
    text:
      '慢性肺病 / 呼吸康复：结合有氧耐力与上肢抗阻、呼吸肌训练；强度以不诱发明显低氧/气促为限；' +
      '采用间歇训练；监测 SpO2 与 Borg 评分。',
  },
  {
    tags: ['diabetes', '糖尿病', 'glucose', '血糖'],
    text:
      '糖尿病运动：优选餐后运动控糖；注意低血糖风险（尤其联用胰岛素/磺脲类），随身备糖；足部保护；' +
      '神经病变者避免高冲击与负重摩擦；强度同一般有氧+抗阻建议。',
  },
  {
    tags: ['pregnancy', '孕', '产后', 'pelvic', '盆底'],
    text:
      '孕产/盆底：避免仰卧位运动（中晚孕）、屏气与高冲击；以盆底肌训练（凯格尔）、呼吸与低冲击有氧为主；' +
      '产后需评估腹直肌分离与盆底功能后再进阶。',
  },
  {
    tags: ['pediatric', '儿童', '青少年', 'growth', '生长'],
    text:
      '儿童青少年：以趣味性、多方向移动与基础动作模式为主；避免过早大负荷专项化；' +
      '强调动作质量与骨骼发育安全，力量训练采用自体重与轻负荷高次数。',
  },
  {
    tags: ['fracture', '骨折', '术后', '骨愈合', '固定', 'osteoporosis'],
    text:
      '骨折术后 / 骨愈合期：早期以保护下等长收缩、未固定关节活动度维持为主，避免骨折端移位与旋转负荷；' +
      '骨痂形成后（约 4–6 周，遵医嘱）渐进抗阻，强度 30%–50% 1RM 起步；愈合后期强化本体感觉与功能性负重。禁忌：过早完全负重、未保护下的扭转。',
  },
  {
    tags: ['osteoporosis', '骨质疏松', '骨密度', '脆性骨折'],
    text:
      '骨质疏松运动处方：以负重（步行、太极）与抗阻（中等强度、避免脊柱屈曲负重）维持骨密度，防跌倒为核心；' +
      '避免脊柱前屈、旋转与高冲击动作，降低椎体压缩风险。强调平衡与髋部保护训练。',
  },
  {
    tags: ['shoulder', '肩', '旋转袖', 'rotator cuff', '肩袖', '冻结肩'],
    text:
      '肩袖 / 冻结肩：急性期以钟摆、被动活动与无痛 ROM 为主；亚急性期渐进等长→等张肩外旋/外展（弹力带低阻力）；' +
      '避免过顶终末位与内收内旋挤压。强调肩胛稳定肌（前锯肌、斜方肌下束）激活。',
  },
  {
    tags: ['cognitive', '认知', '痴呆', 'dementia', '阿尔茨海默', 'alzheimer'],
    text:
      '认知障碍 / 痴呆患者运动：以结构化、重复性、有监护的步态与平衡训练防跌倒为主，结合节律性活动（如节拍步行）；' +
      '强度低、组次短、强调安全与情绪安抚；避免复杂指令与高风险动作。',
  },
  {
    tags: ['lymphedema', '淋巴', '水肿', '乳腺癌术后'],
    text:
      '淋巴水肿（如乳腺癌术后）：以轻柔向心性手法引流、低阻力等长/有氧与皮肤护理为主；避免患侧高负荷抗阻、测血压与创伤；' +
      '运动以不诱发肿胀加重为度，循序渐进。',
  },
  {
    tags: ['renal', '肾', '透析', 'dialysis', '慢性肾病'],
    text:
      '慢性肾病 / 透析患者运动：以低中强度有氧（步行、骑车）与轻抗阻为主，透析日避免高强度；' +
      '注意贫血、骨病与容量负荷，监测血压；避免 Valsalva 与过度疲劳。',
  },
  {
    tags: ['ms', '多发性硬化', 'multiple sclerosis', '神经'],
    text:
      '多发性硬化（MS）：以耐受范围内的有氧（水中运动尤佳）、平衡与冷却策略为主；避免过热（症状暂时加重）；' +
      '疲劳管理优先，分次短时训练；注意痉挛与感觉障碍导致的平衡风险。',
  },
  {
    tags: ['obesity', '肥胖', '减重', 'weight loss', '代谢'],
    text:
      '肥胖 / 减重运动：优先低冲击有氧（步行、水中、骑车）保护关节，每周 ≥150–300 分钟；结合全身抗阻维持瘦体重；' +
      '渐进增加；关注膝踝负荷，避免跳跃与深蹲至终末 ROM。',
  },
  {
    tags: ['burn', '烧伤', '瘢痕', '植皮'],
    text:
      '烧伤康复：愈合后以关节活动度与抗挛缩体位保持为先，渐进抗阻恢复肌力；瘢痕处避免过度牵拉与摩擦；' +
      '注意皮肤敏感与温度耐受，运动强度低起步、防过劳。',
  },
  {
    tags: ['cardiac rehab', '心脏康复', '心梗', 'mi', 'bypass', '支架'],
    text:
      '心脏康复（心梗/PCI/搭桥后）：分阶段（I 住院期→II 门诊监护期→III 维持期），以监护下有氧为核心，' +
      '强度自 40%–50% 储备心率起步；结合危险因素管理与心理支持；红旗症状（胸痛、异常气短、眩晕）立即中止。',
  },
  {
    tags: ['nmes', 'ems', '神经肌肉电刺激', '电刺激', '电疗', '肌萎缩'],
    text:
      '神经肌肉电刺激（NMES/EMS）：用于卧床/制动或神经源性肌萎缩的肌肉维持与激活，常作为主动训练的补充而非替代；' +
      '参数遵设备说明，电极避开心前区与颈动脉窦，癫痫/起搏器/急性感染/皮肤破损处禁用；以低强度耐受起步，逐步延长刺激时长。',
  },
  {
    tags: ['aquatic', '水中运动', '水疗', '游泳', '浮力'],
    text:
      '水中运动 / 水疗：借助浮力降低关节负荷与跌倒风险，适合骨关节炎、肥胖、平衡差及术后早期；水温 28–32℃ 为宜，' +
      '以步行、蹬车、抗阻（水中器材）为主；注意防滑、入水/出水血压波动，癫痫或未控制心肺疾病者慎用。',
  },
  {
    tags: ['progression', '渐进超负荷', '周期化', 'periodization', '进阶'],
    text:
      '运动进阶原则：遵循渐进超负荷——先增加次数/组数，再提高负荷/强度，最后增加频率/复杂度；每 1–2 周微调，' +
      '以「下一次训练后无异常酸痛/疲劳」为度；采用周期化避免平台与过度训练；退阶优先于带痛强行。',
  },
  {
    tags: ['breastcancer', 'colorectal', '肿瘤康复', '乳腺癌', '结直肠', '淋巴'],
    text:
      '肿瘤康复（乳腺癌/结直肠等）：以低中强度有氧+抗阻维持肌力与体能，化疗期减量、血象低时暂停；' +
      '乳腺癌术后注意淋巴水肿防范（避免患侧高负荷/测血压/创伤），渐进肩ROM；结合营养与心理支持，运动以不诱发明显乏力为限。',
  },
  {
    tags: ['fibromyalgia', '慢性疼痛', 'chronicpain', '纤维肌痛'],
    text:
      '慢性疼痛 / 纤维肌痛：以低强度有氧（步行、水中）、柔韧与放松为主，避免诱发 flare 的高负荷；' +
      '采用 pacing（分段、不勉强），结合睡眠与情绪管理；强调「活动 ≠ 伤害」，逐步重建活动耐受。',
  },
  {
    tags: ['sarcopenicobesity', '肌少性肥胖', '少肌肥胖', 'sarcopenia', '肥胖'],
    text:
      '肌少性肥胖：兼顾增肌与减脂——蛋白质 1.0–1.2 g/kg/d 配合抗阻（50%–70% 1RM 起步），有氧以低冲击保护关节；' +
      '减重不宜过快（避免进一步丢肌），以体成分（肌肉量/握力）而非单纯体重评价效果。',
  },
  {
    tags: ['diabeticfoot', '糖尿病足', '足溃疡', '糖尿病', '周围神经'],
    text:
      '糖尿病足 / 周围神经病变：运动以非承重或低冲击为主（骑行、水中、坐姿抗阻），避免足底高压与摩擦破溃；' +
      '每日检查足部、穿着合适鞋袜；感觉缺失者防烫伤与外伤，神经病变避免高冲击与长时间负重行走。',
  },
  {
    tags: ['nutrition', '营养补充', '蛋白', '肌酸', 'omega3', '维生素d', '蛋白粉'],
    text:
      '运动营养支持：抗阻训练者蛋白质 1.2–1.6 g/kg/d 分次摄入；维生素 D 缺乏（<50 nmol/L）酌情补充以助肌力与跌倒预防；' +
      '肌酸（3–5 g/d）对增力有据，omega-3 有助抗炎与肌量；补剂不替代均衡膳食，肾功能异常者遵医嘱。',
  },
  {
    tags: ['beta-blocker', '用药', '心血管', '心率储备', 'hr'],
    text:
      '用药与运动交互：β 受体阻滞剂抑制心率反应，强度判定应改以「可交谈/自觉费力 RPE 11–13」而非靶心率；' +
      '利尿剂致容量波动需防体位性低血压；降糖药（尤其胰岛素/磺脲）运动前后防低血糖，随身备糖；血管扩张剂注意运动后低血压。',
  },
  {
    tags: ['vestibular', '前庭', '眩晕', '平衡'],
    text:
      '前庭 / 平衡障碍：以视觉-本体感觉分级训练（睁眼→闭眼、稳定面→软垫、基线→动态转头）渐进；' +
      '动作缓慢、有人监护防跌倒；眩晕急性期暂缓诱发动作，结合眼动与凝视稳定练习。',
  },
  {
    tags: ['hiit', '高强度间歇', '高强度'],
    text:
      '高强度间歇（HIIT）：对体能提升高效，但心血管/代谢风险者须医学评估与监护；' +
      '从低-中强度间歇起步，循序渐进；运动中警惕胸闷、异常气促、心律异常等红旗，必要时中止。',
  },
  {
    tags: ['breathing', '呼吸训练', '吸气肌', '腹式呼吸'],
    text:
      '呼吸训练：腹式/缩唇呼吸与吸气肌训练（IMT）改善通气效率与运动耐量，慢阻肺/心衰者获益；' +
      '每日数次、低阻力起步渐进；结合有氧时强调鼻吸口呼节奏，避免过度通气。',
  },
  {
    tags: ['diastasis', '腹直肌分离', '孕产', '盆底', 'pelvic'],
    text:
      '孕产 / 盆底细化：产后先评估腹直肌分离与盆底功能，分离>2 指避免仰卧起坐/卷腹；' +
      '以横向腹式激活、骨盆底凯格尔与低冲击有氧为先；咳嗽/用力时护腹，逐步进阶至核心负重。',
  },
  {
    tags: ['sedentary', '久坐', '静态生活', '生活方式'],
    text:
      '久坐行为干预：减少连续久坐（每 30–60 分钟起身活动 2–3 分钟），以日常活动量（步数 6000–8000/日）打底，' +
      '再叠加结构化有氧与抗阻；碎片化活动亦有益代谢，配合站立办公更佳。',
  },
  {
    tags: ['fall', '跌倒', 'tug', 'bbs', '起立行走', '平衡'],
    text:
      '跌倒风险评估与预防：可用起立-行走计时测试（TUG）、Berg 平衡量表（BBS）、30 秒椅子起立等筛查；' +
      '高风险者优先环境改造（防滑、扶手、照明）、平衡与下肢力量训练、必要时助行器与视力/用药 review。',
  },
  {
    tags: ['postcovid', '新冠', '阳康', '呼吸', '心肺'],
    text:
      '新冠后（长新冠）康复：以「症状 tolerated 的渐进活动」为核心，警惕运动后不耐受（PEM）—活动后 24–48 小时症状加重须退阶；' +
      '从低强度步行、呼吸与轻柔拉伸起步，有氧与抗阻缓增；心悸/胸痛/显著气促及时就医。',
  },
  {
    tags: ['cognitive', '双任务', 'dual task', '平衡', '认知'],
    text:
      '认知-运动双任务训练：在步行/平衡中叠加认知任务（计数、命名），提升多重任务下的步姿稳定，适合认知下降与跌倒高危老人；' +
      '由单任务熟练后再叠加，强度低、重安全，避免分心导致跌倒。',
  },
  {
    tags: ['functional', '功能性体适能', '椅子起立', '计时起立行走', '肌少症'],
    text:
      '功能性体适能训练：以生活化动作（椅子起立、提踵、踏步、推拉、转身取物）维持独立生活能力；' +
      '强度以「能标准完成、微喘不憋气」为度；与握力、步速、起立-行走时间等客观指标联动评价进展。',
  },
];

// ── 病种 / 科室分库（domain）────────────────────────────────────────────────
// 单一大库全量检索时，泛词重叠会把不相干科室的条目也带进 Top-K（例如查「肌少症」
// 命中「烧伤」「儿童」）。这里把 42 条知识按 tags 自动归入若干分库，检索时先做
// 一次「分库定位」，再在候选分库内召回，越库补齐用更高阈值 —— 准确率更高、干扰更少。
//
// 一条知识可同时属于多个分库（如「肌少性肥胖」同属 sarcopenia + metabolic）。
const DOMAINS = {
  sarcopenia: {
    label: '肌少症与衰弱',
    tags: ['sarcopenia', '肌少症', 'elderly', '老年', 'frailty', '虚弱', 'cachexia', '消耗',
      'functional', '功能性体适能', '椅子起立', 'nutrition', '营养补充', '蛋白', '肌酸', 'omega3', '维生素d',
      'sarcopenicobesity', '肌少性肥胖', '少肌肥胖'],
  },
  cardiopulmonary: {
    label: '心肺与运动耐力',
    tags: ['cardiac', '心血管', 'hypertension', '高血压', 'valsalva', 'cardiac rehab', '心脏康复', '心梗', 'mi', 'bypass', '支架',
      'pulmonary', '呼吸', 'copd', '肺', '呼吸康复', 'breathing', '呼吸训练', '吸气肌', '腹式呼吸',
      'hiit', '高强度间歇', '高强度', 'postcovid', '新冠', '阳康', '心肺',
      'beta-blocker', '用药', '心率储备', 'hr', 'aerobic', '有氧', 'cardio', 'endurance'],
  },
  ortho: {
    label: '骨科与运动损伤',
    tags: ['osteoarthritis', '关节', 'oa', '置换', 'knee', 'hip', '膝', '髋',
      'fracture', '骨折', '术后', '骨愈合', '固定', 'osteoporosis', '骨质疏松', '骨密度', '脆性骨折',
      'shoulder', '肩', '旋转袖', 'rotator cuff', '肩袖', '冻结肩',
      'lowback', '腰痛', 'lumbar', 'core', '核心', 'posture'],
  },
  neuro: {
    label: '神经与平衡',
    tags: ['neuro', '神经', 'stroke', '偏瘫', 'parkinson', '帕金森', '脊髓',
      'ms', '多发性硬化', 'multiple sclerosis',
      'cognitive', '认知', '痴呆', 'dementia', '阿尔茨海默', 'alzheimer', '双任务', 'dual task',
      'vestibular', '前庭', '眩晕', 'balance', '平衡', 'proprioception',
      'fall', '跌倒', 'tug', 'bbs', '起立行走'],
  },
  oncology: {
    label: '肿瘤康复',
    tags: ['cancer', '肿瘤', '肿瘤康复', 'lymphedema', '淋巴', '水肿', '乳腺癌术后',
      'breastcancer', '乳腺癌', 'colorectal', '结直肠'],
  },
  metabolic: {
    label: '代谢与内分泌',
    tags: ['diabetes', '糖尿病', 'glucose', '血糖', 'obesity', '肥胖', '减重', 'weight loss', '代谢',
      'diabeticfoot', '糖尿病足', '足溃疡', '周围神经',
      'renal', '肾', '透析', 'dialysis', '慢性肾病',
      'sedentary', '久坐', '静态生活', '生活方式'],
  },
  womens: {
    label: '孕产与盆底',
    tags: ['pregnancy', '孕', '产后', 'pelvic', '盆底', 'diastasis', '腹直肌分离', '孕产'],
  },
  modality: {
    label: '训练方法与理疗手段',
    tags: ['isokinetic', '等速', '峰力矩', 'pt', 'peaktorque', 'isotonic', '等张', '1rm', 'rm', '负荷', 'load',
      'strength', '肌力', 'strengthtraining', '抗阻', '柔韧',
      'progression', '渐进超负荷', '周期化', 'periodization', '进阶',
      'nmes', 'ems', '神经肌肉电刺激', '电刺激', '电疗', '肌萎缩',
      'aquatic', '水中运动', '水疗', '游泳', '浮力'],
  },
  special: {
    label: '特殊人群与慢性疼痛',
    tags: ['pediatric', '儿童', '青少年', 'growth', '生长',
      'burn', '烧伤', '瘢痕', '植皮',
      'fibromyalgia', '慢性疼痛', 'chronicpain', '纤维肌痛'],
  },
};

/** tag（小写）→ 所属分库列表 */
const TAG2DOMAIN = (function () {
  const m = new Map();
  Object.keys(DOMAINS).forEach((d) => {
    DOMAINS[d].tags.forEach((t) => {
      const key = String(t).toLowerCase();
      if (!m.has(key)) m.set(key, []);
      const arr = m.get(key);
      if (arr.indexOf(d) === -1) arr.push(d);
    });
  });
  return m;
})();

// 为每条知识计算归属分库（无命中 → general，仍可被全库兜底召回）
KB.forEach((doc) => {
  const set = new Set();
  doc.tags.forEach((t) => {
    const ds = TAG2DOMAIN.get(String(t).toLowerCase());
    if (ds) ds.forEach((d) => set.add(d));
  });
  doc.domains = set.size ? Array.from(set) : ['general'];
});

/** 简单分词：英文 ≥2 字母、中文 ≥2 字，去重为集合 */
function tokenize(text) {
  const s = String(text || '').toLowerCase();
  const words = s.match(/[a-z]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
  const set = new Set();
  for (const w of words) set.add(w);
  return set;
}

/**
 * 依据查询（评估上下文 JSON 文本）检索 Top-K 知识片段。
 * @param {string} query 评估上下文文本
 * @param {number} [k=4] 返回片段数
 * @returns {string[]} 命中的指引片段（文本数组，可能为空）
 */
// 别名 / 同义词映射：将口语化或中英文变体展开为规范标签 token，提升召回
const ALIASES = {
  '肌少': 'sarcopenia 肌少症', '少肌': 'sarcopenia', '肌肉减少': 'sarcopenia',
  '电刺激': 'nmes ems 神经肌肉', '电疗': 'nmes ems', 'nmes': 'nmes ems 神经肌肉', 'ems': 'nmes ems 神经肌肉',
  '水疗': 'aquatic 水中 游泳', '水中': 'aquatic 水中 游泳', '游泳': 'aquatic 有氧',
  '新冠': 'postcovid 呼吸 心肺', '阳康': 'postcovid', 'longcovid': 'postcovid',
  '纤维肌痛': 'fibromyalgia 慢性疼痛', '慢性疼痛': 'fibromyalgia', '肌少性肥胖': 'sarcopenicobesity 肥胖 肌少症', '少肌肥胖': 'sarcopenicobesity',
  '糖尿病足': 'diabeticfoot 糖尿病 足', '足溃疡': 'diabeticfoot', '周围神经': 'diabeticfoot 糖尿病',
  '蛋白粉': 'nutrition 蛋白 营养', '肌酸': 'nutrition 肌酸', '鱼油': 'nutrition omega3', '维生素d': 'nutrition 维生素d',
  '倍他乐克': 'beta-blocker 心血管', '心率储备': 'beta-blocker 心率 心血管', '阻滞剂': 'beta-blocker 心血管',
  '前庭': 'vestibular 平衡', '眩晕': 'vestibular 平衡',
  'hiit': 'hiit 高强度间歇', '高强度间歇': 'hiit',
  '吸气': 'breathing 呼吸 肺', '呼吸训练': 'breathing 呼吸',
  '腹直肌分离': 'diastasis 孕产 盆底', '盆底': 'pelvic 孕产 盆底',
  '久坐': 'sedentary 生活方式', '静态生活': 'sedentary',
  'tug': 'fall 跌倒 平衡', '起立行走': 'fall 跌倒', 'bbs': 'fall 跌倒 平衡',
  '双任务': 'cognitive 认知 平衡', 'dual': 'cognitive 平衡', '功能性': 'functional 平衡 核心', '椅子起立': 'functional 肌少症',
  '动态拉伸': '柔韧 拉伸', '静态拉伸': '柔韧 拉伸', '乳腺癌': 'breastcancer 淋巴 肿瘤', '结直肠': 'colorectal 肿瘤',
};
function expand(tokens) {
  const out = new Set(tokens);
  tokens.forEach((t) => {
    const a = ALIASES[t];
    if (a) a.split(/\s+/).forEach((x) => { if (x) out.add(x); });
  });
  return out;
}

function isCJK(s) { return /[\u4e00-\u9fa5]/.test(s); }

/**
 * 标签命中判定（分词补偿 + 短词防误命中）。
 *   - 精确 token 命中          → 2 分
 *   - 中文标签子串命中（≥2 字）→ 2 分：分词切不出嵌在「膝骨关节炎」里的「关节」，须靠子串兜底
 *   - 英文标签子串命中（≥4 字）→ 1 分：oa / ms / pt / hr / rm 这类短词只认精确命中，否则噪声极大
 */
function tagScore(tag, qTokens, ql) {
  const t = String(tag).toLowerCase();
  if (qTokens.has(t)) return 2;
  if (isCJK(t)) return (t.length >= 2 && ql.indexOf(t) !== -1) ? 2 : 0;
  return (t.length >= 4 && ql.indexOf(t) !== -1) ? 1 : 0;
}

/** 单篇打分：token 重叠 + tag 命中加权（标签是强信号） */
const _docTokenCache = new Map();
function docTokens(doc, idx) {
  if (!_docTokenCache.has(idx)) {
    _docTokenCache.set(idx, expand(tokenize(doc.text + ' ' + doc.tags.join(' '))));
  }
  return _docTokenCache.get(idx);
}
function scoreDoc(doc, idx, qTokens, ql) {
  const dTokens = docTokens(doc, idx);
  let overlap = 0;
  qTokens.forEach((t) => { if (dTokens.has(t)) overlap++; });
  let tagHit = 0;
  doc.tags.forEach((tg) => { tagHit += tagScore(tg, qTokens, ql); });
  return overlap + tagHit;
}

/**
 * 分库定位：由查询文本判断本次评估落在哪些科室/病种分库。
 * 精确 token 命中记 2 分，长标签子串命中记 1 分；只保留与首位分数相当的分库（最多 3 个）。
 * @returns {string[]} 命中的 domain key 列表（可能为空 → 调用方退回全库检索）
 */
function routeDomains(query, qTokens) {
  const ql = String(query || '').toLowerCase();
  if (!qTokens) qTokens = expand(tokenize(query));
  const scores = {};
  Object.keys(DOMAINS).forEach((d) => {
    let s = 0;
    DOMAINS[d].tags.forEach((tg) => { s += tagScore(tg, qTokens, ql); });
    if (s > 0) scores[d] = s;
  });
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  if (!ranked.length) return [];
  const top = scores[ranked[0]];
  // 与首位差距过大的弱相关科室不纳入，避免"定位了等于没定位"
  return ranked.filter((d) => scores[d] >= Math.max(2, top * 0.5)).slice(0, 3);
}

/**
 * 两段式检索（分库优先 + 越库补齐）。
 *   第一段：在定位到的分库内召回，阈值放宽（≥1）——科室已锁定，弱信号也可信。
 *   第二段：不足 K 时从全库补齐，阈值收紧（≥3）——只有强相关才允许越库。
 *   兜底  ：完全没定位到分库时，退回原全库检索（阈值 ≥2），行为与旧版一致。
 * @param {string} query 评估上下文文本
 * @param {number} [k=4]
 * @param {{domains?:string[]}} [opts] 可显式指定分库（跳过自动定位）
 * @returns {{text:string, domains:string[], score:number, via:string, tags:string[]}[]}
 */
function retrieveDetailed(query, k, opts) {
  k = k || 4;
  const raw = tokenize(query);
  if (!raw.size) return [];
  const qTokens = expand(raw);
  const ql = String(query || '').toLowerCase();
  const domains = (opts && Array.isArray(opts.domains) && opts.domains.length)
    ? opts.domains
    : routeDomains(query, qTokens);

  const all = KB.map((doc, idx) => ({ idx, doc, score: scoreDoc(doc, idx, qTokens, ql) }));
  const picked = [];
  const seen = new Set();
  const take = (list, via) => {
    list.sort((a, b) => b.score - a.score);
    for (const x of list) {
      if (picked.length >= k) break;
      if (seen.has(x.idx)) continue;
      picked.push({ idx: x.idx, doc: x.doc, score: x.score, via: via });
      seen.add(x.idx);
    }
  };

  const inDomain = (x) => x.doc.domains.some((d) => domains.indexOf(d) !== -1);
  if (domains.length) {
    // ① 分库内命中：科室已锁定，弱信号（≥1）也可信
    take(all.filter((x) => x.score >= 1 && inDomain(x)), 'domain');
    // ② 跨库强相关：只有 ≥3 分才允许越库（如肌少症合并糖尿病、心血管禁忌）
    if (picked.length < k) take(all.filter((x) => x.score >= 3), 'global');
    // ③ 同库填充：宁可补本科室的低分条目，也不引入不相干科室 —— 这是分库的核心收益
    if (picked.length < k) take(all.filter(inDomain), 'domain-fill');
  }
  // 未定位到任何分库时退回全库检索（阈值 ≥2），行为与旧版一致
  if (!picked.length) take(all.filter((x) => x.score >= 2), 'fallback');

  return picked.map((x) => ({
    text: x.doc.text,
    domains: x.doc.domains,
    tags: x.doc.tags,
    score: x.score,
    via: x.via,
  }));
}

/**
 * 依据查询（评估上下文 JSON 文本）检索 Top-K 知识片段。
 * 返回值保持为纯文本数组，与旧版调用方（ai-routes.ragContextBlock）完全兼容。
 */
function retrieve(query, k) {
  return retrieveDetailed(query, k).map((x) => x.text);
}

module.exports = { retrieve, retrieveDetailed, routeDomains, DOMAINS, KB };
