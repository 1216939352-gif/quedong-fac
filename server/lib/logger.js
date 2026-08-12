'use strict';
/**
 * 后端分级日志工具（L4-16）
 * 级别：debug(10) < info(20) < warn(30) < error(40)
 * 通过环境变量 LOG_LEVEL 控制输出门槛，默认：
 *   - NODE_ENV=production → info
 *   - 其它（开发/调试）     → debug
 * 仅做“按级别过滤 + 统一前缀/时间戳”，不接管底层 console，便于后续接文件/远程。
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const env = (process.env.LOG_LEVEL || '').toLowerCase();
  if (LEVELS[env] !== undefined) return LEVELS[env];
  return (process.env.NODE_ENV === 'production') ? LEVELS.info : LEVELS.debug;
}

function ts() {
  // 本地可读时间戳，形如 2026-08-12 08:53:44
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function write(level, args) {
  if (LEVELS[level] < currentLevel()) return;
  const prefix = `[${level.toUpperCase()}] ${ts()}`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
}

module.exports = {
  debug: (...a) => write('debug', a),
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  setLevel: (l) => { if (LEVELS[l] !== undefined) process.env.LOG_LEVEL = l; },
};
