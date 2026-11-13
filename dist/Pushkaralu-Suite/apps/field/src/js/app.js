// Godavari Field — app shell, router, and showcase controls.
import { icon } from './icons.js';
import { state, subscribe, set, setOnline, unreadCount, byStatus, resetDemo, activeTask } from './store.js';
import { istClock, haptic, $, $$ } from './util.js';
import { mountLayer, closeSheet, openSheet, toast } from './ui.js';
import { actions } from './bus.js';
import { renderTasks, bindTasks } from './screens/tasks.js';
import { renderMap, bindMap, layersPanel, bindLayers } from './screens/map.js';
import { renderReport, bindReport, reportHeaderRight } from './screens/report.js';
import { renderInspection, bindInspection, inspectionHeaderRight } from './screens/inspection.js';
import { renderProfile, bindProfile, renderLogin, bindLogin } from './screens/profile.js';
import { startLiveLink } from './link.js';
import { openTask, openQuick, openDecline, openDispatch, toggleNotifications, openMenu, openEmergency, notifOpen, closeNotif } from './overlays.js';

window.__bootAt = window.__bootAt || Date.now();

const ROUTES = {
  tasks: { title: 'My Tasks', left: 'menu', right: 'bell-gear', tab: 'tasks', render: renderTasks, bind: bindTasks },
  map: { title: 'Zone A Map', left: 'back', right: 'layers', tab: 'map', render: renderMap, bind: bindMap },
  report: { title: 'New Field Report', left: 'back', right: 'send', tab: 'report', render: renderReport, bind: bindReport },
  inspection: { title: 'Vendor Inspection', left: 'back', right: 'submit', tab: 'tasks', render: renderInspection, bind: bindInspection },
  profile: { title: 'My Profile', left: 'menu', right: 'bell', tab: 'profile', render: renderProfile, bind: bindProfile },
};
const TABS = [['tasks', 'Tasks', 'inbox'], ['map', 'Map', 'map'], ['report', 'Report', 'file-text'], ['profile', 'Profile', 'user']];

const app = $('#app');
const screen = $('.device__screen');
mountLayer(app);

/* ---------- shell pieces ---------- */
function statusBar() {
  return `<div class="statusbar" aria-hidden="true"><span>${istClock()}</span><span class="statusbar__right">${icon('signal')}${icon(state.online ? 'wifi' : 'wifi-off')}<span class="battery"><i></i></span></span></div>`;
}
function header(r) {
  const left = r.left === 'back'
    ? `<button class="icon-btn" id="hBack" aria-label="Back">${icon('arrow-left')}</button>`
    : `<button class="icon-btn" id="hMenu" aria-label="Open menu">${icon('menu')}</button>`;
  const bell = () => { const n = unreadCount(); return `<button class="icon-btn" id="bell" aria-label="Notifications${n ? `, ${n} unread` : ''}" aria-expanded="${notifOpen()}">${icon('bell')}${n ? `<span class="count-badge">${n > 99 ? '99+' : n}</span>` : ''}</button>`; };
  const right = {
    'bell-gear': `${bell()}<button class="icon-btn icon-btn--muted" id="hGear" aria-label="Settings">${icon('settings')}</button>`,
    bell: bell(),
    layers: `<button class="btn btn--ghost btn--sm" id="hLayers" style="min-height:36px;padding:0 10px;margin-right:8px;font-size:14px;background:transparent;border:1px solid var(--color-border-default)" aria-haspopup="dialog">${icon('layers')}<span>Layers</span>${icon('chevron-down', { size: 16 })}</button>`,
    send: reportHeaderRight(),
    submit: inspectionHeaderRight(),
  }[r.right];
  return `<header class="header">
    <div class="header__left">${left}</div>
    <h1 class="t-h2 header__title">${r.title}</h1>
    <div class="header__right">${right}</div></header>`;
}
function netBar() {
  const s = state.sync, off = !state.online;
  const mode = off ? 'offline' : s === 'syncing' ? 'syncing' : s === 'synced' ? 'synced' : '';
  const q = state.queue.length;
  const inner = off
    ? `${icon('wifi-off')}<span class="t-caption-strong">OFFLINE — Tasks queued locally</span><span class="netbar__queue">${q} queued</span><span class="netbar__chevrons"></span>`
    : s === 'syncing' ? `${icon('refresh-cw', { cls: 'spin' })}<span class="t-caption-strong">Syncing…</span><span class="netbar__queue">${q} left</span>`
    : s === 'synced' ? `${icon('check-circle-2')}<span class="t-caption-strong">All synced ✓</span>` : '';
  return `<div class="netbar ${mode ? `netbar--${mode} is-visible` : ''}" role="status" aria-live="polite"><div class="netbar__inner">${inner}</div></div>`;
}
function tabBar(r) {
  const incoming = byStatus('incoming').length;
  return `<nav class="tabbar" aria-label="Primary">${TABS.map(([id, label, ic]) => `
    <button class="tab" data-tab="${id}" ${r.tab === id ? 'aria-current="page"' : ''} aria-label="${label}${id === 'tasks' && incoming ? `, ${incoming} new` : ''}">
      <span class="tab__indicator"></span>${icon(ic)}<span class="t-tab">${label}</span>
      ${id === 'tasks' && incoming ? `<span class="tab__dot">${incoming}</span>` : ''}
    </button>`).join('')}</nav>`;
}

/* ---------- render ---------- */
let lastRoute = null;
function render() {
  document.documentElement.dataset.theme = state.theme;
  if (!state.authed) {
    $('.shell', app)?.remove();
    let login = $('.login-wrap', app);
    if (!login) { login = document.createElement('div'); login.className = 'login-wrap'; app.prepend(login); }
    login.innerHTML = statusBar() + renderLogin();
    bindLogin(login);
    lastRoute = 'login';
    syncPanel();
    return;
  }
  $('.login-wrap', app)?.remove();
  const r = ROUTES[state.route] || ROUTES.tasks;
  let shell = $('.shell', app);
  const sameRoute = lastRoute === state.route;
  const prevScroll = sameRoute ? $('.content', app)?.scrollTop || 0 : 0;
  const prevTypeScroll = sameRoute ? $('.type-scroller', app)?.scrollLeft || 0 : 0;
  if (!shell) { shell = document.createElement('div'); shell.className = 'shell'; shell.style.cssText = 'display:contents'; app.prepend(shell); }

  // Preserve the map DOM while staying on the map (keeps pan/zoom + animations)
  shell.innerHTML = `${statusBar()}${header(r)}${netBar()}<main class="content" id="main" tabindex="-1">${r.render()}</main>${tabBar(r)}<div class="home-indicator" aria-hidden="true"></div>`;
  const main = $('.content', shell);
  if (!sameRoute) main.querySelector('.screen-enter') || null; else $$('.screen-enter', main).forEach((n) => n.classList.remove('screen-enter'));
  main.scrollTop = prevScroll;
  const ts = $('.type-scroller', main); if (ts) ts.scrollLeft = prevTypeScroll;
  r.bind(main, $('.header', shell));
  bindShell(shell);
  lastRoute = state.route;
  syncPanel();
}

function bindShell(shell) {
  $('#hBack', shell)?.addEventListener('click', () => { haptic('light'); navigate('tasks'); });
  $('#hMenu', shell)?.addEventListener('click', () => { haptic('light'); openMenu(); });
  $('#hGear', shell)?.addEventListener('click', () => { navigate('profile'); setTimeout(() => $('#settings')?.scrollIntoView({ behavior: 'smooth' }), 60); });
  $('#bell', shell)?.addEventListener('click', () => { haptic('light'); toggleNotifications(); });
  $('#hLayers', shell)?.addEventListener('click', () => openSheet({ id: 'layers', auto: true, label: 'Map layers', html: layersPanel(), onMount: bindLayers }));
  $$('[data-tab]', shell).forEach((b) => b.addEventListener('click', () => { haptic('light'); navigate(b.dataset.tab); }));
}

function navigate(route) {
  closeSheet(true); closeNotif();
  if (state.route === route) { $('.content')?.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  set({ route }, 'route');
  if (location.hash !== '#/' + route) history.replaceState(null, '', '#/' + route);
  $('#main')?.focus({ preventScroll: true });
}

/* ---------- reactive updates ---------- */
const SOFT = new Set(['layers', 'notif-open', 'dispatch-open', 'dispatch-close', 'sync-step']);
subscribe((reason) => {
  if (reason === 'layers' && state.route === 'map') {
    const vp = $('#mapvp'); if (vp) { render(); }
    return;
  }
  if (reason === 'notif-open') { const b = $('#bell'); b?.setAttribute('aria-expanded', 'true'); return; }
  if (reason === 'sync-step' || SOFT.has(reason)) { refreshChrome(); return; }
  render();
});

function refreshChrome() {
  const shell = $('.shell', app); if (!shell) return;
  const r = ROUTES[state.route];
  $('.netbar', shell)?.replaceWith(htmlEl(netBar()));
  $('.tabbar', shell)?.replaceWith(htmlEl(tabBar(r)));
  const bell = $('#bell', shell);
  if (bell) { const h = htmlEl(header(r)); const nb = $('#bell', h); bell.replaceWith(nb); nb.addEventListener('click', () => { haptic('light'); toggleNotifications(); }); }
  $$('[data-tab]', shell).forEach((b) => b.addEventListener('click', () => { haptic('light'); navigate(b.dataset.tab); }));
}
const htmlEl = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };

// Live clock + relative times
setInterval(() => { $$('.statusbar > span:first-child').forEach((s) => { s.textContent = istClock(); }); }, 15_000);
setInterval(() => { if (!document.querySelector('.sheet, .dispatch, .modal-wrap, .notif-panel') && state.route === 'tasks' && state.authed) render(); }, 60_000);

// Real connectivity (NetInfo equivalent)
addEventListener('online', () => setOnline(true));
addEventListener('offline', () => setOnline(false));

/* ---------- bus wiring ---------- */
Object.assign(actions, {
  navigate, render,
  openTask, openQuick, openDecline, openDispatch, openEmergency,
  reset: () => { closeSheet(true); resetDemo(); toast('Demo data reset', 'info'); },
});

/* ---------- Showcase panel (desktop) ---------- */
const PANEL_SCREENS = [
  ['tasks', 'Tasks', 'inbox'], ['map', 'Zone Map', 'map'], ['report', 'Field Report', 'file-text'],
  ['inspection', 'Inspection', 'clipboard-check'], ['profile', 'Profile', 'user'], ['login', 'Login', 'fingerprint'],
];
function buildPanel() {
  const nav = $('#panelNav'); if (!nav) return;
  nav.innerHTML = PANEL_SCREENS.map(([id, label, ic]) => `<button class="panel__btn" data-go="${id}">${icon(ic)}${label}</button>`).join('');
  $$('[data-go]', nav).forEach((b) => b.addEventListener('click', () => {
    closeSheet(true);
    if (b.dataset.go === 'login') { set({ authed: false }, 'auth'); return; }
    if (!state.authed) state.authed = true;
    navigate(b.dataset.go); render();
  }));
  $('#ctlDispatch').addEventListener('click', () => { if (!state.authed) set({ authed: true }); openDispatch(); });
  $('#ctlNet').addEventListener('click', () => setOnline(!state.online));
  $('#ctlTheme').addEventListener('click', () => set({ theme: state.theme === 'dark' ? 'light' : 'dark' }, 'theme'));
  $('#ctlTask').addEventListener('click', () => { const t = activeTask() || byStatus('incoming')[0]; if (t) openTask(t.id); });
  $('#ctlReset').addEventListener('click', actions.reset);
}
function syncPanel() {
  $$('[data-go]').forEach((b) => b.setAttribute('aria-pressed', String(state.authed ? b.dataset.go === state.route : b.dataset.go === 'login')));
  const net = $('#ctlNet'); if (net) { net.setAttribute('aria-pressed', String(!state.online)); net.querySelector('span').textContent = state.online ? 'Go offline' : 'Reconnect'; }
  const th = $('#ctlTheme'); if (th) { th.setAttribute('aria-pressed', String(state.theme === 'dark')); th.querySelector('span').textContent = state.theme === 'dark' ? 'Light theme' : 'Dark theme'; }
}

/* ---------- boot ---------- */
function routeFromHash() {
  const h = location.hash.replace('#/', '');
  if (h === 'login') { state.authed = false; return; }
  if (h === 'dispatch') { state.authed = true; setTimeout(openDispatch, 400); return; }
  if (h === 'offline') { state.authed = true; setTimeout(() => setOnline(false), 300); return; }
  if (ROUTES[h]) { state.authed = true; state.route = h; }
}
routeFromHash();
addEventListener('hashchange', () => { closeSheet(true); closeNotif(); routeFromHash(); render(); });
if (matchMedia('(max-width: 860px)').matches) document.documentElement.style.setProperty('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
else document.documentElement.style.setProperty('--safe-bottom', '20px');
buildPanel();
render();
startLiveLink();
if (!navigator.onLine) setOnline(false);

// Offline shell (P4)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
