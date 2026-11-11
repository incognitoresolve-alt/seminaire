// Seuils cliniques préconfigurés, ADAPTÉS À L'ÂGE, + conseils automatiques.
// Source unique : utilisée par le Worker ET le navigateur.
// Indicatif : le jugement clinique du soignant prime toujours. À faire valider par les médecins.
export const LEVEL = Object.freeze({ NONE: 0, GREEN: 1, ORANGE: 2, RED: 3 });

/** Âge en années à partir de « AAAA-MM-JJ » (null si inconnu). */
export function ageYears(birth, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? ''));
  if (!m) return null;
  let a = now.getFullYear() - Number(m[1]);
  if (now.getMonth() + 1 < Number(m[2]) || (now.getMonth() + 1 === Number(m[2]) && now.getDate() < Number(m[3]))) a--;
  return a >= 0 && a < 130 ? a : null;
}

/** IMC à 1 décimale. height en cm (fiche soignant) ou en m (questionnaire). */
export function bmi(weight, height) {
  const w = Number(weight);
  let h = Number(height);
  if (!w || !h) return null;
  if (h > 3) h /= 100;
  const v = w / (h * h);
  return Number.isFinite(v) && v > 5 && v < 100 ? Math.round(v * 10) / 10 : null;
}

// Tranches : enfant 1–5 ans, enfant 6–11 ans, adulte (12 ans et plus ; seuils adultes à partir de l'adolescence).
const band = (age) => (age === null ? 'adult' : age < 6 ? 'child_small' : age < 12 ? 'child' : 'adult');
const PULSE = {
  child_small: { red: (v) => v < 60 || v > 170, orange: (v) => v < 80 || v > 140 },
  child: { red: (v) => v < 55 || v > 150, orange: (v) => v < 70 || v > 120 },
  adult: { red: (v) => v < 40 || v > 130, orange: (v) => v < 50 || v > 100 },
};
const SYS = {
  child_small: { red: (v) => v < 70 || v >= 130, orange: (v) => v < 80 || v >= 115 },
  child: { red: (v) => v < 75 || v >= 140, orange: (v) => v < 85 || v >= 120 },
  adult: { red: (v) => v < 90 || v >= 180, orange: (v) => v < 100 || v >= 140 },
};
const DIA = {
  child_small: { red: (v) => v >= 90, orange: (v) => v >= 75 },
  child: { red: (v) => v >= 95, orange: (v) => v >= 80 },
  adult: { red: (v) => v >= 110, orange: (v) => v < 50 || v >= 90 },
};

/** Règles applicables pour un âge donné. */
export function rulesFor(age) {
  const b = band(age);
  const rules = [
    { key: 'pulse', label: 'Pouls', unit: 'bpm', ...PULSE[b] },
    { key: 'temp', label: 'Température', unit: '°C', red: (v) => v < 35 || v >= 39.5, orange: (v) => v < 36 || v >= 38 },
    { key: 'sys', label: 'Systolique', unit: 'mmHg', ...SYS[b] },
    { key: 'dia', label: 'Diastolique', unit: 'mmHg', ...DIA[b] },
    // Glycémie capillaire (non à jeun), mg/dL
    { key: 'glucose', label: 'Glycémie', unit: 'mg/dL', red: (v) => v < 54 || v >= 300, orange: (v) => v < 70 || v >= 200 },
  ];
  // IMC adulte : non applicable avant 18 ans (courbes de croissance). Alerte de prévention, jamais rouge.
  if (age === null || age >= 18)
    rules.push({ key: 'bmi', label: 'IMC', unit: 'kg/m²', get: (p) => bmi(p.weight, p.height), red: () => false, orange: (v) => v < 18.5 || v >= 30 });
  return rules;
}
export const RULES = rulesFor(null); // compatibilité : seuils adultes

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** @returns {{level:number, reasons:string[]}} */
export function triage(p, now = new Date()) {
  let level = LEVEL.NONE;
  let measured = false;
  const reasons = [];
  for (const r of rulesFor(ageYears(p?.birth_date, now))) {
    const n = num(r.get ? r.get(p ?? {}) : p?.[r.key]);
    if (n === null) continue;
    measured = true;
    if (r.red(n)) {
      level = LEVEL.RED;
      reasons.push(`${r.label} ${n} ${r.unit}`);
    } else if (r.orange(n)) {
      level = Math.max(level, LEVEL.ORANGE);
      reasons.push(`${r.label} ${n} ${r.unit}`);
    }
  }
  if (measured && level === LEVEL.NONE) level = LEVEL.GREEN;
  return { level, reasons };
}

/**
 * Conseils automatiques (indicatifs) selon les valeurs saisies ET l'âge.
 * @returns {{tone:'red'|'orange'|'info', text:string}[]}
 */
export function advice(p, now = new Date()) {
  const age = ageYears(p?.birth_date, now);
  const adult = age === null || age >= 18;
  const out = [];
  const add = (tone, text) => out.push({ tone, text });
  const sys = num(p?.sys), dia = num(p?.dia), temp = num(p?.temp), glu = num(p?.glucose), pulse = num(p?.pulse), waist = num(p?.waist);
  const b = bmi(p?.weight, p?.height);
  const R = rulesFor(age);
  const is = (key, lvl, v) => v !== null && R.find((r) => r.key === key)?.[lvl](v);

  if (age !== null && age < 18) add('info', 'Mineur : seuils pédiatriques appliqués ; présence ou accord d’un parent.');
  if (is('sys', 'red', sys) || is('dia', 'red', dia)) add('red', 'Tension très anormale : avis médical immédiat.');
  else if ((sys !== null && is('sys', 'orange', sys) && sys >= 100) || (dia !== null && is('dia', 'orange', dia) && dia >= 75))
    add('orange', `Tension élevée : recontrôler après 5 min de repos ; si confirmée, avis médical${age !== null && age >= 65 ? ' (attention au risque de chute si traitement)' : ''}.`);
  if (sys !== null && adult && sys < 100) add('orange', 'Tension basse : vérifier malaise, hydratation ; avis médical si symptômes.');
  if (is('pulse', 'red', pulse)) add('red', 'Pouls très anormal : recontrôler et avis médical immédiat.');
  else if (is('pulse', 'orange', pulse)) add('orange', 'Pouls inhabituel : recontrôler au repos ; avis médical si persistant ou symptômes.');
  if (temp !== null && temp >= 38) add(temp >= 39.5 ? 'red' : 'orange', 'Fièvre : avis médical, hydratation, repos.');
  if (glu !== null && glu < 70) add('red', 'Hypoglycémie : resucrage immédiat (sucre ou jus), recontrôler après 15 min.');
  else if (glu !== null && glu >= 200) add(glu >= 300 ? 'red' : 'orange', 'Glycémie élevée : avis médical (dépistage du diabète).');
  if (adult && b !== null) {
    if (b >= 30) add('orange', 'Obésité : conseils alimentation et activité physique (150 min/semaine), suivi chez le médecin traitant.');
    else if (b >= 25) add('info', 'Surpoids : conseils d’hygiène de vie (alimentation, activité physique).');
    else if (b < 18.5) add('orange', 'Maigreur : avis médical si perte de poids récente.');
  }
  if (!adult && b !== null) add('info', 'IMC de l’enfant : à interpréter avec les courbes de croissance.');
  if (adult && waist !== null && waist >= 102) add('orange', 'Périmètre abdominal élevé : risque cardio-métabolique accru.');
  // Prévention selon l'âge
  if (age !== null && age >= 45 && glu === null) add('info', '45 ans et plus : proposer une glycémie.');
  if (age !== null && age >= 40) add('info', '40 ans et plus : bilan cholestérol conseillé chez le médecin traitant.');
  if (age !== null && age >= 50 && age <= 74) add('info', '50–74 ans : dépistage gratuit du cancer colorectal (à demander au médecin traitant).');
  if (age !== null && age >= 65) add('info', '65 ans et plus : vérifier les vaccins (grippe, pneumocoque, tétanos).');
  return out;
}
