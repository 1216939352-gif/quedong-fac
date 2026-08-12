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

## 6. ⚠️ 公网暴露前必做（重要）

后端 `/api/sync/*` 与 `/api/media/*` **目前未挂鉴权**（账号体系是 Phase 0 的尾巴）。
直接公网开放 = 任何人都能读/写/删全部患者数据。

在补齐「选项2：给这两个路由挂 `authMiddleware`（前端 `sync.js` 带 Bearer 令牌）」之前，
至少启用下方**临时止损**之一：

- **nginx**：取消 `deploy/nginx-quedong.conf` 中 `location ~ ^/(api/sync|api/media)` 注释，
  把 `allow 203.0.113.0/24` 换成你的公司出口 IP / VPN 网段。
- **Caddy**：按 `deploy/Caddyfile` 文末示例加 `basicauth`。
- **或**：仅在内网/VPN 内暴露，不要直接放公网。

> 即便启用登录页（`/api/login` 已存在），同步接口也不校验令牌，所以**仅靠登录页不等于安全**。
> 真正多用户隔离 = 选项2 的路由鉴权 + 数据归属过滤。

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

> 与 Windows 版的区别：Windows 用 `.bat` + `nssm/schtasks` 保活，Linux 用 `systemd` + `cron`；
> 前端 SPA、后端逻辑、SQLite 数据模型三者完全一致，两份部署天然独立、数据不互通。
