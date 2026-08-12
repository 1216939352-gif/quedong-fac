/**
 * 鹊动 Excel 报告解析器（纯前端 / 无第三方依赖）
 * - 支持 .xlsx（OOXML）解析：解压 ZIP（用浏览器原生 DecompressionStream）+ 解析 XML
 * - 解析 sharedStrings / workbook / worksheet -> 二维表矩阵
 * - 提供 extractFields：按标签就近数值提取等速 / 等张关键字段
 * - 对扫描件 / 图片型报告无能为力（请走 OCR）；.xls(旧版 BIFF) 暂不支持
 */
(function () {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);

  /* ---------- 字节工具 ---------- */
  function readUint32LE(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
  }
  function readUint16LE(bytes, off) {
    return (bytes[off] | (bytes[off + 1] << 8)) >>> 0;
  }
  function decodeLatin1(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  }
  function decodeUtf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    // 退路（极少）：直接用 latin1 近似（中文会乱码，但仅用于文件名）
    return decodeLatin1(bytes);
  }

  /* ---------- ZIP 解压（中央目录） ---------- */
  async function inflateZlib(bytes) {
    // ZIP 的 deflate 方法（method=8）即为原生 DEFLATE 字节流（RFC1951，无 zlib 头/尾）。
    // 浏览器/Node 的 Web Stream 中对应格式串为 'deflate-raw'；旧浏览器可能仅支持 'deflate'，做兜底。
    const src = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    let lastErr;
    for (const fmt of ['deflate-raw', 'deflate']) {
      try {
        if (typeof DecompressionStream === 'undefined') throw new Error('环境不支持 DecompressionStream');
        const ds = new DecompressionStream(fmt);
        const writer = ds.writable.getWriter();
        await writer.write(src);
        await writer.close();
        const buf = await new Response(ds.readable).arrayBuffer();
        return new Uint8Array(buf);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('DEFLATE 解压失败');
  }

  async function unzip(uint8) {
    const files = {};
    // 1) 定位 EOCD
    let eocd = -1;
    for (let i = uint8.length - 22; i >= 0; i--) {
      if (uint8[i] === 0x50 && uint8[i + 1] === 0x4b && uint8[i + 2] === 0x05 && uint8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 ZIP / XLSX 文件（未找到中央目录）');
    const cdOffset = readUint32LE(uint8, eocd + 16);
    const cdCount = readUint16LE(uint8, eocd + 10);

    let p = cdOffset;
    for (let n = 0; n < cdCount; n++) {
      if (uint8[p] !== 0x50 || uint8[p + 1] !== 0x4b || uint8[p + 2] !== 0x01 || uint8[p + 3] !== 0x02) break;
      const compMethod = readUint16LE(uint8, p + 10);
      const compSize = readUint32LE(uint8, p + 20);
      const fnameLen = readUint16LE(uint8, p + 28);
      const extraLen = readUint16LE(uint8, p + 30);
      const commentLen = readUint16LE(uint8, p + 32);
      const localOffset = readUint32LE(uint8, p + 42);
      const nameBytes = uint8.subarray(p + 46, p + 46 + fnameLen);
      const name = decodeUtf8(nameBytes);
      p += 46 + fnameLen + extraLen + commentLen;

      // 读本地文件头，定位数据起始
      const lNameLen = readUint16LE(uint8, localOffset + 26);
      const lExtraLen = readUint16LE(uint8, localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const comp = uint8.subarray(dataStart, dataStart + compSize);

      let data;
      if (compMethod === 0) data = comp.slice();            // store
      else if (compMethod === 8) data = await inflateZlib(comp); // deflate
      else throw new Error('不支持的压缩方式（method=' + compMethod + '）：' + name);

      files[name] = data;
    }
    return files;
  }

  /* ---------- XML 文本工具 ---------- */
  function entityDecode(s) {
    return s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .replace(/&amp;/g, '&');
  }
  function allMatches(str, re) {
    const out = []; let m;
    re.lastIndex = 0;
    while ((m = re.exec(str)) !== null) { out.push(m); if (m.index === re.lastIndex) re.lastIndex++; }
    return out;
  }

  function parseSharedStrings(files) {
    const key = Object.keys(files).find(k => /sharedStrings\.xml$/i.test(k));
    if (!key) return [];
    const xml = decodeUtf8(files[key]);
    const sis = allMatches(xml, /<si>([\s\S]*?)<\/si>/g);
    return sis.map(si => {
      const ts = allMatches(si[1], /<t[^>]*>([\s\S]*?)<\/t>/g).map(t => entityDecode(t[1]));
      return ts.join('');
    });
  }

  function colToIndex(col) {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  function parseSheet(xml, shared) {
    const rows = {};
    let maxRow = 0, maxCol = 0;
    const rowMatches = allMatches(xml, /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g);
    rowMatches.forEach(rm => {
      const r = parseInt(rm[1], 10);
      if (r > maxRow) maxRow = r;
      const cells = allMatches(rm[2], /<c\b([^>]*)>([\s\S]*?)<\/c>/g);
      rows[r] = rows[r] || {};
      cells.forEach(cm => {
        const attrs = cm[1];
        const body = cm[2];
        const rAttr = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1] || '';
        const colStr = rAttr.replace(/\d+$/, '');
        const tAttr = (attrs.match(/\bt="([^"]+)"/) || [])[1];
        const col = colToIndex(colStr);
        if (col > maxCol) maxCol = col;
        let val = '';
        if (tAttr === 's') {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
          const idx = parseInt(v, 10);
          val = (shared[idx] != null) ? shared[idx] : '';
        } else if (tAttr === 'inlineStr') {
          const isMatch = body.match(/<is>([\s\S]*?)<\/is>/);
          val = isMatch ? allMatches(isMatch[1], /<t[^>]*>([\s\S]*?)<\/t>/g).map(t => entityDecode(t[1])).join('') : '';
        } else {
          const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (v != null) {
            const num = Number(v);
            val = isNaN(num) ? entityDecode(v) : num;
          }
        }
        rows[r][col] = val;
      });
    });
    // 规整为二维数组（空 cell 用 ''）
    const matrix = [];
    for (let r = 1; r <= maxRow; r++) {
      const row = [];
      const src = rows[r] || {};
      for (let c = 0; c <= maxCol; c++) {
        const v = src[c];
        row.push(v == null ? '' : v);
      }
      // 去掉整行空行
      if (row.some(x => x !== '')) matrix.push(row);
    }
    return matrix;
  }

  function parseWorkbook(files) {
    const wbKey = Object.keys(files).find(k => /xl\/workbook\.xml$/i.test(k));
    const relsKey = Object.keys(files).find(k => /xl\/_rels\/workbook\.xml\.rels$/i.test(k));
    // 列出所有 worksheet 文件
    const sheetFileKeys = Object.keys(files).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/i.test(k))
      .sort((a, b) => {
        const na = parseInt((a.match(/sheet(\d+)\.xml$/i) || [])[1] || '0', 10);
        const nb = parseInt((b.match(/sheet(\d+)\.xml$/i) || [])[1] || '0', 10);
        return na - nb;
      });

    // 按文档顺序将 workbook 中的 sheet 名称与工作表文件配对（更稳定，无需解析 rels）
    const nameOf = {};
    if (wbKey) {
      const wb = decodeUtf8(files[wbKey]);
      const sheetEls = allMatches(wb, /<sheet\b([^>]*)\/>/g);
      sheetFileKeys.forEach((key, i) => {
        const name = sheetEls[i]
          ? ((sheetEls[i][1].match(/\bname="([^"]+)"/) || [])[1] || ('Sheet' + (i + 1)))
          : ('Sheet' + (i + 1));
        nameOf[key] = name;
      });
    }

    const shared = parseSharedStrings(files);
    const sheets = sheetFileKeys.map((key, i) => {
      const name = nameOf[key] || nameOf[key.replace(/^\//, '')] || ('Sheet' + (i + 1));
      return { name, rows: parseSheet(decodeUtf8(files[key]), shared) };
    });
    if (!sheets.length) throw new Error('Excel 中未找到工作表（worksheet）');
    return sheets;
  }

  /* ---------- 字段提取（标签就近数值） ---------- */
  function toNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/,/g, '').replace(/[\s ]/g, '');
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    return null;
  }

  function findValue(matrix, labelRegs) {
    // 在矩阵中找包含标签的单元格，优先同一行右侧单元格、再其正下方单元格、再本单元格内冒号后的数值
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        const cell = matrix[r][c];
        if (typeof cell !== 'string') continue;
        for (const re of labelRegs) {
          const m = cell.match(re);
          if (!m) continue;
          // 本单元格内冒号后的数值
          const inline = (cell.match(/[：:]\s*([+-]?\d+(?:\.\d+)?)/) || [])[1];
          if (inline != null) return parseFloat(inline);
          // 同一行右侧
          for (let cc = c + 1; cc < matrix[r].length; cc++) {
            const n = toNum(matrix[r][cc]);
            if (n != null) return n;
          }
          // 正下方
          if (r + 1 < matrix.length) {
            const n = toNum(matrix[r + 1][c]);
            if (n != null) return n;
          }
        }
      }
    }
    return null;
  }

  const ISO_LABELS = {
    concentricPT: [/(?:峰值力矩|峰值扭力|peak\s*torque)/i],
    eccentricPT: [/(?:离心峰值力矩|离心.*?力矩)/i],
    ptBw: [/(?:峰力矩[\s/]*体重|力矩[\s/]*体重|相对峰值力矩|pt[\s/]*bw|torque\s*per\s*body)/i],
    peakForce: [/(?:峰值力量|peak\s*force)/i],
    peakAngle: [/(?:峰值角度|peak\s*angle)/i],
    speed: [/(?:测试速度|运动速度|速度|speed)/i],
    rom: [/(?:运动范围|关节活动度|活动范围|\brom\b)/i],
    totalWork: [/(?:总功|total\s*work)/i],
    maxWork: [/(?:最大做功|max\s*work)/i],
    avgWork: [/(?:平均做功|avg\s*work)/i],
    maxPower: [/(?:最大功率|max\s*power)/i],
    avgPower: [/(?:平均功率|avg[\s\-]*power|average\s*power)/i],
    fatigueIndex: [/(?:疲劳指数|疲劳|fatigue)/i]
  };
  const IOT_LABELS = {
    load: [/(?:负荷|负荷重量|重量|weight|load)/i],
    reps: [/(?:重复次数|次数|rep(?:s|etitions)?)/i],
    xrm: [/\bxrm\b/i],
    rm1: [/(?:1\s*rm|最大力量|1rm)/i],
    rm1Bw: [/(?:1\s*rm\s*[\/／]\s*bw|1rm\/bw|rm\/bw|rm1\/bw|1\s*rm[\/／]?\s*体重|1rm相对|相对.*?1rm|1\s*rm体型比)/i],
    lsi: [/\blsi\b|对称指数/i]
  };

  function matrixText(matrix) {
    return matrix.map(row => row.filter(x => x !== '').join(' ')).join('\n');
  }

  function parseDeviceId(text) {
    const m = text.match(/鹊动\s*(\d{1,2})\s*号|0?(\d)\s*号机|型号[：:]\s*(\d+)|(\d{2})[-—]\s*[^\n]{0,30}测训单元/);
    if (m) {
      let id = m[1] || m[2] || m[3] || m[4] || '';
      id = String(id).replace(/^0+/, '') || '0';
      return id.padStart(2, '0');
    }
    for (const [cn, n] of [['一','01'],['二','02'],['三','03'],['四','04'],['五','05'],['六','06'],['七','07'],['八','08'],['九','09']]) {
      if (text.includes(cn + '号机')) return n;
      if (new RegExp(cn + '号').test(text)) return n;
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
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }

  function extractFields(matrix) {
    const fields = {};
    Object.keys(ISO_LABELS).forEach(k => { fields[k] = findValue(matrix, ISO_LABELS[k]); });
    Object.keys(IOT_LABELS).forEach(k => { fields[k] = findValue(matrix, IOT_LABELS[k]); });

    const text = matrixText(matrix);
    fields.deviceId = parseDeviceId(text);
    fields.side = parseSide(text);
    fields.testDate = parseDate(text);

    let type = 'unknown';
    if (fields.rm1 != null || fields.load != null || fields.reps != null) type = 'isotonic';
    else if (fields.concentricPT != null || fields.ptBw != null) type = 'isokinetic';
    if (/等速/.test(text)) type = 'isokinetic';
    else if (/等张/.test(text)) type = 'isotonic';
    fields.type = type;
    return fields;
  }

  /* ---------- 对外 API ---------- */
  async function parseBytes(uint8) {
    const files = await unzip(uint8);
    const sheets = parseWorkbook(files);
    const first = sheets[0] || { name: 'Sheet1', rows: [] };
    return { sheets, fields: extractFields(first.rows), count: sheets.length };
  }

  async function parseFile(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('无效的文件对象');
    const buf = await file.arrayBuffer();
    const uint8 = new Uint8Array(buf);
    if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
      // 不是 PK zip 头，可能是旧版 .xls
      throw new Error('该文件不是 .xlsx 格式（旧版 .xls 暂不支持，请另存为 .xlsx 后上传）');
    }
    return parseBytes(uint8);
  }

  root.ExcelParser = { parseFile, parseBytes, unzip, parseWorkbook, extractFields, version: '1.0.0' };
})();
