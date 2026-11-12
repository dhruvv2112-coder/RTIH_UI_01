// KPI strip (§5.3): label, trend arrow + %, display value, 24-point sparkline.
import { icon } from './icons.js';
import { state, subscribe, openAlerts } from './store.js';
import { num, sparkPath, $ } from './util.js';

export function kpiValue(k) {
  if (k.id === 'incidents') return openAlerts().length;
  return k.value;
}

function trendTone(k) {
  // green when a positive KPI rises or a negative KPI falls (§5.3)
  if (k.good === 'neutral') return 'neutral';
  const up = k.trend >= 0;
  return (k.good === 'up') === up ? 'good' : 'bad';
}

export function kpiCardHTML(k, { compact = false } = {}) {
  const v = kpiValue(k);
  const tone = trendTone(k);
  const sp = sparkPath(k.spark, 200, 24);
  return `<div class="kpi" data-kpi="${k.id}">
    <div class="kpi__top">
      <span class="kpi__label">${k.label}</span>
      <span class="kpi__trend kpi__trend--${tone}" aria-label="${k.trend >= 0 ? 'up' : 'down'} ${Math.abs(k.trend)} percent">${icon(k.trend >= 0 ? 'trending-up' : 'trending-down', 16)}${k.trend >= 0 ? '+' : ''}${k.trend}%</span>
    </div>
    <div class="kpi__value">${num(v, k.decimals || 0)}${k.id === 'response' ? '<span class="kpi__unit-inline">m</span>' : ''}</div>
    ${compact ? '' : `<div class="kpi__unit">${k.unit}</div>`}
    <svg class="kpi__spark" viewBox="0 0 200 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="${sp.area}" class="kpi__spark-area"/><path d="${sp.line}" class="kpi__spark-line" vector-effect="non-scaling-stroke"/>
    </svg>
  </div>`;
}

export function mountKPIs(root) {
  const render = () => {
    root.innerHTML = `<h2 class="sr-only">Key indicators</h2><div class="kpi-grid">${state.kpis.map((k) => kpiCardHTML(k)).join('')}</div>`;
  };
  render();
  subscribe(['kpis', 'alerts'], render);
  return { render };
}

/* Light drift so numbers feel live (stands in for wss://s2.local/ws/kpi). */
export function startKPISimulation(touch) {
  let tick = 0;
  setInterval(() => {
    tick++;
    const k = Object.fromEntries(state.kpis.map((x) => [x.id, x]));
    k.crowd.value = Math.max(9000, Math.round(k.crowd.value + (Math.random() - 0.42) * 140));
    if (tick % 3 === 0) { k.pilgrims.value += Math.round(20 + Math.random() * 60); }
    if (tick % 6 === 0) { k.staff.value = Math.max(80, Math.min(92, k.staff.value + (Math.random() > 0.5 ? 1 : -1))); }
    for (const x of state.kpis) {
      if (x.id === 'incidents') { x.spark = [...x.spark.slice(1), openAlerts().length]; continue; }
      if (tick % 3 === 0) x.spark = [...x.spark.slice(1), x.value];
    }
    touch('kpis');
  }, 10000);
}

export { $ };
