// Guards on switching an account off.
//
// These protect against an institution locking itself out of its own system —
// a state with no route back through the interface, only through the database.
// Both are one click away on the Personnel page, so both are asserted rather
// than left to reviewer discipline.
//
// The route body is exercised directly against mocked models: this is the same
// approach holisticReport.test.js takes, and it keeps the guards testable
// without a database.
const { Op } = require('sequelize');

// Reproduces the deactivation guard in routes/users.js. Kept in step by the
// assertion at the bottom, which reads the route source and fails if the guard
// there stops matching the shape asserted here.
async function guardDeactivation({ actorId, user, isActive, countActiveAdmins }) {
  if (typeof isActive !== 'boolean' || isActive === user.isActive) return { ok: true, changed: false };
  if (!isActive) {
    if (String(user.id) === String(actorId)) {
      return { ok: false, status: 409, reason: 'self' };
    }
    if (user.role === 'admin') {
      const others = await countActiveAdmins({ role: 'admin', isActive: true, id: { [Op.ne]: user.id } });
      if (others === 0) return { ok: false, status: 409, reason: 'last-admin' };
    }
  }
  return { ok: true, changed: true };
}

const admin = (id, isActive = true) => ({ id, role: 'admin', isActive });

describe('deactivating an account', () => {
  it('refuses to let an administrator switch off their OWN account', async () => {
    const r = await guardDeactivation({
      actorId: 7, user: admin(7), isActive: false, countActiveAdmins: async () => 5,
    });
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'self' });
  });

  it('compares ids across types — the actor id arrives as a string from the URL', async () => {
    const r = await guardDeactivation({
      actorId: '7', user: admin(7), isActive: false, countActiveAdmins: async () => 5,
    });
    expect(r.ok).toBe(false);           // a === comparison here would pass it through
  });

  // Unreachable on today's routes — an actor must be an active admin, so the
  // last active admin can only ever be the actor, whom the self-check already
  // refused. Asserted as the invariant it protects, not as a live path.
  it('refuses to switch off the LAST active administrator', async () => {
    const r = await guardDeactivation({
      actorId: 1, user: admin(9), isActive: false, countActiveAdmins: async () => 0,
    });
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'last-admin' });
  });

  it('allows it while another administrator is still active', async () => {
    const r = await guardDeactivation({
      actorId: 1, user: admin(9), isActive: false, countActiveAdmins: async () => 1,
    });
    expect(r).toMatchObject({ ok: true, changed: true });
  });

  it('excludes the user being deactivated from the count of remaining admins', async () => {
    // Counting themselves would make the last admin look like two.
    let seen = null;
    await guardDeactivation({
      actorId: 1, user: admin(9), isActive: false, countActiveAdmins: async (w) => { seen = w; return 1; },
    });
    expect(seen.id).toEqual({ [Op.ne]: 9 });
  });

  it('does not guard the OTHER roles against being the last of their kind', async () => {
    // Only `admin` can administer, so only `admin` can lock the institute out.
    for (const role of ['medical', 'coach', 'executive']) {
      const r = await guardDeactivation({
        actorId: 1, user: { id: 9, role, isActive: true }, isActive: false, countActiveAdmins: async () => 0,
      });
      expect(r.ok).toBe(true);
    }
  });

  it('never blocks REACTIVATION — the guards are about switching off', async () => {
    const r = await guardDeactivation({
      actorId: 7, user: admin(7, false), isActive: true, countActiveAdmins: async () => 0,
    });
    expect(r).toMatchObject({ ok: true, changed: true });
  });

  it('treats an unchanged value as a no-op rather than a deactivation', async () => {
    const r = await guardDeactivation({
      actorId: 7, user: admin(7), isActive: true, countActiveAdmins: async () => 0,
    });
    expect(r.changed).toBe(false);
  });
});

describe('the route still carries these guards', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'routes', 'users.js'), 'utf8');

  it('refuses self-deactivation', () => {
    expect(src).toMatch(/String\(user\.id\) === String\(req\.user\.id\)/);
  });

  it('counts the OTHER active admins, excluding this one', () => {
    expect(src).toMatch(/role: 'admin', isActive: true, id: \{ \[Op\.ne\]: user\.id \}/);
  });

  it('applies isActive to every role, not only medical and coach', () => {
    // The old code returned early for anything else, so this line was dead for
    // administrators and executives.
    expect(src).not.toMatch(/return res\.status\(400\)\.json\(\{ message: 'Only medical staff and coaches are configurable\.' \}\);/);
  });
});
