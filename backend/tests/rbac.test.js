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

// The executive role is READ-ONLY oversight. These assertions are the guard
// rail: it is easy to add it to a route list by reflex, and the whole point of
// the role is the endpoints it is absent from.
describe('rbac — executive is read-only', () => {
  const run = (mw, role) => {
    const req = { user: { role } };
    let denied = false;
    const res = { status: () => ({ json: () => { denied = true; } }) };
    mw(req, res, () => {});
    return !denied;
  };

  it('reaches the admin analytics and the reports', () => {
    expect(run(rbac('admin', 'executive'), 'executive')).toBe(true);
    expect(run(rbac('medical', 'admin', 'coach', 'executive'), 'executive')).toBe(true);
  });

  it('is refused everything that writes', () => {
    // Personnel, settings, norm restore/delete, athlete create/delete, backup
    // export and the import routes all guard on 'admin' (or medical) alone.
    expect(run(rbac('admin'), 'executive')).toBe(false);
    expect(run(rbac('admin', 'medical'), 'executive')).toBe(false);
    expect(run(rbac('medical', 'admin'), 'executive')).toBe(false);
  });

  it('is not a super-admin — it cannot stand in for an admin anywhere', () => {
    // Guards against someone "fixing" a 403 by widening rbac('admin') instead
    // of deciding whether the executive should really have that power.
    expect(run(rbac('admin'), 'executive')).toBe(false);
  });
});
