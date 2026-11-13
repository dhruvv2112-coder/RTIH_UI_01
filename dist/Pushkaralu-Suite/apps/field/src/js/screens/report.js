// Screen 3 — Field Report · Brief §4.3
import { icon } from '../icons.js';
import { state, submitReport } from '../store.js';
import { REPORT_TYPES } from '../data.js';
import { esc, haptic, $, $$, rng } from '../util.js';
import { toast, burst, openSheet, closeSheet } from '../ui.js';
import { mapSVG } from './map.js';
import { actions } from '../bus.js';

const SEVERITY = [['low', 'Low', 'low'], ['medium', 'Medium', 'normal'], ['high', 'High', 'warning'], ['urgent', 'Urgent', 'critical']];
const LOCATIONS = [
  { name: 'Ghat #3, Zone A', coords: '16.98912° N, 81.77874° E' },
  { name: 'Ghat #4, Zone A', coords: '16.98860° N, 81.77990° E' },
  { name: 'East Corridor Junction', coords: '16.98822° N, 81.77931° E' },
  { name: 'Help Desk 2, Zone A', coords: '16.98955° N, 81.77702° E' },
  { name: 'Parking Lot B', coords: '16.98612° N, 81.77580° E' },
  { name: 'Vendor Row 3, Zone B', coords: '16.98741° N, 81.78102° E' },
];

// Runtime-only media store (blobs never persisted to localStorage; P4 queue simulated)
export const media = new Map();

export function photoThumb(id) {
  const m = media.get(id);
  if (m?.url) return `<img src="${m.url}" alt="Photo evidence" style="width:100%;height:100%;object-fit:cover">`;
  const r = rng(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  const hue = Math.floor(r() * 50) + 180;
  return `<svg viewBox="0 0 72 72" aria-hidden="true"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 52%)"/><stop offset="1" stop-color="hsl(${hue + 20} 35% 22%)"/></linearGradient></defs>
    <rect width="72" height="72" fill="url(#g${id})"/><path d="M0 52 L18 34 L30 46 L46 26 L72 50 V72 H0Z" fill="hsl(${hue + 40} 25% 18%)" opacity=".9"/><circle cx="${50 + r() * 12}" cy="${14 + r() * 8}" r="6" fill="#F0F6FC" opacity=".8"/></svg>`;
}

export function photosBlock(list, { max = 5, addId = 'addPhoto', label = 'Add' } = {}) {
  return `
    <div class="photos">
      <button class="photo-add" id="${addId}" ${list.length >= max ? 'disabled' : ''} aria-label="Add photo (${list.length} of ${max})">${icon('camera')}<span>${label}</span></button>
      ${list.map((p) => `<div class="thumb"><button class="thumb__img" data-preview="${p}" aria-label="Preview photo">${photoThumb(p)}</button><button class="thumb__x" data-rm="${p}" aria-label="Remove photo">${icon('x', { stroke: 2.5 })}</button></div>`).join('')}
    </div>
    <div class="photos__meta t-caption c-tertiary">${list.length}/${max} · JPEG 70% · max 1920px — compressed for offline sync</div>`;
}

function valid() { const r = state.report; return !!(r.type && r.severity && r.description.trim().length >= 3); }

export function reportHeaderRight() {
  const label = state.online ? 'Send' : 'Queue';
  return `<button class="header-send t-button" id="sendReport" ${valid() ? '' : 'disabled'} aria-label="${label} report">${icon(state.online ? 'check' : 'cloud-off')}<span>${label}</span></button>`;
}

function voiceBlock() {
  const v = state.report.voice;
  if (!v) return `<button class="voice" id="voice" aria-label="Record a voice note, up to 60 seconds">${icon('mic')}<span class="t-body">Voice note</span><span class="t-caption c-tertiary" style="margin-left:auto;margin-right:8px">Tap to record · 60s max</span></button>`;
  const bars = waveBars(v.seed, 34);
  return `<div class="voice" role="group" aria-label="Recorded voice note, ${v.dur} seconds">
      <button class="voice__btn voice__btn--play" id="vplay" aria-label="Play voice note">${icon('play')}</button>
      <div class="wave" id="vwave">${bars}</div>
      <span class="voice__time t-mono">0:${String(v.dur).padStart(2, '0')}</span>
      <button class="voice__btn" id="vdel" aria-label="Delete voice note">${icon('trash-2')}</button></div>`;
}
function waveBars(seed, n, live = false) {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => `<i style="height:${6 + Math.round(r() * 22)}px;${live ? `animation-delay:${(i % 7) * 90}ms` : ''}"></i>`).join('');
}

export function renderReport() {
  const r = state.report;
  const loc = LOCATIONS.find((l) => l.name === r.locationName) || LOCATIONS[0];
  return `
  <div class="content__pad screen-enter">
    ${!state.online ? `<div class="card" style="padding:12px 16px;margin-bottom:16px;display:flex;gap:10px;align-items:center;border-color:rgba(210,153,34,.4)"><span class="c-warning">${icon('cloud-off', { size: 20 })}</span><span class="t-caption">You're offline. This report will be saved on the device and sent automatically when you reconnect.</span></div>` : ''}
    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Report Type<span class="req">*</span></span><span class="t-caption c-tertiary" style="text-transform:none">Scroll for more →</span></div>
    <div class="type-scroller" role="radiogroup" aria-label="Report type">
      ${REPORT_TYPES.map((t) => `<button class="type-item" role="radio" aria-checked="${r.type === t.id}" data-type="${t.id}"><span class="type-item__box">${icon(t.icon)}</span><span class="t-caption-strong">${t.label}</span></button>`).join('')}
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Severity<span class="req">*</span></span></div>
    <div class="segmented" role="radiogroup" aria-label="Severity">
      ${SEVERITY.map(([id, label, tone]) => `<button role="radio" aria-checked="${r.severity === id}" data-sev="${id}" data-tone="${tone}">${label}</button>`).join('')}
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Location</span><span class="status t-caption c-secondary" style="text-transform:none"><span class="gps-bars" data-level="3"><i></i><i></i><i></i></span>GPS ±4m</span></div>
    <div class="card loc-card">
      <button class="loc-card__row" id="locSearch" aria-label="Change location: ${esc(loc.name)}">
        ${icon('map-pin')}
        <span style="flex:1"><span class="t-caption c-secondary" style="display:block">${r.locationName ? 'Selected' : 'Auto-detected'}</span><span class="t-body-strong">${esc(loc.name)}</span><span class="t-mono c-secondary" style="display:block">${loc.coords}</span></span>
        ${icon('pencil-line', { size: 18, cls: 'c-tertiary' })}
      </button>
      <div class="btn-row">
        <button class="btn btn--outline btn--sm" id="useCurrent">${icon('locate-fixed')}Use Current</button>
        <button class="btn btn--ghost btn--sm" id="chooseMap">${icon('map')}Choose on Map</button>
      </div>
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><label for="desc">Description<span class="req">*</span></label></div>
    <div class="textarea">
      <textarea id="desc" maxlength="500" placeholder="What did you observe?" autocomplete="off" autocorrect="off" spellcheck="false">${esc(r.description)}</textarea>
      <span class="textarea__count t-caption ${r.description.length > 450 ? 'is-near' : ''}" id="descCount">${r.description.length}/500</span>
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Photos <span class="c-tertiary" style="text-transform:none;font-weight:400">(Optional)</span></span></div>
    ${photosBlock(r.photos)}

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Voice Note <span class="c-tertiary" style="text-transform:none;font-weight:400">(Optional)</span></span></div>
    <div id="voiceWrap">${voiceBlock()}</div>

    <p class="t-caption c-tertiary" style="margin-top:24px;text-align:center">Required: type, severity and description · Send activates when complete</p>
  </div>
  <input type="file" accept="image/*" capture="environment" id="filePick" hidden>`;
}

export function bindReport(root, header) {
  const r = state.report;
  const sendBtn = () => $('#sendReport', header);
  const refreshSend = () => { const b = sendBtn(); if (b) b.disabled = !valid(); };

  $$('[data-type]', root).forEach((b) => b.addEventListener('click', () => {
    r.type = b.dataset.type; haptic('light');
    $$('[data-type]', root).forEach((x) => x.setAttribute('aria-checked', String(x === b))); refreshSend(); save();
  }));
  $$('[data-sev]', root).forEach((b) => b.addEventListener('click', () => {
    r.severity = b.dataset.sev; haptic('light');
    $$('[data-sev]', root).forEach((x) => x.setAttribute('aria-checked', String(x === b))); refreshSend(); save();
  }));
  const desc = $('#desc', root), count = $('#descCount', root);
  const grow = () => { desc.style.height = 'auto'; desc.style.height = Math.min(200, Math.max(96, desc.scrollHeight + 2)) + 'px'; };
  desc.addEventListener('input', () => { r.description = desc.value; count.textContent = `${desc.value.length}/500`; count.classList.toggle('is-near', desc.value.length > 450); grow(); refreshSend(); save(); });
  grow();

  $('#useCurrent', root).addEventListener('click', () => { r.locationName = null; haptic('light'); toast('Location refreshed · GPS ±4m', 'info', 1600); actions.render(); });
  $('#chooseMap', root).addEventListener('click', () => openMapPicker());
  $('#locSearch', root).addEventListener('click', () => openLocationSearch());

  bindPhotos(root, r.photos, () => actions.render());
  bindVoice(root);

  const b = sendBtn();
  b?.addEventListener('click', async () => {
    if (!valid()) return;
    haptic('medium');
    b.disabled = true;
    b.innerHTML = state.online ? `${icon('refresh-cw', { cls: 'spin' })}<span>Sending…</span>` : `${icon('cloud-off')}<span>Queued</span>`;
    await new Promise((res) => setTimeout(res, state.online ? 900 : 500));
    const { queued } = submitReport();
    await burst(queued ? 'Report saved offline' : 'Report sent', queued ? 'Will sync automatically when online' : 'Command Centre has your report');
    toast(queued ? 'Report queued · 1 item pending sync' : 'Field report submitted ✓', queued ? 'warning' : 'success');
    actions.navigate('tasks');
  });
}

let saveT; function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('rtih.report.draft', JSON.stringify({ ...state.report, photos: [] })); } catch {} }, 300); }

/* ---------- Photos (§4.3 Photo Capture) ---------- */
export function bindPhotos(root, list, rerender, { addId = 'addPhoto', max = 5 } = {}) {
  const add = $('#' + addId, root);
  const pick = $('#filePick', root);
  add?.addEventListener('click', () => {
    haptic('light');
    if (list.length >= max) return;
    // Real camera on devices; falls back to a sample frame if the picker is dismissed.
    if (pick && matchMedia('(pointer: coarse)').matches) {
      pick.onchange = async () => {
        const f = pick.files?.[0]; if (!f) return;
        const id = 'p' + Date.now();
        media.set(id, { url: await compress(f) });
        list.push(id); rerender();
      };
      pick.click();
    } else {
      const id = 'p' + Date.now();
      list.push(id); rerender();
      toast('Photo captured · compressed to 70%', 'success', 1400);
    }
  });
  $$('[data-rm]', root).forEach((b) => b.addEventListener('click', () => { const i = list.indexOf(b.dataset.rm); if (i > -1) list.splice(i, 1); haptic('light'); rerender(); }));
  $$('[data-preview]', root).forEach((b) => b.addEventListener('click', () => previewPhoto(b.dataset.preview)));
}

async function compress(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k;
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), 'image/jpeg', 0.7));
  } catch { return URL.createObjectURL(file); }
}

function previewPhoto(id) {
  const wrap = document.createElement('div');
  wrap.className = 'photo-preview';
  wrap.innerHTML = `<button class="icon-btn photo-preview__x" aria-label="Close preview" style="color:#fff">${icon('x')}</button><div class="photo-preview__img">${photoThumb(id)}</div><div class="t-caption" style="color:#C9D1D9">Pinch to zoom · tap to close</div>`;
  document.querySelector('.layer').append(wrap);
  wrap.addEventListener('click', () => wrap.remove());
}

/* ---------- Voice note (§4.3) ---------- */
let rec = null;
function bindVoice(root) {
  const wrap = $('#voiceWrap', root);
  const start = $('#voice', root);
  start?.addEventListener('click', () => startRecording(wrap));
  $('#vdel', root)?.addEventListener('click', () => { state.report.voice = null; haptic('light'); wrap.innerHTML = voiceBlock(); bindVoice(root); });
  $('#vplay', root)?.addEventListener('click', (e) => playVoice(e.currentTarget, wrap));
}

function startRecording(wrap) {
  haptic('medium');
  let sec = 0;
  const seed = Date.now() % 9973;
  wrap.innerHTML = `<div class="voice" role="group" aria-label="Recording voice note">
    <span class="voice__rec" aria-hidden="true"></span>
    <div class="wave is-live">${waveBars(seed, 34, true)}</div>
    <span class="voice__time t-mono" id="vtime" aria-live="off">0:00</span>
    <button class="voice__btn" id="vstop" aria-label="Stop recording" style="color:var(--color-status-critical-fg)">${icon('square')}</button></div>`;
  const time = $('#vtime', wrap);
  const stop = () => {
    clearInterval(rec?.timer); rec = null;
    state.report.voice = { dur: Math.max(1, sec), seed };
    wrap.innerHTML = voiceBlock(); bindVoice(wrap.closest('.content'));
    toast(`Voice note saved · ${Math.max(1, sec)}s AAC`, 'success', 1400);
  };
  rec = { timer: setInterval(() => { sec += 1; time.textContent = `0:${String(sec).padStart(2, '0')}`; if (sec >= 60) stop(); }, 1000) };
  $('#vstop', wrap).addEventListener('click', stop);
}

function playVoice(btn, wrap) {
  const v = state.report.voice; if (!v) return;
  const bars = $$('#vwave i', wrap);
  if (btn.dataset.playing) { clearInterval(+btn.dataset.playing); delete btn.dataset.playing; btn.innerHTML = icon('play'); return; }
  let i = 0; const total = bars.length; const step = (v.dur * 1000) / total;
  btn.innerHTML = icon('pause');
  const t = setInterval(() => {
    bars.forEach((b, k) => { b.style.opacity = k <= i ? '1' : '.35'; });
    i += 1; if (i > total) { clearInterval(t); delete btn.dataset.playing; btn.innerHTML = icon('play'); bars.forEach((b) => { b.style.opacity = '1'; }); }
  }, step);
  btn.dataset.playing = String(t);
}

/* ---------- Location pickers ---------- */
function openLocationSearch() {
  openSheet({
    id: 'loc-search', label: 'Search location', snap: 0.85,
    html: `<h2 class="t-h1 sheet__title">Choose location</h2>
      <input class="input" id="locQ" placeholder="Search ghats, junctions, stalls…" autocomplete="off" aria-label="Search locations" style="margin:12px 0">
      <div class="option-list" id="locList"></div>`,
    onMount: (sheet) => {
      const list = $('#locList', sheet), q = $('#locQ', sheet);
      let t;
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        const items = LOCATIONS.filter((l) => !term || l.name.toLowerCase().includes(term));
        list.innerHTML = items.map((l) => `<button class="option" data-loc="${esc(l.name)}">${icon('map-pin')}<span><span class="t-body-strong" style="display:block">${esc(l.name)}</span><span class="t-mono c-secondary">${l.coords}</span></span></button>`).join('') || `<p class="t-body c-secondary">No matches. Try “Ghat”.</p>`;
        $$('[data-loc]', list).forEach((b) => b.addEventListener('click', () => { state.report.locationName = b.dataset.loc; haptic('light'); closeSheet(); actions.render(); }));
      };
      q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 300); }); // debounced 300ms (§6.1)
      draw();
    },
  });
}

function openMapPicker() {
  openSheet({
    id: 'map-pick', label: 'Choose on map', snap: 0.85,
    html: `<h2 class="t-h1 sheet__title">Drop a pin</h2>
      <p class="t-caption c-secondary" style="margin:0 0 12px">Tap a named point near the incident.</p>
      <div class="minimap" style="height:300px">${mapSVG({ mini: true, interactive: false })}</div>
      <div class="option-list" style="margin-top:12px">${LOCATIONS.slice(0, 4).map((l) => `<button class="option" data-loc="${esc(l.name)}">${icon('map-pin')}<span class="t-body-strong">${esc(l.name)}</span></button>`).join('')}</div>`,
    onMount: (sheet) => $$('[data-loc]', sheet).forEach((b) => b.addEventListener('click', () => { state.report.locationName = b.dataset.loc; haptic('light'); closeSheet(); actions.render(); toast('Location set', 'success', 1200); })),
  });
}
