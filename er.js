'use strict';

/* ER consults — notifications received from the emergency room.
   Kept in their own list (and their own storage key) next to the ward
   patients. Loaded after app.js and uses its helpers. */

const ER_KEY = 'wardwork.er.v1';

// The tap-to-select buttons. These are only the starting set: the lists can be
// edited in the app (menu → Edit ER consult buttons) and are stored on the device.
const ER_DEFAULTS = {
  prefixes: ['นาย', 'นาง', 'น.ส.', 'ด.ช.', 'ด.ญ.'],
  schemes: ['ข้าราชการ', 'ประกันสังคม', 'UC รามา', 'UC ที่อื่น', 'ผู้พิการ', 'พรบ.', 'ชำระเงินเอง', 'ประกันเอกชน'],
  ud: ['HT', 'DM', 'DLP', 'Old CVA', 'CKD', 'IHD', 'AF'],
  filmsPlain: ['CXR', 'Pelvis'],
  // These take a side: tapping goes Rt → Lt → Both → off.
  filmsSided: ['Hip AP', 'Hip lateral cross-table', 'Shoulder', 'Upper arm', 'Forearm', 'Wrist', 'Hand', 'Fingers', 'Thigh', 'Knee', 'Leg', 'Ankle', 'Foot', 'Toes'],
  labs: ['CBC', 'Elyte', 'BUN', 'Cr', 'Coagulogram', 'Ca', 'Mg', 'PO4', 'LFT', 'Anti-HIV', 'D-dimer'],
  locations: ['Resus', 'Counter 4', 'T1', 'T2', 'T3', 'OGP'],
};
const ER_OPTION_KEYS = Object.keys(ER_DEFAULTS);
const ER_OPTIONS_KEY = 'wardwork.er.options';
const ER_SIDES = ['Rt', 'Lt', 'Both'];
// Locations inside the ER are written "ER Resus" etc. in messages; ones you add are written as typed.
const ER_ZONES = ER_DEFAULTS.locations;
const OTHER = 'other';

const unique = (arr) => [...new Set(arr)];
const cleanList = (v) => unique((Array.isArray(v) ? v : []).map((x) => String(x == null ? '' : x).trim().slice(0, 60)).filter(Boolean));

function cleanOptions(raw) {
  const out = {};
  for (const k of ER_OPTION_KEYS) out[k] = raw && Array.isArray(raw[k]) ? cleanList(raw[k]) : [...ER_DEFAULTS[k]];
  // A film can only be in one of the two film lists.
  out.filmsSided = out.filmsSided.filter((x) => !out.filmsPlain.includes(x));
  return out;
}

function loadErOptions() {
  try { return cleanOptions(JSON.parse(localStorage.getItem(ER_OPTIONS_KEY))); }
  catch (e) { return cleanOptions(null); }
}

function saveErOptions() {
  try { localStorage.setItem(ER_OPTIONS_KEY, JSON.stringify(erOptions)); } catch (e) {}
}

// Used by the backup import in app.js.
function importErOptions(raw) {
  if (!raw || typeof raw !== 'object') return;
  erOptions = cleanOptions(raw);
  saveErOptions();
}

let erOptions = loadErOptions();
const filmDefs = () => [...erOptions.filmsPlain.map((id) => ({ id })), ...erOptions.filmsSided.map((id) => ({ id, side: true }))];
// The current buttons, plus anything this consult already holds that has since been removed from the list.
const withExtras = (options, held) => unique([...options, ...held.filter(Boolean)]);

/* ---------- storage ---------- */

function normalizeConsult(c) {
  const str = (v) => (v == null ? '' : String(v)).trim();
  // Consults saved before these options were renamed or split.
  if (c.films && c.films.Arm && !c.films.Forearm) c = { ...c, films: { ...c.films, Forearm: c.films.Arm, Arm: undefined } };
  if (c.scheme === 'UC') c = { ...c, scheme: OTHER, schemeOther: 'UC' };
  // Choices are kept as stored even if their button is later removed from the lists.
  const films = {};
  for (const [id, v] of Object.entries(c && c.films && typeof c.films === 'object' ? c.films : {})) {
    if (id.trim() && (v === 'Y' || ER_SIDES.includes(v))) films[id.trim()] = v;
  }
  const status = ['new', 'seen', 'closed', 'admitted'].includes(c.status) ? c.status : 'new';
  return {
    id: str(c.id) || uid(),
    prefix: str(c.prefix),
    name: str(c.name), hn: str(c.hn), age: str(c.age),
    scheme: str(c.scheme),
    schemeOther: str(c.schemeOther),
    ud: cleanList(c.ud), udOther: str(c.udOther), noUd: !!c.noUd,
    cc: str(c.cc), pi: str(c.pi),
    films, labs: cleanList(c.labs),
    dx: str(c.dx),
    location: str(c.location),
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
const fullName = (c) => [c.prefix, c.name].filter(Boolean).join(' ');
const locationText = (c) => (c.location === OTHER ? c.locationOther : ER_ZONES.includes(c.location) ? `ER ${c.location}` : c.location);
const udText = (c) => (c.noUd ? 'ไม่มีโรคประจำตัว' : [...c.ud, c.udOther].filter(Boolean).join(', '));
const filmText = (c) => withExtras(filmDefs().map((f) => f.id), Object.keys(c.films)).filter((id) => c.films[id]).map((id) => (c.films[id] === 'Y' ? id : `${id} ${c.films[id]}`)).join(', ');
const labText = (c) => withExtras(erOptions.labs, c.labs).filter((l) => c.labs.includes(l)).join(', ');

function consultMessage(c) {
  const age = /^\d+$/.test(c.age) ? `${c.age} ปี` : c.age;
  const line = (label, text) => (text ? [labelled(label, text)] : []);
  return [
    'ขออนุญาตรายงานเคส consult ER ครับ',
    '',
    fullName(c),
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
    .filter((c) => !q || [fullName(c), c.hn, c.dx, c.cc, locationText(c), c.contact].some((v) => v.toLowerCase().includes(q)))
    // Not-yet-seen first, then newest first.
    .sort((a, b) => (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.createdAt - a.createdAt);

  const list = $('#erList');
  if (!shown.length) {
    list.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, q ? 'No matching consults' : erState.view === 'open' ? 'No open consults' : 'No closed consults'),
      h('p', null, q ? 'Try a different search.' : erState.view === 'open' ? 'Tap + when the ER calls.' : 'Consults you close or admit appear here.')));
    return;
  }
  // Finished consults can be cleared out together (only the ones on screen, so a search narrows it).
  const clearAll = erState.view === 'closed' && shown.length > 1 && h('button', {
    class: 'ghost-btn danger',
    onclick: () => deleteConsults(shown, `Delete ${q ? 'these' : 'all'} ${shown.length} closed and admitted consults? Patients already admitted stay in the ward list.`),
  }, `Delete ${q ? 'these' : 'all'} ${shown.length}`);
  list.replaceChildren(...(clearAll ? [clearAll] : []), ...shown.map(consultCard));
}

function consultCard(c) {
  const info = (tag, text) => text && h('p', { class: 'line pre' }, h('span', { class: 'sub' }, tag), ` ${text}`);
  const statusLabel = { new: 'New', seen: 'Seen', closed: 'Closed', admitted: 'Admitted' }[c.status];
  const who = [c.hn && `HN ${c.hn}`, schemeText(c)].filter(Boolean).join(' · ');
  const tel = c.contact.replace(/[^\d+]/g, '');

  return h('article', { class: `card consult ${c.status}` },
    h('div', { class: 'card-head' },
      h('button', { class: 'card-title', onclick: () => openConsult(c), 'aria-label': `Edit ${fullName(c)}` },
        h('span', { class: 'name' }, fullName(c) || 'Unnamed'),
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
      h('button', { class: 'text-btn', onclick: () => openConsult(c) }, 'Edit'),
      isOpen(c)
        ? h('button', { class: 'doc' + (c.status === 'seen' ? ' done' : ''), 'aria-pressed': String(c.status === 'seen'), onclick: () => setConsultStatus(c.id, c.status === 'seen' ? 'new' : 'seen') },
          h('span', { class: 'box', 'aria-hidden': 'true' }), 'Seen')
        : h('button', { class: 'text-btn', onclick: () => setConsultStatus(c.id, 'seen') }, 'Reopen'),
      !isOpen(c) && h('button', { class: 'text-btn danger-text', onclick: () => deleteConsults([c], deleteQuestion(c)) }, 'Delete'),
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
  if (status === 'closed') toast(`${fullName(c) || 'Consult'} closed`, { label: 'Undo', run: () => setConsultStatus(id, before) });
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
  openEditor(null, { quiet: true, afterSave: done, preset: { name: fullName(c), hn: c.hn, age: c.age, diagnosis: c.dx, notes, admitDate: todayStr() } });
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

  $('#pickPrefix').replaceChildren(
    ...withExtras(erOptions.prefixes, [draft.prefix]).map((x) => chip(x, draft.prefix === x, single('prefix', x))));

  $('#pickScheme').replaceChildren(
    ...withExtras(erOptions.schemes, [draft.scheme === OTHER ? '' : draft.scheme]).map((x) => chip(x, draft.scheme === x, single('scheme', x))),
    chip('อื่นๆ', draft.scheme === OTHER, single('scheme', OTHER)));
  consultForm.elements.schemeOther.hidden = draft.scheme !== OTHER;

  $('#pickUd').replaceChildren(
    chip('ไม่มี', draft.noUd, touch(() => { draft.noUd = !draft.noUd; if (draft.noUd) draft.ud = []; })),
    ...withExtras(erOptions.ud, draft.ud).map((u) => chip(u, draft.ud.includes(u), touch(() => { toggle(draft.ud, u); draft.noUd = false; }))));
  consultForm.elements.udOther.hidden = draft.noUd;

  const defs = filmDefs();
  $('#pickFilm').replaceChildren(...withExtras(defs.map((f) => f.id), Object.keys(draft.films)).map((id) => {
    const def = defs.find((f) => f.id === id);
    const v = draft.films[id];
    const sided = def ? !!def.side : v !== 'Y';
    const next = sided ? ER_SIDES[ER_SIDES.indexOf(v) + 1] : (v ? undefined : 'Y');
    return chip(v && v !== 'Y' ? `${id} ${v}` : id, v, touch(() => { if (next) draft.films[id] = next; else delete draft.films[id]; }));
  }));

  $('#pickLab').replaceChildren(...withExtras(erOptions.labs, draft.labs).map((l) => chip(l, draft.labs.includes(l), touch(() => toggle(draft.labs, l)))));

  $('#pickLocation').replaceChildren(
    ...withExtras(erOptions.locations, [draft.location === OTHER ? '' : draft.location]).map((l) => chip(l, draft.location === l, single('location', l))),
    chip('Other ward', draft.location === OTHER, single('location', OTHER)));
  consultForm.elements.locationOther.hidden = draft.location !== OTHER;
}

function openConsult(c) {
  consultId = c ? c.id : null;
  const data = c || normalizeConsult({});
  draft = { prefix: data.prefix, scheme: data.scheme, ud: [...data.ud], noUd: data.noUd, films: { ...data.films }, labs: [...data.labs], location: data.location };
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
// Deleting is always confirmed first and can be undone from the toast.
function deleteConsults(doomed, question) {
  if (!doomed.length || !confirm(question)) return false;
  const before = consults.slice();
  consults = consults.filter((c) => !doomed.includes(c));
  saveConsults();
  renderEr();
  toast(doomed.length === 1 ? 'Consult deleted' : `${doomed.length} consults deleted`,
    { label: 'Undo', run: () => { consults = before; saveConsults(); renderEr(); } });
  return true;
}

const deleteQuestion = (c) => `Delete the consult for ${fullName(c) || 'this patient'}?`;

$('#consultDelete').addEventListener('click', () => {
  const c = consults.find((x) => x.id === consultId);
  if (c && deleteConsults([c], deleteQuestion(c))) closeConsult(true);
});

// A sticker gives name, HN and age without typing.
function fillConsultFromScan(found) {
  const f = consultForm.elements;
  const filled = [];
  // A title read with the name ("นาย ...", "น.ส....") becomes the prefix button.
  if (found.name) {
    const titles = [...erOptions.prefixes, 'นางสาว'].sort((x, y) => y.length - x.length);
    const title = titles.find((t) => found.name.startsWith(t) && found.name.length > t.length);
    if (title) {
      const asButton = title === 'นางสาว' && erOptions.prefixes.includes('น.ส.') ? 'น.ส.' : title;
      if (erOptions.prefixes.includes(asButton)) {
        draft.prefix = asButton;
        found = { ...found, name: found.name.slice(title.length).trim() };
        renderPicks();
      }
    }
  }
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

/* ---------- editing the button lists ---------- */

const erSettings = $('#erSettings');
const erSettingsForm = $('#erSettingsForm');

function fillErSettings(options) {
  for (const k of ER_OPTION_KEYS) {
    const box = erSettingsForm.elements[k];
    box.value = options[k].join('\n');
    box.rows = Math.max(3, options[k].length + 1);
  }
}

function openErSettings() {
  fillErSettings(erOptions);
  erSettings.showModal();
  $('.sheet-body', erSettings).scrollTop = 0;
}

erSettingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = {};
  for (const k of ER_OPTION_KEYS) raw[k] = erSettingsForm.elements[k].value.split('\n');
  erOptions = cleanOptions(raw);
  saveErOptions();
  erSettings.close();
  if (consultEditor.open) renderPicks();
  renderEr();
  toast('ER buttons saved');
});
$('#erSettingsCancel').addEventListener('click', () => erSettings.close());
$('#erSettingsReset').addEventListener('click', () => {
  if (confirm('Put all the lists back to the original buttons? (Nothing is saved until you tap Save.)')) fillErSettings(cleanOptions(null));
});
for (const b of document.querySelectorAll('[data-open-er-settings]')) {
  b.addEventListener('click', () => { if (menu.open) menu.close(); openErSettings(); });
}

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
