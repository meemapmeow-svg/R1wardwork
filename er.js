'use strict';

/* ER consults — notifications received from the emergency room.
   Kept in their own list (and their own storage key) next to the ward
   patients. Loaded after app.js and uses its helpers. */

const ER_KEY = 'wardwork.er.v1';

const ER_SCHEMES = ['ข้าราชการ', 'ประกันสังคม', 'UC รามา', 'UC ที่อื่น', 'ผู้พิการ', 'พรบ.', 'ชำระเงินเอง', 'ประกันเอกชน'];
const ER_UD = ['HT', 'DM', 'DLP', 'Old CVA', 'CKD', 'IHD', 'AF'];
// `side` films take a side: tapping goes Rt → Lt → Both → off.
const ER_FILMS = [
  { id: 'CXR' }, { id: 'Pelvis' },
  { id: 'Hip AP', side: true }, { id: 'Hip lateral cross-table', side: true },
  { id: 'Shoulder', side: true }, { id: 'Upper arm', side: true }, { id: 'Forearm', side: true },
  { id: 'Wrist', side: true }, { id: 'Hand', side: true }, { id: 'Fingers', side: true },
  { id: 'Thigh', side: true }, { id: 'Knee', side: true }, { id: 'Leg', side: true },
  { id: 'Ankle', side: true }, { id: 'Foot', side: true }, { id: 'Toes', side: true },
];
const ER_SIDES = ['Rt', 'Lt', 'Both'];
const ER_LABS = ['CBC', 'Elyte', 'BUN', 'Cr', 'Coagulogram', 'Ca', 'Mg', 'PO4', 'LFT', 'Anti-HIV', 'D-dimer'];
const ER_LOCATIONS = ['Resus', 'Counter 4', 'T1', 'T2', 'T3', 'OGP'];
const OTHER = 'other';

/* ---------- storage ---------- */

function normalizeConsult(c) {
  const str = (v) => (v == null ? '' : String(v)).trim();
  const list = (v, allowed) => (Array.isArray(v) ? v.map(str).filter((x) => allowed.includes(x)) : []);
  // Consults saved before these options were renamed or split.
  if (c.films && c.films.Arm && !c.films.Forearm) c = { ...c, films: { ...c.films, Forearm: c.films.Arm } };
  if (c.scheme === 'UC') c = { ...c, scheme: OTHER, schemeOther: 'UC' };
  const films = {};
  for (const f of ER_FILMS) {
    const v = c && c.films ? str(c.films[f.id]) : '';
    if (f.side ? ER_SIDES.includes(v) : v === 'Y') films[f.id] = v;
  }
  const status = ['new', 'seen', 'closed', 'admitted'].includes(c.status) ? c.status : 'new';
  return {
    id: str(c.id) || uid(),
    name: str(c.name), hn: str(c.hn), age: str(c.age),
    scheme: [...ER_SCHEMES, OTHER].includes(c.scheme) ? c.scheme : '',
    schemeOther: str(c.schemeOther),
    ud: list(c.ud, ER_UD), udOther: str(c.udOther), noUd: !!c.noUd,
    cc: str(c.cc), pi: str(c.pi),
    films, labs: list(c.labs, ER_LABS),
    dx: str(c.dx),
    location: [...ER_LOCATIONS, OTHER].includes(c.location) ? c.location : '',
    locationOther: str(c.locationOther),
    contact: str(c.contact),
    status,
    patientId: str(c.patientId),
    createdAt: Number(c.createdAt) || Date.now(),
    updatedAt: Number(c.updatedAt) || Date.now(),
  };
}

function loadConsults() {
  try {
    const raw = JSON.parse(localStorage.getItem(ER_KEY));
    if (raw && Array.isArray(raw.consults)) return raw.consults.map(normalizeConsult);
  } catch (e) { /* empty list */ }
  return [];
}

function saveConsults() {
  try { localStorage.setItem(ER_KEY, JSON.stringify({ version: 1, consults })); }
  catch (e) { toast('Could not save — device storage is full or blocked.'); }
}

// Used by the backup import in app.js.
function mergeConsults(incoming) {
  let added = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== 'object') continue;
    const c = normalizeConsult(raw);
    const i = consults.findIndex((x) => x.id === c.id);
    if (i === -1) { consults.push(c); added++; }
    else if (c.updatedAt > consults[i].updatedAt) consults[i] = c;
  }
  saveConsults();
  renderEr();
  return added;
}

let consults = loadConsults();
const erState = { view: 'open', query: '' };

/* ---------- wording ---------- */

const isOpen = (c) => c.status === 'new' || c.status === 'seen';
const schemeText = (c) => (c.scheme === OTHER ? c.schemeOther : c.scheme);
const locationText = (c) => (c.location === OTHER ? c.locationOther : c.location ? `ER ${c.location}` : '');
const udText = (c) => (c.noUd ? 'ไม่มีโรคประจำตัว' : [...c.ud, c.udOther].filter(Boolean).join(', '));
const filmText = (c) => ER_FILMS.filter((f) => c.films[f.id]).map((f) => (f.side ? `${f.id} ${c.films[f.id]}` : f.id)).join(', ');
const labText = (c) => c.labs.join(', ');

function consultMessage(c) {
  const age = /^\d+$/.test(c.age) ? `${c.age} ปี` : c.age;
  const line = (label, text) => (text ? [labelled(label, text)] : []);
  return [
    'ขออนุญาตรายงานเคส consult ER ครับ',
    '',
    c.name,
    ...(age ? [`อายุ ${age}`] : []),
    ...(c.hn ? [`HN ${c.hn}`] : []),
    ...(schemeText(c) ? [`สิทธิ์ ${schemeText(c)}`] : []),
    '',
    ...line('U/D', udText(c)),
    ...line('CC', c.cc),
    ...line('PI', c.pi),
    ...line('Film', filmText(c)),
    ...line('Lab', labText(c)),
    ...line('Dx', c.dx),
    '',
    ...line('Location', locationText(c)),
    ...line('Tel', c.contact),
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function receivedText(c) {
  const d = new Date(c.createdAt);
  const mins = Math.max(0, Math.round((Date.now() - c.createdAt) / 60000));
  const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min ago` : `${Math.floor(mins / 1440)} d ago`;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = d.toDateString() === new Date().toDateString() ? '' : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} `;
  return `Received ${day}${time} · ${ago}`;
}

/* ---------- list ---------- */

function renderEr() {
  const open = consults.filter(isOpen);
  const waiting = open.filter((c) => c.status === 'new').length;
  $('#erSummary').textContent = open.length
    ? `${open.length} open consult${open.length === 1 ? '' : 's'} · ${waiting} not yet seen`
    : 'No open consults';
  const badge = $('#erBadge');
  badge.textContent = waiting || '';
  badge.hidden = !waiting;

  const q = erState.query.toLowerCase();
  const shown = consults
    .filter((c) => isOpen(c) === (erState.view === 'open'))
    .filter((c) => !q || [c.name, c.hn, c.dx, c.cc, locationText(c), c.contact].some((v) => v.toLowerCase().includes(q)))
    // Not-yet-seen first, then newest first.
    .sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.createdAt - a.createdAt);

  const list = $('#erList');
  if (!shown.length) {
    list.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, q ? 'No matching consults' : erState.view === 'open' ? 'No open consults' : 'No closed consults'),
      h('p', null, q ? 'Try a different search.' : erState.view === 'open' ? 'Tap + when the ER calls.' : 'Consults you close or admit appear here.')));
    return;
  }
  list.replaceChildren(...shown.map(consultCard));
}

function consultCard(c) {
  const info = (tag, text) => text && h('p', { class: 'line pre' }, h('span', { class: 'sub' }, tag), ` ${text}`);
  const statusLabel = { new: 'New', seen: 'Seen', closed: 'Closed', admitted: 'Admitted' }[c.status];
  const who = [c.hn && `HN ${c.hn}`, schemeText(c)].filter(Boolean).join(' · ');
  const tel = c.contact.replace(/[^\d+]/g, '');

  return h('article', { class: `card consult ${c.status}` },
    h('div', { class: 'card-head' },
      h('button', { class: 'card-title', onclick: () => openConsult(c), 'aria-label': `Edit ${c.name}` },
        h('span', { class: 'name' }, c.name || 'Unnamed'),
        c.age && h('span', { class: 'age' }, `${c.age} y`)),
      h('span', { class: `count ${c.status === 'new' ? '' : 'ok'}` }, statusLabel)),
    who && h('p', { class: 'meta' }, who),
    h('p', { class: 'meta' },
      locationText(c) && h('span', { class: 'tag' }, locationText(c)),
      locationText(c) && ' ',
      c.contact && h('a', { class: 'tel', href: `tel:${tel}` }, `☎ ${c.contact}`)),
    h('p', { class: 'meta' }, receivedText(c)),
    c.dx && h('p', { class: 'line pre' }, h('span', { class: 'tag' }, 'Dx'), ` ${c.dx}`),
    info('CC', c.cc),
    info('PI', c.pi),
    info('U/D', udText(c)),
    info('Film', filmText(c)),
    info('Lab', labText(c)),
    h('div', { class: 'card-foot' },
      isOpen(c)
        ? h('button', { class: 'doc' + (c.status === 'seen' ? ' done' : ''), 'aria-pressed': String(c.status === 'seen'), onclick: () => setConsultStatus(c.id, c.status === 'seen' ? 'new' : 'seen') },
          h('span', { class: 'box', 'aria-hidden': 'true' }), 'Seen')
        : h('button', { class: 'text-btn', onclick: () => setConsultStatus(c.id, 'seen') }, 'Reopen'),
      h('button', { class: 'text-btn', onclick: () => openTextSheet('ER consult message', consultMessage(c)) }, 'Copy message'),
      isOpen(c) && h('button', { class: 'text-btn strong', onclick: () => admitConsult(c) }, 'Admit'),
      isOpen(c) && h('button', { class: 'text-btn', onclick: () => setConsultStatus(c.id, 'closed') }, 'Close')));
}

function setConsultStatus(id, status) {
  const c = consults.find((x) => x.id === id);
  if (!c) return;
  const before = c.status;
  c.status = status;
  c.updatedAt = Date.now();
  saveConsults();
  renderEr();
  if (status === 'closed') toast(`${c.name || 'Consult'} closed`, { label: 'Undo', run: () => setConsultStatus(id, before) });
}

/* ---------- admit: consult → ward patient ---------- */

function admitConsult(c) {
  const done = (patient) => {
    c.status = 'admitted';
    c.patientId = patient.id;
    c.updatedAt = Date.now();
    saveConsults();
    switchMain('ward');
  };
  const match = c.hn && patients.find((p) => p.hn === c.hn);
  if (match) {
    openEditor(match, { quiet: true, afterSave: done });
    setScanStatus(`HN ${c.hn} is already in your ward list — opened ${match.name || 'that patient'}. Save to mark the consult as admitted.`, true);
    return;
  }
  const notes = [schemeText(c) && `สิทธิ์: ${schemeText(c)}`, udText(c) && `U/D: ${udText(c)}`, c.cc && `CC: ${c.cc}`].filter(Boolean).join('\n');
  openEditor(null, { quiet: true, afterSave: done, preset: { name: c.name, hn: c.hn, age: c.age, diagnosis: c.dx, notes, admitDate: todayStr() } });
  setScanStatus('Filled in from the ER consult. Add ward and bed, then Save to admit.');
}

/* ---------- consult form ---------- */

const consultEditor = $('#consultEditor');
const consultForm = $('#consultForm');
let consultId = null;
let draft = null;       // the tap-to-select parts of the consult being edited
let consultDirty = false;

function chip(label, pressed, onclick) {
  return h('button', { type: 'button', class: 'chip pick-chip', 'aria-pressed': String(!!pressed), onclick }, label);
}

function renderPicks() {
  const touch = (fn) => () => { fn(); consultDirty = true; renderPicks(); };
  const single = (key, value) => touch(() => { draft[key] = draft[key] === value ? '' : value; });
  const toggle = (arr, value) => { const i = arr.indexOf(value); if (i < 0) arr.push(value); else arr.splice(i, 1); };

  $('#pickScheme').replaceChildren(
    ...ER_SCHEMES.map((s) => chip(s, draft.scheme === s, single('scheme', s))),
    chip('อื่นๆ', draft.scheme === OTHER, single('scheme', OTHER)));
  consultForm.elements.schemeOther.hidden = draft.scheme !== OTHER;

  $('#pickUd').replaceChildren(
    chip('ไม่มี', draft.noUd, touch(() => { draft.noUd = !draft.noUd; if (draft.noUd) draft.ud = []; })),
    ...ER_UD.map((u) => chip(u, draft.ud.includes(u), touch(() => { toggle(draft.ud, u); draft.noUd = false; }))));
  consultForm.elements.udOther.hidden = draft.noUd;

  $('#pickFilm').replaceChildren(...ER_FILMS.map((f) => {
    const v = draft.films[f.id];
    const next = f.side ? ER_SIDES[ER_SIDES.indexOf(v) + 1] : (v ? undefined : 'Y');
    return chip(v && f.side ? `${f.id} ${v}` : f.id, v, touch(() => { if (next) draft.films[f.id] = next; else delete draft.films[f.id]; }));
  }));

  $('#pickLab').replaceChildren(...ER_LABS.map((l) => chip(l, draft.labs.includes(l), touch(() => toggle(draft.labs, l)))));

  $('#pickLocation').replaceChildren(
    ...ER_LOCATIONS.map((l) => chip(l, draft.location === l, single('location', l))),
    chip('Other ward', draft.location === OTHER, single('location', OTHER)));
  consultForm.elements.locationOther.hidden = draft.location !== OTHER;
}

function openConsult(c) {
  consultId = c ? c.id : null;
  const data = c || normalizeConsult({});
  draft = { scheme: data.scheme, ud: [...data.ud], noUd: data.noUd, films: { ...data.films }, labs: [...data.labs], location: data.location };
  $('#consultTitle').textContent = c ? 'Edit ER consult' : 'New ER consult';
  for (const k of ['name', 'hn', 'age', 'schemeOther', 'udOther', 'cc', 'pi', 'dx', 'locationOther', 'contact']) consultForm.elements[k].value = data[k];
  $('#consultActions').hidden = !c;
  $('#consultScanStatus').textContent = '';
  consultForm.elements.name.classList.remove('invalid');
  renderPicks();
  consultDirty = false;
  consultEditor.showModal();
  $('.sheet-body', consultEditor).scrollTop = 0;
}

function closeConsult(force) {
  if (!force && consultDirty && !confirm('Discard changes?')) return;
  consultEditor.close();
}

consultForm.addEventListener('input', () => { consultDirty = true; });
consultForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = consultForm.elements;
  if (!f.name.value.trim() && !f.hn.value.trim()) {
    f.name.classList.add('invalid');
    f.name.focus();
    toast('Enter a name or HN.');
    return;
  }
  const existing = consults.find((x) => x.id === consultId);
  const next = normalizeConsult({
    ...(existing || {}),
    ...draft,
    name: f.name.value, hn: f.hn.value, age: f.age.value,
    schemeOther: f.schemeOther.value, udOther: f.udOther.value,
    cc: f.cc.value, pi: f.pi.value, dx: f.dx.value,
    locationOther: f.locationOther.value, contact: f.contact.value,
    updatedAt: Date.now(),
  });
  if (existing) consults[consults.indexOf(existing)] = next;
  else consults.push(next);
  saveConsults();
  closeConsult(true);
  renderEr();
  toast(existing ? 'Saved' : 'Consult added');
});

$('#consultCancel').addEventListener('click', () => closeConsult());
consultEditor.addEventListener('cancel', (e) => { e.preventDefault(); closeConsult(); });
$('#consultDelete').addEventListener('click', () => {
  const c = consults.find((x) => x.id === consultId);
  if (!c || !confirm(`Delete the consult for ${c.name || 'this patient'}?`)) return;
  const idx = consults.indexOf(c);
  consults.splice(idx, 1);
  saveConsults();
  closeConsult(true);
  renderEr();
  toast('Consult deleted', { label: 'Undo', run: () => { consults.splice(idx, 0, c); saveConsults(); renderEr(); } });
});

// A sticker gives name, HN and age without typing.
function fillConsultFromScan(found) {
  const f = consultForm.elements;
  const filled = [];
  for (const [k, label] of [['name', 'name'], ['hn', 'HN'], ['age', 'age']]) {
    if (!found[k]) continue;
    f[k].value = found[k];
    filled.push(found.unsure.includes(k) ? `${label} (check)` : label);
  }
  consultDirty = consultDirty || filled.length > 0;
  $('#consultScanStatus').textContent = filled.length
    ? `Filled from the scan: ${filled.join(', ')}. Check them against the sticker.`
    : 'No name, HN or age could be read from that picture.';
}
$('#consultScanBtn').addEventListener('click', () => openScanner(fillConsultFromScan));

/* ---------- switching between Ward and ER ---------- */

function switchMain(main) {
  state.main = main;
  for (const t of document.querySelectorAll('[data-main]')) t.setAttribute('aria-selected', String(t.dataset.main === main));
  for (const [id, show] of [['wardHead', 'ward'], ['list', 'ward'], ['erHead', 'er'], ['erList', 'er']]) $(`#${id}`).hidden = show !== main;
  $('#addBtn').setAttribute('aria-label', main === 'er' ? 'Add ER consult' : 'Add patient');
  if (main === 'er') renderEr(); else render();
  window.scrollTo(0, 0);
}

for (const t of document.querySelectorAll('[data-main]')) t.addEventListener('click', () => switchMain(t.dataset.main));
for (const t of document.querySelectorAll('[data-er-view]')) {
  t.addEventListener('click', () => {
    erState.view = t.dataset.erView;
    for (const x of document.querySelectorAll('[data-er-view]')) x.setAttribute('aria-selected', String(x === t));
    renderEr();
  });
}
$('#erSearch').addEventListener('input', (e) => { erState.query = e.target.value.trim(); renderEr(); });

renderEr();
// "x min ago" keeps moving while the list is on screen.
setInterval(() => { if (state.main === 'er' && !document.hidden && !consultEditor.open) renderEr(); }, 60000);
