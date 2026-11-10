import { PARTNER } from '../public/js/shared/partner.js';
import { validateIdentity, validateLead, validatePatch, validateSurvey } from '../public/js/shared/validate.js';
import { checkPin, clearCookie, requireStaff, sessionCookie } from './auth.js';
import { HttpError, assertSameOrigin, clientIp, json, rateLimit, readJson } from './http.js';
import { hub } from './hub.js';
import { createLead, createPatient, createSurvey, deletePatient, getDetail, listSince, lookup, purge, surveyStats, updatePatient } from './patients.js';

export { Hub } from './hub.js';

const ID_RE = /^[0-9a-f-]{36}$/;
const passOf = (r) => ({ token: r.token, short_code: r.short_code, first_name: r.first_name, last_name: r.last_name });

function broadcast(env, ctx, msg) {
  ctx.waitUntil(hub(env).broadcast(msg).catch((e) => console.error(JSON.stringify({ evt: 'broadcast_failed', err: String(e?.message) }))));
}

async function register(req, env, ctx, source) {
  const body = await readJson(req);
  if (body?.website) throw new HttpError(400, 'invalid'); // honeypot anti-bot
  const { ok, errors, value } = validateIdentity(body);
  if (!ok) throw new HttpError(422, 'validation', { errors });
  const { row, created } = await createPatient(env, value, source);
  if (created) broadcast(env, ctx, { t: 'upsert', p: row });
  return json(source === 'self' ? { pass: passOf(row) } : { pass: passOf(row), patient: row }, created ? 201 : 200);
}

async function staffRoutes(req, env, ctx, url, path) {
  const method = req.method;

  if (path === '/login' && method === 'POST') {
    await rateLimit(env.RL_LOGIN, clientIp(req));
    const { pin } = await readJson(req, 512);
    if (!(await checkPin(pin, env))) throw new HttpError(401, 'bad_pin');
    return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env) });
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

  // Tout le reste exige une session valide (fail-closed).
  const exp = await requireStaff(req, env);
  await rateLimit(env.RL_API, clientIp(req));

  if (path === '/ws') {
    if (req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'upgrade_required');
    const headers = new Headers(req.headers);
    headers.set('X-Session-Exp', String(exp));
    return hub(env).fetch(new Request(req, { headers }));
  }
  if (path === '/session' && method === 'GET') return json({ ok: true, exp });

  if (path === '/patients' && method === 'GET') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const now = Date.now();
    return json({ now, rows: await listSince(env, since) });
  }
  if (path === '/patients' && method === 'POST') return register(req, env, ctx, 'staff');

  if (path === '/survey-stats' && method === 'GET') return json(await surveyStats(env));

  if (path === '/lookup' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!/^[A-Za-z0-9_-]{6,32}$/.test(q)) throw new HttpError(400, 'invalid');
    const row = await lookup(env, q);
    if (!row) throw new HttpError(404, 'not_found');
    return json({ patient: row });
  }

  const m = path.match(/^\/patients\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (!ID_RE.test(id)) throw new HttpError(400, 'invalid');
    if (method === 'GET') {
      const row = await getDetail(env, id);
      if (!row) throw new HttpError(404, 'not_found');
      return json({ patient: row });
    }
    if (method === 'PATCH') {
      const { ok, errors, value } = validatePatch(await readJson(req, 4096));
      if (!ok) throw new HttpError(422, 'validation', { errors });
      const row = await updatePatient(env, id, value);
      broadcast(env, ctx, { t: 'upsert', p: row });
      return json({ patient: row });
    }
    if (method === 'DELETE') {
      const row = await deletePatient(env, id);
      broadcast(env, ctx, { t: 'delete', p: row });
      return json({ ok: true });
    }
  }
  throw new HttpError(404, 'not_found');
}

async function route(req, env, ctx, url) {
  const path = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req, url);

  if (path === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  }
  if (path === '/api/register' && req.method === 'POST') {
    await rateLimit(env.RL_REGISTER, clientIp(req));
    return register(req, env, ctx, 'self');
  }
  if (path === '/api/survey' && req.method === 'POST') {
    await rateLimit(env.RL_REGISTER, clientIp(req));
    const body = await readJson(req, 16384);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateSurvey(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const created = await createSurvey(env, value);
    if (created) broadcast(env, ctx, { t: 'survey' });
    return json({ ok: true }, created ? 201 : 200);
  }
  if (path === '/api/partner/lead' && req.method === 'POST' && PARTNER.enabled) {
    await rateLimit(env.RL_REGISTER, clientIp(req));
    const body = await readJson(req, 4096);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateLead(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const created = await createLead(env, value);
    return json({ ok: true }, created ? 201 : 200);
  }
  if (path.startsWith('/api/staff/')) {
    if (path === '/api/staff/ws') assertSameOrigin(req, url); // anti cross-site WebSocket hijacking
    return staffRoutes(req, env, ctx, url, path.slice('/api/staff'.length));
  }
  throw new HttpError(404, 'not_found');
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, ctx, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
      // Log sans PII : message technique uniquement.
      console.error(JSON.stringify({ evt: 'unhandled', path: url.pathname, err: String(e?.message || e).slice(0, 300) }));
      return json({ error: 'internal' }, 500);
    }
  },

  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(purge(env));
  },
};
