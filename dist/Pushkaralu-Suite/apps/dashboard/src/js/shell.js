// Header bar (§3.2) and footer status bar (§3.3).
import { icon, logo } from './icons.js';
import { state, set, subscribe, openAlerts, touch } from './store.js';
import { ZONES, CAMERAS, RADAR_TOTAL } from './data.js';
import { timeIST, esc, $ } from './util.js';
import { dropdown, closeDropdown, openModal, toast } from './ui.js';

export function mountHeader(root, actions) {
  root.innerHTML = `
    <div class="hdr__left">
      <button class="hdr__burger btn-icon btn-icon--inverse" aria-label="Open zone menu" aria-haspopup="menu" aria-expanded="false" data-act="burger">${icon('menu', 20)}</button>
      <a class="hdr__brand" href="#" aria-label="Pushkaralu Command, home">${logo(32)}<span class="hdr__title">Pushkaralu Command</span></a>
    </div>
    <nav class="hdr__zones" aria-label="Zone filter"></nav>
    <div class="hdr__right">
      <button class="hdr__emergency btn btn--sm" data-act="emergency" aria-label="Emergency protocol">${icon('siren', 16)}<span>Emergency</span></button>
      <div class="hdr__search" role="search">
        <button class="btn-icon btn-icon--inverse" data-act="search" aria-label="Search cameras, alerts, staff (Ctrl+K)" aria-expanded="false">${icon('search', 20)}</button>
        <input class="hdr__search-input" type="search" placeholder="Search cameras, alerts, staff…" aria-label="Search" tabindex="-1"/>
      </div>
      <div class="hdr__clock" aria-label="Current time IST"><span class="hdr__time">--:--</span><span class="hdr__tz">IST</span></div>
      <button class="hdr__alerts" data-act="alerts" aria-label="Alerts"><span class="hdr__alerts-dot"></span><span class="hdr__alerts-count"></span>${icon('bell', 18)}</button>
      <button class="hdr__user" data-act="user" aria-haspopup="menu" aria-expanded="false" aria-label="User menu"><span class="avatar avatar--hdr">${state.user.initials}</span>${icon('chevron-down', 16)}</button>
    </div>`;

  const zonesEl = $('.hdr__zones', root);
  const renderZones = () => {
    zonesEl.innerHTML = ZONES.map((z) => {
      const active = state.zones.includes(z.id);
      const hot = openAlerts().some((a) => a.zone === z.id && a.severity === 'critical');
      return `<div class="zchip ${active ? 'is-active' : ''} ${hot ? 'is-hot' : ''}">
        <button class="zchip__main" data-zone="${z.id}" aria-pressed="${active}" title="Filter to ${z.name} (${esc(z.area)})">${hot ? '<span class="zchip__hot" aria-label="critical alert"></span>' : ''}${z.name}</button>
        <button class="zchip__more" data-zone-menu="${z.id}" aria-haspopup="menu" aria-expanded="false" aria-label="${z.name} options">${icon('chevron-down', 14)}</button>
      </div>`;
    }).join('') + (state.zones.length ? `<button class="zchip-clear" data-act="zones-clear">Show all</button>` : '');
  };
  renderZones();
  subscribe(['zones', 'alerts'], renderZones);

  const badge = () => {
    const n = openAlerts().filter((a) => a.state === 'unread' || a.state === 'read').length;
    const crit = openAlerts().some((a) => a.severity === 'critical' && a.state !== 'acknowledged' && a.state !== 'dispatched');
    const b = $('.hdr__alerts', root);
    b.classList.toggle('is-clear', n === 0);
    b.classList.toggle('is-critical', crit);
    $('.hdr__alerts-count', root).textContent = n === 0 ? '' : n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', n === 0 ? 'No active alerts' : `${n} active alerts${crit ? ', including critical' : ''}. Focus alert queue (A)`);
  };
  badge();
  subscribe('alerts', badge);

  const tick = () => { $('.hdr__time', root).textContent = timeIST(Date.now()).slice(0, 5); };
  tick(); setInterval(tick, 1000);

  const search = $('.hdr__search', root);
  const input = $('.hdr__search-input', root);
  const closeSearch = () => { search.classList.remove('is-open'); input.tabIndex = -1; input.value = ''; search.querySelector('button').setAttribute('aria-expanded', 'false'); };
  input.addEventListener('input', () => { if (input.value.trim()) { const q = input.value; closeSearch(); actions.palette(q); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); search.querySelector('button').focus(); } if (e.key === 'Enter') { const q = input.value; closeSearch(); actions.palette(q); } });
  input.addEventListener('blur', () => setTimeout(() => { if (!input.value) closeSearch(); }, 120));

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button,a');
    if (!b) return;
    if (b.matches('.hdr__brand')) { e.preventDefault(); actions.view('live'); return; }
    if (b.dataset.zone) {
      const z = b.dataset.zone;
      set({ zones: state.zones.includes(z) ? state.zones.filter((x) => x !== z) : [...state.zones, z].sort() });
      return;
    }
    if (b.dataset.zoneMenu) return zoneMenu(b, b.dataset.zoneMenu, actions);
    switch (b.dataset.act) {
      case 'zones-clear': set({ zones: [] }); break;
      case 'search':
        search.classList.add('is-open'); input.tabIndex = 0; b.setAttribute('aria-expanded', 'true');
        setTimeout(() => input.focus(), 50); break;
      case 'alerts': actions.focusAlerts(); break;
      case 'user': userMenu(b, actions); break;
      case 'emergency': actions.emergency(); break;
      case 'burger': burgerMenu(b, actions); break;
    }
  });
}

function zoneMenu(anchor, zid, actions) {
  const z = ZONES.find((x) => x.id === zid);
  const n = openAlerts().filter((a) => a.zone === zid).length;
  dropdown(anchor, `
    <div class="dropdown__head"><div class="t-h3">${z.name} · ${esc(z.area)}</div><div class="t-caption muted">${n} open alert${n === 1 ? '' : 's'} · capacity ${z.capacity.toLocaleString('en-IN')}</div></div>
    <button role="menuitem" data-pick="filter">${icon('filter', 16)}${state.zones.includes(zid) ? 'Remove filter' : 'Filter to this zone'}</button>
    <button role="menuitem" data-pick="cams">${icon('grid', 16)}Show zone cameras</button>
    <button role="menuitem" data-pick="map">${icon('map', 16)}Open on map</button>
    <hr/>
    <button role="menuitem" data-pick="emergency" class="is-danger">${icon('siren', 16)}Activate emergency protocol…</button>`, {
    align: 'left',
    onPick: (k) => {
      if (k === 'filter') set({ zones: state.zones.includes(zid) ? state.zones.filter((x) => x !== zid) : [...state.zones, zid].sort() });
      if (k === 'cams') actions.zoneCams(zid);
      if (k === 'map') actions.mapZone(zid);
      if (k === 'emergency') actions.emergency(zid);
    },
  });
}

function burgerMenu(anchor, actions) {
  dropdown(anchor, `
    <div class="dropdown__head"><div class="t-caption-strong muted">Zones</div></div>
    ${ZONES.map((z) => `<button role="menuitemcheckbox" aria-checked="${state.zones.includes(z.id)}" data-pick="${z.id}" data-keep>${state.zones.includes(z.id) ? icon('check', 16) : '<span class="ic-spacer"></span>'}${z.name} · ${esc(z.area)}</button>`).join('')}
    <hr/><button role="menuitem" data-pick="emergency" class="is-danger">${icon('siren', 16)}Emergency protocol…</button>`, {
    align: 'left', onPick: (k, el) => {
      if (k === 'emergency') return actions.emergency();
      set({ zones: state.zones.includes(k) ? state.zones.filter((x) => x !== k) : [...state.zones, k].sort() });
      el.setAttribute('aria-checked', String(state.zones.includes(k)));
      el.firstElementChild.outerHTML = state.zones.includes(k) ? icon('check', 16) : '<span class="ic-spacer"></span>';
    },
  });
}

function userMenu(anchor, actions) {
  const u = state.user;
  dropdown(anchor, `
    <div class="dropdown__head"><div class="row gap-3"><span class="avatar avatar--lg">${u.initials}</span><div><div class="t-h3">${esc(u.name)}</div><div class="t-caption muted">${esc(u.role)}</div></div></div></div>
    <div class="dropdown__info"><div class="t-caption">${icon('clock', 14)}${esc(u.shift)}</div><div class="t-caption">${icon('map-pin', 14)}${esc(u.desk)}</div></div>
    <hr/>
    <button role="menuitem" data-pick="prefs">${icon('settings', 16)}Preferences</button>
    <button role="menuitemcheckbox" aria-checked="${state.theme === 'dark'}" data-pick="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', 16)}${state.theme === 'dark' ? 'Day theme' : 'Night theme'}<kbd>N</kbd></button>
    <button role="menuitemcheckbox" aria-checked="${!state.muted}" data-pick="sound">${icon(state.muted ? 'volume-x' : 'volume-2', 16)}${state.muted ? 'Unmute alert sounds' : 'Mute alert sounds'}</button>
    <button role="menuitem" data-pick="keys">${icon('keyboard', 16)}Keyboard shortcuts<kbd>?</kbd></button>
    <hr/>
    <button role="menuitem" data-pick="logout">${icon('log-out', 16)}End shift and sign out</button>`, {
    onPick: (k) => {
      if (k === 'theme') actions.toggleTheme();
      if (k === 'sound') { set({ muted: !state.muted }); toast({ type: 'info', title: state.muted ? 'Alert sounds muted' : 'Alert sounds on', desc: state.muted ? 'Critical alerts still flash and pulse.' : '' }); }
      if (k === 'keys') actions.shortcuts();
      if (k === 'prefs') prefs(actions);
      if (k === 'logout') actions.logout();
    },
  });
}

function prefs(actions) {
  const m = openModal({
    title: 'Preferences',
    width: 480,
    body: `
      <fieldset class="field"><legend class="t-caption-strong lbl">Theme</legend>
        <div class="seg" role="radiogroup">
          <button role="radio" aria-checked="${state.theme === 'light'}" data-theme="light">${icon('sun', 16)}Day</button>
          <button role="radio" aria-checked="${state.theme === 'dark'}" data-theme="dark">${icon('moon', 16)}Night</button>
        </div></fieldset>
      <fieldset class="field"><legend class="t-caption-strong lbl">Default camera grid</legend>
        <div class="seg" role="radiogroup">${[null, 2, 3, 4, 6].map((g) => `<button role="radio" aria-checked="${state.gridSize === g}" data-grid="${g}">${g ? `${g}×${g}` : 'Auto'}</button>`).join('')}</div>
        <p class="t-caption muted">Auto follows the screen: 6×6 on the video wall, 3×3 on workstations, 2×2 on laptops.</p></fieldset>
      <label class="switch"><input type="checkbox" ${state.muted ? '' : 'checked'} data-sound/><span class="switch__track"></span><span>Play alert sounds</span></label>`,
    footer: '<button class="btn btn--primary" data-close>Done</button>',
  });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b?.dataset.theme) { if (b.dataset.theme !== state.theme) actions.toggleTheme(); m.el.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }
    if (b?.dataset.grid !== undefined && b.dataset.grid) { set({ gridSize: b.dataset.grid === 'null' ? null : Number(b.dataset.grid) }); m.el.querySelectorAll('[data-grid]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }
  });
  m.el.querySelector('[data-sound]').addEventListener('change', (e) => set({ muted: !e.target.checked }));
}

/* ------------------------------------------------------------------ footer */
export function mountFooter(root) {
  const item = (k, ic, label) => `<span class="ftr__item" data-k="${k}"><span class="status-dot" aria-hidden="true"></span>${icon(ic, 14)}<span class="ftr__label">${label}</span><span class="ftr__val"></span></span>`;
  root.innerHTML = `
    ${item('system', 'activity', '')}
    ${item('network', 'globe', 'Network')}
    ${item('storage', 'hard-drive', 'Storage')}
    ${item('cams', 'camera', '')}
    ${item('radar', 'radar', '')}
    <span class="ftr__item ftr__sync" data-k="sync">${icon('clock', 14)}<span class="ftr__label">Last sync</span><span class="ftr__val"></span></span>
    <span class="ftr__spacer"></span>
    <span class="ftr__item ftr__ws" data-k="ws"><span class="status-dot" aria-hidden="true"></span><span class="ftr__val">6/6 channels</span></span>
    <button class="ftr__keys" data-act="keys" aria-label="Keyboard shortcuts">${icon('keyboard', 14)}<span>?</span></button>`;

  const setItem = (k, lvl, val) => {
    const el = root.querySelector(`[data-k="${k}"]`);
    el.dataset.level = lvl;
    el.querySelector('.ftr__val').textContent = val;
  };
  const render = () => {
    const s = state.system;
    const camTotal = CAMERAS.length;
    const camAct = CAMERAS.filter((c) => c.status !== 'offline').length;
    const camPct = camAct / camTotal;
    const radPct = s.radarActive / RADAR_TOTAL;
    const net = s.network >= 5 ? 'ok' : s.network >= 1 ? 'warn' : 'crit';
    const sto = s.storage < 70 ? 'ok' : s.storage <= 85 ? 'warn' : 'crit';
    const cam = camPct >= 0.95 ? 'ok' : camPct >= 0.9 ? 'warn' : 'crit';
    const rad = radPct >= 0.95 ? 'ok' : radPct >= 0.9 ? 'warn' : 'crit';
    const worst = [net, sto, cam, rad].includes('crit') ? 'crit' : [net, sto, cam, rad].includes('warn') ? 'warn' : 'ok';
    setItem('system', worst, worst === 'ok' ? 'System OK' : worst === 'warn' ? 'System degraded' : 'System failure');
    setItem('network', net, `${s.network.toFixed(1)} Gbps`);
    setItem('storage', sto, `${Math.round(s.storage)}%`);
    setItem('cams', cam, `${camAct}/${camTotal} Cams`);
    setItem('radar', rad, `${s.radarActive}/${RADAR_TOTAL} Radar`);
    setItem('ws', 'ok', '6/6 live channels');
  };
  render();
  subscribe(['system', 'cameras'], render);
  const tick = () => { root.querySelector('[data-k="sync"] .ftr__val').textContent = `${timeIST(state.system.lastSync)} IST`; };
  tick(); setInterval(() => { state.system.lastSync = Date.now(); tick(); }, 1000);
  root.addEventListener('click', (e) => { if (e.target.closest('[data-act=keys]')) document.dispatchEvent(new CustomEvent('gc:shortcuts')); });
  return { render };
}

export { touch, closeDropdown };
