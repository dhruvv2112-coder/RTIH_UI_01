// Command dashboard 3D view: the same live data as the 2D GIS map (zones,
// radar-only privacy areas, crowd density, alerts, staff, facilities) draped
// over real 3D buildings. Opens from the "3D" button on the full map.
import { state, subscribe } from './store.js';
import { ZONES, PRIVACY_ZONES, RADAR_FLOW, FACILITIES, ROLE_COLOURS, ALERT_TYPES } from './data.js';
import { toLngLat, CENTRE } from './geo.js';
import { mount3D, fc, polygon, point, ring, square, heat } from './map3d.js';
import { esc } from './util.js';

const ZONE_COLOURS = { A: '#2563EB', B: '#0F766E', C: '#7C3AED', D: '#B45309' };
const FAC_COLOURS = { medical: '#DC2626', toilet: '#0EA5E9', kiosk: '#2563EB', vending: '#0F766E' };

function data() {
  const zones = fc(ZONES.map((z) => polygon(ring(z.poly.map(toLngLat)), { label: `${z.name} · ${z.area}`, color: ZONE_COLOURS[z.id] })));
  const privacy = fc(PRIVACY_ZONES.map((p) => {
    const r = RADAR_FLOW.find((x) => x.zoneId === p.id);
    return polygon(ring(p.poly.map(toLngLat)), { label: 'Radar only', html: `<b>${esc(p.name)}</b>Radar only — no visual capture<br>${r ? `${r.count.toLocaleString('en-IN')} people · ${Math.round(r.density * 100)}% density` : ''}` });
  }));
  // crowd columns: a grid of radar cells across each bathing area, height ∝ density
  const crowd = [];
  PRIVACY_ZONES.forEach((p) => {
    const r = RADAR_FLOW.find((x) => x.zoneId === p.id);
    if (!r) return;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const at = [p.a[0] + (p.b[0] - p.a[0]) * t, p.a[1] + (p.b[1] - p.a[1]) * t];
      const wave = 0.75 + 0.35 * Math.sin(i * 1.7 + r.count / 300);
      const d = Math.min(0.99, r.density * wave);
      crowd.push(polygon(square(toLngLat(at), 26), { color: heat(d), h: Math.round(8 + d * 70), html: `<b>${esc(p.name)}</b>Radar cell ${i + 1}/${steps} · ${Math.round(d * 100)}% density` }));
    }
  });
  const staff = fc(state.staff.filter((s) => s.status !== 'off').map((s) => point(toLngLat(s.pos), {
    color: ROLE_COLOURS[s.role] || '#334155', label: s.name,
    html: `<b>${esc(s.name)}</b>${esc(s.role)} · Zone ${s.zone}<br>${s.status === 'on-task' ? `On task: ${esc(s.task || '')}` : 'Available'}`,
  })));
  const facilities = fc(FACILITIES.map((f) => point(toLngLat(f.pos), { color: f.status === 'down' ? '#94A3B8' : FAC_COLOURS[f.type] || '#334155', html: `<b>${esc(f.name)}</b>${f.status === 'down' ? 'Out of service' : `Operational · queue ${f.queue}`}` })));
  const alerts = state.alerts.filter((a) => a.state !== 'resolved' && Array.isArray(a.location)).map((a) => ({
    id: a.id, lngLat: toLngLat(a.location), severity: a.severity, state: a.state, label: `${a.title} (${a.severity})`,
    html: `<b>${esc(a.title)}</b>${esc(a.desc || '')}<br><span style="color:#64748B">${esc(ALERT_TYPES[a.type]?.label || a.type)} · ${a.state === 'dispatched' ? `Dispatched to ${esc(a.assignee || '')}` : a.state}</span>`,
  }));
  return { zones, privacy, crowd: fc(crowd), staff, facilities, alerts };
}

let open = null;
export async function toggle3D(host, { onAlert } = {}) {
  if (open) { close3D(); return false; }
  const unsub = [];
  const ctl = await mount3D(host, {
    centre: toLngLat([600, 400]) || CENTRE, zoom: 15.4, pitch: 60, bearing: -30, data: data(),
    labels: { close: '2D map' },
    onAlert: (id) => document.dispatchEvent(new CustomEvent('gc:focus-alert', { detail: { id } })),
    onClose: () => close3D(),
  });
  let t = 0;
  const refresh = () => { clearTimeout(t); t = setTimeout(() => ctl.update(data()), 250); };
  unsub.push(subscribe(['alerts', 'staff'], refresh));
  const radar = setInterval(refresh, 6000);
  open = { ctl, unsub, radar };
  host.dataset.m3d = 'on';
  void onAlert;
  return true;
}
export function close3D() {
  if (!open) return;
  open.unsub.forEach((u) => u());
  clearInterval(open.radar);
  const host = open.ctl.el.parentElement;
  open.ctl.destroy();
  host?.removeAttribute('data-m3d');
  open = null;
  document.querySelector('[data-act="map-3d"]')?.setAttribute('aria-pressed', 'false');
}
export const is3DOpen = () => !!open;
