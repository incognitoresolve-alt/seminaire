// Build front : 1 fichier JS minifié par page (0 cascade de requêtes) + service worker versionné.
import { build } from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = new URL('public/dist/', root);
rmSync(out, { recursive: true, force: true });

const entries = ['register', 'staff', 'partenaire', 'affiche', 'credit', 'desinscription', 'admin', 'remarques', 'remarques-voir', 'fiche'];
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
const assets = ['/', '/staff', '/app.css', '/logo.svg', '/favicon.svg', ...Object.keys(res.metafile.outputs).map((f) => `/${f.replace(/^public\//, '')}`)];
const sw = readFileSync(new URL('web/sw.template.js', root), 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
writeFileSync(new URL('public/sw.js', root), sw);

const kb = Object.entries(res.metafile.outputs).map(([f, o]) => `${f.split('/').pop()} ${(o.bytes / 1024).toFixed(1)} Ko`);
console.log(`build ${version} :`, kb.join(' · '));
