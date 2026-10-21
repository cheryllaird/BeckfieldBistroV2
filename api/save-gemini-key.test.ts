import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const getUser = vi.fn();
vi.mock('./_utils/auth.js', () => ({ getUser: (req: VercelRequest) => getUser(req) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ set: vi.fn() }) }) }) }),
  }),
  FieldValue: { delete: () => 'DELETE' },
}));

import handler from './save-gemini-key';

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function call(headers: Record<string, string>) {
  const res = makeRes();
  const req = { method: 'POST', headers, body: {} } as unknown as VercelRequest;
  return handler(req, res as unknown as VercelResponse).then(() => res);
}

describe('save-gemini-key auth', () => {
  beforeEach(() => getUser.mockReset());

  it('401s when the bearer token is missing', async () => {
    const res = await call({});
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing authorization token' });
    expect(getUser).not.toHaveBeenCalled();
  });

  it('401s when getUser rejects the token', async () => {
    getUser.mockResolvedValue(null);
    const res = await call({ authorization: 'Bearer bad' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('authenticates through getUser and clears the key for the user', async () => {
    getUser.mockResolvedValue({ uid: 'u1', email: '', name: 'x' });
    const res = await call({ authorization: 'Bearer good' });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ hasKey: false });
  });
});
