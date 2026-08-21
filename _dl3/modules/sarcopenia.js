/**
 * 鹊动FAC功能评估与干预系统
 * ────────────────────────────────────────────────────────────────
 * 【独立模块】老年人体重管理 & 肌少症专项 —— 页面层
 *   · Pages.sarcopenia        独立台账工作台
 *   · Pages.sarcopeniaAssess  8 步标准化评估向导
 *   · Pages.sarcopeniaStats   独立数据统计台账
 *   · window.buildSarcReport  独立评估报告
 *
 * 与生活方式干预模块完全解耦：独立菜单、独立业务逻辑、独立数据台账、
 * 独立报告体系、独立干预方案，仅只读复用系统基础用户档案。
 * ────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const E = () => window.SarcEngine2;
  const D = () => window.SarcDB;

  /* 肌少症独立患者名册：与脊柱健康共享 qd_sarcopenia_patients 存档，但按 spine 标记隔离，
     仅取本模块患者（无 spine 标记），避免脊柱登记人串显到肌少症台账 / 自动选中。 */
  function sarcPatients() { return (D().listPatients() || []).filter(p => !p.spine); }

  /* ==================================================================
   * 通用 UI 小工具（§8.3 颜色标签：绿色正常 / 黄色偏低偏高 / 红色高风险）
   * ================================================================== */
  const LV = {
    ok: { c: 'var(--success)', bg: 'rgba(16,185,129,.12)', name: '正常' },
    warn: { c: 'var(--warning)', bg: 'rgba(245,158,11,.14)', name: '偏低/偏高' },
    bad: { c: 'var(--danger)', bg: 'rgba(239,68,68,.12)', name: '异常高风险' },
    na: { c: 'var(--text-muted)', bg: 'rgba(148,163,184,.14)', name: '未测' }
  };
  function lv(k) { return LV[k] || LV.na; }

  function chip(level, text) {
    const s = lv(level);
    return `<span class="sarc-chip sarc-chip-${level || 'na'}" style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;
      font-weight:700;color:${s.c};background:${s.bg};border:1px solid ${s.c}33;white-space:nowrap;">${U.esc(text)}</span>`;
  }

  function metricCard(o) {
    const s = lv(o.level);
    return `<div style="border:1px solid var(--border);border-left:4px solid ${s.c};border-radius:12px;
      padding:14px 16px;background:var(--surface);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
        <div style="font-size:13px;color:var(--text-muted);font-weight:600;">${U.esc(o.name)}</div>
        ${chip(o.level, o.label)}
      </div>
      <div style="font-size:24px;font-weight:800;margin:8px 0 4px;color:${s.c};">
        ${o.value == null || o.value === '' ? '—' : U.esc(String(o.value))}
        <span style="font-size:13px;font-weight:600;color:var(--text-muted);">${U.esc(o.unit || '')}</span></div>
      ${o.rule ? `<div style="font-size:11.5px;color:var(--text-muted);line-height:1.6;">${U.esc(o.rule)}</div>` : ''}
      ${o.desc ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-top:6px;">${U.esc(o.desc)}</div>` : ''}
    </div>`;
  }

  function tipBox(title, text) {
    return `<div class="sarc-tip"><div class="sarc-tip-t">📏 ${U.esc(title)}</div>
      <div class="sarc-tip-b">${U.esc(text)}</div></div>`;
  }




  function radioRow(name, val, opts) {
    return `<div class="radio-group">${opts.map(o => `<label class="radio-item">
      <input type="radio" name="${name}" value="${o[1]}" ${String(val) === String(o[1]) ? 'checked' : ''}>
      <span>${U.esc(o[0])}</span></label>`).join('')}</div>`;
  }

  function riskGauge(fall) {
    const s = lv(fall.color);
    const pct = Math.max(2, Math.min(100, fall.index));
    return `<div style="border:1px solid ${s.c}44;border-radius:16px;padding:20px 22px;background:${s.bg};">
      <div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">
        <div style="font-size:44px;font-weight:900;color:${s.c};line-height:1;">${fall.index}</div>
        <div style="font-size:13px;color:var(--text-muted);font-weight:600;">/ 100 分</div>
        <div style="margin-left:auto;">${chip(fall.color, fall.level)}</div>
      </div>
      <div style="height:10px;border-radius:999px;background:rgba(148,163,184,.22);margin:14px 0 6px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${s.c}aa,${s.c});border-radius:999px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);">
        <span>0 低风险</span><span>30</span><span>60</span><span>100 高风险</span></div>
      <div style="font-size:13px;line-height:1.8;color:var(--text-secondary);margin-top:12px;">${U.esc(fall.advice)}</div>
    </div>`;
  }

  function dimTable(dims) {
    return `<table class="data-table" style="width:100%;">
      <thead><tr><th>加权维度</th><th style="width:70px;">权重</th><th style="width:80px;">维度分</th>
        <th style="width:80px;">加权分</th><th>数据来源 / 说明</th></tr></thead>
      <tbody>${dims.map(d => `<tr>
        <td><b>${U.esc(d.name)}</b></td>
        <td>${Math.round(d.weight * 100)}%</td>
        <td>${d.sub}</td>
        <td><b>${(d.sub * d.weight).toFixed(1)}</b></td>
        <td style="font-size:12px;color:var(--text-secondary);">${U.esc(d.source)}<br>
          <span style="font-size:11px;color:var(--text-muted);">${U.esc(d.note)}</span></td>
      </tr>`).join('')}</tbody></table>`;
  }

  /* 标准版：鹊动设备处方卡片（对齐主系统智能方案形式：具体型号 + 详细参数 + 要领 + 禁忌） */
  function devicePlanHTML(devices) {
    if (!devices || !devices.length) return '';
    var all = (window.CONST && CONST.DEVICES) ? CONST.DEVICES : [];
    return '<div class="sarc-dev-list">' + devices.map(function (dv) {
      var d = all.filter(function (x) { return x.id === dv.id; })[0] || {};
      var name = dv.name || d.name || ('QD-' + dv.id);
      var short = dv.short || d.short || '';
      var code = d.code || ('QD-' + dv.id);
      var muscles = dv.muscles || d.muscles || '';
      var img = d.img || dv.img || '';
      var devId = dv.id || d.id || '';
      var rows = '';
      rows += '<div class="sarc-dev-row"><b>目标肌群：</b>' + U.esc(muscles || '—') + '</div>';
      if (dv.reason) rows += '<div class="sarc-dev-row"><b>推荐理由：</b>' + U.esc(dv.reason) + '</div>';
      rows += '<div class="sarc-dev-row"><b>训练剂量：</b>' + U.esc(dv.dose || '—') + '</div>';
      if (dv.keyPoints) rows += '<div class="sarc-dev-row"><b>动作要领：</b>' + U.esc(dv.keyPoints) + '</div>';
      if (dv.contraindication) rows += '<div class="sarc-dev-row sarc-dev-caution"><b>禁忌：</b>' + U.esc(dv.contraindication) + '</div>';
      var mediaHTML = img ?
        '<div class="sarc-dev-media" data-device-id="' + U.esc(devId) + '">' +
        '<img src="' + U.esc(img) + '" alt="' + U.esc(name) + '" onerror="this.style.display=\'none\'">' +
        '<button type="button" class="btn btn-ghost btn-sm dev-media-open no-print" data-device-id="' + U.esc(devId) + '">查看图片 / 视频</button>' +
        '</div>' : '';
      return '<div class="sarc-dev-item ' + (img ? 'has-media' : '') + '">' + mediaHTML +
        '<div class="sarc-dev-body">' +
        '<div class="sarc-dev-head"><b>' + U.esc(name) + '</b>' +
        (short ? '<span class="sarc-dev-code">' + U.esc(short) + '</span>' : '') +
        '<span class="sarc-dev-id">' + U.esc(code) + '</span></div>' + rows + '</div></div>';
    }).join('') + '</div>';
  }

  /* 绑定肌少症模块内设备图片/视频查看按钮（标准版 + 严谨版 rx-media） */
  function bindSarcDeviceMedia(root) {
    if (!root) return;
    U.qsa('.dev-media-open, .sarc-dev-media, .rx-media-open, .rx-media', root).forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-device-id');
        const d = (window.CONST && CONST.DEVICES || []).find(x => x.id === id);
        if (!d) return;
        if (typeof window.openDeviceMedia === 'function') window.openDeviceMedia(d);
      });
    });
  }

  /* 标准版：居家徒手方案——智能匹配结果紧凑摘要（详细见下方 36 动作库方案） */
  function exercisePlanBrief(ep) {
    if (!ep) return '';
    var groups = [ep.warmup, ep.main, ep.balance, ep.aerobic, ep.stretch].filter(function (g) { return g && g.items && g.items.length; });
    if (!groups.length) return '';
    return '<div class="sarc-ex-brief">' + groups.map(function (g) {
      return '<div class="sarc-ex-brief-g"><b>' + U.esc(g.title) + '：</b>' +
        g.items.map(function (it) { return U.esc(it.name) + (it.params ? '（' + U.esc(it.params) + '）' : ''); }).join('、') + '</div>';
    }).join('') + '</div>';
  }

  function planCard(p, isPrefer, badge, diet) {
    var isDeviceObj = p.devices && p.devices.length && typeof p.devices[0] === 'object';
    var detailHTML, label;
    if (isDeviceObj) {
      label = '适配设备（具体型号 · 详细参数）';
      detailHTML = devicePlanHTML(p.devices);
    } else if (p.exercisePlan) {
      label = '智能匹配徒手动作';
      detailHTML = exercisePlanBrief(p.exercisePlan);
    } else {
      label = p.devices ? '适配设备' : '动作库';
      detailHTML = '<div class="sarc-chips">' + (p.devices || p.actions || []).map(function (a) {
        return '<span>' + U.esc(Array.isArray(a) ? a[0] : a) + '</span>';
      }).join('') + '</div>';
    }
    return `<div class="sarc-plan ${isPrefer ? 'is-prefer' : ''}">
      <div class="sarc-plan-h">
        <div><b>${U.esc(p.title)}</b>
          ${isPrefer ? '<span class="sarc-prefer-tag">系统首选</span>' : '<span class="sarc-alt-tag">可切换备选</span>'}</div>
        ${badge ? `<span class="badge badge-info">${U.esc(badge)}</span>` : ''}
      </div>
      <div class="sarc-plan-b">
        <div class="sarc-kv"><span>训练目标</span><p>${U.esc(p.goalText)}</p></div>
        <div class="sarc-kv"><span>训练频次</span><p>${U.esc(p.freq || p.duration || '—')}</p></div>
        ${p.intensity ? `<div class="sarc-kv"><span>强度标准</span><p>${U.esc(p.intensity)}</p></div>` : ''}
        <div class="sarc-kv"><span>${label}</span>${detailHTML}</div>
        ${p.rules ? `<div class="sarc-kv"><span>专属规则</span><ul>${p.rules.map(r => `<li>${U.esc(r)}</li>`).join('')}</ul></div>` : ''}
        ${diet && diet.length ? `<div class="sarc-kv sarc-kv-diet"><span>饮食营养</span><table class="sarc-diet-tbl"><tbody>${diet.map(x => `<tr><td><b>${U.esc(x[0])}</b></td><td>${U.esc(x[1])}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
    </div>`;
  }

  /* 标签页式方案切换（用于步骤 8 的交互视图，把徒手/设备方案拆开显示） */
  function renderTabs(group, tabs) {
    return `<div class="sarc-plan-tabs" data-tab-group="${U.esc(group)}">
      ${tabs.map((t, i) => `<button type="button" class="sarc-plan-tab ${i === 0 ? 'active' : ''}" data-tab-group="${U.esc(group)}" data-tab="${U.esc(t.id)}">
        <span class="tab-icon">${t.icon || ''}</span>
        <span class="tab-label">${U.esc(t.label)}</span>
        ${t.prefer ? '<span class="tab-prefer">首选</span>' : (t.alt ? '<span class="tab-alt">备选</span>' : '')}
      </button>`).join('')}
    </div>
    <div class="sarc-plan-panels" data-tab-group="${U.esc(group)}">
      ${tabs.map((t, i) => `<div class="sarc-plan-panel ${i === 0 ? 'active' : ''}" data-tab-group="${U.esc(group)}" data-panel="${U.esc(t.id)}">${t.html}</div>`).join('')}
    </div>`;
  }

  /* 跌倒预防徒手动作列表（对齐主系统：动作名/目标肌群/训练剂量/动作要领/禁忌） */
  function fallExerciseHTML(exercises) {
    if (!exercises || !exercises.length) return '';
    return '<div class="sarc-dev-list">' + exercises.map(function (e) {
      var rows = '';
      rows += '<div class="sarc-dev-row"><b>目标肌群：</b>' + U.esc(e.target || '—') + '</div>';
      rows += '<div class="sarc-dev-row"><b>训练剂量：</b>' + U.esc(e.dose || '—') + '</div>';
      if (e.keyPoints) rows += '<div class="sarc-dev-row"><b>动作要领：</b>' + U.esc(e.keyPoints) + '</div>';
      if (e.contraindication) rows += '<div class="sarc-dev-row sarc-dev-caution"><b>禁忌：</b>' + U.esc(e.contraindication) + '</div>';
      return '<div class="sarc-dev-item">' +
        '<div class="sarc-dev-head"><b>' + U.esc(e.name) + '</b>' +
        '<span class="sarc-dev-code">' + U.esc(e.id || '') + '</span></div>' + rows + '</div>';
    }).join('') + '</div>';
  }

  function fallPlanBlock(fall) {
    const h = fall.home, dv = fall.device, t = fall.tier;
    const homeCard = `<div class="sarc-plan is-fall">
        <div class="sarc-plan-h"><div><b>${U.esc(h.title)}</b></div><span class="badge badge-success">居家刚需</span></div>
        <div class="sarc-plan-b">
          <div class="sarc-kv"><span>核心目标</span><p>${U.esc(h.goalText)}</p></div>
          <div class="sarc-kv"><span>单次时长</span><p>${U.esc(h.duration)}</p></div>
          <div class="sarc-kv"><span>训练频次</span><p>${U.esc(h.frequency)}</p></div>
          <div class="sarc-kv"><span>强度标准</span><p>${U.esc(h.intensity)}</p></div>
          <div class="sarc-kv"><span>专属动作库</span>${fallExerciseHTML(h.exercises)}</div>
          ${h.progression ? `<div class="sarc-kv"><span>进阶路径</span><ol class="sarc-ol">${h.progression.map(x => `<li>${U.esc(x)}</li>`).join('')}</ol></div>` : ''}
          <div class="sarc-kv"><span>训练禁忌</span>
            <div class="sarc-chips danger">${h.safety.map(x => `<span>${U.esc(x)}</span>`).join('')}</div></div>
          <div class="sarc-kv"><span>核心效果</span><p>${U.esc(h.effect)}</p></div>
        </div>
      </div>`;
    const deviceCard = `<div class="sarc-plan is-fall">
        <div class="sarc-plan-h"><div><b>${U.esc(dv.title)}</b></div><span class="badge badge-info">机构量化</span></div>
        <div class="sarc-plan-b">
          <div class="sarc-kv"><span>核心目标</span><p>${U.esc(dv.goalText)}</p></div>
          <div class="sarc-kv"><span>训练频次</span><p>${U.esc(dv.frequency)}</p></div>
          <div class="sarc-kv"><span>适配鹊动设备（具体型号 · 详细参数）</span>${devicePlanHTML(dv.devices)}</div>
          <div class="sarc-kv"><span>安全机制</span>
            <div class="sarc-chips">${dv.safety.map(x => `<span>${U.esc(x)}</span>`).join('')}</div></div>
          <div class="sarc-kv"><span>数据联动</span><p>${U.esc(dv.dataLink)}</p></div>
        </div>
      </div>`;
    return `
    <div class="alert ${fall.priority ? 'alert-danger' : 'alert-info'}" style="margin-bottom:16px;">
      <div><strong>${fall.priority ? '⚠️ 跌倒预防专项方案（优先执行）' : '🛡️ 跌倒预防专项方案'}</strong>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
        当前跌倒风险指数 <b>${fall.index}</b> 分 · ${U.esc(fall.level)}｜执行频次：${U.esc(t.freq)}｜目标：${U.esc(t.aim)}
      </p></div>
    </div>
    ${renderTabs('fall-plan', [
      { id: 'fall-home', icon: '🏠', label: h.title, prefer: true, html: homeCard },
      { id: 'fall-device', icon: '🏥', label: dv.title, alt: true, html: deviceCard }
    ])}
    <div class="sarc-kv" style="margin-top:14px;"><span>跌倒预防专属生活方式干预</span>
      <ul>${fall.lifestyle.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul></div>`;
  }

  /* ==================================================================
   * 本模块独立首诊登记档案读取（完全独立，不共享系统用户档案）
   * ================================================================== */
  function activePatientId() {
    const d = D().getDraft();
    return (d && d.patientId) || null;
  }
  function basePatient() {
    const id = activePatientId();
    /* [临时放开·仅本地查看用] 无评估对象时注入演示基线，便于直开 #/sarcopenia-assess 查看真实页面；正式运行请恢复下方注释行 */
    if (!id) return { id: null, name: '王秀兰(演示)', gender: 'female', age: 78, height: 158, weight: 52, bmi: 20.8, chronic: '高血压', phone: '138****0000' };
    // if (!id) return { id: null, name: '', gender: 'male', age: null, height: null, weight: null, bmi: null, chronic: null, phone: '' };
    const p = D().getPatient(id) || {};
    const height = E().num(p.height), weight = E().num(p.weight);
    const bmi = (height && weight) ? U.round(weight / Math.pow(height / 100, 2), 1) : null;
    return {
      id, name: p.name || '', gender: p.gender || 'male', age: E().num(p.age),
      height, weight, bmi,
      chronic: p.chronic || null, phone: p.phone || ''
    };
  }

  function needPatient() {
    const b = basePatient();
    if (!b || !b.id || !b.name) {
      return `<div class="alert alert-warning"><div><strong>请先完成肌少症专项首诊登记</strong>
        <p style="margin:6px 0 0;">本模块采用独立首诊登记档案，不共享系统用户档案，
        需单独填写姓名、性别、年龄、身高体重、BMI 作为评估基线。</p>
        <div class="mt-2" style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" class="btn btn-primary btn-sm" data-open-reg>＋ 立即新建首诊登记并评估</button>
          <a href="#/sarcopenia" class="btn btn-ghost btn-sm">前往台账管理 →</a>
        </div></div></div>`;
    }
    return null;
  }

  /* 从台账「开始评估」进入向导前，将选中登记档案绑定到当前草稿 */
  function startAssess(pid) {
    /* 复测/进入评估：始终在该患者名下新建一套空白评估草稿（step:1、全新 id），
       不复用 localStorage 中残留的旧草稿，避免跳转到上次评估结束的步骤 */
    const d = {
      id: 'sarc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      patientId: pid,
      step: 1,
      body: { smi: '', bodyFat: '', visceral: '', muscleMass: '', bmr: '', weight: '' },
      assessDate: U.today()
    };
    D().saveDraft(d);
    location.hash = '#/sarcopenia-assess';
  }

  /* 首诊登记弹窗（独立档案，不回写系统） */
  function openRegisterModal(prefill) {
    const p = prefill || {};
    const html = `<form id="reg-form" style="font-size:14px;">
      <div class="form-grid">
        <div class="form-group"><label>姓名 <span class="required">*</span></label>
          <input type="text" name="name" value="${U.esc(p.name || '')}" placeholder="如 张建国" required></div>
        <div class="form-group"><label>性别</label>
          <div class="radio-group">
            <label class="radio-item"><input type="radio" name="gender" value="male" ${p.gender !== 'female' ? 'checked' : ''}><span>男</span></label>
            <label class="radio-item"><input type="radio" name="gender" value="female" ${p.gender === 'female' ? 'checked' : ''}><span>女</span></label>
          </div></div>
        <div class="form-group"><label>年龄（岁）</label>
          <input type="number" name="age" step="1" value="${U.esc(p.age || '')}" placeholder="≥60"></div>
        <div class="form-group"><label>身高（cm）</label>
          <input type="number" step="0.1" name="height" value="${U.esc(p.height || '')}" placeholder="如 168"></div>
        <div class="form-group"><label>体重（kg）</label>
          <input type="number" step="0.1" name="weight" value="${U.esc(p.weight || '')}" placeholder="如 65"></div>
        <div class="form-group"><label>BMI（自动计算）</label>
          <input type="text" name="bmi" readonly value="" placeholder="录入身高体重后自动计算"></div>
      </div>
      <div class="form-group" style="margin-top:10px;"><label>联系电话</label>
        <input type="text" name="phone" value="${U.esc(p.phone || '')}" placeholder="选填"></div>
      <div class="form-group" style="margin-top:10px;"><label>既往慢病基础信息（本模块独立记录）</label>
        <input type="text" name="chronic" value="${U.esc(Array.isArray(p.chronic) ? p.chronic.join('、') : (p.chronic || ''))}" placeholder="如 高血压、2型糖尿病（选填）"></div>
    </form>`;
    U.modal({
      title: prefill && prefill.id ? '编辑首诊登记档案' : '新建肌少症专项首诊登记',
      body: html, width: 760,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button>
               <button class="btn btn-primary" data-act="save">${prefill && prefill.id ? '保存修改' : '创建登记并进入评估'}</button>`,
      onMount(overlay, close) {
        const form = overlay.querySelector('#reg-form');
        const calcBmi = () => {
          const h = E().num(form.querySelector('[name=height]').value);
          const w = E().num(form.querySelector('[name=weight]').value);
          form.querySelector('[name=bmi]').value = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : '';
        };
        form.querySelector('[name=height]').addEventListener('input', calcBmi);
        form.querySelector('[name=weight]').addEventListener('input', calcBmi);
        U.bindChoiceStyle(overlay);
        calcBmi();
        overlay.querySelector('[data-act=save]').onclick = () => {
          const fd = U.formData(form);
          if (!fd.name) { U.toast('请填写姓名', 'warning'); return; }
          const rec = {
            id: prefill && prefill.id ? prefill.id : undefined,
            name: fd.name, gender: fd.gender || 'male', age: E().num(fd.age),
            height: E().num(fd.height), weight: E().num(fd.weight),
            phone: fd.phone || '', chronic: fd.chronic ? fd.chronic.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : []
          };
          const saved = D().savePatient(rec);
          close();
          if (prefill && prefill.id) { U.toast('首诊登记档案已更新', 'success'); if (typeof Pages.sarcopenia === 'function') Pages.sarcopenia(); }
          else { U.toast('首诊登记已创建', 'success'); startAssess(saved.id); }
        };
      }
    });
  }

  function moduleBanner() {
    return `<div class="sarc-banner">
      <div class="sarc-banner-ico">🧓</div>
      <div>
        <h3>老年肌少症-跌倒风险评估及干预单元</h3>
        <p>系统平行独立核心模块 · 适用 60 周岁及以上老年用户 · 覆盖握力、步速、小腿围、体成分四大核心客观指标，
        搭配 SPPB 躯体功能、CFS 衰弱量表、SARC-F 与肌肉健康生活方式双问卷，自动输出干预方向与跌倒风险指数。</p>
        <div class="sarc-banner-tags">
          <span>独立菜单</span><span>独立业务数据</span><span>独立首诊登记</span><span>独立报告</span><span>独立干预台账</span>
          <span>不共享系统档案</span>
        </div>
      </div>
    </div>`;
  }

  /* ==================================================================
   * 页面一：独立台账工作台
   * ================================================================== */

  function computeSarcPatientView() {
    return sarcPatients().map(p => {
      const recs = D().listByPatient(p.id).sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0));
      const latest = recs[0] || null;
      const rs = latest ? latest.result : null;
      const fall = rs ? rs.fall : null;
      const h = E().num(p.height), w = E().num(p.weight);
      const bmi = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : null;
      const riskMap = { high: 'high', medium: 'mid', low: 'low' };
      const risk = riskMap[fall && fall.levelKey] || 'low';
      const cells = [
        { k: 'BMI', v: bmi != null ? bmi : '—' },
        { k: '已评估', v: recs.length + ' 次' },
        { k: '最近评估', v: latest ? (latest.assessDate || '—') : '—' }
      ];
      const parts = [];
      if (rs && rs.direction) parts.push('<b>肌少症分级：</b>' + U.esc(rs.direction.sarcGrade || '—') + (rs.direction.sarcGradeDesc ? ' — ' + U.esc((rs.direction.sarcGradeDesc || '').slice(0, 32)) : ''));
      if (rs && rs.sppb && rs.sppb.complete) parts.push('<b>SPPB：</b>' + rs.sppb.total + ' / 12');
      if (rs && rs.sarcf && rs.sarcf.complete) parts.push('<b>SARC-F：</b>' + rs.sarcf.total + ' / 10');
      if (rs && rs.plan && rs.plan.reviewDate) parts.push('<b>建议复查：</b>' + U.esc(rs.plan.reviewDate));
      return {
        id: p.id,
        name: p.name || '未命名',
        gender: p.gender === 'female' ? '女' : '男',
        age: p.age != null ? p.age : '',
        bmi,
        risk,
        riskLabel: fall ? fall.level : '低风险',
        cells,
        adviceHtml: parts.length ? parts.join('<br>') : '<span style="color:var(--text-muted)">该登记人尚未完成肌少症评估，点击「进入评估」开始 8 步标准化测评。</span>',
        recs,
        latest,
        fallIndex: fall ? fall.index : '',
        direction: rs ? rs.direction : null,
        sppb: rs ? rs.sppb : null,
        sarcf: rs ? rs.sarcf : null,
        plan: rs ? rs.plan : null,
        icon: '🪪'
      };
    }).sort((a, b) => new Date((b.latest || {}).assessDate || 0) - new Date((a.latest || {}).assessDate || 0));
  }

  window.initSarcCarousel = function () {
    const ring = U.qs('#sr-ring');
    if (!ring) return;
    if (window.__srTimer) { clearInterval(window.__srTimer); window.__srTimer = null; }
    const view = computeSarcPatientView();
    ring.innerHTML = '';
    if (!view.length) {
      ring.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:14px;text-align:center;padding:20px;">暂无首诊登记，点击右上角「新建首诊登记」创建</div>';
      return;
    }
    const N = view.length, step = 360 / N;
    const RK = {
      high: { lab: '高风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 9.5v5"/><path d="M12 17.5h.01"/></svg>' },
      mid:  { lab: '中风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.5h.01"/></svg>' },
      low:  { lab: '低风险', ico: '<svg class="pt-rk-ico" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 6v6c0 4.2 3 7.3 7 9 4-1.7 7-4.8 7-9V6l-7-3z"/><path d="M9 12l2 2 4-4.2"/></svg>' }
    };
    const cards = view.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'sr-card ' + p.risk;
      el.style.setProperty('--a', (i * step) + 'deg');
      const r = RK[p.risk];
      el.innerHTML =
        `<span class="pt-shine"></span>
         <div><div class="sr-nm">${U.esc(p.name)}</div><div class="sr-ag">${U.esc(p.gender)}${p.age ? ' · ' + p.age + '岁' : ''}</div></div>
         <div class="pt-rk ${p.risk}">
           <div class="pt-rk-row">${r.ico}<span class="pt-rk-lab">${r.lab}</span></div>
           <div class="pt-rk-meter"><i></i><i></i><i></i></div>
         </div>`;
      el.addEventListener('click', () => { cur = i; render(); reset(); });
      ring.appendChild(el);
      return el;
    });

    let cur = 0;
    const cardStyle = (idx, c) => {
      let dist = Math.abs(idx - c); dist = Math.min(dist, N - dist);
      if (dist === 0) return { sc: 1.34, op: 1, bl: '0px', br: 1 };
      if (dist === 1) return { sc: 0.96, op: 0.9, bl: '0px', br: 0.92 };
      if (dist === 2) return { sc: 0.8, op: 0.62, bl: '1.2px', br: 0.82 };
      if (dist === 3) return { sc: 0.62, op: 0.4, bl: '2.2px', br: 0.72 };
      return { sc: 0.5, op: 0.26, bl: '3px', br: 0.66 };
    };
    const RISK_PILL = { high: 'badge-danger', mid: 'badge-warning', low: 'badge-success' };
    let currentId = view[0].id;
    function render() {
      ring.style.setProperty('--rot', (-cur * step) + 'deg');
      cards.forEach((c, i) => {
        const st = cardStyle(i, cur);
        c.classList.toggle('is-front', i === cur);
        c.style.setProperty('--sc', st.sc);
        c.style.setProperty('--op', st.op);
        c.style.setProperty('--bl', st.bl);
        c.style.setProperty('--br', st.br);
      });
      const p = view[cur];
      currentId = p.id;
      const $ = id => document.getElementById(id);
      $('sr-d-av').textContent = (p.name || '?').charAt(0);
      $('sr-d-name').textContent = p.name;
      $('sr-d-sub').textContent = [p.gender, p.age ? p.age + '岁' : ''].filter(Boolean).join(' · ');
      $('sr-d-bmi').textContent = p.bmi != null ? p.bmi : '—';
      $('sr-d-recs').textContent = p.recs.length + ' 次';
      $('sr-d-date').textContent = p.latest ? (p.latest.assessDate || '—') : '—';
      const pill = $('sr-d-riskpill');
      pill.textContent = p.riskLabel;
      pill.className = 'badge sr-risk-pill ' + (RISK_PILL[p.risk] || 'badge-info');
      const parts = [];
      if (p.direction) parts.push(`<b>肌少症分级：</b>${U.esc(p.direction.sarcGrade || '—')} — ${U.esc((p.direction.sarcGradeDesc || '').slice(0, 40))}`);
      if (p.sppb && p.sppb.complete) parts.push(`<b>SPPB：</b>${p.sppb.total} / 12`);
      if (p.sarcf && p.sarcf.complete) parts.push(`<b>SARC-F：</b>${p.sarcf.total} / 10`);
      if (p.plan && p.plan.reviewDate) parts.push(`<b>建议复查：</b>${U.esc(p.plan.reviewDate)}`);
      $('sr-d-advice').innerHTML = parts.length ? parts.join('<br>') : '<span style="color:var(--text-muted)">该登记人尚未完成肌少症评估，点击「开始评估」进入 8 步标准化测评。</span>';
      $('sr-cap').textContent = `第 ${cur + 1} / ${N} 位 · ${p.name}`;
    }
    const next = document.getElementById('sr-next');
    const prev = document.getElementById('sr-prev');
    const startBtn = document.getElementById('sr-start');
    const editBtn = document.getElementById('sr-edit');
    const delBtn = document.getElementById('sr-pdel');
    if (next) next.onclick = () => { cur = (cur + 1) % N; render(); reset(); };
    if (prev) prev.onclick = () => { cur = (cur - 1 + N) % N; render(); reset(); };
    if (startBtn) startBtn.onclick = async (e) => { await U.withBtn(e.currentTarget, '准备中…', async () => { startAssess(currentId); }); };
    if (editBtn) editBtn.onclick = () => { openRegisterModal(D().getPatient(currentId)); };
    if (delBtn) delBtn.onclick = () => U.confirm('确认删除该首诊登记档案？其名下评估记录仍保留在台账中，可单独删除。', () => {
      D().removePatient(currentId); U.toast('已删除登记档案', 'success'); Pages.sarcopenia();
    });
    function reset() { if (window.__srTimer) clearInterval(window.__srTimer); window.__srTimer = setInterval(() => { if (!document.getElementById('sr-ring')) { clearInterval(window.__srTimer); window.__srTimer = null; return; } cur = (cur + 1) % N; render(); }, 5000); }
    render(); reset();
  };

  Pages.sarcopenia = function () {
    const patients = sarcPatients();
    const all = D().list();
    const focusId = activePatientId() || (patients.length ? (() => {
      let best = null, bn = -1;
      patients.forEach(p => { const n = D().listByPatient(p.id).length; if (n > bn) { bn = n; best = p.id; } });
      return best;
    })() : null);
    const focusRecords = focusId ? D().listByPatient(focusId) : [];
    const focusName = (D().getPatient(focusId) || {}).name || '';

    const sview = computeSarcPatientView();

    // 肌少症分级筛选项随 ledgerCard 一起移除
    // —— 同款布局：标题栏 / 患者左右结构（3D 轮播 + 详情） / 训练执行 + 复测 左右并排 / 今日待办抽屉 ——
    const titleBar = `<div class="ledger-titlebar lt-sarc">
      <button class="btn btn-primary lt-cta lt-cta-left" id="btn-new-reg">＋ 新建首诊登记</button>
      <div class="lt-brand"><span class="lt-ico">🪪</span><div class="lt-text"><h1>肌少症-跌倒风险台账</h1><span class="lt-sub">独立档案 · <b>${patients.length} 位在管</b></span></div></div>
    </div>`;

    const ptCardHost = `<div class="card mt-3 pt-card-host">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🪪</span>肌少症首诊登记名册（独立档案）</h3>
        <span class="badge badge-info" id="sr-count">${patients.length} 位在管</span></div>
      <div class="card-body pt-body-v">
        <div class="pt-mid">
          <div class="portal-stage pt-stage" id="sr-stage">
            <div class="portal-track" id="sr-track"></div>
            <div class="portal-navgroup">
              <button class="portal-nav prev" id="sr-prev" aria-label="上一位">‹</button>
              <button class="portal-nav next" id="sr-next" aria-label="下一位">›</button>
            </div>
          </div>
          <div class="pt-detail">
            <div class="pt-detail-top">
              <div class="pt-d-av" id="sr-d-av">—</div>
              <div><div class="pt-d-name" id="sr-d-name">—</div><div class="pt-d-sub" id="sr-d-sub"></div></div>
              <span class="badge pt-risk-pill" id="sr-d-riskpill"></span>
            </div>
            <div class="pt-grid" id="sr-d-grid"></div>
            <div class="pt-ai" id="sr-d-advice"></div>
            <div class="pt-actions">
              <button class="btn btn-primary btn-sm" id="sr-open">📋 调阅档案</button>
              <button class="btn btn-sm" id="sr-assess">进入评估</button>
              <button class="btn btn-ghost btn-sm" id="sr-edit">编辑档案</button>
              <button class="btn btn-ghost btn-sm" id="sr-del" style="color:var(--danger)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    // 工作流卡片（WF / sarc2Bar / ledgerCard / trendCard / emptyCard）已移除：
    // 台账只保留「患者左右结构（3D 轮播 + 详情）」+ 「训练执行 / 复测 左右并排」 + 「今日待办（悬浮抽屉）」

    const execCard = (window.TrainingExecution && window.TrainingExecution.ledgerCard) ? window.TrainingExecution.ledgerCard('sarcopenia') : '';

    const reminders = [];
    patients.forEach(p => {
      const recs = D().listByPatient(p.id).sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0));
      const latest = recs[0];
      if (latest && latest.result && latest.result.plan && latest.result.plan.reviewDate) {
        const days = U.daysBetween(latest.result.plan.reviewDate, new Date());
        if (days <= 30) reminders.push({ name: p.name, id: p.id, date: latest.result.plan.reviewDate, days });
      }
    });
    const remCard = reminders.length ? `<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>周期复测提醒</h3><span class="badge badge-warning">${reminders.length} 位登记人临期</span></div>
      <div class="card-body"><div class="table-wrap"><table>
        <thead><tr><th>登记人</th><th>建议复查日期</th><th>剩余天数</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${reminders.map(r => `<tr><td><strong>${U.esc(r.name)}</strong></td><td>${U.esc(r.date)}</td><td>${r.days} 天</td>
          <td>${r.days <= 0 ? '<span class="badge badge-danger">已到复查</span>' : '<span class="badge badge-warning">临近复查</span>'}</td>
          <td><button class="btn btn-sm btn-primary sr-rem-btn" data-id="${r.id}">进入评估</button></td></tr>`).join('')}</tbody>
      </table></div></div></div>` : '';

    const todoHtml = ttCard('sarc');
    let todoCount = 0;
    try { todoCount = (window.TodayTodo.buildSarc(all).items || []).length; } catch (e) {}
    const todoDrawer = todoHtml ? '<div class="lw-todo-pop" id="lw-todo-pop"><div class="lw-todo-backdrop" id="lw-todo-backdrop"></div><div class="lw-todo-panel" id="lw-todo-panel"><button type="button" class="lw-todo-close" id="lw-todo-close" aria-label="关闭">✕</button>' + todoHtml + '</div></div>' : '';
    const todoFab = `<button type="button" class="lw-todo-fab" id="lw-todo-fab" title="今日待办" aria-label="今日待办"><span class="lw-todo-ico">📌</span>${todoCount ? '<span class="lw-todo-badge">' + todoCount + '</span>' : ''}</button>`;

    // 底部左右并排：训练执行记录 + 周期复测提醒
    const bottomCards = [execCard, remCard].filter(Boolean).join('');
    const bottomRowHtml = bottomCards ? '<div class="lw-bottom-row">' + bottomCards + '</div>' : '';

    const wrap = U.el(`<div class="ledger-sarc-wrap">
      ${titleBar}
      <div class="lw-top">${ptCardHost}</div>
      ${bottomRowHtml}
      ${todoDrawer}${todoFab}
    </div>`);

    const btnReg = U.qs('#btn-new-reg', wrap);
    if (btnReg) btnReg.onclick = () => openRegisterModal();

    setTimeout(() => { try {
      window.initRegistryCarousel({
        trackId: 'sr-track', stageId: 'sr-stage', prefix: 'sr', view: computeSarcPatientView(),
        emptyText: '暂无首诊登记，点击上方「新建首诊登记」创建',
        onOpen: (id) => { openRegisterModal(D().getPatient(id)); },
        onAssess: (id) => { startAssess(id); },
        onEdit: (id) => { openRegisterModal(D().getPatient(id)); },
        onDel: (id) => { U.confirm('确认删除该首诊登记档案？其名下评估记录仍保留在台账中，可单独删除。', () => { D().removePatient(id); U.toast('已删除登记档案', 'success'); Pages.sarcopenia(); }); }
      });
    } catch (e) { console.error('肌少症轮播初始化失败', e); } }, 90);

    setTimeout(() => { try {
      const fab = U.qs('#lw-todo-fab', wrap); const pop = U.qs('#lw-todo-pop', wrap);
      const backdrop = U.qs('#lw-todo-backdrop', wrap); const closeBtn = U.qs('#lw-todo-close', wrap);
      if (fab && pop) {
        const hide = () => { pop.classList.remove('open'); fab.classList.remove('active'); };
        fab.onclick = (ev) => { ev.stopPropagation(); pop.classList.toggle('open'); fab.classList.toggle('active', pop.classList.contains('open')); };
        if (backdrop) backdrop.onclick = hide;
        if (closeBtn) closeBtn.onclick = hide;
        if (window.addEventListener) window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop.classList.contains('open')) hide(); });
      }
    } catch (e) {} }, 100);

    U.qsa('.sr-rem-btn', wrap).forEach(b => b.onclick = () => startAssess(b.dataset.id));

    // S7：肌少症台账搜索 / 筛选 / 排序
    const ledgerEl = U.qs('#sarc-ledger', wrap);
    function renderLedger(records) {
      ledgerEl.innerHTML = ledgerHTML(records);
      bindLedger(ledgerEl, records);
      const c = U.qs('#sl-count', wrap);
      if (c) c.textContent = records.length + ' / ' + all.length + ' 条';
    }
    function applyLedgerFilter() {
      const q = (U.qs('#sl-search', wrap).value || '').trim().toLowerCase();
      const g = U.qs('#sl-grade', wrap).value;
      const sort = U.qs('#sl-sort', wrap).value;
      let arr = all.filter(r => {
        const rs = r.result || {};
        const lvl = (rs.direction && rs.direction.sarcGradeLevel) || 'na';
        if (g && lvl !== g) return false;
        if (q) {
          const hay = ((r.patientName || '') + ' ' + (r.no || '')).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      arr = arr.slice().sort((a, b) => {
        if (sort === 'date-asc') return new Date(a.assessDate || 0) - new Date(b.assessDate || 0);
        if (sort === 'name') return (a.patientName || '').localeCompare(b.patientName || '');
        if (sort === 'no') return (a.no || '').localeCompare(b.no || '');
        return new Date(b.assessDate || 0) - new Date(a.assessDate || 0); // date-desc
      });
      renderLedger(arr);
    }
    U.qs('#sl-search', wrap)?.addEventListener('input', applyLedgerFilter);
    U.qs('#sl-grade', wrap)?.addEventListener('change', applyLedgerFilter);
    U.qs('#sl-sort', wrap)?.addEventListener('change', applyLedgerFilter);
    const ledgerEl2 = U.qs('#sarc-ledger', wrap);
    if (ledgerEl2) renderLedger(all);
    else { /* 专项评估台账卡片已移除，此处不渲染历史台账 */ }

    const btnSarc2 = U.qs('#btn-sarc2', wrap);
    if (btnSarc2) btnSarc2.onclick = function () {
      var ctx = window.__sarcLastCompute;
      var html;
      if (ctx && window.SarcEngine2) {
        try {
          // 必须过适配器：computeAll 返回对象态 calfEval/gaitEval，直接传会丢禁忌与低肌量信号
          var c2 = window.SarcEngine2.adaptComputeResult
            ? window.SarcEngine2.adaptComputeResult(ctx, window.__sarcLastPatient) : ctx;
          var plan = window.SarcEngine2.generate(c2);
          html = window.SarcEngine2.renderHTML(plan);
        } catch (e) { html = '<p style="color:var(--danger)">严谨版方案生成失败：' + U.esc(U.errMsg(e)) + '</p>'; }
      } else {
        html = '<div class="sarc2-empty"><p><b>暂无可用的肌少症评估结果</b></p><p style="font-size:13px;color:var(--text-muted);">请先在「肌少症标准化评估」中完成一次评估（步骤 1–8），系统会自动记录评估数据，随后点此查看严谨版（严重度分级 + 客观锚定剂量 + 设备同源 + 可解释依据）方案。</p></div>';
      }
      U.modal({ title: '肌少症严谨版方案（SarcEngine2）', body: html, width: 880, onMount: function (overlay) { bindSarcDeviceMedia(overlay); } });
    };

    return wrap;
  };

  function statMini(label, val, unit, color) {
    return `<div class="sarc-stat">
      <div class="sarc-stat-l">${U.esc(label)}</div>
      <div class="sarc-stat-v" style="color:${color};">${U.esc(String(val))}<span>${U.esc(unit)}</span></div>
    </div>`;
  }

  function ledgerHTML(records) {
    if (!records.length) {
      return `<div class="sarc-empty">
        <div style="font-size:44px;">🗂️</div>
        <p><b>暂无肌少症专项评估记录</b></p>
        <p style="font-size:13px;color:var(--text-muted);">点击右上角「新建肌少症评估」，按 8 步标准化流程完成测评。</p>
      </div>`;
    }
    return `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;min-width:1000px;">
      <thead><tr>
        <th>登记人</th><th>评估编号</th><th>评估日期</th><th>肌少症分级</th><th>干预方向</th>
        <th>跌倒风险</th><th>SPPB</th><th>SARC-F</th><th>建议复查</th><th style="width:200px;">操作</th>
      </tr></thead>
      <tbody>${records.map(r => {
        const rs = r.result || {}, dir = rs.direction || {}, fall = rs.fall || {}, sppb = rs.sppb || {};
        return `<tr>
          <td><b>${U.esc(r.patientName || '—')}</b></td>
          <td><b>${U.esc(r.no || '—')}</b></td>
          <td>${U.esc(r.assessDate || '—')}</td>
          <td>${chip(dir.sarcGradeLevel || 'na', dir.sarcGrade || '—')}</td>
          <td>${chip(dir.color || 'na', (dir.icon || '') + ' ' + (dir.name || '—'))}</td>
          <td>${chip(fall.color || 'na', (fall.index != null ? fall.index + ' 分 · ' : '') + (fall.level || '—'))}</td>
          <td>${sppb.complete ? sppb.total + ' / 12' : '—'}</td>
          <td>${rs.sarcf && rs.sarcf.complete ? rs.sarcf.total + ' / 10' : '—'}</td>
          <td>${rs.plan ? U.esc(rs.plan.reviewDate) : '—'}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm sarc-view" data-id="${U.esc(r.id)}">查看报告</button>
            ${r.reportFile ? `<button class="btn btn-ghost btn-sm sarc-view-file" data-id="${U.esc(r.id)}">查看原报告</button>` : ''}
            <button class="btn btn-ghost btn-sm sarc-print" data-id="${U.esc(r.id)}">打印</button>
            <button class="btn btn-ghost btn-sm sarc-del" data-id="${U.esc(r.id)}" style="color:var(--danger);">删除</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function viewBodyReport(recordId, meta) {
    D().getReportFile(recordId).then(function (blob) {
      if (!blob) { U.toast('未找到原报告文件（可能未归档或已删除）', 'warning'); return; }
      const url = URL.createObjectURL(blob);
      const name = (meta && meta.name) || '外部人体成分报告';
      const isPdf = (meta && /pdf/i.test(meta.type || '')) || /\.pdf$/i.test(name);
      const viewer = isPdf
        ? `<iframe src="${url}" style="width:100%;height:72vh;border:0;border-radius:8px;background:#fff;"></iframe>`
        : `<img src="${url}" alt="${U.esc(name)}" style="max-width:100%;max-height:72vh;display:block;margin:0 auto;border-radius:8px;">`;
      U.modal({
        title: '外部人体成分报告原件 · ' + name,
        width: '960px',
        body: viewer + `<div style="margin-top:12px;text-align:right;">
          <a class="btn btn-ghost btn-sm" href="${url}" download="${U.esc(name)}">⬇ 下载原件</a></div>`,
        onMount: function (ov) {
          const revoke = function () { try { URL.revokeObjectURL(url); } catch (e) {} };
          const obs = new MutationObserver(function () {
            if (!document.body.contains(ov)) { revoke(); obs.disconnect(); }
          });
          obs.observe(document.body, { childList: true });
          setTimeout(revoke, 60000);
        }
      });
    }).catch(function (e) { U.toast('打开原报告失败：' + U.errMsg(e), 'error'); });
  }

  function bindLedger(root, records) {
    U.qsa('.sarc-view-file', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (!rec || !rec.reportFile) return U.toast('该记录未归档原报告', 'warning');
      viewBodyReport(rec.id, rec.reportFile);
    });
    U.qsa('.sarc-view', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (!rec) return U.toast('记录不存在', 'error');
      U.modal({
        title: `肌少症专项评估报告 · ${rec.no}`, width: '1080px',
        body: `<div id="sarc-report-host" style="max-height:70vh;overflow:auto;">${window.buildSarcReport(rec)}</div>`,
        footer: `<button class="btn btn-ghost" data-close>关闭</button>
                 <button class="btn btn-primary" id="m-edit-exerc">✎ 编辑训练动作</button>
                 <button class="btn btn-success" id="m-print-sarc">打印 / 导出</button>`,
        onMount: (m, close) => {
          const host = U.qs('#sarc-report-host', m);
          const pb = U.qs('#m-print-sarc', m);
          if (pb) pb.onclick = () => printSarc(rec);
          const eb = U.qs('#m-edit-exerc', m);
          if (eb) eb.onclick = () => {
            const ep = rec.result && rec.result.plan && rec.result.plan.home && rec.result.plan.home.exercisePlan;
            if (!ep) return U.toast('该记录暂无肌少症居家方案可编辑', 'warning');
            openSarcExerciseEditor(ep, (edited, c) => {
              rec.result.plan.home.exercisePlan = edited;
              try { D().save(rec); } catch (e) { console.warn('[肌少症] 保存训练方案失败', e); }
              if (host) host.innerHTML = window.buildSarcReport(rec);
              c();
              U.toast('训练动作已更新并保存', 'success');
            });
          };
        }
      });
    });
    U.qsa('.sarc-print', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (rec) printSarc(rec);
    });
    U.qsa('.sarc-del', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (!rec) return;
      U.confirm(`确认删除评估记录「${rec.no}」？该操作不可恢复。`, async () => {
        await D().deleteReportFile(rec.id);
        D().remove(rec.id);
        U.toast('评估记录已删除', 'success');
        route();
      });
    });
  }

  function trendHTML(records) {
    const asc = [...records].sort((a, b) => new Date(a.assessDate) - new Date(b.assessDate));
    const rows = [
      ['小腿围 (cm)', r => (r.input || {}).calf],
      ['握力 (kg)', r => (r.input || {}).grip],
      ['4 米步速 (m/s)', r => (r.input || {}).gait],
      ['SMI (kg/㎡)', r => ((r.input || {}).body || {}).smi],
      ['体脂率 (%)', r => ((r.input || {}).body || {}).bodyFat],
      ['SPPB 总分', r => (r.result && r.result.sppb && r.result.sppb.complete) ? r.result.sppb.total : null],
      ['SARC-F 得分', r => (r.result && r.result.sarcf && r.result.sarcf.complete) ? r.result.sarcf.total : null],
      ['跌倒风险指数', r => (r.result && r.result.fall) ? r.result.fall.index : null]
    ];
    const better = { '小腿围 (cm)': 1, '握力 (kg)': 1, '4 米步速 (m/s)': 1, 'SMI (kg/㎡)': 1, 'SPPB 总分': 1, '体脂率 (%)': -1, 'SARC-F 得分': -1, '跌倒风险指数': -1 };

    return `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;min-width:640px;">
      <thead><tr><th>指标</th>${asc.map(r => `<th>${U.esc(r.assessDate)}</th>`).join('')}<th style="width:140px;">变化</th></tr></thead>
      <tbody>${rows.map(([name, fn]) => {
        const vals = asc.map(fn).map(v => E().num(v));
        const first = vals.find(v => v != null);
        const lastIdx = [...vals].reverse().findIndex(v => v != null);
        const last = lastIdx === -1 ? null : vals[vals.length - 1 - lastIdx];
        let deltaHTML = '<span style="color:var(--text-muted);">—</span>';
        if (first != null && last != null && vals.filter(v => v != null).length >= 2) {
          const d = U.round(last - first, 2);
          const dir = better[name] || 1;
          const good = d * dir > 0;
          const flat = Math.abs(d) < 1e-9;
          const col = flat ? 'var(--text-muted)' : (good ? 'var(--success)' : 'var(--danger)');
          deltaHTML = `<b style="color:${col};">${flat ? '持平' : (d > 0 ? '▲ +' + d : '▼ ' + d)}</b>
            ${flat ? '' : `<span style="font-size:11px;color:${col};margin-left:4px;">${good ? '改善' : '需关注'}</span>`}`;
        }
        return `<tr><td><b>${U.esc(name)}</b></td>
          ${vals.map(v => `<td>${v == null ? '—' : v}</td>`).join('')}
          <td>${deltaHTML}</td></tr>`;
      }).join('')}</tbody></table></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:10px;line-height:1.7;">
        趋势对比数据仅取自本模块独立台账，不与生活方式干预模块数据合并统计。
      </div>`;
  }

  /* ==================================================================
   * 3D 六边形能力盾视图（落地版）：真实 3D 老人 + 环绕盾牌环
   * 盾牌 = 评估步骤，可点击跳转；青色=当前步，绿色=已完成步。
   * 依赖 index.html 的 importmap + 本地 vendor/three（无外网）。
   * ================================================================== */
  function initShield3D(vizEl, opts) {
    opts = opts || {};
    const steps = opts.steps || [];
    const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : function () {};

    /* 自动轮转控制：盾牌环与老人模型共用同一开关；点击交互/弹窗会暂停，关闭弹窗后恢复 */
    let autoRot = true;
    let elderModel = null;
    function setAutoRot(v) {
      autoRot = !!v;
      const onB = vizEl.querySelector('.shield3d-ctrls [data-rot="on"]');
      const offB = vizEl.querySelector('.shield3d-ctrls [data-rot="off"]');
      if (onB) onB.classList.toggle('is-active', autoRot);
      if (offB) offB.classList.toggle('is-active', !autoRot);
    }

    return (async function () {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

      const canvas = document.createElement('canvas');
      canvas.className = 'shield3d-canvas';
      vizEl.innerHTML = '';
      vizEl.appendChild(canvas);
      const tip = document.createElement('div');
      tip.className = 'ac-viz-tip shield3d-tip';
      tip.textContent = '拖拽旋转 · 点击盾牌跳转对应评估步骤；青色为当前步，绿色为已完成步。';
      vizEl.appendChild(tip);

      /* 左下角：自动轮转 / 停止轮转 控制按钮 */
      const ctrls = document.createElement('div');
      ctrls.className = 'shield3d-ctrls';
      ctrls.innerHTML = '<button type="button" class="shield3d-ctrl-btn" data-rot="on" title="恢复自动轮转" aria-label="自动轮转"><span class="ic" aria-hidden="true">▶</span><span class="lbl">自动轮转</span></button>'
        + '<button type="button" class="shield3d-ctrl-btn" data-rot="off" title="停止自动轮转" aria-label="停止轮转"><span class="ic" aria-hidden="true">⏸</span><span class="lbl">停止轮转</span></button>';
      vizEl.appendChild(ctrls);
      ctrls.querySelector('[data-rot="on"]').addEventListener('click', function () { setAutoRot(true); });
      ctrls.querySelector('[data-rot="off"]').addEventListener('click', function () { setAutoRot(false); });
      setAutoRot(true);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      /* 等待浏览器完成布局后再取尺寸，避免 clientWidth/Height 为 0 */
      await new Promise(r => requestAnimationFrame(r));
      const W0 = Math.max(320, vizEl.clientWidth || 760);
      const H0 = Math.max(240, vizEl.clientHeight || 460);
      renderer.setSize(W0, H0, false);
      canvas.style.width = W0 + 'px';
      canvas.style.height = H0 + 'px';
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, W0 / H0, 0.1, 100);
      /* 初始相机距离：后续会根据场景内容再调整 */
      camera.position.set(0, 0.2, 5.0);

      /* 灯光：默认偏暗（适配深色背景）；亮色主题下整体提亮老人模型，避免发暗 */
      const ambient = new THREE.AmbientLight(0xffffff, 1.15); scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 0.18); key.position.set(3, 5, 4); scene.add(key);
      const rim = new THREE.DirectionalLight(0x00d9ff, 0.08); rim.position.set(-4, 2, -4); scene.add(rim);
      const fill = new THREE.PointLight(0x00ff9d, 0.12, 8); fill.position.set(0, -1, 2); scene.add(fill);

      /* 主题联动：根据 <html data-theme> 调整亮度（亮色时提升老人可见度，暗色保持原观感） */
      function applyThemeLighting(mode) {
        const light = mode === 'light';
        ambient.intensity = light ? 1.7 : 1.15;
        key.intensity = light ? 0.6 : 0.18;
        rim.intensity = light ? 0.18 : 0.08;
        fill.intensity = light ? 0.4 : 0.12;
        renderer.toneMappingExposure = light ? 1.12 : 1.05;
      }
      applyThemeLighting(document.documentElement.getAttribute('data-theme'));
      let themeObs = null;
      if (typeof MutationObserver !== 'undefined') {
        themeObs = new MutationObserver(function () { applyThemeLighting(document.documentElement.getAttribute('data-theme')); });
        themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }

      const ring = new THREE.Group();
      scene.add(ring);

      /* 真实 3D 老人（失败不影响盾牌显示） */
      const loader = new GLTFLoader();
      const CACHE_BUST_ELDER = '?v=20260821';
      loader.load('assets/elder_20260816.glb' + CACHE_BUST_ELDER, function (gltf) {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const c = box.getCenter(new THREE.Vector3());
        console.log('[shield3D] elder model size', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));

        /* 归一化：把模型包围盒最大边缩放到 3.4（标准老人身高），进一步放大主体；盾牌 R/scale 不变，仅此值决定老人大小 */
        const maxDim = Math.max(0.001, size.x, size.y, size.z);
        const s = 3.4 / maxDim;
        model.position.set(-c.x * s, -c.y * s, -c.z * s);
        model.scale.set(s, s, s);

        /* 如果 y 轴远小于其他轴，模型可能是躺平的，尝试绕 X 轴立起来 */
        if (size.y < 0.3 * maxDim) {
          model.rotation.x = -Math.PI / 2;
        }

        /* 把老人底部对齐到 y=-1.6，盾牌环在 y=0 附近环绕（放大后比例同步） */
        model.position.y = -1.6;
        scene.add(model);
        elderModel = model;   // 供动画循环让老人缓慢自转

        /* 根据老人+盾牌环整体调整相机距离：修正宽屏时水平误判把相机推远导致模型变小 */
        const halfH = 2.3, halfW = 2.15;                 // 需容纳的老人高度 / 盾牌环半径
        const fov = camera.fov * Math.PI / 180;
        const tanHalf = Math.tan(fov / 2);
        const distY = halfH / tanHalf;                   // 竖直方向约束
        const distX = halfW / (tanHalf * camera.aspect); // 水平约束（已除 aspect，避免宽屏推远）
        camera.position.z = Math.max(distY, distX) * 1.06;
        camera.position.y = 0;
        /* 关键修复：相机必须对准老人模型视觉中心。
           model.position 是模型本地原点在世界中的位置，经过旋转/缩后未必等于视觉中心；
           因此用 setFromObject 重新计算世界包围盒中心并对准它，才能保证模型完整出现在画面内。 */
        const worldBox = new THREE.Box3().setFromObject(model);
        const worldCenter = worldBox.getCenter(new THREE.Vector3());
        camera.lookAt(worldCenter);
      }, undefined, function (err) {
        console.warn('[shield3D] 老人模型加载失败，仅显示盾牌环', err);
        var em = (err && err.message) ? err.message : String(err);
        try {
          if (getComputedStyle(vizEl).position === 'static') vizEl.style.position = 'relative';
          var eb = document.createElement('div');
          eb.style.cssText = 'position:absolute;top:10px;left:10px;z-index:6;font-size:11px;padding:5px 10px;border-radius:999px;background:rgba(239,68,68,.16);color:#ef4444;border:1px solid rgba(239,68,68,.5);font-weight:600;white-space:normal;max-width:80%;line-height:1.4;';
          eb.textContent = '老人3D模型加载失败：' + em.slice(0, 140);
          vizEl.appendChild(eb);
        } catch (_) {}
      });

      function hexShape() {
        const shape = new THREE.Shape();
        const R = 0.5;
        for (let i = 0; i < 6; i++) {
          const a = (i * 60 - 30) * Math.PI / 180;
          const x = Math.cos(a) * R, y = Math.sin(a) * R;
          if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
        }
        shape.closePath();
        return shape;
      }

      function shieldLabel(st) {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 512;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(256, 256, 40, 256, 256, 230);
        g.addColorStop(0, 'rgba(6,16,36,.96)');
        g.addColorStop(0.55, 'rgba(6,16,36,.72)');
        g.addColorStop(0.85, 'rgba(6,16,36,.25)');
        g.addColorStop(1, 'rgba(6,16,36,0)');
        x.fillStyle = g; x.fillRect(0, 0, 512, 512);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = 'bold 170px system-ui, Arial';
        x.fillStyle = '#fff'; x.shadowColor = '#00d9ff'; x.shadowBlur = 22;
        x.fillText(st.n, 256, 195);
        const title = fitShieldText(x, st.t, 430, 'bold 58px system-ui, Arial');
        x.font = title.font; x.fillStyle = '#e0f7ff';
        x.shadowColor = '#00a8c6'; x.shadowBlur = 14;
        x.fillText(title.text, 256, 330);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 8;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
        mesh.position.z = 0.11;
        mesh.renderOrder = 10;
        return mesh;
      }
      function fitShieldText(ctx, text, maxW, font) {
        ctx.font = font;
        let fs = parseInt(font, 10);
        while (ctx.measureText(text).width > maxW && fs > 20) { fs -= 2; ctx.font = 'bold ' + fs + 'px system-ui, Arial'; }
        return { text, font: ctx.font };
      }

      const shields = [];
      const R = 2.05;
      steps.forEach(function (st, i) {
        const grp = new THREE.Group();
        grp.userData.step = st;
        const ang = (i / steps.length) * Math.PI * 2;
        const geo = new THREE.ExtrudeGeometry(hexShape(), { depth: 0.09, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 4 });
        geo.center();
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00a8b5, roughness: 0.62, metalness: 0.04,
          transparent: true, opacity: 0.86, emissive: 0x004d5c, emissiveIntensity: 0.24,
          depthWrite: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(0.82, 0.82, 0.82);
        grp.add(mesh);

        const loop = new THREE.BufferGeometry();
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const a = (k * 60 - 30) * Math.PI / 180;
          pts.push(Math.cos(a) * 0.52, Math.sin(a) * 0.52, 0.06);
        }
        loop.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const line = new THREE.Line(loop, new THREE.LineBasicMaterial({ color: 0x66f0ff, transparent: true, opacity: 0.7 }));
        grp.add(line);

        const lbl = shieldLabel(st);
        grp.add(lbl);

        grp.position.set(Math.sin(ang) * R, 0, Math.cos(ang) * R);
        grp.rotation.y = ang;
        ring.add(grp);
        shields.push({ grp: grp, mat: mat, line: line, st: st });
      });

      function setStep(cur, maxN) {
        maxN = maxN || cur || 1;
        shields.forEach(function (o) {
          const n = o.st.n;
          const done = n < cur, isCur = n === cur;
          if (isCur) {
            o.mat.color.setHex(0x00d9ff); o.mat.emissive.setHex(0x006980); o.mat.emissiveIntensity = 0.5; o.mat.opacity = 0.94;
            o.line.material.opacity = 1; o.grp.scale.setScalar(1.08);
          } else if (done) {
            o.mat.color.setHex(0x00c896); o.mat.emissive.setHex(0x004d3a); o.mat.emissiveIntensity = 0.34; o.mat.opacity = 0.88;
            o.line.material.color.setHex(0x66ffd4); o.line.material.opacity = 0.85; o.grp.scale.setScalar(1);
          } else {
            o.mat.color.setHex(0x00a8b5); o.mat.emissive.setHex(0x004d5c); o.mat.emissiveIntensity = 0.22; o.mat.opacity = 0.82;
            o.line.material.color.setHex(0x66f0ff); o.line.material.opacity = 0.7; o.grp.scale.setScalar(1);
          }
        });
      }

      const ray = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let autoRot = true;
      canvas.addEventListener('pointerdown', function () { autoRot = false; });
      canvas.addEventListener('click', function (e) {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(ring.children, true);
        if (hits.length) {
          let g = hits[0].object;
          while (g.parent && g.parent !== ring) g = g.parent;
          if (g.userData.step) onSelect(g.userData.step.n);
        }
      });

      const clock = new THREE.Clock();
      let raf = 0;
      let ro = null;
      function animate() {
        raf = requestAnimationFrame(animate);
        if (!document.body.contains(canvas)) {
          cancelAnimationFrame(raf);
          if (ro) ro.disconnect();
          return;
        }
        const t = clock.getElapsedTime();
        if (autoRot) { ring.rotation.y += 0.003; if (elderModel) elderModel.rotation.y += 0.0016; }
        shields.forEach(function (o, i) {
          o.grp.position.y = Math.sin(t * 0.5 + i * 0.7) * 0.018;
          const lbl = o.grp.children.find(function (cc) {
            return cc.material && cc.material.map && cc.material.map.image && cc.material.map.image.tagName === 'CANVAS';
          });
          if (lbl) lbl.lookAt(camera.position);
        });
        renderer.render(scene, camera);
      }
      animate();

      try {
        ro = new ResizeObserver(function () {
          const w = vizEl.clientWidth, h = vizEl.clientHeight;
          if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); }
        });
        ro.observe(vizEl);
      } catch (e) { /* ResizeObserver 可选 */ }

      return {
        setStep: setStep,
        setAutoRot: setAutoRot,
        dispose: function () { cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (themeObs) themeObs.disconnect(); renderer.dispose(); }
      };
    })();
  }

  /* ==================================================================
   * 页面二：8 步标准化评估向导
   * ================================================================== */
  const STEPS = [
    { n: 1, t: '禁忌筛查', i: '🚫' },
    { n: 2, t: '基础信息同步', i: '🪪' },
    { n: 3, t: '客观指标录入', i: '📐' },
    { n: 4, t: '专项问卷作答', i: '📝' },
    { n: 5, t: '自动运算评分', i: '🧮' },
    { n: 6, t: '综合风险判定', i: '⚖️' },
    { n: 7, t: '评估报告', i: '📄' },
    { n: 8, t: '方案推荐', i: '🏃' },
    { n: 9, t: '跌倒风险评估', i: '🛡️' },
    { n: 10, t: '纳入台账随访', i: '📒' }
  ];

  Pages.sarcopeniaAssess = function () {
    /* 若当前未绑定评估对象但已存在首诊登记，自动选中最近一位，避免直接进入评估页时「页面无显示」 */
    if (!activePatientId() && sarcPatients().length) {
      const d = D().getDraft() || {};
      d.patientId = sarcPatients()[0].id;
      if (!d.step) d.step = 1;
      if (!d.body) d.body = { smi: '', bodyFat: '', visceral: '', muscleMass: '', bmr: '', weight: '' };
      D().saveDraft(d);
    }
    const warn = needPatient();
    if (warn) return warn;
    const base = basePatient();

    const draft = D().getDraft();
    /* 默认草稿模板：保证所有步骤用到的字段（含嵌套对象）始终存在，
       避免「开始评估」等入口产生的残缺草稿（缺少 contra/calf/body 等）导致页面渲染崩溃。 */
    const S0 = {
      step: 1, id: 'sarc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: null, patientId: base.id, assessDate: U.today(),
      contra: {}, scene: 'store', hasDevice: true,
      calf: '', grip: '', gait: '',
      balanceKey: '', chairSec: '', chairCannot: false, cfs: '',
      body: { smi: '', bodyFat: '', visceral: '', muscleMass: '', bmr: '', weight: '' },
      strength: null, useStrength: true,
      sarcf: {}, life: {},
      health: {}, exam: {}, exercise: {},
      mnasf: {}, amt: {}, fearFall: {},
      reportFile: null, result: null, saved: false
    };
    let S = (draft && String(draft.patientId) === String(base.id)) ? Object.assign({}, S0, draft) : S0;
    /* 嵌套对象做深合并：以默认空对象兜底，草稿缺字段时不会变成 undefined */
    S.contra = Object.assign({}, S0.contra, S.contra);
    S.body = Object.assign({}, S0.body, S.body || {});
    S.sarcf = Object.assign({}, S0.sarcf, S.sarcf);
    S.life = Object.assign({}, S0.life, S.life);
    S.health = Object.assign({}, S0.health, S.health);
    S.exam = Object.assign({}, S0.exam, S.exam);
    S.exercise = Object.assign({}, S0.exercise, S.exercise);
    S.mnasf = Object.assign({}, S0.mnasf, S.mnasf);
    S.amt = Object.assign({}, S0.amt, S.amt);
    S.fearFall = Object.assign({}, S0.fearFall, S.fearFall);
    S.patientId = base.id;

    /* 同步首诊登记的人体成分基线到本次评估（未填写时预填，评估时可据实修改） */
    let reg = D().getPatient(base.id);
    const regName = reg ? reg.name : '';

    const wrap = U.el(`<div class="sarc-assess d-holo">
      ${moduleBanner()}
      <div class="card mb-3 sarc-head-card"><div class="card-body sarc-head">
        <div><span class="sarc-head-l">评估对象</span>
          <div class="sarc-head-v" id="head-name">${U.esc(base.name)}</div></div>
        <div><span class="sarc-head-l">性别 / 年龄</span>
          <div class="sarc-head-v">${base.gender === 'female' ? '女' : '男'} · ${base.age != null ? base.age + ' 岁' : '—'}</div></div>
        <div><span class="sarc-head-l">评估日期</span>
          <div class="sarc-head-v">${U.esc(S.assessDate)}</div></div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="btn-demo-sarc">一键填充演示数据</button>
          <a class="btn btn-secondary btn-sm" href="#/sarcopenia">返回台账</a>
        </div>
      </div></div>

      <div class="sarc-stepper" id="sarc-stepper"></div>
      <div class="sarc-holo-grid">
        <div class="sarc-viz sarc-viz-3d" id="sarc-viz"></div>
        <div class="sarc-panel">
          <div class="sarc-panel-inner" id="sarc-summary-body"></div>
        </div>
      </div>

      <div class="card mt-3 no-print"><div class="card-body sarc-navbar">
        <button class="btn btn-secondary" id="sarc-prev">← 上一步</button>
        <div class="sarc-nav-mid">
          <div id="sarc-step-hint" class="sarc-hint"></div>
          ${window.SmartForm ? SmartForm.autosaveHTML('sarc-autosave', '草稿自动保存已开启') : ''}
        </div>
        <div class="sarc-output-lamps no-print" id="sarc-output-lamps"></div>
        <button class="btn btn-primary" id="sarc-next">下一步 →</button>
      </div></div>
    </div>`);

    const summaryEl = U.qs('#sarc-summary-body', wrap);
    const stepperEl = U.qs('#sarc-stepper', wrap);
    const prevBtn = U.qs('#sarc-prev', wrap);
    const nextBtn = U.qs('#sarc-next', wrap);
    const hintEl = U.qs('#sarc-step-hint', wrap);

    /* 评估步骤数据填写弹窗：挂载到 document.body，确保全屏覆盖不被主容器裁剪 */
    const oldModal = document.getElementById('sarc-modal');
    if (oldModal) oldModal.remove();
    const modalEl = U.el(`<div class="modal-overlay" id="sarc-modal" style="display:none;">
      <div class="modal sarc-modal">
        <div class="modal-header">
          <h3 id="sarc-modal-title">评估数据填写</h3>
          <button class="btn btn-ghost btn-sm" id="sarc-modal-close" aria-label="关闭">✕</button>
        </div>
        <div class="modal-body" id="sarc-modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="sarc-modal-prev">← 上一步</button>
          <div class="sarc-hint" id="sarc-modal-hint"></div>
          <button class="btn btn-primary" id="sarc-modal-save-close">💾 保存并关闭</button>
          <button class="btn btn-primary" id="sarc-modal-next">下一步 →</button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(modalEl);
    const bodyEl = U.qs('#sarc-modal-body', modalEl);
    const modalTitle = U.qs('#sarc-modal-title', modalEl);
    const modalClose = U.qs('#sarc-modal-close', modalEl);
    const modalPrev = U.qs('#sarc-modal-prev', modalEl);
    const modalNext = U.qs('#sarc-modal-next', modalEl);
    const modalSaveClose = U.qs('#sarc-modal-save-close', modalEl);
    const modalHint = U.qs('#sarc-modal-hint', modalEl);

    /* 草稿自动保存 + 状态指示（SmartForm） */
    const autosave = window.SmartForm
      ? SmartForm.attachAutosave(U.qs('#sarc-autosave', wrap))
      : { ping() {}, fail() {} };
    function saveDraft() {
      try { D().saveDraft(S); autosave.ping(); }
      catch (e) { autosave.fail('自动保存失败：' + (e && e.message ? e.message : '存储异常')); }
    }

    /* 当前步骤的字段校验器（由 bindStep 装配，canNext 消费） */
    let stepValidator = null;
    /* 已解锁的最远步骤（向导锁步：不可跳到未解锁步骤） */
    S.maxStep = Math.max(S.maxStep || 1, S.step || 1);

    /* 各步骤数值字段的合理区间（soft=仅提示，不拦截；否则拦截下一步） */
    const RANGE_RULES = {
      3: {
        '#f-calf': { min: 15, max: 60, label: '小腿围', unit: 'cm', hint: '老年常见 26~42 cm；男 <34 / 女 <33 提示肌量不足' },
        '#f-grip': { min: 1, max: 90, label: '握力', unit: 'kg', hint: '老年判定界值：男 <28 kg / 女 <18 kg' },
        '#f-gait': { min: 0.1, max: 3, label: '4 米步速', unit: 'm/s', hint: '≤1.0 m/s 提示躯体功能下降；≤0.8 m/s 为严重肌少症判定项' },
        '#b-smi': { min: 2, max: 15, label: 'SMI', unit: 'kg/㎡', soft: true, hint: '判定界值：男 <7.0 / 女 <5.7（BIA 法）' },
        '#b-fat': { min: 3, max: 70, label: '体脂率', unit: '%', soft: true },
        '#b-vis': { min: 1, max: 30, label: '内脏脂肪等级', unit: '级', soft: true },
        '#b-mm': { min: 5, max: 70, label: '骨骼肌量', unit: 'kg', soft: true },
        '#b-bmr': { min: 500, max: 3500, label: '基础代谢', unit: 'kcal', soft: true },
        '#b-wt': { min: 20, max: 200, label: '体重', unit: 'kg', soft: true },
        '#f-chair': { min: 3, max: 120, label: '五次坐立用时', unit: '秒', soft: true, hint: '＞12 秒提示下肢力量不足；无法完成请勾选右侧选项' }
      },
      2: {
        '#r-age': { min: 40, max: 120, label: '年龄', unit: '岁' },
        '#r-height': { min: 100, max: 220, label: '身高', unit: 'cm' },
        '#r-weight': { min: 20, max: 200, label: '体重', unit: 'kg' },
        '#r-sbp': { min: 60, max: 260, label: '收缩压', unit: 'mmHg', soft: true },
        '#r-dbp': { min: 30, max: 180, label: '舒张压', unit: 'mmHg', soft: true },
        '#r-stand-sbp': { min: 60, max: 260, label: '立位收缩压', unit: 'mmHg', soft: true },
        '#r-stand-dbp': { min: 30, max: 180, label: '立位舒张压', unit: 'mmHg', soft: true },
        '#r-hba1c': { min: 3, max: 20, label: '糖化血红蛋白', unit: '%', soft: true },
        '#h-fall-count': { min: 0, max: 50, label: '跌倒次数', unit: '次', soft: true },
        '#h-loss-kg': { min: 0, max: 60, label: '体重下降', unit: 'kg', soft: true },
        '#h-drug-count': { min: 0, max: 40, label: '用药种类', unit: '种', soft: true },
        '#h-supp-count': { min: 0, max: 40, label: '补剂种类', unit: '种', soft: true },
        '#e-freq': { min: 0, max: 21, label: '每周运动频次', unit: '次', soft: true }
      }
    };

    /* 蓝牙握力 / 步速设备连接（Web Bluetooth API 接入预留） */
    async function connectBluetooth(root) {
      const statusEl = U.qs('#bt-status', root);
      const readoutEl = U.qs('#bt-readout', root);
      const setStatus = (html) => { if (statusEl) statusEl.innerHTML = html; };
      if (!('bluetooth' in navigator)) {
        setStatus('⚠️ 当前浏览器未提供 Web Bluetooth 接口，无法连接。请使用 Chrome / Edge 桌面版，并通过 HTTPS 或 localhost 访问。');
        U.toast('当前环境不支持蓝牙连接', 'warning');
        return;
      }
      try {
        setStatus('🔍 正在扫描附近蓝牙设备…');
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['device_information', 'battery_service']
        });
        setStatus('🔗 已选择设备：<b>' + U.esc(device.name || '未知设备') + '</b>，正在建立连接…');
        const server = await device.gatt.connect();
        if (readoutEl) readoutEl.style.display = 'flex';
        const dn = U.qs('#bt-devname', root);
        if (dn) dn.textContent = device.name || '未知设备';
        U.toast('蓝牙设备已连接（读数解析依赖设备 GATT 协议，请参考厂商规范接入）', 'success');
      } catch (e) {
        setStatus('⚠️ 蓝牙连接失败或被取消：' + U.esc(U.errMsg(e)) + '。可点击「模拟一次读数」体验采集回填流程。');
        U.toast('蓝牙连接未成功', 'warning');
      }
    }

    function renderStepper() {
      /* 用户要求取消顶部流程进度栏，保留函数占位，后续可恢复 */
      if (stepperEl) stepperEl.innerHTML = '';
    }

    function stepSummaryHTML(k) {
      const s = STEPS[k - 1];
      const pct = stepProgress(k);
      return `<div class="sarc-summary-card">
        <div class="sarc-summary-icon">${s.i}</div>
        <div class="sarc-summary-main">
          <div class="sarc-summary-step">步骤 ${k} / ${STEPS.length}</div>
          <h3 class="sarc-summary-title">${U.esc(s.t)}</h3>
          <div class="sarc-summary-progress"><div class="sarc-summary-bar" style="width:${pct}%"></div></div>
          <div class="sarc-summary-meta">${stepFilledCount(k)} 项已填写 / ${stepTotalCount(k)} 项</div>
        </div>
      </div>
      <div class="sarc-summary-desc">${stepDescription(k)}</div>
      <button class="btn btn-primary btn-block mt-3" id="btn-open-sarc-modal">📝 填写本步骤数据</button>`;
    }

    function openStepModal() {
      modalEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      renderModalBody();
      setTimeout(() => { const first = U.qs('input,select,textarea,button', bodyEl); if (first) first.focus(); }, 50);
    }
    function closeStepModal() {
      modalEl.style.display = 'none';
      document.body.style.overflow = '';
      /* 填写完成/关闭弹窗后，恢复 3D 自动轮转（盾牌环 + 老人） */
      if (wrap._shield3DInst && wrap._shield3DInst.setAutoRot) wrap._shield3DInst.setAutoRot(true);
    }
    function renderModalBody() {
      const k = S.step;
      modalTitle.textContent = `步骤 ${k} · ${STEPS[k - 1].t}`;
      modalHint.textContent = `${STEPS[k - 1].i}  ${k}/${STEPS.length}`;
      bodyEl.innerHTML = stepHTML(k);
      bindStep(k);

      /* —— 智能表单增强（SmartForm）—— */
      if (window.SmartForm) {
        SmartForm.collapsibleCards(bodyEl);
        const rules = RANGE_RULES[k];
        if (rules) stepValidator = SmartForm.bindRanges(bodyEl, rules);
        if (S._flash && S._flash.length) { SmartForm.flash(bodyEl, S._flash); S._flash = null; }
      }
      modalPrev.style.visibility = k === 1 ? 'hidden' : 'visible';
      modalNext.textContent = k === 10 ? '完成并返回台账' : '下一步 →';
    }

    function render() {
      S.maxStep = Math.max(S.maxStep || 1, S.step);
      stepValidator = null;
      renderStepper();
      summaryEl.innerHTML = stepSummaryHTML(S.step);
      const openBtn = U.qs('#btn-open-sarc-modal', summaryEl);
      if (openBtn) openBtn.onclick = openStepModal;
      /* 方案要求：点击右侧「路径」整卡即弹全屏数据填写窗口 */
      const pathCard = U.qs('.sarc-summary-card', summaryEl);
      if (pathCard) pathCard.onclick = function (e) {
        if (e.target.closest('#btn-open-sarc-modal')) return; // 按钮自身已绑定，避免重复
        openStepModal();
      };

      /* 刷新弹窗内表单（弹窗打开状态下跟随步骤切换） */
      if (modalEl.style.display === 'flex') renderModalBody();

      prevBtn.style.visibility = S.step === 1 ? 'hidden' : 'visible';
      nextBtn.textContent = S.step === 10 ? '完成并返回台账' : '下一步 →';
      hintEl.textContent = `步骤 ${S.step} / ${STEPS.length} · ${STEPS[S.step - 1].t}`;
      const lampsEl = U.qs('#sarc-output-lamps', wrap);
      if (lampsEl) {
        let computed = null; try { computed = compute(); } catch (e) { computed = null; }
        const hasReport = !!computed && S.step >= 7;
        const hasPlan = !!computed && S.step >= 8 && !!(computed && computed.plan);
        lampsEl.innerHTML = `<span class="ol-blk${hasReport ? ' on' : ''}"><i class="ol-dot"></i>评估报告${hasReport ? ' ✓' : ''}</span>`
          + `<span class="ol-blk${hasPlan ? ' on' : ''}"><i class="ol-dot"></i>推荐方案${hasPlan ? ' ✓' : ''}</span>`;
      }
      renderViz(S);
      saveDraft();
    }

    function stepProgress(k) {
      const [filled, total] = stepCounts(k);
      return total ? Math.round((filled / total) * 100) : 0;
    }
    function stepFilledCount(k) { return stepCounts(k)[0]; }
    function stepTotalCount(k) { return stepCounts(k)[1]; }
    function stepCounts(k) {
      let filled = 0, total = 0;
      const has = (v) => v != null && v !== '' && (typeof v !== 'object' || Object.keys(v).length > 0);
      const countObj = (o, keys) => { keys.forEach(key => { total++; if (has(o && o[key])) filled++; }); };
      switch (k) {
        case 1:
          E().CONTRA_ITEMS.forEach(it => { total++; if (S.contra[it.key] != null) filled++; });
          break;
        case 2:
          countObj(S, ['scene', 'hasDevice']);
          countObj(S.exam, ['sbp', 'dbp', 'standSbp', 'standDbp', 'hba1c', 'visionLeft', 'visionRight']);
          countObj(S.health, ['fallHistory', 'fallCount', 'useAid', 'aidType', 'weightLoss', 'weightLossKg', 'boneDensity', 'pain', 'painArea', 'drugCount', 'supplementCount', 'calcium', 'vitD', 'diseases']);
          countObj(S.exercise, ['frequency', 'types', 'place', 'weather', 'winter']);
          break;
        case 3:
          countObj(S, ['calf', 'grip', 'gait', 'balanceKey', 'chairSec', 'chairCannot', 'cfs']);
          countObj(S.body, ['smi', 'bodyFat', 'visceral', 'muscleMass', 'bmr', 'weight']);
          break;
        case 4:
          E().SARCF_ITEMS.forEach(it => { total++; if (S.sarcf[it.key] != null) filled++; });
          E().LIFE_SECTIONS.forEach(sec => sec.items.forEach(it => { total++; if (S.life[it.key] != null) filled++; }));
          E().MNA_SF_ITEMS.forEach(it => { total++; if (S.mnasf[it.key] != null) filled++; });
          E().AMT_ITEMS.forEach(it => { total++; if (S.amt[it.key] != null) filled++; });
          E().FEAR_FALL_ITEMS.forEach(it => { total++; if (S.fearFall[it.key] != null) filled++; });
          break;
        case 5: total = 1; if (S.result != null) filled = 1; break;
        case 6: total = 1; if (S.result != null) filled = 1; break;
        case 7: total = 1; if (S.result != null) filled = 1; break;
        case 8: total = 1; if (S.result != null && S.result.plan) filled = 1; break;
        case 9: total = 1; if (S.health && S.health.fallHistory != null) filled = 1; break;
        case 10: total = 1; if (S.saved) filled = 1; break;
      }
      return [filled, Math.max(1, total)];
    }
    function stepDescription(k) {
      const map = {
        1: '先确认本次评估是否存在禁忌症或年龄不符，确保受试者安全。',
        2: '同步首诊登记的基础信息、医学体检、健康史与运动习惯。',
        3: '录入小腿围、握力、4 米步速、五次坐立、平衡测试、体成分等客观指标。',
        4: '完成 SARC-F、生活方式、MNA-SF、AMT、害怕跌倒等量表。',
        5: '系统根据已录入指标自动计算 SMI、握力、步速、SPPB 等评分。',
        6: '基于 AWGS2019/2014 标准判定肌少症分期与风险等级。',
        7: '查看并确认评估报告，可打印或申请 AI 解读。',
        8: '查看推荐的营养补充、运动干预与随访方案。',
        9: '评估 Morse、TUGT、跌倒史等跌倒风险因素。',
        10: '确认评估结果并纳入台账，安排随访计划。'
      };
      return map[k] || '';
    }

    // ---- 评估可视化增强：真实人体图 + 六维风险雷达（不破坏 10 步向导业务逻辑）----
    // ---- 评估可视化增强：真实 3D 老人 + 六边形能力盾环（落地版，保留 10 步向导业务逻辑）----
    function renderLegacyViz(S, vizEl) {
      vizEl.className = 'sarc-viz';
      vizEl.innerHTML = '';
      const gender = base ? base.gender : 'male';
      const atlas = AssessCockpit.buildAtlas(SARC_REGIONS(S, gender), { mode: 'back', frontImg: 'assets/body-front.png', backImg: 'assets/body-back.png' });
      atlas.querySelectorAll('.ac-anchor').forEach(function (a) {
        a.onclick = function () {
          const t = ANCHOR_STEP[a.dataset.rid];
          if (t) { S.step = t; render(); U.toast('已定位到步骤 ' + t + '：' + STEPS[t - 1].t, 'info'); }
        };
      });
      vizEl.appendChild(atlas);
      vizEl.appendChild(AssessCockpit.buildRadar(sarcRadar(S, gender)));
      const tip = document.createElement('div');
      tip.className = 'ac-viz-tip';
      tip.textContent = '点击人体锚点可跳转到对应录入步骤；右侧为六维风险雷达（肌量 / 握力 / 步速 / 起坐 / 平衡 / 跌倒）。';
      vizEl.appendChild(tip);
    }

    const supportsImportMap = (function () {
      try { return HTMLScriptElement.supports('importmap'); } catch (e) { return false; }
    })();

    function renderViz(S) {
      try {
        const vizEl = U.qs('#sarc-viz', wrap);
        if (!vizEl || !window.AssessCockpit) return;

        /* 浏览器不支持 importmap 时降级为传统 atlas+雷达，保证业务可用 */
        if (!supportsImportMap) {
          renderLegacyViz(S, vizEl);
          return;
        }

        vizEl.className = 'sarc-viz sarc-viz-3d';

        /* 同一挂载实例只初始化一次；后续仅更新高亮状态 */
        if (!wrap._shield3DInst) {
          wrap._shield3DInst = { ready: false };
          const loading = document.createElement('div');
          loading.className = 'shield3d-loading';
          loading.textContent = '正在加载 3D 评估视图…';
          vizEl.appendChild(loading);
          initShield3D(vizEl, {
            steps: STEPS,
            onSelect: function (n) {
              if (n === S.step) { openStepModal(); return; }
              const maxN = S.maxStep || S.step;
              if (n > maxN) { U.toast('步骤 ' + n + ' 尚未解锁，请先完成前序步骤', 'warning'); return; }
              S.step = n; render(); openStepModal();
            }
          }).then(function (inst) {
            if (loading.parentNode) loading.remove();
            wrap._shield3DInst = inst;
            inst.setStep(S.step, S.maxStep);
          }).catch(function (err) {
            console.error('[shield3D] init failed, fallback to legacy viz', err);
            renderLegacyViz(S, vizEl);
            const tip = document.createElement('div');
            tip.className = 'ac-viz-tip';
            tip.style.cssText = 'padding:10px 14px;color:#ff9aa2;background:rgba(20,10,10,.45);border-radius:8px;margin-top:8px';
            tip.textContent = '3D 盾牌视图加载失败，已降级为传统视图。错误：' + (err && err.message ? err.message : err);
            vizEl.appendChild(tip);
          });
          return;
        }
        if (wrap._shield3DInst.setStep) wrap._shield3DInst.setStep(S.step, S.maxStep);
      } catch (e) {
        console.error('[sarcViz] render error', e);
      }
    }
    function SARC_REGIONS(S, gender) {
      return [
        { id: 'head', label: '头 / 认知', icon: '🧠', x: 50, y: 11, risk: 'na', summary: '认知 / 营养' },
        { id: 'arm', label: '上肢 / 握力', icon: '💪', x: 30, y: 38, risk: sarcGripLevel(S, gender), summary: '握力' },
        { id: 'core', label: '核心 / 肌量', icon: '🔥', x: 50, y: 50, risk: sarcMassLevel(S, gender), summary: '骨骼肌量 / SMI' },
        { id: 'leg', label: '下肢 / 步速', icon: '🦵', x: 50, y: 84, risk: sarcGaitLevel(S), summary: '步速 / 平衡 / 起坐' }
      ];
    }
    const ANCHOR_STEP = { head: 4, arm: 3, core: 3, leg: 3 };
    function sarcGripLevel(S, gender) {
      const g = U.num(S.grip); if (!g) return 'na';
      const cut = gender === 'female' ? 18 : 28;
      return g < cut ? 'high' : (g < cut + 4 ? 'mid' : 'low');
    }
    function sarcMassLevel(S, gender) {
      const smi = U.num(S.body && S.body.smi); const mm = U.num(S.body && S.body.muscleMass);
      if (smi) { const cut = gender === 'female' ? 5.7 : 7.0; return smi < cut ? 'high' : (smi < cut + 1 ? 'mid' : 'low'); }
      if (mm) return mm < (gender === 'female' ? 15 : 20) ? 'mid' : 'low';
      return 'na';
    }
    function sarcGaitLevel(S) {
      const v = U.num(S.gait); if (!v) return 'na';
      return v <= 0.8 ? 'high' : (v <= 1.0 ? 'mid' : 'low');
    }
    function sarcMassLabel(S, gender) {
      const smi = U.num(S.body && S.body.smi);
      if (smi) return smi < (gender === 'female' ? 5.7 : 7.0) ? '下降' : '正常';
      const mm = U.num(S.body && S.body.muscleMass);
      if (mm) return mm < (gender === 'female' ? 15 : 20) ? '偏低' : '正常';
      return '未录';
    }
    function balanceLabel(S) { const k = S.balanceKey; if (!k) return '未录'; if (/无法|极差/.test(k)) return '异常'; return k; }
    function balanceLevel(S) {
      const k = S.balanceKey; if (!k) return 'na';
      if (/无法|极差/.test(k)) return 'high'; if (/差/.test(k)) return 'mid'; return 'low';
    }
    function fallLabel(S) {
      const h = S.health || {};
      if (h.fallHistory === 'yes' || h.fallHistory === true) return '有史';
      if (U.num(h.fallCount) > 0) return '有史';
      return '无';
    }
    function fallLevel(S) {
      const h = S.health || {};
      if (h.fallHistory === 'yes' || h.fallHistory === true) return 'high';
      if (U.num(h.fallCount) > 0) return 'mid';
      return 'low';
    }
    function sarcRadar(S, gender) {
      const dims = [
        { name: '肌量', label: sarcMassLabel(S, gender), level: sarcMassLevel(S, gender) },
        { name: '握力', label: S.grip ? (U.num(S.grip) + 'kg') : '未录', level: sarcGripLevel(S, gender) },
        { name: '步速', label: S.gait ? (U.num(S.gait) + 'm/s') : '未录', level: sarcGaitLevel(S) },
        { name: '起坐', label: S.chairCannot ? '无法完成' : (S.chairSec ? (U.num(S.chairSec) + 's') : '未录'), level: S.chairCannot ? 'high' : (S.chairSec ? (U.num(S.chairSec) > 12 ? 'mid' : 'low') : 'na') },
        { name: '平衡', label: balanceLabel(S), level: balanceLevel(S) },
        { name: '跌倒', label: fallLabel(S), level: fallLevel(S) }
      ];
      const worst = dims.reduce(function (w, d) {
        if (d.level === 'high') return 'high';
        if (d.level === 'mid') return w === 'high' ? 'high' : 'mid';
        return w;
      }, 'low');
      return { overall: worst, dims: dims };
    }

    /* ---------- 各步骤 HTML ---------- */
    function stepHTML(k) {
      const eng = E();
      switch (k) {
        /* 步骤 1：禁忌筛查 */
        case 1: {
          const c = eng.evalContra(S.contra, base.age);
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🚫</span>步骤 1 · 评估前置禁忌筛查（自动 + 问卷）</h3></div>
            <div class="card-body">
              <div class="alert ${c.ageOk ? 'alert-success' : 'alert-danger'}" style="margin-bottom:16px;">
                <div><strong>年龄自动判定</strong><p style="margin:6px 0 0;font-size:13px;">${U.esc(c.ageMsg)}</p></div>
              </div>
              ${tipBox('操作提示', '请逐项与老人及家属确认近期健康状况，任一项勾选「是」系统将终止本次评估并提示暂缓测评。')}
              <form id="contra-form" style="margin-top:14px;">
                ${eng.CONTRA_ITEMS.map(it => `
                  <div class="sarc-contra-row">
                    <div class="sarc-contra-q">${U.esc(it.label)}</div>
                    ${radioRow('c_' + it.key, S.contra[it.key] === true ? 'yes' : (S.contra[it.key] === false ? 'no' : ''),
                      [['否', 'no'], ['是', 'yes']])}
                  </div>`).join('')}
              </form>
              <div id="contra-result" style="margin-top:16px;"></div>
            </div></div>`;
        }

        /* 步骤 2：首诊登记信息（肌少症专项独立档案，可编辑） */
        case 2: {
          const rbmi = (U.num(reg && reg.height) && U.num(reg && reg.weight))
            ? U.round(U.num(reg.weight) / Math.pow(U.num(reg.height) / 100, 2), 1) : '';
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🪪</span>步骤 2 · 首诊登记信息（肌少症专项独立档案）</h3></div>
            <div class="card-body">
              ${tipBox('数据来源说明', '以下为「肌少症专项首诊登记」独立档案，本模块不读取、不共享系统基础用户档案；此信息作为本次评估的基线，可在此直接修改并保存回专项档案。')}
              <form id="reg-form" style="margin-top:14px;">
                <div class="sarc-sub-h">一、基础身份与体格</div>
                <div class="form-grid">
                  <div class="form-group"><label>姓名 <span class="req">*</span></label>
                    <input type="text" id="r-name" value="${U.esc((reg && reg.name) || '')}" placeholder="请输入姓名"></div>
                  <div class="form-group"><label>性别</label>
                    ${radioRow('r-gender', (reg && reg.gender) || 'male', [['男', 'male'], ['女', 'female']])}</div>
                  <div class="form-group"><label>年龄（周岁）</label>
                    <input type="number" step="1" id="r-age" value="${U.esc(reg && reg.age != null ? reg.age : '')}" placeholder="如 72"></div>
                  <div class="form-group"><label>身高（cm）</label>
                    <input type="number" step="0.1" id="r-height" value="${U.esc(reg && reg.height != null ? reg.height : '')}" placeholder="如 168"></div>
                  <div class="form-group"><label>体重（kg）</label>
                    <input type="number" step="0.1" id="r-weight" value="${U.esc(reg && reg.weight != null ? reg.weight : '')}" placeholder="如 65"></div>
                  <div class="form-group"><label>BMI（自动计算）</label>
                    <input type="text" id="r-bmi" value="${U.esc(rbmi)}" readonly style="background:var(--bg-muted);cursor:not-allowed;"></div>
                  <div class="form-group"><label>联系电话</label>
                    <input type="tel" id="r-phone" value="${U.esc((reg && reg.phone) || '')}" placeholder="选填"></div>
                </div>
                <div class="sarc-sub-h" style="margin-top:18px;">二、医学体检（坐位 / 站立血压、糖化血红蛋白、视力）</div>
                <div class="form-grid">
                  <div class="form-group"><label>收缩压（平躺，mmHg）</label>
                    <input type="number" step="1" id="r-sbp" value="${U.esc(S.exam.sbp != null ? S.exam.sbp : '')}" placeholder="如 138"></div>
                  <div class="form-group"><label>舒张压（平躺，mmHg）</label>
                    <input type="number" step="1" id="r-dbp" value="${U.esc(S.exam.dbp != null ? S.exam.dbp : '')}" placeholder="如 88"></div>
                  <div class="form-group"><label>3 分钟站立收缩压（mmHg）</label>
                    <input type="number" step="1" id="r-stand-sbp" value="${U.esc(S.exam.standSbp != null ? S.exam.standSbp : '')}" placeholder="如 128"></div>
                  <div class="form-group"><label>3 分钟站立舒张压（mmHg）</label>
                    <input type="number" step="1" id="r-stand-dbp" value="${U.esc(S.exam.standDbp != null ? S.exam.standDbp : '')}" placeholder="如 82"></div>
                  <div class="form-group"><label>糖化血红蛋白 HbA1c（%）</label>
                    <input type="number" step="0.1" id="r-hba1c" value="${U.esc(S.exam.hba1c != null ? S.exam.hba1c : '')}" placeholder="如 6.2"></div>
                  <div class="form-group"><label>视力（左眼 / 右眼）</label>
                    <div style="display:flex;gap:8px;">
                      <input type="number" step="0.1" id="r-vision-l" value="${U.esc(S.exam.visionLeft != null ? S.exam.visionLeft : '')}" placeholder="左眼" style="flex:1;">
                      <input type="number" step="0.1" id="r-vision-r" value="${U.esc(S.exam.visionRight != null ? S.exam.visionRight : '')}" placeholder="右眼" style="flex:1;"></div></div>
                </div>

                <div class="sarc-sub-h" style="margin-top:18px;">三、健康信息</div>
                <div class="form-grid">
                  <div class="form-group"><label>过去 1 年是否跌倒过？</label>
                    ${radioRow('h_fallHistory', S.health.fallHistory || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>跌倒次数（近 1 年）</label>
                    <input type="number" step="1" id="h-fall-count" value="${U.esc(S.health.fallCount != null ? S.health.fallCount : '')}" placeholder="0"></div>
                  <div class="form-group"><label>是否使用助行器？</label>
                    ${radioRow('h_useAid', S.health.useAid || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>助行器类型</label>
                    <input type="text" id="h-aid-type" value="${U.esc(S.health.aidType || '')}" placeholder="如 四脚拐、助行架"></div>
                  <div class="form-group"><label>近 6 个月非主动体重下降？</label>
                    ${radioRow('h_weightLoss', S.health.weightLoss || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>体重下降量（kg）</label>
                    <input type="number" step="0.1" id="h-loss-kg" value="${U.esc(S.health.weightLossKg != null ? S.health.weightLossKg : '')}" placeholder="如 3.5"></div>
                  <div class="form-group"><label>是否做过骨密度测试？</label>
                    ${radioRow('h_boneDensity', S.health.boneDensity || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>肌肉骨骼是否经常疼痛？</label>
                    ${radioRow('h_pain', S.health.pain || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>疼痛部位</label>
                    <input type="text" id="h-pain-area" value="${U.esc(S.health.painArea || '')}" placeholder="如 膝关节、腰部"></div>
                  <div class="form-group"><label>每日服用药物种数</label>
                    <input type="number" step="1" id="h-drug-count" value="${U.esc(S.health.drugCount != null ? S.health.drugCount : '')}" placeholder="不含保健品"></div>
                  <div class="form-group"><label>每日服用保健品种数</label>
                    <input type="number" step="1" id="h-supp-count" value="${U.esc(S.health.supplementCount != null ? S.health.supplementCount : '')}" placeholder="如 2"></div>
                  <div class="form-group"><label>是否服用钙片？</label>
                    ${radioRow('h_calcium', S.health.calcium || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>是否服用维生素 D？</label>
                    ${radioRow('h_vitD', S.health.vitD || '', [['否', 'no'], ['是', 'yes']])}</div>
                </div>
                <div class="form-group full-width"><label>既往病史</label>
                  <textarea id="h-diseases" rows="2" placeholder="如 高血压、糖尿病、骨质疏松、帕金森病等">${U.esc(S.health.diseases || '')}</textarea></div>

                <div class="sarc-sub-h" style="margin-top:18px;">四、运动习惯</div>
                <div class="form-grid">
                  <div class="form-group"><label>每周运动次数（中等强度，每次≥30min）</label>
                    <input type="number" step="1" id="e-freq" value="${U.esc(S.exercise.frequency != null ? S.exercise.frequency : '')}" placeholder="如 3"></div>
                  <div class="form-group"><label>喜好运动类型</label>
                    <input type="text" id="e-types" value="${U.esc(S.exercise.types || '')}" placeholder="如 快走、太极、广场舞"></div>
                  <div class="form-group"><label>习惯运动场所</label>
                    ${radioRow('e_place', S.exercise.place || '', [['室内', 'indoor'], ['户外', 'outdoor']])}</div>
                  <div class="form-group"><label>天气是否影响运动？</label>
                    ${radioRow('e_weather', S.exercise.weather || '', [['否', 'no'], ['是', 'yes']])}</div>
                  <div class="form-group"><label>寒冷季节运动是否减少？</label>
                    ${radioRow('e_winter', S.exercise.winter || '', [['否', 'no'], ['是', 'yes']])}</div>
                </div>

                <div class="form-group full-width" style="margin-top:14px;">
                  <label>既往慢病基础信息</label>
                  <textarea id="r-chronic" rows="2" placeholder="如 高血压、糖尿病、骨关节炎（选填）">${U.esc((reg && reg.chronic) || '')}</textarea></div>
                <div class="form-grid" style="margin-top:8px;">
                  <div class="form-group"><label>评估日期</label>
                    <input type="date" id="f-date" value="${U.esc(S.assessDate)}"></div>
                  <div class="form-group"><label>干预场景（影响双方案首选推荐）</label>
                    ${radioRow('f_scene', S.scene, [['门店 / 机构在店干预', 'store'], ['居家自主训练', 'home']])}</div>
                  <div class="form-group"><label>是否可使用鹊动智能训练设备</label>
                    ${radioRow('f_device', S.hasDevice ? 'yes' : 'no', [['可使用', 'yes'], ['无设备', 'no']])}</div>
                </div>
                <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                  <button type="button" class="btn btn-primary btn-sm" id="btn-save-reg">💾 保存首诊登记修改</button>
                  <span id="reg-save-tip" style="font-size:13px;color:var(--text-secondary);"></span>
                </div>
              </form>
            </div></div>`;
        }

        /* 步骤 3：客观指标 */
        case 3: {
          const st = window.getLatestStrengthSummary ? window.getLatestStrengthSummary() : null;
          return `<div>
            <div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">📐</span>步骤 3-1 · 四大核心客观指标录入</h3></div>
              <div class="card-body">
                <div class="sarc-bt-panel">
                  <div class="sarc-bt-head">
                    <span class="sarc-bt-title">🔵 蓝牙握力 / 步速设备</span>
                    <button type="button" class="btn btn-secondary btn-sm" id="btn-bt-connect">连接设备</button>
                  </div>
                  <div id="bt-status" class="sarc-bt-status">未连接。点击「连接设备」可扫描并连接支持蓝牙的握力计 / 步速采集设备，连接成功后读数将自动回填至下方握力 / 步速输入框（若浏览器不支持 Web Bluetooth，可点击「模拟一次读数」体验采集回填流程）。</div>
                  <div id="bt-readout" class="sarc-bt-readout" style="display:none;">
                    <span>设备：<b id="bt-devname">—</b></span>
                    <span>实时握力：<b id="bt-grip">—</b> kg</span>
                    <span>实时步速：<b id="bt-gait">—</b> m/s</span>
                    <button type="button" class="btn btn-ghost btn-sm" id="btn-bt-sim">模拟一次读数（无设备时演示）</button>
                  </div>
                </div>
                <div class="form-grid">
                  <div class="form-group"><label>小腿围（cm）</label>
                    <input type="number" step="0.1" id="f-calf" value="${U.esc(S.calf)}" placeholder="如 33.5">
                    ${tipBox('测量规范', '用户站立放松，双腿自然分开，测量小腿最粗处围度，连续测量 2 次取平均值，单位 cm。')}</div>
                  <div class="form-group"><label>握力最大值（kg）</label>
                    <input type="number" step="0.1" id="f-grip" value="${U.esc(S.grip)}" placeholder="如 26.0">
                    ${tipBox('测量规范', '握力测试：端坐背贴椅背，前臂放扶手、肘屈90°，手腕伸出紧握握柄，最大力握3-5秒后放松。建议左右手各三次，取最大值。')}</div>
                  <div class="form-group"><label>4 米步速（m/s）</label>
                    <input type="number" step="0.01" id="f-gait" value="${U.esc(S.gait)}" placeholder="如 0.75">
                    ${tipBox('测量规范', '平地直线行走 4 米，按正常日常步速行走，记录时间计算平均步速（m/s）。')}</div>
                </div>
                <div id="core-live" style="margin-top:6px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">⚙️</span>步骤 3-2 · 鹊动等速 / 等张肌力数据复用</h3></div>
              <div class="card-body">
                ${st ? `
                  <div class="alert alert-success"><div><strong>已自动同步系统肌力评估数据</strong>
                    <p style="margin:6px 0 0;font-size:13px;line-height:1.7;">
                    数据来源：鹊动${st.type === 'isotonic' ? '等张' : '等速'}肌力评估 · 综合得分
                    <b>${st.total != null ? st.total : '—'}</b> 分 · 等级 <b>${U.esc(st.grade || '—')}</b><br>
                    优先级规则：鹊动设备量化肌力数据优先于单次握力，握力作为辅助筛查指标；
                    系统已对成人肌力阈值做老年降级适配。</p></div></div>
                  <label class="checkbox-item" style="margin-top:12px;display:inline-flex;">
                    <input type="checkbox" id="f-usestrength" ${S.useStrength !== false ? 'checked' : ''}>
                    <span>本次评估采用鹊动设备肌力数据（取消勾选则仅以握力判定）</span></label>
                ` : `<div class="alert alert-info"><div><strong>未检测到鹊动等速 / 等张肌力评估记录</strong>
                    <p style="margin:6px 0 0;font-size:13px;line-height:1.7;">
                    系统将自动以握力作为唯一肌力判定依据，保证评估流程闭环。
                    如需更精准的量化肌力数据，可先前往
                    <a href="#/isokinetic">等速肌力评估</a> 或 <a href="#/isotonic">等张肌力评估</a> 完成测评。</p></div></div>`}
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🧬</span>步骤 3-3 · 体成分指标与外部报告上传</h3></div>
              <div class="card-body">
                <div class="form-grid">
                  <div class="form-group"><label>四肢骨骼肌指数 SMI（kg/㎡）</label>
                    <input type="number" step="0.1" id="b-smi" value="${U.esc(S.body.smi)}" placeholder="男 ≥7.0 / 女 ≥5.7"></div>
                  <div class="form-group"><label>体脂率（%）</label>
                    <input type="number" step="0.1" id="b-fat" value="${U.esc(S.body.bodyFat)}" placeholder="60岁+ 男 ≤28 / 女 ≤33"></div>
                  <div class="form-group"><label>内脏脂肪等级</label>
                    <input type="number" step="1" id="b-vis" value="${U.esc(S.body.visceral)}" placeholder="＜9 级为正常"></div>
                  <div class="form-group"><label>骨骼肌量（kg）</label>
                    <input type="number" step="0.1" id="b-mm" value="${U.esc(S.body.muscleMass)}" placeholder="选填"></div>
                  <div class="form-group"><label>基础代谢（kcal）</label>
                    <input type="number" step="1" id="b-bmr" value="${U.esc(S.body.bmr)}" placeholder="选填"></div>
                  <div class="form-group"><label>体成分测量体重（kg）</label>
                    <input type="number" step="0.1" id="b-wt" value="${U.esc(S.body.weight)}" placeholder="选填"></div>
                </div>
                ${tipBox('数据来源', '支持对接体脂秤自动抓取，亦可依据线下体检 / 第三方设备报告手动录入。上传的外部报告原件将永久归档至本模块台账，支持溯源查看。')}
                <div class="sarc-upload" style="margin-top:14px;">
                  <input type="file" id="f-bodyfile" accept="image/*,application/pdf" style="display:none;">
                  <button class="btn btn-secondary btn-sm" id="btn-upload-body">📎 上传外部报告（人体成分 / 肌力 · JPG / PNG / PDF）</button>
                  <span id="body-file-name" style="font-size:13px;color:var(--text-secondary);margin-left:10px;">
                    ${S.reportFile ? U.esc(S.reportFile.name) : '尚未上传'}</span>
                  ${S.reportFile ? `<button class="btn btn-ghost btn-sm" id="btn-view-bodyfile">查看</button>` : ''}
                  ${S.reportFile ? `<button class="btn btn-ghost btn-sm" id="btn-del-bodyfile" style="color:var(--danger);">删除</button>` : ''}
                </div>
                <div id="body-ocr-status" style="margin-top:12px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🚶</span>步骤 3-4 · SPPB 简易躯体功能测试（0-12 分）</h3></div>
              <div class="card-body">
                ${tipBox('测评说明', '4 米步行测试沿用上方步速数据自动计分，无需重复测评；另需完成站立平衡与五次坐立两项。')}
                <div class="form-group full-width" style="margin-top:14px;">
                  <label>站立平衡测试（依次完成双脚并拢、半串联、串联站立，每个姿势保持 10 秒）</label>
                  ${radioRow('f_balance', S.balanceKey, eng.BALANCE_OPTS.map(o => [`${o.label}（${o.score} 分）`, o.key]))}
                </div>
                <div class="form-grid">
                  <div class="form-group"><label>五次坐立测试用时（秒）</label>
                    <input type="number" step="0.1" id="f-chair" value="${U.esc(S.chairSec)}" placeholder="如 15.2"
                      ${S.chairCannot ? 'disabled' : ''}>
                    ${tipBox('测量规范', '双手抱胸，快速从椅子站起、坐下，连续完成 5 次，记录完成时长，全程禁止借力。')}</div>
                  <div class="form-group"><label>&nbsp;</label>
                    <label class="checkbox-item" style="display:inline-flex;">
                      <input type="checkbox" id="f-chair-cannot" ${S.chairCannot ? 'checked' : ''}>
                      <span>无法完成五次坐立（计 0 分）</span></label></div>
                </div>
                <div id="sppb-live" style="margin-top:14px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🧭</span>步骤 3-5 · CFS 临床衰弱量表（9 级）</h3></div>
              <div class="card-body">
                ${tipBox('测评规则', '由咨询师 / 家属根据老人「近 3 个月」的日常状态选择对应等级，系统自动赋值计分并纳入跌倒风险指数加权。')}
                <div class="sarc-cfs-grid" style="margin-top:14px;">
                  ${eng.CFS_LEVELS.map(c => `
                    <label class="sarc-cfs ${String(S.cfs) === String(c.v) ? 'checked' : ''}">
                      <input type="radio" name="f_cfs" value="${c.v}" ${String(S.cfs) === String(c.v) ? 'checked' : ''}>
                      <b>${c.v} 级 · ${U.esc(c.name)}</b><span>${U.esc(c.desc)}</span></label>`).join('')}
                </div>
                <div id="cfs-live" style="margin-top:14px;"></div>
              </div></div>
          </div>`;
        }

        /* 步骤 4：双问卷 */
        case 4: {
          return `<div>
            <div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">📝</span>步骤 4-1 · 问卷一：SARC-F 老年肌少症风险筛查（0-10 分）</h3></div>
              <div class="card-body">
                ${tipBox('作答说明', '共 5 个维度，请老人根据近期真实感受作答，系统实时计分；总分 ≥4 分为筛查阳性。')}
                <form id="sarcf-form" style="margin-top:14px;">
                  ${eng.SARCF_ITEMS.map(it => `
                    <div class="sarc-q">
                      <div class="sarc-q-h"><span class="sarc-q-dim">${U.esc(it.dim)}</span>${U.esc(it.q)}</div>
                      ${radioRow('sf_' + it.key, S.sarcf[it.key], it.opts.map(o => [`${o[0]}（${o[1]} 分）`, o[1]]))}
                    </div>`).join('')}
                </form>
                <div id="sarcf-live" style="margin-top:14px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🍎</span>步骤 4-2 · 问卷二：老年人肌肉健康生活方式专项问卷（本模块专属）</h3></div>
              <div class="card-body">
                ${tipBox('数据归属说明', '本问卷为肌少症模块专属测评工具，数据仅归入本模块独立台账，与生活方式干预模块完全解耦、互不统计。')}
                <form id="life-form-sarc" style="margin-top:14px;">
                  ${eng.LIFE_SECTIONS.map(sec => `
                    <div class="sarc-sec">
                      <div class="sarc-sec-h"><span>${sec.icon}</span>${U.esc(sec.title)}</div>
                      ${sec.items.map(it => `
                        <div class="sarc-q">
                          <div class="sarc-q-h">${U.esc(it.q)}</div>
                          ${radioRow('lf_' + it.key, S.life[it.key], it.opts.map(o => [`${o[0]}（${o[1]} 分）`, o[1]]))}
                        </div>`).join('')}
                    </div>`).join('')}
                </form>
                <div id="life-live" style="margin-top:14px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🥗</span>步骤 4-3 · MNA-SF 简易营养评估简表（0-14 分）</h3></div>
              <div class="card-body">
                ${tipBox('测评说明', '共 6 题，总分 ≤11 分提示存在营养不良风险，是肌少症与体重管理的重要影响因素。')}
                <form id="mnasf-form" style="margin-top:14px;">
                  ${eng.MNA_SF_ITEMS.map(it => `
                    <div class="sarc-q">
                      <div class="sarc-q-h">${U.esc(it.q)}</div>
                      ${radioRow('mn_' + it.key, S.mnasf[it.key], it.opts.map(o => [`${o[0]}（${o[1]} 分）`, o[1]]))}
                    </div>`).join('')}
                </form>
                <div id="mnasf-live" style="margin-top:14px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🧠</span>步骤 4-4 · 简易精神状态测验 AMT（0-10 分）</h3></div>
              <div class="card-body">
                ${tipBox('测评说明', '共 10 题，能够正确回答打「✓」，错误或不能回答打「✗」；≤6 分提示认知功能受损。')}
                <form id="amt-form" style="margin-top:14px;">
                  ${eng.AMT_ITEMS.map((it, i) => `
                    <div class="sarc-q">
                      <div class="sarc-q-h">${i + 1}. ${U.esc(it.q)}</div>
                      ${radioRow('amt_' + it.key, S.amt[it.key], [['✓ 正确', 'yes'], ['✗ 错误', 'no']])}
                    </div>`).join('')}
                </form>
                <div id="amt-live" style="margin-top:14px;"></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">⚠️</span>步骤 4-5 · 自评跌倒关注程度量表（16-64 分，有跌倒史者填写）</h3></div>
              <div class="card-body">
                ${tipBox('测评说明', '共 16 项日常活动，请选择若您要做该活动时关注自己会因此跌倒的程度。1=不关注，2=一点关注，3=颇为关注，4=极度关注。')}
                <form id="fear-form" style="margin-top:14px;">
                  ${eng.FEAR_FALL_ITEMS.map((it, i) => `
                    <div class="sarc-q">
                      <div class="sarc-q-h">${i + 1}. ${U.esc(it.q)}</div>
                      ${radioRow('ff_' + it.key, S.fearFall[it.key], [['1 不关注', 1], ['2 一点关注', 2], ['3 颇为关注', 3], ['4 极度关注', 4]])}
                    </div>`).join('')}
                </form>
                <div id="fear-live" style="margin-top:14px;"></div>
              </div></div>
          </div>`;
        }

        /* 步骤 5：自动运算评分 */
        case 5: {
          const R = compute();
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🧮</span>步骤 5 · 系统自动运算评分（指标对标老年专属阈值）</h3></div>
            <div class="card-body">
              <div class="sarc-metric-grid">
                ${metricCard({ name: '小腿围', value: R.calfEval.value, unit: 'cm', level: R.calfEval.level, label: R.calfEval.label, rule: `阈值 ${R.calfEval.t} cm`, desc: R.calfEval.desc })}
                ${metricCard({ name: '握力', value: R.gripEval.value, unit: 'kg', level: R.gripEval.level, label: R.gripEval.label, rule: `阈值 ${R.gripEval.t} kg`, desc: R.gripEval.desc })}
                ${metricCard({ name: '4 米步速', value: R.gaitEval.value, unit: 'm/s', level: R.gaitEval.level, label: R.gaitEval.label, rule: '阈值 0.8 m/s', desc: R.gaitEval.desc })}
                ${metricCard({ name: 'SPPB 躯体功能', value: R.sppb.complete ? R.sppb.total : null, unit: '/ 12 分', level: R.sppb.level, label: R.sppb.label, rule: '10-12 正常 / 6-9 轻度下降 / 0-5 重度衰退', desc: R.sppb.desc })}
              </div>

              <h4 class="sarc-h4">体成分指标解读</h4>
              <div class="sarc-metric-grid">
                ${R.body.items.slice(0, 3).map(it => metricCard({
                  name: it.name, value: it.value, unit: it.unit, level: it.level, label: it.label, rule: it.rule
                })).join('')}
              </div>
              <div class="alert ${R.body.combo === 'good' ? 'alert-success' : (R.body.combo === 'unknown' ? 'alert-info' : 'alert-warning')}" style="margin-top:14px;">
                <div><strong>肌脂组合判定</strong><p style="margin:6px 0 0;font-size:13px;">${U.esc(R.body.comboLabel)}</p></div>
              </div>

              <h4 class="sarc-h4">SPPB 三项计分明细</h4>
              <table class="data-table" style="width:100%;">
                <thead><tr><th>测评项目</th><th>实测结果</th><th style="width:120px;">得分</th></tr></thead>
                <tbody>${R.sppb.parts.map(p => `<tr><td><b>${U.esc(p.name)}</b></td><td>${U.esc(p.detail)}</td>
                  <td>${p.score == null ? '<span style="color:var(--text-muted);">未计分</span>' : `<b>${p.score}</b> / ${p.max}`}</td></tr>`).join('')}
                  <tr><td colspan="2" style="text-align:right;"><b>SPPB 总分</b></td>
                    <td><b style="color:${lv(R.sppb.level).c};font-size:16px;">${R.sppb.total} / 12</b></td></tr>
                </tbody></table>

              <h4 class="sarc-h4">衰弱与问卷计分</h4>
              <div class="sarc-metric-grid">
                ${metricCard({ name: 'CFS 临床衰弱', value: R.cfs.has ? R.cfs.value : null, unit: '级', level: R.cfs.level, label: R.cfs.has ? R.cfs.category : '未评估', rule: R.cfs.has ? R.cfs.name + '：' + R.cfs.desc : '1-3 强健 / 4 衰弱前期 / 5-6 衰弱 / 7-9 重度衰弱' })}
                ${metricCard({ name: 'SARC-F 风险筛查', value: R.sarcf.complete ? R.sarcf.total : null, unit: '/ 10 分', level: R.sarcf.level, label: R.sarcf.complete ? (R.sarcf.positive ? '筛查阳性' : '筛查阴性') : '未完成', rule: '≥4 分为阳性', desc: R.sarcf.desc })}
                ${metricCard({ name: '肌肉健康生活方式', value: R.life.answered ? R.life.total : null, unit: `/ ${R.life.max} 分`, level: R.life.level, label: R.life.label, rule: '得分越高，肌肉流失诱因越多' })}
                ${metricCard({ name: 'MNA-SF 营养评估', value: R.mnasf.complete ? R.mnasf.total : null, unit: '/ 14 分', level: R.mnasf.level, label: R.mnasf.label, rule: '≤11 分提示营养不良风险', desc: R.mnasf.desc })}
                ${metricCard({ name: 'AMT 精神状态', value: R.amt.complete ? R.amt.total : null, unit: '/ 10 分', level: R.amt.level, label: R.amt.label, rule: '≤6 分提示认知障碍', desc: R.amt.desc })}
                ${metricCard({ name: '跌倒关注程度', value: R.fearFall.complete ? R.fearFall.total : null, unit: '/ 64 分', level: R.fearFall.level, label: R.fearFall.label, rule: '16-64 分，越高越关注', desc: R.fearFall.desc })}
              </div>

              <h4 class="sarc-h4">生活方式五维度诱因分布</h4>
              <div class="sarc-bar-list">
                ${R.life.sections.map(s => {
                  const pct = s.max ? Math.round(s.score / s.max * 100) : 0;
                  const c = lv(s.level).c;
                  return `<div class="sarc-bar">
                    <div class="sarc-bar-l"><span>${s.icon} ${U.esc(s.title)}</span>
                      <b style="color:${c};">${s.score} / ${s.max} · ${U.esc(s.label)}</b></div>
                    <div class="sarc-bar-t"><i style="width:${pct}%;background:${c};"></i></div></div>`;
                }).join('')}
              </div>
            </div></div>`;
        }

        /* 步骤 6：综合风险判定 */
        case 6: {
          const R = compute();
          const d = R.direction, f = R.fall;
          return `<div>
            <div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">⚖️</span>步骤 6-1 · 老年跌倒风险指数（0-100 加权运算）</h3></div>
              <div class="card-body">
                ${riskGauge(f)}
                <h4 class="sarc-h4">加权构成明细</h4>
                ${dimTable(f.dims)}
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🎯</span>步骤 6-2 · 肌少症分级与基础干预方向判定</h3></div>
              <div class="card-body">
                <div class="sarc-dir" style="border-color:${lv(d.color).c}55;background:${lv(d.color).bg};">
                  <div class="sarc-dir-ico">${d.icon}</div>
                  <div style="flex:1;">
                    <div style="font-size:12px;color:var(--text-muted);font-weight:700;">${U.esc(d.no)} · 系统自动判定干预方向</div>
                    <div style="font-size:22px;font-weight:900;color:${lv(d.color).c};margin:4px 0 6px;">${U.esc(d.full)}</div>
                    <div style="font-size:13px;line-height:1.8;color:var(--text-secondary);">${U.esc((E().PLAN_LIB[d.key] || {}).goal || '')}</div>
                  </div>
                </div>
                <h4 class="sarc-h4">判定依据</h4>
                <ul class="sarc-ul">${d.reasons.map(r => `<li>${U.esc(r)}</li>`).join('')}</ul>
                <h4 class="sarc-h4">肌少症风险等级</h4>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                  ${chip(d.sarcGradeLevel, d.sarcGrade)}
                  <span style="font-size:13px;color:var(--text-secondary);line-height:1.8;">${U.esc(d.sarcGradeDesc)}</span>
                </div>
              </div></div>
          </div>`;
        }

        /* 步骤 7：评估报告（可单独导出 / 打印） */
        case 7: {
          const R = compute();
          const rec = buildRecord(R);
          return `<div class="card">
            <div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">📄</span>步骤 7 · 肌少症专项评估报告（产出物 #1）</h3>
              <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-ghost btn-sm btn-share-sarc-qr" data-from="step7">📲 扫码查看</button>
                <button class="btn btn-primary btn-sm" id="btn-print-assessment">打印 / 导出评估报告</button>
              </div></div>
            <div class="card-body" style="padding:0;">
              <div id="sarc-ai-interp-host" class="no-print" style="margin:14px 16px 0;"></div>
              <div id="sarc-assessment-preview" class="sarc-screen-report">
                <div class="sarc-screen-header">
                  <div class="sarc-screen-title">
                    <div class="sarc-screen-icon">📄</div>
                    <div>
                      <h2>老年人体重管理 &amp; 肌少症专项评估报告</h2>
                      <p>受评人：${U.esc(rec.patientName || '—')} · 评估日期：${U.esc(rec.assessDate || '—')} · 编号：${U.esc(rec.no || '—')}</p>
                    </div>
                  </div>
                </div>
                <div id="sarc-assessment-report-body">${window.buildSarcAssessmentReport(rec)}</div>
              </div>
            </div>
          </div>`;
        }

        /* 步骤 8：方案推荐（依据评估报告结果生成） */
        case 8: {
          const R = compute();
          const plan = R.plan;
          const pref = plan.prefer;
          const view = S.planView || 'std';
          const isStrict = view === 'strict';
          const isAI = view === 'ai';
          return `<div>
            <div class="alert alert-info" style="margin-bottom:16px;">
              <div><strong>步骤 8 · 干预推荐方案（产出物 #2，本步即完整版）</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                系统依据评估报告的综合判定，自动生成个性化<b>干预方案</b>，已在本步内完整呈现：运动处方（徒手 / 鹊动设备）、饮食营养、有氧安排与建议周训练节律，<b>无需跳转其他页</b>。当前首选：
                <b>${pref.prefer === 'home' ? '老年徒手训练方案' : '鹊动设备训练方案'}</b>；可切换首选、编辑动作，或单独打印 / 导出本方案。<br>
                右上角可在<b>标准版</b>（双版本对照，供打印交付）、<b>严谨版</b>（AWGS 严重度分级 + 客观剂量 + 禁忌网关 + 逐条依据）与<b>鹊动小Qoo AI 方案推荐</b>之间切换。</p></div>
            </div>
            <div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🏃</span>步骤 8-1 · 运动方案（徒手 + 鹊动设备）</h3>
              <div class="no-print" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <div class="sarc-view-toggle" id="sarc-view-toggle">
                  <button type="button" data-view="std" class="${view === 'std' ? 'active' : ''}">标准版</button>
                  <button type="button" data-view="strict" class="${view === 'strict' ? 'active' : ''}">严谨版 · 可解释</button>
                  <button type="button" data-view="ai" class="${view === 'ai' ? 'active' : ''}"><span class="ai-icon-wrap">${typeof window.qooIcon === 'function' ? window.qooIcon('sm') : ''}</span> AI 方案推荐</button>
                </div>
                <button class="btn btn-ghost btn-sm" id="btn-switch-prefer" style="${isStrict || isAI ? 'display:none;' : ''}">⇄ 切换首选方案</button>
                <button class="btn btn-ghost btn-sm btn-share-sarc-qr" data-from="step8">📲 扫码查看</button>
                <button class="btn btn-ghost btn-sm" id="btn-sarc-checkin">📱 手机扫码打卡</button>
                <button class="btn btn-primary btn-sm" id="btn-sarc-ai-gen">✨ AI 生成方案</button>
                <button class="btn btn-primary btn-sm" id="btn-print-plan">打印 / 导出干预方案</button></div></div>
              <div class="card-body">
                <div id="sarc-view-std" style="${view === 'std' ? '' : 'display:none;'}">
                <div class="alert alert-info" style="margin-bottom:16px;">
                  <div><strong>系统智能推荐</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                    当前首选：<b>${pref.prefer === 'home' ? '老年徒手训练方案' : '鹊动设备训练方案'}</b>｜
                    徒手依据：${U.esc(pref.homeReasons.join('、'))}｜
                    设备依据：${U.esc(pref.deviceReasons.join('、'))}<br>${U.esc(pref.note)}</p></div>
                </div>
                ${renderTabs('main-plan', [
                  { id: 'home', icon: '🏠', label: '徒手方案', prefer: pref.prefer === 'home', alt: pref.prefer === 'device',
                    html: planCard(plan.home, pref.prefer === 'home', '居家零设备', plan.diet) + (plan.home && plan.home.exercisePlan ? exercisePlanHTML(plan.home.exercisePlan, true) : '') },
                  { id: 'device', icon: '🏥', label: '鹊动设备方案', prefer: pref.prefer === 'device', alt: pref.prefer === 'home',
                    html: planCard(plan.device, pref.prefer === 'device', '机构量化', plan.diet) }
                ])}
                <div class="sarc-kv" style="margin-top:16px;"><span>有氧安排</span><p>${U.esc(plan.aerobic)}</p></div>
                <div class="sarc-kv" style="margin-top:12px;"><span>双方案统一适配原则（老年人专属）</span>
                  <ul>${plan.principles.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul></div>
                </div>
                <div id="sarc-view-strict" class="sarc-view-host" style="${view === 'strict' ? '' : 'display:none;'}">
                  <div class="alert alert-info no-print" style="margin-bottom:16px;">
                    <div><strong>严谨版方案引擎（SarcEngine2）</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                      在 36 动作库匹配结果之上叠加：AWGS2019 严重度分级 → 1RM / 握力客观锚定剂量 → 关节与跌倒禁忌强制网关 →
                      LSI 弱侧单侧强化 → 9 台鹊动设备同源处方，并输出逐条方案依据供复核。</p></div>
                  </div>
                  ${strictPlanHTML(R)}
                </div>
                <div id="sarc-view-ai" class="sarc-view-host" style="${view === 'ai' ? '' : 'display:none;'}">
                  <div class="alert alert-info no-print" style="margin-bottom:16px;">
                    <div><strong>鹊动小Qoo AI 方案推荐</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                      基于评估结果，由鹊动小Qoo AI 辅助生成个性化干预方案。生成后须经专业人员确认，可与左侧「标准版」「严谨版」对照使用。</p></div>
                  </div>
                  <div id="sarc-ai-plan-host"></div>
                  <div id="sarc-ai-nutrition-host" class="sarc-ai-nutrition-host"></div>
                </div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🍽️</span>步骤 8-2 · 营养方案（个体化膳食建议）</h3></div>
              <div class="card-body">
                ${plan.diet && plan.diet.length ? `<div class="sarc-kv" style="margin:0 0 4px;"><span>饮食营养要点</span><table class="sarc-diet-tbl"><tbody>${plan.diet.map(x => `<tr><td><b>${U.esc(x[0])}</b></td><td>${U.esc(x[1])}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:var(--text-muted);font-size:13px;">暂无营养方案数据，请先完成步骤 4-3 营养评估后重试。</p>'}
                <div class="alert alert-info" style="margin-top:12px;">
                  <div><strong>提示</strong><p style="margin:6px 0 0;font-size:13px;">营养方案依据 MNA-SF 营养评估与生活方式问卷自动生成，可与「标准版 / 严谨版 / AI 方案推荐」并列对照；患者可通过上方「📱 手机扫码打卡」每日执行。</p></div>
                </div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🗓️</span>步骤 8-3 · 执行配套（建议周节律 / 复查）</h3></div>
              <div class="card-body">
                <div class="sarc-kv" style="margin:0 0 12px;"><span>建议周训练节律</span><p>抗阻训练 2–3 次/周（徒手或鹊动设备，隔日进行）；有氧 3–5 次/周（快走 / 太极 / 慢骑，微微出汗）；每日穿插平衡与柔韧练习；保证至少 1 天完全休息。具体可据体力在手机端打卡页调整。</p></div>
                <div class="alert alert-info" style="margin-top:4px;">
                  <div><strong>提示</strong><p style="margin:6px 0 0;font-size:13px;">跌倒风险评估已融入本流程的步骤 9，请继续「下一步 →」完成。</p></div>
                </div>
                <div class="alert alert-success" style="margin-top:16px;">
                  <div><strong>复查周期</strong><p style="margin:6px 0 0;font-size:13px;">
                    建议 ${plan.reviewDays} 天后复查（${U.esc(plan.reviewDate)}），复查项目：小腿围、握力、4 米步速、体成分、SPPB、CFS。</p></div>
                </div>
              </div></div>
          </div>`;
        }

        /* 步骤 9：跌倒风险评估（融入跌倒风险模块 5 子步骤） */
        case 9: {
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">🛡️</span>步骤 9 · 跌倒风险评估（已融入肌少症-跌倒风险流程）</h3></div>
            <div class="card-body">
              ${tipBox('步骤说明', '跌倒风险评估已融入本肌少症标准化评估流程。下方依次完成 F1 跌倒史 / F2 平衡功能 / F3 步态移动 / F4 感觉认知环境 / F5 风险报告与预防方案 共 5 个子步骤；完成后点击「下一步 →」继续纳入台账随访。')}
              <div id="sarc-prereq-box"></div>
              <div id="sarc-fall-host"></div>
            </div></div>`;
        }

        /* 步骤 10：纳入台账 */
        case 10: {
          const R = compute();
          const prev = base.id ? D().listByPatient(base.id).filter(x => x.id !== S.id) : [];
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">📒</span>步骤 10 · 纳入独立台账并设置随访复查</h3></div>
            <div class="card-body">
              <div class="alert ${S.saved ? 'alert-success' : 'alert-info'}">
                <div><strong>${S.saved ? '✓ 本次评估已归档至肌少症模块独立台账' : '待归档'}</strong>
                <p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                  评估编号：<b>${U.esc(S.no || '保存后自动生成')}</b>｜评估日期：${U.esc(S.assessDate)}<br>
                  数据将写入本模块专属台账（qd_sarcopenia_），不进入生活方式干预模块数据库，两者互不统计、互不联动。</p></div>
              </div>

              <div class="sarc-metric-grid" style="margin-top:16px;">
                ${metricCard({ name: '干预方向', value: R.direction.name, unit: '', level: R.direction.color, label: R.direction.no, rule: R.direction.full })}
                ${metricCard({ name: '跌倒风险指数', value: R.fall.index, unit: '分', level: R.fall.color, label: R.fall.level, rule: '0-30 低 / 31-60 中 / 61-100 高' })}
                ${metricCard({ name: '肌少症分级', value: R.direction.sarcGrade, unit: '', level: R.direction.sarcGradeLevel, label: '综合判定', rule: '' })}
                ${metricCard({ name: '建议复查日期', value: R.plan.reviewDate, unit: '', level: 'ok', label: R.plan.reviewDays + ' 天后', rule: '到期系统在台账高亮提醒' })}
              </div>

              <div class="form-grid" style="margin-top:18px;">
                <div class="form-group"><label>随访复查日期（可调整）</label>
                  <input type="date" id="f-review" value="${U.esc(S.reviewDate || R.plan.reviewDate)}"></div>
                <div class="form-group full-width"><label>咨询师备注（归档至本模块台账）</label>
                  <textarea id="f-note" rows="3" placeholder="记录测评过程异常、老人配合度、家属沟通要点等">${U.esc(S.note || '')}</textarea></div>
              </div>

              <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;" class="no-print">
                <button class="btn btn-primary btn-lg" id="btn-save-sarc">${S.saved ? '更新归档记录' : '✓ 归档并纳入台账'}</button>
                <button class="btn btn-secondary btn-lg" id="btn-print-final">打印 / 导出 · 合并总报告（评估 + 方案 + 跌倒）</button>
                <a class="btn btn-ghost btn-lg" href="#/sarcopenia">返回独立台账</a>
              </div>

              ${prev.length ? `<h4 class="sarc-h4">该老人历史评估记录（${prev.length} 次）</h4>
                ${ledgerHTML(prev)}` : ''}
            </div></div>`;
        }
      }
      return '';
    }

    /* ---------- 各步骤事件绑定 ---------- */
    function bindStep(k) {
      U.bindChoiceStyle(bodyEl);

      if (k === 1) {
        const showContra = () => {
          const c = E().evalContra(S.contra, base.age);
          const box = U.qs('#contra-result', bodyEl);
          if (!box) return;
          if (c.hit.length) {
            box.innerHTML = `<div class="alert alert-danger"><div><strong>⚠️ 检出评估禁忌，须终止本次测评</strong>
              <p style="margin:6px 0 0;font-size:13px;line-height:1.8;">${U.esc(c.msg)}</p>
              <ul style="margin:8px 0 0 18px;font-size:13px;line-height:1.8;">
                ${c.hit.map(h => `<li>${U.esc(h.label)}</li>`).join('')}</ul></div></div>`;
          } else if (c.ageOk) {
            box.innerHTML = `<div class="alert alert-success"><div><strong>✓ 未发现评估禁忌</strong>
              <p style="margin:6px 0 0;font-size:13px;">${U.esc(c.msg)}</p></div></div>`;
          } else {
            box.innerHTML = `<div class="alert alert-warning"><div><strong>年龄不符合本模块适用范围</strong>
              <p style="margin:6px 0 0;font-size:13px;">${U.esc(c.ageMsg)}</p></div></div>`;
          }
        };
        E().CONTRA_ITEMS.forEach(it => {
          U.qsa(`input[name="c_${it.key}"]`, bodyEl).forEach(r => r.onchange = () => {
            S.contra[it.key] = r.value === 'yes';
            saveDraft(); showContra();
          });
        });
        showContra();
      }

      if (k === 2) {
        const dt = U.qs('#f-date', bodyEl);
        if (dt) dt.onchange = () => { S.assessDate = dt.value || U.today(); saveDraft(); };
        U.qsa('input[name="f_scene"]', bodyEl).forEach(r => r.onchange = () => { S.scene = r.value; saveDraft(); });
        U.qsa('input[name="f_device"]', bodyEl).forEach(r => r.onchange = () => { S.hasDevice = r.value === 'yes'; saveDraft(); });

        /* 医学体检字段绑定 */
        [
          ['#r-sbp', 'sbp', 'exam'], ['#r-dbp', 'dbp', 'exam'], ['#r-stand-sbp', 'standSbp', 'exam'],
          ['#r-stand-dbp', 'standDbp', 'exam'], ['#r-hba1c', 'hba1c', 'exam'],
          ['#r-vision-l', 'visionLeft', 'exam'], ['#r-vision-r', 'visionRight', 'exam']
        ].forEach(([sel, key, ns]) => {
          const el = U.qs(sel, bodyEl);
          if (el) el.oninput = () => { S[ns][key] = el.value; saveDraft(); };
        });

        /* 健康信息字段绑定 */
        [
          ['h_fallHistory', 'fallHistory', 'health'], ['h_useAid', 'useAid', 'health'],
          ['h_weightLoss', 'weightLoss', 'health'], ['h_boneDensity', 'boneDensity', 'health'],
          ['h_pain', 'pain', 'health'], ['h_calcium', 'calcium', 'health'], ['h_vitD', 'vitD', 'health']
        ].forEach(([name, key, ns]) => {
          U.qsa(`input[name="${name}"]`, bodyEl).forEach(r => r.onchange = () => { S[ns][key] = r.value; saveDraft(); });
        });
        [
          ['#h-fall-count', 'fallCount', 'health'], ['#h-aid-type', 'aidType', 'health'],
          ['#h-loss-kg', 'weightLossKg', 'health'], ['#h-pain-area', 'painArea', 'health'],
          ['#h-drug-count', 'drugCount', 'health'], ['#h-supp-count', 'supplementCount', 'health'],
          ['#h-diseases', 'diseases', 'health']
        ].forEach(([sel, key, ns]) => {
          const el = U.qs(sel, bodyEl);
          if (el) el.oninput = () => { S[ns][key] = el.value; saveDraft(); };
        });

        /* 运动习惯字段绑定 */
        [
          ['#e-freq', 'frequency', 'exercise'], ['#e-types', 'types', 'exercise']
        ].forEach(([sel, key, ns]) => {
          const el = U.qs(sel, bodyEl);
          if (el) el.oninput = () => { S[ns][key] = el.value; saveDraft(); };
        });
        [
          ['e_place', 'place', 'exercise'], ['e_weather', 'weather', 'exercise'], ['e_winter', 'winter', 'exercise']
        ].forEach(([name, key, ns]) => {
          U.qsa(`input[name="${name}"]`, bodyEl).forEach(r => r.onchange = () => { S[ns][key] = r.value; saveDraft(); });
        });

        /* 首诊登记独立档案：实时 BMI 计算 + 保存回写 SarcDB */
        const hEl = U.qs('#r-height', bodyEl), wEl = U.qs('#r-weight', bodyEl), bmiEl = U.qs('#r-bmi', bodyEl);
        const calcBmi = () => {
          const h = U.num(hEl && hEl.value), w = U.num(wEl && wEl.value);
          if (bmiEl) bmiEl.value = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : '';
        };
        if (hEl) hEl.oninput = calcBmi;
        if (wEl) wEl.oninput = calcBmi;

        const saveBtn = U.qs('#btn-save-reg', bodyEl);
        if (saveBtn) saveBtn.onclick = () => {
          const name = (U.qs('#r-name', bodyEl).value || '').trim();
          if (!name) { U.toast('请填写姓名', 'warning'); return; }
          const rec = {
            id: reg ? reg.id : undefined,
            name,
            gender: (U.qs('input[name="r-gender"]:checked', bodyEl) || {}).value || 'male',
            age: U.num(U.qs('#r-age', bodyEl).value),
            height: U.num(U.qs('#r-height', bodyEl).value),
            weight: U.num(U.qs('#r-weight', bodyEl).value),
            phone: (U.qs('#r-phone', bodyEl).value || '').trim(),
            chronic: (U.qs('#r-chronic', bodyEl).value || '').trim(),
            exam: {
              sbp: U.num(U.qs('#r-sbp', bodyEl).value),
              dbp: U.num(U.qs('#r-dbp', bodyEl).value),
              standSbp: U.num(U.qs('#r-stand-sbp', bodyEl).value),
              standDbp: U.num(U.qs('#r-stand-dbp', bodyEl).value),
              hba1c: U.num(U.qs('#r-hba1c', bodyEl).value),
              visionLeft: U.num(U.qs('#r-vision-l', bodyEl).value),
              visionRight: U.num(U.qs('#r-vision-r', bodyEl).value)
            },
            health: {
              fallHistory: (U.qs('input[name="h_fallHistory"]:checked', bodyEl) || {}).value || '',
              fallCount: U.num(U.qs('#h-fall-count', bodyEl).value),
              useAid: (U.qs('input[name="h_useAid"]:checked', bodyEl) || {}).value || '',
              aidType: (U.qs('#h-aid-type', bodyEl).value || '').trim(),
              weightLoss: (U.qs('input[name="h_weightLoss"]:checked', bodyEl) || {}).value || '',
              weightLossKg: U.num(U.qs('#h-loss-kg', bodyEl).value),
              boneDensity: (U.qs('input[name="h_boneDensity"]:checked', bodyEl) || {}).value || '',
              pain: (U.qs('input[name="h_pain"]:checked', bodyEl) || {}).value || '',
              painArea: (U.qs('#h-pain-area', bodyEl).value || '').trim(),
              drugCount: U.num(U.qs('#h-drug-count', bodyEl).value),
              supplementCount: U.num(U.qs('#h-supp-count', bodyEl).value),
              calcium: (U.qs('input[name="h_calcium"]:checked', bodyEl) || {}).value || '',
              vitD: (U.qs('input[name="h_vitD"]:checked', bodyEl) || {}).value || '',
              diseases: (U.qs('#h-diseases', bodyEl).value || '').trim()
            },
            exercise: {
              frequency: U.num(U.qs('#e-freq', bodyEl).value),
              types: (U.qs('#e-types', bodyEl).value || '').trim(),
              place: (U.qs('input[name="e_place"]:checked', bodyEl) || {}).value || '',
              weather: (U.qs('input[name="e_weather"]:checked', bodyEl) || {}).value || '',
              winter: (U.qs('input[name="e_winter"]:checked', bodyEl) || {}).value || ''
            }
          };
          rec.bmi = (rec.height && rec.weight) ? U.round(rec.weight / Math.pow(rec.height / 100, 2), 1) : null;
          reg = D().savePatient(rec);
          const tip = U.qs('#reg-save-tip', bodyEl);
          if (tip) tip.textContent = '已保存 · ' + new Date().toLocaleTimeString('zh-CN');
          const headName = U.qs('#head-name', wrap);
          if (headName) headName.textContent = name;
          U.toast('首诊登记已更新', 'success');
        };
      }

      if (k === 3) {
        /* 蓝牙握力 / 步速设备连接（预留接口） */
        const btBtn = U.qs('#btn-bt-connect', bodyEl);
        if (btBtn) btBtn.onclick = () => connectBluetooth(bodyEl);
        const simBtn = U.qs('#btn-bt-sim', bodyEl);
        if (simBtn) simBtn.onclick = () => {
          const gripEl = U.qs('#f-grip', bodyEl), gaitEl = U.qs('#f-gait', bodyEl);
          const g = (22 + Math.random() * 12).toFixed(1);
          const s = (0.6 + Math.random() * 0.4).toFixed(2);
          if (gripEl) { gripEl.value = g; S.grip = g; }
          if (gaitEl) { gaitEl.value = s; S.gait = s; }
          saveDraft(); liveSPPB(); liveCore();
          if (window.SmartForm) SmartForm.flash(bodyEl, ['#f-grip', '#f-gait']);
          U.toast('已模拟采集握力 ' + g + ' kg / 步速 ' + s + ' m/s', 'success');
        };

        const bindNum = (sel, setter) => {
          const el = U.qs(sel, bodyEl);
          if (el) el.oninput = () => { setter(el.value); saveDraft(); liveSPPB(); liveCore(); };
        };
        bindNum('#f-calf', v => S.calf = v);
        bindNum('#f-grip', v => S.grip = v);
        bindNum('#f-gait', v => S.gait = v);
        bindNum('#b-smi', v => S.body.smi = v);
        bindNum('#b-fat', v => S.body.bodyFat = v);
        bindNum('#b-vis', v => S.body.visceral = v);
        bindNum('#b-mm', v => S.body.muscleMass = v);
        bindNum('#b-bmr', v => S.body.bmr = v);
        bindNum('#b-wt', v => S.body.weight = v);

        const us = U.qs('#f-usestrength', bodyEl);
        if (us) us.onchange = () => { S.useStrength = us.checked; saveDraft(); };

        U.qsa('input[name="f_balance"]', bodyEl).forEach(r => r.onchange = () => { S.balanceKey = r.value; saveDraft(); liveSPPB(); });
        const ch = U.qs('#f-chair', bodyEl);
        if (ch) ch.oninput = () => { S.chairSec = ch.value; saveDraft(); liveSPPB(); };
        const cc = U.qs('#f-chair-cannot', bodyEl);
        if (cc) cc.onchange = () => {
          S.chairCannot = cc.checked;
          if (ch) { ch.disabled = cc.checked; if (cc.checked) { ch.value = ''; S.chairSec = ''; } }
          saveDraft(); liveSPPB();
        };
        U.qsa('input[name="f_cfs"]', bodyEl).forEach(r => r.onchange = () => {
          S.cfs = r.value; saveDraft();
          U.qsa('.sarc-cfs', bodyEl).forEach(l => l.classList.toggle('checked', l.querySelector('input').checked));
          liveCFS();
        });

        /* 外部体成分报告上传 + OCR 解析回填 */
        const fileInput = U.qs('#f-bodyfile', bodyEl);
        const upBtn = U.qs('#btn-upload-body', bodyEl);
        if (upBtn && fileInput) {
          upBtn.onclick = () => fileInput.click();
          fileInput.onchange = async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) return U.toast('文件过大，请上传 8MB 以内的报告', 'warning');
            const originalText = upBtn.textContent;
            try {
              upBtn.disabled = true;
              upBtn.textContent = '⏳ 正在归档并识别报告...';
              await D().saveReportFile(S.id, f);
              S.reportFile = { name: f.name, type: f.type, size: f.size, uploadedAt: new Date().toISOString() };
              saveDraft();
              U.toast('报告已归档，正在识别体成分数据...', 'info');

              /* 把解析到的「姓名/年龄/性别/身高/体重」回填到首诊登记（仅填充空白字段，绝不覆盖人工录入） */
              const backfillRegister = (p) => {
                if (!p) return 0;
                try {
                  const reg = D().getPatient(base.id);
                  if (!reg) return 0;
                  let n = 0;
                  const safe = (key, val) => { if (val != null && val !== '' && (reg[key] == null || reg[key] === '')) { reg[key] = val; n++; } };
                  safe('name', p.name); safe('age', p.age); safe('height', p.height); safe('weight', p.weight);
                  if (p.gender && (reg.gender == null || reg.gender === '' || !reg.name)) { reg.gender = p.gender; n++; }
                  if (n) D().savePatient(reg);
                  return n;
                } catch (e) { return 0; }
              };
              const SEL = { smi: '#b-smi', bodyFat: '#b-fat', visceral: '#b-vis', muscleMass: '#b-mm', bmr: '#b-bmr', weight: '#b-wt' };
              const CORE_KEYS = ['smi', 'bodyFat', 'visceral', 'muscleMass', 'bmr', 'weight'];
              const applyBody = (txt) => {
                const body = IsoOCR.parseBodyComposition(txt);
                const hit = [];
                CORE_KEYS.forEach(k => { if (body[k] != null) { S.body[k] = body[k]; hit.push(SEL[k]); } });
                const hdrHit = backfillRegister(body);
                S._flash = hit;
                saveDraft();
                return { body, hit, hdrHit };
              };

              // 双路径：优先 PDF 文本层（PdfParser 自带 OCR 兜底），失败再走 IsoOCR.scan（扫描件）
              let rawText = '';
              let viaText = false;
              try {
                if (typeof window.PdfParser === 'object' && typeof window.PdfParser.parseFile === 'function') {
                  upBtn.textContent = '⏳ 正在解析 PDF 文本层...';
                  const pr = await window.PdfParser.parseFile(f, { typeHint: 'bodycomposition' });
                  if (pr && pr.rawText && pr.rawText.length >= 20) { rawText = pr.rawText; viaText = true; }
                }
              } catch (e) { /* 静默 → 走 OCR */ }
              if (!rawText) {
                try {
                  const ocr = await IsoOCR.scan(f, (p) => { if (p != null) upBtn.textContent = `⏳ OCR 识别中 ${p}%`; });
                  if (ocr && ocr._ocrText) rawText = ocr._ocrText;
                } catch (e2) { /* 留空统一处理 */ }
              }
              if (!rawText) {
                U.toast('未能从文件中识别出文字，请改用手动录入', 'error');
                const failEl = U.qs('#body-ocr-status', bodyEl) || bodyEl;
                failEl.innerHTML = `<p style="font-size:13px;color:var(--danger);">未能从文件中识别出文字（可能为扫描清晰度不足或文件损坏）。可直接在上方表单手动录入体成分指标。</p>`;
                saveDraft(); render(); return;
              }

              // 三段式：解析 → 回填 → 展示 OCR 原文 + 已抽字段 + 可重新解析
              const onReparse = (txt) => {
                const r = applyBody(txt);
                render();
                const se = U.qs('#body-ocr-status', bodyEl) || bodyEl;
                renderBodyStatus(se, txt, r.body, viaText, onReparse);
                U.toast(`已基于原文重新解析，回填 ${r.hit.length} 项核心指标`, r.hit.length ? 'success' : 'warning');
              };

              const res = applyBody(rawText);
              // AI 增强：用大模型对 OCR 文本做结构化抽取，补全正则遗漏字段（失败静默，不阻断正则结果）
              try {
                if (window.AIReason && typeof window.AIReason.parseReport === 'function') {
                  upBtn.textContent = '⏳ 鹊动小Qoo 智能解析中...';
                  const ai = await AIReason.parseReport({ ocrText: rawText, typeHint: 'bodycomposition', file: f });
                  if (ai && ai.fields) {
                    const flds = ai.fields;
                    CORE_KEYS.forEach(k => { if (flds[k] != null) { S.body[k] = flds[k]; if (res.hit.indexOf(SEL[k]) === -1) res.hit.push(SEL[k]); } });
                    if (flds.name || flds.age != null || flds.gender || flds.height != null || flds.weight != null) {
                      res.hdrHit += backfillRegister({ name: flds.name, age: flds.age, gender: flds.gender, height: flds.height, weight: flds.weight });
                    }
                    Object.assign(res.body, flds);
                    res.aiInfo = { provider: ai.provider, usedVision: ai.usedVision, fields: flds };
                    saveDraft();
                  }
                }
              } catch (e) { console.warn('[bodycomp] AI 解析增强失败（已回退正则结果）', e); }
              render();
              const statusEl2 = U.qs('#body-ocr-status', bodyEl) || bodyEl;
              renderBodyStatus(statusEl2, rawText, res.body, viaText, onReparse, res.aiInfo);
              const filled = res.hit.length, hdr = res.hdrHit;
              U.toast(`体成分报告识别完成，已回填 ${filled} 项核心指标${hdr ? `、首诊登记 ${hdr} 项` : ''}${filled || hdr ? '（已高亮，请核对）' : ''}`, (filled || hdr) ? 'success' : 'warning');
            } catch (e) { U.toast('上传/识别失败：' + U.errMsg(e), 'error'); }
            finally {
              const liveBtn = U.qs('#btn-upload-body', bodyEl) || upBtn;
              liveBtn.disabled = false; liveBtn.textContent = originalText;
            }
          };
        }
        const delF = U.qs('#btn-del-bodyfile', bodyEl);
        if (delF) delF.onclick = () => U.confirm('确认删除已归档的外部报告？', async () => {
          await D().deleteReportFile(S.id);
          S.reportFile = null; saveDraft(); U.toast('已删除', 'success'); render();
        });
        const viewF = U.qs('#btn-view-bodyfile', bodyEl);
        if (viewF) viewF.onclick = () => viewBodyReport(S.id, S.reportFile);

        liveSPPB(); liveCFS(); liveCore();
      }

      if (k === 4) {
        E().SARCF_ITEMS.forEach(it => U.qsa(`input[name="sf_${it.key}"]`, bodyEl).forEach(r =>
          r.onchange = () => { S.sarcf[it.key] = parseInt(r.value, 10); saveDraft(); liveSarcF(); }));
        E().LIFE_SECTIONS.forEach(sec => sec.items.forEach(it =>
          U.qsa(`input[name="lf_${it.key}"]`, bodyEl).forEach(r =>
            r.onchange = () => { S.life[it.key] = parseInt(r.value, 10); saveDraft(); liveLife(); })));
        E().MNA_SF_ITEMS.forEach(it => U.qsa(`input[name="mn_${it.key}"]`, bodyEl).forEach(r =>
          r.onchange = () => { S.mnasf[it.key] = parseInt(r.value, 10); saveDraft(); liveMnaSF(); }));
        E().AMT_ITEMS.forEach(it => U.qsa(`input[name="amt_${it.key}"]`, bodyEl).forEach(r =>
          r.onchange = () => { S.amt[it.key] = r.value; saveDraft(); liveAmt(); }));
        E().FEAR_FALL_ITEMS.forEach(it => U.qsa(`input[name="ff_${it.key}"]`, bodyEl).forEach(r =>
          r.onchange = () => { S.fearFall[it.key] = parseInt(r.value, 10); saveDraft(); liveFear(); }));
        liveSarcF(); liveLife(); liveMnaSF(); liveAmt(); liveFear();
      }

      if (k === 7) {
        const pa = U.qs('#btn-print-assessment', bodyEl);
        if (pa) pa.onclick = () => printSarcAssessment(buildRecord(compute()));
        try {
          const aiHost = U.qs('#sarc-ai-interp-host', bodyEl);
          if (aiHost && window.AIReason && typeof window.AIReason.attachInterpretButton === 'function') {
            const sysEl = U.qs('#sarc-assessment-report-body', bodyEl);
            window.AIReason.attachInterpretButton(aiHost, () => {
              const _R = compute();
              return buildSarcAIContext(_R, buildRecord(_R));
            }, { title: '鹊动小Qoo 报告解读', systemEl: sysEl });
          }
        } catch (e) { console.warn('[sarcopenia] 步骤7 AI 解读挂载失败', e); }
        U.qsa('.btn-share-sarc-qr', bodyEl).forEach(btn => {
          btn.onclick = () => {
            let sarcoRec = null;
            if (window.SarcShare && typeof SarcShare.snapshot === 'function') sarcoRec = SarcShare.snapshot();
            if (window.Share && typeof Share.openPlanQRModal === 'function') Share.openPlanQRModal({ scheme: 'sarcopenia', sarcoRec: sarcoRec });
            else U.toast('分享组件未就绪', 'error');
          };
        });
      }

      if (k === 8) {
        /* 标准版 / 严谨版 / AI 方案推荐 三段切换（纯前端显隐，不重算、不丢 tab 状态） */
        const vt = U.qs('#sarc-view-toggle', bodyEl);
        if (vt) {
          const stdEl = U.qs('#sarc-view-std', bodyEl);
          const strictEl = U.qs('#sarc-view-strict', bodyEl);
          const aiEl = U.qs('#sarc-view-ai', bodyEl);
          U.qsa('button[data-view]', vt).forEach(b => {
            b.onclick = () => {
              const v = b.getAttribute('data-view');
              U.qsa('button[data-view]', vt).forEach(x => x.classList.toggle('active', x === b));
              if (stdEl) stdEl.style.display = v === 'std' ? '' : 'none';
              if (strictEl) strictEl.style.display = v === 'strict' ? '' : 'none';
              if (aiEl) aiEl.style.display = v === 'ai' ? '' : 'none';
              const swb = U.qs('#btn-switch-prefer', bodyEl);
              if (swb) swb.style.display = v === 'std' ? '' : 'none';
              S.planView = v; saveDraft();
              if (v === 'ai') enrichAI();
            };
          });
        }
        /* P2：基于评估动态生成「营养干预强制指令」，注入 AI 方案上下文，
         * 确保「鹊动小Qoo AI 方案推荐」必含饮食营养章节（后端 generate-plan 透传整个 context 给模型） */
        function buildNutritionDirective(R) {
          const diet = (R && R.plan && R.plan.diet) || [];
          if (!diet.length) return '';
          const lines = diet.map(x => (x[0] ? x[0] + '：' : '') + (x[1] || ''));
          return '【饮食营养干预（方案必须包含此章节）】\n' + lines.join('\n') +
            '\n请依据上述营养评估结果与要点，在「鹊动小Qoo AI 方案推荐」中输出完整的饮食营养干预章节：' +
            '含每日蛋白质摄入目标(g/kg)、三餐/加餐安排、口服营养补充(ONS)与维生素D/钙建议、进餐顺序等，并与运动处方并列呈现。';
        }
        function enrichAI() {
          const host = U.qs('#sarc-ai-plan-host', bodyEl);
          if (!host) return;
          if (!host.dataset.aiWired) {
            host.dataset.aiWired = '1';
            if (window.AIReason) {
              try {
                const R = compute();
                if (R && R.plan) R.nutritionDirective = buildNutritionDirective(R);
                window.AIReason.aiControls(host, R, {});
              } catch (e) { console.warn('[sarcopenia] AI 控件注入失败', e); }
            }
          }
          // P2 增强：AI 方案视图常驻「系统内置营养干预」卡片——即便模型未主动输出营养章节，
          // 用户也必能看到基于评估实时生成的个性化营养方案（与 AI 自由生成方案并列呈现）。
          try {
            const R = compute();
            const nh = U.qs('#sarc-ai-nutrition-host', bodyEl);
            if (nh && R && R.plan && R.plan.diet && R.plan.diet.length) {
              nh.innerHTML = '<div class="sarc-ai-nutrition-card">' +
                '<div class="sanc-head">🍽️ 系统内置 · 饮食营养干预（依据评估自动生成）</div>' +
                '<table class="sarc-diet-tbl"><tbody>' +
                R.plan.diet.map(x => `<tr><td><b>${U.esc(x[0])}</b></td><td>${U.esc(x[1])}</td></tr>`).join('') +
                '</tbody></table></div>';
            }
          } catch (e) { /* noop */ }
        }
        if ((S.planView || 'std') === 'ai') enrichAI();
        const sw = U.qs('#btn-switch-prefer', bodyEl);
        if (sw) sw.onclick = () => {
          S.forcePrefer = (S.forcePrefer || currentPrefer()) === 'home' ? 'device' : 'home';
          saveDraft(); render();
          U.toast('已切换首选方案为「' + (S.forcePrefer === 'home' ? '老年徒手训练' : '鹊动设备训练') + '」', 'success');
        };
        const pp = U.qs('#btn-print-plan', bodyEl);
        if (pp) pp.onclick = () => printSarcPlan(buildRecord(compute()));
        U.qsa('.btn-share-sarc-qr', bodyEl).forEach(btn => {
          btn.onclick = () => {
            let sarcoRec = null;
            if (window.SarcShare && typeof SarcShare.snapshot === 'function') sarcoRec = SarcShare.snapshot();
            if (window.Share && typeof Share.openPlanQRModal === 'function') Share.openPlanQRModal({ scheme: 'sarcopenia', sarcoRec: sarcoRec });
            else U.toast('分享组件未就绪', 'error');
          };
        });
        const ckBtn = U.qs('#btn-sarc-checkin', bodyEl);
        if (ckBtn) ckBtn.onclick = () => {
          let sarcoRec = null;
          if (window.SarcShare && typeof SarcShare.snapshot === 'function') sarcoRec = SarcShare.snapshot();
          if (window.Share && typeof Share.openPlanQRModal === 'function') Share.openPlanQRModal({ scheme: 'sarcopenia', sarcoRec: sarcoRec });
          else U.toast('分享组件未就绪', 'error');
        };
        const aiGen = U.qs('#btn-sarc-ai-gen', bodyEl);
        if (aiGen) aiGen.onclick = () => {
          S.planView = 'ai'; saveDraft();
          const vt = U.qs('#sarc-view-toggle', bodyEl);
          if (vt) U.qsa('button[data-view]', vt).forEach(x => x.classList.toggle('active', x.getAttribute('data-view') === 'ai'));
          const stdEl = U.qs('#sarc-view-std', bodyEl), strictEl = U.qs('#sarc-view-strict', bodyEl), aiEl = U.qs('#sarc-view-ai', bodyEl);
          if (stdEl) stdEl.style.display = 'none';
          if (strictEl) strictEl.style.display = 'none';
          if (aiEl) aiEl.style.display = '';
          const swb = U.qs('#btn-switch-prefer', bodyEl); if (swb) swb.style.display = 'none';
          enrichAI();
        };
        const eb = U.qs('#btn-edit-exerc', bodyEl);
        if (eb) eb.onclick = () => {
          const R = compute();
          const ep = R.plan.home && R.plan.home.exercisePlan;
          if (!ep) return U.toast('暂无肌少症居家方案可编辑', 'warning');
          openSarcExerciseEditor(ep, (edited, close) => {
            S.exercisePlanOverride = edited;
            saveDraft();
            close();
            render();
            U.toast('肌少症居家方案已更新', 'success');
          });
        };
        /* 徒手/设备方案标签页切换 */
        U.qsa('.sarc-plan-tab', bodyEl).forEach(tab => {
          tab.onclick = () => {
            const group = tab.getAttribute('data-tab-group');
            const id = tab.getAttribute('data-tab');
            U.qsa(`.sarc-plan-tab[data-tab-group="${group}"]`, bodyEl).forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === id));
            U.qsa(`.sarc-plan-panel[data-tab-group="${group}"]`, bodyEl).forEach(p => p.classList.toggle('active', p.getAttribute('data-panel') === id));
          };
        });
        bindSarcDeviceMedia(bodyEl);
      }

      if (k === 9) {
        /* 步骤 9：跌倒风险评估嵌入（避免重复执行，每次进入该步骤重建 wrap） */
        const host = U.qs('#sarc-fall-host', bodyEl);
        if (host) {
          host.innerHTML = '';
          try {
            if (typeof Pages.fallRisk === 'function') {
              const node = Pages.fallRisk();
              if (node && node.nodeType === 1) host.appendChild(node);
              else host.innerHTML = (node || '<div class="alert alert-warning">跌倒模块未返回内容</div>');
            } else {
              host.innerHTML = '<div class="alert alert-warning">跌倒模块未加载</div>';
            }
          } catch (e) {
            console.error('[sarcopenia step 9 嵌入跌倒失败]', e);
            host.innerHTML = '<div class="alert alert-danger">嵌入跌倒风险评估失败：' + U.esc(e.message || String(e)) + '</div>';
          }
        }
        /* 第九步前置自检面板：进入跌倒风险评估前，提示肌少症流程前序必填项与结果有效性缺口 */
        const preq = U.qs('#sarc-prereq-box', bodyEl);
        if (preq) {
          try { preq.innerHTML = sarcStep9PrereqHTML(S, base); }
          catch (e) { console.error('[sarcopenia step 9 前置自检失败]', e); }
        }
      }

      if (k === 10) {
        const rv = U.qs('#f-review', bodyEl);
        if (rv) rv.onchange = () => { S.reviewDate = rv.value; saveDraft(); };
        const nt = U.qs('#f-note', bodyEl);
        if (nt) nt.oninput = () => { S.note = nt.value; saveDraft(); };
        const sb = U.qs('#btn-save-sarc', bodyEl);
        if (sb) sb.onclick = () => doSave();
        const pf = U.qs('#btn-print-final', bodyEl);
        if (pf) pf.onclick = () => printSarc(buildRecord(compute()));
        bindLedger(bodyEl, D().listByPatient(base.id).filter(x => x.id !== S.id));
      }
    }

    /* ---------- 实时反馈 ---------- */
    /* 步骤 3-1 · 三大核心指标即时判定卡（边录入边给阈值结论） */
    function liveCore() {
      const box = U.qs('#core-live', bodyEl);
      if (!box || !window.SmartForm) return;
      const eng = E();
      const items = [
        { k: '小腿围', r: eng.evalCalf(S.calf, base.gender), unit: 'cm' },
        { k: '握力', r: eng.evalGrip(S.grip, base.gender), unit: 'kg' },
        { k: '4 米步速', r: eng.evalGait(S.gait), unit: 'm/s' }
      ];
      const done = items.filter(i => i.r.has);
      if (!done.length) {
        box.innerHTML = `<div class="calc-result-card" style="background:rgba(148,163,184,.08);border-left-color:var(--text-muted);">
          <div style="font-size:12.5px;color:var(--text-muted);">录入小腿围 / 握力 / 步速后，系统将按 AWGS 2019 老年界值即时给出逐项判定与综合初筛结论。</div></div>`;
        return;
      }
      const bad = done.filter(i => i.r.low).length;
      const level = bad >= 2 ? 'bad' : (bad === 1 ? 'warn' : 'ok');
      const tag = bad >= 2 ? '初筛高度阳性' : (bad === 1 ? '初筛阳性' : '三项均达标');
      const detail = items.map(i => {
        if (!i.r.has) return `<span style="color:var(--text-muted);">${i.k} 未测</span>`;
        const c = i.r.low ? 'var(--danger)' : 'var(--success)';
        return `<span style="color:${c};font-weight:600;">${i.k} ${i.r.value}${i.unit} ${i.r.low ? '↓低于阈值 ' + i.r.t : '✓达标（阈值 ' + i.r.t + '）'}</span>`;
      });
      box.innerHTML = SmartForm.resultCard({
        label: '核心指标即时判定',
        value: `${done.length - bad}/${done.length}`,
        unit: '项达标',
        tag, level,
        desc: done.map(i => U.esc(i.r.desc)).join('<br>'),
        parts: detail
      });
    }

    function liveSPPB() {
      const box = U.qs('#sppb-live', bodyEl);
      if (!box) return;
      const r = E().evalSPPB(S.gait, S.balanceKey, S.chairSec, S.chairCannot);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">SPPB 实时得分：${r.total} / 12</b>
          ${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">${U.esc(r.desc)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">
          ${r.parts.map(p => `${U.esc(p.name)} ${p.score == null ? '未计分' : p.score + ' 分'}`).join('　·　')}</div>
      </div>`;
    }
    function liveCFS() {
      const box = U.qs('#cfs-live', bodyEl);
      if (!box) return;
      const c = E().evalCFS(S.cfs);
      box.innerHTML = c.has
        ? `<div class="alert ${c.level === 'bad' ? 'alert-danger' : (c.level === 'warn' ? 'alert-warning' : 'alert-success')}">
            <div><strong>${U.esc(c.label)}</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.7;">
            ${U.esc(c.desc)}${c.warn ? '<br>' + U.esc(c.warn) : ''}</p></div></div>`
        : '<div style="font-size:13px;color:var(--text-muted);">请选择对应衰弱等级。</div>';
    }
    function liveSarcF() {
      const box = U.qs('#sarcf-live', bodyEl);
      if (!box) return;
      const r = E().evalSarcF(S.sarcf);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">SARC-F 实时得分：${r.total} / 10</b>${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">
          ${r.complete ? U.esc(r.desc) : `已作答 ${r.answered} / 5 题，请完成全部题目。`}</div></div>`;
    }
    function liveLife() {
      const box = U.qs('#life-live', bodyEl);
      if (!box) return;
      const r = E().evalLifeSurvey(S.life);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">生活方式风险得分：${r.total} / ${r.max}</b>${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-top:8px;">
          已作答 ${r.answered} / ${r.totalItems} 题（得分越高，肌肉流失诱因越多）</div></div>`;
    }
    function liveMnaSF() {
      const box = U.qs('#mnasf-live', bodyEl);
      if (!box) return;
      const r = E().evalMnaSF(S.mnasf);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">MNA-SF 实时得分：${r.total} / 14</b>${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">
          ${r.complete ? U.esc(r.desc) : `已作答 ${r.answered} / 6 题，请完成全部题目。`}</div></div>`;
    }
    function liveAmt() {
      const box = U.qs('#amt-live', bodyEl);
      if (!box) return;
      const r = E().evalAmt(S.amt);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">AMT 实时得分：${r.total} / 10</b>${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">
          ${r.complete ? U.esc(r.desc) : `已作答 ${r.answered} / 10 题，请完成全部题目。`}</div></div>`;
    }
    function liveFear() {
      const box = U.qs('#fear-live', bodyEl);
      if (!box) return;
      const r = E().evalFearFall(S.fearFall);
      box.innerHTML = `<div style="border:1px dashed ${lv(r.level).c}66;border-radius:12px;padding:14px 16px;background:${lv(r.level).bg};">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <b style="font-size:18px;color:${lv(r.level).c};">跌倒关注程度：${r.total} / 64</b>${chip(r.level, r.label)}
        </div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:8px;line-height:1.7;">
          ${r.complete ? U.esc(r.desc) : `已作答 ${r.answered} / 16 题，请完成全部题目。`}</div></div>`;
    }

    /* ---------- 运算与保存 ---------- */
    function currentPrefer() {
      const R = E().computeAll(draftForCompute(), base);
      return R.plan.prefer.prefer;
    }
    function draftForCompute() {
      const st = (S.useStrength !== false && window.getLatestStrengthSummary) ? window.getLatestStrengthSummary() : null;
      return {
        calf: S.calf, grip: S.grip, gait: S.gait,
        balanceKey: S.balanceKey, chairSec: S.chairSec, chairCannot: S.chairCannot,
        cfs: S.cfs, body: S.body, sarcf: S.sarcf, life: S.life,
        mnasf: S.mnasf, amt: S.amt, fearFall: S.fearFall,
        health: S.health, exam: S.exam, exercise: S.exercise,
        strength: st, scene: S.scene, hasDevice: S.hasDevice,
        gender: base.gender, age: base.age
      };
    }
    function compute() {
      const R = E().computeAll(draftForCompute(), base);
      if (S.forcePrefer) R.plan.prefer.prefer = S.forcePrefer;
      if (S.exercisePlanOverride) { R.plan.home = R.plan.home || {}; R.plan.home.exercisePlan = S.exercisePlanOverride; }
      window.__sarcLastCompute = R; // 供工作台「严谨版方案」入口复用
      window.__sarcLastPatient = base;
      /* 兜底：确保营养方案始终有内容（避免步骤 8 饮食营养区块因数据缺失而不显示） */
      if (!R.plan.diet || !R.plan.diet.length) {
        R.plan.diet = [['营养维持', '保证每日优质蛋白（蛋 / 奶 / 鱼 / 禽 / 豆制品）与维生素 D 摄入，规律三餐、控糖控油；必要时至营养科会诊制定个体化膳食方案。']];
      }
      return R;
    }
    /* 严谨版（SarcEngine2）内联渲染：任何异常都降级为提示，不拖垮步骤 8 整页 */
    function strictPlanHTML(R) {
      try {
        if (!window.SarcEngine2 || !SarcEngine2.generate) {
          return `<div class="alert alert-warning"><div><strong>严谨版引擎未加载</strong>
            <p style="margin:6px 0 0;font-size:13px;">请确认 modules/sarcopenia-engine.js 已在 index.html 中引入后重试。</p></div></div>`;
        }
        const ctx = SarcEngine2.adaptComputeResult ? SarcEngine2.adaptComputeResult(R, base) : R;
        return SarcEngine2.renderHTML(SarcEngine2.generate(ctx));
      } catch (e) {
        console.warn('[sarcopenia] 严谨版方案渲染失败', e);
        return `<div class="alert alert-warning"><div><strong>严谨版方案生成失败</strong>
          <p style="margin:6px 0 0;font-size:13px;">${U.esc(U.errMsg(e))}</p>
          <p style="margin:6px 0 0;font-size:13px;color:var(--text-muted);">可继续使用左侧「标准版」方案，本次失败已记录到控制台。</p></div></div>`;
      }
    }
    function buildRecord(R) {
      return {
        id: S.id, no: S.no || '（未归档）', patientId: base.id, patientName: base.name,
        gender: base.gender, age: base.age, height: base.height, weight: base.weight, bmi: base.bmi,
        phone: base.phone, chronic: base.chronic,
        assessDate: S.assessDate, scene: S.scene, hasDevice: S.hasDevice,
        doctor: (AppState.currentUser && (AppState.currentUser.displayName || AppState.currentUser.username)) || '',
        input: {
          calf: S.calf, grip: S.grip, gait: S.gait, balanceKey: S.balanceKey,
          chairSec: S.chairSec, chairCannot: S.chairCannot, cfs: S.cfs,
          body: { ...S.body }, sarcf: { ...S.sarcf }, life: { ...S.life }, contra: { ...S.contra },
          mnasf: { ...S.mnasf }, amt: { ...S.amt }, fearFall: { ...S.fearFall },
          health: { ...S.health }, exam: { ...S.exam }, exercise: { ...S.exercise }
        },
        reportFile: S.reportFile || null,
        reviewDate: S.reviewDate || R.plan.reviewDate,
        note: S.note || '',
        result: R
      };
    }
    function buildSarcAIContext(R, rec) {
      return {
        module: 'sarcopenia-assessment',
        patient: {
          id: rec.id, name: rec.patientName, gender: rec.gender, age: rec.age,
          height: rec.height, weight: rec.weight, bmi: rec.bmi, phone: rec.phone, chronic: rec.chronic
        },
        assessment: R,
        rawInput: rec.input,
        note: '老年人体重管理 & 肌少症专项评估报告（AWGS2019 框架）'
      };
    }
    function doSave() {
      const R = compute();
      if (!S.no) S.no = D().nextNo();
      const rec = buildRecord(R);
      rec.no = S.no;
      D().save(rec);
      S.saved = true;
      saveDraft();
      U.toast(`评估已归档至肌少症独立台账（${S.no}）`, 'success');
      render();
    }

    /* ---------- 步骤流转 ---------- */
    function canNext() {
      /* 统一前置：当前步骤存在硬性字段错误时拦截并定位到第一处 */
      if (stepValidator) {
        const errs = stepValidator.errors();
        if (errs.length) {
          const first = stepValidator.focusFirstError();
          U.toast(`有 ${errs.length} 项数据超出合理范围：${(first && first.msg) || errs[0].msg}`, 'error');
          return false;
        }
        const warns = stepValidator.warnings();
        if (warns.length) {
          U.toast(`${warns.length} 项数据偏离常见区间（${warns.map(w => w.label).filter(Boolean).join('、')}），已放行，请复核`, 'warning');
        }
      }
      if (S.step === 1) {
        const c = E().evalContra(S.contra, base.age);
        if (c.hit.length) { U.toast('存在评估禁忌，按规范须终止本次测评', 'error'); return false; }
        if (!c.ageOk) { U.toast(c.ageMsg, 'warning'); return false; }
        const answered = E().CONTRA_ITEMS.every(it => typeof S.contra[it.key] === 'boolean');
        if (!answered) { U.toast('请完成全部禁忌筛查项', 'warning'); return false; }
      }
      if (S.step === 3) {
        const has = [S.calf, S.grip, S.gait].some(v => E().num(v) != null);
        if (!has) { U.toast('请至少录入小腿围、握力、步速中的一项客观指标', 'warning'); return false; }
        if (E().num(S.gait) == null) { U.toast('4 米步速为 SPPB 与跌倒风险核心输入，建议务必录入', 'warning'); }
      }
      if (S.step === 4) {
        const sf = E().evalSarcF(S.sarcf);
        if (!sf.complete) { U.toast('请完成 SARC-F 全部 5 道题目', 'warning'); return false; }
      }
      return true;
    }

    /* ---------- 第九步前置自检面板（进入跌倒风险评估前的必填项与结果有效性提示） ---------- */
    function sarcStep9PrereqHTML(st, patient) {
      const eng = E();
      const row = (it) => `<li><span class="pi ${it.ok ? 'ok' : 'miss'}">${it.ok ? '✓' : '✗'}</span><span class="pt"><b>${U.esc(it.label)}</b>${it.dtl ? ` · <span class="pm">${U.esc(it.dtl)}</span>` : ''}</span></li>`;
      /* 硬闸：步骤 1 禁忌筛查 */
      const c = eng.evalContra(st.contra || {}, patient.age);
      const contraAnswered = eng.CONTRA_ITEMS.every(it => typeof (st.contra || {})[it.key] === 'boolean');
      let contraOk = true, contraMsg = '已全答且无禁忌命中、年龄合规';
      if (!contraAnswered) { contraOk = false; contraMsg = '尚有禁忌筛查项未作答'; }
      else if (c.hit.length) { contraOk = false; contraMsg = '检出评估禁忌：' + c.hit.map(h => h.label).join('、') + '（须终止测评）'; }
      else if (!c.ageOk) { contraOk = false; contraMsg = '年龄不合规：' + c.ageMsg; }
      /* 硬闸：步骤 3 客观指标 */
      const calf = eng.num(st.calf), grip = eng.num(st.grip), gait = eng.num(st.gait);
      const objCount = [calf, grip, gait].filter(v => v != null).length;
      const objMiss = []; if (gait == null) objMiss.push('4 米步速'); if (grip == null) objMiss.push('握力'); if (calf == null) objMiss.push('小腿围');
      const objOk = objCount > 0;
      const objMsg = objOk ? ('已录入 ' + objCount + '/3 项' + (objMiss.length ? ('，建议补录：' + objMiss.join('、')) : '')) : '三项均未录入（须至少一项）';
      /* 硬闸：步骤 4 SARC-F */
      const sf = eng.evalSarcF(st.sarcf || {});
      /* 结果有效性（软）：客观 + 问卷 + SPPB + 衰弱 */
      const h = st.health || {};
      const mnaDone = eng.MNA_SF_ITEMS.every(it => st.mnasf && st.mnasf[it.key] != null);
      const amtDone = eng.AMT_ITEMS.every(it => st.amt && st.amt[it.key] != null);
      const soft = [
        { ok: gait != null, label: '4 米步速', dtl: gait != null ? '已录入' : '未录入（SPPB / 跌倒指数核心）' },
        { ok: grip != null, label: '握力', dtl: grip != null ? '已录入' : '未录入' },
        { ok: calf != null, label: '小腿围', dtl: calf != null ? '已录入' : '未录入' },
        { ok: h.fallHistory != null && h.fallHistory !== '', label: '跌倒史（健康问卷）', dtl: (h.fallHistory != null && h.fallHistory !== '') ? '已录入' : '未录入' },
        { ok: !!st.balanceKey, label: '平衡功能（SPPB）', dtl: st.balanceKey ? '已录入' : '未录入' },
        { ok: !!(st.chairSec || st.chairCannot), label: '起坐计时（SPPB）', dtl: (st.chairSec || st.chairCannot) ? '已录入' : '未录入' },
        { ok: !!st.cfs, label: '临床衰弱评分 CFS', dtl: st.cfs ? '已录入' : '未录入' },
        { ok: mnaDone, label: '营养筛查 MNA-SF', dtl: mnaDone ? '已全答' : '尚有题目未作答' },
        { ok: amtDone, label: '认知筛查 AMT', dtl: amtDone ? '已全答' : '尚有题目未作答' }
      ];
      const gate = [
        { ok: contraOk, label: '步骤 1 禁忌筛查', dtl: contraMsg },
        { ok: objOk, label: '步骤 3 客观指标', dtl: objMsg },
        { ok: sf.complete, label: '步骤 4 SARC-F 问卷', dtl: sf.complete ? '5 题已全答' : '尚有题目未作答' }
      ];
      const gateMiss = gate.filter(i => !i.ok).length;
      const banner = gateMiss === 0
        ? '<li><span class="pi ok">✓</span><span class="pt"><b>前置已全部达标</b><span class="pm">，可正常进行第九步跌倒风险评估</span></span></li>'
        : '<li><span class="pi miss">!</span><span class="pt"><b>有 ' + gateMiss + ' 项前置未达标</b><span class="pm">，将无法通过「下一步」或导致结果无效，请返回补齐</span></span></li>';
      const softMiss = soft.filter(i => !i.ok).length;
      const softNote = softMiss === 0 ? '结果有效性数据均已齐备' : ('有 ' + softMiss + ' 项未录入，最终跌倒风险指数与方案精度会受影响');
      return `<div class="card sarc-prereq-card"><div class="card-body" style="padding:14px 16px;">
        <div class="sarc-prereq-h">📋 第九步前置自检 · 进入跌倒风险评估前必查</div>
        <ul class="sarc-prereq-gate">${banner}</ul>
        <ul class="sarc-prereq-list">${gate.map(row).join('')}</ul>
        <div class="sarc-prereq-sub">结果有效性（非拦截项 · 影响最终跌倒风险指数与方案质量）· ${softNote}</div>
        <ul class="sarc-prereq-list">${soft.map(row).join('')}</ul>
      </div></div>`;
    }

    function goPrev() { if (S.step > 1) { S.step--; render(); } }
    function goNext() {
      if (S.step === 10) {
        if (!S.saved) { U.toast('请先点击「归档并纳入台账」保存本次评估', 'warning'); return; }
        D().clearDraft();
        location.hash = '#/sarcopenia';
        return;
      }
      if (!canNext()) return;
      S.step++;
      S.maxStep = Math.max(S.maxStep || 1, S.step);
      render();
    }
    if (prevBtn) prevBtn.onclick = goPrev;
    if (nextBtn) nextBtn.onclick = goNext;

    if (modalClose) modalClose.onclick = closeStepModal;
    if (modalPrev) modalPrev.onclick = goPrev;
    if (modalNext) modalNext.onclick = goNext;
    if (modalSaveClose) modalSaveClose.onclick = function () {
      if (stepValidator) {
        const errs = stepValidator.errors();
        if (errs.length) {
          stepValidator.focusFirstError();
          U.toast(`有 ${errs.length} 项数据超出合理范围，请修正后再保存`, 'error');
          return;
        }
      }
      saveDraft(); render(); closeStepModal(); U.toast('当前步骤数据已保存', 'success');
    };
    if (modalEl) modalEl.onclick = (e) => { if (e.target === modalEl) closeStepModal(); };
    document.addEventListener('keydown', function escClose(e) {
      if (e.key === 'Escape' && modalEl.style.display === 'flex') closeStepModal();
    });

    /* 演示数据 */
    U.qs('#btn-demo-sarc', wrap).onclick = () => {
      E().CONTRA_ITEMS.forEach(it => S.contra[it.key] = false);
      S.calf = base.gender === 'female' ? '31.5' : '32.5';
      S.grip = base.gender === 'female' ? '15.5' : '23.0';
      S.gait = '0.72';
      S.balanceKey = 'semi10';
      S.chairSec = '18.5'; S.chairCannot = false;
      S.cfs = '5';
      S.body = { smi: base.gender === 'female' ? '5.2' : '6.4', bodyFat: base.gender === 'female' ? '36.5' : '30.2', visceral: '10', muscleMass: '38.2', bmr: '1180', weight: String(base.weight || 62) };
      S.sarcf = { s: 1, a: 1, r: 1, c: 1, f: 1 };
      S.life = { resistFreq: 2, dailySteps: 1, sitHours: 2, bedridden: 0, proteinFreq: 1, pickyEat: 1, weightChange: 1, appetite: 1, malnutrition: 0, sleepDur: 1, fatigue: 1, soreness: 1, diabetes: 1, hypertension: 1, jointDisease: 1, steroid: 0 };
      saveDraft(); render();
      U.toast('已填充典型「肌少性肥胖 + 中高跌倒风险」演示数据', 'success');
    };

    render();
    return wrap;
  };

  function formatChronic(c) {
    if (!c) return '未记录（可在患者首诊登记页补充）';
    if (Array.isArray(c)) return c.length ? c.join('、') : '无';
    if (typeof c === 'object') {
      const ks = Object.keys(c).filter(k => c[k]);
      return ks.length ? ks.join('、') : '无';
    }
    return String(c);
  }

  /* ==================================================================
   * 独立评估报告
   * ================================================================== */
  /* 渲染居家徒手智能匹配方案（36 动作库 + 匹配算法输出）
     v2：去掉重复 mascot 默认缩略图，改用更紧凑的图标+内容+状态徽章结构 */
  function exercisePlanHTML(ep, editable) {
    if (!ep) return '';
    const badge = (st) => st === 'recommend'
      ? '<span class="sarc-ex-badge rec">推荐</span>'
      : st === 'forbidden'
        ? '<span class="sarc-ex-badge forbid">禁止</span>'
        : '<span class="sarc-ex-badge opt">可选</span>';
    const block = (g) => g && g.items && g.items.length ? `
      <div class="sarc-ex-group">
        <div class="sarc-ex-gtitle">${U.esc(g.title)}</div>
        <div class="sarc-ex-items">
          ${g.items.map(it => {
            const fig = window.SarcExerciseLib && SarcExerciseLib.figureSVG ? SarcExerciseLib.figureSVG(it.posture) : '';
            return `<div class="sarc-ex-item ${it.status}">
              <div class="sarc-ex-fig">${fig}</div>
              <div class="sarc-ex-main">
                <div class="sarc-ex-top">
                  <div class="sarc-ex-name">${U.esc(it.name)} ${it.level ? `<span class="sarc-ex-lv">${U.esc(it.level)}</span>` : ''}</div>
                  ${badge(it.status)}
                </div>
                <div class="sarc-ex-meta">${U.esc(it.params || '')}</div>
                <div class="sarc-ex-note">${PlanMediaView.fold(it.note || '按要点规范完成，循序渐进', '医嘱')}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';
    return `<div class="sarc-ex-plan">
      <div class="sarc-ex-head">
        <span class="sarc-ex-tag">${U.esc(ep.gradeLabel || '')}</span>
        <span class="sarc-ex-tag">跌倒风险：${U.esc(ep.fallLevel || '—')}</span>
        <span class="sarc-ex-tag">SPPB：${U.esc(ep.sppbLevel || '—')}</span>
        ${editable ? '<button class="btn btn-ghost btn-sm no-print" id="btn-edit-exerc">✎ 编辑动作</button>' : ''}
      </div>
      <div class="sarc-ex-summary">
        <span><b>每周频次：</b>${U.esc(ep.freq || '—')}</span>
        <span><b>单次时长：</b>${U.esc(ep.duration || '—')}</span>
        <span><b>推荐动作：</b>${ep.recommended ? ep.recommended.length : 0} 项</span>
      </div>
      ${block(ep.warmup)}${block(ep.main)}${block(ep.balance)}${block(ep.aerobic)}${block(ep.stretch)}
      ${ep.safety && ep.safety.length ? `<div class="sarc-ex-safety"><b>安全禁忌：</b>${ep.safety.map(x => U.esc(x)).join('；')}</div>` : ''}
    </div>`;
  }

  /* 肌少症居家徒手智能匹配方案编辑器：支持分组增删与逐条参数调整（名称/等级/剂量/医嘱/状态） */
  function openSarcExerciseEditor(ep, onSave) {
    if (!ep) return;
    const GROUPS = ['warmup', 'main', 'balance', 'aerobic', 'stretch'];
    const GLABEL = { warmup: '热身', main: '主体训练', balance: '平衡训练', aerobic: '有氧训练', stretch: '拉伸放松' };
    const STATUS = [
      { v: 'recommend', t: '推荐' },
      { v: 'optional', t: '可选' },
      { v: 'forbidden', t: '禁止' }
    ];
    const work = JSON.parse(JSON.stringify(ep));
    GROUPS.forEach(g => { if (!work[g]) work[g] = { title: GLABEL[g], items: [] }; });

    const blankItem = () => ({ status: 'optional', posture: '', name: '新动作', level: '', params: '', note: '' });

    const buildItems = (g) => (work[g].items || []).map((it, i) => {
      const fields = `
        <div class="form-row" style="grid-template-columns:1fr 1fr;">
          <div class="form-group"><label>动作名称</label>
            <input type="text" data-g="${g}" data-i="${i}" data-f="name" value="${U.esc(it.name || '')}"></div>
          <div class="form-group"><label>等级 / 强度</label>
            <input type="text" data-g="${g}" data-i="${i}" data-f="level" value="${U.esc(it.level || '')}"></div>
        </div>
        <div class="form-group"><label>训练剂量（次数 × 组数 · 负荷 · 间歇）</label>
          <input type="text" data-g="${g}" data-i="${i}" data-f="params" value="${U.esc(it.params || '')}"></div>
        <div class="form-group"><label>动作要领 / 医嘱</label>
          <textarea rows="2" data-g="${g}" data-i="${i}" data-f="note">${U.esc(it.note || '')}</textarea></div>
        <div class="form-group"><label>状态</label>
          <select data-g="${g}" data-i="${i}" data-f="status">
            ${STATUS.map(s => `<option value="${s.v}" ${it.status === s.v ? 'selected' : ''}>${s.t}</option>`).join('')}
          </select></div>`;
      return `<div class="ex-edit-card" data-g="${g}" data-i="${i}" style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;background:var(--card-bg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <strong style="font-size:13.5px;color:var(--primary);">${GLABEL[g]} · 动作 ${i + 1}</strong>
          <button type="button" class="btn btn-ghost btn-sm" data-remove-g="${g}" data-remove-i="${i}">🗑 删除</button>
        </div>${fields}</div>`;
    }).join('');

    const paint = (host) => {
      host.innerHTML = `<div style="max-height:60vh;overflow:auto;padding-right:6px;">
        ${GROUPS.map(g => `
          <div style="margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              <span class="badge badge-secondary">${GLABEL[g]}</span>
              <span style="font-size:12.5px;color:var(--text-muted);">${(work[g].items || []).length} 个动作</span>
              <button type="button" class="btn btn-ghost btn-sm" data-add-g="${g}">＋ 新增</button>
            </div>
            ${buildItems(g)}
          </div>`).join('')}
      </div>`;
      host.querySelectorAll('[data-f]').forEach(inp => {
        inp.addEventListener('input', () => {
          const g = inp.dataset.g, i = +inp.dataset.i;
          work[g].items[i][inp.dataset.f] = inp.value;
        });
      });
      host.querySelectorAll('[data-remove-g]').forEach(b => {
        b.addEventListener('click', () => {
          work[b.dataset.removeG].items.splice(+b.dataset.removeI, 1); paint(host);
        });
      });
      host.querySelectorAll('[data-add-g]').forEach(b => {
        b.addEventListener('click', () => {
          work[b.dataset.addG].items.push(blankItem()); paint(host);
        });
      });
    };

    U.modal({
      title: '编辑居家徒手智能匹配方案', width: '780px',
      body: `<div id="sarc-ex-host"></div>
        <div style="margin-top:12px;font-size:12.5px;color:var(--text-muted);">调整后即时写入评估报告，点击「保存修改」即生效；可在肌少症独立台账中随时再次编辑。</div>`,
      footer: `<button type="button" class="btn btn-secondary" data-a="c">取消</button><button type="button" class="btn btn-primary" data-a="s">保存修改</button>`,
      onMount(ov, close) {
        const host = ov.querySelector('#sarc-ex-host');
        paint(host);
        ov.querySelector('[data-a="c"]').addEventListener('click', close);
        ov.querySelector('[data-a="s"]').addEventListener('click', () => { onSave(work, close); });
      }
    });
  }

  /* 评估报告 / 干预方案共用上下文 */
  function sarcReportCtx(rec) {
    const R = rec.result || {};
    const d = R.direction || {}, f = R.fall || {}, plan = R.plan || {};
    const orgName = (AppState.config && AppState.config.orgName) || '鹊动健康体重管理门诊';
    const sysName = (window.CONST && CONST.SYSTEM_NAME) || '鹊动FAC功能评估与干预系统';
    const sec = (title, icon, html) => html ? `<section class="report-section">
      <h3 class="report-h3">${icon} ${U.esc(title)}</h3>${html}</section>` : '';
    const rowsMetric = [
      ['小腿围', R.calfEval, 'cm'],
      ['握力', R.gripEval, 'kg'],
      ['4 米步速', R.gaitEval, 'm/s']
    ].filter(x => x[1]);
    const sarcSec = (num, title, icon, html) => html ? `<section class="report-section sarc-section">
      <div class="sarc-section-head">
        <h3 class="report-h3"><span class="sarc-section-num">${U.esc(num)}</span>${icon ? `<span class="sarc-section-emoji">${icon}</span>` : ''}<span>${U.esc(title)}</span></h3>
      </div><div class="sarc-section-body">${html}</div></section>` : '';
    const summaryPanel = () => {
      const items = [
        { label: '肌少症风险', value: d.sarcGrade || '—', tone: d.sarcLevel || 'info', desc: (d.sarcGradeDesc || '').slice(0, 36) },
        { label: 'SPPB 总分', value: R.sppb ? (R.sppb.total + ' / 12') : '—', tone: R.sppb ? R.sppb.level : 'info', desc: R.sppb ? R.sppb.label : '' },
        { label: '跌倒风险指数', value: f.index != null ? (f.index + ' / 100') : '—', tone: f.color || 'info', desc: f.level || '' },
        { label: 'CFS 衰弱', value: R.cfs && R.cfs.has ? (R.cfs.value + ' 级') : '—', tone: R.cfs ? R.cfs.level : 'info', desc: R.cfs ? R.cfs.category : '' }
      ];
      return `<div class="sarc-summary">${items.map(it => `<div class="sarc-sum-cell sarc-sum-${it.tone || 'info'}">
        <div class="sarc-sum-label">${U.esc(it.label)}</div>
        <div class="sarc-sum-value">${U.esc(String(it.value))}</div>
        <div class="sarc-sum-desc">${U.esc(it.desc || '')}</div>
      </div>`).join('')}</div>`;
    };
    return { R, d, f, plan, orgName, sysName, sec, rowsMetric, sarcSec, summaryPanel };
  }

  /* 评估报告（一~六）：可单独导出 / 打印 */
  window.buildSarcAssessmentReport = function (rec) {
    const { R, d, f, plan, orgName, sysName, sec, rowsMetric, sarcSec, summaryPanel } = sarcReportCtx(rec);
    return `<div class="report-doc sarc-report-v2" data-scope="sarcopenia">
      <div class="report-cover">
        <img src="images/mascot.png" alt="" class="report-cover-watermark" onerror="this.style.display='none'"/>
        <img src="images/logo.png" alt="Logo" class="report-logo" onerror="this.style.display='none'"/>
        <div class="report-cover-org">${U.esc(orgName)}</div>
        <h1>${U.esc(sysName)}</h1>
        <h2>老年人体重管理 &amp; 肌少症专项评估报告</h2>
        <p>肌少症多指标量化评估 · SPPB 躯体功能 · CFS 衰弱分级 · 跌倒风险指数 · 个性化双方案干预</p>
        <div class="report-cover-meta">
          <span>受评人：${U.esc(rec.patientName || '—')}</span>
          <span>评估日期：${U.esc(rec.assessDate || '—')}</span>
        </div>
        <div class="report-cover-no">评估编号：${U.esc(rec.no || '—')}</div>
      </div>

      ${summaryPanel()}

      ${sarcSec('一', '受评人基础信息', '🪪', `<div class="report-meta-grid">
        <div><span>姓名</span><b>${U.esc(rec.patientName || '—')}</b></div>
        <div><span>性别</span><b>${rec.gender === 'female' ? '女' : '男'}</b></div>
        <div><span>年龄</span><b>${rec.age != null ? rec.age + ' 岁' : '—'}</b></div>
        <div><span>身高</span><b>${rec.height != null ? rec.height + ' cm' : '—'}</b></div>
        <div><span>体重</span><b>${rec.weight != null ? rec.weight + ' kg' : '—'}</b></div>
        <div><span>BMI</span><b>${rec.bmi != null ? rec.bmi : '—'}</b></div>
        <div><span>干预场景</span><b>${rec.scene === 'home' ? '居家自主' : '门店在店'}</b></div>
        <div><span>评估编号</span><b>${U.esc(rec.no || '—')}</b></div>
        <div><span>评估医师</span><b>${U.esc(rec.doctor || '—')}</b></div>
        <div><span>报告日期</span><b>${U.today()}</b></div>
      </div>`)}

      ${sarcSec('二', '核心客观指标解读', '📐', `
        <table class="data-table" style="width:100%;">
          <thead><tr><th>指标</th><th style="width:110px;">实测值</th><th style="width:110px;">老年阈值</th>
            <th style="width:130px;">判定</th><th>解读</th></tr></thead>
          <tbody>
            ${rowsMetric.map(([nm, e, u]) => `<tr>
              <td><b>${U.esc(nm)}</b></td>
              <td>${e.value == null ? '未测' : e.value + ' ' + u}</td>
              <td>${nm === '4 米步速' ? '＞0.8' : (e.t != null ? '≥' + e.t : '—')} ${u}</td>
              <td>${chip(e.level, e.label)}</td>
              <td style="font-size:12px;">${U.esc(e.desc || '')}</td></tr>`).join('')}
            ${(R.body && R.body.items || []).slice(0, 3).map(it => `<tr>
              <td><b>${U.esc(it.name)}</b></td>
              <td>${it.value == null ? '未测' : it.value + ' ' + it.unit}</td>
              <td>${it.t != null ? it.t + ' ' + it.unit : '—'}</td>
              <td>${chip(it.level, it.label)}</td>
              <td style="font-size:12px;">${U.esc(it.rule)}</td></tr>`).join('')}
          </tbody></table>
        <p style="margin-top:12px;"><b>肌脂组合判定：</b>${U.esc((R.body || {}).comboLabel || '—')}</p>
        ${R.strength ? `<p style="margin-top:8px;"><b>鹊动设备肌力数据：</b>
          ${R.strength.type === 'isotonic' ? '等张' : '等速'}肌力综合得分 ${R.strength.total} 分 ·
          等级 ${U.esc(R.strength.grade || '—')}（设备量化肌力优先于握力，已做老年阈值降级适配）</p>` :
          `<p style="margin-top:8px;color:#64748b;"><b>肌力数据来源：</b>无鹊动设备测评记录，以握力作为唯一肌力判定依据。</p>`}
        ${rec.reportFile ? `<p style="margin-top:8px;"><b>外部人体成分报告：</b>已归档《${U.esc(rec.reportFile.name)}》，可在系统台账溯源查看。</p>` : ''}`)}

      ${sarcSec('三', 'SPPB 躯体功能综合评估', '🚶', R.sppb ? `
        <table class="data-table" style="width:100%;">
          <thead><tr><th>测评项目</th><th>实测结果</th><th style="width:120px;">得分</th></tr></thead>
          <tbody>${(R.sppb.parts || []).map(p => `<tr><td><b>${U.esc(p.name)}</b></td><td>${U.esc(p.detail)}</td>
            <td>${p.score == null ? '未计分' : p.score + ' / ' + p.max}</td></tr>`).join('')}
            <tr><td colspan="2" style="text-align:right;"><b>SPPB 总分</b></td>
              <td><b>${R.sppb.total} / 12</b></td></tr></tbody></table>
        <p style="margin-top:12px;">${chip(R.sppb.level, R.sppb.label)} ${U.esc(R.sppb.desc)}</p>` : '')}

      ${sarcSec('四', 'CFS 衰弱分级与专项问卷', '🧭', `
        <table class="data-table" style="width:100%;">
          <thead><tr><th style="width:210px;">测评工具</th><th style="width:140px;">结果</th><th>判定与说明</th></tr></thead>
          <tbody>
            <tr><td><b>CFS 临床衰弱量表</b></td>
              <td>${R.cfs && R.cfs.has ? R.cfs.value + ' 级' : '未评估'}</td>
              <td>${R.cfs && R.cfs.has ? chip(R.cfs.level, R.cfs.category) + ' ' + U.esc(R.cfs.name + '：' + R.cfs.desc) : '—'}</td></tr>
            <tr><td><b>SARC-F 风险筛查</b></td>
              <td>${R.sarcf && R.sarcf.complete ? R.sarcf.total + ' / 10 分' : '未完成'}</td>
              <td>${R.sarcf ? chip(R.sarcf.level, R.sarcf.positive ? '筛查阳性' : '筛查阴性') + ' ' + U.esc(R.sarcf.desc) : '—'}</td></tr>
            <tr><td><b>肌肉健康生活方式问卷</b></td>
              <td>${R.life ? R.life.total + ' / ' + R.life.max + ' 分' : '—'}</td>
              <td>${R.life ? chip(R.life.level, R.life.label) + ' 得分越高，肌肉流失诱因越多' : '—'}</td></tr>
            <tr><td><b>MNA-SF 营养评估</b></td>
              <td>${R.mnasf && R.mnasf.complete ? R.mnasf.total + ' / 14 分' : '未完成'}</td>
              <td>${R.mnasf ? chip(R.mnasf.level, R.mnasf.label) + ' ' + U.esc(R.mnasf.desc) : '—'}</td></tr>
            <tr><td><b>AMT 精神状态</b></td>
              <td>${R.amt && R.amt.complete ? R.amt.total + ' / 10 分' : '未完成'}</td>
              <td>${R.amt ? chip(R.amt.level, R.amt.label) + ' ' + U.esc(R.amt.desc) : '—'}</td></tr>
            <tr><td><b>自评跌倒关注程度</b></td>
              <td>${R.fearFall && R.fearFall.complete ? R.fearFall.total + ' / 64 分' : '未完成'}</td>
              <td>${R.fearFall ? chip(R.fearFall.level, R.fearFall.label) + ' ' + U.esc(R.fearFall.desc) : '—'}</td></tr>
          </tbody></table>
        ${R.life ? `<p style="margin-top:12px;"><b>五维度诱因分布：</b>
          ${(R.life.sections || []).map(s => `${U.esc(s.title)} ${s.score}/${s.max}（${U.esc(s.label)}）`).join('　·　')}</p>` : ''}`)}

      ${sarcSec('五', '老年跌倒风险指数（加权运算）', '⚖️', f.dims ? `
        <p style="font-size:15px;"><b>跌倒风险指数：${f.index} / 100 分</b>　${chip(f.color, f.level)}</p>
        <p style="margin-top:8px;">${U.esc(f.advice)}</p>
        <table class="data-table" style="width:100%;margin-top:12px;">
          <thead><tr><th>加权维度</th><th style="width:70px;">权重</th><th style="width:80px;">维度分</th>
            <th style="width:80px;">加权分</th><th>数据来源</th></tr></thead>
          <tbody>${f.dims.map(x => `<tr><td><b>${U.esc(x.name)}</b></td><td>${Math.round(x.weight * 100)}%</td>
            <td>${x.sub}</td><td><b>${(x.sub * x.weight).toFixed(1)}</b></td>
            <td style="font-size:12px;">${U.esc(x.source)}</td></tr>`).join('')}</tbody></table>` : '')}

      ${sarcSec('六', '医学体检与健康信息', '🩺', (() => {
        const ex = R.exam || {}, h = R.health || {};
        const sbp = E().num(ex.sbp), dbp = E().num(ex.dbp), ssbp = E().num(ex.standSbp), sdbp = E().num(ex.standDbp);
        const bpText = (sbp || dbp) ? `${sbp || '—'} / ${dbp || '—'} mmHg` : '未填写';
        const standText = (ssbp || sdbp) ? `${ssbp || '—'} / ${sdbp || '—'} mmHg` : '未填写';
        const orthoDrop = (sbp && ssbp) ? (sbp - ssbp) : null;
        return `<div class="report-meta-grid">
          <div><span>血压（平躺）</span><b>${U.esc(bpText)}</b></div>
          <div><span>血压（站立 3min）</span><b>${U.esc(standText)}</b></div>
          ${orthoDrop != null ? `<div><span>直立性收缩压下降</span><b style="color:${orthoDrop >= 20 ? 'var(--danger)' : 'var(--success)'}">${U.round(orthoDrop, 1)} mmHg ${orthoDrop >= 20 ? '（阳性）' : ''}</b></div>` : ''}
          <div><span>糖化血红蛋白</span><b>${ex.hba1c != null ? ex.hba1c + ' %' : '未填写'}</b></div>
          <div><span>视力（左 / 右）</span><b>${ex.visionLeft != null || ex.visionRight != null ? (ex.visionLeft || '—') + ' / ' + (ex.visionRight || '—') : '未填写'}</b></div>
          <div><span>近 1 年跌倒史</span><b>${h.fallHistory === 'yes' ? ('是，' + (h.fallCount || '1') + ' 次') : (h.fallHistory === 'no' ? '否' : '未填写')}</b></div>
          <div><span>助行器</span><b>${h.useAid === 'yes' ? ('是' + (h.aidType ? ' · ' + h.aidType : '')) : (h.useAid === 'no' ? '否' : '未填写')}</b></div>
          <div><span>近 6 个月非主动体重下降</span><b>${h.weightLoss === 'yes' ? ('是' + (h.weightLossKg ? ' · ' + h.weightLossKg + ' kg' : '')) : (h.weightLoss === 'no' ? '否' : '未填写')}</b></div>
          <div><span>骨密度测试</span><b>${h.boneDensity === 'yes' ? '已做' : (h.boneDensity === 'no' ? '未做' : '未填写')}</b></div>
          <div><span>肌肉骨骼疼痛</span><b>${h.pain === 'yes' ? ('是' + (h.painArea ? ' · ' + h.painArea : '')) : (h.pain === 'no' ? '否' : '未填写')}</b></div>
          <div><span>每日药物 / 保健品</span><b>${h.drugCount != null ? h.drugCount + ' / ' + (h.supplementCount || 0) + ' 种' : '未填写'}</b></div>
          <div><span>钙片 / 维生素 D</span><b>${(h.calcium === 'yes' ? '钙片' : '无钙片')} / ${h.vitD === 'yes' ? '维生素 D' : '无维生素 D'}</b></div>
          <div><span>既往病史</span><b>${U.esc(h.diseases || '—')}</b></div>
        </div>`;
      })())}

      ${sarcSec('七', '运动习惯', '🏃', (() => {
        const e = R.exercise || {};
        return `<div class="report-meta-grid">
          <div><span>每周运动次数</span><b>${e.frequency != null ? e.frequency + ' 次' : '未填写'}</b></div>
          <div><span>喜好运动类型</span><b>${U.esc(e.types || '—')}</b></div>
          <div><span>习惯场所</span><b>${e.place === 'indoor' ? '室内' : (e.place === 'outdoor' ? '户外' : '未填写')}</b></div>
          <div><span>天气影响运动</span><b>${e.weather === 'yes' ? '是' : (e.weather === 'no' ? '否' : '未填写')}</b></div>
          <div><span>寒冷季节运动减少</span><b>${e.winter === 'yes' ? '是' : (e.winter === 'no' ? '否' : '未填写')}</b></div>
        </div>`;
      })())}

      ${sarcSec('八', '三层面定量定性评估汇总', '📊', (() => {
        const bmiText = rec.bmi != null ? rec.bmi + ' kg/m²' : '—';
        const bmiStatus = rec.bmi != null ? (rec.bmi < 18.5 ? '体重过低' : (rec.bmi < 24 ? '正常' : (rec.bmi < 28 ? '超重' : '肥胖'))) : '—';
        const wl = (R.health || {}).weightLoss === 'yes';
        const mnaRisk = R.mnasf && R.mnasf.complete && R.mnasf.total <= 11;
        return `<div class="report-ex-grid">
          <div class="report-ex-card"><b>① 肌少症层面</b><p>
            风险等级：<b>${U.esc(d.sarcGrade || '—')}</b>。<br>
            肌力/肌量证据：${(d.muscleFlags || []).length ? U.esc(d.muscleFlags.join('、')) : '暂无明确异常'}。<br>
            ${wl ? '近 6 个月存在非主动体重下降，提示肌肉/营养储备流失。' : '近 6 个月体重无明显下降。'}
            ${mnaRisk ? 'MNA-SF 提示营养不良风险，需营养干预。' : 'MNA-SF 营养状态尚可。'}
          </p></div>
          <div class="report-ex-card"><b>② 跌倒风险层面</b><p>
            跌倒风险指数：<b>${f.index != null ? f.index + ' / 100' : '—'}</b> · ${U.esc(f.level || '—')}。<br>
            ${f.dims && f.dims.find(x => x.key === 'medical') ? '医学危险因素：' + U.esc(f.dims.find(x => x.key === 'medical').source) + '。' : ''}
            ${R.fearFall && R.fearFall.complete ? '跌倒关注程度：' + U.esc(R.fearFall.label) + '。' : ''}
            ${(R.health || {}).fallHistory === 'yes' ? '有跌倒史，须优先纳入跌倒预防。' : '无近 1 年跌倒史。'}
          </p></div>
          <div class="report-ex-card"><b>③ 体重管理层面</b><p>
            BMI：<b>${U.esc(bmiText)}</b>（${U.esc(bmiStatus)}）。<br>
            体脂率：${R.body && R.body.bodyFat != null ? R.body.bodyFat + ' %' : '未测'}；内脏脂肪：${R.body && R.body.visceral != null ? R.body.visceral + ' 级' : '未测'}。<br>
            运动习惯：${(R.exercise || {}).frequency != null ? '每周 ' + R.exercise.frequency + ' 次' : '未填写'}。
            ${d.fatFlags && d.fatFlags.length ? '体脂异常：' + U.esc(d.fatFlags.join('、')) + '。' : '体脂侧暂无明确异常。'}
          </p></div>
        </div>`;
      })())}

      ${sarcSec('九', '综合判定结论', '🎯', `
        <div class="report-ex-grid">
        <div class="report-ex-card"><b>肌少症风险等级</b><p>${U.esc(d.sarcGrade || '—')} —— ${U.esc(d.sarcGradeDesc || '')}</p></div>
        <div class="report-ex-card"><b>基础干预方向</b><p>${U.esc(d.no || '')} ${U.esc(d.full || '—')}<br>
          ${U.esc((plan && plan.goal) || '')}</p></div>
        <div class="report-ex-card"><b>判定依据</b><p>${(d.reasons || []).map(x => U.esc(x)).join('；')}</p></div>
        </div>`)}
    </div>`;
  };

  /* 干预方案（七~十）：基于评估报告结果生成的方案推荐 */
  window.buildSarcPlanReport = function (rec) {
    const { R, d, f, plan, orgName, sysName, sec, rowsMetric, sarcSec, summaryPanel } = sarcReportCtx(rec);
    return `<div class="report-doc sarc-doc sarc-plan-vscroll" data-scope="sarcopenia">
      <img class="report-mascot no-print" src="assets/qoo.png" alt="" onerror="this.remove()">
      ${summaryPanel()}
      ${sarcSec('七', '个性化运动干预方案', '🏃', plan.home ? `
        <p><b>系统首选：</b>${plan.prefer && plan.prefer.prefer === 'home' ? '老年徒手训练方案（居家零设备）' : '鹊动设备训练方案（机构量化）'}
        　<b>推荐依据：</b>${U.esc(((plan.prefer || {})[plan.prefer && plan.prefer.prefer === 'home' ? 'homeReasons' : 'deviceReasons'] || []).join('、'))}</p>
        <div class="report-ex-card" style="border-left:4px solid var(--primary);">
          <b>A. ${U.esc(plan.home.title)}</b>
          <p><b>目标：</b>${U.esc(plan.home.goalText)}<br>
          <b>频次：</b>${U.esc(plan.home.freq || '')}　<b>强度：</b>${U.esc(plan.home.intensity || '')}<br>
          <b>动作库：</b>${(plan.home.actions || []).map(a => U.esc(Array.isArray(a) ? a[0] : a)).join('、')}<br>
          <b>专属规则：</b>${(plan.home.rules || []).map(x => U.esc(x)).join('；')}</p>
        </div>
        ${plan.home && plan.home.exercisePlan ? `<div class="report-ex-card" style="border-left:4px solid var(--success,#22c55e);"><b>🏠 居家徒手智能匹配方案（36 动作库·算法自动生成）</b>${exercisePlanHTML(plan.home.exercisePlan)}</div>` : ''}
        <div class="report-ex-card">
          <b>B. ${U.esc(plan.device.title)}</b>
          <p><b>目标：</b>${U.esc(plan.device.goalText)}<br>
          <b>频次：</b>${U.esc(plan.device.freq || '')}　<b>强度：</b>${U.esc(plan.device.intensity || '')}<br>
          <b>专属规则：</b>${(plan.device.rules || []).map(x => U.esc(x)).join('；')}</p>
          ${plan.device.devices && plan.device.devices.length && typeof plan.device.devices[0] === 'object'
            ? devicePlanHTML(plan.device.devices)
            : '<p><b>适配设备：</b>' + (plan.device.devices || []).map(x => U.esc(Array.isArray(x) ? x[0] : x)).join('、') + '</p>'}
        </div>
        <div class="report-ex-card"><b>有氧安排</b><p>${U.esc(plan.aerobic || '')}</p></div>
        <div class="report-ex-card"><b>双方案统一适配原则</b><p>${(plan.principles || []).map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sarcSec('八', '独立跌倒预防专项方案', '🛡️', plan.fall ? `
        <p><b>执行等级：</b>${U.esc(plan.fall.level)}（指数 ${plan.fall.index} 分）　
        <b>频次：</b>${U.esc(plan.fall.tier.freq)}　<b>目标：</b>${U.esc(plan.fall.tier.aim)}</p>
        ${plan.fall.priority ? '<p style="color:#dc2626;"><b>⚠️ 高风险人群，须优先执行跌倒预防方案，风险下降后再叠加增肌 / 减脂训练。</b></p>' : ''}
        <div class="report-ex-card" style="border-left:4px solid var(--success,#22c55e);">
          <b>${U.esc(plan.fall.home.title)}</b>
          <p><b>目标：</b>${U.esc(plan.fall.home.goalText)}<br><b>单次时长：</b>${U.esc(plan.fall.home.duration)}<br>
          <b>训练频次：</b>${U.esc(plan.fall.home.frequency)}<br><b>强度标准：</b>${U.esc(plan.fall.home.intensity)}</p>
          ${fallExerciseHTML(plan.fall.home.exercises)}
          <p style="margin-top:10px;"><b>训练禁忌：</b>${(plan.fall.home.safety || []).map(x => U.esc(x)).join('；')}</p></div>
        <div class="report-ex-card">
          <b>${U.esc(plan.fall.device.title)}</b>
          <p><b>目标：</b>${U.esc(plan.fall.device.goalText)}<br><b>训练频次：</b>${U.esc(plan.fall.device.frequency)}</p>
          ${devicePlanHTML(plan.fall.device.devices)}
          <p style="margin-top:10px;"><b>安全机制：</b>${plan.fall.device.safety.map(x => U.esc(x)).join('、')}</p></div>
        <div class="report-ex-card"><b>跌倒预防专属生活方式干预</b>
          <p>${plan.fall.lifestyle.map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sarcSec('九', '饮食营养与生活方式干预', '🍽️', plan.diet ? `
        <table class="data-table" style="width:100%;">
          <thead><tr><th style="width:180px;">维度</th><th>执行标准</th></tr></thead>
          <tbody>${plan.diet.map(x => `<tr><td><b>${U.esc(x[0])}</b></td><td>${U.esc(x[1])}</td></tr>`).join('')}</tbody></table>
        <div class="report-ex-card" style="margin-top:12px;"><b>生活方式干预</b>
          <p>${(plan.lifestyle || []).map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sarcSec('十', '复查与随访安排', '📅', `
        <p><b>建议复查日期：</b>${U.esc(rec.reviewDate || plan.reviewDate || '—')}
        （间隔 ${plan.reviewDays || 90} 天）</p>
        <p style="margin-top:8px;"><b>复查项目：</b>小腿围、握力、4 米步速、体成分（SMI / 体脂率 / 内脏脂肪）、SPPB 躯体功能、CFS 衰弱分级、SARC-F 问卷、MNA-SF 营养评估、AMT 精神状态、跌倒关注程度量表。</p>
        <p style="margin-top:8px;"><b>随访要点：</b>对比历次骨骼肌量与体脂变化趋势，评估跌倒风险指数下降幅度，动态调整训练重心与负荷。</p>
        ${rec.note ? `<p style="margin-top:8px;"><b>咨询师备注：</b>${U.esc(rec.note)}</p>` : ''}`)}

      <div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>
      <div class="report-footer">本报告依据《中国老年肌少症诊疗指南》《老年衰弱与肌少症评估规范》生成，属老年人体重管理 &amp; 肌少症专项独立模块输出，仅供临床参考。</div>
    </div>`;
  };

  /* 完整报告 = 评估报告 + 干预方案（工作台报告弹窗 / 最终导出复用） */
  window.buildSarcReport = function (rec) {
    return window.buildSarcAssessmentReport(rec) + window.buildSarcPlanReport(rec);
  };

  /* 肌少症模块分享快照：供二维码手机查看使用 */
  window.SarcShare = {
    snapshot: function () {
      try {
        const R = compute();
        const rec = buildRecord(R);
        const shareRec = JSON.parse(JSON.stringify(rec));
        const strip = function (o) {
          if (o == null || typeof o !== 'object') return o;
          if (Array.isArray(o)) return o.map(strip);
          const out = {};
          for (const k in o) {
            if (k === 'svg' || k === 'diagram' || k === '_raw' || k === 'RAW' || k === 'NOTE') continue;
            const v = o[k];
            out[k] = (typeof v === 'string' && v.length > 2000) ? v.slice(0, 2000) : strip(v);
          }
          return out;
        };
        shareRec.result = strip(shareRec.result);
        delete shareRec.input; // 原始作答体积大且 report 函数不需要
        window.__sarcSharePayload = { module: 'sarcopenia', rec: shareRec };
        return shareRec;
      } catch (e) {
        console.warn('[sarcopenia] 分享快照生成失败', e);
        // 不在此清空全局，避免连带使已生成的快照失效；调用方会显式拿到返回结果
        return null;
      }
    }
  };

  async function printSarc(rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    let html = window.buildSarcReport(rec);
    try {
      const sarcoRec = (window.SarcShare && typeof SarcShare.snapshot === 'function') ? SarcShare.snapshot() : null;
      const qb = await window.Share.buildPlanQrBlock({ mode: 'plan', scheme: 'sarcopenia', sarcoRec: sarcoRec, title: (rec.patientName || '') + ' 肌少症训练方案' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }
  /* 单独打印 / 导出：评估报告（一~六） */
  async function printSarcAssessment(rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    let html = window.buildSarcAssessmentReport(rec);
    try {
      const qb = await window.Share.buildPlanQrBlock({ mode: 'report' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }
  /* 单独打印 / 导出：干预方案（七~十） */
  async function printSarcPlan(rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    let html = window.buildSarcPlanReport(rec);
    try {
      const sarcoRec = (window.SarcShare && typeof SarcShare.snapshot === 'function') ? SarcShare.snapshot() : null;
      const qb = await window.Share.buildPlanQrBlock({ mode: 'plan', scheme: 'sarcopenia', sarcoRec: sarcoRec, title: (rec.patientName || '') + ' 肌少症训练方案' });
      if (qb) html += qb;
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }

  /* ==================================================================
   * 页面三：独立数据统计台账
   * ================================================================== */
    /* ============ 交互升级：肌少症统计 — 可展开卡 / 下钻 donut / 主子行 / 筛选 ============ */
  function sarcKpiCard(o) {
    return `<div class="bigdata-card bigdata-kpi is-expandable" data-bd-key="${o.key}">
      <button type="button" class="bd-expand-toggle" aria-label="展开/收起">▸</button>
      <div class="bigdata-label">${o.label}</div>
      <div class="bigdata-value">${o.value}</div>
      <div class="bigdata-trend">${o.trend}</div>
      ${o.panel ? `<div class="bd-expand-panel"><div class="bd-expand-inner"><div class="bd-panel-pad">${o.panel}</div></div></div>` : ''}
    </div>`;
  }
  function sarcChartCard(o) {
    return `<div class="bigdata-card bigdata-chart-card is-expandable" data-bd-key="${o.key}">
      <button type="button" class="bd-expand-toggle" aria-label="展开/收起">▸</button>
      <h3 class="bigdata-card-title">${o.title}</h3>
      <div class="bigdata-chart-row">${o.chartRow}</div>
      ${o.panel ? `<div class="bd-expand-panel"><div class="bd-expand-inner"><div class="bd-panel-pad">${o.panel}</div></div></div>` : ''}
    </div>`;
  }
  function donutSVGClick(segs, colors, dim) {
    const total = segs.reduce((s, x) => s + (x.value || 0), 0);
    const size = 130, r = 46, cx = size / 2, cy = size / 2, sw = 18;
    const circ = 2 * Math.PI * r;
    let acc = 0, arcs = '';
    if (total <= 0) {
      arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border, #e2e8f0)" stroke-width="${sw}"/>`;
    } else {
      segs.forEach((seg, i) => {
        const v = seg.value || 0; if (!v) return;
        const len = v / total * circ;
        const active = AppState.sarcStatsFilter && AppState.sarcStatsFilter[dim] === seg.key;
        arcs += `<circle class="bd-donut-seg" data-dim="${dim}" data-val="${seg.key}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" style="cursor:pointer;" opacity="${active ? 1 : 0.92}"><title>${U.esc(seg.label)}: ${v}（点击下钻）</title></circle>`;
        acc += len;
      });
    }
    const center = `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text-primary)">${total}</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="11" fill="var(--text-muted)">合计</text>`;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex:0 0 auto;cursor:pointer;">${arcs}${center}</svg>`;
  }
  function buildSarcConclusion(r) {
    const p = [];
    p.push(`肌少症分级：<b>${U.esc(r.sarcGrade || '—')}</b>`);
    p.push(`干预方向：<b>${U.esc(r.dirName || '—')}</b>`);
    p.push(`跌倒风险：<b>${U.esc(r.fallLevel || '—')}</b>${r.fallIndex != null ? `（指数 ${r.fallIndex}）` : ''}`);
    return p.join('；') + '。建议结合小腿围 / 握力 / 步速 / SMI / 体脂率综合判定。';
  }
  function sarcDetailTable(rows) {
    if (!rows.length) return emptyBox();
    const metric = (label, v, unit) => `<div class="sd"><div class="k">${label}</div><div class="v">${v != null && v !== '' ? v + (unit ? `<small>${unit}</small>` : '') : '—'}</div></div>`;
    let html = `<table class="master-sub-table"><thead><tr>
      <th>评估编号</th><th>老人</th><th>分级</th><th>跌倒风险</th><th></th></tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr class="master-row" data-id="${U.esc(r.id)}">
        <td data-label="评估编号"><span class="twist">▸</span><b>${U.esc(r.no || '—')}</b></td>
        <td data-label="老人">${U.esc(r.name)}</td>
        <td data-label="分级">${chip(r.dirColor || 'na', r.sarcGrade || '—')}</td>
        <td data-label="跌倒风险">${chip(r.fallColor || 'na', (r.fallIndex != null ? r.fallIndex + ' · ' : '') + (r.fallLevel || '—'))}</td>
        <td></td>
      </tr>
      <tr class="sub-row" data-sub="${U.esc(r.id)}"><td colspan="5"><div class="sub-inner"><div class="sub-clip">
        <div class="sarc-sub-detail">
          ${metric('干预方向', r.dirName)}
          ${metric('小腿围', r.calf, 'cm')}
          ${metric('握力', r.grip, 'kg')}
          ${metric('步速', r.gait, 'm/s')}
          ${metric('SMI', r.smi)}
          ${metric('体脂率', r.bodyFat, '%')}
          ${metric('SPPB', r.sppbTotal, '/12')}
          ${metric('CFS', r.cfs)}
          ${metric('SARC-F', r.sarcf, '/10')}
          ${metric('生活方式', r.life)}
        </div>
        <div class="sarc-sub-concl">${buildSarcConclusion(r)}</div>
        <div class="sarc-sub-actions">
          <button class="btn btn-secondary btn-sm sarc-view" data-id="${U.esc(r.id)}">查看完整报告</button>
        </div>
      </div></div></td></tr>`;
    });
    html += `</tbody></table>`;
    return html;
  }

  Pages.sarcopeniaStats = function () {
    // 演示模式：复现 bigdata.js 的 useDemo 行为 —— demo 模式下从 window.DashCore.demoPatients 生成虚构 KPI
    const useDemo = AppState.sarcStatsDemo === true;
    let all, persons;
    const patients = AppState.patients || [];
    if (useDemo) {
      // 触发 bigdata.js 的 demoPatients 缓存（保证两侧数据一致）
      if (!AppState.bigdataDemoPatients) {
        try { AppState.bigdataDemoPatients = (window.DashCore && window.DashCore.demoPatients) ? window.DashCore.demoPatients() : []; } catch (e) { AppState.bigdataDemoPatients = []; }
      }
      const dp = AppState.bigdataDemoPatients || [];
      persons = new Set(dp.map(p => String(p.id)));
      // 把 demo 患者映射成 D().list() 形态（含 result/input 字段）
      const fakeGrades = ['正常', '可能肌少症', '肌少症', '严重肌少症'];
      const fakeFalls = ['low', 'mid', 'high'];
      const dirMeta = (typeof E === 'function' && E() && E().DIRECTIONS) ? E().DIRECTIONS : { maintain: { icon: '🛡', full: '维持', color: '#34d399' }, gain: { icon: '💪', full: '增肌', color: '#0ea5e9' }, lose: { icon: '🏃', full: '减重', color: '#a78bfa' }, both: { icon: '⚡', full: '减重+增肌', color: '#f59e0b' } };
      all = dp.map((p, idx) => ({
        id: 'demo-' + p.id, no: 'D' + String(idx + 1).padStart(4, '0'),
        patientId: p.id,
        patientName: p.patientName || (p.data && p.data.patient && p.data.patient.name) || ('演示患者' + (idx + 1)),
        gender: (p.data && p.data.patient && p.data.patient.gender) || (idx % 2 ? 'female' : 'male'),
        assessDate: '2026-08-' + String(((idx * 3) % 28) + 1).padStart(2, '0'),
        reviewDate: '2026-09-' + String(((idx * 5) % 28) + 1).padStart(2, '0'),
        result: {
          direction: { key: ['maintain', 'gain', 'lose', 'both'][idx % 4], full: dirMeta[['maintain', 'gain', 'lose', 'both'][idx % 4]].full, color: dirMeta[['maintain', 'gain', 'lose', 'both'][idx % 4]].color, sarcGrade: fakeGrades[idx % 4] },
          fall: { levelKey: fakeFalls[idx % 3], level: ({ low: '低风险', mid: '中风险', high: '高风险' })[fakeFalls[idx % 3]], index: idx % 3, color: idx % 3 === 0 ? '#34d399' : idx % 3 === 1 ? '#f59e0b' : '#f87171' },
          sppb: { complete: true, total: 8 + (idx % 5) },
          cfs: { has: true, value: 2 + (idx % 5) },
          sarcf: { complete: true, total: 4 + (idx % 5) },
          life: { total: 50 + (idx * 3 % 40) }
        },
        input: { body: { smi: 5 + (idx % 3), bodyFat: 25 + (idx % 10) }, calf: 30 + (idx % 5), grip: 18 + (idx % 12), gait: 0.8 + (idx % 5) * 0.1 }
      }));
    } else {
      all = D().list();
      persons = new Set();
      all.forEach(r => persons.add(String(r.patientId)));
    }
    const nameOf = (pid) => {
      const p = patients.find(x => String(x.id) === String(pid));
      return p ? (p.patientName || p.patientCode || pid) : pid;
    };

    const byDir = { maintain: 0, gain: 0, lose: 0, both: 0 };
    const byFall = { low: 0, mid: 0, high: 0 };
    const byGrade = {};
    let dueTotal = 0, dueDone = 0;
    const today = U.today();

    all.forEach(r => {
      persons.add(String(r.patientId));
      const rs = r.result || {};
      if (rs.direction && byDir[rs.direction.key] != null) byDir[rs.direction.key]++;
      if (rs.fall && byFall[rs.fall.levelKey] != null) byFall[rs.fall.levelKey]++;
      const g = rs.direction ? rs.direction.sarcGrade : null;
      if (g) byGrade[g] = (byGrade[g] || 0) + 1;
      const rv = r.reviewDate || (rs.plan && rs.plan.reviewDate);
      if (rv && rv <= today) {
        dueTotal++;
        const later = all.some(x => String(x.patientId) === String(r.patientId) && x.assessDate > r.assessDate);
        if (later) dueDone++;
      }
    });

    const dirMeta = E().DIRECTIONS;
    const fallMeta = { low: ['跌倒低风险', 'ok'], mid: ['跌倒中风险', 'warn'], high: ['跌倒高风险', 'bad'] };
    const adherence = dueTotal ? Math.round(dueDone / dueTotal * 100) : null;

    const dirSegs = Object.keys(byDir).map(k => ({ label: dirMeta[k].icon + ' ' + dirMeta[k].full, value: byDir[k] }));
    const fallSegs = Object.keys(fallMeta).map(k => ({ label: fallMeta[k][0], value: byFall[k] }));
    const gradeSegs = Object.keys(byGrade).map(k => ({ label: k, value: byGrade[k] }));
    const dirColors = Object.keys(byDir).map(k => lv(dirMeta[k].color).c);
    const fallColors = Object.keys(fallMeta).map(k => lv(fallMeta[k][1]).c);
    const gradeColors = ['#38bdf8', '#a78bfa', '#34d399', '#f59e0b', '#f87171'];

    const kpiCard = (label, value, trend) => `
      <div class="bigdata-card bigdata-kpi">
        <div class="bigdata-label">${label}</div>
        <div class="bigdata-value">${value}</div>
        <div class="bigdata-trend">${trend}</div>
      </div>`;

    const donutSVG = (segs, colors) => {
      const total = segs.reduce((s, x) => s + (x.value || 0), 0);
      const size = 130, r = 46, cx = size / 2, cy = size / 2, sw = 18;
      const circ = 2 * Math.PI * r;
      let acc = 0, arcs = '';
      if (total <= 0) {
        arcs = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border, #e2e8f0)" stroke-width="${sw}"/>`;
      } else {
        segs.forEach((seg, i) => {
          const v = seg.value || 0; if (!v) return;
          const len = v / total * circ;
          arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${U.esc(seg.label)}: ${v}</title></circle>`;
          acc += len;
        });
      }
      const center = `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="22" font-weight="800" fill="var(--text-primary)">${total}</text><text x="${cx}" y="${cy + 17}" text-anchor="middle" font-size="11" fill="var(--text-muted)">合计</text>`;
      return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex:0 0 auto;">${arcs}${center}</svg>`;
    };

    const legendHTML = (items, colors) => `<div class="bigdata-legend">${items.map((it, i) => `<div><i style="display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;background:${colors[i % colors.length]}"></i>${U.esc(it.label)} · <b>${it.value}</b></div>`).join('')}</div>`;

    // —— 交互升级：明细行 / 筛选 / 可展开 ——
    const F = AppState.sarcStatsFilter || {};
    const rows = all.map(r => {
      const rs = r.result || {}, dd = rs.direction || {}, ff = rs.fall || {}, i = r.input || {}, b = i.body || {}, sp = rs.sppb || {}, cf = rs.cfs || {}, sf = rs.sarcf || {}, lf = rs.life || {};
      return {
        id: r.id, no: r.no, name: r.patientName || nameOf(r.patientId), gender: r.gender,
        dirKey: dd.key, dirName: dd.full, sarcGrade: dd.sarcGrade, dirColor: dd.color,
        fallLevelKey: ff.levelKey, fallLevel: ff.level, fallIndex: ff.index, fallColor: ff.color,
        calf: i.calf, grip: i.grip, gait: i.gait, smi: b.smi, bodyFat: b.bodyFat,
        sppbTotal: sp.complete ? sp.total : null, cfs: cf.has ? cf.value : null,
        sarcf: sf.complete ? sf.total : null, life: lf.total != null ? lf.total : null
      };
    });
    const filtered = rows.filter(r =>
      (!F.dir || r.dirKey === F.dir) &&
      (!F.fall || r.fallLevelKey === F.fall) &&
      (!F.grade || r.sarcGrade === F.grade));
    const nameList = (arr) => arr.length ? `<div style="max-height:210px;overflow:auto;">${arr.map(r => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 0;border-bottom:1px dashed var(--border);"><span>${U.esc(r.name)}</span><b>${U.esc(r.sarcGrade || '—')}</b></div>`).join('')}</div>` : '<div class="bd-insight-empty">暂无符合条件的记录</div>';
    const dirSegs2 = Object.keys(byDir).map(k => ({ key: k, label: dirMeta[k].icon + ' ' + dirMeta[k].full, value: byDir[k] }));
    const fallSegs2 = Object.keys(fallMeta).map(k => ({ key: k, label: fallMeta[k][0], value: byFall[k] }));
    const gradeSegs2 = Object.keys(byGrade).map(k => ({ key: k, label: k, value: byGrade[k] }));
    let maleN = 0, femaleN = 0; rows.forEach(r => { if (r.gender === 'female') femaleN++; else maleN++; });
    const userPanel = `<ul class="bd-mini-list"><li><span>男性</span><b>${maleN}</b></li><li><span>女性</span><b>${femaleN}</b></li></ul>`;
    const totalPanel = `<div class="bd-drill-note">共 ${all.length} 人次评估，展开下方明细可逐条查看完整结论。</div>` + nameList(rows);
    const highFallPanel = nameList(rows.filter(r => r.fallLevelKey === 'high'));
    const adhPanel = `<div class="bd-drill-note">复查到期 ${dueTotal} 人次，已完成 ${dueDone} 人次，依从率 ${adherence == null ? '—' : adherence + '%'}。建议对逾期者建立随访提醒。</div>`;

    const wrap = U.el(`<div>
      ${moduleBanner()}
      <div class="bigdata-page">
        <div class="bigdata-hero">
          <div>
            <h2 class="bigdata-title">老年人体重与肌少症 · 数据看板</h2>
            <p class="bigdata-subtitle">${U.esc(AppState.config.orgName || '鹊动FAC功能中心')} · 实时汇总 ${all.length} 人次专项评估数据</p>
          </div>
          <div class="bigdata-actions">
            <div class="bigdata-date">${U.today()}</div>
            <button type="button" id="btn-sarc-demo" class="btn ${AppState.sarcStatsDemo ? 'btn-secondary' : 'btn-primary'}" title="切换演示数据查看 · 复用大数据看板的演示数据池">${AppState.sarcStatsDemo ? '退出演示' : '演示数据'}</button>
            <button type="button" id="sarc-fs-btn" class="btn btn-ghost" title="独立弹出大屏展示（不影响主系统）">🖥 全屏展示</button>
          </div>
        </div>

        <div class="bd-dir-seg no-print" role="tablist" aria-label="数据看板方向">
          <button type="button" class="bd-dir-seg-btn" data-bd-dir="weight" role="tab" onclick="location.hash='#/bigdata'"><span class="bd-dir-icon">🚀</span><span class="bd-dir-text">体重管理</span></button>
          <button type="button" class="bd-dir-seg-btn is-active" data-bd-dir="sarcopenia" role="tab"><span class="bd-dir-icon">🧓</span><span class="bd-dir-text">老年肌少症</span></button>
          <button type="button" class="bd-dir-seg-btn" data-bd-dir="fall" role="tab" onclick="location.hash='#/fall-risk-stats'"><span class="bd-dir-icon">🤸</span><span class="bd-dir-text">跌倒风险</span></button>
        </div>

        ${(() => {
          const countyMap = new Map();
          persons.forEach(pid => { const p = patients.find(x => String(x.id) === String(pid)); if (!p) return; const c = (p.data && p.data.patient && p.data.patient.region && p.data.patient.region.county) || ''; if (!c) return; countyMap.set(c, (countyMap.get(c) || 0) + 1); });
          if (!countyMap.size) return '';
          const arr = Array.from(countyMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
          const max = Math.max(...arr.map(x => x[1]), 1);
          return `<div class="card mt-3">
            <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📍</span>老年肌少症患者 · 县区分布 TOP 8</h3><span class="text-muted" style="font-size:12px;">按覆盖人数</span></div>
            <div class="card-body">${arr.map(([k, v]) => `
              <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
                <span style="width:78px;font-size:12px;color:var(--text-secondary);">${U.esc(k)}</span>
                <div style="flex:1;height:14px;border-radius:7px;background:var(--bg-subtle);overflow:hidden;">
                  <div style="height:100%;width:${Math.round(v / max * 100)}%;background:linear-gradient(90deg,#d97706,#0f766e);border-radius:7px;"></div>
                </div>
                <span style="width:24px;text-align:right;font-size:12px;font-weight:600;">${v}</span>
              </div>`).join('')}
            </div>
          </div>`;
        })()}

        <div class="bigdata-grid">
          ${sarcKpiCard({ key:'total', label:'累计评估人次', value:all.length, trend:'次', panel:totalPanel })}
          ${sarcKpiCard({ key:'users', label:'覆盖老年用户', value:persons.size, trend:'人', panel:userPanel })}
          ${sarcKpiCard({ key:'highfall', label:'跌倒高风险占比', value:all.length ? Math.round(byFall.high / all.length * 100) + '%' : '—', trend:all.length ? byFall.high + ' 例高风险' : '暂无数据', panel:highFallPanel })}
          ${sarcKpiCard({ key:'adherence', label:'复查依从率', value:adherence == null ? '—' : adherence + '%', trend:dueTotal ? dueDone + '/' + dueTotal + ' 已完成复查' : '暂无到期复查', panel:adhPanel })}
        </div>

        <div class="bigdata-grid-2">
          ${sarcChartCard({ key:'dir', title:'干预方向分布', chartRow: all.length ? donutSVGClick(dirSegs2, dirColors, 'dir') + legendHTML(dirSegs2, dirColors) : emptyBox(), panel:`<div class="bd-drill-note">点击环形图对应区段可下钻筛选下方明细。</div>` + legendHTML(dirSegs2, dirColors) })}
          ${sarcChartCard({ key:'fall', title:'跌倒风险等级占比', chartRow: all.length ? donutSVGClick(fallSegs2, fallColors, 'fall') + legendHTML(fallSegs2, fallColors) : emptyBox(), panel:`<div class="bd-drill-note">点击环形图对应区段可下钻筛选下方明细。</div>` + legendHTML(fallSegs2, fallColors) })}
          ${sarcChartCard({ key:'grade', title:'肌少症分级分布', chartRow: Object.keys(byGrade).length ? donutSVGClick(gradeSegs2, gradeColors, 'grade') + legendHTML(gradeSegs2, gradeColors) : emptyBox(), panel:`<div class="bd-drill-note">点击环形图对应区段可下钻筛选下方明细。</div>` + legendHTML(gradeSegs2, gradeColors) })}
          ${sarcChartCard({ key:'funnel', title:'评估 → 复查转化漏斗', chartRow:`<div class="bigdata-funnel">
              <div class="bigdata-funnel-item"><span>累计评估</span><b>${all.length}</b></div>
              <div class="bigdata-funnel-item"><span>到期需复查</span><b>${dueTotal}</b></div>
              <div class="bigdata-funnel-item"><span>已完成复查</span><b>${dueDone}</b></div>
              <div class="bigdata-funnel-item"><span>复查依从率</span><b>${adherence == null ? '—' : adherence + '%'}</b></div>
            </div>`, panel:`<div class="bd-drill-note">复查依从率 ${adherence == null ? '—' : adherence + '%'}，缺口环节建议建立随访提醒。</div>` })}
        </div>

        <div class="sarc-filterbar">
          <span class="fb-label">干预方向</span>
          ${dirSegs2.map(it => `<span class="sarc-chip ${F.dir === it.key ? 'active' : ''}" data-dim="dir" data-val="${it.key}">${U.esc(it.label)} <b>${it.value}</b></span>`).join('')}
          <span class="fb-label">跌倒风险</span>
          ${fallSegs2.map(it => `<span class="sarc-chip ${F.fall === it.key ? 'active' : ''}" data-dim="fall" data-val="${it.key}">${U.esc(it.label)} <b>${it.value}</b></span>`).join('')}
          <span class="fb-label">肌少症分级</span>
          ${gradeSegs2.map(it => `<span class="sarc-chip ${F.grade === it.key ? 'active' : ''}" data-dim="grade" data-val="${it.key}">${U.esc(it.label)} <b>${it.value}</b></span>`).join('')}
          <span class="fb-reset" id="fb-reset">清除筛选</span>
          <span class="fb-count">筛选后 ${filtered.length} / ${all.length} 条</span>
        </div>

        <div class="bigdata-card sarc-detail-card" style="margin-top:20px;">
          <h3 class="bigdata-card-title">📋 全模块评估明细（独立台账 · 点击行展开完整结论）</h3>
          <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
            <button class="btn btn-secondary btn-sm" id="btn-export-csv">导出 CSV</button>
            <button class="btn btn-ghost btn-sm" id="btn-export-json">导出 JSON</button>
            <button class="btn btn-ghost btn-sm" id="btn-clear-sarc" style="color:var(--danger);">清空本模块数据</button>
          </div>
          <div>${filtered.length ? `<div style="overflow-x:auto;">${sarcDetailTable(filtered)}</div>` : emptyBox()}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.7;">
            本台账数据完全独立于生活方式干预模块，独立汇总、独立导出，不与其他模块数据合并统计。
          </div>
        </div>
      </div>
    </div>`);

    const csvBtn = U.qs('#btn-export-csv', wrap);
    if (csvBtn) csvBtn.onclick = () => {
      if (!all.length) return U.toast('暂无数据可导出', 'warning');
      const head = ['评估编号', '姓名', '性别', '年龄', '评估日期', '小腿围', '握力', '步速', 'SMI', '体脂率', '内脏脂肪',
        'SPPB', 'CFS', 'SARC-F', '生活方式得分', '跌倒风险指数', '风险等级', '肌少症分级', '干预方向', '建议复查'];
      const rows = all.map(r => {
        const rs = r.result || {}, i = r.input || {}, b = i.body || {};
        return [r.no, r.patientName, r.gender === 'female' ? '女' : '男', r.age, r.assessDate,
          i.calf, i.grip, i.gait, b.smi, b.bodyFat, b.visceral,
          rs.sppb && rs.sppb.complete ? rs.sppb.total : '', rs.cfs && rs.cfs.has ? rs.cfs.value : '',
          rs.sarcf && rs.sarcf.complete ? rs.sarcf.total : '', rs.life ? rs.life.total : '',
          rs.fall ? rs.fall.index : '', rs.fall ? rs.fall.level : '',
          rs.direction ? rs.direction.sarcGrade : '', rs.direction ? rs.direction.full : '',
          r.reviewDate || (rs.plan && rs.plan.reviewDate) || ''];
      });
      const csv = '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
      downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `肌少症专项台账_${U.today()}.csv`);
      U.toast('CSV 已导出', 'success');
    };
    const jsonBtn = U.qs('#btn-export-json', wrap);
    if (jsonBtn) jsonBtn.onclick = () => {
      downloadBlob(new Blob([JSON.stringify(D().exportAll(), null, 2)], { type: 'application/json' }),
        `肌少症模块数据_${U.today()}.json`);
      U.toast('JSON 已导出', 'success');
    };
    const clrBtn = U.qs('#btn-clear-sarc', wrap);
    if (clrBtn) clrBtn.onclick = () => U.confirm(
      '确认清空「老年人体重管理 & 肌少症专项模块」全部评估数据？该操作不可恢复，且不影响其他模块数据。',
      () => { D().clearAll(); U.toast('本模块数据已清空', 'success'); route(); });

    // —— 交互升级：展开卡 / 主子行 / 下钻 donut / 筛选 chips / 查看报告 ——
    wrap.querySelectorAll('.bigdata-card.is-expandable .bd-expand-toggle').forEach(t => {
      t.addEventListener('click', e => { e.stopPropagation(); t.closest('.bigdata-card').classList.toggle('is-open'); });
    });
    wrap.querySelectorAll('.master-row').forEach(tr => {
      tr.addEventListener('click', () => {
        tr.classList.toggle('open');
        const sub = tr.nextElementSibling;
        if (sub && sub.classList.contains('sub-row')) sub.classList.toggle('open');
      });
    });
    const drill = (dim, val) => {
      const F2 = AppState.sarcStatsFilter || {};
      if (F2[dim] === val) delete F2[dim]; else F2[dim] = val;
      AppState.sarcStatsFilter = F2;
      window.route && window.route();
    };
    wrap.querySelectorAll('.bd-donut-seg').forEach(c => {
      c.addEventListener('click', () => drill(c.dataset.dim, c.dataset.val));
    });
    wrap.querySelectorAll('.sarc-chip').forEach(ch => {
      ch.addEventListener('click', () => drill(ch.dataset.dim, ch.dataset.val));
    });
    const resetBtn = U.qs('#fb-reset', wrap);
    if (resetBtn) resetBtn.onclick = () => { AppState.sarcStatsFilter = {}; window.route && window.route(); };
    const sarcFs = U.qs('#sarc-fs-btn', wrap);
    if (sarcFs) sarcFs.addEventListener('click', () => { if (window.Fullscreen) window.Fullscreen.open('sarc'); });
    const sarcDemo = U.qs('#btn-sarc-demo', wrap);
    if (sarcDemo) sarcDemo.addEventListener('click', () => {
      AppState.sarcStatsDemo = !AppState.sarcStatsDemo;
      window.route && window.route();
    });
    wrap.querySelectorAll('.sarc-view').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        const rec = D().byId(b.dataset.id);
        if (!rec) return U.toast('记录不存在', 'error');
        U.modal({
          title: `肌少症专项评估报告 · ${rec.no}`, width: '1080px',
          body: `<div id="sarc-report-host" style="max-height:70vh;overflow:auto;">${window.buildSarcReport(rec)}</div>`,
          footer: `<button class="btn btn-ghost" data-close>关闭</button><button class="btn btn-success" id="m-print-sarc">打印 / 导出</button>`,
          onMount: (m) => { const pb = U.qs('#m-print-sarc', m); if (pb) pb.onclick = () => printSarc(rec); }
        });
      });
    });

    const _bp = wrap.querySelector('.bigdata-page');
    if (_bp) { Pages._sarcBodyCache = _bp.outerHTML; Pages._sarcBodyCacheDemo = AppState.sarcStatsDemo === true; }

    return wrap;

  };

  // 大数据看板 body-only 版本：剥离 hero/segmented（外壳已提供），仅返回数据卡体 HTML，供 Pages.bigdata 复用
  // 用户从 #/bigdata?dir=sarcopenia 直接进入时，cache 为空或 demo 状态变更时主动调一次 Pages.sarcopeniaStats() 填充
  Pages._sarcBodyHtml = function () {
    const wantDemo = AppState.sarcStatsDemo === true;
    if (!Pages._sarcBodyCache || Pages._sarcBodyCacheDemo !== wantDemo) {
      try { Pages.sarcopeniaStats(); } catch (e) { /* noop */ }
    }
    const html = Pages._sarcBodyCache || '';
    if (!html) return '<div class="alert alert-warning">肌少症看板未加载</div>';
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const page = tpl.content.querySelector('.bigdata-page');
    if (page) {
      const h = page.querySelector('.bigdata-hero'); if (h) h.remove();
      const s = page.querySelector('.bd-dir-seg'); if (s) s.remove();
      return page.innerHTML;
    }
    return html;
  };

  function barList(items) {
    const max = Math.max(1, ...items.map(i => i.value));
    return `<div class="sarc-bar-list">${items.map(i => {
      const pct = i.total ? Math.round(i.value / i.total * 100) : 0;
      return `<div class="sarc-bar">
        <div class="sarc-bar-l"><span>${U.esc(i.label)}</span>
          <b style="color:${i.color};">${i.value} 例 · ${pct}%</b></div>
        <div class="sarc-bar-t"><i style="width:${Math.round(i.value / max * 100)}%;background:${i.color};"></i></div>
      </div>`;
    }).join('')}</div>`;
  }
  function emptyBox() {
    return `<div class="sarc-empty"><div style="font-size:38px;">📭</div>
      <p style="font-size:13px;color:var(--text-muted);">本模块暂无评估数据</p></div>`;
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* 暴露首诊登记弹窗，供空态「立即新建」按钮调用 */
  window.SarcOpenReg = openRegisterModal;

  /* 全局委托：评估页空态提示中的「立即新建首诊登记并评估」按钮 */
  document.addEventListener('click', function (e) {
    const tgt = e.target;
    if (!tgt || typeof tgt.closest !== 'function') return;
    const t = tgt.closest('[data-open-reg]');
    if (t) {
      e.preventDefault();
      if (typeof window.SarcOpenReg === 'function') window.SarcOpenReg();
    }
  });

  /* 渲染兜底：万一某步骤异常，显示可读错误而非白屏（覆盖线上环境未知差异） */
  const _origSarcAssess = Pages.sarcopeniaAssess;
  if (typeof _origSarcAssess === 'function') {
    Pages.sarcopeniaAssess = function () {
      try {
        return _origSarcAssess.apply(this, arguments);
      } catch (err) {
        console.error('[sarcopeniaAssess render error]', err);
        return `<div class="alert alert-danger"><div><strong>肌少症评估页面渲染出错</strong>
          <p style="margin:6px 0 0;">${U.esc(U.errMsg(err))}</p>
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px;">如持续出现，请按 F12 打开控制台复制红色报错联系开发。</p></div>`;
      }
    };
  }

  /* 人体成分报告 OCR 三段式面板：展示已抽字段 + 可编辑原文 + 基于原文重新解析 */
  function renderBodyStatus(statusEl, rawText, body, viaText, onReparse, aiInfo) {
    if (!statusEl) return;
    const core = [
      ['smi', '四肢骨骼肌指数 SMI', 'kg/㎡'],
      ['bodyFat', '体脂率', '%'],
      ['visceral', '内脏脂肪等级', ''],
      ['muscleMass', '骨骼肌量', 'kg'],
      ['bmr', '基础代谢', 'kcal'],
      ['weight', '测量体重', 'kg']
    ];
    const head = [
      ['name', '姓名'], ['age', '年龄'], ['gender', '性别'], ['height', '身高(cm)'],
      ['weight', '体重(kg)'], ['bmi', 'BMI'], ['id', 'ID'], ['testDate', '测试日期'], ['score', '总分'], ['ecwRatio', '细胞外水分比率']
    ];
    const filledCore = core.filter(([k]) => body[k] != null).length;
    const filledHead = head.filter(([k]) => body[k] != null).length;
    const esc = (v) => (v == null || v === '' ? '—' : String(v));
    let html = '<div style="padding:12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-card);font-size:13px;line-height:1.8;">';
    html += `<b style="color:${filledCore ? 'var(--success)' : 'var(--warning)'};">${filledCore ? '✅' : '⚠️'} 人体成分报告识别完成（来源：${viaText ? 'PDF 文本层' : 'OCR 识别'}）</b><br/>`;
    html += `<span style="color:var(--text-muted);">核心指标 ${filledCore}/6 项 · 头部信息 ${filledHead}/10 项 已抽取。图表型报告的部分指标（体脂率 / 内脏脂肪 / 骨骼肌量 / 基础代谢）可能仅以图形呈现，请据原文手动补全。</span><br/><br/>`;
    if (aiInfo && aiInfo.fields) {
      const n = Object.keys(aiInfo.fields).filter(k => aiInfo.fields[k] != null).length;
      const via = aiInfo.usedVision ? '视觉模型' : '文本大模型';
      html += `<div style="margin:6px 0 6px;padding:6px 10px;border-radius:8px;background:rgba(56,132,255,.08);border:1px solid rgba(56,132,255,.25);font-size:12.5px;color:var(--primary);"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能解析已增强 ${n} 个字段（${via} · 源：${aiInfo.provider}）。鹊动小Qoo 结果仅供参考，请核对后确认。</div><br/>`;
    }
    html += '<b>已抽取字段：</b><br/>';
    html += '<div style="columns:2;column-gap:18px;">';
    head.forEach(([k, t]) => { if (body[k] != null) html += `<span style="display:inline-block;min-width:118px;color:var(--text-muted);">${t}</span><b style="color:var(--primary);">${esc(body[k])}</b><br/>`; });
    core.forEach(([k, t, u]) => { if (body[k] != null) html += `<span style="display:inline-block;min-width:118px;color:var(--text-muted);">${t}</span><b style="color:var(--primary);">${esc(body[k])}${u ? ' ' + u : ''}</b><br/>`; });
    html += '</div>';
    html += `<details style="margin-top:10px;"><summary style="cursor:pointer;color:var(--primary);user-select:none;">📄 查看 / 编辑 OCR 抽取原文（${rawText.length} 字）</summary>`;
    html += `<textarea id="body-ocr-text" style="width:100%;min-height:150px;margin-top:6px;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);box-sizing:border-box;">${U.esc(rawText)}</textarea>`;
    html += '<p style="font-size:12px;color:var(--text-muted);margin-top:4px;">可修改原文后点击「基于原文重新解析」，系统会按当前规则重新抽取指标并回填。</p>';
    html += '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-primary" id="body-reparse" style="font-size:12.5px;padding:6px 14px;">基于原文重新解析</button>';
    html += '</div></details>';
    html += '</div>';
    statusEl.innerHTML = html;
    const ta = statusEl.querySelector('#body-ocr-text');
    const btn = statusEl.querySelector('#body-reparse');
    if (ta && btn && typeof onReparse === 'function') {
      btn.addEventListener('click', () => { try { onReparse(ta.value || ''); } catch (e) { U.toast('重新解析失败：' + U.errMsg(e), 'error'); } });
    }
  }
})();
