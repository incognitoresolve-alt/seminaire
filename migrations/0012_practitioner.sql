-- Nom du ou des soignants / praticiens qui ont encodé les paramètres ; « pas de médecin traitant ».
-- Facultatif : appliqué automatiquement par l'application (no_gp existe déjà sur les bases créées en v1).
ALTER TABLE patients ADD COLUMN practitioner TEXT;
