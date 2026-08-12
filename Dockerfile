# 鹊动系统 · 含 AI 能力的后端 + 前端镜像
FROM node:22-bookworm

# node:sqlite 在 Node 22 仍为实验特性，用 --experimental-sqlite 启动
ENV NODE_OPTIONS=--experimental-sqlite
WORKDIR /app

# 先装后端依赖（利用层缓存）
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm install --omit=dev

# 复制后端与前端构建产物
COPY server/ ./server/
COPY _dl3/ ./_dl3/

# 运行时数据/媒体目录（建议挂卷持久化）
RUN mkdir -p /app/server/data /app/server/media /app/server/backups
VOLUME ["/app/server/data", "/app/server/media", "/app/server/backups"]

EXPOSE 8080
# server.js 从 ../_dl3 读取静态目录（容器内即 ./_dl3）
CMD ["node", "--experimental-sqlite", "server/server.js"]
