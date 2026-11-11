// Assistant médical ÉDUCATIF (indicatif) : moteur de règles déterministe, sans IA générative,
// sans envoi de données à un tiers. Chaque repère cite une source (web/shared/sources.js) ;
// les seuils sans source officielle sont signalés « seuil de prudence de l'application » (APP).
import { SOURCES } from './sources.js';
import { ALERTS, ageMonths, ageYears, bmi, news2, num, parseAlerts, triage, LEVEL } from './triage.js';

export const NOTE =
  'Cette analyse est strictement indicative et éducative. Elle ne remplace pas un avis médical, un diagnostic ou un traitement. En cas de symptômes graves, d’aggravation ou de doute, appelez le 112 ou contactez immédiatement un professionnel de santé.';
export const RAPPEL =
  'Ces informations sont fournies à titre indicatif et éducatif. Elles ne remplacent pas une évaluation médicale. En cas de symptômes graves, d’aggravation ou de doute, appelez le 112 ou contactez immédiatement un professionnel de santé.';

export const LEVELS = Object.freeze({
  urgence: { rank: 5, tone: 'red', label: 'URGENCE — appelez le 112 maintenant' },
  urgence_medicale: { rank: 4, tone: 'red', label: 'URGENCE MÉDICALE — contactez un médecin ou les urgences aujourd’hui' },
  consultation: { rank: 3, tone: 'orange', label: 'CONSULTATION RAPIDE — prenez rendez-vous dans les 24 à 72 heures' },
  surveillance: { rank: 2, tone: 'orange', label: 'SURVEILLANCE — refaites la mesure et surveillez l’évolution' },
  rassurant: { rank: 1, tone: 'green', label: 'PROBABLEMENT RASSURANT — surveillez et consultez si cela persiste' },
  incomplet: { rank: 0, tone: 'grey', label: 'DONNÉES INSUFFISANTES — mesurez au moins un paramètre' },
});

const ACTIONS = {
  urgence: [
    'Appelez le 112 maintenant (ou demandez à un collègue de le faire) et prévenez le médecin de l’événement.',
    'Ne laissez pas la personne seule ; installez-la au calme, en position confortable.',
    'Ne lui donnez rien à manger ni à boire (sauf hypoglycémie chez une personne bien consciente).',
    'Préparez les informations pour les secours : âge, mesures, heure de début des symptômes, médicaments connus.',
  ],
  urgence_medicale: [
    'Orientez la personne vers le médecin de l’événement maintenant ; à défaut, vers son médecin, le médecin de garde (1733) ou les urgences aujourd’hui.',
    'Refaites la mesure après 5 minutes de repos pour la confirmer.',
    'Si un signe d’alerte apparaît ou si l’état s’aggrave : appelez le 112.',
  ],
  consultation: [
    'Refaites la mesure après 5 minutes de repos.',
    'Si la valeur se confirme : conseillez un rendez-vous chez le médecin traitant dans les 24 à 72 heures, avec les valeurs notées.',
    'Remettez les valeurs par écrit à la personne.',
  ],
  surveillance: [
    'Refaites la mesure correctement (voir conseils de mesure).',
    'Notez la valeur et l’heure ; conseillez de surveiller l’évolution.',
    'Conseillez de consulter si la valeur reste anormale ou si des symptômes apparaissent.',
  ],
  rassurant: [
    'Aucune action urgente n’est nécessaire d’après les valeurs mesurées.',
    'Rappelez les conseils de prévention adaptés à l’âge.',
    'Conseillez de consulter si des symptômes apparaissent ou persistent.',
  ],
  incomplet: ['Mesurez au moins un paramètre (tension, pouls, température, SpO2…) ou cochez un signe d’alerte.'],
};

const WHEN = [
  'Appeler le 112 : douleur ou oppression thoracique, essoufflement important, malaise ou perte de connaissance, confusion soudaine, signes d’AVC (visage, bras, parole), saignement abondant.',
  'Contacter un médecin le jour même (médecin de l’événement, médecin traitant ou garde 1733) : valeur qui se confirme en dehors des repères, fièvre élevée, aggravation.',
  'Consulter dans les jours qui suivent : valeur limite qui persiste à plusieurs mesures.',
];

const TIPS = {
  tension: { text: 'Tension : personne assise depuis 5 minutes, dos appuyé, bras posé à hauteur du cœur, brassard adapté, sans parler ; faire 2 mesures à 1–2 minutes d’intervalle.', src: ['ESC_HTA'] },
  spo2: { text: 'SpO2 : mains réchauffées, sans vernis ni faux ongle, main immobile au niveau du cœur ; attendre une valeur stable et recontrôler.', src: ['NHS_SPO2'] },
  pouls: { text: 'Pouls et respiration : au repos depuis 5 minutes, compter pendant une minute entière.', src: ['NEWS2'] },
  temp: { text: 'Température : éviter une mesure juste après un effort, une boisson chaude ou froide ; recontrôler.', src: ['APP'] },
};

const ORDER = ['urgence', 'urgence_medicale', 'consultation', 'surveillance', 'rassurant', 'incomplet'];
const higher = (a, b) => (LEVELS[a].rank >= LEVELS[b].rank ? a : b);
const fmt = (n) => String(n).replace('.', ',');

/**
 * Analyse indicative d'un dossier.
 * @returns {{level:string, label:string, tone:string, understood:string, findings:{lvl:string,text:string,src:string[]}[],
 *   actions:string[], tips:{text:string,src:string[]}[], prevention:{text:string,src:string[]}[], when:string[], sources:object[], questions:string[]}}
 */
export function analyse(p, now = new Date()) {
  const age = ageYears(p?.birth_date, now);
  const months = ageMonths(p?.birth_date, now);
  const alerts = parseAlerts(p?.alerts);
  const preg = alerts.has('grossesse');
  const adult = age === null || age >= 16;
  const v = (k) => num(p?.[k]);
  const [pulse, rr, spo2, temp, sys, dia, glu, waist] = ['pulse', 'rr', 'spo2', 'temp', 'sys', 'dia', 'glucose', 'waist'].map(v);
  const b = bmi(p?.weight, p?.height);
  const findings = [];
  const tips = new Set();
  const add = (lvl, text, src, tip) => {
    findings.push({ lvl, text, src });
    if (tip) tips.add(tip);
  };

  // 1. Signes d'alerte (prioritaires)
  if (alerts.has('douleur_thoracique')) add('urgence', 'Douleur ou oppression thoracique : signe d’alerte cardiaque possible, à évaluer sans délai.', ['LCB_112', 'BE_112']);
  if (alerts.has('avc')) add('urgence', 'Signes d’AVC (visage, bras, parole) : chaque minute compte, même si les signes disparaissent.', ['HAS_AVC', 'BE_112']);
  if (alerts.has('essoufflement')) add('urgence', 'Essoufflement important : signe de détresse respiratoire possible.', ['BE_112']);
  if (alerts.has('malaise')) add('urgence', 'Malaise, perte de connaissance ou convulsions : situation d’urgence.', ['BE_112']);
  if (alerts.has('confusion')) add('urgence', 'Confusion d’apparition récente : critère d’alerte majeur (score NEWS2 = 3 pour ce seul paramètre).', ['NEWS2', 'BE_112']);
  if (alerts.has('saignement')) add('urgence', 'Saignement abondant, traumatisme ou choc à la tête : situation d’urgence.', ['BE_112']);

  // 2. Saturation en oxygène
  if (spo2 !== null) {
    if (preg && spo2 <= 94) add('urgence', `SpO2 ${spo2} % pendant la grossesse : évaluation à l’hôpital recommandée sans délai (repère NHS : 94 % ou moins).`, ['NHS_SPO2'], 'spo2');
    else if (spo2 <= 92) add('urgence', `SpO2 ${spo2} % : valeur basse ; si elle se confirme, aide urgente (repère NHS : 92 % ou moins).`, ['NHS_SPO2', 'NEWS2'], 'spo2');
    else if (spo2 <= 94) add('urgence_medicale', `SpO2 ${spo2} % : à recontrôler ; si elle se confirme, contacter un médecin aujourd’hui (repère NHS : 93–94 %).`, ['NHS_SPO2'], 'spo2');
    else if (spo2 === 95 && age !== null && age < 5) add('urgence_medicale', `SpO2 ${spo2} % chez un enfant de moins de 5 ans : signe de risque intermédiaire (repère NICE : 95 % ou moins).`, ['NICE_FEVER'], 'spo2');
    else if (spo2 === 95) add('surveillance', `SpO2 ${spo2} % : légèrement en dessous des valeurs habituelles ; à recontrôler.`, ['NEWS2'], 'spo2');
  }

  // 3. Respiration
  if (rr !== null) {
    if (adult) {
      if (rr <= 8 || rr >= 25) add('urgence', `Respiration ${rr}/min : valeur très anormale chez l’adulte (score NEWS2 = 3).`, ['NEWS2'], 'pouls');
      else if (rr >= 21) add('surveillance', `Respiration ${rr}/min : un peu rapide ; recontrôler au repos.`, ['NEWS2'], 'pouls');
      else if (rr <= 11) add('surveillance', `Respiration ${rr}/min : un peu lente ; recontrôler au repos.`, ['NEWS2'], 'pouls');
    } else if (age < 5) {
      if (rr > 60) add('urgence', `Respiration ${rr}/min chez un enfant de moins de 5 ans : signe de risque élevé.`, ['NICE_FEVER'], 'pouls');
      else if ((months !== null && months < 12 ? rr > 50 : rr > 40)) add('urgence_medicale', `Respiration ${rr}/min : rapide pour l’âge (repère NICE).`, ['NICE_FEVER'], 'pouls');
    } else if (rr > 40) add('urgence_medicale', `Respiration ${rr}/min : rapide pour l’âge.`, ['APP'], 'pouls');
    else if (rr > 30) add('surveillance', `Respiration ${rr}/min : un peu rapide pour l’âge ; recontrôler.`, ['APP'], 'pouls');
  }

  // 4. Pouls
  if (pulse !== null) {
    if (adult) {
      if (pulse <= 40 || pulse >= 131) add('urgence_medicale', `Pouls ${pulse}/min : très anormal chez l’adulte (score NEWS2 = 3).`, ['NEWS2'], 'pouls');
      else if (pulse >= 111) add('surveillance', `Pouls ${pulse}/min : rapide ; recontrôler au repos (fièvre, stress, effort, caféine peuvent l’augmenter).`, ['NEWS2'], 'pouls');
      else if (pulse > 100) add('surveillance', `Pouls ${pulse}/min : un peu rapide ; recontrôler au repos.`, ['NEWS2'], 'pouls');
      else if (pulse <= 50) add('surveillance', `Pouls ${pulse}/min : lent ; peut être normal chez une personne sportive ; recontrôler.`, ['NEWS2'], 'pouls');
    } else {
      const lim = months !== null && months < 12 ? 160 : age < 2 ? 150 : age < 6 ? 140 : null;
      if (lim && pulse > lim) add('urgence_medicale', `Pouls ${pulse}/min : rapide pour l’âge (repère NICE : > ${lim}/min).`, ['NICE_FEVER'], 'pouls');
      else if (!lim && (pulse > 120 || pulse < 70)) add('surveillance', `Pouls ${pulse}/min : en dehors des valeurs habituelles pour l’âge ; recontrôler au repos.`, ['APP'], 'pouls');
    }
  }

  // 5. Température
  if (temp !== null) {
    if (months !== null && months < 3 && temp >= 38) add('urgence', `Température ${fmt(temp)} °C chez un nourrisson de moins de 3 mois : risque élevé, évaluation médicale immédiate.`, ['NICE_FEVER', 'BE_112'], 'temp');
    else if (months !== null && months < 6 && temp >= 39) add('urgence_medicale', `Température ${fmt(temp)} °C chez un nourrisson de 3 à 6 mois : évaluation médicale aujourd’hui.`, ['NICE_FEVER'], 'temp');
    else if (temp <= 35) add('urgence_medicale', `Température ${fmt(temp)} °C : basse (score NEWS2 = 3) ; réchauffer et faire évaluer.`, ['NEWS2'], 'temp');
    else if (temp >= 39.5) add('urgence_medicale', `Température ${fmt(temp)} °C : fièvre élevée ; avis médical aujourd’hui.`, ['APP'], 'temp');
    else if (temp > 38) add('surveillance', `Température ${fmt(temp)} °C : fièvre ; hydratation, repos, recontrôler ; consulter si elle persiste ou s’accompagne d’autres signes.`, ['NEWS2'], 'temp');
    else if (temp <= 36) add('surveillance', `Température ${fmt(temp)} °C : un peu basse ; recontrôler.`, ['NEWS2'], 'temp');
  }

  // 6. Tension
  if (sys !== null || dia !== null) {
    const s = sys ?? 0, d = dia ?? 0;
    const bp = `${sys ?? '–'}/${dia ?? '–'} mmHg`;
    if (preg && adult && (s >= 160 || d >= 110)) add('urgence_medicale', `Tension ${bp} pendant la grossesse : hypertension sévère (≥ 160/110), évaluation spécialisée sans délai.`, ['NICE_PREG'], 'tension');
    else if (preg && adult && (s >= 140 || d >= 90)) add('urgence_medicale', `Tension ${bp} pendant la grossesse : hypertension (≥ 140/90), à faire évaluer aujourd’hui (maternité ou médecin).`, ['NICE_PREG'], 'tension');
    else if (adult && (s >= 220 || (sys !== null && s <= 90))) add('urgence_medicale', `Tension ${bp} : valeur très anormale (score NEWS2 = 3) ; évaluation médicale aujourd’hui.`, ['NEWS2'], 'tension');
    else if (adult && (s >= 180 || d >= 110)) add('urgence_medicale', `Tension ${bp} : très élevée ; si elle se confirme, une urgence hypertensive doit être recherchée par un médecin (repère ESC : 180/110).`, ['ESC_HTA'], 'tension');
    else if (adult && (s >= 140 || d >= 90)) add('consultation', `Tension ${bp} : au-dessus du seuil d’hypertension (140/90). Une mesure isolée ne suffit pas : le diagnostic se confirme par des mesures répétées.`, ['ESC_HTA'], 'tension');
    else if (adult && sys !== null && s <= 100) add('surveillance', `Tension ${bp} : plutôt basse ; recontrôler, surtout en cas de malaise ou de vertiges.`, ['NEWS2'], 'tension');
    else if (adult && (s >= 120 || d >= 70)) add('rassurant', `Tension ${bp} : dans la zone « tension élevée » (120–139/70–89) ; pas de traitement en soi, mais une bonne hygiène de vie est conseillée.`, ['ESC_HTA']);
    else if (!adult) {
      const t = triage({ sys, dia, birth_date: p?.birth_date }, now).level;
      if (t === LEVEL.RED) add('urgence_medicale', `Tension ${bp} : très en dehors des valeurs attendues pour l’âge.`, ['APP'], 'tension');
      else if (t === LEVEL.ORANGE) add('consultation', `Tension ${bp} : en dehors des valeurs attendues pour l’âge ; à recontrôler.`, ['APP'], 'tension');
    }
  }

  // 7. Glycémie (capillaire, non à jeun)
  if (glu !== null) {
    if (glu < 54) add(alerts.has('confusion') || alerts.has('malaise') ? 'urgence' : 'urgence_medicale', `Glycémie ${glu} mg/dL : hypoglycémie significative (niveau 2, < 54 mg/dL) ; donner du sucre si la personne est bien consciente et avale normalement, puis faire évaluer.`, ['ADA_HYPO']);
    else if (glu < 70) add('surveillance', `Glycémie ${glu} mg/dL : hypoglycémie (niveau 1, < 70 mg/dL) ; donner du sucre si la personne est bien consciente, puis recontrôler après 15 minutes ; consulter si cela ne s’améliore pas.`, ['ADA_HYPO']);
    else if (glu >= 300) add('urgence_medicale', `Glycémie ${glu} mg/dL : très élevée ; avis médical aujourd’hui.`, ['APP', 'WHO_DIAB']);
    else if (glu >= 200) add('consultation', `Glycémie ${glu} mg/dL : élevée ; une valeur de 200 mg/dL ou plus peut évoquer un diabète, surtout avec des symptômes (soif, urines fréquentes) ; une valeur isolée doit être confirmée par une prise de sang.`, ['WHO_DIAB']);
  }

  // 8. Corpulence (adultes)
  if (b !== null) {
    if (age !== null && age < 18) add('rassurant', `IMC ${fmt(b)} : chez l’enfant, l’IMC s’interprète avec les courbes de croissance.`, ['WHO_BMI']);
    else if (b >= 30) add('surveillance', `IMC ${fmt(b)} kg/m² : obésité selon l’OMS (≥ 30) ; l’IMC est un repère approximatif. Conseiller d’en parler au médecin traitant (alimentation, activité physique).`, ['WHO_BMI']);
    else if (b >= 25) add('rassurant', `IMC ${fmt(b)} kg/m² : surpoids selon l’OMS (≥ 25) ; conseils d’hygiène de vie.`, ['WHO_BMI']);
    else if (b < 18.5) add('surveillance', `IMC ${fmt(b)} kg/m² : maigreur ; avis médical en cas de perte de poids récente.`, ['APP']);
  }
  if (waist !== null && adult && waist >= 102) add('rassurant', `Périmètre abdominal ${waist} cm : élevé ; facteur de risque cardio-métabolique à évoquer avec le médecin traitant.`, ['APP']);

  // 9. Score NEWS2 (adultes, si au moins 3 paramètres)
  let score = null;
  if (adult) {
    const n = news2(p, alerts);
    if (n.n >= 3) {
      score = n;
      if (n.score >= 7) add('urgence', `Score NEWS2 ${n.score} (sur ${n.n} paramètres) : niveau de risque élevé (7 ou plus).`, ['NEWS2']);
      else if (n.score >= 5) add('urgence_medicale', `Score NEWS2 ${n.score} (sur ${n.n} paramètres) : seuil d’évaluation urgente (5–6).`, ['NEWS2']);
    }
  }

  // Niveau global
  const measured = [pulse, rr, spo2, temp, sys, dia, glu, b].some((x) => x !== null);
  let level = findings.length ? findings.map((f) => f.lvl).reduce(higher) : measured ? 'rassurant' : 'incomplet';
  if (!findings.length && alerts.size && !measured) level = 'incomplet';
  if (measured && level === 'incomplet') level = 'rassurant';
  // Cohérence avec la couleur de triage affichée dans la liste.
  const t = triage(p, now).level;
  if (t === LEVEL.RED) level = higher(level, 'urgence_medicale');
  else if (t === LEVEL.ORANGE) level = higher(level, 'surveillance');

  // Prévention selon l'âge (n'influence pas le niveau)
  const prevention = [];
  if (age !== null && age >= 50 && age <= 74) prevention.push({ text: '50–74 ans : dépistage gratuit du cancer colorectal tous les 2 ans (médecin, pharmacie ou commande en ligne).', src: ['BE_CRC'] });
  if (age !== null && age >= 65) prevention.push({ text: '65 ans et plus : vaccination contre la grippe recommandée chaque automne.', src: ['CSS_GRIPPE'] });
  if (age !== null && age >= 18) prevention.push({ text: 'Adultes : rappel diphtérie-tétanos tous les 10 ans.', src: ['BE_TETANOS'] });

  // Ce que j'ai compris
  const parts = [];
  if (age !== null) parts.push(months !== null && months < 24 ? `${months} mois` : `${age} ans`);
  else parts.push('âge non renseigné');
  if (preg) parts.push('grossesse');
  const vals = [
    sys !== null || dia !== null ? `tension ${sys ?? '–'}/${dia ?? '–'}` : null,
    pulse !== null ? `pouls ${pulse}` : null,
    rr !== null ? `respiration ${rr}/min` : null,
    spo2 !== null ? `SpO2 ${spo2} %` : null,
    temp !== null ? `température ${fmt(temp)} °C` : null,
    glu !== null ? `glycémie ${glu} mg/dL` : null,
    b !== null ? `IMC ${fmt(b)}` : null,
  ].filter(Boolean);
  parts.push(vals.length ? vals.join(', ') : 'aucune mesure');
  const alertTxt = [...alerts].filter((a) => a in ALERTS).map((a) => ALERTS[a].toLowerCase());
  parts.push(alertTxt.length ? `signe(s) d’alerte : ${alertTxt.join(', ')}` : 'aucun signe d’alerte coché');

  // Questions si données insuffisantes
  const questions = [];
  if (level === 'incomplet' || level === 'rassurant') {
    if (age === null) questions.push('Quelle est la date de naissance ?');
    if (sys === null && pulse === null) questions.push('Pouvez-vous mesurer la tension et le pouls ?');
    if (!alerts.size) questions.push('La personne a-t-elle un symptôme (douleur thoracique, essoufflement, malaise, confusion) ?');
  }

  const srcIds = new Set(['BE_112', 'BE_1733']);
  for (const f of findings) f.src.forEach((s) => srcIds.add(s));
  const tipList = [...tips].map((k) => TIPS[k]);
  tipList.forEach((t) => t.src.forEach((s) => srcIds.add(s)));
  prevention.forEach((x) => x.src.forEach((s) => srcIds.add(s)));

  return {
    level,
    label: LEVELS[level].label,
    tone: LEVELS[level].tone,
    understood: parts.join(' · '),
    findings: findings.sort((a, c) => ORDER.indexOf(a.lvl) - ORDER.indexOf(c.lvl)),
    actions: ACTIONS[level],
    tips: tipList,
    prevention,
    when: WHEN,
    news2: score,
    questions: questions.slice(0, 3),
    sources: [...srcIds].map((id) => ({ id, ...SOURCES[id] })),
  };
}
