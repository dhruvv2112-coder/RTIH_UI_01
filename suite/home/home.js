import { qrSVG } from './qr.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const time = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour12: false });
const APP_NAME = { dashboard: 'Dashboard', field: 'Field app', pilgrim: 'Pilgrim app' };

function describe(ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case 'sos': return ['crit', `SOS from ${d.name || 'a pilgrim'} at ${d.ghatName || 'a ghat'}${d.members > 1 ? ` (group of ${d.members})` : ''}`];
    case 'sos.cancel': return ['ok', 'Pilgrim cancelled SOS: reports they are safe'];
    case 'dispatch': return ['warn', `Dispatched ${d.staffName} to “${d.title}”, ETA ~${d.eta} min`];
    case 'dispatch.recall': return ['warn', `Dispatch recalled (${d.alertId})`];
    case 'task.update': {
      const map = { accepted: ['ok', `${d.staffName} accepted${d.auto ? ' (auto, 30 s timeout)' : ''}${d.simulated ? ' (simulated responder)' : ''}`], declined: ['warn', `${d.staffName} declined: ${d.reason || 'no reason'}`], completed: ['ok', `${d.staffName} completed the task`], note: ['info', `${d.staffName} added a note: “${d.note}”`], escalated: ['crit', `${d.staffName} escalated to supervisor`] };
      return map[d.status] || ['info', `${d.staffName}: ${d.status}`];
    }
    case 'alert.update': return ['ok', `Command Centre resolved ${d.alertId}`];
    case 'staff.sos': return ['crit', `Staff SOS from ${d.staffName} at ${d.location}`];
    case 'staff.sos.cancel': return ['ok', `${d.staffName} cancelled staff SOS`];
    case 'report': return [d.severity === 'critical' ? 'crit' : 'info', `${d.label} report from ${d.staffName} (${d.severity})`];
    case 'emergency': return ['crit', `Emergency protocol activated in Zone ${d.zone}`];
    case 'emergency.end': return ['ok', `Emergency protocol ended, Zone ${d.zone}`];
    default: return ['info', ev.type];
  }
}

const list = $('#log');
function add(ev, flash) {
  if (ev.type === 'ping') return;
  const [tone, text] = describe(ev);
  const li = document.createElement('li');
  li.dataset.tone = tone;
  li.innerHTML = `<time>${time(ev.ts)}</time><span class="dot" aria-hidden="true"></span><span>${esc(text)} <span class="who">· ${esc(APP_NAME[ev.app] || ev.app)}</span></span>`;
  list.prepend(li);
  $('#empty').hidden = true;
  if (flash) {
    const river = $('.river');
    river.classList.remove('is-flowing'); void river.getBoundingClientRect(); river.classList.add('is-flowing');
    const card = document.querySelector(`.app[data-app="${ev.app}"]`);
    if (card) { card.classList.remove('is-pulse'); void card.offsetWidth; card.classList.add('is-pulse'); }
  }
}

async function counts() {
  try {
    const c = await (await fetch('/api/clients', { cache: 'no-store' })).json();
    for (const k of ['dashboard', 'field', 'pilgrim']) {
      const n = c[k] || 0;
      document.querySelector(`[data-count="${k}"]`).textContent = n ? `${n} open now` : 'Not open yet';
    }
  } catch {}
}

async function boot() {
  let h;
  try { h = await (await fetch('/api/health', { cache: 'no-store' })).json(); } catch { setHub('down', 'Hub not reachable. Is the server window still open?'); return; }
  const port = location.port || h.port;
  const ips = h.lan || [];
  if (ips.length) {
    for (const app of ['pilgrim', 'field']) {
      const url = `http://${ips[0]}:${port}/${app}/`;
      const el = document.querySelector(`[data-phone="${app}"]`);
      el.classList.add('has-lan');
      el.innerHTML = `${qrSVG(url, { px: 3 })}<span>On a phone on the same Wi-Fi, scan or type<code>${esc(url)}</code></span>`;
    }
    $('#addr').textContent = `LAN: ${ips.map((ip) => `${ip}:${port}`).join(', ')}`;
  }
  const { events } = await (await fetch('/api/events?limit=60')).json();
  events.forEach((e) => add(e, false));
  const es = new EventSource(`/api/stream?app=home&since=${h.latest}`);
  es.onopen = () => setHub('live', 'Hub live');
  es.onerror = () => setHub('down', 'Reconnecting to the hub…');
  es.onmessage = (m) => { try { add(JSON.parse(m.data), true); counts(); } catch {} };
  es.addEventListener('reset', () => { list.innerHTML = ''; $('#empty').hidden = false; });
  counts(); setInterval(counts, 4000);
}
function setHub(state, text) { $('#hub').dataset.state = state; $('#hubText').textContent = text; }

$('#reset').addEventListener('click', async () => {
  if (!confirm('Clear the shared event log? Open apps keep their own screens; new events start from zero.')) return;
  await fetch('/api/reset', { method: 'POST' });
});

boot();
