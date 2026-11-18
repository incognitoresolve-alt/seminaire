// Fiche de transmission au médecin traitant : identité, mesures, notes et PREUVE de l'accord du participant.
// Accès ADMINISTRATION uniquement (clé ADMIN_KEY, page /admin → Envois) ; refus serveur sans accord de transmission (fail-closed).
import { api, esc } from './api.js';
import { EVENT_LINE, TITLE, ficheModel } from './shared/fiche-model.js';

const $ = (id) => document.getElementById(id);
const doc = $('doc');
const id = new URLSearchParams(location.search).get('id') || '';

const H = (t) => `<h2 class="mt-6 mb-2 print:mt-4 border-b-2 border-sky-800 pb-1 text-base font-extrabold tracking-wide text-sky-900 uppercase">${t}</h2>`;
const row = (k, v) => (v ? `<tr class="border-b border-slate-200"><th scope="row" class="w-2/5 py-1.5 pr-3 text-left align-top text-sm font-semibold text-slate-600">${k}</th><td class="py-1.5 text-sm">${v}</td></tr>` : '');

function render(data) {
  const m = ficheModel(data);
  document.title = m.docTitle;
  const rows = (list, strongFirst = false) => list.map(([k, v], i) => row(k, strongFirst && i === 0 ? `<b>${esc(v)}</b>` : esc(v))).join('');
  const INTEGRITY = { legacy: '<span class="text-slate-500">reconstitué</span>', ok: '<span class="font-semibold text-emerald-800">✓ vérifiée</span>', bad: '<span class="font-bold text-red-700">✗ altérée</span>' };
  const hist = m.history
    .map(
      (e) => `<tr class="border-b border-slate-200 align-top">
        <td class="py-1.5 pr-2 whitespace-nowrap">${esc(e.at)}</td>
        <td class="py-1.5 pr-2">${esc(e.kind)}</td>
        <td class="py-1.5 pr-2 font-semibold ${e.agreed ? 'text-emerald-800' : 'text-red-800'}">${esc(e.decision)}</td>
        <td class="py-1.5 pr-2">${esc(e.channel)}</td>
        <td class="py-1.5 whitespace-nowrap">${INTEGRITY[e.integrity]}</td>
      </tr>`,
    )
    .join('');

  doc.innerHTML = `
    <header class="flex flex-wrap items-start justify-between gap-4 border-b-4 border-sky-800 pb-4">
      <div class="flex items-center gap-3">
        <img src="/logo.svg" alt="" class="size-12" width="48" height="48">
        <div>
          <p class="text-2xl font-black">Check<span class="text-sky-700">Santé</span></p>
          <p class="text-xs font-semibold text-slate-600">${esc(EVENT_LINE)}</p>
        </div>
      </div>
      <p class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 ring-1 ring-red-200">Confidentiel · données de santé</p>
    </header>
    <h1 class="mt-5 print:mt-3 text-2xl font-extrabold">${esc(TITLE)}</h1>
    <p class="mt-1 text-sm text-slate-600">À l’attention de : <b class="text-slate-900">${esc(m.to)}</b></p>
    ${m.toContact.length ? `<p class="mt-0.5 text-sm whitespace-pre-line text-slate-600">${esc(m.toContact.join('\n'))}</p>` : ''}

    ${H('Patient')}
    <table class="w-full"><tbody>${rows(m.patient, true)}</tbody></table>

    ${H(esc(m.consultTitle))}
    <table class="w-full"><tbody>${rows(m.consult)}</tbody></table>
    ${m.notes ? `<p class="mt-3 text-sm font-semibold text-slate-600">Notes cliniques</p><p class="mt-1 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line ring-1 ring-slate-200">${esc(m.notes)}</p>` : ''}

    <section class="break-inside-avoid">
    ${H('Preuve de l’accord de transmission')}
    <div class="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 break-inside-avoid">
      <p class="font-bold text-emerald-900">✓ ${esc(m.consent.headline)}</p>
      ${m.consent.text ? `<p class="mt-2 text-sm"><span class="font-semibold">Texte accepté :</span> « ${esc(m.consent.text)} »</p><p class="mt-1 text-sm"><span class="font-semibold">Moyen :</span> ${esc(m.consent.channel)}</p>` : ''}
    </div>
    <div class="mt-3 overflow-x-auto print:overflow-visible" tabindex="0" role="region" aria-label="Historique des accords"><table class="w-full min-w-[34rem] text-xs break-inside-avoid print:min-w-0">
      <thead><tr class="border-b-2 border-slate-300 text-left"><th class="py-1.5 pr-2">Date et heure</th><th class="py-1.5 pr-2">Accord</th><th class="py-1.5 pr-2">Décision</th><th class="py-1.5 pr-2">Moyen</th><th class="py-1.5">Intégrité</th></tr></thead>
      <tbody>${hist}</tbody>
    </table></div>
    ${m.seal ? `<p class="mt-3 text-xs text-slate-700"><span class="font-semibold">Empreinte du dossier d’accord (SHA-256) :</span> <span class="font-mono break-all">${esc(m.seal)}</span> ${m.intact ? '<span class="font-semibold text-emerald-800">· intégrité vérifiée</span>' : '<span class="font-bold text-red-700">· ATTENTION : une entrée a été modifiée</span>'}</p>` : ''}
    <p class="mt-2 text-xs leading-snug text-slate-600">${esc(m.legal)}</p>
    </section>

    <footer class="mt-8 print:mt-4 border-t border-slate-200 pt-3 text-xs leading-snug text-slate-500">
      ${m.footer.map(esc).join('\n      ')}
    </footer>`;
  $('print').disabled = false;
}

function fail(msg) {
  doc.innerHTML = `<div class="py-12 text-center"><h1 class="text-lg font-bold text-slate-900">${msg}</h1><p class="mt-4"><a class="btn-primary" href="/admin">Administration</a></p></div>`;
}

$('print').addEventListener('click', () => print());
$('close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));

if (!/^[0-9a-f-]{36}$/.test(id)) fail('Fiche introuvable.');
else
  api(`/admin/patients/${id}/fiche`)
    .then(render)
    .catch((e) =>
      fail(
        e.status === 401
          ? 'Accès réservé à l’administration : connectez-vous sur /admin (clé ADMIN_KEY), onglet « Envois », puis rouvrez la fiche.'
          : e.status === 403
            ? 'Le participant n’a pas autorisé la transmission à son médecin traitant : aucune fiche ne peut être produite.'
            : e.status === 404
              ? 'Dossier introuvable (supprimé ou à la corbeille).'
              : 'Chargement impossible, réessayez.',
      ),
    );
