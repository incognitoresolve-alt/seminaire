import { api } from './api.js';

// Confirmation par bouton : évite qu'un antivirus qui « visite » le lien ne désinscrive à la place de la personne.
const t = new URLSearchParams(location.hash.slice(1)).get('t');
const btn = document.getElementById('go');
const msg = document.getElementById('msg');
if (!t) {
  btn.hidden = true;
  msg.textContent = 'Lien incomplet. Écrivez « STOP » en réponse à l’e-mail reçu.';
}
btn.addEventListener('click', async () => {
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    await api('/partner/unsubscribe', { method: 'POST', body: { t } });
    history.replaceState(null, '', location.pathname); // jeton retiré de l'adresse
    btn.hidden = true;
    msg.textContent = 'C’est fait : vos coordonnées ont été supprimées. Vous ne recevrez plus de message.';
  } catch {
    btn.disabled = false;
    msg.textContent = 'Échec de la désinscription, réessayez ou répondez « STOP » à l’e-mail.';
  }
});
