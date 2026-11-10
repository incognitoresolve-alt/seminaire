// Seuils cliniques préconfigurés (adulte). Source unique : utilisée par le Worker ET le navigateur.
// Indicatif : le jugement clinique du soignant prime toujours.
export const LEVEL = Object.freeze({ NONE: 0, GREEN: 1, ORANGE: 2, RED: 3 });

export const RULES = [
  { key: 'pulse', label: 'Pouls', unit: 'bpm', red: (v) => v < 40 || v > 130, orange: (v) => v < 50 || v > 100 },
  { key: 'temp', label: 'Température', unit: '°C', red: (v) => v < 35 || v >= 39.5, orange: (v) => v < 36 || v >= 38 },
  { key: 'sys', label: 'Systolique', unit: 'mmHg', red: (v) => v < 90 || v >= 180, orange: (v) => v < 100 || v >= 140 },
  { key: 'dia', label: 'Diastolique', unit: 'mmHg', red: (v) => v >= 110, orange: (v) => v < 50 || v >= 90 },
  // Glycémie capillaire (non à jeun), mg/dL
  { key: 'glucose', label: 'Glycémie', unit: 'mg/dL', red: (v) => v < 54 || v >= 300, orange: (v) => v < 70 || v >= 200 },
  // IMC calculé (poids / taille²) : alerte de prévention, jamais rouge
  { key: 'bmi', label: 'IMC', unit: 'kg/m²', get: (p) => bmi(p.weight, p.height), red: () => false, orange: (v) => v < 18.5 || v >= 30 },
];

/** IMC à 1 décimale. height en cm (fiche soignant) ou en m (questionnaire). */
export function bmi(weight, height) {
  const w = Number(weight);
  let h = Number(height);
  if (!w || !h) return null;
  if (h > 3) h /= 100;
  const v = w / (h * h);
  return Number.isFinite(v) && v > 5 && v < 100 ? Math.round(v * 10) / 10 : null;
}

/** @returns {{level:number, reasons:string[]}} */
export function triage(p) {
  let level = LEVEL.NONE;
  let measured = false;
  const reasons = [];
  for (const r of RULES) {
    const v = r.get ? r.get(p ?? {}) : p?.[r.key];
    if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) continue;
    const n = Number(v);
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
