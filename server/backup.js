/**
 * 独立备份进程 —— 供 Windows 计划任务定时调用（如每日 00:30 / 12:30）
 *
 * 用法：
 *   node backup.js                 备份并保留最近 30 份
 *   node backup.js --keep=60       保留最近 60 份
 *
 * 特意不 require server.js：避免为了一次备份而加载 express/multer 与注册路由，
 * 计划任务下启动更快、失败面更小，也不会因端口占用等无关问题导致备份失败。
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { runBackup, human } = require('./lib-backup.js');

const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR ? path.resolve(process.env.MEDIA_DIR) : path.join(DATA_DIR, 'media');
const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'app.db');
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log');

const keepArg = (process.argv.find(a => a.startsWith('--keep=')) || '').split('=')[1];
const KEEP = keepArg ? parseInt(keepArg, 10) : 30;

function log(line) {
  const msg = '[' + new Date().toLocaleString('zh-CN', { hour12: false }) + '] ' + line;
  console.log(msg);
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, msg + '\r\n', 'utf8');
  } catch (e) {}
}

let db = null;
try {
  if (!fs.existsSync(DB_FILE)) {
    log('失败：数据库不存在 ' + DB_FILE + '（后端尚未运行过？）');
    process.exit(1);
  }
  db = new DatabaseSync(DB_FILE);
  const r = runBackup(db, { mediaDir: MEDIA_DIR, backupDir: BACKUP_DIR, keep: KEEP });
  log('完成：' + r.dest +
    ' | 数据库 ' + human(r.dbBytes) +
    ' | 媒体 ' + r.mediaFiles + ' 个 / ' + human(r.mediaBytes) +
    (r.pruned ? ' | 清理旧备份 ' + r.pruned + ' 份' : ''));
  process.exit(0);
} catch (e) {
  log('失败：' + (e && e.message ? e.message : String(e)));
  process.exit(1);
} finally {
  try { if (db) db.close(); } catch (e) {}
}
