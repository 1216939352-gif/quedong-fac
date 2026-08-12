/**
 * 鹊动FAC功能评估与干预系统
 * ────────────────────────────────────────────────────────────────
 * 【独立模块】老年人体重管理 & 肌少症专项 —— 核心数据层 / 评估引擎 / 干预方案库
 *
 * 数据隔离规则（需求文档 §8.1 / §9.3）：
 *   本模块所有评估数据、问卷数据、干预方案、随访记录、报表数据完全独立隔离，
 *   使用专属 localStorage 前缀 qd_sarcopenia_，不写入生活方式干预模块数据库。
 *   本模块拥有【独立首诊登记档案】（姓名/性别/年龄/身高体重/BMI/人体成分基线），
 *   不与系统基础用户档案共享、不回写，实现真正的平行独立核心模块。
 * ────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ==================================================================
   * 1. 独立数据层（专属命名空间，与 quedong_wm_ 完全解耦）
   * ================================================================== */
  const PREFIX = 'qd_sarcopenia_';
  const K_RECORDS = PREFIX + 'records';
  const K_SEQ = PREFIX + 'seq';
  const K_DRAFT = PREFIX + 'draft';
  const K_PATIENTS = PREFIX + 'patients';
  const K_EXLIB = PREFIX + 'exercise_library';

  function rd(key, def) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; }
    catch (e) { console.error('[肌少症模块] 读取失败', key, e); return def; }
  }
  function wr(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[肌少症模块] 写入失败', key, e); return false; }
  }

  const SarcDB = {
    /** 全部评估记录（本模块独立台账） */
    list() { return rd(K_RECORDS, []) || []; },

    /** 按患者档案 ID 查询，按评估日期倒序 */
    listByPatient(pid) {
      if (pid == null) return [];
      return this.list()
        .filter(r => String(r.patientId) === String(pid))
        .sort((a, b) => new Date(b.assessDate || b.createdAt) - new Date(a.assessDate || a.createdAt));
    },

    byId(id) { return this.list().find(r => r.id === id) || null; },

    /** 生成本模块独立评估编号 */
    nextNo() {
      const n = (rd(K_SEQ, 0) || 0) + 1;
      wr(K_SEQ, n);
      return 'SARC-' + String(n).padStart(5, '0');
    },

    save(rec) {
      const all = this.list();
      const now = new Date().toISOString();
      rec.updatedAt = now;
      const i = all.findIndex(r => r.id === rec.id);
      if (i >= 0) all[i] = rec;
      else { rec.createdAt = rec.createdAt || now; all.push(rec); }
      wr(K_RECORDS, all);
      return rec;
    },

    remove(id) { wr(K_RECORDS, this.list().filter(r => r.id !== id)); },

    clearAll() { wr(K_RECORDS, []); wr(K_SEQ, 0); localStorage.removeItem(K_DRAFT); this.clearPatients(); },

    /* —— 独立首诊登记档案（不共享系统用户档案）—— */
    listPatients() { return rd(K_PATIENTS, []) || []; },
    getPatient(id) { return this.listPatients().find(p => p.id === id) || null; },
    savePatient(p) {
      if (!p || typeof p !== 'object') return null;
      const all = this.listPatients();
      const now = new Date().toISOString();
      if (!p.id) p.id = 'sarcp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      p.updatedAt = now; p.createdAt = p.createdAt || now;
      if (!p.body || typeof p.body !== 'object') p.body = {};
      const i = all.findIndex(x => x.id === p.id);
      if (i >= 0) all[i] = p; else all.push(p);
      wr(K_PATIENTS, all);
      return p;
    },
    removePatient(id) { wr(K_PATIENTS, this.listPatients().filter(p => p.id !== id)); },
    clearPatients() { wr(K_PATIENTS, []); },

    /* —— 居家徒手动作库（36 个，用于智能匹配推荐）—— */
    getExerciseLibrary() { return rd(K_EXLIB, []) || []; },
    saveExerciseLibrary(list) { wr(K_EXLIB, list); return list; },

    /* 草稿（评估中断可续填） */
    getDraft() { return rd(K_DRAFT, null); },
    saveDraft(d) { wr(K_DRAFT, d); },
    clearDraft() { localStorage.removeItem(K_DRAFT); },

    /** 独立导出（不与生活方式模块合并） */
    exportAll() {
      return { module: 'elderly-sarcopenia', version: 1, records: this.list(), exportedAt: new Date().toISOString() };
    },
    importAll(data) {
      if (data && Array.isArray(data.records)) { wr(K_RECORDS, data.records); return true; }
      return false;
    },

    /* 外部人体成分报告归档（IndexedDB，键前缀独立） */
    async saveReportFile(recordId, blob) {
      if (!window.DB || !DB.savePlanMedia) return false;
      await DB.savePlanMedia('sarc-bodyreport-' + recordId, null, blob);
      return true;
    },
    async getReportFile(recordId) {
      if (!window.DB || !DB.getPlanMedia) return null;
      const m = await DB.getPlanMedia('sarc-bodyreport-' + recordId);
      return m ? (m.image || null) : null;
    },
    async deleteReportFile(recordId) {
      if (!window.DB || !DB.deletePlanMedia) return;
      await DB.deletePlanMedia('sarc-bodyreport-' + recordId);
    }
  };

  /* ==================================================================
   * 2. 老年专属阈值（《中国老年肌少症诊疗指南》《老年衰弱与肌少症评估规范》）
   * ================================================================== */
  const TH = {
    minAge: 60,
    calf: { male: 34, female: 33 },        // cm
    grip: { male: 27, female: 18 },        // kg
    gait: 0.8,                              // m/s
    smi: { male: 7.0, female: 5.7 },       // kg/㎡ 四肢骨骼肌指数
    fat: { male: 28, female: 33 },         // % 60岁+体脂率
    visceral: 9                             // 内脏脂肪等级
  };

  function gd(gender) { return gender === 'female' ? 'female' : 'male'; }
  function n(v) { if (v === '' || v == null) return null; const x = parseFloat(v); return isFinite(x) ? x : null; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ==================================================================
   * 3. 四大核心客观指标判定
   * ================================================================== */

  /** 4.1 小腿围 —— 肌肉储备初筛 */
  function evalCalf(val, gender) {
    const t = TH.calf[gd(gender)];
    const v = n(val);
    if (v == null || v <= 0) return { has: false, value: null, t, level: 'na', label: '未测量', desc: '未录入小腿围数据，建议补测以完善肌肉储备初筛。' };
    const ok = v >= t;
    return {
      has: true, value: v, t, ok, low: !ok,
      level: ok ? 'ok' : (v >= t - 2 ? 'warn' : 'bad'),
      label: ok ? '肌肉储备正常' : '肌肉储备偏低',
      desc: ok
        ? `小腿围 ${v} cm ≥ 老年${gender === 'female' ? '女' : '男'}性阈值 ${t} cm，四肢肌肉储备达标。`
        : `小腿围 ${v} cm ＜ 阈值 ${t} cm，提示四肢肌肉储备不足，肌少症初筛阳性，需重点关注下肢肌肉量。`
    };
  }

  /** 4.2 握力 —— 肌力核心判定（辅助筛查指标） */
  function evalGrip(val, gender) {
    const t = TH.grip[gd(gender)];
    const v = n(val);
    if (v == null || v <= 0) return { has: false, value: null, t, level: 'na', label: '未测量', desc: '未录入握力数据。' };
    const ok = v >= t;
    return {
      has: true, value: v, t, ok, low: !ok,
      level: ok ? 'ok' : (v >= t * 0.85 ? 'warn' : 'bad'),
      label: ok ? '肌力正常' : '肌力下降',
      desc: ok
        ? `握力 ${v} kg ≥ 老年${gender === 'female' ? '女' : '男'}性阈值 ${t} kg，上肢肌力达标。`
        : `握力 ${v} kg ＜ 阈值 ${t} kg，提示肌力下降，为肌少症核心阳性指标。`
    };
  }

  /** 4.3 4 米步速 —— 躯体功能 */
  function evalGait(val) {
    const v = n(val);
    if (v == null || v <= 0) return { has: false, value: null, t: TH.gait, level: 'na', label: '未测量', desc: '未录入步速数据。' };
    const ok = v > TH.gait;
    return {
      has: true, value: v, t: TH.gait, ok, low: !ok,
      level: ok ? (v >= 1.0 ? 'ok' : 'ok') : (v >= 0.6 ? 'warn' : 'bad'),
      label: ok ? '躯体功能正常' : '步速减慢·躯体功能衰退',
      desc: ok
        ? `步速 ${v} m/s ＞ 0.8 m/s，日常行走能力与躯体功能正常。`
        : `步速 ${v} m/s ≤ 0.8 m/s，提示躯体功能下降，属肌少症高风险人群。`
    };
  }

  /** 4.4 体成分 —— 精准肌脂判定 */
  function evalBody(b, gender) {
    b = b || {};
    const gg = gd(gender);
    const smi = n(b.smi), fat = n(b.bodyFat), vis = n(b.visceral);
    const smiT = TH.smi[gg], fatT = TH.fat[gg];

    const smiLow = smi != null && smi > 0 ? smi < smiT : null;
    const fatHigh = fat != null && fat > 0 ? fat > fatT : null;
    const visHigh = vis != null && vis > 0 ? vis >= TH.visceral : null;

    const items = [
      {
        key: 'smi', name: '四肢骨骼肌指数 SMI', value: smi, unit: 'kg/㎡', t: smiT,
        level: smi == null ? 'na' : (smiLow ? 'bad' : 'ok'),
        label: smi == null ? '未测' : (smiLow ? '骨骼肌量偏低' : '骨骼肌量达标'),
        rule: `${gg === 'female' ? '女' : '男'}性 ＜ ${smiT} kg/㎡ 为偏低（肌少症确诊核心指标）`
      },
      {
        key: 'fat', name: '体脂率', value: fat, unit: '%', t: fatT,
        level: fat == null ? 'na' : (fatHigh ? 'warn' : 'ok'),
        label: fat == null ? '未测' : (fatHigh ? '体脂率超标' : '体脂率达标'),
        rule: `60 岁+ ${gg === 'female' ? '女' : '男'}性 ＞ ${fatT}% 为超标`
      },
      {
        key: 'visceral', name: '内脏脂肪等级', value: vis, unit: '级', t: TH.visceral,
        level: vis == null ? 'na' : (visHigh ? 'bad' : 'ok'),
        label: vis == null ? '未测' : (visHigh ? '中心性肥胖' : '正常'),
        rule: '≥ 9 级提示中心性肥胖、代谢风险升高'
      },
      { key: 'muscleMass', name: '骨骼肌量', value: n(b.muscleMass), unit: 'kg', t: null, level: 'na', label: '参考值', rule: '用于随访趋势对比' },
      { key: 'bmr', name: '基础代谢', value: n(b.bmr), unit: 'kcal', t: null, level: 'na', label: '参考值', rule: '用于饮食热量方案测算' }
    ];

    // 4.4 核心判定组合
    let combo = 'unknown', comboLabel = '数据不足，无法判定肌脂组合';
    if (smiLow != null && fatHigh != null) {
      if (smiLow && !fatHigh) { combo = 'sarcopenia'; comboLabel = '肌肉量低 + 体脂正常 = 单纯肌少症（需增肌）'; }
      else if (!smiLow && fatHigh) { combo = 'obesity'; comboLabel = '肌肉量正常 + 体脂偏高 = 老年肥胖（需减脂、控重保肌）'; }
      else if (smiLow && fatHigh) { combo = 'sarcobesity'; comboLabel = '肌肉量低 + 体脂偏高 = 肌少性肥胖（需增肌 + 减脂同步干预）'; }
      else { combo = 'good'; comboLabel = '肌肉、体脂均正常 = 状态良好（维持干预）'; }
    }

    return { has: smi != null || fat != null || vis != null, smi, fat, vis, smiT, fatT, smiLow, fatHigh, visHigh, items, combo, comboLabel };
  }

  /* ==================================================================
   * 4. SPPB 简易躯体功能测试（总分 0-12）
   * ================================================================== */
  const BALANCE_OPTS = [
    { key: 'tandem10', score: 4, label: '串联站立保持 10 秒（前后脚一线）' },
    { key: 'semi10', score: 3, label: '半串联站立保持 10 秒' },
    { key: 'together10', score: 2, label: '双脚并拢保持 10 秒' },
    { key: 'under10', score: 1, label: '可站立但无法坚持 10 秒' },
    { key: 'cannot', score: 0, label: '无法完成站立' }
  ];

  function sppbGaitScore(v) {
    if (v == null) return null;
    if (v >= 0.8) return 4;
    if (v >= 0.6) return 3;
    if (v >= 0.4) return 2;
    if (v > 0) return 1;
    return 0;
  }
  function sppbChairScore(sec, cannot) {
    if (cannot) return 0;
    if (sec == null) return null;
    if (sec <= 12) return 4;
    if (sec <= 16.9) return 3;
    if (sec <= 29.9) return 2;
    return 1;
  }

  function evalSPPB(gaitVal, balanceKey, chairSec, chairCannot) {
    const gs = sppbGaitScore(n(gaitVal));
    const bo = BALANCE_OPTS.find(o => o.key === balanceKey);
    const bs = bo ? bo.score : null;
    const cs = sppbChairScore(n(chairSec), !!chairCannot);
    const parts = [
      { name: '4 米步速', score: gs, max: 4, detail: gaitVal ? `${n(gaitVal)} m/s` : '未测' },
      { name: '站立平衡', score: bs, max: 4, detail: bo ? bo.label : '未测' },
      { name: '五次坐立', score: cs, max: 4, detail: chairCannot ? '无法完成' : (chairSec ? `${n(chairSec)} 秒` : '未测') }
    ];
    const done = parts.filter(p => p.score != null);
    const total = done.reduce((s, p) => s + p.score, 0);
    const complete = done.length === 3;

    let level = 'na', label = '数据不完整', desc = '需完成步速、平衡、五次坐立三项方可判定躯体功能水平。';
    if (complete) {
      if (total >= 10) { level = 'ok'; label = '躯体功能正常'; desc = 'SPPB 总分 10-12 分，躯体功能良好，衰弱与跌倒风险极低。'; }
      else if (total >= 6) { level = 'warn'; label = '轻度躯体功能下降'; desc = 'SPPB 总分 6-9 分，处于肌少症前期，需及时干预防止肌肉进一步流失。'; }
      else { level = 'bad'; label = '重度躯体功能衰退'; desc = 'SPPB 总分 0-5 分，确诊肌少症高风险，跌倒与失能风险极高，需优先执行跌倒预防专项方案。'; }
    }
    return { parts, total, complete, level, label, desc };
  }

  /* ==================================================================
   * 5. CFS 临床衰弱量表（9 级）
   * ================================================================== */
  const CFS_LEVELS = [
    { v: 1, name: '非常健康', desc: '精力充沛、无疾病困扰、日常活动完全自主' },
    { v: 2, name: '健康', desc: '无明显功能受限，偶有轻微不适，不影响生活' },
    { v: 3, name: '亚健康', desc: '轻度躯体不适，无日常活动受限' },
    { v: 4, name: '前期衰弱', desc: '日常活动轻微受限，疲劳感频发，无依赖' },
    { v: 5, name: '轻度衰弱', desc: '日常活动部分受限，行走、起身费力，偶尔需要协助' },
    { v: 6, name: '中度衰弱', desc: '独立行走、自理能力明显下降，经常需要协助' },
    { v: 7, name: '重度衰弱', desc: '基本生活依赖他人，无法独立外出、站立不稳' },
    { v: 8, name: '极重度衰弱', desc: '完全卧床、无法自主活动' },
    { v: 9, name: '终末期衰弱', desc: '濒临衰竭状态' }
  ];

  function evalCFS(val) {
    const v = n(val);
    if (v == null) return { has: false, value: null, level: 'na', label: '未评估', category: '未评估', desc: '' };
    const item = CFS_LEVELS.find(x => x.v === v) || CFS_LEVELS[0];
    let category, level;
    if (v <= 3) { category = '强健'; level = 'ok'; }
    else if (v === 4) { category = '衰弱前期'; level = 'warn'; }
    else if (v <= 6) { category = '衰弱状态'; level = 'warn'; }
    else { category = '重度衰弱'; level = 'bad'; }
    return {
      has: true, value: v, name: item.name, desc: item.desc, category, level,
      label: `CFS ${v} 级 · ${item.name}（${category}）`,
      warn: v >= 7 ? '重度衰弱人群跌倒、失能风险极高，运动干预须全程陪护并优先执行跌倒预防方案。' : ''
    };
  }

  /* ==================================================================
   * 6. 问卷一：SARC-F 老年肌少症风险筛查（0-10）
   * ================================================================== */
  const SARCF_ITEMS = [
    { key: 's', dim: '力量（S）', q: '您是否感觉拎重物、提水桶费力？', opts: [['无困难', 0], ['稍有困难', 1], ['明显困难', 2]] },
    { key: 'a', dim: '行走（A）', q: '您走路、上下台阶是否费力、步态不稳？', opts: [['无困难', 0], ['稍有困难', 1], ['明显困难', 2]] },
    { key: 'r', dim: '起身（R）', q: '您从椅子、床上起身是否需要借力？', opts: [['无需借力', 0], ['偶尔借力', 1], ['经常借力', 2]] },
    { key: 'c', dim: '跌倒（C）', q: '近 1 年是否有跌倒、差点跌倒的情况？', opts: [['无', 0], ['1-2 次', 1], ['≥3 次', 2]] },
    { key: 'f', dim: '体型（F）', q: '是否自觉四肢变细、肌肉松弛、体重莫名下降？', opts: [['无此感觉', 0], ['略有感觉', 1], ['明显如此', 2]] }
  ];

  function evalSarcF(ans) {
    ans = ans || {};
    let total = 0, answered = 0;
    const detail = SARCF_ITEMS.map(it => {
      const v = n(ans[it.key]);
      if (v != null) { total += v; answered++; }
      return { ...it, value: v, text: v == null ? '未作答' : (it.opts.find(o => o[1] === v) || ['—'])[0] };
    });
    const complete = answered === SARCF_ITEMS.length;
    const positive = total >= 4;
    return {
      total, answered, complete, positive, detail,
      level: !complete ? 'na' : (positive ? 'bad' : (total >= 2 ? 'warn' : 'ok')),
      label: !complete ? '未完成' : (positive ? `${total} 分 · 肌少症风险筛查阳性` : `${total} 分 · 筛查阴性`),
      desc: positive
        ? 'SARC-F ≥ 4 分为筛查阳性，提示存在肌少症风险，须结合客观指标确诊并启动干预。'
        : 'SARC-F ＜ 4 分为筛查阴性，主观肌肉功能状态尚可，仍建议定期复查。'
    };
  }

  /* ==================================================================
   * 7. 问卷二：老年人肌肉健康生活方式专项问卷（本模块专属，5 维度）
   * ================================================================== */
  const LIFE_SECTIONS = [
    {
      key: 'exercise', title: '运动习惯', icon: '🏃', items: [
        { key: 'resistFreq', q: '每周进行抗阻 / 力量训练的次数', opts: [['≥3 次', 0], ['1-2 次', 1], ['基本没有', 2]] },
        { key: 'dailySteps', q: '日常每日步数', opts: [['≥6000 步', 0], ['3000-6000 步', 1], ['＜3000 步', 2]] },
        { key: 'sitHours', q: '每日久坐时长', opts: [['＜4 小时', 0], ['4-8 小时', 1], ['＞8 小时', 2]] },
        { key: 'bedridden', q: '是否长期卧床或极少活动', opts: [['否', 0], ['偶尔', 1], ['是', 2]] }
      ]
    },
    {
      key: 'protein', title: '蛋白质摄入', icon: '🥚', items: [
        { key: 'proteinFreq', q: '每日肉、蛋、奶摄入频次', opts: [['三餐均有', 0], ['每日 1-2 次', 1], ['很少摄入', 2]] },
        { key: 'pickyEat', q: '是否挑食 / 少食 / 长期素食', opts: [['否', 0], ['偶尔', 1], ['是', 2]] }
      ]
    },
    {
      key: 'nutrition', title: '营养状态', icon: '⚖️', items: [
        { key: 'weightChange', q: '近 3 个月体重变化', opts: [['基本稳定', 0], ['下降 1-3 kg', 1], ['下降 ＞3 kg', 2]] },
        { key: 'appetite', q: '近期食欲情况', opts: [['良好', 0], ['一般', 1], ['明显下降', 2]] },
        { key: 'malnutrition', q: '是否被提示营养不良 / 低蛋白血症', opts: [['否', 0], ['不确定', 1], ['是', 2]] }
      ]
    },
    {
      key: 'sleep', title: '睡眠与疲劳状态', icon: '😴', items: [
        { key: 'sleepDur', q: '每日睡眠时长', opts: [['6-8 小时', 0], ['5-6 小时或 ＞9 小时', 1], ['＜5 小时', 2]] },
        { key: 'fatigue', q: '日间乏力情况', opts: [['基本没有', 0], ['偶尔', 1], ['经常', 2]] },
        { key: 'soreness', q: '肌肉酸痛频率', opts: [['很少', 0], ['偶尔', 1], ['经常', 2]] }
      ]
    },
    {
      key: 'chronic', title: '慢病与用药', icon: '💊', items: [
        { key: 'diabetes', q: '糖尿病', opts: [['无', 0], ['有 · 控制良好', 1], ['有 · 控制不佳', 2]] },
        { key: 'hypertension', q: '高血压', opts: [['无', 0], ['有 · 控制良好', 1], ['有 · 控制不佳', 2]] },
        { key: 'jointDisease', q: '骨关节病 / 骨质疏松', opts: [['无', 0], ['轻度', 1], ['明显', 2]] },
        { key: 'steroid', q: '长期激素类药物使用史', opts: [['无', 0], ['既往有', 1], ['长期使用', 2]] }
      ]
    }
  ];
  const LIFE_MAX = LIFE_SECTIONS.reduce((s, sec) => s + sec.items.length * 2, 0); // 32

  function evalLifeSurvey(ans) {
    ans = ans || {};
    let total = 0, answered = 0;
    const sections = LIFE_SECTIONS.map(sec => {
      let sTotal = 0, sMax = sec.items.length * 2, sAns = 0;
      const items = sec.items.map(it => {
        const v = n(ans[it.key]);
        if (v != null) { sTotal += v; total += v; answered++; sAns++; }
        return { ...it, value: v, text: v == null ? '未作答' : (it.opts.find(o => o[1] === v) || ['—'])[0] };
      });
      const ratio = sMax ? sTotal / sMax : 0;
      return {
        ...sec, items, score: sTotal, max: sMax, answered: sAns,
        level: sAns === 0 ? 'na' : (ratio <= 0.25 ? 'ok' : (ratio <= 0.55 ? 'warn' : 'bad')),
        label: sAns === 0 ? '未作答' : (ratio <= 0.25 ? '良好' : (ratio <= 0.55 ? '存在诱因' : '高危诱因'))
      };
    });
    const totalItems = LIFE_SECTIONS.reduce((s, x) => s + x.items.length, 0);
    const complete = answered === totalItems;
    let level, label;
    if (total <= 8) { level = 'ok'; label = '肌肉健康生活方式良好'; }
    else if (total <= 18) { level = 'warn'; label = '存在肌肉流失诱因'; }
    else { level = 'bad'; label = '肌肉流失高危生活方式'; }
    return { total, max: LIFE_MAX, answered, totalItems, complete, sections, level, label };
  }

  /* ==================================================================
   * 7.1 问卷三：MNA-SF 简易营养评估简表（0-14 分，≤11 分营养不良风险）
   * ================================================================== */
  const MNA_SF_ITEMS = [
    { key: 'appetite', q: '过去 3 个月内有没有因为食欲不振、消化不良、咀嚼或吞咽困难而减少食量？', opts: [['食量严重减少', 0], ['食量中度减少', 1], ['食量没有减少', 2]] },
    { key: 'mobility', q: '活动能力', opts: [['需长期卧床或坐轮椅', 0], ['可以下床或离开轮椅，但不能外出', 1], ['可以外出', 2]] },
    { key: 'acute', q: '过去 3 个月内有没有受到心理创伤或患急性疾病？', opts: [['有', 0], ['没有', 2]] },
    { key: 'neuro', q: '精神心理问题', opts: [['严重痴呆或抑郁', 0], ['轻度痴呆', 1], ['没有精神心理问题', 2]] },
    { key: 'bmiLoss', q: '近 3 个月体重变化或 BMI 情况', opts: [['体重下降 >3 kg 或 BMI <19', 0], ['体重下降 1-3 kg', 1], ['体重稳定', 2]] },
    { key: 'medication', q: '是否服用 3 种及以上药物？', opts: [['是', 0], ['否', 1]] }
  ];

  function evalMnaSF(ans) {
    ans = ans || {};
    let total = 0, answered = 0;
    const detail = MNA_SF_ITEMS.map(it => {
      const v = n(ans[it.key]);
      if (v != null) { total += v; answered++; }
      return { ...it, value: v, text: v == null ? '未作答' : (it.opts.find(o => o[1] === v) || ['—'])[0] };
    });
    const complete = answered === MNA_SF_ITEMS.length;
    const atRisk = total <= 11;
    return {
      total, answered, complete, detail,
      level: !complete ? 'na' : (atRisk ? 'bad' : 'ok'),
      label: !complete ? '未完成' : (atRisk ? `${total} 分 · 营养不良风险` : `${total} 分 · 营养状态良好`),
      desc: atRisk
        ? 'MNA-SF ≤ 11 分提示存在营养不良风险，建议营养科会诊并制定高蛋白、充足热量饮食方案。'
        : 'MNA-SF ＞ 11 分，营养状态尚可，仍需关注蛋白质与维生素 D 摄入。'
    };
  }

  /* ==================================================================
   * 7.2 问卷四：简易精神状态测验 AMT（0-10 分，≤6 分认知障碍）
   * ================================================================== */
  const AMT_ITEMS = [
    { key: 'age', q: '能够清楚说出自己的年龄' },
    { key: 'birth', q: '能够清楚说出自己的出生日期' },
    { key: 'address', q: '能够清楚说出家庭地址' },
    { key: 'location', q: '能够清楚说出目前所在地' },
    { key: 'year', q: '能够清楚说出现在年份' },
    { key: 'time', q: '能够清楚说出当前时间（±1 小时）' },
    { key: 'people', q: '能够识别出 2 个人' },
    { key: 'president', q: '能够清楚说出现任国家主席' },
    { key: 'countdown', q: '能够完成 20-1 倒数' },
    { key: 'recall', q: '能够回忆 3 个物品（鲜花、勺子、钥匙）' }
  ];

  function evalAmt(ans) {
    ans = ans || {};
    let total = 0, answered = 0;
    const detail = AMT_ITEMS.map(it => {
      const v = ans[it.key];
      const correct = v === true || v === 'yes' || v === 'correct' || v === 1;
      const wrong = v === false || v === 'no' || v === 'wrong' || v === 0;
      if (v != null && v !== '') answered++;
      if (correct) total++;
      return { ...it, value: v, correct, text: correct ? '✓ 正确' : (wrong ? '✗ 错误' : '未作答') };
    });
    const complete = answered === AMT_ITEMS.length;
    const impaired = total <= 6;
    return {
      total, answered, complete, detail,
      level: !complete ? 'na' : (impaired ? 'bad' : 'ok'),
      label: !complete ? '未完成' : (impaired ? `${total} 分 · 认知功能受损` : `${total} 分 · 认知功能正常`),
      desc: impaired
        ? 'AMT ≤ 6 分提示存在认知障碍，运动方案须简化指令、加强陪护，并建议神经科/老年科进一步评估。'
        : 'AMT ＞ 6 分，认知功能基本正常，可理解并执行常规运动指令。'
    };
  }

  /* ==================================================================
   * 7.3 问卷五：自评跌倒关注程度量表（16-64 分，越高越怕跌）
   * ================================================================== */
  const FEAR_FALL_ITEMS = [
    { key: 'clean', q: '家居清洁' }, { key: 'dress', q: '穿脱衣服' }, { key: 'cook', q: '煮饭' },
    { key: 'bath', q: '洗澡、淋浴' }, { key: 'shop', q: '买东西、购物' }, { key: 'sitstand', q: '从椅子上站起来/坐下' },
    { key: 'stairs', q: '上/下楼梯' }, { key: 'walkHome', q: '在家附近行走' },
    { key: 'reach', q: '拿高过头顶/捡地上的东西' }, { key: 'phone', q: '赶接电话' },
    { key: 'wet', q: '走在湿滑的地面上' }, { key: 'visit', q: '拜访亲友' },
    { key: 'crowd', q: '在人很挤的地方走' }, { key: 'rough', q: '走在崎岖不平的路上' },
    { key: 'slope', q: '上/落斜坡' }, { key: 'activity', q: '出去参加活动' }
  ];

  function evalFearFall(ans) {
    ans = ans || {};
    let total = 0, answered = 0;
    const detail = FEAR_FALL_ITEMS.map(it => {
      const v = n(ans[it.key]);
      if (v != null) { total += v; answered++; }
      return { ...it, value: v, text: v == null ? '未作答' : ['不关注', '一点关注', '颇为关注', '极度关注'][v - 1] || '—' };
    });
    const complete = answered === FEAR_FALL_ITEMS.length;
    let level, label;
    if (!complete) { level = 'na'; label = '未完成'; }
    else if (total <= 28) { level = 'ok'; label = `${total} 分 · 跌倒关注程度低`; }
    else if (total <= 44) { level = 'warn'; label = `${total} 分 · 跌倒关注程度中等`; }
    else { level = 'bad'; label = `${total} 分 · 跌倒关注程度高`; }
    return {
      total, answered, complete, detail, level, label,
      desc: complete
        ? (total > 44
          ? '对日常活动跌倒风险高度关注，可能因恐惧跌倒而限制活动，形成「越怕跌→越不动→越易跌」的恶性循环，需同步进行心理建设与平衡训练。'
          : (total > 28
            ? '对部分活动存在中等程度跌倒关注，可通过渐进式平衡训练与安全教育降低焦虑。'
            : '跌倒关注程度低，活动信心较好，但仍需保持环境安全与功能训练。'))
        : '请完成全部 16 项自评。'
    };
  }

  /* ==================================================================
   * 8. 跌倒风险指数加权算法（§6.5，满分 100，分数越高风险越高）
   *    肌力 30% / 躯体功能 30% / 衰弱 25% / 体成分 10% / 问卷 5%
   * ================================================================== */
  function gripRiskSub(grip, gender) {
    if (grip == null) return null;
    const t = TH.grip[gd(gender)];
    const r = grip / t;
    if (r >= 1.25) return 0;
    if (r >= 1.00) return 15;
    if (r >= 0.85) return 45;
    if (r >= 0.70) return 70;
    return 100;
  }
  function gaitRiskSub(v) {
    if (v == null) return null;
    if (v >= 1.0) return 0;
    if (v > 0.8) return 20;
    if (v >= 0.6) return 55;
    if (v >= 0.4) return 80;
    return 100;
  }
  const CFS_RISK = { 1: 0, 2: 5, 3: 15, 4: 35, 5: 55, 6: 72, 7: 88, 8: 96, 9: 100 };

  /**
   * @param inp {gender, gripEval, strength(设备肌力摘要 total 0-100 越高越好),
   *             sppb, gaitEval, cfs, body, calfEval, sarcf}
   */
  function fallRiskIndex(inp) {
    const dims = [];

    /* —— 肌力维度 30%（鹊动等速/等张设备数据优先，握力辅助） —— */
    let stSub = null, stSrc = [];
    const gripSub = inp.gripEval && inp.gripEval.has ? gripRiskSub(inp.gripEval.value, inp.gender) : null;
    let devSub = null;
    if (inp.strength && n(inp.strength.total) != null) {
      // 老年适配修正：对成人肌力阈值做降级适配，宽容 12 分，避免中青年标准误判老年人
      devSub = clamp((100 - n(inp.strength.total)) - 12, 0, 100);
      stSrc.push('鹊动' + (inp.strength.type === 'isotonic' ? '等张' : '等速') + '肌力数据');
    }
    if (gripSub != null) stSrc.push('握力');
    if (devSub != null && gripSub != null) stSub = devSub * 0.7 + gripSub * 0.3;
    else if (devSub != null) stSub = devSub;
    else if (gripSub != null) stSub = gripSub;
    else { stSub = 50; stSrc.push('缺省中性值'); }
    dims.push({
      key: 'strength', name: '肌力维度', weight: 0.25, sub: Math.round(stSub),
      source: stSrc.join(' + ') || '无数据',
      note: devSub != null ? '设备量化肌力为核心依据，握力为辅助筛查' : (gripSub != null ? '无设备测评记录，以握力作为唯一肌力判定依据' : '缺少肌力数据，按中性值计入')
    });

    /* —— 躯体功能维度 30%（SPPB 总分 + 4 米步速） —— */
    const sppbSub = inp.sppb && inp.sppb.complete ? clamp((12 - inp.sppb.total) / 12 * 100, 0, 100) : null;
    const gtSub = inp.gaitEval && inp.gaitEval.has ? gaitRiskSub(inp.gaitEval.value) : null;
    let fnSub;
    if (sppbSub != null && gtSub != null) fnSub = sppbSub * 0.6 + gtSub * 0.4;
    else if (sppbSub != null) fnSub = sppbSub;
    else if (gtSub != null) fnSub = gtSub;
    else fnSub = 50;
    dims.push({
      key: 'function', name: '躯体功能维度', weight: 0.25, sub: Math.round(fnSub),
      source: [sppbSub != null ? 'SPPB 总分' : null, gtSub != null ? '4 米步速' : null].filter(Boolean).join(' + ') || '缺省中性值',
      note: 'SPPB 占 60%、步速占 40% 合成躯体功能风险'
    });

    /* —— 衰弱维度 25%（CFS 加权赋值） —— */
    const frSub = inp.cfs && inp.cfs.has ? (CFS_RISK[inp.cfs.value] != null ? CFS_RISK[inp.cfs.value] : 30) : 30;
    dims.push({
      key: 'frailty', name: '衰弱维度', weight: 0.20, sub: frSub,
      source: inp.cfs && inp.cfs.has ? `CFS ${inp.cfs.value} 级 · ${inp.cfs.name}` : '缺省中性值',
      note: 'CFS 临床衰弱量表 9 级分级加权赋值'
    });

    /* —— 肌少症与体成分维度 10% —— */
    let bcSub = 0; const bcFlags = [];
    const b = inp.body || {};
    if (b.smiLow === true) { bcSub += 40; bcFlags.push('骨骼肌量不足'); }
    if (inp.calfEval && inp.calfEval.low) { bcSub += 30; bcFlags.push('小腿围偏低'); }
    if (b.fatHigh === true) { bcSub += 20; bcFlags.push('体脂率超标'); }
    if (b.visHigh === true) { bcSub += 10; bcFlags.push('内脏脂肪超标'); }
    if (!b.has && !(inp.calfEval && inp.calfEval.has)) bcSub = 40;
    dims.push({
      key: 'body', name: '肌少症与体成分维度', weight: 0.10, sub: clamp(bcSub, 0, 100),
      source: bcFlags.length ? bcFlags.join('、') : (b.has || (inp.calfEval && inp.calfEval.has) ? '各项达标' : '缺省中性值'),
      note: '骨骼肌量 40% + 四肢肌肉储备 30% + 体脂 20% + 内脏脂肪 10%'
    });

    /* —— 问卷风险维度 5%（SARC-F 跌倒史、平衡异常） —— */
    let qsSub = 25;
    if (inp.sarcf && inp.sarcf.answered > 0) {
      const fall = n((inp.sarcf.detail.find(d => d.key === 'c') || {}).value) || 0;
      const walk = n((inp.sarcf.detail.find(d => d.key === 'a') || {}).value) || 0;
      qsSub = clamp((inp.sarcf.total / 10) * 50 + (fall / 2) * 30 + (walk / 2) * 20, 0, 100);
    }
    dims.push({
      key: 'survey', name: '问卷风险维度', weight: 0.05, sub: Math.round(qsSub),
      source: inp.sarcf && inp.sarcf.answered ? `SARC-F ${inp.sarcf.total} 分` : '缺省中性值',
      note: 'SARC-F 总分 50% + 跌倒史 30% + 步态不稳 20%'
    });

    /* —— 跌倒相关医学因素 15%（文档新增：跌倒史、助行器、视力、用药、跌倒恐惧） —— */
    let medSub = 0; const medFlags = [], medSources = [];
    const h = inp.health || {};
    if (h.fallHistory === 'yes' || h.fallHistory === true) {
      const fc = n(h.fallCount) || 1;
      medSub += Math.min(25 + fc * 10, 60); medFlags.push(`近 1 年跌倒 ${fc} 次`);
    }
    if (h.useAid === 'yes' || h.useAid === true) { medSub += 20; medFlags.push('使用助行器'); }
    if (h.pain === 'yes' || h.pain === true) { medSub += 10; medFlags.push('肌肉骨骼疼痛'); }
    const dc = n(h.drugCount);
    if (dc != null && dc >= 3) { medSub += 15; medFlags.push(`每日服药 ≥${dc} 种`); }
    else if (dc != null && dc >= 1) { medSub += 5; medFlags.push(`每日服药 ${dc} 种`); }
    const e = inp.exam || {};
    const vl = n(e.visionLeft), vr = n(e.visionRight);
    if ((vl != null && vl < 0.3) || (vr != null && vr < 0.3)) { medSub += 15; medFlags.push('视力明显减退'); }
    else if ((vl != null && vl < 0.6) || (vr != null && vr < 0.6)) { medSub += 5; medFlags.push('视力轻度减退'); }
    if (inp.fearFall && inp.fearFall.complete) {
      const fs = inp.fearFall.total;
      if (fs > 44) { medSub += 15; medFlags.push('跌倒关注程度高'); }
      else if (fs > 28) { medSub += 5; medFlags.push('跌倒关注程度中等'); }
    }
    medSub = clamp(medSub, 0, 100);
    dims.push({
      key: 'medical', name: '跌倒相关医学因素', weight: 0.15, sub: Math.round(medSub),
      source: medFlags.length ? medFlags.join('、') : '未见显著危险因素',
      note: '跌倒史、助行器、视力、用药数量、肌肉骨骼疼痛、跌倒关注程度综合加权'
    });

    const index = Math.round(dims.reduce((s, d) => s + d.sub * d.weight, 0));
    let level, levelKey, color, advice;
    if (index <= 30) {
      levelKey = 'low'; level = '跌倒低风险'; color = 'ok';
      advice = '躯体功能良好、平衡稳定、肌力充足。执行每周 1-2 次维持性平衡与步态训练，预防功能退化。';
    } else if (index <= 60) {
      levelKey = 'mid'; level = '跌倒中风险'; color = 'warn';
      advice = '肌力偏弱、平衡一般，存在衰弱前期表现。需每周 3 次专项平衡、步态、本体感觉训练，强化下肢稳定与核心控制。';
    } else {
      levelKey = 'high'; level = '跌倒高风险'; color = 'bad';
      advice = '肌力衰退、躯体功能下降、衰弱明显，极易跌倒。须优先执行跌倒预防专项方案，风险降低后再叠加增肌 / 减脂塑形训练。';
    }
    return { index, level, levelKey, color, advice, dims };
  }

  /* ==================================================================
   * 9. 智能分级判定 —— 四类干预方向 + 肌少症风险等级
   * ================================================================== */
  const DIRECTIONS = {
    maintain: { key: 'maintain', no: '等级 1', name: '维持现状', full: '维持现状（健康老年肌肉状态）', color: 'ok', icon: '🌿' },
    gain: { key: 'gain', no: '等级 2', name: '单纯增肌', full: '单纯增肌干预（肌力/肌量不足）', color: 'warn', icon: '💪' },
    lose: { key: 'lose', no: '等级 3', name: '单纯减脂', full: '单纯减脂干预（正常肌肉、体脂超标）', color: 'warn', icon: '🔥' },
    both: { key: 'both', no: '等级 4', name: '增肌 + 减脂', full: '增肌 + 减脂联合干预（肌少性肥胖）', color: 'bad', icon: '⚡' }
  };

  function decideDirection(ctx) {
    const { calfEval, gripEval, gaitEval, body, sppb, sarcf, strength, mnasf, health } = ctx;

    // 肌力/肌量侧异常
    const flags = [];
    if (calfEval && calfEval.low) flags.push('小腿围偏低');
    if (gripEval && gripEval.low) flags.push('握力下降');
    if (body && body.smiLow === true) flags.push('骨骼肌量偏低');
    if (gaitEval && gaitEval.low) flags.push('步速减慢');
    if (sppb && sppb.complete && sppb.total <= 9) flags.push('SPPB 躯体功能下降');
    if (strength && n(strength.total) != null && n(strength.total) < 55) flags.push('鹊动设备肌力数据偏低');
    const muscleAbnormal = flags.length > 0;

    // 体脂侧异常
    const fatFlags = [];
    if (body && body.fatHigh === true) fatFlags.push('体脂率超标');
    if (body && body.visHigh === true) fatFlags.push('内脏脂肪 ≥9 级');
    const fatAbnormal = fatFlags.length > 0;

    const sarcPositive = !!(sarcf && sarcf.positive);

    let key;
    if (muscleAbnormal && fatAbnormal) key = 'both';
    else if (muscleAbnormal) key = 'gain';
    else if (fatAbnormal) key = 'lose';
    else key = sarcPositive ? 'gain' : 'maintain';

    const reasons = [];
    if (key === 'maintain') {
      reasons.push('握力、步速、小腿围全部正常');
      reasons.push('体脂率、骨骼肌量达标');
      reasons.push(`SARC-F ${sarcf && sarcf.complete ? sarcf.total : '—'} 分 ＜ 4 分`);
    } else {
      if (muscleAbnormal) reasons.push('肌力 / 肌量异常项：' + flags.join('、'));
      if (fatAbnormal) reasons.push('体脂异常项：' + fatFlags.join('、'));
      if (key === 'gain' && !muscleAbnormal && sarcPositive) reasons.push(`SARC-F ${sarcf.total} 分 ≥ 4 分，筛查阳性，按增肌预防方向干预`);
      if (key === 'lose') reasons.push('肌肉相关指标全部正常，无肌力下降');
      if (mnasf && mnasf.complete && mnasf.total <= 11) reasons.push(`MNA-SF ${mnasf.total} 分 ≤ 11 分，存在营养不良风险，需同步营养干预`);
      if (health && (health.weightLoss === 'yes' || health.weightLoss === true)) reasons.push('近 6 个月非主动体重下降，提示肌肉/营养储备流失');
    }

    // 肌少症风险等级（独立于干预方向）
    const smiLow = body && body.smiLow === true;
    const strengthLow = (gripEval && gripEval.low) || (strength && n(strength.total) != null && n(strength.total) < 55);
    const funcLow = (gaitEval && gaitEval.low) || (sppb && sppb.complete && sppb.total <= 5);
    let sarcGrade, sarcGradeLevel, sarcGradeDesc;
    if (smiLow && strengthLow && funcLow) {
      sarcGrade = '严重肌少症'; sarcGradeLevel = 'bad';
      sarcGradeDesc = '骨骼肌量偏低 + 肌力下降 + 躯体功能下降，三项同时阳性，判定为严重肌少症。';
    } else if (smiLow && (strengthLow || funcLow)) {
      sarcGrade = '确诊肌少症'; sarcGradeLevel = 'bad';
      sarcGradeDesc = '骨骼肌量偏低并伴肌力下降或躯体功能下降，符合肌少症确诊标准。';
    } else if (strengthLow || funcLow) {
      sarcGrade = '肌少症前期'; sarcGradeLevel = 'warn';
      sarcGradeDesc = '存在肌力下降或躯体功能下降，骨骼肌量尚未明确减少，处于肌少症前期。';
    } else if (sarcPositive || (calfEval && calfEval.low)) {
      sarcGrade = '可能肌少症（筛查阳性）'; sarcGradeLevel = 'warn';
      sarcGradeDesc = '筛查问卷阳性或小腿围偏低，建议补充客观指标进一步确认。';
    } else {
      sarcGrade = '未见肌少症'; sarcGradeLevel = 'ok';
      sarcGradeDesc = '各项肌肉相关指标均达标，暂未见肌少症证据。';
    }

    return { ...DIRECTIONS[key], reasons, muscleFlags: flags, fatFlags, sarcGrade, sarcGradeLevel, sarcGradeDesc };
  }

  /* ==================================================================
   * 10. 干预方案库（§7 —— 四类人群 × 双运动方案 + 饮食 + 生活方式）
   * ================================================================== */
  const PLAN_LIB = {
    maintain: {
      goal: '维持肌肉量、维持体脂、预防肌肉流失、保持健康生活方式。',
      home: {
        title: '老年徒手专属方案（维持人群 · 居家安全版）',
        goalText: '维持现有肌肉量、保留肌力、预防废用性流失、维持关节活动度',
        freq: '每周 3 次徒手抗阻 + 3 次轻度有氧',
        intensity: '每组 12–15 次，2 组，动作缓慢可控，无酸痛、无代偿',
        actions: ['原地慢走', '太极舒缓招式', '坐姿踝关节屈伸', '坐姿膝关节屈伸', '站姿靠墙静蹲（浅蹲）', '站姿抬踵', '坐姿收腹', '肩部徒手舒展'],
        rules: ['训练全程有人陪护更佳', '地面防滑，避免湿滑区域', '避免久坐超过 1 小时', '每日 4000–6000 步']
      },
      device: {
        title: '鹊动设备专属方案（维持人群 · 标准化量化版）',
        goalText: '标准化维持肌肉维度、稳定基础代谢、固化良好体成分',
        freq: '每周 2 次设备量化训练 + 2 次自主徒手巩固',
        intensity: '系统自动匹配老人最低起步负荷，匀速节律、时长可控，杜绝过载',
        actions: ['膝关节伸展单元', '膝关节屈曲单元', '下肢蹬踏单元', '腹肌单元'],
        devices: [
          { id: '01', reason: '维持股四头肌肌力，保留起坐、上下楼与行走能力', dose: '设备轻–中阻力 10–15 次×2–3 组，组间休息 60–90 s，末端不锁膝', keyPoints: '勾脚背抵软垫，股四头肌发力伸膝，动作匀速、不甩腿', contraindication: '髌股疼痛者减小活动度，避免末端伸膝加载' },
          { id: '02', reason: '维持屈伸肌前后链平衡，降低步态失稳与跌倒风险', dose: '设备轻阻 10–12 次×2 组，离心阶段 2–3 秒控制', keyPoints: '腘绳肌发力缓慢屈膝下压', contraindication: '后交叉韧带损伤史者禁用' },
          { id: '09', reason: '维持下肢蹬踏与行走能力，维持基础代谢', dose: '轻–中阻力 10–15 次×2–3 组，全脚掌均匀发力', keyPoints: '膝足同向、不甩腿不锁膝', contraindication: '严重膝骨关节炎急性期暂缓' },
          { id: '03', reason: '维持核心稳定，支撑日常转移与平衡', dose: '自重/轻阻 10–15 次×2 组，或等长 10–20 秒×3 组', keyPoints: '腹发力前屈、颈部不代偿', contraindication: '腹压增高疾病避免用力收腹' }
        ],
        rules: ['设备自动预警超强度动作', '训练数据自动回传，纳入肌少症随访台账', '对比历次维持效果，动态微调负荷']
      },
      aerobic: '每周 3-5 次，每次 30 分钟快走、太极、慢骑，中等强度、微微出汗即可。日常每日步数 4000-6000 步，避免久坐超过 1 小时。',
      diet: [
        ['蛋白质', '每日适量摄入，保证肉蛋奶均衡，预防肌肉流失'],
        ['控糖控油', '清淡饮食，避免高油高糖，维持体脂稳定'],
        ['钙与维生素 D', '补充钙与维生素 D，预防骨质疏松、辅助肌肉代谢']
      ],
      lifestyle: ['规律作息、避免熬夜', '每日适度日晒', '每 3 个月复查一次肌少症指标，长期维持监测'],
      reviewDays: 90
    },

    gain: {
      goal: '重点增肌、提升肌力、改善躯体功能，不刻意减脂。',
      home: {
        title: '老年徒手专属增肌方案（弱肌力、低储备、居家老人首选）',
        goalText: '低负荷渐进抗阻，强化四肢骨骼肌、提升握力与坐站能力，适配肌少症前期 / 轻度肌少症老人',
        freq: '每周 3 次徒手抗阻（隔天练）+ 2 次超轻度有氧',
        intensity: '初期 12 次/组、2 组；适应后提升至 15 次/组、3 组，动作全程慢速控制',
        actions: ['坐姿屈膝抬腿（大腿前侧）', '坐姿直腿抬高（强化下肢肌力）', '站姿后踢腿（臀腿肌肉）', '站姿侧抬腿（改善下肢线条与肌力）', '靠墙浅静蹲（保护膝关节）', '徒手握拳张手反复训练（提升握力）', '坐姿肩胛舒展（改善上肢肌力）'],
        rules: ['不追求力竭，以肌肉温热、轻微酸胀为有效训练', '禁止憋气发力，避免血压波动', '禁止大负重深蹲、硬拉、跳跃等高冲击动作']
      },
      device: {
        title: '鹊动设备专属增肌方案（功能良好、可量化增肌首选）',
        goalText: '设备精准微调负荷，渐进式超负荷，精准刺激四肢骨骼肌，解决徒手训练刺激不足、进步慢的问题',
        freq: '设备抗阻为主、有氧为辅，每周 3 次设备抗阻 + 2 次轻度有氧',
        intensity: '系统根据握力、SMI 指数、SPPB 得分自动匹配起始负荷，每 2 周依据复查数据自动微调增量',
        actions: ['膝关节伸展单元', '膝关节屈曲单元', '下肢蹬踏单元', '胸推测训单元', '腹肌单元'],
        devices: [
          { id: '01', reason: '渐进超负荷增肌，提升起坐与下肢肌力', dose: '设备轻–中阻力 12–15 次×3 组，组间休息 75–90 s，每 2 周递增 5–10% 负荷', keyPoints: '勾脚背抵软垫，股四头肌发力伸膝，末端不锁死', contraindication: '髌股疼痛者减小活动度与负荷' },
          { id: '02', reason: '强化后链腘绳肌，平衡屈伸肌、改善步态稳定', dose: '设备轻–中阻力 10–12 次×2–3 组，离心 2–3 秒', keyPoints: '腘绳肌发力缓慢屈膝下压', contraindication: '后交叉韧带损伤史者禁用' },
          { id: '09', reason: '复合蹬踏增肌，改善坐站与行走功能', dose: '轻–中阻力 12–15 次×3 组，全脚掌均匀发力', keyPoints: '膝足同向、不甩腿不锁膝', contraindication: '严重膝骨关节炎急性期暂缓' },
          { id: '05', reason: '上肢推类增肌，维持撑起、推门等日常能力', dose: '轻–中阻力 10–15 次×2–3 组，肘不过伸', keyPoints: '肩胸发力水平前推，肩不耸起', contraindication: '肩关节撞击综合征者减小活动度' },
          { id: '03', reason: '核心增肌稳定，支撑多组分抗阻训练', dose: '自重/轻阻 12–15 次×2–3 组，或等长 15–20 秒×3 组', keyPoints: '腹发力前屈、颈部放松', contraindication: '腹压增高疾病避免用力收腹' }
        ],
        rules: ['设备内置老年保护阈值', '速度过快、负荷过高、动作变形自动预警、减速、停机保护', '重点拉升骨骼肌量、提升四肢肌力、改善坐站与行走功能']
      },
      aerobic: '每周 2 次超轻度有氧（慢走、太极），每次 20-25 分钟，与抗阻训练隔天进行，给肌肉充分修复时间。',
      diet: [
        ['蛋白质标准', '每日 1.2-1.5 g/kg 体重，优先优质易消化蛋白'],
        ['食材推荐', '鸡蛋、低脂牛奶、酸奶、鱼肉、鸡胸肉、虾仁、豆腐豆制品'],
        ['饮食结构', '三餐均匀分配蛋白，避免单次过量摄入；加餐可选无糖酸奶、水煮蛋'],
        ['营养补充', '足量饮水，补充维生素 D、钙、锌，促进肌肉合成'],
        ['禁忌', '过度节食、素食单一饮食']
      ],
      lifestyle: ['隔天训练，保证肌肉修复时间', '保证每日 7 小时以上睡眠，夜间生长激素分泌利于肌肉合成', '每日适度日晒 15-20 分钟', '每 3 个月复查骨骼肌量与握力'],
      reviewDays: 90
    },

    lose: {
      goal: '温和减脂、控内脏脂肪、保护现有肌肉、避免减脂掉肌。',
      home: {
        title: '老年徒手保肌减脂方案（肥胖、高龄、怕受伤、居家老人首选）',
        goalText: '温和燃脂、全程保肌，杜绝大强度有氧分解肌肉，适配老年肥胖、内脏脂肪高、肌肉基础良好人群',
        freq: '每周 4 次温和有氧 + 2 次徒手保肌抗阻',
        intensity: '微微出汗、可正常说话，不气喘、不乏力，单次 25–30 分钟',
        actions: ['慢速原地走', '老年舒缓踏步', '太极', '慢节奏肢体舒展', '坐姿轻量肌力维持动作', '站姿平衡训练'],
        rules: ['禁止极端有氧与长时间空腹运动', '杜绝久坐，每小时起身活动 5 分钟', '提升日常消耗、降低内脏脂肪，维持原有骨骼肌量']
      },
      device: {
        title: '鹊动设备保肌减脂方案（有设备、需要精准控脂人群首选）',
        goalText: '设备低强度稳态燃脂 + 间歇性低阻保肌，精准控制燃脂区间，保护肌肉不流失',
        freq: '70% 设备温和有氧 + 30% 设备保肌抗阻，每周 4-5 次',
        intensity: '系统根据体脂率、内脏脂肪等级自动匹配燃脂时长与负荷，优先消耗脂肪供能',
        actions: ['下肢蹬踏单元', '坐式划船单元', '腹肌单元'],
        devices: [
          { id: '09', reason: '低冲击稳态蹬踏保肌燃脂，不加重关节负担', dose: '低–中阻力 15–20 次×2–3 组，节奏均匀、心率控制在（220-年龄）×50–60%', keyPoints: '全脚掌发力、膝足同向，不甩腿', contraindication: '严重膝骨关节炎急性期暂缓' },
          { id: '06', reason: '保肌抗阻，防减脂期肌肉流失、维持上肢拉链', dose: '轻–中阻力 12–15 次×2–3 组，握把不过紧', keyPoints: '肩胛先启动后拉，肩不耸起', contraindication: '肩袖损伤急性期禁用' },
          { id: '03', reason: '核心保肌稳定，支撑有氧与日常活动', dose: '自重/轻阻 12–15 次×2 组，或等长 10–20 秒×3 组', keyPoints: '腹发力前屈、颈部放松', contraindication: '腹压增高疾病避免用力收腹' }
        ],
        rules: ['设备训练能耗、心率、时长自动回传', '系统动态调整减脂节奏', '避免老年极速减脂造成虚弱、脱发、免疫力下降']
      },
      aerobic: '每周 4-5 次，每次 30 分钟快走、太极、广场舞、慢走；保肌训练每周 1-2 次简易抗阻，防止减脂过程中肌肉流失。',
      diet: [
        ['热量控制', '温和控卡，不极低热量饮食，避免代谢下降、肌肉流失'],
        ['蛋白保留', '每日 1.0-1.2 g/kg 体重，保证减脂不掉肌'],
        ['控油控糖', '杜绝油炸、糕点、含糖饮料、精制米面过量'],
        ['饮食结构', '多蔬菜、适量粗粮、优质蛋白，少食多餐'],
        ['重点干预', '降低内脏脂肪，减少宵夜、高盐饮食']
      ],
      lifestyle: ['杜绝久坐，每小时起身活动 5 分钟', '规律三餐，杜绝宵夜', '每日饮水 1500-1700 ml', '每 3 个月复查体脂率与内脏脂肪等级'],
      reviewDays: 90
    },

    both: {
      goal: '同步增肌燃脂、重塑身体成分、改善代谢、降低跌倒与慢病风险。',
      home: {
        title: '老年徒手增肌减脂联合方案（肌少性肥胖、体能偏弱、居家老人首选）',
        goalText: '低冲击、肌脂同调、先稳功能再塑体型，解决老年人「肌肉少、脂肪多、体能差、易跌倒」核心问题',
        freq: '每周 3 次徒手抗阻增肌 + 3 次温和有氧减脂，交替进行、不连续高强度',
        intensity: '单次 15 分钟抗阻 + 15 分钟舒缓有氧，劳逸结合，适配偏弱体能',
        actions: ['下肢肌力激活组合（坐姿抬腿、靠墙浅静蹲）', '核心稳定训练（坐姿收腹、站姿重心转移）', '全身舒缓燃脂组合（慢速踏步、太极）', '握力专项（握拳张手反复训练）', '站姿抬踵'],
        rules: ['杜绝长时间连续有氧', '杜绝负重蹲起', '杜绝躯干快速扭转，保护腰椎与膝关节', '优先改善步速、平衡、坐站能力，同步降低体脂']
      },
      device: {
        title: '鹊动设备增肌减脂重塑方案（肌少性肥胖、需要精准体成分干预人群首选）',
        goalText: '设备量化「增肌 + 燃脂」双目标，提升基础代谢，从根源改善肌少性肥胖体态',
        freq: '50% 设备抗阻增肌 + 50% 设备稳态燃脂，每周 4 次',
        intensity: '全程心率监测、负荷自适应，避免过度训练导致疲劳、关节损伤',
        actions: ['膝关节伸展单元', '膝关节屈曲单元', '下肢蹬踏单元', '胸推测训单元', '坐式划船单元', '腹肌单元'],
        devices: [
          { id: '01', reason: '增肌提升 SMI 指数，改善肌少性肥胖体成分', dose: '设备轻–中阻力 12–15 次×3 组，组间休息 75 s，渐进增负荷', keyPoints: '股四头肌发力伸膝，末端不锁膝', contraindication: '髌股疼痛者减小活动度' },
          { id: '02', reason: '前后链增肌，平衡屈伸肌、提升步态稳定', dose: '设备轻–中阻力 10–12 次×2–3 组，离心 2–3 秒', keyPoints: '腘绳肌发力缓慢屈膝', contraindication: '后交叉韧带损伤史者禁用' },
          { id: '09', reason: '复合蹬踏同步增肌 + 稳态燃脂', dose: '低–中阻力 15–20 次×2–3 组，心率（220-年龄）×55–65%', keyPoints: '全脚掌发力、膝足同向', contraindication: '严重膝骨关节炎急性期暂缓' },
          { id: '05', reason: '上肢推类增肌，提升瘦体重储备', dose: '轻–中阻力 10–15 次×2–3 组，肘不过伸', keyPoints: '肩胸发力前推，肩不耸起', contraindication: '肩撞击综合征者减小活动度' },
          { id: '06', reason: '上肢拉保肌，改善圆肩驼背、维持握持', dose: '轻–中阻力 12–15 次×2–3 组', keyPoints: '肩胛先动后拉，握把自然', contraindication: '肩袖损伤急性期禁用' },
          { id: '03', reason: '核心稳定，支撑增肌与燃脂训练', dose: '自重/轻阻 12–15 次×2–3 组，或等长 15 秒×3 组', keyPoints: '腹发力前屈、颈部放松', contraindication: '腹压增高疾病避免用力收腹' }
        ],
        rules: ['肌肉提升慢则加大设备抗阻占比', '体脂下降慢则微调有氧时长', '每次复查后系统自动偏移训练重心']
      },
      aerobic: '每周 3 次温和有氧（慢走、太极、低冲击设备有氧），单次 15-20 分钟，与抗阻训练同日交替或隔日进行。',
      diet: [
        ['核心配比', '高蛋白、中低碳、低脂肪'],
        ['蛋白质', '1.3-1.5 g/kg 体重，最大化保留、合成肌肉'],
        ['碳水', '替换为粗粮、杂粮，减少精制碳水，平稳血糖、减少脂肪堆积'],
        ['脂肪', '严格控制动物油脂、油炸食品，保留少量优质脂肪（坚果、橄榄油）'],
        ['饮食习惯', '三餐规律、杜绝暴饮暴食、杜绝宵夜']
      ],
      lifestyle: ['先稳功能再塑体型，前 4 周以功能改善为主', '每日短时多次活动，杜绝久坐废用性衰弱', '保证睡眠与蛋白摄入节律', '每 2 个月复查体成分与肌力，动态调整方案'],
      reviewDays: 60
    }
  };

  /* ——— §7.5 独立跌倒预防专项方案（双版本，全风险等级适配） ——— */
  const FALL_PLAN = {
    tiers: {
      low: { freq: '每周 1–2 次维持性平衡 + 步态训练', aim: '预防功能退化', priority: false },
      mid: { freq: '每周 3 次专项平衡、步态、本体感觉训练', aim: '强化下肢稳定与核心控制', priority: false },
      high: { freq: '每周 4 次专项训练（优先执行）', aim: '优先降低跌倒风险，风险下降后再叠加增肌 / 减脂塑形训练，规避运动损伤与跌倒事故', priority: true }
    },
    home: {
      title: '老年徒手跌倒预防专项方案（居家零设备 · 高安全）',
      goalText: '提升静态 / 动态平衡、改善步态稳定性、强化下肢支撑力、纠正站姿坐姿、提升本体感觉，降低日常行走、起身、转身跌倒风险',
      duration: '单次 15–20 分钟',
      frequency: '每周 3–4 次，高风险人群须每日短时多次练习',
      intensity: '以动作稳定完成为准，RPE ≤ 11，全程可扶椅/靠墙',
      exercises: [
        { id: 'H19', name: '扶椅双脚并拢静态站立', target: '静态平衡、踝周本体感觉', dose: '10 秒/组，3 组，组间休息 20 秒', keyPoints: '手扶稳固椅背，双脚并拢，目视前方，呼吸自然，逐渐减轻扶手依赖', contraindication: '站立极度不稳、严重眩晕发作者暂缓' },
        { id: 'H20', name: '扶椅半串联站立', target: '缩小支撑面平衡、髋踝控制', dose: '10 秒/组，3 组，左右脚前后交换', keyPoints: '一脚尖对另一脚心，扶椅保持髋膝踝稳定，身体尽量不晃动', contraindication: '单脚无法负重、足部畸形或疼痛者改为双脚并拢站立' },
        { id: 'H22', name: '站姿重心左右转移（扶椅）', target: '动态平衡、转身稳定', dose: '每组 10 次，2 组，动作缓慢有控制', keyPoints: '双脚与肩同宽，重心缓慢左右移动，扶椅逐渐减力，避免身体扭转过快', contraindication: '站立平衡＜5 秒者改为坐姿重心转移' },
        { id: 'H23', name: '原地慢踏步（扶椅辅助）', target: '步态节律、下肢协调', dose: '每组 1–2 分钟，2 组，休息 30 秒', keyPoints: '高抬脚踏步、落地轻、步频均匀，扶椅保持身体直立', contraindication: '无法独立站立者改为坐姿交替抬腿' },
        { id: 'H25', name: '坐姿五次缓慢坐站（无手借力）', target: '下肢肌力、起坐功能', dose: '5 次/组，2–3 组，组间休息 45 秒', keyPoints: '坐椅缘，双脚后移，缓慢站起再缓慢坐下，尽量不借力，控制离心阶段', contraindication: '严重膝痛、站立后头晕明显者改为扶椅辅助' },
        { id: 'H11', name: '靠墙浅静蹲（最大屈膝 30°）', target: '股四头肌、膝踝稳定', dose: '保持 10–30 秒，分 2 组，组间休息 30 秒', keyPoints: '背贴墙，双脚前移，屈膝≤30°，均匀呼吸，膝不超过脚尖', contraindication: '膝关节术后、髌股疼痛综合征者慎用' },
        { id: 'H12', name: '站姿抬踵提小腿（扶椅）', target: '小腿三头肌、踝周力量', dose: '12 次/组，2 组，组间休息 30 秒', keyPoints: '手扶椅背，脚尖踮起停留 2 秒，缓慢落下，重心直上直下', contraindication: '跟腱病变、急性踝扭伤' },
        { id: 'H17', name: '靠墙骨盆后倾激活', target: '深层核心、躯干稳定', dose: '保持 5 秒/次，12 次/组，2 组', keyPoints: '背贴墙，小腹收紧使骨盆后倾贴墙，腰部贴实墙面', contraindication: '腰椎滑脱、严重骨质疏松者减小幅度' }
      ],
      progression: [
        '第 1–2 周：全部动作为初级，手扶椅背/靠墙，降低支撑面难度',
        '第 3–4 周：逐渐减少扶手依赖，增加单组保持时间或次数',
        '第 5 周起：低风险且 SPPB≥10 分者可尝试无扶手进阶，但须有人看护'
      ],
      safety: ['全程防滑地面', '需有人陪护', '禁止闭眼站立', '高风险人群禁止单脚长时间独立站立', '训练中出现头晕、胸痛、气短立即停止'],
      effect: '改善 SPPB 平衡得分、降低 CFS 衰弱带来的姿态不稳、解决步速不均与起身乏力问题'
    },
    device: {
      title: '鹊动设备跌倒预防专项方案（机构量化 · 精准降风险）',
      goalText: '依托鹊动设备量化负荷与姿态，精准训练核心稳定、下肢肌力、平衡控制、步态节律，数据可追溯、风险可量化下降',
      duration: '每周 2–3 次设备专项训练，搭配居家徒手巩固',
      frequency: '设备训练隔日进行，单次 20–30 分钟',
      devices: [
        { id: '09', name: '下肢蹬踏测训单元', short: '蹬踏', muscles: '小腿三头肌、股四头肌、臀大肌', reason: '髋膝伸链复合训练，直接提升起立与行走支撑力，是跌倒预防核心设备', dose: '低阻匀速 10–15 次×2–3 组，RPE 11–13，速度 60°/s，组间休息 60–90 秒', keyPoints: '全脚掌均匀发力，蹬伸至膝微屈不锁死，还原时控制速度，避免憋气', contraindication: '严重膝骨关节炎急性期、髋关节置换早期' },
        { id: '01', name: '膝关节伸展测训单元', short: '伸膝', muscles: '股四头肌', reason: '股四头肌力与起坐、上下楼及跌倒风险直接相关，专项强化伸膝肌群', dose: '轻–中等阻力 10–12 次×2–3 组，末端不锁膝，组间休息 60 秒', keyPoints: '勾脚使足背抵住软垫，股四头肌发力伸膝，缓慢放回，不弹震', contraindication: '髌骨脱位、膝关节不稳' },
        { id: '02', name: '膝关节屈曲测训单元', short: '屈膝', muscles: '股二头肌、半腱肌、半膜肌、腓肠肌', reason: '维持屈伸肌前后链平衡，降低步态失稳与跌倒风险', dose: '轻阻 10–12 次×2 组，离心阶段 2–3 秒，组间休息 60 秒', keyPoints: '勾脚，腘绳肌发力缓慢屈膝下压，控制还原', contraindication: '后交叉韧带损伤史者禁用' },
        { id: '04', name: '背肌测训单元', short: '背伸', muscles: '竖脊肌、臀大肌', reason: '改善躯干姿势控制与后链力量，减少驼背与后向失衡', dose: '轻阻 10–15 次×2 组，ROM 0–30°，组间休息 60 秒', keyPoints: '后背紧贴软垫，腰部发力缓慢后伸，禁憋气、禁弹震', contraindication: '腰椎滑脱、椎体压缩骨折' },
        { id: '03', name: '腹肌测训单元', short: '腹屈', muscles: '腹直肌、腹外斜肌、腹内斜肌、髂腰肌', reason: '躯干稳定是所有站立位活动与转移的基础，核心强化可降低躯干晃动', dose: '自重或轻阻 10–15 次×2 组，或等长收缩 10–20 秒×3 组', keyPoints: '收腹使躯干前屈，全程正常呼吸，不借颈部发力', contraindication: '腰椎间盘突出急性期、腹直肌分离' }
      ],
      safety: ['低速阈值锁定', '姿态偏移自动预警', '失衡自动停机', '负荷自适应降级', '训练中出现不适立即呼叫工作人员'],
      dataLink: '设备训练数据回传后，系统自动重新计算跌倒风险指数，动态调整后续训练强度与频次'
    },
    lifestyle: [
      '居家防跌倒改造：防滑地面、夜间照明、卫浴加装扶手',
      '起身三慢：慢坐、慢站、慢走，避免体位性低血压',
      'CFS 衰弱人群增加每日短时多次活动，杜绝久坐废用性衰弱',
      '合并骨关节不适者优先保护关节，降低活动恐惧导致的功能退化'
    ]
  };

  /* ——— §7.0.3 双方案统一适配原则（老年人专属） ——— */
  const COMMON_PRINCIPLES = [
    '禁止跳跃、冲刺、大负重、深度蹲跪、快速扭转等高风险动作',
    '所有动作区分初级 / 进阶梯度，适配不同肌力水平老人',
    '训练时长单次控制在 15–30 分钟，符合老年心肺耐受度',
    '抗阻以「低负荷、多次数、慢节奏、稳控制」为核心，优先提升肌肉质量与躯体功能，不追求极限力量',
    '所有训练附带老年专属安全提示、热身、放松流程，高风险用户默认叠加跌倒预防专项训练'
  ];

  /* ——— §7.0.2 系统智能推荐优先级规则 ——— */
  function preferPlan(ctx) {
    const homeReasons = [], deviceReasons = [];
    const age = n(ctx.age);
    const sppbT = ctx.sppb && ctx.sppb.complete ? ctx.sppb.total : null;

    if (sppbT != null && sppbT <= 9) homeReasons.push(`SPPB ${sppbT} 分 ≤ 9 分`);
    if (ctx.gaitEval && ctx.gaitEval.low) homeReasons.push('步速偏低');
    if (ctx.gripEval && ctx.gripEval.low) homeReasons.push('肌力偏弱');
    if (age != null && age >= 75) homeReasons.push(`高龄 ${age} 岁`);
    if (ctx.scene === 'home') homeReasons.push('居家自主训练场景');
    if (ctx.hasDevice === false) homeReasons.push('无鹊动设备');
    if (ctx.fallHistory) homeReasons.push('既往有跌倒史');
    if (ctx.jointIssue) homeReasons.push('骨关节不适');
    if (ctx.cfs && ctx.cfs.has && ctx.cfs.value >= 5) homeReasons.push(`CFS ${ctx.cfs.value} 级衰弱`);

    if (sppbT != null && sppbT >= 10) deviceReasons.push(`SPPB ${sppbT} 分 ≥ 10 分`);
    if (ctx.gaitEval && ctx.gaitEval.has && !ctx.gaitEval.low) deviceReasons.push('躯体功能良好');
    if (ctx.gripEval && ctx.gripEval.has && !ctx.gripEval.low) deviceReasons.push('肌力达标');
    if (ctx.scene === 'store') deviceReasons.push('在店干预场景');
    if (ctx.hasDevice === true) deviceReasons.push('可使用鹊动设备');
    if (ctx.cfs && ctx.cfs.has && ctx.cfs.value <= 3) deviceReasons.push('强健状态、行动稳定');

    let prefer;
    if (ctx.scene === 'home' || ctx.hasDevice === false) prefer = 'home';
    else if (homeReasons.length > deviceReasons.length) prefer = 'home';
    else if (deviceReasons.length > homeReasons.length) prefer = 'device';
    else prefer = homeReasons.length ? 'home' : 'device';

    return {
      prefer,
      homeReasons: homeReasons.length ? homeReasons : ['作为居家备选方案，任何场景均可执行'],
      deviceReasons: deviceReasons.length ? deviceReasons : ['需在店且具备鹊动设备条件时执行'],
      note: '双方案默认并列展示，首选方案高亮标注，备选方案可一键切换；方案频次、强度、干预目标与肌少症分级完全绑定。'
    };
  }

  /** 组装完整干预方案 */
  function buildPlan(direction, fall, ctx) {
    const base = PLAN_LIB[direction.key] || PLAN_LIB.maintain;
    const tier = FALL_PLAN.tiers[fall.levelKey];
    const pref = preferPlan(ctx);

    // —— 居家徒手智能匹配推荐（36 动作库 + 文档算法）——
    const GRADE_MAP = { maintain: 'A', gain: 'B', lose: 'C', both: 'D' };
    let exercisePlan = null;
    if (window.SarcExerciseLib && SarcExerciseLib.match) {
      try {
        exercisePlan = SarcExerciseLib.match({
          gradeKey: GRADE_MAP[direction.key] || 'A',
          fallIndex: fall.index,
          sppbTotal: ctx.sppb ? ctx.sppb.total : null,
          gender: ctx.gender,
          gripValue: ctx.gripEval ? ctx.gripEval.value : null,
          calfLow: ctx.calfEval ? ctx.calfEval.low : false,
          gaitValue: ctx.gaitEval ? ctx.gaitEval.value : null,
          smiLow: ctx.body ? ctx.body.smiLow : false,
          visceral: ctx.body ? ctx.body.vis : null,
          bmi: ctx.bmi,
          bodyFat: ctx.body ? ctx.body.fat : null,
          cfsValue: ctx.cfs && ctx.cfs.has ? ctx.cfs.value : null
        });
      } catch (e) { console.warn('[肌少症模块] 居家动作匹配失败', e); exercisePlan = null; }
    }

    return {
      direction: direction.key,
      goal: base.goal,
      prefer: pref,
      home: Object.assign({}, base.home, { exercisePlan }),
      device: base.device,
      aerobic: base.aerobic,
      diet: base.diet,
      lifestyle: base.lifestyle,
      principles: COMMON_PRINCIPLES,
      fall: {
        tier, levelKey: fall.levelKey, level: fall.level, index: fall.index,
        priority: tier.priority,
        home: FALL_PLAN.home, device: FALL_PLAN.device, lifestyle: FALL_PLAN.lifestyle
      },
      reviewDays: base.reviewDays,
      reviewDate: (() => { const d = new Date(); d.setDate(d.getDate() + base.reviewDays); return d.toISOString().slice(0, 10); })()
    };
  }

  /* ==================================================================
   * 11. 禁忌筛查（§3.2 步骤 1）
   * ================================================================== */
  const CONTRA_ITEMS = [
    { key: 'acute', label: '近期急性疾病发作（急性感染、心衰急性期、急性心脑血管事件等）' },
    { key: 'surgery', label: '近 3 个月内接受过手术，尚未获得医生运动许可' },
    { key: 'fracture', label: '存在未愈合骨折 / 严重骨质疏松合并病理性骨折风险' },
    { key: 'bedridden', label: '重度行动障碍、长期卧床、无法独立完成站立与行走测试' },
    { key: 'unstable', label: '未控制的重度高血压、严重心律失常、不稳定心绞痛' },
    { key: 'cognition', label: '严重认知障碍，无法配合完成测评指令' }
  ];

  function evalContra(ans, age) {
    ans = ans || {};
    const hit = CONTRA_ITEMS.filter(it => ans[it.key] === true || ans[it.key] === 'yes');
    const a = n(age);
    const ageOk = a != null && a >= TH.minAge;
    return {
      hit, blocked: hit.length > 0 || !ageOk,
      ageOk, age: a,
      ageMsg: a == null ? '未获取到年龄信息，请先在患者档案补充出生日期或年龄。'
        : (ageOk ? `年龄 ${a} 岁 ≥ 60 周岁，符合本模块适用人群。` : `年龄 ${a} 岁 ＜ 60 周岁，未达到本模块适用年龄（60 周岁及以上）。`),
      msg: hit.length
        ? '存在评估禁忌项，按规范须终止本次测评并提示暂缓，待相关状况稳定并取得临床许可后再行评估。'
        : (ageOk ? '未发现评估禁忌，可继续进行肌少症专项评估。' : '未达到本模块适用年龄要求。')
    };
  }

  /* ==================================================================
   * 12. 一次性完整运算（步骤 5 / 6）
   * ================================================================== */
  function computeAll(draft, patient) {
    const gender = (patient && patient.gender) || draft.gender || 'male';
    const age = (patient && patient.age != null) ? patient.age : draft.age;

    const calfEval = evalCalf(draft.calf, gender);
    const gripEval = evalGrip(draft.grip, gender);
    const gaitEval = evalGait(draft.gait);
    const body = evalBody(draft.body, gender);
    const sppb = evalSPPB(draft.gait, draft.balanceKey, draft.chairSec, draft.chairCannot);
    const cfs = evalCFS(draft.cfs);
    const sarcf = evalSarcF(draft.sarcf);
    const life = evalLifeSurvey(draft.life);
    const mnasf = evalMnaSF(draft.mnasf);
    const amt = evalAmt(draft.amt);
    const fearFall = evalFearFall(draft.fearFall);
    const strength = draft.strength || null;

    const fall = fallRiskIndex({ gender, gripEval, strength, sppb, gaitEval, cfs, body, calfEval, sarcf, health: draft.health, exam: draft.exam, fearFall });
    const direction = decideDirection({ calfEval, gripEval, gaitEval, body, sppb, sarcf, strength, mnasf, health: draft.health });

    const fallHistory = n((sarcf.detail.find(d => d.key === 'c') || {}).value) > 0;
    const jointIssue = n((draft.life || {}).jointDisease) > 0;
    const bmi = (patient && patient.height && patient.weight)
      ? Math.round(patient.weight / Math.pow(patient.height / 100, 2) * 10) / 10 : null;
    const plan = buildPlan(direction, fall, {
      age, gender, bmi, body, sppb, gaitEval, gripEval, calfEval, cfs, sarcf,
      scene: draft.scene || 'store',
      hasDevice: draft.hasDevice !== false,
      fallHistory, jointIssue
    });

    return { gender, age, calfEval, gripEval, gaitEval, body, sppb, cfs, sarcf, life, strength, fall, direction, plan, mnasf, amt, fearFall, health: draft.health, exam: draft.exam, exercise: draft.exercise, jointIssue, fallHistory, bmi };
  }

  /* ==================================================================
   * 13. 对外暴露
   * ================================================================== */
  window.SarcDB = SarcDB;
  window.SarcCore = {
    TH, CFS_LEVELS, BALANCE_OPTS, SARCF_ITEMS, LIFE_SECTIONS, LIFE_MAX,
    MNA_SF_ITEMS, AMT_ITEMS, FEAR_FALL_ITEMS,
    CONTRA_ITEMS, DIRECTIONS, PLAN_LIB, FALL_PLAN, COMMON_PRINCIPLES,
    num: n, round1: r1,
    evalContra, evalCalf, evalGrip, evalGait, evalBody, evalSPPB, evalCFS,
    evalSarcF, evalLifeSurvey, evalMnaSF, evalAmt, evalFearFall,
    fallRiskIndex, decideDirection, preferPlan, buildPlan, computeAll
  };
})();
