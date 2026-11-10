-- Parcours patient : 0 en attente, 1 en consultation (appelé), 2 terminé.
ALTER TABLE patients ADD COLUMN stage INTEGER NOT NULL DEFAULT 0 CHECK (stage IN (0,1,2));
ALTER TABLE patients ADD COLUMN stage_at INTEGER; -- dernier changement d'étape (ms)
CREATE INDEX IF NOT EXISTS idx_leads_email ON partner_leads(email, mailed_at);
