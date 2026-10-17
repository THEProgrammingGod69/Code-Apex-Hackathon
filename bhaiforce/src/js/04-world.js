/* =============================================================================
 * WORLD — destructible tile map. Two layers (foreground + background wall),
 * procedural pixel textures per theme, cached 16×16-tile chunks that re-render
 * only when something in them breaks, and a decal layer for Holi stains and
 * scorch marks.
 * ========================================================================== */

const T = {
  AIR: 0, DIRT: 1, BRICK: 2, WOOD: 3, STEEL: 4, ROCK: 5, CONCRETE: 6, ROOF: 7,
  PLANK: 8, LADDER: 9, CRATE: 10, SANDBAG: 11, SNOW: 12, STONE: 13, PAINT: 14,
};
const TILE_COUNT = 15;

/* hp: hits to break · armor: multiplier on bullet damage · soil: grows a top cap */
const TINFO = [];
TINFO[T.AIR] = { solid: false, hp: 0 };
TINFO[T.DIRT] = { solid: true, hp: 3, soil: true, debris: 'dirt' };
TINFO[T.BRICK] = { solid: true, hp: 6, debris: 'brick' };
TINFO[T.WOOD] = { solid: true, hp: 3, debris: 'wood' };
TINFO[T.STEEL] = { solid: true, hp: 26, armor: 0.12, debris: 'steel' };
TINFO[T.ROCK] = { solid: true, hp: Infinity, debris: 'rock' };
TINFO[T.CONCRETE] = { solid: true, hp: 9, debris: 'concrete' };
TINFO[T.ROOF] = { solid: true, hp: 2, debris: 'roof' };
TINFO[T.PLANK] = { solid: false, oneWay: true, hp: 2.5, debris: 'wood' };
TINFO[T.LADDER] = { solid: false, climb: true, hp: 1.5, debris: 'ladder' };
TINFO[T.CRATE] = { solid: true, hp: 2, loot: true, debris: 'wood' };
TINFO[T.SANDBAG] = { solid: true, hp: 5, debris: 'sandbag' };
TINFO[T.SNOW] = { solid: true, hp: 2, soil: true, debris: 'snow' };
TINFO[T.STONE] = { solid: true, hp: 8, debris: 'stone' };
TINFO[T.PAINT] = { solid: true, hp: 5, debris: 'paint' };

/* ------------------------------------------------------------ themes ------ */
const THEMES = {
  mumbai: {
    dirt: ['#5a3b2b', '#6d4733', '#4a2f22', '#86624a'], top: ['#4c9a3a', '#2f6e24', '#73c653'],
    brick: ['#a1452f', '#b5543a', '#8e3a28'], mortar: '#cdb79a', brickStyle: 'brick',
    concrete: ['#8f8b85', '#9d9891', '#7d7972'], streak: '#5f5b55',
    wood: ['#8a5a32', '#7a4d2a', '#9b6a3e'], steel: ['#5f6b75', '#7d8b96', '#46505a'],
    roof: 'tarp', roofCol: ['#2f6fd6', '#2559b0', '#5a95f2'],
    rock: ['#2e2a2b', '#3a3536', '#242122'], stone: ['#77706a', '#8a837c', '#5f5953'],
    sandbag: ['#b49a6a', '#9f8657'], paint: ['#78c4a3', '#5aa688', '#e7e1d0'],
    ladder: '#c9b458', snow: ['#e8f0f8', '#c8d8e8'],
  },
  desert: {
    dirt: ['#c98f4f', '#b97f42', '#d9a364', '#a86e36'], top: ['#f0c27a', '#d9a35a', '#ffe0a0'],
    brick: ['#d39a52', '#c58a45', '#e0ab66'], mortar: '#8a5a2a', brickStyle: 'block',
    concrete: ['#d8b98a', '#ccab7a', '#e5c89a'], streak: '#b08c5c',
    wood: ['#7d4f2a', '#6d4322', '#8e5c33'], steel: ['#6a6157', '#857a6d', '#4c453e'],
    roof: 'tile', roofCol: ['#b5482c', '#93361f', '#d3623f'],
    rock: ['#5a3b24', '#6d4a2e', '#48301e'], stone: ['#d7a868', '#c79858', '#e8bd80'],
    sandbag: ['#cfb27a', '#b89a62'], paint: ['#e58fa0', '#cf7486', '#f3e3c4'],
    ladder: '#b88a48', snow: ['#e8f0f8', '#c8d8e8'],
  },
  diwali: {
    dirt: ['#3f2c2a', '#4c3633', '#332322', '#5d4540'], top: ['#3d5a2a', '#2c4520', '#58803a'],
    brick: ['#8a3a2c', '#9c4634', '#76301f'], mortar: '#a08a76', brickStyle: 'brick',
    concrete: ['#6e6865', '#7b7572', '#5e5856'], streak: '#4a4542',
    wood: ['#6e4426', '#5e381e', '#7d4f2e'], steel: ['#4f5864', '#68727f', '#3a424c'],
    roof: 'tin', roofCol: ['#8f969c', '#6d7378', '#b0b6ba'],
    rock: ['#221d22', '#2c262c', '#1b171b'], stone: ['#6a625d', '#7a716b', '#58514c'],
    sandbag: ['#8f7c56', '#7a6947'], paint: ['#d9b85c', '#bf9c45', '#efe0b0'],
    ladder: '#a89448', snow: ['#e8f0f8', '#c8d8e8'],
  },
  snow: {
    dirt: ['#5b5450', '#6a625d', '#4c4643', '#7c746e'], top: ['#f2f7fc', '#cddcea', '#ffffff'],
    brick: ['#7f7a78', '#8d8885', '#6f6a68'], mortar: '#4f4a48', brickStyle: 'stone',
    concrete: ['#9aa0a6', '#a8aeb4', '#8a9096'], streak: '#7a8086',
    wood: ['#8b4b2b', '#7a3f22', '#9c5a36'], steel: ['#58646e', '#71808b', '#414b54'],
    roof: 'tile', roofCol: ['#3b6e5e', '#2d574a', '#4f8a77'],
    rock: ['#2a2d33', '#353941', '#22252a'], stone: ['#8e8a86', '#a09b96', '#77736f'],
    sandbag: ['#9c9576', '#857e62'], paint: ['#c5452f', '#a73822', '#f0e6d8'],
    ladder: '#a07a48', snow: ['#eef4fa', '#c9d8e6'],
  },
};

/* -------------------------------------------------- texture generation ---- */
function paintTileTexture(g, t, theme, r) {
  const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const speckle = (n, cols) => { for (let i = 0; i < n; i++) P(r.int(0, 15), r.int(0, 15), 1, 1, r.pick(cols)); };
  switch (t) {
    case T.DIRT: {
      const d = theme.dirt;
      P(0, 0, 16, 16, d[0]); speckle(28, [d[1], d[2]]);
      for (let i = 0; i < 3; i++) { const x = r.int(0, 13), y = r.int(0, 14); P(x, y, 2, 1, d[3]); P(x, y + 1, 2, 1, shade(d[2], 0.9)); }
      break;
    }
    case T.SNOW: {
      const s = theme.snow;
      P(0, 0, 16, 16, s[0]); speckle(20, [s[1]]);
      for (let i = 0; i < 3; i++) P(r.int(1, 14), r.int(1, 14), 1, 1, '#ffffff');
      break;
    }
    case T.BRICK: case T.STONE: {
      const style = t === T.STONE ? 'stone' : theme.brickStyle;
      const cols = t === T.STONE ? theme.stone : theme.brick;
      const mortar = t === T.STONE ? shade(theme.stone[2], 0.7) : theme.mortar;
      P(0, 0, 16, 16, mortar);
      if (style === 'brick') {
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 4 : 0;
          for (let bx = -off; bx < 16; bx += 8) {
            const c = r.pick(cols);
            P(bx, row * 4, 7, 3, c); P(bx, row * 4, 7, 1, shade(c, 1.14));
            if (r.chance(0.3)) P(bx + r.int(1, 5), row * 4 + 1, 1, 1, shade(c, 0.8));
          }
        }
      } else if (style === 'block') {
        for (let row = 0; row < 2; row++) {
          const off = row % 2 ? 6 : 0;
          for (let bx = -off; bx < 16; bx += 12) {
            const c = r.pick(cols);
            P(bx, row * 8, 11, 7, c); P(bx, row * 8, 11, 1, shade(c, 1.12)); P(bx, row * 8 + 6, 11, 1, shade(c, 0.85));
            for (let i = 0; i < 4; i++) P(bx + r.int(1, 9), row * 8 + r.int(1, 5), 1, 1, shade(c, 0.9));
          }
        }
      } else {
        const rects = [[0, 0, 7, 6], [8, 0, 8, 5], [0, 7, 5, 4], [6, 6, 10, 5], [0, 12, 9, 4], [10, 12, 6, 4]];
        for (const [x, y, w, h] of rects) {
          const c = r.pick(cols);
          P(x, y, w - 1, h - 1, c); P(x, y, w - 1, 1, shade(c, 1.15)); P(x + w - 2, y + 1, 1, h - 2, shade(c, 0.82));
        }
      }
      break;
    }
    case T.WOOD: {
      const w = theme.wood;
      for (let row = 0; row < 4; row++) {
        const c = r.pick(w);
        P(0, row * 4, 16, 4, c); P(0, row * 4 + 3, 16, 1, shade(c, 0.6));
        for (let i = 0; i < 3; i++) P(r.int(0, 12), row * 4 + r.int(0, 2), r.int(2, 4), 1, shade(c, 0.85));
        P(1, row * 4 + 1, 1, 1, '#2a2420'); P(14, row * 4 + 1, 1, 1, '#2a2420');
      }
      break;
    }
    case T.STEEL: {
      const s = theme.steel;
      P(0, 0, 16, 16, s[0]); P(0, 0, 16, 1, s[1]); P(0, 0, 1, 16, s[1]); P(0, 15, 16, 1, s[2]); P(15, 0, 1, 16, s[2]);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { P(x, y, 1, 1, s[1]); P(x + 1, y + 1, 1, 1, s[2]); }
      for (let i = 0; i < 6; i++) P(4 + i, 11 - i, 1, 1, shade(s[0], 1.15));
      break;
    }
    case T.ROCK: {
      const k = theme.rock;
      P(0, 0, 16, 16, k[0]);
      for (let i = 0; i < 4; i++) { const x = r.int(0, 11), y = r.int(0, 11); P(x, y, r.int(3, 5), r.int(2, 4), k[1]); }
      speckle(12, [k[2]]);
      break;
    }
    case T.CONCRETE: {
      const c = theme.concrete;
      P(0, 0, 16, 16, c[0]); speckle(24, [c[1], c[2]]);
      for (let i = 0; i < 2; i++) { const x = r.int(1, 14); P(x, 0, 1, r.int(4, 14), rgba(theme.streak, 0.6)); }
      if (r.chance(0.4)) { let x = r.int(3, 12), y = r.int(3, 10); for (let i = 0; i < 4; i++) { P(x, y, 1, 1, shade(c[0], 0.65)); x += r.int(-1, 1); y++; } }
      break;
    }
    case T.ROOF: {
      const rc = theme.roofCol;
      if (theme.roof === 'tarp') {
        P(0, 0, 16, 16, rc[0]);
        for (let y = 0; y < 16; y += 5) { P(0, y, 16, 2, rc[1]); P(0, y + 2, 16, 1, rc[2]); }
        P(r.int(2, 13), 0, 1, 16, '#d8c79a');
      } else if (theme.roof === 'tile') {
        P(0, 0, 16, 16, rc[1]);
        for (let row = 0; row < 4; row++) for (let x = (row % 2) * 2; x < 16; x += 4) {
          P(x, row * 4, 3, 3, rc[0]); P(x, row * 4, 3, 1, rc[2]);
        }
      } else {
        for (let x = 0; x < 16; x += 2) { P(x, 0, 1, 16, rc[0]); P(x + 1, 0, 1, 16, rc[1]); }
        P(0, 0, 16, 1, rc[2]);
        for (let i = 0; i < 4; i++) P(r.int(0, 15), r.int(0, 15), r.int(1, 2), r.int(1, 3), '#8a4b22');
      }
      break;
    }
    case T.PLANK: {
      const c = r.pick(theme.wood);
      P(0, 0, 16, 4, c); P(0, 0, 16, 1, shade(c, 1.2)); P(0, 4, 16, 1, shade(c, 0.55));
      P(3, 5, 2, 3, shade(c, 0.7)); P(11, 5, 2, 3, shade(c, 0.7));
      for (let i = 0; i < 3; i++) P(r.int(0, 12), r.int(1, 3), 3, 1, shade(c, 0.85));
      break;
    }
    case T.LADDER: {
      const b = theme.ladder;
      P(2, 0, 2, 16, b); P(12, 0, 2, 16, b); P(2, 0, 1, 16, shade(b, 1.2)); P(12, 0, 1, 16, shade(b, 1.2));
      for (const y of [5, 11]) { P(2, y, 2, 1, shade(b, 0.6)); P(12, y, 2, 1, shade(b, 0.6)); }
      for (const y of [2, 8, 14]) { P(4, y, 8, 1, shade(b, 0.85)); P(4, y + 1, 8, 1, shade(b, 0.6)); }
      break;
    }
    case T.CRATE: {
      const c = theme.wood[2];
      P(0, 0, 16, 16, c); P(0, 0, 16, 2, shade(c, 0.65)); P(0, 14, 16, 2, shade(c, 0.65)); P(0, 0, 2, 16, shade(c, 0.65)); P(14, 0, 2, 16, shade(c, 0.65));
      for (let i = 0; i < 12; i++) P(2 + i, 13 - i, 2, 1, shade(c, 0.75));
      P(4, 4, 3, 2, '#2d6b2a'); P(5, 3, 1, 1, '#3c8a37');
      break;
    }
    case T.SANDBAG: {
      const s = theme.sandbag;
      P(0, 0, 16, 16, shade(s[1], 0.7));
      for (let row = 0; row < 2; row++) for (let x = row ? -4 : 0; x < 16; x += 8) {
        P(x + 1, row * 8 + 1, 7, 6, s[0]); P(x + 1, row * 8 + 1, 7, 1, shade(s[0], 1.15)); P(x + 1, row * 8 + 6, 7, 1, s[1]);
        P(x + 4, row * 8 + 2, 1, 4, s[1]);
      }
      break;
    }
    case T.PAINT: {
      const p = theme.paint;
      P(0, 0, 16, 16, p[2]); P(0, 7, 16, 9, p[0]); P(0, 7, 16, 1, p[1]);
      speckle(6, [shade(p[2], 0.92), shade(p[0], 0.9)]);
      break;
    }
  }
}

/** Atlases: row = tile id, column = variant (4). bg = darkened copy for back walls. */
function buildTileAtlas(theme) {
  const fg = makeCanvas(64, TILE_COUNT * 16), g = fg.getContext('2d');
  const r = new RNG(7);
  for (let t = 1; t < TILE_COUNT; t++) {
    for (let v = 0; v < 4; v++) {
      g.save(); g.translate(v * 16, t * 16);
      g.beginPath(); g.rect(0, 0, 16, 16); g.clip();
      paintTileTexture(g, t, theme, r);
      g.restore();
    }
  }
  const bg = makeCanvas(64, TILE_COUNT * 16), b = bg.getContext('2d');
  b.drawImage(fg, 0, 0);
  b.globalCompositeOperation = 'source-atop';
  b.fillStyle = 'rgba(14,6,24,0.58)';
  b.fillRect(0, 0, bg.width, bg.height);
  // crack overlays: two damage stages
  const cracks = makeCanvas(32, 16), c = cracks.getContext('2d');
  const cr = new RNG(99);
  for (let stage = 0; stage < 2; stage++) {
    c.fillStyle = 'rgba(10,4,8,0.55)';
    for (let k = 0; k < (stage ? 5 : 2); k++) {
      let x = cr.int(2, 13), y = cr.int(2, 13);
      for (let i = 0; i < (stage ? 6 : 4); i++) { c.fillRect(stage * 16 + x, y, 1, 1); x = clamp(x + cr.int(-1, 1), 0, 15); y = clamp(y + cr.int(-1, 1), 0, 15); }
    }
    if (stage) { c.clearRect(16, 0, 2, 2); c.clearRect(30, 14, 2, 2); }
  }
  // per-type average colour for debris particles
  const debris = {};
  const data = g.getImageData(0, 0, 64, TILE_COUNT * 16).data;
  for (let t = 1; t < TILE_COUNT; t++) {
    const cols = [];
    for (let i = 0; i < 6; i++) {
      const px = (t * 16 + 4 + i * 2) * 64 + 3 + i * 7;
      const k = px * 4;
      if (data[k + 3] > 0) cols.push(toHex(data[k], data[k + 1], data[k + 2]));
    }
    debris[t] = cols.length ? cols : ['#777777'];
  }
  return { fg, bg, cracks, debris };
}

/* ------------------------------------------------------------ world ------- */
const CHUNK = 16; // tiles per chunk side
const CHUNK_PX = CHUNK * TILE;

class World {
  constructor(w, h, themeName, fg, bg) {
    this.w = w; this.h = h;
    this.theme = THEMES[themeName];
    this.fg = fg || new Uint8Array(w * h);
    this.bg = bg || new Uint8Array(w * h);
    this.hp = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) this.hp[i] = TINFO[this.fg[i]].hp || 0;
    this.cw = Math.ceil(w / CHUNK); this.chh = Math.ceil(h / CHUNK);
    this.chunks = new Array(this.cw * this.chh).fill(null);
    this.dirty = new Uint8Array(this.cw * this.chh).fill(1);
    this.atlas = buildTileAtlas(this.theme);
    this.decal = makeCanvas(w * TILE, h * TILE);
    this.dctx = this.decal.getContext('2d');
    this.pxW = w * TILE; this.pxH = h * TILE;
  }

  get(tx, ty) {
    if (tx < 0 || tx >= this.w || ty >= this.h) return T.ROCK;
    if (ty < 0) return T.AIR;
    return this.fg[ty * this.w + tx];
  }
  getBg(tx, ty) { return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h ? 0 : this.bg[ty * this.w + tx]; }
  info(tx, ty) { return TINFO[this.get(tx, ty)]; }
  solidAt(tx, ty) { return TINFO[this.get(tx, ty)].solid; }
  solidPx(x, y) { return this.solidAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  /** Solid for bullets: walls + one-way planks are both hit. */
  blocksShot(x, y) { const t = this.get(Math.floor(x / TILE), Math.floor(y / TILE)); return TINFO[t].solid; }
  ladderPx(x, y) { return !!TINFO[this.get(Math.floor(x / TILE), Math.floor(y / TILE))].climb; }

  set(tx, ty, t) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    const i = ty * this.w + tx;
    this.fg[i] = t; this.hp[i] = TINFO[t].hp || 0;
    this.touch(tx, ty);
  }
  setBg(tx, ty, t) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.bg[ty * this.w + tx] = t; this.touch(tx, ty);
  }

  /** Mark the chunk (and neighbours, for edge shading) for re-render. */
  touch(tx, ty) {
    const x0 = Math.floor((tx - 1) / CHUNK), x1 = Math.floor((tx + 1) / CHUNK);
    const y0 = Math.floor((ty - 1) / CHUNK), y1 = Math.floor((ty + 1) / CHUNK);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (cx >= 0 && cy >= 0 && cx < this.cw && cy < this.chh) this.dirty[cy * this.cw + cx] = 1;
    }
  }

  boxSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (TINFO[this.get(tx, ty)].solid) return true;
    return false;
  }

  /** One-way plank under a falling box whose previous bottom was above the plank top. */
  oneWayBelow(x, w, prevBottom, newBottom) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const ty = Math.floor((newBottom - 0.01) / TILE);
    const top = ty * TILE;
    if (prevBottom > top + 0.5) return -1;
    for (let tx = x0; tx <= x1; tx++) if (TINFO[this.get(tx, ty)].oneWay) return top;
    return -1;
  }

  boxLadder(x, y, w, h) {
    const cx = Math.floor((x + w / 2) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) if (TINFO[this.get(cx, ty)].climb) return true;
    return false;
  }

  /** Damage a tile; returns true when it broke. */
  damage(tx, ty, amount, kind = 'bullet') {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    const i = ty * this.w + tx, t = this.fg[i];
    const info = TINFO[t];
    if (!t || !info.hp || info.hp === Infinity) return false;
    const before = this.crackStage(i, info);
    this.hp[i] -= kind === 'bullet' && info.armor ? amount * info.armor : amount;
    if (this.hp[i] <= 0) { this.destroy(tx, ty, kind); return true; }
    if (this.crackStage(i, info) !== before) this.touch(tx, ty);
    return false;
  }

  crackStage(i, info) { const f = this.hp[i] / info.hp; return f < 0.4 ? 2 : f < 0.75 ? 1 : 0; }

  destroy(tx, ty, kind) {
    const i = ty * this.w + tx, t = this.fg[i];
    if (!t) return;
    this.fg[i] = 0; this.hp[i] = 0;
    this.touch(tx, ty);
    this.dctx.clearRect(tx * TILE, ty * TILE, TILE, TILE);
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    fxDebris(cx, cy, this.atlas.debris[t], kind === 'explosion' ? 5 : 7);
    if (kind !== 'explosion') SND.play('crumble', { x: cx, y: cy, throttle: 0.06 });
    if (TINFO[t].loot) Game.onCrateBroken(cx, cy);
    // Ladders and planks resting on nothing keep floating, like Broforce. Crates fall.
    if (this.get(tx, ty - 1) === T.CRATE) Game.spawnFallingCrate(tx, ty - 1);
  }

  /** Radial terrain damage; big blasts also punch through the back wall. */
  explode(x, y, r, power) {
    const tr = Math.ceil(r / TILE);
    const ctx = Math.floor(x / TILE), cty = Math.floor(y / TILE);
    for (let ty = cty - tr; ty <= cty + tr; ty++) {
      for (let tx = ctx - tr; tx <= ctx + tr; tx++) {
        const d = dist(x, y, tx * TILE + 8, ty * TILE + 8);
        if (d > r) continue;
        this.damage(tx, ty, power * (1 - (d / r) * 0.55), 'explosion');
        if (power >= 6 && d < r * 0.5 && this.getBg(tx, ty) && this.get(tx, ty) === 0 && ty < this.h - 1) this.setBg(tx, ty, 0);
      }
    }
  }

  /** First solid point along a segment (3px steps), or null. */
  raycast(x0, y0, x1, y1) {
    const d = dist(x0, y0, x1, y1), n = Math.max(1, Math.ceil(d / 3));
    for (let i = 1; i <= n; i++) {
      const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
      if (this.solidPx(x, y)) return { x, y };
    }
    return null;
  }

  /** Paint a decal (stain/scorch) only where there is something to paint on. */
  stain(x, y, color, size = 1) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.solidAt(tx, ty) && !this.getBg(tx, ty)) return;
    this.dctx.fillStyle = color;
    this.dctx.fillRect(Math.floor(x), Math.floor(y), size, size);
  }

  renderChunk(cx, cy) {
    let c = this.chunks[cy * this.cw + cx];
    if (!c) c = this.chunks[cy * this.cw + cx] = makeCanvas(CHUNK_PX, CHUNK_PX);
    const g = c.getContext('2d');
    g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const A = this.atlas, th = this.theme;
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    for (let j = 0; j < CHUNK; j++) {
      const ty = cy * CHUNK + j;
      if (ty >= this.h) break;
      for (let i = 0; i < CHUNK; i++) {
        const tx = cx * CHUNK + i;
        if (tx >= this.w) break;
        const idx = ty * this.w + tx, t = this.fg[idx], b = this.bg[idx];
        const px = i * TILE, py = j * TILE, v = hash2(tx, ty) & 3;
        const info = TINFO[t];
        if (b && !info.solid) {
          g.drawImage(A.bg, v * 16, b * 16, 16, 16, px, py, 16, 16);
          if (this.solidAt(tx, ty - 1)) { P(px, py, 16, 3, 'rgba(0,0,0,0.38)'); P(px, py + 3, 16, 2, 'rgba(0,0,0,0.16)'); }
          if (this.solidAt(tx - 1, ty)) P(px, py, 3, 16, 'rgba(0,0,0,0.24)');
          if (this.solidAt(tx + 1, ty)) P(px + 13, py, 3, 16, 'rgba(0,0,0,0.18)');
        }
        if (!t) continue;
        g.drawImage(A.fg, v * 16, t * 16, 16, 16, px, py, 16, 16);
        if (!info.solid) continue;
        const up = this.solidAt(tx, ty - 1);
        if (!up) {
          if (info.soil) {
            P(px, py, 16, 3, th.top[0]);
            for (let x = 0; x < 16; x++) {
              const hsh = hash2(tx * 16 + x, ty);
              if (hsh % 3 === 0) P(px + x, py + 3, 1, 1, th.top[1]);
              if (hsh % 7 === 0) P(px + x, py - 1, 1, 1, th.top[2]);
              if (hsh % 13 === 0) P(px + x, py - 2, 1, 1, th.top[2]);
            }
          } else P(px, py, 16, 1, 'rgba(255,255,255,0.2)');
        }
        if (!this.solidAt(tx - 1, ty)) P(px, py, 1, 16, 'rgba(0,0,0,0.35)');
        if (!this.solidAt(tx + 1, ty)) P(px + 15, py, 1, 16, 'rgba(0,0,0,0.35)');
        if (!this.solidAt(tx, ty + 1)) P(px, py + 15, 16, 1, 'rgba(0,0,0,0.45)');
        if (info.hp && info.hp !== Infinity) {
          const s = this.crackStage(idx, info);
          if (s) g.drawImage(A.cracks, (s - 1) * 16, 0, 16, 16, px, py, 16, 16);
        }
      }
    }
    this.dirty[cy * this.cw + cx] = 0;
  }

  draw(g, camX, camY) {
    const x0 = Math.max(0, Math.floor(camX / CHUNK_PX)), x1 = Math.min(this.cw - 1, Math.floor((camX + VIEW_W) / CHUNK_PX));
    const y0 = Math.max(0, Math.floor(camY / CHUNK_PX)), y1 = Math.min(this.chh - 1, Math.floor((camY + VIEW_H) / CHUNK_PX));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (this.dirty[cy * this.cw + cx] || !this.chunks[cy * this.cw + cx]) this.renderChunk(cx, cy);
      g.drawImage(this.chunks[cy * this.cw + cx], cx * CHUNK_PX - camX, cy * CHUNK_PX - camY);
    }
    const sx = clamp(camX, 0, this.pxW - 1), sy = clamp(camY, 0, this.pxH - 1);
    const sw = Math.min(VIEW_W, this.pxW - sx), sh = Math.min(VIEW_H, this.pxH - sy);
    if (sw > 0 && sh > 0) g.drawImage(this.decal, sx, sy, sw, sh, sx - camX, sy - camY, sw, sh);
  }
}
