// Adresse publique du site pour l'affiche QR : jamais localhost, réseau local, http, port ou identifiants.
const LOCAL = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|\.(local|localhost|internal|lan|home)$/i;
export const isPublic = (host) => host.includes('.') && !host.startsWith('[') && !LOCAL.test(host);

/** Adresse saisie → origine https publique, sinon null (fail-closed). */
export function parseSite(value) {
  const v = String(value || '').trim();
  if (!v) return null;
  try {
    const u = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !isPublic(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

