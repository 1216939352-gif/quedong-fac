/**
 * 运动方案库管理中心（仅管理员）—— 以卡片形式统一管理全部运动方案库
 *   · 徒手肌力训练方案库 (StrengthLib, 32，可管理员编辑覆盖，支持图片/视频)
 *   · 肌少症居家方案库 (SarcExerciseLib, 36，含动作示意图与医嘱注释，支持图片/视频)
 *   · 通用运动方案库 (DB.planLibrary)
 * 每个库支持 卡片浏览 / 搜索 / 新增 / 编辑 / 删除 / 恢复默认，且均可上传图片与视频。
 */
(function () {
  'use strict';

  /* ============ 通用工具（与 admin.js 内逻辑一致，独立维护避免跨模块依赖） ============ */
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
  function videoPreviewHTML(v) {
    if (!v) return '';
    if (v === '__local__') return '<span class="text-muted" style="font-size:12px;">已存本地视频（保存后可在列表播放）</span>';
    return `<video controls preload="metadata" style="width:100%;max-height:160px;border-radius:10px;margin-bottom:6px;background:#000;"><source src="${U.esc(v)}" type="video/mp4"></video>`;
  }
  function imagePreviewHTML(im) {
    if (!im) return '';
    if (im === '__local__') return '<span class="text-muted" style="font-size:12px;">已存本地图片</span>';
    return `<img src="${U.esc(im)}" style="width:100%;max-height:120px;object-fit:cover;border-radius:10px;margin-top:6px;" onerror="this.style.display='none'"/>`;
  }
  function fillLocalPreview(modalRef, boxId, kind, id) {
    const box = U.qs('#' + boxId, modalRef.overlay);
    if (!box) return;
    DB.getPlanMedia(id).then(m => {
      if (!m) { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地媒体未找到</span>'; return; }
      const blob = kind === 'video' ? m.video : m.image;
      if (!blob) { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地' + (kind === 'video' ? '视频' : '图片') + '未找到</span>'; return; }
      const url = URL.createObjectURL(blob);
      box.innerHTML = kind === 'video'
        ? `<video controls preload="metadata" style="width:100%;max-height:160px;border-radius:10px;margin-bottom:6px;background:#000;"><source src="${url}" type="video/mp4"></video>`
        : `<img src="${url}" style="width:100%;max-height:120px;object-fit:cover;border-radius:10px;"/>`;
    }).catch(() => { box.innerHTML = '<span class="text-muted" style="font-size:12px;">本地媒体加载失败</span>'; });
  }
  function bindRevokeOnClose(modalRef, url) {
    const revoke = () => { if (url) URL.revokeObjectURL(url); };
    if (!modalRef || !modalRef.overlay) { setTimeout(revoke, 30000); return; }
    const closeBtn = modalRef.overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', revoke);
    modalRef.overlay.addEventListener('click', (e) => { if (e.target === modalRef.overlay) revoke(); });
    setTimeout(revoke, 60000);
  }
  const MAX_VIDEO = 500 * 1024 * 1024, MAX_IMAGE = 20 * 1024 * 1024;
  // 媒体存储键：plan 用原始 id；strength/sarc 命名空间，避免与通用方案库 id 冲突
  function mediaKey(lib, id) {
    if (lib === 'strength') return 'slib:' + id;
    if (lib === 'sarc') return 'sarc:' + id;
    if (lib === 'spine') return 'spine:' + id;
    return id;
  }
  // 读取已有本地媒体并写入新上传的 video/image Blob；返回对象标记 '__local__' 或外链 URL
  // delVideo/delImage 为 true 时单独清空对应槽位（独立删除，不影响另一槽位）；如有新文件上传则覆盖删除标记
  async function resolveMedia(storeId, e, vFile, iFile, delVideo, delImage) {
    let video = (e && e.video) || '';
    let image = (e && e.image) || '';
    const needSave = !!(vFile || iFile || delVideo || delImage);
    if (needSave) {
      let oldVideo = null, oldImage = null;
      try { const m = await DB.getPlanMedia(storeId); if (m) { oldVideo = m.video; oldImage = m.image; } } catch (er) {}
      const finalVideo = delVideo ? null : (vFile || oldVideo);
      const finalImage = delImage ? null : (iFile || oldImage);
      await DB.savePlanMedia(storeId, finalVideo, finalImage);
      if (delVideo) video = ''; else if (vFile) video = '__local__';
      if (delImage) image = ''; else if (iFile) image = '__local__';
    }
    return { video, image };
  }
  // 生成单个媒体上传区块（含「删除已上传」按钮）；删除按钮作为 preview 的兄弟节点，
  // 避免被 fillLocalPreview 重写 innerHTML 时误删按钮
  function mediaRow(prefix, kind, value, label) {
    const prevId = prefix + '-' + kind + '-prev';
    const hasMedia = !!value;
    const delBtn = hasMedia
      ? `<button type="button" class="ac-del-media btn" data-kind="${kind}" style="margin-top:6px;padding:2px 8px;font-size:12px;color:#c0392b;border:1px solid #e6b3b3;background:#fff;">🗑 删除已上传${kind === 'video' ? '视频' : '图片'}</button>`
      : '';
    const preview = kind === 'video' ? videoPreviewHTML(value) : imagePreviewHTML(value);
    const fileInput = `<input type="file" id="${prefix}-${kind}" accept="${kind === 'video' ? 'video/*' : 'image/*'}" />`;
    const urlField = kind === 'video'
      ? `<input type="text" name="videoUrl" placeholder="或粘贴视频链接" style="margin-top:6px;" value="${value && value !== '__local__' && !String(value).startsWith('data:') ? U.esc(value) : ''}" />`
      : '';
    return `
        <div class="form-group" style="grid-column:1/-1;">
          <label>${label}</label>
          <div id="${prevId}" class="ac-media-prev">${preview}</div>
          ${delBtn}
          ${fileInput}
          ${urlField}
        </div>`;
  }
  // 为编辑器中「删除已上传」按钮与「重新选择文件」绑定行为（pendingDel 由调用方持有）
  function wireMediaDelete(modalRef, prefix, pendingDel) {
    ['video', 'image'].forEach(kind => {
      const prev = U.qs('#' + prefix + '-' + kind + '-prev', modalRef.overlay);
      const btn = U.qs(`.ac-del-media[data-kind="${kind}"]`, modalRef.overlay);
      if (btn && prev) {
        btn.addEventListener('click', () => {
          pendingDel[kind] = true;
          prev.innerHTML = `<span class="text-muted" style="font-size:12px;color:#c0392b;">已标记删除，保存后生效</span>`;
          const fi = U.qs('#' + prefix + '-' + kind, modalRef.overlay);
          if (fi) fi.value = '';
          if (kind === 'video') { const uf = U.qs('input[name="videoUrl"]', modalRef.overlay); if (uf) uf.value = ''; }
        });
      }
      const fi = U.qs('#' + prefix + '-' + kind, modalRef.overlay);
      if (fi) {
        fi.addEventListener('change', () => {
          if (fi.files && fi.files[0]) {
            pendingDel[kind] = false;
            if (prev) prev.innerHTML = `<span class="text-muted" style="font-size:12px;">已选择新文件，保存后替换</span>`;
          }
        });
      }
    });
  }
  function mediaBadge(e) {
    const m = (e.video ? '▶️视频 ' : '') + (e.image ? '🖼️图片 ' : '');
    return m ? `<div class="ac-media">${U.esc(m)}</div>` : '';
  }
  function ruleText(r) {
    r = r || {};
    const parts = [];
    if (r.bmiMin != null || r.bmiMax != null) parts.push(`BMI ${r.bmiMin != null ? r.bmiMin : '·'}~${r.bmiMax != null ? r.bmiMax : '·'}`);
    if (r.weak && r.weak !== 'any') parts.push('适用：' + ({ strength: '肌力不足', endurance: '耐力不足', balance: '平衡差', none: '无短板' }[r.weak] || r.weak));
    else if (r.weak === 'any') parts.push('通用');
    return parts.length ? parts.join('，') : '无限制';
  }
  function planCats() {
    return window.PLANLIB_CATS || { aerobic: '有氧', resistance: '抗阻', flexibility: '柔韧', balance: '平衡', nutrition: '营养' };
  }
  function convertDefaultToPlanLib(item, category) {
    return {
      id: item.id, name: item.name, category: category, desc: (item.key || '').slice(0, 120),
      video: '', image: '', rules: { bmiMin: '', bmiMax: '', weak: 'any', risk: '' },
      target: item.target || '', dose: item.dose || item.duration || '', key: item.key || '',
      caution: item.caution || '', svg: item.svg || '', level: item.level != null ? item.level : null,
      levelText: item.levelText || '', progress: item.progress || '',
      safety: Array.isArray(item.safety) ? item.safety : [], isDefault: true
    };
  }
  async function importDefaultPlanLibrary() {
    const existing = await DB.getPlanLibrary();
    const ids = new Set(existing.map(x => x.id));
    const D = window.DIAGRAMS || {};
    const added = [];
    (D.RESIST || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'resistance')); ids.add(x.id); } });
    (D.FLEX || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'flexibility')); ids.add(x.id); } });
    (D.BALANCE || []).forEach(x => { if (!ids.has(x.id)) { added.push(convertDefaultToPlanLib(x, 'balance')); ids.add(x.id); } });
    if (added.length) { await DB.savePlanLibrary(existing.concat(added)); return added.length; }
    return 0;
  }

  /* ============ 当前页面刷新句柄 ============
   * 三个编辑器定义在模块作用域，而 renderGrid 是页面内的局部函数；
   * 通过该句柄让编辑器保存后能刷新当前卡片网格。 */
  let activeRefresh = null;
  async function refreshGrid() { if (typeof activeRefresh === 'function') await activeRefresh(); }

  /* ============ 列表读取 ============ */
  async function getList(lib) {
    if (lib === 'strength') return await StrengthLib.getExercises();
    if (lib === 'sarc') return await SarcExerciseLib.getExercises();
    if (lib === 'spine') return await SpineExerciseLib.getExercises();
    return await DB.getPlanLibrary();
  }

  /* ============ 单卡片渲染 ============ */
  function strengthCard(e) {
    const wr = e.wRange ? `${e.wRange.min}–${e.wRange.max} kg` : '';
    return `
    <div class="action-card" data-id="${U.esc(e.id)}" data-lib="strength">
      <div class="ac-top">
        <span class="ac-badge equip-${U.esc(e.equip)}">${U.esc(e.equipLabel || e.equip)}</span>
        <div class="ac-actions">
          <button class="icon-btn al-edit" title="编辑">✎</button>
          <button class="icon-btn al-del" title="删除">🗑</button>
        </div>
      </div>
      <div class="ac-name">${U.esc(e.name)}</div>
      <div class="ac-tags"><span class="ac-tag">${U.esc(e.levelLabel || '')}</span><span class="ac-tag soft">${U.esc(e.muscle || '')}</span></div>
      ${e.params ? `<div class="ac-field"><span class="ac-k">参数</span><span class="ac-v">${U.esc(e.params)}</span></div>` : ''}
      ${e.points ? `<div class="ac-field"><span class="ac-k">要点</span><span class="ac-v">${PlanMediaView.fold(e.points, '要点')}</span></div>` : ''}
      ${e.contraindication ? `<div class="ac-field"><span class="ac-k">禁忌</span><span class="ac-v warn">${U.esc(e.contraindication)}</span></div>` : ''}
      ${e.audience ? `<div class="ac-field"><span class="ac-k">适用</span><span class="ac-v">${U.esc(e.audience)}</span></div>` : ''}
      ${wr ? `<div class="ac-field"><span class="ac-k">重量</span><span class="ac-v">${U.esc(wr)}</span></div>` : ''}
      ${PlanMediaView.thumb(e, 'strength', e.id)}
    </div>`;
  }

  function sarcCard(e) {
    const fig = (window.SarcExerciseLib && SarcExerciseLib.figureSVG) ? SarcExerciseLib.figureSVG(e.posture) : '';
    return `
    <div class="action-card" data-id="${U.esc(e.id)}" data-lib="sarc">
      <div class="ac-top">
        <span class="ac-badge cat-${U.esc(e.cat)}">${U.esc(e.catLabel || e.cat)}</span>
        <div class="ac-actions">
          <button class="icon-btn al-edit" title="编辑">✎</button>
          <button class="icon-btn al-del" title="删除">🗑</button>
        </div>
      </div>
      <div class="ac-figwrap">${fig}</div>
      <div class="ac-name">${U.esc(e.name)}</div>
      <div class="ac-tags"><span class="ac-tag">${U.esc(e.levelLabel || '')}</span></div>
      ${e.params ? `<div class="ac-field"><span class="ac-k">参数</span><span class="ac-v">${U.esc(e.params)}</span></div>` : ''}
      ${e.note ? `<div class="ac-note">📌 ${PlanMediaView.fold(e.note, '医嘱')}</div>` : ''}
      ${e.points ? `<div class="ac-field"><span class="ac-k">要点</span><span class="ac-v">${PlanMediaView.fold(e.points, '要点')}</span></div>` : ''}
      ${e.audience ? `<div class="ac-field"><span class="ac-k">适用</span><span class="ac-v">${U.esc(e.audience)}</span></div>` : ''}
      ${PlanMediaView.thumb(e, 'sarc', e.id)}
    </div>`;
  }

  function spineCard(e) {
    const fig = (window.SpineExerciseLib && SpineExerciseLib.figureSVG) ? SpineExerciseLib.figureSVG(e.posture) : '';
    return `
    <div class="action-card" data-id="${U.esc(e.id)}" data-lib="spine">
      <div class="ac-top">
        <span class="ac-badge cat-${U.esc(e.cat)}">${U.esc(e.catLabel || e.cat)}</span>
        <div class="ac-actions">
          <button class="icon-btn al-edit" title="编辑">✎</button>
          <button class="icon-btn al-del" title="删除">🗑</button>
        </div>
      </div>
      <div class="ac-figwrap">${fig}</div>
      <div class="ac-name">${U.esc(e.name)}</div>
      <div class="ac-tags"><span class="ac-tag">${U.esc(e.levelLabel || '')}</span></div>
      ${e.params ? `<div class="ac-field"><span class="ac-k">参数</span><span class="ac-v">${U.esc(e.params)}</span></div>` : ''}
      ${e.note ? `<div class="ac-note">📌 ${PlanMediaView.fold(e.note, '医嘱')}</div>` : ''}
      ${e.points ? `<div class="ac-field"><span class="ac-k">要点</span><span class="ac-v">${PlanMediaView.fold(e.points, '要点')}</span></div>` : ''}
      ${e.audience ? `<div class="ac-field"><span class="ac-k">适用</span><span class="ac-v">${U.esc(e.audience)}</span></div>` : ''}
      ${PlanMediaView.thumb(e, 'spine', e.id)}
    </div>`;
  }

  function planCard(e) {
    const cats = planCats();
    const media = (e.video ? '▶️视频 ' : '') + (e.image ? '🖼️图片' : '');
    return `
    <div class="action-card" data-id="${U.esc(e.id)}" data-lib="plan" data-default="${e.isDefault ? '1' : ''}">
      <div class="ac-top">
        <span class="ac-badge cat-${U.esc(e.category)}">${U.esc(cats[e.category] || e.category || '—')}</span>
        <div class="ac-actions">
          ${e.isDefault ? '<span class="ac-default">默认</span>' : ''}
          <button class="icon-btn al-edit" title="编辑">✎</button>
          <button class="icon-btn al-del" title="删除">🗑</button>
        </div>
      </div>
      <div class="ac-name">${U.esc(e.name)}</div>
      <div class="ac-tags"><span class="ac-tag soft">${U.esc(ruleText(e.rules))}</span></div>
      ${e.desc ? `<div style="font-size:12.5px;line-height:1.6;color:var(--text-secondary);">${PlanMediaView.fold(e.desc, '描述')}</div>` : ''}
      ${e.target ? `<div class="ac-field"><span class="ac-k">目标肌群</span><span class="ac-v">${U.esc(e.target)}</span></div>` : ''}
      ${e.dose ? `<div class="ac-field"><span class="ac-k">剂量</span><span class="ac-v">${U.esc(e.dose)}</span></div>` : ''}
      ${e.caution ? `<div class="ac-field"><span class="ac-k">注意</span><span class="ac-v warn">${PlanMediaView.fold(e.caution, '注意')}</span></div>` : ''}
      ${PlanMediaView.thumb(e, 'plan', e.id)}
    </div>`;
  }

  // 生成方案展示弹窗中的折叠文字元数据（按子库类型展示不同字段）
  function buildMeta(e, lib) {
    const rows = [];
    const row = (k, v) => { if (v != null && v !== '') rows.push(`<div class="pmv-meta-row"><span class="pmv-meta-k">${k}</span><span class="pmv-meta-v">${PlanMediaView.fold(v, k)}</span></div>`); };
    if (lib === 'strength') {
      row('目标肌群', e.muscle); row('训练参数', e.params); row('动作要点', e.points);
      row('适用人群', e.audience); row('禁忌', e.contraindication);
      if (e.wRange) row('重量范围', e.wRange.min + '–' + e.wRange.max + ' kg');
    } else if (lib === 'sarc') {
      row('分类', e.catLabel || e.cat); row('姿态', e.posture); row('训练参数', e.params);
      row('动作要点', e.points); row('医嘱注释', e.note); row('适用人群', e.audience);
      if (e.tags && e.tags.length) row('适配标签', e.tags.join('，'));
    } else if (lib === 'spine') {
      row('分类', e.catLabel || e.cat); row('姿态', e.posture); row('训练参数', e.params);
      row('动作要点', e.points); row('医嘱注释', e.note); row('适用人群', e.audience);
      if (e.tags && e.tags.length) row('适配标签', e.tags.join('，'));
    } else {
      row('类别', (planCats()[e.category] || e.category));
      row('目标肌群', e.target); row('训练剂量', e.dose); row('动作描述', e.desc);
      row('适用短板', e.rules && e.rules.weak); row('注意事项', e.caution);
    }
    return rows.join('');
  }

  function cardHTML(e, lib) {
    if (lib === 'strength') return strengthCard(e);
    if (lib === 'sarc') return sarcCard(e);
    if (lib === 'spine') return spineCard(e);
    return planCard(e);
  }

  function searchKey(e, lib) {
    if (lib === 'strength') return [e.name, e.muscle, e.points, e.audience, e.equipLabel].join(' ');
    if (lib === 'sarc') return [e.name, e.catLabel, e.note, e.points, e.audience, (e.tags || []).join(' ')].join(' ');
    if (lib === 'spine') return [e.name, e.catLabel, e.note, e.points, e.audience, (e.tags || []).join(' ')].join(' ');
    return [e.name, e.desc, e.target, e.category, ruleText(e.rules)].join(' ');
  }

  /* ============ 编辑器 ============ */
  function openStrengthEditor(existing) {
    const e = existing || {};
    const id = e.id || ('STR' + String(Date.now()).slice(-5));
    const levelOpts = Object.keys(StrengthLib.LEVEL_MAP)
      .map(k => `<option value="${k}" ${e.levelLabel === k ? 'selected' : ''}>${k}</option>`).join('');
    const equipOpts = Object.keys(StrengthLib.EQUIP_LABEL)
      .map(k => `<option value="${k}" ${e.equip === k ? 'selected' : ''}>${StrengthLib.EQUIP_LABEL[k]}</option>`).join('');
    const body = `
      <form id="st-form" class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="form-group" style="grid-column:1/-1;"><label>动作名称 <span class="required">*</span></label><input name="name" value="${U.esc(e.name || '')}" required /></div>
        <div class="form-group"><label>器械</label><select name="equip">${equipOpts}</select></div>
        <div class="form-group"><label>难度梯度</label><select name="levelLabel">${levelOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1;"><label>目标肌群</label><input name="muscle" value="${U.esc(e.muscle || '')}" placeholder="如：胸大肌、三角肌前束" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>训练参数</label><input name="params" value="${U.esc(e.params || '')}" placeholder="如：12–15 次/组，3 组，休 60s" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>动作要点</label><textarea name="points" rows="2" placeholder="发力顺序、注意事项">${U.esc(e.points || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1;"><label>适用人群</label><input name="audience" value="${U.esc(e.audience || '')}" placeholder="如：全年龄段，改善溜肩" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>禁忌</label><input name="contraindication" value="${U.esc(e.contraindication || '')}" placeholder="如：含胸代偿、快速弹动发力" /></div>
        <div class="form-group"><label>重量范围下限(kg)</label><input type="number" name="wMin" value="${e.wRange && e.wRange.min != null ? e.wRange.min : ''}" placeholder="可选" /></div>
        <div class="form-group"><label>重量范围上限(kg)</label><input type="number" name="wMax" value="${e.wRange && e.wRange.max != null ? e.wRange.max : ''}" placeholder="可选" /></div>
        ${mediaRow('st', 'video', e.video, '视频（≤500MB，或填 URL）')}
        ${mediaRow('st', 'image', e.image, '图片（≤20MB）')}
      </form>`;
    const modalRef = U.modal({ title: existing ? '编辑徒手肌力训练方案' : '新增徒手肌力训练方案', body, width: 700, footer: `<button class="btn btn-primary btn-sm" id="st-save">保存</button>` });
    const stStoreId = mediaKey('strength', id);
    if (e.video === '__local__') fillLocalPreview(modalRef, 'st-video-prev', 'video', stStoreId);
    if (e.image === '__local__') fillLocalPreview(modalRef, 'st-img-prev', 'image', stStoreId);
    const stDel = { video: false, image: false };
    wireMediaDelete(modalRef, 'st', stDel);
    U.qs('#st-save', modalRef.overlay).addEventListener('click', async () => {
      const f = U.formData(U.qs('#st-form', modalRef.overlay));
      if (!f.name || !f.name.trim()) return U.toast('warning', '请填写动作名称');
      const saveBtn = U.qs('#st-save', modalRef.overlay);
      if (saveBtn.disabled) return;
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      try {
        // id 已在 openStrengthEditor 顶部统一生成，保证媒体键 stStoreId 与保存 id 完全一致
        const vFile = U.qs('#st-video', modalRef.overlay).files[0];
        const iFile = U.qs('#st-image', modalRef.overlay).files[0];
        if (vFile && vFile.size > MAX_VIDEO) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '视频超过 500MB，请压缩或改用外链 URL'); }
        if (iFile && iFile.size > MAX_IMAGE) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '图片超过 20MB，请压缩后上传'); }
        const videoUrl = (f.videoUrl && f.videoUrl.trim()) ? f.videoUrl.trim() : '';
        const media = await resolveMedia(stStoreId, e, vFile, iFile, stDel.video, stDel.image);
        const obj = {
          id,
          no: e.no || (StrengthLib.EXERCISES.length + 1),
          name: f.name.trim(),
          equip: f.equip,
          equipLabel: StrengthLib.EQUIP_LABEL[f.equip],
          muscle: f.muscle || '',
          levelLabel: f.levelLabel,
          levels: StrengthLib.LEVEL_MAP[f.levelLabel] || ['p1'],
          points: f.points || '',
          audience: f.audience || '',
          params: f.params || '',
          contraindication: f.contraindication || '',
          wRange: (f.wMin !== '' && f.wMax !== '') ? { min: U.num(f.wMin), max: U.num(f.wMax) } : null,
          video: videoUrl || media.video,
          image: media.image
        };
        await StrengthLib.saveExercise(obj);
        modalRef.close();
        await refreshGrid();
        U.toast('success', '已保存徒手肌力训练方案');
      } catch (er) {
        console.error('肌力训练方案保存失败:', er);
        saveBtn.disabled = false; saveBtn.textContent = '保存';
        U.toast('error', isQuotaError(er) ? '保存失败：本地存储空间不足，请压缩媒体或改用外链 URL' : ('保存失败：' + (er && er.message ? er.message : '未知错误')));
      }
    });
  }

  function openSarcEditor(existing) {
    const e = existing || {};
    const id = e.id || ('H' + String(Date.now()).slice(-5));
    const catOpts = SarcExerciseLib.CATS
      .map(c => `<option value="${c.key}" ${(e.cat || 'grip_upper') === c.key ? 'selected' : ''}>${c.label}</option>`).join('');
    const postureOpts = [
      ['seated', '坐姿'], ['stand_support', '扶椅/靠墙'], ['prone', '俯卧'], ['stand_free', '无扶手站立(进阶)']
    ].map(([v, l]) => `<option value="${v}" ${e.posture === v ? 'selected' : ''}>${l}</option>`).join('');
    const lv = e.levels || ['初级'];
    const has = (v) => lv.indexOf(v) >= 0 ? 'checked' : '';
    const body = `
      <form id="sa-form" class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="form-group" style="grid-column:1/-1;"><label>动作名称 <span class="required">*</span></label><input name="name" value="${U.esc(e.name || '')}" required /></div>
        <div class="form-group"><label>分类</label><select name="cat">${catOpts}</select></div>
        <div class="form-group"><label>姿态</label><select name="posture">${postureOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1;"><label>难度梯度</label>
          <div style="display:flex;gap:16px;padding-top:6px;">
            <label class="checkbox-item"><input type="checkbox" name="levels" value="初级" ${has('初级')}/> 初级</label>
            <label class="checkbox-item"><input type="checkbox" name="levels" value="进阶" ${has('进阶')}/> 进阶</label>
          </div>
        </div>
        <div class="form-group" style="grid-column:1/-1;"><label>训练参数</label><input name="params" value="${U.esc(e.params || '')}" placeholder="如：每组12次，2组" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>动作要点</label><textarea name="points" rows="2" placeholder="发力顺序、动作细节">${U.esc(e.points || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1;"><label>医嘱注释（显示在方案与卡片上）</label><textarea name="note" rows="2" placeholder="如：全程缓慢用力、不憋气">${U.esc(e.note || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1;"><label>适用人群</label><input name="audience" value="${U.esc(e.audience || '')}" placeholder="如：下肢增肌核心" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>适配标签（逗号分隔）</label><input name="tags" value="${U.esc((e.tags || []).join('，'))}" placeholder="如：肌力减退、SARC-F力量项得分高" /></div>
        ${mediaRow('sa', 'video', e.video, '视频（≤500MB，或填 URL）')}
        ${mediaRow('sa', 'image', e.image, '图片（≤20MB）')}
      </form>`;
    const modalRef = U.modal({ title: existing ? '编辑肌少症居家方案' : '新增肌少症居家方案', body, width: 700, footer: `<button class="btn btn-primary btn-sm" id="sa-save">保存</button>` });
    const saStoreId = mediaKey('sarc', id);
    if (e.video === '__local__') fillLocalPreview(modalRef, 'sa-video-prev', 'video', saStoreId);
    if (e.image === '__local__') fillLocalPreview(modalRef, 'sa-img-prev', 'image', saStoreId);
    const saDel = { video: false, image: false };
    wireMediaDelete(modalRef, 'sa', saDel);
    U.qs('#sa-save', modalRef.overlay).addEventListener('click', async () => {
      const f = U.formData(U.qs('#sa-form', modalRef.overlay));
      if (!f.name || !f.name.trim()) return U.toast('warning', '请填写动作名称');
      const saveBtn = U.qs('#sa-save', modalRef.overlay);
      if (saveBtn.disabled) return;
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      try {
        let levels = f.levels;
        if (typeof levels === 'string') levels = [levels];
        if (!levels || !levels.length) levels = ['初级'];
        const cat = f.cat;
        const catLabel = (SarcExerciseLib.CATS.find(c => c.key === cat) || {}).label || cat;
        // id 已在 openSarcEditor 顶部统一生成，保证媒体键 saStoreId 与保存 id 完全一致
        const vFile = U.qs('#sa-video', modalRef.overlay).files[0];
        const iFile = U.qs('#sa-image', modalRef.overlay).files[0];
        if (vFile && vFile.size > MAX_VIDEO) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '视频超过 500MB，请压缩或改用外链 URL'); }
        if (iFile && iFile.size > MAX_IMAGE) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '图片超过 20MB，请压缩后上传'); }
        const videoUrl = (f.videoUrl && f.videoUrl.trim()) ? f.videoUrl.trim() : '';
        const media = await resolveMedia(saStoreId, e, vFile, iFile, saDel.video, saDel.image);
        const obj = {
          id,
          no: e.no || (SarcExerciseLib.EXERCISES.length + 1),
          cat, catLabel,
          name: f.name.trim(),
          levels,
          levelLabel: levels.join('/'),
          posture: f.posture,
          params: f.params || '',
          points: f.points || '',
          audience: f.audience || '',
          note: f.note || '',
          tags: (f.tags || '').split(/[，,]/).map(s => s.trim()).filter(Boolean),
          video: videoUrl || media.video,
          image: media.image
        };
        await SarcExerciseLib.saveExercise(obj);
        modalRef.close();
        await refreshGrid();
        U.toast('success', '已保存肌少症居家方案');
      } catch (er) {
        console.error('肌少症居家方案保存失败:', er);
        saveBtn.disabled = false; saveBtn.textContent = '保存';
        U.toast('error', isQuotaError(er) ? '保存失败：本地存储空间不足，请压缩媒体或改用外链 URL' : ('保存失败：' + (er && er.message ? er.message : '未知错误')));
      }
    });
  }

  function openSpineEditor(existing) {
    const e = existing || {};
    const id = e.id || ('SP' + String(Date.now()).slice(-5));
    const catOpts = SpineExerciseLib.CATS
      .map(c => `<option value="${c.key}" ${(e.cat || 'scoliosis') === c.key ? 'selected' : ''}>${c.label}</option>`).join('');
    const postureOpts = [
      ['seated', '坐姿'], ['stand_support', '扶椅/靠墙'], ['prone', '四点支撑/俯卧'], ['stand_free', '无扶手站立(进阶)'], ['side_lying', '侧卧(施罗斯)'], ['supine', '仰卧']
    ].map(([v, l]) => `<option value="${v}" ${e.posture === v ? 'selected' : ''}>${l}</option>`).join('');
    const lv = e.levels || ['初级'];
    const has = (v) => lv.indexOf(v) >= 0 ? 'checked' : '';
    const body = `
      <form id="sp-form" class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="form-group" style="grid-column:1/-1;"><label>动作名称 <span class="required">*</span></label><input name="name" value="${U.esc(e.name || '')}" required /></div>
        <div class="form-group"><label>分类</label><select name="cat">${catOpts}</select></div>
        <div class="form-group"><label>姿态</label><select name="posture">${postureOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1;"><label>难度梯度</label>
          <div style="display:flex;gap:16px;padding-top:6px;">
            <label class="checkbox-item"><input type="checkbox" name="levels" value="初级" ${has('初级')}/> 初级</label>
            <label class="checkbox-item"><input type="checkbox" name="levels" value="进阶" ${has('进阶')}/> 进阶</label>
          </div>
        </div>
        <div class="form-group" style="grid-column:1/-1;"><label>训练参数</label><input name="params" value="${U.esc(e.params || '')}" placeholder="如：每组12次，2组" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>动作要点</label><textarea name="points" rows="2" placeholder="发力顺序、动作细节">${U.esc(e.points || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1;"><label>医嘱注释（显示在方案与卡片上）</label><textarea name="note" rows="2" placeholder="如：向凹侧主动侧屈、配合旋转角呼吸">${U.esc(e.note || '')}</textarea></div>
        <div class="form-group" style="grid-column:1/-1;"><label>适用人群</label><input name="audience" value="${U.esc(e.audience || '')}" placeholder="如：特发性脊柱侧弯、姿态不良青少年" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>适配标签（逗号分隔）</label><input name="tags" value="${U.esc((e.tags || []).join('，'))}" placeholder="如：Cobb角10°-45°、ATR≥5°" /></div>
        ${mediaRow('sp', 'video', e.video, '视频（≤500MB，或填 URL）')}
        ${mediaRow('sp', 'image', e.image, '图片（≤20MB）')}
      </form>`;
    const modalRef = U.modal({ title: existing ? '编辑青少年脊柱健康动作' : '新增青少年脊柱健康动作', body, width: 700, footer: `<button class="btn btn-primary btn-sm" id="sp-save">保存</button>` });
    const spStoreId = mediaKey('spine', id);
    if (e.video === '__local__') fillLocalPreview(modalRef, 'sp-video-prev', 'video', spStoreId);
    if (e.image === '__local__') fillLocalPreview(modalRef, 'sp-img-prev', 'image', spStoreId);
    const spDel = { video: false, image: false };
    wireMediaDelete(modalRef, 'sp', spDel);
    U.qs('#sp-save', modalRef.overlay).addEventListener('click', async () => {
      const f = U.formData(U.qs('#sp-form', modalRef.overlay));
      if (!f.name || !f.name.trim()) return U.toast('warning', '请填写动作名称');
      const saveBtn = U.qs('#sp-save', modalRef.overlay);
      if (saveBtn.disabled) return;
      saveBtn.disabled = true; saveBtn.textContent = '保存中…';
      try {
        let levels = f.levels;
        if (typeof levels === 'string') levels = [levels];
        if (!levels || !levels.length) levels = ['初级'];
        const cat = f.cat;
        const catLabel = (SpineExerciseLib.CATS.find(c => c.key === cat) || {}).label || cat;
        const vFile = U.qs('#sp-video', modalRef.overlay).files[0];
        const iFile = U.qs('#sp-image', modalRef.overlay).files[0];
        if (vFile && vFile.size > MAX_VIDEO) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '视频超过 500MB，请压缩或改用外链 URL'); }
        if (iFile && iFile.size > MAX_IMAGE) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '图片超过 20MB，请压缩后上传'); }
        const videoUrl = (f.videoUrl && f.videoUrl.trim()) ? f.videoUrl.trim() : '';
        const media = await resolveMedia(spStoreId, e, vFile, iFile, spDel.video, spDel.image);
        const obj = {
          id,
          no: e.no || (SpineExerciseLib.EXERCISES.length + 1),
          cat, catLabel,
          name: f.name.trim(),
          levels,
          levelLabel: levels.join('/'),
          posture: f.posture,
          params: f.params || '',
          points: f.points || '',
          audience: f.audience || '',
          note: f.note || '',
          tags: (f.tags || '').split(/[，,]/).map(s => s.trim()).filter(Boolean),
          video: videoUrl || media.video,
          image: media.image
        };
        await SpineExerciseLib.saveExercise(obj);
        modalRef.close();
        await refreshGrid();
        U.toast('success', '已保存青少年脊柱健康动作');
      } catch (er) {
        console.error('青少年脊柱健康动作保存失败:', er);
        saveBtn.disabled = false; saveBtn.textContent = '保存';
        U.toast('error', isQuotaError(er) ? '保存失败：本地存储空间不足，请压缩媒体或改用外链 URL' : ('保存失败：' + (er && er.message ? er.message : '未知错误')));
      }
    });
  }

  function openPlanEditor(existing) {
    const e = existing || { id: 'L' + String(Date.now()).slice(-6), name: '', category: 'resistance', desc: '', rules: { bmiMin: '', bmiMax: '', weak: 'any', risk: '' } };
    const cats = planCats();
    const catOpts = Object.keys(cats).map(k => `<option value="${k}" ${e.category === k ? 'selected' : ''}>${cats[k]}</option>`).join('');
    const weakOpts = [['any', '通用'], ['strength', '肌力不足'], ['endurance', '耐力不足'], ['balance', '平衡差'], ['none', '无短板']]
      .map(([v, l]) => `<option value="${v}" ${(e.rules && e.rules.weak || 'any') === v ? 'selected' : ''}>${l}</option>`).join('');
    const body = `
      <form id="pl-form" class="form-row" style="grid-template-columns:1fr 1fr;">
        <div class="form-group" style="grid-column:1/-1;"><label>动作名称 <span class="required">*</span></label><input name="name" value="${U.esc(e.name || '')}" required /></div>
        <div class="form-group"><label>类别</label><select name="category">${catOpts}</select></div>
        <div class="form-group"><label>适用人群（短板匹配）</label><select name="weak">${weakOpts}</select></div>
        <div class="form-group"><label>BMI 下限</label><input type="number" name="bmiMin" value="${e.rules && e.rules.bmiMin != null ? e.rules.bmiMin : ''}" placeholder="如 28" /></div>
        <div class="form-group"><label>BMI 上限</label><input type="number" name="bmiMax" value="${e.rules && e.rules.bmiMax != null ? e.rules.bmiMax : ''}" placeholder="如 35" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>动作描述</label><textarea name="desc" rows="2" placeholder="动作要点、组数次数、注意事项等">${U.esc(e.desc || '')}</textarea></div>
        <div class="form-group"><label>目标肌群</label><input name="target" value="${U.esc(e.target || '')}" /></div>
        <div class="form-group"><label>训练剂量</label><input name="dose" value="${U.esc(e.dose || '')}" placeholder="如：3 次/周，15 分钟" /></div>
        <div class="form-group" style="grid-column:1/-1;"><label>注意事项</label><textarea name="caution" rows="2">${U.esc(e.caution || '')}</textarea></div>
        ${mediaRow('pl', 'video', e.video, '视频（≤500MB，或填 URL）')}
        ${mediaRow('pl', 'image', e.image, '图片（≤20MB）')}
      </form>`;
    const modalRef = U.modal({ title: existing ? '编辑方案动作' : '新增方案动作', body, width: 700, footer: `<button class="btn btn-primary btn-sm" id="pl-save">保存</button>` });
    if (e.video === '__local__') fillLocalPreview(modalRef, 'pl-video-prev', 'video', e.id);
    if (e.image === '__local__') fillLocalPreview(modalRef, 'pl-img-prev', 'image', e.id);
    const plDel = { video: false, image: false };
    wireMediaDelete(modalRef, 'pl', plDel);
    U.qs('#pl-save', modalRef.overlay).addEventListener('click', async () => {
      const saveBtn = U.qs('#pl-save', modalRef.overlay);
      if (saveBtn.disabled) return;
      try {
        const f = U.formData(U.qs('#pl-form', modalRef.overlay));
        if (!f.name || !f.name.trim()) return U.toast('warning', '请填写动作名称');
        saveBtn.disabled = true; saveBtn.textContent = '保存中…';
        const MAX_VIDEO = 500 * 1024 * 1024, MAX_IMAGE = 20 * 1024 * 1024;
        const vFile = U.qs('#pl-video', modalRef.overlay).files[0];
        const iFile = U.qs('#pl-image', modalRef.overlay).files[0];
        if (vFile && vFile.size > MAX_VIDEO) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '视频超过 500MB，请压缩或改用外链 URL'); }
        if (iFile && iFile.size > MAX_IMAGE) { saveBtn.disabled = false; saveBtn.textContent = '保存'; return U.toast('error', '图片超过 20MB，请压缩后上传'); }
        const videoUrl = (f.videoUrl && f.videoUrl.trim()) ? f.videoUrl.trim() : '';
        let video = videoUrl || (plDel.video ? '' : (e.video || ''));
        let image = plDel.image ? '' : (e.image || '');
        if (vFile || iFile || plDel.video || plDel.image) {
          let oldVideo = null, oldImage = null;
          try { const m = await DB.getPlanMedia(e.id); if (m) { oldVideo = m.video; oldImage = m.image; } } catch (er) {}
          const fv = plDel.video ? null : (vFile || oldVideo);
          const fi = plDel.image ? null : (iFile || oldImage);
          await DB.savePlanMedia(e.id, fv, fi);
          if (plDel.video) video = ''; else if (vFile) video = '__local__';
          if (plDel.image) image = ''; else if (iFile) image = '__local__';
        }
        const obj = {
          id: e.id, name: f.name.trim(), category: f.category, desc: f.desc,
          video, image,
          rules: { bmiMin: U.num(f.bmiMin), bmiMax: U.num(f.bmiMax), weak: f.weak, risk: f.risk || '' },
          target: f.target || '', dose: f.dose || '', caution: f.caution || '',
          isDefault: e.isDefault || false
        };
        const list = await DB.getPlanLibrary();
        const idx = list.findIndex(x => x.id === e.id);
        if (idx >= 0) list[idx] = obj; else list.push(obj);
        await DB.savePlanLibrary(list);
        modalRef.close();
        await refreshGrid();
        U.toast('success', '已保存方案动作');
      } catch (er) {
        console.error('方案动作保存失败:', er);
        saveBtn.disabled = false; saveBtn.textContent = '保存';
        U.toast('error', isQuotaError(er) ? '保存失败：本地存储空间不足，请压缩媒体或改用外链 URL' : ('保存失败：' + (er && er.message ? er.message : '未知错误')));
      }
    });
  }

  /* ============ 页面主体 ============ */
  Pages.actionLibrary = async function () {
    const root = U.el(`<div>
      <div class="page-header al-header"><div><p class="text-muted">管理员可在此统一管理全部运动方案库，以卡片形式编辑、新增与删除，每个方案均可上传图片与视频。</p></div><img class="al-qoo" src="assets/qoo.png" alt="小Qoo" onerror="this.style.display='none'" /></div>

      <div class="seg-tabs" id="al-tabs">
        <button class="seg-tab active" data-tab="strength"><svg class="al-tab-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M6 10v4M18 10v4M21 9v6M6 12h12"/></svg>徒手肌力训练方案库</button>
        <button class="seg-tab" data-tab="sarc"><svg class="al-tab-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M5 21c0-4 3-6 7-6s7 2 7 6"/></svg>肌少症居家方案库</button>
        <button class="seg-tab" data-tab="spine"><svg class="al-tab-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M9 6h6M9 10h6M9 14h6M9 18h6"/></svg>青少年脊柱健康动作库</button>
        <button class="seg-tab" data-tab="plan"><svg class="al-tab-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>通用运动方案库</button>
      </div>

      <div class="al-toolbar">
        <input type="search" id="al-search" class="al-search" placeholder="搜索动作名称 / 关键词…" />
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm" id="al-reset">↺ 恢复默认动作</button>
          <button class="btn btn-primary btn-sm" id="al-add">＋ 新增动作</button>
        </div>
      </div>

      <div id="al-count" class="text-muted" style="font-size:13px;margin:6px 2px 12px;"></div>
      <div class="al-grid" id="al-grid"></div>
    </div>`);

    let tab = 'strength';
    let keyword = '';

    const grid = U.qs('#al-grid', root);
    const countEl = U.qs('#al-count', root);
    const searchEl = U.qs('#al-search', root);

    const tabTitle = { strength: '徒手肌力训练方案库', sarc: '肌少症居家方案库', spine: '青少年脊柱健康动作库', plan: '通用运动方案库' };
    const addLabel = { strength: '＋ 新增徒手肌力训练方案', sarc: '＋ 新增肌少症居家方案', spine: '＋ 新增青少年脊柱健康动作', plan: '＋ 新增方案动作' };

    function refreshToolbar() {
      U.qs('#al-add', root).textContent = addLabel[tab];
      countEl.textContent = tabTitle[tab];
    }

    async function renderGrid() {
      const list = await getList(tab);
      const filtered = (keyword || '').trim()
        ? list.filter(e => searchKey(e, tab).toLowerCase().includes(keyword.trim().toLowerCase()))
        : list;
      countEl.textContent = `${tabTitle[tab]}：共 ${list.length} 个${keyword ? `，匹配 ${filtered.length} 个` : ''}`;
      if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state">该方案库暂无数据${keyword ? '（或无匹配结果）' : '，点击右上角「新增方案」添加，或「恢复默认」导入系统默认'}</div>`;
        return;
      }
      grid.innerHTML = filtered.map(e => cardHTML(e, tab)).join('');
      const itemMap = {};
      filtered.forEach(e => { itemMap[tab + '|' + e.id] = e; });
      bindCards(itemMap);
    }

    function bindCards(itemMap) {
      itemMap = itemMap || {};
      U.qsa('.al-edit', grid).forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.closest('.action-card').dataset.id;
        const list = await getList(tab);
        const item = list.find(x => x.id === id);
        if (tab === 'strength') openStrengthEditor(item);
        else if (tab === 'sarc') openSarcEditor(item);
        else if (tab === 'spine') openSpineEditor(item);
        else openPlanEditor(item);
      }));
      U.qsa('.al-del', grid).forEach(btn => btn.addEventListener('click', async () => {
        const card = btn.closest('.action-card');
        const id = card.dataset.id;
        const isDefault = card.dataset.default === '1';
        const msg = isDefault ? '这是系统默认动作，删除后可在「恢复默认动作」重新导入。确认删除？' : '确认删除该动作？';
        U.confirm(msg, async () => {
        if (tab === 'strength') { await StrengthLib.deleteExercise(id); try { await DB.deletePlanMedia(mediaKey('strength', id)); } catch (e2) {} }
        else if (tab === 'sarc') { await SarcExerciseLib.deleteExercise(id); try { await DB.deletePlanMedia(mediaKey('sarc', id)); } catch (e2) {} }
        else if (tab === 'spine') { await SpineExerciseLib.deleteExercise(id); try { await DB.deletePlanMedia(mediaKey('spine', id)); } catch (e2) {} }
        else {
            const list = (await DB.getPlanLibrary()).filter(x => x.id !== id);
            await DB.savePlanLibrary(list);
            try { await DB.deletePlanMedia(id); } catch (e) {}
          }
          await renderGrid();
          U.toast('success', '已删除');
        }, { title: '删除动作', okText: '删除' });
      }));
      // 缩略图：绑定折叠文字元数据，并异步补全「本地」图片缩略图
      U.qsa('[data-pmv-open]', grid).forEach(el => {
        const [lib, id] = el.getAttribute('data-pmv-open').split('|');
        const item = itemMap[lib + '|' + id];
        if (item) el._pmvMeta = buildMeta(item, lib);
      });
      PlanMediaView.hydrate(grid);
    }

    U.qsa('.seg-tab', root).forEach(b => b.addEventListener('click', () => {
      U.qsa('.seg-tab', root).forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      tab = b.dataset.tab;
      refreshToolbar();
      renderGrid();
    }));

    searchEl.addEventListener('input', () => { keyword = searchEl.value; renderGrid(); });

    U.qs('#al-add', root).addEventListener('click', () => {
      if (tab === 'strength') openStrengthEditor();
      else if (tab === 'sarc') openSarcEditor();
      else if (tab === 'spine') openSpineEditor();
      else openPlanEditor();
    });

    U.qs('#al-reset', root).addEventListener('click', async () => {
      U.confirm('确认将该动作库恢复为系统默认？自定义修改将被覆盖。', async () => {
        if (tab === 'strength') { StrengthLib.resetDefault(); U.toast('success', '已恢复徒手肌力训练默认方案库'); }
        else if (tab === 'sarc') { SarcExerciseLib.resetDefault(); U.toast('success', '已恢复肌少症居家默认方案库'); }
        else if (tab === 'spine') { SpineExerciseLib.resetDefault(); U.toast('success', '已恢复青少年脊柱健康默认动作库'); }
        else {
          const n = await importDefaultPlanLibrary();
          U.toast('success', n ? `已恢复 ${n} 个默认方案动作` : '默认方案动作已存在');
        }
        await renderGrid();
      }, { title: '恢复默认', okText: '恢复' });
    });

    // 注册刷新句柄，供模块作用域的三个编辑器在保存后刷新本页网格
    activeRefresh = renderGrid;

    refreshToolbar();
    await renderGrid();
    return root;
  };
})();
