// Onglet « Envois » de /admin (clé ADMIN_KEY) : AUCUN envoi automatique.
// L'application prépare l'e-mail (destinataire, objet, message) ; la personne joint le fichier et envoie elle-même.
import { api, esc } from './api.js';
import { validateEmail } from './shared/validate.js';
import { dDay, gpMail, iso, mailto } from './shared/gpmail.js';

const $ = (id) => document.getElementById(id);
const dTime = (ms) => new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// Couleur de la consultation (triage indicatif), comme dans l'espace soignants.
const T_LABEL = { 0: 'À mesurer', 1: 'Vert', 2: 'Orange', 3: 'Rouge' };
const pastille = (t) => {
  const l = T_LABEL[t] ? Number(t) : 0;
  return `<span class="tb${l} inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold" title="Couleur de la consultation"><span class="t${l} size-2.5 rounded-full" aria-hidden="true"></span>${T_LABEL[l]}</span>`;
};

export function initEnvois({ toast, onAuthLost }) {
  let items = [];
  let filter = 'todo';
  const fail = (e, msg) => (e.status === 401 || e.status === 403 ? onAuthLost() : toast(msg, 'error'));

  async function copy(to, { subject, body }) {
    try {
      await navigator.clipboard.writeText(`À : ${to || ''}\nObjet : ${subject}\n\n${body}`);
      toast('Message copié ✓ Collez-le dans votre messagerie');
    } catch {
      toast('Copie impossible sur cet appareil', 'error');
    }
  }

  function render() {
    const sent = items.filter((x) => x.gp_sent_at).length;
    $('e-filter').innerHTML = [['todo', 'À envoyer', items.length - sent], ['sent', 'Envoyées', sent], ['all', 'Toutes', items.length]]
      .map(([k, l, n]) => `<button type="button" class="chip shrink-0" data-f="${k}" aria-pressed="${filter === k}">${l} <span class="font-normal">${n}</span></button>`)
      .join('');
    const q = $('e-q').value.trim().toLowerCase();
    const status = (x) => (x.gp_sent_at ? 'sent' : 'todo');
    const rows = items.filter((x) => (filter === 'all' || status(x) === filter) && (!q || `${x.last_name} ${x.first_name} ${x.gp_name || ''}`.toLowerCase().includes(q)));
    $('e-list').innerHTML = rows
      .map(
        (x) => `<li class="glass-soft relative overflow-hidden rounded-2xl p-4 pl-5" data-id="${esc(x.id)}">
        <span class="t${T_LABEL[x.triage] ? Number(x.triage) : 0} absolute inset-y-0 left-0 w-1.5" aria-hidden="true"></span>
        <div class="absolute top-3 right-3">${pastille(x.triage)}</div>
        <div class="flex flex-wrap items-start gap-2">
          <p class="mr-auto w-full pr-28 font-bold">${esc(x.last_name)} ${esc(x.first_name)} <span class="text-xs font-normal text-slate-500">· né(e) le ${esc(iso(x.birth_date))} · reçu(e) le ${esc(dDay(x.created_at))}</span></p>
          ${x.no_gp ? '<span class="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">Pas de médecin traitant</span>' : ''}
          ${x.gp_sent_at ? `<span class="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900">Envoyée le ${esc(dTime(x.gp_sent_at))}</span>` : '<span class="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">À envoyer</span>'}
        </div>
        ${x.staff_remark ? `<p class="mt-2 rounded-xl bg-sky-50 p-2.5 text-sm whitespace-pre-line text-slate-800 ring-1 ring-sky-200"><b>Remarque du soignant :</b> ${esc(x.staff_remark)}</p>` : ''}
        ${x.no_gp ? '<p class="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200">Pas de médecin traitant déclaré : n’envoyez la fiche qu’au médecin choisi par le participant (voir la remarque du soignant ou demandez-lui).</p>' : ''}
        <p class="mt-1 text-sm text-slate-700">Médecin ${x.no_gp ? 'destinataire' : 'traitant'} : ${x.gp_name ? `<b>${esc(x.gp_name)}</b>` : '<span class="text-slate-500">non renseigné (fiche soignant)</span>'}${x.gp_contact ? ` · ${esc(x.gp_contact)}` : ''}</p>
        <label class="label mt-2" for="ge-${esc(x.id)}">E-mail du cabinet du médecin</label>
        <input id="ge-${esc(x.id)}" data-gp-email type="email" inputmode="email" autocomplete="off" maxlength="254" class="field py-2.5 text-base" placeholder="cabinet@…" value="${esc(x.gp_email || '')}">
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="btn-ghost min-h-10 px-3 py-2 text-sm" href="/fiche?id=${encodeURIComponent(x.id)}" target="_blank" rel="noopener">1. Fiche PDF</a>
          <button type="button" data-mail class="btn-primary min-h-10 gap-1.5 px-3 py-2 text-sm" ${x.gp_email ? '' : 'disabled'} title="Ouvre votre messagerie avec l’e-mail prêt (trame d’appel incluse)"><svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>2. Envoyer</button>
          <button type="button" data-copy class="btn-ghost min-h-10 px-3 py-2 text-sm">Copier le message</button>
          ${x.gp_sent_at ? '<button type="button" data-sent="0" class="btn-ghost min-h-10 px-3 py-2 text-sm">Annuler « envoyée »</button>' : '<button type="button" data-sent="1" class="btn-ghost min-h-10 px-3 py-2 text-sm data-[next]:ring-4 data-[next]:ring-amber-300 data-[next]:motion-safe:animate-pulse">3. Marquer comme envoyée</button>'}
        </div>
      </li>`,
      )
      .join('');
    $('e-empty').textContent = rows.length ? '' : items.length ? 'Aucune fiche pour ce filtre' : 'Aucune personne n’a encore autorisé la transmission à son médecin traitant.';
  }

  async function load() {
    try {
      items = (await api('/admin/transmissions')).items;
      render();
    } catch (e) {
      fail(e, 'Chargement des envois impossible');
    }
  }

  async function patch(id, body, okMsg) {
    try {
      const { item } = await api(`/admin/transmissions/${id}`, { method: 'PATCH', body });
      items = items.map((x) => (x.id === id ? item : x));
      render();
      toast(okMsg);
    } catch (e) {
      fail(e, e.status === 422 ? 'E-mail invalide' : e.status === 409 ? 'Accord de transmission retiré entre-temps' : 'Enregistrement impossible');
      if (e.status === 409) load();
    }
  }

  // E-mail du médecin : enregistré sans redessiner la liste (le clic sur « Envoyer » n'est jamais perdu), une requête à la fois.
  const saving = new Map();
  function saveEmail(li) {
    const input = li.querySelector('[data-gp-email]');
    const id = li.dataset.id;
    const v = validateEmail(input.value);
    input.setAttribute('aria-invalid', String(!v.ok));
    if (!v.ok) return (toast('E-mail invalide', 'error'), Promise.resolve(null));
    const pending = saving.get(id);
    if (pending?.value === v.value) return pending.p;
    const x = items.find((i) => i.id === id);
    if (!pending && (x.gp_email || null) === v.value) return Promise.resolve(x);
    const p = api(`/admin/transmissions/${id}`, { method: 'PATCH', body: { gp_email: v.value } })
      .then(({ item }) => {
        items = items.map((i) => (i.id === id ? item : i));
        toast(v.value ? 'E-mail du médecin enregistré ✓' : 'E-mail effacé');
        return item;
      })
      .catch((e) => {
        fail(e, e.status === 422 ? 'E-mail invalide' : e.status === 409 ? 'Accord de transmission retiré entre-temps' : 'Enregistrement impossible');
        if (e.status === 409) load();
        return null;
      })
      .finally(() => saving.get(id)?.p === p && saving.delete(id));
    saving.set(id, { value: v.value, p });
    return p;
  }

  // « Envoyer » actif dès qu'une adresse valide est saisie.
  $('e-list').addEventListener('input', (e) => {
    if (!e.target.matches('[data-gp-email]')) return;
    const v = validateEmail(e.target.value);
    e.target.closest('[data-id]').querySelector('[data-mail]').disabled = !(v.ok && v.value);
    if (v.ok) e.target.setAttribute('aria-invalid', 'false');
  });
  $('e-list').addEventListener('change', (e) => {
    if (e.target.matches('[data-gp-email]')) saveEmail(e.target.closest('[data-id]'));
  });
  $('e-list').addEventListener('click', async (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    if (e.target.closest('[data-mail]')) {
      const x = await saveEmail(li);
      if (!x?.gp_email) return;
      location.href = mailto(x.gp_email, gpMail(x));
      toast('Messagerie ouverte : joignez la fiche PDF, puis envoyez');
      li.querySelector('[data-sent="1"]')?.setAttribute('data-next', '');
      return;
    }
    const x = items.find((i) => i.id === li.dataset.id);
    if (e.target.closest('[data-copy]')) copy(x.gp_email, gpMail(x));
    const s = e.target.closest('[data-sent]');
    if (s) patch(x.id, { sent: s.dataset.sent === '1' }, s.dataset.sent === '1' ? 'Fiche notée comme envoyée ✓' : 'Statut « envoyée » annulé');
  });
  $('e-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) ((filter = b.dataset.f), render());
  });
  $('e-q').addEventListener('input', render);

  return { load };
}
