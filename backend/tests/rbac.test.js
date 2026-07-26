// Role-based access control middleware — the primary server-side access gate.
const rbac = require('../src/middleware/rbac');

// Minimal Express req/res/next doubles.
function run(mw, user) {
  const req = { user };
  let status = null;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    json(payload) { body = payload; return this; },
  };
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

describe('rbac()', () => {
  test('passes a request whose role is in the allow-list', () => {
    const r = run(rbac('admin'), { role: 'admin' });
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBeNull();
  });

  test('rejects a role not in the allow-list with 403', () => {
    const r = run(rbac('admin'), { role: 'medical' });
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body.message).toMatch(/insufficient role/i);
  });

  test('rejects an unauthenticated request (no req.user)', () => {
    const r = run(rbac('admin'), undefined);
    expect(r.nextCalled).toBe(false);
    expect(r.status).toBe(403);
  });

  test('multiple allowed roles each pass', () => {
    expect(run(rbac('medical', 'admin'), { role: 'medical' }).nextCalled).toBe(true);
    expect(run(rbac('medical', 'admin'), { role: 'admin' }).nextCalled).toBe(true);
    expect(run(rbac('medical', 'admin'), { role: 'coach' }).nextCalled).toBe(false);
  });
});
