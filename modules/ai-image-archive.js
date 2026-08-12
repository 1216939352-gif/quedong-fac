/* ==================================================================
 * AI 配图档案 · 把对话框/批处理生成的训练动作示意图存入患者媒体库
 * ------------------------------------------------------------------
 * 复用既有 PlanMediaView 媒体体系（IndexedDB quedong_wm_media / store plan_media）：
 *   - 存入：DB.savePlanMedia(key, null, blob)，key 形如 "aiimg:<患者ID>:<序列>"
 *   - 展示：PlanMediaView.thumb({image:'__local__'}, 'ai', key, h) 渲染占位，hydrate 补图
 *   - 查看：点击占位的全局委托会调用 PlanMediaView.open 从 DB 读取 Blob
 * 说明：lib 传 'ai'（非 strength/sarc），storeId 会原样返回 id，命中我们存的 key。
 * ================================================================== */
window.AIImgArchive = (function () {
  const KEY_PREFIX = 'aiimg:';
  const META_KEY = 'aiimg_meta'; // localStorage: { [key]: caption }

  function currentPid() {
    const as = window.AppState;
    return (as && (as.currentPatientId || (as.patient && as.patient.id))) || null;
  }
  function pidKey(pid, seq) { return KEY_PREFIX + pid + ':' + seq; }
  function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); } catch (e) { return {}; } }
  function setMeta(map) { try { localStorage.setItem(META_KEY, JSON.stringify(map)); } catch (e) {} }

  function dataUrlToBlob(dataUrl) {
    try {
      const idx = dataUrl.indexOf(',');
      const head = dataUrl.slice(0, idx);
      const b64 = dataUrl.slice(idx + 1);
      const mime = (head.match(/data:([^;]+);base64/) || [, 'image/png'])[1];
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  async function save(pid, dataUrl, caption) {
    if (!pid) return null;
    const key = pidKey(pid, Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    const blob = dataUrlToBlob(dataUrl);
    if (!blob) return null;
    await DB.savePlanMedia(key, null, blob);
    const m = getMeta(); m[key] = caption || 'AI 配图'; setMeta(m);
    window.__pmvMetaStore = window.__pmvMetaStore || {};
    window.__pmvMetaStore['ai|' + key] = '<div class="ai-img-cap">' + U.esc(caption || 'AI 配图') + '</div>';
    return key;
  }

  async function list(pid) {
    if (!pid) return [];
    const all = await DB.getAllPlanMedia();
    const meta = getMeta();
    return all
      .filter(r => r && r.id && r.id.indexOf(KEY_PREFIX + pid + ':') === 0 && r.image)
      .map(r => ({ key: r.id, caption: meta[r.id] || 'AI 配图' }));
  }

  async function deleteImage(key) {
    await DB.deletePlanMedia(key);
    const m = getMeta(); delete m[key]; setMeta(m);
    if (window.__pmvMetaStore) delete window.__pmvMetaStore['ai|' + key];
  }

  async function renderGallery(pid, container) {
    if (!container) return;
    const countEl = document.getElementById('aiimg-count');
    if (countEl) countEl.textContent = '读取中…';
    container.innerHTML = '<div class="text-muted" style="font-size:13px;">读取中…</div>';
    const items = await list(pid);
    window.__pmvMetaStore = window.__pmvMetaStore || {};

    if (!pid) {
      container.innerHTML = '<div class="text-muted" style="font-size:13px;">当前无患者档案，无法读取 AI 配图。请先登记或选择患者。</div>';
      if (countEl) countEl.textContent = '0 张';
      return;
    }
    if (!items.length) {
      container.innerHTML = '<div class="text-muted" style="font-size:13px;">该患者暂无 AI 配图。可在小Qoo 对话中用 🖼️ 生成并点「存入该患者档案」，或点上方「🎨 一键为方案内动作配图」。</div>';
      if (countEl) countEl.textContent = '0 张';
      return;
    }

    const html = '<div class="ai-img-grid">' + items.map(function (it) {
      const cap = it.caption || 'AI 配图';
      window.__pmvMetaStore['ai|' + it.key] = '<div class="ai-img-cap">' + U.esc(cap) + '</div>';
      const thumb = window.PlanMediaView.thumb({ name: cap, image: '__local__' }, 'ai', it.key, 150);
      const shown = cap.length > 18 ? cap.slice(0, 18) + '…' : cap;
      return '<div class="ai-img-cell">' +
        '<div class="ai-img-thumb-wrap">' + thumb + '</div>' +
        '<button class="ai-img-del" data-aiimg-del="' + U.esc(it.key) + '" title="删除该配图">✕</button>' +
        '<div class="ai-img-cap2" title="' + U.esc(cap) + '">' + U.esc(shown) + '</div>' +
        '</div>';
    }).join('') + '</div>';
    container.innerHTML = html;
    window.PlanMediaView.hydrate(container);

    if (countEl) countEl.textContent = items.length + ' 张';

    // 删除按钮（容器级委托，仅绑定一次；删除按钮与 pmv-thumb 平级，不会误触发查看）
    if (!container._aiImgBound) {
      container.addEventListener('click', function (e) {
        const del = e.target.closest('[data-aiimg-del]');
        if (del) {
          e.preventDefault(); e.stopPropagation();
          const key = del.getAttribute('data-aiimg-del');
          del.disabled = true; del.textContent = '…';
          deleteImage(key).then(function () { renderGallery(pid, container); });
        }
      });
      container._aiImgBound = true;
    }
  }

  return { currentPid, save, list, renderGallery, deleteImage, pidKey };
})();
