/**
 * 鹊动FAC功能评估与干预系统 - 等速肌力评估模块
 * 按《等速肌力 + 1RM 综合测试报告》格式设计手动录入（向心/离心/向心·离心%）
 * 流程：每台设备填写或上传 → 点击「保存本台设备」→ 询问是否继续 →
 *       全部完成后点击「生成解读报告」方可生成五维解读（支持部分设备生成）
 */
(function () {
  'use strict';

  // 等速测评可选全部鹊动 1-9 号设备
  const isoDevices = CONST.DEVICES;

  function patient() { return AppState.patient || {}; }
  function bw() { return U.num(patient().weight) || 70; }
  function gender() { return patient().gender || 'male'; }

  function records() {
    const p = DB.getPatientById(AppState.currentPatientId);
    return (p && p.data && p.data.isokineticData) ? p.data.isokineticData : [];
  }

  // 确保存在患者上下文：否则旧逻辑会在 if(!p) 处静默 return，导致“假保存、真丢失”
  async function ensurePatient() {
    if (AppState.currentPatientId && DB.getPatientById(AppState.currentPatientId)) return true;
    if (!AppState.currentUser) { U.toast('请先登录后再保存测评', 'error'); return false; }
    if (!AppState.patient || !AppState.patient.name) {
      AppState.patient = AppState.patient || {};
      AppState.patient.name = AppState.patient.name || '肌力测评档案（未关联患者）';
    }
    const created = await DB.createPatient({
      doctorUsername: AppState.currentUser.username,
      patientName: AppState.patient.name,
      data: {}
    });
    AppState.currentPatientId = created.id;
    if (typeof loadDoctorPatients === 'function') await loadDoctorPatients();
    return true;
  }

  async function persist(list) {
    if (!(await ensurePatient())) return false;
    const p = DB.getPatientById(AppState.currentPatientId);
    if (!p) { U.toast('患者档案不存在，无法保存', 'error'); return false; }
    if (!p.data) p.data = {};
    p.data.isokineticData = list;
    p.updatedAt = new Date().toISOString();
    await DB.saveFullPatient(p);
    AppState.isokineticData = list;
    return true;
  }

  /* 指标列（与 docx 等速表头一致） */
  const ISO_METRICS = [
    ['peakTorque', '峰值力矩 (N·m)'],
    ['peakForce', '峰值力量 (N)'],
    ['peakAngle', '峰值角度 (°)'],
    ['avgPeakTorque', '平均峰值力矩 (N·m)'],
    ['torquePerBw', '峰力矩/体重 (N·m/kg)'],
    ['maxWork', '最大做功 (J)'],
    ['avgWork', '平均做功 (J)'],
    ['totalWork', '总功 (J)'],
    ['maxPower', '最大功率 (W)'],
    ['avgPower', '平均功率 (W)'],
    ['fatigueIndex', '疲劳指数']
  ];

  function entryRow(prefix, label, sub) {
    return `<tr>
      <th class="iso-row-label">${label}${sub ? `<small>${sub}</small>` : ''}</th>
      ${ISO_METRICS.map(m => `<td><input type="number" step="0.01" name="${prefix}_${m[0]}" placeholder="—" /></td>`).join('')}
    </tr>`;
  }

  function entryTable() {
    return `
    <div class="iso-entry-wrap">
      <table class="iso-entry-table">
        <thead><tr><th>项目</th>${ISO_METRICS.map(m => `<th>${m[1]}</th>`).join('')}</tr></thead>
        <tbody>
          ${entryRow('c', '向心', 'Concentric')}
          ${entryRow('e', '离心', 'Eccentric')}
          ${entryRow('r', '向心 / 离心 (%)', 'C/E')}
        </tbody>
      </table>
    </div>`;
  }

  /* 把表单字段映射到记录结构 + 派生评分所需旧字段 */
  function getFormRec(formBody) {
    const fd = U.formData(formBody);
    const bodyWeight = bw();
    const read = (p) => ({
      peakTorque: U.num(fd[p + '_peakTorque']),
      peakForce: U.num(fd[p + '_peakForce']),
      peakAngle: U.num(fd[p + '_peakAngle']),
      avgPeakTorque: U.num(fd[p + '_avgPeakTorque']),
      torquePerBw: U.num(fd[p + '_torquePerBw']),
      maxWork: U.num(fd[p + '_maxWork']),
      avgWork: U.num(fd[p + '_avgWork']),
      totalWork: U.num(fd[p + '_totalWork']),
      maxPower: U.num(fd[p + '_maxPower']),
      avgPower: U.num(fd[p + '_avgPower']),
      fatigueIndex: U.num(fd[p + '_fatigueIndex'])
    });
    const concentric = read('c'), eccentric = read('e'), ratio = read('r');

    // 自动补 PT/BW：若未填峰力矩/体重，则用峰值力矩/体重估算
    if (concentric.torquePerBw == null && concentric.peakTorque != null && bodyWeight) {
      concentric.torquePerBw = U.round(concentric.peakTorque / bodyWeight, 2);
    }
    if (eccentric.torquePerBw == null && eccentric.peakTorque != null && bodyWeight) {
      eccentric.torquePerBw = U.round(eccentric.peakTorque / bodyWeight, 2);
    }

    const ptbw = concentric.torquePerBw != null ? concentric.torquePerBw
      : (eccentric.torquePerBw != null ? eccentric.torquePerBw : null);
    const fi = concentric.fatigueIndex != null ? concentric.fatigueIndex
      : (eccentric.fatigueIndex != null ? eccentric.fatigueIndex : null);
    const avgPower = concentric.avgPower != null ? concentric.avgPower
      : (eccentric.avgPower != null ? eccentric.avgPower : null);

    return {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8),
      deviceId: fd.deviceId,
      side: fd.side,
      testDate: fd.testDate,
      speed: U.num(fd.speed),
      rom: fd.rom,
      concentric, eccentric, ratio,
      note: fd.note,
      // 派生旧结构（保证评分/历史/分享兼容）
      ptbwL: ptbw, ptbwR: ptbw,
      fiL: fi, fiR: fi,
      hqL: null, hqR: null,
      lsi: U.num(fd.lsi),
      avgPowerL: avgPower, avgPowerR: avgPower
    };
  }

  function toScoreRecord(rec) {
    return {
      ptbwL: rec.ptbwL, ptbwR: rec.ptbwR,
      fiL: rec.fiL, fiR: rec.fiR,
      hqL: rec.hqL, hqR: rec.hqR,
      lsi: rec.lsi,
      avgPowerL: rec.avgPowerL, avgPowerR: rec.avgPowerR
    };
  }

  /** 构造「鹊动小Qoo 报告解读」所需的评估上下文（仅取结构化字段，避免冗余） */
  function buildIsoAIContext() {
    const cur = records();
    const p = patient();
    return {
      module: 'isokinetic-strength',
      patient: { name: p.name, age: p.age, gender: gender() },
      assessment: {
        records: cur.map(function (r) {
          const dev = CONST.DEVICES.find(function (d) { return d.id === r.deviceId; }) || { name: r.deviceId };
          return {
            device: dev.name, deviceId: r.deviceId, side: r.side, testDate: r.testDate,
            speed: r.speed, lsi: r.lsi,
            concentric: r.concentric, eccentric: r.eccentric, ratio: r.ratio
          };
        })
      }
    };
  }

  function renderScoreCard(rec) {
    const scored = rec._scored || Calc.isokineticScore(toScoreRecord(rec), gender());
    rec._scored = scored;
    return `<div style="margin-top:18px;">${window.buildStrengthScoreCard(scored)}</div>`;
  }

  function renderHistory() {
    const list = records().slice().sort((a, b) => new Date(b.testDate) - new Date(a.testDate));
    if (!list.length) return '<div class="empty-state">暂无等速测评记录</div>';
    return `
    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">测评历史 (${list.length})</h3></div>
      <div class="card-body" style="padding:0;">
        <table class="data-table">
          <thead><tr>
            <th>日期</th><th>设备</th><th>侧别</th><th>速度</th>
            <th>向心 PT/BW</th><th>疲劳指数</th><th>平均功率</th><th>综合评分</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${list.map((r, idx) => {
              const dev = CONST.DEVICES.find(d => d.id === r.deviceId) || { name: r.deviceId };
              const s = r._scored || Calc.isokineticScore(toScoreRecord(r), gender());
              const ci = (r.concentric && r.concentric.torquePerBw != null) ? U.round(r.concentric.torquePerBw, 2) : '—';
              const fi = (r.concentric && r.concentric.fatigueIndex != null) ? r.concentric.fatigueIndex : '—';
              const ap = (r.concentric && r.concentric.avgPower != null) ? r.concentric.avgPower : '—';
              return `<tr data-idx="${list.length - 1 - idx}">
                <td>${U.esc(r.testDate)}</td>
                <td>${U.esc(dev.name || dev.code)}</td>
                <td>${{left:'左侧',right:'右侧',bilateral:'双侧'}[r.side] || r.side}</td>
                <td>${r.speed != null ? r.speed + ' °/s' : '—'}</td>
                <td>${ci}</td>
                <td>${fi}</td>
                <td>${ap}</td>
                <td><span class="badge badge-${s.level}">${s.total}</span></td>
                <td><button class="btn btn-ghost btn-sm iso-load" data-idx="${list.length - 1 - idx}">载入</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function deviceOptions() {
    return isoDevices.map(d => `<option value="${d.id}">${d.id}号 ${U.esc(d.name)}</option>`).join('');
  }

  Pages.isokinetic = async function () {
    const p = patient();
    const bodyWeight = bw();
    const list = records();

    const html = `
    <div class="page-header">
      <div>
        <h2 class="page-title">等速肌力评估</h2>
        <p class="text-muted">适配鹊动 01-09 号测训单元 · 当前体重 ${bodyWeight} kg</p>
      </div>
      <div class="topbar-actions no-print">
        <button class="btn btn-secondary" id="iso-demo">一键演示数据</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">单台设备测评录入 / 解析回填</h3></div>
      <div class="card-body" id="iso-form-body">
        <div class="form-section">
          <h4 class="form-section-title">测评标识</h4>
          <div class="form-row" style="grid-template-columns: repeat(4, 1fr);">
            <div class="form-group"><label>测评设备 <span class="required">*</span></label>
              <select name="deviceId" required>${deviceOptions()}</select></div>
            <div class="form-group"><label>侧别 <span class="required">*</span></label>
              <select name="side" required>
                <option value="left">左侧</option>
                <option value="right">右侧</option>
                <option value="bilateral" selected>双侧</option>
              </select></div>
            <div class="form-group"><label>测试日期 <span class="required">*</span></label>
              <input type="date" name="testDate" value="${U.today()}" required /></div>
            <div class="form-group"><label>测试速度 (°/s)</label>
              <input type="number" name="speed" placeholder="如 60" /></div>
            <div class="form-group"><label>运动范围 ROM</label>
              <input type="text" name="rom" placeholder="如 0°-90°" /></div>
            <div class="form-group"><label>肢体对称指数 LSI (%) <span class="text-muted">可选</span></label>
              <input type="number" step="0.1" name="lsi" placeholder="左右差值" /></div>
            <div class="form-group" style="grid-column: span 2;"><label>测试备注</label>
              <input type="text" name="note" placeholder="可选" /></div>
          </div>
        </div>

        <div class="form-section">
          <h4 class="form-section-title">等速测试数据（按官方报告格式填写）</h4>
          ${entryTable()}
          <p class="text-muted" style="font-size:12px; margin-top:8px;">速度 / 运动范围 已置于上方标识区；下表按「向心 / 离心 / 向心·离心%」三行逐一录入对应指标。</p>
        </div>

        <div class="form-section" style="background:transparent; border:1px dashed var(--border-color); padding:14px; border-radius:12px;">
          <h4 class="form-section-title">上传官方 PDF / 图片 / 扫描件自动解析</h4>
          <div class="form-row" style="grid-template-columns: 1fr auto auto auto;">
            <input type="file" id="iso-file" accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,image/*" />
            <button type="button" class="btn btn-secondary" id="iso-parse">解析 PDF</button>
            <button type="button" class="btn btn-secondary" id="iso-excel">解析 Excel</button>
            <button type="button" class="btn btn-secondary" id="iso-ocr">OCR 识别</button>
          </div>
          <p class="text-muted" style="font-size:12px; margin-top:8px;">支持官方 PDF 报告、Excel 表格（.xlsx，自动识别等速/等张指标）、扫描件图片或扫描型 PDF（OCR 渲染后逐页识别，F-Max 周期对比报告会列出每周期峰值力矩）。失败可手动录入。</p>
          <div id="iso-file-status"></div>
        </div>

        <div class="form-row no-print" style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-primary" id="iso-save">保存本台设备</button>
          <button class="btn btn-success" id="iso-generate">生成解读报告</button>
          <button class="btn btn-ghost" id="iso-reset">清空本台表单</button>
        </div>
      </div>
    </div>

    <div id="iso-result-panel" style="margin-top:18px;">
      <div class="alert alert-info"><div><strong>提示</strong>
        <p style="margin:6px 0 0;">每填写/上传完成一台设备后请点击「保存本台设备」。待全部设备保存后，点击「生成解读报告」即可生成五维评估与五级评级（仅部分设备数据亦可生成）。</p></div></div>
    </div>

    <div id="iso-history">${renderHistory()}</div>
    `;
    const root = U.el(`<div>${html}</div>`);
    const formBody = U.qs('#iso-form-body', root);
    const resultPanel = U.qs('#iso-result-panel', root);
    const deviceSel = U.qs('[name="deviceId"]', formBody);
    const sideSel = U.qs('[name="side"]', formBody);
    const noSideDevices = ['03', '04'];
    function updateSideState() {
      const disabled = noSideDevices.includes(deviceSel.value);
      sideSel.disabled = disabled;
      if (disabled) {
        sideSel.value = 'bilateral';
        sideSel.classList.add('disabled-select');
      } else {
        sideSel.classList.remove('disabled-select');
      }
    }
    deviceSel.addEventListener('change', updateSideState);
    updateSideState();

    // 草稿自动保存（输入即落盘，刷新/误关后可续填）
    const isoDraft = SmartForm.bindDraft(formBody, 'iso-form');

    function fillFromRecord(rec) {
      if (!rec) return;
      const f = {};
      f.deviceId = rec.deviceId; f.side = rec.side; f.testDate = rec.testDate;
      f.speed = rec.speed; f.rom = rec.rom; f.note = rec.note; f.lsi = rec.lsi;
      ['c', 'e', 'r'].forEach(p => {
        const src = rec[p === 'c' ? 'concentric' : p === 'e' ? 'eccentric' : 'ratio'] || {};
        ISO_METRICS.forEach(m => { f[p + '_' + m[0]] = src[m[0]] != null ? src[m[0]] : ''; });
      });
      U.fillForm(formBody, f);
      updateSideState();
    }

    // 解析回填：flat 为解析器返回的完整 fields（含 concentricPT/eccentricPT/ptBw/totalWork/avgPower/fatigueIndex/
    // maxWork/avgWork/maxPower/concentricForce/concentricAngle/concentricAvgPT 及其离心对应项）
    function fillFromFlat(flat) {
      const c = {
        peakTorque: flat.concentricPT, peakForce: flat.concentricForce, peakAngle: flat.concentricAngle,
        avgPeakTorque: flat.concentricAvgPT, torquePerBw: flat.concentricPtBw != null ? flat.concentricPtBw : flat.ptBw,
        maxWork: flat.concentricMaxWork != null ? flat.concentricMaxWork : flat.maxWork,
        avgWork: flat.concentricAvgWork != null ? flat.concentricAvgWork : flat.avgWork,
        totalWork: flat.concentricTotalWork != null ? flat.concentricTotalWork : flat.totalWork,
        maxPower: flat.concentricMaxPower != null ? flat.concentricMaxPower : flat.maxPower,
        avgPower: flat.concentricAvgPower != null ? flat.concentricAvgPower : flat.avgPower,
        fatigueIndex: flat.concentricFatigueIndex != null ? flat.concentricFatigueIndex : flat.fatigueIndex
      };
      const e = {
        peakTorque: flat.eccentricPT != null ? flat.eccentricPT : flat.concentricPT,
        peakForce: flat.eccentricForce, peakAngle: flat.eccentricAngle, avgPeakTorque: flat.eccentricAvgPT,
        torquePerBw: flat.eccentricPtBw,
        maxWork: flat.eccentricMaxWork,
        avgWork: flat.eccentricAvgWork,
        totalWork: flat.eccentricTotalWork,
        maxPower: flat.eccentricMaxPower,
        avgPower: flat.eccentricAvgPower,
        fatigueIndex: flat.eccentricFatigueIndex
      };
      const r = { torquePerBw: flat.ratio_ptBw, avgPower: flat.ratio_avgPower };
      fillFromRecord({
        deviceId: flat.deviceId, side: flat.side, testDate: flat.testDate,
        speed: flat.speed, rom: flat.rom, note: '', lsi: flat.lsi,
        concentric: c, eccentric: e, ratio: r
      });
      updateSideState();
    }

    // 解析结果里是否提取到任何有效数值指标（避免“解析成功但全空”误导用户）
    function hasParseMetrics(flat) {
      const keys = ['concentricPT', 'eccentricPT', 'ptBw', 'totalWork', 'avgPower', 'fatigueIndex',
        'maxWork', 'avgWork', 'maxPower', 'concentricAngle', 'eccentricAngle',
        'concentricForce', 'eccentricForce', 'concentricAvgPT', 'eccentricAvgPT',
        'eccentricMaxWork', 'eccentricAvgWork', 'eccentricAvgPower', 'deficitPct'];
      return !!flat && keys.some(k => flat[k] != null);
    }

    U.qs('#iso-demo', root).addEventListener('click', () => {
      fillFromRecord({
        deviceId: '01', side: 'bilateral', testDate: U.today(), speed: 60, rom: '0°-90°',
        concentric: { peakTorque: 90.77, peakForce: 320, peakAngle: 42, avgPeakTorque: 88.5, torquePerBw: 1.26, maxWork: 46, avgWork: 40, totalWork: 44.48, maxPower: 4.6, avgPower: 4.32, fatigueIndex: 55 },
        eccentric: { peakTorque: 118.4, peakForce: 410, peakAngle: 45, avgPeakTorque: 115, torquePerBw: 1.64, maxWork: 60, avgWork: 52, totalWork: 58, maxPower: 6.0, avgPower: 5.6, fatigueIndex: 52 },
        ratio: { torquePerBw: 77, avgPower: 77 },
        note: '演示数据', lsi: 8.5
      });
      U.toast('已填充演示数据', 'success');
    });

    U.qs('#iso-reset', root).addEventListener('click', () => {
      U.qs('form', formBody) ? formBody.reset() : null;
      const inputs = U.qsa('input,select', formBody);
      inputs.forEach(i => { if (i.type === 'date') i.value = U.today(); else if (i.tagName === 'SELECT') i.selectedIndex = 0; else i.value = ''; });
      U.toast('已清空本台表单', 'info');
    });

    U.qs('#iso-save', root).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const fd = U.formData(formBody);
      if (!fd.deviceId || !fd.side || !fd.testDate) { U.toast('请填写设备、侧别、日期', 'error'); return; }
      await U.withBtn(btn, '保存中…', async () => {
        const rec = getFormRec(formBody);
        rec._scored = Calc.isokineticScore(toScoreRecord(rec), gender());
        const cur = records();
        cur.push(rec);
        const ok = await persist(cur);
        if (!ok) { U.toast('保存失败，可能是网络或服务器问题，请重试', 'error'); return; }
        isoDraft.clear();
        U.qs('#iso-history', root).innerHTML = renderHistory();
        bindHistory();
        U.toast('本台设备报告已保存', 'success');
        const cont = window.confirm('已保存本台设备报告。是否继续上传/填写下一台设备？\n（选择「确定」可继续录入，选择「取消」则结束录入）');
        if (cont) {
          U.qsa('input,select', formBody).forEach(i => { if (i.name === 'testDate') i.value = U.today(); else if (i.tagName === 'SELECT' && i.name !== 'deviceId' && i.name !== 'side') i.selectedIndex = 0; else if (!i.name) {} else i.value = ''; });
          formBody.querySelector('[name="deviceId"]').focus();
          U.toast('请继续录入下一台设备', 'info');
        }
      });
    });

    U.qs('#iso-generate', root).addEventListener('click', (e) => {
      const cur = records();
      if (!cur.length) { U.toast('请先保存至少一台设备数据', 'warning'); return; }
      U.withBtn(e.currentTarget, '生成中…', () => {
      const cards = cur.map(r => {
        const scored = r._scored || Calc.isokineticScore(toScoreRecord(r), gender());
        r._scored = scored;
        const dev = CONST.DEVICES.find(d => d.id === r.deviceId) || { name: r.deviceId };
        const head = `<div class="report-strength-head"><b>${U.esc(dev.name)}</b> · ${U.esc(r.testDate || '')} · ${{left:'左侧',right:'右侧',bilateral:'双侧'}[r.side] || '双侧'}</div>`;
        return head + window.buildStrengthScoreCard(scored);
      }).join('');
      resultPanel.innerHTML = `<h3 class="card-title" style="margin-bottom:12px;">等速肌力解读报告（${cur.length} 台设备）</h3><div id="iso-report-system">${cards}</div>`;
      // 鹊动小Qoo 报告解读入口
      if (window.AIReason && typeof window.AIReason.attachInterpretButton === 'function') {
        try { window.AIReason.attachInterpretButton(resultPanel, buildIsoAIContext, { title: '鹊动小Qoo 报告解读', systemEl: U.qs('#iso-report-system', resultPanel) }); } catch (e) { console.warn('[isokinetic] AI 解读按钮挂载失败', e); }
      }
      U.toast('解读报告已生成', 'success');
      });
    });

    function bindHistory() {
      U.qsa('.iso-load', root).forEach(btn => btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx);
        fillFromRecord(records()[idx]);
        U.toast('已载入该设备数据，可修改后重新保存', 'info');
      }));
    }
    bindHistory();

    U.qs('#iso-parse', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iso-file', root);
      const status = U.qs('#iso-file-status', root);
      const file = fileInput.files[0];
      if (!file) { U.toast('请先选择 PDF 文件', 'warning'); return; }
      if (file.type !== 'application/pdf') { U.toast('该解析仅支持 PDF，图片请用 OCR', 'warning'); return; }
      status.innerHTML = '<p style="font-size:13px; color:var(--primary);">正在解析 PDF...</p>';
      let rawOcrText = null;        // 任何路径产出的原始 OCR 文本（供手动校对）
      let sourceLabel = '';          // 数字解析 / OCR 扫描件
      try {
        const fields = await runParseFlow(file, status, (txt, src) => { rawOcrText = txt; sourceLabel = src; });
        // AI 增强：文本大模型 / 视觉兜底抽取，补全正则遗漏字段（失败静默回退）
        let aiFields = null, aiInfo = null;
        try {
          if (rawOcrText && window.AIReason && typeof window.AIReason.parseReport === 'function') {
            status.innerHTML = `<p style="font-size:13px;color:var(--primary);"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能解析中...</p>`;
            const ai = await window.AIReason.parseReport({ ocrText: rawOcrText, typeHint: 'isokinetic', file });
            if (ai && ai.fields) { aiFields = ai.fields; aiInfo = { provider: ai.provider, usedVision: ai.usedVision }; }
          }
        } catch (e) { console.warn('[isokinetic] AI 解析增强失败（已回退正则结果）', e); }
        const merged = Object.assign({}, fields || {}, aiFields || {});
        if (!merged || !hasParseMetrics(merged)) {
          // 即便抽到 0 字段，也显示 OCR 原文与字段视图，让用户能看到/能改
          renderIsoFailure(status, rawOcrText, merged || {});
          return;
        }
        renderIsoSuccess(status, merged, sourceLabel + (aiFields ? ' + AI' : ''), aiInfo);
        U.toast('PDF 解析完成' + (aiFields ? '（含 AI 增强）' : ''), 'success');
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">解析失败：${U.esc(U.errMsg(e))}</p>${rawOcrText ? renderRawOcrBlock(rawOcrText, U.errMsg(e)) : ''}`;
        U.toast('PDF 解析失败', 'error');
      }
    });

    /* 真正干活的解析流程：先数字解析（parseFile 已内置 OCR 兜底），失败时再调 IsoOCR.scan 双路径；
       返回 fields，同时通过 onOcrText 回调把 OCR 原文给出去（供 UI 显示/编辑）。 */
    async function runParseFlow(file, statusEl, onOcrText) {
      let fields = null, digitalOk = false;
      let raw = null, src = '';
      // 路径 1：parseFile（文字型 PDF 快路径；扫描型会自动落到内部 ocrPdfPages）
      try {
        statusEl.innerHTML = '<p style="font-size:13px; color:var(--primary);">第 1 步：数字解析（含内置 OCR 兜底）...</p>';
        const res = await PdfParser.parseFile(file, { typeHint: 'isokinetic' });
        const ocrTxt = (res && res.rawText) ? res.rawText : '';
        if (ocrTxt && ocrTxt.length >= 20 && ocrTxt !== '(OCR 路径暂未跑)' && !/^[\s\n]*$/.test(ocrTxt)) {
          raw = ocrTxt; src = res.parsedViaOcr ? 'parseFile-OCR' : 'parseFile-Digital';
        }
        if (res.type === 'isokinetic' && hasParseMetrics(res.fields)) {
          fields = { ...res.fields, _ocrText: ocrTxt };
          digitalOk = true;
        }
      } catch (e) {
        // 静默：可能 PDF 是纯扫描件，parseFile 内部 OCR 也不够，下一步兜底
      }
      // 路径 2：IsoOCR.scan（独立 OCR 路径，layout-aware routing）
      if (!fields && typeof window.IsoOCR === 'object' && typeof window.IsoOCR.scan === 'function') {
        try {
          statusEl.innerHTML = '<p style="font-size:13px; color:var(--primary);">第 2 步：调用 OCR 引擎（pdfjs 渲染 + Tesseract 识别）...</p>';
          const of = await window.IsoOCR.scan(file, (p) => {
            statusEl.innerHTML = `<p style="font-size:13px; color:var(--primary);">第 2 步：OCR 识别中... ${Math.max(20, p)}%（可能需 30~60 秒）</p>`;
          });
          if (of) {
            fields = of;
            if (of._ocrText) { raw = of._ocrText; src = 'IsoOCR-OCR'; }
          }
        } catch (e2) {
          // 留 raw 继续显示
        }
      }
      // 路径 1 拿到 rawText 但字段不足时，用 IsoOCR.parseQueDongIsokinetic 二次提取 QueDong 特有字段
      if (raw && (!fields || !hasParseMetrics(fields)) && typeof window.IsoOCR === 'object') {
        const layout = window.IsoOCR.detectReportLayout(raw);
        if (layout === 'quedong.isokinetic') {
          const qf = window.IsoOCR.parseQueDongIsokinetic(raw);
          if (qf && hasParseMetrics(qf)) {
            fields = { ...(fields || {}), ...qf, _ocrText: raw, layout };
            src = src ? src + '+QueDongParse' : 'QueDongParse';
          }
        }
      }
      if (raw) onOcrText(raw, src);
      return fields;
    }

    /* 解析失败时的 UI：OCR 原文（可编辑）+ 重新解析按钮 + 抽到的字段视图 */
    function renderIsoFailure(statusEl, rawOcrText, fields) {
      const sid = 'iso-failure-' + Date.now();
      statusEl.innerHTML = `
        <div id="${sid}" style="font-size:13px;">
          <p style="color:var(--danger);margin-bottom:8px;">未能从 PDF 中抽取到有效等速指标（峰值力矩 / 力矩体重比 / 总功 / 平均功率 / 疲劳指数 等）。可能是扫描件清晰度不足或文本被 OCR 误识。</p>
          ${rawOcrText ? `
            <details open>
              <summary style="cursor:pointer;color:var(--primary);user-select:none;">📄 查看/编辑 OCR 抽取的原文（${(rawOcrText.length || 0)} 字）</summary>
              <textarea data-iso-ocr-text style="width:100%;min-height:160px;margin-top:6px;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);box-sizing:border-box;">${U.esc(rawOcrText)}</textarea>
              <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">可直接修改后点击右侧按钮，系统会按当前规则重新抽取指标。</p>
            </details>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" data-iso-reparse style="font-size:12.5px;padding:6px 14px;">基于原文重新解析</button>
              <button type="button" class="btn btn-secondary" data-iso-show-fields style="font-size:12.5px;padding:6px 14px;">查看已抽到的字段</button>
            </div>
          ` : '<p style="font-size:12.5px;color:var(--text-muted);">未获取到 OCR 原文，可改用 Excel 或手动录入。</p>'}
        </div>`;
      const root = statusEl.querySelector('#' + sid);
      const ta = root && root.querySelector('[data-iso-ocr-text]');
      const btns = root && root.querySelectorAll('.btn');
      if (ta && btns && btns[0]) {
        btns[0].addEventListener('click', () => {
          const edited = ta.value || '';
          const f = (typeof window.IsoOCR === 'object') ? window.IsoOCR.parseFields(edited) : null;
          if (!f) return;
          renderIsoResult(f, statusEl, '用户校对OCR');
          U.toast('已按校对后原文重新抽取', 'success');
        });
      }
      if (ta && btns && btns[1]) btns[1].addEventListener('click', () => renderIsoResult(fields || {}, statusEl, '已抓到的字段', false));
    }

    /* 渲染抽到的字段视图（成功或失败都可复用） */
    function renderIsoResult(fields, statusEl, label, autofill, aiInfo) {
      const items = [
        ['concentricPT', '峰值力矩 (N·m)'],
        ['ptBw', '峰力矩/体重 / PT/BW'],
        ['fatigueIndex', '疲劳指数 (%)'],
        ['totalWork', '总功 (J)'],
        ['avgPower', '平均功率 (W)'],
        ['deviceId', '设备号'],
        ['side', '肢体侧'],
        ['testDate', '测试日期']
      ];
      const fmax = fields.fmaxCycles || []; const periods = fields.periods || [];
      let html = `<div style="margin-top:10px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);font-size:12.5px;line-height:1.7;">`;
      html += `<b style="color:var(--primary);">🔍 ${U.esc(label)}：</b><br/>`;
      if (aiInfo) {
        const via = aiInfo.usedVision ? '视觉模型' : '文本大模型';
        html += `<div style="margin:6px 0;padding:5px 9px;border-radius:7px;background:rgba(56,132,255,.08);border:1px solid rgba(56,132,255,.25);font-size:12px;color:var(--primary);"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能解析已增强（${via} · 源：${aiInfo.provider}），仅供参考请核对。</div>`;
      }
      for (const [k, t] of items) {
        const v = fields[k];
        const dot = v != null && v !== '' ? '✅' : '⚪️';
        html += `${dot} <span style="display:inline-block;min-width:120px;">${t}</span> <b style="color:${v != null ? 'var(--primary)' : 'var(--text-muted)'};">${v != null ? v : '未识别'}</b><br/>`;
      }
      if (fmax.length) {
        const pl = (i) => periods[i] != null ? `第 ${periods[i]} 周期` : `周期 ${i + 1}`;
        html += `<br/><b style="color:var(--primary);">📈 F-Max 周期对比（${fmax.length} 项）：</b><br/>`;
        for (let i = 0; i < fmax.length; i++) {
          html += `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-tertiary);"><b>${U.esc(pl(i))}</b>：F-Max ${fmax[i]} N·m</span>`;
        }
        if (periods.length === 0) html += `<span class="text-muted">（未识别到周期序号，已按出现顺序标记）</span>`;
      }
      html += `</div>`;
      statusEl.innerHTML = html;
    }

    function renderIsoSuccess(statusEl, fields, viaLabel, aiInfo) {
      renderIsoResult(fields, statusEl, '解析完成 ' + (viaLabel || ''), true, aiInfo);
      fillFromFlat(fields);
      U.toast('PDF 解析完成', 'success');
    }

    /* 只在彻底失败（连 OCR 原文都没拿到）时用 */
    function renderRawOcrBlock(rawOcrText, errMsg) {
      return `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--danger);user-select:none;">📄 查看 OCR 原文</summary><pre style="white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.55;padding:8px;border:1px dashed var(--border-color);border-radius:8px;background:var(--bg-tertiary);max-height:200px;overflow:auto;">${U.esc(rawOcrText)}</pre></details>`;
    }

    // Excel 表格识别（.xlsx，纯前端解析，离线可用）
    U.qs('#iso-excel', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iso-file', root);
      const status = U.qs('#iso-file-status', root);
      const file = fileInput.files[0];
      if (!file) { U.toast('请先选择 Excel 文件', 'warning'); return; }
      if (!/\.xlsx?$/i.test(file.name)) { U.toast('该解析仅支持 .xlsx 文件', 'warning'); return; }
      status.innerHTML = '<p style="font-size:13px; color:var(--primary);">正在解析 Excel 表格...</p>';
      try {
        if (typeof window.ExcelParser !== 'object') throw new Error('Excel 解析模块未加载');
        const res = await window.ExcelParser.parseFile(file);
        const f = res.fields;
        if (f.type === 'isotonic') throw new Error('该 Excel 识别为等张报告，请在「等张肌力评估」页面解析。');
        if (!hasParseMetrics(f)) {
          status.innerHTML = `<p style="font-size:13px; color:var(--danger);">未能从 Excel 中识别到有效等速指标（峰力矩 / 力矩体重比 / 总功 / 平均功率 等）。请确认表格包含这些字段，或改用 PDF 上传、手动录入。</p>${excelPreview(res.sheets[0])}`;
          U.toast('Excel 未识别到有效数据，请核对或手动录入', 'warning');
          return;
        }
        fillFromFlat(f);
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">Excel 解析完成（${f.concentricPT != null ? '置信度高' : '置信度中，请核对'}），已自动回填上方表格。</p>${excelPreview(res.sheets[0])}`;
        U.toast('Excel 解析完成', 'success');
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">解析失败：${U.esc(U.errMsg(e))}</p>`;
        U.toast('Excel 解析失败', 'error');
      }
    });

    function excelPreview(sheet) {
      const rows = (sheet && sheet.rows || []).slice(0, 30)
        .map(r => `<tr>${r.map(c => `<td>${c === '' ? '' : U.esc(c)}</td>`).join('')}</tr>`).join('');
      if (!rows) return '';
      return `<div style="margin-top:10px;max-height:220px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;">
        <table class="data-table" style="font-size:12px;margin:0;"><tbody>${rows}</tbody></table></div>`;
    }

    // 解析结果已通过 fillFromFlat 自动回填上方录入表格，不再于下方重复生成预览文本框

    // OCR 图片/扫描件解析（T6 实现，联网时生效，离线优雅降级）
    U.qs('#iso-ocr', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iso-file', root);
      const status = U.qs('#iso-file-status', root);
      if (!fileInput.files[0]) { U.toast('请先选择图片/扫描件/PDF', 'warning'); return; }
      if (typeof window.IsoOCR !== 'object' || typeof window.IsoOCR.scan !== 'function') { U.toast('OCR 模块未加载', 'error'); return; }
      const file = fileInput.files[0];
      const isPdf = window.IsoOCR.isPdfFile && window.IsoOCR.isPdfFile(file);
      status.innerHTML = `<p style="font-size:13px; color:var(--primary);">${isPdf ? '正在渲染 PDF 并 OCR 识别...' : '正在 OCR 识别...'}</p>`;
      try {
        const fields = await window.IsoOCR.scan(file, (p) => {
          status.innerHTML = `<p style="font-size:13px; color:var(--primary);">${isPdf ? '正在渲染 PDF 并 OCR 识别' : '正在 OCR 识别'}... ${p}%</p>`;
        });
        if (!hasParseMetrics(fields)) {
          status.innerHTML = `<p style="font-size:13px; color:var(--danger);">OCR 未能识别到有效等速指标，请确认图片清晰且为官方报告，或手动录入。</p>`;
          U.toast('OCR 未识别到有效指标，请手动录入', 'warning');
          return;
        }
        fillFromFlat(fields);
        // 若识别到 F-Max 多周期（周期对比报告），补充展示周期数值
        const fmax = (fields.fmaxCycles || []);
        const periods = (fields.periods || []);
        let extra = '';
        if (fmax.length > 1 || periods.length > 0) {
          const periodLabel = (i) => periods[i] != null ? `第 ${periods[i]} 周期` : `周期 ${i + 1}`;
          const items = fmax.slice(0, 8).map((v, i) => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border:1px solid var(--border-color);border-radius:8px;font-size:12px;background:var(--bg-tertiary);"><b>${U.esc(periodLabel(i))}</b>：F-Max ${v} N·m</span>`).join('');
          extra = `<div style="margin-top:8px;padding:8px 10px;border:1px dashed var(--border-color);border-radius:8px;background:var(--bg-card);font-size:12.5px;line-height:1.7;">
            <b style="color:var(--primary);">📈 F-Max 周期对比：</b><br/>${items || '<span class="text-muted">未识别到周期序号</span>'}
            ${fmax.length > 8 ? `<span class="text-muted">…共 ${fmax.length} 个周期</span>` : ''}
          </div>`;
        }
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">OCR 识别完成，已自动回填上方表格，请核对后保存本台设备。</p>${extra}`;
        U.toast('OCR 识别完成', 'success');
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">OCR 失败：${U.esc(U.errMsg(e))}。可手动录入。</p>`;
        U.toast('OCR 识别失败', 'error');
      }
    });

    return root;
  };
})();
