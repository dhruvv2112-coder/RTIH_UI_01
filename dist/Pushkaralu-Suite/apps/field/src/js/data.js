// Seed data for the interactive prototype. Shapes mirror Brief §11 types and §13 API payloads.
const MIN = 60_000;

export const STAFF = {
  id: 'STF-A-0117',
  name: 'Ramesh Kumar',
  initials: 'RK',
  role: 'Zone Marshal',
  zone: 'Zone A',
  shiftStart: '06:00',
  shiftEnd: '18:00',
  base: { tasks: 12, inspections: 4, reports: 3, shiftMinutes: 392, distanceKm: 4.2, avgResponse: 3.8 },
};

export const RESOURCES = {
  ghat3: [
    { kind: 'medical', label: 'Medical Post', dist: '200m NE' },
    { kind: 'toilet', label: 'Toilet Block', dist: '80m S' },
    { kind: 'kiosk', label: 'Info Kiosk', dist: '150m W' },
  ],
  stall47: [
    { kind: 'water', label: 'Drinking Water Point', dist: '40m E' },
    { kind: 'toilet', label: 'Toilet Block', dist: '120m N' },
    { kind: 'medical', label: 'First-Aid Booth', dist: '210m W' },
  ],
  wq03: [
    { kind: 'kiosk', label: 'Info Kiosk', dist: '60m S' },
    { kind: 'medical', label: 'Medical Post', dist: '230m NE' },
    { kind: 'toilet', label: 'Toilet Block', dist: '140m W' },
  ],
};

export function seedTasks(now = Date.now()) {
  return [
    {
      id: 'TSK-27-0412', kind: 'crowd', status: 'active', priority: 'urgent',
      title: 'Crowd Control — Ghat #3, Zone A', short: 'Crowd Threshold Breach',
      location: 'Ghat #3, Zone A', coords: '16.98912° N, 81.77874° E', pin: { x: 548, y: 410 },
      dispatchedAt: now - 4 * MIN, dispatchedBy: 'Command Centre', progress: 60,
      distance: 120, eta: 2,
      instructions: 'Redirect crowd to Ghat #4 via East Corridor. Coordinate with traffic staff at junction point. Use PA if available.',
      notes: [
        { t: now - 2 * MIN, text: 'Arrived on site' },
        { t: now - 0.5 * MIN, text: 'Crowd redirecting via East Corridor' },
      ],
      resources: RESOURCES.ghat3,
    },
    {
      id: 'TSK-27-0415', kind: 'inspection', status: 'incoming', priority: 'high',
      title: 'Vendor Inspection Due', subtitle: 'Stall #47, Zone B — Food Quality',
      location: 'Stall #47, Zone B', coords: '16.98741° N, 81.78102° E', pin: { x: 730, y: 520 },
      dispatchedAt: now - 6 * MIN, dueAt: now + 25 * MIN, dispatchedBy: 'Vendor Cell',
      distance: 340, eta: 5, vendorId: 'VND-2027-47',
      instructions: 'Scheduled food-quality inspection. Verify storage temperature, staff hygiene, waste handling and RFID payment compliance. Photograph any failed items.',
      notes: [], resources: RESOURCES.stall47,
    },
    {
      id: 'TSK-27-0416', kind: 'sensor', status: 'incoming', priority: 'normal', tone: 'info',
      title: 'Water Sensor Alert', subtitle: 'Sensor WQ-03, Zone A — pH Low',
      location: 'WQ-03, Ghat #2 inlet', coords: '16.98990° N, 81.77610° E', pin: { x: 420, y: 352 },
      dispatchedAt: now - 2 * MIN, dispatchedBy: 'S1 Sensor Grid',
      distance: 210, eta: 3,
      instructions: 'pH reading 6.1 (threshold 6.5). Visually inspect intake, check for runoff or blockage, and log observations. Do not enter water.',
      notes: [], resources: RESOURCES.wq03,
    },
    { id: 'TSK-27-0398', kind: 'traffic', status: 'completed', priority: 'normal', title: 'Traffic Control — Parking Lot B', location: 'Parking Lot B', completedAt: now - 45 * MIN, duration: 12, synced: true },
    { id: 'TSK-27-0391', kind: 'inspection', status: 'completed', priority: 'high', title: 'Vendor Inspection — Stall #12', location: 'Stall #12, Zone B', completedAt: now - 82 * MIN, duration: 18, synced: true },
    { id: 'TSK-27-0377', kind: 'crowd', status: 'completed', priority: 'urgent', title: 'Crowd Control — Ghat #1 Queue', location: 'Ghat #1, Zone A', completedAt: now - 128 * MIN, duration: 25, synced: true },
    { id: 'TSK-27-0362', kind: 'report', status: 'completed', priority: 'normal', title: 'Hazard Check — Railing, Ghat #2', location: 'Ghat #2, Zone A', completedAt: now - 186 * MIN, duration: 6, synced: true },
    { id: 'TSK-27-0350', kind: 'sensor', status: 'completed', priority: 'low', title: 'Water Sensor Check — WQ-01', location: 'WQ-01, Zone A', completedAt: now - 241 * MIN, duration: 9, synced: true },
  ];
}

export const DISPATCH_POOL = [
  {
    kind: 'crowd', priority: 'urgent', title: 'Crowd Threshold Breach', short: 'Crowd Threshold Breach',
    location: 'Zone A — Ghat #4', coords: '16.98860° N, 81.77990° E', pin: { x: 610, y: 450 },
    distance: 120, eta: 2, dispatchedBy: 'Command Centre',
    instructions: 'Radar zone R-4 reports 4,820 people (capacity 4,000). Hold inflow at the East Corridor barricade and open overflow lane to Ghat #5.',
    resources: RESOURCES.ghat3,
  },
  {
    kind: 'safety', priority: 'high', title: 'Lost Child — Reunification', short: 'Lost Child Reunification',
    location: 'Help Desk 2, Zone A', coords: '16.98955° N, 81.77702° E', pin: { x: 470, y: 300 },
    distance: 260, eta: 4, dispatchedBy: 'Help Desk Network',
    instructions: 'Child (approx. 7 yrs, blue kurta) reported near Ghat #2 steps. Escort to Help Desk 2 and confirm guardian ID before handover.',
    resources: RESOURCES.wq03,
  },
  {
    kind: 'medical', priority: 'urgent', title: 'Medical Assist — Heat Exhaustion', short: 'Medical Assist',
    location: 'Ghat #5 Steps, Zone A', coords: '16.98804° N, 81.78051° E', pin: { x: 680, y: 470 },
    distance: 180, eta: 3, dispatchedBy: 'Medical Command',
    instructions: 'Elderly pilgrim collapsed on steps. Clear a 3m perimeter, move to shade and await medical team (ETA 4 min). Do not give fluids if unconscious.',
    resources: RESOURCES.ghat3,
  },
];

export function seedNotifications(now = Date.now()) {
  return [
    { id: 'n1', type: 'urgent', title: 'Urgent Dispatch', body: 'Crowd breach — Zone A, Ghat #3', t: now - 4 * MIN, read: false },
    { id: 'n2', type: 'normal', title: 'New Task Assigned', body: 'Vendor inspection — Stall #47', t: now - 6 * MIN, read: false },
    { id: 'n3', type: 'update', title: 'Task Updated', body: 'Water Sensor Alert priority changed to Normal', t: now - 9 * MIN, read: false },
    { id: 'n4', type: 'shift', title: 'Shift Reminder', body: 'Hydration break due at 12:30 IST', t: now - 52 * MIN, read: true },
  ];
}

export const VENDOR = {
  id: 'VND-2027-47', stall: 'Stall #47', name: 'Sri Lakshmi Foods', nameTe: 'శ్రీ లక్ష్మి ఫుడ్స్',
  zone: 'Zone B', row: 'Row 3', license: 'VND-2027-47', category: 'Food — Cooked Meals',
  last: { ago: '3 days ago', grade: 'pass', by: 'S. Prasad' },
};

export const CHECKLIST = [
  { id: 'food', title: 'Food Safety', items: [
    { id: 'f1', label: 'Food stored at correct temp', state: 'pass' },
    { id: 'f2', label: 'Clean preparation surfaces', state: 'pass' },
    { id: 'f3', label: 'Staff wearing gloves/hairnets', state: null },
    { id: 'f4', label: 'Waste disposal properly managed', state: null },
  ] },
  { id: 'hyg', title: 'Hygiene', items: [
    { id: 'h1', label: 'Handwashing station available', state: 'pass' },
    { id: 'h2', label: 'Clean water source verified', state: null },
    { id: 'h3', label: 'Pest control measures in place', state: null },
  ] },
  { id: 'comp', title: 'Compliance', items: [
    { id: 'c1', label: 'License displayed', state: null },
    { id: 'c2', label: 'Price list visible', state: null },
    { id: 'c3', label: 'RFID payment accepted', state: null },
  ] },
];

export const REPORT_TYPES = [
  { id: 'incident', label: 'Incident', icon: 'alert-triangle' },
  { id: 'maintenance', label: 'Maint.', icon: 'wrench' },
  { id: 'crowd', label: 'Crowd', icon: 'users' },
  { id: 'water', label: 'Water', icon: 'droplet' },
  { id: 'vendor', label: 'Vendor', icon: 'store' },
  { id: 'safety', label: 'Safety', icon: 'hard-hat' },
  { id: 'medical', label: 'Medical', icon: 'heart-pulse' },
  { id: 'other', label: 'Other', icon: 'more-horizontal' },
];

export const KIND_META = {
  crowd: { icon: 'users', label: 'Crowd' },
  inspection: { icon: 'clipboard-check', label: 'Inspection' },
  sensor: { icon: 'droplet', label: 'Sensor' },
  traffic: { icon: 'car', label: 'Traffic' },
  report: { icon: 'file-text', label: 'Report' },
  safety: { icon: 'shield-alert', label: 'Safety' },
  medical: { icon: 'heart-pulse', label: 'Medical' },
};

export const FACILITY_META = {
  medical: { icon: 'cross', color: 'var(--color-status-critical)', tint: 'tint-urgent', label: 'Medical' },
  toilet: { icon: 'bath', color: 'var(--color-status-info)', tint: 'tint-info', label: 'Toilet' },
  kiosk: { icon: 'radio', color: 'var(--color-status-radar)', tint: 'tint-radar', label: 'Kiosk' },
  water: { icon: 'droplet', color: 'var(--color-status-normal)', tint: 'tint-normal', label: 'Vending / Water' },
  vending: { icon: 'shopping-cart', color: 'var(--color-status-normal)', tint: 'tint-normal', label: 'Vending' },
};

export const MAP_FACILITIES = [
  { kind: 'medical', x: 640, y: 300, name: 'Medical Post A2' },
  { kind: 'toilet', x: 530, y: 500, name: 'Toilet Block T7' },
  { kind: 'kiosk', x: 440, y: 420, name: 'Info Kiosk K3' },
  { kind: 'vending', x: 780, y: 430, name: 'Water ATM V2' },
  { kind: 'toilet', x: 300, y: 300, name: 'Toilet Block T5' },
  { kind: 'medical', x: 860, y: 560, name: 'Medical Post B1' },
  { kind: 'kiosk', x: 700, y: 610, name: 'Info Kiosk K5' },
];

export const RADAR_ZONES = [
  { id: 'R-3', label: 'Ghat #3 Bathing', count: 3612, cap: 4000, path: 'M488 330 L612 318 L626 382 L500 396 Z', cx: 557, cy: 356, flow: 'E' },
  { id: 'R-4', label: 'Ghat #4 Bathing', count: 4820, cap: 4000, path: 'M640 314 L760 302 L772 364 L652 378 Z', cx: 706, cy: 340, flow: 'SE' },
];
