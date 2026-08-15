/*
 * 运维管理工作台 · 运维开关台（批次2 模块④/⑥）
 * 路径：#/ops-switch
 * 能力：①AI 解读总开关（写入 settings.ai_enabled，云端/本地模型统一降级）
 *       ②受限重启（仅退出当前进程，由 Railway/nssm 自动拉起，不拉新代码）
 *       ③管理员改密（POST /api/admin/change-password）
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

  window.Pages.opsSwitch = function () {
    const html = `
    <div class="page-head" style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap;">
      <h2 class="page-title" style="margin:0;">运维开关台</h2>
      <span class="text-muted" style="font-size:12px;">AI 总开关 · 服务重启 · 账号安全（仅管理员）</span>
    </div>

    <div id="os-auth" class="card" style="margin:10px 0;"></div>

    <div class="card" style="margin:10px 0;">
      <div class="card-header"><h3 class="card-title">🤖 AI 解读总开关</h3></div>
      <div class="card-body" id="os-ai"><p class="text-muted">登录后加载</p></div>
    </div>

    <div class="card" style="margin:10px 0;">
      <div class="card-header"><h3 class="card-title">🔄 服务重启（受限端点）</h3></div>
      <div class="card-body" id="os-restart"><p class="text-muted">登录后加载</p></div>
    </div>

    <div class="card" style="margin:10px 0;">
      <div class="card-header"><h3 class="card-title">🔑 管理员改密</h3></div>
      <div class="card-body" id="os-pwd"><p class="text-muted">登录后加载</p></div>
    </div>
    `;

    const root = U.el(`<div>${html}</div>`);
    const authBox = U.qs('#os-auth', root);

    function renderAuth() {
      if (getToken()) {
        authBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <span>🔗 已连接后端（管理员令牌有效）<span class="badge badge-success">已就绪</span></span>
          <button class="btn btn-ghost btn-sm" id="os-relogin">重新登录</button></div>`;
        U.qs('#os-relogin', authBox).addEventListener('click', () => { setToken(''); renderAuth(); });
      } else {
        authBox.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span class="text-muted" style="font-size:13px;">需要后端管理员令牌（默认 admin / admin123）：</span>
          <input type="text" id="os-au" placeholder="账号" style="max-width:140px;" />
          <input type="password" id="os-ap" placeholder="密码" style="max-width:140px;" />
          <button class="btn btn-primary btn-sm" id="os-alogin">获取令牌</button>
        </div>`;
        U.qs('#os-alogin', authBox).addEventListener('click', async () => {
          const u = U.qs('#os-au', authBox).value.trim();
          const p = U.qs('#os-ap', authBox).value;
          if (!u || !p) return U.toast('error', '请填写账号与密码');
          try { await loginBackend(u, p); U.toast('success', '令牌已获取'); renderAuth(); loadAll(); }
          catch (e) { U.toast('error', errMsg(e)); }
        });
      }
    }
    function needLogin() { renderAuth(); authBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); return U.toast('error', '请先登录后端管理员账号'); }

    // ── AI 总开关 ──
    async function loadAI() {
      const box = U.qs('#os-ai', root);
      box.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/settings')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); box.innerHTML = `<p class="text-muted">加载失败：${U.esc(errMsg(e))}</p>`; return; }
      const on = d.settings && d.settings.ai_enabled !== 'false' && d.settings.ai_enabled !== '0';
      box.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <label class="switch" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="os-ai-toggle" ${on ? 'checked' : ''} style="width:18px;height:18px;" />
            <span style="font-weight:600;">${on ? 'AI 功能已开启' : 'AI 功能已关闭'}</span>
          </label>
          <span class="text-muted" style="font-size:12px;">关闭后所有 AI 端点（问答/方案/解读/报告解析）统一返回「已停用」</span>
        </div>
        <div id="os-ai-msg" style="margin-top:8px;font-size:13px;"></div>`;
      U.qs('#os-ai-toggle', box).addEventListener('change', async (ev) => {
        const next = ev.target.checked ? 'true' : 'false';
        const msg = U.qs('#os-ai-msg', box);
        ev.target.disabled = true;
        try {
          await apiFetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'ai_enabled', value: next }) });
          U.toast('success', next === 'true' ? 'AI 功能已开启' : 'AI 功能已关闭');
          msg.innerHTML = `<span style="color:var(--success,#12a594);">✅ 已更新为 ${next === 'true' ? '开启' : '关闭'}</span>`;
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); ev.target.checked = !ev.target.checked; }
        finally { ev.target.disabled = false; }
      });
    }

    // ── 受限重启 ──
    async function loadRestart() {
      const box = U.qs('#os-restart', root);
      box.innerHTML = `
        <p class="text-muted" style="font-size:13px;margin:0 0 10px;">仅退出当前运行进程，由运行环境（Railway / nssm）自动重新拉起——<b>不会拉取新代码</b>，相当于一次「热重启」。如遇卡死或配置未生效，可用此操作。</p>
        <button class="btn btn-warning" id="os-restart-btn">🔄 立即重启服务</button>
        <div id="os-restart-msg" style="margin-top:8px;font-size:13px;"></div>`;
      U.qs('#os-restart-btn', box).addEventListener('click', async (ev) => {
        if (!confirm('确认重启服务？重启期间系统约数十秒不可用，进行中的操作会中断。')) return;
        ev.target.disabled = true; ev.target.textContent = '重启中…';
        try {
          const r = await apiFetch('/api/admin/restart', { method: 'POST' });
          const j = await r.json();
          U.qs('#os-restart-msg', box).innerHTML = `<span style="color:var(--success,#12a594);">✅ ${U.esc(j.message || '已触发重启')}。页面即将失效，请稍候刷新重新登录。</span>`;
          setTimeout(() => location.reload(), 2500);
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.qs('#os-restart-msg', box).innerHTML = `<span style="color:#e5484d;">❌ ${U.esc(errMsg(e))}</span>`; ev.target.disabled = false; ev.target.textContent = '🔄 立即重启服务'; }
      });
    }

    // ── 管理员改密 ──
    async function loadPwd() {
      const box = U.qs('#os-pwd', root);
      box.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="os-pwd-user" placeholder="目标账号（如 admin）" style="min-width:160px;" />
          <input type="password" id="os-pwd-new" placeholder="新密码（≥6 位）" style="min-width:160px;" />
          <button class="btn btn-primary btn-sm" id="os-pwd-btn">修改密码</button>
        </div>
        <div id="os-pwd-msg" style="margin-top:8px;font-size:13px;"></div>`;
      U.qs('#os-pwd-btn', box).addEventListener('click', async (ev) => {
        const username = U.qs('#os-pwd-user', box).value.trim();
        const newPassword = U.qs('#os-pwd-new', box).value;
        if (!username || !newPassword) return U.toast('error', '请填写账号与新密码');
        if (newPassword.length < 6) return U.toast('error', '新密码至少 6 位');
        ev.target.disabled = true;
        try {
          await apiFetch('/api/admin/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, newPassword }) });
          U.toast('success', '密码已修改');
          U.qs('#os-pwd-msg', box).innerHTML = `<span style="color:var(--success,#12a594);">✅ 账号 ${U.esc(username)} 密码已更新</span>`;
          U.qs('#os-pwd-new', box).value = '';
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); U.qs('#os-pwd-msg', box).innerHTML = `<span style="color:#e5484d;">❌ ${U.esc(errMsg(e))}</span>`; }
        finally { ev.target.disabled = false; }
      });
    }

    async function loadAll() { await loadAI(); loadRestart(); loadPwd(); }

    renderAuth();
    if (getToken()) loadAll();
    return root;
  };
})();
