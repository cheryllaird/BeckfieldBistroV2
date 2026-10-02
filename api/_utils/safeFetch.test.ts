import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isPublicAddress, readTextCapped, safeFetch, UnsafeUrlError } from './safeFetch';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1',
    'not-an-ip',
  ])('rejects %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '151.101.1.69', '2606:4700::6810:84e5', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('assertPublicUrl', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]:8080/',
    'http://localhost/',
    'not a url',
  ])('rejects %s', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it('accepts a public IP literal', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/recipe')).resolves.toBeInstanceOf(URL);
  });
});

describe('safeFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a redirect to a private address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(safeFetch('https://8.8.8.8/')).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to another public address', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://1.1.1.1/r' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const resp = await safeFetch('https://8.8.8.8/');
    expect(await resp.text()).toBe('ok');
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://1.1.1.1/r');
  });
});

describe('readTextCapped', () => {
  it('returns the body under the cap', async () => {
    expect(await readTextCapped(new Response('hello'), 10)).toBe('hello');
  });

  it('fails once the body passes the cap', async () => {
    await expect(readTextCapped(new Response('x'.repeat(11)), 10)).rejects.toThrow('too large');
  });
});
