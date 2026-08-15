/**
 * 鹊动FAC功能评估与干预系统 — 局域网后端骨架
 * 纯内网 · Windows 单主机 · Node + Express + SQLite
 *
 * 职责（Phase 1）：
 *   - 静态托管前端 SPA（默认 ../_dl3）
 *   - SQLite 单文件库（data/app.db），含 users/patients/assessments/reports/media_meta/errors 表
 *   - /health 健康检查
 *   - /api/err-report 前端报错接收 + 管理员查看（统一上报 SDK 的后端落点）
 *   - /api/login + /api/me 最小鉴权（HMAC 令牌，无外部依赖）
 *   - /api/admin/backup 触发备份
 *
 * 运行：node server.js  （或经 nssm 注册为 Windows 服务）
 */
'use strict';

// 加载项目根目录 .env（仅在变量未定义时补充，不覆盖系统/服务已设的环境变量）
// 使 AI_CLOUD_* 等配置在任意启动方式（手动 / 计划任务 / nssm 服务）下都生效
(function loadProjectEnv() {
  try {
    const fs = require('fs');
    const envPath = require('path').join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) return;
    const txt = fs.readFileSync(envPath, 'utf8');
    txt.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      const i = line.indexOf('=');
      if (i < 0) return;
      const k = line.slice(0, i);
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
    });
  } catch (e) { /* .env 加载失败不影响启动 */ }
})();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const logger = require('./lib/logger');

// ───────────────────────── 配置 ─────────────────────────
const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = __dirname;
const STATIC_DIR = process.env.STATIC_DIR || path.join(ROOT, '..', '_dl3');
// 优先使用 Railway 持久卷（挂载后自动注入 RAILWAY_VOLUME_MOUNT_PATH），否则退回本地 ./data
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR)
  : (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH) : path.join(ROOT, 'data'));
const MEDIA_DIR = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : path.join(DATA_DIR, 'media');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(DATA_DIR, 'backups');
[DATA_DIR, MEDIA_DIR, BACKUP_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// 持久卷迁移（仅 Railway 挂载卷时生效，且为“拷贝非移动”，失败不影响启动）
// 场景：挂载卷后首次启动，若卷内无库但旧 ./data 有库，则把旧数据拷入卷，避免重部署清空历史。
(function migrateToVolumeIfNeeded() {
  const vmp = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!vmp) return;
  const volData = path.resolve(vmp);
  const legData = path.join(ROOT, 'data');
  const volDb = path.join(volData, 'app.db');
  const legDb = path.join(legData, 'app.db');
  if (fs.existsSync(legDb) && !fs.existsSync(volDb)) {
    try {
      fs.mkdirSync(volData, { recursive: true });
      const { copyDir } = require('./lib-backup.js');
      copyDir(legData, volData);
      logger.info('[volume-migrate] 已将旧数据迁移至持久卷: ' + volData);
    } catch (e) { logger.error('[volume-migrate] 迁移失败: ' + (e && e.stack ? e.stack : e)); }
  }
})();

// 持久化签名密钥（首次运行生成，重启后保持一致，令牌才不会失效）
const SECRET_FILE = path.join(DATA_DIR, '.secret');
let SECRET = process.env.SECRET;
if (!SECRET) {
  if (fs.existsSync(SECRET_FILE)) SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  else { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 }); }
}

// ───────────────────────── 数据库 ─────────────────────────
// 使用 Node 内置 node:sqlite（零原生依赖，无需编译/预编译二进制）
const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
// ───────────────────────── 数据库迁移机制 (L1-8) ─────────────────────────
// 所有建表/改表逻辑注册为幂等迁移，启动时按序执行并记录到 schema_migrations，
// 避免重复执行、保证多机部署的 schema 一致与可回看。
const MIGRATIONS = [];
function registerMigration(id, up) {
  if (typeof id !== 'string' || !id) throw new Error('迁移 id 非法');
  if (typeof up !== 'function') throw new Error('迁移 ' + id + ' 缺少 up 函数');
  MIGRATIONS.push({ id, up });
}

// v1: 初始表结构（全部使用 IF NOT EXISTS，已存在的库不会重复创建）
registerMigration('v1_init_schema', function (db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'doctor',
    name TEXT,
    expires_at TEXT,
    must_change_pwd INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    owner_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    type TEXT,
    data_json TEXT NOT NULL,
    owner_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    locked_by TEXT,
    locked_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    assessment_id TEXT,
    type TEXT,
    data_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS media_meta (
    id TEXT PRIMARY KEY,
    kind TEXT,
    ref_id TEXT,
    filename TEXT,
    stored_path TEXT,
    mime TEXT,
    size INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT DEFAULT (datetime('now')),
    level TEXT,
    msg TEXT,
    url TEXT,
    line INTEGER,
    col INTEGER,
    stack TEXT,
    user_agent TEXT,
    user_id TEXT,
    meta_json TEXT
  );
  -- Phase 2 数据同步层：通用同步条目（一个表承载所有集合，按 collection 区分）
  -- 任一集合的任一记录都存为一行；deleted=1 表示软删（客户端据此本地删除）
  CREATE TABLE IF NOT EXISTS sync_items (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    owner_id TEXT,
    PRIMARY KEY (collection, id)
  );
  -- 编辑锁（checkout lock）：谁在编辑某记录就占用，他人只读
  CREATE TABLE IF NOT EXISTS sync_locks (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    locked_by TEXT NOT NULL,
    locked_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
  -- 患者端训练打卡（轻量、按患者维度聚合；同源开放，跨设备共享同一 share 链接即同步）
  CREATE TABLE IF NOT EXISTS checkins (
    pid TEXT NOT NULL,
    date TEXT NOT NULL,
    items TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (pid, date)
  );
`);
});

// v2: 兼容旧库——补齐 must_change_pwd 字段（L0-3）；已存在则静默跳过
registerMigration('v2_users_must_change_pwd', function (db) {
  try {
    db.exec('ALTER TABLE users ADD COLUMN must_change_pwd INTEGER NOT NULL DEFAULT 0');
  } catch (e) { /* 字段已存在则忽略 */ }
});

// v3: 患者扫码查看报告——服务端短链令牌（替代把整份报告 base64 塞进 URL 的方案）
// token 不可枚举；data_json 落库，URL 仅携带 token；支持公开读取 + 归属 + 撤销 + 过期
registerMigration('v3_share_tokens', function (db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS share_tokens (
    token TEXT PRIMARY KEY,
    owner_id TEXT,
    title TEXT,
    data_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    views INTEGER NOT NULL DEFAULT 0
  );
`);
});

// v4: 训练打卡升级——增加 scheme 维度（weight / sarcopenia），使两套台账的执行记录可分维度聚合
registerMigration('v4_checkins_scheme', function (db) {
  try {
    db.exec('ALTER TABLE checkins ADD COLUMN scheme TEXT');
  } catch (e) { /* 字段已存在则忽略 */ }
});

// 执行全部未应用的迁移
function runMigrations(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
  const applied = new Set(
    database.prepare('SELECT id FROM schema_migrations').all().map(function (r) { return r.id; })
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      m.up(database);
      database.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)').run(m.id);
      logger.info('[migrate] 已应用迁移: ' + m.id);
    } catch (e) {
      logger.error('[migrate] 迁移失败: ' + m.id + ' - ' + (e && e.message ? e.message : e));
      throw e;
    }
  }
}
runMigrations(db);

// 首次启动播种默认管理员（务必上线前修改密码）
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (userCount === 0) {
  const { hash, salt } = hashPassword('admin123');
  db.prepare(`INSERT INTO users (id, username, password_hash, salt, role, name, must_change_pwd)
    VALUES (?, ?, ?, ?, 'admin', '系统管理员', 1)`).run('u_admin', 'admin', hash, salt);
  logger.info('[init] 已创建默认管理员账号  admin / admin123  （请尽快修改密码）');
}

// L0-3 安全自检：若仍有账号使用初始弱口令 admin123，启动即告警并标记强制改密
try {
  const rows = db.prepare('SELECT username, password_hash, salt FROM users').all();
  let flagged = false;
  for (const r of rows) {
    if (verifyPassword('admin123', r.password_hash, r.salt)) {
      flagged = true;
      db.prepare('UPDATE users SET must_change_pwd = 1 WHERE username = ?').run(r.username);
    }
  }
  if (flagged) {
    logger.warn('\x1b[33m[安全警告] 仍存在使用默认口令 admin123 的账号，已标记强制改密，请尽快修改！\x1b[0m');
  }
} catch (e) { /* 自检失败不影响启动 */ }

// ───────────────────────── 鉴权工具 ─────────────────────────
function hashPassword(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pwd, salt, 32).toString('hex');
  return { hash, salt };
}
function verifyPassword(pwd, hash, salt) {
  try {
    const h = crypto.scryptSync(pwd, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    // 哈希/salt 长度异常或格式错误时不应抛出 500，统一按校验失败处理
    return false;
  }
}
function signToken(user) {
  const payload = { uid: user.id, role: user.role, exp: Date.now() + 12 * 3600 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  try {
    // 令牌被篡改/截断会导致长度不匹配，timingSafeEqual 会抛错；
    // 此处捕获后返回 null，让上层统一返回 401，而非 500 崩溃
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  } catch { return null; }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const p = verifyToken(token);
  if (!p) return res.status(401).json({ error: '未登录或登录已过期' });
  req.user = p;
  next();
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// ───────────────────────── 应用 ─────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));

// ── 选项2：同步与媒体接口鉴权（公网暴露前必做，现已启用）──
// 任何合法登录令牌均可访问（共享诊所数据集，不按角色隔离）。
// /api/login（拿令牌）与 /api/err-report（匿名上报）保持开放，不受此守卫影响。
app.use('/api/sync', authMiddleware);
app.use('/api/media', authMiddleware);

// Phase 2 数据同步层路由（pull/push/lock）
require('./sync-routes')(app, db, verifyToken);
// Phase 3 媒体同步服务（磁盘文件 + sync_items 元数据）
require('./media-routes')(app, db, MEDIA_DIR);
// Phase 4 AI 能力路由（密钥安全 LLM 代理：本地 Ollama / 云 API / 混合）
app.use('/api/ai', authMiddleware);
require('./ai-routes')(app, db, verifyToken);

// 健康检查（nssm / 监控轮询用）
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now(), static: STATIC_DIR }));

// ── 患者端训练打卡同步（同源开放：同一分享链接在任意设备打卡即共享）──
// GET  /api/checkin?pid=<pid>            -> {ok, items:[{date, items, scheme}]}
// POST /api/checkin {pid, date, scheme, items} -> 覆盖写入当日打卡（items 为对象数组 {id,n,m,l,r}）
// GET  /api/checkin/summary?pid=<pid>|all=1&days=N
//      -> 多维聚合：levelDist / reasonDist / completionRate / avgScore / streak / trend
const CHECKIN_LEVELS = ['easy', 'normal', 'hard', 'none'];
const CHECKIN_LEVEL_SCORE = { easy: 4, normal: 3, hard: 2, none: 1 };
const CHECKIN_REASONS = ['r1', 'r2', 'r3', 'r4', 'r5'];
function safeParseItems(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
// 把任意来源的 items 规整为 {id, n, m, l, r}
function normalizeCheckinItem(it) {
  if (typeof it === 'string') return { id: it, n: it, m: '', l: 'easy', r: [] };
  const o = (it && typeof it === 'object') ? it : {};
  const l = CHECKIN_LEVELS.includes(o.l) ? o.l : 'none';
  let r = Array.isArray(o.r) ? o.r : [];
  r = r.map(function (x) {
    if (typeof x === 'number') return 'r' + x;
    const s = String(x).trim();
    if (/^\d$/.test(s)) return 'r' + s;
    if (/^r\d$/.test(s)) return s;
    // 兼容中文序号
    const idx = ['动作没看懂', '动作姿势难度大', '动作组数/次数多', '没有很好的场地/辅助道具', '疲劳发虚'].indexOf(s);
    return idx >= 0 ? 'r' + (idx + 1) : null;
  }).filter(Boolean);
  return {
    id: String(o.id != null ? o.id : ''),
    n: String(o.n != null ? o.n : ''),
    m: String(o.m != null ? o.m : ''),
    l: l,
    r: r
  };
}
function computeCheckinSummary(rows, windowDays) {
  const levelDist = { easy: 0, normal: 0, hard: 0, none: 0 };
  const reasonDist = { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 };
  let totalItems = 0, completedItems = 0, scoreSum = 0;
  const dateSet = new Set();
  for (const row of rows) {
    if (!row.date) continue;
    dateSet.add(row.date);
    const items = Array.isArray(row.items) ? row.items : [];
    for (const it of items) {
      let l;
      if (typeof it === 'string') l = 'easy';
      else l = (it && CHECKIN_LEVEL_SCORE[it.l] ? it.l : 'none');
      levelDist[l]++;
      totalItems++;
      if (l !== 'none') completedItems++;
      scoreSum += CHECKIN_LEVEL_SCORE[l] || 1;
      if (typeof it === 'object' && Array.isArray(it.r)) {
        for (const x of it.r) {
          const key = String(x).startsWith('r') ? x : ('r' + x);
          if (reasonDist[key] !== undefined) reasonDist[key]++;
        }
      }
    }
  }
  const days = dateSet.size;
  const completionRate = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;
  const avgScore = totalItems ? Math.round((scoreSum / totalItems) * 100) / 100 : 0;
  // 连续打卡：以最新打卡日倒推连续天数
  let streak = 0;
  if (dateSet.size) {
    let max = null;
    dateSet.forEach(d => { if (!max || d > max) max = d; });
    let cur = new Date(max + 'T00:00:00');
    while (dateSet.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }
  }
  // 趋势：最近 windowDays 天逐日分布
  const trend = [];
  const today = new Date();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = ymd(d);
    const bucket = { date: ds, total: 0, easy: 0, normal: 0, hard: 0, none: 0, completed: 0 };
    for (const row of rows) {
      if (row.date !== ds) continue;
      const items = Array.isArray(row.items) ? row.items : [];
      for (const it of items) {
        let l = (typeof it === 'string') ? 'easy' : (it && CHECKIN_LEVEL_SCORE[it.l] ? it.l : 'none');
        bucket[l]++; bucket.total++;
        if (l !== 'none') bucket.completed++;
      }
    }
    trend.push(bucket);
  }
  return {
    records: rows.length,
    days,
    completionRate,
    avgScore,
    streak,
    levelDist,
    reasonDist,
    totalItems,
    completedItems,
    trend
  };
}

app.get('/api/checkin', (req, res) => {
  const pid = (req.query.pid || '').toString().slice(0, 128);
  if (!pid) return res.status(400).json({ error: '缺少 pid' });
  try {
    const rows = db.prepare('SELECT date, items, scheme FROM checkins WHERE pid = ? ORDER BY date DESC LIMIT 60').all(pid);
    res.json({
      ok: true,
      items: rows.map(r => ({ date: r.date, items: safeParseItems(r.items), scheme: r.scheme || '' }))
    });
  } catch (e) { res.status(500).json({ error: '查询失败' }); }
});

app.post('/api/checkin', (req, res) => {
  const b = req.body || {};
  const pid = (b.pid || '').toString().slice(0, 128);
  const date = (b.date || '').toString().slice(0, 24);
  const scheme = (b.scheme === 'weight' || b.scheme === 'sarcopenia') ? b.scheme : '';
  let items = Array.isArray(b.items) ? b.items.slice(0, 300) : [];
  items = items.map(normalizeCheckinItem);
  if (!pid || !date) return res.status(400).json({ error: '缺少 pid/date' });
  try {
    db.prepare(`INSERT INTO checkins (pid, date, items, scheme, updated_at) VALUES (?,?,?,?,datetime('now'))
      ON CONFLICT(pid, date) DO UPDATE SET items = excluded.items, scheme = excluded.scheme, updated_at = datetime('now')`)
      .run(pid, date, JSON.stringify(items), scheme);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: '写入失败' }); }
});

// 多维汇总：支持单患者（pid）或全员（all=1）
app.get('/api/checkin/summary', (req, res) => {
  const pid = (req.query.pid || '').toString().slice(0, 128);
  const all = req.query.all === '1' || req.query.all === 1;
  const days = Math.min(Math.max(parseInt(req.query.days || '7', 10) || 7, 1), 30);
  const scope = (req.query.scope === 'weight' || req.query.scope === 'sarcopenia') ? req.query.scope : '';
  if (!pid && !all) return res.status(400).json({ error: '缺少 pid 或 all 参数' });
  try {
    let raw;
    if (all) raw = db.prepare('SELECT pid, date, items, scheme FROM checkins ORDER BY date DESC').all();
    else raw = db.prepare('SELECT pid, date, items, scheme FROM checkins WHERE pid = ? ORDER BY date DESC').all(pid);
    let rows = raw.map(r => ({ pid: r.pid, date: r.date, items: safeParseItems(r.items), scheme: r.scheme || '' }));
    if (scope) rows = rows.filter(r => r.scheme === scope || (!r.scheme && scope === 'weight'));
    const summary = computeCheckinSummary(rows, days);
    summary.pid = pid || null;
    summary.all = !!all;
    res.json({ ok: true, summary });
  } catch (e) { res.status(500).json({ error: '汇总失败' }); }
});

// 近期打卡明细记录（供医生端台账「训练方案执行记录」区块）
// GET /api/checkin/records?all=1&scope=weight|sarcopenia&limit=N
app.get('/api/checkin/records', (req, res) => {
  const all = req.query.all === '1' || req.query.all === 1;
  const scope = (req.query.scope === 'weight' || req.query.scope === 'sarcopenia') ? req.query.scope : '';
  const limit = Math.min(Math.max(parseInt(req.query.limit || '30', 10) || 30, 1), 200);
  if (!all) return res.status(400).json({ error: '需带 all=1' });
  try {
    let raw = db.prepare('SELECT pid, date, items, scheme, updated_at FROM checkins ORDER BY date DESC, updated_at DESC').all();
    if (scope) raw = raw.filter(r => (r.scheme || '') === scope || (!r.scheme && scope === 'weight'));
    const records = raw.slice(0, limit).map(r => ({
      pid: r.pid,
      date: r.date,
      scheme: r.scheme || 'weight',
      updated_at: r.updated_at,
      items: safeParseItems(r.items)
    }));
    res.json({ ok: true, records });
  } catch (e) { res.status(500).json({ error: '查询失败' }); }
});

// 报错接收（前端统一 SDK 落点，允许匿名，限流靠体量小）
app.post('/api/err-report', (req, res) => {
  const b = req.body || {};
  if (!b.msg && !b.stack) return res.status(400).json({ error: '缺少 msg/stack' });
  const auth = (req.headers['authorization'] || '').slice(7);
  const p = verifyToken(auth);
  try {
    db.prepare(`INSERT INTO errors (level, msg, url, line, col, stack, user_agent, user_id, meta_json)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      b.level || 'error', String(b.msg || '').slice(0, 4000), b.url || '', b.line || null, b.col || null,
      String(b.stack || '').slice(0, 8000), req.headers['user-agent'] || '', p ? p.uid : '',
      b.meta ? JSON.stringify(b.meta).slice(0, 2000) : null
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '记录失败' });
  }
});

// 报错列表（管理员）
app.get('/api/err-report', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM errors ORDER BY id DESC LIMIT 200').all();
  res.json({ count: rows.length, rows });
});

// ───────────── 患者扫码查看报告：服务端短链令牌（方案 B）─────────────
// POST   /api/share        (auth)       创建分享令牌，落库报告数据，返回短链 URL
// GET    /api/share        (auth)       列出本人（管理员看全部）的分享令牌
// GET    /api/share/:token (公开)       患者端读取，自动 +1 浏览计数；404/410 表示失效/过期
// DELETE /api/share/:token (auth)       仅创建者或管理员可撤销
const SHARE_TTL_DAYS = parseInt(process.env.SHARE_TTL_DAYS || '0', 10); // 0 = 不过期
function buildShareUrl(req, token) {
  const envBase = process.env.PUBLIC_BASE_URL;
  if (envBase) return envBase.replace(/\/$/, '') + '/s/' + token;
  const proto = (req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https' : 'http') || 'https');
  const host = req.headers['host'] || '';
  if (proto && host) return proto + '://' + host + '/s/' + token;
  return '/s/' + token;
}
app.post('/api/share', authMiddleware, (req, res) => {
  const b = req.body || {};
  if (!b.data || typeof b.data !== 'object') return res.status(400).json({ error: '缺少分享数据' });
  let dataJson;
  try { dataJson = JSON.stringify(b.data); } catch (e) { return res.status(400).json({ error: '数据序列化失败' }); }
  if (dataJson.length > 2 * 1024 * 1024) return res.status(413).json({ error: '分享内容过大，请精简后重试' });
  const token = crypto.randomBytes(16).toString('hex');
  const title = (typeof b.title === 'string' && b.title.trim()) ? b.title.trim().slice(0, 200) : '';
  let expiresAt = null;
  if (SHARE_TTL_DAYS > 0) {
    const d = new Date(Date.now() + SHARE_TTL_DAYS * 86400000);
    expiresAt = d.toISOString();
  } else if (typeof b.expiresAt === 'string' && b.expiresAt) {
    expiresAt = b.expiresAt.slice(0, 64);
  }
  try {
    db.prepare('INSERT INTO share_tokens (token, owner_id, title, data_json, expires_at) VALUES (?,?,?,?,?)')
      .run(token, req.user.uid, title, dataJson, expiresAt);
    res.json({ ok: true, token, url: buildShareUrl(req, token), expiresAt });
  } catch (e) {
    res.status(500).json({ error: '创建分享失败' });
  }
});
app.get('/api/share', authMiddleware, (req, res) => {
  try {
    const rows = (req.user.role === 'admin')
      ? db.prepare('SELECT token, owner_id, title, created_at, expires_at, views FROM share_tokens ORDER BY created_at DESC LIMIT 200').all()
      : db.prepare('SELECT token, owner_id, title, created_at, expires_at, views FROM share_tokens WHERE owner_id = ? ORDER BY created_at DESC LIMIT 200').all(req.user.uid);
    res.json({ ok: true, items: rows.map(function (r) {
      return { token: r.token, title: r.title, createdAt: r.created_at, expiresAt: r.expires_at, views: r.views };
    }) });
  } catch (e) { res.status(500).json({ error: '查询失败' }); }
});
app.get('/api/share/:token', (req, res) => {
  const token = (req.params.token || '').toString().slice(0, 64);
  if (!token) return res.status(400).json({ error: '缺少 token' });
  try {
    const row = db.prepare('SELECT * FROM share_tokens WHERE token = ?').get(token);
    if (!row) return res.status(404).json({ error: '分享链接不存在或已失效' });
    if (row.expires_at) {
      const exp = new Date(row.expires_at);
      if (!isNaN(exp.getTime()) && exp < new Date()) return res.status(410).json({ error: '分享链接已过期' });
    }
    db.prepare('UPDATE share_tokens SET views = views + 1 WHERE token = ?').run(token);
    let data;
    try { data = JSON.parse(row.data_json); } catch (e) { return res.status(500).json({ error: '分享数据损坏' }); }
    res.json({ ok: true, data: data, title: row.title || '', views: (row.views || 0) + 1, createdAt: row.created_at });
  } catch (e) { res.status(500).json({ error: '读取失败' }); }
});
app.delete('/api/share/:token', authMiddleware, (req, res) => {
  const token = (req.params.token || '').toString().slice(0, 64);
  if (!token) return res.status(400).json({ error: '缺少 token' });
  try {
    const row = db.prepare('SELECT owner_id FROM share_tokens WHERE token = ?').get(token);
    if (!row) return res.status(404).json({ error: '分享链接不存在' });
    if (row.owner_id !== req.user.uid && req.user.role !== 'admin') return res.status(403).json({ error: '只能撤销本人创建的分享' });
    db.prepare('DELETE FROM share_tokens WHERE token = ?').run(token);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: '撤销失败' }); }
});

// ── L0-5 登录失败限流（内存计次，重启清零；单主机内网场景足够）──
const loginFails = new Map(); // key: ip|username -> { count, first }
const LOGIN_MAX_FAIL = parseInt(process.env.LOGIN_MAX_FAIL || '10', 10);
const LOGIN_WINDOW_MS = parseInt(process.env.LOGIN_WINDOW_MS || '600000', 10); // 10 分钟
function isLoginBlocked(key) {
  const now = Date.now();
  const rec = loginFails.get(key);
  if (!rec || now - rec.first > LOGIN_WINDOW_MS) {
    loginFails.set(key, { count: 1, first: now });
    return false;
  }
  rec.count++;
  return rec.count > LOGIN_MAX_FAIL;
}
function clearLoginFails(key) { loginFails.delete(key); }
// 定期清理过期计数，避免内存缓慢增长
const _loginSweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginFails) if (now - v.first > LOGIN_WINDOW_MS) loginFails.delete(k);
}, LOGIN_WINDOW_MS);
if (_loginSweep.unref) _loginSweep.unref();

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().slice(0, 64);
  const key = `${ip}|${username || ''}`;
  if (isLoginBlocked(key)) {
    return res.status(429).json({ error: '登录尝试过于频繁，请 10 分钟后再试' });
  }
  if (!username || !password) return res.status(400).json({ error: '缺少账号或密码' });
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!u || !verifyPassword(password, u.password_hash, u.salt)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  if (u.expires_at && new Date(u.expires_at) < new Date()) {
    return res.status(403).json({ error: '账号已过期，请联系管理员' });
  }
  clearLoginFails(key); // 成功登录清除失败计数
  const token = signToken(u);
  res.json({
    token,
    mustChangePwd: !!u.must_change_pwd,
    user: { id: u.id, username: u.username, role: u.role, name: u.name }
  });
});

// 当前用户
app.get('/api/me', authMiddleware, (req, res) => {
  const u = db.prepare('SELECT id, username, role, name, expires_at FROM users WHERE id = ?').get(req.user.uid);
  res.json({ user: u });
});

// 修改自己的后端密码（任何登录用户均可，覆盖管理员改密码诉求）
app.post('/api/me/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '缺少旧密码或新密码' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.uid);
  if (!u || !verifyPassword(oldPassword, u.password_hash, u.salt)) {
    return res.status(401).json({ error: '旧密码错误' });
  }
  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash=?, salt=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(hash, salt, u.id);
  res.json({ ok: true });
});

// 管理员创建后端账号（使多医生真实可用；隔离测试也依赖此接口）
app.post('/api/admin/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, role, name } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
  if (!/^[a-zA-Z0-9_]{3,}$/.test(username)) return res.status(400).json({ error: '用户名需字母数字下划线且 ≥3 位' });
  if (String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const role2 = (role === 'admin') ? 'admin' : 'doctor';
  const exist = db.prepare('SELECT COUNT(*) AS n FROM users WHERE username=?').get(username);
  if (exist.n) return res.status(409).json({ error: '用户名已存在' });
  const { hash, salt } = hashPassword(password);
  db.prepare('INSERT INTO users (id,username,password_hash,salt,role,name) VALUES (?,?,?,?,?,?)')
    .run('u_' + Date.now().toString(36), username, hash, salt, role2, name || username);
  res.json({ ok: true });
});

// 管理员强制修改某用户密码
app.post('/api/admin/change-password', authMiddleware, adminOnly, (req, res) => {
  const { username, newPassword } = req.body || {};
  if (!username || !newPassword) return res.status(400).json({ error: '缺少用户名或新密码' });
  if (String(newPassword).length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash=?, salt=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(hash, salt, u.id);
  res.json({ ok: true });
});

// 触发备份（管理员）
app.post('/api/admin/backup', authMiddleware, adminOnly, (req, res) => {
  try {
    const dest = runBackup();
    res.json({ ok: true, dest });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ───────── 批次0：运维工作台地基（聚合状态 / 自动备份 / 外部下载）─────────
// 以下均为“加法”，不改动任何既有接口与功能。

// 备份状态 helper（供 /api/admin/ops/status 与下载接口复用）
function getBackupStatus() {
  const base = { backupDir: BACKUP_DIR, sameAsData: BACKUP_DIR.indexOf(DATA_DIR) === 0 };
  try {
    if (!fs.existsSync(BACKUP_DIR)) return Object.assign({ exists: false, count: 0, lastBackup: null, lastBackupTs: null }, base);
    const dirs = fs.readdirSync(BACKUP_DIR)
      .filter(d => { try { return fs.statSync(path.join(BACKUP_DIR, d)).isDirectory(); } catch (e) { return false; } })
      .sort();
    if (!dirs.length) return Object.assign({ exists: true, count: 0, lastBackup: null, lastBackupTs: null }, base);
    const last = dirs[dirs.length - 1];
    let ts = null;
    try { ts = (JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, last, 'manifest.json'), 'utf8')).createdAt) || null; } catch (e) {}
    return Object.assign({ exists: true, count: dirs.length, lastBackup: last, lastBackupTs: ts }, base);
  } catch (e) {
    return Object.assign({ exists: false, error: String(e.message || e), count: 0, lastBackup: null, lastBackupTs: null }, base);
  }
}

// 安全计数：表/列缺失时返回 -1，不抛错中断状态聚合
function safeCount(sql, params) {
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get.apply(stmt, params || []);
    return row ? row.c : 0;
  } catch (e) { return -1; }
}

// 业务库文件体积（含 WAL）
function dbFileSize() {
  const p = path.join(DATA_DIR, 'app.db');
  let bytes = 0, ok = true;
  [p, p + '-wal', p + '-shm'].forEach(f => { try { bytes += fs.statSync(f).size; } catch (e) { ok = false; } });
  return { bytes: bytes, human: _backup.human(bytes), readable: ok };
}

// 聚合状态（管理员）：一次请求返回健康 / 业务指标 / 错误数 / 备份状态 / 卷状态
app.get('/api/admin/ops/status', authMiddleware, adminOnly, (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    const todayStart = new Date(today + 'T00:00:00Z').toISOString();
    const counts = {
      users: safeCount('SELECT COUNT(*) c FROM users'),
      patients: safeCount('SELECT COUNT(*) c FROM patients'),
      assessmentsToday: safeCount("SELECT COUNT(*) c FROM assessments WHERE created_at >= ?", [todayStart]),
      reportsToday: safeCount("SELECT COUNT(*) c FROM reports WHERE created_at >= ?", [todayStart]),
      checkinsToday: safeCount('SELECT COUNT(*) c FROM checkins WHERE date = ?', [today]),
      errorsToday: safeCount("SELECT COUNT(*) c FROM errors WHERE ts >= ?", [todayStart]),
      errorsTotal: safeCount('SELECT COUNT(*) c FROM errors')
    };
    res.json({
      ok: true,
      generatedAt: Date.now(),
      health: { ok: true, uptimeSec: Math.round(process.uptime()), node: process.versions.node, ts: Date.now() },
      dbSize: dbFileSize(),
      counts: counts,
      backup: getBackupStatus(),
      volume: {
        dataDir: DATA_DIR,
        railwayVolumeMount: process.env.RAILWAY_VOLUME_MOUNT_PATH || null,
        railwayEnv: process.env.RAILWAY_ENVIRONMENT || null
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// 下载最新备份（tar.gz 流式下载，便于管理员异地保存，防同机共毁）
app.get('/api/admin/backup/download', authMiddleware, adminOnly, (req, res) => {
  try {
    const st = getBackupStatus();
    if (!st.lastBackup) return res.status(404).json({ error: '暂无备份可下载，请先执行一次备份' });
    const name = st.lastBackup;
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="quedong-backup-' + name + '.tar.gz"');
    const child = spawn('tar', ['-czf', '-', '-C', BACKUP_DIR, name]);
    child.stdout.pipe(res);
    child.on('error', (e) => { if (!res.headersSent) res.status(500).json({ error: '打包失败：' + String(e.message || e) }); });
    child.on('close', (code) => {
      if (res.headersSent) return;
      if (code !== 0) res.status(500).end('tar 进程异常退出（code ' + code + '）');
      else res.end();
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String(e.message || e) });
  }
});

// 自动每日备份：启动即补备（若超 24h 无备份）+ 每天 02:00 例行备份
function startAutoBackup() {
  const _do = () => {
    try { const dest = runBackup(); logger.info('[auto-backup] 完成：' + dest); }
    catch (e) { logger.error('[auto-backup] 失败：' + (e && e.stack ? e.stack : e)); }
  };
  try {
    const st = getBackupStatus();
    const stale = !st.lastBackup || (st.lastBackupTs && (Date.now() - new Date(st.lastBackupTs).getTime() > 24 * 3600 * 1000));
    if (stale) _do();
  } catch (e) {}
  const now = new Date();
  const next = new Date(now); next.setHours(2, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;
  setTimeout(() => { _do(); setInterval(_do, 24 * 3600 * 1000); }, ms);
  logger.info('[auto-backup] 已排程，下次例行备份：' + next.toISOString());
}

// 静态托管前端（开发/局域网环境禁用浏览器缓存，避免 iframe/硬刷新问题）
app.use(express.static(STATIC_DIR, {
  extensions: ['html'],
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  },
}));
// SPA 兜底（哈希路由下极少触发，但保留以免深链 404）
app.get(/^(?!\/api).*/, (req, res) => {
  const idx = path.join(STATIC_DIR, 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('index.html not found in ' + STATIC_DIR);
});

// ── L0-1 未匹配接口兜底（返回 JSON 404，而非 Express 默认 HTML）──
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: '接口不存在' });
  next();
});

// ── L0-1 全局错误兜底（捕获路由/中间件抛出的未处理异常，避免返回堆栈泄露）──
// 注意：错误中间件须放在所有路由之后、进程监听之前
app.use((err, req, res, next) => {
  console.error('[express-error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const detail = process.env.NODE_ENV === 'development' ? String((err && err.message) || err) : undefined;
  res.status(500).json({ error: '服务器内部错误', detail });
});

// ── L0-1 进程级异常兜底（避免单点崩溃导致整服务退出、影响局域网所有终端）──
function logFatal(tag, err) {
  try { console.error(`[\x1b[31m${tag}\x1b[0m]`, err && err.stack ? err.stack : err); } catch (e) {}
}
process.on('uncaughtException', (err) => logFatal('uncaughtException', err));
process.on('unhandledRejection', (reason) => logFatal('unhandledRejection', reason));

// ───────────────────────── 备份 ─────────────────────────
// 核心实现抽到 lib-backup.js，与独立进程 backup.js（计划任务用）共用同一套逻辑
const _backup = require('./lib-backup.js');
function runBackup() {
  const r = _backup.runBackup(db, {
    mediaDir: MEDIA_DIR,
    backupDir: BACKUP_DIR,
    keep: parseInt(process.env.BACKUP_KEEP || '30', 10)
  });
  return r.dest;
}
module.exports = { runBackup, app };

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`[quedong-backend] 监听 http://0.0.0.0:${PORT}`);
    logger.info(`[quedong-backend] 静态目录: ${STATIC_DIR}`);
    logger.info(`[quedong-backend] 数据库:   ${path.join(DATA_DIR, 'app.db')}`);
  });
  // 批次0-2：自动每日备份 + 启动即补备（若超过 24h 无备份）；测试/禁用变量下不启用
  if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_AUTO_BACKUP !== '1') {
    startAutoBackup();
  }
}
