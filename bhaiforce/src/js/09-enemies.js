/* =============================================================================
 * ENEMIES — Don Dhoka's gang. Vision with line-of-sight, alert propagation,
 * reaction delays, and status effects from the bhais' specials: crying
 * (Sharma), dancing, burning (chai), confusion (fake news) and slow-mo.
 * ========================================================================== */

const ENEMY_LOOKS = {
  goonda: { id: 'e_goonda', skin: '#9a6440', hair: '#141010', hairStyle: 'bandana', hat: '#c41e3a', beard: 'stubble', eyes: 'angry', shirt: '#2a2a33', shirt2: '#d8d0c0', pants: '#3a3326', shoes: '#1a120c', outfit: 'goon', weapon: 'rifle' },
  lathi: { id: 'e_lathi', skin: '#8a5a36', hair: '#141010', hairStyle: 'short', mooch: 'big', eyes: 'angry', shirt: '#e9e4d6', trim: '#b8995a', pants: '#e9e4d6', lower: 'dhoti', lowerColor: '#e9e4d6', outfit: 'kurta', weapon: 'lathi', shoes: '#5a3a1a' },
  patakha: { id: 'e_patakha', skin: '#b07a50', hair: '#d8d4cc', hairStyle: 'monkeycap', hat: '#6a3a9a', mooch: 'thin', glasses: 'specs', eyes: 'angry', shirt: '#7a7a44', shirt2: '#55552e', trim: '#b0aa66', pants: '#4a4038', outfit: 'sweater', weapon: 'bomb' },
  bouncer: { id: 'e_bouncer', big: true, skin: '#7a4a2a', hair: '#0e0c0c', hairStyle: 'shaved', beard: 'full', glasses: 'shades', eyes: 'angry', shirt: '#151518', chain: true, trim: '#c41e3a', pants: '#26262e', shoes: '#0e0c0c', outfit: 'tee', weapon: 'lmg' },
  rocket: { id: 'e_rocket', skin: '#9a6a44', hair: '#1a1410', hairStyle: 'cap', hat: '#4b5a2e', mooch: 'thin', eyes: 'angry', shirt: '#5f6e3a', pants: '#4b5a2e', shoes: '#1a120c', outfit: 'camo', weapon: 'rocket' },
};

const ENEMY_TYPES = {
  goonda: { hp: 2, w: 10, h: 22, speed: 30, ai: 'shooter', burst: 3, gap: 0.14, cool: [1.3, 2.1], bulletSpeed: 225, range: 220, score: 100 },
  lathi: { hp: 3, w: 10, h: 22, speed: 36, ai: 'melee', chase: 112, range: 200, score: 120 },
  patakha: { hp: 2, w: 10, h: 22, speed: 26, ai: 'grenadier', cool: [2.1, 2.9], range: 210, score: 150 },
  bouncer: { hp: 12, w: 14, h: 28, speed: 20, ai: 'shooter', burst: 8, gap: 0.09, cool: [1.7, 2.4], bulletSpeed: 245, range: 240, score: 400, heavy: true },
  rocket: { hp: 3, w: 10, h: 22, speed: 24, ai: 'rocketeer', cool: [2.6, 3.4], range: 280, score: 250 },
  drone: { hp: 2, w: 14, h: 8, speed: 58, ai: 'flyer', fly: true, cool: [1.4, 2.2], range: 230, score: 200 },
};

const ALERT_LINES = ['Pakdo usko!', 'Kaun hai be?', 'Bhaiforce aa gaya!', 'Maaro!', 'Abey oye!', 'Goli maaro!', 'Boss ko bulao!', 'Bhaago nahi!'];
const DEATH_LINES = ['Mummyyy!', 'Aiyyo!', 'Hai Rabba!', 'Arre baap re!', 'Maa kasam!', 'Bachaooo!', 'Oh teri!', 'Ye kya tha?!'];
const BURN_LINES = ['GARAM! GARAM!', 'Paani! Paani!', 'Jal gaya!', 'Chai bahut garam hai!'];
const CRY_LINES = ['Mummy ne bola tha padhai kar...', 'Main bhi engineer ban sakta tha!', 'Papa sorry...', 'Mere 35 aaye the...', 'Coaching chhod di thi...'];
const CONFUSED_LINES = ['Forward aaya hai!', 'Ye sach hai kya?!', 'Breaking news!', '100% sach!', 'Group pe daal!', 'Gaddar tu hai!'];

function drawChappalGib(g, x, y, k, p) {
  g.save(); g.translate(x, y); g.rotate(p.rot || 0);
  g.fillStyle = '#1a0e08'; g.fillRect(-3, -1, 7, 3);
  g.fillStyle = p.c || '#3a6fd0'; g.fillRect(-2, -1, 5, 2);
  g.restore();
}

class Enemy extends Entity {
  constructor(kind, x, feetY) {
    const D = ENEMY_TYPES[kind];
    super(x - D.w / 2, feetY - D.h, D.w, D.h);
    this.kind = kind; this.D = D; this.look = ENEMY_LOOKS[kind];
    this.hp = D.hp; this.alive = true; this.state = 'patrol';
    this.facing = chance(0.5) ? 1 : -1;
    this.react = 0; this.shots = 0; this.shotT = 0; this.cool = rand(D.cool ? D.cool[0] : 1, D.cool ? D.cool[1] : 2);
    this.lostT = 0; this.searchT = 0; this.lastX = this.cx;
    this.stunT = 0; this.stunKind = null; this.confT = 0; this.burnT = 0; this.flashT = 0; this.alertIcon = 0;
    this.walkT = rand(1, 3); this.idle = 0; this.bubbleCool = rand(0, 2); this.stepT = 0;
    this.deadT = 0; this.rot = 0; this.rotV = 0; this.armOverride = null; this.armT = 0;
    this.windup = 0; this.aimT = 0; this.meleeCd = 0;
    if (D.fly) { this.grav = 0; this.homeY = this.y; }
  }

  get stunned() { return this.stunT > 0; }

  muzzle() {
    if (this.D.fly) return { x: this.cx, y: this.bottom + 2 };
    const Y = humanLayout(this.look);
    const tTop = Y.groundY - Y.lh - Y.th;
    return { x: this.cx + this.facing * (6 + WEAPON_LEN[this.look.weapon]), y: this.bottom - (Y.groundY + 1 - (tTop + 3)) };
  }

  face(t) { if (t) this.facing = t.cx >= this.cx ? 1 : -1; }

  /** Target is the player, or the nearest fellow goon while fake news spreads. */
  target() {
    if (this.confT > 0) return Game.nearestEnemyTo(this, 260);
    const p = Game.player;
    return p && p.alive && p.state !== 'drop' ? p : null;
  }

  canSee(tgt) {
    if (!tgt) return false;
    const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
    if (Math.abs(dx) > this.D.range || Math.abs(dy) > (this.D.fly ? 200 : 90)) return false;
    if (this.state === 'patrol' && sign(dx) !== this.facing && Math.abs(dx) > 34) return false;
    return !Game.world.raycast(this.cx, this.y + 6, tgt.cx, tgt.cy - 2);
  }

  hearNoise(x) {
    if (!this.alive || this.stunned || this.confT > 0) return;
    if (this.state !== 'patrol' && this.state !== 'search') return;
    this.facing = x >= this.cx ? 1 : -1;
    this.state = 'alert';
    this.react = rand(0.6, 1.0) * DIFFICULTY[Settings.difficulty].reaction;
    this.alertIcon = 0.7;
    this.lastX = x;
  }

  alert(tgt) {
    if (this.state !== 'patrol' && this.state !== 'search') return;
    this.state = 'alert';
    this.react = rand(0.45, 0.75) * DIFFICULTY[Settings.difficulty].reaction;
    this.face(tgt);
    this.alertIcon = 0.8;
    SND.play('alert', { x: this.cx, y: this.cy });
    if (this.bubbleCool <= 0 && chance(0.55) && this.confT <= 0) { Game.bubble(this, pick(ALERT_LINES), 1.2); this.bubbleCool = 5; }
    for (const e of Game.enemies) {
      if (e !== this && e.alive && dist(e.cx, e.cy, this.cx, this.cy) < 120) e.hearNoise(tgt.cx);
    }
  }

  groundAhead(world) {
    const ax = this.facing > 0 ? this.x + this.w + 2 : this.x - 2;
    const ty = Math.floor((this.bottom + 3) / TILE), tx = Math.floor(ax / TILE);
    const info = TINFO[world.get(tx, ty)];
    return info.solid || info.oneWay;
  }

  patrol(dt, world) {
    this.walkT -= dt;
    if (this.walkT <= 0) { this.walkT = rand(1.5, 3.5); this.idle = chance(0.4) ? rand(0.8, 2.2) : 0; if (chance(0.45)) this.facing *= -1; }
    if (this.idle > 0) { this.idle -= dt; this.vx = approach(this.vx, 0, 400 * dt); return; }
    this.vx = this.facing * this.D.speed;
    if (this.onGround && (this.wallAt(world, this.facing) || !this.groundAhead(world))) { this.facing *= -1; this.vx = 0; }
  }

  update(dt, world) {
    this.t += dt; this.flashT -= dt; this.bubbleCool -= dt; this.alertIcon -= dt; this.armT -= dt; this.meleeCd -= dt;
    if (!this.alive) return this.updateDead(dt, world);
    if (this.y > world.pxH + 30) { this.alive = false; this.remove = true; return; }

    if (this.burnT > 0) {
      this.burnT -= dt;
      fxFire(this.cx, this.cy, 2, 4);
      FX.light(this.cx, this.cy, 40, 0.05, '#ff8a2a', 0.5);
      if (this.D.fly) this.vy = 60;
      else {
        this.vx = this.facing * 95;
        if (this.onGround && (this.wallAt(world, this.facing) || !this.groundAhead(world))) this.facing *= -1;
      }
      this.physics(dt, world);
      if (this.burnT <= 0) this.die({ kind: 'fire', vx: 0, vy: -140, owner: 'player' });
      return;
    }

    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx = approach(this.vx, 0, 500 * dt);
      if (this.stunKind === 'cry' && Math.random() < dt * 6) fxTears(this.cx + this.facing * 3, this.y + 6);
      if (this.D.fly) this.vy = Math.sin(this.t * 3) * 10;
      this.physics(dt, world);
      if (this.stunT <= 0) { this.state = 'alert'; this.react = 0.4; }
      return;
    }
    if (this.confT > 0) this.confT -= dt;

    const tgt = this.target();
    switch (this.D.ai) {
      case 'shooter': this.aiShooter(dt, world, tgt); break;
      case 'melee': this.aiMelee(dt, world, tgt); break;
      case 'grenadier': this.aiGrenadier(dt, world, tgt); break;
      case 'rocketeer': this.aiRocketeer(dt, world, tgt); break;
      case 'flyer': this.aiFlyer(dt, world, tgt); break;
    }
    if (!this.D.fly) this.physics(dt, world);
    else this.flyPhysics(dt, world);
    if (Math.abs(this.vx) > 5 && this.onGround) this.stepT += Math.abs(this.vx) * dt;

    // body contact with a dropping player is harmless; enemies don't deal touch damage
  }

  /** Shared alert → attack → search loop for ranged goons. */
  combatState(dt, tgt, onAttack) {
    if (this.state === 'patrol') {
      this.patrol(dt, Game.world);
      if (this.canSee(tgt)) this.alert(tgt);
      return;
    }
    if (this.state === 'alert') {
      this.vx = approach(this.vx, 0, 500 * dt);
      if (tgt && this.canSee(tgt)) this.face(tgt);
      this.react -= dt;
      if (this.react <= 0) { this.state = 'attack'; this.shots = this.D.burst || 1; this.shotT = 0; this.lostT = 0; }
      return;
    }
    if (this.state === 'search') {
      this.searchT -= dt;
      this.facing = this.lastX >= this.cx ? 1 : -1;
      this.vx = Math.abs(this.lastX - this.cx) > 8 ? this.facing * this.D.speed * 1.4 : 0;
      if (this.onGround && (this.wallAt(Game.world, this.facing) || !this.groundAhead(Game.world))) this.vx = 0;
      if (this.canSee(tgt)) { this.state = 'attack'; this.lostT = 0; }
      if (this.searchT <= 0) this.state = 'patrol';
      return;
    }
    // attack
    if (!tgt) { this.state = 'patrol'; return; }
    const sees = this.canSee(tgt);
    if (sees) { this.lostT = 0; this.lastX = tgt.cx; this.face(tgt); }
    else { this.lostT += dt; if (this.lostT > 2.4) { this.state = 'search'; this.searchT = 3.5; return; } }
    onAttack(sees);
  }

  aiShooter(dt, world, tgt) {
    this.combatState(dt, tgt, sees => {
      this.vx = approach(this.vx, 0, 300 * dt);
      if (this.shots > 0) {
        this.shotT -= dt;
        if (this.shotT <= 0 && sees) { this.fireAt(tgt); this.shots--; this.shotT = this.D.gap; }
      } else {
        this.cool -= dt;
        if (this.cool <= 0) { this.cool = rand(this.D.cool[0], this.D.cool[1]); this.shots = this.D.burst; }
        else if (!this.D.heavy && Math.random() < dt * 0.6 && this.onGround) this.vx = rand(-1, 1) * this.D.speed;
      }
    });
  }

  fireAt(tgt) {
    const m = this.muzzle();
    const dx = tgt.cx - m.x, dy = tgt.cy - 3 - m.y;
    const ang = clamp(Math.atan2(dy, Math.abs(dx)), -0.65, 0.65) + rand(-0.07, 0.07);
    const sp = this.D.bulletSpeed;
    Game.addProj(new Projectile({ x: m.x, y: m.y, vx: Math.cos(ang) * sp * this.facing, vy: Math.sin(ang) * sp, owner: 'enemy', kind: 'ebullet', dmg: DIFFICULTY[Settings.difficulty].enemyDmg, tileDmg: 0.4, life: 1.7, src: this, ff: this.confT > 0, r: 2 }));
    fxMuzzle(m.x, m.y, this.facing, this.D.heavy);
    SND.play('enemyShot', { x: m.x, y: m.y, throttle: 0.03 });
  }

  aiMelee(dt, world, tgt) {
    if (this.state === 'patrol') {
      this.patrol(dt, world);
      if (this.canSee(tgt)) { this.alert(tgt); this.react *= 0.6; }
      return;
    }
    if (this.state === 'alert') {
      this.vx = 0; this.react -= dt;
      if (this.react <= 0) this.state = 'attack';
      return;
    }
    if (!tgt) { this.state = 'patrol'; return; }
    if (this.windup > 0) {
      this.windup -= dt; this.vx = 0; this.armOverride = 'raise'; this.armT = 0.05;
      if (this.windup <= 0) {
        this.armOverride = 'swing'; this.armT = 0.18; this.meleeCd = 0.8;
        SND.play('swing', { x: this.cx, y: this.cy });
        const box = { x: this.facing > 0 ? this.cx : this.cx - 24, y: this.y - 2, w: 24, h: this.h + 4 };
        if (overlaps(box, tgt)) tgt.hurt(tgt === Game.player ? 1 : 3, { x: this.cx, y: this.cy, vx: this.facing * 200, vy: -150, kind: 'lathi', owner: 'enemy' });
      }
      return;
    }
    const dx = tgt.cx - this.cx, dy = tgt.cy - this.cy;
    this.face(tgt);
    if (Math.abs(dx) < 20 && Math.abs(dy) < 22 && this.meleeCd <= 0) { this.windup = 0.32; return; }
    if (!this.canSee(tgt)) { this.lostT += dt; if (this.lostT > 3) { this.state = 'patrol'; this.lostT = 0; } } else this.lostT = 0;
    this.vx = approach(this.vx, this.facing * this.D.chase, 600 * dt);
    if (this.onGround && this.wallAt(world, this.facing)) this.vy = -320;
    if (this.onGround && !this.groundAhead(world) && dy < 30) this.vy = -260;
  }

  aiGrenadier(dt, world, tgt) {
    this.combatState(dt, tgt, sees => {
      const dx = tgt.cx - this.cx;
      if (Math.abs(dx) < 70 && this.onGround && this.groundAhead(world)) this.vx = -sign(dx) * this.D.speed * 1.4;
      else this.vx = approach(this.vx, 0, 300 * dt);
      this.cool -= dt;
      if (this.cool <= 0 && sees) {
        this.cool = rand(this.D.cool[0], this.D.cool[1]);
        this.face(tgt);
        this.armOverride = 'throw'; this.armT = 0.25;
        const t = clamp(Math.abs(dx) / 150, 0.55, 1.15);
        const sx = this.cx, sy = this.y + 2;
        const vx = (tgt.cx - sx) / t + rand(-15, 15), vy = (tgt.cy - sy - 0.5 * GRAVITY * t * t) / t;
        Game.addProj(new Projectile({ x: sx, y: sy, vx, vy, grav: 1, owner: 'enemy', kind: 'bomb', explode: 30, power: 5, dmg: 6, life: 1.5, fuseExplode: true, bounce: 2, bounceDamp: 0.45, tileDmg: 0, src: this, ff: true, r: 3 }));
        SND.play('throw', { x: sx, y: sy });
      }
    });
  }

  aiRocketeer(dt, world, tgt) {
    this.combatState(dt, tgt, sees => {
      this.vx = approach(this.vx, 0, 300 * dt);
      if (this.aimT > 0) {
        this.aimT -= dt;
        this.aimAt = { x: tgt.cx, y: tgt.cy };
        if (this.aimT <= 0) {
          const m = this.muzzle();
          const a = Math.atan2(tgt.cy - m.y, tgt.cx - m.x);
          Game.addProj(new Projectile({ x: m.x, y: m.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, owner: 'enemy', kind: 'rocket', explode: 34, power: 7, dmg: 8, life: 3, src: this, ff: true, tileDmg: 0, r: 3 }));
          SND.play('whistle', { x: m.x, y: m.y }); fxSmoke(m.x - this.facing * 12, m.y, 4, 3);
          this.aimAt = null;
        }
        return;
      }
      this.cool -= dt;
      if (this.cool <= 0 && sees) { this.cool = rand(this.D.cool[0], this.D.cool[1]); this.aimT = 1.0 * DIFFICULTY[Settings.difficulty].reaction; }
    });
  }

  aiFlyer(dt, world, tgt) {
    const bob = Math.sin(this.t * 3) * 6;
    if (tgt && Math.abs(tgt.cx - this.cx) < this.D.range && this.canSee(tgt)) {
      if (this.state === 'patrol') this.alert(tgt);
      this.state = 'attack';
      const want = tgt.cx - this.cx;
      this.vx = approach(this.vx, clamp(want, -1, 1) * this.D.speed * (Math.abs(want) > 12 ? 1 : 0.2), 200 * dt);
      const wantY = Math.min(this.homeY, tgt.y - 70) + bob;
      this.vy = clamp((wantY - this.y) * 2, -60, 60);
      this.cool -= dt;
      if (this.cool <= 0 && Math.abs(want) < 18) {
        this.cool = rand(this.D.cool[0], this.D.cool[1]);
        Game.addProj(new Projectile({ x: this.cx, y: this.bottom + 2, vx: this.vx * 0.4, vy: 30, grav: 1, owner: 'enemy', kind: 'bomb', explode: 26, power: 4, dmg: 5, life: 2, fuseExplode: true, tileDmg: 0, src: this, ff: true, r: 3 }));
        SND.play('throw', { x: this.cx, y: this.cy });
      }
    } else {
      this.state = 'patrol';
      this.walkT -= dt;
      if (this.walkT <= 0) { this.walkT = rand(2, 4); this.facing *= -1; }
      this.vx = this.facing * this.D.speed * 0.5;
      this.vy = clamp((this.homeY + bob - this.y) * 2, -40, 40);
    }
    if (this.vx) this.facing = sign(this.vx);
  }

  flyPhysics(dt, world) {
    if (this.moveX(world, this.vx * dt)) { this.vx = -this.vx; this.facing = sign(this.vx) || this.facing; }
    if (this.moveY(world, this.vy * dt, true)) this.vy = 0;
  }

  hurt(dmg, info = {}) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flashT = 0.08;
    if (info.ignite && !this.D.heavy) this.ignite();
    if (this.hp <= 0) { this.die(info); return true; }
    const k = this.D.heavy ? 0.15 : 0.45;
    if (info.vx) this.vx += info.vx * k;
    if (info.kind === 'slap' || info.kind === 'gada') { this.vy = -150; this.stun(0.5, 'dizzy'); }
    SND.play('hurt', { x: this.cx, y: this.cy });
    for (let i = 0; i < 4; i++) FX.spawn({ x: this.cx, y: this.cy, vx: rand(-60, 60), vy: rand(-80, -10), life: 0.4, color: pick(HOLI), size: 1, grav: 0.6 });
    if (this.state === 'patrol' || this.state === 'search') {
      const p = Game.player;
      if (p && p.alive) { this.face(p); this.state = 'alert'; this.react = 0.35; this.alertIcon = 0.7; }
    }
    return true;
  }

  die(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    const away = sign(this.cx - (info.x !== undefined ? info.x : this.cx - this.facing)) || 1;
    this.vx = clamp(info.vx !== undefined ? info.vx : away * 120, -380, 380);
    this.vy = clamp(info.vy !== undefined ? info.vy : -200, -420, 100);
    if (this.D.heavy) { this.vx *= 0.5; this.vy *= 0.6; }
    this.rotV = (sign(this.vx) || 1) * rand(7, 13);
    this.grav = 1;
    fxHoli(this.cx, this.cy, info.kind === 'explosion' ? 36 : 24, info.kind === 'explosion' ? 1.3 : 1);
    SND.play('powder', { x: this.cx, y: this.cy });
    if (!this.D.fly) {
      FX.spawn({ kind: 'draw', x: this.cx, y: this.bottom - 2, vx: rand(-90, 90), vy: rand(-240, -140), life: 1.8, grav: 1, collide: true, rot: 0, vr: rand(-20, 20), c: pick(['#3a6fd0', '#2f9e44', '#c41e3a']), draw: drawChappalGib });
      if (chance(0.5)) Game.bubble(this, pick(DEATH_LINES), 1.1, '#ffb3c0');
    }
    if (this.D.fly) this.crashT = 0.01;
    Game.onKill(this, info);
  }

  updateDead(dt, world) {
    this.deadT += dt;
    this.rot += this.rotV * dt;
    this.physics(dt, world);
    if (this.crashT && (this.onGround || this.deadT > 2)) { this.crashT = 0; this.remove = true; explode(this.cx, this.cy, 22, { dmg: 4, power: 3, owner: 'player' }); return; }
    if (this.onGround) {
      this.vx *= 0.82; this.rotV *= 0.5;
      const target = this.rot > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.rot = lerp(this.rot % TAU, target, Math.min(1, dt * 10));
    }
    if (this.deadT > 6) this.remove = true;
  }

  stun(t, kind) {
    if (!this.alive) return;
    if (this.stunT > 0 && kind === 'dizzy') return;
    this.stunT = t; this.stunKind = kind;
    this.windup = 0; this.aimT = 0; this.aimAt = null; this.shots = 0;
    if (kind === 'cry' && chance(0.7)) { Game.bubble(this, pick(CRY_LINES), 2.2, '#a8dcff'); SND.play('cry', { x: this.cx, y: this.cy, throttle: 0.2 }); }
  }

  confuse(t) {
    if (!this.alive) return;
    this.confT = t; this.state = 'attack'; this.shots = 0; this.cool = rand(0.1, 0.6); this.lostT = 0;
    if (chance(0.75)) Game.bubble(this, pick(CONFUSED_LINES), 1.8, '#9dffbf');
  }

  ignite() {
    if (this.burnT > 0 || !this.alive) return;
    this.burnT = 1.5;
    this.facing = chance(0.5) ? 1 : -1;
    if (chance(0.6)) Game.bubble(this, pick(BURN_LINES), 1.2, '#ffcf8a');
  }

  pose() {
    if (!this.alive) return ['fall', 0, 'down'];
    if (this.burnT > 0) return ['panic', Math.floor(this.t * 12) % 6, 'up'];
    if (this.stunT > 0) {
      if (this.stunKind === 'cry') return ['cry', 0, 'cry'];
      if (this.stunKind === 'dance') return ['dance', Math.floor(this.t * 4) % 2, 'danceA'];
      return ['idle', 0, 'down'];
    }
    const arm = this.armT > 0 ? this.armOverride : (this.kind === 'patakha' || this.kind === 'lathi') && this.state === 'patrol' ? 'down' : 'aim';
    if (!this.onGround) return ['jump', 0, arm];
    if (Math.abs(this.vx) > 6) return ['run', Math.floor(this.stepT / 7) % 6, arm];
    return ['idle', Math.floor(this.t * 2) % 2, arm];
  }

  draw(g, camX, camY) {
    const fade = this.alive ? 1 : clamp(6 - this.deadT, 0, 1);
    if (fade <= 0) return;
    g.globalAlpha = fade;
    const x = Math.round(this.cx - camX), b = Math.round(this.bottom - camY);
    if (this.D.fly) drawDrone(g, x, b - 8, this.t, this.flashT > 0, this.alive);
    else {
      const [pose, frame, arm] = this.pose();
      const spr = humanSprite(this.look, pose, frame, arm, this.facing < 0, this.flashT > 0);
      const Y = humanLayout(this.look);
      const ax = this.facing > 0 ? Y.cx : Y.fw - 1 - Y.cx;
      if (!this.alive) {
        g.save(); g.translate(x, b - 6); g.rotate(this.rot); g.drawImage(spr, -ax, -(Y.groundY + 1) + 6); g.restore();
      } else g.drawImage(spr, x - ax, b - (Y.groundY + 1));
    }
    g.globalAlpha = 1;
    if (!this.alive) return;
    const top = Math.round(this.y - camY) - 10;
    if (this.alertIcon > 0 && this.state !== 'patrol') {
      g.fillStyle = '#1a0a0a'; g.fillRect(x - 3, top - 2, 6, 10);
      g.fillStyle = '#ffd23f'; g.fillRect(x - 2, top - 1, 4, 8);
      g.fillStyle = '#c41e1e'; g.fillRect(x - 1, top, 2, 4); g.fillRect(x - 1, top + 5, 2, 1);
    }
    if (this.confT > 0) {
      g.fillStyle = '#0a1a0f'; g.fillRect(x - 4, top - 3, 8, 10);
      g.fillStyle = '#25d366'; g.fillRect(x - 3, top - 2, 6, 8);
      g.fillStyle = '#ffffff'; g.fillRect(x - 2, top - 1, 4, 1); g.fillRect(x - 2, top + 1, 3, 1); g.fillRect(x - 2, top + 3, 4, 1);
    }
    if (this.stunT > 0 && this.stunKind === 'dizzy') {
      for (let i = 0; i < 3; i++) { const a = this.t * 8 + i * 2.1; g.fillStyle = '#ffe066'; g.fillRect(x + Math.round(Math.cos(a) * 6), top + 4 + Math.round(Math.sin(a) * 2), 2, 2); }
    }
    if (this.aimAt) {
      const m = this.muzzle();
      g.strokeStyle = Math.floor(this.t * 16) % 2 ? 'rgba(255,40,40,0.9)' : 'rgba(255,40,40,0.4)';
      g.lineWidth = 1; g.setLineDash([3, 2]);
      g.beginPath(); g.moveTo(m.x - camX, m.y - camY); g.lineTo(this.aimAt.x - camX, this.aimAt.y - camY); g.stroke();
      g.setLineDash([]);
    }
  }
}

/** "Jugaad drone": a steel thali on four tiny fans with a bomb hook. */
function drawDrone(g, cx, y, t, flash, alive) {
  const x = cx - 7;
  const O = '#121218';
  g.fillStyle = O; g.fillRect(x - 1, y + 2, 16, 5);
  g.fillStyle = flash ? '#ffffff' : '#c9d2d9'; g.fillRect(x, y + 3, 14, 3);
  g.fillStyle = '#eef3f6'; g.fillRect(x + 1, y + 3, 12, 1);
  g.fillStyle = Math.floor(t * 4) % 2 ? '#ff2d2d' : '#5a0a0a'; g.fillRect(x + 6, y + 5, 2, 1);
  for (const px of [x - 1, x + 12]) {
    g.fillStyle = O; g.fillRect(px + 1, y, 2, 3);
    if (alive) { const k = Math.floor(t * 30) % 2; g.fillStyle = 'rgba(220,220,230,0.8)'; g.fillRect(px - 2 + k, y - 1, 6 - k * 2, 1); }
  }
  g.fillStyle = '#7b4b22'; g.fillRect(x + 6, y + 7, 2, 2);
}
