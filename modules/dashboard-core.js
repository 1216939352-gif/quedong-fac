/**
 * 看板公共内核（DashCore）
 * 汇总体重管理 / 肌少症 / 跌倒风险三大看板共用的：
 *   图表绘制（donut/bar/line/hbar）、图例、入场动效、可展开卡片组件、
 *   名单 CSV 导出、通用数据工具与演示数据生成器。
 * 依赖全局 U（SPA 工具集）。须在 bigdata / sarcopenia / fallrisk 模块之前加载。
 */
window.DashCore = (function () {
  'use strict';
  const U = window.U;

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function countBy(arr, keyFn) {
    const map = {};
    arr.forEach(item => {
      const k = keyFn(item);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  function fmtDate(d) {
    if (!d) return '';
    const s = typeof d === 'string' ? d : new Date(d).toISOString();
    return s.slice(0, 10);
  }

  function donutChart(data, colors, size = 120) {
    const total = data.reduce((a, b) => a + b.value, 0);
    if (!total) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const r = size / 2 - 8;
    const cx = size / 2, cy = size / 2;
    let acc = 0;
    const segs = data.map((d, i) => {
      const a0 = acc / total * Math.PI * 2 - Math.PI / 2; acc += d.value;
      const a1 = acc / total * Math.PI * 2 - Math.PI / 2;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      return `<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${colors[i % colors.length]}" opacity="0.92" />`;
    }).join('');
    return `
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;flex-shrink:0;">
        ${segs}
        <circle cx="${cx}" cy="${cy}" r="${size * 0.22}" fill="var(--skin-surface)" />
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="${size * 0.16}" font-weight="800" fill="var(--text-primary)">${total}</text>
      </svg>`;
  }

  function barChart(items, max, color) {
    if (!items.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const h = 120;
    const barW = 28, gap = 18;
    const w = items.length * (barW + gap) + gap;
    const baseline = h - 20;
    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;">
        ${items.map((it, i) => {
          const bh = max ? (it.value / max) * (h - 30) : 0;
          const x = gap + i * (barW + gap);
          const y = baseline - bh;
          return `<g>
            <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="4" fill="${color}" opacity="0.9" />
            <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="var(--text-primary)">${it.value}</text>
            <text x="${x + barW / 2}" y="${baseline + 14}" text-anchor="middle" font-size="10" fill="var(--text-muted)">${it.label}</text>
          </g>`;
        }).join('')}
        <line x1="${gap}" y1="${baseline}" x2="${w - gap}" y2="${baseline}" stroke="rgba(148,163,184,0.3)" stroke-width="1" />
      </svg>`;
  }

  function lineChart(points, color) {
    if (!points.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const w = 320, h = 120, pad = 24;
    const max = Math.max(...points.map(p => p.value), 1);
    const xStep = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => {
      const x = pad + i * xStep;
      const y = h - pad - (p.value / max) * (h - pad * 2);
      return { x, y, label: p.label, value: p.value };
    });
    const pathD = coords.map((c, i) => (i ? 'L' : 'M') + `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    return `
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;height:${h}px;">
        <defs><linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
        <path d="${pathD} L${coords[coords.length-1].x},${h-pad} L${coords[0].x},${h-pad} Z" fill="url(#lineFill)" />
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="${color}"/>`).join('')}
        ${coords.filter((_, i) => i % 5 === 0 || i === coords.length - 1).map(c => `<text x="${c.x.toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${c.label}</text>`).join('')}
      </svg>`;
  }

  function hbarChart(items, color) {
    if (!items.length) return '<div style="color:var(--text-muted)">暂无数据</div>';
    const h = 26, gap = 10;
    const max = Math.max(...items.map(i => i.value), 1);
    return `
      <div style="display:flex;flex-direction:column;gap:${gap}px;width:100%;">
        ${items.map(it => {
          const pct = (it.value / max) * 100;
          return `<div style="display:flex;align-items:center;gap:10px;font-size:12px;">
            <div style="width:80px;color:var(--text-muted);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${U.esc(it.label)}</div>
            <div style="flex:1;background:rgba(148,163,184,0.14);border-radius:6px;height:${h}px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;opacity:0.9;"></div>
            </div>
            <div style="width:36px;color:var(--text-primary);font-weight:700;">${it.value}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function legendHTML(items, colors) {
    return `<div class="bigdata-legend">
      ${items.map((d, i) => `<div><span style="background:${colors[i % colors.length]}"></span>${U.esc(d.label)} ${d.value} 人</div>`).join('')}
    </div>`;
  }

  // 数据展示动效：入场错峰、KPI 数字滚动、图表绘制动画（尊重 prefers-reduced-motion）
  function animateBigdata(root, reduce) {
    if (!root || !root.isConnected) {
      if (root && !root.isConnected) requestAnimationFrame(() => animateBigdata(root, reduce));
      return;
    }
    const cards = root.querySelectorAll('.bigdata-card');
    if (reduce) { cards.forEach(c => { c.style.opacity = ''; }); return; }

    const ease = 'cubic-bezier(.2,.8,.2,1)';

    // 1) 卡片入场（淡入 + 上滑），结束后清除内联样式交还 CSS hover
    cards.forEach((c, i) => {
      const a = c.animate(
        [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 480, delay: Math.min(i, 18) * 42, easing: ease, fill: 'both' }
      );
      a.onfinish = () => { c.style.opacity = ''; a.cancel(); };
    });

    // 2) KPI 数字滚动（easeOutCubic）
    root.querySelectorAll('.bigdata-kpi .bigdata-value').forEach(el => {
      const raw = el.textContent.trim();
      const num = parseFloat(raw);
      if (isNaN(num)) return;
      const parts = raw.split('.');
      const decimals = parts.length > 1 ? parts[1].length : 0;
      const dur = 900, t0 = performance.now();
      (function step(t) {
        const p = Math.min((t - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 3);
        el.textContent = (num * e).toFixed(decimals);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = raw;
      })(t0);
    });

    // 3) 柱状图：自底生长
    root.querySelectorAll('.bigdata-chart-card svg rect').forEach((r, i) => {
      r.style.transformBox = 'fill-box';
      r.style.transformOrigin = 'bottom';
      const a = r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 620, delay: 140 + i * 70, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });

    // 4) 环形图：整体缩放入场（含中心圆与数值）
    root.querySelectorAll('.bigdata-chart-card svg').forEach((svg) => {
      if (svg.querySelector('path[fill="none"]')) return; // 折线图单独处理
      if (!svg.querySelector('circle')) return;           // 仅环形图（含中心圆），跳过柱状图
      svg.style.transformBox = 'fill-box';
      svg.style.transformOrigin = 'center';
      const a = svg.animate([{ transform: 'scale(.86)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 520, delay: 160, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });

    // 5) 折线图：描线 + 面积淡入 + 节点弹出
    root.querySelectorAll('.bigdata-chart-card svg').forEach((svg) => {
      const line = svg.querySelector('path[fill="none"]');
      if (!line) return;
      const area = svg.querySelector('path:not([fill="none"])');
      const dots = svg.querySelectorAll('circle');
      try {
        const L = line.getTotalLength();
        line.style.strokeDasharray = L;
        const a = line.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 1000, easing: 'ease-in-out', fill: 'both' });
        a.onfinish = () => a.cancel();
      } catch (e) {}
      if (area) { const a2 = area.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 320, fill: 'both' }); a2.onfinish = () => a2.cancel(); }
      dots.forEach((d, i) => {
        d.style.transformBox = 'fill-box'; d.style.transformOrigin = 'center';
        const a3 = d.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 320, delay: 520 + i * 60, easing: 'ease-out', fill: 'both' });
        a3.onfinish = () => a3.cancel();
      });
    });

    // 6) 横向条形（医生工作量 TOP5）：宽度增长
    root.querySelectorAll('.bigdata-chart-card').forEach((card) => {
      card.querySelectorAll('div[style*="width:"][style*="%"]').forEach((b, i) => {
        const target = b.style.width;
        if (!target || target === '0%') return;
        const a = b.animate([{ width: '0%' }, { width: target }], { duration: 820, delay: 220 + i * 90, easing: ease, fill: 'both' });
        a.onfinish = () => a.cancel();
      });
    });

    // 7) 漏斗项：错峰左滑入
    root.querySelectorAll('.bigdata-funnel-item').forEach((it, i) => {
      const a = it.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 460, delay: 220 + i * 110, easing: ease, fill: 'both' });
      a.onfinish = () => a.cancel();
    });
  }

  function filterPatientsByRange(patients, range) {
    if (!range || range === 'all') return patients;
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 0;
    if (!days) return patients;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
    return patients.filter(p => p.createdAt && new Date(p.createdAt) >= cutoff);
  }

  function demoPatients() {
    const surnames = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
    const names = ['伟', '芳', '娜', '敏', '静', '强', '磊', '洋', '艳', '杰', '勇', '军', '平', '刚', '桂英'];
    const doctors = ['王医生', '李医生', '张医生', '赵医生', '刘医生'];
    const arr = [];
    const today = new Date();
    for (let i = 0; i < 48; i++) {
      const gender = Math.random() > 0.45 ? 'female' : 'male';
      const age = clamp(Math.round(22 + Math.random() * 48), 18, 75);
      const birth = new Date(today.getFullYear() - age, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      const h = clamp(Math.round(155 + Math.random() * 25), 150, 190);
      const w = clamp(Math.round((gender === 'female' ? 50 : 60) + Math.random() * 45), 45, 130);
      const bmi = U.round(w / Math.pow(h / 100, 2), 1);
      const waist = Math.round(gender === 'female' ? 68 + Math.random() * 35 : 75 + Math.random() * 35);
      const hip = Math.round(gender === 'female' ? 85 + Math.random() * 25 : 88 + Math.random() * 22);
      const whr = U.round(waist / hip, 2);
      const sbp = Math.round(105 + Math.random() * 55);
      const dbp = Math.round(65 + Math.random() * 35);
      const riskScore = (bmi >= 28 ? 2 : bmi >= 24 ? 1 : 0) + (age >= 55 ? 1 : 0) + (sbp >= 140 ? 1 : 0);
      const riskLabel = riskScore >= 3 ? '高风险' : riskScore >= 2 ? '中风险' : '低风险';
      const lifeScore = clamp(Math.round(40 + Math.random() * 55), 40, 98);
      const hasStrength = Math.random() > 0.55;
      const hasPlan = Math.random() > 0.4;
      const createdDaysAgo = Math.floor(Math.random() * 60);
      const createdAt = new Date(today);
      createdAt.setDate(createdAt.getDate() - createdDaysAgo);
      arr.push({
        id: 'demo-' + i,
        patientCode: 'QD-HET-' + String(i + 1).padStart(5, '0'),
        name: surnames[i % surnames.length] + names[i % names.length] + (i >= 15 ? (i >= 30 ? '某' : '') : ''),
        doctorId: doctors[i % doctors.length],
        createdAt: createdAt.toISOString(),
        data: {
          patient: { gender, birthDate: fmtDate(birth), height: h, weight: w, age },
          assessment: { bmi, waist, hip, whr, sbp, dbp, risk: { label: riskLabel } },
          plan: hasPlan ? {
            generatedAt: new Date().toISOString(),
            nutrition: {}, aerobic: {}, resistance: {}, flexibility: {}, balance: {}
          } : null,
          isokineticData: hasStrength && Math.random() > 0.5 ? [{ deviceId: '01', testDate: fmtDate(today) }] : [],
          isotonicData: hasStrength && Math.random() > 0.5 ? [{ deviceId: '03', testDate: fmtDate(today) }] : [],
          lifeSurvey: { _scored: { total: lifeScore, level: lifeScore >= 80 ? '优秀' : lifeScore >= 60 ? '良好' : lifeScore >= 45 ? '一般' : '较差' } }
        }
      });
    }
    return arr;
  }

  function expandToggle() {
    return '<button type="button" class="bd-expand-toggle" aria-label="展开/收起详情" title="展开 / 收起">▸</button>';
  }
  function kpiCardHTML(o) {
    return `<div class="bigdata-card bigdata-kpi is-expandable" data-bd-key="${o.key}">
      ${expandToggle()}
      <div class="bigdata-label">${o.label}</div>
      <div class="bigdata-value">${o.value}</div>
      <div class="bigdata-trend">${o.trend}</div>
      ${o.narrative ? `<div class="bd-narrative">${o.narrative}</div>` : ''}
      ${o.panel ? `<div class="bd-expand-panel"><div class="bd-expand-inner"><div class="bd-panel-pad">${o.panel}</div></div></div>` : ''}
    </div>`;
  }
  function chartCardHTML(o) {
    return `<div class="bigdata-card bigdata-chart-card is-expandable" data-bd-key="${o.key}">
      ${expandToggle()}
      <h3 class="bigdata-card-title">${o.title}</h3>
      <div class="bigdata-chart-row">${o.chartRow}</div>
      ${o.narrative ? `<div class="bd-narrative">${o.narrative}</div>` : ''}
      ${o.panel ? `<div class="bd-expand-panel"><div class="bd-expand-inner"><div class="bd-panel-pad">${o.panel}</div></div></div>` : ''}
    </div>`;
  }
  function miniList(items) {
    return `<ul class="bd-mini-list">${items.map(i => `<li><span>${U.esc(i.label)}</span><b>${i.value}${i.suffix || ''}${i.pct != null ? ' · ' + i.pct + '%' : ''}</b></li>`).join('')}</ul>`;
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // 健康语义色（固定，保证风险/状态辨识度）
  const SEM = {
    bmi: ['#60a5fa', '#34d399', '#fbbf24', '#f87171'],
    risk: ['#34d399', '#fbbf24', '#f87171'],
    life: ['#34d399', '#22d3ee', '#fbbf24', '#f87171']
  };

  return {
    clamp, countBy, fmtDate,
    donutChart, barChart, lineChart, hbarChart, legendHTML,
    animateBigdata, filterPatientsByRange, demoPatients,
    expandToggle, kpiCardHTML, chartCardHTML, miniList, downloadBlob,
    SEM
  };
})();
