#!/usr/bin/env bash
# 鹊动后端 — 云端一键安装脚本（在目标 Linux 服务器上以 root 运行）
#
# 前置：
#   - 一台干净的 Ubuntu/Debian（22.04/24.04 验证过），已用 root 登录
#   - 本脚本与项目一起上传到了服务器（假设脚本位于 <项目>/deploy/setup-cloud.sh）
#   - 域名 A 记录已指向本机公网 IP（HTTPS 步骤需要；可后补）
#
# 做这些事：
#   1) 安装 Node.js 24（node:sqlite 免 --experimental-sqlite）
#   2) 创建专用低权限用户 quedong 与目录 /opt/quedong/{server,frontend}
#   3) 拷贝后端(server/)与前端(_dl3/)到部署目录
#   4) npm install（仅生产依赖 express/multer）
#   5) 写入环境变量模板 /etc/quedong/quedong.env
#   6) 安装并启用 systemd 服务 quedong-backend
#   7) 注册每日自动备份 cron
#
# 不会做的事（需你后续手动，见 README）：
#   - 申请 Let's Encrypt 证书 / 配置 nginx-Caddy（交互式，README 有命令）
#   - [已完成] /api/sync、/api/media、/api/ai 的令牌鉴权已内置（server.js 的 authMiddleware），公网暴露可放心
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="/opt/quedong"
SVC_USER="quedong"
NODE_MAJOR=24

echo "==> 仓库根目录: $REPO_ROOT"
echo "==> 部署目录:   $DEPLOY_DIR"

# ── 1) 安装 Node.js ──
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v)"
  echo "==> 检测到已安装 Node: $NODE_VER"
else
  echo "==> 安装 Node.js $NODE_MAJOR.x (NodeSource) ..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
echo "==> node: $(node -v)  npm: $(npm -v)"

# ── 2) 创建用户与目录 ──
if ! id "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
  echo "==> 已创建系统用户 $SVC_USER"
fi
mkdir -p "$DEPLOY_DIR/server" "$DEPLOY_DIR/frontend" /etc/quedong /var/www/letsencrypt

# ── 3) 拷贝代码 ──
echo "==> 拷贝后端 server/ ..."
rm -rf "$DEPLOY_DIR/server"
cp -r "$REPO_ROOT/server" "$DEPLOY_DIR/server"
echo "==> 拷贝前端 _dl3/ -> $DEPLOY_DIR/frontend ..."
rm -rf "$DEPLOY_DIR/frontend"
cp -r "$REPO_ROOT/_dl3" "$DEPLOY_DIR/frontend"

# ── 4) 安装依赖 ──
echo "==> npm install (生产依赖) ..."
( cd "$DEPLOY_DIR/server" && npm install --omit=dev )

# ── 5) 环境变量 ──
if [ ! -f /etc/quedong/quedong.env ]; then
  cp "$REPO_ROOT/deploy/quedong.env.example" /etc/quedong/quedong.env
  # 生成一个随机强 SECRET 写入（避免依赖自动生成文件，便于备份/迁移）
  SECRET="$(openssl rand -hex 32)"
  echo "SECRET=$SECRET" >> /etc/quedong/quedong.env
  echo "==> 已生成随机 SECRET 并写入 /etc/quedong/quedong.env"
fi
chmod 600 /etc/quedong/quedong.env
chown root:root /etc/quedong/quedong.env

# ── 6) systemd ──
echo "==> 安装 systemd 单元 ..."
cp "$REPO_ROOT/deploy/quedong-backend.service" /etc/systemd/system/quedong-backend.service
chmod 644 /etc/systemd/system/quedong-backend.service

# 目录归属
chown -R "$SVC_USER:$SVC_USER" "$DEPLOY_DIR"

systemctl daemon-reload
systemctl enable --now quedong-backend

# ── 7) 备份 cron ──
echo "==> 注册每日备份 cron (03:15) ..."
CRON_LINE='15 3 * * * cd /opt/quedong/server && /usr/bin/node backup.js --keep=30 >> /opt/quedong/server/backups/backup.log 2>&1'
( crontab -u "$SVC_USER" -l 2>/dev/null | grep -v "backup.js" ; echo "$CRON_LINE" ) | crontab -u "$SVC_USER" -

# ── 收尾 ──
sleep 2
echo ""
echo "==================================================="
echo " 安装完成。"
echo " 后端状态: $(systemctl is-active quedong-backend)"
echo " 健康检查: curl -s http://127.0.0.1:8080/health"
echo "==================================================="
echo " 下一步（详见 deploy/README.md）："
echo "  1) 配置 HTTPS 反代：nginx( deploy/nginx-quedong.conf ) 或 Caddy( deploy/Caddyfile )"
echo "  2) 申请证书：sudo certbot --nginx -d 你的域名"
echo "  3) ✅ 后端已内置 /api/sync、/api/media、/api/ai 的令牌鉴权，无需额外加固即可公网暴露"
echo "  4) 验收：SERVER_URL=https://你的域名 node server/tests/acceptance.js"
echo "==================================================="
