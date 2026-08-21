/*
 * modules/plan-view.js — 智能方案页统一渲染器（D 医护端 / E 患者端 / F 打印 / 打卡页共用）
 * 统一「动作卡」渲染，支持 manual（徒手/居家）与 device（鹊动设备处方）两种变体。
 * 脊柱方案页、肌少症方案页、患者手机扫码打卡页（renderMobilePlan）均调用本模块，
 * 保证两单元排版一致、设备方案统一呈现。
 *
 * 依赖：window.U（全局工具，必须已加载）；可选 window.Share / window.openDeviceMedia（播放视频）。
 */
(function () {
  'use strict';
  var U = window.U;

  function esc(s) {
    if (s == null) return '';
    if (U && U.esc) return U.esc(s);
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // 把 steps 字符串（中文标点分隔）或数组归一为多行步骤
  function normSteps(steps) {
    if (Array.isArray(steps)) return steps.filter(Boolean);
    if (!steps) return [];
    return String(steps)
      .split(/[；;。.\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 1; });
  }

  // 小Qoo 占位图（动作/设备图缺失或 404 时兜底）
  var QOO_PLACEHOLDER = 'assets/qoo.png';

  function onImgErr() {
    return 'this.style.display=\'none\'; ' +
      'this.parentNode.classList.add(\'pv-media-empty\'); ' +
      'var ph=this.parentNode.querySelector(\'.pv-media-ph\'); if(ph) ph.style.display=\'flex\';';
  }

  // 媒体块：图片 + 视频播放浮层（点击委派，由 bindPlay 处理）
  function mediaBlock(item, mode) {
    var img = item.img || item.image || '';
    var video = item.video || '';
    var play = video
      ? '<button type="button" class="pv-play" data-pv-play="1" data-name="' + esc(item.name) +
        '" data-video="' + esc(video) + '" title="播放演示视频">▶</button>'
      : '';
    var ph = '<div class="pv-media-ph" style="display:none;">' +
      '<img src="' + esc(QOO_PLACEHOLDER) + '" alt="" onerror="this.style.display=\'none\'">' +
      '<span class="pv-media-ph-lbl">' + (item.device ? '🤖 鹊动设备' : '动作演示') + '</span>' +
      '</div>';

    if (mode === 'print') {
      return '<div class="pv-media pv-media-print' + (img ? '' : ' pv-media-empty') + '">' +
        (img ? '<img src="' + esc(img) + '" onerror="' + onImgErr() + '" alt="">' : '') + ph + '</div>';
    }
    return '<div class="pv-media' + (img ? '' : ' pv-media-empty') + '">' +
      (img ? '<img src="' + esc(img) + '" onerror="' + onImgErr() + '" alt="' + esc(item.name) + '">' : '') +
      ph + play + '</div>';
  }

  // 设备参数区（结构化字段，脊柱 QD-S1~4 的 params）→ 归一为 [[k,v],...]
  function deviceParamRows(item) {
    var p = item.params || null;
    if (!p) return [];
    var rows = [];
    if (p.load) rows.push(['负荷', p.load]);
    if (p.angleSpeed) rows.push(['角速度', p.angleSpeed]);
    if (p.resistance) rows.push(['阻力', p.resistance]);
    if (p.vibFreq) rows.push(['振动频率', p.vibFreq]);
    if (p.range) rows.push(['行程范围', p.range]);
    if (p.reason) rows.push(['匹配依据', p.reason]);
    if (p.note) rows.push(['要点', p.note]);
    return rows;
  }

  function paramsHtml(rows, cls) {
    if (!rows || !rows.length) return '';
    return '<div class="pv-params' + (cls ? ' ' + cls : '') + '">' +
      rows.map(function (r) {
        return '<div class="pv-param"><span class="pv-param-k">' + esc(r[0]) + '</span>' +
          '<span class="pv-param-v">' + esc(r[1]) + '</span></div>';
      }).join('') + '</div>';
  }

  // 剂量徽章（手动：3 组 × 10/侧；设备：负荷%1RM · 组次 · 间歇）
  function doseHtml(item, mode) {
    var dose = item.dose || '';
    if (!dose && item.params && item.params.load) {
      dose = item.params.load + (item.params.sets ? ' · ' + item.params.sets : '') +
        (item.params.rest ? ' · 间歇 ' + item.params.rest : '');
    }
    if (!dose) return '';
    var label = (mode === 'mobile' || mode === 'mplan' || mode === 'print') ? '做' : '剂量';
    // 患者端把 "3 组 × 10/侧" 口语化为 "做 3 组，每组 10/侧"
    var text = dose;
    if (mode === 'mobile' || mode === 'mplan') {
      text = dose.replace(/(\d+)\s*组\s*[×xX\*]\s*(\d+)/g, '做 $1 组，每组 $2')
        .replace(/(\d+)\s*次/g, '$1 次');
    }
    return '<div class="pv-dose"><span class="pv-dose-k">' + label + '</span>' + esc(text) + '</div>';
  }

  /*
   * 单条动作/设备卡
   * item: {name, device?, img/video, steps, cautions, types, levels, dose?, params?, safety?}
   * opts: {unit, mode:'pc'|'mobile'|'print'|'mplan', idx, anchor}
   */
  function itemCard(item, opts) {
    opts = opts || {};
    var mode = opts.mode || 'pc';
    var isDevice = !!item.device;
    var kind = isDevice ? 'device' : 'manual';
    var name = item.name || '';
    var steps = normSteps(item.steps);
    var cautions = item.cautions || item.caution || '';
    var safety = Array.isArray(item.safety) ? item.safety
      : (item.safety ? [item.safety] : []);
    var types = item.types || item.catLabel || '';
    var levels = item.levels || item.level || '';
    var anchor = opts.anchor ? ' id="' + esc(opts.anchor) + '"' : '';

    var stepLabel = (mode === 'mobile' || mode === 'mplan' || mode === 'print') ? '怎么做对' : '标准化步骤';
    var cautionLabel = (mode === 'mobile' || mode === 'mplan' || mode === 'print') ? '注意' : '易错点';

    var stepsHtml = steps.length
      ? '<ol class="pv-steps">' + steps.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ol>'
      : '';

    var cautionsHtml = cautions
      ? '<div class="pv-caution"><b>' + cautionLabel + '：</b>' + esc(cautions) + '</div>'
      : '';

    var safetyHtml = safety.length
      ? '<div class="pv-safety"><b>安全红线：</b><ul>' + safety.map(function (s) {
        return '<li>' + esc(s) + '</li>';
      }).join('') + '</ul></div>'
      : '';

    var metaBits = [];
    if (types) metaBits.push('<span class="pv-meta-chip">' + esc(types) + '</span>');
    if (levels) metaBits.push('<span class="pv-meta-chip">' + (mode === 'mobile' || mode === 'mplan' || mode === 'print' ? '强度 ' : '难度 ') + esc(levels) + '</span>');
    var metaHtml = metaBits.length ? '<div class="pv-meta">' + metaBits.join('') + '</div>' : '';

    var deviceBadge = isDevice
      ? '<span class="pv-device-badge">🤖 鹊动设备</span>' +
        '<div class="pv-device-name">' + esc(item.device) + '</div>'
      : '';

    var dose = doseHtml(item, mode);

    var cardCls = 'pv-card pv-' + kind + ' pv-' + mode + (opts.selected ? ' pv-selected' : '');
    var headerCls = 'pv-head';

    /* ===== 折叠式排版（设备处方卡文字密度控制） =====
     * 设备卡信息量大（参数 + 步骤 + 易错 + 安全红线），全展开会淹没关键处方。
     * 规则：主区只留「核心 2 条参数 + 剂量」；其余收进 <details> 折叠。
     *  - print 模式：details 带 open，纸质须完整；
     *  - 患者端（mobile/mplan）：安全红线提到主区常显，其余折叠；
     *  - 徒手动作卡不折叠（步骤即患者跟练主体）。
     */
    var bodyInner;
    var isPatient = (mode === 'mobile' || mode === 'mplan');
    if (isDevice && mode !== 'print') {
      var rows = deviceParamRows(item);
      var mainRows = rows.slice(0, 2);
      var restRows = rows.slice(2);
      var foldParts = paramsHtml(restRows, 'pv-params-rest') + stepsHtml + cautionsHtml +
        (isPatient ? '' : safetyHtml);
      var foldCount = restRows.length + (steps.length ? 1 : 0) + (cautions ? 1 : 0) +
        (!isPatient && safety.length ? 1 : 0);
      var foldHtml = foldParts
        ? '<details class="pv-fold"><summary class="pv-fold-sum">' +
          '<span class="pv-fold-txt">操作要领与安全须知</span>' +
          '<span class="pv-fold-n">' + foldCount + ' 项</span>' +
          '<span class="pv-fold-ico" aria-hidden="true">▾</span></summary>' +
          '<div class="pv-fold-body">' + foldParts + '</div></details>'
        : '';
      bodyInner = metaHtml + paramsHtml(mainRows) + (dose ? dose : '') +
        (isPatient ? safetyHtml : '') + foldHtml;
    } else {
      bodyInner = metaHtml + (isDevice ? paramsHtml(deviceParamRows(item)) : '') +
        (dose ? dose : '') + stepsHtml + cautionsHtml + safetyHtml;
    }

    var html =
      '<div class="' + cardCls + '"' + anchor + '>' +
        mediaBlock(item, mode) +
        '<div class="pv-body">' +
          '<div class="' + headerCls + '">' +
            '<div class="pv-name">' + esc(name) + '</div>' +
            deviceBadge +
          '</div>' +
          bodyInner +
        '</div>' +
      '</div>';
    return html;
  }

  // 评估依据溯源条（D 医护端顶部）
  function traceBar(trace) {
    if (!Array.isArray(trace) || !trace.length) return '';
    return '<div class="pv-trace">' + trace.map(function (t) {
      return '<div class="pv-trace-item"><span class="pv-trace-k">' + esc(t.label) +
        '</span><span class="pv-trace-v">' + esc(t.value) + '</span></div>';
    }).join('') + '</div>';
  }

  // D 医护端工作台：PC 宽屏
  function renderD(unit, sections, opts) {
    opts = opts || {};
    var ac = unit === 'spine' ? '#534AB7' : '#0D9488';
    var trace = traceBar(opts.trace);
    var tools = opts.tools !== false
      ? '<div class="pv-tools no-print">' +
          '<label class="pv-checkall"><input type="checkbox" id="pv-checkall"> 全选</label>' +
          '<button class="btn btn-ghost btn-sm" data-pv-act="batch-dose">批量调剂量</button>' +
          '<button class="btn btn-ghost btn-sm" data-pv-act="replace">替换动作</button>' +
          '<button class="btn btn-ghost btn-sm" data-pv-act="remove">移出方案</button>' +
          '<button class="btn btn-primary btn-sm" data-pv-act="push">下发到患者端</button>' +
          '<span class="pv-tools-sel" id="pv-sel-count">已选 0 项</span>' +
        '</div>'
      : '';
    var body = sections.map(function (sec) {
      var items = sec.items.map(function (it, i) {
        return itemCard(it, { unit: unit, mode: 'pc', idx: i, anchor: 'a-' + (it.code || it.id || it.name) });
      }).join('');
      return '<div class="pv-section"><div class="pv-section-ttl">' + esc(sec.cat) +
        ' <span class="pv-section-n">' + sec.items.length + ' 项</span></div>' +
        '<div class="pv-list">' + items + '</div></div>';
    }).join('');
    var stat = opts.stat || null;
    var statHtml = stat
      ? '<div class="pv-stat no-print">' +
          '<span>动作 <b>' + esc(stat.count) + '</b></span>' +
          '<span>分类 <b>' + esc(stat.cats) + '</b></span>' +
          '<span>单次时长 <b>' + esc(stat.duration) + '</b></span>' +
          '<span>含视频 <b>' + esc(stat.video) + '</b></span>' +
          (stat.cycle ? '<span>周期 <b>' + esc(stat.cycle) + '</b></span>' : '') +
        '</div>'
      : '';
    return '<div class="plan-view plan-pc" style="--ac:' + ac + '">' + trace + tools + body + statHtml + '</div>';
  }

  // E 患者端跟练：手机窄屏
  function renderE(unit, sections, opts) {
    opts = opts || {};
    var ac = unit === 'spine' ? '#534AB7' : '#0D9488';
    var greeting = opts.patientName ? (opts.patientName + '，今天也一起动一动吧 💪') : '今天也一起动一动吧 💪';
    var items = [];
    sections.forEach(function (sec) {
      sec.items.forEach(function (it) {
        items.push(it);
      });
    });
    var cards = items.map(function (it, i) {
      return itemCard(it, { unit: unit, mode: 'mobile', idx: i, anchor: 'a-' + (it.code || it.id || it.name) });
    }).join('');
    var progress = '<div class="pv-progress no-print"><div class="pv-progress-track"><div class="pv-progress-bar" id="pv-prog-bar" style="width:0%"></div></div>' +
      '<span class="pv-progress-txt" id="pv-prog-txt">完成进度 0/' + items.length + '</span></div>';
    var safety = opts.safety
      ? '<div class="pv-pat-safety">' + esc(opts.safety) + '</div>'
      : '';
    return '<div class="plan-view plan-mobile" style="--ac:' + ac + '">' +
      '<div class="pv-greet">' + esc(greeting) + '</div>' + progress +
      '<div class="pv-list">' + cards + '</div>' + safety + '</div>';
  }

  // F 打印纸卡：单大二维码 + 周打卡格 + 签名栏
  function renderF(unit, sections, opts) {
    opts = opts || {};
    var ac = unit === 'spine' ? '#534AB7' : '#0D9488';
    var qr = opts.qrHtml || '';
    var qrNote = opts.qrNote || '微信扫一扫，查看动作演示视频并完成每日打卡（无需登录）';
    var items = [];
    sections.forEach(function (sec) {
      sec.items.forEach(function (it) { items.push(it); });
    });
    var cards = items.map(function (it, i) {
      return itemCard(it, { unit: unit, mode: 'print', idx: i, anchor: 'a-' + (it.code || it.id || it.name) });
    }).join('');
    var week = ['一', '二', '三', '四', '五', '六', '日'];
    var checkRow = '<div class="pv-week">' + week.map(function (d) {
      return '<span class="pv-week-cell"><i>' + d + '</i><b></b></span>';
    }).join('') + '</div>';
    return '<div class="plan-view plan-print" style="--ac:' + ac + '">' +
      '<div class="pv-print-head">' +
        '<div><div class="pv-print-title">' + esc(opts.title || '训练方案') + '</div>' +
        '<div class="pv-print-sub">' + esc(opts.sub || '') + '</div></div>' +
        '<div class="pv-print-qr">' + qr + '<div class="pv-print-qr-note">' + esc(qrNote) + '</div></div>' +
      '</div>' +
      '<div class="pv-list">' + cards + '</div>' +
      '<div class="pv-print-foot">' +
        '<div class="pv-sign">医师签名：____________　　患者确认：____________　　复评日期：____/____/____</div>' +
        '<div class="pv-week-title">每周打卡（✓ 已完成）：</div>' + checkRow +
      '</div>' +
    '</div>';
  }

  // 绑定视频播放按钮（委派）
  function bindPlay(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-pv-play]');
      if (!btn) return;
      var name = btn.getAttribute('data-name') || '';
      var video = btn.getAttribute('data-video') || '';
      if (video && video !== '__local__') {
        if (window.openDeviceMedia) window.openDeviceMedia({ name: name, video: video });
        else if (window.openDeviceVideo) window.openDeviceVideo({ name: name, video: video });
        else window.open(video, '_blank');
      }
    });
  }

  window.PlanView = {
    itemCard: itemCard,
    renderD: renderD,
    renderE: renderE,
    renderF: renderF,
    traceBar: traceBar,
    bindPlay: bindPlay,
    normSteps: normSteps
  };
})();
