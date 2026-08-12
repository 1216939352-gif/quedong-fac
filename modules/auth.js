/**
 * 鹊动系统 — 共享鉴权模块（选项2：前端统一令牌来源）
 *
 * 职责：
 *   - 维护登录令牌（localStorage 键 qd_admin_token，与 modules/admin.js 错误面板共用同一键）
 *   - 提供 authHeaders() 供同步/媒体/报错等所有需鉴权的请求附加 Bearer 令牌
 *   - 提供 showLogin() / ensureLogin()：需要登录时弹出轻量登录框（不阻断离线使用，可"稍后"关闭）
 *
 * 设计原则（离线优先）：
 *   - 登录是「按需」而非「启动强制」——没有令牌时本地功能照常；
 *     仅当联网访问受保护接口返回 401 时才弹登录框，登录成功后续自动恢复同步。
 *   - 弹窗提供「稍后」按钮，关闭后不影响本地录入；下次联网仍会按需重试。
 *
 * 依赖：无。需在使用前于 index.html 中 <script src="modules/auth.js"></script> 引入
 *      （建议放在 modules/sync.js 之前）。
 */
(function () {
  'use strict';

  const TOKEN_KEY = 'qd_admin_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {}
  }
  function authHeaders() {
    const t = getToken();
    return t ? { Authorization: 'Bearer ' + t } : {};
  }
  // 反代基址（与 sync.js 共用 sync_api_base；默认同源）
  function apiBase() {
    try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; }
  }

  async function login(username, password) {
    const r = await fetch(apiBase() + '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    });
    if (!r.ok) {
      let m = '登录失败';
      try { m = (await r.json()).error || m; } catch (e) {}
      // 服务端若只返回英文/错误码（非中文），统一替换为人话，避免泄露技术细节
      const friendly = /[一-龥]/.test(m) ? m : '账号或密码不正确，请重新输入';
      throw new Error(friendly);
    }
    const d = await r.json();
    setToken(d.token);
    return d.user;
  }

  // 注入一次样式（幂等）
  function ensureStyle() {
    if (document.getElementById('qd-auth-style')) return;
    const s = document.createElement('style');
    s.id = 'qd-auth-style';
    s.textContent = `
      #qd-login-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;
        align-items:center;justify-content:center;z-index:99999;font-family:system-ui,'Microsoft YaHei',sans-serif}
      .qd-login-card{background:#fff;border-radius:12px;padding:24px 28px;width:320px;max-width:90vw;
        box-shadow:0 12px 40px rgba(0,0,0,.25)}
      .qd-login-card h3{margin:0 0 16px;font-size:18px;color:#1f2d3d}
      .qd-login-card input{display:block;width:100%;box-sizing:border-box;margin-bottom:10px;
        padding:10px 12px;border:1px solid #d0d7de;border-radius:8px;font-size:14px}
      .qd-login-msg{color:#d93025;font-size:13px;min-height:18px;margin-bottom:8px}
      .qd-login-row{display:flex;gap:10px}
      .qd-login-row button{flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;cursor:pointer}
      #qd-login-btn{background:#2563eb;color:#fff}
      #qd-login-btn:disabled{opacity:.6;cursor:default}
      #qd-login-later{background:#eef1f5;color:#475569}
    `;
    document.head.appendChild(s);
  }

  /**
   * 弹出登录框。返回 Promise<user|null>（null = 用户点「稍后」）。
   * onLogin(user) 可选：登录成功回调。
   */
  function showLogin(onLogin) {
    return new Promise(function (resolve) {
      if (document.getElementById('qd-login-mask')) { resolve(null); return; } // 已在显示
      ensureStyle();
      const mask = document.createElement('div');
      mask.id = 'qd-login-mask';
      mask.innerHTML = `
        <div class="qd-login-card">
          <h3>登录鹊动系统</h3>
          <input id="qd-login-user" placeholder="账号" autocomplete="username"/>
          <input id="qd-login-pass" type="password" placeholder="密码" autocomplete="current-password"/>
          <div id="qd-login-msg" class="qd-login-msg"></div>
          <div class="qd-login-row">
            <button id="qd-login-later" type="button">稍后</button>
            <button id="qd-login-btn" type="button">登录</button>
          </div>
        </div>`;
      document.body.appendChild(mask);

      const userEl = mask.querySelector('#qd-login-user');
      const passEl = mask.querySelector('#qd-login-pass');
      const msgEl = mask.querySelector('#qd-login-msg');
      const btn = mask.querySelector('#qd-login-btn');
      const later = mask.querySelector('#qd-login-later');

      let done = false;
      function close(v) { if (done) return; done = true; mask.remove(); resolve(v); }
      function doLogin() {
        const u = userEl.value.trim();
        const p = passEl.value;
        if (!u || !p) { msgEl.textContent = '请输入账号和密码'; return; }
        btn.disabled = true; msgEl.textContent = '登录中…';
        login(u, p).then(function (usr) {
          if (onLogin) { try { onLogin(usr); } catch (e) {} }
          close(usr);
        }).catch(function (e) {
          btn.disabled = false; msgEl.textContent = (window.U && U.errMsg) ? U.errMsg(e) : (e.message || '登录失败');
        });
      }
      btn.addEventListener('click', doLogin);
      passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
      later.addEventListener('click', function () { close(null); });
      setTimeout(function () { userEl.focus(); }, 30);
    });
  }

  /**
   * 确保已登录：有令牌直接 resolve(true)；否则弹登录框。
   * opts.validate=true 时先以 /api/me 校验令牌是否过期，过期则重新登录。
   */
  function ensureLogin(opts) {
    opts = opts || {};
    const t = getToken();
    if (t) {
      if (opts.validate) {
        return fetch(apiBase() + '/api/me', { headers: authHeaders() }).then(function (r) {
          if (r.ok) return true;
          setToken('');
          return showLogin(opts.onLogin);
        }).catch(function () { return showLogin(opts.onLogin); });
      }
      return Promise.resolve(true);
    }
    return showLogin(opts.onLogin);
  }

  function logout() { setToken(''); }

  window.QDAuth = {
    TOKEN_KEY: TOKEN_KEY,
    getToken: getToken,
    setToken: setToken,
    authHeaders: authHeaders,
    login: login,
    showLogin: showLogin,
    ensureLogin: ensureLogin,
    logout: logout
  };
})();
