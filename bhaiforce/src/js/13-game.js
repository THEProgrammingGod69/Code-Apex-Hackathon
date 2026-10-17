/* =============================================================================
 * GAME — mission state, spawning, the rescue/lives loop, combos, checkpoints,
 * boss flow, extraction, camera, lighting, and the HUD drawn on the crisp
 * UI canvas (banners, speech bubbles, boss bar, dialog).
 * ========================================================================== */

const COMBO_WORDS = [[3, 'ZABARDAST!'], [5, 'KHATARNAAK!'], [8, 'BAWAAL!'], [12, 'JHAKAAS!'], [16, 'PAISA VASOOL!'], [22, 'BHAI LEVEL: GOD!']];

const touchMode = () => Input.lastDevice === 'touch' || TouchUI.visible;
const HINTS = {
  controls: () => (touchMode()
    ? 'Left thumb moves. Hold FIRE to shoot, tap JUMP to jump. ★ = special move.'
    : 'Move A/D · Jump SPACE · Fire J · Special L · Thappad F'),
  climb: () => 'Push into a wall and hold JUMP to climb it.',
  cylinder: () => 'Red LPG cylinders go BOOM. Shoot them near goons!',
  cage: () => 'Free caged bhais: +1 life, and you become that bhai!',
  mission: () => `Collect every ${Game.level.collectible.name}. Raise the Tiranga to save progress.`,
  boss: () => 'Boss ahead. Tayyar ho jao!',
};

/** The Jugaad-copter: an auto-rickshaw with a rotor. Drops bhais in, flies them out. */
class Heli {
  constructor(mode, tx, ty) {
    Object.assign(this, { mode, tx, ty, t: 0, state: 'arrive', ladder: 0, remove: false, carry: false });
    this.x = tx - 200; this.y = ty - 90;
    this.chopT = 0;
  }
  update(dt) {
    this.t += dt;
    this.chopT -= dt;
    if (this.chopT <= 0) { this.chopT = 0.1; SND.play('chop', { x: this.x, y: this.y, throttle: 0 }); }
    if (this.state === 'arrive') {
      this.x = lerp(this.x, this.tx, Math.min(1, dt * 3));
      this.y = lerp(this.y, this.ty, Math.min(1, dt * 3));
      if (Math.abs(this.x - this.tx) < 6) { this.state = 'hover'; this.st = 0; }
    } else if (this.state === 'hover') {
      this.st += dt;
      this.y = this.ty + Math.sin(this.t * 2) * 3;
      this.ladder = Math.min(this.mode === 'extract' ? 54 : 20, this.ladder + dt * 90);
      if (this.mode === 'intro' && this.st > 0.35 && !this.dropped) { this.dropped = true; Game.dropPlayer(this.x, this.y + 26); this.state = 'leave'; }
      if (this.mode === 'extract') {
        const p = Game.player;
        const box = { x: this.x - 8, y: this.y + 8, w: 16, h: this.ladder + 6 };
        if (p && p.alive && overlaps(box, p)) { this.carry = true; this.state = 'leave'; Game.extract(this); }
      }
    } else {
      this.st = (this.st || 0) + dt;
      if (this.mode === 'intro' || this.st > 0.6) { this.x += (140 + this.st * 120) * dt; this.y -= (50 + this.st * 50) * dt; }
      if (this.st > 4) this.remove = true;
    }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    const O = '#140c0c';
    // bamboo tail boom + tail rotor
    g.fillStyle = O; g.fillRect(x - 40, y - 6, 28, 4);
    g.fillStyle = '#c9b458'; g.fillRect(x - 39, y - 5, 26, 2);
    const k = Math.floor(this.t * 30) % 2;
    g.fillStyle = 'rgba(220,220,230,0.7)'; g.fillRect(x - 44, y - 12 + k * 2, 2, 12 - k * 4);
    // rotor mast + blades
    g.fillStyle = O; g.fillRect(x - 2, y - 18, 4, 9);
    const s = Math.abs(Math.sin(this.t * 40));
    g.fillStyle = 'rgba(210,210,220,0.65)'; g.fillRect(x - 40 * s - 2, y - 20, 80 * s + 4, 2);
    g.fillStyle = 'rgba(210,210,220,0.18)'; g.fillRect(x - 42, y - 21, 84, 4);
    drawAutoRickshaw(g, x - 14, y - 10, this.t);
    // tricolour pennant + rope ladder
    g.fillStyle = '#ff9933'; g.fillRect(x + 14, y - 16, 5, 1); g.fillStyle = '#ffffff'; g.fillRect(x + 14, y - 15, 5, 1); g.fillStyle = '#138808'; g.fillRect(x + 14, y - 14, 5, 1);
    if (this.ladder > 0) {
      g.fillStyle = '#8a6a3a'; g.fillRect(x - 5, y + 10, 1, this.ladder); g.fillRect(x + 4, y + 10, 1, this.ladder);
      for (let ly = y + 14; ly < y + 10 + this.ladder; ly += 5) g.fillRect(x - 5, ly, 10, 1);
    }
    if (this.carry && Game.player) {
      const p = Game.player;
      const spr = humanSprite(p.look, 'climb', Math.floor(this.t * 4) % 2, 'climb', false, false);
      g.drawImage(spr, x - 11, y + 22);
    }
    if (this.mode === 'extract' && this.state === 'hover') {
      const a = 0.5 + 0.5 * Math.sin(this.t * 6);
      g.fillStyle = `rgba(255,230,120,${a})`;
      g.fillRect(x - 1, y + 14 + this.ladder, 2, 4);
    }
  }
}

const Game = {
  state: 'boot', levelIndex: 0, level: null, world: null, player: null,
  enemies: [], projectiles: [], objects: [], decor: [], boss: null, arena: null, helis: [],
  cam: { x: 0, y: 0 }, camX: 0, camY: 0, shakeAmt: 0,
  time: 0, levelTime: 0, slowmo: 0, hitStopT: 0, flashA: 0, flashC: '#fff', letterbox: 0, letterboxT: 0,
  lives: 3, score: 0, kills: 0, rescues: 0, collected: 0, totalCollect: 0, deaths: 0,
  combo: 0, comboT: 0, bestCombo: 0, comboWord: null,
  checkpoint: null, respawnT: 0, bossDone: false,
  banners: [], callout: null, bubbles: [], texts: [], dialogState: null, roster: [], rosterI: 0,

  /* ---------------------------------------------------------- lifecycle */
  startLevel(index, bhaiId) {
    const def = this.level = LEVELS[index];
    this.levelIndex = index;
    const built = new LevelBuilder(def, index).build();
    Object.assign(this, {
      world: built.world, arena: built.arena, totalCollect: built.collectibles, decor: built.decor,
      enemies: [], projectiles: [], objects: [], helis: [], boss: null, bossDone: false, player: null,
      lives: Settings.difficulty === 'chill' ? 4 : 3, score: 0, kills: 0, rescues: 0, collected: 0, deaths: 0,
      combo: 0, comboT: 0, bestCombo: 0, slowmo: 0, hitStopT: 0, flashA: 0, letterbox: 0, letterboxT: 0,
      banners: [], callout: null, bubbles: [], texts: [], dialogState: null, levelTime: 0, respawnT: 0, comboWord: null,
    });
    FX.clear();
    BG.setup(def.theme, def.sky, def.weather);
    this.bhaiId = bhaiId || pick(BHAIS).id;
    this.roster = BHAIS.map(b => b.id).filter(id => id !== this.bhaiId).sort(() => Math.random() - 0.5);
    this.rosterI = 0;
    for (const s of built.spawns) this.spawnFrom(s);
    this.checkpoint = { x: built.start.x, y: built.start.y + 12 * TILE };
    this.cam.x = clamp(built.start.x - VIEW_W / 2, 0, this.world.pxW - VIEW_W);
    this.cam.y = clamp(built.start.y + 12 * TILE - VIEW_H * 0.6, 0, this.world.pxH - VIEW_H);
    this.camX = Math.round(this.cam.x); this.camY = Math.round(this.cam.y);
    this.helis.push(new Heli('intro', built.start.x, built.start.y + 40));
    this.state = 'playing';
    MUSIC.play(def.music);
    this.banner({ type: 'mission', title: def.name.toUpperCase(), sub: `${def.hindi} · ${def.place}`, dur: 3.2, color: '#ffd23f' });
    UI.onLevelStart();
  },

  nextRosterBhai() {
    const id = this.roster[this.rosterI % this.roster.length];
    this.rosterI++;
    return id;
  },

  randomBhai(except) {
    const pool = BHAIS.filter(b => b.id !== except);
    return pick(pool).id;
  },

  spawnFrom(s) {
    switch (s.type) {
      case 'enemy': this.enemies.push(new Enemy(s.kind, s.x, s.y)); break;
      case 'cylinder': this.objects.push(new Cylinder(s.x - 4, s.y - 13)); break;
      case 'drum': this.objects.push(new Drum(s.x - 5, s.y - 14)); break;
      case 'cage': this.objects.push(new Cage(s.x - 8, s.y - 24, this.nextRosterBhai())); break;
      case 'flag': this.objects.push(new Flag(s.x, s.y)); break;
      case 'collectible': this.objects.push(new Collectible(s.x, s.y, s.kind)); break;
      case 'sign': this.objects.push(new Sign(s.x, s.y, HINTS[s.hint]())); break;
      case 'cow': this.objects.push(new Cow(s.x, s.y)); break;
    }
  },

  dropPlayer(x, y) {
    const p = new Player(x - 5, y, this.bhaiId);
    p.state = 'drop'; p.vy = 40; p.inv = 2.2;
    this.player = p;
    this.introBhai(p.bhai);
  },

  /** Respawn above the last Tiranga, parachuting in. */
  respawn() {
    const W = this.world, cp = this.checkpoint;
    let y = cp.y - 24;
    for (let i = 0; i < 9 && !W.boxSolid(cp.x - 5, y - 40, 10, 22) && y - 40 > 0; i++) y -= 16;
    this.bhaiId = this.randomBhai(this.bhaiId);
    const p = new Player(cp.x - 5, y - 22, this.bhaiId);
    p.state = 'drop'; p.inv = 2.4;
    this.player = p;
    this.introBhai(p.bhai);
  },

  introBhai(b, rescued) {
    this.banner({ type: 'bhai', title: b.name.toUpperCase(), sub: rescued ? `RESCUED! · ${b.hindi}` : `${b.hindi} · ${b.role}`, color: b.color, bhai: b, dur: 1.9 });
    VOICE.say(b.lines.intro, Object.assign({ force: true }, b.voice));
    UI.onBhaiChange(b);
  },

  /* ------------------------------------------------------------ events */
  rescue(cage) {
    this.rescues++; this.lives++;
    Progress.rescued = (Progress.rescued || 0) + 1;
    const p = this.player;
    let id = cage.bhai;
    if (p && id === p.bhai.id) id = this.randomBhai(id);
    this.addScore(1000, cage.cx, cage.y, '#7fe3ff');
    SND.play('rescue');
    if (p && p.alive) {
      this.bhaiId = id;
      p.setBhai(id);
      p.specials = Math.max(p.specials, 3);
      p.hp = DIFFICULTY[Settings.difficulty].hp;
      p.inv = Math.max(p.inv, 1.2);
      fxSmoke(p.cx, p.cy, 8, 5, 'rgba(255,255,255,0.6)');
      fxConfetti(p.cx, p.y, 30);
      this.introBhai(BHAI_BY_ID[id], true);
    } else {
      this.bhaiId = id;
    }
    this.popText(cage.cx, cage.y - 12, '+1 BHAI', '#7fe3ff', 1.3);
  },

  collect(c) {
    this.collected++;
    this.addScore(250, c.cx, c.y);
    SND.play('collect');
    this.popText(c.cx, c.y - 8, this.level.collectible.name.toUpperCase(), '#ffe066', 0.9);
    if (this.collected === this.totalCollect) this.banner({ type: 'info', title: `SAARE ${this.level.collectible.name.toUpperCase()} MIL GAYE!`, sub: '+2000 BONUS', color: '#ffe066', dur: 2.4 }), this.addScore(2000);
  },

  setCheckpoint(x, y) {
    this.checkpoint = { x, y };
    SND.play('flag');
    this.addScore(200, x, y - 40);
    this.popText(x, y - 50, 'CHECKPOINT · JAI HIND!', '#ff9933', 1.1);
    VOICE.say(L('Jai Hind!', 'जय हिन्द!'), { pitch: 1, force: false });
  },

  onCrateBroken(x, y) {
    if (chance(0.3)) this.objects.push(new Tiffin(x, y));
  },

  spawnFallingCrate(tx, ty) {
    this.world.fg[ty * this.world.w + tx] = 0;
    this.world.touch(tx, ty);
    this.objects.push(new FallingCrate(tx, ty));
  },

  onKill(e, info) {
    this.kills++;
    this.combo++; this.comboT = 2.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const pts = Math.round(e.D.score * (1 + (this.combo - 1) * 0.25));
    this.addScore(pts, e.cx, e.y);
    for (const [n, word] of COMBO_WORDS) {
      if (this.combo === n) {
        this.comboWord = { word, t: 0 };
        SND.play('combo');
        VOICE.say(L(word.replace(/[!:]/g, ''), ''), { pitch: 1.1, rate: 1.1 });
        Game.shake(3);
      }
    }
    const p = this.player;
    if (p && p.alive && chance(0.07)) this.bubble(p, pick(p.bhai.lines.kill), 1.3, p.bhai.color);
    void info;
  },

  onPlayerDeath(p) {
    this.deaths++;
    this.combo = 0;
    this.respawnT = 2;
    this.slowmo = 0;
    this.banner({ type: 'death', title: 'BHAI GAYA KAAM SE!', sub: this.lives > 0 ? `Agla bhai aa raha hai... (${this.lives} bache)` : 'Koi bhai nahi bacha!', color: '#ff4d4d', dur: 1.9 });
    VOICE.say(L('Nahiii!', 'नहीं!'), { pitch: 0.9, force: true });
    void p;
  },

  startBoss() {
    const A = this.arena;
    for (let y = 0; y < A.wallRow; y++) {
      this.world.set(A.tx0 - 1, y, T.STEEL);
      this.world.hp[y * this.world.w + A.tx0 - 1] = Infinity;
    }
    fxDust((A.tx0 - 1) * TILE + 8, A.floorY, 10);
    this.boss = new BOSS_TYPES[A.kind](A);
    MUSIC.play('boss');
    SND.play('bossRoar');
    this.letterboxT = 2.6;
    this.banner({ type: 'boss', title: this.boss.name, sub: `${this.boss.hindi} · ${this.boss.tagline}`, color: '#ff3d5a', dur: 2.6 });
    VOICE.say(L(this.boss.tagline, ''), { pitch: 0.6, force: true });
  },

  onBossDefeated(b) {
    this.bossDone = true;
    this.addScore(5000, b.cx, b.cy, '#ffd23f');
    for (const e of this.enemies) if (e.alive) e.die({ kind: 'explosion', vy: -250 });
    this.banner({ type: 'info', title: 'BOSS KHATAM!', sub: 'Ab chopper pakdo!', color: '#ffd23f', dur: 2.6 });
    MUSIC.play(this.level.music);
    if (b instanceof CopterBoss) {
      this.bubble({ cx: b.cx, y: b.y, x: b.x, w: b.w }, 'Main wapas aaunga!', 2.2, '#ffd0d0');
    }
    const A = this.arena;
    const hx = clamp(this.player ? this.player.cx : A.x0 + A.w / 2, A.x0 + 60, A.x1 - 60);
    this.helis.push(new Heli('extract', hx, A.floorY - 110));
  },

  extract(heli) {
    if (this.state !== 'playing') return;
    this.state = 'extracting';
    this.extractT = 2.2;
    SND.play('rescue');
    this.player.inv = 99;
    void heli;
  },

  completeLevel() {
    const def = this.level;
    const time = this.levelTime;
    const timeBonus = Math.max(0, Math.round((420 - time) * 10));
    const lifeBonus = this.lives * 500;
    this.score += timeBonus + lifeBonus;
    const ratio = this.totalCollect ? this.collected / this.totalCollect : 1;
    const stars = 1 + (ratio >= 0.7 ? 1 : 0) + (this.deaths <= 1 ? 1 : 0);
    const idx = this.levelIndex;
    Progress.unlocked = Math.max(Progress.unlocked, Math.min(LEVELS.length, idx + 2));
    Progress.best[def.id] = Math.max(Progress.best[def.id] || 0, this.score);
    Progress.stars[def.id] = Math.max(Progress.stars[def.id] || 0, stars);
    saveProgress();
    this.state = 'complete';
    MUSIC.play('victory');
    VOICE.say(L('Mission safal! Paisa vasool!', 'मिशन सफल! पैसा वसूल!'), { force: true });
    UI.showResult({ def, time, timeBonus, lifeBonus, stars, kills: this.kills, rescues: this.rescues, collected: this.collected, total: this.totalCollect, score: this.score, bestCombo: this.bestCombo, last: idx === LEVELS.length - 1 });
  },

  gameOver() {
    this.state = 'gameover';
    MUSIC.play('gameover');
    UI.showGameOver({ score: this.score, kills: this.kills, def: this.level });
  },

  /* ---------------------------------------------------------- helpers */
  addProj(p) { this.projectiles.push(p); },
  addObj(o) { this.objects.push(o); },
  addEnemy(e) { this.enemies.push(e); },
  shake(a) { this.shakeAmt = Math.min(16, Math.max(this.shakeAmt, a * (Settings.shake ? 1 : 0.25))); },
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); },
  flash(a, c = '#ffffff') { this.flashA = Math.max(this.flashA, a); this.flashC = c; },
  startSlowmo(t) { this.slowmo = t; this.letterboxT = Math.max(this.letterboxT, t); SND.play('special'); },
  noise(x, y, r) { for (const e of this.enemies) if (e.alive && Math.abs(e.cx - x) < r && Math.abs(e.cy - y) < r * 0.6) e.hearNoise(x); },
  addScore(n, x, y, color) { this.score += n; if (x !== undefined) this.popText(x, y - 6, '+' + n, color || '#ffe066', 0.75); },

  nearestEnemy(x, y, range, dirVx) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dirVx && sign(e.cx - x) !== sign(dirVx) && Math.abs(e.cx - x) > 20) continue;
      const d = dist(x, y, e.cx, e.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  nearestEnemyTo(self, range) {
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (e === self || !e.alive) continue;
      const d = dist(self.cx, self.cy, e.cx, e.cy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  /** Melee: damage goons/boss/props in a box, and bat enemy bullets back. */
  meleeHit(p, box, dmg, knock, kind) {
    let hit = false;
    for (const e of this.enemies) {
      if (e.alive && overlaps(box, e)) {
        e.hurt(e.D.heavy ? dmg * 0.6 : dmg, { x: p.cx, y: p.cy, vx: p.facing * knock, vy: -240, kind, owner: 'player' });
        hit = true;
      }
    }
    if (this.boss && this.boss.alive) for (const hb of this.boss.hitboxes()) if (overlaps(box, hb)) { hb.hurt(dmg * 0.6, { kind }); hit = true; break; }
    for (const o of this.objects) if (o.shootable && !o.remove && overlaps(box, o)) { o.hurt(3, { x: p.cx, y: p.cy, owner: 'player' }); hit = true; }
    if (this.reflectBox(box, p)) hit = true;
    return hit;
  },

  reflectBox(box, p) {
    let n = 0;
    for (const pr of this.projectiles) {
      if (pr.owner !== 'enemy' || pr.remove) continue;
      if (pr.x < box.x - 4 || pr.x > box.x + box.w + 4 || pr.y < box.y - 6 || pr.y > box.y + box.h + 6) continue;
      this.reflect(pr, p, p.facing);
      n++;
    }
    if (n) this.popText(p.cx + p.facing * 16, p.y - 12, 'RETURN TO SENDER!', '#7fe3ff', 0.8);
    return n > 0;
  },

  reflectNear(x, y, r, p) {
    for (const pr of this.projectiles) {
      if (pr.owner !== 'enemy' || pr.remove) continue;
      if (dist(pr.x, pr.y, x, y) < r) this.reflect(pr, p, sign(pr.x - x) || 1);
    }
  },

  reflect(pr, p, dir) {
    pr.owner = 'player'; pr.src = p; pr.ff = false;
    const sp = Math.max(260, Math.hypot(pr.vx, pr.vy) * 1.3);
    pr.vx = dir * sp; pr.vy = -Math.abs(pr.vy) * 0.2;
    if (pr.kind === 'ebullet') pr.kind = 'bullet';
    pr.t = 0; pr.homing = 0; pr.hit.clear();
    fxSparks(pr.x, pr.y, 5, '#7fe3ff', 100);
  },

  /* -------------------------------------------------- HUD text channels */
  banner(b) { b.t = 0; this.banners = this.banners.filter(x => x.type !== b.type || b.type === 'info'); this.banners.push(b); },
  specialCallout(bhai) { this.callout = { text: bhai.special.name.toUpperCase(), color: bhai.color, t: 0 }; },
  popText(x, y, text, color = '#ffffff', size = 1) { this.texts.push({ x, y, text, color, size, t: 0 }); if (this.texts.length > 40) this.texts.shift(); },
  bubble(ent, text, dur = 1.5, color = '#ffffff', sticky) {
    this.bubbles = this.bubbles.filter(b => b.ent !== ent);
    this.bubbles.push({ ent, text, dur, color, t: 0, sticky, x: ent.cx, y: ent.y });
    if (this.bubbles.length > 8) this.bubbles.shift();
  },
  dialog(lines) { this.dialogState = { lines, i: 0, t: 0 }; },

  /* -------------------------------------------------------------- update */
  update(dt) {
    this.time += dt;
    this.updateHudTimers(dt);
    if (this.state === 'title' || this.state === 'menu') { this.attract(dt); return; }
    if (this.state !== 'playing' && this.state !== 'extracting') return;
    if (Input.pressed('pause') && this.state === 'playing') { UI.pause(); return; }
    if (this.hitStopT > 0) { this.hitStopT -= dt; this.updateCamera(dt); return; }

    this.levelTime += dt;
    const W = this.world;
    const slow = this.slowmo > 0 ? 0.28 : 1;
    if (this.slowmo > 0) this.slowmo -= dt;
    const edt = dt * slow;

    for (const h of this.helis) h.update(dt);
    const p = this.player;
    if (p && this.state === 'playing') p.update(dt, W);
    if (p && p.y < 0 && p.alive) { p.y = 0; p.vy = Math.max(p.vy, 0); }

    const cx = this.cam.x + VIEW_W / 2;
    for (const e of this.enemies) {
      if (Math.abs(e.cx - cx) < VIEW_W * 0.85 + 60 || !e.alive || e.burnT > 0) e.update(edt, W);
    }
    for (const pr of this.projectiles) pr.update(pr.owner === 'enemy' ? edt : dt, W);
    for (const o of this.objects) if (!o.remove && (Math.abs(o.cx - cx) < VIEW_W + 120 || o.lit)) o.update(dt, W);
    if (this.boss && this.boss.alive) this.boss.update(edt, W);
    FX.update(slow < 1 ? dt * 0.5 : dt, W);
    BG.update(dt, this.camX);

    this.enemies = this.enemies.filter(e => !e.remove);
    this.projectiles = this.projectiles.filter(pr => !pr.remove && pr.x > -50 && pr.x < W.pxW + 50 && pr.y < W.pxH + 50 && pr.y > -400);
    this.objects = this.objects.filter(o => !o.remove);
    this.helis = this.helis.filter(h => !h.remove);

    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    if (p && !p.alive && this.state === 'playing') {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        if (this.lives > 0) { this.lives--; this.respawn(); }
        else this.gameOver();
      }
    }

    if (this.arena && !this.boss && !this.bossDone && p && p.alive && p.x > this.arena.trigger) this.startBoss();

    if (this.state === 'extracting') {
      this.extractT -= dt;
      if (this.extractT <= 0) this.completeLevel();
    }
    this.updateCamera(dt);
    TouchUI.setSpecialCount(p ? p.specials : 0);
  },

  updateHudTimers(dt) {
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < b.dur);
    if (this.callout) { this.callout.t += dt; if (this.callout.t > 1.6) this.callout = null; }
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter(t => t.t < 1.1);
    for (const b of this.bubbles) { b.t += dt; if (b.ent && !b.ent.remove) { b.x = b.ent.cx; b.y = b.ent.y; } }
    this.bubbles = this.bubbles.filter(b => b.t < b.dur);
    if (this.comboWord) { this.comboWord.t += dt; if (this.comboWord.t > 1.5) this.comboWord = null; }
    if (this.dialogState) {
      const d = this.dialogState;
      d.t += dt;
      if (d.t > 2.6) { d.t = 0; d.i++; if (d.i >= d.lines.length) this.dialogState = null; }
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.5);
    this.letterboxT -= dt;
    const want = this.letterboxT > 0 || this.dialogState ? 1 : 0;
    this.letterbox = approach(this.letterbox, want, dt * 3);
  },

  updateCamera(dt) {
    const W = this.world, p = this.player;
    if (!W) return;
    let tx = this.cam.x, ty = this.cam.y;
    const focus = p && p.alive ? p : (this.helis[0] || p);
    if (focus) {
      const fcx = focus.cx !== undefined ? focus.cx : focus.x, fcy = focus.cy !== undefined ? focus.cy : focus.y;
      tx = fcx - VIEW_W / 2 + (p && p.alive ? p.facing * 36 : 0);
      ty = fcy - VIEW_H * (TouchUI.visible ? 0.5 : 0.56);
    }
    const B = this.boss;
    if (B && B.alive && this.arena) {
      const A = this.arena;
      // frame the boss and the bhai together, never losing the bhai
      if (p && p.alive && B.state !== 'intro') {
        tx = lerp(p.cx, B.cx, 0.4) - VIEW_W / 2;
        tx = clamp(tx, p.cx - VIEW_W + 70, p.cx - 70);
      } else tx = B.cx - VIEW_W / 2;
      if (A.w <= VIEW_W) tx = A.x0 + A.w / 2 - VIEW_W / 2;
      else tx = clamp(tx, A.x0 - 8, A.x1 + 8 - VIEW_W);
      ty = Math.min(ty, A.floorY - VIEW_H + 40);
      ty = Math.max(ty, A.floorY - VIEW_H - 40);
    }
    const kx = 1 - Math.exp(-dt * 6), ky = 1 - Math.exp(-dt * 4.5);
    this.cam.x = lerp(this.cam.x, tx, kx);
    this.cam.y = lerp(this.cam.y, ty, ky);
    this.cam.x = clamp(this.cam.x, 0, Math.max(0, W.pxW - VIEW_W));
    this.cam.y = clamp(this.cam.y, 0, Math.max(0, W.pxH - VIEW_H));
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 22);
    const s = this.shakeAmt;
    this.camX = Math.round(this.cam.x + (s ? rand(-s, s) : 0));
    this.camY = Math.round(this.cam.y + (s ? rand(-s, s) * 0.7 : 0));
  },

  /** Title-screen backdrop: a slow pan over Mumbai with fireworks. */
  attract(dt) {
    if (!BG.theme) BG.setup('mumbai', 'dusk', 'rain');
    BG.update(dt, this.time * 20);
    FX.update(dt, null);
    this.attractT = (this.attractT || 0) - dt;
    if (this.attractT <= 0) { this.attractT = rand(0.6, 1.4); fxFirework(rand(40, VIEW_W - 40), rand(30, 120)); if (chance(0.5)) SND.play('firework', { vol: 0.25 }); }
  },

  /* ---------------------------------------------------------------- draw */
  draw() {
    const g = Gfx.ctx;
    if (this.state === 'title' || this.state === 'menu' || !this.world) {
      BG.draw(g, this.time * 20, 370, 640);
      FX.draw(g, 0, 0);
      BG.drawWeather(g);
      this.drawVignette(g);
      Gfx.uctx.clearRect(0, 0, Gfx.cssW, Gfx.cssH);
      return;
    }
    const camX = this.camX, camY = this.camY, W = this.world;
    BG.draw(g, camX, camY, W.pxH);
    W.draw(g, camX, camY);
    const night = !!this.level.night;
    for (const d of this.decor) {
      if (d.x < camX - 80 || d.x > camX + VIEW_W + 80 || d.y < camY - 60 || d.y > camY + VIEW_H + 80) continue;
      DECOR_DRAW[d.type](g, d, Math.round(d.x - camX), Math.round(d.y - camY), this.time, night, this.level.theme);
    }
    for (const o of this.objects) if (o.x > camX - 60 && o.x < camX + VIEW_W + 60) o.draw(g, camX, camY);
    for (const e of this.enemies) if (e.x > camX - 40 && e.x < camX + VIEW_W + 40) e.draw(g, camX, camY);
    if (this.boss && this.boss.alive) this.boss.draw(g, camX, camY);
    const p = this.player;
    if (p && this.state !== 'extracting' && this.state !== 'complete') {
      if (p.state === 'drop' && p.alive) drawParachute(g, Math.round(p.cx - camX), Math.round(p.y - camY), this.time);
      p.draw(g, camX, camY);
    }
    for (const h of this.helis) h.draw(g, camX, camY);
    for (const pr of this.projectiles) pr.draw(g, camX, camY);
    FX.draw(g, camX, camY);
    BG.drawWeather(g);
    this.drawLighting(g, night);
    if (this.slowmo > 0) {
      g.globalCompositeOperation = 'multiply'; g.fillStyle = '#e8c49a'; g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.globalCompositeOperation = 'source-over';
    }
    this.drawVignette(g);
    if (this.flashA > 0) { g.globalAlpha = this.flashA; g.fillStyle = this.flashC; g.fillRect(0, 0, VIEW_W, VIEW_H); g.globalAlpha = 1; }
    this.drawUI();
  },

  drawLighting(g, night) {
    if (!this.lightCv || this.lightCv.width !== VIEW_W || this.lightCv.height !== VIEW_H) { this.lightCv = makeCanvas(VIEW_W, VIEW_H); this.lightCtx = this.lightCv.getContext('2d'); }
    const camX = this.camX, camY = this.camY;
    if (night) {
      const L = this.lightCtx;
      L.globalCompositeOperation = 'source-over';
      L.clearRect(0, 0, VIEW_W, VIEW_H);
      L.fillStyle = 'rgba(12,6,34,0.42)';
      L.fillRect(0, 0, VIEW_W, VIEW_H);
      L.globalCompositeOperation = 'destination-out';
      const hole = (x, y, r, k) => {
        const gr = L.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(0,0,0,${k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        L.fillStyle = gr; L.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const p = this.player;
      if (p) hole(p.cx - camX, p.cy - camY, 95, 0.9);
      for (const l of FX.lights) hole(l.x - camX, l.y - camY, l.r, clamp(l.intensity, 0, 1) * (1 - l.t / l.life * 0.5));
      for (const e of this.enemies) if (e.burnT > 0) hole(e.cx - camX, e.cy - camY, 40, 0.8);
      if (this.boss && this.boss.alive) hole(this.boss.cx - camX, this.boss.cy - camY, 120, 0.7);
      g.drawImage(this.lightCv, 0, 0);
    }
    g.globalCompositeOperation = 'lighter';
    for (const l of FX.lights) {
      const x = l.x - camX, y = l.y - camY;
      if (x < -l.r || y < -l.r || x > VIEW_W + l.r || y > VIEW_H + l.r) continue;
      const k = (1 - l.t / l.life) * 0.22 * l.intensity;
      const gr = g.createRadialGradient(x, y, 0, x, y, l.r * 0.6);
      gr.addColorStop(0, rgba(l.color, k)); gr.addColorStop(1, rgba(l.color, 0));
      g.fillStyle = gr; g.fillRect(x - l.r, y - l.r, l.r * 2, l.r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  },

  drawVignette(g) {
    if (!this.vigCv || this.vigCv.width !== VIEW_W || this.vigCv.height !== VIEW_H) {
      this.vigCv = makeCanvas(VIEW_W, VIEW_H);
      const v = this.vigCv.getContext('2d');
      const gr = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
      gr.addColorStop(0, 'rgba(10,4,20,0)'); gr.addColorStop(1, 'rgba(10,4,20,0.5)');
      v.fillStyle = gr; v.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    g.drawImage(this.vigCv, 0, 0);
  },

  /* ------------------------------------------------------------- HUD */
  drawUI() {
    const u = Gfx.uctx, W = Gfx.cssW, H = Gfx.cssH, ins = TouchUI.insets;
    u.clearRect(0, 0, W, H);
    const s = clamp(Math.min(W, H) / 400, 0.75, 1.5);
    // world-anchored text
    for (const d of this.decor) {
      if (d.type === 'billboard' && d.x > this.camX - 60 && d.x < this.camX + VIEW_W + 60) drawDecorText(u, d);
    }
    if (this.boss && this.boss.alive && this.boss.drawUI) this.boss.drawUI(u);
    for (const t of this.texts) {
      const [x, y] = Gfx.toScreen(t.x, t.y - t.t * 26);
      const a = clamp(1.6 - t.t * 1.5, 0, 1);
      u.globalAlpha = a;
      const pop = t.t < 0.12 ? 1 + (0.12 - t.t) * 5 : 1;
      hudText(u, t.text, x, y, Math.round(16 * s * t.size * pop), t.color, { align: 'center', weight: 700 });
      u.globalAlpha = 1;
    }
    const placed = [];
    for (const b of this.bubbles) this.drawBubble(u, b, s, placed);

    // letterbox bars
    if (this.letterbox > 0) {
      const bh = Math.round(H * 0.09 * this.letterbox);
      u.fillStyle = '#05030a'; u.fillRect(0, 0, W, bh); u.fillRect(0, H - bh, W, bh);
    }
    if (this.state !== 'playing' && this.state !== 'extracting') return;

    const p = this.player;
    const left = ins.l + 12 * s, top = ins.t + 10 * s;
    // portrait card
    if (p) {
      const ps = Math.round(46 * s);
      if (!this.portraitCache || this.portraitCache.id !== p.bhai.id) this.portraitCache = { id: p.bhai.id, c: makePortrait(p.look, 4) };
      u.fillStyle = 'rgba(14,6,22,0.72)';
      roundRect(u, left, top, ps + 160 * s, ps + 6 * s, 8 * s); u.fill();
      u.fillStyle = p.bhai.color; u.fillRect(left, top, 4 * s, ps + 6 * s);
      u.imageSmoothingEnabled = false;
      u.drawImage(this.portraitCache.c, left + 7 * s, top + 3 * s, ps, ps);
      hudText(u, p.bhai.name.toUpperCase(), left + ps + 14 * s, top + 13 * s, Math.round(17 * s), '#ffffff', { weight: 700 });
      // hp pips + specials
      const maxHp = DIFFICULTY[Settings.difficulty].hp;
      for (let i = 0; i < maxHp; i++) drawShield(u, left + ps + 16 * s + i * 13 * s, top + 26 * s, 5.5 * s, i < p.hp && p.alive);
      for (let i = 0; i < Math.max(p.specials, 0); i++) drawStar(u, left + ps + 20 * s + (maxHp * 13 + 4) * s + i * 13 * s, top + 27 * s, 5.5 * s, p.bhai.color);
      hudText(u, `BHAI ×${this.lives}`, left + ps + 14 * s, top + 42 * s, Math.round(14 * s), '#ffd23f', { weight: 600 });
    }
    // score + collectibles (left of the DOM pause button)
    const right = W - ins.r - 64 * s;
    hudText(u, this.score.toLocaleString('en-IN'), right, top + 14 * s, Math.round(26 * s), '#ffffff', { align: 'right', weight: 700 });
    hudText(u, `${this.level.collectible.name.toUpperCase()} ${this.collected}/${this.totalCollect}`, right, top + 36 * s, Math.round(14 * s), '#ffe066', { align: 'right', weight: 600 });
    if (this.combo >= 2) {
      const a = clamp(this.comboT / 0.6, 0, 1);
      u.globalAlpha = a;
      hudText(u, `${this.combo}× COMBO`, right, top + 54 * s, Math.round(16 * s), '#ff9ec7', { align: 'right', weight: 700 });
      u.globalAlpha = 1;
    }
    if (this.slowmo > 0) posterText(u, 'SLOW MOTION', W / 2, H * 0.14, Math.round(26 * s), { fill: ['#fff2c8', '#e8b04a'], alpha: 0.85 });

    // boss bar
    const B = this.boss;
    if (B && B.alive && B.state !== 'intro') {
      const bw = Math.min(W * 0.5, 420 * s), bx = W / 2 - bw / 2, by = H - ins.b - 26 * s - (TouchUI.visible ? 0 : 0);
      const barY = TouchUI.visible ? top + 4 * s : by;
      const k = clamp(B.hp / B.maxHp, 0, 1);
      this.bossBar = lerp(this.bossBar || k, k, 0.08);
      u.fillStyle = 'rgba(14,6,22,0.8)'; roundRect(u, bx - 4 * s, barY - 4 * s, bw + 8 * s, 22 * s, 6 * s); u.fill();
      u.fillStyle = '#5a0f1f'; u.fillRect(bx, barY, bw, 14 * s);
      u.fillStyle = '#ffd23f'; u.fillRect(bx, barY, bw * this.bossBar, 14 * s);
      u.fillStyle = B.phase === 2 ? '#ff3d5a' : '#ff8a1f'; u.fillRect(bx, barY, bw * k, 14 * s);
      hudText(u, B.name, W / 2, barY + 7 * s, Math.round(13 * s), '#ffffff', { align: 'center', weight: 700 });
    }

    // special callout ribbon
    if (this.callout) {
      const c = this.callout, k = c.t < 0.15 ? c.t / 0.15 : c.t > 1.3 ? (1.6 - c.t) / 0.3 : 1;
      u.globalAlpha = clamp(k, 0, 1);
      posterText(u, c.text, W / 2, H * 0.27, Math.round(30 * s), { fill: ['#ffffff', c.color] });
      u.globalAlpha = 1;
    }
    if (this.comboWord) {
      const c = this.comboWord, k = c.t < 0.12 ? c.t / 0.12 : c.t > 1.1 ? (1.5 - c.t) / 0.4 : 1;
      const sc = c.t < 0.12 ? 1.6 - c.t * 5 : 1;
      u.globalAlpha = clamp(k, 0, 1);
      posterText(u, c.word, W - ins.r - 110 * s, H * 0.42, Math.round(34 * s * sc), { fill: ['#fff3a0', '#ff2d95'], skew: -0.2 });
      u.globalAlpha = 1;
    }
    for (const b of this.banners) this.drawBanner(u, b, s, W, H);
    if (this.dialogState) this.drawDialog(u, s, W, H);
  },

  drawBanner(u, b, s, W, H) {
    const inK = clamp(b.t / 0.25, 0, 1), outK = clamp((b.dur - b.t) / 0.3, 0, 1);
    const k = Math.min(inK, outK);
    const slide = (1 - easeOutBack(inK)) * W * 0.35;
    u.globalAlpha = k;
    if (b.type === 'mission' || b.type === 'boss') {
      const y = H * (b.type === 'boss' ? 0.4 : 0.34);
      u.fillStyle = 'rgba(8,3,14,0.6)'; u.fillRect(0, y - 44 * s, W, 88 * s);
      u.fillStyle = b.color; u.fillRect(0, y - 44 * s, W, 3 * s); u.fillRect(0, y + 41 * s, W, 3 * s);
      posterText(u, b.title, W / 2 + slide, y - 6 * s, Math.round((b.type === 'boss' ? 52 : 46) * s), { fill: b.type === 'boss' ? ['#ffe0e0', '#ff3d5a'] : ['#fff3a0', '#ff8a1f'] });
      hudText(u, b.sub, W / 2 - slide, y + 28 * s, Math.round(17 * s), '#ffffff', { align: 'center', weight: 600, font: FONT_BODY });
    } else if (b.type === 'bhai') {
      const y = H * 0.8;
      const ps = 54 * s;
      if (!b.portrait) b.portrait = makePortrait(b.bhai.look, 4);
      u.fillStyle = 'rgba(8,3,14,0.7)';
      const bw = 300 * s, bx = W / 2 - bw / 2 + slide;
      roundRect(u, bx, y - ps / 2 - 6 * s, bw, ps + 12 * s, 10 * s); u.fill();
      u.fillStyle = b.color; u.fillRect(bx, y - ps / 2 - 6 * s, 5 * s, ps + 12 * s);
      u.imageSmoothingEnabled = false;
      u.drawImage(b.portrait, bx + 12 * s, y - ps / 2, ps, ps);
      posterText(u, b.title, bx + ps + 22 * s, y - 10 * s, Math.round(28 * s), { fill: ['#ffffff', b.color], align: 'left', skew: -0.1 });
      hudText(u, b.sub, bx + ps + 22 * s, y + 18 * s, Math.round(14 * s), '#e8dcff', { weight: 600, font: FONT_BODY });
    } else if (b.type === 'death') {
      posterText(u, b.title, W / 2 + slide, H * 0.38, Math.round(44 * s), { fill: ['#ffd0d0', '#ff2d2d'] });
      hudText(u, b.sub, W / 2, H * 0.38 + 34 * s, Math.round(16 * s), '#ffffff', { align: 'center', weight: 600, font: FONT_BODY });
    } else {
      posterText(u, b.title, W / 2 + slide, H * 0.3, Math.round(34 * s), { fill: ['#fff3a0', b.color] });
      if (b.sub) hudText(u, b.sub, W / 2, H * 0.3 + 28 * s, Math.round(15 * s), '#ffffff', { align: 'center', weight: 600, font: FONT_BODY });
    }
    u.globalAlpha = 1;
  },

  drawBubble(u, b, s, placed) {
    const [x, y0] = Gfx.toScreen(b.x, b.y);
    const y = y0 - 10 * s;
    const fs = Math.round(12 * s);
    u.font = `700 ${fs}px ${FONT_BODY}`;
    const maxW = 170 * s;
    const words = b.text.split(' '), lines = [];
    let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (u.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const lw = Math.max(...lines.map(l => u.measureText(l).width));
    const pad = 6 * s, bh = lines.length * fs * 1.15 + pad * 1.4, bw = lw + pad * 2;
    const k = b.t < 0.1 ? b.t / 0.1 : b.t > b.dur - 0.2 ? (b.dur - b.t) / 0.2 : 1;
    const bx = clamp(x - bw / 2, 4, Gfx.cssW - bw - 4);
    let by = y - bh - 6 * s;
    // stack instead of overlapping when several goons shout at once
    for (let i = 0; i < placed.length; i++) {
      const r = placed[i];
      if (bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y) { by = r.y - bh - 4; i = -1; }
    }
    placed.push({ x: bx, y: by, w: bw, h: bh });
    u.globalAlpha = clamp(k, 0, 1);
    u.fillStyle = 'rgba(18,8,24,0.9)';
    roundRect(u, bx - 2, by - 2, bw + 4, bh + 4, 9 * s); u.fill();
    u.fillStyle = b.color;
    roundRect(u, bx, by, bw, bh, 8 * s); u.fill();
    u.beginPath(); u.moveTo(clamp(x, bx + 8, bx + bw - 8) - 5 * s, by + bh - 1); u.lineTo(clamp(x, bx + 8, bx + bw - 8), by + bh + 6 * s); u.lineTo(clamp(x, bx + 8, bx + bw - 8) + 5 * s, by + bh - 1); u.fill();
    u.fillStyle = '#1a0a14'; u.textAlign = 'center'; u.textBaseline = 'top';
    lines.forEach((l, i) => u.fillText(l, bx + bw / 2, by + pad * 0.7 + i * fs * 1.15));
    u.globalAlpha = 1;
  },

  drawDialog(u, s, W, H) {
    const d = this.dialogState, ln = d.lines[d.i];
    const k = clamp(d.t / 0.2, 0, 1);
    const bw = Math.min(W - 40 * s, 620 * s), bh = 70 * s, bx = W / 2 - bw / 2, by = Math.max(H * 0.17, 70 * s);
    u.globalAlpha = k;
    u.fillStyle = 'rgba(8,3,14,0.88)'; roundRect(u, bx, by, bw, bh, 10 * s); u.fill();
    u.strokeStyle = ln.color; u.lineWidth = 2 * s; roundRect(u, bx, by, bw, bh, 10 * s); u.stroke();
    hudText(u, ln.who, bx + 16 * s, by + 16 * s, Math.round(16 * s), ln.color, { weight: 700 });
    const chars = Math.floor(clamp(d.t * 45, 0, ln.text.length));
    u.font = `600 ${Math.round(15 * s)}px ${FONT_BODY}`;
    u.fillStyle = '#ffffff'; u.textAlign = 'left'; u.textBaseline = 'top';
    u.fillText(ln.text.slice(0, chars), bx + 16 * s, by + 30 * s, bw - 32 * s);
    u.globalAlpha = 1;
  },
};

/* ------------------------------------------------------------- HUD bits */
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function drawShield(g, x, y, r, full) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y - r * 0.5); g.lineTo(x + r * 0.8, y + r * 0.6); g.lineTo(x, y + r * 1.1); g.lineTo(x - r * 0.8, y + r * 0.6); g.lineTo(x - r, y - r * 0.5); g.closePath();
  g.fillStyle = full ? '#ff9933' : 'rgba(255,255,255,0.15)'; g.fill();
  g.strokeStyle = full ? '#fff3c0' : 'rgba(255,255,255,0.4)'; g.lineWidth = 1.2; g.stroke();
}
function drawStar(g, x, y, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = color; g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke();
}
/** Respawn parachute: a white canopy with saffron and green bands. */
function drawParachute(g, x, y, t) {
  const sway = Math.round(Math.sin(t * 3) * 2);
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - 9 + sway, y - 16); g.lineTo(x - 2, y + 4); g.moveTo(x + 9 + sway, y - 16); g.lineTo(x + 2, y + 4); g.stroke();
  g.fillStyle = '#140c10'; g.beginPath(); g.ellipse(x + sway, y - 18, 13, 7, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + sway, y - 18, 12, 6, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#ff9933'; g.fillRect(x + sway - 12, y - 20, 6, 2);
  g.fillStyle = '#138808'; g.fillRect(x + sway + 6, y - 20, 6, 2);
}
