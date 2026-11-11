import { api, esc, uuid } from './api.js';
import { mountCredit } from './partner-ui.js';
import { FEEDBACK_KINDS, FEEDBACK_MAX, FEEDBACK_ROLES, validateFeedback } from './shared/validate.js';

// /remarques : lien partagé aux soignants, médecins, intervenants et bénévoles → page /admin, onglet « Remarques ».
mountCredit();
const $ = (id) => document.getElementById(id);
const form = $('fb');
const btn = form.querySelector('[type=submit]');
const DRAFT = 'remarques-brouillon';
const ROLE = 'remarques-role';
let requestId = uuid();

// Brouillon et rôle gardés sur cet appareil uniquement (confort), jamais envoyés avant validation.
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* stockage indisponible */ } },
};

const chips = (name, items) =>
  Object.entries(items)
    .map(([k, label]) => `<label class="chip inline-flex cursor-pointer items-center has-checked:border-sky-700 has-checked:bg-sky-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-sky-500 has-focus-visible:ring-offset-2"><input type="radio" name="${name}" value="${k}" class="sr-only">${esc(label)}</label>`)
    .join('');
$('roles').innerHTML = chips('role', FEEDBACK_ROLES);
$('kinds').innerHTML = chips('kind', FEEDBACK_KINDS);

const msg = $('f-message');
const count = () => ($('count').textContent = `${msg.value.length} / ${FEEDBACK_MAX}`);
const savedRole = store.get(ROLE);
if (Object.prototype.hasOwnProperty.call(FEEDBACK_ROLES, savedRole)) form.querySelector(`[name=role][value="${savedRole}"]`).checked = true;
msg.value = store.get(DRAFT);
count();
msg.addEventListener('input', () => (store.set(DRAFT, msg.value), count()));
// Erreur effacée dès que le champ concerné est corrigé.
form.addEventListener('input', (e) => {
  const el = form.querySelector(`[data-err="${e.target.name}"]`);
  if (el) el.textContent = '';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btn.disabled) return;
  const payload = Object.fromEntries([...new FormData(form)].filter(([, v]) => v !== ''));
  payload.request_id = requestId;
  const { ok, errors } = validateFeedback(payload);
  for (const el of form.querySelectorAll('[data-err]')) el.textContent = errors[el.dataset.err] || '';
  const err = form.querySelector('[data-form-error]');
  err.textContent = '';
  if (!ok) {
    const first = ['role', 'kind', 'message', 'name', 'contact'].find((k) => errors[k]);
    (form.querySelector(`[name=${first}]`) || btn).focus();
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Envoi…';
  try {
    await api('/feedback', { method: 'POST', body: payload });
    store.set(DRAFT, '');
    store.set(ROLE, payload.role);
    form.hidden = true;
    $('thanks').hidden = false;
    scrollTo({ top: 0 });
  } catch (e2) {
    err.textContent =
      e2.status === 429 ? 'Trop d’envois, réessayez dans une minute.' : e2.status === 422 ? 'Vérifiez les champs du formulaire.' : 'Envoi impossible (réseau ?). Votre texte est gardé : réessayez.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Envoyer à l’organisation';
  }
});

$('again').addEventListener('click', () => {
  requestId = uuid();
  msg.value = '';
  form.elements.name.value = '';
  form.elements.contact.value = '';
  for (const r of form.querySelectorAll('[name=kind]')) r.checked = false;
  count();
  $('thanks').hidden = true;
  form.hidden = false;
  msg.focus();
});
