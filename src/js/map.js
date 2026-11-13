// GIS map (brief §5.4). Offline SVG cartography of the Rajamahendravaram
// riverfront standing in for Mapbox GL until the tile package is provisioned.
import { ZONES, BANK, FAR_BANK, ISLAND, PRIVACY_ZONES, ROADS, BRIDGE, BRIDGE2, CAMERAS, FACILITIES, FACILITY_STYLE, WATER_SENSORS, RADAR_FLOW, ROLE_COLOURS, wqi, rng, pointInPoly } from './data.js';
import { state, subscribe, openAlerts, touch, presetCams } from './store.js';
import { smoothPath, polyPath, heatColour, esc, toMetres, densityLabel, num, $ } from './util.js';
import { icon } from './icons.js';
import { registerFeed } from './camera-sim.js';
import { createMap3D } from './map3d.js';

const VB = { w: 1200, h: 720 };
const UNIT_M = 4.2; // metres per map unit

/* ------------------------------------------------------------ base art */
let blocksCache = null;
function blocks() {
  if (blocksCache) return blocksCache;
  const r = rng(77);
  const out = [];
  for (let i = 0; i < 520; i++) {
    const x = r() * VB.w, y = r() * VB.h;
    const z = ZONES.find((zz) => pointInPoly([x, y], zz.poly));
    if (!z) continue;
    if (PRIVACY_ZONES.some((p) => pointInPoly([x, y], p.poly))) continue;
    const nearRoad = ROADS.some((rd) => rd.pts.some((p) => Math.hypot(p[0] - x, p[1] - y) < 14));
    if (nearRoad) continue;
    const w = 8 + r() * 22, h = 6 + r() * 16;
    if (!pointInPoly([x + w, y + h], z.poly)) continue;
    out.push({ x, y, w, h });
  }
  blocksCache = out;
  return out;
}

export function riverPath() {
  const bank = smoothPath(BANK);
  const far = smoothPath([...FAR_BANK].reverse()).replace(/^M/, 'L');
  return `M-700,236 L0,262 ${bank.replace(/^M/, 'L')} L1100,${VB.h + 700} L380,${VB.h + 700} L420,${VB.h} ${far} L-700,590 Z`;
}

function roadsSVG(minor = true) {
  const list = ROADS.filter((r) => r.major || minor);
  const casing = list.map((r) => `<path d="${smoothPath(r.pts)}" class="m-road-casing ${r.major ? 'is-major' : ''}"/>`).join('');
  const fill = list.map((r) => `<path d="${smoothPath(r.pts)}" class="m-road ${r.major ? 'is-major' : ''}"/>`).join('');
  return casing + fill;
}

/** Static base layers — reused by the full map and alert mini-maps. */
export function baseSVG({ labels = true, minorRoads = true } = {}) {
  const b = blocks().map((k) => `<rect x="${k.x.toFixed(0)}" y="${k.y.toFixed(0)}" width="${k.w.toFixed(0)}" height="${k.h.toFixed(0)}" rx="1.5"/>`).join('');
  const bridge = (br, cls) => `<line x1="${br.a[0]}" y1="${br.a[1]}" x2="${br.b[0]}" y2="${br.b[1]}" class="${cls}-casing"/><line x1="${br.a[0]}" y1="${br.a[1]}" x2="${br.b[0]}" y2="${br.b[1]}" class="${cls}"/>`;
  const ghatSteps = PRIVACY_ZONES.map((pz) => `<path d="${polyPath(pz.steps)}" class="m-steps"/>`).join('');
  return `
    <rect x="-800" y="-800" width="${VB.w + 1600}" height="${VB.h + 1600}" class="m-land"/>
    <path d="M-800,${VB.h + 800} L-800,592 L0,600 ${smoothPath(FAR_BANK).replace(/^M/, 'L')} L380,${VB.h + 800} Z" class="m-park"/>
    <g class="m-blocks">${b}</g>
    <path d="${riverPath()}" class="m-water"/>
    <path d="${smoothPath(BANK)}" class="m-bank"/>
    <path d="${smoothPath(ISLAND, true)}" class="m-sand"/>
    ${ghatSteps}
    ${roadsSVG(minorRoads)}
    ${bridge(BRIDGE2, 'm-bridge')}${bridge(BRIDGE, 'm-bridge')}
    ${labels ? `
      <text x="520" y="610" class="m-label m-label--water" transform="rotate(27 520 610)">Godavari</text>
      <text x="300" y="503" class="m-label m-label--small">Lanka island</text>
      <text x="150" y="680" class="m-label">Kovvur bank</text>
      <text x="1080" y="70" class="m-label">Rajamahendravaram</text>
      <text x="70" y="445" class="m-label m-label--small" transform="rotate(-80 70 445)">Rail-cum-Road Bridge</text>
      <text x="935" y="140" class="m-label m-label--small">NH-216A</text>
      <text x="1070" y="505" class="m-label m-label--small" transform="rotate(27 1070 505)">Main Road</text>` : ''}
  `;
}

/* ------------------------------------------------------------ controller */
const LAYERS = [
  ['cctv', 'CCTV density'], ['radar', 'Radar density'], ['staff', 'Staff'], ['facilities', 'Facilities'],
  ['zones', 'Zones'], ['traffic', 'Traffic'], ['water', 'Water'], ['privacy', 'Privacy zones'],
];

export function createMap(root, { compact = false } = {}) {
  root.classList.add('gis', compact ? 'gis--compact' : 'gis--full');
  root.innerHTML = `
    <svg class="gis__svg" viewBox="0 0 ${VB.w} ${VB.h}" role="img" aria-label="GIS map of the four Pushkaralu zones along the Godavari, with crowd density, staff and facilities" tabindex="0">
      <defs>
        ${['#22C55E', '#EAB308', '#F97316', '#EF4444'].map((c, i) => `
        <radialGradient id="heat${i}-${compact ? 'c' : 'f'}"><stop offset="0" stop-color="${c}" stop-opacity=".5"/><stop offset=".5" stop-color="${c}" stop-opacity=".18"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('')}
        <marker id="arrow-${compact ? 'c' : 'f'}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="currentColor"/></marker>
        <pattern id="radar-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#8B5CF6" stroke-opacity=".18" stroke-width="2"/></pattern>
      </defs>
      <g class="gis__world">
        <g class="l-base">${baseSVG()}</g>
        <g class="l-zones"></g>
        <g class="l-cctv"></g>
        <g class="l-traffic"></g>
        <g class="l-radar"></g>
        <g class="l-privacy"></g>
        <g class="l-water"></g>
        <g class="l-facilities"></g>
        <g class="l-cams"></g>
        <g class="l-staff"></g>
        <g class="l-alerts"></g>
        <g class="l-pins"></g>
        <rect class="l-select" hidden/>
      </g>
    </svg>
    <div class="gis__map3d" aria-label="3D map of the Pushkaralu riverfront" hidden></div>
    <div class="gis__3d-status" role="status" hidden></div>
    <div class="gis__layers" role="group" aria-label="Map layers">
      ${compact ? '' : `<span class="gis__layers-label">${icon('layers', 16)}</span>`}
      ${LAYERS.map(([k, l]) => `<button class="chip chip--sm ${compact && !['cctv', 'radar', 'staff', 'privacy'].includes(k) ? 'is-optional' : ''}" data-layer="${k}" aria-pressed="false">${l}</button>`).join('')}
    </div>
    <button class="gis__compass" aria-label="Reset bearing and fit all zones" title="Fit all zones">${icon('navigation', 18)}<span>N</span></button>
    <div class="gis__view3d" role="group" aria-label="Map view">
      <button class="gis__btn3d" data-act="map3d" aria-pressed="false" title="3D map with real streets and buildings (needs internet)">3D</button>
      <button class="gis__orbit" data-act="orbit" aria-pressed="false" aria-label="Orbit the view" title="Slowly orbit the view" hidden>${icon('refresh', 16)}</button>
    </div>
    <div class="gis__zoom" role="group" aria-label="Zoom">
      <button aria-label="Zoom in" data-zoom="in">${icon('plus', 18)}</button>
      <button aria-label="Zoom out" data-zoom="out">${icon('minus', 18)}</button>
    </div>
    <div class="gis__legend" aria-hidden="true">
      <div class="gis__ramp"><span>0</span><i></i><span>100%</span></div>
      <div class="gis__legend-row"><b class="sw sw--radar"></b>Radar only — no visual capture</div>
      <div class="gis__scale"><i></i><span>200 m</span></div>
    </div>
    <div class="gis__popups"></div>
    <aside class="gis__sheet" aria-label="Zone details" hidden></aside>
    ${compact ? '<button class="gis__expand btn btn--ghost btn--sm" data-act="map-full" title="Map focus (Space)">' + icon('maximize-2', 16) + 'Map focus</button>' : ''}
  `;

  const svg = $('.gis__svg', root);
  const world = $('.gis__world', root);
  const popups = $('.gis__popups', root);
  const sheet = $('.gis__sheet', root);
  const sfx = compact ? 'c' : 'f';
  const vb = { x: 0, y: 0, w: VB.w, h: VB.h };
  let unsubFeed = null;

  const applyVB = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    // scale bar: 200 m in px
    const pxPerUnit = svg.clientWidth / vb.w || 1;
    const px = (200 / UNIT_M) * pxPerUnit;
    const bar = $('.gis__scale i', root);
    if (bar) bar.style.width = `${Math.max(24, Math.min(160, px))}px`;
    root.style.setProperty('--zoom', (VB.w / vb.w).toFixed(2));
    positionPopups();
  };
  const fit = () => {
    const cw = svg.clientWidth || VB.w, ch = svg.clientHeight || VB.h;
    const ar = cw / ch;
    // cover the panel: no letterboxing; centre on the riverfront
    if (ar > VB.w / VB.h) Object.assign(vb, { w: VB.w, h: VB.w / ar, x: 0 });
    else Object.assign(vb, { h: VB.h, w: VB.h * ar, y: 0 });
    if (ar > VB.w / VB.h) vb.y = Math.max(0, Math.min(VB.h - vb.h, 420 - vb.h / 2));
    else vb.x = Math.max(-200, Math.min(VB.w - vb.w + 200, 560 - vb.w / 2));
    applyVB();
  };
  const aspect = () => (svg.clientHeight || VB.h) / (svg.clientWidth || VB.w);
  const zoomAt = (factor, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    const nw = Math.min(VB.w * 1.4, Math.max(VB.w / 7, vb.w / factor));
    const nh = nw * aspect();
    vb.x = cx - ((cx - vb.x) * nw) / vb.w;
    vb.y = cy - ((cy - vb.y) * nh) / vb.h;
    vb.w = nw; vb.h = nh;
    applyVB();
  };
  const toWorld = (clientX, clientY) => {
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  };
  const toScreen = ([x, y]) => {
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    const p = pt.matrixTransform(svg.getScreenCTM());
    const r = root.getBoundingClientRect();
    return [p.x - r.left, p.y - r.top];
  };

  /* ----- dynamic layers ----- */
  function drawZones() {
    const filt = state.zones;
    $('.l-zones', root).innerHTML = ZONES.map((z) => {
      const dim = filt.length && !filt.includes(z.id);
      const crit = state.emergency?.zone === z.id;
      return `<g class="m-zone ${dim ? 'is-dim' : ''} ${crit ? 'is-emergency' : ''}" data-zone="${z.id}" tabindex="-1">
        <path d="${polyPath(z.poly)}" class="m-zone__area"/>
        <g class="m-zone__tag" transform="translate(${z.label[0]} ${z.label[1]})">
          <rect x="-58" y="-13" width="116" height="26" rx="13"/>
          <text x="0" y="4" text-anchor="middle"><tspan class="b">${z.name}</tspan> · ${esc(z.area)}</text>
        </g>
      </g>`;
    }).join('');
  }

  function drawCCTV() {
    $('.l-cctv', root).innerHTML = CAMERAS.filter((c) => c.status !== 'offline').map((c) => {
      const d = c.density;
      const i = d < 0.3 ? 0 : d < 0.6 ? 1 : d < 0.85 ? 2 : 3;
      return `<circle cx="${c.pos[0].toFixed(0)}" cy="${c.pos[1].toFixed(0)}" r="${(12 + d * 22).toFixed(0)}" fill="url(#heat${i}-${sfx})"/>`;
    }).join('');
  }

  function drawCams() {
    const inPreset = new Set(presetCams());
    $('.l-cams', root).innerHTML = CAMERAS.map((c) => `<g class="m-cam is-${c.status} ${inPreset.has(c.id) ? 'is-preset' : ''}" data-cam="${c.id}" transform="translate(${c.pos[0].toFixed(1)} ${c.pos[1].toFixed(1)})"><rect x="-3.5" y="-3.5" width="7" height="7" rx="1.5"/></g>`).join('');
  }

  function drawRadar() {
    $('.l-radar', root).innerHTML = PRIVACY_ZONES.map((pz) => {
      const rf = RADAR_FLOW.find((r) => r.zoneId === pz.id);
      const [cx, cy] = pz.centre;
      const a = (pz.angle * Math.PI) / 180;
      const dir = rf.flow === 'in' ? 1 : -1;
      const arrows = [-0.28, 0, 0.28].map((k) => {
        const len = Math.hypot(pz.b[0] - pz.a[0], pz.b[1] - pz.a[1]);
        const px = cx + Math.cos(a) * len * k, py = cy + Math.sin(a) * len * k;
        // flow perpendicular to bank: into water (in) or towards land (out)
        const nx = Math.sin(a) * dir * -1, ny = -Math.cos(a) * dir * -1;
        return `<line x1="${(px - nx * 9).toFixed(1)}" y1="${(py - ny * 9).toFixed(1)}" x2="${(px + nx * 9).toFixed(1)}" y2="${(py + ny * 9).toFixed(1)}" marker-end="url(#arrow-${sfx})"/>`;
      }).join('');
      return `<g class="m-radar" data-pz="${pz.id}">
        <path d="${polyPath(pz.poly)}" class="m-radar__tint" style="--d:${rf.density}"/>
        <g class="m-radar__flow">${arrows}</g>
        <g class="m-radar__count" transform="translate(${(cx - Math.sin(a) * 52).toFixed(0)} ${(cy + Math.cos(a) * 52).toFixed(0)})">
          <rect x="-34" y="-11" width="68" height="20" rx="4"/>
          <text y="3" text-anchor="middle">${num(rf.count)} · ${Math.round(rf.density * 100)}%</text>
        </g>
      </g>`;
    }).join('');
  }

  function drawPrivacy() {
    $('.l-privacy', root).innerHTML = PRIVACY_ZONES.map((pz) => {
      const [cx, cy] = pz.centre;
      return `<g class="m-privacy" data-pz="${pz.id}">
        <path d="${polyPath(pz.poly)}" class="m-privacy__area"/>
        <g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)})" class="m-privacy__badge">
          <circle r="10"/>
          <g transform="translate(-7 -7) scale(.58)">${icon('shield', 24).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
        </g>
        ${pz.id === 'PZ-A1' || pz.id === 'PZ-B1' || pz.id === 'PZ-C1' ? `<text class="m-privacy__label" text-anchor="middle" transform="translate(${(cx - Math.sin((pz.angle * Math.PI) / 180) * 30).toFixed(0)} ${(cy + Math.cos((pz.angle * Math.PI) / 180) * 30 + 3).toFixed(0)}) rotate(${pz.angle.toFixed(1)})">Radar only — no visual capture</text>` : ''}
      </g>`;
    }).join('');
  }

  function drawStaff() {
    $('.l-staff', root).innerHTML = state.staff.filter((s) => s.status !== 'off').map((s) => {
      const ini = s.name.split(' ').map((p) => p[0]).join('').slice(0, 2);
      return `<g class="m-staff is-${s.status}" data-staff="${s.id}" transform="translate(${s.pos[0].toFixed(1)} ${s.pos[1].toFixed(1)})" style="--role:${ROLE_COLOURS[s.role]}">
        <circle r="9" class="m-staff__dot"/><text y="3" text-anchor="middle">${ini}</text>
        <text y="22" text-anchor="middle" class="m-staff__name">${esc(s.name)}</text>
      </g>`;
    }).join('');
  }

  function drawFacilities() {
    $('.l-facilities', root).innerHTML = FACILITIES.map((f) => {
      const st = FACILITY_STYLE[f.type];
      return `<g class="m-fac is-${f.status}" data-fac="${f.id}" transform="translate(${f.pos[0]} ${f.pos[1]})" style="--fc:${st.colour}">
        <rect x="-8" y="-8" width="16" height="16" rx="4"/>
        <g transform="translate(-5.5 -5.5) scale(.46)" class="m-fac__ic">${icon(st.icon, 24).replace(/<svg[^>]*>|<\/svg>/g, '')}</g>
      </g>`;
    }).join('');
  }

  function drawTraffic() {
    const lvl = { 'r-main': 'jam', 'r-stn': 'slow', 'r-ghat': 'slow', 'r-bund': 'free', 'r-nh': 'free', 'r-kot': 'slow', 'r-inner': 'free' };
    $('.l-traffic', root).innerHTML = ROADS.map((r) => `<path d="${smoothPath(r.pts)}" class="m-flow is-${lvl[r.id] || 'free'}"/>`).join('');
  }

  function drawWater() {
    $('.l-water', root).innerHTML = WATER_SENSORS.map((s) => {
      const q = wqi(s);
      const c = q >= 70 ? '#059669' : q >= 50 ? '#D97706' : '#DC2626';
      return `<g class="m-wq" data-ws="${s.id}" transform="translate(${s.pos[0]} ${s.pos[1]})" style="--wq:${c}">
        <path d="M0,-11 C4,-5 7,-2 7,2 A7,7 0 0 1 -7,2 C-7,-2 -4,-5 0,-11Z"/><text y="16" text-anchor="middle">${q}</text>
      </g>`;
    }).join('');
  }

  function drawAlerts() {
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const list = openAlerts().filter((a) => a.location).sort((a, b) => sevOrder[b.severity] - sevOrder[a.severity]);
    $('.l-alerts', root).innerHTML = list.map((a) => `
      <g class="m-alert sev-${a.severity} ${a.id === state.selectedAlert ? 'is-selected' : ''} ${a.state === 'dispatched' ? 'is-dispatched' : ''}" data-alert="${a.id}" transform="translate(${a.location[0]} ${a.location[1]})">
        ${a.severity === 'critical' && a.state === 'unread' ? '<circle r="10" class="m-alert__ring"/>' : ''}
        <path d="M0,-2 C0,-2 -8,-10 -8,-16 A8,8 0 1 1 8,-16 C8,-10 0,-2 0,-2Z" class="m-alert__pin"/>
        <circle cy="-16" r="3" class="m-alert__dot"/>
      </g>`).join('');
  }

  function applyLayers() {
    for (const [k] of LAYERS) {
      const on = !!state.mapLayers[k];
      root.classList.toggle(`hide-${k}`, !on);
      const b = root.querySelector(`[data-layer="${k}"]`);
      if (b) { b.setAttribute('aria-pressed', String(on)); b.classList.toggle('is-active', on); }
    }
  }

  /* ----- popups ----- */
  let popup = null; // { el, at:[x,y] }
  function closePopup() {
    popup?.el.remove(); popup = null;
    unsubFeed?.(); unsubFeed = null;
  }
  function positionPopups() {
    if (!popup) return;
    const [x, y] = toScreen(popup.at);
    const r = root.getBoundingClientRect();
    const el = popup.el;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = x - w / 2, top = y - h - 14;
    if (top < 8) top = y + 14;
    left = Math.max(8, Math.min(r.width - w - 8, left));
    el.style.left = `${left}px`; el.style.top = `${top}px`;
  }
  function openPopup(at, html, cls = '') {
    closePopup();
    const el = document.createElement('div');
    el.className = `popover ${cls}`;
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<button class="popover__close btn-icon btn-icon--sm" aria-label="Close" data-act="close-pop">${icon('x', 16)}</button>${html}`;
    popups.appendChild(el);
    popup = { el, at };
    positionPopups();
    return el;
  }

  function camPopup(cam) {
    const el = openPopup(cam.pos, `
      <div class="pop-cam">
        <div class="pop-cam__feed cam-mini" data-status="${cam.status}">${cam.status === 'offline' ? `<div class="cam-mini__off">${icon('camera-off', 20)}<span>Offline</span></div>` : '<canvas></canvas>'}</div>
        <div class="pop-cam__meta"><span class="t-h3">${cam.name}</span><span class="t-caption muted">${esc(cam.place)} · Zone ${cam.zone}</span></div>
        <button class="btn btn--secondary btn--sm" data-act="open-cam" data-cam="${cam.id}">${icon('maximize-2', 16)}Open full view</button>
      </div>`, 'popover--cam');
    const cv = el.querySelector('canvas');
    if (cv) unsubFeed = registerFeed(cv, cam, { boxes: true });
  }

  function staffPopup(s) {
    openPopup(s.pos, `
      <div class="pop-staff">
        <div class="pop-staff__head"><span class="avatar" style="--role:${ROLE_COLOURS[s.role]}">${s.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
        <div><div class="t-h3">${esc(s.name)}</div><div class="t-caption muted">${s.role} · Zone ${s.zone}</div></div></div>
        <dl class="kv"><dt>Status</dt><dd><span class="status-dot status-dot--${s.status === 'available' ? 'ok' : 'warn'}" aria-hidden="true"></span>${s.status === 'available' ? 'Available' : 'On task'}</dd>
        <dt>Current task</dt><dd>${esc(s.task || 'None')}</dd><dt>Radio</dt><dd class="t-mono">CH-${s.zone}${s.id.slice(-2)}</dd></dl>
        <div class="row gap-2"><button class="btn btn--secondary btn--sm" data-act="call-staff" data-staff="${s.id}">${icon('phone-call', 16)}Call</button>
        <button class="btn btn--primary btn--sm" data-act="dispatch-staff" data-staff="${s.id}">${icon('send', 16)}Assign task</button></div>
      </div>`);
  }

  function facPopup(f) {
    const st = FACILITY_STYLE[f.type];
    openPopup(f.pos, `
      <div class="pop-fac">
        <div class="t-h3">${esc(f.name)}</div>
        <div class="t-caption muted">${st.label} · ${f.id}</div>
        <dl class="kv"><dt>Status</dt><dd><span class="status-dot status-dot--${f.status === 'operational' ? 'ok' : 'crit'}" aria-hidden="true"></span>${f.status === 'operational' ? 'Operational' : 'Down — maintenance raised'}</dd>
        ${f.status === 'operational' ? `<dt>Queue</dt><dd>${f.queue} people · ~${Math.max(1, Math.round(f.queue * 0.7))} min wait</dd>` : ''}</dl>
      </div>`);
  }

  function wqPopup(s) {
    const q = wqi(s);
    openPopup(s.pos, `<div class="pop-fac"><div class="t-h3">${esc(s.name)}</div><div class="t-caption muted">LoRaWAN ${s.id} · updated 5 min ago</div>
      <dl class="kv"><dt>WQI</dt><dd><b>${q}</b> ${q >= 70 ? 'Good' : q >= 50 ? 'Fair' : 'Poor'}</dd><dt>pH</dt><dd class="t-mono">${s.ph}</dd><dt>Turbidity</dt><dd class="t-mono">${s.turbidity} NTU</dd><dt>Dissolved O₂</dt><dd class="t-mono">${s.do} mg/L</dd><dt>Conductivity</dt><dd class="t-mono">${s.conductivity} µS/cm</dd></dl></div>`);
  }

  function radarPopup(pz) {
    const rf = RADAR_FLOW.find((r) => r.zoneId === pz.id);
    openPopup(pz.centre, `<div class="pop-fac"><div class="row gap-2"><span class="badge badge--radar">${icon('shield', 14)}Privacy zone — radar only</span></div>
      <div class="t-h3" style="margin-top:8px">${esc(pz.name)}</div>
      <dl class="kv"><dt>Crowd count</dt><dd><b>${num(rf.count)}</b></dd><dt>Density</dt><dd>${Math.round(rf.density * 100)}% · ${densityLabel(rf.density)}</dd><dt>Net flow</dt><dd>${rf.flow === 'in' ? 'Into bathing area' : 'Leaving bathing area'}</dd><dt>Radar units</dt><dd>${pz.radars} active</dd></dl>
      <p class="t-caption muted">No camera covers this area. Counts come from mmWave radar clustering only.</p></div>`);
  }

  function contextMenu(at) {
    const near = CAMERAS.filter((c) => Math.hypot(c.pos[0] - at[0], c.pos[1] - at[1]) < 60).slice(0, 9);
    const el = openPopup(at, `
      <div class="menu" role="menu">
        <div class="menu__label t-mono">${at[0].toFixed(0)}, ${at[1].toFixed(0)}</div>
        <button role="menuitem" data-act="dispatch-here">${icon('send', 16)}Dispatch to here</button>
        <button role="menuitem" data-act="cams-near" ${near.length ? '' : 'disabled'}>${icon('camera', 16)}View cameras nearby (${near.length})</button>
        <button role="menuitem" data-act="waypoint">${icon('map-pin', 16)}Set waypoint</button>
      </div>`, 'popover--menu');
    el.dataset.near = near.map((c) => c.id).join(',');
    el.dataset.at = at.join(',');
    el.querySelector('[role=menuitem]')?.focus();
  }

  function zoneSheet(z) {
    if (!z) { sheet.hidden = true; root.classList.remove('has-sheet'); return; }
    const cams = CAMERAS.filter((c) => c.zone === z.id);
    const staff = state.staff.filter((s) => s.zone === z.id);
    const alerts = openAlerts().filter((a) => a.zone === z.id);
    const pz = PRIVACY_ZONES.filter((p) => p.zone === z.id);
    const radarCount = RADAR_FLOW.filter((r) => pz.some((p) => p.id === r.zoneId)).reduce((s, r) => s + r.count, 0);
    const camCrowd = Math.round(cams.reduce((s, c) => s + c.density * 60, 0));
    const crowd = camCrowd + radarCount;
    const dens = Math.min(0.99, crowd / z.capacity);
    sheet.innerHTML = `
      <header class="sheet__head">
        <div><div class="t-h2">${z.name} · ${esc(z.area)}</div><div class="t-caption muted">${z.bathing ? 'Bathing zone — ghat area is radar only' : 'Transit zone'}</div></div>
        <button class="btn-icon" data-act="close-sheet" aria-label="Close zone details">${icon('x', 20)}</button>
      </header>
      <div class="sheet__stats">
        <div><span class="t-caption-strong lbl">Crowd</span><span class="t-h1">${num(crowd)}</span></div>
        <div><span class="t-caption-strong lbl">Density</span><span class="t-h1" style="color:${heatColour(dens)}">${Math.round(dens * 100)}%</span></div>
        <div><span class="t-caption-strong lbl">Open alerts</span><span class="t-h1">${alerts.length}</span></div>
        <div><span class="t-caption-strong lbl">Staff</span><span class="t-h1">${staff.filter((s) => s.status !== 'off').length}</span></div>
      </div>
      ${pz.length ? `<div class="sheet__privacy">${icon('shield', 16)}<span>${pz.length} bathing area${pz.length > 1 ? 's' : ''} monitored by ${pz.reduce((s, p) => s + p.radars, 0)} radar units · ${num(radarCount)} people</span></div>` : ''}
      <h3 class="t-h3 sheet__sub">Cameras <span class="muted t-caption">${cams.filter((c) => c.status !== 'offline').length}/${cams.length} online</span></h3>
      <ul class="sheet__cams">${cams.slice(0, 12).map((c) => `<li><button data-act="open-cam" data-cam="${c.id}" class="sheet__cam is-${c.status}"><span class="status-dot status-dot--${c.status === 'streaming' ? 'ok' : c.status === 'degraded' ? 'warn' : 'crit'}"></span><span class="t-mono">${c.id}</span><span class="t-caption ellipsis">${esc(c.place)}</span></button></li>`).join('')}</ul>
      <button class="btn btn--ghost btn--sm" data-act="zone-preset" data-zone="${z.id}">Show all ${cams.length} cameras in grid</button>
      <h3 class="t-h3 sheet__sub">Staff on duty</h3>
      <ul class="sheet__staff">${staff.map((s) => `<li><span class="status-dot status-dot--${s.status === 'available' ? 'ok' : s.status === 'on-task' ? 'warn' : 'off'}"></span><span>${esc(s.name)}</span><span class="t-caption muted">${s.role}</span></li>`).join('')}</ul>
    `;
    sheet.hidden = false;
    root.classList.add('has-sheet');
    sheet.querySelector('button')?.focus({ preventScroll: true });
  }

  /* ----- interactions ----- */
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const w0 = toWorld(e.clientX, e.clientY);
    drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false, select: e.shiftKey, w0 };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.select) {
      const w1 = toWorld(e.clientX, e.clientY);
      const r = $('.l-select', root);
      r.hidden = false;
      r.setAttribute('x', Math.min(drag.w0[0], w1[0])); r.setAttribute('y', Math.min(drag.w0[1], w1[1]));
      r.setAttribute('width', Math.abs(w1[0] - drag.w0[0])); r.setAttribute('height', Math.abs(w1[1] - drag.w0[1]));
      drag.w1 = w1;
      return;
    }
    const k = drag.vb.w / svg.clientWidth;
    vb.x = drag.vb.x - dx * k; vb.y = drag.vb.y - dy * k;
    root.classList.add('is-panning');
    applyVB();
  });
  svg.addEventListener('pointerup', (e) => {
    root.classList.remove('is-panning');
    const d = drag; drag = null;
    if (!d) return;
    if (d.select && d.w1) {
      $('.l-select', root).hidden = true;
      const [x0, x1] = [Math.min(d.w0[0], d.w1[0]), Math.max(d.w0[0], d.w1[0])];
      const [y0, y1] = [Math.min(d.w0[1], d.w1[1]), Math.max(d.w0[1], d.w1[1])];
      const ids = CAMERAS.filter((c) => c.pos[0] >= x0 && c.pos[0] <= x1 && c.pos[1] >= y0 && c.pos[1] <= y1).map((c) => c.id);
      root.dispatchEvent(new CustomEvent('gc:select-cams', { bubbles: true, detail: { ids } }));
      return;
    }
    if (d.moved) return;
    handleClick(e);
  });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [cx, cy] = toWorld(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, cx, cy);
  }, { passive: false });
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu(toWorld(e.clientX, e.clientY));
  });
  svg.addEventListener('keydown', (e) => {
    const step = vb.w * 0.08;
    const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (k) { e.preventDefault(); e.stopPropagation(); vb.x += k[0]; vb.y += k[1]; applyVB(); }
    if (e.key === '+' || e.key === '=') { e.stopPropagation(); zoomAt(1.25); }
    if (e.key === '-') { e.stopPropagation(); zoomAt(0.8); }
  });

  function handleClick(e) {
    const t = e.target.closest('[data-cam],[data-staff],[data-fac],[data-ws],[data-alert],[data-pz],[data-zone]');
    if (!t) { closePopup(); return; }
    if (t.dataset.cam) return camPopup(CAMERAS.find((c) => c.id === t.dataset.cam));
    if (t.dataset.staff) return staffPopup(state.staff.find((s) => s.id === t.dataset.staff));
    if (t.dataset.fac) return facPopup(FACILITIES.find((f) => f.id === t.dataset.fac));
    if (t.dataset.ws) return wqPopup(WATER_SENSORS.find((s) => s.id === t.dataset.ws));
    if (t.dataset.alert) {
      closePopup();
      root.dispatchEvent(new CustomEvent('gc:focus-alert', { bubbles: true, detail: { id: t.dataset.alert } }));
      return;
    }
    if (t.dataset.pz) return radarPopup(PRIVACY_ZONES.find((p) => p.id === t.dataset.pz));
    if (t.dataset.zone) { closePopup(); return zoneSheet(ZONES.find((z) => z.id === t.dataset.zone)); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.dataset.act === 'map3d') { toggle3D(); return; }
    if (b.dataset.act === 'orbit') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); m3?.setOrbit(on); return; }
    if (m3 && b.dataset.zoom) { b.dataset.zoom === 'in' ? m3.zoomIn() : m3.zoomOut(); return; }
    if (m3 && b.classList.contains('gis__compass')) { m3.reset(); return; }
    if (b.dataset.layer) {
      state.mapLayers[b.dataset.layer] = !state.mapLayers[b.dataset.layer];
      touch('mapLayers');
    } else if (b.dataset.zoom) zoomAt(b.dataset.zoom === 'in' ? 1.4 : 1 / 1.4);
    else if (b.classList.contains('gis__compass')) { userMoved = false; fit(); }
    else if (b.dataset.act === 'close-pop') closePopup();
    else if (b.dataset.act === 'close-sheet') zoneSheet(null);
    else if (b.dataset.act === 'cams-near') {
      const ids = b.closest('.popover').dataset.near.split(',').filter(Boolean);
      closePopup();
      root.dispatchEvent(new CustomEvent('gc:select-cams', { bubbles: true, detail: { ids } }));
    } else if (b.dataset.act === 'dispatch-here') {
      const at = b.closest('.popover').dataset.at.split(',').map(Number);
      closePopup();
      root.dispatchEvent(new CustomEvent('gc:dispatch-here', { bubbles: true, detail: { at } }));
    } else if (b.dataset.act === 'waypoint') {
      const at = b.closest('.popover').dataset.at.split(',').map(Number);
      closePopup();
      $('.l-pins', root).innerHTML = `<g class="m-waypoint" transform="translate(${at[0]} ${at[1]})"><circle r="6"/><circle r="14" class="ring"/></g>`;
      root.dispatchEvent(new CustomEvent('gc:toast', { bubbles: true, detail: { type: 'info', title: 'Waypoint set', desc: `Shared with staff app at map ref ${at.map((v) => v.toFixed(0)).join(', ')}.` } }));
    } else if (b.dataset.act === 'zone-preset') {
      zoneSheet(null);
      root.dispatchEvent(new CustomEvent('gc:select-cams', { bubbles: true, detail: { ids: CAMERAS.filter((c) => c.zone === b.dataset.zone).map((c) => c.id), name: `Zone ${b.dataset.zone} — all cameras` } }));
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (popup || !sheet.hidden) && root.offsetParent) {
      if (popup) closePopup(); else zoneSheet(null);
      e.stopImmediatePropagation();
    }
  }, true);

  let userMoved = false;
  svg.addEventListener('pointerdown', () => { userMoved = true; });
  svg.addEventListener('wheel', () => { userMoved = true; }, { passive: true });
  new ResizeObserver(() => { if (!userMoved) fit(); else { vb.h = vb.w * aspect(); applyVB(); } }).observe(root);

  /* ----- lifecycle ----- */
  drawZones(); drawCCTV(); drawCams(); drawRadar(); drawPrivacy(); drawStaff(); drawFacilities(); drawTraffic(); drawWater(); drawAlerts(); applyLayers();
  subscribe('mapLayers', applyLayers);
  subscribe(['alerts', 'selectedAlert'], drawAlerts);
  subscribe(['zones', 'emergency'], drawZones);
  subscribe('staff', drawStaff);
  subscribe(['cameras', 'preset', 'customGroup'], () => { drawCams(); drawCCTV(); });

  /* ----- 3D view (MapLibre, online) ----- */
  let m3 = null, m3Loading = false;
  const box3d = $('.gis__map3d', root), status3d = $('.gis__3d-status', root);
  const btn3d = $('.gis__btn3d', root), orbitBtn = $('.gis__orbit', root);
  function set3DUI(on) {
    root.classList.toggle('is-3d', on);
    box3d.hidden = !on;
    btn3d.setAttribute('aria-pressed', String(on));
    btn3d.classList.toggle('is-active', on);
    orbitBtn.hidden = !on;
    if (!on) orbitBtn.setAttribute('aria-pressed', 'false');
  }
  async function toggle3D(force) {
    const want = force ?? !m3;
    if (m3Loading) return;
    if (!want) {
      m3?.destroy(); m3 = null; set3DUI(false);
      try { localStorage.setItem('gc-map3d', '0'); } catch { /* storage off */ }
      return;
    }
    closePopup();
    m3Loading = true;
    set3DUI(true);
    status3d.hidden = false;
    status3d.textContent = 'Loading 3D map…';
    try {
      m3 = await createMap3D(box3d, {
        theme: state.theme,
        onAlert: (id) => root.dispatchEvent(new CustomEvent('gc:focus-alert', { bubbles: true, detail: { id } })),
        onCamera: (id) => window.__gc?.actions.openCam(id),
        onZone: (id) => zoneSheet(ZONES.find((z) => z.id === id)),
      });
      try { localStorage.setItem('gc-map3d', '1'); } catch { /* storage off */ }
    } catch (err) {
      set3DUI(false);
      box3d.innerHTML = '';
      try { localStorage.setItem('gc-map3d', '0'); } catch { /* storage off */ }
      if (force === undefined) root.dispatchEvent(new CustomEvent('gc:toast', { bubbles: true, detail: { type: 'warning', title: '3D map unavailable', desc: `${err?.message || err}. Showing the offline map.` } }));
    } finally {
      m3Loading = false;
      status3d.hidden = true;
    }
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => m3?.resize()).observe(root);
  try { if (localStorage.getItem('gc-map3d') === '1' && navigator.onLine !== false) toggle3D(true); } catch { /* storage off */ }

  return {
    toggle3D,
    get is3D() { return !!m3; },
    focusOn(at, zoom = 2.2) {
      if (m3) { m3.flyTo(at, 15 + zoom * 0.6); return; }
      userMoved = true;
      const nw = VB.w / zoom, nh = nw * aspect();
      Object.assign(vb, { x: at[0] - nw / 2, y: at[1] - nh / 2, w: nw, h: nh });
      applyVB();
    },
    fit() { userMoved = false; fit(); },
    openZone: (id) => zoneSheet(ZONES.find((z) => z.id === id)),
    closeAll() { closePopup(); zoneSheet(null); },
    redrawRadar: drawRadar,
  };
}

/** Mini-map for an expanded alert card: 100% × 120px, pin + 200 m radius. */
export function miniMap(at) {
  const w = 300, h = 120;
  const r200 = 200 / UNIT_M;
  return `<svg class="minimap" viewBox="${at[0] - w / 2} ${at[1] - h / 2} ${w} ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Incident location with 200 metre radius">
    ${baseSVG({ labels: false })}
    ${PRIVACY_ZONES.map((pz) => `<path d="${polyPath(pz.poly)}" class="m-privacy__area"/>`).join('')}
    <circle cx="${at[0]}" cy="${at[1]}" r="${r200}" class="minimap__radius"/>
    <g transform="translate(${at[0]} ${at[1]})"><path d="M0,-2 C0,-2 -7,-9 -7,-14 A7,7 0 1 1 7,-14 C7,-9 0,-2 0,-2Z" class="minimap__pin"/><circle cy="-14" r="2.6" fill="#fff"/></g>
  </svg>`;
}

export { toMetres };
