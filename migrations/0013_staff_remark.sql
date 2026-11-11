-- Remarque du soignant sur le dossier (lue par l'administration au moment de l'envoi au médecin).
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE patients ADD COLUMN staff_remark TEXT;
