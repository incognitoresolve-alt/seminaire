// Partenaire commercial de l'événement. Mettre enabled:false pour tout masquer (front + API).
// Mentions obligatoires (FSMA / Code de droit économique) : statut, mandant, n° FSMA, n° BCE.
export const PARTNER = Object.freeze({
  enabled: true,
  brand: '[Nom commercial]',
  person: '[Prénom Nom]',
  status: 'Sous-agent d’assurances',
  principal: '[Agent ou courtier mandant]',
  fsma: '[n° FSMA]',
  bce: '[n° BCE]',
  phone: '[+32 4xx xx xx xx]',
  email: '[contact@exemple.be]',
  address: '[Adresse professionnelle]',
});

export const LEAD_INTERESTS = Object.freeze({
  public: {
    auto: 'Auto / moto',
    habitation: 'Habitation',
    rc_familiale: 'RC vie privée (familiale)',
    hospitalisation: 'Hospitalisation',
    epargne_pension: 'Épargne-pension',
    obseques: 'Obsèques',
    autre: 'Autre',
  },
  pro: {
    rc_pro: 'RC professionnelle',
    revenu_garanti: 'Revenu garanti',
    plci: 'PLCI / pension complémentaire',
    hospitalisation: 'Hospitalisation',
    protection_juridique: 'Protection juridique',
    autre: 'Autre',
  },
});
