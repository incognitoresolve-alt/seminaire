// Onglet « Remarques » de /admin (clé ADMIN_KEY) : remarques et propositions des intervenants.
import { api, esc } from './api.js';
import { FEEDBACK_KINDS, FEEDBACK_ROLES, FEEDBACK_STATUS } from './shared/validate.js';

const $ = (id) => document.getElementById(id);
const KIND_COL = { remarque: 'bg-sky-100 text-sky-900', proposition: 'bg-amber-100 text-amber-900', probleme: 'bg-red-100 text-red-900', positif: 'bg-emerald-100 text-emerald-900' };
const date = (ms) => new Date(ms).toLocaleString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const EMAIL = /@/;

export function initFeedback({ toast, onAuthLost }) {
  let items = [];
  let filter = 'all';
  let timer = 0;
  const link = `${location.origin}/remarques`;
  $('f-link').textContent = link;

  function badge() {
    const n = items.filter((x) => x.status === 'nouveau').length;
    $('f-badge').textContent = n;
    $('f-badge').hidden = !n;
  }

  function render() {
    badge();
    const counts = { all: items.length };
    for (const x of items) counts[x.status] = (counts[x.status] || 0) + 1;
    $('f-status').innerHTML = [['all', 'Toutes'], ...Object.entries(FEEDBACK_STATUS)]
      .map(([k, label]) => `<button type="button" class="chip shrink-0" data-f="${k}" aria-pressed="${filter === k}">${label} <span class="font-normal">${counts[k] || 0}</span></button>`)
      .join('');
    const q = $('f-q').value.trim().toLowerCase();
    const rows = items.filter((x) => (filter === 'all' || x.status === filter) && (!q || `${x.message} ${x.name || ''} ${x.contact || ''} ${x.admin_notes || ''}`.toLowerCase().includes(q)));
    $('f-list').innerHTML = rows
      .map((x) => {
        const contact = x.contact
          ? EMAIL.test(x.contact)
            ? ` · <a class="text-sky-800 underline" href="mailto:${esc(x.contact)}?subject=${encodeURIComponent('Votre remarque · Séminaire ICC Liège')}">${esc(x.contact)}</a>`
            : ` · <a class="font-semibold text-sky-800 underline" href="tel:${esc(x.contact.replace(/[^+\d]/g, ''))}">${esc(x.contact)}</a>`
          : '';
        return `<li class="glass-soft rounded-2xl p-4${x.status === 'nouveau' ? ' ring-2 ring-accent/60' : ''}" data-id="${esc(x.id)}">
        <div class="flex flex-wrap items-start gap-3">
          <div class="mr-auto min-w-0 flex-1 basis-60">
            <p class="flex flex-wrap items-center gap-1.5 text-xs"><span class="rounded-lg px-2 py-0.5 font-bold ${KIND_COL[x.kind] || 'bg-slate-100 text-slate-800'}">${esc(FEEDBACK_KINDS[x.kind] || x.kind)}</span><span class="font-semibold text-slate-700">${esc(FEEDBACK_ROLES[x.role] || x.role)}</span><span class="text-slate-500">· ${date(x.created_at)}</span></p>
            <p class="mt-2 break-words whitespace-pre-line text-slate-900">${esc(x.message)}</p>
            <p class="mt-2 text-sm text-slate-600">${x.name ? esc(x.name) : 'Anonyme'}${contact}</p>
          </div>
          <label class="sr-only" for="fs-${esc(x.id)}">Statut</label>
          <select id="fs-${esc(x.id)}" data-k="status" class="field w-auto py-2 text-sm">${Object.entries(FEEDBACK_STATUS).map(([k, v]) => `<option value="${k}" ${k === x.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </div>
        <label class="sr-only" for="fn-${esc(x.id)}">Notes de l’organisation</label>
        <textarea id="fn-${esc(x.id)}" data-k="admin_notes" rows="2" maxlength="2000" class="field mt-2 text-sm" placeholder="Notes de l’organisation (suite donnée…)">${esc(x.admin_notes || '')}</textarea>
        <div class="mt-2 text-right"><button type="button" data-del class="text-xs font-semibold text-red-700 underline">Supprimer</button></div>
      </li>`;
      })
      .join('');
    $('f-empty').textContent = rows.length ? '' : items.length ? 'Aucune remarque pour ce filtre' : 'Aucune remarque pour le moment. Partagez le lien ci-dessus.';
  }

  async function load({ quiet = false } = {}) {
    try {
      items = (await api('/admin/feedback')).items;
      render();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return onAuthLost();
      if (!quiet) toast('Chargement des remarques impossible', 'error');
    }
  }

  async function save(id, patch) {
    try {
      const { item } = await api(`/admin/feedback/${id}`, { method: 'PATCH', body: patch });
      items = items.map((x) => (x.id === id ? item : x));
      toast('Enregistré ✓');
      if ('status' in patch) render();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return onAuthLost();
      toast('Enregistrement impossible', 'error');
    }
  }

  $('f-list').addEventListener('change', (e) => {
    const el = e.target.closest('[data-k]');
    if (el) save(el.closest('[data-id]').dataset.id, { [el.dataset.k]: el.value || null });
  });
  $('f-list').addEventListener('click', async (e) => {
    if (!e.target.closest('[data-del]')) return;
    const li = e.target.closest('[data-id]');
    if (!confirm('Supprimer définitivement cette remarque ?')) return;
    try {
      await api(`/admin/feedback/${li.dataset.id}`, { method: 'DELETE' });
      items = items.filter((x) => x.id !== li.dataset.id);
      render();
      toast('Remarque supprimée');
    } catch {
      toast('Suppression impossible', 'error');
    }
  });
  $('f-status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) ((filter = b.dataset.f), render());
  });
  $('f-q').addEventListener('input', render);
  $('f-refresh').addEventListener('click', () => load().then(() => toast('À jour ✓')));
  $('f-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié ✓ Collez-le dans WhatsApp, un e-mail…');
    } catch {
      getSelection().selectAllChildren($('f-link'));
      toast('Sélectionné : copiez avec Ctrl+C / « Copier »');
    }
  });

  return {
    load,
    // Actualisation douce toutes les 60 s (onglet visible, sans écraser une note en cours de saisie).
    watch(on) {
      clearInterval(timer);
      if (on) timer = setInterval(() => document.visibilityState === 'visible' && !$('f-list').contains(document.activeElement) && load({ quiet: true }), 60000);
    },
    reset() {
      items = [];
      clearInterval(timer);
      badge();
    },
  };
}
