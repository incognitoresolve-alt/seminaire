// E-mail « check-up couverture » envoyé UNIQUEMENT aux personnes ayant donné leur accord (partner_leads).
// Fournisseur : Brevo (UE). Sans BREVO_API_KEY / MAIL_FROM : aucun envoi (la demande reste enregistrée).
import { PARTNER } from '../web/shared/partner.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dateFr = (ms) => new Date(ms).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Brussels' });

export function buildCheckupMail(lead, origin) {
  const first = lead.name.split(' ')[0];
  const unsubPage = `${origin}/desinscription#t=${lead.unsub_token}`;
  const status = PARTNER.status.charAt(0).toLowerCase() + PARTNER.status.slice(1);
  const subject = 'Votre check-up couverture gratuit';
  const legal = `${PARTNER.person} · ${PARTNER.status} pour ${PARTNER.principal} · FSMA n° ${PARTNER.fsma}`;
  const footer = `Vous recevez ce message car vous avez demandé un check-up couverture sur CheckSanté le ${dateFr(lead.consent_at)}. Aucune donnée de santé n’a été transmise. Réclamations : Ombudsman des Assurances (ombudsman-insurance.be).`;

  const text = `Bonjour ${first},

Merci pour votre participation à la Semaine de la santé d’ICC Liège et pour votre intérêt pour le check-up gratuit de votre couverture.

Je vous propose un échange d’environ 20 minutes, gratuit et sans engagement, par téléphone ou en rendez-vous, pour faire le point ensemble sur :
- votre épargne-pension et la préparation de votre retraite ;
- la protection de vos proches en cas de décès ;
- l’assurance obsèques, si le sujet vous concerne.

Pour choisir un moment, répondez simplement à cet e-mail ou appelez-moi au ${PARTNER.phone}.

Bien à vous,
${PARTNER.person}
${status} pour ${PARTNER.principal} · FSMA n° ${PARTNER.fsma}
${PARTNER.phone} · ${PARTNER.email}

--
${footer}
Ne plus recevoir de message (vos coordonnées seront supprimées) : ${unsubPage}`;

  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:1.6">
<p style="margin:0 0 16px">Bonjour ${esc(first)},</p>
<p style="margin:0 0 16px">Merci pour votre participation à la Semaine de la santé d’ICC Liège et pour votre intérêt pour le <strong>check-up gratuit de votre couverture</strong>.</p>
<p style="margin:0 0 8px">Je vous propose un échange d’environ 20 minutes, gratuit et sans engagement, par téléphone ou en rendez-vous, pour faire le point ensemble sur :</p>
<ul style="margin:0 0 16px;padding-left:20px"><li>votre épargne-pension et la préparation de votre retraite ;</li><li>la protection de vos proches en cas de décès ;</li><li>l’assurance obsèques, si le sujet vous concerne.</li></ul>
<p style="margin:0 0 20px">Pour choisir un moment, répondez simplement à cet e-mail ou appelez-moi au <a href="tel:${esc(PARTNER.phoneHref)}" style="color:#5b1f8c">${esc(PARTNER.phone)}</a>.</p>
<p style="margin:0 0 4px">Bien à vous,</p>
<p style="margin:0;font-weight:bold">${esc(PARTNER.person)}</p>
<p style="margin:0;font-size:13px;color:#475569">${esc(status)} pour ${esc(PARTNER.principal)} · FSMA n° ${esc(PARTNER.fsma)}<br>${esc(PARTNER.phone)} · <a href="mailto:${esc(PARTNER.email)}" style="color:#5b1f8c">${esc(PARTNER.email)}</a></p>
</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:11px;line-height:1.5;color:#64748b;border-top:1px solid #e2e8f0">
Publicité · ${esc(legal)}<br>${esc(footer)}<br>
<a href="${esc(unsubPage)}" style="color:#64748b">Ne plus recevoir de message</a> (vos coordonnées seront supprimées).
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** @returns {Promise<'sent'|'skipped'>} */
export async function sendCheckupMail(env, lead, origin) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM || !lead.email || !lead.unsub_token) return 'skipped';
  const { subject, text, html } = buildCheckupMail(lead, origin);
  const res = await fetch(env.MAIL_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: `${PARTNER.person} · CheckSanté`, email: env.MAIL_FROM },
      replyTo: { email: PARTNER.email, name: PARTNER.person },
      to: [{ email: lead.email, name: lead.name }],
      subject,
      htmlContent: html,
      textContent: text,
      headers: {
        'List-Unsubscribe': `<${origin}/api/partner/unsubscribe?t=${lead.unsub_token}>, <mailto:${PARTNER.email}?subject=STOP>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: ['checkup'],
    }),
    signal: AbortSignal.timeout(8000), // ne bloque jamais : exécuté en arrière-plan
  });
  if (!res.ok) throw new Error(`mail_http_${res.status}`);
  return 'sent';
}
