// Encart partenaire : discret visuellement, mais toujours identifié « Publicité » (art. VI.97 CDE).
// Jamais affiché dans une fiche patient, un résultat de triage ou à côté de données de santé.
import { esc } from './api.js';
import { PARTNER } from './shared/partner.js';

const HIDE_KEY = 'sem-partner-hidden';
const COPY = {
  public: {
    title: 'Protéger sa famille, c’est aussi anticiper',
    text: 'Auto, habitation, RC familiale, hospitalisation, épargne-pension : un bilan gratuit et sans engagement, quand vous le souhaitez.',
    cta: 'Demander un bilan',
  },
  pro: {
    title: 'Soignants : votre propre protection compte aussi',
    text: 'RC professionnelle, revenu garanti, PLCI, hospitalisation : un bilan gratuit pour les professionnels de santé.',
    cta: 'En savoir plus',
  },
};

export const partnerLegal = () =>
  `${esc(PARTNER.brand)} · ${esc(PARTNER.status)} pour le compte de ${esc(PARTNER.principal)} · FSMA n° ${esc(PARTNER.fsma)} · BCE ${esc(PARTNER.bce)}`;

export function mountPartner(root = document) {
  if (!PARTNER.enabled) return;
  for (const el of root.querySelectorAll('[data-partner]')) {
    const aud = el.dataset.partner === 'pro' ? 'pro' : 'public';
    const dismissible = el.hasAttribute('data-dismissible');
    try {
      if (dismissible && localStorage.getItem(HIDE_KEY)) continue;
    } catch {
      /* ignore */
    }
    const c = COPY[aud];
    el.innerHTML = `
      <aside aria-label="Publicité" class="relative rounded-2xl border border-slate-200 bg-white p-4 text-left">
        <p class="text-[11px] font-bold tracking-widest text-slate-500 uppercase">Publicité · Partenaire de l’événement</p>
        <p class="mt-1 pr-8 font-bold text-slate-900">${c.title}</p>
        <p class="mt-1 text-sm text-slate-600">${c.text}</p>
        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <a class="btn-ghost min-h-10 py-2 text-sm" href="/partenaire?pour=${aud}">${c.cta}</a>
          <p class="text-[11px] leading-snug text-slate-500">${partnerLegal()}</p>
        </div>
        ${dismissible ? '<button type="button" data-partner-hide class="absolute top-2 right-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Masquer cette publicité">✕</button>' : ''}
      </aside>`;
    el.querySelector('[data-partner-hide]')?.addEventListener('click', () => {
      el.innerHTML = '';
      try {
        localStorage.setItem(HIDE_KEY, '1');
      } catch {
        /* ignore */
      }
    });
  }
}
