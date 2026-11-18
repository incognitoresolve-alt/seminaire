// PDF de la fiche de transmission, généré DANS LE NAVIGATEUR (aucune donnée de santé envoyée à un service tiers).
// Chargé à la demande depuis /admin (onglet Envois) ; même contenu que la page /fiche (web/shared/fiche-model.js).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { EVENT_LINE, FOLD, TITLE, ficheModel } from './shared/fiche-model.js';

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  ink: hex('#0f172a'), muted: hex('#475569'), soft: hex('#64748b'), line: hex('#e2e8f0'), line2: hex('#cbd5e1'),
  sky7: hex('#0369a1'), sky8: hex('#075985'), sky9: hex('#0c4a6e'),
  red50: hex('#fef2f2'), red2: hex('#fecaca'), red7: hex('#b91c1c'), red8: hex('#991b1b'),
  em50: hex('#ecfdf5'), em2: hex('#a7f3d0'), em8: hex('#065f46'), em9: hex('#064e3b'),
  sl50: hex('#f8fafc'),
};
const TRIAGE_COLOR = [hex('#94a3b8'), hex('#059669'), hex('#f59e0b'), hex('#dc2626')];

// Polices standard (WinAnsi) : on remplace les rares caractères non encodables plutôt que d'échouer.
const WIN = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const SUB = { '₂': '2', '→': '–', '≥': '>=', '≤': '<=', '✓': '', '✗': 'X', ' ': ' ', ' ': ' ', ' ': ' ' };
export function winAnsi(s) {
  let o = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (ch in SUB) o += SUB[ch];
    else if (ch in FOLD) o += FOLD[ch];
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN.has(ch) || ch === '\n') o += ch;
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      o += base && [...base].every((b) => b.codePointAt(0) < 0x7f) ? base : '?';
    }
  }
  return o;
}

export async function buildFichePdf(data, now = new Date()) {
  const m = ficheModel(data, now);
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(m.docTitle));
  pdf.setAuthor('Pôle santé – Séminaire spécial ICC Liège');
  pdf.setCreator('CheckSanté');
  pdf.setLanguage('fr-BE');
  const F = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), m: await pdf.embedFont(StandardFonts.Courier) };

  const W = 595.28, Hh = 841.89, M = 44, BOTTOM = 44, CW = W - 2 * M;
  let page, y;
  const newPage = () => ((page = pdf.addPage([W, Hh])), (y = Hh - M));
  const ensure = (h) => y - h < BOTTOM && newPage();
  const width = (t, f, s) => f.widthOfTextAtSize(t, s);
  function wrap(text, f, s, maxW) {
    const out = [];
    for (const para of winAnsi(text).split('\n')) {
      let line = '';
      for (const word of para.split(/ +/)) {
        const cand = line ? `${line} ${word}` : word;
        if (width(cand, f, s) <= maxW) line = cand;
        else {
          if (line) out.push(line);
          line = word;
          while (width(line, f, s) > maxW) { // mot trop long (empreinte, e-mail) : coupure forcée
            let i = line.length;
            while (i > 1 && width(line.slice(0, i), f, s) > maxW) i--;
            out.push(line.slice(0, i));
            line = line.slice(i);
          }
        }
      }
      out.push(line);
    }
    return out;
  }
  const text = (t, x, yy, f, s, color = C.ink) => page.drawText(winAnsi(t), { x, y: yy, font: f, size: s, color });
  function para(t, { f = F.r, s = 9.5, color = C.ink, x = M, w = CW, lh = 1.35, gap = 0 } = {}) {
    for (const l of wrap(t, f, s, w)) {
      ensure(s * lh);
      y -= s * lh;
      text(l, x, y + s * 0.25, f, s, color);
    }
    y -= gap;
  }
  function heading(t) {
    ensure(40);
    y -= 18;
    text(t.toUpperCase(), M, y, F.b, 10.5, C.sky9);
    y -= 5;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: C.sky8 });
    y -= 2;
  }
  function rows(list, { strongFirst = false, triageRow = null } = {}) {
    const kw = CW * 0.4, vw = CW - kw - 8;
    list.forEach(([k, v], i) => {
      const f = strongFirst && i === 0 ? F.b : F.r;
      const kl = wrap(k, F.b, 9.5, kw - 8), vl = wrap(v, f, 9.5, vw - (triageRow === k ? 14 : 0));
      const h = Math.max(kl.length, vl.length) * 12 + 6;
      ensure(h);
      const top = y;
      kl.forEach((l, j) => text(l, M, top - 12 - j * 12 + 1.5, F.b, 9.5, C.muted));
      let vx = M + kw;
      if (triageRow === k) {
        page.drawCircle({ x: vx + 4.5, y: top - 12 + 4.5, size: 4.5, color: TRIAGE_COLOR[m.triage] });
        vx += 14;
      }
      vl.forEach((l, j) => text(l, vx, top - 12 - j * 12 + 1.5, f, 9.5));
      y = top - h;
      page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.6, color: C.line });
    });
  }
  function box(lines, { fill, border, pad = 10 }) {
    // lines : [{ t, f, s, color }]
    const wrapped = lines.flatMap((l) => wrap(l.t, l.f, l.s, CW - 2 * pad).map((t) => ({ ...l, t })));
    const h = wrapped.reduce((a, l) => a + l.s * 1.4, 0) + 2 * pad;
    ensure(h + 6);
    y -= 6;
    page.drawRectangle({ x: M, y: y - h, width: CW, height: h, color: fill, borderColor: border, borderWidth: 0.8 });
    let yy = y - pad;
    for (const l of wrapped) {
      yy -= l.s * 1.4;
      text(l.t, M + pad, yy + l.s * 0.3, l.f, l.s, l.color);
    }
    y -= h;
  }

  newPage();
  // En-tête
  text('Check', M, y - 20, F.b, 20);
  text('Santé', M + width('Check', F.b, 20), y - 20, F.b, 20, C.sky7);
  text(EVENT_LINE, M, y - 34, F.b, 8.5, C.muted);
  const badge = 'Confidentiel · données de santé';
  const bw = width(winAnsi(badge), F.b, 8.5) + 16;
  page.drawRectangle({ x: W - M - bw, y: y - 26, width: bw, height: 18, color: C.red50, borderColor: C.red2, borderWidth: 0.8 });
  text(badge, W - M - bw + 8, y - 20.5, F.b, 8.5, C.red8);
  y -= 46;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 3, color: C.sky8 });
  y -= 10;
  para(TITLE, { f: F.b, s: 16, gap: 2 });
  para(`À l’attention de : ${m.to}`, { f: F.b, s: 10 });
  for (const l of m.toContact) para(l, { s: 9.5, color: C.muted });

  heading('Patient');
  rows(m.patient, { strongFirst: true });
  heading(m.consultTitle);
  rows(m.consult, { triageRow: 'Priorité (triage indicatif)' });
  if (m.notes) {
    y -= 8;
    para('Notes cliniques', { f: F.b, s: 9.5, color: C.muted });
    box([{ t: m.notes, f: F.r, s: 9.5, color: C.ink }], { fill: C.sl50, border: C.line2 });
  }

  heading('Preuve de l’accord de transmission');
  box(
    [
      { t: m.consent.headline, f: F.b, s: 10, color: C.em9 },
      ...(m.consent.text ? [{ t: `Texte accepté : « ${m.consent.text} »`, f: F.r, s: 9.5, color: C.ink }, { t: `Moyen : ${m.consent.channel}`, f: F.r, s: 9.5, color: C.ink }] : []),
    ],
    { fill: C.em50, border: C.em2 },
  );
  // Historique des accords
  const cols = [['Date et heure', 0.2], ['Accord', 0.3], ['Décision', 0.15], ['Moyen', 0.22], ['Intégrité', 0.13]];
  const xs = cols.reduce((a, [, w], i) => [...a, i ? a[i - 1] + cols[i - 1][1] * CW : M], []);
  ensure(30);
  y -= 16;
  cols.forEach(([h], i) => text(h, xs[i], y, F.b, 8));
  y -= 5;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: C.line2 });
  const INTEG = { legacy: ['reconstitué', C.soft], ok: ['vérifiée', C.em8], bad: ['ALTÉRÉE', C.red7] };
  for (const e of m.history) {
    const cells = [[e.at, F.r, C.ink], [e.kind, F.r, C.ink], [e.decision, F.b, e.agreed ? C.em8 : C.red8], [e.channel, F.r, C.ink], [INTEG[e.integrity][0], F.b, INTEG[e.integrity][1]]];
    const wr = cells.map(([t, f], i) => wrap(t, f, 8, cols[i][1] * CW - 6));
    const h = Math.max(...wr.map((l) => l.length)) * 10.5 + 6;
    ensure(h);
    const top = y;
    wr.forEach((ls, i) => ls.forEach((l, j) => text(l, xs[i], top - 11 - j * 10.5, cells[i][1], 8, cells[i][2])));
    y = top - h;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.5, color: C.line });
  }
  if (m.seal) {
    y -= 8;
    para('Empreinte du dossier d’accord (SHA-256) :', { f: F.b, s: 8, color: C.muted });
    para(m.seal, { f: F.m, s: 7.5 });
    para(m.intact ? 'Intégrité vérifiée' : 'ATTENTION : une entrée a été modifiée', { f: F.b, s: 8, color: m.intact ? C.em8 : C.red7 });
  }
  y -= 4;
  para(m.legal, { s: 7.5, color: C.muted, lh: 1.3 });

  // Pied de document + numéros de page
  y -= 10;
  ensure(40);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: C.line });
  y -= 2;
  for (const l of m.footer) para(l, { s: 7.5, color: C.soft, lh: 1.3 });
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const t = winAnsi(`${m.docTitle} · page ${i + 1}/${pages.length}`);
    p.drawText(t, { x: W - M - F.r.widthOfTextAtSize(t, 7), y: 22, font: F.r, size: 7, color: C.soft });
  });
  return { bytes: await pdf.save(), fileName: m.fileName };
}
