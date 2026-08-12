/**
 * 方案内核引擎 v1（严谨版 / PlanEngine）
 * --------------------------------------------------------------
 * 职责：
 *  1. 鹊动设备处方库 QD_RX —— 9 台设备，处方级内容（靶缺损指征 / 等速参数 / 退阶进阶 / 动作要领 / 禁忌 / 配图引用）
 *  2. 居家徒手内容库 BW —— 6 大动作模式 × 3 级（退阶 / 基础 / 进阶），规整可执行
 *  3. 可解释匹配引擎 match / generate —— 安全闸门优先 → 人群×目标×设备矩阵 → 强度锚定客观数据 → LSI 弱侧处理 → 组装统一 plan schema
 *  4. 渲染 renderHTML、设备模式提示 askDeviceMode、配图钩子 illustration() / registerImage()
 *
 * 设计原则：
 *  - 与现有 buildPlan / renderPlanHTML 并存，不改动旧方案；由 Pages.plan 的「严谨版」开关调用。
 *  - 所有结论可解释：summary.reasons 记录每条设备选择与强度锚定的数据依据。
 *  - 强度锚定客观数据：等张 1RM（Brzycki 反推）→ 负荷%；等速峰力矩 → 等速%；无数据则降级。
 *  - 设备处方双模式：有客观数据走 strict；无数据时由医生在 askDeviceMode 中选择「仅宣教徒手」或「凭评估推断建议」。
 */
(function () {
  'use strict';

  var U = window.U || (window.U = {});
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? null : n; };
  var esc = U.esc || function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var latest = function (arr) { if (!arr || !arr.length) return null; return [].slice.call(arr).sort(function (a, b) { return new Date(b.testDate) - new Date(a.testDate); })[0]; };
  var round05 = function (v) { return Math.round(v * 2) / 2; };

  /* ============================================================
   * 1. 鹊动设备处方库 QD_RX
   * ============================================================ */
  var QD_RX = {
    '01': {
      id: '01', code: 'QD-01', name: '膝关节伸展测训单元', short: '伸膝', category: 'lower',
      muscles: '股四头肌（股直肌、股外侧肌、股内侧肌、股中间肌）', joints: '膝关节、踝关节',
      isokinetic: true, speeds: [60, 120, 180], rom: '0°-90°',
      goal: '强化股四头肌，提升伸膝峰力矩，改善起立、上下楼梯与推进能力',
      indications: [
        { when: 'hq_high', text: 'H/Q 比值偏高，伸膝肌群相对不足，需优先强化股四头肌' },
        { when: 'lsi_unilateral', text: '双侧伸膝肌力不对称（差值≥15%），需弱侧单侧伸膝强化' },
        { when: 'knee', text: '膝关节不适/骨关节炎，需低冲击闭链伸膝以稳定髌股关节' },
        { when: 'default', text: '下肢基础伸膝肌力训练，维持推进与起立功能' }
      ],
      keyPoints: [
        '坐稳、骨盆中立，腰背贴紧椅背，避免代偿性躯干前倾',
        '伸膝至终末 0° 时短暂停顿 1 秒，强调股内侧肌激活',
        '离心阶段（放下）控制 3 秒，比向心更利于肌腱适应',
        '勾脚尖使足背抵住软垫，避免小腿三头肌代偿'
      ],
      progression: [
        '阶段1（第1-2周）：向心模式 60°/s，主观努力 50-60%，建立动作控制',
        '阶段2（第3-4周）：加入离心 3 秒控制，速度保持 60°/s',
        '阶段3（第5周起）：提速至 120-180°/s 等速模式，发展爆发与耐力',
        '阶段4：单侧独立模式 / 功能性闭链整合（如台阶起立衔接）'
      ],
      contraindication: [
        '急性膝关节损伤、半月板术后早期（≤6 周）或关节腔积血',
        '重度髌股关节痛且伸膝诱发剧痛',
        '未控制的高血压（≥160/100 mmHg）急性发作期'
      ],
      illustrationRef: 'qd-01'
    },
    '02': {
      id: '02', code: 'QD-02', name: '膝关节屈曲测训单元', short: '屈膝', category: 'lower',
      muscles: '腘绳肌（股二头肌、半腱肌、半膜肌）、腓肠肌', joints: '膝关节',
      isokinetic: true, speeds: [60, 120, 180], rom: '0°-90°',
      goal: '强化腘绳肌，纠正 H/Q 失衡，保护前交叉韧带、降低再损伤风险',
      indications: [
        { when: 'hq_low', text: 'H/Q 比值偏低（<60%），腘绳肌薄弱，优先强化屈膝肌群' },
        { when: 'lsi_unilateral', text: '双侧不对称，需弱侧单侧屈膝强化以纠正代偿' },
        { when: 'knee', text: '膝关节术后 / 韧带康复期，需离心控制保护髌腱与 ACL' },
        { when: 'default', text: '下肢基础屈膝肌力训练，维持 H/Q 平衡' }
      ],
      keyPoints: [
        '勾脚尖、足跟带动软垫向下，避免脚趾代偿',
        '向心与离心均放慢节奏，强调腘绳肌离心控制（落地减速能力）',
        '骨盆稳定，腰椎中立，禁止躯干扭转借力',
        '如有关节弹响伴疼痛立即停止并评估'
      ],
      progression: [
        '阶段1：向心 60°/s，主观努力 50-60%，熟悉腘绳肌孤立发力',
        '阶段2：离心 3 秒控制，降低速度至 30-60°/s 强化肌腱',
        '阶段3：120-180°/s 等速，提升屈伸肌协调与耐力',
        '阶段4：单侧模式 + 功能性减速训练（如单腿缓冲）'
      ],
      contraindication: [
        '腘绳肌急性拉伤 / 肌腱炎发作期',
        '后交叉韧带急性损伤',
        '膝屈曲诱发锐痛者暂缓'
      ],
      illustrationRef: 'qd-02'
    },
    '03': {
      id: '03', code: 'QD-03', name: '腹肌测训单元', short: '腹屈', category: 'core',
      muscles: '腹直肌、腹外斜肌、腹内斜肌、髂腰肌', joints: '腰椎 L1-L5',
      isokinetic: false, speeds: [], rom: '0°-45°',
      goal: '增强躯干前屈与控制能力，提升核心稳定与脊柱保护',
      indications: [
        { when: 'core_weak', text: '核心/腹部薄弱，需针对性前屈控制训练' },
        { when: 'sarcopenia', text: '肌少症人群核心肌量下降，需低负荷可控核心训练' },
        { when: 'elderly', text: '老年人群腰椎稳定需求高，需安全可控的腹部训练' },
        { when: 'back', text: '腰背不适者需强化腹压以分担腰椎负荷' }
      ],
      keyPoints: [
        '双手托住软垫，避免颈部前伸代偿（勿抱头猛拉）',
        '呼气收腹、腰椎贴紧椅背，脊柱逐节前屈',
        '控制幅度在无痛范围，严禁弹震式猛起',
        '下背有牵拉感即停止，保持骨盆中立'
      ],
      progression: [
        '阶段1：小幅前屈（0-20°），呼气控制，RPE 9-11',
        '阶段2：增至 30-45°，可加 1-2kg 胸前负荷',
        '阶段3：结合旋转（对角）激活腹斜肌',
        '阶段4：动态核心整合（坐-站转移中的腹压维持）'
      ],
      contraindication: [
        '急性腰椎间盘突出发作期',
        '腹压升高禁忌者（如未控制青光眼、近期腹部手术）',
        '前屈诱发下肢放射痛者'
      ],
      illustrationRef: 'qd-03'
    },
    '04': {
      id: '04', code: 'QD-04', name: '背肌测训单元', short: '背伸', category: 'core',
      muscles: '竖脊肌、臀大肌', joints: '腰椎、髋关节',
      isokinetic: false, speeds: [], rom: '0°-30°',
      goal: '强化脊柱后伸肌群，改善姿势性腰痛、维持脊柱矢状面平衡',
      indications: [
        { when: 'back', text: '腰背不适/姿势性腰痛，需强化竖脊肌分担负荷' },
        { when: 'core_weak', text: '核心后链薄弱，需背伸肌群强化' },
        { when: 'sarcopenia', text: '肌少症相关姿势退化，需低负荷背伸训练' },
        { when: 'elderly', text: '老年人群脊柱稳定需求，需可控背伸' }
      ],
      keyPoints: [
        '后背贴紧软垫，缓慢后仰、逐节伸展，避免手腿蹬地借力',
        '在无痛终末位短暂停顿，强调竖脊肌离心控制',
        '幅度以不诱发腰痛为限，严禁过度后伸',
        '配合腹式呼吸，避免憋气 Valsalva'
      ],
      progression: [
        '阶段1：小幅后伸（0-10°），RPE 9-11，建立控制',
        '阶段2：增至 20-30°，可加 1-2kg 胸前负荷',
        '阶段3：结合髋伸（臀大肌）协同',
        '阶段4：功能性姿势维持（坐姿-站姿转换稳定）'
      ],
      contraindication: [
        '急性腰椎间盘突出 / 椎管狭窄急性发作',
        '后伸诱发下肢放射痛或麻木',
        '脊柱骨折未愈合者'
      ],
      illustrationRef: 'qd-04'
    },
    '05': {
      id: '05', code: 'QD-05', name: '胸推测训单元', short: '胸推', category: 'upper',
      muscles: '胸大肌、三角肌前束、肱三头肌', joints: '肩、肘关节',
      isokinetic: true, speeds: [60, 120], rom: '全程',
      goal: '强化上肢推撑肌群，改善推门、支撑、抱持等日常功能',
      indications: [
        { when: 'upper_default', text: '上肢基础推撑肌力训练' },
        { when: 'sarcopenia', text: '肌少症上肢肌量下降，需推类抗阻' },
        { when: 'elderly', text: '老年人群需维持上肢功能性推撑力量' }
      ],
      keyPoints: [
        '肩胛骨后缩下沉，避免耸肩代偿',
        '双手握把与肩同宽，腕关节中立不折腕',
        '推至肘微屈（不锁死），回程控制 2 秒',
        '腰椎贴椅背，避免挺腹借力'
      ],
      progression: [
        '阶段1：向心 60°/s，主观努力 50-60%',
        '阶段2：离心 2-3 秒控制',
        '阶段3：120°/s 等速提升爆发',
        '阶段4：单侧模式纠正左右不对称'
      ],
      contraindication: [
        '肩峰下撞击综合征急性期',
        '肩关节置换术后早期（遵医嘱）',
        '推挤诱发肩痛者'
      ],
      illustrationRef: 'qd-05'
    },
    '06': {
      id: '06', code: 'QD-06', name: '坐式划船测训单元', short: '划船', category: 'upper',
      muscles: '斜方肌中下束、菱形肌、背阔肌、肱二头肌', joints: '肩、肘关节',
      isokinetic: true, speeds: [60, 120], rom: '全程',
      goal: '强化上肢拉类与肩胛后缩肌群，纠正圆肩驼背、改善姿势',
      indications: [
        { when: 'posture', text: '体态异常（圆肩/驼背），需强化肩胛后缩肌群' },
        { when: 'upper_default', text: '上肢基础拉类肌力训练' },
        { when: 'sarcopenia', text: '肌少症上肢后链薄弱，需划船类抗阻' }
      ],
      keyPoints: [
        '挺胸、肩胛后缩下沉，避免含胸耸肩',
        '肘部贴躯干后拉，感受背阔肌与菱形肌收缩',
        '回程控制 2 秒，不甩臂',
        '颈部中立，不低头含胸'
      ],
      progression: [
        '阶段1：向心 60°/s，主观努力 50-60%',
        '阶段2：离心 2-3 秒控制',
        '阶段3：120°/s 等速',
        '阶段4：单侧模式纠正不对称'
      ],
      contraindication: [
        '肩袖损伤急性期',
        '颈椎病患者避免过度后缩诱发头晕',
        '拉拽诱发肩痛者'
      ],
      illustrationRef: 'qd-06'
    },
    '07': {
      id: '07', code: 'QD-07', name: '下压复合测训单元', short: '下压', category: 'upper',
      muscles: '背阔肌、胸大肌下部、肱三头肌、三角肌后束', joints: '肩、肘关节',
      isokinetic: true, speeds: [60, 120], rom: '全程',
      goal: '强化肩肱三头与背阔下压力量，提升推压与支撑功能',
      indications: [
        { when: 'upper_default', text: '上肢复合下压肌力训练' },
        { when: 'sarcopenia', text: '肌少症上肢前链与伸肘力量维持' }
      ],
      keyPoints: [
        '双手握把、大臂贴躯干，仅前臂下压',
        '避免耸肩、挺腹，核心收紧',
        '下压至肘伸直不锁死，回程控制',
        '肩肘联动，不甩腕'
      ],
      progression: [
        '阶段1：向心 60°/s，主观努力 50-60%',
        '阶段2：离心控制 2-3 秒',
        '阶段3：120°/s 等速',
        '阶段4：单侧模式'
      ],
      contraindication: [
        '肘关节炎急性肿痛',
        '肩峰下撞击急性期',
        '下压诱发肘/肩痛者'
      ],
      illustrationRef: 'qd-07'
    },
    '08': {
      id: '08', code: 'QD-08', name: '高拉复合测训单元', short: '高拉', category: 'upper',
      muscles: '背阔肌、斜方肌下束、三角肌后束、肱二头肌', joints: '肩、肘关节',
      isokinetic: true, speeds: [60, 120], rom: '全程',
      goal: '强化背阔与肩后链，改善体态、提升下拉与悬吊功能',
      indications: [
        { when: 'posture', text: '圆肩/驼背体态，需强化背阔与肩后束' },
        { when: 'upper_default', text: '上肢复合高拉肌力训练' },
        { when: 'sarcopenia', text: '肌少症上肢后链力量维持' }
      ],
      keyPoints: [
        '双臂上举握把，挺胸沉肩',
        '用背阔肌发力将把手下拉至锁骨上缘，不耸肩',
        '回程缓慢控制，不借惯性',
        '颈部中立，避免头前伸'
      ],
      progression: [
        '阶段1：向心 60°/s，主观努力 50-60%',
        '阶段2：离心控制 2-3 秒',
        '阶段3：120°/s 等速',
        '阶段4：单侧模式'
      ],
      contraindication: [
        '肩袖损伤急性期',
        '颈椎病患者控制幅度',
        '下拉动诱发肩颈痛者'
      ],
      illustrationRef: 'qd-08'
    },
    '09': {
      id: '09', code: 'QD-09', name: '下肢蹬踏测训单元', short: '蹬踏', category: 'lower',
      muscles: '股四头肌、臀大肌、小腿三头肌', joints: '髋、膝关节',
      isokinetic: true, speeds: [60, 120], rom: '全程',
      goal: '复合蹬踏模式，整体提升下肢力量与功能性推进，纠正双侧代偿',
      indications: [
        { when: 'lsi_unilateral', text: '双侧差值≥15%，需单侧蹬踏纠正代偿模式' },
        { when: 'obesity', text: '肥胖/BMI≥28，需低冲击闭链复合蹬踏保护关节' },
        { when: 'default', text: '下肢整体力量与功能性蹬踏模式训练' }
      ],
      keyPoints: [
        '背贴椅背、双足踩实踏板，避免撅臀代偿',
        '伸膝蹬踏时呼气，强调臀大肌与股四头肌协同',
        '全脚掌发力，不踮脚尖',
        '控制节奏，不弹震'
      ],
      progression: [
        '阶段1：向心 60°/s，双足同步，主观努力 50-60%',
        '阶段2：单侧独立模式，弱侧 4 组 / 强侧 3 组',
        '阶段3：120°/s 等速提升功率',
        '阶段4：功能性整合（蹬踏-起立衔接）'
      ],
      contraindication: [
        '急性髋/膝损伤',
        '严重膝骨关节炎伴关节积液',
        '蹬踏诱发关节剧痛者'
      ],
      illustrationRef: 'qd-09'
    }
  };

  /* ============================================================
   * 2. 居家徒手内容库 BW（6 模式 × 3 级）
   * ============================================================ */
  var BW = {
    push: {
      key: 'push', name: '推（上肢推撑）', target: '胸大肌、三角肌前束、肱三头肌',
      levels: [
        { level: '退阶', name: '靠墙俯卧撑', dose: { reps: '8-12 次', sets: '2-3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['双脚与肩同宽靠墙站立，双手撑墙与肩同高', '身体斜倾，肘部 45° 外展缓慢推起', '核心收紧，避免塌腰', '可减小倾角降低难度'],
          regressIf: '肩部活动受限或腕部不适时减小倾角', progressIf: '能标准完成 3×12 且无肩腕不适 → 进阶',
          illustrationRef: 'bw-push-1' },
        { level: '基础', name: '标准俯卧撑（膝撑可选）', dose: { reps: '10-15 次', sets: '3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['双手略宽于肩，身体成直线', '下沉至胸近地面，肘 45° 外展', '推起时呼气、肩胛后缩', '膝撑可降低负荷'],
          regressIf: '不能保持躯干直线则退回靠墙', progressIf: '标准完成 3×15 → 进阶',
          illustrationRef: 'bw-push-2' },
        { level: '进阶', name: '上斜 / 负重俯卧撑', dose: { reps: '8-12 次', sets: '3-4 组', rest: '75 s', freq: '每周 3 次' },
          keyPoints: ['手撑于稳固台阶/沙发边增加幅度', '可背负重物（书包）增加负荷', '保持慢速控制', '强调 full range'],
          regressIf: '肩痛或动作变形则回到基础', progressIf: '可完成 3×12 负重 → 维持并周期化',
          illustrationRef: 'bw-push-3' }
      ]
    },
    pull: {
      key: 'pull', name: '拉（上肢后链）', target: '背阔肌、斜方肌中下束、肱二头肌',
      levels: [
        { level: '退阶', name: '门框弹力带水平外展', dose: { reps: '10-15 次', sets: '2-3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['弹力带固定于门框，双手拉向体侧', '肩胛后缩下沉，挺胸', '回程缓慢控制', '无弹力带可用毛巾替代'],
          regressIf: '肩部不适减小阻力', progressIf: '可 3×15 → 进阶',
          illustrationRef: 'bw-pull-1' },
        { level: '基础', name: '俯身反向飞鸟 / 桌边划船', dose: { reps: '12-15 次', sets: '3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['俯身约 45°，手持水瓶向后夹背', '或双手撑桌沿做反向划船', '感受背阔与菱形肌收缩', '不耸肩'],
          regressIf: '腰背吃不消则减小负重', progressIf: '3×15 标准 → 进阶',
          illustrationRef: 'bw-pull-2' },
        { level: '进阶', name: '单臂悬吊 / 毛巾划船', dose: { reps: '8-12 次/侧', sets: '3 组', rest: '75 s', freq: '每周 3 次' },
          keyPoints: ['单臂悬吊门框或弹力带单侧划船', '强化左右不对称', '慢速离心', '核心抗旋转'],
          regressIf: '单侧吃力则回基础', progressIf: '可稳定 3×12/侧 → 维持',
          illustrationRef: 'bw-pull-3' }
      ]
    },
    squat: {
      key: 'squat', name: '蹲（下肢推）', target: '股四头肌、臀大肌、核心',
      levels: [
        { level: '退阶', name: '椅子辅助深蹲', dose: { reps: '10-12 次', sets: '2-3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['身后放稳固椅子，下坐轻触即起', '重心在足中后段，膝不过度内扣', '挺胸直背', '可扶扶手减荷'],
          regressIf: '膝痛则减小深度', progressIf: '能无辅助 3×12 → 进阶',
          illustrationRef: 'bw-squat-1' },
        { level: '基础', name: '自重深蹲', dose: { reps: '12-15 次', sets: '3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['双脚与肩同宽，下蹲至大腿约水平', '膝朝脚尖方向，不内扣', '起身呼气，臀腿发力', '全程核心收紧'],
          regressIf: '无法达水平则回退阶', progressIf: '3×15 标准 → 进阶',
          illustrationRef: 'bw-squat-2' },
        { level: '进阶', name: '高脚杯深蹲（持物）', dose: { reps: '10-12 次', sets: '3-4 组', rest: '75 s', freq: '每周 3 次' },
          keyPoints: ['双手抱重物于胸前（书包/水瓶）', '增加负荷与核心抗屈', '保持 full range', '慢速控制'],
          regressIf: '动作变形回到基础', progressIf: '可 3×12 负重 → 维持',
          illustrationRef: 'bw-squat-3' }
      ]
    },
    hinge: {
      key: 'hinge', name: '铰（髋铰链 / 后链）', target: '臀大肌、腘绳肌、竖脊肌',
      levels: [
        { level: '退阶', name: '臀桥', dose: { reps: '12-15 次', sets: '2-3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['仰卧屈膝，臀部抬离地面', '顶峰夹紧臀部 1 秒', '腰椎保持中立不塌腰', '可单腿进阶'],
          regressIf: '腰不适则减小幅度', progressIf: '能 3×15 → 进阶',
          illustrationRef: 'bw-hinge-1' },
        { level: '基础', name: '徒手罗马尼亚硬拉', dose: { reps: '10-12 次', sets: '3 组', rest: '60 s', freq: '每周 2-3 次' },
          keyPoints: ['微屈膝，髋部后推躯干前倾', '感受腘绳肌拉伸，背挺直', '臀肌发力回正', '不圆背'],
          regressIf: '腘绳肌过紧则减小幅度', progressIf: '3×12 标准 → 进阶',
          illustrationRef: 'bw-hinge-2' },
        { level: '进阶', name: '单腿硬拉', dose: { reps: '8-10 次/侧', sets: '3 组', rest: '75 s', freq: '每周 3 次' },
          keyPoints: ['单腿站立，另一腿后伸', '髋铰链前倾，支撑腿臀发力和', '强化平衡与后链', '核心抗旋转'],
          regressIf: '失衡则回基础', progressIf: '可稳定 3×10/侧 → 维持',
          illustrationRef: 'bw-hinge-3' }
      ]
    },
    core: {
      key: 'core', name: '核心（躯干稳定）', target: '腹横肌、腹直肌、多裂肌、骨盆底',
      levels: [
        { level: '退阶', name: '死虫式', dose: { reps: '8-10 次/侧', sets: '2-3 组', rest: '45 s', freq: '每周 3-4 次' },
          keyPoints: ['仰卧举腿屈髋，对侧手脚缓慢伸展', '腰椎贴地不拱起', '呼气收紧腹横肌', '节奏缓慢'],
          regressIf: '腰离地则减小活动范围', progressIf: '能 3×10/侧 → 进阶',
          illustrationRef: 'bw-core-1' },
        { level: '基础', name: '平板支撑', dose: { reps: '20-40 秒', sets: '3 组', rest: '60 s', freq: '每周 3-4 次' },
          keyPoints: ['前臂撑地，身体成直线', '收紧腹臀，不塌腰不撅臀', '自然呼吸不憋气', '到时即停不硬扛'],
          regressIf: '腰下沉改做跪姿平板', progressIf: '可 3×40 秒 → 进阶',
          illustrationRef: 'bw-core-2' },
        { level: '进阶', name: '侧平板 / 鸟狗式进阶', dose: { reps: '20-30 秒/侧', sets: '3 组', rest: '60 s', freq: '每周 3-4 次' },
          keyPoints: ['侧平板强化侧链，髋部上抬成直线', '鸟狗式对角伸展保持 2 秒', '抗旋转抗侧屈', '控制节奏'],
          regressIf: '侧平板吃力回基础', progressIf: '可稳定 3×30 秒/侧 → 维持',
          illustrationRef: 'bw-core-3' }
      ]
    },
    gait: {
      key: 'gait', name: '步态 / 平衡', target: '本体感觉、踝膝髋稳定链、前庭-视觉整合',
      levels: [
        { level: '退阶', name: '扶椅单腿站', dose: { reps: '10-20 秒/侧', sets: '2-3 组', rest: '30 s', freq: '每日' },
          keyPoints: ['手扶稳固椅背，轻提一侧脚', '逐渐减重扶手依赖', '身旁有支撑防跌倒', '睁眼练习'],
          regressIf: '晃动明显则双脚微开', progressIf: '可脱手站 20 秒 → 进阶',
          illustrationRef: 'bw-gait-1' },
        { level: '基础', name: '无支撑单腿站', dose: { reps: '20-30 秒/侧', sets: '3 组', rest: '30 s', freq: '每日' },
          keyPoints: ['独立单腿站立，双臂自然', '目光平视固定点', '躯干不晃', '可 comet 微动'],
          regressIf: '失衡回退阶', progressIf: '可 30 秒稳定 → 进阶',
          illustrationRef: 'bw-gait-2' },
        { level: '进阶', name: '闭眼 / 跨步平衡', dose: { reps: '10-20 秒/侧', sets: '3 组', rest: '45 s', freq: '每日（需陪同）' },
          keyPoints: ['闭眼单腿站提升本体感觉', '或前后/侧向跨步稳定训练', '必须有人在旁看护', '不勉强'],
          regressIf: '任何不稳立即回基础', progressIf: '可稳定完成 → 维持并周期化',
          illustrationRef: 'bw-gait-3' }
      ]
    }
  };

  /* ============================================================
   * 3. 匹配引擎
   * ============================================================ */

  // 指征得分类别（引擎在 selectDevices 中评估）
  function evalWhen(when, ctx) {
    switch (when) {
      case 'default': return true;
      case 'hq_high': return ctx.hq != null && ctx.hq >= 80;
      case 'hq_low': return ctx.hq != null && ctx.hq < 60;
      case 'lsi_unilateral': return ctx.lsi != null && Math.abs(ctx.lsi) >= 15;
      case 'elderly': return ctx.age >= 65;
      case 'sarcopenia': return ctx.sarcopenia === true;
      case 'obesity': return ctx.bmi != null && ctx.bmi >= 28;
      case 'knee': return ctx.jointIssue === 'knee' || ctx.jointIssue === 'both';
      case 'back': return ctx.jointIssue === 'back' || ctx.jointIssue === 'both';
      case 'core_weak': return !!(ctx.weakPoints && /腹|核心|腰|背/.test(ctx.weakPoints));
      case 'posture': return !!(ctx.posture && ctx.posture.length && ctx.posture[0] !== 'none');
      case 'upper_default': return true; // 上肢默认纳入（除非安全闸门排除）
      default: return false;
    }
  }

  function goalKeyOf(ctx) {
    if (ctx.sarcopenia === true) return 'sarcopenia';
    var stage = (ctx.assessment && ctx.assessment.weightStage) || (ctx.patient && '');
    if (stage === 'lose') return 'fatloss';
    if (stage === 'gain') return 'hypertrophy';
    if (stage === 'maintain') return 'maintain';
    return 'maintain';
  }

  function goalLoadPct(goalKey) {
    return {
      fatloss: '50-60%', hypertrophy: '65-75%', maintain: '60-70%', sarcopenia: '60-70%'
    }[goalKey] || '60-70%';
  }
  function goalTorquePct(goalKey) {
    return { fatloss: '50-60', hypertrophy: '65-75', maintain: '60-70', sarcopenia: '60-70' }[goalKey] || '60-70';
  }
  function repsSetsByGoal(goalKey) {
    if (goalKey === 'sarcopenia') return { reps: '12-15 次', sets: '2-3 组', rest: '60-90 s', freq: '每周 2-3 次' };
    if (goalKey === 'fatloss') return { reps: '15-20 次', sets: '2-3 组', rest: '45-60 s', freq: '每周 3 次' };
    if (goalKey === 'hypertrophy') return { reps: '10-12 次', sets: '3-4 组', rest: '60-90 s', freq: '每周 2-3 次' };
    return { reps: '10-12 次', sets: '3 组', rest: '60-90 s', freq: '每周 2-3 次' };
  }

  // 从等张/等速数据推算 1RM（Brzycki）
  function getOneRM(ctx) {
    var iso = latest(ctx.isotonicData);
    if (iso) {
      var lo = num(iso.loadL != null ? iso.loadL : iso.load);
      var ro = num(iso.repsL != null ? iso.repsL : iso.reps);
      var hi = num(iso.loadR != null ? iso.loadR : lo);
      var ho = num(iso.repsR != null ? iso.repsR : ro);
      var W = (lo != null && hi != null) ? (lo + hi) / 2 : lo;
      var R = (ro != null && ho != null) ? (ro + ho) / 2 : ro;
      if (W != null && R != null && R >= 6 && R <= 12) {
        var rm = W * (36 / (37 - R));
        return Math.round(rm * 10) / 10;
      }
    }
    if (ctx.strengthSummary && ctx.strengthSummary.metrics) return num(ctx.strengthSummary.metrics.oneRM);
    return null;
  }

  function getAnchors(ctx) {
    var oneRM = getOneRM(ctx);
    var iso = latest(ctx.isokineticData);
    return {
      oneRM: oneRM,
      isokinetic: iso,
      hasData: !!(oneRM != null || iso),
      peakTorque: iso ? (num(iso.peakTorque) || num(iso.maxTorque)) : null,
      source: oneRM != null ? '等张 1RM（Brzycki 反推）' : (iso ? '等速峰力矩' : '无客观肌力数据')
    };
  }

  // 安全闸门：返回 { passed, flags, reasons, educationOnly }
  function safetyGate(ctx) {
    var flags = [], reasons = [];
    var p = ctx.patient || {};
    var a = ctx.assessment || {};
    // 这里仅做系统可识别的硬 contraindication 提示；临床最终判断由医生完成
    if (a && (a.recentFracture || a.acutePhase)) {
      flags.push('急性期/近期骨折'); reasons.push('存在急性期或近期骨折，运动方案以宣教与转介为主，暂停主动抗阻。');
    }
    if (p && p.uncontrolledCV) {
      flags.push('心血管未控制'); reasons.push('心血管疾病未控制，需心内科评估后方可运动。');
    }
    if (ctx.jointIssue === 'both' || (ctx.weakPoints && /急性/.test(ctx.weakPoints))) {
      reasons.push('多关节不适/急性症状，抗阻强度取保守区间并优先无痛范围。');
    }
    var passed = flags.length === 0;
    return { passed: passed, flags: flags, reasons: reasons, educationOnly: !passed };
  }

  function selectDevices(ctx) {
    // 针对性设备（命中具体指征，非 default）
    var targeted = [];
    Object.keys(QD_RX).forEach(function (id) {
      var d = QD_RX[id];
      for (var i = 0; i < d.indications.length; i++) {
        var ind = d.indications[i];
        if (ind.when === 'default') continue;
        if (evalWhen(ind.when, ctx)) { targeted.push({ device: d, indication: ind.text }); break; }
      }
    });
    // 基线集：保证下肢复合 + 上肢推/拉 + 核心均有覆盖（完整方案不漏肌群）
    var baselineIds = ['01', '09', '05', '06', '03'];
    var result = [], seen = {};
    baselineIds.forEach(function (id) {
      if (!seen[id]) {
        seen[id] = 1;
        var d = QD_RX[id];
        result.push({ device: d, indication: d.indications[d.indications.length - 1].text });
      }
    });
    // 再补针对性设备（如 H/Q 失衡的腘绳肌、腰背不适的背伸等）
    targeted.forEach(function (t) {
      if (!seen[t.device.id]) { seen[t.device.id] = 1; result.push(t); }
    });
    // 封顶 6 台，避免单次方案过载
    return result.slice(0, 6);
  }

  function buildDeviceRx(item, ctx, anchor, deviceMode) {
    var d = item.device;
    var goalKey = goalKeyOf(ctx);
    var ls = repsSetsByGoal(goalKey);
    var speed = d.speeds && d.speeds.length ? d.speeds[0] : null;
    var rx = {
      deviceId: d.id, deviceName: d.name, short: d.short, muscles: d.muscles, joints: d.joints,
      indication: item.indication, evidence: '', mode: '', speed: speed, rom: d.rom,
      intensity: '', load: '', reps: ls.reps, sets: ls.sets, rest: ls.rest, freq: ls.freq,
      weeks: '4-6 周为一阶段，按进展递进', keyPoints: d.keyPoints, progression: d.progression,
      contraindication: d.contraindication, illustrationRef: d.illustrationRef,
      educationOnly: false, inferred: false
    };

    var lsiUnilateral = (d.category === 'lower') && (ctx.lsi != null && Math.abs(ctx.lsi) >= 15);
    var isIsoDevice = d.isokinetic === true;

    // 无客观数据时的模式处理
    if (!anchor.hasData) {
      if (deviceMode === 'education') {
        rx.educationOnly = true;
        rx.evidence = '无等速/等张客观肌力数据，按「仅宣教徒手」模式，不出具设备负荷处方。';
        return rx;
      }
      if (deviceMode === 'infer') {
        rx.inferred = true;
        rx.evidence = '无客观肌力数据，依据年龄/BMI/问卷推断建议（标注「建议·待测评校准」）。';
        if (isIsoDevice) {
          rx.mode = '向心';
          rx.intensity = '主观努力 ' + goalTorquePct(goalKey) + '%（建议·待等速测评校准）';
        } else {
          rx.mode = '自重/低负荷';
          rx.intensity = '自重 + 可选 1-2kg（建议·待校准）';
        }
        if (lsiUnilateral) { rx.sets = '弱侧 4 组 / 强侧 3 组'; rx.note = '弱侧单侧优先。'; }
        return rx;
      }
      // 默认 strict 且无数据 → 仅宣教
      rx.educationOnly = true;
      rx.evidence = '无客观肌力数据，默认「仅宣教徒手」模式，不出具设备负荷处方。';
      return rx;
    }

    // 有客观数据 → 锚定计算
    rx.evidence = '强度锚定：' + anchor.source + (anchor.oneRM != null ? ('（1RM ' + anchor.oneRM + ' kg）') : (anchor.peakTorque != null ? ('（峰力矩 ' + anchor.peakTorque + ' N·m）') : ''));
    if (isIsoDevice && anchor.isokinetic) {
      rx.mode = '向心 + 等速';
      rx.intensity = '强度 ' + goalTorquePct(goalKey) + '% 峰力矩 @ ' + speed + '°/s';
      rx.note = '离心阶段控制 3 秒以增强肌腱适应。';
    } else if (anchor.oneRM != null && (d.id === '01' || d.id === '02' || d.id === '09')) {
      var pctMid = (function () { var r = goalLoadPct(goalKey).split('-'); return (parseFloat(r[0]) + parseFloat(r[1])) / 200; })();
      var load = round05(anchor.oneRM * pctMid);
      rx.mode = '向心 + 离心';
      rx.load = load + ' kg（' + goalLoadPct(goalKey) + ' 1RM）';
      rx.intensity = goalLoadPct(goalKey) + ' 1RM';
    } else if (isIsoDevice) {
      rx.mode = '向心 + 等速';
      rx.intensity = '主观努力 ' + goalTorquePct(goalKey) + '%（等速测评后按峰力矩校准）';
    } else {
      rx.mode = '自重 + 可选低负荷';
      rx.intensity = '自重 / 1-2kg（RPE 11-13）';
    }
    if (lsiUnilateral) {
      rx.sets = '弱侧 4 组 / 强侧 3 组';
      rx.note = (rx.note ? rx.note + ' ' : '') + '弱侧单侧优先训练，纠正代偿。';
    }
    return rx;
  }

  // 居家徒手：按能力选起始级
  function bodyweightStartLevel(ctx) {
    var total = ctx.strengthSummary && ctx.strengthSummary.total;
    var level = 1; // 0 退阶 / 1 基础 / 2 进阶
    if (total != null) {
      if (total >= 80 && ctx.age < 65) level = 2;
      else if (total < 70) level = 0;
    } else {
      level = 0;
    }
    if (ctx.age >= 70) level = Math.min(level, 1);
    if (ctx.jointIssue && ctx.jointIssue !== 'none') level = Math.min(level, 1);
    return level;
  }

  function buildBodyweight(ctx) {
    var start = bodyweightStartLevel(ctx);
    var patterns = [];
    Object.keys(BW).forEach(function (k) {
      var pat = BW[k];
      // 步态/平衡对跌倒风险者强制降一级
      var lvl = (k === 'gait' && ctx.balanceSelf && ctx.balanceSelf !== 'ge30') ? Math.min(start, 1) : start;
      patterns.push({
        key: pat.key, name: pat.name, target: pat.target, selectedLevel: pat.levels[lvl].level,
        levels: pat.levels, illustrationRef: pat.levels[lvl].illustrationRef
      });
    });
    var safety = [
      '训练前 5 分钟低强度热身（原地踏步、关节活动），结束后静态拉伸主要肌群',
      '任何动作出现关节锐痛、头晕、胸闷立即停止并休息',
      '徒手抗阻「最后一次应能标准完成但略有吃力（RPE 13-15）」为合适强度',
      '进阶标准：当前级能标准完成 3 组目标次数且无不适，再升一级',
      '每周训练日之间至少间隔 1 天，保证肌群恢复'
    ];
    return { startLevelIndex: start, patterns: patterns, safety: safety };
  }

  function match(ctx) {
    ctx = ctx || {};
    ctx.patient = ctx.patient || {};
    ctx.assessment = ctx.assessment || {};
    ctx.lifeSurvey = ctx.lifeSurvey || {};
    var p = ctx.patient, a = ctx.assessment, s = ctx.lifeSurvey;
    ctx.age = num(p.age) || 50;
    ctx.bmi = (num(a.weight) && num(a.height)) ? Math.round((num(a.weight) / Math.pow(num(a.height) / 100, 2)) * 10) / 10 : null;
    ctx.jointIssue = p.jointIssue || 'none';
    ctx.posture = (Array.isArray(s.postureIssues) ? s.postureIssues : (s.postureIssues ? [s.postureIssues] : []));
    ctx.balanceSelf = s.balanceSelf;
    var hqlsi = (ctx.strengthSummary && ctx.strengthSummary.metrics) ? ctx.strengthSummary.metrics : {};
    ctx.hq = num(hqlsi.hq);
    ctx.lsi = num(hqlsi.lsi);
    ctx.weakPoints = (ctx.strengthSummary && ctx.strengthSummary.weakPoints) ? ctx.strengthSummary.weakPoints.join('/') : '';
    if (ctx.sarcopenia == null) {
      ctx.sarcopenia = (ctx.age >= 65) && (ctx.lsi != null && Math.abs(ctx.lsi) >= 15 || (ctx.strengthSummary && ctx.strengthSummary.total != null && ctx.strengthSummary.total < 70));
    }

    var gate = safetyGate(ctx);
    var reasonList = [];
    var population = {
      elderly: ctx.age >= 65, obesity: ctx.bmi != null && ctx.bmi >= 28,
      sarcopenia: ctx.sarcopenia, jointIssue: ctx.jointIssue
    };
    var goalKey = goalKeyOf(ctx);
    var anchor = getAnchors(ctx);

    if (!gate.passed) {
      reasonList.push('安全闸门：检出 ' + gate.flags.join('、') + '，方案降级为宣教转介，不出具主动抗阻处方。');
      return {
        engine: 'plan-engine-v1', generatedAt: new Date().toISOString(),
        mode: 'education_only', population: population, goalKey: goalKey, safetyGate: gate,
        deviceMode: 'education', summary: { reasons: reasonList },
        qudong: [], bodyweight: null, illustrationRefs: []
      };
    }

    gate.reasons.forEach(function (r) { reasonList.push(r); });
    var deviceMode = ctx.deviceMode || (anchor.hasData ? 'strict' : null); // null → 需医生选择
    if (deviceMode === 'strict' && !anchor.hasData) deviceMode = null;
    if (deviceMode === null) {
      reasonList.push('未检测到等速/等张客观肌力数据：已请医生选择设备处方模式（仅宣教徒手 / 凭评估推断建议）。');
    } else if (anchor.hasData) {
      reasonList.push('强度锚定来源：' + anchor.source + '；训练目标：' + goalKey + '。');
    } else {
      reasonList.push('设备处方模式：' + (deviceMode === 'infer' ? '凭评估推断建议（标注待校准）' : '仅宣教徒手') + '。');
    }

    var picks = selectDevices(ctx);
    var qudong = picks.map(function (it) { return buildDeviceRx(it, ctx, anchor, deviceMode || 'education'); });
    var bodyweight = buildBodyweight(ctx);

    // 配图引用汇总
    var refs = [];
    qudong.forEach(function (q) { if (q.illustrationRef) refs.push(q.illustrationRef); });
    bodyweight.patterns.forEach(function (pt) { if (pt.illustrationRef) refs.push(pt.illustrationRef); });

    return {
      engine: 'plan-engine-v1', generatedAt: new Date().toISOString(),
      mode: 'rigorous', population: population, goalKey: goalKey, safetyGate: gate,
      deviceMode: deviceMode, anchor: anchor, summary: { reasons: reasonList },
      qudong: qudong, bodyweight: bodyweight, illustrationRefs: refs
    };
  }

  // 由 AppState 组装 ctx 并匹配；deviceMode 可由 UI 传入
  function generate(opts) {
    opts = opts || {};
    var ctx = {
      patient: window.AppState && window.AppState.patient || {},
      assessment: window.AppState && window.AppState.assessment || {},
      lifeSurvey: window.AppState && window.AppState.lifeSurvey || {},
      isotonicData: window.AppState && window.AppState.isotonicData || [],
      isokineticData: window.AppState && window.AppState.isokineticData || [],
      strengthSummary: (window.getLatestStrengthSummary ? window.getLatestStrengthSummary() : null),
      sarcopenia: opts.sarcopenia,
      deviceMode: opts.deviceMode || null
    };
    return match(ctx);
  }

  /* ============================================================
   * 4. 配图钩子（配图阶段通过 registerImage 注入真实图，否则用占位 SVG）
   * ============================================================ */
  var _images = {}; // ref -> blobURL / dataURL
  function registerImage(ref, url) { _images[ref] = url; }
  function hasImage(ref) { return !!_images[ref]; }

  // 注意：自动生成插图功能已按需求取消（生成图效果不达标，含水印）。
  // 方案卡片统一使用下方 illustrationSVG 占位，registerImage 保留为可扩展接口，
  // 后续如需接入人工审核后的合规图标，可在此注册。

  function illustrationSVG(ref, label, kind) {
    var bg = kind === 'device' ? '#eef4ff' : '#eafaf1';
    var accent = kind === 'device' ? '#2f6df0' : '#1f9d57';
    var icon = kind === 'device' ? '🏋️' : '🤸';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="190" viewBox="0 0 320 190">' +
      '<rect width="320" height="190" rx="12" fill="' + bg + '"/>' +
      '<rect x="10" y="10" width="300" height="170" rx="10" fill="#fff" stroke="' + accent + '" stroke-width="2" stroke-dasharray="6 5"/>' +
      '<text x="160" y="78" font-size="46" text-anchor="middle">' + icon + '</text>' +
      '<text x="160" y="120" font-size="16" font-weight="700" fill="' + accent + '" text-anchor="middle">' + esc(label) + '</text>' +
      '<text x="160" y="146" font-size="11" fill="#9aa3b2" text-anchor="middle">配图占位 · 待「配图生成」阶段注入</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function illustration(ref, label, kind) {
    if (_images[ref]) {
      return '<img class="pm-illu" src="' + esc(_images[ref]) + '" alt="' + esc(label) + '" loading="lazy"/>';
    }
    return '<img class="pm-illu" src="' + illustrationSVG(ref, label, kind) + '" alt="' + esc(label) + '"/>';
  }

  /* ============================================================
   * 5. 渲染（复用现有 card / badge / table 风格）
   * ============================================================ */
  function badge(text, cls) { return '<span class="badge badge-' + (cls || 'info') + '">' + esc(text) + '</span>'; }

  function renderHTML(plan) {
    if (!plan) return '<div class="alert alert-warning">方案为空。</div>';
    var parts = [];

    parts.push('<div class="card mb-3 no-print"><div class="card-body" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:220px;"><div style="font-weight:700;font-size:16px;">严谨版干预方案（PlanEngine v1）</div>' +
      '<div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">生成时间：' + esc(plan.generatedAt ? plan.generatedAt.replace('T', ' ').slice(0, 16) : '') +
      ' · 模式：' + (plan.mode === 'education_only' ? '宣教转介' : '严谨生成') +
      (plan.deviceMode ? ' · 设备处方：' + ({ strict: '客观数据锚定', infer: '凭评估推断(待校准)', education: '仅宣教徒手' }[plan.deviceMode] || plan.deviceMode) : '') + '</div></div>' +
      '<span class="badge badge-primary">可解释匹配引擎</span></div></div>');

    // 安全闸门与适配结论
    var gate = plan.safetyGate || {};
    parts.push('<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🛡️</span>安全闸门与适配结论</h3></div><div class="card-body">' +
      (gate.flags && gate.flags.length ? badge('检出禁忌/风险：' + gate.flags.join('、'), 'danger') : badge('安全闸门通过', 'success')) +
      '<ul style="margin:12px 0 0;padding-left:20px;font-size:13px;line-height:1.9;color:var(--text-secondary);">' +
      (plan.summary.reasons || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div></div>');

    if (plan.mode === 'education_only') {
      parts.push('<div class="card mt-3"><div class="card-body"><div class="alert alert-warning">当前为宣教转介模式，请先处理禁忌/风险因素，或待评估完成后再生成主动训练方案。</div></div></div>');
      return parts.join('');
    }

    // 鹊动设备处方（核心）
    parts.push('<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏋️</span>一、鹊动设备处方（核心 · 客观数据驱动）</h3>' +
      '<span class="badge badge-primary">' + plan.qudong.length + ' 台设备</span></div><div class="card-body">');
    plan.qudong.forEach(function (q, i) {
      var isEdu = q.educationOnly;
      var head = '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px;">' +
        illustration(q.illustrationRef, q.deviceName, 'device') +
        '<div style="flex:1;min-width:240px;"><div style="font-weight:700;font-size:15px;">' + (i + 1) + '. ' + esc(q.deviceName) + ' <span class="badge badge-secondary">' + esc(q.short) + '</span></div>' +
        '<div style="font-size:12.8px;color:var(--text-muted);margin-top:4px;">靶肌群：' + esc(q.muscles) + ' · 关节：' + esc(q.joints) + '</div>' +
        '<div style="font-size:12.8px;color:var(--primary);margin-top:6px;">选择依据：' + esc(q.indication) + '</div></div></div>';
      var bodyInner;
      if (isEdu) {
        bodyInner = '<div class="alert alert-info" style="margin:0;">' + esc(q.evidence || '暂无客观肌力数据，本设备仅作宣教，不出具负荷处方。完成等速/等张测评后可自动校准。') + '</div>';
      } else {
        var rows = [
          ['训练模式', q.mode], ['速度/ROM', (q.speed ? q.speed + '°/s' : '') + (q.rom ? ' · ' + q.rom : '')],
          ['强度', q.intensity], ['负荷', q.load || '—'],
          ['次数×组数', q.reps + ' × ' + q.sets + (q.note ? '（' + q.note + '）' : '')],
          ['组间休息', q.rest], ['频率', q.freq], ['周期', q.weeks]
        ];
        var table = '<div class="table-wrap"><table><tbody>' + rows.map(function (r) {
          return '<tr><td style="width:22%;font-weight:600;color:var(--text-secondary);">' + esc(r[0]) + '</td><td>' + esc(r[1] || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
        var kp = '<div style="margin-top:12px;font-weight:700;font-size:13.5px;">动作要领</div><ul style="margin:6px 0 0;padding-left:20px;font-size:12.8px;line-height:1.85;color:var(--text-secondary);">' +
          q.keyPoints.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
        var prog = '<div style="margin-top:10px;font-weight:700;font-size:13.5px;">退阶 → 进阶</div><ol style="margin:6px 0 0;padding-left:20px;font-size:12.8px;line-height:1.8;color:var(--text-secondary);">' +
          q.progression.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
        var ci = '<div style="margin-top:10px;color:var(--danger);font-size:12.5px;">⚠ 禁忌：' + q.contraindication.join('；') + '</div>';
        var inf = q.inferred ? '<div class="mt-2">' + badge('建议·待测评校准', 'warning') + '</div>' : '';
        bodyInner = table + kp + prog + ci + inf;
      }
      parts.push('<div class="pm-device">' + head + bodyInner + '</div>');
    });
    parts.push('</div></div>');

    // 居家徒手方案
    var bw = plan.bodyweight;
    parts.push('<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏠</span>二、居家徒手方案（规整 · 可执行）</h3>' +
      '<span class="badge badge-success">6 模式 · 起始级：' + esc(['退阶', '基础', '进阶'][bw.startLevelIndex]) + '</span></div><div class="card-body">');
    bw.patterns.forEach(function (pt) {
      var cur = pt.levels.filter(function (l) { return l.level === pt.selectedLevel; })[0] || pt.levels[1];
      var lvlBtns = pt.levels.map(function (l) {
        return badge(l.level + '：' + l.name, l.level === pt.selectedLevel ? 'primary' : 'secondary');
      }).join(' ');
      var rows = [
        ['靶肌群', pt.target], ['推荐次数×组数', cur.dose.reps + ' × ' + cur.dose.sets],
        ['组间休息', cur.dose.rest], ['频率', cur.dose.freq],
        ['退阶条件', cur.regressIf], ['进阶条件', cur.progressIf]
      ];
      var table = '<div class="table-wrap"><table><tbody>' + rows.map(function (r) {
        return '<tr><td style="width:24%;font-weight:600;color:var(--text-secondary);">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
      var kp = '<ul style="margin:8px 0 0;padding-left:20px;font-size:12.8px;line-height:1.85;color:var(--text-secondary);">' +
        cur.keyPoints.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      parts.push('<div class="pm-bw"><div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px;">' +
        illustration(pt.illustrationRef, pt.name, 'bw') +
        '<div style="flex:1;min-width:240px;"><div style="font-weight:700;font-size:14.5px;">' + esc(pt.name) + '</div>' +
        '<div style="margin:6px 0;">' + lvlBtns + '</div></div></div>' + table + kp + '</div>');
    });
    parts.push('<div class="mt-3" style="padding:16px;background:var(--bg-secondary);border-radius:12px;"><div style="font-weight:700;font-size:13.5px;margin-bottom:8px;">居家训练安全与执行须知</div>' +
      '<ul style="margin:0;padding-left:20px;font-size:12.8px;line-height:1.9;color:var(--text-secondary);">' +
      bw.safety.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>');
    parts.push('</div></div>');

    return parts.join('');
  }

  /* ============================================================
   * 6. 设备模式提示（无客观数据时请医生选择）
   * ============================================================ */
  function askDeviceMode() {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'pm-modal-overlay';
      overlay.innerHTML =
        '<div class="pm-modal">' +
        '<div class="pm-modal-title">未检测到等速 / 等张客观肌力数据</div>' +
        '<div class="pm-modal-body">系统无法锚定设备负荷。请选择设备处方模式：</div>' +
        '<div class="pm-modal-actions">' +
        '<button class="btn btn-secondary" data-m="education">仅宣教 + 徒手</button>' +
        '<button class="btn btn-primary" data-m="infer">凭评估推断建议（待校准）</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        var m = b.getAttribute('data-m');
        document.body.removeChild(overlay);
        resolve(m);
      });
    });
  }

  // 导出
  window.PlanEngine = {
    QD_RX: QD_RX, BW: BW,
    match: match, generate: generate, renderHTML: renderHTML,
    askDeviceMode: askDeviceMode,
    registerImage: registerImage, hasImage: hasImage, illustration: illustration,
    goalKeyOf: goalKeyOf, getOneRM: getOneRM
  };
})();
