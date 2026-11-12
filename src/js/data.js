// Simulated operating picture for Godavari Pushkaralu 2027, Rajamahendravaram.
// Every value here stands in for the S1/S2/S3 feeds described in brief §10.
// Geometry is in map units (viewBox 0 0 1200 720), not lat/lng.

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const R = rng(2027);

/* ---------------------------------------------------------------- Zones */
export const ZONES = [
  { id: 'A', name: 'Zone A', area: 'Pushkar Ghat', bathing: true, capacity: 14000,
    poly: [[420, 372], [540, 420], [600, 450], [700, 500], [735, 300], [700, 205], [455, 180]],
    label: [585, 300] },
  { id: 'B', name: 'Zone B', area: 'Kotilingala Ghat', bathing: true, capacity: 12000,
    poly: [[0, 262], [150, 290], [300, 330], [420, 372], [455, 180], [380, 120], [0, 110]],
    label: [215, 205] },
  { id: 'C', name: 'Zone C', area: 'Saraswati Ghat', bathing: true, capacity: 9000,
    poly: [[700, 500], [790, 548], [850, 590], [920, 650], [965, 720], [1200, 720], [1200, 560], [960, 420], [735, 300]],
    label: [1060, 610] },
  { id: 'D', name: 'Zone D', area: 'Station & RTC hub', bathing: false, capacity: 16000,
    poly: [[700, 205], [735, 300], [960, 420], [1200, 560], [1200, 0], [640, 0], [380, 120], [455, 180]],
    label: [900, 190] },
];

/* City-side river bank, upstream (west) → downstream (south-east). */
export const BANK = [[0, 262], [150, 290], [300, 330], [420, 372], [540, 420], [600, 450], [700, 500], [790, 548], [850, 590], [920, 650], [965, 720]];
export const FAR_BANK = [[0, 600], [140, 622], [260, 650], [360, 690], [420, 720]];
export const ISLAND = [[180, 470], [260, 452], [360, 470], [420, 505], [380, 540], [280, 548], [200, 528]];

function offsetSegment(a, b, landPx, waterPx) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const nx = dy / L, ny = -dx / L; // points to land (north-east)
  return [
    [a[0] + nx * landPx, a[1] + ny * landPx],
    [b[0] + nx * landPx, b[1] + ny * landPx],
    [b[0] - nx * waterPx, b[1] - ny * waterPx],
    [a[0] - nx * waterPx, a[1] - ny * waterPx],
  ];
}

/* Bathing ghats → radar-only privacy zones (brief §1.3, §5.4). */
export const PRIVACY_ZONES = [
  { id: 'PZ-B1', zone: 'B', name: 'Kotilingala Ghat bathing area', a: [232, 312], b: [372, 355], radars: 16 },
  { id: 'PZ-A1', zone: 'A', name: 'Pushkar Ghat bathing area', a: [512, 408], b: [652, 476], radars: 22 },
  { id: 'PZ-C1', zone: 'C', name: 'Saraswati Ghat bathing area', a: [760, 532], b: [872, 608], radars: 14 },
  { id: 'PZ-A2', zone: 'A', name: 'Markandeya Ghat bathing area', a: [430, 376], b: [492, 400], radars: 6 },
].map((z) => {
  const poly = offsetSegment(z.a, z.b, 16, 34);
  const cx = poly.reduce((s, p) => s + p[0], 0) / 4;
  const cy = poly.reduce((s, p) => s + p[1], 0) / 4;
  const angle = (Math.atan2(z.b[1] - z.a[1], z.b[0] - z.a[0]) * 180) / Math.PI;
  return { ...z, poly, centre: [cx, cy], angle, steps: offsetSegment(z.a, z.b, 16, 0) };
});

/* ------------------------------------------------------------------ Roads */
export const ROADS = [
  { id: 'r-bund', name: 'Godavari Bund Road', major: true, pts: [[0, 222], [160, 250], [310, 290], [430, 333], [560, 382], [700, 455], [800, 505], [900, 580], [980, 650], [1040, 720]] },
  { id: 'r-main', name: 'Main Road', major: true, pts: [[0, 150], [200, 170], [420, 210], [620, 255], [800, 330], [980, 430], [1200, 520]] },
  { id: 'r-nh', name: 'NH-216A', major: true, pts: [[380, 0], [470, 90], [560, 140], [700, 160], [900, 150], [1200, 120]] },
  { id: 'r-stn', name: 'Station Road', major: false, pts: [[600, 450], [640, 330], [700, 255], [790, 200], [880, 160]] },
  { id: 'r-kot', name: 'Kotipalli Road', major: false, pts: [[300, 330], [330, 230], [360, 120], [380, 0]] },
  { id: 'r-ghat', name: 'Ghat Approach', major: false, pts: [[790, 548], [840, 450], [900, 360], [1000, 280], [1200, 260]] },
  { id: 'r-inner', name: 'Innespeta Road', major: false, pts: [[150, 290], [160, 160], [210, 40], [230, 0]] },
];
export const BRIDGE = { name: 'Rail-cum-Road Bridge', a: [96, 278], b: [40, 610] };
export const BRIDGE2 = { name: 'Havelock Bridge', a: [60, 270], b: [8, 604] };

/* --------------------------------------------------------------- Cameras */
const SCENES = ['road', 'plaza', 'gate', 'road', 'plaza', 'gate', 'bridge', 'queue'];
const CAM_PLACES = {
  A: ['Pushkar Ghat entry arch', 'Bund Road junction', 'Pushkar queue lane 1', 'Pushkar queue lane 2', 'Cloak room plaza', 'Temple street', 'Station Rd crossing', 'Ghat exit corridor', 'Prasadam counter', 'East corridor', 'Kambala tank junction', 'Medical camp A1'],
  B: ['Kotilingala entry gate', 'Kotipalli bus stand', 'Bridge approach', 'Kotilingala queue 1', 'Kotilingala queue 2', 'Innespeta crossing', 'Parking lot B2', 'Shiva temple street', 'Bund Road west', 'Exit corridor B', 'Food court B', 'Holding area B'],
  C: ['Saraswati Ghat gate', 'Gowthami Ghat lane', 'Ghat approach road', 'Parking lot C1', 'Holding area C', 'Saraswati queue', 'Vendor street', 'Exit corridor C', 'Bund Road east', 'Medical camp C1'],
  D: ['Railway station east', 'Railway station west', 'RTC bus complex', 'RTC bay 4–9', 'Main Road flyover', 'NH-216A toll', 'Parking lot D1', 'Parking lot D2', 'Shuttle pick-up', 'Pilgrim help desk', 'Taxi stand', 'Station subway'],
};
const ZONE_CAM_COUNT = { A: 46, B: 40, C: 31, D: 42 }; // 159 total (footer §3.3)

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export { pointInPoly };

function randomPointInZone(zone, r) {
  const xs = zone.poly.map((p) => p[0]), ys = zone.poly.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let k = 0; k < 400; k++) {
    const p = [x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)];
    if (pointInPoly(p, zone.poly) && !PRIVACY_ZONES.some((pz) => pointInPoly(p, pz.poly))) return p;
  }
  return zone.label;
}

export const CAMERAS = [];
for (const z of ZONES) {
  const places = CAM_PLACES[z.id];
  for (let i = 1; i <= ZONE_CAM_COUNT[z.id]; i++) {
    const id = `${z.id}-${String(i).padStart(2, '0')}`;
    const place = places[(i - 1) % places.length] + (i > places.length ? ` ${Math.ceil(i / places.length)}` : '');
    CAMERAS.push({
      id,
      zone: z.id,
      name: `CAM ${id}`,
      place,
      pos: randomPointInZone(z, R),
      scene: SCENES[Math.floor(R() * SCENES.length)],
      seed: Math.floor(R() * 1e9),
      density: 0,
      status: 'streaming',
      fps: 25,
      bitrate: 3800 + Math.floor(R() * 1600),
      personCount: 0,
      ptz: R() > 0.55,
    });
  }
}
// Density falls off with distance from the busiest bathing ghats.
const HOT = [[582, 442, 1.0], [302, 336, 0.72], [815, 570, 0.5], [930, 250, 0.62]];
for (const c of CAMERAS) {
  const v = Math.max(...HOT.map(([x, y, k]) => k * Math.exp(-Math.hypot(c.pos[0] - x, c.pos[1] - y) / 150)));
  c.density = Math.min(0.97, Math.max(0.08, 0.1 + v * 0.85 + (R() - 0.5) * 0.12));
}
// A few realistic faults so every camera state is represented.
const setCam = (id, patch) => Object.assign(CAMERAS.find((c) => c.id === id), patch);
setCam('A-05', { status: 'degraded', fps: 11, bitrate: 420 });
setCam('B-07', { status: 'offline', fps: 0, bitrate: 0, retryIn: 24 });
setCam('D-11', { status: 'degraded', fps: 13, bitrate: 610 });
// The A-01..A-03 cameras overlook the busiest approach.
setCam('A-01', { density: 0.92, scene: 'gate' });
setCam('A-02', { density: 0.86, scene: 'road' });
setCam('A-03', { density: 0.8, scene: 'queue' });

/* Camera preset groups (keys 1–9) */
export const PRESETS = [
  { key: 1, name: 'Zone A — approaches', cams: CAMERAS.filter((c) => c.zone === 'A').slice(0, 36).map((c) => c.id) },
  { key: 2, name: 'Zone B — Kotilingala', cams: CAMERAS.filter((c) => c.zone === 'B').slice(0, 36).map((c) => c.id) },
  { key: 3, name: 'Zone C — Saraswati', cams: CAMERAS.filter((c) => c.zone === 'C').slice(0, 36).map((c) => c.id) },
  { key: 4, name: 'Zone D — Transit hub', cams: CAMERAS.filter((c) => c.zone === 'D').slice(0, 36).map((c) => c.id) },
  { key: 5, name: 'All ghat entry gates', cams: CAMERAS.filter((c) => c.scene === 'gate').slice(0, 36).map((c) => c.id) },
  { key: 6, name: 'Queues & holding areas', cams: CAMERAS.filter((c) => c.scene === 'queue' || c.scene === 'plaza').slice(0, 36).map((c) => c.id) },
  { key: 7, name: 'Roads & bridges', cams: CAMERAS.filter((c) => c.scene === 'road' || c.scene === 'bridge').slice(0, 36).map((c) => c.id) },
  { key: 8, name: 'Faults & degraded', cams: ['B-07', 'A-05', 'D-11', ...CAMERAS.filter((c) => c.status === 'streaming').slice(0, 33).map((c) => c.id)] },
  { key: 9, name: 'Hot spots (density > 70%)', cams: [...CAMERAS].sort((a, b) => b.density - a.density).slice(0, 36).map((c) => c.id) },
];

/* ------------------------------------------------------------------ Radar */
export const RADAR_TOTAL = 58;
export const RADAR_FLOW = PRIVACY_ZONES.map((pz) => ({
  zoneId: pz.id,
  density: pz.id === 'PZ-A1' ? 0.92 : pz.id === 'PZ-B1' ? 0.64 : pz.id === 'PZ-C1' ? 0.41 : 0.33,
  count: pz.id === 'PZ-A1' ? 3480 : pz.id === 'PZ-B1' ? 2210 : pz.id === 'PZ-C1' ? 1120 : 380,
  flow: pz.id === 'PZ-A1' ? 'in' : 'out',
}));

/* ------------------------------------------------------------------ Staff */
const STAFF_SEED = [
  ['Ramesh K', 'Zone Marshal', 'A', [560, 395]],
  ['Suresh P', 'Zone Marshal', 'A', [640, 395]],
  ['Priya M', 'Supervisor', 'A', [610, 320]],
  ['Lakshmi V', 'Medical', 'A', [520, 360]],
  ['Anil Reddy', 'Police', 'A', [680, 420]],
  ['Kiran B', 'Volunteer', 'A', [500, 300]],
  ['Venkat Rao', 'Zone Marshal', 'B', [260, 290]],
  ['Sowmya T', 'Supervisor', 'B', [200, 230]],
  ['Mahesh G', 'Police', 'B', [340, 280]],
  ['Divya N', 'Medical', 'B', [120, 240]],
  ['Ravi Teja', 'Volunteer', 'B', [300, 200]],
  ['Harika S', 'Zone Marshal', 'C', [820, 520]],
  ['Naveen J', 'Police', 'C', [880, 470]],
  ['Padma L', 'Medical', 'C', [930, 560]],
  ['Srinivas D', 'Supervisor', 'C', [1010, 520]],
  ['Bhavani R', 'Volunteer', 'C', [780, 470]],
  ['Gopal Krishna', 'Zone Marshal', 'D', [860, 230]],
  ['Arjun M', 'Police', 'D', [960, 300]],
  ['Swathi K', 'Supervisor', 'D', [1050, 200]],
  ['Mohan P', 'Volunteer', 'D', [780, 160]],
  ['Rajesh Y', 'Medical', 'D', [1100, 380]],
  ['Fatima S', 'Zone Marshal', 'D', [700, 120]],
  ['Chandra S', 'Police', 'B', [60, 200]],
  ['Usha Rani', 'Volunteer', 'A', [700, 330]],
];
export const STAFF = STAFF_SEED.map(([name, role, zone, pos], i) => ({
  id: `ST-${String(i + 1).padStart(3, '0')}`,
  name, role, zone, pos,
  status: ['Priya M', 'Mahesh G', 'Naveen J', 'Swathi K', 'Rajesh Y'].includes(name) ? 'on-task' : name === 'Chandra S' ? 'off' : 'available',
  task: ['Priya M', 'Mahesh G', 'Naveen J', 'Swathi K', 'Rajesh Y'].includes(name) ? 'Queue control' : null,
  phone: `+91 9${String(800000000 + i * 7919).slice(0, 9)}`,
}));
export const STAFF_DEPLOYED = 86;
export const ROLE_COLOURS = {
  'Zone Marshal': '#2563EB', Supervisor: '#1E3A5F', Medical: '#DC2626', Police: '#0F766E', Volunteer: '#D97706',
};

/* ------------------------------------------------------------- Facilities */
export const FACILITIES = [
  { id: 'F-M1', type: 'medical', name: 'Medical camp A1', pos: [535, 340], status: 'operational', queue: 6 },
  { id: 'F-M2', type: 'medical', name: 'Medical camp B1', pos: [180, 250], status: 'operational', queue: 2 },
  { id: 'F-M3', type: 'medical', name: 'Medical camp C1', pos: [905, 520], status: 'operational', queue: 1 },
  { id: 'F-M4', type: 'medical', name: 'First-aid post D', pos: [1000, 250], status: 'operational', queue: 0 },
  { id: 'F-T1', type: 'toilet', name: 'Toilet block A2', pos: [660, 370], status: 'operational', queue: 14 },
  { id: 'F-T2', type: 'toilet', name: 'Toilet block B3', pos: [250, 250], status: 'down', queue: 0 },
  { id: 'F-T3', type: 'toilet', name: 'Toilet block C1', pos: [840, 500], status: 'operational', queue: 5 },
  { id: 'F-T4', type: 'toilet', name: 'Toilet block D2', pos: [880, 290], status: 'operational', queue: 9 },
  { id: 'F-K1', type: 'kiosk', name: 'Help kiosk A', pos: [590, 360], status: 'operational', queue: 3 },
  { id: 'F-K2', type: 'kiosk', name: 'Lost & found B', pos: [330, 300], status: 'operational', queue: 4 },
  { id: 'F-K3', type: 'kiosk', name: 'Help kiosk D', pos: [820, 220], status: 'operational', queue: 7 },
  { id: 'F-V1', type: 'vending', name: 'Water ATM A', pos: [480, 350], status: 'operational', queue: 11 },
  { id: 'F-V2', type: 'vending', name: 'Water ATM C', pos: [960, 600], status: 'down', queue: 0 },
  { id: 'F-V3', type: 'vending', name: 'Water ATM B', pos: [110, 270], status: 'operational', queue: 2 },
];
export const FACILITY_STYLE = {
  medical: { colour: '#DC2626', icon: 'cross', label: 'Medical' },
  toilet: { colour: '#2563EB', icon: 'bath', label: 'Toilets' },
  kiosk: { colour: '#7C3AED', icon: 'store', label: 'Kiosk' },
  vending: { colour: '#059669', icon: 'cup-soda', label: 'Vending' },
};

/* -------------------------------------------------------- Water sensors */
export const WATER_SENSORS = [
  { id: 'WS-01', name: 'Kotilingala midstream', pos: [300, 390], ph: 7.4, turbidity: 18, do: 6.8, conductivity: 412 },
  { id: 'WS-02', name: 'Pushkar ghat edge', pos: [590, 500], ph: 7.9, turbidity: 46, do: 5.1, conductivity: 498 },
  { id: 'WS-03', name: 'Saraswati ghat edge', pos: [800, 610], ph: 7.6, turbidity: 24, do: 6.2, conductivity: 430 },
  { id: 'WS-04', name: 'Bridge pier 6', pos: [70, 430], ph: 7.3, turbidity: 15, do: 7.1, conductivity: 401 },
  { id: 'WS-05', name: 'Island east', pos: [460, 560], ph: 7.5, turbidity: 21, do: 6.5, conductivity: 420 },
];
export function wqi(s) {
  // Simplified WQI 0–100 (higher is better)
  const ph = 100 - Math.abs(s.ph - 7.2) * 30;
  const tb = 100 - Math.min(s.turbidity, 100);
  const dox = Math.min(s.do / 7.5, 1) * 100;
  return Math.round(ph * 0.3 + tb * 0.35 + dox * 0.35);
}

/* -------------------------------------------------------------- Alerts */
export const ALERT_TYPES = {
  crowd: { icon: 'users', label: 'Crowd threshold breach' },
  medical: { icon: 'heart-pulse', label: 'Medical emergency' },
  lost: { icon: 'user-search', label: 'Lost person report' },
  object: { icon: 'package', label: 'Unattended object' },
  camera: { icon: 'camera-off', label: 'Camera offline' },
  water: { icon: 'droplet', label: 'Water quality' },
  traffic: { icon: 'car', label: 'Traffic congestion' },
  fire: { icon: 'flame', label: 'Smoke detected' },
  drowning: { icon: 'life-buoy', label: 'Deep-water entry' },
  gate: { icon: 'door-open', label: 'Gate overflow' },
};

const min = 60 * 1000;
export function seedAlerts(now = Date.now()) {
  return [
    { id: 'AL-2041', type: 'crowd', severity: 'critical', zone: 'A', title: 'Crowd threshold breach — Zone A', desc: 'Pushkar Ghat, density 92%, rising', location: [600, 440], cams: ['A-01', 'A-02', 'A-03'], suggestion: 'Redirect inflow to Saraswati Ghat via East Corridor; hold Station Rd crossing for 6 min.', source: 'Radar + CCTV', ts: now - 4 * min, metric: 0.92 },
    { id: 'AL-2040', type: 'drowning', severity: 'critical', zone: 'B', title: 'Deep-water entry — Zone B', desc: 'Kotilingala bathing area, 2 persons beyond rope line', location: [300, 352], cams: ['B-04', 'B-05', 'B-09'], suggestion: 'Alert river lifeguard boat B-2 and announce rope-line advisory on PA.', source: 'Radar', ts: now - 6 * min },
    { id: 'AL-2039', type: 'medical', severity: 'high', zone: 'A', title: 'Medical emergency — Zone A', desc: 'Elderly pilgrim collapsed near cloak room plaza', location: [540, 345], cams: ['A-05', 'A-06', 'A-04'], suggestion: 'Medical camp A1 is 40 m away — send stretcher team.', source: 'Help kiosk call', ts: now - 9 * min },
    { id: 'AL-2038', type: 'gate', severity: 'high', zone: 'D', title: 'Gate overflow — Zone D', desc: 'RTC complex gate 3 queue at 140% of design', location: [930, 260], cams: ['D-03', 'D-04', 'D-09'], suggestion: 'Open auxiliary gate 3B and release two shuttle buses.', source: 'CCTV', ts: now - 12 * min },
    { id: 'AL-2037', type: 'lost', severity: 'medium', zone: 'B', title: 'Lost child report — Zone B', desc: 'Girl, 7 yrs, yellow frock; last seen Kotipalli bus stand', location: [330, 260], cams: ['B-02', 'B-06', 'B-10'], suggestion: 'Broadcast description at lost & found B; enable face-agnostic attribute search on B-cams.', source: 'Lost & found desk', ts: now - 15 * min },
    { id: 'AL-2036', type: 'water', severity: 'medium', zone: 'A', title: 'Water quality dip — Zone A', desc: 'Turbidity 46 NTU at Pushkar ghat edge', location: [590, 500], cams: [], suggestion: 'Notify pollution control board; increase sampling to 5 min.', source: 'LoRaWAN WS-02', ts: now - 21 * min },
    { id: 'AL-2035', type: 'traffic', severity: 'medium', zone: 'D', title: 'Traffic congestion — Zone D', desc: 'Main Road flyover, avg speed 6 km/h', location: [980, 430], cams: ['D-05', 'D-06'], suggestion: 'Activate diversion plan D-2 via NH-216A.', source: 'CCTV traffic', ts: now - 26 * min },
    { id: 'AL-2034', type: 'camera', severity: 'low', zone: 'B', title: 'Camera offline — Zone B', desc: 'CAM B-07, Parking lot B2 — no signal', location: [230, 200], cams: ['B-07'], suggestion: 'Raise ticket with network team; pan B-06 to cover the lot.', source: 'System', ts: now - 33 * min },
    { id: 'AL-2033', type: 'object', severity: 'high', zone: 'C', title: 'Unattended object — Zone C', desc: 'Black trolley bag, holding area C, 11 min stationary', location: [980, 520], cams: ['C-05', 'C-04'], suggestion: 'Cordon 20 m and request BDDS check.', source: 'CCTV analytics', ts: now - 38 * min, state: 'dispatched', assignee: 'Naveen J' },
    { id: 'AL-2031', type: 'crowd', severity: 'medium', zone: 'C', title: 'Crowd threshold — Zone C', desc: 'Saraswati queue, density 71%, stable', location: [820, 540], cams: ['C-06', 'C-01'], suggestion: 'Hold advisory; monitor for 10 min.', source: 'CCTV', ts: now - 52 * min, state: 'acknowledged' },
    { id: 'AL-2028', type: 'medical', severity: 'high', zone: 'D', title: 'Medical emergency — Zone D', desc: 'Heat exhaustion, railway station east', location: [880, 200], cams: ['D-01'], suggestion: '', source: 'Staff app', ts: now - 74 * min, state: 'resolved', assignee: 'Rajesh Y' },
    { id: 'AL-2025', type: 'lost', severity: 'low', zone: 'A', title: 'Lost person found — Zone A', desc: 'Reunited at help kiosk A', location: [590, 360], cams: [], suggestion: '', source: 'Help kiosk', ts: now - 95 * min, state: 'resolved', assignee: 'Kiran B' },
  ].map((a) => ({ state: 'unread', notes: '', ...a }));
}

/* Templates for live-arriving alerts */
export const ALERT_STREAM = [
  { type: 'crowd', severity: 'high', zone: 'B', title: 'Crowd threshold — Zone B', desc: 'Kotilingala queue 2, density 81%, rising', location: [280, 300], cams: ['B-04', 'B-05'], suggestion: 'Stagger entry at Kotilingala gate in 5-minute batches.', source: 'CCTV' },
  { type: 'object', severity: 'medium', zone: 'D', title: 'Unattended object — Zone D', desc: 'Sack near RTC bay 7, 6 min stationary', location: [960, 300], cams: ['D-04'], suggestion: 'Send nearest police to verify.', source: 'CCTV analytics' },
  { type: 'medical', severity: 'critical', zone: 'C', title: 'Medical emergency — Zone C', desc: 'Cardiac complaint, Gowthami Ghat lane', location: [800, 520], cams: ['C-02', 'C-03'], suggestion: 'Dispatch ALS ambulance from Medical camp C1; clear Ghat Approach lane.', source: 'Staff app SOS' },
  { type: 'traffic', severity: 'low', zone: 'B', title: 'Slow traffic — Zone B', desc: 'Bridge approach, avg speed 12 km/h', location: [120, 290], cams: ['B-03'], suggestion: 'Monitor; no action yet.', source: 'CCTV traffic' },
  { type: 'fire', severity: 'critical', zone: 'A', title: 'Smoke detected — Zone A', desc: 'Prasadam counter kitchen vent', location: [650, 300], cams: ['A-09', 'A-07'], suggestion: 'Alert fire tender at Station Rd; evacuate counter queue.', source: 'CCTV smoke model' },
  { type: 'lost', severity: 'medium', zone: 'C', title: 'Lost person report — Zone C', desc: 'Elderly man, white dhoti, hearing impaired', location: [900, 560], cams: ['C-05'], suggestion: 'Share description with Zone C marshals.', source: 'Lost & found' },
];

/* -------------------------------------------------------------- KPIs */
function series(n, base, amp, noise, trend = 0, r = R) {
  return Array.from({ length: n }, (_, i) => Math.max(0, base + Math.sin(i / 3.2) * amp + (r() - 0.5) * noise + trend * i));
}
export const KPIS = [
  { id: 'pilgrims', label: 'Pilgrims today', value: 42847, unit: 'checked in', trend: 12, good: 'up', spark: series(24, 30000, 4000, 2500, 520), period: '24 h', icon: 'users', freq: 30 },
  { id: 'crowd', label: 'Current crowd', value: 18240, unit: 'on site', trend: 6, good: 'neutral', spark: series(24, 15000, 2600, 1200, 110), period: '6 h', icon: 'activity', freq: 10 },
  { id: 'incidents', label: 'Incidents open', value: 0, unit: 'active', trend: 2, good: 'down', spark: series(24, 5, 2, 2), period: '12 h', icon: 'alert-triangle', freq: 0 },
  { id: 'staff', label: 'Staff deployed', value: 86, unit: 'checked in', trend: 4, good: 'up', spark: series(24, 78, 4, 3, 0.3), period: '12 h', icon: 'user', freq: 60 },
  { id: 'response', label: 'Avg response', value: 4.2, unit: 'min, dispatch → arrival', trend: -8, good: 'down', spark: series(24, 5, 0.6, 0.5, -0.04), period: '24 h', icon: 'clock', freq: 300, decimals: 1 },
  { id: 'water', label: 'Water quality', value: 72, unit: 'WQI · good', trend: -3, good: 'up', spark: series(24, 76, 3, 2, -0.15), period: '24 h', icon: 'droplet', freq: 300 },
];

/* ------------------------------------------------------- Analytics */
export function crowdSeries(hours, zoneId, end = Date.now()) {
  const r = rng(zoneId.charCodeAt(0) * 97 + hours);
  const cap = ZONES.find((z) => z.id === zoneId).capacity;
  const step = hours <= 1 ? 2 : hours <= 6 ? 10 : hours <= 24 ? 30 : 180; // minutes
  const n = Math.floor((hours * 60) / step) + 1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * step * 60000;
    const d = new Date(t);
    const h = (d.getUTCHours() + 5.5 + d.getUTCMinutes() / 60) % 24; // IST hour
    const morning = Math.exp(-((h - 6.5) ** 2) / 3.5);
    const evening = Math.exp(-((h - 18) ** 2) / 5) * 0.7;
    const night = 0.12;
    const v = cap * (night + morning * 0.78 + evening * 0.55) * (0.92 + r() * 0.12) * (zoneId === 'A' ? 1.12 : 1);
    pts.push({ t, v: Math.round(v) });
  }
  return pts;
}

export const RESPONSE_BUCKETS = ['0–2', '2–4', '4–6', '6–8', '8–10', '10+'];
export const RESPONSE_DIST = {
  critical: [9, 21, 8, 3, 1, 0],
  high: [4, 18, 17, 7, 2, 1],
  medium: [2, 9, 16, 12, 6, 3],
  low: [0, 3, 8, 10, 7, 6],
};
export const RESPONSE_BY_ZONE = {
  A: [6, 18, 16, 9, 4, 2], B: [4, 14, 13, 8, 4, 3], C: [3, 10, 9, 8, 5, 3], D: [2, 9, 11, 7, 3, 2],
};

export const ZONE_METRICS = [
  { zone: 'A', crowd: 6840, peak: 12620, density: 0.86, incidents: 14, open: 3, response: 3.6, staff: 26, cams: '45/46', water: 58 },
  { zone: 'B', crowd: 4920, peak: 9810, density: 0.64, incidents: 11, open: 3, response: 4.1, staff: 22, cams: '39/40', water: 81 },
  { zone: 'C', crowd: 2610, peak: 6140, density: 0.41, incidents: 6, open: 2, response: 4.9, staff: 17, cams: '31/31', water: 74 },
  { zone: 'D', crowd: 3870, peak: 11280, density: 0.58, incidents: 9, open: 2, response: 4.4, staff: 21, cams: '41/42', water: null },
];
