import { api, esc } from './api.js';
import { LEAD_INTERESTS } from './shared/partner.js';
import { CONTACT_TIMES, LEAD_STATUS } from './shared/validate.js';

const $ = (id) => document.getElementById(id);
const LABELS = { ...LEAD_INTERESTS.pro, ...LEAD_INTERESTS.public };
let leads = [];
let filter = 'all';
let toastTimer = 0;

function toast(msg, tone = 'dark') {
  $('toast').innerHTML = `<div class="rounded-2xl ${tone === 'error' ? 'bg-red-700' : 'bg-slate-900'} px-5 py-3 font-semibold text-white shadow-xl">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').innerHTML = ''), 2500);
}
const date = (ms) => new Date(ms).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function render() {
  const counts = { all: leads.length };
  for (const l of leads) counts[l.status] = (counts[l.status] || 0) + 1;
  $('c-status').innerHTML = [['all', 'Tous'], ...Object.entries(LEAD_STATUS)]
    .map(([k, label]) => `<button type="button" class="chip shrink-0" data-f="${k}" aria-pressed="${filter === k}">${label} <span class="font-normal">${counts[k] || 0}</span></button>`)
    .join('');
  const q = $('c-q').value.trim().toLowerCase();
  const rows = leads.filter((l) => (filter === 'all' || l.status === filter) && (!q || `${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(q)));
  $('c-list').innerHTML = rows
    .map((l) => {
      const tags = (l.interests || '').split(',').filter(Boolean).map((i) => `<span class="rounded-lg bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">${esc(LABELS[i] || i)}</span>`).join(' ');
      return `<li class="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-id="${esc(l.id)}">
        <div class="flex flex-wrap items-start gap-2">
          <div class="mr-auto min-w-0">
            <p class="font-bold">${esc(l.name)} <span class="text-xs font-normal text-slate-500">· ${date(l.created_at)} · ${l.audience === 'pro' ? 'Professionnel de santé' : 'Particulier'}</span></p>
            <p class="text-sm">${l.phone ? `<a class="font-semibold text-sky-800 underline" href="tel:${esc(l.phone.replace(/[^+\d]/g, ''))}">${esc(l.phone)}</a> · ` : ''}${l.email ? `<a class="text-sky-800 underline" href="mailto:${esc(l.email)}?subject=${encodeURIComponent('Votre check-up couverture gratuit')}">${esc(l.email)}</a>` : ''}</p>
            <p class="mt-1 flex flex-wrap gap-1">${tags}${l.contact_time ? `<span class="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">${esc(CONTACT_TIMES[l.contact_time])}</span>` : ''}${l.mailed_at ? '<span class="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900">E-mail envoyé</span>' : ''}</p>
            ${l.message ? `<p class="mt-1 text-sm text-slate-600">« ${esc(l.message)} »</p>` : ''}
          </div>
          <label class="sr-only" for="st-${esc(l.id)}">Statut</label>
          <select id="st-${esc(l.id)}" data-k="status" class="field w-auto py-2 text-sm">${Object.entries(LEAD_STATUS).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <label class="sr-only" for="nt-${esc(l.id)}">Notes</label>
        <textarea id="nt-${esc(l.id)}" data-k="partner_notes" rows="2" maxlength="2000" class="field mt-2 text-sm" placeholder="Mes notes (rappel, rendez-vous…)">${esc(l.partner_notes || '')}</textarea>
        <div class="mt-2 text-right"><button type="button" data-stop class="text-xs font-semibold text-red-700 underline">STOP : effacer ce contact</button></div>
      </li>`;
    })
    .join('');
  $('c-empty').textContent = rows.length ? '' : leads.length ? 'Aucun contact pour ce filtre' : 'Aucune demande pour le moment';
}

async function save(id, patch) {
  try {
    const { lead } = await api(`/partner/leads/${id}`, { method: 'PATCH', body: patch });
    leads = leads.map((l) => (l.id === id ? lead : l));
    toast('Enregistré ✓');
    if ('status' in patch) render();
  } catch (e) {
    if (e.status === 401) return start();
    toast('Enregistrement impossible', 'error');
  }
}

$('c-list').addEventListener('change', (e) => {
  const el = e.target.closest('[data-k]');
  if (el) save(el.closest('[data-id]').dataset.id, { [el.dataset.k]: el.value || null });
});
$('c-list').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-stop]')) return;
  const li = e.target.closest('[data-id]');
  if (!confirm('Effacer définitivement ce contact (demande « STOP ») ?')) return;
  try {
    await api(`/partner/leads/${li.dataset.id}`, { method: 'DELETE' });
    leads = leads.filter((l) => l.id !== li.dataset.id);
    render();
    toast('Contact effacé');
  } catch {
    toast('Effacement impossible', 'error');
  }
});
$('c-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (b) ((filter = b.dataset.f), render());
});
$('c-q').addEventListener('input', render);

async function loadContacts() {
  try {
    leads = (await api('/partner/leads')).leads;
    render();
  } catch (e) {
    if (e.status === 401) return start();
    toast('Chargement des contacts impossible', 'error');
  }
}

/* ---------- Corbeille (clé ADMIN_KEY) ---------- */
let trash = { items: [], active: 0, trash_days: 30 };
const T_COL = { 0: 'bg-slate-400', 1: 'bg-emerald-600', 2: 'bg-amber-500', 3: 'bg-red-600' };
const day = (ms) => new Date(ms).toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function renderTrash() {
  $('t-active').textContent = trash.active;
  $('t-count').textContent = trash.items.length;
  $('t-days').textContent = trash.trash_days;
  $('t-surveys').textContent = trash.surveys ?? 0;
  $('t-clear-surveys').disabled = !trash.surveys;
  $('t-trash-all').disabled = !trash.active;
  $('t-restore-all').disabled = $('t-empty').disabled = !trash.items.length;
  const q = $('t-q').value.trim().toLowerCase();
  const rows = trash.items.filter((x) => !q || `${x.last_name} ${x.first_name}`.toLowerCase().includes(q));
  $('t-list').innerHTML = rows
    .map(
      (x) => `<li class="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200" data-id="${esc(x.id)}">
        <span class="size-3 shrink-0 rounded-full ${T_COL[x.triage] ?? T_COL[0]}" aria-hidden="true"></span>
        <div class="mr-auto min-w-0 flex-1 basis-56">
          <p class="font-bold">${esc(x.last_name)} ${esc(x.first_name)}${x.birth_date ? ` <span class="text-xs font-normal text-slate-500">· né(e) le ${esc(x.birth_date.split('-').reverse().join('/'))}</span>` : ''}</p>
          <p class="text-xs text-slate-500">Inscrit(e) le ${day(x.created_at)} · mis(e) à la corbeille le ${day(x.deleted_at)}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" data-restore class="btn-ghost min-h-10 px-3 py-2 text-sm">Restaurer</button>
          <button type="button" data-erase class="btn-danger min-h-10 px-3 py-2 text-sm">Supprimer définitivement</button>
        </div>
      </li>`,
    )
    .join('');
  $('t-empty-msg').textContent = rows.length ? '' : trash.items.length ? 'Aucun résultat' : 'La corbeille est vide';
}
async function loadTrash() {
  try {
    trash = await api('/admin/trash');
    renderTrash();
  } catch (e) {
    if (e.status === 401) return start();
    toast('Chargement de la corbeille impossible', 'error');
  }
}
async function act(path, method, okMsg, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  try {
    const r = await api(path, { method });
    toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
    loadTrash();
  } catch (e) {
    if (e.status === 401) return start();
    toast('Action impossible, réessayez', 'error');
  }
}
$('t-list').addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]');
  if (!li) return;
  const name = li.querySelector('.font-bold').firstChild.textContent.trim();
  if (e.target.closest('[data-restore]')) act(`/admin/trash/${li.dataset.id}/restore`, 'POST', `${name} est de retour dans la liste des inscrits`);
  if (e.target.closest('[data-erase]'))
    act(`/admin/trash/${li.dataset.id}`, 'DELETE', 'Supprimé définitivement', `Supprimer DÉFINITIVEMENT le dossier de ${name} ? Cette action est irréversible.`);
});
$('t-q').addEventListener('input', renderTrash);
$('t-clear-surveys').addEventListener('click', () =>
  act('/admin/surveys', 'DELETE', (r) => `${r.n} réponse(s) effacée(s)`, `Effacer DÉFINITIVEMENT les ${trash.surveys} réponse(s) au questionnaire anonyme (par exemple des réponses de test) ?`),
);
$('t-trash-all').addEventListener('click', () =>
  act('/admin/trash-all', 'POST', (r) => `${r.n} inscription(s) mise(s) à la corbeille`, `Mettre TOUTE la liste des inscrits (${trash.active}) à la corbeille ? Elle disparaîtra des tablettes des soignants (restaurable pendant ${trash.trash_days} jours).`),
);
$('t-restore-all').addEventListener('click', () => act('/admin/restore-all', 'POST', (r) => `${r.n} inscription(s) restaurée(s)`, `Restaurer les ${trash.items.length} dossier(s) de la corbeille ?`));
$('t-empty').addEventListener('click', () =>
  act('/admin/trash', 'DELETE', (r) => `${r.n} dossier(s) supprimé(s) définitivement`, `Vider la corbeille ? Les ${trash.items.length} dossier(s) seront supprimés DÉFINITIVEMENT. Action irréversible.`),
);

/* ---------- Onglets, accès ---------- */
let roles = { admin: false, partner: false };
function showTab(t) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  $('tab-trash').hidden = t !== 'trash';
  $('tab-contacts').hidden = t !== 'contacts';
  if (t === 'trash') loadTrash();
  if (t === 'contacts') loadContacts();
}
document.querySelector('[role=tablist]').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && !b.hidden) showTab(b.dataset.tab);
});
async function start() {
  try {
    roles = await api('/admin/roles');
  } catch {
    roles = { admin: false, partner: false };
  }
  const any = roles.admin || roles.partner;
  $('gate').hidden = any;
  $('app').hidden = !any;
  $('add-key').hidden = roles.admin && roles.partner;
  if (!any) return $('key').focus();
  $('btn-trash').hidden = !roles.admin;
  $('btn-contacts').hidden = !roles.partner;
  showTab(roles.admin ? 'trash' : 'contacts');
}
$('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  $('gate-err').textContent = '';
  try {
    await api('/admin/login', { method: 'POST', body: { key: $('key').value } });
    $('key').value = '';
    $('gate').classList.remove('as-add');
    start();
  } catch (err) {
    $('gate-err').textContent = err.status === 401 ? 'Clé incorrecte' : err.status === 429 ? 'Trop d’essais, patientez une minute' : err.status === 503 ? 'Page non configurée (clés ADMIN_KEY / PARTNER_KEY absentes ou trop courtes)' : 'Connexion impossible';
  } finally {
    btn.disabled = false;
  }
});
$('add-key').addEventListener('click', () => {
  $('gate').hidden = false;
  $('key').focus();
});
$('logout').addEventListener('click', async () => {
  await api('/admin/logout', { method: 'POST' }).catch(() => {});
  leads = [];
  trash = { items: [], active: 0, trash_days: 30 };
  start();
});
start();
