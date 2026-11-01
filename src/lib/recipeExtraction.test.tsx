import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getIdToken = vi.fn();
vi.mock('./firebase', () => ({ auth: { currentUser: { getIdToken: (f?: boolean) => getIdToken(f) } } }));

import { extractRecipeFromImage, extractRecipeFromUrl, CONNECTION_LOST_MESSAGE, RecipeExtractionError } from './recipeExtraction';

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
