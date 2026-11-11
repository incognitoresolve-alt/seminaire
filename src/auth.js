// Accès « sans compte » par code partagé => cookie de session signé HMAC.
// Deux rôles strictement séparés :
//  - staff   : soignants (STAFF_PIN, 8+ car.) — patients, mesures, questionnaire ;
//  - partner : partenaire assurance (PARTNER_KEY, 16+ car.) — UNIQUEMENT ses demandes de contact.
// Changer le code ou SESSION_SECRET révoque instantanément toutes les sessions du rôle.
import { HttpError } from './http.js';

export const SESSION_TTL_MS = 14 * 3600 * 1000;
const ROLES = {
  staff: { cookie: '__Host-sem', secret: (env) => env.STAFF_PIN, min: 8 },
  partner: { cookie: '__Host-partner', secret: (env) => env.PARTNER_KEY, min: 16 },
};
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function secretOf(role, env) {
  const s = ROLES[role].secret(env);
  // Fail-closed : code absent ou trop court => aucun accès pour ce rôle.
  if (!s || s.length < ROLES[role].min) throw new HttpError(503, 'not_configured');
  return s;
}

async function hmacKey(role, env) {
  const s = secretOf(role, env);
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, 'not_configured');
  return crypto.subtle.importKey('raw', enc.encode(`${env.SESSION_SECRET}\u0000${role}\u0000${s}`), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function checkSecret(role, value, env) {
  const s = secretOf(role, env);
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(value ?? ''))), crypto.subtle.digest('SHA-256', enc.encode(s))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function makeCookie(role, env) {
  const payload = String(Date.now() + SESSION_TTL_MS);
  const sig = b64u(await crypto.subtle.sign('HMAC', await hmacKey(role, env), enc.encode(payload)));
  return `${ROLES[role].cookie}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export const clearRoleCookie = (role) => `${ROLES[role].cookie}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

/** @returns {Promise<number>} expiration (ms) — lève 401 sinon. */
export async function requireRole(role, req, env) {
  const name = ROLES[role].cookie;
  const raw = (req.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  const [payload, sig] = (raw?.slice(name.length + 1) || '').split('.');
  const exp = Number(payload);
  if (!sig || !Number.isFinite(exp) || exp < Date.now()) throw new HttpError(401, 'unauthorized');
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(role, env), unb64u(sig), enc.encode(payload));
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
  if (!ok) throw new HttpError(401, 'unauthorized');
  return exp;
}

// Raccourcis rôle soignant (compatibilité)
export const checkPin = (pin, env) => checkSecret('staff', pin, env);
export const sessionCookie = (env) => makeCookie('staff', env);
export const clearCookie = () => clearRoleCookie('staff');
export const requireStaff = (req, env) => requireRole('staff', req, env);
