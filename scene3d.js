'use strict';
// 目指せ盗塁王 — 3D 描画(ランナーの背中越しに次の塁を見る視点)
// ワールド座標 (x, y, z-up) は three.js の (x, z, -y) に対応させる。
// 球場・観客席・照明・花火はセンターフライ(techgymjp/center-fly)と同じ作り。
window.Scene3D = (() => {
  const H = 640;
  let W = 960;
  const FENCE = 122;
  const MOUND = { x: 0, y: 18.44 };
  const BASE = 27.43 / Math.SQRT2; // 塁間を45°回転したときの座標
  const BALL_R = 0.12;             // 見やすさのため実物の約3倍

  let renderer, scene, camera, ready = false;
  let runnerRig, ballMesh, ballShadow, runnerShadow, trailLine, trailPts = [];
  let batter, pitcher, catcher, homeUmp, baseUmp, scoreboard, fenceMat;
  const fielderRigs = {};
  const bags = [];
  const cam = { x: 0, y: 0, z: 3, lx: 0, ly: 0, lz: 1, init: false };

  const V = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

  // ---------- テクスチャ ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }

  // 地面のフィールド描画範囲
  const GX0 = -112, GX1 = 112, GY0 = -30, GY1 = 140, GK = 9.2;

  function groundTexture() {
    const w = Math.round((GX1 - GX0) * GK), h = Math.round((GY1 - GY0) * GK);
    return canvasTex(w, h, (g) => {
      const tx = (x) => (x - GX0) * GK, ty = (y) => (GY1 - y) * GK, m = (v) => v * GK;
      // ファウルゾーンの芝
      g.fillStyle = '#2d6a2c';
      g.fillRect(0, 0, w, h);
      // フェアゾーン(扇形)
      const wedge = () => {
        g.beginPath();
        g.moveTo(tx(0), ty(0));
        for (let a = -Math.PI / 4; a <= Math.PI / 4 + 1e-6; a += Math.PI / 90) g.lineTo(tx(Math.sin(a) * FENCE), ty(Math.cos(a) * FENCE));
        g.closePath();
      };
      g.save();
      wedge(); g.clip();
      g.fillStyle = '#3a8a36';
      g.fillRect(0, 0, w, h);
      // チェック模様の芝刈り跡
      const band = 7;
      for (let x = -140; x < 140; x += band * 2) {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillRect(tx(x), 0, m(band), h);
      }
      for (let y = -10; y < 140; y += band * 2) {
        g.fillStyle = 'rgba(0,0,0,0.06)';
        g.fillRect(0, ty(y + band), w, m(band));
      }
      g.restore();
      // 芝のざらつき
      for (let i = 0; i < 90000; i++) {
        const v = Math.random();
        g.fillStyle = v < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,230,0.05)';
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // ウォーニングトラック
      g.save();
      wedge(); g.clip();
      g.beginPath();
      g.arc(tx(0), ty(0), m(FENCE + 2), 0, Math.PI * 2);
      g.arc(tx(0), ty(0), m(FENCE - 5), 0, Math.PI * 2, true);
      g.fillStyle = '#a8794a';
      g.fill();
      g.restore();
      // 内野の土
      g.save();
      g.beginPath();
      g.moveTo(tx(0), ty(-3));
      g.lineTo(tx(-60), ty(57)); g.lineTo(tx(60), ty(57));
      g.closePath(); g.clip();
      g.beginPath();
      g.arc(tx(MOUND.x), ty(MOUND.y), m(29), 0, Math.PI * 2);
      g.fillStyle = '#b5814f';
      g.fill();
      g.restore();
      // 内野の芝
      const ins = 2.2;
      g.beginPath();
      g.moveTo(tx(0), ty(ins * 1.4));
      g.lineTo(tx(BASE - ins), ty(BASE));
      g.lineTo(tx(0), ty(BASE * 2 - ins * 1.4));
      g.lineTo(tx(-BASE + ins), ty(BASE));
      g.closePath();
      g.fillStyle = '#3a8a36';
      g.fill();
      // マウンドとホーム周り
      g.fillStyle = '#b5814f';
      g.beginPath(); g.arc(tx(MOUND.x), ty(MOUND.y), m(2.8), 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(tx(0), ty(0), m(4.2), 0, Math.PI * 2); g.fill();
      // ファウルライン
      g.strokeStyle = '#f4f4f0';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(tx(0), ty(0)); g.lineTo(tx(-FENCE), ty(FENCE));
      g.moveTo(tx(0), ty(0)); g.lineTo(tx(FENCE), ty(FENCE));
      g.stroke();
      // バッターボックス
      g.lineWidth = 2;
      g.strokeRect(tx(-1.75), ty(0.9), m(1.2), m(1.8));
      g.strokeRect(tx(0.55), ty(0.9), m(1.2), m(1.8));
      // ベース
      g.fillStyle = '#ffffff';
      for (const [x, y] of [[BASE, BASE], [0, BASE * 2], [-BASE, BASE]]) {
        g.save(); g.translate(tx(x), ty(y)); g.rotate(Math.PI / 4);
        g.fillRect(-m(0.2), -m(0.2), m(0.4), m(0.4)); g.restore();
      }
      g.beginPath();
      g.moveTo(tx(-0.22), ty(0.22)); g.lineTo(tx(0.22), ty(0.22)); g.lineTo(tx(0.22), ty(0));
      g.lineTo(tx(0), ty(-0.22)); g.lineTo(tx(-0.22), ty(0)); g.closePath(); g.fill();
      g.fillRect(tx(-0.3), ty(MOUND.y + 0.1), m(0.6), m(0.15));
    });
  }

  function crowdTexture() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 16, rh = h / rows;
      const shirts = ['#e53935', '#fdd835', '#1e88e5', '#ffffff', '#43a047', '#fb8c00', '#8e24aa', '#212121', '#f06292', '#90caf9'];
      for (let r = 0; r < rows; r++) {
        g.fillStyle = r % 2 ? '#24324a' : '#2b3b57';
        g.fillRect(0, r * rh, w, rh);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, r * rh + rh - 4, w, 4);
        for (let x = 2; x < w; x += 9) {
          if (Math.random() < 0.18) continue;
          const sx = x + (Math.random() - 0.5) * 3;
          g.fillStyle = shirts[(Math.random() * shirts.length) | 0];
          g.fillRect(sx, r * rh + rh * 0.45, 7, rh * 0.45);
          g.fillStyle = Math.random() < 0.8 ? '#e8bf9a' : '#6d4c41';
          g.beginPath(); g.arc(sx + 3.5, r * rh + rh * 0.32, 3, 0, Math.PI * 2); g.fill();
        }
      }
    }, true);
  }

  function skyTexture() {
    return canvasTex(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#060a1f');
      gr.addColorStop(0.35, '#16224f');
      gr.addColorStop(0.48, '#3a3a78');
      gr.addColorStop(0.5, '#7a5a7c');
      gr.addColorStop(0.52, '#1a1a2a');
      gr.addColorStop(1, '#0a0a12');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  function glowTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)');
      gr.addColorStop(0.2, 'rgba(255,250,220,0.8)');
      gr.addColorStop(0.5, 'rgba(255,240,200,0.18)');
      gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    });
  }

  // ---------- 球場 ----------
  // 観客席の内側の輪郭(ホームからの極座標、φ=0 がセンター)
  function innerR(phi) {
    const a = Math.abs(phi);
    const PMIN = 54.1 * Math.PI / 180;
    if (a <= Math.PI / 4) return FENCE;
    if (a < PMIN) {
      const r1 = 16 / Math.sin(PMIN - Math.PI / 4);
      const u = (a - Math.PI / 4) / (PMIN - Math.PI / 4);
      return FENCE + (r1 - FENCE) * u;
    }
    return Math.max(20, 16 / Math.sin(a - Math.PI / 4));
  }

  function buildStadium() {
    const N = 240;
    const ring = [];
    for (let i = 0; i <= N; i++) {
      const phi = -Math.PI + (2 * Math.PI) * i / N;
      const r = innerR(phi);
      ring.push({ phi, r, x: Math.sin(phi) * r, y: Math.cos(phi) * r });
    }
    // 累積距離(テクスチャの u)
    let acc = 0;
    ring.forEach((p, i) => { if (i) acc += Math.hypot(p.x - ring[i - 1].x, p.y - ring[i - 1].y); p.s = acc; });

    // フェンス/ラバー
    {
      const pos = [], uv = [], idx = [];
      const wallH = 3.0;
      ring.forEach((p, i) => {
        pos.push(p.x, 0, -p.y, p.x, wallH, -p.y);
        uv.push(p.s / 4, 0, p.s / 4, 1);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const tex = canvasTex(128, 64, (g, w, h) => {
        g.fillStyle = '#1d4a2b'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, 4, h);
        g.fillStyle = '#f2d23c'; g.fillRect(0, 0, w, 5);
      }, true);
      fenceMat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(geo, fenceMat));
    }

    // 観客席(すり鉢状)
    {
      const D = 46, RISE = 30, BASEH = 3.0, STEPS = 10;
      const pos = [], uv = [], idx = [];
      const cols = STEPS + 1;
      ring.forEach((p, i) => {
        const nx = Math.sin(p.phi), ny = Math.cos(p.phi);
        const depth = Math.abs(p.phi) < Math.PI / 4 ? 26 : D;
        const rise = Math.abs(p.phi) < Math.PI / 4 ? 14 : RISE;
        for (let j = 0; j <= STEPS; j++) {
          const u = j / STEPS;
          const gap = Math.abs(p.phi) < Math.PI / 4 ? 9 : 1; // 外野はフェンス裏に通路
          const d = gap + depth * u, hgt = BASEH + 0.5 + rise * u;
          pos.push(p.x + nx * d, hgt, -(p.y + ny * d));
          uv.push(p.s / 22, u * 3);
        }
        if (i) {
          for (let j = 0; j < STEPS; j++) {
            const a = (i - 1) * cols + j, b = i * cols + j;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ map: crowdTexture(), side: THREE.DoubleSide, emissive: 0x222838 });
      scene.add(new THREE.Mesh(geo, mat));

      // 最上段の壁と屋根のふち
      const top = [], tidx = [];
      ring.forEach((p, i) => {
        const nx = Math.sin(p.phi), ny = Math.cos(p.phi);
        const outfield = Math.abs(p.phi) < Math.PI / 4;
        const d = (outfield ? 9 + 26 : 1 + D), hgt = BASEH + 0.5 + (outfield ? 14 : RISE);
        top.push(p.x + nx * d, hgt, -(p.y + ny * d), p.x + nx * d, hgt + (outfield ? 4 : 9), -(p.y + ny * d));
        if (i) { const k = i * 2; tidx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
      });
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
      tg.setIndex(tidx);
      tg.computeVertexNormals();
      scene.add(new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ color: 0x3a4660, side: THREE.DoubleSide })));
    }

    // ポール
    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 8), new THREE.MeshBasicMaterial({ color: 0xffd400 }));
      pole.position.copy(V(sx * FENCE * Math.SQRT1_2, FENCE * Math.SQRT1_2, 15));
      scene.add(pole);
    }

    // 照明塔
    const glow = glowTexture();
    glowTex = glow;
    const towers = [-150, -112, -70, 70, 112, 150, -25, 25];
    for (const deg of towers) {
      const phi = deg * Math.PI / 180;
      const outfield = Math.abs(phi) < Math.PI / 4;
      const r = innerR(phi) + (outfield ? 30 : 50);
      const x = Math.sin(phi) * r, y = Math.cos(phi) * r;
      const h = outfield ? 40 : 52;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, h, 6), new THREE.MeshLambertMaterial({ color: 0x555b66 }));
      post.position.copy(V(x, y, h / 2));
      scene.add(post);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), new THREE.MeshBasicMaterial({ color: 0xfffbe6 }));
      panel.position.copy(V(x, y, h + 2));
      panel.lookAt(V(0, 60, 0));
      scene.add(panel);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.position.copy(V(x, y, h + 2));
      sp.scale.set(36, 36, 1);
      scene.add(sp);
    }

    // バックスクリーン代わりのオーロラビジョン(ホーム後方スタンド上)
    {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 192;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(32, 12), new THREE.MeshBasicMaterial({ map: tex }));
      // センター後方のスタンド上(一塁・二塁から次の塁を見ると正面に見える)
      const r = FENCE + 34;
      mesh.position.copy(V(0, r, 32));
      mesh.lookAt(V(0, 0, 12));
      scene.add(mesh);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 1), new THREE.MeshLambertMaterial({ color: 0x20242c }));
      frame.position.copy(V(0, r + 0.8, 32));
      frame.lookAt(V(0, 0, 12));
      scene.add(frame);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 30, 3), new THREE.MeshLambertMaterial({ color: 0x30343c }));
      leg.position.copy(V(0, r + 1, 16));
      scene.add(leg);
      scoreboard = { canvas: c, tex, key: '' };
    }
  }

  function updateScoreboard(state) {
    const key = `${state.phase}|${state.challenge}|${state.steals}|${state.home}|${I18N.lang}`;
    if (key === scoreboard.key) return;
    scoreboard.key = key;
    const g = scoreboard.canvas.getContext('2d');
    g.fillStyle = '#05070c'; g.fillRect(0, 0, 512, 192);
    g.fillStyle = '#ffd54f';
    g.font = 'bold 40px sans-serif';
    g.textAlign = 'center';
    g.fillText('STEAL KING', 256, 52);
    g.font = 'bold 34px sans-serif';
    g.fillStyle = '#ffffff';
    g.fillText(I18N.t('board.ch', { n: Math.min(state.challenge + 1, state.total) }), 140, 118, 240);
    g.fillStyle = '#7fe0ff';
    g.fillText(I18N.t('board.steals', { n: state.steals }), 370, 118, 260);
    g.fillStyle = '#ff8a80';
    g.font = 'bold 28px sans-serif';
    g.fillText(I18N.t('board.home', { n: state.home }), 370, 166, 260);
    g.fillStyle = '#b0bec5';
    g.fillText('/ ' + state.total, 140, 166);
    scoreboard.tex.needsUpdate = true;
  }

  // ---------- 人物 ----------
  function numberTexture(num, bg, fg) {
    return canvasTex(128, 160, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = 'bold 110px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(num, w / 2, h / 2 + 8);
    });
  }

  // 前方 = ローカル +Z
  function makePlayer(opt) {
    const uni = new THREE.MeshLambertMaterial({ color: opt.uniform });
    const dark = new THREE.MeshLambertMaterial({ color: opt.cap });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
    const root = new THREE.Group();
    root.rotation.order = 'YXZ';
    const body = new THREE.Group(); // 体全体(ダイブで傾ける)
    root.add(body);

    const legGeo = new THREE.BoxGeometry(0.17, 0.85, 0.2);
    legGeo.translate(0, -0.42, 0);
    const legL = new THREE.Mesh(legGeo, uni), legR = new THREE.Mesh(legGeo, uni);
    legL.position.set(0.13, 0.92, 0); legR.position.set(-0.13, 0.92, 0);
    const sockGeo = new THREE.BoxGeometry(0.18, 0.3, 0.21); sockGeo.translate(0, -0.7, 0);
    legL.add(new THREE.Mesh(sockGeo, dark)); legR.add(new THREE.Mesh(sockGeo, dark));
    body.add(legL, legR);

    const torsoMats = [uni, uni, uni, uni, uni, opt.back ? new THREE.MeshLambertMaterial({ map: numberTexture(opt.back, '#' + opt.uniform.toString(16).padStart(6, '0'), opt.numColor || '#1d2f6f') }) : uni];
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), torsoMats);
    torso.position.set(0, 1.25, 0);
    body.add(torso);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.06, 0.29), dark);
    belt.position.set(0, 0.95, 0);
    body.add(belt);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
    head.position.set(0, 1.7, 0);
    body.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    cap.position.set(0, 1.72, 0);
    body.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), dark);
    brim.position.set(0, 1.73, 0.15);
    body.add(brim);

    const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.13);
    armGeo.translate(0, -0.28, 0);
    const armL = new THREE.Mesh(armGeo, uni), armR = new THREE.Mesh(armGeo, uni);
    armL.position.set(0.31, 1.52, 0); armR.position.set(-0.31, 1.52, 0);
    body.add(armL, armR);
    let glove = null;
    if (opt.glove) {
      glove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9a6430 }));
      glove.scale.set(1, 1.2, 0.7);
      glove.position.set(0, -0.62, 0.02);
      armL.add(glove);
    }
    return { root, body, legL, legR, armL, armR, torso, glove };
  }

  function buildPlayers() {
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
    const addShadow = (rig, r = 0.5) => {
      rig.shadow = new THREE.Mesh(new THREE.CircleGeometry(r, 20), shadowMat);
      rig.shadow.rotation.x = -Math.PI / 2;
      scene.add(rig.shadow);
    };
    // 代走のあなた(ビジターのグレー、背番号 0)
    runnerRig = makePlayer({ uniform: 0xb7bcc6, cap: 0x8e1b1b, back: '0', numColor: '#8e1b1b' });
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshPhongMaterial({ color: 0x8e1b1b, shininess: 90 }));
    helmet.position.set(0, 1.7, 0);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.1), helmet.material);
    flap.position.set(0.14, -0.06, 0);
    helmet.add(flap);
    runnerRig.body.add(helmet);
    runnerRig.root.scale.setScalar(1.05);
    scene.add(runnerRig.root);
    addShadow(runnerRig, 0.55);
    runnerShadow = runnerRig.shadow;

    const home = { uniform: 0xf4f4f4, cap: 0x1d2f6f, glove: true };
    pitcher = makePlayer({ ...home, back: '18' });
    scene.add(pitcher.root);
    addShadow(pitcher);
    for (const [id, num] of [['p1b', '3'], ['p2b', '4'], ['pss', '6'], ['p3b', '5'], ['plf', '7'], ['pcf', '8'], ['prf', '9']]) {
      const rig = makePlayer({ ...home, back: num });
      scene.add(rig.root);
      addShadow(rig);
      fielderRigs[id] = rig;
    }
    catcher = makePlayer({ uniform: 0x37474f, cap: 0x1d2f6f, glove: true, back: '2' });
    scene.add(catcher.root);
    addShadow(catcher);

    batter = makePlayer({ uniform: 0xb7bcc6, cap: 0x8e1b1b });
    batter.root.position.copy(V(-0.95, 0.1, 0));
    batter.root.rotation.y = Math.PI / 2;
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 0.9, 6), new THREE.MeshLambertMaterial({ color: 0xd7b98e }));
    bat.geometry.translate(0, 0.45, 0);
    batter.bat = new THREE.Group();
    batter.bat.add(bat);
    batter.bat.position.set(0, 1.35, 0.1);
    batter.root.add(batter.bat);
    scene.add(batter.root);

    homeUmp = makePlayer({ uniform: 0x1b1b1b, cap: 0x1b1b1b });
    homeUmp.root.position.copy(V(0, -2.3, 0));
    homeUmp.root.scale.set(1, 0.85, 1);
    scene.add(homeUmp.root);
    baseUmp = makePlayer({ uniform: 0x1b1b1b, cap: 0x1b1b1b });
    scene.add(baseUmp.root);
    addShadow(baseUmp);

    // ベース(地面の絵の上に少し厚みのある白いベースを置く)
    const bagMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 });
    for (const [x, y] of [[BASE, BASE], [0, BASE * 2], [-BASE, BASE]]) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.4), bagMat);
      bag.position.copy(V(x, y, 0.045));
      bag.rotation.y = Math.PI / 4;
      scene.add(bag);
      bag.userData.mat = bagMat;
      bags.push(bag);
    }
    bagGlow = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x665500 });
  }

  function buildBall() {
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    scene.add(ballMesh);
    ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 40), 3));
    trailLine = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
  }

  // ---------- 花火(カメラ正面のスタンド上空) ----------
  // 途中で新しいジオメトリやシェーダーを作るとカクつくので、最初にまとめて用意して使い回す
  const ROCKET_T = 0.9;
  const FW_COLORS = [0xff5252, 0xffd740, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff, 0xff9100];
  const FW_MAX = 8, FW_N = 260;
  let clock = 0, glowTex = null;
  const fwDir = { x: 0, y: 1 };
  const pendingFw = [], rocketPool = [], burstPool = [];

  function buildFireworks() {
    for (let i = 0; i < FW_MAX + 2; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.scale.set(3, 3, 1);
      sp.visible = false;
      scene.add(sp);
      rocketPool.push({ sp, active: false, x: 0, y: 0, z0: 0, z1: 0, t: 0, big: false });
    }
    for (let i = 0; i < FW_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW_N * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, map: glowTex, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      flash.scale.set(55, 55, 1);
      flash.visible = false;
      scene.add(flash);
      burstPool.push({ pts, flash, vel: new Float32Array(FW_N * 3), n: 0, t: 0, life: 2.4, active: false });
    }
  }

  function firework(delay, big) { pendingFw.push({ at: clock + delay, big }); }

  function spawnRocket(big) {
    const r = rocketPool.find((q) => !q.active);
    if (!r) return;
    // 見ている方向の先(スタンドの上)に打ち上げる
    const d = 125 + Math.random() * 35, side = (Math.random() - 0.5) * 120;
    const x = cam.x + fwDir.x * d + fwDir.y * side, y = cam.y + fwDir.y * d - fwDir.x * side;
    Object.assign(r, { active: true, x, y, z0: 30, z1: (big ? 72 : 60) + Math.random() * 22, t: 0, big });
    r.sp.visible = true;
  }

  const tmpColor1 = new THREE.Color(), tmpColor2 = new THREE.Color();
  function spawnBurst(x, y, z, big) {
    // 空きがなければ一番古いものを再利用
    let bu = burstPool.find((q) => !q.active);
    if (!bu) bu = burstPool.reduce((a, q) => (q.t > a.t ? q : a));
    const n = big ? FW_N : 180;
    const pos = bu.pts.geometry.attributes.position.array, col = bu.pts.geometry.attributes.color.array, vel = bu.vel;
    tmpColor1.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    tmpColor2.setHex(FW_COLORS[(Math.random() * FW_COLORS.length) | 0]);
    const speed = big ? 36 : 28;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sv = speed * (0.85 + Math.random() * 0.3);
      vel[i * 3] = r * Math.cos(a) * sv; vel[i * 3 + 1] = u * sv; vel[i * 3 + 2] = r * Math.sin(a) * sv;
      pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y;
      const c = i % 3 === 0 ? tmpColor2 : tmpColor1;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    bu.pts.geometry.setDrawRange(0, n);
    bu.pts.geometry.attributes.position.needsUpdate = true;
    bu.pts.geometry.attributes.color.needsUpdate = true;
    bu.pts.material.size = big ? 4.5 : 3.6;
    bu.pts.material.opacity = 1;
    bu.pts.visible = true;
    bu.flash.material.color.copy(tmpColor1);
    bu.flash.material.opacity = 1;
    bu.flash.position.set(x, z, -y);
    bu.flash.visible = true;
    Object.assign(bu, { n, t: 0, active: true });
  }

  function updateFireworks(dt) {
    clock += dt;
    for (let i = pendingFw.length - 1; i >= 0; i--) {
      if (pendingFw[i].at <= clock) { spawnRocket(pendingFw[i].big); pendingFw.splice(i, 1); }
    }
    for (const r of rocketPool) {
      if (!r.active) continue;
      r.t += dt;
      const u = Math.min(1, r.t / ROCKET_T);
      const z = r.z0 + (r.z1 - r.z0) * (1 - (1 - u) * (1 - u));
      r.sp.position.set(r.x + Math.sin(r.t * 20) * 0.3, z, -r.y);
      if (u >= 1) {
        r.active = false; r.sp.visible = false;
        spawnBurst(r.x, r.y, z, r.big);
      }
    }
    const drag = Math.exp(-1.6 * dt), g = 5 * dt;
    for (const bu of burstPool) {
      if (!bu.active) continue;
      bu.t += dt;
      const arr = bu.pts.geometry.attributes.position.array, vel = bu.vel;
      for (let k = 0; k < bu.n * 3; k += 3) {
        vel[k] *= drag; vel[k + 1] = vel[k + 1] * drag - g; vel[k + 2] *= drag;
        arr[k] += vel[k] * dt; arr[k + 1] += vel[k + 1] * dt; arr[k + 2] += vel[k + 2] * dt;
      }
      bu.pts.geometry.attributes.position.needsUpdate = true;
      const fade = 1 - bu.t / bu.life;
      bu.pts.material.opacity = Math.max(0, fade < 0.4 ? fade / 0.4 * (0.6 + 0.4 * Math.random()) : 1);
      bu.flash.material.opacity = Math.max(0, 1 - bu.t * 4);
      if (bu.t >= bu.life) { bu.active = false; bu.pts.visible = false; bu.flash.visible = false; }
    }
  }

  // ---------- 初期化 ----------
  function init(canvas) {
    // スマホは描画解像度を抑える(高精細画面ではアンチエイリアスも省く)
    const dpr = window.devicePixelRatio || 1;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    quality.max = Math.min(dpr, touch ? 1.5 : 2);
    quality.pr = quality.max;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(quality.pr);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d1c);
    scene.fog = new THREE.Fog(0x141a33, 180, 520);
    camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 1200);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(800, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    scene.add(sky);
    const starPos = [];
    for (let i = 0; i < 500; i++) {
      const az = Math.random() * Math.PI * 2, el = 0.12 + Math.random() * 1.4;
      starPos.push(Math.cos(el) * Math.cos(az) * 700, Math.sin(el) * 700, Math.cos(el) * Math.sin(az) * 700);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a3a20, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e0, 2.2);
    key.position.set(30, 80, 40);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xd0dcff, 0.8);
    fill.position.set(-40, 60, -80);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(GX1 - GX0, GY1 - GY0),
      new THREE.MeshLambertMaterial({ map: groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(V((GX0 + GX1) / 2, (GY0 + GY1) / 2, 0));
    scene.add(ground);
    // 観客席の下を埋める地面
    const under = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x1a1f2a }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.05;
    scene.add(under);

    buildStadium();
    buildPlayers();
    buildBall();
    buildFireworks();
    buildDust();
    prewarm();
    ready = true;
  }

  // 最初のプレイ中に初めて表示する物(ボール・ナビ・花火)のシェーダーを先に準備しておく
  function prewarm() {
    const hidden = [];
    scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    renderer.compile(scene, camera);
    for (const o of hidden) o.visible = false;
  }

  // 重い端末では描画解像度を自動で下げる
  const quality = { max: 1, pr: 1, frames: 0, time: 0, warm: 0, w: 0, h: 0 };
  function adaptQuality(dt) {
    quality.warm += dt;
    if (quality.warm < 3 || quality.pr <= 1) return;
    quality.frames++; quality.time += dt;
    if (quality.time < 2) return;
    const avg = quality.time / quality.frames;
    quality.frames = 0; quality.time = 0;
    if (avg > 1 / 48) {
      quality.pr = Math.max(1, quality.pr - 0.25);
      renderer.setPixelRatio(quality.pr);
      renderer.setSize(quality.w, quality.h, false);
    }
  }

  function resize(cssW, cssH, logicalW) {
    if (!ready) return;
    quality.w = cssW; quality.h = cssH;
    W = logicalW;
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
    renderer.setSize(cssW, cssH, false);
  }

  // ---------- 土けむり(スライディング) ----------
  const DUST_N = 48, dust = [];
  let dustAcc = 0, lastLand = -1;
  function buildDust() {
    for (let i = 0; i < DUST_N; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc89a68, transparent: true, depthWrite: false, opacity: 0 }));
      sp.visible = false;
      scene.add(sp);
      dust.push({ sp, t: 0, life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0, s: 1 });
    }
  }
  function spawnDust(x, y, n, power) {
    for (let k = 0; k < n; k++) {
      let d = dust.find((q) => q.t >= q.life);
      if (!d) d = dust.reduce((a, q) => (q.t / q.life > a.t / a.life ? q : a));
      const a = Math.random() * Math.PI * 2, sp = (0.6 + Math.random()) * power;
      Object.assign(d, { t: 0, life: 0.5 + Math.random() * 0.5, x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5, z: 0.15,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.6 + Math.random() * power * 0.6, s: 0.5 + Math.random() * 0.5 * power });
      d.sp.visible = true;
    }
  }
  function updateDust(dt, rn, state) {
    if (rn && state.landed && state.landed.t !== lastLand) {
      lastLand = state.landed.t;
      spawnDust(state.landed.x, state.landed.y, state.landed.big ? 14 : 8, state.landed.big ? 2.2 : 1.5);
    }
    // 滑っている間は土けむりを上げ続ける
    if (rn && (rn.mode === 'head' || rn.mode === 'feet') && !(rn.air > 0) && rn.v > 1.5) {
      dustAcc += dt;
      while (dustAcc > 0.035) { dustAcc -= 0.035; spawnDust(rn.x, rn.y, 2, rn.v / 6); }
    }
    for (const d of dust) {
      if (d.t >= d.life) { d.sp.visible = false; continue; }
      d.t += dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      d.vx *= Math.exp(-3 * dt); d.vy *= Math.exp(-3 * dt); d.vz *= Math.exp(-2 * dt);
      const u = d.t / d.life;
      d.sp.position.set(d.x, d.z, -d.y);
      d.sp.scale.setScalar(d.s * (0.8 + 2.2 * u));
      d.sp.material.opacity = 0.55 * (1 - u);
    }
  }

  // ---------- 毎フレーム ----------
  const BASES = [{ x: 0, y: 0 }, { x: BASE, y: BASE }, { x: 0, y: BASE * 2 }, { x: -BASE, y: BASE }];
  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp01 = (u) => Math.max(0, Math.min(1, u));

  function place(rig, x, y, face, z = 0) {
    rig.root.position.set(x, z, -y);
    rig.root.rotation.y = Math.PI - face;
    if (rig.shadow) rig.shadow.position.set(x, 0.03, -y);
  }
  function resetPose(r) {
    r.body.rotation.set(0, 0, 0);
    r.body.position.set(0, 0, 0);
    for (const l of [r.armL, r.armR, r.legL, r.legR]) l.rotation.set(0, 0, 0);
  }
  // 足の振りの位相は毎フレーム積み上げる(経過時間×速さで計算すると、減速中に位相が飛んで足がばたつく)
  let frameDt = 0;
  function runPose(r, speed) {
    const swing = Math.min(1, speed / 6) * 0.95;
    r.ph = (r.ph || 0) + frameDt * (6 + speed * 1.3);
    const ph = r.ph;
    r.legL.rotation.x = Math.sin(ph) * swing;
    r.legR.rotation.x = -Math.sin(ph) * swing;
    r.armL.rotation.x = -Math.sin(ph) * swing * 0.9;
    r.armR.rotation.x = Math.sin(ph) * swing * 0.9;
    r.body.rotation.x = Math.min(0.4, speed * 0.04);
    r.body.position.y = Math.abs(Math.sin(ph)) * 0.05 * swing;
  }
  // 腰を落とした構え
  function readyPose(r, k = 1) {
    r.body.rotation.x = 0.3 * k;
    r.body.position.y = -0.12 * k;
    r.legL.rotation.z = 0.22 * k; r.legR.rotation.z = -0.22 * k;
    r.legL.rotation.x = -0.25 * k; r.legR.rotation.x = -0.25 * k;
    r.armL.rotation.x = -0.6 * k; r.armR.rotation.x = -0.4 * k;
  }

  function poseRunner(rn, time) {
    const r = runnerRig;
    resetPose(r);
    place(r, rn.x, rn.y, rn.face, rn.z || 0);
    runnerShadow.scale.setScalar(1);
    const p = clamp01(rn.prog || 0);
    switch (rn.mode) {
      case 'lead': {
        // 横向きのままカニ歩きでリード
        readyPose(r);
        const st = Math.sin(time * 9) * 0.28;
        r.legL.rotation.z = 0.22 + st; r.legR.rotation.z = -0.22 + st;
        break;
      }
      case 'base': readyPose(r, 0.7); break;
      case 'back': case 'run': case 'brake':
        runPose(r, rn.v);
        break;
      case 'head': case 'down': case 'diveBack': case 'downBack': {
        const k = rn.mode === 'down' || rn.mode === 'downBack' ? 1 : p;
        r.body.rotation.x = 1.45 * k;
        r.body.position.y = 0.12 * k;
        r.armL.rotation.x = -2.95 * k; r.armR.rotation.x = -2.85 * k;
        r.armL.rotation.z = 0.15 * k; r.armR.rotation.z = -0.15 * k;
        r.legL.rotation.x = 0.25 * k; r.legR.rotation.x = 0.1 * k;
        if (rn.crawling) {
          // 腕を交互に伸ばしてベースに手を届かせる(足は動かさない)
          const c = Math.sin(time * 9) * 0.25;
          r.armL.rotation.x += c; r.armR.rotation.x -= c;
        }
        runnerShadow.scale.set(1, 1, 2.2);
        // 飛んでいる間は脚を後ろに伸ばして一直線に
        if (rn.air > 0) { r.legL.rotation.x = 0.05; r.legR.rotation.x = -0.05; runnerShadow.scale.set(0.8, 0.8, 1.8); }
        break;
      }
      case 'feet': {
        r.body.rotation.x = -0.8 * p;
        r.body.position.y = -0.45 * p;
        r.body.position.z = 0.8 * p;
        r.legL.rotation.x = -0.77 * p; r.legR.rotation.x = -0.35 * p;
        r.legR.rotation.z = -0.2 * p;
        r.armL.rotation.x = -2.4 * p; r.armR.rotation.x = 0.6 * p;
        runnerShadow.scale.set(1, 1, 2);
        break;
      }
      case 'safe': {
        // ガッツポーズ
        const pump = Math.abs(Math.sin(time * 6));
        r.armR.rotation.x = -2.6 - pump * 0.3; r.armL.rotation.x = -0.4;
        r.armR.rotation.z = -0.25;
        break;
      }
      case 'out':
        r.body.rotation.x = 0.35;
        r.armL.rotation.x = 0.1; r.armR.rotation.x = 0.1;
        break;
      default: break;
    }
  }

  function poseFielder(r, f, time) {
    resetPose(r);
    place(r, f.x, f.y, f.face);
    const t = f.t || 0;
    switch (f.mode) {
      case 'run': runPose(r, f.v || 6); break;
      case 'catch':
        readyPose(r, 0.4);
        r.armL.rotation.x = -1.7; r.armL.rotation.z = -0.3;
        break;
      case 'tag': {
        // グラブを地面に叩きつけるタッチ
        const k = clamp01(t / 0.12);
        r.body.rotation.x = 0.85 * k;
        r.body.position.y = -0.25 * k;
        r.legL.rotation.z = 0.35; r.legR.rotation.z = -0.35;
        r.armL.rotation.x = -0.9 - 0.4 * k; r.armR.rotation.x = -0.3;
        break;
      }
      case 'throw': {
        const u = clamp01(t / 0.25);
        r.armR.rotation.x = u < 0.5 ? lerp(0, 1.9, u * 2) : lerp(1.9, 4.6, (u - 0.5) * 2);
        r.armL.rotation.x = -1.2;
        r.body.rotation.x = u > 0.5 ? 0.35 : -0.1;
        break;
      }
      case 'hold':
        // 一塁手がランナーを背負う構え
        readyPose(r, 0.6);
        r.armL.rotation.x = -1.4; r.armL.rotation.z = -0.4;
        break;
      default: readyPose(r, 0.8);
    }
  }

  function posePitcher(pc) {
    const r = pitcher;
    resetPose(r);
    place(r, MOUND.x, MOUND.y, pc.face, 0.25);
    const setArms = () => {
      r.armL.rotation.x = -0.9; r.armR.rotation.x = -0.9;
      r.armL.rotation.z = -0.4; r.armR.rotation.z = 0.4;
    };
    const t = pc.t || 0;
    if (pc.mode === 'set' || pc.mode === 'idle') setArms();
    else if (pc.mode === 'deliver') {
      const u = t / pc.rel;
      if (u < 0.6) {
        setArms();
        r.legL.rotation.x = -1.5 * Math.sin(Math.PI / 2 * u / 0.6);
      } else if (u < 1) {
        const v = (u - 0.6) / 0.4;
        r.legL.rotation.x = lerp(-1.5, -0.6, v);
        r.legR.rotation.x = 0.5 * v;
        r.armL.rotation.x = -1.4;
        r.armR.rotation.x = v < 0.6 ? lerp(0, 1.9, v / 0.6) : lerp(1.9, 4.3, (v - 0.6) / 0.4);
        r.body.rotation.x = -0.15 + 0.4 * v;
      } else {
        const v = clamp01((t - pc.rel) / 0.3);
        r.legL.rotation.x = -0.6; r.legR.rotation.x = 0.5 + 0.4 * v;
        r.armR.rotation.x = lerp(4.3, 5.4, v); r.armL.rotation.x = -0.6;
        r.body.rotation.x = 0.25 + 0.25 * v;
      }
    } else if (pc.mode === 'feint') {
      // 投げるふり: 腕を振りかけて止め、下ろす
      const u = t / pc.rel;
      r.armL.rotation.x = -1.3;
      if (u < 1) r.armR.rotation.x = lerp(0, 1.9, u);
      else {
        const v = clamp01((t - pc.rel) / 0.12), w = clamp01((t - pc.rel - 0.2) / 0.3);
        r.armR.rotation.x = lerp(lerp(1.9, 3.0, v), 0.3, w);
      }
      r.body.rotation.x = u < 1 ? -0.05 : 0.15;
      r.legR.rotation.x = 0.3;
    } else if (pc.mode === 'pickoff') {
      const u = t / pc.rel;
      r.armL.rotation.x = -1.3;
      if (u < 1) r.armR.rotation.x = lerp(0, 1.9, u);
      else r.armR.rotation.x = lerp(1.9, 4.6, clamp01((t - pc.rel) / 0.12));
      r.body.rotation.x = u < 1 ? -0.05 : 0.3;
      r.legR.rotation.x = 0.3;
    } else if (pc.mode === 'catch') {
      r.armL.rotation.x = -1.8;
    }
  }

  function poseCatcher(c, time) {
    const r = catcher;
    resetPose(r);
    place(r, c.x, c.y, c.face);
    const crouch = c.mode === 'crouch' || c.mode === 'catch';
    r.root.scale.set(1.05, crouch ? 0.62 : 1.05, 1.05);
    if (c.mode === 'catch') { r.armL.rotation.x = -1.5; }
    else if (c.mode === 'crouch') { r.armL.rotation.x = -1.2; r.armL.rotation.z = -0.2; }
    else poseFielder(r, c, time);
  }

  function poseUmp(u, time) {
    const r = baseUmp;
    resetPose(r);
    place(r, u.x, u.y, u.face);
    const t = u.t || 0;
    if (u.call === 'safe') {
      // 両手を横に大きく広げる
      const k = clamp01(t / 0.18);
      r.armL.rotation.x = -1.5 * (1 - k); r.armR.rotation.x = -1.5 * (1 - k);
      r.armL.rotation.z = 1.5 * k; r.armR.rotation.z = -1.5 * k;
      r.body.rotation.x = 0.25;
      r.legL.rotation.z = 0.3; r.legR.rotation.z = -0.3;
    } else if (u.call === 'out') {
      // 拳を突き上げる
      const k = clamp01(t / 0.15);
      r.armR.rotation.x = -2.8 * k + Math.sin(time * 14) * 0.08 * k;
      r.armR.rotation.z = -0.2;
      r.armL.rotation.x = -0.3;
    } else {
      readyPose(r, 0.9);
      r.armL.rotation.x = -0.2; r.armR.rotation.x = -0.2;
    }
  }

  function render(state, dt) {
    if (!ready) return;
    frameDt = state.paused ? 0 : dt;
    updateScoreboard(state);
    updateFireworks(dt);
    adaptQuality(dt);

    const rn = state.runner;
    const onField = state.phase !== 'title';
    runnerRig.root.visible = runnerShadow.visible = onField;
    if (onField) poseRunner(rn, state.time);
    updateDust(dt, onField ? rn : null, state);
    posePitcher(state.pitcher);
    for (const [id, rig] of Object.entries(fielderRigs)) poseFielder(rig, state.fielders[id], state.time);
    poseCatcher(state.catcher, state.time);
    poseUmp(state.ump, state.time);

    // バッターは見送る(ホームスチールのときは打席を外す)
    const pc = state.pitcher;
    const sw = pc.mode === 'deliver' ? clamp01((pc.t - pc.rel) / 0.2) : 0;
    batter.root.position.copy(V(state.to === 0 && state.phase === 'run' ? -1.6 : -0.95, 0.1, 0));
    batter.bat.rotation.set(-0.4 - sw * 0.2, 0, 0.6 + Math.sin(state.time * 2) * 0.05);

    // ボール
    const b = state.ball;
    const show = onField && b.visible;
    ballMesh.visible = show;
    ballShadow.visible = show && !b.holder;
    if (show) {
      if (b.holder) {
        const rig = b.holder === 'pitcher' ? pitcher : b.holder === 'catcher' ? catcher : fielderRigs[b.holder];
        rig.root.updateMatrixWorld(true);
        rig.glove.getWorldPosition(ballMesh.position);
        ballMesh.position.y += 0.08;
      } else {
        ballMesh.position.set(b.x, b.z, -b.y);
      }
      ballShadow.position.set(ballMesh.position.x, 0.04, ballMesh.position.z);
      if (!b.holder) {
        const last = trailPts[trailPts.length - 1];
        if (!last || Math.hypot(last.x - b.x, last.y - b.y, last.z - b.z) > 0.6) {
          trailPts.push({ x: b.x, y: b.y, z: b.z });
          if (trailPts.length > 40) trailPts.shift();
        }
      }
    }
    if (!show || b.holder) trailPts = [];
    const arr = trailLine.geometry.attributes.position.array;
    for (let i = 0; i < 40; i++) {
      const p = trailPts[Math.min(i, trailPts.length - 1)];
      if (p) { arr[i * 3] = p.x; arr[i * 3 + 1] = p.z; arr[i * 3 + 2] = -p.y; }
    }
    trailLine.geometry.attributes.position.needsUpdate = true;
    trailLine.geometry.setDrawRange(0, trailPts.length);
    trailLine.visible = trailPts.length > 1;

    // 目標の塁を少し光らせる
    bags.forEach((bag, i) => {
      const target = onField && state.to === i + 1;
      bag.material = target ? bagGlow : bags[0].userData.mat || bag.material;
    });
    bagGlow.emissive.setHSL(0.14, 1, 0.25 + 0.2 * Math.sin(state.time * 6));

    // カメラ: ランナーの背中越しに次の塁を見る
    const from = BASES[state.from], to = BASES[state.to];
    let dx = to.x - from.x, dy = to.y - from.y;
    const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    // 塁線の外側(ファウルゾーン・外野側)
    let ox = dy, oy = -dx;
    if ((MOUND.x - from.x) * ox + (MOUND.y - from.y) * oy > 0) { ox = -ox; oy = -oy; }
    // リード中は塁の後ろに据え置き(リードが広がっていくのが見える)、走り出したら追いかける
    const s = onField && state.phase !== 'lead' && state.phase !== 'ready' ? Math.max(0, Math.min(dl, (rn.x - from.x) * dx + (rn.y - from.y) * dy)) : 0;
    const qx = from.x + dx * s, qy = from.y + dy * s;
    const running = state.phase === 'run' || state.phase === 'result';
    // 望遠: 離れたところから画角を狭くして見る(投手や塁が大きく見える)
    const back = running ? 14 : 17;
    let tx = qx - dx * back + ox * 3.5, ty = qy - dy * back + oy * 3.5, tz = running ? 3.8 : 4.6;
    const mix = running ? 0.2 : 0.5;
    let lx = lerp(to.x, MOUND.x, mix), ly = lerp(to.y, MOUND.y, mix), lz = running ? 0.5 : 0.9;
    if (state.phase === 'title') {
      // タイトル画面はゆっくり内野を回る
      const a = state.time * 0.08;
      tx = Math.sin(a) * 62; ty = 20 + Math.cos(a) * 62; tz = 14;
      lx = 0; ly = 20; lz = 0;
    }
    const k = 1 - Math.exp(-(running ? 6 : 4) * dt);
    if (!cam.init || Math.hypot(tx - cam.x, ty - cam.y) > 30) {
      Object.assign(cam, { x: tx, y: ty, z: tz, lx, ly, lz, init: true });
    } else {
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k;
      cam.lx += (lx - cam.lx) * k; cam.ly += (ly - cam.ly) * k; cam.lz += (lz - cam.lz) * k;
    }
    if (api.debugCam) Object.assign(cam, api.debugCam);
    const shake = state.shake > 0 ? state.shake * 0.08 : 0;
    camera.position.set(cam.x + (Math.random() - 0.5) * shake, cam.z + (Math.random() - 0.5) * shake, -cam.y);
    camera.lookAt(cam.lx, cam.lz, -cam.ly);
    const fl = Math.hypot(cam.lx - cam.x, cam.ly - cam.y) || 1;
    fwDir.x = (cam.lx - cam.x) / fl; fwDir.y = (cam.ly - cam.y) / fl;

    renderer.render(scene, camera);
  }
  let bagGlow = null;

  const tmp = new THREE.Vector3();
  function project(x, y, z) {
    tmp.set(x, z, -y).project(camera);
    return { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, behind: tmp.z > 1 };
  }

  const api = { init, render, resize, project, firework, ROCKET_T, BASES, MOUND, debugCam: null, get info() { return renderer.info; }, get pixelRatio() { return quality.pr; } };
  return api;
})();
