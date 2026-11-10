-- E-mail de confirmation « check-up couverture » : jeton de désinscription + date d'envoi.
ALTER TABLE partner_leads ADD COLUMN unsub_token TEXT;
ALTER TABLE partner_leads ADD COLUMN mailed_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_unsub ON partner_leads(unsub_token);
