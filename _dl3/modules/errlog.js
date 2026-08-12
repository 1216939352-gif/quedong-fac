/*
 * 系统报错日志（超级管理员专属）
 * 从原「系统管理后台」中抽取，独立为超级管理员（superadmin）专用页面。
 * 复用前端统一报错采集 SDK（window.ErrSDK）与后端 /api/err-report 落库列表。
 */
(function () {
  if (!window.Pages) window.Pages = {};

  window.Pages.errLog = function () {
    const html = `
      <div class="page-head" style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <h2 class="page-title" style="margin:0;">系统报错日志</h2>
        <span class="text-muted" style="font-size:12px;">仅超级管理员可访问 · 前端异常自动上报到本地后端，后端未启动时暂存本机、联网后自动补发</span>
      </div>
      <div class="card" style="margin-top:12px;">
        <div class="card-header"><h3 class="card-title">系统报错日志</h3>
          <span class="text-muted" style="font-size:12px;">前端异常自动上报到本地后端；后端未启动时暂存本机、联网后自动补发</span>
        </div>
        <div class="card-body">
          <div id="err-status" class="text-muted" style="font-size:13px;margin-bottom:10px;">检测中…</div>
          <div class="topbar-actions" style="margin-bottom:12px;">
            <button class="btn btn-secondary btn-sm" id="err-refresh">刷新</button>
            <button class="btn btn-ghost btn-sm" id="err-test">发送测试报错</button>
            <button class="btn btn-ghost btn-sm" id="err-flush">立即补发队列</button>
            <button class="btn btn-warning btn-sm" id="err-clear">清空本地队列</button>
          </div>
          <div id="err-auth" style="display:none;margin-bottom:12px;padding:12px;border:1px solid var(--border-color);border-radius:8px;">
            <p class="text-muted" style="font-size:12px;margin:0 0 8px;">查看后端已落库的报错需后端管理员令牌（后端账号，默认 admin / admin123）</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input type="text" id="err-user" placeholder="后端账号" style="max-width:150px;" />
              <input type="password" id="err-pwd" placeholder="密码" style="max-width:150px;" />
              <button class="btn btn-primary btn-sm" id="err-login">获取令牌</button>
            </div>
          </div>
          <div id="err-list"></div>
        </div>
      </div>
    `;

    const root = U.el(`<div>${html}</div>`);

    // ───────── 系统报错日志 ─────────
    (function initErrPanel() {
      const TOKEN_KEY = 'qd_admin_token';
      const apiBase = (() => { try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; } })();
      const statusEl = U.qs('#err-status', root);
      const listEl = U.qs('#err-list', root);
      const authBox = U.qs('#err-auth', root);

      const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } };
      const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };

      const LEVEL_COLOR = {
        error: '#e5484d', resource: '#e5484d', unhandledrejection: '#f5a524',
        console: '#f5a524', warn: '#f5a524', info: '#12a594'
      };

      function renderLocal() {
        const st = window.ErrSDK ? window.ErrSDK.status() : null;
        if (!st) { statusEl.innerHTML = '<span style="color:#e5484d;">报错 SDK 未加载</span>'; return; }
        statusEl.innerHTML =
          `采集：<b>${st.enabled ? '已开启' : '已关闭'}</b>　` +
          `本机待发：<b>${st.pending}</b> 条　` +
          `本次会话已上报：<b>${st.sentThisSession}</b> 条　` +
          `后端：<b>${U.esc(st.apiBase)}</b>` +
          (st.lastError ? `　<span style="color:#f5a524;">（上次补发失败：${U.esc(st.lastError)}，后端未启动时属正常）</span>` : '');
      }

      function renderRows(rows) {
        if (!rows.length) {
          listEl.innerHTML = '<p class="text-muted text-center" style="padding:20px;">后端暂无报错记录 —— 系统运行正常</p>';
          return;
        }
        listEl.innerHTML = `
          <table class="data-table">
            <thead><tr><th style="width:150px;">时间</th><th style="width:110px;">级别</th><th>信息</th><th style="width:80px;">位置</th></tr></thead>
            <tbody>${rows.map(r => {
              const color = LEVEL_COLOR[r.level] || 'var(--text-muted)';
              const loc = r.line ? `${r.line}:${r.col || 0}` : '—';
              const stack = r.stack ? `<details style="margin-top:4px;"><summary class="text-muted" style="font-size:12px;cursor:pointer;">堆栈</summary><pre style="font-size:11px;white-space:pre-wrap;margin:4px 0 0;">${U.esc(String(r.stack).slice(0, 1500))}</pre></details>` : '';
              return `<tr>
                <td style="font-size:12px;">${U.esc(r.ts || '')}</td>
                <td><span style="color:${color};font-weight:600;font-size:12px;">${U.esc(r.level || '')}</span></td>
                <td style="font-size:12px;">${U.esc(String(r.msg || '').slice(0, 300))}${stack}</td>
                <td style="font-size:12px;">${U.esc(loc)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>`;
      }

      async function loadRemote() {
        const token = getToken();
        if (!token) { authBox.style.display = ''; listEl.innerHTML = ''; return; }
        try {
          const r = await fetch(`${apiBase}/api/err-report`, { headers: { Authorization: 'Bearer ' + token } });
          if (r.status === 401 || r.status === 403) { setToken(''); authBox.style.display = ''; listEl.innerHTML = '<p class="text-muted">令牌已过期，请重新获取。</p>'; return; }
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const d = await r.json();
          authBox.style.display = 'none';
          renderRows(d.rows || []);
        } catch (e) {
          listEl.innerHTML = `<p class="text-muted" style="padding:16px;">无法连接后端（${U.esc(U.errMsg(e))}）。本机报错已暂存，后端启动后自动补发。</p>`;
        }
      }

      async function refresh() { renderLocal(); await loadRemote(); }

      U.qs('#err-refresh', root).addEventListener('click', refresh);
      U.qs('#err-login', root).addEventListener('click', async () => {
        const username = U.qs('#err-user', root).value.trim();
        const password = U.qs('#err-pwd', root).value;
        if (!username || !password) return U.toast('error', '请填写后端账号与密码');
        try {
          const r = await fetch(`${apiBase}/api/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const d = await r.json();
          if (!r.ok) return U.toast('error', d.error || '登录失败');
          if (d.user && d.user.role !== 'admin') return U.toast('error', '该账号非管理员');
          setToken(d.token);
          U.qs('#err-pwd', root).value = '';
          U.toast('success', '令牌已获取');
          refresh();
        } catch (e) { U.toast('error', '无法连接后端，请确认本地服务已启动'); }
      });
      U.qs('#err-test', root).addEventListener('click', async () => {
        if (!window.ErrSDK) return U.toast('error', '报错 SDK 未加载');
        await window.ErrSDK.test();
        U.toast('success', '测试报错已发送');
        refresh();
      });
      U.qs('#err-flush', root).addEventListener('click', async () => {
        if (!window.ErrSDK) return;
        const r = await window.ErrSDK.flush();
        U.toast(r.sent ? 'success' : 'info', `补发完成：成功 ${r.sent} 条，剩余 ${r.left} 条`);
        refresh();
      });
      U.qs('#err-clear', root).addEventListener('click', () => {
        if (!window.ErrSDK) return;
        if (!confirm('清空本机未发送的报错队列？该操作不影响后端已落库的记录。')) return;
        window.ErrSDK.clear();
        U.toast('success', '本地队列已清空');
        refresh();
      });

      refresh();
    })();

    return root;
  };
})();
