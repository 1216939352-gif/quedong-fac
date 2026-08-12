/* 鹊动FAC功能评估与干预系统 - 全局样式 */

:root {
  --primary: #f26522;
  --primary-dark: #d85416;
  --primary-light: #ff8c5a;
  --secondary: #1a1a2e;
  --accent: #00b4d8;
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #3b82f6;

  --bg-body: #f8fafc;
  /* 皮肤光球兜底（皮肤引擎注入后会覆盖） */
  --skin-orb-1: rgba(242, 101, 34, 0.30);
  --skin-orb-2: rgba(0, 180, 216, 0.26);
  --skin-glow: rgba(242, 101, 34, 0.22);
  --skin-c1: var(--primary);
  --bg-card: #ffffff;
  --bg-elevated: #ffffff;
  --bg-sidebar: #1a1a2e;
  --bg-hover: #f1f5f9;
  --bg-input: #ffffff;

  /* 侧边栏专属浅色主题变量（默认浅色导航） */
  --sidebar-bg: #ffffff;
  --sidebar-text: #334155;
  --sidebar-text-muted: #94a3b8;
  --sidebar-brand: #1a1a2e;
  --sidebar-border: #eef2f7;
  --sidebar-hover: rgba(242, 101, 34, 0.07);
  --sidebar-active-bg: rgba(242, 101, 34, 0.12);
  --sidebar-active-text: #d85416;
  --sidebar-shadow: 0 0 0 1px rgba(15, 23, 42, 0.04), 0 12px 32px -12px rgba(15, 23, 42, 0.12);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --text-inverse: #ffffff;

  --border-color: #e2e8f0;
  --border-strong: #cbd5e1;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  --header-height: 64px;
  --sidebar-width: 260px;

  --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  /* ===== 字体阶梯 ===== */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SFMono-Regular", "JetBrains Mono", Consolas, "Liberation Mono", Menlo, monospace;

  --fs-xs: 12px;   --lh-xs: 1.5;
  --fs-sm: 13px;   --lh-sm: 1.55;
  --fs-base: 14px; --lh-base: 1.6;
  --fs-md: 16px;   --lh-md: 1.6;
  --fs-lg: 18px;   --lh-lg: 1.5;
  --fs-xl: 22px;   --lh-xl: 1.4;
  --fs-2xl: 28px;  --lh-2xl: 1.3;
  --fs-3xl: 34px;  --lh-3xl: 1.2;
  --fs-4xl: 42px;  --lh-4xl: 1.12;

  --fw-regular: 400;
  --fw-medium: 500;
  --fw-semibold: 600;
  --fw-bold: 700;
  --fw-extrabold: 800;

  /* ===== 间距阶梯（4px 基准） ===== */
  --space-0: 0;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ===== 圆角补充 ===== */
  --radius-2xl: 32px;
  --radius-full: 999px;

  /* ===== 阴影 / 光晕 ===== */
  --shadow-card: var(--shadow);
  --shadow-glow: 0 0 0 4px rgba(242, 101, 34, 0.15);

  /* ===== 动效曲线与时长 ===== */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 150ms;
  --dur: 250ms;
  --dur-slow: 400ms;

  /* ===== 层级 ===== */
  --z-base: 1;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 900;
  --z-modal: 1000;
  --z-toast: 1100;

  /* ===== 品牌色阶（橙） ===== */
  --primary-50: #fff3ec;
  --primary-100: #ffe1cf;
  --primary-200: #ffc3a3;
  --primary-300: #ffa477;
  --primary-400: #ff8c5a;
  --primary-500: #f26522;
  --primary-600: #d85416;
  --primary-700: #b8430f;
  --primary-800: #8f330b;
  --primary-900: #6f290a;

  /* ===== 强调色阶（青） ===== */
  --accent-50: #e6fbff;
  --accent-100: #cdf6ff;
  --accent-200: #99ecff;
  --accent-300: #4fdcff;
  --accent-400: #1ec8f0;
  --accent-500: #00b4d8;
  --accent-600: #0096b4;
  --accent-700: #007893;
  --accent-800: #005c70;
  --accent-900: #004049;

  /* ===== 语义浅底（标签/提示背景） ===== */
  --success-bg: rgba(34, 197, 94, 0.12);
  --warning-bg: rgba(245, 158, 11, 0.14);
  --danger-bg: rgba(239, 68, 68, 0.12);
  --info-bg: rgba(59, 130, 246, 0.12);
  --primary-bg: rgba(242, 101, 34, 0.10);

  /* ===== 中性浅底 / 遮罩 ===== */
  --bg-subtle: #f1f5f9;
  --bg-overlay: rgba(15, 23, 42, 0.45);
}

[data-theme="dark"] {
  --bg-body: #0f172a;
  /* 皮肤光球兜底（皮肤引擎注入后会覆盖） */
  --skin-orb-1: rgba(96, 165, 250, 0.30);
  --skin-orb-2: rgba(52, 211, 153, 0.24);
  --skin-glow: rgba(96, 165, 250, 0.20);
  --skin-c1: #60a5fa;
  --bg-card: #1e293b;
  --bg-elevated: #334155;
  --bg-sidebar: #020617;
  --bg-hover: #334155;
  --bg-input: #1e293b;

  /* 暗色模式下侧边栏保持深色对比 */
  --sidebar-bg: #0f172a;
  --sidebar-text: #e2e8f0;
  --sidebar-text-muted: #64748b;
  --sidebar-brand: #ffffff;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-hover: rgba(255, 255, 255, 0.06);
  --sidebar-active-bg: rgba(242, 101, 34, 0.20);
  --sidebar-active-text: #ff8c5a;
  --sidebar-shadow: none;

  --text-primary: #f8fafc;
  --text-secondary: #cbd5e1;
  --text-muted: #64748b;
  --text-inverse: #0f172a;

  --border-color: #334155;
  --border-strong: #475569;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.5);

  --bg-subtle: #172033;
  --bg-overlay: rgba(2, 6, 23, 0.65);
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  background: var(--bg-body);
  color: var(--text-primary);
  line-height: 1.6;
  transition: background 0.3s, color 0.3s;
}

h1, h2, h3, h4, h5, h6, p {
  margin: 0;
}

a {
  color: var(--primary);
  text-decoration: none;
}

button {
  font-family: inherit;
  cursor: pointer;
  border: none;
  outline: none;
}

input, select, textarea {
  font-family: inherit;
  font-size: 14px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: var(--bg-input);
  color: var(--text-primary);
  transition: var(--transition);
}

input:focus, select:focus, textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(242, 101, 34, 0.15);
}

input::placeholder, textarea::placeholder {
  color: var(--text-muted);
}

label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

label .required {
  color: var(--danger);
  margin-left: 2px;
}

/* 布局 */
.app-shell {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--sidebar-bg);
  color: var(--sidebar-text);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  transition: transform 0.3s ease, background 0.3s ease;
  box-shadow: var(--sidebar-shadow);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sidebar-border);
}

.sidebar-brand img {
  height: 40px;
  width: auto;
}

.sidebar-brand-text {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--sidebar-brand);
}

.sidebar-brand-text small {
  display: block;
  font-size: 11px;
  font-weight: 400;
  opacity: 0.65;
  color: var(--sidebar-text-muted);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
}

.nav-section {
  padding: 8px 20px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sidebar-text-muted);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 20px;
  color: var(--sidebar-text);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  border-left: 3px solid transparent;
  font-size: 14px;
  margin: 2px 8px;
  border-radius: 10px;
}

.nav-item:hover {
  background: var(--sidebar-hover);
  color: var(--sidebar-active-text);
}

.nav-item.active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  border-left-color: var(--primary);
  font-weight: 600;
}

.nav-icon {
  width: 22px;
  height: 22px;
  opacity: 0.9;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--sidebar-border);
  font-size: 12px;
  color: var(--sidebar-text-muted);
  text-align: center;
}

.main-area {
  flex: 1;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  height: var(--header-height);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  position: sticky;
  top: 0;
  z-index: 90;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

/* 组件 */
.card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  margin-bottom: 20px;
  transition: var(--transition);
}

.card:hover {
  box-shadow: var(--shadow);
}

.card-header {
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-title-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
}

.card-body {
  padding: 24px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  transition: var(--transition);
  white-space: nowrap;
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  color: #fff;
  box-shadow: 0 4px 6px -1px rgba(242, 101, 34, 0.3);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 12px -2px rgba(242, 101, 34, 0.35);
}

.btn-secondary {
  background: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover {
  background: var(--border-color);
}

.btn-success {
  background: var(--success);
  color: #fff;
}

.btn-danger {
  background: var(--danger);
  color: #fff;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-hover);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 13px;
}

.btn-lg {
  padding: 14px 28px;
  font-size: 16px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.checkbox-group, .radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px 0;
}

.checkbox-item, .radio-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
  border: 1px solid transparent;
}

.checkbox-item:hover, .radio-item:hover {
  border-color: var(--primary-light);
}

.checkbox-item input, .radio-item input {
  margin: 0;
}

.checkbox-item.checked, .radio-item.checked {
  background: rgba(242, 101, 34, 0.1);
  border-color: var(--primary);
  color: var(--primary-dark);
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}

.badge-primary { background: rgba(242, 101, 34, 0.12); color: var(--primary-dark); }
.badge-success { background: rgba(34, 197, 94, 0.12); color: #16a34a; }
.badge-warning { background: rgba(245, 158, 11, 0.12); color: #d97706; }
.badge-danger { background: rgba(239, 68, 68, 0.12); color: #dc2626; }
.badge-info { background: rgba(59, 130, 246, 0.12); color: #2563eb; }

.alert {
  padding: 14px 18px;
  border-radius: var(--radius);
  margin-bottom: 20px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.alert-info { background: rgba(59, 130, 246, 0.08); border-left: 4px solid var(--info); }
.alert-success { background: rgba(34, 197, 94, 0.08); border-left: 4px solid var(--success); }
.alert-warning { background: rgba(245, 158, 11, 0.08); border-left: 4px solid var(--warning); }
.alert-danger { background: rgba(239, 68, 68, 0.08); border-left: 4px solid var(--danger); }

/* 网格 */
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }

@media (max-width: 1200px) {
  .grid-4 { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 900px) {
  .grid-3, .grid-4 { grid-template-columns: 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
}

/* 统计概览卡片 */
.metric-card {
  position: relative;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-5, 20px);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
}
.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--primary-bg, rgba(59,130,246,0.08)) 0%, transparent 60%);
  opacity: 0.6;
  pointer-events: none;
}
.metric-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--primary-bg);
  color: var(--primary);
  margin-bottom: 14px;
  position: relative;
  z-index: 1;
}
.metric-card-value {
  font-size: var(--fs-3xl, 30px);
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
  position: relative;
  z-index: 1;
}
.metric-card-value.is-text {
  font-size: var(--fs-xl, 20px);
}
.metric-card-label {
  font-size: var(--fs-sm, 14px);
  color: var(--text-secondary);
  margin-top: 6px;
  position: relative;
  z-index: 1;
}

/* 宏量营养素饼图 */
.macro-pie-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 200px;
}
.macro-pie-svg {
  width: 100%;
  max-width: 360px;
  height: auto;
  display: block;
}

/* 统计卡片 */
.stat-card {
  background: linear-gradient(135deg, var(--bg-card), var(--bg-hover));
  border-radius: var(--radius-lg);
  padding: 20px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary);
  margin: 8px 0;
}

.stat-label {
  font-size: 14px;
  color: var(--text-secondary);
}

.stat-change {
  font-size: 12px;
  color: var(--success);
}

/* 表格 */
.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th, td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

th {
  background: var(--bg-hover);
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

tr:hover td {
  background: var(--bg-hover);
}

/* 登录页 */
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: center;
  justify-content: center;
  gap: clamp(24px, 4vw, 64px);
  background: var(--bg-body);
  padding: 24px clamp(24px, 5vw, 80px);
  position: relative;
  overflow: hidden;
}

/* 登录页背景跟随皮肤：在 --bg-body 之上再叠柔和光晕，增强层次 */
.login-page::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    radial-gradient(60% 50% at 16% 12%, var(--skin-glow, transparent) 0%, transparent 60%),
    radial-gradient(50% 50% at 90% 90%, var(--skin-orb-1, transparent) 0%, transparent 55%);
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}

.login-hero {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: var(--text-primary);
  max-width: 560px;
  margin: 0 auto;
  animation: fadeInUp 0.8s ease-out;
}

.login-hero-orbs {
  position: absolute;
  top: -8%;
  right: -6%;
  width: 420px;
  height: 420px;
  pointer-events: none;
}
.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(36px);
  opacity: 0.55;
  animation: orbFloat 14s ease-in-out infinite;
}
.hero-orb-1 { width: 240px; height: 240px; top: -40px; right: 0;       background: var(--skin-orb-1, var(--primary)); }
.hero-orb-2 { width: 180px; height: 180px; top: 150px; right: 150px;  background: var(--skin-orb-2, var(--accent)); animation-delay: -4s; }
.hero-orb-3 { width: 150px; height: 150px; top: 60px;  right: 230px;  background: var(--skin-glow, var(--primary-light)); animation-delay: -8s; opacity: 0.4; }

.login-hero-inner { position: relative; }

.login-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}
.login-brand img { height: 38px; width: auto; }
.login-brand span { font-size: 14px; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.2px; }

.login-hero-title {
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.12;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: var(--text-primary);
  margin: 0 0 18px;
}
.login-hero-sub {
  font-size: 16px;
  line-height: 1.7;
  color: var(--text-secondary);
  max-width: 460px;
  margin: 0 0 30px;
}

.login-features { list-style: none; padding: 0; margin: 0 0 26px; display: flex; flex-direction: column; gap: 16px; }
.login-features li { display: flex; align-items: flex-start; gap: 14px; }
.lf-ic {
  flex: 0 0 auto;
  width: 44px; height: 44px;
  display: grid; place-items: center;
  font-size: 20px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
.lf-text { display: flex; flex-direction: column; gap: 2px; }
.lf-text b { font-size: 15px; color: var(--text-primary); font-weight: 700; }
.lf-text i { font-size: 13px; color: var(--text-muted); font-style: normal; line-height: 1.5; }

.login-hero-foot { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-muted); margin-bottom: 24px; }
.login-hero-foot .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 22%, transparent); }

.login-hero-img {
  width: 100%;
  max-width: 460px;
  height: auto;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  background: var(--bg-card);
}

@keyframes orbFloat {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50%      { transform: translate3d(0, 22px, 0) scale(1.06); }
}

@media (prefers-reduced-motion: reduce) {
  .hero-orb { animation: none; }
  .login-hero { animation: none; }
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
    gap: 24px;
    padding-top: 40px;
    padding-bottom: 40px;
    align-content: start;
  }

  .login-hero {
    display: none;
  }

  .login-card {
    max-width: 420px;
    margin: 0 auto;
  }
}

.login-card {
  width: 100%;
  max-width: 420px;
  justify-self: center;
  background: var(--bg-card);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.login-header {
  background: linear-gradient(135deg, var(--primary), var(--primary-dark));
  padding: 40px 32px;
  text-align: center;
  color: #fff;
}

.login-header img {
  height: 96px;
  margin-bottom: 16px;
}

.login-header h1 {
  font-size: 24px;
  margin-bottom: 6px;
}

.login-header p {
  opacity: 0.9;
  font-size: 14px;
}

.login-body {
  padding: 32px;
}

.login-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 4px;
}

.login-tab {
  flex: 1;
  padding: 10px;
  text-align: center;
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  color: var(--text-secondary);
  transition: var(--transition);
}

.login-tab.active {
  background: var(--bg-card);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

/* 首页 */
.hero-section {
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-hover) 100%);
  border-radius: var(--radius-xl);
  padding: 40px;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: center;
  margin-bottom: 24px;
  border: 1px solid var(--border-color);
}

.hero-content h1 {
  font-size: 32px;
  margin-bottom: 16px;
  line-height: 1.2;
}

.hero-content p {
  color: var(--text-secondary);
  font-size: 16px;
  margin-bottom: 24px;
}

.hero-image {
  text-align: center;
}

.hero-image img {
  max-width: 100%;
  max-height: 320px;
  border-radius: var(--radius-lg);
}

/* 步骤条 */
.steps-bar {
  display: flex;
  justify-content: space-between;
  margin-bottom: 32px;
  position: relative;
}

.steps-bar::before {
  content: "";
  position: absolute;
  top: 18px;
  left: 40px;
  right: 40px;
  height: 3px;
  background: var(--border-color);
  z-index: 0;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 1;
  cursor: pointer;
}

.step-number {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  transition: var(--transition);
}

.step.active .step-number {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.step.completed .step-number {
  background: var(--success);
  border-color: var(--success);
  color: #fff;
}

.step-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* 报告 */
.report-preview {
  background: #fff;
  color: #1a1a2e;
  padding: 48px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.report-section {
  margin-bottom: 32px;
}

.report-section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--secondary);
  border-left: 4px solid var(--primary);
  padding-left: 12px;
  margin-bottom: 16px;
}

/* ============ 报告美化（补全缺失样式类，统一排版观感） ============ */
.report-doc {
  line-height: 1.8;
  font-size: 14px;
  color: #1a1a2e;
}
.report-doc p { line-height: 1.85; margin: 0; }
.report-section { margin-bottom: 30px; }

/* 章节标题（report.js 使用 class="report-h3"） */
.report-h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 16px;
  padding: 10px 14px;
  background: var(--primary-bg);
  border-left: 4px solid var(--primary);
  border-radius: 8px;
}
.report-h3::before {
  content: "";
  width: 6px; height: 18px;
  border-radius: 3px;
  background: linear-gradient(var(--primary), var(--primary-dark));
  flex: 0 0 auto;
}
.report-section-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
  flex-shrink: 0;
  background: radial-gradient(circle at center, rgba(242, 101, 34, 0.10) 0%, transparent 70%);
}
.report-banner-icon-img,
.report-aerobic-banner-img {
  display: block;
  width: 140px;
  height: 90px;
  object-fit: contain;
  border-radius: 10px;
}
.report-banner-icon-img.banner-nutrition {
  width: 110px;
  height: 110px;
}
@media print {
  .report-section-icon { width: 22px; height: 22px; border-radius: 4px; margin-right: 6px; }
  .report-banner-icon-img,
  .report-aerobic-banner-img { width: 110px; height: 70px; }
  .report-banner-icon-img.banner-nutrition { width: 80px; height: 80px; }
}

/* 3D 科技风格大数据展示页 */
.bigdata-page {
  background: radial-gradient(ellipse at 20% 0%, rgba(30, 58, 138, 0.25), transparent 60%),
              radial-gradient(ellipse at 80% 100%, rgba(6, 182, 212, 0.12), transparent 50%),
              linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  color: #e2e8f0;
  padding: 24px;
  border-radius: 16px;
  min-height: calc(100vh - 80px);
  border: 1px solid rgba(56, 189, 248, 0.12);
  box-shadow: inset 0 0 80px rgba(56, 189, 248, 0.06);
}
.bigdata-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 22px;
}
.bigdata-title {
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 6px;
  background: linear-gradient(90deg, #38bdf8, #22d3ee, #818cf8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  letter-spacing: 1px;
}
.bigdata-subtitle { margin: 0; font-size: 13.5px; color: #94a3b8; }
.bigdata-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.bigdata-date { font-size: 13px; color: #64748b; font-family: monospace; }
.bigdata-demo-badge {
  display: inline-block;
  vertical-align: middle;
  margin-left: 10px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  letter-spacing: 0.5px;
}
.bigdata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.bigdata-card {
  background: rgba(30, 41, 59, 0.55);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 16px;
  padding: 18px;
  transform-style: preserve-3d;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s;
  box-shadow: 0 8px 24px rgba(2, 8, 20, 0.35), 0 0 0 rgba(56, 189, 248, 0);
  position: relative;
  overflow: hidden;
}
.bigdata-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, #38bdf8, transparent);
  opacity: 0.7;
}
.bigdata-card:hover {
  transform: translateY(-6px) rotateX(2deg);
  box-shadow: 0 16px 40px rgba(2, 8, 20, 0.45), 0 0 24px rgba(56, 189, 248, 0.12);
}
.bigdata-kpi .bigdata-label { font-size: 12.5px; color: #94a3b8; margin-bottom: 8px; }
.bigdata-kpi .bigdata-value {
  font-size: 34px; font-weight: 800;
  background: linear-gradient(180deg, #f0f9ff, #38bdf8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.bigdata-kpi .bigdata-trend { font-size: 12px; color: #64748b; margin-top: 6px; }
.bigdata-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
}
.bigdata-chart-card .bigdata-card-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: #e2e8f0;
}
.bigdata-chart-row {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.bigdata-legend { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: #cbd5e1; }
.bigdata-legend span {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 3px;
  margin-right: 8px;
}
.bigdata-funnel { display: flex; flex-direction: column; gap: 10px; }
.bigdata-funnel-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.12);
  font-size: 13px;
}
.bigdata-funnel-item span { color: #94a3b8; }
.bigdata-funnel-item b { color: #38bdf8; font-size: 16px; }

/* 封面：品牌渐变 + 吉祥物水印 + 机构名 + 报告编号 */
.report-cover {
  position: relative;
  text-align: center;
  padding: 34px 24px 24px;
  margin-bottom: 26px;
  border-bottom: 2px solid rgba(242, 101, 34, 0.18);
  background:
    radial-gradient(120% 80% at 50% -10%, rgba(242, 101, 34, 0.12), transparent 60%),
    linear-gradient(180deg, rgba(242, 101, 34, 0.06), transparent 70%);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  overflow: hidden;
}
.report-cover::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 5px;
  background: linear-gradient(90deg, var(--primary), var(--primary-light), var(--primary-dark));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
.report-cover-watermark {
  position: absolute;
  right: -28px; bottom: -34px;
  width: 150px; height: 150px;
  object-fit: contain;
  opacity: 0.08;
  pointer-events: none;
}
.report-cover-org {
  font-size: 13px; letter-spacing: 0.12em; color: var(--primary);
  font-weight: 700; margin-bottom: 10px; text-transform: none;
}
.report-cover h1 { font-size: 23px; margin: 8px 0 5px; color: #1a1a2e; letter-spacing: 0.02em; }
.report-cover h2 { font-size: 15.5px; color: #475569; font-weight: 600; margin: 0; }
.report-cover-meta {
  display: flex; gap: 16px; justify-content: center; margin-top: 14px;
  font-size: 13px; color: #475569; flex-wrap: wrap;
}
.report-cover-meta span {
  background: var(--primary-bg);
  color: var(--primary);
  padding: 5px 14px;
  border-radius: 999px;
  font-weight: 600;
}
.report-cover-no {
  display: inline-block;
  margin-top: 12px;
  font-size: 12px;
  color: #94a3b8;
  letter-spacing: 0.04em;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  padding: 3px 12px;
  border-radius: 8px;
}

/* 生活方式总览：吉祥物评分 + 雷达图 + 摘要 */
.life-overview {
  display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
  margin-bottom: 18px;
}
.life-radar { flex: 0 0 260px; max-width: 260px; }
.life-summary {
  flex: 1; min-width: 240px; font-size: 14px; line-height: 1.85; color: var(--text-secondary);
  margin: 0; padding-left: 4px; border-left: 3px solid var(--primary); padding: 4px 0 4px 14px;
}

/* 基础信息指标卡片 */
.report-meta-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px;
  margin: 4px 0 10px;
}
.report-meta-grid > div {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 10px 12px;
  transition: transform .2s ease, box-shadow .2s ease;
}
.report-meta-grid > div:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.report-meta-grid > div span {
  display: block; font-size: 11.5px; color: var(--text-muted); letter-spacing: .03em;
}
.report-meta-grid > div b {
  display: block; font-size: 15px; color: var(--text-primary); font-weight: 700; margin-top: 3px;
  word-break: break-all;
}

/* 数据表（方案/计划等） */
.report-doc table.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
  margin: 6px 0 14px;
  border: 1px solid #eef2f7;
  border-radius: 10px;
  overflow: hidden;
}
.report-doc table.data-table th {
  background: var(--primary-bg);
  color: var(--text-secondary);
  font-weight: 700;
  text-align: left;
  padding: 10px 14px;
  border-bottom: 2px solid var(--primary);
  font-size: 12.5px;
  white-space: nowrap;
}
.report-doc table.data-table td {
  padding: 9px 14px;
  border-bottom: 1px solid #eef2f7;
  color: #334155;
}
.report-doc table.data-table tr:nth-child(even) td { background: #fafbfc; }
.report-doc table.data-table tr:hover td { background: var(--primary-bg); }

/* 动作卡片（方案库 / 柔韧 / 平衡） */
.report-ex-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 13.5px;
  color: var(--text-secondary);
  height: 100%;
}
.report-ex-card b { display: block; color: var(--text-primary); margin-bottom: 5px; font-size: 14px; }
.report-ex-card p { margin: 0; line-height: 1.7; color: var(--text-secondary); }
.report-ex-card svg { margin-bottom: 6px; }

/* 报告内章节装饰图容器 */
.report-banner {
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 10px;
  margin-bottom: 14px;
}
/* 图标两侧装饰元素：点线 + 光点，填充空白、提升科技质感 */
.report-banner::before,
.report-banner::after {
  content: "";
  flex: 1 1 0;
  align-self: center;
  height: 40px;
  max-width: 230px;
  margin: 0 18px;
  background-repeat: no-repeat;
  background-image:
    /* 中部连接细线 */
    linear-gradient(90deg, transparent, rgba(242, 101, 34, 0.30) 38%, rgba(242, 101, 34, 0.30) 62%, transparent),
    /* 主光点 */
    radial-gradient(circle, rgba(242, 101, 34, 0.55) 3px, transparent 4px),
    /* 次光点 */
    radial-gradient(circle, rgba(242, 101, 34, 0.35) 2.5px, transparent 3.5px),
    radial-gradient(circle, rgba(242, 101, 34, 0.30) 2px, transparent 3px);
  background-size: 100% 2px, 8px 8px, 6px 6px, 6px 6px;
  background-position: center, 14% center, 52% 26%, 86% 70%;
  opacity: 0.75;
}
.report-banner-icon-img,
.report-aerobic-banner-img {
  position: relative;
  z-index: 1;
  display: block;
  width: 140px;
  height: 90px;
  object-fit: contain;
  border-radius: 10px;
  background: radial-gradient(circle at center, rgba(242, 101, 34, 0.10) 0%, transparent 72%);
}
.report-banner-icon-img.banner-nutrition {
  width: 110px;
  height: 110px;
}

/* 肌力解读小标题（等速/等张卡片头部） */
.report-strength-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14.5px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 14px;
  padding: 9px 14px;
  background: #f8fafc;
  border-radius: 10px;
  border-left: 4px solid var(--primary);
}
.report-strength-head b { color: var(--primary-dark); }

/* 方案报告：指标 KPI 行 */
.report-kpi-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.report-kpi {
  flex: 1 1 140px; min-width: 120px;
  background: linear-gradient(135deg, rgba(242, 101, 34, 0.10), rgba(242, 101, 34, 0.02));
  border: 1px solid rgba(242, 101, 34, 0.18);
  border-radius: 12px; padding: 12px 14px;
}
.report-kpi.has-icon {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.report-kpi-icon {
  width: 72px;
  height: 72px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 8px;
}
.report-kpi-text { min-width: 0; }
.report-kpi b { display: block; font-size: 20px; font-weight: 800; color: var(--primary-dark); line-height: 1.2; }
.report-kpi span { display: block; font-size: 11.5px; color: #64748b; margin-top: 4px; }

/* 方案报告：子标题 */
.report-sub { font-size: 14px; font-weight: 700; color: #334155; margin: 18px 0 10px; }
.report-sub:first-child { margin-top: 0; }

/* 方案报告：三餐卡片 */
.report-meals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.report-meal {
  border: 1px solid #eef2f7; border-radius: 12px; padding: 12px 14px; background: #f8fafc;
}
.report-meal-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.report-meal-head strong { font-size: 14px; color: #1a1a2e; }
.report-meal-meta { font-size: 12px; color: #94a3b8; margin: 4px 0 8px; }
.report-meal-macros { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #475569; }
.report-meal-macros span { background: #eef2f7; border-radius: 6px; padding: 2px 8px; }
.report-meal-tip { font-size: 12px; color: #64748b; line-height: 1.6; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; }

/* 方案报告：动作/训练卡片网格 */
.report-plan-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.report-ex-no {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: #fff;
  font-size: 12px; font-weight: 700; margin-bottom: 8px;
}
.report-ex-badge {
  display: inline-block; font-size: 11.5px; font-weight: 700; color: #fff;
  background: var(--primary); border-radius: 999px; padding: 2px 10px; margin-bottom: 8px;
}
.report-ex-diagram { width: 100%; max-width: 120px; margin: 2px 0 8px; }
.report-ex-diagram svg { width: 100%; height: auto; }
.report-caution { color: #dc2626 !important; font-size: 12.5px; margin-top: 6px; }

/* 方案报告：安全提示列表 */
.report-safety { margin: 12px 0 0; padding-left: 20px; font-size: 12.8px; line-height: 1.95; color: #475569; }
.report-safety li { margin-bottom: 2px; }

@media (max-width: 720px) {
  .report-meals, .report-plan-cards { grid-template-columns: 1fr; }
}

/* 签名 / 页脚 */
.report-sign {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-top: 30px;
  padding-top: 16px;
  border-top: 1px dashed #cbd5e1;
  font-size: 14px;
  color: #334155;
}
.report-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  line-height: 1.6;
}

/* 通用文字色（报告与页面共用） */
.text-muted { color: var(--text-muted); }

/* 报告正文容器与封面（限制 logo 尺寸，避免挤压正文） */
.report-doc {
  background: #fff;
  color: #1a1a2e;
  padding: 40px;
  border-radius: var(--radius-lg);
  max-width: 920px;
  margin: 0 auto;
  box-shadow: var(--shadow);
}
.report-cover {
  text-align: center;
  padding-bottom: 20px;
  margin-bottom: 24px;
  border-bottom: 2px solid rgba(242, 101, 34, 0.18);
}
.report-logo {
  max-height: 96px;
  width: auto;
  margin: 0 auto 14px;
  display: block;
  object-fit: contain;
}
.report-cover h1 { font-size: 22px; margin: 6px 0 4px; color: #1a1a2e; }
.report-cover h2 { font-size: 15px; color: #475569; font-weight: 600; margin: 0; }
.report-cover-meta {
  display: flex; gap: 22px; justify-content: center; margin-top: 12px;
  font-size: 13px; color: #475569; flex-wrap: wrap;
}

/* 等速录入表格（按官方报告格式） */
.iso-entry-wrap { overflow-x: auto; }
.iso-entry-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  min-width: 920px;
}
.iso-entry-table th, .iso-entry-table td {
  border: 1px solid var(--border-color);
  padding: 6px 8px;
  text-align: center;
  vertical-align: middle;
}
.iso-entry-table thead th {
  background: var(--bg-hover);
  font-weight: 700;
  color: var(--text-secondary);
  position: sticky;
  top: 0;
}
.iso-entry-table .iso-row-label {
  background: var(--bg-hover);
  text-align: left;
  white-space: nowrap;
  font-weight: 700;
  color: var(--text-primary);
}
.iso-entry-table .iso-row-label small { display:block; font-weight:400; color:var(--text-muted); font-size:10px; }
.iso-entry-table input {
  width: 78px;
  border: 1px solid transparent;
  background: transparent;
  padding: 5px 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-primary);
  border-radius: 6px;
}
.iso-entry-table input:focus { border-color: var(--primary); background: var(--bg-card); outline: none; }

/* 报告管理中心：四类报告卡片 + 打印舞台 */
.report-cats-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-top: 24px; margin-bottom: 12px; flex-wrap: wrap;
  padding-bottom: 10px; border-bottom: 2px solid rgba(242, 101, 34, 0.18);
}
.report-cats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;
}
.report-cat-card {
  border: 1px solid var(--border-color); border-radius: var(--radius-lg);
  background: var(--bg-card); padding: 16px; display: flex; flex-direction: column; gap: 8px;
  position: relative;
}
.report-cat-card .report-cat-check {
  font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; cursor: pointer;
}
.report-cat-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; }
.report-cat-card .btn { align-self: flex-start; }
.report-divider { border: none; border-top: 1px dashed var(--border-color); margin: 24px 0; }

#report-print-stage { display: none; }
@page { size: A4; margin: 14mm 13mm; }

@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #fff !important; }
  .app-shell, .no-print { display: none !important; }
  #report-print-stage { display: block !important; position: static; width: 100%; padding: 0; margin: 0; }
  #report-print-stage .report-doc { max-width: 100%; margin: 0; padding: 0; box-shadow: none; border-radius: 0; background: #fff; }
  /* 不要整段避免分页（会导致大块留白），仅保护卡片/表格行不被拦腰截断 */
  .report-section { break-inside: auto; page-break-inside: auto; }
  .report-meta-grid > div, .report-ex-card, .ls-advice-block, .report-cat-card,
  .report-kpi, .report-meal, .dim-cell, .mascot-score-ring, .life-radar,
  .roadmap-phase, .report-strength-head { break-inside: avoid; page-break-inside: avoid; }
  table.data-table { break-inside: auto; }
  table.data-table tr { break-inside: avoid; page-break-inside: avoid; }
  .report-h3 { break-after: avoid; page-break-after: avoid; }
  .report-cover { break-inside: avoid; }
  img { max-width: 100% !important; }
  /* 表格/正文字号收敛，确保 A4 不溢出 */
  .report-doc table.data-table { font-size: 11.5px; }
  .report-doc table.data-table th, .report-doc table.data-table td { padding: 7px 10px; }
  .report-doc p, .report-doc li { font-size: 12.5px; line-height: 1.7; }
  .report-kpi b { font-size: 17px; }
  .report-kpi-icon { width: 48px; height: 48px; }
  .report-kpi.has-icon { gap: 8px; padding: 8px 10px; }
  .report-ex-card svg, .report-ex-diagram svg { max-height: 130px; }
  /* 打印时弱化横幅装饰，节省墨水、保持清爽 */
  .report-banner::before, .report-banner::after { opacity: 0.4; }
  .report-banner-icon-img, .report-aerobic-banner-img { background: radial-gradient(circle at center, rgba(242, 101, 34, 0.06) 0%, transparent 72%); }
  .report-section-icon { background: radial-gradient(circle at center, rgba(242, 101, 34, 0.06) 0%, transparent 70%); }
}

select.disabled-select,
select:disabled {
  background-color: var(--bg-secondary);
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.75;
}

/* 设备卡片 */
.device-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  transition: var(--transition);
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.device-card img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
}

.device-info {
  flex: 1;
}

.device-name {
  font-weight: 700;
  margin-bottom: 6px;
}

.device-meta {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 图表 */
.chart-container {
  height: 300px;
  position: relative;
}

/* 周计划表 */
.week-schedule {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
}

.day-cell {
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  padding: 14px;
  text-align: center;
  min-height: 120px;
}

.day-name {
  font-weight: 700;
  margin-bottom: 8px;
}

.day-tag {
  display: block;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
  font-weight: 600;
}

.day-tag.aerobic { background: rgba(59, 130, 246, 0.15); color: #2563eb; }
.day-tag.resistance { background: rgba(242, 101, 34, 0.15); color: #d85416; }
.day-tag.flexibility { background: rgba(34, 197, 94, 0.15); color: #16a34a; }
.day-tag.rest { background: rgba(148, 163, 184, 0.15); color: #64748b; }
.day-tag.balance { background: rgba(168, 85, 247, 0.15); color: #9333ea; }

/* Toast */
.toast-container {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast {
  padding: 14px 20px;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  color: #fff;
  font-weight: 500;
  min-width: 280px;
  animation: slideIn 0.3s ease;
}

.toast.success { background: var(--success); }
.toast.error { background: var(--danger); }
.toast.warning { background: var(--warning); color: #1a1a2e; }
.toast.info { background: var(--info); }

/* ==================== 设计系统展示页 ==================== */
.styleguide-page { padding: var(--space-6) var(--space-8) var(--space-16); max-width: 1180px; margin: 0 auto; }
.sg-header { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-4); flex-wrap: wrap; margin-bottom: var(--space-8); padding-bottom: var(--space-5); border-bottom: 1px solid var(--border-color); }
.sg-h1 { font-size: var(--fs-3xl); font-weight: var(--fw-extrabold); letter-spacing: -0.01em; }
.sg-sub { color: var(--text-muted); font-size: var(--fs-base); margin-top: var(--space-2); }
.sg-header-actions { display: flex; align-items: center; gap: var(--space-3); }
.sg-section { margin-bottom: var(--space-12); }
.sg-h2 { font-size: var(--fs-2xl); font-weight: var(--fw-bold); margin-bottom: var(--space-5); }
.sg-h3 { font-size: var(--fs-lg); font-weight: var(--fw-semibold); color: var(--text-secondary); margin: var(--space-6) 0 var(--space-3); }
.sg-note { color: var(--text-muted); font-size: var(--fs-sm); margin-bottom: var(--space-4); }

.sg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--space-3); }
.sg-swatch { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius); overflow: hidden; }
.sg-color-block { height: 56px; }
.sg-color-block--on { display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 18px; }
.sg-swatch-name { font-size: 11px; font-weight: 600; color: var(--text-secondary); padding: var(--space-2) var(--space-2) 0; word-break: break-all; }
.sg-swatch-val { font-size: 11px; color: var(--text-muted); padding: 2px var(--space-2) var(--space-2); font-family: var(--font-mono); }

.sg-chip { display: flex; flex-direction: column; gap: 4px; padding: var(--space-3) var(--space-4); border-radius: var(--radius); color: #0f172a; min-width: 120px; }
.sg-chip code { font-size: 11px; opacity: 0.6; font-family: var(--font-mono); }

.sg-demo-row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
.sg-stack { display: flex; flex-direction: column; gap: var(--space-3); }

.sg-type { display: flex; flex-direction: column; gap: var(--space-3); }
.sg-type-row { display: flex; align-items: baseline; gap: var(--space-4); border-bottom: 1px dashed var(--border-color); padding-bottom: var(--space-3); }
.sg-type-sample { flex: 1; }
.sg-type-meta { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); min-width: 220px; text-align: right; }
.sg-type-name { color: var(--text-secondary); font-family: var(--font-sans); font-weight: 600; margin-top: 2px; }
.sg-weight { font-size: var(--fs-lg); }

.sg-space { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; }
.sg-space-item { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
.sg-space-box { background: var(--primary); border-radius: var(--radius-sm); }

.sg-radii { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.sg-radius-item, .sg-shadow-item { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 11px; color: var(--text-muted); }
.sg-radius-box { width: 72px; height: 72px; background: var(--primary-100); border: 2px solid var(--primary); }
.sg-shadows { display: flex; flex-wrap: wrap; gap: var(--space-5); align-items: flex-start; }
.sg-shadow-card { width: 120px; height: 80px; background: var(--bg-card); border-radius: var(--radius); border: 1px solid var(--border-color); }

.sg-motion { display: flex; gap: var(--space-4); margin-bottom: var(--space-4); }
.sg-motion-box { width: 120px; height: 80px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: #fff; font-weight: 700; border-radius: var(--radius); cursor: pointer; }
.sg-motion-box:hover { transform: translateY(-6px) scale(1.04); }
.sg-motion-spring:hover { transform: translateY(-8px) rotate(-2deg); }
.sg-duration-table { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-2); font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }

.sg-card-row { display: flex; flex-wrap: wrap; gap: var(--space-4); }
.sg-card-row .card { flex: 1; min-width: 260px; }
.sg-modal-preview { position: relative; height: 300px; border: 1px dashed var(--border-color); border-radius: var(--radius-lg); overflow: hidden; }
.sg-modal-preview .modal-overlay { position: absolute; background: var(--bg-overlay); }
.sg-modal-preview .modal { max-height: none; }
.sg-toast-preview { position: relative; display: flex; flex-direction: column; gap: 10px; padding: var(--space-4); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* 模态框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-xl);
}

.modal-header {
  flex: 0 0 auto;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-body {
  padding: 24px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.modal-footer {
  flex: 0 0 auto;
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: var(--bg-card);
}

/* 打印样式 */
@media print {
  .no-print, .sidebar, .topbar, .steps-bar, .btn, .toast-container, .modal-overlay {
    display: none !important;
  }
  .main-area {
    margin-left: 0 !important;
  }
  .content-area {
    padding: 0 !important;
  }
  .report-preview {
    box-shadow: none;
    padding: 0;
  }
  .card {
    break-inside: avoid;
  }
  body {
    background: #fff;
  }
}

/* 移动端 */
.mobile-menu-btn {
  display: none;
  background: none;
  color: var(--text-primary);
  font-size: 24px;
}

@media (max-width: 900px) {
  .sidebar {
    transform: translateX(-100%);
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .main-area {
    margin-left: 0;
  }
  .mobile-menu-btn {
    display: block;
  }
  .hero-section {
    grid-template-columns: 1fr;
  }
  .week-schedule {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* 运动示意图 */
.exercise-diagram {
  width: 100%;
  height: 160px;
  background: linear-gradient(135deg, #f8fafc, #e2e8f0);
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  position: relative;
  overflow: hidden;
}

.exercise-diagram svg {
  width: 80%;
  height: 80%;
}

/* 红绿灯食物表 */
.traffic-light-table td:first-child {
  font-weight: 600;
}

.light-green { color: #16a34a; font-weight: 700; }
.light-yellow { color: #d97706; font-weight: 700; }
.light-red { color: #dc2626; font-weight: 700; }

/* ===================================================================
   液态玻璃皮肤系统（Skin Engine · 追加于原 .bigdata-* 之后，同名覆盖）
   =================================================================== */
/* 皮肤背景直接驱动 body（多层级渐变含光球），切皮肤即整页换色，玻璃面板可折射 */
body.skin-on { background: var(--bg-body); transition: background 0.5s var(--ease-out); }
body.skin-on.tex-mesh { background-size: 200% 200%, 200% 200%, 200% 200%; animation: skinMesh 26s ease-in-out infinite; }
@keyframes skinMesh {
  0%, 100% { background-position: 0% 0%, 100% 100%, 0% 0%; }
  50% { background-position: 100% 0%, 0% 100%, 100% 100%; }
}

/* 玻璃面板基类（可独立复用） */
.glass-panel {
  background: var(--glass-bg, rgba(255,255,255,0.06));
  backdrop-filter: blur(var(--glass-blur, 22px)) saturate(var(--glass-sat, 180%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 22px)) saturate(var(--glass-sat, 180%));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.18));
  border-radius: var(--radius-xl);
  box-shadow: 0 10px 34px rgba(2,6,23,0.38), inset 0 1px 0 var(--glass-highlight, rgba(255,255,255,0.28));
  position: relative; overflow: hidden;
}
.glass-panel::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(135deg, var(--glass-highlight, rgba(255,255,255,0.28)), transparent 42%);
  opacity: 0.5;
}

/* 质感模式（作用于 body，全局继承） */
body.tex-liquid { --glass-blur: 26px; --glass-sat: 180%; }
body.tex-frost  { --glass-blur: 13px; --glass-sat: 120%; }
body.tex-solid  { --glass-blur: 0px;  --glass-sat: 100%; }
body.tex-solid .glass-panel::after,
body.tex-solid .bigdata-card::after { display: none; }

/* 网格扫描覆盖层（限定旗舰看板，避免影响整站） */
body.tex-grid .bigdata-page::after {
  content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background-image:
    linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 28px 28px;
  -webkit-mask-image: radial-gradient(circle at 50% 35%, #000 18%, transparent 80%);
  mask-image: radial-gradient(circle at 50% 35%, #000 18%, transparent 80%);
}

/* ---------- 大数据健康看板（液态玻璃重写） ---------- */
.bigdata-page {
  position: relative;
  background: var(--glass-bg, rgba(255,255,255,0.06));
  color: var(--text-primary);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  min-height: calc(100vh - 80px);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.18));
  backdrop-filter: blur(var(--glass-blur, 22px)) saturate(var(--glass-sat, 180%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 22px)) saturate(var(--glass-sat, 180%));
  box-shadow: 0 20px 60px rgba(2,6,23,0.42);
  overflow: hidden;
}

.bigdata-hero { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: var(--space-4); margin-bottom: var(--space-6); position: relative; z-index: 1; }
.bigdata-title {
  font-size: 26px; font-weight: 800; margin: 0 0 6px;
  background: linear-gradient(90deg, var(--skin-primary), var(--skin-accent), var(--skin-primary-light));
  -webkit-background-clip: text; background-clip: text; color: transparent; letter-spacing: 1px;
}
.bigdata-subtitle { margin: 0; font-size: 13.5px; color: var(--text-muted); }
.bigdata-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.bigdata-date { font-size: 13px; color: var(--text-muted); font-family: monospace; }
.bigdata-demo-badge {
  display: inline-block; vertical-align: middle; margin-left: 10px;
  padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;
  color: #0f172a; background: linear-gradient(90deg, #fbbf24, #f59e0b); letter-spacing: 0.5px;
}
.bigdata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-5); position: relative; z-index: 1; }
.bigdata-card {
  --glass-blur: 26px; --glass-sat: 185%; --glass-border: rgba(255,255,255,0.20); --glass-highlight: rgba(255,255,255,0.28);
  background: var(--glass-bg, rgba(255,255,255,0.06));
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  padding: 18px;
  box-shadow: 0 10px 30px rgba(2,8,20,0.35), inset 0 1px 0 var(--glass-highlight);
  position: relative; overflow: hidden;
  transition: transform var(--dur) var(--ease-out), box-shadow var(--dur) var(--ease-out);
}
.bigdata-card::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, var(--glass-highlight), transparent 42%); opacity: 0.5; }
.bigdata-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--skin-primary), transparent); opacity: 0.7; }
.bigdata-card:hover { transform: translateY(-6px); box-shadow: 0 18px 44px rgba(2,8,20,0.45), 0 0 26px var(--skin-glow); }
.bigdata-kpi .bigdata-label { font-size: 12.5px; color: var(--text-muted); margin-bottom: 8px; }
.bigdata-kpi .bigdata-value {
  font-size: 32px; font-weight: 800; letter-spacing: 0.5px;
  background: var(--bigdata-value-grad, linear-gradient(180deg, #ffffff, var(--skin-primary)));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.bigdata-kpi .bigdata-trend { font-size: 12px; color: var(--text-muted); margin-top: 6px; }
.bigdata-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--space-4); position: relative; z-index: 1; }
.bigdata-chart-card .bigdata-card-title { margin: 0 0 14px; font-size: 15px; font-weight: 700; color: var(--text-primary); }
.bigdata-chart-row { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
.bigdata-legend { display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: var(--text-secondary); }
.bigdata-legend span { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 8px; }
.bigdata-funnel { display: flex; flex-direction: column; gap: 10px; }
.bigdata-funnel-item {
  display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 10px;
  background: var(--glass-bg, rgba(255,255,255,0.06)); border: 1px solid var(--glass-border, rgba(255,255,255,0.16)); font-size: 13px;
}
.bigdata-funnel-item span { color: var(--text-muted); }
.bigdata-funnel-item b { color: var(--skin-primary); font-size: 16px; }

/* ---------- 皮肤工坊切换器（浮层） ---------- */
.skin-switcher { position: fixed; right: 22px; bottom: 22px; z-index: 1300; font-family: var(--font-sans); }
.skin-fab {
  width: 54px; height: 54px; border-radius: 50%; border: 1px solid var(--glass-border);
  background: var(--glass-bg, rgba(255,255,255,0.6)); backdrop-filter: blur(16px) saturate(160%);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  color: #fff; font-size: 22px; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center; transition: transform var(--dur) var(--ease-spring);
}
.skin-fab:hover { transform: scale(1.08) rotate(8deg); }
.skin-panel {
  position: absolute; right: 0; bottom: 64px; width: 264px;
  background: var(--glass-bg, rgba(255,255,255,0.7)); backdrop-filter: blur(26px) saturate(185%);
  -webkit-backdrop-filter: blur(26px) saturate(185%);
  border: 1px solid var(--glass-border); border-radius: var(--radius-lg);
  box-shadow: 0 24px 60px rgba(0,0,0,0.55), inset 0 1px 0 var(--glass-highlight);
  padding: 14px; opacity: 0; transform: translateY(12px) scale(0.96); pointer-events: none;
  transition: opacity var(--dur) var(--ease-out), transform var(--dur) var(--ease-out);
}
.skin-switcher.open .skin-panel { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
.skin-panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; color: var(--text-primary); font-weight: 700; font-size: 14px; }
.skin-close { background: none; border: none; color: var(--text-muted); font-size: 20px; line-height: 1; cursor: pointer; }
.skin-section { margin-bottom: 12px; }
.skin-section-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.skin-swatches { display: flex; gap: 10px; flex-wrap: wrap; }
.skin-swatch { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform var(--dur) var(--ease-spring), border-color var(--dur); }
.skin-swatch:hover { transform: scale(1.12); }
.skin-swatch.active { border-color: var(--text-primary); box-shadow: 0 0 0 3px var(--skin-glow); }
.skin-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.skin-chip {
  padding: 6px 12px; border-radius: 999px; border: 1px solid var(--glass-border);
  background: rgba(255,255,255,0.06); color: var(--text-secondary); font-size: 12.5px; cursor: pointer;
  transition: all var(--dur) var(--ease-out);
}
.skin-chip:hover { background: rgba(255,255,255,0.12); }
.skin-chip.active { background: var(--skin-primary); color: #fff; border-color: var(--skin-primary); box-shadow: 0 0 14px var(--skin-glow); }

/* 进度环 */
.score-ring {
  width: 140px;
  height: 140px;
  margin: 0 auto;
  position: relative;
}

.score-ring svg {
  transform: rotate(-90deg);
}

.score-ring-bg {
  fill: none;
  stroke: var(--border-color);
  stroke-width: 10;
}

.score-ring-fill {
  fill: none;
  stroke: var(--primary);
  stroke-width: 10;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s ease;
}

.score-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary);
}

.score-label {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 生活方式报告：小Qoo 吉祥物 + 分数（放在吉祥物下方，避免遮挡） */
.mascot-score-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 150px;
}
.mascot-score-ring .score-mascot {
  width: 130px;
  height: 130px;
  object-fit: contain;
}
.mascot-score-text {
  text-align: center;
  line-height: 1.25;
}
.mascot-score-text strong {
  display: block;
  font-size: 26px;
  font-weight: 800;
  color: var(--primary);
}
.mascot-score-text small {
  font-size: 12px;
  color: var(--text-secondary);
}
/* 吉祥物加载失败时的兜底：柔和圆盘 + 保留下方分数 */
.mascot-score-fallback {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffffff, var(--bg-tertiary) 70%);
  border: 1px solid var(--border-color);
}

/* 工具类 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.mt-1 { margin-top: 8px; }
.mt-2 { margin-top: 16px; }
.mt-3 { margin-top: 24px; }
.mb-1 { margin-bottom: 8px; }
.mb-2 { margin-bottom: 16px; }
.mb-3 { margin-bottom: 24px; }
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-2 { gap: 16px; }
.gap-3 { gap: 24px; }
.hidden { display: none !important; }

/* ============ 生活方式报告（独立模块 / 报告管理中心第五类） ============ */
.dim-level { margin-top: 6px; font-size: 12px; font-weight: 600; }
.ls-advice-block {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-left: 5px solid var(--primary);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
}
.ls-advice-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.ls-advice-head b { font-size: 14px; }
.ls-advice-concl { font-size: 13px; line-height: 1.8; color: var(--text-secondary); margin: 0 0 8px; }
.ls-advice-actions { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.85; color: var(--text-secondary); }
.ls-advice-actions li { margin-bottom: 4px; }
.roadmap { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.roadmap-phase { display: flex; gap: 12px; background: var(--bg-hover); border-radius: var(--radius); padding: 14px; }
.roadmap-num {
  flex: 0 0 26px; height: 26px; border-radius: 50%;
  background: var(--primary); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700;
}
.roadmap-body { flex: 1; }
.roadmap-title { font-weight: 700; font-size: 13.5px; }
.roadmap-focus { font-size: 12.5px; color: var(--primary); font-weight: 600; margin: 4px 0; }
.roadmap-body ul { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.8; color: var(--text-secondary); }

/* ============ 肌力标准化解读卡片（等速/等张/综合报告共用） ============ */
.strength-card {
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  padding: 20px;
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--primary);
  box-shadow: var(--shadow-sm);
  margin: 6px 0 18px;
}
.strength-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.strength-ring {
  --score: 0;
  --ring: var(--primary);
  flex: 0 0 auto;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  background:
    radial-gradient(closest-side, var(--bg-card) 68%, transparent 69%),
    conic-gradient(var(--ring) calc(var(--score) * 1%), var(--bg-hover) 0);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}
.strength-ring-num {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.strength-headtext {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.strength-grade {
  font-size: 21px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: .01em;
}
.strength-sub {
  font-size: 13px;
  color: var(--text-secondary);
}
.dim-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.dim-cell {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 12px 14px;
  transition: transform .2s ease, box-shadow .2s ease;
}
.dim-cell:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.dim-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.dim-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}
.dim-score {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-primary);
}
.dim-bar {
  height: 8px;
  border-radius: 99px;
  background: var(--border-color);
  overflow: hidden;
}
.dim-bar span {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.6s ease;
}
.dim-desc {
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.45;
}
.qualitative-box {
  background: var(--bg-hover);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 12px;
}
.qualitative-box strong {
  display: block;
  font-size: 13px;
  color: var(--primary-dark);
  margin-bottom: 8px;
  letter-spacing: .06em;
}
.qual-line {
  font-size: 14px;
  color: var(--text-primary);
  margin: 5px 0;
  line-height: 1.65;
}
.weak-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: var(--radius);
  padding: 12px 14px;
}
.weak-box strong {
  font-size: 13px;
  color: var(--danger);
}

/* ============ 患者只读分享视图 ============ */
.share-view {
  min-height: 100vh;
  background: var(--bg-body);
  display: flex;
  flex-direction: column;
}
.share-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}
.share-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 15px;
  color: var(--text-primary);
}
.share-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}
.share-body {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 24px 16px;
}
.share-body .report-doc {
  max-width: 820px;
  width: 100%;
  box-shadow: var(--shadow-lg);
}
.share-foot {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  padding: 14px;
  border-top: 1px solid var(--border-color);
}
.qr-box {
  display: flex;
  justify-content: center;
  padding: 12px;
  margin: 8px 0 4px;
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
}
.qr-img {
  width: 220px;
  height: 220px;
  image-rendering: pixelated;
}
.form-control {
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  background: var(--bg-input);
  color: var(--text-primary);
  resize: vertical;
}

/* ============ 页面头部 / 报告元数据网格（补齐基础样式，统一浅色观感） ============ */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.page-header .topbar-actions { flex-wrap: wrap; }

.report-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px;
  margin: 6px 0 4px;
}
.report-meta-grid > div {
  background: var(--bg-hover);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.report-meta-grid > div span {
  font-size: 12px;
  color: var(--text-muted);
}
.report-meta-grid > div b {
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 700;
}

/* ============ 移动端适配增强（任务21） ============ */
@media (max-width: 768px) {
  .content-area { padding: 16px 12px; }
  .topbar { padding: 10px 12px; }
  .topbar-actions { flex-wrap: wrap; gap: 8px; }
  .page-header { flex-direction: column; align-items: stretch; gap: 12px; }
  .page-header .topbar-actions { width: 100%; }
  .page-header .topbar-actions .btn { flex: 1 1 auto; }

  .report-doc { padding: 22px 16px; }
  .report-meta-grid { grid-template-columns: repeat(2, 1fr); }
  .report-section { overflow-x: auto; }
  .card-body { overflow-x: auto; }
  table { min-width: 520px; }

  .dim-grid { grid-template-columns: 1fr 1fr; }
  .strength-card { padding: 16px; }
  .strength-head { gap: 12px; }
  .strength-ring { width: 64px; height: 64px; }
  .strength-ring-num { font-size: 22px; }
  .strength-grade { font-size: 18px; }

  .hero-section { padding: 28px 16px; }
  .hero-content h1 { font-size: 26px; }

  .modal { width: calc(100% - 24px); margin: 12px auto; max-height: 90vh; }
  .modal-overlay { padding: 12px; }
  img { max-width: 100%; height: auto; }
}

/* ============ 报告文档：独立于皮肤的令牌作用域 ============
   白纸深字保证打印/阅读可读；强调色(--primary/--primary-bg)随皮肤变化，
   使报告封面/章节/表格/卡片的强调色实时跟随系统皮肤 */
.report-doc {
  --text-primary: #1a1a2e;
  --text-secondary: #475569;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --border-strong: #cbd5e1;
  --bg-card: #ffffff;
  --bg-hover: #f1f5f9;
  --bg-subtle: #f1f5f9;
  --bg-input: #ffffff;
}

/* ============ 全局排版与节奏（统一文字大小比例与间距） ============ */
.content-area { font-size: var(--fs-base); line-height: var(--lh-base); }
.page-header { margin-bottom: var(--space-6); }
.card { padding: var(--space-5); }
h1 { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: 700; }
h2 { font-size: var(--fs-xl); line-height: var(--lh-xl); font-weight: 700; }
h3 { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: 600; }
.bigdata-title { font-size: 24px; }
.hero-content h1 { font-size: var(--fs-2xl); }

@media (max-width: 480px) {
  .report-meta-grid { grid-template-columns: 1fr; }
  .dim-grid { grid-template-columns: 1fr; }
  .sidebar { width: 86vw; }
  .content-area { padding: 12px 8px; }
  .strength-ring { width: 58px; height: 58px; }
  .strength-ring-num { font-size: 20px; }
}
