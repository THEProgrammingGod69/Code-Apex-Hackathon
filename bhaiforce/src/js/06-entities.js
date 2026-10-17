/* =============================================================================
 * ENTITIES — physics base class, projectiles, explosions and the interactive
 * props: LPG cylinders, kerosene drums, prisoner cages, Tiranga checkpoints,
 * collectibles, tiffin pickups, signboards, cows, crates and summoned gear.
 * ========================================================================== */

class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.grav = 1;
    this.onGround = false; this.hitX = 0; this.remove = false; this.facing = 1; this.t = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get bottom() { return this.y + this.h; }

  moveX(world, dx) {
    let rem = dx;
    while (Math.abs(rem) > 1e-4) {
      const step = clamp(rem, -4, 4), nx = this.x + step;
      if (world.boxSolid(nx, this.y, this.w, this.h)) {
        if (step > 0) this.x = Math.floor((nx + this.w - 0.01) / TILE) * TILE - this.w;
        else this.x = (Math.floor(nx / TILE) + 1) * TILE;
        return true;
      }
      this.x = nx; rem -= step;
    }
    return false;
  }

  /** Returns 1 when landing, -1 when bonking a ceiling, 0 otherwise. */
  moveY(world, dy, drop = false) {
    let rem = dy;
    while (Math.abs(rem) > 1e-4) {
      const step = clamp(rem, -4, 4), ny = this.y + step;
      if (world.boxSolid(this.x, ny, this.w, this.h)) {
        if (step > 0) { this.y = Math.floor((ny + this.h - 0.01) / TILE) * TILE - this.h; return 1; }
        this.y = (Math.floor(ny / TILE) + 1) * TILE; return -1;
      }
      if (step > 0 && !drop) {
        const top = world.oneWayBelow(this.x, this.w, this.y + this.h, ny + this.h);
        if (top >= 0) { this.y = top - this.h; return 1; }
      }
      this.y = ny; rem -= step;
    }
    return 0;
  }

  physics(dt, world, drop = false) {
    this.vy = Math.min(this.vy + GRAVITY * this.grav * dt, MAX_FALL);
    this.hitX = 0;
    if (this.vx && this.moveX(world, this.vx * dt)) { this.hitX = sign(this.vx); this.vx = 0; }
    const r = this.moveY(world, this.vy * dt, drop);
    const was = this.onGround;
    this.onGround = r === 1 || (this.vy >= 0 && this.standing(world, drop));
    if (r !== 0) { this.impactVy = this.vy; this.vy = 0; }
    this.justLanded = this.onGround && !was;
  }

  standing(world, drop) {
    if (world.boxSolid(this.x, this.y + this.h, this.w, 1)) return true;
    return !drop && world.oneWayBelow(this.x, this.w, this.y + this.h, this.y + this.h + 1) >= 0;
  }

  /** Solid wall directly beside the body (ignores the bottom few px for slopes). */
  wallAt(world, dir) {
    return world.boxSolid(dir > 0 ? this.x + this.w : this.x - 1, this.y + 2, 1, this.h - 6);
  }
}

/* ------------------------------------------------------------ projectiles - */
class Projectile {
  constructor(o) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0, owner: 'player', dmg: 1, tileDmg: 1, life: 1.6, t: 0, kind: 'bullet',
      grav: 0, bounce: 0, bounceDamp: 0.8, pierce: 0, r: 3, homing: 0, explode: 0, power: 5,
      rot: 0, spin: 0, ff: false, src: null, remove: false, ghost: false, stun: 0, ignite: false,
    }, o);
    this.hit = new Set();
  }

  update(dt, world) {
    this.t += dt;
    if (this.t > this.life) { this.die(false); return; }
    if (this.homing) this.steer(dt);
    if (this.boomerang) this.boomerangSteer(dt);
    if (this.onUpdate) this.onUpdate(this, dt);
    this.vy += GRAVITY * this.grav * dt;
    this.rot += this.spin * dt;
    const dx = this.vx * dt, dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
    for (let i = 0; i < steps && !this.remove; i++) {
      const nx = this.x + dx / steps, ny = this.y + dy / steps;
      if (!this.ghost && world.blocksShot(nx, ny)) {
        const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
        const t = world.get(tx, ty);
        if (this.tileDmg) world.damage(tx, ty, this.tileDmg, 'bullet');
        if (this.bounce > 0) {
          this.bounce--;
          const hx = world.blocksShot(nx, this.y), hy = world.blocksShot(this.x, ny);
          if (hx || !hy) this.vx = -this.vx * this.bounceDamp;
          if (hy || !hx) this.vy = -this.vy * this.bounceDamp;
          SND.play('hitTile', { x: nx, y: ny, throttle: 0.05 });
          return;
        }
        if (this.boomerang) { this.returning = true; this.ghost = true; return; }
        this.impact(nx, ny, t);
        return;
      }
      this.x = nx; this.y = ny;
      if (this.checkHits()) return;
    }
  }

  steer(dt) {
    const tgt = this.owner === 'enemy' ? Game.player && Game.player.alive && Game.player : Game.nearestEnemy(this.x, this.y, 260, this.vx);
    if (!tgt) return;
    const sp = Math.hypot(this.vx, this.vy) || 1;
    const want = Math.atan2(tgt.cy - this.y, tgt.cx - this.x), cur = Math.atan2(this.vy, this.vx);
    let d = want - cur;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const a = cur + clamp(d, -this.homing * dt, this.homing * dt);
    this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
  }

  /** Mummy Ji's chappal: flies out, then always comes home. */
  boomerangSteer(dt) {
    const p = this.src;
    if (!p || !p.alive) { this.returning = true; }
    if (!this.returning && this.t > this.outTime) this.returning = true;
    if (this.returning && p) {
      if (!this.clearedOnReturn) { this.hit.clear(); this.clearedOnReturn = true; } // can hit again on the way back
      const dx = p.cx - this.x, dy = p.cy - 4 - this.y, d = Math.hypot(dx, dy) || 1;
      const sp = 330;
      this.vx = lerp(this.vx, (dx / d) * sp, Math.min(1, dt * 7));
      this.vy = lerp(this.vy, (dy / d) * sp, Math.min(1, dt * 7));
      this.ghost = true;
      if (d < 10 && this.t > 0.15) { this.remove = true; if (p.chappalsOut) p.chappalsOut--; }
      if (this.t > 2.6) { this.remove = true; if (p.chappalsOut) p.chappalsOut--; }
    }
  }

  targets() {
    if (this.owner === 'enemy') {
      const out = [];
      if (Game.player && Game.player.alive) out.push(Game.player);
      if (this.ff) for (const e of Game.enemies) if (e.alive && e !== this.src) out.push(e);
      for (const o of Game.objects) if (o.shootable && !o.remove) out.push(o);
      return out;
    }
    const out = [];
    for (const e of Game.enemies) if (e.alive) out.push(e);
    if (Game.boss && Game.boss.alive) out.push(...Game.boss.hitboxes());
    for (const o of Game.objects) if (o.shootable && !o.remove) out.push(o);
    return out;
  }

  checkHits() {
    const r = this.r;
    for (const e of this.targets()) {
      if (this.hit.has(e)) continue;
      if (this.x + r < e.x || this.x - r > e.x + e.w || this.y + r < e.y || this.y - r > e.y + e.h) continue;
      const took = e.hurt(this.dmg, { x: this.x, y: this.y, vx: this.vx * 0.35, vy: this.vy * 0.2 - 60, kind: this.kind, src: this.src, owner: this.owner, stun: this.stun, ignite: this.ignite });
      if (took === false) continue;
      this.hit.add(e);
      if (this.onHit) this.onHit(this, e);
      if (this.pierce > 0) { this.pierce--; continue; }
      if (this.boomerang) { this.returning = true; continue; }
      this.impact(this.x, this.y, -1);
      return true;
    }
    return false;
  }

  impact(x, y, tile) {
    this.x = x; this.y = y;
    if (this.explode) { this.die(true); return; }
    if (tile >= 0) {
      fxSparks(x, y, 3, tile === T.STEEL ? '#dfe8ff' : '#ffd36b', 80);
      SND.play(tile === T.STEEL ? 'hitMetal' : 'hitTile', { x, y, throttle: 0.04 });
    }
    if (this.kind === 'chai') fxSmoke(x, y, 1, 2, 'rgba(240,240,240,0.35)');
    this.die(false);
  }

  die(boom) {
    if (this.remove) return;
    this.remove = true;
    if (this.explode && (boom || this.fuseExplode)) {
      explode(this.x, this.y, this.explode, { dmg: this.dmg, power: this.power, owner: this.owner, holi: this.holi, src: this.src, fire: this.fire });
    }
    if (this.onDie) this.onDie(this);
  }

  draw(g, camX, camY) {
    const x = this.x - camX, y = this.y - camY;
    const fn = PROJ_DRAW[this.kind] || PROJ_DRAW.bullet;
    fn(g, this, x, y);
  }
}

const PROJ_DRAW = {
  bullet(g, p, x, y) {
    const a = Math.atan2(p.vy, p.vx);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#fff4b8'; g.fillRect(-6, -1, 7, 2); g.fillStyle = '#ffffff'; g.fillRect(-1, -1, 2, 2);
    g.restore();
  },
  ebullet(g, p, x, y) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,90,40,0.45)'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#ffe2a0'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
  },
  pellet(g, p, x, y) { g.fillStyle = '#ffe48a'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); },
  nail(g, p, x, y) { const a = Math.atan2(p.vy, p.vx); g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = '#cfd6dd'; g.fillRect(-3, 0, 4, 1); g.fillStyle = '#777'; g.fillRect(-4, -1, 1, 3); g.restore(); },
  chappal(g, p, x, y) {
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(p.rot);
    g.fillStyle = '#1a0e08'; g.fillRect(-4, -2, 9, 4);
    g.fillStyle = p.gold ? '#ffcf3a' : '#9b4f22'; g.fillRect(-3, -1, 7, 2);
    g.fillStyle = '#f2c27a'; g.fillRect(0, -2, 2, 1);
    g.restore();
  },
  ball(g, p, x, y) {
    g.fillStyle = '#1a0e08'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill();
    g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill();
    g.fillStyle = '#d0263a'; g.fillRect(Math.round(x) - 1, Math.round(y), 2, 1);
  },
  plane(g, p, x, y) {
    const a = Math.atan2(p.vy, p.vx);
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = '#20131c'; g.beginPath(); g.moveTo(5, 0); g.lineTo(-4, -3.5); g.lineTo(-2, 0); g.lineTo(-4, 3.5); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(4, 0); g.lineTo(-3, -2.5); g.lineTo(-1.5, 0); g.lineTo(-3, 2.5); g.closePath(); g.fill();
    g.fillStyle = '#d0263a'; g.fillRect(-2, 0, 2, 1);
    g.restore();
  },
  rose(g, p, x, y) {
    const bob = Math.sin(p.t * 10) * 1;
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,214,90,0.35)'; g.beginPath(); g.arc(x, y + bob, 6, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#2f8f3a'; g.fillRect(Math.round(x) - 4, Math.round(y + bob), 4, 1);
    g.fillStyle = '#e8173f'; g.beginPath(); g.arc(x + 1, y + bob, 2.6, 0, TAU); g.fill();
    g.fillStyle = '#ff6b8a'; g.fillRect(Math.round(x), Math.round(y + bob) - 1, 2, 1);
    if (Math.random() < 0.3) FX.spawn({ x: p.x + rand(-3, 3), y: p.y + rand(-3, 3), life: 0.4, color: pick(['#fff6a8', '#ff9ec7']), grav: 0, add: true });
  },
  vinyl(g, p, x, y) {
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(p.rot);
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(0, 0, 4, 0, TAU); g.fill();
    g.strokeStyle = '#3a3a3a'; g.lineWidth = 0.6; g.beginPath(); g.arc(0, 0, 2.8, 0.2, 2.4); g.stroke();
    g.fillStyle = '#e8334a'; g.fillRect(-1, -1, 2, 2);
    g.restore();
  },
  chai(g, p, x, y) {
    g.fillStyle = p.t < 0.06 ? '#f0d4a8' : '#b9772f';
    const s = p.t > 0.2 ? 2 : 3;
    g.fillRect(Math.round(x) - 1, Math.round(y) - 1, s, s);
    if (Math.random() < 0.15) FX.spawn({ x: p.x, y: p.y, vy: -30, life: 0.5, color: 'rgba(255,255,255,0.3)', kind: 'circle', size: 1.5, grow: 4, grav: 0 });
  },
  kettle(g, p, x, y) {
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(p.rot);
    g.fillStyle = '#1a1a22'; g.fillRect(-4, -4, 9, 8);
    g.fillStyle = '#c3ced6'; g.fillRect(-3, -3, 7, 6); g.fillStyle = '#e8f0f5'; g.fillRect(-3, -3, 7, 1);
    g.fillStyle = '#9aa8b2'; g.fillRect(4, -1, 3, 1);
    g.restore();
    if (Math.random() < 0.5) FX.spawn({ x: p.x, y: p.y - 3, vy: -20, life: 0.5, color: 'rgba(255,255,255,0.35)', kind: 'circle', size: 1.5, grow: 5, grav: 0 });
  },
  rocket(g, p, x, y) {
    const a = Math.atan2(p.vy, p.vx);
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(a);
    g.fillStyle = '#15161a'; g.fillRect(-6, -2, 10, 4);
    g.fillStyle = '#7a8a4a'; g.fillRect(-5, -1, 7, 2); g.fillStyle = '#d33'; g.fillRect(2, -1, 2, 2);
    g.restore();
    fxFire(p.x - Math.cos(a) * 6, p.y - Math.sin(a) * 6, 1, 1);
    if (Math.random() < 0.6) fxSmoke(p.x - Math.cos(a) * 7, p.y - Math.sin(a) * 7, 1, 2);
  },
  firework(g, p, x, y) {
    const a = Math.atan2(p.vy, p.vx);
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(a);
    g.fillStyle = '#1a0e08'; g.fillRect(-9, -2, 13, 4);
    g.fillStyle = p.color || '#ff2d95'; g.fillRect(-3, -1, 6, 2); g.fillStyle = '#ffd400'; g.fillRect(3, -1, 1, 2);
    g.fillStyle = '#c9a26a'; g.fillRect(-8, 0, 5, 1);
    g.restore();
    FX.spawn({ x: p.x - Math.cos(a) * 5, y: p.y - Math.sin(a) * 5, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.3, color: pick(['#ffe27a', '#fff', '#ffb02e']), grav: 0.3, add: true });
  },
  bomb(g, p, x, y) {
    g.fillStyle = '#1a0e08'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
    g.fillStyle = '#8a5a2a'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill();
    g.fillStyle = '#c99a5a'; g.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 1);
    const spark = Math.sin(p.t * 40) > 0;
    g.fillStyle = spark ? '#fff6a0' : '#ff8a1f'; g.fillRect(Math.round(x) + 1, Math.round(y) - 4, 1, 1);
    if (Math.random() < 0.4) FX.spawn({ x: p.x + 1, y: p.y - 4, vx: rand(-30, 30), vy: rand(-50, -10), life: 0.2, color: '#ffd36b', grav: 0.4, add: true });
  },
  cylinder(g, p, x, y) {
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(p.rot);
    drawCylinderShape(g, -4, -7);
    g.restore();
  },
  fan(g, p, x, y) {
    g.save(); g.translate(Math.round(x), Math.round(y)); g.rotate(p.rot);
    g.fillStyle = '#20202a';
    for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.fillRect(0, -2, 13, 4); }
    g.fillStyle = '#b9c0c6';
    for (let i = 0; i < 3; i++) { g.rotate(TAU / 3); g.fillRect(1, -1, 11, 2); }
    g.fillStyle = '#6b737a'; g.fillRect(-2, -2, 4, 4);
    g.restore();
  },
  shock(g, p, x, y) {
    g.fillStyle = 'rgba(255,230,180,0.6)';
    g.fillRect(Math.round(x) - 3, Math.round(y) - 6, 6, 6);
    if (Math.random() < 0.7) fxDust(p.x, p.y, 1);
  },
};

/* ------------------------------------------------------------ explosions -- */
function explode(x, y, r, o = {}) {
  const { dmg = 6, power = 5, owner = 'neutral', holi = false, src = null, fire = false } = o;
  const W = Game.world;
  if (!W) return;
  W.explode(x, y, r, power);
  fxExplosion(x, y, r, { holi });
  for (let i = 0; i < r; i++) {
    const a = rand(0, TAU), d = rand(0, r * 0.85);
    W.stain(x + Math.cos(a) * d, y + Math.sin(a) * d, holi ? rgba(pick(HOLI), 0.5) : 'rgba(20,12,10,0.32)', 2);
  }
  SND.play(r > 28 ? 'boom' : 'smallBoom', { x, y, throttle: 0.04 });
  Game.shake(Math.min(10, r / 5));
  vibrate(r > 28 ? 55 : 22);
  Game.noise(x, y, r * 6);
  const R = r * 1.1;
  const p = Game.player;
  if (owner !== 'player' && p && p.alive && dist(x, y, p.cx, p.cy) < R + 4) p.hurt(1, { x, y, kind: 'explosion' });
  for (const e of Game.enemies) {
    if (!e.alive) continue;
    const d = dist(x, y, e.cx, e.cy);
    if (d > R + e.w / 2) continue;
    const f = 1 - d / (R + e.w / 2);
    e.hurt(Math.max(1, dmg * (0.45 + f)), { x, y, vx: ((e.cx - x) / (d || 1)) * 280 * (0.3 + f) + rand(-40, 40), vy: -230 * (0.4 + f), kind: 'explosion', src, owner });
  }
  if (Game.boss && Game.boss.alive && owner !== 'boss') Game.boss.hurtArea(x, y, R, dmg * 1.25, owner);
  for (const ob of Game.objects) if (ob.onExplosion && !ob.remove && dist(x, y, ob.cx, ob.cy) < R + 10) ob.onExplosion(x, y, owner);
  if (fire) Game.addObj(new FireZone(x - r * 0.6, y - 6, r * 1.2, 14, 2.2, owner));
}

/* ------------------------------------------------------------ props ------- */
function drawCylinderShape(g, x, y) {
  g.fillStyle = '#1a0e10'; g.fillRect(x - 1, y + 1, 10, 13); g.fillRect(x + 1, y - 1, 6, 3);
  g.fillStyle = '#d92b2b'; g.fillRect(x, y + 2, 8, 11);
  g.fillStyle = '#f05252'; g.fillRect(x + 1, y + 2, 2, 11);
  g.fillStyle = '#9e1c1c'; g.fillRect(x + 6, y + 2, 2, 11);
  g.fillStyle = '#f1efe6'; g.fillRect(x, y + 6, 8, 2);
  g.fillStyle = '#c9c9c9'; g.fillRect(x + 2, y, 4, 2);
  g.fillStyle = '#ffd23f'; g.fillRect(x + 3, y - 1, 2, 1);
}

class Cylinder extends Entity {
  constructor(x, y) { super(x, y, 8, 13); this.hp = 2; this.lit = false; this.fuse = 0; this.shootable = true; this.rot = 0; this.igniter = 'neutral'; }
  hurt(dmg, info) {
    this.hp -= dmg;
    if (!this.lit && this.hp <= 0) this.ignite(info);
    return true;
  }
  ignite(info = {}) {
    if (this.lit) return;
    this.lit = true;
    this.igniter = info.owner === 'player' ? 'player' : 'neutral';
    this.fuse = rand(0.6, 1.0);
    this.vy = -rand(150, 230);
    this.vx = (info.x !== undefined && info.x < this.cx ? 1 : -1) * rand(30, 80);
    this.spin = rand(-14, 14);
    SND.play('hiss', { x: this.cx, y: this.cy });
  }
  onExplosion(x, y, owner) {
    if (!this.lit) this.ignite({ x, owner });
    this.fuse = Math.min(this.fuse, rand(0.12, 0.3));
  }
  update(dt, world) {
    this.t += dt;
    if (this.lit) {
      this.fuse -= dt;
      this.vy -= 520 * dt;
      this.vx += rand(-200, 200) * dt;
      this.rot += this.spin * dt;
      fxFire(this.cx, this.bottom, 2, 2);
      if (Math.random() < 0.4) fxSmoke(this.cx, this.bottom, 1, 2);
      if (this.fuse <= 0) return this.boom();
    }
    this.physics(dt, world);
    if (this.lit && this.hitX) this.vx = -this.hitX * 60;
  }
  boom() {
    if (this.remove) return;
    this.remove = true;
    explode(this.cx, this.cy, 42, { dmg: 9, power: 7, owner: this.igniter });
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    if (this.lit) { g.save(); g.translate(x + 4, y + 7); g.rotate(this.rot * 0.15); drawCylinderShape(g, -4, -7); g.restore(); }
    else drawCylinderShape(g, x, y);
  }
}

class Drum extends Entity {
  constructor(x, y) { super(x, y, 10, 14); this.hp = 3; this.shootable = true; }
  hurt(dmg, info) { this.hp -= dmg; if (this.hp <= 0) this.boom(info && info.owner === 'player' ? 'player' : 'neutral'); return true; }
  onExplosion(x, y, owner) { this.boomT = this.boomT || 0.12; this.owner = owner === 'player' ? 'player' : 'neutral'; }
  boom(owner) {
    if (this.remove) return;
    this.remove = true;
    explode(this.cx, this.cy, 36, { dmg: 8, power: 6, owner, fire: true });
  }
  update(dt, world) {
    if (this.boomT) { this.boomT -= dt; if (this.boomT <= 0) return this.boom(this.owner); }
    this.physics(dt, world);
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    g.fillStyle = '#140c0c'; g.fillRect(x - 1, y - 1, 12, 16);
    g.fillStyle = '#2f6b3a'; g.fillRect(x, y, 10, 14);
    g.fillStyle = '#3f8a4c'; g.fillRect(x + 1, y, 2, 14);
    g.fillStyle = '#1f4a28'; g.fillRect(x, y + 3, 10, 1); g.fillRect(x, y + 10, 10, 1);
    g.fillStyle = '#ffd23f'; g.fillRect(x + 4, y + 5, 3, 3); g.fillStyle = '#140c0c'; g.fillRect(x + 5, y + 6, 1, 1);
  }
}

class FireZone {
  constructor(x, y, w, h, life, owner) { Object.assign(this, { x, y, w, h, life, owner, t: 0, remove: false }); }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt) {
    this.t += dt;
    if (this.t > this.life) { this.remove = true; return; }
    if (Math.random() < 0.8) fxFire(this.x + rand(0, this.w), this.y + this.h, 1, 1);
    FX.light(this.cx, this.cy, 50, 0.05, '#ff8a2a', 0.6);
    for (const e of Game.enemies) if (e.alive && overlaps(this, e)) e.ignite();
    const p = Game.player;
    if (this.owner !== 'player' && p && p.alive && overlaps(this, p)) p.hurt(1, { x: this.cx, y: this.cy, kind: 'fire' });
  }
  draw() { /* drawn purely through particles */ }
}

class Cage extends Entity {
  constructor(x, y, bhaiId) {
    super(x, y, 16, 24);
    this.bhai = bhaiId; this.shootable = true; this.open = false; this.shake = 0; this.callT = rand(1, 3);
  }
  hurt() { this.free(); return true; }
  onExplosion() { this.free(); }
  update(dt) {
    this.t += dt;
    if (this.open) return;
    const p = Game.player;
    this.shake = Math.max(0, this.shake - dt);
    if (p && p.alive) {
      if (overlaps(this, p)) { this.free(); return; }
      const d = dist(p.cx, p.cy, this.cx, this.cy);
      this.callT -= dt;
      if (d < 170 && this.callT <= 0) {
        this.callT = rand(2.2, 3.5);
        this.shake = 0.5;
        Game.bubble(this, pick(['BACHAO!', 'Bhai, yahan!', 'Help karo!', 'Nikaalo mujhe!']), 1.4, '#ffe066');
      }
    }
  }
  free() {
    if (this.open) return;
    this.open = true;
    this.remove = true;
    fxDebris(this.cx, this.cy, ['#6b4a2a', '#8a6a3a', '#3a3a3a'], 10);
    fxConfetti(this.cx, this.y, 24);
    Game.rescue(this);
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX + (this.shake ? Math.sin(this.t * 60) : 0)), y = Math.round(this.y - camY);
    const look = BHAI_BY_ID[this.bhai].look;
    const spr = humanSprite(look, 'idle', Math.floor(this.t * 3) % 2, 'up', false, false);
    const Y = humanLayout(look);
    g.drawImage(spr, x + 8 - Y.cx, y + this.h - (Y.groundY + 1));
    g.fillStyle = '#1a1210';
    g.fillRect(x - 1, y - 1, this.w + 2, 3); g.fillRect(x - 1, y + this.h - 2, this.w + 2, 3);
    g.fillStyle = '#7a5a34';
    g.fillRect(x, y, this.w, 1); g.fillRect(x, y + this.h - 1, this.w, 1);
    for (let i = 0; i <= this.w; i += 4) { g.fillStyle = '#1a1210'; g.fillRect(x + i - 1, y, 2, this.h); g.fillStyle = '#6b6f78'; g.fillRect(x + i - 1, y, 1, this.h); }
    g.fillStyle = '#ffd23f'; g.fillRect(x + 6, y + 10, 4, 3); g.fillStyle = '#1a1210'; g.fillRect(x + 7, y + 11, 2, 1);
  }
}

class Flag extends Entity {
  constructor(x, y) { super(x - 6, y - 40, 12, 40); this.raised = 0; this.active = false; this.poleX = x; this.baseY = y; }
  update(dt) {
    this.t += dt;
    const p = Game.player;
    if (!this.active && p && p.alive && Math.abs(p.cx - this.poleX) < 18 && Math.abs(p.bottom - this.baseY) < 40) {
      this.active = true;
      Game.setCheckpoint(this.poleX, this.baseY);
    }
    if (this.active) this.raised = Math.min(1, this.raised + dt * 1.4);
  }
  draw(g, camX, camY) {
    const x = Math.round(this.poleX - camX), base = Math.round(this.baseY - camY);
    g.fillStyle = '#1a1416'; g.fillRect(x - 1, base - 40, 3, 40); g.fillRect(x - 3, base - 3, 7, 3);
    g.fillStyle = '#c9ccd2'; g.fillRect(x, base - 40, 1, 39);
    g.fillStyle = '#ffd23f'; g.fillRect(x - 1, base - 42, 3, 2);
    const fy = Math.round(lerp(base - 14, base - 39, easeOutCubic(this.raised)));
    drawTiranga(g, x + 2, fy, this.t);
    if (this.active && this.raised >= 1 && Math.random() < 0.05) FX.spawn({ x: this.poleX + rand(4, 20), y: fy + camY + rand(0, 12), life: 0.6, color: pick(['#ff9933', '#ffffff', '#138808']), grav: 0.1, vx: rand(10, 30), vy: rand(-10, 10) });
  }
}

/** The national flag, drawn with correct colours and orientation (saffron on top). */
function drawTiranga(g, x, y, t) {
  const W = 18;
  for (let i = 0; i < W; i++) {
    const wave = Math.round(Math.sin(t * 6 + i * 0.5) * (i / W) * 1.5);
    g.fillStyle = '#ff9933'; g.fillRect(x + i, y + wave, 1, 4);
    g.fillStyle = '#ffffff'; g.fillRect(x + i, y + 4 + wave, 1, 4);
    g.fillStyle = '#138808'; g.fillRect(x + i, y + 8 + wave, 1, 4);
  }
  const cx = x + 8, cy = y + 4 + Math.round(Math.sin(t * 6 + 4.5) * 0.7);
  g.fillStyle = '#000080';
  g.fillRect(cx, cy, 2, 1); g.fillRect(cx, cy + 3, 2, 1); g.fillRect(cx - 1, cy + 1, 1, 2); g.fillRect(cx + 2, cy + 1, 1, 2);
  g.fillRect(cx, cy + 1, 2, 2);
}

const COLLECTIBLE_ART = {
  vadapav(g, x, y) {
    g.fillStyle = '#2a140a'; g.fillRect(x - 5, y - 4, 10, 8);
    g.fillStyle = '#e0a24a'; g.fillRect(x - 4, y - 3, 8, 3); g.fillStyle = '#f4c56e'; g.fillRect(x - 3, y - 3, 4, 1);
    g.fillStyle = '#4fae3a'; g.fillRect(x - 4, y, 8, 1); g.fillStyle = '#c87a2a'; g.fillRect(x - 4, y + 1, 8, 1);
    g.fillStyle = '#d9993f'; g.fillRect(x - 4, y + 2, 8, 1);
  },
  pyaaz(g, x, y) {
    g.fillStyle = '#20101a'; g.fillRect(x - 4, y - 3, 9, 8); g.fillRect(x, y - 6, 2, 3);
    g.fillStyle = '#b0336a'; g.fillRect(x - 3, y - 2, 7, 6); g.fillStyle = '#d65a8e'; g.fillRect(x - 2, y - 2, 2, 5);
    g.fillStyle = '#6faa3a'; g.fillRect(x, y - 5, 1, 3);
  },
  kaju(g, x, y) {
    g.fillStyle = '#2a2010';
    for (let i = 0; i < 6; i++) g.fillRect(x - i - 1, y - 5 + i, i * 2 + 3, 1), g.fillRect(x - i - 1, y + 5 - i, i * 2 + 3, 1);
    g.fillStyle = '#f2ddb0';
    for (let i = 0; i < 5; i++) g.fillRect(x - i, y - 4 + i, i * 2 + 1, 1), g.fillRect(x - i, y + 4 - i, i * 2 + 1, 1);
    g.fillStyle = '#e8edf2'; g.fillRect(x - 1, y - 2, 2, 2);
  },
  momo(g, x, y) {
    g.fillStyle = '#2a2a30'; g.fillRect(x - 5, y - 3, 11, 7); g.fillRect(x - 1, y - 5, 3, 2);
    g.fillStyle = '#f6f2ea'; g.fillRect(x - 4, y - 2, 9, 5); g.fillRect(x, y - 4, 1, 2);
    g.fillStyle = '#d8d0c4'; g.fillRect(x - 2, y - 2, 1, 2); g.fillRect(x + 2, y - 2, 1, 2); g.fillRect(x - 4, y + 2, 9, 1);
  },
};

class Collectible extends Entity {
  constructor(x, y, kind) { super(x - 6, y - 14, 12, 12); this.kind = kind; this.phase = rand(0, TAU); }
  update(dt) {
    this.t += dt;
    const p = Game.player;
    if (p && p.alive && overlaps(this, p)) {
      this.remove = true;
      Game.collect(this);
    }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.cx - camX), y = Math.round(this.cy - camY + Math.sin(this.t * 3 + this.phase) * 2);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,210,80,0.25)'; g.beginPath(); g.arc(x, y, 8 + Math.sin(this.t * 5) * 1.5, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    COLLECTIBLE_ART[this.kind](g, x, y);
    if (Math.random() < 0.04) FX.spawn({ x: this.cx + rand(-6, 6), y: this.cy + rand(-6, 6), life: 0.5, color: '#fff6a8', grav: -0.05, add: true });
  }
}

/** Steel tiffin box: refills one special. */
class Tiffin extends Entity {
  constructor(x, y) { super(x - 5, y - 12, 10, 12); this.vy = -120; }
  update(dt, world) {
    this.t += dt;
    this.physics(dt, world);
    const p = Game.player;
    if (this.t > 0.3 && p && p.alive && overlaps(this, p)) {
      this.remove = true;
      p.specials = Math.min(p.specials + 1, 5);
      SND.play('tiffin');
      Game.popText(this.cx, this.y, '+1 SPECIAL', '#7fe3ff');
    }
    if (this.t > 20) this.remove = true;
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY + Math.sin(this.t * 4));
    g.fillStyle = '#1a1a22'; g.fillRect(x - 1, y - 1, 12, 14);
    for (let i = 0; i < 3; i++) { g.fillStyle = '#c9d2d9'; g.fillRect(x, y + 1 + i * 4, 10, 3); g.fillStyle = '#eef3f6'; g.fillRect(x, y + 1 + i * 4, 10, 1); }
    g.fillStyle = '#7f8a93'; g.fillRect(x + 2, y - 2, 6, 2); g.fillRect(x + 4, y - 4, 2, 2);
  }
}

class Sign extends Entity {
  constructor(x, y, text) { super(x - 8, y - 18, 16, 18); this.text = text; this.cool = 0; }
  update(dt) {
    this.cool -= dt;
    const p = Game.player;
    if (p && p.alive && Math.abs(p.cx - this.cx) < 40 && Math.abs(p.cy - this.cy) < 40 && this.cool <= 0) {
      this.cool = 4.5;
      Game.bubble(this, this.text, 4.2, '#ffffff', true);
    }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    g.fillStyle = '#1a120c'; g.fillRect(x + 6, y + 8, 4, 10); g.fillRect(x - 1, y - 1, 18, 11);
    g.fillStyle = '#9b6a3e'; g.fillRect(x, y, 16, 9); g.fillStyle = '#b8844f'; g.fillRect(x, y, 16, 1);
    g.fillStyle = '#7a4d2a'; g.fillRect(x + 7, y + 9, 2, 9);
    g.fillStyle = '#fff2c8'; g.fillRect(x + 3, y + 3, 10, 1); g.fillRect(x + 3, y + 5, 7, 1);
  }
}

/** Holy cows are decor: unhittable, unbothered, and only ever moo. */
class Cow extends Entity {
  constructor(x, y) { super(x - 11, y - 13, 22, 13); this.dir = chance(0.5) ? 1 : -1; this.walkT = rand(2, 5); this.sitting = chance(0.4); this.mooCool = 0; }
  onExplosion() { if (this.mooCool <= 0) { this.mooCool = 3; SND.play('moo', { x: this.cx, y: this.cy }); Game.bubble(this, 'MOOO.', 1.2, '#ffffff'); } }
  update(dt, world) {
    this.t += dt; this.mooCool -= dt;
    this.walkT -= dt;
    if (this.walkT <= 0) { this.walkT = rand(2, 6); this.sitting = chance(0.35); this.dir = chance(0.5) ? 1 : -1; }
    this.vx = this.sitting ? 0 : this.dir * 10;
    this.physics(dt, world);
    if (this.hitX || (!world.solidPx(this.cx + this.dir * 12, this.bottom + 4))) { this.dir *= -1; }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY) + (this.sitting ? 3 : 0);
    const f = this.dir;
    g.save(); g.translate(x + 11, y); g.scale(f, 1); g.translate(-11, 0);
    const O = '#1a1414', W = '#f2ece0', S = '#d8cfbf';
    g.fillStyle = O; g.fillRect(2, 1, 17, 9); g.fillRect(17, -1, 6, 7);
    g.fillStyle = W; g.fillRect(3, 2, 15, 7); g.fillStyle = S; g.fillRect(3, 7, 15, 2);
    g.fillStyle = '#b07a4a'; g.fillRect(6, 3, 4, 3); g.fillRect(13, 5, 3, 2);
    g.fillStyle = W; g.fillRect(18, 0, 4, 5); g.fillStyle = '#e8a0a0'; g.fillRect(21, 3, 2, 2);
    g.fillStyle = O; g.fillRect(20, 1, 1, 1);
    g.fillStyle = '#e8d6a0'; g.fillRect(18, -2, 1, 2); g.fillRect(21, -2, 1, 2);
    g.fillStyle = O; g.fillRect(8, 1, 3, 1);
    if (!this.sitting) {
      const k = Math.floor(this.t * 6) % 2;
      g.fillStyle = O; for (const lx of [4, 7, 13, 16]) g.fillRect(lx + (k && lx % 2 ? 1 : 0), 9, 2, 4);
    }
    g.fillStyle = O; g.fillRect(1, 2, 1, 5);
    g.restore();
  }
}

class FallingCrate extends Entity {
  constructor(tx, ty) { super(tx * TILE, ty * TILE, TILE, TILE); }
  update(dt, world) {
    this.physics(dt, world);
    if (this.onGround) {
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (world.get(tx, ty) === T.AIR) world.set(tx, ty, T.CRATE);
      this.remove = true;
      SND.play('land', { x: this.cx, y: this.cy });
    }
    for (const e of Game.enemies) if (e.alive && this.vy > 120 && overlaps(this, e)) e.hurt(5, { x: this.cx, y: this.y, vx: 0, vy: -50, kind: 'crush' });
  }
  draw(g, camX, camY) {
    g.drawImage(Game.world.atlas.fg, 0, T.CRATE * 16, 16, 16, Math.round(this.x - camX), Math.round(this.y - camY), 16, 16);
  }
}
