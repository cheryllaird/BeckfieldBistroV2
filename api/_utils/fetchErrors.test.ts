import { describe, it, expect } from 'vitest';
import { classifyFetchError, classifyFetchStatus } from './fetchErrors';
import { UnsafeUrlError } from './safeFetch';

const withCode = (code: string, message = code) => Object.assign(new Error(message), { code });

describe('classifyFetchError', () => {
  it.each([
    ['an aborted request (our timeout)', Object.assign(new Error('The operation was aborted'), { name: 'AbortError', code: 'ABORT_ERR' }), 'blocked', 'urlFetch-timeout'],
    ['a TimeoutError', Object.assign(new Error('timed out'), { name: 'TimeoutError' }), 'blocked', 'urlFetch-timeout'],
    ['ETIMEDOUT', withCode('ETIMEDOUT'), 'blocked', 'urlFetch-timeout'],
    ['a refused connection', withCode('ECONNREFUSED'), 'blocked', 'urlFetch-refused'],
    ['a reset connection', withCode('ECONNRESET'), 'blocked', 'urlFetch-refused'],
    ['a socket hang up', new Error('socket hang up'), 'blocked', 'urlFetch-refused'],
    ['an unsafe address', new UnsafeUrlError('That address is not allowed'), 'bad-url', 'urlFetch-bad-url'],
    ['an unknown host', withCode('ENOTFOUND'), 'bad-url', 'urlFetch-bad-url'],
    ['an invalid URL', withCode('ERR_INVALID_URL'), 'bad-url', 'urlFetch-bad-url'],
    ['anything else', new Error('Response is too large'), 'error', 'urlFetch-error'],
    ['a non-Error value', 'boom', 'error', 'urlFetch-error'],
  ])('classifies %s', (_label, err, kind, reason) => {
    expect(classifyFetchError(err)).toEqual({ kind, reason });
  });
});

describe('classifyFetchStatus', () => {
  it.each([401, 403, 429, 451, 503])('treats HTTP %i as a blocked site', (status) => {
    expect(classifyFetchStatus(status)).toEqual({ kind: 'blocked', reason: `urlFetch-http${status}` });
  });

  it.each([404, 410])('treats HTTP %i as a bad link', (status) => {
    expect(classifyFetchStatus(status)).toEqual({ kind: 'bad-url', reason: `urlFetch-http${status}` });
  });

  it.each([
    [500, 'urlFetch-http5xx'],
    [418, 'urlFetch-http4xx'],
    [302, 'urlFetch-httpother'],
    [999, 'urlFetch-httpother'],
  ])('groups other status %i as a generic failure without naming it', (status, reason) => {
    expect(classifyFetchStatus(status)).toEqual({ kind: 'error', reason });
  });
});
