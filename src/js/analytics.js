// Analytics mode (§4.3): crowd time-series, response histogram, zone table,
// incident timeline, KPI comparison column. Hand-rolled SVG (Recharts stand-in).
import { icon } from './icons.js';
import { state, set, subscribe } from './store.js';
import { ZONES, crowdSeries, RESPONSE_BUCKETS, RESPONSE_DIST, RESPONSE_BY_ZONE, ZONE_METRICS, ALERT_TYPES } from './data.js';
import { esc, num, hmIST, timeIST, dayIST, heatColour, $, $$ } from './util.js';
import { kpiValue } from './kpi.js';
import { sevShape } from './alerts.js';

const RANGES = { '1h': 1, '6h': 6, '12h': 12, '24h': 24, '7d': 168 };
let histGroup = 'all';
let sortKey = 'zone', sortDir = 1;

export function mountAnalytics(root) {
  root.innerHTML = `
    <div class="an">
      <section class="panel an__crowd" aria-labelledby="an-crowd-t">
        <header class="panel__head"><h2 class="t-h2" id="an-crowd-t">Crowd on site by zone</h2>
          <div class="seg seg--sm" role="radiogroup" aria-label="Time range">${Object.keys(RANGES).map((r) => `<button role="radio" data-range="${r}" aria-checked="false">${r}</button>`).join('')}</div></header>
        <div class="chart" data-chart="crowd"></div>
      </section>
      <section class="panel an__hist" aria-labelledby="an-hist-t">
        <header class="panel__head"><h2 class="t-h2" id="an-hist-t">Response time, dispatch → arrival</h2>
          <span class="select-wrap select-wrap--sm"><select class="input input--sm" data-hist aria-label="Group">
            <option value="all">All incidents</option>
            <optgroup label="By severity">${['critical', 'high', 'medium', 'low'].map((s) => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</optgroup>
            <optgroup label="By zone">${ZONES.map((z) => `<option value="z${z.id}">${z.name}</option>`).join('')}</optgroup>
          </select>${icon('chevron-down', 14)}</span></header>
        <div class="chart" data-chart="hist"></div>
      </section>
      <section class="panel an__table" aria-labelledby="an-tbl-t">
        <header class="panel__head"><h2 class="t-h2" id="an-tbl-t">Zone comparison</h2><span class="t-caption muted">Today, 00:00 → now</span></header>
        <div class="tbl-wrap scroll-thin" data-table></div>
      </section>
      <section class="panel an__feed" aria-labelledby="an-feed-t">
        <header class="panel__head"><h2 class="t-h2" id="an-feed-t">Incident timeline</h2><span class="t-caption muted" data-feedcount></span></header>
        <ol class="feed scroll-thin" data-feed></ol>
      </section>
      <aside class="panel an__kpis" aria-labelledby="an-kpi-t">
        <header class="panel__head"><h2 class="t-h2" id="an-kpi-t">Key indicators</h2></header>
        <div class="an-kpis" data-kpis></div>
      </aside>
    </div>`;

  root.addEventListener('click', (e) => {
    const r = e.target.closest('[data-range]');
    if (r) set({ analyticsRange: r.dataset.range });
    const th = e.target.closest('[data-sort]');
    if (th) { const k = th.dataset.sort; sortDir = sortKey === k ? -sortDir : (k === 'zone' ? 1 : -1); sortKey = k; renderTable(); }
    const fe = e.target.closest('[data-feed-alert]');
    if (fe) root.dispatchEvent(new CustomEvent('gc:focus-alert', { bubbles: true, detail: { id: fe.dataset.feedAlert } }));
  });
  $('[data-hist]', root).addEventListener('change', (e) => { histGroup = e.target.value; renderHist(); });

  function renderCrowd() {
    $$('[data-range]', root).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.range === state.analyticsRange)));
    const hours = RANGES[state.analyticsRange];
    const series = ZONES.map((z) => ({ z, pts: crowdSeries(hours, z.id) }));
    lineChart($('[data-chart=crowd]', root), series, hours);
  }
  function renderHist() {
    const data = histGroup === 'all'
      ? RESPONSE_BUCKETS.map((_, i) => Object.values(RESPONSE_DIST).reduce((s, a) => s + a[i], 0))
      : histGroup.startsWith('z') ? RESPONSE_BY_ZONE[histGroup.slice(1)] : RESPONSE_DIST[histGroup];
    barChart($('[data-chart=hist]', root), data);
  }
  function renderTable() {
    const cols = [
      ['zone', 'Zone'], ['crowd', 'Crowd now'], ['peak', 'Peak today'], ['density', 'Density'], ['incidents', 'Incidents'], ['open', 'Open'], ['response', 'Avg resp.'], ['staff', 'Staff'], ['cams', 'Cameras'], ['water', 'WQI'],
    ];
    const rows = [...ZONE_METRICS].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
    });
    $('[data-table]', root).innerHTML = `<table class="tbl">
      <thead><tr>${cols.map(([k, l]) => `<th scope="col" aria-sort="${sortKey === k ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${k}">${l}${sortKey === k ? icon(sortDir > 0 ? 'chevron-up' : 'chevron-down', 12) : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => {
        const z = ZONES.find((x) => x.id === r.zone);
        return `<tr><th scope="row"><span class="zone-sw zone-sw--${r.zone}"></span>${z.name}<span class="t-caption muted"> ${esc(z.area)}</span></th>
          <td class="num">${num(r.crowd)}</td><td class="num">${num(r.peak)}</td>
          <td class="num"><span class="dens"><i style="--w:${Math.round(r.density * 100)}%;--c:${heatColour(r.density)}"></i>${Math.round(r.density * 100)}%</span></td>
          <td class="num">${r.incidents}</td><td class="num">${r.open}</td><td class="num">${r.response.toFixed(1)} m</td>
          <td class="num">${r.staff}</td><td class="num t-mono">${r.cams}</td><td class="num">${r.water ?? '—'}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  function renderFeed() {
    const list = [...state.alerts].sort((a, b) => b.ts - a.ts);
    $('[data-feedcount]', root).textContent = `${list.length} today`;
    $('[data-feed]', root).innerHTML = list.map((a) => `
      <li class="feed__item st-${a.state}">
        <span class="feed__time t-mono">${timeIST(a.ts).slice(0, 5)}</span>
        <span class="feed__marker sev-${a.severity}">${a.state === 'resolved' ? icon('check', 12) : ''}</span>
        <button class="feed__body" data-feed-alert="${a.id}" ${a.state === 'resolved' ? 'disabled' : ''}>
          <span class="t-body-strong">${esc(a.title)}</span>
          <span class="t-caption muted">${sevShape(a.severity)} ${ALERT_TYPES[a.type].label} · ${a.state === 'resolved' ? `Resolved${a.assignee ? ` by ${esc(a.assignee)}` : ''}` : a.state === 'dispatched' ? `Dispatched to ${esc(a.assignee)}` : a.state === 'acknowledged' ? 'Acknowledged' : 'Open'}</span>
        </button>
      </li>`).join('');
  }
  function renderKPIs() {
    const vs = { pilgrims: [12, 18], crowd: [6, -4], incidents: [2, -35], staff: [4, 22], response: [-8, -41], water: [-3, 9] };
    $('[data-kpis]', root).innerHTML = state.kpis.map((k) => {
      const [y, l] = vs[k.id];
      const tone = (v) => (k.good === 'neutral' ? 'neutral' : (k.good === 'up') === v >= 0 ? 'good' : 'bad');
      return `<div class="an-kpi">
        <div class="kpi__label">${k.label}</div>
        <div class="an-kpi__v">${num(kpiValue(k), k.decimals || 0)}<span class="t-kpi-unit muted"> ${k.id === 'response' ? 'min' : k.id === 'water' ? 'WQI' : ''}</span></div>
        <div class="an-kpi__cmp"><span>vs. yesterday</span><b class="kpi__trend--${tone(y)}">${icon(y >= 0 ? 'trending-up' : 'trending-down', 14)}${y >= 0 ? '+' : ''}${y}%</b></div>
        <div class="an-kpi__cmp"><span>vs. last event</span><b class="kpi__trend--${tone(l)}">${icon(l >= 0 ? 'trending-up' : 'trending-down', 14)}${l >= 0 ? '+' : ''}${l}%</b></div>
      </div>`;
    }).join('');
  }

  const all = () => { renderCrowd(); renderHist(); renderTable(); renderFeed(); renderKPIs(); };
  subscribe('analyticsRange', renderCrowd);
  subscribe('alerts', () => { if (root.offsetParent) { renderFeed(); renderKPIs(); } });
  subscribe('kpis', () => { if (root.offsetParent) renderKPIs(); });
  new ResizeObserver(() => { if (root.offsetParent) { renderCrowd(); renderHist(); } }).observe(root);
  return { render: all };
}

/* -------------------------------------------------------- line chart */
function lineChart(el, series, hours) {
  const W = Math.max(320, el.clientWidth), H = Math.max(160, el.clientHeight);
  const m = { l: 48, r: 92, t: 12, b: 28 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const t0 = series[0].pts[0].t, t1 = series[0].pts[series[0].pts.length - 1].t;
  const maxV = Math.max(...series.flatMap((s) => s.pts.map((p) => p.v)));
  const yMax = Math.ceil(maxV / 2000) * 2000 || 1;
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const y = (v) => m.t + ih - (v / yMax) * ih;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * yMax);
  const nx = hours > 24 ? 7 : 6;
  const xTicks = Array.from({ length: nx + 1 }, (_, i) => t0 + ((t1 - t0) * i) / nx);
  const fmtX = (t) => (hours > 24 ? dayIST(t) : hmIST(t));

  // direct labels at line ends, de-collided
  const ends = series.map((s) => ({ id: s.z.id, y: y(s.pts[s.pts.length - 1].v), v: s.pts[s.pts.length - 1].v })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;

  el.innerHTML = `
    <div class="chart__legend" aria-hidden="true">${series.map((s) => `<span><i class="zone-sw zone-sw--${s.z.id}"></i>${s.z.name}</span>`).join('')}</div>
    <svg class="chart__svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Line chart: people on site per zone over the last ${hours} hours">
      <g class="chart__grid">${yTicks.map((v) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? `${v / 1000}K` : v}</text>`).join('')}</g>
      <g class="chart__xaxis">${xTicks.map((t) => `<text x="${x(t)}" y="${H - 8}" text-anchor="middle">${fmtX(t)}</text>`).join('')}</g>
      ${series.map((s) => `<path class="chart__line zl-${s.z.id}" d="M${s.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L')}"/>`).join('')}
      ${ends.map((e) => `<text class="chart__endlabel" x="${m.l + iw + 8}" y="${e.y + 4}"><tspan class="zt-${e.id}">●</tspan> Zone ${e.id} <tspan class="muted">${(e.v / 1000).toFixed(1)}K</tspan></text>`).join('')}
      <g class="chart__cross" hidden><line y1="${m.t}" y2="${m.t + ih}"/>${series.map((s) => `<circle r="4" class="zl-${s.z.id}"/>`).join('')}</g>
      <rect class="chart__hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}"/>
    </svg>
    <div class="chart__tip" hidden></div>
    <table class="sr-only"><caption>People on site per zone</caption><thead><tr><th>Time</th>${series.map((s) => `<th>${s.z.name}</th>`).join('')}</tr></thead>
      <tbody>${series[0].pts.map((p, i) => [p, i]).filter(([, i], _, a) => i % Math.ceil(a.length / 12) === 0).map(([p, i]) => `<tr><td>${fmtX(p.t)}</td>${series.map((s) => `<td>${s.pts[i]?.v ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  const svg = el.querySelector('svg'), cross = el.querySelector('.chart__cross'), tip = el.querySelector('.chart__tip');
  const hit = el.querySelector('.chart__hit');
  hit.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const n = series[0].pts.length;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
    const t = series[0].pts[i].t;
    cross.hidden = false;
    cross.querySelector('line').setAttribute('x1', x(t)); cross.querySelector('line').setAttribute('x2', x(t));
    [...cross.querySelectorAll('circle')].forEach((c, k) => { c.setAttribute('cx', x(t)); c.setAttribute('cy', y(series[k].pts[i].v)); });
    tip.hidden = false;
    tip.innerHTML = `<div class="t-caption-strong">${hours > 24 ? dayIST(t) + ' ' : ''}${hmIST(t)} IST</div>${[...series].sort((a, b) => b.pts[i].v - a.pts[i].v).map((s) => `<div class="chart__tiprow"><i class="zone-sw zone-sw--${s.z.id}"></i>${s.z.name}<b>${num(s.pts[i].v)}</b></div>`).join('')}`;
    const tx = (x(t) / W) * r.width;
    tip.style.left = `${Math.min(r.width - tip.offsetWidth - 4, tx + 12)}px`;
    tip.style.top = `${24}px`;
  });
  hit.addEventListener('pointerleave', () => { cross.hidden = true; tip.hidden = true; });
}

/* -------------------------------------------------------- histogram */
function barChart(el, data) {
  const W = Math.max(280, el.clientWidth), H = Math.max(160, el.clientHeight);
  const m = { l: 36, r: 12, t: 16, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const max = Math.ceil(Math.max(...data) / 10) * 10 || 10;
  const bw = iw / data.length;
  const y = (v) => m.t + ih - (v / max) * ih;
  const total = data.reduce((s, v) => s + v, 0);
  // median bucket
  let acc = 0, med = 0;
  for (let i = 0; i < data.length; i++) { acc += data[i]; if (acc >= total / 2) { med = i; break; } }
  const within4 = data[0] + data[1];
  el.innerHTML = `
    <div class="chart__legend chart__legend--stats"><span><b>${total}</b> dispatches</span><span><b>${Math.round((within4 / total) * 100)}%</b> under 4 min</span><span>median bucket <b>${RESPONSE_BUCKETS[med]} min</b></span></div>
    <svg class="chart__svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Histogram of response times">
      <g class="chart__grid">${[0, 0.5, 1].map((k) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(k * max)}" y2="${y(k * max)}"/><text x="${m.l - 8}" y="${y(k * max) + 4}" text-anchor="end">${k * max}</text>`).join('')}</g>
      ${data.map((v, i) => {
        const x0 = m.l + i * bw + 1, w = bw - 2, h = Math.max(0, ih - (y(v) - m.t));
        const r = Math.min(4, w / 2, h);
        const yy = y(v);
        return `<g class="chart__bar ${i === med ? 'is-median' : ''}" data-i="${i}">
          <path d="M${x0},${m.t + ih} V${yy + r} Q${x0},${yy} ${x0 + r},${yy} H${x0 + w - r} Q${x0 + w},${yy} ${x0 + w},${yy + r} V${m.t + ih} Z"/>
          <rect class="chart__barhit" x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}"/>
          <text x="${x0 + w / 2}" y="${H - 10}" text-anchor="middle" class="chart__xlbl">${RESPONSE_BUCKETS[i]}</text>
        </g>`;
      }).join('')}
      <text x="${m.l + iw}" y="${H - 10}" text-anchor="end" class="chart__unit" dy="0"></text>
    </svg>
    <div class="chart__tip" hidden></div>
    <table class="sr-only"><caption>Response time distribution (minutes)</caption><tr>${RESPONSE_BUCKETS.map((b) => `<th>${b} min</th>`).join('')}</tr><tr>${data.map((v) => `<td>${v}</td>`).join('')}</tr></table>`;
  const tip = el.querySelector('.chart__tip'), svg = el.querySelector('svg');
  el.querySelectorAll('.chart__bar').forEach((g) => {
    g.addEventListener('pointerenter', () => {
      const i = Number(g.dataset.i);
      g.classList.add('is-hover');
      tip.hidden = false;
      tip.innerHTML = `<div class="t-caption-strong">${RESPONSE_BUCKETS[i]} min</div><div class="chart__tiprow">Dispatches<b>${data[i]}</b></div><div class="chart__tiprow">Share<b>${Math.round((data[i] / total) * 100)}%</b></div>`;
      const r = svg.getBoundingClientRect();
      tip.style.left = `${Math.min(r.width - 150, ((m.l + i * bw + bw) / W) * r.width + 4)}px`;
      tip.style.top = `${(y(data[i]) / H) * r.height}px`;
    });
    g.addEventListener('pointerleave', () => { g.classList.remove('is-hover'); tip.hidden = true; });
  });
}
