// Formatters, haptics, audio and small DOM helpers.
import { state } from './store.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- time (IST) ---------- */
const IST = { timeZone: 'Asia/Kolkata', hour12: false };
export function istClock(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { ...IST, hour: '2-digit', minute: '2-digit' }).format(d);
}
export function istStamp(t) {
  return new Intl.DateTimeFormat('en-GB', { ...IST, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(t));
}
export function istHM(t) { return istClock(new Date(t)); }
export function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m ago` : `${h}h ago`;
}
export function dueIn(t) {
  const m = Math.round((t - Date.now()) / 60000);
  if (m <= 0) return 'Overdue';
  if (m < 60) return `Due in ${m} min`;
  return `Due in ${Math.floor(m / 60)}h ${m % 60}m`;
}
export function dueTone(t) {
  const m = (t - Date.now()) / 60000;
  return m <= 10 ? 'critical' : m <= 30 ? 'warning' : 'secondary';
}

/* ---------- haptics (§2.6) ---------- */
const HAPTIC = { light: [10], medium: [30], heavy: [50], alert: [200, 100, 200, 100, 400] };
export function haptic(kind = 'light') {
  if (!state.settings.vibration) return;
  try { navigator.vibrate?.(HAPTIC[kind]); } catch {}
}

/* ---------- audio — distinct dispatch tone (§1.2, §8.1) ---------- */
let ctx;
export function dispatchTone(urgent = true) {
  if (!state.settings.sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = urgent ? [880, 660, 880, 660, 988] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.15);
    });
  } catch {}
}

/* ---------- gestures ---------- */
// Long-press with visual progress; cancels if the pointer moves > 10px (glove-tolerant).
export function longPress(el, ms, { onStart, onCancel, onDone, tolerance = 12 } = {}) {
  let timer, sx, sy, active = false;
  const cancel = () => { if (!active) return; active = false; clearTimeout(timer); onCancel?.(); };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sx = e.clientX; sy = e.clientY; active = true; onStart?.(e);
    timer = setTimeout(() => { if (!active) return; active = false; onDone?.(e); }, ms);
  });
  el.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > tolerance) cancel(); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, cancel));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  // Keyboard accessibility: hold Space/Enter
  el.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !active && !e.repeat) {
      e.preventDefault(); active = true; onStart?.(e);
      timer = setTimeout(() => { if (!active) return; active = false; onDone?.(e); }, ms);
    }
  });
  el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') cancel(); });
}

export function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }

// Deterministic pseudo-random for waveforms / placeholder photos
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
