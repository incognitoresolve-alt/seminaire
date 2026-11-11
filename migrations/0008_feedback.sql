-- Remarques et propositions des intervenants (soignants, médecins, orateurs, bénévoles) → page /admin, onglet « Remarques ».
-- Facultatif : l'application crée cette table toute seule au premier accès.
CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, name TEXT, role TEXT NOT NULL, kind TEXT NOT NULL,
  message TEXT NOT NULL, contact TEXT, status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','lu','traite')), admin_notes TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
