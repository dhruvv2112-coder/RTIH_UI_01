// Live-link client for the Pushkaralu 2027 Suite hub (suite/server.mjs).
// Identical copy lives in each app. When the page is not served by the suite
// (e.g. the standalone Vercel deployments) the hub is absent and every call is a
// harmless no-op, so the apps fall back to their built-in simulations.
const listeners = new Map();
const clientId = (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)).slice(0, 12);
const outbox = [];
let es = null;
let appName = 'app';
let epoch = '';
let paused = false;

export const hub = {
  available: false, // a suite server answered /api/health
  connected: false, // the SSE stream is open
  clientId,
  on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
  /** Publish an event. Queued while offline/paused and flushed in order once the link returns. */
  emit(type, data) {
    if (!hub.available) return false;
    outbox.push({ type, app: appName, from: clientId, data });
    flush();
    return true;
  },
  /** Simulates the device losing signal: outgoing events wait in the outbox. */
  setPaused(v) { paused = !!v; if (!paused) flush(); },
  pending: () => outbox.length,
};

function fire(type, ev) { listeners.get(type)?.forEach((fn) => { try { fn(ev); } catch (e) { console.error('[hub]', type, e); } }); }

let flushing = false;
async function flush() {
  if (flushing || paused || !hub.available) return;
  flushing = true;
  while (outbox.length && !paused) {
    try {
      const r = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(outbox[0]) });
      if (!r.ok && r.status !== 400) throw new Error(String(r.status));
      outbox.shift();
    } catch {
      await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  flushing = false;
  fire('_outbox', outbox.length);
}

const lastKey = () => `rtih.hub.${appName}.last`;
function remember(id) { try { localStorage.setItem(lastKey(), `${epoch}:${id}`); } catch {} }
function since(latest) {
  try {
    const [e, id] = (localStorage.getItem(lastKey()) || '').split(':');
    if (e === epoch && Number(id) <= latest) return Number(id);
  } catch {}
  return latest; // first visit or the hub was reset: start from now
}

/** Detect the suite hub and open the live stream. Resolves to true when linked. */
export async function connectHub(app) {
  appName = app;
  let health;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    if (!r.ok) return false;
    health = await r.json();
    if (health?.service !== 'rtih-hub') return false;
  } catch { return false; }
  hub.available = true;
  epoch = health.epoch;
  open(since(health.latest));
  return true;
}

function open(from) {
  es?.close();
  es = new EventSource(`/api/stream?app=${encodeURIComponent(appName)}&since=${from}`);
  es.onopen = () => { hub.connected = true; fire('_status', true); flush(); };
  es.onerror = () => { if (hub.connected) { hub.connected = false; fire('_status', false); } };
  es.onmessage = (m) => {
    let ev; try { ev = JSON.parse(m.data); } catch { return; }
    remember(ev.id);
    if (ev.from === clientId) return; // our own echo
    fire(ev.type, ev);
    fire('*', ev);
  };
  es.addEventListener('reset', (m) => {
    try { epoch = JSON.parse(m.data).epoch; } catch {}
    remember(0);
    open(0);
    fire('_reset', null);
  });
}
