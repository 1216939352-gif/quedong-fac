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

  const E = () => window.SarcEngine;
  const D = () => window.SarcDB;

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
    return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;
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

  function planCard(p, isPrefer, badge) {
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
        <div class="sarc-kv"><span>${p.devices ? '适配设备' : '动作库'}</span>
          <div class="sarc-chips">${(p.devices || p.actions || []).map(a =>
            `<span>${U.esc(Array.isArray(a) ? a[0] : a)}</span>`).join('')}</div></div>
        ${p.rules ? `<div class="sarc-kv"><span>专属规则</span><ul>${p.rules.map(r => `<li>${U.esc(r)}</li>`).join('')}</ul></div>` : ''}
      </div>
    </div>`;
  }

  function fallPlanBlock(fall) {
    const h = fall.home, dv = fall.device, t = fall.tier;
    return `
    <div class="alert ${fall.priority ? 'alert-danger' : 'alert-info'}" style="margin-bottom:16px;">
      <div><strong>${fall.priority ? '⚠️ 跌倒预防专项方案（优先执行）' : '🛡️ 跌倒预防专项方案'}</strong>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
        当前跌倒风险指数 <b>${fall.index}</b> 分 · ${U.esc(fall.level)}｜执行频次：${U.esc(t.freq)}｜目标：${U.esc(t.aim)}
      </p></div>
    </div>
    <div class="sarc-plan-grid">
      <div class="sarc-plan is-fall">
        <div class="sarc-plan-h"><div><b>${U.esc(h.title)}</b></div><span class="badge badge-success">居家刚需</span></div>
        <div class="sarc-plan-b">
          <div class="sarc-kv"><span>核心目标</span><p>${U.esc(h.goalText)}</p></div>
          <div class="sarc-kv"><span>单次时长</span><p>${U.esc(h.duration)}</p></div>
          <div class="sarc-kv"><span>专属动作库</span>
            <ol class="sarc-ol">${h.actions.map(a => `<li><b>${U.esc(a[0])}</b> —— ${U.esc(a[1])}</li>`).join('')}</ol></div>
          <div class="sarc-kv"><span>训练禁忌</span>
            <div class="sarc-chips danger">${h.taboo.map(x => `<span>${U.esc(x)}</span>`).join('')}</div></div>
          <div class="sarc-kv"><span>核心效果</span><p>${U.esc(h.effect)}</p></div>
        </div>
      </div>
      <div class="sarc-plan is-fall">
        <div class="sarc-plan-h"><div><b>${U.esc(dv.title)}</b></div><span class="badge badge-info">机构量化</span></div>
        <div class="sarc-plan-b">
          <div class="sarc-kv"><span>核心目标</span><p>${U.esc(dv.goalText)}</p></div>
          <div class="sarc-kv"><span>训练频次</span><p>${U.esc(dv.duration)}</p></div>
          <div class="sarc-kv"><span>适配鹊动设备</span>
            <div class="sarc-chips">${dv.devices.map(x => `<span>${U.esc(x)}</span>`).join('')}</div></div>
          <div class="sarc-kv"><span>设备训练逻辑</span>
            <ol class="sarc-ol">${dv.actions.map(a => `<li><b>${U.esc(a[0])}</b> —— ${U.esc(a[1])}</li>`).join('')}</ol></div>
          <div class="sarc-kv"><span>安全机制</span>
            <div class="sarc-chips">${dv.safety.map(x => `<span>${U.esc(x)}</span>`).join('')}</div></div>
          <div class="sarc-kv"><span>数据联动</span><p>${U.esc(dv.dataLink)}</p></div>
        </div>
      </div>
    </div>
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
    if (!id) return { id: null, name: '', gender: 'male', age: null, height: null, weight: null, bmi: null, chronic: null, phone: '' };
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
        需单独填写姓名、性别、年龄、身高体重、BMI 及人体成分数据作为评估基线。</p>
        <a href="#/sarcopenia" class="btn btn-primary btn-sm mt-2">前往「肌少症专项台账」创建首诊登记 →</a></div></div>`;
    }
    return null;
  }

  /* 从台账「开始评估」进入向导前，将选中登记档案绑定到当前草稿 */
  function startAssess(pid) {
    const d = D().getDraft() || {};
    d.patientId = pid;
    if (!d.id) d.id = 'sarc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!d.step) d.step = 1;
    if (!d.body) d.body = { smi: '', bodyFat: '', visceral: '', muscleMass: '', bmr: '', weight: '' };
    D().saveDraft(d);
    location.hash = '#/sarcopenia-assess';
  }

  /* 首诊登记弹窗（独立档案，不回写系统） */
  function openRegisterModal(prefill) {
    const p = prefill || {};
    const body = p.body || {};
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
      <h4 class="sarc-h4" style="margin-top:18px;">人体成分基线（评估基线）</h4>
      <div class="form-grid">
        <div class="form-group"><label>四肢骨骼肌指数 SMI（kg/㎡）</label>
          <input type="number" step="0.1" name="smi" value="${U.esc(body.smi || '')}" placeholder="男 ≥7.0 / 女 ≥5.7"></div>
        <div class="form-group"><label>体脂率（%）</label>
          <input type="number" step="0.1" name="bodyFat" value="${U.esc(body.bodyFat || '')}" placeholder="60岁+ 男 ≤28 / 女 ≤33"></div>
        <div class="form-group"><label>内脏脂肪等级</label>
          <input type="number" step="1" name="visceral" value="${U.esc(body.visceral || '')}" placeholder="＜9 级为正常"></div>
        <div class="form-group"><label>骨骼肌量（kg）</label>
          <input type="number" step="0.1" name="muscleMass" value="${U.esc(body.muscleMass || '')}" placeholder="选填"></div>
        <div class="form-group"><label>基础代谢（kcal）</label>
          <input type="number" step="1" name="bmr" value="${U.esc(body.bmr || '')}" placeholder="选填"></div>
        <div class="form-group"><label>联系电话</label>
          <input type="text" name="phone" value="${U.esc(p.phone || '')}" placeholder="选填"></div>
      </div>
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
            phone: fd.phone || '', chronic: fd.chronic ? fd.chronic.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : [],
            body: { smi: E().num(fd.smi), bodyFat: E().num(fd.bodyFat), visceral: E().num(fd.visceral), muscleMass: E().num(fd.muscleMass), bmr: E().num(fd.bmr), weight: E().num(fd.weight) }
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
        <h3>老年人体重管理 &amp; 肌少症专项模块</h3>
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
  Pages.sarcopenia = function () {
    const patients = D().listPatients();
    const all = D().list();
    const focusId = activePatientId() || (patients.length ? (() => {
      let best = null, bn = -1;
      patients.forEach(p => { const n = D().listByPatient(p.id).length; if (n > bn) { bn = n; best = p.id; } });
      return best;
    })() : null);
    const focusRecords = focusId ? D().listByPatient(focusId) : [];
    const focusName = (D().getPatient(focusId) || {}).name || '';

    const pcards = patients.length ? patients.map(p => {
      const h = E().num(p.height), w = E().num(p.weight);
      const bmi = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : '—';
      const recs = D().listByPatient(p.id);
      return `<div class="sarc-patient-card">
        <div class="sarc-patient-ava">${U.esc((p.name || '?').slice(0, 1))}</div>
        <div class="sarc-patient-info">
          <div class="sarc-patient-name">${U.esc(p.name)} <span class="sarc-patient-meta">${p.gender === 'female' ? '女' : '男'}${p.age != null ? ' · ' + p.age + ' 岁' : ''}</span></div>
          <div class="sarc-patient-sub">身高 ${h || '—'}cm · 体重 ${w || '—'}kg · BMI ${bmi} · 已评估 ${recs.length} 次</div>
        </div>
        <div class="sarc-patient-actions no-print">
          <button class="btn btn-primary btn-sm sarc-start" data-id="${p.id}">开始评估</button>
          <button class="btn btn-ghost btn-sm sarc-edit" data-id="${p.id}">编辑</button>
          <button class="btn btn-ghost btn-sm sarc-pdel" data-id="${p.id}" style="color:var(--danger);">删除</button>
        </div>
      </div>`;
    }).join('') : `<div class="sarc-empty">
        <div style="font-size:44px;">🧓</div>
        <p><b>尚无肌少症专项首诊登记</b></p>
        <p style="font-size:13px;color:var(--text-muted);">本模块拥有独立首诊登记档案，不共享系统用户档案；请点击下方按钮创建第一位老人的独立登记。</p>
      </div>`;

    const ledgerStyle = (window.Skin && Skin.state && Skin.state.ledgerStyle) || 'cockpit';
    const todoCard = (typeof ttCard === 'function') ? ttCard('sarc') : (window.ttCard ? window.ttCard('sarc') : '');
    const execCard = (window.TrainingExecution && window.TrainingExecution.ledgerCard) ? window.TrainingExecution.ledgerCard('sarc') : '';
    const titleBar = `<div class="ledger-titlebar"><span class="lt-ico">🧓</span><h1>肌少症与跌倒风险台账</h1><span class="lt-sub">独立档案</span><span class="lt-badge">${patients.length} 人登记</span></div>`;
    const rosterCard = `<div class="card mt-3">
      <div class="card-header">
        <h3 class="card-title"><span class="card-title-icon">🪪</span>首诊登记名册 · 评估台账（合并）</h3>
        <div class="no-print"><button class="btn btn-primary btn-sm" id="btn-new-reg">＋ 新建首诊登记</button></div>
      </div>
      <div class="card-body">${pcards}${ledgerHTML(all)}</div>
    </div>`;
    const statRow = `<div class="sarc-stat-row">
      ${statMini('首诊登记人数', patients.length, '人', 'var(--primary)')}
      ${statMini('模块累计评估', all.length, '次', 'var(--info)')}
      ${statMini('最近评估日期', all.length ? all.slice().sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0))[0].assessDate : '—', '', 'var(--success)')}
      ${statMini('下次复查建议', focusRecords[0] && focusRecords[0].result && focusRecords[0].result.plan ? focusRecords[0].result.plan.reviewDate : '—', '', 'var(--warning)')}
    </div>`;
    const ledgerActions = `<div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">
      <button class="btn btn-primary btn-sm" id="btn-new-sarc" ${patients.length ? '' : 'disabled'}>＋ 新建肌少症评估</button>
      <a class="btn btn-ghost btn-sm" href="#/sarcopenia-stats">独立统计台账 →</a>
    </div>`;
    const trendCard = focusRecords.length >= 2 ? `<div class="card mt-3">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">📈</span>随访复查趋势对比（${U.esc(focusName)}）</h3></div>
      <div class="card-body">${trendHTML(focusRecords)}</div>
    </div>` : '';

    let inner;
    if (ledgerStyle === 'radial') {
      inner = `<div class="ledger-radial-wrap">${titleBar}${statRow}${rosterCard}${ledgerActions}<div class="lr-row">${trendCard}${execCard}</div>${todoCard}</div>`;
    } else {
      inner = `<div class="ledger-cockpit-wrap">${titleBar}<div class="lc-grid">
        <div class="lc-col lc-left">${todoCard}</div>
        <div class="lc-col lc-center">${statRow}${rosterCard}${ledgerActions}</div>
        <div class="lc-col lc-right">${trendCard}${execCard}</div>
      </div></div>`;
    }
    const wrap = U.el(`<div>${patientBar()}${inner}</div>`);

    if (window.bindPatientBar) bindPatientBar(wrap);

    const btnNew = U.qs('#btn-new-sarc', wrap);
    if (btnNew) btnNew.onclick = () => {
      if (!patients.length) { U.toast('请先创建首诊登记', 'warning'); return; }
      startAssess(focusId || patients[0].id);
    };
    const btnReg = U.qs('#btn-new-reg', wrap);
    if (btnReg) btnReg.onclick = () => openRegisterModal();

    U.qsa('.sarc-start', wrap).forEach(b => b.onclick = () => startAssess(b.dataset.id));
    U.qsa('.sarc-edit', wrap).forEach(b => b.onclick = () => openRegisterModal(D().getPatient(b.dataset.id)));
    U.qsa('.sarc-pdel', wrap).forEach(b => b.onclick = () => U.confirm('确认删除该首诊登记档案？其名下评估记录仍保留在台账中，可单独删除。', () => {
      D().removePatient(b.dataset.id); U.toast('已删除登记档案', 'success'); Pages.sarcopenia();
    }));

    bindLedger(wrap, all);
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
            <button class="btn btn-ghost btn-sm sarc-print" data-id="${U.esc(r.id)}">打印</button>
            <button class="btn btn-ghost btn-sm sarc-del" data-id="${U.esc(r.id)}" style="color:var(--danger);">删除</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function bindLedger(root, records) {
    U.qsa('.sarc-view', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (!rec) return U.toast('记录不存在', 'error');
      U.modal({
        title: `肌少症专项评估报告 · ${rec.no}`, width: '1080px',
        body: `<div style="max-height:70vh;overflow:auto;">${window.buildSarcReport(rec)}</div>`,
        footer: `<button class="btn btn-ghost" data-close>关闭</button>
                 <button class="btn btn-primary" id="m-print-sarc">打印 / 导出</button>`,
        onMount: (m) => {
          const pb = U.qs('#m-print-sarc', m);
          if (pb) pb.onclick = () => printSarc(rec);
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
   * 页面二：8 步标准化评估向导
   * ================================================================== */
  const STEPS = [
    { n: 1, t: '禁忌筛查', i: '🚫' },
    { n: 2, t: '基础信息同步', i: '🪪' },
    { n: 3, t: '客观指标录入', i: '📐' },
    { n: 4, t: '专项问卷作答', i: '📝' },
    { n: 5, t: '自动运算评分', i: '🧮' },
    { n: 6, t: '综合风险判定', i: '⚖️' },
    { n: 7, t: '报告与干预方案', i: '📄' },
    { n: 8, t: '纳入台账随访', i: '📒' }
  ];

  Pages.sarcopeniaAssess = function () {
    const warn = needPatient();
    if (warn) return warn;
    const base = basePatient();

    const draft = D().getDraft();
    const S = (draft && String(draft.patientId) === String(base.id)) ? draft : {
      step: 1, id: 'sarc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: null, patientId: base.id, assessDate: U.today(),
      contra: {}, scene: 'store', hasDevice: true,
      calf: '', grip: '', gait: '',
      balanceKey: '', chairSec: '', chairCannot: false, cfs: '',
      body: { smi: '', bodyFat: '', visceral: '', muscleMass: '', bmr: '', weight: '' },
      strength: null, useStrength: true,
      sarcf: {}, life: {},
      reportFile: null, result: null, saved: false
    };
    S.patientId = base.id;

    /* 同步首诊登记的人体成分基线到本次评估（未填写时预填，评估时可据实修改） */
    let reg = D().getPatient(base.id);
    if (reg && reg.body) {
      const sb = S.body || {};
      ['smi', 'bodyFat', 'visceral', 'muscleMass', 'bmr', 'weight'].forEach(k => {
        if (sb[k] === '' || sb[k] == null) sb[k] = (reg.body[k] != null ? reg.body[k] : '');
      });
      S.body = sb;
    }
    const regName = reg ? reg.name : '';

    const wrap = U.el(`<div>
      ${moduleBanner()}
      <div class="card mb-3"><div class="card-body sarc-head">
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
      <div id="sarc-step-body"></div>

      <div class="card mt-3 no-print"><div class="card-body sarc-navbar">
        <button class="btn btn-secondary" id="sarc-prev">← 上一步</button>
        <div id="sarc-step-hint" class="sarc-hint"></div>
        <button class="btn btn-primary" id="sarc-next">下一步 →</button>
      </div></div>
    </div>`);

    const bodyEl = U.qs('#sarc-step-body', wrap);
    const stepperEl = U.qs('#sarc-stepper', wrap);
    const prevBtn = U.qs('#sarc-prev', wrap);
    const nextBtn = U.qs('#sarc-next', wrap);
    const hintEl = U.qs('#sarc-step-hint', wrap);

    function saveDraft() { D().saveDraft(S); }

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
        setStatus('⚠️ 蓝牙连接失败或被取消：' + U.esc((e && (e.message || e.name)) || '未知错误') + '。可点击「模拟一次读数」体验采集回填流程。');
        U.toast('蓝牙连接未成功', 'warning');
      }
    }

    function renderStepper() {
      stepperEl.innerHTML = STEPS.map(s => {
        const st = s.n < S.step ? 'done' : (s.n === S.step ? 'cur' : 'todo');
        return `<div class="sarc-step ${st}" data-step="${s.n}">
          <div class="sarc-step-dot">${st === 'done' ? '✓' : s.n}</div>
          <div class="sarc-step-t"><b>${U.esc(s.t)}</b><span>${s.i} 步骤 ${s.n}</span></div>
        </div>`;
      }).join('');
      U.qsa('.sarc-step', stepperEl).forEach(d => d.onclick = () => {
        const target = parseInt(d.dataset.step, 10);
        if (target < S.step) { S.step = target; render(); }
      });
    }

    function render() {
      renderStepper();
      bodyEl.innerHTML = stepHTML(S.step);
      bindStep(S.step);
      prevBtn.style.visibility = S.step === 1 ? 'hidden' : 'visible';
      nextBtn.textContent = S.step === 8 ? '完成并返回台账' : (S.step === 7 ? '下一步：纳入台账 →' : '下一步 →');
      hintEl.textContent = `步骤 ${S.step} / 8 · ${STEPS[S.step - 1].t}`;
      saveDraft();
      bodyEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          const rp = (reg && reg.body) || {};
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
                <div class="sarc-sub-h" style="margin-top:18px;">二、人体成分基线（评估基线）</div>
                <div class="form-grid">
                  <div class="form-group"><label>四肢骨骼肌指数 SMI（kg/㎡）</label>
                    <input type="number" step="0.1" id="r-smi" value="${U.esc(rp.smi != null ? rp.smi : '')}" placeholder="男 ≥7.0 / 女 ≥5.7"></div>
                  <div class="form-group"><label>体脂率（%）</label>
                    <input type="number" step="0.1" id="r-fat" value="${U.esc(rp.bodyFat != null ? rp.bodyFat : '')}" placeholder="60岁+ 男 ≤28 / 女 ≤33"></div>
                  <div class="form-group"><label>内脏脂肪等级</label>
                    <input type="number" step="1" id="r-vis" value="${U.esc(rp.visceral != null ? rp.visceral : '')}" placeholder="＜9 级正常"></div>
                  <div class="form-group"><label>骨骼肌量（kg）</label>
                    <input type="number" step="0.1" id="r-mm" value="${U.esc(rp.muscleMass != null ? rp.muscleMass : '')}" placeholder="选填"></div>
                  <div class="form-group"><label>基础代谢（kcal）</label>
                    <input type="number" step="1" id="r-bmr" value="${U.esc(rp.bmr != null ? rp.bmr : '')}" placeholder="选填"></div>
                  <div class="form-group"><label>体成分测量体重（kg）</label>
                    <input type="number" step="0.1" id="r-wt" value="${U.esc(rp.weight != null ? rp.weight : '')}" placeholder="选填"></div>
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
                    ${tipBox('测量规范', '端坐、上臂自然下垂、发力抓握握力器，左右手各测 2 次，取最大值，单位 kg。')}</div>
                  <div class="form-group"><label>4 米步速（m/s）</label>
                    <input type="number" step="0.01" id="f-gait" value="${U.esc(S.gait)}" placeholder="如 0.75">
                    ${tipBox('测量规范', '平地直线行走 4 米，按正常日常步速行走，记录时间计算平均步速（m/s）。')}</div>
                </div>
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
                  <button class="btn btn-secondary btn-sm" id="btn-upload-body">📎 上传外部人体成分报告（JPG / PNG / PDF）</button>
                  <span id="body-file-name" style="font-size:13px;color:var(--text-secondary);margin-left:10px;">
                    ${S.reportFile ? U.esc(S.reportFile.name) : '尚未上传'}</span>
                  ${S.reportFile ? `<button class="btn btn-ghost btn-sm" id="btn-del-bodyfile" style="color:var(--danger);">删除</button>` : ''}
                </div>
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

        /* 步骤 7：报告与方案 */
        case 7: {
          const R = compute();
          const plan = R.plan;
          const pref = plan.prefer;
          return `<div>
            <div class="card"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🏃</span>步骤 7-1 · 双版本运动方案（徒手 + 鹊动设备）</h3>
              <div class="no-print"><button class="btn btn-ghost btn-sm" id="btn-switch-prefer">⇄ 切换首选方案</button></div></div>
              <div class="card-body">
                <div class="alert alert-info" style="margin-bottom:16px;">
                  <div><strong>系统智能推荐</strong><p style="margin:6px 0 0;font-size:13px;line-height:1.75;">
                    当前首选：<b>${pref.prefer === 'home' ? '老年徒手训练方案' : '鹊动设备训练方案'}</b>｜
                    徒手依据：${U.esc(pref.homeReasons.join('、'))}｜
                    设备依据：${U.esc(pref.deviceReasons.join('、'))}<br>${U.esc(pref.note)}</p></div>
                </div>
                <div class="sarc-plan-grid">
                  ${planCard(plan.home, pref.prefer === 'home', '居家零设备')}
                  ${planCard(plan.device, pref.prefer === 'device', '机构量化')}
                </div>
                <div class="sarc-kv" style="margin-top:16px;"><span>有氧安排</span><p>${U.esc(plan.aerobic)}</p></div>
                <div class="sarc-kv" style="margin-top:12px;"><span>双方案统一适配原则（老年人专属）</span>
                  <ul>${plan.principles.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul></div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🛡️</span>步骤 7-2 · 独立跌倒预防专项方案</h3></div>
              <div class="card-body">${fallPlanBlock(plan.fall)}</div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">🍽️</span>步骤 7-3 · 饮食营养与生活方式干预</h3></div>
              <div class="card-body">
                <table class="data-table" style="width:100%;">
                  <thead><tr><th style="width:180px;">饮食维度</th><th>执行标准</th></tr></thead>
                  <tbody>${plan.diet.map(d => `<tr><td><b>${U.esc(d[0])}</b></td><td>${U.esc(d[1])}</td></tr>`).join('')}</tbody>
                </table>
                <div class="sarc-kv" style="margin-top:16px;"><span>生活方式干预</span>
                  <ul>${plan.lifestyle.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul></div>
                <div class="alert alert-success" style="margin-top:16px;">
                  <div><strong>复查周期</strong><p style="margin:6px 0 0;font-size:13px;">
                    建议 ${plan.reviewDays} 天后复查（${U.esc(plan.reviewDate)}），复查项目：小腿围、握力、4 米步速、体成分、SPPB、CFS。</p></div>
                </div>
              </div></div>

            <div class="card mt-3"><div class="card-header">
              <h3 class="card-title"><span class="card-title-icon">📄</span>步骤 7-4 · 独立评估报告预览</h3>
              <div class="no-print" style="display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" id="btn-print-preview">打印 / 导出报告</button></div></div>
              <div class="card-body"><div id="sarc-report-preview" style="max-height:620px;overflow:auto;
                border:1px solid var(--border);border-radius:12px;">${window.buildSarcReport(buildRecord(R))}</div></div></div>
          </div>`;
        }

        /* 步骤 8：纳入台账 */
        case 8: {
          const R = compute();
          const prev = base.id ? D().listByPatient(base.id).filter(x => x.id !== S.id) : [];
          return `<div class="card"><div class="card-header">
            <h3 class="card-title"><span class="card-title-icon">📒</span>步骤 8 · 纳入独立台账并设置随访复查</h3></div>
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
                <button class="btn btn-secondary btn-lg" id="btn-print-final">打印 / 导出报告</button>
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
            body: {
              smi: U.num(U.qs('#r-smi', bodyEl).value),
              bodyFat: U.num(U.qs('#r-fat', bodyEl).value),
              visceral: U.num(U.qs('#r-vis', bodyEl).value),
              muscleMass: U.num(U.qs('#r-mm', bodyEl).value),
              bmr: U.num(U.qs('#r-bmr', bodyEl).value),
              weight: U.num(U.qs('#r-wt', bodyEl).value)
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
          saveDraft(); liveSPPB();
          U.toast('已模拟采集握力 ' + g + ' kg / 步速 ' + s + ' m/s', 'success');
        };

        const bindNum = (sel, setter) => {
          const el = U.qs(sel, bodyEl);
          if (el) el.oninput = () => { setter(el.value); saveDraft(); liveSPPB(); };
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

        /* 外部体成分报告上传 */
        const fileInput = U.qs('#f-bodyfile', bodyEl);
        const upBtn = U.qs('#btn-upload-body', bodyEl);
        if (upBtn && fileInput) {
          upBtn.onclick = () => fileInput.click();
          fileInput.onchange = async () => {
            const f = fileInput.files && fileInput.files[0];
            if (!f) return;
            if (f.size > 8 * 1024 * 1024) return U.toast('文件过大，请上传 8MB 以内的报告', 'warning');
            try {
              await D().saveReportFile(S.id, f);
              S.reportFile = { name: f.name, type: f.type, size: f.size, uploadedAt: new Date().toISOString() };
              saveDraft();
              U.toast('外部人体成分报告已归档', 'success');
              render();
            } catch (e) { U.toast('上传失败：' + e.message, 'error'); }
          };
        }
        const delF = U.qs('#btn-del-bodyfile', bodyEl);
        if (delF) delF.onclick = () => U.confirm('确认删除已归档的外部报告？', async () => {
          await D().deleteReportFile(S.id);
          S.reportFile = null; saveDraft(); U.toast('已删除', 'success'); render();
        });

        liveSPPB(); liveCFS();
      }

      if (k === 4) {
        E().SARCF_ITEMS.forEach(it => U.qsa(`input[name="sf_${it.key}"]`, bodyEl).forEach(r =>
          r.onchange = () => { S.sarcf[it.key] = parseInt(r.value, 10); saveDraft(); liveSarcF(); }));
        E().LIFE_SECTIONS.forEach(sec => sec.items.forEach(it =>
          U.qsa(`input[name="lf_${it.key}"]`, bodyEl).forEach(r =>
            r.onchange = () => { S.life[it.key] = parseInt(r.value, 10); saveDraft(); liveLife(); })));
        liveSarcF(); liveLife();
      }

      if (k === 7) {
        const sw = U.qs('#btn-switch-prefer', bodyEl);
        if (sw) sw.onclick = () => {
          S.forcePrefer = (S.forcePrefer || currentPrefer()) === 'home' ? 'device' : 'home';
          saveDraft(); render();
          U.toast('已切换首选方案为「' + (S.forcePrefer === 'home' ? '老年徒手训练' : '鹊动设备训练') + '」', 'success');
        };
        const pp = U.qs('#btn-print-preview', bodyEl);
        if (pp) pp.onclick = () => printSarc(buildRecord(compute()));
      }

      if (k === 8) {
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
        strength: st, scene: S.scene, hasDevice: S.hasDevice,
        gender: base.gender, age: base.age
      };
    }
    function compute() {
      const R = E().computeAll(draftForCompute(), base);
      if (S.forcePrefer) R.plan.prefer.prefer = S.forcePrefer;
      return R;
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
          body: { ...S.body }, sarcf: { ...S.sarcf }, life: { ...S.life }, contra: { ...S.contra }
        },
        reportFile: S.reportFile || null,
        reviewDate: S.reviewDate || R.plan.reviewDate,
        note: S.note || '',
        result: R
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

    prevBtn.onclick = () => { if (S.step > 1) { S.step--; render(); } };
    nextBtn.onclick = () => {
      if (S.step === 8) {
        if (!S.saved) { U.toast('请先点击「归档并纳入台账」保存本次评估', 'warning'); return; }
        D().clearDraft();
        location.hash = '#/sarcopenia';
        return;
      }
      if (!canNext()) return;
      S.step++;
      render();
    };

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
  window.buildSarcReport = function (rec) {
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

    return `<div class="report-doc" data-scope="sarcopenia">
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

      ${sec('一、受评人基础信息', '🪪', `<div class="report-meta-grid">
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

      ${sec('二、核心客观指标解读', '📐', `
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

      ${sec('三、SPPB 躯体功能综合评估', '🚶', R.sppb ? `
        <table class="data-table" style="width:100%;">
          <thead><tr><th>测评项目</th><th>实测结果</th><th style="width:120px;">得分</th></tr></thead>
          <tbody>${R.sppb.parts.map(p => `<tr><td><b>${U.esc(p.name)}</b></td><td>${U.esc(p.detail)}</td>
            <td>${p.score == null ? '未计分' : p.score + ' / ' + p.max}</td></tr>`).join('')}
            <tr><td colspan="2" style="text-align:right;"><b>SPPB 总分</b></td>
              <td><b>${R.sppb.total} / 12</b></td></tr></tbody></table>
        <p style="margin-top:12px;">${chip(R.sppb.level, R.sppb.label)} ${U.esc(R.sppb.desc)}</p>` : '')}

      ${sec('四、CFS 衰弱分级与专项问卷', '🧭', `
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
          </tbody></table>
        ${R.life ? `<p style="margin-top:12px;"><b>五维度诱因分布：</b>
          ${R.life.sections.map(s => `${U.esc(s.title)} ${s.score}/${s.max}（${U.esc(s.label)}）`).join('　·　')}</p>` : ''}`)}

      ${sec('五、老年跌倒风险指数（加权运算）', '⚖️', f.dims ? `
        <p style="font-size:15px;"><b>跌倒风险指数：${f.index} / 100 分</b>　${chip(f.color, f.level)}</p>
        <p style="margin-top:8px;">${U.esc(f.advice)}</p>
        <table class="data-table" style="width:100%;margin-top:12px;">
          <thead><tr><th>加权维度</th><th style="width:70px;">权重</th><th style="width:80px;">维度分</th>
            <th style="width:80px;">加权分</th><th>数据来源</th></tr></thead>
          <tbody>${f.dims.map(x => `<tr><td><b>${U.esc(x.name)}</b></td><td>${Math.round(x.weight * 100)}%</td>
            <td>${x.sub}</td><td><b>${(x.sub * x.weight).toFixed(1)}</b></td>
            <td style="font-size:12px;">${U.esc(x.source)}</td></tr>`).join('')}</tbody></table>` : '')}

      ${sec('六、综合判定结论', '🎯', `
        <div class="report-ex-card"><b>肌少症风险等级</b><p>${U.esc(d.sarcGrade || '—')} —— ${U.esc(d.sarcGradeDesc || '')}</p></div>
        <div class="report-ex-card"><b>基础干预方向</b><p>${U.esc(d.no || '')} ${U.esc(d.full || '—')}<br>
          ${U.esc((plan && plan.goal) || '')}</p></div>
        <div class="report-ex-card"><b>判定依据</b><p>${(d.reasons || []).map(x => U.esc(x)).join('；')}</p></div>`)}

      ${sec('七、个性化运动干预方案（双版本）', '🏃', plan.home ? `
        <p><b>系统首选：</b>${plan.prefer && plan.prefer.prefer === 'home' ? '老年徒手训练方案（居家零设备）' : '鹊动设备训练方案（机构量化）'}
        　<b>推荐依据：</b>${U.esc(((plan.prefer || {})[plan.prefer && plan.prefer.prefer === 'home' ? 'homeReasons' : 'deviceReasons'] || []).join('、'))}</p>
        ${[['A. ' + plan.home.title, plan.home], ['B. ' + plan.device.title, plan.device]].map(([t, p]) => `
          <div class="report-ex-card"><b>${U.esc(t)}</b>
            <p><b>目标：</b>${U.esc(p.goalText)}<br>
            <b>频次：</b>${U.esc(p.freq || '')}<br>
            <b>强度：</b>${U.esc(p.intensity || '')}<br>
            <b>${p.devices ? '适配设备' : '动作库'}：</b>${(p.devices || p.actions || []).map(a => U.esc(Array.isArray(a) ? a[0] : a)).join('、')}<br>
            <b>专属规则：</b>${(p.rules || []).map(x => U.esc(x)).join('；')}</p></div>`).join('')}
        <div class="report-ex-card"><b>有氧安排</b><p>${U.esc(plan.aerobic || '')}</p></div>
        <div class="report-ex-card"><b>双方案统一适配原则</b><p>${(plan.principles || []).map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sec('八、独立跌倒预防专项方案', '🛡️', plan.fall ? `
        <p><b>执行等级：</b>${U.esc(plan.fall.level)}（指数 ${plan.fall.index} 分）　
        <b>频次：</b>${U.esc(plan.fall.tier.freq)}　<b>目标：</b>${U.esc(plan.fall.tier.aim)}</p>
        ${plan.fall.priority ? '<p style="color:#dc2626;"><b>⚠️ 高风险人群，须优先执行跌倒预防方案，风险下降后再叠加增肌 / 减脂训练。</b></p>' : ''}
        <div class="report-ex-card"><b>${U.esc(plan.fall.home.title)}</b>
          <p><b>目标：</b>${U.esc(plan.fall.home.goalText)}<br><b>单次时长：</b>${U.esc(plan.fall.home.duration)}<br>
          <b>动作库：</b>${plan.fall.home.actions.map(a => U.esc(a[0] + '（' + a[1] + '）')).join('；')}<br>
          <b>训练禁忌：</b>${plan.fall.home.taboo.map(x => U.esc(x)).join('；')}</p></div>
        <div class="report-ex-card"><b>${U.esc(plan.fall.device.title)}</b>
          <p><b>目标：</b>${U.esc(plan.fall.device.goalText)}<br><b>频次：</b>${U.esc(plan.fall.device.duration)}<br>
          <b>适配设备：</b>${plan.fall.device.devices.map(x => U.esc(x)).join('、')}<br>
          <b>训练逻辑：</b>${plan.fall.device.actions.map(a => U.esc(a[0] + '（' + a[1] + '）')).join('；')}<br>
          <b>安全机制：</b>${plan.fall.device.safety.map(x => U.esc(x)).join('、')}</p></div>
        <div class="report-ex-card"><b>跌倒预防专属生活方式干预</b>
          <p>${plan.fall.lifestyle.map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sec('九、饮食营养与生活方式干预', '🍽️', plan.diet ? `
        <table class="data-table" style="width:100%;">
          <thead><tr><th style="width:180px;">维度</th><th>执行标准</th></tr></thead>
          <tbody>${plan.diet.map(x => `<tr><td><b>${U.esc(x[0])}</b></td><td>${U.esc(x[1])}</td></tr>`).join('')}</tbody></table>
        <div class="report-ex-card" style="margin-top:12px;"><b>生活方式干预</b>
          <p>${(plan.lifestyle || []).map(x => U.esc(x)).join('；')}</p></div>` : '')}

      ${sec('十、复查与随访安排', '📅', `
        <p><b>建议复查日期：</b>${U.esc(rec.reviewDate || plan.reviewDate || '—')}
        （间隔 ${plan.reviewDays || 90} 天）</p>
        <p style="margin-top:8px;"><b>复查项目：</b>小腿围、握力、4 米步速、体成分（SMI / 体脂率 / 内脏脂肪）、SPPB 躯体功能、CFS 衰弱分级、SARC-F 问卷。</p>
        <p style="margin-top:8px;"><b>随访要点：</b>对比历次骨骼肌量与体脂变化趋势，评估跌倒风险指数下降幅度，动态调整训练重心与负荷。</p>
        ${rec.note ? `<p style="margin-top:8px;"><b>咨询师备注：</b>${U.esc(rec.note)}</p>` : ''}`)}

      <div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>
      <div class="report-footer">本报告依据《中国老年肌少症诊疗指南》《老年衰弱与肌少症评估规范》生成，属老年人体重管理 &amp; 肌少症专项独立模块输出，仅供临床参考。</div>
    </div>`;
  };

  function printSarc(rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    stage.innerHTML = window.buildSarcReport(rec);
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }

  /* ==================================================================
   * 页面三：独立数据统计台账
   * ================================================================== */
  Pages.sarcopeniaStats = function () {
    const all = D().list();
    const patients = AppState.patients || [];
    const nameOf = (pid) => {
      const p = patients.find(x => String(x.id) === String(pid));
      return p ? (p.patientName || p.patientCode || pid) : pid;
    };

    const byDir = { maintain: 0, gain: 0, lose: 0, both: 0 };
    const byFall = { low: 0, mid: 0, high: 0 };
    const byGrade = {};
    let dueTotal = 0, dueDone = 0;
    const today = U.today();
    const persons = new Set();

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

    const wrap = U.el(`<div>
      ${moduleBanner()}
      <div class="sarc-stat-row">
        ${statMini('累计评估人次', all.length, '次', 'var(--primary)')}
        ${statMini('覆盖老年用户', persons.size, '人', 'var(--info)')}
        ${statMini('跌倒高风险占比', all.length ? Math.round(byFall.high / all.length * 100) + '%' : '—', '', 'var(--danger)')}
        ${statMini('复查依从率', adherence == null ? '—' : adherence + '%', '', 'var(--success)')}
      </div>

      <div class="sarc-two-col mt-3">
        <div class="card"><div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">🎯</span>干预方向分布</h3></div>
          <div class="card-body">${all.length ? barList(Object.keys(byDir).map(k => ({
            label: dirMeta[k].icon + ' ' + dirMeta[k].full, value: byDir[k], total: all.length, color: lv(dirMeta[k].color).c
          }))) : emptyBox()}</div></div>

        <div class="card"><div class="card-header">
          <h3 class="card-title"><span class="card-title-icon">⚠️</span>跌倒风险等级占比</h3></div>
          <div class="card-body">${all.length ? barList(Object.keys(fallMeta).map(k => ({
            label: fallMeta[k][0], value: byFall[k], total: all.length, color: lv(fallMeta[k][1]).c
          }))) : emptyBox()}</div></div>
      </div>

      <div class="card mt-3"><div class="card-header">
        <h3 class="card-title"><span class="card-title-icon">🧬</span>肌少症分级分布</h3></div>
        <div class="card-body">${Object.keys(byGrade).length ? barList(Object.keys(byGrade).map(k => ({
          label: k, value: byGrade[k], total: all.length, color: 'var(--primary)'
        }))) : emptyBox()}</div></div>

      <div class="card mt-3"><div class="card-header">
        <h3 class="card-title"><span class="card-title-icon">📋</span>全模块评估明细（独立台账）</h3>
        <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" id="btn-export-csv">导出 CSV</button>
          <button class="btn btn-ghost btn-sm" id="btn-export-json">导出 JSON</button>
          <button class="btn btn-ghost btn-sm" id="btn-clear-sarc" style="color:var(--danger);">清空本模块数据</button>
        </div></div>
        <div class="card-body">
          ${all.length ? `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;min-width:940px;">
            <thead><tr><th>评估编号</th><th>老人</th><th>性别/年龄</th><th>评估日期</th>
              <th>肌少症分级</th><th>干预方向</th><th>跌倒风险</th><th>SPPB</th><th>建议复查</th></tr></thead>
            <tbody>${[...all].sort((a, b) => new Date(b.assessDate) - new Date(a.assessDate)).map(r => {
              const rs = r.result || {}, dd = rs.direction || {}, ff = rs.fall || {}, sp = rs.sppb || {};
              return `<tr>
                <td><b>${U.esc(r.no || '—')}</b></td>
                <td>${U.esc(r.patientName || nameOf(r.patientId))}</td>
                <td>${r.gender === 'female' ? '女' : '男'} · ${r.age != null ? r.age : '—'}</td>
                <td>${U.esc(r.assessDate || '—')}</td>
                <td>${chip(dd.sarcGradeLevel || 'na', dd.sarcGrade || '—')}</td>
                <td>${chip(dd.color || 'na', dd.name || '—')}</td>
                <td>${chip(ff.color || 'na', (ff.index != null ? ff.index + ' · ' : '') + (ff.level || '—'))}</td>
                <td>${sp.complete ? sp.total + '/12' : '—'}</td>
                <td>${U.esc(r.reviewDate || (rs.plan && rs.plan.reviewDate) || '—')}</td></tr>`;
            }).join('')}</tbody></table></div>` : emptyBox()}
          <div style="font-size:12px;color:var(--text-muted);margin-top:12px;line-height:1.7;">
            本台账数据完全独立于生活方式干预模块，独立汇总、独立导出，不与其他模块数据合并统计。
          </div>
        </div></div>
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
      const csv = '\ufeff' + [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
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

    return wrap;
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
})();
