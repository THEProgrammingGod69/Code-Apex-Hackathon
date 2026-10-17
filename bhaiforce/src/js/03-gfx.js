/* =============================================================================
 * GRAPHICS — canvas setup, the procedural humanoid sprite painter (every bhai
 * and goon is drawn from a "look" description, then outlined and cached),
 * portraits, and the Bollywood-poster text renderer used by the HUD.
 * ========================================================================== */

const Gfx = {
  cv: null, ctx: null, ui: null, uctx: null,
  scale: 1, ox: 0, oy: 0, cssW: 0, cssH: 0, dpr: 1,

  init() {
    this.cv = $('#game');
    this.ctx = this.cv.getContext('2d', { alpha: false });
    this.ui = $('#ui');
    this.uctx = this.ui.getContext('2d');
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 150));
    this.resize();
  },

  resize() {
    const W = innerWidth, H = innerHeight;
    VIEW_H = H <= 520 ? 232 : 270; // phones in landscape get a closer camera
    VIEW_W = Math.round(clamp((VIEW_H * W) / H, 360, 640) / 2) * 2;
    this.cv.width = VIEW_W;
    this.cv.height = VIEW_H;
    const scale = Math.min(W / VIEW_W, H / VIEW_H);
    this.scale = scale;
    this.ox = Math.round((W - VIEW_W * scale) / 2);
    this.oy = Math.round((H - VIEW_H * scale) / 2);
    Object.assign(this.cv.style, { left: `${this.ox}px`, top: `${this.oy}px`, width: `${VIEW_W * scale}px`, height: `${VIEW_H * scale}px` });
    this.ctx.imageSmoothingEnabled = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ui.width = Math.round(W * this.dpr);
    this.ui.height = Math.round(H * this.dpr);
    this.ui.style.width = `${W}px`;
    this.ui.style.height = `${H}px`;
    this.uctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cssW = W; this.cssH = H;
    if (typeof BG !== 'undefined') BG.onResize();
  },

  /** World (game px) → CSS px on the UI overlay. */
  toScreen(wx, wy) {
    return [(wx - Game.camX) * this.scale + this.ox, (wy - Game.camY) * this.scale + this.oy];
  },
};

/* ------------------------------------------------------- sprite painter --- */
const SPRITES = new Map();

function humanLayout(L) {
  const big = L.big ? 1 : 0;
  return {
    fw: big ? 30 : 24, fh: big ? 38 : 32, cx: big ? 14 : 11,
    groundY: big ? 36 : 30,
    lh: big ? 8 : 6, th: big ? 11 : 8, hh: big ? 8 : 7, bw: big ? 11 : 7, hw: big ? 8 : 7,
  };
}

/** Dark 1-px outline around everything opaque, Broforce-style readability. */
function outlineCanvas(c, rgb = [20, 10, 24]) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const img = g.getImageData(0, 0, w, h), d = img.data, out = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] !== 0) continue;
      const solid = (x > 0 && d[i - 1] > 0) || (x < w - 1 && d[i + 7] > 0) ||
        (y > 0 && d[i - w * 4 + 3] > 0) || (y < h - 1 && d[i + w * 4 + 3] > 0);
      if (solid) { out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = 255; }
    }
  }
  g.putImageData(new ImageData(out, w, h), 0, 0);
}

/** White silhouette of a sprite, for damage flashes. */
function flashCanvas(src) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function flipCanvas(src) {
  const c = makeCanvas(src.width, src.height), g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

/** Cached sprite lookup. pose ∈ idle run jump fall climb dance cry panic drop; arm overrides the arm pose. */
function humanSprite(L, pose, frame, arm, flip, flash) {
  const key = `${L.id}|${pose}|${frame}|${arm}|${flip ? 1 : 0}|${flash ? 1 : 0}`;
  let c = SPRITES.get(key);
  if (c) return c;
  if (flash) c = flashCanvas(humanSprite(L, pose, frame, arm, flip, false));
  else if (flip) c = flipCanvas(humanSprite(L, pose, frame, arm, false, false));
  else {
    const Y = humanLayout(L);
    c = makeCanvas(Y.fw, Y.fh);
    paintHuman(c.getContext('2d'), L, pose, frame, arm, Y);
    outlineCanvas(c);
  }
  SPRITES.set(key, c);
  return c;
}

function paintHuman(g, L, pose, frame, arm, Y) {
  const P = (x, y, w, h, c) => { if (!c || w <= 0 || h <= 0) return; g.fillStyle = c; g.fillRect(x, y, w, h); };
  const skin = L.skin, skinD = shade(skin, 0.8);
  const hair = L.hair || '#1c1414';
  const shirt = L.shirt, shirtD = shade(shirt, 0.76);
  const legSkin = L.legs === 'skin';
  const pants = legSkin ? skin : (L.pants || '#2c2c3a');
  const pantsD = shade(pants, 0.74);
  const shoes = L.shoes || '#2a1d17';
  const sleeve = L.sleeve === null ? null : (L.sleeve || shirt);
  const armC = sleeve || skin;

  let bob = 0, legA = 0, legB = 0, liftA = 0, liftB = 0, hip = 0, sit = 0;
  let arms = arm || 'aim';
  const runPhase = (frame / 6) * TAU;
  switch (pose) {
    case 'idle': bob = frame === 1 ? 1 : 0; break;
    case 'run': case 'panic':
      legA = Math.round(Math.sin(runPhase) * 3); legB = -legA;
      liftA = Math.round(Math.max(0, Math.cos(runPhase)) * 2);
      liftB = Math.round(Math.max(0, -Math.cos(runPhase)) * 2);
      bob = Math.abs(Math.sin(runPhase)) > 0.75 ? 1 : 0;
      if (pose === 'panic') arms = frame % 2 ? 'up' : 'climb';
      break;
    case 'jump': legA = 2; liftA = 3; legB = -1; liftB = 1; break;
    case 'fall': legA = 1; legB = -2; liftB = 1; break;
    case 'climb': legA = frame ? 1 : -1; legB = -legA; liftA = frame ? 2 : 0; liftB = frame ? 0 : 2; arms = 'climb'; break;
    case 'dance': hip = frame ? 1 : -1; legA = 2; legB = -2; liftA = frame ? 1 : 0; liftB = frame ? 0 : 1; arms = frame ? 'danceA' : 'danceB'; break;
    case 'cry': sit = Y.lh - 1; arms = 'cry'; break;
    case 'drop': legA = 1; legB = -1; liftA = 1; arms = 'up'; break;
  }

  const { cx, groundY } = Y;
  const hipY = groundY - Y.lh + bob + sit;
  const tTop = hipY - Y.th;
  const hTop = tTop - Y.hh;
  const tx = cx - (Y.bw >> 1) + hip;
  const hx = cx - (Y.hw >> 1) + hip + (L.big ? 1 : 0);
  const sx = cx + hip, sy = tTop + 2;
  const ex = hx + Y.hw - 2, ey = hTop + 3;

  /* back arm (mostly hidden behind the torso in side view) */
  {
    const c = shade(armC, 0.7), cs = shade(skin, 0.7);
    switch (arms) {
      case 'aim': case 'swing': P(sx - 2, sy + 1, 3, 2, c); P(sx + 1, sy + 2, 5, 2, cs); break;
      case 'up': case 'climb': { const o = arms === 'climb' && frame ? 2 : 0; P(sx - 3, sy - 3 + o, 2, 4, c); P(sx - 3, sy - 6 + o, 2, 3, cs); break; }
      case 'danceA': P(sx - 4, sy, 2, 3, c); P(sx - 5, sy + 3, 2, 3, cs); break;
      case 'danceB': P(sx - 4, sy - 3, 2, 3, c); P(sx - 5, sy - 6, 2, 3, cs); break;
      case 'cry': break;
      default: {
        const sw = pose === 'run' ? -Math.round(Math.sin(runPhase) * 2) : 0;
        P(sx - 3, sy, 2, 4, c); P(sx - 3 + sw, sy + 4, 2, 3, cs);
      }
    }
  }

  /* legs */
  const leg = (hxp, off, lift, col) => {
    const footY = groundY - lift, rows = footY - hipY;
    for (let i = 0; i < rows; i++) P(hxp + Math.round((off * (i + 1)) / rows), hipY + i, 2, 1, col);
    P(hxp + off, footY, 3, 1, shoes);
  };
  if (sit) {
    P(cx - 1, groundY - 1, 8, 2, pants); P(cx + 7, groundY - 3, 1, 3, shoes);
  } else {
    leg(cx - 2 + hip, legB, liftB, pantsD);
    leg(cx + hip, legA, liftA, pants);
  }

  /* lower garments that cover the legs */
  const skirtSpan = () => {
    const l = Math.min(cx - 2 + hip + legB, cx + hip + legA) - 1, r = Math.max(cx - 2 + hip + legB, cx + hip + legA) + 3;
    return [Math.min(l, tx), Math.max(r, tx + Y.bw)];
  };
  if (!sit && (L.outfit === 'saree' || L.lower === 'lungi' || L.lower === 'dhoti')) {
    const col = L.outfit === 'saree' ? L.shirt2 : L.lowerColor || '#e9e2cf';
    const bottom = L.outfit === 'saree' ? groundY - 1 : groundY - 3;
    const [l, r] = skirtSpan();
    for (let y = hipY - 1; y <= bottom; y++) {
      const t = (y - hipY) / (bottom - hipY + 1);
      const xl = Math.round(lerp(tx, l, t)), xr = Math.round(lerp(tx + Y.bw, r, t));
      P(xl, y, xr - xl, 1, col);
    }
    if (L.outfit === 'saree') { const [l2, r2] = skirtSpan(); P(l2, bottom, r2 - l2, 1, L.trim || '#ffcc33'); P(tx + 2, hipY + 1, 1, bottom - hipY - 1, shade(col, 0.82)); }
    if (L.lower === 'lungi') for (let y = hipY; y < bottom; y += 2) P(tx + ((y >> 1) % 2), y, Y.bw, 1, shade(col, 0.78));
    if (L.lower === 'dhoti') P(tx + 3, hipY, 1, bottom - hipY, shade(col, 0.85));
  }
  if (L.lower === 'langot' || L.lower === 'shorts') P(tx, hipY - 1, Y.bw, L.lower === 'shorts' ? 3 : 2, L.lowerColor || '#b3202a');

  /* torso */
  P(tx, tTop, Y.bw, Y.th, shirt);
  P(tx, tTop, 1, Y.th, shirtD);
  P(tx + Y.bw - 1, tTop + 1, 1, Y.th - 2, shade(shirt, 1.12));
  const midX = tx + (Y.bw >> 1);
  switch (L.outfit) {
    case 'uniform':
      P(tx, hipY - 1, Y.bw, 1, '#3b2614'); P(midX + 1, hipY - 1, 1, 1, '#e8c547');
      P(tx + 1, tTop, 3, 1, shade(shirt, 0.85)); P(midX + 1, tTop + 2, 2, 2, shade(shirt, 0.86)); P(midX + 2, tTop + 2, 1, 1, '#ffd23f');
      break;
    case 'shirt': P(midX, tTop, 2, 1, shade(shirt, 1.25)); for (let y = tTop + 2; y < hipY - 1; y += 2) P(midX + 1, y, 1, 1, shade(shirt, 1.35)); break;
    case 'vest':
      P(tx, tTop, Y.bw, 1, skin); P(tx + 1, tTop, 1, 1, shirt); P(tx + Y.bw - 2, tTop, 1, 1, shirt);
      P(midX - 1, tTop + 1, 3, 1, skin);
      if (L.towel) { for (let i = 0; i < 4; i++) P(tx + Y.bw - 3 - i, tTop + i, 2, 1, i % 2 ? '#f4f0e6' : '#c8262c'); }
      break;
    case 'jersey':
      P(tx, tTop, Y.bw, 1, L.trim || '#ff8c1a'); P(tx + Y.bw - 3, tTop + 1, 3, 1, L.trim || '#ff8c1a');
      P(midX, tTop + 3, 2, 2, '#f4f4f4');
      break;
    case 'saree':
      for (let i = 0; i < Y.th; i++) P(tx + Y.bw - 3 - Math.floor(i * 0.7), tTop + i, 3, 1, L.shirt2);
      for (let i = 0; i < Y.th; i += 2) P(tx + Y.bw - 1 - Math.floor(i * 0.7), tTop + i, 1, 1, L.trim || '#ffcc33');
      P(tx - 1, tTop + 1, 2, 5, L.shirt2);
      break;
    case 'kurta':
      P(tx, hipY, Y.bw, 3, shirt); P(tx, hipY, 1, 3, shirtD);
      P(midX, tTop, 2, 4, L.trim || shade(shirt, 0.8)); P(tx + 1, tTop, Y.bw - 2, 1, L.trim || shade(shirt, 0.8));
      break;
    case 'sweater':
      P(tx + 1, tTop + 1, Y.bw - 1, Y.th - 2, L.shirt2);
      P(midX - 1, tTop, 3, 2, shirt); P(midX, tTop + 1, 1, 1, L.shirt2);
      for (let y = tTop + 3; y < hipY - 1; y += 3) for (let x = tx + 2; x < tx + Y.bw - 1; x += 3) P(x, y, 1, 1, L.trim || '#e8d27a');
      break;
    case 'disco':
      P(midX - 1, tTop, 3, 4, skin); P(midX, tTop + 4, 1, 1, skin);
      P(midX - 2, tTop, 1, 3, '#ffffff'); P(midX + 2, tTop, 1, 3, '#ffffff');
      [[1, 2], [5, 5], [2, 6], [6, 1], [4, 7]].forEach(([a, b]) => P(tx + a, tTop + b, 1, 1, b % 2 ? '#fff6a8' : '#ffffff'));
      break;
    case 'shirtless':
      P(tx + 1, tTop + 3, 2, 1, skinD); P(tx + 4, tTop + 3, 2, 1, skinD);
      P(midX, tTop + 5, 1, 1, skinD); P(midX, tTop + 7, 1, 1, skinD);
      break;
    case 'overalls':
      P(tx + 1, tTop + 3, Y.bw - 2, Y.th - 3, L.shirt2); P(tx + 1, tTop, 1, 3, L.shirt2); P(tx + Y.bw - 2, tTop, 1, 3, L.shirt2);
      P(tx, hipY - 1, Y.bw, 1, '#6b4423'); P(tx + 2, hipY - 1, 1, 1, '#c0c0c0'); P(tx + 4, hipY - 1, 1, 1, '#d33');
      break;
    case 'school':
      P(midX, tTop, 1, 1, '#ffffff'); P(midX, tTop + 1, 1, 5, L.trim || '#c41e3a'); P(midX - 1, tTop + 1, 3, 1, L.trim || '#c41e3a');
      P(tx + 1, tTop + 2, 2, 1, '#2b4a9e');
      break;
    case 'goon':
      P(midX - 1, tTop, 3, Y.th, L.shirt2 || '#d8d0c0'); P(midX, tTop, 1, 2, skin);
      break;
    case 'camo':
      [[1, 1], [4, 3], [2, 5], [5, 6], [3, 0]].forEach(([a, b]) => P(tx + a, tTop + b, 2, 1, shade(shirt, 0.7)));
      P(tx, hipY - 1, Y.bw, 1, '#3d2b1a');
      break;
    case 'tee':
      P(midX - 1, tTop + 3, 3, 2, L.trim || shade(shirt, 1.3));
      break;
  }
  if (L.chain) { P(midX - 1, tTop + 1, 3, 1, '#ffd23f'); P(midX, tTop + 2, 1, 1, '#ffe98a'); }
  if (L.sash) for (let i = 0; i < Y.th; i++) P(tx + Math.floor(i * 0.8), tTop + i, 1, 1, L.sash);

  /* head */
  P(hx, hTop, Y.hw, Y.hh, skin);
  P(hx, hTop + Y.hh - 1, Y.hw, 1, skinD);
  P(hx + Y.hw, hTop + 3, 1, 2, skin);
  P(hx + 1, hTop + 3, 1, 2, skinD);
  if (pose === 'cry') { P(ex - 1, ey, 2, 1, '#1a1012'); P(ex, ey + 1, 1, 2, '#6ec3ff'); }
  else if (L.eyes === 'angry') { P(ex, ey, 1, 1, '#1a1012'); P(ex - 1, ey - 1, 2, 1, hair); P(ex + 1, ey - 2, 1, 1, hair); }
  else { P(ex, ey, 1, 1, '#1a1012'); P(ex - 1, ey - 1, 2, 1, L.brow || hair); }
  if (!L.mooch && !L.beard) P(ex - 1, hTop + 5, 2, 1, shade(skin, 0.58));

  switch (L.hairStyle) {
    case 'short': P(hx, hTop - 1, Y.hw, 2, hair); P(hx, hTop + 1, 2, 2, hair); break;
    case 'side':
      P(hx - 1, hTop - 2, Y.hw + 1, 3, hair); P(hx - 1, hTop + 1, 2, 3, hair);
      P(hx + 2, hTop - 2, 1, 1, shade(hair, 1.6)); P(hx + Y.hw - 2, hTop + 1, 2, 1, hair);
      break;
    case 'bald': P(hx + 2, hTop, 2, 1, shade(skin, 1.18)); P(hx, hTop + 2, 1, 2, hair); break;
    case 'combover':
      P(hx, hTop + 1, 1, 3, hair);
      for (let i = 0; i < Y.hw; i += 2) P(hx + i, hTop - 1 + (i % 4 ? 1 : 0), 2, 1, hair);
      P(hx + 2, hTop, 2, 1, shade(skin, 1.15));
      break;
    case 'bun':
      P(hx, hTop - 1, Y.hw, 2, hair); P(hx - 1, hTop, 2, 5, hair); P(hx - 3, hTop - 1, 3, 3, hair);
      P(hx + 3, hTop - 1, 1, 1, shade(hair, 1.8));
      if (L.gajra) { P(hx - 3, hTop + 2, 3, 1, '#ffffff'); P(hx - 4, hTop, 1, 2, '#ffffff'); }
      break;
    case 'afro': P(hx - 2, hTop - 4, Y.hw + 3, 5, hair); P(hx - 3, hTop - 2, 2, 6, hair); P(hx + Y.hw, hTop - 3, 2, 2, hair); break;
    case 'cap':
      P(hx, hTop - 2, Y.hw, 3, L.hat); P(hx + Y.hw - 1, hTop, 4, 1, shade(L.hat, 0.78));
      P(hx, hTop + 1, 2, 2, hair); P(hx + 2, hTop - 2, 1, 1, shade(L.hat, 1.35));
      break;
    case 'policecap':
      P(hx - 1, hTop - 3, Y.hw + 1, 3, L.hat); P(hx - 1, hTop, Y.hw + 1, 1, '#2a1f14');
      P(hx + Y.hw - 1, hTop + 1, 3, 1, '#14100c'); P(hx + 3, hTop - 2, 1, 1, '#ffd23f'); P(hx, hTop + 1, 1, 2, hair);
      break;
    case 'bandana':
      P(hx, hTop - 1, Y.hw, 2, hair); P(hx - 1, hTop + 1, Y.hw + 1, 1, L.hat);
      P(hx - 3, hTop + 1, 2, 1, L.hat); P(hx - 3, hTop + 2, 1, 2, L.hat);
      break;
    case 'hardhat':
      P(hx - 1, hTop - 3, Y.hw + 2, 3, L.hat); P(hx - 2, hTop, Y.hw + 4, 1, shade(L.hat, 0.8));
      P(hx + 2, hTop - 3, 2, 1, shade(L.hat, 1.25));
      break;
    case 'shaved': P(hx, hTop, Y.hw, 1, shade(skin, 0.72)); break;
    case 'monkeycap':
      P(hx - 1, hTop - 2, Y.hw + 1, 4, L.hat); P(hx - 1, hTop + 2, 3, 5, L.hat);
      P(hx + 2, hTop - 3, 2, 1, shade(L.hat, 1.3)); P(hx - 1, hTop + 1, Y.hw + 1, 1, shade(L.hat, 0.8));
      break;
    case 'long': P(hx - 1, hTop - 1, Y.hw + 1, 3, hair); P(hx - 2, hTop + 1, 3, 7, hair); break;
    case 'spiky':
      P(hx, hTop - 1, Y.hw, 2, hair);
      for (let i = 0; i < Y.hw; i += 2) P(hx + i, hTop - 3 + (i % 4 ? 1 : 0), 1, 2, hair);
      P(hx, hTop + 1, 2, 2, hair);
      break;
  }

  const my = hTop + 5;
  switch (L.mooch) {
    case 'thin': P(ex - 2, my, 3, 1, hair); break;
    case 'big': P(ex - 3, my, 4, 1, L.moochColor || hair); P(ex - 3, my + 1, 1, 1, L.moochColor || hair); P(ex, my + 1, 1, 1, L.moochColor || hair); break;
    case 'handlebar': {
      const mc = L.moochColor || hair;
      P(ex - 3, my, 5, 1, mc); P(ex + 2, my - 1, 1, 1, mc); P(ex - 4, my - 1, 1, 1, mc);
      break;
    }
  }
  if (L.beard === 'stubble') for (let x = hx + 2; x < hx + Y.hw; x += 2) P(x, hTop + 6, 1, 1, shade(skin, 0.6));
  if (L.beard === 'full') { P(hx + 1, hTop + 5, Y.hw - 1, 2, hair); P(hx + 2, hTop + 7, Y.hw - 3, 1, hair); }
  if (L.bindi) P(ex - 1, hTop + 1, 1, 1, '#d4002a');
  switch (L.glasses) {
    case 'specs': P(ex - 1, ey, 3, 1, '#262626'); P(ex, ey, 1, 1, '#c6ecff'); P(hx + 2, ey, ex - hx - 3, 1, '#262626'); break;
    case 'aviator': P(ex - 1, ey, 3, 2, '#161616'); P(ex, ey, 1, 1, '#5d7b93'); P(hx + 2, ey, ex - hx - 3, 1, '#c9a227'); break;
    case 'shades': P(ex - 2, ey, 4, 1, '#0e0e0e'); P(hx + 1, ey, ex - hx - 2, 1, '#0e0e0e'); break;
    case 'goggles': P(hx - 1, ey - 1, Y.hw + 1, 1, '#4a3a2a'); P(ex - 1, ey - 1, 3, 3, '#6b5a3a'); P(ex, ey, 1, 1, '#9fffd8'); break;
  }

  /* front arm + weapon */
  const W = (x, y, mode) => paintWeapon(P, L.weapon, x, y, mode);
  switch (arms) {
    case 'aim': P(sx, sy, 3, 2, armC); P(sx + 3, sy + 1, 3, 2, skin); P(sx + 6, sy + 1, 1, 2, skinD); W(sx + 6, sy + 1, 'aim'); break;
    case 'down': {
      const sw = pose === 'run' ? Math.round(Math.sin(runPhase) * 2) : 0;
      P(sx, sy, 2, 3, armC); P(sx + sw, sy + 3, 2, 3, skin);
      break;
    }
    case 'throw': P(sx - 1, sy - 2, 2, 3, armC); P(sx - 2, sy - 5, 2, 3, skin); break;
    case 'slap': P(sx, sy, 3, 2, armC); P(sx + 3, sy, 4, 2, skin); P(sx + 7, sy - 2, 2, 5, skin); P(sx + 7, sy - 2, 1, 5, skinD); break;
    case 'up': case 'climb': { const o = arms === 'climb' && !frame ? 2 : 0; P(sx, sy - 3 + o, 2, 4, armC); P(sx, sy - 6 + o, 2, 3, skin); break; }
    case 'cry': P(sx, sy, 2, 2, armC); P(sx + 1, sy - 2, 2, 2, skin); P(ex - 2, hTop + 3, 3, 2, skin); break;
    case 'danceA': P(sx + 1, sy - 2, 2, 2, armC); P(sx + 3, sy - 5, 2, 3, skin); break;
    case 'danceB': P(sx + 1, sy + 1, 2, 2, armC); P(sx + 3, sy + 3, 2, 2, skin); break;
    case 'swing': P(sx, sy, 3, 2, armC); P(sx + 3, sy + 1, 3, 2, skin); W(sx + 6, sy + 1, 'swing'); break;
    case 'raise': P(sx - 1, sy - 2, 2, 3, armC); P(sx - 1, sy - 5, 2, 3, skin); W(sx, sy - 5, 'raise'); break;
  }
}

/** Weapons drawn at the hand position (facing right). */
function paintWeapon(P, type, hx, hy, mode) {
  const metal = '#3a3e45', wood = '#7a4a24';
  switch (type) {
    case 'revolver':
      P(hx, hy - 1, 6, 2, '#6b7380'); P(hx + 1, hy - 2, 1, 1, '#9aa3ad'); P(hx, hy + 1, 2, 2, '#6b3f22'); P(hx + 2, hy - 1, 2, 2, '#4a515c');
      break;
    case 'rifle':
      P(hx - 4, hy, 4, 2, '#5a3a1e'); P(hx, hy - 1, 7, 2, '#2d2f33'); P(hx + 7, hy - 1, 3, 1, '#2d2f33');
      P(hx + 3, hy + 1, 2, 3, '#2d2f33'); P(hx + 5, hy, 2, 1, wood);
      break;
    case 'shotgun': P(hx - 3, hy, 4, 2, wood); P(hx, hy - 1, 9, 2, metal); P(hx + 4, hy + 1, 3, 1, wood); break;
    case 'lmg': P(hx - 3, hy - 1, 12, 3, '#26282c'); P(hx + 1, hy + 2, 3, 3, '#4a5a2a'); P(hx + 9, hy, 3, 1, '#26282c'); P(hx + 2, hy - 2, 4, 1, '#55595f'); break;
    case 'rocket': P(hx - 8, hy - 3, 15, 3, '#4b5a2e'); P(hx + 5, hy - 4, 2, 5, '#3a4622'); P(hx + 7, hy - 3, 2, 3, '#c33'); P(hx - 2, hy, 2, 2, '#333'); break;
    case 'chappal': P(hx, hy - 2, 2, 5, '#9b4f22'); P(hx, hy, 2, 1, '#f2c27a'); break;
    case 'kettle': P(hx, hy - 2, 5, 4, '#b9c5cd'); P(hx + 5, hy - 1, 2, 1, '#9aa8b2'); P(hx + 1, hy - 3, 3, 1, '#8f9ca6'); P(hx, hy - 2, 1, 4, '#8f9ca6'); break;
    case 'bat':
      if (mode === 'swing') { P(hx, hy, 2, 1, '#2b2b2b'); P(hx + 2, hy - 1, 10, 2, '#e8cf94'); P(hx + 2, hy, 10, 1, '#c9ad6c'); }
      else { P(hx, hy, 1, 2, '#2b2b2b'); P(hx - 1, hy - 10, 2, 10, '#e8cf94'); P(hx, hy - 10, 1, 10, '#c9ad6c'); }
      break;
    case 'paper': P(hx, hy - 2, 4, 3, '#f7f7f2'); P(hx, hy - 2, 4, 1, '#c41e3a'); break;
    case 'phone': P(hx, hy - 3, 2, 4, '#1d1d1d'); P(hx, hy - 3, 2, 3, '#7fe3ff'); break;
    case 'vinyl': P(hx, hy - 2, 4, 4, '#121212'); P(hx + 1, hy - 1, 2, 2, '#e8334a'); break;
    case 'nailgun': P(hx, hy - 1, 6, 3, '#f2c12e'); P(hx + 1, hy + 2, 2, 2, '#2f2f2f'); P(hx + 6, hy, 2, 1, '#666'); P(hx + 3, hy - 1, 1, 3, '#222'); break;
    case 'gada': {
      const gold = '#e8b928', goldD = '#a87a12';
      if (mode === 'swing') { P(hx, hy, 7, 1, wood); P(hx + 6, hy - 3, 6, 6, gold); P(hx + 6, hy - 3, 6, 1, '#ffe27a'); P(hx + 6, hy + 2, 6, 1, goldD); P(hx + 12, hy - 1, 1, 2, goldD); }
      else { P(hx - 1, hy - 6, 1, 8, wood); P(hx - 4, hy - 12, 6, 6, gold); P(hx - 4, hy - 12, 6, 1, '#ffe27a'); P(hx - 4, hy - 7, 6, 1, goldD); P(hx - 2, hy - 13, 2, 1, goldD); }
      break;
    }
    case 'lathi': for (let i = 0; i < 13; i++) P(hx - 3 + i, hy + 3 - Math.round(i * 0.75), 1, 1, i % 4 === 0 ? '#8a6a2a' : '#c7a24c'); break;
    case 'bomb': P(hx, hy - 3, 4, 4, '#7b4b22'); P(hx + 1, hy - 3, 2, 1, '#a8703a'); P(hx + 2, hy - 4, 1, 1, '#ddd'); break;
    case 'none': break;
  }
}

/** Head-and-shoulders portrait canvas for HUD and menus. */
function makePortrait(L, scale = 4) {
  const spr = humanSprite(L, 'idle', 0, 'down', false, false);
  const Y = humanLayout(L);
  const hTop = Y.groundY - Y.lh - Y.th - Y.hh;
  const sw = L.big ? 20 : 16, sh = sw;
  const sx = clamp(Y.cx - (sw >> 1) + 1, 0, Y.fw - sw), sy = Math.max(0, hTop - 5);
  const c = makeCanvas(sw * scale, sh * scale), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  return c;
}

/** Full-body sprite, scaled up, for menus. */
function makeFullBody(L, scale = 4, pose = 'idle', arm = 'aim') {
  const spr = humanSprite(L, pose, 0, arm, false, false);
  const c = makeCanvas(spr.width * scale, spr.height * scale), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(spr, 0, 0, spr.width * scale, spr.height * scale);
  return c;
}

/* ------------------------------------------------------ poster text ------- */
const FONT_DISPLAY = "'Teko', 'Impact', 'Arial Narrow', sans-serif";
const FONT_BODY = "'Baloo 2', 'Trebuchet MS', 'Segoe UI', sans-serif";

/** Bollywood-poster lettering: skewed, extruded, outlined, gradient-filled. */
function posterText(g, text, x, y, size, o = {}) {
  const { fill = ['#fff3a0', '#ff9a1f'], stroke = '#2a0a1c', align = 'center', weight = 700, skew = -0.14, depth = 0.1, font = FONT_DISPLAY, alpha = 1 } = o;
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.transform(1, 0, skew, 1, 0, 0);
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const d = Math.max(1, Math.round(size * depth));
  g.fillStyle = stroke;
  for (let i = d; i > 0; i--) g.fillText(text, i * 0.55, i);
  g.lineWidth = Math.max(2, size * 0.13);
  g.strokeStyle = stroke;
  g.strokeText(text, 0, 0);
  const grad = g.createLinearGradient(0, -size * 0.45, 0, size * 0.4);
  grad.addColorStop(0, fill[0]); grad.addColorStop(1, fill[1]);
  g.fillStyle = grad;
  g.fillText(text, 0, 0);
  g.restore();
}

/** Plain outlined text for small HUD labels. */
function hudText(g, text, x, y, size, color = '#fff', o = {}) {
  const { align = 'left', weight = 600, font = FONT_DISPLAY, stroke = 'rgba(20,6,18,0.85)', baseline = 'middle' } = o;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = baseline;
  g.lineJoin = 'round';
  g.lineWidth = Math.max(2, size * 0.18);
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}
