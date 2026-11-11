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
  $('f-status').innerHTML = [['all', 'Tous'], ...Object.entries(LEAD_STATUS)]
    .map(([k, label]) => `<button type="button" class="chip shrink-0" data-f="${k}" aria-pressed="${filter === k}">${label} <span class="font-normal">${counts[k] || 0}</span></button>`)
    .join('');
  const q = $('q').value.trim().toLowerCase();
  const rows = leads.filter((l) => (filter === 'all' || l.status === filter) && (!q || `${l.name} ${l.email} ${l.phone}`.toLowerCase().includes(q)));
  $('list').innerHTML = rows
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
  $('empty').textContent = rows.length ? '' : leads.length ? 'Aucun contact pour ce filtre' : 'Aucune demande pour le moment';
}

async function save(id, patch) {
  try {
    const { lead } = await api(`/partner/leads/${id}`, { method: 'PATCH', body: patch });
    leads = leads.map((l) => (l.id === id ? lead : l));
    toast('Enregistré ✓');
    if ('status' in patch) render();
  } catch (e) {
    if (e.status === 401) return showGate();
    toast('Enregistrement impossible', 'error');
  }
}

$('list').addEventListener('change', (e) => {
  const el = e.target.closest('[data-k]');
  if (el) save(el.closest('[data-id]').dataset.id, { [el.dataset.k]: el.value || null });
});
$('list').addEventListener('click', async (e) => {
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
$('f-status').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (b) ((filter = b.dataset.f), render());
});
$('q').addEventListener('input', render);

async function load() {
  try {
    leads = (await api('/partner/leads')).leads;
    $('gate').hidden = true;
    $('app').hidden = false;
    render();
  } catch (e) {
    if (e.status === 401) showGate();
    else toast('Chargement impossible', 'error');
  }
}
function showGate() {
  $('app').hidden = true;
  $('gate').hidden = false;
  $('key').focus();
}
$('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  $('gate-err').textContent = '';
  try {
    await api('/partner/login', { method: 'POST', body: { key: $('key').value } });
    $('key').value = '';
    load();
  } catch (err) {
    $('gate-err').textContent = err.status === 401 ? 'Clé incorrecte' : err.status === 429 ? 'Trop d’essais, patientez une minute' : err.status === 503 ? 'Espace non configuré (clé PARTNER_KEY absente ou trop courte)' : 'Connexion impossible';
  } finally {
    btn.disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  await api('/partner/logout', { method: 'POST' }).catch(() => {});
  leads = [];
  showGate();
});
load();
