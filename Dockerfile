# 鹊动智能FAC功能评估与干预系统 · 后端 + 前端 Docker 镜像
FROM node:22-bookworm

# node:sqlite 在 Node 22 仍为实验特性，用 --experimental-sqlite 启动
ENV NODE_OPTIONS=--experimental-sqlite
WORKDIR /app

# 安装根目录依赖（express / multer）
COPY package.json ./
RUN npm install --omit=dev

# 复制后端与前端静态产物
COPY server/ ./server/
COPY _dl3/ ./_dl3/

# 运行时数据/媒体目录（ Railway 请在控制台挂 Volumes，勿在 Dockerfile 声明 VOLUME ）
RUN mkdir -p /app/server/data /app/server/media /app/server/backups

EXPOSE 8080
# server.js 从 ../_dl3 读取静态目录（容器内即 ./_dl3）
CMD ["node", "--experimental-sqlite", "server/server.js"]
