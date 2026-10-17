/* =============================================================================
 * BOSSES — Bunty Bouncer, the HORN OK PLEASE truck, Kabaad-Bot 3000 and Don
 * Dhoka's Dhoka-Copter. Each is a small state machine with telegraphed
 * attacks, a phase two at half health and a chained-explosion death.
 * ========================================================================== */

class Boss {
  constructor(arena) {
    this.arena = arena;
    this.alive = true; this.dying = false; this.deathT = 0;
    this.t = 0; this.state = 'intro'; this.st = 0; this.flashT = 0; this.phase = 1; this.facing = -1;
    this.vx = 0; this.vy = 0; this.invuln = false; this.last = '';
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }

  makeBox(mult) {
    const self = this;
    return {
      x: 0, y: 0, w: 0, h: 0, mult, boss: true,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      hurt(d, info) { return self.hurt(d * this.mult, info); },
    };
  }
  hitboxes() { return this.boxes; }

  next(state) { this.state = state; this.st = 0; }

  /** Weighted pick that avoids repeating the previous attack. */
  choose(options) {
    const pool = Object.assign({}, options);
    if (pool[this.last] && Object.keys(pool).length > 1) pool[this.last] *= 0.25;
    let total = 0;
    for (const k in pool) total += pool[k];
    let r = Math.random() * total;
    for (const k in pool) { r -= pool[k]; if (r <= 0) { this.last = k; return k; } }
    return Object.keys(pool)[0];
  }

  hurt(dmg, info = {}) {
    if (!this.alive || this.dying || this.state === 'intro' || this.invuln) return false;
    this.hp -= dmg;
    this.flashT = 0.06;
    SND.play('hitMetal', { x: this.cx, y: this.cy, throttle: 0.08 });
    if (this.phase === 1 && this.hp <= this.maxHp / 2) { this.phase = 2; if (this.onPhase2) this.onPhase2(); }
    if (this.hp <= 0) { this.hp = 0; this.startDeath(); }
    return true;
  }

  hurtArea(x, y, r, dmg) {
    for (const b of this.hitboxes()) {
      const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
      if (dist(x, y, nx, ny) < r) { b.hurt(dmg, { x, y, kind: 'explosion' }); return true; }
    }
    return false;
  }

  contact(box) {
    const p = Game.player;
    if (p && p.alive && overlaps(box, p)) p.hurt(1, { x: box.x + box.w / 2, y: box.y + box.h / 2, kind: 'boss' });
  }

  faceP() { const p = Game.player; if (p && p.alive) this.facing = p.cx < this.cx ? -1 : 1; }

  startDeath() {
    this.dying = true; this.deathT = 0; this.boomT = 0;
    MUSIC.stop();
    Game.hitStop(0.3); Game.flash(0.7, '#ffffff');
    SND.play('bossRoar');
    for (const pr of Game.projectiles) if (pr.owner === 'enemy') pr.remove = true;
    if (this.deathLine) Game.bubble(this, this.deathLine, 2.2, '#ffd0d0');
  }

  updateDeath(dt) {
    this.deathT += dt;
    this.boomT -= dt;
    if (this.boomT <= 0) {
      this.boomT = 0.13;
      const b = pick(this.hitboxes());
      const x = rand(b.x, b.x + b.w), y = rand(b.y, b.y + b.h);
      fxExplosion(x, y, rand(14, 26), { holi: chance(0.4) });
      SND.play('smallBoom', { x, y, throttle: 0.05 });
      Game.shake(4);
    }
    if (this.deathT > 2.4) {
      this.alive = false;
      fxExplosion(this.cx, this.cy, 60, { holi: true });
      fxHoli(this.cx, this.cy, 80, 2);
      SND.play('boom', { throttle: 0 });
      Game.shake(14); vibrate([80, 50, 120]);
      Game.onBossDefeated(this);
    }
  }

  /** Simple floor physics inside the arena (arena floor is indestructible). */
  arenaPhysics(dt) {
    const A = this.arena;
    this.vy = Math.min(this.vy + GRAVITY * dt, 700);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.hitWall = 0;
    if (this.x < A.x0 + 4) { this.x = A.x0 + 4; this.hitWall = -1; }
    if (this.x + this.w > A.x1 - 4) { this.x = A.x1 - 4 - this.w; this.hitWall = 1; }
    const was = this.onGround;
    this.onGround = false;
    if (this.y + this.h >= A.floorY) { this.y = A.floorY - this.h; this.vy = 0; this.onGround = true; }
    this.landed = this.onGround && !was;
  }

  spawnMinion(kind, x) {
    const e = new Enemy(kind, x, this.arena.floorY - 140);
    e.state = 'alert'; e.react = 0.8; e.alertIcon = 0.8;
    Game.addEnemy(e);
    fxSmoke(e.cx, e.cy, 4, 4);
  }
}

/* ======================================================= BUNTY BOUNCER ==== */
const BUNTY_LOOK = { id: 'boss_bunty', big: true, skin: '#7a4a2a', hair: '#0e0c0c', hairStyle: 'spiky', beard: 'full', glasses: 'shades', eyes: 'angry', shirt: '#c41e3a', trim: '#ffd23f', chain: true, pants: '#1a1a22', shoes: '#0e0c0c', outfit: 'tee', weapon: 'none' };

class BuntyBoss extends Boss {
  constructor(arena) {
    super(arena);
    Object.assign(this, { name: 'BUNTY BOUNCER', hindi: 'बंटी बाउंसर', tagline: 'Entry mana hai!', maxHp: 90, hp: 90, w: 30, h: 56 });
    this.x = arena.x1 - 110; this.y = arena.floorY - this.h;
    this.body = this.makeBox(1); this.boxes = [this.body];
    this.throws = 0; this.deathLine = 'Mummy... VIP entry thi...';
  }
  syncBoxes() { Object.assign(this.body, { x: this.x, y: this.y, w: this.w, h: this.h }); }

  update(dt) {
    this.t += dt; this.st += dt; this.flashT -= dt;
    if (this.dying) { this.syncBoxes(); return this.updateDeath(dt); }
    const p = Game.player, spd = this.phase === 2 ? 1.3 : 1;
    this.body.mult = this.state === 'stunned' ? 1.6 : 1;
    switch (this.state) {
      case 'intro': this.faceP(); if (this.st > 2.4) this.next('idle'); break;
      case 'idle':
        this.vx = approach(this.vx, 0, 600 * dt); this.faceP();
        if (this.st > (this.phase === 2 ? 0.5 : 0.95)) {
          const pick2 = this.choose(this.phase === 2 ? { chargeWind: 3, leap: 3, throwWind: 2, summon: 1 } : { chargeWind: 3, leap: 2, throwWind: 2 });
          this.next(pick2);
          if (pick2 === 'chargeWind') Game.bubble(this, pick(['Ruk ja!', 'Line mein aa!', 'Entry mana hai!']), 1.1, '#ffd0d0');
          if (pick2 === 'leap') { this.vy = -540; this.vx = clamp((p ? p.cx - this.cx : 0) / 1.05, -270, 270); this.onGround = false; }
          if (pick2 === 'summon') { SND.play('whistle'); Game.bubble(this, 'Bhaiyon, aao!', 1.2, '#ffd0d0'); }
        }
        break;
      case 'chargeWind':
        this.vx = 0;
        if (Math.floor(this.st * 10) % 2 === 0) fxDust(this.cx - this.facing * 10, this.bottom, 1);
        if (this.st > 0.7 / spd) this.next('charge');
        break;
      case 'charge':
        this.vx = this.facing * 255 * spd;
        if (Math.random() < 0.5) fxDust(this.cx - this.facing * 12, this.bottom, 1);
        if (this.hitWall) {
          this.vx = 0; this.next('stunned');
          Game.shake(10); SND.play('stomp', { throttle: 0 }); SND.play('boom', { throttle: 0 });
          for (let i = 0; i < 12; i++) FX.spawn({ x: rand(this.arena.x0, this.arena.x1), y: this.arena.floorY - 260, vy: rand(50, 150), life: 1.6, color: '#8a7a6a', size: 2, collide: true });
          Game.bubble(this, 'Ouch... deewar kisne lagayi?', 1.6, '#ffd0d0');
        }
        break;
      case 'stunned':
        this.vx = 0;
        if (this.st > 1.6) this.next('idle');
        break;
      case 'leap':
        if (this.landed && this.st > 0.2) {
          Game.shake(8); SND.play('stomp', { throttle: 0 });
          fxDust(this.cx, this.bottom, 14);
          for (const d of [-1, 1]) Game.addProj(new Projectile({ x: this.cx + d * 16, y: this.bottom - 5, vx: d * 230, vy: 0, owner: 'enemy', kind: 'shock', ghost: true, life: 1.4, r: 7, dmg: 1, tileDmg: 0 }));
          this.vx = 0; this.next('idle');
        }
        break;
      case 'throwWind':
        this.vx = 0; this.faceP();
        if (this.st > 0.6 / spd) {
          const tgt = p && p.alive ? p : { cx: this.cx - 100, cy: this.arena.floorY };
          const t = 0.95, sx = this.cx, sy = this.y - 6;
          Game.addProj(new Projectile({ x: sx, y: sy, vx: (tgt.cx - sx) / t, vy: (tgt.cy - sy - 0.5 * GRAVITY * t * t) / t, grav: 1, owner: 'enemy', kind: 'cylinder', explode: 38, power: 6, dmg: 7, life: 2.5, spin: 9, tileDmg: 0, r: 5 }));
          SND.play('throw', { throttle: 0 });
          this.throws++;
          if (this.phase === 2 && this.throws % 2 === 1) this.st = 0.15; else this.next('idle');
        }
        break;
      case 'summon':
        if (this.st > 0.5) { this.spawnMinion('goonda', this.arena.x0 + 60); this.spawnMinion(chance(0.5) ? 'lathi' : 'goonda', this.arena.x1 - 60); this.next('idle'); }
        break;
    }
    this.arenaPhysics(dt);
    this.syncBoxes();
    if (this.state !== 'stunned' && this.state !== 'intro') this.contact({ x: this.x + 4, y: this.y + 8, w: this.w - 8, h: this.h - 8 });
  }

  draw(g, camX, camY) {
    let pose = 'idle', frame = Math.floor(this.t * 2) % 2, arm = 'down';
    if (this.state === 'charge') { pose = 'run'; frame = Math.floor(this.t * 14) % 6; arm = 'aim'; }
    else if (this.state === 'chargeWind') { pose = 'run'; frame = Math.floor(this.t * 18) % 2; }
    else if (this.state === 'leap') { pose = this.vy < 0 ? 'jump' : 'fall'; arm = 'up'; }
    else if (this.state === 'throwWind') { arm = 'up'; }
    else if (this.state === 'summon') { arm = 'up'; }
    const spr = humanSprite(BUNTY_LOOK, pose, frame, arm, this.facing < 0, this.flashT > 0);
    const Y = humanLayout(BUNTY_LOOK);
    const ax = this.facing > 0 ? Y.cx : Y.fw - 1 - Y.cx;
    const s = 2;
    const x = Math.round(this.cx - camX - ax * s), y = Math.round(this.bottom - camY - (Y.groundY + 1) * s);
    const wob = this.dying ? rand(-2, 2) : 0;
    g.drawImage(spr, x + wob, y, spr.width * s, spr.height * s);
    if (this.state === 'throwWind') drawCylinderShape(g, Math.round(this.cx - camX) - 4, y + 2);
    if (this.state === 'stunned') {
      for (let i = 0; i < 4; i++) { const a = this.t * 6 + i * 1.57; g.fillStyle = '#ffe066'; g.fillRect(Math.round(this.cx - camX + Math.cos(a) * 14), y + 10 + Math.round(Math.sin(a) * 3), 3, 3); }
    }
  }
}

/* ===================================================== HORN OK PLEASE ===== */
class TruckBoss extends Boss {
  constructor(arena) {
    super(arena);
    Object.assign(this, { name: 'HORN OK PLEASE', hindi: 'हॉर्न ओके प्लीज़', tagline: 'Don Dhoka ka truck', maxHp: 130, hp: 130, w: 128, h: 62 });
    this.x = arena.x1 - this.w - 16; this.y = arena.floorY - this.h; this.facing = -1;
    this.cab = this.makeBox(1.4); this.cargo = this.makeBox(1); this.boxes = [this.cab, this.cargo];
    this.gunT = 1.5; this.shots = 0; this.wheel = 0; this.door = 0; this.deathLine = 'HORN... NOT OK...';
  }
  syncBoxes() {
    const cabX = this.facing < 0 ? this.x : this.x + this.w - 42;
    const cargoX = this.facing < 0 ? this.x + 40 : this.x;
    Object.assign(this.cab, { x: cabX, y: this.y + 10, w: 42, h: this.h - 14 });
    Object.assign(this.cargo, { x: cargoX, y: this.y, w: this.w - 40, h: this.h - 12 });
  }
  gunPos() { return { x: this.facing < 0 ? this.x + 22 : this.x + this.w - 22, y: this.y + 7 }; }

  update(dt) {
    this.t += dt; this.st += dt; this.flashT -= dt;
    this.wheel += this.vx * dt;
    if (this.dying) { this.vx = approach(this.vx, 0, 300 * dt); this.arenaPhysics(dt); this.syncBoxes(); return this.updateDeath(dt); }
    const p = Game.player, spd = this.phase === 2 ? 1.25 : 1;
    const A = this.arena;
    // roof gunner fires through every state except intro and ram
    if (this.state !== 'intro' && this.state !== 'ram' && p && p.alive) {
      this.gunT -= dt;
      if (this.gunT <= 0 && this.shots <= 0) { this.shots = this.phase === 2 ? 5 : 3; this.gunT = 0; }
      if (this.shots > 0 && this.gunT <= 0) {
        const m = this.gunPos(), a = Math.atan2(p.cy - m.y, p.cx - m.x) + rand(-0.06, 0.06);
        Game.addProj(new Projectile({ x: m.x, y: m.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, owner: 'enemy', kind: 'ebullet', dmg: 1, tileDmg: 0.4, life: 1.8, r: 2 }));
        fxMuzzle(m.x, m.y, this.facing); SND.play('enemyShot', { x: m.x, y: m.y });
        this.shots--; this.gunT = this.shots > 0 ? 0.15 : rand(1.6, 2.4) / spd;
      }
    }
    switch (this.state) {
      case 'intro':
        if (this.st < 0.1) SND.play('horn', { throttle: 0 });
        if (this.st > 2.4) this.next('cruise');
        break;
      case 'cruise': {
        const tx = this.facing < 0 ? A.x0 + A.w * 0.55 : A.x0 + A.w * 0.12;
        this.vx = approach(this.vx, sign(tx - this.x) * 40, 200 * dt);
        if (this.st > (this.phase === 2 ? 1.6 : 2.4)) {
          const n = this.choose(this.phase === 2 ? { honk: 3, drop: 1, lob: 2 } : { honk: 3, drop: 2 });
          this.next(n);
          if (n === 'honk') { SND.play('horn', { throttle: 0 }); Game.bubble(this, 'HORN OK PLEASE!', 1.2, '#ffe066'); }
        }
        break;
      }
      case 'honk':
        this.vx = approach(this.vx, -this.facing * 30, 300 * dt);
        if (this.st > 1.1 / spd) this.next('ram');
        break;
      case 'ram':
        this.vx = approach(this.vx, this.facing * 270 * spd, 500 * dt);
        if (Math.random() < 0.6) fxDust(this.facing < 0 ? this.x + this.w : this.x, this.bottom, 2);
        if (this.hitWall) { this.vx = 0; this.facing *= -1; Game.shake(6); SND.play('stomp', { throttle: 0 }); fxSmoke(this.cx, this.bottom - 10, 8, 5); this.next('cruise'); }
        break;
      case 'drop':
        this.vx = approach(this.vx, 0, 400 * dt);
        this.door = Math.min(1, this.door + dt * 3);
        if (this.st > 0.6 && !this.dropped) {
          this.dropped = true;
          const bx = this.facing < 0 ? this.x + this.w + 10 : this.x - 10;
          this.spawnMinion(this.phase === 2 && chance(0.5) ? 'bouncer' : 'goonda', clamp(bx, A.x0 + 20, A.x1 - 20));
          if (this.phase === 2) this.spawnMinion('lathi', clamp(bx, A.x0 + 20, A.x1 - 20));
        }
        if (this.st > 1.3) { this.door = 0; this.dropped = false; this.next('cruise'); }
        break;
      case 'lob':
        this.vx = approach(this.vx, 0, 400 * dt);
        if (this.st > 0.4 && Math.floor(this.st / 0.35) !== Math.floor((this.st - dt) / 0.35) && this.st < 1.5) {
          const sx = this.cargo.x + this.cargo.w / 2, sy = this.y;
          Game.addProj(new Projectile({ x: sx, y: sy, vx: rand(-240, 240) + (p ? (p.cx - sx) * 0.4 : 0), vy: -rand(330, 420), grav: 1, owner: 'enemy', kind: 'cylinder', explode: 36, power: 6, dmg: 7, life: 3, spin: 8, tileDmg: 0, r: 5 }));
          SND.play('throw', { throttle: 0 });
        }
        if (this.st > 1.8) this.next('cruise');
        break;
    }
    this.arenaPhysics(dt);
    this.syncBoxes();
    if (Math.random() < (this.phase === 2 ? 0.5 : 0.15)) fxSmoke(this.facing < 0 ? this.x + 44 : this.x + this.w - 44, this.y + 4, 1, 3, this.phase === 2 ? 'rgba(30,26,30,0.6)' : 'rgba(90,90,90,0.4)');
    if (Math.abs(this.vx) > 25 && this.state !== 'intro') { this.contact(this.cab); this.contact(this.cargo); }
  }

  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY) + (Math.abs(this.vx) > 30 ? Math.round(Math.sin(this.t * 30)) : 0);
    // roof gunner: upper body only, standing in the cab's roof hatch
    const m = this.gunPos();
    const spr = humanSprite(ENEMY_LOOKS.goonda, 'idle', 0, 'aim', !!(Game.player && Game.player.cx < m.x), false);
    g.drawImage(spr, 0, 0, 24, 22, Math.round(m.x - camX) - 12, y + 9 - 21, 24, 22);
    g.save();
    if (this.facing > 0) { g.translate(x + this.w, y); g.scale(-1, 1); } else g.translate(x, y);
    drawTruck(g, this);
    g.restore();
    if (this.flashT > 0) { g.globalAlpha = 0.5; g.fillStyle = '#fff'; g.fillRect(x, y, this.w, this.h - 8); g.globalAlpha = 1; }
  }

  drawUI(u) {
    const panelX = this.facing < 0 ? this.x + this.w - 44 : this.x + 4;
    const [sx, sy] = Gfx.toScreen(panelX + 20, this.y + 44);
    const s = Gfx.scale;
    u.save();
    u.font = `700 ${Math.round(6.5 * s)}px ${FONT_DISPLAY}`;
    u.textAlign = 'center'; u.textBaseline = 'middle';
    u.fillStyle = '#ffffff'; u.strokeStyle = '#1a0a14'; u.lineWidth = Math.max(1.5, s * 0.8);
    u.strokeText('HORN OK PLEASE', sx, sy); u.fillText('HORN OK PLEASE', sx, sy);
    u.restore();
  }
}

/** Indian goods-truck art, local coords with the cab on the LEFT (facing left). */
function drawTruck(g, b) {
  const O = '#140a10';
  const W = b.w, H = b.h;
  // chassis + wheels
  g.fillStyle = O; g.fillRect(0, H - 18, W, 8);
  g.fillStyle = '#2a2a30'; g.fillRect(2, H - 17, W - 4, 5);
  const wheelXs = [20, 86, 104];
  for (const wx of wheelXs) {
    g.fillStyle = O; g.beginPath(); g.arc(wx, H - 8, 9, 0, TAU); g.fill();
    g.fillStyle = '#34343c'; g.beginPath(); g.arc(wx, H - 8, 7, 0, TAU); g.fill();
    g.fillStyle = '#b7bcc2'; g.beginPath(); g.arc(wx, H - 8, 3, 0, TAU); g.fill();
    const a = b.wheel / 7;
    g.fillStyle = '#1a1a20'; g.fillRect(Math.round(wx + Math.cos(a) * 5) - 1, Math.round(H - 8 + Math.sin(a) * 5) - 1, 2, 2);
  }
  // cargo body (right part)
  const cx0 = 40;
  g.fillStyle = O; g.fillRect(cx0 - 1, 0, W - cx0 + 1, H - 16);
  g.fillStyle = '#f2a71b'; g.fillRect(cx0, 1, W - cx0 - 1, H - 18);
  g.fillStyle = '#ff2d95'; g.fillRect(cx0, 1, W - cx0 - 1, 6);
  for (let i = cx0 + 2; i < W - 2; i += 4) { g.fillStyle = '#ffffff'; g.fillRect(i, 3, 2, 2); }
  g.fillStyle = '#1aa39a'; g.fillRect(cx0, H - 30, W - cx0 - 1, 11);
  for (let i = cx0 + 4; i < W - 8; i += 14) {
    const c = ['#2f9e44', '#c41e3a', '#2a62c9', '#7b2bd1'][(i / 14) % 4 | 0];
    g.fillStyle = c; g.fillRect(i + 3, 10, 6, 6); g.fillRect(i + 1, 12, 10, 2); g.fillRect(i + 5, 8, 2, 10);
    g.fillStyle = '#ffd23f'; g.fillRect(i + 5, 12, 2, 2);
  }
  g.fillStyle = '#ffffff'; g.fillRect(cx0 + 3, 21, W - cx0 - 7, 1);
  if (b.door > 0) { g.fillStyle = '#1a0e08'; g.fillRect(W - 8, 6, 7, Math.round((H - 26) * b.door)); }
  // tassels along the bottom edge
  for (let i = cx0; i < W; i += 5) { g.fillStyle = ['#ff2d95', '#ffd400', '#00c2ff', '#7cff3b'][(i / 5) % 4 | 0]; g.fillRect(i, H - 18, 1, 3 + ((i / 5) % 2)); }
  // cab
  g.fillStyle = O; g.fillRect(2, 8, 40, H - 24); g.fillRect(0, 22, 4, H - 38);
  g.fillStyle = b.phase === 2 ? '#2a4a8a' : '#2f63c9'; g.fillRect(3, 9, 38, H - 26);
  g.fillStyle = '#4d86f0'; g.fillRect(3, 9, 38, 2);
  g.fillStyle = b.phase === 2 ? '#9fb8c8' : '#bfe6ff'; g.fillRect(4, 13, 16, 12);
  if (b.phase === 2) { g.fillStyle = '#ffffff'; g.fillRect(8, 15, 1, 6); g.fillRect(9, 19, 4, 1); }
  g.fillStyle = '#20131c'; g.fillRect(14, 17, 5, 8); g.fillStyle = '#9a6440'; g.fillRect(15, 15, 4, 4);
  // marigold garland over the windscreen
  for (let i = 0; i < 16; i += 2) { g.fillStyle = i % 4 ? '#ff8a1f' : '#ffd400'; g.fillRect(4 + i, 12 + Math.round(Math.sin(i * 0.4) * 1.5), 2, 2); }
  // nazar battu mask on the grille
  g.fillStyle = '#111'; g.fillRect(5, 30, 10, 9);
  g.fillStyle = '#ffffff'; g.fillRect(6, 32, 3, 2); g.fillRect(11, 32, 3, 2);
  g.fillStyle = '#c41e1e'; g.fillRect(8, 36, 4, 3);
  g.fillStyle = '#ffd23f'; g.fillRect(1, 27, 3, 4);
  g.fillStyle = '#ffeaa0'; g.fillRect(0, 28, 1, 2);
  g.fillStyle = '#c9ccd2'; g.fillRect(0, H - 22, 42, 2);
  // exhaust stack
  g.fillStyle = O; g.fillRect(36, -2, 5, 12); g.fillStyle = '#7a7f86'; g.fillRect(37, -1, 3, 10);
}

/* ======================================================= KABAAD-BOT ====== */
class KabaadBoss extends Boss {
  constructor(arena) {
    super(arena);
    Object.assign(this, { name: 'KABAAD-BOT 3000', hindi: 'कबाड़-बॉट 3000', tagline: 'Made from 100% chori ka maal', maxHp: 160, hp: 160, w: 64, h: 106 });
    this.x = arena.x1 - 110; this.y = arena.floorY - this.h; this.facing = -1;
    this.head = this.makeBox(2); this.torso = this.makeBox(1); this.legs = this.makeBox(0.6);
    this.boxes = [this.head, this.torso, this.legs];
    this.fanAngle = 0; this.walk = 0; this.beam = null; this.eye = 0; this.deathLine = 'SYSTEM... JUGAAD... FAIL...';
  }
  syncBoxes() {
    Object.assign(this.head, { x: this.x + 18, y: this.y, w: 30, h: 24 });
    Object.assign(this.torso, { x: this.x + 4, y: this.y + 24, w: 56, h: 46 });
    Object.assign(this.legs, { x: this.x + 12, y: this.y + 70, w: 40, h: 36 });
  }
  eyePos() { return { x: this.x + 24, y: this.y + 12 }; }

  update(dt) {
    this.t += dt; this.st += dt; this.flashT -= dt;
    this.fanAngle += dt * (this.state === 'fan' ? 30 : 6);
    if (this.dying) { this.syncBoxes(); this.beam = null; return this.updateDeath(dt); }
    const p = Game.player, A = this.arena, spd = this.phase === 2 ? 1.25 : 1;
    switch (this.state) {
      case 'intro': this.eye = Math.min(1, this.st / 1.5); if (this.st > 2.4) this.next('walk'); break;
      case 'walk': {
        if (!this.walkTo) this.walkTo = rand(A.x0 + A.w * 0.5, A.x1 - this.w - 20);
        const d = this.walkTo - this.x;
        this.vx = Math.abs(d) > 4 ? sign(d) * 30 * spd : 0;
        this.walk += Math.abs(this.vx) * dt;
        if (this.st > (this.phase === 2 ? 1.2 : 1.9)) {
          this.walkTo = null; this.vx = 0;
          const n = this.choose(this.phase === 2 ? { rockets: 3, laser: 3, fan: 2, stomp: 2, drones: 1 } : { rockets: 3, laser: 2, fan: 2 });
          this.next(n);
          if (n === 'laser') SND.play('beam');
        }
        break;
      }
      case 'rockets':
        if (this.st > 0.35 && Math.floor(this.st / 0.22) !== Math.floor((this.st - dt) / 0.22) && this.st < 0.35 + 0.22 * (this.phase === 2 ? 7 : 5)) {
          const sx = this.x + 54, sy = this.y + 30;
          Game.addProj(new Projectile({ x: sx, y: sy, vx: rand(-200, -80), vy: -rand(260, 340), grav: 0.55, owner: 'enemy', kind: 'firework', color: pick(HOLI), homing: 1.4, explode: 26, power: 4, dmg: 6, life: 2.6, holi: true, tileDmg: 0, r: 3 }));
          SND.play('firework', { x: sx, y: sy, throttle: 0.05 });
        }
        if (this.st > 2.2) this.next('walk');
        break;
      case 'laser': {
        const e = this.eyePos();
        this.eye = 1;
        if (this.st < 0.9) {
          this.beam = { x0: e.x, y0: e.y, x1: this.x - 10, y1: A.floorY - 6, warn: true };
        } else if (this.st < 2.3) {
          const k = (this.st - 0.9) / 1.4;
          const bx = lerp(this.x - 10, A.x0 + 6, k);
          this.beam = { x0: e.x, y0: e.y, x1: bx, y1: A.floorY - 7, warn: false };
          if (Math.random() < 0.6) fxSparks(bx, A.floorY - 4, 2, '#ff4d4d', 90);
          FX.light(bx, A.floorY - 8, 60, 0.05, '#ff3030', 0.8);
          if (p && p.alive && segPointDist(e.x, e.y, bx, A.floorY - 7, p.cx, p.cy) < 9) p.hurt(1, { x: bx, y: A.floorY, kind: 'laser' });
          Game.shake(1);
        } else { this.beam = null; this.next('walk'); }
        break;
      }
      case 'fan':
        if (this.st > 0.5 && !this.fanThrown) {
          this.fanThrown = true;
          const self = this;
          Game.addProj(new Projectile({
            x: this.x + 2, y: A.floorY - 13, vx: -280 * spd, vy: 0, owner: 'enemy', kind: 'fan', ghost: true, life: 3.2, spin: 30, dmg: 1, r: 9, tileDmg: 0,
            onUpdate(q, d) { if (q.t > 1.1) { q.vx = approach(q.vx, 300 * spd, 700 * d); } if (q.t > 1.2 && q.x > self.x + 10) q.remove = true; },
          }));
          SND.play('swing', { throttle: 0 });
        }
        if (this.st > 2.6) { this.fanThrown = false; this.next('walk'); }
        break;
      case 'stomp':
        if (this.st < 0.5) { this.y = A.floorY - this.h - Math.sin((this.st / 0.5) * Math.PI) * 30; }
        else if (!this.stomped) {
          this.stomped = true; this.y = A.floorY - this.h;
          Game.shake(9); SND.play('stomp', { throttle: 0 }); fxDust(this.cx, A.floorY, 16);
          for (const d of [-1, 1]) Game.addProj(new Projectile({ x: this.cx + d * 30, y: A.floorY - 5, vx: d * 240, owner: 'enemy', kind: 'shock', ghost: true, life: 1.5, r: 7, dmg: 1, tileDmg: 0 }));
        }
        if (this.st > 1.1) { this.stomped = false; this.next('walk'); }
        break;
      case 'drones':
        if (this.st > 0.4 && !this.launched) {
          this.launched = true;
          for (let i = 0; i < 2; i++) { const e = new Enemy('drone', this.x + 10 + i * 30, this.y + 10); e.homeY = A.floorY - 120; e.state = 'attack'; Game.addEnemy(e); }
        }
        if (this.st > 1.2) { this.launched = false; this.next('walk'); }
        break;
    }
    if (this.state !== 'stomp') this.y = A.floorY - this.h;
    this.x = clamp(this.x + this.vx * dt, A.x0 + 4, A.x1 - this.w - 4);
    this.syncBoxes();
    if (Math.random() < 0.2) fxSmoke(this.x + 58, this.y + 22, 1, 3, 'rgba(70,70,70,0.45)');
    if (this.state !== 'intro') { this.contact(this.legs); this.contact(this.torso); }
  }

  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    const O = '#120c10', f = this.flashT > 0;
    const step = Math.sin(this.walk * 0.12) * 3;
    // legs: pipes with rust bands
    for (const [lx, off] of [[16, step], [38, -step]]) {
      g.fillStyle = O; g.fillRect(x + lx - 1, y + 68, 12, 34 + Math.round(off * 0.3));
      g.fillStyle = f ? '#fff' : '#7d858c'; g.fillRect(x + lx, y + 69, 10, 32);
      g.fillStyle = '#5f666c'; g.fillRect(x + lx + 7, y + 69, 3, 32);
      g.fillStyle = '#9a5a2a'; g.fillRect(x + lx, y + 78, 10, 2); g.fillRect(x + lx, y + 90, 10, 2);
      g.fillStyle = O; g.fillRect(x + lx - 4 + Math.round(off), y + 100, 17, 6);
      g.fillStyle = '#3a3e45'; g.fillRect(x + lx - 3 + Math.round(off), y + 101, 15, 4);
    }
    // torso: an old desert cooler
    g.fillStyle = O; g.fillRect(x + 3, y + 23, 58, 48);
    g.fillStyle = f ? '#fff' : '#d8c9a3'; g.fillRect(x + 4, y + 24, 56, 46);
    g.fillStyle = '#efe3c2'; g.fillRect(x + 4, y + 24, 56, 2);
    for (let i = 0; i < 9; i++) { g.fillStyle = '#6b604a'; g.fillRect(x + 10, y + 30 + i * 4, 32, 2); }
    g.fillStyle = '#8a3a1a'; g.fillRect(x + 48, y + 40, 4, 3); g.fillRect(x + 7, y + 60, 5, 2);
    g.fillStyle = '#2f9e44'; g.fillRect(x + 46, y + 28, 10, 6); g.fillStyle = '#ffd23f'; g.fillRect(x + 48, y + 30, 6, 2);
    // fan-blade arm (facing the player)
    g.fillStyle = O; g.fillRect(x - 4, y + 34, 10, 6);
    g.save(); g.translate(x - 6, y + 37); g.rotate(this.fanAngle);
    if (!(this.state === 'fan' && this.fanThrown)) {
      for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.fillStyle = O; g.fillRect(0, -3, 17, 6); g.fillStyle = '#b9c0c6'; g.fillRect(1, -2, 15, 4); }
    }
    g.fillStyle = '#6b737a'; g.fillRect(-3, -3, 6, 6);
    g.restore();
    // bucket rocket launcher on the back shoulder
    g.fillStyle = O; g.fillRect(x + 50, y + 18, 16, 16);
    g.fillStyle = '#9aa3ad'; g.fillRect(x + 51, y + 19, 14, 14); g.fillStyle = '#c9d0d6'; g.fillRect(x + 51, y + 19, 14, 2);
    for (let i = 0; i < 3; i++) { g.fillStyle = HOLI[i]; g.fillRect(x + 53 + i * 4, y + 14, 2, 6); }
    // CRT TV head with antenna
    g.strokeStyle = O; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 33, y); g.lineTo(x + 26, y - 10); g.moveTo(x + 33, y); g.lineTo(x + 42, y - 9); g.stroke();
    g.fillStyle = O; g.fillRect(x + 17, y - 1, 32, 26);
    g.fillStyle = f ? '#fff' : '#5a3a24'; g.fillRect(x + 18, y, 30, 24);
    g.fillStyle = '#1a1a1a'; g.fillRect(x + 20, y + 3, 21, 17);
    if (this.state === 'intro' && this.eye < 0.6) {
      for (let i = 0; i < 30; i++) { g.fillStyle = Math.random() < 0.5 ? '#9a9a9a' : '#2a2a2a'; g.fillRect(x + 20 + randi(0, 20), y + 3 + randi(0, 16), 2, 1); }
    } else {
      const angry = this.state === 'laser' || this.phase === 2;
      g.fillStyle = angry ? '#ff3030' : '#3dff8a';
      g.fillRect(x + 23, y + 8, 5, 3); g.fillRect(x + 32, y + 8, 5, 3);
      g.fillStyle = '#1a1a1a'; g.fillRect(x + 23, y + 7, 2, 1); g.fillRect(x + 35, y + 7, 2, 1);
      g.fillStyle = angry ? '#ff3030' : '#3dff8a'; g.fillRect(x + 25, y + 15, 10, 2);
      if (angry) { g.fillRect(x + 24, y + 14, 1, 1); g.fillRect(x + 35, y + 14, 1, 1); }
    }
    g.fillStyle = '#c9a26a'; g.fillRect(x + 43, y + 6, 3, 3); g.fillRect(x + 43, y + 12, 3, 3);
    if (this.beam) {
      const b = this.beam;
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = b.warn ? (Math.floor(this.t * 16) % 2 ? 'rgba(255,60,60,0.8)' : 'rgba(255,60,60,0.25)') : 'rgba(255,70,70,0.9)';
      g.lineWidth = b.warn ? 1 : 4;
      g.beginPath(); g.moveTo(b.x0 - camX, b.y0 - camY); g.lineTo(b.x1 - camX, b.y1 - camY); g.stroke();
      if (!b.warn) { g.strokeStyle = 'rgba(255,240,240,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(b.x0 - camX, b.y0 - camY); g.lineTo(b.x1 - camX, b.y1 - camY); g.stroke(); }
      g.globalCompositeOperation = 'source-over';
    }
  }

  drawUI(u) {
    const [sx, sy] = Gfx.toScreen(this.x + 26, this.y + 66);
    const s = Gfx.scale;
    u.save();
    u.font = `700 ${Math.round(4.6 * s)}px ${FONT_DISPLAY}`;
    u.textAlign = 'center'; u.textBaseline = 'middle';
    u.fillStyle = '#3a2a14'; u.fillText('KABAAD-BOT 3000', sx, sy);
    u.restore();
  }
}

function segPointDist(x0, y0, x1, y1, px, py) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return dist(px, py, x0 + dx * t, y0 + dy * t);
}

/* ======================================================= DHOKA-COPTER ===== */
class CopterBoss extends Boss {
  constructor(arena) {
    super(arena);
    Object.assign(this, { name: 'DON DHOKA', hindi: 'डॉन धोखा', tagline: 'aur uska Dhoka-Copter', maxHp: 190, hp: 190, w: 104, h: 42 });
    this.x = arena.x1 + 40; this.y = arena.floorY - 190; this.facing = -1;
    this.body = this.makeBox(1); this.cockpit = this.makeBox(1.6); this.boxes = [this.body, this.cockpit];
    this.gunT = 0; this.tx = arena.x0 + arena.w * 0.6; this.ty = arena.floorY - 170; this.chop = 0; this.tilt = 0;
    this.deathLine = 'Main... wapas aaunga!';
  }
  syncBoxes() {
    Object.assign(this.body, { x: this.x + 20, y: this.y + 10, w: this.w - 30, h: this.h - 14 });
    Object.assign(this.cockpit, { x: this.facing < 0 ? this.x : this.x + this.w - 26, y: this.y + 12, w: 26, h: 24 });
  }
  onPhase2() {
    this.invuln = true;
    this.next('taunt');
  }

  update(dt) {
    this.t += dt; this.st += dt; this.flashT -= dt;
    this.chop -= dt;
    if (this.chop <= 0) { this.chop = 0.09; SND.play('chop', { x: this.cx, y: this.cy, throttle: 0 }); }
    const A = this.arena, p = Game.player, spd = this.phase === 2 ? 1.25 : 1;
    if (this.dying) {
      this.tilt += dt * 4; this.vy = Math.min((this.vy || 0) + 300 * dt, 260); this.y += this.vy * dt; this.x += Math.sin(this.t * 6) * 40 * dt;
      fxSmoke(this.cx, this.cy, 1, 4, 'rgba(25,20,25,0.7)'); fxFire(this.cx, this.cy, 2, 8);
      if (this.y + this.h > A.floorY) this.y = A.floorY - this.h;
      this.syncBoxes();
      return this.updateDeath(dt);
    }
    // ease toward the target position
    const k = Math.min(1, dt * (this.state === 'strafe' ? 3 : 1.6));
    this.x = lerp(this.x, this.tx, k);
    this.y = lerp(this.y, this.ty + Math.sin(this.t * 2) * 6, k);
    this.tilt = lerp(this.tilt, clamp((this.tx - this.x) * 0.004, -0.25, 0.25), dt * 4);
    if (p) this.facing = p.cx < this.cx ? -1 : 1;

    switch (this.state) {
      case 'intro':
        this.tx = A.x0 + A.w * 0.6; this.ty = A.floorY - 170;
        if (this.st > 2.6) this.next('hover');
        break;
      case 'hover':
        if (this.st < dt * 2) { this.tx = rand(A.x0 + 40, A.x1 - this.w - 40); this.ty = A.floorY - rand(150, 185); }
        this.shootAt(dt, p, 1.8 / spd, 3);
        if (this.st > (this.phase === 2 ? 1.6 : 2.3)) {
          const n = this.choose(this.phase === 2 ? { strafe: 3, bombs: 3, missiles: 2, troops: 1 } : { strafe: 3, bombs: 2, missiles: 2 });
          this.next(n);
          this.dir = this.cx < A.x0 + A.w / 2 ? 1 : -1;
        }
        break;
      case 'strafe':
        this.ty = A.floorY - 120;
        this.tx = this.dir > 0 ? A.x1 - this.w - 10 : A.x0 + 10;
        if (this.st > 0.6) this.shootAt(dt, p, 0.11, 1, true);
        if (this.st > 2.6) this.next('hover');
        break;
      case 'bombs':
        this.ty = A.floorY - 175;
        if (p) this.tx = clamp(p.cx - this.w / 2, A.x0, A.x1 - this.w);
        if (this.st > 0.5 && Math.floor(this.st / (0.3 / spd)) !== Math.floor((this.st - dt) / (0.3 / spd)) && this.st < 2.4) {
          Game.addProj(new Projectile({ x: this.cx, y: this.bottom, vx: rand(-40, 40), vy: 20, grav: 1, owner: 'enemy', kind: 'bomb', explode: 28, power: 5, dmg: 6, life: 3, fuseExplode: false, tileDmg: 0, r: 3 }));
          SND.play('throw', { x: this.cx, y: this.cy, throttle: 0 });
        }
        if (this.st > 2.7) this.next('hover');
        break;
      case 'missiles':
        this.ty = A.floorY - 185;
        if (this.st > 0.6 && Math.floor(this.st / 0.45) !== Math.floor((this.st - dt) / 0.45) && this.st < 0.6 + 0.45 * 3) {
          const sx = this.facing < 0 ? this.x : this.x + this.w;
          Game.addProj(new Projectile({ x: sx, y: this.y + 30, vx: this.facing * 110, vy: 40, owner: 'enemy', kind: 'rocket', homing: 1.5, explode: 32, power: 6, dmg: 7, life: 3.2, tileDmg: 0, r: 4 }));
          SND.play('whistle', { x: sx, y: this.cy, throttle: 0 });
        }
        if (this.st > 2.4) this.next('hover');
        break;
      case 'troops':
        this.ty = A.floorY - 160;
        if (this.st > 0.5 && !this.dropped) { this.dropped = true; this.spawnMinion('goonda', this.cx - 20); this.spawnMinion(chance(0.5) ? 'rocket' : 'lathi', this.cx + 20); }
        if (this.st > 1.4) { this.dropped = false; this.next('hover'); }
        break;
      case 'taunt': {
        this.tx = A.x0 + A.w * 0.5 - this.w / 2; this.ty = A.floorY - 175;
        if (this.st < dt * 2) {
          const mummy = p && p.bhai.id === 'mummy';
          Game.dialog([
            { who: 'DON DHOKA', text: 'Mere paas helicopter hai, paisa hai, goonde hain... tumhare paas kya hai?', color: '#ffd23f' },
            { who: p ? p.bhai.name.toUpperCase() : 'BHAI', text: mummy ? 'Mere paas... CHAPPAL hai.' : 'Mere paas BHAIFORCE hai!', color: '#ff9933' },
          ]);
          VOICE.say(L('Tumhare paas kya hai?', 'तुम्हारे पास क्या है?'), { pitch: 0.6, force: true });
        }
        if (this.st > 5.2) { this.invuln = false; this.next('troops'); }
        break;
      }
    }
    this.syncBoxes();
    this.contact(this.body);
  }

  shootAt(dt, p, gap, burst, angled) {
    if (!p || !p.alive) return;
    this.gunT -= dt;
    if (this.gunT > 0) return;
    this.gunT = gap;
    const sx = this.facing < 0 ? this.x + 8 : this.x + this.w - 8, sy = this.y + 36;
    for (let i = 0; i < burst; i++) {
      const a = Math.atan2(p.cy - sy, p.cx - sx) + rand(-0.1, 0.1) + (angled ? rand(-0.05, 0.05) : 0);
      Game.addProj(new Projectile({ x: sx, y: sy, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, owner: 'enemy', kind: 'ebullet', dmg: 1, tileDmg: 0.4, life: 2, r: 2, t: -i * 0.06 }));
    }
    fxMuzzle(sx, sy, this.facing); SND.play('enemyShot', { x: sx, y: sy });
  }

  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    g.save();
    g.translate(x + this.w / 2, y + this.h / 2); g.rotate(this.tilt);
    if (this.facing > 0) g.scale(-1, 1);
    g.translate(-this.w / 2, -this.h / 2);
    drawCopter(g, this);
    g.restore();
    if (this.flashT > 0) { g.globalAlpha = 0.45; g.fillStyle = '#fff'; g.fillRect(x + 10, y + 10, this.w - 20, this.h - 14); g.globalAlpha = 1; }
  }
}

/** Black-and-gold villain helicopter, local coords with the nose on the LEFT. */
function drawCopter(g, b) {
  const O = '#0c0a10';
  // tail boom + tail rotor
  g.fillStyle = O; g.fillRect(60, 14, 44, 7);
  g.fillStyle = '#1f1d26'; g.fillRect(61, 15, 42, 5);
  g.fillStyle = '#d4a017'; g.fillRect(61, 17, 42, 1);
  g.fillStyle = O; g.fillRect(96, 6, 6, 12);
  const tr = Math.floor(b.t * 30) % 2;
  g.fillStyle = 'rgba(220,220,230,0.6)'; g.fillRect(93 + tr * 2, 4, 2, 16 - tr * 4);
  // body
  g.fillStyle = O; g.beginPath(); g.ellipse(36, 24, 38, 16, 0, 0, TAU); g.fill();
  g.fillStyle = '#26232e'; g.beginPath(); g.ellipse(36, 24, 36, 14, 0, 0, TAU); g.fill();
  g.fillStyle = '#d4a017'; g.fillRect(14, 30, 50, 2);
  g.fillStyle = '#3a3644'; g.fillRect(20, 12, 34, 3);
  // cockpit glass with Don Dhoka inside
  g.fillStyle = O; g.beginPath(); g.ellipse(14, 22, 14, 11, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(140,200,255,0.75)'; g.beginPath(); g.ellipse(14, 22, 12, 9, 0, 0, TAU); g.fill();
  g.fillStyle = '#9a6440'; g.fillRect(12, 16, 7, 8);
  g.fillStyle = '#0e0e0e'; g.fillRect(11, 19, 6, 2);
  g.fillStyle = '#1a1210'; g.fillRect(11, 23, 6, 1); g.fillRect(12, 14, 7, 2);
  g.fillStyle = '#ffd23f'; g.fillRect(13, 25, 5, 1);
  g.fillStyle = '#ffffff'; g.fillRect(6, 18, 2, 3);
  // "DD" monogram
  g.fillStyle = '#d4a017'; g.fillRect(38, 19, 2, 6); g.fillRect(40, 19, 2, 1); g.fillRect(40, 24, 2, 1); g.fillRect(42, 20, 1, 4);
  g.fillRect(45, 19, 2, 6); g.fillRect(47, 19, 2, 1); g.fillRect(47, 24, 2, 1); g.fillRect(49, 20, 1, 4);
  // skids
  g.fillStyle = O; g.fillRect(16, 38, 44, 2); g.fillRect(22, 34, 2, 5); g.fillRect(50, 34, 2, 5);
  // gun pod
  g.fillStyle = O; g.fillRect(4, 33, 10, 4); g.fillStyle = '#55595f'; g.fillRect(0, 34, 6, 2);
  // main rotor (motion-blurred)
  g.fillStyle = O; g.fillRect(34, 4, 6, 6);
  const k = Math.sin(b.t * 50);
  g.fillStyle = 'rgba(200,200,215,0.55)'; g.fillRect(36 - 52 * Math.abs(k), 2, 104 * Math.abs(k) + 4, 2);
  g.fillStyle = 'rgba(200,200,215,0.2)'; g.fillRect(-14, 1, 104, 4);
}

const BOSS_TYPES = { bunty: BuntyBoss, truck: TruckBoss, kabaad: KabaadBoss, copter: CopterBoss };
