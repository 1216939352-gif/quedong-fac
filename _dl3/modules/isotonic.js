/**
 * 鹊动FAC功能评估与干预系统 - 等张肌力评估模块
 * 按官方报告格式（等速+等张测试报告）逐台设备录入：保存本台设备 → 可继续录入 → 点击「生成解读报告」统一生成
 * 支持 手动录入 + 官方 PDF 解析回填 + 图片/扫描件 OCR 回填
 */
(function () {
  'use strict';

  // 等张测评可选全部鹊动 1-9 号设备
  const iotDevices = CONST.DEVICES;

  function patient() { return AppState.patient || {}; }
  function bw() { return U.num(patient().weight) || 70; }
  function gender() { return patient().gender || 'male'; }

  function records() {
    const p = DB.getPatientById(AppState.currentPatientId);
    return (p && p.data && p.data.isotonicData) ? p.data.isotonicData : [];
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
    p.data.isotonicData = list;
    p.updatedAt = new Date().toISOString();
    await DB.saveFullPatient(p);
    AppState.isotonicData = list;
    return true;
  }

  function calcAuto(rec) {
    const bodyWeight = bw();
    const oneRML = U.num(rec.oneRML), oneRMR = U.num(rec.oneRMR);
    const rm1BwL = (oneRML && bodyWeight) ? U.round(oneRML / bodyWeight, 2) : U.num(rec.rm1BwL);
    const rm1BwR = (oneRMR && bodyWeight) ? U.round(oneRMR / bodyWeight, 2) : U.num(rec.rm1BwR);
    let lsi = U.num(rec.lsi);
    if ((lsi === null || lsi === undefined) && rm1BwL !== null && rm1BwR !== null) {
      const mx = Math.max(rm1BwL, rm1BwR);
      lsi = mx ? U.round(Math.abs(rm1BwL - rm1BwR) / mx * 100, 1) : null;
    }
    const xrmL = U.num(rec.xrmL), xrmR = U.num(rec.xrmR);
    const loadL = U.num(rec.loadL), loadR = U.num(rec.loadR);
    const repsL = U.num(rec.repsL), repsR = U.num(rec.repsR);
    const est1RML = (oneRML === null && loadL && repsL) ? U.round(loadL * (1 + repsL / 30), 1) : null;
    const est1RMR = (oneRMR === null && loadR && repsR) ? U.round(loadR * (1 + repsR / 30), 1) : null;
    return { ...rec, rm1BwL, rm1BwR, lsi, est1RML, est1RMR };
  }

  function toScoreRecord(rec) {
    return {
      oneRML: rec.oneRML || rec.est1RML,
      oneRMR: rec.oneRMR || rec.est1RMR,
      reps: rec.repsL || rec.repsR,
      loadWeight: rec.loadL || rec.loadR,
      lsi: rec.lsi
    };
  }

  /** 构造「鹊动小Qoo 报告解读」所需的评估上下文（仅取结构化字段，避免冗余） */
  function buildIotAIContext() {
    const cur = records();
    const p = patient();
    return {
      module: 'isotonic-strength',
      patient: { name: p.name, age: p.age, gender: gender() },
      assessment: {
        records: cur.map(function (r) {
          const dev = CONST.DEVICES.find(function (d) { return d.id === r.deviceId; }) || { name: r.deviceId };
          return {
            device: dev.name, deviceId: r.deviceId, side: r.side, testDate: r.testDate, lsi: r.lsi,
            loadL: r.loadL, loadR: r.loadR, repsL: r.repsL, repsR: r.repsR,
            oneRML: r.oneRML || r.est1RML, oneRMR: r.oneRMR || r.est1RMR,
            rm1BwL: r.rm1BwL, rm1BwR: r.rm1BwR
          };
        })
      }
    };
  }

  function renderScoreCard(rec) {
    const scored = rec._scored || Calc.isotonicScore(toScoreRecord(rec), gender(), bw());
    rec._scored = scored;
    return `<div style="margin-top:18px;">${window.buildStrengthScoreCard(scored)}</div>`;
  }

  function renderHistory() {
    const list = records().sort((a, b) => new Date(b.testDate) - new Date(a.testDate));
    if (!list.length) return '<div class="empty-state">暂无等张测评记录</div>';
    return `
    <div class="card" style="margin-top:18px;">
      <div class="card-header"><h3 class="card-title">测评历史 (${list.length})</h3></div>
      <div class="card-body" style="padding:0;">
        <table class="data-table">
          <thead><tr><th>日期</th><th>设备</th><th>侧别</th><th>负荷(kg)</th><th>次数</th><th>1RM(kg)</th><th>1RM/BW</th><th>LSI</th><th>综合</th><th>操作</th></tr></thead>
          <tbody>
            ${list.map((r, idx) => {
              const dev = CONST.DEVICES.find(d => d.id === r.deviceId) || { name: r.deviceId };
              const s = r._scored || Calc.isotonicScore(toScoreRecord(r), gender(), bw());
              return `<tr data-idx="${list.length - 1 - idx}">
                <td>${U.esc(r.testDate)}</td>
                <td>${U.esc(dev.name || dev.code)}</td>
                <td>${{left:'左侧',right:'右侧',bilateral:'双侧'}[r.side] || r.side}</td>
                <td>${r.loadL ?? '—'} / ${r.loadR ?? '—'}</td>
                <td>${r.repsL ?? '—'} / ${r.repsR ?? '—'}</td>
                <td>${r.oneRML || r.est1RML || '—'} / ${r.oneRMR || r.est1RMR || '—'}</td>
                <td>${r.rm1BwL ?? '—'} / ${r.rm1BwR ?? '—'}</td>
                <td>${r.lsi ?? '—'}%</td>
                <td><span class="badge badge-${s.level}">${s.total}</span></td>
                <td><button class="btn btn-ghost btn-sm iot-load" data-idx="${list.length - 1 - idx}">载入</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function fieldSet(title, prefix) {
    return `
    <div class="form-section">
      <h4 class="form-section-title">${U.esc(title)}</h4>
      <div class="form-row" style="grid-template-columns: repeat(3, 1fr);">
        <div class="form-group"><label>负荷重量 (kg)</label><input type="number" step="0.5" name="${prefix}load" /></div>
        <div class="form-group"><label>重复次数</label><input type="number" name="${prefix}reps" /></div>
        <div class="form-group"><label>XRM (kg)</label><input type="number" step="0.5" name="${prefix}xrm" placeholder="若已知" /></div>
        <div class="form-group"><label>1RM (kg)</label><input type="number" step="0.5" name="${prefix}1rm" placeholder="实测或估算" /></div>
        <div class="form-group"><label>1RM/BW</label><input type="number" step="0.01" name="${prefix}rm1bw" placeholder="自动" /></div>
      </div>
    </div>`;
  }

  function deviceOptions() {
    return iotDevices.map(d => `<option value="${d.id}">${d.id}号 ${U.esc(d.name)}</option>`).join('');
  }

  Pages.isotonic = async function () {
    const bodyWeight = bw();
    const list = records();

    const html = `
    <div class="page-header">
      <div>
        <h2 class="page-title">等张肌力评估</h2>
        <p class="text-muted">适配鹊动 01-09 号测训单元 · 当前体重 ${bodyWeight} kg</p>
      </div>
      <div class="topbar-actions no-print">
        <button class="btn btn-secondary" id="iot-demo">一键演示数据</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">单台设备测评录入 / 解析回填</h3></div>
      <div class="card-body" id="iot-form-body">
        <div class="form-section">
          <h4 class="form-section-title">测评标识</h4>
        <div class="form-row" style="grid-template-columns: repeat(3, 1fr);">
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
          <div class="form-group"><label>LSI (%) <span class="text-muted">可选</span></label>
            <input type="number" step="0.1" name="lsi" placeholder="自动计算" /></div>
          <div class="form-group" style="grid-column: span 2;"><label>测试备注</label>
            <input type="text" name="note" placeholder="可选" /></div>
        </div>
        </div>

        <div class="form-section" id="iot-test-section">
          ${fieldSet('测试数据', 's')}
        </div>

        <div class="form-section" style="background:transparent; border:1px dashed var(--border-color); padding:14px; border-radius:12px;">
          <h4 class="form-section-title">上传官方 PDF / 图片 / 扫描件自动解析</h4>
          <div class="form-row" style="grid-template-columns: 1fr auto auto auto;">
            <input type="file" id="iot-file" accept="application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,image/*" />
            <button type="button" class="btn btn-secondary" id="iot-parse">解析 PDF</button>
            <button type="button" class="btn btn-secondary" id="iot-excel">解析 Excel</button>
            <button type="button" class="btn btn-secondary" id="iot-ocr">OCR 图片</button>
          </div>
          <p class="text-muted" style="font-size:12px; margin-top:8px;">支持官方 PDF 报告、Excel 表格（.xlsx，自动识别等张指标）、扫描件图片（OCR，需联网）。常见字段：重量、重复次数、XRM、1RM、1RM/BW。</p>
          <div id="iot-file-status"></div>
        </div>

        <div class="form-row no-print" style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
          <button class="btn btn-primary" id="iot-save">保存本台设备</button>
          <button class="btn btn-success" id="iot-generate">生成解读报告</button>
          <button class="btn btn-ghost" id="iot-reset">清空本台表单</button>
        </div>
      </div>
    </div>

    <div id="iot-result-panel" style="margin-top:18px;">
      <div class="alert alert-info"><div><strong>提示</strong>
        <p style="margin:6px 0 0;">每填写/上传完成一台设备后请点击「保存本台设备」。待全部设备保存后，点击「生成解读报告」即可生成五维评估与五级评级（仅部分设备数据亦可生成）。</p></div></div>
    </div>

    <div id="iot-history">${renderHistory()}</div>
    `;
    const root = U.el(`<div>${html}</div>`);
    const formBody = U.qs('#iot-form-body', root);
    const resultPanel = U.qs('#iot-result-panel', root);

    // 草稿自动保存（输入即落盘，刷新/误关后可续填）
    const iotDraft = SmartForm.bindDraft(formBody, 'iot-form');

    function getFormRec() {
      const fd = U.formData(formBody);
      const sload = U.num(fd.sload), sreps = U.num(fd.sreps), sxrm = U.num(fd.sxrm), s1rm = U.num(fd.s1rm), srm1bw = U.num(fd.srm1bw);
      return calcAuto({
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8),
        deviceId: fd.deviceId, side: fd.side, testDate: fd.testDate, note: fd.note,
        loadL: sload, loadR: sload,
        repsL: sreps, repsR: sreps,
        xrmL: sxrm, xrmR: sxrm,
        oneRML: s1rm, oneRMR: s1rm,
        rm1BwL: srm1bw, rm1BwR: srm1bw,
        lsi: U.num(fd.lsi)
      });
    }

    function fill(rec) {
      U.fillForm(formBody, {
        deviceId: rec.deviceId, side: rec.side, testDate: rec.testDate, note: rec.note,
        sload: rec.loadL ?? rec.loadR,
        sreps: rec.repsL ?? rec.repsR,
        sxrm: rec.xrmL ?? rec.xrmR,
        s1rm: rec.oneRML ?? rec.oneRMR,
        srm1bw: rec.rm1BwL ?? rec.rm1BwR,
        lsi: rec.lsi
      });
    }

    function resetForm() {
      const inputs = U.qsa('input,select', formBody);
      inputs.forEach(i => {
        if (i.type === 'date') i.value = U.today();
        else if (i.tagName === 'SELECT' && i.name !== 'deviceId') i.selectedIndex = 0;
        else if (!i.name) {}
        else i.value = '';
      });
    }

    U.qs('#iot-demo', root).addEventListener('click', () => {
      fill({ deviceId: '03', side: 'bilateral', testDate: U.today(), loadL: 20, loadR: 22, repsL: 10, repsR: 10, oneRML: 26, oneRMR: 28, lsi: 7.5 });
      U.toast('已填充演示数据（请点击保存本台设备）', 'success');
    });

    U.qs('#iot-save', root).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const fd = U.formData(formBody);
      if (!fd.deviceId || !fd.side || !fd.testDate) { U.toast('请填写设备、侧别、日期', 'error'); return; }
      await U.withBtn(btn, '保存中…', async () => {
        const rec = getFormRec();
        rec._scored = Calc.isotonicScore(toScoreRecord(rec), gender(), bw());
        const cur = records(); cur.push(rec);
        const ok = await persist(cur);
        if (!ok) { U.toast('保存失败，可能是网络或服务器问题，请重试', 'error'); return; }
        iotDraft.clear();
        U.qs('#iot-history', root).innerHTML = renderHistory();
        bindHistory();
        U.toast(`已保存本台设备（${cur.length} 台）`, 'success');
        if (confirm('已保存本台设备。是否继续录入/上传下一台设备？点击「取消」可结束并生成解读。')) {
          resetForm();
        }
      });
    });

    U.qs('#iot-generate', root).addEventListener('click', (e) => {
      const cur = records();
      if (!cur.length) { U.toast('暂无已保存的等张测评数据', 'warning'); return; }
      U.withBtn(e.currentTarget, '生成中…', () => {
      const cards = cur.map(r => {
        const dev = CONST.DEVICES.find(d => d.id === r.deviceId) || { name: r.deviceId };
        const head = `<div class="report-strength-head"><b>${U.esc(dev.name)}</b> · ${U.esc(r.testDate || '')} · ${{left:'左侧',right:'右侧',bilateral:'双侧'}[r.side] || '双侧'}</div>`;
        const card = r._scored ? window.buildStrengthScoreCard(r._scored) : renderScoreCard(r);
        return head + card;
      }).join('');
      resultPanel.innerHTML = `<h3 class="card-title" style="margin-bottom:10px;">等张肌力评估解读（${cur.length} 台）</h3><div id="iot-report-system">${cards}</div>`;
      // 鹊动小Qoo 报告解读入口
      if (window.AIReason && typeof window.AIReason.attachInterpretButton === 'function') {
        try { window.AIReason.attachInterpretButton(resultPanel, buildIotAIContext, { title: '鹊动小Qoo 报告解读', systemEl: U.qs('#iot-report-system', resultPanel) }); } catch (e) { console.warn('[isotonic] AI 解读按钮挂载失败', e); }
      }
      U.toast('已生成等张解读报告', 'success');
      });
    });

    U.qs('#iot-reset', root).addEventListener('click', () => { resetForm(); U.toast('已清空本台表单', 'info'); });

    function bindHistory() {
      U.qsa('.iot-load', root).forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          fill(records()[idx]);
          U.toast('已载入历史记录，可修改后再次保存', 'info');
        });
      });
    }
    bindHistory();

    U.qs('#iot-parse', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iot-file', root);
      const status = U.qs('#iot-file-status', root);
      const file = fileInput.files[0];
      if (!file) { U.toast('请先选择 PDF 文件', 'warning'); return; }
      if (file.type !== 'application/pdf') { U.toast('该解析仅支持 PDF，图片请用 OCR', 'warning'); return; }
      let rawOcrText = null;
      try {
        const fields = await runIotParseFlow(file, status, (txt) => { rawOcrText = txt; });
        // AI 增强：文本大模型 / 视觉兜底抽取，补全正则遗漏字段（失败静默回退）
        let aiFields = null, aiInfo = null;
        try {
          if (rawOcrText && window.AIReason && typeof window.AIReason.parseReport === 'function') {
            status.innerHTML = `<p style="font-size:13px;color:var(--primary);"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能解析中...</p>`;
            const ai = await window.AIReason.parseReport({ ocrText: rawOcrText, typeHint: 'isotonic', file });
            if (ai && ai.fields) { aiFields = ai.fields; aiInfo = { provider: ai.provider, usedVision: ai.usedVision }; }
          }
        } catch (e) { console.warn('[isotonic] AI 解析增强失败（已回退正则结果）', e); }
        const merged = Object.assign({}, fields || {}, aiFields || {});
        if (!merged || !hasIotMetrics(merged)) {
          renderIotFailure(status, rawOcrText, merged || {});
          return;
        }
        merged.layout = (fields && fields.layout) || (aiFields ? '鹊动小Qoo 智能识别' : '');
        fillIotFields(merged);
        renderIotSuccess(status, merged, aiInfo);
        U.toast('PDF 解析完成' + (aiFields ? '（含 AI 增强）' : ''), 'success');
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">解析失败：${U.esc(U.errMsg(e))}</p>${rawOcrText ? renderRawOcrBlock(rawOcrText, U.errMsg(e)) : ''}`;
        U.toast('PDF 解析失败', 'error');
      }
    });

    /* 双路径 parseFile → IsoOCR.scan（与 isokinetic 一样的三段式架构） */
    async function runIotParseFlow(file, statusEl, onOcrText) {
      let fields = null;
      let raw = null;
      // 路径 1：parseFile（自带 OCR 兜底）
      try {
        statusEl.innerHTML = '<p style="font-size:13px; color:var(--primary);">第 1 步：数字解析（含内置 OCR 兜底）...</p>';
        const res = await PdfParser.parseFile(file, { typeHint: 'isotonic' });
        if (res.rawText && res.rawText.length >= 20) { raw = res.rawText; }
        if (res.type === 'isotonic' && hasIotMetrics(res.fields)) {
          fields = { ...res.fields, _ocrText: res.rawText || '' };
        }
      } catch (e) { /* 静默 → 走 OCR */ }
      // 路径 2：IsoOCR.scan（专门优化 QueDong 等张格式）
      if (!fields && typeof window.IsoOCR === 'object' && typeof window.IsoOCR.scan === 'function') {
        try {
          statusEl.innerHTML = '<p style="font-size:13px; color:var(--primary);">第 2 步：调用 OCR 引擎（pdfjs 渲染 + Tesseract 识别）...</p>';
          const of = await window.IsoOCR.scan(file, (p) => {
            statusEl.innerHTML = `<p style="font-size:13px; color:var(--primary);">第 2 步：OCR 识别中... ${Math.max(20, p)}%</p>`;
          });
          if (of && of._ocrText) { raw = of._ocrText; }
          if (of && hasIotMetrics(of)) fields = of;
        } catch (e2) { /* 留 raw */ }
      }
      if (raw) onOcrText(raw);
      return fields;
    }

    function hasIotMetrics(f) {
      if (!f) return false;
      return !!(f.load || f.reps || f.xrm || f.rm1 || f.rm1Bw || (f.oneRM && !isNaN(f.oneRM)));
    }

    function fillIotFields(f) {
      fill({
        deviceId: f.deviceId || '03',
        side: f.side || 'bilateral',
        testDate: f.testDate || U.today(),
        loadL: f.load, loadR: f.load,
        repsL: f.reps, repsR: f.reps,
        xrmL: f.xrm, xrmR: f.xrm,
        oneRML: f.rm1, oneRMR: f.rm1,
        rm1BwL: f.rm1Bw, rm1BwR: f.rm1Bw
      });
    }

    function renderIotSuccess(statusEl, fields, aiInfo) {
      const items = [
        ['deviceId', '设备号'],
        ['side', '肢体侧'],
        ['testDate', '测试日期'],
        ['load', '负荷重量 (kg)'],
        ['reps', '重复次数'],
        ['xrm', 'XRM (kg)'],
        ['rm1', '1RM (kg)'],
        ['rm1Bw', '1RM/BW'],
        ['age', '年龄'],
        ['gender', '性别'],
        ['layout', '识别模板']
      ];
      let html = `<div style="margin-top:10px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);font-size:12.5px;line-height:1.7;">`;
      html += `<b style="color:var(--success);">✅ 解析完成（${fields.layout ? 'QueDong 标准 ' + fields.layout.replace('quedong.', '') : '已抽取'}）</b><br/>`;
      if (aiInfo) {
        const via = aiInfo.usedVision ? '视觉模型' : '文本大模型';
        html += `<div style="margin:6px 0;padding:5px 9px;border-radius:7px;background:rgba(56,132,255,.08);border:1px solid rgba(56,132,255,.25);font-size:12px;color:var(--primary);"><span class="ai-icon-wrap">${qooIcon('sm')}</span>鹊动小Qoo 智能解析已增强（${via} · 源：${aiInfo.provider}），仅供参考请核对。</div>`;
      }
      for (const [k, t] of items) {
        const v = fields[k];
        if (v == null || v === '') continue;
        const dot = '✅';
        html += `${dot} <span style="display:inline-block;min-width:140px;">${t}</span> <b style="color:var(--primary);">${v}</b><br/>`;
      }
      html += `</div>`;
      statusEl.innerHTML = html;
    }

    function renderIotFailure(statusEl, rawOcrText, fields) {
      const sid = 'iot-failure-' + Date.now();
      statusEl.innerHTML = `
        <div id="${sid}" style="font-size:13px;">
          <p style="color:var(--danger);margin-bottom:8px;">未能从 PDF 中抽取到有效等张指标（重量/重复次数/XRM/1RM/1RM-BW）。可能是扫描件清晰度不足或文本被 OCR 误识。</p>
          ${rawOcrText ? `
            <details open>
              <summary style="cursor:pointer;color:var(--primary);user-select:none;">📄 查看/编辑 OCR 抽取的原文（${(rawOcrText.length || 0)} 字）</summary>
              <textarea data-iot-ocr-text style="width:100%;min-height:140px;margin-top:6px;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-tertiary);color:var(--text-primary);box-sizing:border-box;">${U.esc(rawOcrText)}</textarea>
              <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">可修改后点击右侧按钮，系统会按当前规则重新抽取指标。</p>
            </details>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" data-iot-reparse style="font-size:12.5px;padding:6px 14px;">基于原文重新解析</button>
              <button type="button" class="btn btn-secondary" data-iot-show-fields style="font-size:12.5px;padding:6px 14px;">查看已抽到的字段</button>
            </div>
          ` : '<p style="font-size:12.5px;color:var(--text-muted);">未获取到 OCR 原文，可改用 Excel 或手动录入。</p>'}
        </div>`;
      const root = statusEl.querySelector('#' + sid);
      const ta = root && root.querySelector('[data-iot-ocr-text]');
      const btns = root && root.querySelectorAll('.btn');
      if (ta && btns && btns[0]) {
        btns[0].addEventListener('click', () => {
          const edited = ta.value || '';
          let f = null;
          if (typeof window.IsoOCR === 'object') {
            if (window.IsoOCR.detectReportLayout(edited) === 'quedong.isotonic' ||
                /1RM\s*[\/／]\s*BW|重复次数|XRM/i.test(edited)) {
              f = window.IsoOCR.parseQueDongIsotonic(edited);
            } else {
              f = window.IsoOCR.parseFields(edited);
            }
          }
          if (!f) f = {};
          const merged = { ...fields, ...f, layout: '用户校对OCR' };
          renderIotResult(merged, statusEl, '基于校对原文中');
          U.toast('已按校对后原文重新抽取', 'success');
        });
      }
      if (ta && btns && btns[1]) btns[1].addEventListener('click', () => renderIotResult(fields || {}, statusEl, '已抓到的字段'));
    }

    function renderIotResult(fields, statusEl, label) {
      const items = [
        ['deviceId', '设备号'],
        ['side', '肢体侧'],
        ['testDate', '测试日期'],
        ['load', '负荷重量 (kg)'],
        ['reps', '重复次数'],
        ['xrm', 'XRM (kg)'],
        ['rm1', '1RM (kg)'],
        ['rm1Bw', '1RM/BW'],
        ['age', '年龄'],
        ['gender', '性别']
      ];
      let html = `<div style="margin-top:10px;padding:10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-card);font-size:12.5px;line-height:1.7;">`;
      html += `<b style="color:var(--primary);">🔍 ${U.esc(label)}：</b><br/>`;
      for (const [k, t] of items) {
        const v = fields[k];
        const dot = v != null && v !== '' ? '✅' : '⚪';
        html += `${dot} <span style="display:inline-block;min-width:140px;">${t}</span> <b style="color:${v != null ? 'var(--primary)' : 'var(--text-muted)'};">${v != null && v !== '' ? v : '未识别'}</b><br/>`;
      }
      html += `</div>`;
      statusEl.innerHTML = html;
    }

    function renderRawOcrBlock(rawOcrText, errMsg) {
      return `<details style="margin-top:8px;"><summary style="cursor:pointer;color:var(--danger);user-select:none;">📄 查看 OCR 原文</summary><pre style="white-space:pre-wrap;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.55;padding:8px;border:1px dashed var(--border-color);border-radius:8px;background:var(--bg-tertiary);max-height:200px;overflow:auto;">${U.esc(rawOcrText)}</pre></details>`;
    }

    // Excel 表格识别（.xlsx，纯前端解析，离线可用）
    U.qs('#iot-excel', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iot-file', root);
      const status = U.qs('#iot-file-status', root);
      const file = fileInput.files[0];
      if (!file) { U.toast('请先选择 Excel 文件', 'warning'); return; }
      if (!/\.xlsx?$/i.test(file.name)) { U.toast('该解析仅支持 .xlsx 文件', 'warning'); return; }
      status.innerHTML = '<p style="font-size:13px; color:var(--primary);">正在解析 Excel 表格...</p>';
      try {
        if (typeof window.ExcelParser !== 'object') throw new Error('Excel 解析模块未加载');
        const res = await window.ExcelParser.parseFile(file);
        const f = res.fields;
        if (f.type === 'isokinetic') throw new Error('该 Excel 识别为等速报告，请在「等速肌力评估」页面解析。');
        const load = f.load, reps = f.reps, xrm = f.xrm, rm1 = f.rm1, rm1Bw = f.rm1Bw, lsi = f.lsi;
        const hasData = [load, reps, xrm, rm1, rm1Bw].some(v => v != null);
        if (!hasData) {
          status.innerHTML = `<p style="font-size:13px; color:var(--danger);">未能从 Excel 中识别到有效等张指标（负荷 / 次数 / XRM / 1RM）。请确认表格包含这些字段，或改用 PDF 上传、手动录入。</p>${excelPreview(res.sheets[0])}`;
          U.toast('Excel 未识别到有效数据，请核对或手动录入', 'warning');
          return;
        }
        fill({ deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          loadL: load, loadR: load, repsL: reps, repsR: reps, xrmL: xrm, xrmR: xrm,
          oneRML: rm1, oneRMR: rm1, rm1BwL: rm1Bw, rm1BwR: rm1Bw, lsi });
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">Excel 解析完成（${f.rm1 != null || f.load != null ? '置信度高' : '置信度中，请核对'}）。已回填等张指标，请核对后保存本台设备。</p>${parsedPreview({
          deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          load: load, reps: reps, xrm: xrm, rm1: rm1, rm1Bw: rm1Bw, lsi: lsi
        })}${excelPreview(res.sheets[0])}`;
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

    function parsedPreview(flat) {
      const sideMap = { left: '左侧', right: '右侧', bilateral: '双侧' };
      const rows = [
        ['测评设备', flat.deviceId ? `${flat.deviceId}号机` : '—'],
        ['侧别', sideMap[flat.side] || flat.side || '—'],
        ['测试日期', flat.testDate || '—'],
        ['负荷重量', flat.load != null ? `${flat.load} kg` : '—'],
        ['重复次数', flat.reps != null ? flat.reps : '—'],
        ['XRM', flat.xrm != null ? `${flat.xrm} kg` : '—'],
        ['1RM', flat.rm1 != null ? `${flat.rm1} kg` : '—'],
        ['1RM/BW', flat.rm1Bw != null ? flat.rm1Bw : '—'],
        ['LSI', flat.lsi != null ? `${flat.lsi}%` : '—']
      ];
      return `<div class="parsed-preview" style="margin-top:12px;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
        <div style="padding:8px 12px;background:var(--bg-secondary);font-weight:600;font-size:13px;">已解析数据（已同步回填上方表格，请核对）</div>
        <table class="data-table" style="font-size:12.5px;margin:0;">
          <tbody>${rows.map(r => `<tr><td style="width:40%;color:var(--text-secondary);">${U.esc(r[0])}</td><td style="font-weight:600;">${U.esc(r[1])}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    }

    U.qs('#iot-ocr', root).addEventListener('click', async () => {
      const fileInput = U.qs('#iot-file', root);
      const status = U.qs('#iot-file-status', root);
      if (!fileInput.files[0]) { U.toast('请先选择图片/扫描件', 'warning'); return; }
      status.innerHTML = '<p style="font-size:13px; color:var(--primary);">正在 OCR 识别...</p>';
      try {
        if (typeof window.IsoOCR !== 'object' || typeof window.IsoOCR.scan !== 'function') throw new Error('OCR 模块未加载');
        const f = await window.IsoOCR.scan(fileInput.files[0], (p) => {
          status.innerHTML = `<p style="font-size:13px; color:var(--primary);">正在 OCR 识别... ${p}%</p>`;
        });
        // 注意：parseQueDongIsotonic 返回的字段名为 load/reps/xrm/rm1/rm1Bw（非 loadWeight/oneRM）
        fill({ deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          loadL: f.load, loadR: f.load, repsL: f.reps, repsR: f.reps,
          xrmL: f.xrm, xrmR: f.xrm, oneRML: f.rm1, oneRMR: f.rm1, rm1BwL: f.rm1Bw, rm1BwR: f.rm1Bw });
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">OCR 完成，请核对字段后保存本台设备。</p>${parsedPreview({
          deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          load: f.load, reps: f.reps, xrm: f.xrm, rm1: f.rm1, rm1Bw: f.rm1Bw, lsi: null
        })}`;
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">OCR 失败：${U.esc(U.errMsg(e))}（请手动录入）</p>`;
      }
    });

    return root;
  };
})();
