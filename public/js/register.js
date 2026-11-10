import { api } from './api.js';
import { bindIdentityForm, identityFieldsHtml, passCardHtml } from './form.js';
import { mountPartner } from './partner-ui.js';
import { passUrl, qrSvg } from './qr.js';

mountPartner();

const KEY = 'sem-pass';
const form = document.getElementById('reg');
const passEl = document.getElementById('pass');

function showPass(pass) {
  document.getElementById('pass-card').innerHTML = passCardHtml(pass, qrSvg(passUrl(pass.token), { label: 'QR code du Pass Patient' }));
  form.hidden = true;
  passEl.hidden = false;
  scrollTo({ top: 0 });
}

document.getElementById('reg-fields').innerHTML = identityFieldsHtml('r');
bindIdentityForm(form, async (payload) => {
  const { pass } = await api('/register', { method: 'POST', body: payload });
  try {
    localStorage.setItem(KEY, JSON.stringify(pass));
  } catch {
    /* navigation privée */
  }
  showPass(pass);
});

document.getElementById('new-reg').addEventListener('click', () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  passEl.hidden = true;
  form.hidden = false;
  form.elements.last_name.focus();
});

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved?.token) showPass(saved);
} catch {
  /* ignore */
}
