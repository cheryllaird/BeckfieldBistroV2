// Exports one user's own saved photo recipes as a local corpus for the OCR-only
// eval (`npm run eval:ocr`). Each photo recipe becomes <id>.jpg (its saved
// originalImage) and <id>.truth.json (the saved recipe, used as the truth),
// plus one manifest.csv row where you tag the layout and mark hand-checked.
//
// Read-only on Firestore. Writes only to --out (default corpus/, gitignored).
// Only recipes that user created are exported (userId === uid): a shared
// bistro also holds other members' recipes, and those stay out.
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
const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// bistros/{uid} is the current home; users/{uid} holds pre-bistro copies.
// The same recipe can exist in both, so the bistro copy wins.
const counts = { recipes: 0, untagged: 0, otherMembers: 0, idClash: 0, photo: 0, noImage: 0, notJpeg: 0, written: 0, keptTruth: 0 };
const recipes = new Map();
const sourceIds = new Map();
const sources = [
  { ref: db.collection('bistros').doc(values.uid), shared: true },
  // users/{uid} is private to the user, so a missing userId there is still theirs
  { ref: db.collection('users').doc(values.uid), shared: false },
];
for (const { ref, shared } of sources) {
  const snap = await ref.collection('recipes').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.userId !== values.uid && (shared || data.userId !== undefined)) {
      counts.otherMembers++;
      continue;
    }
    const id = safeId(doc.id);
    if (sourceIds.has(id) && sourceIds.get(id) !== doc.id) counts.idClash++;
    if (recipes.has(id)) continue;
    recipes.set(id, data);
    sourceIds.set(id, doc.id);
  }
}
counts.recipes = recipes.size;
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
  // Recipes saved before importMeta existed have none. The app only stores an
  // originalImage when a recipe is created from a photo, so treat those as photo imports.
  const untaggedPhoto = !r.importMeta && typeof r.originalImage === 'string' && r.originalImage !== '';
  if (r.importMeta?.method !== 'photo' && !untaggedPhoto) continue;
  counts.photo++;
  if (untaggedPhoto) counts.untagged++;
  if (typeof r.originalImage !== 'string' || !r.originalImage) {
    counts.noImage++;
    continue;
  }
  if (!JPEG_DATA_URL.test(r.originalImage)) {
    counts.notJpeg++;
    continue;
  }

  // Firestore does not enforce types, so every field is coerced to the shape
  // the eval expects; anything else in the doc is left out.
  const ingredients = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((i) => i && typeof i === 'object')
      .map((i) => ({ name: str(i.name), quantity: num(i.quantity), unit: str(i.unit), originalText: str(i.originalText) }));
  const sections = (Array.isArray(r.ingredientSections) ? r.ingredientSections : [])
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({ title: str(s.title), ingredients: ingredients(s.ingredients) }));
  const truth = {
    id,
    title: str(r.title),
    servings: num(r.servings),
    prepTime: str(r.prepTime),
    totalTime: str(r.totalTime),
    ingredientSections: sections.length > 0 ? sections : [{ title: '', ingredients: ingredients(r.ingredients) }],
    steps: (Array.isArray(r.steps) ? r.steps : []).filter((s) => typeof s === 'string'),
    extractionMethod: typeof r.importMeta?.extractionMethod === 'string' ? r.importMeta.extractionMethod : null,
    editedBeforeSave: Array.isArray(r.importMeta?.editedBeforeSave)
      ? r.importMeta.editedBeforeSave.filter((f) => typeof f === 'string')
      : null,
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
  `${counts.recipes} recipes created by this user (${counts.otherMembers} by other bistro members skipped` +
    (counts.idClash ? `, ${counts.idClash} dropped because their ids clash once made file-safe` : '') +
    `), ${counts.photo} photo imports (${counts.untagged} from before importMeta, found by their originalImage): ` +
    `${counts.noImage} without originalImage, ${counts.notJpeg} not a JPEG data URL, ` +
    (values.apply
      ? `${counts.written} written to ${values.out}/ (${counts.keptTruth} existing truth files kept)`
      : `${rows.size} would be written to ${values.out}/ — dry run, pass --apply to write`),
);
