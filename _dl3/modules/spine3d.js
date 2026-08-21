/**
 * 青少年脊柱健康 · 真实人体 3D 锚点可视化（参考肌少症 initShield3D 的稳定渲染方案）
 *   · 加载真实人体 GLB（按性别：teen_boy.glb / teen_girl.glb；缺省回退 elder_20260816.glb 占位）
 *   · 身体 7 个部位发光锚点，点击 → onSelectRegion(id)（脊柱模块内部再触发对应评估卡片）
 *   · 不自动旋转；鼠标拖拽旋转、滚轮缩放；支持性别切换；跟随亮/暗主题提亮
 *   · 通过 importmap 动态 import('three')，与肌少症共用同一份 three.module.js
 */
(function () {
  'use strict';
  window.initSpine3D = function initSpine3D(host, opts) {
    opts = opts || {};
    const regions = opts.regions || [];
    const modelByGender = opts.modelByGender || { male: 'assets/teen_boy.glb', female: 'assets/teen_girl.glb' };
    const placeholder = opts.placeholder || 'assets/teen_girl.glb';
    const onSelectRegion = typeof opts.onSelectRegion === 'function' ? opts.onSelectRegion : function () {};
    let gender = opts.initialGender === 'female' ? 'female' : 'male';

    // roundRect 兜底
    if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
      CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        this.moveTo(x + rr, y);
        this.arcTo(x + w, y, x + w, y + h, rr);
        this.arcTo(x + w, y + h, x, y + h, rr);
        this.arcTo(x, y + h, x, y, rr);
        this.arcTo(x, y, x + w, y, rr);
        this.closePath();
        return this;
      };
    }

    host.innerHTML = '';
    host.style.position = 'relative';

    const canvas = document.createElement('div');
    canvas.style.cssText = 'position:absolute;inset:0;';
    host.appendChild(canvas);

    const banner = document.createElement('div');
    banner.style.cssText = 'position:absolute;top:10px;left:10px;z-index:6;font-size:11px;padding:5px 10px;border-radius:999px;background:rgba(245,158,11,.16);color:#b45309;border:1px solid rgba(245,158,11,.4);font-weight:600;';
    banner.textContent = '占位模型：真实青少年模型生成后自动替换';
    host.appendChild(banner);

    const tip = document.createElement('div');
    tip.style.cssText = 'position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:6;font-size:12px;padding:6px 14px;border-radius:999px;background:rgba(10,14,40,.65);color:#cbd5e1;border:1px solid rgba(150,160,255,.25);white-space:nowrap;';
    tip.textContent = '拖拽旋转 · 滚轮缩放 · 点击光点进入该维度评估';
    host.appendChild(tip);

    return Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js')
    ]).then(function (mods) {
      const THREE = mods[0];
      const GLTFLoader = mods[1].GLTFLoader;

      const scene = new THREE.Scene();
      scene.background = null;

      const camera = new THREE.PerspectiveCamera(45, (host.clientWidth || 280) / (host.clientHeight || 500), 0.1, 100);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference:'high-performance' });
      renderer.setSize(host.clientWidth || 280, host.clientHeight || 500);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      canvas.appendChild(renderer.domElement);

      // 灯光（与肌少症一致：高环境光 + 弱方向光，无高光闪烁/体积雾）
      const ambient = new THREE.AmbientLight(0xffffff, 1.15);
      const key = new THREE.DirectionalLight(0xffffff, 0.18); key.position.set(3, 5, 4); scene.add(key);
      const rim = new THREE.DirectionalLight(0x00d9ff, 0.08); rim.position.set(-4, 2, -4); scene.add(rim);
      const fill = new THREE.PointLight(0x00ff9d, 0.12, 8); fill.position.set(0, -1, 2); scene.add(fill);
      scene.add(ambient);

      // 主题联动提亮：暗色背景需要更强的光才能让人体 visible
      function applyThemeLighting(mode) {
        const light = mode === 'light';
        ambient.intensity = light ? 1.7 : 1.6;
        key.intensity = light ? 0.6 : 0.55;
        rim.intensity = light ? 0.18 : 0.35;
        fill.intensity = light ? 0.4 : 0.4;
        renderer.toneMappingExposure = light ? 1.12 : 1.25;
      }
      applyThemeLighting(document.documentElement.getAttribute('data-theme'));
      if (typeof MutationObserver !== 'undefined') {
        const obs = new MutationObserver(function () { applyThemeLighting(document.documentElement.getAttribute('data-theme')); });
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }

      // 自写轨道控制（无 OrbitControls 依赖）
      const orbit = { target: new THREE.Vector3(0, -0.15, 0), radius: 4.6, azimuth: 0, polar: Math.PI / 2, minR: 2.6, maxR: 8, minPolar: 0.25, maxPolar: Math.PI - 0.25 };
      function applyCamera() {
        const sp = orbit.polar, az = orbit.azimuth, r = orbit.radius;
        camera.position.set(
          orbit.target.x + r * Math.sin(sp) * Math.sin(az),
          orbit.target.y + r * Math.cos(sp),
          orbit.target.z + r * Math.sin(sp) * Math.cos(az)
        );
        camera.lookAt(orbit.target);
      }
      applyCamera();
      let dragging = false, lastX = 0, lastY = 0;
      renderer.domElement.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; lastY = e.clientY; try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {} });
      renderer.domElement.addEventListener('pointerup', function () { dragging = false; });
      renderer.domElement.addEventListener('pointerleave', function () { dragging = false; });
      renderer.domElement.addEventListener('pointermove', function (e) {
        if (dragging) {
          orbit.azimuth -= (e.clientX - lastX) * 0.008;
          orbit.polar = Math.max(orbit.minPolar, Math.min(orbit.maxPolar, orbit.polar - (e.clientY - lastY) * 0.008));
          lastX = e.clientX; lastY = e.clientY; applyCamera();
        }
        onHover(e);
      });
      renderer.domElement.addEventListener('wheel', function (e) {
        e.preventDefault();
        orbit.radius = Math.max(orbit.minR, Math.min(orbit.maxR, orbit.radius * (1 + Math.sign(e.deltaY) * 0.08)));
        applyCamera();
      }, { passive: false });

      const humanGroup = new THREE.Group();
      scene.add(humanGroup);
      const markerGroup = new THREE.Group();
      scene.add(markerGroup);

      // 地面光晕
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1.8, 64), new THREE.MeshBasicMaterial({ color: 0x534AB7, transparent: true, opacity: 0.06 }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -1.55; scene.add(ground);

      let currentModel = null;
      let modelNorm = 3.6; // 归一化身高（放大人物，突出显示）
      const CACHE_BUST = '?v=20260821'; // 强制刷新浏览器对 GLB 大文件的缓存，避免旧缓存导致模型“不显示”
      function cacheBust(url) {
        return url.indexOf('?') === -1 ? url + CACHE_BUST : url + '&_v=20260821';
      }

      function makeLogoSprite() {
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = 220, h = 90; cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
        // 蓝紫色品牌徽章底
        ctx.fillStyle = '#534AB7'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.font = 'bold 52px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 6; ctx.strokeText('鹊动', w / 2, h / 2 + 2);
        ctx.fillStyle = '#fff'; ctx.fillText('鹊动', w / 2, h / 2 + 2);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        sp.scale.set(0.42, 0.172, 1); sp.renderOrder = 35;
        return sp;
      }
      const chestLogo = makeLogoSprite();
      chestLogo.position.set(0, 0.82, 0.32);
      humanGroup.add(chestLogo);

      function loadModel(url, isPlaceholder) {
        const loader = new GLTFLoader();
        loader.load(cacheBust(url), function (gltf) {
          if (currentModel) { humanGroup.remove(currentModel); }
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const c = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(0.001, size.x, size.y, size.z);
          const s = modelNorm / maxDim;
          model.position.set(-c.x * s, -c.y * s, -c.z * s);
          model.scale.set(s, s, s);
          if (size.y < 0.3 * maxDim) model.rotation.x = -Math.PI / 2;
          model.position.y = -1.5;
          const maxAniso = renderer.capabilities.getMaxAnisotropy();
          model.traverse(function (o) {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true;
              if (o.material) {
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(function (mat) {
                  if (mat.map) { mat.map.anisotropy = maxAniso; mat.map.needsUpdate = true; }
                  if (mat.normalMap) { mat.normalMap.anisotropy = maxAniso; }
                  mat.roughness = Math.max(0.35, mat.roughness || 0.5);
                  mat.metalness = Math.min(0.15, mat.metalness || 0.0);
                });
              }
            }
          });
          humanGroup.add(model);
          currentModel = model;
          banner.style.display = 'none';
        }, undefined, function (err) {
          var msg = (err && err.message) ? err.message : String(err);
          console.warn('[spine3D] 模型加载失败', url, err);
          if (!isPlaceholder) {
            banner.textContent = '真实模型加载失败，回退占位…';
            loadModel(placeholder, true); // 回退占位
          } else {
            // 占位也失败：把真实错误显示在横幅上，便于无控制台环境排查
            banner.style.display = '';
            banner.style.background = 'rgba(239,68,68,.16)';
            banner.style.color = '#ef4444';
            banner.style.borderColor = 'rgba(239,68,68,.5)';
            banner.textContent = '3D模型加载失败：' + msg.slice(0, 140);
          }
        });
      }
      loadModel(modelByGender[gender] || placeholder, !(modelByGender[gender]));

      // 锚点
      function makeLabel(text, color) {
        const cv = document.createElement('canvas');
        const ctx = cv.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio, 2);
        const w = 420, h = 86; cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
        // 深色半透明底 + 彩色 2px 边框：在亮色/暗色下都清晰，不遮挡人物
        ctx.fillStyle = 'rgba(15,23,42,.84)'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
        // 白色粗描边文字
        ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 5; ctx.strokeText(text, w / 2, h / 2);
        ctx.fillStyle = '#fff'; ctx.fillText(text, w / 2, h / 2);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        sp.scale.set(1.18, 0.242, 1); sp.renderOrder = 30;
        return sp;
      }

      const markers = [];
      regions.forEach(function (r) {
        const g = new THREE.Group();
        g.position.set(r.pos[0], r.pos[1], r.pos[2]);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 24), new THREE.MeshBasicMaterial({ color: r.color, depthTest: false, depthWrite: false }));
        core.renderOrder = 25;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.10, 0.12, 32), new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
        ring.renderOrder = 25;
        g.add(core); g.add(ring);
        const label = makeLabel(r.title, r.color);
        const loff = new THREE.Vector3(r.labelOffset[0], r.labelOffset[1], r.labelOffset[2]);
        label.position.copy(loff);
        g.add(label);
        // 从锚点到标签的细指示线，明确对应关系
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), loff]);
        const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: r.color, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }));
        line.renderOrder = 20;
        g.add(line);
        g.userData = { id: r.id, ring: ring };
        markerGroup.add(g); markers.push(g);
      });

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let hovered = null;

      function onHover(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }
      renderer.domElement.addEventListener('click', function () {
        if (hovered) onSelectRegion(hovered.userData.id);
      });

      window.addEventListener('resize', function () {
        camera.aspect = host.clientWidth / host.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(host.clientWidth, host.clientHeight);
      });

      const clock = new THREE.Clock();
      (function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        markers.forEach(function (g, i) {
          g.userData.ring.scale.setScalar(1 + Math.sin(t * 3 + i * 0.7) * 0.12);
          g.userData.ring.lookAt(camera.position);
          g.children.forEach(function (c) { if (c.isSprite) c.quaternion.copy(camera.quaternion); });
        });
        if (chestLogo) chestLogo.quaternion.copy(camera.quaternion);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(markerGroup.children, true);
        const hitGroup = hits.length ? hits[0].object.parent : null;
        if (hitGroup !== hovered) {
          hovered = hitGroup;
          renderer.domElement.style.cursor = hovered ? 'pointer' : 'default';
        }
        renderer.render(scene, camera);
      })();

      return {
        setGender: function (g) {
          gender = g === 'female' ? 'female' : 'male';
          loadModel(modelByGender[gender] || placeholder, !(modelByGender[gender]));
        },
        dispose: function () { renderer.dispose(); }
      };
    }).catch(function (err) {
      console.error('[spine3D] init failed', err);
      host.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:13px;">3D 初始化失败：' + (err && err.message ? err.message : err) + '</div>';
    });
  };

  /**
   * 六维风险雷达 · 3D 柱状/雷达混合体（玻璃拟态 + 霓虹光效）
   * 设计参考：现代医疗仪表盘 / 科幻 HUD 雷达图
   * @param {HTMLElement} container - 容器（如 #ac-cube）
   * @param {Object} rc - { overall:'low'|'mid'|'high', dims:[{name,label,level}] }
   * @returns {Promise}
   */
  window.buildRadar3D = function (container, rc) {
    if (!container) return Promise.resolve();
    rc = rc || { overall: 'low', dims: [] };
    var _sig = JSON.stringify(rc);
    // 数据未变化则不重建；变化则先销毁旧实例再重建（让评估结果实时反映到 3D 雷达）
    if (container._radar3D && container._radarSig === _sig) return Promise.resolve();
    if (container._radar3DInst && container._radar3DInst.dispose) { try { container._radar3DInst.dispose(); } catch (_) {} }
    container._radar3D = true;
    container._radarSig = _sig;
    return import('three').then(function (THREE) {
      container.innerHTML = '';
      var rect = container.getBoundingClientRect();
      var W = rect.width || container.clientWidth || 360;
      var H = Math.max(340, W * 0.9);
      container.style.height = H + 'px';
      container.style.position = 'relative';

      var scene = new THREE.Scene();
      scene.background = null;
      scene.fog = new THREE.FogExp2(0x0f172a, 0.055);

      var camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
      camera.position.set(0, 4.0, 6.8);
      camera.lookAt(0, 1.0, 0);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      container.appendChild(renderer.domElement);

      // 灯光：让霓虹感更突出
      var ambient = new THREE.AmbientLight(0xffffff, 0.55);
      var key = new THREE.DirectionalLight(0xc7d2fe, 0.55); key.position.set(4, 6, 4);
      var rim = new THREE.DirectionalLight(0x818cf8, 0.50); rim.position.set(-4, 2, -4);
      var fill = new THREE.PointLight(0x22d3ee, 0.45, 12); fill.position.set(0, 2, 4);
      scene.add(ambient, key, rim, fill);

      var group = new THREE.Group();
      group.position.y = -0.35;
      scene.add(group);

      var n = Math.min(6, rc.dims.length);
      var LEVELS = { high: 1.0, mid: 0.70, low: 0.42, na: 0.18 };
      var COLORS = { low: '#10b981', mid: '#f59e0b', high: '#f43f5e', na: '#94a3b8' };
      var NEON = { low: '#34d399', mid: '#fbbf24', high: '#fb7185', na: '#cbd5e1' };
      var R = 2.2;
      var MAX_H = 2.6;

      function hex(c) { return new THREE.Color(c); }

      // 地面：圆盘 + 外环光晕（颜色随皮肤主题变化）
      var groundMat = new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.92 });
      var ground = new THREE.Mesh(
        new THREE.CircleGeometry(3.0, 80),
        groundMat
      );
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02;
      group.add(ground);
      var groundRing = new THREE.Mesh(
        new THREE.RingGeometry(2.85, 3.0, 80),
        new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      );
      groundRing.rotation.x = -Math.PI / 2; groundRing.position.y = -0.01;
      group.add(groundRing);

      // 同心网格环：霓虹细线
      [0.25, 0.5, 0.75, 1.0].forEach(function (f) {
        var torus = new THREE.Mesh(
          new THREE.TorusGeometry(R * f, 0.012, 6, 80),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: f === 1.0 ? 0.55 : 0.16 })
        );
        torus.rotation.x = Math.PI / 2; torus.position.y = 0.004;
        group.add(torus);
      });

      // 轴线：由中心向外发出的细霓虹线
      for (var i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + i * Math.PI * 2 / n;
        var x = Math.cos(ang) * R, z = Math.sin(ang) * R;
        var axis = new THREE.Mesh(
          new THREE.CylinderGeometry(0.01, 0.01, R, 10),
          new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.35 })
        );
        axis.position.set(x / 2, 0, z / 2);
        axis.lookAt(x, 0, z); axis.rotateX(Math.PI / 2);
        group.add(axis);
      }

      // 每个维度的数据柱（核心 3D 表达）
      var topPts = [];
      rc.dims.forEach(function (d, i) {
        var ang = -Math.PI / 2 + i * Math.PI * 2 / n;
        var val = LEVELS[d.level] || 0.18;
        var h = MAX_H * val;
        var x = Math.cos(ang) * R, z = Math.sin(ang) * R;
        var c = COLORS[d.level] || '#94a3b8';
        var nC = NEON[d.level] || '#cbd5e1';
        topPts.push(new THREE.Vector3(x, h, z));

        // 柱体：半透明玻璃质感
        var pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.18, h, 24),
          new THREE.MeshPhysicalMaterial({
            color: hex(c), metalness: 0.1, roughness: 0.15, transmission: 0.35, thickness: 0.4,
            transparent: true, opacity: 0.78, emissive: hex(nC), emissiveIntensity: 0.15
          })
        );
        pillar.position.set(x, h / 2, z);
        group.add(pillar);

        // 柱顶发光圆盘
        var cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24),
          new THREE.MeshBasicMaterial({ color: hex(nC), transparent: true, opacity: 0.9 })
        );
        cap.position.set(x, h, z); group.add(cap);

        // 顶部发光球 + 外晕
        var core = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 24, 24),
          new THREE.MeshBasicMaterial({ color: hex(nC) })
        );
        core.position.set(x, h + 0.08, z); group.add(core);
        var halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 24, 24),
          new THREE.MeshBasicMaterial({ color: hex(nC), transparent: true, opacity: 0.18 })
        );
        halo.position.set(x, h + 0.08, z); group.add(halo);

        // 顶点局部点光源（制造辉光感）
        var pl = new THREE.PointLight(hex(nC), 0.55, 2.2);
        pl.position.set(x, h + 0.15, z); group.add(pl);
      });

      // 顶部连接多边形：发光边 + 半透明覆盖面
      var curve = new THREE.CatmullRomCurve3(topPts.concat(topPts[0]), true);
      var tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 80, 0.022, 8, true),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.85 })
      );
      group.add(tube);

      // 顶面填充：三角扇，带顶点颜色渐变
      var fanGeo = new THREE.BufferGeometry();
      var fanPos = [], fanCol = [];
      var centerColor = new THREE.Color(0x22d3ee);
      for (var i = 0; i < n; i++) {
        var p0 = new THREE.Vector3(0, 0.02, 0), p1 = topPts[i], p2 = topPts[(i + 1) % n];
        fanPos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        var c1 = hex(NEON[rc.dims[i].level] || '#cbd5e1');
        var c2 = hex(NEON[rc.dims[(i + 1) % n].level] || '#cbd5e1');
        fanCol.push(centerColor.r, centerColor.g, centerColor.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
      }
      fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(fanPos, 3));
      fanGeo.setAttribute('color', new THREE.Float32BufferAttribute(fanCol, 3));
      fanGeo.computeVertexNormals();
      var fanMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      var fan = new THREE.Mesh(fanGeo, fanMat);
      group.add(fan);

      // 中心枢纽
      var overallTxt = rc.overall === 'high' ? '高风险' : rc.overall === 'mid' ? '中风险' : '低风险';
      var overallColor = rc.overall === 'high' ? '#f43f5e' : rc.overall === 'mid' ? '#fbbf24' : '#34d399';
      var hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.08, 40),
        new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.1, transmission: 0.25, transparent: true, opacity: 0.92 })
      );
      hub.position.y = 0.04; group.add(hub);
      var hubRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.018, 8, 60),
        new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8 })
      );
      hubRing.rotation.x = Math.PI / 2; hubRing.position.y = 0.085; group.add(hubRing);

      // 标签生成（随皮肤主题变化，并展示评估结果数值）
      var labelSprites = [];
      function paintDimLabel(def, mode) {
        var dark = mode !== 'light';
        var cv = document.createElement('canvas');
        var ctx = cv.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = 264, h = 98; cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
        var bg = dark ? 'rgba(2,6,23,.82)' : 'rgba(255,255,255,.93)';
        var nameC = dark ? '#f8fafc' : '#0f172a';
        var subC = dark ? '#cbd5e1' : '#475569';
        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 14); ctx.fill();
        ctx.strokeStyle = def.color; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = nameC; ctx.fillText(def.name, w / 2, 24);
        if (def.value != null && def.value !== '' && def.value !== '—') {
          ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = def.color; ctx.fillText(String(def.value) + (def.unit || ''), w / 2, 52);
          ctx.font = '13px sans-serif'; ctx.fillStyle = subC; ctx.fillText(def.label || '', w / 2, 76);
        } else {
          ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = def.color; ctx.fillText(def.label || '', w / 2, 56);
        }
        var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
      rc.dims.forEach(function (d, i) {
        var ang = -Math.PI / 2 + i * Math.PI * 2 / n;
        var lr = R + 0.72;
        var def = { name: d.name, label: d.label || '', value: (d.value != null ? d.value : null), unit: d.unit || '', color: NEON[d.level] || '#cbd5e1' };
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintDimLabel(def, document.documentElement.getAttribute('data-theme')), transparent: true, depthTest: false, depthWrite: false }));
        sp.scale.set(1.18, 0.44, 1); sp.renderOrder = 20;
        sp.position.set(Math.cos(ang) * lr, 0.55, Math.sin(ang) * lr);
        group.add(sp);
        labelSprites.push({ sprite: sp, def: def });
      });

      // 综合风险标签（随皮肤主题变化）
      function paintHub(overall, mode) {
        var dark = mode !== 'light';
        var cv = document.createElement('canvas');
        var ctx = cv.getContext('2d');
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = 190, h = 100; cv.width = w * dpr; cv.height = h * dpr; ctx.scale(dpr, dpr);
        ctx.fillStyle = dark ? 'rgba(15,23,42,.88)' : 'rgba(255,255,255,.94)'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 14); ctx.fill();
        ctx.strokeStyle = overallColor; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = dark ? '#e2e8f0' : '#0f172a'; ctx.fillText('综合', w / 2, 28);
        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = overallColor; ctx.fillText(overallTxt, w / 2, 64);
        var tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }
      var hubLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: paintHub(rc.overall, document.documentElement.getAttribute('data-theme')), transparent: true, depthTest: false, depthWrite: false }));
      hubLabel.scale.set(0.82, 0.43, 1); hubLabel.renderOrder = 25;
      hubLabel.position.set(0, 0.95, 0);
      group.add(hubLabel);

      // 缓慢旋转 + 拖拽交互
      var autoRot = 0.003;
      var dragging = false, lastX = 0;
      var alive = true;
      renderer.domElement.addEventListener('pointerdown', function (e) { dragging = true; lastX = e.clientX; try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {} });
      renderer.domElement.addEventListener('pointerup', function () { dragging = false; });
      renderer.domElement.addEventListener('pointerleave', function () { dragging = false; });
      renderer.domElement.addEventListener('pointermove', function (e) {
        if (dragging) { group.rotation.y += (e.clientX - lastX) * 0.005; lastX = e.clientX; }
      });
      renderer.domElement.addEventListener('wheel', function (e) {
        e.preventDefault();
        camera.position.y = Math.max(2.2, Math.min(6.5, camera.position.y + e.deltaY * 0.004));
        camera.lookAt(0, 1.0, 0);
      }, { passive: false });

      // 主题跟随：皮肤背景 / 标签配色 / 灯光强度（与 initSpine3D 一致）
      function applyTheme(mode) {
        var dark = mode !== 'light';
        scene.fog.color.set(dark ? 0x0f172a : 0xe6edf6);
        scene.fog.density = dark ? 0.055 : 0.03;
        if (groundMat) { groundMat.color.set(dark ? 0x0b1220 : 0xeef2f7); groundMat.opacity = dark ? 0.92 : 0.66; }
        renderer.toneMappingExposure = dark ? 1.25 : 1.12;
        ambient.intensity = dark ? 0.55 : 0.95;
        key.intensity = dark ? 0.55 : 0.6;
        rim.intensity = dark ? 0.50 : 0.18;
        fill.intensity = dark ? 0.45 : 0.4;
        labelSprites.forEach(function (o) { o.sprite.material.map = paintDimLabel(o.def, mode); o.sprite.material.map.needsUpdate = true; });
        hubLabel.material.map = paintHub(rc.overall, mode); hubLabel.material.map.needsUpdate = true;
      }
      applyTheme(document.documentElement.getAttribute('data-theme'));
      var themeObs = null;
      if (typeof MutationObserver !== 'undefined') {
        themeObs = new MutationObserver(function () { applyTheme(document.documentElement.getAttribute('data-theme')); });
        themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      }

      var resizeObs = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(function (entries) {
          var r = entries[0].contentRect;
          var w2 = r.width || W, h2 = Math.max(300, r.width * 0.82);
          camera.aspect = w2 / h2; camera.updateProjectionMatrix();
          renderer.setSize(w2, h2);
        });
        resizeObs.observe(container);
      }

      (function animate() {
        if (!alive) return;
        requestAnimationFrame(animate);
        if (!dragging) group.rotation.y += autoRot;
        group.children.forEach(function (c) { if (c.isSprite) c.quaternion.copy(camera.quaternion); });
        renderer.render(scene, camera);
      })();

      function dispose() {
        alive = false;
        if (themeObs) themeObs.disconnect();
        if (resizeObs) resizeObs.disconnect();
        try { renderer.forceContextLoss(); } catch (_) {}
        if (renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer.dispose();
        container._radar3D = false;
      }
      container._radar3DInst = { dispose: dispose };
      return { dispose: dispose };
    }).catch(function (err) {
      console.error('[buildRadar3D] failed', err);
      container.innerHTML = '<div style="padding:20px;color:#ef4444;font-size:12px;">3D 雷达初始化失败</div>';
    });
  };
})();
