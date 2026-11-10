import qrcode from 'qrcode-generator';

/** SVG sans attribut style (compatible CSP stricte). */
export function qrSvg(text, { label = 'QR code' } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  const s = n + m * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="${label}" class="h-auto w-full"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#0f172a"/></svg>`;
}

export const passUrl = (token) => `${location.origin}/staff#p=${encodeURIComponent(token)}`;
