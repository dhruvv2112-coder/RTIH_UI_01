// Emergency protocol (§5.7): banner, red header, actions panel replacing the
// KPI strip, auto-recording incident timeline, 60 s alarm, confirm to end.
import { icon } from './icons.js';
import { state, set, subscribe, touch } from './store.js';
import { ZONES } from './data.js';
import { esc, timeIST, $ } from './util.js';
import { openModal, confirmDialog, toast, chime } from './ui.js';

let alarmTimer = null;

export function log(text) {
  if (!state.emergency) return;
  state.emergency.timeline.push({ t: Date.now(), text });
  touch('emergency');
}

export function chooseZoneAndActivate(preset) {
  if (preset) return activate(preset);
  const m = openModal({
    title: 'Activate emergency protocol',
    width: 480,
    body: `<p class="t-body">Choose the affected zone. Zone cameras are prioritised, the KPI strip is replaced with emergency actions, and every action is logged to the incident timeline.</p>
      <div class="zone-pick" role="radiogroup" aria-label="Zone">${ZONES.map((z, i) => `
        <label class="zone-pick__opt"><input type="radio" name="ez" value="${z.id}" ${i === 0 ? 'checked' : ''}/><span><b>${z.name}</b><span class="muted t-caption">${esc(z.area)}</span></span></label>`).join('')}</div>
      <p class="t-caption muted">Requires Shift Supervisor role. You are signed in as ${esc(state.user.role)}.</p>`,
    footer: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--danger" data-go>${icon('siren', 18)}Activate protocol</button>`,
  });
  m.el.querySelector('[data-go]').addEventListener('click', () => {
    const z = m.el.querySelector('input[name=ez]:checked').value;
    m.close('go');
    activate(z);
  });
}

export function activate(zone) {
  if (state.emergency) return;
  const z = ZONES.find((x) => x.id === zone);
  set({
    emergency: { zone, startedAt: Date.now(), by: state.user.name, timeline: [], flashUntil: Date.now() + 10000, actionsDone: {} },
    zones: [zone],
    preset: { A: 1, B: 2, C: 3, D: 4 }[zone],
    customGroup: null,
  });
  log(`Protocol activated by ${state.user.name}`);
  setTimeout(() => log(`${z.name} cameras prioritised`), 1800);
  chime('emergency');
  clearInterval(alarmTimer);
  alarmTimer = setInterval(() => chime('emergency'), 60000);
  toast({ type: 'critical', title: `Emergency protocol active — ${z.name}`, desc: 'Emergency actions replace the KPI strip. Alarm repeats every 60 seconds.' });
}

export async function deactivate() {
  const ok = await confirmDialog({
    title: 'End emergency protocol?',
    message: 'Are you sure you want to end emergency protocol? All emergency actions will be stood down.',
    confirmLabel: 'End protocol',
    danger: true,
  });
  if (!ok) return;
  clearInterval(alarmTimer);
  const z = state.emergency.zone;
  set({ emergency: null, zones: [] });
  toast({ type: 'success', title: 'Emergency protocol ended', desc: `Zone ${z} stood down. Timeline saved to the audit log.` });
}

const ACTIONS = [
  { k: 'pa', icon: 'megaphone', label: 'PA advisory', hint: 'Text-to-speech announcement' },
  { k: 'gate', icon: 'door-open', label: 'Gate control', hint: 'Open or close specific gates' },
  { k: 'reroute', icon: 'shuffle', label: 'Reroute traffic', hint: 'Activate diversion plan' },
  { k: 'medical', icon: 'heart-pulse', label: 'Medical alert', hint: 'Dispatch medical team' },
  { k: 'escalate', icon: 'phone-call', label: 'Escalate to district', hint: 'Notify district administration' },
];

export function mountEmergencyPanel(root) {
  const render = () => {
    const e = state.emergency;
    if (!e) { root.innerHTML = ''; return; }
    root.innerHTML = `
      <h2 class="t-h2 em__title">${icon('siren', 20)}Emergency actions</h2>
      <div class="em__actions">
        ${ACTIONS.map((a) => `<button class="em__btn ${e.actionsDone[a.k] ? 'is-done' : ''}" data-em="${a.k}">${icon(a.icon, 20)}<span><b>${a.label}</b><span class="t-caption">${e.actionsDone[a.k] ? esc(e.actionsDone[a.k]) : a.hint}</span></span>${e.actionsDone[a.k] ? icon('check-circle', 18) : icon('chevron-right', 18)}</button>`).join('')}
        <button class="em__btn em__btn--stop" data-em="stop">${icon('octagon-x', 20)}<span><b>Deactivate</b><span class="t-caption">End emergency protocol</span></span></button>
      </div>
      <h3 class="t-caption-strong lbl em__tl-title">Incident timeline <span class="em__rec"><i></i>Recording</span></h3>
      <ol class="em__timeline scroll-thin">${[...e.timeline].reverse().map((x) => `<li><span class="t-mono">${timeIST(x.t)}</span><span>${esc(x.text)}</span></li>`).join('')}</ol>`;
  };
  render();
  subscribe('emergency', render);

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-em]');
    if (!b) return;
    const k = b.dataset.em;
    if (k === 'stop') return deactivate();
    const done = (summary) => { state.emergency.actionsDone[k] = summary; log(summary); };
    if (k === 'pa') {
      const m = openModal({
        title: 'PA advisory', width: 520,
        body: `<label class="field"><span class="t-caption-strong lbl">Speakers</span><div class="seg" role="group">${['All Zone ' + state.emergency.zone, 'Ghat area only', 'Approach roads'].map((s, i) => `<button aria-pressed="${i === 0}" data-spk="${s}">${s}</button>`).join('')}</div></label>
          <label class="field"><span class="t-caption-strong lbl">Language</span><div class="seg" role="group">${['Telugu', 'Hindi', 'English'].map((s, i) => `<button aria-pressed="${i < 2}" data-lang="${s}">${s}</button>`).join('')}</div></label>
          <label class="field"><span class="t-caption-strong lbl">Message</span><textarea class="input" rows="4" data-msg>Please move slowly towards the East Corridor exit. Follow the instructions of the volunteers. Do not push.</textarea></label>`,
        footer: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" data-go>${icon('megaphone', 18)}Broadcast</button>`,
      });
      m.el.addEventListener('click', (e) => { const s = e.target.closest('[data-spk],[data-lang]'); if (s) { if (s.dataset.spk) m.el.querySelectorAll('[data-spk]').forEach((x) => x.setAttribute('aria-pressed', String(x === s))); else s.setAttribute('aria-pressed', String(s.getAttribute('aria-pressed') !== 'true')); } });
      m.el.querySelector('[data-go]').addEventListener('click', () => {
        const spk = m.el.querySelector('[data-spk][aria-pressed=true]').dataset.spk;
        const langs = [...m.el.querySelectorAll('[data-lang][aria-pressed=true]')].map((x) => x.dataset.lang).join(' + ');
        m.close(); done(`PA advisory broadcast — ${spk} (${langs})`);
        toast({ type: 'success', title: 'PA advisory broadcast', desc: `${spk} · ${langs}` });
      });
    }
    if (k === 'gate') {
      const gates = ['Gate 1 — Bund Road', 'Gate 2 — Station Rd', 'Gate 3 — East Corridor', 'Gate 4 — Temple Street'];
      const m = openModal({
        title: 'Gate control', width: 480,
        body: `<ul class="gate-list">${gates.map((g, i) => `<li><span>${g}</span><label class="switch"><input type="checkbox" ${i !== 0 ? 'checked' : ''} data-gate="${g}"/><span class="switch__track"></span><span class="t-caption" data-gl>${i !== 0 ? 'Open' : 'Closed'}</span></label></li>`).join('')}</ul>
          <p class="t-caption muted">Gate commands are sent to field marshals and the gate PLCs. Changes apply in about 20 seconds.</p>`,
        footer: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" data-go>Apply gate changes</button>`,
      });
      m.el.addEventListener('change', (e) => { const l = e.target.closest('label').querySelector('[data-gl]'); l.textContent = e.target.checked ? 'Open' : 'Closed'; });
      m.el.querySelector('[data-go]').addEventListener('click', () => {
        const closed = [...m.el.querySelectorAll('[data-gate]')].filter((x) => !x.checked).map((x) => x.dataset.gate.split(' — ')[0]);
        m.close(); done(`Gates updated — ${closed.length ? closed.join(', ') + ' closed' : 'all open'}`);
      });
    }
    if (k === 'reroute') { done('Diversion plan D-2 activated via NH-216A'); toast({ type: 'success', title: 'Diversion plan active', desc: 'Traffic police notified; VMS boards updated.' }); }
    if (k === 'medical') { done('Medical team M-3 dispatched with ALS ambulance'); toast({ type: 'success', title: 'Medical alert sent', desc: 'Team M-3 en route — ETA 4 min' }); }
    if (k === 'escalate') {
      confirmDialog({ title: 'Escalate to district administration?', message: 'The District Collector control room and SP office will be notified by phone and SMS with the current incident summary.', confirmLabel: 'Escalate' })
        .then((ok) => { if (ok) { done('Escalated to District Collector control room'); toast({ type: 'warning', title: 'District administration notified', desc: 'Call-back expected within 5 minutes.' }); } });
    }
  });
}

export function mountEmergencyBanner(root) {
  const render = () => {
    const e = state.emergency;
    document.documentElement.classList.toggle('is-emergency', !!e);
    if (!e) { root.hidden = true; root.innerHTML = ''; return; }
    const z = ZONES.find((x) => x.id === e.zone);
    root.hidden = false;
    root.innerHTML = `<div class="em-banner ${Date.now() < e.flashUntil ? 'is-flashing' : ''}" role="alert">
      ${icon('siren', 20)}<span>Emergency protocol active — ${z.name.toUpperCase()} · ${esc(z.area)}</span>${icon('siren', 20)}
      <span class="em-banner__meta t-mono">since ${timeIST(e.startedAt)} IST · ${esc(e.by)}</span>
    </div>`;
    if (Date.now() < e.flashUntil) setTimeout(() => root.querySelector('.em-banner')?.classList.remove('is-flashing'), e.flashUntil - Date.now());
  };
  render();
  let on = !!state.emergency;
  // timeline entries also emit 'emergency'; only rebuild when toggled
  subscribe('emergency', (s) => { if (!!s.emergency !== on) { on = !!s.emergency; render(); } });
}
