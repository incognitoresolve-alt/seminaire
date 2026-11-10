import { registerSW } from './sw-register.js';
import { api, uuid } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml } from './form.js';
import { mountPartner } from './partner-ui.js';
import { passUrl, qrSvg } from './qr.js';

mountPartner();

const PASS_KEY = 'sem-pass'; // inscription individuelle : un seul Pass affiché à la fois
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

// Ancien format multi-Pass : on ne garde que le plus récent.
const legacy = store.get('sem-passes');
if (Array.isArray(legacy)) {
  if (legacy[0]?.token) store.set(PASS_KEY, legacy[0]);
  store.set('sem-passes', null);
}

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
function showPass() {
  const pass = store.get(PASS_KEY);
  if (!pass?.token) return showForm();
  document.getElementById('pass-card').innerHTML = passCardHtml(pass, qrSvg(passUrl(pass.token), { label: 'QR code du Pass Patient' }));
  form.hidden = true;
  passEl.hidden = false;
  renderCheckup();
  scrollTo({ top: 0 });
}

/** Nouvelle inscription individuelle : formulaire vierge, aucun préremplissage. */
function showForm() {
  contact = null;
  passEl.hidden = true;
  form.hidden = false;
  form.reset();
  renderCheckup();
  scrollTo({ top: 0 });
  form.elements.last_name.focus();
}

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { checkup, ...identity } = payload;
  const { pass } = await api('/register', { method: 'POST', body: identity });
  const clean = (v) => (v || '').trim();
  store.set(PASS_KEY, pass);
  store.set(CHECKUP_KEY, null);
  contact = checkup
    ? { first_name: clean(identity.first_name), last_name: clean(identity.last_name), email: clean(identity.email), phone: clean(identity.phone), request_id: uuid() }
    : null;
  showPass();
  if (contact) sendCheckup();
});

document.getElementById('new-reg').addEventListener('click', () => {
  if (!confirm('Inscrire une autre personne ? Ce Pass sera retiré de l’écran (pensez à en faire une capture ; l’inscription reste valable).')) return;
  store.set(PASS_KEY, null);
  store.set(CHECKUP_KEY, null);
  showForm();
});

if (store.get(PASS_KEY)?.token) showPass();
else renderCheckup();
