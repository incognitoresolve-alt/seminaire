import { api, esc, uuid } from './api.js';
import { bmi } from './shared/triage.js';
import { validateSurvey } from './shared/validate.js';

const form = document.getElementById('survey');
const btn = form.querySelector('[type=submit]');
const DONE_KEY = 'sem-survey-done';
let requestId = uuid();

// Repères affichés après envoi (adultes) — à ajuster par l'équipe médicale.
const ANSWERS = [
  ['IMC normal', '18,5 à 24,9 kg/m² (surpoids 25–29,9 ; obésité ≥ 30).'],
  ['Périmètre abdominal', 'Femmes : moins de 80 cm (risque élevé ≥ 88 cm). Hommes : moins de 94 cm (risque élevé ≥ 102 cm).'],
  ['Activité physique', 'Au moins 150 à 300 minutes d’activité modérée par semaine (OMS), + renforcement musculaire 2 fois/semaine.'],
  ['Glycémie à jeun', '0,70 à 1,00 g/L (70–100 mg/dL). Diabète si ≥ 1,26 g/L à deux reprises.'],
  ['Cholestérol', 'Faites-le doser lors d’une prise de sang ; votre médecin interprète selon votre risque global.'],
  ['Tétanos', 'Rappel tous les 10 ans chez l’adulte.'],
  ['Écrans', 'Limitez le temps d’écran de loisir (idéalement moins de 2 h/jour) et coupez les écrans 1 h avant le coucher.'],
];

const val = (n) => form.elements[n].value;
const updateBmi = () => {
  const b = bmi(val('weight').replace(',', '.'), val('height').replace(',', '.'));
  document.getElementById('bmi').textContent = b == null ? '–' : `${String(b).replace('.', ',')} kg/m²`;
};
form.addEventListener('input', (e) => (e.target.name === 'weight' || e.target.name === 'height') && updateBmi());

function showThanks() {
  form.hidden = true;
  document.getElementById('thanks').hidden = false;
  document.getElementById('answers').innerHTML = ANSWERS.map(([t, d]) => `<li><strong class="text-slate-900">${esc(t)} :</strong> ${esc(d)}</li>`).join('');
  scrollTo({ top: 0 });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btn.disabled) return;
  const fd = new FormData(form);
  const payload = Object.fromEntries([...fd].filter(([, v]) => v !== ''));
  payload.request_id = requestId;
  const { ok, errors } = validateSurvey(payload);
  for (const el of form.querySelectorAll('[data-err]')) el.textContent = errors[el.dataset.err] || '';
  const err = form.querySelector('[data-form-error]');
  err.textContent = '';
  if (!ok) {
    form.querySelector('[data-err]:not(:empty)')?.previousElementSibling?.focus();
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Envoi…';
  try {
    await api('/survey', { method: 'POST', body: payload });
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    showThanks();
  } catch (e2) {
    err.textContent = e2.status === 429 ? 'Trop de demandes, réessayez dans une minute.' : 'Envoi impossible, réessayez (aucun doublon ne sera créé).';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Envoyer mes réponses';
  }
});

try {
  if (localStorage.getItem(DONE_KEY)) showThanks();
} catch {
  /* ignore */
}
