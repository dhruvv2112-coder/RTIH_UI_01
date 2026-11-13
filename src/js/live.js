// Live link to the local RTIH suite server (server/server.mjs).
// When the dashboard is served by the suite (http://<laptop>:8080/command/),
// pilgrim SOS calls, staff-app reports and task progress arrive here in real
// time, and dispatches go out to the Godavari Field staff app. Served on its
// own (e.g. Vercel) the health check fails and the dashboard keeps its
// built-in simulation — nothing else changes.
import { state, subscribe, touch, hooks } from './store.js';
import { toast, chime } from './ui.js';
import { icon } from './icons.js';
import { esc } from './util.js';

export const live = { connected: false, presence: { command: 0, staff: 0, pilgrim: 0 }, fieldAppStaff: null };
state.live = live;

const api = (path, body) => fetch(`/api/${path}`, {
  method: body ? 'POST' : 'GET',
  headers: body ? { 'content-type': 'application/json' } : undefined,
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

let applying = false;          // true while applying a server event (don't echo back)
const lastState = new Map();   // alert id → last known state, for diffing local changes

function snapshot() { state.alerts.forEach((a) => lastState.set(a.id, a.state)); }

function mergeAlert(remote, { announce } = {}) {
  const local = state.alerts.find((a) => a.id === remote.id);
  const fields = { state: remote.state, assignee: remote.assignee, severity: remote.severity, progress: remote.progress, notes: remote.notes ?? '' };
  if (local) Object.assign(local, fields);
  else state.alerts.unshift({ cams: [], suggestion: '', notes: '', ...remote, ts: remote.ts || Date.now() });
  if (!local && announce) {
    const go = () => document.dispatchEvent(new CustomEvent('gc:focus-alert', { detail: { id: remote.id } }));
    toast({ type: remote.severity === 'critical' ? 'critical' : 'warning', title: remote.title, desc: `${remote.desc} · ${remote.source}`, action: { label: 'View', run: go }, life: 20000 });
    chime(remote.severity === 'critical' ? 'emergency' : 'alert');
  }
}

function setStaffStatus(task) {
  const s = state.staff.find((x) => x.id === task.staff?.id);
  if (!s) return;
  if (['dispatched', 'accepted', 'active'].includes(task.status)) { s.status = 'on-task'; s.task = task.title; }
  if (['completed', 'declined', 'cancelled'].includes(task.status)) { s.status = 'available'; s.task = null; }
}

function footerChip() {
  const ftr = document.querySelector('#ftr');
  if (!ftr) return;
  let el = ftr.querySelector('[data-k="live"]');
  if (!el) {
    el = document.createElement('span');
    el.className = 'ftr__item';
    el.dataset.k = 'live';
    ftr.querySelector('.ftr__spacer')?.after(el);
  }
  const p = live.presence;
  el.dataset.level = live.connected ? 'ok' : 'warn';
  el.title = live.connected ? `Live link to the local suite server · ${p.staff} staff app(s), ${p.pilgrim} pilgrim app(s) connected` : 'Live link lost — retrying';
  el.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${icon('radio', 14)}<span class="ftr__label">Live link</span><span class="ftr__val">${live.connected ? `${p.staff} staff · ${p.pilgrim} pilgrim` : 'reconnecting…'}</span>`;
}

function connect() {
  const es = new EventSource('/api/events?app=command');
  es.addEventListener('hello', (e) => { const d = JSON.parse(e.data); live.connected = true; live.presence = d.presence; live.fieldAppStaff = d.fieldAppStaff; footerChip(); });
  es.addEventListener('presence', (e) => { live.presence = JSON.parse(e.data); footerChip(); touch('staff'); });
  es.onerror = () => { live.connected = false; footerChip(); };
  const apply = (fn) => (e) => { applying = true; try { fn(JSON.parse(e.data)); } finally { snapshot(); applying = false; } };

  es.addEventListener('alert:new', apply((a) => { mergeAlert(a, { announce: true }); touch('alerts'); }));
  es.addEventListener('alert:update', apply((a) => {
    const before = state.alerts.find((x) => x.id === a.id);
    const prev = before && { state: before.state, progress: before.progress };
    mergeAlert(a);
    touch('alerts');
    if (prev && a.progress && a.progress !== prev.progress) {
      const resolved = a.state === 'resolved';
      const declined = /^declined/.test(a.progress);
      toast({ type: resolved ? 'success' : declined ? 'warning' : 'info', title: resolved ? `Resolved · ${a.title}` : declined ? 'Dispatch declined' : `${a.assignee || 'Responder'} · ${a.progress}`, desc: declined ? `${a.progress} — ${a.title}. Dispatch someone else.` : a.title, life: 8000 });
    }
  }));
  es.addEventListener('task:new', apply((t) => { setStaffStatus(t); touch('staff'); }));
  es.addEventListener('task:update', apply((t) => { setStaffStatus(t); touch('staff'); }));
  es.addEventListener('report:new', apply((r) => { if (r.kind === 'inspection') toast({ type: 'info', title: `Inspection filed · ${r.vendor || 'vendor'}`, desc: `Grade ${r.grade} · ${r.by || 'field staff'}`, life: 6000 }); }));
  es.addEventListener('reset', () => location.reload());
}

async function boot() {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 1500);
    const h = await fetch('/api/health', { signal: ctl.signal }).then((r) => r.ok && r.json());
    clearTimeout(to);
    if (!h?.ok) return;
  } catch { return; } // standalone (Vercel / static) — keep the simulation

  document.documentElement.dataset.live = 'on';
  const s = await api('state');
  applying = true;
  [...s.alerts].reverse().forEach((a) => mergeAlert(a));
  state.alerts.sort((a, b) => b.ts - a.ts);
  s.tasks.slice().reverse().forEach(setStaffStatus);
  snapshot();
  applying = false;
  live.presence = s.presence; live.fieldAppStaff = s.fieldAppStaff;
  touch('alerts', 'staff');
  connect();
  footerChip();

  // outgoing: dispatch + recall (called from dispatch.js)
  hooks.dispatch = (alert, staff, { priority, instruction, at }) => {
    const a = alert || { id: `AL-ADHOC-${Date.now().toString(36).toUpperCase()}`, type: 'crowd', severity: priority, zone: staff.zone, title: `Ad-hoc dispatch — Zone ${staff.zone}`, desc: 'Map location chosen by Command', location: at, cams: [], source: 'Command', ts: Date.now() };
    const { notes, ...clean } = a;
    api('dispatch', { alert: { ...clean, notes: notes || '' }, staff: { id: staff.id, name: staff.name, role: staff.role, pos: staff.pos, zone: staff.zone }, priority, instruction, by: `Command · ${state.user.name}` })
      .catch(() => toast({ type: 'warning', title: 'Dispatch not delivered to the field app', desc: 'The suite server did not answer. The dispatch is recorded on this dashboard only.' }));
  };
  hooks.recall = (alert) => { if (alert) api(`recall/${alert.id}`, { state: alert.state, assignee: alert.assignee ?? null }).catch(() => {}); };

  // outgoing: acknowledge / resolve / undo made in the alert queue
  subscribe('alerts', () => {
    if (applying) return;
    for (const a of state.alerts) {
      const was = lastState.get(a.id);
      if (was !== undefined && was !== a.state && a.state !== 'dispatched' && was !== 'dispatched' && (a.live || a.sosId)) {
        api(`alerts/${a.id}/state`, { state: a.state, assignee: a.assignee ?? null, by: state.user.name }).catch(() => {});
      }
      lastState.set(a.id, a.state);
    }
  });

  // outgoing: emergency protocol → staff + pilgrim phones
  let wasEm = !!state.emergency;
  subscribe('emergency', () => {
    const on = !!state.emergency;
    if (on === wasEm) return;
    wasEm = on;
    const z = state.emergency?.zone;
    api('broadcast', on
      ? { kind: 'emergency', zone: z, active: true, title: `Emergency protocol — Zone ${z}`, body: 'Follow marshal instructions. Move away from the water edge calmly and use the nearest marked exit.' }
      : { kind: 'emergency', active: false, title: 'Emergency stood down', body: 'Normal operations resumed.' }).catch(() => {});
  });

  toast({ type: 'success', title: 'Live link connected', desc: `Pilgrim SOS and staff-app updates now arrive in real time. ${s.presence.staff} staff app(s) online.`, life: 5000 });
}

export function fieldAppBadge(staffId) {
  return live.connected && live.fieldAppStaff?.id === staffId
    ? `<span class="live-badge" title="Signed in on the Godavari Field app — dispatch arrives on the phone">${icon('smartphone', 12)}${live.presence.staff ? 'Field app · online' : 'Field app · offline'}</span>`
    : '';
}

boot();
void esc;
