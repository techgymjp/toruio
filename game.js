'use strict';
// 目指せ盗塁王 — 代走で一塁から二盗・三盗・ホームスチールを狙う。100 チャレンジで何個盗めるか
// 座標系: ホームベースが原点、+y がセンター方向、+x がライト方向、z が高さ。単位はメートル。
// 画面はランナーの背中越しに次の塁を見る視点(描画は scene3d.js)。
(() => {
  // ---------- 定数 ----------
  const H = 640;
  let W = 960; // 画面の横幅に合わせて変わる(高さ 640 基準の論理座標)
  const TOTAL = 100;
  const BL = 27.43;              // 塁間
  const B = Scene3D.BASES;       // 0: ホーム 1: 一塁 2: 二塁 3: 三塁
  const M = Scene3D.MOUND;

  // ランナー
  const V_JOG = 7.0, V_DASH = 9.0, ACC = 7.5;
  // 滑らずに着くときは塁の直前で一気に止まる(駆け抜けに近い)。スタミナを使わない代わりに少し遅い
  const BRAKE = 22, BRAKE_MIN_V = 3;
  const LEAD_V = 2.6, BACK_V = 6.0, BACK_ACC = 14, BACK_TURN = 0.12, LEAD_MAX = 10;
  const SLIDE_T = 0.15;          // スライディングで体を投げ出すまでの時間
  // ヘッドスライディング: 地面を蹴って低く飛び(加速)、着地して滑る。手がベースに着いたとき速すぎると止まれずオーバースライド
  const HEAD_BOOST = 3.0, HEAD_AIR = 0.3, HEAD_AIR_H = 0.45, AIR_DRAG = 2;
  const HEAD_DEC = 14, HEAD_REACH = 2.2, HEAD_GRIP = 6.0;
  // スライディング(足から): 少し加速して低く滑り込む。足がベースに引っかかって止まるのでオーバースライドしない
  const FEET_BOOST = 2.4, FEET_AIR = 0.12, FEET_AIR_H = 0.15;
  const FEET_DEC = 12, FEET_REACH = 1.0;
  const DIVE_DEC = 8, DIVE_REACH = 2.0;
  const CRAWL_V = 1.8, REACT = 0.12, TOUCH = 0.2;
  // スタミナ(1 チャレンジの間ずっと減っていく。減るほど足が遅くなる)
  const ST_LEAD = 4, ST_HEAD = 26, ST_FEET = 14, ST_DIVE = 10;
  // バッテリー
  const PICK_TELL = 0.4, PICK_V = 30, TAG_T = 0.12, PICK_MAX = 3;
  // 偽投: 振り向いてから FEINT_HOLD 秒でホームに向き直り、FEINT_END 秒で終わる。FEINT_QUICK の確率ですぐ投球
  const FEINT_HOLD = 0.65, FEINT_END = 0.85, FEINT_QUICK = 0.6;
  const DELIVER = 1.0, DELIVER_HOME = 2.22, PITCH_V = 38;
  const TRANSFER = 0.75, THROW_REL = 0.18, THROW_V = 40, FIELDER_V = 8;
  const DT = 1 / 120;
  const t = (k, v) => I18N.t(k, v);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const rand = (a, b) => a + (b - a) * Math.random();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- 保存 ----------
  function loadBest() {
    try { return JSON.parse(localStorage.getItem('toruio.best')) || null; } catch (e) { return null; }
  }
  function saveBest(b) {
    try { localStorage.setItem('toruio.best', JSON.stringify(b)); } catch (e) { /* 保存できない環境 */ }
  }
  function audio() { Sound.init(); }

  // ---------- 入力 ----------
  const keys = new Set();
  const input = { lead: false, dash: false };
  const pressed = { head: false, feet: false, start: false };
  let bot = null; // テスト用: (state) => { lead, dash, head, feet } を返す関数

  // ボタンの配置は画面の角からの距離(dx: 左右の端から, dy: 下端から)。スマホでは UI 全体を U 倍に大きくする
  const BTN = {
    lead: { dx: 140, dy: 135, r0: 96, left: true, label: 'btn.lead', key: 'Space / Z', hold: true },
    dash: { dx: 100, dy: 82, r0: 70, label: 'btn.dash', key: 'Shift / X', hold: true },
    // 右手の親指で: ダッシュ(右下)、その上にヘッドスライディング、左にスライディング(画面の真ん中を空ける)
    head: { dx: 100, dy: 212, r0: 54, label: 'btn.head', key: 'V / ↑' },
    feet: { dx: 240, dy: 62, r0: 56, label: 'btn.feet', key: 'C / ↓' },
  };
  const MUTE = { x: 596, y: 36, r: 22 };
  let U = 1;
  const pointers = new Map(); // pointerId -> ボタン名 | 'none'

  const isKey = (k, ...names) => names.includes(k);
  window.addEventListener('keydown', (e) => {
    audio();
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!keys.has(k)) {
      if (isKey(k, 'v', 'ArrowUp')) pressed.head = true;
      if (isKey(k, 'c', 'ArrowDown')) pressed.feet = true;
      if (state.phase === 'title' && (k === 'h' || (state.help && isKey(k, ' ', 'Enter', 'Escape')))) setHelp(!state.help);
      else if (isKey(k, ' ', 'Enter') && (state.phase === 'title' || state.phase === 'over')) pressed.start = true;
      if (isKey(k, 'p', 'Escape')) togglePause();
      if (k === 'm') Sound.setMuted(!Sound.muted);
    }
    keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => keys.clear());

  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function hitButton(p) {
    let best = null, bd = 1e9;
    for (const [name, b] of Object.entries(BTN)) {
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d <= b.r + 14 && d < bd) { best = name; bd = d; }
    }
    return best;
  }
  canvas.addEventListener('pointerdown', (e) => {
    audio();
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = canvasPos(e);
    if (Math.hypot(p.x - MUTE.x, p.y - MUTE.y) <= (MUTE.r + 8) * U) {
      Sound.setMuted(!Sound.muted);
      pointers.set(e.pointerId, 'none');
      return;
    }
    if (state.phase === 'title' && state.help) { setHelp(false); pointers.set(e.pointerId, 'none'); return; }
    if (state.phase === 'title' || state.phase === 'over') {
      if (state.phase !== 'over' || state.overT > 1.0) pressed.start = true;
      pointers.set(e.pointerId, 'none');
      return;
    }
    if (state.paused) { pointers.set(e.pointerId, 'none'); return; }
    const b = hitButton(p);
    if (b === 'head') pressed.head = true;
    if (b === 'feet') pressed.feet = true;
    pointers.set(e.pointerId, b || 'none');
  });
  function releasePointer(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);

  const holding = (name) => { for (const v of pointers.values()) if (v === name) return true; return false; };

  function readInput() {
    if (bot) {
      const b = bot(state) || {};
      input.lead = !!b.lead; input.dash = !!b.dash;
      if (b.head) pressed.head = true;
      if (b.feet) pressed.feet = true;
      return;
    }
    input.lead = keys.has(' ') || keys.has('z') || keys.has('ArrowRight') || holding('lead');
    input.dash = keys.has('Shift') || keys.has('x') || holding('dash');
  }

  // ---------- 状態 ----------
  const state = {
    phase: 'title', // title | ready | lead | run | result | over
    paused: false,
    total: TOTAL,
    challenge: 0, steals: 0, home: 0, s2: 0, s3: 0, pickOuts: 0, csOuts: 0,
    streak: 0, bestStreak: 0,
    from: 1, to: 2,
    phaseT: 0, overT: 0, time: 0,
    runner: null, pitcher: null, catcher: null, fielders: {}, ball: null, ump: null,
    battery: null,
    popups: [], cue: null, result: null,
    slow: 1, shake: 0,
    best: loadBest(), newRecord: false,
  };

  // ---------- 幾何 ----------
  function lineDir() {
    const a = B[state.from], b = B[state.to];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  }
  const faceTo = (dx, dy) => Math.atan2(dx, dy);
  const unit = (x, y) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };

  function newRunner(stamina = 100) {
    return {
      s: 0, v: 0, mode: 'base', t: 0, prog: 0, x: 0, y: 0, face: 0,
      stamina, held: false, goT: -1, air: 0, z: 0, slid: null, touched: false, touchT: 0, overslid: false,
      backT: 0,
    };
  }

  // 守備位置(状況ごと)
  const DEF = {
    p1b: { x: 21.5, y: 27 }, p2b: { x: 9, y: 39 }, pss: { x: -9, y: 39 }, p3b: { x: -21, y: 25 },
    plf: { x: -48, y: 80 }, pcf: { x: 0, y: 95 }, prf: { x: 48, y: 80 },
  };
  const COVER = { 2: 'pss', 3: 'p3b', 0: 'catcher' }; // 盗塁のときベースに入る野手
  const HOLDER = { 1: 'p1b', 2: 'pss', 3: 'p3b' };    // 牽制球を受ける野手

  function fielder(id) { return id === 'catcher' ? state.catcher : state.fielders[id]; }
  function newFielder(p, mode = 'stand') { return { x: p.x, y: p.y, face: Math.PI, mode, t: 0, v: 0, goal: null, look: null }; }

  // 塁から少しずらした位置(ベースに入る野手が立つ場所)
  function nearBase(i, toward, dist) {
    const u = unit(toward.x - B[i].x, toward.y - B[i].y);
    return { x: B[i].x + u.x * dist, y: B[i].y + u.y * dist };
  }

  function setupField() {
    const f = {};
    for (const [id, p] of Object.entries(DEF)) f[id] = newFielder(p);
    if (state.from === 1) {
      Object.assign(f.p1b, nearBase(1, M, 0.8), { mode: 'hold' });
      Object.assign(f.pss, { x: -7, y: 37 });
    } else if (state.from === 2) {
      Object.assign(f.pss, { x: -4.5, y: 40.5 });
      Object.assign(f.p2b, { x: 6, y: 39.5 });
      Object.assign(f.p3b, { x: -20.5, y: 22 });
    } else {
      Object.assign(f.p3b, nearBase(3, M, 0.8), { mode: 'hold' });
    }
    state.fielders = f;
    state.catcher = Object.assign(newFielder({ x: 0, y: -1.0 }, 'crouch'), { face: 0 });
    state.pitcher = { mode: 'idle', t: 0, rel: 1, face: Math.PI, setT: 2, picks: 0, pickTo: null, hasBall: true };
    state.ball = { visible: true, holder: 'pitcher', x: 0, y: 0, z: 0, fl: null };
    // 塁審は目標の塁の向こう側(カメラから見える位置)
    const U = { 2: { x: 2.8, y: 42.5 }, 3: { x: -23, y: 17 }, 0: { x: 1.9, y: -2.4 } }[state.to];
    state.ump = { x: U.x, y: U.y, face: faceTo(B[state.to].x - U.x, B[state.to].y - U.y), call: null, t: 0 };
    state.slow = 1;
  }

  // 1 チャレンジごとに投手と捕手が変わる
  function newBattery() {
    const quick = rand(0.9, 1.15), pick = rand(0.6, 1.6), arm = rand(0.9, 1.12);
    // 牽制のうち、投げるふり(偽投)にする割合
    const feint = rand(0.12, 0.45);
    return { quick, pick, arm, feint };
  }

  function newGame() {
    Object.assign(state, {
      paused: false, challenge: 0, steals: 0, home: 0, s2: 0, s3: 0, pickOuts: 0, csOuts: 0,
      streak: 0, bestStreak: 0, popups: [], newRecord: false, overT: 0,
    });
    startChallenge();
  }

  function startChallenge() {
    state.from = 1; state.to = 2;
    state.runner = newRunner();
    state.battery = newBattery();
    state.result = null;
    setupField();
    placeRunner();
    setPhase('ready');
  }

  function setPhase(p) { state.phase = p; state.phaseT = 0; }

  // ---------- ボール ----------
  function throwBall(to, speed, h, cb, z1 = 1.2) {
    const b = state.ball;
    const from = b.holder ? holderPos(b.holder) : { x: b.x, y: b.y, z: b.z };
    const T = Math.max(0.15, Math.hypot(to.x - from.x, to.y - from.y) / speed);
    b.holder = null;
    b.fl = { x0: from.x, y0: from.y, z0: from.z, x1: to.x, y1: to.y, z1, T, t: 0, h, cb };
    b.x = from.x; b.y = from.y; b.z = from.z;
    Sound.whoosh(speed / 40);
  }
  function holderPos(id) {
    if (id === 'pitcher') return { x: M.x, y: M.y - 0.4, z: 2.0 };
    const f = fielder(id);
    return { x: f.x, y: f.y, z: id === 'catcher' ? 1.6 : 1.5 };
  }
  function updateBall(dt) {
    const b = state.ball, fl = b.fl;
    if (!fl) return;
    fl.t += dt;
    const u = Math.min(1, fl.t / fl.T);
    b.x = fl.x0 + (fl.x1 - fl.x0) * u;
    b.y = fl.y0 + (fl.y1 - fl.y0) * u;
    b.z = fl.z0 + (fl.z1 - fl.z0) * u + 4 * fl.h * u * (1 - u);
    if (u >= 1) { b.fl = null; fl.cb(); }
  }

  // ---------- ランナー ----------
  function stFactor(r) { return 0.8 + 0.2 * r.stamina / 100; }
  function spend(r, n) { r.stamina = Math.max(0, r.stamina - n); }

  function tip(r) {
    if (r.mode === 'head' || r.mode === 'down') return r.s + HEAD_REACH * Math.min(1, r.prog);
    if (r.mode === 'feet') return r.s + FEET_REACH * Math.min(1, r.prog);
    return r.s;
  }
  // 牽制のとき塁に戻れているか
  function backOnBase(r) {
    if (r.mode === 'diveBack' || r.mode === 'downBack') return r.s - DIVE_REACH * Math.min(1, r.prog) <= TOUCH;
    return r.s <= 0.35;
  }
  const onBase = (r) => r.touched && !r.overslid;

  function placeRunner() {
    const r = state.runner, d = lineDir(), a = B[state.from];
    r.x = a.x + d.x * r.s; r.y = a.y + d.y * r.s;
    const fwd = faceTo(d.x, d.y), bwd = faceTo(-d.x, -d.y);
    switch (r.mode) {
      case 'run': case 'brake': case 'head': case 'feet': case 'down': r.face = fwd; break;
      case 'back': case 'diveBack': case 'downBack': r.face = bwd; break;
      case 'safe': case 'out': r.face = faceTo(M.x - r.x, M.y - r.y); break;
      default: r.face = faceTo(M.x - r.x, M.y - r.y); // 投手を見ながらリード
    }
  }

  // リードの間(投手が投げる前)
  function updateLeadRunner(r, dt) {
    r.t += dt;
    const sf = stFactor(r);
    const lying = r.mode === 'diveBack' || r.mode === 'downBack';
    if (lying) {
      r.prog += dt / SLIDE_T;
      if (r.mode === 'diveBack') {
        r.v = Math.max(0, r.v - DIVE_DEC * dt);
        r.s = Math.max(0, r.s - r.v * dt);
        if (r.v <= 0 && r.prog >= 1) { r.mode = 'downBack'; r.t = 0; }
      } else if (r.s - DIVE_REACH > TOUCH) {
        r.s = Math.max(0, r.s - CRAWL_V * dt); // 手が届くまで這って戻る
      } else if (r.t > 0.7 && state.pitcher.mode !== 'pickoff' && state.ball.holder === 'pitcher') {
        r.s = 0; r.mode = 'base'; r.t = 0; // 起き上がってベースへ
      }
      return;
    }
    if (pressed.head && r.s > 0.6) {
      // 頭から帰塁
      r.mode = 'diveBack'; r.t = 0; r.prog = 0; r.v = Math.max(r.v, 3) + 3;
      spend(r, ST_DIVE);
      Sound.slide(0.8);
      return;
    }
    if (input.lead) {
      if (!r.held) { spend(r, ST_LEAD); r.held = true; }
      r.mode = 'lead';
      r.v = LEAD_V * sf;
      r.s = Math.min(LEAD_MAX, r.s + r.v * dt);
    } else {
      r.held = false;
      if (r.s > 0) {
        if (r.mode !== 'back') { r.mode = 'back'; r.backT = 0; r.v = 0; }
        r.backT += dt;
        if (r.backT > BACK_TURN) {
          r.v = Math.min(BACK_V * sf, r.v + BACK_ACC * dt);
          r.s = Math.max(0, r.s - r.v * dt);
        }
      }
      if (r.s <= 0) { r.s = 0; r.mode = 'base'; r.v = 0; }
    }
  }

  // 投球と同時に自動でスタートする
  function updateRunRunner(r, dt) {
    r.t += dt;
    const sf = stFactor(r);
    if (r.goT > 0) {
      r.goT -= dt;
      // スタート前も帰塁の勢いは残る
      if (r.mode === 'back' || r.mode === 'diveBack') r.s = Math.max(0, r.s - r.v * dt), r.v = Math.max(0, r.v - 20 * dt);
      if (r.goT <= 0) {
        r.v = r.mode === 'lead' ? LEAD_V * 0.5 : 0;
        r.mode = 'run'; r.t = 0; r.prog = 0;
      }
      return;
    }
    const remain = () => BL - tip(r);
    if (!r.slid && (r.mode === 'run' || r.mode === 'brake') && (pressed.head || pressed.feet)) {
      r.slid = pressed.head ? 'head' : 'feet';
      r.mode = r.slid; r.prog = 0; r.t = 0;
      // 地面を蹴って飛び出す(加速)
      r.v += r.slid === 'head' ? HEAD_BOOST : FEET_BOOST;
      r.air = r.airT = r.slid === 'head' ? HEAD_AIR : FEET_AIR;
      r.airH = r.slid === 'head' ? HEAD_AIR_H : FEET_AIR_H;
      spend(r, r.slid === 'head' ? ST_HEAD : ST_FEET);
      Sound.slide(r.slid === 'head' ? 1.1 : 1, r.airT);
    }
    switch (r.mode) {
      case 'run': {
        const vmax = (input.dash ? V_DASH : V_JOG) * sf;
        r.v = r.v < vmax ? Math.min(vmax, r.v + ACC * dt) : Math.max(vmax, r.v - 4 * dt);
        r.s += r.v * dt;
        // スライディングしないと手前で減速して止まる
        if (remain() <= r.v * r.v / (2 * BRAKE) + 0.15) r.mode = 'brake';
        break;
      }
      case 'brake':
        r.v = Math.max(BRAKE_MIN_V, r.v - BRAKE * dt);
        r.s += r.v * dt;
        if (remain() <= 0.25) { touch(r); r.s = BL - 0.2; r.v = 0; r.mode = 'stand'; }
        break;
      case 'head': case 'feet': {
        r.prog += dt / SLIDE_T;
        if (r.air > 0) {
          // 低く飛んでいる間はほとんど減速しない
          r.air -= dt;
          r.v = Math.max(0, r.v - AIR_DRAG * dt);
          const u = 1 - Math.max(0, r.air) / r.airT;
          r.z = 4 * r.airH * u * (1 - u);
          if (r.air <= 0) { r.z = 0; state.landed = { t: state.time, x: r.x, y: r.y, big: r.mode === 'head' }; Sound.land(r.mode === 'head'); state.shake = Math.max(state.shake, r.mode === 'head' ? 0.5 : 0.25); }
        } else {
          r.v = Math.max(0, r.v - (r.mode === 'head' ? HEAD_DEC : FEET_DEC) * dt);
        }
        r.s += r.v * dt;
        if (r.crawling && !r.touched) {
          r.crawlWait -= dt;
          if (r.crawlWait <= 0) r.s += CRAWL_V * dt;
        }
        if (!r.touched && remain() <= TOUCH) {
          touch(r);
          if (r.mode === 'head') {
            if (r.v > HEAD_GRIP) {
              // 勢いがありすぎて手が離れる
              r.overslid = true;
              popup(t('pop.overslide'), '#ffab91', 30);
            } else {
              r.v = 0; r.air = 0; r.z = 0; // ベースをつかんで止まる
            }
          }
        }
        if (r.touched) r.crawling = false;
        if (r.mode === 'feet' && tip(r) >= BL + 0.05) {
          // 足がベースに引っかかって止まる
          r.s = BL + 0.05 - FEET_REACH * Math.min(1, r.prog); r.v = 0;
        }
        if (r.v <= 0 && r.prog >= 1 && r.air <= 0) {
          r.t = 0;
          // 届かなければ滑った姿勢のまま手(足)を伸ばしてにじり寄る
          if (!r.touched) { r.crawling = true; r.crawlWait = 0.25; }
          if (r.mode === 'head') r.mode = 'down';
        }
        break;
      }
      case 'down':
        if (r.crawling && !r.touched) {
          r.crawlWait -= dt;
          if (r.crawlWait <= 0) r.s += CRAWL_V * dt;
          if (remain() <= TOUCH) touch(r);
        }
        break;
      default: break;
    }
  }
  // 今の速さで滑ったとき、塁まで何 m 手前で滑れば届くか(far: ぎりぎり届く / near: これより近いと速すぎて止まれない)
  function headPlan(v) {
    const v0 = v + HEAD_BOOST, v1 = v0 - AIR_DRAG * HEAD_AIR;
    const air = (v0 + v1) / 2 * HEAD_AIR;
    const far = air + v1 * v1 / (2 * HEAD_DEC) + HEAD_REACH - TOUCH;
    const near = air + Math.max(0, v1 * v1 - HEAD_GRIP * HEAD_GRIP) / (2 * HEAD_DEC) + HEAD_REACH - TOUCH;
    return { far, near };
  }
  function feetPlan(v) {
    const v0 = v + FEET_BOOST, v1 = v0 - AIR_DRAG * FEET_AIR;
    return { far: (v0 + v1) / 2 * FEET_AIR + v1 * v1 / (2 * FEET_DEC) + FEET_REACH - TOUCH, near: 0.6 };
  }
  function touch(r) {
    if (r.touched) return;
    r.touched = true;
    r.touchT = state.phaseT;
  }

  // ---------- 投手 ----------
  function pickoffRate(lead) {
    if (lead < 1.5) return 0;
    const k = (lead - 1.5) / 4;
    const base = { 1: 1, 2: 0.6, 3: 0.75 }[state.from];
    return state.battery.pick * base * (0.12 + 0.5 * k * k);
  }

  function updatePitcher(dt) {
    const p = state.pitcher, r = state.runner;
    p.t += dt;
    const target = B[state.from];
    if (p.mode === 'set') {
      if (p.picks < PICK_MAX && p.t > 0.6 && Math.random() < pickoffRate(r.s) * dt) startPickoff(Math.random() < state.battery.feint);
      else if (p.t >= p.setT) startDelivery();
    } else if (p.mode === 'feint') {
      // 振り向いて投げるふりをし、ホームに向き直る。そのまますぐ投球することが多い
      turnTo(p, p.t < FEINT_HOLD ? faceTo(target.x - M.x, target.y - M.y) : Math.PI, dt, 0.07);
      if (!p.faked && p.t >= PICK_TELL + 0.15) {
        p.faked = true;
        state.cue = { text: t('cue.fake'), color: '#ffab40', t: 0 };
      }
      if (p.t >= FEINT_END) {
        const h = state.fielders[HOLDER[state.from]];
        if (state.from !== 1 && h.home) h.goal = { x: h.home.x, y: h.home.y };
        const quick = Math.random() < FEINT_QUICK;
        Object.assign(p, { mode: 'set', t: 0, face: Math.PI, setT: quick ? rand(0.12, 0.4) : rand(1.2, 2.6) });
      }
    } else if (p.mode === 'pickoff') {
      turnTo(p, faceTo(target.x - M.x, target.y - M.y), dt, 0.06);
      if (!p.thrown && p.t >= p.rel) {
        p.thrown = true;
        const hold = state.fielders[HOLDER[state.from]];
        const at = hold.goal || hold;
        throwBall({ x: at.x, y: at.y }, PICK_V, 0.3, () => pickoffArrive(hold));
      }
    } else if (p.mode === 'deliver') {
      if (!p.thrown && p.t >= p.rel) {
        p.thrown = true;
        const dirt = Math.random() < 0.08;
        state.pitchDirt = dirt;
        throwBall({ x: 0, y: -0.7 }, PITCH_V, dirt ? -0.6 : 0.15, pitchArrive, dirt ? 0.25 : 0.9);
      }
    }
  }

  // 向きを少しずつ変える(遠回りしないよう角度の差を -π〜π にする)
  function turnTo(p, want, dt, tau) {
    const d = ((want - p.face) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    p.face += d * Math.min(1, dt / tau);
  }

  // 本物の牽制も偽投も、振り向くところまでは同じに見える
  function startPickoff(feint) {
    const p = state.pitcher;
    Object.assign(p, { mode: feint ? 'feint' : 'pickoff', t: 0, rel: PICK_TELL, thrown: false, faked: false, picks: p.picks + 1 });
    const h = state.fielders[HOLDER[state.from]];
    // 二塁はショートがベースに入る
    if (state.from !== 1) h.goal = nearBase(state.from, M, 0.5);
    state.cue = { text: t('cue.pick'), color: '#ff5252', t: 0 };
  }

  function pickoffArrive(f) {
    const r = state.runner;
    state.ball.holder = HOLDER[state.from];
    f.mode = 'tag'; f.t = 0;
    Sound.glove(0.7);
    later(TAG_T, () => {
      if (state.phase !== 'lead') return;
      if (backOnBase(r)) {
        popup(t('pop.backSafe'), '#b9f6ca', 30);
        Sound.cheer(0.4, 1);
        // 投手に返球して仕切り直し
        later(0.6, () => {
          f.mode = state.from === 2 ? 'stand' : 'hold'; f.t = 0;
          f.goal = { x: f.home.x, y: f.home.y };
          state.pitcher.mode = 'catch';
          throwBall({ x: M.x, y: M.y - 0.4 }, 18, 1.2, () => {
            state.ball.holder = 'pitcher';
            Object.assign(state.pitcher, { mode: 'set', t: 0, setT: rand(1.4, 3.2), face: Math.PI });
          }, 1.8);
        });
      } else {
        state.pickOuts++;
        finish(false, 'pick');
      }
    });
  }

  function startDelivery() {
    const p = state.pitcher, r = state.runner;
    const home = state.to === 0;
    Object.assign(p, { mode: 'deliver', t: 0, rel: (home ? DELIVER_HOME : DELIVER) * state.battery.quick * rand(0.96, 1.04), thrown: false });
    setPhase('run');
    // 自動でスタート(帰塁中・倒れているとスタートが遅れる)
    r.goT = REACT + (r.mode === 'back' ? 0.18 : 0) + (r.mode === 'diveBack' || r.mode === 'downBack' ? 0.55 : 0);
    r.slid = null; r.touched = false; r.overslid = false; r.air = 0; r.z = 0;
    if (r.mode !== 'back' && r.mode !== 'diveBack') r.v = 0;
    const cover = COVER[state.to];
    if (cover !== 'catcher') {
      const f = state.fielders[cover];
      f.goal = nearBase(state.to, B[0], 0.5);
      if (state.from === 1) state.fielders.p1b.mode = 'stand';
    }
    state.tagReady = false; state.judged = false; state.throwOut = false;
    state.cue = { text: t(home ? 'cue.home' : 'cue.go'), color: '#ffe14d', t: 0 };
    Sound.crowdGo();
  }

  function pitchArrive() {
    const c = state.catcher;
    state.ball.holder = 'catcher';
    c.mode = 'catch'; c.t = 0;
    Sound.glove(1);
    if (state.pitchDirt) popup(t('pop.dirt'), '#ffcc80', 28);
    const extra = state.pitchDirt ? 0.3 : 0;
    if (state.to === 0) {
      // ホームスチール: 捕ったら三塁線側に出てタッチ
      later(0.12 + extra, () => { c.goal = { x: -0.7, y: 0.6 }; c.mode = 'stand'; c.speed = 5; });
      return;
    }
    const tr = TRANSFER * state.battery.arm + extra + (state.to === 3 ? 0.3 : 0);
    later(tr - THROW_REL, () => { c.mode = 'throw'; c.t = 0; c.face = faceTo(B[state.to].x, B[state.to].y + 0.6); });
    later(tr, () => {
      state.throwOut = true;
      const f = state.fielders[COVER[state.to]];
      const bad = Math.random() < 0.06;
      let tgt = { x: f.goal ? f.goal.x : f.x, y: f.goal ? f.goal.y : f.y };
      if (bad) {
        // 悪送球: 野手が取りに行ってから戻るので遅れる
        const d = lineDir();
        tgt = { x: tgt.x - d.y * 2.6 + d.x * 1.2, y: tgt.y + d.x * 2.6 + d.y * 1.2 };
        f.goal = { x: tgt.x, y: tgt.y };
        popup(t('pop.bad'), '#ffcc80', 30);
      }
      throwBall(tgt, THROW_V / state.battery.arm, 0.5, () => {
        state.ball.holder = COVER[state.to];
        f.mode = 'catch'; f.t = 0;
        Sound.glove(0.8);
        f.goal = nearBase(state.to, B[0], 0.5);
      }, 1.1);
      later(0.3, () => { c.mode = 'stand'; });
    });
  }

  // ---------- 判定 ----------
  function updateTag() {
    if (state.phase !== 'run' || state.judged) return;
    const id = COVER[state.to], f = fielder(id), r = state.runner;
    if (state.ball.holder !== id) return;
    const spot = id === 'catcher' ? { x: -0.7, y: 0.6 } : nearBase(state.to, B[0], 0.5);
    if (!state.tagReady && Math.hypot(f.x - spot.x, f.y - spot.y) < 0.35 && !f.goal) {
      state.tagReady = true;
      state.tagT = state.phaseT + TAG_T;
      f.mode = 'tag'; f.t = 0;
    }
    if (!state.tagReady || state.phaseT < state.tagT) return;
    if (onBase(r)) { finish(true); return; }
    // 先にタッチの構えができている: ランナーが来たらアウト
    const stopped = r.v <= 0 && (r.mode === 'down' || r.mode === 'feet');
    if (r.overslid || BL - tip(r) < 1.6 || (stopped && !r.touched)) finish(false, 'cs');
  }
  // 判定がきわどくなりそうならスローモーション
  function updateSlow() {
    state.slow = 1;
    if (state.phase !== 'run' || state.judged) return;
    const r = state.runner, b = state.ball;
    const near = BL - tip(r) < 4;
    const finalThrow = state.to === 0 ? state.pitcher.thrown : state.throwOut;
    const ballClose = b.holder === COVER[state.to] || (finalThrow && b.fl && b.fl.T - b.fl.t < 0.4);
    if (near && ballClose && !r.touched) state.slow = 0.35;
  }

  function finish(safe, kind) {
    state.judged = true;
    const r = state.runner;
    const u = state.ump;
    u.call = safe ? 'safe' : 'out'; u.t = 0;
    state.slow = 1;
    state.shake = 1;
    state.result = { safe, kind: kind || (state.to === 0 ? 'home' : state.to === 2 ? 's2' : 's3') };
    if (safe) {
      state.steals++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      if (state.to === 2) state.s2++; else if (state.to === 3) state.s3++; else state.home++;
      const home = state.to === 0;
      popup(t('call.safe'), '#7dffb0', 64);
      popup(t(home ? 'pop.home' : state.to === 2 ? 'pop.s2' : 'pop.s3'), '#ffe14d', home ? 44 : 38, 0.35);
      if (state.streak > 0 && state.streak % 10 === 0) popup(t('pop.streak', { n: state.streak }), '#ff8a65', 30, 0.7);
      Sound.cheer(home ? 1.7 : 1.15, home ? 5 : 3.2);
      if (home || state.streak % 10 === 0) Sound.horn();
      fireworks(home ? 9 : state.to === 3 ? 4 : 3, home);
      later(0.5, () => { if (state.runner === r && r.mode === 'stand') r.mode = 'safe'; }); // 立ったまま着いたときはすぐガッツポーズ
    } else {
      state.streak = 0;
      if (kind === 'cs') state.csOuts++;
      popup(t('call.out'), '#ff6b6b', 64);
      popup(t(kind === 'pick' ? 'pop.pickOut' : 'pop.csOut'), '#ff9e9e', 32, 0.35);
      Sound.sigh(kind === 'pick' ? 1.2 : 1);
    }
    Sound.tag(safe);
    setPhase('result');
  }

  function fireworks(n, big, gap = 0.3) {
    for (let i = 0; i < n; i++) {
      const tt = 0.1 + i * gap + Math.random() * 0.15;
      Scene3D.firework(tt, big);
      Sound.launch(tt);
      Sound.boom(tt + Scene3D.ROCKET_T);
    }
  }

  function popup(text, color, size, delay = 0) {
    state.popups.push({ text, color, size, t: -delay, life: 1.7 });
  }

  // ゲーム内時間で動くタイマー(一時停止・スローモーションに従う)
  let timers = [];
  function later(dt, fn) { timers.push({ at: state.time + dt, fn }); }
  function runTimers() {
    const due = timers.filter((x) => x.at <= state.time);
    if (!due.length) return;
    timers = timers.filter((x) => x.at > state.time);
    for (const x of due) x.fn();
  }

  // ---------- 野手 ----------
  function updateFielders(dt) {
    const all = [...Object.values(state.fielders), state.catcher];
    for (const f of all) {
      f.t += dt;
      if (!f.home) f.home = { x: f.x, y: f.y };
      if (f.goal) {
        const dx = f.goal.x - f.x, dy = f.goal.y - f.y, d = Math.hypot(dx, dy);
        const sp = (f.speed || FIELDER_V) * dt;
        if (d <= sp) {
          f.x = f.goal.x; f.y = f.goal.y; f.goal = null; f.v = 0;
          if (f.mode === 'run') f.mode = 'stand';
        } else {
          f.x += dx / d * sp; f.y += dy / d * sp; f.v = f.speed || FIELDER_V;
          f.face = faceTo(dx, dy);
          if (f.mode !== 'catch' || f.t > 0.3) f.mode = 'run';
        }
      }
      if (!f.goal && f.mode !== 'throw') {
        // ボール(か走者)のほうを向く
        const b = state.ball;
        const tx = f === state.catcher && state.ball.holder === 'catcher' ? state.runner.x : b.holder ? holderPos(b.holder).x : b.x;
        const ty = f === state.catcher && state.ball.holder === 'catcher' ? state.runner.y : b.holder ? holderPos(b.holder).y : b.y;
        if (Math.hypot(tx - f.x, ty - f.y) > 0.5) f.face = faceTo(tx - f.x, ty - f.y);
      }
    }
  }

  // ---------- 更新 ----------
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const portraitMQ = window.matchMedia('(orientation: portrait)');
  const isPortrait = () => isTouch && portraitMQ.matches;

  function goLandscape() {
    if (!isTouch) return;
    const el = document.documentElement;
    const lock = () => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); };
    try {
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
      else lock();
    } catch (e) { /* 非対応 */ }
  }
  // タップで全画面に戻す(アプリの切り替えなどで全画面が解除されたとき、プレイ中でも戻れるように)
  canvas.addEventListener('pointerup', () => goLandscape());

  function togglePause() {
    if (state.phase === 'title' || state.phase === 'over') return;
    state.paused = !state.paused;
  }

  function update(dt) {
    state.time += dt;
    if (state.phase === 'title') {
      if (pressed.start) { pressed.start = false; newGame(); }
      return;
    }
    if (state.phase === 'over') {
      state.overT += dt;
      if (pressed.start && state.overT > 1.0) { pressed.start = false; newGame(); }
      pressed.start = false;
      return;
    }
    pressed.start = false;
    if (isPortrait()) { state.paused = true; return; }
    if (state.paused) { state.time -= dt; return; }

    readInput();
    state.phaseT += dt;
    runTimers();
    const r = state.runner;
    if (state.cue) state.cue.t += dt;
    state.shake = Math.max(0, state.shake - dt * 4);
    if (state.ump.call) state.ump.t += dt;

    if (state.phase === 'ready') {
      if (state.phaseT >= (state.from === 1 ? 1.8 : 1.3)) {
        setPhase('lead');
        Object.assign(state.pitcher, { mode: 'set', t: 0, setT: rand(2.0, 4.2) });
      }
    } else if (state.phase === 'lead') {
      updateLeadRunner(r, dt);
      updatePitcher(dt);
    } else if (state.phase === 'run') {
      updateRunRunner(r, dt);
      updatePitcher(dt);
      updateTag();
    } else if (state.phase === 'result') {
      if (r.mode === 'head' || r.mode === 'feet' || r.mode === 'run' || r.mode === 'brake') {
        // 判定後も勢いのぶんだけ滑る
        r.prog += dt / SLIDE_T;
        if (r.air > 0) {
          r.air -= dt;
          const u = 1 - Math.max(0, r.air) / r.airT;
          r.z = 4 * r.airH * u * (1 - u);
        } else {
          r.z = 0;
          r.v = Math.max(0, r.v - 14 * dt);
        }
        r.s += r.v * dt;
        if (r.mode === 'feet' && tip(r) >= BL + 0.05) r.v = 0;
      }
      if (state.phaseT > 0.9 && r.mode !== 'safe' && r.mode !== 'out' && r.v < 0.05 && !(r.air > 0)) {
        // 起き上がる。セーフならベースの上に乗る(滑った姿勢のままだと足の位置がベースの手前に残る)
        const safe = state.result.safe;
        const goal = safe && r.touched ? BL - 0.1 : Math.min(tip(r), BL + 1) - 0.3;
        r.mode = safe ? 'safe' : 'out'; r.v = 0; r.z = 0;
        r.standFrom = r.s; r.standTo = safe ? goal : Math.max(r.s, goal); r.standT = 0;
      }
      if (r.standTo != null && r.standT < 1) {
        r.standT = Math.min(1, r.standT + dt / 0.35);
        const e = 1 - (1 - r.standT) * (1 - r.standT);
        r.s = r.standFrom + (r.standTo - r.standFrom) * e;
      }
      if (state.phaseT >= 2.4) nextAfterResult();
    }
    pressed.head = pressed.feet = false;
    updateBall(dt);
    updateFielders(dt);
    updateSlow();
    placeRunner();

    for (const p of state.popups) p.t += dt;
    state.popups = state.popups.filter((p) => p.t < p.life);
  }

  function nextAfterResult() {
    const res = state.result;
    timers = [];
    if (res.safe && state.to !== 0) {
      state.from = state.to;
      state.to = (state.to + 1) % 4;
      const st = state.runner.stamina;
      state.runner = newRunner(st);
      setupField();
      placeRunner();
      setPhase('ready');
      return;
    }
    state.challenge++;
    if (state.challenge >= TOTAL) gameOver();
    else startChallenge();
  }

  function gameOver() {
    setPhase('over');
    state.overT = 0;
    const best = state.best;
    if (!best || state.steals > best.steals || (state.steals === best.steals && state.home > best.home)) {
      state.best = { steals: state.steals, home: state.home };
      state.newRecord = true;
      saveBest(state.best);
    }
    const great = state.steals >= 200;
    Sound.fanfare(great);
    Sound.cheer(great ? 1.6 : 0.8, great ? 6 : 3);
    if (great) { Sound.horn(); fireworks(16, true, 0.35); } else if (state.steals >= 120) fireworks(6, false, 0.4);
  }

  // ---------- 描画(2D オーバーレイ) ----------
  function centerText(text, y, size, color = '#fff', weight = 'bold', x = W / 2) {
    ctx.font = `${weight} ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  const BASE_NAME = { 1: 'base.1', 2: 'base.2', 3: 'base.3', 0: 'base.0' };

  function drawHUD() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(12, 12, 300, 108);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(t('hud.ch', { n: Math.min(state.challenge + 1, TOTAL), t: TOTAL }), 24, 40);
    ctx.font = 'bold 16px sans-serif';
    let hx = 24;
    for (const [key, n, col] of [['hud.steals', state.steals, '#9fe8ff'], ['hud.home', state.home, '#ffe14d'], ['hud.streak', state.streak, '#b9f6ca']]) {
      const label = t(key, { n });
      ctx.fillStyle = col;
      ctx.fillText(label, hx, 64);
      hx += Math.max(76, ctx.measureText(label).width + 14);
    }
    // 投手・捕手の特徴
    const bt = state.battery;
    if (bt) {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#e0e0e0';
      const q = bt.quick < 0.98 ? t('bat.quickFast') : bt.quick > 1.07 ? t('bat.quickSlow') : t('bat.quickMid');
      const pk = bt.pick > 1.25 ? t('bat.pickMany') : bt.pick < 0.85 ? t('bat.pickFew') : t('bat.pickMid');
      const a = bt.arm < 0.97 ? t('bat.armStrong') : bt.arm > 1.05 ? t('bat.armWeak') : t('bat.armMid');
      ctx.fillText(t('bat.line', { q, p: pk + (bt.feint > 0.33 ? t('bat.fakeMany') : ''), a }), 24, 86, 276);
    }
    // スタミナ
    const r = state.runner;
    const st = r ? r.stamina / 100 : 1;
    ctx.fillStyle = '#333';
    ctx.fillRect(24, 100, 276, 9);
    ctx.fillStyle = st > 0.5 ? '#6be37a' : st > 0.25 ? '#ffd54f' : '#ff7043';
    ctx.fillRect(24, 100, 276 * st, 9);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#ddd';
    ctx.textAlign = 'right';
    ctx.fillText(t('hud.stamina') + ` ${Math.round(st * 100)}`, 300, 96);
  }

  // 右上: ダイヤモンドの小図
  function drawDiamond() {
    const cx = W - 78, cy = 78, s = 40;
    const P = (i) => ({ x: cx + (B[i].x / 19.4) * s * 0.75, y: cy - ((B[i].y - 19.4) / 19.4) * s * 0.75 });
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx - 62, cy - 62, 124, 132);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath();
    [0, 1, 2, 3, 0].forEach((i, k) => { const p = P(i); if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const p = P(i);
      const done = (state.phase !== 'title') && ((state.to === 0 && i >= 1 && i <= 3) || (i >= 1 && i < (state.to || 4)));
      const target = i === state.to;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = target ? (Math.floor(state.time * 4) % 2 ? '#ffe14d' : '#ff9800') : done ? '#9fe8ff' : '#fff';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
    const r = state.runner;
    if (r) {
      const a = P(state.from), b = P(state.to), u = clamp(tip(r) / BL, 0, 1);
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffe14d';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t('hud.target', { b: t(BASE_NAME[state.to]) }), cx, cy + 62);
  }

  // 下中央: リード中はリードの大きさ、走っている間は塁までの距離とスライディングの目安
  function drawMeter() {
    const r = state.runner;
    if (!r || state.phase === 'ready') return;
    // 左右のボタンの間に置き、スマホでは全体を大きくする
    const left = BTN.lead.x + BTN.lead.r + 12, right = BTN.feet.x - BTN.feet.r - 12;
    const mw = clamp((right - left) / U - 20, 150, 420), mx = -mw / 2, my = -40, mh = 16;
    ctx.save();
    ctx.translate((left + right) / 2, H);
    ctx.scale(U, U);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(mx - 10, my - 34, mw + 20, mh + 46);
    ctx.textAlign = 'center';
    if (state.phase === 'lead') {
      // 危険度で色分け(大きいほど牽制が来やすい)
      const MAXM = 8;
      for (let i = 0; i < mw; i += 2) {
        const lead = i / mw * MAXM;
        const k = clamp(pickoffRate(lead) / (state.battery.pick * 0.9), 0, 1);
        ctx.fillStyle = `hsl(${120 - 120 * k}, 70%, ${lead < 1.5 ? 30 : 42}%)`;
        ctx.fillRect(mx + i, my, 2, mh);
      }
      const x = mx + clamp(r.s / MAXM, 0, 1) * mw;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(x, my - 2); ctx.lineTo(x - 7, my - 12); ctx.lineTo(x + 7, my - 12); ctx.closePath(); ctx.fill();
      ctx.fillRect(x - 1.5, my - 2, 3, mh + 4);
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(t('meter.lead', { m: r.s.toFixed(1) }), 0, my - 16);
    } else {
      // 塁までの距離(右端が塁)。今の速さで「ここで滑れば届く」範囲を表示
      const RANGE = 12;
      const X = (d) => mx + mw - clamp(d / RANGE, 0, 1) * mw;
      ctx.fillStyle = '#263238';
      ctx.fillRect(mx, my, mw, mh);
      if (!r.slid && (r.mode === 'run' || r.mode === 'brake') && r.v > 2) {
        const v = r.v;
        const hp = headPlan(v), fp = feetPlan(v);
        const headFar = hp.far, headNear = hp.near, feetFar = fp.far, feetNear = fp.near;
        ctx.fillStyle = 'rgba(105,240,174,0.65)';
        ctx.fillRect(X(feetFar), my + mh / 2, X(feetNear) - X(feetFar), mh / 2);
        ctx.fillStyle = 'rgba(255,171,64,0.85)';
        ctx.fillRect(X(headFar), my, X(headNear) - X(headFar), mh / 2);
      }
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + mw - 3, my - 4, 6, mh + 8);
      const d = BL - tip(r);
      const x = X(Math.max(0, d));
      ctx.fillStyle = '#ff5252';
      ctx.beginPath(); ctx.arc(x, my + mh / 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(d > 0.3 ? t('meter.remain', { m: Math.max(0, d).toFixed(1), b: t(BASE_NAME[state.to]) }) : t('meter.arrive'), 0, my - 16);
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffab40'; ctx.fillText(t('meter.head'), mx, my - 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#69f0ae'; ctx.fillText(t('meter.feet'), mx + mw, my - 4);
    }
    ctx.restore();
  }

  // 走っている間、スライディングの押しどきのボタンを点滅させる。
  // 点滅を見てから指が動くまで(約 0.2 秒)に進む距離のぶん早めに点滅させ、見てすぐ押せば押しどきに入るようにする
  // (メーターの帯は本当の押しどきを表示する)
  const REACT_LEAD = 0.2;
  function slideReady() {
    const r = state.runner, ready = { head: false, feet: false };
    if (state.phase !== 'run' || !r || r.slid || (r.mode !== 'run' && r.mode !== 'brake') || r.v <= 2) return ready;
    const d = BL - tip(r) - r.v * REACT_LEAD, hp = headPlan(r.v), fp = feetPlan(r.v);
    ready.head = d <= hp.far && d >= hp.near;
    ready.feet = d <= fp.far && d >= fp.near;
    return ready;
  }

  // 押しどきに入った時刻(点滅は必ず「点いた状態」から始める。ヘッドの押しどきは 0.15 秒ほどしかないため)
  const readySince = { head: null, feet: null };
  const BLINK = 0.09;

  function drawControls() {
    ctx.save();
    const ready = slideReady();
    for (const k of ['head', 'feet']) {
      if (!ready[k]) readySince[k] = null;
      else if (readySince[k] == null) readySince[k] = state.time;
    }
    for (const [name, b] of Object.entries(BTN)) {
      const on = holding(name) || (name === 'lead' && input.lead) || (name === 'dash' && input.dash);
      const active = name === 'lead' ? state.phase === 'lead'
        : name === 'dash' ? state.phase === 'run'
          : name === 'head' ? state.phase === 'run' || (state.phase === 'lead' && state.runner.s > 0.6)
            : state.phase === 'run';
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(U, U);
      const r = b.r0;
      ctx.globalAlpha = active ? 0.92 : 0.45;
      const col = { lead: '255,225,77', dash: '255,138,101', head: '255,171,64', feet: '105,240,174' }[name];
      const lit = ready[name] && Math.floor((state.time - readySince[name]) / BLINK) % 2 === 0;
      if (ready[name]) {
        // 押しどき: ボタンと光の輪を点滅させ、「今!」を出す
        ctx.globalAlpha = 1;
        if (lit) {
          ctx.save();
          ctx.shadowColor = `rgb(${col})`;
          ctx.shadowBlur = 36;
          ctx.strokeStyle = `rgb(${col})`;
          ctx.lineWidth = 9;
          ctx.beginPath(); ctx.arc(0, 0, r + 10, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
        // ヘッドスライディングは上に右上の図があるので、左側に出す
        const [nx, ny, al] = name === 'head' ? [-r - 18, 10, 'right'] : [0, -r - 18, 'center'];
        ctx.font = '900 26px sans-serif';
        ctx.textAlign = al;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(t('btn.now'), nx, ny);
        ctx.fillStyle = `rgb(${col})`;
        ctx.fillText(t('btn.now'), nx, ny);
      }
      ctx.fillStyle = on || lit ? `rgba(${col},0.95)` : 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = on || lit ? '#222' : '#fff';
      ctx.textAlign = 'center';
      const lines = t(b.label).split('\n');
      const fs = name === 'lead' ? 28 : name === 'dash' ? 24 : 17;
      ctx.font = `900 ${fs}px sans-serif`;
      const oy = name === 'lead' ? -4 : 0;
      lines.forEach((l, i) => ctx.fillText(l, 0, oy + fs * 0.35 + (i - (lines.length - 1) / 2) * (fs + 3), r * 1.8));
      if (name === 'lead') {
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(t('btn.leadSub'), 0, 30, r * 1.8);
      }
      if (!isTouch) {
        ctx.font = '11px sans-serif';
        ctx.fillText(b.key, 0, r - 10);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    let line = 0;
    for (const p of state.popups) {
      if (p.t < 0) continue;
      const a = Math.min(1, (p.life - p.t) / 0.4);
      const sc = 1 + Math.max(0, 0.25 - p.t) * 1.6;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, 205 + line * 62 - p.t * 10);
      ctx.scale(sc, sc);
      ctx.font = `900 ${p.size}px sans-serif`;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
      line++;
    }
  }

  // 「牽制!」「スタート!」を画面の上のほうに大きく出す(投手は画面の端にいることが多い)
  function drawCue() {
    const c = state.cue;
    if (!c || c.t > 0.9) return;
    const a = Math.min(1, (0.9 - c.t) / 0.3);
    ctx.save();
    ctx.globalAlpha = a;
    const sc = 1 + Math.max(0, 0.15 - c.t) * 4;
    ctx.translate(W / 2, 170); ctx.scale(sc, sc);
    ctx.font = '900 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = c.color;
    ctx.fillText(c.text, 0, 0);
    ctx.restore();
    // 投手の位置にも矢印
    const p = Scene3D.project(M.x, M.y, 2.6);
    if (!p.behind && p.x > 0 && p.x < W) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      const y = Math.max(40, p.y - 14);
      ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x - 12, y - 18); ctx.lineTo(p.x + 12, y - 18); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawTitle() {
    if (state.help) { drawHelp(); return; }
    ctx.fillStyle = 'rgba(8,14,20,0.45)';
    ctx.fillRect(0, 0, W, H);
    const k = Math.min(U, 1.4);
    // 上から: タイトル / 説明 / ベスト / タップでプレイボール / (HTML の「遊び方」ボタン: 高さ 67%〜) / 音の注意
    centerText(t('title.name'), H * 0.24, 84 * Math.min(U, 1.25), '#ffe14d', '900');
    centerText(t('title.sub'), H * 0.37, 26 * k);
    if (state.best) centerText(t('title.best', { n: state.best.steals, h: state.best.home }), H * 0.455, 22 * k, '#9fe8ff');
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(state.time * 3));
    centerText(t(isTouch ? 'title.start.touch' : 'title.start.key'), H * 0.59, 34 * k, '#ffffff');
    ctx.restore();
    centerText(t(isTouch ? 'title.sound.touch' : 'title.sound'), H * 0.865, 15 * k, '#cfd8dc', 'normal');
  }

  // 遊び方(タイトル画面の「遊び方」ボタンで開く別画面)
  function drawHelp() {
    ctx.fillStyle = 'rgba(6,10,18,0.86)';
    ctx.fillRect(0, 0, W, H);
    const k = Math.min(U, 1.4);
    centerText(t('help.title'), 62 * k, 40 * k, '#ffe14d', '900');
    const lines = [1, 2, 3, 4, 5, 6].map((i) => t(`help.${isTouch ? 'touch' : 'key'}.${i}`));
    const top = 62 * k + 30 * k, gap = Math.min(64, (H - 70 * k - top) / lines.length);
    ctx.textAlign = 'left';
    const x0 = Math.max(24, W / 2 - 560 * Math.min(k, 1.2));
    lines.forEach((l, i) => {
      const y = top + gap * (i + 0.6);
      ctx.fillStyle = '#ffe14d';
      ctx.font = `900 ${20 * k}px sans-serif`;
      ctx.fillText(String(i + 1), x0, y);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${19 * k}px sans-serif`;
      ctx.fillText(l, x0 + 34 * k, y, W - x0 * 2 - 34 * k);
    });
    centerText(t(isTouch ? 'help.close.touch' : 'help.close.key'), H - 28 * k, 20 * k, '#cfd8dc');
  }

  function setHelp(on) {
    state.help = on;
  }

  function rankOf(n) {
    if (n >= 250) return [t('rank.6'), '#ffe14d'];
    if (n >= 200) return [t('rank.5'), '#ffd54f'];
    if (n >= 150) return [t('rank.4'), '#ffb74d'];
    if (n >= 100) return [t('rank.3'), '#9fe8ff'];
    if (n >= 60) return [t('rank.2'), '#b9f6ca'];
    if (n >= 30) return [t('rank.1'), '#e0e0e0'];
    return [t('rank.0'), '#bdbdbd'];
  }

  function drawOver() {
    ctx.fillStyle = 'rgba(8,14,20,0.7)';
    ctx.fillRect(0, 0, W, H);
    // 下半分は HTML のシェア・もう一度ボタンなので上に詰める
    const k = Math.min(U, 1.3);
    centerText(t('over.title'), 62, 30 * k, '#ffffff', '900');
    centerText(t('over.steals', { n: state.steals, m: TOTAL * 3 }), 62 + 52 * k, 44 * k, '#ffe14d', '900');
    const [rank, col] = rankOf(state.steals);
    centerText(t('over.rank', { r: rank }), 62 + 88 * k, 24 * k, col);
    ctx.font = `${16 * k}px sans-serif`;
    ctx.fillStyle = '#eeeeee';
    ctx.textAlign = 'center';
    ctx.fillText(t('over.line1', { a: state.s2, b: state.s3, h: state.home }), W / 2, 62 + 116 * k);
    ctx.fillText(t('over.line2', { k: state.bestStreak, p: state.pickOuts, c: state.csOuts }), W / 2, 62 + 138 * k);
    if (state.newRecord) centerText(t('over.new'), 62 + 166 * k, 20 * k, '#ff8a65');
    else if (state.best) centerText(t('over.best', { n: state.best.steals, h: state.best.home }), 62 + 166 * k, 17 * k, '#9fe8ff');
  }

  function drawMute() {
    const { x, y, r } = MUTE;
    ctx.save();
    ctx.translate(x, y); ctx.scale(U, U); ctx.translate(-x, -y);
    if (!Sound.muted && !Sound.ready && !state.paused && state.phase !== 'title' && state.phase !== 'over') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x - 84, y + 26, 168, 24);
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('sound.tap'), x, y + 43);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 4); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x + 2, y - 10);
    ctx.lineTo(x + 2, y + 10); ctx.lineTo(x - 4, y + 4); ctx.lineTo(x - 9, y + 4);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (Sound.muted) {
      ctx.beginPath(); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 12, y + 5); ctx.moveTo(x + 12, y - 5); ctx.lineTo(x + 5, y + 5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x + 3, y, 6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 3, y, 11, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    placeMute();
    ctx.setTransform(overlayScale, 0, 0, overlayScale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.phase !== 'title') {
      if (!state.paused) drawCue();
      ctx.save(); ctx.scale(U, U); drawHUD(); ctx.restore();
      ctx.save(); ctx.translate(W, 0); ctx.scale(Math.min(U, 1.25), Math.min(U, 1.25)); ctx.translate(-W, 0); drawDiamond(); ctx.restore();
      drawMeter();
      drawControls();
      ctx.save(); ctx.translate(W / 2, 0); ctx.scale(Math.min(U, 1.25), Math.min(U, 1.25)); ctx.translate(-W / 2, 0); if (!state.paused) drawPopups(); ctx.restore();
      if (state.phase === 'ready' && !state.paused) {
        if (state.from === 1) {
          centerText(t('ready.ch', { n: state.challenge + 1 }), 230, 46, '#ffffff', '900');
          centerText(t('ready.sub'), 274, 22, '#ffcc80');
        } else {
          centerText(t(state.to === 0 ? 'ready.home' : 'ready.s3'), 250, 44, '#ffe14d', '900');
        }
      }
      if (state.slow < 1) centerText('SLOW', 120, 18, '#ffffffaa', '900');
      if (state.paused && !isPortrait()) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        centerText('PAUSE', H * 0.3, 56);
        if (!isTouch) centerText(t('pause.resume'), H * 0.3 + 40, 18);
      }
    }
    if (state.phase === 'title') drawTitle();
    if (state.phase === 'over') drawOver();
    updateShareVisibility();
    updateLegalVisibility();
    updatePauseMenu();
    drawMute();
  }

  // ---------- シェア(結果画面) ----------
  const $id = (id) => document.getElementById(id);
  const shareEl = $id('share');
  const shareUrl = () => (/^https?:/.test(location.protocol) ? location.origin + location.pathname : '');

  function shareText() {
    const [rank] = rankOf(state.steals);
    return t('share.text', { n: state.steals, h: state.home, r: rank, k: state.bestStreak, t: TOTAL });
  }
  function prepareShare() {
    const text = shareText(), url = shareUrl();
    $id('shareX').href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + (url ? '&url=' + encodeURIComponent(url) : '');
    $id('shareLine').href = 'https://line.me/R/share?text=' + encodeURIComponent(text + (url ? '\n' + url : ''));
    $id('shareMsg').textContent = t(navigator.share ? 'share.msg.image' : 'share.msg.links');
    $id('retryBtn').textContent = t('over.retryBtn') + (isTouch ? '' : ' (SPACE)');
  }
  function makeShareImage() {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 630);
    bg.addColorStop(0, '#060a1f'); bg.addColorStop(0.6, '#1d2b5c'); bg.addColorStop(1, '#b5814f');
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`; g.fillRect(Math.random() * 1200, Math.random() * 300, 2, 2); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const font = (w, sz) => `${w} ${sz}px "Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif`;
    g.fillStyle = '#9fd8ff'; g.font = font(800, 40); g.fillText(t('card.head'), 600, 70);
    const gold = g.createLinearGradient(0, 120, 0, 280);
    gold.addColorStop(0, '#fff6c4'); gold.addColorStop(0.5, '#ffd000'); gold.addColorStop(1, '#ff8a00');
    g.fillStyle = gold; g.font = font(900, 150); g.fillText(t('card.steals', { n: state.steals }), 600, 205, 1100);
    const [rank] = rankOf(state.steals);
    g.fillStyle = '#ff9d3c'; g.font = font(900, 52); g.fillText(t('card.rank', { r: rank }), 600, 335, 1100);
    g.fillStyle = '#ffffff'; g.font = font(800, 38);
    g.fillText(t('card.line1', { a: state.s2, b: state.s3, h: state.home }), 600, 420, 1100);
    g.fillText(t('card.line2', { k: state.bestStreak, t: TOTAL }), 600, 485, 1100);
    g.fillStyle = '#fff8e8'; g.font = font(700, 28); g.fillText(t('card.tags'), 600, 590);
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }
  async function shareResult() {
    const text = shareText(), url = shareUrl();
    if (navigator.share) {
      try {
        const blob = await makeShareImage();
        const file = blob && new File([blob], 'toruio-result.png', { type: 'image/png' });
        const data = { title: t('share.title'), text: text + (url ? '\n' + url : '') };
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
        await navigator.share(data);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    copyResult();
  }
  async function copyResult() {
    const url = shareUrl();
    const text = shareText() + (url ? '\n' + url : '');
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { /* 非対応 */ }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e) { /* 非対応 */ }
    }
    $id('shareMsg').textContent = t(ok ? 'share.copied' : 'share.copyFail');
  }
  $id('shareBtn').addEventListener('click', () => { audio(); shareResult(); });
  $id('shareCopy').addEventListener('click', copyResult);
  for (const ev of ['pointerdown', 'pointerup', 'keydown']) shareEl.addEventListener(ev, (e) => e.stopPropagation());
  function updateShareVisibility() {
    const show = state.phase === 'over' && state.overT > 0.6;
    if (show !== !shareEl.hidden) {
      shareEl.hidden = !show;
      if (show) prepareShare();
    }
  }
  $id('retryBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') newGame(); });
  function goTitle() {
    timers = [];
    Object.assign(state, { phase: 'title', paused: false, popups: [], runner: null });
    setupFieldIdle();
  }
  $id('titleBtn').addEventListener('click', () => { audio(); if (state.phase === 'over') goTitle(); });

  const pauseEl = $id('pauseMenu');
  for (const ev of ['pointerdown', 'pointerup']) pauseEl.addEventListener(ev, (e) => e.stopPropagation());
  $id('pauseResume').addEventListener('click', () => { audio(); goLandscape(); if (state.paused) togglePause(); });
  $id('pauseTitle').addEventListener('click', () => { audio(); if (state.paused) goTitle(); });
  function updatePauseMenu() {
    const show = state.paused && !isPortrait() && state.phase !== 'title' && state.phase !== 'over';
    if (show === pauseEl.hidden) pauseEl.hidden = !show;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.phase !== 'title' && state.phase !== 'over') state.paused = true;
      Sound.suspend();
    } else Sound.resume();
  });

  const langEl = $id('langSel');
  document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => I18N.setLang(el.dataset.lang)));
  for (const ev of ['pointerdown', 'pointerup']) langEl.addEventListener(ev, (e) => e.stopPropagation());
  I18N.onChange(() => { if (!shareEl.hidden) prepareShare(); });
  I18N.apply();
  const helpEl = $id('helpBtn');
  helpEl.addEventListener('click', () => { audio(); setHelp(true); });
  for (const ev of ['pointerdown', 'pointerup']) helpEl.addEventListener(ev, (e) => e.stopPropagation());
  function updateLegalVisibility() {
    const show = state.phase === 'title' && !state.help;
    if (show === langEl.hidden) langEl.hidden = !show;
    if (show === helpEl.hidden) helpEl.hidden = !show;
  }

  // タイトル画面用に守備陣だけ並べておく
  function setupFieldIdle() {
    state.from = 1; state.to = 2;
    state.battery = newBattery();
    setupField();
    state.runner = newRunner();
    placeRunner();
  }
  setupFieldIdle();

  // ---------- メインループ ----------
  let overlayScale = 1;
  // 音ボタン: プレイ中は上の真ん中、タイトル・結果画面では右上の角(タイトル文字と重ならないように)
  function placeMute() {
    const corner = state.phase === 'title' || state.phase === 'over';
    MUTE.x = corner ? W - 40 * U : W / 2 + 40 * U;
    MUTE.y = 36 * U;
  }
  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    W = Math.round(H * r.width / r.height);
    // スマホ(画面の高さが低い)では文字とボタンを大きくする
    U = (isTouch || r.height < 560) ? clamp(560 / r.height, 1, 1.6) : 1;
    for (const b of Object.values(BTN)) {
      b.r = b.r0 * U;
      b.x = b.left ? b.dx * U : W - b.dx * U;
      b.y = H - b.dy * U;
    }
    placeMute();
    overlayScale = (r.height / H) * dpr;
    canvas.width = Math.round(W * overlayScale);
    canvas.height = Math.round(H * overlayScale);
    Scene3D.resize(r.width, r.height, W);
  }
  Scene3D.init(document.getElementById('view'));
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now(), acc = 0;
  function frame(now) {
    const frameDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    acc += frameDt * (state.slow || 1);
    if (api.hold) acc = 0;
    while (acc >= DT) { update(DT); acc -= DT; }
    Scene3D.render(state, frameDt * (state.slow || 1));
    Sound.update(state);
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // テスト・デバッグ用フック
  const api = window.Toruio = {
    hold: false,
    state, newGame, update, DT, TOTAL, BL,
    setBot(fn) { bot = fn; },
    // テスト用: 指定の塁から始める
    startAt(from) {
      newGame();
      state.from = from; state.to = (from + 1) % 4;
      setupField(); placeRunner(); setPhase('ready');
    },
    tip, headPlan, feetPlan, slideReady,
  };
})();
