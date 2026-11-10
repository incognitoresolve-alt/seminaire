import { api, esc, uuid } from './api.js';
import { mountCredit, partnerLegal } from './partner-ui.js';
import { LEAD_INTERESTS, PARTNER } from './shared/partner.js';
import { validateLead } from './shared/validate.js';

if (!PARTNER.enabled) location.replace('/');
mountCredit();

const form = document.getElementById('lead');
const btn = form.querySelector('[type=submit]');
let requestId = uuid();
let audience = new URLSearchParams(location.search).get('pour') === 'pro' ? 'pro' : 'public';

const INTRO = {
  public: 'Épargne-pension, épargne à long terme, couverture décès ou obsèques : faisons le point sur votre assurance-vie, gratuitement et sans engagement.',
  pro: 'Médecins, infirmiers, kinés indépendants : PLCI, pension INAMI des conventionnés, couverture décès. Un bilan adapté à votre statut.',
};

function render() {
  document.getElementById('p-intro').textContent = INTRO[audience];
  document.querySelector(`[name=aud][value=${audience}]`).checked = true;
  document.getElementById('interests').innerHTML = Object.entries(LEAD_INTERESTS[audience])
    .map(([k, label]) => `<label class="choice"><input type="checkbox" name="interests" value="${k}"> ${esc(label)}</label>`)
    .join('');
}
document.getElementById('legal').innerHTML = `${partnerLegal()}<br>${[
  esc(PARTNER.person),
  PARTNER.address && esc(PARTNER.address),
  `<a class="underline" href="tel:${esc(PARTNER.phoneHref)}">${esc(PARTNER.phone)}</a>`,
  `<a class="underline" href="mailto:${esc(PARTNER.email)}">${esc(PARTNER.email)}</a>`,
]
  .filter(Boolean)
  .join(' · ')}`;
document.getElementById('consent-text').textContent = `J’accepte d’être recontacté(e) par ${PARTNER.brand} (${PARTNER.status}) au sujet de mes besoins en assurance-vie. Ce choix est indépendant de ma consultation de prévention.`;
for (const r of document.querySelectorAll('[name=aud]')) r.addEventListener('change', (e) => ((audience = e.target.value), render()));
render();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btn.disabled) return;
  const fd = new FormData(form);
  const payload = {
    audience,
    name: fd.get('name'),
    email: fd.get('email') || undefined,
    phone: fd.get('phone') || undefined,
    interests: fd.getAll('interests'),
    message: fd.get('message') || undefined,
    consent: fd.get('consent') === 'on',
    website: fd.get('website') || undefined,
    request_id: requestId,
  };
  const { ok, errors } = validateLead(payload);
  for (const el of form.querySelectorAll('[data-err]')) el.textContent = errors[el.dataset.err] || '';
  const err = form.querySelector('[data-form-error]');
  err.textContent = '';
  if (!ok) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Envoi…';
  try {
    await api('/partner/lead', { method: 'POST', body: payload });
    requestId = uuid();
    form.hidden = true;
    document.getElementById('lead-done').hidden = false;
  } catch (e2) {
    err.textContent = e2.status === 429 ? 'Trop de demandes, réessayez dans une minute.' : 'Envoi impossible, réessayez.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Être recontacté(e)';
  }
});
