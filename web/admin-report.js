// Onglet « Rapport ICC » de /admin (clé ADMIN_KEY) : nom, prénom, GSM des personnes reçues au pôle santé
// qui ont accepté de figurer dans le rapport. Aucune donnée de santé ; les autres sont seulement comptées.
import { api, esc } from './api.js';

const $ = (id) => document.getElementById(id);
const day = (ms) => new Date(ms).toLocaleDateString('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'short', day: '2-digit', month: '2-digit' });

export function initReport({ toast, onAuthLost }) {
  let data = { registered: 0, received: 0, consented: 0, rows: [] };

  function render() {
    $('r-registered').textContent = data.registered;
    $('r-received').textContent = data.received;
    $('r-consented').textContent = data.consented;
    const q = $('r-q').value.trim().toLowerCase();
    const rows = data.rows.filter((x) => !q || `${x.last_name} ${x.first_name} ${x.phone || ''}`.toLowerCase().includes(q));
    $('r-list').innerHTML = rows
      .map(
        (x) => `<tr class="border-b border-slate-200">
          <td class="py-2 pr-3 font-semibold">${esc(x.last_name)}</td>
          <td class="py-2 pr-3">${esc(x.first_name)}</td>
          <td class="py-2 pr-3 whitespace-nowrap">${x.phone ? `<a class="text-sky-800 underline" href="tel:${esc(x.phone.replace(/[^+\d]/g, ''))}">${esc(x.phone)}</a>` : '<span class="text-slate-500">non communiqué</span>'}</td>
          <td class="py-2 whitespace-nowrap text-slate-600">${esc(day(x.created_at))}</td>
        </tr>`,
      )
      .join('');
    $('r-empty').textContent = rows.length ? '' : data.rows.length ? 'Aucun résultat' : 'Personne pour le moment (personnes reçues ayant accepté de figurer dans le rapport).';
  }

  async function load() {
    try {
      data = await api('/admin/report');
      render();
    } catch (e) {
      if (e.status === 401 || e.status === 403) return onAuthLost();
      toast('Chargement du rapport impossible', 'error');
    }
  }

  $('r-q').addEventListener('input', render);
  $('r-refresh').addEventListener('click', () => load().then(() => toast('À jour ✓')));
  return { load };
}
