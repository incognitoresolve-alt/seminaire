export const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store',
};

export class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

export async function readJson(req, max = 8192) {
  if (!(req.headers.get('Content-Type') || '').startsWith('application/json')) throw new HttpError(415, 'unsupported_media_type');
  const len = Number(req.headers.get('Content-Length') || 0);
  if (len > max) throw new HttpError(413, 'payload_too_large');
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

/** Anti-CSRF / CSWSH : l'origine doit être celle de l'application. */
export function assertSameOrigin(req, url) {
  if (req.headers.get('Origin') !== url.origin) throw new HttpError(403, 'bad_origin');
}

export const clientIp = (req) => req.headers.get('CF-Connecting-IP') || '0.0.0.0';

export async function rateLimit(binding, key) {
  if (!binding) return; // binding non configuré (dev) : pas de limitation
  const { success } = await binding.limit({ key });
  if (!success) throw new HttpError(429, 'rate_limited');
}
