// Onglet « Envois » de /admin (clé ADMIN_KEY) : AUCUN envoi automatique.
// L'application prépare l'e-mail (destinataire, objet, message) ; la personne joint le fichier et envoie elle-même.
import { api, esc } from './api.js';
import { validateEmail } from './shared/validate.js';

const $ = (id) => document.getElementById(id);
const TZ = { timeZone: 'Europe/Brussels' };
const dDay = (ms) => new Date(ms).toLocaleDateString('fr-BE', { ...TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const dTime = (ms) => new Date(ms).toLocaleString('fr-BE', { ...TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const iso = (s) => (s ? s.split('-').reverse().join('/') : '');
const mailto = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

function gpMail(x) {
  return {
    subject: `Fiche de transmission – ${x.last_name} ${x.first_name} (né(e) le ${iso(x.birth_date)})`,
    body: `Bonjour ${x.gp_name || 'Docteur'},

Votre patient(e) ${x.first_name} ${x.last_name}, né(e) le ${iso(x.birth_date)}, a été reçu(e) au pôle santé du séminaire spécial d’Impact Centre Chrétien Liège le ${dDay(x.created_at)} et a autorisé la transmission de ses données à son médecin traitant.

Vous trouverez en pièce jointe sa fiche (PDF) : mesures relevées, notes et preuve de son accord.

Bien cordialement,
Pôle santé – Séminaire spécial ICC Liège`,
  };
}

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
    const todo = items.filter((x) => !x.gp_sent_at).length;
    $('e-filter').innerHTML = [['todo', `À envoyer`, todo], ['sent', 'Envoyées', items.length - todo], ['all', 'Toutes', items.length]]
      .map(([k, l, n]) => `<button type="button" class="chip shrink-0" data-f="${k}" aria-pressed="${filter === k}">${l} <span class="font-normal">${n}</span></button>`)
      .join('');
    const q = $('e-q').value.trim().toLowerCase();
    const rows = items.filter((x) => (filter === 'all' || (filter === 'sent') === !!x.gp_sent_at) && (!q || `${x.last_name} ${x.first_name} ${x.gp_name || ''}`.toLowerCase().includes(q)));
    $('e-list').innerHTML = rows
      .map(
        (x) => `<li class="glass-soft rounded-2xl p-4" data-id="${esc(x.id)}">
        <div class="flex flex-wrap items-start gap-2">
          <p class="mr-auto font-bold">${esc(x.last_name)} ${esc(x.first_name)} <span class="text-xs font-normal text-slate-500">· né(e) le ${esc(iso(x.birth_date))} · reçu(e) le ${esc(dDay(x.created_at))}</span></p>
          ${x.gp_sent_at ? `<span class="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-900">Envoyée le ${esc(dTime(x.gp_sent_at))}</span>` : '<span class="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">À envoyer</span>'}
        </div>
        <p class="mt-1 text-sm text-slate-700">Médecin traitant : ${x.gp_name ? `<b>${esc(x.gp_name)}</b>` : '<span class="text-slate-500">non renseigné (fiche soignant)</span>'}${x.gp_contact ? ` · ${esc(x.gp_contact)}` : ''}</p>
        <label class="label mt-2" for="ge-${esc(x.id)}">E-mail du médecin traitant</label>
        <input id="ge-${esc(x.id)}" data-gp-email type="email" inputmode="email" autocomplete="off" maxlength="254" class="field py-2.5 text-base" placeholder="cabinet@…" value="${esc(x.gp_email || '')}">
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="btn-ghost min-h-10 px-3 py-2 text-sm" href="/fiche?id=${encodeURIComponent(x.id)}" target="_blank" rel="noopener">1. Fiche PDF</a>
          <button type="button" data-mail class="btn-primary min-h-10 px-3 py-2 text-sm" ${x.gp_email ? '' : 'disabled'}>2. Préparer l’e-mail</button>
          <button type="button" data-copy class="btn-ghost min-h-10 px-3 py-2 text-sm">Copier le message</button>
          ${x.gp_sent_at ? '<button type="button" data-sent="0" class="btn-ghost min-h-10 px-3 py-2 text-sm">Annuler « envoyée »</button>' : '<button type="button" data-sent="1" class="btn-ghost min-h-10 px-3 py-2 text-sm">3. Marquer comme envoyée</button>'}
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

  $('e-list').addEventListener('change', (e) => {
    if (!e.target.matches('[data-gp-email]')) return;
    const li = e.target.closest('[data-id]');
    const v = validateEmail(e.target.value);
    e.target.setAttribute('aria-invalid', String(!v.ok));
    if (!v.ok) return toast('E-mail invalide', 'error');
    patch(li.dataset.id, { gp_email: v.value }, v.value ? 'E-mail du médecin enregistré ✓' : 'E-mail effacé');
  });
  $('e-list').addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const x = items.find((i) => i.id === li.dataset.id);
    if (e.target.closest('[data-mail]') && x.gp_email) location.href = mailto(x.gp_email, gpMail(x).subject, gpMail(x).body);
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
