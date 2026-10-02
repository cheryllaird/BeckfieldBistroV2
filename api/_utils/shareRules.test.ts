import { describe, expect, it } from 'vitest';
import { buildShare, checkShareQuota, MAX_SHARES_PER_DAY, safeImage, safeLink } from './shareRules';

const sender = { uid: 'u1', email: 'cook@example.com', name: 'Cook', avatar: 'https://lh3.example/a.png' };
const now = new Date('2026-10-02T12:00:00Z');

const recipe = {
  title: 'Soup',
  source: 'BBC',
  sourceUrl: 'https://www.bbc.co.uk/food/soup',
  coverImage: 'data:image/png;base64,iVBORw0KGgo=',
  servings: 4,
  prepTime: '10 mins',
  totalTime: '30 mins',
  ingredients: [{ name: 'leek', quantity: 2, unit: '', originalText: '2 leeks' }],
  ingredientSections: [{ title: '', ingredients: [{ name: 'leek', quantity: 2, unit: '', originalText: '2 leeks' }] }],
  steps: ['Chop', 'Simmer'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const build = (body: unknown, from = sender) => buildShare(body, from, now);

describe('buildShare', () => {
  it('builds a share from a valid body', () => {
    const r = build({ toEmail: ' Friend@Example.com ', recipe });
    expect(r).toEqual({
      share: {
        fromUid: 'u1',
        fromName: 'Cook',
        fromAvatar: 'https://lh3.example/a.png',
        toEmail: 'friend@example.com',
        recipe,
        createdAt: now.toISOString(),
      },
    });
  });

  it('takes the sender from the token, never the body', () => {
    const r = build({
      toEmail: 'friend@example.com',
      fromUid: 'someone-else',
      fromName: 'Your Bank',
      fromAvatar: 'https://evil.example/pixel.gif',
      recipe,
    });
    if (!('share' in r)) throw new Error('expected a share');
    expect(r.share.fromUid).toBe('u1');
    expect(r.share.fromName).toBe('Cook');
    expect(r.share.fromAvatar).toBe('https://lh3.example/a.png');
  });

  it('drops fields outside the allow-list', () => {
    const r = build({ toEmail: 'friend@example.com', extra: 1, recipe: { ...recipe, userId: 'x', id: 'y', isAdmin: true } });
    if (!('share' in r)) throw new Error('expected a share');
    expect(r.share).not.toHaveProperty('extra');
    expect(r.share.recipe).not.toHaveProperty('userId');
    expect(r.share.recipe).not.toHaveProperty('id');
    expect(r.share.recipe).not.toHaveProperty('isAdmin');
  });

  it('drops a javascript: source link and non-image data URLs', () => {
    const r = build({
      toEmail: 'friend@example.com',
      recipe: { ...recipe, sourceUrl: 'javascript:alert(1)', coverImage: 'data:text/html,<script>', originalImage: 'javascript:x' },
    });
    if (!('share' in r)) throw new Error('expected a share');
    expect(r.share.recipe.sourceUrl).toBeUndefined();
    expect(r.share.recipe.coverImage).toBeUndefined();
    expect(r.share.recipe.originalImage).toBeUndefined();
  });

  it('rejects a sender without a verified email', () => {
    expect(build({ toEmail: 'friend@example.com', recipe }, { ...sender, email: '' })).toEqual({
      rejection: { status: 403, error: expect.stringMatching(/verify/i) },
    });
  });

  it.each([
    ['no body', null],
    ['a bad email', { toEmail: 'not-an-email', recipe }],
    ['no recipe', { toEmail: 'friend@example.com' }],
    ['an empty title', { toEmail: 'friend@example.com', recipe: { ...recipe, title: '  ' } }],
    ['a non-string title', { toEmail: 'friend@example.com', recipe: { ...recipe, title: { $gt: '' } } }],
    ['steps that are not a list', { toEmail: 'friend@example.com', recipe: { ...recipe, steps: 'x' } }],
    ['too many steps', { toEmail: 'friend@example.com', recipe: { ...recipe, steps: Array(301).fill('x') } }],
    ['an over-long step', { toEmail: 'friend@example.com', recipe: { ...recipe, steps: ['x'.repeat(10_001)] } }],
  ])('rejects %s with a 400', (_label, body) => {
    const r = build(body);
    expect('rejection' in r && r.rejection.status).toBe(400);
  });

  it('coerces non-numeric servings and quantities to 0', () => {
    const r = build({
      toEmail: 'friend@example.com',
      recipe: { ...recipe, servings: '4', ingredients: [{ name: 'x', quantity: NaN }] },
    });
    if (!('share' in r)) throw new Error('expected a share');
    expect(r.share.recipe.servings).toBe(0);
    expect(r.share.recipe.ingredients[0]).toEqual({ name: 'x', quantity: 0, unit: '', originalText: '' });
  });
});

describe('safeLink / safeImage', () => {
  it.each(['https://a.example/x', 'http://a.example'])('keeps link %s', (u) => expect(safeLink(u)).toBe(u));
  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'not a url', 42])('drops link %s', (u) =>
    expect(safeLink(u)).toBeUndefined(),
  );
  it.each(['https://a.example/i.jpg', 'data:image/jpeg;base64,/9j/4AAQ'])('keeps image %s', (u) =>
    expect(safeImage(u)).toBe(u),
  );
  it.each(['data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'javascript:x', 'file:///etc/passwd'])(
    'drops image %s',
    (u) => expect(safeImage(u)).toBeUndefined(),
  );
});

describe('checkShareQuota', () => {
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

  it('allows sending under the daily cap', () => {
    expect(checkShareQuota(Array(MAX_SHARES_PER_DAY - 1).fill(hoursAgo(1)), now)).toBeNull();
  });

  it('rejects once the cap is reached within a day', () => {
    expect(checkShareQuota(Array(MAX_SHARES_PER_DAY).fill(hoursAgo(1)), now)?.status).toBe(429);
  });

  it('ignores shares older than a day', () => {
    expect(checkShareQuota(Array(MAX_SHARES_PER_DAY).fill(hoursAgo(25)), now)).toBeNull();
  });
});
