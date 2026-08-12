/**
 * 环境探针 —— 被 _env.bat 调用，输出 KEY=VALUE 行供批处理直接 set
 * 批处理里做版本比较/特性检测非常痛苦（转义地狱），交给 node 判断最可靠。
 */
'use strict';
const v = process.versions.node;
const [a, b] = v.split('.').map(Number);
const okVer = a > 22 || (a === 22 && b >= 5);

let flags = '';
try {
  require('node:sqlite');
} catch (e) {
  // 22.5 ~ 22.12 需要显式开启实验特性；更高版本已默认可用
  flags = '--experimental-sqlite';
}

const out = [
  'NODE_VER=' + v,
  'VER_OK=' + (okVer ? 'yes' : 'no'),
  'NODE_FLAGS=' + flags
];
process.stdout.write(out.join('\r\n') + '\r\n');
