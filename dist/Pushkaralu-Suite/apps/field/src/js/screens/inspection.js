// Screen 4 — Vendor Inspection · Brief §4.4
import { icon } from '../icons.js';
import { state, submitInspection, emit } from '../store.js';
import { VENDOR } from '../data.js';
import { esc, haptic, longPress, $, $$ } from '../util.js';
import { toast, burst, confirmModal } from '../ui.js';
import { photosBlock, bindPhotos } from './report.js';
import { actions } from '../bus.js';

const GRADES = [['pass', 'Pass', 'normal', 'check-circle-2'], ['conditional', 'Conditional', 'warning', 'alert-triangle'], ['fail', 'Fail', 'critical', 'x']];

function counts() {
  const items = state.inspection.sections.flatMap((s) => s.items);
  return { total: items.length, pass: items.filter((i) => i.state === 'pass').length, fail: items.filter((i) => i.state === 'fail').length };
}
function suggested() {
  const { fail } = counts();
  if (fail > 3) return 'fail';
  if (fail > 2) return 'conditional';
  return null;
}
export function inspectionHeaderRight() {
  return `<button class="header-send t-button" id="submitInsp" ${state.inspection.grade ? '' : 'disabled'}>${icon(state.online ? 'check' : 'cloud-off')}<span>Submit</span></button>`;
}

function item(it) {
  const st = it.state;
  return `<button class="check-item ${st === 'pass' ? 'is-pass' : st === 'fail' ? 'is-fail' : ''}" data-item="${it.id}" role="checkbox" aria-checked="${st === 'pass' ? 'true' : st === 'fail' ? 'mixed' : 'false'}" aria-label="${esc(it.label)} — ${st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : 'not checked'}. Tap to toggle, hold to mark fail.">
    <span class="checkbox">${icon(st === 'fail' ? 'x' : 'check', { stroke: 3 })}</span>
    <span class="check-item__label t-body">${esc(it.label)}</span>
    ${st === 'fail' ? `<span class="check-item__photo" data-flagphoto="${it.id}">${icon('camera')}${it.photo ? '1' : 'Add Photo'}</span>` : ''}
  </button>`;
}

export function renderInspection() {
  const ins = state.inspection;
  const c = counts();
  const sug = suggested();
  const pct = Math.round(((c.pass + c.fail) / c.total) * 100);
  return `
  <div class="content__pad screen-enter">
    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Vendor Info</span><span class="t-mono c-tertiary" style="text-transform:none">${VENDOR.id}</span></div>
    <div class="card vendor">
      <div class="vendor__ico">${icon('store')}</div>
      <div>
        <h2 class="t-h2 vendor__name">${VENDOR.stall} — ${esc(VENDOR.name)}</h2>
        <div class="vendor__te regional" lang="te">${VENDOR.nameTe}</div>
        <div class="vendor__meta t-caption c-secondary">
          <span class="status">${icon('map-pin', { size: 14 })}${VENDOR.zone}, ${VENDOR.row}</span>
          <span class="status">${icon('hash', { size: 14 })}<span class="t-mono">License: ${VENDOR.license}</span></span>
        </div>
      </div>
      <div class="vendor__last t-caption">
        <span class="c-secondary">Last inspection: ${VENDOR.last.ago} · ${VENDOR.last.by}</span>
        <span class="pill pill--normal" style="height:22px">${icon('check', { stroke: 3 })}Pass</span>
      </div>
    </div>

    <div class="insp-progress">
      <span class="t-caption-strong">${c.pass + c.fail}/${c.total} assessed</span>
      <div class="progress__track"><div class="progress__fill" style="width:${pct}%;${c.fail ? 'background:linear-gradient(90deg,var(--color-status-normal),var(--color-status-warning))' : ''}"></div></div>
      <span class="t-caption ${c.fail ? 'c-critical' : 'c-secondary'}" style="font-weight:600">${c.fail} failed</span>
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Checklist</span></div>
    <div class="card checklist" role="group" aria-label="Inspection checklist">
      ${ins.sections.map((s) => `
        <div class="check-sec t-caption-strong" style="text-transform:uppercase"><span>${esc(s.title)}</span><span class="t-caption">${s.items.filter((i) => i.state === 'pass').length}/${s.items.length}</span></div>
        ${s.items.map(item).join('')}`).join('')}
    </div>
    <div class="legend t-caption">
      <span><i style="background:var(--color-status-normal)"></i>Tap = Pass</span>
      <span><i style="background:var(--color-status-critical)"></i>Hold = Fail</span>
    </div>

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Evidence Photos</span>${c.fail ? `<span class="t-caption c-critical" style="text-transform:none">${c.fail} flagged item${c.fail > 1 ? 's' : ''}</span>` : ''}</div>
    ${photosBlock(ins.photos, { label: 'Add', addId: 'addEvidence' })}

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><span>Grade<span class="req">*</span></span></div>
    <div class="segmented segmented--tall" role="radiogroup" aria-label="Inspection grade">
      ${GRADES.map(([id, label, tone, ic]) => `<button role="radio" aria-checked="${ins.grade === id}" data-grade="${id}" data-tone="${tone}">${icon(ic)}${label}</button>`).join('')}
    </div>
    ${sug ? `<div class="suggest t-caption">${icon('zap')}Suggested: ${sug === 'fail' ? 'Fail' : 'Conditional'} — ${c.fail} items failed${ins.gradeTouched ? '' : ' (pre-selected)'}</div>` : ''}

    <div class="field-label t-caption-strong" style="text-transform:uppercase"><label for="inotes">Notes</label></div>
    <div class="textarea"><textarea id="inotes" maxlength="500" placeholder="Additional observations…">${esc(ins.notes)}</textarea><span class="textarea__count t-caption" id="icount">${ins.notes.length}/500</span></div>
  </div>
  <input type="file" accept="image/*" capture="environment" id="filePick" hidden>`;
}

export function bindInspection(root, header) {
  const ins = state.inspection;
  const all = () => ins.sections.flatMap((s) => s.items);
  const rerender = () => { const sug = suggested(); if (!ins.gradeTouched) ins.grade = sug; emit('inspection-local'); };

  $$('[data-item]', root).forEach((row) => {
    const it = all().find((x) => x.id === row.dataset.item);
    let long = false;
    longPress(row, 600, {
      onStart: () => { long = false; row.classList.add('is-pressing'); },
      onCancel: () => row.classList.remove('is-pressing'),
      onDone: () => { long = true; row.classList.remove('is-pressing'); it.state = it.state === 'fail' ? 'pass' : 'fail'; haptic('medium'); rerender(); },
    });
    row.addEventListener('click', (e) => {
      if (long) { long = false; return; }
      if (e.target.closest('[data-flagphoto]')) { it.photo = true; ins.photos.push('p' + Date.now()); haptic('light'); toast('Evidence photo attached', 'success', 1400); rerender(); return; }
      it.state = it.state ? null : 'pass'; haptic('light'); rerender();
    });
  });

  $$('[data-grade]', root).forEach((b) => b.addEventListener('click', () => { ins.grade = b.dataset.grade; ins.gradeTouched = true; haptic('light'); rerender(); }));
  const notes = $('#inotes', root), cnt = $('#icount', root);
  notes.addEventListener('input', () => { ins.notes = notes.value; cnt.textContent = `${notes.value.length}/500`; });
  bindPhotos(root, ins.photos, rerender, { addId: 'addEvidence' });

  $('#submitInsp', header)?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    const c = counts();
    const pending = c.total - c.pass - c.fail;
    if (pending > 0) {
      const ok = await confirmModal({ title: `${pending} items not assessed`, body: 'Unchecked items will be recorded as “not verified”. Submit the inspection anyway?', tone: 'warning', iconName: 'clipboard-check', confirm: 'Submit', cancel: 'Keep checking' });
      if (!ok) return;
    }
    const failsNoPhoto = all().filter((i) => i.state === 'fail' && !i.photo).length;
    if (failsNoPhoto && !ins.photos.length) toast(`${failsNoPhoto} failed item(s) without photo evidence`, 'warning', 1800);
    haptic('medium');
    b.disabled = true; b.innerHTML = state.online ? `${icon('refresh-cw', { cls: 'spin' })}<span>Sending</span>` : `${icon('cloud-off')}<span>Queued</span>`;
    await new Promise((r) => setTimeout(r, 800));
    const grade = ins.grade;
    const { queued } = submitInspection();
    await burst(`Graded: ${grade[0].toUpperCase() + grade.slice(1)}`, queued ? 'Saved offline — will sync' : `${VENDOR.stall} inspection submitted`);
    toast(queued ? 'Inspection queued for sync' : 'Inspection submitted ✓', queued ? 'warning' : 'success');
    actions.navigate('tasks');
  });
}
