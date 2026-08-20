/**
 * 鹊动FAC功能评估与干预系统
 * ────────────────────────────────────────────────────────────────
 * 【独立模块】青少年脊柱健康管理（AIS 特发性脊柱侧弯） —— 页面层
 *   · Pages.spine          独立台账工作台（V-A 驾驶舱 / V-B 放射）
 *   · Pages.spineAssess    首诊登记 + 多维功能评估 + 风险分层向导
 *   · Pages.spinePlan      个性化干预方案（体态矫正 / 肌力平衡 / 平衡稳定 / 呼吸）
 *   · window.buildSpineReport  独立评估报告
 *
 * 与体重管理 / 肌少症模块完全解耦：独立菜单、独立业务数据( module:'spine' )、
 * 独立报告体系、独立干预台账，仅只读复用系统基础用户档案。
 * ────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const E = () => window.SarcEngine;
  const D = () => window.SarcDB;
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  function addDays(dstr, n) {
    const d = new Date(dstr); if (isNaN(d.getTime())) return dstr;
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ==================================================================
   * 通用 UI 小工具（§ 颜色标签：绿色正常 / 黄色偏低偏高 / 红色高风险）
   * ================================================================== */
  const LV = {
    ok: { c: 'var(--success)', bg: 'rgba(16,185,129,.12)', name: '正常' },
    warn: { c: 'var(--warning)', bg: 'rgba(245,158,11,.14)', name: '偏低/偏高' },
    bad: { c: 'var(--danger)', bg: 'rgba(239,68,68,.12)', name: '异常高风险' },
    na: { c: 'var(--text-muted)', bg: 'rgba(148,163,184,.14)', name: '未测' }
  };
  function lv(k) { return LV[k] || LV.na; }

  /* ==================================================================
   * 动作库字段兼容读写（支持旧数组 / 新对象两种结构）
   * ================================================================== */
  function aCode(a)  { return a && (a.code  || a[0] || ''); }
  function aName(a)  { return a && (a.name  || a[1] || ''); }
  function aSteps(a) { return a && (a.steps || a[2] || ''); }
  function aCautions(a) { return a && (a.cautions || a[3] || ''); }
  function aTypes(a) { return a && (a.types || a[4] || ''); }
  function aLevels(a) { return a && (a.levels || a[5] || ''); }
  function aImg(a)   { return a && (a.img || a.image || ''); }
  function aVideo(a) { return a && (a.video || ''); }
  function aDevice(a){ return a && (a.device || ''); }
  function aMediaHtml(a) {
    const img = aImg(a), video = aVideo(a);
    if (!img && !video) return '<span style="color:var(--text-muted);font-size:12px;">—</span>';
    let html = '<div class="sp-action-media">';
    if (img) html += `<img src="${U.esc(img)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
    if (video) html += `<button type="button" class="btn btn-ghost btn-xs sp-action-play" data-video="${U.esc(video)}">▶ 视频</button>`;
    html += '</div>';
    return html;
  }

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
  function statMini(label, val, unit, color) {
    return `<div class="sarc-stat">
      <div class="sarc-stat-l">${U.esc(label)}</div>
      <div class="sarc-stat-v" style="color:${color};">${U.esc(String(val))}<span>${U.esc(unit)}</span></div>
    </div>`;
  }
  function field(label, id, val, ph, type) {
    return `<div class="form-group"><label>${label}</label>
      <input type="${type || 'text'}" id="${id}" name="${id}" value="${U.esc(val == null ? '' : val)}" placeholder="${U.esc(ph || '')}"></div>`;
  }
  function radio(name, val, opts) {
    return `<div class="radio-group">${opts.map(o => `<label class="radio-item">
      <input type="radio" name="${name}" value="${o[1]}" ${String(val) === String(o[1]) ? 'checked' : ''}><span>${U.esc(o[0])}</span></label>`).join('')}</div>`;
  }
  function moduleBanner() {
    return `<div class="sarc-banner">
      <div class="sarc-banner-ico">🦴</div>
      <div>
        <h3>青少年脊柱健康管理（AIS 特发性脊柱侧弯）专项模块</h3>
        <p>系统平行独立核心模块 · 覆盖首诊登记（含影像学放射学基线）→ 标准化问卷 → 多维度功能评估（体态 / 足底压力 / 肌力平衡步态）→ 风险分层 → 个性化方案 → 随访管理完整业务链路；PDF 报告 OCR / AI 辅助解析回填为可选辅助手段，不阻断主流程。</p>
        <div class="sarc-banner-tags">
          <span>独立菜单</span><span>独立业务数据</span><span>独立首诊登记</span><span>独立报告</span><span>离线兜底</span>
        </div>
      </div>
    </div>`;
  }

  /* ==================================================================
   * 数据读取：本模块独立台账（module:'spine'）
   * ================================================================== */
  function spineRecords() { return (D().list() || []).filter(r => r.module === 'spine'); }
  function spinePatientIds() {
    const ids = {};
    spineRecords().forEach(r => { if (r.patientId) ids[r.patientId] = 1; });
    Object.keys((D().listPatients() || []).reduce((m, p) => { if (p.spine) m[p.id] = 1; return m; }, {})).forEach(id => { ids[id] = 1; });
    return Object.keys(ids);
  }
  function latestCobb(pid) {
    const recs = D().listByPatient(pid).filter(r => r.module === 'spine' && r.base && num(r.base.staticCobb) != null);
    if (!recs.length) { const p = D().getPatient(pid); return (p && p.spine) ? num(p.spine.staticCobb) : null; }
    return num(recs.slice().sort((a, b) => new Date(b.assessDate) - new Date(a.assessDate))[0].base.staticCobb);
  }

  /* ==================================================================
   * 页面一：独立台账工作台（V-A 驾驶舱 / V-B 放射）
   * ================================================================== */
  function computeSpinePatientView() {
    return spinePatientIds().map(id => {
      const p = D().getPatient(id);
      if (!p) return null;
      const recs = D().listByPatient(id).filter(r => r.module === 'spine').sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0));
      const latest = recs[0] || null;
      const rs = latest ? (latest.result || {}) : {};
      const base = latest ? (latest.base || {}) : {};
      const risk = rs.risk || 'low';
      const riskLabel = risk === 'high' ? '高风险' : risk === 'mid' ? '中风险' : '低风险';
      const h = num(p.height), w = num(p.weight);
      const bmi = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : null;
      const cobb = (p.spine && p.spine.staticCobb != null) ? p.spine.staticCobb : (base.staticCobb != null ? base.staticCobb : null);
      const lenke = base.lenke || (p.spine ? p.spine.lenke : '') || '';
      const cells = [
        { k: 'Cobb 角', v: cobb != null ? cobb + '°' : '—' },
        { k: 'Lenke 分型', v: lenke || '—' },
        { k: '已评估', v: recs.length + ' 次' },
        { k: '建议复查', v: rs.reviewDate || '—' }
      ];
      const parts = ['<b>风险等级：</b>' + riskLabel];
      if (rs.atrThMain != null) parts.push('<b>ATR(主弯)：</b>' + rs.atrThMain + '°');
      if (rs.reviewDate) parts.push('<b>建议复查：</b>' + rs.reviewDate);
      return { id: id, name: p.name || '未命名', gender: p.gender === 'female' ? '女' : '男', age: p.age != null ? p.age : '', risk: risk, riskLabel: riskLabel, cells: cells, adviceHtml: parts.join('<br>'), icon: '🦴' };
    }).filter(Boolean);
  }

  Pages.spine = function () {
    const recs = spineRecords();
    const pids = spinePatientIds();
    const patients = pids.map(id => D().getPatient(id)).filter(Boolean);
    const focusId = AppState.spineFocusId || (pids.length ? pids[0] : null);
    const focusRecords = focusId ? D().listByPatient(focusId).filter(r => r.module === 'spine') : [];
    const focusName = (D().getPatient(focusId) || {}).name || '';

    // ── 同款布局：标题栏 / 患者左右结构（3D 轮播 + 详情） / 训练执行 + 复测 左右并排 / 今日待办抽屉 ──
    const titleBar = `<div class="ledger-titlebar lt-spine">
      <button class="btn btn-primary lt-cta lt-cta-left" id="btn-new-reg">＋ 新建首诊登记</button>
      <div class="lt-brand"><span class="lt-ico">🦴</span><div class="lt-text"><h1>青少年脊柱健康台账</h1><span class="lt-sub">独立档案 · <b>${patients.length} 位在管</b></span></div></div>
    </div>`;

    const ptCardHost = `<div class="card mt-3 pt-card-host">
      <div class="card-header"><h3 class="card-title"><span class="card-title-icon">🪪</span>脊柱健康首诊登记名册（独立档案）</h3>
        <span class="badge badge-info" id="sp-count">${patients.length} 位在管</span></div>
      <div class="card-body pt-body-v">
        <div class="pt-mid">
          <div class="portal-stage pt-stage" id="sp-stage">
            <div class="portal-track" id="sp-track"></div>
            <div class="portal-navgroup">
              <button class="portal-nav prev" id="sp-prev" aria-label="上一位">‹</button>
              <button class="portal-nav next" id="sp-next" aria-label="下一位">›</button>
            </div>
          </div>
          <div class="pt-detail">
            <div class="pt-detail-top">
              <div class="pt-d-av" id="sp-d-av">—</div>
              <div><div class="pt-d-name" id="sp-d-name">—</div><div class="pt-d-sub" id="sp-d-sub"></div></div>
              <span class="badge pt-risk-pill" id="sp-d-riskpill"></span>
            </div>
            <div class="pt-grid" id="sp-d-grid"></div>
            <div class="pt-ai" id="sp-d-advice"></div>
            <div class="pt-actions">
              <button class="btn btn-primary btn-sm" id="sp-open">📋 调阅档案</button>
              <button class="btn btn-sm" id="sp-assess">进入评估</button>
              <button class="btn btn-ghost btn-sm" id="sp-edit">编辑档案</button>
              <button class="btn btn-ghost btn-sm" id="sp-del" style="color:var(--danger)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    // 工作流卡片（WF / ledgerCard / trendCard / emptyCard）已移除：
    // 台账只保留「患者左右结构（3D 轮播 + 详情）」+ 「训练执行 / 复测 左右并排」 + 「今日待办（悬浮抽屉）」

    const execCard = (window.TrainingExecution && window.TrainingExecution.ledgerCard) ? window.TrainingExecution.ledgerCard('spine') : '';

    const reminders = [];
    patients.forEach(p => {
      const prcs = D().listByPatient(p.id).filter(r => r.module === 'spine').sort((a, b) => new Date(b.assessDate || 0) - new Date(a.assessDate || 0));
      const latest = prcs[0];
      if (latest && latest.result && latest.result.reviewDate) {
        const days = U.daysBetween(latest.result.reviewDate, new Date());
        if (days <= 30) reminders.push({ name: p.name, id: p.id, date: latest.result.reviewDate, days });
      }
    });
    const remCard = reminders.length ? `<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">⏰</span>周期复测提醒</h3><span class="badge badge-warning">${reminders.length} 位登记人临期</span></div>
      <div class="card-body"><div class="table-wrap"><table>
        <thead><tr><th>登记人</th><th>建议复查日期</th><th>剩余天数</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>${reminders.map(r => `<tr><td><strong>${U.esc(r.name)}</strong></td><td>${U.esc(r.date)}</td><td>${r.days} 天</td>
          <td>${r.days <= 0 ? '<span class="badge badge-danger">已到复查</span>' : '<span class="badge badge-warning">临近复查</span>'}</td>
          <td><button class="btn btn-sm btn-primary sp-rem-btn" data-id="${r.id}">进入评估</button></td></tr>`).join('')}</tbody>
      </table></div></div></div>` : '';

    const todoHtml = (typeof ttCard === 'function') ? ttCard('spine') : (window.ttCard ? window.ttCard('spine') : '');
    const todoCount = 0; // TodayTodo 暂未实现 buildSpine，优雅降级为空态
    const todoDrawer = todoHtml ? '<div class="lw-todo-pop" id="lw-todo-pop"><div class="lw-todo-backdrop" id="lw-todo-backdrop"></div><div class="lw-todo-panel" id="lw-todo-panel"><button type="button" class="lw-todo-close" id="lw-todo-close" aria-label="关闭">✕</button>' + todoHtml + '</div></div>' : '';
    const todoFab = `<button type="button" class="lw-todo-fab" id="lw-todo-fab" title="今日待办" aria-label="今日待办"><span class="lw-todo-ico">📌</span>${todoCount ? '<span class="lw-todo-badge">' + todoCount + '</span>' : ''}</button>`;

    // 底部左右并排：训练执行记录 + 周期复测提醒
    const bottomCards = [execCard, remCard].filter(Boolean).join('');
    const bottomRowHtml = bottomCards ? '<div class="lw-bottom-row">' + bottomCards + '</div>' : '';

    const wrap = U.el(`<div class="ledger-spine-wrap">
      ${titleBar}
      <div class="lw-top">${ptCardHost}</div>
      ${bottomRowHtml}
      ${todoDrawer}${todoFab}
    </div>`);

    const btnNew = U.qs('#btn-new-spine', wrap);
    if (btnNew) btnNew.onclick = () => {
      if (!patients.length) { U.toast('请先创建首诊登记', 'warning'); return; }
      startSpineAssess(focusId || patients[0].id);
    };
    const btnReg = U.qs('#btn-new-reg', wrap);
    const btnReg2 = U.qs('#btn-new-reg2', wrap);
    if (btnReg) btnReg.onclick = () => openSpineRegister();
    if (btnReg2) btnReg2.onclick = () => openSpineRegister();

    setTimeout(() => { try {
      window.initRegistryCarousel({
        trackId: 'sp-track', stageId: 'sp-stage', prefix: 'sp', view: computeSpinePatientView(),
        emptyText: '暂无首诊登记，点击上方「新建首诊登记」创建',
        onOpen: (id) => { openSpineRegister(D().getPatient(id)); },
        onAssess: (id) => { startSpineAssess(id); },
        onEdit: (id) => { openSpineRegister(D().getPatient(id)); },
        onDel: (id) => { U.confirm('确认删除该首诊登记档案？其名下评估记录仍保留在台账中，可单独删除。', () => { D().removePatient(id); U.toast('已删除登记档案', 'success'); Pages.spine(); }); }
      });
    } catch (e) { console.error('脊柱轮播初始化失败', e); } }, 90);

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

    U.qsa('.sp-rem-btn', wrap).forEach(b => b.onclick = () => startSpineAssess(b.dataset.id));

    bindSpineLedger(wrap, recs);
    return wrap;
  };


  function spineLedgerHTML(records) {
    if (!records.length) {
      return `<div class="sarc-empty">
        <div style="font-size:44px;">🗂️</div>
        <p><b>暂无青少年脊柱健康评估记录</b></p>
        <p style="font-size:13px;color:var(--text-muted);">点击右上角「新建脊柱评估」，完成首诊登记基线 + 多维功能评估 + 风险分层。</p>
      </div>`;
    }
    return `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;min-width:1040px;">
      <thead><tr>
        <th>登记人</th><th>评估编号</th><th>评估日期</th><th>Cobb 角</th><th>Lenke 分型</th>
        <th>风险等级</th><th>ATR(主弯)</th><th>建议复查</th><th style="width:200px;">操作</th>
      </tr></thead>
      <tbody>${records.map(r => {
        const rs = r.result || {}, base = r.base || {}, ev = r.eval || {};
        const riskLv = rs.risk === 'high' ? 'bad' : rs.risk === 'mid' ? 'warn' : 'ok';
        const riskName = rs.risk === 'high' ? '高风险' : rs.risk === 'mid' ? '中风险' : '低风险';
        return `<tr>
          <td><b>${U.esc(r.patientName || '—')}</b></td>
          <td><b>${U.esc(r.no || '—')}</b></td>
          <td>${U.esc(r.assessDate || '—')}</td>
          <td>${base.staticCobb != null ? base.staticCobb + '°' : '—'}</td>
          <td>${U.esc(base.lenke || '—')}</td>
          <td>${chip(riskLv, riskName)}</td>
          <td>${ev.atrThMain != null ? ev.atrThMain + '°' : '—'}</td>
          <td>${rs.reviewDate ? U.esc(rs.reviewDate) : '—'}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm spine-view" data-id="${U.esc(r.id)}">查看报告</button>
            <button class="btn btn-ghost btn-sm spine-print" data-id="${U.esc(r.id)}">打印</button>
            <button class="btn btn-ghost btn-sm spine-del" data-id="${U.esc(r.id)}" style="color:var(--danger);">删除</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function spineTrendHTML(records) {
    const asc = [...records].sort((a, b) => new Date(a.assessDate) - new Date(b.assessDate));
    const rows = [
      ['Cobb 角 (°)', r => num((r.base || {}).staticCobb)],
      ['ATR 主弯 (°)', r => num((r.eval || {}).atrThMain)],
      ['握力 LSI (%)', r => num((r.eval || {}).gripLSI)],
      ['闭眼单脚站立 (s)', r => num((r.eval || {}).balanceClosed)]
    ];
    const better = { 'Cobb 角 (°)': -1, 'ATR 主弯 (°)': -1, '握力 LSI (%)': 1, '闭眼单脚站立 (s)': 1 };
    return `<div style="overflow-x:auto;"><table class="data-table" style="width:100%;min-width:640px;">
      <thead><tr><th>指标</th>${asc.map(r => `<th>${U.esc(r.assessDate || '')}</th>`).join('')}<th>趋势</th></tr></thead>
      <tbody>${rows.map(([name, fn]) => {
        const vals = asc.map(fn);
        const first = vals.find(v => v != null);
        const last = vals.filter(v => v != null).slice(-1)[0];
        let delta = '<span style="color:var(--text-muted);">—</span>';
        if (first != null && last != null && vals.filter(v => v != null).length >= 2) {
          const d = U.round(last - first, 2); const dir = better[name] || 1;
          const good = d * dir > 0; const flat = Math.abs(d) < 1e-9;
          const col = flat ? 'var(--text-muted)' : (good ? 'var(--success)' : 'var(--danger)');
          delta = `<b style="color:${col};">${flat ? '持平' : (d > 0 ? '▲ +' + d : '▼ ' + d)}</b>`;
        }
        return `<tr><td><b>${U.esc(name)}</b></td>${vals.map(v => `<td>${v == null ? '—' : v}</td>`).join('')}<td>${delta}</td></tr>`;
      }).join('')}</tbody></table></div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:10px;line-height:1.7;">趋势对比数据仅取自本模块独立台账，不与其它模块合并统计。</div>`;
  }

  function bindSpineLedger(root, records) {
    U.qsa('.spine-view', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id);
      if (!rec) return U.toast('记录不存在', 'error');
      U.modal({
        title: `青少年脊柱健康评估报告 · ${rec.no}`, width: '1080px',
        body: `<div style="max-height:70vh;overflow:auto;">${window.buildSpineReport(rec)}</div>`,
        footer: `<button class="btn btn-ghost" data-close>关闭</button>
                 <button class="btn btn-primary" id="m-print-spine">打印 / 导出</button>`,
        onMount: (m) => { const pb = U.qs('#m-print-spine', m); if (pb) pb.onclick = () => printSpine(rec); }
      });
    });
    U.qsa('.spine-print', root).forEach(b => b.onclick = () => { const rec = D().byId(b.dataset.id); if (rec) printSpine(rec); });
    U.qsa('.spine-del', root).forEach(b => b.onclick = () => {
      const rec = D().byId(b.dataset.id); if (!rec) return;
      U.confirm(`确认删除评估记录「${rec.no}」？该操作不可恢复。`, async () => {
        if (typeof D().deleteReportFile === 'function') { try { await D().deleteReportFile(rec.id); } catch (e) {} }
        D().remove(rec.id); U.toast('评估记录已删除', 'success'); route();
      });
    });
  }
  function printSpine(rec) {
    const w = window.open('', '_blank');
    if (!w) { U.toast('浏览器拦截了打印窗口，请允许弹窗', 'warning'); return; }
    const head = '<!doctype html><html><head><meta charset="utf-8"><title>脊柱健康评估报告 ' + U.esc(rec.no || '') + '</title>'
      + '<style>body{font-family:system-ui,"Microsoft YaHei",sans-serif;padding:32px;color:#1f2937;line-height:1.7}'
      + 'h1{font-size:22px;border-bottom:3px solid #26c6da;padding-bottom:10px}table{width:100%;border-collapse:collapse;margin:14px 0}'
      + 'td,th{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;font-size:13px}@media print{body{padding:0}}</style></head><body>';
    w.document.write(head + window.buildSpineReport(rec) + '</body></html>');
    w.document.close(); setTimeout(() => w.print(), 350);
  }

  /* ==================================================================
   * 首诊登记（含影像学放射学基线）
   * ================================================================== */
  function openSpineRegister(prefill) {
    const p = prefill || {};
    const sp = p.spine || {};
    const html = `<form id="sp-reg-form" style="font-size:14px;">
      <div class="sarc-sub-h">一、基础身份与体格</div>
      <div class="form-grid">
        ${field('姓名 <span class="required">*</span>', 'r-name', p.name, '如 李明')}
        <div class="form-group"><label>性别</label>${radio('r-gender', p.gender || 'female', [['男', 'male'], ['女', 'female']])}</div>
        ${field('年龄（岁）', 'r-age', p.age, '如 14')}
        ${field('身高（cm）', 'r-height', p.height, '如 162')}
        ${field('体重（kg）', 'r-weight', p.weight, '如 48')}
        <div class="form-group"><label>BMI（自动计算）</label><input type="text" id="r-bmi" readonly placeholder="录入身高体重后自动计算"></div>
        ${field('联系电话', 'r-phone', p.phone, '选填')}
        <div class="form-group"><label>就诊类型</label>${radio('r-visit', sp.visitType || 'screen', [['初筛', 'screen'], ['康复随访', 'follow'], ['术前评估', 'pre']])}</div>
      </div>
      <div class="sarc-sub-h" style="margin-top:18px;">二、生长发育史（进展风险核心）</div>
      <div class="form-grid">
        ${field('初潮年龄（女，岁，选填）', 'r-mena', sp.menarcheAge, '未初潮留空')}
        ${field('Tanner 分级（男）', 'r-tanner', sp.tanner, '1-5')}
        ${field('Risser 征（骨龄）', 'r-risser', sp.risser, '0-5')}
        ${field('身高峰值速度 PHV', 'r-phv', sp.phv, '未达/达峰/已过')}
      </div>
      <div class="sarc-sub-h" style="margin-top:18px;">三、侧弯基础病史</div>
      <div class="form-grid">
        ${field('初次发现 Cobb 角（°）', 'r-initCobb', sp.initialCobb, '选填')}
        ${field('年度角度进展（°/年）', 'r-prog', sp.progressPerYear, '≥5 自动标记高危')}
        ${field('家族史（一级亲属侧弯）', 'r-family', sp.family, '如 母亲侧弯')}
      </div>
      <div class="sarc-sub-h" style="margin-top:18px;">四、影像学放射学基线（条件必填）</div>
      <div class="form-grid">
        ${field('静态 X 线主弯 Cobb 角（°）', 'r-staticCobb', sp.staticCobb, '唯一参与风险分层的 Cobb')}
        ${field('弯曲分型 Lenke', 'r-lenke', sp.lenke, '如 Lenke 1AN')}
        ${field('顶椎位置', 'r-apex', sp.apex, '如 T8')}
        ${field('Nash-Moe 椎体旋转', 'r-nm', sp.nashMoe, '0-4 级')}
        ${field('肋椎角差 RVAD（°）', 'r-rvad', sp.rvad, '选填')}
        ${field('肋骨外展距离 RFD（mm）', 'r-rfd', sp.rfd, '选填')}
        ${field('躯干偏移 SSVA（mm）', 'r-ssva', sp.ssva, '选填')}
        ${field('侧弯左右侧屈矫正率（%）', 'r-correction', sp.cobbCorrectionRate, '＜30% 标记胸廓僵硬')}
      </div>
      <div class="sarc-sub-h" style="margin-top:18px;">五、躯体症状与心肺主诉</div>
      <div class="form-grid">
        ${field('既往疼痛 VAS（0-10）', 'r-vas', sp.vasPain, '选填')}
        ${field('疼痛性质', 'r-painNature', sp.painNature, '选填')}
        ${field('胸廓外观异常', 'r-thorax', sp.thoraxAbnormal, '选填')}
        ${field('神经红 flag 体征', 'r-redflag', sp.redFlag, '选填')}
      </div>
    </form>`;
    U.modal({
      title: prefill && prefill.id ? '编辑脊柱健康首诊登记' : '新建青少年脊柱健康首诊登记',
      body: html, width: 820,
      footer: `<button class="btn btn-ghost" data-act="cancel">取消</button>
               <button class="btn btn-primary" data-act="save">${prefill && prefill.id ? '保存修改' : '创建登记并进入评估'}</button>`,
      onMount(overlay, close) {
        const form = overlay.querySelector('#sp-reg-form');
        const calcBmi = () => {
          const h = num(form.querySelector('[name=r-height]').value);
          const w = num(form.querySelector('[name=r-weight]').value);
          form.querySelector('#r-bmi').value = (h && w) ? U.round(w / Math.pow(h / 100, 2), 1) : '';
        };
        form.querySelector('[name=r-height]').addEventListener('input', calcBmi);
        form.querySelector('[name=r-weight]').addEventListener('input', calcBmi);
        U.bindChoiceStyle(overlay); calcBmi();
        overlay.querySelector('[data-act=save]').onclick = () => {
          const fd = U.formData(form);
          if (!fd['r-name']) { U.toast('请填写姓名', 'warning'); return; }
          const rec = {
            id: prefill && prefill.id ? prefill.id : undefined,
            name: fd['r-name'], gender: fd['r-gender'] || 'female', age: num(fd['r-age']),
            height: num(fd['r-height']), weight: num(fd['r-weight']), phone: fd['r-phone'] || '',
            spine: {
              visitType: fd['r-visit'], menarcheAge: num(fd['r-mena']), tanner: fd['r-tanner'],
              risser: num(fd['r-risser']), phv: fd['r-phv'], initialCobb: num(fd['r-initCobb']),
              staticCobb: num(fd['r-staticCobb']),
              progressPerYear: num(fd['r-prog']), family: fd['r-family'] || '',
              lenke: fd['r-lenke'] || '', apex: fd['r-apex'] || '', nashMoe: num(fd['r-nm']),
              rvad: num(fd['r-rvad']), rfd: num(fd['r-rfd']), ssva: num(fd['r-ssva']),
              cobbCorrectionRate: num(fd['r-correction']),
              vasPain: num(fd['r-vas']), painNature: fd['r-painNature'] || '',
              thoraxAbnormal: fd['r-thorax'] || '', redFlag: fd['r-redflag'] || ''
            }
          };
          const saved = D().savePatient(rec);
          close();
          if (prefill && prefill.id) { U.toast('首诊登记档案已更新', 'success'); Pages.spine(); }
          else { U.toast('首诊登记已创建', 'success'); startSpineAssess(saved.id); }
        };
      }
    });
  }

  function startSpineAssess(pid) {
    AppState.spineFocusId = pid;
    location.hash = '#/spine-assess';
  }

  /* AI 能力是否开通（与体重/肌少症单元门控一致） */
  function spineAiReady() { return !!(window.AIReason && window.AIReason.aiEnabled && window.AIReason.aiEnabled()); }

  /* ==================================================================
   * 参考建议弹窗（全屏，医生手动开启）
   * ⚠️ 内容为系统内置参考（演示），由本地规则生成，非 AI 实时解读。
   *    真实 AI 解读请在「AI 解读报告」中点击「重新生成」获取。
   * ================================================================== */
  function openAiModal(type, S) {
    const R = S.result || computeSpineRisk(S);
    const isRisk = type === 'risk';
    const title = (isRisk ? '🤖 风险分层参考' : '🤖 干预方案参考') + '（系统内置·演示）';
    const levelDesc = R.risk === 'high' ? '高风险：Cobb 角较大或进展迅速，建议 2-3 个月复查，必要时转诊支具/手术评估。' :
      R.risk === 'mid' ? '中风险：处于观察与干预交界，建议 4 个月复查并介入体态矫正与肌力平衡训练。' :
      '低风险：以观察与基础干预为主，建议 6 个月复查，配合居家体态训练。';
    const reasons = (R.reasons || []).length ? '<ul>' + R.reasons.map(r => '<li>' + U.esc(r) + '</li>').join('') + '</ul>' : '<p>暂无额外修正因子。</p>';
    const planItems = R.risk === 'high'
      ? ['禁止高强度肌力强化', '以呼吸训练与轻柔拉伸为主', '建议支具科/脊柱外科会诊', '每 2-3 个月复查站立位全长 X 线']
      : R.risk === 'mid'
        ? ['体态矫正 2-3 个动作（弱侧强化）', '肌力平衡训练（侧卧抬腿、弹力带划船）', '平衡稳定训练（单脚站立、平衡垫）', '4 个月复查 Cobb 角与体态照片']
        : ['体态自我监测（每日 5 分钟）', '基础平衡训练（每周 3 次）', '呼吸功能训练', '6 个月常规复查'];
    const demoBanner = '<div class="sp-demo-banner">📌 以下为<b>系统内置参考建议（演示）</b>，由本地规则生成，<b>非 AI 实时解读</b>。开通 AI 解读能力后，可在「AI 解读报告」中点击「重新生成」获取 AI 生成内容。</div>';
    const body = isRisk
      ? demoBanner + `<div class="ai-gen-body">
          <div class="ai-gen-sec"><h4>📊 数据摘要</h4><p>患者 <b>${U.esc(S.base.name || '—')}</b>，Cobb 角 <b>${S.base.staticCobb != null ? S.base.staticCobb + '°' : '—'}</b>，Risser <b>${S.base.risser != null ? S.base.risser : '—'}</b>，当前风险等级 <b>${U.esc(R.riskName)}</b>。</p></div>
          <div class="ai-gen-sec"><h4>🧠 AI 解读</h4><p>${U.esc(levelDesc)}</p></div>
          <div class="ai-gen-sec"><h4>⚠️ 判定依据与需关注项</h4>${reasons}</div>
          <div class="ai-gen-sec"><h4>💡 后续建议</h4><p>AI 建议结合临床查体与影像趋势综合决策；本解读仅供参考，最终方案由医生确认。</p></div>
        </div>`
      : demoBanner + `<div class="ai-gen-body">
          <div class="ai-gen-sec"><h4>🎯 方案目标</h4><p>针对 <b>${U.esc(R.riskName)}</b>，以延缓侧弯进展、改善体态对称、维持心肺功能为核心目标。</p></div>
          <div class="ai-gen-sec"><h4>📋 推荐动作与周期</h4><ol>${planItems.map(it => '<li>' + U.esc(it) + '</li>').join('')}</ol></div>
          <div class="ai-gen-sec"><h4>⚠️ 禁忌与注意事项</h4><p>${R.risk === 'high' ? '高风险患者禁止自主高强度抗阻训练，所有动作需在专业人员监督下进行。' : '训练中注意骨盆中立、避免脊柱旋转代偿，出现疼痛或呼吸困难立即停止。'}</p></div>
          <div class="ai-gen-sec"><h4>📝 随访计划</h4><p>建议复查日期：<b>${U.esc(R.reviewDate || '—')}</b>（约 ${R.reviewMonths || '—'} 个月）。</p></div>
        </div>`;
    const footer = `<button class="btn btn-primary" data-act="adopt">采用为正式方案</button>
      <button class="btn btn-secondary" data-act="save">保存方案</button>
      <button class="btn btn-ghost" data-act="close">关闭</button>
      <span class="sp-demo-foot">系统内置参考 · 仅供参考</span>`;
    const m = U.modal({ title: title, body: body, footer: footer, cls: 'ai-modal-full', width: '100vw' });
    m.overlay.querySelector('[data-act=close]').onclick = m.close;
    m.overlay.querySelector('[data-act=adopt]').onclick = () => {
      S.aiAdopted = true;
      U.toast(isRisk ? 'AI 解读已采用并归档' : 'AI 方案已采用为正式方案', 'success');
      m.close();
    };
    m.overlay.querySelector('[data-act=save]').onclick = () => {
      S.aiSaved = (S.aiSaved || 0) + 1;
      U.toast('AI 方案已保存（可在台账查看）', 'success');
      m.close();
    };
  }

  /* 步骤四：AI 解读报告全屏弹窗（关闭 / 保存 / 重新生成 / 导出打印） */
  function openAiReport(S) {
    const rec = buildSpineRecord(S);
    const R = S.result || computeSpineRisk(S); S.result = R;
    const title = '🤖 鹊动小Qoo · 脊柱健康 AI 解读报告';
    const body = '<div id="sp-ai-report-body" style="max-height:72vh;overflow:auto;">' +
      (window.buildSpineReport ? window.buildSpineReport(rec) : '<div class="sarc2-ai-body">报告生成中…</div>') + '</div>';
    const footer = '<button class="btn btn-primary" data-act="regen">🔄 重新生成</button>' +
      '<button class="btn btn-secondary" data-act="export">🖨 导出打印</button>' +
      '<button class="btn btn-ghost" data-act="save">💾 保存</button>' +
      '<button class="btn btn-ghost" data-act="close">关闭</button>';
    const m = U.modal({ title: title, body: body, footer: footer, cls: 'ai-modal-full', width: '100vw' });
    const box = m.overlay.querySelector('#sp-ai-report-body');
    m.overlay.querySelector('[data-act=close]').onclick = m.close;
    m.overlay.querySelector('[data-act=save]').onclick = () => { U.toast('AI 解读报告已保存', 'success'); };
    m.overlay.querySelector('[data-act=export]').onclick = () => { try { printSpine(rec); } catch (e) { window.print(); } };
    m.overlay.querySelector('[data-act=regen]').onclick = async () => {
      if (box) box.innerHTML = '<div class="sarc2-ai-body"><span class="ai-spin"></span> 鹊动小Qoo 正在重新解读…</div>';
      try {
        if (window.AIReason && typeof window.AIReason.interpret === 'function' && window.AIReason.aiEnabled && window.AIReason.aiEnabled()) {
          const ctx = { module: 'spine-assessment-report', patient: { name: S.base.name, age: S.base.age, gender: S.base.gender }, assessment: S.eval, base: S.base, result: R };
          const res = await window.AIReason.interpret(ctx);
          const md = window.AIReason.renderMarkdown ? window.AIReason.renderMarkdown(res.reply || '') : U.esc(res.reply || '');
          if (box) box.innerHTML = '<div class="ai-md">' + md + '</div>';
        } else {
          if (box) box.innerHTML = window.buildSpineReport ? window.buildSpineReport(rec) : '<div class="sarc2-ai-body">报告生成中…</div>';
        }
        U.toast('已重新生成解读报告', 'success');
      } catch (e) {
        if (box) box.innerHTML = window.buildSpineReport ? window.buildSpineReport(rec) : '<div class="sarc2-ai-body">报告生成失败</div>';
      }
    };
  }

  /* ==================================================================
   * 页面二：首诊登记 + 多维功能评估 + 风险分层向导
   * ================================================================== */
  const SP_STEPS = [
    { n: 1, t: '首诊登记（放射学基线）', i: '🪪' },
    { n: 2, t: '多维度功能评估', i: '📐' },
    { n: 3, t: '风险分层综合判定', i: '⚖️' },
    { n: 4, t: '报告与干预方案', i: '📄' }
  ];

  Pages.spineAssess = function () {
    let pid = AppState.spineFocusId;
    /* 临时放开患者守卫：无焦点患者时注入演示基线（林雨晴·女·14），便于直接预览 3D 评估页；有真实患者时不受影响 */
    if (!pid) {
      const demoId = 'spine_demo_' + Date.now().toString(36);
      D().savePatient({ id: demoId, name: '林雨晴', gender: 'female', age: 14, height: 158, weight: 46,
        spine: { visitType: '首诊', staticCobb: 22, lenke: 'Lenke 5', risser: 3, tanner: 'Tanner 4', vasPain: 2 } });
      AppState.spineFocusId = demoId;
      pid = demoId;
    }
    const base = D().getPatient(pid);
    if (!base) return U.el(`<div class="card"><div class="card-body">患者档案不存在，请返回台账。</div></div>`);
    const reg = base.spine || {};

    const S = {
      id: 'spine_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      no: null, patientId: pid, assessDate: U.today(), step: 1,
      base: Object.assign({}, reg, { name: base.name, gender: base.gender, age: base.age, height: base.height, weight: base.weight }),
      eval: {
        shoulderDiff: '', scapulaDiff: '', waistDiff: '', iliacDiff: '', legLenDiff: '', trunkDeviation: '',
        atrThT: '', atrThMain: '', atrTl: '', atrL: '', ribHumpDiff: '', humpSide: '',
        beightonItems: {}, beighton: '', neuroWeak: '', neuroSense: '', neuroReflex: '', babinski: '', spineTender: '',
        stepAsym: '', pressureRatio: '', archType: '', cogX: '', cogY: '', footType: '', plantarDesc: '',
        eyesOpen: '', eyesClosed: '', sway: '', gaitFwd: '', gaitBack: '', gaitSpeed: '',
        gripL: '', gripR: '', gripLSI: '',
        fvc: '', fev1: '', fev1fvc: '', pef: '', mip: '', mep: '', sixMwd: '', spo2min: '',
        sr22rTotal: '', painVas: '',
        pdfParsed: false,
        plantarReport: null, deviceCapture: null
      },
      result: null, saved: false, note: ''
    };

    // 步骤2：七维度身体锚点（贴回 Body Atlas）
    const SPINE_REGIONS = [
      { id:'neuro', label:'神经系统查体', icon:'🧠', x:50, y:12, risk:'low', summary:'肌力/感觉/反射/巴氏征', render:(S)=> spRegionNeuro(S) },
      { id:'cardio', label:'心肺 & SRS-22r', icon:'🫁', x:50, y:23, risk:'low', summary:'FVC/FEV1/6MWD/疼痛VAS', render:(S)=> spRegionCardio(S) },
      { id:'posture', label:'静态体态对称', icon:'📏', x:37, y:18, risk:'mid', summary:'双肩/肩胛/腰窝/髂嵴/躯干偏移', render:(S)=> spRegionPosture(S) },
      { id:'atr', label:'Adam 前屈 ATR', icon:'🙇', x:50, y:34, risk:'mid', summary:'胸/胸腰/腰椎 ATR + 肋骨隆起', render:(S)=> spRegionATR(S) },
      { id:'beighton', label:'关节松弛 Beighton', icon:'🤸', x:66, y:36, risk:'na', summary:'9 项动作评分 0-9', render:(S)=> spRegionBeighton(S) },
      { id:'balance', label:'平衡/步速/握力', icon:'⚖️', x:50, y:60, risk:'low', summary:'单脚站立/步速/握力LSI', render:(S)=> spRegionBalance(S) },
      { id:'plantar', label:'足底压力步态', icon:'👣', x:50, y:90, risk:'na', summary:'步幅/压力比/足弓/重心', render:(S)=> spRegionPlantar(S) }
    ];

    const steps = [
      { id:1, title:'首诊登记（放射学基线）', icon:'🪪', subtitle:'源自专项档案，可修改保存', kind:'input', hint:'步骤 1 / 4 · 影像学与基本信息基线', render:(S)=> spStep1(S) },
      { id:2, title:'多维度功能评估', icon:'📐', subtitle:'点身体锚点逐项录入', kind:'input', atlas: SPINE_REGIONS, hint:'步骤 2 / 4 · 7 个身体维度', render:(S)=> '<div class="ac-tip">点击左侧身体图标或右侧区域，逐项录入多维度功能评估；每个维度对应身体的一个部位。</div>' },
      { id:3, title:'风险分层综合判定', icon:'⚖️', subtitle:'决策树 + 加权修正', kind:'compute', hint:'步骤 3 / 4 · 自动分层', render:(S)=> spStep3(S) },
      { id:4, title:'报告与干预方案', icon:'📄', subtitle:'报告预览 + 方案入口', kind:'report', hint:'步骤 4 / 4 · 归档', render:(S)=> spStep4(S) }
    ];

    const wrap = U.el(`<div>${moduleBanner()}
      <div style="margin:0 0 12px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm" id="btn-demo-spine">一键填充演示数据</button>
        <a class="btn btn-secondary btn-sm" href="#/spine">返回台账</a>
      </div></div>`);

    const cockpit = AssessCockpit({
      unit:'spine', accent:'#534AB7', unitName:'青少年脊柱健康',
      layout:'hzpath',
      atlas:{ mode:'back', frontImg:'assets/body-front.png', backImg:'assets/body-back.png' },
      state:S, steps:steps, completeLabel:'完成并归档 →',
      snapshot:{
        metrics:(S)=>{ const R=S.result||computeSpineRisk(S); const b=S.base;
          return [
            { k:'Cobb 角', v: num(b.staticCobb)!=null?num(b.staticCobb):'—', unit:'°', level: (num(b.staticCobb)>=45?'bad':num(b.staticCobb)>=25?'warn':'ok'), label: num(b.staticCobb)>=45?'重度':num(b.staticCobb)>=25?'中度':'轻度', note:'全脊柱 X 线主弯 Cobb 角' },
            { k:'风险等级', v: R.riskName, unit:'', level: R.risk==='high'?'bad':R.risk==='mid'?'warn':'ok', label: R.risk==='high'?'紧急':R.risk==='mid'?'专业':'基础', note:'综合弯型、进展与功能状态' },
            { k:'Beighton', v: S.eval.beighton||0, unit:'/9', level: (num(S.eval.beighton)>=4?'warn':'ok'), label: num(S.eval.beighton)>=4?'松弛':'正常', note:'关节松弛度 9 项评分' },
            { k:'握力 LSI', v: S.eval.gripLSI||'—', unit:'%', level: (num(S.eval.gripLSI)<80?'warn':'ok'), label: num(S.eval.gripLSI)<80?'失衡':'平衡', note:'左右手握力对称性指数' }
          ]; },
        footer:(S)=> ''
      },
      onAfterRender:(S, step, bd)=>{
        // 统一四个步骤的 stage 卡片尺寸：非步骤2时内容区可上下滚动
        const stageEl = bd.closest('.ac-stage');
        if (stageEl) stageEl.classList.toggle('ac-stage--scroll', step.id !== 2);
        // 左侧路径卡片改名 + 快照左右布局 + 路径底部图例
        const acRoot = bd.closest('.ac');
        if (acRoot) {
          acRoot.classList.add('ac--spine');
          // ④ 实时评估快照：左 3D 雷达 / 右 文字说明（仅首次重组 DOM，renderSnapshot 之后会回填）
          const snap = U.qs('.ac-snap', acRoot);
          if (snap && !snap.dataset.relaid) {
            snap.dataset.relaid = '1';
            const cube = U.qs('#ac-cube', snap), metrics = U.qs('#ac-metrics', snap), foot = U.qs('#ac-foot', snap), ttl = U.qs('.ac-snap-ttl', snap);
            const left = document.createElement('div'); left.className = 'ac-snap-radar';
            const right = document.createElement('div'); right.className = 'ac-snap-text';
            if (cube) left.appendChild(cube);
            if (metrics) right.appendChild(metrics);
            if (foot) right.appendChild(foot);
            snap.innerHTML = '';
            if (ttl) snap.appendChild(ttl);
            snap.appendChild(left); snap.appendChild(right);
          }
          // 将左侧雷达替换为真正 3D 立体雷达（带评估结果数值 + 随皮肤主题变化）
          const cubeBox = U.qs('#ac-cube', snap || acRoot);
          if (cubeBox && typeof window.buildRadar3D === 'function') {
            const R = S.result || computeSpineRisk(S);
            const e = S.eval, b = S.base;
            const nv = function (v) { var n = num(v); return n != null ? n : null; };
            window.buildRadar3D(cubeBox, { overall: R.risk, dims: [
              { name:'骨骼', label: num(b.staticCobb)>=45?'重度':num(b.staticCobb)>=25?'中度':'轻度', level: num(b.staticCobb)>=45?'high':num(b.staticCobb)>=25?'mid':'low', value: nv(b.staticCobb), unit:'°' },
              { name:'关节', label: num(e.beighton)>=4?'松弛':'正常', level: num(e.beighton)>=4?'mid':'low', value: nv(e.beighton), unit:'/9' },
              { name:'神经', label: /异常|下降/.test((e.neuroWeak||'')+(e.neuroSense||''))?'异常':'正常', level: /异常|下降/.test((e.neuroWeak||'')+(e.neuroSense||''))?'mid':'low', value: null, unit:'' },
              { name:'平衡', label: num(e.eyesClosed)<10?'异常':'正常', level: (num(e.eyesClosed)!=null&&num(e.eyesClosed)<10)?'mid':'low', value: nv(e.eyesClosed), unit:'s' },
              { name:'肌力', label: num(e.gripLSI)<80?'失衡':'正常', level: (num(e.gripLSI)!=null&&num(e.gripLSI)<80)?'mid':'low', value: nv(e.gripLSI), unit:'%' },
              { name:'心肺', label: num(e.fvc)<80?'受限':'正常', level: (num(e.fvc)!=null&&num(e.fvc)<80)?'mid':'low', value: nv(e.fvc), unit:'%' }
            ] });
          }
          // ① 路径卡片底部图例，纵向填满空白
          const pathCard = U.qs('.ac-path-card', acRoot);
          if (pathCard && !pathCard.dataset.legended) {
            pathCard.dataset.legended = '1';
            const lg = document.createElement('div'); lg.className = 'ac-path-legend';
            lg.innerHTML = '<div class="row"><span class="dots cur"></span>当前评估步骤</div><div class="row"><span class="dots done"></span>已完成步骤</div><div class="row"><span class="dots todo"></span>待评估步骤</div>';
            pathCard.appendChild(lg);
          }
        }
        const pathTtl = U.qs('.ac-path-ttl', bd.closest('.ac'));
        if (pathTtl && pathTtl.dataset.renamed !== '1') { pathTtl.innerHTML = '<span class="dot"></span>青少年脊柱功能评估路径'; pathTtl.dataset.renamed = '1'; }
        if (step.id===1) {
          const calc=()=>{ const h=num(U.qs('#b-height',bd)&&U.qs('#b-height',bd).value); const w=num(U.qs('#b-weight',bd)&&U.qs('#b-weight',bd).value); const el=U.qs('#b-bmi',bd); if(el)el.value=(h&&w)?U.round(w/Math.pow(h/100,2),1):''; };
          const he=U.qs('#b-height',bd); if(he)he.oninput=calc; const we=U.qs('#b-weight',bd); if(we)we.oninput=calc;
          const sb=U.qs('#btn-save-base',bd); if(sb)sb.onclick=()=>{
            const cur=D().getPatient(base.id)||{}; const curSpine=cur.spine||{};
            const bAge=num(U.qs('#b-age',bd).value), bH=num(U.qs('#b-height',bd).value), bW=num(U.qs('#b-weight',bd).value);
            const rec={ id:base.id, name:U.qs('#b-name',bd).value||base.name,
              gender:(U.qsa('input[name=b-gender]',bd).find(r=>r.checked)||{}).value||base.gender,
              age:bAge!=null?bAge:base.age, height:bH!=null?bH:base.height, weight:bW!=null?bW:base.weight,
              spine:Object.assign({},curSpine,{ visitType:(U.qsa('input[name=b-visit]',bd).find(r=>r.checked)||{}).value||S.base.visitType,
                staticCobb:num(U.qs('#b-cobb',bd).value), lenke:U.qs('#b-lenke',bd).value||'', risser:num(U.qs('#b-risser',bd).value),
                nashMoe:num(U.qs('#b-nm',bd).value), progressPerYear:num(U.qs('#b-prog',bd).value),
                menarcheAge:num(U.qs('#b-mena',bd).value), tanner:U.qs('#b-tanner',bd).value||'', vasPain:num(U.qs('#b-vas',bd).value) }) };
            D().savePatient(rec);
            S.base=Object.assign({},rec.spine,{name:rec.name,gender:rec.gender,age:rec.age,height:rec.height,weight:rec.weight});
            U.toast('基线已保存回专项档案','success');
          };
        }
        if (step.id===3) {
          const rv=U.qs('#f-review',bd); if(rv)rv.onchange=()=>{ S.result=S.result||computeSpineRisk(S); S.result.reviewDate=rv.value; };
          const nt=U.qs('#f-note',bd); if(nt)nt.onchange=()=>{ S.note=nt.value; };
          const aiRisk=U.qs('#btn-ai-risk',bd); if(aiRisk)aiRisk.onclick=()=>{ if(!spineAiReady()) U.toast('本账号未开通 AI 辅助，以下为系统内置参考建议（演示）','warning'); openAiModal('risk',S); };
        }
        if (step.id===4) {
          const pp=U.qs('#btn-print-sp-prev',bd); if(pp)pp.onclick=()=>printSpine(buildSpineRecord(S));
          const ba=U.qs('#btn-back-archive',bd); if(ba)ba.onclick=()=>{ cockpit._goto(3); };
          const aiReport=U.qs('#btn-ai-report',bd); if(aiReport)aiReport.onclick=()=>openAiReport(S);
        }
        /* 智能方案生成按钮：常驻页脚，仅在步骤 4（与「完成并归档」同排）显示，点击跳智能方案页 */
        /* 注意：页脚 .ac-stage-ft 是 stageBd 的兄弟节点（位于 .ac-stage 内），不能用 bd.closest 找，需从 .ac-stage 取 */
        const spineStage = bd.closest('.ac-stage');
        const spineFt = spineStage ? spineStage.querySelector('.ac-stage-ft') : null;
        const spineNext = spineFt ? spineFt.querySelector('#ac-next') : null;
        if (spineFt) {
          let spb = U.qs('#spine-plan-btn', spineFt);
          if (!spb) { spb = document.createElement('a'); spb.id = 'spine-plan-btn'; spb.href = '#/spine-plan'; spb.className = 'btn btn-success btn-sm'; spb.textContent = '🎯 智能方案生成 →'; spb.style.marginLeft = 'auto'; const nx = U.qs('#ac-next', spineFt); spineFt.insertBefore(spb, nx); }
          spb.style.display = step.id === 4 ? '' : 'none';
          /* 步骤 2/3：保存当前步骤数据（不前进）— 把 eval/result 写回专项档案 */
          let saveBtn = U.qs('#spine-save-btn', spineFt);
          if (!saveBtn) {
            saveBtn = document.createElement('button');
            saveBtn.id = 'spine-save-btn';
            saveBtn.className = 'btn btn-primary btn-sm';
            saveBtn.textContent = '💾 保存当前评估数据';
            saveBtn.style.marginLeft = 'auto';
            const nx2 = U.qs('#ac-next', spineFt);
            if (nx2) spineFt.insertBefore(saveBtn, nx2); else spineFt.appendChild(saveBtn);
          }
          saveBtn.style.display = (step.id === 2 || step.id === 3) ? '' : 'none';
          if (saveBtn._wired !== '1') {
            saveBtn._wired = '1';
            saveBtn.onclick = () => {
              try {
                const cur = D().getPatient(base.id) || {};
                const curSpine = cur.spine || {};
                const rec = {
                  id: base.id,
                  spine: Object.assign({}, curSpine, {
                    eval: S.eval,
                    base: S.base
                  })
                };
                D().savePatient(rec);
                U.toast('当前评估数据已保存到专项档案', 'success');
              } catch (e) {
                U.toast('保存失败：' + (e.message || e), 'error');
              }
            };
          }
          /* 步骤 2：保证底栏始终可见（让用户能看到上一步/下一步/保存）— 提升 stage 最小高度 */
          if (step.id === 2) {
            const stageRoot = spineFt.closest('.ac-stage');
            if (stageRoot) stageRoot.style.minHeight = 'unset';
          }
        }
        /* 步骤 2：用真实人体 3D + 身体锚点替换 2D 身体图谱（参考肌少症 initShield3D） */
        if (step.id===2) {
          const acRoot = bd.closest('.ac'); if (acRoot) acRoot.classList.add('ac--spine');
          const atlasHost = U.qs('.ac-atlas', bd);
          if (atlasHost && !atlasHost._spine3DInst) {
            const gender0 = (base.gender === 'female' || base.gender === '女') ? 'female' : 'male';
            const COLORS = { low:'#10b981', mid:'#f59e0b', na:'#64748b' };
            const ANCHORS = {
              neuro:[0,1.45,0.15], cardio:[0,0.9,0.24], posture:[-0.42,0.82,0.2],
              atr:[0.08,0.52,0.26], beighton:[0.38,0.2,0.16], balance:[-0.18,-0.5,0.14], plantar:[0.15,-1.4,0.2]
            };
            const LAB = {
              // 标签沿身体左右两侧纵向散开，避免胸口/腹部扎堆；x 正=右，负=左
              neuro:[0.60,0.15,0.10],     // 头右侧
              cardio:[0.62,0.05,0.12],    // 右胸外侧
              posture:[-0.62,0.06,0.12],  // 左肩外侧
              atr:[-0.62,-0.12,0.10],     // 左侧腰
              beighton:[0.62,-0.14,0.10], // 右髋外侧
              balance:[-0.62,-0.38,0.08],   // 左大腿外侧
              plantar:[0.62,-0.62,0.08]    // 右脚外侧
            };
            const regions = SPINE_REGIONS.map(r => ({ id:r.id, title:r.label, color:COLORS[r.risk]||'#64748b', risk:r.risk, desc:r.summary, pos:ANCHORS[r.id], labelOffset:LAB[r.id] }));
            const p = window.initSpine3D(atlasHost, {
              regions: regions,
              modelByGender: { male:'assets/teen_boy.glb', female:'assets/teen_girl.glb' },
              placeholder: 'assets/elder_20260816.glb',
              initialGender: gender0,
              onSelectRegion: function (id) { const card = U.qs('.ac-region[data-rid="'+id+'"]', bd); if (card) card.click(); }
            });
            atlasHost._spine3DInst = p;
            // 性别切换（右上角）
            const toggle = document.createElement('div');
            toggle.style.cssText = 'position:absolute;top:10px;right:10px;z-index:7;display:flex;gap:4px;background:rgba(255,255,255,.72);border-radius:10px;padding:3px;box-shadow:0 2px 6px rgba(15,23,42,.12);';
            toggle.className = 'sp-gender-toggle';
            toggle.innerHTML = '<button data-g="male" style="border:0;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:'+(gender0==='male'?'#534AB7':'transparent')+';color:'+(gender0==='male'?'#fff':'#475569')+';">♂ 男</button>'
              + '<button data-g="female" style="border:0;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;background:'+(gender0==='female'?'#534AB7':'transparent')+';color:'+(gender0==='female'?'#fff':'#475569')+';">♀ 女</button>';
            atlasHost.appendChild(toggle);
            toggle.querySelectorAll('button').forEach(function (b) {
              b.onclick = function () {
                const g = b.dataset.g;
                p.then(function (i) { if (i && i.setGender) i.setGender(g); });
                toggle.querySelectorAll('button').forEach(function (x) {
                  const on = x.dataset.g === g;
                  x.style.background = on ? '#534AB7' : 'transparent';
                  x.style.color = on ? '#fff' : '#475569';
                });
              };
            });
          }
        }
      },
      onRegionRender:(S, rid, bd)=>{ spBindEval(S, bd); },
      onComplete:(S)=>{
        const R=S.result||computeSpineRisk(S); S.result=R;
        const rec=buildSpineRecord(S);
        const saved=D().save(rec); S.saved=true; S.no=saved.no||rec.no;
        U.toast('评估已归档至青少年脊柱健康独立台账','success');
        location.hash='#/spine';
      }
    });
    wrap.appendChild(cockpit);

    const demoBtn=U.qs('#btn-demo-spine',wrap);
    if(demoBtn)demoBtn.onclick=()=>{
      Object.assign(S.eval,{ shoulderDiff:12,scapulaDiff:9,waistDiff:6,iliacDiff:3,legLenDiff:4,trunkDeviation:13,
        atrThT:4,atrThMain:9,atrTl:3,atrL:2,ribHumpDiff:7,humpSide:'右',
        beighton:5,neuroWeak:'无',neuroSense:'无',neuroReflex:'对称',babinski:'阴性',spineTender:'无',
        stepAsym:2.5,pressureRatio:0.85,archType:'扁平足',cogX:14,cogY:8,footType:'扁平足',
        eyesOpen:18,eyesClosed:7,sway:12,gaitFwd:1.2,gaitBack:1.1,gaitSpeed:1.15,
        gripL:180,gripR:210,gripLSI:86,fvc:72,fev1:70,fev1fvc:0.81,pef:68,mip:60,mep:65,sixMwd:380,spo2min:94,painVas:4,sr22rTotal:58 });
      S.base=Object.assign({},S.base,{staticCobb:32,lenke:'Lenke 1AN',risser:1,nashMoe:2,progressPerYear:4});
      cockpit._rerender(); U.toast('已填充演示数据，可直接查看风险分层','success');
    };

    return wrap;
  };

  /* 步骤 1：首诊登记（放射学基线） */
  function spStep1(S) {
    const b=S.base, rbmi=(num(b.height)&&num(b.weight))?U.round(num(b.weight)/Math.pow(num(b.height)/100,2),1):'';
    return tipBox('数据来源说明','以下为「青少年脊柱健康首诊登记」专项档案中的放射学基线，作为本次评估与问卷联动的根依据；在此修改将同步保存回首诊登记专项档案（系统唯一真相字段 spine.staticCobb），两处录入指向同一数据，不会产生分歧。') +
      '<div class="form-grid">' +
      field('姓名','b-name',b.name,'') +
      '<div class="form-group"><label>性别</label>'+radio('b-gender',b.gender||'female',[['男','male'],['女','female']])+'</div>' +
      field('年龄（岁）','b-age',b.age,'') +
      field('身高（cm）','b-height',b.height,'') +
      field('体重（kg）','b-weight',b.weight,'') +
      '<div class="form-group"><label>BMI</label><input type="text" id="b-bmi" value="'+U.esc(rbmi)+'" readonly></div>' +
      '<div class="form-group"><label>就诊类型</label>'+radio('b-visit',b.visitType||'screen',[['初筛','screen'],['康复随访','follow'],['术前评估','pre']])+'</div>' +
      field('静态 X 线主弯 Cobb 角（°）','b-cobb',b.staticCobb,'唯一参与风险分层 · 与首诊登记同一字段') +
      field('弯曲分型 Lenke','b-lenke',b.lenke,'如 Lenke 1AN') +
      field('Risser 征（骨龄）','b-risser',b.risser,'0-5') +
      field('Nash-Moe 椎体旋转','b-nm',b.nashMoe,'0-4') +
      field('年度角度进展（°/年）','b-prog',b.progressPerYear,'≥5 标记高危') +
      field('初潮年龄（女）','b-mena',b.menarcheAge,'选填') +
      field('Tanner 分级（男）','b-tanner',b.tanner,'1-5') +
      field('既往疼痛 VAS（0-10）','b-vas',b.vasPain,'选填') +
      '</div>' +
      '<div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;"><button type="button" class="btn btn-primary btn-sm" id="btn-save-base">💾 保存基线修改</button><span id="base-tip" style="font-size:13px;color:var(--text-secondary);"></span></div>';
  }

  /* 步骤 3：风险分层综合判定 */
  function spStep3(S) {
    const R=computeSpineRisk(S); S.result=R;
    return tipBox('判定逻辑','一级核心因子：静态 X 线 Cobb 角、Risser 征、Nash-Moe 椎体旋转、年度角度进展；二级修正因子：Beighton、疼痛 VAS、平衡、握力 LSI、已确认体态/足底异常。仅人工确认数据参与运算。') +
      '<div class="sarc-metric-grid" style="margin-top:14px;">' +
      metricCard({name:'风险等级',value:R.riskName,unit:'',level:R.risk==='high'?'bad':R.risk==='mid'?'warn':'ok',label:R.risk==='high'?'紧急干预':R.risk==='mid'?'专业干预':'基础干预',rule:'低风险 6 月 / 中风险 4 月 / 高风险 2-3 月'}) +
      metricCard({name:'Cobb 角',value:num(S.base.staticCobb)!=null?num(S.base.staticCobb):'—',unit:'°',level:num(S.base.staticCobb)>=45?'bad':num(S.base.staticCobb)>=25?'warn':'ok',label:'放射学基线'}) +
      metricCard({name:'建议复查周期',value:R.reviewMonths,unit:'月',level:'ok',label:R.reviewDate}) +
      '</div>' +
      '<div style="margin-top:14px;"><b>判定依据：</b><ul style="margin:8px 0 0 18px;line-height:1.9;font-size:13.5px;">'+R.reasons.map(r=>'<li>'+U.esc(r)+'</li>').join('')+'</ul></div>' +
      '<div class="form-grid" style="margin-top:16px;">' +
      '<div class="form-group"><label>随访复查日期（可调整）</label><input type="date" id="f-review" value="'+U.esc(R.reviewDate)+'"></div>' +
      '<div class="form-group full-width"><label>医生备注（归档至本模块台账）</label><textarea id="f-note" rows="2" placeholder="记录评估异常、配合度、家属沟通要点">'+(S.note||'')+'</textarea></div>' +
      '</div>' +
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center;" class="no-print">' +
      '<button type="button" class="btn btn-primary" id="btn-ai-risk"><span style="margin-right:5px;">🤖</span>AI 解读</button>' +
      '<span style="font-size:13px;color:var(--text-muted);">默认关闭，点击开启 AI 辅助解读（医生确认后生效）</span></div>' +
      '<div class="alert alert-warning" style="margin-top:14px;">⚠ 若人工修改风险等级并保存，系统将提示重新复核复诊周期与康复方案，不会自动覆盖已确认数据，操作审计留痕。</div>';
  }

  /* 步骤 4：报告与干预方案 */
  function spStep4(S) {
    const R=S.result||computeSpineRisk(S); S.result=R;
    const rec=buildSpineRecord(S);
    return '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">📄</span>独立评估报告预览</h3>' +
      '<div class="no-print" style="display:flex;gap:8px;"><button class="btn btn-primary btn-sm" id="btn-print-sp-prev">打印 / 导出报告</button></div></div>' +
      '<div class="card-body"><div id="sp-report-preview" style="max-height:620px;overflow:auto;border:1px solid var(--border);border-radius:12px;">'+window.buildSpineReport(rec)+'</div></div></div>' +
      '<div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🎯</span>干预方案</h3></div><div class="card-body">' +
      tipBox('方案匹配','系统依据风险等级、弯型、体态/足底异常自动匹配初始方案；可进入方案自定义编辑器编辑（居家徒手 / 鹊动 1-9 设备）。') +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;align-items:center;" class="no-print">' +
      '<button type="button" class="btn btn-ai btn-lg" id="btn-ai-report"><span class="ai-icon-wrap" style="margin-right:5px;">🤖</span>AI 解读报告（全屏）</button>' +
      '<button class="btn btn-ghost btn-lg" id="btn-back-archive">返回步骤 3 调整</button></div></div></div>';
  }

  /* 步骤 2 七维度区域（贴回 Body Atlas） */
  function spRegionPosture(S){ const e=S.eval; return tipBox('采集规范','单位 mm，支持左右侧分别记录；双肩高度差＞10mm / 下肢长短差＞5mm / 躯干中线偏移＞10mm 为异常。') +
    '<div class="form-grid">' +
    field('双肩高度差 (mm)','e-shoulder',e.shoulderDiff,'＞10 异常') +
    field('双侧肩胛下角水平差 (mm)','e-scapula',e.scapulaDiff,'') +
    field('双侧腰窝深浅差 (mm)','e-waist',e.waistDiff,'') +
    field('髂嵴骨盆高度差 (mm)','e-iliac',e.iliacDiff,'') +
    field('下肢长短异常 (mm)','e-leg',e.legLenDiff,'＞5 异常') +
    field('躯干中线偏移 (mm)','e-trunk',e.trunkDeviation,'＞10 异常') +
    '</div>'; }
  function spRegionATR(S){ const e=S.eval; return '<div class="form-grid">' +
    field('胸椎上段 ATR (°)','e-atrT',e.atrThT,'0-4 姿势性') +
    field('胸椎主弯 ATR (°)','e-atrMain',e.atrThMain,'≥5 结构性') +
    field('胸腰段 ATR (°)','e-atrTl',e.atrTl,'') +
    field('腰椎 ATR (°)','e-atrL',e.atrL,'') +
    field('肋骨隆起高度差 (mm)','e-rib',e.ribHumpDiff,'＞5 异常') +
    field('隆起侧别','e-hump',e.humpSide,'左/右') +
    '</div>'; }
  function spRegionBeighton(S){ const e=S.eval; return tipBox('判读','9 项动作每项达标得 1 分，总分≥4 提示结缔组织松弛、侧弯进展高风险。') +
    '<div class="form-grid">' +
    ['小指过伸＞90°(左)','小指过伸＞90°(右)','拇指触前臂(左)','拇指触前臂(右)','肘过伸(左)','肘过伸(右)','膝过伸(左)','膝过伸(右)','躯干触地'].map((lab,i)=>{const key='b'+i;return '<div class="form-group"><label>'+lab+'</label>'+radio('beighton_'+key,e.beightonItems[key]?'1':'0',[['未达标','0'],['达标 +1','1']])+'</div>';}).join('') +
    field('Beighton 总分（自动）','e-beighton',e.beighton,'0-9') +
    '</div>'; }
  function spRegionNeuro(S){ const e=S.eval; return '<div class="form-grid">' +
    field('单侧肌力下降','e-neuroWeak',e.neuroWeak,'异常标记红flag') +
    field('感觉异常部位','e-neuroSense',e.neuroSense,'') +
    field('反射对称性','e-neuroReflex',e.neuroReflex,'') +
    field('巴氏征','e-babinski',e.babinski,'阴性/阳性') +
    field('脊柱叩击痛节段','e-spineTender',e.spineTender,'') +
    '</div>'; }
  function spRegionPlantar(S){ const e=S.eval; return '<div class="form-grid">' +
    field('步幅不对称差值 (cm)','e-stepAsym',e.stepAsym,'＞2 异常') +
    field('左右足底压力比值','e-ratio',e.pressureRatio,'0.9-1.1 正常') +
    field('足弓代偿','e-arch',e.archType,'正常/扁平/高弓') +
    field('静态重心 X 轴偏移 (mm)','e-cogX',e.cogX,'超阈标记') +
    field('静态重心 Y 轴偏移 (mm)','e-cogY',e.cogY,'超阈标记') +
    field('足型判断','e-foot',e.footType,'') +
    '<div class="form-group full-width"><label>足底压力异常文本描述</label><textarea id="e-plantarDesc" rows="2">'+(e.plantarDesc||'')+'</textarea></div>' +
    '</div>' +
    '<div class="form-section" style="background:transparent;border:1px dashed var(--border);padding:14px;border-radius:12px;margin-top:14px;">' +
      '<h4 class="form-section-title">上传足底压力报告 PDF 自动解析</h4>' +
      '<div class="form-row" style="grid-template-columns:1fr auto;">' +
        '<input type="file" id="pl-file" accept="application/pdf,image/*" />' +
        '<button type="button" class="btn btn-secondary" id="pl-parse">解析 PDF</button>' +
      '</div>' +
      '<p class="text-muted" style="font-size:12px;margin-top:8px;">支持足底压力/步态分析报告 PDF（含数字文本或扫描件 OCR 兜底）。解析结果自动回填上方指标，并可用 AI 增强补抽。解析失败时请手动录入。</p>' +
      '<div id="pl-status"></div>' +
    '</div>'; }
  function spRegionBalance(S){ const e=S.eval; return '<div class="form-grid">' +
    field('睁眼单脚站立 (s)','e-eyeOpen',e.eyesOpen,'≥15 正常') +
    field('闭眼单脚站立 (s)','e-eyeClosed',e.eyesClosed,'＜10 异常') +
    field('晃动幅度 (mm)','e-sway',e.sway,'＜10 正常') +
    field('4 米正向步速 (m/s)','e-gaitF',e.gaitFwd,'1.3-1.5') +
    field('4 米反向步速 (m/s)','e-gaitB',e.gaitBack,'选填') +
    field('步速均值 (m/s)','e-gait',e.gaitSpeed,'选填') +
    field('左手握力 (N)','e-gripL',e.gripL,'内部存 N') +
    field('右手握力 (N)','e-gripR',e.gripR,'选填') +
    field('握力 LSI (%)','e-lsi',e.gripLSI,'＜80% 失衡') +
    '</div>' +
    '<div class="form-section" style="background:transparent;border:1px dashed var(--border);padding:14px;border-radius:12px;margin-top:14px;">' +
      '<h4 class="form-section-title">蓝牙设备采集（握力 / 步速）</h4>' +
      '<div class="form-row" style="grid-template-columns:auto auto auto auto;">' +
        '<button type="button" class="btn btn-secondary" id="bt-connect">🔗 连接设备</button>' +
        '<button type="button" class="btn btn-primary" id="bt-grip">采集握力</button>' +
        '<button type="button" class="btn btn-primary" id="bt-gait">采集步速</button>' +
        '<button type="button" class="btn btn-ghost" id="bt-cfg" title="配置 GATT UUID">⚙</button>' +
      '</div>' +
      '<p class="text-muted" style="font-size:12px;margin-top:8px;">通过标准 GATT 读取握力计/步速计。首次需在 HTTPS 或 Tauri 桌面端运行；若设备 UUID 与默认不同，点 ⚙ 配置。</p>' +
      '<div id="bt-status"></div>' +
    '</div>'; }
  function spRegionCardio(S){ const e=S.eval; return '<div class="form-grid">' +
    field('FVC (%预计)','e-fvc',e.fvc,'≥80 轻度') +
    field('FEV1 (%预计)','e-fev1',e.fev1,'') +
    field('FEV1/FVC','e-fev1fvc',e.fev1fvc,'') +
    field('PEF','e-pef',e.pef,'') +
    field('MIP','e-mip',e.mip,'') +
    field('MEP','e-mep',e.mep,'') +
    field('6 分钟步行 (m)','e-6mwd',e.sixMwd,'＜400 异常') +
    field('运动血氧最低 (%)','e-spo2',e.spo2min,'') +
    field('本次疼痛 VAS (0-10)','e-pain',e.painVas,'≥6 限制动作') +
    field('SRS-22r 总分（0-80）','e-sr22',e.sr22rTotal,'自评') +
    '</div>' + tipBox('说明','SRS-22r 含 22 条目（功能/疼痛/自我形象/心理/满意度），可线下录入总分；PDF 解析为可选辅助，未确认数据仅展示。'); }

  /* 步骤 2 字段绑定（区域抽屉内） */
  function spBindEval(S, bd) {
    const map={'#e-shoulder':'shoulderDiff','#e-scapula':'scapulaDiff','#e-waist':'waistDiff','#e-iliac':'iliacDiff','#e-leg':'legLenDiff','#e-trunk':'trunkDeviation','#e-atrT':'atrThT','#e-atrMain':'atrThMain','#e-atrTl':'atrTl','#e-atrL':'atrL','#e-rib':'ribHumpDiff','#e-hump':'humpSide','#e-neuroWeak':'neuroWeak','#e-neuroSense':'neuroSense','#e-neuroReflex':'neuroReflex','#e-babinski':'babinski','#e-spineTender':'spineTender','#e-stepAsym':'stepAsym','#e-ratio':'pressureRatio','#e-arch':'archType','#e-cogX':'cogX','#e-cogY':'cogY','#e-foot':'footType','#e-plantarDesc':'plantarDesc','#e-eyeOpen':'eyesOpen','#e-eyeClosed':'eyesClosed','#e-sway':'sway','#e-gaitF':'gaitFwd','#e-gaitB':'gaitBack','#e-gait':'gaitSpeed','#e-gripL':'gripL','#e-gripR':'gripR','#e-lsi':'gripLSI','#e-fvc':'fvc','#e-fev1':'fev1','#e-fev1fvc':'fev1fvc','#e-pef':'pef','#e-mip':'mip','#e-mep':'mep','#e-6mwd':'sixMwd','#e-spo2':'spo2min','#e-pain':'painVas','#e-sr22':'sr22rTotal'};
    Object.keys(map).forEach(function(id){ const el=U.qs(id,bd); if(el) el.onchange=function(){ S.eval[map[id]] = el.value; }; });
    const beights=U.qsa('input[name^=beighton_]',bd);
    beights.forEach(function(r){ r.onchange=function(){ let s=0; U.qsa('input[name^=beighton_]',bd).forEach(function(x){ if(x.checked){ const k=x.name.replace('beighton_',''); S.eval.beightonItems[k]=x.value==='1'; s++; } }); S.eval.beighton=s; const be=U.qs('#e-beighton',bd); if(be) be.value=s; }; });
    // 足底压力报告 PDF 自动解析入口（仅 plantar 抽屉内有 #pl-file）
    const plFile = U.qs('#pl-file', bd);
    if (plFile && !plFile._wired) { plFile._wired = 1; wirePlantarParse(S, bd); }
    // 蓝牙设备采集入口（仅 balance 抽屉内有 #bt-connect）
    const btConnect = U.qs('#bt-connect', bd);
    if (btConnect && !btConnect._wired) { btConnect._wired = 1; wireSpineBluetooth(S, bd); }
  }

  /* 足底压力报告 PDF 上传 → PdfParser 解析 → 回填 eval → 更新表单 */
  async function wirePlantarParse(S, bd) {
    const btn = U.qs('#pl-parse', bd);
    const fileInput = U.qs('#pl-file', bd);
    const statusEl = U.qs('#pl-status', bd);
    if (!btn) return;
    btn.onclick = async function () {
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { U.toast('请先选择足底压力报告 PDF', 'warning'); return; }
      statusEl.innerHTML = '<p style="font-size:13px;color:var(--primary);">正在解析足底压力报告...</p>';
      try {
        if (!window.PdfParser || typeof window.PdfParser.parseFile !== 'function') throw new Error('PDF 解析库未加载');
        const res = await window.PdfParser.parseFile(file, { typeHint: 'plantar' });
        let aiF = null;
        try {
          if (res.rawText && window.AIReason && typeof window.AIReason.parseReport === 'function') {
            statusEl.innerHTML = '<p style="font-size:13px;color:var(--primary);">鹊动小Qoo 智能解析中...</p>';
            const ai = await window.AIReason.parseReport({ ocrText: res.rawText, typeHint: 'plantar', file: file });
            if (ai && ai.fields) aiF = ai.fields;
          }
        } catch (e) { console.warn('[spine plantar] AI 增强失败（已回退正则结果）', e); }
        const merged = Object.assign({}, res.fields || {}, aiF || {});
        ['stepAsym','pressureRatio','archType','cogX','cogY','footType','plantarDesc'].forEach(function (k) {
          if (merged[k] != null && merged[k] !== '') S.eval[k] = merged[k];
        });
        const setVal = function (sel, v) { const el = U.qs(sel, bd); if (el && v != null && v !== '') el.value = v; };
        setVal('#e-stepAsym', merged.stepAsym);
        setVal('#e-ratio', merged.pressureRatio);
        setVal('#e-arch', merged.archType);
        setVal('#e-cogX', merged.cogX);
        setVal('#e-cogY', merged.cogY);
        setVal('#e-foot', merged.footType);
        if (merged.plantarDesc) { const t = U.qs('#e-plantarDesc', bd); if (t) t.value = merged.plantarDesc; }
        S.eval.plantarReport = { fileName: file.name, size: file.size, parsedAt: new Date().toISOString(), viaAI: !!aiF };
        S.eval.pdfParsed = true;
        const has = ['stepAsym','pressureRatio','archType','cogX','cogY','footType'].filter(function (k) { return merged[k] != null && merged[k] !== ''; }).length;
        statusEl.innerHTML = '<p style="font-size:13px;color:var(--success);">✓ 解析完成，已回填 ' + has + ' 项足底指标' + (aiF ? '（含 AI 增强）' : '') + '。</p>';
        U.toast('足底压力报告解析完成', 'success');
      } catch (e) {
        statusEl.innerHTML = '<p style="font-size:13px;color:var(--danger);">解析失败：' + U.esc(U.errMsg(e)) + '。可改用「手动录入」。</p>';
        U.toast('足底压力报告解析失败', 'error');
      }
    };
  }

  /* 蓝牙设备采集（Web Bluetooth 标准 GATT + Tauri 桌面端兼容） */
  var _btUnsub = [];
  function wireSpineBluetooth(S, bd) {
    // 清理上一次抽屉的监听（同一会话重复打开「平衡」抽屉时避免监听器堆积在 SpineDevice 单例上）
    _btUnsub.forEach(function (fn) { try { fn(); } catch (e) {} });
    _btUnsub = [];
    const SD = window.SpineDevice;
    const statusEl = U.qs('#bt-status', bd);
    if (!SD) { if (statusEl) statusEl.innerHTML = '<p style="font-size:13px;color:var(--danger);">蓝牙采集模块未加载。</p>'; return; }
    const setStatus = function (t, cls) { if (statusEl) statusEl.innerHTML = '<p style="font-size:13px;color:var(--' + (cls || 'primary') + ');">' + t + '</p>'; };
    _btUnsub.push(SD.on('status', setStatus));
    _btUnsub.push(SD.on('error', function (e) { setStatus('错误：' + U.errMsg(e), 'danger'); }));
    _btUnsub.push(SD.on('reading', function (payload) {
      const type = payload.type, value = payload.value || {};
      if (type === 'grip') {
        if (value.gripL != null) { const el = U.qs('#e-gripL', bd); if (el) el.value = value.gripL; S.eval.gripL = value.gripL; }
        if (value.gripR != null) { const el = U.qs('#e-gripR', bd); if (el) el.value = value.gripR; S.eval.gripR = value.gripR; }
        if (value.gripLSI != null) { const el = U.qs('#e-lsi', bd); if (el) el.value = value.gripLSI; S.eval.gripLSI = value.gripLSI; }
        S.eval.deviceCapture = Object.assign({}, S.eval.deviceCapture, { gripL: value.gripL, gripR: value.gripR, gripLSI: value.gripLSI, source: 'bluetooth:' + (value.source || '?'), capturedAt: value.capturedAt });
        setStatus('✓ 握力采集完成：左 ' + value.gripL + ' / 右 ' + value.gripR + ' N，LSI ' + value.gripLSI + '%');
      } else if (type === 'gait') {
        if (value.gaitSpeed != null) { const el = U.qs('#e-gait', bd); if (el) el.value = value.gaitSpeed; S.eval.gaitSpeed = value.gaitSpeed; }
        S.eval.deviceCapture = Object.assign({}, S.eval.deviceCapture, { gaitSpeed: value.gaitSpeed, source: 'bluetooth:' + (value.source || '?'), capturedAt: value.capturedAt });
        setStatus('✓ 步速采集完成：' + value.gaitSpeed + ' m/s');
      }
    }));
    const conn = U.qs('#bt-connect', bd);
    if (conn) conn.onclick = async function () { try { await SD.connect(); setStatus('已连接，可开始采集'); } catch (e) {} };
    const gp = U.qs('#bt-grip', bd);
    if (gp) gp.onclick = async function () { try { await SD.captureGrip(); } catch (e) {} };
    const gt = U.qs('#bt-gait', bd);
    if (gt) gt.onclick = async function () { try { await SD.captureGait(); } catch (e) {} };
    const cfg = U.qs('#bt-cfg', bd);
    if (cfg) cfg.onclick = function () { if (typeof SD.openConfigModal === 'function') SD.openConfigModal(); else U.toast('配置面板待接入', 'info'); };
  }

  /* 风险分层：决策树 + 加权修正 */
  function computeSpineRisk(S) {
    const b = S.base || {}, e = S.eval || {};
    const cobb = num(b.staticCobb), risser = num(b.risser), nm = num(b.nashMoe), prog = num(b.progressPerYear);
    const thoracic = /胸/.test(b.lenke || '') || /(主弯|胸椎)/.test(b.lenke || '');
    let level = 'low'; const reasons = [];
    if (cobb == null) {
      reasons.push('尚未录入静态 Cobb 角 → 筛查模式，仅输出简化风险提示，不执行正式分级');
    } else if (cobb >= 45 || (thoracic && cobb >= 35)) {
      level = 'high'; reasons.push('Cobb ' + cobb + '°（' + (cobb >= 45 ? '≥45°' : '胸椎主弯≥35°') + '）');
    } else if (cobb >= 25 && cobb <= 44) {
      if (risser != null && risser <= 3) { level = 'mid'; reasons.push('Cobb ' + cobb + '°（25-44°）且 Risser ' + risser + '（0-3）'); }
      else if (risser >= 4) { level = 'low'; reasons.push('Cobb ' + cobb + '° 中度但 Risser 已闭合（骨骼生长闭合），按规则下调为低风险'); }
      else { level = 'mid'; reasons.push('Cobb ' + cobb + '°（25-44°）'); }
    } else if (cobb >= 10) {
      level = 'low'; reasons.push('Cobb ' + cobb + '°（10-24°）低风险区间');
    } else {
      level = 'low'; reasons.push('Cobb 较小，按低风险处理');
    }
    if (nm != null && nm >= 3 && level !== 'low') reasons.push('Nash-Moe 椎体旋转 ' + nm + ' 级（重度旋转）');
    if (prog != null && prog >= 5 && level !== 'high') { if (level === 'mid') { level = 'high'; } reasons.push('年度角度进展 ' + prog + '°/年 ≥5°（升级风险）'); }

    const up = [];
    if (num(e.beighton) >= 4) up.push('Beighton≥4（结缔组织松弛）');
    if (num(e.painVas) >= 6) up.push('本次疼痛 VAS≥6');
    if (num(e.eyesClosed) != null && num(e.eyesClosed) < 10) up.push('闭眼单脚站立<10s（平衡异常）');
    if (num(e.gripLSI) != null && num(e.gripLSI) < 80) up.push('握力 LSI<80%（肌力失衡）');
    if (num(e.shoulderDiff) > 10 || num(e.trunkDeviation) > 10) up.push('已确认体态不对称（肩差/躯干偏移超阈）');
    if (num(e.cogX) > 10 || num(e.stepAsym) > 2 || /扁平|高弓/.test(e.footType || '')) up.push('已确认足底重心偏移/足型异常');
    if (up.length && level !== 'high') { level = level === 'low' ? 'mid' : 'high'; reasons.push('二级修正因子上调：' + up.join('、')); }

    const riskName = level === 'high' ? '高风险' : level === 'mid' ? '中风险' : '低风险';
    let months = level === 'high' ? 3 : level === 'mid' ? 4 : 6;
    if (b.visitType === 'follow' && level === 'low') months = 6;
    if (b.visitType === 'pre' && level === 'high') months = 2;
    const reviewDate = addDays(U.today(), months * 30);
    return { risk: level, riskName, reasons, reviewMonths: months, reviewDate };
  }

  function buildSpineRecord(S) {
    const base = D().getPatient(S.patientId) || {};
    const R = S.result || computeSpineRisk(S);
    return {
      id: S.id, no: S.no || ('SP' + String(Date.now() % 100000).padStart(5, '0')), module: 'spine',
      patientId: S.patientId, patientName: base.name || '', assessDate: S.assessDate,
      base: S.base, eval: S.eval, result: R, note: S.note || '', saved: S.saved || false,
      plantarReport: S.eval.plantarReport || null, deviceCapture: S.eval.deviceCapture || null
    };
  }

  /* ==================================================================
   * 页面三：个性化干预方案（体态矫正 / 肌力平衡 / 平衡稳定 / 呼吸）
   * ================================================================== */
  const SPINE_ACTIONS = {
    '体态矫正类': [
      { code:'JC01', name:'胸椎旋转伸展', steps:'坐姿右脚放左膝，左手撑地，吸气向左旋转上半身', cautions:'避免腰部代偿旋转', types:'胸弯/胸腰弯', levels:'基础/进阶/高阶', img:'assets/spine/jc01.jpg', video:'assets/spine/jc01.mp4' },
      { code:'JC05', name:'站姿肋骨内收', steps:'双手置肋骨两侧，吸气扩张胸廓呼气内收', cautions:'禁止憋气', types:'胸弯', levels:'基础/进阶/高阶/轻柔', img:'assets/spine/jc05.jpg', video:'assets/spine/jc05.mp4' },
      { code:'JC06', name:'仰卧骨盆后倾', steps:'仰卧屈膝，收紧腹部使腰贴地', cautions:'腹部核心发力', types:'腰弯', levels:'基础/进阶/高阶', img:'assets/spine/jc06.jpg', video:'assets/spine/jc06.mp4' },
      { code:'JC08', name:'脊柱侧凸矫正拉伸', steps:'凸侧在下侧卧，缓慢向上旋转上半身拉伸凹侧', cautions:'骨盆稳定', types:'所有弯型', levels:'进阶/高阶', img:'assets/spine/jc08.jpg', video:'assets/spine/jc08.mp4' },
      { code:'JC09', name:'站姿脊柱伸展', steps:'双手交叉举过头顶掌心向上延展脊柱', cautions:'禁止耸肩', types:'所有弯型', levels:'基础/轻柔', img:'assets/spine/jc09.jpg', video:'assets/spine/jc09.mp4' }
    ],
    '肌力平衡类': [
      { code:'JL01', name:'弹力带侧平举(弱侧强化)', steps:'弱侧握弹力带侧平举至肩高', cautions:'肘微屈禁耸肩', types:'所有弯型', levels:'基础/进阶/高阶', img:'assets/spine/jl01.jpg', video:'assets/spine/jl01.mp4' },
      { code:'JL03', name:'侧卧抬腿(弱侧强化)', steps:'弱侧在下侧卧抬腿30°', cautions:'骨盆稳定', types:'腰弯/双主弯', levels:'基础/进阶/高阶', img:'assets/spine/jl03.jpg', video:'assets/spine/jl03.mp4' },
      { code:'JL05', name:'弹力带划船(双侧平衡)', steps:'双手握弹力带向后拉至腰侧', cautions:'匀速禁暴力', types:'所有弯型', levels:'基础/进阶', img:'assets/spine/jl05.jpg', video:'assets/spine/jl05.mp4' },
      { code:'JL09', name:'俯卧燕飞(弱侧强化)', steps:'俯卧抬起弱侧上肢和对侧下肢', cautions:'背部发力禁腰代偿', types:'胸弯/胸腰弯', levels:'进阶/高阶', img:'assets/spine/jl09.jpg', video:'assets/spine/jl09.mp4' },
      { code:'JL10', name:'侧平板支撑(弱侧强化)', steps:'弱侧在下侧平板支撑', cautions:'髋不下沉', types:'所有弯型', levels:'进阶/高阶', img:'assets/spine/jl10.jpg', video:'assets/spine/jl10.mp4' }
    ],
    '平衡稳定类': [
      { code:'PH01', name:'单脚闭眼站立', steps:'抬腿闭眼平衡计时', cautions:'不稳先睁眼', types:'所有弯型', levels:'基础/进阶/高阶', img:'assets/spine/ph01.jpg', video:'assets/spine/ph01.mp4' },
      { code:'PH02', name:'平衡垫站立', steps:'平衡垫上左右移重心', cautions:'防摔倒', types:'所有弯型', levels:'基础/进阶/高阶', img:'assets/spine/ph02.jpg', video:'assets/spine/ph02.mp4' },
      { code:'PH04', name:'坐姿转体平衡', steps:'持物向一侧转体', cautions:'下半身固定', types:'胸弯/胸腰弯', levels:'进阶/高阶', img:'assets/spine/ph04.jpg', video:'assets/spine/ph04.mp4' },
      { code:'PH06', name:'侧卧平衡支撑', steps:'侧卧手肘支撑抬髋', cautions:'收紧核心', types:'所有弯型', levels:'进阶/高阶', img:'assets/spine/ph06.jpg', video:'assets/spine/ph06.mp4' }
    ],
    '呼吸功能类': [
      { code:'HX01', name:'腹式呼吸训练', steps:'仰卧一手胸口一手腹，吸气鼓腹', cautions:'缓吸禁憋', types:'所有弯型', levels:'基础/轻柔', img:'assets/spine/hx01.jpg', video:'assets/spine/hx01.mp4' },
      { code:'HX03', name:'胸廓扩张训练', steps:'站姿双手置胸廓，吸气扩张呼气收缩', cautions:'不憋气', types:'胸弯', levels:'基础/进阶/高阶', img:'assets/spine/hx03.jpg', video:'assets/spine/hx03.mp4' },
      { code:'HX05', name:'单侧胸廓扩张训练', steps:'凹侧卧位吸气扩张凹侧胸廓', cautions:'不代偿腰', types:'胸弯/胸腰弯', levels:'进阶/高阶', img:'assets/spine/hx05.jpg', video:'assets/spine/hx05.mp4' }
    ],
    '鹊动设备训练方案推荐': [
      /* 设备项统一对齐「鹊动 9 台设备档案」（CONST.DEVICES）：deviceId 指向真实机台，
         图片由设备库 images/devices/quedong-0X.jpg 提取，机构内可直接按机台号找到设备。 */
      { code:'QD-S1', deviceId:'04', name:'躯干屈伸矫正训练', device:'QD-04 背肌测训单元 · 背伸', steps:'坐姿固定骨盆，后背紧贴软垫，腰部肌群发力带动腰椎后伸；弱侧（凸侧）优先，双侧差异控制在 ±15% 内。', cautions:'禁止代偿性耸肩/骨盆旋转；行程需在设备合法 ROM（0°-30°）内。', types:'胸弯/胸腰弯', levels:'基础/进阶/高阶', img:'images/devices/quedong-04.jpg', video:'',
        params:{ load:'弱侧优先 · 双侧差 ≤15%', angleSpeed:'60°/s（力量）· 120°/s（功能）', range:'设备 ROM 0°-30°', reason:'竖脊肌 + 臀大肌为躯干后伸主动肌，对应设备库 04 号机', note:'凸侧优先' },
        dose:'3 组 × 10-12/侧 · 间歇 60s',
        safety:['行程需在设备合法 ROM 内，禁止超范围强行发力','弱侧（凸侧）优先，双侧差异控制在 ±15% 内'] },
      { code:'QD-S2', deviceId:'07', name:'脊柱冠状面矫正抗阻训练', device:'QD-07 下压复合测训单元 · 下压', steps:'坐姿肩关节外展、肘屈曲，双手握把，背部肌群发力垂直向下压；凸侧做向心收缩，凹侧做离心控制。', cautions:'阻力从 30% 1RM 起步；出现疼痛或麻木立即停止。', types:'所有弯型', levels:'基础/进阶', img:'images/devices/quedong-07.jpg', video:'',
        params:{ resistance:'30% 1RM 起步', range:'全程（设备默认）', reason:'背阔肌 + 肩胛下肌下压可产生冠状面矫正力矩，对应设备库 07 号机', note:'凸侧向心 / 凹侧离心' },
        dose:'3 组 × 12-15/侧 · 间歇 60s',
        safety:['阻力从 30% 1RM 起步，出现疼痛或麻木立即停止','躯干贴紧靠垫，禁止侧倾代偿'] },
      { code:'QD-S3', deviceId:'03', name:'躯干旋转控制训练', device:'QD-03 腹肌测训单元 · 腹屈', steps:'坐姿双臂从下方抱住软垫，以腹部核心发力带动躯干前屈与控制性旋转；限制过中线角度。', cautions:'胸腰弯患者需减小旋转幅度；避免腰椎代偿。', types:'胸弯/胸腰弯', levels:'进阶/高阶', img:'images/devices/quedong-03.jpg', video:'',
        params:{ resistance:'自重-40% 1RM', range:'设备 ROM 0°-45° · 限制过中线', reason:'腹外斜肌 + 腹内斜肌为躯干旋转主动肌，对应设备库 03 号机', note:'核心发力，腰椎不代偿' },
        dose:'2-3 组 × 10-12/侧 · 间歇 60s',
        safety:['胸腰弯患者需减小旋转幅度','避免腰椎代偿，旋转来自核心而非腰'] },
      { code:'QD-S4', deviceId:'09', name:'下肢蹬踏与平衡控制训练', device:'QD-09 下肢蹬踏测训单元 · 蹬踏', steps:'紧靠椅背屈髋屈膝，脚置踏板，双手握把，下肢肌群发力蹬踏；配合脊柱中立位保持。', cautions:'高风险 / 内固定术后禁用；需扶手保护防跌倒。', types:'所有弯型', levels:'基础/进阶', img:'images/devices/quedong-09.jpg', video:'',
        params:{ resistance:'40-60% 1RM', range:'全程（设备默认）', reason:'股四头肌 + 臀大肌 + 小腿三头肌构成站立稳定链，对应设备库 09 号机', note:'脊柱中立位保持' },
        dose:'3-4 组 × 10-12 次 · 间歇 30s',
        safety:['高风险 / 内固定术后禁用','需扶手保护防跌倒'] }
    ]
  };

  Pages.spinePlan = function () {
    const pid = AppState.spineFocusId;
    const latest = pid ? D().listByPatient(pid).filter(r => r.module === 'spine' && r.result).slice().sort((a, b) => new Date(b.assessDate) - new Date(a.assessDate))[0] : null;
    const risk = latest ? latest.result.risk : 'low';
    const riskName = latest ? latest.result.riskName : '低风险（默认）';
    /* 评估依据溯源条（D 医护端） */
    const b0 = latest ? latest.base : {};
    const e0 = latest ? latest.eval : {};
    const planTrace = [
      { label: 'Cobb 角', value: (b0.staticCobb != null ? b0.staticCobb + '°' : '—') },
      { label: 'Risser 征', value: (b0.risser != null ? b0.risser : '—') },
      { label: '足底压力比', value: (e0.pressureRatio != null ? e0.pressureRatio : '—') },
      { label: 'ATR 主弯', value: (e0.atrThMain != null ? e0.atrThMain + '°' : '—') }
    ];
    /* 动作 section（手动 + 鹊动设备，统一结构交给 PlanView 渲染） */
    const planSections = Object.keys(SPINE_ACTIONS).map(function (cat) {
      return {
        cat: cat,
        items: SPINE_ACTIONS[cat].map(function (a) {
          return {
            code: aCode(a), name: aName(a), device: aDevice(a), img: aImg(a), video: aVideo(a),
            posture: a.posture || '',
            svg: (window.SpineExerciseLib && window.SpineExerciseLib.figureSVG) ? window.SpineExerciseLib.figureSVG(a.posture) : '',
            steps: aSteps(a), cautions: aCautions(a), types: aTypes(a), levels: aLevels(a),
            dose: a.dose || '', params: a.params || null, safety: a.safety || null
          };
        })
      };
    });
    const planStat = (function () {
      let count = 0, video = 0;
      planSections.forEach(function (s) { s.items.forEach(function (it) { count++; if (it.video) video++; }); });
      return { count: count, cats: planSections.length, duration: (count * 3) + ' 分钟（估算）', video: video, cycle: '8-12 周' };
    })();
    const isMobilePlan = (window.innerWidth <= 760);
    const planBodyHtml = window.SchemeCard
      ? window.SchemeCard.renderPlan(planSections, { mode: isMobilePlan ? 'mobile' : 'pc', lib: 'spine' })
      : (isMobilePlan
        ? PlanView.renderE('spine', planSections, { patientName: pid ? ((D().getPatient(pid) || {}).name || '') : '', safety: '疼痛或头晕请立即停止；矫正支具不自行调参；训练需有人陪同，康复师可远程跟进。' })
        : PlanView.renderD('spine', planSections, { trace: planTrace, stat: planStat }));

    const wrap = U.el(`<div>
      ${moduleBanner()}
      <div class="plan-cockpit" style="--ac:#534AB7">
        <aside class="plan-rail"><div class="plan-rail-ttl"><span class="dot"></span>方案目录</div><div class="plan-rail-list" id="pl-rail"></div></aside>
        <div class="plan-main">
          <div class="card mb-3"><div class="card-body sarc-head">
            <div><span class="sarc-head-l">方案对象</span><div class="sarc-head-v">${pid ? U.esc((D().getPatient(pid) || {}).name || '') : '未选择患者'}</div></div>
            <div><span class="sarc-head-l">匹配风险等级</span><div class="sarc-head-v">${U.esc(riskName)}</div></div>
            <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
              <a class="btn btn-secondary btn-sm" href="#/spine">返回台账</a>
            </div>
          </div></div>
          ${tipBox('训练编排规则', risk === 'high'
            ? '高风险：轻柔拉伸 + 呼吸训练 ≤10 分钟；禁止自主肌力强化训练（系统强制过滤肌力类动作并告警）。'
            : risk === 'mid'
              ? '中风险：体态矫正 2-3 + 肌力(弱侧优先) 2-3 + 平衡 1-2，≤20 分钟；存在足底异常增加足踝-骨盆动作。'
              : '低风险：体态矫正 2-3 + 平衡稳定 1-2，约 15 分钟；存在足底异常增加对应足踝-骨盆动作。')}
          <div id="spine-plan-body">
            <div class="card mt-3"><div class="card-header"><h3 class="card-title"><span class="card-title-icon">🎯</span>初始推荐方案（按风险等级自动匹配）</h3></div>
              <div class="card-body">
                <div class="form-grid">
                  <div class="form-group"><label>方案名称</label><input type="text" id="pl-name" value="脊柱侧弯${riskName}康复方案"></div>
                  <div class="form-group"><label>训练频次（每周）</label><input type="text" id="pl-freq" value="3"></div>
                  <div class="form-group full-width"><label>方案说明 / 个案调整（含居家徒手 + 鹊动 1-9 设备组合说明）</label>
                    <textarea id="pl-note" rows="3" placeholder="记录动作替换、难度适配、设备参数（角速度/阻力需做机型合法范围校验）"></textarea></div>
                </div>
                <div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap;" class="no-print">
                  <button class="btn btn-primary btn-lg" id="btn-save-plan">💾 保存方案快照</button>
                  <button class="btn btn-ai btn-lg" id="btn-ai-plan"><span class="ai-icon-wrap" style="margin-right:5px;">🤖</span>AI 方案推荐</button>
                  <button class="btn btn-secondary btn-lg" id="btn-share-plan">📲 生成打卡二维码</button>
                  <button class="btn btn-primary btn-lg" id="btn-print-plan">🖨️ 打印 / 导出方案</button>
                  <span id="pl-tip" style="font-size:13px;color:var(--text-secondary);"></span>
                </div>
              </div></div>
            ${planBodyHtml}
          </div>
        </div>
      </div>
    </div>`);

    const saveBtn = U.qs('#btn-save-plan', wrap);
    if (saveBtn) saveBtn.onclick = () => {
      if (!pid) { U.toast('请先在台账选择患者', 'warning'); return; }
      const rec = {
        id: 'spineplan_' + Date.now().toString(36), module: 'spine-plan', patientId: pid,
        patientName: (D().getPatient(pid) || {}).name || '', assessDate: U.today(),
        name: U.qs('#pl-name', wrap).value, freq: U.qs('#pl-freq', wrap).value,
        note: U.qs('#pl-note', wrap).value, risk, actions: SPINE_ACTIONS, savedAt: Date.now()
      };
      D().save(rec);
      U.toast('脊柱方案已保存（生成只读快照）', 'success');
      const tip = U.qs('#pl-tip', wrap); if (tip) tip.textContent = '已保存 · ' + new Date().toLocaleString();
    };
    /* 方案页：AI 方案推荐（从最近一次评估结果构造上下文） */
    const aiPlanBtn = U.qs('#btn-ai-plan', wrap);
    if (aiPlanBtn) aiPlanBtn.onclick = () => {
      if (!spineAiReady()) U.toast('本账号未开通 AI 辅助，以下为系统内置参考建议（演示）', 'warning');
      const S = { result: latest ? latest.result : computeSpineRisk({ base: {}, eval: {} }), base: latest ? latest.base : {}, eval: latest ? latest.eval : {} };
      openAiModal('plan', S);
    };
    /* 方案页：生成手机端训练打卡分享二维码（接线 share.js spine scheme） */
    const sharePlanBtn = U.qs('#btn-share-plan', wrap);
    if (sharePlanBtn) sharePlanBtn.onclick = () => {
      if (!pid) { U.toast('请先在台账选择患者', 'warning'); return; }
      const p = D().getPatient(pid) || {};
      const planRec = { patient: { id: pid, name: p.name || '', gender: p.gender || '', age: p.age || '' }, actions: SPINE_ACTIONS };
      if (window.Share && typeof window.Share.openPlanQRModal === 'function') {
        window.Share.openPlanQRModal({ mode: 'plan', scheme: 'spine', title: (p.name || '患者') + ' 脊柱侧弯训练方案', spineRec: planRec });
      } else { U.toast('分享模块未就绪', 'error'); }
    };
    /* 方案页：打印 / 导出干预方案（与肌少症 printSarcPlan 样式一致：同款 report-doc + 二维码） */
    const printPlanBtn = U.qs('#btn-print-plan', wrap);
    if (printPlanBtn) printPlanBtn.onclick = () => {
      const p = pid ? (D().getPatient(pid) || {}) : {};
      const plRec = {
        module: 'spine-plan',
        patientId: pid,
        patientName: (D().getPatient(pid) || {}).name || '未选择患者',
        assessDate: U.today(),
        risk: risk, riskName: riskName,
        name: U.qs('#pl-name', wrap).value,
        freq: U.qs('#pl-freq', wrap).value,
        note: U.qs('#pl-note', wrap).value,
        actions: SPINE_ACTIONS,
        spineRec: { patient: { id: pid, name: p.name || '', gender: p.gender || '', age: p.age || '' }, actions: SPINE_ACTIONS }
      };
      printSpinePlan(plRec);
    };
    /* 设备处方卡（PlanView.itemCard）视频点击播放：补 PlanView 委派；徒手卡仍由 PlanMediaView 全局处理 */
    if (window.PlanView && PlanView.bindPlay) PlanView.bindPlay(wrap);

    buildPlanRail(wrap, '#spine-plan-body');
    return wrap;
  };

  /* ==================================================================
   * 独立评估报告
   * ================================================================== */
  function buildSpineReport(rec) {
    const b = rec.base || {}, e = rec.eval || {}, R = rec.result || {};
    const riskName = R.riskName || '—';
    const actionRows = Object.keys(SPINE_ACTIONS).map(cat =>
      `<tr><td><b>${U.esc(cat)}</b></td><td>${SPINE_ACTIONS[cat].map(a => U.esc(aName(a))).join('、')}</td></tr>`).join('');
    return `<style>.sp-report-doc{background:#fff;color:#1f2937;padding:24px;border-radius:12px;line-height:1.7;font-family:system-ui,'Microsoft YaHei',sans-serif}.sp-report-doc h1{font-size:22px;border-bottom:3px solid #26c6da;padding-bottom:10px;margin:0 0 12px;color:#0f172a}.sp-report-doc h3{font-size:16px;margin:18px 0 8px;color:#0f172a}.sp-report-doc table{width:100%;border-collapse:collapse;margin:12px 0}.sp-report-doc td,.sp-report-doc th{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;font-size:13px}.sp-report-doc ul{margin:8px 0;padding-left:20px}.sp-report-doc li{margin:4px 0}</style><div class="sp-report-doc" style="font-size:14px;">
      <h1>青少年脊柱健康评估报告</h1>
      <p style="color:#64748b;">评估编号：${U.esc(rec.no || '')} ｜ 登记人：${U.esc(rec.patientName || '')} ｜ 评估日期：${U.esc(rec.assessDate || '')}</p>
      <h3>一、影像学放射学基线</h3>
      <table><tbody>
        <tr><td>静态 Cobb 角</td><td>${b.staticCobb != null ? b.staticCobb + '°' : '—'}</td><td>Lenke 分型</td><td>${U.esc(b.lenke || '—')}</td></tr>
        <tr><td>Risser 征</td><td>${b.risser != null ? b.risser : '—'}</td><td>Nash-Moe 旋转</td><td>${b.nashMoe != null ? b.nashMoe + ' 级' : '—'}</td></tr>
        <tr><td>年度角度进展</td><td>${b.progressPerYear != null ? b.progressPerYear + '°/年' : '—'}</td><td>顶椎</td><td>${U.esc(b.apex || '—')}</td></tr>
      </tbody></table>
      <h3>二、多维度功能评估</h3>
      <table><tbody>
        <tr><td>ATR 主弯</td><td>${e.atrThMain != null ? e.atrThMain + '°' : '—'}</td><td>Beighton</td><td>${e.beighton != null ? e.beighton + ' 分' : '—'}</td></tr>
        <tr><td>双肩高度差</td><td>${e.shoulderDiff != null ? e.shoulderDiff + 'mm' : '—'}</td><td>躯干中线偏移</td><td>${e.trunkDeviation != null ? e.trunkDeviation + 'mm' : '—'}</td></tr>
        <tr><td>足底压力比值</td><td>${e.pressureRatio || '—'}</td><td>足型</td><td>${U.esc(e.footType || '—')}</td></tr>
        <tr><td>闭眼单脚站立</td><td>${e.eyesClosed != null ? e.eyesClosed + 's' : '—'}</td><td>握力 LSI</td><td>${e.gripLSI != null ? e.gripLSI + '%' : '—'}</td></tr>
        <tr><td>FVC</td><td>${e.fvc != null ? e.fvc + '%' : '—'}</td><td>6MWD</td><td>${e.sixMwd != null ? e.sixMwd + 'm' : '—'}</td></tr>
      </tbody></table>
      <h3>三、风险分层综合判定</h3>
      <p style="font-size:16px;"><b>风险等级：${U.esc(riskName)}</b> ｜ 建议复查周期：<b>${U.esc(R.reviewDate || '—')}</b>（${R.reviewMonths || '—'} 个月）</p>
      <ul>${R.reasons ? R.reasons.map(r => `<li>${U.esc(r)}</li>`).join('') : ''}</ul>
      <h3>四、干预方案方向</h3>
      <table><tbody>${actionRows}</tbody></table>
      ${rec.note ? '<p style="margin-top:10px;"><b>医生备注：</b>' + U.esc(rec.note) + '</p>' : ''}
      ${rec.plantarReport ? '<p style="margin-top:8px;color:#64748b;">📎 足底压力报告：' + U.esc(rec.plantarReport.fileName || '已上传') + (rec.plantarReport.viaAI ? '（AI 增强解析）' : '（自动解析回填）') + '</p>' : ''}
      ${rec.deviceCapture ? '<p style="color:#64748b;">📡 设备数据：蓝牙采集（' + U.esc(rec.deviceCapture.source || '') + '）' + (rec.deviceCapture.capturedAt ? ' · ' + U.esc(rec.deviceCapture.capturedAt) : '') + '</p>' : ''}
    </div></div>`;
  }

  /* ==================================================================
   * 脊柱方案报告（与体重管理 / 肌少症方案样式一致：复用 report-doc / sarc-doc / sarc-plan-vscroll 全局类）
   * ================================================================== */
  function spSec(num, title, icon, html) {
    if (!html) return '';
    return `<section class="report-section sarc-section">
      <div class="sarc-section-head">
        <h3 class="report-h3"><span class="sarc-section-num">${U.esc(num)}</span>${icon ? `<span class="sarc-section-emoji">${icon}</span>` : ''}<span>${U.esc(title)}</span></h3>
      </div><div class="sarc-section-body">${html}</div></section>`;
  }

  window.buildSpinePlanReport = function (rec) {
    rec = rec || {};
    const pname = rec.patientName || '未选择患者';
    const riskName = rec.riskName || '—';
    const planName = rec.name || (riskName + '康复方案');
    const freq = rec.freq || '3';
    const note = rec.note || '';
    const actions = rec.actions || SPINE_ACTIONS;

    const actionSecs = Object.keys(actions).map((cat, i) => {
      const isDevice = cat.indexOf('鹊动设备') >= 0;
      const rows = actions[cat].map(a => {
        const hasMedia = aImg(a) || aVideo(a);
        const media = hasMedia
          ? `<div style="display:flex;align-items:center;gap:6px;">${aImg(a) ? `<img src="${U.esc(aImg(a))}" alt="" style="width:56px;height:42px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" onerror="this.style.display='none'">` : ''}${aVideo(a) ? '<span style="font-size:11px;color:#0f766e;">▶视频</span>' : ''}</div>`
          : '<span style="color:#94a3b8;">—</span>';
        return `<tr>
          <td><b>${U.esc(aCode(a))}</b></td>
          <td>${U.esc(aName(a))}${isDevice && aDevice(a) ? '<br><span style="font-size:11px;color:var(--primary,#0f766e);">设备：' + U.esc(aDevice(a)) + '</span>' : ''}</td>
          <td>${U.esc(aSteps(a))}</td>
          <td>${U.esc(aCautions(a))}</td>
          <td>${U.esc(aTypes(a))}</td>
          <td>${U.esc(aLevels(a))}</td>
          <td>${media}</td>
        </tr>`;
      }).join('');
      return spSec(String(i + 1), cat, isDevice ? '🛠️' : '🧩', `
        <table class="data-table" style="width:100%;border-collapse:collapse;">
          <thead><tr><th>编码</th><th>动作${isDevice ? ' / 设备' : ''}</th><th>标准化步骤</th><th>易错点</th><th>适配弯型</th><th>难度</th><th>图示</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`);
    }).join('');

    const summary = `<div class="sarc-summary">
      <div class="sarc-sum-cell sarc-sum-info"><div class="sarc-sum-label">方案对象</div><div class="sarc-sum-value">${U.esc(pname)}</div></div>
      <div class="sarc-sum-cell sarc-sum-info"><div class="sarc-sum-label">匹配风险等级</div><div class="sarc-sum-value">${U.esc(riskName)}</div></div>
      <div class="sarc-sum-cell sarc-sum-info"><div class="sarc-sum-label">生成日期</div><div class="sarc-sum-value">${U.esc(rec.assessDate || U.today())}</div></div>
    </div>`;

    const overview = spSec('', '脊柱侧弯康复干预方案', '🎯', `
      <div class="report-ex-card" style="border-left:4px solid var(--primary);">
        <b>方案概要</b>
        <p><b>方案名称：</b>${U.esc(planName)}<br>
        <b>训练频次：</b>每周 ${U.esc(freq)} 次<br>
        <b>方案说明 / 个案调整：</b>${note ? U.esc(note) : '（未填写）'}</p>
      </div>`);

    return `<div class="report-doc sarc-doc sarc-plan-vscroll" data-scope="spine">
      <img class="report-mascot no-print" src="assets/qoo.png" alt="" onerror="this.remove()">
      ${summary}
      ${overview}
      ${actionSecs}
      <div class="report-sign"><div>评估医师签名：____________</div><div>日期：____________</div></div>
      <div class="report-footer">本报告依据《青少年特发性脊柱侧凸诊疗指南》《中国儿童青少年脊柱侧弯防控专家共识》生成，属青少年脊柱健康专项独立模块输出，仅供临床参考。</div>
    </div>`;
  };

  /* 打印 / 导出：脊柱侧弯训练方案（复用肌少症 printSarcPlan 同款 #report-print-stage + 二维码流程） */
  async function printSpinePlan(rec) {
    let stage = document.getElementById('report-print-stage');
    if (!stage) { stage = document.createElement('div'); stage.id = 'report-print-stage'; document.body.appendChild(stage); }
    const actions = rec.actions || (rec.spineRec && rec.spineRec.actions) || SPINE_ACTIONS;
    const sections = Object.keys(actions).map(function (cat) {
      return {
        cat: cat,
        items: actions[cat].map(function (a) {
          return {
            code: aCode(a), name: aName(a), device: aDevice(a), img: aImg(a), video: aVideo(a),
            posture: a.posture || '',
            svg: (window.SpineExerciseLib && window.SpineExerciseLib.figureSVG) ? window.SpineExerciseLib.figureSVG(a.posture) : '',
            steps: aSteps(a), cautions: aCautions(a), types: aTypes(a), levels: aLevels(a),
            dose: a.dose || '', params: a.params || null, safety: a.safety || null
          };
        })
      };
    });
    /* 打印版同样富集动作库已上传媒体（与屏幕版一致：无则回退小Qoo 占位） */
    try {
      const lib = (window.DB && window.DB.getPlanLibrary) ? await window.DB.getPlanLibrary() : [];
      sections.forEach(function (s) { s.items.forEach(function (it) {
        if (it.device || it.img || it.video) return;
        const m = lib.filter(function (x) { return x && x.name === it.name; })[0];
        if (m) { if (m.image) it.img = m.image; if (m.video) it.video = m.video; }
      }); });
    } catch (e) {}
    let qrHtml = '';
    try {
      qrHtml = (await window.Share.buildPlanQrBlock({
        mode: 'plan', scheme: 'spine',
        spineRec: rec.spineRec || { patient: { id: rec.patientId, name: rec.patientName }, actions: actions },
        title: (rec.patientName || '') + ' 脊柱侧弯训练方案'
      })) || '';
    } catch (e) { /* 二维码生成失败不影响打印 */ }
    const html = window.SchemeCard
      ? window.SchemeCard.renderPlan(sections, {
          mode: 'print', lib: 'spine',
          title: rec.name || ((rec.patientName || '') + ' 脊柱侧弯训练方案'),
          sub: '对象：' + (rec.patientName || '未选择') + '　频次：' + (rec.freq || '3') + ' 次/周　风险：' + (rec.riskName || ''),
          qrHtml: qrHtml
        })
      : PlanView.renderF('spine', sections, {
          title: rec.name || ((rec.patientName || '') + ' 脊柱侧弯训练方案'),
          sub: '对象：' + (rec.patientName || '未选择') + '　频次：' + (rec.freq || '3') + ' 次/周　风险：' + (rec.riskName || ''),
          qrHtml: qrHtml
        });
    stage.innerHTML = html;
    const clear = () => { stage.innerHTML = ''; window.onafterprint = null; };
    window.onafterprint = clear;
    setTimeout(() => window.print(), 80);
  }

  /* 脊柱模块移动端适配样式注入（自包含，不依赖外部 CSS，避免与全局样式冲突） */
  function injectSpineStyle() {
    if (document.getElementById('spine-style')) return;
    var css = [
      /* AI 参考弹窗：演示横幅 + 页脚注 */
      '.sp-demo-banner{margin:0 0 14px;padding:10px 14px;border-radius:10px;font-size:13px;line-height:1.7;color:#92400e;background:#fffbeb;border:1px solid #fde68a;}',
      '.sp-demo-banner b{color:#b45309;}',
      '.sp-demo-foot{margin-left:auto;font-size:12px;color:var(--text-muted);align-self:center;}',
      '/* 动作库：图片/视频缩略图 + 设备标签 */',
      '.sp-action-media{display:flex;align-items:center;gap:8px;min-width:90px;}',
      '.sp-action-media img{width:64px;height:48px;object-fit:cover;border-radius:6px;background:var(--bg-subtle);border:1px solid var(--border-color);}',
      '.sp-action-media .sp-action-play{font-size:12px;padding:4px 8px;white-space:nowrap;}',
      '.sp-device-tag{display:inline-block;font-size:11px;color:var(--primary);background:var(--primary-bg);padding:2px 8px;border-radius:99px;margin-top:4px;}',
      '.sp-action-table td{vertical-align:top;}',
      '.sp-action-table td:nth-child(2){min-width:130px;}',
      /* 移动端：台账/方案表格去固定最小宽度，避免横向溢出挤压 */
      '@media (max-width: 768px) {',
      '  .ledger-spine-wrap table, .plan-cockpit table { min-width: 0 !important; font-size: 12px; }',
      '  .ledger-spine-wrap .data-table th, .ledger-spine-wrap .data-table td, .plan-cockpit .data-table th, .plan-cockpit .data-table td { padding: 7px 8px; white-space: normal; }',
      '  .plan-cockpit { display: block; }',
      '  .plan-rail { margin-bottom: 12px; }',
      '  .sarc-head { gap: 12px; }',
      '  .ai-modal-full { width: 100vw !important; max-width: 100vw !important; }',
      '  .ai-modal-full .modal-body, .ai-modal-full .modal-content { padding: 12px; }',
      '  .ai-gen-sec h4 { font-size: 14px; }',
      '  .sp-demo-foot { width: 100%; margin: 8px 0 0; }',
      '}',
      '@media (max-width: 480px) {',
      '  .ledger-spine-wrap .form-grid { grid-template-columns: 1fr !important; }',
      '  .sarc-head-v { font-size: 14px; }',
      '}'
    ];
    var st = document.createElement('style');
    st.id = 'spine-style';
    st.textContent = css.join('\n');
    document.head.appendChild(st);
  }
  injectSpineStyle();

  window.buildSpineReport = buildSpineReport;

})();
