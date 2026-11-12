// Replay mode (§4.4): up to 4 cameras in synced playback, 48px timeline
// scrubber with incident markers, speed control, event log click-to-seek.
import { icon } from './icons.js';
import { state } from './store.js';
import { CAMERAS, ALERT_TYPES } from './data.js';
import { registerFeed, clearFeeds, snapshot } from './camera-sim.js';
import { esc, timeIST, $, $$ } from './util.js';
import { toast, dropdown } from './ui.js';
import { sevShape } from './alerts.js';

const camById = (id) => CAMERAS.find((c) => c.id === id);

export function mountReplay(root) {
  const end = Date.now();
  const start = end - 32 * 60 * 1000 - (end % 60000); // ~32 min window like the brief
  const rp = state.replay;
  rp.t = end - 6 * 60 * 1000;
  let last = performance.now();

  root.innerHTML = `
    <div class="rp">
      <div class="rp__main">
        <div class="rp__grid" role="group" aria-label="Synced replay cameras"></div>
        <div class="rp__bar" role="toolbar" aria-label="Replay controls">
          <div class="rp__btns">
            <button data-rp="start" aria-label="Jump to start">${icon('skip-back', 18)}</button>
            <button data-rp="back" aria-label="Back 10 seconds">${icon('rewind', 18)}</button>
            <button data-rp="play" class="rp__play" aria-label="Play">${icon('play', 20)}</button>
            <button data-rp="fwd" aria-label="Forward 10 seconds">${icon('fast-forward', 18)}</button>
            <button data-rp="end" aria-label="Jump to latest">${icon('skip-forward', 18)}</button>
          </div>
          <div class="seg seg--sm rp__speed" role="radiogroup" aria-label="Playback speed">${[1, 2, 4].map((s) => `<button role="radio" data-speed="${s}" aria-checked="${s === rp.speed}">${s}×</button>`).join('')}</div>
          <span class="t-mono rp__t0">${timeIST(start)}</span>
          <div class="rp__track" role="slider" tabindex="0" aria-label="Replay position" aria-valuemin="${start}" aria-valuemax="${end}">
            <div class="rp__rail"><div class="rp__fill"></div></div>
            <div class="rp__markers"></div>
            <div class="rp__head"><span class="rp__head-t t-mono"></span></div>
          </div>
          <span class="t-mono rp__t1">${timeIST(end)}</span>
          <button class="btn btn--secondary btn--sm" data-rp="export">${icon('download', 16)}Export clip</button>
        </div>
      </div>
      <aside class="rp__log panel" aria-labelledby="rp-log-t">
        <header class="panel__head"><h2 class="t-h2" id="rp-log-t">Event log</h2><span class="t-caption muted">Click to seek</span></header>
        <ol class="rp__events scroll-thin"></ol>
      </aside>
    </div>`;

  const grid = $('.rp__grid', root), track = $('.rp__track', root);
  const pct = (t) => ((t - start) / (end - start)) * 100;

  const events = () => state.alerts.filter((a) => a.ts >= start && a.ts <= end).sort((a, b) => a.ts - b.ts);

  function renderGrid() {
    clearFeeds(grid);
    grid.innerHTML = rp.cams.map((id, i) => {
      const c = camById(id);
      return `<div class="cam cam--replay" data-status="${c.status}" data-slot="${i}">
        ${c.status === 'offline' ? `<div class="cam__offline">${icon('camera-off', 28)}<b>NO RECORDING</b><span class="t-mono">Gap ${timeIST(start)}–now</span></div>` : '<canvas></canvas>'}
        <button class="cam__name cam__name--btn" data-pick-slot="${i}" aria-haspopup="menu" aria-expanded="false" aria-label="Change camera in slot ${i + 1}">${c.name} · ${esc(c.place)}${icon('chevron-down', 12)}</button>
        <span class="cam__ts t-mono" data-tslot></span>
      </div>`;
    }).join('');
    $$('.cam', grid).forEach((el) => {
      const c = camById(rp.cams[Number(el.dataset.slot)]);
      const cv = el.querySelector('canvas');
      if (cv) registerFeed(cv, c, { time: () => rp.t / 1000, boxes: true });
    });
  }

  function renderMarkers() {
    $('.rp__markers', root).innerHTML = events().map((a) => `<button class="rp__marker sev-${a.severity}" style="left:${pct(a.ts)}%" data-seek="${a.ts}" aria-label="${esc(a.title)} at ${timeIST(a.ts)}" title="${timeIST(a.ts)} · ${esc(a.title)}"></button>`).join('');
    $('.rp__events', root).innerHTML = events().reverse().map((a) => `
      <li><button class="rp__ev" data-seek="${a.ts - 15000}" data-cams="${a.cams.join(',')}">
        <span class="t-mono">${timeIST(a.ts)}</span>
        <span class="rp__ev-body"><span class="t-body-strong">${sevShape(a.severity)} ${esc(a.title)}</span><span class="t-caption muted">${ALERT_TYPES[a.type].label} · ${a.cams.length ? a.cams.join(', ') : 'no camera'}</span></span>
      </button></li>`).join('') || '<li class="t-body muted" style="padding:16px">No incidents in this window.</li>';
  }

  function paint() {
    const p = pct(rp.t);
    $('.rp__fill', root).style.width = `${p}%`;
    $('.rp__head', root).style.left = `${p}%`;
    $('.rp__head-t', root).textContent = timeIST(rp.t);
    track.setAttribute('aria-valuenow', String(rp.t));
    track.setAttribute('aria-valuetext', `${timeIST(rp.t)} IST`);
    $$('[data-tslot]', grid).forEach((s) => { s.textContent = `${timeIST(rp.t)} IST · ${rp.playing ? `${rp.speed}×` : 'paused'}`; });
  }

  function seek(t) { rp.t = Math.max(start, Math.min(end, t)); paint(); }
  function setPlaying(p) {
    rp.playing = p;
    const b = $('[data-rp=play]', root);
    b.innerHTML = icon(p ? 'pause' : 'play', 20);
    b.setAttribute('aria-label', p ? 'Pause' : 'Play');
    paint();
  }

  function loop(now) {
    const dt = now - last; last = now;
    if (rp.playing && root.offsetParent) {
      rp.t += dt * rp.speed;
      if (rp.t >= end) { rp.t = end; setPlaying(false); }
      paint();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // scrubbing
  let dragging = false;
  const fromEvent = (e) => { const r = track.getBoundingClientRect(); return start + ((e.clientX - r.left) / r.width) * (end - start); };
  track.addEventListener('pointerdown', (e) => { if (e.target.closest('.rp__marker')) return; dragging = true; track.setPointerCapture(e.pointerId); seek(fromEvent(e)); });
  track.addEventListener('pointermove', (e) => { if (dragging) seek(fromEvent(e)); });
  track.addEventListener('pointerup', () => { dragging = false; });
  track.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: -5000, ArrowRight: 5000, PageDown: -60000, PageUp: 60000 }[e.key];
    if (k) { e.preventDefault(); e.stopPropagation(); seek(rp.t + k); }
    if (e.key === 'Home') { e.preventDefault(); seek(start); }
    if (e.key === 'End') { e.preventDefault(); seek(end); }
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.seek) {
      seek(Number(b.dataset.seek));
      if (b.dataset.cams) {
        const cams = b.dataset.cams.split(',').filter(Boolean);
        if (cams.length) { rp.cams = [...cams, ...rp.cams.filter((c) => !cams.includes(c))].slice(0, 4); renderGrid(); }
      }
      setPlaying(true);
      return;
    }
    if (b.dataset.speed) { rp.speed = Number(b.dataset.speed); $$('[data-speed]', root).forEach((x) => x.setAttribute('aria-checked', String(x === b))); paint(); return; }
    if (b.dataset.pickSlot) {
      const slot = Number(b.dataset.pickSlot);
      const zone = camById(rp.cams[slot]).zone;
      dropdown(b, `<div class="dropdown__head"><div class="t-caption-strong muted">Zone ${zone} cameras</div></div>
        <div class="dropdown__scroll scroll-thin">${CAMERAS.filter((c) => c.zone === zone).map((c) => `<button role="menuitemradio" aria-checked="${rp.cams[slot] === c.id}" data-pick="${c.id}"><span class="t-mono">${c.id}</span>${esc(c.place)}</button>`).join('')}</div>`, {
        align: 'left', onPick: (id) => { rp.cams[slot] = id; renderGrid(); paint(); },
      });
      return;
    }
    switch (b.dataset.rp) {
      case 'play': setPlaying(!rp.playing); break;
      case 'back': seek(rp.t - 10000); break;
      case 'fwd': seek(rp.t + 10000); break;
      case 'start': seek(start); break;
      case 'end': seek(end); setPlaying(false); break;
      case 'export': {
        const c = snapshot(camById(rp.cams[0]), 640, 360, rp.t / 1000);
        void c;
        toast({ type: 'success', title: 'Clip export queued', desc: `${rp.cams.length} cameras · ${timeIST(Math.max(start, rp.t - 60000))}–${timeIST(Math.min(end, rp.t + 60000))} IST · evidence hash logged` });
        break;
      }
    }
  });

  renderGrid(); renderMarkers(); paint();
  return {
    showAlert(a) {
      if (a.cams.length) rp.cams = [...a.cams, ...rp.cams.filter((c) => !a.cams.includes(c))].slice(0, 4);
      renderGrid(); renderMarkers();
      seek(Math.max(start, a.ts - 5 * 60000));
      setPlaying(true);
    },
    refresh() { renderMarkers(); paint(); },
    pause() { setPlaying(false); },
  };
}
