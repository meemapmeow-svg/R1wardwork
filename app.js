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
    bed: str(p.bed),
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
    return [p.name, p.hn, p.ward, p.bed, p.diagnosis, p.notes, ...p.operations.map((o) => o.name)]
      .some((v) => v.toLowerCase().includes(q));
  });
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const byAdmit = (a, b) => (b.admitDate || '').localeCompare(a.admitDate || '');
  const sorters = {
    name: byName,
    admit: (a, b) => byAdmit(a, b) || byName(a, b),
    ward: (a, b) => a.ward.localeCompare(b.ward, undefined, { numeric: true }) || a.bed.localeCompare(b.bed, undefined, { numeric: true }) || byName(a, b),
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
    p.bed && `Bed ${p.bed}`,
    p.admitDate && `Adm ${fmtDate(p.admitDate)}${!p.archived && day != null && day >= 0 ? ` (day ${day + 1})` : ''}`,
  ].filter(Boolean);

  const ops = p.operations.map((o) => {
    const pod = daysSince(o.date);
    const when = o.date ? `${fmtDate(o.date)}${!p.archived && pod != null && pod >= 0 ? `, POD ${pod}` : ''}` : '';
    // Several lines (as copied from an operative note): date first, then the lines as written.
    if (o.name.includes('\n')) return h('p', { class: 'line pre' }, h('span', { class: 'tag' }, 'Op'), when && h('span', { class: 'muted' }, ` ${when}`), `\n${o.name}`);
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
    p.diagnosis && h('p', { class: 'line pre' }, h('span', { class: 'tag' }, 'Dx'), ` ${p.diagnosis}`),
    ops,
    p.notes && h('p', { class: 'line muted' }, p.notes),
    h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span', { style: `width:${s.needed ? (s.done / s.needed) * 100 : 0}%` })),
    h('div', { class: 'docs' }, docChips),
    h('div', { class: 'card-foot' },
      h('button', { class: 'text-btn', onclick: () => openEditor(p) }, 'Edit'),
      p.operations.length > 0 && h('button', { class: 'text-btn', onclick: () => openReport(p) }, 'Post-op report'),
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

// Enough rows to show multi-line text without scrolling inside the box.
function rowsFor(text) {
  return Math.min(10, text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 34)), 0));
}

function opRow(op = { name: '', date: '' }) {
  const row = h('div', { class: 'op-row' },
    h('label', { class: 'field grow' }, 'Operation', h('textarea', { 'data-op': 'name', rows: rowsFor(op.name) }, op.name)),
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
  for (const k of ['name', 'age', 'hn', 'ward', 'bed', 'admitDate', 'diagnosis', 'notes']) form.elements[k].value = data[k];
  $('#ops').replaceChildren(...(data.operations.length ? data.operations : []).map(opRow));
  $('#docRows').replaceChildren(...DOCS.map((d) => docRow(d, data.docs[d.id])));
  $('#wardList').replaceChildren(...wardsIn(patients).map((w) => h('option', { value: w })));
  $('#editorActions').hidden = !p;
  $('#archiveBtn').textContent = p && p.archived ? 'Restore to active' : 'Archive patient';
  form.elements.name.classList.remove('invalid');
  clearScanMarks();
  setScanStatus('');
  dirty = false;
  editor.showModal();
  $('.sheet-body', editor).scrollTop = 0;
  if (!p) form.elements.name.focus();
}

function closeEditor(force) {
  if (!force && dirty && !confirm('Discard changes?')) return;
  editor.close();
}

form.addEventListener('input', (e) => { dirty = true; e.target.classList.remove('scanned', 'unsure'); });
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
    name: f.name.value, age: f.age.value, hn: f.hn.value, ward: f.ward.value, bed: f.bed.value,
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
  $('textarea', row).focus();
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

/* ---------- scan a sticker / sheet header ---------- */

// Text recognition runs entirely on this device (Tesseract compiled to
// WebAssembly, served from vendor/). The photo is never uploaded or stored.

const TH_MONTHS = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const TH_MONTHS_FULL = ['มกรา', 'กุมภา', 'มีนา', 'เมษา', 'พฤษภา', 'มิถุนา', 'กรกฎา', 'สิงหา', 'กันยา', 'ตุลา', 'พฤศจิกา', 'ธันวา'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Thai paperwork uses the Buddhist era (CE + 543), often with 2-digit years.
function toCeYear(y) {
  if (y >= 2400) return y - 543;
  if (y >= 1900) return y;
  if (y < 100) return y >= 40 ? 2500 + y - 543 : 2000 + y;
  return null;
}

function toIsoDate(d, m, y) {
  y = toCeYear(y);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return '';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// First date found in a short piece of text: "5 พ.ย. 2569", "05/11/2569", "5 Nov 2026".
function findDate(text) {
  let m = text.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4}|\d{2})(?!\d)/);
  // A two-digit "25" is far more likely a Buddhist-era year cut short (25xx) than 2025.
  if (m) return m[3].length === 2 && +m[3] >= 20 && +m[3] < 40 ? '' : toIsoDate(+m[1], +m[2], +m[3]);
  m = text.match(/(\d{1,2})\s*([^\d\n]{2,14}?)\s*(\d{4}|\d{2})(?!\d)/);
  if (!m) return '';
  const word = m[2].replace(/[\s.,]/g, '').toLowerCase();
  let month = TH_MONTHS_FULL.findIndex((x) => word.startsWith(x));
  if (month < 0) month = TH_MONTHS.indexOf(word);
  if (month < 0) month = EN_MONTHS.findIndex((x) => word.startsWith(x));
  return month < 0 ? '' : toIsoDate(+m[1], month + 1, +m[3]);
}

function parsePatientText(raw) {
  const text = raw.replace(/[๐-๙]/g, (c) => String(c.charCodeAt(0) - 0x0e50));
  const out = {};

  const hn = text.match(/H\s*\.?\s*N\s*[.:]?\s*(\d[\d\-\/]{2,12}\d)/i);
  let hnAt = hn ? hn.index : -1;
  if (hn) out.hn = hn[1].replace(/\s/g, '');
  else {
    // Stickers print the number with no "HN" label, at the start of a line,
    // often followed by a short ward code: "4854909  2TC".
    const bare = text.match(/(?:^|\n)[^\dก-๙A-Za-z\n]{0,3}(\d{6,9})(?:[ \t]+([A-Za-z0-9]{2,5}))?(?![\d\/\-])/);
    if (bare) {
      out.hn = bare[1];
      hnAt = bare.index;
      if (bare[2]) out.wardCode = bare[2].toUpperCase();
    }
  }

  // Name: a line starting with a title. Prefer the one after the HN, so a
  // doctor's name printed earlier on the page is not picked up.
  // Titles are often printed attached to the name ("น.ส.มณีรัตน์", "นายสมชาย").
  const titleRe = /(?:^|[\s:|'"])((?:นางสาว|นาย|นาง|น\.\s?ส\.|ด\.\s?ช\.|ด\.\s?ญ\.|เด็กชาย|เด็กหญิง|Mrs?\.?(?![A-Za-z])|Ms\.?(?![A-Za-z])|Miss(?![A-Za-z]))\s*[^\n]*)/g;
  const names = [...text.matchAll(titleRe)].filter((m) => !/^นาย\s*แพทย์/.test(m[1]));
  const pick = names.find((m) => m.index > hnAt) || names[0];
  if (pick) {
    let words = pick[1].split(/\s{2,}|[|:;'"]/)[0].replace(/[,_]/g, ' ').trim().split(/\s+/);
    // Stray marks after a Thai name show up as Latin letters, digits or tiny fragments.
    if (/^[ก-๙]/.test(words[0])) {
      const stop = words.findIndex((w, i) => i > 0 && !/^[ก-๙.]{2,}$/.test(w));
      if (stop > 0) words = words.slice(0, stop);
    }
    const name = words.slice(0, 4).join(' ');
    if (name.length >= 6) out.name = name;
  }

  const age = text.match(/(?:อายุ|Age)\s*[:.]?\s*(\d{1,3})\s*(?:ปี|[Yy])?(?:\s*(\d{1,2})\s*เดือน)?/);
  if (age && +age[1] <= 120) out.age = +age[1] === 0 && age[2] ? `${+age[2]} mo` : String(+age[1]);

  const adm = text.match(/(?:วันที่\s*เข้า\s*รับ\s*บริการ|วันที่\s*รับ\s*(?:ไว้|เข้า)?|วัน\s*Admit|Admi(?:t|ssion)(?:ted)?\s*(?:date)?|รับไว้)\s*[:.]?\s*([^\n]{4,24})/i);
  if (adm) { const d = findDate(adm[1]); if (d) out.admitDate = d; }

  // Operative note: the date, and the free-text "Diagnosis :" / "Operation :"
  // block. The coded PREOPERATIVE / POSTOPERATIVE DIAGNOSIS lines are skipped.
  const opDate = text.match(/Date\s*of\s*Operation\s*[:.]?\s*([^\n]{4,30})/i);
  if (opDate) {
    const d = findDate(opDate[1]);
    if (d) out.opDate = d;
    // The year is often printed over a dotted line and misread; keep day/month separately.
    const dm = opDate[1].match(/^\D{0,3}(\d{1,2})\s*\/\s*(\d{1,2})\s*\//);
    if (dm && +dm[1] >= 1 && +dm[1] <= 31 && +dm[2] >= 1 && +dm[2] <= 12) out.opDayMonth = `${+dm[2]}-${+dm[1]}`;
  }

  // Text is kept as printed, line by line (numbering included); only stray
  // spacing and table-border marks are cleaned up.
  const exact = (v) => v.replace(/[ \t]+/g, ' ').replace(/^[\s|]+|[\s|]+$/g, '');
  const lines = text.split('\n');
  const isHeading = (l) => /^[^A-Za-z0-9]{0,3}[A-Za-z][A-Za-z ./]{2,24}\s*[:;]/.test(l);
  const isNumbered = (l) => /^\s*\d{1,2}\s*[).]/.test(l);
  // The lines under a "Label :" heading, up to the next heading. After a blank
  // line only further numbered items are taken as part of the same block.
  const blockAfter = (at, label) => {
    const kept = [];
    const inline = exact(lines[at].replace(label, ''));
    if (inline.length > 1) kept.push(inline);
    let gap = false;
    for (const l of lines.slice(at + 1, at + 14)) {
      if (!l.trim()) { gap = kept.length > 0; continue; }
      if (isHeading(l) || (gap && !isNumbered(l))) break;
      kept.push(exact(l));
      gap = false;
    }
    return kept.join('\n');
  };
  const dxAt = lines.findIndex((l) => /^[^A-Za-z]{0,3}Diagnosis\s*[:;]/i.test(l));
  if (dxAt >= 0) { const dx = blockAfter(dxAt, /^.*?Diagnosis\s*[:;]/i); if (dx.length > 2) out.diagnosis = dx; }
  const opAt = lines.findIndex((l) => /^[^A-Za-z]{0,3}Operation\s*[:;]/i.test(l));
  if (opAt >= 0) { const op = blockAfter(opAt, /^.*?Operation\s*[:;]/i); if (op.length > 2) out.opName = op; }

  // The birth date is a second source for age and is read more reliably
  // than a lone two-digit number, so it wins when present.
  const dob = text.match(/(?:วัน\s*เกิด|Birth\s*date|DOB)\s*[:.]?\s*([^\n]{4,24})/i);
  const born = dob && parseDate(findDate(dob[1]));
  if (born) {
    const ref = parseDate(out.admitDate) || new Date();
    let years = ref.getFullYear() - born.getFullYear();
    if (ref.getMonth() < born.getMonth() || (ref.getMonth() === born.getMonth() && ref.getDate() < born.getDate())) years--;
    if (years >= 1 && years <= 120) out.age = String(years);
  }

  return out;
}

// Two readers: Thai+English reads the whole block (it needs English for
// "HN"); Thai-only is steadier on short Thai words such as month names, so it
// is used as a second pass when the first one leaves gaps.
const ocrWorkers = {};
let ocrProgress = () => {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = h('script', { src });
    s.onload = resolve;
    s.onerror = () => reject(new Error('load failed'));
    document.head.append(s);
  });
}

async function getOcrWorker(langs) {
  const key = langs.join('+');
  if (ocrWorkers[key]) return ocrWorkers[key];
  if (!window.Tesseract) await loadScript('vendor/tesseract/tesseract.min.js');
  const base = new URL('vendor/tesseract/', location.href).href;
  ocrWorkers[key] = await window.Tesseract.createWorker(langs, 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base + 'lang',
    gzip: true,
    workerBlobURL: false,
    logger: (m) => { if (m.status === 'recognizing text') ocrProgress(m.progress); },
  });
  return ocrWorkers[key];
}

// Small or faint photos read better enlarged, in grey, with contrast stretched.
function enhanceForOcr(src) {
  const longSide = Math.max(src.width, src.height);
  const scale = longSide < 1100 ? 2 : 1;
  const canvas = h('canvas', { width: src.width * scale, height: src.height * scale });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const n = canvas.width * canvas.height;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const g = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000 | 0;
    d[i * 4] = g;
    hist[g]++;
  }
  let lo = 0, hi = 255, acc = 0;
  while ((acc += hist[lo]) < n * 0.02 && lo < 254) lo++;
  acc = 0;
  while ((acc += hist[hi]) < n * 0.3 && hi > lo + 1) hi--;
  const k = 255 / (hi - lo);
  for (let i = 0; i < n; i++) {
    const g = Math.max(0, Math.min(255, (d[i * 4] - lo) * k));
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// Most common value; ties go to the earliest reading.
function vote(values) {
  const count = new Map();
  for (const v of values) count.set(v, (count.get(v) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// The ward code on a sticker is short and easily misread ("2TC" as "270").
// Trust it when it matches a ward already in the list; otherwise accept it
// only if it at least looks like a code, or is one slip away from a known ward.
function pickWard(codes) {
  if (!codes.length) return '';
  const known = wardsIn(patients);
  const exact = codes.map((c) => known.find((w) => w.toUpperCase() === c)).filter(Boolean);
  if (exact.length) return vote(exact);
  const near = known.filter((w) => w.length <= 5 && codes.some((c) => c.length === w.length && editDistance(c, w.toUpperCase()) <= 2));
  if (near.length === 1) return near[0];
  const lettered = codes.filter((c) => /[A-Z]/.test(c) && /\d/.test(c));
  return vote(lettered) || '';
}

// The image is read several ways and the readings are combined, because any
// single reading can drop a digit or garble a word:
//  - Thai+English, automatic layout: best for forms and for names
//  - Thai+English, single block: steadiest for the digits on stickers
//  - Thai only: steadiest for short Thai words such as month names
const OCR_PASSES = [[['tha', 'eng'], '3'], [['tha', 'eng'], '6'], [['tha'], '3']];

async function ocrReadings(source, onProgress) {
  const canvas = enhanceForOcr(source);
  const readings = [];
  for (let i = 0; i < OCR_PASSES.length; i++) {
    const [langs, layout] = OCR_PASSES[i];
    const worker = await getOcrWorker(langs);
    ocrProgress = (p) => onProgress((i + p) / OCR_PASSES.length);
    await worker.setParameters({ tessedit_pageseg_mode: layout });
    readings.push(parsePatientText((await worker.recognize(canvas)).data.text));
  }
  return readings;
}

// On a sticker the text sits just under the barcode. When the barcode is
// found, cut that area out of the full-resolution photo so the sticker is
// read large and without the clutter around it (other labels, handwriting).
function cropSticker(source, box) {
  const full = source.fullImage || source;
  const k = full.width / source.width;
  const w = box.right - box.left;
  const left = Math.max(0, (box.left - 0.35 * w) * k);
  const top = Math.max(0, (box.y - 0.2 * w) * k);
  const right = Math.min(full.width, (box.right + 0.9 * w) * k);
  const bottom = Math.min(full.height, (box.y + 0.68 * w) * k);
  // Sized so the letters come out at the height the reader handles best.
  const scale = Math.min(4, 700 / (right - left));
  const canvas = h('canvas', { width: Math.round((right - left) * scale), height: Math.round((bottom - top) * scale) });
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, left, top, right - left, bottom - top, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function readPatientPhoto(source, onProgress) {
  const code = await readBarcode(source);
  const barcode = code ? code.text : '';
  let readings = null;
  if (code) {
    readings = await ocrReadings(cropSticker(source, code), (p) => onProgress(p / 2));
    // Not a sticker after all (e.g. a form that happens to carry a barcode).
    if (!readings.some((r) => r.name || r.age || r.hn === barcode)) readings = null;
  }
  if (!readings) readings = await ocrReadings(source, (p) => onProgress(code ? 0.5 + p / 2 : p));
  const all = (k) => readings.map((r) => r[k]).filter(Boolean);
  const found = {};
  const unsure = [];
  // A field is trusted only when at least two readings produced it and all agree.
  const settle = (k, values, chosen) => {
    if (!chosen) return;
    found[k] = chosen;
    if (values.length < 2 || values.some((v) => v !== chosen)) unsure.push(k);
  };

  let hns = all('hn');
  if (barcode && (!hns.length || hns.some((x) => barcode.includes(x) || editDistance(barcode, x) <= 2))) {
    found.hn = barcode;
  } else if (hns.length) {
    // A number that is merely a piece of a longer reading lost a digit. Among
    // the rest prefer the length your other patients' numbers have, else the longest.
    let pool = hns.filter((x) => !hns.some((y) => y !== x && y.includes(x)));
    const usual = vote(patients.map((p) => p.hn.length).filter((n) => n >= 6));
    const longest = Math.max(...pool.map((x) => x.length));
    const preferred = pool.filter((x) => x.length === usual);
    pool = preferred.length ? preferred : pool.filter((x) => x.length === longest);
    settle('hn', hns, vote(pool));
  }

  for (const k of ['name', 'age', 'admitDate']) settle(k, all(k), vote(all(k)));

  // Operation date. Day and month read well; the year often does not. A full
  // date is accepted when it is recent. Otherwise the year is filled in as the
  // latest one that does not put the operation in the future, and flagged.
  const dayMonth = vote(all('opDayMonth'));
  const recent = all('opDate').filter((d) => {
    const ago = daysSince(d);
    const [, m, day] = d.split('-').map(Number);
    return ago >= 0 && ago <= 60 && (!dayMonth || dayMonth === `${m}-${day}`);
  });
  if (recent.length) settle('opDate', recent, vote(recent));
  else if (dayMonth) {
    const [m, day] = dayMonth.split('-').map(Number);
    const now = new Date();
    let guess = toIsoDate(day, m, now.getFullYear());
    if (!guess || daysSince(guess) < 0) guess = toIsoDate(day, m, now.getFullYear() - 1);
    settle('opDate', [], guess);
  }
  // Longer text: readings that differ only in spacing or punctuation count as agreeing.
  for (const k of ['diagnosis', 'opName']) {
    const loose = (v) => v.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
    const key = vote(all(k).map(loose));
    settle(k, all(k).map(loose), key);
    if (key) found[k] = all(k).find((v) => loose(v) === key);
  }
  const codes = all('wardCode');
  settle('ward', codes.length > 1 && codes.every((c) => c === codes[0]) ? [1, 1] : [1, 2], pickWard(codes));
  found.unsure = unsure;
  return found;
}

// A barcode, when one is in the photo and sharp enough, gives the number
// exactly. It is only trusted when it agrees with (or stands in for) the
// printed number, since some barcodes carry a different number.
async function readBarcode(canvas) {
  try {
    if (!window.ZXingWASM) {
      await loadScript('vendor/zxing/zxing-reader.js');
      const dir = new URL('vendor/zxing/', location.href).href;
      window.ZXingWASM.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? dir + path : prefix + path) } });
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const results = await window.ZXingWASM.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { tryHarder: true, maxNumberOfSymbols: 4 });
    const hit = results.find((r) => /^\d{6,9}$/.test(r.text.trim()));
    if (!hit) return null;
    const pts = Object.values(hit.position);
    const xs = pts.map((pt) => pt.x);
    const ys = pts.map((pt) => pt.y);
    return { text: hit.text.trim(), left: Math.min(...xs), right: Math.max(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  } catch (e) {
    return null;
  }
}

// Phone photos are far larger than needed; shrink before recognising.
async function photoToCanvas(file) {
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) {
    img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    URL.revokeObjectURL(img.src);
  }
  const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
  const canvas = h('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  canvas.fullImage = img; // kept so a small sticker can be cut out at full resolution
  return canvas;
}

function setScanStatus(msg, warn) {
  const el = $('#scanStatus');
  el.textContent = msg;
  el.classList.toggle('warn', !!warn);
}

function clearScanMarks() {
  for (const el of form.querySelectorAll('.scanned')) el.classList.remove('scanned', 'unsure');
}

$('#scanBtn').addEventListener('click', () => $('#scanFile').click());
$('#scanFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const btn = $('#scanBtn');
  btn.disabled = true;
  setScanStatus('Preparing reader… (first time takes longer)');
  try {
    const canvas = await photoToCanvas(file);
    applyScan(await readPatientPhoto(canvas, (p) => setScanStatus(`Reading… ${Math.round(p * 100)}%`)));
  } catch (err) {
    for (const k of Object.keys(ocrWorkers)) delete ocrWorkers[k];
    setScanStatus('Could not read the photo. If this is the first scan, it needs an internet connection once to load the reader.', true);
  } finally {
    btn.disabled = false;
  }
});

function applyScan(found) {
  const f = form.elements;
  const existing = patients.find((p) => p.id === editingId);
  // Scanning into a saved patient: refuse a document that belongs to someone else.
  if (existing && existing.hn && found.hn && editDistance(existing.hn, found.hn) > 2) {
    clearScanMarks();
    setScanStatus(`This document is for HN ${found.hn}${found.name ? ` (${found.name})` : ''}, but you are editing HN ${existing.hn}. Nothing was changed.`, true);
    return;
  }
  const labels = { hn: 'HN', name: 'name', age: 'age', ward: 'ward', admitDate: 'admission date', diagnosis: 'diagnosis' };
  const filled = [];
  const unsure = [];
  const mark = (el, k, label) => {
    el.classList.add('scanned');
    if (!filled.includes(label)) filled.push(label);
    if (found.unsure.includes(k)) { el.classList.add('unsure'); if (!unsure.includes(label)) unsure.push(label); }
  };
  clearScanMarks();
  for (const k of Object.keys(labels)) {
    if (!found[k]) continue;
    // A saved patient's identity is not overwritten by a later scan (the
    // sticker or your own typing came first); only gaps are filled.
    if (existing && k !== 'diagnosis' && existing[k]) continue;
    f[k].value = found[k];
    if (k === 'diagnosis') f[k].rows = Math.max(2, rowsFor(found[k]));
    mark(f[k], k, labels[k]);
  }
  if (found.opName || found.opDate) {
    const rows = [...document.querySelectorAll('#ops .op-row')];
    const get = (r, part) => $(`[data-op="${part}"]`, r);
    // Reuse a row already holding this date (or an empty one) rather than adding a duplicate.
    const loose = (v) => v.toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');
    let row = rows.find((r) => found.opDate && get(r, 'date').value === found.opDate)
      || rows.find((r) => found.opName && loose(get(r, 'name').value) === loose(found.opName))
      || rows.find((r) => !get(r, 'name').value.trim() && !get(r, 'date').value);
    if (!row) { row = opRow(); $('#ops').append(row); }
    if (found.opName) { get(row, 'name').value = found.opName; get(row, 'name').rows = rowsFor(found.opName); mark(get(row, 'name'), 'opName', 'operation'); }
    if (found.opDate) { get(row, 'date').value = found.opDate; mark(get(row, 'date'), 'opDate', 'operation date'); }
  }
  if (!filled.length) {
    setScanStatus(existing && (found.hn || found.name)
      ? 'Nothing new on this document for this patient.'
      : 'No patient details found. Move closer to the printed block, keep the text level and avoid shadows, then try again.', true);
    return;
  }
  dirty = true;
  f.name.classList.remove('invalid');
  const dup = found.hn && patients.find((p) => p.hn === found.hn && p.id !== editingId);
  const parts = [`Filled: ${filled.join(', ')}.`];
  if (dup) parts.unshift(`HN ${found.hn} is already in your list (${dup.name}${dup.archived ? ', archived' : ''}) — open that patient and scan there to add to it.`);
  if (unsure.length) parts.push(`Not read clearly, shown in amber: ${unsure.join(', ')}. A closer, sharper photo helps.`);
  parts.push('Check everything against the paper — handwriting is not read.');
  setScanStatus(parts.join(' '), !!dup || unsure.length > 0);
}

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

/* ---------- post-op report ---------- */

// The operation being reported: the most recent dated one, else the last entered.
function latestOperation(p) {
  const dated = p.operations.filter((o) => o.date).sort((a, b) => b.date.localeCompare(a.date));
  return dated[0] || p.operations[p.operations.length - 1] || null;
}

// Text that spans several lines starts on its own line under the label.
function labelled(label, text) {
  return text.includes('\n') ? `${label}:\n${text}` : `${label}: ${text}`;
}

function postOpReport(p) {
  const op = latestOperation(p);
  const age = /^\d+$/.test(p.age) ? `${p.age} ปี` : p.age;
  return [
    'ขออนุญาตรายงานเคส post-op ครับ',
    '',
    p.name,
    `อายุ ${age}`,
    `HN ${p.hn}`,
    '',
    labelled('Dx', p.diagnosis),
    labelled('Op', op ? op.name : ''),
  ].join('\n');
}

const report = $('#report');

function openReport(p) {
  const missing = [!p.age && 'age', !p.hn && 'HN', !p.diagnosis && 'diagnosis', !(latestOperation(p) || {}).name && 'operation'].filter(Boolean);
  $('#reportText').value = postOpReport(p);
  $('#reportNote').textContent = missing.length ? `Not filled in for this patient: ${missing.join(', ')}.` : '';
  $('#reportShare').hidden = !navigator.share;
  report.showModal();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Older browsers, or clipboard permission refused: copy from the visible box.
    const box = $('#reportText');
    box.focus();
    box.select();
    try { return document.execCommand('copy'); } catch (err) { return false; }
  }
}

$('#reportClose').addEventListener('click', () => report.close());
$('#reportCopy').addEventListener('click', async () => {
  const ok = await copyText($('#reportText').value);
  if (ok) report.close();
  toast(ok ? 'Report copied — paste it into your chat' : 'Could not copy. Select the text and copy it by hand.');
});
$('#reportShare').addEventListener('click', async () => {
  try {
    await navigator.share({ text: $('#reportText').value });
    report.close();
  } catch (e) { /* share sheet dismissed */ }
});

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
