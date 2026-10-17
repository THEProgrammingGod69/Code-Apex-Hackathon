/* =============================================================================
 * BOOT — wire every system together and run the frame loop.
 * ========================================================================== */

function boot() {
  Gfx.init();
  Input.init();
  TouchUI.init();
  VOICE.init();
  UI.init();
  Game.state = 'title';
  BG.setup('mumbai', 'dusk', 'rain');

  let last = performance.now(), errors = 0;
  const frame = now => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      Input.poll();
      UI.pollPad();
      Game.update(dt);
      Game.draw();
    } catch (err) {
      // Keep the loop alive; surface the first few errors for debugging.
      if (errors++ < 5) console.error('[bhaiforce]', err);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => document.body.classList.add('fonts-ready')).catch(() => {});
  const loading = $('#loading');
  if (loading) loading.remove();

  // Debug/test handle (harmless in production).
  window.__bf = { Game, UI, LEVELS, BHAIS, Settings, Progress, SND, MUSIC, Input };
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
