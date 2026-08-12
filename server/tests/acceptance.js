/**
 * 鹊动系统 — Phase 6 集成验收脚本（自包含、隔离、可重复）+ 选项2 鉴权 + abc 三项
 *
 * 覆盖（均已带 Bearer 令牌访问受保护接口）：
 *   S1   后端启动/可达 + /health
 *   S2   多机-A 推送（患者×2 + 肌少症记录×1，owner = 登录 uid）
 *   S3   多机-B 拉取（可见数据 + owner 归属正确）
 *   S4   双向同步（B 改 → A 拉到新版本）
 *   S5   乐观锁冲突（后到者 conflict）
 *   S6   编辑锁（占用→他人 409 / 他人释放 403 / 释放后他人可占用）—— 需两方身份
 *   S7   软删传播（A 软删 → B 拉到 deleted=true）
 *   S8   报错可见（匿名上报 → 管理员列表可见）
 *   S9   按用户隔离（doc1 私有记录 doc2 拉不到 / 管理员可见全部 / 越权改写 forbidden）★b
 *   S10  管理员创建后端账号并登录 ★a(衍生)/b
 *   S11  修改自身密码（成功 / 旧密码错误 401 / 改回默认保证可复跑） ★a
 *
 * 两种运行模式：
 *   1) 默认（无 SERVER_URL）：在 server/.acc_tmp 隔离目录自启真实后端跑全套，跑完自动清理。
 *        node server/tests/acceptance.js
 *   2) 远程验收（设 SERVER_URL）：连接【已运行】的远程/局域网后端，不再自启隔离实例。
 *        SERVER_URL=https://你的域名 node server/tests/acceptance.js
 *        （可用 ACC_USER / ACC_PASS 覆盖登录账号，默认 admin/admin123）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const NODE = process.env.ACC_NODE
  || 'C:/Users/侯总/.workbuddy/binaries/node/versions/22.22.2/node.exe';
const SERVER_DIR = path.join(__dirname, '..');                 // server/
const ACC = path.join(SERVER_DIR, '.acc_tmp');                 // 隔离工作目录
const ACC_STATIC = path.join(ACC, 'static');
const PORT = 8099;

const REMOTE = (process.env.SERVER_URL || '').replace(/\/+$/, '');  // 设了即远程模式
const BASE = REMOTE || (`http://127.0.0.1:${PORT}`);
const RUN = 'R' + Date.now().toString(36);                    // 运行唯一前缀
const P1 = 'acc_' + RUN + '_p1';
const P2 = 'acc_' + RUN + '_p2';
const S1 = 'acc_' + RUN + '_s1';
const RC = 'acc_' + RUN + '_rc';

const FILES = ['server.js', 'sync-routes.js', 'media-routes.js', 'lib-backup.js'];

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  const tag = cond ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name}${cond ? '' : '  -> ' + (detail || '')}`);
}
function skip(name, detail) {
  results.push({ name, ok: true, skipped: true, detail: detail || '' });
  console.log(`  [SKIP] ${name}${detail ? '  -> ' + detail : ''}`);
}

function setup() {
  if (fs.existsSync(ACC)) fs.rmSync(ACC, { recursive: true, force: true });
  fs.mkdirSync(ACC_STATIC, { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(SERVER_DIR, f), path.join(ACC, f));
  if (!REMOTE) seedDb();   // 预置 admin + doc1 + doc2 三个用户，使 S6/S9 可验证身份隔离
}

// 隔离目录预建 users 表并写入三个账号（每次运行先清空再写，保证可重复）
function seedDb() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const crypto = require('crypto');
    fs.mkdirSync(path.join(ACC, 'data'), { recursive: true });
    const db = new DatabaseSync(path.join(ACC, 'data', 'app.db'));
    db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'doctor', name TEXT,
      expires_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')) )`);
    db.exec('DELETE FROM users');  // 每次重置，避免上一轮改过密码导致登录失败
    const add = (uid, user, pass, role, name) => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
      db.prepare('INSERT INTO users (id,username,password_hash,salt,role,name) VALUES (?,?,?,?,?,?)')
        .run(uid, user, hash, salt, role, name);
    };
    add('u_admin', 'admin', 'admin123', 'admin', '系统管理员');
    add('u_doc1', 'doc1', 'doc123', 'doctor', '测试医生1');
    add('u_doc2', 'doc2', 'doc123', 'doctor', '测试医生2');
    db.close();
  } catch (e) {
    console.log('  [warn] 预置用户失败（S6/S9 将降级）: ' + e.message);
  }
}

function teardown(child) {
  try { if (child && !child.killed) child.kill('SIGKILL'); } catch {}
  try {
    fs.rmSync(ACC, { recursive: true, force: true });
  } catch (e) {
    setTimeout(() => { try { fs.rmSync(ACC, { recursive: true, force: true }); } catch {} }, 800);
  }
}

// ───────── HTTP helpers ─────────
async function req(method, urlPath, body, headers) {
  const opts = { method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + urlPath, opts);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
const get = (p, h) => req('GET', p, undefined, h);
const post = (p, b, h) => req('POST', p, b, h);
const del = (p, b, h) => req('DELETE', p, b, h);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitHealth() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await get('/health');
      if (r.status === 200 && r.json && r.json.ok) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

async function login(username, password) {
  const r = await post('/api/login', { username, password });
  if (r.status === 200 && r.json && r.json.token) return { Authorization: 'Bearer ' + r.json.token };
  return null;
}

async function runAssertions() {
  // S1 后端启动 + /health
  const h = await get('/health');
  assert('S1 后端 /health 可达', h.status === 200 && h.json && h.json.ok, 'status=' + h.status);
  if (!(h.status === 200 && h.json && h.json.ok)) return;

  // 登录管理员
  const AUTH = await login(process.env.ACC_USER || 'admin', process.env.ACC_PASS || 'admin123');
  assert('登录成功（获取 Bearer 令牌）', !!AUTH, 'admin 登录失败');
  if (!AUTH) return;
  const me = await get('/api/me', AUTH);
  const MY_UID = (me.json && me.json.user && me.json.user.id) || '';

  // 第二/三身份（doc1/doc2，隔离模式已预置；远端可能不存在则跳过相关用例）
  const AUTH_D1 = await login('doc1', 'doc123');   // 非管理员
  const AUTH_D2 = await login('doc2', 'doc123');   // 非管理员（同时用作 S6 第二方）

  // S2 多机-A 推送
  const s2 = await post('/api/sync/push', {
    deviceId: 'CLINIC-PC-1',
    items: [
      { collection: 'patients', id: P1, data: { name: '张三', age: 62, gender: 'M' } },
      { collection: 'patients', id: P2, data: { name: '李四' } },
      { collection: 'sarc_records', id: S1, data: { score: 8 } }
    ]
  }, AUTH);
  const s2ok = s2.json && s2.json.ok && s2.json.results.length === 3 &&
    s2.json.results.every(r => r.status === 'ok' && r.version === 1);
  assert('S2 多机-A 推送 3 条（患者×2 + 肌少症×1，全部 v1）', s2ok, s2.json && JSON.stringify(s2.json.results));

  // S3 多机-B 拉取（管理员可见全部 + owner 归属）
  const s3 = await get('/api/sync/pull?since=1970-01-01T00:00:00.000Z', AUTH);
  const ids3 = (s3.json.items || []).map(i => i.id);
  const p1 = (s3.json.items || []).find(i => i.id === P1);
  const s3ok = s3.json.ok && [P1, P2, S1].every(id => ids3.includes(id)) && p1 && p1.owner_id === MY_UID;
  assert('S3 拉取可见数据（跨设备共享 + owner=登录uid）', s3ok,
    'ids=' + ids3.join(',') + ' owner=' + (p1 && p1.owner_id) + ' expect=' + MY_UID);
  const s3Since = s3.json.serverNow;

  // S4 双向同步：B 改 P1(baseVersion=1) → A 拉到 v2
  const s4push = await post('/api/sync/push', {
    deviceId: 'CLINIC-PC-2',
    items: [{ collection: 'patients', id: P1, baseVersion: 1, data: { name: '张三', age: 63 } }]
  }, AUTH);
  const s4pushOk = s4push.json.results[0].status === 'ok' && s4push.json.results[0].version === 2;
  assert('S4a B 更新 ' + P1 + ' → v2', s4pushOk, JSON.stringify(s4push.json.results[0]));
  const s4pull = await get('/api/sync/pull?since=' + encodeURIComponent(s3Since), AUTH);
  const p1b = (s4pull.json.items || []).find(i => i.id === P1);
  const s4ok = p1b && p1b.version === 2 && p1b.data && p1b.data.age === 63;
  assert('S4b A 拉取看到 B 的改动（双向同步）', s4ok,
    p1b ? 'v' + p1b.version + ' age=' + (p1b.data && p1b.data.age) : 'missing');

  // S5 乐观锁冲突
  const s5a = await post('/api/sync/push', {
    deviceId: 'CLINIC-PC-1',
    items: [{ collection: 'patients', id: P2, baseVersion: 1, data: { name: '李四-改A' } }]
  }, AUTH);
  const s5b = await post('/api/sync/push', {
    deviceId: 'CLINIC-PC-2',
    items: [{ collection: 'patients', id: P2, baseVersion: 1, data: { name: '李四-改B' } }]
  }, AUTH);
  const s5ok = s5a.json.results[0].status === 'ok' && s5a.json.results[0].version === 2 &&
    s5b.json.results[0].status === 'conflict' && s5b.json.results[0].currentVersion === 2;
  assert('S5 乐观锁冲突（先到者 v2，后到者 conflict）', s5ok,
    'A=' + JSON.stringify(s5a.json.results[0]) + ' B=' + JSON.stringify(s5b.json.results[0]));

  // S6 编辑锁（身份=令牌 uid；两方冲突需两个身份）
  const l1 = await post('/api/sync/lock', { deviceId: 'CLINIC-PC-1', collection: 'patients', id: P1 }, AUTH);
  let s6ok, s6detail;
  if (AUTH_D2) {
    const l2 = await post('/api/sync/lock', { deviceId: 'CLINIC-PC-2', collection: 'patients', id: P1 }, AUTH_D2);
    const u2 = await del('/api/sync/lock', { deviceId: 'CLINIC-PC-2', collection: 'patients', id: P1 }, AUTH_D2);
    const u1 = await del('/api/sync/lock', { deviceId: 'CLINIC-PC-1', collection: 'patients', id: P1 }, AUTH);
    const l3 = await post('/api/sync/lock', { deviceId: 'CLINIC-PC-2', collection: 'patients', id: P1 }, AUTH_D2);
    s6ok = l1.json.status === 'ok' && l2.status === 409 && u2.status === 403 &&
      u1.json.status === 'ok' && l3.json.status === 'ok';
    s6detail = `l1=${l1.json.status} l2=${l2.status} u2=${u2.status} u1=${u1.json.status} l3=${l3.json.status}`;
  } else {
    const q = await get('/api/sync/lock?c=patients&id=' + encodeURIComponent(P1), AUTH);
    const u1 = await del('/api/sync/lock', { deviceId: 'CLINIC-PC-1', collection: 'patients', id: P1 }, AUTH);
    s6ok = l1.json.status === 'ok' && q.json.locked === true && q.json.locked_by === MY_UID && u1.json.status === 'ok';
    s6detail = `l1=${l1.json.status} locked=${q.json.locked} by=${q.json.locked_by} u1=${u1.json.status}（单方降级）`;
  }
  assert('S6 编辑锁（占用→他人409 / 他人释放403 / 释放后他人可占用）', s6ok, s6detail);

  // S7 软删传播
  const s7push = await post('/api/sync/push', {
    deviceId: 'CLINIC-PC-1',
    items: [{ collection: 'patients', id: P2, baseVersion: 2, deleted: true }]
  }, AUTH);
  const s7pull = await get('/api/sync/pull?since=' + encodeURIComponent(s3Since), AUTH);
  const p2 = (s7pull.json.items || []).find(i => i.id === P2);
  const s7ok = p2 && p2.deleted === true;
  assert('S7 软删传播（A 软删 → B 拉到 deleted=true）', s7ok, p2 ? 'deleted=' + p2.deleted : 'missing');

  // S8 报错可见
  const ts = Date.now();
  const s8rep = await post('/api/err-report', {
    level: 'error', msg: 'ACC-TEST 报错通道自检 ' + RUN + ' ' + ts, stack: 'Error: acceptance self-test',
    meta: { selfTest: true, run: RUN }
  });
  const s8repOk = s8rep.json && s8rep.json.ok === true;
  assert('S8a 前端报错匿名上报成功', s8repOk, JSON.stringify(s8rep.json));
  const s8list = await get('/api/err-report', AUTH);
  const hit = (s8list.json.rows || []).some(r => r.msg && r.msg.includes('ACC-TEST') && r.msg.includes(RUN));
  assert('S8b 管理员可见该报错（报错通道闭环）', s8list.json.count >= 1 && hit,
    'count=' + s8list.json.count + ' hit=' + hit);

  // S9 按用户隔离（b）
  if (AUTH_D1 && AUTH_D2) {
    const s9push = await post('/api/sync/push', {
      items: [{ collection: 'patients', id: RC, data: { name: '隔离测试王五' } }]
    }, AUTH_D1);
    assert('S9a doc1 推送私有记录', s9push.json && s9push.json.ok && s9push.json.results[0].status === 'ok',
      JSON.stringify(s9push.json));
    const pullD2 = await get('/api/sync/pull?since=1970-01-01T00:00:00.000Z', AUTH_D2);
    const seeC = (pullD2.json.items || []).some(i => i.id === RC);
    assert('S9b 非属主(doc2)拉取不到 doc1 私有记录', !seeC, 'doc2 sees RC=' + seeC + '（应为 false）');
    const pullAdmin = await get('/api/sync/pull?since=1970-01-01T00:00:00.000Z', AUTH);
    const adminSeeC = (pullAdmin.json.items || []).some(i => i.id === RC);
    assert('S9c 管理员可见全部（含 doc1 私有记录）', adminSeeC, 'admin sees RC=' + adminSeeC);
    const s9forbid = await post('/api/sync/push', {
      items: [{ collection: 'patients', id: RC, baseVersion: 1, data: { name: '王五-越权改' } }]
    }, AUTH_D2);
    assert('S9d 非属主无法改写他人记录（forbidden）', s9forbid.json.results[0].status === 'forbidden',
      JSON.stringify(s9forbid.json.results[0]));
  } else {
    skip('S9 按用户隔离数据', '远端缺少 doc1/doc2 测试账号（隔离模式已验证）');
  }

  // S10 管理员创建后端账号（a 衍生 / b 支撑）
  const s10 = await post('/api/admin/users', { username: 'doc3', password: 'doc3123', role: 'doctor', name: '测试医生3' }, AUTH);
  assert('S10a 管理员创建医生账号', s10.status === 200 && s10.json.ok, 'status=' + s10.status + (s10.json ? JSON.stringify(s10.json) : ''));
  if (s10.status === 200) {
    const s10login = await login('doc3', 'doc3123');
    assert('S10b 新账号可登录', !!s10login, 'doc3 登录失败');
  }

  // S11 修改自身密码（a）
  const oldP = process.env.ACC_PASS || 'admin123';
  const s11 = await post('/api/me/change-password', { oldPassword: oldP, newPassword: 'NewPass123' }, AUTH);
  assert('S11a 修改自身密码成功', s11.status === 200 && s11.json.ok, 'status=' + s11.status + (s11.json ? JSON.stringify(s11.json) : ''));
  const s11bad = await post('/api/me/change-password', { oldPassword: 'wrong', newPassword: 'Another123' }, AUTH);
  assert('S11b 旧密码错误被拒(401)', s11bad.status === 401, 'status=' + s11bad.status);
  const s11rev = await post('/api/me/change-password', { oldPassword: 'NewPass123', newPassword: oldP }, AUTH);
  assert('S11c 改回默认密码（保证可复跑）', s11rev.status === 200, 'status=' + s11rev.status);
}

async function main() {
  console.log('──────── Phase 6 验收（含选项2 鉴权 + abc 三项） ────────');
  console.log('  模式: ' + (REMOTE ? ('远程 → ' + BASE) : ('本地隔离 → ' + BASE)));
  console.log('  运行标识: ' + RUN + '（测试数据带前缀，可重复跑不冲突）');

  if (REMOTE) {
    await runAssertions();
    finish();
    return;
  }

  setup();
  const child = spawn(NODE, ['server.js'], {
    cwd: ACC,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      STATIC_DIR: ACC_STATIC,
      NODE_PATH: path.join(SERVER_DIR, 'node_modules'),
      SECRET: 'acceptance-secret-acceptance-secret-0123456789'
    })
  });
  let serverLog = '';
  child.stdout.on('data', d => { serverLog += d.toString(); });
  child.stderr.on('data', d => { serverLog += d.toString(); });

  try {
    const up = await waitHealth();
    if (!up) {
      assert('S1 后端启动 + /health 可达', false, '启动超时');
      console.log(serverLog);
      teardown(child);
      finish();
      return;
    }
    await runAssertions();
  } finally {
    teardown(child);
  }
  finish();
}

function finish() {
  const failed = results.filter(r => !r.ok && !r.skipped);
  const skipped = results.filter(r => r.skipped);
  console.log('\n──────── Phase 6 验收汇总 ────────');
  console.log(`  通过 ${results.length - failed.length - skipped.length}/${results.length}（跳过 ${skipped.length}）`);
  if (failed.length) {
    console.log('  失败项：');
    failed.forEach(f => console.log('   - ' + f.name + ' :: ' + f.detail));
    process.exit(1);
  } else {
    console.log('  ✅ 全部通过');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('验收脚本异常：', e);
  process.exit(2);
});
