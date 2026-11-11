import { LEAD_INTERESTS, PARTNER } from '../web/shared/partner.js';
import { CONTACT_TIMES, FEEDBACK_KINDS, FEEDBACK_ROLES, FEEDBACK_STATUS, LEAD_STATUS, validateFeedback, validateFeedbackPatch, validateIdentity, validateLead, validateLeadPatch, validateLeadQualify, validatePatch, validateEmail } from '../web/shared/validate.js';
import { checkPin, checkSecret, clearCookie, clearRoleCookie, hasRole, makeCookie, requireRole, requireStaff, roleConfigured, sessionCookie } from './auth.js';
import { HttpError, assertSameOrigin, clientIp, json, rateLimit, readJson } from './http.js';
import { hub } from './hub.js';
import { ensureSchema } from './schema.js';
import { createFeedback, deleteFeedback, listFeedback, updateFeedback, createLead, deleteLead, deleteLeadByToken, emptyTrash, eraseFromTrash, listTrash, restoreAll, restorePatient, trashAll, eventStats, listLeads, qualifyLead, updateLead, consentProof, listTransmissions, updateTransmission, createPatient, deletePatient, getDetail, listSince, purge, updatePatient } from './patients.js';

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

  if (path === '/stats' && method === 'GET') return json(await eventStats(env));
  if (path === '/stats.csv' && method === 'GET') {
    const s = await eventStats(env);
    const rows = [
      ['Inscriptions', s.total], ['Inscrites en autonomie (QR)', s.self], ['Inscrites à l’accueil', s.staff], ['Paramètres relevés', s.measured],
      ['Parcours terminés', s.done], ['Accord transmission médecin traitant (%)', s.consent_rate], ['Attente moyenne avant appel (min)', s.avg_wait_min ?? ''],
      ['Intérêt check-up couverture (%)', s.checkup_rate],
      ...s.per_day.map((x) => [`Inscriptions le ${x.d}`, x.n]),
      ...Object.entries(s.ages).map(([k, n]) => [`Âge ${k} ans`, n]),
      ...Object.entries(s.triage).map(([k, n]) => [`Triage ${['à mesurer', 'vert', 'orange', 'rouge'][k] ?? k}`, n]),
      ...Object.entries(s.doctors).map(([k, n]) => [`Médecin ${k}`, n]),
    ].map(([a, b]) => ({ a, b }));
    return csvResponse(toCsv([['a', 'Indicateur'], ['b', 'Valeur']], rows), `bilan-anonyme-checksante-${new Date().toISOString().slice(0, 10)}.csv`);
  }


  // Fiche de transmission au médecin traitant (document à imprimer / enregistrer en PDF).
  const fm = path.match(/^\/patients\/([0-9a-f-]{36})\/fiche$/);
  if (fm && method === 'GET') {
    const row = await getDetail(env, fm[1]);
    if (!row) throw new HttpError(404, 'not_found');
    if (row.doctor_consent !== 1) throw new HttpError(403, 'consent_required'); // fail-closed : jamais sans accord du participant
    const { consent_log: _log, token: _token, ...patient } = row;
    return json({ patient, proof: await consentProof(row), generated_at: Date.now() });
  }
  const m = path.match(/^\/patients\/([^/]+)$/);
  if (m) {
    const id = m[1];
    if (!ID_RE.test(id)) throw new HttpError(400, 'invalid');
    if (method === 'GET') {
      const row = await getDetail(env, id);
      if (!row) throw new HttpError(404, 'not_found');
      const { consent_log: _log, ...patient } = row;
      return json({ patient, proof: await consentProof(row) });
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
      status: LEAD_STATUS[r.status] ?? r.status,
      contact_time: CONTACT_TIMES[r.contact_time] ?? '',
      interests: (r.interests || '').split(',').filter(Boolean).map((i) => LBL[i] ?? i).join(', '),
      audience: r.audience === 'pro' ? 'Professionnel de santé' : 'Particulier',
    }));
    const cols = [['created_at', 'Date'], ['name', 'Nom'], ['email', 'E-mail'], ['phone', 'Téléphone'], ['interests', 'Intérêts'], ['contact_time', 'Moment préféré'],
      ['status', 'Statut'], ['partner_notes', 'Notes'], ['message', 'Message'], ['audience', 'Public'], ['consent_at', 'Accord donné le']];
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
  // Envois MANUELS (aucun e-mail envoyé par l'application) : fiches pour les médecins traitants.
  if (path === '/transmissions' && method === 'GET') return json({ items: await listTransmissions(env) });
  const tx = path.match(/^\/transmissions\/([0-9a-f-]{36})$/);
  if (tx && method === 'PATCH') {
    const body = await readJson(req, 1024);
    const patch = {};
    if (body && 'gp_email' in body) {
      const v = validateEmail(body.gp_email);
      if (!v.ok) throw new HttpError(422, 'validation', { errors: { gp_email: v.error } });
      patch.gp_email = v.value;
    }
    if (body && 'sent' in body) {
      if (typeof body.sent !== 'boolean') throw new HttpError(422, 'validation', { errors: { sent: 'Valeur invalide' } });
      patch.sent = body.sent;
    }
    if (!Object.keys(patch).length) throw new HttpError(422, 'validation', { errors: { _: 'Aucun champ' } });
    const row = await updateTransmission(env, tx[1], patch);
    resync();
    return json({ item: row });
  }
  const af = path.match(/^\/patients\/([0-9a-f-]{36})\/fiche$/);
  if (af && method === 'GET') {
    const row = await getDetail(env, af[1]);
    if (!row) throw new HttpError(404, 'not_found');
    if (row.doctor_consent !== 1) throw new HttpError(403, 'consent_required');
    const { consent_log: _log, token: _token, ...patient } = row;
    return json({ patient, proof: await consentProof(row), generated_at: Date.now() });
  }
  // Remarques des intervenants
  if (path === '/feedback' && method === 'GET') return json({ items: await listFeedback(env) });
  if (path === '/feedback.csv' && method === 'GET') {
    const rows = (await listFeedback(env)).map((r) => ({
      ...r,
      created_at: dt(r.created_at),
      role: FEEDBACK_ROLES[r.role] ?? r.role,
      kind: FEEDBACK_KINDS[r.kind] ?? r.kind,
      status: FEEDBACK_STATUS[r.status] ?? r.status,
    }));
    const cols = [['created_at', 'Date'], ['kind', 'Type'], ['role', 'Rôle'], ['name', 'Nom'], ['contact', 'Contact'], ['message', 'Message'],
      ['status', 'Statut'], ['admin_notes', 'Notes de l’organisation']];
    return csvResponse(toCsv(cols, rows), `remarques-intervenants-checksante-${new Date().toISOString().slice(0, 10)}.csv`);
  }
  const fb = path.match(/^\/feedback\/([0-9a-f-]{36})$/);
  if (fb && method === 'PATCH') {
    const { ok, errors, value } = validateFeedbackPatch(await readJson(req, 4096));
    if (!ok) throw new HttpError(422, 'validation', { errors });
    return json({ item: await updateFeedback(env, fb[1], value) });
  }
  if (fb && method === 'DELETE') {
    await deleteFeedback(env, fb[1]);
    return json({ ok: true });
  }
  if (path === '/trash' && method === 'DELETE') {
    const n = await emptyTrash(env);
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
  if (path === '/api/feedback' && req.method === 'POST') {
    // Lien public partagé aux intervenants : anti-spam (honeypot + limite par IP), validation stricte, rejeu idempotent.
    await rateLimit(env.RL_REGISTER, `fb:${clientIp(req)}`);
    const body = await readJson(req, 8192);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateFeedback(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const created = await createFeedback(env, value);
    return json({ ok: true }, created ? 201 : 200);
  }
  if (path === '/api/partner/lead' && req.method === 'POST' && PARTNER.enabled) {
    await rateLimit(env.RL_REGISTER, `lead:${clientIp(req)}`);
    const body = await readJson(req, 4096);
    if (body?.website) throw new HttpError(400, 'invalid');
    const { ok, errors, value } = validateLead(body);
    if (!ok) throw new HttpError(422, 'validation', { errors });
    const lead = await createLead(env, value); // aucun e-mail automatique : prise de contact manuelle depuis « Mes contacts »
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
