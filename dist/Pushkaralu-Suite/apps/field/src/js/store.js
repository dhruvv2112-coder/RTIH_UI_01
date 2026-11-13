// Minimal reactive store with offline queue semantics (Brief §7).
// Mirrors the Zustand + MMKV shape planned for the React Native build.
import { seedTasks, seedNotifications, CHECKLIST, STAFF, DISPATCH_POOL, RESOURCES } from './data.js';

const KEY = 'rtih.godavari-field.v2'; // v2: light theme default
const listeners = new Set();

function freshReport() {
  return { type: null, severity: null, description: '', photos: [], voice: null, location: 'auto' };
}
function freshInspection() {
  return { sections: structuredClone(CHECKLIST), grade: null, gradeTouched: false, notes: '', photos: [] };
}

function initial() {
  return {
    authed: true,
    theme: 'light', // day theme by default (outdoor glare); dark is a Profile toggle
    lang: 'en',
    online: true,
    sync: 'idle', // idle | syncing | synced
    queue: [],
    route: 'tasks', // tasks | map | report | inspection | profile
    tasks: seedTasks(),
    notifications: seedNotifications(),
    report: freshReport(),
    inspection: freshInspection(),
    settings: { sound: true, vibration: true, location: true, offlineMB: 127 },
    layers: { crowd: true, facilities: true, radar: true, staff: false, traffic: false },
    session: { tasks: 0, inspections: 0, reports: 0 },
    dispatchIdx: 0,
    role: 'marshal',
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const saved = JSON.parse(raw);
    return { ...initial(), ...saved, online: true, sync: 'idle' };
  } catch { return initial(); }
}

export const state = load();

let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try {
      const { sync, ...rest } = state;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch { /* storage unavailable — in-memory only */ }
  }, 150);
}

/* ---------- live-link hooks (suite hub; see link.js) ---------- */
const taskHooks = new Set();
export function onTaskEvent(fn) { taskHooks.add(fn); return () => taskHooks.delete(fn); }
function notify(kind, task, extra = {}) { taskHooks.forEach((fn) => { try { fn(kind, task, extra); } catch (e) { console.error(e); } }); }

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(reason) { persist(); listeners.forEach((fn) => fn(reason)); }
export function set(patch, reason = 'set') { Object.assign(state, patch); emit(reason); }

export function resetDemo() {
  const keep = { theme: state.theme };
  Object.assign(state, initial(), keep);
  try { localStorage.removeItem(KEY); } catch {}
  emit('reset');
}

/* ---------- selectors ---------- */
export const byStatus = (s) => state.tasks.filter((t) => t.status === s);
export const activeTask = () => state.tasks.find((t) => t.status === 'active') || null;
export const findTask = (id) => state.tasks.find((t) => t.id === id);
export const unreadCount = () => state.notifications.filter((n) => !n.read).length;
export const kpis = () => ({
  tasks: STAFF.base.tasks + state.session.tasks,
  inspections: STAFF.base.inspections + state.session.inspections,
  reports: STAFF.base.reports + state.session.reports,
});

/* ---------- offline queue ---------- */
function enqueue(action, label) {
  if (state.online) return false;
  state.queue.push({ id: crypto.randomUUID?.() || String(Math.random()), action, label, t: Date.now() });
  return true;
}

export function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  if (online && state.queue.length) {
    state.sync = 'syncing';
    emit('net');
    // FIFO sync (§7.1) — simulated round-trips
    const step = () => {
      const item = state.queue.shift();
      if (item) {
        state.tasks.forEach((t) => { if (t.pendingSync === item.id) { t.pendingSync = null; t.synced = true; } });
        emit('sync-step');
        setTimeout(step, 450);
      } else {
        state.sync = 'synced';
        emit('net');
        setTimeout(() => { state.sync = 'idle'; emit('net'); }, 2000);
      }
    };
    setTimeout(step, 600);
  } else {
    state.sync = 'idle';
    emit('net');
  }
}

/* ---------- task actions (§13 endpoints) ---------- */
function stamp(task, action, label) {
  const queued = enqueue(action, label);
  if (queued) { task.pendingSync = state.queue[state.queue.length - 1].id; task.synced = false; }
  else { task.synced = true; }
  return queued;
}

export function acceptTask(id, opts = {}) {
  const t = findTask(id); if (!t) return;
  const current = activeTask();
  // An urgent Command Centre dispatch jumps ahead of non-urgent work in hand.
  const preempt = !!current && !!t.hub && t.priority === 'urgent' && !(current.hub && current.priority === 'urgent');
  if (preempt) current.status = 'accepted';
  const hasActive = !!current && !preempt;
  t.status = hasActive ? 'accepted' : 'active';
  t.acceptedAt = Date.now();
  t.progress = t.progress || 0;
  const queued = stamp(t, `POST /tasks/${id}/accept`, 'Accept');
  notify('accepted', t, { auto: !!opts.auto });
  emit('task');
  return { queued, becameActive: !hasActive, preempted: preempt ? current : null };
}

export function declineTask(id, reason) {
  const t = findTask(id); if (!t) return;
  t.status = 'declined'; t.declineReason = reason;
  const queued = stamp(t, `POST /tasks/${id}/decline`, 'Decline');
  notify('declined', t, { reason });
  emit('task');
  return { queued };
}

export function completeTask(id) {
  const t = findTask(id); if (!t) return;
  t.status = 'completed';
  t.completedAt = Date.now();
  t.duration = Math.max(1, Math.round((Date.now() - (t.acceptedAt || t.dispatchedAt || Date.now())) / 60000));
  state.session.tasks += 1;
  if (t.kind === 'inspection') state.session.inspections += 0; // inspections counted on submit
  const queued = stamp(t, `POST /tasks/${id}/complete`, 'Complete');
  notify('completed', t);
  const next = state.tasks.find((x) => x.status === 'accepted');
  if (next) next.status = 'active';
  emit('task');
  return { queued, next };
}

export function addNote(id, text) {
  const t = findTask(id); if (!t || !text.trim()) return;
  t.notes = t.notes || [];
  t.notes.push({ t: Date.now(), text: text.trim() });
  if (t.status === 'active') t.progress = Math.min(95, (t.progress || 0) + 10);
  stamp(t, `POST /tasks/${id}/notes`, 'Note');
  notify('note', t, { note: text.trim() });
  emit('task');
}

export function escalateTask(id) {
  const t = findTask(id); if (!t) return;
  t.escalated = true;
  t.notes = t.notes || [];
  t.notes.push({ t: Date.now(), text: 'Escalated to Shift Supervisor' });
  const queued = stamp(t, `POST /tasks/${id}/escalate`, 'Escalate');
  notify('escalated', t);
  emit('task');
  return { queued };
}

export function nextDispatch() {
  const base = DISPATCH_POOL[state.dispatchIdx % DISPATCH_POOL.length];
  state.dispatchIdx += 1;
  const n = String(420 + state.dispatchIdx).padStart(4, '0');
  const task = { ...structuredClone(base), id: `TSK-27-${n}`, status: 'dispatch', dispatchedAt: Date.now(), notes: [] };
  state.tasks.unshift(task);
  state.notifications.unshift({ id: 'n' + Date.now(), type: task.priority === 'urgent' ? 'urgent' : 'normal', title: task.priority === 'urgent' ? 'Urgent Dispatch' : 'New Task Assigned', body: `${task.short} — ${task.location}`, t: Date.now(), read: false });
  emit('dispatch');
  return task;
}

/** A dispatch that arrived from the Command Centre over the suite hub. */
export function addHubTask(d) {
  const PRI = { critical: 'urgent', high: 'high', medium: 'normal', low: 'low' };
  const KIND = { crowd: 'crowd', gate: 'crowd', medical: 'medical', water: 'sensor', traffic: 'traffic', sos: 'safety', lost: 'safety', object: 'safety', fire: 'safety', drowning: 'safety', report: 'report', camera: 'report' };
  const existing = state.tasks.find((t) => t.hub?.dispatchId === d.dispatchId);
  if (existing) return existing;
  const task = {
    id: `TSK-27-${String(500 + state.tasks.length).padStart(4, '0')}`,
    kind: KIND[d.kind] || 'safety', priority: PRI[d.priority] || 'high', status: 'dispatch',
    title: d.title.replace(/ — Zone [A-D]$/, ''), short: d.title.replace(/ — Zone [A-D]$/, ''),
    location: d.location ? `${d.location}, Zone ${d.zone}` : `Zone ${d.zone}`,
    coords: '16.98912° N, 81.77874° E', pin: d.pin || { x: 600, y: 440 },
    distance: Math.round(d.distance || 150), eta: d.eta || 2, dispatchedBy: 'Command Centre',
    instructions: d.instruction || d.desc || 'Proceed to the location and report on arrival.',
    resources: RESOURCES.ghat3, dispatchedAt: Date.now(), notes: [],
    hub: { dispatchId: d.dispatchId, alertId: d.alertId, sosId: d.sosId || null },
  };
  state.tasks.unshift(task);
  state.notifications.unshift({ id: 'n' + Date.now(), type: task.priority === 'urgent' ? 'urgent' : 'normal', title: task.priority === 'urgent' ? 'Urgent Dispatch' : 'New Task Assigned', body: `${task.short} — ${task.location}`, t: Date.now(), read: false });
  emit('dispatch');
  return task;
}

/* ---------- report & inspection ---------- */
export function submitReport() {
  const queued = enqueue('POST /reports', 'Field report');
  notify('report', null, { report: structuredClone(state.report) });
  state.session.reports += 1;
  state.report = freshReport();
  emit('report');
  return { queued };
}
export function submitInspection() {
  const queued = enqueue('PUT /inspections/VND-2027-47', 'Inspection');
  state.session.inspections += 1;
  const t = state.tasks.find((x) => x.kind === 'inspection' && ['active', 'accepted', 'incoming'].includes(x.status));
  if (t) {
    t.status = 'completed'; t.completedAt = Date.now();
    t.duration = Math.max(1, Math.round((Date.now() - (t.acceptedAt || t.dispatchedAt)) / 60000));
    t.synced = !queued; state.session.tasks += 1;
    if (queued) t.pendingSync = state.queue[state.queue.length - 1].id;
    const next = state.tasks.find((x) => x.status === 'accepted');
    if (!activeTask() && next) next.status = 'active';
  }
  state.inspection = freshInspection();
  emit('inspection');
  return { queued };
}
export function resetReport() { state.report = freshReport(); emit('report'); }
