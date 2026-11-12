// Camera grid (§5.1), enlarged view with playback/zoom/PTZ, preset groups.
import { icon } from './icons.js';
import { state, set, subscribe, presetCams, presetName } from './store.js';
import { CAMERAS, PRESETS } from './data.js';
import { registerFeed, clearFeeds, snapshot } from './camera-sim.js';
import { esc, breakpoint, timeIST, announce, $, $$ } from './util.js';
import { toast, dropdown } from './ui.js';

const camById = (id) => CAMERAS.find((c) => c.id === id);
const DEFAULT_GRID = { xl: 6, lg: 3, md: 2, sm: 1, xs: 1 };

export function gridSize() {
  return state.gridSize ?? DEFAULT_GRID[breakpoint()];
}

export function visibleCams() {
  const n = gridSize() ** 2;
  let ids = presetCams();
  if (state.zones.length && !state.customGroup) {
    const inZone = CAMERAS.filter((c) => state.zones.includes(c.zone)).map((c) => c.id);
    ids = [...ids.filter((id) => inZone.includes(id)), ...inZone.filter((id) => !ids.includes(id))];
  }
  return ids.slice(0, n).map(camById).filter(Boolean);
}

export function mountCameraGrid(root) {
  root.innerHTML = `
    <div class="grid-toolbar">
      <button class="grid-toolbar__preset btn btn--ghost btn--sm" aria-haspopup="menu" aria-expanded="false" data-act="preset">
        ${icon('grid', 16)}<span class="grid-toolbar__key t-mono"></span><span class="grid-toolbar__name"></span>${icon('chevron-down', 14)}
      </button>
      <span class="grid-toolbar__counts t-caption"></span>
      <span class="grow"></span>
      <div class="legend-inline t-caption" aria-hidden="true"><span><i class="lg-ok"></i>Streaming</span><span><i class="lg-warn"></i>Degraded</span><span><i class="lg-crit"></i>Offline</span></div>
      <div class="seg seg--sm" role="radiogroup" aria-label="Grid size">
        ${[2, 3, 4, 6].map((g) => `<button role="radio" data-grid="${g}" aria-checked="false">${g}×${g}</button>`).join('')}
      </div>
    </div>
    <div class="cam-grid-area"><div class="cam-grid" role="grid" aria-label="Camera feeds"></div>
      <div class="cam-enlarged" hidden></div>
    </div>
    <div class="cam-swipe" aria-label="Camera navigation">
      <button class="btn-icon" data-act="prev-cam" aria-label="Previous camera">${icon('chevron-left', 20)}</button>
      <span class="cam-swipe__label t-caption"></span>
      <button class="btn-icon" data-act="next-cam" aria-label="Next camera">${icon('chevron-right', 20)}</button>
    </div>`;

  const grid = $('.cam-grid', root);
  const area = $('.cam-grid-area', root);
  const enl = $('.cam-enlarged', root);
  let tabletIndex = 0;

  function layout() {
    const n = gridSize();
    const r = area.getBoundingClientRect();
    const gap = 8;
    const cw = (r.width - gap * (n - 1)) / n;
    const chFromH = ((r.height - gap * (n - 1)) / n) * (16 / 9);
    const w = Math.max(80, Math.floor(Math.min(cw, chFromH)));
    grid.style.setProperty('--cols', n);
    grid.style.setProperty('--cell-w', `${w}px`);
  }

  function cardHTML(c, i) {
    const sel = state.selectedCam === c.id;
    const alerting = state.alerts.some((a) => a.state !== 'resolved' && a.severity === 'critical' && a.cams.includes(c.id));
    return `<div class="cam ${sel ? 'is-selected' : ''} ${alerting ? 'is-alerting' : ''}" role="gridcell" tabindex="${sel || (!state.selectedCam && i === 0) ? 0 : -1}" data-cam="${c.id}" data-status="${c.status}"
      aria-label="${c.name}, ${esc(c.place)}, ${c.status}${c.status === 'streaming' ? '' : ''}. Press Enter to enlarge.">
      ${c.status === 'offline' ? '' : '<canvas aria-hidden="true"></canvas>'}
      <span class="cam__name">${c.name}<span class="cam__place"> · ${esc(c.place)}</span></span>
      ${c.status === 'offline' ? '' : `<span class="cam__count" title="People in view">${icon('user', 14)}<b>—</b></span>`}
      ${c.status === 'degraded' ? `<span class="cam__low">${icon('alert-triangle', 12)}LOW</span>` : ''}
      ${c.status === 'offline' ? `<div class="cam__offline">${icon('camera-off', 28)}<b>OFFLINE</b><span class="t-mono">Retrying in <span data-retry>${c.retryIn ?? 30}</span>s</span></div>` : ''}
      ${c.status === 'offline' ? '' : `<span class="cam__rec"><i></i>REC</span>`}
      <div class="cam__bar t-mono"><span>${c.status === 'offline' ? '— kbps' : `${(c.bitrate / 1000).toFixed(1)} Mbps`}</span><span>${c.fps} fps</span><span class="cam__q q-${c.status}">${c.status === 'streaming' ? 'HD' : c.status === 'degraded' ? 'SD' : '—'}</span></div>
    </div>`;
  }

  function render() {
    clearFeeds(grid);
    const bp = breakpoint();
    const cams = visibleCams();
    if (bp === 'sm') {
      tabletIndex = Math.min(tabletIndex, cams.length - 1);
      const c = cams[tabletIndex] || cams[0];
      grid.innerHTML = c ? cardHTML(c, 0) : '';
      $('.cam-swipe__label', root).textContent = c ? `${tabletIndex + 1} / ${presetCams().length} · ${c.name}` : '';
    } else {
      grid.innerHTML = cams.map(cardHTML).join('');
    }
    grid.style.setProperty('--cols', bp === 'sm' ? 1 : gridSize());
    $$('.cam', grid).forEach((el) => {
      const cam = camById(el.dataset.cam);
      const cv = el.querySelector('canvas');
      if (!cv) return;
      const anomaly = state.alerts.some((a) => a.state !== 'resolved' && a.type === 'crowd' && a.severity === 'critical' && a.cams[0] === cam.id);
      registerFeed(cv, cam, { anomaly, onCount: (n) => { const b = el.querySelector('.cam__count b'); if (b) b.textContent = n; cam.personCount = n; } });
    });
    const g = gridSize();
    $$('[data-grid]', root).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.grid) === g)));
    $('.grid-toolbar__key', root).textContent = state.customGroup ? '•' : state.preset;
    $('.grid-toolbar__name', root).textContent = presetName() + (state.zones.length && !state.customGroup ? ` · ${state.zones.map((z) => `Zone ${z}`).join(', ')}` : '');
    const total = presetCams().length;
    const off = cams.filter((c) => c.status === 'offline').length;
    const deg = cams.filter((c) => c.status === 'degraded').length;
    $('.grid-toolbar__counts', root).textContent = `${cams.length} of ${total} shown${deg ? ` · ${deg} degraded` : ''}${off ? ` · ${off} offline` : ''}`;
    layout();
  }

  /* ---------- enlarged view ---------- */
  let enlUnsub = null, zoom = 1, pan = [0, 0], playing = true, frozenT = null;
  function openEnlarged(id) {
    const cam = camById(id);
    if (!cam) return;
    set({ enlargedCam: id, selectedCam: id });
    zoom = 1; pan = [0, 0]; playing = true; frozenT = null;
    enl.hidden = false;
    // clip-path origin from the source cell (§9.2)
    const cell = grid.querySelector(`[data-cam="${id}"]`);
    if (cell) {
      const a = area.getBoundingClientRect(), c = cell.getBoundingClientRect();
      enl.style.setProperty('--clip', `inset(${c.top - a.top}px ${a.right - c.right}px ${a.bottom - c.bottom}px ${c.left - a.left}px round 6px)`);
    }
    grid.classList.add('is-behind');
    enl.innerHTML = `
      <div class="cam cam--enlarged" data-status="${cam.status}" data-cam="${cam.id}">
        <div class="cam__viewport">${cam.status === 'offline' ? '' : '<canvas></canvas>'}</div>
        <span class="cam__name">${cam.name} · ${esc(cam.place)} · Zone ${cam.zone}</span>
        ${cam.status === 'offline' ? '' : `<span class="cam__count">${icon('user', 14)}<b>—</b></span>`}
        ${cam.status === 'offline' ? `<div class="cam__offline">${icon('camera-off', 40)}<b>OFFLINE</b><span class="t-mono">Last frame 14 min ago · retrying</span></div>` : `<span class="cam__rec"><i></i>REC</span>`}
        <span class="cam__zoomlvl t-mono" aria-live="polite"></span>
        <button class="cam__close btn-icon btn-icon--overlay" data-act="collapse" aria-label="Close enlarged view (Esc)">${icon('minimize-2', 20)}</button>
        ${cam.ptz ? `<div class="ptz" role="group" aria-label="Pan tilt zoom">
          <button data-ptz="up" aria-label="Tilt up">${icon('chevron-up', 18)}</button>
          <button data-ptz="left" aria-label="Pan left">${icon('chevron-left', 18)}</button>
          <span class="ptz__c">${icon('crosshair', 16)}</span>
          <button data-ptz="right" aria-label="Pan right">${icon('chevron-right', 18)}</button>
          <button data-ptz="down" aria-label="Tilt down">${icon('chevron-down', 18)}</button>
          <input type="range" min="1" max="4" step="0.1" value="1" aria-label="Optical zoom" class="ptz__zoom"/>
        </div>` : ''}
        <div class="cam__controls" role="toolbar" aria-label="Playback controls">
          <button data-ctl="back10" aria-label="Back 10 seconds">${icon('skip-back', 18)}</button>
          <button data-ctl="step-back" aria-label="Step back one frame">${icon('chevron-left', 18)}</button>
          <button data-ctl="play" aria-label="Pause">${icon('pause', 18)}</button>
          <button data-ctl="step" aria-label="Step forward one frame">${icon('chevron-right', 18)}</button>
          <button data-ctl="live" aria-label="Jump to live">${icon('skip-forward', 18)}</button>
          <span class="sep"></span>
          <button data-ctl="shot" class="has-label">${icon('scan', 18)}<span>Screenshot</span></button>
          <span class="sep"></span>
          <button data-ctl="zout" aria-label="Digital zoom out">${icon('minus', 18)}</button>
          <span class="cam__ctl-label">${icon('zoom-in', 16)}<span data-zoomtxt>1.0×</span></span>
          <button data-ctl="zin" aria-label="Digital zoom in">${icon('plus', 18)}</button>
          ${cam.ptz ? `<span class="sep"></span><span class="cam__ctl-label">${icon('move', 16)}PTZ</span>` : ''}
          <span class="grow"></span>
          <span class="t-mono cam__ts" data-ts></span>
        </div>
      </div>`;
    const cv = enl.querySelector('canvas');
    const t0 = performance.now() / 1000;
    if (cv) enlUnsub = registerFeed(cv, cam, {
      time: () => (playing ? (frozenT = null, performance.now() / 1000) : (frozenT ??= performance.now() / 1000)),
      onCount: (n) => { const b = enl.querySelector('.cam__count b'); if (b) b.textContent = n; },
    });
    void t0;
    applyZoom();
    enl.querySelector('[data-act=collapse]').focus({ preventScroll: true });
    announce(`${cam.name} enlarged. Escape to return to grid.`);
  }
  function closeEnlarged() {
    if (enl.hidden) return false;
    enlUnsub?.(); enlUnsub = null;
    enl.classList.add('is-leaving');
    grid.classList.remove('is-behind');
    setTimeout(() => { enl.hidden = true; enl.classList.remove('is-leaving'); enl.innerHTML = ''; }, 200);
    const id = state.enlargedCam;
    set({ enlargedCam: null });
    grid.querySelector(`[data-cam="${id}"]`)?.focus({ preventScroll: true });
    return true;
  }
  function applyZoom() {
    const vp = enl.querySelector('.cam__viewport');
    if (!vp) return;
    vp.style.transform = `scale(${zoom}) translate(${pan[0]}%, ${pan[1]}%)`;
    const t = enl.querySelector('[data-zoomtxt]'); if (t) t.textContent = `${zoom.toFixed(1)}×`;
    const lvl = enl.querySelector('.cam__zoomlvl'); if (lvl) lvl.textContent = zoom > 1 ? `${zoom.toFixed(1)}× digital` : '';
  }
  setInterval(() => {
    const ts = enl.querySelector('[data-ts]');
    if (ts) ts.textContent = `${playing ? 'LIVE' : 'PAUSED'} · ${timeIST(Date.now())} IST`;
    $$('[data-retry]', grid).forEach((s) => { let v = Number(s.textContent) - 1; if (v < 0) v = 30; s.textContent = v; });
  }, 1000);

  enl.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.max(1, Math.min(4, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (zoom === 1) pan = [0, 0];
    applyZoom();
  }, { passive: false });
  enl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) { if (e.target === enl) closeEnlarged(); return; }
    const cam = camById(state.enlargedCam);
    if (b.dataset.act === 'collapse') return closeEnlarged();
    switch (b.dataset.ctl) {
      case 'play': playing = !playing; b.innerHTML = icon(playing ? 'pause' : 'play', 18); b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); break;
      case 'live': playing = true; enl.querySelector('[data-ctl=play]').innerHTML = icon('pause', 18); toast({ type: 'info', title: 'Back to live', desc: `${cam.name} is showing the live stream.` }); break;
      case 'back10': case 'step-back': case 'step': playing = false; frozenT = (frozenT ?? performance.now() / 1000) + (b.dataset.ctl === 'back10' ? -10 : b.dataset.ctl === 'step' ? 0.08 : -0.08); enl.querySelector('[data-ctl=play]').innerHTML = icon('play', 18); break;
      case 'zin': zoom = Math.min(4, zoom + 0.5); applyZoom(); break;
      case 'zout': zoom = Math.max(1, zoom - 0.5); if (zoom === 1) pan = [0, 0]; applyZoom(); break;
      case 'shot': screenshot(cam); break;
    }
    if (b.dataset.ptz) {
      const d = { up: [0, 4], down: [0, -4], left: [4, 0], right: [-4, 0] }[b.dataset.ptz];
      if (zoom === 1) zoom = 1.3;
      pan = [Math.max(-20, Math.min(20, pan[0] + d[0])), Math.max(-20, Math.min(20, pan[1] + d[1]))];
      applyZoom();
    }
  });
  enl.addEventListener('input', (e) => {
    if (e.target.classList.contains('ptz__zoom')) { zoom = Number(e.target.value); applyZoom(); }
  });

  function screenshot(cam) {
    const c = snapshot(cam, 1280, 720, performance.now() / 1000);
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 680, 1280, 40);
    g.fillStyle = '#fff'; g.font = '16px "JetBrains Mono", monospace';
    g.fillText(`${cam.name} · ${cam.place} · ${new Date().toISOString().slice(0, 10)} ${timeIST(Date.now())} IST · operator ${state.user.initials}`, 16, 706);
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `${cam.id}_${Date.now()}.png`;
    a.click();
    toast({ type: 'success', title: 'Screenshot saved', desc: `${cam.name} frame with timestamp overlay.` });
  }

  /* ---------- grid interactions ---------- */
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.cam');
    if (!card) return;
    if (state.selectedCam === card.dataset.cam || breakpoint() === 'sm') openEnlarged(card.dataset.cam);
    else selectCam(card.dataset.cam, true);
  });
  grid.addEventListener('dblclick', (e) => { const card = e.target.closest('.cam'); if (card) openEnlarged(card.dataset.cam); });
  grid.addEventListener('focusin', (e) => { const card = e.target.closest('.cam'); if (card && state.selectedCam !== card.dataset.cam) selectCam(card.dataset.cam, false); });

  function selectCam(id, focus) {
    $$('.cam', grid).forEach((el) => { const on = el.dataset.cam === id; el.classList.toggle('is-selected', on); el.tabIndex = on ? 0 : -1; if (on && focus) el.focus({ preventScroll: true }); });
    state.selectedCam = id;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || enl.contains(b)) return;
    if (b.dataset.grid) set({ gridSize: Number(b.dataset.grid) });
    if (b.dataset.act === 'preset') presetMenu(b);
    if (b.dataset.act === 'prev-cam' || b.dataset.act === 'next-cam') {
      const n = Math.min(presetCams().length, gridSize() ** 2 || 9) || 1;
      tabletIndex = (tabletIndex + (b.dataset.act === 'next-cam' ? 1 : -1) + presetCams().length) % presetCams().length;
      void n; renderTabletCam();
    }
  });
  // swipe on tablets
  let sx = null;
  area.addEventListener('pointerdown', (e) => { if (breakpoint() === 'sm') sx = e.clientX; });
  area.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) { tabletIndex = (tabletIndex + (dx < 0 ? 1 : -1) + presetCams().length) % presetCams().length; renderTabletCam(); }
  });
  function renderTabletCam() {
    const ids = presetCams();
    const c = camById(ids[tabletIndex]);
    clearFeeds(grid);
    grid.innerHTML = cardHTML(c, 0);
    const cv = grid.querySelector('canvas');
    if (cv) registerFeed(cv, c, { onCount: (n) => { const b = grid.querySelector('.cam__count b'); if (b) b.textContent = n; } });
    $('.cam-swipe__label', root).textContent = `${tabletIndex + 1} / ${ids.length} · ${c.name}`;
  }

  function presetMenu(anchor) {
    dropdown(anchor, `<div class="dropdown__head"><div class="t-caption-strong muted">Camera groups · keys 1–9</div></div>
      ${PRESETS.map((p) => `<button role="menuitemradio" aria-checked="${!state.customGroup && p.key === state.preset}" data-pick="${p.key}"><kbd>${p.key}</kbd>${esc(p.name)}<span class="muted t-caption">${p.cams.length}</span></button>`).join('')}`, {
      align: 'left', onPick: (k) => set({ preset: Number(k), customGroup: null }),
    });
  }

  render();
  new ResizeObserver(layout).observe(area);
  subscribe(['preset', 'customGroup', 'gridSize', 'zones'], render);
  subscribe('alerts', () => {
    // refresh alerting outlines without re-mounting streams
    $$('.cam', grid).forEach((el) => {
      const alerting = state.alerts.some((a) => a.state !== 'resolved' && a.severity === 'critical' && a.cams.includes(el.dataset.cam));
      el.classList.toggle('is-alerting', alerting);
    });
  });
  window.addEventListener('resize', () => { const bp = breakpoint(); if (bp !== render.bp) { render.bp = bp; render(); } });
  render.bp = breakpoint();

  return {
    render,
    openEnlarged,
    closeEnlarged,
    isEnlarged: () => !enl.hidden,
    moveSelection(delta) {
      const cams = visibleCams();
      const i = Math.max(0, cams.findIndex((c) => c.id === state.selectedCam));
      const n = gridSize();
      let j = i + delta;
      if (Math.abs(delta) === n) j = i + delta; // up/down
      j = (j + cams.length) % cams.length;
      selectCam(cams[j].id, true);
    },
    enlargeSelected() { const id = state.selectedCam || visibleCams()[0]?.id; if (id) openEnlarged(id); },
  };
}
