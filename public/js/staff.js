import { ageOf, api, esc } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml } from './form.js';
import { mountCredit, mountPartner } from './partner-ui.js';
import { passUrl, qrSvg } from './qr.js';
import { parsePassCode, startScanner } from './scanner.js';
import { bmi, triage } from './shared/triage.js';
import { NOTES_MAX, VITALS, normalize, parseVital } from './shared/validate.js';
import * as store from './store.js';

const DOCTORS = { 1: { short: 'Dr 1', label: 'Médecin 1 · Mer. 11/11' }, 2: { short: 'Dr 2', label: 'Médecin 2 · Sam. 14/11' } };
const T_LABEL = { 0: 'À mesurer', 1: 'Vert', 2: 'Orange', 3: 'Rouge' };
const T_RANK = { 3: 0, 2: 1, 0: 2, 1: 3 };
const MAX_ROWS = 200;

const $ = (id) => document.getElementById(id);
mountCredit($('gate'));
const filters = { triage: 'all', doctor: 'all', q: '' };

/* ---------- Utilitaires UI ---------- */
let toastTimer = 0;
function toast(msg, tone = 'dark') {
  const cls = tone === 'error' ? 'bg-red-700' : tone === 'ok' ? 'bg-emerald-700' : 'bg-slate-900';
  $('toast').innerHTML = `<div class="pointer-events-auto rounded-2xl ${cls} px-5 py-3 font-semibold text-white shadow-xl">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').innerHTML = ''), 3200);
}

function openDialog(d) {
  if (!d.open) d.showModal();
}
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) d.close();
  });
}

const STATUS = {
  live: ['bg-emerald-500', 'Temps réel'],
  polling: ['bg-amber-500', 'Synchro'],
  offline: ['bg-red-600', 'Hors ligne'],
  connecting: ['bg-slate-400', 'Connexion…'],
  locked: ['bg-slate-400', 'Verrouillé'],
};

/* ---------- Liste ---------- */
function chipsHtml(group, items) {
  return items
    .map(([v, label, n]) => `<button type="button" class="chip shrink-0" data-f="${group}" data-v="${v}" aria-pressed="${filters[group] === v}">${label}${n === undefined ? '' : ` <span class="opacity-70">${n}</span>`}</button>`)
    .join('');
}

function rowHtml(p, level) {
  const b = bmi(p.weight, p.height);
  const vit = [
    p.pulse != null && `${p.pulse} bpm`,
    p.temp != null && `${p.temp} °C`,
    p.sys != null && `${p.sys}/${p.dia ?? '–'}`,
    p.glucose != null && `${p.glucose} mg/dL`,
    b != null ? `IMC ${b}` : p.weight != null && `${p.weight} kg`,
  ]
    .filter(Boolean)
    .join(' · ')
    .replace(/(\d)\.(\d)/g, '$1,$2');
  const doc = p.doctor ? `<span class="rounded-lg bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">${DOCTORS[p.doctor].short}</span>` : '';
  return `<li>
    <button type="button" data-id="${esc(p.id)}" class="flex w-full items-stretch overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200 hover:ring-slate-400">
      <span class="t${level} w-2 shrink-0" aria-hidden="true"></span>
      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-base font-bold">${esc(p.last_name)} ${esc(p.first_name)}</span>
          <span class="block truncate text-sm text-slate-600">${esc(ageOf(p.birth_date))} · <span class="font-mono">${esc(p.short_code)}</span>${vit ? ` · ${esc(vit)}` : ''}</span>
        </span>
        ${doc}
        <span class="tb${level} rounded-lg px-2 py-0.5 text-xs font-bold">${T_LABEL[level]}</span>
        ${store.isPending(p.id) ? '<span class="spinner size-4 text-slate-400" aria-label="Enregistrement"></span>' : ''}
      </span>
    </button></li>`;
}

function renderList() {
  const [dot, label] = STATUS[store.state.status] || STATUS.connecting;
  $('status').innerHTML = `<span class="size-2 rounded-full ${dot}" aria-hidden="true"></span>${label}`;

  const q = normalize(filters.q);
  const items = store.all().map((p) => ({ p, level: triage(p).level }));
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const dcounts = { 1: 0, 2: 0, none: 0 };
  for (const { p, level } of items) {
    counts[level]++;
    dcounts[p.doctor || 'none']++;
  }

  $('f-triage').innerHTML = chipsHtml('triage', [
    ['all', 'Tous', items.length],
    ['3', 'Rouge', counts[3]],
    ['2', 'Orange', counts[2]],
    ['0', 'À mesurer', counts[0]],
    ['1', 'Vert', counts[1]],
  ]);
  $('f-doctor').innerHTML = chipsHtml('doctor', [
    ['all', 'Tous médecins'],
    ['1', DOCTORS[1].label, dcounts[1]],
    ['2', DOCTORS[2].label, dcounts[2]],
    ['none', 'Non assigné', dcounts.none],
  ]);

  const visible = items
    .filter(({ p, level }) => {
      if (filters.triage !== 'all' && String(level) !== filters.triage) return false;
      if (filters.doctor !== 'all' && String(p.doctor || 'none') !== filters.doctor) return false;
      if (!q) return true;
      return normalize(`${p.last_name} ${p.first_name}`).includes(q) || normalize(`${p.first_name} ${p.last_name}`).includes(q) || p.short_code.toLowerCase().startsWith(q);
    })
    .sort((a, b) => T_RANK[a.level] - T_RANK[b.level] || a.p.created_at - b.p.created_at);

  $('list').innerHTML = visible.slice(0, MAX_ROWS).map(({ p, level }) => rowHtml(p, level)).join('');
  $('list-state').textContent =
    store.state.status === 'connecting' && !items.length
      ? 'Chargement…'
      : !visible.length
        ? q || filters.triage !== 'all' || filters.doctor !== 'all'
          ? 'Aucun résultat'
          : 'Aucun participant inscrit pour le moment'
        : visible.length > MAX_ROWS
          ? `+ ${visible.length - MAX_ROWS} autres : affinez la recherche`
          : '';
  if (sheetId) refreshSheet();
}

$('q').addEventListener('input', (e) => {
  filters.q = e.target.value;
  renderList();
});
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('list').querySelector('[data-id]')?.click();
});
document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-f]');
  if (chip) {
    filters[chip.dataset.f] = chip.dataset.v;
    renderList();
  }
});
$('list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-id]');
  if (b) openSheet(b.dataset.id);
});

/* ---------- Fiche patient ---------- */
let sheetId = null;
const VITAL_FIELDS = [
  ['pulse', 'Pouls', 'bpm', 'numeric'],
  ['temp', 'Température', '°C', 'decimal'],
  ['sys', 'Tension sys.', 'mmHg', 'numeric'],
  ['dia', 'Tension dia.', 'mmHg', 'numeric'],
  ['glucose', 'Glycémie', 'mg/dL', 'numeric'],
  ['weight', 'Poids', 'kg', 'decimal'],
  ['height', 'Taille', 'cm', 'numeric'],
  ['waist', 'Périm. abdo.', 'cm', 'numeric'],
];

function openSheet(id) {
  const p = store.view(id);
  if (!p) return toast('Patient introuvable', 'error');
  sheetId = id;
  $('sheet-body').innerHTML = `
    <div class="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div class="min-w-0 flex-1">
        <h2 id="sheet-name" class="truncate text-xl font-extrabold">${esc(p.last_name)} ${esc(p.first_name)}</h2>
        <p class="text-sm text-slate-600">${esc(ageOf(p.birth_date))} · né(e) le ${esc(p.birth_date.split('-').reverse().join('/'))} · <span class="font-mono font-bold">${esc(p.short_code)}</span></p>
        <p id="sheet-email" class="truncate text-sm text-slate-500"></p>
      </div>
      <button class="btn-ghost min-h-11 px-3" type="button" data-close aria-label="Fermer">✕</button>
    </div>
    <div class="space-y-5 p-4">
      <div id="sheet-triage" class="rounded-2xl p-4" role="status" aria-live="polite"></div>
      <section aria-labelledby="h-vitals">
        <h3 id="h-vitals" class="mb-2 text-sm font-bold tracking-wide text-slate-500 uppercase">Paramètres vitaux</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          ${VITAL_FIELDS.map(
            ([k, label, unit, mode]) => `
            <div>
              <label class="label" for="v-${k}">${label} <span class="font-normal text-slate-500">${unit}</span></label>
              <input id="v-${k}" data-k="${k}" class="field text-center text-2xl font-bold tabular-nums" inputmode="${mode}" autocomplete="off" enterkeyhint="next" placeholder="–" aria-describedby="v-${k}-err">
              <p id="v-${k}-err" class="err text-xs"></p>
            </div>`,
          ).join('')}
        </div>
      </section>
      <p id="sheet-bmi" class="-mt-2 text-sm font-semibold text-slate-700" aria-live="polite"></p>
      <section aria-labelledby="h-doc">
        <h3 id="h-doc" class="mb-2 text-sm font-bold tracking-wide text-slate-500 uppercase">Assignation</h3>
        <div class="grid grid-cols-2 gap-3" id="sheet-doctors">
          ${[1, 2].map((d) => `<button type="button" data-doctor="${d}" class="btn-ghost min-h-14 aria-pressed:border-sky-700 aria-pressed:bg-sky-700 aria-pressed:text-white">${DOCTORS[d].label}</button>`).join('')}
        </div>
      </section>
      <section>
        <label class="label" for="v-notes">Notes cliniques</label>
        <textarea id="v-notes" data-k="notes" rows="4" maxlength="${NOTES_MAX}" class="field text-base"></textarea>
      </section>
      <section id="sheet-gp" class="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200" aria-label="Médecin traitant"></section>
      <div class="flex items-center justify-between gap-3 pt-2">
        <p id="sheet-save" class="text-sm font-semibold text-slate-500" aria-live="polite"></p>
        <button type="button" id="sheet-delete" class="btn-danger min-h-11 text-sm">Supprimer (effacement RGPD)</button>
      </div>
    </div>`;
  refreshSheet(true);
  openDialog($('sheet'));
  loadDetail(id);
  if (!matchMedia('(pointer: coarse)').matches) $('v-pulse').focus();
}

async function loadDetail(id) {
  try {
    const { patient: d } = await api(`/staff/patients/${id}`);
    if (sheetId !== id) return;
    $('sheet-email').textContent = [d.email, d.phone].filter(Boolean).join(' · ');
    const gp = $('sheet-gp');
    if (!d.gp_consent) {
      gp.innerHTML = '<p class="font-bold text-slate-800">Transmission au médecin traitant : <span class="text-red-700">non autorisée</span></p>';
      return;
    }
    gp.innerHTML = `<p class="font-bold text-slate-800">Transmission au médecin traitant : <span class="text-emerald-700">autorisée</span></p>
      ${d.no_gp ? '<p class="mt-1 text-slate-600">Pas de médecin traitant actuellement.</p>' : `<p class="mt-1 text-slate-700">${esc(d.gp_name)}${d.gp_address ? ` · ${esc(d.gp_address)}` : ''}${d.gp_contact ? ` · ${esc(d.gp_contact)}` : ''}</p>`}
      <button type="button" id="gp-withdraw" class="btn-danger mt-3 min-h-10 py-2 text-sm">Retrait de l’autorisation</button>`;
  } catch {
    /* détail non critique */
  }
}

function refreshSheet(force = false) {
  const p = store.view(sheetId);
  if (!p) {
    $('sheet').close();
    toast('Ce dossier a été supprimé par un collègue');
    return;
  }
  for (const input of $('sheet-body').querySelectorAll('[data-k]')) {
    if (!force && document.activeElement === input) continue; // ne jamais écraser une saisie en cours
    const v = p[input.dataset.k];
    const str = v === null || v === undefined ? '' : String(v).replace('.', input.dataset.k === 'notes' ? '.' : ',');
    if (input.value !== str && input.getAttribute('aria-invalid') !== 'true') input.value = str;
  }
  const { level, reasons } = triage(previewValues(p));
  const box = $('sheet-triage');
  box.className = `tb${level} rounded-2xl p-4 transition-colors`;
  box.innerHTML = `<div class="flex items-center gap-3"><span class="t${level} size-5 rounded-full" aria-hidden="true"></span><span class="text-xl font-extrabold">${T_LABEL[level]}</span></div>${
    reasons.length ? `<p class="mt-1 text-sm font-semibold">${reasons.map((r) => esc(r.replace(/(\d)\.(\d)/g, '$1,$2'))).join(' · ')}</p>` : ''
  }`;
  for (const b of $('sheet-doctors').children) b.setAttribute('aria-pressed', String(p.doctor === Number(b.dataset.doctor)));
  const pv = previewValues(p);
  const b = bmi(pv.weight, pv.height);
  $('sheet-bmi').textContent = b == null ? '' : `IMC : ${String(b).replace('.', ',')} kg/m² (normal 18,5–24,9)`;
  $('sheet-save').textContent = store.isPending(sheetId) ? (store.state.status === 'offline' ? 'Hors ligne : sera envoyé…' : 'Enregistrement…') : 'Enregistré ✓';
}

/** Triage instantané avec les valeurs en cours de frappe (avant même l'envoi). */
function previewValues(p) {
  const out = { ...p };
  for (const k of Object.keys(VITALS)) {
    const input = $(`v-${k}`);
    if (input && document.activeElement === input) {
      const n = parseVital(k, input.value);
      if (!Number.isNaN(n)) out[k] = n;
    }
  }
  return out;
}

$('sheet').addEventListener('input', (e) => {
  const input = e.target.closest('[data-k]');
  if (!input || !sheetId) return;
  const k = input.dataset.k;
  if (k === 'notes') return store.patch(sheetId, { notes: input.value || null });
  const n = parseVital(k, input.value);
  const err = $(`v-${k}-err`);
  if (Number.isNaN(n)) {
    input.setAttribute('aria-invalid', 'true');
    err.textContent = `${VITALS[k].min}–${VITALS[k].max}`;
    refreshSheet();
    return;
  }
  input.setAttribute('aria-invalid', 'false');
  err.textContent = '';
  store.patch(sheetId, { [k]: n });
});
$('sheet').addEventListener('keydown', (e) => {
  const input = e.target.closest('input[data-k]');
  if (e.key !== 'Enter' || !input) return;
  e.preventDefault();
  const all = [...$('sheet-body').querySelectorAll('[data-k]')];
  all[all.indexOf(input) + 1]?.focus();
});
$('sheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-doctor]');
  if (b && sheetId) {
    const d = Number(b.dataset.doctor);
    store.patch(sheetId, { doctor: store.view(sheetId).doctor === d ? null : d });
    navigator.vibrate?.(30);
  }
  if (e.target.closest('#sheet-delete') && sheetId) deleteCurrent();
  if (e.target.closest('#gp-withdraw') && sheetId && confirm('Confirmer le retrait de l’autorisation de transmission ?')) {
    store.patch(sheetId, { gp_consent: 0 });
    $('sheet-gp').innerHTML = '<p class="font-bold text-slate-800">Transmission au médecin traitant : <span class="text-red-700">retirée</span></p>';
  }
});
$('sheet').addEventListener('close', () => {
  sheetId = null;
  store.flush();
  if (location.hash) history.replaceState(null, '', location.pathname);
});

async function deleteCurrent() {
  const p = store.view(sheetId);
  if (!confirm(`Effacer définitivement le dossier de ${p.first_name} ${p.last_name} ?`)) return;
  const btn = $('sheet-delete');
  btn.disabled = true;
  try {
    await api(`/staff/patients/${p.id}`, { method: 'DELETE' });
    store.merge({ id: p.id, version: p.version + 1, deleted_at: Date.now() });
    sheetId = null;
    $('sheet').close();
    toast('Dossier effacé', 'ok');
  } catch {
    btn.disabled = false;
    toast('Suppression impossible, réessayez', 'error');
  }
}

store.state.onRejected = (id, e) => {
  toast(e.status === 404 ? 'Dossier supprimé entre-temps' : 'Valeur refusée par le serveur', 'error');
};

/* ---------- Ajout manuel ---------- */
let lastCreated = null;
$('add-fields').innerHTML = identityFieldsHtml('a', { staff: true });
bindIdentityForm($('add-form'), async (payload) => {
  const { pass, patient } = await api('/staff/patients', { method: 'POST', body: payload });
  store.merge(patient);
  lastCreated = patient.id;
  $('add-pass').innerHTML = passCardHtml(pass, qrSvg(passUrl(pass.token), { label: 'QR code du Pass Patient' }));
  $('add-form').hidden = true;
  $('add-done').hidden = false;
});
function resetAdd() {
  $('add-form').hidden = false;
  $('add-done').hidden = true;
}
$('open-add').addEventListener('click', () => {
  resetAdd();
  openDialog($('add'));
  $('a-last_name').focus();
});
$('add-again').addEventListener('click', () => {
  resetAdd();
  $('a-last_name').focus();
});
$('add-open').addEventListener('click', () => {
  $('add').close();
  openSheet(lastCreated);
});

/* ---------- Scanner ---------- */
let stopScan = null;
async function openByCode(raw) {
  const code = parsePassCode(raw);
  if (!code) return toast('QR code non reconnu', 'error');
  let p = store.findByToken(code);
  if (!p) {
    try {
      const { patient } = await api(`/staff/lookup?q=${encodeURIComponent(code)}`);
      store.merge(patient);
      p = patient;
    } catch (e) {
      return toast(e.status === 404 ? 'Pass inconnu' : 'Recherche impossible (réseau)', 'error');
    }
  }
  if ($('scan').open) $('scan').close();
  openSheet(p.id);
}
$('open-scan').addEventListener('click', async () => {
  openDialog($('scan'));
  $('scan-msg').textContent = 'Visez le QR code du Pass';
  try {
    let done = false;
    stopScan = await startScanner($('scan-video'), (v) => {
      if (done) return;
      done = true;
      openByCode(v);
    });
  } catch {
    $('scan-msg').textContent = 'Caméra indisponible : saisissez le code de secours.';
    $('scan-code').focus();
  }
});
$('scan').addEventListener('close', () => {
  stopScan?.();
  stopScan = null;
});
$('scan-form').addEventListener('submit', (e) => {
  e.preventDefault();
  openByCode($('scan-code').value);
  $('scan-code').value = '';
});

/* ---------- Statistiques questionnaire (anonyme) ---------- */
const pct = (n, t) => (t ? Math.round((100 * (n || 0)) / t) : 0);
const pctTxt = (n, t) => (t ? `${pct(n, t)} %` : '–');
const bar = (label, n, t, cls = 'bg-sky-700') => `
  <div class="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-sm">
    <span class="truncate text-slate-700">${label}</span>
    <span class="h-3 rounded-full bg-slate-100"><span class="block h-3 rounded-full ${cls}" data-w="${pct(n, t)}"></span></span>
    <span class="text-right font-bold tabular-nums">${n || 0}</span>
  </div>`;
async function renderStats() {
  const box = $('stats-body');
  try {
    const s = await api('/staff/survey-stats');
    const t = s.n || 0;
    const freq = Object.fromEntries(s.activity.map((r) => [r.k, r.n]));
    const vax = Object.fromEntries(s.vax.map((r) => [r.k, r.n]));
    const ft = s.activity.reduce((a, r) => a + r.n, 0);
    const vt = s.vax.reduce((a, r) => a + r.n, 0);
    const bt = (s.bmi_low || 0) + (s.bmi_ok || 0) + (s.bmi_over || 0) + (s.bmi_obese || 0);
    box.innerHTML = !t
      ? '<p class="py-10 text-center text-slate-500">Aucune réponse pour le moment</p>'
      : `<p class="text-4xl font-black">${t} <span class="text-base font-semibold text-slate-600">réponses anonymes</span></p>
      <section class="space-y-2"><h3 class="font-bold">IMC ${s.bmi_avg != null ? `· moyenne ${s.bmi_avg}` : ''}</h3>
        ${bar('&lt; 18,5', s.bmi_low, bt, 'bg-amber-500')}${bar('18,5 – 24,9', s.bmi_ok, bt, 'bg-emerald-600')}${bar('25 – 29,9', s.bmi_over, bt, 'bg-amber-500')}${bar('≥ 30', s.bmi_obese, bt, 'bg-red-600')}</section>
      <section class="space-y-2"><h3 class="font-bold">Activité physique ${s.act_min_avg != null ? `· ${s.act_min_avg} min/sem. en moyenne` : ''}</h3>
        ${bar('Aucune', freq[0], ft)}${bar('1 fois/sem.', freq[1], ft)}${bar('2 fois/sem.', freq[2], ft)}${bar('3 fois/sem.', freq[3], ft)}${bar('Plus de 3', freq[4], ft)}
        <p class="text-sm text-slate-600">${s.act_who || 0} personne(s) atteignent ≥ 150 min/semaine (repère OMS).</p></section>
      <section class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-slate-100 p-3"><p class="text-sm text-slate-600">Glycémie déjà testée</p><p class="text-2xl font-black">${pctTxt(s.glu_yes, (s.glu_yes || 0) + (s.glu_no || 0))}</p></div>
        <div class="rounded-xl bg-slate-100 p-3"><p class="text-sm text-slate-600">Connaît son cholestérol</p><p class="text-2xl font-black">${pctTxt(s.chol_yes, (s.chol_yes || 0) + (s.chol_no || 0))}</p></div>
        <div class="rounded-xl bg-slate-100 p-3"><p class="text-sm text-slate-600">Écrans / jour (moy.)</p><p class="text-2xl font-black">${s.screen_avg ?? '–'} h</p></div>
      </section>
      <section class="space-y-2"><h3 class="font-bold">Vaccinations à jour ?</h3>
        ${bar('Oui', vax[1], vt, 'bg-emerald-600')}${bar('Non', vax[0], vt, 'bg-red-600')}${bar('Ne sait pas', vax[2], vt, 'bg-slate-400')}</section>
      <section><h3 class="mb-2 font-bold">Questions posées (${s.questions.length})</h3>
        <ul class="space-y-2">${s.questions.map((q) => `<li class="rounded-xl bg-white p-3 text-sm whitespace-pre-line ring-1 ring-slate-200">${esc(q.questions)}</li>`).join('') || '<li class="text-sm text-slate-500">Aucune</li>'}</ul></section>`;
    for (const el of box.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`; // CSSOM : compatible CSP
  } catch {
    box.innerHTML = '<p class="py-10 text-center text-red-700">Statistiques indisponibles, réessayez.</p>';
  }
}
let statsTimer = 0;
$('open-stats').addEventListener('click', () => {
  $('stats-body').innerHTML = '<p class="py-10 text-center text-slate-500"><span class="spinner"></span></p>';
  openDialog($('stats'));
  renderStats();
});
store.state.onSurvey = () => {
  if (!$('stats').open) return;
  clearTimeout(statsTimer);
  statsTimer = setTimeout(renderStats, 800);
};

/* ---------- Accès & démarrage ---------- */
function showGate() {
  $('app').hidden = true;
  $('gate').hidden = false;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  $('pin').focus();
}
store.state.onUnauthorized = showGate;

$('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter || e.target.querySelector('button');
  if (btn.disabled) return;
  btn.disabled = true;
  $('gate-err').textContent = '';
  try {
    await api('/staff/login', { method: 'POST', body: { pin: $('pin').value } });
    $('pin').value = '';
    boot();
  } catch (err) {
    $('gate-err').textContent =
      err.status === 401 ? 'Code incorrect' : err.status === 429 ? 'Trop d’essais, patientez une minute' : err.status === 503 ? 'Service non configuré (code d’accès absent ou trop court)' : 'Connexion impossible';
  } finally {
    btn.disabled = false;
  }
});

$('lock').addEventListener('click', async () => {
  await store.flush(); // ne rien perdre avant de verrouiller
  try {
    await api('/staff/logout', { method: 'POST' });
  } catch {
    /* cookie effacé au prochain 401 de toute façon */
  }
  store.state.status = 'locked';
  store.lock();
  showGate();
});

function handleHash() {
  const m = location.hash.match(/p=([A-Za-z0-9_-]+)/);
  if (m) openByCode(`#p=${m[1]}`);
}
addEventListener('hashchange', handleHash);

let subscribed = false;
async function boot() {
  $('gate').hidden = true;
  $('app').hidden = false;
  if (!subscribed) {
    subscribed = !!store.subscribe(renderList);
    mountPartner();
  }
  renderList();
  await store.start();
  if (store.state.status !== 'locked') handleHash();
}

api('/staff/session')
  .then(boot)
  .catch((e) => (e.status === 401 ? showGate() : boot()));
