import { registerSW } from './sw-register.js';
import { api, esc, uuid } from './api.js';
import { bindIdentityForm, identityFieldsHtml } from './form.js';
import { mountPartner } from './partner-ui.js';

mountPartner();

// Inscription à l'accueil : pas de Pass. Après l'enregistrement, le formulaire se vide aussitôt
// pour la personne suivante. Rien n'est conservé sur la tablette (appareil partagé).
const form = document.getElementById('reg');
const done = document.getElementById('done');
let contact = null; // coordonnées pour la demande check-up en cours (mémoire uniquement)
let hideTimer = 0;

// Nettoyage des anciennes versions (Pass stockés sur l'appareil).
try {
  for (const k of ['sem-pass', 'sem-passes', 'sem-checkup']) localStorage.removeItem(k);
} catch {
  /* navigation privée */
}

function showDone(name, checkup) {
  const ck =
    checkup === 'yes'
      ? '<span class="block text-xs font-normal">Check-up couverture : demande transmise.</span>'
      : checkup === 'failed'
        ? '<span class="block text-xs font-normal">La demande de check-up n’a pas pu partir. <button type="button" data-ck-retry class="font-semibold underline">Réessayer</button></span>'
        : checkup === 'pending'
          ? '<span class="block text-xs font-normal">Check-up couverture : envoi…</span>'
          : '';
  done.innerHTML = `<p class="rounded-2xl bg-emerald-50 p-4 text-center font-bold text-emerald-900 ring-1 ring-emerald-200">✓ ${esc(name)} est inscrit(e).${ck}<span class="mt-1 block text-xs font-normal text-emerald-800">Les soignants la retrouvent par son nom dans la liste des inscrits.</span></p>`;
  done.hidden = false;
  clearTimeout(hideTimer);
  if (checkup !== 'failed' && checkup !== 'pending') hideTimer = setTimeout(() => (done.hidden = true), 8000);
}

async function sendCheckup(name) {
  showDone(name, 'pending');
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
    showDone(name, 'yes');
  } catch {
    showDone(name, 'failed');
  }
}
done.addEventListener('click', (e) => {
  if (e.target.closest('[data-ck-retry]') && contact) sendCheckup(`${contact.first_name} ${contact.last_name}`);
});

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { checkup, ...identity } = payload;
  await api('/register', { method: 'POST', body: identity });
  const clean = (v) => (v || '').trim();
  const name = `${clean(identity.first_name)} ${clean(identity.last_name)}`;
  contact = checkup
    ? { first_name: clean(identity.first_name), last_name: clean(identity.last_name), email: clean(identity.email), phone: clean(identity.phone), request_id: uuid() }
    : null;
  if (contact) sendCheckup(name);
  else showDone(name);
  scrollTo({ top: form.offsetTop - 80, behavior: 'smooth' });
  setTimeout(() => form.elements.last_name.focus({ preventScroll: true }), 50); // prêt pour la personne suivante
});

registerSW();
