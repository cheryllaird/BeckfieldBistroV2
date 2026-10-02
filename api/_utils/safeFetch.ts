import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';

// Fetches a user-supplied URL without letting it reach anything but the public
// internet. The recipe importer fetches whatever URL a signed-in user gives it
// and hands the page back to them, so an unguarded fetch would let anyone read
// internal services (cloud metadata, localhost, private networks) through it.
//
// The check runs inside the socket's DNS lookup, so the address that gets
// connected to is the one that was checked — a hostname can't pass validation
// and then re-resolve to a private address (DNS rebinding). Redirects are
// followed by hand so every hop is checked the same way.

export class UnsafeUrlError extends Error {}

// Separate lists: a BlockList checks IPv4 addresses against IPv4-mapped IPv6
// subnets too, so ::ffff:0:0/96 in a shared list would block every IPv4 address.
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
] as const) {
  blocked4.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped — would smuggle any IPv4 address
  ['64:ff9b::', 96], // NAT64 — likewise
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4 — embeds an IPv4 address
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked6.addSubnet(net, prefix, 'ipv6');
}

/** True for an IP address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  return family === 4 ? !blocked4.check(ip, 'ipv4') : !blocked6.check(ip, 'ipv6');
}

const WEB_PORTS = ['80', '443'] as const;

/** Parses and checks a URL's shape; throws UnsafeUrlError when it can't be fetched. */
export function checkUrl(
  raw: string,
  isAllowed: (ip: string) => boolean = isPublicAddress,
  ports: readonly string[] = WEB_PORTS,
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Only http and https URLs are allowed');
  }
  if (url.username || url.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  if (url.port && !ports.includes(url.port)) {
    throw new UnsafeUrlError('Only the standard web ports are allowed');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new UnsafeUrlError('Invalid URL');
  if (isIP(host) && !isAllowed(host)) throw new UnsafeUrlError('That address is not allowed');
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

function guardedLookup(isAllowed: (ip: string) => boolean) {
  return (hostname: string, options: { all?: boolean }, callback: LookupCallback) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, '');
      if (!addresses.length || addresses.some((a) => !isAllowed(a.address))) {
        return callback(new UnsafeUrlError(`${hostname} resolves to an address that is not allowed`), '');
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Address and port policy; tests override them to reach a local server. */
  isAllowed?: (ip: string) => boolean;
  ports?: readonly string[];
}

export interface SafeFetchResult {
  status: number;
  contentType: string;
  text: string;
  /** The URL after redirects. */
  url: string;
}

function request(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  isAllowed: (ip: string) => boolean,
): Promise<http.IncomingMessage> {
  const mod = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(url, { headers, signal, lookup: guardedLookup(isAllowed) as never }, resolve);
    req.on('error', reject);
  });
}

function decode(res: http.IncomingMessage): Readable {
  switch ((res.headers['content-encoding'] ?? '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return res.pipe(zlib.createGunzip());
    case 'deflate':
      return res.pipe(zlib.createInflate());
    case 'br':
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}

/** Reads the (decompressed) body, failing once it passes maxBytes. */
async function readCapped(res: http.IncomingMessage, maxBytes: number): Promise<string> {
  const declared = Number(res.headers['content-length']);
  if (declared > maxBytes) {
    res.destroy();
    throw new Error('Response is too large');
  }
  const chunks: Buffer[] = [];
  let total = 0;
  const body = decode(res);
  try {
    for await (const chunk of body) {
      total += (chunk as Buffer).length;
      if (total > maxBytes) throw new Error('Response is too large');
      chunks.push(chunk as Buffer);
    }
  } finally {
    res.destroy();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function safeFetchText(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    timeoutMs = 5000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 5,
    headers = {},
    isAllowed = isPublicAddress,
    ports = WEB_PORTS,
  } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  const reqHeaders = { 'accept-encoding': 'gzip, deflate, br', ...headers };

  let url = checkUrl(raw, isAllowed, ports);
  for (let hop = 0; ; hop++) {
    const res = await request(url, reqHeaders, signal, isAllowed);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (status >= 300 && status < 400 && location) {
      res.destroy();
      if (hop >= maxRedirects) throw new Error('Too many redirects');
      url = checkUrl(new URL(location, url).href, isAllowed, ports);
      continue;
    }
    const contentType = String(res.headers['content-type'] ?? '');
    if (status < 200 || status >= 300) {
      res.destroy();
      return { status, contentType, text: '', url: url.href };
    }
    return { status, contentType, text: await readCapped(res, maxBytes), url: url.href };
  }
}
