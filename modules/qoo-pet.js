/* ============================================================
 * 小Qoo 系统宠物 — 跨页全局浮层
 * - 固定/可拖动、点击互动、位置持久化
 * - 挂载在 body 末尾，SPA 路由切换不销毁
 * - 暴露 window.QooPet API：say(text)、setPose('idle'|'wave')、hide()/show()
 * ============================================================ */
(function () {
  'use strict';

  var QOO_IMG_URL = 'assets/illustrations/%E5%B0%8FQoo%E5%90%89%E7%A5%A5%E7%89%A9.png'; // 小Qoo吉祥物.png
  var STORAGE_KEY = 'qoo_pet_state_v1';
  var MESSAGES = [
    '嗨！我是小Qoo，今天也要认真康复哦～',
    '记得先完成评估，再生成专属方案！',
    '有任何问题，随时点我聊天～',
    '运动要循序渐进，安全第一！',
    '坚持训练，身体会告诉你答案 💪'
  ];

  var el, bubble, img;
  var isDragging = false;
  var dragStartX = 0, dragStartY = 0;
  var startLeft = 0, startTop = 0;
  var hasMoved = false;
  var dragThreshold = 5;
  var hideTimer = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function getViewport() {
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function defaultPos() {
    var size = 72, margin = 16;
    return { left: getViewport().w - size - margin, top: getViewport().h - size - margin, snapped: 'right' };
  }

  function applyPos(left, top) {
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }

  function snapToEdge() {
    var rect = el.getBoundingClientRect();
    var size = rect.width || 72;
    var vp = getViewport();
    var left = rect.left;
    var snapped = left + size / 2 < vp.w / 2 ? 'left' : 'right';
    var newLeft = snapped === 'left' ? 16 : vp.w - size - 16;
    var newTop = clamp(rect.top, 16, vp.h - size - 16);
    applyPos(newLeft, newTop);
    saveState({ left: newLeft, top: newTop, snapped: snapped });
  }

  function setPose(pose) {
    if (!el) return;
    el.classList.remove('qoo-pose-idle', 'qoo-pose-wave');
    el.classList.add(pose === 'wave' ? 'qoo-pose-wave' : 'qoo-pose-idle');
  }

  function showBubble(html, ms) {
    if (!bubble) return;
    bubble.innerHTML = html || esc(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    bubble.classList.add('show');
    setPose('wave');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      bubble.classList.remove('show');
      setPose('idle');
    }, ms || 4000);
  }

  function hideBubble() {
    if (bubble) bubble.classList.remove('show');
    setPose('idle');
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    var rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    el.classList.add('dragging');
    el.setPointerCapture(e.pointerId);
    hideBubble();
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) hasMoved = true;
    var vp = getViewport();
    var size = el.getBoundingClientRect().width || 72;
    var newLeft = clamp(startLeft + dx, 8, vp.w - size - 8);
    var newTop = clamp(startTop + dy, 8, vp.h - size - 8);
    applyPos(newLeft, newTop);
  }

  function onPointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    el.classList.remove('dragging');
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    snapToEdge();
    if (!hasMoved) {
      // 离线时禁用 AI 问答入口，给出明确提示
      if (window.Sync && window.Sync.isOnline && window.Sync.isOnline() === false) {
        showBubble('网络已断开，鹊动小Qoo 暂不可用，请联网后重试～');
        return;
      }
      // 判定为点击：优先打开已合并到小Qoo 的 AI 问答入口
      if (window.AIReason && typeof window.AIReason.openChat === 'function') {
        window.AIReason.openChat();
        showBubble('已为你打开 鹊动小Qoo，评估与方案的问题都可以问我～');
      } else {
        showBubble();
      }
    }
  }

  function init() {
    if (document.getElementById('qoo-pet')) return;

    el = document.createElement('div');
    el.id = 'qoo-pet';
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', '小Qoo 系统宠物');
    el.title = '点我互动';

    img = document.createElement('img');
    img.className = 'qoo-avatar';
    img.src = QOO_IMG_URL;
    img.alt = '小Qoo';
    img.draggable = false;
    el.appendChild(img);

    bubble = document.createElement('div');
    bubble.className = 'qoo-bubble';
    bubble.innerHTML = esc(MESSAGES[0]);
    el.appendChild(bubble);

    document.body.appendChild(el);

    // 患者只读视图（扫码分享页）：隐藏 AI 助手图标
    if (window.__patientView) {
      el.style.display = 'none';
    }

    var state = loadState() || defaultPos();
    applyPos(state.left, state.top);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    // 离线状态可视化：订阅 Sync 状态，断网时给小Qoo 加离线标记
    if (window.Sync && window.Sync.on) {
      window.Sync.on(function (s) {
        if (!s || s.online === false) { el.classList.add('qoo-offline'); el.title = '小Qoo（离线：鹊动小Qoo 暂不可用）'; }
        else { el.classList.remove('qoo-offline'); el.title = '点我互动'; }
      });
    }

    window.addEventListener('resize', function () {
      var rect = el.getBoundingClientRect();
      var size = rect.width || 72;
      var vp = getViewport();
      applyPos(clamp(rect.left, 8, vp.w - size - 8), clamp(rect.top, 8, vp.h - size - 8));
      snapToEdge();
    });

    //  welcome 一次
    setTimeout(function () { showBubble('嗨！我是小Qoo，陪你一起管理健康～'); }, 1200);
  }

  // 暴露全局 API（后续 AI 聊天、事件联动可调用）
  window.QooPet = {
    say: function (text, ms) { showBubble(text, ms); },
    setPose: setPose,
    hide: function () { if (el) el.style.display = 'none'; },
    show: function () { if (el) el.style.display = ''; },
    version: '1.0'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
