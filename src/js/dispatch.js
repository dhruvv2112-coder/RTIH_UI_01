// Dispatch dialog (§5.6): staff radio list sorted by distance, auto-selects
// the nearest available person, priority, instruction, loading state.
import { icon } from './icons.js';
import { state, touch } from './store.js';
import { ALERT_TYPES, ROLE_COLOURS } from './data.js';
import { esc, toMetres, $, $$ } from './util.js';
import { openModal, toast, chime } from './ui.js';
import { sevShape, SEV_LABEL } from './alerts.js';

export function openDispatch(alert, { at = null, onDone } = {}) {
  const loc = alert?.location || at;
  const staff = state.staff
    .filter((s) => s.status !== 'off')
    .map((s) => ({ ...s, dist: toMetres(loc, s.pos) }))
    .sort((a, b) => a.dist - b.dist);
  const firstAvail = staff.find((s) => s.status === 'available');
  const eta = (d) => Math.max(1, Math.round(d / 75)); // ~4.5 km/h through crowds
  const t = alert ? ALERT_TYPES[alert.type] : null;
  const linked = document.documentElement.dataset.live === 'on';

  const m = openModal({
    title: 'Dispatch staff to incident',
    width: 480,
    className: 'dispatch',
    body: `
      <section class="dispatch__summary" aria-label="Incident summary">
        <div class="t-caption-strong lbl">Incident summary</div>
        ${alert ? `<div class="dispatch__incident sev-${alert.severity}">
          <span class="dispatch__ic">${icon(t.icon, 20)}</span>
          <div><div class="t-h3">${esc(alert.title)}</div><div class="t-body muted">${esc(alert.desc)}</div></div>
        </div>` : `<div class="dispatch__incident sev-medium"><span class="dispatch__ic">${icon('map-pin', 20)}</span><div><div class="t-h3">Ad-hoc dispatch to map location</div><div class="t-body muted t-mono">Map ref ${loc.map((v) => v.toFixed(0)).join(', ')}</div></div></div>`}
      </section>
      <section class="dispatch__staff" aria-label="Recommended staff">
        <div class="row between"><span class="t-caption-strong lbl">Recommended staff <span class="muted">(auto-selected)</span></span><span class="t-caption muted">${staff.length} on duty</span></div>
        <label class="input-icon"><span class="sr-only">Search staff</span>${icon('search', 16)}<input class="input" type="search" placeholder="Search by name or role" data-staff-search/></label>
        <div class="staff-list scroll-thin" role="radiogroup" aria-label="Staff">
          ${staff.map((s) => `
            <label class="staff-opt ${s.status === 'on-task' ? 'is-busy' : ''}" data-name="${esc(s.name.toLowerCase())} ${s.role.toLowerCase()}">
              <input type="radio" name="staff" value="${s.id}" ${firstAvail && s.id === firstAvail.id ? 'checked' : ''}/>
              <span class="staff-opt__radio" aria-hidden="true"></span>
              <span class="avatar avatar--sm" style="--role:${ROLE_COLOURS[s.role]}">${s.name.split(' ').map((p) => p[0]).join('').slice(0, 2)}</span>
              <span class="staff-opt__main">
                <span class="t-body-strong">${esc(s.name)} <span class="muted t-body">— ${s.role}, ${s.dist} m</span>${linked && s.id === 'ST-001' ? ` <span class="chip chip--app">${icon('smartphone', 12)}Field app</span>` : ''}</span>
                <span class="t-caption staff-opt__status"><span class="status-dot status-dot--${s.status === 'available' ? 'ok' : 'warn'}" aria-hidden="true"></span>${s.status === 'available' ? 'Available' : '<em>On task</em>'} · ETA ~${eta(s.dist)} min</span>
              </span>
            </label>`).join('')}
        </div>
      </section>
      <div class="dispatch__row">
        <label class="field field--inline"><span class="t-caption-strong lbl">Priority</span>
          <span class="select-wrap"><select class="input" data-priority>
            ${['critical', 'high', 'medium', 'low'].map((p) => `<option value="${p}" ${alert?.severity === p ? 'selected' : ''}>${SEV_LABEL[p]}</option>`).join('')}
          </select>${icon('chevron-down', 16)}</span></label>
      </div>
      <label class="field"><span class="t-caption-strong lbl">Instruction</span>
        <textarea class="input" rows="3" data-instruction placeholder="What should the responder do on arrival?">${esc(alert?.suggestion || '')}</textarea></label>`,
    footer: `<button class="btn btn--ghost" data-close>Cancel</button>
             <button class="btn btn--primary btn--lg" data-dispatch ${firstAvail ? '' : 'disabled'}>${icon('send', 18)}<span>Dispatch</span></button>`,
  });

  const btn = $('[data-dispatch]', m.el);
  m.el.addEventListener('change', (e) => { if (e.target.name === 'staff') btn.disabled = false; });
  $('[data-staff-search]', m.el).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('.staff-opt', m.el).forEach((o) => { o.hidden = q && !o.dataset.name.includes(q); });
  });
  btn.addEventListener('click', () => {
    const id = $('input[name=staff]:checked', m.el)?.value;
    if (!id) return;
    const s = state.staff.find((x) => x.id === id);
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Dispatching…</span>`;
    setTimeout(() => {
      const prev = alert ? { state: alert.state, assignee: alert.assignee, severity: alert.severity } : null;
      const sPrev = { status: s.status, task: s.task };
      if (alert) {
        alert.state = 'dispatched'; alert.assignee = s.name;
        alert.severity = $('[data-priority]', m.el).value;
      }
      s.status = 'on-task'; s.task = alert ? alert.title : 'Ad-hoc dispatch';
      touch('alerts', 'staff');
      m.close('done');
      document.dispatchEvent(new CustomEvent('gc:dispatched', { detail: { alert, staff: s, priority: $('[data-priority]', m.el).value, instruction: $('[data-instruction]', m.el).value.trim(), dist: toMetres(loc, s.pos), eta: Math.max(1, Math.round(toMetres(loc, s.pos) / 75)) } }));
      chime('success');
      const dist = toMetres(loc, s.pos);
      toast({
        type: 'success',
        title: alert ? `Staff dispatched to Zone ${alert.zone}` : 'Staff dispatched',
        desc: `${s.name} en route — ETA ${Math.max(1, Math.round(dist / 75))} min`,
        action: { label: 'Recall', run: () => { document.dispatchEvent(new CustomEvent('gc:recalled', { detail: { alert } })); if (alert) Object.assign(alert, prev); Object.assign(s, sPrev); touch('alerts', 'staff'); toast({ type: 'info', title: 'Dispatch recalled', desc: `${s.name} is available again.` }); } },
        life: 30000,
      });
      onDone?.(s);
    }, 900);
  });
  return m;
}
