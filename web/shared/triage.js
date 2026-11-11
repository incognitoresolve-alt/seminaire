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

/** Âge en mois (nourrissons) ; null si inconnu. */
export function ageMonths(birth, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth ?? ''));
  if (!m) return null;
  let mo = (now.getFullYear() - Number(m[1])) * 12 + (now.getMonth() + 1 - Number(m[2]));
  if (now.getDate() < Number(m[3])) mo--;
  return mo >= 0 ? mo : null;
}

// Signes d'alerte cochés par le soignant (→ 112) et contexte.
export const ALERTS = Object.freeze({
  douleur_thoracique: 'Douleur ou oppression thoracique',
  essoufflement: 'Essoufflement important (ne finit pas ses phrases)',
  malaise: 'Malaise, perte de connaissance ou convulsions',
  confusion: 'Confusion soudaine ou somnolence inhabituelle',
  avc: 'Signes d’AVC (visage, bras, parole)',
  saignement: 'Saignement abondant, traumatisme ou choc à la tête',
});
export const CONTEXTS = Object.freeze({ grossesse: 'Grossesse' });
export const parseAlerts = (s) => new Set(String(s ?? '').split(',').filter((k) => k in ALERTS || k in CONTEXTS));

/**
 * Score NEWS2 (Royal College of Physicians, 2017) — adultes (16 ans et plus), air ambiant supposé.
 * @returns {{score:number, n:number, max3:boolean}} n = nombre de paramètres disponibles sur 6
 */
export function news2(p, alerts = parseAlerts(p?.alerts)) {
  const band = (v, rows) => (v === null ? null : rows.find(([test]) => test(v))?.[1] ?? 0);
  const parts = [
    band(num(p?.rr), [[(v) => v <= 8, 3], [(v) => v <= 11, 1], [(v) => v <= 20, 0], [(v) => v <= 24, 2], [() => true, 3]]),
    band(num(p?.spo2), [[(v) => v <= 91, 3], [(v) => v <= 93, 2], [(v) => v <= 95, 1], [() => true, 0]]),
    band(num(p?.sys), [[(v) => v <= 90, 3], [(v) => v <= 100, 2], [(v) => v <= 110, 1], [(v) => v <= 219, 0], [() => true, 3]]),
    band(num(p?.pulse), [[(v) => v <= 40, 3], [(v) => v <= 50, 1], [(v) => v <= 90, 0], [(v) => v <= 110, 1], [(v) => v <= 130, 2], [() => true, 3]]),
    alerts.has('confusion') ? 3 : null,
    band(num(p?.temp), [[(v) => v <= 35, 3], [(v) => v <= 36, 1], [(v) => v <= 38, 0], [(v) => v <= 39, 1], [() => true, 2]]),
  ].filter((x) => x !== null);
  return { score: parts.reduce((a, b) => a + b, 0), n: parts.length, max3: parts.includes(3) };
}

/** IMC à 1 décimale. height en cm (fiche soignant) ou en m. */
export function bmi(weight, height) {
  const w = Number(weight);
  let h = Number(height);
  if (!w || !h) return null;
  if (h > 3) h /= 100;
  const v = w / (h * h);
  return Number.isFinite(v) && v > 5 && v < 100 ? Math.round(v * 10) / 10 : null;
}

// Tranches : nourrisson (< 1 an), enfant 1–5 ans, enfant 6–11 ans, adulte (12 ans et plus).
const band = (age) => (age === null ? 'adult' : age < 1 ? 'infant' : age < 6 ? 'child_small' : age < 12 ? 'child' : 'adult');
const PULSE = {
  infant: { red: (v) => v < 90 || v > 180, orange: (v) => v < 100 || v > 160 }, // NICE NG143 : > 160 avant 12 mois
  child_small: { red: (v) => v < 60 || v > 170, orange: (v) => v < 80 || v > 140 },
  child: { red: (v) => v < 55 || v > 150, orange: (v) => v < 70 || v > 120 },
  adult: { red: (v) => v < 40 || v > 130, orange: (v) => v < 50 || v > 100 },
};
const SYS = {
  infant: { red: (v) => v < 60 || v >= 120, orange: (v) => v < 70 || v >= 105 }, // seuil de prudence (APP)
  child_small: { red: (v) => v < 70 || v >= 130, orange: (v) => v < 80 || v >= 115 },
  child: { red: (v) => v < 75 || v >= 140, orange: (v) => v < 85 || v >= 120 },
  adult: { red: (v) => v < 90 || v >= 180, orange: (v) => v < 100 || v >= 140 },
};
const DIA = {
  infant: { red: (v) => v >= 85, orange: (v) => v >= 70 }, // seuil de prudence (APP)
  child_small: { red: (v) => v >= 90, orange: (v) => v >= 75 },
  child: { red: (v) => v >= 95, orange: (v) => v >= 80 },
  adult: { red: (v) => v >= 110, orange: (v) => v < 50 || v >= 90 },
};

/** Règles applicables pour un âge donné (en années ; mois pour les nourrissons). */
export function rulesFor(age, { months = null, pregnant = false } = {}) {
  const b = band(age);
  const young = b === 'infant' || b === 'child_small';
  // Respiration : NICE NG143 (< 5 ans) ; NEWS2 (adultes) ; 6–11 ans : seuil de prudence (APP).
  const RR = {
    infant: { red: (v) => v > 60, orange: (v) => (months !== null && months < 6 ? v > 60 : v > 50) },
    child_small: { red: (v) => v > 60, orange: (v) => v > 40 },
    child: { red: (v) => v > 40, orange: (v) => v > 30 },
    adult: { red: (v) => v <= 8 || v >= 25, orange: (v) => v <= 11 || v >= 21 },
  }[b];
  // SpO2 : NHS (≤ 92 % urgent, 93–94 % contacter un médecin) ; < 5 ans : NICE NG143 (≤ 95 %) ; grossesse : NHS (≤ 94 %).
  const SPO2 = pregnant
    ? { red: (v) => v <= 94, orange: () => false }
    : { red: (v) => v <= 92, orange: (v) => v <= (young ? 95 : 94) };
  const pulse = b === 'child_small' && age === 1 ? { ...PULSE.child_small, orange: (v) => v < 80 || v > 150 } : PULSE[b];
  // Grossesse : NICE NG133 (≥ 140/90 hypertension ; ≥ 160/110 sévère).
  const sys = pregnant && b === 'adult' ? { red: (v) => v < 90 || v >= 160, orange: (v) => v < 100 || v >= 140 } : SYS[b];
  const dia = pregnant && b === 'adult' ? { red: (v) => v >= 110, orange: (v) => v < 50 || v >= 90 } : DIA[b];
  // Température : NICE NG143 (< 3 mois ≥ 38 °C = risque élevé ; 3–6 mois ≥ 39 °C = risque intermédiaire).
  const temp =
    months !== null && months < 3
      ? { red: (v) => v < 35 || v >= 38, orange: (v) => v < 36 || v >= 37.5 }
      : months !== null && months < 6
        ? { red: (v) => v < 35 || v >= 39.5, orange: (v) => v < 36 || v >= 38 }
        : { red: (v) => v < 35 || v >= 39.5, orange: (v) => v < 36 || v >= 38 };
  const rules = [
    { key: 'pulse', label: 'Pouls', unit: 'bpm', ...pulse },
    { key: 'rr', label: 'Respiration', unit: '/min', ...RR },
    { key: 'spo2', label: 'SpO2', unit: '%', ...SPO2 },
    { key: 'temp', label: 'Température', unit: '°C', ...temp },
    { key: 'sys', label: 'Systolique', unit: 'mmHg', ...sys },
    { key: 'dia', label: 'Diastolique', unit: 'mmHg', ...dia },
    // Glycémie capillaire (non à jeun), mg/dL
    { key: 'glucose', label: 'Glycémie', unit: 'mg/dL', red: (v) => v < 54 || v >= 300, orange: (v) => v < 70 || v >= 200 },
  ];
  // IMC adulte : non applicable avant 18 ans (courbes de croissance). Alerte de prévention, jamais rouge.
  if (age === null || age >= 18)
    rules.push({ key: 'bmi', label: 'IMC', unit: 'kg/m²', get: (p) => bmi(p.weight, p.height), red: () => false, orange: (v) => v < 18.5 || v >= 30 });
  return rules;
}
export const RULES = rulesFor(null); // compatibilité : seuils adultes

export const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** @returns {{level:number, reasons:string[]}} */
export function triage(p, now = new Date()) {
  let level = LEVEL.NONE;
  let measured = false;
  const reasons = [];
  const age = ageYears(p?.birth_date, now);
  const alerts = parseAlerts(p?.alerts);
  // Signe d'alerte coché : rouge d'emblée.
  for (const [k, label] of Object.entries(ALERTS)) {
    if (alerts.has(k)) {
      level = LEVEL.RED;
      reasons.push(label);
    }
  }
  for (const r of rulesFor(age, { months: ageMonths(p?.birth_date, now), pregnant: alerts.has('grossesse') })) {
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
  // NEWS2 (adultes) : total ≥ 5 ou un paramètre à 3 → réponse urgente.
  if (age === null || age >= 16) {
    const n = news2(p, alerts);
    if (n.n >= 2 && (n.score >= 5 || n.max3) && level < LEVEL.RED) {
      level = LEVEL.RED;
      reasons.push(`Score NEWS2 ${n.score}`);
    }
  }
  if (measured && level === LEVEL.NONE) level = LEVEL.GREEN;
  return { level, reasons };
}
