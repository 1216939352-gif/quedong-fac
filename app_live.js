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
    const t = U.el(`<div class="toast ${type}"><strong>${icons[type] || 'i'}</strong><span>${U.esc(msg)}</span></div>`);
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(20px)';
      setTimeout(() => t.remove(), 300);
    }, duration);
  },

  /* 模态框 */
  modal({ title, body, footer, width, onMount }) {
    if (!arguments[0]) {
      document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
      return { overlay: null, close() {} };
    }
    const w = width ? (typeof width === 'number' ? width + 'px' : String(width)) : '';
    const overlay = U.el(`
      <div class="modal-overlay">
        <div class="modal" style="${w ? `max-width:min(${w}, calc(100vw - 32px));` : ''}">
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
        f.value = v;
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
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
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
      if (user.status === 'frozen') return U.toast('该账号已被冻结，请联系管理员', 'error');
      await DB.updateLastLogin(user.username);
      AppState.currentUser = user;
      saveSession(user);
      await bootApp();
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
      U.toast('注册成功，已自动登录', 'success');
      location.hash = '#/patient';
    } catch (err) {
      U.toast(err.message || '注册失败', 'error');
    }
  };
}

/* ==================== 导航配置 ==================== */
const NAV = [
  {
    section: '临床业务流程',
    items: [
      { hash: '#/dashboard', icon: '🏠', label: '工作台首页' },
      { hash: '#/patient', icon: '📝', label: '患者首诊登记' },
      { hash: '#/assessment', icon: '📊', label: '综合评估' },
      { hash: '#/lifestyle', icon: '🌿', label: '生活方式问卷评估' }
    ]
  },
  {
    section: '肌力专项测评',
    items: [
      { hash: '#/isokinetic', icon: '⚙️', label: '等速肌力评估' },
      { hash: '#/isotonic', icon: '🏋️', label: '等张肌力评估' }
    ]
  },
  {
    section: '综合方案',
    items: [
      { hash: '#/plan', icon: '🎯', label: '智能方案生成' }
    ]
  },
  {
    section: '报告管理中心',
    items: [
      { hash: '#/report', icon: '📄', label: '报告管理中心' },
      { hash: '#/bigdata', icon: '🚀', label: '大数据展示' }
    ]
  },
  {
    section: '系统设置',
    items: [
      { hash: '#/devices', icon: '🔧', label: '鹊动设备档案' },
      { hash: '#/admin', icon: '⚡', label: '系统管理后台', adminOnly: true }
    ]
  },
];

/* ==================== 应用启动 ==================== */
async function bootApp() {
  AppState.config = await DB.getSystemConfig();
  // 合并自定义设备档案（让用户可自添加设备），按 id 去重，自定义覆盖默认
  try {
    const customDevices = await DB.getCustomDevices();
    const base = CONST.DEVICES.filter(d => !d.custom);
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

  // 侧边栏
  const nav = U.qs('#sidebar-nav');
  nav.innerHTML = NAV.map(sec => {
    const items = sec.items.filter(i => !i.adminOnly || AppState.currentUser.role === 'admin');
    if (!items.length) return '';
    return `<div class="nav-section">${sec.section}</div>` + items.map(i =>
      `<a class="nav-item" href="${i.hash}"><span class="nav-icon">${i.icon}</span>${i.label}</a>`).join('');
  }).join('');

  U.qs('#current-user-name').textContent =
    `${AppState.currentUser.displayName}（${AppState.currentUser.role === 'admin' ? '管理员' : '医生'}）`;
  U.qs('#theme-toggle').onclick = toggleTheme;

  // 应用皮肤引擎（液态玻璃 · 多配色预设 / 质感模式 / 暗亮模式）
  if (window.Skin) { Skin.applySaved(); Skin.mountSwitcher(); }
  U.qs('#logout-btn').onclick = () => U.confirm('退出后需重新登录才能继续操作。', doLogout, {
    title: '退出登录', heading: '确认退出当前账号？', okText: '退出登录'
  });
  U.qs('#mobile-menu-btn').onclick = () => U.qs('#sidebar').classList.toggle('open');

  await loadDoctorPatients();
  resetIdleTimer();
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
  else route();
}

async function loadDoctorPatients() {
  const u = AppState.currentUser;
  AppState.patients = u.role === 'admin'
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
  '#/dashboard': { title: '工作台首页', render: () => Pages.dashboard() },
  '#/patient': { title: '患者首诊登记', render: () => Pages.patient() },
  '#/assessment': { title: '综合评估', render: () => Pages.assessment() },
  '#/lifestyle': { title: '生活方式问卷评估', render: () => Pages.lifestyle() },
  '#/plan': { title: '智能营养与运动方案', render: () => Pages.plan() },
  '#/isokinetic': { title: '等速肌力评估', render: () => Pages.isokinetic() },
  '#/isotonic': { title: '等张肌力评估', render: () => Pages.isotonic() },
  '#/devices': { title: '鹊动设备档案', render: () => Pages.devices() },
  '#/report': { title: '报告管理中心', render: () => Pages.report() },
  '#/center': { title: '医生报告中心', render: () => Pages.center() },
  '#/bigdata': { title: '大数据展示', render: () => Pages.bigdata() },
  '#/styleguide': { title: '设计系统', render: () => Pages.styleguide() },
  '#/admin': { title: '系统管理后台', render: () => Pages.admin(), adminOnly: true }
};

function route() {
  const hash = location.hash || '#/dashboard';
  const r = ROUTES[hash];
  const main = U.qs('#main-content');
  if (!main) return;

  U.qsa('.nav-item').forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
  U.qs('#sidebar')?.classList.remove('open');

  if (!r) { main.innerHTML = '<div class="card"><div class="card-body">页面不存在</div></div>'; return; }
  if (r.adminOnly && AppState.currentUser.role !== 'admin') {
    main.innerHTML = `<div class="alert alert-danger"><div><strong>权限不足</strong>
      <p style="margin:6px 0 0;">该模块仅限管理员账号访问。</p></div></div>`;
    return;
  }
  U.qs('#page-title').textContent = r.title;
  main.innerHTML = '';
  main.style.opacity = '0';
  Promise.resolve(r.render()).then(content => {
    if (typeof content === 'string') main.innerHTML = content;
    else if (content instanceof Node) main.appendChild(content);
    main.style.transition = 'opacity .28s ease';
    requestAnimationFrame(() => { main.style.opacity = '1'; });
    main.scrollTop = 0;
  }).catch(err => {
    console.error(err);
    main.innerHTML = `<div class="alert alert-danger"><div><strong>页面加载异常</strong>
      <p style="margin:6px 0 0;font-size:13px;">${U.esc(err.message)}</p></div></div>`;
    main.style.opacity = '1';
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

/* ==================== 页面注册容器 ==================== */
const Pages = {};
window.Pages = Pages;

/* ==================== 工作台首页 ==================== */
Pages.dashboard = async function () {
  const list = AppState.patients;
  const total = list.length;
  const today = U.today();
  const todayCount = list.filter(p => U.fmtDate(p.updatedAt) === today).length;
  const withStrength = list.filter(p =>
    (p.data?.isokineticData?.length || 0) + (p.data?.isotonicData?.length || 0) > 0).length;
  const withPlan = list.filter(p => p.data?.plan && p.data.plan.generatedAt).length;

  const recent = [...list].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);

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

  return `
    <div class="hero-section">
      <div class="hero-content">
        <h1>${U.esc(AppState.config.systemTitle || CONST.SYSTEM_NAME)}</h1>
        <p>覆盖患者建档 · 全维度身体评估 · 生活方式调研 · 等速/等张肌力测评 · 智能营养运动处方 · 标准化报告输出的一体化临床工具</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:22px;">
          <a href="#/patient" class="btn btn-primary btn-lg">开始新患者建档</a>
          <a href="#/center" class="btn btn-secondary btn-lg">进入报告中心</a>
        </div>
      </div>
      <div class="hero-image"><img src="images/home-hero.png" alt="系统首页" onerror="this.style.display='none'"></div>
    </div>

    <div class="grid-4 mt-3">
      <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">名下患者档案总数</div></div>
      <div class="stat-card"><div class="stat-value">${todayCount}</div><div class="stat-label">今日更新记录</div></div>
      <div class="stat-card"><div class="stat-value">${withStrength}</div><div class="stat-label">已完成肌力测评</div></div>
      <div class="stat-card"><div class="stat-value">${withPlan}</div><div class="stat-label">已生成干预方案</div></div>
    </div>

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

    <div class="grid-2 mt-3">
      <div class="card">
        <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📋</span>最近患者档案</h3>
          <a href="#/center" class="btn btn-ghost btn-sm">查看全部 →</a></div>
        <div class="card-body">
          ${recent.length ? `<div class="table-wrap"><table>
            <thead><tr><th>姓名</th><th>最近更新</th><th>数据完整度</th><th>操作</th></tr></thead>
            <tbody>${recent.map(p => {
              const d = p.data || {};
              const flags = [
                d.patient?.name ? 1 : 0, d.assessment?.height ? 1 : 0,
                Object.keys(d.lifeSurvey || {}).length ? 1 : 0,
                d.plan?.generatedAt ? 1 : 0,
                (d.isokineticData?.length || d.isotonicData?.length) ? 1 : 0
              ];
              const pct = Math.round(flags.reduce((a, b) => a + b, 0) / 5 * 100);
              return `<tr>
                <td><strong>${U.esc(p.patientName)}</strong></td>
                <td>${U.fmtDate(p.updatedAt, true)}</td>
                <td><div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:var(--primary);"></div></div>
                  <span style="font-size:12px;color:var(--text-muted);">${pct}%</span></div></td>
                <td><button class="btn btn-sm btn-secondary" onclick="openPatient('${p.id}')">打开</button></td>
              </tr>`;
            }).join('')}</tbody></table></div>`
            : `<div class="text-center" style="padding:36px 0;color:var(--text-muted);">
                 <div style="font-size:40px;margin-bottom:10px;">📂</div>暂无患者档案，点击上方「开始新患者建档」创建</div>`}
        </div>
      </div>

      <div class="card">
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
    </div>`;
};

async function openPatient(id) {
  await loadPatientContext(id);
  U.toast(`已载入患者：${AppState.patient.name || ''}`, 'success');
  location.hash = '#/assessment';
}
window.openPatient = openPatient;

/* ==================== 设备档案页 ==================== */
function deviceCardHTML(d) {
  const isCustom = !!d.custom;
  const hasVideo = !!(d.video && d.video !== '__local__') || !!(d.video === '__local__');
  return `
  <div class="device-card">
    <img src="${U.esc(d.img || '')}" alt="${U.esc(d.name)}" onerror="this.style.display='none'">
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
          <div id="dev-video-loading" style="padding:40px 0;color:var(--text-muted);">正在加载视频...</div>
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
            <input type="file" id="dev-img" accept="image/*" />
            ${d.img ? `<img id="dev-img-prev" src="${U.esc(d.img)}" style="max-height:120px;margin-top:8px;border-radius:8px;display:block;" />` : '<img id="dev-img-prev" style="max-height:120px;margin-top:8px;border-radius:8px;display:none;" />'}
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
    if (!f) return;
    try { U.qs('#dev-img-prev', overlay).src = await readFileAsDataURL(f); U.qs('#dev-img-prev', overlay).style.display = 'block'; }
    catch (e) { U.toast('error', '图片读取失败'); }
  });

  let videoDeleted = false;
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
    let img = d.img || '';
    const f = U.qs('#dev-img', overlay).files[0];
    if (f) { try { img = await readFileAsDataURL(f); } catch (e) { U.toast('error', '图片读取失败'); return; } }

    const mediaId = `device-${d.id}`;
    let video = d.video || '';
    const vFile = U.qs('#dev-video', overlay).files[0];
    const vUrl = U.qs('#dev-video-url', overlay).value.trim();
    if (videoDeleted) {
      if (d.video === '__local__') await DB.deletePlanMedia(mediaId);
      video = '';
    } else if (vFile) {
      if (vFile.size > 500 * 1024 * 1024) { U.toast('error', '视频超过 500MB，请压缩后上传或改用外链 URL'); return; }
      try {
        await DB.savePlanMedia(mediaId, vFile, null);
        video = '__local__';
      } catch (e) { U.toast('error', '视频保存失败：' + e.message); return; }
    } else if (vUrl) {
      if (d.video === '__local__') await DB.deletePlanMedia(mediaId);
      video = vUrl;
    } else if (d.video !== '__local__') {
      video = '';
    }

    const rec = {
      id: d.id, name, isokinetic: U.qs('#dev-iso', overlay).checked,
      rom: U.qs('#dev-rom', overlay).value.trim(),
      muscles: U.qs('#dev-muscles', overlay).value.trim(),
      joints: U.qs('#dev-joints', overlay).value.trim(),
      track: U.qs('#dev-track', overlay).value.trim(),
      posture: U.qs('#dev-posture', overlay).value.trim(),
      img, video
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
  return root;
};

/* ==================== 启动 ====================
 * 由 index.html 在所有 modules/*.js 加载完毕后调用 window.__BOOT__()，
 * 确保 Pages.* 全部注册完成后再执行路由，避免白屏。 */
async function init() {
  initTheme();
  // 患者只读分享链接优先：存在 ?share= 则渲染只读视图并跳过登录
  if (window.Share && window.Share.maybeRenderShare()) return;
  const sess = loadSession();
  if (sess && sess.username) {
    try {
      const user = await DB.findUserByUsername(sess.username);
      if (user && user.status === 'active') {
        AppState.currentUser = user;
        await bootApp();
        return;
      }
    } catch (e) { console.warn('会话恢复失败', e); }
  }
  renderLogin();
}
window.__BOOT__ = init;
