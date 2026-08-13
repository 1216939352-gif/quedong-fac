/* ============================================================
 * 训练方案执行记录（患者打卡数据回传 · 医生端台账区块）
 * 嵌入两个台账模块：#/dashboard（体重管理）、#/sarcopenia
 * 数据来源：GET /api/checkin/summary（多维聚合）、GET /api/checkin/records（明细）
 * 视觉：全部使用系统皮肤 CSS 变量（window.Skin），不硬编码颜色
 * ============================================================ */
(function () {
  'use strict';

  // 四级完成度定义（与手机端保持一致的语义与配色变量）
  var LEVELS = [
    { k: 'easy', label: '轻松完成', cls: 'b-easy', color: 'var(--success)', bg: 'var(--success-bg)' },
    { k: 'normal', label: '一般完成', cls: 'b-normal', color: 'var(--info)', bg: 'var(--info-bg)' },
    { k: 'hard', label: '费力完成', cls: 'b-hard', color: 'var(--warning)', bg: 'var(--warning-bg)' },
    { k: 'none', label: '未完成', cls: 'b-none', color: 'var(--danger)', bg: 'var(--danger-bg)' }
  ];
  var LEVEL_LABEL = { easy: '轻松完成', normal: '一般完成', hard: '费力完成', none: '未完成' };
  var REASON_TEXT = {
    r1: '动作没看懂', r2: '动作姿势难度大', r3: '动作组数/次数多',
    r4: '没有很好的场地/辅助道具', r5: '疲劳发虚'
  };

  function apiBase() {
    try { return (window.localStorage && localStorage.getItem('sync_api_base')) || ''; } catch (e) { return ''; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function patientName(pid) {
    try {
      var ps = (window.AppState && AppState.patients) || [];
      var hit = ps.find(function (p) { return p && p.id === pid; });
      return hit ? (hit.name || pid) : (pid || '匿名');
    } catch (e) { return pid || '匿名'; }
  }

  // 卡片静态骨架，scope: 'weight' | 'sarcopenia'
  function ledgerCard(scope) {
    var isSarc = scope === 'sarcopenia';
    var tag = isSarc ? '肌少症 · 居家训练' : '体重管理 · 训练方案';
    var desc = isSarc ? '患者居家训练打卡完成情况（肌少症方案）' : '患者训练方案打卡完成情况（体重管理方案）';
    return '' +
      '<div class="card te-card" data-te-scope="' + (isSarc ? 'sarcopenia' : 'weight') + '">' +
        '<div class="card-header te-header">' +
          '<div class="card-title"><span class="card-title-icon">📋</span>训练方案执行记录</div>' +
          '<span class="te-scope-tag">' + esc(tag) + '</span>' +
        '</div>' +
        '<div class="card-body te-body">' +
          '<div class="te-metrics" data-te-metrics><div class="te-loading text-muted">加载中…</div></div>' +
          '<div class="te-recent" data-te-recent><div class="te-loading text-muted">加载明细…</div></div>' +
        '</div>' +
        '<div class="te-foot text-muted">数据来自患者手机端扫码打卡 · ' + esc(desc) + '</div>' +
      '</div>';
  }

  function metricCard(val, unit, label, sub, color) {
    return '<div class="te-metric" style="--te-accent:' + (color || 'var(--primary)') + '">' +
      '<div class="te-metric-val">' + esc(val) + (unit ? '<span class="te-metric-unit">' + esc(unit) + '</span>' : '') + '</div>' +
      '<div class="te-metric-label">' + esc(label) + '</div>' +
      (sub ? '<div class="te-metric-sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function renderMetrics(summary) {
    if (!summary || summary.totalItems === 0) {
      return '<div class="te-empty">暂无打卡数据，请先通过方案页生成「训练打卡」分享二维码，引导患者扫码打卡。</div>';
    }
    var hardNone = (summary.levelDist.hard || 0) + (summary.levelDist.none || 0);
    var hardNonePct = summary.totalItems ? Math.round((hardNone / summary.totalItems) * 100) : 0;
    return '<div class="te-metric-row">' +
      metricCard(summary.completionRate, '%', '动作完成率', '已做 / 总动作数', 'var(--success)') +
      metricCard(summary.avgScore, '/4', '平均完成度', '四级评分均值', 'var(--info)') +
      metricCard(hardNonePct, '%', '费力+未占比', '需关注调整', 'var(--warning)') +
      metricCard(summary.streak, '天', '连续打卡', '最近连续天数', 'var(--primary)') +
      '</div>';
  }

  // 完成度分布迷你条
  function distBar(levelDist, colorVar) {
    var total = 0;
    LEVELS.forEach(function (l) { total += (levelDist[l.k] || 0); });
    if (!total) return '<span class="text-muted">无</span>';
    var segs = LEVELS.map(function (l) {
      var v = levelDist[l.k] || 0;
      var pct = Math.round((v / total) * 100);
      if (!pct) return '';
      return '<span class="te-dist-seg" style="width:' + pct + '%;background:' + l.color + '" title="' + l.label + ' ' + v + '"></span>';
    }).join('');
    return '<span class="te-dist">' + segs + '</span>';
  }

  function levelBadge(l) {
    return '<span class="te-exk-badge ' + (LEVELS.find(function (x) { return x.k === l; }) || {}).cls + '">' + (LEVEL_LABEL[l] || l) + '</span>';
  }

  function renderRecords(records) {
    if (!records || !records.length) {
      return '<div class="te-empty">暂无打卡明细记录。</div>';
    }
    var rows = records.slice(0, 12).map(function (rec, i) {
      var total = rec.items.length;
      var done = rec.items.filter(function (it) { return it.l !== 'none'; }).length;
      var rate = total ? Math.round((done / total) * 100) : 0;
      var dist = {}; LEVELS.forEach(function (l) { dist[l.k] = 0; });
      rec.items.forEach(function (it) { if (dist[it.l] != null) dist[it.l]++; });
      var detailId = 'te-detail-' + i;
      var detailRows = rec.items.map(function (it) {
        var reasons = Array.isArray(it.r) && (it.l === 'hard' || it.l === 'none')
          ? it.r.map(function (r) { return REASON_TEXT[r] || r; }).join('、') : '';
        return '<div class="te-exk-row">' +
          '<div class="te-exk-main"><span class="te-exk-nm">' + esc(it.n || it.id || '动作') + '</span>' +
          (it.m ? '<span class="te-exk-meta">' + esc(it.m) + '</span>' : '') + '</div>' +
          levelBadge(it.l) +
          (reasons ? '<div class="te-exk-reasons">原因：' + esc(reasons) + '</div>' : '') +
          '</div>';
      }).join('');
      return '<tr class="te-rec-row" data-toggle-detail="' + detailId + '">' +
        '<td class="te-td-date">' + esc(rec.date) + '</td>' +
        '<td class="te-td-pname">' + esc(patientName(rec.pid)) + '</td>' +
        '<td class="te-td-dist">' + distBar(dist) + '</td>' +
        '<td class="te-td-rate">' + rate + '%</td>' +
        '<td class="te-td-toggle"><span class="te-toggle">展开 ▾</span></td>' +
        '</tr>' +
        '<tr class="te-detail-row" id="' + detailId + '" style="display:none;"><td colspan="5">' +
          '<div class="te-detail-inner">' + detailRows + '</div></td></tr>';
    }).join('');

    return '<div class="adm-table-wrap te-rec-wrap"><table class="adm-user-table te-rec-table">' +
      '<thead><tr><th>日期</th><th>患者</th><th>完成度分布</th><th>完成率</th><th>明细</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // 注入后由 app.js 的 __onPageRendered 钩子调用
  async function fillAll(root) {
    root = root || document;
    var cards = root.querySelectorAll('[data-te-scope]');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var scope = card.getAttribute('data-te-scope');
        var metricsEl = card.querySelector('[data-te-metrics]');
        var recentEl = card.querySelector('[data-te-recent]');
        Promise.all([
          fetch(apiBase() + '/api/checkin/summary?all=1&scope=' + encodeURIComponent(scope) + '&days=14').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
          fetch(apiBase() + '/api/checkin/records?all=1&scope=' + encodeURIComponent(scope) + '&limit=30').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        ]).then(function (res) {
          var summary = (res[0] && res[0].ok) ? res[0].summary : null;
          var records = (res[1] && res[1].ok) ? res[1].records : [];
          if (metricsEl) metricsEl.innerHTML = renderMetrics(summary);
          if (recentEl) recentEl.innerHTML = renderRecords(records);
          bindToggle(card);
        });
      })(cards[i]);
    }
  }

  function bindToggle(root) {
    root.addEventListener('click', function (ev) {
      var tr = ev.target.closest('[data-toggle-detail]');
      if (!tr) return;
      var id = tr.getAttribute('data-toggle-detail');
      var detail = document.getElementById(id);
      if (!detail) return;
      var open = detail.style.display !== 'none';
      detail.style.display = open ? 'none' : 'table-row';
      var tog = tr.querySelector('.te-toggle');
      if (tog) tog.textContent = open ? '展开 ▾' : '收起 ▴';
    });
  }

  // ───────── 大数据看板：训练方案执行情况·多维区块 ─────────
  function renderBigdataBlock(summary) {
    if (!summary || summary.totalItems === 0) {
      return '<div class="bigdata-hero"><div class="bigdata-hero-text"><h2 class="bigdata-card-title">训练方案执行情况 · 多维分析</h2>' +
        '<p class="bigdata-hero-sub">患者手机端扫码打卡数据将汇总至此（完成度 / 困难原因 / 趋势）</p></div></div>' +
        '<div class="te-bd-empty">暂无打卡数据。请在方案页点击「生成训练打卡」生成二维码，引导患者扫码打卡后，本区块自动呈现多维数据。</div>';
    }
    var hardNone = (summary.levelDist.hard || 0) + (summary.levelDist.none || 0);
    var hardNonePct = summary.totalItems ? Math.round((hardNone / summary.totalItems) * 100) : 0;

    // KPI
    var kpis = [
      { v: summary.completionRate, u: '%', l: '动作完成率', c: 'var(--success)' },
      { v: summary.avgScore, u: '/4', l: '平均完成度', c: 'var(--info)' },
      { v: hardNonePct, u: '%', l: '费力+未占比', c: 'var(--warning)' },
      { v: summary.streak, u: '天', l: '连续打卡', c: 'var(--primary)' }
    ];
    var kpiHtml = kpis.map(function (k) {
      return '<div class="te-bd-kpi" style="--te-accent:' + k.c + '"><div class="te-bd-kpi-val">' + esc(k.v) + '<span class="te-bd-kpi-u">' + esc(k.u) + '</span></div><div class="te-bd-kpi-l">' + esc(k.l) + '</div></div>';
    }).join('');

    // 完成度分布（横向堆叠条 + 图例）
    var ld = summary.levelDist;
    var total = (ld.easy || 0) + (ld.normal || 0) + (ld.hard || 0) + (ld.none || 0);
    var distSegs = LEVELS.map(function (lv) {
      var v = ld[lv.k] || 0;
      var pct = total ? Math.round((v / total) * 100) : 0;
      return '<span class="te-bd-seg" style="width:' + pct + '%;background:' + lv.color + '"></span>';
    }).join('');
    var legend = LEVELS.map(function (lv) {
      var v = ld[lv.k] || 0;
      return '<span class="te-bd-legend-item"><span class="te-bd-legend-dot" style="background:' + lv.color + '"></span>' + lv.label + ' <b>' + v + '</b></span>';
    }).join('');
    var distCard = '<div class="bigdata-chart-card te-bd-card"><h3 class="bigdata-card-title">完成度分布</h3>' +
      '<div class="te-bd-stack"><div class="te-bd-track">' + distSegs + '</div></div>' +
      '<div class="te-bd-legend">' + legend + '</div></div>';

    // 困难原因分布（纵向条形）
    var reasons = [
      { k: 'r1', t: '动作没看懂' }, { k: 'r2', t: '动作姿势难度大' }, { k: 'r3', t: '动作组数/次数多' },
      { k: 'r4', t: '无好场地/道具' }, { k: 'r5', t: '疲劳发虚' }
    ];
    var maxR = 0; reasons.forEach(function (r) { maxR = Math.max(maxR, summary.reasonDist[r.k] || 0); });
    var reasonBars = reasons.map(function (r) {
      var v = summary.reasonDist[r.k] || 0;
      var h = maxR ? Math.round((v / maxR) * 100) : 0;
      return '<div class="te-bd-rbar-item"><div class="te-bd-rbar-col"><div class="te-bd-rbar-fill" style="height:' + h + '%;background:var(--warning)"></div></div><div class="te-bd-rbar-v">' + v + '</div><div class="te-bd-rbar-l">' + esc(r.t) + '</div></div>';
    }).join('');
    var reasonCard = '<div class="bigdata-chart-card te-bd-card"><h3 class="bigdata-card-title">困难原因分布</h3><div class="te-bd-rbars">' + reasonBars + '</div></div>';

    // 近 7 日趋势（纵向条形）
    var trend = Array.isArray(summary.trend) ? summary.trend : [];
    var maxT = 1; trend.forEach(function (d) { maxT = Math.max(maxT, d.total); });
    var trendBars = trend.map(function (d) {
      var h = maxT ? Math.round((d.total / maxT) * 100) : 0;
      var cls = d.completed > 0 ? ' on' : '';
      return '<div class="te-bd-trend-item"><div class="te-bd-trend-col"><div class="te-bd-trend-fill' + cls + '" style="height:' + h + '%"></div></div><div class="te-bd-trend-d">' + esc(d.date.slice(5)) + '</div></div>';
    }).join('');
    var trendCard = '<div class="bigdata-chart-card te-bd-card te-bd-card-wide"><h3 class="bigdata-card-title">近 7 日打卡趋势</h3><div class="te-bd-trend">' + trendBars + '</div></div>';

    return '<div class="bigdata-hero"><div class="bigdata-hero-text"><h2 class="bigdata-card-title">训练方案执行情况 · 多维分析</h2>' +
      '<p class="bigdata-hero-sub">动作完成度 / 困难原因 / 打卡趋势 · 共 ' + total + ' 条动作打卡记录</p></div></div>' +
      '<div class="te-bd-kpi-row">' + kpiHtml + '</div>' +
      '<div class="te-bd-grid">' + distCard + reasonCard + trendCard + '</div>';
  }

  async function fillBigdata(root) {
    var el = (root || document).querySelector('[data-te-bd]');
    if (!el) return;
    el.innerHTML = '<div class="te-loading text-muted">加载训练方案执行数据…</div>';
    try {
      var r = await fetch(apiBase() + '/api/checkin/summary?all=1&days=7');
      var j = r.ok ? await r.json() : null;
      el.innerHTML = renderBigdataBlock(j && j.ok ? j.summary : null);
    } catch (e) {
      el.innerHTML = renderBigdataBlock(null);
    }
  }

  window.TrainingExecution = {
    ledgerCard: ledgerCard,
    fillAll: fillAll,
    fillBigdata: fillBigdata,
    LEVELS: LEVELS
  };
})();
