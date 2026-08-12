# 鹊动系统 · AI 能力部署流程（选型 → 接入 → 上线）

> 配套 PoC 已实现于本仓库：`server/ai-config.js`、`server/ai-routes.js`、`modules/ai-reason.js`，
> 以及 `index.html`、`styles.override.css`、`sarcopenia.js` 的接线。本文档说明如何从「能跑的 PoC」走到「生产上线」。

---

## 1. 架构总览

```
┌─────────────────────────── 浏览器（院内/诊所终端）──────────────────────────┐
│  鹊动 SPA（前端）                                                            │
│   · 严谨版方案视图 ──► AIReason.enrich() 注入「🤖 AI 辅助解读」区块          │
│   · 🤖 AI 浮窗按钮 ──► AIReason.openChat() 问答面板                         │
│   所有请求带 Bearer 令牌（window.QDAuth），同源发往 /api/ai/*                │
└───────────────────────────────┬──────────────────────────────────────────┘
                                  │  HTTPS（生产） / 局域网 HTTP（内网）
                                  ▼
┌─────────────────────────── Node 后端 server.js ───────────────────────────┐
│  /api/ai/*  (authMiddleware 守卫)                                           │
│     └─ ai-routes.js ──► ai-config.js 解析 AI_MODE                           │
│            │                                                                │
│            ├── 本地模式 ──► Ollama /api/chat（http://localhost:11434）       │
│            ├── 云模式   ──► 云 LLM /chat/completions（Bearer Key）          │
│            └── 混合模式 ──► 本地优先，失败回落云                            │
│     返回前经 gatePlan() 规则闸门（强度越界/缺禁忌 拦截）                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**安全铁律**：云 API Key 只存在于后端环境变量，**永不**进入前端包体或任何响应。前端只拿到「回复文本 / 结构化方案 / 闸门结论」。健康数据仅在服务端构造 prompt（本地模式下不出本机网络）。

---

## 2. 三种部署拓扑对比

| 维度 | ① 本地自托管（Ollama） | ② 云 LLM API | ③ 混合（推荐） |
|---|---|---|---|
| 代表实现 | 院内部署 `qwen2.5:7b/14b` | OpenAI 兼容 / DeepSeek / 混元 | 两者都配，本地优先 |
| 数据去向 | 不出本机/院内网 | 脱敏数据出网至云 | PHI 留本地，重任务上云 |
| 质量 | 中（7B 够用，14B 更佳） | 高 | 高（回落云） |
| 运维成本 | 需一台 GPU/强劲 CPU 主机 | 零运维、按量计费 | 中 |
| 延迟 | 低（内网） | 中（公网） | 低→中 |
| 合规风险 | 最低（数据不出院） | 需签署数据处理协议 | 低 |
| 适用 | 临床/隐私优先 ← 推荐 | 非敏感/已脱敏、快速验证 | 中大型机构 |

**推荐路径**：诊所单机 → ① 本地 Ollama（零费用、合规）；中心机构 → ③ 混合（本地扛日常，云兜底复杂推理）。

---

## 3. 成本 · 合规 · 安全 速查

- **成本**
  - 本地：一次性硬件 + 电费；模型免费（Qwen2.5 开源）。7B 量化版 4–6 GB 显存可跑；14B 需 ~12 GB。
  - 云：按 token 计费，建议设 `AI_MAX_TOKENS` 上限 + 每日配额告警。
- **合规**
  - 本地模式天然满足「健康数据不出院」。
  - 云模式：仅传**脱敏字段**（gender/age/bmi/客观指标），禁止传姓名/身份证/联系方式；与云厂商签 DPA。
  - 所有 AI 输出前端标注「AI 辅助生成，须经专业人员确认」。
- **安全**
  - Key 仅服务端 env；`.env` 进 `.gitignore`，绝不提交。
  - `/api/ai/*` 必须走 `authMiddleware`（已默认开启）。
  - 反向代理层做 TLS + 速率限制；禁用目录遍历（后端已防护）。

---

## 4. 分步部署流程

### 拓扑 ①：本地自托管（Ollama）

```bash
# 1) 安装 Ollama（Linux/macOS/Windows 均支持）
curl -fsSL https://ollama.com/install.sh | sh      # Windows 用官方 installer

# 2) 拉取中文强模型（7B 起步，资源够上 14B）
ollama pull qwen2.5:7b

# 3) 启动（默认监听 11434；生产建议绑内网网卡并加反向代理）
ollama serve &

# 4) 配置后端环境变量（写入 .env，不要提交）
AI_MODE=local
AI_LOCAL_URL=http://localhost:11434
AI_LOCAL_MODEL=qwen2.5:7b
```

### 拓扑 ②：云 LLM API

```bash
# .env
AI_MODE=cloud
AI_CLOUD_BASE_URL=https://api.your-llm.com/v1     # OpenAI 兼容
AI_CLOUD_API_KEY=sk-xxxxxxxxxxxxxxxx             # 仅服务端
AI_CLOUD_MODEL=gpt-4o-mini                        # 或 deepseek-chat / hunyuan
```

### 拓扑 ③：混合

```bash
# .env
AI_MODE=hybrid          # 本地优先，云兜底
AI_LOCAL_URL=http://localhost:11434
AI_LOCAL_MODEL=qwen2.5:7b
AI_CLOUD_BASE_URL=https://api.your-llm.com/v1
AI_CLOUD_API_KEY=sk-xxxx
AI_CLOUD_MODEL=gpt-4o-mini
```

> 无论哪种：启动后端 `node --experimental-sqlite server.js`，访问 `GET /api/ai/status` 校验 `available:true`。

---

## 5. 上线 Runbook（生产落地）

1. **准备主机**：Linux 服务器（2 vCPU+/8 GB+；本地模型需 GPU 或 16 GB+ RAM）。
2. **放置产物**：`server/`（后端）+ `_dl3/`（前端构建）+ `.env`（仅服务端）。
3. **进程守护**：`systemd`（见 `deploy/quedong.service`）或 Windows `nssm` 注册 `server.js` 为服务。
4. **反向代理**：`nginx` 终止 TLS，把 `/api` 反代到 `localhost:8080`，静态资源可交由 nginx 直出（见 `deploy/nginx.ai.conf`）。
5. **HTTPS**：必须（含 `Strict-Transport-Security`），禁用明文 HTTP 暴露 `/api`。
6. **健康检查**：`GET /health` 与 `GET /api/ai/status` 接入监控（如 nssm/uptime-kuma）。
7. **备份**：`POST /api/admin/backup`（数据库 + 媒体），定期归档 `server/backups/`。
8. **首启改密**：默认 `admin/admin123` 上线前必须改（`POST /api/me/change-password` 或管理员后台）。
9. **容器化（可选）**：`docker build -f Dockerfile -t quedong-ai . && docker run -d -p 8080:8080 --env-file .env quedong-ai`。

**CloudStudio / 一键部署**：平台「部署」入口上传本仓库 → 构建命令 `npm --prefix server install` → 启动 `node --experimental-sqlite server/server.js` → 绑定 8080。AI 部分在 CloudStudio 环境变量面板填入上述 `AI_*` 即可，Key 不落代码。

---

## 6. 降级与运维

- **无模型/无 Key**：`AI_MODE` 解析为 `offline`，`/api/ai/status` 返回 `available:false`，前端**静默降级**到规则引擎（SarcEngine2），不白屏、不报错。
- **本地宕机（混合）**：自动回落云，响应体带 `fellBack:true` 便于观测。
- **模型幻觉/越界**：`gatePlan()` 规则闸门拦截强度越界、缺禁忌字段，前端以红/黄条提示。
- **日志**：后端 `server/logs/`；前端报错经 `/api/err-report` 入库（需登录）。
- **回滚**：`_dl3` 与 `server/` 均为可替换目录，保留上一版目录即可快速回退。

---

## 7. 本仓库 PoC 已实现清单（可直接联调）

| 文件 | 作用 |
|---|---|
| `server/ai-config.js` | env 配置 + 本地可用性探测 + 提供方解析（local/cloud/hybrid 回退） |
| `server/ai-routes.js` | `/api/ai/status`、`/api/ai/chat`、`/api/ai/generate-plan` + 规则闸门 |
| `server/server.js` | 已 `app.use('/api/ai', authMiddleware)` + require 挂载 |
| `modules/ai-reason.js` | 前端调用层 + 严谨版「AI 解读」注入 + 浮窗问答面板 |
| `index.html` / `styles.override.css` | 脚本挂载 + AI 区块/浮窗样式 |
| `modules/sarcopenia.js` | 严谨版切换时调用 `AIReason.enrich` |

**联调方式**：用 `server/server.js`（非静态版 `_local_server.js`）启动，`/api/ai/*` 才可用。无模型/无 Key 时界面自动回退规则引擎，可先验证降级路径。
