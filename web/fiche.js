// Fiche de transmission au médecin traitant : identité, mesures, notes et PREUVE de l'accord du participant.
// Accès soignants uniquement (cookie de session) ; refus serveur si la transmission n'est pas autorisée (fail-closed).
import { api, esc } from './api.js';
import { formatHash } from './shared/consent.js';
import { DOCTORS } from './shared/doctors.js';
import { ALERTS, CONTEXTS, bmi, parseAlerts } from './shared/triage.js';

const $ = (id) => document.getElementById(id);
const doc = $('doc');
const id = new URLSearchParams(location.search).get('id') || '';
const dt = (ms) => new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const num = (v, dec = 0) => (v === null || v === undefined ? '' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: dec }));
const TRIAGE = ['À mesurer', 'Vert', 'Orange', 'Rouge'];

function age(iso) {
  const b = new Date(`${iso}T00:00:00`);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}

const H = (t) => `<h2 class="mt-6 mb-2 print:mt-4 border-b-2 border-sky-800 pb-1 text-base font-extrabold tracking-wide text-sky-900 uppercase">${t}</h2>`;
const row = (k, v) => (v ? `<tr class="border-b border-slate-200"><th scope="row" class="w-2/5 py-1.5 pr-3 text-left align-top text-sm font-semibold text-slate-600">${k}</th><td class="py-1.5 text-sm">${v}</td></tr>` : '');

function render({ patient: p, proof, generated_at }) {
  document.title = `Fiche médecin traitant – ${p.last_name} ${p.first_name}`;
  const b = bmi(p.weight, p.height);
  const vit = [
    ['Tension artérielle', p.sys && p.dia ? `${p.sys}/${p.dia} mmHg` : ''],
    ['Pouls', p.pulse ? `${p.pulse} /min` : ''],
    ['Fréquence respiratoire', p.rr ? `${p.rr} /min` : ''],
    ['Saturation (SpO₂)', p.spo2 ? `${p.spo2} %` : ''],
    ['Température', p.temp ? `${num(p.temp, 1)} °C` : ''],
    ['Glycémie', p.glucose ? `${p.glucose} mg/dL` : ''],
    ['Poids', p.weight ? `${num(p.weight, 1)} kg` : ''],
    ['Taille', p.height ? `${p.height} cm` : ''],
    ['IMC', b ? `${num(b, 1)} kg/m²` : ''],
    ['Périmètre abdominal', p.waist ? `${p.waist} cm` : ''],
  ];
  const al = [...parseAlerts(p.alerts)].map((k) => ALERTS[k] || CONTEXTS[k] || k);
  const t = proof.transmission;
  const hist = proof.entries
    .map(
      (e) => `<tr class="border-b border-slate-200 align-top">
        <td class="py-1.5 pr-2 whitespace-nowrap">${esc(dt(e.at))}</td>
        <td class="py-1.5 pr-2">${esc(e.kind)}</td>
        <td class="py-1.5 pr-2 font-semibold ${e.v ? 'text-emerald-800' : 'text-red-800'}">${e.v ? 'Accord' : e.k === 'transmission' ? 'Refus / retrait' : 'Refus'}</td>
        <td class="py-1.5 pr-2">${esc(e.channel)}</td>
        <td class="py-1.5 whitespace-nowrap">${e.legacy ? '<span class="text-slate-500">reconstitué</span>' : e.ok ? '<span class="font-semibold text-emerald-800">✓ vérifiée</span>' : '<span class="font-bold text-red-700">✗ altérée</span>'}</td>
      </tr>`,
    )
    .join('');

  doc.innerHTML = `
    <header class="flex flex-wrap items-start justify-between gap-4 border-b-4 border-sky-800 pb-4">
      <div class="flex items-center gap-3">
        <img src="/logo.svg" alt="" class="size-12" width="48" height="48">
        <div>
          <p class="text-2xl font-black">Check<span class="text-sky-700">Santé</span></p>
          <p class="text-xs font-semibold text-slate-600">Pôle santé · Séminaire spécial ICC Liège · 11 → 14 novembre 2026</p>
        </div>
      </div>
      <p class="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 ring-1 ring-red-200">Confidentiel · données de santé</p>
    </header>
    <h1 class="mt-5 print:mt-3 text-2xl font-extrabold">Fiche de transmission au médecin traitant</h1>
    <p class="mt-1 text-sm text-slate-600">À l’attention de : <b class="text-slate-900">${p.gp_name ? esc(p.gp_name) : 'médecin traitant (nom non renseigné)'}</b></p>
    ${p.gp_contact || p.gp_address ? `<p class="mt-0.5 text-sm whitespace-pre-line text-slate-600">${esc([p.gp_contact, p.gp_address].filter(Boolean).join('\n'))}</p>` : ''}

    ${H('Patient')}
    <table class="w-full"><tbody>
      ${row('Nom et prénom', `<b>${esc(p.last_name)} ${esc(p.first_name)}</b>`)}
      ${row('Date de naissance', p.birth_date ? `${esc(day(p.birth_date))} (${age(p.birth_date)} ans)` : '')}
      ${row('E-mail', esc(p.email || ''))}
      ${row('Téléphone', esc(p.phone || ''))}
    </tbody></table>

    ${H(`Consultation de prévention du ${esc(dt(p.created_at).split(' ')[0])}`)}
    <table class="w-full"><tbody>
      ${vit.map(([k, v]) => row(k, esc(v))).join('') || row('Paramètres', 'Aucun paramètre relevé')}
      ${row('Signes d’alerte / contexte', al.length ? esc(al.join(' · ')) : '')}
      ${row('Priorité (triage indicatif)', p.triage ? esc(TRIAGE[p.triage] || '') : '')}
      ${row('Vu(e) par', p.doctor ? esc(DOCTORS[p.doctor]?.label || '') + ' (médecin de l’événement)' : '')}
    </tbody></table>
    ${p.notes ? `<p class="mt-3 text-sm font-semibold text-slate-600">Notes cliniques</p><p class="mt-1 rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-line ring-1 ring-slate-200">${esc(p.notes)}</p>` : ''}

    <section class="break-inside-avoid">
    ${H('Preuve de l’accord de transmission')}
    <div class="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 break-inside-avoid">
      <p class="font-bold text-emerald-900">✓ Le participant a autorisé la transmission de ses données à son médecin traitant${t ? ` le ${esc(dt(t.at))}` : ''}.</p>
      ${t ? `<p class="mt-2 text-sm"><span class="font-semibold">Texte accepté :</span> « ${esc(t.text)} »</p><p class="mt-1 text-sm"><span class="font-semibold">Moyen :</span> ${esc(t.channel)}</p>` : ''}
    </div>
    <div class="mt-3 overflow-x-auto print:overflow-visible" tabindex="0" role="region" aria-label="Historique des accords"><table class="w-full min-w-[34rem] text-xs break-inside-avoid print:min-w-0">
      <thead><tr class="border-b-2 border-slate-300 text-left"><th class="py-1.5 pr-2">Date et heure</th><th class="py-1.5 pr-2">Accord</th><th class="py-1.5 pr-2">Décision</th><th class="py-1.5 pr-2">Moyen</th><th class="py-1.5">Intégrité</th></tr></thead>
      <tbody>${hist}</tbody>
    </table></div>
    ${proof.seal ? `<p class="mt-3 text-xs text-slate-700"><span class="font-semibold">Empreinte du dossier d’accord (SHA-256) :</span> <span class="font-mono break-all">${esc(formatHash(proof.seal, 64))}</span> ${proof.intact ? '<span class="font-semibold text-emerald-800">· intégrité vérifiée</span>' : '<span class="font-bold text-red-700">· ATTENTION : une entrée a été modifiée</span>'}</p>` : ''}
    <p class="mt-2 text-xs leading-snug text-slate-600">Accord recueilli électroniquement : signature électronique simple (règlement eIDAS, art. 3.10) et preuve du consentement (RGPD, art. 7.1 et 9.2.a). Chaque décision est horodatée par le serveur avec le texte exact présenté au participant ; l’empreinte SHA-256 permet de vérifier qu’aucune entrée n’a été modifiée.${proof.legacy ? ' Les entrées « reconstitué » proviennent d’une inscription antérieure à la preuve détaillée (date d’inscription et formulation alors en vigueur).' : ''}</p>
    </section>

    <footer class="mt-8 print:mt-4 border-t border-slate-200 pt-3 text-xs leading-snug text-slate-500">
      Valeurs relevées lors d’une consultation de prévention bénévole : elles ne remplacent pas un examen médical.
      Document à transmettre uniquement au médecin traitant désigné, de préférence par messagerie sécurisée (eHealthBox).
      Généré le ${esc(dt(generated_at))} · réf. ${esc(p.short_code || '')}
    </footer>`;
  $('print').disabled = false;
}

function fail(msg) {
  doc.innerHTML = `<div class="py-12 text-center"><p class="text-lg font-bold text-slate-900">${msg}</p><p class="mt-4"><a class="btn-primary" href="/staff">Espace soignants</a></p></div>`;
}

$('print').addEventListener('click', () => print());
$('close').addEventListener('click', () => (history.length > 1 ? history.back() : window.close()));

if (!/^[0-9a-f-]{36}$/.test(id)) fail('Fiche introuvable.');
else
  api(`/staff/patients/${id}/fiche`)
    .then(render)
    .catch((e) =>
      fail(
        e.status === 401
          ? 'Accès réservé aux soignants : connectez-vous dans l’espace soignants, puis rouvrez la fiche.'
          : e.status === 403
            ? 'Le participant n’a pas autorisé la transmission à son médecin traitant : aucune fiche ne peut être produite.'
            : e.status === 404
              ? 'Dossier introuvable (supprimé ou à la corbeille).'
              : 'Chargement impossible, réessayez.',
      ),
    );
