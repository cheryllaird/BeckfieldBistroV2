// Turns scored photos into report.json, report.md and a self-contained
// report.html. Pure string building: the runner (scripts/eval-ocr.ts) does I/O.

import type { EditedGroup } from './corpus';
import { aggregate, cer, flattenIngredients, type Metrics, type RecipeLike, type StageScore } from './score';

const STAGES = ['raw', 'reflow', 'parser'] as const;
type Stage = (typeof STAGES)[number];

const STAGE_LABELS: Record<Stage, string> = {
  raw: 'raw OCR text (before reflow)',
  reflow: 'reflowed OCR text',
  parser: 'parseRecipeText output (ocr+local)',
};

const LOWER_BOUND_NOTE =
  'Exported corpora use the saved `originalImage` (1200px longest side, JPEG q0.72), while production ' +
  'extraction OCRs the 2048px q0.9 upload. These scores are therefore a lower bound on production accuracy.';

export interface PhotoResult {
  id: string;
  layout: string;
  handChecked: boolean;
  edited: EditedGroup;
  gate: { ok: boolean; reason: string };
  confidence: number;
  columnsReflowed: boolean;
  stages: Record<Stage, StageScore>;
  truth: RecipeLike;
  parsed: RecipeLike;
  rawText: string;
  text: string;
  /** Set when OCR threw for this photo; it is then scored as empty text. */
  error?: string;
  /** Small JPEG data URI for the HTML page only; never written to JSON. */
  thumbnail?: string;
}

export interface ReportMeta {
  generatedAt: string;
  corpus: string;
  variant: Record<string, unknown>;
}

type StageMetrics = Record<Stage, Metrics>;

function byStage(photos: PhotoResult[]): StageMetrics {
  return Object.fromEntries(
    STAGES.map((stage) => [stage, aggregate(photos.map((p) => ({ score: p.stages[stage], gatePassed: p.gate.ok })))]),
  ) as StageMetrics;
}

function groupBy(photos: PhotoResult[], key: (p: PhotoResult) => string): Record<string, StageMetrics> {
  const groups = new Map<string, PhotoResult[]>();
  for (const p of photos) {
    const k = key(p);
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, ps]) => [k, byStage(ps)]));
}

export interface ReportJson {
  meta: ReportMeta & { note: string; stages: typeof STAGE_LABELS };
  headline: { subset: 'hand-checked' | 'full set'; stage: 'parser'; metrics: Metrics };
  breakdowns: {
    stage: Record<string, StageMetrics>;
    layout: Record<string, StageMetrics>;
    edited: Record<string, StageMetrics>;
  };
  photos: Omit<PhotoResult, 'thumbnail'>[];
}

export function buildReportJson(photos: PhotoResult[], meta: ReportMeta): ReportJson {
  const checked = photos.filter((p) => p.handChecked);
  const headlineSet = checked.length > 0 ? checked : photos;
  return {
    meta: { ...meta, note: LOWER_BOUND_NOTE, stages: STAGE_LABELS },
    headline: {
      subset: checked.length > 0 ? 'hand-checked' : 'full set',
      stage: 'parser',
      metrics: byStage(headlineSet).parser,
    },
    breakdowns: {
      stage: { 'hand-checked': byStage(checked), 'full set': byStage(photos) },
      layout: groupBy(photos, (p) => p.layout || 'untagged'),
      edited: groupBy(photos, (p) => p.edited),
    },
    photos: photos.map((p) => {
      const rest = { ...p };
      delete rest.thumbnail;
      return rest;
    }),
  };
}

// ─── Formatting ──────────────────────────────────────────────────────────────

const METRIC_COLUMNS: [keyof Metrics, string][] = [
  ['photos', 'Photos'],
  ['quantityUnitExact', 'Qty+unit exact'],
  ['ingredientRecall', 'Ingr. recall'],
  ['ingredientPrecision', 'Ingr. precision'],
  ['stepCer', 'Step CER ↓'],
  ['stepCountMatch', 'Step count'],
  ['title', 'Title'],
  ['servings', 'Servings'],
  ['withinTwoEdits', '≤2 edits'],
  ['gatePass', 'Gate pass'],
];

export function formatMetric(key: keyof Metrics, value: number | null): string {
  if (value === null) return '—';
  if (key === 'photos') return String(value);
  return `${(value * 100).toFixed(key === 'stepCer' ? 1 : 0)}%`;
}

function mdTable(rows: [string, Metrics][], firstHeader: string): string {
  const header = `| ${firstHeader} | ${METRIC_COLUMNS.map(([, l]) => l).join(' | ')} |`;
  const sep = `|${' --- |'.repeat(METRIC_COLUMNS.length + 1)}`;
  const body = rows.map(([label, m]) => `| ${label} | ${METRIC_COLUMNS.map(([k]) => formatMetric(k, m[k])).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function stageRows(groups: Record<string, StageMetrics>): [string, Metrics][] {
  return Object.entries(groups).flatMap(([group, stages]) =>
    STAGES.map((stage): [string, Metrics] => [`${group} · ${stage}`, stages[stage]]),
  );
}

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(0)}%`);

export function renderMarkdown(report: ReportJson): string {
  const { meta, headline, breakdowns, photos } = report;
  const lines = [
    '# OCR-only extraction eval',
    '',
    `Generated ${meta.generatedAt} from \`${meta.corpus}\` · preprocessing variant: \`${JSON.stringify(meta.variant)}\``,
    '',
    `> ${meta.note}`,
    '',
    'Free OCR only: Tesseract via `api/_utils/ocr.ts`, then `parseRecipeText`. No Gemini calls.',
    'Stages: ' + STAGES.map((s) => `**${s}** = ${STAGE_LABELS[s]}`).join('; ') + '.',
    'Text stages measure whether the truth is present in reading order, so they have no precision, quantity, servings or edit figures.',
    'Every photo is scored, including ones that fail the quality gate (production would not run `ocr+local` on those).',
    '',
    `## Headline (${headline.subset}, parser stage)`,
    '',
    mdTable([[headline.subset, headline.metrics]], 'Set'),
    '',
    '## By stage',
    '',
    mdTable(stageRows(breakdowns.stage), 'Set · stage'),
    '',
    '## By layout tag',
    '',
    mdTable(stageRows(breakdowns.layout), 'Layout · stage'),
    '',
    '## Edited before save vs unedited',
    '',
    mdTable(stageRows(breakdowns.edited), 'Group · stage'),
    '',
    '## Per photo (parser stage)',
    '',
    '| Photo | Layout | Checked | Edited | Gate | Conf. | Reflowed | Ingr. recall | Step CER | Edits |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...photos.map((p) => {
      const s = p.stages.parser;
      return `| ${p.id} | ${p.layout || 'untagged'} | ${p.handChecked ? 'yes' : 'no'} | ${p.edited} | ${p.gate.ok ? 'pass' : `fail: ${p.gate.reason}`} | ${Math.round(p.confidence)} | ${p.columnsReflowed ? 'yes' : 'no'} | ${pct(s.ingredientsTruth ? s.ingredientsMatched / s.ingredientsTruth : null)} | ${pct(cer(s))} | ${s.edits ?? '—'} |`;
    }),
    '',
    '## Metric definitions',
    '',
    '- **Qty+unit exact**: of the matched ingredients, the share whose quantity and unit (plurals and long forms folded) are both right.',
    '- **Ingr. recall / precision**: one-to-one fuzzy matching on `originalText` (≥80% similar after case and whitespace folding).',
    '- **Step CER**: character edits from the parsed steps to the truth steps, over truth characters. Lower is better; 100% means nothing usable.',
    '- **Step count**: the parser found exactly as many steps as the truth.',
    '- **Title**: ≥80% similar. **Servings**: exact.',
    '- **≤2 edits**: share of photos the user could fix with at most two field edits (title, servings, each missing, extra or wrong ingredient, each missing, extra or wrong step).',
    '- **Gate pass**: `assessOcrQuality` accepted the OCR text.',
    '- Recall, precision and CER are pooled over all ingredients or characters in the set; the others are per-photo rates.',
    '',
  ];
  return lines.join('\n');
}

// ─── HTML ────────────────────────────────────────────────────────────────────

/** Takes unknown because truth files are hand-edited JSON: a wrong type must still render safely. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlTable(rows: [string, Metrics][], firstHeader: string): string {
  const head = `<tr><th>${escapeHtml(firstHeader)}</th>${METRIC_COLUMNS.map(([, l]) => `<th>${escapeHtml(l)}</th>`).join('')}</tr>`;
  const body = rows
    .map(([label, m]) => `<tr><th scope="row">${escapeHtml(label)}</th>${METRIC_COLUMNS.map(([k]) => `<td>${formatMetric(k, m[k])}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="scroll"><table>${head}${body}</table></div>`;
}

function list(items: string[]): string {
  return items.length ? `<ol>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ol>` : '<p class="muted">none</p>';
}

function photoCard(p: PhotoResult): string {
  const s = p.stages.parser;
  const stageRowsHtml = htmlTable(
    STAGES.map((stage): [string, Metrics] => [stage, aggregate([{ score: p.stages[stage], gatePassed: p.gate.ok }])]),
    'Stage',
  );
  const truthIngs = flattenIngredients(p.truth).map((i) => `${i.originalText}  [${i.quantity} ${i.unit}]`);
  const parsedIngs = flattenIngredients(p.parsed).map((i) => `${i.originalText}  [${i.quantity} ${i.unit}]`);
  return `<section class="card" id="${escapeHtml(p.id)}">
<h3>${escapeHtml(p.id)} <span class="tag">${escapeHtml(p.layout || 'untagged')}</span>${p.handChecked ? ' <span class="tag ok">hand-checked</span>' : ''} <span class="tag">${p.edited}</span> <span class="tag ${p.gate.ok ? 'ok' : 'bad'}">gate ${p.gate.ok ? 'pass' : `fail: ${escapeHtml(p.gate.reason)}`}</span></h3>
<p class="muted">confidence ${Math.round(p.confidence)} · columns reflowed: ${p.columnsReflowed ? 'yes' : 'no'} · edits needed: ${s.edits ?? '—'}${p.error ? ` · <strong>OCR error: ${escapeHtml(p.error)}</strong>` : ''}</p>
<div class="photo">${p.thumbnail ? `<img src="${p.thumbnail}" alt="Photo ${escapeHtml(p.id)}">` : ''}<div>${stageRowsHtml}</div></div>
<div class="cols">
<div><h4>Truth: ${escapeHtml(p.truth.title)} (serves ${escapeHtml(String(p.truth.servings || '—'))})</h4><h5>Ingredients</h5>${list(truthIngs)}<h5>Steps</h5>${list(p.truth.steps)}</div>
<div><h4>Parsed: ${escapeHtml(p.parsed.title)} (serves ${escapeHtml(String(p.parsed.servings || '—'))})</h4><h5>Ingredients</h5>${list(parsedIngs)}<h5>Steps</h5>${list(p.parsed.steps)}</div>
</div>
<details><summary>Reflowed OCR text</summary><pre>${escapeHtml(p.text)}</pre></details>
<details><summary>Raw OCR text</summary><pre>${escapeHtml(p.rawText)}</pre></details>
</section>`;
}

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1b18;--muted:#6b665e;--line:#e2ddd3;--card:#fff;--ok:#2f7d4f;--bad:#b3412f}
@media (prefers-color-scheme:dark){:root{--bg:#171614;--fg:#ece8e1;--muted:#a39d92;--line:#35322d;--card:#201f1c;--ok:#6cc08f;--bad:#ec8a77}}
*{box-sizing:border-box}body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1200px;margin-inline:auto}
h1{font-size:1.5rem}h2{margin-top:2rem;font-size:1.2rem}h3{font-size:1rem;margin:0 0 .25rem}h4{margin:.5rem 0 0;font-size:.95rem}h5{margin:.5rem 0 0;font-size:.8rem;color:var(--muted);text-transform:uppercase}
.note{border-left:3px solid var(--bad);padding:.25rem .75rem;color:var(--muted)}.muted{color:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;font-size:.85rem;font-variant-numeric:tabular-nums;white-space:nowrap}th,td{border-bottom:1px solid var(--line);padding:.3rem .5rem;text-align:right}th:first-child{text-align:left}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0}
.tag{font-size:.75rem;font-weight:normal;border:1px solid var(--line);border-radius:999px;padding:0 .5rem}.ok{color:var(--ok)}.bad{color:var(--bad)}
.photo{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}.photo img{max-width:min(320px,100%);border-radius:8px;border:1px solid var(--line)}.photo>div{flex:1 1 280px;min-width:0}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}ol{padding-left:1.25rem;margin:.25rem 0;font-size:.9rem}
pre{white-space:pre-wrap;font-size:.8rem;background:var(--bg);padding:8px;border-radius:8px;overflow-x:auto}
`;

export function renderHtml(report: ReportJson, photos: PhotoResult[]): string {
  const { meta, headline, breakdowns } = report;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OCR-only eval</title><style>${CSS}</style></head><body>
<h1>OCR-only extraction eval</h1>
<p class="muted">Generated ${escapeHtml(meta.generatedAt)} from <code>${escapeHtml(meta.corpus)}</code> · variant <code>${escapeHtml(JSON.stringify(meta.variant))}</code></p>
<p class="note">${escapeHtml(meta.note)}</p>
<p class="muted">Tesseract + <code>parseRecipeText</code> only, no Gemini. Stages: ${STAGES.map((s) => `<strong>${s}</strong> = ${escapeHtml(STAGE_LABELS[s])}`).join('; ')}. Gate failures are scored too.</p>
<h2>Headline (${headline.subset}, parser stage)</h2>${htmlTable([[headline.subset, headline.metrics]], 'Set')}
<h2>By stage</h2>${htmlTable(stageRows(breakdowns.stage), 'Set · stage')}
<h2>By layout tag</h2>${htmlTable(stageRows(breakdowns.layout), 'Layout · stage')}
<h2>Edited before save vs unedited</h2>${htmlTable(stageRows(breakdowns.edited), 'Group · stage')}
<h2>Photos</h2>
${photos.map(photoCard).join('\n')}
</body></html>
`;
}
