/* =============================================================================
 * AUDIO — everything is synthesised with WebAudio: no audio files.
 *  - SND:   low-level voices (tones, filtered noise, Karplus-Strong "sitar"
 *           plucks with jawari buzz, shehnai-style reed) + positional SFX.
 *  - MUSIC: a look-ahead sequencer playing dhol/tabla grooves and melodies
 *           written in sargam (S r R g G m M P d D n N).
 *  - VOICE: optional speech-synthesis barks (Hindi voice when available).
 * ========================================================================== */

const SND = {
  ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
  ks: new Map(), last: Object.create(null), canPan: false,

  /** Must run inside a user gesture (browsers block audio until then). */
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.applyVolumes();

    const len = Math.floor(c.sampleRate * 1.5);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.canPan = typeof c.createStereoPanner === 'function';

    // iOS unlock: a silent one-sample blip inside the gesture.
    const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0);
    if (MUSIC.want) MUSIC.play(MUSIC.want);
  },

  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = Settings.sfx;
    this.music.gain.value = Settings.music * 0.5;
  },

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },

  /** Route to a bus, through a stereo panner when the sound is off-centre. */
  out(bus, pan) {
    if (pan && this.canPan) {
      const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(bus); return p;
    }
    return bus;
  },
  when(o) { return o.t !== undefined ? o.t : this.ctx.currentTime + (o.at || 0); },

  tone(o) {
    const c = this.ctx, t = this.when(o);
    const { type = 'square', f0 = 440, f1 = f0, dur = 0.1, vol = 0.3, attack = 0.002, bus = this.sfx, pan = 0 } = o;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.out(bus, pan));
    osc.start(t); osc.stop(t + dur + 0.03);
  },

  noise(o) {
    const c = this.ctx, t = this.when(o);
    const { dur = 0.2, vol = 0.4, type = 'lowpass', f0 = 2000, f1 = f0, q = 0.8, attack = 0.002, bus = this.sfx, pan = 0, rate = 1 } = o;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = rate;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(bus, pan));
    s.start(t, Math.random() * 0.4, dur + 0.05);
  },

  /** Karplus-Strong plucked string; `buzz` soft-clips it toward a sitar/tanpura jawari. */
  ksBuffer(freq, dur, damp, buzz) {
    const key = `${Math.round(freq * 4)}|${dur}|${damp}|${buzz}`;
    let buf = this.ks.get(key);
    if (buf) return buf;
    const c = this.ctx, sr = c.sampleRate;
    const n = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * dur);
    buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0), ring = new Float32Array(n);
    for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx], b = ring[(idx + 1) % n];
      ring[idx] = (a + b) * 0.5 * damp;
      d[i] = a;
      idx = (idx + 1) % n;
    }
    if (buzz > 0) {
      const k = 1 + buzz * 4;
      for (let i = 0; i < len; i++) d[i] = Math.tanh(d[i] * k) * 0.75;
    }
    this.ks.set(key, buf);
    return buf;
  },

  pluck(freq, o = {}) {
    const c = this.ctx, t = this.when(o);
    const { vol = 0.3, dur = 1.3, bus = this.music, bend = 0, buzz = 0.35, damp = 0.996, pan = 0 } = o;
    const s = c.createBufferSource(); s.buffer = this.ksBuffer(freq, dur, damp, buzz);
    if (bend) {
      // meend: slide into the note from `bend` semitones below
      s.playbackRate.setValueAtTime(Math.pow(2, -bend / 12), t);
      s.playbackRate.linearRampToValueAtTime(1, t + 0.1);
    }
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.out(bus, pan)); s.start(t);
  },

  /** Shehnai-ish double reed: detuned saw + square, vibrato, nasal band-pass. */
  reed(freq, o = {}) {
    const c = this.ctx, t = this.when(o);
    const { dur = 0.3, vol = 0.16, bus = this.music, bend = 0 } = o;
    const g = c.createGain();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.1;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 5.6; lg.gain.value = freq * 0.012;
    lfo.connect(lg);
    const oscs = ['sawtooth', 'square'].map((type, i) => {
      const osc = c.createOscillator(); osc.type = type; osc.detune.value = i ? 8 : -4;
      osc.frequency.setValueAtTime(bend ? freq * Math.pow(2, -bend / 12) : freq, t);
      if (bend) osc.frequency.linearRampToValueAtTime(freq, t + 0.08);
      lg.connect(osc.frequency); osc.connect(bp); return osc;
    });
    bp.connect(lp); lp.connect(g); g.connect(this.out(bus, 0));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.035);
    g.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    for (const osc of oscs) { osc.start(t); osc.stop(t + dur + 0.1); }
    lfo.start(t); lfo.stop(t + dur + 0.1);
  },

  /** Percussion voices for the sequencer. */
  drum(kind, t, vol = 1) {
    const m = this.music;
    switch (kind) {
      case 'dhum': // dhol bass head
        this.tone({ type: 'sine', f0: 125, f1: 46, dur: 0.4, vol: 0.9 * vol, t, bus: m });
        this.noise({ dur: 0.05, vol: 0.25 * vol, type: 'lowpass', f0: 900, t, bus: m });
        break;
      case 'tak': // dhol treble stick (tilli)
        this.noise({ dur: 0.07, vol: 0.42 * vol, type: 'bandpass', f0: 3300, q: 1.4, t, bus: m });
        this.tone({ type: 'triangle', f0: 900, f1: 620, dur: 0.05, vol: 0.16 * vol, t, bus: m });
        break;
      case 'na': // tabla dayan, ringing
        this.tone({ type: 'sine', f0: 780, f1: 740, dur: 0.22, vol: 0.2 * vol, t, bus: m });
        this.tone({ type: 'sine', f0: 1560, f1: 1530, dur: 0.1, vol: 0.07 * vol, t, bus: m });
        this.noise({ dur: 0.02, vol: 0.1 * vol, type: 'highpass', f0: 3000, t, bus: m });
        break;
      case 'ge': // tabla bayan with its upward glide
        this.tone({ type: 'sine', f0: 68, f1: 112, dur: 0.45, vol: 0.55 * vol, t, bus: m });
        break;
      case 'chik': // manjira / chimta jingle
        this.noise({ dur: 0.06, vol: 0.1 * vol, type: 'highpass', f0: 7000, t, bus: m });
        this.tone({ type: 'sine', f0: 5300, dur: 0.07, vol: 0.025 * vol, t, bus: m });
        break;
      case 'clap':
        for (let i = 0; i < 3; i++) this.noise({ dur: 0.05, vol: 0.22 * vol, type: 'bandpass', f0: 1400, q: 0.8, t: t + i * 0.011, bus: m });
        break;
    }
  },

  /** Play a named effect; x/y (world px) give distance falloff and stereo pan. */
  play(name, o = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || Settings.sfx <= 0) return;
    const fx = SFX[name];
    if (!fx) return;
    const now = this.ctx.currentTime;
    const throttle = o.throttle !== undefined ? o.throttle : 0.035;
    if (this.last[name] !== undefined && now - this.last[name] < throttle) return;
    this.last[name] = now;
    let v = o.vol !== undefined ? o.vol : 1, p = 0;
    if (o.x !== undefined && Game.cam) {
      const dx = o.x - (Game.cam.x + VIEW_W / 2);
      const dy = (o.y !== undefined ? o.y : Game.cam.y + VIEW_H / 2) - (Game.cam.y + VIEW_H / 2);
      const d = Math.hypot(dx, dy * 1.4);
      v *= clamp(1.35 - d / 430, 0, 1);
      if (v < 0.03) return;
      p = clamp(dx / (VIEW_W * 0.75), -0.75, 0.75);
    }
    try { fx(v, p); } catch { /* audio must never break gameplay */ }
  },
};

/* Sound effect recipes: (volume, pan) => voices. */
const SFX = {
  shot: (v, p) => {
    SND.noise({ dur: 0.08, vol: 0.42 * v, type: 'highpass', f0: 900, pan: p });
    SND.tone({ type: 'square', f0: 280, f1: 70, dur: 0.07, vol: 0.16 * v, pan: p });
  },
  revolver: (v, p) => {
    SND.noise({ dur: 0.16, vol: 0.55 * v, type: 'lowpass', f0: 4000, f1: 500, pan: p });
    SND.tone({ type: 'square', f0: 200, f1: 50, dur: 0.12, vol: 0.22 * v, pan: p });
  },
  shotgun: (v, p) => {
    SND.noise({ dur: 0.26, vol: 0.62 * v, type: 'lowpass', f0: 3200, f1: 250, pan: p });
    SND.tone({ type: 'sine', f0: 150, f1: 40, dur: 0.2, vol: 0.5 * v, pan: p });
  },
  nail: (v, p) => {
    SND.noise({ dur: 0.035, vol: 0.28 * v, type: 'bandpass', f0: 4200, q: 2, pan: p });
    SND.tone({ type: 'square', f0: 1300, f1: 800, dur: 0.03, vol: 0.05 * v, pan: p });
  },
  enemyShot: (v, p) => {
    SND.noise({ dur: 0.07, vol: 0.28 * v, type: 'bandpass', f0: 1700, q: 0.7, pan: p });
    SND.tone({ type: 'sawtooth', f0: 190, f1: 60, dur: 0.06, vol: 0.1 * v, pan: p });
  },
  throw: (v, p) => SND.noise({ dur: 0.16, vol: 0.22 * v, type: 'bandpass', f0: 500, f1: 2600, q: 2, pan: p }),
  pour: (v, p) => SND.noise({ dur: 0.14, vol: 0.12 * v, type: 'bandpass', f0: 1800, f1: 900, q: 3, pan: p }),
  pop: (v, p) => SND.tone({ type: 'sine', f0: 500, f1: 900, dur: 0.06, vol: 0.12 * v, pan: p }),
  boom: (v, p) => {
    SND.noise({ dur: 1.1, vol: 0.85 * v, type: 'lowpass', f0: 1900, f1: 70, attack: 0.004, pan: p });
    SND.tone({ type: 'sine', f0: 95, f1: 26, dur: 0.75, vol: 0.85 * v, pan: p });
    SND.noise({ dur: 0.12, vol: 0.45 * v, type: 'highpass', f0: 2500, pan: p });
  },
  smallBoom: (v, p) => {
    SND.noise({ dur: 0.45, vol: 0.6 * v, type: 'lowpass', f0: 2400, f1: 150, pan: p });
    SND.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.3, vol: 0.5 * v, pan: p });
  },
  firework: (v, p) => {
    SND.noise({ dur: 0.5, vol: 0.35 * v, type: 'highpass', f0: 3000, f1: 1200, pan: p });
    for (let i = 0; i < 4; i++) SND.noise({ dur: 0.04, vol: 0.18 * v, type: 'highpass', f0: 5000, at: 0.08 + i * 0.07 + Math.random() * 0.04, pan: p });
  },
  hitTile: (v, p) => SND.noise({ dur: 0.05, vol: 0.16 * v, type: 'lowpass', f0: 1500, f1: 400, pan: p }),
  hitMetal: (v, p) => SND.tone({ type: 'triangle', f0: 1900, f1: 1700, dur: 0.08, vol: 0.08 * v, pan: p }),
  crumble: (v, p) => SND.noise({ dur: 0.22, vol: 0.32 * v, type: 'lowpass', f0: 2000, f1: 250, pan: p }),
  hurt: (v, p) => {
    SND.noise({ dur: 0.1, vol: 0.28 * v, type: 'bandpass', f0: 900, q: 1, pan: p });
    SND.tone({ type: 'square', f0: 320, f1: 140, dur: 0.08, vol: 0.09 * v, pan: p });
  },
  powder: (v, p) => SND.noise({ dur: 0.35, vol: 0.3 * v, type: 'bandpass', f0: 1200, f1: 400, q: 0.6, pan: p }),
  slap: (v, p) => {
    SND.noise({ dur: 0.09, vol: 0.95 * v, type: 'bandpass', f0: 2300, q: 0.9, attack: 0.001, pan: p });
    SND.noise({ dur: 0.03, vol: 0.5 * v, type: 'highpass', f0: 5200, pan: p });
    SND.tone({ type: 'triangle', f0: 420, f1: 120, dur: 0.1, vol: 0.28 * v, pan: p });
  },
  swing: (v, p) => SND.noise({ dur: 0.12, vol: 0.2 * v, type: 'bandpass', f0: 900, f1: 300, q: 1.5, pan: p }),
  jump: v => SND.tone({ type: 'square', f0: 230, f1: 460, dur: 0.09, vol: 0.06 * v }),
  land: v => SND.noise({ dur: 0.06, vol: 0.12 * v, type: 'lowpass', f0: 500 }),
  alert: (v, p) => {
    SND.tone({ type: 'square', f0: 880, dur: 0.06, vol: 0.08 * v, pan: p });
    SND.tone({ type: 'square', f0: 1320, dur: 0.08, vol: 0.08 * v, at: 0.07, pan: p });
  },
  rescue: v => {
    [0, 2, 4, 7, 12, 16].forEach((s, i) => SND.pluck(293.66 * Math.pow(2, s / 12), { vol: 0.32 * v, at: i * 0.065, bus: SND.sfx, buzz: 0.3 }));
  },
  flag: v => {
    [0, 4, 7, 12].forEach((s, i) => SND.pluck(392 * Math.pow(2, s / 12), { vol: 0.28 * v, at: i * 0.09, bus: SND.sfx }));
    SND.reed(784, { vol: 0.08 * v, dur: 0.5, at: 0.36, bus: SND.sfx });
  },
  collect: v => {
    SND.pluck(880, { vol: 0.22 * v, bus: SND.sfx, buzz: 0.1, dur: 0.6 });
    SND.pluck(1318.5, { vol: 0.18 * v, at: 0.06, bus: SND.sfx, buzz: 0.1, dur: 0.6 });
  },
  tiffin: v => [0, 7, 12].forEach((s, i) => SND.tone({ type: 'triangle', f0: 523 * Math.pow(2, s / 12), dur: 0.12, vol: 0.12 * v, at: i * 0.06 })),
  death: v => {
    SND.tone({ type: 'sawtooth', f0: 620, f1: 90, dur: 0.7, vol: 0.18 * v });
    SND.noise({ dur: 0.4, vol: 0.3 * v, type: 'lowpass', f0: 1200, f1: 200 });
  },
  special: v => {
    SND.noise({ dur: 0.4, vol: 0.3 * v, type: 'bandpass', f0: 300, f1: 3000, q: 1.5 });
    [0, 4, 7].forEach(s => SND.tone({ type: 'triangle', f0: 440 * Math.pow(2, s / 12), dur: 0.5, vol: 0.06 * v, at: 0.12 }));
  },
  horn: (v, p) => {
    for (const [at, f] of [[0, 330], [0, 415], [0.42, 330], [0.42, 415]]) {
      SND.tone({ type: 'square', f0: f, dur: 0.34, vol: 0.12 * v, at, attack: 0.02, pan: p });
    }
  },
  chop: (v, p) => SND.noise({ dur: 0.07, vol: 0.28 * v, type: 'lowpass', f0: 420, pan: p }),
  moo: (v, p) => {
    SND.tone({ type: 'sawtooth', f0: 170, f1: 112, dur: 0.95, vol: 0.12 * v, attack: 0.08, pan: p });
    SND.tone({ type: 'sine', f0: 340, f1: 220, dur: 0.9, vol: 0.05 * v, attack: 0.08, pan: p });
  },
  laser: (v, p) => SND.tone({ type: 'sawtooth', f0: 1600, f1: 260, dur: 0.14, vol: 0.08 * v, pan: p }),
  beam: (v, p) => SND.tone({ type: 'sawtooth', f0: 90, f1: 140, dur: 0.6, vol: 0.12 * v, pan: p }),
  hiss: (v, p) => SND.noise({ dur: 0.5, vol: 0.22 * v, type: 'highpass', f0: 4200, pan: p }),
  whistle: (v, p) => SND.tone({ type: 'sine', f0: 1900, f1: 900, dur: 0.5, vol: 0.06 * v, pan: p }),
  disco: v => [0, 4, 7, 11].forEach((s, i) => SND.tone({ type: 'square', f0: 330 * Math.pow(2, s / 12), dur: 0.18, vol: 0.05 * v, at: i * 0.05 })),
  cry: (v, p) => SND.tone({ type: 'triangle', f0: 700, f1: 380, dur: 0.6, vol: 0.06 * v, attack: 0.05, pan: p }),
  notify: (v, p) => { SND.tone({ type: 'sine', f0: 1046, dur: 0.07, vol: 0.08 * v, pan: p }); SND.tone({ type: 'sine', f0: 1568, dur: 0.1, vol: 0.08 * v, at: 0.07, pan: p }); },
  combo: v => { SND.drum('na', SND.ctx.currentTime, 0.9 * v); SND.drum('na', SND.ctx.currentTime + 0.07, 0.7 * v); SND.drum('ge', SND.ctx.currentTime + 0.14, 0.8 * v); },
  click: v => SND.tone({ type: 'triangle', f0: 900, f1: 1200, dur: 0.04, vol: 0.08 * v }),
  select: v => { SND.pluck(587.3, { vol: 0.25 * v, bus: SND.sfx, dur: 0.7 }); SND.pluck(880, { vol: 0.2 * v, at: 0.05, bus: SND.sfx, dur: 0.7 }); },
  bossRoar: v => {
    SND.tone({ type: 'sawtooth', f0: 80, f1: 50, dur: 1.2, vol: 0.3 * v, attack: 0.1 });
    SND.noise({ dur: 1.2, vol: 0.3 * v, type: 'lowpass', f0: 600, f1: 200, attack: 0.1 });
  },
  stomp: (v, p) => { SND.tone({ type: 'sine', f0: 70, f1: 30, dur: 0.4, vol: 0.7 * v, pan: p }); SND.noise({ dur: 0.25, vol: 0.3 * v, type: 'lowpass', f0: 600, pan: p }); },
};

/* ------------------------------------------------------------- music ------ */
const SARGAM = { S: 0, r: 1, R: 2, g: 3, G: 4, m: 5, M: 6, P: 7, d: 8, D: 9, n: 10, N: 11 };

/** "P," = lower-octave Pa, "S'" = upper Sa, "~G" = Ga with a meend slide. */
function sargamToFreq(tok, root) {
  let bend = 0;
  if (tok[0] === '~') { bend = 2; tok = tok.slice(1); }
  let semi = SARGAM[tok[0]];
  for (const ch of tok.slice(1)) semi += ch === "'" ? 12 : ch === ',' ? -12 : 0;
  return { f: root * Math.pow(2, semi / 12), bend };
}
const bars = (...rows) => rows.map(r => r.trim().split(/\s+/));

const TRACKS = {
  // Festive bhangra in 12/8 (Mixolydian-ish, like a folk tumbi riff)
  title: {
    bpm: 100, steps: 12, root: 293.66, lead: 'pluck', leadVol: 0.3, drone: true,
    drums: {
      dhum: 'x..x..x..x.o',
      tak: '..x..x..x.xx',
      chik: 'x.ox.ox.ox.o',
    },
    melody: bars(
      "S' . S' n . P m . P . . .",
      "G . m P . n S' . n P . .",
      "S' . S' n . P m . P m G .",
      "R . G m . G R . S . . .",
      "P . P n . S' R' . S' n . .",
      "P . n S' . n P . m G . .",
      "S . R G . m P . G m . R",
      "S . . . . . ~S . . . . .",
    ),
  },
  // Driving action groove in raag Bhairav flavour
  level: {
    bpm: 122, steps: 16, root: 293.66, lead: 'pluck', leadVol: 0.28, drone: true, bassVol: 0.18,
    drums: {
      dhum: 'x...x..ox...x.o.',
      tak: '..x...x...x..xx.',
      na: 'x.x.x.xxx.x.x.xx',
      ge: 'x.....x...x.....',
    },
    bass: 'x..x..x.x..x..x.',
    melody: bars(
      'P, . N, . S r G . m . G r S . . .',
      'S r G m P . d P m . G . r . S .',
      "P . d . N . S' . N d P . m G . .",
      'G m P d P m G r S . . . ~S . . .',
      "S' . N d P . d N S' . . . r' S' N d",
      'P . m G m . P d P m G r S . . .',
    ),
  },
  // Same mood, gentler: Diwali night, raag Yaman
  night: {
    bpm: 112, steps: 16, root: 261.63, lead: 'pluck', leadVol: 0.28, drone: true, bassVol: 0.15,
    drums: {
      dhum: 'x.....x.x.....x.',
      tak: '....x.......x...',
      na: 'x.xxx.x.x.xxx.x.',
      chik: '..x...x...x...x.',
    },
    bass: 'x.....x.x.....x.',
    melody: bars(
      'N, R G . M . P . M G . R . S . .',
      'G M D . N . D . P . M G . . . .',
      "M D N S' . . N D P . M . G . . .",
      'R G M G R . S . N, R S . . . . .',
    ),
  },
  // Boss: fast, Bhairavi, shehnai lead over pounding dhol
  boss: {
    bpm: 140, steps: 16, root: 293.66, lead: 'reed', leadVol: 0.12, drone: false, bassVol: 0.26,
    drums: {
      dhum: 'x.x.x..xx.x.x.xx',
      tak: '..x...x...x.x.x.',
      na: 'xxxxxxxxxxxxxxxx',
      clap: '....x.......x...',
    },
    bass: 'x.xxx.x.x.xxx.xx',
    melody: bars(
      "S' - - - n - d - P - - - d n S' -",
      "r' - S' - n - d - P - m - g - - -",
      "S - r - g - m - P - d - n - S' -",
      "r' S' n d P m g r S - - - - - - -",
    ),
  },
  victory: {
    bpm: 132, steps: 16, root: 293.66, lead: 'pluck', leadVol: 0.34, once: true,
    drums: { dhum: 'x...x...x.x.x...', tak: '..x...x.....x.xx', chik: 'x.x.x.x.x.x.x.x.' },
    melody: bars("S G P S' . . P S' R' . S' . . . . .", "G' . R' S' P . S' . . . . . . . . ."),
  },
  gameover: {
    bpm: 70, steps: 8, root: 293.66, lead: 'reed', leadVol: 0.12, once: true,
    drums: { ge: 'x.......' },
    melody: bars('P - m g - - r -', 'S - - - - - - -'),
  },
};

const MUSIC = {
  cur: null, want: null, step: 0, next: 0, timer: 0,

  play(name) {
    this.want = name;
    if (!SND.ctx) return;
    if (this.cur && this.cur.name === name) return;
    this.stop();
    const tr = TRACKS[name];
    if (!tr) return;
    this.cur = Object.assign({ name }, tr);
    this.step = 0;
    this.next = SND.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0; this.cur = null;
  },

  tick() {
    const tr = this.cur;
    if (!tr || !SND.ctx || SND.ctx.state !== 'running') return;
    const stepDur = 60 / tr.bpm / (tr.steps / 4);
    const total = tr.melody.length * tr.steps;
    while (this.next < SND.ctx.currentTime + 0.14) {
      this.playStep(tr, this.step, this.next, stepDur);
      this.next += stepDur;
      this.step++;
      if (tr.once && this.step >= total) { this.stop(); return; }
    }
  },

  playStep(tr, step, t, sd) {
    const s = step % tr.steps, bar = Math.floor(step / tr.steps);
    for (const kind in tr.drums) {
      const ch = tr.drums[kind][s];
      if (ch === 'x') SND.drum(kind, t, 1);
      else if (ch === 'o') SND.drum(kind, t, 0.5);
    }
    if (tr.drone && s === 0) {
      // Tanpura cycle: Pa, Sa', Sa', Sa — plucked across the bar
      const r = tr.root / 2, beat = sd * (tr.steps / 4);
      [r * 1.5, r * 2, r * 2, r].forEach((f, i) => SND.pluck(f, { t: t + i * beat, vol: 0.09, dur: 2.2, buzz: 0.7, damp: 0.998 }));
    }
    if (tr.bass && tr.bass[s] === 'x') {
      SND.tone({ type: 'triangle', f0: tr.root / 4, dur: sd * 1.6, vol: tr.bassVol || 0.2, t, bus: SND.music });
    }
    const row = tr.melody[bar % tr.melody.length];
    const tok = row[s];
    if (!tok || tok === '.' || tok === '-') return;
    const n = sargamToFreq(tok, tr.root);
    if (tr.lead === 'reed') {
      let len = 1;
      while (row[s + len] === '-') len++;
      SND.reed(n.f, { t, dur: sd * len, vol: tr.leadVol, bend: n.bend });
    } else {
      SND.pluck(n.f, { t, vol: tr.leadVol, bend: n.bend, buzz: 0.4 });
    }
  },
};

/* ------------------------------------------------------------- voice ------ */
const VOICE = {
  ok: typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined',
  voice: null, hindi: false, busyUntil: 0,

  init() {
    if (!this.ok) return;
    const choose = () => {
      try {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find(v => /^hi/i.test(v.lang)) || vs.find(v => /en[-_]IN/i.test(v.lang)) || null;
        this.hindi = !!this.voice && /^hi/i.test(this.voice.lang);
      } catch { /* voices unavailable */ }
    };
    choose();
    try { speechSynthesis.addEventListener('voiceschanged', choose); } catch { /* old browsers */ }
  },

  say(line, { pitch = 1, rate = 1.08, force = false } = {}) {
    if (!this.ok || !Settings.voice || !line) return;
    const now = performance.now();
    if (!force && now < this.busyUntil) return;
    try {
      const text = this.hindi && line.hi ? line.hi : line.en;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-IN';
      u.pitch = clamp(pitch, 0.1, 2); u.rate = rate;
      u.volume = clamp(Settings.sfx + 0.15, 0, 1);
      speechSynthesis.speak(u);
      this.busyUntil = now + 700 + text.length * 50;
    } catch { /* speech blocked in this frame */ }
  },

  stop() { try { if (this.ok) speechSynthesis.cancel(); } catch { /* ignore */ } },
};
