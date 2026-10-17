// End-to-end smoke test: boots the built game in headless Chromium, walks the
// menus, plays every mission (all ten bhais fire and use specials), fights
// each boss to extraction, and fails on any page/console error.
//   node build.mjs && node tests/smoke.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'tests', 'shots'));
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(root, 'dist', 'index.html')).href;

const errors = [];
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function run(name, contextOpts, fn) {
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(`[${name}] console: ${m.text()}`); });
  await page.goto(url);
  await page.waitForTimeout(600);
  await fn(page);
  await ctx.close();
}

const shot = (page, n) => page.screenshot({ path: join(out, `${n}.png`) });
const wait = (page, ms) => page.waitForTimeout(ms);
const state = page => page.evaluate(() => {
  const G = window.__bf.Game, p = G.player;
  return { state: G.state, lives: G.lives, kills: G.kills, score: G.score, x: p && Math.round(p.x), y: p && Math.round(p.y), alive: p && p.alive, boss: G.boss && { hp: Math.round(G.boss.hp), state: G.boss.state }, enemies: G.enemies.length };
});

// ---------------------------------------------------------------- phone
await run('phone', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, async page => {
  await shot(page, '01-title-phone');
  await page.tap('#btn-start', { force: true });
  await wait(page, 400);
  await shot(page, '02-menu-phone');
  await page.tap('[data-go="missions"]');
  await wait(page, 300);
  await shot(page, '03-missions-phone');
  await page.tap('.mission');
  await wait(page, 300);
  await page.tap('.bhai-tile[data-id="mummy"]');
  await wait(page, 200);
  await shot(page, '04-bhais-phone');
  await page.tap('#btn-pick');
  await wait(page, 1200);
  await shot(page, '05-brief-phone');
  await page.tap('#btn-go');
  await wait(page, 3000);
  await shot(page, '06-game-start-phone');
  // touch controls visible?
  const touchVisible = await page.evaluate(() => !document.querySelector('#touch').hidden);
  if (!touchVisible) errors.push('[phone] touch controls hidden during gameplay');
  // drive with touch: hold stick right + fire
  const cdp = await page.context().newCDPSession(page);
  const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const stick = { x: 120, y: 300, id: 1 }, fire = { x: 844 - 165, y: 390 - 52, id: 2 };
  await touch('touchStart', [stick]);
  await touch('touchMove', [{ ...stick, x: 175 }]);
  await touch('touchStart', [{ ...stick, x: 175 }, fire]);
  await wait(page, 2500);
  await shot(page, '07-game-touch-phone');
  await touch('touchEnd', []);
  const s = await state(page);
  console.log('phone after touch play:', s);
  if (!(s.x > 80)) errors.push(`[phone] player did not move with the touch stick (x=${s.x})`);
});

// -------------------------------------------------------------- desktop
await run('desktop', { viewport: { width: 1280, height: 720 } }, async page => {
  await page.click('#btn-start', { force: true });
  await wait(page, 300);
  await page.evaluate(() => window.__bf.UI.launch(0, 'mooch'));
  await wait(page, 2600);
  const kb = page.keyboard;
  await kb.down('KeyD'); await kb.down('KeyJ');
  for (let i = 0; i < 10; i++) { await kb.press('Space'); await wait(page, 350); }
  await shot(page, '10-desktop-play');
  await kb.up('KeyJ'); await kb.up('KeyD');
  await kb.press('KeyF'); await kb.press('KeyL');
  await wait(page, 600);
  await shot(page, '11-desktop-special');
  console.log('desktop after keyboard play:', await state(page));

  // Every bhai: fire + special on each mission
  for (let lv = 0; lv < 4; lv++) {
    await page.evaluate(i => window.__bf.UI.launch(i, 'mooch'), lv);
    await wait(page, 2400);
    await shot(page, `2${lv}-mission-${lv + 1}`);
    const ids = await page.evaluate(() => window.__bf.BHAIS.map(b => b.id));
    for (const id of ids) {
      await page.evaluate(bid => { const p = window.__bf.Game.player; p.setBhai(bid); p.specials = 3; p.inv = 5; }, id);
      await kb.down('KeyJ'); await wait(page, 260); await kb.up('KeyJ');
      await kb.press('KeyL'); await wait(page, 380);
      await kb.press('KeyF'); await wait(page, 80);
    }
    if (lv === 0) await shot(page, '30-all-specials');
    // walk to the boss: teleport near the arena trigger
    await page.evaluate(() => {
      const G = window.__bf.Game, A = G.arena, p = G.player;
      p.x = A.trigger + 10; p.y = A.floorY - 60; p.vy = 0; p.inv = 3;
      G.cam.x = A.x0;
    });
    await wait(page, 3200);
    await shot(page, `4${lv}-boss-${lv + 1}`);
    // fight a bit with god-mode
    await page.evaluate(() => { window.__bf.Game.player.inv = 60; });
    await kb.down('KeyJ');
    for (let i = 0; i < 6; i++) { await kb.press(i % 2 ? 'KeyA' : 'KeyD'); await kb.press('Space'); await wait(page, 300); }
    await kb.up('KeyJ');
    await shot(page, `5${lv}-boss-fight-${lv + 1}`);
    const bs = await state(page);
    console.log(`mission ${lv + 1} boss:`, bs.boss);
    // finish the boss and ride the extraction chopper
    await page.evaluate(() => { const B = window.__bf.Game.boss; if (B && !B.dying) { B.invuln = false; B.state = B.state === 'intro' ? 'idle' : B.state; B.hurt(99999); } });
    await wait(page, 3600);
    await shot(page, `6${lv}-boss-dead-${lv + 1}`);
    // stand on the rope ladder until the chopper picks the bhai up
    for (let i = 0; i < 40; i++) {
      const done = await page.evaluate(() => {
        const G = window.__bf.Game, h = G.helis.find(x => x.mode === 'extract'), p = G.player;
        if (G.state !== 'playing') return true;
        if (h && p && p.alive) { p.x = h.x - 5; p.y = h.y + 30; p.vy = 0; }
        return false;
      });
      if (done) break;
      await wait(page, 150);
    }
    await wait(page, 3200);
    const st = await page.evaluate(() => ({ state: window.__bf.Game.state, screen: window.__bf.UI.current }));
    console.log(`mission ${lv + 1} end:`, st);
    if (st.state !== 'complete') errors.push(`[desktop] mission ${lv + 1} did not complete (state=${st.state})`);
    await shot(page, `7${lv}-result-${lv + 1}`);
  }

  // death → respawn → game over flow
  await page.evaluate(() => window.__bf.UI.launch(1, 'sixer'));
  await wait(page, 2600);
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => { const p = window.__bf.Game.player; if (p && p.alive) { p.inv = 0; p.die({ x: p.cx - 5 }); } });
    await wait(page, 2400);
  }
  const over = await page.evaluate(() => ({ state: window.__bf.Game.state, screen: window.__bf.UI.current }));
  console.log('after repeated deaths:', over);
  if (over.state !== 'gameover') errors.push(`[desktop] expected gameover, got ${over.state}`);
  await wait(page, 600);
  await shot(page, '80-gameover');
  await page.evaluate(() => window.__bf.UI.showFinale());
  await wait(page, 500);
  await shot(page, '81-victory');
});

await browser.close();
if (errors.length) { console.error('\nFAILURES:\n' + errors.join('\n')); process.exit(1); }
console.log('\nSMOKE TEST PASSED');
