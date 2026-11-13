// Godavari Command — app shell, routing between modes, keyboard system,
// responsive behaviour (§7) and the live-data simulation loop.
import { icon } from './icons.js';
import { state, set, subscribe, touch, openAlerts } from './store.js';
import { ALERT_STREAM, CAMERAS, ZONES, FACILITIES, PRIVACY_ZONES } from './data.js';
import { breakpoint, $, $$, announce, esc } from './util.js';
import { mountHeader, mountFooter } from './shell.js';
import { mountCameraGrid } from './cameras.js';
import { createMap } from './map.js';
import { mountAlertQueue } from './alerts.js';
import { mountKPIs, startKPISimulation, kpiCardHTML } from './kpi.js';
import { openDispatch } from './dispatch.js';
import { chooseZoneAndActivate, deactivate, mountEmergencyPanel, mountEmergencyBanner, log } from './emergency.js';
import { openPalette, openShortcuts } from './palette.js';
import { mountAnalytics } from './analytics.js';
import { mountReplay } from './replay.js';
import { toast, closeDropdown, closeTopModal, hasModal, dropdown, chime } from './ui.js';
import { setFeedsPaused } from './camera-sim.js';
import './live.js';

const VIEWS = ['live', 'replay', 'analytics', 'map'];
const VIEW_META = {
  live: { icon: 'radio', label: 'Live', key: 'Alt+1' },
  replay: { icon: 'rewind', label: 'Replay', key: 'Alt+2' },
  analytics: { icon: 'bar-chart-3', label: 'Analytics', key: 'Alt+3' },
  map: { icon: 'map', label: 'Map', key: 'Alt+4' },
};

/* ------------------------------------------------------------- theme */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  try { sessionStorage.setItem('gc-theme', state.theme); } catch { /* storage off */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', state.theme === 'dark' ? '#0F172A' : '#1E3A5F');
}
applyTheme();
subscribe('theme', applyTheme);

/* ------------------------------------------------------------- tabs */
const tabs = $('#tabs');
tabs.innerHTML = VIEWS.map((v) => `<button role="tab" id="tab-${v}" aria-controls="view-${v}" aria-selected="false" tabindex="-1" data-view="${v}" title="${VIEW_META[v].label} (${VIEW_META[v].key}${v === 'map' ? ' or Space' : ''})">
  ${icon(VIEW_META[v].icon, 16)}<span>${VIEW_META[v].label}</span></button>`).join('') + `<span class="tabs__spacer"></span><span class="tabs__hint t-caption" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd> search · <kbd>?</kbd> shortcuts</span>`;
tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) actions.view(b.dataset.view); });
tabs.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault(); e.stopPropagation();
  const i = VIEWS.indexOf(state.view);
  const n = VIEWS[(i + (e.key === 'ArrowRight' ? 1 : -1) + VIEWS.length) % VIEWS.length];
  actions.view(n); $(`#tab-${n}`).focus();
});

/* ------------------------------------------------------------- mounts */
let cams, liveMap, fullMap, tabletMap, aq, analytics, replay;
const mounted = {};

const actions = {
  view(v) {
    if (!VIEWS.includes(v)) return;
    if (state.view === 'replay' && v !== 'replay') replay?.pause();
    set({ view: v });
  },
  palette: (q = '') => openPalette(actions, q),
  shortcuts: openShortcuts,
  toggleTheme() { set({ theme: state.theme === 'dark' ? 'light' : 'dark' }); toast({ type: 'info', title: state.theme === 'dark' ? 'Night theme on' : 'Day theme on', life: 2500 }); },
  focusAlerts() {
    if (breakpoint() === 'md') openRail();
    if (breakpoint() === 'sm') set({ tabletTab: 'alerts' });
    if (state.view === 'replay' || state.view === 'analytics') actions.view('live');
    requestAnimationFrame(() => aq.focusFirstUnread());
  },
  focusAlert(id) {
    const a = state.alerts.find((x) => x.id === id);
    if (!a) return;
    if (state.view === 'replay' || state.view === 'analytics') actions.view('live');
    if (state.zones.length && !state.zones.includes(a.zone)) set({ zones: [] });
    if (breakpoint() === 'md') openRail();
    if (breakpoint() === 'sm') set({ tabletTab: 'alerts' });
    requestAnimationFrame(() => aq.focusAlert(id));
    actions.alertSelected(a);
  },
  alertSelected(a) {
    // S3-09: clicking an alert brings its cameras into the grid
    if (a.cams.length && state.view === 'live') {
      const ids = [...a.cams];
      CAMERAS.filter((c) => c.zone === a.zone && !ids.includes(c.id)).forEach((c) => ids.push(c.id));
      set({ customGroup: { name: `Around ${a.id} · ${a.title.split(' — ')[0]}`, cams: ids } });
    }
    (state.view === 'map' ? fullMap : liveMap)?.focusOn(a.location, 1.35);
  },
  dispatch(a) {
    openDispatch(a, { onDone: (s) => { if (state.emergency) log(`${s.name} dispatched to ${a.title}`); } });
  },
  dispatchSelected() {
    const a = aq.selected();
    if (a && a.state !== 'dispatched') actions.dispatch(a);
    else if (!a) toast({ type: 'info', title: 'Select an alert first', desc: 'Press A to jump to the alert queue, then D to dispatch.' });
  },
  openCam(id) {
    if (breakpoint() === 'md' && state.railOpen) closeRail();
    const cam = CAMERAS.find((c) => c.id === id);
    if (!cam) return;
    if (state.view !== 'live') actions.view('live');
    const inGrid = $(`#cams [data-cam="${id}"]`);
    if (!inGrid) set({ customGroup: { name: `Zone ${cam.zone} · from ${cam.id}`, cams: [id, ...CAMERAS.filter((c) => c.zone === cam.zone && c.id !== id).map((c) => c.id)] } });
    requestAnimationFrame(() => cams.openEnlarged(id));
  },
  zoneCams(z) { set({ customGroup: null, preset: { A: 1, B: 2, C: 3, D: 4 }[z] }); actions.view('live'); },
  mapZone(z) { actions.view('map'); requestAnimationFrame(() => { fullMap.fit(); fullMap.openZone(z); }); },
  zoneAlerts(z) { set({ zones: [z], alertFilter: 'all' }); actions.focusAlerts(); },
  dispatchZone(z) { const zone = ZONES.find((x) => x.id === z); openDispatch(null, { at: zone.label }); },
  alertCams(a) { actions.view('live'); actions.alertSelected(a); },
  alertMap(a) {
    state.selectedAlert = a.id; touch('selectedAlert');
    if (breakpoint() === 'sm') { set({ tabletTab: 'map' }); requestAnimationFrame(() => tabletMap?.focusOn(a.location, 2.4)); return; }
    actions.view('map'); requestAnimationFrame(() => fullMap.focusOn(a.location, 2.4));
  },
  alertReplay(a) { actions.view('replay'); requestAnimationFrame(() => replay.showAlert(a)); },
  staffOnMap(id) { const s = state.staff.find((x) => x.id === id); actions.view('map'); requestAnimationFrame(() => fullMap.focusOn(s.pos, 3)); },
  facilityOnMap(id) { const f = FACILITIES.find((x) => x.id === id); actions.view('map'); requestAnimationFrame(() => fullMap.focusOn(f.pos, 3)); },
  emergency(zone) {
    if (state.emergency) { deactivate(); return; }
    chooseZoneAndActivate(zone);
  },
  logout() {
    const s = $('#signout');
    s.hidden = false;
    setFeedsPaused(true);
    s.querySelector('button').focus();
  },
};

/* ------------------------------------------------------------- build */
mountHeader($('#hdr'), actions);
mountFooter($('#ftr'));
mountEmergencyBanner($('#em-banner'));
cams = mountCameraGrid($('#cams'));
liveMap = createMap($('#live-map'), { compact: true });
aq = mountAlertQueue($('#aq'), actions);
mountKPIs($('#kpis'));
mountEmergencyPanel($('#em-panel'));

function ensureView(v) {
  if (mounted[v]) return;
  mounted[v] = true;
  if (v === 'map') fullMap = createMap($('#full-map'), { compact: false });
  if (v === 'analytics') { analytics = mountAnalytics($('#view-analytics')); analytics.render(); }
  if (v === 'replay') replay = mountReplay($('#view-replay'));
}

function renderView() {
  const v = state.view;
  ensureView(v);
  document.documentElement.dataset.view = v;
  for (const x of VIEWS) {
    const on = x === v;
    $(`#view-${x}`).hidden = !on;
    const t = $(`#tab-${x}`);
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  if (v === 'analytics') requestAnimationFrame(() => analytics.render());
  if (v === 'replay') replay.refresh();
  if (v !== 'live') cams.closeEnlarged();
  announce(`${VIEW_META[v].label} view`);
}
renderView();
subscribe('view', renderView);

/* ------------------------------------------------------- rail (MD/SM) */
const rail = $('#rail');
function railIcons() {
  const open = openAlerts().filter((a) => !state.zones.length || state.zones.includes(a.zone));
  const by = (s) => open.filter((a) => a.severity === s).length;
  $('.rail__icons', rail).innerHTML = `
    <button class="rail__btn ${state.railOpen ? 'is-active' : ''}" data-rail="alerts" aria-expanded="${state.railOpen}" aria-controls="aq" aria-label="Alert queue, ${open.length} open">
      ${icon('bell', 20)}<span class="rail__count">${open.length}</span></button>
    ${['critical', 'high', 'medium', 'low'].map((s) => `<button class="rail__sev sev-${s}" data-rail-filter="${s}" aria-label="${by(s)} ${s} alerts"><i></i><span>${by(s)}</span></button>`).join('')}
    <span class="rail__sep"></span>
    <button class="rail__btn" data-rail="kpis" aria-haspopup="dialog" aria-label="Key indicators">${icon('bar-chart-3', 20)}<span class="rail__lbl">KPIs</span></button>
    ${state.emergency ? `<button class="rail__btn rail__btn--em" data-rail="em" aria-label="Emergency actions">${icon('siren', 20)}</button>` : ''}`;
}
function openRail() { set({ railOpen: true }); rail.classList.add('is-open'); railIcons(); }
function closeRail() { set({ railOpen: false }); rail.classList.remove('is-open', 'is-em-open'); railIcons(); }
railIcons();
subscribe(['alerts', 'zones', 'emergency'], railIcons);
rail.addEventListener('click', (e) => {
  const b = e.target.closest('[data-rail],[data-rail-filter]');
  if (!b) return;
  if (b.dataset.railFilter) { set({ alertFilter: b.dataset.railFilter }); openRail(); return; }
  if (b.dataset.rail === 'alerts') return state.railOpen ? closeRail() : openRail();
  if (b.dataset.rail === 'em') { rail.classList.toggle('is-em-open'); return; }
  if (b.dataset.rail === 'kpis') {
    dropdown(b, `<div class="kpi-pop"><div class="dropdown__head"><div class="t-h3">Key indicators</div></div><div class="kpi-grid kpi-grid--pop">${state.kpis.map((k) => kpiCardHTML(k)).join('')}</div></div>`, { align: 'right', className: 'dropdown--kpi' });
  }
});
document.addEventListener('pointerdown', (e) => {
  if (state.railOpen && breakpoint() === 'md' && !rail.contains(e.target) && !e.target.closest('.dropdown,.modal-wrap,.toast')) closeRail();
});

// tablet tabs
const tt = $('#tablet-tabs');
function renderTabletTabs() {
  const n = openAlerts().length;
  tt.innerHTML = [['alerts', 'bell', `Alerts (${n})`], ['kpis', 'bar-chart-3', 'KPIs'], ['map', 'map', 'Map'], ['cameras', 'camera', 'Cameras']]
    .map(([k, ic, l]) => `<button role="tab" aria-selected="${state.tabletTab === k}" data-tt="${k}">${icon(ic, 16)}${l}</button>`).join('');
  rail.dataset.tablet = state.tabletTab;
  if (state.tabletTab === 'map' && breakpoint() === 'sm' && !tabletMap) tabletMap = createMap($('#tablet-map'), { compact: true });
  if (state.tabletTab === 'cameras') {
    $('#tablet-cams').innerHTML = `<ul class="tcam-list">${CAMERAS.filter((c) => !state.zones.length || state.zones.includes(c.zone)).slice(0, 60).map((c) => `<li><button data-tcam="${c.id}"><span class="status-dot status-dot--${c.status === 'streaming' ? 'ok' : c.status === 'degraded' ? 'warn' : 'crit'}"></span><span class="t-mono">${c.id}</span><span class="ellipsis">${esc(c.place)}</span>${icon('chevron-right', 16)}</button></li>`).join('')}</ul>`;
  }
}
renderTabletTabs();
subscribe(['tabletTab', 'alerts', 'zones'], renderTabletTabs);
tt.addEventListener('click', (e) => { const b = e.target.closest('[data-tt]'); if (b) set({ tabletTab: b.dataset.tt }); });
$('#tablet-cams').addEventListener('click', (e) => { const b = e.target.closest('[data-tcam]'); if (b) actions.openCam(b.dataset.tcam); });

/* --------------------------------------------- events bubbling from modules */
document.addEventListener('gc:focus-alert', (e) => actions.focusAlert(e.detail.id));
document.addEventListener('gc:select-cams', (e) => {
  const ids = e.detail.ids;
  if (!ids.length) { toast({ type: 'info', title: 'No cameras in that area', desc: 'Shift-drag across camera markers to select them.' }); return; }
  set({ customGroup: { name: e.detail.name || `Map selection · ${ids.length} camera${ids.length > 1 ? 's' : ''}`, cams: ids } });
  actions.view('live');
  toast({ type: 'info', title: `${ids.length} camera${ids.length > 1 ? 's' : ''} in grid`, desc: 'Press 1–9 to return to a preset group.', life: 4000 });
});
document.addEventListener('gc:dispatch-here', (e) => openDispatch(null, { at: e.detail.at }));
document.addEventListener('gc:toast', (e) => toast(e.detail));
document.addEventListener('gc:shortcuts', () => openShortcuts());
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'map-full') actions.view('map');
  if (b.dataset.act === 'map-3d') import('./map3d-view.js').then(async (m) => { const on = await m.toggle3D($('#full-map')); b.setAttribute('aria-pressed', String(on)); });
  if (b.dataset.act === 'open-cam' && b.dataset.cam) actions.openCam(b.dataset.cam);
  if (b.dataset.act === 'call-staff') { const s = state.staff.find((x) => x.id === b.dataset.staff); toast({ type: 'info', title: `Calling ${s.name}`, desc: `Radio CH-${s.zone}${s.id.slice(-2)} · ${s.phone}` }); }
  if (b.dataset.act === 'dispatch-staff') { const s = state.staff.find((x) => x.id === b.dataset.staff); openDispatch(null, { at: s.pos }); }
});
$('#signout button').addEventListener('click', () => { $('#signout').hidden = true; setFeedsPaused(false); toast({ type: 'success', title: `Welcome back, ${state.user.name}`, desc: state.user.shift }); });

/* ------------------------------------------------------------- keyboard */
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t.matches?.('input, textarea, select, [contenteditable]');
  const signout = !$('#signout').hidden;
  if (signout) return;

  if (e.key === 'Escape') {
    if (closeDropdown()) return;
    if (closeTopModal()) return;
    if (typing) { t.blur(); return; }
    if ($('#full-map')?.dataset.m3d === 'on') { import('./map3d-view.js').then((m) => m.close3D()); return; }
    if (cams.closeEnlarged()) return;
    if (breakpoint() === 'md' && state.railOpen) { closeRail(); return; }
    if (state.view !== 'live') { actions.view('live'); return; }
    if (state.customGroup) { set({ customGroup: null }); return; }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); closeDropdown(); if (!hasModal()) actions.palette(); return; }
  if (typing || hasModal()) return;
  if (e.altKey && /^[1-4]$/.test(e.key)) { e.preventDefault(); actions.view(VIEWS[Number(e.key) - 1]); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const onInteractive = t.closest?.('button, a, [role=slider], .gis__svg');
  const inGrid = t.closest?.('#cams');
  switch (e.key) {
    case ' ':
      if (onInteractive && !t.matches('.cam')) return;
      e.preventDefault();
      actions.view(state.view === 'map' ? 'live' : 'map');
      break;
    case 'a': case 'A': e.preventDefault(); actions.focusAlerts(); break;
    case 'd': case 'D': e.preventDefault(); actions.dispatchSelected(); break;
    case 'f': case 'F':
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => toast({ type: 'warning', title: 'Full screen blocked', desc: 'The browser refused full-screen mode. Use F11 instead.' }));
      break;
    case 'r': case 'R': e.preventDefault(); actions.view('replay'); break;
    case 'n': case 'N': e.preventDefault(); actions.toggleTheme(); break;
    case '?': e.preventDefault(); openShortcuts(); break;
    case 'Enter':
      if (inGrid && t.matches('.cam')) { e.preventDefault(); cams.openEnlarged(t.dataset.cam); }
      break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown':
      if (state.view === 'live' && (inGrid || t === document.body) && !cams.isEnlarged()) {
        e.preventDefault();
        const n = Math.round(Math.sqrt($$('#cams .cam').length)) || 1;
        cams.moveSelection({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[e.key]);
      }
      break;
    default:
      if (/^[1-9]$/.test(e.key) && state.view === 'live') {
        set({ preset: Number(e.key), customGroup: null });
        announce(`Camera group ${e.key}`);
      }
  }
});

/* ------------------------------------------------------- responsive */
let bp = breakpoint();
document.documentElement.dataset.bp = bp;
window.addEventListener('resize', () => {
  const n = breakpoint();
  if (n === bp) return;
  bp = n;
  document.documentElement.dataset.bp = n;
  if (n !== 'md') closeRail();
  renderTabletTabs();
});

/* ------------------------------------------------------- simulation */
startKPISimulation(touch);
let streamIdx = 0;
function nextAlert() {
  const tpl = ALERT_STREAM[streamIdx++ % ALERT_STREAM.length];
  const id = `AL-${2041 + streamIdx}`;
  state.alerts.unshift({ ...tpl, id, ts: Date.now(), state: 'unread', notes: '' });
  touch('alerts');
  if (tpl.severity === 'critical') {
    toast({ type: 'critical', title: tpl.title, desc: tpl.desc, action: { label: 'View', run: () => actions.focusAlert(id) } });
  }
  setTimeout(nextAlert, 55000 + Math.random() * 40000);
}
setTimeout(nextAlert, 25000);

setInterval(() => {
  const s = state.system;
  s.network = Math.max(6.2, Math.min(10, s.network + (Math.random() - 0.5) * 0.6));
  touch('system');
}, 5000);
setInterval(() => { state.system.storage = Math.min(84, state.system.storage + 0.05); touch('system'); }, 60000);

// camera B-07 recovers after ~2 minutes, then a new fault appears later
setTimeout(() => {
  const c = CAMERAS.find((x) => x.id === 'B-07');
  Object.assign(c, { status: 'streaming', fps: 25, bitrate: 4100 });
  const a = state.alerts.find((x) => x.id === 'AL-2034');
  if (a && a.state !== 'resolved') { a.state = 'resolved'; a.assignee = 'Auto-recovery'; }
  touch('cameras', 'alerts');
  toast({ type: 'success', title: 'CAM B-07 back online', desc: 'Stream resumed automatically. Alert AL-2034 closed.' });
  $$('#cams .cam').length && cams.render();
}, 120000);

// radar counts drift
setInterval(() => {
  import('./data.js').then(({ RADAR_FLOW }) => {
    RADAR_FLOW.forEach((r) => { r.count = Math.max(100, Math.round(r.count + (Math.random() - 0.48) * 40)); r.density = Math.min(0.98, Math.max(0.1, r.density + (Math.random() - 0.5) * 0.01)); });
    liveMap?.redrawRadar(); fullMap?.redrawRadar(); tabletMap?.redrawRadar();
  });
}, 3000);

// first-load: the critical alert for Zone A is selected so the 2-second scan lands on it
state.selectedAlert = 'AL-2041';
touch('selectedAlert');

// welcome
setTimeout(() => toast({ type: 'info', title: `Day shift · ${state.user.name}`, desc: `${openAlerts().length} open alerts, ${PRIVACY_ZONES.length} privacy zones on radar only. Press ? for shortcuts.` }), 600);

void chime;
window.__gc = { state, actions };
