// Screen 5 — Profile & Shift · Brief §4.5 · plus Login (§11 LoginScreen)
import { icon } from '../icons.js';
import { state, kpis, emit, set } from '../store.js';
import { STAFF } from '../data.js';
import { esc, haptic, $, $$ } from '../util.js';
import { toast, confirmModal, openSheet, closeSheet } from '../ui.js';
import { actions } from '../bus.js';

const LANGS = [['en', 'English', 'English'], ['te', 'తెలుగు', 'Telugu'], ['hi', 'हिन्दी', 'Hindi']];

function shiftDuration() {
  const m = STAFF.base.shiftMinutes + Math.floor((Date.now() - (window.__bootAt || Date.now())) / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function renderProfile() {
  const k = kpis();
  const s = state.settings;
  const lang = LANGS.find((l) => l[0] === state.lang);
  const sw = (key, on, label) => `<button class="switch" role="switch" aria-checked="${on}" data-set="${key}" aria-label="${label}"></button>`;
  return `
  <div class="content__pad screen-enter">
    <section class="card profile-card" aria-label="Staff profile">
      <div class="avatar">${STAFF.initials}<span class="avatar__dot" style="${state.online ? '' : 'background:var(--color-status-warning)'}"></span></div>
      <h2 class="t-h1 profile-card__name">${STAFF.name}</h2>
      <div class="t-body c-secondary profile-card__role">${STAFF.role} — ${STAFF.zone} · <span class="t-mono">${STAFF.id}</span></div>
      <div class="profile-card__shift t-caption-strong">${icon('clock')}On Shift: ${STAFF.shiftStart}–${STAFF.shiftEnd} IST</div>
      <div class="profile-card__status t-caption-strong">
        <span class="status ${state.online ? 'c-normal' : 'c-warning'}"><span class="pulse-dot"></span>${state.online ? 'Online' : 'Offline'}</span>
        <span class="status c-normal"><span class="gps-bars" data-level="3"><i></i><i></i><i></i></span>GPS Strong</span>
        <span class="status c-secondary">${icon('battery', { size: 16 })}72%</span>
      </div>
    </section>

    <div class="section-h t-caption-strong" style="text-transform:uppercase">Shift Summary</div>
    <div class="kpis">
      <div class="kpi"><div class="t-display">${k.tasks}</div><div class="kpi__label t-caption">Tasks Completed</div></div>
      <div class="kpi"><div class="t-display">${k.inspections}</div><div class="kpi__label t-caption">Inspections</div></div>
      <div class="kpi"><div class="t-display">${k.reports}</div><div class="kpi__label t-caption">Reports Filed</div></div>
    </div>
    <div class="card stats" style="margin-top:8px">
      <div class="stat-row">${icon('clock')}<span class="t-body">Shift Duration</span><span class="stat-row__val t-body">${shiftDuration()}</span></div>
      <div class="stat-row">${icon('footprints')}<span class="t-body">Distance Covered</span><span class="stat-row__val t-body">${STAFF.base.distanceKm} km</span></div>
      <div class="stat-row">${icon('zap')}<span class="t-body">Avg Response Time</span><span class="stat-row__val t-body">${STAFF.base.avgResponse} min</span></div>
    </div>

    <div class="section-h t-caption-strong" style="text-transform:uppercase" id="settings">Settings</div>
    <div class="card settings">
      <div class="set-row">${icon('moon')}<span class="set-row__label t-body">Dark Mode</span>${sw('theme', state.theme === 'dark', 'Dark mode')}</div>
      <button class="set-row" id="langRow">${icon('globe')}<span class="set-row__label t-body">Language</span><span class="set-row__value t-body">${lang[1]}${icon('chevron-right')}</span></button>
      <div class="set-row">${icon('volume-2')}<span class="set-row__label t-body">Notification Sound</span>${sw('sound', s.sound, 'Notification sound')}</div>
      <div class="set-row">${icon('vibrate')}<span class="set-row__label t-body">Vibration Alerts</span>${sw('vibration', s.vibration, 'Vibration alerts')}</div>
      <div class="set-row">${icon('map-pin')}<span class="set-row__label t-body">Location Sharing<span class="t-caption c-tertiary" style="display:block">GPS every 30s · dispatch only</span></span>${sw('location', s.location, 'Location sharing')}</div>
      <div class="set-row">${icon('database')}<span class="set-row__label t-body">Offline Data: <b>${s.offlineMB} MB</b></span><button class="clear-btn" id="clearData">Clear</button></div>
    </div>

    <button class="btn btn--outline-danger btn--block btn--xl" id="endShift" style="margin-top:24px">${icon('log-out')}End Shift</button>
    <div class="version t-mono">Godavari Field v1.0.0 · build 2027.01 · ${state.queue.length} queued</div>
  </div>`;
}

export function bindProfile(root) {
  $$('[data-set]', root).forEach((sw) => sw.addEventListener('click', () => {
    const key = sw.dataset.set; haptic('light');
    if (key === 'theme') { set({ theme: state.theme === 'dark' ? 'light' : 'dark' }, 'theme'); return; }
    state.settings[key] = !state.settings[key];
    sw.setAttribute('aria-checked', String(state.settings[key]));
    if (key === 'location' && !state.settings[key]) toast('Location off — dispatch can’t route tasks to you', 'warning');
    emit('settings');
  }));
  $('#langRow', root).addEventListener('click', openLanguage);
  $('#clearData', root).addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Clear offline data?', body: `Removes ${state.settings.offlineMB} MB of cached map tiles and history. Queued reports are kept. Tiles re-download on Wi-Fi.`, confirm: 'Clear', iconName: 'trash-2' });
    if (ok) { state.settings.offlineMB = 4; emit('settings'); toast('Offline cache cleared', 'success'); }
  });
  $('#endShift', root).addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'End your shift?', body: state.queue.length ? `${state.queue.length} items are still waiting to sync. They will upload when you reconnect.` : 'Your location sharing stops and the shift summary is sent to your supervisor.', confirm: 'End Shift', iconName: 'log-out' });
    if (ok) { haptic('heavy'); set({ authed: false }, 'auth'); toast('Shift ended · Summary sent', 'success'); }
  });
}

function openLanguage() {
  openSheet({
    id: 'lang', auto: true, label: 'Language',
    html: `<h2 class="t-h1 sheet__title">Language</h2><p class="t-caption c-secondary" style="margin:0 0 12px">Vendor names and locations also show in the regional script.</p>
      <div class="option-list">${LANGS.map(([id, native, en]) => `<button class="option" data-lang="${id}" aria-pressed="${state.lang === id}" style="${state.lang === id ? 'border-color:var(--color-brand-primary)' : ''}">${icon(state.lang === id ? 'check-circle-2' : 'globe')}<span style="flex:1"><span class="t-body-strong ${id !== 'en' ? 'regional' : ''}" style="display:block">${native}</span><span class="t-caption c-secondary">${en}</span></span></button>`).join('')}</div>`,
    onMount: (sheet) => $$('[data-lang]', sheet).forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.lang; haptic('light'); closeSheet(); emit('settings'); toast('Language updated', 'success', 1200); })),
  });
}

/* ---------- Login ---------- */
export function renderLogin() {
  return `
  <div class="login screen-enter">
    <div class="login__mark">${icon('waves', { stroke: 2.25 })}</div>
    <div class="t-caption-strong c-info" style="letter-spacing:.1em;text-transform:uppercase">RTIH · Godavari Pushkaralu 2027</div>
    <h1 class="t-display" style="margin:6px 0 4px">Godavari Field</h1>
    <p class="t-body c-secondary" style="margin:0">Staff &amp; Vendor operations — sign in to start your shift.</p>
    <form id="loginForm" autocomplete="off">
      <label class="t-caption-strong c-secondary" for="sid" style="text-transform:uppercase">Staff ID</label>
      <input class="input" id="sid" value="${STAFF.id}" inputmode="text" autocapitalize="characters" aria-describedby="sidHelp">
      <label class="t-caption-strong c-secondary" for="pin" style="text-transform:uppercase;margin-top:6px">Shift PIN</label>
      <input class="input" id="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••" value="2027">
      <button class="btn btn--primary btn--xl btn--block t-button" type="submit" style="margin-top:12px">${icon('play-circle')}Start Shift</button>
      <div class="login__alt t-caption">or</div>
      <button class="btn btn--ghost btn--xl btn--block" type="button" id="bio">${icon('fingerprint')}Unlock with biometrics</button>
      <p id="sidHelp" class="t-caption c-tertiary" style="text-align:center;margin:8px 0 0">${icon('shield', { size: 14, cls: 'inline' })} Session valid 12h · data encrypted on device</p>
    </form>
    <div class="lang-chips">${LANGS.map(([id, native]) => `<button class="lang-chip ${id !== 'en' ? 'regional' : ''}" data-lg="${id}" aria-pressed="${state.lang === id}">${native}</button>`).join('')}</div>
    <svg class="login__river" viewBox="0 0 390 160" preserveAspectRatio="none" aria-hidden="true"><path d="M0 90 C 90 60, 180 120, 270 90 S 390 70, 390 70 V160 H0Z" fill="rgba(31,111,235,.14)"/><path d="M0 115 C 100 90, 200 140, 300 112 S 390 100, 390 100 V160 H0Z" fill="rgba(31,111,235,.12)"/></svg>
  </div>`;
}
export function bindLogin(root) {
  const go = () => { haptic('heavy'); window.__bootAt = Date.now(); set({ authed: true, route: 'tasks' }, 'auth'); toast('Shift started · Zone A', 'success'); };
  $('#loginForm', root).addEventListener('submit', (e) => { e.preventDefault(); const pin = $('#pin', root).value; if (pin.length < 4) { toast('Enter your 4–6 digit PIN', 'critical'); return; } go(); });
  $('#bio', root).addEventListener('click', go);
  $$('[data-lg]', root).forEach((b) => b.addEventListener('click', () => { state.lang = b.dataset.lg; emit('settings'); }));
}
