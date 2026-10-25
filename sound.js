'use strict';
// 目指せ盗塁王 — 球場の音(すべて Web Audio API で合成。音声ファイルは使わない)
// 歓声・ため息・どよめき・拍手・指笛・エアホーン・トランペット応援・花火の音(センターフライと同じ)
// + 送球・スライディング・タッチの音
window.Sound = (() => {
  let AC = null, master = null, noiseBuf = null;
  let ambientGain = null, oohGain = null, bandBus = null;
  let muted = false;
  const VOL = 0.7;
  // 同時に鳴る単発音の上限。超えた分は鳴らさない(音声処理が追いつかず音割れするのを防ぐ)
  const MAX_VOICES = 48;
  let voices = 0;
  const voiceEnd = () => { voices--; };
  try { muted = localStorage.getItem('toruio.muted') === '1'; } catch (e) { /* 保存できない環境 */ }
  const rand = (a, b) => a + (b - a) * Math.random();

  // ユーザー操作のたびに呼ぶ。スマホは touchend / click の中でないと音が解禁されない
  function init() {
    if (AC) {
      if (AC.state !== 'running') { AC.resume(); unlockBlip(); }
      return;
    }
    try {
      // iPhone のマナーモードでも鳴るように(iOS 17 以降)
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch (e) { /* 非対応 */ }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      AC.resume();
      unlockBlip();
      // 音が重なっても割れないよう、最後にコンプレッサー(リミッター代わり)を通す
      master = AC.createGain();
      master.gain.value = muted ? 0 : VOL;
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 8;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      master.connect(comp).connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      // 球場のざわめき(常時)
      ambientGain = loopNoise([[700, 0.6, 1], [300, 0.7, 0.6]], 0.04);
      // 打球が上がったときの「おおおー」というどよめき(打球に合わせて音量を動かす)
      oohGain = loopNoise([[520, 3, 1], [950, 4, 0.6], [2400, 5, 0.12]], 0);

      // 応援団用のバス(球場の残響つき)
      bandBus = AC.createGain();
      bandBus.gain.value = 0;
      const rev = AC.createConvolver(), len = AC.sampleRate * 1.2;
      const ir = AC.createBuffer(2, len, AC.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d2 = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      rev.buffer = ir;
      const wet = AC.createGain();
      wet.gain.value = 0.35;
      bandBus.connect(master);
      bandBus.connect(rev).connect(wet).connect(master);
    } catch (e) { AC = null; }
  }

  // 無音を一瞬鳴らして音声出力を確実に開始させる(古い iOS 対策)
  function unlockBlip() {
    try {
      const buf = AC.createBuffer(1, 1, AC.sampleRate);
      const src = AC.createBufferSource();
      src.buffer = buf;
      src.connect(AC.destination);
      src.start(0);
    } catch (e) { /* 無視 */ }
  }

  function loopNoise(bands, gain) {
    const out = AC.createGain();
    out.gain.value = gain;
    out.connect(master);
    for (const [f, q, g] of bands) {
      const src = AC.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const bp = AC.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gn = AC.createGain();
      gn.gain.value = g;
      src.connect(bp).connect(gn).connect(out);
      src.start(0, Math.random() * 1.5);
    }
    return out;
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('toruio.muted', m ? '1' : '0'); } catch (e) { /* 保存できない環境 */ }
    if (AC) master.gain.setTargetAtTime(m ? 0 : VOL, AC.currentTime, 0.05);
  }

  function noiseShot({ t = 0, dur = 0.2, type = 'bandpass', f = 1000, f2 = null, q = 1, g = 0.5, attack = 0.002, dest = master }) {
    if (!AC || voices >= MAX_VOICES) return;
    const t0 = AC.currentTime + Math.max(0, t);
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const fl = AC.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = AC.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(g, t0 + attack);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl).connect(gn).connect(dest);
    voices++; s.onended = voiceEnd;
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
  }

  function tone({ t = 0, dur = 0.2, f = 440, f2 = null, type = 'sine', g = 0.3, dest = master }) {
    if (!AC || voices >= MAX_VOICES) return;
    const t0 = AC.currentTime + Math.max(0, t);
    const o = AC.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const gn = AC.createGain();
    gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    voices++; o.onended = voiceEnd;
    o.connect(gn).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // ---------- 効果音 ----------
  // ミットに収まる「バシッ」
  function glove(level = 1) {
    noiseShot({ dur: 0.1, type: 'lowpass', f: 900, g: 0.8 * level });
    noiseShot({ dur: 0.04, type: 'highpass', f: 2500, g: 0.25 * level });
    tone({ dur: 0.1, f: 140, f2: 70, g: 0.45 * level });
  }

  // 送球の風切り音
  function whoosh(level = 1) {
    noiseShot({ dur: 0.22, f: 900, f2: 2600, q: 1.5, g: 0.06 * level, attack: 0.05 });
  }

  // 土の上を滑る「ザザーッ」
  function slide(level = 1) {
    noiseShot({ dur: 0.12, f: 500, f2: 1400, q: 1, g: 0.12 * level, attack: 0.03 });
    noiseShot({ t: 0.12, dur: 0.6, type: 'lowpass', f: 1400, f2: 300, g: 0.45 * level, attack: 0.02 });
    noiseShot({ t: 0.14, dur: 0.5, type: 'bandpass', f: 3000, f2: 1200, q: 0.7, g: 0.12 * level, attack: 0.02 });
  }

  // タッチ / 判定の瞬間
  function tag(safe) {
    noiseShot({ dur: 0.08, type: 'lowpass', f: 700, g: 0.6 });
    tone({ dur: 0.12, f: safe ? 520 : 180, f2: safe ? 780 : 120, type: 'triangle', g: 0.12 });
  }

  // スタートを切った瞬間の「おおっ」
  function crowdGo() {
    if (!AC) return;
    noiseShot({ dur: 0.6, f: 700, f2: 1100, q: 2, g: 0.18, attack: 0.08 });
  }

  // 歓声: 帯域の違うノイズのうねり + 拍手 + 指笛
  function cheer(level, dur) {
    if (!AC) return;
    const t0 = AC.currentTime;
    for (const [f, q, g] of [[900, 0.7, 0.5], [1800, 0.9, 0.3], [400, 0.8, 0.35]]) {
      const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const fl = AC.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      const gn = AC.createGain(); gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(g * level, t0 + 0.3);
      for (let t = 0.5; t < dur; t += 0.25) gn.gain.setTargetAtTime(g * level * rand(0.65, 1.1), t0 + t, 0.12);
      gn.gain.setTargetAtTime(0.0001, t0 + dur, 0.6);
      s.connect(fl).connect(gn).connect(master); s.start(t0, Math.random()); s.stop(t0 + dur + 3);
    }
    const claps = Math.min(36, Math.floor(dur * 10 * level));
    for (let i = 0; i < claps; i++) noiseShot({ t: rand(0.15, dur + 0.8), dur: 0.035, type: 'highpass', f: rand(1500, 3500), g: rand(0.04, 0.12) * level });
    for (let i = 0; i < Math.round(5 * level); i++) {
      const t = rand(0.2, dur), f = rand(1900, 2800);
      tone({ t, dur: 0.25, f, f2: f * 1.3, g: 0.05 });
      tone({ t: t + 0.3, dur: 0.35, f: f * 1.25, f2: f * 0.9, g: 0.05 });
    }
  }

  // ため息「あー…」: 何人分もの声を母音「あ」のフォルマントに通して下降させる
  function sigh(level = 1) {
    if (!AC) return;
    const t0 = AC.currentTime + 0.05, dur = 1.5;
    const out = AC.createGain(); out.gain.value = 0.55 * level;
    for (const [f, q, g] of [[800, 6, 1], [1200, 7, 0.55], [2600, 8, 0.18]]) {
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const fg = AC.createGain(); fg.gain.value = g;
      out.connect(bp).connect(fg).connect(master);
    }
    for (let i = 0; i < 8; i++) {
      const f0 = rand(110, 280), st = t0 + rand(0, 0.12), d = dur * rand(0.8, 1.1);
      const o = AC.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.08, st);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72, st + d);
      const vib = AC.createOscillator(); vib.frequency.value = rand(4, 6.5);
      const vg = AC.createGain(); vg.gain.value = f0 * 0.015;
      vib.connect(vg).connect(o.frequency);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.06, st + 0.12);
      g.gain.setTargetAtTime(0.045, st + 0.2, 0.3);
      g.gain.setTargetAtTime(0.0001, st + d * 0.6, d * 0.2);
      o.connect(g).connect(out);
      o.start(st); vib.start(st); o.stop(st + d + 0.6); vib.stop(st + d + 0.6);
    }
  }

  // エアホーン「パッ・パッ・パーーー」
  function horn(pattern = [[0, 0.16], [0.24, 0.16], [0.48, 0.9]]) {
    if (!AC) return;
    for (const [t, dur] of pattern) {
      const t0 = AC.currentTime + t;
      const out = AC.createGain();
      out.gain.setValueAtTime(0.0001, t0);
      out.gain.exponentialRampToValueAtTime(0.16, t0 + 0.025);
      out.gain.setTargetAtTime(0.12, t0 + 0.05, 0.1);
      out.gain.setTargetAtTime(0.0001, t0 + dur, 0.04);
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 2;
      lp.connect(out).connect(master);
      [311, 392, 466, 622].forEach((f, i) => {
        const o = AC.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.94, t0);
        o.frequency.exponentialRampToValueAtTime(f, t0 + 0.04);
        o.detune.value = i % 2 ? 7 : -7;
        o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.3);
      });
    }
  }

  // 花火の打ち上げと破裂
  function launch(t = 0) {
    tone({ t, dur: 0.8, f: 400, f2: 1500, type: 'sine', g: 0.03 });
    noiseShot({ t, dur: 0.7, type: 'highpass', f: 3000, g: 0.05, attack: 0.1 });
  }
  function boom(t = 0) {
    noiseShot({ t, dur: 1.1, type: 'lowpass', f: 400, f2: 60, g: 0.8, attack: 0.005 });
    tone({ t, dur: 0.6, f: 90, f2: 35, g: 0.45 });
    for (let i = 0; i < 5; i++) noiseShot({ t: t + rand(0.25, 1.3), dur: 0.03, type: 'highpass', f: 5000, g: rand(0.04, 0.12) });
  }

  // ---------- トランペット応援(オリジナル曲) ----------
  const EIGHTH = 60 / 144 / 2; // 144BPM の8分音符
  // [音(MIDI), 長さ(8分音符の数)]  0 は休符
  const MELODY = [
    [72, 2], [72, 1], [74, 1], [76, 2], [72, 2],
    [79, 3], [0, 1], [79, 2], [0, 2],
    [77, 1], [76, 1], [74, 2], [76, 1], [77, 1], [79, 2],
    [76, 4], [0, 4],
    [81, 2], [81, 1], [79, 1], [77, 2], [76, 2],
    [74, 1], [76, 1], [77, 2], [74, 2], [0, 2],
    [72, 1], [74, 1], [76, 2], [79, 2], [83, 2],
    [84, 4], [0, 4],
  ];
  const STEPS = (() => {
    const steps = [];
    let pos = 0;
    for (const [n, l] of MELODY) { steps[pos] = { note: n, len: l }; pos += l; }
    const melodyLen = pos, LOOP = melodyLen + 16;
    for (let i = 0; i < LOOP; i++) {
      steps[i] = steps[i] || {};
      if (i < melodyLen) { steps[i].drum = i % 2 === 0; steps[i].clap = i % 2 === 0; }
    }
    // 間奏: 太鼓とメガホンの「ドン・ドン・ドドドン」
    for (const k of [0, 2, 4, 5, 6, 8, 10, 12, 13, 14]) { steps[melodyLen + k].drum = true; steps[melodyLen + k].clap = true; }
    return steps;
  })();
  const band = { on: false, next: 0, i: 0, level: -1 };

  function brass(t0, midi, dur, g, dest = bandBus, detunes = [-7, 7]) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const out = AC.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(g, t0 + 0.03);
    out.gain.setTargetAtTime(g * 0.7, t0 + 0.05, 0.08);
    out.gain.setTargetAtTime(0.0001, t0 + dur - 0.05, 0.025);
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(f * 1.5, t0);
    lp.frequency.exponentialRampToValueAtTime(f * 7, t0 + 0.04);
    lp.frequency.setTargetAtTime(f * 4, t0 + 0.07, 0.1);
    lp.connect(out).connect(dest);
    for (const d of detunes) {
      const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const st = t0 + Math.random() * 0.015;
      o.detune.setValueAtTime(d - 50, st); o.detune.linearRampToValueAtTime(d, st + 0.05);
      o.connect(lp); o.start(st); o.stop(t0 + dur + 0.3);
    }
  }
  function drum(t0, g) {
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.25);
    const gn = AC.createGain(); gn.gain.setValueAtTime(g, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
    o.connect(gn).connect(bandBus); o.start(t0); o.stop(t0 + 0.4);
    noiseShot({ t: t0 - AC.currentTime, dur: 0.08, type: 'lowpass', f: 300, g: g * 0.5, dest: bandBus });
  }
  function clap(t0) {
    for (let k = 0; k < 2; k++) noiseShot({ t: t0 - AC.currentTime + rand(0, 0.03), dur: 0.05, f: rand(1200, 2200), q: 0.8, g: rand(0.08, 0.14), dest: bandBus });
  }
  function bandStart() { if (!AC || band.on) return; band.on = true; band.i = 0; band.next = AC.currentTime + 0.3; band.level = -1; }
  function bandStop() { band.on = false; if (bandBus) bandBus.gain.setTargetAtTime(0, AC.currentTime, 0.3); }

  // 勝利のファンファーレ
  function fanfare(perfect) {
    if (!AC) return;
    const seq = perfect
      ? [[72, 1], [76, 1], [79, 1], [84, 3], [79, 1], [84, 6]]
      : [[67, 1], [72, 1], [76, 1], [79, 4]];
    let t = AC.currentTime + 0.2;
    const e = 0.16;
    for (const [n, l] of seq) {
      const dur = l * e;
      brass(t, n, dur, 0.09, master);
      brass(t, n - 12, dur, 0.035, master);
      t += dur;
    }
  }
  // ---------- 毎フレーム: 応援の音量とどよめき ----------
  function update(state) {
    if (!AC) return;
    const now = AC.currentTime;
    const playing = state.phase === 'ready' || state.phase === 'lead' || state.phase === 'run' || state.phase === 'result';
    if (playing) bandStart(); else if (band.on) bandStop();

    // 走っている間は応援を絞ってどよめきを主役に
    let level = 1;
    if (state.phase === 'lead') level = 0.6;
    if (state.phase === 'run') level = 0.25;
    if (state.phase === 'result') level = state.result && state.result.safe ? 0.4 : 0.2;
    if (state.paused) level = 0;
    if (band.on && level !== band.level) { band.level = level; bandBus.gain.setTargetAtTime(0.3 * level, now, 0.15); }
    if (band.on) {
      if (band.next < now) band.next = now + 0.05; // タブ復帰時などの遅れを捨てる
      while (band.next < now + 0.3) {
        const st = STEPS[band.i], t = band.next;
        if (st.note) { brass(t, st.note, st.len * EIGHTH, 0.2); brass(t, st.note - 12, st.len * EIGHTH, 0.06, bandBus, [0]); }
        if (st.drum) drum(t, 0.5);
        if (st.clap) clap(t);
        band.next += EIGHTH;
        band.i = (band.i + 1) % STEPS.length;
      }
    }

    // どよめき: リードが大きいほど、走者が塁に近づくほど大きく
    let ooh = 0;
    const r = state.runner;
    if (r && !state.paused) {
      if (state.phase === 'lead') ooh = Math.max(0, r.s - 2) * 0.025;
      if (state.phase === 'run') {
        const prog = Math.min(1, Math.max(0, r.s / 27.43));
        ooh = 0.08 + 0.32 * prog * prog;
        if (state.to === 0) ooh *= 1.3;
      }
    }
    oohGain.gain.setTargetAtTime(ooh, now, state.phase === 'run' ? 0.2 : 0.3);
    ambientGain.gain.setTargetAtTime(state.paused ? 0.01 : 0.04, now, 0.3);
  }

  for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, init, { capture: true, passive: true });
  }

  // アプリが裏に回ったときや広告の表示中は音を止める
  function suspend() { if (AC && AC.state === 'running') AC.suspend(); }
  function resume() { if (AC && AC.state === 'suspended') AC.resume(); }

  return {
    init, update, setMuted, suspend, resume,
    get muted() { return muted; },
    get ready() { return !!AC && AC.state === 'running'; },
    glove, whoosh, slide, tag, crowdGo, cheer, sigh, horn, launch, boom, fanfare,
  };
})();
