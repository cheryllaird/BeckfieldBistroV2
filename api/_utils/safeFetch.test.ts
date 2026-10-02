import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkUrl, isPublicAddress, safeFetchText, UnsafeUrlError } from './safeFetch';

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    'fd00::1',
    'fe80::1',
    '64:ff9b::a9fe:a9fe',
    'not-an-ip',
  ])('rejects %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe('checkUrl', () => {
  it.each([
    'file:///etc/passwd',
    'ftp://example.com/',
    'data:text/html,hi',
    'gopher://example.com/',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'http://[::ffff:7f00:1]/',
    'http://2130706433/', // 127.0.0.1 as a decimal integer
    'http://0x7f.1/', // 127.0.0.1 in hex shorthand
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => checkUrl(url)).toThrow(UnsafeUrlError);
  });

  it.each(['https://www.bbcgoodfood.com/recipes/x', 'http://example.com:80/', 'https://example.com:443/a?b=c'])(
    'accepts %s',
    (url) => {
      expect(checkUrl(url).href).toBeTruthy();
    },
  );
});

describe('safeFetchText', () => {
  let server: http.Server;
  let base: string;
  // The test server is on loopback, which the real policy refuses; this lets
  // only that one address through so the rest of the behaviour can be tested.
  const loopbackOnly = (ip: string) => ip === '127.0.0.1';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      switch (req.url) {
        case '/page':
          res.writeHead(200, { 'content-type': 'text/html' });
          return res.end('<h1>Soup</h1>');
        case '/gzip':
          res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
          return res.end(zlib.gzipSync('<h1>Zipped</h1>'));
        case '/big':
          res.writeHead(200, { 'content-type': 'text/html' });
          return res.end('x'.repeat(5000));
        case '/redirect':
          res.writeHead(302, { location: '/page' });
          return res.end();
        case '/to-metadata':
          res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
          return res.end();
        case '/loop':
          res.writeHead(302, { location: '/loop' });
          return res.end();
        default:
          res.writeHead(404);
          return res.end();
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const fetchLocal = (path: string, extra: Parameters<typeof safeFetchText>[1] = {}) =>
    safeFetchText(`${base}${path}`, { isAllowed: loopbackOnly, ports: [new URL(base).port], ...extra });

  it('refuses the local server under the default policy', async () => {
    await expect(safeFetchText(`${base}/page`)).rejects.toThrow(UnsafeUrlError);
  });

  it('refuses loopback under the default policy', async () => {
    await expect(safeFetchText('http://127.0.0.1/')).rejects.toThrow(UnsafeUrlError);
  });

  it('refuses a hostname that resolves to loopback', async () => {
    await expect(safeFetchText('http://localhost/')).rejects.toThrow(/not allowed/);
  });

  describe('against a local server', () => {
    it('returns the page body and content type', async () => {
      const r = await fetchLocal('/page');
      expect(r.status).toBe(200);
      expect(r.contentType).toBe('text/html');
      expect(r.text).toBe('<h1>Soup</h1>');
    });

    it('decompresses gzip bodies', async () => {
      expect((await fetchLocal('/gzip')).text).toBe('<h1>Zipped</h1>');
    });

    it('follows a safe redirect and reports the final URL', async () => {
      const r = await fetchLocal('/redirect');
      expect(r.text).toBe('<h1>Soup</h1>');
      expect(r.url).toMatch(/\/page$/);
    });

    it('refuses a redirect to a metadata address', async () => {
      await expect(fetchLocal('/to-metadata')).rejects.toThrow(UnsafeUrlError);
    });

    it('stops after too many redirects', async () => {
      await expect(fetchLocal('/loop')).rejects.toThrow(/Too many redirects/);
    });

    it('caps the body size', async () => {
      await expect(fetchLocal('/big', { maxBytes: 1000 })).rejects.toThrow(/too large/);
    });

    it('returns non-2xx statuses without a body', async () => {
      const r = await fetchLocal('/missing');
      expect(r.status).toBe(404);
      expect(r.text).toBe('');
    });
  });
});
