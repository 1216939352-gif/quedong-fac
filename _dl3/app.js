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
  U.qsa('.login-tab').forEach(tab => {
    tab.onclick = () => {
      U.qsa('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      loginForm.classList.toggle('hidden', !isLogin);
      registerForm.classList.toggle('hidden', isLogin);
    };
  });

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

  bindLoginMascot();
}

/* 登录页小Qoo：桌面宠物式健康提示 */
function bindLoginMascot() {
  const mascot = U.qs('.login-mascot');
  const bubble = U.qs('.qoo-bubble');
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
  { label: '制定方案', icon: '🎯', hash: '#/plan' },
  { label: '随访看板', icon: '📈', hash: '#/sarcopenia-stats' }
];
const SARCO_WORKFLOW_HASHES = {
  '#/sarcopenia': 0,
  '#/sarcopenia-assess': 1,
  '#/plan': 2,
  '#/sarcopenia-stats': 3
};
// 属于肌少症专病上下文的路由（命中即切换为专病工作流）
const SARCO_ROUTES = { '#/sarcopenia': 1, '#/sarcopenia-assess': 1, '#/sarcopenia-stats': 1 };

const NAV = [
  {
    step: 1, section: '系统功能引导',
    items: [
      { hash: '#/guide', icon: '🧭', label: '功能导引' }
    ]
  },
  {
    step: 2, section: '体重管理',
    items: [
      { hash: '#/dashboard', icon: '🏠', label: '体重管理台账' },
      { hash: '#/assessment', icon: '📊', label: '体重管理评估' },
      { hash: '#/lifestyle', icon: '🌿', label: '生活方式问卷' },
      { hash: '#/plan', icon: '🎯', label: '智能方案生成' }
    ]
  },
  {
    step: 3, section: '肌少症-跌倒风险评估',
    items: [
      { hash: '#/sarcopenia', icon: '🧓', label: '肌少症-跌倒风险台账' },
      { hash: '#/sarcopenia-assess', icon: '🩺', label: '肌少症-跌倒风险评估' }
    ]
  },
  {
    step: 4, section: '肌力评估',
    items: [
      { hash: '#/isokinetic', icon: '⚙️', label: '等速肌力评估' },
      { hash: '#/isotonic', icon: '🏋️', label: '等张肌力评估' }
    ]
  },
  {
    step: 5, section: '报告中心',
    items: [
      { hash: '#/report', icon: '📑', label: '报告管理中心' },
      { hash: '#/isokinetic-report', icon: '⚙️', label: '等速报告解读' },
      { hash: '#/isotonic-report', icon: '🏋️', label: '等张报告解读' }
    ]
  },
  {
    step: 6, section: '数据看板中心',
    items: [
      { hash: '#/bigdata', icon: '🚀', label: '大数据看板' }
    ]
  },
  {
    step: 7, section: '设备与方案库',
    items: [
      { hash: '#/devices', icon: '🔧', label: '鹊动设备档案' },
      { hash: '#/action-library', icon: '🃏', label: '运动方案库管理', adminOnly: true }
    ]
  },
  {
    step: 8, section: '资讯与消息',
    items: [
      { hash: '#/info-center', icon: '📚', label: '资讯中心', doctorOnly: true },
      { hash: '#/msg-center', icon: '💬', label: '系统消息', doctorOnly: true },
      { hash: '#/info-admin', icon: '📰', label: '资讯管理', adminOnly: true },
      { hash: '#/msg-admin', icon: '🔔', label: '消息管理', adminOnly: true },
      { hash: '#/info-groups', icon: '👥', label: '接收人分组', adminOnly: true }
    ]
  },
  {
    section: '系统设置',
    items: [
      { hash: '#/admin', icon: '⚡', label: '系统管理后台', adminOnly: true },
      { hash: '#/accounts', icon: '👑', label: '账号管理', superOnly: true },
      { hash: '#/errlog', icon: '🛡️', label: '系统运维中心', superOnly: true }
    ]
  },
];

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

  // 应用自定义 Logo
  const logoUrl = AppState.config.logoUrl || 'images/logo.png';
  const loginImg = document.querySelector('#tpl-login img');
  const brandImg = U.qs('.sidebar-brand img');
  if (loginImg) loginImg.src = logoUrl;
  if (brandImg) brandImg.src = logoUrl;

  // 侧边栏（按工作流阶段分组的菜单）
  const nav = U.qs('#sidebar-nav');
  nav.innerHTML = NAV.map(sec => {
    const items = sec.items.filter(i => (!i.adminOnly || isAdminRole(AppState.currentUser.role)) && (!i.superOnly || isSuperRole(AppState.currentUser.role)) && (!i.doctorOnly || AppState.currentUser.role === 'doctor'));
    if (!items.length) return '';
    const step = sec.step ? `<span class="nav-step">${sec.step}</span>` : '';
    return `<div class="nav-section">${step}<span class="nav-section-title">${sec.section}</span></div>` + items.map(i =>
      `<a class="nav-item" href="${i.hash}"><span class="nav-icon">${i.icon}</span><span class="nav-text"><span class="nav-label">${i.label}</span>${i.hint ? `<span class="nav-hint">${i.hint}</span>` : ''}</span></a>`).join('');
  }).join('');

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

  await loadDoctorPatients();
  resetIdleTimer();
  window.addEventListener('hashchange', route);
  U.setupTableObserver();
  if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
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

/* ==================== SPA 路由 ==================== */
const ROUTES = {
  '#/dashboard': { title: '体重管理台账', render: () => Pages.dashboard() },
  '#/guide': { title: '功能导引', render: () => Pages.guide() },
  '#/patient': { title: '患者首诊登记', render: () => Pages.patient() },
  '#/assessment': { title: '体重管理评估', render: () => Pages.assessment() },
  '#/lifestyle': { title: '生活方式问卷评估', render: () => Pages.lifestyle() },
  '#/plan': { title: '智能营养与运动方案', render: () => Pages.plan() },
  '#/isokinetic': { title: '等速肌力评估', render: () => Pages.isokinetic() },
  '#/isotonic': { title: '等张肌力评估', render: () => Pages.isotonic() },
  // —— 肌力评估独立报告解读（跨人群共享，可脱离主线单独查看）——
  '#/isokinetic-report': { title: '等速肌力报告解读', render: () => (Pages.isokineticReport ? Pages.isokineticReport() : '<div class="alert alert-warning">等速报告模块未加载</div>') },
  '#/isotonic-report': { title: '等张肌力报告解读', render: () => (Pages.isotonicReport ? Pages.isotonicReport() : '<div class="alert alert-warning">等张报告模块未加载</div>') },
  '#/devices': { title: '鹊动设备档案', render: () => Pages.devices() },
  '#/report': { title: '报告管理中心', render: () => Pages.report() },
  '#/center': { title: '医生报告中心', render: () => Pages.center() },
  '#/bigdata': { title: '体重管理看板', render: () => Pages.bigdata() },
  '#/styleguide': { title: '设计系统', render: () => Pages.styleguide() },
  '#/admin': { title: '系统管理后台', render: () => Pages.admin(), adminOnly: true },
  '#/accounts': { title: '账号管理', render: () => Pages.accounts(), superOnly: true },
  '#/errlog': { title: '系统运维中心', render: () => Pages.errLog(), superOnly: true },
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
  '#/msg-center': { title: '系统消息中心', render: () => Pages.msgCenter(), doctorOnly: true }
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

function route() {
  const hash = location.hash || '#/dashboard';
  const r = ROUTES[hash];
  const main = U.qs('#main-content');
  if (!main) return;

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
  function thumb(e, lib, id, h) {
    h = h || 130;
    const vAttr = e.video ? U.esc(e.video) : '';
    const iAttr = e.image ? U.esc(e.image) : '';
    const common = `data-pmv-open="${lib}|${id}" data-pmv-v="${vAttr}" data-pmv-i="${iAttr}" data-pmv-name="${U.esc(e.name || '')}"`;
    if (e.image && e.image !== '__local__') {
      return `<div class="pmv-thumb" ${common} style="height:${h}px;"><img src="${U.esc(e.image)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"/></div>`;
    }
    if (e.video && e.video !== '__local__') {
      return `<div class="pmv-thumb pmv-thumb-v" ${common} style="height:${h}px;"><video src="${U.esc(e.video)}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;border-radius:10px;"></video><span class="pmv-play">▶</span></div>`;
    }
    if (e.image === '__local__' || e.video === '__local__') {
      return `<div class="pmv-thumb pmv-thumb-local" data-pmv-local="${lib}|${id}" ${common} style="height:${h}px;"><span>${e.video === '__local__' ? '🎬 本地视频（点击查看）' : '🖼️ 本地图片（点击查看）'}</span></div>`;
    }
    return `<div class="pmv-thumb pmv-thumb-qoo" ${common} style="height:${h}px;">
      <img class="pmv-qoo-img" src="assets/qoo.png" alt="" onerror="this.style.display='none'" />
      <span class="pmv-qoo-cap">小Qoo 默认图</span>
    </div>`;
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
// KPI 行 · 两台账复用
function kpiRow(list, todayCount, withStrength, withPlan) {
  const totalAll = AppState.patients.length;
  const total = list.length;
  const county = AppState.patients.reduce((s, p) => s + (p.data && p.data.patient && p.data.patient.region && p.data.patient.region.county ? 1 : 0), 0);
  return `
    <div class="card mt-3">
      <div class="card-body" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;">
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">体重管理档案${totalAll !== total ? `（总 ${totalAll}）` : ''}</div></div>
        <div class="stat-card"><div class="stat-value">${todayCount}</div><div class="stat-label">今日更新</div></div>
        <div class="stat-card"><div class="stat-value">${withPlan}</div><div class="stat-label">已生成方案</div></div>
        <div class="stat-card"><div class="stat-value">${county}</div><div class="stat-label">已登记县区</div></div>
      </div>
    </div>`;
}

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
window.kpiRow = kpiRow;
window.ttCard = ttCard;

Pages.dashboard = async function () {
  const allList = AppState.patients;
  // 体重管理台账：仅展示已开展体重管理方向的患者（含评估 / 方案 / 生活方式数据）
  const list = allList.filter(p => {
    const d = p.data || {};
    return !!(d.assessment || d.plan || d.lifestyle);
  });
  const total = list.length;
  const totalAll = allList.length;
  const today = U.today();
  const todayCount = list.filter(p => U.fmtDate(p.updatedAt) === today).length;
  const withStrength = list.filter(p =>
    (p.data?.isokineticData?.length || 0) + (p.data?.isotonicData?.length || 0) > 0).length;
  const withPlan = list.filter(p => p.data?.plan && p.data.plan.generatedAt).length;

  const recent = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

  // —— S6 工作台首页「继续工作流」进度提示：把登记→评估→方案串成工作流 ——
  const WF = (() => {
    const focus = (AppState.patient && list.find(p => p.id === AppState.patient.id))
      || [...list].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0] || null;
    if (!focus) {
      return `<div class="card mt-3 wf-card wf-empty">
        <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div><div style="font-weight:700;font-size:15px;">开始你的第一条临床工作流</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">登记 → 评估 → 智能方案，三步即可为患者生成标准化干预方案</div></div>
          <a href="#/patient" class="btn btn-primary">＋ 新建首位患者</a>
        </div></div>`;
    }
    const d = focus.data || {};
    const steps = [
      { key: 'patient', label: '患者登记', hash: '#/patient', done: !!(d.patient && (d.patient.name || focus.patientName)), sub: '基础信息与病史' },
      { key: 'assessment', label: '综合评估', hash: '#/assessment', done: !!(d.assessment && (d.assessment.height || d.assessment.weight)), sub: '体测与风险判定' },
      { key: 'plan', label: '智能方案', hash: '#/plan', done: !!(d.plan && d.plan.generatedAt), sub: '营养运动处方' }
    ];
    const nextIdx = steps.findIndex(s => !s.done);
    const allDone = nextIdx === -1;
    const curIdx = allDone ? steps.length - 1 : nextIdx;
    const cont = allDone ? steps[steps.length - 1] : steps[nextIdx];
    const bar = steps.map((s, i) => {
      const cls = s.done ? 'done' : (i === curIdx ? 'current' : 'todo');
      const mark = s.done ? '✓' : (i + 1);
      const sep = i < steps.length - 1 ? `<span class="wf-bar ${s.done ? 'done' : ''}"></span>` : '';
      return `<a class="wf-step ${cls}" href="${s.hash}">
          <span class="wf-node">${mark}</span>
          <span class="wf-meta"><span class="wf-label">${s.label}</span><span class="wf-sub">${s.sub}</span></span>
        </a>${sep}`;
    }).join('');
    const contLabel = allDone ? '查看 / 分享方案' : `继续：进入「${cont.label}」`;
    const focusName = U.esc(focus.patientName || (d.patient && d.patient.name) || '未命名');
    return `<div class="card mt-3 wf-card">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧩</span>我的工作流进度</h3>
        <span class="badge badge-info">当前患者：${focusName}</span></div>
      <div class="card-body">
        <div class="wf-steps">${bar}</div>
        <div style="margin-top:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <a href="${cont.hash}" class="btn btn-primary">${allDone ? '✅ ' : '➡ '}${contLabel}</a>
          <span style="font-size:13px;color:var(--text-muted);">${allDone ? '该患者的登记·评估·方案均已完成' : `已完成 ${nextIdx} / 3 步，下一步：${cont.label}`}</span>
        </div>
      </div></div>`;
  })();

  // 体重管理患者列表（3D 卡片轮播）· 移到今日待办上方
  const ptCardHost = `<div class="card mt-3 pt-card-host">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧑‍⚕️</span>体重管理患者列表</h3>
        <span class="badge badge-info" id="pt-count">${list.length} 位在管</span></div>
      <div class="card-body">
        <div class="pt-mid">
          <div class="pt-carousel-wrap">
            <div class="pt-carousel"><div class="pt-orbit"></div><div class="pt-floor"></div><div class="pt-ring" id="pt-ring"></div></div>
            <div class="pt-ctrl">
              <button class="pt-btn" id="pt-prev">‹</button>
              <span class="pt-cap" id="pt-cap">点击卡片或按钮切换</span>
              <button class="pt-btn" id="pt-next">›</button>
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
            <div style="display:flex;gap:10px;margin-top:2px;">
              <button class="btn btn-primary btn-sm" id="pt-open">调阅档案</button>
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

  return `
    <div class="hero-section">
      <div class="hero-content">
        <h1>体重管理台账</h1>
        <p>体重管理（全年龄 · 减重 / 增肌）患者的工作台 · 3D 卡片式患者列表 · 评估 / 方案 / 报告 一览</p>
        <div class="hero-cta">
          <a href="#/patient" class="btn btn-primary">新建患者登记</a>
          <a href="#/assessment" class="btn btn-secondary">进入体重管理评估</a>
        </div>
      </div>
      <div class="hero-image"><img src="images/home-hero.png" alt="体重管理台账" onerror="this.style.display='none'"></div>
    </div>

    ${kpiRow(list, todayCount, withStrength, withPlan)}

    ${ptCardHost}

    ${ttCard('weight')}

    ${window.TrainingExecution ? window.TrainingExecution.ledgerCard('weight') : ''}

    ${WF}

    ${list.length === 0 ? `
    <div class="card mt-3">
      <div class="card-body" style="padding:32px 24px;text-align:center;">
        <div style="font-size:42px;margin-bottom:12px;">⚖️</div>
        <div style="font-weight:700;font-size:15px;">尚无体重管理患者</div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-muted);">完成登记后，进入「体重管理评估」即会自动归档到本台账。</div>
        <div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">
          <a href="#/patient" class="btn btn-primary">新建患者登记</a>
        </div>
      </div>
    </div>` : ''}

    ${reminders.length ? `
    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>周期复测提醒</h3>
        <span class="badge badge-warning">${reminders.length} 位患者待复测</span></div>
      <div class="card-body">
        <div class="table-wrap"><table>
          <thead><tr><th>患者姓名</th><th>末次测评日期</th><th>距今天数</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${reminders.map(r => `<tr>
            <td><strong>${U.esc(r.name)}</strong></td>
            <td>${U.fmtDate(r.last)}</td>
            <td>${r.days} 天</td>
            <td>${r.days >= CONST.RETEST_CYCLE_DAYS
              ? '<span class="badge badge-danger">已到复测周期</span>'
              : '<span class="badge badge-warning">临近复测</span>'}</td>
            <td><button class="btn btn-sm btn-primary" onclick="openPatient('${r.id}')">调阅档案</button></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>` : ''}

    <div class="card mt-3">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🧭</span>标准临床工作流</h3></div>
      <div class="card-body">
        ${[
          ['1', '患者首诊登记', '采集基础信息、减重目标、病史用药、生活/运动/饮食基线', '#/patient'],
          ['2', '综合评估', '体格测量、体成分、能量代谢、运动风险自动判定', '#/assessment'],
          ['3', '生活方式问卷评估', '六维度问卷，独立生成生活方式报告与干预建议', '#/lifestyle'],
          ['4', '肌力专项测评', '等速 / 等张双体系，支持手动录入与官方 PDF 报告解析', '#/isokinetic'],
          ['5', '智能方案生成', '营养处方 + 有氧 FITT-VP + 抗阻 + 柔韧 + 平衡 + 周日程', '#/plan'],
          ['6', '报告管理中心', '综合/等速/等张/方案/生活方式 五类报告，支持组合打印导出', '#/report']
        ].map(([n, t, d, h]) => `
          <a href="${h}" style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--border);text-decoration:none;">
            <div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:var(--primary);color:#fff;
              display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${n}</div>
            <div><div style="font-weight:600;color:var(--text-primary);font-size:14px;">${t}</div>
            <div style="font-size:12.5px;color:var(--text-muted);margin-top:3px;line-height:1.6;">${d}</div></div>
          </a>`).join('')}
      </div>
    </div>

    ${libPreview}
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
      pct, advice: er.advice || '', factors: er.factors || []
    };
  });
  out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  return out;
}

window.initPatientCarousel = function () {
  const ring = U.qs('#pt-ring');
  if (!ring) return;
  if (window.__ptTimer) { clearInterval(window.__ptTimer); window.__ptTimer = null; }
  const view = computePatientView();
  ring.innerHTML = '';
  if (!view.length) {
    ring.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">暂无体重管理患者档案，请先登记后开展评估</div>';
    return;
  }
  const N = view.length, step = 360 / N;
  const RK = {
    high: { lab: '高风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9.5v5"/><path d="M12 17.5h.01"/></svg>' },
    mid:  { lab: '中风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/></svg>' },
    low:  { lab: '低风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6l-7-3z"/><path d="M9 12l2 2 4-4.2"/></svg>' }
  };
  const cards = view.map((p, i) => {
    const el = document.createElement('div');
    el.className = 'pt-card ' + p.risk;
    el.style.setProperty('--a', (i * step) + 'deg');
    const r = RK[p.risk];
    el.innerHTML =
      `<span class="pt-shine"></span>
       <div><div class="pt-nm">${U.esc(p.name)}</div><div class="pt-ag">${U.esc(p.gender)}${p.age ? ' · ' + p.age + '岁' : ''}</div></div>
       <div class="pt-rk ${p.risk}">
         <div class="pt-rk-row">${r.ico}<span class="pt-rk-lab">${r.lab}</span></div>
         <div class="pt-rk-meter"><i></i><i></i><i></i></div>
       </div>`;
    el.addEventListener('click', () => { cur = i; render(); reset(); });
    ring.appendChild(el);
    return el;
  });

  let cur = 0;
  const cardStyle = (idx, c) => {
    let dist = Math.abs(idx - c); dist = Math.min(dist, N - dist);
    if (dist === 0) return { sc: 1.34, op: 1, bl: '0px', br: 1 };
    if (dist === 1) return { sc: 0.96, op: 0.9, bl: '0px', br: 0.92 };
    if (dist === 2) return { sc: 0.8, op: 0.62, bl: '1.2px', br: 0.82 };
    if (dist === 3) return { sc: 0.62, op: 0.4, bl: '2.2px', br: 0.72 };
    return { sc: 0.5, op: 0.26, bl: '3px', br: 0.66 };
  };
  const RISK_PILL = { high: 'badge-danger', mid: 'badge-warning', low: 'badge-success' };
  let currentId = view[0].id;
  function render() {
    ring.style.setProperty('--rot', (-cur * step) + 'deg');
    cards.forEach((c, i) => {
      const st = cardStyle(i, cur);
      c.classList.toggle('is-front', i === cur);
      c.style.setProperty('--sc', st.sc);
      c.style.setProperty('--op', st.op);
      c.style.setProperty('--bl', st.bl);
      c.style.setProperty('--br', st.br);
    });
    const p = view[cur];
    currentId = p.id;
    const $ = id => document.getElementById(id);
    $('pt-d-av').textContent = (p.name || '?').charAt(0);
    $('pt-d-name').textContent = p.name;
    $('pt-d-sub').textContent = [p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
    $('pt-d-bmi').textContent = p.bmi != null ? p.bmi : '—';
    $('pt-d-score').textContent = p.score !== '' ? p.score : '—';
    $('pt-d-pct').textContent = p.pct + '%';
    const pill = $('pt-d-riskpill');
    pill.textContent = p.riskLabel;
    pill.className = 'badge pt-risk-pill ' + (RISK_PILL[p.risk] || 'badge-info');
    $('pt-d-advice').innerHTML = p.advice ? `<b>AI 建议：</b>${U.esc(p.advice)}` : '<span style="color:var(--text-muted)">暂无评估数据，无法生成建议</span>';
    $('pt-cap').textContent = `第 ${cur + 1} / ${N} 位 · ${p.name}`;
  }
  const next = document.getElementById('pt-next');
  const prev = document.getElementById('pt-prev');
  const openBtn = document.getElementById('pt-open');
  const assessBtn = document.getElementById('pt-assess');
  if (next) next.onclick = () => { cur = (cur + 1) % N; render(); reset(); };
  if (prev) prev.onclick = () => { cur = (cur - 1 + N) % N; render(); reset(); };
  if (openBtn) openBtn.onclick = () => { loadPatientContext(currentId); location.hash = '#/center'; };
  if (assessBtn) assessBtn.onclick = () => { openPatient(currentId); };
  function reset() { if (window.__ptTimer) clearInterval(window.__ptTimer); window.__ptTimer = setInterval(() => { if (!document.getElementById('pt-ring')) { clearInterval(window.__ptTimer); window.__ptTimer = null; return; } cur = (cur + 1) % N; render(); }, 5000); }
  render(); reset();
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
