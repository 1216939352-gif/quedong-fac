/**
 * 鹊动 PDF 报告解析器（前端本地化）
 * - 懒加载 pdf.js，避免阻塞首屏
 * - 解析等速 / 等张 / 等长官方报告
 * - 对扫描件/图片型 PDF 自动渲染为图片并 OCR（需联网加载 tesseract.js）
 * - 输出结构化字段 + 置信度标记
 */
(function () {
  'use strict';

  const SRC = {
    pdf: 'lib/pdf.min.js',
    worker: 'lib/pdf.worker.min.js'
  };

  let pdfLibReady = false;
  let pdfLoading = null;

  async function loadPdfJs() {
    if (pdfLibReady) return true;
    if (pdfLoading) return pdfLoading;
    pdfLoading = new Promise((resolve) => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = SRC.worker;
        pdfLibReady = true;
        return resolve(true);
      }
      const s = document.createElement('script');
      s.src = SRC.pdf;
      s.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = SRC.worker;
          pdfLibReady = true;
          resolve(true);
        } else {
          resolve(false);
        }
      };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
    return pdfLoading;
  }

  const CN_NUM = { '一': '01', '二': '02', '三': '03', '四': '04', '五': '05', '六': '06', '七': '07', '八': '08', '九': '09' };

  function parseDeviceId(text) {
    const m = text.match(/鹊动\s*(\d{1,2})\s*号|0?(\d)\s*号机|型号[：:]\s*(\d+)|测试设备[\s\S]{0,60}?(\d{2})|(\d{2})[-—]\s*[^\n]{0,30}测训单元|MET[\s\S]{0,60}?C(\d)/);
    if (m) {
      let id = m[1] || m[2] || m[3] || m[4] || m[5] || m[6];
      id = id.replace(/^0+/, '') || '0';
      return id.padStart(2, '0');
    }
    // 匹配“一号机/二号机”等中文数字
    for (const [cn, n] of Object.entries(CN_NUM)) {
      if (text.includes(cn + '号机')) return n;
      const r = new RegExp(cn + '号');
      if (r.test(text)) return n;
    }
    return null;
  }

  function parseSide(text) {
    if (text.includes('双侧') || text.includes('两侧')) return 'bilateral';
    if (/左|left/i.test(text)) return 'left';
    if (/右|right/i.test(text)) return 'right';
    return null;
  }

  function parseDate(text) {
    const m = text.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }

  /* 从行中提取数字/范围（用于 OCR 表格行；保留 70-30 这类范围） */
  function extractNumbers(line) {
    const out = [];
    (line.split(/[\s\u3000]+/) || []).forEach(t => {
      if (/^\d+(?:\.\d+)?[-~]\d+(?:\.\d+)?$/.test(t)) {
        out.push(t);
      } else {
        const m = t.match(/^-?\d+(?:\.\d+)?$/);
        if (m) out.push(parseFloat(m[0]));
      }
    });
    return out;
  }

  /* OCR 文本往往把表头也挤在一行，需去掉表头数字 */
  function rowNumbersAfter(line, marker) {
    const idx = line.indexOf(marker);
    if (idx < 0) return [];
    const tail = line.slice(idx + marker.length).replace(/[\s\u3000]+/g, ' ');
    // 去掉开头可能混入的 "T1"、"T2"、"数据对比" 等
    const cleaned = tail.replace(/^\s*(T\d+|数据对比|数据|对比)\s*/, '');
    return extractNumbers(cleaned);
  }

  function parseNumbers(lines) {
    const result = {};
    const trySet = (keys, val) => {
      keys.forEach(k => {
        if (result[k] == null && val != null) result[k] = val;
      });
    };
    // 等张字段范围校验（OCR 常把页脚日期/编号误识为指标）
    const isYearLike = v => v != null && v >= 1900 && v <= 2200;
    const validLoad = v => v != null && v > 0 && v <= 500 && !isYearLike(v);
    const validReps = v => v != null && v > 0 && v <= 100 && !isYearLike(v);
    const validXRM = v => v != null && v > 0 && v <= 500 && !isYearLike(v);
    const validRM1 = v => v != null && v > 0 && v <= 500 && !isYearLike(v);
    const validRM1Bw = v => v != null && v > 0 && v < 5 && !isYearLike(v);

    // 等速：按“向心 / 离心 / 向心离心(%)”行提取数字
    const isoHeaders = ['速度', '运动范围', '峰值力矩', '峰值力量', '峰值角度', '平均峰值力矩', '峰力矩/体重', '最大做功', '平均做功', '总功', '最大功率', '平均功率', '疲劳指数'];
    lines.forEach(line => {
      if (/向心/.test(line) && !/离心/.test(line)) {
        const nums = rowNumbersAfter(line, '向心');
        if (nums.length >= 10) {
          trySet(['speed'], nums[0]);
          trySet(['rom'], nums[1]);
          trySet(['concentricPT'], nums[2]);
          trySet(['concentricForce'], nums[3]);
          trySet(['concentricAngle'], nums[4]);
          trySet(['concentricAvgPT'], nums[5]);
          trySet(['ptBw', 'concentricPtBw'], nums[6]);
          trySet(['maxWork', 'concentricMaxWork'], nums[7]);
          trySet(['avgWork', 'concentricAvgWork'], nums[8]);
          trySet(['totalWork', 'concentricTotalWork'], nums[9]);
          trySet(['maxPower', 'concentricMaxPower'], nums[10]);
          trySet(['avgPower', 'concentricAvgPower'], nums[11]);
          trySet(['fatigueIndex', 'concentricFatigueIndex'], nums[12]);
        }
      }
      if (/离心/.test(line) && !/向心/.test(line)) {
        const nums = rowNumbersAfter(line, '离心');
        if (nums.length >= 10) {
          trySet(['speed'], nums[0]);
          trySet(['rom'], nums[1]);
          trySet(['eccentricPT'], nums[2]);
          trySet(['eccentricForce'], nums[3]);
          trySet(['eccentricAngle'], nums[4]);
          trySet(['eccentricAvgPT'], nums[5]);
          trySet(['eccentricPtBw'], nums[6]);
          trySet(['eccentricMaxWork'], nums[7]);
          trySet(['eccentricAvgWork'], nums[8]);
          trySet(['eccentricTotalWork'], nums[9]);
          trySet(['eccentricMaxPower'], nums[10]);
          trySet(['eccentricAvgPower'], nums[11]);
          trySet(['eccentricFatigueIndex'], nums[12]);
          // 兼容旧版：仅当向心未提供时才回退到离心值
          if (result.ptBw == null) trySet(['ptBw'], nums[6]);
          if (result.maxWork == null) trySet(['maxWork'], nums[7]);
          if (result.avgWork == null) trySet(['avgWork'], nums[8]);
          if (result.totalWork == null) trySet(['totalWork'], nums[9]);
          if (result.maxPower == null) trySet(['maxPower'], nums[10]);
          if (result.avgPower == null) trySet(['avgPower'], nums[11]);
          if (result.fatigueIndex == null) trySet(['fatigueIndex'], nums[12]);
        }
      }
    });

    lines.forEach(line => {
      // 等速行：向心/离心 + 速度(°/s) + 运动范围 + PT(N·m) + 峰值力量(N) + 峰值角度 + 平均峰值力矩 + PT/BW + 最大做功 + 平均做功 + 总功 + 最大功率 + 平均功率 + FI
      // 报告实际列：向心 / 速度 30 / 运动范围 70-30 / 峰值力矩 90.77 / 峰值力量 275.06 / 峰值角度 67 / 平均峰值力矩 74.34 / 力矩/体重 1.26 / 最大做功 11.28 / 平均做功 8.89 / 总功 44.48 / 最大功率 5.80 / 平均功率 4.32 / 疲劳指数 1.00
      const con = line.match(/向心\s+(\d+(?:\.\d+)?)[\s\S]{0,30}?(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
      if (con) {
        result.speed = U.num(result.speed) || U.num(con[1]);
        result.rom = result.rom || con[2];
        result.concentricPT = U.num(con[3]);
        result.concentricForce = U.num(con[4]);
        result.concentricAngle = U.num(con[5]);
        result.concentricAvgPT = U.num(con[6]);
        result.concentricPtBw = U.num(result.concentricPtBw) || U.num(con[7]);
        result.ptBw = U.num(result.ptBw) || U.num(con[7]);
        result.concentricMaxWork = U.num(con[8]);
        result.maxWork = U.num(con[8]);
        result.concentricAvgWork = U.num(con[9]);
        result.avgWork = U.num(con[9]);
        result.concentricTotalWork = U.num(con[10]);
        result.totalWork = U.num(con[10]);
        result.concentricMaxPower = U.num(con[11]);
        result.maxPower = U.num(con[11]);
        result.concentricAvgPower = U.num(con[12]);
        result.avgPower = U.num(con[12]);
        result.concentricFatigueIndex = U.num(con[13]);
        result.fatigueIndex = U.num(con[13]);
      }

      const ecc = line.match(/离心\s+(\d+(?:\.\d+)?)[\s\S]{0,30}?(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
      if (ecc) {
        result.speed = U.num(result.speed) || U.num(ecc[1]);
        result.eccentricPT = U.num(ecc[3]);
        result.eccentricForce = U.num(ecc[4]);
        result.eccentricAngle = U.num(ecc[5]);
        result.eccentricAvgPT = U.num(ecc[6]);
        result.eccentricPtBw = U.num(ecc[7]);
        result.eccentricMaxWork = U.num(ecc[8]);
        result.eccentricAvgWork = U.num(ecc[9]);
        result.eccentricTotalWork = U.num(ecc[10]);
        result.eccentricMaxPower = U.num(ecc[11]);
        result.eccentricAvgPower = U.num(ecc[12]);
        result.eccentricFatigueIndex = U.num(ecc[13]);
        result.ptBw = U.num(result.ptBw) || U.num(ecc[7]);
        if (result.maxWork == null) result.maxWork = U.num(ecc[8]);
        if (result.avgWork == null) result.avgWork = U.num(ecc[9]);
        if (result.totalWork == null) result.totalWork = U.num(ecc[10]);
        if (result.maxPower == null) result.maxPower = U.num(ecc[11]);
        if (result.avgPower == null) result.avgPower = U.num(ecc[12]);
        if (result.fatigueIndex == null) result.fatigueIndex = U.num(ecc[13]);
      }

      // 等张行：日期 侧别 重量 重复次数 XRM 1RM 1RM/BW
      const iot = line.match(/(\d{4}-\d{2}-\d{2})\s+\S+\s+(\d+(?:\.\d+)?)\s+(\d+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/);
      if (iot) {
        const vLoad = U.num(iot[2]), vReps = U.num(iot[3]), vXrm = U.num(iot[4]), vRm1 = U.num(iot[5]), vRm1Bw = U.num(iot[6]);
        if (validLoad(vLoad) && validReps(vReps) && validXRM(vXrm) && validRM1(vRm1) && validRM1Bw(vRm1Bw)) {
          result.date = iot[1];
          trySet(['load'], vLoad);
          trySet(['reps'], vReps);
          trySet(['xrm'], vXrm);
          trySet(['rm1'], vRm1);
          trySet(['rm1Bw'], vRm1Bw);
        }
      }
      // OCR 等张行常见格式：日期 侧别 后接多列数字（去掉单位）
      const iot2 = line.match(/(\d{4}-\d{2}-\d{2})[\s\S]{0,30}?(?:双侧|左侧|右侧)[\s\u3000]+(\d+(?:\.\d+)?)[\s\u3000]+(\d+)[\s\u3000]+(\d+(?:\.\d+)?)[\s\u3000]+(\d+(?:\.\d+)?)[\s\u3000]+(\d+(?:\.\d+)?)/);
      if (iot2) {
        const vLoad = U.num(iot2[2]), vReps = U.num(iot2[3]), vXrm = U.num(iot2[4]), vRm1 = U.num(iot2[5]), vRm1Bw = U.num(iot2[6]);
        if (validLoad(vLoad) && validReps(vReps) && validXRM(vXrm) && validRM1(vRm1) && validRM1Bw(vRm1Bw)) {
          result.date = result.date || iot2[1];
          trySet(['load'], vLoad);
          trySet(['reps'], vReps);
          trySet(['xrm'], vXrm);
          trySet(['rm1'], vRm1);
          trySet(['rm1Bw'], vRm1Bw);
        }
      }

      // 通用字段
      const fi = line.match(/(?:疲劳指数|Fatigue\s*Index)[：:\s]+(\d+(?:\.\d+)?)/i);
      if (fi) result.fatigueIndex = U.num(fi[1]);
      const pt = line.match(/(?:峰值力矩|Peak\s*Torque)[：:\s]+(\d+(?:\.\d+)?)/i);
      if (pt) result.concentricPT = U.num(pt[1]);
      const pbw = line.match(/(?:力矩\/体重|PT\/BW|PTBW|Torque\s*\/\s*BW|Torque\s*Per\s*BW)[：:\s]+(\d+(?:\.\d+)?)/i);
      if (pbw) result.ptBw = U.num(pbw[1]);
      // 等速：按标签精确捕获（覆盖表头与数值不在同行、表格被拆分的报告；中英双语）
      const pf = line.match(/(?:峰值力量|峰值力|Peak\s*Force)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (pf) result.concentricForce = U.num(pf[1]);
      const pa = line.match(/(?:峰值角度|Peak\s*Angle)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (pa) result.concentricAngle = U.num(pa[1]);
      const apt = line.match(/(?:平均峰值力矩|Avg\s*Peak\s*Torque)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (apt) result.concentricAvgPT = U.num(apt[1]);
      const mw = line.match(/(?:最大做功|Max\s*Work)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (mw) result.maxWork = U.num(mw[1]);
      const aw = line.match(/(?:平均做功|Avg\s*Work)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (aw) result.avgWork = U.num(aw[1]);
      const tw = line.match(/(?:总功|Total\s*Work)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (tw) result.totalWork = U.num(tw[1]);
      const mp = line.match(/(?:最大功率|Max\s*Power)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (mp) result.maxPower = U.num(mp[1]);
      const ap = line.match(/(?:平均功率|Avg\s*Power)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (ap) result.avgPower = U.num(result.avgPower) || U.num(ap[1]);
      const ept = line.match(/离心[^\n]{0,20}?(?:峰值力矩|峰值扭力|Peak\s*Torque)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (ept) result.eccentricPT = U.num(ept[1]);
      const epf = line.match(/离心[^\n]{0,20}?(?:峰值力量|峰值力)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (epf) result.eccentricForce = U.num(epf[1]);
      const epa = line.match(/离心[^\n]{0,20}?(?:峰值角度)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (epa) result.eccentricAngle = U.num(epa[1]);
      const eapt = line.match(/离心[^\n]{0,20}?(?:平均峰值力矩)[：:\s]*(\d+(?:\.\d+)?)/i);
      if (eapt) result.eccentricAvgPT = U.num(eapt[1]);
      const lsi = line.match(/LSI[：:\s]+(\d+(?:\.\d+)?)/i);
      if (lsi) result.lsi = U.num(lsi[1]);
      // 等张通用字段（仅在未抽到表格行时兜底；必须过范围校验，避免把定义段/页脚年份当指标）
      const rm1m = line.match(/(?:1RM|最大力量)(?!\/BW)\s*[:：=＝]?\s*(\d+(?:\.\d+)?)(?!\s*RM)/);
      if (rm1m) {
        const v = U.num(rm1m[1]);
        if (validRM1(v)) trySet(['rm1'], v);
      }
      const rm1bwm = line.match(/1RM\/BW\s*[:：=＝]?\s*(\d+(?:\.\d+)?)/i);
      if (rm1bwm) {
        const v = U.num(rm1bwm[1]);
        if (validRM1Bw(v)) trySet(['rm1Bw'], v);
      }
    });

    return result;
  }

  /* 叙述式「分析」报告解析：报告以健侧/患侧（healthy/affected）× 向心/离心（concentric/eccentric）
   * 成对呈现做功(J)/功率(W)/力矩峰值，指标嵌在散文中（如「健侧左下肢峰值做功 38.6J、平均做功 24.7J；
   * 患侧右下肢峰值 34.8J、平均 19.4J」）。现有表格正则无法命中，这里专门抽取。 */
  function parseNarrative(lines, type) {
    if (type !== 'isokinetic' && type !== 'isotonic') return null;
    const out = { healthy: {}, affected: {}, deficitPct: null };
    let phase = 'concentric';
    // 续行合并：某些 PDF 把「平均」「峰值」等标签与数值分到相邻两行（数值换行），
    // 若当前行以中文结尾且下一行以数字开头，则并入当前行再解析。
    const norm = [];
    for (let i = 0; i < lines.length; i++) {
      let ln = lines[i];
      while (/[一-鿿]$/.test(ln.replace(/\s+$/, '')) && i + 1 < lines.length && /^\s*\d/.test(lines[i + 1])) {
        ln = ln + ' ' + lines[i + 1].trim();
        i++;
      }
      norm.push(ln);
    }
    lines = norm;
    const setM = (side, key, val) => { if (val != null && !isNaN(val)) out[side][key] = val; };
    const sideSegRe = /(健侧|患侧)([\s\S]*?)(?=健侧|患侧|$)/g;
    lines.forEach(line => {
      // 注意：PDF 可能把「离心功率」渲染成「离 心 功 率」（字间空格），故用宽松匹配
      if (/向心收缩|向心期|向心阶段|向心肌肉|向心\s*功率|向心/.test(line)) phase = 'concentric';
      if (/离心收缩|离心期|离心阶段|离心肌肉|离心\s*功率|离心/.test(line)) phase = 'eccentric';

      // 最大力矩峰值（患侧 1755.9，健侧 1826.5）
      if (/最大力矩峰值|峰值力矩/.test(line)) {
        const am = line.match(/患侧[^0-9]{0,8}?(\d+(?:\.\d+)?)/) || line.match(/最大力矩峰值[^0-9]{0,8}?(\d+(?:\.\d+)?)/);
        if (am) setM('affected', 'maxTorque', U.num(am[1]));
        const hm = line.match(/健侧可达\s*(\d+(?:\.\d+)?)/);
        if (hm) setM('healthy', 'maxTorque', U.num(hm[1]));
      }
      // 向心峰值力矩患侧比健侧低 13.9%
      const df = line.match(/(?:峰值力矩|力矩)[^0-9]{0,20}?患侧比健侧低\s*(\d+(?:\.\d+)?)\s*%/);
      if (df) out.deficitPct = U.num(df[1]);

      // 按「健侧/患侧」切分片段，片段内抽取做功(J)/功率(W)
      let ms;
      sideSegRe.lastIndex = 0;
      while ((ms = sideSegRe.exec(line)) !== null) {
        const side = ms[1] === '患侧' ? 'affected' : 'healthy';
        const seg = ms[2];
        const p = (phase || 'concentric');
        const pw = seg.match(/峰值做功\s*(\d+(?:\.\d+)?)\s*J/);
        if (pw) setM(side, p + 'PeakWork', U.num(pw[1]));
        const aw = seg.match(/平均做功\s*(\d+(?:\.\d+)?)\s*J/);
        if (aw) setM(side, p + 'AvgWork', U.num(aw[1]));
        if (!pw) { const p2 = seg.match(/峰值\s*(\d+(?:\.\d+)?)\s*J/); if (p2) setM(side, p + 'PeakWork', U.num(p2[1])); }
        if (!aw) { const a2 = seg.match(/平均\s*(\d+(?:\.\d+)?)\s*J/); if (a2) setM(side, p + 'AvgWork', U.num(a2[1])); }
        const pk = seg.match(/峰值\s*(\d+(?:\.\d+)?)\s*W/);
        if (pk) setM(side, p + 'PowerPeak', U.num(pk[1]));
        const pa = seg.match(/平均\s*(\d+(?:\.\d+)?)\s*W/);
        if (pa) setM(side, p + 'PowerAvg', U.num(pa[1]));
        // 兜底：该侧片段内唯一的 W 数值（如「患侧仅 3.7W」无 平均/峰值 标签）
        if (!pk && !pa) {
          const anyW = seg.match(/(\d+(?:\.\d+)?)\s*W/);
          if (anyW) setM(side, p + 'PowerAvg', U.num(anyW[1]));
        }
      }
    });
    return out;
  }

  /* 将叙述式解析结果并入 flat 字段（取患侧/健侧中较完整的一侧，优先患侧），
   * 仅填充表格解析未覆盖的字段，避免覆盖已有高精度数据。 */
  function mergeNarrative(fields, narr) {
    if (!narr) return;
    const side = (narr.affected && Object.keys(narr.affected).length) ? narr.affected : narr.healthy;
    if (!side) return;
    const safe = (v) => (v == null || isNaN(v) ? null : v);
    // 叙述式「分析」报告以患侧（afflicted）指标为核心，且其数值比表格正则抓到的健侧值更具临床意义，
    // 因此当叙述式已抽取到该字段时优先采用（覆盖 parseNumbers 可能抓到的健侧/歧义值）。
    if (side.concentricPeakWork != null) fields.maxWork = safe(side.concentricPeakWork);
    if (side.concentricAvgWork != null) fields.avgWork = safe(side.concentricAvgWork);
    if (side.concentricPowerPeak != null) fields.maxPower = safe(side.concentricPowerPeak);
    if (side.concentricPowerAvg != null) fields.avgPower = safe(side.concentricPowerAvg);
    if (side.eccentricPeakWork != null) fields.eccentricMaxWork = safe(side.eccentricPeakWork);
    if (side.eccentricAvgWork != null) fields.eccentricAvgWork = safe(side.eccentricAvgWork);
    if (side.eccentricPowerAvg != null) fields.eccentricAvgPower = safe(side.eccentricPowerAvg);
    if (side.maxTorque != null) fields.concentricPT = safe(side.maxTorque);
    if (narr.deficitPct != null) fields.deficitPct = safe(narr.deficitPct);
    // 保存完整叙述式结构，供报告页按侧别展示
    fields.narrative = narr;
  }

  function detectReportType(text) {
    if (text.includes('等速') || text.includes('F-Max') || text.includes('峰值力矩') || text.includes('向心') || text.includes('离心')) return 'isokinetic';
    if (text.includes('等张') || text.includes('XRM') || text.includes('1RM') || text.includes('重复次数')) return 'isotonic';
    if (text.includes('等长') || text.includes('最大等长') || text.includes('MVC')) return 'isometric';
    return 'unknown';
  }

  /* OCR 文本归一化：去除中文（CJK）之间的逐字空格（「向 心」→「向心」），避免后续正则/字段抽取失配 */
  function normCJK(t) {
    if (!t) return t;
    let s = String(t);
    const re = /([一-鿿])\s+([一-鿿])/g;
    let prev;
    do { prev = s; s = s.replace(re, '$1$2'); } while (s !== prev);
    return s;
  }

  /* 扫描件/图片型 PDF：渲染为 canvas 图片后 OCR */
  async function ocrPdfPages(pdf) {
    if (typeof window.IsoOCR !== 'object' || typeof window.IsoOCR.createWorker !== 'function') {
      return null;
    }
    let worker;
    try {
      worker = await window.IsoOCR.createWorker();
      let ocrText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2.5;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) continue;
        const txt = await window.IsoOCR.recognizeBlob(worker, blob);
        ocrText += (txt || '') + '\n';
      }
      return normCJK(ocrText);
    } finally {
      if (worker) {
        try { await window.IsoOCR.terminateWorker(worker); } catch (e) {}
      }
    }
  }

  /**
   * 将 pdf.js 的 textContent.items 还原为「按行排列」的文本。
   * 关键点：原实现直接把所有 item.str 用空格拼接成一行，导致表格数字与表头错位，
   * 使「向心/离心」行正则、标签正则难以命中。这里按 y 坐标聚类成真实行、行内按 x 排序，
   * 最大程度还原报告版式，提升字段抽取成功率。
   */
  function itemsToLineStrings(items) {
    if (!items || !items.length) return [];
    const safe = items.map(it => ({
      str: it.str != null ? it.str : '',
      x: (it.transform && it.transform[4]) || 0,
      y: (it.transform && it.transform[5]) || 0
    }));
    // 自上而下排序，按 y 容差（6px）聚类成行
    const byY = safe.slice().sort((a, b) => b.y - a.y);
    const rows = [];
    let cur = null;
    for (const it of byY) {
      if (!cur || Math.abs(it.y - cur.y) > 6) {
        cur = { y: it.y, items: [] };
        rows.push(cur);
      }
      cur.items.push(it);
    }
    // 行内按 x 从左到右排序，重建阅读顺序。
    // 关键修复：部分 PDF 把每个中文字符拆成独立 text item（如「离 心 功 率」），
    // 相邻两个中文字之间不应插入空格；但中文字与数字/字母之间保留空格（保留表格列间距）。
    return rows.map(r => {
      const its = r.items.sort((a, b) => a.x - b.x);
      let s = '';
      for (let i = 0; i < its.length; i++) {
        const cur = its[i].str;
        if (i > 0) {
          const prev = its[i - 1].str;
          const prevCJK = /[一-鿿]/.test(prev.slice(-1));
          const curCJK = /[一-鿿]/.test(cur.charAt(0) || '');
          if (!(prevCJK && curCJK)) s += ' ';
        }
        s += cur;
      }
      // 兜底：清除任何夹在两个中文字之间的空格（含 PDF 用空格 item 表示字间距的情况）
      return s.replace(/([一-鿿])\s+([一-鿿])/g, '$1$2');
    });
  }

  async function pageToLines(page) {
    const content = await page.getTextContent();
    return itemsToLineStrings(content && content.items);
  }

  async function parseFile(file, opts) {
    opts = opts || {};
    const loaded = await loadPdfJs();
    if (!loaded) throw new Error('PDF 解析库加载失败，请检查 lib/pdf.min.js 与 pdf.worker.min.js 是否存在。');
    if (typeof window.pdfjsLib.getDocument !== 'function') {
      throw new Error('PDF 解析库加载异常，请确认 lib/pdf.min.js 完整可用。');
    }

    let pdf;
    try {
      const arrayBuffer = await file.arrayBuffer();
      pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    } catch (e) {
      throw new Error('PDF 文件损坏或无法打开（' + (e && e.message ? e.message : '未知错误') + '）。请确认上传的是有效的 PDF 文件。');
    }

    const perPage = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const lines = await pageToLines(page);
      perPage.push(lines.join('\n'));
    }
    let fullText = perPage.join('\n');

    let parsedViaOcr = false;
    // 若 pdf.js 未提取到任何文本（扫描件/纯图 PDF），自动渲染为图片并 OCR
    if (!fullText.trim() || fullText.trim().length < 20) {
      const ocrText = await ocrPdfPages(pdf);
      if (ocrText && ocrText.trim().length >= 20) {
        fullText = ocrText;
        parsedViaOcr = true;
      } else {
        throw new Error('该报告为扫描件或图片型 PDF，OCR 未能识别文字。请使用“OCR 图片”或“手动填写”模式录入指标。');
      }
    }

    const detected = detectReportType(fullText);
    // 调用方已知报告类型（来自「等速肌力评估」/「等张肌力评估」页面），以调用方为准，
    // 避免真实报告因措辞差异（不含等速/向心等关键字）被误判为 unknown 而遭到拒绝。
    const type = (opts.typeHint && opts.typeHint !== 'unknown')
      ? opts.typeHint
      : (detected !== 'unknown' ? detected : (opts.typeHint || 'unknown'));
    if (type === 'unknown') {
      throw new Error('未识别出鹊动官方报告格式，请确认上传的是等速/等张/等长肌力测试报告，或改用「Excel 表格识别」、手动录入。');
    }

    const lines = fullText.split(/\n/).map(s => s.trim()).filter(Boolean);
    const numbers = parseNumbers(lines);
    // 叙述式「分析」报告（健侧/患侧 × 向心/离心 成对指标）：表格正则无法命中，单独抽取并并入
    const narr = parseNarrative(lines, type);
    mergeNarrative(numbers, narr);

    const result = {
      type,
      rawText: fullText,
      parsedViaOcr,
      confidence: 'medium',
      fields: {
        deviceId: parseDeviceId(fullText),
        side: parseSide(fullText),
        testDate: parseDate(fullText) || numbers.date || null
      }
    };

    if (type === 'isokinetic') {
      Object.assign(result.fields, {
        speed: numbers.speed || null,
        rom: numbers.rom || null,
        concentricPT: numbers.concentricPT || null,
        eccentricPT: numbers.eccentricPT || null,
        ptBw: numbers.ptBw || null,
        totalWork: numbers.totalWork || null,
        avgPower: numbers.avgPower || null,
        fatigueIndex: numbers.fatigueIndex || null,
        maxWork: numbers.maxWork || null,
        avgWork: numbers.avgWork || null,
        maxPower: numbers.maxPower || null,
        concentricAngle: numbers.concentricAngle || null,
        eccentricAngle: numbers.eccentricAngle || null,
        concentricForce: numbers.concentricForce || null,
        concentricAvgPT: numbers.concentricAvgPT || null,
        eccentricForce: numbers.eccentricForce || null,
        eccentricAvgPT: numbers.eccentricAvgPT || null,
        eccentricMaxWork: numbers.eccentricMaxWork || null,
        eccentricAvgWork: numbers.eccentricAvgWork || null,
        eccentricAvgPower: numbers.eccentricAvgPower || null,
        deficitPct: numbers.deficitPct || null,
        narrative: numbers.narrative || null
      });
      // 若文本里只有一侧数据，confidence 降低
      result.confidence = result.fields.side && result.fields.concentricPT ? 'high' : 'low';
    } else if (type === 'isotonic') {
      Object.assign(result.fields, {
        load: numbers.load || null,
        reps: numbers.reps || null,
        xrm: numbers.xrm || null,
        rm1: numbers.rm1 || null,
        rm1Bw: numbers.rm1Bw || null
      });
      result.confidence = result.fields.rm1 ? 'high' : 'low';
    }

    return result;
  }

  window.PdfParser = {
    parseFile,
    detectReportType,
    loadPdfJs,
    parseNumbers,
    parseNarrative,
    mergeNarrative,
    parseDeviceId,
    parseSide,
    parseDate,
    itemsToLineStrings
  };
})();
