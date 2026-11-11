'use strict';

/* Ward Work — patient paperwork tracker.
   All data lives in localStorage on this device; the app makes no network
   requests other than loading its own files. */

const STORE_KEY = 'wardwork.v1';
const PREFS_KEY = 'wardwork.prefs';

// Document checklist. `optional` documents start as "not needed".
const DOCS = [
  { id: 'admissionNote', label: 'Admission note' },
  { id: 'diagnosis', label: 'Diagnosis' },
  { id: 'dischargeSummary', label: 'Discharge summary' },
  { id: 'dischargeReconcile', label: 'Discharge reconcile form', short: 'D/C reconcile' },
  { id: 'medCert', label: 'Medical certificate', short: 'Med cert' },
  { id: 'faxClaim', label: 'Fax claim', optional: true },
  { id: 'followUp', label: 'Follow-up appointment', short: 'Follow-up' },
  { id: 'film', label: 'Film for follow-up', short: 'F/U film', optional: true },
];

const $ = (sel, root = document) => root.querySelector(sel);

/* ---------- storage ---------- */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    if (raw && Array.isArray(raw.patients)) return raw.patients.map(normalize);
  } catch (e) { /* fall through to empty list */ }
  return [];
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, patients }));
  } catch (e) {
    toast('Could not save — device storage is full or blocked.');
  }
}

function loadPrefs() {
  try { return Object.assign({ sort: 'pending' }, JSON.parse(localStorage.getItem(PREFS_KEY))); }
  catch (e) { return { sort: 'pending' }; }
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: state.sort })); } catch (e) {}
}

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
}

// Coerce anything (old versions, imported files) into the current shape.
function normalize(p) {
  const str = (v) => (v == null ? '' : String(v)).trim();
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : '');
  const docs = {};
  for (const d of DOCS) {
    const v = p && p.docs ? p.docs[d.id] : undefined;
    if (v === 'done' || v === 'pending') docs[d.id] = v;
    else if (v === 'na' && d.optional) docs[d.id] = 'na';
    else docs[d.id] = d.optional ? 'na' : 'pending';
  }
  return {
    id: str(p.id) || uid(),
    name: str(p.name),
    age: str(p.age),
    hn: str(p.hn),
    ward: str(p.ward),
    admitDate: date(p.admitDate),
    diagnosis: str(p.diagnosis),
    operations: (Array.isArray(p.operations) ? p.operations : [])
      .map((o) => ({ name: str(o && o.name), date: date(o && o.date) }))
      .filter((o) => o.name || o.date),
    docs,
    notes: str(p.notes),
    archived: !!p.archived,
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
  };
}

/* ---------- helpers ---------- */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr() {
  const t = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function daysSince(s) {
  const d = parseDate(s);
  if (!d) return null;
  const t = parseDate(todayStr());
  return Math.round((t - d) / 86400000);
}

function fmtDate(s) {
  const d = parseDate(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function docStats(p) {
  let needed = 0, done = 0;
  for (const d of DOCS) {
    if (p.docs[d.id] === 'na') continue;
    needed++;
    if (p.docs[d.id] === 'done') done++;
  }
  return { needed, done, pending: needed - done };
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.replaceChildren(msg);
  if (action) el.append(h('button', { class: 'toast-action', onclick: () => { action.run(); el.classList.remove('show'); } }, action.label));
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 6000 : 2600);
}

/* ---------- state ---------- */

let patients = load();
const state = { view: 'active', ward: '', query: '', sort: loadPrefs().sort };

/* ---------- list rendering ---------- */

function wardsIn(list) {
  return [...new Set(list.map((p) => p.ward).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function visiblePatients() {
  const q = state.query.toLowerCase();
  const list = patients.filter((p) => {
    if (p.archived !== (state.view === 'archived')) return false;
    if (state.ward && p.ward !== state.ward) return false;
    if (!q) return true;
    return [p.name, p.hn, p.ward, p.diagnosis, p.notes, ...p.operations.map((o) => o.name)]
      .some((v) => v.toLowerCase().includes(q));
  });
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const byAdmit = (a, b) => (b.admitDate || '').localeCompare(a.admitDate || '');
  const sorters = {
    name: byName,
    admit: (a, b) => byAdmit(a, b) || byName(a, b),
    ward: (a, b) => a.ward.localeCompare(b.ward, undefined, { numeric: true }) || byName(a, b),
    pending: (a, b) => docStats(b).pending - docStats(a).pending || byAdmit(b, a) || byName(a, b),
  };
  return list.sort(sorters[state.sort] || sorters.pending);
}

function render() {
  const inView = patients.filter((p) => p.archived === (state.view === 'archived'));
  const wards = wardsIn(inView);
  if (state.ward && !wards.includes(state.ward)) state.ward = '';

  // Summary
  const active = patients.filter((p) => !p.archived);
  const pendingDocs = active.reduce((n, p) => n + docStats(p).pending, 0);
  $('#summary').textContent = active.length
    ? `${active.length} active patient${active.length === 1 ? '' : 's'} · ${pendingDocs} document${pendingDocs === 1 ? '' : 's'} pending`
    : 'No active patients';

  // Ward chips
  const chips = $('#wardChips');
  chips.replaceChildren();
  if (wards.length > 1) {
    const chip = (label, value) => h('button', {
      class: 'chip', 'aria-pressed': String(state.ward === value),
      onclick: () => { state.ward = value; render(); },
    }, label);
    chips.append(chip('All wards', ''), ...wards.map((w) => chip(w, w)));
  }
  chips.hidden = wards.length <= 1;

  // Cards
  const list = $('#list');
  const shown = visiblePatients();
  if (!shown.length) {
    const filtered = state.query || state.ward;
    list.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, filtered ? 'No matching patients' : state.view === 'archived' ? 'No archived patients' : 'No patients yet'),
      h('p', null, filtered ? 'Try a different search or ward.' : state.view === 'archived' ? 'Patients you archive after their paperwork is finished appear here.' : 'Tap + to add your first patient.')));
    return;
  }
  list.replaceChildren(...shown.map(card));
}

function card(p) {
  const s = docStats(p);
  const complete = s.pending === 0;
  const day = daysSince(p.admitDate);

  const meta = [
    p.hn && `HN ${p.hn}`,
    p.ward,
    p.admitDate && `Adm ${fmtDate(p.admitDate)}${!p.archived && day != null && day >= 0 ? ` (day ${day + 1})` : ''}`,
  ].filter(Boolean);

  const ops = p.operations.map((o) => {
    const pod = daysSince(o.date);
    const when = o.date ? `${fmtDate(o.date)}${!p.archived && pod != null && pod >= 0 ? `, POD ${pod}` : ''}` : '';
    return h('p', { class: 'line' }, h('span', { class: 'tag' }, 'Op'), ` ${o.name || 'Operation'}`, when && h('span', { class: 'muted' }, ` — ${when}`));
  });

  const docChips = DOCS.filter((d) => p.docs[d.id] !== 'na').map((d) => {
    const done = p.docs[d.id] === 'done';
    return h('button', {
      class: 'doc' + (done ? ' done' : ''), 'aria-pressed': String(done),
      'aria-label': `${d.label}: ${done ? 'done' : 'pending'}`,
      onclick: () => toggleDoc(p.id, d.id),
    }, h('span', { class: 'box', 'aria-hidden': 'true' }), d.short || d.label);
  });

  return h('article', { class: 'card' + (complete ? ' complete' : '') },
    h('div', { class: 'card-head' },
      h('button', { class: 'card-title', onclick: () => openEditor(p), 'aria-label': `Edit ${p.name}` },
        h('span', { class: 'name' }, p.name || 'Unnamed'),
        p.age && h('span', { class: 'age' }, `${p.age} y`)),
      h('span', { class: 'count' + (complete ? ' ok' : '') }, complete ? 'All done' : `${s.done}/${s.needed}`)),
    meta.length ? h('p', { class: 'meta' }, meta.join(' · ')) : null,
    p.diagnosis && h('p', { class: 'line' }, h('span', { class: 'tag' }, 'Dx'), ` ${p.diagnosis}`),
    ops,
    p.notes && h('p', { class: 'line muted' }, p.notes),
    h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span', { style: `width:${s.needed ? (s.done / s.needed) * 100 : 0}%` })),
    h('div', { class: 'docs' }, docChips),
    h('div', { class: 'card-foot' },
      h('button', { class: 'text-btn', onclick: () => openEditor(p) }, 'Edit'),
      p.archived
        ? h('button', { class: 'text-btn', onclick: () => setArchived(p.id, false) }, 'Restore to active')
        : complete && h('button', { class: 'text-btn strong', onclick: () => setArchived(p.id, true) }, 'Archive')));
}

function toggleDoc(pid, did) {
  const p = patients.find((x) => x.id === pid);
  if (!p) return;
  p.docs[did] = p.docs[did] === 'done' ? 'pending' : 'done';
  p.updatedAt = Date.now();
  save();
  render();
}

function setArchived(pid, archived) {
  const p = patients.find((x) => x.id === pid);
  if (!p) return;
  p.archived = archived;
  p.updatedAt = Date.now();
  save();
  render();
  toast(archived ? `${p.name} archived` : `${p.name} restored`, { label: 'Undo', run: () => setArchived(pid, !archived) });
}

/* ---------- editor ---------- */

const editor = $('#editor');
const form = $('#patientForm');
let editingId = null;
let dirty = false;

function opRow(op = { name: '', date: '' }) {
  const row = h('div', { class: 'op-row' },
    h('label', { class: 'field grow' }, 'Operation', h('input', { 'data-op': 'name', value: op.name, autocomplete: 'off' })),
    h('label', { class: 'field' }, 'Date', h('input', { 'data-op': 'date', type: 'date', value: op.date })),
    h('button', { type: 'button', class: 'icon-btn remove', 'aria-label': 'Remove operation', onclick: () => { row.remove(); dirty = true; } }, '×'));
  return row;
}

function docRow(d, value) {
  const opts = d.optional ? [['na', 'Not needed'], ['pending', 'Pending'], ['done', 'Done']] : [['pending', 'Pending'], ['done', 'Done']];
  return h('div', { class: 'doc-row' },
    h('span', { class: 'doc-label' }, d.label, d.optional && h('span', { class: 'opt' }, 'optional')),
    h('div', { class: 'radio-seg', role: 'radiogroup', 'aria-label': d.label },
      opts.map(([v, text]) => h('label', null,
        h('input', { type: 'radio', name: `doc-${d.id}`, value: v, checked: v === value }),
        h('span', null, text)))));
}

function openEditor(p) {
  editingId = p ? p.id : null;
  const data = p || normalize({ ward: state.ward, admitDate: todayStr() });
  $('#editorTitle').textContent = p ? 'Edit patient' : 'New patient';
  for (const k of ['name', 'age', 'hn', 'ward', 'admitDate', 'diagnosis', 'notes']) form.elements[k].value = data[k];
  $('#ops').replaceChildren(...(data.operations.length ? data.operations : []).map(opRow));
  $('#docRows').replaceChildren(...DOCS.map((d) => docRow(d, data.docs[d.id])));
  $('#wardList').replaceChildren(...wardsIn(patients).map((w) => h('option', { value: w })));
  $('#editorActions').hidden = !p;
  $('#archiveBtn').textContent = p && p.archived ? 'Restore to active' : 'Archive patient';
  form.elements.name.classList.remove('invalid');
  dirty = false;
  editor.showModal();
  $('.sheet-body', editor).scrollTop = 0;
  if (!p) form.elements.name.focus();
}

function closeEditor(force) {
  if (!force && dirty && !confirm('Discard changes?')) return;
  editor.close();
}

form.addEventListener('input', () => { dirty = true; });
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = form.elements;
  if (!f.name.value.trim()) {
    f.name.classList.add('invalid');
    f.name.focus();
    toast('Patient name is required.');
    return;
  }
  const existing = patients.find((x) => x.id === editingId);
  const docs = {};
  for (const d of DOCS) docs[d.id] = (form.querySelector(`input[name="doc-${d.id}"]:checked`) || {}).value;
  const next = normalize({
    ...(existing || {}),
    name: f.name.value, age: f.age.value, hn: f.hn.value, ward: f.ward.value,
    admitDate: f.admitDate.value, diagnosis: f.diagnosis.value, notes: f.notes.value,
    operations: [...document.querySelectorAll('#ops .op-row')].map((r) => ({
      name: $('[data-op="name"]', r).value, date: $('[data-op="date"]', r).value,
    })),
    docs,
    updatedAt: Date.now(),
  });
  if (existing) patients[patients.indexOf(existing)] = next;
  else patients.push(next);
  save();
  closeEditor(true);
  render();
  toast(existing ? 'Saved' : 'Patient added');
});

$('#cancelBtn').addEventListener('click', () => closeEditor());
editor.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });
$('#addOpBtn').addEventListener('click', () => {
  const row = opRow();
  $('#ops').append(row);
  dirty = true;
  $('input', row).focus();
});
$('#archiveBtn').addEventListener('click', () => {
  const p = patients.find((x) => x.id === editingId);
  if (!p) return;
  closeEditor(true);
  setArchived(p.id, !p.archived);
});
$('#deleteBtn').addEventListener('click', () => {
  const p = patients.find((x) => x.id === editingId);
  if (!p || !confirm(`Delete ${p.name || 'this patient'} permanently?`)) return;
  const idx = patients.indexOf(p);
  patients.splice(idx, 1);
  save();
  closeEditor(true);
  render();
  toast('Patient deleted', { label: 'Undo', run: () => { patients.splice(idx, 0, p); save(); render(); } });
});

/* ---------- toolbar ---------- */

$('#addBtn').addEventListener('click', () => openEditor(null));
$('#search').addEventListener('input', (e) => { state.query = e.target.value.trim(); render(); });
$('#sort').value = state.sort;
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; savePrefs(); render(); });
for (const tab of document.querySelectorAll('[data-view]')) {
  tab.addEventListener('click', () => {
    state.view = tab.dataset.view;
    for (const t of document.querySelectorAll('[data-view]')) t.setAttribute('aria-selected', String(t === tab));
    render();
  });
}

/* ---------- backup ---------- */

const menu = $('#menu');
$('#menuBtn').addEventListener('click', () => { updateStorageNote(); menu.showModal(); });
$('#menuClose').addEventListener('click', () => menu.close());

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'wardwork', version: 1, exportedAt: new Date().toISOString(), patients }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `wardwork-backup-${todayStr()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${patients.length} patient${patients.length === 1 ? '' : 's'}`);
});

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.patients;
    if (!Array.isArray(incoming)) throw new Error('bad format');
    let added = 0, updated = 0;
    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') continue;
      const p = normalize(raw);
      const i = patients.findIndex((x) => x.id === p.id);
      if (i === -1) { patients.push(p); added++; }
      else if (p.updatedAt > patients[i].updatedAt) { patients[i] = p; updated++; }
    }
    save();
    render();
    menu.close();
    toast(`Import: ${added} added, ${updated} updated`);
  } catch (err) {
    toast('That file is not a Ward Work backup.');
  }
});

async function updateStorageNote() {
  const note = $('#storageNote');
  note.textContent = '';
  if (navigator.storage && navigator.storage.persisted) {
    const persisted = await navigator.storage.persisted();
    note.textContent = persisted
      ? 'This browser has marked the data as persistent.'
      : 'Tip: add this app to your home screen so the browser is less likely to clear its data.';
  }
}

/* ---------- startup ---------- */

render();

// Ask the browser not to evict our data under storage pressure.
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Offline support.
if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker && navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Day counts (hospital day, POD) roll over at midnight — refresh when the app is reopened.
document.addEventListener('visibilitychange', () => { if (!document.hidden && !editor.open) render(); });
