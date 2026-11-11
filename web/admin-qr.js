// Onglet « QR codes » de /admin : tous les QR codes de l'événement (lien, image PNG, affiche A4).
// Adresse : celle du site public ouvert, sinon le site officiel (jamais localhost).
import { esc } from './api.js';
import { qrSvg } from './qr.js';
import { PARTNER } from './shared/partner.js';
import { OFFICIAL_SITE, isPublic } from './shared/site.js';

const $ = (id) => document.getElementById(id);
const ORIGIN = location.protocol === 'https:' && isPublic(location.hostname) ? location.origin : OFFICIAL_SITE;

export const QR_CODES = [
  { key: 'inscription', title: 'Inscription sans attente', desc: 'Pour les participants : ils s’inscrivent eux-mêmes et évitent la file.', path: '/', poster: '/affiche' },
  ...(PARTNER.enabled
    ? [{
        key: 'checkup', title: 'Check-up assurance-vie gratuit', ad: true,
        desc: `Demande d’un check-up complet et gratuit de la couverture assurance-vie (${PARTNER.person}, ${PARTNER.status.toLowerCase()}, FSMA n° ${PARTNER.fsma}).`,
        path: '/checkup', poster: '/affiche?cible=checkup',
      }]
    : []),
  { key: 'remarques', title: 'Remarques des intervenants', desc: 'Pour les soignants, médecins, intervenants et bénévoles : remarques et propositions.', path: '/remarques', poster: '/affiche?cible=remarques' },
];

async function downloadPng(url, name) {
  const svg = qrSvg(url).replace('<svg ', '<svg width="1024" height="1024" ');
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, 1024, 1024);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function initQr({ toast }) {
  $('q-list').innerHTML = QR_CODES.map((q) => {
    const url = ORIGIN + q.path;
    return `<li class="glass-soft flex flex-wrap items-start gap-4 rounded-2xl p-4" data-qr="${q.key}">
      <div class="w-36 shrink-0 rounded-xl bg-white p-1 ring-1 ring-slate-200">${qrSvg(url, { label: `QR code : ${q.title}` })}</div>
      <div class="min-w-0 flex-1 basis-56">
        <p class="font-extrabold">${q.ad ? '<span class="mr-1 rounded bg-slate-200 px-1.5 py-0.5 text-xs font-bold tracking-wider text-slate-700 uppercase">Publicité</span>' : ''}${esc(q.title)}</p>
        <p class="mt-1 text-sm text-slate-600">${esc(q.desc)}</p>
        <p class="mt-2 font-mono text-xs break-all text-sky-900">${esc(url)}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" data-copy class="btn-primary min-h-10 px-3 py-2 text-sm">Copier le lien</button>
          <button type="button" data-png class="btn-ghost min-h-10 px-3 py-2 text-sm">Télécharger l’image (PNG)</button>
          <a href="${esc(q.poster)}" target="_blank" rel="noopener" class="btn-ghost min-h-10 px-3 py-2 text-sm">Affiche A4</a>
        </div>
      </div>
    </li>`;
  }).join('');

  $('q-list').addEventListener('click', async (e) => {
    const li = e.target.closest('[data-qr]');
    if (!li) return;
    const q = QR_CODES.find((x) => x.key === li.dataset.qr);
    const url = ORIGIN + q.path;
    if (e.target.closest('[data-copy]')) {
      try {
        await navigator.clipboard.writeText(url);
        toast('Lien copié ✓');
      } catch {
        toast(url);
      }
    }
    if (e.target.closest('[data-png]')) {
      try {
        await downloadPng(url, `qr-${q.key}-checksante.png`);
        toast('Image téléchargée ✓');
      } catch {
        toast('Téléchargement impossible', 'error');
      }
    }
  });
}
