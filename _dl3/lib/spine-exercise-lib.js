/**
 * SpineExerciseLib —— 青少年脊柱健康模块·居家徒手动作库（27 个）
 *
 * 数据来源：参照《鹊动青少年脊柱健康》方案库（施罗斯体系 / 核心稳定 / 姿态再教育 /
 *           牵伸放松 / 呼吸胸廓扩张 / 平衡本体感觉）+ 智能匹配推荐算法占位
 * 对外暴露：window.SpineExerciseLib
 *   · CATS             6 大动作分类
 *   · EXERCISES        27 个徒手动作（分类 / 难度梯度 / 参数 / 要点 / 适配标签 / 姿态）
 *   · getExercises / saveExercise / deleteExercise / resetDefault / figureSVG
 *   · 持久化：专属 localStorage 前缀 qd_spine_exercise_library（与肌少症动作库完全隔离）
 */
(function () {
  'use strict';

  const STORE_KEY = 'qd_spine_exercise_library';

  const CATS = [
    { key: 'scoliosis', label: '脊柱侧弯特异性训练', range: 'S01–S06' },
    { key: 'core', label: '核心稳定', range: 'C01–C05' },
    { key: 'posture', label: '姿态控制与再教育', range: 'P01–P04' },
    { key: 'stretch', label: '牵伸放松', range: 'T01–T05' },
    { key: 'breath', label: '呼吸与胸廓扩张', range: 'B01–B03' },
    { key: 'balance', label: '平衡与本体感觉', range: 'L01–L04' }
  ];

  // 医嘱注释（管理员可在库内维护）
  const NOTES = {
    'S01': '向凹侧主动侧屈，配合旋转角呼吸，每日 2–3 组，禁止憋气',
    'S02': '坐姿下旋转胸廓向凸侧，拉长凹侧，改善旋转畸形',
    'S03': '向凹侧侧屈牵伸，松解挛缩的凹侧软组织',
    'S04': '逐节活动脊柱，动作缓慢不弹振，改善僵硬',
    'S05': '悬吊利用自重纵向减压，每次 15–30 秒，手腕不适即停',
    'S06': '骨盆前后倾激活深层稳定肌，腰贴地不悬空',
    'C01': '腰腹贴地，对侧手脚缓慢伸展，避免腰部代偿',
    'C02': '四点支撑交替伸展，核心收紧不塌腰',
    'C03': '平板支撑保持中立位，肩髋踝成线，避免塌腰撅臀',
    'C04': '坐姿收腹抗旋转，改善躯干侧移',
    'C05': '仰卧臀桥，激活臀肌与竖脊肌，膝关节不内扣',
    'P01': '后脑/肩/臀/小腿/脚跟贴墙，每日靠墙站立 3–5 分钟',
    'P02': '收下巴做出双下巴，激活颈深屈肌，改善头前伸',
    'P03': '肩胛后缩下沉，打开胸廓，改善圆肩含胸',
    'P04': '头顶书本平衡行走，再教育直立姿态',
    'T01': '门框扩胸，松解胸小肌，改善含胸',
    'T02': ' overhead 拉伸背阔肌，改善双肩不等高',
    'T03': '坐姿体前屈牵伸腘绳肌，缓解腰椎代偿',
    'T04': '弓步拉伸髂腰肌，改善骨盆前倾',
    'T05': '颈部侧屈拉伸，缓解颈肩紧张',
    'B01': '腹式呼吸，膈肌下沉，放松交感神经',
    'B02': '向凹侧胸廓扩张，改善肺通气不对称',
    'B03': '吹气球训练提升胸廓活动度',
    'L01': '单脚站立睁眼，从 10 秒逐步延长',
    'L02': '软垫上站立提升本体感觉，旁人看护',
    'L03': '原地慢踏步统一步频',
    'L04': '瑜伽球坐姿平衡，激活核心稳定'
  };

  // posture: seated 坐姿 / stand_support 扶椅或靠墙 / prone 俯卧 / stand_free 无扶手站立进阶
  //          side_lying 侧卧（施罗斯） / supine 仰卧
  // level: ['初级'] 或 ['初级','进阶']
  const RAW = [
    // —— 脊柱侧弯特异性训练 ——
    [1, 'scoliosis', '侧卧位腰部侧弯反张（施罗斯 50X）', ['初级', '进阶'], 'side_lying', '向凹侧侧屈 10 秒/次，10 次/组，2 组', '凹侧在上，主动向凹侧顶腰，配合呼气', '特发性脊柱侧弯（C 形/L 形）', 'Cobb 角 10°–45°、ATR≥5°'],
    [2, 'scoliosis', '坐姿旋转角呼吸', ['初级'], 'seated', '每组 8 次旋转呼吸，2 组', '向凸侧旋转胸廓，凹侧吸气扩张', '胸弯为主', ''],
    [3, 'scoliosis', '站姿向凹侧侧弯牵伸', ['初级'], 'stand_support', '保持 15 秒/侧，2 组', '手扶支撑物，向凹侧缓慢侧屈', '单侧弯明显', '急性疼痛期暂缓'],
    [4, 'scoliosis', '猫牛式脊柱逐节活动', ['初级'], 'prone', '每组 10 次，2 组', '四点支撑下缓慢拱背—塌腰，逐节活动', '脊柱僵硬、久坐青少年', ''],
    [5, 'scoliosis', '门框悬挂纵向减压', ['初级', '进阶'], 'stand_support', '悬吊 15–30 秒/次，2–3 次', '双手抓门框自然悬垂，利用自重减压', '课后/久坐后放松', '手腕不适、肩袖损伤者禁用'],
    [6, 'scoliosis', '骨盆倾斜激活训练', ['初级'], 'seated', '每组 12 次，2 组', '坐直下骨盆前后倾，激活深层核心', '骨盆倾斜、腰骶不稳', ''],

    // —— 核心稳定 ——
    [7, 'core', '死虫式（对侧伸展）', ['初级'], 'supine', '每侧 10 次，2 组', '仰卧腰贴地，对侧手脚缓慢伸展', '核心薄弱、腰椎失稳', '腰部悬空者减小幅度'],
    [8, 'core', '鸟狗式（四点支撑）', ['初级', '进阶'], 'prone', '每侧 10 次，2 组', '四点支撑下对侧手脚伸出，核心不塌', '躯干侧移、核心不稳', ''],
    [9, 'core', '平板支撑（中立位）', ['初级', '进阶'], 'stand_free', '保持 20–40 秒，2 组', '肩髋踝成直线，核心收紧不塌腰', '核心耐力不足', '腕/肩不适改跪姿'],
    [10, 'core', '坐姿抗旋转（弹力带）', ['初级'], 'seated', '每侧 12 次，2 组', '坐姿下拉弹力带对抗旋转', '躯干旋转控制差', ''],
    [11, 'core', '臀桥（仰卧）', ['初级'], 'supine', '每组 12 次，2 组', '仰卧屈膝抬臀，激活臀肌与竖脊肌', '骨盆前倾、臀肌无力', ''],

    // —— 姿态控制与再教育 ——
    [12, 'posture', '靠墙山式站立', ['初级'], 'stand_support', '每日 3–5 分钟', '后脑/肩/臀/小腿/脚跟贴墙', '头前伸、圆肩、姿态不良', ''],
    [13, 'posture', '坐姿收下巴（颈深屈肌）', ['初级'], 'seated', '每组 10 次，2 组', '收下巴做出双下巴，激活颈深屈肌', '头前伸、颈肩紧张', ''],
    [14, 'posture', '肩胛骨后缩下沉', ['初级'], 'seated', '每组 12 次，2 组', '双肩向后向下夹紧 3 秒', '圆肩含胸、翼状肩胛', ''],
    [15, 'posture', '头顶书本平衡行走', ['初级'], 'seated', '每组 1–2 分钟，2 组', '头顶书本直立行走再教育姿态', '姿态再教育（轻度）', '平衡差者先原地站立'],

    // —— 牵伸放松 ——
    [16, 'stretch', '门框扩胸牵伸', ['初级'], 'stand_support', '每侧停留 15 秒，2 组', '前臂贴门框，身体前倾扩胸', '含胸、胸肌紧张', ''],
    [17, 'stretch', '背阔肌 overhead 拉伸', ['初级'], 'stand_support', '每侧停留 15 秒，2 组', '单臂上举扶墙，对侧侧屈', '双肩不等高、背阔肌紧张', ''],
    [18, 'stretch', '坐姿腘绳肌前屈牵伸', ['初级'], 'seated', '每侧停留 15 秒，2 组', '单腿伸直体前缓慢下探', '腘绳肌紧张、腰椎代偿', ''],
    [19, 'stretch', '髂腰肌弓步拉伸', ['初级'], 'stand_support', '每侧停留 15 秒，2 组', '前后弓步下沉髋部', '骨盆前倾、髂腰肌短缩', '膝痛者减小幅度'],
    [20, 'stretch', '颈部侧屈拉伸', ['初级'], 'seated', '每侧停留 10 秒，2 组', '坐姿头缓慢向左右倾斜', '颈肩紧张', ''],

    // —— 呼吸与胸廓扩张 ——
    [21, 'breath', '腹式呼吸训练', ['初级'], 'supine', '每组 6 次深呼吸，3 组', '仰卧腹式呼吸，膈肌下沉', '呼吸模式异常、交感紧张', ''],
    [22, 'breath', '凹侧胸廓扩张呼吸', ['初级'], 'seated', '每组 8 次，2 组', '向凹侧主动扩张胸廓吸气', '胸弯、通气不对称', ''],
    [23, 'breath', '吹气球胸廓训练', ['初级'], 'seated', '每组 5 次，2 组', '缓慢吹胀气球提升胸廓活动度', '胸廓活动度不足', '肺大泡者禁用'],

    // —— 平衡与本体感觉 ——
    [24, 'balance', '单脚站立（睁眼）', ['初级', '进阶'], 'stand_free', '每侧 10–30 秒，3 组', '无扶手单脚站立，旁人看护', '动态平衡弱、易扭伤', '高风险者扶墙'],
    [25, 'balance', '平衡垫站立', ['初级'], 'stand_support', '每组 1 分钟，2 组', '软垫上扶椅站立提升本体感觉', '本体感觉减退', ''],
    [26, 'balance', '原地慢踏步', ['初级'], 'stand_support', '每组 1–2 分钟，2 组', '慢速高抬脚踏步统一步频', '步态拖沓、协调性差', ''],
    [27, 'balance', '瑜伽球坐姿平衡', ['初级'], 'seated', '每组 1 分钟，2 组', '坐瑜伽球上保持平衡激活核心', '核心稳定、坐姿不良', '球大小适配身高']
  ];

  let EXERCISES = RAW.map(r => ({
    id: r[1].slice(0, 1).toUpperCase() + String(r[0]).padStart(2, '0'),
    no: r[0],
    cat: r[1],
    catLabel: (CATS.find(c => c.key === r[1]) || {}).label || r[1],
    name: r[2],
    levels: r[3],
    levelLabel: r[3].join('/'),
    posture: r[4],
    params: r[5],
    points: r[6],
    audience: r[7],
    tags: r[8] ? r[8].split('、').map(s => s.trim()).filter(Boolean) : [],
    note: NOTES[(r[1].slice(0, 1).toUpperCase() + String(r[0]).padStart(2, '0'))] || '',
    video: '', image: ''
  }));
  // 快照副本，用于 resetDefault 精确还原
  const DEFAULT_EXERCISES = EXERCISES.map(e => Object.assign({}, e));
  let byId = {}; EXERCISES.forEach(e => byId[e.id] = e);
  function rebuildIndex() { byId = {}; EXERCISES.forEach(e => byId[e.id] = e); }

  /* ---------- 持久化层（管理员在动作库编辑页维护，覆盖默认动作库） ---------- */
  function rd(key, def) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; }
    catch (e) { console.error('[脊柱健康动作库] 读取失败', key, e); return def; }
  }
  function wr(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.error('[脊柱健康动作库] 写入失败', key, e); return false; }
  }

  async function getExercises() {
    try {
      const list = rd(STORE_KEY, null);
      if (Array.isArray(list) && list.length) return list.slice();
    } catch (e) {}
    return EXERCISES.slice(); // 返回副本，避免调用方污染模块内默认数组
  }
  async function saveExercise(obj) {
    const list = await getExercises();
    const idx = list.findIndex(x => x.id === obj.id);
    if (idx >= 0) list[idx] = obj; else list.push(obj);
    wr(STORE_KEY, list);
    return list;
  }
  async function deleteExercise(id) {
    const list = (await getExercises()).filter(x => x.id !== id);
    wr(STORE_KEY, list);
    return list;
  }
  async function reload() { EXERCISES = await getExercises(); rebuildIndex(); return EXERCISES; }
  function resetDefault() {
    wr(STORE_KEY, DEFAULT_EXERCISES);
    EXERCISES = DEFAULT_EXERCISES; rebuildIndex(); return EXERCISES;
  }
  function seedToSpineLibrary() {
    const existing = rd(STORE_KEY, null);
    if (Array.isArray(existing) && existing.length >= EXERCISES.length) return 0;
    wr(STORE_KEY, EXERCISES);
    return EXERCISES.length;
  }

  /* ---------- 动作示意图（按姿态生成简笔人形 SVG） ---------- */
  function figureSVG(posture) {
    const c = '#7c3aed';
    let body;
    if (posture === 'seated') {
      body = `<rect x="12" y="40" width="40" height="6" rx="3" fill="${c}" opacity=".22"/><circle cx="32" cy="20" r="6" fill="${c}"/><line x1="32" y1="26" x2="32" y2="40" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="40" x2="18" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="40" x2="46" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="30" x2="22" y2="34" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="30" x2="42" y2="34" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (posture === 'stand_support') {
      body = `<line x1="52" y1="12" x2="52" y2="56" stroke="${c}" stroke-width="3" stroke-linecap="round" opacity=".4"/><circle cx="30" cy="18" r="6" fill="${c}"/><line x1="30" y1="24" x2="30" y2="42" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="42" x2="22" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="42" x2="38" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="28" x2="50" y2="30" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="30" y1="28" x2="20" y2="32" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (posture === 'prone') {
      // 四点支撑（鸟狗/猫牛）
      body = `<line x1="14" y1="40" x2="50" y2="40" stroke="${c}" stroke-width="4" stroke-linecap="round"/><circle cx="18" cy="34" r="5" fill="${c}"/><line x1="14" y1="40" x2="14" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="40" x2="50" y2="52" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="18" y1="34" x2="12" y2="26" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="40" x2="56" y2="30" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    } else if (posture === 'side_lying') {
      body = `<rect x="6" y="30" width="52" height="6" rx="3" fill="${c}" opacity=".22"/><circle cx="22" cy="22" r="6" fill="${c}"/><line x1="22" y1="28" x2="20" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="20" y1="33" x2="44" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="44" y1="33" x2="50" y2="22" stroke="${c}" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
    } else if (posture === 'supine') {
      body = `<rect x="8" y="26" width="48" height="14" rx="7" fill="${c}" opacity=".12"/><circle cx="16" cy="22" r="5" fill="${c}"/><line x1="14" y1="33" x2="52" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/><path d="M16 22 Q14 28 14 33" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    } else {
      body = `<circle cx="32" cy="15" r="6" fill="${c}"/><line x1="32" y1="21" x2="32" y2="42" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="42" x2="24" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="42" x2="40" y2="56" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="27" x2="22" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/><line x1="32" y1="27" x2="42" y2="33" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`;
    }
    return `<svg viewBox="0 0 64 64" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;"><rect x="0" y="0" width="64" height="64" rx="10" fill="${c}" opacity=".06"/>${body}</svg>`;
  }

  /* ---------- 智能匹配推荐算法（占位，供智能方案模块调用） ---------- */
  function match(ctx) {
    ctx = ctx || {};
    const flag = ctx.cobb != null ? (ctx.cobb >= 20 ? 'mid' : (ctx.cobb >= 10 ? 'low' : 'none')) : 'none';
    const status = {};
    EXERCISES.forEach(e => status[e.id] = 'optional');
    if (flag === 'low') {
      ['S01', 'S03', 'P01', 'P02', 'P03', 'T01', 'B01'].forEach(id => { if (status[id] !== 'forbidden') status[id] = 'recommend'; });
    } else if (flag === 'mid') {
      ['S01', 'S02', 'S03', 'S04', 'C01', 'C02', 'P01', 'P03', 'B02', 'T01', 'L01'].forEach(id => { if (status[id] !== 'forbidden') status[id] = 'recommend'; });
    }
    const recommended = EXERCISES.filter(e => status[e.id] === 'recommend').map(e => e.id);
    const optional = EXERCISES.filter(e => status[e.id] === 'optional').map(e => e.id);
    const forbidden = EXERCISES.filter(e => status[e.id] === 'forbidden').map(e => e.id);
    const safety = ['动作缓慢可控、不弹振、不憋气', '急性疼痛或骨折期暂缓', '侧弯角度大者需专业评估后定制'];
    return { flag, recommended, optional, forbidden, safety };
  }

  window.SpineExerciseLib = {
    CATS, EXERCISES, byId, NOTES,
    match, seedToSpineLibrary, figureSVG,
    getExercises, saveExercise, deleteExercise, reload, resetDefault
  };
})();
