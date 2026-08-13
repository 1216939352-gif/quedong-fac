# 鹊动后端 · 云端部署包（互联网 / 多设备 / 多用户）

本目录包含把「鹊动FAC功能评估与干预系统」后端部署到 **Linux 云服务器**所需的全部配置。
后端角色与局域网版完全一致：托管前端 + 提供 `/api/sync`、`/api/media`、`/api/err-report`、
`/api/login`、自动备份。代码跨平台，搬上云即可。

> 本包只解决「部署形态」。公网暴露前有一道**必须补齐的安全缺口**，见下方「⚠️ 公网暴露前必做」。

---

## 1. 架构回顾

```
浏览器 ──HTTPS──> [nginx / Caddy] ──HTTP──> [Node 后端 :8080] ──> SQLite(app.db) + media/
                       │  静态前端直接由反代托管（/opt/quedong/frontend）
```

- 后端已 `app.listen(PORT,'0.0.0.0')`，可被反代访问。
- 前端（SPA，哈希路由）由 nginx/Caddy 直接托管，只有 `/api/*` 与 `/health` 转发给 Node。
- 所有设备共享同一个后端数据库 → 这就是「多机共享 / 多用户」的本质。

---

## 2. 前置要求

| 项 | 说明 |
|---|---|
| 云服务器 | Ubuntu/Debian 22.04+（2 vCPU / 2GB 起步，视数据量） |
| 域名 | 一个已把 A 记录指向服务器公网 IP 的域名（HTTPS 必需） |
| Node.js | **≥ 22.13**（node:sqlite 免 `--experimental-sqlite`）；推荐 **Node 24 LTS** |
| 依赖 | 仅 `express` + `multer`（纯 JS，`npm install` 无原生编译），`node:sqlite` 内置 |

上传方式：把整个项目（含 `server/`、`_dl3/`、`deploy/`）打包传到服务器，或 `git clone` 到服务器。

---

## 3. 部署路径 A：systemd + nginx（推荐，生产最稳）

### 3.1 一键安装
```bash
# 在服务器上，以 root 运行（脚本位于 deploy/setup-cloud.sh）
bash deploy/setup-cloud.sh
```
脚本会：装 Node 24 → 建 `quedong` 用户与 `/opt/quedong/{server,frontend}` → 拷贝代码与前端 →
`npm install` → 生成随机 `SECRET` → 装并启用 systemd → 注册每日备份 cron。

### 3.2 配置 HTTPS 反代
```bash
# 安装 nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# 放入站点配置（把文件里的 quedong.example.com 改成你的域名）
sudo cp deploy/nginx-quedong.conf /etc/nginx/sites-available/quedong
sudo ln -s /etc/nginx/sites-available/quedong /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请 Let's Encrypt 证书（会自动改写 nginx 配置注入证书路径）
sudo certbot --nginx -d 你的域名
```

### 3.3 验证
```bash
curl -s http://127.0.0.1:8080/health          # 后端存活
curl -sI https://你的域名/health              # 经 HTTPS 反代存活
```
浏览器打开 `https://你的域名` 即可使用。

---

## 4. 部署路径 B：systemd + Caddy（最简 HTTPS）

Caddy 自带自动申请/续期证书，省去 certbot 步骤。
```bash
# 安装 Caddy（见 https://caddyserver.com/docs/install）
# 把 deploy/Caddyfile 里的 quedong.example.com 改成你的域名，放到 /etc/caddy/
sudo systemctl enable --now caddy
```
其余与路径 A 的 3.1 相同（只跑后端，Caddy 负责前端 + 反代）。

---

## 5. 部署路径 C：Docker（容器化）

构建上下文必须为**仓库根目录**（含 `server/` 与 `_dl3/`）：
```bash
# 复制并填写环境变量（SECRET 等）
cp deploy/quedong.env.example deploy/quedong.env
# 编辑 deploy/quedong.env，填入 SECRET=$(openssl rand -hex 32)

docker compose -f deploy/docker-compose.yml up -d --build
```
- 容器只跑 Node 后端（8080），前端与 HTTPS 仍由主机 nginx/Caddy 反代（配置见路径 A/B）。
- `data / media / backups` 用命名卷持久化，重建不丢数据。
- 健康检查内置：`docker inspect --format '{{.State.Health.Status}}' quedong-backend`。

---

## 6. 公网暴露安全说明（鉴权已启用）

后端 `/api/sync/*`、`/api/media/*`、`/api/ai/*` **已启用 Bearer 令牌鉴权**：`server.js` 经
`app.use('/api/sync', authMiddleware)` 与 `app.use('/api/media', authMiddleware)` 统一守卫；
前端 `sync.js` / `ai-reason.js` 在请求时自动携带登录令牌，无令牌即返回 **401**。

**结论：未登录 / 无令牌者无法读写任何患者数据，不存在"任何人可读写删"的裸奔风险。**

仍须知悉的边界（非 bug，是设计取舍）：
- **这是「共享诊所数据集」模型**：任何合法登录账号均可读写全部患者记录（按 `owner_id` 归属，
  但不限制跨医生读取；管理员可见全部）。适合**单诊所内部多人共用**，但**不是多诊所 / 多租户隔离**。
- 若要严格的机构间数据隔离，需在 `authMiddleware` 之后追加「按租户过滤」逻辑（当前未做）。
- 默认管理员账号 `admin / admin123` 仍为弱口令，**上线前务必改密**（见下方清单）。

纵深防御建议（仍推荐，进一步收窄攻击面）：
- **nginx**：取消 `deploy/nginx-quedong.conf` 中 `location ~ ^/(api/sync|api/media)` 注释，
  把 `allow 203.0.113.0/24` 换成你的公司出口 IP / VPN 网段，仅放行可信来源。
- **Caddy**：按 `deploy/Caddyfile` 文末示例加 `basicauth`，做双因子兜底。
- **或**：仅在内网 / VPN 内暴露，不要直接放公网。

其它上线清单：
- [ ] 改默认管理员密码 `admin / admin123`（当前无改密接口，需直连 DB 或补选项2）
- [ ] 备份卷 / 目录定期异地归档（每日 cron 已生成，建议再定期下云）
- [ ] 确认 `8080` 只监听内网/回环，公网入口只有 443

---

## 7. 验收（跨机/公网）

在任意一台能联网的机器上（需 Node 18+，无需 node_modules）：
```bash
# 把 server/tests/acceptance.js 拷过去，指向真实域名
SERVER_URL=https://你的域名 node acceptance.js
```
脚本会对真实后端跑全套 10 项断言（启动/多机共享/冲突/编辑锁/软删/报错可见），
Node 直连后端不受浏览器 CORS 限制，等价于「从另一台设备访问服务器」。

---

## 8. 备份与回滚

- **自动**：每日 03:15 跑 `node backup.js --keep=30`，结果在 `server/backups/`（含 `manifest.json` + 日志）。
- **手动**：`cd /opt/quedong/server && node backup.js --keep=30`
- **回滚**：解压某次备份目录，用 `sqlite3 app.db "SELECT ... FROM ..."` 校验后替换 `data/app.db` 及 `media/`。
  （SQLite 单文件 + 媒体目录，复制即备份，复制即恢复。）

---

## 9. 运维速查

```bash
sudo systemctl status  quedong-backend     # 状态
sudo journalctl -u quedong-backend -f      # 日志
sudo systemctl restart quedong-backend     # 重启（代码更新后）
# 代码更新：把新 server/、_dl3/ 拷到 /opt/quedong 对应目录，再 restart
```

---

## 10. 文件清单

| 文件 | 用途 |
|---|---|
| `quedong-backend.service` | systemd 单元（Restart=always，绑定 0.0.0.0:8080） |
| `quedong.env.example` | 环境变量模板（PORT / STATIC_DIR / SECRET / BACKUP_KEEP） |
| `nginx-quedong.conf` | nginx HTTPS 反代（含静态托管 + 安全止损段） |
| `Caddyfile` | Caddy 自动 HTTPS 反代备选 |
| `Dockerfile` | 容器镜像（node:24-slim） |
| `docker-compose.yml` | 容器编排（命名卷持久化） |
| `backup-cron.txt` | 每日备份 cron 片段 |
| `setup-cloud.sh` | 目标机一键安装（装 Node + 用户 + 拷贝 + systemd + cron） |
| `../server/tests/acceptance.js` | 跨机验收脚本（支持 `SERVER_URL`） |
| `.github/workflows/deploy.yml` | GitHub Actions 自动部署（push main → SSH → docker compose up） |
| `frpc.example.toml` | frp 客户端配置示例（本地服务器 → 公网穿透） |
| `FRP.md` | 内网穿透部署说明（frps + frpc + 域名 + 微信 HTTPS 注意） |

> 与 Windows 版的区别：Windows 用 `.bat` + `nssm/schtasks` 保活，Linux 用 `systemd` + `cron`；
> 前端 SPA、后端逻辑、SQLite 数据模型三者完全一致，两份部署天然独立、数据不互通。

---

## 11. 国内云部署与 ICP 备案 + AI 直连

### 11.1 推荐配置（2026 行情）

| 项 | 推荐 | 说明 |
|---|---|---|
| 厂商 | 腾讯云「轻量应用服务器」2核2G，或阿里云 ECS 经济型 e 2核2G（「99 计划」续费同价） | 新客约 60–100 元/年 |
| CPU/内存 | 2核2G 起步；想留余量选 2核4G | 当前负载极低，绰绰有余 |
| 系统盘 | 40–60GB SSD | 代码+前端+SQLite 都很小 |
| 系统 | Ubuntu 22.04/24.04 LTS | `setup-cloud.sh` 已验证 |
| 地域 | 华南（广州）/华东（上海） | 离用户近 |
| 带宽 | 轻量自带高带宽即可 | 报告页图文非视频流 |

年成本 ≈ 服务器 100 + 域名 50 ≈ **150 元/年**。选**明写「续费同价」**的款，避开「首年 38、续费 800」的坑。

### 11.2 为什么放国内云（关键好处）

之前 AI（豆包 / 火山方 Ark）不可用，根因是 Railway 在海外、连不上国内模型节点。
**部署到国内云后，后端直连 `ark.cn-beijing.volces.com` 等国内端点，无需 `AI_HTTP_PROXY` 代理**，
AI 解读 / 方案生成即恢复可用（已实测火山方 Ark 端点返回 200）。

### 11.3 ICP 备案（公网 80/443 绑域名必须）

国内服务器用 80/443 绑域名**必须 ICP 备案**（否则无法公网访问），流程：

1. 云厂商控制台提交备案（需身份证 / 人脸 / 短信核验），约 1–2 周；
2. 备案期间可用临时方案：仅内网 / VPN 暴露，或走第 12 节的 frp（frps 机器也需备案域名）；
3. 备案通过后，Caddy / nginx 反代 + 自动 HTTPS，绑定你的域名。

### 11.4 部署步骤

1. 买机器 → 控制台开 `22/80/443` 防火墙 → 设 SSH 密钥；
2. 域名 A 记录指向服务器 IP；
3. 登录服务器跑 `bash deploy/setup-cloud.sh`（装 Node + 建用户 + 拷代码 + systemd + 备份 cron）；
4. 复制 `deploy/quedong.env.example` 为 `deploy/quedong.env`，填 `SECRET` / AI 密钥（**去掉 `AI_HTTP_PROXY`**）；
5. （推荐容器化）`docker compose -f deploy/docker-compose.yml up -d --build`；
6. Caddy / nginx 反代 `8080` → `443`，自动 HTTPS；
7. 配 GitHub Actions 自动部署：仓库 `Settings` 加 `DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY` / `DEPLOY_PATH`
   四个 Secrets，之后 `git push` 即自动上线（见 `.github/workflows/deploy.yml`）。

---

## 12. 内网穿透（frp）索引

本地诊所服务器**无公网 IP / 未备案 / 临时需外网扫码**时，用 frp 把本地服务透传到公网：

- 配置示例：`deploy/frpc.example.toml`
- 完整说明：`deploy/FRP.md`（含 frps 搭建、本地 frpc、域名 DNS、微信 HTTPS 强制要求、安全提示）

> 注：frp 只解决「可达性」，业务鉴权仍是 `server.js` 的 Bearer 令牌（第 6 节已启用），患者数据不会裸奔。
