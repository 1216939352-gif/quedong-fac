/**
 * 鹊动FAC功能评估与干预系统 — 媒体同步服务（Phase 3）
 *
 * 媒体（方案动作视频/图片）体积大，不适合塞进 sync_items 的 data_json（有 JSON 体积限制），
 * 因此采用「磁盘文件 + 元数据进 sync_items」的分体方案：
 *   - 真实 Blob 文件落盘到 MEDIA_DIR，按 base64url(id) + '_' + slot + '.' + ext 命名
 *     （id 含 ':' 等 Windows 非法字符，base64url 编码后文件名全安全）
 *   - 元数据（哪些 slot 有、ext、size）写进 sync_items(collection='media', id=媒体命名空间键)
 *     → 自动进入 Phase 2 的 pull 水位线，客户端据此下载缺失媒体
 *
 * 注意：本路由与 /api/sync/* 一致，已由 server.js 经 app.use('/api/media', authMiddleware) 统一守卫，须持合法 Bearer 令牌（前端 sync.js 自动携带；无令牌返回 401）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const MIME = {
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml'
};
const WHITELIST = {
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
};
const MAX_FILE = 200 * 1024 * 1024; // 200MB 上限，防滥用

function encId(rawId) { return Buffer.from(String(rawId), 'utf8').toString('base64url'); }

function slotFiles(MEDIA_DIR, enc, slot) {
  try {
    return fs.readdirSync(MEDIA_DIR).filter(f => f.startsWith(enc + '_' + slot + '.'));
  } catch { return []; }
}
function removeSlot(MEDIA_DIR, enc, slot) {
  const found = slotFiles(MEDIA_DIR, enc, slot);
  found.forEach(f => {
    try { fs.unlinkSync(path.join(MEDIA_DIR, f)); }
    catch (e) { console.error('[removeSlot] unlink FAIL', f, e.message); }
  });
}

function getMediaRow(db, rawId) {
  const row = db.prepare('SELECT * FROM sync_items WHERE collection=? AND id=?').get('media', rawId);
  if (!row) return null;
  let data = {};
  try { data = JSON.parse(row.data_json || '{}'); } catch (e) {}
  return { version: row.version, deleted: row.deleted, data };
}
function upsertMediaMeta(db, rawId, mutate) {
  const existing = getMediaRow(db, rawId);
  const data = existing ? Object.assign({ video: null, image: null }, existing.data) : { video: null, image: null };
  mutate(data);
  const version = (existing ? existing.version : 0) + 1;
  const updated_at = new Date().toISOString();
  db.prepare(`INSERT INTO sync_items (collection,id,data_json,version,updated_at,deleted,owner_id)
    VALUES ('media',?,?,?,?,0,NULL)
    ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json, version=excluded.version, updated_at=excluded.updated_at, deleted=0`)
    .run(rawId, JSON.stringify(data), version, updated_at);
  return { version, updated_at, data };
}
function touchDeleteMedia(db, rawId) {
  const existing = getMediaRow(db, rawId);
  const version = (existing ? existing.version : 0) + 1;
  db.prepare(`INSERT INTO sync_items (collection,id,data_json,version,updated_at,deleted,owner_id)
    VALUES ('media',?,?,?,?,1,NULL)
    ON CONFLICT(collection,id) DO UPDATE SET version=excluded.version, updated_at=excluded.updated_at, deleted=1`)
    .run(rawId, existing ? JSON.stringify(existing.data || {}) : '{}', version, new Date().toISOString());
}

module.exports = function (app, db, MEDIA_DIR) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, MEDIA_DIR),
      filename: (req, file, cb) => cb(null, 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.part')
    }),
    limits: { fileSize: MAX_FILE }
  });

  // ───────── 上传单个 slot（video | image）─────────
  app.post('/api/media/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: '上传解析失败: ' + err.message });
      try {
        const { id, slot, ext } = req.body || {};
        if (!id || (slot !== 'video' && slot !== 'image')) return res.status(400).json({ error: '缺少 id 或 slot 非法' });
        const extL = String(ext || '').toLowerCase();
        if (!/^[a-z0-9]+$/.test(extL) || !WHITELIST[slot].includes(extL)) return res.status(400).json({ error: '文件扩展名不在白名单' });
        if (!req.file) return res.status(400).json({ error: '缺少文件内容' });

        const enc = encId(id);
        removeSlot(MEDIA_DIR, enc, slot); // 清掉同 slot 旧扩展名文件
        const finalPath = path.join(MEDIA_DIR, enc + '_' + slot + '.' + extL);
        fs.renameSync(req.file.path, finalPath);
        const meta = upsertMediaMeta(db, id, (data) => { data[slot] = { ext: extL, size: fs.statSync(finalPath).size }; });
        res.json({ ok: true, version: meta.version, updatedAt: meta.updatedAt });
      } catch (e) {
        if (req.file && req.file.path) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
        res.status(500).json({ error: String(e.message || e) });
      }
    });
  });

  // ───────── 下载单个 slot ─────────
  app.get('/api/media/:id/:slot', (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const slot = req.params.slot;
      if (slot !== 'video' && slot !== 'image') return res.status(400).json({ error: 'slot 非法' });
      const enc = encId(id);
      const files = slotFiles(MEDIA_DIR, enc, slot);
      if (!files.length) return res.status(404).json({ error: '媒体不存在' });
      const fp = path.join(MEDIA_DIR, files[0]);
      const ext = files[0].split('.').pop().toLowerCase();
      res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      fs.createReadStream(fp).pipe(res);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 删除单个 slot ─────────
  app.delete('/api/media/:id/:slot', (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const slot = req.params.slot;
      if (slot !== 'video' && slot !== 'image') return res.status(400).json({ error: 'slot 非法' });
      const enc = encId(id);
      removeSlot(MEDIA_DIR, enc, slot);
      const meta = upsertMediaMeta(db, id, (data) => { data[slot] = null; });
      res.json({ ok: true, version: meta.version });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 删除整个媒体（双 slot）─────────
  app.delete('/api/media/:id', (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id);
      const enc = encId(id);
      removeSlot(MEDIA_DIR, enc, 'video');
      removeSlot(MEDIA_DIR, enc, 'image');
      touchDeleteMedia(db, id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
};
