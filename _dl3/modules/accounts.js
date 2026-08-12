/**
 * 鹊动FAC功能评估与干预系统 - 超级管理员 · 账号管理（仅超级管理员可访问）
 * 管理全部账号（超级管理员 / 管理员 / 医生），含自保护规则：
 *   - 不能删除或降级当前登录的自己
 *   - 不能删除 / 降级系统中最后一名超级管理员（否则将无人可管理账号）
 * 复用 admin.js 的 UI 模式（U.modal / DB / DoctorGroups 等），但角色下拉包含 superadmin。
 */
(function () {
  'use strict';

  function loadUsers() {
    return DB.getUsers();
  }

  function statusBadge(u) {
    if (u.status === 'frozen') {
      return u.frozenReason === 'expired'
        ? '<span class="badge badge-danger">已到期冻结</span>'
        : '<span class="badge badge-danger">已冻结</span>';
    }
    if (u.status === 'active') return '<span class="badge badge-success">正常</span>';
    return `<span class="badge badge-info">${U.esc(u.status)}</span>`;
  }

  function expireLabel(u) {
    if (!u.expireAt) return '<span class="text-muted">永久有效</span>';
    const expired = isUserExpired(u);
    const txt = U.fmtDate(u.expireAt);
    return expired
      ? `<span style="color:var(--danger);font-weight:600;">已到期 ${U.esc(txt)}</span>`
      : U.esc(txt);
  }

  function roleBadgeHtml(u) {
    if (u.role === 'superadmin') return '<span class="badge badge-super">超级管理员</span>';
    if (u.role === 'admin') return '<span class="badge badge-warning">管理员</span>';
    return '<span class="badge badge-info">医生</span>';
  }

  function groupTagsHtml(u) {
    const gids = u.groupIds || [];
    if (!gids.length) return '<span class="text-muted">未分组</span>';
    const DG = window.DoctorGroups;
    return gids.map(id => { const g = DG ? DG.get(id) : null; return `<span class="ip-tag">${U.esc((g && g.name) || id)}</span>`; }).join(' ');
  }

  function isCurrentUser(u) {
    return !!(AppState.currentUser && u && u.username === AppState.currentUser.username);
  }
  /* 是否为系统中最后一名超级管理员（含待判定账号） */
  function isLastSuperadmin(users, username) {
    const t = users.find(u => u.username === username);
    if (!t || t.role !== 'superadmin') return false;
    return users.filter(u => u.role === 'superadmin').length <= 1;
  }

  function renderUserTable(users) {
    return `
    <div class="adm-table-wrap">
      <table class="data-table adm-user-table">
        <thead><tr>
          <th>用户</th>
          <th>角色 / 科室</th>
          <th>所属分组</th>
          <th>状态 / 有效期</th>
          <th>开通 / 最后登录</th>
          <th>AI 辅助</th>
          <th class="adm-th-actions">操作</th>
        </tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td class="adm-td-user">
                <div class="adm-username">${U.esc(u.username)}</div>
                <div class="adm-displayname">${U.esc(u.displayName || '—')}</div>
              </td>
              <td class="adm-td-role">
                ${roleBadgeHtml(u)}
                ${u.role === 'doctor' && u.dept ? `<div class="adm-dept">${U.esc(u.dept)}</div>` : ''}
              </td>
              <td class="adm-td-groups">${u.role === 'doctor' ? groupTagsHtml(u) : '<span class="text-muted">—</span>'}</td>
              <td class="adm-td-status">
                ${statusBadge(u)}
                <div class="adm-expire">${expireLabel(u)}</div>
              </td>
              <td class="adm-td-time">
                <div>开通 ${U.fmtDate(u.createdAt)}</div>
                <div>最后 ${u.lastLogin ? U.fmtDate(u.lastLogin, true) : '—'}</div>
              </td>
              <td class="adm-td-ai">
                ${isAdminRole(u) ? '<span class="badge badge-ai-on">已开通</span>' : (u.aiMode ? '<span class="badge badge-ai-on">已开通</span>' : '<span class="badge badge-ai-off">未开通</span>')}
              </td>
              <td class="adm-td-actions">
                ${isCurrentUser(u) ? '<span class="text-muted">当前账号</span>' : `
                  <div class="adm-actions">
                    <button class="btn btn-ghost btn-sm acc-edit" data-user="${u.username}">编辑</button>
                    <button class="btn btn-ghost btn-sm acc-toggle" data-user="${u.username}" data-status="${u.status}">${u.status === 'frozen' ? '解冻' : '冻结'}</button>
                    <button class="btn btn-secondary btn-sm acc-reset" data-user="${u.username}">重置</button>
                    <button class="btn btn-danger btn-sm acc-del" data-user="${u.username}">删除</button>
                  </div>
                `}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  Pages.accounts = async function () {
    const users = await loadUsers();
    const superCount = users.filter(u => u.role === 'superadmin').length;
    const adminCount = users.filter(u => u.role === 'admin').length;
    const activeDoctors = users.filter(u => u.role === 'doctor' && u.status === 'active').length;
    const total = users.length;

    const html = `
    <div class="page-header"><div>
      <p class="text-muted">超级管理员专属 · 管理平台全部账号（超级管理员 / 管理员 / 医生）</p>
    </div></div>

    <div class="grid-4">
      <div class="metric-card">
        <div class="metric-card-icon">👑</div>
        <div class="metric-card-value">${superCount}</div>
        <div class="metric-card-label">超级管理员</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">⚡</div>
        <div class="metric-card-value">${adminCount}</div>
        <div class="metric-card-label">管理员</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">👨‍⚕️</div>
        <div class="metric-card-value">${activeDoctors}</div>
        <div class="metric-card-label">活跃医生</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">👥</div>
        <div class="metric-card-value">${total}</div>
        <div class="metric-card-label">全平台总账号</div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">账号管理</h3>
        <button class="btn btn-primary btn-sm" id="acc-add">新增账号</button>
      </div>
      <div class="card-body" id="acc-users" style="padding:0;">${renderUserTable(users)}</div>
    </div>
    `;

    const root = U.el(`<div>${html}</div>`);

    async function refreshUsers() {
      const us = await loadUsers();
      U.qs('#acc-users', root).innerHTML = renderUserTable(us);
      bindUserOps();
    }

    function bindUserOps() {
      U.qsa('.acc-edit', root).forEach(btn => btn.addEventListener('click', async () => {
        const u = await DB.findUserByUsername(btn.dataset.user);
        if (u) openEditModal(u);
      }));
      U.qsa('.acc-toggle', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user, cur = btn.dataset.status;
        const next = cur === 'frozen' ? 'active' : 'frozen';
        const target = await DB.findUserByUsername(uname);
        // 自保护：不能冻结当前登录的自己
        if (next === 'frozen' && isCurrentUser(target)) { U.toast('error', '不能冻结当前登录的账号'); return; }
        if (next === 'active') {
          if (isUserExpired(target)) {
            U.toast('warning', '该账号已到期，请先设置新有效期（续期）后再解冻');
            openEditModal(target, true);
            return;
          }
          if (!confirm(`确认解冻账号 ${uname}？`)) return;
          await DB.updateUser(target.id, { status: 'active', frozenReason: null });
          U.toast('success', '账号已解冻');
        } else {
          if (!confirm(`确认冻结账号 ${uname}？`)) return;
          await DB.updateUser(target.id, { status: 'frozen', frozenReason: 'manual' });
          U.toast('success', '账号已冻结');
        }
        refreshUsers();
      }));
      U.qsa('.acc-reset', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user;
        if (!confirm(`确认将 ${uname} 的密码重置为 123456？`)) return;
        const u = await DB.findUserByUsername(uname);
        await DB.updateUser(u.id, { password: '123456' });
        U.toast('success', '密码已重置为 123456');
      }));
      U.qsa('.acc-del', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user;
        const all = await loadUsers();
        // 自保护：不能删除自己
        if (isCurrentUser({ username: uname })) { U.toast('error', '不能删除当前登录的账号'); return; }
        // 自保护：不能删除最后一名超级管理员
        if (isLastSuperadmin(all, uname)) { U.toast('error', '不能删除系统中最后一名超级管理员'); return; }
        if (!confirm(`危险操作：确认删除账号 ${uname}？该操作不可恢复！`)) return;
        const u = await DB.findUserByUsername(uname);
        await DB.deleteUser(u.id);
        U.toast('success', '账号已删除');
        refreshUsers();
      }));
    }
    bindUserOps();

    /* 角色下拉：超级管理员页可直接赋予三种角色；编辑自己时锁定为 superadmin（不可降级） */
    function roleOptionsHTML(currentRole, lockSelf) {
      const opts = [['doctor', '医生'], ['admin', '管理员'], ['superadmin', '超级管理员']];
      return opts.map(([v, l]) => {
        const selected = currentRole === v ? 'selected' : '';
        const disabled = (lockSelf && v !== 'superadmin') ? 'disabled' : '';
        return `<option value="${v}" ${selected} ${disabled}>${l}</option>`;
      }).join('');
    }

    /* 编辑账号 */
    function openEditModal(u, focusRenew) {
      const openedVal = u.createdAt ? U.fmtDate(u.createdAt) : U.today();
      const expireVal = u.expireAt ? U.fmtDate(u.expireAt) : '';
      const self = isCurrentUser(u);
      const modal = U.modal({
        title: `编辑账号 · ${u.username}`,
        body: `
          <form id="acc-edit-form" class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group"><label>姓名 <span class="required">*</span></label><input name="displayName" required value="${U.esc(u.displayName || '')}" /></div>
            <div class="form-group"><label>角色</label><select name="role">${roleOptionsHTML(u.role, self)}</select>${self ? '<small class="text-muted" style="display:block;margin-top:4px;">当前账号不可降级，角色已锁定为超级管理员</small>' : ''}</div>
            <div class="form-group"><label>联系手机号</label><input type="tel" name="phone" value="${U.esc(u.phone || '')}" placeholder="选填" /></div>
            ${u.role === 'doctor' ? `
            <div class="form-group adm-doc-field"><label>医生科室</label><input name="dept" value="${U.esc(u.dept || '')}" placeholder="如：内分泌科" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>所属分组（可多选）</label>
              <div class="chk-grid">${(window.DoctorGroups ? window.DoctorGroups.list() : []).map(g => `<label class="chk"><input type="checkbox" name="grp" value="${g.id}" ${(u.groupIds || []).includes(g.id) ? 'checked' : ''}/> ${U.esc(g.name)}</label>`).join('') || '<span class="text-muted">暂无分组</span>'}</div>
            </div>` : ''}
            <div class="form-group"><label>账号开通时间</label><input type="date" name="openedAt" value="${U.esc(openedVal)}" /></div>
            <div class="form-group" style="grid-column: span 2;"><label>账号有效期至（留空 = 永久有效；到期后将自动冻结，需续期或解冻）</label>
              <input type="date" name="expireAt" value="${U.esc(expireVal)}" ${focusRenew ? 'autofocus' : ''} /></div>
            <div class="form-group adm-aimode-field" style="grid-column: span 2;">
              <label class="chk-inline"><input type="checkbox" name="aiMode" ${u.aiMode ? 'checked' : ''}/> 启用 AI 辅助（报告解读 / 方案推荐 / AI 报告解析；聊天问答不受限）</label>
            </div>
          </form>
          <div class="form-section" style="margin-top:12px;">
            <div class="form-group" style="grid-column: span 2;"><label>设置登录密码（留空 = 不修改）</label>
              <div style="display:flex; gap:8px;">
                <input type="password" name="npwd" placeholder="新密码（≥6 位）" style="flex:1" />
                <input type="password" name="npwd2" placeholder="确认新密码" style="flex:1" />
              </div>
            </div>
          </div>
          ${focusRenew ? '<p class="text-muted" style="font-size:12px;margin-top:6px;">该账号已到期被冻结，设置一个新的有效期并保存即可自动解冻（续期）。</p>' : ''}`,
        footer: `<button class="btn btn-primary btn-sm" id="acc-edit-ok">保存</button>`,
        onMount: (overlay) => {
          const roleSel = overlay.querySelector('[name="role"]');
          if (roleSel) {
            const toggleDoc = () => overlay.querySelectorAll('.adm-doc-field').forEach(f => f.style.display = (roleSel.value === 'doctor' ? '' : 'none'));
            const toggleAi = () => overlay.querySelectorAll('.adm-aimode-field').forEach(f => f.style.display = (isAdminRole(roleSel.value) ? 'none' : ''));
            roleSel.addEventListener('change', toggleDoc); roleSel.addEventListener('change', toggleAi);
            toggleDoc(); toggleAi();
          }
          overlay.querySelector('#acc-edit-ok').addEventListener('click', async () => {
            const d = U.formData(overlay.querySelector('#acc-edit-form'));
            if (!d.displayName || !d.displayName.trim()) return U.toast('warning', '请填写姓名');
            const openedAt = d.openedAt ? new Date(d.openedAt + 'T00:00:00Z').toISOString() : u.createdAt;
            const expireAt = d.expireAt ? new Date(d.expireAt + 'T23:59:59').toISOString() : null;
            const patch = { displayName: d.displayName.trim(), role: d.role, phone: d.phone || '', createdAt: openedAt, expireAt };
            if (d.role === 'doctor') {
              const deptEl = overlay.querySelector('[name="dept"]');
              patch.dept = deptEl ? deptEl.value.trim() : (u.dept || '');
              patch.groupIds = Array.from(overlay.querySelectorAll('input[name="grp"]:checked')).map(x => x.value);
            }
            // 自保护：不能把当前登录的自己降级出超级管理员
            if (self && d.role !== 'superadmin') { U.toast('error', '不能降低当前登录账号的权限'); return; }
            // 自保护：不能把最后一名超级管理员降级
            if (!self && u.role === 'superadmin' && d.role !== 'superadmin') {
              const all = await loadUsers();
              if (isLastSuperadmin(all, u.username)) { U.toast('error', '不能降级系统中最后一名超级管理员'); return; }
            }
            const npwd = (d.npwd || '').trim(), npwd2 = (d.npwd2 || '').trim();
            if (npwd) {
              const minLen = (AppState.config && AppState.config.minPasswordLength) || 6;
              if (npwd.length < minLen) { U.toast('warning', '密码长度至少 ' + minLen + ' 位'); return; }
              if (npwd !== npwd2) { U.toast('warning', '两次输入的密码不一致'); return; }
              patch.password = npwd;
            }
            const aiEl = overlay.querySelector('[name="aiMode"]');
            patch.aiMode = (isAdminRole(d.role)) ? true : !!(aiEl && aiEl.checked);
            if (expireAt && !isUserExpired({ expireAt }) && u.status === 'frozen' && u.frozenReason === 'expired') {
              patch.status = 'active'; patch.frozenReason = null;
            }
            try {
              await DB.updateUser(u.id, patch);
              U.toast('success', '账号信息已更新' + (patch.status === 'active' ? '，已自动续期解冻' : '') + (npwd ? '，密码已修改' : ''));
              modal.close();
              refreshUsers();
            } catch (e) { U.toast('error', U.errMsg(e)); }
          });
        }
      });
    }

    U.qs('#acc-add', root).addEventListener('click', () => {
      const modal = U.modal({
        title: '新增账号',
        body: `
          <form id="acc-add-form" class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group"><label>用户名 <span class="required">*</span></label><input name="username" required placeholder="字母数字，至少 3 位" /></div>
            <div class="form-group"><label>姓名 <span class="required">*</span></label><input name="displayName" required /></div>
            <div class="form-group"><label>角色</label><select name="role">
              <option value="doctor">医生</option>
              <option value="admin">管理员</option>
              <option value="superadmin">超级管理员</option>
            </select></div>
            <div class="form-group"><label>初始密码</label><input name="password" value="123456" /></div>
            <div class="form-group"><label>账号开通时间</label><input type="date" name="openedAt" value="${U.today()}" /></div>
            <div class="form-group"><label>账号有效期至（留空=永久）</label><input type="date" name="expireAt" /></div>
            <div class="form-group"><label>联系手机号</label><input type="tel" name="phone" placeholder="选填" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>医生科室</label><input name="dept" placeholder="如：内分泌科" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>所属分组（可多选）</label>
              <div class="chk-grid">${(window.DoctorGroups ? window.DoctorGroups.list() : []).map(g => `<label class="chk"><input type="checkbox" name="grp" value="${g.id}"/> ${U.esc(g.name)}</label>`).join('') || '<span class="text-muted">暂无分组</span>'}</div>
            </div>
            <div class="form-group adm-aimode-field" style="grid-column: span 2;">
              <label class="chk-inline"><input type="checkbox" name="aiMode" /> 启用 AI 辅助（报告解读 / 方案推荐 / AI 报告解析；聊天问答不受限）</label>
            </div>
          </form>`,
        footer: `<button class="btn btn-primary btn-sm" id="acc-add-ok">创建</button>`,
        onMount: (overlay) => {
          const roleSel = overlay.querySelector('[name="role"]');
          if (roleSel) {
            const toggleDoc = () => overlay.querySelectorAll('.adm-doc-field').forEach(f => f.style.display = (roleSel.value === 'doctor' ? '' : 'none'));
            const syncAi = () => { const ai = overlay.querySelector('[name="aiMode"]'); if (ai) ai.checked = isAdminRole(roleSel.value); };
            const toggleAi = () => overlay.querySelectorAll('.adm-aimode-field').forEach(f => f.style.display = (isAdminRole(roleSel.value) ? 'none' : ''));
            roleSel.addEventListener('change', toggleDoc); roleSel.addEventListener('change', syncAi); roleSel.addEventListener('change', toggleAi);
            toggleDoc(); syncAi(); toggleAi();
          }
          overlay.querySelector('#acc-add-ok').addEventListener('click', async () => {
            const d = U.formData(overlay.querySelector('#acc-add-form'));
            if (!/^[a-zA-Z0-9_]{3,}$/.test(d.username || '')) return U.toast('warning', '用户名需字母数字且≥3位');
            const openedAt = d.openedAt ? new Date(d.openedAt + 'T00:00:00Z').toISOString() : new Date().toISOString();
            const expireAt = d.expireAt ? new Date(d.expireAt + 'T23:59:59').toISOString() : null;
            const userData = {
              username: d.username.trim(), displayName: d.displayName.trim(), role: d.role,
              password: d.password || '123456', phone: d.phone || '', createdAt: openedAt, expireAt
            };
            if (d.role === 'doctor') {
              userData.dept = (overlay.querySelector('[name="dept"]') || {}).value ? overlay.querySelector('[name="dept"]').value.trim() : '';
              userData.groupIds = Array.from(overlay.querySelectorAll('input[name="grp"]:checked')).map(x => x.value);
            } else {
              userData.dept = ''; userData.groupIds = [];
            }
            const addAiEl = overlay.querySelector('[name="aiMode"]');
            userData.aiMode = (isAdminRole(d.role)) ? true : !!(addAiEl && addAiEl.checked);
            try {
              await DB.createUser(userData);
              U.toast('success', '账号已创建' + (expireAt ? '（已设置有效期）' : '（永久有效）'));
              modal.close();
              refreshUsers();
            } catch (e) { U.toast('error', U.errMsg(e)); }
          });
        }
      });
    });

    return root;
  };
})();
