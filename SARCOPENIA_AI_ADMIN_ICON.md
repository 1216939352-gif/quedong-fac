# 肌少症 AI 解读/方案 + 管理员标识 + 全局小Qoo 图标 收口

## 需求
1. 肌少症模块的报告解读、方案推荐与主系统一致具备 AI 解读 / AI 方案生成。
2. 开通 AI 的账号开启后**默认只显示 AI 生成页**，隐藏系统生成（可手动切回）。
3. 管理员**不显示** AI 开通/未开通标识，**默认开通**。
4. 全局 AI 图标统一为**小Qoo 形象**，检查并替换。

## 改动清单
### 肌少症报告解读（新增 AI 能力）
- `modules/sarcopenia.js`
  - 步骤7 评估报告模板：新增 `#sarc-ai-interp-host` 按钮容器；将系统报告 `buildSarcAssessmentReport(rec)` 包入 `#sarc-assessment-report-body`（作为 `systemEl`）。
  - `k===7` 接线：`AIReason.attachInterpretButton(host, () => buildSarcAIContext(compute(), buildRecord(compute())), { systemEl })`。生成后由 `installAIFirstView` **默认 AI、隐藏系统报告**，并提供「AI 生成 / 系统生成」分段切换。
  - 新增 `buildSarcAIContext(R, rec)`：构造 `{ module:'sarcopenia-assessment', patient, assessment:R, rawInput }` 作为 AI 解读上下文。
- 肌少症步骤8 方案推荐：沿用既有 `aiControls(sec, compute(), { systemEl })`（严谨版），已含「报告解读 / 方案推荐」双开关 + AI 优先（生成后隐藏系统方案），本任务确认无需新增。

### 管理员标识（隐藏 + 默认开通）
- `modules/admin.js`
  - 用户列表：`role==='admin'` 时 `adm-ai-flag` 输出空，**不显示**「AI 已开通 / 未开通」徽标。
  - 编辑/新增弹窗：「启用 AI 辅助」勾选区加 `.adm-aimode-field` 类，角色为 admin 时 `display:none` 隐藏。
  - 保存/创建：`patch.aiMode = (d.role==='admin') ? true : !!(aiEl && aiEl.checked)` —— 管理员**强制恒为 true**。
  - 徽标内 🤖 改 `window.qooIcon('sm')`。

### 全局小Qoo 图标替换
- `modules/ai-reason.js`：AI 优先分段条 `🤖 AI 生成` → `qooIcon('sm') + ' AI 生成'`。
- `modules/share.js`：分享页 AI 头 `🤖` → `window.qooIcon('sm')`（兜底为空，无任何 🤖）。
- `styles.override.css`：相关注释去除 🤖。
- 全局 grep 确认**应用代码已无 🤖 残留**（仅 `previews/` 静态预览页有「AI 助手建议」纯文本，非产品组件）。

## 验证
- `node --check`：sarcopenia.js / admin.js / ai-reason.js / share.js 全部通过。
- 5 个改动文件经 lock-safe 拷贝同步 `_dl3`。
- `curl` 服务端标记全命中：sarc-ai-interp-host=2、buildSarcAIContext=2、adm-aimode-field=4、force-aiMode-true=1、seg-tab qooIcon=1、share fallback=2、styles comment=1。
- 服务端实际返回的模块文件 🤖 计数 = 0。

## 用户验收
浏览器 **Ctrl+Shift+R** 硬刷新 http://localhost:8080/ → admin 登录：
1. 进入肌少症「步骤7 评估报告」→ 点「鹊动小Qoo 报告解读」→ 流式生成后**默认显示 AI 解读、隐藏系统报告**（可切回系统生成）。
2. 「步骤8 严谨版」开「报告解读 / 方案推荐」开关，生成后默认 AI、可切回系统方案。
3. 管理员后台：用户列表与编辑/新增弹窗**均不出现** AI 开通标识，且管理员 AI 恒为开通。
4. 全站 AI 图标均为小Qoo 吉祥物形象。
