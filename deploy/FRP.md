# 内网穿透（frp）部署说明

## 何时需要

- 你的鹊动服务器在**诊所内网**，没有固定公网 IP；
- 或你有公网机器但**还没做 ICP 备案**，80/443 暂时不能绑域名对外；
- 或只是**临时**需要让医生/患者用手机扫码访问报告，不想立刻买云服务器。

> 如果你已经买了国内云服务器并完成了 ICP 备案，直接用 `Caddyfile` / `nginx-quedong.conf` 反代 + 自动 HTTPS 即可，**不需要 frp**（见 README 国内云章节）。

## 架构

```
[患者手机/微信]
      │  https://report.example.com
      ▼
[公网轻量云]  frps  (有固定公网 IP + 已备案域名)
      │  frp 隧道（7000 端口）
      ▼
[诊所内网机]  frpc  →  本地 Caddy(443) / 或后端(8080)  →  鹊动后端
```

要点：**frps 必须跑在有公网 IP 且已备案域名的机器上**（一台 2 核 2G 轻量云即可，约 60–100 元/年）。

## 步骤

### 1) 公网机：安装并配置 frps

下载 frp 后，编辑 `frps.toml`：

```toml
bindPort = 7000
auth.token = "设一个强随机串"
# 微信必须经 HTTPS：开启 vhost HTTPS 端口并放证书（方案 A 不需要，见下）
# vhostHTTPSPort = 443
# [webServer] 可选，用于看面板
```

启动：`frps -c frps.toml`（建议用 systemd 守护）。

### 2) 本地机：安装 frpc

复制本目录 `frpc.example.toml` 为 `frpc.toml`，按需改：

- **方案 A（推荐）**：本地已用 `deploy/Caddyfile` 起 Caddy 提供 443 HTTPS，则只启用 `quedong-https`
  （type=https, localPort=443）。证书在本地 Caddy 管理，frps 不碰证书，最省心。
- **方案 B**：本地只跑后端 8080，则启用 `quedong-web`（type=http）。但微信强制 HTTPS，
  需要在 frps 侧配置 `vhostHTTPSPort` + 证书，把 customDomains 的 TLS 终止在 frps。

启动：`frpc -c frpc.toml`。

### 3) 域名与 DNS

- 在域名服务商把 `report.example.com` 的 A 记录指向**公网 frps 机器 IP**。
- 方案 A：证书由本地 Caddy 用 DNS-01/HTTP-01 签发（确保本地机也能访问 80 做验证，或用 DNS 验证）。
- 方案 B：证书放在 frps 机器，由 frps 的 vhostHTTPSPort 终止 TLS。

### 4) 验收

手机（切 4G/非同 WiFi）打开 `https://report.example.com`，登录后扫码看报告。
若打不开：检查 frps/frpc 是否在运行、`customDomains` 与 DNS 是否一致、微信是否走 https。

## 安全提示

- frps 的 `auth.token` 务必设强随机串，否则他人可借你的隧道转发流量。
- 穿透只解决「可达性」，业务鉴权仍是 `server.js` 的 Bearer 令牌（已启用），患者数据不会裸奔。
- 长期稳定运行仍建议走「国内云 + 备案」正式方案，frp 更适合过渡/临时。
