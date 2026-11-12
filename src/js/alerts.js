// Alert queue (§5.2): filters, sort, collapsed/expanded cards, every state,
// arrival animation, 30-second undo on every status change (principle P2).
import { icon } from './icons.js';
import { state, set, subscribe, touch, openAlerts } from './store.js';
import { ALERT_TYPES, CAMERAS, STAFF } from './data.js';
import { esc, timeIST, relTime, toMetres, announce, $, $$ } from './util.js';
import { toast, dropdown, chime } from './ui.js';
import { miniMap } from './map.js';
import { snapshot } from './camera-sim.js';

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const SEV_SHAPE = { critical: 'tri', high: 'diamond', medium: 'circle', low: 'square' };

export function sevShape(sev) {
  // Shape + colour + label (never colour alone, §1.2)
  const s = SEV_SHAPE[sev];
  const path = s === 'tri' ? '<path d="M6 1 11 10H1Z"/>' : s === 'diamond' ? '<path d="M6 0.8 11.2 6 6 11.2 0.8 6Z"/>' : s === 'circle' ? '<circle cx="6" cy="6" r="4.6"/>' : '<rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1.5"/>';
  return `<svg class="sev-shape sev-${sev}" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">${path}</svg>`;
}

export function nearbyStaff(at, n = 4) {
  return state.staff
    .filter((s) => s.status !== 'off')
    .map((s) => ({ ...s, dist: toMetres(at, s.pos) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

export function mountAlertQueue(root, actions) {
  root.innerHTML = `
    <header class="aq__head">
      <h2 class="t-h2" id="aq-title">Active alerts <span class="count-badge" data-count>0</span></h2>
      <button class="btn btn--ghost btn--sm aq__sort" data-act="sort" aria-haspopup="menu" aria-expanded="false">${icon('arrow-up-down', 16)}<span data-sortlabel>Newest</span></button>
    </header>
    <div class="aq__filters" role="toolbar" aria-label="Filter by priority"></div>
    <div class="aq__list scroll-thin" role="list" aria-labelledby="aq-title" tabindex="-1"></div>`;

  const list = $('.aq__list', root);
  const filters = $('.aq__filters', root);
  const seen = new Set(state.alerts.map((a) => a.id));
  let showResolved = false;

  function filtered() {
    let a = state.alerts.filter((x) => x.state !== 'resolved');
    if (state.zones.length) a = a.filter((x) => state.zones.includes(x.zone));
    if (state.alertFilter !== 'all') a = a.filter((x) => x.severity === state.alertFilter);
    const sorters = {
      newest: (x, y) => y.ts - x.ts,
      priority: (x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || y.ts - x.ts,
      zone: (x, y) => x.zone.localeCompare(y.zone) || SEV_ORDER[x.severity] - SEV_ORDER[y.severity],
    };
    return a.sort(sorters[state.alertSort]);
  }

  function renderFilters() {
    const base = state.alerts.filter((x) => x.state !== 'resolved' && (!state.zones.length || state.zones.includes(x.zone)));
    const n = (s) => base.filter((x) => s === 'all' || x.severity === s).length;
    filters.innerHTML = ['all', 'critical', 'high', 'medium', 'low'].map((s) => `
      <button class="chip chip--${s} ${state.alertFilter === s ? 'is-active' : ''}" aria-pressed="${state.alertFilter === s}" data-filter="${s}">
        ${s === 'all' ? '' : sevShape(s)}${s === 'all' ? 'All' : SEV_LABEL[s]}<span class="chip__n">${n(s)}</span>
      </button>`).join('');
    $('[data-count]', root).textContent = base.length;
  }

  function cardHTML(a, fresh) {
    const t = ALERT_TYPES[a.type];
    const exp = state.expandedAlert === a.id;
    const sel = state.selectedAlert === a.id;
    const dispatched = a.state === 'dispatched';
    return `<article class="alert sev-${a.severity} st-${a.state} ${exp ? 'is-expanded' : ''} ${sel ? 'is-selected' : ''} ${fresh ? 'is-arriving' : ''}"
      role="listitem" tabindex="${sel ? 0 : -1}" data-id="${a.id}" aria-expanded="${exp}"
      aria-label="${SEV_LABEL[a.severity]} priority. ${esc(a.title)}. ${esc(a.desc)}. ${relTime(a.ts)}. State ${a.state}.">
      <div class="alert__main">
        <span class="alert__icon" title="${t.label}">${icon(t.icon, 20)}</span>
        <div class="alert__body">
          <h3 class="alert__title">${esc(a.title)}</h3>
          <p class="alert__desc">${dispatched ? `<span class="alert__dispatched">${icon('send', 14)}Dispatched to ${esc(a.assignee)}<span class="dots" aria-hidden="true"></span></span>` : esc(a.desc)}</p>
          <p class="alert__meta"><span class="sev-tag sev-tag--${a.severity}">${sevShape(a.severity)}${SEV_LABEL[a.severity]}</span><span class="t-mono">${timeIST(a.ts)} IST</span><span class="alert__rel" data-ts="${a.ts}">${relTime(a.ts)}</span>${a.state === 'acknowledged' ? `<span class="alert__ack">${icon('check', 12)}Acknowledged</span>` : ''}</p>
        </div>
        <div class="alert__actions">
          <button class="btn btn--primary btn--dispatch" data-act="dispatch" ${dispatched ? 'disabled' : ''}>${dispatched ? 'Sent' : 'Dispatch'}${icon('chevron-right', 16)}</button>
          <button class="btn-icon btn-icon--sm" data-act="more" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(a.title)}">${icon('more-horizontal', 20)}</button>
        </div>
      </div>
      ${exp ? detailHTML(a) : ''}
    </article>`;
  }

  function detailHTML(a) {
    const cams = a.cams.map((id) => CAMERAS.find((c) => c.id === id)).filter(Boolean);
    const staff = nearbyStaff(a.location, 3);
    const privacy = a.type === 'drowning';
    return `<div class="alert__detail">
      ${cams.length ? `<div class="alert__thumbs" aria-label="Nearby cameras">${cams.map((c) => `
        <button class="thumb" data-act="cam" data-cam="${c.id}" aria-label="Open ${c.name}">
          ${c.status === 'offline' ? `<span class="thumb__off">${icon('camera-off', 16)}</span>` : `<canvas data-thumb="${c.id}" width="240" height="136"></canvas>`}
          <span class="thumb__lbl">${c.name.replace('CAM ', '')}</span></button>`).join('')}
        <span class="t-caption muted alert__thumbs-note">Nearby cameras</span></div>` : ''}
      ${privacy ? `<div class="alert__privacy">${icon('shield', 16)}<span>Bathing area — radar only. No camera covers this location.</span></div>` : ''}
      <div class="alert__minimap">${miniMap(a.location)}<button class="alert__mapbtn btn btn--ghost btn--xs" data-act="map">${icon('map-pin', 14)}Show on map</button></div>
      ${a.suggestion ? `<p class="alert__suggest">${icon('lightbulb', 16)}<em>Suggested: ${esc(a.suggestion)}</em></p>` : ''}
      <label class="alert__notes"><span class="sr-only">Notes</span>${icon('pencil', 16)}
        <input type="text" class="input input--sm" placeholder="Add a note…" value="${esc(a.notes)}" data-notes="${a.id}"/></label>
      <div class="alert__staff"><span class="t-caption-strong lbl">${icon('users', 14)}Staff nearby</span>
        <ul>${staff.map((s) => `<li><span class="status-dot status-dot--${s.status === 'available' ? 'ok' : 'warn'}" aria-hidden="true"></span><span>${esc(s.name)}</span><span class="t-caption muted">${s.role} · ${s.dist} m${s.status === 'on-task' ? ' · busy' : ''}</span></li>`).join('')}</ul></div>
      <p class="t-caption muted">${esc(a.source)} · ${a.id}</p>
    </div>`;
  }

  function render() {
    renderFilters();
    const items = filtered();
    const resolved = state.alerts.filter((x) => x.state === 'resolved' && (!state.zones.length || state.zones.includes(x.zone))).sort((x, y) => y.ts - x.ts);
    const fresh = new Set(items.filter((a) => !seen.has(a.id)).map((a) => a.id));
    items.forEach((a) => seen.add(a.id));
    if (!state.selectedAlert && items[0]) state.selectedAlert = items[0].id;
    list.innerHTML = (items.length ? items.map((a) => cardHTML(a, fresh.has(a.id))).join('') : emptyHTML()) +
      (resolved.length ? `<div class="aq__resolved">
        <button class="aq__resolved-toggle t-caption-strong" data-act="toggle-resolved" aria-expanded="${showResolved}">${icon(showResolved ? 'chevron-down' : 'chevron-right', 14)}Resolved (${resolved.length})</button>
        ${showResolved ? resolved.map((a) => `<div class="alert alert--resolved sev-${a.severity}" role="listitem"><div class="alert__main"><span class="alert__icon">${icon('check-circle', 18)}</span><div class="alert__body"><h3 class="alert__title">${esc(a.title)}</h3><p class="alert__meta"><span class="t-mono">${timeIST(a.ts)} IST</span><span>${a.assignee ? `Closed by ${esc(a.assignee)}` : 'Closed'}</span></p></div></div></div>`).join('') : ''}
      </div>` : '');
    // thumbnails: still frames
    $$('canvas[data-thumb]', list).forEach((cv) => {
      const cam = CAMERAS.find((c) => c.id === cv.dataset.thumb);
      cv.getContext('2d').drawImage(snapshot(cam, 240, 136), 0, 0);
    });
    const sevSort = $('[data-sortlabel]', root);
    sevSort.textContent = { newest: 'Newest', priority: 'Priority', zone: 'Zone' }[state.alertSort];
    if (fresh.size) {
      const worst = [...fresh].map((id) => state.alerts.find((a) => a.id === id)).sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity])[0];
      if (worst) {
        chime(worst.severity === 'critical' ? 'critical' : 'alert');
        announce(`New ${worst.severity} alert: ${worst.title}. ${worst.desc}`);
      }
    }
  }

  function emptyHTML() {
    return `<div class="aq__empty">
      <svg viewBox="0 0 160 80" width="160" height="80" aria-hidden="true" class="aq__empty-art">
        <path d="M0 52 C20 46 40 46 60 52 S100 58 120 52 S150 46 160 50" class="w1"/>
        <path d="M0 62 C20 56 40 56 60 62 S100 68 120 62 S150 56 160 60" class="w2"/>
        <path d="M0 72 C20 66 40 66 60 72 S100 78 120 72 S150 66 160 70" class="w3"/>
        <circle cx="122" cy="22" r="9" class="sun"/>
      </svg>
      <div class="t-h2">All clear</div>
      <p class="t-body muted">${state.alertFilter !== 'all' || state.zones.length ? 'No alerts match these filters. Clear them to see the full queue.' : 'No open alerts. New alerts appear here within 2 seconds.'}</p>
      ${state.alertFilter !== 'all' || state.zones.length ? '<button class="btn btn--secondary btn--sm" data-act="clear-filters">Clear filters</button>' : ''}
    </div>`;
  }

  /* ---------- state changes with undo ---------- */
  function change(a, patch, msg, verb) {
    const prev = { state: a.state, assignee: a.assignee };
    Object.assign(a, patch);
    touch('alerts');
    toast({
      type: patch.state === 'resolved' ? 'success' : 'info',
      title: msg,
      desc: a.title,
      action: { label: 'Undo', run: () => { Object.assign(a, prev); touch('alerts'); toast({ type: 'info', title: `${verb} undone`, desc: a.title }); } },
      life: 30000,
    });
  }

  function moreMenu(btn, a) {
    dropdown(btn, `
      <button role="menuitem" data-pick="ack" ${a.state === 'acknowledged' ? 'disabled' : ''}>${icon('check', 16)}Acknowledge</button>
      <button role="menuitem" data-pick="escalate">${icon('arrow-up-circle', 16)}Escalate to coordinator</button>
      <button role="menuitem" data-pick="cams" ${a.cams.length ? '' : 'disabled'}>${icon('grid', 16)}Show cameras in grid</button>
      <button role="menuitem" data-pick="map">${icon('map-pin', 16)}Show on map</button>
      <button role="menuitem" data-pick="replay" ${a.cams.length ? '' : 'disabled'}>${icon('rewind', 16)}Replay last 5 min</button>
      <hr/>
      <button role="menuitem" data-pick="resolve">${icon('check-circle', 16)}Mark resolved</button>`, {
      onPick: (k) => {
        if (k === 'ack') change(a, { state: 'acknowledged' }, 'Alert acknowledged', 'Acknowledge');
        if (k === 'resolve') { change(a, { state: 'resolved', assignee: a.assignee || state.user.name }, 'Alert resolved', 'Resolve'); }
        if (k === 'escalate') { a.severity = a.severity === 'low' ? 'medium' : a.severity === 'medium' ? 'high' : 'critical'; touch('alerts'); toast({ type: 'warning', title: 'Escalated to incident coordinator', desc: `${a.title} · now ${SEV_LABEL[a.severity]}` }); }
        if (k === 'cams') actions.alertCams(a);
        if (k === 'map') actions.alertMap(a);
        if (k === 'replay') actions.alertReplay(a);
      },
    });
  }

  function select(id, focus = true) {
    state.selectedAlert = id;
    $$('.alert[data-id]', list).forEach((el) => {
      const on = el.dataset.id === id;
      el.classList.toggle('is-selected', on);
      el.tabIndex = on ? 0 : -1;
      if (on && focus) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    touch('selectedAlert');
  }

  function toggleExpand(id) {
    const a = state.alerts.find((x) => x.id === id);
    if (a && a.state === 'unread') a.state = 'read';
    state.expandedAlert = state.expandedAlert === id ? null : id;
    state.selectedAlert = id;
    render();
    list.querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: true });
    list.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (state.expandedAlert === id && a) actions.alertSelected?.(a);
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    const card = e.target.closest('.alert[data-id]');
    if (b?.dataset.act === 'toggle-resolved') { showResolved = !showResolved; render(); return; }
    if (b?.dataset.act === 'clear-filters') { set({ alertFilter: 'all', zones: [] }); return; }
    if (!card) return;
    const a = state.alerts.find((x) => x.id === card.dataset.id);
    if (b) {
      e.stopPropagation();
      if (b.dataset.act === 'dispatch') { a.state === 'unread' && (a.state = 'read'); actions.dispatch(a); }
      if (b.dataset.act === 'more') moreMenu(b, a);
      if (b.dataset.act === 'cam') actions.openCam(b.dataset.cam);
      if (b.dataset.act === 'map') actions.alertMap(a);
      return;
    }
    if (e.target.closest('input, .alert__detail')) return;
    toggleExpand(a.id);
  });
  list.addEventListener('focusout', (e) => {
    const inp = e.target.closest('[data-notes]');
    if (!inp) return;
    const a = state.alerts.find((x) => x.id === inp.dataset.notes);
    if (a && a.notes !== inp.value) { a.notes = inp.value; toast({ type: 'success', title: 'Note saved', desc: a.title, life: 2500 }); }
  });
  list.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) { if (e.key === 'Escape') e.target.blur(); return; }
    const card = e.target.closest('.alert[data-id]');
    if (!card) return;
    const cards = $$('.alert[data-id]', list);
    const i = cards.indexOf(card);
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); cards[Math.min(cards.length - 1, i + 1)] && select(cards[Math.min(cards.length - 1, i + 1)].dataset.id); }
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); cards[Math.max(0, i - 1)] && select(cards[Math.max(0, i - 1)].dataset.id); }
    if (e.key === 'Enter' && e.target === card) { e.preventDefault(); toggleExpand(card.dataset.id); }
  });
  filters.addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) set({ alertFilter: b.dataset.filter }); });
  root.querySelector('[data-act=sort]').addEventListener('click', (e) => {
    dropdown(e.currentTarget, ['newest', 'priority', 'zone'].map((k) => `<button role="menuitemradio" aria-checked="${state.alertSort === k}" data-pick="${k}">${state.alertSort === k ? icon('check', 16) : '<span class="ic-spacer"></span>'}${{ newest: 'Newest first', priority: 'By priority', zone: 'By zone' }[k]}</button>`).join(''), { onPick: (k) => set({ alertSort: k }) });
  });

  setInterval(() => $$('.alert__rel', list).forEach((s) => { s.textContent = relTime(Number(s.dataset.ts)); }), 15000);

  render();
  subscribe(['alerts', 'alertFilter', 'alertSort', 'zones'], render);

  return {
    render,
    focusFirstUnread() {
      const items = filtered();
      const target = items.find((a) => a.state === 'unread') || items[0];
      if (target) { select(target.id); if (target.state === 'unread') { target.state = 'read'; } }
      else list.focus();
    },
    focusAlert(id) {
      if (state.alertFilter !== 'all') set({ alertFilter: 'all' });
      state.expandedAlert = id;
      const a = state.alerts.find((x) => x.id === id);
      if (a?.state === 'unread') a.state = 'read';
      render(); select(id);
    },
    selected: () => state.alerts.find((a) => a.id === state.selectedAlert && a.state !== 'resolved'),
  };
}

export { SEV_LABEL, SEV_ORDER, openAlerts, STAFF };
