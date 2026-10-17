/* =============================================================================
 * INPUT — keyboard, multi-touch and gamepad merged into one action state.
 * Actions: left right up down jump fire special melee pause (+ 'kup': a
 * keyboard-only "up" that doubles as jump when no ladder is in reach).
 * ========================================================================== */

const KEYMAP = {
  ArrowLeft: ['left'], KeyA: ['left'],
  ArrowRight: ['right'], KeyD: ['right'],
  ArrowUp: ['up', 'kup'], KeyW: ['up', 'kup'],
  ArrowDown: ['down'], KeyS: ['down'],
  Space: ['jump'], KeyK: ['jump'], KeyZ: ['jump'],
  KeyJ: ['fire'], KeyX: ['fire'],
  KeyL: ['special'], KeyC: ['special'],
  KeyI: ['melee'], KeyV: ['melee'], KeyF: ['melee'],
  Escape: ['pause'], KeyP: ['pause'],
};

const Input = {
  cur: {}, prev: {}, keys: Object.create(null), latch: Object.create(null), lastDevice: IS_TOUCH ? 'touch' : 'keyboard',

  init() {
    addEventListener('keydown', e => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      for (const a of acts) { if (!this.keys[a]) this.latch[a] = true; this.keys[a] = true; }
      this.lastDevice = 'keyboard';
      if (Game.state === 'playing' || e.code.startsWith('Arrow') || e.code === 'Space') {
        // keep arrows/space from scrolling or re-clicking focused menu buttons mid-game
        if (Game.state === 'playing' || !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      }
    });
    addEventListener('keyup', e => {
      const acts = KEYMAP[e.code];
      if (acts) for (const a of acts) this.keys[a] = false;
    });
    addEventListener('blur', () => { this.keys = Object.create(null); });
  },

  /** Merge every device into `cur`; call once per frame before game update. */
  poll() {
    this.prev = this.cur;
    const s = {};
    for (const k in this.keys) if (this.keys[k]) s[k] = true;
    // a tap released before this frame still counts as one frame of "down"
    for (const k in this.latch) s[k] = true;
    this.latch = Object.create(null);
    for (const k in TouchUI.state) if (TouchUI.state[k]) s[k] = true;
    const pad = this.pollPad();
    for (const k in pad) if (pad[k]) s[k] = true;
    this.cur = s;
  },

  pollPad() {
    const out = {};
    if (!navigator.getGamepads) return out;
    let pads;
    try { pads = navigator.getGamepads(); } catch { return out; }
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      out.left = ax < -0.4 || b(14);
      out.right = ax > 0.4 || b(15);
      out.up = ay < -0.55 || b(12);
      out.down = ay > 0.55 || b(13);
      out.jump = b(0);
      out.fire = b(2) || b(7) || b(5);
      out.special = b(1) || b(6) || b(4);
      out.melee = b(3);
      out.pause = b(9);
      if (Object.values(out).some(Boolean)) this.lastDevice = 'pad';
      break;
    }
    return out;
  },

  down(a) { return !!this.cur[a]; },
  pressed(a) { return !!this.cur[a] && !this.prev[a]; },
  released(a) { return !this.cur[a] && !!this.prev[a]; },
  /** Swallow currently-held inputs so a menu tap doesn't fire in-game. */
  flush() { this.latch = Object.create(null); this.prev = Object.assign({}, this.cur, this.keys, TouchUI.state); },
};

/* -------------------------------------------------------- touch controls -- */
/**
 * A single full-screen layer tracks every pointer, so thumbs can slide between
 * buttons and the floating stick appears wherever the left thumb lands.
 */
const TouchUI = {
  el: null, stickBase: null, stickKnob: null, buttons: [], pointers: new Map(),
  stick: null, state: {}, visible: false, insets: { t: 0, r: 0, b: 0, l: 0 },

  init() {
    this.el = $('#touch');
    this.stickBase = $('#stick');
    this.stickKnob = $('#stick-knob');
    this.buttons = $$('#touch .tbtn').map(el => ({ el, act: el.dataset.act, x: 0, y: 0, r: 40, on: false }));
    const opts = { passive: false };
    this.el.addEventListener('pointerdown', e => this.onDown(e), opts);
    this.el.addEventListener('pointermove', e => this.onMove(e), opts);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.el.addEventListener(ev, e => this.onUp(e), opts);
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('resize', () => this.layout());
    this.layout();
  },

  readInsets() {
    const probe = $('#inset-probe');
    if (!probe) return;
    const cs = getComputedStyle(probe);
    this.insets = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  },

  layout() {
    this.readInsets();
    const W = innerWidth, H = innerHeight, ins = this.insets;
    const s = Settings.btnScale * clamp(Math.min(W, H) / 380, 0.78, 1.3);
    const R = ins.r + 14 * s, B = ins.b + 12 * s;
    // Arc of four buttons hugging the bottom-right corner
    const spots = {
      jump: [W - R - 44 * s, H - B - 46 * s, 42 * s],
      fire: [W - R - 144 * s, H - B - 36 * s, 42 * s],
      special: [W - R - 214 * s, H - B - 30 * s, 28 * s],
      melee: [W - R - 40 * s, H - B - 128 * s, 28 * s],
    };
    for (const b of this.buttons) {
      const [x, y, r] = spots[b.act];
      b.x = x; b.y = y; b.r = r;
      Object.assign(b.el.style, { left: `${x - r}px`, top: `${y - r}px`, width: `${r * 2}px`, height: `${r * 2}px` });
    }
    this.stickRadius = 52 * s;
    this.stickDead = 14 * s;
    const sb = this.stickRadius * 2;
    Object.assign(this.stickBase.style, { width: `${sb}px`, height: `${sb}px` });
    if (!this.stick) this.parkStick();
  },

  /** Idle stick sits bottom-left as a visual hint. */
  parkStick() {
    const r = this.stickRadius;
    const x = this.insets.l + 30 + r, y = innerHeight - this.insets.b - 26 - r;
    this.placeStick(x, y, x, y, true);
  },

  placeStick(ox, oy, kx, ky, idle) {
    const r = this.stickRadius;
    this.stickBase.style.transform = `translate(${ox - r}px, ${oy - r}px)`;
    this.stickKnob.style.transform = `translate(${kx - 26}px, ${ky - 26}px)`;
    this.stickBase.classList.toggle('idle', !!idle);
    this.stickKnob.classList.toggle('idle', !!idle);
  },

  setVisible(v) {
    this.visible = v;
    this.el.hidden = !v;
    if (!v) { this.pointers.clear(); this.stick = null; this.state = {}; this.paint(); }
  },

  onDown(e) {
    e.preventDefault();
    SND.init();
    Input.lastDevice = 'touch';
    try { this.el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const x = e.clientX, y = e.clientY;
    const p = { x, y, zone: 'btn' };
    if (x < innerWidth * 0.42 && !this.stick) {
      p.zone = 'stick';
      this.stick = { id: e.pointerId, ox: x, oy: y, x, y };
    }
    this.pointers.set(e.pointerId, p);
    this.recompute();
  },

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
    if (this.stick && this.stick.id === e.pointerId) {
      const st = this.stick, R = this.stickRadius;
      st.x = p.x; st.y = p.y;
      const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
      if (d > R * 1.4) { // drag the base along so the thumb never "falls off"
        st.ox = st.x - (dx / d) * R * 1.4;
        st.oy = st.y - (dy / d) * R * 1.4;
      }
    }
    this.recompute();
  },

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.stick && this.stick.id === e.pointerId) this.stick = null;
    this.recompute();
  },

  recompute() {
    const prev = this.state, s = {};
    for (const [, p] of this.pointers) {
      if (p.zone !== 'btn') continue;
      let best = null, bd = Infinity;
      for (const b of this.buttons) {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < b.r * 1.45 && d < bd) { bd = d; best = b; }
      }
      if (best) s[best.act] = true;
    }
    if (this.stick) {
      const st = this.stick, dx = st.x - st.ox, dy = st.y - st.oy;
      if (dx > this.stickDead) s.right = true;
      if (dx < -this.stickDead) s.left = true;
      if (dy < -this.stickRadius * 0.55) s.up = true;
      if (dy > this.stickRadius * 0.55) s.down = true;
    }
    for (const k of ['jump', 'fire', 'special', 'melee']) if (s[k] && !prev[k]) { vibrate(8); Input.latch[k] = true; }
    this.state = s;
    this.paint();
  },

  paint() {
    for (const b of this.buttons) {
      const on = !!this.state[b.act];
      if (on !== b.on) { b.on = on; b.el.classList.toggle('on', on); }
    }
    if (this.stick) {
      const st = this.stick, R = this.stickRadius;
      let dx = st.x - st.ox, dy = st.y - st.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      this.placeStick(st.ox, st.oy, st.ox + dx, st.oy + dy, false);
    } else if (this.stickBase) this.parkStick();
  },

  /** Special button shows remaining charges. */
  setSpecialCount(n) {
    const el = $('#tb-special-count');
    if (el && el.textContent !== String(n)) el.textContent = String(n);
  },
};
