// Bundles src/ into self-contained HTML builds — no dependencies, just Node.
//   dist/index.html          standalone page (deploy anywhere, or just open the file)
//   .artifact/bhaiforce.html same game without <html>/<head>/<body>, for claude.ai artifacts
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, 'src');
const dist = join(root, 'dist');
const read = p => readFileSync(join(src, p), 'utf8');

const jsFiles = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort();
const js = jsFiles.map(f => `/* ---- ${f} ---- */\n${read(join('js', f))}`).join('\n');
const script = `(() => {\n${js}\n})();`;
if (/<\/script/i.test(script)) throw new Error('A JS source contains "</script" which would end the inline script early.');

const head = read('head.html').trim();
const css = read('style.css');
const body = read('body.html').trim();

const pwa = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" href="icon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="icon.svg">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Bhaiforce">',
].join('\n');

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${head}
${pwa}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${script}
</script>
</body>
</html>
`;

const artifact = `${head}
<style>
${css}
</style>
${body}
<script>
${script}
</script>
`;

mkdirSync(dist, { recursive: true });
mkdirSync(join(root, '.artifact'), { recursive: true });
writeFileSync(join(dist, 'index.html'), standalone);
writeFileSync(join(root, '.artifact', 'bhaiforce.html'), artifact);
for (const f of readdirSync(join(root, 'public'))) copyFileSync(join(root, 'public', f), join(dist, f));

const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log(`Built ${jsFiles.length} modules → dist/index.html (${kb(standalone.length)}), .artifact/bhaiforce.html (${kb(artifact.length)})`);
