// Formulaire d'identité partagé (auto-inscription & saisie manuelle staff).
import { validateIdentity } from './shared/validate.js';
import { esc, uuid } from './api.js';
import { PARTNER } from './shared/partner.js';

export function identityFieldsHtml(prefix, { staff = false } = {}) {
  const f = (name, label, attrs) => `
    <div>
      <label class="label" for="${prefix}-${name}">${label}</label>
      <input class="field" id="${prefix}-${name}" name="${name}" ${attrs} aria-describedby="${prefix}-${name}-err">
      <p class="err" id="${prefix}-${name}-err" aria-live="polite"></p>
    </div>`;
  return `
    <div class="grid gap-1 sm:grid-cols-2 sm:gap-x-4">
      ${f('last_name', 'Nom', 'required maxlength="80" autocomplete="family-name" autocapitalize="characters" enterkeyhint="next"')}
      ${f('first_name', 'Prénom', 'required maxlength="80" autocomplete="given-name" autocapitalize="words" enterkeyhint="next"')}
    </div>
    ${f('email', 'E-mail', 'type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="next"')}
    ${f('phone', 'Téléphone <span class="font-normal text-slate-500">(facultatif)</span>', 'type="tel" maxlength="25" autocomplete="tel" inputmode="tel" enterkeyhint="next"')}
    <div class="absolute -left-[9999px]" aria-hidden="true">
      <label for="${prefix}-website">Ne pas remplir</label>
      <input id="${prefix}-website" name="website" tabindex="-1" autocomplete="off">
    </div>

    <label class="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white p-4">
      <input type="checkbox" name="consent" required class="mt-1 size-6 shrink-0 accent-sky-700" aria-describedby="${prefix}-consent-err">
      <span class="text-sm leading-snug text-slate-800">${
        staff
          ? 'Le participant accepte que ses données soient collectées et traitées pour être transmises à un médecin qui pourra le suivre si besoin (accord oral ou formulaire signé).'
          : 'J’accepte que mes données soient collectées et traitées pour être transmises à un médecin qui pourra me suivre si besoin (<a class="font-semibold text-sky-800 underline" href="/confidentialite" target="_blank" rel="noopener">confidentialité</a>).'
      }</span>
    </label>
    <p class="err" id="${prefix}-consent-err" aria-live="polite"></p>${
      !staff && PARTNER.enabled
        ? `
    <label data-checkup class="mt-3 flex cursor-pointer items-start gap-2 px-1">
      <input type="checkbox" name="checkup" class="mt-0.5 size-4 shrink-0 accent-slate-600">
      <span class="text-xs leading-snug text-slate-500"><span class="font-semibold">Publicité —</span> Oui, je souhaite aussi un check-up gratuit et sans engagement de ma couverture assurance-vie et j’accepte que mes nom, e-mail et téléphone (jamais mes données de santé) soient transmis à cette fin à ${esc(PARTNER.person)}, ${esc(PARTNER.status.charAt(0).toLowerCase() + PARTNER.status.slice(1))} pour ${esc(PARTNER.principal)} (FSMA n° ${esc(PARTNER.fsma)}), retrait à tout moment via ${esc(PARTNER.email)}.</span>
    </label>`
        : ''
    }`;
}

/**
 * @param {HTMLFormElement} form
 * @param {(payload:object)=>Promise<void>} send  doit lever {status, data} en cas d'échec
 */
export function bindIdentityForm(form, send) {
  const btn = form.querySelector('[type=submit]');
  const btnHtml = btn.innerHTML;
  const formErr = form.querySelector('[data-form-error]');
  let requestId = uuid(); // conservé tant que la soumission n'a pas abouti : idempotence serveur

  const showErrors = (errors) => {
    for (const name of ['last_name', 'first_name', 'email', 'phone', 'consent']) {
      const input = form.elements[name];
      const msg = errors[name] || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const el = document.getElementById(input.getAttribute('aria-describedby'));
      if (el) el.textContent = msg;
    }
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'consent' && e.target.checked) form.querySelector('[id$="-consent-err"]').textContent = '';
  });


  // Enter = champ suivant (saisie au pouce).
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.type === 'submit' || e.target.type === 'checkbox') return;
    const fields = [...form.querySelectorAll('input:not([tabindex="-1"]):not([type=radio]):not([type=checkbox])')].filter((i) => i.offsetParent);
    const next = fields[fields.indexOf(e.target) + 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return; // anti double-clic
    const fd = new FormData(form);
    const payload = {
      last_name: fd.get('last_name'),
      first_name: fd.get('first_name'),
      email: fd.get('email'),
      phone: fd.get('phone') || undefined,
      consent: fd.get('consent') === 'on',
      doctor_consent: fd.get('consent') === 'on', // un seul accord : collecte + transmission à un médecin
      checkup: fd.get('checkup') === 'on', // opt-in partenaire, retiré avant l'appel /register
      website: fd.get('website') || undefined,
      request_id: requestId,
    };
    const { ok, errors } = validateIdentity(payload);
    showErrors(errors);
    if (formErr) formErr.textContent = '';
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      form.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Validation…';
    try {
      await send(payload);
      requestId = uuid();
      form.reset();
      showErrors({});
    } catch (err) {
      if (err.status === 422 && err.data?.errors) showErrors(err.data.errors);
      else if (formErr) {
        formErr.textContent =
          err.status === 429 ? 'Trop de demandes, réessayez dans une minute.' : err.status === 0 ? 'Connexion instable : réessayez (aucun doublon ne sera créé).' : 'Une erreur est survenue, réessayez.';
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = btnHtml;
    }
  });
}

export const passCardHtml = (pass, qr) => `
  <div class="mx-auto w-full max-w-sm rounded-3xl border-4 border-sky-700 bg-white p-5 text-center shadow-xl">
    <p class="text-xs font-bold tracking-[.2em] text-sky-800 uppercase">Pass Patient</p>
    <p class="mt-1 text-2xl font-extrabold">${esc(pass.first_name)} ${esc(pass.last_name)}</p>
    <div class="mx-auto my-4 w-64 max-w-full">${qr}</div>
    <p class="text-sm text-slate-600">Code de secours</p>
    <p class="font-mono text-3xl font-black tracking-[.3em]">${esc(pass.short_code)}</p>
  </div>`;
