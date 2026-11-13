// Tiny observable store (stands in for the Zustand slices in brief §12.1).
import { CAMERAS, STAFF, KPIS, seedAlerts, PRESETS } from './data.js';

const listeners = new Map(); // key -> Set<fn>

function savedTheme() {
  try { return sessionStorage.getItem('gc-theme'); } catch { return null; }
}

export const state = {
  theme: savedTheme() || 'light',   // day theme by default (§2.1); night is opt-in via N / user menu
  view: 'live',              // live | replay | analytics | map
  zones: [],                 // active zone chip filters ([] = all)
  preset: 1,
  customGroup: null,        // { name, cams } from map selection / zone sheet
  gridSize: null,            // null = breakpoint default
  selectedCam: null,
  enlargedCam: null,
  cameras: CAMERAS,
  staff: STAFF,
  kpis: KPIS,
  alerts: seedAlerts(),
  alertFilter: 'all',
  alertSort: 'newest',
  expandedAlert: null,
  selectedAlert: null,
  mapLayers: { cctv: true, radar: true, staff: true, facilities: true, zones: true, traffic: true, water: false, privacy: true },
  emergency: null,           // { zone, startedAt, by, timeline: [] }
  muted: false,
  user: { name: 'K. Sravani', initials: 'KS', role: 'Shift Supervisor', shift: 'Day shift · 06:00–18:00 IST', desk: 'Desk 4, ICCC Rajamahendravaram' },
  tabletTab: 'alerts',
  railOpen: false,           // MD breakpoint drawer
  system: { network: 9.8, storage: 42, camsActive: 0, radarActive: 58, lastSync: Date.now() },
  analyticsRange: '24h',
  replay: { playing: false, speed: 1, t: 0, cams: ['A-01', 'A-02', 'A-03', 'A-05'] },
};

state.system.camsActive = CAMERAS.filter((c) => c.status !== 'offline').length;

export function presetCams() {
  if (state.customGroup) return state.customGroup.cams;
  return PRESETS.find((p) => p.key === state.preset)?.cams ?? [];
}
export function presetName() {
  if (state.customGroup) return state.customGroup.name;
  return PRESETS.find((p) => p.key === state.preset)?.name ?? '';
}

export function subscribe(keys, fn) {
  for (const k of [].concat(keys)) {
    if (!listeners.has(k)) listeners.set(k, new Set());
    listeners.get(k).add(fn);
  }
  return () => [].concat(keys).forEach((k) => listeners.get(k)?.delete(fn));
}

export function set(patch) {
  const changed = [];
  for (const [k, v] of Object.entries(patch)) {
    if (state[k] !== v) { state[k] = v; changed.push(k); }
  }
  emit(changed);
}

/** Notify after in-place mutation, e.g. touch('alerts'). */
export function touch(...keys) { emit(keys); }

function emit(keys) {
  const fns = new Set();
  keys.forEach((k) => listeners.get(k)?.forEach((f) => fns.add(f)));
  fns.forEach((f) => f(state, keys));
}

/** Optional integrations (live.js fills these when the suite server is present). */
export const hooks = {};

export const openAlerts = () => state.alerts.filter((a) => a.state !== 'resolved');
