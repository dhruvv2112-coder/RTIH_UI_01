// Screen 1 — Tasks (Home) · Brief §4.1, §5.3
import { icon } from '../icons.js';
import { state, byStatus, activeTask, acceptTask, completeTask, setOnline } from '../store.js';
import { KIND_META } from '../data.js';
import { esc, ago, dueIn, dueTone, istHM, haptic, longPress, $, $$ } from '../util.js';
import { toast, burst } from '../ui.js';
import { actions } from '../bus.js';

const PRIO_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' };

export function syncChip(t) {
  if (t.pendingSync) return `<span class="sync-chip c-warning">${icon('cloud-off')}Queued</span>`;
  return '';
}

function activeCard(t) {
  if (!t) {
    return `<div class="card empty-active">${icon('play-circle')}<div class="t-h3 c-primary">No active task</div><div class="t-caption">Swipe an incoming task right to accept it.</div></div>`;
  }
  const urgent = t.priority === 'urgent';
  return `
  <article class="card active-card ${urgent ? 'is-urgent' : ''}" data-active="${t.id}" tabindex="0" aria-label="Active task: ${esc(t.title)}. Press and hold for quick actions.">
    <div class="active-card__top">
      <span class="pill pill--${t.priority}">${urgent ? '<span class="pulse-dot"></span>' : ''}${PRIO_LABEL[t.priority]}</span>
      <span class="status t-caption-strong c-normal">${icon('play-circle')}ACTIVE TASK</span>
    </div>
    <h2 class="t-h2 active-card__title">${esc(t.title)}</h2>
    <div class="meta-row t-body">${icon('map-pin')}<span>${esc(t.location)}</span><span class="c-tertiary">·</span><span>${t.distance}m</span></div>
    <div class="meta-row t-mono" style="margin-top:4px">${icon('clock')}<span>Dispatched ${ago(t.dispatchedAt)} · ${istHM(t.dispatchedAt)} IST</span></div>
    <div class="progress" role="progressbar" aria-valuenow="${t.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Task progress">
      <div class="progress__labels t-caption"><span class="c-secondary">Progress · ${t.notes?.length || 0} updates</span><span class="t-caption-strong c-normal">${t.progress}%</span></div>
      <div class="progress__track"><div class="progress__fill" style="width:${t.progress}%"></div></div>
    </div>
    <div class="btn-row">
      <button class="btn btn--outline" data-act="navigate">${icon('navigation')}Navigate</button>
      <button class="btn btn--success hold" data-act="complete" aria-label="Complete task — press and hold for 1 second"><span class="hold__fill"></span><span class="hold__label">${icon('check-circle-2')}Complete</span></button>
    </div>
    <div class="longpress-hint t-caption">Hold card for quick actions · Swipe right for details</div>
    ${syncChip(t) ? `<div style="position:absolute;top:16px;right:120px">${syncChip(t)}</div>` : ''}
  </article>`;
}

function incomingCard(t) {
  const meta = KIND_META[t.kind] || KIND_META.report;
  const tone = t.tone || t.priority;
  const tint = { urgent: 'tint-urgent', high: 'tint-high', normal: 'tint-normal', low: 'tint-low', info: 'tint-info' }[tone];
  const due = t.dueAt
    ? `<span class="incoming__due t-caption c-${dueTone(t.dueAt)}">${dueIn(t.dueAt)}</span>`
    : `<span class="incoming__due t-caption c-${tone === 'info' ? 'info' : 'secondary'}">Assigned ${ago(t.dispatchedAt)}</span>`;
  return `
  <div class="swipe" data-swipe="${t.id}">
    <div class="swipe__under swipe__under--accept" aria-hidden="true"><span class="swipe__under-side">${icon('check', { stroke: 3 })}Accept</span></div>
    <div class="swipe__under swipe__under--decline" aria-hidden="true" style="opacity:0"><span class="swipe__under-side">Decline${icon('x', { stroke: 3 })}</span></div>
    <article class="card card--prio prio-${t.priority} swipe__card" tabindex="0" role="button" aria-label="${esc(t.title)}, ${esc(t.subtitle || t.location)}. Opens details with accept and decline.">
      <div class="incoming__head">
        <div class="incoming__icon ${tint}">${icon(meta.icon)}</div>
        <div class="incoming__body">
          <h3 class="t-h3 incoming__title">${esc(t.title)}</h3>
          <div class="t-body c-secondary">${esc(t.subtitle || t.location)}</div>
        </div>
      </div>
      <div class="incoming__foot t-caption">
        <span class="t-mono c-tertiary">${t.id}</span>
        ${due}
      </div>
      <div class="incoming__foot t-caption" style="border-top:0;margin-top:0;padding-top:4px">
        <span class="swipe-hint">${icon('chevrons-left')}Decline</span>
        <span class="c-tertiary">${t.distance ? `${t.distance}m · ${t.eta} min` : ''}</span>
        <span class="swipe-hint">Accept${icon('chevrons-right')}</span>
      </div>
    </article>
  </div>`;
}

function upNextCard(t) {
  return `
  <button class="card card--prio prio-${t.priority} done-card" style="background:var(--color-bg-secondary)" data-open="${t.id}">
    ${icon(KIND_META[t.kind]?.icon || 'inbox')}
    <div class="done-card__body">
      <div class="t-h3 c-primary" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
      <div class="t-caption c-secondary">${esc(t.location)} · Accepted ${ago(t.acceptedAt)} ${syncChip(t)}</div>
    </div>
    ${icon('chevron-right', { cls: 'chev' })}
  </button>`;
}

function doneCard(t) {
  return `
  <button class="card done-card" data-open="${t.id}" aria-label="Completed: ${esc(t.title)}">
    ${icon('check-circle-2')}
    <div class="done-card__body">
      <div class="t-body done-card__title">${esc(t.title)}</div>
      <div class="t-caption c-tertiary">Completed ${ago(t.completedAt)} · ${t.duration} min dur. ${t.pendingSync ? syncChip(t) : ''}</div>
    </div>
    ${icon('chevron-right', { cls: 'chev' })}
  </button>`;
}

export function renderTasks() {
  const active = activeTask();
  const incoming = byStatus('incoming');
  const upNext = byStatus('accepted');
  const done = byStatus('completed').sort((a, b) => b.completedAt - a.completedAt);
  return `
  <div class="pull-indicator t-caption-strong" id="pull">${icon('refresh-cw', { cls: 'spin' })}<span>Syncing tasks…</span></div>
  <div class="content__pad screen-enter" style="padding-bottom:104px">
    ${activeCard(active)}
    ${upNext.length ? `
      <div class="section-h t-caption-strong" style="text-transform:uppercase">Up Next <span class="section-h__count">${upNext.length}</span></div>
      ${upNext.map(upNextCard).join('')}` : ''}
    <div class="section-h t-caption-strong" style="text-transform:uppercase">Incoming <span class="section-h__count">${incoming.length}</span>
      <span class="section-h__aside t-caption c-tertiary">Swipe to respond</span></div>
    <div class="incoming-grid">
      ${incoming.length ? incoming.map(incomingCard).join('') : `<div class="card empty-active">${icon('inbox')}<div class="t-h3 c-primary">All caught up</div><div class="t-caption">New dispatches will appear here.</div></div>`}
    </div>
    <div class="section-h t-caption-strong" style="text-transform:uppercase">Completed Today <span class="section-h__count">${done.length}</span></div>
    ${done.map(doneCard).join('')}
  </div>
  <button class="fab" id="sos" aria-label="SOS Emergency — press and hold for 1.5 seconds">
    <svg class="fab__ring" viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="32" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="201" stroke-dashoffset="201" transform="rotate(-90 34 34)"/></svg>
    <span class="fab__inner">${icon('phone-call')}SOS</span>
  </button>`;
}

/* ---------- interactions ---------- */
export function bindTasks(root) {
  const act = $('[data-active]', root);
  if (act) {
    const id = act.dataset.active;
    // Long-press 1s → quick actions (§4.1)
    longPress(act, 1000, {
      onStart: (e) => { if (!e.target.closest('button')) act.classList.add('is-pressing'); },
      onCancel: () => act.classList.remove('is-pressing'),
      onDone: (e) => { act.classList.remove('is-pressing'); if (e.target.closest('button')) return; act.dataset.longFired = '1'; haptic('medium'); actions.openQuick(id); },
    });
    // Swipe right → details
    let sx = null;
    act.addEventListener('pointerdown', (e) => { sx = e.clientX; delete act.dataset.longFired; });
    act.addEventListener('pointerup', (e) => {
      if (sx == null || e.target.closest('button')) { sx = null; return; }
      const dx = e.clientX - sx; sx = null;
      if (dx > 60) actions.openTask(id);
      else if (Math.abs(dx) < 6 && !act.dataset.longFired) actions.openTask(id);
    });
    $('[data-act="navigate"]', act).addEventListener('click', () => { haptic('light'); actions.navigate('map'); });
    bindHoldComplete($('[data-act="complete"]', act), id);
  }

  $$('[data-open]', root).forEach((b) => b.addEventListener('click', () => actions.openTask(b.dataset.open)));
  $$('[data-swipe]', root).forEach(bindSwipe);
  bindPull(root);
  bindSOS($('#sos', root));
}

export function bindHoldComplete(btn, id, after) {
  if (!btn) return;
  let fired = false;
  longPress(btn, 1000, {
    onStart: () => { fired = false; btn.classList.add('is-holding'); haptic('light'); },
    onCancel: () => { btn.classList.remove('is-holding'); if (!fired) toast('Hold for 1 second to complete', 'info', 1600); },
    onDone: async () => {
      fired = true;
      btn.classList.remove('is-holding');
      const res = completeTask(id);
      after?.();
      await burst('Task completed', res.queued ? 'Saved offline — will sync' : 'Command Centre notified');
      toast(res.queued ? 'Completion queued — syncs when online' : 'Task completed successfully ✓', res.queued ? 'warning' : 'success');
      actions.navigate('tasks');
    },
  });
}

function bindSwipe(wrap) {
  const id = wrap.dataset.swipe;
  const card = $('.swipe__card', wrap);
  const acc = $('.swipe__under--accept', wrap);
  const dec = $('.swipe__under--decline', wrap);
  const accSide = $('.swipe__under-side', acc);
  const decSide = $('.swipe__under-side', dec);
  const TH = 80;
  let sx, sy, dx = 0, mode = null, crossed = false, pid;

  const paint = () => {
    card.style.transform = `translateX(${dx}px) rotate(${dx / 60}deg)`;
    const p = Math.min(1, Math.abs(dx) / TH);
    acc.style.opacity = dx > 0 ? 1 : 0; dec.style.opacity = dx < 0 ? 1 : 0;
    const side = dx > 0 ? accSide : decSide;
    side.style.opacity = p; side.style.transform = `scale(${0.5 + 0.5 * p})`;
    if (Math.abs(dx) >= TH && !crossed) { crossed = true; haptic('medium'); }
    if (Math.abs(dx) < TH) crossed = false;
  };
  const reset = () => { card.classList.add('is-settling'); dx = 0; paint(); setTimeout(() => card.classList.remove('is-settling'), 300); };

  card.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; dx = 0; mode = null; pid = e.pointerId; card.classList.remove('is-settling'); });
  card.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!mode) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) { mode = 'x'; card.setPointerCapture(pid); }
      else if (Math.abs(my) > 8) { mode = 'y'; }
    }
    if (mode === 'x') { e.preventDefault(); dx = mx; paint(); }
  });
  const end = () => {
    if (sx == null) return;
    const wasMode = mode; sx = null;
    if (wasMode !== 'x') { if (!wasMode) actions.openTask(id); return; }
    if (dx > TH) commit('right');
    else if (dx < -TH) commit('left');
    else reset();
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', () => { sx = null; reset(); });
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); actions.openTask(id); } });

  function collapse(cb) {
    wrap.style.height = wrap.offsetHeight + 'px';
    requestAnimationFrame(() => { wrap.style.height = '0px'; wrap.style.marginBottom = '0px'; wrap.style.opacity = '0'; });
    setTimeout(cb, 300);
  }
  function commit(dir) {
    card.classList.add('is-leaving');
    if (dir === 'right') {
      card.classList.add('is-accepted');
      card.style.transform = 'translateX(115%) rotate(4deg)';
      haptic('medium');
      setTimeout(() => collapse(() => {
        const res = acceptTask(id);
        toast(res.queued ? 'Accepted offline — queued' : res.becameActive ? 'Task accepted — now active' : 'Task accepted — added to Up Next', res.queued ? 'warning' : 'success');
      }), 220);
    } else {
      card.style.transform = 'translateX(-115%) rotate(-4deg)';
      setTimeout(() => actions.openDecline(id, {
        onCancel: () => { card.classList.remove('is-leaving'); reset(); },
      }), 200);
    }
  }
}

function bindPull(root) {
  const content = root.closest('.content');
  const pull = $('#pull', root);
  if (!content || !pull) return;
  let sy = null, armed = false;
  content.onpointerdown = (e) => { if (content.scrollTop <= 0 && !e.target.closest('.swipe, [data-active], .fab')) sy = e.clientY; };
  content.onpointermove = (e) => { if (sy != null && e.clientY - sy > 70 && !armed) { armed = true; haptic('light'); pull.classList.add('is-visible'); } };
  content.onpointerup = () => {
    if (armed) {
      setTimeout(() => {
        pull.classList.remove('is-visible');
        toast(state.online ? 'Tasks up to date' : 'Offline — showing cached tasks', state.online ? 'success' : 'warning', 1800);
      }, 1200);
    }
    sy = null; armed = false;
  };
}

function bindSOS(btn) {
  if (!btn) return;
  const ring = btn.querySelector('circle');
  longPress(btn, 1500, {
    onStart: () => { haptic('light'); ring.style.transition = 'stroke-dashoffset 1500ms linear'; ring.style.strokeDashoffset = '0'; },
    onCancel: () => { ring.style.transition = 'stroke-dashoffset 200ms'; ring.style.strokeDashoffset = '201'; },
    onDone: () => { ring.style.strokeDashoffset = '201'; actions.openEmergency(); },
  });
  btn.addEventListener('click', (e) => e.preventDefault());
}

export { setOnline };
