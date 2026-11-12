-- Remarques des intervenants : jour(s) concerné(s) ; réglages (jeton du lien de consultation en lecture seule).
-- Facultatif : appliqué automatiquement par l'application.
ALTER TABLE feedback ADD COLUMN days TEXT;
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL);
