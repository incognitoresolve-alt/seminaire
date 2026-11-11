import { mountCredit } from './partner-ui.js';
import { qrSvg } from './qr.js';
import { OFFICIAL_SITE, isPublic, parseSite } from './shared/site.js';

mountCredit();

// /affiche → auto-inscription ; /affiche?cible=questionnaire → questionnaire anonyme.
// Le QR code pointe vers le site officiel, ou l'adresse publique saisie (jamais localhost / réseau local).
// Adresse saisie : conservée le temps de la session (bascule entre les deux affiches), jamais transmise.
const survey = new URLSearchParams(location.search).get('cible') === 'questionnaire';
const path = survey ? '/questionnaire' : '/';
const $ = (id) => document.getElementById(id);
const KEY = 'affiche-site';
const store = {
  get() { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* stockage indisponible */ } },
};

if (survey) {
  $('title').textContent = 'Questionnaire santé';
  $('subtitle').textContent = 'Anonyme · 2 minutes';
  document.querySelector('[data-step="2"]').textContent = 'Répondez aux questions';
  document.querySelector('[data-step="3"]').textContent = 'Les bonnes réponses s’affichent à la fin';
  $('switch').textContent = 'Affiche d’inscription';
  $('switch').href = '/affiche';
}

const PLACEHOLDER = '<div class="grid aspect-square place-items-center rounded-[2cqw] border-[0.5cqw] border-dashed border-slate-300 p-[4cqw] text-center text-[2.8cqw] font-bold text-slate-500">Saisissez l’adresse du site au-dessus de l’affiche</div>';

function render() {
  const raw = $('site').value;
  const origin = parseSite(raw);
  const ok = Boolean(origin);
  $('site').setAttribute('aria-invalid', String(Boolean(raw.trim()) && !ok));
  $('print').disabled = !ok;
  $('url-label').hidden = !ok;
  if (ok) {
    const url = origin + path;
    $('qr').innerHTML = qrSvg(url, { label: `QR code vers ${url}` });
    const shown = url.replace(/^https:\/\//, '').replace(/\/$/, '');
    $('url').textContent = shown;
    $('url').className = `font-mono font-extrabold break-all text-sky-900 ${shown.length <= 28 ? 'text-[3.4cqw]' : shown.length <= 48 ? 'text-[2.6cqw]' : 'text-[2.1cqw]'}`;
    $('site-help').textContent = 'Le QR code est prêt. Scannez une feuille imprimée pour vérifier.';
  } else {
    $('qr').innerHTML = PLACEHOLDER;
    $('url').textContent = '';
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
