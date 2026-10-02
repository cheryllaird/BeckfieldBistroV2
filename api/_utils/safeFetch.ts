import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

// Fetching a user-supplied URL from the server would otherwise let anyone with
// an account make this function request internal addresses (cloud metadata,
// localhost services) and read the response back through the extracted recipe.
// Only public http(s) hosts are allowed, every redirect hop is re-checked, and
// the body is capped so a huge page can't exhaust the function's memory.

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(net, prefix, 'ipv6');

export const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

export class UnsafeUrlError extends Error {}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) {
    // IPv4-mapped (::ffff:a.b.c.d) is judged by the IPv4 address it carries.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1], 'ipv4');
    return !blocked.check(address, 'ipv6');
  }
  return false;
}

/** Throws UnsafeUrlError unless `raw` is an http(s) URL whose host resolves only to public addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new UnsafeUrlError('URL does not point to a public website');
  }
  return url;
}

/** fetch() for user-supplied URLs: public hosts only, redirects re-checked hop by hop. */
export async function safeFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const resp = await fetch(url, { ...init, redirect: 'manual' });
    const location = resp.headers.get('location');
    if (resp.status >= 300 && resp.status < 400 && location) {
      current = new URL(location, url).href;
      continue;
    }
    return resp;
  }
  throw new UnsafeUrlError('Too many redirects');
}

/** Reads a response body as text, failing once it passes `maxBytes`. */
export async function readTextCapped(resp: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(resp.headers.get('content-length'));
  if (declared > maxBytes) throw new Error('Page is too large');
  if (!resp.body) return '';
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Page is too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
