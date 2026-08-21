/* ==================================================================
 * 脊柱健康 · 蓝牙设备采集骨架（window.SpineDevice）
 * ------------------------------------------------------------------
 * 设计目标（已与用户确认）：
 *   - 运行环境：Web Bluetooth（浏览器，需 HTTPS）+ Tauri 桌面端 两者兼容
 *   - 协议：标准 GATT（通用属性规范）
 *   - 采集：握力计（左右手）→ gripL/gripR/gripLSI；步速计 → gaitSpeed
 * 说明：
 *   - 真机 UUID 因设备而异，默认填占位 UUID；通过 setConfig / ⚙ 配置面板覆盖。
 *   - Tauri 桌面端原生蓝牙需在 Rust 侧实现桥接并注册 window.__tauriSpineBluetooth
 *     （{ connect, measure(type) }），本模块在检测到 Tauri 时自动切换调用。
 *   - 所有数值经 bytesToNum 按「前 N 字节小端整数 × scale」解码，适配多数握力/步速设备。
 * ================================================================== */
window.SpineDevice = (function () {
  'use strict';

  // 占位默认值 —— 真机联调请用 setConfig 覆盖（⚙ 配置面板）
  const DEFAULTS = {
    gripService: '0000ffe0-0000-1000-8000-00805f9b34fb',
    gripCharL:   '0000ffe1-0000-1000-8000-00805f9b34fb',
    gripCharR:   '0000ffe2-0000-1000-8000-00805f9b34fb',
    gaitService: '0000ffe0-0000-1000-8000-00805f9b34fb',
    gaitChar:    '0000ffe3-0000-1000-8000-00805f9b34fb',
    gripScale: 1,   // 字节值 → 牛顿(N) 的缩放（常见设备原始即 N，填 1）
    gaitScale: 0.001 // 字节值（mm/s）→ m/s 的缩放（设备以 mm/s 上报时填 0.001）
  };

  let config = Object.assign({}, DEFAULTS);
  let device = null;     // Web Bluetooth 设备对象
  let server = null;     // GATT server
  let tauriBridge = null; // Tauri 原生蓝牙桥接
  const listeners = { reading: [], status: [], error: [], device: [] };

  /* ---------- 环境探测 ---------- */
  function isTauri() {
    return !!(window.__TAURI__ || (window.__TAURI_INVOKE__ && window.__TAURI_INVOKE__.tauri) || window.__tauriSpineBluetooth);
  }
  function isWebBT() {
    return !!(navigator.bluetooth && navigator.bluetooth.requestDevice);
  }

  /* ---------- 事件 ---------- */
  function emit(type, payload) { (listeners[type] || []).forEach(function (fn) { try { fn(payload); } catch (e) {} }); }
  function on(type, fn) {
    if (typeof fn !== 'function') return function () {};
    listeners[type] = listeners[type] || [];
    listeners[type].push(fn);
    return function () { listeners[type] = (listeners[type] || []).filter(function (x) { return x !== fn; }); };
  }
  function status(s) { emit('status', s); }

  /* ---------- 配置 ---------- */
  function setConfig(c) { config = Object.assign({}, config, c || {}); }
  function getConfig() { return Object.assign({}, config); }

  /* ---------- 解码 ---------- */
  function bytesToNum(view, scale) {
    if (!view) return null;
    let raw = 0;
    try {
      if (view.byteLength >= 4) raw = view.getFloat32(0, true);
      else if (view.byteLength >= 2) raw = view.getUint16(0, true);
      else if (view.byteLength === 1) raw = view.getUint8(0);
      else return null;
    } catch (e) { return null; }
    if (isNaN(raw)) return null;
    return raw * (scale || 1);
  }

  /* ---------- Web Bluetooth ---------- */
  async function connectWeb() {
    status('正在扫描附近蓝牙设备…（请在弹窗中选择握力/步速设备）');
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [config.gripService] }],
      optionalServices: [config.gripService, config.gaitService]
    });
    device.addEventListener('gattserverdisconnected', function () { server = null; status('设备已断开，请重新连接'); });
    server = await device.gatt.connect();
    status('已连接：' + (device.name || '未知设备'));
    emit('device', device);
    return device;
  }

  async function readChar(service, uuid) {
    if (!server) throw new Error('尚未连接设备');
    const svc = await server.getPrimaryService(service);
    const ch = await svc.getCharacteristic(uuid);
    return await ch.readValue(); // DataView
  }

  /* ---------- Tauri 桌面端 ---------- */
  async function connectTauri() {
    if (typeof window.__tauriSpineBluetooth !== 'object' || !window.__tauriSpineBluetooth.connect) {
      const msg = 'Tauri 桌面端尚未接入蓝牙桥接（window.__tauriSpineBluetooth 未注册）。请在 Tauri 侧实现 connect()/measure() 桥接，或在 Web 端使用 Web Bluetooth。';
      emit('error', new Error(msg));
      throw new Error(msg);
    }
    tauriBridge = window.__tauriSpineBluetooth;
    await tauriBridge.connect(config);
    status('Tauri 桌面端蓝牙桥接已就绪（待设备联调）');
    emit('device', { name: 'tauri-bridge' });
    return tauriBridge;
  }

  async function readCharTauri(type) {
    if (!tauriBridge || !tauriBridge.measure) throw new Error('Tauri 蓝牙桥接不可用');
    const r = await tauriBridge.measure(type, config); // 期望返回 { gripL, gripR } 或 { gaitSpeed }
    return r;
  }

  /* ---------- 连接 ---------- */
  async function connect() {
    if (isTauri()) return connectTauri();
    if (isWebBT()) return connectWeb();
    const msg = '当前环境不支持蓝牙：请使用 HTTPS 下的浏览器（Web Bluetooth）或 Tauri 桌面端。';
    emit('error', new Error(msg));
    throw new Error(msg);
  }

  async function disconnect() {
    try { if (device && device.gatt && device.gatt.connected) await device.gatt.disconnect(); } catch (e) {}
    try { if (tauriBridge && tauriBridge.disconnect) await tauriBridge.disconnect(); } catch (e) {}
    server = null; device = null; tauriBridge = null;
    status('已断开连接');
  }

  /* ---------- 采集：握力 ---------- */
  async function captureGrip() {
    status('正在读取握力数据…');
    let L = null, R = null;
    if (isTauri()) {
      const r = await readCharTauri('grip');
      L = (r && r.gripL != null) ? r.gripL : null;
      R = (r && r.gripR != null) ? r.gripR : null;
    } else {
      try { L = bytesToNum(await readChar(config.gripService, config.gripCharL), config.gripScale); } catch (e) { console.warn('[SpineDevice] 左手握力读取失败', e); }
      try { R = bytesToNum(await readChar(config.gripService, config.gripCharR), config.gripScale); } catch (e) { console.warn('[SpineDevice] 右手握力读取失败', e); }
    }
    if (L == null && R == null) {
      const msg = '握力读取失败：未获取到数值，请检查设备 UUID 配置与连接状态。';
      emit('error', new Error(msg));
      throw new Error(msg);
    }
    const LSI = (L != null && R != null && Math.max(L, R) > 0) ? Math.round(Math.min(L, R) / Math.max(L, R) * 1000) / 10 : null;
    const out = { gripL: L, gripR: R, gripLSI: LSI, source: isTauri() ? 'tauri' : 'web', capturedAt: new Date().toISOString() };
    emit('reading', { type: 'grip', value: out });
    status('握力采集完成：左 ' + L + ' / 右 ' + R + ' N' + (LSI != null ? '，LSI ' + LSI + '%' : ''));
    return out;
  }

  /* ---------- 采集：步速 ---------- */
  async function captureGait() {
    status('正在读取步速数据…');
    let speed = null;
    if (isTauri()) {
      const r = await readCharTauri('gait');
      speed = (r && r.gaitSpeed != null) ? r.gaitSpeed : null;
    } else {
      try { speed = bytesToNum(await readChar(config.gaitService, config.gaitChar), config.gaitScale); } catch (e) { console.warn('[SpineDevice] 步速读取失败', e); }
    }
    if (speed == null) {
      const msg = '步速读取失败：未获取到数值，请检查设备 UUID 配置与连接状态。';
      emit('error', new Error(msg));
      throw new Error(msg);
    }
    const out = { gaitSpeed: speed, source: isTauri() ? 'tauri' : 'web', capturedAt: new Date().toISOString() };
    emit('reading', { type: 'gait', value: out });
    status('步速采集完成：' + speed + ' m/s');
    return out;
  }

  /* ---------- 配置面板（U.modal） ---------- */
  function openConfigModal() {
    if (typeof U === 'undefined' || !U.modal) { console.warn('[SpineDevice] U.modal 不可用，无法打开配置面板'); return; }
    const c = getConfig();
    var row = function (k, label, val) {
      return '<div class="form-group" style="margin-bottom:8px;">' +
        '<label style="font-size:12px;display:block;margin-bottom:4px;">' + label + '</label>' +
        '<input id="cfg-' + k + '" value="' + U.esc(val == null ? '' : val) + '" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px;" /></div>';
    };
    var body = '<div style="max-height:62vh;overflow:auto;">' +
      '<p class="text-muted" style="font-size:12px;">标准 GATT 服务/特征值 UUID：16-bit 用 <code>0xXXXX</code>，完整用 <code>xxxxxxxx-0000-1000-8000-00805f9b34fb</code>。仅真机联调时修改，当前为占位默认。</p>' +
      row('gripService', '握力服务 UUID', c.gripService) +
      row('gripCharL', '左手握力特征值', c.gripCharL) +
      row('gripCharR', '右手握力特征值', c.gripCharR) +
      row('gaitService', '步速服务 UUID', c.gaitService) +
      row('gaitChar', '步速特征值', c.gaitChar) +
      row('gripScale', '握力数值缩放 (×)', c.gripScale) +
      row('gaitScale', '步速数值缩放 (×)', c.gaitScale) +
      '</div>';
    var footer = '<button class="btn btn-primary btn-sm" id="cfg-save">保存配置</button><button class="btn btn-ghost btn-sm" id="cfg-cancel">取消</button>';
    var m = U.modal({ title: '蓝牙 GATT 配置', body: body, footer: footer, cls: 'ai-modal-full', width: 520 });
    var ov = m && m.overlay ? m.overlay : document;
    var saveBtn = U.qs('#cfg-save', ov);
    var cancelBtn = U.qs('#cfg-cancel', ov);
    if (cancelBtn) cancelBtn.onclick = m.close;
    if (saveBtn) saveBtn.onclick = function () {
      var g = function (id) { var el = U.qs('#cfg-' + id, ov); return el ? el.value.trim() : ''; };
      setConfig({
        gripService: g('gripService'), gripCharL: g('gripCharL'), gripCharR: g('gripCharR'),
        gaitService: g('gaitService'), gaitChar: g('gaitChar'),
        gripScale: parseFloat(g('gripScale')) || 1, gaitScale: parseFloat(g('gaitScale')) || 1
      });
      U.toast('蓝牙 GATT 配置已保存（本次会话）', 'success');
      m.close();
    };
  }

  return {
    isTauri: isTauri, isWebBT: isWebBT,
    connect: connect, disconnect: disconnect,
    captureGrip: captureGrip, captureGait: captureGait,
    on: on, setConfig: setConfig, getConfig: getConfig, openConfigModal: openConfigModal
  };
})();
