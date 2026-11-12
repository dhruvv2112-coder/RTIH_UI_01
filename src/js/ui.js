// Shared UI primitives: toasts (§5.8), modal (§5.6 container), confirm dialog,
// dropdown menus and the audio cue system (P4: motion + colour + audio).
import { icon } from './icons.js';
import { esc, trapFocus, announce } from './util.js';
import { state } from './store.js';

/* ------------------------------------------------------------------ toasts */
const TOAST_LIFE = { info: 5000, success: 5000, warning: 8000, critical: 0 };
const TOAST_ICON = { info: 'info', success: 'check-circle', warning: 'alert-triangle', critical: 'siren' };

export function toast({ type = 'info', title, desc = '', action = null, life }) {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  const ms = life ?? TOAST_LIFE[type];
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'critical' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="toast__icon">${icon(TOAST_ICON[type], 20)}</span>
    <div class="toast__body">
      <div class="toast__title">${esc(title)}</div>
      ${desc ? `<div class="toast__desc">${esc(desc)}</div>` : ''}
      ${action ? `<button class="toast__action" type="button">${esc(action.label)}</button>` : ''}
    </div>
    <button class="toast__close btn-icon btn-icon--xs" aria-label="Dismiss notification">${icon('x', 16)}</button>
    ${ms ? `<span class="toast__progress" style="animation-duration:${ms}ms"></span>` : ''}`;
  root.prepend(el);
  // stack: up to 3 visible
  [...root.children].slice(3).forEach((n) => dismiss(n));

  let timer = ms ? setTimeout(() => dismiss(el), ms) : null;
  el.addEventListener('mouseenter', () => { if (timer) { clearTimeout(timer); timer = null; el.classList.add('is-held'); } });
  el.addEventListener('mouseleave', () => { if (ms && !timer && el.isConnected) { el.classList.remove('is-held'); timer = setTimeout(() => dismiss(el), 2500); } });
  el.querySelector('.toast__close').addEventListener('click', () => dismiss(el));
  if (action) el.querySelector('.toast__action').addEventListener('click', () => { action.run(); dismiss(el); });
  return el;
}

function dismiss(el) {
  if (!el.isConnected || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 200);
}

/* ------------------------------------------------------------------ modal */
let modalStack = [];

export function openModal({ title, body, footer = '', width = 480, onClose, className = '', labelledBy }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  const id = `m-${Math.random().toString(36).slice(2, 8)}`;
  wrap.innerHTML = `
    <div class="modal-scrim" data-close></div>
    <div class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy || id}" style="--modal-w:${width}px">
      ${title ? `<header class="modal__head"><h2 class="t-h1" id="${id}">${title}</h2>
        <button class="btn-icon" data-close aria-label="Close dialog">${icon('x', 20)}</button></header>` : ''}
      <div class="modal__body">${body}</div>
      ${footer ? `<footer class="modal__foot">${footer}</footer>` : ''}
    </div>`;
  root.appendChild(wrap);
  const modal = wrap.querySelector('.modal');
  const release = trapFocus(modal);
  const close = (reason) => {
    if (!wrap.isConnected) return;
    wrap.classList.add('is-leaving');
    modalStack = modalStack.filter((m) => m !== api);
    setTimeout(() => { wrap.remove(); release(); }, 180);
    onClose?.(reason);
  };
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close('dismiss'); });
  const api = { el: modal, wrap, close };
  modalStack.push(api);
  requestAnimationFrame(() => {
    const first = modal.querySelector('[autofocus]') || modal.querySelector('.modal__body input, .modal__body button, .modal__foot .btn--primary') || modal;
    first.focus?.();
  });
  return api;
}

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top) { top.close('escape'); return true; }
  return false;
}
export const hasModal = () => modalStack.length > 0;

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      width: 440,
      body: `<p class="t-body">${esc(message)}</p>`,
      footer: `<button class="btn btn--ghost" data-close>Cancel</button>
               <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-confirm autofocus>${esc(confirmLabel)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.el.querySelector('[data-confirm]').addEventListener('click', () => { done = true; resolve(true); m.close('confirm'); });
  });
}

/* ------------------------------------------------------------------ dropdown */
let openMenu = null;
export function dropdown(anchor, html, { align = 'right', onPick, className = '' } = {}) {
  closeDropdown();
  const el = document.createElement('div');
  el.className = `dropdown ${className}`;
  el.setAttribute('role', 'menu');
  el.innerHTML = html;
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  el.style.top = `${r.bottom + 6}px`;
  el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, align === 'right' ? r.right - w : r.left))}px`;
  anchor.setAttribute('aria-expanded', 'true');
  const items = () => [...el.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]')].filter((n) => !n.disabled);
  el.addEventListener('keydown', (e) => {
    const list = items(); const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDropdown(); anchor.focus(); }
  });
  el.addEventListener('click', (e) => {
    const it = e.target.closest('[data-pick]');
    if (it) { onPick?.(it.dataset.pick, it); if (!it.hasAttribute('data-keep')) closeDropdown(); }
  });
  openMenu = { el, anchor };
  requestAnimationFrame(() => items()[0]?.focus());
  return el;
}
export function closeDropdown() {
  if (!openMenu) return false;
  openMenu.anchor.setAttribute('aria-expanded', 'false');
  openMenu.el.remove();
  openMenu = null;
  return true;
}
document.addEventListener('pointerdown', (e) => {
  if (openMenu && !openMenu.el.contains(e.target) && !openMenu.anchor.contains(e.target)) closeDropdown();
});

/* ------------------------------------------------------------------ audio */
let actx = null;
function ctx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (actx?.state === 'suspended') actx.resume();
  return actx;
}
document.addEventListener('pointerdown', () => ctx(), { once: true });
document.addEventListener('keydown', () => ctx(), { once: true });

function tone(freq, start, dur, type = 'sine', gain = 0.08) {
  const a = ctx(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}

export function chime(kind = 'alert') {
  if (state.muted) return;
  if (kind === 'critical') { tone(880, 0, 0.18, 'triangle', 0.1); tone(660, 0.2, 0.18, 'triangle', 0.1); tone(880, 0.4, 0.3, 'triangle', 0.1); }
  else if (kind === 'emergency') { for (let i = 0; i < 4; i++) { tone(740, i * 0.5, 0.24, 'sawtooth', 0.05); tone(520, i * 0.5 + 0.25, 0.24, 'sawtooth', 0.05); } }
  else if (kind === 'success') { tone(660, 0, 0.12); tone(990, 0.12, 0.2); }
  else tone(720, 0, 0.18, 'sine', 0.06);
}

export { announce };
