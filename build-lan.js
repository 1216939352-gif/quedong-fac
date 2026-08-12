/**
 * 构建局域网部署前端包：把根目录的前端资源同步进 _dl3（后端静态托管目录）。
 *
 * 用法：node build-lan.js
 *   解析 index.html 中引用的本地资源（src/href），仅复制被引用的前端目录/文件，
 *   绝不复制 server/、node_modules、.git、deploy 等后端/工程目录，避免把后端源码塞进前端包。
 * 运行后，把整个项目目录拷到局域网服务器，双击 启动系统.bat 即可。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEST = path.join(ROOT, '_dl3');

const EXCLUDE_DIRS = new Set([
  '.git', '.workbuddy', 'node_modules', 'server', 'deploy',
  'backups', 'data', 'media', '.acc_tmp', '.acc_remote', 'tmp'
]);
const KNOWN_DIRS = ['modules', 'lib', 'images', 'fonts', 'css', 'js'];

function discoverFromIndex() {
  const idx = path.join(ROOT, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  const dirs = new Set();
  const files = new Set();
  const re = /(?:src|href)\s*=\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) {
    let u = m[1].trim();
    if (/^(https?:|data:|#|mailto:)/i.test(u)) continue;
    u = u.split('?')[0].split('#')[0].replace(/^\.\//, '');
    if (!u) continue;
    const parts = u.split('/').filter(Boolean);
    if (parts.length === 1 && !path.extname(parts[0])) dirs.add(parts[0]);
    else if (parts.length === 1) files.add(parts[0]);
    else dirs.add(parts[0]); // 取首个路径段作为目录
  }
  for (const d of KNOWN_DIRS) dirs.add(d);
  files.add('index.html');
  files.add('styles.css');
  for (const d of [...dirs]) if (EXCLUDE_DIRS.has(d)) dirs.delete(d);
  return { dirs, files };
}

function copyDir(src, dest) {
  if (EXCLUDE_DIRS.has(path.basename(src))) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || e.name === 'node_modules') continue;
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function main() {
  console.log('[build-lan] 同步前端资源 → _dl3（局域网部署目录）');
  const { dirs, files } = discoverFromIndex();
  console.log('  将复制目录: ' + [...dirs].join(', '));

  // 注：仅「覆盖复制」、不删除目标目录。原因：本环境 rmSync 被安全删除包装拦截
  // （走回收站），对大目录会失败。服务端托管目录留旧文件不影响访问，故采用增量覆盖策略。
  fs.mkdirSync(DEST, { recursive: true });

  let copied = 0;
  for (const d of dirs) {
    const s = path.join(ROOT, d);
    if (fs.existsSync(s) && fs.statSync(s).isDirectory()) {
      copyDir(s, path.join(DEST, d));
      copied++;
    }
  }
  for (const f of files) {
    const s = path.join(ROOT, f);
    if (fs.existsSync(s) && fs.statSync(s).isFile()) {
      fs.mkdirSync(path.dirname(path.join(DEST, f)), { recursive: true });
      fs.copyFileSync(s, path.join(DEST, f));
    }
  }
  console.log(`[build-lan] 完成：已复制 ${copied} 个顶层目录 + 关键文件到 _dl3`);
  console.log('[build-lan] 局域网部署：把整个项目目录拷到目标机，双击「启动系统.bat」即可（前端已含登录鉴权）。');
}

main();
