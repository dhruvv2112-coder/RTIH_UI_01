// Georeference for the stylised Rajamahendravaram riverfront map.
// The dashboard draws in "map units" (1200 × 720, ~4.2 m per unit). Two
// control points tie map units to real coordinates; a similarity transform
// (scale + rotation + shift) maps everything else. The control points below are
// approximate (OpenStreetMap / public listings) — replace them with surveyed
// ghat coordinates from the district GIS cell and every overlay follows.
export const CONTROL = [
  { map: [600, 440], lngLat: [81.7688, 17.0063], name: 'Pushkar Ghat' },
  { map: [300, 352], lngLat: [81.7650, 17.0128], name: 'Kotilingala Ghat' },
];
export const CENTRE = [81.7700, 17.0050];

const M_LAT = 110574;
const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function solve() {
  const [a, b] = CONTROL;
  const lat0 = a.lngLat[1];
  // real offsets in metres (east, north) relative to control point a
  const toM = (ll) => [(ll[0] - a.lngLat[0]) * mLng(lat0), (ll[1] - a.lngLat[1]) * M_LAT];
  const rb = toM(b.lngLat);
  // map offsets (x right, y down) → flip y so both are east/north-like
  const mb = [b.map[0] - a.map[0], -(b.map[1] - a.map[1])];
  // complex division: k = rb / mb  (scale + rotation)
  const d = mb[0] * mb[0] + mb[1] * mb[1];
  const kr = (rb[0] * mb[0] + rb[1] * mb[1]) / d;
  const ki = (rb[1] * mb[0] - rb[0] * mb[1]) / d;
  return { a, lat0, kr, ki };
}
const T = solve();

/** Map units [x, y] → [lng, lat]. */
export function toLngLat([x, y]) {
  const mx = x - T.a.map[0], my = -(y - T.a.map[1]);
  const e = mx * T.kr - my * T.ki, n = mx * T.ki + my * T.kr;
  return [T.a.lngLat[0] + e / mLng(T.lat0), T.a.lngLat[1] + n / M_LAT];
}

/** "16.98912° N, 81.77874° E" style label. */
export function coordLabel(p) {
  const [lng, lat] = toLngLat(p);
  return `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E`;
}

/** Metres per map unit implied by the control points (for a sanity check). */
export const metresPerUnit = Math.hypot(T.kr, T.ki);
