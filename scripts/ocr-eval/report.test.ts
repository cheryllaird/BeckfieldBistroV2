import { describe, it, expect } from 'vitest';
import { buildReportJson, escapeHtml, formatMetric, renderHtml, renderMarkdown, type PhotoResult } from './report';
import { scoreParsed, scoreText, type RecipeLike } from './score';

const truth: RecipeLike = {
  title: 'Soup',
  servings: 2,
  ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp', originalText: '1 tsp salt' }],
  steps: ['Boil <the> water.'],
};

const photo = (id: string, handChecked: boolean, layout = ''): PhotoResult => ({
  id,
  layout,
  handChecked,
  edited: 'unknown',
  gate: { ok: true, reason: '' },
  confidence: 90,
  columnsReflowed: false,
  stages: { raw: scoreText(truth, ''), reflow: scoreText(truth, ''), parser: scoreParsed(truth, truth) },
  truth,
  parsed: truth,
  rawText: '',
  text: '',
  thumbnail: 'data:image/jpeg;base64,AAAA',
});

const meta = { generatedAt: '2026-01-01T00:00:00Z', corpus: 'fixtures', variant: {} };

describe('buildReportJson', () => {
  it('takes headline numbers from the hand-checked subset when there is one', () => {
    const report = buildReportJson([photo('a', true), photo('b', false)], meta);
    expect(report.headline.subset).toBe('hand-checked');
    expect(report.headline.metrics.photos).toBe(1);
    expect(report.breakdowns.stage['full set'].parser.photos).toBe(2);
  });

  it('falls back to the full set and labels it', () => {
    const report = buildReportJson([photo('a', false)], meta);
    expect(report.headline.subset).toBe('full set');
    expect(report.headline.metrics.photos).toBe(1);
  });

  it('groups untagged layouts and leaves thumbnails out of the JSON', () => {
    const report = buildReportJson([photo('a', true, 'card'), photo('b', true)], meta);
    expect(Object.keys(report.breakdowns.layout)).toEqual(['card', 'untagged']);
    expect(JSON.stringify(report)).not.toContain('base64');
  });
});

describe('rendering', () => {
  it('states that the scores are a lower bound', () => {
    const report = buildReportJson([photo('a', true)], meta);
    expect(renderMarkdown(report)).toContain('lower bound');
    expect(renderHtml(report, [photo('a', true)])).toContain('lower bound');
  });

  it('escapes recipe text in the HTML page', () => {
    const p = photo('a', true);
    const html = renderHtml(buildReportJson([p], meta), [p]);
    expect(html).toContain('Boil &lt;the&gt; water.');
    expect(html).not.toContain('<the>');
    expect(escapeHtml(`"x" & 'y'`)).toBe('&quot;x&quot; &amp; &#39;y&#39;');
  });

  it('escapes fields that should be numbers but arrive as strings', () => {
    const p = photo('a', true);
    p.truth = { ...truth, servings: '<img src=x onerror=alert(1)>' as unknown as number };
    const html = renderHtml(buildReportJson([p], meta), [p]);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('formats metrics as percentages and missing values as a dash', () => {
    expect(formatMetric('ingredientRecall', 0.5)).toBe('50%');
    expect(formatMetric('stepCer', 0.1234)).toBe('12.3%');
    expect(formatMetric('photos', 3)).toBe('3');
    expect(formatMetric('servings', null)).toBe('—');
  });
});
