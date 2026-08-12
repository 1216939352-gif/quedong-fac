/**
 * 鹊动FAC功能评估与干预系统 - 系统管理后台（仅管理员）
 * 统计概览、账号管理、全局配置、本地缓存、全平台数据管理
 */
(function () {
  'use strict';

  async function loadUsers() {
    const users = await DB.getUsers();
    const config = await DB.getSystemConfig();
    const storageType = 'localStorage（本地）';
    const total = users.length;
    const admins = users.filter(u => isAdminRole(u)).length;
    const activeDoctors = users.filter(u => u.role === 'doctor' && u.status === 'active').length;
    return { users, config, total, admins, activeDoctors, storageType };
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

  function groupTagsHtml(u) {
    const gids = u.groupIds || [];
    if (!gids.length) return '<span class="text-muted">未分组</span>';
    const DG = window.DoctorGroups;
    return gids.map(id => { const g = DG ? DG.get(id) : null; return `<span class="ip-tag">${U.esc((g && g.name) || id)}</span>`; }).join(' ');
  }

  function roleBadgeHtml(u) {
    if (u.role === 'superadmin') return '<span class="badge badge-super">超级管理员</span>';
    if (u.role === 'admin') return '<span class="badge badge-warning">管理员</span>';
    return '<span class="badge badge-info">医生</span>';
  }
  /* 角色下拉选项：超级管理员可见并可赋予 superadmin；非超级管理员编辑超级管理员账号时仍保留该选项以防误降权 */
  function roleOptionsHTML(currentRole) {
    const opts = [['doctor', '医生'], ['admin', '管理员']];
    if (isSuperRole(AppState.currentUser) || currentRole === 'superadmin') opts.push(['superadmin', '超级管理员']);
    return opts.map(([v, l]) => `<option value="${v}" ${currentRole === v ? 'selected' : ''}>${l}</option>`).join('');
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
                <div class="adm-ai-flag">${isAdminRole(u) ? '' : (u.aiMode ? '<span class="badge badge-ai-on">' + (window.qooIcon ? window.qooIcon('sm') : '') + ' AI 已开通</span>' : '<span class="badge badge-ai-off">AI 未开通</span>')}</div>
              </td>
              <td class="adm-td-time">
                <div>开通 ${U.fmtDate(u.createdAt)}</div>
                <div>最后 ${u.lastLogin ? U.fmtDate(u.lastLogin, true) : '—'}</div>
              </td>
              <td class="adm-td-actions">
                ${AppState.currentUser && u.username === AppState.currentUser.username ? '<span class="text-muted">当前账号</span>' : `
                  <div class="adm-actions">
                    <button class="btn btn-ghost btn-sm adm-edit" data-user="${u.username}">编辑</button>
                    <button class="btn btn-ghost btn-sm adm-toggle" data-user="${u.username}" data-status="${u.status}">${u.status === 'frozen' ? '解冻' : '冻结'}</button>
                    <button class="btn btn-secondary btn-sm adm-reset" data-user="${u.username}">重置</button>
                    <button class="btn btn-danger btn-sm adm-del" data-user="${u.username}">删除</button>
                  </div>
                `}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  Pages.admin = async function () {
    await enforceAllExpiry(); // 进入管理后台时批量冻结已到期医生账号
    const { users, config, total, admins, activeDoctors, storageType } = await loadUsers();
    const DEFAULT_CONFIG = { orgName: '鹊动FAC功能中心', systemTitle: '鹊动FAC功能评估与干预系统', defaultStage: 'standard', defaultActivityLevel: 'sedentary', minPasswordLength: 6, sessionTimeout: 60 };

    const html = `
    <div class="page-header"><div><p class="text-muted">全平台数据与账号管理（仅管理员）</p></div></div>

    <div class="grid-4">
      <div class="metric-card">
        <div class="metric-card-icon">👨‍⚕️</div>
        <div class="metric-card-value">${activeDoctors}</div>
        <div class="metric-card-label">活跃医生数</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">🔐</div>
        <div class="metric-card-value">${admins}</div>
        <div class="metric-card-label">管理员账号</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">👥</div>
        <div class="metric-card-value">${total}</div>
        <div class="metric-card-label">全平台总账号</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-icon">🗄️</div>
        <div class="metric-card-value is-text">${U.esc(storageType)}</div>
        <div class="metric-card-label">数据库类型</div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">账号管理</h3>
        <button class="btn btn-primary btn-sm" id="adm-add">新增账号</button>
      </div>
      <div class="card-body" id="adm-users" style="padding:0;">${renderUserTable(users)}</div>
    </div>

    <div class="grid-2" style="align-items:start; margin-top:18px;">
      <div class="card">
        <div class="card-header"><h3 class="card-title">全局系统配置</h3></div>
        <div class="card-body">
          <div class="form-section">
            <div class="form-row" style="grid-template-columns: 1fr 1fr;">
              <div class="form-group"><label>机构名称</label><input type="text" name="orgName" value="${U.esc(config.orgName || '')}" /></div>
              <div class="form-group"><label>系统标题</label><input type="text" name="systemTitle" value="${U.esc(config.systemTitle || '')}" /></div>
              <div class="form-group"><label>默认减重阶段</label>
                <select name="defaultStage">
                  ${CONST.WEIGHT_STAGES.map(s => `<option value="${s.key}" ${config.defaultStage === s.key ? 'selected' : ''}>${U.esc(s.label)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>默认活动水平</label>
                <select name="defaultActivityLevel">
                  ${CONST.ACTIVITY_LEVELS.map(a => `<option value="${a.key}" ${config.defaultActivityLevel === a.key ? 'selected' : ''}>${U.esc(a.label)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>密码最小长度</label><input type="number" name="minPasswordLength" value="${config.minPasswordLength ?? 6}" /></div>
              <div class="form-group"><label>会话超时(分钟)</label><input type="number" name="sessionTimeout" value="${config.sessionTimeout ?? 60}" /></div>
              <div class="form-group" style="grid-column: span 2;">
                <label>系统 Logo</label>
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                  <img id="adm-logo-preview" src="${U.esc(config.logoUrl || 'images/logo.png')}" style="height:48px;width:auto;object-fit:contain;border:1px solid var(--border-color);border-radius:8px;background:#fff;" onerror="this.src='images/logo.png'" />
                  <input type="file" id="adm-logo" accept="image/*" />
                  <button type="button" class="btn btn-ghost btn-sm" id="adm-logo-reset">恢复默认</button>
                </div>
                <p class="text-muted" style="font-size:12px;margin-top:6px;">建议上传 1:1 透明背景 PNG，影响登录页与侧边栏品牌区。</p>
              </div>
            </div>
          </div>
          <div class="topbar-actions">
            <button class="btn btn-primary btn-sm" id="adm-cfg-save">保存配置</button>
            <button class="btn btn-ghost btn-sm" id="adm-cfg-reset">恢复默认</button>
          </div>
          <hr style="margin:14px 0; border:none; border-top:1px solid var(--border);" />
          <div class="topbar-actions">
            <button class="btn btn-warning btn-sm" id="adm-cache">清空本地缓存</button>
            <button class="btn btn-secondary btn-sm" id="adm-export-all">导出全平台数据</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">后端账号安全（API 密码）</h3>
          <span class="text-muted" style="font-size:12px;">修改用于登录后端 / 多机同步的 API 密码</span>
        </div>
        <div class="card-body">
          <div class="form-row" style="grid-template-columns:1fr;">
            <div class="form-group"><label>当前密码</label><input type="password" id="cp-old" placeholder="当前密码" /></div>
            <div class="form-group"><label>新密码（≥6位）</label><input type="password" id="cp-new" placeholder="新密码" /></div>
            <div class="form-group"><label>确认新密码</label><input type="password" id="cp-new2" placeholder="确认新密码" /></div>
          </div>
          <div class="topbar-actions">
            <button class="btn btn-primary btn-sm" id="cp-submit">修改密码</button>
            <span id="cp-msg" class="text-muted" style="font-size:12px;"></span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">医生分组管理</h3>
        <span class="text-muted" style="font-size:12px;">与主系统账号、资讯推送「医生分组与接收人」共享同一份数据（双向同步）</span>
      </div>
      <div class="card-body" id="adm-grp-mgr"></div>
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">全平台数据概览（按医生）</h3></div>
      <div class="card-body" id="adm-platform"></div>
    </div>

    `;

    const root = U.el(`<div>${html}</div>`);

    async function refreshUsers() {
      const { users } = await loadUsers();
      U.qs('#adm-users', root).innerHTML = renderUserTable(users);
      bindUserOps();
    }

    function bindUserOps() {
      U.qsa('.adm-edit', root).forEach(btn => btn.addEventListener('click', async () => {
        const u = await DB.findUserByUsername(btn.dataset.user);
        if (u) openEditModal(u);
      }));
      U.qsa('.adm-toggle', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user, cur = btn.dataset.status;
        const next = cur === 'frozen' ? 'active' : 'frozen';
        if (next === 'active') {
          // 解冻：若账号已到期，必须先续期，否则下次刷新会再次冻结
          const u = await DB.findUserByUsername(uname);
          if (isUserExpired(u)) {
            U.toast('warning', '该账号已到期，请先设置新有效期（续期）后再解冻');
            openEditModal(u, true);
            return;
          }
          if (!confirm(`确认解冻账号 ${uname}？`)) return;
          await DB.updateUser(u.id, { status: 'active', frozenReason: null });
          U.toast('success', '账号已解冻');
        } else {
          if (!confirm(`确认冻结账号 ${uname}？`)) return;
          await DB.updateUser(u.id, { status: 'frozen', frozenReason: 'manual' });
          U.toast('success', '账号已冻结');
        }
        refreshUsers();
      }));
      U.qsa('.adm-reset', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user;
        if (!confirm(`确认将 ${uname} 的密码重置为 123456？`)) return;
        const u = await DB.findUserByUsername(uname);
        await DB.updateUser(u.id, { password: '123456' });
        U.toast('success', '密码已重置为 123456');
      }));
      U.qsa('.adm-del', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user;
        if (!confirm(`危险操作：确认删除账号 ${uname}？该操作不可恢复！`)) return;
        const u = await DB.findUserByUsername(uname);
        await DB.deleteUser(u.id);
        U.toast('success', '账号已删除');
        refreshUsers();
      }));
    }
    bindUserOps();
    bindChangePassword(root);
    buildGroupManager(U.qs('#adm-grp-mgr', root));

    /* 编辑账号：可修改姓名 / 角色 / 手机号 / 开通时间 / 有效期至（续期） */
    function openEditModal(u, focusRenew) {
      const openedVal = u.createdAt ? U.fmtDate(u.createdAt) : U.today();
      const expireVal = u.expireAt ? U.fmtDate(u.expireAt) : '';
      const modal = U.modal({
        title: `编辑账号 · ${u.username}`,
        body: `
          <form id="adm-edit-form" class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group"><label>姓名 <span class="required">*</span></label><input name="displayName" required value="${U.esc(u.displayName || '')}" /></div>
            <div class="form-group"><label>角色</label><select name="role">${roleOptionsHTML(u.role)}</select></div>
            <div class="form-group"><label>联系手机号</label><input type="tel" name="phone" value="${U.esc(u.phone || '')}" placeholder="选填" /></div>
            ${u.role === 'doctor' ? `
            <div class="form-group adm-doc-field"><label>医生科室</label><input name="dept" value="${U.esc(u.dept || '')}" placeholder="如：内分泌科" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>所属分组（可多选）</label>
              <div class="chk-grid">${(window.DoctorGroups ? window.DoctorGroups.list() : []).map(g => `<label class="chk"><input type="checkbox" name="grp" value="${g.id}" ${(u.groupIds || []).includes(g.id) ? 'checked' : ''}/> ${U.esc(g.name)}</label>`).join('') || '<span class="text-muted">暂无分组，请在下方「医生分组管理」中新建</span>'}</div>
            </div>` : ''}
            <div class="form-group"><label>账号开通时间</label><input type="date" name="openedAt" value="${U.esc(openedVal)}" /></div>
            <div class="form-group" style="grid-column: span 2;"><label>账号有效期至（留空 = 永久有效；到期后将自动冻结，需管理员续期或解冻）</label>
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
              <small class="text-muted">也可在表格中用「重置密码」一键重置为 123456。</small>
            </div>
          </div>
          ${focusRenew ? '<p class="text-muted" style="font-size:12px;margin-top:6px;">该账号已到期被冻结，设置一个新的有效期并保存即可自动解冻（续期）。</p>' : ''}`,
        footer: `<button class="btn btn-primary btn-sm" id="adm-edit-ok">保存</button>`,
        onMount: (overlay) => {
          // 角色切换时显示/隐藏医生专属字段（科室 / 分组）
          const roleSel = overlay.querySelector('[name="role"]');
          if (roleSel) {
            const toggleDoc = () => overlay.querySelectorAll('.adm-doc-field').forEach(f => f.style.display = (roleSel.value === 'doctor' ? '' : 'none'));
            const toggleAi = () => overlay.querySelectorAll('.adm-aimode-field').forEach(f => f.style.display = (isAdminRole(roleSel.value) ? 'none' : ''));
            roleSel.addEventListener('change', toggleDoc); roleSel.addEventListener('change', toggleAi);
            toggleDoc(); toggleAi();
          }
          overlay.querySelector('#adm-edit-ok').addEventListener('click', async () => {
            const d = U.formData(overlay.querySelector('#adm-edit-form'));
            if (!d.displayName || !d.displayName.trim()) return U.toast('warning', '请填写姓名');
            const openedAt = d.openedAt ? new Date(d.openedAt + 'T00:00:00Z').toISOString() : u.createdAt;
            const expireAt = d.expireAt ? new Date(d.expireAt + 'T23:59:59').toISOString() : null;
            const patch = {
              displayName: d.displayName.trim(), role: d.role, phone: d.phone || '',
              createdAt: openedAt, expireAt
            };
            // 医生专属：科室 + 分组
            if (d.role === 'doctor') {
              const deptEl = overlay.querySelector('[name="dept"]');
              patch.dept = deptEl ? deptEl.value.trim() : (u.dept || '');
              patch.groupIds = Array.from(overlay.querySelectorAll('input[name="grp"]:checked')).map(x => x.value);
            }
            // 密码设置（可选，留空则不修改）
            const npwd = (d.npwd || '').trim(), npwd2 = (d.npwd2 || '').trim();
            if (npwd) {
              const minLen = (AppState.config && AppState.config.minPasswordLength) || 6;
              if (npwd.length < minLen) { U.toast('warning', '密码长度至少 ' + minLen + ' 位'); return; }
              if (npwd !== npwd2) { U.toast('warning', '两次输入的密码不一致'); return; }
              patch.password = npwd;
            }
            // AI 辅助模式开关（管理员恒为开通，隐藏开关时仍强制 true）
            const aiEl = overlay.querySelector('[name="aiMode"]');
            patch.aiMode = (isAdminRole(d.role)) ? true : !!(aiEl && aiEl.checked);
            // 续期：新有效期在未来且账号因到期被冻结 → 自动解冻
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

    U.qs('#adm-add', root).addEventListener('click', () => {
      const modal = U.modal({
        title: '新增账号',
        body: `
          <form id="adm-add-form" class="form-row" style="grid-template-columns:1fr 1fr;">
            <div class="form-group"><label>用户名 <span class="required">*</span></label><input name="username" required placeholder="字母数字，至少 3 位" /></div>
            <div class="form-group"><label>姓名 <span class="required">*</span></label><input name="displayName" required /></div>
            <div class="form-group"><label>角色</label><select name="role">${roleOptionsHTML('doctor')}</select></div>
            <div class="form-group"><label>初始密码</label><input name="password" value="123456" /></div>
            <div class="form-group"><label>账号开通时间</label><input type="date" name="openedAt" value="${U.today()}" /></div>
            <div class="form-group"><label>账号有效期至（留空=永久）</label><input type="date" name="expireAt" /></div>
            <div class="form-group"><label>联系手机号</label><input type="tel" name="phone" placeholder="选填" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>医生科室</label><input name="dept" placeholder="如：内分泌科" /></div>
            <div class="form-group adm-doc-field" style="grid-column: span 2;"><label>所属分组（可多选）</label>
              <div class="chk-grid">${(window.DoctorGroups ? window.DoctorGroups.list() : []).map(g => `<label class="chk"><input type="checkbox" name="grp" value="${g.id}"/> ${U.esc(g.name)}</label>`).join('') || '<span class="text-muted">暂无分组，可在下方「医生分组管理」中新建</span>'}</div>
            </div>
            <div class="form-group adm-aimode-field" style="grid-column: span 2;">
              <label class="chk-inline"><input type="checkbox" name="aiMode" /> 启用 AI 辅助（报告解读 / 方案推荐 / AI 报告解析；聊天问答不受限）</label>
            </div>
          </form>`,
        footer: `<button class="btn btn-primary btn-sm" id="adm-add-ok">创建</button>`,
        onMount: (overlay) => {
          const roleSel = overlay.querySelector('[name="role"]');
          if (roleSel) {
            const toggleDoc = () => overlay.querySelectorAll('.adm-doc-field').forEach(f => f.style.display = (roleSel.value === 'doctor' ? '' : 'none'));
            const syncAi = () => { const ai = overlay.querySelector('[name="aiMode"]'); if (ai) ai.checked = isAdminRole(roleSel.value); };
            const toggleAi = () => overlay.querySelectorAll('.adm-aimode-field').forEach(f => f.style.display = (isAdminRole(roleSel.value) ? 'none' : ''));
            roleSel.addEventListener('change', toggleDoc); roleSel.addEventListener('change', syncAi); roleSel.addEventListener('change', toggleAi);
            toggleDoc(); syncAi(); toggleAi();
          }
          overlay.querySelector('#adm-add-ok').addEventListener('click', async () => {
            const d = U.formData(overlay.querySelector('#adm-add-form'));
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
              U.toast('success', '账号已创建' + (expireAt ? '（已设置有效期）' : '（永久有效）') + (d.role === 'doctor' && userData.groupIds.length ? '，已加入 ' + userData.groupIds.length + ' 个分组' : ''));
              modal.close();
              refreshUsers();
            } catch (e) { U.toast('error', U.errMsg(e)); }
          });
        }
      });
    });

    /* 医生分组管理：新建 / 删除分组、增减成员（与资讯推送共享 window.DoctorGroups 数据，双向同步） */
    function buildGroupManager(container) {
      function draw() {
        const groups = window.DoctorGroups ? window.DoctorGroups.list() : [];
        const doctors = (window.DB ? DB.getDoctors() : []);
        container.innerHTML = '';
        const newRow = U.el('<div class="adm-grp-new"><input placeholder="新建分组名称" /><button class="btn btn-primary btn-sm">新建分组</button></div>');
        newRow.querySelector('button').onclick = () => {
          const inp = newRow.querySelector('input'); const n = inp.value.trim();
          if (!n) { U.toast('warning', '请填写分组名称'); return; }
          window.DoctorGroups.save({ id: 'g' + Date.now().toString(36), name: n });
          inp.value = ''; draw(); U.toast('success', '已新建分组');
        };
        container.appendChild(newRow);
        if (!groups.length) container.appendChild(U.el('<p class="text-muted" style="margin-top:8px;">暂无分组，请先新建分组。</p>'));
        groups.forEach(g => {
          const members = window.DoctorGroups.members(g.id);
          const cand = doctors.filter(d => !members.find(m => m.username === d.username));
          const card = U.el(`<div class="adm-grp-row">
            <div class="adm-grp-head"><b>${U.esc(g.name)}</b> <small>${members.length} 人</small>
              <button class="btn btn-danger btn-sm adm-grp-del">删除分组</button></div>
            <div class="adm-grp-members">${members.map(m => `<span class="ip-tag">${U.esc(m.displayName)}<i class="ip-x" data-u="${m.username}" title="移出分组">✕</i></span>`).join('') || '<span class="text-muted">暂无成员</span>'}</div>
            <div class="ip-grp-add2"><select class="adm-grp-sel">${cand.map(d => `<option value="${d.username}">${U.esc(d.displayName)}</option>`).join('') || '<option value="">（无可选医生）</option>'}</select><button class="btn btn-ghost btn-sm adm-grp-addm">加入成员</button></div>
          </div>`);
          card.querySelectorAll('.ip-x').forEach(x => x.onclick = () => { window.DoctorGroups.removeMember(x.dataset.u, g.id); draw(); refreshUsers(); });
          card.querySelector('.adm-grp-addm').onclick = () => { const sel = card.querySelector('.adm-grp-sel'); if (!sel.value) return; window.DoctorGroups.addMember(sel.value, g.id); draw(); refreshUsers(); };
          card.querySelector('.adm-grp-del').onclick = () => { if (confirm('删除该分组？成员将变为未分组')) { window.DoctorGroups.remove(g.id); draw(); refreshUsers(); } };
          container.appendChild(card);
        });
      }
      draw();
    }

    let logoDataUrl = null;
    let logoReset = false;
    const logoPreview = U.qs('#adm-logo-preview', root);
    U.qs('#adm-logo', root).addEventListener('change', async () => {
      const f = U.qs('#adm-logo', root).files[0];
      if (!f) return;
      try { logoDataUrl = await readAsDataURL(f); logoPreview.src = logoDataUrl; logoReset = false; }
      catch (e) { U.toast('error', 'Logo 读取失败'); }
    });
    U.qs('#adm-logo-reset', root).addEventListener('click', () => {
      logoReset = true; logoDataUrl = null;
      logoPreview.src = 'images/logo.png';
      U.qs('#adm-logo', root).value = '';
    });

    U.qs('#adm-cfg-save', root).addEventListener('click', async () => {
      const d = U.formData(root.querySelector('.card-body'));
      const current = await DB.getSystemConfig();
      let logoUrl = current.logoUrl || '';
      if (logoReset) logoUrl = '';
      else if (logoDataUrl) logoUrl = logoDataUrl;
      await DB.updateSystemConfig({
        orgName: d.orgName, systemTitle: d.systemTitle, logoUrl,
        defaultStage: d.defaultStage, defaultActivityLevel: d.defaultActivityLevel,
        minPasswordLength: U.num(d.minPasswordLength) || 6, sessionTimeout: U.num(d.sessionTimeout) || 60
      });
      AppState.config = await DB.getSystemConfig();
      const appliedLogo = AppState.config.logoUrl || 'images/logo.png';
      const loginImg = document.querySelector('#tpl-login img');
      const brandImg = document.querySelector('.sidebar-brand img');
      if (loginImg) loginImg.src = appliedLogo;
      if (brandImg) brandImg.src = appliedLogo;
      U.toast('success', '系统配置已保存');
    });
    U.qs('#adm-cfg-reset', root).addEventListener('click', async () => {
      if (!confirm('确认恢复系统默认参数？')) return;
      await DB.updateSystemConfig(DEFAULT_CONFIG);
      AppState.config = await DB.getSystemConfig();
      location.reload();
    });

    U.qs('#adm-cache', root).addEventListener('click', async () => {
      if (!confirm('清空浏览器本地 wm 前缀缓存？云端数据不受影响。')) return;
      await DB.clearLocalCache();
      U.toast('success', '本地缓存已清空');
    });
    U.qs('#adm-export-all', root).addEventListener('click', async () => {
      if (!confirm('导出全平台备份数据（JSON）？')) return;
      const data = await DB.exportAllData();
      U.download(`quedong-backup-${U.today()}.json`, JSON.stringify(data, null, 2));
      U.toast('success', '全平台数据已导出');
    });

    // 全平台按医生汇总
    (async () => {
      const allUsers = await DB.getUsers();
      const allPatients = await DB.getPatients();
      const byDoctor = allUsers.filter(u => u.role === 'doctor').map(u => {
        const ps = allPatients.filter(p => p.doctorUsername === u.username);
        const strength = ps.filter(p => ((p.data.isokineticData || []).length + (p.data.isotonicData || []).length) > 0).length;
        const plan = ps.filter(p => p.data.plan && p.data.plan.generatedAt).length;
        return `<tr><td>${U.esc(u.displayName)}（${U.esc(u.username)}）</td><td>${ps.length}</td><td>${plan}</td><td>${strength}</td></tr>`;
      }).join('');
      U.qs('#adm-platform', root).innerHTML = `
        <table class="data-table">
          <thead><tr><th>医生</th><th>建档患者</th><th>已生成方案</th><th>已做肌力测评</th></tr></thead>
          <tbody>${byDoctor || '<tr><td colspan="4" class="text-center">暂无医生账号</td></tr>'}</tbody>
        </table>`;
    })();

    // 文件转 DataURL（系统 Logo 上传复用）
    function readAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }
    
    function bindChangePassword(root) {
      const cpMsg = U.qs('#cp-msg', root);
      const getTok = () => { try { return localStorage.getItem('qd_admin_token') || ''; } catch (e) { return ''; } };
      const getBase = () => { try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; } };
      U.qs('#cp-submit', root).addEventListener('click', async () => {
        const oldP = U.qs('#cp-old', root).value;
        const newP = U.qs('#cp-new', root).value;
        const newP2 = U.qs('#cp-new2', root).value;
        cpMsg.textContent = '';
        if (!oldP || !newP) { U.toast('warning', '请填写当前密码与新密码'); return; }
        if (newP.length < 6) { U.toast('warning', '新密码至少 6 位'); return; }
        if (newP !== newP2) { U.toast('warning', '两次输入的新密码不一致'); return; }
        const token = getTok();
        if (!token) { U.toast('error', '尚未登录后端：请先在「超级管理员 · 系统报错日志」处获取令牌'); return; }
        try {
          const r = await fetch(getBase() + '/api/me/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ oldPassword: oldP, newPassword: newP })
          });
          const d = await r.json().catch(() => ({}));
          if (r.ok) {
            U.toast('success', '后端密码已修改');
            cpMsg.textContent = '修改成功';
            U.qs('#cp-old', root).value = ''; U.qs('#cp-new', root).value = ''; U.qs('#cp-new2', root).value = '';
          } else {
            U.toast('error', d.error || ('修改失败 ' + r.status));
            cpMsg.textContent = d.error || ('失败 ' + r.status);
          }
        } catch (e) { U.toast('error', '无法连接后端（请确认本地服务已启动）'); }
      });
    }

    return root;
  };
})();
