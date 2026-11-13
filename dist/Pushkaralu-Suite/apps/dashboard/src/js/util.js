// Formatters, geometry and accessibility helpers (brief §12.1 utils/).

const IST = 'Asia/Kolkata';
const fmtTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: IST });
const fmtHM = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST });
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: IST });

export const timeIST = (t) => fmtTime.format(t);
export const hmIST = (t) => fmtHM.format(t);
export const dayIST = (t) => fmtDay.format(t);

export function relTime(t, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export const num = (n, d = 0) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Map-unit distance → metres (1 unit ≈ 4.2 m in this simulated map). */
export const toMetres = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]) * 4.2);

export function heatColour(d) {
  if (d < 0.3) return '#22C55E';
  if (d < 0.6) return '#EAB308';
  if (d < 0.85) return '#F97316';
  return '#EF4444';
}

export function densityLabel(d) {
  if (d < 0.3) return 'Low';
  if (d < 0.6) return 'Moderate';
  if (d < 0.85) return 'High';
  return 'Critical';
}

/** Catmull-Rom → cubic Bézier path through points. */
export function smoothPath(pts, closed = false, tension = 0.5) {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1][0].toFixed(1)},${p[1][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? d + ' Z' : d;
}

export const polyPath = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') + ' Z';

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Announce to screen readers via the assertive live region. */
export function announce(msg) {
  const el = document.getElementById('sr-live');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = msg; });
}

/** Keep Tab focus inside a container (modals). Returns a release function. */
export function trapFocus(container) {
  const prev = document.activeElement;
  const sel = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(sel)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => { container.removeEventListener('keydown', onKey); prev?.focus?.(); };
}

/** Breakpoints from brief §7.1 */
export function breakpoint(w = window.innerWidth) {
  if (w >= 3840) return 'xl';
  if (w >= 1920) return 'lg';
  if (w >= 1366) return 'md';
  if (w >= 768) return 'sm';
  return 'xs';
}

/** Simple sparkline path for an array of values within w×h. */
export function sparkPath(vals, w, h, pad = 2) {
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, pad + (1 - (v - min) / span) * (h - pad * 2)]);
  const line = 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L');
  return { line, area: `${line} L${w},${h} L0,${h} Z`, last: pts[pts.length - 1] };
}
