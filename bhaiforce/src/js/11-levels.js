/* =============================================================================
 * LEVELS — four missions across India, built from a seeded script of
 * hand-tuned segments (chawls, havelis, watchtowers, bunkers, caves, bridges,
 * prisoner cages, Tiranga checkpoints and a boss arena).
 * ========================================================================== */

const LEVELS = [
  {
    id: 'mumbai', name: 'Bambai Bawaal', hindi: 'बंबई बवाल', place: 'Mumbai, Maharashtra', theme: 'mumbai', seed: 1947,
    music: 'level', weather: 'rain', boss: 'bunty', sky: 'dusk',
    collectible: { id: 'vadapav', name: 'Vada Pav' },
    brief: [
      'Bhaiforce, emergency hai!',
      'Don Dhoka ke goondon ne poore Mumbai ki VADA PAV supply hijack kar li hai.',
      'Local train ke log bhookhe hain. Office late ho raha hai. Upar se monsoon.',
      'Jao. Bawaal machao. Har vada pav wapas lao.',
    ],
    mix: { goonda: 6, lathi: 3, patakha: 2 },
    script: ['start', 'tutorial', 'flat', 'building:2', 'cage', 'hill', 'checkpoint', 'flat', 'building:3', 'pit', 'cage', 'checkpoint', 'tower', 'cave', 'building:3:cage', 'checkpoint', 'flat', 'arena'],
  },
  {
    id: 'rajasthan', name: 'Registan Rumble', hindi: 'रेगिस्तान रंबल', place: 'Jaisalmer, Rajasthan', theme: 'desert', seed: 2026,
    music: 'level', weather: 'dust', boss: 'truck', sky: 'day',
    collectible: { id: 'pyaaz', name: 'Pyaaz' },
    brief: [
      'Breaking news: PYAAZ ₹500 KILO!',
      'Don Dhoka ne desh ka saara pyaaz Thar ke registan mein chhupa diya hai.',
      'Na tadka, na biryani, na chain. Nani ne khana banana band kar diya hai.',
      'Uska HORN OK PLEASE truck dhoondo aur pyaaz azaad karo.',
    ],
    mix: { goonda: 5, lathi: 2, patakha: 2, rocket: 2, bouncer: 1 },
    script: ['start', 'flat', 'tower', 'hill', 'cage', 'building:2', 'checkpoint', 'pit', 'bunker', 'cage', 'checkpoint', 'hill', 'building:3:cage', 'tower', 'checkpoint', 'flat', 'arena'],
  },
  {
    id: 'delhi', name: 'Dilli Diwali Dhamaka', hindi: 'दिल्ली दिवाली धमाका', place: 'Chandni Chowk, Delhi', theme: 'diwali', seed: 1111,
    music: 'night', weather: 'embers', boss: 'kabaad', sky: 'night', night: true,
    collectible: { id: 'kaju', name: 'Kaju Katli' },
    brief: [
      'Diwali khatre mein hai!',
      'Don Dhoka ne saari KAJU KATLI chura li... aur badle mein sabko SOAN PAPDI baant di.',
      'Ye zulm hai. Ye atyachaar hai.',
      'Uska Kabaad-Bot 3000 Chandni Chowk ke peeche chhupa hai. Patakhe tayyar rakho.',
    ],
    mix: { goonda: 5, lathi: 2, patakha: 3, rocket: 2, bouncer: 1, drone: 2 },
    script: ['start', 'building:2', 'flat', 'building:3', 'cage', 'checkpoint', 'pit', 'building:3', 'bunker', 'cage', 'checkpoint', 'tower', 'building:4:cage', 'cave', 'checkpoint', 'flat', 'arena'],
  },
  {
    id: 'himalaya', name: 'Pahadi Panga', hindi: 'पहाड़ी पंगा', place: 'Ladakh, Himalayas', theme: 'snow', seed: 8848,
    music: 'level', weather: 'snow', boss: 'copter', sky: 'snow',
    collectible: { id: 'momo', name: 'Momos' },
    brief: [
      'Aakhri mission, Bhaiforce.',
      'Don Dhoka saare momos lekar apne Himalayan adde mein bhaag gaya hai.',
      'Aur uska plan? Cricket World Cup final ka LIVE telecast band karna.',
      '140 crore log dekh rahe hain. Galti ki gunjaish nahi.',
    ],
    mix: { goonda: 5, lathi: 2, patakha: 2, rocket: 3, bouncer: 2, drone: 2 },
    script: ['start', 'hill', 'cave', 'cage', 'tower', 'checkpoint', 'hill', 'bunker', 'pit', 'cage', 'checkpoint', 'building:2', 'cave', 'tower:cage', 'checkpoint', 'hill', 'arena'],
  },
];

const LEVEL_H = 40;
const G_BASE = 28;

/** Building materials per theme: [walls, slabs, interior back wall]. */
const BUILD_MAT = {
  mumbai: { wall: T.CONCRETE, slab: T.CONCRETE, inner: T.PAINT, alt: T.BRICK },
  desert: { wall: T.BRICK, slab: T.BRICK, inner: T.PAINT, alt: T.STONE, crenel: true },
  diwali: { wall: T.BRICK, slab: T.CONCRETE, inner: T.PAINT, alt: T.CONCRETE },
  snow: { wall: T.WOOD, slab: T.WOOD, inner: T.WOOD, alt: T.STONE },
};

const BILLBOARDS = {
  mumbai: ['VADA PAV ₹15 — BHOOK LAGI?', 'LOCAL TRAIN: 2 MIN LATE (ROZ)', 'SHARMA JI KA BETA — IIT TOPPER', 'FREE WIFI · PASSWORD: PUCHHO MAT'],
  desert: ['PYAAZ ₹500/KG', 'CAMEL TAXI · AC NAHI HAI', 'HORN OK PLEASE', 'PAANI BACHAO · PYAAZ BHI'],
  diwali: ['AQI 999 · SAANS LO, RISK PE', 'SOAN PAPDI WAPAS LO', 'PATAKHE ₹0 · DON KE PAISE SE', 'HAPPY DIWALI · LOVE, DON DHOKA'],
  snow: ['MOMOS ₹50 · WIFI NAHI HAI', 'NETWORK: 1 DANDA', 'WORLD CUP FINAL · LIVE?', 'THANDA THANDA COOL COOL'],
};

class LevelBuilder {
  constructor(def, index) {
    this.def = def; this.index = index; this.rng = new RNG(def.seed);
    this.maxW = 440; this.H = LEVEL_H;
    this.fg = new Uint8Array(this.maxW * LEVEL_H); this.bg = new Uint8Array(this.maxW * LEVEL_H);
    this.x = 0; this.g = G_BASE;
    this.spawns = []; this.decor = []; this.locked = [];
    this.mat = BUILD_MAT[def.theme];
    this.soil = def.theme === 'snow' ? T.SNOW : T.DIRT;
    this.cages = 0; this.collectibles = 0; this.signs = 0;
  }

  inb(x, y) { return x >= 0 && y >= 0 && x < this.maxW && y < this.H; }
  set(x, y, t) { if (this.inb(x, y)) this.fg[y * this.maxW + x] = t; }
  get(x, y) { return this.inb(x, y) ? this.fg[y * this.maxW + x] : T.ROCK; }
  setBg(x, y, t) { if (this.inb(x, y)) this.bg[y * this.maxW + x] = t; }
  rect(x, y, w, h, t) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, t); }
  bgRect(x, y, w, h, t) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.setBg(x + i, y + j, t); }

  /** A ground column: soil surface, earth below, a bedrock floor. */
  column(tx, g) {
    for (let y = 0; y < this.H; y++) {
      if (y < g) { this.set(tx, y, T.AIR); this.setBg(tx, y, 0); continue; }
      let t = this.soil;
      if (y >= this.H - 1) t = T.ROCK;
      else if (this.def.theme === 'snow' && y > g + 1) t = T.DIRT;
      if (y > g + 6 && hash2(tx, y) % 7 === 0) t = T.STONE;
      this.set(tx, y, t);
      this.setBg(tx, y, y > g ? T.DIRT : 0);
    }
  }
  ground(w) { for (let i = 0; i < w; i++) this.column(this.x + i, this.g); }

  surface(tx) {
    for (let y = 0; y < this.H; y++) { const t = this.get(tx, y); if (TINFO[t].solid || TINFO[t].oneWay) return y; }
    return this.H - 1;
  }

  spawn(type, tx, row, extra = {}) { this.spawns.push(Object.assign({ type, x: tx * TILE + 8, y: row * TILE }, extra)); }
  deco(type, tx, row, extra = {}) { this.decor.push(Object.assign({ type, x: tx * TILE + 8, y: row * TILE }, extra)); }

  enemy(tx, row, kind) { this.spawn('enemy', tx, row, { kind: kind || this.rng.weighted(this.def.mix) }); }

  enemiesOnSurface(x0, x1, n, kind) {
    for (let i = 0; i < n; i++) {
      const tx = this.rng.int(x0, x1);
      this.enemy(tx, this.surface(tx), kind);
    }
  }

  collectible(tx, row) { this.spawn('collectible', tx, row, { kind: this.def.collectible.id }); this.collectibles++; }

  props(tx) {
    const s = this.surface(tx);
    const r = this.rng.next();
    if (r < 0.35) { const n = this.rng.int(2, 3); for (let i = 0; i < n; i++) this.spawn('cylinder', tx + i, this.surface(tx + i)); }
    else if (r < 0.55) this.spawn('drum', tx, s);
    else if (r < 0.8) { this.set(tx, s - 1, T.CRATE); if (this.rng.chance(0.5)) this.set(tx + 1, s - 1, T.CRATE); if (this.rng.chance(0.4)) this.set(tx, s - 2, T.CRATE); }
    else if (this.def.theme !== 'snow') this.spawn('cow', tx, s);
  }

  scenery(tx) {
    const s = this.surface(tx), th = this.def.theme, r = this.rng.next();
    if (r < 0.35) this.deco('tree', tx, s, { v: this.rng.int(0, 2) });
    else if (r < 0.55) this.deco('billboard', tx, s, { text: this.rng.pick(BILLBOARDS[th]) });
    else if (r < 0.7 && th !== 'snow') this.deco('auto', tx, s);
    else if (r < 0.8 && th === 'mumbai') this.deco('stall', tx, s);
  }

  build() {
    for (const step of this.def.script) {
      const [name, ...args] = step.split(':');
      SEGMENTS[name](this, args);
    }
    const W = this.x + 1;
    for (let y = 0; y < this.H; y++) { this.set(W - 1, y, T.ROCK); }
    const fg = new Uint8Array(W * this.H), bg = new Uint8Array(W * this.H);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < W; x++) { fg[y * W + x] = this.fg[y * this.maxW + x]; bg[y * W + x] = this.bg[y * this.maxW + x]; }
    const world = new World(W, this.H, this.def.theme, fg, bg);
    for (const [x, y] of this.locked) world.hp[y * W + x] = Infinity; // reinforced arena floor
    return { world, spawns: this.spawns, decor: this.decor, start: this.playerStart, arena: this.arena, collectibles: this.collectibles };
  }
}

const G_MIN = 22, G_MAX = 31;

const SEGMENTS = {
  start(b) {
    const w = 16;
    b.ground(w);
    b.playerStart = { x: (b.x + 5) * TILE, y: (b.g - 12) * TILE };
    b.spawn('sign', b.x + 9, b.g, { hint: b.index === 0 ? 'controls' : 'mission' });
    b.scenery(b.x + 13);
    b.x += w;
  },

  tutorial(b) {
    const w = 22;
    b.ground(w);
    b.set(b.x + 6, b.g - 1, T.SANDBAG); b.set(b.x + 6, b.g - 2, T.SANDBAG);
    b.spawn('sign', b.x + 3, b.g, { hint: 'climb' });
    b.rect(b.x + 10, b.g - 4, 3, 4, b.mat.alt);
    b.collectible(b.x + 11, b.g - 4);
    b.enemy(b.x + 17, b.g, 'goonda');
    b.spawn('cylinder', b.x + 19, b.g); b.spawn('cylinder', b.x + 20, b.g);
    b.spawn('sign', b.x + 15, b.g, { hint: 'cylinder' });
    b.x += w;
  },

  flat(b) {
    const w = b.rng.int(15, 20);
    for (let i = 0; i < w; i++) {
      if (i > 2 && i < w - 3 && b.rng.chance(0.14)) b.g = clamp(b.g + b.rng.pick([-1, 1]), G_MIN, G_MAX);
      b.column(b.x + i, b.g);
    }
    if (b.rng.chance(0.65)) { const cx = b.x + b.rng.int(4, w - 6), s = b.surface(cx); b.set(cx, s - 1, T.SANDBAG); b.set(cx, s - 2, T.SANDBAG); b.set(cx + 1, s - 1, T.SANDBAG); }
    b.props(b.x + b.rng.int(2, w - 4));
    b.scenery(b.x + b.rng.int(1, w - 2));
    b.enemiesOnSurface(b.x + 4, b.x + w - 2, b.rng.int(1, 2) + (b.index >= 2 ? 1 : 0));
    if (b.rng.chance(0.5)) { const cx = b.x + b.rng.int(2, w - 2); b.collectible(cx, b.surface(cx) - 2); }
    b.x += w;
  },

  hill(b) {
    const w = b.rng.int(16, 22), h = b.rng.int(3, 5), g0 = b.g;
    for (let i = 0; i < w; i++) b.column(b.x + i, Math.round(g0 - Math.sin((i / (w - 1)) * Math.PI) * h));
    if (b.rng.chance(0.6)) {
      for (let i = 3; i < w - 3; i++) for (let y = g0 - 3; y < g0; y++) { b.set(b.x + i, y, T.AIR); b.setBg(b.x + i, y, T.DIRT); }
      b.collectible(b.x + (w >> 1), g0);
      if (b.rng.chance(0.5)) b.enemy(b.x + (w >> 1) + 2, g0, 'lathi');
    }
    const top = b.x + (w >> 1);
    b.enemiesOnSurface(top - 3, top + 3, b.rng.int(1, 2));
    if (b.index >= 1 && b.rng.chance(0.5)) b.enemy(top, b.surface(top), 'rocket');
    b.scenery(b.x + 2);
    b.g = g0; b.x += w;
  },

  building(b, args) {
    const floors = parseInt(args[0] || '2', 10);
    const withCage = args.includes('cage');
    const bw = b.rng.int(11, 14), pad = 2, FH = 5;
    b.ground(bw + pad * 2);
    const x0 = b.x + pad, x1 = x0 + bw - 1, gy = b.g, M = b.mat;
    const roofRow = gy - floors * FH;
    for (let f = 0; f < floors; f++) {
      const floorRow = gy - f * FH, slab = gy - (f + 1) * FH;
      b.bgRect(x0, slab + 1, bw, FH - 1, M.inner);
      for (let y = slab + 1; y < floorRow; y++) { b.set(x0, y, M.wall); b.set(x1, y, M.wall); }
      for (let x = x0; x <= x1; x++) b.set(x, slab, f === floors - 1 ? T.ROOF : M.slab);
      // windows in the outer walls (shoot-through gaps) on upper floors
      if (f > 0) { b.set(x0, slab + 2, T.AIR); b.set(x0, slab + 3, T.AIR); b.set(x1, slab + 2, T.AIR); b.set(x1, slab + 3, T.AIR); }
      // ladder hole up to the next floor
      if (f < floors - 1) {
        const lx = f % 2 === 0 ? x1 - 2 : x0 + 2;
        for (let y = slab; y < floorRow; y++) b.set(lx, y, T.LADDER);
      }
      // interior dressing
      const wx = x0 + 3 + b.rng.int(0, Math.max(0, bw - 9));
      b.deco(b.rng.chance(0.5) ? 'window' : 'poster', wx, slab + 3);
      if (b.def.night) b.deco('diya', x0 + 1 + b.rng.int(1, bw - 4), floorRow);
      const n = f === 0 ? b.rng.int(1, 2) : b.rng.int(1, 2);
      for (let i = 0; i < n; i++) b.enemy(x0 + 2 + b.rng.int(0, bw - 5), floorRow);
      if (f === 0 && b.rng.chance(0.7)) b.spawn('cylinder', x0 + 2, floorRow);
      if (f === floors - 1) {
        if (withCage) b.spawn('cage', x0 + (bw >> 1), floorRow);
        else b.collectible(x0 + (bw >> 1), floorRow - 1);
      }
    }
    // ground floor doors
    for (let y = gy - 3; y < gy; y++) { b.set(x0, y, T.AIR); b.set(x1, y, T.AIR); }
    // roof dressing
    if (M.crenel) for (let x = x0; x <= x1; x += 2) b.set(x, roofRow - 1, M.wall);
    else if (b.rng.chance(0.7)) b.deco('tank', x0 + 2 + b.rng.int(0, bw - 6), roofRow);
    if (b.rng.chance(0.6)) b.enemy(x0 + 3 + b.rng.int(0, bw - 7), roofRow, b.index >= 1 && b.rng.chance(0.5) ? 'rocket' : undefined);
    if (b.def.theme === 'mumbai') b.deco('laundry', x1 + 1, roofRow + 3, { w: pad * TILE + 8 });
    if (b.def.night) b.deco('lights', x0, roofRow, { w: bw * TILE });
    if (b.def.theme === 'snow') b.deco('flags', x0, roofRow - 1, { w: bw * TILE });
    b.x += bw + pad * 2;
  },

  tower(b, args) {
    const w = 9, height = b.rng.int(6, 8);
    b.ground(w);
    const tx = b.x + 2, py = b.g - height;
    for (let y = py + 1; y < b.g; y++) { b.setBg(tx, y, T.WOOD); b.setBg(tx + 4, y, T.WOOD); if ((y - py) % 3 === 0) for (let i = 1; i < 4; i++) b.setBg(tx + i, y, T.WOOD); }
    for (let x = tx - 1; x <= tx + 5; x++) b.set(x, py, T.PLANK);
    b.set(tx - 1, py - 1, T.SANDBAG); b.set(tx + 5, py - 1, T.SANDBAG);
    for (let y = py; y < b.g; y++) b.set(tx + 2, y, T.LADDER);
    if (args.includes('cage')) b.spawn('cage', tx + 2, py);
    else b.enemy(tx + 3, py, b.index >= 1 ? 'rocket' : 'goonda');
    b.collectible(tx + 1, py - 1);
    b.enemy(tx + 6, b.g);
    if (b.def.theme === 'snow') b.deco('flags', tx - 1, py - 2, { w: 7 * TILE });
    b.x += w;
  },

  pit(b) {
    const lead = 2, w = b.rng.int(6, 8), depth = b.rng.int(4, 6);
    b.ground(lead);
    const px = b.x + lead;
    for (let i = 0; i < w; i++) b.column(px + i, b.g + depth);
    for (let i = 0; i < w; i++) if (!(i === (w >> 1) && b.rng.chance(0.4))) b.set(px + i, b.g, T.PLANK);
    b.enemy(px + 2, b.g + depth, 'lathi');
    b.collectible(px + w - 2, b.g + depth - 1);
    if (b.rng.chance(0.5)) b.spawn('drum', px + 1, b.g + depth);
    b.x += lead + w;
    b.ground(3);
    b.x += 3;
  },

  bunker(b) {
    const w = 15;
    b.ground(w);
    const rx0 = b.x + 3, rw = 10, top = b.g, rh = 4;
    for (let x = rx0 - 1; x <= rx0 + rw; x++) { b.set(x, top, T.STEEL); b.set(x, top + rh + 1, T.STEEL); }
    for (let y = top; y <= top + rh + 1; y++) { b.set(rx0 - 1, y, T.STEEL); b.set(rx0 + rw, y, T.STEEL); }
    for (let x = rx0; x < rx0 + rw; x++) for (let y = top + 1; y <= top + rh; y++) { b.set(x, y, T.AIR); b.setBg(x, y, T.CONCRETE); }
    for (let y = top; y <= top + rh; y++) b.set(rx0 + 1, y, T.LADDER);
    b.set(rx0 + rw - 2, top + rh, T.CRATE);
    b.spawn('drum', rx0 + 4, top + rh + 1);
    b.enemy(rx0 + 5, top + rh + 1);
    b.enemy(rx0 + 7, top + rh + 1, b.index >= 1 ? 'bouncer' : 'goonda');
    if (b.rng.chance(0.5)) b.spawn('cage', rx0 + rw - 3, top + rh + 1); else b.collectible(rx0 + rw - 3, top + rh);
    b.set(b.x + 1, top - 1, T.SANDBAG); b.set(b.x + 1, top - 2, T.SANDBAG); b.set(b.x + w - 2, top - 1, T.SANDBAG); b.set(b.x + w - 2, top - 2, T.SANDBAG);
    b.enemy(b.x + 8, top);
    b.x += w;
  },

  cave(b) {
    const w = 22, h = b.rng.int(6, 7), g0 = b.g;
    for (let i = 0; i < w; i++) {
      const ramp = Math.min(i, w - 1 - i);
      b.column(b.x + i, g0 - Math.min(h, Math.round(ramp * 1.6)));
    }
    for (let i = 0; i < w; i++) for (let y = g0 - 3; y < g0; y++) { b.set(b.x + i, y, T.AIR); b.setBg(b.x + i, y, T.DIRT); }
    if (b.rng.chance(0.6) && b.cages < 6) b.spawn('cage', b.x + (w >> 1), g0); else b.collectible(b.x + (w >> 1), g0 - 1);
    b.enemy(b.x + 6, g0, 'lathi');
    b.enemy(b.x + w - 6, g0);
    b.enemiesOnSurface(b.x + 7, b.x + w - 8, 1);
    b.collectible(b.x + 9, g0 - h - 1);
    b.x += w;
  },

  cage(b) {
    const w = 12;
    b.ground(w);
    const cx = b.x + 5;
    b.rect(cx - 1, b.g - 2, 4, 2, b.mat.alt);
    b.spawn('cage', cx + 1, b.g - 2);
    if (b.index === 0 && !b.cageHint) { b.cageHint = true; b.spawn('sign', b.x + 2, b.g, { hint: 'cage' }); }
    b.enemiesOnSurface(b.x + 8, b.x + w - 1, 1 + (b.index >= 2 ? 1 : 0));
    b.x += w;
  },

  checkpoint(b) {
    const w = 8;
    b.ground(w);
    b.spawn('flag', b.x + 4, b.g);
    if (b.def.theme !== 'snow' && b.rng.chance(0.3)) b.spawn('cow', b.x + 6, b.g);
    b.x += w;
  },

  arena(b) {
    const kind = b.def.boss, w = 36;
    b.g = G_BASE;
    b.ground(2); b.x += 2;
    const x0 = b.x;
    b.ground(w);
    for (let i = 0; i < w; i++) for (let y = b.g; y < b.g + 2; y++) b.locked.push([x0 + i, y]);
    const lvl = b.g;
    if (kind === 'bunty') {
      b.rect(x0 + 11, lvl - 2, 2, 2, b.mat.alt); b.rect(x0 + 23, lvl - 2, 2, 2, b.mat.alt);
      b.spawn('cylinder', x0 + 5, lvl); b.spawn('drum', x0 + 30, lvl);
    } else if (kind === 'truck') {
      for (const [px, pw] of [[x0 + 5, 7], [x0 + 22, 7]]) {
        for (let i = 0; i < pw; i++) b.set(px + i, lvl - 5, T.PLANK);
        for (let y = lvl - 5; y < lvl; y++) b.set(px, y, T.LADDER);
        for (let y = lvl - 4; y < lvl; y++) b.setBg(px + pw - 1, y, T.WOOD);
      }
    } else if (kind === 'kabaad') {
      b.rect(x0 + 4, lvl - 2, 3, 2, b.mat.alt);
      for (let i = 0; i < 7; i++) b.set(x0 + 9 + i, lvl - 5, T.PLANK);
      for (let y = lvl - 5; y < lvl; y++) b.set(x0 + 9, y, T.LADDER);
    } else if (kind === 'copter') {
      for (const px of [x0 + 7, x0 + 27]) { b.set(px, lvl - 1, T.SANDBAG); b.set(px + 1, lvl - 1, T.SANDBAG); }
      for (const [px, pw] of [[x0 + 3, 6], [x0 + 15, 5], [x0 + 27, 6]]) {
        for (let i = 0; i < pw; i++) b.set(px + i, lvl - 6, T.PLANK);
        for (let y = lvl - 6; y < lvl; y++) b.set(px + 1, y, T.LADDER);
      }
    }
    for (let y = 0; y < lvl; y++) { b.set(x0 + w, y, T.ROCK); b.set(x0 + w + 1, y, T.ROCK); }
    b.arena = { kind, tx0: x0, x0: x0 * TILE, x1: (x0 + w) * TILE, w: w * TILE, floorY: lvl * TILE, trigger: (x0 + 5) * TILE, wallRow: lvl };
    b.spawn('sign', x0 - 1, lvl, { hint: 'boss' });
    b.x += w + 2;
  },
};

/* ------------------------------------------------------------ decor ------- */
const DECOR_DRAW = {
  window(g, d, x, y, t, night) {
    g.fillStyle = '#20141a'; g.fillRect(x - 9, y - 22, 18, 14);
    g.fillStyle = night ? '#ffcf6b' : '#7fb8d8'; g.fillRect(x - 8, y - 21, 16, 12);
    g.fillStyle = night ? '#ffe9a8' : '#a8d8f0'; g.fillRect(x - 8, y - 21, 16, 2);
    g.fillStyle = '#20141a'; g.fillRect(x - 1, y - 21, 1, 12); g.fillRect(x - 8, y - 16, 16, 1);
    g.fillStyle = '#c41e3a'; g.fillRect(x - 8, y - 21, 3, 10); g.fillRect(x + 5, y - 21, 3, 10);
    if (night) FX.light(d.x, d.y - 15, 46, 0.03, '#ffcf6b', 0.5);
  },
  poster(g, d, x, y) {
    g.fillStyle = '#1a0e10'; g.fillRect(x - 7, y - 24, 14, 18);
    g.fillStyle = '#ff9a1f'; g.fillRect(x - 6, y - 23, 12, 16);
    g.fillStyle = '#c41e3a'; g.fillRect(x - 6, y - 23, 12, 5);
    g.fillStyle = '#1a0e10'; g.fillRect(x - 3, y - 17, 6, 6); g.fillStyle = '#b97a4a'; g.fillRect(x - 2, y - 16, 4, 4);
    g.fillStyle = '#ffffff'; g.fillRect(x - 5, y - 9, 10, 1);
  },
  tank(g, d, x, y) {
    g.fillStyle = '#0c0c10'; g.fillRect(x - 9, y - 17, 18, 17); g.fillRect(x - 7, y - 19, 14, 2);
    g.fillStyle = '#1e1e26'; g.fillRect(x - 8, y - 16, 16, 15);
    g.fillStyle = '#2e2e38'; g.fillRect(x - 8, y - 16, 3, 15);
    for (let i = 0; i < 3; i++) { g.fillStyle = '#0c0c10'; g.fillRect(x - 8, y - 13 + i * 4, 16, 1); }
  },
  laundry(g, d, x, y, t) {
    const w = d.w;
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 8, y - 6); g.quadraticCurveTo(x - 8 + w / 2, y, x - 8 + w, y - 6); g.stroke();
    const cols = ['#c41e3a', '#2a62c9', '#ffd23f', '#2f9e44', '#ff4f7b'];
    for (let i = 0; i < 3; i++) {
      const cx = x - 4 + i * (w / 3), sway = Math.round(Math.sin(t * 2 + i) * 1);
      g.fillStyle = cols[(i + (d.x >> 4)) % cols.length]; g.fillRect(cx + sway, y - 4, 5, 7);
    }
  },
  tree(g, d, x, y, t, night, th) {
    const sway = Math.sin(t * 1.5 + d.x) * 1.5;
    if (th === 'mumbai') { // coconut palm
      g.fillStyle = '#3a2a1a'; for (let i = 0; i < 40; i++) g.fillRect(x + Math.round(Math.sin(i * 0.08) * 3), y - i, 3, 1);
      g.fillStyle = '#2f7a2a';
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + sway * 0.05; for (let i = 0; i < 14; i++) g.fillRect(x + 3 + Math.round(Math.cos(a) * i), y - 40 + Math.round(Math.sin(a) * i * 0.5 + i * i * 0.04), 2, 2); }
      g.fillStyle = '#6b4a1a'; g.fillRect(x + 1, y - 38, 3, 3);
    } else if (th === 'desert') { // khejri
      g.fillStyle = '#4a3220'; g.fillRect(x, y - 18, 3, 18); g.fillRect(x - 4, y - 16, 4, 2); g.fillRect(x + 3, y - 20, 5, 2);
      g.fillStyle = '#6b7a2a'; g.fillRect(x - 10 + sway, y - 30, 22, 9); g.fillStyle = '#8a9a3a'; g.fillRect(x - 7 + sway, y - 31, 15, 3);
    } else if (th === 'snow') { // pine
      g.fillStyle = '#3a2418'; g.fillRect(x, y - 8, 3, 8);
      for (let i = 0; i < 4; i++) { const w = 18 - i * 4; g.fillStyle = '#1f4a3a'; g.fillRect(x + 1 - w / 2, y - 12 - i * 7, w, 6); g.fillStyle = '#eef4fa'; g.fillRect(x + 1 - w / 2, y - 12 - i * 7, w, 1); }
    } else { // neem
      g.fillStyle = '#3a2a1a'; g.fillRect(x, y - 20, 3, 20);
      g.fillStyle = '#2a4a24'; g.beginPath(); g.arc(x + 1 + sway, y - 28, 12, 0, TAU); g.fill();
      g.fillStyle = '#3a6a30'; g.beginPath(); g.arc(x - 2 + sway, y - 31, 6, 0, TAU); g.fill();
    }
  },
  billboard(g, d, x, y) {
    g.fillStyle = '#2a2420'; g.fillRect(x - 20, y - 22, 2, 22); g.fillRect(x + 18, y - 22, 2, 22);
    g.fillStyle = '#140c10'; g.fillRect(x - 32, y - 46, 64, 26);
    g.fillStyle = '#ffd23f'; g.fillRect(x - 31, y - 45, 62, 24);
    g.fillStyle = '#c41e3a'; g.fillRect(x - 31, y - 45, 62, 3); g.fillRect(x - 31, y - 24, 62, 3);
  },
  auto(g, d, x, y, t) { drawAutoRickshaw(g, x - 14, y - 20, 0); },
  stall(g, d, x, y) {
    g.fillStyle = '#140c10'; g.fillRect(x - 13, y - 26, 26, 26);
    g.fillStyle = '#c41e3a'; g.fillRect(x - 14, y - 28, 28, 5); g.fillStyle = '#ffffff'; for (let i = 0; i < 28; i += 4) g.fillRect(x - 14 + i, y - 28, 2, 5);
    g.fillStyle = '#9b6a3e'; g.fillRect(x - 12, y - 13, 24, 9);
    g.fillStyle = '#e0a24a'; for (let i = 0; i < 4; i++) g.fillRect(x - 10 + i * 5, y - 16, 4, 3);
    g.fillStyle = '#2a2a30'; g.fillRect(x - 10, y - 4, 4, 4); g.fillRect(x + 6, y - 4, 4, 4);
    g.fillStyle = '#2a2a2a'; g.fillRect(x - 13, y - 23, 1, 10); g.fillRect(x + 12, y - 23, 1, 10);
  },
  diya(g, d, x, y, t) {
    g.fillStyle = '#8a3a1a'; g.fillRect(x - 3, y - 2, 6, 2); g.fillStyle = '#b8552a'; g.fillRect(x - 2, y - 3, 4, 1);
    const f = Math.sin(t * 12 + d.x) > 0 ? 1 : 0;
    g.fillStyle = '#ffd23f'; g.fillRect(x, y - 6 - f, 1, 3 + f); g.fillStyle = '#fff4c0'; g.fillRect(x, y - 4, 1, 1);
    FX.light(d.x, d.y - 4, 40, 0.03, '#ffb347', 0.75);
  },
  lights(g, d, x, y, t) {
    const w = d.w;
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 8, y - 2); g.quadraticCurveTo(x - 8 + w / 2, y + 6, x - 8 + w, y - 2); g.stroke();
    for (let i = 0; i < w; i += 6) {
      const k = i / w, yy = y - 2 + Math.sin(k * Math.PI) * 4;
      const on = (Math.floor(t * 3) + i / 6) % 3 !== 0;
      g.fillStyle = on ? HOLI[(i / 6) % HOLI.length] : '#333';
      g.fillRect(x - 8 + i, Math.round(yy), 2, 2);
    }
    if (Math.floor(t * 3) % 2) FX.light(d.x + w / 2, d.y, w * 0.8, 0.03, '#ff9ec7', 0.35);
  },
  flags(g, d, x, y, t) {
    const w = d.w, cols = ['#2a62c9', '#ffffff', '#c41e3a', '#2f9e44', '#ffd23f'];
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x - 8 + w / 2, y + 8, x - 8 + w, y); g.stroke();
    for (let i = 0, n = 0; i < w; i += 7, n++) {
      const k = i / w, yy = y + Math.sin(k * Math.PI) * 7 + Math.sin(t * 4 + i) * 0.8;
      g.fillStyle = cols[n % 5]; g.fillRect(x - 8 + i, Math.round(yy), 5, 5);
    }
  },
};

/** Billboard text drawn crisply on the UI layer. */
function drawDecorText(u, d) {
  if (d.type !== 'billboard') return;
  const [sx, sy] = Gfx.toScreen(d.x, d.y - 33);
  const s = Gfx.scale;
  u.save();
  u.font = `700 ${Math.max(9, Math.round(5.6 * s))}px ${FONT_DISPLAY}`;
  u.textAlign = 'center'; u.textBaseline = 'middle';
  u.fillStyle = '#1a0a14';
  const maxW = 58 * s;
  const words = d.text.split(' ');
  let lines = [d.text];
  if (u.measureText(d.text).width > maxW) {
    lines = ['', ''];
    for (const wd of words) { const i = u.measureText(lines[0] + ' ' + wd).width < maxW && !lines[1] ? 0 : 1; lines[i] = (lines[i] + ' ' + wd).trim(); }
  }
  lines.forEach((ln, i) => u.fillText(ln, sx, sy + (i - (lines.length - 1) / 2) * 6 * s, maxW));
  u.restore();
}
