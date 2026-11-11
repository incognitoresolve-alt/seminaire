// Validation partagée client (UX) / serveur (sécurité).
import { LEAD_INTERESTS } from './partner.js';
const NAME_RE = /^[\p{L}\p{M}' .-]{1,80}$/u;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const VITALS = {
  pulse: { min: 20, max: 250, int: true, label: 'Pouls', unit: 'bpm' },
  rr: { min: 4, max: 80, int: true, label: 'Respiration', unit: '/min' },
  spo2: { min: 50, max: 100, int: true, label: 'SpO2', unit: '%' },
  temp: { min: 30, max: 45, dec: 1, label: 'Température', unit: '°C' },
  weight: { min: 1, max: 400, dec: 1, label: 'Poids', unit: 'kg' },
  height: { min: 50, max: 250, int: true, label: 'Taille', unit: 'cm' },
  waist: { min: 30, max: 250, int: true, label: 'Périmètre abdominal', unit: 'cm' },
  glucose: { min: 20, max: 600, int: true, label: 'Glycémie', unit: 'mg/dL' },
  sys: { min: 40, max: 300, int: true, label: 'Systolique', unit: 'mmHg' },
  dia: { min: 20, max: 200, int: true, label: 'Diastolique', unit: 'mmHg' },
};
export const NOTES_MAX = 2000;

export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** « JJ/MM/AAAA » (ou ISO) → « AAAA-MM-JJ » ; renvoie la saisie brute si non reconnue (=> erreur de validation). */
export function toIsoDate(s) {
  const t = String(s ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// Apostrophes typographiques (clavier iPhone : ’) ramenées à « ' » : N’Diaye == N'Diaye.
const cleanName = (s) => clean(s).replace(/[’‘ʼ`´]/g, "'");
// Texte libre : caractères de contrôle retirés (sauf saut de ligne si multiline), longueur bornée.
export const freeText = (s, max, multiline = false) => {
  const t = String(s ?? '').replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};
const PHONE_RE = /^[+0-9 ().\/-]{6,25}$/;

export function validateIdentity(b, now = new Date()) {
  const errors = {};
  const v = {
    last_name: cleanName(b?.last_name),
    first_name: cleanName(b?.first_name),
    birth_date: clean(b?.birth_date),
    email: clean(b?.email).toLowerCase(),
    phone: clean(b?.phone) || null,
    consent: b?.consent === true,
    doctor_consent: b?.doctor_consent,
    church_consent: b?.church_consent === true, // facultatif : rapport nominatif ICC Liège
    request_id: b?.request_id ? String(b.request_id) : null,
  };
  if (!NAME_RE.test(v.last_name)) errors.last_name = 'Nom invalide';
  if (!NAME_RE.test(v.first_name)) errors.first_name = 'Prénom invalide';
  if (!DATE_RE.test(v.birth_date)) {
    errors.birth_date = 'Date invalide (JJ/MM/AAAA)';
  } else {
    const d = new Date(`${v.birth_date}T00:00:00Z`);
    const ok = !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v.birth_date;
    if (!ok || d.getUTCFullYear() < 1900 || d > now) errors.birth_date = 'Date invalide (JJ/MM/AAAA)';
  }
  if (v.email.length > 254 || !EMAIL_RE.test(v.email)) errors.email = 'E-mail invalide';
  if (v.phone && !PHONE_RE.test(v.phone)) errors.phone = 'Téléphone invalide';
  if (!v.consent) errors.consent = 'Accord obligatoire pour la consultation';
  if (v.doctor_consent !== true && v.doctor_consent !== false) errors.doctor_consent = 'Choisissez une option';
  if (v.request_id && !UUID_RE.test(v.request_id)) errors.request_id = 'Identifiant invalide';
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/** Convertit une saisie (virgule acceptée) en nombre ou null. NaN si invalide. */
export function parseVital(key, raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(',', '.');
  if (s === '') return null;
  const rule = VITALS[key];
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return NaN;
  let n = Number(s);
  if (rule.int) n = Math.round(n);
  else n = Math.round(n * 10 ** rule.dec) / 10 ** rule.dec;
  return n >= rule.min && n <= rule.max ? n : NaN;
}

export function validatePatch(b) {
  const errors = {};
  const value = {};
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, errors: { _: 'Corps invalide' }, value };
  for (const [k, raw] of Object.entries(b)) {
    if (k in VITALS) {
      const n = raw === null ? null : typeof raw === 'number' ? parseVital(k, String(raw)) : NaN;
      if (Number.isNaN(n)) errors[k] = `${VITALS[k].label} hors limites (${VITALS[k].min}–${VITALS[k].max})`;
      else value[k] = n;
    } else if (k === 'notes') {
      if (raw === null || raw === '') value.notes = null;
      else if (typeof raw === 'string' && raw.length <= NOTES_MAX) value.notes = raw;
      else errors.notes = 'Notes trop longues';
    } else if (k === 'alerts') {
      // Liste fermée de signes d'alerte / contexte, séparés par des virgules.
      const ALLOWED = ['douleur_thoracique', 'essoufflement', 'malaise', 'confusion', 'avc', 'saignement', 'grossesse'];
      const list = raw === null || raw === '' ? [] : typeof raw === 'string' ? raw.split(',') : null;
      if (list && list.length <= ALLOWED.length && list.every((x) => ALLOWED.includes(x))) value.alerts = list.length ? [...new Set(list)].join(',') : null;
      else errors.alerts = 'Signes d’alerte invalides';
    } else if (k === 'stage') {
      if (raw === 0 || raw === 1 || raw === 2) value.stage = raw;
      else errors.stage = 'Étape invalide';
    } else if (k === 'doctor_consent') {
      if (raw === 0 || raw === 1) value.doctor_consent = raw;
      else errors.doctor_consent = 'Valeur invalide';
    } else if (k === 'gp_name') {
      // Médecin traitant : saisi par le soignant sur la fiche (jamais à l'inscription).
      const n = raw === null ? '' : typeof raw === 'string' ? cleanName(raw) : null;
      if (n === '') value.gp_name = null;
      else if (n && NAME_RE.test(n)) value.gp_name = n;
      else errors.gp_name = 'Nom du médecin traitant invalide';
    } else if (k === 'gp_contact' || k === 'gp_address') {
      const max = k === 'gp_contact' ? 200 : 300;
      if (raw === null || (typeof raw === 'string' && !raw.trim())) value[k] = null;
      else if (typeof raw === 'string' && raw.trim().length <= max) value[k] = freeText(raw, max, k === 'gp_address');
      else errors[k] = k === 'gp_contact' ? 'Coordonnées trop longues' : 'Adresse trop longue';
    } else if (k === 'church_consent') {
      if (raw === 0 || raw === 1) value.church_consent = raw;
      else errors.church_consent = 'Valeur invalide';
    } else if (k === 'doctor') {
      if (raw === null || raw === 1 || raw === 2) value.doctor = raw;
      else errors.doctor = 'Médecin invalide';
    } else {
      errors[k] = 'Champ inconnu';
    }
  }
  if (!Object.keys(value).length && !Object.keys(errors).length) errors._ = 'Aucun champ';
  return { ok: Object.keys(errors).length === 0, errors, value };
}



export const CONTACT_TIMES = { matin: 'Le matin', 'apres-midi': 'L’après-midi', soir: 'En soirée' };
export const LEAD_STATUS = { nouveau: 'Nouveau', contacte: 'Contacté', rdv: 'Rendez-vous', client: 'Client' };
const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;

/** Qualification facultative juste après l'accord (moment préféré, sujet) — dans le périmètre du consentement. */
export function validateLeadQualify(b) {
  const errors = {};
  const value = {};
  if (!TOKEN_RE.test(String(b?.t ?? ''))) errors.t = 'Jeton invalide';
  if (b?.contact_time !== undefined) {
    if (b.contact_time in CONTACT_TIMES) value.contact_time = b.contact_time;
    else errors.contact_time = 'Choix invalide';
  }
  if (b?.interest !== undefined) {
    if (['epargne_pension', 'deces', 'obseques'].includes(b.interest)) value.interest = b.interest;
    else errors.interest = 'Choix invalide';
  }
  if (!Object.keys(value).length && !errors.t) errors._ = 'Aucun champ';
  return { ok: Object.keys(errors).length === 0, errors, value, t: b?.t };
}

/** Mise à jour par le partenaire (statut de suivi, notes). */
export function validateLeadPatch(b) {
  const errors = {};
  const value = {};
  for (const [k, v] of Object.entries(b && typeof b === 'object' && !Array.isArray(b) ? b : {})) {
    if (k === 'status' && v in LEAD_STATUS) value.status = v;
    else if (k === 'partner_notes' && (v === null || (typeof v === 'string' && v.length <= NOTES_MAX))) value.partner_notes = v || null;
    else errors[k] = 'Champ invalide';
  }
  if (!Object.keys(value).length && !Object.keys(errors).length) errors._ = 'Aucun champ';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

/** Demande de contact partenaire (opt-in marketing distinct, aucune donnée de santé). */
export function validateLead(b) {
  const errors = {};
  const audience = b?.audience === 'pro' ? 'pro' : b?.audience === 'public' ? 'public' : null;
  const v = {
    audience,
    name: cleanName(b?.name),
    email: clean(b?.email).toLowerCase() || null,
    phone: clean(b?.phone) || null,
    interests: Array.isArray(b?.interests) ? [...new Set(b.interests.map(String))] : [],
    message: freeText(b?.message, 1000, true),
    consent: b?.consent === true,
    request_id: b?.request_id ? String(b.request_id) : null,
  };
  if (!audience) errors.audience = 'Choix invalide';
  if (!NAME_RE.test(v.name)) errors.name = 'Nom invalide';
  if (v.email && (v.email.length > 254 || !EMAIL_RE.test(v.email))) errors.email = 'E-mail invalide';
  if (v.phone && !PHONE_RE.test(v.phone)) errors.phone = 'Téléphone invalide';
  if (!v.email && !v.phone) errors.email = 'Indiquez un e-mail ou un téléphone';
  const allowed = audience ? Object.keys(LEAD_INTERESTS[audience]) : [];
  if (v.interests.length > allowed.length || v.interests.some((i) => !allowed.includes(i))) errors.interests = 'Choix invalide';
  if (!v.consent) errors.consent = 'Accord requis pour être recontacté';
  if (v.request_id && !UUID_RE.test(v.request_id)) errors.request_id = 'Identifiant invalide';
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

/* ---------- Remarques des intervenants (soignants, médecins, orateurs, bénévoles) ---------- */
export const FEEDBACK_ROLES = {
  soignant: 'Soignant(e) / infirmier(ère)',
  medecin: 'Médecin',
  intervenant: 'Intervenant(e) / orateur',
  benevole: 'Bénévole / accueil',
  organisation: 'Organisation',
  autre: 'Autre',
};
export const FEEDBACK_KINDS = { remarque: 'Remarque', proposition: 'Proposition', probleme: 'Problème rencontré', positif: 'Point positif' };
export const FEEDBACK_STATUS = { nouveau: 'Nouveau', lu: 'Lu', traite: 'Traité' };
export const FEEDBACK_MAX = 3000;
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); // Safari < 15.4 : pas d'Object.hasOwn

export function validateFeedback(b) {
  const errors = {};
  const v = {
    name: cleanName(b?.name) || null,
    role: typeof b?.role === 'string' ? b.role : '',
    kind: typeof b?.kind === 'string' ? b.kind : '',
    message: freeText(b?.message, FEEDBACK_MAX, true),
    contact: clean(b?.contact).slice(0, 254) || null,
    request_id: b?.request_id ? String(b.request_id) : null,
  };
  if (v.name && !NAME_RE.test(v.name)) errors.name = 'Nom invalide (lettres, espaces, tirets, apostrophes)';
  if (!has(FEEDBACK_ROLES, v.role)) errors.role = 'Choisissez votre rôle';
  if (!has(FEEDBACK_KINDS, v.kind)) errors.kind = 'Choisissez un type';
  if (!v.message || v.message.length < 3) errors.message = 'Écrivez votre remarque';
  if (v.contact && !(EMAIL_RE.test(v.contact.toLowerCase()) || PHONE_RE.test(v.contact))) errors.contact = 'E-mail ou téléphone invalide';
  if (v.contact && EMAIL_RE.test(v.contact.toLowerCase())) v.contact = v.contact.toLowerCase();
  if (!v.request_id || !UUID_RE.test(v.request_id)) errors.request_id = 'Identifiant invalide';
  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

export function validateFeedbackPatch(b) {
  const errors = {};
  const value = {};
  if (b && 'status' in b) {
    if (has(FEEDBACK_STATUS, b.status)) value.status = b.status;
    else errors.status = 'Statut invalide';
  }
  if (b && 'admin_notes' in b) value.admin_notes = freeText(b.admin_notes, 2000, true);
  if (!Object.keys(value).length && !Object.keys(errors).length) errors._ = 'Rien à modifier';
  return { ok: Object.keys(errors).length === 0, errors, value };
}
