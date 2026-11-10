// Partenaire commercial de l'événement. Mettre enabled:false pour tout masquer (front + API).
// Inscription FSMA : sous-agent d'assurances belges, activités IDD ILP + OLP (ASSURANCE-VIE UNIQUEMENT).
// => ne JAMAIS annoncer de produits non-vie (auto, habitation, RC, hospitalisation, revenu garanti…)
//    tant que l'inscription ne couvre pas cette activité.
export const PARTNER = Object.freeze({
  enabled: true,
  brand: 'Boris Y. AKOE',
  person: 'Boris Y. AKOE',
  status: 'Sous-agent d’assurances (assurance-vie)',
  principal: 'Comopolis',
  fsma: '0803.683.897',
  bce: '0803.683.897',
  phone: '0467 83 49 68',
  phoneHref: '+32467834968',
  email: 'yaoakoe.pro@gmail.com',
  address: '',
});

export const LEAD_INTERESTS = Object.freeze({
  public: {
    epargne_pension: 'Épargne-pension',
    epargne_long_terme: 'Épargne à long terme',
    placement: 'Assurance-placement (branche 23)',
    deces: 'Assurance décès / solde restant dû',
    obseques: 'Assurance obsèques',
    autre: 'Autre question (assurance-vie)',
  },
  pro: {
    plci: 'PLCI (indépendants)',
    inami: 'Pension INAMI (prestataires conventionnés)',
    epargne_pension: 'Épargne-pension',
    deces: 'Couverture décès',
    placement: 'Assurance-placement (branche 23)',
    autre: 'Autre question (assurance-vie)',
  },
});
