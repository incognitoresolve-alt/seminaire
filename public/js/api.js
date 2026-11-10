/** fetch JSON avec timeout : ne bloque jamais l'UI. */
export async function api(path, { method = 'GET', body, timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* réponse vide */
    }
    if (!res.ok) throw Object.assign(new Error(data?.error || `http_${res.status}`), { status: res.status, data });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('timeout'), { status: 0 });
    if (e.status === undefined) e.status = 0; // réseau
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function ageOf(birth) {
  if (!birth) return '';
  const b = new Date(`${birth}T00:00:00`);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return Number.isFinite(a) ? `${a} ans` : '';
}
