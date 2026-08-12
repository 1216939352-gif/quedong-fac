/**
 * 液态玻璃皮肤引擎 v3（Liquid Glass Skin Engine）
 * - 5 套配色预设（与视觉设计稿对齐）：温暖橙 / 医疗蓝 / 健康青绿 / 紫罗兰 / 小Qoo萌趣
 * - 每套配色独立支持 亮色 / 暗色 两套基底（通过 Skin.state.mode 切换），彻底解决深浅切换文字/图标被遮
 * - 质感：液态玻璃 / 磨砂 / 网格扫描 / 流光渐变 / 实色
 * - 状态持久化到 localStorage，全局实时生效
 */
(function () {
  'use strict';

  var STORE_KEY = 'qd-skin-v2';

  // 暗色基底令牌
  var DARK = {
    '--bg-sidebar': '#0a0f1e',
    '--bg-card': 'rgba(15,21,40,0.80)',
    '--bg-elevated': 'rgba(22,30,54,0.85)',
    '--bg-hover': 'rgba(255,255,255,0.05)',
    '--bg-input': 'rgba(255,255,255,0.06)',
    '--bg-subtle': 'rgba(255,255,255,0.04)',
    '--bg-overlay': 'rgba(2,6,23,0.65)',
    '--text-primary': '#eaf0ff',
    '--text-secondary': '#aab4d4',
    '--text-muted': '#9aa6c8',
    '--text-inverse': '#0b1020',
    '--border-color': 'rgba(255,255,255,0.10)',
    '--border-strong': 'rgba(255,255,255,0.18)',
    '--sidebar-bg': '#0a0f1e',
    '--sidebar-text': '#cdd6f4',
    '--sidebar-text-muted': '#9aa6c8',
    '--sidebar-brand': '#ffffff',
    '--sidebar-border': 'rgba(255,255,255,0.08)',
    '--sidebar-hover': 'rgba(255,255,255,0.06)',
    '--sidebar-shadow': 'none',
    '--glass-bg': 'rgba(255,255,255,0.06)',
    '--glass-border': 'rgba(255,255,255,0.16)',
    '--glass-highlight': 'rgba(255,255,255,0.28)'
  };
  // 亮色基底令牌
  var LIGHT = {
    '--bg-sidebar': '#ffffff',
    '--bg-card': '#ffffff',
    '--bg-elevated': '#ffffff',
    '--bg-hover': '#f1f5f9',
    '--bg-input': '#ffffff',
    '--bg-subtle': '#f1f5f9',
    '--bg-overlay': 'rgba(15,23,42,0.45)',
    '--text-primary': '#0f172a',
    '--text-secondary': '#475569',
    '--text-muted': '#64748b',
    '--text-inverse': '#ffffff',
    '--border-color': '#e2e8f0',
    '--border-strong': '#cbd5e1',
    '--sidebar-bg': '#ffffff',
    '--sidebar-text': '#334155',
    '--sidebar-text-muted': '#64748b',
    '--sidebar-brand': '#1a1a2e',
    '--sidebar-border': '#eef2f7',
    '--sidebar-hover': 'rgba(242,101,34,0.07)',
    '--sidebar-shadow': '0 0 0 1px rgba(15,23,42,0.04), 0 12px 32px -12px rgba(15,23,42,0.12)',
    '--glass-bg': 'rgba(255,255,255,0.55)',
    '--glass-border': 'rgba(15,23,42,0.10)',
    '--glass-highlight': 'rgba(255,255,255,0.7)'
  };

  function bg(a, b, o1, o2) {
    return 'radial-gradient(42% 42% at 12% 8%, ' + o1 + ' 0%, transparent 62%),' +
           'radial-gradient(46% 46% at 88% 92%, ' + o2 + ' 0%, transparent 62%),' +
           'linear-gradient(135deg, ' + a + ' 0%, ' + b + ' 100%)';
  }

  function withBg(o) {
    o['--bg-body'] = bg(o['--skin-bg-a'], o['--skin-bg-b'], o['--skin-orb-1'], o['--skin-orb-2']);
    return o;
  }

  // 构建每套配色（light / dark 两套完整令牌）
  function build(id, name, light, dark) {
    return {
      id: id, name: name,
      swatch: 'linear-gradient(135deg,' + light['--skin-c1'] + ',' + light['--skin-c2'] + ')',
      base: { light: withBg(Object.assign({}, LIGHT, light)), dark: withBg(Object.assign({}, DARK, dark)) }
    };
  }

  var SCHEMES = [
    /* ① 温暖橙 —— 活力温暖，对老年视力友好 */
    build('orange', '温暖橙',
      { '--primary':'#F59E0B','--primary-dark':'#D97706','--primary-light':'#FBBF24','--accent':'#FB923C','--skin-primary':'#F59E0B',
        '--skin-glow':'rgba(245,158,11,.42)','--skin-orb-1':'rgba(245,158,11,.26)','--skin-orb-2':'rgba(251,146,60,.20)',
        '--skin-bg-a':'#fff7ed','--skin-bg-b':'#fff1e0','--skin-c1':'#F59E0B','--skin-c2':'#FB923C','--skin-c3':'#FBBF24','--skin-c4':'#F97316','--skin-c5':'#FACC15',
        '--primary-bg':'rgba(245,158,11,.14)','--sidebar-active-bg':'rgba(245,158,11,.15)','--sidebar-active-text':'#D97706',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#F59E0B)','--shadow-glow':'0 0 0 4px rgba(245,158,11,.18)' },
      { '--primary':'#FBBF24','--primary-dark':'#F59E0B','--primary-light':'#FCD34D','--accent':'#FB923C','--skin-primary':'#FBBF24',
        '--skin-glow':'rgba(245,158,11,.45)','--skin-orb-1':'rgba(245,158,11,.30)','--skin-orb-2':'rgba(251,146,60,.24)',
        '--skin-bg-a':'#160a02','--skin-bg-b':'#2a1406','--skin-c1':'#F59E0B','--skin-c2':'#FB923C','--skin-c3':'#FBBF24','--skin-c4':'#F97316','--skin-c5':'#FACC15',
        '--primary-bg':'rgba(245,158,11,.16)','--sidebar-active-bg':'rgba(245,158,11,.18)','--sidebar-active-text':'#FBBF24',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#F59E0B)','--shadow-glow':'0 0 0 4px rgba(245,158,11,.22)' }
    ),
    /* ② 医疗蓝 —— 专业冷静，医疗通用信任感 */
    build('blue', '医疗蓝',
      { '--primary':'#2D7FF9','--primary-dark':'#1D4ED8','--primary-light':'#60A5FA','--accent':'#38BDF8','--skin-primary':'#2D7FF9',
        '--skin-glow':'rgba(45,127,249,.40)','--skin-orb-1':'rgba(45,127,249,.24)','--skin-orb-2':'rgba(56,189,248,.20)',
        '--skin-bg-a':'#eff6ff','--skin-bg-b':'#f0f7ff','--skin-c1':'#2D7FF9','--skin-c2':'#38BDF8','--skin-c3':'#3B82F6','--skin-c4':'#0EA5E9','--skin-c5':'#60A5FA',
        '--primary-bg':'rgba(45,127,249,.12)','--sidebar-active-bg':'rgba(45,127,249,.14)','--sidebar-active-text':'#1D4ED8',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#2D7FF9)','--shadow-glow':'0 0 0 4px rgba(45,127,249,.16)' },
      { '--primary':'#60A5FA','--primary-dark':'#3B82F6','--primary-light':'#93C5FD','--accent':'#38BDF8','--skin-primary':'#60A5FA',
        '--skin-glow':'rgba(45,127,249,.42)','--skin-orb-1':'rgba(45,127,249,.28)','--skin-orb-2':'rgba(56,189,248,.24)',
        '--skin-bg-a':'#050b1c','--skin-bg-b':'#0a1730','--skin-c1':'#2D7FF9','--skin-c2':'#38BDF8','--skin-c3':'#3B82F6','--skin-c4':'#0EA5E9','--skin-c5':'#60A5FA',
        '--primary-bg':'rgba(45,127,249,.15)','--sidebar-active-bg':'rgba(45,127,249,.17)','--sidebar-active-text':'#93C5FD',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#2D7FF9)','--shadow-glow':'0 0 0 4px rgba(45,127,249,.20)' }
    ),
    /* ③ 健康青绿 —— 生机康复，贴合肌少症康复主题 */
    build('green', '健康青绿',
      { '--primary':'#10B981','--primary-dark':'#047857','--primary-light':'#34D399','--accent':'#22D3EE','--skin-primary':'#10B981',
        '--skin-glow':'rgba(16,185,129,.40)','--skin-orb-1':'rgba(16,185,129,.22)','--skin-orb-2':'rgba(34,211,238,.18)',
        '--skin-bg-a':'#ecfdf5','--skin-bg-b':'#f0fdf9','--skin-c1':'#10B981','--skin-c2':'#22D3EE','--skin-c3':'#059669','--skin-c4':'#14B8A6','--skin-c5':'#34D399',
        '--primary-bg':'rgba(16,185,129,.12)','--sidebar-active-bg':'rgba(16,185,129,.14)','--sidebar-active-text':'#047857',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#10B981)','--shadow-glow':'0 0 0 4px rgba(16,185,129,.16)' },
      { '--primary':'#34D399','--primary-dark':'#10B981','--primary-light':'#6EE7B7','--accent':'#22D3EE','--skin-primary':'#34D399',
        '--skin-glow':'rgba(16,185,129,.42)','--skin-orb-1':'rgba(16,185,129,.26)','--skin-orb-2':'rgba(34,211,238,.24)',
        '--skin-bg-a':'#04130e','--skin-bg-b':'#06231c','--skin-c1':'#10B981','--skin-c2':'#22D3EE','--skin-c3':'#059669','--skin-c4':'#14B8A6','--skin-c5':'#34D399',
        '--primary-bg':'rgba(16,185,129,.15)','--sidebar-active-bg':'rgba(16,185,129,.17)','--sidebar-active-text':'#6EE7B7',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#10B981)','--shadow-glow':'0 0 0 4px rgba(16,185,129,.20)' }
    ),
    /* ④ 紫罗兰 —— 高级科技，品牌差异化 */
    build('violet', '紫罗兰',
      { '--primary':'#7C3AED','--primary-dark':'#6D28D9','--primary-light':'#A78BFA','--accent':'#DB2777','--skin-primary':'#7C3AED',
        '--skin-glow':'rgba(124,58,237,.38)','--skin-orb-1':'rgba(124,58,237,.22)','--skin-orb-2':'rgba(219,39,119,.18)',
        '--skin-bg-a':'#f5f3ff','--skin-bg-b':'#faf8ff','--skin-c1':'#7C3AED','--skin-c2':'#DB2777','--skin-c3':'#8B5CF6','--skin-c4':'#A855F7','--skin-c5':'#C026D3',
        '--primary-bg':'rgba(124,58,237,.12)','--sidebar-active-bg':'rgba(124,58,237,.14)','--sidebar-active-text':'#6D28D9',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#7C3AED)','--shadow-glow':'0 0 0 4px rgba(124,58,237,.16)' },
      { '--primary':'#A78BFA','--primary-dark':'#7C3AED','--primary-light':'#C4B5FD','--accent':'#DB2777','--skin-primary':'#A78BFA',
        '--skin-glow':'rgba(124,58,237,.40)','--skin-orb-1':'rgba(124,58,237,.28)','--skin-orb-2':'rgba(219,39,119,.22)',
        '--skin-bg-a':'#0b0820','--skin-bg-b':'#1a1038','--skin-c1':'#7C3AED','--skin-c2':'#DB2777','--skin-c3':'#8B5CF6','--skin-c4':'#A855F7','--skin-c5':'#C026D3',
        '--primary-bg':'rgba(124,58,237,.15)','--sidebar-active-bg':'rgba(124,58,237,.17)','--sidebar-active-text':'#C4B5FD',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#7C3AED)','--shadow-glow':'0 0 0 4px rgba(124,58,237,.20)' }
    ),
    /* ⑤ 小Qoo萌趣 —— 取吉祥物蓝/黄/红，亲和活泼 */
    build('qoo', '小Qoo萌趣',
      { '--primary':'#2563EB','--primary-dark':'#1D4ED8','--primary-light':'#60A5FA','--accent':'#FACC15','--skin-primary':'#2563EB',
        '--skin-glow':'rgba(37,99,235,.38)','--skin-orb-1':'rgba(37,99,235,.20)','--skin-orb-2':'rgba(250,204,21,.16)',
        '--skin-bg-a':'#eef4ff','--skin-bg-b':'#f7faff','--skin-c1':'#2563EB','--skin-c2':'#FACC15','--skin-c3':'#EF4444','--skin-c4':'#38BDF8','--skin-c5':'#FBBF24',
        '--primary-bg':'rgba(37,99,235,.12)','--sidebar-active-bg':'rgba(37,99,235,.14)','--sidebar-active-text':'#1D4ED8',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#2563EB)','--shadow-glow':'0 0 0 4px rgba(37,99,235,.16)' },
      { '--primary':'#60A5FA','--primary-dark':'#3B82F6','--primary-light':'#93C5FD','--accent':'#FACC15','--skin-primary':'#60A5FA',
        '--skin-glow':'rgba(37,99,235,.40)','--skin-orb-1':'rgba(37,99,235,.26)','--skin-orb-2':'rgba(250,204,21,.20)',
        '--skin-bg-a':'#050a1c','--skin-bg-b':'#0a1430','--skin-c1':'#2563EB','--skin-c2':'#FACC15','--skin-c3':'#EF4444','--skin-c4':'#38BDF8','--skin-c5':'#FBBF24',
        '--primary-bg':'rgba(37,99,235,.15)','--sidebar-active-bg':'rgba(37,99,235,.17)','--sidebar-active-text':'#93C5FD',
        '--bigdata-value-grad':'linear-gradient(180deg,#fff,#2563EB)','--shadow-glow':'0 0 0 4px rgba(37,99,235,.20)' }
    )
  ];

  /**
   * 质感 v2 —— 5 套高辨识度方案
   * 旧版只改 --glass-blur/--glass-sat，仅 .glass-panel 与 .bigdata-* 消费，
   * 主界面 .card 完全不受影响，导致"切了没反应"。
   * 新版在 styles.css 中通过 body.tex-* 重定义基底令牌（--bg-card/--border-color/
   * --sidebar-* 等），全站 .card/.btn/input/侧边栏自动跟随。
   */
  var TEXTURES = [
    { id: 'glass', name: '液态玻璃', desc: '真半透明毛玻璃，透出背景光球与内高光' },
    { id: 'neu', name: '软浮雕', desc: '新拟态：卡片与底同色，双向阴影塑造凸起' },
    { id: 'paper', name: '纸感', desc: '米白纸纹 + 多层实体投影 + 顶部书签边' },
    { id: 'neon', name: '霓虹', desc: '主题色灯管描边（亮色=日光霓虹 / 暗色=赛博夜视）' },
    { id: 'line', name: '硬线框', desc: '2px 粗描边 + 偏移实心投影，全直角' }
  ];
  var TEX_IDS = TEXTURES.map(function (t) { return t.id; });
  // 旧 id → 新 id，保证老用户 localStorage 平滑迁移，不会落到未定义的质感上
  var LEGACY_TEX = { liquid: 'glass', frost: 'glass', mesh: 'glass', grid: 'neon', solid: 'paper' };
  var LEGACY_CLASSES = ['tex-liquid', 'tex-frost', 'tex-grid', 'tex-mesh', 'tex-solid'];

  var DEFAULT = { scheme: 'orange', texture: 'glass', mode: 'light' };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  // 归一化：迁移旧质感 id，并兜底非法值，避免 body 挂上不存在的 tex-* 类
  function normalize(s) {
    if (!s) return s;
    if (LEGACY_TEX[s.texture]) s.texture = LEGACY_TEX[s.texture];
    if (TEX_IDS.indexOf(s.texture) === -1) s.texture = DEFAULT.texture;
    return s;
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var Skin = {
    SKINS: SCHEMES,
    TEXTURES: TEXTURES,
    state: normalize(Object.assign({}, DEFAULT, load())),

    _scheme: function () {
      for (var i = 0; i < SCHEMES.length; i++) if (SCHEMES[i].id === this.state.scheme) return SCHEMES[i];
      return SCHEMES[0];
    },

    apply: function () {
      var s = this._scheme();
      var mode = this.state.mode === 'dark' ? 'dark' : 'light';
      var toks = s.base[mode] || s.base.light;
      var root = document.documentElement;
      Object.keys(toks).forEach(function (k) { root.style.setProperty(k, toks[k]); });
      root.setAttribute('data-theme', mode); // 亮/暗基底，驱动任何基于属性的 CSS（含文字/图标高对比）
      root.setAttribute('data-scheme', this.state.scheme); // 方案标识（orange/blue/green/violet/qoo），供主题专属样式
      var body = document.body;
      if (body) {
        body.classList.add('skin-on');
        // 清理旧版 + 新版全部质感类，避免多个 tex-* 叠加导致样式互相打架
        LEGACY_CLASSES.forEach(function (c) { body.classList.remove(c); });
        TEX_IDS.forEach(function (id) { body.classList.remove('tex-' + id); });
        body.classList.add('tex-' + this.state.texture);
      }
      save(this.state);
      this._sync();
    },

    applySaved: function () { this.apply(); },
    setScheme: function (id) { this.state.scheme = id; this.apply(); },
    setTexture: function (id) { this.state.texture = id; normalize(this.state); this.apply(); },
    toggleMode: function () { this.state.mode = this.state.mode === 'dark' ? 'light' : 'dark'; this.apply(); },

    _sync: function () {
      var panel = document.getElementById('skin-switcher');
      if (!panel) return;
      panel.querySelectorAll('[data-skin]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-skin') === Skin.state.scheme);
      });
      panel.querySelectorAll('[data-tex]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tex') === Skin.state.texture);
      });
      panel.querySelectorAll('[data-mode]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-mode') === (Skin.state.mode || 'light'));
      });
    },

    mountSwitcher: function () {
      if (document.getElementById('skin-switcher')) return;
      var panel = document.createElement('div');
      panel.id = 'skin-switcher';
      panel.className = 'skin-switcher';

      var swatches = SCHEMES.map(function (s) {
        return '<button type="button" class="skin-swatch" data-skin="' + s.id + '" title="' + s.name + '" style="background:' + s.swatch + '"></button>';
      }).join('');
      var texChips = TEXTURES.map(function (t) {
        return '<button type="button" class="skin-chip" data-tex="' + t.id + '" title="' + (t.desc || t.name) + '">' +
          '<i class="skin-chip-dot tex-dot-' + t.id + '"></i>' + t.name + '</button>';
      }).join('');

      panel.innerHTML =
        '<button type="button" class="skin-fab" id="skin-fab" title="皮肤与质感">🎨</button>' +
        '<div class="skin-panel" id="skin-panel">' +
          '<div class="skin-panel-head"><span>皮肤工坊</span><button type="button" class="skin-close" id="skin-close">×</button></div>' +
          '<div class="skin-section"><div class="skin-section-title">配色预设</div><div class="skin-swatches">' + swatches + '</div></div>' +
          '<div class="skin-section"><div class="skin-section-title">深浅模式</div><div class="skin-modes">' +
            '<button type="button" class="skin-mode-btn" data-mode="light">☀️ 亮色</button>' +
            '<button type="button" class="skin-mode-btn" data-mode="dark">🌙 暗色</button>' +
          '</div></div>' +
          '<div class="skin-section"><div class="skin-section-title">质感</div><div class="skin-chips">' + texChips + '</div></div>' +
        '</div>';
      document.body.appendChild(panel);

      var fab = panel.querySelector('#skin-fab');
      var close = panel.querySelector('#skin-close');
      function setOpen(isOpen) {
        panel.classList.toggle('open', isOpen);
        if (fab) fab.innerHTML = isOpen ? '×' : '🎨';
        if (fab) fab.title = isOpen ? '关闭皮肤面板' : '皮肤与质感';
      }
      fab.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!panel.classList.contains('open'));
      });
      close.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(false);
      });
      // 点击面板外部自动收起
      document.addEventListener('click', function (e) {
        if (panel.classList.contains('open') && !panel.contains(e.target)) setOpen(false);
      });
      // ESC 收起
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && panel.classList.contains('open')) setOpen(false);
      });

      panel.querySelectorAll('[data-skin]').forEach(function (b) {
        b.addEventListener('click', function () { Skin.setScheme(b.getAttribute('data-skin')); });
      });
      panel.querySelectorAll('[data-tex]').forEach(function (b) {
        b.addEventListener('click', function () { Skin.setTexture(b.getAttribute('data-tex')); });
      });
      panel.querySelectorAll('[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () { Skin.state.mode = b.getAttribute('data-mode'); Skin.apply(); });
      });

      this._sync();
    }
  };

  window.Skin = Skin;
})();
