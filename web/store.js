// État partagé staff : cache local + outbox optimiste + synchro temps réel (WebSocket) avec repli en polling.
import { api } from './api.js';

const OUTBOX_KEY = 'sem-outbox';
const rows = new Map(); // id -> ligne serveur
const pending = new Map(); // id -> champs modifiés non confirmés
const listeners = new Set();
let cursor = 0;
let ws = null;
let wsLive = false;
let backoff = 1000;
let flushing = false;
let flushTimer = 0;
let emitQueued = false;
let syncing = null;

export const state = { status: 'connecting', onUnauthorized: () => {} };

try {
  for (const [id, p] of JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')) pending.set(id, p);
} catch {
  /* ignore */
}
const persist = () => {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify([...pending]));
  } catch {
    /* ignore */
  }
};

/** Notifications regroupées par frame : rendu fluide même sous rafale. */
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  requestAnimationFrame(() => {
    emitQueued = false;
    for (const fn of listeners) fn();
  });
}
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function setStatus(s) {
  if (state.status !== s) {
    state.status = s;
    emit();
  }
}

export function merge(row) {
  if (!row?.id) return;
  const cur = rows.get(row.id);
  if (cur && cur.version > row.version) return;
  if (row.deleted_at) {
    rows.delete(row.id);
    pending.delete(row.id);
  } else rows.set(row.id, row);
  emit();
}

/** Vue = serveur + modifications locales en attente (optimistic UI). */
export function view(id) {
  const r = rows.get(id);
  return r ? { ...r, ...pending.get(id) } : null;
}
export const all = () => [...rows.keys()].map(view);
export const isPending = (id) => pending.has(id);

function handleAuth(e) {
  if (e.status === 401) {
    setStatus('locked');
    state.onUnauthorized();
    return true;
  }
  return false;
}

export function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      for (let guard = 0; guard < 50; guard++) {
        const { now, rows: page } = await api(`/staff/patients?since=${cursor}`);
        page.forEach(merge);
        if (page.length < 1000) {
          cursor = Math.max(0, now - 5000); // chevauchement : tolère les décalages d'horloge entre isolats
          break;
        }
        cursor = page[page.length - 1].updated_at;
      }
      if (!wsLive) setStatus('polling');
    } catch (e) {
      if (!handleAuth(e)) setStatus('offline');
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export function patch(id, fields) {
  pending.set(id, { ...pending.get(id), ...fields });
  persist();
  emit();
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 350);
}

export async function flush() {
  if (flushing) return;
  flushing = true;
  let retry = false;
  try {
    for (const [id, sent] of [...pending]) {
      try {
        const { patient } = await api(`/staff/patients/${id}`, { method: 'PATCH', body: sent });
        const cur = pending.get(id);
        if (cur) {
          for (const k of Object.keys(sent)) if (cur[k] === sent[k]) delete cur[k];
          if (!Object.keys(cur).length) pending.delete(id);
        }
        merge(patient);
      } catch (e) {
        if (handleAuth(e)) return;
        if (e.status === 0 || e.status === 429 || e.status >= 500) {
          retry = true;
          break;
        }
        pending.delete(id); // refus définitif (404/422) : on revient à la valeur serveur
        state.onRejected?.(id, e);
      }
    }
  } finally {
    flushing = false;
    persist();
    emit();
    if (retry || pending.size) {
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, retry ? 3000 : 50);
    }
  }
}

function connect() {
  if (ws && ws.readyState <= 1) return;
  let opened = false;
  let ping = 0;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/staff/ws`);
  ws.onopen = () => {
    opened = true;
    wsLive = true;
    backoff = 1000;
    setStatus('live');
    sync();
    flush();
    ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000);
  };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    try {
      const msg = JSON.parse(e.data);
      if (msg.t === 'upsert' || msg.t === 'delete') merge(msg.p);
      else if (msg.t === 'resync') sync(); // corbeille : changements en masse depuis /admin
    } catch {
      /* message invalide ignoré */
    }
  };
  ws.onclose = (e) => {
    clearInterval(ping);
    wsLive = false;
    if (state.status === 'locked') return;
    setStatus(navigator.onLine ? 'polling' : 'offline');
    if (e.code === 4401 || !opened) {
      // vérifie la session avant de réessayer
      api('/staff/session').catch(handleAuth);
    }
    setTimeout(connect, (backoff = Math.min(backoff * 2, 15000)));
  };
}

/** Verrouillage manuel : coupe le temps réel et vide le cache local (tablette partagée). */
export function lock() {
  state.status = 'locked';
  try {
    ws?.close(1000, 'lock');
  } catch {
    /* ignore */
  }
  rows.clear();
  cursor = 0;
  emit();
}

/** Relance après (re)connexion staff. */
export async function resume() {
  state.status = 'connecting';
  await sync();
  if (state.status === 'locked') return;
  connect();
  flush();
}

let started = false;
export async function start() {
  if (started) return resume();
  started = true;
  await resume();
  // Filet de sécurité : polling léger (5 s si WebSocket indisponible, 30 s sinon).
  const tick = () => {
    if (document.visibilityState === 'visible' && state.status !== 'locked') sync();
    setTimeout(tick, wsLive ? 30000 : 5000);
  };
  setTimeout(tick, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.status !== 'locked') {
      sync();
      connect();
      flush();
    }
  });
  addEventListener('online', () => {
    sync();
    connect();
    flush();
  });
}
