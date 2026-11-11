# Ward Work

A small mobile-friendly app for keeping track of ward patients and their paperwork.

## What it tracks

- Patient name, age, hospital number (HN), ward, admission date
- Diagnosis
- Operations, each with its date (shows post-op day)
- Document checklist per patient:
  Admission note, Diagnosis, Discharge summary, Discharge reconcile form,
  Medical certificate, Follow-up appointment, plus optional Fax claim and
  Film for follow-up (optional items start as "not needed")
- Free-text notes

Tap a document on a patient card to tick it off. When everything is done the
patient can be archived, which moves them out of the active list.

## Scanning a sticker or sheet header

In the patient form, **Scan sticker or sheet header** takes a photo (or picks
one) and fills in what it can read from the printed patient block: HN, name,
age and admission date. Thai dates in the Buddhist era are converted.

- The reading happens on the phone itself (Tesseract OCR bundled in
  `vendor/tesseract/`). The photo is not uploaded and not kept.
- Handwriting — ward, diagnosis, operation — is not read; type those in.
- Always check the filled fields against the paper. Thai names in particular
  can come out with a wrong letter. Fill the frame with the printed block,
  keep it level and avoid shadows for the best result.

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
