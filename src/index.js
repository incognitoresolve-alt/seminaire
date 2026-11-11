import { LEAD_INTERESTS, PARTNER } from '../web/shared/partner.js';
import { CONTACT_TIMES, LEAD_STATUS, validateIdentity, validateLead, validateLeadPatch, validateLeadQualify, validatePatch, validateSurvey } from '../web/shared/validate.js';
import { checkPin, checkSecret, clearCookie, clearRoleCookie, hasRole, makeCookie, requireRole, requireStaff, roleConfigured, sessionCookie } from './auth.js';
import { HttpError, assertSameOrigin, clientIp, json, rateLimit, readJson } from './http.js';
import { hub } from './hub.js';
import { ensureSchema } from './schema.js';
import { sendCheckupMail } from './mail.js';
import { alreadyMailed, createLead, deleteLead, deleteLeadByToken, clearSurveys, emptyTrash, eraseFromTrash, listTrash, restoreAll, restorePatient, trashAll, eventStats, listLeads, markMailed, qualifyLead, updateLead, createPatient, createSurvey, deletePatient, getDetail, listSince, purge, surveyStats, updatePatient } from './patients.js';

export { Hub } from './hub.js';

const ID_RE = /^[0-9a-f-]{36}$/;

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
  // Accueil : simple confirmation (aucun jeton renvoyé au public) ; soignants : la fiche complète.
  return json(source === 'self' ? { ok: true, first_name: row.first_name, last_name: row.last_name } : { patient: row }, created ? 201 : 200);
}

async function staffRoutes(req, env, ctx, url, path) {
  const method = req.method;

  if (path === '/login' && method === 'POST') {
    await rateLimit(env.RL_LOGIN, clientIp(req));
    await rateLimit(env.RL_LOGIN_GLOBAL, 'global'); // plafond global : brute force distribué (multi-IP)
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
  if (path === '/stats' && method === 'GET') return json(await eventStats(env));
  if (path === '/stats.csv' && method === 'GET') {
    const s = await eventStats(env);
    const rows = [
      ['Inscriptions', s.total], ['Inscrites en autonomie (QR)', s.self], ['Inscrites à l’accueil', s.staff], ['Paramètres relevés', s.measured],
      ['Parcours terminés', s.done], ['Accord transmission médecin (%)', s.consent_rate], ['Attente moyenne avant appel (min)', s.avg_wait_min ?? ''],
      ['Intérêt check-up couverture (%)', s.checkup_rate], ['Questionnaires remplis', s.surveys],
      ...s.per_day.map((x) => [`Inscriptions le ${x.d}`, x.n]),
      ...Object.entries(s.ages).map(([k, n]) => [`Âge ${k} ans`, n]),
      ...Object.entries(s.triage).map(([k, n]) => [`Triage ${['à mesurer', 'vert', 'orange', 'rouge'][k] ?? k}`, n]),
      ...Object.entries(s.doctors).map(([k, n]) => [`Médecin ${k}`, n]),
    ].map(([a, b]) => ({ a, b }));
    return csvResponse(toCsv([['a', 'Indicateur'], ['b', 'Valeur']], rows), `bilan-anonyme-checksante-${new Date().toISOString().slice(0, 10)}.csv`);
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

/* ---------- Espace partenaire : ses demandes de contact, rien d'autre ---------- */
const CSV_SAFE = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // anti-injection de formules (Excel)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (cols, rows) => `\uFEFF${[cols.map(([, h]) => h), ...rows.map((r) => cols.map(([k]) => r[k]))].map((l) => l.map(CSV_SAFE).join(';')).join('\r\n')}`;
const dt = (ms) => (ms ? new Date(ms).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' }) : '');
const csvResponse = (body, name) =>
  new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

async function partnerRoutes(req, env, url, path) {
  const method = req.method;
  if (path === '/login' && method === 'POST') {
    await rateLimit(env.RL_LOGIN, `p:${clientIp(req)}`);
    await rateLimit(env.RL_LOGIN_GLOBAL, 'global');
    const { key } = await readJson(req, 512);
    if (!(await checkSecret('partner', key, env))) throw new HttpError(401, 'bad_key');
    return json({ ok: true }, 200, { 'Set-Cookie': await makeCookie('partner', env) });
  }
  if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearRoleCookie('partner') });
  await requireRole('partner', req, env);
  if (path === '/session' && method === 'GET') return json({ ok: true });
  if (path === '/leads' && method === 'GET') return json({ leads: await listLeads(env) });
  if (path === '/leads.csv' && method === 'GET') {
    const LBL = { ...LEAD_INTERESTS.pro, ...LEAD_INTERESTS.public };
    const rows = (await listLeads(env)).map((r) => ({
      ...r,
      created_at: dt(r.created_at),
      consent_at: dt(r.consent_at),
      mailed_at: dt(r.mailed_at),
      status: LEAD_STATUS[r.status] ?? r.status,
      contact_time: CONTACT_TIMES[r.contact_time] ?? '',
      interests: (r.interests || '').split(',').filter(Boolean).map((i) => LBL[i] ?? i).join(', '),
      audience: r.audience === 'pro' ? 'Professionnel de santé' : 'Particulier',
    }));
    const cols = [['created_at', 'Date'], ['name', 'Nom'], ['email', 'E-mail'], ['phone', 'Téléphone'], ['interests', 'Intérêts'], ['contact_time', 'Moment préféré'],
      ['status', 'Statut'], ['partner_notes', 'Notes'], ['message', 'Message'], ['audience', 'Public'], ['consent_at', 'Accord donné le'], ['mailed_at', 'E-mail envoyé le']];
    return csvResponse(toCsv(cols, rows), `contacts-checksante-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  const m = path.match(/^\/leads\/([0-9a-f-]{36})$/);
  if (m && method === 'PATCH') {
    const { ok, errors, value } = validateLeadPatch(await readJson(req, 4096));
    if (!ok) throw new HttpError(422, 'validation', { errors });
    return json({ lead: await updateLead(env, m[1], value) });
  }
  if (m && method === 'DELETE') {
    await deleteLead(env, m[1]); // « STOP » : effacement définitif
    return json({ ok: true });
  }
  throw new HttpError(404, 'not_found');
}

/* ---------- Page /admin : une clé = un rôle (admin → corbeille ; partner → contacts) ---------- */
async function adminRoutes(req, env, ctx, path) {
  const method = req.method;
  if (path === '/login' && method === 'POST') {
    await rateLimit(env.RL_LOGIN, `a:${clientIp(req)}`);
    await rateLimit(env.RL_LOGIN_GLOBAL, 'global');
    const { key } = await readJson(req, 512);
    const roles = ['admin', 'partner'].filter((r) => roleConfigured(r, env));
    if (!roles.length) throw new HttpError(503, 'not_configured');
    const headers = new Headers();
    const granted = [];
    for (const r of roles) {
      if (await checkSecret(r, key, env)) {
        headers.append('Set-Cookie', await makeCookie(r, env));
        granted.push(r);
      }
    }
    if (!granted.length) throw new HttpError(401, 'bad_key');
    const res = json({ ok: true, granted });
    for (const c of headers.getSetCookie()) res.headers.append('Set-Cookie', c);
    return res;
  }
  if (path === '/logout' && method === 'POST') {
    const res = json({ ok: true });
    res.headers.append('Set-Cookie', clearRoleCookie('admin'));
    res.headers.append('Set-Cookie', clearRoleCookie('partner'));
    return res;
  }
  if (path === '/roles' && method === 'GET') return json({ admin: await hasRole('admin', req, env), partner: await hasRole('partner', req, env) });

  // Corbeille : rôle admin uniquement (données de santé — jamais accessible avec la clé partenaire).
  await requireRole('admin', req, env);
  const resync = () => ctx.waitUntil(hub(env).broadcast({ t: 'resync' }).catch(() => {}));
  if (path === '/trash' && method === 'GET') return json(await listTrash(env));
  if (path === '/trash' && method === 'DELETE') {
    const n = await emptyTrash(env);
    return json({ ok: true, n });
  }
  if (path === '/surveys' && method === 'DELETE') {
    const n = await clearSurveys(env); // réponses anonymes (ex. réponses de test)
    return json({ ok: true, n });
  }
  if (path === '/trash-all' && method === 'POST') {
    const n = await trashAll(env);
    resync();
    return json({ ok: true, n });
  }
  if (path === '/restore-all' && method === 'POST') {
    const n = await restoreAll(env);
    resync();
    return json({ ok: true, n });
  }
  const m = path.match(/^\/trash\/([0-9a-f-]{36})(\/restore)?$/);
  if (m && m[2] && method === 'POST') {
    const row = await restorePatient(env, m[1]);
    ctx.waitUntil(hub(env).broadcast({ t: 'upsert', p: row }).catch(() => {}));
    return json({ ok: true });
  }
  if (m && !m[2] && method === 'DELETE') {
    await eraseFromTrash(env, m[1]);
    return json({ ok: true });
  }
  throw new HttpError(404, 'not_found');
}

async function route(req, env, ctx, url) {
  const path = url.pathname;
  // Désinscription : appelée depuis la page /desinscription OU en « un clic » par la messagerie
  // (RFC 8058, sans en-tête Origin). Protégée par le jeton secret ; réponse identique dans tous les cas.
  if (path === '/api/partner/unsubscribe' && req.method === 'POST') {
    await rateLimit(env.RL_REGISTER, `unsub:${clientIp(req)}`);
    let t = url.searchParams.get('t');
    if (!t && (req.headers.get('Content-Type') || '').startsWith('application/json')) t = (await readJson(req, 512))?.t;
    if (typeof t !== 'string' || !/^[A-Za-z0-9_-]{20,40}$/.test(t)) throw new HttpError(400, 'invalid');
    await deleteLeadByToken(env, t);
    return json({ ok: true });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req, url);

  if (path === '/api/health') {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true });
  }
  if (path === '/api/register' && req.method === 'POST') {
    await rateLimit(env.RL_REGISTER, `reg:${clientIp(req)}`);
    return register(req, env, ctx, 'self');
  }
  if (path === '/api/survey' && req.method === 'POST') {
    await rateLimit(env.RL_REGISTER, `survey:${clientIp(req)}`);
    const body = await readJson(req, 16384);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateSurvey(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const created = await createSurvey(env, value);
    if (created) broadcast(env, ctx, { t: 'survey' });
    return json({ ok: true }, created ? 201 : 200);
  }
  if (path === '/api/partner/lead' && req.method === 'POST' && PARTNER.enabled) {
    await rateLimit(env.RL_REGISTER, `lead:${clientIp(req)}`);
    const body = await readJson(req, 4096);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateLead(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const lead = await createLead(env, value);
    if (lead) {
      ctx.waitUntil(
        (lead.email && (await alreadyMailed(env, lead.email)) ? Promise.resolve('dedup') : sendCheckupMail(env, lead, url.origin))
          .then((r) => r === 'sent' && markMailed(env, lead.id))
          .catch((e) => console.error(JSON.stringify({ evt: 'mail_failed', err: String(e?.message).slice(0, 120) }))),
      );
    }
    // Jeton secret renvoyé à la personne : lui permet de préciser sa demande (et de se désinscrire).
    return json({ ok: true, t: lead?.unsub_token }, lead ? 201 : 200);
  }
  if (path === '/api/partner/qualify' && req.method === 'POST' && PARTNER.enabled) {
    await rateLimit(env.RL_REGISTER, `qualify:${clientIp(req)}`);
    const { ok, errors, value, t } = validateLeadQualify(await readJson(req, 512));
    if (!ok) throw new HttpError(422, 'validation', { errors });
    await qualifyLead(env, t, value);
    return json({ ok: true });
  }
  if (path.startsWith('/api/partner/') && PARTNER.enabled) return partnerRoutes(req, env, url, path.slice('/api/partner'.length));
  if (path.startsWith('/api/admin/')) return adminRoutes(req, env, ctx, path.slice('/api/admin'.length));
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
      await ensureSchema(env);
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
