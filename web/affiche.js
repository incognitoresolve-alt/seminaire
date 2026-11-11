import { qrSvg } from './qr.js';
import { PARTNER } from './shared/partner.js';
import { OFFICIAL_SITE, isPublic, parseSite } from './shared/site.js';


// /affiche → auto-inscription ; ?cible=remarques → remarques des intervenants ; ?cible=checkup → check-up assurance (publicité).
// Le QR code pointe vers le site officiel, ou l'adresse publique saisie (jamais localhost / réseau local).
// Adresse saisie : conservée le temps de la session (bascule entre les affiches), jamais transmise.
const cible = new URLSearchParams(location.search).get('cible');
const VARIANTS = {
  ...(PARTNER.enabled && {
    checkup: {
      path: '/checkup', title: 'Check-up gratuit', subtitle: 'Publicité · votre assurance-vie',
      steps: ['Scannez le QR code', 'Laissez vos coordonnées', `${PARTNER.person} vous recontacte`],
      // Mention légale OBLIGATOIRE d'une publicité d'intermédiaire d'assurances (identité + n° FSMA).
      legal: `Publicité · ${PARTNER.person}, ${PARTNER.status.charAt(0).toLowerCase() + PARTNER.status.slice(1)} pour ${PARTNER.principal} · FSMA n° ${PARTNER.fsma}`,
    },
  }),
  remarques: {
    path: '/remarques', title: 'Vos remarques', subtitle: 'Soignants · intervenants · bénévoles',
    steps: ['Scannez le QR code', 'Écrivez votre remarque ou proposition', 'Elle arrive directement chez l’organisation'],
  },
};
const variant = Object.prototype.hasOwnProperty.call(VARIANTS, cible) ? VARIANTS[cible] : null;
const path = variant?.path ?? '/';
const $ = (id) => document.getElementById(id);
const KEY = 'affiche-site';
const store = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* stockage indisponible */ } },
};

if (variant) {
  $('title').textContent = variant.title;
  $('subtitle').textContent = variant.subtitle;
  variant.steps.forEach((t, i) => (document.querySelector(`[data-step="${i + 1}"]`).textContent = t));
  if (variant.legal) {
    $('legal').textContent = variant.legal;
    $('legal').hidden = false;
  }
}
if (!PARTNER.enabled) document.querySelector('[data-cible="checkup"]')?.remove();
for (const l of document.querySelectorAll('[data-cible]')) if (l.dataset.cible === (variant ? cible : '')) l.setAttribute('aria-current', 'page');

const PLACEHOLDER = '<div class="grid aspect-square place-items-center rounded-[2cqw] border-[0.5cqw] border-dashed border-slate-300 p-[4cqw] text-center text-[2.8cqw] font-bold text-slate-500">Saisissez l’adresse du site au-dessus de l’affiche</div>';

function render() {
  const raw = $('site').value;
  const origin = parseSite(raw);
  const ok = Boolean(origin);
  $('site').setAttribute('aria-invalid', String(Boolean(raw.trim()) && !ok));
  $('print').disabled = !ok;
  if (ok) {
    const url = origin + path;
    $('qr').innerHTML = qrSvg(url, { label: `QR code vers ${url}` });
    $('site-help').textContent = 'Le QR code est prêt. Scannez une feuille imprimée pour vérifier.';
  } else {
    $('qr').innerHTML = PLACEHOLDER;
    $('site-help').textContent = raw.trim()
      ? 'Adresse non valide : saisissez l’adresse en ligne (https), pas une adresse locale.'
      : 'Adresse en ligne : Cloudflare → seminaire-triage → Settings → Domains & Routes.';
  }
}

const here = location.protocol === 'https:' && isPublic(location.hostname) ? location.host : '';
$('site').value = store.get() || here || new URL(OFFICIAL_SITE).host;
$('site').addEventListener('input', () => { store.set(parseSite($('site').value) ? $('site').value.trim() : ''); render(); });
$('print').addEventListener('click', () => { if (parseSite($('site').value)) print(); });
render();
