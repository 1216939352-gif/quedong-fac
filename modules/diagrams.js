/**
 * 鹊动FAC功能评估与干预系统 - 运动动作示意图库（内联 SVG）
 * 覆盖柔韧拉伸 9 组、平衡训练 8 组、基础抗阻 7 组
 * 全部矢量绘制，无外部图片依赖，打印不失真
 */

(function () {
  const S = (inner, vb) =>
    `<svg viewBox="${vb || '0 0 140 130'}" xmlns="http://www.w3.org/2000/svg" fill="none" ` +
    `stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  // 通用元素
  const GROUND = '<line x1="8" y1="120" x2="132" y2="120" stroke="#cbd5e1" stroke-width="2.5" stroke-dasharray="5 4"/>';
  const P = '#f26522';  // 主色（发力/目标肌）
  const B = '#334155';  // 躯干
  const A = '#94a3b8';  // 辅助
  const G = '#22c55e';  // 提示箭头

  const head = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r || 9}" stroke="${B}" stroke-width="3"/>`;
  const line = (x1, y1, x2, y2, c, w) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c || B}" stroke-width="${w || 3.4}"/>`;
  const path = (d, c, w, dash) => `<path d="${d}" stroke="${c || B}" stroke-width="${w || 3.4}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  const arrow = (d, c) => `<path d="${d}" stroke="${c || G}" stroke-width="2.4" marker-end="url(#ah)"/>`;
  const DEFS = `<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${G}"/></marker></defs>`;

  /* ==================== 柔韧性拉伸 9 组 ==================== */
  const FLEX = [
    {
      id: 'f1', name: '颈部侧屈拉伸', target: '上斜方肌、肩胛提肌',
      duration: '每侧 30 秒 × 2 次',
      key: '坐直或站直，右手轻扶头左侧，缓慢向右侧屈，左肩主动下沉；感受左侧颈肩牵拉，不可耸肩、不可猛拉。',
      caution: '有颈椎病史者力度减半，出现手臂麻木立即停止。',
      svg: S(DEFS +
        line(70, 118, 70, 62, B, 4) +                       // 躯干
        `<circle cx="80" cy="45" r="11" stroke="${B}" stroke-width="3"/>` + // 头（右倾）
        path('M70 68 L48 74', A) +                          // 左肩下沉臂
        path('M48 74 L44 100', A) +
        path('M70 66 L95 60 L88 40', P) +                   // 右手扶头
        line(56, 118, 70, 100, B) + line(84, 118, 70, 100, B) +
        arrow('M40 60 L34 84') +                            // 左肩下沉箭头
        `<text x="18" y="96" font-size="9" fill="${G}">下沉</text>` +
        GROUND)
    },
    {
      id: 'f2', name: '胸大肌门框拉伸', target: '胸大肌、胸小肌、肩前束',
      duration: '每侧 30 秒 × 2 次',
      key: '手臂屈肘 90°，前臂贴门框，肩肘同高；躯干缓慢向前转移重心至胸前有牵拉感，保持挺胸收下巴。',
      caution: '肩关节疼痛或既往脱位者降低手臂高度。',
      svg: S(DEFS +
        `<rect x="18" y="12" width="9" height="108" fill="#e2e8f0"/>` +  // 门框
        head(74, 40) +
        line(74, 50, 74, 96, B, 4) +
        path('M74 60 L44 56 L30 40', P) +                    // 前臂贴框
        path('M74 62 L98 74', A) +
        line(74, 96, 62, 120, B) + line(74, 96, 90, 120, B) +
        arrow('M100 52 L118 52') +
        `<text x="96" y="44" font-size="9" fill="${G}">前移重心</text>` +
        GROUND)
    },
    {
      id: 'f3', name: '背阔肌侧向伸展', target: '背阔肌、腰方肌',
      duration: '每侧 30 秒 × 2 次',
      key: '站立双脚与髋同宽，双手上举交握，躯干向一侧缓慢侧屈，骨盆保持稳定不外顶；呼气时加深幅度。',
      caution: '腰椎间盘突出急性期避免大幅侧屈。',
      svg: S(DEFS +
        path('M66 118 C 66 96, 68 78, 78 62', B, 4) +        // 侧屈躯干
        head(86, 48) +
        path('M78 62 C 92 46, 104 34, 108 24', P) +          // 上举双臂
        path('M78 64 C 90 50, 100 38, 106 30', P) +
        line(58, 120, 66, 100, B) + line(76, 120, 66, 100, B) +
        arrow('M112 42 C 118 56, 116 70, 106 80') +
        `<text x="96" y="98" font-size="9" fill="${G}">侧向拉长</text>` +
        GROUND)
    },
    {
      id: 'f4', name: '仰卧脊柱旋转拉伸', target: '腰背筋膜、臀中肌、胸腰段',
      duration: '每侧 30 秒 × 2 次',
      key: '仰卧屈膝，双臂侧平举；双膝并拢缓慢倒向一侧，头转向反方向，双肩始终贴地。',
      caution: '倒膝幅度以肩不离地为限，孕期避免。',
      svg: S(DEFS +
        line(20, 96, 96, 96, B, 4) +                         // 躯干（仰卧）
        head(108, 92) +
        line(52, 96, 52, 70, A) + line(52, 70, 84, 66, A) +  // 上举侧臂
        line(52, 96, 40, 74, A) +
        path('M96 96 C 96 112, 78 118, 62 116', P, 4) +      // 屈膝倒向
        path('M92 100 C 92 116, 76 122, 58 120', P, 4) +
        arrow('M108 108 L84 118') +
        `<text x="14" y="76" font-size="9" fill="${G}">双肩贴地</text>` +
        `<line x1="8" y1="126" x2="132" y2="126" stroke="#cbd5e1" stroke-width="2.5"/>`, '0 0 140 132')
    },
    {
      id: 'f5', name: '半跪髂腰肌拉伸', target: '髂腰肌、股直肌（久坐人群首选）',
      duration: '每侧 30 秒 × 3 次',
      key: '半跪位，后侧腿膝盖着地；主动收紧臀部使骨盆后倾，重心缓慢前移，感受后侧腿大腿根部牵拉。',
      caution: '膝盖下垫软垫；避免腰部塌陷代偿。',
      svg: S(DEFS +
        head(62, 34) +
        line(62, 44, 62, 82, B, 4) +
        path('M62 82 L92 96 L92 120', B) +                   // 前腿屈膝
        path('M92 96 L112 120', A, 3) +
        path('M62 82 L40 112 L18 118', P, 4) +               // 后腿跪地
        line(62, 56, 84, 66, A) + line(62, 56, 44, 68, A) +
        arrow('M100 60 L116 76') +
        `<text x="88" y="52" font-size="9" fill="${G}">重心前移</text>` +
        `<text x="12" y="106" font-size="9" fill="${P}">牵拉侧</text>` +
        GROUND)
    },
    {
      id: 'f6', name: '站姿股四头肌拉伸', target: '股四头肌、股直肌',
      duration: '每侧 30 秒 × 2 次',
      key: '单手扶墙保持平衡，同侧手握住脚踝将足跟拉向臀部；大腿保持垂直、膝并拢，臀部收紧防止腰椎前凸。',
      caution: '膝关节疼痛者改为俯卧位毛巾辅助拉伸。',
      svg: S(DEFS +
        `<rect x="112" y="14" width="9" height="106" fill="#e2e8f0"/>` +
        head(58, 34) +
        line(58, 44, 58, 86, B, 4) +
        line(58, 86, 56, 120, B) +                           // 支撑腿
        path('M58 86 C 62 100, 58 110, 44 106', P, 4) +      // 屈膝后拉
        path('M58 74 C 46 92, 42 102, 44 106', P, 3) +       // 手握踝
        line(58, 58, 108, 50, A) +                           // 扶墙手
        arrow('M30 100 L44 92') +
        `<text x="6" y="116" font-size="9" fill="${G}">足跟贴臀</text>` +
        GROUND)
    },
    {
      id: 'f7', name: '坐姿腘绳肌体前屈', target: '腘绳肌、小腿三头肌、下背',
      duration: '30 秒 × 3 次',
      key: '坐姿一腿伸直勾脚尖，另一腿屈膝内收；以髋为轴挺胸前倾（非弓背），双手沿小腿前伸至牵拉点。',
      caution: '禁止弹震式下压；腰痛者保持背部中立。',
      svg: S(DEFS +
        head(52, 46) +
        path('M52 56 C 60 68, 68 78, 78 84', B, 4) +          // 前倾躯干
        line(58, 108, 118, 108, P, 4) +                       // 伸直腿
        path('M118 108 L122 94', P, 3) +                      // 勾脚
        path('M58 108 C 74 96, 84 100, 88 112', A, 3.2) +     // 屈膝腿
        path('M78 84 C 92 90, 106 98, 114 104', A, 3) +       // 手前伸
        arrow('M74 62 L96 78') +
        `<text x="20" y="76" font-size="9" fill="${G}">髋为轴</text>` +
        `<line x1="8" y1="118" x2="132" y2="118" stroke="#cbd5e1" stroke-width="2.5"/>`)
    },
    {
      id: 'f8', name: '仰卧梨状肌"4"字拉伸', target: '臀大肌、梨状肌、髋外旋肌群',
      duration: '每侧 30 秒 × 2 次',
      key: '仰卧，一侧踝置于对侧膝上呈"4"字；双手抱住支撑腿大腿后侧向胸口拉近，头肩放松贴地。',
      caution: '髋关节置换术后遵医嘱；避免颈部紧张。',
      svg: S(DEFS +
        line(16, 100, 66, 100, B, 4) +
        head(10, 98, 8) +
        path('M66 100 C 82 98, 90 84, 88 68', B, 4) +          // 支撑腿大腿
        path('M88 68 C 100 62, 112 66, 116 78', B, 3.4) +      // 小腿
        path('M66 104 C 84 112, 100 104, 96 88', P, 4) +       // 交叉腿
        path('M96 88 L74 74', P, 3.4) +
        path('M52 100 C 66 84, 78 74, 88 70', A, 2.8) +        // 手抱腿
        arrow('M104 46 L86 60') +
        `<text x="96" y="40" font-size="9" fill="${G}">拉向胸口</text>` +
        `<line x1="4" y1="112" x2="136" y2="112" stroke="#cbd5e1" stroke-width="2.5"/>`)
    },
    {
      id: 'f9', name: '靠墙小腿三头肌拉伸', target: '腓肠肌、比目鱼肌、跟腱',
      duration: '每侧 30 秒 × 2 次（直膝+屈膝各一组）',
      key: '双手扶墙，后腿伸直、足跟踩实地面、脚尖朝前；重心前移至小腿后侧牵拉。屈膝版本可拉伸比目鱼肌。',
      caution: '跟腱炎急性期避免过度牵拉。',
      svg: S(DEFS +
        `<rect x="112" y="10" width="10" height="110" fill="#e2e8f0"/>` +
        head(50, 40) +
        path('M50 50 C 58 62, 66 70, 72 76', B, 4) +
        path('M72 76 L96 100 L96 120', B) +                    // 前腿
        path('M72 76 L44 110 L28 120', P, 4) +                 // 后腿伸直
        path('M28 120 L18 120', P, 4) +                        // 足跟踩实
        line(60, 60, 110, 44, A) + line(62, 66, 110, 54, A) +
        arrow('M74 46 L96 60') +
        `<text x="6" y="108" font-size="9" fill="${P}">足跟不离地</text>` +
        GROUND)
    }
  ];

  /* ==================== 平衡功能训练 8 组 ==================== */
  const BALANCE = [
    {
      id: 'b1', name: '双足并拢站立', level: 1, levelText: '入门',
      duration: '30 秒 × 3 组',
      target: '静态平衡基础、踝策略',
      key: '双脚完全并拢，双手自然垂放身侧，目视前方 3 米固定点，保持 30 秒。进阶：闭眼完成。',
      progress: '稳定完成 3×30 秒且闭眼可达 20 秒 → 进阶至半串联站立',
      safety: '身旁 30cm 内需有稳固扶手或墙面',
      svg: S(DEFS + head(70, 34) + line(70, 44, 70, 90, B, 4) +
        line(70, 54, 56, 82, A) + line(70, 54, 84, 82, A) +
        line(66, 90, 66, 118, B) + line(74, 90, 74, 118, B) +
        `<ellipse cx="70" cy="120" rx="16" ry="4" fill="#e2e8f0"/>` +
        `<line x1="70" y1="16" x2="70" y2="120" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 4"/>` +
        `<text x="78" y="20" font-size="9" fill="${G}">重心线</text>` + GROUND)
    },
    {
      id: 'b2', name: '半串联站立（半一字步）', level: 2, levelText: '入门',
      duration: '每侧 30 秒 × 2 组',
      target: '缩小支撑面下的姿势控制',
      key: '一脚脚跟对齐另一脚足弓内侧，前后错开半个脚掌；双手叉腰，保持躯干直立不晃动。',
      progress: '双侧各稳定 30 秒 → 进阶至完全串联站立',
      safety: '初期可单手扶墙，逐步过渡到指尖轻触→完全放手',
      svg: S(DEFS + head(70, 34) + line(70, 44, 70, 90, B, 4) +
        path('M70 56 L54 70 L60 84', A) + path('M70 56 L86 70 L80 84', A) +
        line(66, 90, 58, 112, B) + line(74, 90, 82, 118, B) +
        `<ellipse cx="54" cy="112" rx="14" ry="4" fill="#e2e8f0"/>` +
        `<ellipse cx="86" cy="119" rx="14" ry="4" fill="${P}" opacity="0.28"/>` +
        `<text x="14" y="106" font-size="9" fill="${G}">前脚跟</text>` +
        `<text x="98" y="112" font-size="9" fill="${P}">后足弓</text>` + GROUND)
    },
    {
      id: 'b3', name: '串联站立（一字站）', level: 3, levelText: '基础',
      duration: '每侧 30 秒 × 3 组',
      target: '侧向稳定性、髋策略',
      key: '前脚脚跟紧贴后脚脚尖成一条直线，双手可先展开后收于胸前；保持骨盆水平不侧倾。',
      progress: '睁眼 30 秒稳定 → 尝试闭眼 10 秒 → 进阶单腿站立',
      safety: '闭眼训练必须有人在旁看护',
      svg: S(DEFS + head(70, 32) + line(70, 42, 70, 88, B, 4) +
        line(70, 52, 42, 52, A) + line(70, 52, 98, 52, A) +
        line(70, 88, 62, 108, B) + line(70, 88, 78, 118, B) +
        `<ellipse cx="58" cy="108" rx="15" ry="4" fill="#e2e8f0"/>` +
        `<ellipse cx="82" cy="119" rx="15" ry="4" fill="${P}" opacity="0.28"/>` +
        `<line x1="34" y1="114" x2="106" y2="114" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<text x="26" y="128" font-size="9" fill="${G}">足跟贴足尖一条线</text>`, '0 0 140 134')
    },
    {
      id: 'b4', name: '单腿站立', level: 4, levelText: '进阶',
      duration: '每侧 20-30 秒 × 3 组',
      target: '臀中肌、踝周本体感觉（跌倒风险核心指标）',
      key: '支撑腿微屈不锁死，抬起腿屈髋屈膝约 60°；骨盆保持水平，避免支撑侧髋外顶。',
      progress: '双侧各 30 秒 → 闭眼版本 → 软垫/平衡垫版本',
      safety: '单腿站立 <5 秒者属跌倒高危，须扶稳并缩短时长',
      svg: S(DEFS + head(70, 30) + line(70, 40, 70, 84, B, 4) +
        line(70, 50, 44, 44, A) + line(70, 50, 96, 44, A) +
        line(70, 84, 72, 118, B, 4) +
        path('M70 84 L48 92 L54 112', P, 4) +
        `<ellipse cx="72" cy="120" rx="15" ry="4" fill="#e2e8f0"/>` +
        `<path d="M52 66 L88 66" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<text x="92" y="70" font-size="9" fill="${G}">骨盆水平</text>` + GROUND)
    },
    {
      id: 'b5', name: '足跟-足尖行走', level: 4, levelText: '进阶',
      duration: '往返 10 米 × 3 趟（各 1 趟足跟、足尖、串联）',
      target: '动态平衡、步态控制、踝背屈肌力',
      key: '沿直线行走，一步一脚跟紧贴前脚尖；分别完成"仅足跟着地""仅前脚掌着地""串联步行"三种模式。',
      progress: '10 米无偏移 → 加入头部转动（左右看）双任务',
      safety: '沿走廊墙边进行，随时可扶',
      svg: S(DEFS +
        head(40, 34, 8) + line(40, 42, 40, 78, B, 3.4) + line(40, 78, 34, 100, B) + line(40, 78, 48, 100, B) +
        head(96, 34, 8) + line(96, 42, 96, 78, B, 3.4) + line(96, 78, 90, 100, B) + line(96, 78, 104, 100, B) +
        `<line x1="10" y1="106" x2="130" y2="106" stroke="${G}" stroke-width="1.8" stroke-dasharray="5 4"/>` +
        `<ellipse cx="26" cy="106" rx="11" ry="3.4" fill="${P}" opacity="0.3"/>` +
        `<ellipse cx="48" cy="106" rx="11" ry="3.4" fill="${P}" opacity="0.3"/>` +
        `<ellipse cx="70" cy="106" rx="11" ry="3.4" fill="${P}" opacity="0.3"/>` +
        `<ellipse cx="92" cy="106" rx="11" ry="3.4" fill="${P}" opacity="0.3"/>` +
        `<ellipse cx="114" cy="106" rx="11" ry="3.4" fill="${P}" opacity="0.3"/>` +
        arrow('M56 122 L110 122') +
        `<text x="12" y="126" font-size="9" fill="${G}">直线</text>`, '0 0 140 132')
    },
    {
      id: 'b6', name: '重心转移训练（前后 / 侧向）', level: 3, levelText: '基础',
      duration: '每方向 10 次 × 2 组',
      target: '踝-髋协同、重心控制边界',
      key: '双脚与肩同宽站立，身体保持一条直线，缓慢将重心前移至前脚掌 / 后移至足跟 / 左右侧移，到达极限后回中，全程脚不离地。',
      progress: '幅度逐步加大 → 站于软垫上完成',
      safety: '前后各留出安全空间，避免后仰跌倒',
      svg: S(DEFS +
        head(70, 32) + line(70, 42, 70, 88, B, 4) +
        line(70, 54, 52, 74, A) + line(70, 54, 88, 74, A) +
        line(64, 88, 60, 118, B) + line(76, 88, 80, 118, B) +
        path('M44 60 C 34 74, 34 92, 44 104', A, 2, '5 4') +
        path('M96 60 C 106 74, 106 92, 96 104', A, 2, '5 4') +
        arrow('M40 112 L20 112') + arrow('M100 112 L120 112') +
        `<text x="46" y="18" font-size="9" fill="${G}">保持躯干整体倾斜</text>`, '0 0 140 126')
    },
    {
      id: 'b7', name: '单腿站立 + 上肢双任务', level: 5, levelText: '高阶',
      duration: '每侧 20 秒 × 3 组',
      target: '认知-运动双任务平衡（接近真实生活场景）',
      key: '在单腿站立基础上，同时完成传球 / 举哑铃过顶 / 倒数报数等任务，训练分心状态下的姿势控制。',
      progress: '稳定完成 → 站于平衡垫上执行 → 闭眼+计数',
      safety: '必须在有人看护或身旁有稳固扶手的环境下进行',
      svg: S(DEFS + head(68, 30) + line(68, 40, 68, 84, B, 4) +
        line(68, 50, 44, 34, A) + line(68, 50, 92, 34, A) +
        `<circle cx="100" cy="26" r="9" stroke="${P}" stroke-width="3"/>` +
        line(68, 84, 70, 118, B, 4) +
        path('M68 84 L46 94 L52 114', P, 4) +
        `<ellipse cx="70" cy="120" rx="15" ry="4" fill="#e2e8f0"/>` +
        arrow('M112 34 C 120 46, 116 58, 106 62') + GROUND)
    },
    {
      id: 'b8', name: '绕障 8 字步行', level: 5, levelText: '高阶',
      duration: '2 分钟 × 2 组',
      target: '动态转向平衡、方向变换控制',
      key: '设置 2 个间距 2 米的标志物，沿 8 字路线绕行；转弯时躯干先转、脚步跟随，速度由慢至快。',
      progress: '平地熟练 → 提速 → 加入手持物品或计数任务',
      safety: '地面需防滑无杂物，穿包裹性好的运动鞋',
      svg: S(DEFS +
        `<path d="M42 40 C 18 40, 18 74, 42 74 C 66 74, 66 40, 90 40 C 114 40, 114 74, 90 74 C 66 74, 66 40, 42 40" stroke="${G}" stroke-width="2.4" stroke-dasharray="6 4"/>` +
        `<path d="M36 84 L42 66 L48 84 Z" fill="${P}" opacity="0.8"/>` +
        `<path d="M84 84 L90 66 L96 84 Z" fill="${P}" opacity="0.8"/>` +
        head(66, 96, 7) + line(66, 103, 66, 116, B, 3) +
        arrow('M100 96 L122 96') +
        `<text x="14" y="112" font-size="9" fill="${G}">2 米间距</text>`, '0 0 140 124')
    }
  ];

  /* ==================== 基础抗阻 7 组 ==================== */
  const RESIST = [
    {
      id: 'r1', name: '靠墙静蹲', target: '股四头肌（等长收缩）',
      dose: '30-60 秒 × 3 组，间歇 60 秒',
      key: '背部贴墙，双脚前移与肩同宽，屈膝下滑至 60°-90°；膝盖不超过脚尖，全程正常呼吸。',
      caution: '髌股关节痛者角度控制在 45° 以内',
      svg: S(DEFS + `<rect x="18" y="8" width="10" height="112" fill="#e2e8f0"/>` +
        head(40, 34) + line(40, 44, 40, 82, B, 4) +
        line(40, 82, 84, 82, P, 4) + line(84, 82, 84, 118, P, 4) +
        line(40, 58, 74, 58, A) +
        `<path d="M62 88 A 22 22 0 0 0 78 96" stroke="${G}" stroke-width="1.8"/>` +
        `<text x="58" y="110" font-size="9" fill="${G}">60°-90°</text>` + GROUND)
    },
    {
      id: 'r2', name: '坐-站转移（椅子深蹲）', target: '股四头肌、臀大肌、核心',
      dose: '10-15 次 × 3 组',
      key: '坐于椅子前 1/3，双脚踩实；躯干前倾、髋部发力站起，缓慢有控制地坐回（离心 3 秒）。',
      caution: '不使用双手撑膝借力，膝痛者提高椅子高度',
      svg: S(DEFS + `<path d="M92 78 L124 78 L124 118 M92 78 L92 118" stroke="#cbd5e1" stroke-width="4"/>` +
        head(56, 32) + path('M56 42 C 60 56, 66 66, 72 74', B, 4) +
        path('M72 74 L74 96 L52 96', P, 4) + line(52, 96, 52, 118, P, 4) +
        line(58, 50, 82, 60, A) +
        arrow('M40 62 L40 34') + `<text x="10" y="52" font-size="9" fill="${G}">髋部发力</text>` + GROUND)
    },
    {
      id: 'r3', name: '臀桥', target: '臀大肌、腘绳肌、核心稳定',
      dose: '12-15 次 × 3 组，顶峰保持 2 秒',
      key: '仰卧屈膝，双脚与髋同宽踩地；收紧臀部将髋抬起至肩-髋-膝一条直线，避免腰部代偿。',
      caution: '腰部有不适说明臀肌未激活，降低抬起高度',
      svg: S(DEFS +
        head(22, 92, 8) +
        path('M30 92 L72 66 L88 92', P, 4.2) +
        line(88, 92, 96, 118, B, 4) +
        line(50, 84, 46, 108, A) +
        `<line x1="30" y1="92" x2="88" y2="92" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<text x="34" y="56" font-size="9" fill="${G}">肩-髋-膝成直线</text>` +
        `<line x1="6" y1="120" x2="134" y2="120" stroke="#cbd5e1" stroke-width="2.5"/>`)
    },
    {
      id: 'r4', name: '墙面 / 跪姿俯卧撑', target: '胸大肌、三角肌前束、肱三头肌',
      dose: '8-12 次 × 3 组',
      key: '手掌略宽于肩，身体保持一条直线；屈肘至肘约 90°，肘部夹角与躯干约 45°，推起时不锁死肘关节。',
      caution: '肩痛者优先选择墙面版本，逐步过渡到跪姿',
      svg: S(DEFS + `<rect x="112" y="10" width="10" height="110" fill="#e2e8f0"/>` +
        head(38, 44) + path('M38 54 L74 74 L86 96', B, 4) +
        path('M50 60 L108 52', P, 3.6) + path('M56 68 L108 62', P, 3.6) +
        line(86, 96, 92, 118, B) +
        `<line x1="30" y1="52" x2="94" y2="106" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<text x="6" y="112" font-size="9" fill="${G}">身体成直线</text>` + GROUND)
    },
    {
      id: 'r5', name: '弹力带坐姿划船', target: '背阔肌、菱形肌、中下斜方肌',
      dose: '12-15 次 × 3 组',
      key: '坐姿伸腿，弹力带绕足底；肩胛先后缩下沉再屈肘后拉至肋侧，挺胸不耸肩，缓慢还原。',
      caution: '腰部无力者背靠支撑物完成',
      svg: S(DEFS + head(40, 44) + line(40, 54, 40, 92, B, 4) +
        line(40, 92, 112, 92, B, 4) + path('M112 92 L116 80', B, 3) +
        path('M116 84 C 90 72, 66 64, 48 62', P, 3) +
        path('M116 88 C 92 80, 68 72, 48 68', P, 3) +
        line(40, 64, 50, 62, A) +
        arrow('M64 46 L40 40') + `<text x="66" y="40" font-size="9" fill="${G}">肩胛后缩</text>` +
        `<line x1="8" y1="102" x2="132" y2="102" stroke="#cbd5e1" stroke-width="2.5"/>`, '0 0 140 112')
    },
    {
      id: 'r6', name: '站姿提踵', target: '腓肠肌、比目鱼肌（改善下肢循环）',
      dose: '15-20 次 × 3 组',
      key: '双脚与髋同宽，扶稳支撑物；缓慢踮起足跟至最高点保持 1 秒，控制 3 秒缓慢落下。',
      caution: '进阶可做单腿版本或台阶边缘增加行程',
      svg: S(DEFS + `<rect x="112" y="14" width="10" height="106" fill="#e2e8f0"/>` +
        head(60, 32) + line(60, 42, 60, 86, B, 4) +
        line(60, 86, 58, 108, P, 4) + line(66, 86, 68, 108, P, 4) +
        path('M52 108 L58 116', P, 4) + path('M62 108 L70 116', P, 4) +
        line(60, 54, 108, 50, A) +
        arrow('M36 96 L36 68') + `<text x="8" y="64" font-size="9" fill="${G}">缓慢提起</text>` + GROUND)
    },
    {
      id: 'r7', name: '平板支撑', target: '腹横肌、腹直肌、竖脊肌（核心稳定）',
      dose: '20-45 秒 × 3 组',
      key: '肘位于肩正下方，前臂支撑；收紧腹部与臀部使耳-肩-髋-踝一条直线，避免塌腰或撅臀。',
      caution: '腰痛者改为跪姿平板或斜面平板',
      svg: S(DEFS +
        head(24, 62, 8) +
        path('M32 66 L118 96', B, 4.2) +
        path('M32 66 L34 96 L52 96', P, 3.6) +
        path('M118 96 L124 118', B, 3.6) +
        `<line x1="20" y1="60" x2="122" y2="96" stroke="${G}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        `<text x="42" y="46" font-size="9" fill="${G}">耳-肩-髋-踝一条直线</text>` +
        `<line x1="8" y1="120" x2="132" y2="120" stroke="#cbd5e1" stroke-width="2.5"/>`)
    },
    /* ==================== 哑铃 / 杠铃抗阻动作（依据 1RM 自动配重） ==================== */
    {
      id: 'r8', name: '哑铃深蹲', target: '股四头肌、臀大肌、腘绳肌',
      equipment: 'dumbbell', basePercent: 0.55, reps: '10-12', sets: '3', rest: '60-90 秒',
      dose: '10-12 次 × 3 组 · 负荷按 1RM 55% 自动计算',
      key: '双脚与肩同宽，哑铃置于肩侧；屈髋屈膝下蹲至大腿与地面平行，膝盖方向与脚尖一致；髋部发力站起。',
      caution: '腰背挺直，避免膝盖内扣；膝关节不适者减小下蹲幅度',
      svg: S(DEFS +
        head(50, 30) + line(50, 40, 50, 76, B, 4) +
        path('M50 50 L28 56 L20 48', P, 3.2) + path('M50 50 L72 56 L80 48', P, 3.2) +
        `<rect x="14" y="42" width="12" height="14" rx="3" fill="#64748b"/>` +
        `<rect x="74" y="42" width="12" height="14" rx="3" fill="#64748b"/>` +
        path('M50 76 L70 118', B, 4) + path('M50 76 L30 118', B, 4) +
        arrow('M80 90 L64 100') + `<text x="82" y="86" font-size="9" fill="${G}">膝随脚尖</text>` + GROUND)
    },
    {
      id: 'r9', name: '哑铃罗马尼亚硬拉', target: '腘绳肌、臀大肌、竖脊肌',
      equipment: 'dumbbell', basePercent: 0.60, reps: '10-12', sets: '3', rest: '60-90 秒',
      dose: '10-12 次 × 3 组 · 负荷按 1RM 60% 自动计算',
      key: '双脚与髋同宽，哑铃置于体前；微屈膝，髋部后推使哑铃沿大腿前侧下滑至膝盖下方；收紧臀肌站起。',
      caution: '全程腰背挺直，避免弓背；哑铃始终贴近身体',
      svg: S(DEFS +
        head(56, 32) + line(56, 42, 70, 80, B, 4) +
        path('M70 50 L40 60 L34 90', P, 3.2) + path('M70 50 L100 60 L106 90', P, 3.2) +
        `<rect x="28" y="84" width="14" height="12" rx="3" fill="#64748b"/>` +
        `<rect x="98" y="84" width="14" height="12" rx="3" fill="#64748b"/>` +
        path('M70 80 L58 118', B, 4) + path('M70 80 L86 118', B, 4) +
        arrow('M34 64 L56 60') + `<text x="12" y="60" font-size="9" fill="${G}">髋向后推</text>` + GROUND)
    },
    {
      id: 'r10', name: '哑铃推举', target: '三角肌前束、肱三头肌、上斜方肌',
      equipment: 'dumbbell', basePercent: 0.50, reps: '10-12', sets: '3', rest: '60-75 秒',
      dose: '10-12 次 × 3 组 · 负荷按 1RM 50% 自动计算',
      key: '坐姿或站姿，哑铃置于肩侧；掌心朝前，沿身体冠状面推至肘关节微屈；缓慢下落至起始位。',
      caution: '核心收紧避免腰椎反弓；下落时肘部略低于肩',
      svg: S(DEFS +
        head(50, 54) + line(50, 64, 50, 100, B, 4) +
        path('M50 70 L26 56 L14 40', P, 3.2) + path('M50 70 L74 56 L86 40', P, 3.2) +
        `<rect x="8" y="32" width="14" height="12" rx="3" fill="#64748b"/>` +
        `<rect x="78" y="32" width="14" height="12" rx="3" fill="#64748b"/>` +
        path('M50 100 L40 118', B, 4) + path('M50 100 L62 118', B, 4) +
        arrow('M28 48 L44 62') + `<text x="8" y="28" font-size="9" fill="${G}">推至肘微屈</text>` + GROUND)
    },
    {
      id: 'r11', name: '哑铃弯举', target: '肱二头肌、肱肌',
      equipment: 'dumbbell', basePercent: 0.45, reps: '12-15', sets: '3', rest: '45-60 秒',
      dose: '12-15 次 × 3 组 · 负荷按 1RM 45% 自动计算',
      key: '上臂贴近身体两侧，掌心朝前；屈肘将哑铃向肩部卷起，顶峰收缩 1 秒；缓慢下落至手臂接近伸直。',
      caution: '避免身体前后摆动借力；肩关节不稳者减小活动幅度',
      svg: S(DEFS +
        head(70, 34) + line(70, 44, 70, 76, B, 4) +
        path('M70 60 L42 76 L26 58', P, 3.2) + path('M70 60 L98 76 L114 58', P, 3.2) +
        `<rect x="18" y="50" width="12" height="14" rx="3" fill="#64748b"/>` +
        `<rect x="90" y="50" width="12" height="14" rx="3" fill="#64748b"/>` +
        path('M70 76 L64 118', B, 4) + path('M70 76 L78 118', B, 4) +
        arrow('M34 72 L52 76') + `<text x="8" y="74" font-size="9" fill="${G}">控制离心</text>` + GROUND)
    },
    {
      id: 'r12', name: '单臂哑铃划船', target: '背阔肌、菱形肌、肱二头肌',
      equipment: 'dumbbell', basePercent: 0.50, reps: '10-12', sets: '3', rest: '60-75 秒',
      dose: '10-12 次 × 3 组/侧 · 负荷按 1RM 50% 自动计算',
      key: '一手扶稳支撑面，对侧手持哑铃；背部平直，肩胛下沉后拉哑铃至髋侧；顶峰收缩 1 秒后缓慢还原。',
      caution: '避免躯干旋转借力；腰痛者改为俯卧或坐姿版本',
      svg: S(DEFS +
        `<rect x="100" y="10" width="10" height="110" fill="#e2e8f0"/>` +
        head(60, 44) + path('M60 54 C 70 68, 78 80, 84 92', B, 4) +
        path('M84 92 L108 110', A, 3) + path('M84 92 L50 100', P, 3.2) +
        `<rect x="36" y="92" width="12" height="18" rx="3" fill="#64748b"/>` +
        path('M84 92 L82 118', B, 4) + path('M84 92 L98 118', B, 4) +
        arrow('M70 106 L86 96') + `<text x="46" y="130" font-size="9" fill="${G}">拉向髋部</text>`, '0 0 140 132')
    },
    {
      id: 'r13', name: '杠铃深蹲', target: '股四头肌、臀大肌、核心稳定',
      equipment: 'barbell', basePercent: 0.65, reps: '8-10', sets: '3-4', rest: '90-120 秒',
      dose: '8-10 次 × 3-4 组 · 负荷按 1RM 65% 自动计算',
      key: '杠铃置于斜方肌上部，双脚略宽于肩；屈髋屈膝下蹲至大腿低于水平面，膝盖方向与脚尖一致；脚跟发力站起。',
      caution: '需要深蹲架保护或教练辅助；腰背痛者改用高脚杯深蹲',
      svg: S(DEFS +
        head(54, 28) + line(54, 38, 54, 74, B, 4) +
        path('M54 46 L20 44 L12 42', A, 3) + path('M54 46 L88 44 L96 42', A, 3) +
        `<rect x="8" y="38" width="8" height="8" rx="2" fill="#475569"/>` +
        `<rect x="84" y="38" width="8" height="8" rx="2" fill="#475569"/>` +
        `<line x1="12" y1="42" x2="96" y2="42" stroke="#334155" stroke-width="4"/>` +
        path('M54 74 L72 118', B, 4) + path('M54 74 L36 118', B, 4) +
        arrow('M80 90 L66 100') + `<text x="82" y="86" font-size="9" fill="${G}">膝不外翻</text>` + GROUND)
    },
    {
      id: 'r14', name: '杠铃罗马尼亚硬拉', target: '腘绳肌、臀大肌、竖脊肌',
      equipment: 'barbell', basePercent: 0.70, reps: '8-10', sets: '3-4', rest: '90-120 秒',
      dose: '8-10 次 × 3-4 组 · 负荷按 1RM 70% 自动计算',
      key: '双手正握杠铃置于大腿前侧，双脚与髋同宽；微屈膝，髋部后推使杠铃沿腿前侧下滑至小腿中段；伸髋站起。',
      caution: '保持背部平直，杠铃贴近身体；出现背痛立即停止',
      svg: S(DEFS +
        head(58, 30) + line(58, 40, 70, 78, B, 4) +
        path('M70 56 L24 64 L16 84', A, 3) + path('M70 56 L116 64 L124 84', A, 3) +
        `<line x1="16" y1="84" x2="124" y2="84" stroke="#334155" stroke-width="4"/>` +
        path('M70 78 L58 118', B, 4) + path('M70 78 L86 118', B, 4) +
        arrow('M36 70 L60 72') + `<text x="10" y="68" font-size="9" fill="${G}">髋主导</text>` + GROUND)
    },
    {
      id: 'r15', name: '杠铃卧推', target: '胸大肌、三角肌前束、肱三头肌',
      equipment: 'barbell', basePercent: 0.60, reps: '8-10', sets: '3-4', rest: '90-120 秒',
      dose: '8-10 次 × 3-4 组 · 负荷按 1RM 60% 自动计算',
      key: '仰卧于训练凳，杠铃位于眼睛正上方；握距略宽于肩，控制下放至胸部中下部，推起至肘关节微屈。',
      caution: '必须有人保护或使用安全杠；腕关节保持中立，避免肘部过度外展',
      svg: S(DEFS +
        `<line x1="6" y1="110" x2="134" y2="110" stroke="#cbd5e1" stroke-width="3"/>` +
        head(70, 62, 8) + path('M70 72 C 56 84, 44 94, 34 100', B, 4) +
        path('M34 100 L14 108', A, 3) + path('M70 72 C 84 84, 96 94, 106 100', B, 4) +
        path('M106 100 L126 108', A, 3) +
        `<line x1="14" y1="108" x2="126" y2="108" stroke="#334155" stroke-width="4"/>` +
        `<rect x="8" y="104" width="8" height="8" rx="2" fill="#475569"/>` +
        `<rect x="84" y="104" width="8" height="8" rx="2" fill="#475569"/>` +
        arrow('M48 84 L68 80') + `<text x="26" y="78" font-size="9" fill="${G}">触胸即推</text>`, '0 0 140 118')
    },
    {
      id: 'r16', name: '杠铃俯身划船', target: '背阔肌、菱形肌、肱二头肌',
      equipment: 'barbell', basePercent: 0.55, reps: '10-12', sets: '3-4', rest: '75-90 秒',
      dose: '10-12 次 × 3-4 组 · 负荷按 1RM 55% 自动计算',
      key: '正握杠铃，俯身约 45°，背部平直；肩胛下沉后收，将杠铃拉向腹部下沿，顶峰收缩 1 秒后缓慢还原。',
      caution: '避免借助爆发力甩杠铃；腰背挺直，头部与脊柱成直线',
      svg: S(DEFS +
        head(70, 38, 8) + path('M70 48 C 58 62, 50 74, 44 86', B, 4) +
        path('M44 86 L22 96', A, 3) + path('M44 86 L90 94', P, 3.4) +
        `<line x1="22" y1="96" x2="110" y2="96" stroke="#334155" stroke-width="4"/>` +
        `<rect x="14" y="92" width="10" height="8" rx="2" fill="#475569"/>` +
        `<rect x="100" y="92" width="10" height="8" rx="2" fill="#475569"/>` +
        path('M44 86 L40 118', B, 4) + path('M44 86 L56 118', B, 4) +
        arrow('M70 100 L86 96') + `<text x="74" y="114" font-size="9" fill="${G}">拉向腹部</text>`, '0 0 140 124')
    }
  ];

  /* ==================== 章节配图（报告用） ==================== */
  // 章节装饰图统一使用用户提供的 PNG 标识图，视觉风格一致
  const BANNERS = {
    nutrition: `<img src="images/diet-banner.png" alt="个性化饮食方案" class="report-banner-icon-img banner-nutrition" />`,
    aerobic: `<img src="images/aerobic-banner.png" alt="有氧训练" class="report-banner-icon-img" />`,
    resistance: `<img src="images/resistance-banner.png" alt="抗阻训练" class="report-banner-icon-img" />`,
    flexibility: `<img src="images/flexibility-banner.png" alt="柔韧训练" class="report-banner-icon-img" />`,
    balance: `<img src="images/balance-banner.png" alt="平衡训练" class="report-banner-icon-img" />`,
    // 保留旧别名兼容
    strength: S(
      `<path d="M70 30 L70 54 M70 36 L52 28 M70 36 L88 28 M70 54 L72 76" stroke="#9333ea" stroke-width="3.2" fill="none"/>` +
      `<path d="M70 54 L54 60 L58 72" stroke="#9333ea" stroke-width="3.2" fill="none"/>` +
      `<ellipse cx="72" cy="78" rx="16" ry="4" fill="#e9d5ff"/>` +
      `<line x1="18" y1="78" x2="122" y2="78" stroke="#d8b4fe" stroke-width="3" stroke-dasharray="6 4"/>`,
      '0 0 140 90')
  };

  window.DIAGRAMS = { FLEX, BALANCE, RESIST, BANNERS };
})();
