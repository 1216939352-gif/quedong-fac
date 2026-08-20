/**
 * 鹊动FAC功能评估与干预系统 - 核心应用层
 * 状态管理 / SPA 路由 / 账号鉴权 / 会话控制 / 全局交互组件
 */

/* ==================== 全局状态 ==================== */
const AppState = {
  patient: {},              // 首诊登记数据
  assessment: {},           // 体格、代谢评估数据
  lifeSurvey: {},           // 生活习惯问卷数据
  plan: {},                 // 当前生成营养运动方案
  isokineticData: [],       // 全部历史等速肌力测评记录
  isotonicData: [],         // 全部历史等张肌力测评记录
  trainingPlanHistory: [],  // 历史迭代训练方案
  editMode: {},             // 方案编辑状态标记
  currentUser: null,        // 当前登录账号
  currentPatientId: null,   // 当前操作患者档案 ID
  patients: [],             // 当前医生名下患者列表
  config: {}                // 系统配置
};
window.AppState = AppState;

const SESSION_KEY = 'wm_session';
const THEME_KEY = 'wm_theme';

// 页面注册容器（提前声明，供后续顶层 Pages.xxx = ... 注册，避免 TDZ）
const Pages = {};
window.Pages = Pages;

/* ==================== 工具函数 ==================== */
const U = {
  qs: (sel, root) => (root || document).querySelector(sel),
  qsa: (sel, root) => Array.from((root || document).querySelectorAll(sel)),

  el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },

  esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  },

  num(v, d) {
    const n = parseFloat(v);
    return isNaN(n) ? (d === undefined ? null : d) : n;
  },

  round(v, digits) {
    if (v === null || v === undefined || isNaN(v)) return null;
    const p = Math.pow(10, digits === undefined ? 1 : digits);
    return Math.round(v * p) / p;
  },

  fmtDate(iso, withTime) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const pad = n => String(n).padStart(2, '0');
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
  },

  today() {
    return U.fmtDate(new Date().toISOString());
  },

  calcAge(birth) {
    if (!birth) return null;
    const b = new Date(birth);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
    return age;
  },

  daysBetween(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
  },

  /* Toast 消息提示 */
  toast(msg, type = 'info', duration = 3000) {
    // 参数顺序容错：若第一参数是提示类型、第二参数是文案，则自动交换
    const LEVELS = { success: 1, error: 1, warning: 1, info: 1, danger: 1 };
    if (typeof msg === 'string' && LEVELS[msg] && !LEVELS[type]) {
      const tmp = msg; msg = type; type = tmp;
    }
    let box = U.qs('.toast-container');
    if (!box) {
      box = U.el('<div class="toast-container"></div>');
      document.body.appendChild(box);
    }
    const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
    const qoo = (type === 'success') ? '<img class="toast-qoo" src="assets/qoo.png" alt="" onerror="this.style.display=\'none\'">' : '';
    const t = U.el(`<div class="toast ${type}">${qoo}<strong>${icons[type] || 'i'}</strong><span>${U.esc(msg)}</span></div>`);
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  /* 按钮 loading 态 + 防重复提交（S2 全局工具） */
  btnLoading(btn, label) {
    if (!btn || btn.dataset.loading === '1') return null; // 已在 loading，直接拒绝（防连点）
    const ctx = { html: btn.innerHTML, disabled: btn.disabled, pe: btn.style.pointerEvents };
    btn.dataset.loading = '1';
    btn.disabled = true;
    btn.style.pointerEvents = 'none';
    btn.classList.add('is-loading');
    if (label) btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>' + U.esc(label);
    return {
      restore() {
        delete btn.dataset.loading;
        btn.disabled = ctx.disabled;
        btn.style.pointerEvents = ctx.pe;
        btn.classList.remove('is-loading');
        if (label) btn.innerHTML = ctx.html;
      }
    };
  },
  async withBtn(btn, label, fn) {
    const ctrl = U.btnLoading(btn, label);
    if (!ctrl) return; // 防连点：上一次还没结束则忽略本次点击
    try { return await fn(); }
    finally { ctrl.restore(); }
  },

  /* ============ S5 统一加载动画（可复用 loading / skeleton） ============ */
  // 通用转圈：size=直径(px)，可选 color
  spinner(size = 22, opts = {}) {
    const s = size || 22;
    const b = Math.max(2, Math.round(s / 8));
    const col = (opts && opts.color) || 'var(--primary)';
    return `<span class="qd-spinner" style="width:${s}px;height:${s}px;border-width:${b}px;border-color:${col};border-top-color:transparent;" aria-hidden="true"></span>`;
  },
  // 居中加载态（带文案），用于整块内容异步获取时
  loading(text, opts = {}) {
    const o = opts || {};
    const size = o.size || 24;
    const pad = (o.pad != null) ? o.pad : '56px 0';
    const t = text || '加载中…';
    const block = o.block ? ' qd-loading--block' : '';
    return `<div class="qd-loading${block}" style="padding:${pad};" role="status" aria-live="polite">${U.spinner(size)}<div class="qd-loading-text">${U.esc(t)}</div></div>`;
  },
  // 骨架屏占位：rows=行数，opts.widths=各行宽度数组，opts.title=是否带标题占位
  skeleton(rows = 3, opts = {}) {
    const o = opts || {};
    const n = Math.max(1, rows | 0);
    let lines = '';
    for (let i = 0; i < n; i++) {
      const w = (o.widths && o.widths[i]) || (i === n - 1 ? '62%' : '100%');
      lines += `<div class="qd-skeleton-line" style="width:${w};"></div>`;
    }
    const head = o.title ? `<div class="qd-skeleton-line" style="width:42%;height:18px;margin-bottom:16px;"></div>` : '';
    return `<div class="qd-skeleton">${head}${lines}</div>`;
  },

  /* 把技术错误翻译成大白话（S3） */
  errMsg(e) {
    const raw = (e && typeof e === 'object' && e.message) ? e.message
      : (typeof e === 'string' ? e : '');
    if (!raw) return '操作未成功，请稍后重试';
    const s = raw.toLowerCase();
    if (s.includes('failed to fetch') || s.includes('networkerror') || s.includes('network error') || s.includes('load failed') || s.includes('offline'))
      return '网络连接异常，请检查网络后重试';
    if (s.includes('timeout') || s.includes('timed out') || s.includes('aborted'))
      return '操作超时，请稍后重试';
    if (s.includes('401') || s.includes('unauthorized') || s.includes('登录已过期') || s.includes('未登录') || s.includes('token') || s.includes('token expired'))
      return '登录已过期，请重新登录后再试';
    if (s.includes('403') || s.includes('forbidden') || s.includes('无权限') || s.includes('denied'))
      return '没有操作权限，请联系管理员';
    if (s.includes('404') || s.includes('not found') || s.includes('不存在'))
      return '请求的内容不存在，请刷新页面后重试';
    if (s.includes('500') || s.includes('internal server error') || s.includes('服务器'))
      return '服务器开小差了，请稍后再试';
    if (s.includes('cors') || s.includes('跨域') || s.includes('blocked by') || s.includes('access-control'))
      return '跨域请求被拦截，请联系管理员';
    if (s.includes('quota') || s.includes('storage') || s.includes('空间不足') || s.includes('disk'))
      return '存储空间不足，请清理后重试';
    if (s.includes('parse') || s.includes('syntaxerror') || s.includes('json'))
      return '返回的数据格式异常，请刷新页面后重试';
    // 普通提示（多为我们自己写的友好文案）原样保留，仅做截断/去噪声
    let clean = String(raw).split('\n')[0];
    if (clean.length > 80) clean = clean.slice(0, 80) + '…';
    clean = clean.replace(/^Error:\s*/i, '').replace(/^TypeError:\s*/i, '').replace(/^SyntaxError:\s*/i, '').replace(/^\[object Object\]/i, '');
    return clean || '操作未成功，请稍后重试';
  },

  /* 手机端表格卡片化（S4）：把 thead 表头注入为每行 td 的 data-label，
     并加 .responsive 类，配合 CSS 在窄屏把行变成卡片。已处理过的表打标跳过。 */
  enhanceTables(root) {
    const host = root || document;
    host.querySelectorAll('table.data-table:not([data-enhanced])').forEach(t => {
      const heads = Array.from(t.querySelectorAll('thead th')).map(th => (th.getAttribute('data-label') || th.textContent || '').trim());
      if (!heads.length) return; // 无表头的表（如键值表）不处理
      t.querySelectorAll('tbody tr').forEach(tr => {
        Array.from(tr.children).forEach((cell, i) => {
          if (cell.tagName === 'TD' && heads[i] && !cell.getAttribute('data-label')) {
            cell.setAttribute('data-label', heads[i]);
          }
        });
      });
      t.classList.add('responsive');
      t.setAttribute('data-enhanced', '1');
    });
  },
  setupTableObserver() {
    if (!('MutationObserver' in window) || U._tableObserver) return;
    const obs = new MutationObserver(() => {
      if (U._tableTimer) return;
      U._tableTimer = setTimeout(() => { U._tableTimer = null; U.enhanceTables(document.body); }, 120);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    U._tableObserver = obs;
  },

  /* 模态框 */
  modal({ title, body, footer, width, onMount, cls }) {
    if (!arguments[0]) {
      document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
      return { overlay: null, close() {} };
    }
    const w = width ? (typeof width === 'number' ? width + 'px' : String(width)) : '';
    const overlay = U.el(`
      <div class="modal-overlay">
        <div class="modal${cls ? ' ' + cls : ''}" style="${w ? `max-width:min(${w}, calc(100vw - 32px));` : ''}">
          <div class="modal-header">
            <h3 style="margin:0;font-size:17px;">${U.esc(title || '')}</h3>
            <button class="btn btn-ghost btn-sm modal-close">✕</button>
          </div>
          <div class="modal-body">${body || ''}</div>
          ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>`);
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.modal-close').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    if (onMount) onMount(overlay, close);
    return { overlay, close };
  },

  /* 二次确认弹窗（高风险操作） */
  confirm(message, onOk, opts = {}) {
    const { overlay, close } = U.modal({
      title: opts.title || '操作确认',
      body: `<div class="alert alert-warning" style="margin:0;">
               <div><strong>${U.esc(opts.heading || '请确认此操作')}</strong>
               <p style="margin:6px 0 0;font-size:14px;line-height:1.7;">${message}</p></div>
             </div>`,
      footer: `<button class="btn btn-secondary" data-act="cancel">取消</button>
               <button class="btn ${opts.danger === false ? 'btn-primary' : 'btn-danger'}" data-act="ok">${U.esc(opts.okText || '确认执行')}</button>`
    });
    overlay.querySelector('[data-act="cancel"]').onclick = close;
    overlay.querySelector('[data-act="ok"]').onclick = () => { close(); onOk && onOk(); };
  },

  /* 表单序列化 */
  formData(form) {
    const data = {};
    U.qsa('input, select, textarea', form).forEach(f => {
      if (!f.name) return;
      if (f.type === 'checkbox') {
        if (!data[f.name]) data[f.name] = [];
        if (f.checked) data[f.name].push(f.value);
      } else if (f.type === 'radio') {
        if (f.checked) data[f.name] = f.value;
      } else {
        data[f.name] = f.value;
      }
    });
    return data;
  },

  /* 表单回填 */
  fillForm(form, data) {
    if (!data) return;
    U.qsa('input, select, textarea', form).forEach(f => {
      if (!f.name || data[f.name] === undefined) return;
      const v = data[f.name];
      if (f.type === 'checkbox') {
        f.checked = Array.isArray(v) ? v.includes(f.value) : false;
        f.closest('.checkbox-item')?.classList.toggle('checked', f.checked);
      } else if (f.type === 'radio') {
        f.checked = (f.value === v);
        f.closest('.radio-item')?.classList.toggle('checked', f.checked);
      } else {
        f.value = (v == null ? '' : v);
      }
    });
  },

  /* 绑定 checkbox/radio 选中样式 */
  bindChoiceStyle(root) {
    U.qsa('.checkbox-item input, .radio-item input', root).forEach(inp => {
      const sync = () => {
        if (inp.type === 'radio') {
          U.qsa(`input[name="${inp.name}"]`, root).forEach(o =>
            o.closest('.radio-item')?.classList.toggle('checked', o.checked));
        } else {
          inp.closest('.checkbox-item')?.classList.toggle('checked', inp.checked);
        }
      };
      inp.addEventListener('change', sync);
      sync();
    });
  },

  /* "无"选项互斥逻辑 */
  bindNoneExclusive(root, name, noneValue = 'none') {
    const boxes = U.qsa(`input[name="${name}"]`, root);
    boxes.forEach(b => {
      b.addEventListener('change', () => {
        if (b.value === noneValue && b.checked) {
          boxes.forEach(o => {
            if (o !== b) { o.checked = false; o.closest('.checkbox-item')?.classList.remove('checked'); }
          });
        } else if (b.value !== noneValue && b.checked) {
          const none = boxes.find(o => o.value === noneValue);
          if (none) { none.checked = false; none.closest('.checkbox-item')?.classList.remove('checked'); }
        }
      });
    });
  },

  download(filename, content, type = 'application/json') {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  /* 简易 SVG 折线图 */
  lineChart(series, opts = {}) {
    const w = opts.width || 640, h = opts.height || 240;
    const pad = { l: 46, r: 18, t: 18, b: 34 };
    const pts = series.filter(p => p.value !== null && p.value !== undefined && !isNaN(p.value));
    if (pts.length === 0) return '<div class="text-center" style="padding:40px;color:var(--text-muted);">暂无数据</div>';
    const vals = pts.map(p => p.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    const range = max - min;
    min -= range * 0.12; max += range * 0.12;
    const X = i => pad.l + (pts.length === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (pts.length - 1));
    const Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ');
    const area = line + ` L${X(pts.length - 1).toFixed(1)},${h - pad.b} L${X(0).toFixed(1)},${h - pad.b} Z`;
    let grid = '';
    for (let g = 0; g <= 4; g++) {
      const gv = min + (max - min) * g / 4, gy = Y(gv);
      grid += `<line x1="${pad.l}" y1="${gy.toFixed(1)}" x2="${w - pad.r}" y2="${gy.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
               <text x="${pad.l - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--text-muted)">${gv.toFixed(1)}</text>`;
    }
    const dots = pts.map((p, i) =>
      `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="4.5" fill="var(--card-bg)" stroke="${opts.color || 'var(--primary)'}" stroke-width="2.5"/>
       <text x="${X(i).toFixed(1)}" y="${(Y(p.value) - 12).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-primary)">${p.value}</text>`).join('');
    const labels = pts.map((p, i) =>
      `<text x="${X(i).toFixed(1)}" y="${h - 12}" text-anchor="middle" font-size="11" fill="var(--text-muted)">${U.esc(p.label)}</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;">
      <defs><linearGradient id="lg-${opts.id || 'a'}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${opts.color || '#f26522'}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${opts.color || '#f26522'}" stop-opacity="0"/>
      </linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#lg-${opts.id || 'a'})"/>
      <path d="${line}" fill="none" stroke="${opts.color || 'var(--primary)'}" stroke-width="2.8" stroke-linejoin="round"/>
      ${dots}${labels}</svg>`;
  },

  /* 环形得分图 */
  scoreRing(score, label, color) {
    const r = 52, c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
    return `<div class="score-ring">
      <svg viewBox="0 0 130 130">
        <circle class="score-ring-bg" cx="65" cy="65" r="${r}"/>
        <circle class="score-ring-fill" cx="65" cy="65" r="${r}"
          style="stroke:${color};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${off.toFixed(1)};"/>
      </svg>
      <div class="score-text">
        <div class="score-value" style="color:${color}">${Math.round(score)}</div>
        <div class="score-label">${U.esc(label)}</div>
      </div></div>`;
  },

  /* 横向条形对比图 */
  barCompare(items, opts = {}) {
    const max = Math.max(...items.map(i => Math.abs(i.value) || 0), 1);
    return `<div style="display:flex;flex-direction:column;gap:12px;">` + items.map(i => `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px;">
          <span style="color:var(--text-secondary);">${U.esc(i.label)}</span>
          <strong style="color:${i.color || 'var(--primary)'}">${i.display !== undefined ? U.esc(i.display) : i.value}</strong>
        </div>
        <div style="height:10px;background:var(--bg-tertiary);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${(Math.abs(i.value) / max * 100).toFixed(1)}%;background:${i.color || 'var(--primary)'};border-radius:5px;transition:width .6s cubic-bezier(.16,1,.3,1);"></div>
        </div>
      </div>`).join('') + `</div>`;
  },

  /* 雷达图（生活方式多维度评分可视化） */
  radarChart(labels, values, opts = {}) {
    const size = opts.size || 260;
    const cx = size / 2, cy = size / 2, R = size / 2 - 38;
    const n = labels.length;
    if (n < 3) return '<div class="text-center" style="padding:30px;color:var(--text-muted)">维度不足，无法绘制雷达图</div>';
    const angle = i => -Math.PI / 2 + i * 2 * Math.PI / n;
    const pt = (i, r) => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
    const color = opts.color || 'var(--primary)';
    let grid = '';
    for (let g = 1; g <= 4; g++) {
      const rr = R * g / 4, poly = [];
      for (let i = 0; i < n; i++) { const [x, y] = pt(i, rr); poly.push(x.toFixed(1) + ',' + y.toFixed(1)); }
      grid += `<polygon points="${poly.join(' ')}" fill="none" stroke="var(--border-color)" stroke-width="1" opacity="0.7"/>`;
    }
    let axes = '';
    for (let i = 0; i < n; i++) { const [x, y] = pt(i, R); axes += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border-color)" stroke-width="1" opacity="0.55"/>`; }
    const vClamp = v => Math.max(0, Math.min(100, v || 0));
    const dataPts = labels.map((l, i) => { const [x, y] = pt(i, R * vClamp(values[i]) / 100); return x.toFixed(1) + ',' + y.toFixed(1); });
    const dataPoly = `<polygon points="${dataPts.join(' ')}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="2.5"/>`;
    const dots = labels.map((l, i) => { const [x, y] = pt(i, R * vClamp(values[i]) / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${color}"/>`; }).join('');
    const lbls = labels.map((l, i) => { const [x, y] = pt(i, R + 20); const anchor = Math.abs(x - cx) < 6 ? 'middle' : (x > cx ? 'start' : 'end'); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${anchor}" font-size="11.5" fill="var(--text-secondary)">${U.esc(l)}</text>`; }).join('');
    const vals = labels.map((l, i) => {
      const v = vClamp(values[i]);
      const [x, y] = pt(i, R * v / 100);
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const off = 14;
      const vx = x + dx / dist * off, vy = y + dy / dist * off;
      const anchor = Math.abs(vx - cx) < 6 ? 'middle' : (vx > cx ? 'start' : 'end');
      return `<text x="${vx.toFixed(1)}" y="${(vy + 3.5).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" font-weight="700" fill="${color}">${v}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${size} ${size}" style="width:100%;max-width:${size}px;height:auto;">${grid}${axes}${dataPoly}${dots}${vals}${lbls}</svg>`;
  }
};
window.U = U;

/* ==================== 主题控制 ==================== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}
function initTheme() {
  if (window.Skin && window.Skin.applySaved) { try { window.Skin.applySaved(); } catch (e) {} }
  else applyTheme(localStorage.getItem(THEME_KEY) || 'light');
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  U.toast(`已切换至${cur === 'dark' ? '亮色' : '暗色'}主题`, 'info', 1600);
}

/* ==================== 会话控制 ==================== */
let idleTimer = null;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  const mins = (AppState.config && AppState.config.sessionTimeout) || 60;
  idleTimer = setTimeout(() => {
    U.toast('会话超时，请重新登录', 'warning', 4000);
    doLogout();
  }, mins * 60 * 1000);
}
['click', 'keydown', 'mousemove', 'scroll'].forEach(evt =>
  document.addEventListener(evt, () => { if (AppState.currentUser) resetIdleTimer(); }, { passive: true }));

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    username: user.username, role: user.role, displayName: user.displayName, ts: Date.now()
  }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function doLogout() {
  localStorage.removeItem(SESSION_KEY);
  AppState.currentUser = null;
  AppState.currentPatientId = null;
  clearPatientContext();
  clearTimeout(idleTimer);
  renderLogin();
}
function clearPatientContext() {
  AppState.patient = {};
  AppState.assessment = {};
  AppState.lifeSurvey = {};
  AppState.plan = {};
  AppState.isokineticData = [];
  AppState.isotonicData = [];
  AppState.trainingPlanHistory = [];
}
window.clearPatientContext = clearPatientContext;

/* ==================== 账号到期 / 自动冻结 ==================== */
function isUserExpired(u) {
  return !!(u && u.expireAt && Date.now() > Date.parse(u.expireAt));
}
/* 批量冻结已过期的医生账号（管理员页加载 / 启动时调用，确保台账状态实时准确） */
async function enforceAllExpiry() {
  try {
    const users = await DB.getUsers();
    const now = Date.now();
    for (const u of users) {
      if (isAdminRole(u)) continue;                 // 管理员 / 超级管理员不受使用期限约束
      if (u.status === 'active' && u.expireAt && now > Date.parse(u.expireAt)) {
        await DB.updateUser(u.id, { status: 'frozen', frozenReason: 'expired' });
      }
    }
  } catch (e) { /* 静默失败，避免阻塞启动 */ }
}
window.isUserExpired = isUserExpired;
/* 账号即将到期时，在界面顶部展示提示横幅（仅当未过期且剩余 ≤7 天）；可关闭，跨路由持久 */
function showExpiryBannerIfNeeded(user) {
  const old = U.qs('#expiry-banner'); if (old) old.remove();
  if (!user || user.status === 'frozen' || !user.expireAt) return;
  const exp = Date.parse(user.expireAt);
  if (isNaN(exp)) return;
  const days = Math.ceil((exp - Date.now()) / 86400000);
  if (days < 0 || days > 7) return;            // 已过期由登录拦截；>7 天不提示
  const msg = days === 0
    ? '账号将于今天到期，请尽快联系管理员续期'
    : '账号将于 ' + days + ' 天后到期，请提前联系管理员续期';
  const bar = document.createElement('div');
  bar.id = 'expiry-banner';
  bar.className = 'no-print expiry-banner';
  bar.innerHTML = '<span class="expiry-ico">⏰</span><span class="expiry-msg">' + U.esc(msg) + '</span><button type="button" class="expiry-close" aria-label="关闭">×</button>';
  bar.querySelector('.expiry-close').onclick = () => bar.remove();
  const host = U.qs('.main-area') || document.body;
  host.insertBefore(bar, host.firstChild);
}
window.showExpiryBannerIfNeeded = showExpiryBannerIfNeeded;
window.enforceAllExpiry = enforceAllExpiry;

/* ==================== 登录 / 注册 ==================== */
function renderLogin() {
  const app = U.qs('#app');
  app.innerHTML = '';
  const node = document.importNode(U.qs('#tpl-login').content, true);
  app.appendChild(node);

  // 让登录页背景也跟随皮肤引擎（仅注入令牌，不挂载换肤器浮层）
  if (window.Skin && window.Skin.applySaved) {
    try { window.Skin.applySaved(); } catch (e) { console.warn('登录页皮肤应用失败', e); }
  }

  const loginForm = U.qs('#login-form'), registerForm = U.qs('#register-form');
  function switchLoginTab(isLogin) {
    U.qsa('.login-tab-v2').forEach(t => t.classList.toggle('active', t.dataset.tab === (isLogin ? 'login' : 'register')));
    loginForm.classList.toggle('hidden', !isLogin);
    registerForm.classList.toggle('hidden', isLogin);
  }
  U.qsa('.login-tab-v2').forEach(tab => {
    tab.onclick = () => switchLoginTab(tab.dataset.tab === 'login');
  });
  const switchRegister = U.qs('.js-switch-register');
  const switchLogin = U.qs('.js-switch-login');
  if (switchRegister) switchRegister.onclick = () => switchLoginTab(false);
  if (switchLogin) switchLogin.onclick = () => switchLoginTab(true);

  loginForm.onsubmit = async e => {
    e.preventDefault();
    const { username, password } = U.formData(loginForm);
    if (!username || !password) return U.toast('用户名和密码不可为空', 'warning');
    try {
      const user = await DB.findUserByUsername(username.trim());
      if (!user) return U.toast('用户名不存在，请检查后重试', 'error');
      if (user.password !== password) return U.toast('密码错误，请重新输入', 'error');
      if (isUserExpired(user)) {
        await DB.updateUser(user.id, { status: 'frozen', frozenReason: 'expired' });
        return U.toast('该账号已到期，请联系管理员续期', 'error');
      }
      if (user.status === 'frozen') {
        if (user.frozenReason === 'expired') return U.toast('该账号已到期，请联系管理员续期', 'error');
        return U.toast('该账号已被冻结，请联系管理员', 'error');
      }
      await DB.updateLastLogin(user.username);
      AppState.currentUser = user;
      saveSession(user);
      await bootApp();
      showExpiryBannerIfNeeded(user);
      U.toast(`欢迎回来，${user.displayName}`, 'success');
    } catch (err) {
      console.error('登录处理失败:', err);
      U.toast('登录失败：' + (err && err.message ? err.message : '未知错误'), 'error', 5000);
    }
  };

  registerForm.onsubmit = async e => {
    e.preventDefault();
    const d = U.formData(registerForm);
    if (!/^[a-zA-Z0-9_]{3,}$/.test(d.username)) return U.toast('用户名需为字母数字且至少 3 位', 'warning');
    if (d.password.length < 6) return U.toast('密码长度至少 6 位', 'warning');
    if (d.password !== d.passwordConfirm) return U.toast('两次输入的密码不一致', 'warning');
    try {
      const user = await DB.createUser({
        username: d.username.trim(), password: d.password,
        displayName: d.displayName.trim(), phone: d.phone
      });
      AppState.currentUser = user;
      saveSession(user);
      await bootApp();
      showExpiryBannerIfNeeded(user);
      U.toast('注册成功，已自动登录', 'success');
      location.hash = '#/patient';
    } catch (err) {
      U.toast(err.message || '注册失败', 'error');
    }
  };

  initLoginV3();
  bindLoginMascot();
}

/* ==================== 登录页 V3：3D logo + 粒子背景 + 滚动/点击浮现登录卡片 ==================== */
function initLoginV3() {
  const page = U.qs('.login-page-v3');
  const stage = U.qs('.login-v3-stage');
  const card = U.qs('.login-v3-card');
  const closeBtn = U.qs('.login-v3-card-close');
  const canvas = U.qs('.login-v3-particles');
  if (!page || !canvas) return;

  let W, H;
  const fxCanvas = U.qs('.login-v3-fx');
  const fctx = fxCanvas ? fxCanvas.getContext('2d') : null;
  let isDark = true;
  let revealed = false;
  let rafId = null;
  let wheelLock = false;
  let convRaf = null;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    if (fxCanvas) { fxCanvas.width = W; fxCanvas.height = H; }
  }
  window.addEventListener('resize', resize);
  resize();

  /* ===== 星河深空背景引擎 ===== */
  const bg = createLoginGalaxy();
  function updateTheme() {
    const theme = document.documentElement.getAttribute('data-theme');
    isDark = theme !== 'light';
  }
  function frameBg() {
    bg.step();
    bg.draw(canvas.getContext('2d'), W, H, isDark);
    rafId = requestAnimationFrame(frameBg);
  }
  updateTheme();
  bg.init();
  frameBg();

  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(updateTheme).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-theme']
    });
  }

  function revealLogin() {
    if (revealed) return;
    revealed = true;
    page.classList.add('login-visible');
    /* 先做一次基础远→近汇聚，给用户"看到效果"的感觉 */
    startConverge();
    /* 同时启用持续性的远→近汇聚循环，每 4.2s 一次，让用户随时能看到粒子动画 */
    const timer = setInterval(function () {
      if (!revealed) { clearInterval(timer); return; }
      startConverge();
    }, 4200);
    window.__loginConvergeLoopTimer = timer;
  }

  // 进入页面 0.8s 后自动触发汇聚动效（让初次访问者也能看到 3D 粒子汇聚效果）
  setTimeout(() => { if (!revealed) revealLogin(); }, 800);

  // 进一步：登录卡片显示完成后 1.6s 再触发第二轮「远→近」粒子回卷
  let convSecond = false;
  setTimeout(() => { convSecond = true; }, 3200);

  function hideLogin() {
    if (!revealed) return;
    revealed = false;
    page.classList.remove('login-visible');
    stopConverge();
  }

  /* ===== 星河深空背景引擎 ===== */
  function createLoginGalaxy() {
    let stars = [], neb = [], river = [];
    function rand(a, b) { return a + Math.random() * (b - a); }
    const P0x = -0.08, P0y = 0.18, P1x = 1.10, P1y = 0.82;
    function center(u, W, H) { return { x: (P0x + (P1x - P0x) * u) * W, y: (P0y + (P1y - P0y) * u) * H + Math.sin(u * Math.PI) * 0.10 * H }; }
    function newRiver(init) {
      const layer = Math.random() < 0.46 ? 0 : (Math.random() < 0.62 ? 1 : 2);
      const spd = [0.10, 0.060, 0.034][layer];
      const warm = Math.random() < 0.06;
      return { u: init ? Math.random() : -0.04, v: (Math.random() + Math.random() + Math.random() - 1.5) * 1.1, layer, sz: [2.4, 1.5, 1.0][layer] * rand(0.6, 1.5), sp: spd * rand(0.7, 1.35), b: rand(0.55, 1), warm, hue: warm ? rand(30, 42) : rand(198, 238), tw: rand(0, 6.28) };
    }
    function init() {
      stars = [];
      const layers = [{ n: 150, size: 1.4, b: 0.9 }, { n: 110, size: 0.9, b: 0.6 }, { n: 80, size: 0.6, b: 0.4 }];
      for (const L of layers) for (let i = 0; i < L.n; i++) stars.push({ x: rand(0, 1), y: rand(0, 1), size: L.size * rand(0.6, 1.3), base: L.b * rand(0.4, 1), tw: rand(0, 6.28), ts: rand(0.4, 1.3) });
      neb = [
        { x: rand(0.12, 0.45), y: rand(0.30, 0.60), r: rand(0.4, 0.7), hue: rand(205, 245), ph: rand(0, 6) },
        { x: rand(0.55, 0.88), y: rand(0.30, 0.62), r: rand(0.35, 0.6), hue: rand(262, 300), ph: rand(0, 6) }
      ];
      // 背景粒子流密度提高（460→620），为汇聚动效提供更多不重复的起点采样
      river = []; const R = 620; for (let i = 0; i < R; i++) river.push(newRiver(true));
    }
    let t = 0;
    return {
      init,
      step() {
        t += 0.016;
        for (const s of stars) s.tw += 0.02 * s.ts;
        for (const p of river) { p.u += p.sp * 0.01; p.tw += 0.05; if (p.u > 1.06) { river.push(newRiver(false)); river.splice(river.indexOf(p), 1); } }
      },
      draw(ctx, W, H, dark) {
        if (dark) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#0a1024';
          ctx.fillRect(0, 0, W, H);
          const rg = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, Math.max(W, H) * 0.5);
          rg.addColorStop(0, 'rgba(64,94,168,0.30)');
          rg.addColorStop(0.5, 'rgba(34,52,104,0.12)');
          rg.addColorStop(1, 'transparent');
          ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        } else {
          // 亮色模式：保留干净的纯白底，让深色粒子在白底上自然流动（不再画大圆圈）
          ctx.globalCompositeOperation = 'source-over';
          ctx.clearRect(0, 0, W, H);
        }
        const dirx = P1x - P0x, diry = P1y - P0y, dl = Math.hypot(dirx, diry), dx = dirx / dl, dy = diry / dl, nx = -dy, ny = dx;
        const bandHalf = Math.min(W, H) * 0.135, breath = 0.7 + 0.3 * Math.sin(t * 0.5), mul = dark ? 1.18 : 1;
        ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
        for (const n of neb) { const nx2 = W * n.x, ny2 = H * n.y, rr = n.r * Math.min(W, H) * 0.7, b = 0.5 + 0.5 * Math.sin(n.ph + t * 0.3); const a = (dark ? 0.12 : 0.18) + (dark ? 0.08 : 0.10) * b; const g = ctx.createRadialGradient(nx2, ny2, 0, nx2, ny2, rr); g.addColorStop(0, 'hsla(' + n.hue.toFixed(0) + ',80%,' + (dark ? 62 : 50) + '%,' + a.toFixed(3) + ')'); g.addColorStop(0.5, 'hsla(' + n.hue.toFixed(0) + ',80%,' + (dark ? 62 : 50) + '%,' + (a * 0.4).toFixed(3) + ')'); g.addColorStop(1, 'hsla(' + n.hue.toFixed(0) + ',80%,' + (dark ? 62 : 50) + '%,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(nx2, ny2, rr, 0, 7); ctx.fill(); }
        for (const p of river) {
          const c = center(Math.max(0, Math.min(1, p.u)), W, H), off = p.v * bandHalf, sx = c.x + nx * off, sy = c.y + ny * off, edge = Math.exp(-p.v * p.v * 0.7), tw = 0.5 + 0.5 * Math.sin(p.tw);
          if (dark) {
            const tail = (p.sp * 0.5 + p.sz * 0.5) * bandHalf * 0.55, tx = sx - dx * tail, ty = sy - dy * tail, a = p.b * edge * (0.45 + 0.55 * tw) * mul, col = p.warm ? ('hsla(' + p.hue.toFixed(0) + ',90%,72%,') : ('hsla(' + p.hue.toFixed(0) + ',95%,80%,');
            const grad = ctx.createLinearGradient(tx, ty, sx, sy); grad.addColorStop(0, col + '0)'); grad.addColorStop(1, col + (a * 0.9).toFixed(3) + ')'); ctx.strokeStyle = grad; ctx.lineWidth = Math.max(0.6, p.sz * 0.9); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.5, p.sz), 0, 7); ctx.fillStyle = col + a.toFixed(3) + ')'; ctx.fill();
          } else {
            // 亮色模式：更饱和的深色（深蓝/深紫）+ 提亮 alpha，让白底上一眼可见；保留尾迹营造流动感
            const tail = (p.sp * 0.5 + p.sz * 0.5) * bandHalf * 0.55, tx = sx - dx * tail, ty = sy - dy * tail, a = Math.min(1, p.b * edge * (0.78 + 0.55 * tw)), col = p.warm ? ('hsla(' + p.hue.toFixed(0) + ',90%,38%,') : ('hsla(' + p.hue.toFixed(0) + ',85%,40%,');
            const grad = ctx.createLinearGradient(tx, ty, sx, sy); grad.addColorStop(0, col + '0)'); grad.addColorStop(1, col + a.toFixed(3) + ')'); ctx.strokeStyle = grad; ctx.lineWidth = Math.max(0.9, p.sz * 1.2); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.0, p.sz * 1.1), 0, 7); ctx.fillStyle = col + a.toFixed(3) + ')'; ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        for (const s of stars) { const a = s.base * (0.3 + 0.7 * Math.abs(Math.sin(s.tw))) * breath * mul; ctx.beginPath(); ctx.arc(s.x * W, s.y * H, Math.max(0.3, s.size), 0, 7); ctx.fillStyle = dark ? ('rgba(220,238,255,' + Math.min(1, a).toFixed(3) + ')') : ('rgba(40,80,160,' + Math.min(1, a * 1.4).toFixed(3) + ')'); ctx.fill(); }
      },
      sample(n, W, H) {
        const dirx = P1x - P0x, diry = P1y - P0y, dl = Math.hypot(dirx, diry), dx = dirx / dl, dy = diry / dl, nx = -dy, ny = dx;
        const bandHalf = Math.min(W, H) * 0.135;
        const out = []; const stepn = river.length / Math.max(1, n);
        for (let i = 0; i < n; i++) { const p = river[Math.floor(i * stepn) % river.length]; if (!p) continue; const c = center(Math.max(0, Math.min(1, p.u)), W, H); const off = p.v * bandHalf; out.push({ x: c.x + nx * off, y: c.y + ny * off, hue: p.hue }); }
        return out;
      }
    };
  }

  const loginGalaxyF = 720;
  const loginGalaxyGlowCache = {};
  function loginGalaxyGlow(hue) { const h = ((Math.round(hue / 10) * 10) % 360 + 360) % 360; if (loginGalaxyGlowCache[h]) return loginGalaxyGlowCache[h]; const s = 32, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d'); const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); grad.addColorStop(0, 'hsla(' + h + ',95%,84%,1)'); grad.addColorStop(0.35, 'hsla(' + h + ',92%,68%,0.5)'); grad.addColorStop(1, 'hsla(' + h + ',92%,62%,0)'); g.fillStyle = grad; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill(); loginGalaxyGlowCache[h] = c; return c; }
  function loginGalaxyClamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function loginGalaxyEaseInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function loginGalaxyBuildTargets(cx, cy, w, h, nOutline, nInner) {
    const pts = []; const x0 = cx - w / 2 + 8, x1 = cx + w / 2 - 8, y0 = cy - h / 2 + 8, y1 = cy + h / 2 - 8;
    const seg = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
    let total = 0; seg.forEach(s => total += Math.hypot(s[2] - s[0], s[3] - s[1])); const step = total / nOutline;
    seg.forEach(s => { const len = Math.hypot(s[2] - s[0], s[3] - s[1]); const c = Math.max(1, Math.floor(len / step)); for (let i = 0; i < c; i++) { const t = i / c; pts.push({ x: s[0] + (s[2] - s[0]) * t, y: s[1] + (s[3] - s[1]) * t }); } });
    while (pts.length < nOutline) pts.push(pts[pts.length % pts.length]); pts.length = nOutline;
    for (let r = 1; r <= 2; r++) { const yy = y0 + (y1 - y0) * (r / 3); for (let k = 0; k < nInner; k++) pts.push({ x: x0 + (x1 - x0) * (k + 0.5) / nInner, y: yy }); }
    return pts;
  }
  function startConverge() {
    if (!fctx || !card) return;
    const r = card.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, cw = r.width, ch = r.height;
    // 粒子密度大幅提高（轮廓 320→860、内部行 18→46），配合更小的单粒尺寸，
    // 形成"细密粒子云汇聚成窗口"的观感
    const targets = loginGalaxyBuildTargets(cx, cy, cw, ch, 860, 46);
    const samples = bg.sample(targets.length, W, H);
    // 起点更"远"（Z 深度 700-3000px），远→近层次更厚；起点取自背景粒子流采样
    const parts = targets.map((t, i) => { const s = samples[i] || { x: cx + (Math.random() - 0.5) * W * 0.9, y: cy + (Math.random() - 0.5) * H * 0.9, hue: 208 + Math.random() * 40 }; return { sx: s.x, sy: s.y, sz: 700 + Math.random() * 2300, tx: t.x, ty: t.y, hue: s.hue, px: null, py: null }; });
    let p = 0, last = performance.now(), done = false; card.style.opacity = 0;
    function frame(now) {
      const dt = Math.min(40, now - last); last = now;
      // 速度适中不快：总时长 1650ms → 2600ms
      p += dt / 2600; if (p >= 1) { p = 1; done = true; }
      const fl = loginGalaxyEaseInOut(p), swirl = (1 - fl) * 0.55, ca = Math.cos(swirl), sa = Math.sin(swirl);
      fctx.clearRect(0, 0, W, H); fctx.globalCompositeOperation = 'lighter';
      const fade = p > 0.62 ? Math.max(0, 1 - (p - 0.62) / 0.38) : 1;
      for (const q of parts) {
        // 「远→近」视觉强化：起点收缩到外圈，引力加速
        const easeFar = loginGalaxyEaseInOut(Math.max(0, Math.min(1, fl * 1.2)));
        const ix = q.sx + (q.tx - q.sx) * easeFar, iy = q.sy + (q.ty - q.sy) * easeFar, iz = q.sz * (1 - fl);
        const dx = ix - cx, dy = iy - cy, dz = iz, rx = dx * ca - dz * sa, rz = dx * sa + dz * ca, scale = loginGalaxyF / (loginGalaxyF + rz);
        // 粒子尺寸调小：基准 0.8→0.34、缩放系数 1.6→0.72，绘制半径 3.0→1.75 倍
        const X = cx + rx * scale, Y = cy + dy * scale, sz = 0.34 + 0.72 * scale;
        const a = 1.0 * (0.4 + 0.6 * loginGalaxyClamp((scale - 0.20) / (1.8 - 0.20), 0, 1)) * fade;
        if (q.px !== null && fade > 0.05) { fctx.globalAlpha = a * 0.40; fctx.strokeStyle = 'hsla(' + q.hue + ',92%,75%,1)'; fctx.lineWidth = 0.6; fctx.beginPath(); fctx.moveTo(q.px, q.py); fctx.lineTo(X, Y); fctx.stroke(); }
        fctx.globalAlpha = a; fctx.drawImage(loginGalaxyGlow(q.hue), X - sz * 1.75, Y - sz * 1.75, sz * 3.5, sz * 3.5);
        q.px = X; q.py = Y;
      }
      if (p > 0.52 && p < 0.82) { const fa = Math.max(0, 1 - Math.abs(p - 0.67) / 0.15); fctx.globalAlpha = fa * 0.85; const rg = fctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.85); rg.addColorStop(0, 'rgba(180,210,255,1)'); rg.addColorStop(1, 'rgba(180,210,255,0)'); fctx.fillStyle = rg; fctx.beginPath(); fctx.arc(cx, cy, cw * 0.85, 0, 7); fctx.fill(); }
      fctx.globalAlpha = 1; fctx.globalCompositeOperation = 'source-over';
      card.style.opacity = loginGalaxyClamp((p - 0.55) / 0.45, 0, 1);
      if (done) { convRaf = null; return; }
      convRaf = requestAnimationFrame(frame);
    }
    convRaf = requestAnimationFrame(frame);
  }
  function stopConverge() { if (convRaf) cancelAnimationFrame(convRaf); convRaf = null; if (fctx) fctx.clearRect(0, 0, W, H); card.style.opacity = ''; }

  function onWheel(e) {
    if (wheelLock) return;
    if (e.deltaY > 8) {
      revealLogin();
    } else if (e.deltaY < -12 && revealed) {
      hideLogin();
    }
    wheelLock = true;
    setTimeout(() => wheelLock = false, 120);
  }

  function onClick(e) {
    if (!e) return;
    if (e.target.closest('.login-v3-card') ||
        e.target.closest('.login-v3-mascot') ||
        e.target.closest('.qoo-bubble-v2')) return;
    if (!revealed) revealLogin();
    else hideLogin();
  }

  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('click', onClick);

  let touchStartY = 0;
  window.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', e => {
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (dy > 40) revealLogin();
    else if (dy < -50 && revealed) hideLogin();
  }, { passive: true });

  if (closeBtn) closeBtn.addEventListener('click', e => { e.stopPropagation(); hideLogin(); });

  // 进入页面 2.2s 后轻微提示可下滑（不改变状态）
  setTimeout(() => {
    if (!revealed && page && page.classList) page.classList.add('hint-shown');
  }, 2200);

  // 清理：页面卸载时停止动画
  window.addEventListener('beforeunload', () => {
    if (rafId) cancelAnimationFrame(rafId);
    if (convRaf) cancelAnimationFrame(convRaf);
  });
}

/* 登录页小Qoo：桌面宠物式健康提示 */
function bindLoginMascot() {
  const mascot = U.qs('.login-v3-mascot') || U.qs('.login-v3-mascot-img') || U.qs('.login-mascot-v2') || U.qs('.login-mascot');
  const bubble = U.qs('.qoo-bubble-v2') || U.qs('.qoo-bubble');
  const bubbleText = U.qs('.qoo-bubble-text');
  const closeBtn = U.qs('.qoo-bubble-close');
  if (!mascot || !bubble || !bubbleText) return;

  const tips = [
    '每日喝够 1500-2000ml 水，身体代谢会更顺畅哦～',
    '减重不一定要挨饿，每餐先吃蔬菜再吃肉，最后吃主食更容易稳住血糖！',
    '老年人每周做 2 次抗阻训练，能有效预防肌少症，小Qoo 陪你一起坚持！',
    '每晚 7-8 小时优质睡眠，是体重管理最容易被忽视的帮手。',
    '用小本本记录三餐和体重，会让健康目标更容易实现～',
    '每天快走 6000 步以上，心肺和心情都会变更好！',
    '优质蛋白要多吃：鱼、蛋、奶、豆制品，肌肉才不容易流失。',
    '久坐 1 小时就起来活动 3 分钟，比一次性剧烈运动更重要。',
    '吃饭细嚼慢咽，每餐 20 分钟以上，更容易吃出七分饱。',
    '心情不好时容易多吃，试试深呼吸 5 次再决定是否加餐。',
    '腰围比体重更能反映健康风险，男性 < 90cm、女性 < 85cm 更佳。',
    '少喝含糖饮料，一杯奶茶的热量可能需要快走 1 小时才能消耗掉哦。'
  ];
  let hideTimer = null, welcomeTimer = null, userInteracted = false;

  function pick() {
    const last = Number(sessionStorage.getItem('qoo_last_tip') || -1);
    let idx = Math.floor(Math.random() * tips.length);
    if (tips.length > 1) {
      while (idx === last) idx = Math.floor(Math.random() * tips.length);
    }
    sessionStorage.setItem('qoo_last_tip', String(idx));
    return tips[idx];
  }

  function showTip(text) {
    if (!text) text = pick();
    bubbleText.textContent = text;
    bubble.classList.add('show');
    bubble.setAttribute('aria-hidden', 'false');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => hideTip(), 6500);
  }

  function hideTip() {
    bubble.classList.remove('show');
    bubble.setAttribute('aria-hidden', 'true');
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function onInteract() {
    userInteracted = true;
    clearTimeout(welcomeTimer);
    if (bubble.classList.contains('show')) hideTip();
    else showTip();
  }

  mascot.addEventListener('click', onInteract);
  mascot.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInteract(); }
  });
  closeBtn && closeBtn.addEventListener('click', e => { e.stopPropagation(); hideTip(); userInteracted = true; clearTimeout(welcomeTimer); });

  // 2.8s 后自动冒泡一句欢迎提示（若用户已交互则取消）
  welcomeTimer = setTimeout(() => {
    if (userInteracted) return;
    showTip('嗨，我是小Qoo！点击我，每天 get 一条健康小知识～');
  }, 2800);
}

/* ==================== 导航配置 ==================== */
// 工作流主线（侧边栏顶部「任务流程」快捷步进器）：登记 → 评估 → 方案 → 报告
const WORKFLOW = [
  { label: '登记', icon: '📝', hash: '#/patient' },
  { label: '评估', icon: '📊', hash: '#/assessment' },
  { label: '方案', icon: '🎯', hash: '#/plan' },
  { label: '报告', icon: '📄', hash: '#/report' }
];
// 当前路由所属工作流阶段（用于高亮步进器）
const WORKFLOW_HASHES = {
  '#/patient': 0,
  '#/assessment': 1, '#/lifestyle': 1, '#/isokinetic': 1, '#/isotonic': 1,
  '#/plan': 2,
  '#/report': 3, '#/bigdata': 3
};

// 肌少症专病独立工作流：筛查建档 → 标准化评估 → 制定方案 → 随访看板
const SARCO_WORKFLOW = [
  { label: '筛查建档', icon: '🔎', hash: '#/sarcopenia' },
  { label: '标准化评估', icon: '🩺', hash: '#/sarcopenia-assess' },
  /* 修复：原先指向 '#/plan'（体重管理单元路由），点击会跳出肌少症单元导致上下文丢失；
     现统一指向本单元的 '#/sarcopenia-plan'，与左侧模块导航保持同一 hash。 */
  { label: '制定方案', icon: '🎯', hash: '#/sarcopenia-plan' },
  { label: '随访看板', icon: '📈', hash: '#/sarcopenia-stats' }
];
const SARCO_WORKFLOW_HASHES = {
  '#/sarcopenia': 0,
  '#/sarcopenia-assess': 1,
  '#/sarcopenia-plan': 2,
  '#/sarcopenia-stats': 3
};
// 属于肌少症专病上下文的路由（命中即切换为专病工作流）
const SARCO_ROUTES = { '#/sarcopenia': 1, '#/sarcopenia-assess': 1, '#/sarcopenia-stats': 1, '#/sarcopenia-plan': 1 };

// 模块配置：顶部单元切换器 + 各单元专属左侧导航
// 每个模块保留原有菜单 hash 与角色守卫键（adminOnly/superOnly/doctorOnly）不变
const MODULES = {
  weight: {
    id: 'weight', name: '体重管理', icon: '⚖️',
    desc: '体重监测 · 综合评估 · 运动方案',
    defaultHash: '#/dashboard',
    nav: [
      { section: '体重管理工作台', items: [
        { hash: '#/dashboard', icon: '🏠', label: '体重管理台账' },
        { hash: '#/assessment', icon: '📊', label: '综合评估' },
        { hash: '#/muscle', icon: '💪', label: '鹊动肌力评估' },
        { hash: '#/plan', icon: '🎯', label: '智能方案' },
        { hash: '#/lifestyle', icon: '🌿', label: '生活方式问卷' }
      ] }
    ]
  },
  sarcopenia: {
    id: 'sarcopenia', name: '老年肌少症与跌倒风险管理', icon: '🧓',
    desc: '肌少症筛查 · 跌倒风险评估 · 预防方案',
    defaultHash: '#/sarcopenia',
    nav: [
      { section: '肌少症工作台', items: [
        { hash: '#/sarcopenia', icon: '🧓', label: '肌少症-跌倒风险台账' },
        { hash: '#/sarcopenia-assess', icon: '🩺', label: '综合评估' },
        { hash: '#/muscle', icon: '💪', label: '鹊动肌力评估' },
        { hash: '#/sarcopenia-plan', icon: '🎯', label: '智能方案' }
      ] }
    ]
  },
  spine: {
    id: 'spine', name: '青少年脊柱健康管理', icon: '🦴',
    desc: '首诊登记 · 功能评估 · 风险分层 · 干预方案',
    defaultHash: '#/spine',
    nav: [
      { section: '青少年脊柱健康工作台', items: [
        { hash: '#/spine', icon: '🦴', label: '脊柱健康管理台账' },
        { hash: '#/spine-assess', icon: '🩺', label: '综合评估' },
        { hash: '#/muscle', icon: '💪', label: '鹊动肌力评估' },
        { hash: '#/spine-plan', icon: '🎯', label: '智能方案' }
      ] }
    ]
  }
};
// 兼容旧引用：默认取体重管理单元导航
const NAV = MODULES.weight.nav;

// 模块专属路由 → 所属单元（共享路由不登记，保持当前工作上下文）
const MODULE_ROUTE_OWNER = {
  '#/dashboard':'weight','#/assessment':'weight','#/lifestyle':'weight',
  '#/sarcopenia':'sarcopenia','#/sarcopenia-assess':'sarcopenia','#/sarcopenia-stats':'sarcopenia','#/fall-risk-stats':'sarcopenia','#/sarcopenia-plan':'sarcopenia',
  '#/spine':'spine','#/spine-assess':'spine','#/spine-plan':'spine'
};
function routeModuleForHash(hash){ return MODULE_ROUTE_OWNER[hash] || null; }

// 独立全屏模块（无单元导航，从 Portal 进入）：这些路由隐藏左侧导航
const STANDALONE_ROUTES = {
  '#/bigdata': 1, '#/admin': 1, '#/accounts': 1, '#/ops': 1,
  '#/ops-correct': 1, '#/ops-switch': 1, '#/errlog': 1,
  '#/info-admin': 1, '#/msg-admin': 1, '#/info-groups': 1, '#/action-library': 1,
  '#/assets': 1  // 鹊动设备档案库：全屏独立页，不显示左侧导航
};

// 读取当前选中单元（持久化到 localStorage）
function currentModuleId() {
  const saved = (typeof localStorage !== 'undefined') && localStorage.getItem('qd_module');
  return (saved && MODULES[saved]) ? saved : 'weight';
}
function currentModuleNav() { return MODULES[currentModuleId()].nav; }

// 唯一改动点：切换当前模块（写存储 + 重渲染切换器 + 重渲染侧栏）
function setModule(id, opts) {
  opts = opts || {};
  if (!MODULES[id]) return;
  const changed = id !== currentModuleId();
  if (typeof localStorage !== 'undefined') localStorage.setItem('qd_module', id);
  AppState.module = id;
  if (changed) { renderSidebarNav(); renderModuleSwitch(); }
  if (opts.navigate) location.hash = MODULES[id].defaultHash;
}
window.setModule = setModule;

// 按当前模块渲染左侧导航（角色过滤 + 模块专属分组 + 当前路由高亮）
function renderSidebarNav() {
  const nav = U.qs('#sidebar-nav');
  if (!nav) return;
  const role = (AppState.currentUser && AppState.currentUser.role) || 'doctor';
  const curHash = location.hash;
  // 不再在侧边导航露出「🧩 模块选择」入口（登录后直接进 #/portal；侧栏只保留单元内功能）
  nav.innerHTML = currentModuleNav().map(sec => {
    const items = sec.items.filter(i => (!i.adminOnly || isAdminRole(role)) && (!i.superOnly || isSuperRole(role)) && (!i.doctorOnly || role === 'doctor'));
    if (!items.length) return '';
    return `<div class="nav-section"><span class="nav-section-title">${sec.section}</span></div>` + items.map(i =>
      `<a class="nav-item${i.hash === curHash ? ' active' : ''}" href="${i.hash}"><span class="nav-icon">${i.icon}</span><span class="nav-text"><span class="nav-label">${i.label}</span>${i.hint ? `<span class="nav-hint">${i.hint}</span>` : ''}</span></a>`).join('');
  }).join('');
}

// 切换器显示数据
function moduleRealmDisplay() {
  return Object.keys(MODULES).map(id => {
    const m = MODULES[id];
    const short = id === 'sarcopenia' ? '肌少症·跌倒' : id === 'spine' ? '脊柱健康' : '体重管理';
    return Object.assign({}, m, { id, short });
  });
}

// 11 款切换器样式 builder
function moduleSwitchHTML(style, cur) {
  const realms = moduleRealmDisplay();
  const tabAttr = (r) => `role="tab" data-module="${r.id}" aria-selected="${r.id===cur}" title="${r.name}" tabindex="${r.id===cur?'0':'-1'}"`;
  const soon = (r) => r.reserved ? '<span class="ms-soon">即将上线</span>' : '';
  switch (style) {
    case 'pill':
      return `<div class="ms-pill" role="tablist" aria-label="业务单元"><div class="ms-knob" aria-hidden="true"></div>` +
        realms.map(r => `<button class="ms-seg ${r.id===cur?'active':''}" ${tabAttr(r)}><span class="ms-ico">${r.icon}</span><span>${r.short}</span></button>`).join('') + `</div>`;
    case 'underline':
      return `<div class="ms-tabs" role="tablist" aria-label="业务单元">` +
        realms.map(r => `<button class="ms-tab ${r.id===cur?'active':''}" ${tabAttr(r)}><span class="ms-ico">${r.icon}</span><span>${r.name}</span></button>`).join('') +
        `<div class="ms-underline" aria-hidden="true"></div></div>`;
    case 'dock':
      return `<div class="ms-dock" role="tablist" aria-label="业务单元">` +
        realms.map(r => `<button class="ms-isle ${r.id===cur?'active':''} ${r.reserved?'reserved':''}" ${tabAttr(r)}><span class="ms-bubble">${r.icon}</span><span class="ms-ilabel">${r.short}</span>${soon(r)}</button>`).join('') + `</div>`;
    case 'ribbon':
      return `<div class="ms-ribbon" role="tablist" aria-label="业务单元"><div class="ms-rline" aria-hidden="true"></div><div class="ms-rnodes">` +
        realms.map(r => `<button class="ms-rnode ${r.id===cur?'active':''} ${r.reserved?'reserved':''}" ${tabAttr(r)}><span class="ms-rdot">${r.icon}</span><span class="ms-rlabel">${r.short}</span></button>`).join('') +
        `</div></div>`;
    case 'slider':
      return `<div class="ms-rail" role="tablist" aria-label="业务单元"><div class="ms-track" aria-hidden="true"></div><div class="ms-block" aria-hidden="true">${MODULES[cur].icon} ${MODULES[cur].short||cur}</div><div class="ms-rlabels">` +
        realms.map(r => `<button class="ms-rlabel ${r.id===cur?'active':''}" ${tabAttr(r)}>${r.short}</button>`).join('') + `</div></div>`;
    case 'cube': {
      const i = realms.findIndex(r => r.id === cur);
      const rot = i === 0 ? 'rotateY(0deg)' : i === 1 ? 'rotateY(-90deg)' : 'rotateY(90deg)';
      const faces = [{r:realms[0],f:'ms-f-front',a:i===0},{r:realms[1],f:'ms-f-right',a:i===1},{r:realms[2],f:'ms-f-left',a:i===2}];
      return `<div class="ms-cube-wrap" role="tablist" aria-label="业务单元"><div class="ms-cube-tilt"><div class="ms-cube" style="transform:${rot}">` +
        faces.map(f => `<div class="ms-face ${f.f} ${f.a?'is-active':''}" ${tabAttr(f.r)}><span class="ms-cico">${f.r.icon}</span><span class="ms-cnm">${f.r.short}</span></div>`).join('') +
        `</div></div><div class="ms-cube-dots">${realms.map((r,idx)=>`<button class="ms-cdot ${idx===i?'on':''}" ${tabAttr(r)}>${r.icon}</button>`).join('')}</div></div>`;
    }
    case 'flip':
      return `<div class="ms-flips" role="tablist" aria-label="业务单元">` +
        realms.map(r => `<button class="ms-flip ${r.id===cur?'on':''}" ${tabAttr(r)}><div class="ms-flip-inner"><div class="ms-flip-face ms-flip-front"><span class="ms-ico">${r.icon}</span><span class="ms-fnm">${r.short}</span></div><div class="ms-flip-face ms-flip-back"><span class="ms-ico">${r.icon}</span><span class="ms-fnm">${r.short}</span></div></div></button>`).join('') + `</div>`;
    case 'glass': {
      const i = realms.findIndex(r => r.id === cur);
      return `<div class="ms-glass-scene"><div class="ms-glass-row" role="tablist" aria-label="业务单元">` +
        realms.map((r,idx)=>`<button class="ms-slab ${r.id===cur?'active':''} ${idx<i?'is-left':'is-right'}" ${tabAttr(r)}><span class="ms-ico">${r.icon}</span><span class="ms-gnm">${r.short}</span></button>`).join('') + `</div></div>`;
    }
    case 'steps':
      return `<div class="ms-steps" role="tablist" aria-label="业务单元">` +
        realms.map(r => `<button class="ms-step ${r.id===cur?'active':''}" ${tabAttr(r)}><div class="ms-step-top"><span class="ms-ico">${r.icon}</span><span class="ms-stnm">${r.short}</span></div><div class="ms-step-shadow"></div></button>`).join('') + `</div>`;
    case 'coverflow': {
      const i = realms.findIndex(r => r.id === cur);
      return `<div class="ms-cov" role="tablist" aria-label="业务单元">` +
        realms.map((r,idx)=>{ const cls = idx===i?'active':(idx<i?'is-left':'is-right');
          return `<button class="ms-cov-card ${cls}" ${tabAttr(r)}><span class="ms-ico">${r.icon}</span><span class="ms-cvnm">${r.short}</span></button>`; }).join('') + `</div>`;
    }
    case 'card':
    default:
      return `<div class="ms-cards" role="tablist" aria-label="业务单元">` +
        realms.map(r => `<button class="ms-card ${r.id===cur?'active':''} ${r.reserved?'reserved':''}" ${tabAttr(r)}><span class="ms-card-ico">${r.icon}</span><span class="ms-card-name">${r.name}</span><span class="ms-card-desc">${r.desc||''}</span>${soon(r)}</button>`).join('') + `</div>`;
  }
}

// 渲染顶部单元切换器（按 Skin.state.switcherStyle 分派）
function renderModuleSwitch() {
  const bar = U.qs('#module-switch');
  if (!bar) return;
  const cur = currentModuleId();
  const style = (window.Skin && Skin.state && Skin.state.switcherStyle) || 'card';
  bar.innerHTML = moduleSwitchHTML(style, cur);
  bar.setAttribute('data-ms-style', style);
  // 滑动指示器定位
  positionSwitcherIndicator(style);
  // 绑定点击 + 键盘：共享路由（肌力评估/报告中心/设备/资讯/设置等）点击只换左栏，不跳转
  const isSharedRoute = !routeModuleForHash(location.hash || '#/dashboard');
  bar.querySelectorAll('[data-module]').forEach(el => {
    el.onclick = () => setModule(el.getAttribute('data-module'), { navigate: !isSharedRoute });
    el.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModule(el.getAttribute('data-module'), { navigate: !isSharedRoute }); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const ids = Object.keys(MODULES);
        const idx = ids.indexOf(currentModuleId());
        const next = e.key === 'ArrowRight' ? ids[(idx+1)%ids.length] : ids[(idx+ids.length-1)%ids.length];
        setModule(next, { navigate: !isSharedRoute });
      }
    };
  });
}
window.__rerenderModuleSwitch = function () { renderModuleSwitch(); };

// 滑动指示器定位（pill/underline/slider/cube）
function positionSwitcherIndicator(style) {
  const bar = U.qs('#module-switch');
  if (!bar) return;
  const ids = Object.keys(MODULES);
  const idx = ids.indexOf(currentModuleId());
  if (style === 'pill') {
    const knob = bar.querySelector('.ms-knob');
    if (knob) knob.style.transform = `translateX(${idx*100}%)`;
  } else if (style === 'underline') {
    const tab = bar.querySelectorAll('.ms-tab')[idx];
    const ul = bar.querySelector('.ms-underline');
    if (tab && ul) { ul.style.left = tab.offsetLeft + 'px'; ul.style.width = tab.offsetWidth + 'px'; }
  } else if (style === 'slider') {
    const block = bar.querySelector('.ms-block');
    if (block) block.style.transform = `translateX(${idx*100}%)`;
  }
}


// 当前工作流：在肌少症专病路由上切换为专病独立工作流，否则为通用流程
function currentWorkflow() {
  if (SARCO_ROUTES[location.hash]) {
    return { steps: SARCO_WORKFLOW, hashes: SARCO_WORKFLOW_HASHES, title: '肌少症专病流程', sarc: true };
  }
  return { steps: WORKFLOW, hashes: WORKFLOW_HASHES, title: '任务流程', sarc: false };
}
// 渲染顶部工作流步进器（通用：登记→评估→方案→报告；专病：筛查建档→标准化评估→制定方案→随访看板）
function renderWorkflow() {
  const w = currentWorkflow();
  const cur = w.hashes[location.hash] != null ? w.hashes[location.hash] : -1;
  let chips = '';
  w.steps.forEach(function (s, i) {
    const cls = 'wf-chip' + (i === cur ? ' active' : '') + (cur >= 0 && i < cur ? ' done' : '');
    if (i > 0) chips += '<span class="wf-arr">›</span>';
    chips += '<a class="' + cls + '" href="' + s.hash + '" title="' + (s.desc || '') + '"><span class="wf-no">' + (i + 1) +
      '</span><span class="wf-ico">' + s.icon + '</span><span class="wf-label">' + s.label + '</span></a>';
  });
  return '<div class="wf-head"><span class="wf-title">' + w.title + '</span></div><div class="wf-chips">' + chips + '</div>';
}
// 路由切换时同步步进器（按上下文重渲染，支持通用/专病工作流切换）
function markWorkflowActive() {
  const wf = U.qs('#nav-workflow');
  if (!wf) return;
  const w = currentWorkflow();
  wf.className = 'nav-workflow' + (w.sarc ? ' wf-sarc' : '');
  wf.innerHTML = renderWorkflow();
}

/* ==================== 应用启动 ==================== */
async function bootApp() {
  AppState.config = await DB.getSystemConfig();
  // 账号到期自动冻结：启动时批量冻结已过期的医生账号
  try { await enforceAllExpiry(); } catch (e) { console.warn('账号到期检查失败', e); }
  // 初始化运动方案库：徒手肌力训练方案库（32）+ 肌少症居家方案库（36），幂等合并进系统方案库
  try {
    if (window.StrengthLib && StrengthLib.seedToPlanLibrary) await StrengthLib.seedToPlanLibrary();
    if (window.SarcExerciseLib && SarcExerciseLib.seedToSarcLibrary) await SarcExerciseLib.seedToSarcLibrary();
  } catch (e) { console.warn('运动方案库初始化失败', e); }
  // 让管理员在运动方案库编辑页的修改即时生效于实时匹配/配重推荐
  try {
    if (window.StrengthLib && StrengthLib.reload) await StrengthLib.reload();
    if (window.SarcExerciseLib && SarcExerciseLib.reload) await SarcExerciseLib.reload();
  } catch (e) { console.warn('运动方案库重载失败', e); }
  // 合并自定义设备档案（让用户可自添加设备），按 id 去重，自定义覆盖默认
  try {
    const customDevices = await DB.getCustomDevices();
    const base = CONST.DEVICES.filter(d => !d.custom);
    window.BASE_DEVICES = base; // 保留基线设备，供编辑器恢复 short/code 等字段
    const map = {};
    base.forEach(d => { map[d.id] = d; });
    (customDevices || []).forEach(d => { map[d.id] = { ...d, custom: true }; });
    CONST.DEVICES = Object.values(map);
  } catch (e) { console.warn('加载自定义设备失败', e); }
  const app = U.qs('#app');
  app.innerHTML = '';
  app.appendChild(document.importNode(U.qs('#tpl-app-shell').content, true));

  // 应用自定义 Logo（登录页 3D logo 固定使用 images/logo-fac-transparent.png，不参与替换）
  const logoUrl = AppState.config.logoUrl || 'images/logo.png';
  const brandImg = U.qs('.sidebar-brand img');
  if (brandImg) brandImg.src = logoUrl;

  // 当前模块（持久化）
  AppState.module = currentModuleId();
  // 顶部单元切换器
  renderModuleSwitch();
  // 侧边栏（按当前模块分组渲染菜单）
  renderSidebarNav();

  U.qs('#current-user-name').textContent =
    `${AppState.currentUser.displayName}（${AppState.currentUser.role === 'superadmin' ? '超级管理员' : AppState.currentUser.role === 'admin' ? '管理员' : '医生'}）`;
  U.qs('#theme-toggle').onclick = () => (window.Skin && window.Skin.toggleMode) ? Skin.toggleMode() : toggleTheme();

  // 侧边栏底部植入小Qoo 吉祥物（场景化品牌触点）
  const sFooter = U.qs('.sidebar-footer');
  if (sFooter) {
    sFooter.innerHTML = '<img class="sidebar-qoo" src="assets/qoo.png" alt="小Qoo" onerror="this.style.display=\'none\'"><span>内测版 V3.0.1</span>';
  }

  // 应用皮肤引擎（液态玻璃 · 多配色预设 / 质感模式 / 暗亮模式）
  if (window.Skin) { Skin.applySaved(); Skin.mountSwitcher(); }
  U.qs('#logout-btn').onclick = () => U.confirm('退出后需重新登录才能继续操作。', doLogout, {
    title: '退出登录', heading: '确认退出当前账号？', okText: '退出登录'
  });
  U.qs('#mobile-menu-btn').onclick = () => U.qs('#sidebar').classList.toggle('open');
  // 顶部返回条：返回上一层 / 返回主页
  const btnBack = U.qs('#btn-back'); if (btnBack) btnBack.onclick = () => {
    if (window.history.length > 1) history.back();
    else location.hash = (AppState.module && MODULES[AppState.module]) ? MODULES[AppState.module].defaultHash : '#/home';
  };
  const btnHome = U.qs('#btn-home'); if (btnHome) btnHome.onclick = () => { location.hash = '#/portal'; };
  // Portal 键盘左右切换模块
  document.addEventListener('keydown', (e) => {
    if (!document.querySelector('.app-shell.portal-view')) return;
    if (e.key === 'ArrowLeft' && window.__portalNav) window.__portalNav.prev();
    if (e.key === 'ArrowRight' && window.__portalNav) window.__portalNav.next();
  });

  await loadDoctorPatients();
  resetIdleTimer();
  window.addEventListener('hashchange', route);
  U.setupTableObserver();
  if (!location.hash || location.hash === '#/') location.hash = '#/portal';
  else route();
}

async function loadDoctorPatients() {
  const u = AppState.currentUser;
  AppState.patients = isAdminRole(u)
    ? await DB.getPatients()
    : await DB.getPatientsByDoctor(u.username);
}
window.loadDoctorPatients = loadDoctorPatients;

/* 加载指定患者到工作上下文 */
async function loadPatientContext(id) {
  const p = await DB.getPatientById(id);
  if (!p) return U.toast('患者档案不存在', 'error');
  AppState.currentPatientId = p.id;
  const d = p.data || {};
  AppState.patient = d.patient || {};
  AppState.patient.id = p.id;   // 保证 id 与 currentPatientId 一致，方向模块守卫/数据层可识别
  AppState.assessment = d.assessment || {};
  AppState.lifeSurvey = d.lifeSurvey || {};
  AppState.plan = d.plan || {};
  AppState.isokineticData = d.isokineticData || [];
  AppState.isotonicData = d.isotonicData || [];
  AppState.trainingPlanHistory = d.trainingPlanHistory || [];
  return p;
}
window.loadPatientContext = loadPatientContext;

/* 持久化当前患者上下文 */
async function persistPatient(silent) {
  if (!AppState.currentPatientId) {
    if (!AppState.patient.name) {
      if (!silent) U.toast('请先完成患者首诊登记', 'warning');
      return null;
    }
    const created = await DB.createPatient({
      doctorUsername: AppState.currentUser.username,
      patientName: AppState.patient.name,
      data: snapshotData()
    });
    AppState.currentPatientId = created.id;
    AppState.patient.id = created.id;                       // 让方向模块（跌倒/肌少症）守卫与数据层能识别当前患者
    await DB.updatePatient(created.id, snapshotData());     // 把 id 写回 data.patient，保证重载后上下文一致
    await loadDoctorPatients();
    return created;
  }
  const updated = await DB.updatePatient(AppState.currentPatientId, snapshotData());
  await loadDoctorPatients();
  return updated;
}
function snapshotData() {
  return {
    patient: AppState.patient,
    assessment: AppState.assessment,
    lifeSurvey: AppState.lifeSurvey,
    plan: AppState.plan,
    isokineticData: AppState.isokineticData,
    isotonicData: AppState.isotonicData,
    trainingPlanHistory: AppState.trainingPlanHistory
  };
}
window.persistPatient = persistPatient;
window.snapshotData = snapshotData;

/* ==================== 导航合并：标签页融合 Hub ==================== */
// 通用 tab 聚合页：tabs=[{hash,label,render,role}]，按角色显隐，点击/Hash 切换 tab
Pages.tabHub = async function (tabs, opts) {
  opts = opts || {};
  const role = (AppState.currentUser && AppState.currentUser.role) || 'doctor';
  const visible = tabs.filter(t => (!t.adminOnly || isAdminRole(role)) && (!t.superOnly || isSuperRole(role)) && (!t.doctorOnly || role === 'doctor'));
  if (!visible.length) return '<div class="alert alert-warning"><strong>暂无可见模块</strong><p style="margin:6px 0 0;font-size:13px;">当前账号角色无权访问任何子模块。</p></div>';
  // 当前 tab：优先 location.hash 匹配，否则第一个
  let cur = visible.find(t => t.hash === location.hash) || visible[0];

  const wrap = document.createElement('div');
  wrap.className = 'hub-wrap';
  const tabsEl = document.createElement('div');
  tabsEl.className = 'hub-tabs';
  tabsEl.setAttribute('role', 'tablist');
  const bodyEl = document.createElement('div');
  bodyEl.className = 'hub-body';
  bodyEl.id = 'hub-body';
  wrap.appendChild(tabsEl);
  wrap.appendChild(bodyEl);

  async function mount(tab) {
    U.qsa('.hub-tab', tabsEl).forEach(a => a.classList.toggle('active', a.dataset.tab === tab.hash));
    bodyEl.innerHTML = '';
    try {
      const maybePromise = (typeof tab.render === 'function') ? tab.render() : '';
      let body = (maybePromise && typeof maybePromise.then === 'function') ? await maybePromise : maybePromise;
      if (body instanceof Node) bodyEl.appendChild(body);
      else bodyEl.innerHTML = body || '';
    }
    catch (e) { bodyEl.innerHTML = '<div class="alert alert-danger">子模块渲染异常：' + U.esc(e.message) + '</div>'; }
  }

  visible.forEach(t => {
    const a = document.createElement('a');
    a.className = 'hub-tab' + (t.hash === cur.hash ? ' active' : '');
    a.href = t.hash;
    a.dataset.tab = t.hash;
    a.textContent = t.label;
    a.onclick = (e) => {
      e.preventDefault();
      // 仅更新 URL 不触发 route() 整页重渲染，再局部挂载 tab 内容
      if (history.replaceState) history.replaceState(null, '', t.hash);
      mount(t);
    };
    tabsEl.appendChild(a);
  });

  await mount(cur);
  return wrap;
};
// 鹊动肌力评估：等速 + 等张（仅两个入口，去掉旧的独立入口）
Pages.muscleHub = function () {
  return Pages.tabHub([
    { hash: '#/muscle', label: '等速肌力评估', render: () => Pages.isokinetic() },
    { hash: '#/isotonic', label: '等张肌力评估', render: () => Pages.isotonic() }
  ]);
};
// 鹊动设备档案库：按方案要求只保留设备档案编辑页面本体，
// 不再套 tabHub（去掉「运动方案库管理」跳转按钮与页面），左侧导航亦不显示。
// 运动方案库管理仍可从 Portal 首页「动作库」卡片单独进入。
Pages.assetsHub = function () { return Pages.devices(); };
// 资讯中心：按角色聚合资讯/消息/管理
Pages.infoHub = function () {
  return Pages.tabHub([
    { hash: '#/info', label: '资讯中心', render: () => Pages.infoCenter(), doctorOnly: true },
    { hash: '#/msg-center', label: '系统消息', render: () => Pages.msgCenter(), doctorOnly: true },
    { hash: '#/info-admin', label: '资讯管理', render: () => Pages.infoAdmin(), adminOnly: true },
    { hash: '#/msg-admin', label: '消息管理', render: () => Pages.msgAdmin(), adminOnly: true },
    { hash: '#/info-groups', label: '接收人分组', render: () => Pages.infoGroups(), adminOnly: true }
  ]);
};
// 运维管理中心：聚合 errLog + 运维台/纠错/开关（全部仅超管）
Pages.opsHub = function () {
  return Pages.tabHub([
    { hash: '#/errlog', label: '系统运维中心', render: () => Pages.errLog() },
    { hash: '#/ops', label: '运维工作台', render: () => Pages.ops() },
    { hash: '#/ops-correct', label: '数据纠错台', render: () => (Pages.opsCorrect ? Pages.opsCorrect() : '<div class="alert alert-warning">数据纠错台模块未加载</div>') },
    { hash: '#/ops-switch', label: '运维开关台', render: () => (Pages.opsSwitch ? Pages.opsSwitch() : '<div class="alert alert-warning">运维开关台模块未加载</div>') }
  ]);
};

/* ==================== SPA 路由 ==================== */
const ROUTES = {
  '#/home': { title: '模块选择', render: () => renderPortal() },
  '#/dashboard': { title: '体重管理台账', render: () => Pages.dashboard() },
  '#/portal': { title: '模块选择', render: () => renderPortal() },
  '#/guide': { title: '功能导引', render: () => Pages.guide() },
  // —— 第三大单元：青少年脊柱健康管理（AIS 特发性脊柱侧弯）独立模块 ——
  '#/spine-coming': { title: '青少年脊柱健康管理', render: () => Pages.spineComing() },
  '#/spine': { title: '青少年脊柱健康台账', render: () => Pages.spine() },
  '#/spine-assess': { title: '青少年脊柱健康评估', render: () => Pages.spineAssess() },
  '#/spine-plan': { title: '青少年脊柱健康干预方案', render: () => Pages.spinePlan() },
  '#/patient': { title: '患者首诊登记', render: () => Pages.patient() },
  '#/assessment': { title: '体重管理评估', render: () => Pages.assessment() },
  '#/lifestyle': { title: '生活方式问卷评估', render: () => Pages.lifestyle() },
  '#/plan': { title: '智能营养与运动方案', render: () => Pages.plan() },
  '#/sarcopenia-plan': { title: '肌少症综合干预方案', render: () => Pages.sarcopeniaPlan() },
  '#/isokinetic': { title: '等速肌力评估', render: () => Pages.isokinetic() },
  '#/isotonic': { title: '等张肌力评估', render: () => Pages.isotonic() },
  // —— 肌力评估独立报告解读（跨人群共享，可脱离主线单独查看）——
  '#/isokinetic-report': { title: '等速肌力报告解读', render: () => (Pages.isokineticReport ? Pages.isokineticReport() : '<div class="alert alert-warning">等速报告模块未加载</div>') },
  '#/isotonic-report': { title: '等张肌力报告解读', render: () => (Pages.isotonicReport ? Pages.isotonicReport() : '<div class="alert alert-warning">等张报告模块未加载</div>') },
  '#/devices': { title: '鹊动设备档案', render: () => Pages.devices() },
  '#/report': { title: '报告管理中心', render: () => Pages.report() },
  '#/report-center': { title: '报告管理中心', render: () => Pages.reportCenter() },
  '#/center': { title: '医生报告中心', render: () => Pages.center() },
  '#/bigdata': { title: '体重管理看板', render: () => Pages.bigdata() },
  '#/styleguide': { title: '设计系统', render: () => Pages.styleguide() },
  '#/admin': { title: '系统管理后台', render: () => Pages.admin(), adminOnly: true },
  '#/accounts': { title: '账号管理', render: () => Pages.accounts(), superOnly: true },
  '#/errlog': { title: '运维管理中心', render: () => Pages.opsHub(), superOnly: true },
  '#/ops': { title: '运维管理工作台', render: () => Pages.ops(), superOnly: true },
  '#/ops-correct': { title: '数据纠错台', render: () => (Pages.opsCorrect ? Pages.opsCorrect() : '<div class="alert alert-warning">数据纠错台模块未加载</div>'), superOnly: true },
  '#/ops-switch': { title: '运维开关台', render: () => (Pages.opsSwitch ? Pages.opsSwitch() : '<div class="alert alert-warning">运维开关台模块未加载</div>'), superOnly: true },
  '#/action-library': { title: '运动方案库管理中心', render: () => Pages.actionLibrary(), adminOnly: true },
  // —— 平行独立核心模块：老年人体重与肌少症管理（独立菜单 / 独立业务数据 / 独立报告 / 独立干预台账）——
  '#/sarcopenia': { title: '肌少症-跌倒风险台账', render: () => Pages.sarcopenia() },
  '#/sarcopenia-assess': { title: '肌少症-跌倒风险评估', render: () => Pages.sarcopeniaAssess() },
  '#/sarcopenia-stats': { title: '肌少症看板', render: () => Pages.sarcopeniaStats() },
  // —— 第三大评估方向：跌倒风险评估（与体重管理/肌少症平级，归入综合评估中心）——
  '#/fall-risk-stats': { title: '跌倒风险看板', render: () => (Pages.fallRiskStats ? Pages.fallRiskStats() : '<div class="alert alert-warning">跌倒风险看板未加载</div>') },
  // —— 资讯与系统消息推送模块 ——
  '#/info-admin': { title: '资讯管理', render: () => Pages.infoAdmin(), adminOnly: true },
  '#/msg-admin': { title: '系统消息管理', render: () => Pages.msgAdmin(), adminOnly: true },
  '#/info-groups': { title: '医生分组与接收人', render: () => Pages.infoGroups(), adminOnly: true },
  '#/info-center': { title: '资讯中心', render: () => Pages.infoCenter(), doctorOnly: true },
  '#/msg-center': { title: '系统消息中心', render: () => Pages.msgCenter(), doctorOnly: true },
  // —— 导航合并：融合入口（标签页聚合原 Pages，旧路由保留可深链）——
  '#/muscle': { title: '鹊动肌力评估', render: () => Pages.muscleHub() },
  '#/assets': { title: '鹊动设备档案库', render: () => Pages.devices() },
  '#/info': { title: '资讯中心', render: () => Pages.infoHub() }
};

// 功能导引页：把"系统能做什么"内置进系统，降低培训成本
Pages.guide = function () {
  // 最新业务流（v3）：两类人群 × 三大方向 + 共享肌力评估 + 方向化报告中心
  var html = '<div class="page-guide">' +

    // —— 顶部概览 ——
    '<div class="guide-hero">' +
      '<h2>🧭 功能导引 · 两类人群 × 三大方向</h2>' +
      '<p>本系统围绕 <b>两类临床人群</b>（全年龄体重管理、老年肌少症-跌倒风险）展开，按 <b>统一登记 → 方向分流评估 → 方案干预 → 报告与看板</b> 主线组织。<br>' +
      '所有功能入口在左侧导航栏；患者首诊登记入口在 <b>体重管理 → 体重管理台账</b> 页面的「＋ 新建患者登记」按钮里。</p>' +
    '</div>' +

    // —— 人群分流总览 ——
    '<div class="guide-group"><h3>👥 业务主线 · 两条人群分流</h3><div class="guide-cards">' +
      '<div class="guide-card guide-card-accent"><div class="guide-card-title">⚖️ 体重管理主线（全年龄 · 减重 / 增肌）</div>' +
        '<div class="guide-card-desc">适用 <b>所有年龄</b> 用户。重点评估体成分、能量代谢、生活方式、智能营养与运动处方。流程：登记 → 体重管理评估 → 生活方式问卷 → 智能方案生成 → 报告。</div></div>' +
      '<div class="guide-card guide-card-accent"><div class="guide-card-title">🧓 老年肌少症-跌倒风险主线（≥60 岁）</div>' +
        '<div class="guide-card-desc">适用 <b>60 周岁及以上</b> 老年用户。覆盖握力、步速、小腿围、体成分、SPPB、CFS、SARC-F、跌倒风险 5 子流程。10 步标准评估 + 跌倒风险完整嵌入。</div></div>' +
    '</div></div>' +

    // —— 四大步骤详细说明 ——
    '<div class="guide-group"><h3>🗺️ 工作流步骤</h3><div class="guide-cards">' +

      '<div class="guide-card"><div class="guide-card-title">① 登记 · 体重管理台账</div>' +
        '<div class="guide-card-desc"><b>入口</b>：左侧「体重管理 → 体重管理台账」页面右上角「＋ 新建患者登记」按钮。<br>' +
        '<b>说明</b>：统一登记（不分方向），姓名 / 性别 / 年龄 / 身高 / 体重 / 病史 / 减重目标必填。完成后自动进入患者工作上下文，后续所有评估与方案归属该患者。<br>' +
        '<b>入口已隐藏</b>：原左侧「新建登记」入口已整合到体重管理台账内，避免多入口产生歧义。</div></div>' +

      '<div class="guide-card"><div class="guide-card-title">② 评估 · 按方向分流</div>' +
        '<div class="guide-card-desc">完成登记后，按临床需求进入对应方向评估：' +
        '<ul style="margin:6px 0 0;padding-left:18px;">' +
          '<li><b>体重管理评估</b>（体成分 / 腰围 / 血压 / 静息心率 / 能量代谢 / 运动风险自动判定）</li>' +
          '<li><b>生活方式问卷</b>（六维度问卷：饮食 / 运动 / 睡眠 / 压力 / 烟酒 / 认知）</li>' +
          '<li><b>肌少症-跌倒风险评估</b>（10 步流程：1 禁忌筛查 → 2 基础信息 → 3 客观指标 → 4 专项问卷 → 5 自动运算 → 6 综合风险 → 7 评估报告 → 8 方案推荐 → <b>9 跌倒风险评估</b>（F1-F5 子步骤嵌入）→ 10 纳入台账）</li>' +
          '<li><b>肌力评估</b>（等速 / 等张，两类人群共用，可独立使用）</li>' +
        '</ul></div></div>' +

      '<div class="guide-card"><div class="guide-card-title">③ 方案 · 智能处方生成</div>' +
        '<div class="guide-card-desc">基于评估数据，自动匹配：' +
        '<ul style="margin:6px 0 0;padding-left:18px;">' +
          '<li><b>体重管理</b>：营养处方 + 有氧 FITT-VP + 抗阻 / 柔韧 / 平衡 + 周日程（标准版 / 严谨版 AI 切换）</li>' +
          '<li><b>老年肌少症-跌倒风险</b>：36 动作徒手方案 + 鹊动设备方案 + 跌倒预防专项方案（高危人群优先执行）</li>' +
          '<li><b>肌力专项</b>：基于 1RM 配重的设备处方（等张）或峰力矩比对（等速）</li>' +
        '</ul></div></div>' +

      '<div class="guide-card"><div class="guide-card-title">④ 报告 · 方向化中心</div>' +
        '<div class="guide-card-desc"><b>入口</b>：左侧「报告中心」。<br>' +
        '顶部 <b>三个方向 tab</b>：' +
        '<ul style="margin:6px 0 0;padding-left:18px;">' +
          '<li><b>体重管理</b>：综合评估报告 / 智能训练方案 / 生活方式评估报告</li>' +
          '<li><b>老年肌少症-跌倒风险</b>：肌少症评估报告 / 跌倒风险评估报告</li>' +
          '<li><b>肌力评估</b>：等速肌力评估报告 / 等张肌力评估报告</li>' +
        '</ul>' +
        '患者列表带方向徽章，可按方向筛选；选中患者后支持勾选多类报告 <b>组合导出打印</b>。</div></div>' +

    '</div></div>' +

    // —— 各模块入口卡片（按导航分组） ——
    '<div class="guide-group"><h3>🧭 左侧导航 · 模块速查</h3><div class="guide-cards">' +
      '<div class="guide-card"><div class="guide-card-title">🏠 体重管理台账</div>' +
        '<div class="guide-card-desc">体重管理方向的 3D 卡片式患者列表 · 今日关注 · 工作流进度 · 周期复测提醒 · 方案库速览。<br>右上「＋ 新建患者登记」是 <b>唯一患者登记入口</b>。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">📊 体重管理评估</div>' +
        '<div class="guide-card-desc">体格测量 / 体成分 / 血压 / 静息心率 / 能量代谢（BMR + TDEE + 减重计划）/ 运动风险自动判定。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🌿 生活方式问卷</div>' +
        '<div class="guide-card-desc">六维度问卷独立生成生活方式报告，输出评分与维度明细，用于行为干预。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🎯 智能方案生成</div>' +
        '<div class="guide-card-desc">体重管理方案页：营养 + 有氧 + 抗阻 + 柔韧 + 平衡 + 周日程，含 AI 严谨版开关与一键配图。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🧓 肌少症-跌倒风险台账</div>' +
        '<div class="guide-card-desc">本模块的 3D 卡片式患者名册 · 评估台账（含分级筛选 / 搜索 / 排序） · 随访复查趋势对比 · 严蒪版方案引擎。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🩺 肌少症-跌倒风险评估</div>' +
        '<div class="guide-card-desc">10 步标准评估：<br>' +
        '1 禁忌筛查 → 2 基础信息同步 → 3 客观指标录入 → 4 专项问卷 → 5 自动运算 → 6 综合风险 → 7 评估报告 → 8 方案推荐 → <b>9 跌倒风险评估</b>（F1 跌倒史 / F2 平衡 / F3 步态 / F4 感觉认知环境 / F5 风险报告与方案）→ 10 纳入台账。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">⚙️🏋️ 肌力评估（等速 / 等张）</div>' +
        '<div class="guide-card-desc">两类人群共用 · 可独立使用：<br>' +
        '<b>等速</b>：连接鹊动等速设备测峰力矩 / 双侧不对称 / 报告 OCR 自动识别。<br>' +
        '<b>等张</b>：测 1RM，自动换算训练负荷用于方案配重。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">📑 报告中心</div>' +
        '<div class="guide-card-desc">按方向查看 / 打印 / 导出报告。<br>顶部三 tab：⚖️ 体重管理 / 🧓 老年肌少症-跌倒风险 / ⚙️ 肌力评估。<br>另含等速 / 等张报告解读独立入口。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🚀 数据看板中心</div>' +
        '<div class="guide-card-desc">大数据看板（含体重管理 / 老年肌少症 / 跌倒风险三大方向）。点击进入后可切换方向、钻取人群分布与趋势。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">🔧🃏 设备与方案库</div>' +
        '<div class="guide-card-desc">鹊动设备档案（9 台设备参数 + 处方说明）+ 运动方案库管理（管理员编辑动作）。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">📚💬 资讯与消息</div>' +
        '<div class="guide-card-desc">医生查看资讯中心 / 系统消息；管理员可发布与管理。资料库与系统消息互通。</div></div>' +
      '<div class="guide-card"><div class="guide-card-title">⚡ 系统设置</div>' +
        '<div class="guide-card-desc">管理员账号、配置与权限管理。</div></div>' +
    '</div></div>' +

    // —— 底部提示 ——
    '<div class="guide-foot">遇到问题点右下角 <b>鹊动小Qoo</b> 随时问；功能有更新本页同步更新。</div>' +
  '</div>';
  return html;
};

// 青少年脊柱健康管理（预留模块占位页）：沿用同一套框架，后续独立开发，不重构导航
Pages.spineComing = function () {
  var cards = Object.keys(MODULES).map(function (id) {
    var m = MODULES[id];
    var tag = m.reserved ? '<span class="badge badge-soon">即将上线</span>' : '<span class="badge badge-live">已上线</span>';
    return '<div class="guide-card' + (m.reserved ? ' guide-card-soon' : ' guide-card-accent') + '">' +
      '<div class="guide-card-title">' + m.icon + ' ' + m.name + ' ' + tag + '</div>' +
      '<div class="guide-card-desc">' + m.desc + '</div></div>';
  }).join('');
  return '<div class="page-guide">' +
    '<div class="guide-hero"><h2>🦴 青少年脊柱健康管理</h2>' +
    '<p>本单元为<strong>预留模块</strong>，将在体重管理、老年肌少症与跌倒风险管理之后独立开发。' +
    '正式上线后将复用现有「顶部单元切换 + 专属导航 + 工作流步进」框架，<b>无需重构导航结构</b>，切到本单元即可见脊柱健康专属步骤。</p></div>' +
    '<div class="guide-group"><h3>🧩 当前已规划单元</h3><div class="guide-cards">' + cards + '</div></div>' +
    '<div class="guide-foot">顶部切换器点 <b>老年肌少症与跌倒风险管理</b> 即可体验完整单元式导航。</div>' +
  '</div>';
};

function route() {
  const hash = location.hash || '#/home';
  // 路由别名归一化：重复入口统一重定向到主路由（保留书签/调用方兼容，避免双报告中心/双设备档案/双资讯入口）
  const ROUTE_ALIASES = { '#/center': '#/report', '#/assets': '#/devices', '#/info-center': '#/info' };
  if (ROUTE_ALIASES[hash]) { location.hash = ROUTE_ALIASES[hash]; return; }
  const main = U.qs('#main-content');
  if (!main) return;

  // —— 新架构：Portal / 单元 / 独立页 三种视图模式 ——
  const isPortal = hash === '#/portal' || hash === '#/home';
  const isStandalone = !!STANDALONE_ROUTES[hash];
  const shell = U.qs('.app-shell');
  if (shell) {
    shell.classList.toggle('portal-view', isPortal);
    shell.classList.toggle('standalone-view', isStandalone && !isPortal);
  }
  const sidebar = U.qs('#sidebar'); if (sidebar) sidebar.classList.toggle('hidden', isPortal || isStandalone);
  const topbar = U.qs('.topbar'); if (topbar) topbar.classList.toggle('hidden', isPortal);
  const retBar = U.qs('#return-bar'); if (retBar) retBar.classList.toggle('hidden', isPortal);
  const modSwitch = U.qs('#module-switch'); if (modSwitch) modSwitch.classList.add('hidden');
  // 顶部返回条：显示当前单元标识（以 AppState.module 为准，避免共享页翻转单元）
  // 关键约束：顶部表头只显示当前页面名 r.title，不再重复显示 mod.name（避免"单元名+页面名"重复）
  const unitLabel = U.qs('#current-unit-label');
  if (unitLabel) {
    unitLabel.textContent = '';
    unitLabel.style.display = 'none';
  }
  if (isPortal) { renderPortal(); return; }

  const r = ROUTES[hash];

  // 路由派生模块（单一真相）：模块专属路由自动同步当前单元 → 重渲染切换器/侧栏；共享路由保持当前上下文
  const owner = routeModuleForHash(hash);
  if (owner && owner !== currentModuleId()) setModule(owner);
  else renderSidebarNav(); // 共享路由：仅刷新当前路由高亮

  U.qsa('.nav-item').forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
  U.qs('#sidebar')?.classList.remove('open');

  if (!r) { main.innerHTML = '<div class="card"><div class="card-body">页面不存在</div></div>'; return; }
  if (r.adminOnly && !isAdminRole(AppState.currentUser.role)) {
    main.innerHTML = `<div class="alert alert-danger"><div><strong>权限不足</strong>
      <p style="margin:6px 0 0;">该模块仅限管理员账号访问。</p></div></div>`;
    return;
  }
  if (r.superOnly && !isSuperRole(AppState.currentUser.role)) {
    main.innerHTML = `<div class="alert alert-danger"><div><strong>权限不足</strong>
      <p style="margin:6px 0 0;">该模块仅限超级管理员账号访问。</p></div></div>`;
    return;
  }
  if (r.doctorOnly && AppState.currentUser.role !== 'doctor') {
    main.innerHTML = `<div class="alert alert-danger"><div><strong>权限不足</strong>
      <p style="margin:6px 0 0;">该模块仅限医生账号访问（可用种子账号：doc_zhang / doc_li / doc_wang / doc_zhao）。</p></div></div>`;
    return;
  }
  if (window.InfoPush) { try { window.InfoPush.updateBadge(); } catch (e) {} }
  U.qs('#page-title').textContent = r.title;
  // S5：先给一个统一加载动画，避免异步渲染期间的空白让人以为卡住
  main.innerHTML = U.loading('页面加载中…', { pad: '72px 0' });
  main.style.opacity = '1';
  Promise.resolve(r.render()).then(content => {
    if (typeof content === 'string') main.innerHTML = content;
    else if (content instanceof Node) { main.innerHTML = ''; main.appendChild(content); }
    main.scrollTop = 0;
    // 渲染后钩子：供各模块向台账/看板页注入执行记录等区块（如训练方案执行记录）
    if (typeof window.__onPageRendered === 'function') {
      try { window.__onPageRendered({ hash, main }); } catch (e) { console.warn('__onPageRendered hook error', e); }
    }
    // 训练方案执行记录区块：扫描本页 [data-te-scope] 并异步填充
    if (window.TrainingExecution && typeof window.TrainingExecution.fillAll === 'function') {
      try { window.TrainingExecution.fillAll(main); } catch (e) { console.warn('TrainingExecution.fillAll error', e); }
    }
    // 大数据看板：训练方案执行情况·多维区块
    if (window.TrainingExecution && typeof window.TrainingExecution.fillBigdata === 'function' && main.querySelector('[data-te-bd]')) {
      try { window.TrainingExecution.fillBigdata(main); } catch (e) { console.warn('TrainingExecution.fillBigdata error', e); }
    }
  }).catch(err => {
    console.error(err);
    main.innerHTML = `<div class="alert alert-danger"><div><strong>页面加载异常</strong>
      <p style="margin:6px 0 0;font-size:13px;">${U.esc(err.message)}</p></div></div>`;
  });
}
window.route = route;

/* ==================== Portal 首页（登录后模块选择） ==================== */
function renderPortal() {
  const u = AppState.currentUser || {};
  const role = u.role || 'doctor';
  const roleText = role === 'superadmin' ? '超级管理员' : role === 'admin' ? '管理员' : '医生';
  // 卡片主色统一走皮肤主题令牌（--primary/--info/--success/--warning/--danger），
  // 这样切换皮肤科库主题时 Portal 配色自动随之变化，不再使用硬编码色值
  const cards = [
    { id: 'sarcopenia', title: '老年肌少症<br>跌倒风险管理', icon: '🧓', color: 'var(--primary)', desc: '肌少症筛查 · 跌倒风险评估 · 预防方案' },
    { id: 'weight', title: '体重管理', icon: '⚖️', color: 'var(--warning)', desc: '体重监测 · 综合评估 · 运动方案' },
    { id: 'spine', title: '青少年脊柱健康管理', icon: '🦴', color: 'var(--info)', desc: '首诊登记 · 功能评估 · 风险分层 · 方案' },
    { id: 'devices', title: '鹊动设备<br>档案管理', icon: '🏋️', color: 'var(--secondary, var(--primary))', desc: '设备档案 · 编辑 · 维护', hash: '#/devices' },
    { id: 'actionlib', title: '动作库', icon: '🤸', color: 'var(--success)', desc: '运动方案 · 动作管理', hash: '#/action-library', adminOnly: true },
    { id: 'bigdata', title: '大数据看板', icon: '🚀', color: 'var(--info)', desc: '三大方向人群分布与趋势', hash: '#/bigdata' },
    { id: 'settings', title: '系统设置', icon: '⚙️', color: 'var(--warning)', desc: '账号 · 配置 · 权限', hash: '#/admin', adminOnly: true },
    { id: 'report-center', title: '报告管理中心', icon: '📑', color: 'var(--primary)', desc: '三单元报告 · 检索 · 预览 · 导出打印', hash: '#/report-center' },
    { id: 'ops', title: '运维中心', icon: '🛡️', color: 'var(--danger)', desc: '运维台 · 纠错 · 开关', hash: '#/ops', superOnly: true }
  ];
  const visible = cards.filter(c => (!c.adminOnly || isAdminRole(role)) && (!c.superOnly || isSuperRole(role)));
  const main = U.qs('#main-content');
  if (!main) return;
  let active = 0;
  const len = visible.length;
  function shortestOff(i, a) {
    let off = i - a;
    if (off > len / 2) off -= len;
    if (off < -len / 2) off += len;
    return off;
  }
  // 卡片内部为上下结构：上=模块名（+引导语），下=模块图标，右下=半透明吉祥物小 Qoo
  function cardHTML(c, i) {
    return '<button class="portal-card pg-card' + (i === active ? ' is-active' : '') + '" data-i="' + i + '" data-off="' + shortestOff(i, active) + '" style="--pc:' + c.color + '">'
      + '<span class="pc-edge"></span>'
      + '<span class="pg-bloom" aria-hidden="true"></span>'
      + '<span class="pg-shine"></span>'
      + '<span class="pg-top"><span class="pg-name">' + c.title + '</span><span class="pg-desc">' + (c.desc || '') + '</span></span>'
      + '<span class="pg-icon">' + c.icon + '</span>'
      + '<img class="pc-qoo" src="assets/qoo.png" alt="" aria-hidden="true" loading="lazy">'
      + '</button>';
  }
  main.innerHTML = '<div class="portal preload portal-game portal-v2">'
    /* 3D 流动粒子背景已移除（用户 8/18 要求） */
    + '<div class="portal-topbar">'
    +   '<button class="portal-top-btn" id="portal-theme" title="切换明暗主题" aria-label="切换明暗主题">🌓</button>'
    +   '<span class="portal-user"><span class="portal-uname">' + U.esc(u.displayName || '') + '</span>'
    +     '<span class="portal-urole">' + roleText + '</span></span>'
    +   '<button class="portal-top-btn" id="portal-logout" title="退出登录" aria-label="退出登录">⏻</button>'
    + '</div>'
    + '<div class="portal-hero">'
    +   '<h1 class="portal-title portal-sys-title">鹊动 FAC 功能评估与干预系统</h1>'
    +   '<p class="portal-subtitle">请选择功能模块进入</p>'
    + '</div>'
    + '<div class="portal-portal-stage-wrap">'
    +   '<div class="portal-stage">'
    +     '<div class="portal-track">' + visible.map(cardHTML).join('') + '</div>'
    +   '</div>'
    + '</div>'
    // 底部居中：圆形切换按钮（左右）+ 中间指示点
    + '<div class="portal-navbar">'
    +   '<button class="portal-nav prev" id="portal-prev" aria-label="上一个">‹</button>'
    +   '<div class="portal-dots">' + visible.map(function (c, i) { return '<button class="pdot' + (i === active ? ' on' : '') + '" data-i="' + i + '" aria-label="第' + (i + 1) + '个模块"></button>'; }).join('') + '</div>'
    +   '<button class="portal-nav next" id="portal-next" aria-label="下一个">›</button>'
    + '</div>'
    + '</div>';
  const cards$ = Array.prototype.slice.call(main.querySelectorAll('.portal-card.pg-card'));
  const dots$ = Array.prototype.slice.call(main.querySelectorAll('.pdot'));
  function update() {
    cards$.forEach(function (el, i) {
      el.setAttribute('data-off', String(shortestOff(i, active)));
      el.classList.toggle('is-active', i === active);
    });
    dots$.forEach(function (d, i) { d.classList.toggle('on', i === active); });
  }
  const prev = main.querySelector('#portal-prev'); if (prev) prev.onclick = function () { active = (active - 1 + len) % len; update(); };
  const next = main.querySelector('#portal-next'); if (next) next.onclick = function () { active = (active + 1) % len; update(); };
  const stage = main.querySelector('.portal-stage');
  if (stage) {
    let wheelLock = false;
    stage.addEventListener('wheel', function (e) {
      const dx = e.deltaX, dy = e.deltaY;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!delta) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      active = (active + (delta > 0 ? 1 : -1) + len) % len;
      update();
      setTimeout(function () { wheelLock = false; }, 480);
    }, { passive: false });
  }
  cards$.forEach(function (el) {
    el.onclick = function () {
      const i = +el.getAttribute('data-i');
      if (i === active) enterFromPortal(visible[i]);
      else { active = i; update(); }
    };
  });
  dots$.forEach(function (el) { el.onclick = function () { active = +el.getAttribute('data-i'); update(); }; });
  const th = main.querySelector('#portal-theme'); if (th) th.onclick = function () { (window.Skin && Skin.toggleMode) ? Skin.toggleMode() : toggleTheme(); };
  const lo = main.querySelector('#portal-logout'); if (lo) lo.onclick = function () { U.confirm('退出后需重新登录才能继续操作。', doLogout, { title: '退出登录', heading: '确认退出当前账号？', okText: '退出登录' }); };
  window.__portalNav = {
    prev: function () { active = (active - 1 + len) % len; update(); },
    next: function () { active = (active + 1 + len) % len; update(); }
  };
  // 进场：先移除 preload 解锁过渡，再加 is-in 触发标题/副标题/卡片淡入
  requestAnimationFrame(function () {
    const p = main.querySelector('.portal');
    if (!p) return;
    p.classList.remove('preload');
    requestAnimationFrame(function () { p.classList.add('is-in'); });
  });

  /* ===== Portal 背景已移除（用户 8/18 要求） ===== */
}

function enterFromPortal(c) {
  if (!c) return;
  if (c.reserved) { if (window.U && U.toast) U.toast('该模块即将上线', 'info'); return; }
  if (c.hash) location.hash = c.hash;
  else setModule(c.id, { navigate: true });
}
Pages.home = renderPortal;

/* ==================== 共享：肌力标准化评估结果卡片 ==================== */
window.buildStrengthScoreCard = function (scored, opts) {
  opts = opts || {};
  const c = ({ danger: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)', success: 'var(--success)' })[scored.level] || 'var(--primary)';
  const dims = (scored.dims || []).map(d => {
    const s = d.score == null ? 0 : d.score;
    const col = d.score == null ? 'var(--text-muted)' : (s >= 80 ? 'var(--success)' : s >= 60 ? 'var(--warning)' : 'var(--danger)');
    return `<div class="dim-cell">
      <div class="dim-head"><span class="dim-name">${U.esc(d.name)}</span><span class="dim-score">${d.score == null ? '—' : d.score}</span></div>
      <div class="dim-bar"><span style="width:${s}%;background:${col}"></span></div>
      <div class="dim-desc">${U.esc(d.desc || '')}</div>
    </div>`;
  }).join('');
  const qual = (scored.qualitative || []).map(q => `<p class="qual-line">${U.esc(q)}</p>`).join('');
  const weak = (scored.weakPoints || []).map(w => `<span class="badge badge-danger">${U.esc(w)}</span>`).join(' ');
  return `<div class="strength-card" style="border-left:4px solid ${c};">
    <div class="strength-head">
      <div class="strength-ring" style="--score:${scored.total};--ring:${c};">
        <span class="strength-ring-num">${scored.total}</span>
      </div>
      <div class="strength-headtext">
        <div class="strength-grade">${U.esc(scored.grade)}</div>
        <div class="strength-sub">综合评估评级${opts && opts.sub ? ' · ' + opts.sub : ''}</div>
      </div>
    </div>
    <div class="dim-grid">${dims}</div>
    <div class="qualitative-box"><strong>定性解读</strong>${qual}</div>
      ${weak ? `<div class="weak-box"><strong>识别到的肌力短板：</strong>${weak}</div>` : ''}
  </div>`;
};

/* ==================== 方案库媒体查看器（缩略图 / 弹窗 / 折叠文本） ==================== */
window.PlanMediaView = (function () {
  function storeId(lib, id) {
    if (lib === 'strength') return 'slib:' + id;
    if (lib === 'sarc') return 'sarc:' + id;
    return id;
  }
  // 卡片缩略图：图片优先展示图片；视频展示封面+播放角标；本地媒体展示占位（由 hydrate 补图）；无媒体显示占位
  // 健壮性：图片/视频加载失败（404）时自动回退到小Qoo 占位，杜绝破图/空白。
  function thumb(e, lib, id, h) {
    h = h || 130;
    const vAttr = e.video ? U.esc(e.video) : '';
    const iAttr = e.image ? U.esc(e.image) : '';
    const common = `data-pmv-open="${lib}|${id}" data-pmv-v="${vAttr}" data-pmv-i="${iAttr}" data-pmv-name="${U.esc(e.name || '')}"`;
    const qooInner = `<img class="pmv-qoo-img" src="assets/qoo.png" alt="" onerror="this.style.display='none'" /><span class="pmv-qoo-cap">小Qoo 默认图</span>`;
    // 媒体加载失败时显示的隐藏小Qoo 兜底层（绝对铺满容器）
    const qooFallback = `<div class="pmv-qoo-fb" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:6px;background:var(--bg-secondary);border-radius:10px;">${qooInner}</div>`;
    const onMediaErr = "this.style.display='none';this.parentNode.classList.add('pmv-thumb-qoo');var fb=this.parentNode.querySelector('.pmv-qoo-fb');if(fb)fb.style.display='flex';var pb=this.parentNode.querySelector('.pmv-play');if(pb)pb.style.display='none';";
    if (e.image && e.image !== '__local__') {
      return `<div class="pmv-thumb" ${common} style="height:${h}px;position:relative;"><img src="${U.esc(e.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="${onMediaErr}" />${qooFallback}</div>`;
    }
    if (e.video && e.video !== '__local__') {
      return `<div class="pmv-thumb pmv-thumb-v" ${common} style="height:${h}px;position:relative;"><video src="${U.esc(e.video)}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:10px;" onerror="${onMediaErr}"></video><span class="pmv-play">▶</span>${qooFallback}</div>`;
    }
    if (e.image === '__local__' || e.video === '__local__') {
      return `<div class="pmv-thumb pmv-thumb-local" data-pmv-local="${lib}|${id}" ${common} style="height:${h}px;"><span>${e.video === '__local__' ? '🎬 本地视频（点击查看）' : '🖼️ 本地图片（点击查看）'}</span></div>`;
    }
    return `<div class="pmv-thumb pmv-thumb-qoo" ${common} style="height:${h}px;">${qooInner}</div>`;
  }
  // 折叠文本：超过阈值折叠，按钮展开/收起（配合全局委托点击）
  function fold(text, label) {
    if (text == null || text === '') return '';
    const full = String(text);
    const preview = full.length > 40 ? full.slice(0, 40) + '…' : full;
    const id = 'pmvf_' + Math.random().toString(36).slice(2, 9);
    return `<span class="pmv-fold"><span class="pmv-fold-prev">${U.esc(preview)}</span><button type="button" class="pmv-fold-btn" data-fold-toggle="${id}">${full.length > 40 ? '展开' + (label ? '' : '') : ''}</button><span class="pmv-fold-full" id="${id}" style="display:none;">${U.esc(full)}</span></span>`;
  }
  // 将本地图片的占位补成真实缩略图（视频保持占位，由查看器播放）
  async function hydrate(root) {
    if (!root) return;
    const nodes = root.querySelectorAll('[data-pmv-local]');
    for (const n of nodes) {
      const [lib, id] = n.getAttribute('data-pmv-local').split('|');
      try {
        const m = await DB.getPlanMedia(storeId(lib, id));
        if (m && m.image) {
          const url = URL.createObjectURL(m.image);
          n.classList.remove('pmv-thumb-local');
          n.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"/>`;
        }
      } catch (e) { /* 忽略 */ }
    }
  }
  // 打开方案展示弹窗：播放/查看视频与图片，并展示折叠文字
  async function open(e, lib, id, metaHTML) {
    const sid = storeId(lib, id);
    const body = `<div id="pmv-stage"></div>${metaHTML ? `<div class="pmv-meta">${metaHTML}</div>` : ''}<div class="text-muted" style="font-size:12px;margin-top:8px;">点击媒体可在新窗口放大查看；本地媒体需从本机读取。</div>`;
    const modal = U.modal({ title: (e.name || '方案') + ' · 方案展示', body, width: 760 });
    const stage = U.qs('#pmv-stage', modal.overlay);
    let html = '';
    try {
      if (e.video === '__local__' || e.image === '__local__') {
        const m = await DB.getPlanMedia(sid);
        if (m) {
          if (m.video && e.video === '__local__') { const url = URL.createObjectURL(m.video); html += `<video controls src="${url}" style="width:100%;max-height:380px;border-radius:10px;background:#000;"></video>`; }
          if (m.image && e.image === '__local__') { const url = URL.createObjectURL(m.image); html += `<img src="${url}" style="width:100%;max-height:380px;object-fit:contain;border-radius:10px;margin-top:10px;"/>`; }
        }
      } else {
        if (e.video) html += `<video controls src="${U.esc(e.video)}" style="width:100%;max-height:380px;border-radius:10px;background:#000;"></video>`;
        if (e.image) html += `<img src="${U.esc(e.image)}" style="width:100%;max-height:380px;object-fit:contain;border-radius:10px;margin-top:10px;" onerror="this.style.display='none'"/>`;
      }
    } catch (er) { html = '<div class="text-muted">本地媒体加载失败</div>'; }
    stage.innerHTML = html || '<div class="text-muted">该方案暂未上传视频或图片</div>';
  }
  function initGlobal() {
    document.addEventListener('click', (ev) => {
      const fb = ev.target.closest('[data-fold-toggle]');
      if (fb) {
        const fid = fb.getAttribute('data-fold-toggle');
        const full = document.getElementById(fid);
        if (full) {
          const shown = full.style.display !== 'none';
          full.style.display = shown ? 'none' : 'inline';
          fb.textContent = shown ? '展开' : '收起';
        }
        return;
      }
      const openEl = ev.target.closest('[data-pmv-open]');
      if (openEl && openEl.classList.contains('pmv-thumb-none')) return;
      if (openEl && openEl.classList.contains('pmv-thumb-qoo')) {
        U.toast('该方案暂未上传视频或图片，编辑方案即可添加', 'info', 1800);
        return;
      }
      if (openEl) {
        const [lib, id] = openEl.getAttribute('data-pmv-open').split('|');
        const e = { name: openEl.getAttribute('data-pmv-name') || '', video: openEl.getAttribute('data-pmv-v') || '', image: openEl.getAttribute('data-pmv-i') || '' };
        const meta = openEl._pmvMeta || (window.__pmvMetaStore && window.__pmvMetaStore[lib + '|' + id]) || '';
        PlanMediaView.open(e, lib, id, meta);
      }
    });
  }
  if (!window.__pmvInit) { window.__pmvInit = true; initGlobal(); }
  return { thumb, fold, open, hydrate, storeId };
})();

/* ==================================================================
   SmartForm · 可编辑页智能交互工具集
   ------------------------------------------------------------------
   为「综合评估 / 肌少症 9 步向导 / 方案编辑 / 报告编辑」等所有可编辑
   页面提供统一的交互能力，避免各模块重复造轮子：
     1. autosaveHTML / attachAutosave  —— 草稿自动保存状态指示
     2. bindRanges                     —— 字段范围即时校验（保留输入，不清空）
     3. collapsibleCards               —— 渐进披露：分节折叠 + 完成度
     4. resultCard                     —— 即时计算结果卡（数值 + 结论标签 + 解读）
     5. flash                          —— 上传/回填字段高亮
     6. wizardStepper                  —— 向导锁步进度胶囊
   ================================================================== */
window.SmartForm = (function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');

  function directChild(el, cls) {
    if (!el) return null;
    for (let i = 0; i < el.children.length; i++) {
      if (el.children[i].classList && el.children[i].classList.contains(cls)) return el.children[i];
    }
    return null;
  }

  /* ---------- 1. 自动保存指示 ---------- */
  function autosaveHTML(id, initText) {
    return `<span class="autosave-dot" id="${esc(id || 'autosave-dot')}">
      <i class="pulse"></i><span class="txt">${esc(initText || '草稿自动保存已开启')}</span></span>`;
  }
  function attachAutosave(el) {
    const noop = { ping() {}, fail() {}, mark() {} };
    if (!el) return noop;
    const txt = el.querySelector('.txt');
    let timer = null;
    const setState = (cls, t) => {
      el.classList.remove('saving', 'dirty');
      if (cls) el.classList.add(cls);
      if (txt) txt.textContent = t;
    };
    return {
      ping() {
        setState('saving', '保存中…');
        clearTimeout(timer);
        timer = setTimeout(() => {
          const d = new Date();
          setState('', `已自动保存 ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`);
        }, 420);
      },
      mark() { clearTimeout(timer); setState('dirty', '有未保存修改'); },
      fail(msg) { clearTimeout(timer); setState('dirty', msg || '保存失败，请检查浏览器存储空间'); }
    };
  }

  /* ---------- 2. 字段范围即时校验 ---------- */
  function msgElOf(input) {
    if (input.__sfMsg && input.__sfMsg.isConnected) return input.__sfMsg;
    const m = document.createElement('div');
    m.className = 'field-msg';
    input.insertAdjacentElement('afterend', m);
    input.__sfMsg = m;
    return m;
  }
  function checkOne(input, rule) {
    const raw = (input.value == null ? '' : String(input.value)).trim();
    const msgEl = msgElOf(input);
    const clear = () => { input.classList.remove('field-invalid'); msgEl.classList.remove('show'); return null; };
    if (!raw) {
      if (rule.required) {
        input.classList.add('field-invalid');
        msgEl.textContent = '⛔ ' + (rule.label || '该项') + '为必填项';
        msgEl.classList.add('show');
        return { soft: false, label: rule.label, msg: (rule.label || '该项') + '为必填项' };
      }
      return clear();
    }
    const v = Number(raw);
    let err = null;
    const rangeTxt = (rule.min != null && rule.max != null)
      ? `常见范围 ${rule.min}~${rule.max}${rule.unit || ''}` : '';
    if (!isFinite(v)) err = '请输入有效数字';
    else if (rule.min != null && v < rule.min) err = `${rule.label || '数值'}偏低（${rangeTxt}），请核对是否录入有误`;
    else if (rule.max != null && v > rule.max) err = `${rule.label || '数值'}偏高（${rangeTxt}），请核对是否录入有误`;
    if (!err) return clear();
    input.classList.add('field-invalid');
    msgEl.textContent = (rule.soft ? '⚠️ ' : '⛔ ') + err;
    msgEl.classList.add('show');
    return { soft: !!rule.soft, label: rule.label, msg: err };
  }
  /**
   * rules: { '#f-grip': { min, max, label, unit, soft, required, hint } }
   * soft=true 仅提示不拦截；soft 缺省视为硬校验（拦截下一步）
   */
  function bindRanges(root, rules) {
    const entries = [];
    Object.keys(rules || {}).forEach(sel => {
      const input = root.querySelector(sel);
      if (!input) return;
      const rule = rules[sel];
      entries.push([input, rule]);
      if (rule.hint && !input.__sfHint) {
        const h = document.createElement('div');
        h.className = 'field-hint';
        h.textContent = rule.hint;
        msgElOf(input).insertAdjacentElement('afterend', h);
        input.__sfHint = h;
      }
      if (!input.__sfBound) {
        input.__sfBound = true;
        input.addEventListener('input', () => checkOne(input, rule));
        input.addEventListener('blur', () => checkOne(input, rule));
      }
      checkOne(input, rule);
    });
    const scan = () => entries.map(([i, r]) => checkOne(i, r)).filter(Boolean);
    return {
      errors: () => scan().filter(x => !x.soft),
      warnings: () => scan().filter(x => x.soft),
      focusFirstError() {
        for (let i = 0; i < entries.length; i++) {
          const r = checkOne(entries[i][0], entries[i][1]);
          if (r && !r.soft) {
            entries[i][0].focus();
            entries[i][0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            return r;
          }
        }
        return null;
      }
    };
  }

  /* ---------- 3. 渐进披露：卡片分节折叠 + 完成度 ---------- */
  function cardProgress(card) {
    let total = 0, filled = 0;
    card.querySelectorAll('input, textarea, select').forEach(i => {
      if (i.disabled || i.type === 'file' || i.type === 'button' || i.type === 'hidden') return;
      if (i.type === 'radio' || i.type === 'checkbox') return;
      total++;
      if ((i.value == null ? '' : String(i.value)).trim()) filled++;
    });
    const groups = {};
    card.querySelectorAll('input[type="radio"]').forEach(r => {
      if (!r.name) return;
      if (!(r.name in groups)) groups[r.name] = false;
      if (r.checked) groups[r.name] = true;
    });
    Object.keys(groups).forEach(n => { total++; if (groups[n]) filled++; });
    return { total, filled, pct: total ? Math.round(filled / total * 100) : 100 };
  }
  function collapsibleCards(root, opts) {
    opts = opts || {};
    const all = Array.prototype.slice.call(root.querySelectorAll('.card'));
    const tops = all.filter(c => !all.some(o => o !== c && o.contains(c)));
    tops.forEach((card, idx) => {
      const header = directChild(card, 'card-header');
      const body = directChild(card, 'card-body');
      if (!header || !body || card.__sfFold) return;
      card.__sfFold = true;
      card.classList.add('is-foldable');

      const clip = document.createElement('div');
      clip.className = 'sf-fold-clip';
      while (body.firstChild) clip.appendChild(body.firstChild);
      const grid = document.createElement('div');
      grid.className = 'sf-fold-grid';
      grid.appendChild(clip);
      body.appendChild(grid);

      const prog = document.createElement('span');
      prog.className = 'sf-sec-prog';
      const twist = document.createElement('span');
      twist.className = 'sf-sec-twist';
      twist.textContent = '▾';
      header.appendChild(prog);
      header.appendChild(twist);

      const refresh = () => {
        const p = cardProgress(card);
        if (!p.total) { prog.textContent = ''; return; }
        prog.textContent = `已填 ${p.filled}/${p.total}`;
        prog.classList.toggle('full', p.pct === 100);
        card.classList.toggle('sec-done', p.pct === 100);
      };
      refresh();
      card.__sfRefresh = refresh;
      card.addEventListener('input', refresh);
      card.addEventListener('change', refresh);

      header.addEventListener('click', (ev) => {
        if (ev.target.closest('button, a, input, label, select')) return;
        card.classList.toggle('folded');
      });
      if (opts.collapseFrom != null && idx >= opts.collapseFrom) card.classList.add('folded');
    });

    const api = {
      count: tops.length,
      refreshAll() { tops.forEach(c => c.__sfRefresh && c.__sfRefresh()); },
      expandAll() { tops.forEach(c => c.classList.remove('folded')); },
      collapseAll() { tops.forEach(c => c.classList.add('folded')); },
      collapseDone() {
        let n = 0;
        tops.forEach(c => {
          const p = cardProgress(c);
          if (p.total && p.pct === 100) { c.classList.add('folded'); n++; }
        });
        return n;
      }
    };

    /* 分节 ≥3 时自动挂载折叠工具条（不默认隐藏任何内容，交由用户控制） */
    if (opts.toolbar !== false && tops.length >= 3 && !root.__sfBar) {
      root.__sfBar = true;
      const bar = document.createElement('div');
      bar.className = 'sf-fold-bar';
      bar.innerHTML = `<span class="sf-fold-tip">共 ${tops.length} 个分节，点击标题可折叠/展开</span>
        <button type="button" data-sf="expand">全部展开</button>
        <button type="button" data-sf="collapse">全部折叠</button>
        <button type="button" data-sf="done">折叠已完成</button>`;
      bar.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-sf]');
        if (!b) return;
        ev.preventDefault();
        if (b.dataset.sf === 'expand') api.expandAll();
        else if (b.dataset.sf === 'collapse') api.collapseAll();
        else {
          const n = api.collapseDone();
          if (window.U && U.toast) U.toast(n ? `已折叠 ${n} 个已完成分节` : '暂无已填写完整的分节', n ? 'success' : 'info');
        }
      });
      const anchor = tops[0];
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
    }
    return api;
  }

  /* ---------- 4. 即时计算结果卡 ---------- */
  function resultCard(o) {
    o = o || {};
    const tag = o.tag ? `<span class="cr-tag ${esc(o.level || 'ok')}">${esc(o.tag)}</span>` : '';
    const unit = o.unit ? `<small style="font-size:12px;color:var(--text-muted);margin-left:3px;">${esc(o.unit)}</small>` : '';
    return `<div class="calc-result-card">
      <div><b>${esc(o.label || '')}</b> <span class="cr-v">${esc(o.value)}</span>${unit}${tag}</div>
      ${o.desc ? `<div style="margin-top:6px;font-size:12.5px;color:var(--text-secondary);line-height:1.65;">${o.desc}</div>` : ''}
      ${(o.parts && o.parts.length) ? `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">${o.parts.join('　·　')}</div>` : ''}
    </div>`;
  }

  /* ---------- 5. 回填高亮 ---------- */
  function flash(root, selectors) {
    (selectors || []).forEach(sel => {
      const el = typeof sel === 'string' ? root.querySelector(sel) : sel;
      if (!el) return;
      el.classList.remove('flash-backfill');
      void el.offsetWidth;
      el.classList.add('flash-backfill');
      setTimeout(() => el.classList.remove('flash-backfill'), 3400);
    });
  }

  /* ---------- 6. 向导锁步胶囊 ---------- */
  function wizardStepper(steps, cur, maxReached) {
    return `<div class="wizard-stepper">${steps.map((s, i) => {
      const n = i + 1;
      const cls = n === cur ? 'active' : (n < cur || n <= (maxReached || 0) ? 'done' : 'locked');
      const title = cls === 'locked' ? '请先完成前序步骤' : `跳转到步骤 ${n}`;
      return `<span class="wizard-dot ${cls}" data-wstep="${n}" title="${esc(title)}">
        <i class="wn">${cls === 'done' ? '✓' : n}</i>${esc(s)}</span>`;
    }).join('')}</div>`;
  }

  /* ---------- 7. 表单草稿自动保存（输入即落盘，刷新可续填） ---------- */
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function serializeForm(root) {
    const data = {};
    const checkNames = {};
    U.qsa('input[type="checkbox"]', root).forEach(el => { checkNames[el.name] = (checkNames[el.name] || 0) + 1; });
    U.qsa('input, select, textarea', root).forEach(el => {
      if (!el.name || el.disabled) return;
      if (el.type === 'radio') { if (el.checked) data[el.name] = el.value; }
      else if (el.type === 'checkbox') {
        if (checkNames[el.name] > 1) { if (!data[el.name]) data[el.name] = []; if (el.checked) data[el.name].push(el.value || 'on'); }
        else data[el.name] = el.checked;
      } else if (el.type === 'file' || el.type === 'hidden') { /* 文件/隐藏字段不落盘 */ }
      else data[el.name] = el.value;
    });
    return data;
  }

  function restoreForm(root, data) {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(k => {
      const v = data[k];
      const radios = U.qsa('input[type="radio"][name="' + cssEsc(k) + '"]', root);
      if (radios.length) { radios.forEach(r => { r.checked = (r.value === v); }); return; }
      const checks = U.qsa('input[type="checkbox"][name="' + cssEsc(k) + '"]', root);
      if (checks.length) {
        if (Array.isArray(v)) checks.forEach(c => { c.checked = v.indexOf(c.value || 'on') >= 0; });
        else checks.forEach(c => { c.checked = !!v; });
        return;
      }
      const el = U.qs('[name="' + cssEsc(k) + '"]', root);
      if (el && el.type !== 'file' && el.type !== 'hidden') {
        el.value = (v == null ? '' : v);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    root.dispatchEvent(new Event('sf:restored', { bubbles: true }));
  }

  function bindDraft(root, key, opts) {
    opts = opts || {};
    root = typeof root === 'string' ? U.qs(root) : root;
    const noop = { saveNow() {}, clear() {}, restore() {} };
    if (!root) return noop;
    const storeKey = 'qd:draft:' + key;
    let indicator = opts.indicator;
    if (!indicator) {
      const host = opts.indicatorHost ? U.qs(opts.indicatorHost) : null;
      const el = document.createElement('span');
      el.className = 'autosave-dot';
      el.innerHTML = '<i class="pulse"></i><span class="txt">草稿自动保存已开启</span>';
      (host || root).appendChild(el);
      indicator = attachAutosave(el);
    }
    // 仅当表单当前为空时才回填草稿，避免覆盖「编辑已有记录」的预填值
    if (!opts.skipRestore) {
      try {
        const raw = localStorage.getItem(storeKey);
        if (raw) {
          const data = JSON.parse(raw);
          const cur = serializeForm(root);
          const empty = Object.keys(cur).length === 0 ||
            Object.keys(cur).every(k => cur[k] == null || cur[k] === '' || (Array.isArray(cur[k]) && cur[k].length === 0));
          if (empty) restoreForm(root, data);
        }
      } catch (e) { /* 草稿损坏则忽略 */ }
    }
    let timer = null;
    const persist = () => {
      try { localStorage.setItem(storeKey, JSON.stringify(serializeForm(root))); indicator.ping(); }
      catch (e) { indicator.fail(); }
    };
    const onInput = () => { clearTimeout(timer); timer = setTimeout(persist, 350); };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    return {
      saveNow: persist,
      clear() { try { localStorage.removeItem(storeKey); } catch (e) {} },
      restore() { try { const raw = localStorage.getItem(storeKey); if (raw) restoreForm(root, JSON.parse(raw)); } catch (e) {} }
    };
  }

  return {
    autosaveHTML, attachAutosave,
    bindRanges, checkOne,
    collapsibleCards, cardProgress,
    resultCard, flash, wizardStepper,
    bindDraft, serializeForm, restoreForm
  };
})();

/* ==================== 页面注册容器（声明已提前至全局状态区） ==================== */

/* ==================== 工作台首页 ==================== */
// 3D 今日待办卡片 · 共用渲染（体重 / 肌少症）
function ttCard(direction) {
  if (!window.TodayTodo) return '';
  let items = [];
  let breakdown = {};
  if (direction === 'weight') {
    const built = window.TodayTodo.buildWeight(AppState.patients);
    items = built.items; breakdown = built.breakdown;
  } else if (direction === 'sarc') {
    try {
      const records = window.SarcDB ? window.SarcDB.listAll ? window.SarcDB.listAll() : [] : [];
      const built = window.TodayTodo.buildSarc(records);
      items = built.items; breakdown = built.breakdown;
    } catch (e) { items = []; }
  }
  if (!items.length) {
    return `
      <div class="card tt-card mt-3">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📌</span>今日待办</h3></div>
        <div class="tt-empty">🎉 当前没有紧急待办，所有评估/方案均在期限内。</div>
      </div>`;
  }
  return window.TodayTodo.renderCard(direction, items, breakdown);
}
window.ttCard = ttCard;

Pages.dashboard = async function () {
  const allList = AppState.patients;
  // 体重管理台账：仅展示已开展体重管理方向的患者（含评估 / 方案 / 生活方式数据）
  const list = allList.filter(p => {
    const d = p.data || {};
    return !!(d.assessment || d.plan || d.lifestyle);
  });
  const total = list.length;

  const recent = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

  // 工作流卡片（WF）已移除：台账直接展示患者，登记/评估/方案进度已内化至 3D 轮播顶部

  // 体重管理患者列表：复用 Portal 首页 3D 卡片轮播
  const ptCardHost = `<div class="card mt-3 pt-card-host">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧑‍⚕️</span>体重管理患者列表</h3>
        <span class="badge badge-info" id="pt-count">${list.length} 位在管</span></div>
      <div class="card-body pt-body-v">
        <div class="pt-mid">
          <div class="portal-stage pt-stage" id="pt-stage">
            <div class="portal-track" id="pt-track"></div>
            <div class="portal-navgroup">
              <button class="portal-nav prev" id="pt-prev" aria-label="上一位">‹</button>
              <button class="portal-nav next" id="pt-next" aria-label="下一位">›</button>
            </div>
          </div>
          <div class="pt-detail">
            <div class="pt-detail-top">
              <div class="pt-d-av" id="pt-d-av">—</div>
              <div>
                <div class="pt-d-name" id="pt-d-name">—</div>
                <div class="pt-d-sub" id="pt-d-sub"></div>
              </div>
              <span class="badge pt-risk-pill" id="pt-d-riskpill"></span>
            </div>
            <div class="pt-grid">
              <div class="pt-cell"><div class="k">BMI</div><div class="vv" id="pt-d-bmi">—</div></div>
              <div class="pt-cell"><div class="k">运动风险评分</div><div class="vv" id="pt-d-score">—</div></div>
              <div class="pt-cell"><div class="k">评估完整度</div><div class="vv" id="pt-d-pct">—</div></div>
            </div>
            <div class="pt-ai" id="pt-d-advice"></div>
            <div class="pt-actions">
              <button class="btn btn-primary btn-sm" id="pt-open">📋 调阅档案</button>
              <button class="btn btn-ghost btn-sm" id="pt-assess">进入评估</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // 待复测提醒
  const reminders = [];
  list.forEach(p => {
    const recs = [...(p.data?.isokineticData || []), ...(p.data?.isotonicData || [])];
    if (!recs.length) return;
    const last = recs.reduce((m, r) => new Date(r.testDate) > new Date(m.testDate) ? r : m, recs[0]);
    const days = U.daysBetween(last.testDate, new Date());
    if (days >= CONST.RETEST_CYCLE_DAYS - 14) {
      reminders.push({ name: p.patientName, id: p.id, days, last: last.testDate });
    }
  });

  // —— 运动方案库速览（首页缩略图）——
  let libPreview = '';
  try {
    const sl = (window.StrengthLib && await window.StrengthLib.getExercises()) || [];
    const sa = (window.SarcExerciseLib && await window.SarcExerciseLib.getExercises()) || [];
    const pl = (await DB.getPlanLibrary()) || [];
    window.__pmvMetaStore = window.__pmvMetaStore || {};
    const miniMeta = (e, lib) => {
      const rows = [];
      const r = (k, v) => { if (v) rows.push(`<div class="pmv-meta-row"><span class="pmv-meta-k">${k}</span><span class="pmv-meta-v">${PlanMediaView.fold(v, k)}</span></div>`); };
      if (lib === 'strength') { r('目标肌群', e.muscle); r('参数', e.params); r('要点', e.points); }
      else if (lib === 'sarc') { r('分类', e.catLabel || e.cat); r('参数', e.params); r('要点', e.points); r('医嘱', e.note); }
      else { r('目标肌群', e.target); r('剂量', e.dose); r('描述', e.desc); r('注意', e.caution); }
      return rows.join('');
    };
    const cell = (e, lib) => {
      window.__pmvMetaStore[lib + '|' + e.id] = miniMeta(e, lib);
      return `<div class="pmv-mini"><div class="pmv-mini-cap">${PlanMediaView.thumb(e, lib, e.id, 96)}</div><div class="pmv-mini-name">${U.esc(e.name || '')}</div></div>`;
    };
    const col = (title, arr, lib) => arr.length ? `<div class="pmv-col"><div class="pmv-col-title">${title}（${arr.length}）</div><div class="pmv-row">${arr.slice(0, 6).map(e => cell(e, lib)).join('')}</div></div>` : '';
    libPreview = `<div class="card mt-3">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🎯</span>运动方案库速览</h3>
        <img class="lib-qoo" src="assets/qoo.png" alt="小Qoo" onerror="this.style.display='none'" />
        <a href="#/action-library" class="btn btn-ghost btn-sm">进入管理中心 →</a></div>
      <div class="card-body">${col('徒手肌力训练方案库', sl, 'strength')}${col('肌少症居家方案库', sa, 'sarc')}${col('通用运动方案库', pl, 'plan')}</div>
    </div>`;
  } catch (er) { console.error('方案库速览加载失败', er); }
  setTimeout(() => { const m = U.qs('#main-content'); if (m) PlanMediaView.hydrate(m); }, 80);
  setTimeout(() => { try { window.initPatientCarousel && window.initPatientCarousel(); } catch (e) { console.error('患者轮播初始化失败', e); } }, 90);
  // 今日待办悬浮图标：点击弹出 / 收起；点击空白处关闭
  setTimeout(() => {
    try {
      const fab = U.qs('#lw-todo-fab'); const pop = U.qs('#lw-todo-pop');
      const backdrop = U.qs('#lw-todo-backdrop'); const closeBtn = U.qs('#lw-todo-close');
      if (fab && pop) {
        const hide = () => { pop.classList.remove('open'); fab.classList.remove('active'); };
        fab.onclick = (ev) => { ev.stopPropagation(); pop.classList.toggle('open'); fab.classList.toggle('active', pop.classList.contains('open')); };
        if (backdrop) backdrop.onclick = hide;
        if (closeBtn) closeBtn.onclick = hide;
        if (window.addEventListener) window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop.classList.contains('open')) hide(); });
      }
    } catch (e) { console.error('今日待办悬浮按钮绑定失败', e); }
  }, 100);

  const execCard = (window.TrainingExecution && window.TrainingExecution.ledgerCard) ? window.TrainingExecution.ledgerCard('weight') : '';
  const remCard = reminders.length ? `
    <div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>周期复测提醒</h3>
      <span class="badge badge-warning">${reminders.length} 位患者待复测</span></div>
      <div class="card-body"><div class="table-wrap"><table>
        <thead><tr><th>患者姓名</th><th>末次测评日期</th><th>距今天数</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${reminders.map(r => `<tr><td><strong>${U.esc(r.name)}</strong></td><td>${U.fmtDate(r.last)}</td><td>${r.days} 天</td>
          <td>${r.days >= CONST.RETEST_CYCLE_DAYS ? '<span class="badge badge-danger">已到复测周期</span>' : '<span class="badge badge-warning">临近复测</span>'}</td>
          <td><button class="btn btn-sm btn-primary" onclick="openPatient('${r.id}')">调阅档案</button></td></tr>`).join('')}</tbody>
      </table></div></div></div>` : '';
  const titleBar = `<div class="ledger-titlebar lt-weight">
    <a href="#/patient" class="btn btn-primary lt-cta lt-cta-left">＋ 新建患者</a>
    <div class="lt-brand"><span class="lt-ico">⚖️</span><div class="lt-text"><h1>体重管理台账</h1><span class="lt-sub">全年龄 · 减重 / 增肌 · <b>${list.length} 位在管</b></span></div></div>
  </div>`;

  // 今日待办：移出常规流，改为右下角悬浮图标，点击弹出查看
  const todoHtml = ttCard('weight');
  let todoCount = 0;
  if (window.TodayTodo && window.TodayTodo.buildWeight) {
    try { todoCount = window.TodayTodo.buildWeight(AppState.patients).items.length; } catch (e) {}
  }

  // 体重管理台账 · 新版布局：标题栏 / 患者左右结构（左侧 3D 轮播 / 右侧详情） / 训练执行 + 复测左右并排
  // 移除了「我的工作流进度」卡片（用户要求），空态不再占据独立卡片位置
  const bottomCards = [execCard, remCard].filter(Boolean).join('');
  const bottomRowHtml = bottomCards ? '<div class="lw-bottom-row">' + bottomCards + '</div>' : '';
  return `<div class="ledger-weight-wrap">
    ${titleBar}
    <div class="lw-top">${ptCardHost}</div>
    ${bottomRowHtml}
    ${todoHtml ? '<div class="lw-todo-pop" id="lw-todo-pop"><div class="lw-todo-backdrop" id="lw-todo-backdrop"></div><div class="lw-todo-panel" id="lw-todo-panel"><button type="button" class="lw-todo-close" id="lw-todo-close" aria-label="关闭">✕</button>' + todoHtml + '</div></div>' : ''}
    <button type="button" class="lw-todo-fab" id="lw-todo-fab" title="今日待办" aria-label="今日待办">
      <span class="lw-todo-ico">📌</span>${todoCount ? '<span class="lw-todo-badge">' + todoCount + '</span>' : ''}
    </button>
  </div>`;
};

async function openPatient(id) {
  await loadPatientContext(id);
  U.toast(`已载入患者：${AppState.patient.name || ''}`, 'success');
  location.hash = '#/assessment';
}
window.openPatient = openPatient;

/* ==================== 首页 3D 患者列表轮播 ==================== */
function computePatientView() {
  const out = (AppState.patients || []).map(p => {
    const d = p.data || {};
    const pat = d.patient || {};
    const assess = d.assessment || {};
    let er = { level: 'low', label: '低风险', advice: '', score: 0, factors: [] };
    try { const r = Calc.exerciseRisk(assess, pat); if (r) er = r; } catch (e) {}
    const bmiRaw = Calc.bmi(U.num(assess.weight), U.num(assess.height));
    const flags = [
      pat.name ? 1 : 0, assess.height ? 1 : 0,
      Object.keys(d.lifeSurvey || {}).length ? 1 : 0,
      d.plan && d.plan.generatedAt ? 1 : 0,
      ((d.isokineticData || []).length + (d.isotonicData || []).length) ? 1 : 0
    ];
    const pct = Math.round(flags.reduce((a, b) => a + b, 0) / 5 * 100);
    const riskMap = { high: 'high', medium: 'mid', low: 'low' };
    return {
      id: p.id,
      name: p.patientName || pat.name || '未命名',
      gender: pat.gender || '',
      age: pat.age || '',
      bmi: (bmiRaw == null ? null : bmiRaw),
      risk: riskMap[er.level] || 'low',
      riskLabel: er.label || '低风险',
      score: (er.score != null ? er.score : ''),
      pct, advice: er.advice || '', factors: er.factors || [],
      icon: '⚖️'
    };
  });
  out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return out;
}

window.initPatientCarousel = function () {
  const stage = U.qs('#pt-stage'), track = U.qs('#pt-track');
  if (!track) return;
  if (window.__ptTimer) { clearInterval(window.__ptTimer); window.__ptTimer = null; }
  const view = computePatientView();
  track.innerHTML = '';
  if (!view.length) {
    stage.classList.add('pt-empty');
    track.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:28px;color:var(--text-primary);">' +
        '<div style="font-size:64px;line-height:1;filter:drop-shadow(0 4px 12px rgba(99,102,241,.25));">⚖️</div>' +
        '<div style="font-size:18px;font-weight:800;letter-spacing:.5px;">尚无体重管理患者档案</div>' +
        '<div style="max-width:420px;font-size:13px;line-height:1.6;color:var(--text-muted);">系统会从登记台账中筛选「已开展评估/方案/生活方式数据」的患者进入本台账；点击下方按钮去登记首位患者。</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;">' +
          '<a href="#/patient" class="btn btn-primary" style="padding:10px 22px;font-weight:700;">＋ 新建患者登记</a>' +
          '<a href="#/assessment" class="btn btn-ghost" style="padding:10px 22px;">或直接进入评估</a>' +
        '</div>' +
      '</div>';
    return;
  }
  stage.classList.remove('pt-empty');
  const N = view.length;
  // [BUGFIX] active 必须在 cardHTML 首次调用前完成初始化，否则 let 的暂时性死区(TDZ)
  // 会抛 ReferenceError，导致 track.innerHTML 赋值中断 → 3D 轮播容器整体不显示
  let active = 0;
  const RISK_COLOR = { high: '#dc2626', mid: '#f59e0b', low: '#10b981' };
  const RISK_ICON = { high: '⚠️', mid: '⚡', low: '✅' };
  function cardHTML(p, i) {
    const color = RISK_COLOR[p.risk] || '#6c5ce7';
    const icon = p.icon || RISK_ICON[p.risk] || '⚖️';
    const demo = [p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
    const riskCls = p.risk || 'low';
    const riskLbl = p.riskLabel || '低风险';
    return '<button class="portal-card pg-card' + (i === active ? ' is-active' : '') + '" data-i="' + i + '" data-off="0" style="--pc:' + color + '" aria-label="' + U.esc(p.name) + ' · ' + U.esc(riskLbl) + '">'
      + '<span class="pc-edge"></span>'
      + '<span class="pg-shine"></span>'
      + '<span class="pg-watermark" aria-hidden="true">' + icon + '</span>'
      + '<span class="pg-top">'
      + '<span class="pg-name">' + U.esc(p.name) + '</span>'
      + (demo ? '<span class="pg-desc">' + U.esc(demo) + '</span>' : '')
      + '<span class="pg-risk pg-risk-' + riskCls + '">' + U.esc(riskLbl) + '</span>'
      + '</span>'
      + '<span class="pg-icon">' + icon + '</span>'
      + '</button>';
  }
  track.innerHTML = view.map(cardHTML).join('');
  const cards$ = Array.prototype.slice.call(track.querySelectorAll('.portal-card'));
  function shortestOff(i, a) {
    let off = i - a;
    if (off > N / 2) off -= N;
    if (off < -N / 2) off += N;
    return off;
  }
  const RISK_PILL = { high: 'badge-danger', mid: 'badge-warning', low: 'badge-success' };
  let currentId = view[0].id;
  function updateCards() {
    cards$.forEach(function (el, i) {
      el.setAttribute('data-off', String(shortestOff(i, active)));
      el.classList.toggle('is-active', i === active);
    });
  }
  function renderDetail() {
    const p = view[active];
    currentId = p.id;
    const $ = id => document.getElementById(id);
    if (!$('pt-d-av')) return;
    $('pt-d-av').textContent = (p.name || '?').charAt(0);
    $('pt-d-name').textContent = p.name;
    $('pt-d-sub').textContent = [p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
    $('pt-d-bmi').textContent = p.bmi != null ? p.bmi : '—';
    $('pt-d-score').textContent = p.score !== '' ? p.score : '—';
    $('pt-d-pct').textContent = p.pct + '%';
    const pill = $('pt-d-riskpill');
    pill.textContent = p.riskLabel;
    pill.className = 'badge pt-risk-pill ' + (RISK_PILL[p.risk] || 'badge-info');
    $('pt-d-advice').innerHTML = p.advice ? '<b>AI 建议：</b>' + U.esc(p.advice) : '<span style="color:var(--text-muted)">暂无评估数据，无法生成建议</span>';
  }
  function move(dir) {
    active = (active + dir + N) % N;
    updateCards();
    renderDetail();
    reset();
  }
  cards$.forEach(function (el) {
    el.onclick = function () {
      const i = +el.getAttribute('data-i');
      if (i === active) { openPatient(currentId); }
      else { active = i; updateCards(); renderDetail(); reset(); }
    };
  });
  const prev = document.getElementById('pt-prev');
  const next = document.getElementById('pt-next');
  if (prev) prev.onclick = () => move(-1);
  if (next) next.onclick = () => move(1);
  // 滚轮/触控板切换
  if (stage) {
    let wheelLock = false;
    stage.addEventListener('wheel', function (e) {
      const dx = e.deltaX, dy = e.deltaY;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!delta) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      move(delta > 0 ? 1 : -1);
      setTimeout(function () { wheelLock = false; }, 480);
    }, { passive: false });
  }
  const openBtn = document.getElementById('pt-open');
  const assessBtn = document.getElementById('pt-assess');
  if (openBtn) openBtn.onclick = () => { loadPatientContext(currentId); location.hash = '#/report'; };
  if (assessBtn) assessBtn.onclick = () => { openPatient(currentId); };
  function reset() {
    if (window.__ptTimer) clearInterval(window.__ptTimer);
    window.__ptTimer = setInterval(() => {
      if (!document.getElementById('pt-track')) { clearInterval(window.__ptTimer); window.__ptTimer = null; return; }
      move(1);
    }, 5000);
  }
  updateCards(); renderDetail(); reset();
};

/* ==================== 通用登记/患者档案 3D 封面流轮播（肌少症 / 脊柱台账复用） ==================== */
window.initRegistryCarousel = function (cfg) {
  const track = U.qs('#' + cfg.trackId);
  const stage = U.qs('#' + cfg.stageId);
  if (!track) return;
  if (window.__rcrTimer) { clearInterval(window.__rcrTimer); window.__rcrTimer = null; }
  const view = cfg.view || [];
  track.innerHTML = '';
  if (!view.length) {
    if (stage) stage.classList.add('pt-empty');
    track.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">' + (cfg.emptyText || '暂无登记档案，请先登记') + '</div>';
    return;
  }
  if (stage) stage.classList.remove('pt-empty');
  const N = view.length;
  // [BUGFIX] 同 initPatientCarousel：active 需在 cardHTML 首次调用前初始化，
  // 否则 TDZ ReferenceError 会中断渲染 → 肌少症/脊柱台账 3D 轮播容器不显示
  let active = 0;
  const RISK_COLOR = cfg.riskColors || { high: '#dc2626', mid: '#f59e0b', low: '#10b981' };
  const RISK_ICON = cfg.riskIcons || { high: '⚠️', mid: '⚡', low: '✅' };
  const cardHTML = (p, i) => {
    const color = p.pc || RISK_COLOR[p.risk] || '#6c5ce7';
    const icon = p.icon || RISK_ICON[p.risk] || '👤';
    const demo = [p.gender || '', p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
    const riskCls = p.risk || 'low';
    const riskLbl = p.riskLabel || '低风险';
    return '<button class="portal-card pg-card' + (i === active ? ' is-active' : '') + '" data-i="' + i + '" data-off="0" style="--pc:' + color + '" aria-label="' + U.esc(p.name) + ' · ' + U.esc(riskLbl) + '">'
      + '<span class="pc-edge"></span>'
      + '<span class="pg-shine"></span>'
      + '<span class="pg-watermark" aria-hidden="true">' + icon + '</span>'
      + '<span class="pg-top">'
      + '<span class="pg-name">' + U.esc(p.name) + '</span>'
      + (demo ? '<span class="pg-desc">' + U.esc(demo) + '</span>' : '')
      + '<span class="pg-risk pg-risk-' + riskCls + '">' + U.esc(riskLbl) + '</span>'
      + '</span>'
      + '<span class="pg-icon">' + icon + '</span>'
      + '</button>';
  };
  track.innerHTML = view.map(cardHTML).join('');
  const cards$ = Array.prototype.slice.call(track.querySelectorAll('.portal-card'));
  const pre = cfg.prefix;
  function shortestOff(i, a) {
    let off = i - a;
    if (off > N / 2) off -= N;
    if (off < -N / 2) off += N;
    return off;
  }
  const RISK_PILL = { high: 'badge-danger', mid: 'badge-warning', low: 'badge-success' };
  let currentId = view[0].id;
  function updateCards() {
    cards$.forEach(function (el, i) {
      el.setAttribute('data-off', String(shortestOff(i, active)));
      el.classList.toggle('is-active', i === active);
    });
  }
  function renderDetail() {
    const p = view[active];
    currentId = p.id;
    const $ = id => document.getElementById(pre + '-' + id);
    if (!$('d-av')) return;
    $('d-av').textContent = (p.name || '?').charAt(0);
    $('d-name').textContent = p.name;
    $('d-sub').textContent = [p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
    const pill = $('d-riskpill');
    if (pill) { pill.textContent = p.riskLabel || '—'; pill.className = 'badge pt-risk-pill ' + (RISK_PILL[p.risk] || 'badge-info'); }
    const grid = $('d-grid');
    if (grid) grid.innerHTML = (p.cells || []).map(c => '<div class="pt-cell"><div class="k">' + U.esc(c.k) + '</div><div class="vv">' + U.esc(String(c.v)) + '</div></div>').join('');
    const advice = $('d-advice');
    if (advice) advice.innerHTML = p.adviceHtml || '<span style="color:var(--text-muted)">暂无评估数据，无法生成建议</span>';
  }
  function move(dir) { active = (active + dir + N) % N; updateCards(); renderDetail(); reset(); }
  cards$.forEach(function (el) {
    el.onclick = function () {
      const i = +el.getAttribute('data-i');
      if (i === active) { cfg.onOpen && cfg.onOpen(currentId); }
      else { active = i; updateCards(); renderDetail(); reset(); }
    };
  });
  const prev = document.getElementById(pre + '-prev');
  const next = document.getElementById(pre + '-next');
  if (prev) prev.onclick = () => move(-1);
  if (next) next.onclick = () => move(1);
  if (stage) {
    let wheelLock = false;
    stage.addEventListener('wheel', function (e) {
      const dx = e.deltaX, dy = e.deltaY;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!delta) return;
      e.preventDefault();
      if (wheelLock) return;
      wheelLock = true;
      move(delta > 0 ? 1 : -1);
      setTimeout(function () { wheelLock = false; }, 480);
    }, { passive: false });
  }
  function bindBtn(id, fn) { const b = document.getElementById(pre + '-' + id); if (b) b.onclick = () => fn && fn(currentId); }
  bindBtn('open', cfg.onOpen);
  bindBtn('assess', cfg.onAssess);
  bindBtn('edit', cfg.onEdit);
  bindBtn('del', cfg.onDel);
  function reset() {
    if (window.__rcrTimer) clearInterval(window.__rcrTimer);
    window.__rcrTimer = setInterval(function () {
      if (!document.getElementById(cfg.trackId)) { clearInterval(window.__rcrTimer); window.__rcrTimer = null; return; }
      move(1);
    }, 5000);
  }
  updateCards(); renderDetail(); reset();
};

/* ==================== 设备档案页 ==================== */
function deviceImgBlock(d) {
  const id = d.id;
  if (d.img === '__local__') {
    return `<div class="device-card-img device-card-local dev-img-view" data-dev-img-local="device-${U.esc(id)}" data-id="${U.esc(id)}" data-name="${U.esc(d.name)}" title="点击查看图片"></div>`;
  }
  if (d.img) {
    return `<img class="device-card-img dev-img-view" data-id="${U.esc(id)}" src="${U.esc(d.img)}" alt="${U.esc(d.name)}" title="点击查看图片" onerror="this.style.display='none'" />`;
  }
  return `<div class="device-card-img device-card-noimg">暂无图片</div>`;
}

async function hydrateDeviceMedia(root) {
  if (!root) return;
  const nodes = root.querySelectorAll('[data-dev-img-local]');
  for (const n of nodes) {
    const key = n.getAttribute('data-dev-img-local');
    try {
      const m = await DB.getPlanMedia(key);
      if (m && m.image) {
        const url = URL.createObjectURL(m.image);
        n.classList.remove('device-card-local');
        n.innerHTML = `<img src="${url}" alt="" style="width:120px;height:120px;object-fit:contain;border-radius:var(--radius-sm);background:var(--bg-hover);" />`;
      }
    } catch (e) { /* 忽略 */ }
  }
}

function deviceCardHTML(d) {
  const isCustom = !!d.custom;
  const hasVideo = !!(d.video && d.video !== '__local__') || !!(d.video === '__local__');
  return `
  <div class="device-card">
    ${deviceImgBlock(d)}
    <div class="device-info">
      <div class="device-name">${U.esc(d.id)} 号机 · ${U.esc(d.name)}</div>
      <div style="margin:8px 0;">
        ${d.isokinetic ? '<span class="badge badge-primary">支持等速</span>' : '<span class="badge badge-info">等张/抗阻</span>'}
        <span class="badge badge-success">ROM ${U.esc(d.rom || '—')}</span>
        ${isCustom ? '<span class="badge badge-warning">自定义</span>' : ''}
      </div>
      <div class="device-meta"><strong>主要肌群：</strong>${U.esc(d.muscles || '—')}</div>
      <div class="device-meta"><strong>涉及关节：</strong>${U.esc(d.joints || '—')}</div>
      <div class="device-meta"><strong>运动轨迹：</strong>${U.esc(d.track || '—')}</div>
      <details style="margin-top:10px;">
        <summary style="cursor:pointer;font-size:13px;color:var(--primary);font-weight:600;">查看标准操作姿态</summary>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin:8px 0 0;">${U.esc(d.posture || '—')}</p>
      </details>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${hasVideo ? `<button class="btn btn-primary btn-sm dev-play" data-id="${U.esc(d.id)}">▶ 播放视频</button>` : ''}
        <button class="btn btn-secondary btn-sm dev-edit" data-id="${U.esc(d.id)}">编辑</button>
      </div>
    </div>
  </div>`;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function refreshDevicesView() {
  const main = U.qs('#main-content');
  if (main) { main.innerHTML = ''; main.appendChild(Pages.devices()); }
}

function mergeCustomDevices(list) {
  const base = CONST.DEVICES.filter(x => !x.custom);
  const map = {};
  base.forEach(x => { map[x.id] = x; });
  (list || []).forEach(x => { map[x.id] = { ...x, custom: true }; });
  CONST.DEVICES = Object.values(map);
}

async function openDeviceVideo(d) {
  const overlay = U.el(`
    <div class="modal-overlay">
      <div class="modal" style="max-width:720px;">
        <div class="modal-header">
          <h3 style="margin:0;font-size:17px;">${U.esc(d.name)} · 操作视频</h3>
          <button class="btn btn-ghost btn-sm modal-close">✕</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <div id="dev-video-loading" style="padding:40px 0;">${U.loading('视频加载中…', { pad: '0' })}</div>
          <video id="dev-video-player" controls playsinline style="max-width:100%;max-height:60vh;display:none;border-radius:10px;"></video>
          <div id="dev-video-error" style="display:none;padding:20px;color:var(--danger);"></div>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  let revokeUrl = null;
  const close = () => {
    if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    overlay.remove();
  };
  U.qs('.modal-close', overlay).onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  try {
    let src = d.video;
    if (d.video === '__local__') {
      const media = await DB.getPlanMedia(`device-${d.id}`);
      if (!media || !media.video) throw new Error('本地视频未找到，可能已被清理');
      src = URL.createObjectURL(media.video);
      revokeUrl = src;
    }
    const player = U.qs('#dev-video-player', overlay);
    player.src = src;
    player.style.display = 'block';
    U.qs('#dev-video-loading', overlay).style.display = 'none';
    player.play().catch(() => {});
  } catch (e) {
    U.qs('#dev-video-loading', overlay).style.display = 'none';
    U.qs('#dev-video-error', overlay).style.display = 'block';
    U.qs('#dev-video-error', overlay).textContent = '视频加载失败：' + U.esc(e.message);
  }
}

/* 通用设备图片/视频查看器：方案推荐页点击设备缩略图触发 */
async function openDeviceMedia(d) {
  if (!d) return;
  const name = d.name || d.short || ('QD-' + d.id);
  const imgSrc = d.img || '';
  let videoSrc = d.video || '';
  // 标准 9 台设备视频走媒体服务兜底
  if (!videoSrc && d.id && /^0[1-9]$/.test(d.id)) {
    videoSrc = '/api/media/device-' + d.id + '/video';
  }
  const overlay = U.el(`
    <div class="modal-overlay">
      <div class="modal" style="max-width:800px;">
        <div class="modal-header">
          <h3 style="margin:0;font-size:17px;">${U.esc(name)} · 图片 / 视频</h3>
          <button class="btn btn-ghost btn-sm modal-close">✕</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <div class="dev-media-viewer">
            <div class="dev-media-img-wrap" style="${imgSrc ? '' : 'display:none;'}">
              <img id="dev-media-img" src="${d.img && d.img !== '__local__' ? U.esc(d.img) : ''}" alt="${U.esc(name)}" style="max-width:100%;max-height:46vh;border-radius:10px;object-fit:contain;" onerror="this.style.display='none';if(this.parentElement)this.parentElement.style.display='none';">
            </div>
            <div id="dev-media-video-wrap" style="margin-top:14px;display:none;">
              <video id="dev-media-video-player" controls playsinline style="max-width:100%;max-height:40vh;border-radius:10px;display:block;"></video>
            </div>
            <div id="dev-media-no-video" style="display:none;padding:18px 0;color:var(--text-muted);text-align:center;">
              该设备暂无操作视频；如需上传，请前往「设备档案库」添加。
            </div>
            <div id="dev-media-video-error" style="display:none;padding:18px 0;color:var(--danger);text-align:center;"></div>
          </div>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  let revokeUrl = null;
  const close = () => {
    if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    overlay.remove();
  };
  U.qs('.modal-close', overlay).onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  try {
    let src = videoSrc;
    if (videoSrc === '__local__') {
      const media = await DB.getPlanMedia('device-' + d.id);
      if (!media || !media.video) throw new Error('本地视频未找到，可能已被清理');
      src = URL.createObjectURL(media.video);
      revokeUrl = src;
    } else if (videoSrc && videoSrc.startsWith('/api/media/') && window.QDAuth) {
      // 媒体接口需 Bearer 令牌，<video src> 不会自动带 Header，故先 fetch 再转 blob URL
      const resp = await fetch(videoSrc, { headers: window.QDAuth.authHeaders() });
      if (!resp.ok) throw new Error('视频加载失败（状态 ' + resp.status + '）');
      const blob = await resp.blob();
      src = URL.createObjectURL(blob);
      revokeUrl = src;
    }
    if (src) {
      const wrap = U.qs('#dev-media-video-wrap', overlay);
      const player = U.qs('#dev-media-video-player', overlay);
      player.addEventListener('error', () => {
        wrap.style.display = 'none';
        const err = U.qs('#dev-media-video-error', overlay);
        err.style.display = 'block';
        err.textContent = '视频加载失败，该设备可能尚未上传操作视频。';
      });
      player.src = src;
      wrap.style.display = 'block';
      player.play().catch(() => {});
    } else {
      U.qs('#dev-media-no-video', overlay).style.display = 'block';
    }
  } catch (e) {
    U.qs('#dev-media-video-error', overlay).style.display = 'block';
    U.qs('#dev-media-video-error', overlay).textContent = '视频加载失败：' + U.esc(e.message);
  }
  // 本地图片（IndexedDB）解析
  if (d.img === '__local__') {
    try {
      const media = await DB.getPlanMedia('device-' + d.id);
      if (media && media.image) {
        const url = URL.createObjectURL(media.image);
        const wrap = U.qs('.dev-media-img-wrap', overlay);
        const imgEl = U.qs('#dev-media-img', overlay);
        if (wrap && imgEl) { imgEl.src = url; wrap.style.display = ''; }
      }
    } catch (e) { /* 忽略 */ }
  }
}
window.openDeviceMedia = openDeviceMedia;

function openDeviceEditor(existing) {
  const d = existing || { id: 'C' + Date.now().toString().slice(-8), isokinetic: false, rom: '', muscles: '', joints: '', track: '', posture: '', img: '', video: '', name: '' };
  const overlay = U.el(`
    <div class="modal-overlay">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3 style="margin:0;font-size:17px;">${existing ? '编辑设备档案' : '添加自定义设备'}</h3>
          <button class="btn btn-ghost btn-sm modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group">
              <label>设备名称 <span class="required">*</span></label>
              <input type="text" id="dev-name" value="${U.esc(d.name)}" placeholder="如：下肢蹬踏测训单元" />
            </div>
            <div class="form-group">
              <label>运动范围 ROM</label>
              <input type="text" id="dev-rom" value="${U.esc(d.rom)}" placeholder="如 0°-120°" />
            </div>
          </div>
          <div class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group">
              <label>主要肌群</label>
              <input type="text" id="dev-muscles" value="${U.esc(d.muscles)}" placeholder="如 股四头肌/腘绳肌" />
            </div>
            <div class="form-group">
              <label>涉及关节</label>
              <input type="text" id="dev-joints" value="${U.esc(d.joints)}" placeholder="如 膝/髋" />
            </div>
          </div>
          <div class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group">
              <label>运动轨迹</label>
              <input type="text" id="dev-track" value="${U.esc(d.track)}" placeholder="如 弧线往复" />
            </div>
            <div class="form-group" style="display:flex;align-items:flex-end;">
              <label style="display:flex;gap:8px;align-items:center;cursor:pointer;">
                <input type="checkbox" id="dev-iso" ${d.isokinetic ? 'checked' : ''} /> 支持等速肌力测评
              </label>
            </div>
          </div>
          <div class="form-group">
            <label>标准操作姿态描述</label>
            <textarea id="dev-posture" rows="3" placeholder="描述设备标准操作姿态与注意事项">${U.esc(d.posture)}</textarea>
          </div>
          <div class="form-group">
            <label>设备图片</label>
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
              <input type="file" id="dev-img" accept="image/*" style="flex:1;min-width:180px;" />
              <input type="text" id="dev-img-url" value="${d.img && d.img !== '__local__' ? U.esc(d.img) : ''}" placeholder="或填写外链图片 URL" style="flex:1;min-width:180px;" />
            </div>
            <p class="text-muted" style="font-size:12px;margin:6px 0 0;">本地图片将存入本机媒体库（IndexedDB）；大图建议使用外链 URL。</p>
            <div id="dev-img-status" style="margin-top:8px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              ${d.img === '__local__' ? '<span>已保存本地图片，重新上传可替换</span>' : (d.img ? `<a href="${U.esc(d.img)}" target="_blank" rel="noopener">${U.esc(d.img)}</a>` : '<span>暂无图片</span>')}
              ${d.img ? `<button type="button" class="btn btn-danger btn-sm" id="dev-img-del">删除图片</button>` : ''}
            </div>
            ${d.img && d.img !== '__local__' ? `<img id="dev-img-prev" src="${U.esc(d.img)}" style="max-height:120px;margin-top:8px;border-radius:8px;display:block;" />` : '<img id="dev-img-prev" style="max-height:120px;margin-top:8px;border-radius:8px;display:none;" />'}
          </div>
          <div class="form-group">
            <label>设备操作视频</label>
            <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;">
              <input type="file" id="dev-video" accept="video/*" style="flex:1;min-width:180px;" />
              <input type="text" id="dev-video-url" value="${d.video && d.video !== '__local__' ? U.esc(d.video) : ''}" placeholder="或填写外链 URL" style="flex:1;min-width:180px;" />
            </div>
            <p class="text-muted" style="font-size:12px;margin:6px 0 0;">本地视频 ≤500MB；大视频建议使用外链 URL。</p>
            <div id="dev-video-status" style="margin-top:8px;font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              ${d.video === '__local__' ? '<span>已保存本地视频，重新上传可替换</span>' : (d.video ? `<a href="${U.esc(d.video)}" target="_blank" rel="noopener">${U.esc(d.video)}</a>` : '<span>暂无视频</span>')}
              ${d.video ? `<button type="button" class="btn btn-danger btn-sm" id="dev-video-del">删除视频</button>` : ''}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${d.custom ? `<button class="btn btn-danger" id="dev-del">删除</button>` : ''}
          <div style="margin-left:auto;display:flex;gap:10px;">
            <button class="btn btn-ghost" id="dev-cancel">取消</button>
            <button class="btn btn-primary" id="dev-save">保存</button>
          </div>
        </div>
      </div>
    </div>`);
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  U.qs('.modal-close', overlay).onclick = close;
  U.qs('#dev-cancel', overlay).onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  U.qs('#dev-img', overlay).addEventListener('change', async () => {
    const f = U.qs('#dev-img', overlay).files[0];
    if (!f) { imgFile = null; return; }
    imgFile = f;
    try {
      const prev = U.qs('#dev-img-prev', overlay);
      if (prev.dataset.blobUrl) { try { URL.revokeObjectURL(prev.dataset.blobUrl); } catch (e) {} }
      const url = URL.createObjectURL(f);
      prev.src = url; prev.dataset.blobUrl = url; prev.style.display = 'block';
    } catch (e) { U.toast('error', '图片读取失败'); }
  });

  let videoDeleted = false;
  let imgDeleted = false;
  let imgFile = null;
  const delBtn = U.qs('#dev-video-del', overlay);
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!confirm('确认删除当前已上传/已填写的视频？')) return;
      videoDeleted = true;
      U.qs('#dev-video', overlay).value = '';
      U.qs('#dev-video-url', overlay).value = '';
      U.qs('#dev-video-status', overlay).innerHTML = '<span>暂无视频</span>';
      U.toast('info', '视频已标记删除，保存后生效');
    });
  }
  const imgDelBtn = U.qs('#dev-img-del', overlay);
  if (imgDelBtn) {
    imgDelBtn.addEventListener('click', () => {
      if (!confirm('确认删除当前已上传/已填写的图片？')) return;
      imgDeleted = true;
      imgFile = null;
      U.qs('#dev-img', overlay).value = '';
      U.qs('#dev-img-url', overlay).value = '';
      const prev = U.qs('#dev-img-prev', overlay);
      if (prev) { if (prev.dataset.blobUrl) { try { URL.revokeObjectURL(prev.dataset.blobUrl); } catch (e) {} } prev.style.display = 'none'; }
      U.qs('#dev-img-status', overlay).innerHTML = '<span>暂无图片</span>';
      U.toast('info', '图片已标记删除，保存后生效');
    });
  }

  const delDeviceBtn = U.qs('#dev-del', overlay);
  if (delDeviceBtn) {
    delDeviceBtn.addEventListener('click', async () => {
      if (!confirm('确认删除该自定义设备档案？此操作不可恢复。')) return;
      await DB.deletePlanMedia(`device-${d.id}`);
      const list = await DB.getCustomDevices();
      await DB.saveCustomDevices(list.filter(x => x.id !== d.id));
      mergeCustomDevices(list.filter(x => x.id !== d.id));
      close();
      U.toast('success', '设备已删除');
      refreshDevicesView();
    });
  }

  U.qs('#dev-save', overlay).onclick = async () => {
    const name = U.qs('#dev-name', overlay).value.trim();
    if (!name) { U.toast('error', '请填写设备名称'); return; }
    const mediaId = `device-${d.id}`;
    // 视频槽位
    let finalVideo = d.video || '';
    let saveVideoBlob = undefined;
    const vFile = U.qs('#dev-video', overlay).files[0];
    const vUrl = U.qs('#dev-video-url', overlay).value.trim();
    if (videoDeleted) {
      finalVideo = '';
      saveVideoBlob = null;
    } else if (vFile) {
      if (vFile.size > 500 * 1024 * 1024) { U.toast('error', '视频超过 500MB，请压缩后上传或改用外链 URL'); return; }
      saveVideoBlob = vFile;
      finalVideo = '__local__';
    } else if (vUrl) {
      finalVideo = vUrl;
      if (d.video === '__local__') saveVideoBlob = null;
    } else if (d.video !== '__local__') {
      finalVideo = '';
    }

    // 图片槽位（与视频对称：本地 Blob / 外链 URL / 空）
    let finalImg = d.img || '';
    let saveImageBlob = undefined;
    const imgUrl = U.qs('#dev-img-url', overlay).value.trim();
    if (imgDeleted) {
      finalImg = '';
      saveImageBlob = null;
    } else if (imgFile) {
      saveImageBlob = imgFile;
      finalImg = '__local__';
    } else if (imgUrl) {
      finalImg = imgUrl;
      if (d.img === '__local__') saveImageBlob = null;
    } else if (d.img !== '__local__') {
      finalImg = '';
    }

    // 仅在任一槽位需改写时写 IndexedDB；两槽位同时传入，避免误清空对方
    if (saveVideoBlob !== undefined || saveImageBlob !== undefined) {
      const existing = await DB.getPlanMedia(mediaId);
      const vBlob = saveVideoBlob !== undefined ? saveVideoBlob : (existing ? existing.video : null);
      const iBlob = saveImageBlob !== undefined ? saveImageBlob : (existing ? existing.image : null);
      if (vBlob || iBlob || existing) {
        await DB.savePlanMedia(mediaId, vBlob, iBlob);
      }
    }

    // 若当前设备缺失 short/code（如早期保存的自定义设备覆盖默认设备），从基线设备恢复
    const baseDev = (window.BASE_DEVICES || []).find(b => b.id === d.id);
    const short = d.short || (baseDev && baseDev.short) || '';
    const code = d.code || (baseDev && baseDev.code) || '';
    const rec = {
      ...d, short, code,
      id: d.id, name, isokinetic: U.qs('#dev-iso', overlay).checked,
      rom: U.qs('#dev-rom', overlay).value.trim(),
      muscles: U.qs('#dev-muscles', overlay).value.trim(),
      joints: U.qs('#dev-joints', overlay).value.trim(),
      track: U.qs('#dev-track', overlay).value.trim(),
      posture: U.qs('#dev-posture', overlay).value.trim(),
      img: finalImg, video: finalVideo
    };
    const list = await DB.getCustomDevices();
    const idx = list.findIndex(x => x.id === d.id);
    if (idx >= 0) list[idx] = rec; else list.push(rec);
    await DB.saveCustomDevices(list);
    mergeCustomDevices(list);
    close();
    U.toast('success', '设备档案已保存');
    refreshDevicesView();
  };
}

Pages.devices = function () {
  const devices = CONST.DEVICES;
  const html = `
    <div class="page-header">
      <div>
        <p class="text-muted">9 台标准测训单元 + 自定义设备，肌力测评数据将驱动专项训练方案自动匹配</p>
      </div>
      <div class="topbar-actions">
        <button class="btn btn-primary" id="dev-add">＋ 添加设备</button>
      </div>
    </div>
    <div class="alert alert-info">
      <div><strong>鹊动多关节等速肌力测训系统</strong>
        <p style="margin:6px 0 0;font-size:13.5px;line-height:1.75;">
        共 9 台专项测训单元，覆盖膝、髋、肩、肘关节及躯干核心肌群。其中 7 台（01/02/05/06/07/08/09）支持左右侧测评，
        两台（03/04）不支持双侧测评。可点击「添加设备」录入其它设备档案。</p></div>
    </div>
    <div class="grid-3 mt-3">
      ${devices.map(deviceCardHTML).join('')}
    </div>`;
  const root = U.el(`<div>${html}</div>`);
  U.qs('#dev-add', root).addEventListener('click', () => openDeviceEditor(null));
  U.qsa('.dev-edit', root).forEach(btn => btn.addEventListener('click', () => {
    const d = devices.find(x => x.id === btn.dataset.id);
    if (d) openDeviceEditor(d);
  }));
  U.qsa('.dev-play', root).forEach(btn => btn.addEventListener('click', async () => {
    const d = devices.find(x => x.id === btn.dataset.id);
    if (!d || !d.video) return;
    await openDeviceVideo(d);
  }));
  U.qsa('.dev-img-view', root).forEach(el => el.addEventListener('click', () => {
    const d = devices.find(x => x.id === el.dataset.id);
    if (d) openDeviceMedia(d);
  }));
  hydrateDeviceMedia(root);
  return root;
};

/* ==================== 启动 ====================
 * 由 index.html 在所有 modules/*.js 加载完毕后调用 window.__BOOT__()，
 * 确保 Pages.* 全部注册完成后再执行路由，避免白屏。 */
async function init() {
  initTheme();
  // 看板大屏展示优先：存在 ?fs= 则进入独立 kiosk 模式并跳过登录（独立窗口，不影响主系统）
  if (window.Fullscreen && await Fullscreen.maybeRenderKiosk()) return;
  // 患者只读分享链接优先：存在 ?share= 则渲染只读视图并跳过登录
  if (window.Share && window.Share.maybeRenderShare()) return;
  // 患者扫码进入 /s/<token> 短链：从服务端拉取只读报告并跳过登录
  if (window.Share && await window.Share.maybeRenderByPath()) return;
  const sess = loadSession();
  if (sess && sess.username) {
    try {
      const user = await DB.findUserByUsername(sess.username);
      if (user && user.status === 'active') {
        AppState.currentUser = user;
        await bootApp();
        showExpiryBannerIfNeeded(user);
        return;
      }
    } catch (e) { console.warn('会话恢复失败', e); }
  }
  renderLogin();
}
window.__BOOT__ = init;
