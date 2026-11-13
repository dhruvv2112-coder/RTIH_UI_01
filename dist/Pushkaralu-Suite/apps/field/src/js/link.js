// Live link to the Pushkaralu 2027 Suite hub (suite/server.mjs in RTIH_UI_01).
// Dispatches sent from the Command Centre dashboard to this marshal arrive as
// INCOMING DISPATCH; accept/decline/notes/escalate/complete, field reports and
// SOS flow back. Going offline in the app holds outgoing events in an outbox
// that syncs on reconnect. Without the hub (Vercel), nothing here runs.
import { hub, connectHub } from './hub-client.js';
import { state, emit, subscribe, onTaskEvent, addHubTask, setOnline } from './store.js';
import { STAFF } from './data.js';
import { openDispatch } from './overlays.js';
import { toast } from './ui.js';

// This device is signed in as Ramesh Kumar; on the dashboard he is staff ST-001.
const COMMAND_ID = 'ST-001';
const REPORT_LABEL = { incident: 'Incident', maintenance: 'Maintenance', crowd: 'Crowd', water: 'Water', vendor: 'Vendor', safety: 'Safety', medical: 'Medical', other: 'Other' };
const SEV = { urgent: 'critical', high: 'high', medium: 'medium', low: 'low' };

const findHubTask = (dispatchId) => state.tasks.find((t) => t.hub?.dispatchId === dispatchId);
function notifyUser(type, title, body) {
  state.notifications.unshift({ id: 'h' + Date.now() + Math.random().toString(36).slice(2, 5), type, title, body, t: Date.now(), read: false });
  emit('notif');
}

function onDispatch({ data: d }) {
  if (d.staffId !== COMMAND_ID) return;
  const t = addHubTask(d);
  if (!state.authed) { state.authed = true; emit('auth'); }
  setTimeout(() => openDispatch(t), 150);
}

function onRecall({ data: d }) {
  const t = findHubTask(d.dispatchId);
  if (!t || ['completed', 'declined'].includes(t.status)) return;
  const wasIncoming = t.status === 'dispatch';
  t.status = 'declined'; t.declineReason = 'Recalled by Command Centre';
  emit('task');
  if (wasIncoming && t.cancelDispatch) t.cancelDispatch('Dispatch recalled by Command Centre');
  else toast('Task recalled by Command Centre', 'warning');
}

function onAlertUpdate({ data: d }) {
  if (d.state !== 'resolved' || !d.dispatchId) return;
  const t = findHubTask(d.dispatchId);
  if (!t || ['completed', 'declined'].includes(t.status)) return;
  if (t.status === 'dispatch' && t.cancelDispatch) t.cancelDispatch('Incident closed by Command Centre');
  t.status = 'completed'; t.completedAt = Date.now(); t.duration = Math.max(1, Math.round((Date.now() - t.dispatchedAt) / 60000));
  t.notes.push({ t: Date.now(), text: `Closed by Command Centre (${d.by || 'operator'})` });
  const next = state.tasks.find((x) => x.status === 'accepted');
  if (next && !state.tasks.some((x) => x.status === 'active')) next.status = 'active';
  emit('task');
  toast('Incident closed by Command Centre', 'info');
}

function onPilgrimSOS({ data: d }) {
  notifyUser('urgent', 'Pilgrim SOS in your sector', `${d.name || 'A pilgrim'} — ${d.ghatName || 'nearby ghat'}. Command Centre is assigning a responder.`);
}

function onEmergency({ data: d }) {
  notifyUser('emergency', `Emergency protocol — Zone ${d.zone}`, `${d.area || ''} · follow Command Centre instructions on radio.`);
  toast(`Emergency protocol active — Zone ${d.zone}`, 'critical', 6000);
}
function onEmergencyEnd({ data: d }) {
  notifyUser('update', `Zone ${d.zone} stood down`, 'Emergency protocol ended by Command Centre.');
  toast(`Zone ${d.zone} stood down`, 'info');
}

function wireOutgoing() {
  onTaskEvent((kind, t, extra) => {
    if (kind === 'report') {
      const r = extra.report;
      hub.emit('report', { kind: r.type, label: REPORT_LABEL[r.type] || 'Field', severity: SEV[r.severity] || 'medium', description: r.description, photos: r.photos?.length || 0, voice: !!r.voice, location: r.location, staffName: STAFF.name, staffId: COMMAND_ID });
      return;
    }
    if (!t?.hub) return; // locally simulated tasks stay local
    hub.emit('task.update', { ...t.hub, status: kind, staffName: STAFF.name, staffId: COMMAND_ID, eta: t.eta, reason: extra.reason || null, note: extra.note || null, auto: !!extra.auto });
  });
  document.addEventListener('gf:sos', ({ detail }) => hub.emit('staff.sos', { sosId: detail.sosId, staffName: STAFF.name, staffId: COMMAND_ID, role: STAFF.role, location: 'Ghat #3, Zone A' }));
  document.addEventListener('gf:sos-cancel', ({ detail }) => hub.emit('staff.sos.cancel', { sosId: detail.sosId, staffName: STAFF.name }));
  // The app's own offline mode holds hub events in the outbox until reconnect.
  let wasOnline = state.online;
  hub.setPaused(!state.online);
  subscribe(() => { if (state.online !== wasOnline) { wasOnline = state.online; hub.setPaused(!state.online); } });
}

function mountStatus() {
  const panel = document.querySelector('.panel__group');
  const el = document.createElement('div');
  el.className = 'panel__live';
  el.innerHTML = `<span class="panel__live-dot" aria-hidden="true"></span><div><strong>Live link</strong><span id="liveText"></span></div>`;
  panel?.before(el);
  const render = () => {
    el.dataset.on = String(hub.connected);
    el.querySelector('#liveText').textContent = hub.connected
      ? `Signed in as ${STAFF.name} (${COMMAND_ID}). Dispatches from the Command Centre dashboard arrive here.`
      : 'Reconnecting to the suite server…';
  };
  render();
  hub.on('_status', render);
}

export async function startLiveLink() {
  if (!(await connectHub('field'))) return false;
  document.documentElement.dataset.live = 'on';
  hub.on('dispatch', onDispatch);
  hub.on('dispatch.recall', onRecall);
  hub.on('alert.update', onAlertUpdate);
  hub.on('sos', onPilgrimSOS);
  hub.on('emergency', onEmergency);
  hub.on('emergency.end', onEmergencyEnd);
  wireOutgoing();
  mountStatus();
  if (!navigator.onLine) setOnline(false);
  setTimeout(() => toast('Live link on · Command Centre connected', 'success'), 900);
  return true;
}
