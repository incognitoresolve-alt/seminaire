// Encart partenaire : discret visuellement, mais toujours identifié « Publicité » (art. VI.97 CDE).
// Jamais affiché dans une fiche patient, un résultat de triage ou à côté de données de santé.
import { esc } from './api.js';
import { PARTNER } from './shared/partner.js';

const HIDE_KEY = 'sem-partner-hidden';
const COPY = {
  public: {
    title: 'Protéger sa famille, c’est aussi anticiper',
    text: 'Épargne-pension, couverture décès, assurance obsèques : un bilan assurance-vie gratuit et sans engagement, quand vous le souhaitez.',
    cta: 'Demander un bilan',
  },
  pro: {
    title: 'Soignants : votre propre protection compte aussi',
    text: 'PLCI, pension INAMI des conventionnés, couverture décès : préparez votre pension d’indépendant avec un bilan gratuit.',
    cta: 'En savoir plus',
  },
};

export const partnerLegal = () =>
  `${esc(PARTNER.brand)} · ${esc(PARTNER.status)} pour ${esc(PARTNER.principal)} · FSMA n° ${esc(PARTNER.fsma)}${PARTNER.bce && PARTNER.bce !== PARTNER.fsma ? ` · BCE ${esc(PARTNER.bce)}` : ''}`;

/** Mention « plateforme proposée par » : pied de page de toutes les pages. */
export function mountCredit(root = document) {
  if (!PARTNER.enabled) return;
  for (const el of root.querySelectorAll('[data-partner-credit]')) {
    el.innerHTML = `
      <p class="text-xs leading-relaxed text-slate-500">
        CheckSanté a été proposé par <a class="font-semibold text-slate-700 underline" href="/partenaire">${esc(PARTNER.person)}</a>,
        ${esc(PARTNER.status.charAt(0).toLowerCase() + PARTNER.status.slice(1))} pour ${esc(PARTNER.principal)} · FSMA n° ${esc(PARTNER.fsma)}<br>
        <a class="underline" href="tel:${esc(PARTNER.phoneHref)}">${esc(PARTNER.phone)}</a> ·
        <a class="underline" href="mailto:${esc(PARTNER.email)}">${esc(PARTNER.email)}</a>
      </p>`;
  }
}

export function mountPartner(root = document) {
  mountCredit(root);
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
      <aside aria-label="Publicité" class="relative border-t border-slate-200 pt-3 text-left text-xs leading-snug text-slate-500">
        <p class="pr-8"><span class="font-semibold">Publicité —</span> <span class="font-semibold text-slate-600">${c.title}.</span> ${c.text}
          <a class="font-semibold whitespace-nowrap text-sky-800 underline" href="/partenaire?pour=${aud}">${c.cta} →</a></p>
        <p class="mt-1 text-[11px]">${partnerLegal()}</p>
        ${dismissible ? '<button type="button" data-partner-hide class="absolute top-1 right-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Masquer cette publicité">✕</button>' : ''}
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
