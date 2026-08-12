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
    const admins = users.filter(u => u.role === 'admin').length;
    const activeDoctors = users.filter(u => u.role === 'doctor' && u.status === 'active').length;
    return { users, config, total, admins, activeDoctors, storageType };
  }

  function statusBadge(u) {
    if (u.status === 'frozen') return '<span class="badge badge-danger">已冻结</span>';
    if (u.status === 'active') return '<span class="badge badge-success">正常</span>';
    return `<span class="badge badge-info">${U.esc(u.status)}</span>`;
  }

  function renderUserTable(users) {
    return `
    <table class="data-table">
      <thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>状态</th><th>创建时间</th><th>最后登录</th><th>操作</th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><strong>${U.esc(u.username)}</strong></td>
            <td>${U.esc(u.displayName || '—')}</td>
            <td>${u.role === 'admin' ? '管理员' : '医生'}</td>
            <td>${statusBadge(u)}</td>
            <td>${U.fmtDate(u.createdAt)}</td>
            <td>${u.lastLogin ? U.fmtDate(u.lastLogin, true) : '—'}</td>
            <td>
              ${u.username === AppState.currentUser.username ? '<span class="text-muted">当前账号</span>' : `
                <button class="btn btn-ghost btn-sm adm-toggle" data-user="${u.username}" data-status="${u.status}">${u.status === 'frozen' ? '解冻' : '冻结'}</button>
                <button class="btn btn-secondary btn-sm adm-reset" data-user="${u.username}">重置密码</button>
                <button class="btn btn-danger btn-sm adm-del" data-user="${u.username}">删除</button>
              `}
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
  }

  Pages.admin = async function () {
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

    <div class="grid-2" style="align-items:start; margin-top:18px;">
      <div class="card">
        <div class="card-header"><h3 class="card-title">账号管理</h3>
          <button class="btn btn-primary btn-sm" id="adm-add">新增账号</button>
        </div>
        <div class="card-body" id="adm-users" style="padding:0;">${renderUserTable(users)}</div>
      </div>

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
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">全平台数据概览（按医生）</h3></div>
      <div class="card-body" id="adm-platform"></div>
    </div>

    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">智能运动方案库</h3>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm" id="plib-restore">恢复默认动作</button>
          <button class="btn btn-primary btn-sm" id="plib-add">新增方案动作</button>
        </div>
      </div>
      <div class="card-body" id="plib-list"></div>
    </div>`;

    const root = U.el(`<div>${html}</div>`);

    async function refreshUsers() {
      const { users } = await loadUsers();
      U.qs('#adm-users', root).innerHTML = renderUserTable(users);
      bindUserOps();
    }

    function bindUserOps() {
      U.qsa('.adm-toggle', root).forEach(btn => btn.addEventListener('click', async () => {
        const uname = btn.dataset.user, cur = btn.dataset.status;
        const next = cur === 'frozen' ? 'active' : 'frozen';
        if (!confirm(`确认${next === 'frozen' ? '冻结' : '解冻'}账号 ${uname}？`)) return;
        const u = await DB.findUserByUsername(uname);
        await DB.updateUser(u.id, { status: next });
        U.toast('success', `账号已${next === 'frozen' ? '冻结' : '解冻'}`);
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

    U.qs('#adm-add', root).addEventListener('click', () => {
      U.modal(`
        <h3 style="margin:0 0 10px;">新增账号</h3>
        <form id="adm-add-form" class="form-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>用户名</label><input name="username" required /></div>
          <div class="form-group"><label>姓名</label><input name="displayName" required /></div>
          <div class="form-group"><label>角色</label><select name="role"><option value="doctor">医生</option><option value="admin">管理员</option></select></div>
          <div class="form-group"><label>初始密码</label><input name="password" value="123456" /></div>
        </form>
        <div class="topbar-actions" style="margin-top:8px; justify-content:flex-end;">
          <button class="btn btn-primary btn-sm" id="adm-add-ok">创建</button>
        </div>
      `);
      U.qs('#adm-add-ok').addEventListener('click', async () => {
        const d = U.formData(U.qs('#adm-add-form'));
        if (!/^[a-zA-Z0-9_]{3,}$/.test(d.username)) return U.toast('warning', '用户名需字母数字且≥3位');
        try {
          await DB.createUser({ username: d.username.trim(), displayName: d.displayName.trim(), role: d.role, password: d.password, phone: '' });
          U.toast('success', '账号已创建');
          U.modal(null);
          refreshUsers();
        } catch (e) { U.toast('error', e.message); }
      });
    });

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

    // ===== 智能运动方案库编辑 =====
    function readAsDataURL(file) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(file);
      });
    }
    function isQuotaError(e) {
      return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
    }
    // 媒体标记：'' 无 / '__local__' 存 IndexedDB / data: 或 http 直接可用
    function videoPreviewHTML(v) {
      if (!v) return '';
      if (v === '__local__') return '<span class="text-muted" style="font-size:12px;">已存本地视频（保存后可在列表播放）</span>';
      return `<video controls preload="metadata" style="width:100%;max-height:180px;border-radius:10px;margin-bottom:6px;background:#000;"><source src="${U.esc(v)}" type="video/mp4"></video>`;
    }
    function imagePreviewHTML(im) {
      if (!im) return '';
      if (im === '__local__') return '<span class="text-muted" style="font-size:12px;">已存本地图片</span>';
      return `<img src="${U.esc(im)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:10px;margin-top:6px;" onerror="this.style.display='none'"/>`;
    }
    // 编辑弹窗打开后，异步把 IndexedDB 里的本地 Blob 渲染成预览
    function fillLocalPreview(modalRef, boxId, kind, id) {
      const box = U.qs('#' + boxId, modalRef.overlay);
      if (!box) return;
      DB.getPlanMedia(id).then(m => {
        if (!m) { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地媒体未找到</span>'; return; }
        const blob = kind === 'video' ? m.video : m.image;
        if (!blob) { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地' + (kind === 'video' ? '视频' : '图片') + '未找到</span>'; return; }
        const url = URL.createObjectURL(blob);
        box.innerHTML = kind === 'video'
          ? `<video controls preload="metadata" style="width:100%;max-height:180px;border-radius:10px;margin-bottom:6px;background:#000;"><source src="${url}" type="video/mp4"></video>`
          : `<img src="${url}" style="width:100%;max-height:120px;object-fit:cover;border-radius:10px;"/>`;
      }).catch(() => { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地媒体加载失败</span>'; });
    }
    // 播放弹窗关闭时释放 objectURL，避免内存泄漏
    function bindRevokeOnClose(modalRef, url) {
      const revoke = () => { if (url) URL.revokeObjectURL(url); };
      if (!modalRef || !modalRef.overlay) { setTimeout(revoke, 30000); return; }
      const closeBtn = modalRef.overlay.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', revoke);
      modalRef.overlay.addEventListener('click', (e) => { if (e.target === modalRef.overlay) revoke(); });
      setTimeout(revoke, 60000);
    }
    function ruleText(r) {
      r = r || {};
      const parts = [];
      if (r.bmiMin != null || r.bmiMax != null) parts.push(`BMI ${r.bmiMin != null ? r.bmiMin : '·'}~${r.bmiMax != null ? r.bmiMax : '·'}`);
      if (r.weak && r.weak !== 'any') parts.push('适用：' + ({ strength: '肌力不足', endurance: '耐力不足', balance: '平衡差', none: '无短板' }[r.weak] || r.weak));
      else if (r.weak === 'any') parts.push('通用');
      return parts.length ? parts.join('，') : '无限制';
    }
    function convertDefaultToPlanLib(item, category) {
      return {
        id: item.id,
        name: item.name,
        category: category,
        desc: (item.key || '').slice(0, 120),
        video: '',
        image: '',
        rules: { bmiMin: '', bmiMax: '', weak: 'any', risk: '' },
        target: item.target || '',
        dose: item.dose || item.duration || '',
        key: item.key || '',
        caution: item.caution || '',
        svg: item.svg || '',
        level: item.level != null ? item.level : null,
        levelText: item.levelText || '',
        progress: item.progress || '',
        safety: Array.isArray(item.safety) ? item.safety : [],
        isDefault: true
      };
    }
    async function importDefaultPlanLibrary(force) {
      const existing = await DB.getPlanLibrary();
      const ids = new Set(existing.map(x => x.id));
      const D = window.DIAGRAMS || {};
      const added = [];
      (D.RESIST || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'resistance')); ids.add(x.id); } });
      (D.FLEX || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'flexibility')); ids.add(x.id); } });
      (D.BALANCE || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'balance')); ids.add(x.id); } });
      if (added.length) {
        await DB.savePlanLibrary(existing.concat(added));
        return added.length;
      }
      return 0;
    }
    async function refreshPlib() {
      let list = await DB.getPlanLibrary();
      if (!list.length) {
        const n = await importDefaultPlanLibrary();
        if (n) list = await DB.getPlanLibrary();
      }
      const cats = window.PLANLIB_CATS || {};
      U.qs('#plib-list', root).innerHTML = list.length ? `
        <table class="data-table">
          <thead><tr><th>动作名称</th><th>类别</th><th>匹配规则</th><th>媒体</th><th>操作</th></tr></thead>
          <tbody>${list.map(it => `
            <tr>
              <td><strong>${U.esc(it.name)}</strong>${it.isDefault ? ' <span class="badge badge-info">默认</span>' : ''}${it.desc ? `<br><span class="text-muted" style="font-size:12px;">${U.esc(it.desc).slice(0, 36)}</span>` : ''}</td>
              <td>${cats[it.category] || it.category || '—'}</td>
              <td>${ruleText(it.rules)}</td>
              <td>${it.video ? `<button class="btn btn-ghost btn-sm plib-play" data-id="${it.id}" data-video="${U.esc(it.video)}">▶ 播放</button>` : ''} ${it.image ? '🖼️' : ''}</td>
              <td><button class="btn btn-ghost btn-sm plib-edit" data-id="${it.id}">编辑</button>
                  <button class="btn btn-ghost btn-sm plib-qr" data-id="${it.id}">二维码</button>
                  <button class="btn btn-danger btn-sm plib-del" data-id="${it.id}" data-default="${it.isDefault ? '1' : ''}">删除</button></td>
            </tr>`).join('')}</tbody>
        </table>` : '<div class="empty-state">方案库为空，点击「新增方案动作」添加首个动作，或点击「恢复默认动作」导入系统默认动作</div>';
      bindPlib();
    }
    function openPlibEditor(existing) {
      const cats = window.PLANLIB_CATS || { aerobic: '有氧', resistance: '抗阻', flexibility: '柔韧', balance: '平衡', nutrition: '营养' };
      const it = existing || { id: 'L' + String(Date.now()).slice(-6), name: '', category: 'resistance', desc: '', video: '', image: '', rules: { bmiMin: '', bmiMax: '', weak: 'any', risk: '' } };
      const catOpts = Object.keys(cats).map(k => `<option value="${k}" ${it.category === k ? 'selected' : ''}>${cats[k]}</option>`).join('');
      const weakOpts = [['any', '通用'], ['strength', '肌力不足'], ['endurance', '耐力不足'], ['balance', '平衡差'], ['none', '无短板']].map(([v, l]) => `<option value="${v}" ${(it.rules.weak || 'any') === v ? 'selected' : ''}>${l}</option>`).join('');
      const body = `
        <form id="plib-form" class="form-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>动作名称 <span class="required">*</span></label><input name="name" value="${U.esc(it.name)}" required /></div>
          <div class="form-group"><label>类别</label><select name="category">${catOpts}</select></div>
          <div class="form-group"><label>BMI 下限</label><input type="number" name="bmiMin" value="${it.rules.bmiMin != null ? it.rules.bmiMin : ''}" placeholder="如 28" /></div>
          <div class="form-group"><label>BMI 上限</label><input type="number" name="bmiMax" value="${it.rules.bmiMax != null ? it.rules.bmiMax : ''}" placeholder="如 35" /></div>
          <div class="form-group" style="grid-column:1/-1;"><label>适用人群（短板匹配）</label><select name="weak">${weakOpts}</select></div>
          <div class="form-group" style="grid-column:1/-1;"><label>动作描述</label><textarea name="desc" rows="2" placeholder="动作要点、组数次数、注意事项等">${U.esc(it.desc)}</textarea></div>
          <div class="form-group"><label>视频（≤500MB，或填 URL）</label>
            <div id="plib-video-prev">${videoPreviewHTML(it.video)}</div>
            <input type="file" id="plib-video" accept="video/*" />
            <input type="text" name="videoUrl" placeholder="或粘贴视频链接（超大视频推荐外链）" style="margin-top:6px;" value="${it.video && it.video !== '__local__' && !it.video.startsWith('data:') ? U.esc(it.video) : ''}" />
          </div>
          <div class="form-group"><label>图片（≤20MB）</label>
            <div id="plib-img-prev">${imagePreviewHTML(it.image)}</div>
            <input type="file" id="plib-image" accept="image/*" />
          </div>
        </form>`;
      const modalRef = U.modal({ title: existing ? '编辑方案动作' : '新增方案动作', body, width: 680, footer: `<button class="btn btn-primary btn-sm" id="plib-save">保存</button>` });
      if (it.video === '__local__') fillLocalPreview(modalRef, 'plib-video-prev', 'video', it.id);
      if (it.image === '__local__') fillLocalPreview(modalRef, 'plib-img-prev', 'image', it.id);
      const saveBtn = U.qs('#plib-save', modalRef.overlay);
      saveBtn.addEventListener('click', async () => {
        if (saveBtn.disabled) return;
        try {
          const f = U.formData(U.qs('#plib-form', modalRef.overlay));
          if (!f.name || !f.name.trim()) return U.toast('warning', '请填写动作名称');
          saveBtn.disabled = true;
          saveBtn.textContent = '保存中…';

          const MAX_VIDEO = 500 * 1024 * 1024;
          const MAX_IMAGE = 20 * 1024 * 1024;
          const vFile = U.qs('#plib-video', modalRef.overlay).files[0];
          const iFile = U.qs('#plib-image', modalRef.overlay).files[0];
          if (vFile && vFile.size > MAX_VIDEO) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '视频超过 500MB，本地存储容量有限，请压缩后上传或改用外链 URL'); }
          if (iFile && iFile.size > MAX_IMAGE) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '图片超过 20MB，请压缩后上传'); }

          const videoUrl = (f.videoUrl && f.videoUrl.trim()) ? f.videoUrl.trim() : '';
          let video = videoUrl || it.video || '';
          let image = it.image || '';

          if (vFile || iFile) {
            // 保留未重新上传的一侧原 Blob，避免被整体覆盖清空
            let oldVideo = null, oldImage = null;
            try { const m = await DB.getPlanMedia(it.id); if (m) { oldVideo = m.video; oldImage = m.image; } } catch (e) {}
            await DB.savePlanMedia(it.id, vFile || oldVideo, iFile || oldImage);
            if (vFile) video = '__local__';
            if (iFile) image = '__local__';
          }

          const obj = {
            id: it.id, name: f.name.trim(), category: f.category, desc: f.desc,
            video, image,
            rules: { bmiMin: U.num(f.bmiMin), bmiMax: U.num(f.bmiMax), weak: f.weak, risk: f.risk || '' }
          };
          const list = await DB.getPlanLibrary();
          const idx = list.findIndex(x => x.id === it.id);
          if (idx >= 0) list[idx] = obj; else list.push(obj);
          await DB.savePlanLibrary(list);
          modalRef.close();
          await refreshPlib();
          U.toast('success', '已保存方案动作');
        } catch (e) {
          console.error('方案动作保存失败:', e);
          saveBtn.disabled = false;
          saveBtn.textContent = '保存';
          const msg = isQuotaError(e)
            ? '保存失败：本地存储空间不足（IndexedDB 配额已满）。建议压缩视频/图片，或改用外链 URL，或清空部分旧数据。'
            : '保存失败：' + (e && e.message ? e.message : '未知错误');
          U.toast('error', msg);
        }
      });
    }
    function bindPlib() {
      U.qsa('.plib-edit', root).forEach(b => b.addEventListener('click', async () => {
        const list = await DB.getPlanLibrary();
        openPlibEditor(list.find(x => x.id === b.dataset.id));
      }));
      U.qsa('.plib-del', root).forEach(b => b.addEventListener('click', async () => {
        const isDefault = b.dataset.default === '1';
        const msg = isDefault ? '这是系统默认动作，删除后可在右上角「恢复默认动作」重新导入。确认删除？' : '确认删除该方案动作？';
        if (!confirm(msg)) return;
        const list = (await DB.getPlanLibrary()).filter(x => x.id !== b.dataset.id);
        await DB.savePlanLibrary(list);
        await DB.deletePlanMedia(b.dataset.id);
        refreshPlib(); U.toast('success', '已删除');
      }));
      U.qsa('.plib-play', root).forEach(b => b.addEventListener('click', async () => {
        const src = b.dataset.video;
        if (!src) return;
        if (src === '__local__') {
          const id = b.dataset.id;
          let url = null;
          try {
            const m = await DB.getPlanMedia(id);
            if (!m || !m.video) return U.toast('error', '本地视频未找到，可能已被删除');
            url = URL.createObjectURL(m.video);
          } catch (e) { return U.toast('error', '读取本地视频失败：' + (e && e.message ? e.message : e)); }
          const modalRef = U.modal({
            title: '动作视频',
            body: `<video controls autoplay style="width:100%;max-height:70vh;border-radius:10px;background:#000;"><source src="${url}" type="video/mp4">您的浏览器不支持视频播放</video>`,
            width: '720px'
          });
          bindRevokeOnClose(modalRef, url);
        } else {
          U.modal({
            title: '动作视频',
            body: `<video controls autoplay style="width:100%;max-height:70vh;border-radius:10px;background:#000;"><source src="${U.esc(src)}" type="video/mp4">您的浏览器不支持视频播放</video>`,
            width: '720px'
          });
        }
      }));
      U.qsa('.plib-qr', root).forEach(b => b.addEventListener('click', async () => {
        const list = await DB.getPlanLibrary();
        const it = list.find(x => x.id === b.dataset.id);
        if (!it) return U.toast('error', '未找到该动作');
        const cats = window.PLANLIB_CATS || { aerobic: '有氧', resistance: '抗阻', flexibility: '柔韧', balance: '平衡', nutrition: '营养' };
        const payload = {
          name: it.name,
          category: it.category,
          categoryLabel: cats[it.category] || it.category,
          target: it.target || '',
          dose: it.dose || '',
          key: it.key || it.desc || '',
          caution: it.caution || '',
          video: (it.video && it.video !== '__local__') ? it.video : ''
        };
        const json = JSON.stringify(payload);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        const pageUrl = new URL('action.html', location.href).toString();
        const fullUrl = pageUrl + '?data=' + encodeURIComponent(b64);
        const qrSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=2&data=' + encodeURIComponent(fullUrl);
        const isLocal = it.video === '__local__' || (it.video && it.video.startsWith('data:'));
        U.modal({
          title: '患者扫码查看：' + U.esc(it.name),
          body: `
            <div style="text-align:center;">
              <img src="${qrSrc}" alt="二维码" style="width:220px;height:220px;border-radius:10px;border:1px solid var(--border-color);" onerror="this.style.display='none'" />
              <p style="font-size:13px;color:var(--text-muted);margin:12px 0 6px;">请患者使用微信 / 浏览器扫描上方二维码</p>
              <div style="word-break:break-all;background:#f8fafc;border:1px dashed var(--border-color);border-radius:8px;padding:10px;font-size:12px;color:var(--text-secondary);text-align:left;">${U.esc(fullUrl)}</div>
              ${isLocal ? `<div class="alert alert-warning" style="margin-top:12px;text-align:left;font-size:12.5px;"><strong>提示：</strong>该动作视频为本地文件，扫码后患者手机无法直接播放。如需手机扫码观看，请在编辑中将视频更换为 http/https 外链 URL（如腾讯云/阿里云/B站等），或把视频上传至可公开/私有的对象存储后填入链接。</div>` : ''}
            </div>`,
          width: '420px'
        });
      }));
    }
    U.qs('#plib-add', root).addEventListener('click', () => openPlibEditor());
    U.qs('#plib-restore', root).addEventListener('click', async () => {
      const n = await importDefaultPlanLibrary(true);
      await refreshPlib();
      if (n) U.toast('success', `已恢复 ${n} 个默认动作`);
      else U.toast('info', '所有默认动作已存在，未新增');
    });
    refreshPlib();

    return root;
  };
})();
