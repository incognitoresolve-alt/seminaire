// Formulaire d'identité partagé (auto-inscription & saisie manuelle staff).
import { toIsoDate, validateIdentity } from './shared/validate.js';
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
    ${f('birth_date', 'Date de naissance <span class="font-normal text-slate-500">(JJ/MM/AAAA)</span>', 'required inputmode="numeric" maxlength="10" placeholder="JJ/MM/AAAA" autocomplete="bday" enterkeyhint="next"')}
    ${f('email', 'E-mail', 'type="email" required maxlength="254" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="next"')}
    ${f('phone', 'Téléphone <span class="font-normal text-slate-500">(facultatif)</span>', 'type="tel" maxlength="25" autocomplete="tel" inputmode="tel" enterkeyhint="next"')}
    <div class="absolute -left-[9999px]" aria-hidden="true">
      <label for="${prefix}-website">Ne pas remplir</label>
      <input id="${prefix}-website" name="website" tabindex="-1" autocomplete="off">
    </div>

    <fieldset class="mt-2 rounded-xl border border-slate-300 bg-white p-4">
      <legend class="px-1 text-sm font-bold text-slate-800">Accord pour la consultation de prévention</legend>
      <details class="mb-3 text-sm text-slate-600">
        <summary class="cursor-pointer font-semibold text-sky-800">Lire les explications</summary>
        <p class="mt-2">Consultation bénévole et gratuite auprès d’un professionnel de santé. Elle vise à faire le point sur votre santé, à recevoir des conseils et, si nécessaire, à être orienté(e) vers un suivi médical. Elle ne remplace pas votre suivi habituel. Vous pouvez refuser ou interrompre la consultation à tout moment.</p>
      </details>
      <label class="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="consent" required class="mt-1 size-6 shrink-0 accent-sky-700" aria-describedby="${prefix}-consent-err">
        <span class="text-sm leading-snug text-slate-800">${
          staff
            ? 'Le participant accepte librement la consultation et le recueil de ses informations de santé (formulaire papier signé ou accord explicite).'
            : 'J’accepte librement de bénéficier de cette consultation et que les informations de santé nécessaires soient recueillies par le professionnel qui me reçoit (<a class="font-semibold text-sky-800 underline" href="/confidentialite" target="_blank" rel="noopener">confidentialité</a>).'
        }</span>
      </label>
      <p class="err" id="${prefix}-consent-err" aria-live="polite"></p>
    </fieldset>

    <fieldset class="mt-2 rounded-xl border border-slate-300 bg-white p-4" aria-describedby="${prefix}-doctor_consent-err">
      <legend class="px-1 text-sm font-bold text-slate-800">Transmission à un médecin</legend>
      <p class="mb-3 text-sm text-slate-600">${
        staff
          ? 'Le participant autorise-t-il la transmission de ses données personnelles à un médecin qui pourra suivre son dossier si nécessaire ?'
          : 'J’autorise la transmission de mes données personnelles à un médecin qui pourra suivre mon dossier si nécessaire.'
      }</p>
      <div class="grid grid-cols-2 gap-2">
        <label class="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 has-checked:border-sky-700 has-checked:bg-sky-50">
          <input type="radio" name="doctor_consent" value="1" class="size-5 accent-sky-700"> <span class="text-sm font-semibold">J’autorise</span>
        </label>
        <label class="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-3 has-checked:border-sky-700 has-checked:bg-sky-50">
          <input type="radio" name="doctor_consent" value="0" class="size-5 accent-sky-700"> <span class="text-sm font-semibold">Je n’autorise pas</span>
        </label>
      </div>
      <p class="err" id="${prefix}-doctor_consent-err" aria-live="polite"></p>
    </fieldset>${
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
    for (const name of ['last_name', 'first_name', 'birth_date', 'email', 'phone', 'consent']) {
      const input = form.elements[name];
      const msg = errors[name] || '';
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const el = document.getElementById(input.getAttribute('aria-describedby'));
      if (el) el.textContent = msg;
    }
    form.querySelector('[id$="-doctor_consent-err"]').textContent = errors.doctor_consent || '';
    for (const r of form.querySelectorAll('[name=doctor_consent]')) r.setAttribute('aria-invalid', errors.doctor_consent ? 'true' : 'false');
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'doctor_consent') form.querySelector('[id$="-doctor_consent-err"]').textContent = '';
    if (e.target.name === 'consent' && e.target.checked) form.querySelector('[id$="-consent-err"]').textContent = '';
  });

  // Date : clavier numérique, « / » insérés automatiquement (bien plus rapide que le sélecteur iOS).
  form.addEventListener('input', (e) => {
    if (e.target.name !== 'birth_date' || e.inputType?.startsWith('delete')) return;
    const iso = e.target.value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/); // remplissage auto au format ISO
    if (iso) return void (e.target.value = `${iso[3]}/${iso[2]}/${iso[1]}`);
    if (/[^\d/ .-]/.test(e.target.value)) return; // saisie inattendue : laissée telle quelle (validée à l'envoi)
    // Séparateurs tapés par la personne (« 3/3/1958 », « 3.3.1958 ») : on les respecte.
    if (/^\d{1,2}[/. -]\d{0,2}([/. -]\d{0,4})?$/.test(e.target.value)) return;
    const d = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });

  // À la sortie du champ : date affichée proprement (3/3/1958 → 03/03/1958).
  form.addEventListener('focusout', (e) => {
    if (e.target.name !== 'birth_date') return;
    const iso = toIsoDate(e.target.value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) e.target.value = iso.split('-').reverse().join('/');
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
      birth_date: toIsoDate(fd.get('birth_date')),
      email: fd.get('email'),
      phone: fd.get('phone') || undefined,
      consent: fd.get('consent') === 'on',
      doctor_consent: fd.get('doctor_consent') === '1' ? true : fd.get('doctor_consent') === '0' ? false : undefined,
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
