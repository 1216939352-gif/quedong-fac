/*
 * 运维管理工作台 · 数据纠错台（批次2 模块③）
 * 路径：#/ops-correct
 * 能力：①选表/搜索记录 ②查看并编辑白名单字段 ③保存修正（逐列参数化 UPDATE + 审计）
 *       ④删除记录（强确认 confirm=DELETE，部分表禁用）
 * 所有写操作均经后端白名单校验，杜绝 SQL 注入；高危动作写入 ops_audit。
 * 复用运维后端令牌机制（localStorage 'qd_admin_token' + 'sync_api_base'）。
 */
(function () {
  'use strict';
  if (!window.Pages) window.Pages = {};

  const OPS_TOKEN_KEY = 'qd_admin_token';
  const apiBase = () => { try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; } };
  const getToken = () => { try { return localStorage.getItem(OPS_TOKEN_KEY) || ''; } catch (e) { return ''; } };
  const setToken = t => { try { t ? localStorage.setItem(OPS_TOKEN_KEY, t) : localStorage.removeItem(OPS_TOKEN_KEY); } catch (e) {} };
  const isAdminRole = r => r === 'admin' || r === 'superadmin';
  const errMsg = e => (U && U.errMsg) ? U.errMsg(e) : (e && e.message ? e.message : String(e));

  async function loginBackend(username, password) {
    const r = await fetch(`${apiBase()}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '登录失败');
    if (!isAdminRole(d.user && d.user.role)) throw new Error('该账号非管理员');
    setToken(d.token);
    return d;
  }

  async function apiFetch(path, opts) {
    const token = getToken();
    if (!token) { const e = new Error('NO_TOKEN'); e.code = 'NO_TOKEN'; throw e; }
    const r = await fetch(`${apiBase()}${path}`, Object.assign({ headers: { Authorization: 'Bearer ' + token } }, opts || {}));
    if (r.status === 401 || r.status === 403) { setToken(''); const e = new Error('TOKEN_EXPIRED'); e.code = 'TOKEN_EXPIRED'; throw e; }
    if (!r.ok) { let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {} const e = new Error(msg); e.code = 'HTTP'; throw e; }
    return r;
  }

  window.Pages.opsCorrect = function () {
    let TABLES = {};      // 表定义缓存
    let current = null;   // 当前选中的表/记录

    const html = `
    <div class="page-head" style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap;">
      <h2 class="page-title" style="margin:0;">数据纠错台</h2>
      <span class="text-muted" style="font-size:12px;">查错 · 修正 · 删除（仅管理员，全部动作留痕）</span>
    </div>

    <div id="oc-auth" class="card" style="margin:10px 0;"></div>

    <div class="card" style="margin:10px 0;">
      <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <label style="font-size:13px;">数据表：</label>
        <select id="oc-table" style="min-width:160px;"><option value="">— 选择 —</option></select>
        <input type="text" id="oc-q" placeholder="搜索关键词（留空看最近）" style="min-width:200px;" />
        <button class="btn btn-primary btn-sm" id="oc-search">🔍 搜索</button>
        <span id="oc-tip" class="text-muted" style="font-size:12px;"></span>
      </div>
    </div>

    <div class="grid-2" style="display:grid;grid-template-columns:minmax(260px,1fr) 2fr;gap:12px;align-items:start;">
      <div class="card"><div class="card-header"><h3 class="card-title">记录列表</h3></div><div class="card-body" id="oc-list"><p class="text-muted">请选择数据表并搜索</p></div></div>
      <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3 class="card-title">记录详情与修正</h3><span id="oc-detail-id" class="text-muted" style="font-size:12px;"></span></div><div class="card-body" id="oc-detail"><p class="text-muted">从左侧选择一条记录进行查看/修正</p></div></div>
    </div>
    `;

    const root = U.el(`<div>${html}</div>`);

    const authBox = U.qs('#oc-auth', root);
    function renderAuth() {
      if (getToken()) {
        authBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <span>🔗 已连接后端（管理员令牌有效）<span class="badge badge-success">已就绪</span></span>
          <button class="btn btn-ghost btn-sm" id="oc-relogin">重新登录</button></div>`;
        U.qs('#oc-relogin', authBox).addEventListener('click', () => { setToken(''); renderAuth(); });
      } else {
        authBox.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span class="text-muted" style="font-size:13px;">需要后端管理员令牌（默认 admin / admin123）：</span>
          <input type="text" id="oc-au" placeholder="账号" style="max-width:140px;" />
          <input type="password" id="oc-ap" placeholder="密码" style="max-width:140px;" />
          <button class="btn btn-primary btn-sm" id="oc-alogin">获取令牌</button>
        </div>`;
        U.qs('#oc-alogin', authBox).addEventListener('click', async () => {
          const u = U.qs('#oc-au', authBox).value.trim();
          const p = U.qs('#oc-ap', authBox).value;
          if (!u || !p) return U.toast('error', '请填写账号与密码');
          try { await loginBackend(u, p); U.toast('success', '令牌已获取'); renderAuth(); loadTables(); search(); }
          catch (e) { U.toast('error', errMsg(e)); }
        });
      }
    }
    function needLogin() { renderAuth(); authBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); return U.toast('error', '请先登录后端管理员账号'); }

    async function loadTables() {
      let d;
      try { d = await (await apiFetch('/api/admin/tables')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.qs('#oc-tip', root).textContent = '加载表失败：' + errMsg(e); return; }
      TABLES = d.tables || {};
      const sel = U.qs('#oc-table', root);
      sel.innerHTML = '<option value="">— 选择 —</option>' + Object.keys(TABLES).map(t => `<option value="${t}">${U.esc(TABLES[t].label)}（${t}）</option>`).join('');
    }

    async function search() {
      const table = U.qs('#oc-table', root).value;
      const q = U.qs('#oc-q', root).value.trim();
      const list = U.qs('#oc-list', root);
      if (!table) { list.innerHTML = '<p class="text-muted">请先选择数据表</p>'; return; }
      list.innerHTML = '<p class="text-muted">搜索中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/records?table=' + encodeURIComponent(table) + '&q=' + encodeURIComponent(q) + '&limit=100')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); list.innerHTML = `<p class="text-muted">搜索失败：${U.esc(errMsg(e))}</p>`; return; }
      const rows = d.rows || [];
      if (!rows.length) { list.innerHTML = '<p class="text-muted text-center" style="padding:16px;">没有匹配的记录</p>'; return; }
      list.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">` + rows.map(r => `
        <button class="btn btn-ghost oc-row" data-id="${U.esc(String(r.id))}" style="text-align:left;justify-content:flex-start;white-space:normal;">
          <span style="font-size:11px;color:var(--text-muted);">#${U.esc(String(r.id))}</span>
          <span style="font-weight:600;">${U.esc(r.display || '(无名称)')}</span>
        </button>`).join('') + `</div>`;
      U.qsa('.oc-row', list).forEach(btn => btn.addEventListener('click', () => openRecord(table, btn.getAttribute('data-id'))));
    }

    async function openRecord(table, id) {
      const detail = U.qs('#oc-detail', root);
      const def = TABLES[table];
      U.qs('#oc-detail-id', root).textContent = `表：${table} · ID：${id}`;
      detail.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/record?table=' + encodeURIComponent(table) + '&id=' + encodeURIComponent(id))).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); detail.innerHTML = `<p class="text-muted">加载失败：${U.esc(errMsg(e))}</p>`; return; }
      const cols = d.columns || {};
      const jsonCols = d.jsonCols || [];
      const values = d.values || {};
      current = { table, id, def, jsonCols, values };
      const field = (c) => {
        const raw = values[c];
        const isJson = jsonCols.includes(c);
        const val = (raw == null ? '' : (isJson && typeof raw === 'string' ? raw : (isJson ? JSON.stringify(raw, null, 2) : String(raw))));
        return `<div style="margin-bottom:10px;">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px;">${U.esc(cols[c] || c)}${isJson ? '（JSON）' : ''}</label>
          ${isJson
            ? `<textarea class="oc-field" data-col="${U.esc(c)}" rows="6" style="width:100%;font-family:monospace;font-size:12px;">${U.esc(val)}</textarea>`
            : `<input type="text" class="oc-field" data-col="${U.esc(c)}" value="${U.esc(val)}" style="width:100%;" />`}
        </div>`;
      };
      detail.innerHTML = `
        <div style="margin-bottom:12px;">${Object.keys(cols).map(field).join('')}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <button class="btn btn-primary" id="oc-save">💾 保存修正</button>
          ${def.deletable ? '<button class="btn btn-danger" id="oc-del">🗑 删除该条</button>' : '<span class="text-muted" style="font-size:12px;">（该表不允许直接删除）</span>'}
        </div>
        <div id="oc-confirm" style="margin-top:12px;"></div>`;
      U.qs('#oc-save', detail).addEventListener('click', confirmSave);
      if (def.deletable) U.qs('#oc-del', detail).addEventListener('click', confirmDelete);
    }

    function collectChanges() {
      const detail = U.qs('#oc-detail', root);
      const changes = [];
      U.qsa('.oc-field', detail).forEach(el => {
        const c = el.getAttribute('data-col');
        const isJson = current.jsonCols.includes(c);
        let nv = el.value;
        if (isJson) { try { nv = JSON.parse(nv); } catch (e) { throw new Error('字段「' + c + '」不是合法 JSON，请修正后再保存'); } }
        const ov = current.values[c];
        const same = JSON.stringify(ov) === JSON.stringify(nv);
        if (!same) changes.push({ column: c, value: isJson ? JSON.stringify(nv) : nv });
      });
      return changes;
    }

    function confirmSave() {
      let changes;
      try { changes = collectChanges(); }
      catch (e) { return U.toast('error', errMsg(e)); }
      if (!changes.length) return U.toast('info', '没有字段被修改');
      const box = U.qs('#oc-confirm', root);
      const summary = changes.map(c => `· ${U.esc(c.column)}`).join('<br/>');
      box.innerHTML = `<div style="padding:10px;border-radius:10px;background:rgba(245,165,36,.10);font-size:13px;">
        <div style="margin-bottom:6px;">⚠️ 即将对 <b>${U.esc(current.table)} #${U.esc(String(current.id))}</b> 修改以下字段，修改将写入数据库并留审计痕迹：</div>
        <div style="margin-bottom:8px;">${summary}</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" id="oc-save-do">确认提交修改</button>
          <button class="btn btn-ghost btn-sm" id="oc-save-cancel">取消</button>
        </div></div>`;
      U.qs('#oc-save-cancel', box).addEventListener('click', () => { box.innerHTML = ''; });
      U.qs('#oc-save-do', box).addEventListener('click', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = '提交中…';
        try {
          for (const ch of changes) {
            await apiFetch('/api/admin/record', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: current.table, id: current.id, column: ch.column, value: ch.value }) });
          }
          U.toast('success', '已保存 ' + changes.length + ' 处修改');
          box.innerHTML = '';
          openRecord(current.table, current.id); // 刷新详情
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); ev.target.disabled = false; ev.target.textContent = '确认提交修改'; }
      });
    }

    function confirmDelete() {
      const box = U.qs('#oc-confirm', root);
      box.innerHTML = `<div style="padding:10px;border-radius:10px;background:rgba(229,72,77,.10);font-size:13px;">
        <div style="margin-bottom:6px;">⚠️ 即将<b>永久删除</b> <b>${U.esc(current.table)} #${U.esc(String(current.id))}</b>，此操作不可恢复。</div>
        <div style="margin-bottom:8px;">请在下方输入大写 <code>DELETE</code> 以确认：</div>
        <input type="text" id="oc-del-confirm" placeholder="输入 DELETE" style="max-width:160px;" />
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button class="btn btn-danger btn-sm" id="oc-del-do">确认删除</button>
          <button class="btn btn-ghost btn-sm" id="oc-del-cancel">取消</button>
        </div></div>`;
      U.qs('#oc-del-cancel', box).addEventListener('click', () => { box.innerHTML = ''; });
      U.qs('#oc-del-do', box).addEventListener('click', async (ev) => {
        const v = U.qs('#oc-del-confirm', box).value;
        if (v !== 'DELETE') return U.toast('error', '请输入大写 DELETE 确认');
        ev.target.disabled = true; ev.target.textContent = '删除中…';
        try {
          await apiFetch('/api/admin/record/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table: current.table, id: current.id, confirm: 'DELETE' }) });
          U.toast('success', '已删除该记录');
          box.innerHTML = '';
          U.qs('#oc-detail', root).innerHTML = '<p class="text-muted">记录已删除</p>';
          U.qs('#oc-detail-id', root).textContent = '';
          search();
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); ev.target.disabled = false; ev.target.textContent = '确认删除'; }
      });
    }

    U.qs('#oc-search', root).addEventListener('click', search);
    U.qs('#oc-q', root).addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
    U.qs('#oc-table', root).addEventListener('change', search);

    renderAuth();
    if (getToken()) { loadTables(); search(); }
    return root;
  };
})();
