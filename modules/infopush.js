/**
 * 鹊动FAC功能评估与干预系统
 * 系统资讯 & 系统消息推送模块（独立命名空间 qd_infopush_）
 *
 * 角色：
 *   - 管理员(admin)：编辑/发布/撤回/删除/定时/范围/统计/日志（后台）
 *   - 医生(doctor)：接收/阅读/下载/标记已读（前端）
 *
 * 说明：本系统为前端 localStorage 原型，PRD 中「服务器宕机补偿 / 跨端同步 / 真实多人编辑锁 / IP 溯源」
 *      在浏览器内以本地模拟实现（定时任务在启动时补偿、编辑锁基于本地锁字段、IP 记为 localhost）。
 */
(function () {
  'use strict';

  /* ==================================================================
   * 1. 数据层
   * ================================================================== */
  const PREFIX = 'qd_infopush_';
  const K_CONTENTS = PREFIX + 'contents';
  const K_DOCTORS = PREFIX + 'doctors';
  const K_GROUPS = PREFIX + 'groups';
  const K_LOGS = PREFIX + 'logs';
  const K_READS = PREFIX + 'reads';
  const K_SEED = PREFIX + 'seeded';
  const MAX_FILE = 12 * 1024 * 1024; // 单文件 12MB 上限（localStorage 友好）

  function rd(key, def) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; }
    catch (e) { return def; }
  }
  function wr(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[资讯推送] 写入失败', key, e); alert('保存失败：本地存储已满或不可用'); return false; }
  }
  const uid = () => 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nowISO = () => new Date().toISOString();
  function fmt(t) {
    if (!t) return '-';
    const d = new Date(t);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function me() { return AppState.currentUser || { username: 'unknown', displayName: '未知', role: 'admin' }; }

  /* ----- 种子数据（首次运行）：分组写入共享存储，医生并入主系统真实账号 ----- */
  async function seed() {
    if (rd(K_SEED, false)) return;
    // 共享分组：仅当 doctorGroups 为空时才预置默认分组，避免覆盖管理员已建分组
    if (window.DoctorGroups && window.DoctorGroups.list().length === 0) {
      ['内分泌科', '康复医学科', '老年医学科'].forEach((nm, i) => {
        window.DoctorGroups.save({ id: 'g' + (i + 1), name: nm });
      });
    }
    // 医生演示账号（与主系统账号统一；已存在则补全科室/分组）
    const seedDoctors = [
      { username: 'doc_zhang', displayName: '张医生', dept: '内分泌科', groupIds: ['g1'], password: 'doc123456' },
      { username: 'doc_li', displayName: '李医生', dept: '康复医学科', groupIds: ['g2'], password: 'doc123456' },
      { username: 'doc_wang', displayName: '王医生', dept: '老年医学科', groupIds: ['g3'], password: 'doc123456' },
      { username: 'doc_zhao', displayName: '赵医生', dept: '内分泌科', groupIds: ['g1', 'g3'], password: 'doc123456' }
    ];
    if (window.DB) {
      for (const d of seedDoctors) {
        const ex = await DB.findUserByUsername(d.username);
        if (!ex) {
          await DB.createUser({ username: d.username, displayName: d.displayName, role: 'doctor', password: d.password, dept: d.dept, groupIds: d.groupIds, phone: '' });
        } else if (!ex.dept && (!ex.groupIds || ex.groupIds.length === 0)) {
          await DB.updateUser(ex.id, { dept: d.dept, groupIds: d.groupIds });
        }
      }
    }
    wr(K_SEED, true);
  }

  /* ----- 医生 / 分组：统一数据源（主系统账号 + 共享分组存储） ----- */
  function rawUsers() { return (window.DB ? DB.getUsersSync() : []); }
  function setRawUsers(list) { if (window.DB) DB.setUsersSync(list); }
  const Doctors = {
    list() {
      return rawUsers().filter(u => u.role === 'doctor').map(u => ({
        username: u.username, displayName: u.displayName,
        dept: u.dept || '', groupIds: u.groupIds || []
      }));
    },
    get(u) { return this.list().find(d => d.username === u) || null; },
    save(d) {
      const all = rawUsers();
      const i = all.findIndex(x => x.username === d.username);
      if (i >= 0) {
        if (d.displayName != null) all[i].displayName = d.displayName;
        if (d.dept != null) all[i].dept = d.dept;
        if (d.groupIds != null) all[i].groupIds = d.groupIds;
      }
      setRawUsers(all); return d;
    },
    remove(u) { setRawUsers(rawUsers().filter(x => x.username !== u)); }
  };
  // 分组统一走 window.DoctorGroups（与系统管理后台账号管理共享同一份数据，双向同步）
  const Groups = window.DoctorGroups || {
    list() { return []; }, get() { return null; }, save() {}, remove() {}, members() { return []; }
  };

  /* ----- 内容（资讯 / 消息统一） ----- */
  const Contents = {
    list() { return rd(K_CONTENTS, []); },
    byId(id) { return this.list().find(c => c.id === id) || null; },
    save(c) {
      const all = this.list();
      const i = all.findIndex(x => x.id === c.id);
      if (i >= 0) all[i] = c; else all.push(c);
      wr(K_CONTENTS, all); return c;
    },
    remove(id) { wr(K_CONTENTS, this.list().filter(x => x.id !== id)); }
  };

  const STATE_LABEL = {
    draft: '草稿', scheduled: '待定时发布', published: '已发布',
    withdrawn: '已撤回', deleted: '已删除', autoDeleted: '定时已删除'
  };
  const STATE_CLASS = {
    draft: 'st-draft', scheduled: 'st-sched', published: 'st-pub',
    withdrawn: 'st-with', deleted: 'st-del', autoDeleted: 'st-del'
  };

  /* ----- 发布范围解析 ----- */
  function resolveReceivers(scope) {
    scope = scope || {};
    const all = Doctors.list();
    let base = [];
    if (scope.target === 'groups') {
      const g = scope.groups || [];
      base = all.filter(d => (d.groupIds || []).some(x => g.includes(x))).map(d => d.username);
    } else if (scope.target === 'doctors') {
      base = (scope.doctors || []).slice();
    } else {
      base = all.map(d => d.username);
    }
    const ex = new Set(scope.exclude || []);
    return [...new Set(base)].filter(u => !ex.has(u));
  }
  function scopeText(scope) {
    scope = scope || {};
    if (scope.target === 'doctors') return '指定医生：' + ((scope.doctors || []).join('、') || '无');
    if (scope.target === 'groups') {
      const names = (scope.groups || []).map(g => (Groups.get(g) || {}).name || g).join('、');
      return '分组：' + (names || '无');
    }
    return '全部医生';
  }

  /* ----- 阅读 / 下载记录 ----- */
  function reads() { return rd(K_READS, []); }
  function getRead(contentId, username) {
    return reads().find(r => r.contentId === contentId && r.username === username) || null;
  }
  function touchRead(contentId, username, patch) {
    const all = reads();
    let r = all.find(x => x.contentId === contentId && x.username === username);
    if (!r) { r = { contentId, username, readAt: null, downloads: [] }; all.push(r); }
    Object.assign(r, patch);
    if (r.readAt == null && patch.readAt) r.readAt = patch.readAt;
    wr(K_READS, all);
  }
  function recordDownload(contentId, username, name) {
    const all = reads();
    let r = all.find(x => x.contentId === contentId && x.username === username);
    if (!r) { r = { contentId, username, readAt: nowISO(), downloads: [] }; all.push(r); }
    r.downloads = r.downloads || [];
    r.downloads.push({ name, at: nowISO() });
    wr(K_READS, all);
  }

  /* ----- 操作日志 ----- */
  function log(type, content, summary) {
    const all = rd(K_LOGS, []);
    all.unshift({
      at: nowISO(), by: me().displayName + '(' + me().username + ')',
      type, contentId: content ? content.id : null,
      title: content ? content.title : '', summary: summary || '',
      ip: 'localhost'
    });
    wr(K_LOGS, all.slice(0, 500));
  }

  /* ----- 版本快照 ----- */
  function snapshot(c) {
    c.versions = c.versions || [];
    c.versions.unshift({
      at: nowISO(), by: me().displayName,
      title: c.title, summary: c.summary, body: c.body, attachments: c.attachments
    });
    if (c.versions.length > 20) c.versions.length = 20;
  }

  /* ----- 编辑锁（本地模拟多人） ----- */
  const LOCK_TTL = 15 * 60 * 1000;
  function lockInfo(c) {
    if (!c.lockedBy) return null;
    if (Date.now() - new Date(c.lockedAt).getTime() > LOCK_TTL) return null;
    return { by: c.lockedBy, at: c.lockedAt };
  }
  function acquireLock(c) {
    const info = lockInfo(c);
    if (info && info.by !== me().username) return info;
    c.lockedBy = me().username; c.lockedAt = nowISO();
    Contents.save(c); return null;
  }
  function releaseLock(c) {
    if (c.lockedBy === me().username) { c.lockedBy = null; c.lockedAt = null; Contents.save(c); }
  }

  /* ----- 定时任务补偿（启动时 + 后台渲染时调用） ----- */
  function tick() {
    let changed = false;
    const now = Date.now();
    Contents.list().forEach(c => {
      if (c.state === 'scheduled' && c.publishAt && new Date(c.publishAt).getTime() <= now) {
        c.state = 'published'; c.publishedAt = nowISO(); changed = true;
        log('定时发布生效', c, '系统自动发布（原定 ' + fmt(c.publishAt) + '）');
      }
      if ((c.state === 'published' || c.state === 'scheduled') && c.deleteAt && new Date(c.deleteAt).getTime() <= now) {
        c.state = 'autoDeleted'; changed = true;
        log('定时删除生效', c, '系统自动删除（原定 ' + fmt(c.deleteAt) + '）');
      }
    });
    if (changed) Contents.list(); // 已就地修改，触发保存
    if (changed) { const a = Contents.list(); wr(K_CONTENTS, a); }
  }

  /* ----- 医生可见内容 ----- */
  function visibleTo(content, username) {
    if (content.state !== 'published') return false;
    if (content.kind === 'info') {
      // 资讯：仅已发布且在范围内
    }
    const rec = resolveReceivers(content.scope);
    return rec.includes(username);
  }
  function listForDoctor(kind, username) {
    const seen = new Set();
    return Contents.list()
      .filter(c => c.kind === kind && visibleTo(c, username))
      .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
      .sort((a, b) => new Date(b.publishedAt || b.publishAt || b.updatedAt) - new Date(a.publishedAt || a.publishAt || a.updatedAt));
  }
  function unreadCount(kind, username) {
    return listForDoctor(kind, username).filter(c => !getRead(c.id, username)).length;
  }

  /* ==================================================================
   * 2. 通用渲染工具
   * ================================================================== */
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function toast(msg, ok) {
    const t = el(`<div class="ip-toast ${ok ? 'ok' : 'err'}">${esc(msg)}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  const FILE_WHITELIST = {
    image: { ext: ['jpg', 'jpeg', 'png', 'gif'], mime: ['image/'], label: '图片' },
    video: { ext: ['mp4'], mime: ['video/'], label: '视频' },
    doc: { ext: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'], mime: ['application/'], label: '文档' }
  };
  function checkFile(file) {
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    const mime = file.type || '';
    for (const cat of ['image', 'video', 'doc']) {
      const w = FILE_WHITELIST[cat];
      if (w.ext.includes(ext) || w.mime.some(m => mime.startsWith(m))) {
        if (file.size > MAX_FILE) return { ok: false, msg: `「${name}」超过 ${Math.round(MAX_FILE / 1024 / 1024)}MB 上限，已拦截` };
        return { ok: true, cat, ext, mime };
      }
    }
    return { ok: false, msg: `「${name}」格式不在白名单（图片/视频mp4/PDF/Word/PPT/Excel），已拦截` };
  }
  function fileToDataURL(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  /* ==================================================================
   * 3. 管理员后台控制台（资讯 / 消息共用）
   * ================================================================== */
  function renderConsole(kind) {
    tick();
    const root = el('<div class="ip-console"></div>');
    const isInfo = kind === 'info';
    root.innerHTML = `
      <div class="page-head">
        <div>
          <h2>${isInfo ? '资讯管理' : '系统消息管理'}</h2>
          <p class="page-sub">${isInfo ? '长图文 / 科普 / 培训 / 公告 · 公众号式富文本' : '短通知 / 强提醒 / 文件下发 · 红点未读'}</p>
        </div>
        <div class="ip-head-actions">
          <button class="btn btn-primary" id="ip-new">+ 新建${isInfo ? '资讯' : '消息'}</button>
          <span class="ip-filter" id="ip-stat"></span>
        </div>
      </div>
      <div class="ip-toolbar">
        <input class="ip-search" id="ip-search" placeholder="搜索标题 / 摘要…">
        <div class="ip-state-tabs" id="ip-tabs"></div>
      </div>
      <div class="ip-list" id="ip-list"></div>
    `;
    const states = ['all', 'draft', 'scheduled', 'published', 'withdrawn', 'deleted'];
    const tabs = root.querySelector('#ip-tabs');
    states.forEach(s => {
      const b = el(`<button class="ip-tab${s === 'all' ? ' active' : ''}" data-s="${s}">${s === 'all' ? '全部' : STATE_LABEL[s]}</button>`);
      tabs.appendChild(b);
    });

    let curState = 'all', curQ = '';
    const listEl = root.querySelector('#ip-list');

    function draw() {
      let items = Contents.list().filter(c => c.kind === kind);
      if (curState !== 'all') items = items.filter(c => c.state === curState);
      if (curQ) {
        const q = curQ.toLowerCase();
        items = items.filter(c => (c.title + c.summary).toLowerCase().includes(q));
      }
      items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      // 统计
      const all = Contents.list().filter(c => c.kind === kind);
      root.querySelector('#ip-stat').textContent =
        `共 ${all.length} 条 · 已发布 ${all.filter(c => c.state === 'published').length} · 草稿 ${all.filter(c => c.state === 'draft').length}`;
      if (!items.length) { listEl.innerHTML = '<div class="ip-empty">暂无内容，点击右上角新建。</div>'; return; }
      listEl.innerHTML = '';
      items.forEach(c => listEl.appendChild(rowCard(c)));
    }

    function rowCard(c) {
      const rec = resolveReceivers(c.scope);
      const card = el(`<div class="ip-row card ${STATE_CLASS[c.state]}">
        <div class="ip-row-main">
          <div class="ip-row-top">
            <span class="ip-state ${STATE_CLASS[c.state]}">${STATE_LABEL[c.state]}</span>
            <span class="ip-row-title">${esc(c.title || '(无标题)')}</span>
          </div>
          <div class="ip-row-meta">
            <span>📡 ${esc(scopeText(c.scope))}</span>
            <span>👥 推送 ${rec.length} 人</span>
            <span>🕒 更新 ${fmt(c.updatedAt)}</span>
            ${c.publishAt ? `<span>⏰ 定时 ${fmt(c.publishAt)}</span>` : ''}
            ${c.deleteAt ? `<span>🗑 定时删 ${fmt(c.deleteAt)}</span>` : ''}
          </div>
        </div>
        <div class="ip-row-ops"></div>
      </div>`);
      const ops = card.querySelector('.ip-row-ops');
      ops.appendChild(btn('编辑', 'btn-secondary', () => openEditor(c.id, kind)));
      if (c.state === 'draft' || c.state === 'withdrawn') {
        ops.appendChild(btn('立即发布', 'btn-primary', () => doPublish(c, kind, false)));
        ops.appendChild(btn('定时发布', 'btn-secondary', () => schedulePublish(c, kind)));
      }
      if (c.state === 'scheduled') {
        ops.appendChild(btn('立即发布', 'btn-primary', () => doPublish(c, kind, false)));
        ops.appendChild(btn('转为草稿', 'btn-secondary', () => { c.state = 'draft'; c.publishAt = null; Contents.save(c); log('转为草稿', c); draw(); toast('已转为草稿'); }));
      }
      if (c.state === 'published') {
        ops.appendChild(btn('撤回', 'btn-warn', () => doWithdraw(c, kind)));
        ops.appendChild(btn('定时删除', 'btn-secondary', () => scheduleDelete(c, kind)));
      }
      if (c.state === 'deleted' || c.state === 'autoDeleted') {
        ops.appendChild(btn('恢复为草稿', 'btn-secondary', () => { c.state = 'draft'; c.deleteAt = null; Contents.save(c); log('恢复', c); draw(); toast('已恢复为草稿'); }));
      }
      if (c.state !== 'deleted' && c.state !== 'autoDeleted') {
        ops.appendChild(btn('删除', 'btn-danger', () => doDelete(c, kind)));
      }
      ops.appendChild(btn('统计', 'btn-ghost', () => openStats(c, kind)));
      ops.appendChild(btn('日志', 'btn-ghost', () => openLogs(c, kind)));
      return card;
    }

    root.querySelector('#ip-search').addEventListener('input', e => { curQ = e.target.value; draw(); });
    tabs.addEventListener('click', e => {
      const b = e.target.closest('.ip-tab'); if (!b) return;
      curState = b.dataset.s;
      tabs.querySelectorAll('.ip-tab').forEach(x => x.classList.toggle('active', x === b));
      draw();
    });
    root.querySelector('#ip-new').addEventListener('click', () => openEditor(null, kind));
    draw();
    return root;
  }

  function btn(label, cls, fn) { const b = el(`<button class="btn ${cls} ip-btn">${esc(label)}</button>`); b.onclick = fn; return b; }

  /* ----- 状态转换动作 ----- */
  function doPublish(c, kind, scheduled) {
    if (scheduled) { c.state = 'scheduled'; }
    else { c.state = 'published'; c.publishedAt = nowISO(); c.publishAt = c.publishAt || nowISO(); }
    if (c.versions && c.versions.length === 0) snapshot(c);
    Contents.save(c);
    log(scheduled ? '定时发布' : '发布', c, scheduled ? '设定定时发布' : '立即发布');
    toast(scheduled ? '已设定定时发布' : '已发布');
    refreshConsole(kind);
  }
  function schedulePublish(c, kind) {
    const v = prompt('设置发布时间（格式：YYYY-MM-DD HH:MM，留空取消）', fmt(c.publishAt || nowISO()).slice(0, 16));
    if (!v) return;
    const d = new Date(v.replace(' ', 'T'));
    if (isNaN(d)) { toast('时间格式不正确', false); return; }
    c.publishAt = d.toISOString();
    c.state = 'scheduled';
    Contents.save(c); log('定时发布配置', c, '发布时间 ' + fmt(c.publishAt));
    toast('已设定定时发布'); refreshConsole(kind);
  }
  function scheduleDelete(c, kind) {
    const v = prompt('设置自动删除时间（格式：YYYY-MM-DD HH:MM）', '');
    if (!v) return;
    const d = new Date(v.replace(' ', 'T'));
    if (isNaN(d)) { toast('时间格式不正确', false); return; }
    c.deleteAt = d.toISOString();
    Contents.save(c); log('定时删除配置', c, '删除时间 ' + fmt(c.deleteAt));
    toast('已设定定时删除'); refreshConsole(kind);
  }
  function doWithdraw(c, kind) {
    if (!confirm('撤回后医生端将立即隐藏，阅读/下载记录保留。确认撤回？')) return;
    c.state = 'withdrawn';
    Contents.save(c); log('撤回', c);
    toast('已撤回'); refreshConsole(kind);
  }
  function doDelete(c, kind) {
    if (!confirm('逻辑删除：前台隐藏，后台数据保留用于溯源。确认删除？')) return;
    c.state = 'deleted'; c.deletedAt = nowISO();
    Contents.save(c); log('删除', c);
    toast('已删除（数据保留溯源）'); refreshConsole(kind);
  }
  function refreshConsole(kind) {
    const main = U.qs('#main');
    if (main && window.route) window.route();
  }

  /* ----- 编辑器 ----- */
  function openEditor(id, kind) {
    const existing = id ? Contents.byId(id) : null;
    if (existing) {
      const locked = acquireLock(existing);
      if (locked) { toast(`「${locked.by}」正在编辑，您仅可查看（只读）`, false); }
    }
    const c = existing || {
      id: uid(), kind, state: 'draft',
      title: '', summary: '', body: '', attachments: [],
      scope: { target: 'all', groups: [], doctors: [], exclude: [] },
      publishAt: null, deleteAt: null, createdBy: me().username,
      createdAt: nowISO(), updatedAt: nowISO(), versions: []
    };
    const readonly = !!(lockInfo(c) && lockInfo(c).by !== me().username);

    const overlay = el('<div class="ip-modal-overlay"></div>');
    const box = el(`<div class="ip-editor card">
      <div class="ip-editor-head">
        <h3>${existing ? '编辑' : '新建'}${kind === 'info' ? '资讯' : '消息'}${readonly ? '（只读）' : ''}</h3>
        <button class="ip-x" id="ip-close">✕</button>
      </div>
      <div class="ip-editor-body">
        <div class="form-group"><label>标题</label><input id="ip-title" class="ip-input" maxlength="80" ${readonly ? 'disabled' : ''}></div>
        <div class="form-group"><label>摘要</label><input id="ip-summary" class="ip-input" maxlength="200" placeholder="列表展示的摘要（消息可留空）" ${readonly ? 'disabled' : ''}></div>
        <div class="ip-rich-wrap">
          <div class="ip-rich-bar" id="ip-bar">
            <button data-c="bold" title="加粗"><b>B</b></button>
            <button data-c="italic" title="斜体"><i>I</i></button>
            <button data-c="underline" title="下划线"><u>U</u></button>
            <button data-c="insertUnorderedList" title="项目符号">• 列表</button>
            <button data-c="insertOrderedList" title="编号">1. 列表</button>
            <button id="ip-img" title="插入图片">🖼 图片</button>
            <button id="ip-video" title="插入视频">🎬 视频</button>
            <span class="ip-bar-sep"></span>
            <button id="ip-attach" class="ip-attach-btn">📎 附件</button>
          </div>
          <div class="ip-rich" id="ip-rich" contenteditable="${!readonly}"></div>
        </div>
        <div class="ip-attach-list" id="ip-attach-list"></div>
        <div class="form-group"><label>发布范围</label><div id="ip-scope"></div></div>
        <div class="ip-sched-row" id="ip-sched"></div>
      </div>
      <div class="ip-editor-foot" id="ip-foot"></div>
    </div>`);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('#ip-title').value = c.title || '';
    box.querySelector('#ip-summary').value = c.summary || '';
    box.querySelector('#ip-rich').innerHTML = c.body || '';

    // 工具栏
    const rich = box.querySelector('#ip-rich');
    const bar = box.querySelector('#ip-bar');
    if (!readonly) {
      bar.querySelectorAll('button[data-c]').forEach(b => b.addEventListener('mousedown', e => {
        e.preventDefault(); document.execCommand(b.dataset.c, false, null); rich.focus();
      }));
      box.querySelector('#ip-img').addEventListener('click', () => pickFile('image', data => {
        document.execCommand('insertHTML', false, `<img src="${data.url}" style="max-width:100%;border-radius:8px;margin:6px 0" alt="${esc(data.name)}">`);
      }));
      box.querySelector('#ip-video').addEventListener('click', () => pickFile('video', data => {
        document.execCommand('insertHTML', false, `<video src="${data.url}" controls style="max-width:100%;border-radius:8px;margin:6px 0"></video>`);
      }));
      box.querySelector('#ip-attach').addEventListener('click', () => pickFile('doc', data => {
        c.attachments.push({ name: data.name, mime: data.mime, size: data.size, url: data.url });
        renderAttachList();
      }));
    } else {
      bar.querySelectorAll('button').forEach(b => b.disabled = true);
    }

    function renderAttachList() {
      const wrap = box.querySelector('#ip-attach-list');
      if (!c.attachments.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = '<div class="ip-attach-title">附件（' + c.attachments.length + '）</div>';
      c.attachments.forEach((a, i) => {
        const row = el(`<div class="ip-attach-chip">📄 ${esc(a.name)} <span class="ip-sz">${Math.round(a.size / 1024)}KB</span> ${readonly ? '' : '<span class="ip-rm">✕</span>'}</div>`);
        if (!readonly) row.querySelector('.ip-rm').onclick = () => { c.attachments.splice(i, 1); renderAttachList(); };
        wrap.appendChild(row);
      });
    }
    renderAttachList();

    // 发布范围
    renderScope(box.querySelector('#ip-scope'), c, readonly);
    // 定时
    renderSched(box.querySelector('#ip-sched'), c, readonly);

    function collect() {
      c.title = box.querySelector('#ip-title').value.trim();
      c.summary = box.querySelector('#ip-summary').value.trim();
      c.body = rich.innerHTML;
      c.updatedAt = nowISO();
      return c;
    }
    function saveDraft() {
      collect();
      if (c.state === 'published') { snapshot(c); } // 已发布修改保留快照
      if (!c.versions.length) snapshot(c);
      Contents.save(c); log(c.state === 'published' ? '修改' : '保存草稿', c, '标题：' + (c.title || '(无)'));
      toast('已保存');
    }
    function publishNow() {
      collect(); snapshot(c); c.state = 'published'; c.publishedAt = nowISO(); c.publishAt = c.publishAt || nowISO();
      Contents.save(c); log('发布', c); toast('已发布'); close();
    }
    function publishSched() {
      collect();
      const v = prompt('设置发布时间（YYYY-MM-DD HH:MM）', c.publishAt ? fmt(c.publishAt).slice(0, 16) : fmt(nowISO()).slice(0, 16));
      if (!v) return;
      const d = new Date(v.replace(' ', 'T'));
      if (isNaN(d)) { toast('时间格式不正确', false); return; }
      c.publishAt = d.toISOString(); c.state = 'scheduled'; snapshot(c);
      Contents.save(c); log('定时发布配置', c); toast('已设定定时发布'); close();
    }

    const foot = box.querySelector('#ip-foot');
    if (readonly) {
      foot.appendChild(btn('关闭', 'btn-secondary', close));
    } else {
      foot.appendChild(btn('保存草稿', 'btn-secondary', () => { saveDraft(); }));
      foot.appendChild(btn('立即发布', 'btn-primary', publishNow));
      foot.appendChild(btn('定时发布', 'btn-secondary', publishSched));
      foot.appendChild(btn('取消', 'btn-ghost', close));
    }

    function close() {
      if (existing) releaseLock(c);
      overlay.remove();
      refreshConsole(kind);
    }
    box.querySelector('#ip-close').onclick = close;
    overlay.addEventListener('mousedown', e => { if (e.target === overlay && !readonly) { saveDraft(); close(); } });
    window.addEventListener('beforeunload', function handler() { if (existing) releaseLock(c); window.removeEventListener('beforeunload', handler); });
  }

  function pickFile(cat, cb) {
    const inp = el('<input type="file" style="display:none">');
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const chk = checkFile(f);
      if (!chk.ok) { toast(chk.msg, false); inp.remove(); return; }
      try {
        const url = await fileToDataURL(f);
        cb({ name: f.name, mime: f.type, size: f.size, url });
        toast('已添加：' + f.name);
      } catch (e) { toast('读取文件失败', false); }
      inp.remove();
    };
    inp.click();
  }

  /* ----- 发布范围 UI ----- */
  function renderScope(host, c, readonly) {
    const scope = c.scope || (c.scope = { target: 'all', groups: [], doctors: [], exclude: [] });
    function draw() {
      const groups = Groups.list(), doctors = Doctors.list();
      let html = `<div class="ip-scope-tabs">
        <label class="${scope.target === 'all' ? 'on' : ''}"><input type="radio" name="sct" value="all" ${scope.target === 'all' ? 'checked' : ''} ${readonly ? 'disabled' : ''}> 全部医生</label>
        <label class="${scope.target === 'groups' ? 'on' : ''}"><input type="radio" name="sct" value="groups" ${scope.target === 'groups' ? 'checked' : ''} ${readonly ? 'disabled' : ''}> 按分组</label>
        <label class="${scope.target === 'doctors' ? 'on' : ''}"><input type="radio" name="sct" value="doctors" ${scope.target === 'doctors' ? 'checked' : ''} ${readonly ? 'disabled' : ''}> 指定医生</label>
      </div>`;
      if (scope.target === 'groups') {
        html += '<div class="ip-chips">' + groups.map(g =>
          `<label class="ip-chip ${scope.groups.includes(g.id) ? 'on' : ''}"><input type="checkbox" value="${g.id}" ${scope.groups.includes(g.id) ? 'checked' : ''} ${readonly ? 'disabled' : ''}> ${esc(g.name)}</label>`).join('') + '</div>';
      }
      if (scope.target === 'doctors') {
        html += '<div class="ip-chips">' + doctors.map(d =>
          `<label class="ip-chip ${scope.doctors.includes(d.username) ? 'on' : ''}"><input type="checkbox" value="${d.username}" ${scope.doctors.includes(d.username) ? 'checked' : ''} ${readonly ? 'disabled' : ''}> ${esc(d.displayName)}</label>`).join('') + '</div>';
      }
      html += `<div class="ip-exclude"><label>排除人员：</label><div class="ip-chips">` +
        doctors.map(d => `<label class="ip-chip ex ${scope.exclude.includes(d.username) ? 'on' : ''}"><input type="checkbox" value="${d.username}" ${scope.exclude.includes(d.username) ? 'checked' : ''} ${readonly ? 'disabled' : ''}> ${esc(d.displayName)}</label>`).join('') +
        `</div></div>`;
      host.innerHTML = html;
      if (!readonly) {
        host.querySelectorAll('input[name="sct"]').forEach(r => r.onchange = () => { scope.target = r.value; draw(); });
        host.querySelectorAll('.ip-chips input').forEach(ch => ch.onchange = () => {
          const v = ch.value, arr = ch.closest('.ip-exclude') ? scope.exclude : (scope.target === 'groups' ? scope.groups : scope.doctors);
          if (ch.checked) { if (!arr.includes(v)) arr.push(v); } else { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); }
        });
      }
    }
    draw();
  }

  function renderSched(host, c, readonly) {
    host.innerHTML = `<div class="ip-sched-inner">
      <label>⏰ 定时发布：${c.publishAt ? esc(fmt(c.publishAt)) : '未设置'}</label>
      <label>🗑 定时删除：${c.deleteAt ? esc(fmt(c.deleteAt)) : '未设置'}</label>
    </div>`;
  }

  /* ----- 统计面板 ----- */
  function openStats(c, kind) {
    const rec = resolveReceivers(c.scope);
    const allReads = reads().filter(r => r.contentId === c.id);
    const readSet = allReads.filter(r => r.readAt);
    const total = rec.length;
    const readN = readSet.length;
    const unread = total - readN;
    const overlay = el('<div class="ip-modal-overlay"></div>');
    const box = el(`<div class="ip-modal card">
      <div class="ip-editor-head"><h3>数据统计 · ${esc(c.title)}</h3><button class="ip-x" id="x">✕</button></div>
      <div class="ip-stats-grid">
        <div class="ip-stat"><b>${total}</b><span>推送人员总数</span></div>
        <div class="ip-stat"><b>${readN}</b><span>已读</span></div>
        <div class="ip-stat"><b>${unread}</b><span>未读</span></div>
        <div class="ip-stat"><b>0</b><span>未送达</span></div>
      </div>
      <h4 class="ip-sub-h">附件下载统计</h4>
      <div id="ip-dl" class="ip-dl"></div>
      <h4 class="ip-sub-h">阅读 / 下载明细</h4>
      <div id="ip-detail" class="ip-detail"></div>
      <div class="ip-editor-foot"><button class="btn btn-secondary" id="exp">导出 Excel(CSV)</button></div>
    </div>`);
    overlay.appendChild(box); document.body.appendChild(overlay);
    // 附件下载
    const dl = box.querySelector('#ip-dl');
    if (!c.attachments || !c.attachments.length) dl.innerHTML = '<div class="ip-empty">无附件</div>';
    else {
      dl.innerHTML = c.attachments.map(a => {
        const cnt = allReads.filter(r => (r.downloads || []).some(d => d.name === a.name)).length;
        const times = allReads.reduce((s, r) => s + (r.downloads || []).filter(d => d.name === a.name).length, 0);
        return `<div class="ip-dl-row">📄 ${esc(a.name)} — 下载 ${cnt} 人 / ${times} 次</div>`;
      }).join('');
    }
    // 明细
    const det = box.querySelector('#ip-detail');
    det.innerHTML = rec.map(u => {
      const r = allReads.find(x => x.username === u);
      const doc = Doctors.get(u);
      const dlN = r ? (r.downloads || []).length : 0;
      return `<div class="ip-detail-row"><span>${esc((doc ? doc.displayName : u))}</span>
        <span class="${r && r.readAt ? 'ok' : 'no'}">${r && r.readAt ? '已读 ' + fmt(r.readAt) : '未读'}</span>
        <span>下载 ${dlN} 次</span></div>`;
    }).join('');
    box.querySelector('#x').onclick = () => overlay.remove();
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
    box.querySelector('#exp').onclick = () => exportCSV(c, rec, allReads);
  }

  function exportCSV(c, rec, allReads) {
    const rows = [['医生', '姓名', '状态', '阅读时间', '下载次数']];
    rec.forEach(u => {
      const r = allReads.find(x => x.username === u); const doc = Doctors.get(u);
      rows.push([u, doc ? doc.displayName : '', r && r.readAt ? '已读' : '未读', r && r.readAt ? fmt(r.readAt) : '', r ? (r.downloads || []).length : 0]);
    });
    const csv = '﻿' + rows.map(r => r.map(x => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = el('<a></a>'); a.href = URL.createObjectURL(blob); a.download = (c.title || '统计') + '_统计.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出 CSV');
  }

  /* ----- 操作日志 ----- */
  function openLogs(c, kind) {
    const logs = rd(K_LOGS, []).filter(l => !c || l.contentId === c.id);
    const overlay = el('<div class="ip-modal-overlay"></div>');
    const box = el(`<div class="ip-modal card">
      <div class="ip-editor-head"><h3>操作日志${c ? ' · ' + esc(c.title) : ''}</h3><button class="ip-x" id="x">✕</button></div>
      <div class="ip-log-list">${logs.length ? logs.map(l => `<div class="ip-log-row"><span class="ip-log-at">${fmt(l.at)}</span><span class="ip-log-type">${esc(l.type)}</span><span class="ip-log-by">${esc(l.by)}</span><span class="ip-log-ip">${esc(l.ip)}</span><span class="ip-log-sum">${esc(l.summary || l.title || '')}</span></div>`).join('') : '<div class="ip-empty">暂无日志</div>'}</div>
    </div>`);
    overlay.appendChild(box); document.body.appendChild(overlay);
    box.querySelector('#x').onclick = () => overlay.remove();
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) overlay.remove(); });
  }

  /* ==================================================================
   * 4. 医生端：资讯中心 / 系统消息中心
   * ================================================================== */
  function renderCenter(kind) {
    const u = me();
    if (u.role !== 'doctor') {
      return el(`<div class="ip-center"><div class="ip-empty">本页面为医生端接收中心，请使用医生账号登录后查看。<br>（可用种子账号：doc_zhang / doc_li / doc_wang / doc_zhao）</div></div>`);
    }
    tick();
    const root = el('<div class="ip-center"></div>');
    const isInfo = kind === 'info';
    root.innerHTML = `
      <div class="page-head">
        <div><h2>${isInfo ? '资讯中心' : '系统消息中心'}</h2>
        <p class="page-sub">${isInfo ? '院内公告 / 科普 / 培训资料' : '事务通知 / 紧急提醒 / 文件下发'}</p></div>
        <div class="ip-head-actions">
          ${isInfo ? '' : '<button class="btn btn-secondary" id="ip-readall">一键全部已读</button>'}
          <span class="ip-unread" id="ip-unread"></span>
        </div>
      </div>
      <div class="ip-toolbar">
        <input class="ip-search" id="ip-search" placeholder="搜索标题…">
        <select class="ip-sel" id="ip-f">
          <option value="all">全部</option>
          <option value="unread">仅未读</option>
          <option value="read">仅已读</option>
          ${isInfo ? '<option value="fav">我的收藏</option>' : ''}
        </select>
      </div>
      <div class="ip-list" id="ip-list"></div>
    `;
    const listEl = root.querySelector('#ip-list');
    let q = '', f = 'all';

    function draw() {
      let items = listForDoctor(kind, u.username);
      const rd0 = reads();
      if (f === 'unread') items = items.filter(c => !getRead(c.id, u.username));
      else if (f === 'read') items = items.filter(c => getRead(c.id, u.username));
      else if (f === 'fav') items = items.filter(c => (getRead(c.id, u.username) || {}).fav);
      if (q) items = items.filter(c => (c.title + c.summary).toLowerCase().includes(q.toLowerCase()));
      root.querySelector('#ip-unread').textContent = unreadCount(kind, u.username) ? ('未读 ' + unreadCount(kind, u.username)) : '全部已读';
      if (!items.length) { listEl.innerHTML = '<div class="ip-empty">暂无内容</div>'; return; }
      listEl.innerHTML = '';
      items.forEach(c => {
        const r = getRead(c.id, u.username) || {};
        const row = el(`<div class="ip-row card ${r.readAt ? '' : 'unread'}">
          <div class="ip-row-main">
            <div class="ip-row-top">
              ${r.readAt ? '' : '<span class="ip-dot"></span>'}
              <span class="ip-row-title">${esc(c.title || '(无标题)')}</span>
            </div>
            <div class="ip-row-sum">${esc(c.summary || '')}</div>
            <div class="ip-row-meta"><span>🕒 ${fmt(c.publishedAt || c.publishAt)}</span>
              ${isInfo && r.fav ? '<span>⭐ 已收藏</span>' : ''}</div>
          </div>
          <div class="ip-row-ops"></div>
        </div>`);
        const ops = row.querySelector('.ip-row-ops');
        ops.appendChild(btn('查看', 'btn-primary', () => openDetail(c, kind, u)));
        if (!r.readAt) ops.appendChild(btn('标记已读', 'btn-secondary', () => { touchRead(c.id, u.username, { readAt: nowISO() }); draw(); updateBadge(); }));
        if (isInfo) ops.appendChild(btn(r.fav ? '取消收藏' : '收藏', 'btn-ghost', () => { touchRead(c.id, u.username, { fav: !r.fav, readAt: r.readAt || nowISO() }); draw(); }));
        listEl.appendChild(row);
      });
    }
    root.querySelector('#ip-search').addEventListener('input', e => { q = e.target.value; draw(); });
    root.querySelector('#ip-f').addEventListener('change', e => { f = e.target.value; draw(); });
    if (!isInfo) root.querySelector('#ip-readall').addEventListener('click', () => {
      listForDoctor(kind, u.username).forEach(c => touchRead(c.id, u.username, { readAt: getRead(c.id, u.username) ? getRead(c.id, u.username).readAt : nowISO() }));
      draw(); updateBadge(); toast('已全部标记已读');
    });
    draw();
    return root;
  }

  function openDetail(c, kind, u) {
    touchRead(c.id, u.username, { readAt: nowISO() });
    updateBadge();
    const overlay = el('<div class="ip-modal-overlay"></div>');
    const box = el(`<div class="ip-modal card ip-detail-modal">
      <div class="ip-editor-head"><h3>${esc(c.title)}</h3><button class="ip-x" id="x">✕</button></div>
      <div class="ip-detail-meta">发布 ${fmt(c.publishedAt || c.publishAt)} · 范围 ${esc(scopeText(c.scope))}</div>
      <div class="ip-detail-body">${c.body || '<i>无正文</i>'}</div>
      <div id="ip-att" class="ip-detail-att"></div>
    </div>`);
    overlay.appendChild(box); document.body.appendChild(overlay);
    const att = box.querySelector('#ip-att');
    if (c.attachments && c.attachments.length) {
      att.innerHTML = '<div class="ip-attach-title">附件</div>';
      c.attachments.forEach(a => {
        const row = el(`<div class="ip-attach-chip">📄 ${esc(a.name)} <span class="ip-sz">${Math.round(a.size / 1024)}KB</span> <span class="ip-dl-btn">下载</span></div>`);
        row.querySelector('.ip-dl-btn').onclick = () => { recordDownload(c.id, u.username, a.name); downloadDataURL(a.url, a.name); toast('已开始下载'); };
        att.appendChild(row);
      });
    }
    box.querySelector('#x').onclick = () => { overlay.remove(); if (window.route) window.route(); };
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) { overlay.remove(); if (window.route) window.route(); } });
  }

  function downloadDataURL(url, name) {
    const a = el('<a></a>'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ==================================================================
   * 5. 医生分组 / 接收人管理（admin）
   * ================================================================== */
  function renderGroups() {
    const root = el('<div class="ip-groups"></div>');
    root.innerHTML = `
      <div class="page-head"><div><h2>医生分组与接收人</h2><p class="page-sub">配置推送范围所需的医生账户与分组（与主系统「账号管理」共享同一份数据，双向同步）</p></div></div>
      <div class="ip-grp-cols">
        <div class="card"><h3>医生账户（含科室 / 分组）</h3><div id="ip-dl-list" class="ip-grp-list"></div></div>
        <div class="card"><h3>分组</h3><div id="ip-g-list" class="ip-grp-list"></div>
          <div class="ip-grp-add"><input id="ip-gn" placeholder="新建分组名称"><button class="btn btn-primary" id="ip-gadd">新建分组</button></div></div>
      </div>
      <p class="text-muted" style="font-size:12px;margin-top:10px;">提示：医生账号的科室与分组在「系统管理后台 → 账号管理」中维护；此处可对其分组进行增减。删除分组时，成员将自动变为未分组。</p>`;
    const dList = root.querySelector('#ip-dl-list'), gList = root.querySelector('#ip-g-list');
    function drawD() {
      dList.innerHTML = '';
      Doctors.list().forEach(d => {
        const tags = (d.groupIds || []).map(g => ({ id: g, name: ((window.DoctorGroups.get(g)) || {}).name || g }));
        const row = el(`<div class="ip-grp-item">
          <div class="ip-grp-main"><b>${esc(d.displayName)}</b> <small>@${esc(d.username)} · ${esc(d.dept || '未填科室')}</small></div>
          <div class="ip-grp-tags">${tags.map(t => `<span class="ip-tag">${esc(t.name)}<i class="ip-x" data-g="${t.id}" title="移出该分组">✕</i></span>`).join('') || '<span class="ip-tag muted">未分组</span>'}</div>
          <div class="ip-grp-add2"><select class="ip-grp-sel">${Groups.list().map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('') || '<option value="">（无可选分组）</option>'}</select><button class="btn btn-ghost btn-sm ip-join">加入分组</button></div>
        </div>`);
        row.querySelectorAll('.ip-x').forEach(x => x.onclick = () => { window.DoctorGroups.removeMember(d.username, x.dataset.g); drawD(); drawG(); });
        row.querySelector('.ip-join').onclick = () => { const sel = row.querySelector('.ip-grp-sel'); if (!sel.value) return; window.DoctorGroups.addMember(d.username, sel.value); drawD(); drawG(); };
        dList.appendChild(row);
      });
    }
    function drawG() {
      gList.innerHTML = '';
      Groups.list().forEach(g => {
        const members = window.DoctorGroups.members(g.id);
        const cand = Doctors.list().filter(d => !members.find(m => m.username === d.username));
        const row = el(`<div class="ip-grp-item">
          <div class="ip-grp-main"><b>${esc(g.name)}</b> <small>${members.length} 人</small></div>
          <div class="ip-grp-tags">${members.map(m => `<span class="ip-tag">${esc(m.displayName)}<i class="ip-x" data-u="${m.username}" title="移出分组">✕</i></span>`).join('') || '<span class="ip-tag muted">暂无成员</span>'}</div>
          <div class="ip-grp-add2"><select class="ip-grp-sel">${cand.map(d => `<option value="${d.username}">${esc(d.displayName)}</option>`).join('') || '<option value="">（无可选医生）</option>'}</select><button class="btn btn-ghost btn-sm ip-addm">加入成员</button></div>
          <button class="btn btn-danger btn-sm ip-delg">删除分组</button>
        </div>`);
        row.querySelectorAll('.ip-x').forEach(x => x.onclick = () => { window.DoctorGroups.removeMember(x.dataset.u, g.id); drawD(); drawG(); });
        row.querySelector('.ip-addm').onclick = () => { const sel = row.querySelector('.ip-grp-sel'); if (!sel.value) return; window.DoctorGroups.addMember(sel.value, g.id); drawD(); drawG(); };
        row.querySelector('.ip-delg').onclick = () => { if (confirm('删除该分组？成员将变为未分组')) { window.DoctorGroups.remove(g.id); drawD(); drawG(); } };
        gList.appendChild(row);
      });
    }
    root.querySelector('#ip-gadd').onclick = () => {
      const n = root.querySelector('#ip-gn').value.trim(); if (!n) { toast('请填写分组名称', false); return; }
      window.DoctorGroups.save({ id: 'g' + Date.now().toString(36), name: n });
      root.querySelector('#ip-gn').value = ''; drawG(); toast('已添加分组');
    };
    drawD(); drawG();
    return root;
  }

  /* ==================================================================
   * 6. 导航红点徽标
   * ================================================================== */
  function updateBadge() {
    const u = AppState.currentUser; if (!u || u.role !== 'doctor') return;
    const n = unreadCount('msg', u.username);
    document.querySelectorAll('.nav-item').forEach(a => {
      if (a.getAttribute('href') === '#/msg-center') {
        let b = a.querySelector('.nav-badge');
        if (n > 0) { if (!b) { b = el('<span class="nav-badge"></span>'); a.appendChild(b); } b.textContent = n; b.style.display = ''; }
        else if (b) b.style.display = 'none';
      }
    });
  }

  /* ==================================================================
   * 7. 页面注册
   * ================================================================== */
  window.Pages = window.Pages || {};
  window.Pages.infoAdmin = () => renderConsole('info');
  window.Pages.msgAdmin = () => renderConsole('msg');
  window.Pages.infoCenter = () => renderCenter('info');
  window.Pages.msgCenter = () => renderCenter('msg');
  window.Pages.infoGroups = () => renderGroups();

  window.InfoPush = {
    tick, unreadCount, updateBadge,
    listForDoctor, resolveReceivers
  };

  // 启动补偿定时任务
  seed();
  tick();

  /* ----- 跨标签页实时同步 -----
     云端为纯静态站点、无服务端，数据存于各浏览器 localStorage。
     管理员在「另一标签页」发布/撤回消息后，通过 storage 事件让医生端当前页即时刷新，
     解决「同一浏览器内多标签」场景下医生收不到新消息的问题。
     （注：不同设备/浏览器之间因 localStorage 隔离，仍需服务端才能真正互通，见说明） */
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
      const h = location.hash || '';
      if (/info|msg/.test(h) && typeof window.route === 'function') window.route();
      updateBadge();
    });
  }
})();
