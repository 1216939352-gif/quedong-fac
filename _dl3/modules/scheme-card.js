/*
 * modules/scheme-card.js — 智能方案「标准卡片式」共享渲染器
 * 供 体重管理 / 老年肌少症 / 青少年脊柱 三单元「智能方案生成」共用，保证排版一致。
 * 对齐体重管理 renderPlanHTML 的 .card 动作卡视觉：
 *   · 编号 + 动作名
 *   · .exercise-diagram 系统生成示意图（动作库 figureSVG，缺省回退通用线条人物）
 *   · 目标肌群 / 训练剂量 / 动作要领 / 注意
 *   · 媒体块复用 window.PlanMediaView.thumb（上传图片/视频显示并点击播放；无图无视频 → 小Qoo 占位）
 * PC / 手机端 / 打印 导出 均使用同一卡片式排版。
 */
(function () {
  'use strict';
  var U = window.U;

  function esc(s) {
    if (s == null) return '';
    if (U && U.esc) return U.esc(s);
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============ 系统生成示意图（线条人物，按类别/体位） ============ */
  var SCHEMATICS = {
    resistance:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="60" cy="22" r="9"/><line x1="60" y1="31" x2="60" y2="66"/>' +
      '<line x1="60" y1="40" x2="34" y2="52"/><line x1="34" y1="52" x2="30" y2="36"/>' +
      '<line x1="60" y1="40" x2="86" y2="52"/><line x1="86" y1="52" x2="90" y2="36"/>' +
      '<line x1="60" y1="66" x2="46" y2="96"/><line x1="60" y1="66" x2="74" y2="96"/></svg>',
    balance:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="60" cy="22" r="9"/><line x1="60" y1="31" x2="60" y2="66"/>' +
      '<line x1="60" y1="40" x2="28" y2="58"/><line x1="28" y1="58" x2="24" y2="44"/>' +
      '<line x1="60" y1="42" x2="96" y2="40"/><line x1="60" y1="66" x2="86" y2="100"/><line x1="86" y1="100" x2="74" y2="100"/><line x1="60" y1="66" x2="52" y2="92"/></svg>',
    flexibility:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="64"/>' +
      '<line x1="60" y1="38" x2="30" y2="30"/><line x1="60" y1="44" x2="92" y2="58"/>' +
      '<line x1="60" y1="64" x2="40" y2="100"/><line x1="60" y1="64" x2="82" y2="100"/></svg>',
    aerobic:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="58" cy="22" r="9"/><line x1="58" y1="31" x2="58" y2="64"/>' +
      '<line x1="58" y1="40" x2="84" y2="30"/><line x1="58" y1="40" x2="36" y2="52"/>' +
      '<line x1="58" y1="64" x2="74" y2="96"/><line x1="58" y1="64" x2="44" y2="90"/></svg>',
    device:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="60" cy="24" r="8"/><line x1="60" y1="32" x2="60" y2="64"/>' +
      '<rect x="34" y="58" width="52" height="30" rx="6"/><line x1="86" y1="64" x2="100" y2="64"/><line x1="100" y1="64" x2="100" y2="84"/>' +
      '<line x1="60" y1="66" x2="48" y2="98"/><line x1="60" y1="66" x2="72" y2="98"/></svg>',
    default:
      '<svg viewBox="0 0 120 120" fill="none" stroke="#0d9488" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="60" cy="22" r="9"/><line x1="60" y1="31" x2="60" y2="68"/>' +
      '<line x1="60" y1="40" x2="36" y2="54"/><line x1="60" y1="40" x2="84" y2="54"/>' +
      '<line x1="60" y1="68" x2="46" y2="100"/><line x1="60" y1="68" x2="74" y2="100"/></svg>'
  };
  function schematicSVG(kind) { return SCHEMATICS[kind] || SCHEMATICS.default; }
  function catKind(cat) {
    if (!cat) return 'default';
    if (/抗阻|肌力|力量|主体|设备/.test(cat)) return 'resistance';
    if (/平衡/.test(cat)) return 'balance';
    if (/拉伸|放松|柔韧/.test(cat)) return 'flexibility';
    if (/有氧|心肺/.test(cat)) return 'aerobic';
    return 'default';
  }

  /* ============ 媒体块：复用 PlanMediaView.thumb（图片/视频/本地/Qoo 占位 + 点击播放） ============ */
  function mediaBlock(item, lib) {
    var img = item.image || item.img || '';
    var video = item.video || '';
    var name = item.name || '';
    var id = item.id || item.code || name || ('sc' + Math.random().toString(36).slice(2, 7));
    var e = { name: name, image: img, video: video };
    if (window.PlanMediaView && PlanMediaView.thumb) {
      return PlanMediaView.thumb(e, lib || 'plan', id, 160);
    }
    if (img) return '<div class="pmv-thumb" style="height:160px;"><img src="' + esc(img) + '" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"></div>';
    if (video) return '<div class="pmv-thumb pmv-thumb-v" style="height:160px;"><video src="' + esc(video) + '" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"></video><span class="pmv-play">▶</span></div>';
    return '<div class="pmv-thumb pmv-thumb-qoo" style="height:160px;"><img class="pmv-qoo-img" src="assets/qoo.png" alt="" onerror="this.style.display=\'none\'"><span class="pmv-qoo-cap">小Qoo 默认图</span></div>';
  }

  /* ============ 标准徒手动作卡（对齐体重管理 renderPlanHTML exerciseCard） ============ */
  function exerciseCard(item, idx, opts) {
    opts = opts || {};
    var lib = opts.lib || 'plan';
    var kind = opts.kind || catKind(item.cat);
    var svg = item.svg || schematicSVG(kind);
    var target = item.target || item.types || item.posture || '';
    var dose = item.dose || '';
    var key = item.key || item.steps || item.note || '';
    var caution = item.caution || item.cautions || '';
    return '<div class="card sc-ex-card">' +
      '<div class="card-body" style="padding:16px;">' +
        '<div class="sc-ex-head"><span class="sc-ex-idx">' + esc(idx) + '</span><strong class="sc-ex-name">' + esc(item.name) + '</strong></div>' +
        '<div class="exercise-diagram">' + svg + '</div>' +
        '<div class="sc-ex-meta">' +
          (target ? '<div><b class="sc-k">目标肌群：</b>' + esc(target) + '</div>' : '') +
          (dose ? '<div><b class="sc-k">训练剂量：</b>' + esc(dose) + '</div>' : '') +
          (key ? '<div class="sc-key"><b class="sc-k">动作要领：</b>' + esc(key) + '</div>' : '') +
          (caution ? '<div class="sc-caution"><b>注意：</b>' + esc(caution) + '</div>' : '') +
        '</div>' +
        '<div class="sc-media">' + mediaBlock(item, lib) + '</div>' +
      '</div></div>';
  }

  /* ============ 设备处方卡（对齐体重管理 设备方案 programBlock） ============ */
  function deviceCard(item, idx, opts) {
    opts = opts || {};
    var lib = opts.lib || 'plan';
    var params = item.params || null;
    var reason = (params && params.reason) || item.reason || '';
    var key = item.key || item.steps || item.note || (params && params.note) || '';
    var caution = item.caution || item.cautions || (Array.isArray(item.safety) ? item.safety.join('；') : (item.safety || ''));
    return '<div class="card sc-ex-card sc-dev-card">' +
      '<div class="card-body" style="padding:16px;">' +
        '<div class="sc-ex-head"><span class="sc-ex-idx sc-ex-idx-dev">' + esc(idx) + '</span><strong class="sc-ex-name">' + esc(item.name) + '</strong>' +
          (item.device ? '<span class="sc-dev-badge">🤖 鹊动设备</span>' : '') + '</div>' +
        (item.device ? '<div class="sc-dev-name">' + esc(item.device) + '</div>' : '') +
        '<div class="sc-ex-meta">' +
          (item.dose ? '<div><b class="sc-k">训练剂量：</b>' + esc(item.dose) + '</div>' : '') +
          (reason ? '<div><b class="sc-k">匹配依据：</b>' + esc(reason) + '</div>' : '') +
          (key ? '<div class="sc-key"><b class="sc-k">操作要点：</b>' + esc(key) + '</div>' : '') +
          (caution ? '<div class="sc-caution"><b>安全红线：</b>' + esc(caution) + '</div>' : '') +
        '</div>' +
        '<div class="sc-media">' + mediaBlock(item, lib) + '</div>' +
      '</div></div>';
  }

  /* ============ 分节卡片（对齐体重管理 .card 章节）
   * gridClass：手动动作节用 .sc-ex-grid（auto-fill 自适应列）；
   *           设备处方节统一用 .grid-3（与体重管理 programBlock / device1RMHTML 同款 3 列网格）。 */
  function section(title, icon, bodyHtml, gridClass) {
    return '<div class="card mt-3 sc-section"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">' +
      esc(icon || '🧩') + '</span>' + esc(title) + '</h3></div><div class="card-body"><div class="' + (gridClass || 'sc-ex-grid') + '">' + bodyHtml + '</div></div></div>';
  }

  /* ============ 整方案渲染（PC / 手机 / 打印 同版 .card 网格） ============ */
  function renderPlan(sections, opts) {
    opts = opts || {};
    var lib = opts.lib || 'plan';
    var isPrint = opts.mode === 'print';
    var body = (sections || []).map(function (s) {
      var cards = (s.items || []).map(function (it, i) {
        var kind = catKind(s.cat);
        if (it.device) {
          /* 设备处方卡统一对齐体重管理的 PlanView.itemCard：
           *  · 全局不画线条人物示意图
           *  · 仅显示上传的设备图 / 视频（点 ▶ 播放由 PlanView.bindPlay 委派） */
          if (window.PlanView && PlanView.itemCard) {
            var pvUnit = lib === 'spine' ? 'spine' : (lib === 'sarc' ? 'sarcopenia' : 'weight');
            var pvMode = isPrint ? 'print' : (opts.mode === 'mobile' ? 'mobile' : 'pc');
            return PlanView.itemCard(it, { unit: pvUnit, mode: pvMode, idx: i });
          }
          return deviceCard(it, i + 1, { lib: lib, mode: opts.mode });
        }
        return exerciseCard(it, i + 1, { lib: lib, mode: opts.mode, kind: kind, cat: s.cat });
      }).join('');
      /* 设备处方节统一走 .grid-3（3 列固定网格），与体重管理 device1RMHTML / programBlock 同款排版；
       * 手动动作节保持 .sc-ex-grid（auto-fill 自适应列）。 */
      var isDeviceSection = !!(s.items && s.items.length && s.items[0] && s.items[0].device);
      return section(s.cat, s.icon, cards, isDeviceSection ? 'grid-3' : 'sc-ex-grid');
    }).join('');
    if (opts.qrHtml) body += '<div class="mt-3">' + opts.qrHtml + '</div>';
    if (isPrint) {
      var head = opts.title
        ? '<div class="sc-print-head"><div class="sc-print-title">' + esc(opts.title) + '</div>' +
          (opts.sub ? '<div class="sc-print-sub">' + esc(opts.sub) + '</div>' : '') + '</div>'
        : '';
      var wrapCls = 'report-doc sarc-doc sc-print-doc' + (lib === 'spine' ? ' spine-print' : '');
      return '<div class="' + wrapCls + '">' + head + body +
        '<div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>' +
        '<div class="report-footer">本报告依据国家减重指南与 ACSM 运动处方规范生成，仅供临床参考。</div></div>';
    }
    return body;
  }

  window.SchemeCard = {
    exerciseCard: exerciseCard,
    deviceCard: deviceCard,
    section: section,
    renderPlan: renderPlan,
    schematicSVG: schematicSVG,
    catKind: catKind,
    mediaBlock: mediaBlock
  };
})();
