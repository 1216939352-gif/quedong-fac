/**
 * 鹊动FAC功能评估与干预系统 — 前端数据同步引擎（Phase 2）
 * 设计：本地优先（localStorage 即本地库），写入后自动标记脏，防抖推送；
 *       定时 + online 事件触发拉取；水位线存 localStorage；编辑锁 + 乐观锁兜底。
 *
 * 接入方式：本文件对业务代码零侵入 —— 不修改 db.js / sarcopenia-core.js 任何调用点，
 *           仅通过拦截 localStorage.setItem 实现增量脏标记。
 *           后端不可达时自动降级为纯本地（离线可用），联网后增量同步。
 *
 * 同步集合（localStorage key -> 服务端 collection 名）：
 *   quedong_wm_patients        -> patients        （系统患者档案）
 *   qd_sarcopenia_patients    -> sarc_patients    （肌少症专项首诊登记名册）
 *   qd_sarcopenia_records     -> sarc_records     （肌少症评估记录）
 */
(function () {
  'use strict';

  const LS = window.localStorage;

  // 集合注册
  const COLLECTIONS = {
    'quedong_wm_patients': 'patients',
    'qd_sarcopenia_patients': 'sarc_patients',
    'qd_sarcopenia_records': 'sarc_records'
  };
  // 反向映射：collection -> localStorage key
  const KEY_OF = {};
  Object.keys(COLLECTIONS).forEach(function (k) { KEY_OF[COLLECTIONS[k]] = k; });

  // API 基址（默认同源；可在 localStorage 用 sync_api_base 覆盖，便于跨机调试）
  let API_BASE = '';
  try { API_BASE = LS.getItem('sync_api_base') || ''; } catch (e) {}

  // 设备标识（每台浏览器一个，用于编辑锁归属）
  function getDeviceId() {
    let id = null;
    try { id = LS.getItem('sync_device_id'); } catch (e) {}
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { LS.setItem('sync_device_id', id); } catch (e) {}
    }
    return id;
  }
  const deviceId = getDeviceId();

  // 状态
  let online = false;
  let applyingRemote = false;       // 应用远端变更时，避免再次触发脏标记
  let snapshots = {};              // key -> 最近一次见到的数组
  const dirty = new Map();         // 'coll:id' -> {coll,id,deleted}
  let timer = null;
  let pushTimer = null;
  const listeners = [];
  let lastError = null;
  let offlineReason = null;       // 'network' | 'maintenance' | null（仅用于离线横幅文案）
  let conflictCount = 0;
  let mediaReconciled = false;    // 首次联网后是否做过本地存量媒体补齐

  function status() {
    return { online: online, pending: dirty.size, conflicts: conflictCount, deviceId: deviceId, lastError: lastError };
  }
  function emit() {
    const s = status();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }

  // 浏览器级联网状态（navigator.onLine）：飞行模式/断网时即时为 false
  function browserOnline() {
    return (typeof navigator === 'undefined') ? true : (navigator.onLine !== false);
  }

  // 把异常归类为用户可读的「失败原因」（无网 / 权限 / 维护 / 其他）
  function classifyByError(e, statusCode) {
    let code = statusCode || null;
    if (code == null && e && typeof e.message === 'string') {
      const m = e.message.match(/HTTP\s+(\d{3})/);
      if (m) code = parseInt(m[1], 10);
    }
    if (code === 401 || code === 403) return { reason: 'auth', msg: '账号未登录或权限不足，无法同步' };
    if (code === 503 || code === 502 || code === 504) return { reason: 'maintenance', msg: '服务器维护中，请稍后重试' };
    if (code) return { reason: 'server', msg: '服务器异常（' + code + '），请稍后重试' };
    return { reason: 'network', msg: '当前网络不可用，数据已保存在本地，恢复网络后将自动同步' };
  }

  // 统一设置 online 状态：变化时更新离线横幅 + 通知监听者
  function setOnline(nv, reason) {
    const was = online;
    online = nv;
    if (!nv) offlineReason = reason || offlineReason;
    else offlineReason = null;
    updateOfflineBanner();
    if (was !== nv) emit();
  }

  // ───────── 离线提示（左下角小弹窗 toast，不遮挡主内容） ─────────
  function ensureOfflineBanner() {
    let b = document.getElementById('offline-banner');
    if (b) return b;
    b = document.createElement('div');
    b.id = 'offline-banner';
    b.className = 'no-print offline-banner';
    b.innerHTML = '<span class="offline-ico">📡</span><span class="offline-msg"></span>' +
      '<button type="button" class="offline-retry" title="立即重试">↻</button>' +
      '<button type="button" class="offline-close" aria-label="关闭">×</button>';
    b.querySelector('.offline-retry').addEventListener('click', function () { tick(); });
    b.querySelector('.offline-close').addEventListener('click', function () { b.remove(); });
    return b;
  }
  function updateOfflineBanner() {
    if (online) { const e = document.getElementById('offline-banner'); if (e) e.remove(); return; }
    const host = document.body;
    const b = ensureOfflineBanner();
    if (b.parentNode !== host) host.appendChild(b);
    const reasonText = offlineReason === 'maintenance' ? '服务器维护中' : '网络不可用';
    b.querySelector('.offline-msg').textContent =
      '离线（' + reasonText + '），数据已保存本地';
  }

  // ───────── 本地读写 ─────────
  function readArr(key) {
    try { const raw = LS.getItem(key); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function writeArr(key, arr) {
    applyingRemote = true;
    try { LS.setItem(key, JSON.stringify(arr)); } finally { applyingRemote = false; }
    snapshots[key] = arr;
  }

  // ───────── 拦截 setItem 做增量脏标记 ─────────
  // 注意：localStorage.setItem 在 jsdom / 部分浏览器中是 Storage.prototype 上的
  // 不可写实例方法，直接 `LS.setItem = fn` 不生效；因此改为修补 Storage.prototype。
  function installInterceptor() {
    const Storage = window.Storage || (LS && LS.constructor);
    if (!Storage || !Storage.prototype || Storage.prototype.__syncPatched) return;
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const res = nativeSet.call(this, key, value);
      if (!applyingRemote && COLLECTIONS[key]) {
        let next = null;
        try { next = JSON.parse(value); } catch (e) { next = null; }
        if (Array.isArray(next)) {
          const old = snapshots[key] || [];
          diffAndMark(key, old, next);
        }
        snapshots[key] = next;
      }
      return res;
    };
    Storage.prototype.__syncPatched = true;
  }

  function diffAndMark(key, oldArr, newArr) {
    const coll = COLLECTIONS[key];
    const oldMap = {};
    (oldArr || []).forEach(function (r) { if (r && r.id != null) oldMap[r.id] = r; });
    const newMap = {};
    (newArr || []).forEach(function (r) { if (r && r.id != null) newMap[r.id] = r; });
    // 新增 / 修改
    (newArr || []).forEach(function (r) {
      if (r && r.id != null) {
        const o = oldMap[r.id];
        if (!o || JSON.stringify(o) !== JSON.stringify(r)) markDirty(coll, r.id, false);
      }
    });
    // 删除
    (oldArr || []).forEach(function (r) {
      if (r && r.id != null && !newMap[r.id]) markDirty(coll, r.id, true);
    });
  }

  function markDirty(coll, id, deleted) {
    dirty.set(coll + ':' + id, { coll: coll, id: id, deleted: !!deleted });
    schedulePush();
    emit();
  }
  function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(function () { pushTimer = null; push(); }, 1200);
  }

  // ───────── 水位线 / 版本 ─────────
  function wmKey(c) { return 'sync_wm_' + c; }
  function verKey(c, id) { return 'sync_ver_' + c + '_' + id; }
  function getWatermark(c) {
    try { return LS.getItem(wmKey(c)) || '1970-01-01T00:00:00.000Z'; } catch (e) { return '1970-01-01T00:00:00.000Z'; }
  }
  function setWatermark(c, ts) {
    try { if (ts > getWatermark(c)) LS.setItem(wmKey(c), ts); } catch (e) {}
  }
  // 全局单一水位线：所有集合共用一个“上次拉取时刻”，拉取时按 max(updatedAt) 推进。
  // 这样任一集合（尤其独立于数据集合推进的媒体）的新条目都不会因各集合进度不一致而被漏拉。
  function maxWatermark() {
    return getWatermark('__g');
  }
  function getVer(c, id) {
    try { const v = LS.getItem(verKey(c, id)); return v ? parseInt(v, 10) : 0; } catch (e) { return 0; }
  }
  function setVer(c, id, v) {
    try { LS.setItem(verKey(c, id), String(v)); } catch (e) {}
  }

  // ───────── 鉴权头（选项2）───
  // 优先用共享模块 window.QDAuth（modules/auth.js），兜底直接读 qd_admin_token。
  function getAuthHeaders() {
    if (window.QDAuth && typeof window.QDAuth.authHeaders === 'function') return window.QDAuth.authHeaders();
    let t = '';
    try { t = LS.getItem('qd_admin_token') || ''; } catch (e) {}
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  let loginPrompted = false;
  async function handleUnauthorized() {
    online = false;
    lastError = '未登录或登录已过期，无法同步';
    emit();
    if (loginPrompted) return;
    loginPrompted = true;
    if (window.QDAuth && window.QDAuth.ensureLogin) {
      try { await window.QDAuth.ensureLogin(); } catch (e) {}
      loginPrompted = false;
      // 登录成功后由下一次 tick / 定时循环自动重试；此处主动触发一次
      setTimeout(function () { online = false; tick(); }, 600);
    }
  }

  // ───────── 网络 ─────────
  async function api(path, opts) {
    const url = API_BASE + path;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders(), (opts && opts.headers) || {});
    const res = await fetch(url, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401) { handleUnauthorized(); throw new Error('HTTP 401'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  async function checkBackend() {
    try { const r = await api('/health'); return !!(r && r.ok); }
    catch (e) { return false; }
  }

  // ───────── 拉取 ─────────
  async function pull() {
    if (!online) return;
    const since = maxWatermark();
    let data;
    try { data = await api('/api/sync/pull?since=' + encodeURIComponent(since)); }
    catch (e) {
      const c = classifyByError(e);
      online = false;
      offlineReason = (c.reason === 'network' || c.reason === 'maintenance') ? c.reason : offlineReason;
      lastError = c.msg;
      emit();
      return;
    }
    if (!data || !Array.isArray(data.items)) return;
    data.items.forEach(applyRemote);
    // 推进全局水位线到本次返回条目的最大 updatedAt
    let g = getWatermark('__g');
    data.items.forEach(function (it) { if (it.updatedAt && it.updatedAt > g) g = it.updatedAt; });
    setWatermark('__g', g);
    emit();
  }
  function applyRemote(it) {
    if (it.collection === 'media') { applyRemoteMedia(it); return; }
    const key = KEY_OF[it.collection];
    if (!key) return;
    const arr = readArr(key);
    const idx = arr.findIndex(function (r) { return r.id === it.id; });
    if (it.deleted) {
      if (idx >= 0) arr.splice(idx, 1);
      try { LS.removeItem(verKey(it.collection, it.id)); } catch (e) {}
    } else {
      const rec = it.data;
      if (!rec) return; // 非删除但无数据，跳过
      if (idx >= 0) arr[idx] = rec; else arr.push(rec);
      setVer(it.collection, it.id, it.version);
    }
    writeArr(key, arr);
  }

  // ───────── 媒体同步（Phase 3） ─────────
  // 媒体 Blob 存 IndexedDB（本地），真实文件存后端磁盘；元数据在 sync_items(collection='media')。
  // 拉取时按 per-id 版本号判断缺失，下载缺失 slot 回填本地 IndexedDB（不触发上传钩子，避免回环）。
  function mverKey(id) { return 'sync_mver_' + id; }
  function mhasKey(id, slot) { return 'sync_mhas_' + id + '_' + slot; }
  function getMediaVer(id) {
    try { const v = LS.getItem(mverKey(id)); return v ? parseInt(v, 10) : 0; } catch (e) { return 0; }
  }
  function setMediaVer(id, v) {
    try { LS.setItem(mverKey(id), String(v)); } catch (e) {}
  }
  function getMediaHas(id, slot) {
    try { return LS.getItem(mhasKey(id, slot)) === '1'; } catch (e) { return false; }
  }
  function setMediaHas(id, slot, has) {
    try { if (has) LS.setItem(mhasKey(id, slot), '1'); else LS.removeItem(mhasKey(id, slot)); } catch (e) {}
  }
  function clearMediaFlags(id) {
    ['video', 'image'].forEach(function (s) { try { LS.removeItem(mhasKey(id, s)); } catch (e) {} });
    try { LS.removeItem(mverKey(id)); } catch (e) {}
  }
  async function apiForm(p, fd) {
    const res = await fetch(API_BASE + p, { method: 'POST', body: fd, headers: getAuthHeaders() });
    if (res.status === 401) { handleUnauthorized(); throw new Error('HTTP 401'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  function extFromType(type, slot) {
    const map = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/ogg': 'ogv',
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };
    return map[(type || '').toLowerCase()] || (slot === 'video' ? 'mp4' : 'png');
  }
  async function uploadMedia(id, slot, blob) {
    const ext = extFromType(blob.type, slot);
    const fd = new FormData();
    fd.append('id', id);
    fd.append('slot', slot);
    fd.append('ext', ext);
    fd.append('file', blob, (slot === 'video' ? 'v.' : 'i.') + ext);
    const r = await apiForm('/api/media/upload', fd);
    if (r && r.ok) setMediaHas(id, slot, true);
    return r;
  }
  async function fetchMediaBlob(id, slot) {
    try {
      const res = await fetch(API_BASE + '/api/media/' + encodeURIComponent(id) + '/' + slot, { headers: getAuthHeaders() });
      if (res.status === 401) { handleUnauthorized(); return null; }
      if (!res.ok) return null;
      return await res.blob();
    } catch (e) { return null; }
  }
  // DB.savePlanMedia 钩子：保存即上传；某 slot 变空且曾上传过 → 删后端该 slot
  async function onMediaSave(id, video, image) {
    if (!online) {
      if (video || image) toast('离线：媒体已存本地，联网后自动上传', 'info');
      return;
    }
    try {
      if (video) await uploadMedia(id, 'video', video);
      else if (getMediaHas(id, 'video')) { await api('/api/media/' + encodeURIComponent(id) + '/video', { method: 'DELETE' }); setMediaHas(id, 'video', false); }
      if (image) await uploadMedia(id, 'image', image);
      else if (getMediaHas(id, 'image')) { await api('/api/media/' + encodeURIComponent(id) + '/image', { method: 'DELETE' }); setMediaHas(id, 'image', false); }
    } catch (e) { console.warn('[Sync] 媒体上传失败', id, e.message); }
  }
  // DB.deletePlanMedia 钩子：整条删除
  async function onMediaDelete(id) {
    if (!online) return;
    try { await api('/api/media/' + encodeURIComponent(id), { method: 'DELETE' }); } catch (e) {}
    clearMediaFlags(id);
  }
  // 拉取回填：按版本号下载缺失的媒体 slot 回写本地 IndexedDB
  async function applyRemoteMedia(it) {
    const id = it.id;
    if (it.deleted) {
      try { if (window.DB && DB.deletePlanMedia) await DB.deletePlanMedia(id); } catch (e) {}
      clearMediaFlags(id);
      return;
    }
    const data = it.data || {};
    if (it.version <= getMediaVer(id)) { return; }
    let local = null;
    try { local = await DB.getPlanMedia(id); } catch (e) {}
    local = local || { id: id, video: null, image: null };
    let changed = false;
    const slots = ['video', 'image'];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (data[slot] && !local[slot]) {
        const blob = await fetchMediaBlob(id, slot);
        if (blob) { local[slot] = blob; changed = true; setMediaHas(id, slot, true); }
      }
    }
    if (changed) { try { await DB.writePlanMediaLocal(id, local.video, local.image); } catch (e) {} }
    setMediaVer(id, it.version);
  }
  // 首次联网后补齐：把本地存量但未上传的媒体推到后端（仅一次）
  async function reconcileLocalMedia() {
    try {
      const all = await DB.getAllPlanMedia();
      for (let i = 0; i < all.length; i++) {
        const rec = all[i];
        if (rec.video && !getMediaHas(rec.id, 'video')) await uploadMedia(rec.id, 'video', rec.video);
        if (rec.image && !getMediaHas(rec.id, 'image')) await uploadMedia(rec.id, 'image', rec.image);
      }
    } catch (e) { console.warn('[Sync] 存量媒体补齐失败', e.message); }
  }

  // ───────── 推送 ─────────
  async function push() {
    if (!online || dirty.size === 0) return;
    const items = [];
    dirty.forEach(function (d) {
      const key = KEY_OF[d.coll];
      if (!key) return;
      if (d.deleted) {
        items.push({ collection: d.coll, id: d.id, data: null, baseVersion: getVer(d.coll, d.id), deleted: true, updatedAt: new Date().toISOString() });
      } else {
        const arr = readArr(key);
        const rec = arr.find(function (r) { return r.id === d.id; });
        if (rec) items.push({ collection: d.coll, id: d.id, data: rec, baseVersion: getVer(d.coll, d.id), deleted: false, updatedAt: rec.updatedAt || new Date().toISOString() });
      }
    });
    if (items.length === 0) { dirty.clear(); return; }
    let result;
    try {
      result = await api('/api/sync/push', { method: 'POST', body: JSON.stringify({ deviceId: deviceId, items: items }) });
    } catch (e) {
      const c = classifyByError(e);
      online = false;
      offlineReason = (c.reason === 'network' || c.reason === 'maintenance') ? c.reason : offlineReason;
      lastError = c.msg;
      toast(c.reason === 'network' ? c.msg : '同步失败：' + c.msg, c.reason === 'network' ? 'info' : 'warn');
      emit();
      return;
    }

    const map = {};
    (result.results || []).forEach(function (r) { map[r.collection + ':' + r.id] = r; });
    dirty.forEach(function (d) {
      const r = map[d.coll + ':' + d.id];
      if (r && r.status === 'ok') {
        setVer(d.coll, d.id, r.version);
        dirty.delete(d.coll + ':' + d.id);
      } else if (r && r.status === 'conflict') {
        conflictCount++;
        dirty.delete(d.coll + ':' + d.id);
        toast('冲突：记录 ' + d.id + ' 已被他人修改，已为你保留本地版本，请刷新后重试', 'warn');
      }
    });
    emit();
  }

  // ───────── 编辑锁 ─────────
  async function acquireLock(collection, id, ttlMinutes) {
    if (!online) return { locked: false, offline: true };
    try {
      return await api('/api/sync/lock', { method: 'POST', body: JSON.stringify({ deviceId: deviceId, collection: collection, id: id, ttlMinutes: ttlMinutes }) });
    } catch (e) { return { locked: false, error: e.message }; }
  }
  async function releaseLock(collection, id) {
    if (!online) return;
    try { await api('/api/sync/lock', { method: 'DELETE', body: JSON.stringify({ deviceId: deviceId, collection: collection, id: id }) }); }
    catch (e) {}
  }

  function toast(msg, type) {
    if (window.U && typeof U.toast === 'function') U.toast(msg, type || 'info');
    else console.warn('[Sync]', msg);
  }

  // ───────── 循环 ─────────
  async function tick() {
    // 患者只读分享视图：无需管理员双向同步，且移动端 navigator.onLine / 首轮 /health
    // 偶发失败会造成"离线误判"（横幅 + 打卡被拦截）。此处直接判为在线、不再轮询健康检查。
    if (window.__patientView) { if (!online) setOnline(true); return; }
    if (!browserOnline()) { setOnline(false, 'network'); return; }
    const ok = await checkBackend();
    if (ok !== online) {
      online = ok;
      if (ok) {
        offlineReason = null;
        await pull();
        if (!mediaReconciled) { mediaReconciled = true; reconcileLocalMedia(); }
      } else {
        offlineReason = offlineReason || 'network';
      }
      emit();
    } else if (ok) {
      await pull();
      await push();
    }
    updateOfflineBanner();
  }

  function start() {
    if (timer) return; // 已启动
    installInterceptor();
    Object.keys(COLLECTIONS).forEach(function (k) { snapshots[k] = readArr(k); });
    try { if (window.DB && DB.registerMediaHook) DB.registerMediaHook({ onSave: onMediaSave, onDelete: onMediaDelete }); } catch (e) {}
    timer = setInterval(tick, 10000);
    window.addEventListener('online', function () { online = false; tick(); });
    window.addEventListener('offline', function () { setOnline(false, 'network'); });
    tick();
    buildUI();
    emit();
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ───────── UI（侧边收起，点击展开） ─────────
  function buildUI() {
    if (document.getElementById('sync-widget')) return;
    const wrap = document.createElement('div');
    wrap.id = 'sync-widget';
    wrap.className = 'sync-widget';
    wrap.innerHTML =
      '<button class="sync-trigger" type="button" aria-label="同步状态" title="同步状态">' +
        '<span class="sync-dot"></span>' +
      '</button>' +
      '<div class="sync-panel">' +
        '<span class="sync-txt">同步</span>' +
        '<button class="sync-btn" id="sync-now" type="button">立即同步</button>' +
      '</div>';
    document.body.appendChild(wrap);

    const trigger = wrap.querySelector('.sync-trigger');
    const panel = wrap.querySelector('.sync-panel');

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    panel.querySelector('#sync-now').addEventListener('click', async function (e) {
      e.stopPropagation();
      await U.withBtn(e.currentTarget, '同步中…', tick);
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) wrap.classList.remove('open');
    });

    render(wrap);
    listeners.push(function () { render(wrap); });
  }
  function render(wrap) {
    if (!wrap) return;
    const s = status();
    wrap.className = 'sync-widget ' + (s.online ? (s.pending ? 'syncing' : 'synced') : 'offline');
    const txt = wrap.querySelector('.sync-txt');
    if (!s.online) txt.textContent = '离线·本地';
    else if (s.pending) txt.textContent = '同步中·' + s.pending;
    else txt.textContent = '已同步';
    const btn = wrap.querySelector('#sync-now');
    if (btn) { btn.disabled = !s.online; btn.title = s.online ? '' : '恢复网络后可用'; }
    let reasonEl = wrap.querySelector('.sync-reason');
    if (!reasonEl && wrap.querySelector('.sync-panel')) {
      reasonEl = document.createElement('div');
      reasonEl.className = 'sync-reason';
      wrap.querySelector('.sync-panel').appendChild(reasonEl);
    }
    if (reasonEl) {
      reasonEl.textContent = (!s.online && s.lastError) ? s.lastError : '';
      reasonEl.style.display = reasonEl.textContent ? '' : 'none';
    }
  }

  // ───────── 导出 ─────────
  window.Sync = {
    start: start,
    stop: stop,
    push: push,
    pull: pull,
    tick: tick,
    acquireLock: acquireLock,
    releaseLock: releaseLock,
    status: status,
    isOnline: function () { return online; },
    // 由分享只读页调用：标记为"患者视图"并强制在线（隐藏离线横幅、放行打卡提交）。
    forceOnline: function () {
      try { window.__patientView = true; } catch (e) {}
      setOnline(true);
    },
    on: function (fn) { listeners.push(fn); },
    COLLECTIONS: COLLECTIONS,
    get deviceId() { return deviceId; }
  };

  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);
})();
