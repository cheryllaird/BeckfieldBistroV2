import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const getUser = vi.fn();
const set = vi.fn();
const doc = vi.fn((id: string) => ({ set: (data: unknown, opts: unknown) => set(id, data, opts) }));
vi.mock('./_utils/auth.js', () => ({ getUser: (req: VercelRequest) => getUser(req) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: (name: string) => (name === 'analytics' ? { doc } : null) }),
  FieldValue: { increment: (n: number) => `INC(${n})`, serverTimestamp: () => 'NOW' },
}));

import handler from './track';

const UID = 'uid-secret-123';

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
}

function call(method: string, body: unknown, uid: string | null = UID) {
  getUser.mockResolvedValue(uid ? { uid, email: 'cook@example.com', name: 'Cook' } : null);
  const res = makeRes();
  const req = { method, headers: { authorization: 'Bearer tok' }, body } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  getUser.mockReset();
  set.mockReset();
  doc.mockClear();
  logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')];
  logs.forEach((l) => l.mockImplementation(() => {}));
});

afterEach(() => {
  // The uid must never be logged, whatever happened.
  for (const l of logs) expect(JSON.stringify(l.mock.calls)).not.toContain(UID);
  logs.forEach((l) => l.mockRestore());
});

describe('POST /api/track', () => {
  it.each(['GET', 'PUT', 'DELETE'])('405s for %s without checking auth', async (method) => {
    const res = await call(method, { event: 'display_mode', value: 'browser' });
    expect(res.status).toHaveBeenCalledWith(405);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('401s when getUser rejects the token', async () => {
    const res = await call('POST', { event: 'display_mode', value: 'browser' }, null);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(set).not.toHaveBeenCalled();
  });

  it('400s for an unknown event or key, writing nothing', async () => {
    for (const body of [
      { event: 'page_view', value: 'x' },
      { event: '__proto__', value: 'url' },
      { event: 'import_started', value: 'a.b' },
      { event: 'display_mode', value: 'browser', uid: UID },
    ]) {
      const res = await call('POST', body);
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(set).not.toHaveBeenCalled();
  });

  it('adds one to the lifetime and daily counters, storing no uid', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T09:00:00Z'), toFake: ['Date'] });
    const res = await call('POST', { event: 'import_started', value: 'photo' });
    vi.useRealTimers();

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith(
      'usage',
      { counts: { import_started: { photo: 'INC(1)' } }, total: 'INC(1)', updatedAt: 'NOW' },
      { merge: true },
    );
    expect(set).toHaveBeenCalledWith(
      'usage-2026-11-11',
      { counts: { import_started: { photo: 'INC(1)' } }, total: 'INC(1)', date: '2026-11-11' },
      { merge: true },
    );
    expect(JSON.stringify(set.mock.calls)).not.toContain(UID);
  });

  it('still answers 204 when the write fails', async () => {
    set.mockRejectedValue(new Error('unavailable'));
    const res = await call('POST', { event: 'pantry_skip', value: '2-3' });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('quietly drops events over the per-instance limit', async () => {
    const other = 'another-user';
    for (let i = 0; i < 30; i++) await call('POST', { event: 'display_mode', value: 'standalone' }, other);
    expect(set).toHaveBeenCalledTimes(60);
    const res = await call('POST', { event: 'display_mode', value: 'standalone' }, other);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(set).toHaveBeenCalledTimes(60);
  });
});
