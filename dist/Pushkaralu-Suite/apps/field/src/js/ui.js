// Overlay layer: bottom sheets (§5.1), toasts, modals, success burst.
import { icon } from './icons.js';
import { $, haptic, esc } from './util.js';

let layer, toastRoot;
export function mountLayer(appEl) {
  layer = document.createElement('div');
  layer.className = 'layer';
  toastRoot = document.createElement('div');
  toastRoot.className = 'toasts';
  toastRoot.setAttribute('role', 'status');
  toastRoot.setAttribute('aria-live', 'polite');
  appEl.append(layer, toastRoot);
}

/* ---------- Toast ---------- */
const TOAST_ICON = { success: 'check-circle-2', warning: 'cloud-off', info: 'info', critical: 'alert-triangle' };
export function toast(text, tone = 'success', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = `${icon(TOAST_ICON[tone])}<span class="t-body-strong">${esc(text)}</span>`;
  toastRoot.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 220); }, ms);
}

/* ---------- Bottom sheet ---------- */
let current = null;
const SNAPS = [0.3, 0.6, 0.85];

export function openSheet({ id, html, footer = '', auto = false, snap = 0.6, label = 'Details', onMount, onClose }) {
  if (current) closeSheet(true);
  const app = layer.parentElement;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('section');
  sheet.className = `sheet${auto ? ' sheet--auto' : ''}`;
  sheet.dataset.sheet = id;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', label);
  sheet.innerHTML = `
    <div class="sheet__handle-zone" aria-hidden="true"><div class="sheet__handle"></div></div>
    <div class="sheet__body">${html}</div>
    ${footer ? `<div class="sheet__footer">${footer}</div>` : ''}`;
  layer.append(scrim, sheet);

  const H = () => app.clientHeight;
  const sheetH = () => sheet.offsetHeight;
  const yFor = (f) => (auto ? 0 : Math.max(0, sheetH() - H() * f));
  let y = yFor(snap);
  const place = (v) => { y = v; sheet.style.transform = `translateY(${v}px)`; };

  requestAnimationFrame(() => {
    scrim.classList.add('is-open');
    sheet.style.transform = `translateY(${sheetH()}px)`;
    requestAnimationFrame(() => place(yFor(snap)));
  });

  // Drag to resize / swipe down to dismiss
  const zone = $('.sheet__handle-zone', sheet);
  let startY, startT, dragging = false, startTime;
  const down = (e) => { dragging = true; startY = e.clientY; startT = y; startTime = performance.now(); sheet.classList.add('is-dragging'); zone.setPointerCapture?.(e.pointerId); };
  const move = (e) => { if (!dragging) return; place(Math.max(0, startT + (e.clientY - startY))); };
  const up = (e) => {
    if (!dragging) return; dragging = false; sheet.classList.remove('is-dragging');
    const dy = e.clientY - startY;
    const velocity = dy / Math.max(1, performance.now() - startTime);
    const visible = (sheetH() - y) / H();
    if (velocity > 0.8 || visible < 0.2 || (auto && dy > 80)) { closeSheet(); return; }
    if (auto) { place(0); return; }
    const target = velocity < -0.8 ? 0.85 : SNAPS.reduce((a, b) => (Math.abs(b - visible) < Math.abs(a - visible) ? b : a));
    place(yFor(target));
    haptic('light');
  };
  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);
  // Also allow dragging the body down when scrolled to top
  const body = $('.sheet__body', sheet);
  let bStart = null;
  body.addEventListener('pointerdown', (e) => { if (body.scrollTop <= 0 && e.pointerType !== 'mouse') bStart = e.clientY; });
  body.addEventListener('pointermove', (e) => { if (bStart != null && e.clientY - bStart > 24 && !dragging) { down({ clientY: bStart, pointerId: e.pointerId }); } if (dragging) move(e); });
  body.addEventListener('pointerup', (e) => { bStart = null; if (dragging) up(e); });

  scrim.addEventListener('click', () => closeSheet());
  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);

  current = { id, sheet, scrim, onClose, onKey, expand: () => place(yFor(0.85)) };
  onMount?.(sheet, current);
  setTimeout(() => sheet.querySelector('button, input, textarea')?.focus({ preventScroll: true }), 320);
  return current;
}

export function closeSheet(immediate = false) {
  if (!current) return;
  const { sheet, scrim, onClose, onKey } = current;
  document.removeEventListener('keydown', onKey);
  current = null;
  if (immediate) { sheet.remove(); scrim.remove(); onClose?.(); return; }
  scrim.classList.remove('is-open');
  sheet.style.transform = `translateY(${sheet.offsetHeight}px)`;
  setTimeout(() => { sheet.remove(); scrim.remove(); onClose?.(); }, 300);
}
export const currentSheet = () => current;

/* ---------- Modal ---------- */
export function confirmModal({ title, body, tone = 'critical', iconName = 'alert-triangle', confirm = 'Confirm', cancel = 'Cancel' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const tint = { critical: 'tint-urgent', warning: 'tint-high', info: 'tint-info', normal: 'tint-normal' }[tone];
    wrap.innerHTML = `
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mdl-t">
        <div class="modal__ico ${tint}">${icon(iconName)}</div>
        <h2 id="mdl-t" class="t-h1" style="margin:0">${esc(title)}</h2>
        <p class="t-body">${esc(body)}</p>
        <div class="btn-row">
          <button class="btn btn--ghost" data-r="0">${esc(cancel)}</button>
          <button class="btn ${tone === 'critical' ? 'btn--danger' : 'btn--primary'}" data-r="1">${esc(confirm)}</button>
        </div>
      </div>`;
    layer.append(wrap);
    wrap.querySelector('[data-r="1"]').focus();
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b || e.target === wrap) { wrap.remove(); resolve(b?.dataset.r === '1'); }
    });
  });
}

/* ---------- Success burst ---------- */
export function burst(label, sub = '') {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'burst';
    el.innerHTML = `<div><div class="burst__ring">${icon('check', { stroke: 3 })}</div><div class="burst__label"><div class="t-h1">${esc(label)}</div>${sub ? `<div class="t-body c-secondary">${esc(sub)}</div>` : ''}</div></div>`;
    layer.append(el);
    haptic('heavy');
    setTimeout(() => { el.style.transition = 'opacity 200ms'; el.style.opacity = '0'; setTimeout(() => { el.remove(); resolve(); }, 200); }, 1100);
  });
}

export function layerEl() { return layer; }
