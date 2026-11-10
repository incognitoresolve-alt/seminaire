import { api, esc, uuid } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml } from './form.js';
import { mountPartner } from './partner-ui.js';
import { PARTNER } from './shared/partner.js';
import { passUrl, qrSvg } from './qr.js';

mountPartner();

const KEY = 'sem-pass';
const CHECKUP_KEY = 'sem-checkup';
let contact = null; // coordonnées de l'inscription en cours (mémoire uniquement, jamais stockées)

/*
 * Proposition « check-up couverture » : affichée APRÈS l'inscription (le Pass est déjà obtenu),
 * opt-in explicite par clic, rien de pré-coché, refus sans conséquence.
 * Seuls nom / e-mail / téléphone sont transmis, uniquement si « Oui ». Aucune donnée de santé.
 */
function renderCheckup() {
  const box = document.getElementById('checkup');
  let answered = null;
  try {
    answered = localStorage.getItem(CHECKUP_KEY);
  } catch {
    /* ignore */
  }
  if (!PARTNER.enabled || answered === 'no') return (box.innerHTML = '');
  if (answered === 'yes') {
    box.innerHTML = '<p class="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">C’est noté : vous serez recontacté(e) pour votre check-up gratuit.</p>';
    return;
  }
  const oneClick = !!contact; // sinon (Pass rouvert plus tard) : formulaire partenaire
  box.innerHTML = `
    <aside aria-labelledby="ck-title" class="rounded-2xl border border-slate-200 bg-white p-4 text-left">
      <p class="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Publicité · Offert aux participants</p>
      <h2 id="ck-title" class="mt-1 text-lg font-extrabold">Et votre couverture, elle est à jour ?</h2>
      <p class="mt-1 text-sm text-slate-700">Vous prenez le temps de faire le point sur votre santé. ${esc(PARTNER.person)}, partenaire de l’événement, vous propose de faire aussi le point sur votre <strong>assurance-vie</strong> : épargne-pension, protection de vos proches, assurance obsèques. <strong>Gratuit et sans engagement.</strong></p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        ${oneClick ? '<button type="button" data-ck="yes" class="btn-primary min-h-11 px-3 text-sm">Oui, je veux mon check-up</button>' : '<a href="/partenaire?pour=public" class="btn-primary min-h-11 px-3 text-sm">Oui, je veux mon check-up</a>'}
        <button type="button" data-ck="no" class="btn-ghost min-h-11 px-3 text-sm">Non merci</button>
      </div>
      <p class="mt-3 text-[11px] leading-snug text-slate-500">En cliquant sur « Oui », vous acceptez que vos nom, e-mail${contact?.phone ? ' et téléphone' : ''} soient transmis à ${esc(PARTNER.person)}, ${esc(PARTNER.status.charAt(0).toLowerCase() + PARTNER.status.slice(1))} pour ${esc(PARTNER.principal)} (FSMA n° ${esc(PARTNER.fsma)}), uniquement pour vous recontacter à ce sujet. Aucune donnée de santé n’est transmise. Ce choix n’a aucun effet sur votre consultation. Retrait à tout moment : ${esc(PARTNER.email)}.</p>
      <p data-ck-err class="err text-center" role="alert"></p>
    </aside>`;
}

document.getElementById('checkup').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-ck]');
  if (!b || b.disabled) return;
  const remember = (v) => {
    try {
      localStorage.setItem(CHECKUP_KEY, v);
    } catch {
      /* ignore */
    }
  };
  if (b.dataset.ck === 'no') {
    remember('no');
    contact = null;
    return renderCheckup();
  }
  b.disabled = true;
  b.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
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
        request_id: contact.request_id,
      },
    });
    remember('yes');
    contact = null; // effacé de la mémoire dès l'envoi
    renderCheckup();
  } catch {
    b.disabled = false;
    b.textContent = 'Oui, je veux mon check-up';
    document.querySelector('[data-ck-err]').textContent = 'Envoi impossible, réessayez.';
  }
});
const form = document.getElementById('reg');
const passEl = document.getElementById('pass');

function showPass(pass) {
  document.getElementById('pass-card').innerHTML = passCardHtml(pass, qrSvg(passUrl(pass.token), { label: 'QR code du Pass Patient' }));
  form.hidden = true;
  passEl.hidden = false;
  renderCheckup();
  scrollTo({ top: 0 });
}

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { pass } = await api('/register', { method: 'POST', body: payload });
  contact = { first_name: payload.first_name.trim(), last_name: payload.last_name.trim(), email: payload.email.trim(), phone: payload.phone?.trim(), request_id: uuid() };
  try {
    localStorage.setItem(KEY, JSON.stringify(pass));
  } catch {
    /* navigation privée */
  }
  showPass(pass);
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
