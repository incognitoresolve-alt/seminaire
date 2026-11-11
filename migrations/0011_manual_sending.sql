-- Envois manuels (aucun envoi automatique) : e-mail du médecin traitant et date d'envoi notée.
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE patients ADD COLUMN gp_email TEXT;
ALTER TABLE patients ADD COLUMN gp_sent_at INTEGER;
