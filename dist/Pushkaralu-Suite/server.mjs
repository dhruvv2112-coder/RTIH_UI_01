#!/usr/bin/env node
// Pushkaralu 2027 Suite — one local server for all three apps plus the live data hub.
//
//   /            Suite home (links, LAN addresses, live event log)
//   /dashboard/  RTIH_UI_01  Command Centre surveillance dashboard
//   /field/      RTIH_UI_02  Staff & vendor field app
//   /pilgrim/    RTIH_UI_03  Pilgrim app
//   /api/*       Live hub: apps publish events and receive everyone else's over SSE
//
// Zero dependencies — needs only Node.js 18 or newer.
import http from 'node:http';
import os from 'node:os';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, normalize, resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || process.argv.find((a) => /^--port=/.test(a))?.split('=')[1] || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = resolve(ROOT, 'data', 'hub-state.json');
const MAX_EVENTS = 1000;
const MAX_BODY = 64 * 1024;

const APPS = {
  dashboard: { dir: resolve(process.env.DASHBOARD_DIR || join(ROOT, 'apps', 'dashboard')), name: 'Command Centre dashboard' },
  field: { dir: resolve(process.env.FIELD_DIR || join(ROOT, 'apps', 'field')), name: 'Field staff app' },
  pilgrim: { dir: resolve(process.env.PILGRIM_DIR || join(ROOT, 'apps', 'pilgrim')), name: 'Pilgrim app' },
};
const HOME_DIR = resolve(join(ROOT, 'home'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

/* ------------------------------------------------------------------ hub state */
let hub = { epoch: randomUUID().slice(0, 8), seq: 0, events: [] };
try {
  const saved = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  if (saved && Array.isArray(saved.events)) hub = { ...hub, ...saved };
} catch { /* first run */ }

let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await mkdir(dirname(DATA_FILE), { recursive: true }); await writeFile(DATA_FILE, JSON.stringify(hub)); } catch (e) { console.warn('  ! could not save hub state:', e.message); }
  }, 300);
}

const clients = new Set();
function broadcast(ev) {
  const frame = `id: ${ev.id}\nevent: message\ndata: ${JSON.stringify(ev)}\n\n`;
  for (const c of clients) c.res.write(frame);
}

const TYPES = new Set(['sos', 'sos.cancel', 'dispatch', 'dispatch.recall', 'task.update', 'alert.update', 'staff.sos', 'staff.sos.cancel', 'report', 'emergency', 'emergency.end', 'ping']);
function publish({ type, app, from, data }) {
  const ev = { id: ++hub.seq, type, app: String(app || 'unknown').slice(0, 24), from: String(from || '').slice(0, 64), ts: Date.now(), data: data ?? {} };
  hub.events.push(ev);
  if (hub.events.length > MAX_EVENTS) hub.events.splice(0, hub.events.length - MAX_EVENTS);
  persist();
  broadcast(ev);
  log(ev);
  return ev;
}

const COLOURS = { sos: 31, 'staff.sos': 31, dispatch: 36, 'task.update': 32, report: 33, emergency: 35 };
function log(ev) {
  if (ev.type === 'ping') return;
  const c = COLOURS[ev.type] || 37;
  const t = new Date(ev.ts).toLocaleTimeString('en-IN', { hour12: false });
  const d = ev.data || {};
  const what = d.title || d.status || d.name || d.staffName || '';
  console.log(`  ${t}  \x1b[${c}m${ev.type.padEnd(12)}\x1b[0m ${ev.app.padEnd(9)} ${what}`);
}

/* ------------------------------------------------------------------- helpers */
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

async function serveFile(res, baseDir, relPath, req) {
  const target = normalize(join(baseDir, relPath));
  if (target !== baseDir && !target.startsWith(baseDir + sep)) return send(res, 403, 'Forbidden');
  let file = target;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
  } catch {
    // SPA fallback: unknown paths without an extension load the app shell
    if (!extname(relPath)) file = join(baseDir, 'index.html');
    else return send(res, 404, 'Not found');
  }
  if (!existsSync(file)) return send(res, 404, 'Not found');
  const ext = extname(file).toLowerCase();
  const st = await stat(file);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': st.size,
    // HTML and JS revalidate so a rebuilt app is picked up on refresh
    'Cache-Control': ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

/* -------------------------------------------------------------------- routes */
async function api(req, res, url) {
  const path = url.pathname.slice(4); // strip /api

  if (path === '/health') {
    return send(res, 200, { service: 'rtih-hub', ok: true, epoch: hub.epoch, latest: hub.seq, clients: clients.size, uptime: Math.round(process.uptime()), lan: lanAddresses(), port: PORT });
  }

  if (path === '/stream') {
    let since = Number(req.headers['last-event-id'] ?? url.searchParams.get('since') ?? hub.seq) || 0;
    if (since > hub.seq) since = 0; // the client saw a previous event log (hub was reset)
    const app = (url.searchParams.get('app') || 'unknown').slice(0, 24);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 2000\n\n`);
    for (const ev of hub.events) if (ev.id > since) res.write(`id: ${ev.id}\nevent: message\ndata: ${JSON.stringify(ev)}\n\n`);
    const client = { res, app };
    clients.add(client);
    const ka = setInterval(() => res.write(`: keep-alive ${Date.now()}\n\n`), 20000);
    req.on('close', () => { clearInterval(ka); clients.delete(client); });
    return;
  }

  if (path === '/events' && req.method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const limit = Math.min(500, Number(url.searchParams.get('limit') || 200));
    return send(res, 200, { epoch: hub.epoch, latest: hub.seq, events: hub.events.filter((e) => e.id > since).slice(-limit) });
  }

  if (path === '/events' && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'Body must be JSON under 64 KB' }); }
    if (!body || !TYPES.has(body.type)) return send(res, 400, { error: `Unknown event type. Allowed: ${[...TYPES].join(', ')}` });
    return send(res, 201, publish(body));
  }

  if (path === '/clients') {
    const counts = {};
    for (const c of clients) counts[c.app] = (counts[c.app] || 0) + 1;
    return send(res, 200, counts);
  }

  if (path === '/reset' && req.method === 'POST') {
    hub = { epoch: randomUUID().slice(0, 8), seq: 0, events: [] };
    persist();
    for (const c of clients) c.res.write(`event: reset\ndata: ${JSON.stringify({ epoch: hub.epoch })}\n\n`);
    console.log('  hub reset — event log cleared');
    return send(res, 200, { ok: true, epoch: hub.epoch });
  }

  return send(res, 404, { error: 'Unknown API route' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = decodeURIComponent(url.pathname);

    if (p === '/api' || p.startsWith('/api/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
      return await api(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    const [, first, ...rest] = p.split('/');
    if (APPS[first]) {
      if (p === `/${first}`) { res.writeHead(301, { Location: `/${first}/${url.search}` }); return res.end(); }
      return await serveFile(res, APPS[first].dir, rest.join('/'), req);
    }
    return await serveFile(res, HOME_DIR, p.slice(1), req);
  } catch (e) {
    console.error('  ! request failed:', e);
    if (!res.headersSent) send(res, 500, 'Server error');
    else res.end();
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Close the other window running the suite, or start on another port:\n    set PORT=8090 && start.bat      (Windows)\n    PORT=8090 ./start.sh            (macOS / Linux)\n`);
  } else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const missing = Object.entries(APPS).filter(([, a]) => !existsSync(join(a.dir, 'index.html'))).map(([k]) => k);
  const lan = lanAddresses();
  console.log(`\n  \x1b[1mPushkaralu 2027 Suite\x1b[0m is running\n`);
  console.log(`  On this laptop      http://localhost:${PORT}`);
  console.log(`    Dashboard         http://localhost:${PORT}/dashboard/`);
  console.log(`    Field staff app   http://localhost:${PORT}/field/`);
  console.log(`    Pilgrim app       http://localhost:${PORT}/pilgrim/`);
  if (lan.length) {
    console.log(`\n  Phones on the same Wi-Fi:`);
    lan.forEach((ip) => console.log(`    http://${ip}:${PORT}/field/     http://${ip}:${PORT}/pilgrim/`));
  }
  if (missing.length) console.log(`\n  \x1b[33m! Missing app files: ${missing.join(', ')} — see README.\x1b[0m`);
  console.log(`\n  Live events appear below. Press Ctrl+C to stop.\n`);
  if (process.argv.includes('--open')) {
    const url = `http://localhost:${PORT}/`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});

const shutdown = () => { console.log('\n  Stopping…'); clearTimeout(saveTimer); writeFile(DATA_FILE, JSON.stringify(hub)).catch(() => {}).finally(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
