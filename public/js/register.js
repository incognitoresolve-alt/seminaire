import { api, uuid } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml } from './form.js';
import { mountPartner } from './partner-ui.js';
import { passUrl, qrSvg } from './qr.js';

mountPartner();

const KEY = 'sem-pass';
const CHECKUP_KEY = 'sem-checkup';
let contact = null; // coordonnées de l'inscription en cours (mémoire uniquement, jamais stockées)

/*
 * Check-up couverture : case facultative du formulaire (non pré-cochée, séparée du consentement médical).
 * Cochée => demande de contact envoyée après l'inscription (nom / e-mail / téléphone uniquement).
 * Non cochée => rien n'est transmis et la question n'est pas reposée.
 */
function renderCheckup(state) {
  const box = document.getElementById('checkup');
  let s = state;
  try {
    if (s) localStorage.setItem(CHECKUP_KEY, s);
    else s = localStorage.getItem(CHECKUP_KEY);
  } catch {
    /* ignore */
  }
  box.innerHTML =
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
    contact = null; // effacé de la mémoire dès l'envoi
    renderCheckup('yes');
  } catch {
    renderCheckup('failed');
  }
}
const form = document.getElementById('reg');
const passEl = document.getElementById('pass');

function showPass(pass) {
  document.getElementById('pass-card').innerHTML = passCardHtml(pass, qrSvg(passUrl(pass.token), { label: 'QR code du Pass Patient' }));
  form.hidden = true;
  passEl.hidden = false;
  renderCheckup();
  scrollTo({ top: 0 });
}

document.getElementById('checkup').addEventListener('click', (e) => {
  if (e.target.closest('[data-ck-retry]') && contact) {
    e.target.disabled = true;
    sendCheckup();
  }
});

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { checkup, ...identity } = payload;
  const { pass } = await api('/register', { method: 'POST', body: identity });
  contact = checkup
    ? { first_name: identity.first_name.trim(), last_name: identity.last_name.trim(), email: identity.email.trim(), phone: identity.phone?.trim(), request_id: uuid() }
    : null;
  try {
    localStorage.setItem(KEY, JSON.stringify(pass));
  } catch {
    /* navigation privée */
  }
  showPass(pass);
  if (contact) sendCheckup();
  else renderCheckup('no');
});

document.getElementById('new-reg').addEventListener('click', () => {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(CHECKUP_KEY); // nouvelle personne : nouvelle question
  } catch {
    /* ignore */
  }
  contact = null;
  passEl.hidden = true;
  form.hidden = false;
  form.elements.last_name.focus();
});

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.token) showPass(saved);
} catch {
  /* ignore */
}
