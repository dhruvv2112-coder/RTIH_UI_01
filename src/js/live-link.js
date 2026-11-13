// Live link to the Pushkaralu 2027 Suite hub. When the dashboard is served by
// suite/server.mjs, pilgrim SOS calls and field-staff updates arrive here in
// real time, and dispatches go out to the field app. Without the hub (e.g. the
// Vercel deployment) nothing here runs and the built-in simulation carries on.
import { hub, connectHub } from './hub-client.js';
import { state, touch } from './store.js';
import { ALERT_TYPES, CAMERAS } from './data.js';
import { toast, chime } from './ui.js';
import { icon } from './icons.js';

ALERT_TYPES.sos = { icon: 'siren', label: 'SOS call' };
ALERT_TYPES.report = { icon: 'pencil', label: 'Field report' };

// The field app on the suite is signed in as this marshal.
export const FIELD_APP_STAFF = 'ST-001';

const GHATS = {
  g3: { zone: 'A', at: [560, 420], name: 'Rajahmundry Main Ghat #3' },
  pk: { zone: 'A', at: [600, 440], name: 'Pushkar Ghat' },
  kl: { zone: 'B', at: [300, 330], name: 'Kotilingala Ghat' },
  sw: { zone: 'C', at: [820, 540], name: 'Saraswati Ghat' },
  gw: { zone: 'C', at: [800, 520], name: 'Gowthami Ghat' },
};
const REPORT_TYPE = { crowd: 'crowd', water: 'water', medical: 'medical', safety: 'object', incident: 'object' };

let seq = 0;
const nextId = (p) => `${p}-${String(Date.now()).slice(-4)}${++seq}`;
const focus = (id) => window.__gc?.actions.focusAlert(id);
const camsNear = (zone, at) => CAMERAS.filter((c) => c.zone === zone && c.status !== 'offline')
  .sort((a, b) => Math.hypot(a.pos[0] - at[0], a.pos[1] - at[1]) - Math.hypot(b.pos[0] - at[0], b.pos[1] - at[1]))
  .slice(0, 3).map((c) => c.id);
const byKey = (k, v) => state.alerts.find((a) => a[k] && a[k] === v);
const staffById = (id) => state.staff.find((s) => s.id === id);

function addAlert(a) {
  state.alerts.unshift({ state: 'unread', notes: '', ts: Date.now(), ...a });
  touch('alerts');
}

/* ------------------------------------------------------------ incoming */
function onSOS({ data: d }) {
  const g = GHATS[d.ghatId] || GHATS.pk;
  const id = nextId('SOS');
  addAlert({
    id, sosId: d.sosId, type: 'sos', severity: 'critical', zone: g.zone, location: g.at,
    title: `Pilgrim SOS — Zone ${g.zone}`,
    desc: `${d.name || 'Pilgrim'}${d.members > 1 ? ` + ${d.members - 1} family` : ''} · ${g.name}${d.offline ? ' · via SMS fallback' : ''}`,
    cams: camsNear(g.zone, g.at),
    suggestion: `Go to ${g.name}: ${d.name || 'a pilgrim'}${d.members > 1 ? ` (group of ${d.members})` : ''} raised SOS from the pilgrim app. Find them via the shared live location, assess, and call for medical backup if needed.`,
    source: 'Pilgrim app SOS',
  });
  chime('critical');
  toast({ type: 'critical', title: `SOS from ${d.name || 'a pilgrim'}`, desc: `${g.name}, Zone ${g.zone}. Live location shared.`, action: { label: 'Dispatch', run: () => { focus(id); window.__gc?.actions.dispatch?.(state.alerts.find((x) => x.id === id)); } }, life: 20000 });
}

function onSOSCancel({ data: d }) {
  const a = byKey('sosId', d.sosId);
  if (!a || a.state === 'resolved') return;
  freeStaff(a);
  Object.assign(a, { state: 'resolved', assignee: 'Cancelled by pilgrim' });
  touch('alerts', 'staff');
  toast({ type: 'info', title: 'Pilgrim cancelled SOS', desc: `${a.desc.split(' · ')[0]} reports they are safe. Alert closed.` });
}

function onStaffSOS({ data: d }) {
  const s = state.staff.find((x) => x.name === d.staffName) || staffById(FIELD_APP_STAFF);
  const at = s?.pos || GHATS.g3.at;
  const id = nextId('SOS');
  addAlert({
    id, staffSosId: d.sosId, type: 'sos', severity: 'critical', zone: s?.zone || 'A', location: at,
    title: `Staff SOS — ${d.staffName || 'Field staff'}`,
    desc: `${d.role || 'Field staff'} · ${d.location || 'location shared'} · emergency protocol triggered on device`,
    cams: camsNear(s?.zone || 'A', at),
    suggestion: 'Send the nearest police and medical responders; open a radio channel to the staff member.',
    source: 'Field app SOS',
  });
  chime('critical');
  toast({ type: 'critical', title: `Staff SOS — ${d.staffName}`, desc: d.location || '', action: { label: 'View', run: () => focus(id) }, life: 20000 });
}

function onStaffSOSCancel({ data: d }) {
  const a = byKey('staffSosId', d.sosId);
  if (!a || a.state === 'resolved') return;
  Object.assign(a, { state: 'resolved', assignee: `${d.staffName} (safe)` });
  touch('alerts');
  toast({ type: 'info', title: `${d.staffName} cancelled SOS`, desc: 'Staff member reports they are safe.' });
}

function onReport({ data: d }) {
  const s = staffById(FIELD_APP_STAFF);
  const id = nextId('RP');
  const sev = ['critical', 'high', 'medium', 'low'].includes(d.severity) ? d.severity : 'medium';
  addAlert({
    id, type: REPORT_TYPE[d.kind] || 'report', severity: sev, zone: s?.zone || 'A', location: s?.pos || GHATS.g3.at,
    title: `${d.label || 'Field'} report — Zone ${s?.zone || 'A'}`,
    desc: `${d.description ? `“${d.description.slice(0, 90)}”` : 'No description'} · ${d.staffName || 'Field staff'}${d.photos ? ` · ${d.photos} photo${d.photos > 1 ? 's' : ''}` : ''}${d.voice ? ' · voice note' : ''}`,
    cams: camsNear(s?.zone || 'A', s?.pos || GHATS.g3.at),
    suggestion: 'Review attached media and assign if action is needed.',
    source: 'Field app report',
  });
  if (sev === 'critical' || sev === 'high') chime('alert');
  toast({ type: sev === 'critical' ? 'critical' : sev === 'high' ? 'warning' : 'info', title: `New field report from ${d.staffName || 'staff'}`, desc: d.label || '', action: { label: 'View', run: () => focus(id) } });
}

function freeStaff(a) {
  const s = state.staff.find((x) => x.name === a.assignee);
  if (s && s.status === 'on-task') { s.status = 'available'; s.task = null; }
}

function onTaskUpdate({ data: d }) {
  const a = byKey('dispatchId', d.dispatchId);
  if (!a) return;
  const who = d.staffName || a.assignee || 'Staff';
  switch (d.status) {
    case 'accepted':
      a.state = 'dispatched'; a.ack = 'accepted';
      toast({ type: 'success', title: `${who} accepted`, desc: `${a.title} — ${d.auto ? 'auto-accepted after 30 s' : `on the way, ETA ~${d.eta || '?'} min`}` });
      break;
    case 'declined':
      freeStaff(a);
      Object.assign(a, { state: 'acknowledged', assignee: null, dispatchId: null, ack: null });
      chime('alert');
      toast({ type: 'warning', title: `${who} declined`, desc: `Reason: ${d.reason || 'not given'}. Alert is back in the queue.`, action: { label: 'Re-dispatch', run: () => { focus(a.id); window.__gc?.actions.dispatch?.(a); } }, life: 20000 });
      break;
    case 'note':
      a.notes = `${a.notes ? `${a.notes}\n` : ''}[${who}] ${d.note}`;
      toast({ type: 'info', title: `Field note — ${who}`, desc: d.note });
      break;
    case 'escalated':
      a.severity = 'critical';
      chime('critical');
      toast({ type: 'critical', title: `${who} escalated`, desc: `${a.title} needs a supervisor.`, action: { label: 'View', run: () => focus(a.id) } });
      break;
    case 'completed':
      freeStaff(a);
      Object.assign(a, { state: 'resolved', assignee: who });
      chime('success');
      toast({ type: 'success', title: `${who} completed the task`, desc: `${a.title} closed from the field.` });
      break;
    default: return;
  }
  touch('alerts', 'staff');
}

/* ------------------------------------------------------------ outgoing */
function wireOutgoing() {
  document.addEventListener('gc:dispatched', ({ detail: { alert, staff, priority, instruction, dist, eta } }) => {
    if (!alert) return;
    const dispatchId = `DSP-${alert.id}-${Date.now().toString(36)}`;
    alert.dispatchId = dispatchId;
    hub.emit('dispatch', {
      dispatchId, alertId: alert.id, sosId: alert.sosId || null,
      staffId: staff.id, staffName: staff.name, role: staff.role, phone: staff.phone,
      kind: alert.type, priority, title: alert.title, desc: alert.desc,
      zone: alert.zone, location: alert.desc.split(' · ').pop(), pin: { x: alert.location[0], y: alert.location[1] },
      instruction, distance: dist, eta,
    });
    if (staff.id !== FIELD_APP_STAFF) {
      // Staff without a device on the suite: acknowledge on their behalf so the pilgrim sees it.
      setTimeout(() => {
        if (alert.dispatchId !== dispatchId || alert.state === 'resolved') return;
        alert.ack = 'accepted'; touch('alerts');
        hub.emit('task.update', { dispatchId, alertId: alert.id, sosId: alert.sosId || null, status: 'accepted', staffName: staff.name, eta, simulated: true });
      }, 5000 + Math.random() * 3000);
    }
  });
  document.addEventListener('gc:recalled', ({ detail: { alert } }) => {
    if (!alert?.dispatchId) return;
    hub.emit('dispatch.recall', { dispatchId: alert.dispatchId, alertId: alert.id, sosId: alert.sosId || null });
    alert.dispatchId = null;
  });
  document.addEventListener('gc:alert-resolved', ({ detail: { alert } }) => {
    hub.emit('alert.update', { alertId: alert.id, dispatchId: alert.dispatchId || null, sosId: alert.sosId || null, state: 'resolved', by: state.user.name });
  });
  document.addEventListener('gc:emergency', ({ detail: { zone, area } }) => hub.emit('emergency', { zone, area, by: state.user.name }));
  document.addEventListener('gc:emergency-end', ({ detail: { zone } }) => hub.emit('emergency.end', { zone }));
}

/* ------------------------------------------------------------ status chip */
function mountChip() {
  const ws = document.querySelector('.ftr__ws');
  if (!ws) return;
  const el = document.createElement('span');
  el.className = 'ftr__item ftr__link';
  el.innerHTML = `<span class="status-dot" aria-hidden="true"></span>${icon('smartphone', 14)}<span class="ftr__label">Live link</span><span class="ftr__val"></span>`;
  el.title = 'Pushkaralu Suite hub: pilgrim and field apps connected to this dashboard';
  ws.before(el);
  const render = async () => {
    let counts = {};
    try { counts = await (await fetch('/api/clients', { cache: 'no-store' })).json(); } catch {}
    const f = counts.field || 0, p = counts.pilgrim || 0;
    el.dataset.level = hub.connected ? 'ok' : 'crit';
    el.querySelector('.ftr__val').textContent = hub.connected ? `Field ${f} · Pilgrim ${p}` : 'Reconnecting…';
  };
  render();
  setInterval(render, 4000);
  hub.on('_status', render);
}

export async function startLiveLink() {
  const linked = await connectHub('dashboard');
  if (!linked) return false;
  document.documentElement.dataset.live = 'on';
  document.getElementById('staffAppLink')?.setAttribute('href', '/field/');
  hub.on('sos', onSOS);
  hub.on('sos.cancel', onSOSCancel);
  hub.on('staff.sos', onStaffSOS);
  hub.on('staff.sos.cancel', onStaffSOSCancel);
  hub.on('report', onReport);
  hub.on('task.update', onTaskUpdate);
  wireOutgoing();
  mountChip();
  setTimeout(() => toast({ type: 'success', title: 'Live link on', desc: `Pilgrim SOS and field staff updates now arrive here. Dispatches to ${staffById(FIELD_APP_STAFF)?.name || 'the field marshal'} reach the Field app.`, life: 7000 }), 1800);
  return true;
}
