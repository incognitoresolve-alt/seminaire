// Accès staff « sans compte » : un code PIN d'événement partagé => cookie de session signé HMAC.
// Changer STAFF_PIN ou SESSION_SECRET révoque instantanément toutes les sessions.
import { HttpError } from './http.js';

const COOKIE = '__Host-sem';
export const SESSION_TTL_MS = 14 * 3600 * 1000;
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmacKey(env) {
  // Fail-closed : pas de secret => aucun accès staff.
  if (!env.STAFF_PIN || env.STAFF_PIN.length < 8 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'not_configured');
  return crypto.subtle.importKey('raw', enc.encode(`${env.SESSION_SECRET}\u0000${env.STAFF_PIN}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function checkPin(pin, env) {
  if (!env.STAFF_PIN || env.STAFF_PIN.length < 8) throw new HttpError(503, 'not_configured'); // PIN court = refus (fail-closed)
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(pin ?? ''))),
    crypto.subtle.digest('SHA-256', enc.encode(env.STAFF_PIN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function sessionCookie(env) {
  const payload = String(Date.now() + SESSION_TTL_MS);
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** @returns {Promise<number>} expiration (ms) — lève 401 sinon. */
export async function requireStaff(req, env) {
  const raw = (req.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  const value = raw?.slice(COOKIE.length + 1) || '';
  const [payload, sig] = value.split('.');
  const exp = Number(payload);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) throw new HttpError(401, 'unauthorized');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(sig), enc.encode(payload));
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
  if (!ok) throw new HttpError(401, 'unauthorized');
  return exp;
}
