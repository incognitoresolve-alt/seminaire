-- Accord facultatif : figurer dans le rapport nominatif d'ICC Liège (nom, prénom, GSM des personnes reçues au pôle santé).
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE patients ADD COLUMN church_consent INTEGER NOT NULL DEFAULT 0 CHECK (church_consent IN (0,1));
