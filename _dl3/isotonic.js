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

  function persist(list) {
    const p = DB.getPatientById(AppState.currentPatientId);
    if (!p) return;
    if (!p.data) p.data = {};
    p.data.isotonicData = list;
    p.updatedAt = new Date().toISOString();
    DB.saveFullPatient(p);
    AppState.isotonicData = list;
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
          <div class="form-row" style="grid-template-columns: repeat(4, 1fr);">
            <div class="form-group"><label>测评设备 <span class="required">*</span></label>
              <select name="deviceId" required>${deviceOptions()}</select></div>
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

    function getFormRec() {
      const fd = U.formData(formBody);
      const sload = U.num(fd.sload), sreps = U.num(fd.sreps), sxrm = U.num(fd.sxrm), s1rm = U.num(fd.s1rm), srm1bw = U.num(fd.srm1bw);
      return calcAuto({
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 8),
        deviceId: fd.deviceId, side: 'bilateral', testDate: fd.testDate, note: fd.note,
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
        deviceId: rec.deviceId, testDate: rec.testDate, note: rec.note,
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

    U.qs('#iot-save', root).addEventListener('click', () => {
      const fd = U.formData(formBody);
      if (!fd.deviceId || !fd.side || !fd.testDate) { U.toast('请填写设备、侧别、日期', 'error'); return; }
      const rec = getFormRec();
      rec._scored = Calc.isotonicScore(toScoreRecord(rec), gender(), bw());
      const cur = records(); cur.push(rec); persist(cur);
      U.qs('#iot-history', root).innerHTML = renderHistory();
      bindHistory();
      U.toast(`已保存本台设备（${cur.length} 台）`, 'success');
      if (confirm('已保存本台设备。是否继续录入/上传下一台设备？点击「取消」可结束并生成解读。')) {
        resetForm();
      }
    });

    U.qs('#iot-generate', root).addEventListener('click', () => {
      const cur = records();
      if (!cur.length) { U.toast('暂无已保存的等张测评数据', 'warning'); return; }
      const cards = cur.map(r => {
        const dev = CONST.DEVICES.find(d => d.id === r.deviceId) || { name: r.deviceId };
        const head = `<div class="report-strength-head"><b>${U.esc(dev.name)}</b> · ${U.esc(r.testDate || '')} · ${{left:'左侧',right:'右侧',bilateral:'双侧'}[r.side] || '双侧'}</div>`;
        const card = r._scored ? window.buildStrengthScoreCard(r._scored) : renderScoreCard(r);
        return head + card;
      }).join('');
      resultPanel.innerHTML = `<h3 class="card-title" style="margin-bottom:10px;">等张肌力评估解读（${cur.length} 台）</h3>${cards}`;
      U.toast('已生成等张解读报告', 'success');
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
      if (!fileInput.files[0]) { U.toast('请先选择 PDF 文件', 'warning'); return; }
      status.innerHTML = '<p style="font-size:13px; color:var(--primary);">正在解析...</p>';
      try {
        const res = await PdfParser.parseFile(fileInput.files[0]);
        if (res.type !== 'isotonic') throw new Error('该文件不是等张肌力报告。');
        const f = res.fields;
        fill({ deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          loadL: f.load, loadR: f.load, repsL: f.reps, repsR: f.reps, xrmL: f.xrm, xrmR: f.xrm, oneRML: f.rm1, oneRMR: f.rm1, rm1BwL: f.rm1Bw, rm1BwR: f.rm1Bw });
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">解析完成${res.parsedViaOcr ? '（OCR 扫描件' : '（置信度：'}${res.parsedViaOcr ? '' : (res.confidence === 'high' ? '高' : '中')}）。请核对后保存本台设备。</p>${parsedPreview({
          deviceId: f.deviceId || '03', side: f.side || 'bilateral', testDate: f.testDate || U.today(),
          load: f.load, reps: f.reps, xrm: f.xrm, rm1: f.rm1, rm1Bw: f.rm1Bw, lsi: f.lsi
        })}`;
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">解析失败：${U.esc(e.message)}</p>`;
      }
    });

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
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">解析失败：${U.esc(e.message)}</p>`;
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
        fill({ deviceId: '03', side: 'bilateral', testDate: U.today(),
          loadL: f.loadWeight, loadR: f.loadWeight, repsL: f.reps, repsR: f.reps, oneRML: f.oneRM, oneRMR: f.oneRM });
        status.innerHTML = `<p style="font-size:13px; color:var(--success);">OCR 完成，请核对字段后保存本台设备。</p>${parsedPreview({
          deviceId: '03', side: 'bilateral', testDate: U.today(),
          load: f.loadWeight, reps: f.reps, xrm: null, rm1: f.oneRM, rm1Bw: null, lsi: null
        })}`;
      } catch (e) {
        status.innerHTML = `<p style="font-size:13px; color:var(--danger);">OCR 失败：${U.esc(e.message)}（请手动录入）</p>`;
      }
    });

    return root;
  };
})();
