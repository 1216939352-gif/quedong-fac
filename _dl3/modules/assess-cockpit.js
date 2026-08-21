/* ==================================================================
 * assess-cockpit.js — 评估驾驶舱通用骨架（四层架构）
 * 左：评估路径隧道（步骤状态机 + 进度 + 滑动动效）
 * 中：聚焦步骤表单 + Body Atlas 身体图谱（可旋转人体 + 部位锚点 + 滑出录入抽屉）
 * 右：实时评估快照（指标卡随输入刷新 + 多维风险立方体）
 * 三单元（spine / sarcopenia / weight）仅切 cfg 配置与 --ac 主题色。
 * 依赖：全局 U（U.qs / U.qsa / U.esc / U.today）
 * 降级：prefers-reduced-motion 关闭旋转/过渡；风险等级配文字标签（WCAG 2.2）
 * ================================================================== */
(function () {
  'use strict';

  var STYLE_ID = 'ac-cockpit-style';
  var ROTATE_ENABLED = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLOR = { low: '#0f766e', mid: '#d97706', high: '#dc2626', na: '#94a3b8' };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.ac{--ac:#534AB7;--ac-soft:color-mix(in srgb,var(--ac) 14%,#fff);display:grid;',
      'grid-template-columns:248px minmax(0,1fr) 332px;gap:16px;align-items:start;',
      '--txt:#1e293b;--mut:#64748b;--bd:#e2e8f0;--bg2:#f6f7fb;}',
      /* 暗色主题覆写：把 cockpit 局部变量切到深色（同时重写 --bg-card 避免回退到 #fff） */
      '[data-theme="dark"] .ac{--txt:#f1f5f9;--mut:#94a3b8;--bd:#334155;--bg2:#0f172a;--bg-card:rgba(15,21,40,0.85);color:var(--text-primary)}',
      /* 暗色：路径/阶段/抽屉主背景统一替换为深色玻璃 */
      '[data-theme="dark"] .ac-path-card,[data-theme="dark"] .ac-stage,[data-theme="dark"] .ac-drawer,[data-theme="dark"] .ac-snap,[data-theme="dark"] .ac-radar{background:linear-gradient(180deg, rgba(15,21,40,0.85), rgba(15,21,40,0.70));border-color:rgba(148,163,184,0.18)}',
      /* 暗色：步骤 1 录入摘要 4 列卡片配色（替换白底） */
      '[data-theme="dark"] .ac-rows .entry-sum-section{background:rgba(15,21,40,0.55);border:1px solid rgba(148,163,184,0.18);color:inherit}',
      '[data-theme="dark"] .ac-rows .entry-sum-section h4{color:var(--txt)}',
      '[data-theme="dark"] .ac-rows .entry-sum-card{background:rgba(15,21,40,0.65);border:1px solid rgba(148,163,184,0.20);color:inherit}',
      '[data-theme="dark"] .ac-rows .entry-sum-card .lbl{color:#94a3b8}',
      '[data-theme="dark"] .ac-rows .entry-sum-card .val{color:var(--txt)}',
      '[data-theme="dark"] .ac-rows .entry-sum-card .val i{color:#94a3b8}',
      /* 暗色：已录 OK 卡（原本硬编码浅绿渐变）改为深底 + 翠绿描边 */
      '[data-theme="dark"] .ac-rows .entry-sum-card.ok{border-color:rgba(45,212,191,0.55);background:linear-gradient(180deg, rgba(45,212,191,0.18), rgba(15,21,40,0.70));box-shadow:inset 0 1px 0 rgba(45,212,191,0.30)}',
      '[data-theme="dark"] .ac-rows .entry-sum-card.ok .val{color:#5eead4}',
      /* 暗色：步骤 1 提示条 */
      '[data-theme="dark"] .ac-rows .entry-sum-tip{background:rgba(99,102,241,0.14);border:1px solid rgba(99,102,241,0.30);color:#cbd5e1}',
      /* 暗色：人体图右侧 region 卡片（步骤 2 部位定位、青少年脊柱多维度评估）— 修硬编码 #fff */
      '[data-theme="dark"] .ac-region{background:rgba(15,21,40,0.55);border:1px solid rgba(148,163,184,0.22);color:inherit}',
      '[data-theme="dark"] .ac-region:hover{background:color-mix(in srgb, var(--ac) 18%, rgba(15,21,40,0.65));border-color:var(--ac)}',
      '[data-theme="dark"] .ac-region .rt{color:var(--txt)}',
      '[data-theme="dark"] .ac-region .rs{color:#94a3b8}',
      /* 暗色：人体图本体（atlas）— 兜底为深色 */
      '[data-theme="dark"] .ac-atlas{background:radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--ac) 18%, transparent), color-mix(in srgb, var(--bd) 60%, var(--bg-card)) 72%)}',
      /* 暗色：步骤 2 人体图上的锚点小圆点 */
      '[data-theme="dark"] .ac-atlas .anchor-dot{background:rgba(255,255,255,0.85);border-color:rgba(15,21,40,0.6)}',
      '[data-theme="dark"] .ac-atlas .anchor-dot.cur{background:var(--ac);border-color:#fff;box-shadow:0 0 0 5px color-mix(in srgb, var(--ac) 35%, transparent)}',
      /* 暗色下标识点文字：白底+浅字→深底+浅字，保证可读（原 color:var(--txt) 在暗色为浅色，白底上不可见） */
      '[data-theme="dark"] .ac-atlas .ac-atlas-label{background:rgba(15,23,42,.92);color:#e2e8f0;border:1px solid rgba(255,255,255,.16);box-shadow:0 3px 12px rgba(0,0,0,.45)}',
      '[data-theme="dark"] .ac-atlas .ac-atlas-label.cur{background:var(--ac);color:#fff;border-color:color-mix(in srgb,#fff 40%, transparent)}',
      '[data-theme="dark"] .ac-stage-hd h2, [data-theme="dark"] .ac-drawer-hd h3, [data-theme="dark"] .ac-path-ttl, [data-theme="dark"] .ac-stage-hd .ic, [data-theme="dark"] .ac-radar-ttl-in, [data-theme="dark"] .ac-metric .mv, [data-theme="dark"] .ac-node .ti, [data-theme="dark"] .ac-region .rt, [data-theme="dark"] .ac-tip, [data-theme="dark"] .ac-hint, [data-theme="dark"] .ac-snap-ttl, [data-theme="dark"] .ac-snap-foot, [data-theme="dark"] .ac-stage-hd .pg, [data-theme="dark"] .ac-stage-hd .sub, [data-theme="dark"] .ac-metric .mk, [data-theme="dark"] .ac-metric .ml, [data-theme="dark"] .ac-region .rs, [data-theme="dark"] .ac-ac-tip-card, [data-theme="dark"] .ac-radar-legend, [data-theme="dark"] .ac-radar-legend .lg-item{color:inherit}',
      '[data-theme="dark"] .ac-stage-hd .ic{background:color-mix(in srgb, var(--ac) 22%, #1e293b)}',
      '[data-theme="dark"] .ac-atlas{background:radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--ac) 18%, transparent), color-mix(in srgb, var(--bd) 60%, var(--bg-card)) 72%)}',
      '[data-theme="dark"] .ac-atlas-toggle{background:color-mix(in srgb, var(--bg-card) 70%, transparent)}',
      '[data-theme="dark"] .ac-atlas-toggle button.on{background:var(--bg-card);color:var(--ac)}',
      '[data-theme="dark"] .ac-radar.ac-radar-3d{background:linear-gradient(160deg, color-mix(in srgb, var(--bg-card) 85%, transparent), color-mix(in srgb, var(--bg-card) 55%, transparent));border-color:color-mix(in srgb, var(--bd) 60%, transparent)}',
      '[data-theme="dark"] .ac-radar{background:var(--bg-card);box-shadow:0 8px 24px rgba(0,0,0,.4)}',
      '[data-theme="dark"] .ac-metric{background:linear-gradient(180deg, color-mix(in srgb, var(--bg-card) 95%, transparent), color-mix(in srgb, var(--bg-card) 75%, transparent));box-shadow:0 4px 12px rgba(0,0,0,.30), inset 0 1px 0 color-mix(in srgb, var(--bg-card) 50%, transparent)}',
      '[data-theme="dark"] .ac-snap{background:var(--bg-card);box-shadow:0 8px 24px rgba(0,0,0,.30)}',
      '[data-theme="dark"] .ac-path-card{box-shadow:0 6px 22px rgba(0,0,0,.30)}',
      '[data-theme="dark"] .ac-drawer{background:var(--bg-card);box-shadow:-12px 0 40px rgba(0,0,0,.5)}',
      '.ac *{box-sizing:border-box}',
      '.ac-path{position:sticky;top:14px;align-self:start}',
      '.ac-path-card{background:var(--bg-card,#fff);border:1px solid var(--bd);border-radius:16px;padding:14px 14px 16px;box-shadow:0 6px 22px rgba(15,23,42,.05)}',
      '.ac-path-ttl{font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--mut);text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px}',
      '.ac-path-ttl .dot{width:8px;height:8px;border-radius:50%;background:var(--ac)}',
      '.ac-rail{position:relative;padding-left:26px}',
      '.ac-rail:before{content:"";position:absolute;left:9px;top:6px;bottom:6px;width:2px;background:var(--bd);border-radius:2px}',
      '.ac-rail .fill{position:absolute;left:9px;top:6px;width:2px;background:var(--ac);border-radius:2px;transition:height .5s cubic-bezier(.22,1,.36,1)}',
      '.ac-node{position:relative;display:flex;gap:10px;align-items:flex-start;padding:9px 8px;border-radius:11px;cursor:pointer;transition:background .2s;margin-bottom:2px}',
      '.ac-node:hover{background:var(--bg2)}',
      '.ac-node .mk{position:absolute;left:-21px;top:11px;width:18px;height:18px;border-radius:50%;background:var(--bg-card,#fff);border:2px solid var(--bd);',
      'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:var(--mut);z-index:2}',
      '.ac-node.done .mk{background:var(--ac);border-color:var(--ac);color:#fff}',
      '.ac-node.cur .mk{border-color:var(--ac);box-shadow:0 0 0 4px var(--ac-soft);color:var(--ac)}',
      '.ac-node .ac-node-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;min-width:0}',
      '.ac-node .ti{font-size:13.5px;font-weight:700;color:var(--txt);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}',
      '.ac-node .ti-row{display:flex;align-items:center;gap:6px;min-width:0}',
      '.ac-node .knd-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:2px}',
      '.ac-node .su{display:none}',
      '.ac-node .rec{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:var(--mut);font-weight:600;line-height:1}',
      '.ac-node.cur .ti{color:var(--ac)}',
      '.ac-node.locked{cursor:not-allowed;opacity:.55}',
      '.ac-node .knd{margin-left:auto;font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;background:var(--bg2);color:var(--mut);white-space:nowrap}',
      '.ac-stage{background:var(--bg-card,#fff);border:1px solid var(--bd);border-radius:16px;min-height:560px;overflow:hidden;box-shadow:0 6px 22px rgba(15,23,42,.05);display:flex;flex-direction:column;color:var(--text-primary)}',
      '.ac-stage-hd{padding:16px 20px 14px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:12px}',
      '.ac-stage-hd .ic{width:38px;height:38px;border-radius:11px;background:var(--ac-soft);display:flex;align-items:center;justify-content:center;font-size:19px}',
      '.ac-stage-hd h2{font-size:17px;margin:0;color:var(--txt)}',
      '.ac-stage-hd .sub{font-size:12.5px;color:var(--mut);margin-top:2px}',
      '.ac-stage-hd .pg{margin-left:auto;font-size:12.5px;font-weight:700;color:var(--ac)}',
      '.ac-stage-bd{padding:18px 20px 8px;flex:1}',
      '.ac-tip{font-size:13px;color:var(--mut);background:var(--bg2);border-radius:10px;padding:10px 12px;margin-bottom:2px}',
      '.ac-step-enter{animation:acFade .42s cubic-bezier(.22,1,.36,1)}',
      '@keyframes acFade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
      '.ac-atlas-wrap{display:grid;grid-template-columns:minmax(0,290px) minmax(0,1fr);gap:20px;align-items:start}',
      '@media(max-width:1180px){.ac-atlas-wrap{grid-template-columns:1fr}}',
      '.ac-atlas{position:relative;height:680px;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;',
      'background:radial-gradient(120% 90% at 50% 0%,var(--ac-soft),#f1f4fa 72%);border:1px solid var(--bd)}',
      '.ac-atlas img{height:100%;max-height:660px;max-width:100%;width:auto;display:block;object-fit:contain;filter:drop-shadow(0 18px 26px rgba(15,23,42,.20))}',
      '.ac-atlas .ac-atlas-label{position:absolute;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.95);color:var(--txt);font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:99px;box-shadow:0 2px 8px rgba(15,23,42,.18);pointer-events:none;white-space:nowrap;z-index:3;letter-spacing:.5px}',
      '.ac-atlas .ac-atlas-label.cur{background:var(--ac);color:#fff}',
      '.ac-atlas-toggle{position:absolute;top:11px;right:11px;z-index:5;display:flex;gap:4px;background:rgba(255,255,255,.72);',
      'padding:3px;border-radius:10px;box-shadow:0 2px 8px rgba(15,23,42,.12)}',
      '.ac-atlas-toggle button{border:0;background:transparent;color:var(--mut);padding:6px 13px;border-radius:8px;font-size:12.5px;cursor:pointer;font-weight:700}',
      '.ac-atlas-toggle button.on{background:var(--bg-card,#fff);color:var(--ac);box-shadow:0 2px 6px rgba(15,23,42,.12)}',
      '.ac-anchor{position:absolute;width:22px;height:22px;border-radius:50%;border:3px solid #fff;transform:translate(-50%,-50%);',
      'cursor:pointer;box-shadow:0 2px 9px rgba(15,23,42,.30);transition:transform .18s;z-index:4;background:#94a3b8}',
      '.ac-anchor:hover{transform:translate(-50%,-50%) scale(1.22)}',
      '.ac-anchor.mid{background:#d97706}.ac-anchor.high{background:#dc2626}.ac-anchor.low{background:#0f766e}.ac-anchor.na{background:#94a3b8}',
      '.ac-anchor:after{content:"";position:absolute;inset:-9px;border-radius:50%;border:2px solid currentColor;opacity:0}',
      '.ac-anchor.pulse:after{animation:acPulse 1.8s infinite;color:inherit}',
      '@keyframes acPulse{0%{opacity:.6;transform:scale(.7)}70%{opacity:0;transform:scale(1.5)}100%{opacity:0}}',
      '.ac-regions{display:flex;flex-direction:column;gap:2px}',
      '.ac-region{border:1px solid var(--bd);border-radius:14px;padding:8px 12px;cursor:pointer;display:flex;gap:8px;align-items:center;transition:all .18s;background:var(--bg-card,#fff)}',
      '.ac-region:hover{border-color:var(--ac);background:var(--ac-soft);transform:translateX(2px)}',
      '.ac-region .rd{width:11px;height:11px;border-radius:50%;flex:0 0 auto}',
      '.ac-region .rd.mid{background:#d97706}.ac-region .rd.high{background:#dc2626}.ac-region .rd.low{background:#0f766e}.ac-region .rd.na{background:#94a3b8}',
      '.ac-region .rt{font-size:32px;font-weight:700;color:var(--txt);line-height:1.2}',
      '.ac-region .rs{font-size:28px;color:var(--mut);margin-top:2px;line-height:1.2}',
      '.ac-region.done{opacity:.7}',
      '.ac-stage-ft{padding:12px 20px 16px;border-top:1px solid var(--bd);display:flex;align-items:center;gap:12px}',
      '.ac-hint{font-size:12.5px;color:var(--mut);flex:1}',
      '.ac-btn{border:none;border-radius:11px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;transition:transform .12s,box-shadow .2s}',
      '.ac-btn:active{transform:scale(.97)}',
      '.ac-btn.sec{background:var(--bg2);color:var(--txt)}',
      '.ac-btn.pri{background:var(--ac);color:#fff;box-shadow:0 6px 16px var(--ac-soft)}',
      '.ac-drawer-pop{position:fixed;inset:0;z-index:1400;display:flex;justify-content:flex-end}',
      '.ac-drawer-pop.hide{display:none}',
      '.ac-drawer-bg{position:absolute;inset:0;background:rgba(15,23,42,.42);opacity:0;transition:opacity .3s}',
      '.ac-drawer-pop.show .ac-drawer-bg{opacity:1}',
      '.ac-drawer{position:relative;width:min(460px,100vw);height:100vh;background:var(--bg-card,#fff);transform:translateX(100%);transition:transform .34s cubic-bezier(.22,1,.36,1);',
      'display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(15,23,42,.18)}',
      '.ac-drawer-pop.show .ac-drawer{transform:none}',
      '.ac-drawer-hd{padding:15px 18px;border-bottom:1px solid var(--bd);display:flex;align-items:center;gap:10px}',
      '.ac-drawer-hd .ic{width:32px;height:32px;border-radius:9px;background:var(--ac-soft);display:flex;align-items:center;justify-content:center;font-size:16px}',
      '.ac-drawer-hd h3{font-size:15px;margin:0;color:var(--txt)}',
      '.ac-drawer-hd .x{margin-left:auto;width:32px;height:32px;border-radius:9px;border:1px solid var(--bd);background:var(--bg-card,#fff);font-size:16px;cursor:pointer;color:var(--mut)}',
      '.ac-drawer-bd{padding:16px 18px;overflow:auto;flex:1}',
      '.ac-snap{position:sticky;top:14px;align-self:start;background:var(--bg-card,#fff);border:1px solid var(--bd);border-radius:16px;padding:15px;box-shadow:0 6px 22px rgba(15,23,42,.05)}',
      '.ac-snap-ttl{font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--mut);text-transform:uppercase;margin-bottom:11px;display:flex;align-items:center;gap:6px}',
      '.ac-snap-ttl .dot{width:8px;height:8px;border-radius:50%;background:var(--ac)}',
      '.ac-metric{border:1px solid var(--bd);border-radius:12px;padding:10px 12px;margin-bottom:9px;display:flex;justify-content:space-between;align-items:center;gap:10px;background:linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,255,0.75));backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(15,23,42,.06), inset 0 1px 0 rgba(255,255,255,.7);transition:transform .18s,box-shadow .18s,border-color .18s}',
      '.ac-metric:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.85);border-color:rgba(83,74,183,.30)}',
      '.ac-metric .mk{font-size:12.5px;color:var(--mut)}',
      '.ac-metric .mv{font-size:18px;font-weight:800;color:var(--txt)}',
      '.ac-metric .mv small{font-size:11px;font-weight:600;color:var(--mut)}',
      '.ac-metric .ml{font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:20px}',
      '.ac-metric .ml.ok{background:#dcfce7;color:#166534}.ac-metric .ml.warn{background:#fef3c7;color:#92400e}.ac-metric .ml.bad{background:#fee2e2;color:#991b1b}',
      '.ac-radar-wrap{margin-top:4px}',
      /* 3D 立体玻璃雷达：拟态磨砂半透明玻璃质感 */
      '.ac-radar.ac-radar-3d{position:relative;border-radius:22px;padding:18px 18px 14px;overflow:hidden;background:linear-gradient(160deg, rgba(255,255,255,0.85), rgba(248,250,255,0.55));backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border:1px solid rgba(255,255,255,0.65);box-shadow:0 14px 38px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.85), inset 0 -1px 0 rgba(99,102,241,.06)}',
      '.ac-radar.ac-radar-3d::before{content:"";position:absolute;inset:0;border-radius:22px;background:radial-gradient(circle at 50% 0%, rgba(255,255,255,.7), transparent 55%);pointer-events:none}',
      '.ac-radar.ac-radar-3d .ac-radar-ttl-in{position:relative;z-index:1;font-size:13.5px;font-weight:800;color:var(--txt);margin-bottom:10px;display:flex;align-items:center;gap:8px;letter-spacing:.3px}',
      '.ac-radar.ac-radar-3d .ac-radar-ttl-in:before{content:"";width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg, #fbbf24, #dc2626);box-shadow:0 0 0 3px rgba(245,158,11,.18)}',
      '.ac-radar.ac-radar-3d .ac-radar-stage{position:relative;z-index:1;background:linear-gradient(180deg, rgba(255,255,255,0.6), rgba(248,250,255,0.4));border-radius:18px;padding:6px 0;overflow:hidden}',
      '.ac-radar.ac-radar-3d .ac-radar-stage::after{content:"";position:absolute;left:8%;right:8%;bottom:0;height:40%;background:linear-gradient(180deg, transparent, rgba(99,102,241,0.05));border-radius:0 0 18px 18px;pointer-events:none}',
      '.ac-radar.ac-radar-3d .ac-radar-legend{position:relative;z-index:1;display:flex;justify-content:center;gap:12px;margin-top:10px;padding-top:10px;border-top:1px dashed rgba(99,102,241,.18);font-size:12px;color:var(--mut);font-weight:600}',
      '.ac-radar.ac-radar-3d .ac-radar-legend .lg-item{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;background:rgba(255,255,255,.6);border:1px solid rgba(99,102,241,.10)}',
      '.ac-radar.ac-radar-3d .ac-radar-legend .lg-item i{display:inline-block;width:8px;height:8px;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.7)}',
      '.ac-radar.ac-radar-3d .ac-radar-legend .lg-item.low i{background:#0f766e}',
      '.ac-radar.ac-radar-3d .ac-radar-legend .lg-item.mid i{background:#d97706}',
      '.ac-radar.ac-radar-3d .ac-radar-legend .lg-item.high i{background:#dc2626}',
      '.ac-radar{position:relative;border-radius:18px;padding:16px 16px 12px;overflow:hidden;',
      'background:var(--bg-card,#fff);border:1px solid var(--bd);box-shadow:0 6px 18px rgba(15,23,42,.06)}',
      '.ac-radar-ttl-in{font-size:13px;font-weight:800;color:var(--txt);margin-bottom:8px;display:flex;align-items:center;gap:6px}',
      '.ac-radar-ttl-in:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--ac)}',
      '.ac-radar-empty{padding:24px;text-align:center;color:var(--mut);font-size:12px}',
      '.ac-radar svg{width:100%;height:auto;display:block}',
      '.ac-radar .axis-t{fill:#33414f;font-size:11px;font-weight:700}',
      '.ac-radar .axis-l{font-size:10.5px;font-weight:700}',
      '.ac-radar-legend{display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:11px;color:var(--mut)}',
      '.ac-radar-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px;box-shadow:0 0 0 2px rgba(255,255,255,.6)}',
      '.ac-snap-foot{margin-top:10px;font-size:11.5px;color:var(--mut);line-height:1.5}',
      '.sarc-viz{display:grid;grid-template-columns:260px minmax(0,520px);gap:16px;margin:0 auto 16px;align-items:start;justify-content:center;max-width:980px}',
      '.sarc-viz .ac-atlas{height:360px;max-height:360px;display:grid;place-items:center;overflow:hidden;padding:10px;box-sizing:border-box}',
      '.sarc-viz .ac-atlas img{max-height:340px;width:auto;max-width:100%;object-fit:contain;display:block}',
      '.sarc-viz .ac-viz-tip{font-size:12px;color:var(--text-muted);margin-top:10px;line-height:1.6}',
      '@media(max-width:1180px){.sarc-viz{grid-template-columns:1fr;justify-items:center;gap:20px}.sarc-viz .ac-atlas{height:320px;max-height:320px;width:100%;max-width:360px}.sarc-viz .ac-atlas img{max-height:300px}.sarc-viz .ac-radar{max-width:480px;width:100%}}',
      '@media(prefers-reduced-motion:reduce){.ac-step-enter,.ac-anchor.pulse:after,.ac-drawer,.ac-drawer-bg,.ac-radar{animation:none!important;transition:none!important}}',

      /* ===== layout: rows —— 体重管理综合评估三排式 ===== */
      '.ac.ac-rows{display:flex;flex-direction:column;gap:16px;width:100%;box-sizing:border-box}',
      '.ac.ac-rows .ac-row2{display:grid;grid-template-columns:minmax(180px,220px) minmax(0,1fr);gap:16px;align-items:stretch;width:100%;box-sizing:border-box;min-height:760px}',
      /* 等高：路径卡（外层）与步骤视图同高 */
      '.ac.ac-rows .ac-row2 > .ac-path{position:static;top:auto;display:flex;align-self:stretch;height:100%}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card{flex:1;display:flex;flex-direction:column;width:100%}',
      '.ac.ac-rows .ac-row2 > .ac-stage{min-height:760px;height:100%;width:100%}',
      /* 路径卡放大版（适配拉高的 ac-rows 卡片） */
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card{padding:20px 18px 22px;border-radius:18px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-path-ttl{font-size:13.5px;margin-bottom:18px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-path-ttl .dot{width:10px;height:10px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail{padding-left:32px;display:flex;flex-direction:column;gap:14px;flex:1}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node{padding:13px 14px;border-radius:13px;margin-bottom:0;gap:14px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .mk{width:24px;height:24px;font-size:13px;left:-28px;top:13px;border-width:2.5px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .ti{font-size:16px;line-height:1.35}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .su{font-size:13px;margin-top:4px;line-height:1.45}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .knd{font-size:11.5px;padding:3px 9px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .rec{font-size:11.5px;margin-top:5px}',
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-rail .ac-node .rec .rec-ic{font-size:13px}',
      '.ac.ac-rows .ac-path-stats{margin-top:auto;padding-top:18px;border-top:1px dashed rgba(99,102,241,.22);display:flex;flex-direction:column;gap:11px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-line{font-size:13.5px;gap:8px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-line .cur-ic{width:24px;height:24px;font-size:12.5px;border-radius:50%}',
      '.ac.ac-rows .ac-path-stats .ac-stats-line .cur-tx{font-size:14.5px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-bar{height:10px;border-radius:10px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-meta{font-size:12.5px;margin-top:1px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-meta b{font-size:14.5px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-legend{padding-top:8px;font-size:12px;gap:6px 14px}',
      '.ac.ac-rows .ac-path-stats .ac-stats-legend .ld{width:10px;height:10px}',
      /* 步骤 1 摘要视图 + 全屏填写按钮 */
      '.ac-rows .entry-summary-wrap{display:flex;flex-direction:column;gap:14px;height:100%}',
      '.ac-rows .entry-sum-tip{font-size:13px;color:var(--mut);background:var(--bg2);border-radius:10px;padding:11px 14px;line-height:1.65;border:1px dashed rgba(99,102,241,.18)}',
      '.ac-rows .entry-sum-section{background:var(--bg-card,#fff);border:1px solid var(--bd);border-radius:14px;padding:14px 16px 16px;flex:1;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:auto}',
      '.ac-rows .entry-sum-section h4{margin:0;font-size:13.5px;font-weight:700;color:var(--txt);letter-spacing:.3px}',
      '.ac-rows .entry-sum-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;flex:1}',
      '.ac-rows .entry-sum-card{border:1px solid var(--bd);border-radius:11px;padding:11px 13px;background:var(--bg-card,#fff);display:flex;flex-direction:column;gap:5px;transition:.2s}',
      '.ac-rows .entry-sum-card:hover{border-color:var(--ac);box-shadow:0 4px 14px rgba(99,102,241,.10)}',
      '.ac-rows .entry-sum-card.ok{border-color:rgba(15,118,110,.35);background:linear-gradient(180deg, rgba(220,252,231,.45), #fff)}',
      '.ac-rows .entry-sum-card .lbl{font-size:12px;color:var(--mut);font-weight:600}',
      '.ac-rows .entry-sum-card .val{font-size:18px;font-weight:800;color:var(--txt)}',
      '.ac-rows .entry-sum-card .val i{font-size:11.5px;color:var(--mut);font-weight:500;font-style:normal;margin-left:2px}',
      '.ac-rows .entry-sum-actions{display:flex;justify-content:center;padding-top:8px}',
      '.ac-rows .entry-sum-actions .btn{min-width:280px;font-size:14.5px;padding:14px 22px;border-radius:13px;box-shadow:0 10px 24px rgba(14,165,164,.25)}',
      '@media(max-width:980px){.ac-rows .entry-sum-grid{grid-template-columns:repeat(2,1fr)}}',
      '.ac.ac-rows .ac-row3{display:flex;flex-direction:column;min-height:0;width:100%;box-sizing:border-box}',
      /* 体重管理实时评估快照：新版布局 = 顶部综合结论横幅 + 下方左右分区 */
      '.ac.ac-rows .ac-snap.ac-snap-split{position:static;top:auto;display:flex;flex-direction:column;gap:14px;width:100%;box-sizing:border-box;flex:1;min-height:0;padding:16px 18px;background:linear-gradient(180deg, rgba(99,102,241,.05), rgba(34,211,238,.04));border:1px solid rgba(99,102,241,.18);border-radius:16px;box-shadow:0 12px 32px rgba(15,23,42,.06)}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-ttl{margin-bottom:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;letter-spacing:.04em;color:var(--txt);text-transform:uppercase}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-ttl .dot{width:9px;height:9px;border-radius:50%;background:var(--ac)}',
      /* ---------- 顶部综合结论横幅 ---------- */
      '.ac.ac-rows .ac-snap-split > .ac-snap-banner{display:grid;grid-template-columns:180px 1fr 280px;gap:14px;align-items:stretch}',
      '.ac.ac-rows .banner-level{border-radius:14px;padding:16px 18px;color:#fff;display:flex;flex-direction:column;justify-content:center;gap:4px;box-shadow:0 10px 24px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.25)}',
      '.ac.ac-rows .banner-level .lvl-cap{font-size:11.5px;letter-spacing:.1em;opacity:.85;font-weight:600}',
      '.ac.ac-rows .banner-level .lvl-v{font-size:30px;font-weight:900;letter-spacing:.04em;line-height:1.1;text-shadow:0 2px 8px rgba(0,0,0,.18)}',
      '.ac.ac-rows .banner-level .lvl-tip{font-size:11.5px;opacity:.92;line-height:1.45;margin-top:2px}',
      '.ac.ac-rows .banner-mid{background:rgba(255,255,255,.6);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,.16);border-radius:14px;padding:14px 18px;display:flex;flex-direction:column;gap:8px;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}',
      '.ac.ac-rows .banner-mid-ttl{font-size:11.5px;font-weight:800;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}',
      '.ac.ac-rows .banner-mid-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;flex:1;min-height:0;justify-content:center}',
      '.ac.ac-rows .banner-mid-list li{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.55;color:var(--txt)}',
      '.ac.ac-rows .banner-mid-list li .dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;margin-top:6px}',
      '.ac.ac-rows .banner-mid-list li b{font-weight:700;color:var(--txt);flex:0 0 auto}',
      '.ac.ac-rows .banner-mid-list li .mut{color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
      '.ac.ac-rows .banner-stripes{background:rgba(255,255,255,.6);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,.16);border-radius:14px;padding:12px 16px;display:flex;flex-direction:column;gap:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}',
      '.ac.ac-rows .banner-stripes-ttl{font-size:11.5px;font-weight:800;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}',
      '.ac.ac-rows .banner-stripes-list{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;flex:1;align-content:center}',
      '.ac.ac-rows .banner-dim{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}',
      '.ac.ac-rows .banner-dim .dim-bar{width:100%;height:6px;border-radius:99px;background:rgba(15,23,42,.08);overflow:hidden}',
      '.ac.ac-rows .banner-dim .dim-fill{height:100%;border-radius:inherit;transition:width .6s cubic-bezier(.22,1,.36,1)}',
      '.ac.ac-rows .banner-dim .dim-name{font-size:10.5px;color:var(--mut);font-weight:600;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      /* 暗色主题：横幅 + 玻璃容器的背景深度调整 */
      '[data-theme="dark"] .ac.ac-rows .ac-snap-split{background:linear-gradient(180deg, color-mix(in srgb, var(--ac) 8%, transparent), color-mix(in srgb, #22d3ee 5%, transparent));border-color:color-mix(in srgb, var(--ac) 28%, transparent);box-shadow:0 12px 32px rgba(0,0,0,.4)}',
      '[data-theme="dark"] .ac.ac-rows .banner-mid,[data-theme="dark"] .ac.ac-rows .banner-stripes{background:color-mix(in srgb, var(--bg-card) 72%, transparent);border-color:color-mix(in srgb, var(--bd) 60%, transparent);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 35%, transparent)}',
      '[data-theme="dark"] .ac.ac-rows .banner-stripes .banner-stripes-ttl, [data-theme="dark"] .ac.ac-rows .banner-mid .banner-mid-ttl{color:#cbd5e1}',
      '[data-theme="dark"] .ac.ac-rows .banner-dim .dim-bar{background:color-mix(in srgb, var(--bg-card) 50%, transparent)}',
      '[data-theme="dark"] .ac.ac-rows .banner-mid-list li{color:var(--text-primary)}',
      '[data-theme="dark"] .ac.ac-rows .banner-mid-list li .mut{color:var(--mut)}',
      '[data-theme="dark"] .ac.ac-rows .ac-snap-body > .ac-snap-radar,[data-theme="dark"] .ac.ac-rows .ac-snap-body > .ac-snap-text{background:color-mix(in srgb, var(--bg-card) 60%, transparent);border-color:color-mix(in srgb, var(--bd) 60%, transparent);box-shadow:inset 0 1px 0 color-mix(in srgb, var(--bg-card) 35%, transparent)}',
      /* ---------- 下方左右分区（重新平衡：雷达不再过大、右侧文字放大可读） ---------- */
      /* 比例反转：雷达 1fr vs 文字 1.3fr，宽屏下雷达 ≈43%、文字 ≈57%；≤960px 叠单列 */
      '.ac.ac-rows .ac-snap-split > .ac-snap-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px;align-items:stretch;flex:1;min-height:0}',
      '.ac.ac-rows .ac-snap-body > .ac-snap-radar{border-radius:14px;padding:16px;background:rgba(255,255,255,.55);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,.16);display:flex;align-items:stretch;justify-content:center;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}',
      '.ac.ac-rows .ac-snap-body > .ac-snap-radar > #ac-cube{width:100%;max-width:360px;margin:0 auto;display:flex;align-items:center;justify-content:center;height:100%}',
      '.ac.ac-rows .ac-snap-body > .ac-snap-radar .ac-radar{width:100%;height:100%}',
      '.ac.ac-rows .ac-snap-body > .ac-snap-text{border-radius:14px;padding:10px 12px 12px;background:rgba(255,255,255,.55);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,.16);display:flex;flex-direction:column;min-width:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}',
      /* 右侧文字视图容器撑满整栏高度，使 6 张指标卡等距均分、下方不留空 */
      '.ac.ac-rows .ac-snap-text > #ac-metrics{flex:1;min-height:0;display:flex;flex-direction:column}',
      /* 六张卡片用 3 列 × 2 行，单卡更紧凑：缩小 padding / 字号，让 6 张填满右侧高度不显拥挤 */
      '.ac.ac-rows .ac-snap-text .ac-metric-grid{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;flex:1;min-height:0;gap:8px;align-content:stretch;align-items:stretch}',
      '.ac.ac-rows .ac-snap-text .ac-metric-grid > .ac-metric{margin-bottom:0;padding:11px 13px;gap:4px;border-radius:10px;height:100%}',
      '.ac.ac-rows .ac-snap-text .ac-metric-grid > .ac-metric .mk{font-size:25px;letter-spacing:.02em}',
      '.ac.ac-rows .ac-snap-text .ac-metric-grid > .ac-metric .mv{font-size:22px;font-weight:800}',
      '.ac.ac-rows .ac-snap-text .ac-metric-grid > .ac-metric .ml{font-size:10px;padding:2px 6px}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-foot{margin-top:2px}',
      /* 仅 ≤960px 才把左右分区叠成单列（保证宽屏下始终是 雷达撑左 + 6 张文字卡撑右） */
      '@media(max-width:960px){.ac.ac-rows .ac-row2{grid-template-columns:1fr}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-banner{grid-template-columns:160px 1fr;gap:12px}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-banner > .banner-stripes{grid-column:1/-1}',
      '.ac.ac-rows .ac-snap-split > .ac-snap-body{grid-template-columns:1fr}',
      '.ac.ac-rows .ac-snap-body > .ac-snap-radar > #ac-cube{max-width:340px;margin:0 auto}}',

      /* ===== layout: hzpath —— 青少年脊柱：第一排横向评估路径（单列铺满整行） ===== */
      '.ac.ac-hz{display:flex;flex-direction:column;gap:16px}',
      '.ac.ac-hz .ac-row1 > .ac-path{position:static;top:auto;width:100%}',
      '.ac.ac-hz .ac-path-card{padding:20px 26px 24px;display:flex;flex-direction:column;gap:18px}',
      '.ac.ac-hz .ac-path-card .ac-path-ttl{font-size:14px;letter-spacing:.04em}',
      '.ac.ac-hz .ac-rail{padding-left:0;display:flex;align-items:stretch;gap:0;flex:1}',
      '.ac.ac-hz .ac-rail:before{left:6%;right:6%;top:34px;bottom:auto;width:auto;height:2.5px}',
      '.ac.ac-hz .ac-rail .fill{left:6%;top:34px;height:2.5px!important;width:0;transition:width .5s cubic-bezier(.22,1,.36,1)}',
      '.ac.ac-hz .ac-node{flex:1 1 0;min-width:0;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:8px 12px 12px;margin:0;justify-content:center}',
      /* 横向路径每步独立图标；当前步图标变大高亮、文字加深+放大+加粗 */
      '.ac.ac-hz .ac-node .mk{position:static;left:auto;top:auto;width:54px;height:54px;font-size:22px;border-width:2px;',
      'background:var(--bg2);color:var(--mut);transition:transform .28s cubic-bezier(.22,1,.36,1),background .25s,box-shadow .25s}',
      '.ac.ac-hz .ac-node.done .mk{background:var(--ac);border-color:var(--ac);color:#fff}',
      '.ac.ac-hz .ac-node.cur .mk{width:68px;height:68px;font-size:30px;background:var(--bg-card,#fff);border-color:var(--ac);color:var(--ac);',
      'box-shadow:0 0 0 7px var(--ac-soft),0 10px 24px rgba(15,23,42,.12);transform:translateY(-3px)}',
      '.ac.ac-hz .ac-node .ti{font-size:14px;font-weight:600;color:var(--mut);line-height:1.3;transition:font-size .25s,color .25s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.ac.ac-hz .ac-node.cur .ti{font-size:16.5px;font-weight:800;color:var(--txt)}',
      '.ac.ac-hz .ac-node .su{font-size:11.5px}',
      '.ac.ac-hz .ac-node.cur .su{color:var(--ac)}',
      '.ac.ac-hz .ac-node .knd{margin-left:0}',
      /* 脊柱 Row1：路径卡（宽）+ 重点提示卡（窄），并排撑满整行 */
      '.ac.ac-hz .ac-row1{display:grid;grid-template-columns:minmax(0,1fr);gap:0;align-items:stretch;width:100%;box-sizing:border-box}',
      '.ac.ac-hz .ac-row1 > .ac-path{position:static;top:auto;width:100%;min-width:0}',
      '.ac.ac-hz .ac-row1 > .ac-path > .ac-path-card{height:100%}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card{background:linear-gradient(180deg,rgba(83,74,183,.04),rgba(34,211,238,.04));border:1px solid var(--bd);border-radius:16px;padding:16px 18px;display:flex;flex-direction:column;width:100%;min-width:0;box-shadow:0 6px 22px rgba(15,23,42,.05)}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card .ac-tip-ttl{font-size:12px;font-weight:800;letter-spacing:.04em;color:var(--mut);text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card .ac-tip-ttl .dot{width:8px;height:8px;border-radius:50%;background:var(--ac)}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card li{font-size:12.5px;line-height:1.55;color:var(--txt);display:flex;gap:9px;align-items:flex-start}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card li .ic{flex:0 0 auto;width:22px;height:22px;border-radius:7px;background:var(--ac-soft);color:var(--ac);font-size:12px;display:inline-flex;align-items:center;justify-content:center;font-weight:800}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card li b{color:var(--txt);font-weight:700}',
      '.ac.ac-hz .ac-row1 > .ac-tip-card li .mut{color:var(--mut);font-size:11.5px;display:block;margin-top:1px}',
      /* 路径卡底部"本期评估状态"——填满 ac-rows 布局下路径卡底部空白 */
      '.ac.ac-rows .ac-row2 > .ac-path > .ac-path-card .ac-path-stats{margin-top:auto;padding-top:14px;border-top:1px dashed rgba(99,102,241,.20);display:flex;flex-direction:column;gap:9px}',
      '.ac-path-stats .ac-stats-line{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px}',
      '.ac-path-stats .ac-stats-line .cur-ic{width:20px;height:20px;border-radius:50%;background:var(--ac-soft);color:var(--ac);font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}',
      '.ac-path-stats .ac-stats-line .cur-tx{color:var(--txt);font-weight:700;font-size:12.5px}',
      '.ac-path-stats .ac-stats-bar{height:8px;background:rgba(99,102,241,.10);border-radius:10px;overflow:hidden;position:relative}',
      '.ac-path-stats .ac-stats-bar .bar-fill{height:100%;background:linear-gradient(90deg,var(--ac),color-mix(in srgb,var(--ac) 60%,#fff));border-radius:10px;transition:width .45s cubic-bezier(.22,1,.36,1)}',
      '.ac-path-stats .ac-stats-meta{display:flex;justify-content:space-between;font-size:11px;color:var(--mut)}',
      '.ac-path-stats .ac-stats-meta b{color:var(--ac);font-weight:800;font-size:13px}',
      '.ac-path-stats .ac-stats-legend{display:flex;flex-wrap:wrap;gap:4px 12px;padding-top:6px;border-top:1px dashed rgba(99,102,241,.12);font-size:11px;color:var(--mut)}',
      '.ac-path-stats .ac-stats-legend .item{display:inline-flex;align-items:center;gap:5px}',
      '.ac-path-stats .ac-stats-legend .ld{width:9px;height:9px;border-radius:50%;border:2px solid var(--bd)}',
      '.ac-path-stats .ac-stats-legend .ld.cur{background:var(--ac);border-color:var(--ac);box-shadow:0 0 0 3px var(--ac-soft)}',
      '.ac-path-stats .ac-stats-legend .ld.done{background:var(--ac);border-color:var(--ac)}',
      '.ac-path-stats .ac-stats-legend .ld.todo{background:var(--bg-card,#fff);border-color:var(--bd)}',
      /* 脊柱路径卡底部图例（之前 spine.js 已创建但缺 CSS） */
      '.ac.ac-hz .ac-path-card .ac-path-legend{margin-top:auto;padding-top:14px;border-top:1px dashed rgba(83,74,183,.20);display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--mut)}',
      '.ac.ac-hz .ac-path-card .ac-path-legend .row{display:inline-flex;align-items:center;gap:6px}',
      '.ac.ac-hz .ac-path-card .ac-path-legend .dots{width:10px;height:10px;border-radius:50%;border:2px solid var(--bd);display:inline-block}',
      '.ac.ac-hz .ac-path-card .ac-path-legend .dots.cur{background:var(--ac);border-color:var(--ac);box-shadow:0 0 0 3px var(--ac-soft)}',
      '.ac.ac-hz .ac-path-card .ac-path-legend .dots.done{background:var(--ac);border-color:var(--ac)}',
      '.ac.ac-hz .ac-path-card .ac-path-legend .dots.todo{background:var(--bg-card,#fff);border-color:var(--bd)}',
      /* 脊柱 Row2：确保 stage/snap 撑满栅格列 */
      '.ac.ac-hz .ac-row2h{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:stretch;width:100%;box-sizing:border-box;height:calc(100vh - 168px)}',
      '.ac.ac-hz .ac-row2h > .ac-stage{min-width:0;width:100%;height:100%;min-height:0}',
      '.ac.ac-hz .ac-row2h > .ac-stage > .ac-stage-bd{overflow:auto;min-height:0}',
      '.ac.ac-hz .ac-row2h > .ac-snap{position:static;top:auto;height:100%;display:flex;flex-direction:column;min-width:0;width:100%}',
      /* 脊柱评估专用：3D 容器放大、右侧文字卡缩小；7 个 region 紧凑排列、不重叠 */
      /* 步骤2：左侧 3D 人体图 与 右侧区域列表 强制等高、且不裁切。
         仅作用于「含人体图+区域列表(.ac-atlas-wrap)」的那一行 → 不影响步骤3/4（它们用固定高度 stage/snap）。
         行高=内容驱动：右侧更高时整行撑高、左侧 3D 同步拉伸等高；右侧较短时左侧保持固有高度(680)不强行撑满一屏，避免「左高右低」。 */
      '.ac.ac-hz.ac--spine .ac-row2h:has(.ac-atlas-wrap){grid-template-columns:minmax(0,2.1fr) minmax(0,1fr);align-items:stretch;height:auto;min-height:0}',
      '.ac.ac-hz.ac--spine .ac-row2h:has(.ac-atlas-wrap) > .ac-stage{height:auto;min-height:560px;overflow:visible}',
      '.ac.ac-hz.ac--spine .ac-row2h:has(.ac-atlas-wrap) > .ac-stage > .ac-stage-bd{display:flex;flex-direction:column;min-height:0;overflow:visible}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap{flex:1;min-height:0;align-items:stretch;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-atlas{height:auto;min-height:680px;overflow:hidden}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-regions{display:flex;flex-direction:column;gap:3px;height:auto;min-height:0;overflow:visible;justify-content:flex-start}',
      /* canvas 由 three 以内联像素 style 渲染，用 !important 覆盖为撑满容器，左侧 3D 图随右侧高度同步拉伸 */
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-atlas canvas{width:100%!important;height:100%!important;display:block}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-regions .ac-region{flex:0 0 auto;padding:7px 11px;display:flex;gap:5px;align-items:center;min-height:0}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-regions .ac-region .rt{font-size:22px;font-weight:700;line-height:1.25}',
      '.ac.ac-hz.ac--spine .ac-atlas-wrap > .ac-regions .ac-region .rs{font-size:16px;line-height:1.25;margin-top:2px}',
      /* 全屏填写弹窗内右侧评估项目列表：字号比主视图再小一号 */
      '.ac-step-fullscreen .ac-fs-regions{display:flex;flex-direction:column;gap:10px}',
      '.ac-step-fullscreen .ac-fs-regions .ac-region{padding:8px 12px;gap:6px;border-radius:10px}',
      '.ac-step-fullscreen .ac-fs-regions .ac-region .rt{font-size:18px;font-weight:700;line-height:1.5}',
      '.ac-step-fullscreen .ac-fs-regions .ac-region .rs{font-size:14px;line-height:1.5;margin-top:6px}',
      /* 体重评估（rows 布局）步骤 2：右侧列表紧凑、字号放大 */
      '.ac.ac-rows .ac-row2 > .ac-stage > .ac-stage-bd > .ac-atlas-wrap{height:100%}',
      '.ac.ac-rows .ac-row2 > .ac-stage > .ac-stage-bd > .ac-atlas-wrap > .ac-regions{height:100%;justify-content:flex-start;gap:4px}',
      '.ac.ac-rows .ac-row2 > .ac-stage > .ac-stage-bd > .ac-atlas-wrap > .ac-regions .ac-region{padding:10px 14px;gap:6px}',
      '.ac.ac-rows .ac-row2 > .ac-stage > .ac-stage-bd > .ac-atlas-wrap > .ac-regions .ac-region .rt{font-size:20px;font-weight:700;line-height:1.15}',
      '.ac.ac-rows .ac-row2 > .ac-stage > .ac-stage-bd > .ac-atlas-wrap > .ac-regions .ac-region .rs{font-size:16px;line-height:1.15;margin-top:2px}',
      '@media(max-width:1180px){.ac.ac-hz .ac-row2h{grid-template-columns:1fr}',
      '.ac.ac-hz .ac-row1{grid-template-columns:1fr}',
      '.ac.ac-hz .ac-rail{flex-wrap:wrap}.ac.ac-hz .ac-rail:before,.ac.ac-hz .ac-rail .fill{display:none}}'
    ].join('');
    var st = document.createElement('style');
    st.id = STYLE_ID; st.textContent = css;
    document.head.appendChild(st);
  }

  // ---- Body Atlas：真实人体图（正面/背面）+ 可点击锚点 ----
  function bodySVG() {
    return '<svg viewBox="0 0 200 360" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
      '<g fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.4">' +
      '<circle cx="100" cy="34" r="20"/>' +                       // 头
      '<rect x="92" y="52" width="16" height="18" rx="6"/>' +     // 颈
      '<path d="M70 70 Q100 60 130 70 L134 168 Q100 178 66 168 Z"/>' + // 躯干
      '<rect x="46" y="74" width="18" height="86" rx="9"/>' +     // 左臂
      '<rect x="136" y="74" width="18" height="86" rx="9"/>' +    // 右臂
      '<rect x="74" y="166" width="20" height="150" rx="10"/>' +  // 左腿
      '<rect x="106" y="166" width="20" height="150" rx="10"/>' + // 右腿
      '</g>' +
      '<g stroke="#94a3b8" stroke-width="1.2" fill="none" opacity=".55">' +
      '<path d="M100 70 L100 168"/>' +   // 脊柱中线
      '<path d="M84 92 L116 92"/><path d="M82 118 L118 118"/><path d="M84 144 L116 144"/>' +
      '</g></svg>';
  }

  function buildAtlas(regions, atlasCfg) {
    atlasCfg = atlasCfg || {};
    var host = document.createElement('div');
    host.className = 'ac-atlas';
    var frontImg = atlasCfg.frontImg, backImg = atlasCfg.backImg;
    var mode = atlasCfg.mode || 'back';
    if (frontImg || backImg) {
      var img = document.createElement('img');
      img.alt = '人体图谱';
      var setImg = function (m) { img.src = (m === 'front' && frontImg) ? frontImg : (backImg || frontImg); };
      setImg(mode);
      host.appendChild(img);
      if (frontImg && backImg) {
        var tog = document.createElement('div'); tog.className = 'ac-atlas-toggle';
        var bBack = document.createElement('button'); bBack.textContent = '背面';
        var bFront = document.createElement('button'); bFront.textContent = '正面';
        var apply = function (m) { mode = m; setImg(m); bBack.classList.toggle('on', m === 'back'); bFront.classList.toggle('on', m === 'front'); };
        bBack.onclick = function () { apply('back'); };
        bFront.onclick = function () { apply('front'); };
        apply(mode);
        host.appendChild(tog);
      }
    } else {
      host.innerHTML = bodySVG();
    }
    regions.forEach(function (r) {
      var a = document.createElement('button');
      a.className = 'ac-anchor ' + (r.risk || 'na') + ((r.risk === 'mid' || r.risk === 'high') ? ' pulse' : '');
      a.style.left = r.x + '%'; a.style.top = r.y + '%';
      a.style.color = COLOR[r.risk || 'na'];
      a.setAttribute('aria-label', r.label);
      a.title = r.label;
      a.dataset.rid = r.id;
      host.appendChild(a);
      /* 锚点旁的文字标签：使用 r.lx 自定义标签横向位置，避免遮挡人体图（人体一般在 x:30-70% 区域） */
      var lab = document.createElement('div');
      lab.className = 'ac-atlas-label';
      lab.textContent = (r.icon || '') + ' ' + r.label;
      var lx = (typeof r.lx === 'number') ? r.lx : (r.x > 50 ? Math.min(95, r.x + 4) : Math.max(5, r.x - 4));
      /* 标签的锚定策略：右侧标签靠左对齐到 lx；左侧标签靠右对齐到 lx（transform 100% 反向） */
      if (lx > 50) {
        lab.style.left = lx + '%';
        lab.style.transform = 'translateX(-100%)';
        lab.style.top = (r.y - 1.5) + '%';
      } else {
        lab.style.left = lx + '%';
        lab.style.transform = 'none';
        lab.style.top = (r.y - 1.5) + '%';
      }
      host.appendChild(lab);
    });
    return host;
  }

  // ---- 六维风险雷达（平面 2D 样式）----
  function buildRadar(rc) {
    rc = rc || { overall: 'low', dims: [] };
    var wrap = document.createElement('div');
    wrap.className = 'ac-radar ac-radar-3d';
    var n = Math.min(6, rc.dims.length);
    if (!n) { wrap.innerHTML = '<div class="ac-radar-empty">暂无风险维度数据</div>'; return wrap; }
    var overallTxt = rc.overall === 'high' ? '高风险' : rc.overall === 'mid' ? '中风险' : '低风险';
    var overallColor = rc.overall === 'high' ? '#dc2626' : rc.overall === 'mid' ? '#d97706' : '#0f766e';
    /* 雷达图：3D 立体 + 玻璃质感。
       通过 SVG 渐变（defs linearGradient + radialGradient）模拟立体光影；多层 path 叠加模拟层级感。 */
    var CX = 200, CY = 175, RC = 130;
    function pt(i, r) { var ang = -Math.PI / 2 + i * Math.PI * 2 / n; return [CX + Math.cos(ang) * r, CY + Math.sin(ang) * r]; }
    function valOf(level) { return level === 'high' ? 0.95 : level === 'mid' ? 0.72 : level === 'low' ? 0.45 : 0.20; }
    var C = { low: '#0f766e', mid: '#d97706', high: '#dc2626', na: '#94a3b8' };
    var h = '';
    /* SVG defs：渐变 + 滤镜 + 阴影 */
    h += '<defs>' +
      // 背景径向光晕（拟态磨砂）
      '<radialGradient id="rgrad-bg" cx="50%" cy="40%" r="80%">' +
        '<stop offset="0%" stop-color="rgba(99,102,241,0.16)"/>' +
        '<stop offset="60%" stop-color="rgba(99,102,241,0.04)"/>' +
        '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>' +
      '</radialGradient>' +
      // 数据多边形渐变（玻璃质感）
      '<linearGradient id="rgrad-data" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="rgba(245,158,11,0.55)"/>' +
        '<stop offset="100%" stop-color="rgba(220,38,38,0.32)"/>' +
      '</linearGradient>' +
      '<linearGradient id="rgrad-data-stroke" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="#fbbf24"/>' +
        '<stop offset="100%" stop-color="#dc2626"/>' +
      '</linearGradient>' +
      // 多层立体环渐变（内浅外深）
      '<radialGradient id="rgrad-ring" cx="50%" cy="50%" r="50%">' +
        '<stop offset="0%" stop-color="rgba(99,102,241,0)"/>' +
        '<stop offset="100%" stop-color="rgba(99,102,241,0.22)"/>' +
      '</radialGradient>' +
      // 中心玻璃高光
      '<radialGradient id="rgrad-center" cx="40%" cy="35%" r="80%">' +
        '<stop offset="0%" stop-color="rgba(255,255,255,0.95)"/>' +
        '<stop offset="60%" stop-color="rgba(255,255,255,0.55)"/>' +
        '<stop offset="100%" stop-color="rgba(255,255,255,0.18)"/>' +
      '</radialGradient>' +
      // 高光叠层
      '<linearGradient id="rgrad-shine" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="rgba(255,255,255,0.55)"/>' +
        '<stop offset="100%" stop-color="rgba(255,255,255,0)"/>' +
      '</linearGradient>' +
      // 阴影
      '<filter id="rfilter-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feGaussianBlur in="SourceAlpha" stdDeviation="4"/>' +
        '<feOffset dx="0" dy="3" result="off"/>' +
        '<feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>' +
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
      // 顶点光晕
      '<filter id="rfilter-glow" x="-200%" y="-200%" width="500%" height="500%">' +
        '<feGaussianBlur stdDeviation="3"/>' +
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
    '</defs>';
    /* 背景光晕圆 */
    h += '<circle cx="' + CX + '" cy="' + CY + '" r="' + (RC + 30) + '" fill="url(#rgrad-bg)"/>';
    /* 多层立体环（内浅外深，模拟 3D 高度） */
    [0.25, 0.5, 0.75, 1].forEach(function (f, idx) {
      var pts = ''; for (var i = 0; i < n; i++) { var p = pt(i, RC * f); pts += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' '; }
      h += '<path d="' + pts + 'Z" fill="rgba(99,102,241,' + (0.02 + f * 0.03) + ')" stroke="rgba(99,102,241,' + (0.10 + f * 0.18) + ')" stroke-width="' + (0.8 + f * 0.5) + '"/>';
    });
    /* 同心环顶部高光（弧线，营造光照） */
    h += '<path d="' + (function () {
      var pts = []; for (var i = 0; i <= n; i++) { var a = (i / n) * Math.PI * 2 - Math.PI / 2; pts.push([CX + Math.cos(a) * RC * 0.55, CY + Math.sin(a) * RC * 0.55]); }
      var path = ''; pts.forEach(function (p, i) { path += (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); });
      return path;
    })() + '" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="2,4" opacity=".5"/>';
    /* 轴线（细虚线） */
    for (var i = 0; i < n; i++) {
      var a = pt(i, RC);
      h += '<line x1="' + CX + '" y1="' + CY + '" x2="' + a[0].toFixed(1) + '" y2="' + a[1].toFixed(1) + '" stroke="rgba(99,102,241,.18)" stroke-width="1" stroke-dasharray="2,3"/>';
    }
    /* 数据多边形（带阴影 + 玻璃渐变） */
    var dp = ''; for (var i = 0; i < n; i++) { var v = valOf(rc.dims[i].level); var t = pt(i, RC * v); dp += (i ? 'L' : 'M') + t[0].toFixed(1) + ' ' + t[1].toFixed(1) + ' '; }
    h += '<path d="' + dp + 'Z" fill="url(#rgrad-data)" stroke="url(#rgrad-data-stroke)" stroke-width="2.6" stroke-linejoin="round" filter="url(#rfilter-shadow)"/>';
    /* 数据多边形高光（顶部弧线） */
    h += '<path d="' + dp + 'Z" fill="url(#rgrad-shine)" opacity=".7"/>';
    /* 顶点光球 + 标签 */
    for (var i = 0; i < n; i++) {
      var d = rc.dims[i]; var v = valOf(d.level); var p = pt(i, RC * v); var c = C[d.level] || '#94a3b8';
      h += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="9" fill="' + c + '" opacity=".25" filter="url(#rfilter-glow)"/>';
      h += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5.5" fill="#fff"/>';
      h += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" fill="' + c + '"/>';
      var lp = pt(i, RC + 32); var anchor = lp[0] < CX - 8 ? 'end' : (lp[0] > CX + 8 ? 'start' : 'middle');
      var ty = lp[1] < CY ? lp[1] - 10 : (lp[1] > CY ? lp[1] + 16 : lp[1]);
      h += '<text class="axis-t" x="' + lp[0].toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + anchor + '">' + U.esc(d.name) + '</text>';
      h += '<text class="axis-l" x="' + lp[0].toFixed(1) + '" y="' + (ty + 14).toFixed(1) + '" fill="' + c + '" text-anchor="' + anchor + '">' + U.esc(d.label || '') + '</text>';
    }
    /* 中心综合风险玻璃球 */
    h += '<circle cx="' + CX + '" cy="' + CY + '" r="42" fill="rgba(255,255,255,0.25)" filter="url(#rfilter-shadow)"/>';
    h += '<circle cx="' + CX + '" cy="' + CY + '" r="38" fill="url(#rgrad-center)" stroke="rgba(99,102,241,.20)" stroke-width="1.5"/>';
    h += '<circle cx="' + CX + '" cy="' + (CY - 12) + '" r="14" fill="rgba(255,255,255,0.7)" filter="url(#rfilter-glow)" opacity=".8"/>';
    h += '<text x="' + CX + '" y="' + (CY - 4) + '" fill="#475569" font-size="11" font-weight="700" text-anchor="middle">综合</text>';
    h += '<text x="' + CX + '" y="' + (CY + 18) + '" fill="' + overallColor + '" font-size="15" font-weight="900" text-anchor="middle">' + overallTxt + '</text>';
    wrap.innerHTML =
      '<div class="ac-radar-ttl-in">📊 六维风险雷达</div>' +
      '<div class="ac-radar-stage">' +
      '<svg viewBox="0 0 ' + (CX * 2) + ' ' + (CY + RC + 60) + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">' + h + '</svg>' +
      '</div>' +
      '<div class="ac-radar-legend">' +
        '<span class="lg-item low"><i></i>低风险</span>' +
        '<span class="lg-item mid"><i></i>中风险</span>' +
        '<span class="lg-item high"><i></i>高风险</span>' +
      '</div>';
    return wrap;
  }

  // ---- 主入口 ----
  window.AssessCockpit = function (cfg) {
    injectStyle();
    var S = cfg.state;
    var steps = cfg.steps;
    var total = steps.length;
    var cur = S.step || 1;

    // 布局模式：
    //  '3col'（默认）左路径 / 中步骤 / 右快照
    //  'rows'  三排式（体重管理综合评估）：第一排=外部患者选择条；
    //          第二排=左路径卡(小)+右步骤视图(大，等高)；第三排=快照左右结构（左雷达/右文字）
    //  'hzpath' 横向路径式（青少年脊柱）：第一排=横向评估路径；第二排=左步骤内容+右实时快照
    var layout = cfg.layout || '3col';
    var root = document.createElement('div');
    root.className = 'ac' + (layout === 'rows' ? ' ac-rows' : layout === 'hzpath' ? ' ac-hz' : '');
    root.style.setProperty('--ac', cfg.accent || '#534AB7');
    root.innerHTML = '';

    // 左栏路径
    var pathCard = document.createElement('div');
    pathCard.className = 'ac-path-card';
    pathCard.innerHTML = '<div class="ac-path-ttl"><span class="dot"></span>评估路径 · ' + U.esc(cfg.unitName || '') + '</div>' +
      '<div class="ac-rail"><div class="fill" id="ac-fill"></div>' + steps.map(function (s, i) {
        var stt = s.id < cur ? 'done' : (s.id === cur ? 'cur' : 'todo');
        var locked = s.id > cur ? ' locked' : '';
        var knd = s.kind === 'compute' ? '自动' : s.kind === 'snapshot' ? '实时' : s.kind === 'report' ? '报告' : '录入';
        var recIcon = stt === 'done' ? '✅' : (stt === 'cur' ? '✏️' : '⭕');
        var recText = stt === 'done' ? '已录入' : (stt === 'cur' ? '录入中' : '待录入');
        /* 关键约束：评估名称一行显示（white-space:nowrap + overflow hidden），副标题隐藏，录入/自动/报告标识放第二行 */
        return '<div class="ac-node ' + stt + locked + '" data-step="' + s.id + '"><div class="mk">' + (stt === 'done' ? '✓' : s.id) + '</div>' +
          '<div class="ac-node-body"><div class="ti-row"><span class="ti">' + U.esc(s.title) + '</span></div>' +
          '<div class="knd-row"><span class="knd">' + knd + '</span>' +
          '<span class="rec" title="点击直达该步骤：' + U.esc(s.title) + '"><span class="rec-ic">' + recIcon + '</span><span class="rec-tx">' + recText + '</span></span></div>' +
          '</div></div>';
      }).join('') + '</div>';
    var pathCol = document.createElement('div');
    pathCol.className = 'ac-path';
    pathCol.appendChild(pathCard);

    // 中栏 stage
    var stage = document.createElement('div');
    stage.className = 'ac-stage';
    var stageHd = document.createElement('div');
    stageHd.className = 'ac-stage-hd';
    var stageBd = document.createElement('div');
    stageBd.className = 'ac-stage-bd';
    var stageFt = document.createElement('div');
    stageFt.className = 'ac-stage-ft';
    stageFt.innerHTML = '<button class="ac-btn sec" id="ac-prev">← 上一步</button>' +
      '<div class="ac-hint" id="ac-hint"></div>' +
      '<button class="ac-btn pri" id="ac-next">下一步 →</button>';
    stage.appendChild(stageHd); stage.appendChild(stageBd); stage.appendChild(stageFt);

    // 右栏快照（rows 布局下改为整行左右结构：左六维雷达 / 右详细文字信息卡）
    var snap = document.createElement('div');
    snap.className = 'ac-snap' + (layout === 'rows' ? ' ac-snap-split' : '');
    snap.innerHTML =
      /* 0) 标题 */
      '<div class="ac-snap-ttl"><span class="dot"></span>实时评估快照</div>' +
      /* 1) 综合结论横幅（顶部） */
      '<div class="ac-snap-banner" id="ac-snap-banner"></div>' +
      /* 2) 下方：左雷达 / 右详细指标 */
      '<div class="ac-snap-body">' +
        '<div class="ac-snap-radar"><div id="ac-cube"></div></div>' +
        '<div class="ac-snap-text"><div id="ac-metrics"></div></div>' +
      '</div>' +
      '<div class="ac-snap-foot" id="ac-foot"></div>';

    function acBox(cls) { var d = document.createElement('div'); d.className = cls; return d; }
    if (layout === 'rows') {
      var acR2 = acBox('ac-row2');
      acR2.appendChild(pathCol); acR2.appendChild(stage);
      var acR3 = acBox('ac-row3');
      acR3.appendChild(snap);
      root.appendChild(acR2); root.appendChild(acR3);
    } else if (layout === 'hzpath') {
      var acR1 = acBox('ac-row1');
      /* 单列铺满：本期评估重点已移除，路径卡拉长并均匀分布 */
      acR1.appendChild(pathCol);
      var acR2h = acBox('ac-row2h');
      acR2h.appendChild(stage); acR2h.appendChild(snap);
      root.appendChild(acR1); root.appendChild(acR2h);
    } else {
      root.appendChild(pathCol); root.appendChild(stage); root.appendChild(snap);
    }

    // 抽屉容器（全局唯一）
    var pop = document.createElement('div');
    pop.className = 'ac-drawer-pop hide';
    pop.innerHTML = '<div class="ac-drawer-bg"></div><div class="ac-drawer"><div class="ac-drawer-hd">' +
      '<div class="ic" id="ac-dr-ic"></div><h3 id="ac-dr-ttl"></h3><button class="x" id="ac-dr-x">✕</button></div>' +
      '<div class="ac-drawer-bd" id="ac-dr-bd"></div></div>';
    document.body.appendChild(pop);

    function openRegion(r) {
      U.qs('#ac-dr-ic', pop).textContent = r.icon || '📍';
      U.qs('#ac-dr-ttl', pop).textContent = r.label;
      var bd = U.qs('#ac-dr-bd', pop);
      bd.innerHTML = r.render(S);
      pop.classList.remove('hide');
      requestAnimationFrame(function () { pop.classList.add('show'); });
      cfg.onRegionRender && cfg.onRegionRender(S, r.id, bd);
    }
    function closeDrawer() {
      pop.classList.remove('show');
      setTimeout(function () { pop.classList.add('hide'); }, 320);
    }
    U.qs('#ac-dr-x', pop).onclick = closeDrawer;
    U.qs('.ac-drawer-bg', pop).onclick = closeDrawer;
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && !pop.classList.contains('hide')) closeDrawer(); });

    function renderSnapshot() {
      var isRows = layout === 'rows';
      var rc = (cfg.snapshot && cfg.snapshot.riskCube) ? cfg.snapshot.riskCube(S) : { overall: 'low', dims: [] };
      /* 1) 顶部综合结论横幅（rows 布局专用） */
      if (isRows) {
        var banner = U.qs('#ac-snap-banner', snap);
        if (banner) {
          var lvl = rc.overall || 'low';
          var lvlLabel = lvl === 'high' ? '高风险' : lvl === 'mid' ? '中风险' : '低风险';
          var lvlColor = lvl === 'high' ? '#dc2626' : lvl === 'mid' ? '#d97706' : '#0f766e';
          var lvlGrad = lvl === 'high' ? 'linear-gradient(135deg,#dc2626,#991b1b)' : lvl === 'mid' ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#0d9488,#0f766e)';
          var dimsHtml = (rc.dims || []).map(function (d) {
            var c = d.level === 'high' ? '#dc2626' : d.level === 'mid' ? '#d97706' : (d.level === 'low' ? '#0f766e' : '#94a3b8');
            var fill = d.level === 'high' ? '95%' : d.level === 'mid' ? '72%' : d.level === 'low' ? '45%' : '20%';
            return '<div class="banner-dim" title="' + U.esc(d.name + ' · ' + (d.label || '')) + '">' +
              '<div class="dim-bar"><div class="dim-fill" style="width:' + fill + ';background:' + c + '"></div></div>' +
              '<div class="dim-name">' + U.esc(d.name) + '</div>' +
            '</div>';
          }).join('');
          banner.innerHTML =
            '<div class="banner-level" style="background:' + lvlGrad + '">' +
              '<div class="lvl-cap">综合风险评级</div>' +
              '<div class="lvl-v">' + lvlLabel + '</div>' +
              '<div class="lvl-tip">' + (lvl === 'high' ? '建议立即就医干预' : lvl === 'mid' ? '建议加强运动 + 饮食干预' : '维持良好生活方式') + '</div>' +
            '</div>' +
            '<div class="banner-mid">' +
              '<div class="banner-mid-ttl">关键洞察</div>' +
              '<ul class="banner-mid-list">' +
                (rc.dims || []).filter(function (d) { return d.level === 'high' || d.level === 'mid'; }).slice(0, 3).map(function (d) {
                  var lc = d.level === 'high' ? '#dc2626' : '#d97706';
                  return '<li><span class="dot" style="background:' + lc + '"></span><b>' + U.esc(d.name) + '</b><span class="mut">' + U.esc(d.label || '需关注') + '</span></li>';
                }).join('') +
                ((rc.dims || []).filter(function (d) { return d.level === 'high' || d.level === 'mid'; }).length === 0 ?
                  '<li><span class="dot" style="background:#0f766e"></span><b>整体状态良好</b><span class="mut">建议保持现有生活方式</span></li>' : '') +
              '</ul>' +
            '</div>' +
            '<div class="banner-stripes">' +
              '<div class="banner-stripes-ttl">六维风险 · 等级速览</div>' +
              '<div class="banner-stripes-list">' + dimsHtml + '</div>' +
            '</div>';
        }
      }
      /* 2) 下方左雷达 / 右详细指标 */
      if (cfg.snapshot && cfg.snapshot.riskCube) {
        var cubeBox = U.qs('#ac-cube', snap);
        cubeBox.innerHTML = '';
        cubeBox.appendChild(buildRadar(rc));
      }
      if (cfg.snapshot && cfg.snapshot.metrics) {
        var html = cfg.snapshot.metrics(S).map(function (m) {
          return '<div class="ac-metric"><div class="ac-metric-main"><div><div class="mk">' + U.esc(m.k) + '</div>' +
            '<div class="mv">' + U.esc(m.v) + (m.unit ? ' <small>' + U.esc(m.unit) + '</small>' : '') + '</div></div>' +
            (m.label ? '<span class="ml ' + (m.level || 'ok') + '">' + U.esc(m.label) + '</span>' : '') + '</div>' +
            (m.note ? '<div class="ac-metric-note">' + U.esc(m.note) + '</div>' : '') + '</div>';
        }).join('');
        U.qs('#ac-metrics', snap).innerHTML = isRows ? '<div class="ac-metric-grid">' + html + '</div>' : html;
      }
      if (cfg.snapshot && cfg.snapshot.footer) U.qs('#ac-foot', snap).innerHTML = cfg.snapshot.footer(S);
    }

    /* 全屏填写弹窗：把当前步骤的全部表单字段渲染到 U.modal 全屏弹窗中，
       关闭弹窗时自动同步回主步骤视图。点击全屏按钮 / 步骤卡片均可触发。 */
    function openStepFullscreen() {
      var s = steps.filter(function (x) { return x.id === cur; })[0] || steps[0];
      if (!s) return;
      var bodyHTML = '';
      if (s.atlas && s.atlas.length) {
        /* 步骤含人体图：在弹窗里用全屏 Atlas 布局（左大图 + 右录入字段） */
        var atlasHost = buildAtlas(s.atlas, cfg.atlas || {});
        var regionsHTML = s.atlas.map(function (r) {
          return '<div class="ac-region" data-rid="' + r.id + '"><span class="rd ' + (r.risk || 'na') + '"></span>' +
            '<div><div class="rt">' + U.esc(r.label) + '</div><div class="rs">' + U.esc(r.summary || '点击录入') + '</div></div></div>';
        }).join('');
        bodyHTML = '<div class="ac-fs-atlas-wrap"><div class="ac-fs-atlas"></div><div class="ac-fs-regions">' + regionsHTML + '</div></div>';
      } else {
        bodyHTML = s.render(S);
      }
      var modalRef = U.modal({
        title: '步骤 ' + s.id + ' · ' + (s.title || '') + '  —评估数据填写',
        body: bodyHTML,
        width: '100vw',
        cls: 'ai-modal-full ac-step-fullscreen',
        footer:
          '<button class="btn btn-secondary" id="ac-fs-prev">← 上一步</button>' +
          '<div class="ac-hint" id="ac-fs-hint">填写完成后点「保存并关闭」返回主页面</div>' +
          '<button class="btn btn-primary" id="ac-fs-save-close">💾 保存并关闭</button>' +
          '<button class="btn btn-primary" id="ac-fs-next">下一步 →</button>'
      });
      var modalBd = U.qs('.modal-body', modalRef.overlay);
      if (s.atlas && s.atlas.length) {
        var atlasHostEl = U.qs('.ac-fs-atlas', modalBd);
        if (atlasHostEl) atlasHostEl.appendChild(atlasHost);
        atlasHost.querySelectorAll('.ac-anchor').forEach(function (a) {
          a.onclick = function () { var r = s.atlas.filter(function (x) { return x.id === a.dataset.rid; })[0]; openRegion(r); };
        });
        U.qsa('.ac-region', modalBd).forEach(function (b) {
          b.onclick = function () { var r = s.atlas.filter(function (x) { return x.id === b.dataset.rid; })[0]; openRegion(r); };
        });
      }
      /* 调用调用方的 onAfterRender 以重新绑定表单字段事件 */
      cfg.onAfterRender && cfg.onAfterRender(S, s, modalBd);
      /* 上一步 / 下一步 */
      var fsPrev = U.qs('#ac-fs-prev', modalRef.overlay);
      if (fsPrev) {
        fsPrev.style.visibility = cur === 1 ? 'hidden' : 'visible';
        fsPrev.onclick = function () {
          if (cur > 1) { cur--; renderStep(); renderSnapshot(); openStepFullscreen(); }
          else U.toast('已是第一步', 'info');
          modalRef.close();
        };
      }
      var fsNext = U.qs('#ac-fs-next', modalRef.overlay);
      if (fsNext) {
        fsNext.textContent = cur === total ? '完成并归档 →' : '下一步 →';
        fsNext.onclick = function () {
          if (cur < total) { cur++; renderStep(); renderSnapshot(); openStepFullscreen(); }
          else { if (cfg.onComplete) cfg.onComplete(S); modalRef.close(); }
        };
      }
      var fsSave = U.qs('#ac-fs-save-close', modalRef.overlay);
      if (fsSave) fsSave.onclick = function () { modalRef.close(); };
      /* 关闭弹窗 → 重新渲染步骤 + 快照，确保数据同步 */
      var origClose = modalRef.close;
      modalRef.close = function () {
        origClose.apply(this, arguments);
        renderStep();
        renderSnapshot();
        cfg.onAfterRender && cfg.onAfterRender(S, steps.filter(function (x) { return x.id === cur; })[0], stageBd);
      };
    }

    function renderStep() {
      var s = steps.filter(function (x) { return x.id === cur; })[0] || steps[0];
      stageHd.innerHTML = '<div class="ic">' + U.esc(s.icon || '📋') + '</div>' +
        '<div><h2>步骤 ' + s.id + ' · ' + U.esc(s.title) + '</h2><div class="sub">' + U.esc(s.subtitle || '') + '</div></div>' +
        '<div class="pg">' + cur + ' / ' + total + '</div>' +
        '<button class="ac-stage-fullscreen" id="ac-fullscreen" title="点击全屏填写评估数据" aria-label="全屏填写"><span class="ic-i">⛶</span><span class="tx">全屏填写</span></button>';
      // 绑定全屏填写按钮
      var fsBtn = document.getElementById('ac-fullscreen');
      if (fsBtn) fsBtn.onclick = function () { openStepFullscreen(); };
      stageBd.className = 'ac-stage-bd ac-step-enter';
      // 若当前步有 atlas regions → Atlas 布局；否则直接渲染
      if (s.atlas && s.atlas.length) {
        var wrap = document.createElement('div');
        wrap.className = 'ac-atlas-wrap';
        var atlasHost = buildAtlas(s.atlas, cfg.atlas || {});
        var regionsBox = document.createElement('div');
        regionsBox.className = 'ac-regions';
        regionsBox.innerHTML = s.atlas.map(function (r) {
          return '<div class="ac-region" data-rid="' + r.id + '"><span class="rd ' + (r.risk || 'na') + '"></span>' +
            '<div><div class="rt">' + U.esc(r.label) + '</div><div class="rs">' + U.esc(r.summary || '点击录入') + '</div></div></div>';
        }).join('');
        wrap.appendChild(atlasHost); wrap.appendChild(regionsBox);
        stageBd.innerHTML = '';
        stageBd.appendChild(wrap);
        atlasHost.querySelectorAll('.ac-anchor').forEach(function (a) {
          a.onclick = function () { var r = s.atlas.filter(function (x) { return x.id === a.dataset.rid; })[0]; openRegion(r); };
        });
        regionsBox.querySelectorAll('.ac-region').forEach(function (b) {
          b.onclick = function () { var r = s.atlas.filter(function (x) { return x.id === b.dataset.rid; })[0]; openRegion(r); };
        });
      } else {
        stageBd.innerHTML = s.render(S);
      }
      const fill = U.qs('#ac-fill', root) || U.qs('#ac-fill');
      if (fill) {
        var pct = (Math.max(0, cur - 1) / Math.max(1, total - 1)) * 100;
        // 横向路径：进度条走 width（轨道左右各留 4% 边距）；纵向路径仍走 height
        if (layout === 'hzpath') { fill.style.height = '2px'; fill.style.width = (pct * 0.92) + '%'; }
        else fill.style.height = pct + '%';
      }
      // 同步左侧路径节点的高亮/编号/录入状态
      Array.prototype.forEach.call(pathCol.querySelectorAll('.ac-node'), function (n) {
        var sid = parseInt(n.dataset.step, 10);
        var stt = sid < cur ? 'done' : (sid === cur ? 'cur' : 'todo');
        n.className = 'ac-node ' + stt + (sid > cur ? ' locked' : '');
        var mk = n.querySelector('.mk');
        if (mk) mk.textContent = stt === 'done' ? '✓' : sid;
        var rec = n.querySelector('.rec');
        if (rec) {
          var recIc = rec.querySelector('.rec-ic');
          var recTx = rec.querySelector('.rec-tx');
          if (recIc) recIc.textContent = stt === 'done' ? '✅' : (stt === 'cur' ? '✏️' : '⭕');
          if (recTx) recTx.textContent = stt === 'done' ? '已录入' : (stt === 'cur' ? '录入中' : '待录入');
        }
      });
      var prevB = U.qs('#ac-prev', stageFt), nextB = U.qs('#ac-next', stageFt), hint = U.qs('#ac-hint', stageFt);
      prevB.style.visibility = cur === 1 ? 'hidden' : 'visible';
      nextB.textContent = cur === total ? (cfg.completeLabel || '完成并返回台账 →') : '下一步 →';
      hint.textContent = s.hint || ('步骤 ' + cur + ' / ' + total);
      cfg.onAfterRender && cfg.onAfterRender(S, s, stageBd);
      renderSnapshot();
    }

    function go(step) {
      if (step < 1 || step > total) return;
      if (step > cur) { // 仅允许前进到已解锁（这里允许自由前进，受调用方控制）
        cur = step; S.step = step; renderStep(); return;
      }
      cur = step; S.step = step; renderStep();
    }

    U.qs('#ac-prev', stageFt).onclick = function () { if (cur > 1) go(cur - 1); };
    U.qs('#ac-next', stageFt).onclick = function () {
      if (cur === total) { cfg.onComplete && cfg.onComplete(S); return; }
      go(cur + 1);
    };
    pathCol.querySelectorAll('.ac-node').forEach(function (n) {
      n.onclick = function (e) {
        var t = parseInt(n.dataset.step, 10);
        var isRec = e.target.closest('.rec');
        if (isRec) { go(t); return; }
        if (t < cur) go(t); // 仅允许回跳已完成
      };
    });

    renderStep();
    root._rerender = renderStep;
    root._goto = go;
    root._refreshSnap = renderSnapshot;
    return root;
  };

  window.AssessCockpit.buildAtlas = buildAtlas;
  window.AssessCockpit.buildRadar = buildRadar;

  /* ============ 方案生成页通用：左栏分节锚点导航（与驾驶舱左路径视觉同源） ============
   * 从 body 容器顶层 .card（须含 .card-title）生成目录锚点，点击平滑滚动；
   * 可选 IntersectionObserver 滚动高亮（jsdom/旧浏览器自动跳过）。
   * @param {Node} wrap     页面根节点（所有查询作用域）
   * @param {string} bodySel 分节容器选择器（其顶层 .card 即各分节）
   * @param {string} railListSel 锚点列表容器选择器（默认 #pl-rail）
   */
  window.buildPlanRail = function (wrap, bodySel, railListSel) {
    if (!wrap || !U || !U.qs) return;
    var list = U.qs(railListSel || '#pl-rail', wrap);
    if (!list) return;
    var body = U.qs(bodySel, wrap);
    if (!body) { list.innerHTML = ''; return; }
    var secs = [];
    Array.prototype.forEach.call(body.children, function (ch) {
      if (ch.classList && ch.classList.contains('card') && ch.querySelector('.card-title')) secs.push(ch);
    });
    var prefix = 'plsec-' + (bodySel || '').replace(/[^a-z0-9]/gi, '');
    list.innerHTML = secs.map(function (c, i) {
      c.id = prefix + '-' + i;
      var tEl = c.querySelector('.card-title');
      var t = tEl ? tEl.textContent.replace(/\s+/g, ' ').trim() : ('分节 ' + (i + 1));
      var ic = tEl ? (tEl.querySelector('.card-title-icon') || {}).textContent : '•';
      return '<a data-sec="' + c.id + '"><span class="ic">' + U.esc(ic || '•') + '</span><span class="pl-rail-t">' + U.esc(t) + '</span></a>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('a'), function (a) {
      a.onclick = function () { var el = U.qs('#' + a.dataset.sec, wrap); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    });
    if (window.IntersectionObserver) {
      try {
        if (list._io) list._io.disconnect();
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              Array.prototype.forEach.call(list.querySelectorAll('a'), function (a) { a.classList.toggle('active', a.dataset.sec === e.target.id); });
            }
          });
        }, { rootMargin: '-12% 0px -72% 0px', threshold: 0 });
        secs.forEach(function (c) { io.observe(c); });
        list._io = io;
      } catch (e) { /* 旧浏览器忽略滚动高亮 */ }
    }
  };
})();
