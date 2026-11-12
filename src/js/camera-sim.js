// Simulated CCTV feed renderer. Stands in for HLS playback (hls.js) until S1
// streams are wired. Pure function of (camera, time) so Replay can seek.
import { rng } from './data.js';

const CLOTH = ['#E8A33D', '#F2EFE6', '#C2453B', '#3F8F5E', '#D9739A', '#E7D36A', '#5B7FBF', '#EFE7DA', '#B5562B', '#7A4E9E', '#F0F0F0', '#2F6F8F'];
const SKIN = ['#6B4630', '#7D5238', '#8C5E3C', '#5A3B28'];

const cache = new WeakMap();

function people(cam) {
  if (cache.has(cam)) return cache.get(cam);
  const r = rng(cam.seed);
  const n = Math.round(10 + cam.density * 70);
  const list = Array.from({ length: n }, (_, i) => ({
    lane: (r() * 2 - 1) * (cam.scene === 'gate' || cam.scene === 'queue' ? 0.8 : 1),
    speed: 0.012 + r() * 0.02,
    phase: r(),
    dir: r() > (cam.scene === 'gate' ? 0.85 : 0.5) ? 1 : -1,
    cloth: CLOTH[Math.floor(r() * CLOTH.length)],
    skin: SKIN[Math.floor(r() * SKIN.length)],
    sway: r() * Math.PI * 2,
    tall: 0.85 + r() * 0.3,
    tracked: i % 5 === 0,
  }));
  const vehicles = cam.scene === 'road' || cam.scene === 'bridge'
    ? Array.from({ length: 4 }, () => ({ lane: r() > 0.5 ? 0.35 : -0.35, speed: 0.05 + r() * 0.04, phase: r(), dir: r() > 0.5 ? 1 : -1, colour: ['#C9CED6', '#E5E7EB', '#9AA4B2', '#D4A93C'][Math.floor(r() * 4)], kind: r() > 0.7 ? 'bus' : 'car' }))
    : [];
  const v = { list, vehicles, bgSeed: cam.seed };
  cache.set(cam, v);
  return v;
}

function frac(x) { return x - Math.floor(x); }

function background(ctx, w, h, cam) {
  const vpY = h * 0.3;
  // sky / far haze
  const sky = ctx.createLinearGradient(0, 0, 0, vpY);
  sky.addColorStop(0, '#9FB2BF');
  sky.addColorStop(1, '#C7D1D6');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, vpY);
  const r = rng(cam.seed + 7);

  if (cam.scene === 'bridge') {
    // river band behind railing
    ctx.fillStyle = '#7D97A6';
    ctx.fillRect(0, vpY - h * 0.05, w, h * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 12; i++) ctx.fillRect(r() * w, vpY - h * 0.03 + r() * h * 0.08, 20 + r() * 40, 1);
  } else {
    // far buildings & temple gopuram silhouettes
    for (let x = 0; x < w;) {
      const bw = 20 + r() * 60, bh = 12 + r() * h * 0.16;
      ctx.fillStyle = `rgba(${90 + r() * 40},${100 + r() * 30},${110 + r() * 30},0.85)`;
      ctx.fillRect(x, vpY - bh, bw, bh);
      x += bw + r() * 6;
    }
    if (cam.scene === 'gate' || cam.scene === 'queue') {
      const gx = w * 0.55, gw = w * 0.07;
      ctx.fillStyle = '#8E7B66';
      ctx.beginPath();
      ctx.moveTo(gx - gw, vpY);
      ctx.lineTo(gx - gw * 0.7, vpY - h * 0.22);
      ctx.lineTo(gx - gw * 0.3, vpY - h * 0.27);
      ctx.lineTo(gx + gw * 0.3, vpY - h * 0.27);
      ctx.lineTo(gx + gw * 0.7, vpY - h * 0.22);
      ctx.lineTo(gx + gw, vpY);
      ctx.fill();
    }
  }
  // ground
  const g = ctx.createLinearGradient(0, vpY, 0, h);
  const plaza = cam.scene === 'plaza' || cam.scene === 'queue';
  g.addColorStop(0, plaza ? '#A9A397' : '#8F959B');
  g.addColorStop(1, plaza ? '#C8C0B0' : '#6E747A');
  ctx.fillStyle = g;
  ctx.fillRect(0, vpY, w, h - vpY);

  const vx = w * 0.55;
  ctx.lineWidth = 1;
  if (cam.scene === 'road' || cam.scene === 'bridge') {
    // road surface
    ctx.fillStyle = '#585E64';
    ctx.beginPath();
    ctx.moveTo(vx - w * 0.04, vpY); ctx.lineTo(vx + w * 0.04, vpY);
    ctx.lineTo(w * 0.95, h); ctx.lineTo(w * 0.15, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(240,240,220,0.55)';
    ctx.setLineDash([h * 0.04, h * 0.05]);
    ctx.beginPath(); ctx.moveTo(vx, vpY); ctx.lineTo(w * 0.55, h); ctx.stroke();
    ctx.setLineDash([]);
    if (cam.scene === 'bridge') {
      ctx.strokeStyle = 'rgba(60,64,70,0.9)'; ctx.lineWidth = 2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(0, vpY + 8 + k * 7); ctx.lineTo(w, vpY + 2 + k * 5); ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  } else {
    // lane barricades converging on vanishing point
    const lanes = cam.scene === 'gate' ? 4 : cam.scene === 'queue' ? 6 : 0;
    ctx.strokeStyle = 'rgba(210,190,60,0.85)';
    ctx.lineWidth = Math.max(1, w / 400);
    for (let i = 0; i <= lanes; i++) {
      const bx = w * 0.1 + (w * 0.8 * i) / lanes;
      ctx.beginPath(); ctx.moveTo(vx + (bx - vx) * 0.08, vpY + 2); ctx.lineTo(bx, h); ctx.stroke();
    }
    if (cam.scene === 'plaza') {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let i = 1; i < 10; i++) {
        const y = vpY + (h - vpY) * (i / 10) ** 1.6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
    ctx.lineWidth = 1;
  }
}

function project(lane, z, w, h, spread = 0.45) {
  const vpY = h * 0.3, vx = w * 0.55;
  const zz = z ** 1.35;
  const y = vpY + (h - vpY) * zz;
  const half = w * spread * (0.08 + zz * 0.92);
  return { x: vx + lane * half, y, s: 0.12 + zz * 0.95 };
}

/**
 * Draw one frame.
 * @returns {number} person count estimate for the badge
 */
export function drawFeed(ctx, w, h, cam, t, { boxes = true, anomaly = false } = {}) {
  const { list, vehicles } = people(cam);
  background(ctx, w, h, cam);

  const items = [];
  for (const p of list) {
    const z = frac(p.phase + p.speed * t * p.dir * (cam.scene === 'queue' ? 0.35 : 1));
    items.push({ type: 'p', p, z, ...project(p.lane, z, w, h) });
  }
  for (const v of vehicles) {
    const z = frac(v.phase + v.speed * t * v.dir);
    items.push({ type: 'v', v, z, ...project(v.lane, z, w, h, 0.3) });
  }
  items.sort((a, b) => a.z - b.z);

  const base = h * 0.17;
  const tracked = [];
  for (const it of items) {
    if (it.type === 'v') {
      const vw = base * it.s * (it.v.kind === 'bus' ? 2.6 : 1.7), vh = base * it.s * (it.v.kind === 'bus' ? 1.3 : 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(it.x - vw / 2, it.y - vh * 0.1, vw, vh * 0.2);
      ctx.fillStyle = it.v.colour;
      ctx.fillRect(it.x - vw / 2, it.y - vh, vw, vh);
      ctx.fillStyle = 'rgba(40,50,60,0.7)';
      ctx.fillRect(it.x - vw * 0.4, it.y - vh * 0.92, vw * 0.8, vh * 0.32);
      if (boxes && it.z > 0.35) tracked.push({ x: it.x - vw / 2 - 2, y: it.y - vh - 2, w: vw + 4, h: vh + 4, cls: 'vehicle' });
      continue;
    }
    const { p } = it;
    const ph = base * it.s * p.tall;
    const pw = ph * 0.36;
    const bob = Math.sin(t * 6 + p.sway) * ph * 0.02;
    const x = it.x + Math.sin(t * 0.7 + p.sway) * pw * 0.4;
    const y = it.y + bob;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x, y, pw * 0.6, pw * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = p.cloth;
    ctx.beginPath();
    ctx.moveTo(x - pw / 2, y);
    ctx.lineTo(x - pw * 0.42, y - ph * 0.72);
    ctx.quadraticCurveTo(x, y - ph * 0.86, x + pw * 0.42, y - ph * 0.72);
    ctx.lineTo(x + pw / 2, y);
    ctx.closePath(); ctx.fill();
    // head
    ctx.fillStyle = p.skin;
    ctx.beginPath(); ctx.arc(x, y - ph * 0.86, pw * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1F1A17';
    ctx.beginPath(); ctx.arc(x, y - ph * 0.9, pw * 0.28, Math.PI, Math.PI * 2); ctx.fill();
    if (boxes && p.tracked && it.z > 0.55) tracked.push({ x: x - pw * 0.7, y: y - ph * 1.08, w: pw * 1.4, h: ph * 1.12, cls: 'person', conf: (0.86 + (p.sway % 0.13)).toFixed(2) });
  }

  // CCTV grade: desaturate + slight cool cast + vignette
  ctx.fillStyle = 'rgba(40,70,90,0.10)';
  ctx.fillRect(0, 0, w, h);
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  // AI detection boxes (brief §5.1: 2px dashed, class-coloured, label above)
  if (boxes) {
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.font = `600 ${Math.max(9, Math.round(h / 26))}px Inter, sans-serif`;
    let labels = 0;
    tracked.sort((a, b) => b.h - a.h);
    for (const b of tracked) {
      const c = b.cls === 'vehicle' ? '#3B82F6' : '#22C55E';
      ctx.strokeStyle = c;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      if (b.h > h * 0.16 && labels < 3) {
        labels++;
        const label = b.cls === 'vehicle' ? 'vehicle' : `person ${b.conf}`;
        const tw = ctx.measureText(label).width + 6;
        ctx.setLineDash([]);
        ctx.fillStyle = c;
        ctx.fillRect(b.x - 1, b.y - Math.round(h / 22) - 1, tw, Math.round(h / 22));
        ctx.fillStyle = '#04120A';
        ctx.fillText(label, b.x + 2, b.y - 4);
        ctx.setLineDash([5, 3]);
      }
    }
    if (anomaly) {
      const ax = w * 0.32, ay = h * 0.46, aw = w * 0.36, ah = h * 0.38;
      ctx.strokeStyle = '#EF4444';
      ctx.strokeRect(ax, ay, aw, ah);
      ctx.setLineDash([]);
      const label = 'crowd surge 0.94';
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(ax - 1, ay - Math.round(h / 20) - 1, tw, Math.round(h / 20));
      ctx.fillStyle = '#fff';
      ctx.fillText(label, ax + 3, ay - 5);
    }
    ctx.setLineDash([]);
  }

  // sensor grain
  const gr = rng(Math.floor(t * 12) + cam.seed);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 40; i++) ctx.fillRect(gr() * w, gr() * h, 1, 1);

  const live = list.length * 4.1 + Math.sin(t / 7 + cam.seed) * 6;
  return Math.max(0, Math.round(live));
}

/* ------------------------------------------------------------------
   Feed manager: one rAF loop drives every visible <canvas data-cam>.
   ------------------------------------------------------------------ */
const feeds = new Set();
let running = false;
let paused = false;
const FPS = 12;

export function registerFeed(canvas, cam, opts = {}) {
  const f = { canvas, cam, opts, last: 0, count: 0, onCount: opts.onCount };
  feeds.add(f);
  if (!running) start();
  return () => feeds.delete(f);
}

export function clearFeeds(root) {
  for (const f of [...feeds]) if (!f.canvas.isConnected || (root && root.contains(f.canvas))) feeds.delete(f);
}

export function setFeedsPaused(p) { paused = p; }

function start() {
  running = true;
  const loop = (ts) => {
    if (!feeds.size) { running = false; return; }
    if (!paused && !document.hidden) {
      for (const f of feeds) {
        if (!f.canvas.isConnected) { feeds.delete(f); continue; }
        const degraded = f.cam.status === 'degraded';
        const interval = 1000 / (degraded ? 5 : FPS);
        if (ts - f.last < interval) continue;
        f.last = ts;
        const rect = f.canvas.getBoundingClientRect();
        if (!rect.width) continue;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = degraded ? 0.35 : 1;
        const w = Math.max(64, Math.round(rect.width * dpr * scale));
        const h = Math.max(36, Math.round(rect.height * dpr * scale));
        if (f.canvas.width !== w || f.canvas.height !== h) { f.canvas.width = w; f.canvas.height = h; }
        const ctx = f.canvas.getContext('2d');
        const t = f.opts.time ? f.opts.time() : ts / 1000;
        const c = drawFeed(ctx, w, h, f.cam, t, { boxes: f.opts.boxes !== false && !degraded, anomaly: f.opts.anomaly });
        if (c !== f.count) { f.count = c; f.onCount?.(c); }
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** Render a single still frame to a data URL (thumbnails, screenshots). */
export function snapshot(cam, w = 240, h = 135, t = performance.now() / 1000) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  drawFeed(c.getContext('2d'), w, h, cam, t, { boxes: true });
  return c;
}
