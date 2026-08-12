/* ============================================================
 * 肌少症严谨版方案引擎（SarcEngine2）
 * - 与旧 SarcEngine.buildPlan 双轨并存，不破坏现有流程
 * - 在 SarcExerciseLib.match（36 动作库算法）结果之上叠加严谨逻辑：
 *   R1 严重度感知分级（AWGS2019 思路）  R2 客观锚定剂量（1RM/握力/RPE）
 *   R3 禁忌强制网关（关节/跌倒/SPPB）    R4 LSI 弱侧单侧处理
 *   R5 设备方案同源（复用 CONST.DEVICES + 肌少症处方单）
 *   R6 统一 schema（与 PlanEngine 对齐） R9 可解释 reasons
 * 依赖全局：SarcExerciseLib / CONST / getLatestStrengthSummary
 * ============================================================ */
window.SarcEngine2 = (function () {
  'use strict';

  function n(x) { var v = parseFloat(x); return isNaN(v) ? null : v; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---------- R1 严重度分级（参考 AWGS2019：低肌力 + 低肌量 → 肌少症；叠加低体能 → 严重） ---------- */
  function severityStage(ctx) {
    var grip = ctx.gripEval || {};
    var body = ctx.body || {};
    var sppb = ctx.sppb || {};
    var strengthLow = !!grip.low || (grip.value != null && grip.value > 0 && grip.low);
    var massLow = !!body.smiLow || !!ctx.calfLow;
    var perfLow = (sppb.total != null && sppb.total < 9) || (ctx.gaitValue != null && ctx.gaitValue <= 0.8);
    var reasons = [];
    if (strengthLow) reasons.push('握力偏低（' + (grip.value != null ? grip.value + ' kg' : '低于同龄阈值') + '），存在低肌力');
    if (massLow) reasons.push('肌肉量偏低（' + (body.smiLow ? 'SMI 低于阈值' : '') + (ctx.calfLow ? ' 小腿围偏低' : '') + '）');
    if (perfLow) reasons.push('体能表现下降（SPPB=' + (sppb.total != null ? sppb.total : '—') + '/12，或步速≤0.8m/s）');

    var stage;
    if (strengthLow && massLow && perfLow) stage = 'severe';
    else if (strengthLow && massLow) stage = 'confirmed';
    else if (strengthLow || massLow) stage = 'pre';
    else stage = 'none';

    return {
      stage: stage,
      label: { none: '未见明显肌少症指征', pre: '肌少症前期（需预防）', confirmed: '肌少症（确诊）', severe: '严重肌少症' }[stage],
      reasons: reasons
    };
  }

  /* ---------- 1RM 参考值：oneRML/oneRMR 是「左/右侧」同一动作的 1RM，不是不同肌群 ----------
   * 配重一律以「弱侧」为安全锚点，强侧按自身 1RM 递增，避免用单侧值给双侧开处方。 */
  function oneRMRef(ctx) {
    var s = (ctx && ctx.strength) || {};
    var l = n(s.oneRML), r = n(s.oneRMR);
    if (l != null && l > 0 && r != null && r > 0) {
      return { weak: Math.min(l, r), strong: Math.max(l, r), mean: Math.round((l + r) / 2 * 10) / 10, bilateral: true };
    }
    var v = (l != null && l > 0) ? l : ((r != null && r > 0) ? r : null);
    return v != null ? { weak: v, strong: v, mean: v, bilateral: false } : null;
  }
  /* 严重度 → 强度区间（设备处方与剂量卡共用，避免两处自相矛盾） */
  function intensityBand(sev) {
    var st = sev && sev.stage;
    if (st === 'severe') return { lo: 0.50, hi: 0.60, label: '50–60%' };
    if (st === 'confirmed') return { lo: 0.60, hi: 0.70, label: '60–70%' };
    return { lo: 0.65, hi: 0.75, label: '65–75%' };
  }
  function kgRange(v, band) {
    return (Math.round(v * band.lo * 10) / 10) + '–' + (Math.round(v * band.hi * 10) / 10) + ' kg';
  }

  /* ---------- R2 客观锚定剂量：优先 1RM% → 握力% → RPE ---------- */
  function objectiveDose(ctx, sev) {
    var grip = ctx.gripEval || {};
    var reasons = [];
    var mode, target, note;
    var ref = oneRMRef(ctx);

    if (ref) {
      // 下肢 1RM 可用：强度锚定 %（以弱侧为准）
      var band = intensityBand(sev);
      mode = '1RM%';
      target = band.label + ' 1RM（下肢）≈ ' + kgRange(ref.weak, band);
      note = ref.bilateral
        ? '双侧等张 1RM 左/右为 ' + n(ctx.strength.oneRML) + ' / ' + n(ctx.strength.oneRMR) + ' kg，配重以弱侧（' + ref.weak + ' kg）为安全锚点，强侧可按自身 1RM 同比例递增。'
        : '依据等张 1RM=' + ref.weak + ' kg 推算训练负荷，循序渐进（建议补测对侧以评估双侧对称性）。';
      reasons.push('负荷锚定等张 1RM（弱侧 ' + ref.weak + ' kg），采用 ' + band.label + ' 强度区间 ≈ ' + kgRange(ref.weak, band));
    } else if (grip.value != null && grip.value > 0) {
      mode = '握力%';
      target = '起始 30–40% 最大握力，逐周 +5%';
      note = '无等张 1RM，暂以握力为渐进参照，建议补测等张以精确配重。';
      reasons.push('无 1RM，以握力为渐进参照（建议补测等张）');
    } else {
      mode = 'RPE';
      target = 'RPE 11–13（稍累可对话），不锚定绝对负荷';
      note = '无客观肌力数据，采用自评强度，强调可控发力、避免憋气。';
      reasons.push('无客观肌力数据，采用 RPE 自评强度（建议补测等速/等张）');
    }
    // 严重度调节频次
    var freq = sev.stage === 'severe' ? '每周 2–3 次，隔天进行，组间休息延长' :
      (sev.stage === 'confirmed' ? '每周 3 次抗阻 + 2 次有氧' : '每周 3 次维持 + 3 次有氧');
    return { mode: mode, target: target, note: note, freq: freq, reasons: reasons };
  }

  /* ---------- R5 设备方案同源：复用 CONST.DEVICES + 肌少症处方单 ---------- */
  // 以「下肢肌力 + 平衡 + 核心」为核心，处方强度锚定 1RM
  // 焦点描述必须与 constants.js 中该 id 的真实设备一致：
  // 01 伸膝(股四头) / 02 屈膝(腘绳) / 03 腹屈(核心) / 04 背伸(竖脊+臀大)
  // 05 胸推 / 06 划船 / 07 下压 / 08 高拉 / 09 下肢蹬踏(髋膝复合)
  var SARCO_RX = {
    '09': {
      focus: '下肢蹬踏（髋膝伸链复合）', why: '肌少症首要靶点，直接决定起立与行走能力',
      keyPoints: '双脚平踏踏板，膝与足尖同向；伸膝带动座椅后滑，动作匀速、不甩腿、不锁膝',
      contraindication: '严重膝骨关节炎急性期、未控制高血压暂缓；ROM 限制 0–60°，避免末端伸膝加载',
      dose: function (ctx, band, ref) {
        return ref ? kgRange(ref.weak, band) + '（' + band.label + ' 弱侧 1RM）×8–12 次×2–3 组，全脚掌均匀发力'
          : '坐姿安全位，轻–中等阻力 10–15 次×2–3 组，RPE≤13';
      }
    },
    '01': {
      focus: '膝关节伸展（股四头肌专项）', why: '股四头肌力与起坐、上下楼及跌倒风险直接相关',
      keyPoints: '勾脚背抵住软垫，股四头肌发力带动伸膝，末端不锁死膝关节',
      contraindication: '髌股疼痛综合征者减小活动度，避免末端伸膝位加载',
      dose: function (ctx, band, ref) {
        return ref ? kgRange(ref.weak, band) + '（' + band.label + ' 弱侧 1RM）×8–12 次×2–3 组'
          : '轻阻 10–15 次×2–3 组，RPE≤13，末端不锁膝';
      }
    },
    '02': {
      focus: '膝关节屈曲（腘绳肌）', why: '维持屈伸肌前后链平衡，降低步态失稳与跌倒风险',
      keyPoints: '腘绳肌发力缓慢屈膝下压，离心阶段 2–3 秒控制，不快速甩腿',
      contraindication: '后交叉韧带损伤史者禁用或遵医嘱；膝关节肿胀期暂缓',
      dose: function (ctx, band, ref) {
        return ref ? (Math.round(ref.weak * band.lo * 0.7 * 10) / 10) + '–' + (Math.round(ref.weak * band.hi * 0.7 * 10) / 10) + ' kg（约伸膝负荷的 70%）×10–12 次×2 组'
          : '轻阻 10–15 次×2 组，避免快速甩腿';
      }
    },
    '04': {
      focus: '背肌伸展（竖脊肌 + 臀大肌）', why: '改善躯干姿势控制与后链力量，减少驼背与后向失衡',
      keyPoints: '后背贴紧软垫，腰腹发力缓慢后伸，禁憋气、禁弹震，幅度控制在 ROM 0–30°',
      contraindication: '急性腰痛、椎体压缩骨折者禁用',
      dose: function () { return '轻–中等阻力 10–15 次×2–3 组，ROM 0–30°，禁憋气、禁弹震'; }
    },
    '03': {
      focus: '腹肌屈曲（核心稳定）', why: '躯干稳定是所有站立位活动与转移的基础',
      keyPoints: '双臂抱垫、腹部发力前屈，颈部放松不代偿，全程正常呼吸',
      contraindication: '腹压增高性疾病（如未控疝气、重度便秘）者避免用力收腹',
      dose: function () { return '自重或轻阻 10–15 次×2 组，或等长收缩 10–20 秒×3 组，全程正常呼吸'; }
    },
    '06': {
      focus: '坐式划船（上肢拉 + 握持）', why: '握力偏低者需同步强化上肢拉链与握持耐力',
      keyPoints: '肩胛先启动再后拉，握把自然不紧绷，肩不耸起',
      contraindication: '肩袖损伤急性期禁用；肩关节活动受限者减小 ROM',
      dose: function () { return '轻–中等阻力 10–15 次×2–3 组，握把不过紧，肩胛先启动'; }
    },
    '05': {
      focus: '胸推（上肢推）', why: '维持日常撑起、推门等推类动作能力',
      keyPoints: '肩胸发力水平前推，肘不过伸、肩不耸起，末端不锁肘',
      contraindication: '肩关节撞击综合征者减小活动度；胸主动脉术后遵医嘱',
      dose: function () { return '轻–中等阻力 10–15 次×2 组，肘不过伸，肩不耸起'; }
    }
  };
  function selectDevices(ctx, reasons, opts) {
    opts = opts || {};
    var sev = opts.sev || severityStage(ctx);
    var band = intensityBand(sev);
    var ref = oneRMRef(ctx);
    var grip = ctx.gripEval || {};

    // 基础组：下肢复合 + 股四头专项 + 后链姿势
    var ids = ['09', '01', '04'];
    var pick = [];
    // 双侧不对称或已有双侧 1RM → 补屈膝，做前后链与弱侧平衡
    if ((opts.lsi && opts.lsi.asymmetric) || (ref && ref.bilateral)) { ids.push('02'); pick.push('存在双侧数据/不对称，加入屈膝以平衡前后链'); }
    // 握力低 → 补上肢拉
    if (grip.low) { ids.push('06'); pick.push('握力偏低，加入坐式划船强化上肢拉链与握持'); }
    // 体能尚可（非严重）→ 补核心与上肢推，形成全身多组分抗阻
    if (sev.stage !== 'severe') { ids.push('03', '05'); pick.push('非严重期，补充核心与上肢推，构成全身多组分抗阻'); }

    var all = (window.CONST && CONST.DEVICES ? CONST.DEVICES : []);
    var out = [];
    ids.forEach(function (id) {
      if (out.some(function (x) { return x.id === id; })) return;   // 去重
      var d = all.filter(function (x) { return x.id === id; })[0];
      var rx = SARCO_RX[id];
      if (!d || !rx) return;                                        // 设备档案被自定义删除时跳过
      var dose = rx.dose(ctx, band, ref);
      if (ctx.jointIssue && (id === '01' || id === '02' || id === '09')) {
        dose += '；【关节禁忌】ROM 限制 0–60°，避免末端伸直位加载，出现关节痛立即降载';
      }
      out.push({ id: id, name: d.name, short: d.short || '', code: d.code || ('QD-' + id), muscles: d.muscles || '', focus: rx.focus, why: rx.why || '', dose: dose, keyPoints: rx.keyPoints || '', contraindication: rx.contraindication || '', illustrationRef: 'qd-' + id, img: d.img || '', video: d.video || '' });
    });

    if (out.length) {
      reasons.push('设备处方同源自鹊动 ' + all.length + ' 台设备档案，本次选取 ' + out.length + ' 台：' +
        out.map(function (d) { return d.name; }).join('、'));
      pick.forEach(function (p) { reasons.push('设备选取依据：' + p); });
      if (ref) reasons.push('设备配重统一按弱侧 1RM ' + ref.weak + ' kg × ' + band.label + ' 换算 ≈ ' + kgRange(ref.weak, band));
    }
    return out;
  }

  /* ---------- R3 禁忌强制网关：关节问题降级负重/站立动作 ---------- */
  // 仅保留动作库中真实产出的姿态枚举；原 squat/loaded_stand 在本库从未生成，属死代码，已剔除
  var JOINT_BAN_POSTURE = ['stand_free'];
  function contraindicationGate(matchResult, ctx) {
    var reasons = [];
    var gated = matchResult;
    if (ctx.jointIssue) {
      reasons.push('存在关节/膝问题，已自动降级深蹲、无扶手站立、负重站立类动作，改为坐姿/扶椅替代');
      // 标记需规避的动作（仅做提示，不改 matcher 原数据，保证可审计）
      gated = JSON.parse(JSON.stringify(matchResult));
      ['main', 'balance', 'aerobic', 'warmup', 'stretch'].forEach(function (g) {
        if (gated[g] && gated[g].items) gated[g].items = gated[g].items.map(function (it) {
          if (JOINT_BAN_POSTURE.indexOf(it.posture) >= 0) {
            return Object.assign({}, it, { status: 'forbidden', note: (it.note ? it.note + '；' : '') + '关节禁忌·已规避' });
          }
          return it;
        });
      });
    }
    if (ctx.fallKey === 'high' || (ctx.fall && ctx.fall.levelKey === 'high')) {
      reasons.push('跌倒高风险，所有站姿动作须扶椅/靠墙，禁止单脚长时间独立站立与闭眼站立');
    }
    return { gated: gated, reasons: reasons };
  }

  /* ---------- R4 LSI 弱侧单侧 ---------- */
  /* 注意量纲：本系统 calc.js 产出的 strength.lsi 是「双侧差值百分数」（0–100，越大越不对称），
   * 而部分外部口径用「对称指数比值」（0–1，越小越不对称）。此处两种口径都兼容，
   * 统一归一为 diffPct（差值%）与 symmetryPct（对称%），临床阈值取差值 ≥15%（即 LSI≤85%）。 */
  var LSI_DIFF_THRESHOLD = 15;
  function lsiNote(ctx, reasons) {
    reasons = reasons || [];
    var s = ctx.strength;
    if (!s) return { asymmetric: false, reasons: [] };

    var l = n(s.oneRML), r = n(s.oneRMR);
    var diffPct = null;
    var raw = n(s.lsi);
    if (raw != null) diffPct = raw <= 1 ? Math.round((1 - raw) * 1000) / 10 : raw;
    if (diffPct == null && l != null && r != null && l > 0 && r > 0) {
      var mx = Math.max(l, r);
      diffPct = mx ? Math.round(Math.abs(l - r) / mx * 1000) / 10 : null;
    }
    if (diffPct == null || diffPct < LSI_DIFF_THRESHOLD) {
      return { asymmetric: false, diffPct: diffPct, symmetryPct: diffPct == null ? null : Math.round((100 - diffPct) * 10) / 10, reasons: [] };
    }

    // 弱侧 = 1RM 更小的一侧（calc.js:601 同口径）
    var side = (l != null && r != null && l !== r) ? (l < r ? '左' : '右') : null;
    var symmetryPct = Math.round((100 - diffPct) * 10) / 10;
    reasons.push('双侧不对称：差值 ' + diffPct + '%（LSI≈' + symmetryPct + '%，低于 85% 阈值）' +
      (side ? '，' + side + '侧为弱侧（' + Math.min(l, r) + ' kg vs ' + Math.max(l, r) + ' kg）' : '') +
      '，需额外单侧强化与神经肌肉控制训练');
    return { asymmetric: true, side: side, diffPct: diffPct, symmetryPct: symmetryPct, lsi: symmetryPct / 100, reasons: reasons };
  }

  /* ---------- 适配器：SarcEngine.computeAll(R) → generate(ctx) 所需扁平字段 ----------
   * computeAll 返回的是对象态（calfEval / gaitEval），而 generate 读取扁平字段
   * （calfLow / gaitValue / jointIssue / bmi / fallKey）。所有调用方统一先过本函数，
   * 避免「传了真实 R 却丢信号」（禁忌网关不触发、严重度误判）。 */
  function adaptComputeResult(R, patient) {
    if (!R) return null;
    var p = patient || {};
    var bmi = R.bmi != null ? R.bmi
      : (p.bmi != null ? n(p.bmi)
        : (p.height && p.weight ? Math.round(p.weight / Math.pow(p.height / 100, 2) * 10) / 10 : null));

    var jointIssue = R.jointIssue;
    if (jointIssue == null) {                       // 兼容旧版 computeAll（未回传 jointIssue）
      var life = R.life || {};
      var raw = life.raw || life.detailRaw || {};
      jointIssue = (life.jointDisease === true) || n(life.jointDisease) > 0 || n(raw.jointDisease) > 0;
      if (!jointIssue && life.detail && life.detail.length) {
        jointIssue = life.detail.some(function (d) {
          return (d.key === 'jointDisease' || /关节|膝/.test(String(d.label || ''))) && n(d.value) > 0;
        });
      }
    }

    var out = {};
    for (var k in R) { if (Object.prototype.hasOwnProperty.call(R, k)) out[k] = R[k]; }
    out.calfLow = !!(R.calfEval && R.calfEval.low);
    out.gaitValue = R.gaitEval ? R.gaitEval.value : null;
    out.jointIssue = !!jointIssue;
    out.fallKey = R.fall ? R.fall.levelKey : null;
    out.bmi = bmi;
    return out;
  }

  /* ---------- 主入口：generate(ctx)，ctx 由 SarcEngine.computeAll 产出 ---------- */
  function generate(ctx) {
    ctx = ctx || {};
    var sev = severityStage(ctx);
    var dose = objectiveDose(ctx, sev);
    var lsi = lsiNote(ctx, []);
    var deviceReasons = [];
    var devices = selectDevices(ctx, deviceReasons, { sev: sev, lsi: lsi });

    var base = null;
    if (window.SarcExerciseLib && SarcExerciseLib.match) {
      try {
        base = SarcExerciseLib.match({
          gradeKey: ({ maintain: 'A', gain: 'B', lose: 'C', both: 'D' })[(ctx.direction && ctx.direction.key) || 'maintain'] || 'A',
          fallIndex: ctx.fall ? ctx.fall.index : null,
          sppbTotal: ctx.sppb ? ctx.sppb.total : null,
          gender: ctx.gender,
          gripValue: ctx.gripEval ? ctx.gripEval.value : null,
          calfLow: !!ctx.calfLow,
          gaitValue: ctx.gaitValue,
          smiLow: ctx.body ? !!ctx.body.smiLow : false,
          visceral: ctx.body ? ctx.body.vis : null,
          bmi: ctx.bmi,
          bodyFat: ctx.body ? ctx.body.fat : null,
          cfsValue: ctx.cfs && ctx.cfs.has ? ctx.cfs.value : null
        });
      } catch (e) { console.warn('[SarcEngine2] match 失败', e); }
    }
    var gate = base ? contraindicationGate(base, ctx) : { gated: null, reasons: [] };

    var reasons = [].concat(
      ['严重度分级：' + sev.label + '（' + (sev.reasons.join('；') || '各项指标未达异常阈值') + '）'],
      dose.reasons,
      gate.reasons,
      lsi.reasons || [],
      deviceReasons.length ? deviceReasons : ['设备处方：暂未匹配到鹊动设备档案（请确认设备档案已加载）']
    );

    return {
      engine: 'SarcEngine2',
      severity: sev,
      dose: dose,
      lsi: lsi,
      devices: devices,
      exercisePlan: gate.gated,
      exerciseMeta: base ? { freq: base.freq || '', duration: base.duration || '', safety: base.safety || [] } : null,
      fall: ctx.fall ? { level: ctx.fall.level, levelKey: ctx.fall.levelKey, priority: ctx.fall.priority } : null,
      reasons: reasons,
      reviewDays: sev.stage === 'severe' ? 30 : (sev.stage === 'confirmed' ? 60 : 90)
    };
  }

  /* ---------- 渲染（统一卡片风格，与 PlanEngine 对齐） ---------- */
  function badge(text, cls) { return '<span class="badge badge-' + (cls || 'info') + '">' + esc(text) + '</span>'; }
  function groupHTML(g) {
    if (!g || !g.items || !g.items.length) return '';
    return '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🤸</span>' + esc(g.title) + '</h3></div><div class="card-body">' +
      '<div class="ex-list">' + g.items.map(function (it) {
        var st = it.status === 'forbidden' ? 'ex-forbidden' : (it.status === 'recommend' ? 'ex-recommend' : 'ex-optional');
        return '<div class="ex-item ' + st + '"><div class="ex-name">' + esc(it.name) + (it.level ? ' <span class="ex-level">' + esc(it.level) + '</span>' : '') + '</div>' +
          '<div class="ex-meta">' + esc(it.params || '') + (it.note ? ' · ' + esc(it.note) : '') + '</div></div>';
      }).join('') + '</div></div></div>';
  }

  function renderHTML(plan) {
    if (!plan) return '<p style="color:var(--text-muted)">暂无严谨版方案数据。</p>';
    var parts = [];
    parts.push('<div class="sarc2-plan">');

    // 头部：严重度 + 剂量
    parts.push('<div class="card"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧓</span>肌少症严谨版方案</h3>' +
      badge(plan.severity.label, plan.severity.stage === 'severe' ? 'danger' : (plan.severity.stage === 'confirmed' ? 'warning' : 'success')) + '</div><div class="card-body">');
    parts.push('<div class="kv"><span>剂量锚定</span><b>' + esc(plan.dose.mode) + '</b> · ' + esc(plan.dose.target) + '</div>');
    parts.push('<div class="kv"><span>训练频次</span><b>' + esc(plan.dose.freq) + '</b></div>');
    parts.push('<div class="kv"><span>复查周期</span><b>' + plan.reviewDays + ' 天</b></div>');
    if (plan.dose.note) parts.push('<p style="font-size:13px;color:var(--text-muted);margin:8px 0 0;">' + esc(plan.dose.note) + '</p>');
    if (plan.lsi && plan.lsi.asymmetric) {
      parts.push('<p style="font-size:13px;color:#b45309;margin:8px 0 0;">⚠️ 双侧不对称：差值 ' + plan.lsi.diffPct + '%（LSI≈' + plan.lsi.symmetryPct + '%，&lt;85%）' +
        (plan.lsi.side ? '，<b>' + esc(plan.lsi.side) + '侧为弱侧</b>' : '') + '，需追加弱侧单侧强化。</p>');
    }
    parts.push('</div></div>');

    // 设备处方（同源）：带设备缩略图与图片/视频查看入口
    if (plan.devices && plan.devices.length) {
      parts.push('<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🏥</span>鹊动设备处方（同源 9 台档案）</h3></div><div class="card-body">' +
        plan.devices.map(function (d) {
          var devMeta = (window.CONST && CONST.DEVICES || []).filter(function (x) { return x.id === d.id; })[0] || {};
          var img = d.img || devMeta.img || '';
          var video = d.video || devMeta.video || '';
          var hasMedia = !!(img || video);
          var mediaHTML = hasMedia ?
            '<div class="rx-media" data-device-id="' + esc(d.id) + '">' +
            (img ? '<img src="' + esc(img) + '" alt="' + esc(d.name) + '" class="rx-media-thumb" onerror="this.style.display=\'none\'">' : '') +
            '<button type="button" class="btn btn-ghost btn-sm rx-media-open no-print" data-device-id="' + esc(d.id) + '">查看图片 / 视频</button>' +
            '</div>' : '';
          return '<div class="rx-item ' + (hasMedia ? 'has-media' : '') + '">' + mediaHTML +
            '<div class="rx-item-main"><div class="rx-head">' +
            '<b>' + esc(d.name) + '</b>' + (d.code ? '<span class="rx-code">' + esc(d.code) + '</span>' : '') +
            (d.short ? '<span class="rx-code">' + esc(d.short) + '</span>' : '') +
            '<span class="rx-focus">' + esc(d.focus) + '</span></div>' +
            (d.why ? '<div class="rx-why">' + esc(d.why) + '</div>' : '') +
            (d.muscles ? '<div class="rx-row"><strong style="color:var(--primary);">目标肌群：</strong>' + esc(d.muscles) + '</div>' : '') +
            '<div class="rx-row"><strong style="color:var(--primary);">训练剂量：</strong>' + esc(d.dose) + '</div>' +
            (d.keyPoints ? '<div class="rx-row"><strong style="color:var(--primary);">动作要领：</strong>' + esc(d.keyPoints) + '</div>' : '') +
            (d.contraindication ? '<div class="rx-row" style="color:var(--danger);"><strong>禁忌：</strong>' + esc(d.contraindication) + '</div>' : '') +
            '</div></div>';
        }).join('') + '</div></div>');
    }

    // 徒手动作（来自 36 库 + 禁忌网关）
    if (plan.exercisePlan) {
      var ep = plan.exercisePlan;
      parts.push(groupHTML(ep.warmup));
      parts.push(groupHTML(ep.main));
      parts.push(groupHTML(ep.balance));
      parts.push(groupHTML(ep.aerobic));
      parts.push(groupHTML(ep.stretch));
    }

    // 训练频次 / 单次时长 / 安全提示（此前未渲染，严谨版不可见）
    if (plan.exerciseMeta) {
      var m = plan.exerciseMeta;
      var metaRows = '';
      if (m.freq) metaRows += '<div class="kv"><span>训练频次</span><b>' + esc(m.freq) + '</b></div>';
      if (m.duration) metaRows += '<div class="kv"><span>单次时长</span><b>' + esc(m.duration) + '</b></div>';
      if (m.safety && m.safety.length) metaRows += '<div class="kv"><span>安全提示</span><ul class="reason-list">' + m.safety.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
      if (metaRows) parts.push('<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">📋</span>训练频次 · 时长 · 安全提示</h3></div><div class="card-body">' + metaRows + '</div></div>');
    }

    // 可解释 reasons
    parts.push('<div class="card mt-3 no-print"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🔍</span>方案依据（可解释）</h3></div><div class="card-body"><ul class="reason-list">' +
      plan.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div></div>');

    parts.push('</div>');
    return parts.join('');
  }

  return {
    generate: generate,
    renderHTML: renderHTML,
    adaptComputeResult: adaptComputeResult,
    severityStage: severityStage,
    objectiveDose: objectiveDose,
    selectDevices: selectDevices,
    version: '2.0'
  };
})();

/* 兼容层：标准版经 E() 调用的评分/数据表由 SarcCore（原 SarcEngine）提供，
 * SarcEngine2 作为唯一对外引擎暴露它们；旧 SarcEngine 全局已废弃删除。 */
(function () {
  if (!window.SarcCore) return;
  var KEYS = ['num', 'round1', 'evalContra', 'evalCalf', 'evalGrip', 'evalGait', 'evalBody',
    'evalSPPB', 'evalCFS', 'evalSarcF', 'evalLifeSurvey', 'evalMnaSF', 'evalAmt', 'evalFearFall',
    'fallRiskIndex', 'decideDirection', 'preferPlan', 'buildPlan', 'computeAll',
    'TH', 'CFS_LEVELS', 'BALANCE_OPTS', 'SARCF_ITEMS', 'LIFE_SECTIONS', 'LIFE_MAX',
    'MNA_SF_ITEMS', 'AMT_ITEMS', 'FEAR_FALL_ITEMS', 'CONTRA_ITEMS', 'DIRECTIONS', 'PLAN_LIB',
    'FALL_PLAN', 'COMMON_PRINCIPLES'];
  KEYS.forEach(function (k) {
    if (window.SarcEngine2[k] === undefined && window.SarcCore[k] !== undefined) window.SarcEngine2[k] = window.SarcCore[k];
  });
})();
