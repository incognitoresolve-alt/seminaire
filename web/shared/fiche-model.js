// Contenu de la fiche de transmission (source unique) : page /fiche (HTML) ET PDF joint à l'e-mail.
import { formatHash } from './consent.js';
import { ALERTS, CONTEXTS, bmi, parseAlerts } from './triage.js';

export const dt = (ms) => new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const day = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
const num = (v, dec = 0) => (v === null || v === undefined ? '' : Number(v).toLocaleString('fr-BE', { maximumFractionDigits: dec }));
export const TRIAGE = ['À mesurer', 'Vert', 'Orange', 'Rouge'];
export const EVENT_LINE = 'Pôle santé · Séminaire spécial ICC Liège · 11 → 14 novembre 2026';
export const TITLE = 'Fiche de transmission au médecin traitant';

function age(iso, now) {
  const b = new Date(`${iso}T00:00:00`);
  return now.getFullYear() - b.getFullYear() - (now < new Date(now.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0);
}
const keep = (rows) => rows.filter(([, v]) => v);
// Lettres sans décomposition Unicode (polonais, langues africaines : ɛ, ɔ, ɓ, ɗ, ƙ, ŋ…) → équivalent latin.
export const FOLD = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', Ħ: 'H', ħ: 'h', ı: 'i', Ŋ: 'N', ŋ: 'n', Ɓ: 'B', ɓ: 'b', Ɗ: 'D', ɗ: 'd', Ƙ: 'K', ƙ: 'k', Ƴ: 'Y', ƴ: 'y', Ɛ: 'E', ɛ: 'e', Ɔ: 'O', ɔ: 'o', Ʋ: 'V', ʋ: 'v', Ɣ: 'G', ɣ: 'g' };
const ascii = (s) => [...String(s ?? '')].map((c) => FOLD[c] ?? c).join('').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Fiche structurée à partir de la réponse de /api/admin/patients/:id/fiche. */
export function ficheModel({ patient: p, proof, generated_at }, now = new Date()) {
  const b = bmi(p.weight, p.height);
  const vitals = keep([
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
  ]);
  const al = [...parseAlerts(p.alerts)].map((k) => ALERTS[k] || CONTEXTS[k] || k);
  const t = proof.transmission;
  return {
    fileName: `Fiche-${ascii(p.last_name)}-${ascii(p.first_name)}-${new Date(p.created_at).toISOString().slice(0, 10)}.pdf`,
    docTitle: `Fiche médecin traitant – ${p.last_name} ${p.first_name}`,
    to: p.gp_name || (p.no_gp ? 'médecin destinataire (le participant a indiqué ne pas avoir de médecin traitant)' : 'médecin traitant (nom non renseigné)'),
    toContact: [[p.gp_contact, p.gp_email].filter(Boolean).join(' · '), p.gp_address].filter(Boolean),
    patient: keep([
      ['Nom et prénom', `${p.last_name} ${p.first_name}`],
      ['Date de naissance', p.birth_date ? `${day(p.birth_date)} (${age(p.birth_date, now)} ans)` : ''],
      ['E-mail', p.email || ''],
      ['Téléphone', p.phone || ''],
    ]),
    consultTitle: `Consultation de prévention du ${dt(p.created_at).split(' ')[0]}`,
    consult: [
      ...(vitals.length ? vitals : [['Paramètres', 'Aucun paramètre relevé']]),
      ...keep([
        ['Signes d’alerte / contexte', al.join(' · ')],
        ['Priorité (triage indicatif)', p.triage ? TRIAGE[p.triage] || '' : ''],
        ['Paramètres relevés par', p.practitioner || ''],
      ]),
    ],
    triage: Number(p.triage) || 0,
    notes: p.notes || '',
    consent: {
      headline: `Le participant a autorisé la transmission de ses données à son médecin traitant${t ? ` le ${dt(t.at)}` : ''}.`,
      text: t?.text || '',
      channel: t?.channel || '',
    },
    history: proof.entries
      .filter((e) => e.k !== 'eglise') // ancien accord « rapport ICC » (fonction retirée) : sans objet pour le médecin traitant
      .map((e) => ({
        at: dt(e.at),
        kind: e.kind,
        agreed: Boolean(e.v),
        decision: e.v ? 'Accord' : e.k === 'transmission' ? 'Refus / retrait' : 'Refus',
        channel: e.channel,
        integrity: e.legacy ? 'legacy' : e.ok ? 'ok' : 'bad',
      })),
    seal: proof.seal ? formatHash(proof.seal, 64) : '',
    intact: Boolean(proof.intact),
    legal: `Accord recueilli électroniquement : signature électronique simple (règlement eIDAS, art. 3.10) et preuve du consentement (RGPD, art. 7.1 et 9.2.a). Chaque décision est horodatée par le serveur avec le texte exact présenté au participant ; l’empreinte SHA-256 permet de vérifier qu’aucune entrée n’a été modifiée.${proof.legacy ? ' Les entrées « reconstitué » proviennent d’une inscription antérieure à la preuve détaillée (date d’inscription et formulation alors en vigueur).' : ''}`,
    footer: [
      'Valeurs relevées lors d’une consultation de prévention bénévole : elles ne remplacent pas un examen médical.',
      'Document à transmettre uniquement au médecin traitant désigné, de préférence par messagerie sécurisée (eHealthBox).',
      `Généré le ${dt(generated_at)} · réf. ${p.short_code || ''}`,
    ],
  };
}
