import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getIdToken = vi.fn();
vi.mock('./firebase', () => ({ auth: { currentUser: { getIdToken: (f?: boolean) => getIdToken(f) } } }));

import { extractRecipeFromImage, extractRecipeFromText, extractRecipeFromUrl, CONNECTION_LOST_MESSAGE, RecipeExtractionError } from './recipeExtraction';

beforeEach(() => {
  getIdToken.mockReset().mockResolvedValue('tok');
  // resizeImage needs a real canvas; the image path is exercised with a stub.
  vi.stubGlobal(
    'Image',
    class {
      width = 10;
      height = 10;
      onload: () => void = () => undefined;
      set src(_: string) {
        queueMicrotask(() => this.onload());
      }
    },
  );
  vi.spyOn(document, 'createElement').mockImplementation(
    () => ({ width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }), toDataURL: () => 'data:image/jpeg;base64,AAAA' }) as unknown as HTMLCanvasElement,
  );
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('connection drops during extraction', () => {
  it('URL: a rejected fetch says the connection was lost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(extractRecipeFromUrl('https://example.com/r', true)).rejects.toMatchObject({
      name: 'RecipeExtractionError',
      message: CONNECTION_LOST_MESSAGE,
    });
  });

  it('photo: a rejected fetch says the connection was lost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));
    await expect(extractRecipeFromImage('data:image/jpeg;base64,AAAA', true)).rejects.toMatchObject({
      message: CONNECTION_LOST_MESSAGE,
    });
  });

  it('a body that fails mid-read says the connection was lost', async () => {
    const res = { ok: true, json: () => Promise.reject(new TypeError('network error')) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res));
    await expect(extractRecipeFromUrl('https://example.com/r', true)).rejects.toThrow(CONNECTION_LOST_MESSAGE);
  });

  it('server errors still show the server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Nope' }), { status: 422 })));
    const err = await extractRecipeFromUrl('https://example.com/r', true).catch((e) => e);
    expect(err).toBeInstanceOf(RecipeExtractionError);
    expect(err.message).toBe('Nope');
  });
});

describe('extractRecipeFromImage stages', () => {
  it('reports preparing then reading, with reading before the request is sent', async () => {
    const events: string[] = [];
    const fetchMock = vi.fn().mockImplementation(async () => {
      events.push('fetch');
      return new Response(JSON.stringify({ recipe: { title: 'T' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await extractRecipeFromImage('data:image/jpeg;base64,AAAA', true, (s) => events.push(s)).catch(() => undefined);
    expect(events.slice(0, 3)).toEqual(['preparing', 'reading', 'fetch']);
  });

  it('works without a stage callback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Load failed')));
    await expect(extractRecipeFromImage('data:image/jpeg;base64,AAAA', true)).rejects.toMatchObject({
      message: CONNECTION_LOST_MESSAGE,
    });
  });
});

describe('extractRecipeFromText', () => {
  const okResponse = () => new Response(JSON.stringify({ title: 'Soup', extractionMethod: 'text+gemini' }), { status: 200 });

  it('posts the text and the optional link to the extraction API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const recipe = await extractRecipeFromText('2 leeks\nBoil', true, 'https://recipes.example.com/soup');

    expect(recipe.extractionMethod).toBe('text+gemini');
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/extract-recipe');
    expect(JSON.parse(String(init.body))).toEqual({ text: '2 leeks\nBoil', sourceUrl: 'https://recipes.example.com/soup' });
  });

  it('leaves the link out when none is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await extractRecipeFromText('2 leeks\nBoil', true);

    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ text: '2 leeks\nBoil' });
  });

  it('says the connection was lost when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(extractRecipeFromText('2 leeks', true)).rejects.toThrow(CONNECTION_LOST_MESSAGE);
  });

  it('asks for an API key before calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(extractRecipeFromText('2 leeks', false)).rejects.toBeInstanceOf(RecipeExtractionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
