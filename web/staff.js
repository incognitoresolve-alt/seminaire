import { registerSW } from './sw-register.js';
import { ageOf, api, esc } from './api.js';
import { bindIdentityForm, identityFieldsHtml } from './form.js';
import { mountCredit, mountPartner } from './partner-ui.js';
import { NOTE, RAPPEL, analyse } from './shared/assistant.js';
import { ALERTS, CONTEXTS, bmi, parseAlerts, triage } from './shared/triage.js';
import { NOTES_MAX, VITALS, normalize, parseVital, validatePatch } from './shared/validate.js';
import { CONSENT_TEXTS, CURRENT } from './shared/consent.js';
import * as store from './store.js';

const T_LABEL = { 0: 'À mesurer', 1: 'Vert', 2: 'Orange', 3: 'Rouge' };
const T_RANK = { 3: 0, 2: 1, 0: 2, 1: 3 };
const MAX_ROWS = 200;

const $ = (id) => document.getElementById(id);
mountCredit($('gate'));
const filters = { stage: 'active', triage: 'all', q: '' };
const STAGE = { 0: 'En attente', 1: 'En consultation', 2: 'Terminé' };
const waitMin = (p) => Math.max(0, Math.round((Date.now() - p.created_at) / 60000));
const fmtWait = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

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
    .map(([v, label, n]) => `<button type="button" class="chip shrink-0" data-f="${group}" data-v="${v}" aria-pressed="${filters[group] === v}">${label}${n === undefined ? '' : ` <span class="font-normal">${n}</span>`}</button>`)
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
  const stage = p.stage ?? 0;
  const stageBadge =
    stage === 1
      ? '<span class="rounded-lg bg-sky-700 px-2 py-0.5 text-xs font-bold text-white">En consultation</span>'
      : stage === 2
        ? '<span class="rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">Terminé</span>'
        : `<span class="text-xs font-semibold tabular-nums ${waitMin(p) >= 30 ? 'text-red-700' : 'text-slate-500'}" title="Temps d’attente">⏱ ${fmtWait(waitMin(p))}</span>`;
  return `<li>
    <button type="button" data-id="${esc(p.id)}" class="glass-soft flex w-full items-stretch overflow-hidden rounded-2xl text-left hover:border-sky-300 ${stage === 2 ? 'opacity-60' : ''}">
      <span class="t${level} w-2 shrink-0" aria-hidden="true"></span>
      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span class="min-w-0 flex-1">
          <span class="block truncate text-base font-bold">${esc(p.last_name)} ${esc(p.first_name)}</span>
          <span class="block truncate text-sm text-slate-600">${esc([p.birth_date && ageOf(p.birth_date), vit].filter(Boolean).join(' · ')) || 'Paramètres à relever'}</span>
        </span>
        ${stageBadge}
        <span class="tb${level} rounded-lg px-2 py-0.5 text-xs font-bold">${T_LABEL[level]}</span>
        ${store.isPending(p.id) ? '<span class="spinner size-4 text-slate-400" aria-label="Enregistrement"></span>' : ''}
      </span>
    </button></li>`;
}

function renderList() {
  const [dot, label] = STATUS[store.state.status] || STATUS.connecting;
  $('status').innerHTML = `<span class="size-2.5 rounded-full ${dot}" aria-hidden="true"></span><span class="sr-only sm:not-sr-only">${label}</span>`;
  $('status').title = label;

  const q = normalize(filters.q);
  const all = store.all().map((p) => ({ p, level: triage(p).level }));
  const scount = { 0: 0, 1: 0, 2: 0 };
  let waitSum = 0;
  for (const { p } of all) {
    scount[p.stage ?? 0]++;
    if (!(p.stage ?? 0)) waitSum += waitMin(p);
  }
  $('metrics').textContent = scount[0] ? `${scount[0]} en attente · attente moy. ${fmtWait(Math.round(waitSum / scount[0]))}` : '';
  // Recherche : ignore le filtre d'étape (retrouver aussi un patient terminé).
  const items = all.filter(({ p }) => {
    const st = p.stage ?? 0;
    if (q || filters.stage === 'all') return true;
    return filters.stage === 'active' ? st < 2 : String(st) === filters.stage;
  });
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const { p, level } of items) {
    counts[level]++;
  }

  $('f-stage').innerHTML = chipsHtml('stage', [
    ['active', 'À traiter', scount[0] + scount[1]],
    ['0', 'En attente', scount[0]],
    ['1', 'En consultation', scount[1]],
    ['2', 'Terminés', scount[2]],
    ['all', 'Tous', all.length],
  ]);
  $('f-triage').innerHTML = chipsHtml('triage', [
    ['all', 'Toutes couleurs', items.length],
    ['3', 'Rouge', counts[3]],
    ['2', 'Orange', counts[2]],
    ['0', 'À mesurer', counts[0]],
    ['1', 'Vert', counts[1]],
  ]);

  const visible = items
    .filter(({ p, level }) => {
      if (filters.triage !== 'all' && String(level) !== filters.triage) return false;
      if (!q) return true;
      return normalize(`${p.last_name} ${p.first_name}`).includes(q) || normalize(`${p.first_name} ${p.last_name}`).includes(q) ;
    })
    // En attente d'abord (priorité clinique puis ancienneté), puis en consultation, puis terminés.
    .sort((a, b) => (a.p.stage ?? 0) - (b.p.stage ?? 0) || T_RANK[a.level] - T_RANK[b.level] || a.p.created_at - b.p.created_at);
  nextId = visible.find(({ p }) => !(p.stage ?? 0))?.p.id ?? null;
  $('next').disabled = !nextId;

  $('list').innerHTML = visible.slice(0, MAX_ROWS).map(({ p, level }) => rowHtml(p, level)).join('');
  $('list-state').textContent =
    store.state.status === 'connecting' && !all.length
      ? 'Chargement…'
      : !visible.length
        ? q || filters.triage !== 'all'
          ? 'Aucun résultat'
          : all.length
            ? 'Personne en attente 🎉'
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

/* ---------- Patient suivant ---------- */
let nextId = null;
$('next').addEventListener('click', () => {
  if (!nextId) return;
  const id = nextId;
  store.patch(id, { stage: 1 }); // « appelé » : visible instantanément par les collègues
  openSheet(id);
});
setInterval(() => document.visibilityState === 'visible' && renderList(), 30000); // temps d'attente à jour

/* ---------- Soignant / praticien qui encode (retenu le temps de la session, effacé au verrouillage) ---------- */
const PRAC = 'cs-praticien';
const practitioner = () => {
  try {
    return sessionStorage.getItem(PRAC) || '';
  } catch {
    return '';
  }
};
const setPractitioner = (v) => {
  try {
    v ? sessionStorage.setItem(PRAC, v) : sessionStorage.removeItem(PRAC);
  } catch {
    /* stockage indisponible : le nom sera redemandé */
  }
};
/** Toute saisie de paramètres est enregistrée au nom du soignant (jamais sans nom). */
const encode = (id, fields) => practitioner() && store.patch(id, { ...fields, practitioner: practitioner() });

/* ---------- Fiche patient ---------- */
let sheetId = null;
const VITAL_FIELDS = [
  ['pulse', 'Pouls', 'bpm', 'numeric'],
  ['rr', 'Respiration', '/min', 'numeric'],
  ['spo2', 'SpO2', '%', 'numeric'],
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
        <p class="text-sm text-slate-600">${p.birth_date ? `${esc(ageOf(p.birth_date))} · né(e) le ${esc(p.birth_date.split('-').reverse().join('/'))}` : ''}</p>
        <p id="sheet-email" class="truncate text-sm text-slate-500"></p>
      </div>
      <button class="btn-ghost min-h-11 px-3" type="button" data-close aria-label="Fermer">✕</button>
    </div>
    <div class="space-y-5 p-4">
      <div class="grid grid-cols-3 gap-2" id="sheet-stage" role="group" aria-label="Étape du parcours">
        ${[0, 1, 2].map((st) => `<button type="button" data-stage="${st}" class="btn-ghost min-h-12 px-2 text-sm aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white">${STAGE[st]}</button>`).join('')}
      </div>
      <section class="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-labelledby="sheet-prac-l">
        <label id="sheet-prac-l" class="label" for="sheet-prac">Soignant / praticien qui encode <span class="text-red-700">(obligatoire)</span></label>
        <input id="sheet-prac" class="field py-2.5 text-base" maxlength="80" autocomplete="name" autocapitalize="words" placeholder="Votre nom et prénom" aria-describedby="sheet-prac-help" value="${esc(practitioner())}">
        <p id="sheet-prac-help" class="mt-1 text-xs text-slate-600" aria-live="polite"></p>
      </section>
      <div id="sheet-triage" class="rounded-2xl p-4" role="status" aria-live="polite"></div>
      <fieldset id="sheet-enc" class="m-0 min-w-0 space-y-5 border-0 p-0 transition-opacity disabled:pointer-events-none disabled:opacity-40">
        <legend class="sr-only">Paramètres (après avoir indiqué votre nom)</legend>
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
      <section aria-labelledby="h-alerts">
        <h3 id="h-alerts" class="mb-2 text-sm font-bold tracking-wide text-red-700 uppercase">Signes d’alerte → 112</h3>
        <div class="flex flex-wrap gap-2" id="sheet-alerts">
          ${Object.entries(ALERTS).map(([k, label]) => `<button type="button" data-alert="${k}" aria-pressed="false" class="rounded-full border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-800 aria-pressed:border-red-700 aria-pressed:bg-red-700 aria-pressed:text-white">${esc(label)}</button>`).join('')}
          ${Object.entries(CONTEXTS).map(([k, label]) => `<button type="button" data-alert="${k}" aria-pressed="false" class="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 aria-pressed:border-slate-900 aria-pressed:bg-slate-900 aria-pressed:text-white">${esc(label)}</button>`).join('')}
        </div>
      </section>
      <div id="sheet-advice"></div>
      <section>
        <label class="label" for="v-notes">Notes cliniques</label>
        <textarea id="v-notes" data-k="notes" rows="4" maxlength="${NOTES_MAX}" class="field text-base"></textarea>
      </section>
      </fieldset>
      <section id="sheet-consent" class="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200" aria-label="Transmission au médecin traitant"></section>
      <div class="flex items-center justify-between gap-3 pt-2">
        <p id="sheet-save" class="text-sm font-semibold text-slate-500" aria-live="polite"></p>
        <button type="button" id="sheet-delete" class="btn-danger min-h-11 text-sm">Mettre à la corbeille</button>
      </div>
    </div>`;
  sheetDetail = null;
  refreshSheet(true);
  openDialog($('sheet'));
  loadDetail(id);
  if (!practitioner()) $('sheet-prac').focus();
  else if (!matchMedia('(pointer: coarse)').matches) $('v-pulse').focus();
}

let sheetDetail = null; // { gp: {gp_name, gp_contact, gp_address}, proof } : chargé à l'ouverture (jamais diffusé aux autres tablettes)
async function loadDetail(id) {
  try {
    const { patient: d, proof } = await api(`/staff/patients/${id}`);
    if (sheetId !== id) return;
    $('sheet-email').textContent = [d.email, d.phone].filter(Boolean).join(' · ');
    sheetDetail = { gp: { no_gp: d.no_gp ? 1 : 0, gp_name: d.gp_name ?? null, gp_contact: d.gp_contact ?? null, gp_email: d.gp_email ?? null, gp_address: d.gp_address ?? null }, remark: d.staff_remark ?? '', proof };
    const p = store.view(id);
    if (p) renderConsent(p);
  } catch {
    /* détail non critique */
  }
}

const fmtDT = (ms) => new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Encadré « Transmission au médecin traitant » : statut, preuve horodatée, nom du médecin, fiche PDF. */
function renderConsent(p, force = false) {
  const box = $('sheet-consent');
  const d = sheetDetail;
  const t = d?.proof?.transmission;
  const key = `${p.doctor_consent}|${t ? `${t.at}|${t.v}` : ''}|${d ? JSON.stringify(d.gp) + d.remark : ''}`;
  if (!force && box.dataset.state === key) return;
  if (box.contains(document.activeElement) && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return; // saisie en cours
  box.dataset.state = key;
  const when = t
    ? `<p class="mt-1 text-xs text-slate-600">${t.v ? 'Accord' : 'Refus ou retrait'} enregistré le ${esc(fmtDT(t.at))} · ${esc(t.channel)}${t.legacy ? ' (inscription antérieure à la preuve détaillée)' : ''}${d.proof.intact ? '' : ' · <b class="text-red-700">intégrité non vérifiée</b>'}</p>`
    : '';
  box.innerHTML = p.doctor_consent
    ? `<p class="font-bold text-slate-800">Transmission au médecin traitant : <span class="text-emerald-700">autorisée</span></p>${when}
      <fieldset class="mt-3 space-y-2">
        <legend class="text-sm font-bold text-slate-800">Médecin traitant <span class="font-normal text-slate-500">(saisi par le soignant)</span></legend>
        <label class="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <input type="checkbox" id="sheet-nogp" data-nogp class="size-5 shrink-0 accent-sky-700" ${d?.gp.no_gp ? 'checked' : ''}>
          <span class="text-sm font-semibold text-slate-800">Le participant n’a pas de médecin traitant</span>
        </label>
        ${d?.gp.no_gp ? '<p class="text-sm text-slate-600">Pas de médecin traitant : notez dans la remarque ci-dessous le médecin choisi par le participant, le cas échéant.</p>' : `
        <div><label class="label" for="sheet-gp-name">Nom et prénom</label>
          <input id="sheet-gp-name" data-gp="gp_name" class="field py-2.5 text-base" maxlength="80" autocomplete="off" autocapitalize="words" placeholder="Dr Prénom Nom" value="${esc(d?.gp.gp_name ?? '')}"></div>
        <div class="grid gap-2 sm:grid-cols-2">
          <div><label class="label" for="sheet-gp-contact">Téléphone</label>
            <input id="sheet-gp-contact" data-gp="gp_contact" type="tel" inputmode="tel" class="field py-2.5 text-base" maxlength="200" autocomplete="off" placeholder="04 …" value="${esc(d?.gp.gp_contact ?? '')}"></div>
          <div><label class="label" for="sheet-gp-email">E-mail</label>
            <input id="sheet-gp-email" data-gp="gp_email" type="email" inputmode="email" class="field py-2.5 text-base" maxlength="254" autocomplete="off" placeholder="cabinet@…" value="${esc(d?.gp.gp_email ?? '')}"></div>
        </div>
        <div><label class="label" for="sheet-gp-address">Adresse du cabinet</label>
          <textarea id="sheet-gp-address" data-gp="gp_address" rows="2" maxlength="300" class="field py-2.5 text-base" autocomplete="off" placeholder="Rue, n°, code postal, commune">${esc(d?.gp.gp_address ?? '')}</textarea></div>`}
      </fieldset>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-consent="0" class="btn-danger min-h-10 py-2 text-sm">Retrait de l’autorisation</button>
      </div>`
    : `<p class="font-bold text-slate-800">Transmission au médecin traitant : <span class="text-red-700">non autorisée</span></p>${when}
      <p class="mt-1 text-slate-600">La consultation reste possible ; aucune fiche ne peut être transmise au médecin traitant.</p>
      <button type="button" data-consent="1" class="btn-ghost mt-3 min-h-10 py-2 text-sm">Le participant donne son accord</button>`;
  // Remarque du soignant sur le dossier (lue par l'administration, qui envoie la fiche au médecin depuis /admin).
  box.insertAdjacentHTML(
    'beforeend',
    `<div class="mt-4 border-t border-slate-200 pt-3">
      <label class="label" for="sheet-remark">Remarque sur le dossier <span class="font-normal text-slate-500">(pour l’administration)</span></label>
      <textarea id="sheet-remark" data-remark rows="3" maxlength="1000" class="field text-base" placeholder="Ex. : souhaite que la fiche soit envoyée au Dr …, à rappeler, information utile…">${esc(d?.remark ?? '')}</textarea>
      <p class="mt-1 text-xs text-slate-500">La fiche pour le médecin traitant est envoyée par l’administration.</p>
    </div>`,
  );

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
  renderConsent(p, force);
  // Saisie bloquée tant que le soignant n'a pas indiqué son nom.
  const who = practitioner();
  $('sheet-enc').disabled = !who;
  $('sheet-prac-help').innerHTML = (who
    ? `Les paramètres sont enregistrés au nom de <b>${esc(who)}</b>.`
    : '<b class="text-red-700">Indiquez votre nom pour pouvoir encoder les paramètres.</b>') + (p.practitioner ? ` Déjà encodé par : ${esc(p.practitioner)}.` : '');
  for (const b of $('sheet-stage').children) b.setAttribute('aria-pressed', String((p.stage ?? 0) === Number(b.dataset.stage)));
  const pv = previewValues(p);
  const al = parseAlerts(p.alerts);
  for (const btn of $('sheet-alerts').children) btn.setAttribute('aria-pressed', String(al.has(btn.dataset.alert)));
  const an = analyse(pv);
  renderAnalysis(an);
  if (an.level !== 'incomplet')
    $('sheet-triage').insertAdjacentHTML('beforeend', `<p class="mt-2 text-sm font-extrabold">${esc(an.label)} <a href="#sheet-advice" class="font-semibold underline">voir l’analyse ↓</a></p>`);
  const b = bmi(pv.weight, pv.height);
  $('sheet-bmi').textContent = b == null ? '' : `IMC : ${String(b).replace('.', ',')} kg/m² (normal 18,5–24,9)`;
  $('sheet-save').textContent = store.isPending(sheetId) ? (store.state.status === 'offline' ? 'Hors ligne : sera envoyé…' : 'Enregistrement…') : 'Enregistré ✓';
}

/* ---------- Analyse indicative (assistant éducatif) ---------- */
const TONE = {
  red: 'bg-red-700 text-white',
  orange: 'bg-amber-100 text-amber-950 ring-1 ring-amber-300',
  green: 'bg-emerald-100 text-emerald-950 ring-1 ring-emerald-300',
  grey: 'bg-slate-100 text-slate-800',
};
const DOT = { urgence: 'text-red-700', urgence_medicale: 'text-red-700', consultation: 'text-amber-700', surveillance: 'text-amber-700', rassurant: 'text-emerald-700' };
const cite = (ids, all) =>
  ids.map((id) => `<a href="#src-${id}" data-cite="${id}" class="ml-1 text-xs font-semibold whitespace-nowrap text-sky-800 underline">[${esc(all.find((x) => x.id === id)?.short ?? id)}]</a>`).join('');
const H = (n, t) => `<h4 class="mt-4 mb-1 text-sm font-bold text-slate-900">${n}. ${t}</h4>`;
function renderAnalysis(a) {
  const box = $('sheet-advice');
  const open = box.querySelector('details')?.open ?? false;
  box.innerHTML = `<section class="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label="Analyse indicative">
    <p class="text-xs font-bold tracking-wide text-slate-500 uppercase">Analyse indicative (assistant éducatif)</p>
    ${H(1, 'Note importante')}<p class="text-xs leading-snug text-slate-600">${esc(NOTE)}</p>
    ${H(2, 'Niveau d’urgence')}<p class="rounded-xl px-4 py-3 text-base font-extrabold ${TONE[a.tone]}">${esc(a.label)}</p>
    ${H(3, 'Ce que j’ai compris')}<p class="text-sm text-slate-700">${esc(a.understood)}</p>
    ${H(4, 'Interprétation indicative')}
    ${a.findings.length ? `<ul class="space-y-1.5 text-sm">${a.findings.map((f) => `<li class="flex gap-2"><span class="${DOT[f.lvl] ?? 'text-slate-500'}" aria-hidden="true">●</span><span>${esc(f.text)}${cite(f.src, a.sources)}</span></li>`).join('')}</ul>` : '<p class="text-sm text-slate-600">Aucune valeur en dehors des repères parmi les paramètres mesurés.</p>'}
    ${a.news2 ? `<p class="mt-1 text-xs text-slate-600">Score NEWS2 partiel : ${a.news2.score} (sur ${a.news2.n} paramètres disponibles)${cite(['NEWS2'], a.sources)}</p>` : ''}
    <p class="mt-2 text-xs text-slate-600">Une mesure isolée ne permet pas de conclure : elle doit être confirmée par une nouvelle mesure ou par un professionnel de santé. Les valeurs varient selon l’âge, les médicaments, le stress, l’effort, la fièvre et la méthode de mesure.</p>
    ${a.questions.length ? `<p class="mt-2 text-sm font-semibold text-slate-800">À préciser :</p><ul class="list-disc pl-5 text-sm text-slate-700">${a.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul>` : ''}
    ${H(5, 'Ce qu’il faut faire maintenant')}<ol class="list-decimal space-y-1 pl-5 text-sm">${a.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    ${a.tips.length ? `<p class="mt-2 text-sm font-semibold text-slate-800">Bien refaire la mesure :</p><ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">${a.tips.map((t) => `<li>${esc(t.text)}${cite(t.src, a.sources)}</li>`).join('')}</ul>` : ''}
    ${a.prevention.length ? `<p class="mt-2 text-sm font-semibold text-slate-800">Prévention selon l’âge :</p><ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">${a.prevention.map((t) => `<li>${esc(t.text)}${cite(t.src, a.sources)}</li>`).join('')}</ul>` : ''}
    ${H(6, 'Quand contacter un professionnel')}<ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">${a.when.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <details class="mt-4" ${open ? 'open' : ''}><summary class="cursor-pointer text-sm font-bold text-slate-900">7. Sources utilisées (${a.sources.length})</summary>
      <ul class="mt-2 space-y-2 text-xs text-slate-700">${a.sources
        .map((x) => `<li id="src-${x.id}" class="rounded-lg bg-slate-50 p-2"><b>${esc(x.institution)}</b> — ${esc(x.title)}${x.date ? ` — ${esc(x.date)}` : ''}${x.url ? `<br><a class="break-all text-sky-800 underline" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.url)}</a>` : ''}<br><span class="text-slate-600">${esc(x.info)}</span>${x.tier === 'INT' ? '<br><span class="text-slate-500">Référence internationale (aucune source belge officielle équivalente trouvée).</span>' : ''}</li>`)
        .join('')}</ul>
    </details>
    ${H(8, 'Rappel final')}<p class="text-xs leading-snug text-slate-600">${esc(RAPPEL)}</p>
  </section>`;
}
$('sheet').addEventListener('click', (e) => {
  const c = e.target.closest('[data-cite]');
  if (!c) return;
  e.preventDefault();
  const d = $('sheet-advice').querySelector('details');
  d.open = true;
  document.getElementById(`src-${c.dataset.cite}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('sheet').addEventListener('click', (e) => {
  const b = e.target.closest('[data-alert]');
  if (!b || !sheetId) return;
  const set = parseAlerts(store.view(sheetId).alerts);
  if (set.has(b.dataset.alert)) set.delete(b.dataset.alert);
  else set.add(b.dataset.alert);
  encode(sheetId, { alerts: [...set].join(',') || null });
  navigator.vibrate?.(40);
});

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
  if (k === 'notes') return encode(sheetId, { notes: input.value || null });
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
  encode(sheetId, { [k]: n });
});
$('sheet').addEventListener('keydown', (e) => {
  const input = e.target.closest('input[data-k]');
  if (e.key !== 'Enter' || !input) return;
  e.preventDefault();
  const all = [...$('sheet-body').querySelectorAll('[data-k]')];
  all[all.indexOf(input) + 1]?.focus();
});
$('sheet').addEventListener('click', (e) => {
  const st = e.target.closest('[data-stage]');
  if (st && sheetId) {
    const stage = Number(st.dataset.stage);
    store.patch(sheetId, { stage });
    if (stage === 2) {
      $('sheet').close(); // terminé : retour direct à la file
      toast('Patient terminé ✓', 'ok');
    }
  }
  if (e.target.closest('#sheet-delete') && sheetId) deleteCurrent();
  const c = e.target.closest('[data-consent]');
  if (c && sheetId) {
    const v = Number(c.dataset.consent);
    const msg = v
      ? `Le participant autorise-t-il la transmission de ses données personnelles à son médecin traitant ?\n\nTexte enregistré comme preuve, avec la date et l’heure :\n« ${CONSENT_TEXTS[CURRENT.transmission.staff]} »`
      : 'Confirmer le retrait de l’autorisation de transmission au médecin traitant ? Le retrait est daté et ajouté à la preuve.';
    if (confirm(msg)) {
      const id = sheetId;
      store.patch(id, { doctor_consent: v });
      setTimeout(() => sheetId === id && loadDetail(id), 1500); // preuve mise à jour (date, historique)
    }
  }
});
// Médecin traitant (nom, coordonnées) : saisi par le soignant, validé puis enregistré comme les autres champs.
// Remarque du soignant : enregistrée à la sortie du champ.
$('sheet').addEventListener('change', (e) => {
  if (!e.target.matches('[data-remark]') || !sheetId) return;
  const { ok, errors, value } = validatePatch({ staff_remark: e.target.value });
  e.target.setAttribute('aria-invalid', String(!ok));
  if (!ok) return toast(errors.staff_remark, 'error');
  if (sheetDetail) sheetDetail.remark = value.staff_remark ?? '';
  store.patch(sheetId, { staff_remark: value.staff_remark });
  toast('Remarque enregistrée ✓', 'ok');
});
// « Pas de médecin traitant » : coordonnées effacées (la fiche reste disponible côté administration).
$('sheet').addEventListener('change', (e) => {
  if (!e.target.matches('[data-nogp]') || !sheetId) return;
  const v = e.target.checked ? 1 : 0;
  if (sheetDetail) sheetDetail.gp = v ? { no_gp: 1, gp_name: null, gp_contact: null, gp_email: null, gp_address: null } : { ...sheetDetail.gp, no_gp: 0 };
  store.patch(sheetId, { no_gp: v });
  e.target.blur();
  renderConsent(store.view(sheetId), true);
  toast(v ? 'Noté : pas de médecin traitant' : 'Médecin traitant à renseigner', 'ok');
});
$('sheet').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'sheet-prac') e.target.blur(); // valide le nom
});
// Nom du soignant qui encode : validé, retenu pour la session.
$('sheet').addEventListener('change', (e) => {
  if (e.target.id !== 'sheet-prac') return;
  const v = e.target.value.trim();
  const { ok, errors, value } = validatePatch({ practitioner: v });
  e.target.setAttribute('aria-invalid', String(!!v && !ok));
  if (v && !ok) return toast(errors.practitioner, 'error');
  setPractitioner(v ? value.practitioner : '');
  e.target.value = practitioner();
  refreshSheet(true);
  if (practitioner() && !matchMedia('(pointer: coarse)').matches) $('v-pulse').focus();
});
$('sheet').addEventListener('change', (e) => {
  const k = e.target.dataset?.gp;
  if (!k || !sheetId) return;
  const v = e.target.value.trim() || null;
  const { ok, errors, value } = validatePatch({ [k]: v });
  e.target.setAttribute('aria-invalid', String(!ok));
  if (!ok) return toast(errors[k], 'error');
  if (sheetDetail) sheetDetail.gp[k] = value[k];
  store.patch(sheetId, { [k]: value[k] });
  toast('Médecin traitant enregistré ✓', 'ok');
});
$('sheet').addEventListener('close', () => {
  sheetId = null;
  store.flush();
  if (location.hash) history.replaceState(null, '', location.pathname);
});

async function deleteCurrent() {
  const p = store.view(sheetId);
  if (!confirm(`Mettre ${p.first_name} ${p.last_name} à la corbeille ? Le dossier disparaît de la liste (restaurable depuis la page admin).`)) return;
  const btn = $('sheet-delete');
  btn.disabled = true;
  try {
    await api(`/staff/patients/${p.id}`, { method: 'DELETE' });
    store.merge({ id: p.id, version: p.version + 1, deleted_at: Date.now() });
    sheetId = null;
    $('sheet').close();
    toast('Mis à la corbeille', 'ok');
  } catch {
    btn.disabled = false;
    toast('Suppression impossible, réessayez', 'error');
  }
}

store.state.onRejected = (id, e) => {
  toast(e.status === 404 ? 'Dossier supprimé entre-temps' : e.status === 409 ? 'Accord de transmission au médecin traitant requis' : 'Valeur refusée par le serveur', 'error');
};

/* ---------- Ajout manuel ---------- */
let lastCreated = null;
$('add-fields').innerHTML = identityFieldsHtml('a', { staff: true });
bindIdentityForm($('add-form'), async (payload) => {
  const { patient } = await api('/staff/patients', { method: 'POST', body: payload });
  store.merge(patient);
  lastCreated = patient.id;
  $('add-pass').innerHTML = `<p class="rounded-2xl bg-emerald-50 p-5 text-center text-lg font-bold text-emerald-900 ring-1 ring-emerald-200">✓ ${esc(patient.first_name)} ${esc(patient.last_name)} est inscrit(e).</p>`;
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

/* ---------- Bilan de l'événement (anonyme) ---------- */
const pct = (n, t) => (t && typeof n === 'number' ? Math.round((100 * n) / t) : 0);
const pctTxt = (n, t) => (t ? `${pct(n, t)} %` : '–');
const bar = (label, n, t, cls = 'bg-sky-700') => `
  <div class="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-sm">
    <span class="truncate text-slate-700">${label}</span>
    <span class="h-3 rounded-full bg-slate-100"><span class="block h-3 rounded-full ${cls}" data-w="${pct(n, t)}"></span></span>
    <span class="text-right font-bold tabular-nums">${n || 0}</span>
  </div>`;
const TRI = { 0: ['À mesurer', 'bg-slate-400'], 1: ['Vert', 'bg-emerald-600'], 2: ['Orange', 'bg-amber-500'], 3: ['Rouge', 'bg-red-600'] };
const tile = (label, v) => `<div class="rounded-xl bg-slate-100 p-3"><p class="text-sm text-slate-600">${label}</p><p class="text-2xl font-black">${v}</p></div>`;
function eventHtml(e) {
  const sum = (o) => Object.values(o).reduce((a, n) => a + (typeof n === 'number' ? n : 0), 0);
  const at = sum(e.ages), tt = sum(e.triage), dmax = Math.max(1, ...e.per_day.map((x) => (typeof x.n === 'number' ? x.n : 0)));
  return `<section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-lg font-extrabold">Bilan de l’événement <span class="text-sm font-semibold text-slate-500">(anonyme)</span></h3>
      <a href="/api/staff/stats.csv" download class="btn-ghost min-h-10 px-3 py-2 text-sm">Exporter le bilan (CSV)</a>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      ${tile('Inscriptions', e.total)}${tile('Paramètres relevés', e.measured)}${tile('Parcours terminés', e.done)}${tile('Attente moy.', e.avg_wait_min != null ? `${e.avg_wait_min} min` : '–')}
      ${tile('Via QR / accueil', `${e.self} / ${e.staff}`)}${tile('Accord médecin', `${e.consent_rate} %`)}${tile('Intérêt check-up', `${e.checkup_rate} %`)}
    </div>
    ${e.per_day.length ? `<div class="space-y-2"><h4 class="font-bold">Inscriptions par jour</h4>${e.per_day.map((x) => bar(x.d.split('-').reverse().join('/'), x.n, dmax)).join('')}</div>` : ''}
    ${at ? `<div class="space-y-2"><h4 class="font-bold">Tranches d’âge</h4>${Object.entries(e.ages).map(([k, n]) => bar(`${k} ans`, n, at)).join('')}</div>` : ''}
    ${tt ? `<div class="space-y-2"><h4 class="font-bold">Triage</h4>${Object.entries(e.triage).map(([k, n]) => bar(TRI[k]?.[0] ?? k, n, tt, TRI[k]?.[1])).join('')}</div>` : ''}
    <p class="text-xs text-slate-500">Chiffres agrégés et anonymes (groupes de moins de 5 personnes masqués « &lt;5 ») : utilisables librement pour rapports et présentations.</p>
  </section>`;
}

async function renderStats() {
  const box = $('stats-body');
  try {
    box.innerHTML = eventHtml(await api('/staff/stats'));
    for (const el of box.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`; // CSSOM : compatible CSP
  } catch {
    box.innerHTML = '<p class="py-10 text-center text-red-700">Statistiques indisponibles, réessayez.</p>';
  }
}
$('open-stats').addEventListener('click', () => {
  $('stats-body').innerHTML = '<p class="py-10 text-center text-slate-500"><span class="spinner"></span></p>';
  openDialog($('stats'));
  renderStats();
});

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
  setPractitioner(''); // le prochain soignant indiquera son nom
  store.lock();
  showGate();
});

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
}

api('/staff/session')
  .then(boot)
  .catch((e) => (e.status === 401 ? showGate() : boot()));

registerSW();
