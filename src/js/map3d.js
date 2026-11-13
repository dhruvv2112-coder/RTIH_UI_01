// 3D map view (MapLibre GL JS + OpenFreeMap vector tiles — free, no API key).
// Loaded on demand from a CDN, so it needs internet; the stylised 2D SVG map
// remains the offline default. Overlays are plain GeoJSON built by each app
// from its own data via geo.js, so swapping the basemap (Mappls, Google
// Photorealistic 3D Tiles, Mapbox Standard) only touches this file.
// See docs/MAP_COMPARISON.md for why this stack was chosen for the demo.

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const CDNS = [
  'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl',
  'https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl',
];

let loading = null;
function addCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.append(l);
}
function addScript(src, ms = 9000) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    const to = setTimeout(() => { s.remove(); rej(new Error('timeout')); }, ms);
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => { clearTimeout(to); res(); };
    s.onerror = () => { clearTimeout(to); s.remove(); rej(new Error('load failed')); };
    document.head.append(s);
  });
}
/** Resolves to the maplibregl global, trying each CDN in turn. */
export function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (!loading) {
    loading = (async () => {
      for (const base of CDNS) {
        try { addCss(`${base}.css`); await addScript(`${base}.js`); if (window.maplibregl) return window.maplibregl; } catch { /* try next */ }
      }
      loading = null;
      throw new Error('MapLibre could not be downloaded — check the internet connection.');
    })();
  }
  return loading;
}

/* ------------------------------------------------------------ geometry */
const M_LAT = 110574;
const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
/** Square of side `m` metres around [lng, lat] (for crowd columns). */
export function square([lng, lat], m) {
  const dx = m / 2 / mLng(lat), dy = m / 2 / M_LAT;
  return [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]];
}
export const fc = (features) => ({ type: 'FeatureCollection', features });
export const point = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates } });
export const polygon = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates } });
export const line = (coordinates, properties = {}) => ({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates } });
export const ring = (pts) => [[...pts, pts[0]]];

export function heat(d) { return d < 0.3 ? '#22C55E' : d < 0.6 ? '#EAB308' : d < 0.8 ? '#F97316' : '#DC2626'; }

/* --------------------------------------------------------------- styles */
const CSS = `
.m3d { position: absolute; inset: 0; z-index: 5; background: #E8EEF5; }
.m3d__map { position: absolute; inset: 0; }
.m3d__status { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; font: 600 14px/1.5 Inter, system-ui, sans-serif; color: #334155; padding: 24px; }
.m3d__status small { display: block; font-weight: 400; color: #64748B; margin-top: 4px; }
.m3d__bar { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; z-index: 2; flex-wrap: wrap; }
.m3d__btn { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(15,23,42,.12); background: #fff; color: #0F172A; font: 600 12px Inter, system-ui, sans-serif; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; box-shadow: 0 1px 3px rgba(15,23,42,.12); }
.m3d__btn[aria-pressed=true] { background: #1E3A5F; color: #fff; border-color: #1E3A5F; }
.m3d__btn:focus-visible { outline: 3px solid #93C5FD; outline-offset: 2px; }
.m3d__credit { position: absolute; left: 12px; bottom: 8px; z-index: 2; font: 11px Inter, system-ui, sans-serif; color: #475569; background: rgba(255,255,255,.85); padding: 2px 8px; border-radius: 6px; }
.m3d-alert { width: 22px; height: 22px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); cursor: pointer; position: relative; }
.m3d-alert::after { content: ''; position: absolute; inset: -9px; border-radius: 50%; border: 2px solid currentColor; animation: m3dPulse 1.6s ease-out infinite; }
.m3d-alert--critical { background: #DC2626; color: #DC2626; } .m3d-alert--high { background: #EA580C; color: #EA580C; }
.m3d-alert--medium { background: #D97706; color: #D97706; } .m3d-alert--low { background: #2563EB; color: #2563EB; }
.m3d-alert--dispatched::after { animation: none; border-style: dashed; }
.m3d-user { width: 18px; height: 18px; border-radius: 50%; background: #2563EB; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(37,99,235,.25); }
.m3d-pin { width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #DC2626; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
.maplibregl-popup-content { font: 13px/1.45 Inter, system-ui, sans-serif; color: #0F172A; border-radius: 10px; padding: 10px 12px; }
.maplibregl-popup-content b { display: block; font-size: 13px; }
@keyframes m3dPulse { from { transform: scale(.6); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .m3d-alert::after { animation: none; } }`;
function injectCss() {
  if (document.getElementById('m3d-css')) return;
  const s = document.createElement('style'); s.id = 'm3d-css'; s.textContent = CSS; document.head.append(s);
}

/**
 * Mount a 3D map into `host` (position: relative). Returns a controller.
 * opts: { centre:[lng,lat], zoom, pitch, bearing, data: { zones, crowd, privacy, staff, facilities, route },
 *         alerts: [{ id, lngLat, severity, state, html }], user: [lng,lat], pin: [lng,lat],
 *         onAlert(id), onClose(), labels: { close } }
 */
export async function mount3D(host, opts) {
  injectCss();
  const el = document.createElement('div');
  el.className = 'm3d';
  el.innerHTML = `<div class="m3d__map" role="application" aria-label="3D map of the Pushkaralu ghats. Drag to pan, right-drag or Ctrl-drag to tilt and rotate."></div>
    <div class="m3d__status" role="status">Loading 3D map…<small>MapLibre GL · OpenFreeMap tiles (internet required)</small></div>
    <div class="m3d__bar">
      <button class="m3d__btn" data-m3d="close" aria-label="Back to the 2D operations map">${opts.labels?.close || '2D map'}</button>
      <button class="m3d__btn" data-m3d="tilt" aria-pressed="true">3D tilt</button>
      <button class="m3d__btn" data-m3d="crowd" aria-pressed="true">Crowd columns</button>
      <button class="m3d__btn" data-m3d="fit">Re-centre</button>
    </div>
    <div class="m3d__credit">Approximate georeference · calibrate in geo.js</div>`;
  host.append(el);
  const status = el.querySelector('.m3d__status');
  let map = null;
  let markers = [];
  const view = { center: opts.centre, zoom: opts.zoom ?? 15.6, pitch: opts.pitch ?? 60, bearing: opts.bearing ?? -25 };

  const ctl = {
    el,
    get map() { return map; },
    destroy() { markers.forEach((m) => m.remove()); map?.remove(); el.remove(); },
    update(data) { if (map?.isStyleLoaded()) apply(data); else pending = data; },
    fly(lngLat, zoom = 17) { map?.flyTo({ center: lngLat, zoom, pitch: 60, speed: 1.2 }); },
  };
  let pending = null;

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m3d]');
    if (!b) return;
    const k = b.dataset.m3d;
    if (k === 'close') { opts.onClose?.(); return; }
    if (!map) return;
    if (k === 'fit') map.flyTo({ ...view, speed: 1.4 });
    if (k === 'tilt') { const on = map.getPitch() < 10; map.easeTo({ pitch: on ? 60 : 0, bearing: on ? view.bearing : 0 }); b.setAttribute('aria-pressed', String(on)); }
    if (k === 'crowd') { const vis = map.getLayoutProperty('rtih-crowd', 'visibility') !== 'none'; map.setLayoutProperty('rtih-crowd', 'visibility', vis ? 'none' : 'visible'); b.setAttribute('aria-pressed', String(!vis)); }
  });

  let gl;
  try { gl = await loadMapLibre(); } catch (err) {
    status.innerHTML = `3D map unavailable offline<small>${err.message} The 2D operations map keeps working without internet.</small>`;
    return ctl;
  }

  try {
    map = new gl.Map({ container: el.querySelector('.m3d__map'), style: STYLE_URL, ...view, maxPitch: 75, antialias: true, attributionControl: { compact: true } });
  } catch (err) {
    status.innerHTML = `3D map could not start<small>${err.message || 'WebGL is not available in this browser.'}</small>`;
    return ctl;
  }
  map.addControl(new gl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new gl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.on('error', () => { /* tile hiccups are non-fatal */ });
  const failTimer = setTimeout(() => { if (!map.isStyleLoaded()) status.innerHTML = 'Still loading map tiles…<small>Check the internet connection — tiles come from tiles.openfreemap.org.</small>'; }, 10000);

  map.on('load', () => {
    clearTimeout(failTimer);
    status.remove();
    ensureBuildings();
    addOverlayLayers();
    apply(pending || opts.data || {});
    pending = null;
  });

  function ensureBuildings() {
    const style = map.getStyle();
    if (style.layers.some((l) => l.type === 'fill-extrusion')) return;
    const b = style.layers.find((l) => l['source-layer'] === 'building');
    if (!b) return;
    map.addLayer({ id: 'rtih-buildings-3d', type: 'fill-extrusion', source: b.source, 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-extrusion-color': '#D9DEE7', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } });
  }

  function src(id) { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: fc([]) }); }
  function addOverlayLayers() {
    ['rtih-zones', 'rtih-privacy', 'rtih-crowd-src', 'rtih-staff', 'rtih-fac', 'rtih-route'].forEach(src);
    const font = ['Noto Sans Bold'];
    map.addLayer({ id: 'rtih-zones-fill', type: 'fill', source: 'rtih-zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.08 } });
    map.addLayer({ id: 'rtih-zones-line', type: 'line', source: 'rtih-zones', paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 1.5] } });
    map.addLayer({ id: 'rtih-privacy-fill', type: 'fill', source: 'rtih-privacy', paint: { 'fill-color': '#7C3AED', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'rtih-privacy-line', type: 'line', source: 'rtih-privacy', paint: { 'line-color': '#7C3AED', 'line-width': 2, 'line-dasharray': [1, 1] } });
    map.addLayer({ id: 'rtih-route', type: 'line', source: 'rtih-route', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-dasharray': [0.2, 1.8] } });
    map.addLayer({ id: 'rtih-crowd', type: 'fill-extrusion', source: 'rtih-crowd-src', paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.82 } });
    map.addLayer({ id: 'rtih-fac', type: 'circle', source: 'rtih-fac', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-pitch-alignment': 'map' } });
    map.addLayer({ id: 'rtih-staff', type: 'circle', source: 'rtih-staff', paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
    const label = (id, source, size, color, extra = {}) => {
      try { map.addLayer({ id, type: 'symbol', source, layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': size, 'text-allow-overlap': false, ...extra }, paint: { 'text-color': color, 'text-halo-color': '#fff', 'text-halo-width': 1.6 } }); } catch { /* glyphs unavailable */ }
    };
    label('rtih-zones-label', 'rtih-zones', 14, '#1E3A5F', { 'symbol-placement': 'point' });
    label('rtih-privacy-label', 'rtih-privacy', 11, '#5B21B6');
    label('rtih-staff-label', 'rtih-staff', 11, '#0F172A', { 'text-offset': [0, 1.3], 'text-anchor': 'top' });

    const pop = (layer) => map.on('click', layer, (e) => {
      const f = e.features?.[0]; if (!f?.properties?.html) return;
      new gl.Popup({ offset: 10, closeButton: false }).setLngLat(e.lngLat).setHTML(f.properties.html).addTo(map);
    });
    ['rtih-staff', 'rtih-fac', 'rtih-privacy-fill', 'rtih-crowd'].forEach((l) => {
      pop(l);
      map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  function apply(d) {
    const set = (id, v) => v && map.getSource(id)?.setData(v);
    set('rtih-zones', d.zones); set('rtih-privacy', d.privacy); set('rtih-crowd-src', d.crowd);
    set('rtih-staff', d.staff); set('rtih-fac', d.facilities); set('rtih-route', d.route || fc([]));
    markers.forEach((m) => m.remove());
    markers = [];
    for (const a of d.alerts || []) {
      const node = document.createElement('button');
      node.className = `m3d-alert m3d-alert--${a.severity}${a.state === 'dispatched' ? ' m3d-alert--dispatched' : ''}`;
      node.setAttribute('aria-label', a.label || a.id);
      node.title = a.label || a.id;
      const m = new gl.Marker({ element: node }).setLngLat(a.lngLat).addTo(map);
      if (a.html) m.setPopup(new gl.Popup({ offset: 16, closeButton: false }).setHTML(a.html));
      node.addEventListener('click', () => opts.onAlert?.(a.id));
      markers.push(m);
    }
    if (d.user) { const n = document.createElement('div'); n.className = 'm3d-user'; n.title = 'You'; markers.push(new gl.Marker({ element: n }).setLngLat(d.user).addTo(map)); }
    if (d.pin) { const n = document.createElement('div'); n.className = 'm3d-pin'; n.title = d.pinLabel || 'Task'; markers.push(new gl.Marker({ element: n, anchor: 'bottom' }).setLngLat(d.pin).addTo(map)); }
  }

  return ctl;
}
