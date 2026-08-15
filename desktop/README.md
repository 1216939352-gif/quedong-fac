# 鹊动健康 桌面客户端（Tauri 云壳）

把云端 SPA 包成一个原生桌面窗口，**不含任何本地后端/数据库**——所有业务逻辑（评估、方案、打卡、媒体）都跑在云端，桌面端只是加载云端 URL 的外壳。

优点：
- 体积小（安装包约 10MB，复用系统 WebView2，不打包浏览器）。
- 服务端一改，桌面/手机全网即时生效，彻底避免多端版本不一致（之前「肌少症扫码雷同 / 旧码不更新」的根因）。
- 零数据同步逻辑，维护成本最低。

## 前置依赖（一次性安装）
- **Node.js 18+**
- **Rust 工具链**：https://rustup.rs （安装时勾选 MSVC 工具链；Windows 还需「Visual Studio 生成工具 / C++ 桌面开发」）
- **WebView2 运行时**：Win10/11 一般已自带（本项目目标机已确认存在 151.x）。如缺失到微软官网装「Evergreen Standalone Installer」。
- **Git**

## 第一步：填入你的云域名
打开 `src-tauri/tauri.conf.json`，把两处 `https://YOUR-CLOUD-DOMAIN` 换成你的真实地址，例如：
```
https://quedong.up.railway.app
```
（共 2 处：`build.devPath` 和 `tauri.windows[0].url`。`dist/index.html` 里的占位链接也建议同步改。）

> 域名最好用固定域名（Railway 自定义域名 / 自有 VPS 域名），不要用每次部署都变的临时地址。

## 第二步：安装依赖
```bash
cd desktop
npm install
```

## 第三步：本地预览（开发模式）
```bash
npm run dev
```
首次会编译 Rust（几十秒~几分钟），之后弹出原生窗口并加载你的云域名。

## 第四步：打包发布
正式安装包需要完整图标。先生成图标（准备一张 1024x1024 的 PNG logo）：
```bash
npm run icon path/to/logo.png
```
再构建：
```bash
npm run build
```
产物在 `src-tauri/target/release/bundle/`（含 `.msi` / `.exe` 安装包，可发给医生/管理员直接装）。

> 不生成正式图标也能 `npm run dev`，但 `npm run build` 会报错。占位 `icons/icon.png` 已用 `node gen-icon.js` 生成，可直接 dev；发布前请替换为正式 logo。

## 说明 / 边界
- 这是一个「纯壳」。离线时窗口会显示浏览器式的无法连接——若需要断网也能用，请改用「离线一体包」方案（pkg 打包 server.js + Tauri 内嵌后端）。
- 桌面端、手机扫码、Web 端三套界面共用同一套云端代码，无需分别维护。
- 云部署参考：Railway 直接 push 触发；自有 VPS 用 `npm start` + nginx 反代 + Let's Encrypt，前端已由 `server.js` 从 `_dl3` 提供。
