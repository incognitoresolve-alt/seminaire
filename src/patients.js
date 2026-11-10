import { bmi, triage } from '../public/js/shared/triage.js';
import { HttpError } from './http.js';

// Colonnes exposées au staff (sans email ni request_id : minimisation).
const COLS =
  'id,token,short_code,last_name,first_name,birth_date,source,gp_consent,no_gp,pulse,temp,weight,height,waist,glucose,sys,dia,notes,triage,doctor,version,created_at,updated_at,deleted_at';
const DETAIL_COLS = `${COLS},email,phone,gp_name,gp_address,gp_contact,consent_at`;
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
           gp_consent,no_gp,gp_name,gp_address,gp_contact,source,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING ${COLS}`,
      )
        .bind(
          crypto.randomUUID(), randomToken(), shortCode(), v.request_id, v.last_name, v.first_name, v.birth_date, v.email, v.phone, now,
          v.gp_consent ? 1 : 0, v.no_gp ? 1 : 0, v.gp_name, v.gp_address, v.gp_contact, source, now, now,
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
  return results;
}

export const getDetail = (env, id) =>
  env.DB.prepare(`SELECT ${DETAIL_COLS} FROM patients WHERE id = ? AND deleted_at IS NULL`).bind(id).first();

export const lookup = (env, q) =>
  env.DB.prepare(`SELECT ${COLS} FROM patients WHERE (token = ?1 OR short_code = ?2) AND deleted_at IS NULL LIMIT 1`).bind(q, q.toUpperCase()).first();

export async function updatePatient(env, id, patch) {
  const keys = Object.keys(patch); // whitelist garantie par validatePatch
  const now = Date.now();
  const row = await env.DB.prepare(
    `UPDATE patients SET ${keys.map((k) => `${k} = ?`).join(', ')}, version = version + 1, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL RETURNING ${COLS}`,
  )
    .bind(...keys.map((k) => patch[k]), now, id)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  const level = triage(row).level;
  if (level === row.triage) return row;
  // Conditionnel sur la version : si une écriture plus récente est passée, c'est elle qui fait foi.
  await env.DB.prepare('UPDATE patients SET triage = ? WHERE id = ? AND version = ?').bind(level, id, row.version).run();
  return { ...row, triage: level };
}

/** Droit à l'effacement : données personnelles écrasées immédiatement, tombstone pour la synchro. */
export async function deletePatient(env, id) {
  const now = Date.now();
  const row = await env.DB.prepare(
    `UPDATE patients SET last_name='', first_name='', birth_date='', email='', phone=NULL, notes=NULL,
       gp_consent=0, no_gp=0, gp_name=NULL, gp_address=NULL, gp_contact=NULL,
       pulse=NULL, temp=NULL, weight=NULL, height=NULL, waist=NULL, glucose=NULL, sys=NULL, dia=NULL, doctor=NULL, triage=0,
       deleted_at = ?1, updated_at = ?1, version = version + 1
     WHERE id = ?2 AND deleted_at IS NULL RETURNING id, version, updated_at, deleted_at`,
  )
    .bind(now, id)
    .first();
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

/** Cron : purge des tombstones (> 1 j) et des dossiers au-delà de la durée de conservation. */
export async function purge(env) {
  const days = Math.max(1, Number(env.RETENTION_DAYS) || 30);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM patients WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(now - 86400e3),
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

export const markMailed = (env, id) => env.DB.prepare('UPDATE partner_leads SET mailed_at = ? WHERE id = ?').bind(Date.now(), id).run();

/** Désinscription = suppression immédiate des coordonnées. */
export const deleteLeadByToken = (env, t) => env.DB.prepare('DELETE FROM partner_leads WHERE unsub_token = ?').bind(t).run();
