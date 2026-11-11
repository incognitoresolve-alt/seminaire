import { mountCredit } from './partner-ui.js';
import { qrSvg } from './qr.js';

mountCredit();

// /affiche → auto-inscription ; /affiche?cible=questionnaire → questionnaire anonyme.
// Le QR code pointe toujours vers l'adresse exacte du site ouvert (aucune adresse codée en dur).
const survey = new URLSearchParams(location.search).get('cible') === 'questionnaire';
const url = `${location.origin}/${survey ? 'questionnaire' : ''}`;
const $ = (id) => document.getElementById(id);
if (survey) {
  $('title').textContent = 'Questionnaire santé';
  $('subtitle').textContent = 'Anonyme · 2 minutes';
  document.querySelector('[data-step="2"]').textContent = 'Répondez aux questions';
  document.querySelector('[data-step="3"]').textContent = 'Les bonnes réponses s’affichent à la fin';
  $('switch').textContent = 'Affiche d’inscription';
  $('switch').href = '/affiche';
}
$('qr').innerHTML = qrSvg(url, { label: `QR code vers ${url}` });
$('url').textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
$('print').addEventListener('click', () => print());
