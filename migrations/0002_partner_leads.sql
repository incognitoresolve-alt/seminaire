-- Demandes de contact partenaire : table ISOLÉE, aucun lien avec patients ni questionnaires.
-- Responsable de traitement : le partenaire (pas l'organisateur). Purge : LEADS_RETENTION_DAYS.
CREATE TABLE IF NOT EXISTS partner_leads (
  id          TEXT PRIMARY KEY,
  request_id  TEXT UNIQUE,
  audience    TEXT NOT NULL CHECK (audience IN ('public','pro')),
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  interests   TEXT,           -- liste séparée par des virgules (whitelist)
  message     TEXT,
  consent_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON partner_leads(created_at);
