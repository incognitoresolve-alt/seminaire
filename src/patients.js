import { bmi, triage } from '../web/shared/triage.js';
import { HttpError } from './http.js';

// Colonnes exposées au staff (sans email ni request_id : minimisation).
const COLS =
  'id,token,short_code,last_name,first_name,birth_date,source,doctor_consent,stage,stage_at,alerts,pulse,rr,spo2,temp,weight,height,waist,glucose,sys,dia,notes,triage,doctor,version,created_at,updated_at,deleted_at';
const DETAIL_COLS = `${COLS},email,phone,consent_at`;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I/L

const randomToken = () => {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const shortCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');

const byRequestId = (env, rid) => env.DB.prepare(`SELECT ${COLS} FROM patients WHERE request_id = ?`).bind(rid).first();

/** @returns {Promise<{row:object, created:boolean}>} */
export async function createPatient(env, v, source) {
  if (v.request_id) {
    const existing = await byRequestId(env, v.request_id);
    if (existing) return { row: existing, created: false };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const now = Date.now();
    try {
      const row = await env.DB.prepare(
        `INSERT INTO patients (id,token,short_code,request_id,last_name,first_name,birth_date,email,phone,consent_at,
           doctor_consent,source,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING ${COLS}`,
      )
        .bind(
          crypto.randomUUID(), randomToken(), shortCode(), v.request_id, v.last_name, v.first_name, v.birth_date, v.email, v.phone, now,
          v.doctor_consent ? 1 : 0, source, now, now,
        )
        .first();
      return { row, created: true };
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('UNIQUE')) throw e;
      if (msg.includes('request_id') && v.request_id) {
        const existing = await byRequestId(env, v.request_id); // double-clic concurrent
        if (existing) return { row: existing, created: false };
      }
      // collision token/short_code : nouvel essai
    }
  }
  throw new HttpError(503, 'retry');
}

export async function listSince(env, since, limit = 1000) {
  const { results } = await env.DB.prepare(`SELECT ${COLS} FROM patients WHERE updated_at >= ? ORDER BY updated_at LIMIT ?`).bind(since, limit).all();
  // Dossiers à la corbeille : seul l'identifiant part vers les tablettes (minimisation).
  return results.map((r) => (r.deleted_at ? { id: r.id, version: r.version, updated_at: r.updated_at, deleted_at: r.deleted_at } : r));
}

export const getDetail = (env, id) =>
  env.DB.prepare(`SELECT ${DETAIL_COLS} FROM patients WHERE id = ? AND deleted_at IS NULL`).bind(id).first();

export async function updatePatient(env, id, patch) {
  const now = Date.now();
  if ('stage' in patch) patch = { ...patch, stage_at: now }; // horodatage serveur de l'étape
  if (patch.doctor_consent === 0) patch = { ...patch, doctor: null }; // retrait : plus d'assignation à un médecin
  // Consentement exigé côté serveur pour toute assignation à un médecin.
  const needConsent = patch.doctor != null && patch.doctor_consent !== 1;
  const keys = Object.keys(patch); // whitelist garantie par validatePatch
  const row = await env.DB.prepare(
    `UPDATE patients SET ${keys.map((k) => `${k} = ?`).join(', ')}, version = version + 1, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL${needConsent ? ' AND doctor_consent = 1' : ''} RETURNING ${COLS}`,
  )
    .bind(...keys.map((k) => patch[k]), now, id)
    .first();
  if (!row) {
    if (needConsent && (await env.DB.prepare('SELECT 1 FROM patients WHERE id = ? AND deleted_at IS NULL').bind(id).first()))
      throw new HttpError(409, 'consent_required');
    throw new HttpError(404, 'not_found');
  }
  const level = triage(row).level;
  if (level === row.triage) return row;
  // Conditionnel sur la version : si une écriture plus récente est passée, c'est elle qui fait foi.
  await env.DB.prepare('UPDATE patients SET triage = ? WHERE id = ? AND version = ?').bind(level, id, row.version).run();
  return { ...row, triage: level };
}

/** Suppression par un soignant = mise à la corbeille (restaurable depuis /admin, effacement définitif après TRASH_DAYS). */
export async function deletePatient(env, id) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'UPDATE patients SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE id = ?2 AND deleted_at IS NULL RETURNING id, version, updated_at, deleted_at',
  )
    .bind(now, id)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

/* ---------- Corbeille (rôle admin) ---------- */
export async function listTrash(env) {
  const [trash, active, surveys] = await env.DB.batch([
    env.DB.prepare('SELECT id, last_name, first_name, birth_date, triage, created_at, deleted_at FROM patients WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 5000'),
    env.DB.prepare('SELECT COUNT(*) n FROM patients WHERE deleted_at IS NULL'),
    env.DB.prepare('SELECT COUNT(*) n FROM surveys'),
  ]);
  return { items: trash.results, active: active.results[0].n, surveys: surveys.results[0].n, trash_days: trashDays(env) };
}
const trashDays = (env) => Math.max(1, Number(env.TRASH_DAYS) || 30);
export async function restorePatient(env, id) {
  const now = Date.now();
  const row = await env.DB.prepare(`UPDATE patients SET deleted_at = NULL, updated_at = ?1, version = version + 1 WHERE id = ?2 AND deleted_at IS NOT NULL RETURNING ${COLS}`)
    .bind(now, id)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}
/** Effacement définitif (droit à l'effacement RGPD) : uniquement depuis la corbeille. */
export async function eraseFromTrash(env, id) {
  const r = await env.DB.prepare('DELETE FROM patients WHERE id = ? AND deleted_at IS NOT NULL').bind(id).run();
  if (!r.meta.changes) throw new HttpError(404, 'not_found');
}
export const clearSurveys = async (env) => (await env.DB.prepare('DELETE FROM surveys').run()).meta.changes;
export const emptyTrash = async (env) => (await env.DB.prepare('DELETE FROM patients WHERE deleted_at IS NOT NULL').run()).meta.changes;
export async function trashAll(env) {
  const now = Date.now();
  return (await env.DB.prepare('UPDATE patients SET deleted_at = ?1, updated_at = ?1, version = version + 1 WHERE deleted_at IS NULL').bind(now).run()).meta.changes;
}
export async function restoreAll(env) {
  const now = Date.now();
  return (await env.DB.prepare('UPDATE patients SET deleted_at = NULL, updated_at = ?1, version = version + 1 WHERE deleted_at IS NOT NULL').bind(now).run()).meta.changes;
}

/** Cron : corbeille vidée après TRASH_DAYS jours, dossiers effacés au-delà de la durée de conservation. */
export async function purge(env) {
  const days = Math.max(1, Number(env.RETENTION_DAYS) || 30);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM patients WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(now - trashDays(env) * 86400e3),
    env.DB.prepare('DELETE FROM patients WHERE created_at < ?').bind(now - days * 86400e3),
    env.DB.prepare('DELETE FROM surveys WHERE created_at < ?').bind(now - days * 86400e3),
    env.DB.prepare('DELETE FROM partner_leads WHERE created_at < ?').bind(now - Math.max(1, Number(env.LEADS_RETENTION_DAYS) || 180) * 86400e3),
  ]);
}

/* ---------- Questionnaire anonyme ---------- */
const SURVEY_FIELDS = ['weight', 'height', 'bmi', 'bmi_normal', 'waist', 'waist_normal_f', 'waist_normal_m', 'activity_freq', 'activity_minutes',
  'glucose_tested', 'glucose_normal', 'chol_known', 'vax_status', 'tetanus', 'screen_hours', 'questions'];

/** @returns {Promise<boolean>} true si créé (false = rejeu idempotent) */
export async function createSurvey(env, v) {
  const row = { ...v, bmi: bmi(v.weight, v.height) };
  const res = await env.DB.prepare(
    `INSERT INTO surveys (id,request_id,${SURVEY_FIELDS.join(',')},created_at) VALUES (?,?,${SURVEY_FIELDS.map(() => '?').join(',')},?)
     ON CONFLICT(request_id) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), v.request_id, ...SURVEY_FIELDS.map((k) => row[k] ?? null), Date.now())
    .run();
  return res.meta.changes > 0;
}

/** Agrégats uniquement (jamais de réponse individuelle hors questions libres). */
export async function surveyStats(env) {
  const [agg, freq, vax, qs] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) n, ROUND(AVG(bmi),1) bmi_avg,
      SUM(bmi < 18.5) bmi_low, SUM(bmi >= 18.5 AND bmi < 25) bmi_ok, SUM(bmi >= 25 AND bmi < 30) bmi_over, SUM(bmi >= 30) bmi_obese,
      ROUND(AVG(activity_minutes)) act_min_avg, SUM(activity_minutes >= 150) act_who,
      SUM(glucose_tested = 1) glu_yes, SUM(glucose_tested = 0) glu_no,
      SUM(chol_known = 1) chol_yes, SUM(chol_known = 0) chol_no,
      ROUND(AVG(screen_hours),1) screen_avg, SUM(screen_hours > 4) screen_high
      FROM surveys`),
    env.DB.prepare('SELECT activity_freq k, COUNT(*) n FROM surveys WHERE activity_freq IS NOT NULL GROUP BY activity_freq'),
    env.DB.prepare('SELECT vax_status k, COUNT(*) n FROM surveys WHERE vax_status IS NOT NULL GROUP BY vax_status'),
    env.DB.prepare("SELECT questions, created_at FROM surveys WHERE questions IS NOT NULL AND questions != '' ORDER BY created_at DESC LIMIT 100"),
  ]);
  return { ...agg.results[0], activity: freq.results, vax: vax.results, questions: qs.results };
}

/* ---------- Partenaire (table isolée) ---------- */
/** @returns {Promise<object|null>} la demande créée (null si rejeu idempotent) */
export async function createLead(env, v) {
  const now = Date.now();
  return env.DB.prepare(
    `INSERT INTO partner_leads (id,request_id,audience,name,email,phone,interests,message,consent_at,created_at,unsub_token)
     VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING RETURNING id,name,email,consent_at,unsub_token`,
  )
    .bind(crypto.randomUUID(), v.request_id, v.audience, v.name, v.email, v.phone, v.interests.join(',') || null, v.message, now, now, randomToken())
    .first();
}

/** Anti-doublon : un seul e-mail par adresse sur 7 jours (familles inscrites avec le même e-mail). */
export const alreadyMailed = async (env, email) =>
  !!(await env.DB.prepare('SELECT 1 FROM partner_leads WHERE email = ? AND mailed_at > ? LIMIT 1').bind(email, Date.now() - 7 * 86400e3).first());

export const markMailed = (env, id) => env.DB.prepare('UPDATE partner_leads SET mailed_at = ? WHERE id = ?').bind(Date.now(), id).run();

/* ---------- Espace partenaire (mini-CRM) ---------- */
const LEAD_COLS = 'id,audience,name,email,phone,interests,message,contact_time,status,partner_notes,consent_at,created_at,mailed_at';
export async function listLeads(env) {
  const { results } = await env.DB.prepare(`SELECT ${LEAD_COLS} FROM partner_leads ORDER BY created_at DESC LIMIT 5000`).all();
  return results;
}
export async function updateLead(env, id, patch) {
  const keys = Object.keys(patch); // whitelist garantie par validateLeadPatch
  const row = await env.DB.prepare(`UPDATE partner_leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? RETURNING ${LEAD_COLS}`)
    .bind(...keys.map((k) => patch[k]), Date.now(), id)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}
export async function deleteLead(env, id) {
  await env.DB.prepare('DELETE FROM partner_leads WHERE id = ?').bind(id).run();
}
/** Qualification par la personne elle-même (jeton secret reçu à la création de sa demande). */
export async function qualifyLead(env, t, v) {
  const row = await env.DB.prepare('SELECT interests FROM partner_leads WHERE unsub_token = ?').bind(t).first();
  if (!row) throw new HttpError(404, 'not_found');
  const interests = new Set((row.interests || '').split(',').filter(Boolean));
  if (v.interest) interests.add(v.interest);
  await env.DB.prepare('UPDATE partner_leads SET contact_time = COALESCE(?, contact_time), interests = ?, updated_at = ? WHERE unsub_token = ?')
    .bind(v.contact_time ?? null, [...interests].join(',') || null, Date.now(), t)
    .run();
}

/* ---------- Bilan anonyme de l'événement (agrégats uniquement) ---------- */
const K_MIN = 5; // groupes de moins de 5 personnes masqués : aucune ré-identification possible
const mask = (n) => (n > 0 && n < K_MIN ? '<5' : n);
export async function eventStats(env) {
  // Jours comptés en heure belge (UTC+1 en novembre).
  const [tot, days, ages, tri, docs, waits, leads, surveys] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) n, SUM(source='self') self, SUM(source='staff') staff, SUM(doctor_consent=1) consent,
      SUM(pulse IS NOT NULL OR temp IS NOT NULL OR sys IS NOT NULL OR glucose IS NOT NULL OR weight IS NOT NULL) measured,
      SUM(stage=2) done FROM patients WHERE deleted_at IS NULL`),
    env.DB.prepare(`SELECT date(created_at/1000,'unixepoch','+1 hour') d, COUNT(*) n FROM patients WHERE deleted_at IS NULL GROUP BY d ORDER BY d`),
    env.DB.prepare(`SELECT CASE WHEN a < 18 THEN '0-17' WHEN a < 40 THEN '18-39' WHEN a < 60 THEN '40-59' WHEN a < 75 THEN '60-74' ELSE '75+' END k, COUNT(*) n
      FROM (SELECT (strftime('%Y','now') - strftime('%Y', birth_date)) - (strftime('%m-%d','now') < strftime('%m-%d', birth_date)) a FROM patients WHERE deleted_at IS NULL AND birth_date != '')
      GROUP BY k ORDER BY k`),
    env.DB.prepare('SELECT triage k, COUNT(*) n FROM patients WHERE deleted_at IS NULL GROUP BY triage'),
    env.DB.prepare('SELECT doctor k, COUNT(*) n FROM patients WHERE deleted_at IS NULL AND doctor IS NOT NULL GROUP BY doctor'),
    env.DB.prepare('SELECT ROUND(AVG((stage_at - created_at)/60000.0)) avg_wait FROM patients WHERE deleted_at IS NULL AND stage >= 1 AND stage_at IS NOT NULL'),
    env.DB.prepare("SELECT COUNT(*) n, SUM(interests LIKE '%checkup%') checkup FROM partner_leads"),
    env.DB.prepare('SELECT COUNT(*) n FROM surveys'),
  ]);
  const t = tot.results[0];
  const kv = (r) => Object.fromEntries(r.results.map((x) => [x.k ?? 'inconnu', mask(x.n)]));
  return {
    total: t.n,
    self: mask(t.self || 0),
    staff: mask(t.staff || 0),
    consent_rate: t.n ? Math.round((100 * (t.consent || 0)) / t.n) : 0,
    measured: mask(t.measured || 0),
    done: mask(t.done || 0),
    per_day: days.results.map((x) => ({ d: x.d, n: mask(x.n) })),
    ages: kv(ages),
    triage: kv(tri),
    doctors: kv(docs),
    avg_wait_min: waits.results[0]?.avg_wait ?? null,
    checkup_rate: t.n ? Math.round((100 * (leads.results[0].checkup || 0)) / t.n) : 0,
    surveys: surveys.results[0].n,
  };
}

/** Désinscription = suppression immédiate des coordonnées. */
export const deleteLeadByToken = (env, t) => env.DB.prepare('DELETE FROM partner_leads WHERE unsub_token = ?').bind(t).run();
