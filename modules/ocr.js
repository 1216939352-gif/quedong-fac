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

  /* 多 PSM 组合 OCR：返回所有候选，供上层按解析质量挑选（不再单纯选字数最长） */
  async function recognizeMultiCandidates(canvas, worker) {
    const tries = ['6', '11', '4'];
    const out = [];
    for (const psm of tries) {
      try { await worker.setParameters({ tessedit_pageseg_mode: psm }); } catch (e) {}
      try {
        const { data } = await worker.recognize(canvas);
        const txt = (data.text || '').trim();
        if (txt) out.push({ psm, text: txt });
      } catch (e) {}
    }
    try { await worker.setParameters({ tessedit_pageseg_mode: '1' }); } catch (e) {}
    return out;
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
        if (!isNaN(n)) {
          // OCR 常把页脚/报告日期误识到指标后面，年份 1900-2200 不可能是肌力指标
          if (n >= 1900 && n <= 2200) continue;
          return n;
        }
      }
    }
    return null;
  }

  /**
   * OCR 常见逐字空格（中文被拆成「向 心」「峰 值 力 矩」），而所有检测/解析正则期望连续中文，
   * 会导致 layout 检测与字段抽取全部失配、最终「解析失败」。识别前必须去除中文（CJK）之间的空格。
   */
  function normalizeCJK(t) {
    if (!t) return t;
    let s = String(t);
    // 仅去除中文「之间」的空格/制表符，绝不吞掉换行符——否则上一行末中文与下一行首中文
    // 会被粘成一行（如「测试时间」「肖明谦」误并），破坏按行定位的头部/姓名抽取。
    const re = /([\u3400-\u9fff])[ \t]+([\u3400-\u9fff])/g;
    let prev;
    do { prev = s; s = s.replace(re, '$1$2'); } while (s !== prev);
    return s;
  }

  // 给 OCR 多 PSM 候选打分：数值字段越多、数组越长，说明这份 OCR 越能被 parser 抽出有效指标
  function scoreFields(fields) {
    if (!fields) return 0;
    let score = 0;
    const ignored = new Set(['_ocrText', '_raw', 'type', 'layout', 'isQueDongStandard', 'side', 'gender', 'deviceId', 'testDate', 'age']);
    for (const [k, v] of Object.entries(fields)) {
      if (ignored.has(k)) continue;
      if (typeof v === 'number' && !isNaN(v)) score++;
      else if (Array.isArray(v) && v.length) score += v.length;
    }
    return score;
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
      oneRM: numNear(t, [/(?:1RM)(?!\/BW)\s*[:：=＝]?\s*([\d.]+)(?!\s*RM)/i, /1[\s-]?RM(?!\/BW)\s*[:：=＝]?\s*([\d.]+)(?!\s*RM)/i]),
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
      let cands = [];
      if (c) {
        cands = await recognizeMultiCandidates(c, worker);
      } else {
        // fallback to direct recognition（只跑默认 PSM1，候选集合唯一）
        const blob = new Blob([buf], { type: file.type || 'image/png' });
        const fallback = await recognizeBlob(worker, blob);
        if (fallback) cands.push({ psm: '1', text: fallback });
      }
      if (!cands.length) throw new Error('OCR 未识别到文字，可能是图片清晰度不足');
      let bestResult = null, bestScore = -1;
      for (const { text } of cands) {
        const res = composeFromText(text);
        const score = scoreFields(res);
        if (score > bestScore) { bestScore = score; bestResult = res; }
      }
      return bestResult;
    } finally {
      await terminateWorker(worker);
    }
  }
  // 扫描型 PDF：先 pdfjs 渲染每页到 canvas（自动反色），再逐页 OCR，按解析质量挑选最优 PSM
  async function scanPdf(file, onProgress) {
    if (onProgress) onProgress(2);
    const canvases = await renderPdfToCanvases(file, 2.5);
    if (!canvases.length) throw new Error('PDF 无可识别页面');
    const worker = await createWorker(onProgress);
    try {
      const perPsm = { '6': [], '11': [], '4': [] };
      for (let i = 0; i < canvases.length; i++) {
        if (onProgress) onProgress(Math.round(20 + (i / canvases.length) * 60));
        const cands = await recognizeMultiCandidates(canvases[i], worker);
        for (const { psm, text } of cands) {
          if (perPsm[psm]) perPsm[psm].push(text);
        }
      }
      let bestResult = null;
      let bestScore = -1;
      // 同分优先 PSM6，其次 PSM4，最后 PSM11（PSM11 最容易把表格数字拆碎）
      for (const psm of ['6', '4', '11']) {
        const allText = perPsm[psm].join('\n');
        if (!allText.trim()) continue;
        const res = composeFromText(allText);
        const score = scoreFields(res);
        if (score > bestScore) {
          bestScore = score;
          bestResult = res;
        }
      }
      if (!bestResult) throw new Error('OCR 未识别到文字（PDF 扫描件可能清晰度不足）');
      return bestResult;
    } finally {
      await terminateWorker(worker);
    }
  }




  // 智能编排：根据 layout 选用最佳 parser
  function composeFromText(text) {
    // OCR 文本先归一化（去除中文间逐字空格），否则 layout 检测与字段抽取会全部失配
    text = normalizeCJK(text || '');
    const layout = detectReportLayout(text);
    let fields;
    if (layout === 'bodycomposition') fields = parseBodyComposition(text);
    else if (layout === 'quedong.isotonic') fields = parseQueDongIsotonic(text);
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
    parseFields,            // 通用 等速(F-Max / 周期对比) → 兼容旧版
    parseQueDongIsokinetic, // QueDong 标准等速报告（向心/离心 表格）
    parseQueDongIsotonic,   // QueDong 等张报告（重量 + 重复次数 + 1RM）
    parseBodyComposition,   // 人体成分报告（SMI/体脂率/内脏脂肪/骨骼肌量/基础代谢/体重）
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
    const t = normalizeCJK(String(text));
    // 人体成分 / 体成分报告：标题或关键指标组合命中即视为体成分报告
    if (/人体成分|体成分分析|身体成分|InBody|UEDONG|体脂百分比|体脂率|内脏脂肪|基础代谢|骨骼肌量|ASMI|SMI/i.test(t)) {
      return 'bodycomposition';
    }
    // 等张（重复次数变化测试 / 1RM / XRM）
    // 注意：1-RM 报告表头常为「重复次数 1RM 1RM/BW」，OCR 常把「/BW」误识为「TRWBW」而丢失斜杠；
    // 故不再强依赖斜杠，只要出现「重复次数 + (XRM/1RM/RM)」即判定为等张。
    if (/负荷变化测试|重复次数变化测试|1RM\s*[\/\／]\s*BW|重复次数\s*(?:XRM|[1一]\s*RM|RM\b)|1RM\s*[:：＝=]?\s*[\d.]+\s*kg?\b/i.test(t)) {
      return 'quedong.isotonic';
    }
    // F-Max 周期对比 / 测训记录（需明确「周期对比」或「测训记录」；注意「测训单元」是训练单元，不算 F-Max 报告）
    if (/第\s*\d+\s*周期\s*F[\s-]?E?[\s-]?Max|F[\s-]?E?[\s-]?Max\s*周期对比|Cycle\s*\d+\s*F\s*Max|周期对比|测训记录/i.test(t)) {
      return 'quedong.fmax';
    }
    // 等速（向心/离心 或 峰值力矩/扭矩 —— OCR 可能误识，故放宽到「峰力矩/扭矩」）
    if (/(向心|离心)|峰\s*值\s*力\s*矩|峰力矩|峰值力矩|扭矩|扭力/i.test(t)) {
      return 'quedong.isokinetic';
    }
    if (/健侧|患侧/.test(t) && /向心|离心/.test(t)) return 'narrative';
    return 'unknown';
  }

  /* 通用辅助：从报告文本中抽取设备号（兼容 QueDong 多种版式） */
  const CN_NUM = { '一': '01', '二': '02', '三': '03', '四': '04', '五': '05', '六': '06', '七': '07', '八': '08', '九': '09' };
  function parseDeviceIdRobust(t) {
    if (!t) return null;
    const m = t.match(/鹊动\s*(\d{1,2})\s*号|0?(\d)\s*号机|型号[：:]\s*(\d+)|测试设备[\s\S]{0,60}?(\d{2})|(\d{2})[-—]\s*[^\n]{0,30}测训单元|MET[\s\S]{0,60}?C(\d)|(?:设备号|机器号|机号|设备编号|编号|设备(?:名称|编号)|Equipment|Device|Machine|Tester)\s*[:：＝=]?\s*(\d{1,4})/i);
    if (m) {
      let id = m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || m[7];
      id = (id || '').replace(/^0+/, '') || '0';
      return id.padStart(2, '0');
    }
    for (const [cn, n] of Object.entries(CN_NUM)) {
      if (t.includes(cn + '号机')) return n;
      if (new RegExp(cn + '号').test(t)) return n;
    }
    return null;
  }
  function parseDateRobust(t) {
    if (!t) return null;
    const m = t.match(/(\d{4})\s*[-.\/年]\s*(\d{1,2})\s*[-.\/月]\s*(\d{1,2})\s*日?/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  function parseSideRobust(t) {
    if (!t) return 'bilateral';
    if (/左\s*膝|左侧|左肢|左腿|左[则例]/.test(t)) return 'left';
    if (/右\s*膝|右侧|右肢|右腿|右[则例]/.test(t)) return 'right';
    if (/双侧|两侧|双下肢/.test(t)) return 'bilateral';
    return 'bilateral';
  }

  /**
   * QueDong 标准等速报告（向心/离心 表格）：采用「列位置映射」而非易错的范围挑选。
   * 归一化后数据行形如：
   *   向心 30 70-30 90.77 275.06 67 74.34 1.26 11.28 8.89 44.46 5.60 4.32 1.00
   * 数值 token 顺序（QueDong MET 标准 13 列）：
   *   [0]速度 [1]关节活动度(范围,如70-30) [2]峰值力矩 [3]峰力矩对应力量 [4]峰力矩角度
   *   [5]平均峰值力矩 [6]峰力矩/体重 [7]最大做功 [8]平均做功 [9]总做功 [10]最大功率 [11]平均功率 [12]差异系数
   * 据此按位置取字段，可避免 OCR 误识导致的数值错位。
   */
  function parseQueDongIsokinetic(text) {
    if (!text) return null;
    const t = normalizeCJK(String(text));
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // 解析一行：去掉向心/离心标签，按空白切分；数字→数字，范围（含被 OCR 拆散的 "70-" + "30"）→ 推 ROM 起点并记为锚点，其它→null。
    const DASH = '[\u2010-\u2015\-―－]';
    function rowTokens(line) {
      const cleaned = line.replace(/向心|离心|CONCENTRIC|ECCENTRIC/gi, ' ').trim();
      const rawToks = cleaned.split(/\s+/).filter(Boolean);
      const nums = [];
      let rangeIdx = -1;
      let i = 0;
      while (i < rawToks.length) {
        const tk = rawToks[i];
        // 范围被 OCR 拆成 "70-" + "30"（短横在词尾）→ 合并为 ROM 起点
        const tailDash = tk.match(new RegExp('^(\\d+(?:\\.\\d+)?)' + DASH + '$'));
        if (tailDash) {
          const nxt = rawToks[i + 1];
          if (nxt && /^\d+(?:\.\d+)?$/.test(nxt)) { nums.push(parseFloat(tailDash[1])); rangeIdx = nums.length - 1; i += 2; continue; }
        }
        if (/^-?\d+(?:\.\d+)?$/.test(tk)) {
          nums.push(parseFloat(tk));
        } else {
          const rg = tk.match(new RegExp('^(\\d+(?:\\.\\d+)?)' + DASH + '(\\d+(?:\\.\\d+)?)$'));
          if (rg) { nums.push(parseFloat(rg[1])); rangeIdx = nums.length - 1; }
          else { nums.push(null); }
        }
        i++;
      }
      return { nums, rangeIdx, raw: line };
    }

    // 候选数据行：含 ≥5 个数字；优先取带 ROM 范围（rangeIdx>=0）的行（排除 % 比值行）
    const numberRows = lines.map((l, idx) => ({ idx, V: rowTokens(l) }))
      .filter(o => o.V.nums.filter(n => n != null).length >= 5);
    let dataRows = numberRows.filter(o => o.V.rangeIdx >= 0);
    if (dataRows.length < 2) {
      const fb = numberRows.filter(o => !/%|比值|\(%\)|百分比/.test(lines[o.idx]));
      if (fb.length >= 2) dataRows = fb;
    }
    let conc = dataRows.find(o => /向心|CONCENTRIC/i.test(lines[o.idx]));
    let ecc = dataRows.find(o => /离心|ECCENTRIC/i.test(lines[o.idx]));
    if (!conc && dataRows.length) conc = dataRows[0];
    if (!ecc && dataRows.length > 1) ecc = dataRows[1];
    else if (!ecc) ecc = conc;
    const cV = conc ? conc.V : { nums: [], rangeIdx: -1 };
    const eV = ecc ? ecc.V : { nums: [], rangeIdx: -1 };
    const anchorRangeIdx = cV.rangeIdx >= 0 ? cV.rangeIdx : eV.rangeIdx;

    // 按列位置抽取（QueDong MET 标准 13 列：速度/ROM/峰值力矩/峰力矩对应力量/峰力矩角度/平均峰值力矩/峰力矩体重比/最大做功/平均做功/总做功/最大功率/平均功率/差异系数）。
    // ROM 锚点后第 1 列即峰值力矩(PT)，后续依次 +1。
    function extract(V) {
      if (!V || !V.nums || V.nums.length === 0) return {};
      const nums = V.nums;
      const base = (anchorRangeIdx >= 0) ? anchorRangeIdx + 1 : 2;
      const at = (i) => (nums[i] != null ? nums[i] : null);
      return {
        pt: at(base), force: at(base + 1), angle: at(base + 2), avgPT: at(base + 3),
        ptBw: at(base + 4), maxWork: at(base + 5), avgWork: at(base + 6),
        totalWork: at(base + 7), maxPower: at(base + 8), avgPower: at(base + 9), fatigue: at(base + 10)
      };
    }
    function recover(v, max) {
      if (v == null || isNaN(v)) return v;
      let x = v;
      if (x > max) { x = x / 10; if (x > max) x = x / 10; }
      return x;
    }

    const cM = extract(cV);
    const eM = extract(eV);

    return {
      type: 'isokinetic',
      isQueDongStandard: true,
      // 向心（主动收缩）
      concentricPT: recover(cM.pt, 500),
      concentricForce: recover(cM.force, 900),
      concentricAngle: cM.angle,
      concentricAvgPT: recover(cM.avgPT, 500),
      concentricMaxWork: recover(cM.maxWork, 500),
      concentricAvgWork: recover(cM.avgWork, 500),
      concentricMaxPower: recover(cM.maxPower, 500),
      concentricAvgPower: recover(cM.avgPower, 500),
      // 离心（缓冲/稳定）
      eccentricPT: recover(eM.pt, 500),
      eccentricForce: recover(eM.force, 900),
      eccentricAngle: eM.angle,
      eccentricAvgPT: recover(eM.avgPT, 500),
      eccentricMaxWork: recover(eM.maxWork, 500),
      eccentricAvgWork: recover(eM.avgWork, 500),
      eccentricMaxPower: recover(eM.maxPower, 500),
      eccentricAvgPower: recover(eM.avgPower, 500),
      // 向心基准指标（共享字段兼容旧版，语义上=向心）
      ptBw: recover(cM.ptBw, 8),
      concentricPtBw: recover(cM.ptBw, 8),
      concentricTotalWork: recover(cM.totalWork, 500),
      concentricFatigueIndex: recover(cM.fatigue, 80),
      ratio_ptBw: null,
      ratio_avgPower: null,
      totalWork: recover(cM.totalWork, 500),
      maxWork: recover(cM.maxWork, 500),
      avgWork: recover(cM.avgWork, 500),
      maxPower: recover(cM.maxPower, 500),
      avgPower: recover(cM.avgPower, 500),
      fatigueIndex: recover(cM.fatigue, 80),
      // 离心专属共享列（避免离心行误用向心值）
      eccentricPtBw: recover(eM.ptBw, 8),
      eccentricTotalWork: recover(eM.totalWork, 500),
      eccentricFatigueIndex: recover(eM.fatigue, 80),
      speed: (cV.nums && cV.nums[0] != null) ? cV.nums[0] : null,
      deviceId: parseDeviceIdRobust(t),
      testDate: parseDateRobust(t),
      side: parseSideRobust(t),
      concentricRow: cV.nums,
      eccentricRow: eV.nums,
      _ocrText: t
    };
  }

  /**
   * QueDong 等张报告（重复次数变化测试）：单行表格
   *   表头: 数据对比 | 重量(kg) | 重复次数 | XRM(kg) | 1RM(kg) | 1RM/BW
   *   数据: "2024-08-26 双侧  15  12  15  21  0.29"
   * 也容忍：可能 OCR 把"重复次数变化测试"识别为不同的标题。
   */
  /**
   * QueDong 等张报告（负荷变化测试：X-RM / 1-RM 单次测试）
   * 两种真实版式：
   *   X-RM：表头「重复次数 XRM RM 1RM/BW」（无「重量」列），数据行形如
   *         "2024-06-03 双侧 5 6 5 6 0.10" → 重复次数=5 XRM=6 RM=5 1RM=6 1RM/BW=0.10
   *   1-RM：表头「重复次数 1RM 1RM/BW」（OCR 常丢「重量」列头），数据行多行形如
   *         "2024-06-03 双侧 10 1 10 0.17" / "2024-06-03 双侧 20 1 20 0.33"
   *         → 重量=10/20 重复次数=1 1RM=10/20 1RM/BW=0.17/0.33（取 1RM 最大的一行）
   * 列序按「是否含 XRM」自适应，避免固定列索引错位；多行时取 1RM 最大。
   */
  function parseQueDongIsotonic(text) {
    if (!text) return null;
    const raw = String(text);
    // 仅合并空格/制表符，保留换行：OCR 每行是独立数据行，折叠成一行会破坏「行尾数字串」抽取
    let t = normalizeCJK(raw).replace(/[ \t]+/g, ' ');
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    const isXRM = /XRM/i.test(t);
    const sideRe = /[双左右]侧|双[则例]|左[肢腿]|右[肢腿]/;

    // 去掉日期后，取一行末尾连续的数字串（OCR 把日期写成 "2024-06-03"，不会进入末尾数字串）
    function trailingNumbers(line) {
      const dateRe = /\d{4}\s*[-.\/年]\s*\d{1,2}\s*[-.\/月]\s*\d{1,2}\s*日?/;
      const s = line.replace(dateRe, ' ');
      const parts = s.trim().split(/\s+/).filter(Boolean);
      const nums = [];
      for (let i = parts.length - 1; i >= 0; i--) {
        const m = parts[i].match(/^-?\d+(?:\.\d+)?$/);
        if (m) nums.unshift(parseFloat(parts[i]));
        else break;
      }
      return nums;
    }

    // 候选数据行：含日期或侧别，且末尾有 >=4 个数字
    const cand = [];
    for (const l of lines) {
      if (!/\d{4}\s*[-.\/年]\s*\d{1,2}\s*[-.\/月]/.test(l) && !sideRe.test(l)) continue;
      const nums = trailingNumbers(l);
      if (nums.length >= 4) cand.push(nums);
    }

    function parseRow(nums) {
      let load = null, reps = null, xrm = null, rm = null, rm1 = null, rm1Bw = null;
      if (isXRM) {
        // 列序：重复次数 | XRM | RM | 1RM | 1RM/BW（无「重量」列）
        if (nums.length >= 5) { reps = nums[0]; xrm = nums[1]; rm = nums[2]; rm1 = nums[3]; rm1Bw = nums[4]; }
        else if (nums.length === 4) { reps = nums[0]; xrm = null; rm1 = nums[2]; rm1Bw = nums[3]; }
      } else {
        // 列序：重量 | 重复次数 | 1RM | 1RM/BW（1-RM 单次测试）
        if (nums.length >= 4) { load = nums[0]; reps = nums[1]; rm1 = nums[2]; rm1Bw = nums[3]; }
        else if (nums.length === 3) { reps = nums[0]; rm1 = nums[1]; rm1Bw = nums[2]; }
      }
      return { load, reps, xrm, rm, rm1, rm1Bw };
    }

    // 取 1RM 最大的一行（1-RM 多行取最大；X-RM 单行）
    let best = null;
    for (const nums of cand) {
      const f = parseRow(nums);
      if (f.rm1 != null && (best == null || f.rm1 > best.rm1)) best = f;
    }
    // 兜底：放宽到任意含 >=4 数字的行
    if (!best) {
      for (const l of lines) {
        const nums = trailingNumbers(l);
        if (nums.length >= 4) {
          const f = parseRow(nums);
          if (f.rm1 != null && (best == null || f.rm1 > best.rm1)) best = f;
        }
      }
    }

    // 头部信息
    const dvM = t.match(/(?:设备号|机器号|设备(?:编号|名称)|Equipment|Device(?:\s*ID)?|Machine(?:\s*No\.?)?)\s*[:：＝=]?\s*0*(\d{1,3})\s*号?/i);
    const deviceId = dvM ? dvM[1] : null;
    const dtM = t.match(/(\d{4}\s*[-.\/年]\s*\d{1,2}\s*[-.\/月]\s*\d{1,2}\s*日?)/);
    const testDate = dtM ? dtM[1].replace(/[\s年]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/[-.\/]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') : null;
    const ageM = t.match(/年龄[^\d\n]{0,8}(\d{1,3})/);
    const age = ageM ? parseInt(ageM[1], 10) : null;
    let gender = null;
    if (/性别[^\d\n]{0,12}(男|女)/.test(t)) gender = /性别[^\d\n]{0,12}男/.test(t) ? 'male' : 'female';
    else if (/男\s*性|Male|\bM\b/i.test(t)) gender = 'male';
    else if (/女\s*性|Female|\bF\b/i.test(t)) gender = 'female';
    else if (/男/.test(t) && !/女/.test(t)) gender = 'male';
    else if (/女/.test(t)) gender = 'female';
    let side = 'bilateral';
    if (sideRe.test(t)) side = /左[肢腿]|左侧/.test(t) ? 'left' : /右[肢腿]|右侧/.test(t) ? 'right' : 'bilateral';

    const fld = best || {};
    return {
      type: 'isotonic',
      isQueDongStandard: true,
      deviceId: deviceId,
      testDate: testDate,
      side: side,
      age: age,
      gender: gender,
      load: fld.load != null ? fld.load : null,
      reps: fld.reps != null ? fld.reps : null,
      xrm: fld.xrm != null ? fld.xrm : null,
      rm: fld.rm != null ? fld.rm : null,
      rm1: fld.rm1 != null ? fld.rm1 : null,
      rm1Bw: fld.rm1Bw != null ? fld.rm1Bw : null,
      _ocrText: text
    };
  }

  /**
   * 人体成分报告字段抽取（通用中文/英文标签）
   * 返回 { smi, bodyFat, visceral, muscleMass, bmr, weight, _raw }
   */
  /**
   * 人体成分报告字段抽取（通用中文/英文标签，兼容 QueDong UEDONG 等报告版式）
   * 返回 { smi, bodyFat, visceral, muscleMass, bmr, weight, _raw }
   */
  /**
   * 人体成分报告字段抽取（通用中文/英文标签，兼容 QueDong UEDONG / InBody 等报告版式）
   * 返回可回填结构：首诊登记字段(name/age/gender/height/weight/bmi) + 评估指标(smi/bodyFat/visceral/muscleMass/bmr/ecwRatio/segmental)。
   * 关键修复：仅合并「被空格拆开的小数点」(如 "1 . 5" → "1.5")，不再做任意相邻数字合并，
   * 以免把柱状图坐标(70 80 90 …)误并成天文数字（原实现会把骨骼肌坐标轴并成 7e29）。
   */
  function parseBodyComposition(text) {
    const empty = { smi: null, bodyFat: null, visceral: null, muscleMass: null, bmr: null, weight: null, _raw: '' };
    if (!text) return empty;
    let t = normalizeCJK(String(text))
      .replace(/[\uFF10-\uFF19]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30))
      .replace(/[，]/g, ',').replace(/[。]/g, '.')
      .replace(/骨[能叽几]肌/g, '骨骼肌')
      .replace(/体[自白]分比/g, '体脂百分比')
      .replace(/内[胜脏]脂肪/g, '内脏脂肪')
      .replace(/基础代谢[库车]/g, '基础代谢率')
      .replace(/[ \t]+/g, ' ');
    // 仅合并小数点被空格拆开的情况（"1 . 5" / "1 .5"），避免柱状图坐标被误并
    t = t.replace(/(\d)\s*\.\s*(\d)/g, '$1.$2');
    t = t.replace(/(\d)\s+(\.\d+)/g, '$1$2');
    // 合并被空格拆开的英文缩写（ASMI / VFA / BMI / BMR 等）
    let prev;
    do { prev = t; t = t.replace(/([A-Z])\s+([A-Z])/g, '$1$2'); } while (t !== prev);
    const n = (regs) => numNear(t, regs);
    const G = '\\s*(?:[(（][^)）]*[）)])?\\s*[:：=＝]?\\s*';

    // —— 头部：姓名 / 年龄 / 性别 / 身高 / 体重 / ID / 测试时间 / 总分 ——
    let name = null, age = null, gender = null, height = null, weight = null, id = null, testDate = null, score = null;
    const headLine = (t.split(/\r?\n/).map(l => l.trim()).filter(Boolean))
      .find(l => /[一-龥]{2,4}\s*\d{1,3}\s*岁/.test(l) && /(男|女)/.test(l)) || t;
    if (headLine) {
      const nm = headLine.match(/([一-龥]{2,4})\s*\d{1,3}\s*岁/); if (nm) name = nm[1];
      // 去除 OCR 把「/100分」「总分」等单位字误粘到姓名前/后的冗余字（如「分肖明谦」→「肖明谦」）
      if (name) name = name.replace(/^[分目数总值评项等质重年性]\s*/, '').replace(/\s*[分目数总值评项等质重年性]$/, '');
      const am = headLine.match(/(\d{1,3})\s*岁/); if (am) age = parseInt(am[1], 10);
      if (/男/.test(headLine) && !/女/.test(headLine)) gender = 'male';
      else if (/女/.test(headLine)) gender = 'female';
    }
    if (height == null) { const hm = t.match(/(\d{2,3})\s*cm/); if (hm) height = parseInt(hm[1], 10); }
    if (weight == null) {
      // 负向断言 (?!\\s*\\d)：排除 BMI 图表坐标轴「体重(kg) 55 70 85 …」整行数字，只取真实体重（如 29.2kg）
      const wm = t.match(/体重\s*\(?kg\)?\s*[:：]?\s*(\d+(?:\.\d+)?)(?!\s*\d)/i) || t.match(/(\d+(?:\.\d+)?)\s*kg/i);
      if (wm) weight = parseFloat(wm[1]);
    }
    if (id == null) { const im = t.match(/ID\s*[:：]?\s*(\d{4,10})/i); if (im) id = im[1]; }
    // ID 兜底：姓名所在行常紧跟 6 位病案号（如「29.2kg 071819 2026-...」）
    if (id == null) { const im2 = headLine.match(/\b(\d{6})\b/); if (im2) id = im2[1]; }
    if (testDate == null) { const dm = t.match(/(\d{4}\s*[-.\/年]\s*\d{1,2}\s*[-.\/月]\s*\d{1,2})/); if (dm) testDate = dm[1].replace(/[\s年]/g, '-').replace(/月/g, '-').replace(/日/g, '').replace(/[-.\/]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, ''); }
    if (score == null) {
      // OCR 常把「80」拆成「8 0」，故捕获紧随其后的第二段数字一并拼回
      const sc = t.match(/总分\s*[:：]?\s*(\d{1,3})(?:\s*(\d{1,2}))?/);
      if (sc) score = parseInt((sc[1] || '') + (sc[2] || ''), 10);
    }
    const bmi = (height && weight) ? Math.round(weight / Math.pow(height / 100, 2) * 10) / 10 : null;

    // —— 核心指标 ——
    const smi = n([
      new RegExp('四肢骨骼肌指数(?:\\s*SMI)?' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('骨骼肌指数' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('\\bASMI' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('\\bSMI' + G + '(\\d+(?:\\.\\d+)?)', 'i')
    ]);
    // 体脂百分比：要求「标签 + 冒号」上下文，避免误吞柱状图坐标刻度(0 5 10 …)
    const bodyFat = n([
      new RegExp('体脂百分比\\s*[:：＝=]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%?', 'i'),
      new RegExp('体脂肪率\\s*[:：＝=]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%?', 'i'),
      new RegExp('体脂率\\s*[:：＝=]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%?', 'i'),
      new RegExp('脂肪率\\s*[:：＝=]\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%?', 'i'),
      // 无冒号但数值紧跟「%」的变体（% 后缀可排除图表坐标轴误命中）
      new RegExp('体脂百分比\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%', 'i'),
      new RegExp('体脂肪率\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%', 'i'),
      new RegExp('体脂率\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%', 'i'),
      new RegExp('脂肪率\\s*(\\d{1,2}(?:\\.\\d+)?)\\s*%', 'i'),
      /Body\s*Fat\s*(?:Percentage)?\s*[:：=＝]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i
    ]);
    // 内脏脂肪：要求「面积/等级 + 冒号」上下文，避免误吞坐标
    const visceral = n([
      new RegExp('内脏脂肪面积\\s*[:：＝=]\\s*(\\d{1,3})', 'i'),
      new RegExp('内脏脂肪等级\\s*[:：＝=]\\s*(\\d{1,3})', 'i'),
      new RegExp('VFA(?:\\s*area)?\\s*[:：＝=]\\s*(\\d{1,3})', 'i'),
      new RegExp('VFA\\s*(\\d{1,3})', 'i'),
      new RegExp('Visceral\\s*Fat\\s*(?:Area|Level)?\\s*[:：＝=]\\s*(\\d{1,3})', 'i'),
      new RegExp('内脏脂肪\\s*[:：＝=]\\s*(\\d{1,3})', 'i')
    ]);
    // 骨骼肌量：优先「骨骼肌量」；否则由各节段求和（躯干+左上肢+右上肢+左下肢+右下肢）
    const segTrunk = (t.match(/躯干\s*(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
    const segLU = (t.match(/左上肢\s*(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
    const segRU = (t.match(/右上肢\s*(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
    const segLL = (t.match(/左下肢\s*(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
    const segRL = (t.match(/右下肢\s*(\d+(?:\.\d+)?)\s*kg/i) || [])[1];
    const segs = [segTrunk, segLU, segRU, segLL, segRL].filter(Boolean).map(Number);
    let muscleMass = n([
      new RegExp('骨骼肌量' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('Skeletal\\s*Muscle\\s*Mass' + G + '(\\d+(?:\\.\\d+)?)', 'i')
    ]);
    if (muscleMass == null && segs.length >= 3) {
      muscleMass = Math.round(segs.reduce((a, b) => a + b, 0) * 10) / 10;
    }
    const bmr = n([
      new RegExp('基础代谢(?:率|量)?' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('\\bBMR' + G + '(\\d+(?:\\.\\d+)?)', 'i'),
      new RegExp('Basal\\s*Metabolic\\s*Rate' + G + '(\\d+(?:\\.\\d+)?)', 'i')
    ]);
    // 细胞外水分比率（ECW/TBW）
    const ecwRatio = n([
      new RegExp('ASMI[^\\n]{0,20}(\\d\\.\\d{2,3})', 'i'),
      new RegExp('(?:细胞外水分|ECW)\\s*比率[^\\d\\n]{0,8}(\\d\\.\\d{2,3})', 'i')
    ]);

    return {
      type: 'bodycomposition', layout: 'bodycomposition',
      name, age, gender, height, weight, id, testDate, score, bmi,
      smi, bodyFat, visceral, muscleMass, bmr, ecwRatio,
      segmental: {
        trunk: segTrunk ? Number(segTrunk) : null,
        leftUpper: segLU ? Number(segLU) : null,
        rightUpper: segRU ? Number(segRU) : null,
        leftLower: segLL ? Number(segLL) : null,
        rightLower: segRL ? Number(segRL) : null
      },
      _raw: t.slice(0, 600)
    };
  }

})();
