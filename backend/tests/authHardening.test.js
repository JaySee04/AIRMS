// Two properties of the auth boundary that are true of the RUNNING process
// rather than of any function, and were both unasserted until 2026-09-12.
//
// Neither was a live hole. Both are the kind of thing that becomes one quietly:
// the first the day somebody changes how the signing key is supplied, the second
// the day somebody deploys without one.
const path = require('path');
const { spawnSync } = require('child_process');
const jwt = require('jsonwebtoken');

const SECRET = 'test-secret-for-auth-hardening';

// The middleware reads the user row on every request. Mocked, because what is
// under test is which tokens get as far as that read.
jest.mock('../src/models', () => ({
  User: { findByPk: jest.fn(async (id) => ({ id, isActive: true, role: 'admin' })) },
}));

const auth = require('../src/middleware/auth');

function callWith(token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  const next = jest.fn();
  return auth(req, res, next).then(() => ({ req, res, next }));
}

describe('the verifier pins its signing algorithm', () => {
  const prev = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; });
  afterAll(() => { process.env.JWT_SECRET = prev; });

  it('names exactly one algorithm, and it is the one tokens are signed with', () => {
    expect(auth.JWT_ALGORITHMS).toEqual(['HS256']);
  });

  it('accepts a token signed the way this API signs them', async () => {
    const token = jwt.sign({ id: 1 }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });
    const { res, next } = await callWith(token);
    expect(res.statusCode).toBeNull();
    expect(next).toHaveBeenCalled();
  });

  // THE POINT OF THE PIN, stated as behaviour rather than as the option string.
  //
  // This same token is accepted by `jwt.verify(token, secret)` with no
  // `algorithms` — a caller who can produce an HS256 token can produce an HS512
  // one, so on its own this proves no exploit. What it proves is that the
  // verifier's accepted set is now DECLARED rather than inherited from the key's
  // type, which is what stops it widening silently if JWT_SECRET ever stops
  // being a string.
  it('refuses a token signed with an algorithm it did not name', async () => {
    const token = jwt.sign({ id: 1 }, SECRET, { algorithm: 'HS512', expiresIn: '1h' });
    const { res, next } = await callWith(token);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('still refuses the ordinary failures — no header, and a forged signature', async () => {
    const forged = jwt.sign({ id: 1 }, 'not-the-secret', { algorithm: 'HS256' });
    expect((await callWith(forged)).res.statusCode).toBe(401);

    const res = {
      statusCode: null, status(c) { this.statusCode = c; return this; }, json() { return this; },
    };
    await auth({ headers: {} }, res, jest.fn());
    expect(res.statusCode).toBe(401);
  });
});

describe('the process refuses to start without a signing secret', () => {
  // Spawned rather than required: the check is at module scope and calls
  // process.exit, which is the behaviour being asserted — a `require` here would
  // take this jest worker down with it.
  //
  // Run from a directory that holds no `.env`, because server.js calls
  // dotenv.config() and dotenv resolves relative to CWD. Running it from
  // backend/ would quietly restore the variable from the developer's own file
  // and this test would assert nothing — which is how the first attempt at it
  // passed while proving the opposite.
  const server = path.join(__dirname, '..', 'src', 'server.js');
  const run = (env) => spawnSync(process.execPath, ['-e', 'require(process.argv[1])', server], {
    env, encoding: 'utf8', timeout: 30000, cwd: __dirname,
  });

  it('exits non-zero and says which variable is missing', () => {
    const env = { ...process.env };
    delete env.JWT_SECRET;
    const r = run(env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/JWT_SECRET is not set/);
  });

  it('gets past that check when the secret IS set', () => {
    // The floor: without this, a server.js that exited 1 for some UNRELATED
    // reason would make the test above pass for the wrong reason. It is not
    // asserted to reach `listen` — there is no database here — only that it
    // does not die on the secret.
    const r = run({ ...process.env, JWT_SECRET: SECRET });
    expect(r.stderr || '').not.toMatch(/JWT_SECRET is not set/);
  });
});
