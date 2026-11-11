// Sources des seuils et conseils (vérifiées le 11/11/2026). Ne jamais ajouter une source non vérifiée.
// tier : 'BE' = source belge, 'INT' = référence internationale, 'APP' = seuil de prudence interne (sans source).
export const SOURCES = Object.freeze({
  NEWS2: {
    tier: 'INT', short: 'RCP NEWS2, 2017', institution: 'Royal College of Physicians (Royaume-Uni)',
    title: 'National Early Warning Score (NEWS) 2 — charts 1 à 4', url: 'https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/', date: '2017 (révision annoncée)',
    info: 'Score d’alerte adulte (respiration, SpO2, tension systolique, pouls, conscience, température) : total 5–6 = réponse urgente, 7 ou plus = réponse d’urgence ; un seul paramètre à 3 = évaluation urgente.',
  },
  ESC_HTA: {
    tier: 'INT', short: 'ESC, 2024', institution: 'European Society of Cardiology',
    title: '2024 ESC Guidelines for the management of elevated blood pressure and hypertension', url: 'https://doi.org/10.1093/eurheartj/ehae178', date: '2024',
    info: 'Hypertension : tension au cabinet ≥ 140/90 mmHg ; « tension élevée » : 120–139/70–89 mmHg ; à partir de 180/110 mmHg, rechercher une urgence hypertensive ; diagnostic à confirmer par des mesures répétées.',
  },
  NHS_SPO2: {
    tier: 'INT', short: 'NHS England, 2020–2021', institution: 'NHS England',
    title: 'COVID Oximetry @home — standard operating procedure', url: 'https://www.england.nhs.uk/coronavirus/documents/covid-19-standard-operating-procedure-covid-oximetry-home/', date: '2020–2021 (contexte COVID-19)',
    info: 'SpO2 de 92 % ou moins (confirmée) : aide urgente ; 93–94 % : contacter un médecin ; grossesse : 94 % ou moins = évaluation à l’hôpital. Refaire la mesure mains chaudes, sans vernis, main immobile.',
  },
  NICE_FEVER: {
    tier: 'INT', short: 'NICE NG143, 2019', institution: 'National Institute for Health and Care Excellence',
    title: 'Fever in under 5s: assessment and initial management (NG143)', url: 'https://www.nice.org.uk/guidance/ng143', date: '2019',
    info: 'Moins de 3 mois avec 38 °C ou plus : risque élevé ; 3–6 mois avec 39 °C ou plus : risque au moins intermédiaire ; respiration > 50/min (6–12 mois) ou > 40/min (> 12 mois) ; pouls > 160 (< 12 mois), > 150 (12–24 mois), > 140 (2–5 ans) ; SpO2 ≤ 95 % à l’air.',
  },
  NICE_PREG: {
    tier: 'INT', short: 'NICE NG133, 2019', institution: 'National Institute for Health and Care Excellence',
    title: 'Hypertension in pregnancy: diagnosis and management (NG133)', url: 'https://www.nice.org.uk/guidance/ng133', date: 'publiée le 25/06/2019, mise à jour le 17/04/2023',
    info: 'Hypertension de grossesse : 140/90 à 159/109 mmHg ; hypertension sévère : 160/110 mmHg ou plus (évaluation spécialisée sans délai).',
  },
  ADA_HYPO: {
    tier: 'INT', short: 'ADA, 2025', institution: 'American Diabetes Association',
    title: 'Standards of Care in Diabetes — Hypoglycemia (fiche professionnels)', url: 'https://professional.diabetes.org/sites/dpro/files/2025-05/hypoglycemia-hcp-5-27-25.pdf', date: '2025',
    info: 'Hypoglycémie niveau 1 : < 70 mg/dL (3,9 mmol/L), à traiter ; niveau 2 : < 54 mg/dL (3,0 mmol/L), cliniquement significative ; niveau 3 : altération de la conscience nécessitant une aide.',
  },
  WHO_DIAB: {
    tier: 'INT', short: 'OMS, 2006', institution: 'Organisation mondiale de la Santé',
    title: 'Definition and diagnosis of diabetes mellitus and intermediate hyperglycaemia', url: 'https://www.who.int/publications/i/item/definition-and-diagnosis-of-diabetes-mellitus-and-intermediate-hyperglycaemia', date: '2006',
    info: 'Glycémie à jeun ≥ 126 mg/dL (7,0 mmol/L) ou glycémie aléatoire ≥ 200 mg/dL (11,1 mmol/L) avec symptômes : évocateur de diabète ; sans symptômes, une valeur isolée ne suffit pas et doit être confirmée.',
  },
  WHO_BMI: {
    tier: 'INT', short: 'OMS, fiche obésité', institution: 'Organisation mondiale de la Santé',
    title: 'Obesity and overweight — fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight', date: 'mise à jour régulière',
    info: 'Adulte : surpoids si IMC ≥ 25, obésité si IMC ≥ 30 ; l’IMC est un repère approximatif ; seuils différents chez l’enfant.',
  },
  LCB_112: {
    tier: 'BE', short: 'Ligue Cardiologique Belge', institution: 'Ligue Cardiologique Belge',
    title: 'Symptômes de crise cardiaque ou d’AVC : appeler le 112', url: 'https://liguecardioliga.be/', date: 'consigne publique rappelée en 2020',
    info: 'En cas de symptômes de crise cardiaque (douleur ou oppression thoracique, essoufflement, sueurs, douleur irradiant dans le bras ou la mâchoire) ou d’AVC : appeler immédiatement le 112.',
  },
  HAS_AVC: {
    tier: 'INT', short: 'HAS, AVC', institution: 'Haute Autorité de Santé (France)',
    title: 'Accident vasculaire cérébral — des signes d’alerte à votre retour à domicile', url: 'https://has-sante.fr/jcms/p_3701212/en/accident-vasculaire-cerebral-des-signes-d-alerte-a-votre-retour-a-domicile', date: 'date non vérifiée',
    info: 'Signes d’alerte d’AVC (visage paralysé, bras qui retombe, trouble de la parole) : appeler les secours immédiatement, même si les signes disparaissent.',
  },
  BE_112: {
    tier: 'BE', short: '112.be', institution: 'Centrales d’urgence 112 (SPF Intérieur)',
    title: '112 — numéro d’urgence européen en Belgique', url: 'https://www.112.be/', date: 'site officiel du gouvernement fédéral',
    info: 'Le 112 est le numéro d’urgence gratuit pour les ambulances et les pompiers (police : 101) ; en cas de doute sur la gravité, appeler le 112. Médecin de garde : 1733.',
  },
  BE_1733: {
    tier: 'BE', short: '1733 (garde de médecine générale)', institution: 'SPF Santé publique — projet 1733 (source : presse spécialisée)',
    title: 'Garde de médecine générale : le numéro 1733', url: 'https://www.lespecialiste.be/fr/actualites/vandenbroucke-veut-reprendre-le-numero-1733-au-ministere-de-l-interieur.html', date: '2024',
    info: 'Le 1733 donne accès au médecin de garde (soirs, week-ends, jours fériés) ; le 112 reste réservé aux urgences vitales.',
  },
  BE_CRC: {
    tier: 'BE', short: 'CCRef / Bruprev', institution: 'Centre communautaire de référence pour le dépistage des cancers (Wallonie) / Bruprev (Bruxelles)',
    title: 'Dépistage du cancer colorectal', url: 'https://www.ccref.org/particulier', date: 'programme en cours (kit en pharmacie wallonne depuis 2024)',
    info: 'Test de dépistage gratuit tous les 2 ans pour les personnes de 50 à 74 ans (médecin généraliste, pharmacie ou commande en ligne).',
  },
  CSS_GRIPPE: {
    tier: 'BE', short: 'CSS, avis grippe', institution: 'Conseil Supérieur de la Santé',
    title: 'Vaccination contre la grippe saisonnière — avis annuel (n° 9879 pour 2025-2026, nouvel avis 2026-2027)', url: 'https://www.nitag-resource.org/sites/default/files/2025-08/CSS-9879_Avis%20grippe%2025-26_vWeb.pdf', date: '2025 (avis 2026-2027 publié en 2026)',
    info: 'Vaccination recommandée à partir de la mi-octobre pour les groupes à risque, dont les personnes de 65 ans et plus (vaccin renforcé recommandé).',
  },
  BE_TETANOS: {
    tier: 'BE', short: 'vaccination-info.be', institution: 'Vaccination-info (Fédération Wallonie-Bruxelles)',
    title: 'Carte de vaccination — rappels de l’adulte', url: 'https://www.vaccination-info.be/wp-content/uploads/2019/03/carte_vaccination.pdf', date: '2019',
    info: 'Rappel diphtérie-tétanos (avec coqueluche) tous les 10 ans chez l’adulte.',
  },
  APP: {
    tier: 'APP', short: 'Seuil de prudence CheckSanté', institution: 'CheckSanté (aucune source officielle trouvée)',
    title: 'Seuil interne de prudence — à valider par les médecins de l’événement', url: '', date: '',
    info: 'Valeur retenue par prudence en l’absence de référence officielle trouvée ; elle ne repose sur aucune recommandation publiée.',
  },
});
