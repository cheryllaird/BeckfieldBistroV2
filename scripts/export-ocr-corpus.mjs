// Exports one user's saved photo recipes as a local corpus for the OCR-only
// eval (`npm run eval:ocr`). Each photo recipe becomes <id>.jpg (its saved
// originalImage) and <id>.truth.json (the saved recipe, used as the truth),
// plus one manifest.csv row where you tag the layout and mark hand-checked.
//
// Read-only on Firestore. Writes only to --out (default corpus/, gitignored).
// The corpus holds the user's own recipes: keep it on your machine and never
// commit it. Run by a human, never by an agent.
//
// Dry run by default (prints counts only); pass --apply to write files.
// Existing truth files and manifest tags are kept, so hand-checked edits
// survive a re-export; pass --overwrite to replace truth files too.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (same as the API functions)
//
//   node scripts/export-ocr-corpus.mjs --uid <uid> [--out corpus] [--apply] [--overwrite]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { values } = parseArgs({
  options: {
    uid: { type: 'string' },
    out: { type: 'string', default: 'corpus' },
    apply: { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
  },
});

if (!values.uid) {
  console.error('Usage: node scripts/export-ocr-corpus.mjs --uid <uid> [--out corpus] [--apply] [--overwrite]');
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set');
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const COLUMNS = ['id', 'layout', 'handChecked', 'extractionMethod', 'editedBeforeSave'];
const JPEG_DATA_URL = /^data:image\/jpe?g;base64,/;

// Firestore ids are usually [A-Za-z0-9]; anything else must not escape --out.
const safeId = (id) => id.replace(/[^A-Za-z0-9_-]/g, '_');
const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// bistros/{uid} is the current home; users/{uid} holds pre-bistro copies.
// The same recipe can exist in both, so the bistro copy wins.
const recipes = new Map();
for (const ref of [db.collection('bistros').doc(values.uid), db.collection('users').doc(values.uid)]) {
  const snap = await ref.collection('recipes').get();
  for (const doc of snap.docs) {
    const id = safeId(doc.id);
    if (!recipes.has(id)) recipes.set(id, doc.data());
  }
}

const counts = { recipes: recipes.size, photo: 0, noImage: 0, notJpeg: 0, written: 0, keptTruth: 0 };
const rows = new Map();

// Keep the owner's layout tags and hand-checked marks from an earlier export.
const manifestPath = path.join(values.out, 'manifest.csv');
const previous = new Map();
if (existsSync(manifestPath)) {
  const [header, ...lines] = readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const cols = header.split(',');
  for (const line of lines) {
    // Tags are simple words; a quoted field is passed through as-is.
    const cells = line.split(',');
    const row = Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
    if (row.id) previous.set(row.id, row);
  }
}

if (values.apply) mkdirSync(values.out, { recursive: true });

for (const [id, r] of recipes) {
  if (r.importMeta?.method !== 'photo') continue;
  counts.photo++;
  if (typeof r.originalImage !== 'string' || !r.originalImage) {
    counts.noImage++;
    continue;
  }
  if (!JPEG_DATA_URL.test(r.originalImage)) {
    counts.notJpeg++;
    continue;
  }

  const ingredientSections =
    Array.isArray(r.ingredientSections) && r.ingredientSections.length > 0
      ? r.ingredientSections
      : [{ title: '', ingredients: Array.isArray(r.ingredients) ? r.ingredients : [] }];
  const truth = {
    id,
    title: r.title ?? '',
    servings: r.servings ?? 0,
    prepTime: r.prepTime ?? '',
    totalTime: r.totalTime ?? '',
    ingredientSections,
    steps: Array.isArray(r.steps) ? r.steps : [],
    extractionMethod: r.importMeta.extractionMethod ?? null,
    editedBeforeSave: Array.isArray(r.importMeta.editedBeforeSave) ? r.importMeta.editedBeforeSave : null,
  };

  const before = previous.get(id);
  rows.set(id, {
    id,
    layout: before?.layout ?? '',
    handChecked: before?.handChecked ?? '',
    extractionMethod: truth.extractionMethod ?? '',
    editedBeforeSave: truth.editedBeforeSave === null ? '' : truth.editedBeforeSave.join(';') || 'none',
  });

  if (!values.apply) continue;
  writeFileSync(path.join(values.out, `${id}.jpg`), Buffer.from(r.originalImage.replace(JPEG_DATA_URL, ''), 'base64'));
  const truthPath = path.join(values.out, `${id}.truth.json`);
  if (existsSync(truthPath) && !values.overwrite) {
    counts.keptTruth++;
  } else {
    writeFileSync(truthPath, JSON.stringify(truth, null, 2) + '\n');
  }
  counts.written++;
}

if (values.apply) {
  // Rows for photos no longer exported are dropped; their files are left alone.
  const csv = [COLUMNS.join(','), ...[...rows.values()].map((row) => COLUMNS.map((c) => csvField(String(row[c]))).join(','))];
  writeFileSync(manifestPath, csv.join('\n') + '\n');
}

console.log(
  `${counts.recipes} recipes, ${counts.photo} photo imports: ` +
    `${counts.noImage} without originalImage, ${counts.notJpeg} not a JPEG data URL, ` +
    (values.apply
      ? `${counts.written} written to ${values.out}/ (${counts.keptTruth} existing truth files kept)`
      : `${rows.size} would be written to ${values.out}/ — dry run, pass --apply to write`),
);
