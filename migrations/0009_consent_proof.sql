-- Preuve des accords (RGPD art. 7.1) : date de la dernière décision de transmission au médecin traitant
-- + historique horodaté (JSON : texte versionné, moyen, empreinte SHA-256). Facultatif : appliqué automatiquement.
ALTER TABLE patients ADD COLUMN doctor_consent_at INTEGER;
ALTER TABLE patients ADD COLUMN consent_log TEXT;
