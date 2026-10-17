/* =============================================================================
 * BACKGROUNDS & WEATHER — per-mission skies, pre-rendered parallax layers
 * (Mumbai skyline + sea link, Thar dunes + forts, Delhi skyline with Diwali
 * fireworks, Himalayan ranges), plus monsoon rain, dust, embers and snow.
 * ========================================================================== */

const SKIES = {
  dusk: ['#2b1d4a', '#7a3b6e', '#ff8a5c', '#ffc77a'],
  day: ['#3f8fd6', '#7cc0ea', '#f5d9a0', '#f7c27a'],
  night: ['#05040f', '#120b2e', '#2a1446', '#4a1f4a'],
  snow: ['#5d7fa8', '#9ab8d6', '#d8e6f2', '#f0e6e0'],
};

const BG = {
  theme: null, layers: [], sky: null, weather: [], t: 0, fwT: 0, train: null,

  setup(themeName, skyName, weather) {
    this.theme = themeName; this.skyName = skyName; this.weatherKind = weather;
    this.layers = this.buildLayers(themeName);
    this.weather = [];
    this.train = themeName === 'mumbai' ? { x: -400, t: 6 } : null;
    this.kites = themeName === 'desert' ? Array.from({ length: 4 }, () => ({ x: rand(0, 600), y: rand(30, 110), p: rand(0, TAU), c: pick(HOLI) })) : null;
    this.onResize();
  },

  onResize() {
    if (!this.skyName) return;
    const c = makeCanvas(1, VIEW_H), g = c.getContext('2d');
    const s = SKIES[this.skyName];
    const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
    s.forEach((col, i) => grad.addColorStop(i / (s.length - 1), col));
    g.fillStyle = grad; g.fillRect(0, 0, 1, VIEW_H);
    this.sky = c;
    this.stars = this.skyName === 'night' ? Array.from({ length: 70 }, () => ({ x: rand(0, 1), y: rand(0, 0.6), b: rand(0.3, 1) })) : null;
  },

  /** Each layer: a horizontally tiling canvas plus its parallax factor and baseline. */
  buildLayers(th) {
    const L = [];
    const r = new RNG(42);
    const W = 640;
    const mk = (h, draw, factor, yOff) => { const c = makeCanvas(W, h), g = c.getContext('2d'); draw(g, W, h); L.push({ c, factor, yOff, h }); };
    if (th === 'mumbai') {
      mk(150, (g, w, h) => { // sea + far towers
        g.fillStyle = '#3b3560'; g.fillRect(0, h - 20, w, 20);
        for (let x = 0; x < w;) { const bw = r.int(16, 34), bh = r.int(40, 120); g.fillStyle = '#4a3f70'; g.fillRect(x, h - 20 - bh, bw, bh); for (let wy = h - 20 - bh + 4; wy < h - 24; wy += 6) for (let wx = x + 3; wx < x + bw - 3; wx += 5) if (r.chance(0.3)) { g.fillStyle = 'rgba(255,214,140,0.55)'; g.fillRect(wx, wy, 2, 2); } x += bw + r.int(2, 8); }
      }, 0.08, 72);
      mk(110, (g, w, h) => { // sea-link style cable bridge + water
        g.fillStyle = '#2c2a52'; g.fillRect(0, h - 14, w, 14);
        g.fillStyle = '#3d3a6e'; g.fillRect(0, h - 30, w, 3);
        for (const px of [140, 460]) {
          g.fillStyle = '#3d3a6e'; g.fillRect(px - 3, h - 96, 6, 70);
          g.strokeStyle = 'rgba(160,150,210,0.55)'; g.lineWidth = 1;
          for (let i = 1; i <= 8; i++) { g.beginPath(); g.moveTo(px, h - 92 + i * 3); g.lineTo(px - i * 16, h - 29); g.moveTo(px, h - 92 + i * 3); g.lineTo(px + i * 16, h - 29); g.stroke(); }
        }
        for (let x = 0; x < w; x += 9) { g.fillStyle = 'rgba(255,200,150,0.25)'; g.fillRect(x + r.int(0, 5), h - 10 + r.int(0, 6), 4, 1); }
      }, 0.18, 120);
      mk(120, (g, w, h) => { // chawls and slums
        for (let x = 0; x < w;) {
          const bw = r.int(28, 60), bh = r.int(40, 95);
          const col = r.pick(['#5a3d5c', '#4c3a60', '#634060']);
          g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
          g.fillStyle = r.pick(['#2f6fd6', '#3a5ab0', '#7a4a3a']); g.fillRect(x - 2, h - bh - 3, bw + 4, 4);
          for (let wy = h - bh + 6; wy < h - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 8) { g.fillStyle = r.chance(0.45) ? '#ffcf7a' : '#2c2140'; g.fillRect(wx, wy, 4, 4); }
          if (r.chance(0.5)) { g.fillStyle = '#1e1a2a'; g.fillRect(x + 6, h - bh - 12, 10, 9); }
          x += bw + r.int(0, 6);
        }
      }, 0.32, 140);
    } else if (th === 'desert') {
      mk(110, (g, w, h) => { // far dunes
        g.fillStyle = '#e6b07a';
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, h - 50 - Math.sin(x * 0.012) * 22 - Math.sin(x * 0.031) * 10);
        g.lineTo(w, h); g.fill();
      }, 0.08, 120);
      mk(140, (g, w, h) => { // Jaisalmer-style fort on a ridge
        g.fillStyle = '#c98a4f';
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 8) g.lineTo(x, h - 34 - Math.sin(x * 0.02) * 14); g.lineTo(w, h); g.fill();
        g.fillStyle = '#b4743c';
        const fx = 160;
        g.fillRect(fx, h - 96, 260, 64);
        for (let x = fx; x < fx + 260; x += 10) g.fillRect(x, h - 102, 6, 6);
        for (const tx of [fx - 10, fx + 80, fx + 170, fx + 250]) { g.fillRect(tx, h - 118, 22, 86); g.beginPath(); g.arc(tx + 11, h - 118, 11, Math.PI, 0); g.fill(); g.fillRect(tx + 10, h - 134, 2, 6); }
        g.fillStyle = '#7a4a24'; for (let x = fx + 10; x < fx + 250; x += 22) g.fillRect(x, h - 80, 6, 10);
      }, 0.16, 110);
      mk(80, (g, w, h) => { // near dunes with camels
        g.fillStyle = '#d99a58';
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 6) g.lineTo(x, h - 26 - Math.sin(x * 0.018 + 1) * 12); g.lineTo(w, h); g.fill();
        g.fillStyle = '#7a4a2a';
        for (const cx of [90, 330, 520]) {
          const y = h - 38 - Math.sin(cx * 0.018 + 1) * 12;
          g.fillRect(cx, y, 16, 6); g.fillRect(cx + 4, y - 4, 6, 4); g.fillRect(cx + 14, y - 8, 3, 10); g.fillRect(cx + 16, y - 9, 4, 3);
          g.fillRect(cx + 1, y + 6, 2, 8); g.fillRect(cx + 12, y + 6, 2, 8);
        }
      }, 0.3, 180);
    } else if (th === 'diwali') {
      mk(150, (g, w, h) => { // far skyline with a domed silhouette and minarets
        g.fillStyle = '#1a1030';
        for (let x = 0; x < w;) { const bw = r.int(20, 44), bh = r.int(30, 80); g.fillRect(x, h - bh, bw, bh); x += bw + r.int(0, 10); }
        const mx = 300;
        g.fillRect(mx - 60, h - 70, 120, 70);
        g.beginPath(); g.arc(mx, h - 70, 30, Math.PI, 0); g.fill();
        g.beginPath(); g.arc(mx - 44, h - 70, 14, Math.PI, 0); g.fill(); g.beginPath(); g.arc(mx + 44, h - 70, 14, Math.PI, 0); g.fill();
        g.fillRect(mx - 74, h - 120, 8, 120); g.fillRect(mx + 66, h - 120, 8, 120);
        for (let x = 0; x < w; x += 7) { g.fillStyle = HOLI[(x / 7) % HOLI.length]; g.globalAlpha = 0.6; g.fillRect(x, h - 82 + Math.sin(x * 0.1) * 3, 2, 2); }
        g.globalAlpha = 1;
      }, 0.1, 110);
      mk(120, (g, w, h) => { // havelis with lit windows
        for (let x = 0; x < w;) {
          const bw = r.int(34, 62), bh = r.int(50, 100);
          g.fillStyle = '#24163a'; g.fillRect(x, h - bh, bw, bh);
          for (let wy = h - bh + 8; wy < h - 8; wy += 12) for (let wx = x + 5; wx < x + bw - 5; wx += 10) { g.fillStyle = r.chance(0.6) ? '#ffb347' : '#140c22'; g.fillRect(wx, wy, 5, 6); }
          g.strokeStyle = 'rgba(255,200,120,0.6)';
          g.beginPath(); g.moveTo(x, h - bh + 4); g.quadraticCurveTo(x + bw / 2, h - bh + 14, x + bw, h - bh + 4); g.stroke();
          x += bw + r.int(2, 8);
        }
      }, 0.28, 150);
    } else {
      mk(160, (g, w, h) => { // far peaks
        g.fillStyle = '#7d93b4';
        g.beginPath(); g.moveTo(0, h);
        let y = h - 60;
        for (let x = 0; x <= w; x += 20) { y = clamp(y + r.range(-40, 40), h - 150, h - 40); g.lineTo(x, y); }
        g.lineTo(w, h); g.fill();
        g.fillStyle = '#eef4fa';
        g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(0, h);
        y = h - 60;
        const r2 = new RNG(42);
        for (let x = 0; x <= w; x += 20) { y = clamp(y + r2.range(-40, 40), h - 150, h - 40); g.lineTo(x, y + 6); }
        g.lineTo(w, h); g.globalCompositeOperation = 'source-atop'; g.fillRect(0, 0, w, h - 90); g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }, 0.06, 90);
      mk(120, (g, w, h) => { // mid ridge + monastery
        g.fillStyle = '#5a6f8f';
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 10) g.lineTo(x, h - 40 - Math.sin(x * 0.015) * 25 - Math.sin(x * 0.05) * 6); g.lineTo(w, h); g.fill();
        g.fillStyle = '#e8e0d4'; g.fillRect(380, h - 92, 50, 26); g.fillStyle = '#8a2a2a'; g.fillRect(378, h - 96, 54, 5); g.fillRect(392, h - 106, 26, 10); g.fillStyle = '#d4a017'; g.fillRect(403, h - 112, 4, 6);
      }, 0.16, 140);
      mk(90, (g, w, h) => { // pines
        for (let x = 0; x < w; x += r.int(10, 22)) { const th2 = r.int(26, 50); g.fillStyle = '#2a4050'; g.beginPath(); g.moveTo(x, h - th2 - 10); g.lineTo(x - 9, h); g.lineTo(x + 9, h); g.fill(); }
      }, 0.32, 190);
    }
    return L;
  },

  update(dt, camX) {
    this.t += dt;
    const W = this.weatherKind;
    if (W === 'rain') {
      for (let i = 0; i < 6; i++) this.weather.push({ x: rand(-40, VIEW_W + 40), y: -10, vx: -70, vy: rand(420, 520), life: 1 });
    } else if (W === 'snow') {
      if (Math.random() < 0.9) this.weather.push({ x: rand(-40, VIEW_W + 40), y: -6, vx: rand(-20, 10), vy: rand(25, 50), life: 8, s: chance(0.3) ? 2 : 1, p: rand(0, TAU) });
    } else if (W === 'dust') {
      if (Math.random() < 0.5) this.weather.push({ x: VIEW_W + 10, y: rand(0, VIEW_H), vx: rand(-160, -90), vy: rand(-10, 10), life: 6, s: 1 });
    } else if (W === 'embers') {
      if (Math.random() < 0.3) this.weather.push({ x: rand(0, VIEW_W), y: VIEW_H + 5, vx: rand(-10, 10), vy: rand(-40, -20), life: 7, s: 1, c: pick(['#ffb347', '#ff6a2a', '#ffd23f']) });
    }
    for (const w of this.weather) { w.x += w.vx * dt; w.y += w.vy * dt; w.life -= dt; if (w.p !== undefined) w.x += Math.sin(this.t * 2 + w.p) * 0.3; }
    this.weather = this.weather.filter(w => w.life > 0 && w.y < VIEW_H + 10 && w.y > -20 && w.x > -60 && w.x < VIEW_W + 60);
    if (this.weather.length > 500) this.weather.splice(0, this.weather.length - 500);
    if (this.theme === 'diwali') {
      this.fwT -= dt;
      if (this.fwT <= 0) { this.fwT = rand(0.5, 1.4); this.fireworks = this.fireworks || []; this.fireworks.push({ x: rand(20, VIEW_W - 20), y: rand(25, 110), t: 0, c: pick(HOLI), n: 26 }); }
      if (this.fireworks) { for (const f of this.fireworks) f.t += dt; this.fireworks = this.fireworks.filter(f => f.t < 1.6); }
    }
    if (this.train) { this.train.t -= dt; if (this.train.t <= 0) { this.train.x += 260 * dt; if (this.train.x > 1400) { this.train.x = -400; this.train.t = rand(8, 14); } } }
  },

  draw(g, camX, camY, worldH) {
    g.drawImage(this.sky, 0, 0, VIEW_W, VIEW_H);
    const vy = clamp((camY - (worldH - VIEW_H)) * 0.15, -60, 10);
    if (this.stars) for (const s of this.stars) { g.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(this.t * 2 + s.x * 50)); g.fillStyle = '#ffffff'; g.fillRect(Math.round(s.x * VIEW_W), Math.round(s.y * VIEW_H), 1, 1); }
    g.globalAlpha = 1;
    // sun / moon
    if (this.skyName === 'dusk') { g.fillStyle = 'rgba(255,170,110,0.9)'; g.beginPath(); g.arc(VIEW_W * 0.72, 150 - vy * 0.2, 26, 0, TAU); g.fill(); }
    else if (this.skyName === 'day') { g.fillStyle = 'rgba(255,240,190,0.95)'; g.beginPath(); g.arc(VIEW_W * 0.8, 46, 18, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,190,0.2)'; g.beginPath(); g.arc(VIEW_W * 0.8, 46, 34, 0, TAU); g.fill(); }
    else if (this.skyName === 'night') { g.fillStyle = '#f4ecd0'; g.beginPath(); g.arc(VIEW_W * 0.18, 44, 12, 0, TAU); g.fill(); g.fillStyle = '#120b2e'; g.beginPath(); g.arc(VIEW_W * 0.18 + 5, 41, 11, 0, TAU); g.fill(); }
    if (this.kites) for (const k of this.kites) {
      const x = ((k.x - camX * 0.05 + this.t * 6) % (VIEW_W + 40) + VIEW_W + 40) % (VIEW_W + 40) - 20, y = k.y + Math.sin(this.t + k.p) * 6;
      g.fillStyle = k.c; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.fill();
      g.strokeStyle = 'rgba(60,40,30,0.4)'; g.beginPath(); g.moveTo(x, y + 5); g.lineTo(x - 30, y + 80); g.stroke();
    }
    if (this.fireworks) for (const f of this.fireworks) {
      const k = f.t / 1.6;
      if (f.t < 0.5) { g.fillStyle = '#ffe9a8'; g.fillRect(Math.round(f.x), Math.round(f.y + (1 - f.t / 0.5) * 80), 1, 3); continue; }
      const e = (f.t - 0.5) / 1.1;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1 - e;
      for (let i = 0; i < f.n; i++) { const a = (i / f.n) * TAU, rr = easeOutCubic(e) * 28; g.fillStyle = i % 4 ? f.c : '#ffffff'; g.fillRect(Math.round(f.x + Math.cos(a) * rr), Math.round(f.y + Math.sin(a) * rr + e * e * 10), 1, 1); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (f.t - 0.5 < 0.04 && !f.snd) { f.snd = true; SND.play('firework', { vol: 0.25, throttle: 0.2 }); }
      void k;
    }
    for (const l of this.layers) {
      const ox = -((camX * l.factor) % l.c.width + l.c.width) % l.c.width;
      const y = Math.round(l.yOff - vy * (1 + l.factor * 2) + (VIEW_H - 270));
      for (let x = ox; x < VIEW_W; x += l.c.width) g.drawImage(l.c, Math.round(x), y);
      if (this.train && l === this.layers[1]) this.drawTrain(g, camX, y + l.h - 31);
    }
  },

  /** Mumbai local train crossing the sea link layer. */
  drawTrain(g, camX, y) {
    const x0 = Math.round(this.train.x - (camX * 0.18) % 1400);
    for (let i = 0; i < 6; i++) {
      const x = x0 + i * 46;
      if (x > VIEW_W + 50 || x < -60) continue;
      g.fillStyle = '#1c1a34'; g.fillRect(x, y - 13, 44, 13);
      g.fillStyle = '#7a3a6a'; g.fillRect(x + 1, y - 12, 42, 5);
      g.fillStyle = '#d9c46a'; g.fillRect(x + 1, y - 6, 42, 3);
      for (let wx = x + 4; wx < x + 40; wx += 7) { g.fillStyle = '#ffd98a'; g.fillRect(wx, y - 11, 3, 3); }
    }
  },

  drawWeather(g) {
    const W = this.weatherKind;
    if (W === 'rain') {
      g.strokeStyle = 'rgba(190,210,255,0.45)'; g.lineWidth = 1;
      g.beginPath();
      for (const w of this.weather) { g.moveTo(w.x, w.y); g.lineTo(w.x - w.vx * 0.02, w.y - w.vy * 0.02); }
      g.stroke();
    } else {
      for (const w of this.weather) {
        g.fillStyle = W === 'snow' ? 'rgba(255,255,255,0.9)' : W === 'dust' ? 'rgba(240,200,140,0.5)' : w.c;
        if (W === 'embers') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = clamp(w.life / 3, 0, 1); }
        g.fillRect(Math.round(w.x), Math.round(w.y), w.s, w.s);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    }
  },
};
