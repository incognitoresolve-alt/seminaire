import { registerSW } from './sw-register.js';
import { api, uuid } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml, prefillIdentity } from './form.js';
import { mountPartner } from './partner-ui.js';
import { passUrl, qrSvg } from './qr.js';

mountPartner();

const PASSES_KEY = 'sem-passes'; // tous les Pass de l'appareil (famille)
const FAMILY_KEY = 'sem-family'; // nom / e-mail / tél. pour préremplir (session uniquement)
const CHECKUP_KEY = 'sem-checkup';
const form = document.getElementById('reg');
const passEl = document.getElementById('pass');
let contact = null; // coordonnées pour la demande check-up en cours (mémoire uniquement)

const store = {
  get: (k, s = localStorage) => {
    try {
      return JSON.parse(s.getItem(k) || 'null');
    } catch {
      return null;
    }
  },
  set: (k, v, s = localStorage) => {
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, JSON.stringify(v));
    } catch {
      /* navigation privée */
    }
  },
};

// Migration de l'ancien format (un seul Pass)
const legacy = store.get('sem-pass');
if (legacy?.token) {
  store.set(PASSES_KEY, [legacy]);
  store.set('sem-pass', null);
}
const passes = () => store.get(PASSES_KEY) || [];

/* ---------- Check-up couverture (opt-in séparé, facultatif) ---------- */
function renderCheckup(state) {
  if (state) store.set(CHECKUP_KEY, state);
  const s = state || store.get(CHECKUP_KEY);
  document.getElementById('checkup').innerHTML =
    s === 'yes'
      ? '<p class="text-center text-xs text-slate-500">Check-up couverture : c’est noté, vous serez recontacté(e).</p>'
      : s === 'failed' && contact
        ? '<p class="text-center text-xs text-slate-500">La demande de check-up n’a pas pu partir. <button type="button" data-ck-retry class="font-semibold text-sky-800 underline">Réessayer</button></p>'
        : '';
  // Déjà accepté sur cet appareil : on ne repose pas la question aux autres membres de la famille.
  const box = form.querySelector('[data-checkup]');
  if (box) box.hidden = s === 'yes';
}

async function sendCheckup() {
  try {
    await api('/partner/lead', {
      method: 'POST',
      body: {
        audience: 'public',
        name: `${contact.first_name} ${contact.last_name}`.slice(0, 80),
        email: contact.email,
        phone: contact.phone || undefined,
        interests: ['checkup'],
        consent: true,
        request_id: contact.request_id, // idempotent : un réessai ne crée pas de doublon
      },
    });
    contact = null;
    renderCheckup('yes');
  } catch {
    renderCheckup('failed');
  }
}
document.getElementById('checkup').addEventListener('click', (e) => {
  if (e.target.closest('[data-ck-retry]') && contact) {
    e.target.disabled = true;
    sendCheckup();
  }
});

/* ---------- Pass ---------- */
function showPasses() {
  const list = passes();
  if (!list.length) return showForm();
  document.getElementById('pass-card').innerHTML = list
    .map((p) => passCardHtml(p, qrSvg(passUrl(p.token), { label: `QR code du Pass de ${p.first_name}` })))
    .join('');
  document.getElementById('pass-count').textContent = list.length > 1 ? `${list.length} Pass sur cet appareil` : '';
  form.hidden = true;
  passEl.hidden = false;
  renderCheckup();
  scrollTo({ top: 0 });
}

function showForm(prefill) {
  contact = null;
  passEl.hidden = true;
  form.hidden = false;
  form.reset();
  if (prefill) prefillIdentity(form, prefill);
  document.getElementById('back-passes').hidden = !passes().length;
  renderCheckup();
  scrollTo({ top: 0 });
  (prefill ? form.elements.first_name : form.elements.last_name).focus();
}

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { checkup, ...identity } = payload;
  const { pass } = await api('/register', { method: 'POST', body: identity });
  const clean = (v) => (v || '').trim();
  store.set(PASSES_KEY, [pass, ...passes().filter((p) => p.token !== pass.token)].slice(0, 12));
  store.set(FAMILY_KEY, { last_name: clean(identity.last_name), email: clean(identity.email), phone: clean(identity.phone) }, sessionStorage);
  contact = checkup
    ? { first_name: clean(identity.first_name), last_name: clean(identity.last_name), email: clean(identity.email), phone: clean(identity.phone), request_id: uuid() }
    : null;
  showPasses();
  if (contact) sendCheckup();
});

document.getElementById('back-passes').addEventListener('click', showPasses);
document.getElementById('add-family').addEventListener('click', () => showForm(store.get(FAMILY_KEY, sessionStorage)));
document.getElementById('clear-passes').addEventListener('click', () => {
  if (!confirm('Retirer tous les Pass de cet appareil ? (les inscriptions restent valables)')) return;
  for (const k of [PASSES_KEY, CHECKUP_KEY]) store.set(k, null);
  store.set(FAMILY_KEY, null, sessionStorage);
  showForm();
});

if (passes().length) showPasses();
else renderCheckup();

registerSW();
