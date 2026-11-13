// Live 3D map for the Command Centre (brief §5.4) — MapLibre GL JS over OpenFreeMap
// (OpenStreetMap) vector tiles: real Rajamahendravaram streets, 3D buildings, tilt and
// rotate. No API key. The operating picture (zones, crowd density, radar-only bathing
// areas, cameras, staff, facilities, water sensors, alerts) is drawn on top from the
// same live state as the SVG map. If the library or tiles can't load (offline, no
// WebGL), createMap3D rejects and the caller keeps the offline SVG map.
import { ZONES, CAMERAS, PRIVACY_ZONES, RADAR_FLOW, FACILITIES, FACILITY_STYLE, WATER_SENSORS, ROLE_COLOURS, wqi, pointInPoly } from './data.js';
import { state, subscribe, openAlerts } from './store.js';
import { esc, num } from './util.js';

const LIB = 'https://unpkg.com/maplibre-gl@4.7.1/dist';
const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fallback: 'https://tiles.openfreemap.org/styles/positron',
};

/* ------------------------------------------------------------ map units → WGS84
   Similarity transform least-squares fitted so the Kotilingala, Pushkar and Saraswati
   bathing areas land on their OpenStreetMap positions (±200 m). 1 unit ≈ 5.3 m. */
const LAT0 = 17.005, LNG0 = 81.77, KX = 111320 * Math.cos((LAT0 * Math.PI) / 180), KY = 110574;
export function toLngLat([x, y]) {
  const east = 2.989159 * x - 4.331784 * y + 29.655;
  const north = -4.331784 * x - 2.989159 * y + 4153.944;
  return [LNG0 + east / KX, LAT0 + north / KY];
}
// Alerts raised by the Pilgrim/Field apps carry real coordinates; prefer those.
const alertLL = (a) => (a.geo?.lat != null ? [a.geo.lng, a.geo.lat] : toLngLat(a.location));
const ring = (pts) => { const r = pts.map(toLngLat); r.push(r[0]); return [r]; };
const CENTRE = toLngLat([600, 430]);
const VIEW = { center: CENTRE, zoom: 14.6, pitch: 58, bearing: -24 };

/* ------------------------------------------------------------ library loader */
let loader = null;
function loadLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = `${LIB}/maplibre-gl.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${LIB}/maplibre-gl.js`; s.async = true;
    s.onload = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error('library missing')));
    s.onerror = () => { loader = null; reject(new Error('3D map library could not load')); };
    document.head.appendChild(s);
    setTimeout(() => { loader = null; reject(new Error('3D map library timed out')); }, 12000);
  });
  return loader;
}
function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/* ------------------------------------------------------------ data → GeoJSON */
const fc = (features) => ({ type: 'FeatureCollection', features });
const pt = (pos, properties) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: toLngLat(pos) } });

// Crowd density as hexagonal columns: height and colour follow the CCTV density field.
const HEX_R = 9; // map units (~48 m)
const HEX_CENTRES = (() => {
  const out = [];
  const dx = Math.sqrt(3) * HEX_R, dy = 1.5 * HEX_R;
  for (let row = 0, y = 120; y < 720; row++, y += dy) {
    for (let x = row % 2 ? dx / 2 : 0; x < 1200; x += dx) {
      if (!ZONES.some((z) => z.bathing && pointInPoly([x, y], z.poly))) continue;
      if (!CAMERAS.some((c) => Math.hypot(c.pos[0] - x, c.pos[1] - y) < 70)) continue;
      out.push([x, y]);
    }
  }
  return out;
})();
const hexRing = ([cx, cy], r) => { const p = []; for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i + Math.PI / 6; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return ring(p); };
function crowdHexes() {
  const live = CAMERAS.filter((c) => c.status !== 'offline');
  const feats = [];
  for (const h of HEX_CENTRES) {
    let d = 0;
    for (const c of live) { const k = Math.hypot(c.pos[0] - h[0], c.pos[1] - h[1]) / 34; if (k < 3) d = Math.max(d, c.density * Math.exp(-k * k)); }
    if (d < 0.08) continue;
    feats.push({ type: 'Feature', properties: { d: +d.toFixed(3) }, geometry: { type: 'Polygon', coordinates: hexRing(h, HEX_R * 0.86) } });
  }
  return fc(feats);
}
function zonesGeo() {
  return fc(ZONES.map((z) => ({ type: 'Feature', properties: { id: z.id, dim: !!(state.zones.length && !state.zones.includes(z.id)), emergency: state.emergency?.zone === z.id }, geometry: { type: 'Polygon', coordinates: ring(z.poly) } })));
}
function radarGeo() {
  return fc(PRIVACY_ZONES.map((pz) => {
    const rf = RADAR_FLOW.find((r) => r.zoneId === pz.id) || { density: 0 };
    return { type: 'Feature', properties: { id: pz.id, d: rf.density }, geometry: { type: 'Polygon', coordinates: ring(pz.poly) } };
  }));
}
const camsGeo = () => fc(CAMERAS.map((c) => pt(c.pos, { id: c.id, status: c.status })));
const facGeo = () => fc(FACILITIES.map((f) => pt(f.pos, { id: f.id, colour: FACILITY_STYLE[f.type]?.colour || '#64748B', status: f.status })));
const waterGeo = () => fc(WATER_SENSORS.map((s) => { const q = wqi(s); return pt(s.pos, { id: s.id, q, colour: q >= 70 ? '#059669' : q >= 50 ? '#D97706' : '#DC2626' }); }));

/* ------------------------------------------------------------ the map */
export async function createMap3D(container, { theme = 'light', onAlert, onCamera, onZone } = {}) {
  if (!webgl()) throw new Error('This browser has no WebGL');
  const lib = await loadLib();
  const map = new lib.Map({
    container, style: STYLES[theme] || STYLES.light, ...VIEW,
    maxPitch: 78, attributionControl: { compact: true }, fadeDuration: 150, dragRotate: true,
  });
  let styleFailed = false;
  map.on('error', (e) => {
    const msg = String(e?.error?.message || '');
    if (!styleFailed && /style|404|Failed to fetch/i.test(msg) && !map.isStyleLoaded()) { styleFailed = true; map.setStyle(STYLES.fallback); }
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Map tiles timed out — check the internet connection')), 15000);
    map.once('load', () => { clearTimeout(t); resolve(); });
  });

  const html = { staff: new Map(), alerts: new Map(), zones: [], radar: [] };
  const marker = (el, pos, anchor = 'center') => new lib.Marker({ element: el, anchor }).setLngLat(toLngLat(pos)).addTo(map);

  function addOverlays() {
    const src = (id, data) => { if (map.getSource(id)) map.getSource(id).setData(data); else map.addSource(id, { type: 'geojson', data }); };
    const lyr = (def, before) => { if (!map.getLayer(def.id)) map.addLayer(def, before); };
    // tone the basemap's own 3D buildings to sit behind the data
    if (map.getLayer('building-3d')) map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.55);
    else {
      const vec = Object.entries(map.getStyle().sources).find(([, s]) => s.type === 'vector')?.[0];
      if (vec) lyr({ id: 'building-3d', type: 'fill-extrusion', source: vec, 'source-layer': 'building', minzoom: 14, paint: { 'fill-extrusion-color': theme === 'dark' ? '#2B3442' : '#E5DED3', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.55 } });
    }
    src('gc-zones', zonesGeo());
    lyr({ id: 'gc-zones-fill', type: 'fill', source: 'gc-zones', paint: { 'fill-color': ['case', ['get', 'emergency'], '#DC2626', '#2563EB'], 'fill-opacity': ['case', ['get', 'emergency'], 0.16, ['get', 'dim'], 0.02, 0.05] } });
    lyr({ id: 'gc-zones-line', type: 'line', source: 'gc-zones', paint: { 'line-color': ['case', ['get', 'emergency'], '#DC2626', theme === 'dark' ? '#93C5FD' : '#1E3A5F'], 'line-width': ['case', ['get', 'emergency'], 3.5, 1.6], 'line-dasharray': [3, 2], 'line-opacity': ['case', ['get', 'dim'], 0.3, 0.8] } });
    src('gc-radar', radarGeo());
    lyr({ id: 'gc-radar', type: 'fill-extrusion', source: 'gc-radar', paint: { 'fill-extrusion-color': '#8B5CF6', 'fill-extrusion-height': ['+', 4, ['*', ['get', 'd'], 30]], 'fill-extrusion-opacity': 0.45 } });
    src('gc-crowd', crowdHexes());
    lyr({ id: 'gc-crowd', type: 'fill-extrusion', source: 'gc-crowd', paint: {
      'fill-extrusion-color': ['step', ['get', 'd'], '#22C55E', 0.3, '#EAB308', 0.6, '#F97316', 0.85, '#EF4444'],
      'fill-extrusion-height': ['*', ['get', 'd'], 160], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.82,
    } });
    src('gc-water', waterGeo());
    lyr({ id: 'gc-water', type: 'circle', source: 'gc-water', paint: { 'circle-radius': 7, 'circle-color': ['get', 'colour'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    src('gc-fac', facGeo());
    lyr({ id: 'gc-fac', type: 'circle', source: 'gc-fac', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 8], 'circle-color': ['get', 'colour'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5, 'circle-opacity': ['case', ['==', ['get', 'status'], 'closed'], 0.4, 1] } });
    src('gc-cams', camsGeo());
    lyr({ id: 'gc-cams', type: 'circle', source: 'gc-cams', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 17, 6],
      'circle-color': ['match', ['get', 'status'], 'offline', '#94A3B8', 'degraded', '#D97706', '#0F172A'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2, 'circle-pitch-alignment': 'map',
    } });
    applyLayers();
  }

  // HTML markers: zone tags, radar counts, staff, alerts
  function zoneTags() {
    html.zones.forEach((m) => m.remove());
    html.zones = ZONES.map((z) => { const el = document.createElement('button'); el.className = 'm3-zone'; el.innerHTML = `<b>${z.name}</b> ${esc(z.area)}`; el.onclick = () => onZone?.(z.id); return marker(el, z.label); });
    html.radar.forEach((m) => m.remove());
    html.radar = PRIVACY_ZONES.map((pz) => {
      const rf = RADAR_FLOW.find((r) => r.zoneId === pz.id);
      const el = document.createElement('div'); el.className = 'm3-radar'; el.title = 'Radar only — no visual capture';
      el.textContent = rf ? `${num(rf.count)} · ${Math.round(rf.density * 100)}%` : 'Radar only';
      return marker(el, pz.centre);
    });
  }
  function syncStaff() {
    const seen = new Set();
    for (const s of state.staff) {
      if (s.status === 'off' || !s.pos) continue;
      seen.add(s.id);
      let m = html.staff.get(s.id);
      if (!m) {
        const el = document.createElement('div'); el.className = 'm3-staff';
        m = marker(el, s.pos); html.staff.set(s.id, m);
      }
      const el = m.getElement();
      el.style.setProperty('--role', ROLE_COLOURS[s.role] || '#475569');
      el.dataset.status = s.status;
      el.textContent = s.name.split(' ').map((p) => p[0]).join('').slice(0, 2);
      el.title = `${s.name} — ${s.role}, ${s.status}`;
      m.setLngLat(toLngLat(s.pos));
    }
    for (const [id, m] of html.staff) if (!seen.has(id)) { m.remove(); html.staff.delete(id); }
  }
  function syncAlerts() {
    const list = openAlerts().filter((a) => a.location || a.geo?.lat != null);
    const seen = new Set(list.map((a) => a.id));
    for (const a of list) {
      let m = html.alerts.get(a.id);
      if (!m) {
        const el = document.createElement('button'); el.className = 'm3-alert';
        el.innerHTML = '<span class="m3-alert__ring" aria-hidden="true"></span><svg width="28" height="36" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 35C9 27 2 22 2 14a12 12 0 0 1 24 0c0 8-7 13-12 21z"/><circle cx="14" cy="14" r="4.5" fill="#fff"/></svg>';
        el.addEventListener('click', (e) => { e.stopPropagation(); onAlert?.(a.id); });
        m = new lib.Marker({ element: el, anchor: 'bottom' }).setLngLat(alertLL(a)).addTo(map); html.alerts.set(a.id, m);
      }
      m.setLngLat(alertLL(a));
      const el = m.getElement();
      el.dataset.sev = a.severity;
      el.classList.toggle('is-new', a.state === 'unread' && a.severity === 'critical');
      el.classList.toggle('is-selected', a.id === state.selectedAlert);
      el.classList.toggle('is-dispatched', a.state === 'dispatched');
      el.setAttribute('aria-label', `${a.title}, ${a.severity}`);
      el.title = a.title;
    }
    for (const [id, m] of html.alerts) if (!seen.has(id)) { m.remove(); html.alerts.delete(id); }
  }

  const VIS = {
    cctv: ['gc-crowd'], radar: ['gc-radar'], privacy: ['gc-radar'], zones: ['gc-zones-fill', 'gc-zones-line'],
    facilities: ['gc-fac'], water: ['gc-water'], staff: [], traffic: [],
  };
  function applyLayers() {
    const L = state.mapLayers;
    for (const [k, ids] of Object.entries(VIS)) for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', L[k] || (id === 'gc-radar' && (L.radar || L.privacy)) ? 'visible' : 'none');
    container.classList.toggle('m3-hide-staff', !L.staff);
    container.classList.toggle('m3-hide-zones', !L.zones);
    container.classList.toggle('m3-hide-radar', !(L.radar || L.privacy));
  }

  addOverlays(); zoneTags(); syncStaff(); syncAlerts();
  map.on('style.load', addOverlays); // after a theme switch

  map.on('click', 'gc-cams', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onCamera?.(id); });
  for (const id of ['gc-cams', 'gc-fac', 'gc-water']) {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }

  // live updates
  let lastSel = state.selectedAlert;
  const unsub = subscribe(['staff', 'alerts', 'selectedAlert', 'zones', 'emergency', 'mapLayers', 'theme'], (_s, keys) => {
    const has = (x) => keys.includes(x);
    if (has('theme') && state.theme !== theme) ctl.setTheme(state.theme);
    if (has('staff')) syncStaff();
    if (has('alerts') || has('selectedAlert')) syncAlerts();
    if (has('zones') || has('emergency')) map.getSource('gc-zones')?.setData(zonesGeo());
    if (has('mapLayers')) applyLayers();
    if (state.selectedAlert && state.selectedAlert !== lastSel) {
      const a = state.alerts.find((x) => x.id === state.selectedAlert);
      if (a?.location || a?.geo) map.flyTo({ center: alertLL(a), zoom: 16.4, pitch: 62, duration: 1400, essential: true });
    }
    lastSel = state.selectedAlert;
  });
  // crowd density and sensors drift with the simulation
  const tick = setInterval(() => {
    map.getSource('gc-crowd')?.setData(crowdHexes());
    map.getSource('gc-radar')?.setData(radarGeo());
    map.getSource('gc-cams')?.setData(camsGeo());
    map.getSource('gc-water')?.setData(waterGeo());
    syncStaff();
  }, 4000);

  let orbit = 0;
  function spin() { if (!orbit) return; map.rotateTo((map.getBearing() + 8) % 360, { duration: 2000, easing: (t) => t }); }
  map.on('moveend', () => { if (orbit) spin(); });

  const ctl = {
    map,
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    reset: () => map.flyTo({ ...VIEW, duration: 1200 }),
    setOrbit(on) { orbit = on ? 1 : 0; if (on) spin(); else map.stop(); },
    setTheme(t) { theme = t; styleFailed = false; map.setStyle(STYLES[t] || STYLES.light); },
    flyTo: (pos, zoom = 16.4) => map.flyTo({ center: toLngLat(pos), zoom, duration: 1200 }),
    resize: () => map.resize(),
    destroy() { clearInterval(tick); unsub?.(); orbit = 0; map.remove(); },
  };
  return ctl;
}
