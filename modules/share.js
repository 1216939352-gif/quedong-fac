/**
 * 鹊动FAC功能评估与干预系统 - 患者只读分享模块
 * 设计：纯静态、无后端。将患者综合评估报告与智能运动方案编码进 URL，
 * 生成可扫码的分享链接；患者扫码后免登录以只读方式查看。
 */
(function () {
  'use strict';

  /* ---------- 编解码（UTF-8 安全 base64） ---------- */
  function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64)));
  }

  /* ---------- 从当前工作上下文抽取可分享数据 ---------- */
  function snapshotShareData(opts) {
    opts = opts || {};
    // AI 解读专属快照：仅携带 AI 解读 + 方案 + 最小患者信息，链接更短、页面更聚焦
    if (opts.mode === 'ai') {
      var p0 = AppState.patient || {};
      return {
        v: 1,
        mode: 'ai',
        patient: { id: p0.id || '', name: p0.name || '', gender: p0.gender || '', age: p0.age || '', birth: p0.birth || '' },
        ai: AppState.ai || {}
      };
    }
    // 肌少症模块优先：外部已准备好快照
    if (window.__sarcSharePayload && window.__sarcSharePayload.module === 'sarcopenia') {
      var sp0 = window.__sarcSharePayload.rec || {};
      if (AppState.ai) sp0.ai = AppState.ai; // 若生成过 AI 解读也一并携带
      return { v: 1, module: 'sarcopenia', sarcopenia: sp0 };
    }
    // 递归剥离体积较大的 svg 装饰字段，避免链接过长超出二维码容量
    const strip = (o) => {
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
    // 生活方式问卷仅保留原始作答，派生评分在解码端重算，控制二维码容量
    const trimLife = (o) => {
      const out = {};
      for (const k in o) { if (k !== '_scored' && k !== '_advice') out[k] = o[k]; }
      return out;
    };
    return {
      v: 1,
      patient: AppState.patient || {},
      assessment: AppState.assessment || {},
      lifeSurvey: trimLife(AppState.lifeSurvey || {}),
      plan: strip(AppState.plan || {}),
      isokineticData: AppState.isokineticData || [],
      isotonicData: AppState.isotonicData || [],
      ai: AppState.ai || {} // 携带 AI 解读（含方案），供「分享携带 AI 结果」
    };
  }

  function buildShareURL(opts) {
    const payload = utf8ToB64(JSON.stringify(snapshotShareData(opts)));
    let base;
    if (location.protocol === 'file:' || location.origin === 'null') {
      // 本地 file:// 无法被手机扫码访问，仅作同设备复制用途
      base = location.href.split('?')[0];
    } else {
      base = location.origin + location.pathname;
    }
    return base + '?share=' + encodeURIComponent(payload);
  }

  function decodeShare(param) {
    try {
      const json = b64ToUtf8(decodeURIComponent(param));
      const data = JSON.parse(json);
      if (!data || typeof data !== 'object') return null;
      return data;
    } catch (e) {
      console.warn('分享链接解析失败', e);
      return null;
    }
  }

  function applyToAppState(data) {
    if (data.module === 'sarcopenia') {
      // 肌少症报告由解码端直接渲染，不写入主系统 AppState
      return;
    }
    AppState.patient = data.patient || {};
    AppState.assessment = data.assessment || {};
    const ls = data.lifeSurvey || {};
    // 解码端以原始作答重算派生评分，保证只读报告完整
    if (ls && !ls._scored && Calc && Calc.lifeSurveyScore) {
      try {
        const raw = {};
        Object.keys(ls).forEach(k => { if (k !== '_scored' && k !== '_advice') raw[k] = ls[k]; });
        if (Object.keys(raw).length) {
          const sc = Calc.lifeSurveyScore(raw);
          ls._scored = sc;
          ls._advice = Calc.lifeAdvice ? Calc.lifeAdvice(sc, AppState.assessment, AppState.patient, null) : {};
        }
      } catch (e) { /* 忽略，保留原始作答 */ }
    }
    AppState.lifeSurvey = ls;
    AppState.plan = data.plan || {};
    AppState.isokineticData = data.isokineticData || [];
    AppState.isotonicData = data.isotonicData || [];
    if (!AppState.config) AppState.config = {};
  }

  /* ---------- 患者端训练打卡（本地持久化） ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function checkinKey(pid, ds) { return 'qd:checkin:' + (pid || 'anon') + ':' + ds; }
  function loadCheckin(pid, ds) {
    try { const r = localStorage.getItem(checkinKey(pid, ds)); return new Set(r ? JSON.parse(r) : []); }
    catch (e) { return new Set(); }
  }
  function saveCheckin(pid, ds, set) {
    try { localStorage.setItem(checkinKey(pid, ds), JSON.stringify([...set])); } catch (e) {}
  }
  function getCheckinCount(pid, ds) { return loadCheckin(pid, ds).size; }

  // 与后端对齐的同源打卡同步（跨设备共享同一 share 链接即同步；无后端/离线时静默降级）
  function checkinApiBase() {
    try { return localStorage.getItem('sync_api_base') || ''; } catch (e) { return ''; }
  }
  async function syncCheckinFromServer(pid) {
    if (!pid || pid === 'anon') return;
    if (window.Sync && window.Sync.isOnline && window.Sync.isOnline() === false) return;
    try {
      const r = await fetch(checkinApiBase() + '/api/checkin?pid=' + encodeURIComponent(pid));
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !Array.isArray(j.items)) return;
      j.items.forEach(function (it) {
        if (!it || !it.date || !Array.isArray(it.items)) return;
        const merged = loadCheckin(pid, it.date); // 本地已有则并集，互补不丢
        it.items.forEach(function (k) { merged.add(k); });
        saveCheckin(pid, it.date, merged);
      });
    } catch (e) { /* 离线/无后端：忽略，保持本地记录 */ }
  }
  async function syncCheckinToServer(pid, ds, set) {
    if (!pid || pid === 'anon') return;
    if (window.Sync && window.Sync.isOnline && window.Sync.isOnline() === false) return;
    try {
      await fetch(checkinApiBase() + '/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: pid, date: ds, items: [...set] })
      });
    } catch (e) { /* 离线/无后端：忽略，本地已保存 */ }
  }

  function buildCheckinHistoryHTML(pid) {
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      if (getCheckinCount(pid, dateStr(d)) > 0) streak++;
      else if (i > 0) break; // 今天还没打卡时，从昨天往前算连续天数
    }
    const wdName = ['日', '一', '二', '三', '四', '五', '六'];
    let cells = '';
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const ds = dateStr(d);
      const c = getCheckinCount(pid, ds);
      cells += '<div class="ck-cell' + (i === 0 ? ' ck-today' : '') + (c > 0 ? ' ck-on' : '') + '">' +
        '<div class="ck-wd">' + wdName[d.getDay()] + '</div>' +
        '<div class="ck-dot"></div>' +
        '<div class="ck-cnt">' + (c > 0 ? c + '项' : '') + '</div>' +
        '</div>';
    }
    return '<div class="checkin-history" id="checkin-history">' +
      '<div class="ck-title">📅 我的训练打卡</div>' +
      '<div class="ck-streak">🔥 连续打卡 <b>' + streak + '</b> 天</div>' +
      '<div class="ck-week">' + cells + '</div>' +
      '<div class="ck-hint text-muted">点下方「今日任务」逐项打卡；联网时记录自动同步到其他设备（同一分享链接），仅本机缓存清空也不影响已同步数据。</div>' +
      '</div>';
  }

  /* ---------- 轻量 markdown 渲染（分享只读页自带，避免依赖 ai-reason.js 加载时机） ---------- */
  function mdLite(md) {
    if (!md) return '';
    var esc = (typeof U !== 'undefined' && U.esc) ? U.esc : function (s) {
      return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    };
    var lines = String(md).split(/\r?\n/);
    var html = '', listOpen = false, listTag = '';
    function closeList() { if (listOpen) { html += '</' + listTag + '>'; listOpen = false; } }
    lines.forEach(function (ln) {
      var t = ln.trim();
      if (!t) { closeList(); return; }
      var h = t.match(/^(#{1,4})\s+(.*)$/);
      if (h) { closeList(); var lvl = h[1].length; html += '<h' + lvl + ' class="ai-md-h">' + esc(h[2]) + '</h' + lvl + '>'; return; }
      var ul = t.match(/^[-*]\s+(.*)$/);
      if (ul) { if (!listOpen) { html += '<ul class="ai-md-ul">'; listOpen = true; listTag = 'ul'; } html += '<li>' + esc(ul[1]) + '</li>'; return; }
      var ol = t.match(/^\d+\.\s+(.*)$/);
      if (ol) { if (!listOpen) { html += '<ol class="ai-md-ol">'; listOpen = true; listTag = 'ol'; } html += '<li>' + esc(ol[1]) + '</li>'; return; }
      var safe = esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
      html += '<p class="ai-md-p">' + safe + '</p>';
    });
    closeList();
    return html;
  }
  function buildAiBlock(ai) {
    if (!ai || !ai.interpret || !ai.interpret.markdown) return '';
    var inter = ai.interpret;
    var html = '<div class="share-ai-block">' +
      '<div class="share-ai-head"><span class="ai-icon-wrap">' + (window.qooIcon ? window.qooIcon('sm') : '') + '</span> 鹊动小Qoo AI 解读' +
      (inter.provider ? ' <span class="share-ai-prov">· ' + U.esc(inter.provider) + '</span>' : '') + '</div>' +
      '<div class="ai-md share-ai-md">' + mdLite(inter.markdown) + '</div>';
    if (ai.plan && (ai.plan.raw || ai.plan.plan)) {
      html += '<div class="share-ai-plan-note">🏋️ 含鹊动小Qoo 推荐方案，详见下方完整方案。</div>';
    }
    html += '<div class="share-ai-foot">鹊动小Qoo 辅助生成，须经专业人员确认</div></div>';
    return html;
  }
  /* ---------- 移动端只读报告视图（免登录 · 仅报告 + 下载，无打卡/无返回登录） ---------- */
  function renderMobileReport(data) {
    const app = U.qs('#app');
    if (!app) return;
    const isAi = data && data.mode === 'ai';
    const isSarc = data && data.module === 'sarcopenia';
    const ai = data.ai || {};
    let reportHTML;
    if (isAi) {
      reportHTML = ''; // AI 模式仅展示解读，不渲染完整报告
    } else if (isSarc) {
      reportHTML = window.buildSarcReport ? window.buildSarcReport(data.sarcopenia) : '<div class="alert alert-warning">肌少症报告组件未就绪</div>';
    } else {
      reportHTML = window.buildReportDoc ? window.buildReportDoc() : '<div class="alert alert-warning">报告组件未就绪</div>';
    }
    const hasAi = !!(ai.interpret && ai.interpret.markdown) || !!(ai.plan && (ai.plan.raw || ai.plan.plan));
    let aiBlock = hasAi ? buildAiBlock(ai) : '';
    if (isAi && !aiBlock) aiBlock = '<div class="alert alert-warning">尚未生成 AI 解读，请先在医生端生成后再分享本页。</div>';
    app.innerHTML =
      '<div class="mreport-view">' +
        '<div class="mreport-topbar no-print">' +
          '<div class="mreport-brand"><span class="mreport-dot"></span>' + U.esc((window.CONST && CONST.SYSTEM_NAME) || '鹊动') + ' · 患者报告（只读）</div>' +
          '<div class="mreport-actions">' +
            '<button class="btn btn-primary btn-sm" id="mreport-save-img">🖼️ 保存图片</button>' +
            '<button class="btn btn-secondary btn-sm" id="mreport-print">📄 导出 PDF</button>' +
          '</div>' +
        '</div>' +
        '<div class="mreport-body" id="mreport-body">' + aiBlock + reportHTML + '</div>' +
        '<div class="mreport-foot no-print">本报告为只读分享，仅供您本人查看与留存；所有结论须经专业人员确认。</div>' +
      '</div>';
    U.qs('#mreport-print', app).onclick = function () { exportReportPDF(app); };
    U.qs('#mreport-save-img', app).onclick = function () { saveReportAsImage(app); };
  }

  /* 将报告区域渲染为多页 PDF 并触发下载（微信 WebView 中改为打开供手动保存） */
  function exportReportPDF(app) {
    const target = U.qs('#mreport-body', app);
    if (!target) return;
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF !== 'function' || typeof window.html2canvas !== 'function') {
      // 兜底：原生打印（桌面端可用；移动端部分 WebView 不支持 window.print）
      U.toast('正在调用系统打印…', 'info');
      setTimeout(function () { window.print(); }, 200);
      return;
    }
    U.toast('正在生成 PDF…', 'info');
    const { jsPDF } = window.jspdf;
    window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (canvas) {
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = canvas.height * imgW / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      const isWeChat = /micromessenger/i.test(navigator.userAgent || '');
      if (isWeChat) {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        U.toast('已打开 PDF，点右上角「…」可保存到手机', 'success');
      } else {
        pdf.save('患者报告.pdf');
        U.toast('PDF 已生成并开始下载', 'success');
      }
    }).catch(function (e) {
      console.warn('PDF 生成失败', e);
      U.toast('PDF 生成失败，请改用「保存图片」', 'error');
    });
  }

  /* 将报告区域渲染为 PNG 图片并触发下载（html2canvas 缺失时回落复制链接） */
  function saveReportAsImage(app) {
    const target = U.qs('#mreport-body', app);
    if (!target) return;
    if (typeof window.html2canvas !== 'function') {
      // 回落：复制当前链接，引导用户在浏览器中截图/保存
      const url = location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(
            function () { U.toast('已复制链接，请在浏览器中打开后截图保存', 'success'); },
            function () { U.toast('当前环境不支持保存图片，请使用浏览器截图', 'warning'); }
          );
        } else {
          U.toast('当前环境不支持保存图片，请使用浏览器截图', 'warning');
        }
      } catch (e) { U.toast('当前环境不支持保存图片，请使用浏览器截图', 'warning'); }
      return;
    }
    U.toast('正在生成图片…', 'info');
    window.html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }).then(function (canvas) {
      const dataUrl = canvas.toDataURL('image/png');
      const isWeChat = /micromessenger/i.test(navigator.userAgent || '');
      if (isWeChat) {
        // 微信 WebView 会吞掉 <a download>，改为打开图片供长按保存到相册
        window.open(dataUrl, '_blank');
        U.toast('已打开图片，长按可保存到相册', 'success');
        return;
      }
      const link = document.createElement('a');
      link.download = '患者报告.png';
      link.href = dataUrl;
      document.body.appendChild(link); link.click(); link.remove();
      U.toast('图片已生成，可保存至相册', 'success');
    }).catch(function (e) {
      console.warn('报告转图片失败', e);
      U.toast('图片生成失败，请使用浏览器截图保存', 'error');
    });
  }

  /* 由 app.js 的 init() 在最早阶段调用：若存在 ?share= 则渲染只读视图并拦截登录 */
  function maybeRenderShare() {
    const params = new URLSearchParams(location.search);
    const p = params.get('share');
    if (!p) return false;
    const app = U.qs('#app');
    const data = decodeShare(p);
    if (!data) {
      if (app) app.innerHTML = '<div class="mreport-view"><div class="mreport-body"><div class="alert alert-danger">分享链接已损坏或已失效，请向您的主治医师重新获取。</div></div></div>';
      return true;
    }
    applyToAppState(data);
    renderMobileReport(data);
    return true;
  }

  /* ---------- 服务端短链令牌（方案 B）：医生端创建、患者端按路径读取 ---------- */
  // 创建分享令牌：成功返回 { token, url }；无后端/未登录/失败返回 null（调用方回落 base64）
  async function createShareToken(opts) {
    opts = opts || {};
    if (!window.QDAuth || !window.QDAuth.authHeaders) return null;
    const headers = window.QDAuth.authHeaders();
    if (!headers.Authorization) return null; // 未登录（本地离线）直接用 base64
    const data = snapshotShareData(opts);
    const title = opts.title
      || (data.patient && data.patient.name ? data.patient.name + ' 报告' : '')
      || (data.module === 'sarcopenia' ? '肌少症报告' : '患者报告');
    try {
      const r = await fetch(checkinApiBase() + '/api/share', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ data: data, title: title })
      });
      if (!r.ok) return null; // 401/网络/无此接口 → 回落
      const j = await r.json();
      if (j && j.ok && j.url) return { token: j.token, url: j.url };
      return null;
    } catch (e) { return null; }
  }

  // 患者端：若当前路径为 /s/<token> 则拉取并渲染只读报告（返回 true 表示已接管页面）
  async function maybeRenderByPath() {
    const m = location.pathname.match(/\/s\/([A-Za-z0-9_-]{8,})/);
    if (!m) return false;
    const token = m[1];
    const app = U.qs('#app');
    if (app) app.innerHTML = '<div class="mreport-view"><div class="mreport-body"><div class="text-muted" style="padding:48px 16px;text-align:center;">正在加载您的分享报告…</div></div></div>';
    try {
      const r = await fetch(checkinApiBase() + '/api/share/' + encodeURIComponent(token));
      let msg;
      if (r.status === 404) msg = '分享链接不存在或已失效，请向您的主治医师重新获取。';
      else if (r.status === 410) msg = '分享链接已过期，请向您的主治医师重新获取。';
      else if (!r.ok) msg = '分享报告加载失败，请稍后重试或联系您的主治医师。';
      else {
        const j = await r.json();
        if (j && j.ok && j.data) {
          applyToAppState(j.data);
          renderMobileReport(j.data);
          return true;
        }
        msg = '分享数据损坏，请向您的主治医师重新获取。';
      }
      if (app) app.innerHTML = '<div class="mreport-view"><div class="mreport-body"><div class="alert alert-danger">' + U.esc(msg) + '</div></div></div>';
      return true;
    } catch (e) {
      if (app) app.innerHTML = '<div class="mreport-view"><div class="mreport-body"><div class="alert alert-danger">网络异常，无法加载分享报告，请检查网络后重试。</div></div></div>';
      return true;
    }
  }

  /* ---------- 医生端：生成分享二维码弹窗 ---------- */
  async function openQRModal(opts) {
    opts = opts || {};
    var isAi = opts.mode === 'ai';
    if (typeof window.qrcode !== 'function') {
      U.toast('二维码组件未加载，无法生成', 'error');
      return;
    }
    // 方案 B：优先走服务端短链令牌（链接短、可撤销、PHI 不出服务端）；失败回落本地 base64
    let created = null;
    try { created = await createShareToken(opts); } catch (e) { created = null; }
    const usingShort = !!(created && created.url);
    const url = usingShort ? created.url : (isAi ? buildShareURL({ mode: 'ai' }) : buildShareURL());
    let qrImg = '';
    let qrErr = '';
    try {
      const qr = window.qrcode(0, 'L'); // 0 = 自动选择最小版本
      qr.addData(url);
      qr.make();
      qrImg = qr.createDataURL(6, 10);
    } catch (e) {
      qrErr = U.errMsg(e) || '生成失败';
    }

    const introText = (usingShort ? '已生成<b>服务端短链接</b>（可撤销、链接短更易扫描）。' : '已使用本地短链分享（未连接服务端，链接较长）。')
      + (isAi
      ? '患者/家属使用微信或相机扫码即可查看本次 AI 解读（含推荐方案）。建议通过<b>部署后的 http(s) 地址</b>分享。'
      : '患者使用微信/相机扫码即可在手机上查看本报告（含智能运动方案）。建议通过<b>部署后的 http(s) 地址</b>分享。');
    const body = `
      <p class="text-muted" style="font-size:13px;line-height:1.7;">${introText}</p>
      <div class="qr-box">
        ${qrImg ? `<img src="${qrImg}" alt="QR" class="qr-img"/>` : `<div class="alert alert-warning" style="margin:0;">二维码生成失败（${U.esc(qrErr)}），请直接复制下方链接发送。</div>`}
      </div>
      <div class="form-group">
        <label>分享链接（可复制发送给患者）</label>
        <textarea class="form-control" id="share-url" rows="3" readonly>${U.esc(url)}</textarea>
      </div>
      <p class="text-muted" id="share-tip" style="font-size:12px;margin:6px 0 0;"></p>
    `;

    const { overlay, close } = U.modal({
      title: isAi ? '📲 生成 AI 解读分享页' : '📲 生成患者分享二维码',
      body,
      width: '460px',
      footer: `
        <button class="btn btn-secondary" id="share-copy">复制链接</button>
        ${qrImg ? '<button class="btn btn-primary" id="share-dl">下载二维码</button>' : ''}
        ${usingShort ? '<button class="btn btn-danger" id="share-revoke">撤销此链接</button>' : ''}
      `,
      onMount(ov) {
        const urlArea = ov.querySelector('#share-url');
        ov.querySelector('#share-copy').onclick = async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(url);
            } else {
              urlArea.select(); document.execCommand('copy');
            }
            U.toast('链接已复制', 'success');
          } catch (e) { urlArea.select(); U.toast('请手动复制选中文本', 'warning'); }
        };
        const dl = ov.querySelector('#share-dl');
        if (dl) dl.onclick = () => {
          const a = document.createElement('a');
          a.href = qrImg; a.download = '患者报告二维码.png';
          document.body.appendChild(a); a.click(); a.remove();
          U.toast('二维码已下载', 'success');
        };
        const rev = ov.querySelector('#share-revoke');
        if (rev) rev.onclick = async () => {
          if (!window.confirm('撤销后此分享链接立即失效，患者将无法再访问。确定撤销？')) return;
          try {
            const rr = await fetch(checkinApiBase() + '/api/share/' + encodeURIComponent(created.token), {
              method: 'DELETE', headers: (window.QDAuth ? window.QDAuth.authHeaders() : {})
            });
            if (rr.ok) { U.toast('分享链接已撤销', 'success'); if (typeof close === 'function') close(); }
            else U.toast('撤销失败，请稍后重试', 'error');
          } catch (e) { U.toast('撤销失败，请稍后重试', 'error'); }
        };
        const tip = ov.querySelector('#share-tip');
        if (tip) {
          if (url.length > 1800) tip.textContent = '提示：报告内容较多，链接较长，建议直接发送链接（二维码容量有限）。';
          else if (location.protocol === 'file:') tip.textContent = '提示：当前为本地文件，二维码在手机上无法打开，请部署后使用。';
        }
      }
    });
    void overlay; void close;
  }

  window.Share = {
    maybeRenderShare,
    maybeRenderByPath,
    openQRModal,
    openAIQRModal: function () { openQRModal({ mode: 'ai' }); },
    buildShareURL,
    decodeShare,
    createShareToken
  };
})();
