/**
 * 应用侧体检探针 —— 只输出纯 ASCII 的 KEY=VALUE，写入 argv[2] 指定的文件
 *
 * 为什么不直接 console.log 中文？
 *   Windows 控制台代码页是 GBK(936)，而 node 输出的是 UTF-8 字节；
 *   一旦被重定向/管道接收就必然乱码（实测 "数据库" -> "鏁版嵁搴?"）。
 *   所以：数值交给 node 算（ASCII），中文标签交给 GBK 编码的 .bat 打印。
 */
'use strict';
const path = require('path');
const fs = require('fs');

const SRV = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(SRV, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : path.join(DATA_DIR, 'media');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const PORT = process.env.APP_PORT || process.env.PORT || '8080';
const OUT = process.argv[2];

const kv = {};
function set(k, v) { kv[k] = String(v == null ? '' : v).replace(/[\r\n()<>|&^]/g, ' '); }

function human(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
function dirStat(d) {
  let files = 0, bytes = 0;
  if (!fs.existsSync(d)) return { files, bytes };
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { const r = dirStat(path.join(d, e.name)); files += r.files; bytes += r.bytes; }
    else { files++; try { bytes += fs.statSync(path.join(d, e.name)).size; } catch (x) {} }
  }
  return { files, bytes };
}

function collectSync() {
  // 数据库
  const dbFile = path.join(DATA_DIR, 'app.db');
  if (fs.existsSync(dbFile)) {
    set('DB_EXISTS', 1);
    // WAL 模式下大部分数据可能还在 -wal 里，只报主文件会让人误以为数据丢了
    let dbBytes = 0;
    ['app.db', 'app.db-wal', 'app.db-shm'].forEach(f => {
      try { dbBytes += fs.statSync(path.join(DATA_DIR, f)).size; } catch (e) {}
    });
    set('DB_SIZE', human(dbBytes));
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(dbFile);
      const q = n => { try { return db.prepare('SELECT COUNT(*) c FROM ' + n).get().c; } catch (e) { return '-'; } };
      set('DB_USERS', q('users'));
      set('DB_SYNC', q('sync_items'));
      set('DB_ERRS', q('errors'));
      db.close();
    } catch (e) {
      set('DB_USERS', '-'); set('DB_SYNC', '-'); set('DB_ERRS', '-');
    }
  } else {
    set('DB_EXISTS', 0);
  }

  // 媒体
  const m = dirStat(MEDIA_DIR);
  set('MEDIA_FILES', m.files);
  set('MEDIA_SIZE', human(m.bytes));

  // 备份
  let dirs = [];
  try {
    dirs = fs.readdirSync(BACKUP_DIR).filter(d => {
      try { return fs.statSync(path.join(BACKUP_DIR, d)).isDirectory(); } catch (e) { return false; }
    }).sort().reverse();
  } catch (e) {}
  set('BK_COUNT', dirs.length);
  if (dirs.length) {
    set('BK_LATEST', dirs[0]);
    let ageH = 0;
    try { ageH = (Date.now() - fs.statSync(path.join(BACKUP_DIR, dirs[0])).mtimeMs) / 3600000; } catch (e) {}
    set('BK_AGEH', ageH.toFixed(0));
    set('BK_STALE', ageH > 26 ? 1 : 0);
  } else {
    set('BK_LATEST', ''); set('BK_AGEH', ''); set('BK_STALE', 0);
  }
}

async function collectHealth() {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    const r = await fetch('http://127.0.0.1:' + PORT + '/health', { signal: ac.signal });
    clearTimeout(t);
    const j = await r.json().catch(() => null);
    set('HEALTH_CODE', r.status);
    set('HEALTH_OK', (j && j.ok) ? 1 : 0);
  } catch (e) {
    set('HEALTH_CODE', '');
    set('HEALTH_OK', 0);
  }
}

(async function main() {
  try { collectSync(); } catch (e) { set('ERR', 'collect failed'); }
  await collectHealth();
  const lines = Object.keys(kv).map(k => k + '=' + kv[k]);
  const text = lines.join('\r\n') + '\r\n';
  if (OUT) { try { fs.writeFileSync(OUT, text, 'ascii'); } catch (e) {} }
  else process.stdout.write(text);
})();
