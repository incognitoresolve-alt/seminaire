// Build front : 1 fichier JS minifié par page (0 cascade de requêtes) + service worker versionné.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('public/dist/', root);
rmSync(out, { recursive: true, force: true });
mkdirSync(new URL('public/vendor/', root), { recursive: true });
copyFileSync(new URL('node_modules/jsqr/dist/jsQR.js', root), new URL('public/vendor/jsQR.js', root)); // chargé à la demande (iOS)

const entries = ['register', 'questionnaire', 'staff', 'partenaire', 'affiche', 'credit', 'desinscription', 'espace-partenaire'];
const res = await build({
  entryPoints: entries.map((e) => `web/${e}.js`),
  outdir: 'public/dist',
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020', 'safari15'],
  legalComments: 'none',
  metafile: true,
  logLevel: 'warning',
});

const version = `${Date.now().toString(36)}`;
const assets = ['/', '/staff', '/questionnaire', '/app.css', '/logo.svg', '/favicon.svg', ...Object.keys(res.metafile.outputs).map((f) => `/${f.replace(/^public\//, '')}`)];
const sw = readFileSync(new URL('web/sw.template.js', root), 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
writeFileSync(new URL('public/sw.js', root), sw);

const kb = Object.entries(res.metafile.outputs).map(([f, o]) => `${f.split('/').pop()} ${(o.bytes / 1024).toFixed(1)} Ko`);
console.log(`build ${version} :`, kb.join(' · '));
