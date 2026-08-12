/**
 * 设计系统 · Style Guide
 * 可视化展示系统的设计令牌（颜色/字体/间距/圆角/阴影/动效）与已落地的真实组件库。
 * 所有色板读取运行时 CSS 变量，随明暗主题实时更新。
 */
(function () {
  'use strict';

  function v(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function curTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  const brandScale = ['--primary-50','--primary-100','--primary-200','--primary-300','--primary-400','--primary-500','--primary-600','--primary-700','--primary-800','--primary-900'];
  const accentScale = ['--accent-50','--accent-100','--accent-200','--accent-300','--accent-400','--accent-500','--accent-600','--accent-700','--accent-800','--accent-900'];
  const semantic = ['--primary','--accent','--success','--warning','--danger','--info'];
  const semanticBg = [['--primary-bg','品牌浅底'],['--success-bg','成功浅底'],['--warning-bg','警告浅底'],['--danger-bg','危险浅底'],['--info-bg','信息浅底']];
  const surfaces = ['--bg-body','--bg-card','--bg-elevated','--bg-hover','--bg-subtle','--bg-input','--bg-sidebar'];
  const texts = ['--text-primary','--text-secondary','--text-muted','--text-inverse'];
  const borders = ['--border-color','--border-strong'];

  function colorGrid(vars, onColor) {
    return '<div class="sg-grid">' + vars.map(function (n) {
      const val = v(n);
      const label = onColor ? '<span class="sg-oncolor">Aa</span>' : '';
      return '<div class="sg-swatch">' +
        '<div class="sg-color-block' + (onColor ? ' sg-color-block--on' : '') + '" style="background:' + val + '">' + label + '</div>' +
        '<div class="sg-swatch-name">' + n + '</div>' +
        '<div class="sg-swatch-val">' + val + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function chipGrid(pairs) {
    return '<div class="sg-demo-row">' + pairs.map(function (p) {
      return '<div class="sg-chip" style="background:' + v(p[0]) + '"><span>' + p[1] + '</span><code>' + p[0] + '</code></div>';
    }).join('') + '</div>';
  }

  function typeGrid() {
    const rows = [
      ['--fs-4xl','--lh-4xl','Display 4XL'],
      ['--fs-3xl','--lh-3xl','Title 3XL'],
      ['--fs-2xl','--lh-2xl','H1 2XL'],
      ['--fs-xl','--lh-xl','H2 XL'],
      ['--fs-lg','--lh-lg','H3 LG'],
      ['--fs-md','--lh-md','Body MD'],
      ['--fs-base','--lh-base','Body BASE'],
      ['--fs-sm','--lh-sm','Caption SM'],
      ['--fs-xs','--lh-xs','Micro XS']
    ];
    return '<div class="sg-type">' + rows.map(function (r) {
      return '<div class="sg-type-row">' +
        '<div class="sg-type-sample" style="font-size:' + v(r[0]) + ';line-height:' + v(r[1]) + ';">鹊动FAC Aa 123</div>' +
        '<div class="sg-type-meta"><code>' + r[0] + '</code> ' + v(r[0]) + ' · <code>' + r[1] + '</code> ' + v(r[1]) +
        '<div class="sg-type-name">' + r[2] + '</div></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function weightRow() {
    const arr = [['--fw-regular','Regular 400'],['--fw-medium','Medium 500'],['--fw-semibold','Semibold 600'],['--fw-bold','Bold 700'],['--fw-extrabold','Extrabold 800']];
    return arr.map(function (a) {
      return '<div class="sg-weight" style="font-weight:' + v(a[0]) + '">' + a[1] + '</div>';
    }).join('');
  }

  function spaceGrid() {
    const arr = ['--space-1','--space-2','--space-3','--space-4','--space-5','--space-6','--space-8','--space-10','--space-12','--space-16'];
    return '<div class="sg-space">' + arr.map(function (n) {
      return '<div class="sg-space-item"><div class="sg-space-box" style="width:' + v(n) + ';height:' + v(n) + '"></div><code>' + n + '</code><span>' + v(n) + '</span></div>';
    }).join('') + '</div>';
  }

  function radiusGrid() {
    const arr = [['--radius-sm','SM'],['--radius','MD'],['--radius-lg','LG'],['--radius-xl','XL'],['--radius-2xl','2XL'],['--radius-full','FULL']];
    return '<div class="sg-radii">' + arr.map(function (a) {
      return '<div class="sg-radius-item"><div class="sg-radius-box" style="border-radius:' + v(a[0]) + '"></div><code>' + a[0] + '</code><span>' + a[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function shadowGrid() {
    const arr = [['--shadow-sm','SM'],['--shadow','MD'],['--shadow-lg','LG'],['--shadow-xl','XL'],['--shadow-glow','GLOW'],['--shadow-card','CARD']];
    return '<div class="sg-shadows">' + arr.map(function (a) {
      return '<div class="sg-shadow-item"><div class="sg-shadow-card" style="box-shadow:' + v(a[0]) + '"></div><code>' + a[0] + '</code><span>' + a[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function motionBlock() {
    return '' +
      '<div class="sg-motion">' +
        '<div class="sg-motion-box" style="transition: transform var(--dur) var(--ease-out);">悬停预览</div>' +
        '<div class="sg-motion-box sg-motion-spring" style="transition: transform var(--dur-slow) var(--ease-spring);">弹性预览</div>' +
      '</div>' +
      '<div class="sg-duration-table">' +
        '<div><code>--dur-fast</code> ' + v('--dur-fast') + '</div>' +
        '<div><code>--dur</code> ' + v('--dur') + '</div>' +
        '<div><code>--dur-slow</code> ' + v('--dur-slow') + '</div>' +
        '<div><code>--ease-out</code> ' + v('--ease-out') + '</div>' +
        '<div><code>--ease-in-out</code> ' + v('--ease-in-out') + '</div>' +
        '<div><code>--ease-spring</code> ' + v('--ease-spring') + '</div>' +
      '</div>';
  }

  function componentsBlock() {
    return '' +
      '<h3 class="sg-h3">按钮 Buttons</h3>' +
      '<div class="sg-demo-row">' +
        '<button class="btn btn-primary">主要按钮</button>' +
        '<button class="btn btn-secondary">次要按钮</button>' +
        '<button class="btn btn-success">成功</button>' +
        '<button class="btn btn-danger">危险</button>' +
        '<button class="btn btn-ghost">幽灵</button>' +
      '</div>' +
      '<div class="sg-demo-row">' +
        '<button class="btn btn-primary btn-sm">小号</button>' +
        '<button class="btn btn-primary">默认</button>' +
        '<button class="btn btn-primary btn-lg">大号</button>' +
        '<button class="btn btn-primary" disabled>禁用</button>' +
      '</div>' +

      '<h3 class="sg-h3">徽标 Badges</h3>' +
      '<div class="sg-demo-row">' +
        '<span class="badge badge-primary">品牌</span>' +
        '<span class="badge badge-success">成功</span>' +
        '<span class="badge badge-warning">警告</span>' +
        '<span class="badge badge-danger">危险</span>' +
        '<span class="badge badge-info">信息</span>' +
      '</div>' +

      '<h3 class="sg-h3">提示 Alert</h3>' +
      '<div class="sg-stack">' +
        '<div class="alert alert-info">信息提示：系统将于今晚 22:00 进行例行维护。</div>' +
        '<div class="alert alert-success">操作成功：患者档案已保存。</div>' +
        '<div class="alert alert-warning">注意：该方案热量偏低，请复核。</div>' +
        '<div class="alert alert-danger">错误：必填项「身高」未填写。</div>' +
      '</div>' +

      '<h3 class="sg-h3">表单 Form</h3>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>姓名 <span class="required">*</span></label><input value="张三" /></div>' +
        '<div class="form-group"><label>档案编号</label><input placeholder="QD-HET-00001" disabled /></div>' +
        '<div class="form-group full-width"><label>备注</label><textarea rows="2" placeholder="可选备注信息"></textarea></div>' +
      '</div>' +
      '<div class="checkbox-group">' +
        '<label class="checkbox-item checked"><input type="checkbox" checked /> 高血压</label>' +
        '<label class="checkbox-item"><input type="checkbox" /> 糖尿病</label>' +
        '<label class="checkbox-item"><input type="checkbox" /> 高血脂</label>' +
      '</div>' +

      '<h3 class="sg-h3">卡片 Card</h3>' +
      '<div class="sg-card-row">' +
        '<div class="card"><div class="card-header"><div class="card-title"><span class="card-title-icon">🎯</span> 营养方案</div></div><div class="card-body">基于宏量营养素配比生成的个性化饮食与运动方案，支持一键导出报告。</div></div>' +
        '<div class="card"><div class="card-header"><div class="card-title"><span class="card-title-icon">📊</span> 评估概览</div></div><div class="card-body">综合体成分、肌力与生活方式问卷，输出风险分层与干预建议。</div></div>' +
      '</div>' +

      '<h3 class="sg-h3">表格 Table</h3>' +
      '<div class="table-wrap"><table>' +
        '<thead><tr><th>档案编号</th><th>姓名</th><th>性别</th><th>BMI</th><th>状态</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>QD-HET-00001</td><td>张三</td><td>男</td><td>26.4</td><td><span class="badge badge-success">已评估</span></td></tr>' +
          '<tr><td>QD-HET-00002</td><td>李四</td><td>女</td><td>31.2</td><td><span class="badge badge-warning">待复核</span></td></tr>' +
          '<tr><td>QD-HET-00003</td><td>王五</td><td>男</td><td>22.1</td><td><span class="badge badge-info">方案中</span></td></tr>' +
        '</tbody>' +
      '</table></div>' +

      '<h3 class="sg-h3">模态框 Modal（预览）</h3>' +
      '<div class="sg-modal-preview"><div class="modal-overlay" style="position:absolute;">' +
        '<div class="modal"><div class="modal-header"><div class="card-title">确认操作</div><span>✕</span></div>' +
        '<div class="modal-body">确定要删除该患者档案吗？此操作不可撤销。</div>' +
        '<div class="modal-footer"><button class="btn btn-ghost btn-sm">取消</button><button class="btn btn-danger btn-sm">删除</button></div>' +
        '</div></div></div>' +

      '<h3 class="sg-h3">轻提示 Toast（预览，实际为浮层）</h3>' +
      '<div class="sg-toast-preview">' +
        '<div class="toast success">保存成功</div>' +
        '<div class="toast error">保存失败</div>' +
        '<div class="toast warning">请注意</div>' +
        '<div class="toast info">新消息</div>' +
      '</div>';
  }

  function buildHTML() {
    return '' +
      '<div class="sg-header">' +
        '<div><h1 class="sg-h1">设计系统 · Style Guide</h1>' +
        '<p class="sg-sub">鹊动FAC功能评估与干预系统 — 统一设计令牌与组件参考（随主题实时更新）</p></div>' +
        '<div class="sg-header-actions">' +
          '<span id="sg-theme-label" class="badge badge-info">当前主题：' + curTheme() + '</span>' +
          '<button id="sg-theme-btn" class="btn btn-secondary btn-sm">切换明暗主题</button>' +
        '</div>' +
      '</div>' +

      '<section class="sg-section">' +
        '<h2 class="sg-h2">颜色令牌</h2>' +
        '<h3 class="sg-h3">品牌色阶 · 橙 (Primary)</h3>' + colorGrid(brandScale) +
        '<h3 class="sg-h3">强调色阶 · 青 (Accent)</h3>' + colorGrid(accentScale) +
        '<h3 class="sg-h3">语义色（含文字对比）</h3>' + colorGrid(semantic, true) +
        '<h3 class="sg-h3">语义浅底（标签/提示背景）</h3>' + chipGrid(semanticBg) +
        '<h3 class="sg-h3">中性面 (Surfaces)</h3>' + colorGrid(surfaces) +
        '<h3 class="sg-h3">文字 (Text)</h3>' + colorGrid(texts) +
        '<h3 class="sg-h3">边框 (Border)</h3>' + colorGrid(borders) +
      '</section>' +

      '<section class="sg-section">' +
        '<h2 class="sg-h2">字体阶梯</h2>' + typeGrid() +
        '<h3 class="sg-h3">字重</h3><div class="sg-demo-row">' + weightRow() + '</div>' +
      '</section>' +

      '<section class="sg-section"><h2 class="sg-h2">间距阶梯</h2>' + spaceGrid() + '</section>' +
      '<section class="sg-section"><h2 class="sg-h2">圆角</h2>' + radiusGrid() + '</section>' +
      '<section class="sg-section"><h2 class="sg-h2">阴影 / 光晕</h2>' + shadowGrid() + '</section>' +
      '<section class="sg-section"><h2 class="sg-h2">动效</h2>' + motionBlock() + '</section>' +

      '<section class="sg-section">' +
        '<h2 class="sg-h2">真实组件库</h2>' +
        '<p class="sg-note">以下为系统中已落地的真实组件（使用真实 class，随主题联动）。</p>' +
        componentsBlock() +
      '</section>';
  }

  function bind(root) {
    const btn = root.querySelector('#sg-theme-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (typeof toggleTheme === 'function') toggleTheme();
      root.innerHTML = buildHTML();
      bind(root);
    });
  }

  window.Pages.styleguide = function () {
    const root = document.createElement('div');
    root.className = 'styleguide-page';
    root.innerHTML = buildHTML();
    bind(root);
    return root;
  };
})();
