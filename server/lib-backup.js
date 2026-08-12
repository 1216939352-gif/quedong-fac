/**
 * 备份核心逻辑（被 server.js 的 /api/admin/backup 与独立进程 backup.js 共用）
 * 设计要点：
 *   - 不依赖 express / multer，可被最小化进程调用（Windows 计划任务场景）
 *   - SQLite 用 VACUUM INTO 做在线一致性备份（WAL 模式下同样安全，无需停服）
 *   - 媒体目录整体拷贝，另写 manifest.json 便于人工核对
 *   - 自动保留最近 N 份（默认 30），超出的按时间倒序清理
 */
'use strict';

const path = require('path');
const fs = require('fs');

/** 生成本地时区可读时间戳：2026-08-09_10-30-00 */
function stamp(d) {
  const p = n => String(n).padStart(2, '0');
  d = d || new Date();
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    '_' + p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
}

function copyDir(src, dest) {
  let files = 0, bytes = 0;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) {
      const r = copyDir(s, d);
      files += r.files; bytes += r.bytes;
    } else {
      fs.copyFileSync(s, d);
      files++;
      try { bytes += fs.statSync(d).size; } catch (e2) {}
    }
  }
  return { files, bytes };
}

function human(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

/**
 * 执行一次备份
 * @param {object} db          已打开的 node:sqlite DatabaseSync 实例
 * @param {object} opts        { mediaDir, backupDir, keep }
 * @returns {object}           { dest, dbBytes, mediaFiles, mediaBytes, pruned }
 */
function runBackup(db, opts) {
  opts = opts || {};
  const MEDIA_DIR = opts.mediaDir;
  const BACKUP_DIR = opts.backupDir;
  const KEEP = Number.isFinite(opts.keep) ? opts.keep : 30;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = stamp();
  const dest = path.join(BACKUP_DIR, name);
  fs.mkdirSync(dest, { recursive: true });

  // SQLite 在线一致备份：VACUUM INTO 生成干净单文件（含 WAL 中未落盘的数据）
  // 注意：路径中的单引号必须按 SQL 规则转义为两个单引号
  const dbTarget = path.join(dest, 'app.db');
  db.exec("VACUUM INTO '" + dbTarget.replace(/'/g, "''") + "'");
  let dbBytes = 0;
  try { dbBytes = fs.statSync(dbTarget).size; } catch (e) {}

  // 媒体目录整体拷贝
  let media = { files: 0, bytes: 0 };
  if (MEDIA_DIR && fs.existsSync(MEDIA_DIR)) {
    media = copyDir(MEDIA_DIR, path.join(dest, 'media'));
  }

  // 清单，便于人工核对/校验完整性
  const manifest = {
    createdAt: new Date().toISOString(),
    name: name,
    db: { file: 'app.db', bytes: dbBytes, human: human(dbBytes) },
    media: { dir: 'media', files: media.files, bytes: media.bytes, human: human(media.bytes) },
    node: process.versions.node,
    keep: KEEP
  };
  fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 仅保留最近 KEEP 份
  let pruned = 0;
  try {
    const dirs = fs.readdirSync(BACKUP_DIR)
      .filter(d => {
        try { return fs.statSync(path.join(BACKUP_DIR, d)).isDirectory(); } catch (e) { return false; }
      })
      .sort().reverse();
    dirs.slice(KEEP).forEach(d => {
      fs.rmSync(path.join(BACKUP_DIR, d), { recursive: true, force: true });
      pruned++;
    });
  } catch (e) {}

  return { dest, dbBytes, mediaFiles: media.files, mediaBytes: media.bytes, pruned, manifest };
}

module.exports = { runBackup, copyDir, human, stamp };
