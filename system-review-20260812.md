# 鹊动健康系统 · 全系统审查报告（2026-08-12）

> 范围：前端 SPA（classic `<script>`，全局 `Pages/U/AppState/DB/SarcDB/Skin/SarcOpenReg`）+ 后端 Express+node:sqlite+HMAC（`server/`）+ 部署副本 `_dl3/`。
> 方法：3 路并行代码探查 + 104 文件 `node --check` + 沙箱启动后端真实冒烟（44 脚本 404 扫描、登录/令牌/模型/媒体/AI status 实测）。

---

## 一、功能自测结果（沙箱实测）

| 项 | 结果 | 说明 |
|---|---|---|
| 后端启动 | ✅ | `node server/server.js` 正常监听 8080，加载 `_dl3` 静态、建库 `server/data/app.db` |
| `/health` | ✅ | 返回 `{ok:true}` |
| `GET /`（index.html） | ✅ | 完整 HTML（11033 字节），非空白页 |
| 全部 44 个 `<script src>` | ✅ 0 个 404 | 无缺失文件 → 不会因此出现 `Pages.xxx` undefined 的"未加载" |
| 登录 / `/api/me` / 令牌 | ✅ | admin 登录拿 token，`/api/me` 正常返回用户 |
| `/api/ai/models`（带 token） | ✅ | 返回 3 模型：**豆包Pro / DeepSeek V3 / 本地 default** → DeepSeek 端到端可用 |
| `/api/ai/status` | ✅ | `{mode:"cloud", cloudConfigured:true, available:true, imageGenConfigured:true}`；localAvailable:false（沙箱无 Ollama，符合预期）、visionConfigured:false |
| `/api/media`（无 token） | ✅ 401 | 守卫正确生效 |
| 源码语法 | ✅ | 104 文件仅 2 个语法错，均为**非加载的临时脚本**（`_t_repair2.js` 单测稿、`css_live.js` 是 .js 后缀的 CSS），`index.html` 未引用 |

**未能在沙箱验证（需浏览器/外网/真实数据，属环境限制非缺陷）**：AI 流式对话实拉云模型、语音输入(Web Speech)、PDF/OCR 真实解析、媒体上传下载往返、拖拽/全屏/响应式交互、跨标签页同步。

---

## 二、分层优化清单（底层 → 应用层）

### L0 基础设施 / 后端健壮性 【高】
1. **缺全局错误兜底**：`server.js` 无 `app.use(errorHandler)` 也无 `process.on('uncaughtException'/'unhandledRejection')`。任一 async 路由未捕获异常 → 进程崩溃或 500 无日志。建议加 4xx/5xx 中间件 + 进程级监听。
2. **`verifyToken` 长度不符时 `timingSafeEqual` 抛异常** → 返回 500 而非 401。应 try/catch 统一回 401。
3. **默认弱口令**：`admin/admin123`、`doctor/doctor123`、重置密码 `123456` 写死在种子与多处。建议首次登录强制改密或生成随机口令。
4. **`.env` 明文密钥落盘**：根 `.env` 含真实 DeepSeek/火山 key（已 `.gitignore`，但磁盘明文）。建议仅服务账户可读（chmod 600）+ 文档提示；长线迁密钥管理。
5. **登录无限流**：`/api/login` 无失败次数/速率限制，存在暴力风险（内网诊所可接受，公网必做）。
6. **`0.0.0.0` 全网卡监听**：仅 `localhost` 防火墙隔离，无 host allowlist。建议加 CORS 白名单或绑定 `127.0.0.1`（若前端同源同机）。

### L1 数据层 【中】
7. **`SarcDB` 用 localStorage 存 JSON**（前缀 `qd_sarcopenia_`），大 base64 报告有 5MB 配额风险；媒体 blob 才走 IndexedDB。建议重数据统一迁 IndexedDB。
8. **无 DB 迁移机制**：建表全靠 `IF NOT EXISTS`，Schema 演进需手工 ALTER。建议加轻量 migration 版本表。
9. **node:sqlite 为实验特性**：依赖 `NODE_FLAGS=--experimental-sqlite`。建议锁定 Node 版本并在 `_env.bat`/部署文档固化，避免升级大版本后 API 漂移。

### L2 前端架构 【高】
10. **手动 `<script>` 顺序 + 15+ 全局命名空间**：任一文件缺失/错位 → 静默"未加载"。当前 44 脚本全 200 暂无碍，但属脆弱模式。建议：① 收敛全局到单一 `QD` 命名空间；② 评估打包(ESM/Vite)或至少用 `type="module"` 依赖图。
11. **`Pages.fallRiskStats` 双定义（顺序敏感死代码）**：`sarcopenia.js:2806`（demo 版，被覆盖失效）与 `fall-risk-stats.js:229`（存活入口）。建议删除 `sarcopenia.js` 内同名失效函数，消除歧义与回归隐患。
12. **`AppState` 仅内存、不跨标签页同步**：多设备/多标签状态不一致（如一处改了患者，另一标签不知）。评估 `storage` 事件或 BroadcastChannel。

### L3 功能模块 【中】
13. **肌少症双引擎并行维护**：旧 `SarcEngine.buildPlan` + 新 `SarcEngine2.adaptComputeResult` 两套。新引擎已修 LSI 量纲/左右侧/ROM 0-60° 等坑，建议验证稳定后废弃旧引擎，降维护成本。
14. **AI 聊天需登录**：`/api/ai/*` 全链路 `authMiddleware`。设计说"聊天不受 aiMode 开关限制"指开关而非登录——若期望**匿名也可问小Qoo**，需放开 `/api/ai/chat|models` 匿名访问（谨慎评估）。否则维持现状（员工制诊所合理）。
15. **AI 后端不可达时部分入口硬报错**：`parse-report/interpret/plan` 后端挂时仍报错卡住；`aiControls` 已改为同步渲染防挂起，但其余路径仍依赖可达性。建议统一"规则引擎降级"提示。

### L4 质量 / 可维护性 【低-中】
16. **457 处 `console.*` 散落源码**：调试噪音 + 可能向控制台泄露内部数据。建议引入分级 `logger`（dev 可见、prod 静默），或构建期 strip。
17. **49 处 TODO/FIXME/XXX**：技术债标记，建议过一轮清账。
18. **仓库卫生**：根目录大量 `_tmp_*`、`_deploy*`、`_dl*`、`_dl2`、`_backup_*`、`_dl3_modules_bak`、`css_live.js`、`_sync_one.js`(0 字节损坏) 等临时/副本文件，混淆且占空间。建议归档或清理（**待你确认后我再删**，不擅自动个人/项目目录）。
19. **`_dl3` 增量同步漂移风险**：`_sync_dl3_ai.py` 仅同步 4 个文件；当前与源码字节一致（已验证），但若改了其它文件易忘同步。建议改 manifest 全量同步或 CI 校验。

---

## 三、架构总评
- **正向**：后端分层清晰（auth/config/ai/media/sync 路由 + RAG + 备份），密钥不进前端、HMAC 真正生效、参数化防注入、媒体路径穿越防护到位；前端"外壳+局部 swap"看板、双路径 OCR、浮窗问答、主题引擎均较扎实。
- **风险集中点**：① 后端缺错误兜底（最该优先）；② 前端全局命名空间 + 脚本顺序脆弱；③ 死代码（fallRiskStats 双定义、临时文件）拖累可维护性；④ 默认弱口令/明文密钥。
- **优先级建议**：先做 L0-1/2/3（错误兜底、令牌 401、强制改密）→ L2-10/11（命名空间收敛、删死代码）→ 其余按排期。

---

## 四、本次已验证产物
- 已启动沙箱后端并完成真实冒烟（HTTP 实测，非推断）。
- 已同步结论到工作记忆 `2026-08-12.md`。
- 沙箱测试后端进程已停止（`pkill`），不影响你本机实例。
