// Rendu image par image de docs/video/source/video.html → MP4 (1920×1080, 30 i/s, 30 s).
// Usage : node scripts/render_video.mjs [dossier_images] [--frames=0,90,300] (aperçu)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const out = process.argv[2] || 'frames';
const only = process.argv.find((a) => a.startsWith('--frames='))?.slice(9).split(',').map(Number);
mkdirSync(out, { recursive: true });
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(new URL('../docs/video/source/video.html', import.meta.url).pathname).href);
await p.evaluate(() => document.fonts.ready);
const FPS = 30, N = 30 * FPS;
for (const i of only ?? Array.from({ length: N }, (_, k) => k)) {
  await p.evaluate((t) => window.render(t), i / FPS);
  await p.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (!only && i % 150 === 0) console.log(`image ${i}/${N}`);
}
await br.close();
