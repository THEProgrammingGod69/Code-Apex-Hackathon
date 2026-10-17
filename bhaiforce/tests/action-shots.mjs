// Captures mid-combat frames (explosions, Holi bursts, specials, bosses) for visual review.
//   node tests/action-shots.mjs <outDir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'tests', 'action'));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && /bhaiforce/.test(m.text())) errs.push(m.text()); });
await page.goto(pathToFileURL(join(root, 'dist', 'index.html')).href);
await page.waitForTimeout(400);
const shot = n => page.screenshot({ path: join(out, n + '.png') });

const scenes = [
  ['mummy', 0], ['auto', 0], ['chai', 1], ['sixer', 1], ['sharma', 2], ['uncle', 2], ['disco', 2], ['jugaad', 3], ['pehelwan', 3], ['mooch', 0],
];
for (const [id, lv] of scenes) {
  await page.evaluate(({ id, lv }) => {
    const { UI, Game } = window.__bf;
    UI.launch(lv, id);
  }, { id, lv });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const { Game } = window.__bf;
    const p = Game.player; p.inv = 99;
    // gather a crowd of goons in front of the bhai
    const kinds = ['goonda', 'lathi', 'patakha', 'goonda', 'rocket', 'bouncer'];
    let i = 0;
    for (const e of Game.enemies) { if (i >= kinds.length) break; if (Math.abs(e.cx - p.cx) < 2000) { e.x = p.x + 60 + i * 26; e.y = p.y - 30; e.state = 'alert'; e.react = 0.3; i++; } }
  });
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyL');
  await page.waitForTimeout(450);
  await shot(`special-${id}`);
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(700);
  await shot(`after-${id}`);
}
// boss mid-fight frames
for (let lv = 0; lv < 4; lv++) {
  await page.evaluate(lv => { window.__bf.UI.launch(lv, 'mooch'); }, lv);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const G = window.__bf.Game, A = G.arena, p = G.player; p.x = A.trigger + 20; p.y = A.floorY - 40; p.inv = 99; });
  await page.waitForTimeout(1300);
  await shot(`boss-intro-${lv + 1}`);
  await page.waitForTimeout(3500);
  await shot(`boss-fight-${lv + 1}`);
  await page.evaluate(() => { const B = window.__bf.Game.boss; if (B) { B.hp = B.maxHp * 0.4; B.phase = 2; if (B.onPhase2) B.onPhase2(); } });
  await page.waitForTimeout(2500);
  await shot(`boss-phase2-${lv + 1}`);
}
await browser.close();
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
