import { mountCredit } from './partner-ui.js';
import { qrSvg } from './qr.js';

mountCredit();

// /affiche → inscription ; /affiche?cible=questionnaire → questionnaire anonyme
const survey = new URLSearchParams(location.search).get('cible') === 'questionnaire';
const url = `${location.origin}/${survey ? 'questionnaire' : ''}`;
document.getElementById('title').textContent = survey ? 'Questionnaire de prévention (anonyme)' : 'Scannez pour vous inscrire';
document.getElementById('qr').innerHTML = qrSvg(url, { label: `QR code vers ${url}` });
document.getElementById('url').textContent = url.replace(/^https?:\/\//, '');
document.getElementById('print').addEventListener('click', () => print());
