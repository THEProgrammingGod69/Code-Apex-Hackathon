/* =============================================================================
 * UI — DOM screens: title, menu, mission select, bhai gallery/select,
 * briefing, pause, settings, how-to-play, results, game over and victory.
 * Also fullscreen, the rotate-your-phone prompt, and gamepad menu control.
 * ========================================================================== */

const CHACHA_LOOK = { id: 'chacha', skin: '#b07a50', hair: '#e8e4dc', hairStyle: 'policecap', hat: '#b8975a', mooch: 'big', moochColor: '#f2efe8', glasses: 'specs', shirt: '#b8975a', pants: '#8f744a', outfit: 'uniform', weapon: 'none' };

const UI = {
  current: 'title', returnTo: 'menu', selectedBhai: null, missionIndex: 0, bhaisMode: 'select', padPrev: {},

  init() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      SND.init();
      SND.play('click');
      this.go(b.dataset.go);
    });
    $('#btn-start').addEventListener('click', () => this.start());
    $('#scr-title').addEventListener('pointerdown', e => { if (e.target === $('#scr-title')) this.start(); });
    $('#btn-pause').addEventListener('click', () => this.pause());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-restart').addEventListener('click', () => this.launch(Game.levelIndex, this.selectedBhai));
    $('#btn-quit').addEventListener('click', () => this.quitToMenu());
    $('#btn-go').addEventListener('click', () => this.launch(this.missionIndex, this.selectedBhai));
    $('#btn-random').addEventListener('click', () => { this.selectBhai(null); SND.play('select'); });
    $('#btn-pick').addEventListener('click', () => this.go(this.bhaisMode === 'gallery' ? 'menu' : 'brief'));
    $('#btn-next').addEventListener('click', () => { this.missionIndex = Math.min(Game.levelIndex + 1, LEVELS.length - 1); this.go('brief'); });
    $('#btn-replay').addEventListener('click', () => this.launch(Game.levelIndex, this.selectedBhai));
    $('#btn-retry').addEventListener('click', () => this.launch(Game.levelIndex, this.selectedBhai));
    $('#btn-finale').addEventListener('click', () => this.showFinale());
    $('#btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    $('#btn-rotate-skip').addEventListener('click', () => { this.rotateDismissed = true; this.checkRotate(); });
    this.buildSettings();
    this.buildBhaiGrid();
    addEventListener('keydown', e => this.onKey(e));
    addEventListener('resize', () => this.checkRotate());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (Game.state === 'playing') this.pause(); SND.suspend(); }
      else if (SND.ctx) SND.resume();
    });
    const fsOk = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    $('#btn-fullscreen').hidden = !fsOk;
    this.checkRotate();
  },

  start() {
    if (this.current !== 'title') return;
    SND.init();
    VOICE.init();
    SND.play('select');
    MUSIC.play('title');
    VOICE.say(L('Bhaiforce!', 'भाईफोर्स!'), { pitch: 0.8, force: true });
    this.go('menu');
  },

  /** Show one screen (or none, during gameplay). */
  show(id) {
    for (const s of $$('.screen')) s.hidden = s.id !== 'scr-' + id;
    this.current = id;
    const inGame = !id && (Game.state === 'playing' || Game.state === 'extracting');
    $('#btn-pause').hidden = !inGame;
    TouchUI.setVisible(inGame && this.touchEnabled());
    if (inGame) TouchUI.layout();
    if (id) {
      const first = $(`#scr-${id} .cta:not([disabled])`) || $(`#scr-${id} button:not([disabled])`);
      if (first && Input.lastDevice !== 'touch') setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
  },

  touchEnabled() { return Settings.touch === 'on' || (Settings.touch === 'auto' && (IS_TOUCH || Input.lastDevice === 'touch')); },

  go(where) {
    switch (where) {
      case 'menu': if (Game.state !== 'title' && Game.state !== 'menu') this.leaveGame(); MUSIC.play('title'); this.show('menu'); break;
      case 'missions': this.buildMissions(); this.show('missions'); break;
      case 'gallery': this.bhaisMode = 'gallery'; this.openBhais(); break;
      case 'bhais': this.bhaisMode = 'select'; this.openBhais(); break;
      case 'brief': this.openBrief(); break;
      case 'howto': this.returnTo = this.current === 'pause' ? 'pause' : 'menu'; this.show('howto'); break;
      case 'settings': this.returnTo = this.current === 'pause' ? 'pause' : 'menu'; this.syncSettings(); this.show('settings'); break;
      case 'back': this.show(this.returnTo); break;
    }
  },

  leaveGame() {
    Game.state = 'menu';
    Game.world = null; Game.player = null; Game.enemies = []; Game.projectiles = []; Game.objects = []; Game.boss = null;
    FX.clear();
    BG.setup('mumbai', 'dusk', 'rain');
    VOICE.stop();
  },

  quitToMenu() { this.leaveGame(); MUSIC.play('title'); this.show('menu'); },

  launch(index, bhaiId) {
    SND.init();
    this.missionIndex = index;
    this.show(null);
    Game.startLevel(index, bhaiId || null);
    this.show(null);
    Input.flush();
  },

  onLevelStart() { this.show(null); },
  onBhaiChange() { /* HUD portrait updates itself */ },

  pause() {
    if (Game.state !== 'playing') return;
    Game.state = 'paused';
    VOICE.stop();
    this.show('pause');
  },
  resume() {
    if (Game.state !== 'paused') return;
    Game.state = 'playing';
    this.show(null);
    Input.flush();
  },

  /* --------------------------------------------------------- missions */
  buildMissions() {
    const list = $('#mission-list');
    list.textContent = '';
    LEVELS.forEach((lv, i) => {
      const locked = i + 1 > Progress.unlocked;
      const card = document.createElement('button');
      card.className = 'mission' + (locked ? ' locked' : '');
      card.disabled = locked;
      card.setAttribute('aria-label', `${lv.name}${locked ? ' (locked)' : ''}`);
      const thumb = renderThumb(lv);
      thumb.className = 'thumb';
      const stars = Progress.stars[lv.id] || 0;
      const best = Progress.best[lv.id];
      const meta = document.createElement('div');
      meta.className = 'mission-meta';
      meta.innerHTML = `<span class="num">MISSION ${i + 1}</span><strong>${lv.name}</strong><span class="hi">${lv.hindi}</span><span class="place">${lv.place}</span>
        <span class="stars" aria-label="${stars} of 3 stars">${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span>
        <span class="best">${best ? 'BEST ' + best.toLocaleString('en-IN') : locked ? 'Pichla mission khatam karo' : 'Naya mission'}</span>`;
      card.append(thumb, meta);
      if (locked) { const l = document.createElement('div'); l.className = 'lock'; l.textContent = 'LOCKED'; card.append(l); }
      card.addEventListener('click', () => { SND.play('select'); this.missionIndex = i; this.go('bhais'); });
      list.append(card);
    });
  },

  /* ------------------------------------------------------------ bhais */
  buildBhaiGrid() {
    const grid = $('#bhai-grid');
    grid.textContent = '';
    for (const b of BHAIS) {
      const btn = document.createElement('button');
      btn.className = 'bhai-tile';
      btn.dataset.id = b.id;
      btn.style.setProperty('--c', b.color);
      btn.setAttribute('aria-label', b.name);
      const c = makePortrait(b.look, 4);
      btn.append(c);
      const n = document.createElement('span'); n.textContent = b.name; btn.append(n);
      btn.addEventListener('click', () => { this.selectBhai(b.id); SND.play('click'); VOICE.say(L(b.quote, ''), Object.assign({ force: true }, b.voice)); });
      grid.append(btn);
    }
  },

  openBhais() {
    $('#bhais-title').textContent = this.bhaisMode === 'gallery' ? 'Bhai Gallery' : 'Apna Bhai Chuno';
    $('#btn-pick').textContent = this.bhaisMode === 'gallery' ? 'DONE' : 'CHALO →';
    $('#btn-random').hidden = this.bhaisMode === 'gallery';
    $('#bhais-back').dataset.go = this.bhaisMode === 'gallery' ? 'menu' : 'missions';
    this.selectBhai(this.selectedBhai || (this.bhaisMode === 'gallery' ? BHAIS[0].id : null));
    this.show('bhais');
  },

  selectBhai(id) {
    this.selectedBhai = id;
    for (const t of $$('.bhai-tile')) t.classList.toggle('sel', t.dataset.id === id);
    const d = $('#bhai-detail');
    d.textContent = '';
    if (!id) {
      d.innerHTML = `<div class="random-pick"><div class="q">?</div><h3>Random Bhai</h3><p>Broforce style: a surprise bhai drops in. Rescue caged bhais to switch mid-mission.</p></div>`;
      return;
    }
    const b = BHAI_BY_ID[id];
    d.style.setProperty('--c', b.color);
    const fig = makeFullBody(b.look, 5, 'idle', 'aim');
    fig.className = 'fullbody';
    const info = document.createElement('div');
    info.className = 'bhai-info';
    info.innerHTML = `<span class="eyebrow">${b.role}</span><h3>${b.name}</h3><span class="hi">${b.hindi}</span>
      <dl><dt>WEAPON</dt><dd><b>${b.weapon.name}.</b> ${b.weapon.desc}</dd>
      <dt>SPECIAL ×3</dt><dd><b>${b.special.name}.</b> ${b.special.desc}</dd></dl>
      <q>${b.quote}</q>`;
    d.append(fig, info);
  },

  /* ------------------------------------------------------------ brief */
  openBrief() {
    const lv = LEVELS[this.missionIndex];
    $('#brief-title').textContent = lv.name;
    $('#brief-place').textContent = `${lv.hindi} · ${lv.place}`;
    const pc = $('#brief-portrait'), g = pc.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, pc.width, pc.height);
    g.drawImage(makePortrait(CHACHA_LOOK, 4), 0, 0, pc.width, pc.height);
    const box = $('#brief-text');
    box.textContent = '';
    lv.brief.forEach((line, i) => {
      const p = document.createElement('p');
      p.textContent = line;
      p.style.animationDelay = `${0.15 + i * 0.45}s`;
      box.append(p);
    });
    const b = this.selectedBhai ? BHAI_BY_ID[this.selectedBhai] : null;
    $('#brief-bhai').textContent = b ? `Tumhara bhai: ${b.name}` : 'Tumhara bhai: Random (surprise!)';
    this.show('brief');
    VOICE.say(L(lv.brief[0], ''), { pitch: 0.75, force: true });
  },

  /* --------------------------------------------------------- settings */
  buildSettings() {
    const bind = (id, key, parse = v => v) => {
      const el = $('#' + id);
      el.addEventListener('input', () => {
        Settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
        saveSettings();
        SND.applyVolumes();
        if (key === 'btnScale' || key === 'touch') { TouchUI.layout(); if (this.current === null) TouchUI.setVisible(this.touchEnabled()); }
        if (key === 'sfx') SND.play('click');
      });
    };
    bind('set-music', 'music', parseFloat);
    bind('set-sfx', 'sfx', parseFloat);
    bind('set-voice', 'voice');
    bind('set-vibrate', 'vibrate');
    bind('set-shake', 'shake');
    bind('set-btn', 'btnScale', parseFloat);
    for (const r of $$('input[name="set-touch"]')) r.addEventListener('change', () => { Settings.touch = r.value; saveSettings(); });
    for (const r of $$('input[name="set-diff"]')) r.addEventListener('change', () => { Settings.difficulty = r.value; saveSettings(); });
    const reset = $('#btn-reset');
    reset.addEventListener('click', () => {
      if (reset.dataset.armed) {
        Object.assign(Progress, { unlocked: 1, best: {}, stars: {}, rescued: 0 });
        saveProgress();
        reset.textContent = 'Progress reset';
        delete reset.dataset.armed;
      } else { reset.dataset.armed = '1'; reset.textContent = 'Tap again to confirm reset'; }
    });
  },

  syncSettings() {
    $('#set-music').value = Settings.music; $('#set-sfx').value = Settings.sfx;
    $('#set-voice').checked = Settings.voice; $('#set-vibrate').checked = Settings.vibrate; $('#set-shake').checked = Settings.shake;
    $('#set-btn').value = Settings.btnScale;
    for (const r of $$('input[name="set-touch"]')) r.checked = r.value === Settings.touch;
    for (const r of $$('input[name="set-diff"]')) r.checked = r.value === Settings.difficulty;
    const reset = $('#btn-reset'); delete reset.dataset.armed; reset.textContent = 'Reset progress';
  },

  /* ---------------------------------------------------------- results */
  showResult(r) {
    const mm = Math.floor(r.time / 60), ss = String(Math.floor(r.time % 60)).padStart(2, '0');
    $('#res-title').textContent = 'MISSION SAFAL!';
    $('#res-sub').textContent = `${r.def.name} · ${r.def.place}`;
    $('#res-stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < r.stars ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('');
    const rows = [
      ['Time', `${mm}:${ss}`], ['Goons cleared', r.kills], ['Bhais rescued', r.rescues],
      [r.def.collectible.name, `${r.collected}/${r.total}`], ['Best combo', `${r.bestCombo}×`],
      ['Time bonus', `+${r.timeBonus.toLocaleString('en-IN')}`], ['Bhai bonus', `+${r.lifeBonus.toLocaleString('en-IN')}`],
    ];
    $('#res-stats').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + `<dt class="total">Score</dt><dd class="total">${r.score.toLocaleString('en-IN')}</dd>`;
    $('#btn-next').hidden = r.last;
    $('#btn-finale').hidden = !r.last;
    setTimeout(() => this.show('result'), 900);
  },

  showFinale() { MUSIC.play('title'); this.show('victory'); fxConfetti(VIEW_W / 2, 40, 80); },

  showGameOver(r) {
    $('#over-score').textContent = `Score ${r.score.toLocaleString('en-IN')} · ${r.kills} goons cleared`;
    setTimeout(() => this.show('over'), 1100);
  },

  /* --------------------------------------------------------- platform */
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req && req.call(el, { navigationUI: 'hide' });
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* unsupported */ } }).catch(() => {});
    } catch { /* fullscreen refused */ }
  },

  checkRotate() {
    const portrait = innerHeight > innerWidth * 1.05;
    $('#rotate').hidden = !(portrait && IS_TOUCH && !this.rotateDismissed);
  },

  onKey(e) {
    if (!this.current || this.current === 'title') {
      if (this.current === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.start(); }
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.current === 'pause') this.resume();
      else { const back = $(`#scr-${this.current} .back`); if (back) back.click(); }
      return;
    }
    const dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.code];
    if (dir) { e.preventDefault(); this.moveFocus(dir); }
  },

  moveFocus(dir) {
    const items = $$(`#scr-${this.current} button:not([disabled]):not([hidden]), #scr-${this.current} input`).filter(el => el.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = items[(i + dir + items.length) % items.length];
    next.focus();
    if (next.scrollIntoView) next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },

  /** Gamepad in menus: d-pad moves focus, A clicks, B goes back, Start pauses/resumes. */
  pollPad() {
    const s = Input.pollPad(), prev = this.padPrev;
    this.padPrev = s;
    const pressed = k => s[k] && !prev[k];
    if (this.current === 'title' && (pressed('jump') || pressed('pause'))) { this.start(); return; }
    if (!this.current) return;
    if (pressed('down') || pressed('right')) this.moveFocus(1);
    if (pressed('up') || pressed('left')) this.moveFocus(-1);
    if (pressed('jump') && document.activeElement && document.activeElement.click) document.activeElement.click();
    if (pressed('special')) { if (this.current === 'pause') this.resume(); else { const back = $(`#scr-${this.current} .back`); if (back) back.click(); } }
    if (pressed('pause') && this.current === 'pause') this.resume();
  },
};

/** Mission thumbnail: the mission's sky and parallax layers, scaled down. */
function renderThumb(lv) {
  const c = makeCanvas(240, 120), g = c.getContext('2d');
  const full = makeCanvas(480, 270), f = full.getContext('2d');
  const sky = SKIES[lv.sky];
  const grad = f.createLinearGradient(0, 0, 0, 270);
  sky.forEach((col, i) => grad.addColorStop(i / (sky.length - 1), col));
  f.fillStyle = grad; f.fillRect(0, 0, 480, 270);
  for (const l of BG.buildLayers(lv.theme)) f.drawImage(l.c, -40, l.yOff - 10);
  const th = THEMES[lv.theme];
  f.fillStyle = th.top[0]; f.fillRect(0, 222, 480, 6);
  f.fillStyle = th.dirt[0]; f.fillRect(0, 228, 480, 42);
  const look = BHAIS[(LEVELS.indexOf(lv) * 3) % BHAIS.length].look;
  f.imageSmoothingEnabled = false;
  const spr = humanSprite(look, 'run', 2, 'aim', false, false);
  f.drawImage(spr, 200, 222 - 31 * 2, spr.width * 2, spr.height * 2);
  g.imageSmoothingEnabled = false;
  g.drawImage(full, 0, 0, 480, 270, 0, 0, 240, 135);
  return c;
}
