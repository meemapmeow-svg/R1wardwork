# Ward Work

A small mobile-friendly app for keeping track of ward patients and their paperwork.

## What it tracks

- Patient name, age, hospital number (HN), ward, bed number, admission date
- Diagnosis (the patient's own, e.g. on admission)
- Operative notes, each with its date (shows post-op day), its own diagnosis
  and the operation — kept separate from the patient's diagnosis
- Document checklist per patient:
  Admission note, Diagnosis, Discharge summary, Discharge reconcile form,
  Medical certificate, Follow-up appointment, plus optional Fax claim and
  Film for follow-up (optional items start as "not needed")
- Free-text notes

Tap a document on a patient card to tick it off. When everything is done the
patient can be archived, which moves them out of the active list.

## Post-op report

A patient with an operation gets a **Post-op report** button on their card.
It builds the report header (name, age in years, HN, diagnosis, and the most
recent operative note's operation; the diagnosis is the operative note's, or
the patient's if that is blank) ready to **Copy** or **Share** into a chat app such as LINE.
The text can be edited before copying.

## Scanning a sticker or document

There are two scan buttons:

- **On the main screen** (above the + button): scan anything, and the app
  works out whose it is. If the HN matches a patient in the list, that patient
  opens with the new details filled in; otherwise a new patient is started.
- **Inside a patient's form**: fills that patient's form.

Both open a live camera view. When it sees a patient barcode held steady (on a
sticker, or on a page that carries one) it takes the picture by itself. For
anything else, tap the round button, or use **Choose photo**. If the camera is
not available, **Choose photo** still works.

The camera view has two settings, switchable at the top: **Sticker / auto**
(the default) and **Operative note**. The operative-note setting never
captures by itself — frame the page, then tap the button — and only accepts a
picture in which the note's diagnosis, operation or date was found. The
**Scan operative note** button in a patient's Operative note section opens
the camera already on that setting.

What it reads from the printed patient block:

- **Order-sheet / first-page header** — HN, name, age, admission date
  (Buddhist-era dates are converted).
- **Patient sticker** — HN, ward code, name, age. If the barcode is sharp
  enough it is decoded and used to confirm the HN.

- **Operative note** — operation date, and the free-text diagnosis and
  operation block in the middle of the page, headed either `Diagnosis :` /
  `Operation :` or `Dx:` / `Op:`. The text is kept exactly as printed, line by
  line (numbered or dashed items stay separate lines of one entry). The coded
  pre/post-operative diagnosis lines and the coded OPERATION box are ignored.

To add an operative note to a patient already in the list, open that patient
and scan from there: their name, HN and ward are left as they are, only gaps
are filled, and a note belonging to a different HN is refused.

How it behaves:

- The reading happens on the phone itself (Tesseract OCR and the ZXing barcode
  reader, bundled in `vendor/`). The photo is not uploaded and not kept.
- The photo is read several ways and the results compared. Fields the readings
  disagree on are filled in amber — check those first.
- Handwriting (diagnosis, operation, a handwritten ward) is not read.
- Always check the filled fields against the paper. Thai names in particular
  can come out with a wrong letter. Fill the frame with the printed block,
  keep it level and sharp, and avoid shadows and glare.

## Using it on a phone

The app is plain HTML/CSS/JS with no build step and no server.

1. Host the folder on any static HTTPS host. With GitHub Pages:
   **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.
2. Open the page on the phone and add it to the home screen
   (iOS Safari: Share → Add to Home Screen; Android Chrome: menu → Install app).
3. It then opens full-screen and works offline.

To try it on a computer: `python3 -m http.server` in this folder, then open
<http://localhost:8000>.

## Where the data lives

Patient data is stored **only on the device**, in the browser's local storage.
The app never sends it anywhere, and nothing about patients is ever in this
repository.

That also means:

- Data does not sync between devices.
- Clearing browser data, or uninstalling the home-screen app, erases the list.
- Use **⋮ → Export backup file** regularly. Importing a backup merges it with
  what is already on the device (newer edits win).
- Backup files contain patient-identifiable information — store them according
  to your hospital's policy, and never commit one to this repository.
- There is no passcode on the app itself; it relies on the phone's lock screen.
