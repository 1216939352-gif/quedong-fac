/**
 * 鹊动FAC功能评估与干预系统 — 数据同步层路由（Phase 2）
 * 鉴权：server.js 已用 app.use('/api/sync', authMiddleware) 统一守卫，所有同步接口须持合法令牌。
 * 操作方身份 getActor 优先取令牌中的 uid（owner_id 归属），deviceId 仅作兜底。
 *
 * 端点：
 *   GET  /api/sync/pull?since=ISO  拉取自 since 以来的全部变更（含软删）
 *   POST /api/sync/push            推送本地变更批（乐观锁版本校验，冲突返回 conflict）
 *   POST /api/sync/lock            获取编辑锁（checkout lock）
 *   DELETE /api/sync/lock          释放编辑锁
 *   GET  /api/sync/lock?c=&id=     查询当前锁状态
 */
'use strict';

const DEFAULT_LOCK_TTL = 30 * 60 * 1000; // 30 分钟

function isoNow() { return new Date().toISOString(); }

// 操作方身份：优先 token 中的 uid，其次请求体里的 deviceId，最后 anon
function getActor(req, body, verifyToken) {
  const auth = (req.headers['authorization'] || '').slice(7);
  const p = (typeof verifyToken === 'function') ? verifyToken(auth) : null;
  if (p && p.uid) return p.uid;
  if (body && body.deviceId) return String(body.deviceId);
  return 'anon';
}

module.exports = function mountSyncRoutes(app, db, verifyToken) {

  // ───────── 拉取变更 ─────────
  app.get('/api/sync/pull', (req, res) => {
    try {
      const since = (req.query.since && String(req.query.since).length >= 8)
        ? String(req.query.since) : '1970-01-01T00:00:00.000Z';
      // 按用户隔离：管理员可见全部；普通用户仅见自己 owner_id 的记录，以及兼容旧数据的 owner_id IS NULL（共享）。
      const uid = req.user ? req.user.uid : null;
      const isAdmin = !!(req.user && req.user.role === 'admin');
      const rows = db.prepare(
        `SELECT collection, id, data_json, version, updated_at, deleted, owner_id
         FROM sync_items WHERE updated_at > ? AND (? = 1 OR owner_id = ? OR owner_id IS NULL) ORDER BY updated_at ASC`
      ).all(since, isAdmin ? 1 : 0, uid);
      const items = rows.map(r => ({
        collection: r.collection,
        id: r.id,
        data: safeParse(r.data_json),
        version: r.version,
        updatedAt: r.updated_at,
        deleted: !!r.deleted,
        owner_id: r.owner_id || null
      }));
      res.json({ ok: true, serverNow: isoNow(), since, count: items.length, items });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 推送变更 ─────────
  app.post('/api/sync/push', (req, res) => {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: '缺少 items' });
    const actor = getActor(req, body, verifyToken);
    const isAdmin = !!(req.user && req.user.role === 'admin');
    const results = [];
    const now = isoNow();
    const stmtGet = db.prepare('SELECT version, owner_id FROM sync_items WHERE collection=? AND id=?');
    const stmtUpsert = db.prepare(
      `INSERT INTO sync_items (collection, id, data_json, version, updated_at, deleted, owner_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET
         data_json=excluded.data_json, version=excluded.version,
         updated_at=excluded.updated_at, deleted=excluded.deleted, owner_id=excluded.owner_id`
    );
    try {
      db.exec('BEGIN');
      for (const it of items) {
        const coll = String(it.collection || '');
        const id = String(it.id != null ? it.id : '');
        if (!coll || !id) { results.push({ collection: coll, id, status: 'skip', reason: 'missing key' }); continue; }
        const base = (typeof it.baseVersion === 'number' && it.baseVersion > 0) ? it.baseVersion : 0;
        const existing = stmtGet.get(coll, id);
        if (existing && existing.version > base) {
          // 乐观锁冲突：服务端版本已超过客户端基线版本
          results.push({ collection: coll, id, status: 'conflict', currentVersion: existing.version });
          continue;
        }
        // 按用户隔离：非属主且非管理员不得改写他人记录（pull 已隐藏，此处为兜底防御）
        if (existing && existing.owner_id && existing.owner_id !== actor && !isAdmin) {
          results.push({ collection: coll, id, status: 'forbidden', reason: 'not owner' });
          continue;
        }
        const newVersion = (existing ? existing.version : 0) + 1;
        stmtUpsert.run(coll, id, JSON.stringify(it.data ?? null), newVersion, it.updatedAt || now, it.deleted ? 1 : 0, actor);
        results.push({ collection: coll, id, status: 'ok', version: newVersion });
      }
      db.exec('COMMIT');
      res.json({ ok: true, serverNow: now, count: results.length, results });
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 获取编辑锁 ─────────
  app.post('/api/sync/lock', (req, res) => {
    const body = req.body || {};
    const coll = String(body.collection || '');
    const id = String(body.id != null ? body.id : '');
    if (!coll || !id) return res.status(400).json({ error: '缺少 collection/id' });
    const actor = getActor(req, body, verifyToken);
    const ttl = (typeof body.ttlMinutes === 'number' && body.ttlMinutes > 0) ? body.ttlMinutes * 60000 : DEFAULT_LOCK_TTL;
    const now = new Date();
    const nowISO = now.toISOString();
    const expiresISO = new Date(now.getTime() + ttl).toISOString();
    try {
      const existing = db.prepare('SELECT locked_by, expires_at FROM sync_locks WHERE collection=? AND id=?').get(coll, id);
      if (existing && existing.expires_at > nowISO && existing.locked_by !== actor) {
        return res.status(409).json({ status: 'locked', locked_by: existing.locked_by, expires_at: existing.expires_at });
      }
      db.prepare(
        `INSERT INTO sync_locks (collection, id, locked_by, locked_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, id) DO UPDATE SET locked_by=excluded.locked_by, locked_at=excluded.locked_at, expires_at=excluded.expires_at`
      ).run(coll, id, actor, nowISO, expiresISO);
      res.json({ status: 'ok', locked_by: actor, expires_at: expiresISO });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 释放编辑锁 ─────────
  app.delete('/api/sync/lock', (req, res) => {
    const body = req.body || {};
    const coll = String(body.collection || '');
    const id = String(body.id != null ? body.id : '');
    if (!coll || !id) return res.status(400).json({ error: '缺少 collection/id' });
    const actor = getActor(req, body, verifyToken);
    try {
      const existing = db.prepare('SELECT locked_by FROM sync_locks WHERE collection=? AND id=?').get(coll, id);
      if (existing && existing.locked_by !== actor) {
        return res.status(403).json({ error: '锁归属他人，无法释放', locked_by: existing.locked_by });
      }
      db.prepare('DELETE FROM sync_locks WHERE collection=? AND id=?').run(coll, id);
      res.json({ status: 'ok' });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  // ───────── 查询锁状态 ─────────
  app.get('/api/sync/lock', (req, res) => {
    const coll = String(req.query.c || req.query.collection || '');
    const id = String(req.query.id || '');
    if (!coll || !id) return res.status(400).json({ error: '缺少 collection/id' });
    try {
      const now = isoNow();
      const row = db.prepare('SELECT locked_by, expires_at FROM sync_locks WHERE collection=? AND id=?').get(coll, id);
      if (row && row.expires_at > now) {
        res.json({ locked: true, locked_by: row.locked_by, expires_at: row.expires_at });
      } else {
        if (row) db.prepare('DELETE FROM sync_locks WHERE collection=? AND id=?').run(coll, id); // 清理过期锁
        res.json({ locked: false });
      }
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  });
};

function safeParse(s) {
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
}
