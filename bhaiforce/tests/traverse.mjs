// Level-design check: a simple bot (hold right, shoot, hold jump to climb)
// plays each mission in fast-forward. Pass 1 is invulnerable and must reach
// the boss arena; pass 2 is mortal and reports how far a naive bot survives.
//   node build.mjs && node tests/traverse.mjs
import { chromium } from 'playwright';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(join(root, 'dist', 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && /bhaiforce/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForTimeout(500);

const simulate = (lv, god, bhai) => page.evaluate(({ lv, god, bhai }) => {
  const { Game, UI, Input } = window.__bf;
  UI.launch(lv, bhai);
  const keys = Input.keys, dt = 1 / 60;
  const out = { level: lv + 1, god, worldW: Game.world.pxW, trigger: Game.arena.trigger, maxX: 0, bossAt: null, stuck: [], deaths: 0, kills: 0, rescues: 0, collected: 0, total: Game.totalCollect, state: '' };
  let lastProgressX = 0, stuckT = 0;
  for (let f = 0; f < 60 * 240; f++) {
    const p = Game.player;
    if (god && p) p.inv = 5;
    for (const k in keys) keys[k] = false;
    keys.right = true; keys.fire = true;
    keys.jump = f % 30 < 22;
    if (stuckT > 2.5) { keys.special = f % 40 === 0; keys.melee = f % 20 < 10; keys.down = stuckT > 4 && f % 60 < 20; }
    Input.poll();
    Game.update(dt);
    if (p && p.alive) {
      if (p.x > lastProgressX + 8) { lastProgressX = p.x; stuckT = 0; } else stuckT += dt;
      out.maxX = Math.max(out.maxX, Math.round(p.x));
      if (stuckT > 6 && !out.stuck.some(s => Math.abs(s.x - p.x) < 32)) {
        const W = Game.world, tx = Math.floor((p.cx + 10) / 16), ty = Math.floor(p.bottom / 16);
        const col = []; for (let y = ty - 6; y <= ty; y++) col.push(W.get(tx, y));
        out.stuck.push({ x: Math.round(p.x), y: Math.round(p.y), tile: `${tx},${ty}`, aheadColumn: col.join('') });
      }
      if (stuckT > 14) break;
    }
    if (Game.boss && out.bossAt === null) { out.bossAt = +(f / 60).toFixed(1); if (god) break; }
    if (Game.state !== 'playing') break;
  }
  Object.assign(out, { deaths: Game.deaths, kills: Game.kills, rescues: Game.rescues, collected: Game.collected, state: Game.state, livesLeft: Game.lives });
  return out;
}, { lv, god, bhai });

let fail = false;
for (let lv = 0; lv < 4; lv++) {
  const g = await simulate(lv, true, 'mooch');
  console.log('GOD  ', JSON.stringify(g));
  if (g.bossAt === null) { fail = true; console.error(`  ✗ mission ${lv + 1}: bot never reached the boss arena`); }
  const m = await simulate(lv, false, 'auto');
  console.log('MORTAL', JSON.stringify(m));
}
await browser.close();
if (errors.length) { console.error('Errors:\n' + errors.join('\n')); fail = true; }
if (fail) process.exit(1);
console.log('TRAVERSAL OK');
