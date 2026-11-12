// Command palette (Ctrl+K, §6) with fuzzy matching, and the "?" overlay.
import { icon } from './icons.js';
import { state } from './store.js';
import { CAMERAS, ZONES, FACILITIES, FACILITY_STYLE, ALERT_TYPES } from './data.js';
import { esc, $, $$ } from './util.js';
import { openModal } from './ui.js';

function fuzzy(q, text) {
  // subsequence match; returns score + highlighted html, or null
  if (!q) return { score: 0, html: esc(text) };
  const t = text.toLowerCase(), qq = q.toLowerCase();
  const direct = t.indexOf(qq);
  if (direct >= 0) {
    return { score: 100 - direct, html: esc(text.slice(0, direct)) + '<mark>' + esc(text.slice(direct, direct + q.length)) + '</mark>' + esc(text.slice(direct + q.length)) };
  }
  let i = 0, score = 0, html = '', last = -2;
  for (let j = 0; j < text.length; j++) {
    if (i < qq.length && t[j] === qq[i]) { html += `<mark>${esc(text[j])}</mark>`; score += last === j - 1 ? 3 : 1; last = j; i++; }
    else html += esc(text[j]);
  }
  return i === qq.length && score >= qq.length + 2 ? { score, html } : null;
}

export function openPalette(actions, initial = '') {
  const items = [
    { group: 'Actions', icon: 'map', label: 'Open map focus', run: () => actions.view('map'), kbd: 'Space' },
    { group: 'Actions', icon: 'rewind', label: 'Open replay at 14:00', run: () => actions.view('replay') , kbd: 'R' },
    { group: 'Actions', icon: 'bar-chart-3', label: 'Open analytics', run: () => actions.view('analytics'), kbd: 'Alt+3' },
    { group: 'Actions', icon: 'moon', label: 'Toggle night theme', run: () => actions.toggleTheme(), kbd: 'N' },
    { group: 'Actions', icon: 'siren', label: 'Activate emergency protocol…', run: () => actions.emergency() },
    { group: 'Actions', icon: 'keyboard', label: 'Show keyboard shortcuts', run: () => actions.shortcuts(), kbd: '?' },
    ...ZONES.map((z) => ({ group: 'Zones', icon: 'alert-triangle', label: `Show ${z.name} alerts`, sub: z.area, run: () => actions.zoneAlerts(z.id) })),
    ...ZONES.map((z) => ({ group: 'Zones', icon: 'send', label: `Dispatch to ${z.name}`, sub: z.area, run: () => actions.dispatchZone(z.id) })),
    ...state.alerts.filter((a) => a.state !== 'resolved').map((a) => ({ group: 'Alerts', icon: ALERT_TYPES[a.type].icon, label: a.title, sub: a.desc, run: () => actions.focusAlert(a.id), sev: a.severity })),
    ...CAMERAS.map((c) => ({ group: 'Cameras', icon: c.status === 'offline' ? 'camera-off' : 'camera', label: `Go to camera ${c.id}`, sub: c.place, run: () => actions.openCam(c.id) })),
    ...state.staff.map((s) => ({ group: 'Staff', icon: 'user', label: s.name, sub: `${s.role} · Zone ${s.zone} · ${s.status === 'available' ? 'available' : s.status === 'on-task' ? 'on task' : 'off duty'}`, run: () => actions.staffOnMap(s.id) })),
    ...FACILITIES.map((f) => ({ group: 'Facilities', icon: FACILITY_STYLE[f.type].icon, label: f.name, sub: f.status === 'operational' ? 'Operational' : 'Down', run: () => actions.facilityOnMap(f.id) })),
  ];

  const m = openModal({
    width: 560,
    className: 'palette',
    labelledBy: 'pal-input',
    body: `
      <div class="palette__input">${icon('search', 20)}<input id="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="Search cameras, alerts, staff, zones, facilities…" autocomplete="off" value="${esc(initial)}" autofocus/><kbd>Esc</kbd></div>
      <ul class="palette__list scroll-thin" id="pal-list" role="listbox"></ul>
      <div class="palette__foot t-caption"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>`,
  });
  const input = $('input', m.el), list = $('.palette__list', m.el);
  let active = 0, shown = [];

  const render = () => {
    const q = input.value.trim();
    shown = items.map((it) => {
      const subHit = q && it.sub && it.sub.toLowerCase().includes(q.toLowerCase()) ? fuzzy(q, it.sub) : null;
      const f = fuzzy(q, it.label) || (subHit ? { score: subHit.score / 2, html: esc(it.label), subHtml: subHit.html } : null);
      return f ? { ...it, ...f } : null;
    }).filter(Boolean);
    if (q) shown.sort((a, b) => b.score - a.score);
    else shown = shown.filter((x) => x.group !== 'Cameras' && x.group !== 'Facilities').slice(0, 14);
    shown = shown.slice(0, 40);
    active = Math.min(active, Math.max(0, shown.length - 1));
    let g = '';
    list.innerHTML = shown.length ? shown.map((it, i) => {
      const head = it.group !== g ? `<li class="palette__group t-caption-strong" role="presentation">${it.group}</li>` : '';
      g = it.group;
      return `${head}<li role="option" id="pal-${i}" class="palette__item ${i === active ? 'is-active' : ''}" aria-selected="${i === active}" data-i="${i}">
        <span class="palette__ic ${it.sev ? `sev-${it.sev}` : ''}">${icon(it.icon, 18)}</span>
        <span class="palette__txt"><span class="t-body">${it.html}</span>${it.sub ? `<span class="t-caption muted">${it.subHtml || esc(it.sub)}</span>` : ''}</span>
        ${it.kbd ? `<kbd>${it.kbd}</kbd>` : icon('arrow-right', 16, 'palette__go')}
      </li>`;
    }).join('') : `<li class="palette__empty t-body muted">Nothing matches “${esc(q)}”. Try a camera ID like A-12, a staff name, or a zone.</li>`;
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${active}` : '');
  };
  const go = (i) => { const it = shown[i]; if (!it) return; m.close('pick'); setTimeout(() => it.run(), 60); };

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); render(); list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); go(active); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) go(Number(li.dataset.i)); });
  list.addEventListener('mousemove', (e) => { const li = e.target.closest('[data-i]'); if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); $$('.palette__item', list).forEach((x) => { const on = Number(x.dataset.i) === active; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', String(on)); }); } });
  render();
  setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 30);
}

const SHORTCUTS = [
  ['Space', 'Any', 'Toggle camera grid ↔ full-screen map'],
  ['1 – 9', 'Camera grid', 'Select camera preset group'],
  ['A', 'Any', 'Focus alert queue, select first unread alert'],
  ['D', 'Alert selected', 'Open dispatch dialog for selected alert'],
  ['Esc', 'Any overlay', 'Close overlay, return to default view'],
  ['F', 'Any', 'Toggle full-screen browser mode'],
  ['R', 'Camera grid', 'Enter replay mode'],
  ['Enter', 'Camera selected', 'Enlarge selected camera'],
  ['← →', 'Camera grid', 'Move between cameras'],
  ['↑ ↓', 'Alert queue', 'Move between alerts'],
  ['Tab / Shift+Tab', 'Standard', 'Cycle focusable elements'],
  ['Ctrl+K', 'Any', 'Open command palette'],
  ['N', 'Any', 'Toggle night / day theme'],
  ['?', 'Any', 'Show this overlay'],
  ['Alt+1 – Alt+4', 'Any', 'Live / Replay / Analytics / Map'],
];

export function openShortcuts() {
  openModal({
    title: 'Keyboard shortcuts',
    width: 640,
    className: 'shortcuts',
    body: `<table class="kbd-table"><thead><tr><th>Key</th><th>Where</th><th>Action</th></tr></thead><tbody>
      ${SHORTCUTS.map(([k, c, a]) => `<tr><td>${k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ')}</td><td class="muted">${c}</td><td>${a}</td></tr>`).join('')}
    </tbody></table>`,
    footer: '<button class="btn btn--primary" data-close>Got it</button>',
  });
}
