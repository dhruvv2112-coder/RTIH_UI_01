// Task detail sheet (§5.1), dispatch overlay (§5.2), quick actions, decline reasons,
// notifications (§8.2), menu, emergency.
import { icon } from './icons.js';
import { state, findTask, acceptTask, declineTask, addNote, escalateTask, nextDispatch, emit, unreadCount, setOnline } from './store.js';
import { FACILITY_META, KIND_META } from './data.js';
import { esc, ago, istStamp, istHM, haptic, dispatchTone, longPress, $, $$ } from './util.js';
import { openSheet, closeSheet, toast, layerEl, confirmModal, currentSheet } from './ui.js';
import { mapSVG } from './screens/map.js';
import { bindHoldComplete } from './screens/tasks.js';
import { actions } from './bus.js';

const PRIO = { urgent: ['Urgent', 'critical'], high: ['High', 'warning'], normal: ['Normal', 'normal'], low: ['Low', 'secondary'] };

/* ---------- Task detail bottom sheet ---------- */
function detailHTML(t) {
  const [plabel] = PRIO[t.priority];
  const resources = (t.resources || []).map((r) => {
    const m = FACILITY_META[r.kind];
    return `<li><span class="r-ico ${m.tint}">${icon(m.icon)}</span><span class="t-body">${esc(r.label)}</span><span class="r-dist t-mono">${esc(r.dist)}</span></li>`;
  }).join('');
  const notes = (t.notes || []).map((n) => `<div class="note"><span class="note__time t-mono">${istHM(n.t)}</span><span class="t-body">${esc(n.text)}</span></div>`).join('');
  const readOnly = t.status === 'completed' || t.status === 'declined';
  return `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="pill pill--${t.priority}">${t.priority === 'urgent' ? '<span class="pulse-dot"></span>' : ''}${plabel}</span>
      <span class="pill pill--ghost">${icon(KIND_META[t.kind]?.icon || 'inbox')}${KIND_META[t.kind]?.label || 'Task'}</span>
      ${t.status === 'completed' ? `<span class="pill pill--normal">${icon('check', { stroke: 3 })}Completed</span>` : ''}
      ${t.escalated ? `<span class="pill pill--high">${icon('arrow-up-circle')}Escalated</span>` : ''}
      <span class="t-mono c-tertiary" style="margin-left:auto">${t.id}</span>
    </div>
    <h2 class="t-h1 sheet__title" style="margin-top:12px">${esc(t.short && t.status !== 'completed' ? `${t.short}` : t.title)}</h2>
    <div class="meta-row t-body">${icon('map-pin')}${esc(t.location)}</div>
    ${t.dispatchedBy ? `<div class="t-body c-secondary" style="margin-top:4px">Dispatched by: <span class="c-primary">${esc(t.dispatchedBy)}</span></div>` : ''}
    <div class="t-mono c-secondary" style="margin-top:4px">${t.dispatchedAt ? `${istStamp(t.dispatchedAt)} IST · ${ago(t.dispatchedAt)}` : `Completed ${ago(t.completedAt)} · ${t.duration} min`}</div>
    <hr class="sheet__divider">
    ${t.instructions ? `<div class="sheet-label t-caption-strong" style="text-transform:uppercase">Instructions</div><p class="t-body" style="margin:0">${esc(t.instructions)}</p>` : `<p class="t-body c-secondary">Task closed. Read-only record synced to Command Centre.</p>`}
    ${t.pin ? `
      <div class="sheet-label t-caption-strong" style="text-transform:uppercase">Location</div>
      <div class="minimap">${mapSVG({ mini: true, pin: t, interactive: false })}<span class="minimap__coords t-mono">${t.coords}</span></div>` : ''}
    ${resources ? `<div class="sheet-label t-caption-strong" style="text-transform:uppercase">Nearby Resources</div><ul class="resource-list">${resources}</ul>` : ''}
    ${!readOnly && t.pin ? `
      <div class="btn-row btn-row--3" style="margin-top:16px">
        <button class="btn btn--outline btn--sm" data-d="nav">${icon('navigation')}Navigate</button>
        <button class="btn btn--ghost btn--sm" data-d="call">${icon('phone')}Call</button>
        <button class="btn btn--ghost btn--sm" data-d="esc" style="color:var(--color-status-warning-fg)">${icon('arrow-up-circle')}Escalate</button>
      </div>` : ''}
    ${!readOnly || notes ? `
      <div class="sheet-label t-caption-strong" style="text-transform:uppercase">Notes ${readOnly ? '' : '<span class="c-tertiary" style="text-transform:none;font-weight:400">(tap to add)</span>'}</div>
      <div class="notes">${notes || `<div class="note"><span></span><span class="t-body c-tertiary">No notes yet</span></div>`}
        ${readOnly ? '' : `<form class="note-add" id="noteForm"><input id="noteIn" enterkeyhint="done" placeholder="Add a timestamped note…" aria-label="Add note" autocomplete="off"><button class="btn btn--primary btn--sm" aria-label="Add note">${icon('plus')}</button></form>`}
      </div>` : ''}`;
}

function detailFooter(t) {
  if (t.status === 'active') {
    return `<button class="btn btn--success btn--xl btn--block t-button hold" id="sheetComplete" aria-label="Complete task — press and hold for 1 second"><span class="hold__fill"></span><span class="hold__label">${icon('check-circle-2')}Complete Task<span class="hold__hint">· hold 1s</span></span></button>`;
  }
  if (t.status === 'incoming' || t.status === 'dispatch') {
    return `<div class="btn-row"><button class="btn btn--outline-danger btn--xl" id="sheetDecline">${icon('x')}Decline</button><button class="btn btn--success btn--xl" id="sheetAccept">${icon('check')}Accept</button></div>`;
  }
  if (t.status === 'accepted') return `<div class="t-caption c-secondary" style="text-align:center">Starts automatically when your active task completes.</div>`;
  return '';
}

export function openTask(id, { snap } = {}) {
  const t = findTask(id); if (!t) return;
  haptic('light');
  const isInspection = t.kind === 'inspection' && t.status !== 'completed';
  openSheet({
    id: 'task', label: `Task details: ${t.title}`, snap: snap || (t.status === 'completed' ? 0.6 : 0.85),
    html: detailHTML(t) + (isInspection ? `<button class="btn btn--primary btn--block btn--xl" id="startInsp" style="margin-top:16px">${icon('clipboard-check')}Open Inspection Checklist</button>` : ''),
    footer: detailFooter(t),
    onMount: (sheet) => bindDetail(sheet, t),
  });
}

function bindDetail(sheet, t) {
  $('[data-d="nav"]', sheet)?.addEventListener('click', () => { closeSheet(); actions.navigate('map'); });
  $('[data-d="call"]', sheet)?.addEventListener('click', () => toast('Calling Command Centre…', 'info'));
  $('[data-d="esc"]', sheet)?.addEventListener('click', () => doEscalate(t.id));
  $('#startInsp', sheet)?.addEventListener('click', () => {
    if (t.status === 'incoming') acceptTask(t.id);
    closeSheet(); actions.navigate('inspection');
  });
  const form = $('#noteForm', sheet);
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#noteIn', sheet); if (!inp.value.trim()) return;
    addNote(t.id, inp.value); haptic('light');
    const body = $('.sheet__body', sheet); const keep = body.scrollTop;
    body.innerHTML = detailHTML(findTask(t.id)); body.scrollTop = keep + 60;
    bindDetail(sheet, findTask(t.id));
    $('#noteIn', sheet)?.focus();
  });
  bindHoldComplete($('#sheetComplete', sheet), t.id, () => closeSheet());
  $('#sheetAccept', sheet)?.addEventListener('click', () => {
    const r = acceptTask(t.id, { auto: how === 'auto' }); haptic('medium'); closeSheet();
    toast(r.queued ? 'Accepted offline — queued' : r.becameActive ? 'Task accepted — now active' : 'Accepted — added to Up Next', r.queued ? 'warning' : 'success');
  });
  $('#sheetDecline', sheet)?.addEventListener('click', () => openDecline(t.id));
}

async function doEscalate(id) {
  const ok = await confirmModal({ title: 'Escalate to supervisor?', body: 'Your Shift Supervisor and Command Centre will be alerted and may reassign or send backup.', tone: 'warning', iconName: 'arrow-up-circle', confirm: 'Escalate' });
  if (!ok) return;
  const r = escalateTask(id); haptic('heavy');
  closeSheet();
  toast(r.queued ? 'Escalation queued — sends on reconnect' : 'Escalated · Supervisor notified', r.queued ? 'warning' : 'success');
}

/* ---------- Quick actions (long-press active card) ---------- */
export function openQuick(id) {
  const t = findTask(id);
  openSheet({
    id: 'quick', auto: true, label: 'Quick actions',
    html: `<div class="t-caption-strong c-secondary" style="text-transform:uppercase">Quick Actions</div>
      <h2 class="t-h2" style="margin:4px 0 16px">${esc(t.title)}</h2>
      <div class="option-list">
        <button class="option option--warn" data-q="esc">${icon('arrow-up-circle')}<span><span class="t-body-strong" style="display:block">Escalate</span><span class="t-caption c-secondary">Alert supervisor & Command Centre</span></span></button>
        <button class="option option--info" data-q="note">${icon('pencil-line')}<span><span class="t-body-strong" style="display:block">Add Note</span><span class="t-caption c-secondary">Auto-timestamped field update</span></span></button>
        <button class="option option--danger" data-q="backup">${icon('user-plus')}<span><span class="t-body-strong" style="display:block">Request Backup</span><span class="t-caption c-secondary">Nearest 2 marshals will be dispatched</span></span></button>
      </div>`,
    onMount: (sheet) => {
      $('[data-q="esc"]', sheet).addEventListener('click', () => doEscalate(id));
      $('[data-q="note"]', sheet).addEventListener('click', () => { closeSheet(true); openTask(id, { snap: 0.85 }); setTimeout(() => { const s = currentSheet()?.sheet; const b = s && $('.sheet__body', s); b && (b.scrollTop = b.scrollHeight); $('#noteIn', s)?.focus(); }, 350); });
      $('[data-q="backup"]', sheet).addEventListener('click', () => { addNote(id, 'Backup requested'); haptic('heavy'); closeSheet(); toast('Backup requested · ETA 3 min', 'success'); });
    },
  });
}

/* ---------- Decline reason ---------- */
export function openDecline(id, { onCancel, onDone } = {}) {
  let chose = false;
  const reasons = [['Busy', 'On another task', 'clock'], ['Too Far', 'More than 10 min away', 'footprints'], ['Needs Specialist', 'Medical / technical skill required', 'heart-pulse']];
  openSheet({
    id: 'decline', auto: true, label: 'Decline reason',
    html: `<div class="t-caption-strong c-critical" style="text-transform:uppercase">Decline Task</div>
      <h2 class="t-h1" style="margin:4px 0 4px">Why are you declining?</h2>
      <p class="t-caption c-secondary" style="margin:0 0 16px">Dispatch will reassign to the next nearest staff member.</p>
      <div class="option-list">${reasons.map(([r, sub, ic]) => `<button class="option" data-r="${r}">${icon(ic)}<span style="flex:1"><span class="t-body-strong" style="display:block">${r}</span><span class="t-caption c-secondary">${sub}</span></span>${icon('chevron-right', { size: 20 })}</button>`).join('')}</div>`,
    onMount: (sheet) => $$('[data-r]', sheet).forEach((b) => b.addEventListener('click', () => {
      chose = true;
      const r = declineTask(id, b.dataset.r); haptic('medium'); closeSheet();
      toast(r.queued ? `Declined (${b.dataset.r}) — queued` : `Declined · ${b.dataset.r}`, r.queued ? 'warning' : 'info');
      onDone?.();
    })),
    onClose: () => { if (!chose) onCancel?.(); },
  });
}

/* ---------- Dispatch overlay (§5.2) ---------- */
let dispatchEl = null;
const pendingDispatches = [];
export function openDispatch(provided) {
  if (dispatchEl) { if (provided) pendingDispatches.push(provided); return; }
  closeSheet(true);
  const t = provided || nextDispatch();
  const high = t.priority !== 'urgent';
  haptic('alert'); dispatchTone(!high);
  const el = document.createElement('div');
  el.className = `dispatch${high ? ' dispatch--high' : ''}`;
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'dsp-t');
  el.innerHTML = `
    <div class="dispatch__main">
      <div class="dispatch__siren">${icon('siren')}</div>
      <h2 class="t-h1 dispatch__kicker" id="dsp-k">INCOMING DISPATCH</h2>
      <p class="dispatch__title" id="dsp-t">${esc(t.title)}</p>
      <p class="t-body c-secondary" style="margin:0 0 12px">${esc(t.location)}</p>
      <span class="pill pill--${t.priority}">Priority: ${t.priority.toUpperCase()}</span>
      <div class="dispatch__stats">
        <div class="dispatch__stat"><div class="t-caption c-secondary">Distance</div><div class="t-display" style="font-size:28px">${t.distance}<span class="t-h3 c-secondary">m</span></div></div>
        <div class="dispatch__stat"><div class="t-caption c-secondary">ETA walking</div><div class="t-display" style="font-size:28px">~${t.eta}<span class="t-h3 c-secondary"> min</span></div></div>
      </div>
      <p class="t-body" style="margin:16px 0 0;text-align:left;color:var(--color-text-secondary)">${esc(t.instructions)}</p>
    </div>
    <div class="dispatch__actions">
      <button class="btn btn--success btn--xl btn--block t-button hold" id="dAccept" aria-label="Accept dispatch — press and hold for 1 second"><span class="hold__fill"></span><span class="hold__label">${icon('check', { stroke: 3 })}Accept<span class="hold__hint">(hold 1s)</span></span></button>
      <button class="btn btn--outline-danger btn--xl btn--block t-button" id="dDecline">${icon('x', { stroke: 3 })}Decline<span class="hold__hint">(with reason)</span></button>
      <div class="countdown t-caption" aria-live="polite"><span id="dCount">Auto-accept in 30s if no response</span><div class="countdown__track"><div class="countdown__fill" id="dBar"></div></div></div>
    </div>`;
  layerEl().append(el);
  dispatchEl = el;
  emit('dispatch-open');

  const bar = $('#dBar', el), label = $('#dCount', el);
  const started = Date.now(), TOTAL = 30_000;
  bar.style.transition = `transform ${TOTAL}ms linear`;
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }));
  const tick = setInterval(() => {
    const left = Math.max(0, Math.ceil((TOTAL - (Date.now() - started)) / 1000));
    label.textContent = `Auto-accept in ${left}s if no response`;
    if (left <= 0) finish('auto');
  }, 250);

  function close() { clearInterval(tick); el.style.transition = 'opacity 200ms'; el.style.opacity = '0'; setTimeout(() => { el.remove(); dispatchEl = null; emit('dispatch-close'); const next = pendingDispatches.shift(); if (next && next.status === 'dispatch') setTimeout(() => openDispatch(next), 400); }, 200); }
  t.cancelDispatch = (msg) => { if (dispatchEl !== el) return; close(); toast(msg, 'warning'); };
  function finish(how) {
    if (!dispatchEl) return;
    t.status = 'incoming';
    const r = acceptTask(t.id);
    close();
    haptic('medium');
    if (how === 'auto') toast('Auto-accepted · No response in 30s', 'warning');
    else toast(r.queued ? 'Dispatch accepted — queued offline' : r.preempted ? 'Urgent — now your current task' : r.becameActive ? 'Dispatch accepted — navigate now' : 'Accepted — Up Next after current task', r.queued ? 'warning' : 'success');
  }
  const acc = $('#dAccept', el);
  longPress(acc, 1000, {
    onStart: () => { acc.classList.add('is-holding'); haptic('light'); },
    onCancel: () => acc.classList.remove('is-holding'),
    onDone: () => finish('hold'),
  });
  $('#dDecline', el).addEventListener('click', () => {
    clearInterval(tick); bar.style.transition = 'none';
    const w = bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width; bar.style.transform = `scaleX(${w})`;
    label.textContent = 'Countdown paused — choose a reason';
    openDecline(t.id, {
      onDone: () => close(),
      onCancel: () => { label.textContent = 'Countdown paused · hold Accept or Decline'; },
    });
    t.status = 'incoming';
  });
  setTimeout(() => acc.focus(), 300);
}

/* ---------- Notifications (§8.2) ---------- */
const NTYPE = { urgent: ['siren', 'tint-urgent'], normal: ['clipboard-list', 'tint-info'], update: ['info', 'tint-info'], shift: ['clock', 'tint-high'], emergency: ['alert-triangle', 'tint-urgent'] };
let notifEl = null;
export function toggleNotifications() {
  if (notifEl) { closeNotif(); return; }
  notifEl = document.createElement('div');
  notifEl.className = 'notif-panel';
  notifEl.setAttribute('role', 'dialog'); notifEl.setAttribute('aria-label', 'Notifications');
  layerEl().append(notifEl);
  const draw = () => {
    const list = state.notifications;
    notifEl.innerHTML = `
      <div class="notif-panel__head"><span class="t-h2">Notifications <span class="section-h__count">${unreadCount()}</span></span><button class="link-btn" id="nClear" ${list.length ? '' : 'disabled'}>Clear All</button></div>
      <div class="notif-panel__list">${list.length ? list.map((n) => {
        const [ic, tint] = NTYPE[n.type] || NTYPE.update;
        return `<div class="notif ${n.read ? '' : 'is-unread'}" data-n="${n.id}" tabindex="0"><span class="notif__ico ${tint}">${icon(ic)}</span><div class="notif__body"><div class="t-body-strong">${esc(n.title)}</div><div class="t-caption c-secondary">${esc(n.body)}</div><div class="t-mono c-tertiary" style="font-size:12px">${istHM(n.t)} · ${ago(n.t)}</div></div></div>`;
      }).join('') : `<div class="notif__empty">${icon('bell', { size: 28 })}<div class="t-body" style="margin-top:8px">You're all caught up</div></div>`}</div>
      ${list.length ? '<div class="t-caption c-tertiary" style="padding:8px 16px;text-align:center">Swipe right to dismiss</div>' : ''}`;
    $('#nClear', notifEl)?.addEventListener('click', () => { state.notifications = []; emit('notif'); draw(); });
    $$('[data-n]', notifEl).forEach((row) => {
      let sx = null;
      row.addEventListener('pointerdown', (e) => { sx = e.clientX; row.setPointerCapture(e.pointerId); });
      row.addEventListener('pointermove', (e) => { if (sx != null && e.clientX - sx > 0) row.style.transform = `translateX(${e.clientX - sx}px)`; });
      row.addEventListener('pointerup', (e) => {
        const dx = e.clientX - sx; sx = null;
        if (dx > 80) { row.style.transform = 'translateX(110%)'; row.style.opacity = '0'; haptic('light'); setTimeout(() => { state.notifications = state.notifications.filter((n) => n.id !== row.dataset.n); emit('notif'); draw(); }, 250); }
        else { row.style.transform = ''; if (Math.abs(dx) < 6) { const n = state.notifications.find((x) => x.id === row.dataset.n); n.read = true; emit('notif'); draw(); } }
      });
    });
  };
  draw();
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  emit('notif-open');
}
function outside(e) { if (notifEl && !notifEl.contains(e.target) && !e.target.closest('#bell')) closeNotif(); }
export function closeNotif() {
  if (!notifEl) return;
  document.removeEventListener('pointerdown', outside, true);
  state.notifications.forEach((n) => { n.read = true; });
  notifEl?.remove(); notifEl = null; emit('notif');
}
export const notifOpen = () => !!notifEl;

/* ---------- Menu ---------- */
export function openMenu() {
  openSheet({
    id: 'menu', auto: true, label: 'Menu',
    html: `<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><div class="avatar" style="width:44px;height:44px;margin:0;font-size:16px;box-shadow:none">RK</div><div><div class="t-h3">Ramesh Kumar</div><div class="t-caption c-secondary">Zone Marshal · Zone A · On shift</div></div></div>
      <div class="option-list">
        <button class="option option--danger" data-m="sos">${icon('phone-call')}<span><span class="t-body-strong" style="display:block">SOS Emergency</span><span class="t-caption c-secondary">Alerts supervisor & Command Centre</span></span></button>
        <button class="option" data-m="scan">${icon('scan-line')}<span><span class="t-body-strong" style="display:block">Scan Vendor QR</span><span class="t-caption c-secondary">Open a stall's license & inspection</span></span></button>
        <button class="option" data-m="glasses">${icon('camera')}<span><span class="t-body-strong" style="display:block">Smart Glasses Upload</span><span class="t-caption c-secondary">Images go to S1 — you see results only</span></span></button>
      </div>
      <div class="t-caption-strong c-tertiary" style="text-transform:uppercase;margin:20px 0 8px">Demo controls</div>
      <div class="option-list">
        <button class="option option--danger" data-m="dispatch">${icon('siren')}<span class="t-body-strong">Simulate incoming dispatch</span></button>
        <button class="option option--warn" data-m="net">${icon(state.online ? 'wifi-off' : 'wifi')}<span class="t-body-strong">${state.online ? 'Go offline' : 'Reconnect'}</span></button>
        <button class="option" data-m="reset">${icon('rotate-ccw')}<span class="t-body-strong">Reset demo data</span></button>
      </div>`,
    onMount: (sheet) => {
      $('[data-m="sos"]', sheet).addEventListener('click', () => { closeSheet(true); openEmergency(); });
      $('[data-m="scan"]', sheet).addEventListener('click', () => { closeSheet(); toast('QR matched · Stall #47 — Sri Lakshmi Foods', 'success'); setTimeout(() => actions.navigate('inspection'), 400); });
      $('[data-m="glasses"]', sheet).addEventListener('click', () => { closeSheet(true); openGlasses(); });
      $('[data-m="dispatch"]', sheet).addEventListener('click', () => { closeSheet(true); openDispatch(); });
      $('[data-m="net"]', sheet).addEventListener('click', () => { closeSheet(); setOnline(!state.online); });
      $('[data-m="reset"]', sheet).addEventListener('click', () => { closeSheet(); actions.reset(); });
    },
  });
}

function openGlasses() {
  openSheet({
    id: 'glasses', auto: true, label: 'Smart Glasses analysis',
    html: `<div class="t-caption-strong c-info" style="text-transform:uppercase">Smart Glasses · SG-0117</div>
      <h2 class="t-h1" style="margin:4px 0 8px">Analysis results</h2>
      <p class="t-caption c-secondary" style="margin:0 0 16px">${icon('shield', { size: 14 })} Raw images are routed straight to S1 for AI processing and are never shown on this device.</p>
      <div class="card stats">
        <div class="stat-row">${icon('users')}<span class="t-body">People in frame</span><span class="stat-row__val">38 · moderate</span></div>
        <div class="stat-row">${icon('alert-triangle')}<span class="t-body">Hazards detected</span><span class="stat-row__val c-warning">1 · wet steps</span></div>
        <div class="stat-row">${icon('store')}<span class="t-body">Unlicensed vending</span><span class="stat-row__val c-normal">None</span></div>
        <div class="stat-row">${icon('clock')}<span class="t-body">Processed</span><span class="stat-row__val t-mono">${istHM(Date.now())} IST</span></div>
      </div>
      <button class="btn btn--primary btn--block btn--xl" id="toReport" style="margin-top:16px">${icon('file-text')}File hazard report</button>`,
    onMount: (s) => $('#toReport', s).addEventListener('click', () => { state.report.type = 'safety'; state.report.severity = 'medium'; state.report.description = 'Wet steps flagged by Smart Glasses analysis near Ghat #3. '; closeSheet(); actions.navigate('report'); }),
  });
}

/* ---------- Emergency ---------- */
export function openEmergency() {
  haptic('alert');
  const sosId = `SSOS-${Date.now().toString(36)}`;
  document.dispatchEvent(new CustomEvent('gf:sos', { detail: { sosId } }));
  const el = document.createElement('div');
  el.className = 'dispatch';
  el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="dispatch__main">
      <div class="dispatch__siren">${icon('phone-call')}</div>
      <h2 class="t-h1 dispatch__kicker">EMERGENCY PROTOCOL</h2>
      <p class="dispatch__title">SOS sent</p>
      <p class="t-body c-secondary" style="margin:0" id="eMsg">Supervisor, Command Centre and the nearest medical team have your live location.</p>
      <div class="card stats" style="width:100%;margin-top:24px;text-align:left">
        <div class="stat-row">${icon('map-pin')}<span class="t-body">Ghat #3, Zone A</span><span class="stat-row__val t-mono" style="font-weight:400">16.98912° N</span></div>
        <div class="stat-row">${icon('users')}<span class="t-body">Responders</span><span class="stat-row__val c-normal">3 en route</span></div>
        <div class="stat-row">${icon('clock')}<span class="t-body">Sent</span><span class="stat-row__val t-mono">${istStamp(Date.now())}</span></div>
      </div>
    </div>
    <div class="dispatch__actions">
      <button class="btn btn--danger btn--xl btn--block t-button" id="eCall">${icon('phone')}Call Command Centre</button>
      <button class="btn btn--ghost btn--xl btn--block" id="eCancel">I'm safe — cancel SOS</button>
    </div>`;
  layerEl().append(el);
  $('#eCall', el).addEventListener('click', () => toast('Connecting to Command Centre…', 'info'));
  $('#eCancel', el).addEventListener('click', () => { el.remove(); document.dispatchEvent(new CustomEvent('gf:sos-cancel', { detail: { sosId } })); toast('SOS cancelled · Supervisor informed', 'info'); });
  state.notifications.unshift({ id: 'e' + Date.now(), type: 'emergency', title: 'EMERGENCY PROTOCOL', body: 'Emergency activated — Zone A', t: Date.now(), read: true });
}
