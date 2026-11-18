// E-mail au médecin (transmission de la fiche) + trame d'appel au patient. Source unique : /admin ET tests.
// Message strictement médical : aucune publicité (données de santé, RGPD art. 9 ; séparation pôle santé / partenaire).
const TZ = { timeZone: 'Europe/Brussels' };
export const dDay = (ms) => new Date(ms).toLocaleDateString('fr-BE', { ...TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
export const iso = (s) => (s ? String(s).split('-').reverse().join('/') : '');

// Couleur de la consultation (triage indicatif) → constat + objet de l'appel proposé.
const LEVELS = {
  3: ['Rouge', 'paramètres à revoir rapidement', 'vous voir rapidement pour en parler'],
  2: ['Orange', 'paramètres à contrôler', 'faire le point avec vous lors d’une consultation'],
  1: ['Vert', 'pas d’anomalie relevée', 'en discuter lors de votre prochaine visite'],
  0: ['À mesurer', 'mesures incomplètes', 'compléter ces mesures au cabinet'],
};
const level = (t) => LEVELS[Number(t)] ?? LEVELS[0];
// « Dr Dupont » ou « Docteur Dupont » : pas de « Docteur Dr Dupont ».
const doctor = (n) => (!n ? 'Docteur' : /^(dr|docteur)\b/i.test(n.trim()) ? n.trim() : `Docteur ${n.trim()}`);

export function gpMail(x) {
  const [color, finding, purpose] = level(x.triage);
  const date = dDay(x.created_at);
  const who = `${x.first_name} ${x.last_name}, né(e) le ${iso(x.birth_date)}`;
  const intro = x.no_gp
    ? `Nous vous transmettons la fiche de ${who}, reçu(e) au pôle santé du séminaire spécial d’Impact Centre Chrétien Liège le ${date}. Cette personne n’avait pas de médecin traitant et a autorisé la transmission de ses données.`
    : `Votre patient(e) ${who}, a été reçu(e) au pôle santé du séminaire spécial d’Impact Centre Chrétien Liège le ${date} et a autorisé la transmission de ses données à son médecin traitant.`;
  return {
    subject: `Fiche de transmission – ${x.last_name} ${x.first_name} (né(e) le ${iso(x.birth_date)})`,
    body: `Bonjour ${doctor(x.gp_name)},

${intro}

Priorité indicative : ${color} (${finding}). Triage automatique, à votre appréciation.
Fiche en pièce jointe (PDF) : mesures, notes et preuve de son accord.${x.phone ? `\nTéléphone du patient : ${x.phone}` : ''}

Proposition d’appel au patient (trame à adapter) :
« Bonjour ${x.first_name} ${x.last_name}, ici le cabinet du ${doctor(x.gp_name)}. Le pôle santé du séminaire d’ICC Liège nous a transmis, avec votre accord, les mesures prises le ${date}. Le docteur souhaite ${purpose}. Quand seriez-vous disponible ? Avez-vous des questions d’ici là ? »

Bien cordialement,
Pôle santé – Séminaire spécial ICC Liège`,
  };
}

export const mailto = (to, { subject, body }) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
