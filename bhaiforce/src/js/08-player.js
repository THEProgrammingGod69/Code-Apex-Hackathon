/* =============================================================================
 * PLAYER — run, jump (coyote time + buffering), Broforce-style wall climbing,
 * ladders, drop-through planks, firing, THAPPAD melee, specials, and death.
 * ========================================================================== */

const JUMP_V = 335;
const RUN_SPEED = 108;

class Player extends Entity {
  constructor(x, y, bhaiId) {
    super(x, y, 10, 22);
    this.setBhai(bhaiId);
    this.alive = true;
    this.hp = DIFFICULTY[Settings.difficulty].hp;
    this.specials = 3;
    this.inv = 2;
    this.fireCd = 0; this.meleeCd = 0; this.specialLock = 0;
    this.coyote = 0; this.jumpBuf = 0; this.dropT = 0;
    this.armOverride = null; this.armT = 0; this.flashT = 0;
    this.climbing = false; this.wallDir = 0; this.stepT = 0; this.dustT = 0;
    this.activeSpecial = null; this.rot = 0;
  }

  setBhai(id) {
    this.bhai = BHAI_BY_ID[id];
    this.look = this.bhai.look;
    this.chappalsOut = 0;
    this.activeSpecial = null;
  }

  get invulnerable() { return this.inv > 0 || (this.activeSpecial && this.activeSpecial.invulnerable); }

  /** World position of the weapon tip (matches the sprite's hand). */
  muzzle() {
    const Y = humanLayout(this.look);
    const tTop = Y.groundY - Y.lh - Y.th;
    const handFromBottom = Y.groundY + 1 - (tTop + 3);
    return { x: this.cx + this.facing * (6 + WEAPON_LEN[this.look.weapon]), y: this.bottom - handFromBottom };
  }

  throwPose() { this.armOverride = 'throw'; this.armT = 0.12; }

  update(dt, world) {
    this.t += dt;
    this.inv -= dt; this.fireCd -= dt; this.meleeCd -= dt; this.armT -= dt; this.flashT -= dt; this.specialLock -= dt; this.dropT -= dt;
    if (!this.alive) return this.updateDead(dt, world);

    const I = Input;
    const left = I.down('left'), right = I.down('right'), up = I.down('up'), down = I.down('down');
    const mx = (right ? 1 : 0) - (left ? 1 : 0);
    const nearLadder = world.boxLadder(this.x, this.y, this.w, this.h);
    const jumpPressed = I.pressed('jump') || (I.pressed('kup') && !nearLadder);
    const jumpHeld = I.down('jump') || (I.down('kup') && !nearLadder);

    // ladders
    if (nearLadder && (up || (down && !this.onGround)) && !this.climbing) this.climbing = true;
    if (this.climbing && !nearLadder) this.climbing = false;

    // horizontal movement
    const speed = RUN_SPEED * this.bhai.speed;
    if (mx) {
      this.vx = approach(this.vx, mx * speed, (this.onGround ? 1200 : 800) * dt);
      if (!this.activeSpecial) this.facing = mx;
    } else {
      this.vx = approach(this.vx, 0, (this.onGround ? 1400 : 320) * dt);
    }

    // jumping: coyote time + input buffering + variable height
    this.coyote = this.onGround || this.climbing ? 0.1 : this.coyote - dt;
    this.jumpBuf = jumpPressed ? 0.12 : this.jumpBuf - dt;
    if (down && jumpPressed && this.onGround && world.oneWayBelow(this.x, this.w, this.bottom, this.bottom + 1) >= 0) {
      this.dropT = 0.22; this.jumpBuf = 0; // drop through the plank instead of jumping
    }
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.climbing = false;
      SND.play('jump'); fxDust(this.cx, this.bottom, 3);
    }
    if (I.released('jump') && this.vy < -120 && !this.wallDir) this.vy *= 0.5;

    // Broforce wall climb: airborne + pushing into a wall + holding jump/up = climb
    this.wallDir = 0;
    if (!this.onGround && !this.climbing && mx && this.wallAt(world, mx)) {
      this.wallDir = mx;
      if (jumpHeld || up) {
        this.vy = Math.max(this.vy - 2200 * dt, -100);
        const headClear = !world.boxSolid(mx > 0 ? this.x + this.w : this.x - 1, this.y - 3, 1, 9);
        if (headClear) { this.vy = -230; this.vx = mx * 90; } // vault over the ledge
        if (Math.random() < 0.15) fxDust(mx > 0 ? this.x + this.w : this.x, this.cy, 1);
      } else this.vy = Math.min(this.vy, 40);
    }

    if (this.climbing) {
      this.grav = 0;
      this.vy = up ? -95 : down ? 95 : 0;
      this.vx = mx * 55;
      if (jumpPressed) { this.climbing = false; this.vy = -JUMP_V * 0.8; }
    } else this.grav = this.state === 'drop' ? 0.3 : 1;
    if (this.state === 'drop') this.vy = Math.min(this.vy, 130); // parachute

    // specials with their own movement
    if (this.activeSpecial) {
      const keep = this.activeSpecial.update(this, dt);
      if (!keep) { const s = this.activeSpecial; this.activeSpecial = null; if (s.end) s.end(this); }
    }

    this.physics(dt, world, this.dropT > 0);
    if (this.justLanded && (this.impactVy || 0) > 240) { fxDust(this.cx, this.bottom, 5); SND.play('land'); }
    if (this.state === 'drop' && (this.onGround || this.climbing)) { this.state = 'normal'; fxDust(this.cx, this.bottom, 8); Game.shake(2); }

    // footstep dust
    if (this.onGround && Math.abs(this.vx) > 40) {
      this.stepT += Math.abs(this.vx) * dt;
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = 0.28; fxDust(this.cx - this.facing * 3, this.bottom, 1); }
    }

    // weapons
    if (I.down('fire') && this.fireCd <= 0 && !(this.activeSpecial && this.activeSpecial.noFire)) {
      const fired = this.bhai.fire(this);
      if (fired !== false) {
        this.fireCd = this.bhai.weapon.rate * (Game.slowmo > 0 && this.bhai.id === 'mooch' ? 0.5 : 1);
        Game.noise(this.cx, this.cy, 230);
      } else this.fireCd = 0.05;
    }
    if (I.pressed('melee') && this.meleeCd <= 0) this.melee();
    if (I.pressed('special')) this.useSpecial();

    if (this.y > world.pxH + 40) this.die({ x: this.cx, y: this.cy, kind: 'fall' });
  }

  melee() {
    this.meleeCd = 0.36;
    this.armOverride = this.bhai.id === 'sixer' ? 'swing' : 'slap';
    this.armT = 0.16;
    const reach = this.bhai.id === 'sixer' ? 24 : 19;
    const box = { x: this.facing > 0 ? this.cx : this.cx - reach, y: this.y + 1, w: reach, h: this.h - 2 };
    let hit = Game.meleeHit(this, box, 8, 330, 'slap');
    const tx = Math.floor((this.cx + this.facing * 14) / TILE), ty = Math.floor((this.y + 8) / TILE);
    Game.world.damage(tx, ty, 1.5, 'bullet');
    if (hit) {
      SND.play('slap', { throttle: 0 });
      Game.hitStop(0.075);
      Game.popText(this.cx + this.facing * 18, this.y - 2, this.bhai.id === 'sixer' ? 'CHAUKA!' : 'THAPPAD!', '#ffdd55', 1.15);
      Game.shake(3); vibrate(30);
      fxSparks(this.cx + this.facing * 14, this.cy - 2, 6, '#ffffff', 120);
    } else SND.play('swing');
  }

  useSpecial() {
    if (this.specialLock > 0 || this.activeSpecial) return;
    if (this.specials <= 0) {
      SND.play('click');
      Game.popText(this.cx, this.y - 6, 'SPECIAL KHATAM!', '#ff8a8a', 0.9);
      this.specialLock = 0.4;
      return;
    }
    this.specials--;
    this.specialLock = 0.6;
    this.bhai.specialUse(this);
    SND.play('special');
    Game.specialCallout(this.bhai);
    VOICE.say(this.bhai.lines.special, Object.assign({ force: true }, this.bhai.voice));
  }

  hurt(dmg, info = {}) {
    if (!this.alive || this.invulnerable || Game.state !== 'playing') return false;
    this.hp -= dmg;
    if (this.hp <= 0) { this.die(info); return true; }
    this.inv = 1.3; this.flashT = 0.15;
    this.vx = (info.x !== undefined && info.x < this.cx ? 1 : -1) * 160; this.vy = -180;
    SND.play('hurt'); Game.shake(5); vibrate(45); Game.flash(0.25, '#ff2d2d');
    Game.popText(this.cx, this.y - 4, pick(['AAH!', 'OUCH!', 'ARRE!']), '#ff6b6b', 1);
    return true;
  }

  die(info = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.activeSpecial = null;
    this.deadT = 0;
    this.vx = (info.x !== undefined && info.x < this.cx ? 1 : -1) * 150;
    this.vy = -280; this.rotV = this.vx > 0 ? 9 : -9;
    for (const c of ['#ff9933', '#ffffff', '#138808']) {
      for (let i = 0; i < 14; i++) {
        const a = rand(0, TAU), s = rand(40, 170);
        FX.spawn({ x: this.cx, y: this.cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rand(0.8, 1.5), color: c, size: 2, collide: true, stain: true, drag: 1.2, grav: 0.6 });
      }
    }
    SND.play('death'); Game.shake(8); vibrate([60, 40, 90]);
    Game.onPlayerDeath(this);
  }

  updateDead(dt, world) {
    this.deadT += dt;
    this.rot += (this.rotV || 0) * dt;
    this.physics(dt, world);
    if (this.onGround) { this.vx *= 0.85; this.rotV *= 0.6; }
  }

  pose() {
    if (!this.alive) return ['fall', 0, 'down'];
    if (this.state === 'drop') return ['drop', 0, 'up'];
    let arm = this.armT > 0 ? this.armOverride : 'aim';
    if (this.climbing) return ['climb', Math.floor(this.y / 8) % 2, arm];
    if (this.wallDir) return ['climb', Math.floor(this.t * 8) % 2, arm];
    if (!this.onGround) return [this.vy < 0 ? 'jump' : 'fall', 0, arm];
    if (Math.abs(this.vx) > 12) return ['run', Math.floor(this.stepT / 7) % 6, arm];
    return ['idle', Math.floor(this.t * 2) % 2, arm];
  }

  draw(g, camX, camY) {
    if (this.alive && this.inv > 0 && this.inv < 1.9 && Math.floor(this.t * 18) % 2 === 0) return;
    const [pose, frame, arm] = this.pose();
    const spr = humanSprite(this.look, pose, frame, arm, this.facing < 0, this.flashT > 0);
    const Y = humanLayout(this.look);
    const ax = this.facing > 0 ? Y.cx : Y.fw - 1 - Y.cx;
    const x = Math.round(this.cx - camX), b = Math.round(this.bottom - camY);
    if (!this.alive) {
      g.save(); g.translate(x, b - 8); g.rotate(this.rot); g.drawImage(spr, -ax, -(Y.groundY + 1) + 8); g.restore();
      return;
    }
    if (this.activeSpecial && this.activeSpecial.draw) this.activeSpecial.draw(this, g, camX, camY);
    g.drawImage(spr, x - ax, b - (Y.groundY + 1));
  }
}
