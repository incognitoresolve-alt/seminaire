// /remarques-voir#k=JETON : consultation des remarques en LECTURE SEULE pour quiconque a le lien.
// Le jeton reste dans le fragment (#) : jamais envoyé dans l'URL ni dans les journaux ; transmis en en-tête.
// Le serveur ne renvoie ni nom, ni coordonnées, ni notes internes ; lien désactivable / renouvelable dans /admin.
import { esc } from './api.js';
import { FEEDBACK_DAYS, FEEDBACK_KINDS, FEEDBACK_ROLES, FEEDBACK_STATUS } from './shared/validate.js';

const $ = (id) => document.getElementById(id);
const key = new URLSearchParams(location.hash.slice(1)).get('k') || '';
const KIND_COL = { remarque: 'bg-sky-100 text-sky-900', proposition: 'bg-amber-100 text-amber-900', probleme: 'bg-red-100 text-red-900', positif: 'bg-emerald-100 text-emerald-900' };
const when = (ms) => new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
let items = [];
const filters = { day: 'all', kind: 'all' };

function fail(msg) {
  $('app').hidden = true;
  $('state').hidden = false;
  $('state').innerHTML = `<p class="font-bold text-slate-900">${esc(msg)}</p>`;
}

const chips = (f, list) =>
  list.map(([k, label, n]) => `<button type="button" class="chip shrink-0" data-f="${f}" data-v="${k}" aria-pressed="${filters[f] === k}">${esc(label)}${n === undefined ? '' : ` <span class="font-normal">${n}</span>`}</button>`).join('');

function render() {
  const dayN = (d) => items.filter((x) => (x.days || '').split(',').includes(d)).length;
  $('f-days').innerHTML = chips('day', [['all', 'Tous les jours', items.length], ...Object.entries(FEEDBACK_DAYS).map(([k, l]) => [k, l, dayN(k)])]);
  $('f-kinds').innerHTML = chips('kind', [['all', 'Tous les types'], ...Object.entries(FEEDBACK_KINDS)]);
  const q = $('q').value.trim().toLowerCase();
  const rows = items.filter(
    (x) => (filters.day === 'all' || (x.days || '').split(',').includes(filters.day)) && (filters.kind === 'all' || x.kind === filters.kind) && (!q || x.message.toLowerCase().includes(q)),
  );
  $('count').textContent = rows.length;
  $('list').innerHTML = rows
    .map((x) => {
      const days = (x.days || '').split(',').filter(Boolean).map((d) => `<span class="rounded-lg bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">${esc(FEEDBACK_DAYS[d] || d)}</span>`).join('');
      return `<li class="glass-soft rounded-2xl p-4">
        <p class="flex flex-wrap items-center gap-1.5 text-xs"><span class="rounded-lg px-2 py-0.5 font-bold ${KIND_COL[x.kind] || 'bg-slate-100 text-slate-800'}">${esc(FEEDBACK_KINDS[x.kind] || x.kind)}</span>${days}<span class="font-semibold text-slate-700">${esc(FEEDBACK_ROLES[x.role] || x.role)}</span><span class="text-slate-500">· ${esc(when(x.created_at))}</span>${x.status && x.status !== 'nouveau' ? `<span class="ml-auto rounded-lg bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900">${esc(FEEDBACK_STATUS[x.status] || x.status)}</span>` : ''}</p>
        <p class="mt-2 break-words whitespace-pre-line text-slate-900">${esc(x.message)}</p>
      </li>`;
    })
    .join('');
  $('empty').textContent = rows.length ? '' : items.length ? 'Aucune remarque pour ce filtre' : 'Aucune remarque pour le moment.';
}

async function load(quiet = false) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('/api/feedback/public', { headers: { 'X-View-Key': key }, credentials: 'omit', signal: ctrl.signal });
    if (res.status === 403) return fail('Lien invalide ou désactivé. Demandez le lien à jour à l’organisation du séminaire.');
    if (res.status === 429) return quiet || fail('Trop de consultations en peu de temps : réessayez dans une minute.');
    if (!res.ok) throw new Error(String(res.status));
    items = (await res.json()).items;
    $('state').hidden = true;
    $('app').hidden = false;
    render();
  } catch {
    if (!quiet) fail('Chargement impossible (réseau ?). Réessayez dans un instant.');
  } finally {
    clearTimeout(t);
  }
}

if (!/^[A-Za-z0-9_-]{30,64}$/.test(key)) fail('Lien incomplet : utilisez le lien complet fourni par l’organisation du séminaire.');
else {
  load();
  setInterval(() => document.visibilityState === 'visible' && load(true), 60000);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (b) ((filters[b.dataset.f] = b.dataset.v), render());
});
$('q').addEventListener('input', render);
$('refresh').addEventListener('click', () => load());
