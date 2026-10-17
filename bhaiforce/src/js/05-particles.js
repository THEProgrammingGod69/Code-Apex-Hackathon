/* =============================================================================
 * PARTICLES & FX — pooled particles (debris, smoke, fire, sparks, Holi gulal,
 * fireworks), shockwave rings and dynamic lights for the night lighting pass.
 * ========================================================================== */

const HOLI = ['#ff2d95', '#ffd400', '#00c2ff', '#7cff3b', '#ff7a00', '#b84dff', '#ff3d3d'];

const FX = {
  list: [], max: 1500, rings: [], lights: [],

  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.t = 0;
    p.life = p.life || 0.6;
    p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.grav = p.grav === undefined ? 1 : p.grav;
    p.drag = p.drag || 0;
    p.size = p.size || 1;
    this.list.push(p);
    return p;
  },

  ring(x, y, r, color = '#fff', life = 0.35, width = 2) { this.rings.push({ x, y, r, color, life, t: 0, width }); },

  /** Short-lived light for the darkness pass (night missions) and glow. */
  light(x, y, r, life = 0.12, color = '#ffb347', intensity = 1) { this.lights.push({ x, y, r, life, t: 0, color, intensity }); },

  clear() { this.list.length = 0; this.rings.length = 0; this.lights.length = 0; },

  update(dt, world) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.vy += GRAVITY * p.grav * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.collide && world) {
        if (world.solidPx(nx, p.y)) { p.vx *= -0.35; } else p.x = nx;
        if (world.solidPx(p.x, ny)) {
          if (p.stain && p.vy > 0) { world.stain(p.x, ny + 1, p.color, p.size > 1 ? 2 : 1); p.t = p.life; }
          p.vy *= -0.3; p.vx *= 0.7;
        } else p.y = ny;
      } else { p.x = nx; p.y = ny; }
      if (p.vr) p.rot = (p.rot || 0) + p.vr * dt;
      if (p.grow) p.size += p.grow * dt;
      if (p.onUpdate) p.onUpdate(p, dt);
      L[w++] = p;
    }
    L.length = w;
    this.rings = this.rings.filter(r => (r.t += dt) < r.life);
    this.lights = this.lights.filter(l => (l.t += dt) < l.life);
  },

  draw(g, camX, camY) {
    // normal blend first, then additive glow particles
    for (let pass = 0; pass < 2; pass++) {
      g.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.list) {
        if (!!p.add !== !!pass) continue;
        const k = p.t / p.life;
        const x = Math.round(p.x - camX), y = Math.round(p.y - camY);
        if (x < -40 || y < -40 || x > VIEW_W + 40 || y > VIEW_H + 40) continue;
        g.globalAlpha = p.fade === false ? 1 : clamp(1 - k * k, 0, 1) * (p.alpha || 1);
        const s = p.shrink ? Math.max(0.5, p.size * (1 - k)) : p.size;
        if (p.kind === 'circle') {
          g.fillStyle = p.color;
          g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
        } else if (p.kind === 'streak') {
          g.strokeStyle = p.color; g.lineWidth = s;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - p.vx * 0.025, y - p.vy * 0.025); g.stroke();
        } else if (p.kind === 'draw') {
          p.draw(g, x, y, k, p);
        } else {
          g.fillStyle = p.color;
          const si = Math.max(1, Math.round(s));
          g.fillRect(x - (si >> 1), y - (si >> 1), si, si);
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      const k = r.t / r.life;
      g.globalAlpha = 1 - k;
      g.strokeStyle = r.color; g.lineWidth = r.width * (1 - k) + 0.5;
      g.beginPath(); g.arc(r.x - camX, r.y - camY, r.r * easeOutCubic(k), 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  },
};

/* --------------------------------------------------------------- emitters - */
function fxSparks(x, y, n = 6, color = '#ffd36b', speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.3, 1) * speed;
    FX.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.15, 0.35), color, kind: 'streak', size: 1, grav: 0.5, add: true });
  }
}

function fxDebris(x, y, colors, n = 6) {
  for (let i = 0; i < n; i++) {
    FX.spawn({
      x: x + rand(-6, 6), y: y + rand(-6, 6), vx: rand(-90, 90), vy: rand(-170, -30),
      life: rand(0.6, 1.2), color: pick(colors), size: randi(1, 3), collide: true, drag: 0.5,
    });
  }
  FX.spawn({ x, y, vx: 0, vy: -10, life: 0.5, color: 'rgba(200,190,170,0.35)', kind: 'circle', size: 5, grow: 14, grav: -0.05, fade: true });
}

function fxSmoke(x, y, n = 4, size = 5, color = 'rgba(60,55,60,0.55)') {
  for (let i = 0; i < n; i++) {
    FX.spawn({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-40, -10), life: rand(0.7, 1.4), color, kind: 'circle', size: size * rand(0.6, 1.2), grow: 10, grav: -0.04, drag: 1.2 });
  }
}

function fxMuzzle(x, y, dir, big = false) {
  FX.spawn({ x: x + dir * 2, y, life: 0.05, color: '#fff6c0', kind: 'circle', size: big ? 4 : 3, grav: 0, add: true });
  FX.spawn({ x: x + dir * 5, y, life: 0.06, color: '#ffb02e', kind: 'circle', size: big ? 3 : 2, grav: 0, add: true });
  FX.light(x, y, big ? 70 : 50, 0.06, '#ffcf6b', 0.9);
}

function fxShell(x, y, dir) {
  FX.spawn({ x, y, vx: -dir * rand(30, 70), vy: rand(-120, -70), life: 0.9, color: '#e7b83a', size: 1, collide: true });
}

function fxHoli(x, y, n = 26, power = 1) {
  const cols = [pick(HOLI), pick(HOLI), pick(HOLI)];
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(30, 170) * power;
    const color = pick(cols);
    FX.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, life: rand(0.6, 1.4), color, size: randi(1, 2), collide: true, stain: true, drag: 1.4, grav: 0.55 });
  }
  for (let i = 0; i < 5; i++) {
    FX.spawn({ x: x + rand(-5, 5), y: y + rand(-6, 4), vx: rand(-25, 25), vy: rand(-30, 0), life: rand(0.8, 1.6), color: rgba(pick(cols), 0.55), kind: 'circle', size: rand(4, 7), grow: 9, grav: -0.03, drag: 1.5 });
  }
}

function fxFire(x, y, n = 3, spread = 6) {
  for (let i = 0; i < n; i++) {
    FX.spawn({ x: x + rand(-spread, spread), y: y + rand(-3, 3), vx: rand(-15, 15), vy: rand(-70, -30), life: rand(0.25, 0.55), color: pick(['#ffdf6b', '#ff9b2e', '#ff5a1f']), kind: 'circle', size: rand(1.5, 3.2), shrink: true, grav: -0.1, add: true });
  }
}

function fxExplosion(x, y, r, o = {}) {
  const n = Math.round(r * 0.9);
  FX.spawn({ x, y, life: 0.12, color: '#ffffff', kind: 'circle', size: r * 0.7, grav: 0, add: true });
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(0.35, 1) * r * 3.4;
    FX.spawn({ x: x + Math.cos(a) * r * 0.2, y: y + Math.sin(a) * r * 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, life: rand(0.25, 0.6), color: pick(o.holi ? HOLI : ['#fff2a8', '#ffc23d', '#ff7b1f', '#ff4d1a']), kind: 'circle', size: rand(2, 4.5), shrink: true, grav: -0.15, drag: 3, add: true });
  }
  fxSmoke(x, y - 4, Math.round(r / 5), r * 0.22, 'rgba(45,38,42,0.6)');
  fxSparks(x, y, Math.round(r / 3), '#ffd36b', r * 5);
  FX.ring(x, y, r * 1.3, 'rgba(255,240,200,0.9)', 0.32, 3);
  FX.light(x, y, r * 4.5, 0.35, '#ffb347', 1.2);
}

function fxFirework(x, y, color) {
  const c = color || pick(HOLI);
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, s = rand(60, 95);
    FX.spawn({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.9, 1.4), color: i % 5 ? c : '#ffffff', size: 1, grav: 0.12, drag: 1.4, add: true, kind: i % 3 ? 'px' : 'streak' });
  }
  FX.light(x, y, 160, 0.4, c, 0.8);
}

function fxDust(x, y, n = 4) {
  for (let i = 0; i < n; i++) {
    FX.spawn({ x: x + rand(-4, 4), y, vx: rand(-40, 40), vy: rand(-25, -5), life: rand(0.3, 0.5), color: 'rgba(210,200,180,0.55)', kind: 'circle', size: rand(1.5, 3), grow: 6, grav: 0, drag: 3 });
  }
}

function fxTears(x, y) {
  FX.spawn({ x, y, vx: rand(-30, 30), vy: rand(-60, -20), life: 0.6, color: '#6ec3ff', size: 1, grav: 0.8 });
}

function fxConfetti(x, y, n = 40) {
  for (let i = 0; i < n; i++) {
    FX.spawn({ x: x + rand(-20, 20), y, vx: rand(-80, 80), vy: rand(-220, -80), life: rand(1.2, 2.2), color: pick(HOLI), size: 2, grav: 0.35, drag: 1.2 });
  }
}
