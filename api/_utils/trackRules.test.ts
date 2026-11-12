import { describe, it, expect } from 'vitest';
import { createRateLimiter, parseTrack, TRACK_EVENTS } from './trackRules';

describe('parseTrack', () => {
  it('accepts every allow-listed event and value', () => {
    for (const [event, values] of Object.entries(TRACK_EVENTS)) {
      for (const value of values) expect(parseTrack({ event, value })).toEqual({ event, value });
    }
  });

  it('rejects unknown events and values', () => {
    expect(parseTrack({ event: 'page_view', value: 'url' })).toBeNull();
    expect(parseTrack({ event: 'import_started', value: 'email' })).toBeNull();
    expect(parseTrack({ event: 'pantry_skip', value: '12' })).toBeNull();
    // A value allowed for another event isn't allowed here.
    expect(parseTrack({ event: 'display_mode', value: 'url' })).toBeNull();
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'counts.total', 'a/b', 'import_started.url', '../usage', ''])(
    'rejects %j as an event or a value',
    (bad) => {
      expect(parseTrack({ event: bad, value: 'url' })).toBeNull();
      expect(parseTrack({ event: 'import_started', value: bad })).toBeNull();
    },
  );

  it('rejects a JSON-parsed __proto__ key and any other extra key', () => {
    expect(parseTrack(JSON.parse('{"event":"display_mode","value":"browser","__proto__":{"x":1}}'))).toBeNull();
    expect(parseTrack({ event: 'display_mode', value: 'browser', uid: 'u1' })).toBeNull();
    expect(parseTrack({ event: 'display_mode', value: 'browser', bistroId: 'b1' })).toBeNull();
    expect(parseTrack({ event: 'display_mode' })).toBeNull();
  });

  it('rejects non-object bodies and non-string fields', () => {
    for (const body of [undefined, null, 'display_mode', 1, [], ['display_mode', 'browser']]) {
      expect(parseTrack(body)).toBeNull();
    }
    expect(parseTrack({ event: 'pantry_skip', value: 1 })).toBeNull();
    expect(parseTrack({ event: ['display_mode'], value: 'browser' })).toBeNull();
  });

  it('returns the allow-list’s own strings', () => {
    const parsed = parseTrack({ event: 'pantry_skip', value: '7+' });
    expect(parsed?.event).toBe('pantry_skip');
    expect(TRACK_EVENTS.pantry_skip).toContain(parsed?.value);
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit per key within the window, then resets', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });
});
