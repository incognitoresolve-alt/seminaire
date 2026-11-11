-- Mini-CRM partenaire : statut de suivi, moment préféré, notes du partenaire.
ALTER TABLE partner_leads ADD COLUMN status TEXT NOT NULL DEFAULT 'nouveau' CHECK (status IN ('nouveau','contacte','rdv','client'));
ALTER TABLE partner_leads ADD COLUMN contact_time TEXT CHECK (contact_time IN ('matin','apres-midi','soir'));
ALTER TABLE partner_leads ADD COLUMN partner_notes TEXT;
ALTER TABLE partner_leads ADD COLUMN updated_at INTEGER;
