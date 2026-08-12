/**
 * 鹊动FAC功能评估与干预系统 - 数据访问层
 * 默认使用 localStorage 本地存储实现完整业务闭环
 * 如需接入 Supabase，可替换本层实现
 */

const DB_PREFIX = 'quedong_wm_';

function storageKey(key) {
  return DB_PREFIX + key;
}

function getJSON(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    console.error('getJSON error', key, e);
    return defaultValue;
  }
}

function setJSON(key, value) {
  localStorage.setItem(storageKey(key), JSON.stringify(value));
}

// 初始化默认数据
function initDefaults() {
  if (!getJSON('users')) {
    setJSON('users', [
      {
        id: 1,
        username: 'admin',
        password: 'admin123',
        displayName: '超级管理员',
        role: 'superadmin',
        phone: '',
        status: 'active',
        aiMode: true,
        createdAt: new Date().toISOString(),
        lastLogin: null
      },
      {
        id: 2,
        username: 'doctor',
        password: 'doctor123',
        displayName: '演示医生',
        role: 'doctor',
        phone: '13800138000',
        status: 'active',
        aiMode: false,
        createdAt: new Date().toISOString(),
        lastLogin: null
      }
    ]);
  }
  if (!getJSON('patients')) {
    setJSON('patients', []);
  }
  if (!getJSON('systemConfig')) {
    setJSON('systemConfig', {
      id: 1,
      orgName: '鹊动FAC功能中心',
      systemTitle: '鹊动FAC功能评估与干预系统',
      logoUrl: '',
      defaultStage: 'standard',
      defaultActivityLevel: 'sedentary',
      minPasswordLength: 6,
      sessionTimeout: 60,
      updatedAt: new Date().toISOString()
    });
  }
}

initDefaults();
// 迁移：确保系统中至少存在一名超级管理员（超级管理员账号管理模块的前置条件）
ensureSuperAdmin();

/**
 * 角色判定工具（全局可用，供 NAV 过滤 / 路由守卫 / 数据隔离 / AI 开关等复用）
 * - isAdminRole: 管理员及以上（admin 或 superadmin）都视为「管理员身份」，继承全部管理员能力
 * - isSuperRole: 仅超级管理员
 * 入参可为 user 对象或 role 字符串
 */
function isAdminRole(u) {
  const role = u && typeof u === 'object' ? u.role : u;
  return role === 'admin' || role === 'superadmin';
}
function isSuperRole(u) {
  const role = u && typeof u === 'object' ? u.role : u;
  return role === 'superadmin';
}
window.isAdminRole = isAdminRole;
window.isSuperRole = isSuperRole;

function ensureSuperAdmin() {
  try {
    const users = getJSON('users', []);
    if (users.some(u => u.role === 'superadmin')) return;
    // 优先把默认 admin 账号提升为超级管理员；否则提升第一个管理员账号
    const target = users.find(u => u.username === 'admin') || users.find(u => u.role === 'admin');
    if (target) {
      target.role = 'superadmin';
      setJSON('users', users);
      console.info('[migrate] 已将账号', target.username, '提升为超级管理员');
    }
  } catch (e) { console.error('ensureSuperAdmin 迁移失败', e); }
}

// ================= 方案库媒体（IndexedDB 存 Blob，突破 localStorage 配额限制） =================
// 文本元数据（名称/规则/外链 URL）仍存 localStorage；视频/图片等大文件以 Blob 存 IndexedDB，
// meta 里用 '__local__' 标记该媒体存于本地 IndexedDB（按方案 id 取）。
const MEDIA_DB_NAME = 'quedong_wm_media';
const MEDIA_STORE = 'plan_media';
let _mediaDB = null;
// 媒体上传/删除钩子（由 Sync 引擎注册；保存/删除时触发，业务调用点零感知）
const _mediaHooks = { onSave: null, onDelete: null };

function openMediaDB() {
  return new Promise((resolve, reject) => {
    if (_mediaDB) return resolve(_mediaDB);
    if (!('indexedDB' in window)) return reject(new Error('当前浏览器不支持 IndexedDB'));
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _mediaDB = req.result; resolve(_mediaDB); };
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
  });
}

function idbTx(mode) {
  return openMediaDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, mode);
    tx.oncomplete = () => resolve(tx);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('事务被中止'));
    resolve(tx);
  }));
}

async function idbPut(id, value) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put({ id, video: null, image: null, ...value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(id) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const r = tx.objectStore(MEDIA_STORE).get(id);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

  async function idbDelete(id) {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ================= 通用大对象记录库（IndexedDB，突破 localStorage 5MB 配额） =================
  // 用于存放患者报告/图片等大 Blob 或大体量 JSON，避免挤占 localStorage。
  // 文本元数据（名称/类型等）仍存 localStorage，仅大负载走本库。
  const REC_DB_NAME = 'quedong_wm_records';
  const REC_STORE = 'records';
  let _recDB = null;

  function openRecordsDB() {
    return new Promise((resolve, reject) => {
      if (_recDB) return resolve(_recDB);
      if (!('indexedDB' in window)) return reject(new Error('当前浏览器不支持 IndexedDB'));
      const req = indexedDB.open(REC_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(REC_STORE)) {
          db.createObjectStore(REC_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { _recDB = req.result; resolve(_recDB); };
      req.onerror = () => reject(req.error || new Error('记录库 IndexedDB 打开失败'));
    });
  }

  async function recPut(id, value) {
    const db = await openRecordsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, 'readwrite');
      tx.objectStore(REC_STORE).put({ id: id, value: value, updatedAt: new Date().toISOString() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function recGet(id) {
    const db = await openRecordsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, 'readonly');
      const r = tx.objectStore(REC_STORE).get(id);
      r.onsuccess = () => resolve(r.result ? r.result.value : null);
      r.onerror = () => reject(r.error);
    });
  }

  async function recDelete(id) {
    const db = await openRecordsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(REC_STORE, 'readwrite');
      tx.objectStore(REC_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

const DB = {
  // ================= 用户账号 =================
  async getUsers() {
    return getJSON('users', []);
  },

  async findUserByUsername(username) {
    const users = await this.getUsers();
    return users.find(u => u.username === username) || null;
  },

  async createUser(userData) {
    const users = await this.getUsers();
    const exists = users.find(u => u.username === userData.username);
    if (exists) throw new Error('用户名已存在');

    const newUser = {
      id: Date.now(),
      username: userData.username,
      password: userData.password,
      displayName: userData.displayName,
      /* 角色白名单：doctor / admin / superadmin；非法或缺失时回退为 doctor */
      role: ['doctor', 'admin', 'superadmin'].includes(userData.role) ? userData.role : 'doctor',
      phone: userData.phone || '',
      status: userData.status || 'active',
      createdAt: userData.createdAt || new Date().toISOString(),
      /* 医生账号使用期限：ISO 字符串（建议当天 23:59:59），为空表示永久有效 */
      expireAt: userData.expireAt || null,
      /* 冻结原因：'manual' 管理员手动冻结 / 'expired' 到期自动冻结 */
      frozenReason: userData.frozenReason || null,
      /* 医生科室（如：内分泌科）与所属分组 id 列表，供资讯推送范围选择使用 */
      dept: userData.dept || '',
      groupIds: userData.groupIds || [],
      /* AI 辅助模式：true=该账号可使用 AI 功能（报告解读/方案推荐/AI 解析），
         false=仅使用原系统功能；聊天对话（小Qoo问答）不受此开关影响。默认关闭。 */
      aiMode: userData.aiMode || false,
      lastLogin: null
    };
    users.push(newUser);
    setJSON('users', users);
    return newUser;
  },

  async updateUser(id, updates) {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('用户不存在');
    users[idx] = { ...users[idx], ...updates };
    setJSON('users', users);
    return users[idx];
  },

  async deleteUser(id) {
    const users = await this.getUsers();
    const filtered = users.filter(u => u.id !== id);
    setJSON('users', filtered);
  },

  async updateLastLogin(username) {
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.username === username);
    if (idx !== -1) {
      users[idx].lastLogin = new Date().toISOString();
      setJSON('users', users);
    }
  },

  /* ================= 同步读取（供资讯推送等同步上下文使用） ================= */
  getUsersSync() { return getJSON('users', []); },
  setUsersSync(list) { setJSON('users', list); return list; },
  getDoctorGroupsSync() { return getJSON('doctorGroups', []); },

  /* ================= 医生科室 / 分组（与资讯推送模块共享数据源） =================
   * 分组对象：{ id, name }
   * 成员关系存储在用户记录的 groupIds 上，删除分组时自动从所有用户剥离。
   * 该对象同步读写 localStorage，供 admin.js 与 infopush.js 共用，天然双向同步。
   */
  getDoctorGroups() { return getJSON('doctorGroups', []); },
  saveDoctorGroup(g) {
    const all = getJSON('doctorGroups', []);
    const i = all.findIndex(x => x.id === g.id);
    if (i >= 0) all[i] = g; else all.push(g);
    setJSON('doctorGroups', all);
    return g;
  },
  removeDoctorGroup(id) {
    setJSON('doctorGroups', getJSON('doctorGroups', []).filter(x => x.id !== id));
    const users = getJSON('users', []);
    setJSON('users', users.map(u => ({ ...u, groupIds: (u.groupIds || []).filter(g => g !== id) })));
  },
  getDoctors() {
    return getJSON('users', []).filter(u => u.role === 'doctor')
      .map(u => ({ username: u.username, displayName: u.displayName, dept: u.dept || '', groupIds: u.groupIds || [] }));
  },

  // ================= 患者档案 =================

  // ================= 患者档案 =================
  // 患者档案编码：QD-HET-00001 ~ QD-HET-99999，最大 99999 人
  _nextPatientCode(patients) {
    const nums = patients.map(p => {
      const m = String(p.patientCode || '').match(/^QD-HET-(\d{5})$/);
      return m ? parseInt(m[1], 10) : 0;
    }).filter(n => n > 0);
    const max = nums.length ? Math.max(...nums) : 0;
    if (max >= 99999) return null;
    return 'QD-HET-' + String(max + 1).padStart(5, '0');
  },
  getPatients() {
    let patients = getJSON('patients', []);
    // 为旧数据自动补编码（按创建时间排序）
    let changed = false;
    patients.filter(p => !p.patientCode).sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).forEach(p => {
      const code = this._nextPatientCode(patients);
      if (code) { p.patientCode = code; changed = true; }
    });
    if (changed) setJSON('patients', patients);
    return patients;
  },

  getPatientsByDoctor(username) {
    const patients = this.getPatients();
    if (!username) return patients;
    return patients.filter(p => p.doctorUsername === username);
  },

  getPatientById(id) {
    const patients = this.getPatients();
    return patients.find(p => p.id === id) || null;
  },

  async createPatient(patientData) {
    const patients = await this.getPatients();
    if (patients.length >= 99999) throw new Error('患者档案数量已达上限 99999 人，无法继续新增');
    const patientCode = this._nextPatientCode(patients);
    if (!patientCode) throw new Error('患者档案编号已用完（QD-HET-99999），无法继续新增');
    const newPatient = {
      id: 'P' + Date.now(),
      patientCode,
      doctorUsername: patientData.doctorUsername,
      patientName: patientData.patientName,
      data: patientData.data || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    patients.push(newPatient);
    setJSON('patients', patients);
    return newPatient;
  },

  async updatePatient(id, data) {
    const patients = await this.getPatients();
    const idx = patients.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('患者不存在');
    patients[idx].data = { ...patients[idx].data, ...data };
    patients[idx].updatedAt = new Date().toISOString();
    setJSON('patients', patients);
    return patients[idx];
  },

  async saveFullPatient(patient) {
    const patients = await this.getPatients();
    const idx = patients.findIndex(p => p.id === patient.id);
    if (idx === -1) {
      patients.push({ ...patient, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    } else {
      patients[idx] = { ...patient, updatedAt: new Date().toISOString() };
    }
    setJSON('patients', patients);
    return patient;
  },

  // ================= 系统配置 =================
  async getSystemConfig() {
    return getJSON('systemConfig', {});
  },

  async updateSystemConfig(config) {
    const current = await this.getSystemConfig();
    const updated = { ...current, ...config, updatedAt: new Date().toISOString() };
    setJSON('systemConfig', updated);
    return updated;
  },

  // ================= 自定义设备档案 =================
  async getCustomDevices() {
    return getJSON('customDevices', []);
  },

  async saveCustomDevices(list) {
    setJSON('customDevices', list);
    return list;
  },

  // ================= 智能运动方案库 =================
  // 文本元数据存 localStorage（兼容 await 调用）；视频/图片等大文件见下方 getPlanMedia/savePlanMedia
  async getPlanLibrary() {
    return getJSON('planLibrary', []) || [];
  },

  async savePlanLibrary(list) {
    setJSON('planLibrary', list);
    return list;
  },

  // 媒体同步钩子注册（Sync 引擎调用；onSave(id,video,image) / onDelete(id)）
  registerMediaHook(h) { Object.assign(_mediaHooks, h || {}); },
  // 读取某个方案动作本地存储的视频/图片 Blob（video/image 为 Blob 或 null）
  async getPlanMedia(id) {
    try { return await idbGet(id); } catch (e) { console.error('getPlanMedia 失败:', e); return null; }
  },
  // 仅写 IndexedDB，不触发上传钩子（供 Sync 引擎下载媒体后回写本地）
  async writePlanMediaLocal(id, videoBlob, imageBlob) {
    await idbPut(id, { id, video: videoBlob || null, image: imageBlob || null });
    return true;
  },
  // 列出本地全部媒体记录（首次接入后端时补齐上传用）
  async getAllPlanMedia() {
    const db = await openMediaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE, 'readonly');
      const out = [];
      tx.objectStore(MEDIA_STORE).openCursor().onsuccess = (ev) => {
        const cur = ev.target.result;
        if (cur) { out.push(cur.value); cur.continue(); } else resolve(out);
      };
      tx.onerror = () => reject(tx.error);
    });
  },
  async savePlanMedia(id, videoBlob, imageBlob) {
    await idbPut(id, { id, video: videoBlob || null, image: imageBlob || null });
    if (_mediaHooks.onSave) { try { _mediaHooks.onSave(id, videoBlob || null, imageBlob || null); } catch (e) { console.error('media onSave 钩子失败:', e); } }
    return true;
  },
  async deletePlanMedia(id) {
    try { await idbDelete(id); } catch (e) { console.error('deletePlanMedia 失败:', e); }
    if (_mediaHooks.onDelete) { try { _mediaHooks.onDelete(id); } catch (e) { console.error('media onDelete 钩子失败:', e); } }
  },

  // 通用大对象记录（患者报告/图片等走 IndexedDB，规避 localStorage 配额）
  async putRecord(id, value) { return recPut(id, value); },
  async getRecord(id) { return recGet(id); },
  async deleteRecord(id) { return recDelete(id); },

  // ================= 工具方法 =================
  async clearLocalCache() {
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith(DB_PREFIX)) {
        localStorage.removeItem(k);
      }
    });
    initDefaults();
  },

  async exportAllData() {
    return {
      users: await this.getUsers(),
      patients: await this.getPatients(),
      systemConfig: await this.getSystemConfig(),
      exportedAt: new Date().toISOString()
    };
  },

  async importAllData(data) {
    if (data.users) setJSON('users', data.users);
    if (data.patients) setJSON('patients', data.patients);
    if (data.systemConfig) setJSON('systemConfig', data.systemConfig);
  }
};

// 兼容需求文档中的 db.js 接口命名（下划线转驼峰）
window.DB = DB;

/* ================= 共享医生分组管理（同步 API） =================
 * 与「系统管理后台 - 账号管理」「资讯推送 - 医生分组与接收人」共用同一份数据：
 *   - 分组存储于 localStorage 键 quedong_wm_doctorGroups
 *   - 成员关系存储在用户记录的 groupIds 上
 * 任一模块修改都会即时反映到另一模块（双向联动）。
 */
const DoctorGroups = {
  list() { return getJSON('doctorGroups', []); },
  get(id) { return getJSON('doctorGroups', []).find(g => g.id === id) || null; },
  save(g) {
    const all = getJSON('doctorGroups', []);
    const i = all.findIndex(x => x.id === g.id);
    if (i >= 0) all[i] = g; else all.push(g);
    setJSON('doctorGroups', all);
    return g;
  },
  remove(id) {
    setJSON('doctorGroups', getJSON('doctorGroups', []).filter(x => x.id !== id));
    const users = getJSON('users', []);
    setJSON('users', users.map(u => ({ ...u, groupIds: (u.groupIds || []).filter(g => g !== id) })));
  },
  members(id) { return getJSON('users', []).filter(u => (u.groupIds || []).includes(id)); },
  addMember(username, gid) {
    const users = getJSON('users', []);
    const u = users.find(x => x.username === username);
    if (u) { u.groupIds = u.groupIds || []; if (!u.groupIds.includes(gid)) u.groupIds.push(gid); setJSON('users', users); }
  },
  removeMember(username, gid) {
    const users = getJSON('users', []);
    const u = users.find(x => x.username === username);
    if (u) { u.groupIds = (u.groupIds || []).filter(g => g !== gid); setJSON('users', users); }
  }
};
window.DoctorGroups = DoctorGroups;
