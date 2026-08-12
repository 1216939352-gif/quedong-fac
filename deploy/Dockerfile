# 鹊动后端 — Dockerfile（容器化部署备选）
#
# 构建上下文需为仓库根目录（即含 server/ 与 _dl3/ 的那一层），例如：
#   docker build -f deploy/Dockerfile -t quedong-backend ..
#
# 说明：
#  - 基础镜像用 node:24（node:sqlite 免 --experimental-sqlite 标志）
#  - 仅安装生产依赖（express / multer，纯 JS，无原生编译）
#  - 前端由 nginx/Caddy 托管时，容器内 frontend 可省略；若想让容器自身直接对外，
#    可改用多阶段 + 内嵌静态托管（本镜像保持"只跑 Node 后端"的最小职责）

FROM node:24-bookworm-slim

# 安装无头运行所需基础工具（仅用于备份脚本等可调用的基础命令）
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用层缓存：仅当 package.json 变化才重装）
COPY server/package.json ./server/package.json
RUN cd /app/server && npm install --omit=dev

# 拷贝后端代码与前端
COPY server/ ./server/
# 前端目录：把仓库里的 _dl3 作为静态前端（也可替换为你的生产构建产物）
COPY _dl3/ ./frontend/

ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/frontend
# SECRET 留空时自动生成并写入 /app/server/data/.secret；
# 生产务必通过环境变量或 secret 显式注入，并持久化 data 卷。

# 持久化数据 / 媒体 / 备份
VOLUME ["/app/server/data", "/app/server/media", "/app/server/backups"]

EXPOSE 8080

# 用 tini 作 PID 1，正确转发信号、回收僵尸进程
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "/app/server/server.js"]
