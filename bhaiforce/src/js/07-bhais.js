/* =============================================================================
 * THE BHAIS — ten playable heroes. Each has a look (fed to the sprite
 * painter), a primary weapon, a limited special, voice lines and stats.
 * ========================================================================== */

/** Distance from the hand to the weapon's tip, per weapon sprite. */
const WEAPON_LEN = { revolver: 6, rifle: 10, shotgun: 9, lmg: 12, rocket: 9, chappal: 2, kettle: 6, bat: 3, paper: 4, phone: 2, vinyl: 4, nailgun: 8, gada: 6, lathi: 8, bomb: 3, none: 0 };

/** Spawn a projectile from the player's weapon tip. */
function shootFrom(p, o) {
  const m = p.muzzle();
  const ang = (o.angle || 0) + (o.spread ? rand(-o.spread, o.spread) : 0);
  const sp = o.speed || 400;
  const pr = new Projectile(Object.assign({ x: m.x, y: m.y, vx: Math.cos(ang) * sp * p.facing, vy: Math.sin(ang) * sp, owner: 'player', src: p }, o));
  Game.addProj(pr);
  return pr;
}

function gunFeel(p, { sound, big = false, recoil = 25, shake = 1, shell = true }) {
  const m = p.muzzle();
  fxMuzzle(m.x, m.y, p.facing, big);
  if (shell) fxShell(p.cx, m.y, p.facing);
  SND.play(sound, { throttle: 0.02 });
  if (p.onGround) p.vx -= p.facing * recoil;
  Game.shake(shake);
}

const BHAIS = [
  {
    id: 'mooch', name: 'Inspector Mooch', hindi: 'इंस्पेक्टर मूँछ', role: 'Encounter Specialist', color: '#e8b04a',
    look: { skin: '#b97a4a', hair: '#1a1210', hairStyle: 'policecap', hat: '#b8975a', mooch: 'handlebar', glasses: 'aviator', shirt: '#b8975a', pants: '#8f744a', shoes: '#1a120c', outfit: 'uniform', weapon: 'revolver' },
    weapon: { name: 'Service Revolver', rate: 0.21, desc: 'Heavy rounds that punch through two goons.' },
    special: { name: 'Hero Slow-Mo', desc: 'Time crawls for everyone except the moustache. Fires twice as fast.' },
    quote: 'Mooch nahi, toh kuch nahi.', speed: 1, voice: { pitch: 0.75, rate: 1 },
    lines: {
      intro: L('Inspector Mooch reporting! Mooch nahi, toh kuch nahi!', 'इंस्पेक्टर मूँछ हाज़िर! मूँछ नहीं, तो कुछ नहीं!'),
      special: L('Slow motion mein dekho!', 'स्लो मोशन में देखो!'),
      kill: ['Case closed.', 'Encounter ho gaya!', 'FIR cancel.'],
    },
    fire(p) {
      shootFrom(p, { speed: 580, dmg: 3, pierce: 1, tileDmg: 2, life: 0.6, kind: 'bullet', spread: 0.02 });
      gunFeel(p, { sound: 'revolver', big: true, recoil: 30, shake: 1.5 });
    },
    specialUse(p) { Game.startSlowmo(5.5); },
  },
  {
    id: 'mummy', name: 'Mummy Ji', hindi: 'मम्मी जी', role: 'Chappal Commander', color: '#ff4f7b',
    look: { skin: '#c68a5a', hair: '#1a1214', hairStyle: 'bun', gajra: true, bindi: true, shirt: '#8a1f3d', shirt2: '#ff4f7b', trim: '#ffcc33', sleeve: '#8a1f3d', pants: '#ff4f7b', shoes: '#9b4f22', outfit: 'saree', weapon: 'chappal' },
    weapon: { name: 'Homing Chappal', rate: 0.26, desc: 'A chappal that always comes back. Hits on the way out and on the way home.' },
    special: { name: 'Chappal Barrage', desc: 'Eight golden chappals hunt down every goon in sight.' },
    quote: 'Ruk, abhi batati hoon!', speed: 1.02, voice: { pitch: 1.45, rate: 1.12 },
    lines: {
      intro: L('Mummy Ji aa gayi! Ab sabki khair nahi!', 'मम्मी जी आ गई! अब सबकी ख़ैर नहीं!'),
      special: L('Ruk! Abhi batati hoon!', 'रुक! अभी बताती हूँ!'),
      kill: ['Aur maaru?', 'Padhai karo, goondagiri nahi!', 'Ghar chalo!'],
    },
    fire(p) {
      if (p.chappalsOut >= 2) return false;
      p.chappalsOut++;
      shootFrom(p, { speed: 320, dmg: 2.2, pierce: 99, tileDmg: 0.6, life: 3, kind: 'chappal', boomerang: true, outTime: 0.36, spin: 26 * p.facing });
      p.throwPose();
      SND.play('throw');
    },
    specialUse(p) {
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i - 3.5) * 0.32;
        Game.addProj(new Projectile({ x: p.cx, y: p.y + 4, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, owner: 'player', src: p, kind: 'chappal', gold: true, dmg: 5, pierce: 1, homing: 7, life: 2.6, ghost: true, spin: 30, tileDmg: 0 }));
      }
      p.throwPose();
      fxConfetti(p.cx, p.y, 20);
    },
  },
  {
    id: 'auto', name: 'Auto Anna', hindi: 'ऑटो अन्ना', role: 'Rickshaw Rider', color: '#ffd23f',
    look: { skin: '#8a5a36', hair: '#141010', hairStyle: 'short', mooch: 'big', shirt: '#c2a165', sleeve: '#c2a165', lower: 'lungi', lowerColor: '#3a6fd0', pants: '#7a5a3a', shoes: '#2a1a10', outfit: 'shirt', weapon: 'shotgun' },
    weapon: { name: 'Meter-Down Shotgun', rate: 0.55, desc: 'Close-range pellet storm. Chews through walls.' },
    special: { name: 'Auto Ram', desc: 'A self-driving auto-rickshaw tears through terrain and goons, then explodes.' },
    quote: 'Meter down, bhai!', speed: 1, voice: { pitch: 0.85, rate: 1.1 },
    lines: {
      intro: L('Auto Anna aa gaya! Meter down, bhai!', 'ऑटो अन्ना आ गया! मीटर डाउन, भाई!'),
      special: L('Side do! Side do!', 'साइड दो! साइड दो!'),
      kill: ['Extra pachaas lagenge!', 'Meter se chalega!', 'Wapas nahi jaata!'],
    },
    fire(p) {
      for (let i = 0; i < 6; i++) shootFrom(p, { speed: rand(380, 470), dmg: 1.4, tileDmg: 1.1, life: 0.24, kind: 'pellet', spread: 0.17 });
      gunFeel(p, { sound: 'shotgun', big: true, recoil: 70, shake: 2.6 });
    },
    specialUse(p) { Game.addObj(new AutoRam(p.cx, p.bottom, p.facing)); },
  },
  {
    id: 'chai', name: 'Kadak Chai Bhai', hindi: 'कड़क चाय भाई', role: 'Tapri Tactician', color: '#c98a3a',
    look: { skin: '#a8703f', hair: '#1a1210', hairStyle: 'side', mooch: 'thin', shirt: '#efeee6', sleeve: null, towel: true, pants: '#4a4f5a', shoes: '#3a2414', outfit: 'vest', weapon: 'kettle' },
    weapon: { name: 'Scalding Chai Stream', rate: 0.045, desc: 'Short-range boiling chai. Goons panic and burn.' },
    special: { name: 'Kettle Bomb', desc: 'Lob a kettle that bursts into a lake of burning chai.' },
    quote: 'Chai peeyoge?', speed: 1, voice: { pitch: 1.05, rate: 1.1 },
    lines: {
      intro: L('Garma garam Chai Bhai haazir!', 'गरमा गरम चाय भाई हाज़िर!'),
      special: L('Kadak kettle aa rahi hai!', 'कड़क केतली आ रही है!'),
      kill: ['Ek cutting aur?', 'Chai thandi ho gayi!', 'Biscuit dubaoge?'],
    },
    fire(p) {
      shootFrom(p, { speed: 250 + Math.abs(p.vx) * 0.5, dmg: 0.45, tileDmg: 0.22, life: 0.36, kind: 'chai', spread: 0.14, grav: 0.32, ignite: true, r: 4 });
      SND.play('pour', { throttle: 0.1 });
    },
    specialUse(p) {
      Game.addProj(new Projectile({ x: p.cx, y: p.y + 4, vx: 210 * p.facing + p.vx * 0.5, vy: -250, grav: 1, owner: 'player', src: p, kind: 'kettle', explode: 50, power: 8, dmg: 10, fire: true, spin: 10, life: 3, tileDmg: 0 }));
      p.throwPose();
    },
  },
  {
    id: 'sixer', name: 'Sixer Bhai', hindi: 'सिक्सर भाई', role: 'Gully Cricket Legend', color: '#3fa0ff',
    look: { skin: '#a0663e', hair: '#141010', hairStyle: 'cap', hat: '#1f4fa8', beard: 'stubble', shirt: '#2a62c9', trim: '#ff8c1a', pants: '#2a62c9', shoes: '#f0f0f0', outfit: 'jersey', weapon: 'bat' },
    weapon: { name: 'Cover Drive', rate: 0.28, desc: 'Cricket balls that ricochet off walls three times.' },
    special: { name: 'Helicopter Shot', desc: 'Spin into a whirlwind: untouchable, reflects bullets, then sprays balls everywhere.' },
    quote: 'Howzzat!', speed: 1.04, voice: { pitch: 1, rate: 1.15 },
    lines: {
      intro: L('Sixer Bhai crease pe!', 'सिक्सर भाई क्रीज़ पे!'),
      special: L('Helicopter shot!', 'हेलीकॉप्टर शॉट!'),
      kill: ['Howzzat!', 'Clean bowled!', 'Out of the park!'],
    },
    fire(p) {
      shootFrom(p, { speed: 440, dmg: 2, tileDmg: 1.2, life: 1.4, kind: 'ball', bounce: 3, bounceDamp: 0.88, grav: 0.12, angle: -0.06 });
      p.armOverride = 'swing'; p.armT = 0.12;
      SND.play('swing', { throttle: 0.02 }); SND.play('pop', { throttle: 0.02 });
    },
    specialUse(p) {
      p.activeSpecial = {
        t: 0, dur: 1.7, invulnerable: true,
        update(pl, dt) {
          this.t += dt;
          pl.vy = Math.min(pl.vy, -40);
          Game.reflectNear(pl.cx, pl.cy, 36, pl);
          for (const e of Game.enemies) if (e.alive && dist(e.cx, e.cy, pl.cx, pl.cy) < 34) e.hurt(6, { x: pl.cx, y: pl.cy, vx: sign(e.cx - pl.cx) * 300, vy: -260, kind: 'bat', owner: 'player' });
          if (Game.boss && Game.boss.alive) Game.boss.hurtArea(pl.cx, pl.cy, 34, 9 * dt, 'player');
          if (Math.random() < 0.3) Game.world.explode(pl.cx, pl.cy, 22, 1.2);
          if (Math.floor(this.t * 12) !== Math.floor((this.t - dt) * 12)) SND.play('swing', { throttle: 0 });
          return this.t < this.dur;
        },
        end(pl) {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU;
            Game.addProj(new Projectile({ x: pl.cx, y: pl.cy, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, owner: 'player', src: pl, kind: 'ball', dmg: 2.5, bounce: 2, life: 1.2, tileDmg: 1 }));
          }
        },
        draw(pl, g, camX, camY) {
          const x = pl.cx - camX, y = pl.cy - camY, a = this.t * 28;
          g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
          g.beginPath(); g.arc(x, y, 18, a, a + 2.4); g.stroke();
          g.fillStyle = '#e8cf94';
          g.save(); g.translate(x, y); g.rotate(a);
          g.fillStyle = '#1a0e08'; g.fillRect(4, -2, 18, 5); g.fillStyle = '#e8cf94'; g.fillRect(5, -1, 16, 3);
          g.restore();
        },
      };
    },
  },
  {
    id: 'sharma', name: 'Sharma Ji Ka Beta', hindi: 'शर्मा जी का बेटा', role: 'Topper. Obviously.', color: '#7fe3ff',
    look: { skin: '#c99064', hair: '#1a1214', hairStyle: 'side', glasses: 'specs', shirt: '#f4f4f0', trim: '#c41e3a', pants: '#1f2f5a', shoes: '#111111', outfit: 'school', weapon: 'paper' },
    weapon: { name: 'Paper Plane Darts', rate: 0.24, desc: 'Homing paper planes folded from perfect answer sheets.' },
    special: { name: 'Topper\'s Report Card', desc: '100/100 marks. Every goon on screen breaks down crying.' },
    quote: 'Mere 100 mein se 100 aaye hain.', speed: 1.08, voice: { pitch: 1.35, rate: 1.15 },
    lines: {
      intro: L('Sharma ji ka beta. Sau mein se sau.', 'शर्मा जी का बेटा। सौ में से सौ।'),
      special: L('Mere sau mein se sau aaye hain!', 'मेरे सौ में से सौ आए हैं!'),
      kill: ['Ye toh syllabus mein tha.', 'Topper hoon main.', 'Revision kar lo.'],
    },
    fire(p) {
      shootFrom(p, { speed: 300, dmg: 2, tileDmg: 0.6, life: 1.7, kind: 'plane', homing: 3.4, angle: -0.08 });
      p.throwPose();
      SND.play('throw', { throttle: 0.02 });
    },
    specialUse(p) {
      let n = 0;
      for (const e of Game.enemies) {
        if (!e.alive || Math.abs(e.cx - p.cx) > VIEW_W * 0.7 || Math.abs(e.cy - p.cy) > VIEW_H * 0.8) continue;
        e.hurt(1, { x: p.cx, y: p.cy, vx: 0, vy: -40, kind: 'shame', owner: 'player' });
        if (e.alive) e.stun(5, 'cry');
        n++;
      }
      if (Game.boss && Game.boss.alive) Game.boss.hurtArea(Game.boss.cx, Game.boss.cy, 999, 12, 'player');
      FX.ring(p.cx, p.cy, 260, '#7fe3ff', 0.7, 6);
      FX.ring(p.cx, p.cy, 180, '#ffffff', 0.55, 3);
      Game.popText(p.cx, p.y - 26, '100/100', '#ff3d5a', 2.2);
      Game.popText(p.cx, p.y - 6, 'EMOTIONAL DAMAGE!', '#ffffff', 1.4);
      SND.play('cry');
      Game.flash(0.4, '#ffffff');
      return n;
    },
  },
  {
    id: 'uncle', name: 'WhatsApp Uncle', hindi: 'व्हाट्सऐप अंकल', role: 'Forward Operator', color: '#25d366',
    look: { skin: '#c28a5e', hair: '#e6e2da', hairStyle: 'combover', mooch: 'thin', glasses: 'specs', shirt: '#9cc4e4', shirt2: '#7a2f2f', trim: '#e8c46a', pants: '#5a5047', shoes: '#2a1d17', outfit: 'sweater', weapon: 'phone' },
    weapon: { name: 'Good Morning Roses', rate: 0.36, desc: 'Floating glitter roses that pass through every goon in a line.' },
    special: { name: 'Fake News Forward', desc: 'One viral forward and every goon on screen turns on his own gang.' },
    quote: 'Forwarded as received.', speed: 0.94, voice: { pitch: 0.7, rate: 0.95 },
    lines: {
      intro: L('Good morning ji! WhatsApp Uncle online hai!', 'गुड मॉर्निंग जी! व्हाट्सऐप अंकल ऑनलाइन है!'),
      special: L('Forwarded as received!', 'फॉरवर्डेड ऐज़ रिसीव्ड!'),
      kill: ['Isko 10 logon ko bhejo.', 'Ye sach hai, maine padha tha!', 'Jai ho!'],
    },
    fire(p) {
      const pr = shootFrom(p, { speed: 190, dmg: 2.2, pierce: 99, tileDmg: 0.8, life: 2.2, kind: 'rose', r: 5 });
      pr.baseVy = 0;
      pr.onUpdate = (q) => { q.vy = Math.sin(q.t * 9) * 45; };
      SND.play('notify', { throttle: 0.05 });
    },
    specialUse(p) {
      for (const e of Game.enemies) {
        if (!e.alive || Math.abs(e.cx - p.cx) > VIEW_W * 0.7 || Math.abs(e.cy - p.cy) > VIEW_H * 0.8) continue;
        e.confuse(8);
      }
      for (let i = 0; i < 3; i++) setTimeout(() => SND.play('notify', { throttle: 0 }), i * 140);
      Game.popText(p.cx, p.y - 18, 'FORWARDED MANY TIMES', '#25d366', 1.3);
    },
  },
  {
    id: 'disco', name: 'Disco Dada', hindi: 'डिस्को दादा', role: 'Dance Floor Destroyer', color: '#c86bff',
    look: { skin: '#b07850', hair: '#120c10', hairStyle: 'afro', mooch: 'big', glasses: 'shades', shirt: '#7b2bd1', chain: true, pants: '#f2f2f2', shoes: '#f2f2f2', outfit: 'disco', weapon: 'vinyl' },
    weapon: { name: 'Vinyl Discs', rate: 0.3, desc: 'Spinning records that slice through goons and soft walls.' },
    special: { name: 'Disco Ball', desc: 'A mirror ball rises and lasers every goon nearby for six seconds.' },
    quote: 'Disco shuru!', speed: 1.02, voice: { pitch: 1.1, rate: 1.2 },
    lines: {
      intro: L('Disco Dada floor pe aa gaya!', 'डिस्को दादा फ़्लोर पे आ गया!'),
      special: L('Disco shuru!', 'डिस्को शुरू!'),
      kill: ['Naacho!', 'Ek do teen!', 'Floor pe gir gaya!'],
    },
    fire(p) {
      shootFrom(p, { speed: 360, dmg: 2, pierce: 3, tileDmg: 2.2, life: 1, kind: 'vinyl', spin: 30 });
      p.throwPose();
      SND.play('throw', { throttle: 0.02 });
    },
    specialUse(p) { Game.addObj(new DiscoBall(p.cx, p.y - 40, p)); SND.play('disco'); },
  },
  {
    id: 'jugaad', name: 'Jugaad Bhai', hindi: 'जुगाड़ भाई', role: 'Garage Genius', color: '#ff8a1f',
    look: { skin: '#9a6440', hair: '#1a1210', hairStyle: 'hardhat', hat: '#ffc21a', glasses: 'goggles', beard: 'stubble', shirt: '#d94a2a', shirt2: '#3a5a8a', sleeve: '#d94a2a', pants: '#3a5a8a', shoes: '#3a2414', outfit: 'overalls', weapon: 'nailgun' },
    weapon: { name: 'Nail Gun', rate: 0.075, desc: 'Fast and furious. Pins goons to walls.' },
    special: { name: 'Patakha Salvo', desc: 'Six Diwali sky-rockets home in on goons and burst in Holi colours.' },
    quote: 'Jugaad se sab hota hai.', speed: 1, voice: { pitch: 0.95, rate: 1.15 },
    lines: {
      intro: L('Jugaad Bhai haazir! Sab ho jayega!', 'जुगाड़ भाई हाज़िर! सब हो जाएगा!'),
      special: L('Patakhe chalu!', 'पटाखे चालू!'),
      kill: ['Jugaad lag gaya!', 'Made in garage!', 'Warranty khatam.'],
    },
    fire(p) {
      shootFrom(p, { speed: 520, dmg: 0.85, tileDmg: 0.6, life: 0.55, kind: 'nail', spread: 0.06 });
      gunFeel(p, { sound: 'nail', recoil: 6, shake: 0.4, shell: false });
    },
    specialUse(p) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.28;
        Game.addProj(new Projectile({ x: p.cx, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, owner: 'player', src: p, kind: 'firework', color: pick(HOLI), homing: 4.5, explode: 28, power: 5, dmg: 7, holi: true, life: 2.2, tileDmg: 0 }));
      }
      SND.play('firework');
    },
  },
  {
    id: 'pehelwan', name: 'Pehelwan Pappu', hindi: 'पहलवान पप्पू', role: 'Akhaada Champion', color: '#ff3d3d',
    look: { skin: '#b5784a', hair: '#141010', hairStyle: 'shaved', mooch: 'handlebar', shirt: '#b5784a', sleeve: null, legs: 'skin', lower: 'langot', lowerColor: '#c41e3a', shoes: '#b5784a', outfit: 'shirtless', weapon: 'gada', big: false },
    weapon: { name: 'Golden Gada', rate: 0.42, desc: 'Mace smash: flattens goons, smashes walls, swats bullets.' },
    special: { name: 'Dhobi Pachhad', desc: 'Leap into the sky and body-slam the ground. Huge shockwave.' },
    quote: 'Dangal karega?', speed: 0.94, voice: { pitch: 0.55, rate: 0.95 },
    lines: {
      intro: L('Pehelwan Pappu! Dangal karega?', 'पहलवान पप्पू! दंगल करेगा?'),
      special: L('Dhobi pachhad!', 'धोबी पछाड़!'),
      kill: ['Akhaade mein aa!', 'Doodh piya hai maine!', 'Chit!'],
    },
    fire(p) {
      p.armOverride = 'swing'; p.armT = 0.16;
      const reach = 30, box = { x: p.facing > 0 ? p.cx : p.cx - reach, y: p.y - 6, w: reach, h: p.h + 8 };
      let hit = Game.meleeHit(p, box, 5, 360, 'gada');
      const tx = Math.floor((p.cx + p.facing * 20) / TILE);
      for (const ty of [Math.floor((p.y + 4) / TILE), Math.floor((p.y + 14) / TILE)]) if (Game.world.damage(tx, ty, 3.2, 'explosion')) hit = true;
      SND.play('swing', { throttle: 0.02 });
      if (hit) { SND.play('stomp', { throttle: 0.05 }); Game.shake(2.5); }
    },
    specialUse(p) {
      p.vy = -430;
      p.activeSpecial = {
        t: 0, invulnerable: true, phase: 0,
        update(pl, dt) {
          this.t += dt;
          if (this.phase === 0 && pl.vy > -40) { this.phase = 1; pl.vy = 560; }
          if (this.phase === 1 && pl.onGround) {
            const x = pl.cx, y = pl.bottom;
            Game.world.explode(x, y + 4, 40, 6);
            for (const e of Game.enemies) if (e.alive && dist(e.cx, e.cy, x, y) < 90) e.hurt(9, { x, y, vx: sign(e.cx - x) * 260, vy: -380, kind: 'slam', owner: 'player' });
            if (Game.boss && Game.boss.alive) Game.boss.hurtArea(x, y, 90, 18, 'player');
            for (const o of Game.objects) if (o.onExplosion && dist(o.cx, o.cy, x, y) < 80) o.onExplosion(x, y, 'player');
            FX.ring(x, y, 90, '#ffe7a8', 0.45, 5);
            fxDust(x, y, 18);
            fxDebris(x, y, Game.world.atlas.debris[T.DIRT], 14);
            SND.play('stomp', { throttle: 0 }); SND.play('boom', { throttle: 0 });
            Game.shake(10); vibrate(80);
            Game.popText(x, y - 30, 'DHOBI PACHHAD!', '#ffdd55', 1.6);
            return false;
          }
          return this.t < 2.5;
        },
        draw(pl, g, camX, camY) {
          if (this.phase === 1) {
            g.fillStyle = 'rgba(255,230,160,0.35)';
            g.fillRect(Math.round(pl.x - camX), Math.round(pl.y - camY) - 14, pl.w, 14);
          }
        },
      };
    },
  },
];
const BHAI_BY_ID = Object.fromEntries(BHAIS.map(b => [b.id, b]));
BHAIS.forEach(b => { b.look.id = 'bhai_' + b.id; });

/* ----------------------------------------------- special-move entities ---- */
/** Auto Anna's driverless auto-rickshaw: bulldozes everything in a straight line. */
class AutoRam extends Entity {
  constructor(x, bottom, dir) {
    super(x - 14, bottom - 20, 28, 20);
    this.dir = dir; this.life = 2.6; this.honk = 0;
    SND.play('horn');
  }
  update(dt, world) {
    this.t += dt;
    this.vx = this.dir * Math.min(280, 80 + this.t * 600);
    // carve a tunnel the auto's height
    const fx = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
    for (let y = this.y + 2; y < this.bottom - 1; y += 6) {
      const tx = Math.floor(fx / TILE), ty = Math.floor(y / TILE);
      if (world.get(tx, ty) !== T.ROCK) world.damage(tx, ty, 40, 'explosion');
    }
    this.physics(dt, world);
    for (const e of Game.enemies) if (e.alive && overlaps(this, e)) e.hurt(12, { x: this.cx, y: this.cy, vx: this.dir * 420, vy: -300, kind: 'auto', owner: 'player' });
    if (Game.boss && Game.boss.alive) for (const hb of Game.boss.hitboxes()) if (overlaps(this, hb)) { this.t = this.life; Game.boss.hurtArea(this.cx, this.cy, 30, 14, 'player'); }
    for (const o of Game.objects) if (o.onExplosion && o !== this && !o.remove && overlaps(this, o)) o.onExplosion(this.cx, this.cy, 'player');
    if (Math.random() < 0.5) fxSmoke(this.dir > 0 ? this.x : this.x + this.w, this.bottom - 4, 1, 2);
    if (this.t > this.life || (this.hitX && world.get(Math.floor(fx / TILE), Math.floor(this.cy / TILE)) === T.ROCK)) {
      this.remove = true;
      explode(this.cx, this.cy, 46, { dmg: 10, power: 8, owner: 'player' });
    }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    g.save(); g.translate(x + 14, y); g.scale(this.dir, 1); g.translate(-14, 0);
    drawAutoRickshaw(g, 0, 0, this.t);
    g.restore();
  }
}

/** Side view of a Mumbai-style black-and-yellow auto, 28×20, facing right. */
function drawAutoRickshaw(g, x, y, t) {
  const O = '#140c0c';
  g.fillStyle = O; g.fillRect(x + 1, y + 1, 26, 15); g.fillRect(x, y + 8, 28, 8);
  g.fillStyle = '#ffd23f'; g.fillRect(x + 2, y + 2, 22, 5); g.fillStyle = '#ffe680'; g.fillRect(x + 2, y + 2, 22, 1);
  g.fillStyle = '#1d1d22'; g.fillRect(x + 2, y + 8, 25, 7);
  g.fillStyle = '#2f9e44'; g.fillRect(x + 2, y + 13, 25, 2);
  g.fillStyle = '#7fd1ff'; g.fillRect(x + 20, y + 7, 5, 4);
  g.fillStyle = '#ffd23f'; g.fillRect(x + 25, y + 9, 2, 2);
  g.fillStyle = '#ffeaa0'; g.fillRect(x + 27, y + 10, 1, 2);
  g.fillStyle = '#fff'; g.fillRect(x + 6, y + 9, 2, 1); g.fillRect(x + 10, y + 9, 1, 1);
  const k = Math.floor(t * 20) % 2;
  for (const wx of [x + 4, x + 21]) {
    g.fillStyle = O; g.fillRect(wx - 1, y + 14, 6, 6);
    g.fillStyle = '#3a3a40'; g.fillRect(wx, y + 15, 4, 4);
    g.fillStyle = '#9aa0a6'; g.fillRect(wx + 1 + k, y + 16, 1, 2);
  }
}

/** Disco Dada's mirror ball: hovers and fires rainbow lasers at goons. */
class DiscoBall {
  constructor(x, y, owner) { Object.assign(this, { x, y, owner, t: 0, life: 6, fireT: 0, beams: [], remove: false }); this.ty = y; }
  get cx() { return this.x; }
  get cy() { return this.y; }
  update(dt) {
    this.t += dt;
    if (this.owner && this.owner.alive) { this.x = lerp(this.x, this.owner.cx, dt * 2); this.ty = this.owner.y - 46; }
    this.y = lerp(this.y, this.ty + Math.sin(this.t * 3) * 3, dt * 4);
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = 0.2;
      const tgt = Game.nearestEnemy(this.x, this.y, 240);
      const bossHb = !tgt && Game.boss && Game.boss.alive ? Game.boss.hitboxes()[0] : null;
      const target = tgt || bossHb;
      if (target) {
        const tx = target.cx !== undefined ? target.cx : target.x + target.w / 2, ty = target.cy !== undefined ? target.cy : target.y + target.h / 2;
        if (!Game.world.raycast(this.x, this.y, tx, ty)) {
          const color = pick(HOLI);
          this.beams.push({ x: tx, y: ty, color, t: 0 });
          if (tgt) tgt.hurt(2.2, { x: this.x, y: this.y, vx: sign(tx - this.x) * 60, vy: -80, kind: 'laser', owner: 'player' });
          else Game.boss.hurtArea(tx, ty, 10, 2, 'player');
          fxSparks(tx, ty, 4, color, 90);
          SND.play('laser', { x: tx, y: ty, throttle: 0.05 });
        }
      }
    }
    this.beams = this.beams.filter(b => (b.t += dt) < 0.1);
    FX.light(this.x, this.y, 90, 0.05, pick(HOLI), 0.7);
    if (this.t > this.life) { this.remove = true; fxSparks(this.x, this.y, 20, '#ffffff', 160); }
  }
  draw(g, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y - 30); g.stroke();
    for (const b of this.beams) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = b.color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(b.x - camX, b.y - camY); g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = '#1a1a22'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
    g.fillStyle = '#c9d2e0'; g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill();
    for (let i = 0; i < 10; i++) {
      const a = this.t * 4 + i * 0.63;
      g.fillStyle = i % 2 ? '#ffffff' : '#8fa3c4';
      g.fillRect(x + Math.round(Math.cos(a) * 4) - 1, y + Math.round(Math.sin(i * 1.3) * 4) - 1, 2, 2);
    }
    // light spots sweeping the screen
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = this.t * 1.5 + i;
      g.fillStyle = rgba(HOLI[i % HOLI.length], 0.12);
      g.beginPath(); g.arc(x + Math.cos(a) * 120, y + 60 + Math.sin(a * 1.3) * 50, 14, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
}
