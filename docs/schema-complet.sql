-- CheckSanté : schéma complet en UN SEUL bloc (équivalent des migrations 0001 → 0004).
-- À coller une fois dans Cloudflare → D1 → seminaire → Console → Execute.
-- Sans risque si relancé (IF NOT EXISTS partout).
-- FACULTATIF : l'application crée et met à jour ses tableaux toute seule au premier accès.
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, short_code TEXT NOT NULL UNIQUE, request_id TEXT UNIQUE, last_name TEXT NOT NULL, first_name TEXT NOT NULL, birth_date TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, consent_at INTEGER NOT NULL, gp_consent INTEGER NOT NULL DEFAULT 0 CHECK (gp_consent IN (0,1)), no_gp INTEGER NOT NULL DEFAULT 0 CHECK (no_gp IN (0,1)), gp_name TEXT, gp_address TEXT, gp_contact TEXT, source TEXT NOT NULL CHECK (source IN ('self','staff')), pulse INTEGER, temp REAL, weight REAL, height INTEGER, waist INTEGER, glucose INTEGER, sys INTEGER, dia INTEGER, notes TEXT, triage INTEGER NOT NULL DEFAULT 0 CHECK (triage BETWEEN 0 AND 3), doctor INTEGER CHECK (doctor IN (1,2)), version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, stage INTEGER NOT NULL DEFAULT 0 CHECK (stage IN (0,1,2)), stage_at INTEGER, doctor_consent INTEGER NOT NULL DEFAULT 0 CHECK (doctor_consent IN (0,1)));
CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at);
CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at);
CREATE INDEX IF NOT EXISTS idx_patients_triage ON patients(triage DESC, updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS partner_leads (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, audience TEXT NOT NULL CHECK (audience IN ('public','pro')), name TEXT NOT NULL, email TEXT, phone TEXT, interests TEXT, message TEXT, consent_at INTEGER NOT NULL, created_at INTEGER NOT NULL, unsub_token TEXT, mailed_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_leads_created ON partner_leads(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unsub ON partner_leads(unsub_token);
CREATE INDEX IF NOT EXISTS idx_leads_email ON partner_leads(email, mailed_at);

-- Remarques et propositions des intervenants (soignants, médecins, orateurs, bénévoles) → page /admin, onglet « Remarques ».
-- Facultatif : l'application crée cette table toute seule au premier accès.
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, name TEXT, role TEXT NOT NULL, kind TEXT NOT NULL,
  message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu','traite')), admin_notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

-- Preuve des accords (RGPD art. 7.1) : date de la dernière décision de transmission au médecin traitant
-- + historique horodaté (JSON : texte versionné, moyen, empreinte SHA-256). Facultatif : appliqué automatiquement.
ALTER TABLE patients ADD COLUMN doctor_consent_at INTEGER;
ALTER TABLE patients ADD COLUMN consent_log TEXT;

-- Envois manuels (aucun envoi automatique) : e-mail du médecin traitant et date d'envoi notée.
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE patients ADD COLUMN gp_email TEXT;
ALTER TABLE patients ADD COLUMN gp_sent_at INTEGER;

-- Nom du ou des soignants / praticiens qui ont encodé les paramètres ; « pas de médecin traitant ».
-- Facultatif : appliqué automatiquement par l'application (no_gp existe déjà sur les bases créées en v1).
ALTER TABLE patients ADD COLUMN practitioner TEXT;
