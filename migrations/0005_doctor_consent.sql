-- Consentement : transmission au médecin de la consultation (Médecin 1 / Médecin 2), pas au médecin traitant.
ALTER TABLE patients ADD COLUMN doctor_consent INTEGER NOT NULL DEFAULT 0 CHECK (doctor_consent IN (0,1));
