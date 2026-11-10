// Copie les dépendances front figées (package-lock.json) dans public/vendor.
import { copyFileSync, mkdirSync } from 'node:fs';
const out = new URL('../public/vendor/', import.meta.url);
mkdirSync(out, { recursive: true });
const files = [
  ['qrcode-generator/dist/qrcode.mjs', 'qrcode.mjs'],
  ['jsqr/dist/jsQR.js', 'jsQR.js'],
];
for (const [src, dst] of files) {
  copyFileSync(new URL(`../node_modules/${src}`, import.meta.url), new URL(dst, out));
}
console.log('vendor: ok');
