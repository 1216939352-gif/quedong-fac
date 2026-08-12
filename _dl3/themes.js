/**
 * 液态玻璃皮肤引擎（Liquid Glass Skin Engine）
 * - 多套配色预设 scheme：深空蓝 / 极光紫 / 翠光青 / 暖阳橙 / 赛博品红
 * - 多种质感 texture：液态玻璃 / 磨砂 / 网格扫描 / 流光渐变 / 实色
 * - 暗亮模式 mode，复用 data-theme
 * 状态持久化到 localStorage，全局实时生效（依赖 :root 的 --primary / --accent 等令牌）
 */
(function () {
  'use strict';

  var STORE_KEY = 'qd-skin-v1';

  // 配色预设：主色 / 强调 / 光晕 / 背景光球 / 背景渐变 / 分类色板 c1..c5
  var SKINS = [
    {
      id: 'deep-blue', name: '深空蓝', swatch: 'linear-gradient(135deg,#38bdf8,#818cf8)',
      tokens: {
        '--skin-primary': '#38bdf8', '--skin-primary-dark': '#0ea5e9', '--skin-primary-light': '#7dd3fc',
        '--skin-accent': '#818cf8', '--skin-glow': 'rgba(56,189,248,0.45)',
        '--skin-orb-1': 'rgba(56,189,248,0.34)', '--skin-orb-2': 'rgba(129,140,248,0.30)',
        '--skin-bg-a': '#070b1a', '--skin-bg-b': '#0f1f3d', '--skin-surface': 'rgba(13,22,46,0.55)',
        '--skin-c1': '#38bdf8', '--skin-c2': '#818cf8', '--skin-c3': '#22d3ee', '--skin-c4': '#a78bfa', '--skin-c5': '#34d399'
      }
    },
    {
      id: 'aurora', name: '极光紫', swatch: 'linear-gradient(135deg,#a78bfa,#f472b6)',
      tokens: {
        '--skin-primary': '#a78bfa', '--skin-primary-dark': '#7c3aed', '--skin-primary-light': '#c4b5fd',
        '--skin-accent': '#f472b6', '--skin-glow': 'rgba(167,139,250,0.45)',
        '--skin-orb-1': 'rgba(167,139,250,0.34)', '--skin-orb-2': 'rgba(244,114,182,0.28)',
        '--skin-bg-a': '#0c0820', '--skin-bg-b': '#1a1033', '--skin-surface': 'rgba(28,18,54,0.55)',
        '--skin-c1': '#a78bfa', '--skin-c2': '#f472b6', '--skin-c3': '#c084fc', '--skin-c4': '#f9a8d4', '--skin-c5': '#818cf8'
      }
    },
    {
      id: 'emerald', name: '翠光青', swatch: 'linear-gradient(135deg,#34d399,#22d3ee)',
      tokens: {
        '--skin-primary': '#34d399', '--skin-primary-dark': '#059669', '--skin-primary-light': '#6ee7b7',
        '--skin-accent': '#22d3ee', '--skin-glow': 'rgba(52,211,153,0.42)',
        '--skin-orb-1': 'rgba(52,211,153,0.30)', '--skin-orb-2': 'rgba(34,211,238,0.30)',
        '--skin-bg-a': '#04130f', '--skin-bg-b': '#06231d', '--skin-surface': 'rgba(8,34,28,0.55)',
        '--skin-c1': '#34d399', '--skin-c2': '#22d3ee', '--skin-c3': '#6ee7b7', '--skin-c4': '#2dd4bf', '--skin-c5': '#a3e635'
      }
    },
    {
      id: 'warm', name: '暖阳橙', swatch: 'linear-gradient(135deg,#f26522,#fb923c)',
      tokens: {
        '--skin-primary': '#f26522', '--skin-primary-dark': '#d85416', '--skin-primary-light': '#ff8c5a',
        '--skin-accent': '#fb923c', '--skin-glow': 'rgba(242,101,34,0.45)',
        '--skin-orb-1': 'rgba(242,101,34,0.32)', '--skin-orb-2': 'rgba(251,146,60,0.26)',
        '--skin-bg-a': '#160a04', '--skin-bg-b': '#2a1408', '--skin-surface': 'rgba(40,20,10,0.55)',
        '--skin-c1': '#f26522', '--skin-c2': '#fb923c', '--skin-c3': '#fbbf24', '--skin-c4': '#f97316', '--skin-c5': '#facc15'
      }
    },
    {
      id: 'cyber', name: '赛博品红', swatch: 'linear-gradient(135deg,#ec4899,#22d3ee)',
      tokens: {
        '--skin-primary': '#ec4899', '--skin-primary-dark': '#be185d', '--skin-primary-light': '#f9a8d4',
        '--skin-accent': '#22d3ee', '--skin-glow': 'rgba(236,72,153,0.45)',
        '--skin-orb-1': 'rgba(236,72,153,0.32)', '--skin-orb-2': 'rgba(34,211,238,0.30)',
        '--skin-bg-a': '#0a0512', '--skin-bg-b': '#170a26', '--skin-surface': 'rgba(26,10,40,0.55)',
        '--skin-c1': '#ec4899', '--skin-c2': '#22d3ee', '--skin-c3': '#f472b6', '--skin-c4': '#a78bfa', '--skin-c5': '#fda4af'
      }
    }
  ];

  var TEXTURES = [
    { id: 'liquid', name: '液态玻璃' },
    { id: 'frost', name: '磨砂' },
    { id: 'grid', name: '网格扫描' },
    { id: 'mesh', name: '流光渐变' },
    { id: 'solid', name: '实色' }
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch (e) { return null; }
  }
  function save(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  var DEFAULT = { scheme: 'deep-blue', texture: 'liquid', mode: 'dark' };

  var Skin = {
    SKINS: SKINS,
    TEXTURES: TEXTURES,
    state: Object.assign({}, DEFAULT, load()),

    _skin: function () {
      for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === this.state.scheme) return SKINS[i];
      return SKINS[0];
    },

    apply: function () {
      var s = this._skin();
      var root = document.documentElement;
      // 全局色板（覆盖 :root，驱动整站）
      root.style.setProperty('--primary', s.tokens['--skin-primary']);
      root.style.setProperty('--primary-dark', s.tokens['--skin-primary-dark']);
      root.style.setProperty('--primary-light', s.tokens['--skin-primary-light']);
      root.style.setProperty('--accent', s.tokens['--skin-accent']);
      root.style.setProperty('--shadow-glow', '0 0 0 4px ' + s.tokens['--skin-glow']);
      // 皮肤令牌
      Object.keys(s.tokens).forEach(function (k) { root.style.setProperty(k, s.tokens[k]); });
      // 模式：dark 需显式 data-theme=dark；light 回退到 :root 浅色
      if (this.state.mode === 'dark') root.setAttribute('data-theme', 'dark');
      else root.removeAttribute('data-theme');
      // 质感 + 模式类
      var body = document.body;
      body.classList.add('skin-on');
      body.classList.remove('tex-liquid', 'tex-frost', 'tex-grid', 'tex-mesh', 'tex-solid');
      body.classList.add('tex-' + this.state.texture);
      body.classList.remove('mode-light', 'mode-dark');
      body.classList.add('mode-' + this.state.mode);
      save(this.state);
    },

    applySaved: function () { this.apply(); },

    setScheme: function (id) { this.state.scheme = id; this.apply(); this._sync(); },
    setTexture: function (id) { this.state.texture = id; this.apply(); this._sync(); },
    setMode: function (id) { this.state.mode = id; this.apply(); this._sync(); },

    _sync: function () {
      var panel = document.getElementById('skin-switcher');
      if (!panel) return;
      panel.querySelectorAll('[data-skin]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-skin') === Skin.state.scheme);
      });
      panel.querySelectorAll('[data-tex]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tex') === Skin.state.texture);
      });
      var mt = panel.querySelector('[data-mode]');
      if (mt) mt.textContent = Skin.state.mode === 'dark' ? '🌙 暗色' : '☀️ 亮色';
    },

    mountSwitcher: function () {
      if (document.getElementById('skin-switcher')) return;
      var panel = document.createElement('div');
      panel.id = 'skin-switcher';
      panel.className = 'skin-switcher';

      var swatches = SKINS.map(function (s) {
        return '<button type="button" class="skin-swatch" data-skin="' + s.id + '" title="' + s.name + '" style="background:' + s.swatch + '"></button>';
      }).join('');
      var texChips = TEXTURES.map(function (t) {
        return '<button type="button" class="skin-chip" data-tex="' + t.id + '">' + t.name + '</button>';
      }).join('');

      panel.innerHTML =
        '<button type="button" class="skin-fab" id="skin-fab" title="皮肤与质感">🎨</button>' +
        '<div class="skin-panel" id="skin-panel">' +
          '<div class="skin-panel-head"><span>皮肤工坊</span><button type="button" class="skin-close" id="skin-close">×</button></div>' +
          '<div class="skin-section"><div class="skin-section-title">配色预设</div><div class="skin-swatches">' + swatches + '</div></div>' +
          '<div class="skin-section"><div class="skin-section-title">质感</div><div class="skin-chips">' + texChips + '</div></div>' +
          '<div class="skin-section"><div class="skin-section-title">模式</div><button type="button" class="skin-chip" data-mode="toggle">🌙 暗色</button></div>' +
        '</div>';
      document.body.appendChild(panel);

      var fab = panel.querySelector('#skin-fab');
      var close = panel.querySelector('#skin-close');
      fab.addEventListener('click', function () { panel.classList.toggle('open'); });
      close.addEventListener('click', function () { panel.classList.remove('open'); });

      panel.querySelectorAll('[data-skin]').forEach(function (b) {
        b.addEventListener('click', function () { Skin.setScheme(b.getAttribute('data-skin')); });
      });
      panel.querySelectorAll('[data-tex]').forEach(function (b) {
        b.addEventListener('click', function () { Skin.setTexture(b.getAttribute('data-tex')); });
      });
      var modeBtn = panel.querySelector('[data-mode]');
      modeBtn.addEventListener('click', function () {
        Skin.setMode(Skin.state.mode === 'dark' ? 'light' : 'dark');
      });

      this._sync();
    }
  };

  window.Skin = Skin;
})();
