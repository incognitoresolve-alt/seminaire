// Preuve des accords (RGPD art. 7.1 ; « signature électronique simple » au sens d'eIDAS art. 3.10) :
// texte exact accepté (versionné), date et heure serveur, moyen utilisé, historique et empreinte SHA-256.
// Une version de texte publiée n'est JAMAIS modifiée : toute nouvelle formulation = nouvelle clé.

export const CONSENT_TEXTS = {
  'C1-self': 'J’accepte librement de bénéficier de cette consultation et que les informations de santé nécessaires soient recueillies par le professionnel qui me reçoit (confidentialité).',
  'C1-staff': 'Le participant accepte librement la consultation et le recueil de ses informations de santé (formulaire papier signé ou accord explicite).',
  // Ancienne formulation (inscriptions antérieures au 11/11/2026, 10 h environ).
  'T1-self': 'J’autorise la transmission de mes données personnelles à un médecin qui pourra suivre mon dossier si nécessaire.',
  'T1-staff': 'Le participant autorise-t-il la transmission de ses données personnelles à un médecin qui pourra suivre son dossier si nécessaire ?',
  'T2-self': 'J’autorise la transmission de mes données personnelles à mon médecin traitant.',
  'T2-staff': 'Le participant autorise la transmission de ses données personnelles à son médecin traitant (formulaire papier signé ou accord explicite).',
  // Historique (fonction retirée le 11/11/2026) : conservé uniquement pour vérifier l'empreinte des accords déjà enregistrés.
  'E1-self': 'J’accepte que mes nom, prénom et numéro de GSM soient communiqués à ICC Liège, organisateur du séminaire, pour le suivi des personnes reçues au pôle santé (sans aucune mesure ni information médicale).',
  'E1-staff': 'Le participant accepte que ses nom, prénom et numéro de GSM soient communiqués à ICC Liège, organisateur du séminaire, pour le suivi des personnes reçues au pôle santé (sans aucune mesure ni information médicale).',
};

/** Versions affichées aujourd'hui, selon le canal. */
export const CURRENT = {
  consultation: { self: 'C1-self', staff: 'C1-staff' },
  transmission: { self: 'T2-self', staff: 'T2-staff' },
};

export const KINDS = { consultation: 'Consultation de prévention', transmission: 'Transmission au médecin traitant', eglise: 'Rapport à ICC Liège (fonction retirée)' };
export const CHANNELS = {
  self: 'Formulaire d’inscription en ligne : case cochée par le participant',
  staff: 'Inscription saisie par l’équipe soignante (formulaire papier signé ou accord explicite)',
  sheet: 'Fiche soignant : accord ou retrait exprimé par le participant et enregistré par l’équipe',
};

/** Contenu couvert par l'empreinte (ordre fixe, séparateur non ambigu). */
export const proofPayload = (pid, e) => [pid, e.k, e.v, e.at, e.ch, e.tv, CONSENT_TEXTS[e.tv] ?? ''].join('\u241f');

export async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Nouvelle entrée de preuve (k : consultation | transmission ; v : 1 accord, 0 refus ou retrait). */
export async function makeEntry(pid, k, v, ch, tv, at) {
  const e = { k, v: v ? 1 : 0, at, ch, tv };
  e.h = await sha256Hex(proofPayload(pid, e));
  return e;
}

export const verifyEntry = async (pid, e) => typeof e?.h === 'string' && e.h === (await sha256Hex(proofPayload(pid, e)));

/** Empreinte groupée par 4 pour la lecture (ex. « 3F9A 12C4 … »). */
export const formatHash = (h, n = 16) => String(h || '').slice(0, n).toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
