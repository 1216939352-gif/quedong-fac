/*
 * 运维管理工作台（管理员专属）
 * 批次1 MVP：①系统状态看板 ②报错报修闭环 ③数据备份与异地保存
 * 复用 errlog 的后端令牌机制（localStorage 'qd_admin_token' + 'sync_api_base'），
 * 后端接口：/api/admin/ops/status、/api/err-report、PATCH /api/admin/err-report/:id、
 * /api/admin/backup、/api/admin/backup/download
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

  // 返回 Response，自动处理鉴权失败（401/403 → TOKEN_EXPIRED）
  async function apiFetch(path, opts) {
    const token = getToken();
    if (!token) { const e = new Error('NO_TOKEN'); e.code = 'NO_TOKEN'; throw e; }
    const r = await fetch(`${apiBase()}${path}`, Object.assign({ headers: { Authorization: 'Bearer ' + token } }, opts || {}));
    if (r.status === 401 || r.status === 403) { setToken(''); const e = new Error('TOKEN_EXPIRED'); e.code = 'TOKEN_EXPIRED'; throw e; }
    if (!r.ok) { let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error) msg = j.error; } catch (e) {} const e = new Error(msg); e.code = 'HTTP'; throw e; }
    return r;
  }

  function fmtTs(ts) {
    if (!ts) return '—';
    let s = String(ts);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) s = s.replace(' ', 'T') + '+00:00';
    const d = new Date(s);
    return isNaN(d.getTime()) ? String(ts) : (U.fmtDate ? U.fmtDate(d.toISOString(), true) : String(ts));
  }

  function humanBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  const LEVEL_COLOR = { error: '#e5484d', resource: '#e5484d', unhandledrejection: '#f5a524', console: '#f5a524', warn: '#f5a524', info: '#12a594' };
  const STATUS_META = {
    open: { label: '待处理', color: '#e5484d', bg: 'rgba(229,72,77,.12)' },
    in_progress: { label: '处理中', color: '#f5a524', bg: 'rgba(245,165,36,.14)' },
    resolved: { label: '已解决', color: '#12a594', bg: 'rgba(18,165,148,.14)' }
  };
  const statusBadge = s => { const m = STATUS_META[s] || STATUS_META.open; return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;color:${m.color};background:${m.bg};">${m.label}</span>`; };

  window.Pages.ops = function () {
    const html = `
    <div class="page-head" style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap;">
      <h2 class="page-title" style="margin:0;">运维管理工作台</h2>
      <span class="text-muted" style="font-size:12px;">系统健康 · 报错报修 · 数据备份（仅管理员）</span>
    </div>

    <div id="ops-auth" class="card" style="margin:10px 0;"></div>

    <div class="ops-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
      <button class="btn btn-ghost ops-tab active" data-tab="status">💡 系统状态</button>
      <button class="btn btn-ghost ops-tab" data-tab="err">🐞 报错报修</button>
      <button class="btn btn-ghost ops-tab" data-tab="backup">🛡 数据备份</button>
      <button class="btn btn-ghost ops-tab" data-tab="restore">♻ 数据恢复</button>
    </div>

    <div class="ops-panel" id="ops-panel-status">
      <div class="card"><div class="card-body" id="ops-status-body"><p class="text-muted">加载中…</p></div></div>
    </div>
    <div class="ops-panel" id="ops-panel-err" style="display:none;">
      <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3 class="card-title">前端报错报修</h3><button class="btn btn-secondary btn-sm" id="ops-err-refresh">刷新</button></div><div class="card-body" id="ops-err-body"><p class="text-muted">点击「刷新」加载报错列表</p></div></div>
    </div>
    <div class="ops-panel" id="ops-panel-backup" style="display:none;">
      <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3 class="card-title">数据备份与异地保存</h3><button class="btn btn-secondary btn-sm" id="ops-backup-refresh">刷新</button></div><div class="card-body" id="ops-backup-body"><p class="text-muted">点击「刷新」查看备份状态</p></div></div>
    </div>
    <div class="ops-panel" id="ops-panel-restore" style="display:none;">
      <div class="card"><div class="card-header" style="display:flex;justify-content:space-between;align-items:center;"><h3 class="card-title">数据恢复（整库还原）</h3><button class="btn btn-secondary btn-sm" id="ops-restore-refresh">刷新</button></div><div class="card-body" id="ops-restore-body"><p class="text-muted">点击「刷新」加载可用备份点</p></div></div>
    </div>
    `;

    const root = U.el(`<div>${html}</div>`);

    // ── Tab 切换 ──
    U.qsa('.ops-tab', root).forEach(btn => {
      btn.addEventListener('click', () => {
        U.qsa('.ops-tab', root).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-tab');
        ['status', 'err', 'backup', 'restore'].forEach(t => {
          U.qs('#ops-panel-' + t, root).style.display = (t === tab) ? '' : 'none';
        });
      });
    });

    // ── 鉴权框 ──
    const authBox = U.qs('#ops-auth', root);
    function renderAuth() {
      if (getToken()) {
        authBox.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <span>🔗 已连接后端（管理员令牌有效）<span class="badge badge-success">已就绪</span></span>
          <button class="btn btn-ghost btn-sm" id="ops-relogin">重新登录</button></div>`;
        U.qs('#ops-relogin', authBox).addEventListener('click', () => { setToken(''); renderAuth(); });
      } else {
        authBox.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <span class="text-muted" style="font-size:13px;">需要后端管理员令牌（默认 admin / admin123）才能查看系统状态与备份：</span>
          <input type="text" id="ops-au" placeholder="账号" style="max-width:140px;" />
          <input type="password" id="ops-ap" placeholder="密码" style="max-width:140px;" />
          <button class="btn btn-primary btn-sm" id="ops-alogin">获取令牌</button>
        </div>`;
        U.qs('#ops-alogin', authBox).addEventListener('click', async () => {
          const u = U.qs('#ops-au', authBox).value.trim();
          const p = U.qs('#ops-ap', authBox).value;
          if (!u || !p) return U.toast('error', '请填写账号与密码');
          try {
            await loginBackend(u, p);
            U.toast('success', '令牌已获取');
            renderAuth();
            loadStatus(); loadErr(); loadBackup(); loadRestore();
          } catch (e) { U.toast('error', errMsg(e)); }
        });
      }
    }
    function needLogin() {
      renderAuth();
      authBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return U.toast('error', '请先登录后端管理员账号');
    }

    // ── 模块1：系统状态看板 ──
    async function loadStatus() {
      const body = U.qs('#ops-status-body', root);
      body.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/ops/status')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); body.innerHTML = `<p class="text-muted">状态获取失败：${U.esc(errMsg(e))}</p>`; return; }

      const h = d.health || {};
      const c = d.counts || {};
      const bk = d.backup || {};
      const vol = d.volume || {};
      const volOk = !!vol.railwayVolumeMount;
      const sameAsData = !!bk.sameAsData;
      const card = (icon, val, label, extra) => `
        <div class="metric-card">
          <div class="metric-card-icon">${icon}</div>
          <div class="metric-card-value">${U.esc(val)}</div>
          <div class="metric-card-label">${U.esc(label)}</div>
          ${extra || ''}
        </div>`;
      body.innerHTML = `
        <div style="margin-bottom:10px;">
          ${h.ok ? '<span class="badge badge-success">● 服务运行正常</span>' : '<span class="badge badge-danger">● 服务异常</span>'}
          <span class="text-muted" style="font-size:12px;margin-left:8px;">运行时长 ${h.uptimeSec ? Math.floor(h.uptimeSec / 60) + ' 分钟' : '—'} · Node ${U.esc(h.node || '—')}</span>
        </div>
        <div class="grid-4">
          ${card('📅', c.checkinsToday != null ? c.checkinsToday : '—', '今日打卡')}
          ${card('🩺', c.assessmentsToday != null ? c.assessmentsToday : '—', '今日评估')}
          ${card('📑', c.reportsToday != null ? c.reportsToday : '—', '今日报告')}
          ${card('🐞', c.errorsToday != null ? c.errorsToday : '—', '今日报错')}
          ${card('💾', (d.dbSize && d.dbSize.human) || '—', '数据库大小')}
          ${card('🛡', bk.count != null ? bk.count : 0, '备份份数', bk.lastBackupTs ? `<div class="text-muted" style="font-size:11px;">最近 ${U.esc(fmtTs(bk.lastBackupTs))}</div>` : '')}
          ${card('🖴', volOk ? '已挂载' : '未挂载', '持久卷', `<div style="font-size:11px;color:${volOk ? 'var(--success)' : 'var(--danger)'};">${volOk ? '数据已持久化' : '⚠️ 重部署会丢数据'}</div>`)}
          ${card('👥', `${c.users != null ? c.users : '—'} / ${c.patients != null ? c.patients : '—'}`, '用户 / 患者')}
        </div>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;">
          ${sameAsData ? '<div class="alert alert-warning" style="margin:0;">⚠️ 当前备份与数据库在同一目录，建议定期「下载最新备份」做异地保存。</div>' : ''}
          ${!volOk ? '<div class="alert alert-danger" style="margin:0;">⚠️ 未检测到持久卷挂载，每次重部署将清空线上数据，请尽快处理。</div>' : ''}
          ${(c.errorsTotal || 0) > 0 ? `<div class="alert alert-info" style="margin:0;">累计历史报错 ${c.errorsTotal} 条，可到「报错报修」中查看与处理。</div>` : ''}
        </div>
      `;
    }

    // ── 模块2：报错报修闭环 ──
    async function loadErr() {
      const body = U.qs('#ops-err-body', root);
      body.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/err-report')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); body.innerHTML = `<p class="text-muted">加载失败：${U.esc(errMsg(e))}</p>`; return; }

      const rows = (d.rows || []).map(r => {
        const loc = r.line ? `${r.line}:${r.col || 0}` : '—';
        const stack = r.stack ? `<details style="margin-top:4px;"><summary class="text-muted" style="font-size:12px;cursor:pointer;">堆栈</summary><pre style="font-size:11px;white-space:pre-wrap;margin:4px 0 0;">${U.esc(String(r.stack).slice(0, 1500))}</pre></details>` : '';
        const opts = ['open', 'in_progress', 'resolved'].map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${STATUS_META[s].label}</option>`).join('');
        return `<tr data-id="${r.id}">
          <td style="font-size:12px;white-space:nowrap;">${U.esc(r.ts || '')}</td>
          <td><span style="color:${LEVEL_COLOR[r.level] || 'var(--text-muted)'};font-weight:600;font-size:12px;">${U.esc(r.level || '')}</span></td>
          <td style="font-size:12px;">${U.esc(String(r.msg || '').slice(0, 200))}${stack}${r.note ? `<div class="text-muted" style="font-size:11px;margin-top:4px;">📝 ${U.esc(String(r.note).slice(0, 200))}</div>` : ''}</td>
          <td style="font-size:12px;">${U.esc(loc)}</td>
          <td>${statusBadge(r.status || 'open')}</td>
          <td>
            <select class="ops-err-status" style="max-width:110px;">${opts}</select>
            <button class="btn btn-ghost btn-sm ops-err-note" title="添加备注">📝</button>
            <button class="btn btn-primary btn-sm ops-err-save">保存</button>
          </td>
        </tr>`;
      }).join('');
      body.innerHTML = (d.rows && d.rows.length)
        ? `<table class="data-table"><thead><tr><th style="width:140px;">时间</th><th style="width:90px;">级别</th><th>信息</th><th style="width:70px;">位置</th><th style="width:80px;">状态</th><th style="width:210px;">处理</th></tr></thead><tbody>${rows}</tbody></table>`
        : '<p class="text-muted text-center" style="padding:20px;">暂无报错记录 —— 系统运行正常</p>';

      U.qsa('.ops-err-save', body).forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr'); const id = tr.getAttribute('data-id');
          const status = U.qs('.ops-err-status', tr).value;
          try {
            await apiFetch('/api/admin/err-report/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
            U.toast('success', '已更新状态');
            loadErr();
          } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); }
        });
      });
      U.qsa('.ops-err-note', body).forEach(btn => {
        btn.addEventListener('click', async () => {
          const tr = btn.closest('tr'); const id = tr.getAttribute('data-id');
          const note = prompt('填写处理备注：', '');
          if (note === null) return;
          try {
            await apiFetch('/api/admin/err-report/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
            U.toast('success', '备注已保存');
            loadErr();
          } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); }
        });
      });
    }

    // ── 模块3：数据备份与异地保存 ──
    async function loadBackup() {
      const body = U.qs('#ops-backup-body', root);
      body.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/ops/status')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); body.innerHTML = `<p class="text-muted">加载失败：${U.esc(errMsg(e))}</p>`; return; }
      const bk = d.backup || {};
      const sameAsData = !!bk.sameAsData;
      body.innerHTML = `
        <div class="grid-4">
          <div class="metric-card"><div class="metric-card-icon">🛡</div><div class="metric-card-value">${bk.count != null ? bk.count : 0}</div><div class="metric-card-label">备份份数</div></div>
          <div class="metric-card"><div class="metric-card-icon">🕒</div><div class="metric-card-value" style="font-size:18px;">${U.esc(fmtTs(bk.lastBackupTs))}</div><div class="metric-card-label">最近备份时间</div></div>
          <div class="metric-card"><div class="metric-card-icon">📁</div><div class="metric-card-value" style="font-size:14px;">${bk.lastBackup ? U.esc(bk.lastBackup) : '—'}</div><div class="metric-card-label">最新备份目录</div></div>
          <div class="metric-card"><div class="metric-card-icon">📡</div><div class="metric-card-value" style="font-size:16px;">${sameAsData ? '同目录' : '异地'}</div><div class="metric-card-label">备份位置</div></div>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="ops-do-backup">⬇️ 立即备份</button>
          <button class="btn btn-secondary" id="ops-do-download">📥 下载最新备份</button>
        </div>
        ${sameAsData ? '<div class="alert alert-warning" style="margin-top:12px;">⚠️ 备份与数据库同目录，建议定期下载到本地/异地保管，避免同机故障一起丢失。</div>' : ''}
        <p class="text-muted" style="font-size:12px;margin-top:10px;">系统每天 02:00 自动热备份；「立即备份」可随时手动补一份；「下载最新备份」为 tar.gz 压缩包，可保存到手机或电脑。</p>
      `;
      U.qs('#ops-do-backup', body).addEventListener('click', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = '备份中…';
        try {
          await apiFetch('/api/admin/backup', { method: 'POST' });
          U.toast('success', '备份完成');
          loadBackup(); loadStatus();
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); }
        finally { ev.target.disabled = false; ev.target.textContent = '⬇️ 立即备份'; }
      });
      U.qs('#ops-do-download', body).addEventListener('click', async () => {
        try {
          const r = await apiFetch('/api/admin/backup/download');
          const blob = await r.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'quedong-backup.tar.gz';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          U.toast('success', '已开始下载');
        } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); U.toast('error', errMsg(e)); }
      });
    }

    // ── 模块4：数据恢复（整库还原，两步确认 + 还原前自动快照）──
    async function loadRestore() {
      const body = U.qs('#ops-restore-body', root);
      body.innerHTML = '<p class="text-muted">加载中…</p>';
      let d;
      try { d = await (await apiFetch('/api/admin/backups')).json(); }
      catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); body.innerHTML = `<p class="text-muted">加载失败：${U.esc(errMsg(e))}</p>`; return; }
      const list = (d.backups || []);
      if (!list.length) {
        body.innerHTML = '<p class="text-muted text-center" style="padding:18px;">暂无可用备份点。请先到「数据备份」生成备份，再回到此处做整库还原。</p>';
        return;
      }
      const rowHtml = list.map(b => `
        <div class="ops-bk-row" data-name="${U.esc(b.name)}" style="border:1px solid var(--border,#e5e7eb);border-radius:12px;padding:12px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <div style="font-weight:600;">📦 ${U.esc(b.name)}</div>
              <div class="text-muted" style="font-size:12px;">${U.esc(fmtTs(b.createdAt))}${b.dbBytes != null ? ' · 库 ' + humanBytes(b.dbBytes) : ''}${b.mediaFiles != null ? ' · 媒体 ' + b.mediaFiles + ' 文件' : ''}</div>
            </div>
            <button class="btn btn-warning btn-sm ops-bk-restore">♻ 恢复到此备份</button>
          </div>
          <div class="ops-bk-confirm" style="display:none;margin-top:10px;padding:10px;border-radius:10px;background:rgba(229,72,77,.08);"></div>
        </div>`).join('');
      body.innerHTML = `
        <div class="alert alert-warning" style="margin-bottom:12px;">
          ⚠️ <b>整库还原</b>会用所选备份点<b>覆盖当前全部数据</b>（患者、医生、报告等），影响所有用户，且执行后立即重启服务。<br/>
          系统会<b>先自动对当前状态生成一份快照</b>（可在「数据备份」中下载找回），执行后仍可借此回退。请谨慎操作。
        </div>
        ${rowHtml}`;
      U.qsa('.ops-bk-restore', body).forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.ops-bk-row');
          const name = row.getAttribute('data-name');
          const box = U.qs('.ops-bk-confirm', row);
          box.innerHTML = `
            <div style="font-size:13px;color:#e5484d;margin-bottom:8px;">确认用备份 <b>${U.esc(name)}</b> 覆盖当前全部数据？此操作会重启服务，覆盖后原数据需靠刚才自动生成的快照找回。</div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-danger btn-sm ops-bk-do">确认恢复（执行后重启）</button>
              <button class="btn btn-ghost btn-sm ops-bk-cancel">取消</button>
            </div>`;
          box.style.display = 'block';
          U.qs('.ops-bk-cancel', box).addEventListener('click', () => { box.style.display = 'none'; box.innerHTML = ''; });
          U.qs('.ops-bk-do', box).addEventListener('click', async (ev) => {
            ev.target.disabled = true; ev.target.textContent = '恢复中…';
            try {
              const r = await apiFetch('/api/admin/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
              const j = await r.json();
              box.innerHTML = `<div style="color:var(--success,#12a594);font-size:13px;">✅ ${U.esc(j.message || '恢复成功')}。服务即将重启，页面会自动刷新，请稍候重新登录。</div>`;
              setTimeout(() => location.reload(), 2500);
            } catch (e) { if (e.code === 'NO_TOKEN' || e.code === 'TOKEN_EXPIRED') return needLogin(); box.innerHTML = `<div style="color:#e5484d;font-size:13px;">❌ ${U.esc(errMsg(e))}</div>`; }
          });
        });
      });
    }

    U.qs('#ops-err-refresh', root).addEventListener('click', loadErr);
    U.qs('#ops-backup-refresh', root).addEventListener('click', loadBackup);
    U.qs('#ops-restore-refresh', root).addEventListener('click', loadRestore);

    renderAuth();
    loadStatus();
    loadRestore();
    return root;
  };
})();
