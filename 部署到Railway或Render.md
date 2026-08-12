# 部署到 Railway / Render（免费试用）

> 系统已具备单服务云部署能力：后端 Express + node:sqlite 单体服务，同时托管前端 `_dl3` 静态文件。
> 本地仓库（`main` 分支）已初始化并提交，配置就绪：`package.json` / `railway.json` / `render.yaml` / `.gitignore`（已排除 `.env`、密钥、node_modules、运行时数据库）。

---

## 前置（需你本人操作）
1. 注册一个 GitHub 账号（Railway 与 Render 都从 GitHub 拉取代码，不支持直接传文件）。
2. 本机已装 git（当前环境已就绪）。

---

## 步骤 1：把代码推到 GitHub

本地仓库已提交在 `main` 分支，直接关联远程并推送即可：

```bash
# 在 GitHub 网页新建一个「空仓库」（不要勾选 README / .gitignore / License）
git remote add origin https://github.com/你的用户名/你的仓库名.git
git branch -M main          # 已执行，仓库默认分支即 main
git push -u origin main
```

推送前请再次确认：仓库里**没有** `.env`（含 HY3 Key）、没有 `node_modules`、没有 `*.db`。
可用 `git ls-files | grep -E '\.env$|node_modules|\.db$' || echo "干净"` 自检。

---

## 步骤 2A：Railway 部署（推荐，可挂持久盘）

1. 打开 https://railway.app 注册，New Project → **Deploy from GitHub repo** → 选择刚推的仓库。
2. Railway 会自动读取 `railway.json`：`nixpacks` 构建、`npm start` 启动、`/health` 健康检查、Node 22。
3. 进入项目 **Variables**，添加以下环境变量：
   - `SECRET`（**必填，固定值**）：任意 64 位十六进制随机串，例如本地跑 `openssl rand -hex 32` 生成的输出。
     ⚠️ 不设会每次重启重新生成密钥，导致所有用户被强制登出。
   - 可选 AI 模型（不填则 AI 功能降级为规则引擎）：
     `AI_HY3_ENABLED=true`、`AI_HY3_BASE_URL=https://tokenhub.tencentmaas.com/v1`、`AI_HY3_API_KEY=你的Key`、`AI_HY3_MODEL=hy3`、`AI_HY3_LABEL=HY3`
4. **持久化数据（重要）**：项目页 → **Volumes** → Add Volume，Mount Path 填 `/app/server/data`，Size `1` GB。
   这样 SQLite 数据库和上传媒体不随重启/重新部署丢失。（1GB 卷约 $0.10/月，远低于 Railway 免费额度）
5. 部署完成后，Railway 会分配一个 `xxx.up.railway.app` 公网域名，直接访问即可。

---

## 步骤 2B：Render 部署（完全免费，但无持久盘）

1. 打开 https://render.com 注册，New → **Web Service** → Connect 你的 GitHub 仓库。
2. Render 自动读取 `render.yaml`：`plan: free`、构建 `npm install && npm --prefix server install --omit=dev`、启动 `npm start`、健康检查 `/health`。
3. 在 **Environment** 添加与上面相同的 `SECRET` 与可选 `AI_HY3_*` 变量。
4. ⚠️ **Render 免费 Web 服务的文件系统是临时性的**：每次重启/重新部署都会清空 `server/data` 与 `server/media`，即用户、患者、报告全部丢失。
   → 仅适合纯演示 / 短期试用。若需要数据持久，**改用 Railway 挂盘**，或外接数据库。
5. 部署后分配 `xxx.onrender.com` 域名。

---

## 步骤 3：上线后必做

1. 用默认账号 `admin / admin123` 登录，**立即在管理员后台修改密码**。
2. 通过管理员后台（或 `POST /api/admin/users`）为医生创建账号。
3. 访问 `https://你的域名/health` 确认返回 `{"ok":true,...}`。
4. 建一个测试患者 → 录入评估 → 生成方案，验证完整链路。

---

## 已知限制（免费层）

| 项 | Railway | Render |
|---|---|---|
| 文件系统持久 | 挂 1GB 卷后持久 | 临时，重启即清空 |
| 免费休眠 | 有 $5 额度，闲置不休眠（额度用完暂停） | 15 分钟无流量自动休眠 |
| 数据库 | 内置 SQLite（卷内） | 内置 SQLite（临时） |
| 自定义域名 | 付费功能 | 付费功能 |

> 患者扫码取报告目前仍是「整份报告塞进 URL」做法（详见《云端部署与患者扫码方案.md》），上云可用但有容量/隐私/不可撤销三弱点，建议后续改为服务端短链令牌。

---

## 故障排查

- **构建失败**：确认根目录 `package.json` 的 `start` 为 `node server/server.js`；Railway 若报 workspace 错误，可在 Variables 设 `NIXPACKS_NODE_VERSION=22`。
- **启动后 502 / 一直重启**：看部署日志是否停在 `node:sqlite` 报错；确认 Node ≥ 22（本系统用内置 `node:sqlite`，低于 22 不可用）。
- **前端打开空白**：检查 `/health` 返回里 `static` 字段是否指向 `<项目根>/_dl3`；若路径错，在平台设 `STATIC_DIR=/app/_dl3`（Railway）或 `/opt/render/project/src/_dl3`（Render）。
- **AI 报错**：确认 `AI_HY3_*` 五个变量齐全，且本地 curl 能通 `tokenhub.tencentmaas.com`。
