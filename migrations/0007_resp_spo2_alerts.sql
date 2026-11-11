-- Assistant éducatif : fréquence respiratoire, saturation en oxygène, signes d'alerte / contexte (liste fermée).
ALTER TABLE patients ADD COLUMN rr INTEGER;
ALTER TABLE patients ADD COLUMN spo2 INTEGER;
ALTER TABLE patients ADD COLUMN alerts TEXT;
