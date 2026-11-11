-- Envois manuels (aucun envoi automatique) : e-mail du médecin traitant, date d'envoi notée, réglages admin (e-mail d'ICC Liège).
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE patients ADD COLUMN gp_email TEXT;
ALTER TABLE patients ADD COLUMN gp_sent_at INTEGER;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
