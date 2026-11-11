// Médecins bénévoles de l'événement : SOURCE UNIQUE (consentement, fiche soignant, filtres).
// Pour afficher leur nom : remplacer « Médecin 1 » par « Dr Dupont », etc.
export const DOCTORS = Object.freeze({
  1: { short: 'Dr 1', name: 'Médecin 1', day: 'mercredi 11/11', label: 'Médecin 1 · Mer. 11/11' },
  2: { short: 'Dr 2', name: 'Médecin 2', day: 'samedi 14/11', label: 'Médecin 2 · Sam. 14/11' },
});
export const doctorsSentence = () => `${DOCTORS[1].name} (${DOCTORS[1].day}) ou ${DOCTORS[2].name} (${DOCTORS[2].day})`;
