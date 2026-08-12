/**
 * 图片 / 扫描件 OCR 解析模块（等速/等张报告）
 * 优先使用本地 lib/tesseract + lib/tessdata 资源；本地不可用时回退 CDN。
 * 解析出关键字段后回填表单：峰值力矩、峰力矩/体重、疲劳指数、总功、平均功率、1RM 等。
 */
(function () {
  'use strict';

  const TESS_LOCAL = 'lib/tesseract/tesseract.min.js';
  const TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
  const CDN_LANG_BASE = 'https://tessdata.projectnaptha.com/4.0.0/';
  let loadPromise = null;
  let usingLocal = false;

  function isFileProtocol() {
    return location.protocol === 'file:';
  }

  function resolvePath(rel) {
    if (isFileProtocol()) return rel;
    const a = document.createElement('a');
    a.href = rel;
    return a.href;
  }

  async function fetchHead(src) {
    try {
      const r = await fetch(src, { method: 'HEAD', mode: 'no-cors' });
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(true);
      s.onerror = () => reject(new Error('script load failed: ' + src));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('script load timeout: ' + src)), 30000);
    });
  }

  async function loadTesseract() {
    if (window.Tesseract) return window.Tesseract;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      let localErr = null, cdnErr = null;
      // 本地资源仅在 http/https 且存在时优先使用
      if (!isFileProtocol()) {
        try {
          const ok = await fetchHead(resolvePath(TESS_LOCAL));
          if (ok) {
            await loadScript(resolvePath(TESS_LOCAL));
            if (window.Tesseract) { usingLocal = true; return window.Tesseract; }
          }
        } catch (e) { localErr = e; }
      }
      try {
        await loadScript(TESS_CDN);
        if (window.Tesseract) { usingLocal = false; return window.Tesseract; }
      } catch (e) { cdnErr = e; }
      const detail = isFileProtocol()
        ? '检测到通过 file:// 直接打开页面，浏览器禁止 Web Worker，请使用本地服务器（如 npx serve 或 CloudStudio 预览）后再试 OCR'
        : ((localErr ? '本地:' + localErr.message + '; ' : '') + (cdnErr ? 'CDN:' + cdnErr.message : ''));
      throw new Error('OCR 引擎加载失败（' + detail + '）。可改用 PDF/Excel 解析或手动录入。');
    })();
    return loadPromise;
  }

  async function createWorker(onProgress) {
    const Tesseract = await loadTesseract();
    const logger = (m) => {
      if (!onProgress) return;
      const p = m && m.status === 'recognizing text' ? Math.round(m.progress * 100) : null;
      if (p != null) onProgress(p);
    };
    const opts = usingLocal ? {
      workerPath: resolvePath('lib/tesseract/worker.min.js'),
      corePath: resolvePath('lib/tesseract/'),
      langPath: resolvePath('lib/tessdata'),
      logger
    } : {
      workerPath: CDN_BASE + 'worker.min.js',
      corePath: CDN_BASE,
      langPath: CDN_LANG_BASE,
      logger,
      errorHandler: (e) => console.warn('tesseract worker warn:', e)
    };
    const worker = await Tesseract.createWorker('chi_sim+eng', 1, opts);
    return worker;
  }

  async function terminateWorker(worker) {
    try { await worker.terminate(); } catch (e) {}
  }

  // 懒加载 pdfjsLib（与 lib/pdf-parser.js 共享 lib/pdf.min.js），用于渲染扫描型 PDF
  function loadPdfJs() {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') return Promise.resolve(window.pdfjsLib);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'lib/pdf.min.js';
      s.onload = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('pdfjsLib 未挂载到 window'));
      s.onerror = () => reject(new Error('pdf.js 加载失败'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('pdf.js 加载超时')), 15000);
    });
  }
  // 将 PDF 每一页渲染到 canvas 数组（用于 OCR 扫描型 PDF），自动反色 + 高 DPI
  async function renderPdfToCanvases(file, scale) {
    scale = scale || 2.5;
    const lib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    lib.GlobalWorkerOptions = lib.GlobalWorkerOptions || {};
    const pdf = await lib.getDocument({ data: u8, useWorkerFetch: false, isEvalSupported: false }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (isImageInverted(c)) {
        const inv = invertCanvas(c);
        out.push(inv);
      } else {
        out.push(c);
      }
    }
    return out;
  }

  /* 检测 canvas 是否反色（背景黑 + 文字白），用于 QueDong/医疗扫描件等 */
  function isImageInverted(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      const samples = [];
      for (let yi = 0; yi < 8; yi++) {
        for (let xi = 0; xi < 8; xi++) {
          const x = Math.floor((xi + 0.5) * canvas.width / 8);
          const y = Math.floor((yi + 0.5) * canvas.height / 8);
          const px = ctx.getImageData(x, y, 1, 1).data;
          samples.push((px[0] + px[1] + px[2]) / 3);
        }
      }
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      return avg < 128;
    } catch (e) { return false; }
  }

  function invertCanvas(src) {
    const out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    try {
      const im = ctx.getImageData(0, 0, out.width, out.height);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
      ctx.putImageData(im, 0, 0);
    } catch (e) {}
    return out;
  }

  function isPdfFile(file) {
    return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  }

  /* 多 PSM 组合 OCR */
  async function recognizeMulti(canvas, worker) {
    const tries = ['6', '11', '4'];
    let best = '';
    for (const psm of tries) {
      try { await worker.setParameters({ tessedit_pageseg_mode: psm }); } catch (e) {}
      try {
        const { data } = await worker.recognize(canvas);
        const txt = (data.text || '').trim();
        if (txt.length > best.length) best = txt;
      } catch (e) {}
    }
    try { await worker.setParameters({ tessedit_pageseg_mode: '1' }); } catch (e) {}
    return best;
  }

  /* 单 blob 识别：尝试 multi-PSM（适用于 image / canvas） */
  async function recognizeBlob(worker, blob) {
    // blob 是图片 → 若已是 canvas，可以直接 multi；若是 File/Blob，转 canvas
    if (blob && blob.tagName === 'CANVAS') {
      return await recognizeMulti(blob, worker);
    }
    if (blob instanceof Blob) {
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = url; });
        if (img) {
          const c = document.createElement('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          return await recognizeMulti(c, worker);
        }
      } finally { URL.revokeObjectURL(url); }
      const buf = await blob.arrayBuffer();
      const u8 = new Uint8Array(buf);
      const { data } = await worker.recognize(u8);
      return data.text || '';
    }
    const { data } = await worker.recognize(blob);
    return data.text || '';
  }

  function numNear(text, labelRegs) {
    for (const re of labelRegs) {
      const m = text.match(re);
      if (m) {
        const n = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  /* 从 OCR 文本中尽力抽取字段（中文报告常见标签） */
  function parseFields(text) {
    if (!text) text = '';
    // 预处理：合并 OCR 误拆的数字+单位（"85.3\nN·m" → "85.3 N·m"），合并中文标点周围的换行，
    // 把全角小数点（．）转半角，去除 OCR 误识的奇怪 Unicode 符号（○●◯▲△→− 等）。
    let t = String(text)
      .replace(/[\uFF0E．]/g, '.')
      .replace(/[\u2212−]/g, '-')
      .replace(/[○●◯◦▲△▼▽◆◇■□★☆→←↑↓※◎]/g, ' ')
      .replace(/(\d)\s*\n\s*([A-Za-z%‰′″°·×±/\\\u00B7\u00D7])/g, '$1$2')
      .replace(/(\d)\s*\n\s*([Nn]|[Nn]\s*[·\.\u00B7]\s*[mM]|[Kk][Gg]|[Kk]?[Nn]\b|[Mm]\b|[Ww]\b|[Jj]\b|[°％%]\b)/g, '$1 $2')
      .replace(/\s+/g, ' ');

    // F-Max 周期对比：扫描所有 F-Max / 峰值力矩 数值（多周期报告可能含 3~6 个）
    const fmaxValues = [];
    const fmaxRe = /(?:F[\s-]?Max|Fmax|Peak\s*Torque|峰值力矩|最大力矩|峰力矩)\s*[:：＝=]?\s*([\d]{1,4}(?:\.\d+)?)/gi;
    let mm;
    while ((mm = fmaxRe.exec(t)) !== null) {
      const v = parseFloat(mm[1].replace(/,/g, ''));
      // 排除 PT/BW 比值（已被专门一条抓走）以及明显超过 1500N·m 的异常
      if (!isNaN(v) && v > 1 && v < 1500) fmaxValues.push(v);
    }
    // 周期序号（第 N 周期 / 周期 N / Cycle N）
    const periodNums = [];
    const periodRe = /(?:第\s*(\d+)\s*周期|周期\s*(\d+)|cycle\s*(\d+)|第\s*(\d+)\s*组|组\s*(\d+))/gi;
    while ((mm = periodRe.exec(t)) !== null) {
      const n = parseInt(mm[1] || mm[2] || mm[3] || mm[4] || mm[5], 10);
      if (!isNaN(n) && n > 0 && n < 100) periodNums.push(n);
    }
    // F-Max 报告往往首值（最新周期）= 当前峰值力矩
    const fmaxFirst = fmaxValues.length ? fmaxValues[0] : null;
    // 平均功率也常以列表呈现（"平均功率 12.8 W"），全部抓出用作参考
    const powerValues = [];
    const powerRe = /(?:平均功率|平均\s*功率|Avg(?:erage)?\s*Power|AP)\s*[:：＝=]?\s*([\d]{1,4}(?:\.\d+)?)\s*[Ww]?/gi;
    while ((mm = powerRe.exec(t)) !== null) {
      const v = parseFloat(mm[1].replace(/,/g, ''));
      if (!isNaN(v) && v > 0.1 && v < 1000) powerValues.push(v);
    }
    // 总功（OCR 容易把 "J" 当独立字符丢掉，先以"总功"+ 数字抓，再去掉 "J" 单位）
    let totalWork = null;
    const twRe1 = /(?:总\s*功|总做功|总\s*work|Total\s*Work|TW)\s*[:：＝=]?\s*([\d]{1,5}(?:\.\d+)?)\s*[Jj]?/i;
    let mw = t.match(twRe1);
    if (mw) totalWork = parseFloat(mw[1].replace(/,/g, ''));
    if (totalWork == null) {
      const twRe2 = /(?:总\s*功|总做功)[^\d]{0,4}([\d]{1,5}(?:\.\d+)?)/;
      mw = t.match(twRe2);
      if (mw) totalWork = parseFloat(mw[1].replace(/,/g, ''));
    }
    // 疲劳指数（FI / 疲劳指数 / Fatigue）
    let fatigue = null;
    const fiRe = /(?:疲劳指数|疲劳(?!\d)|Fatigue\s*Index|FI)\s*[:：＝=]?\s*([\d]{1,3}(?:\.\d+)?)\s*[％%]?/i;
    let fm = t.match(fiRe);
    if (fm) fatigue = parseFloat(fm[1].replace(/,/g, ''));
    // 峰力矩 / 体重（PT/BW）
    let ptBw = null;
    const pBRe = /(?:峰\s*力\s*矩\s*[/／]\s*体\s*重|相对\s*峰\s*值\s*力\s*矩|PT\s*[/／]\s*BW|BW\s*ratio)\s*[:：＝=]?\s*([\d]{1,4}(?:\.\d+)?)\s*[%％]?/i;
    let pm = t.match(pBRe);
    if (pm) ptBw = parseFloat(pm[1].replace(/,/g, ''));
    // avgPower 偏好 "X/Y" 中第二个数字（健侧/患侧 对比时的患侧）
    let avgPowerPair = null;
    const pairRe = /(?:峰值\/?平均功率|峰值\/?平均\s*功率|平均功率)\s*[:：＝=]?\s*[\d.]+\s*[\/／]\s*([\d.]+)\s*[Ww]?/i;
    let ppm = t.match(pairRe);
    if (ppm) avgPowerPair = parseFloat(ppm[1].replace(/,/g, ''));
    let deviceId = null;
    const dvM = t.match(/(?:设备号|机器号|机号|设备编号|检号|编号|设备(?:名称|编号)|Equipment(?:\s*No\.?)?|Device(?:\s*ID)?|Machine(?:\s*No\.?)?|Tester(?:\s*No\.?)?)\s*[:：＝=]?\s*([0-9]{1,4})/i);
    if (dvM) deviceId = dvM[1];
    let testDate = null;
    const dtRe = /(\d{4}\s*[-\.\/年]\s*\d{1,2}\s*[-\.\/月]\s*\d{1,2}\s*日?)/;
    let dtm = t.match(dtRe);
    if (dtm) testDate = dtm[1].replace(/[\s年]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/\.|\//g, '-').replace(/-+/g, '-');
    // 肢体侧（左 / 右 / 双侧）
    let side = null;
    if (/左\s*膝|左侧|左肢|左腿/.test(t)) side = 'left';
    else if (/右\s*膝|右侧|右肢|右腿/.test(t)) side = 'right';
    else if (/双侧|两侧|双下肢|两侧下肢/.test(t)) side = 'bilateral';
    function 健患测试(s) { return /健侧|患侧/.test(s); }

    return {
      concentricPT: numNear(t, [/(?:峰值力矩|峰值扭力)[^\d]*?([\d.]+)/i, /Peak\s*Torque\s*[:：＝=]?\s*([\d.]+)/i, /F[\s-]?Max\s*[:：＝=]?\s*([\d.]+)/i]),
      ptBw: ptBw,
      fatigueIndex: fatigue,
      totalWork: totalWork,
      // 平均功率：四段式偏好
      //   1) 若含健/患侧 → 取患侧之后的「平均功率 X」（叙述式报告标准模式）
      //   2) 否则若出现 "平均功率 X/Y" → 取 Y（F-Max 多周期的最后一周期）
      //   3) 否则取首次出现的「平均功率 X」 （F-Max 当前周期）
      //   4) 最后兜底 powerValues[0]
      avgPower: (function () {
        if (健患测试(t)) {
          const reA = /患侧[^]*?平均\s*功率\s*[:：＝=]?\s*([\d.]+)\s*[Ww]?/;
          const ma = t.match(reA);
          if (ma) return parseFloat(ma[1].replace(/,/g, ''));
        }
        if (avgPowerPair != null) return avgPowerPair;
        const firstRe = /平均\s*功率\s*[:：＝=]?\s*([\d.]+)\s*[Ww]?/;
        const fm = t.match(firstRe); if (fm) return parseFloat(fm[1].replace(/,/g, ''));
        return powerValues.length ? powerValues[0] : null;
      })(),
      oneRM: numNear(t, [/(?:1RM)[^\d]*?([\d.]+)/i, /1[\s-]?RM[^\d]*?([\d.]+)/i]),
      load: numNear(t, [/(?:重量|负荷)[^\d]*?([\d.]+)/i, /weight[^\d]*?([\d.]+)/i]),
      reps: numNear(t, [/(?:重复次数)[^\d]*?([\d.]+)/i, /rep(?:s|etitions)?[^\d]*?([\d.]+)/i]),
      fmaxCycles: fmaxValues,
      fmaxLatest: fmaxFirst,
      powerCycles: powerValues,
      periods: periodNums,
      deviceId: deviceId,
      testDate: testDate,
      side: side,
      _raw: t.slice(0, 800)
    };
  }

  async function scan(file, onProgress) {
    if (isPdfFile(file)) return scanPdf(file, onProgress);
    return scanImage(file, onProgress);
  }
  // 图片/单帧 Blob OCR（原 scan 逻辑）
  async function scanImage(file, onProgress) {
    const worker = await createWorker(onProgress);
    try {
      let txt;
      // file 可能是 File/Blob
      const buf = await file.arrayBuffer();
      const c = await new Promise((resolve) => {
        const url = URL.createObjectURL(new Blob([buf], { type: file.type || 'image/png' }));
        const img = new Image();
        img.onload = () => {
          const cn = document.createElement('canvas');
          cn.width = img.naturalWidth || img.width; cn.height = img.naturalHeight || img.height;
          cn.getContext('2d').drawImage(img, 0, 0);
          if (isImageInverted(cn)) resolve(invertCanvas(cn));
          else resolve(cn);
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (c) {
        txt = await recognizeMulti(c, worker);
      } else {
        // fallback to direct recognition
        const blob = new Blob([buf], { type: file.type || 'image/png' });
        txt = await recognizeBlob(worker, blob);
      }
      if (!txt || !txt.trim()) throw new Error('OCR 未识别到文字，可能是图片清晰度不足');
      return composeFromText(txt);
    } finally {
      await terminateWorker(worker);
    }
  }
  // 扫描型 PDF：先 pdfjs 渲染每页到 canvas（自动反色），再逐页 OCR，聚合文本
  async function scanPdf(file, onProgress) {
    if (onProgress) onProgress(2);
    const canvases = await renderPdfToCanvases(file, 2.5);
    if (!canvases.length) throw new Error('PDF 无可识别页面');
    const worker = await createWorker(onProgress);
    try {
      let allText = '';
      for (let i = 0; i < canvases.length; i++) {
        if (onProgress) onProgress(Math.round(20 + (i / canvases.length) * 60));
        const txt = await recognizeMulti(canvases[i], worker);
        allText += '\n' + (txt || '');
      }
      if (!allText.trim()) throw new Error('OCR 未识别到文字（PDF 扫描件可能清晰度不足）');
      return composeFromText(allText);
    } finally {
      await terminateWorker(worker);
    }
  }

  // 智能编排：根据 layout 选用最佳 parser
  function composeFromText(text) {
    const layout = detectReportLayout(text);
    let fields;
    if (layout === 'quedong.isotonic') fields = parseQueDongIsotonic(text);
    else if (layout === 'quedong.fmax') fields = parseFields(text);  // F-Max 走通用（含 fmaxCycles）
    else if (layout === 'narrative') fields = parseFields(text);     // 叙述式走通用
    else if (layout === 'quedong.isokinetic') fields = parseQueDongIsokinetic(text);
    else fields = parseFields(text);

    // 通用字段补齐
    const generic = parseFields(text);
    fields = Object.assign({}, generic, fields, {
      layout: layout,
      _ocrText: text
    });
    return fields;
  }

  window.IsoOCR = {
    loadTesseract,
    loadPdfJs,
    renderPdfToCanvases,
    isPdfFile,
    isImageInverted,
    invertCanvas,
    createWorker,
    terminateWorker,
    recognizeBlob,
    recognizeMulti,
    detectReportLayout,
    parseFields,           // 通用 等速(F-Max / 周期对比) → 兼容旧版
    parseQueDongIsokinetic, // QueDong 标准等速报告（向心/离心 表格）
    parseQueDongIsotonic,   // QueDong 等张报告（重量 + 重复次数 + 1RM）
    scan,
    parseFile: undefined  // 占位，下面会覆盖
  };

  /**
   * 识别 PDF 类型并返回推荐解析函数。当前支持：
   *   - 'quedong.isokinetic'  QueDong 标准等速（向心/离心 表格）
   *   - 'quedong.isotonic'    QueDong 等张（重复次数变化测试）
   *   - 'quedong.fmax'        QueDong F-Max 周期对比（含「第N周期 F-Max」+ 总功 + 平均功率）
   *   - 'narrative'           叙述式（健/患侧 × 向心/离心）
   *   - 'unknown'             不识别，调用方可走通用 parseFields
   */
  function detectReportLayout(text) {
    if (!text) return 'unknown';
    const t = String(text);
    if (/1RM\s*[\/\／]\s*BW|重复次数变化测试|1RM\s*[:：＝=]?\s*[\d.]+\s*kg?\b/i.test(t) ||
        /重量\s*\(?kg\)?\s*[^\n]{0,10}重复次数|重复次数[^\n]{0,8}XRM/i.test(t)) {
      return 'quedong.isotonic';
    }
    if (/第\s*\d+\s*周期\s*F[-]?\s*Max|F-?\s*Max\s*周期对比|Cycle\s*\d+\s*F\s*Max/i.test(t)) {
      return 'quedong.fmax';
    }
    if (/(向心|离心)\s*[\d.]*\s*[\d.]+\s*[\d.]+\s*[\d.]+\s*[\d.]+\s*[\d.]+/i.test(t) ||
        /峰值力矩[\s\S]{0,15}平均功率[\s\S]{0,15}总功|运动模式[\s\S]{0,40}向心/i.test(t)) {
      return 'quedong.isokinetic';
    }
    if (/健侧|患侧/.test(t) && /向心|离心/.test(t)) return 'narrative';
    return 'unknown';
  }

  /**
   * QueDong 标准等速报告（向心 + 离心 各一行表格）：
   * OCR 会切散列，所以采用"按行扫描找关键列头 + 数字聚类" + **按范围互斥挑选**。
   */
  function parseQueDongIsokinetic(text) {
    if (!text) return null;
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 找一行包含 label 且数字最多的行（避免抓到如"向心测试速度..."等孤行的标题/字段说明）
    function extractRow(label) {
      const re = /-?\d+(?:\.\d+)?/g;
      let bestIdx = -1, bestLen = 0, bestRow = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf(label) >= 0) {
          let row = [];
          row = row.concat((lines[i].match(re) || []).map(s => parseFloat(s)).filter(n => !isNaN(n)));
          for (let k = 1; k <= 3 && i + k < lines.length; k++) {
            const lk = lines[i + k];
            // 纯数字/分隔符行 → 合并（应对 OCR 把一行断成多行）
            if (/^[\d\s.,\/／\-:：]+$/.test(lk) && lk.match(/\d/g)) {
              row = row.concat((lk.match(re) || []).map(s => parseFloat(s)).filter(n => !isNaN(n)));
            } else if (!/[\u4e00-\u9fff]/i.test(lk)) {
              continue;  // 短英文/符号行跳过
            } else {
              break;
            }
          }
          if (row.length > bestLen) { bestLen = row.length; bestIdx = i; bestRow = row; }
        }
      }
      return bestRow;
    }
    const concentric = extractRow('向心');
    const eccentric = extractRow('离心');
    const all = concentric.concat(eccentric);

    // 尝试识别列头（"运动模式 速度 峰值力矩 ..."），并据此推断列位置
    // 仅当列数 ≤ 数据列数（避免 OCR 漏列导致错位）时才使用列位置
    let columnLabels = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/运动模式|速度\s*[\(]?\s*[\u00b0\s]?\/?\s*s|Peak\s*Torque|峰值力矩\s*\(?\s*N·m\)|峰值力矩角度|平均功率|总功|总做功差异/i.test(l)) {
        const segs = l.split(/\s{2,}|[\t]|\|/).map(s => s.trim()).filter(Boolean);
        if (segs.length >= 5) {
          columnLabels = segs;
          break;
        }
      }
    }
    // 列位置是否可信：仅当 header 列数 == data 行数字个数 才使用列映射
    const colsReliable = columnLabels.length > 0 &&
      columnLabels.length === concentric.length &&
      columnLabels.length === eccentric.length;
    function labelIdx(label) {
      if (!colsReliable) return -1;
      // 严格首段匹配（不要 "峰值力矩" 误中 "峰值力矩角度"）
      let idx = columnLabels.findIndex(s => s === label);
      if (idx >= 0) return idx;
      // 退而求其次：首字符起匹配
      idx = columnLabels.findIndex(s => s.indexOf(label) === 0);
      return idx;
    }

    // 按值互斥挑选（已被前一个字段用过的值跳过）
    const used = new Set();
    function pick(rangeMin, rangeMax, preferRows) {
      const rows = (preferRows && preferRows.length) ? preferRows : all;
      for (let i = 0; i < rows.length; i++) {
        const n = rows[i];
        if (typeof n !== 'number' || isNaN(n)) continue;
        if (used.has(n)) continue;
        if (n >= rangeMin && n <= rangeMax) {
          used.add(n);
          return n;
        }
      }
      return null;
    }
    function pickAtColumn(colIdx, preferRows) {
      const rows = (preferRows && preferRows.length) ? preferRows : all;
      if (colIdx >= 0 && colIdx < rows.length) {
        used.add(rows[colIdx]);
        return rows[colIdx];
      }
      return null;
    }

    // 速度：5..250
    let speed = pickAtColumn(labelIdx('速度'), concentric);
    if (speed == null) speed = pick(5, 250, concentric) || pick(5, 250, eccentric);

    // 峰值力矩（按列/兜底范围 20..2000，含高强度运动员）
    let concentricPT = pickAtColumn(labelIdx('峰值力矩'), concentric);
    if (concentricPT == null) concentricPT = pick(20, 2000, concentric) || pick(20, 2000, eccentric);
    let eccentricPT = pickAtColumn(labelIdx('峰值力矩'), eccentric);
    if (eccentricPT == null) eccentricPT = pick(20, 2000, eccentric);

    // 总功 30..800（按列/兜底范围）
    let totalWork = pickAtColumn(labelIdx('总功'), concentric);
    if (totalWork == null) totalWork = pick(30, 800, concentric) || pick(30, 800, eccentric);

    // 平均功率：20..300（避免与峰值力矩角度 < 30° 混淆）
    let avgPower = pickAtColumn(labelIdx('平均功率'), concentric);
    if (avgPower == null) avgPower = pick(20, 300, concentric) || pick(20, 300, eccentric);
    let eccentricAvgPower = pickAtColumn(labelIdx('平均功率'), eccentric);
    if (eccentricAvgPower == null) eccentricAvgPower = pick(20, 300, eccentric);

    // 峰力矩/体重：0.3..8
    let ptBw = pickAtColumn(labelIdx('峰力矩/体重'), concentric);
    if (ptBw == null) ptBw = pickAtColumn(labelIdx('相对峰值'), concentric);
    if (ptBw == null) ptBw = pick(0.3, 8, concentric) || pick(0.3, 12, all);

    // 总做功差异、差异系数
    let totalWorkDiff = pickAtColumn(labelIdx('总做功差异'), concentric);
    if (totalWorkDiff == null) totalWorkDiff = pick(0.5, 50, concentric);
    let fatigueIndex = pickAtColumn(labelIdx('差异系数'), concentric);
    if (fatigueIndex == null) fatigueIndex = pick(3, 80, concentric);

    // 设备号 / 测试日期 / 侧
    const t = String(text);
    const dvM = t.match(/(?:设备号|机器号|机号|设备编号|检号|编号|设备(?:名称|编号)|Equipment(?:\s*No\.?)?|Device(?:\s*ID)?|Machine(?:\s*No\.?)?|Tester(?:\s*No\.?)?)\s*[:：＝=]?\s*([0-9]{1,4})/i);
    const deviceId = dvM ? dvM[1] : null;
    const testDate = (t.match(/(\d{4}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}\s*日?)/) || [null, null])[1] || null;
    let side = 'bilateral';
    if (/左\s*膝|左侧|左肢|左腿/.test(t)) side = 'left';
    else if (/右\s*膝|右侧|右肢|右腿/.test(t)) side = 'right';

    return {
      type: 'isokinetic',
      isQueDongStandard: true,
      concentricPT: concentricPT,
      eccentricPT: eccentricPT,
      ptBw: ptBw,
      totalWork: totalWork,
      avgPower: avgPower,
      eccentricAvgPower: eccentricAvgPower,
      eccentricMaxWork: null,  // 总做功差异 → 在 totalWorkDiff 中
      totalWorkDiff: totalWorkDiff,
      fatigueIndex: fatigueIndex,
      speed: speed,
      deviceId: deviceId,
      testDate: testDate,
      side: side,
      concentricRow: concentric,
      eccentricRow: eccentric,
      _ocrText: text
    };
  }

  /**
   * QueDong 等张报告（重复次数变化测试）：单行表格
   *   表头: 数据对比 | 重量(kg) | 重复次数 | XRM(kg) | 1RM(kg) | 1RM/BW
   *   数据: "2024-08-26 双侧  15  12  15  21  0.29"
   * 也容忍：可能 OCR 把"重复次数变化测试"识别为不同的标题。
   */
  function parseQueDongIsotonic(text) {
    if (!text) return null;
    const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const t = String(text).replace(/\s+/g, ' ');

    // 表头行：必须同时含 (重量|load) 与 (重复次数|reps) 与 XRM/1RM
    let headerFound = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const hasLoad = /重量|Load/i.test(l);
      const hasReps = /重复次数|Reps|reps/i.test(l);
      const hasXRMorRM = /XRM|1RM|BW/i.test(l);
      if (hasLoad && hasReps && hasXRMorRM) { headerFound = i; break; }
    }

    const re = /-?\d+(?:\.\d+)?/g;
    function guessFromLine(line) {
      const nums = (line.match(re) || []).map(s => parseFloat(s)).filter(n => !isNaN(n));
      // 数据格式：[年, 月, 日, OR '双侧', 重量, 重复, XRM, 1RM, 1RM/BW]
      // 跳过日期、跳过"双侧"，剩下 5 个数字
      const nonYear = nums.filter(n => !(n >= 1900 && n <= 2200));
      if (nonYear.length >= 5) {
        // 末尾 5 个：重量 重复 XRM 1RM 1RM/BW
        const last5 = nonYear.slice(-5);
        return {
          load: last5[0] != null && last5[0] >= 1 && last5[0] <= 500 ? last5[0] : null,
          reps: last5[1] != null && last5[1] >= 1 && last5[1] <= 100 ? last5[1] : null,
          xrm:  last5[2] != null && last5[2] >= 1 && last5[2] <= 500 ? last5[2] : null,
          rm1:  last5[3] != null && last5[3] >= 1 && last5[3] <= 500 ? last5[3] : null,
          rm1Bw: last5[4] != null && last5[4] > 0 && last5[4] < 5 ? last5[4] : null
        };
      }
      return null;
    }

    let data = null;
    // 优先级 1：紧跟 header 的行（前 5 行内）
    if (headerFound >= 0) {
      for (let j = headerFound + 1; j < Math.min(lines.length, headerFound + 6); j++) {
        const l = lines[j];
        const nums = (l.match(re) || []).map(s => parseFloat(s)).filter(n => !isNaN(n));
        if (nums.length >= 4) {
          data = guessFromLine(l);
          if (data && data.load != null) break;
        }
      }
    }
    // 优先级 2：全文搜索含 5+ 数字（含日期但去掉）且文本中含"双侧"
    if (!data) {
      for (const l of lines) {
        if (!/双侧|左侧|右侧/.test(l)) continue;
        const guess = guessFromLine(l);
        if (guess && guess.load != null) { data = guess; break; }
      }
    }
    // 优先级 3：找含至少 5 个数字且都在合理范围
    if (!data) {
      for (const l of lines) {
        const guess = guessFromLine(l);
        if (guess && guess.load != null) { data = guess; break; }
      }
    }

    // 设备号 / 日期 / 性别
    const deviceId = (t.match(/(?:设备号|机器号|设备(?:编号|名称)|Equipment|Device(?:\s*ID)?|Machine(?:\s*No\.?)?)\s*[:：＝=]?\s*0*(\d{1,3})\s*号?/i) || [null, null])[1] || null;
    const dateRe = /(\d{4}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}\s*日?)/;
    const testDate = (t.match(dateRe) || [null, null])[1] || null;
    const age = (t.match(/年龄\s*[:：]?\s*(\d{1,3})/) || [null, null])[1] || null;
    const gender = /性别\s*[:：]?\s*男|Male|\bM\b/i.test(t) ? 'male' :
                    /性别\s*[:：]?\s*女|Female|\bF\b/i.test(t) ? 'female' : null;

    let side = 'bilateral';
    if (/双侧/.test(t)) side = 'bilateral';
    else if (/左侧|左肢|左腿/.test(t)) side = 'left';
    else if (/右侧|右肢|右腿/.test(t)) side = 'right';

    return {
      type: 'isotonic',
      isQueDongStandard: true,
      deviceId: deviceId,
      testDate: testDate,
      side: side,
      age: age,
      gender: gender,
      ...(data || {}),
      _ocrText: text
    };
  }

})();
