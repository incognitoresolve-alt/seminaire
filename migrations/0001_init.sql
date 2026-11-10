-- Schéma D1 : patients du séminaire
CREATE TABLE IF NOT EXISTS patients (
  id          TEXT PRIMARY KEY,                 -- UUID v4
  token       TEXT NOT NULL UNIQUE,             -- secret du Pass (QR), 128 bits
  short_code  TEXT NOT NULL UNIQUE,             -- code lisible (6 car.) pour saisie manuelle
  request_id  TEXT UNIQUE,                      -- idempotence (anti double-soumission)
  last_name   TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  birth_date  TEXT NOT NULL,                    -- YYYY-MM-DD
  email       TEXT NOT NULL,
  phone       TEXT,
  consent_at  INTEGER NOT NULL,                 -- horodatage de l'accord de consultation + RGPD (ms)
  gp_consent  INTEGER NOT NULL DEFAULT 0 CHECK (gp_consent IN (0,1)), -- transmission au médecin traitant
  no_gp       INTEGER NOT NULL DEFAULT 0 CHECK (no_gp IN (0,1)),      -- pas de médecin traitant
  gp_name     TEXT,
  gp_address  TEXT,
  gp_contact  TEXT,
  source      TEXT NOT NULL CHECK (source IN ('self','staff')),
  pulse       INTEGER,                          -- bpm
  temp        REAL,                             -- °C
  weight      REAL,                             -- kg
  height      INTEGER,                          -- cm
  waist       INTEGER,                          -- périmètre abdominal, cm
  glucose     INTEGER,                          -- glycémie capillaire, mg/dL
  sys         INTEGER,                          -- mmHg
  dia         INTEGER,                          -- mmHg
  notes       TEXT,
  triage      INTEGER NOT NULL DEFAULT 0 CHECK (triage BETWEEN 0 AND 3), -- 0 à voir, 1 vert, 2 orange, 3 rouge
  doctor      INTEGER CHECK (doctor IN (1,2)),  -- 1 = Médecin 1 (mer. 11/11), 2 = Médecin 2 (sam. 14/11)
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER                           -- tombstone (synchro), purgé par le cron
);

CREATE INDEX IF NOT EXISTS idx_patients_updated ON patients(updated_at);
CREATE INDEX IF NOT EXISTS idx_patients_created ON patients(created_at);
CREATE INDEX IF NOT EXISTS idx_patients_triage  ON patients(triage DESC, updated_at DESC) WHERE deleted_at IS NULL;

-- Questionnaire de prévention : ANONYME (aucun lien avec patients, aucune IP stockée).
CREATE TABLE IF NOT EXISTS surveys (
  id               TEXT PRIMARY KEY,
  request_id       TEXT UNIQUE,
  weight           REAL,          -- kg
  height           REAL,          -- m
  bmi              REAL,          -- calculé serveur
  bmi_normal       TEXT,          -- réponse « valeur normale IMC »
  waist            INTEGER,       -- cm
  waist_normal_f   TEXT,
  waist_normal_m   TEXT,
  activity_freq    INTEGER CHECK (activity_freq BETWEEN 0 AND 4), -- 0 aucune, 1,2,3, 4 = plus de 3
  activity_minutes INTEGER,
  glucose_tested   INTEGER CHECK (glucose_tested IN (0,1)),
  glucose_normal   TEXT,
  chol_known       INTEGER CHECK (chol_known IN (0,1)),
  vax_status       INTEGER CHECK (vax_status IN (0,1,2)),         -- 0 non, 1 oui, 2 ne sait pas
  tetanus          TEXT,
  screen_hours     REAL,          -- h/jour
  questions        TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_surveys_created ON surveys(created_at);
