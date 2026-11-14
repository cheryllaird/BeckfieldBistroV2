// Corpus format for the OCR-only eval. A corpus is a directory holding
// `<id>.jpg`, `<id>.truth.json` and one `manifest.csv`. The manifest is where
// the owner tags each photo's layout and marks it hand-checked.
// scripts/export-ocr-corpus.mjs writes it; fixtures/ holds a committed one.

import type { RecipeLike } from './score';

export interface ManifestRow {
  id: string;
  /** Free-text tag, e.g. single-column, two-column, card, handwritten. '' when untagged. */
  layout: string;
  /** The truth file was checked against the photo by a person. Headline numbers use only these. */
  handChecked: boolean;
}

export interface TruthFile extends RecipeLike {
  id: string;
  /** How the saved recipe was extracted (e.g. gemini-vision). Null for hand-written truth. */
  extractionMethod: string | null;
  /** Fields the user edited before saving. Null when unknown (hand-written truth, older recipes). */
  editedBeforeSave: string[] | null;
}

export type EditedGroup = 'edited' | 'unedited' | 'unknown';

export function editedGroup(truth: Pick<TruthFile, 'editedBeforeSave'>): EditedGroup {
  if (!Array.isArray(truth.editedBeforeSave)) return 'unknown';
  return truth.editedBeforeSave.length > 0 ? 'edited' : 'unedited';
}

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'x']);

/** Reads manifest rows by header name, so extra or reordered columns are fine. */
export function parseManifest(csv: string): ManifestRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.trim() === name);
  const idCol = col('id');
  if (idCol < 0) throw new Error('manifest.csv needs an "id" column');
  const layoutCol = col('layout');
  const checkedCol = col('handChecked');
  return rows
    .map((r) => ({
      id: (r[idCol] ?? '').trim(),
      layout: layoutCol >= 0 ? (r[layoutCol] ?? '').trim() : '',
      handChecked: checkedCol >= 0 && TRUTHY.has((r[checkedCol] ?? '').trim().toLowerCase()),
    }))
    .filter((r) => r.id !== '');
}
