// Schéma auto-appliqué au premier appel API de chaque instance (idempotent) :
// aucune manipulation manuelle de la console D1 n'est nécessaire.
import { HttpError } from './http.js';

const CREATE = [
  `CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_code TEXT NOT NULL UNIQUE, request_id TEXT UNIQUE,
    last_name TEXT NOT NULL, first_name TEXT NOT NULL, birth_date TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, consent_at INTEGER NOT NULL,
    gp_consent INTEGER NOT NULL DEFAULT 0, no_gp INTEGER NOT NULL DEFAULT 0, gp_name TEXT, gp_address TEXT, gp_contact TEXT,
    source TEXT NOT NULL CHECK (source IN ('self','staff')), pulse INTEGER, temp REAL, weight REAL, height INTEGER, waist INTEGER, glucose INTEGER,
    sys INTEGER, dia INTEGER, notes TEXT, triage INTEGER NOT NULL DEFAULT 0 CHECK (triage BETWEEN 0 AND 3), doctor INTEGER CHECK (doctor IN (1,2)),
    version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    stage INTEGER NOT NULL DEFAULT 0 CHECK (stage IN (0,1,2)), stage_at INTEGER,
    doctor_consent INTEGER NOT NULL DEFAULT 0 CHECK (doctor_consent IN (0,1)), rr INTEGER, spo2 INTEGER, alerts TEXT)`,
  'CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_patients_triage ON patients(triage DESC, updated_at DESC) WHERE deleted_at IS NULL',
  `CREATE TABLE IF NOT EXISTS partner_leads (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, audience TEXT NOT NULL CHECK (audience IN ('public','pro')),
    name TEXT NOT NULL, email TEXT, phone TEXT, interests TEXT, message TEXT, consent_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
    unsub_token TEXT, mailed_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS idx_leads_created ON partner_leads(created_at)',
  `CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, name TEXT, role TEXT NOT NULL, kind TEXT NOT NULL,
    message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu','traite')), admin_notes TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER)`,
  'CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at)',
];
// Colonnes ajoutées après coup : pour les bases créées par d'anciennes versions (erreur « duplicate column » ignorée).
const ALTER = [
  'ALTER TABLE patients ADD COLUMN stage INTEGER NOT NULL DEFAULT 0 CHECK (stage IN (0,1,2))',
  'ALTER TABLE patients ADD COLUMN stage_at INTEGER',
  'ALTER TABLE patients ADD COLUMN doctor_consent INTEGER NOT NULL DEFAULT 0 CHECK (doctor_consent IN (0,1))',
  'ALTER TABLE patients ADD COLUMN rr INTEGER',
  'ALTER TABLE patients ADD COLUMN spo2 INTEGER',
  'ALTER TABLE patients ADD COLUMN alerts TEXT',
  // Preuve des accords : date de la dernière décision de transmission + historique horodaté (JSON, empreintes SHA-256).
  'ALTER TABLE patients ADD COLUMN doctor_consent_at INTEGER',
  'ALTER TABLE patients ADD COLUMN consent_log TEXT',
  // Médecin traitant (saisi par le soignant) : colonnes présentes depuis la v1, garanties ici pour toute base.
  'ALTER TABLE patients ADD COLUMN gp_name TEXT',
  'ALTER TABLE patients ADD COLUMN gp_address TEXT',
  'ALTER TABLE patients ADD COLUMN gp_contact TEXT',
  // Accord facultatif : figurer dans le rapport nominatif d'ICC Liège (nom, prénom, GSM).
  'ALTER TABLE patients ADD COLUMN church_consent INTEGER NOT NULL DEFAULT 0 CHECK (church_consent IN (0,1))',
  'ALTER TABLE partner_leads ADD COLUMN unsub_token TEXT',
  'ALTER TABLE partner_leads ADD COLUMN mailed_at INTEGER',
  "ALTER TABLE partner_leads ADD COLUMN status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','contacte','rdv','client'))",
  "ALTER TABLE partner_leads ADD COLUMN contact_time TEXT CHECK (contact_time IN ('matin','apres-midi','soir'))",
  'ALTER TABLE partner_leads ADD COLUMN partner_notes TEXT',
  'ALTER TABLE partner_leads ADD COLUMN updated_at INTEGER',
];
const AFTER = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unsub ON partner_leads(unsub_token)',
  'CREATE INDEX IF NOT EXISTS idx_leads_email ON partner_leads(email, mailed_at)',
];

let ready = null;

async function apply(env) {
  await env.DB.batch(CREATE.map((q) => env.DB.prepare(q)));
  for (const q of ALTER) {
    try {
      await env.DB.prepare(q).run();
    } catch (e) {
      if (!/duplicate column/i.test(String(e?.message))) throw e;
    }
  }
  await env.DB.batch(AFTER.map((q) => env.DB.prepare(q)));
}

/** Fail-closed : si le schéma ne peut pas être appliqué, l'API répond 503 (et réessaie à l'appel suivant). */
export function ensureSchema(env) {
  ready ??= apply(env).catch((e) => {
    ready = null;
    console.error(JSON.stringify({ evt: 'schema_failed', err: String(e?.message).slice(0, 200) }));
    throw new HttpError(503, 'db_unavailable');
  });
  return ready;
}
