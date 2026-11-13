// Godavari Hub adapter for Pushkaralu Command. Connects to the hub that serves the page (local
// laptop hub or the cloud hub site), else to the cloud hub (CLOUD_HUB) so the Vercel deployment is
// live-linked with the Pilgrim and Field apps on any device. ?hub=off keeps the on-screen
// simulation only; ?hub=<url> picks another hub.
//
//  hub → command  alert.created  (pilgrim SOS, field report, staff SOS) → alert queue + toast
//                 alert.updated / task.updated                          → alert state, staff status
//  command → hub  dispatch an alert to "Ramesh Kumar (Field app)"        → POST /api/dispatch
//                 acknowledge / resolve a hub alert                       → POST /api/alerts/:id
//                 emergency protocol on/off, PA advisory                  → POST /api/broadcast (pilgrims)
import { state, subscribe, touch } from './store.js';
import { toast, chime } from './ui.js';
import { toLngLat } from './map3d.js';

const FIELD_NAME = 'Ramesh Kumar';
const isField = (name) => typeof name === 'string' && name.startsWith(FIELD_NAME);
const seen = new Map();          // alert id → { state, assignee, severity }
const sentToField = new Set();   // alert ids already dispatched to the Field app
let actionsRef = null;

export const CLOUD_HUB = 'https://godavari-hub.vercel.app';
let BASE = '';

async function findHub() {
  const q = new URLSearchParams(location.search).get('hub');
  if (q === 'off') return null;
  for (const base of q ? [q.replace(/\/$/, '')] : ['', CLOUD_HUB]) {
    const ac = new AbortController();
    const tm = setTimeout(() => ac.abort(), 3500);
    try {
      const r = await fetch(`${base}/api/health`, { signal: ac.signal, cache: 'no-store' });
      const h = await r.json();
      if (r.ok && h?.name === 'godavari-hub') return { base, h };
    } catch { /* try the next one */ } finally { clearTimeout(tm); }
  }
  return null;
}

async function api(path, body) {
  const r = await fetch(BASE + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json().catch(() => null) };
}

export async function startLive(actions) {
  actionsRef = actions;
  const hub = await findHub();
  if (!hub) return;
  BASE = hub.base;
  document.documentElement.dataset.hub = 'live';
  document.getElementById('staffAppLink')?.setAttribute('href', `${BASE}/field/`);

  // The marshal carrying the Field app appears in every dispatch list.
  if (!state.staff.some((s) => isField(s.name))) {
    state.staff.unshift({ id: 'ST-FLD', name: `${FIELD_NAME} (Field app)`, role: 'Zone Marshal', zone: 'A', pos: [575, 420], status: 'available', task: null, phone: '+91 98480 20117', live: true });
    touch('staff');
  }
  for (const a of state.alerts) seen.set(a.id, snap(a));

  // Catch up on hub alerts raised before this tab opened.
  try {
    const r = await api('/api/alerts');
    if (Array.isArray(r.data)) [...r.data].reverse().forEach((a) => upsert(a, false));
  } catch { /* ignore */ }

  connect();
  subscribe(['alerts'], onAlerts);
  let wasEmergency = state.emergency?.zone || null;
  subscribe(['emergency'], () => {
    const z = state.emergency?.zone || null;
    if (z && z !== wasEmergency) broadcast({ title: `Emergency in Zone ${z}`, body: 'Please stay calm, follow marshals and move away from the river steps. Use the nearest exit shown in the app.', level: 'critical', zone: z });
    if (!z && wasEmergency) broadcast({ title: `All clear — Zone ${wasEmergency}`, body: 'Normal movement has resumed. Thank you for your patience.', level: 'info', zone: wasEmergency });
    wasEmergency = z;
  });
  window.addEventListener('gc:broadcast', (e) => broadcast(e.detail));
  toast({ type: 'info', title: hub.h.runtime === 'vercel' ? 'Connected to Godavari Hub (cloud)' : 'Connected to Godavari Hub', desc: 'Live alerts from the Pilgrim and Field apps will appear in the queue.', life: 4000 });
}

const snap = (a) => ({ state: a.state, assignee: a.assignee || null, severity: a.severity });

function broadcast(msg) {
  api('/api/broadcast', msg).then((r) => r.ok && toast({ type: 'success', title: 'Sent to Pilgrim app', desc: msg.title, life: 3000 })).catch(() => {});
}

function upsert(a, announce = true) {
  const local = state.alerts.find((x) => x.id === a.id);
  if (local) {
    Object.assign(local, { state: a.state, assignee: a.assignee, severity: a.severity, notes: a.notes });
    seen.set(a.id, snap(local));
    return local;
  }
  const alert = { cams: [], notes: '', ...a };
  state.alerts.unshift(alert);
  seen.set(alert.id, snap(alert));
  if (alert.sosId) sentToField.add(alert.id); // the hub auto-dispatched it already
  if (announce) {
    chime(alert.severity === 'critical' ? 'critical' : 'alert');
    toast({
      type: alert.severity === 'critical' ? 'critical' : 'warning',
      title: alert.title,
      desc: alert.desc,
      action: { label: 'View', run: () => actionsRef?.focusAlert(alert.id) },
      life: 12000,
    });
  }
  return alert;
}

function connect() {
  const es = new EventSource(`${BASE}/api/events?app=command&topics=alert,task,booking,sos,reset`);
  const data = (e) => JSON.parse(e.data).data;
  es.addEventListener('alert.created', (e) => { upsert(data(e)); touch('alerts'); });
  es.addEventListener('alert.updated', (e) => {
    const a = data(e);
    const local = state.alerts.find((x) => x.id === a.id);
    if (!local) { upsert(a, false); touch('alerts'); return; }
    const before = local.state;
    Object.assign(local, { state: a.state, assignee: a.assignee, severity: a.severity, notes: a.notes });
    seen.set(a.id, snap(local));
    if (before !== 'resolved' && a.state === 'resolved') toast({ type: 'success', title: `Resolved — ${local.title}`, desc: a.notes?.split('\n').pop() || '', life: 5000 });
    touch('alerts');
  });
  es.addEventListener('task.updated', (e) => {
    const t = data(e);
    const s = state.staff.find((x) => isField(x.name));
    if (!s) return;
    if (t.status === 'active' || t.status === 'accepted') { s.status = 'on-task'; s.task = t.short || t.title; }
    if (['completed', 'cancelled', 'declined'].includes(t.status)) { s.status = 'available'; s.task = null; }
    if (t.status === 'active') toast({ type: 'info', title: `${FIELD_NAME} accepted`, desc: `${t.short} — en route`, life: 4000 });
    if (t.status === 'declined') toast({ type: 'warning', title: `${FIELD_NAME} declined`, desc: t.declineReason || 'Reassign to the next nearest marshal.', life: 6000 });
    // Dashboard-only alerts (not stored on the hub) follow the field task's lifecycle here.
    const a = t.alertId && state.alerts.find((x) => x.id === t.alertId && !x.hub);
    if (a) {
      if (t.status === 'completed') { a.state = 'resolved'; toast({ type: 'success', title: `Resolved — ${a.title}`, desc: `Completed by ${FIELD_NAME} on the Field app`, life: 5000 }); }
      if (t.status === 'declined') { a.state = 'read'; a.assignee = null; sentToField.delete(a.id); }
      seen.set(a.id, snap(a));
      touch('alerts');
    }
    touch('staff');
  });
  es.addEventListener('booking.created', (e) => {
    const b = data(e);
    toast({ type: 'info', title: 'New ghat booking', desc: `${b.name} + ${b.people - 1} · ${b.ghat} · ${b.start}–${b.end}, ${b.day} Mar`, life: 3500 });
  });
  es.onerror = () => { document.documentElement.dataset.hub = 'reconnecting'; };
  es.onopen = () => { document.documentElement.dataset.hub = 'live'; };
}

function onAlerts() {
  for (const a of state.alerts) {
    const prev = seen.get(a.id);
    const now = snap(a);
    if (prev && prev.state === now.state && prev.assignee === now.assignee && prev.severity === now.severity) continue;
    seen.set(a.id, now);
    // Dispatched from the dashboard to the marshal carrying the Field app → send it to the phone.
    if (now.state === 'dispatched' && isField(now.assignee) && !sentToField.has(a.id)) {
      sentToField.add(a.id);
      api('/api/dispatch', {
        alertId: a.id, type: a.type, severity: a.severity, zone: a.zone, title: a.title, desc: a.desc,
        suggestion: a.suggestion, lat: a.geo?.lat ?? (a.location ? toLngLat(a.location)[1] : undefined), lng: a.geo?.lng ?? (a.location ? toLngLat(a.location)[0] : undefined), by: state.user.name,
      }).then((r) => r.ok && toast({ type: 'success', title: 'Sent to Field app', desc: `${FIELD_NAME}'s phone is ringing — ${r.data.id}`, life: 5000 }));
    }
    if (a.hub && prev) api(`/api/alerts/${encodeURIComponent(a.id)}`, { state: a.state, assignee: a.assignee, severity: a.severity }).catch(() => {});
  }
}
