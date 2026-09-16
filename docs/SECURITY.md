# AIRMS — security posture, MEASURED

**Last run: 2026-09-13.** Every row below was checked by *running something*
against the code or the live process, not by reading a doc. Where a claim could
only be true or false of a deployed system it says so, and where a check has not
been run against the hosted instance it says that too.

This file is the answer to "is the project up to standard" in the nine specific
places JC asked about. It is deliberately **not** a policy document: it records
what was probed, what came back, and what is still open. Re-run the commands
before quoting any of it — several numbers here date themselves.

---

## 0. The one-line summary

Eight of the nine checks pass. Two real gaps were found and fixed on
2026-09-13 (§1.2 rate limiting on the paid endpoint, §5 email validation). One
item — §3, "row level security" — does not exist as a MySQL feature and is
answered by its application-layer equivalent, which is itself audited. One
hardening item is **open by decision**: the application connects to MySQL as
`root` (§6.2).

| # | Check | Verdict |
|---|---|---|
| 1 | Rate limiting | **Pass**, and widened — the metered vision endpoint had none |
| 2 | API keys / secrets server-side | **Pass** |
| 3 | Row-level security | **N/A for MySQL** — app-layer equivalent, audited |
| 4 | Environment variables not in GitHub | **Pass** — whole history scanned |
| 5 | Validate and sanitise user input | **Was partial** — query params yes, email address no. Fixed |
| 6 | No table defaults to public | **Pass** on grants; `root` connection is open by decision |
| 7 | Authenticated protected routes | **Pass** — 66/66 proven live |
| 8 | Error messages carry no stack trace | **Pass** |
| 9 | Audit logs | **Pass** — 18 write sites, append-only |

---

## 1. Rate limiting

### 1.1 The auth surface — already present, and already debugged in anger

`utils/authThrottle.js`: **30 failures / 15 min / IP** on the *unauthenticated*
half of `/api/auth` only. Database-backed (`utils/rateLimitStore.js`), because
an in-process Map counts per serverless instance and therefore counts almost
nothing.

Three properties are non-obvious and each was a real defect:

- **Authenticated auth routes are exempt.** `DashboardLayout` calls `GET
  /auth/me` on every page mount, so throttling it rationed ordinary navigation —
  measured at `remaining` 29 → 28 → 27 → 26 across four page views, forgiven by
  nothing.
- **A success forgives the failures before it**, awaited *inside* the request.
  `skipSuccessfulRequests` decrements from `res.on('finish')`, which Vercel
  defers until the instance is thawed — so the deployed policy was "30
  **requests**" while the header said "failures" (`SILENT_FAILURES` 3r).
- **`trust proxy` is 1, not `true`.** Without it every hosted request keys into
  one bucket; with `true` a caller can forge `X-Forwarded-For` and skip the
  limiter entirely.

### 1.2 The metered endpoint — GAP FOUND AND FIXED (2026-09-13)

`POST /upload/screening/pdf/preview` renders up to six PDF pages and ships them
to a third-party vision model — ~11,400 tokens per HoloMotion report, measured.

> **Corrected 2026-09-14.** This originally said the endpoint *bills per call*.
> It does not: AIRMS runs on Gemini's FREE tier. A free tier still carries
> per-minute and per-day quotas, so exhausting it produces an **outage** rather
> than an invoice — screening import stops for everybody until the window
> resets. It becomes a money question only if the provider is ever changed,
> which is one env var.

It is the only endpoint in AIRMS that consumes a third-party allowance, and it
had **no cap of any kind** — `express-rate-limit` was mounted on `/api/auth` and
nowhere else.

Not a brute-force hole: the route sits behind `auth` + `rbac('medical','admin')`
+ `requirePermission('uploadData')`. The realistic failures are duller — a stuck
retry in the batch uploader, a backlog-import script run twice, one careless
account emptying the quota and taking the feature down for everybody.

`utils/visionThrottle.js`: **60 / hour, keyed per USER**. Per-user rather than
per-IP is the §48 NAT lesson applied deliberately — ISN's clinicians share one
outbound address, so an IP key would hand the whole institution one budget.
Mounted *after* the permission gate (so an unauthorised caller is refused on
permission, not quota) and *before* multer (so an over-quota caller does not
first cause a 20 MB buffer).

> **Deliberately NOT extended to the other 65 endpoints.** They read and write
> this institution's own database, they are all behind `auth`, and rating them
> would ration a clinician's ordinary work. §48 says so and stands.

**Verify:** `cd backend; npx jest tests/visionThrottle.test.js tests/authThrottle.test.js`
and `npm run verify:claims -- --hosted` (the throttle claims skip locally by
design — loopback is exempt, so a green tick there would mean nothing).

---

## 2. API keys and secrets are server-side

`VISION_API_KEY`, `SMTP_PASS`, `JWT_SECRET` and `MYSQL_PASSWORD` are read in
`backend/src/` only. Measured:

```
grep -rn "VISION_API_KEY|SMTP_PASS|JWT_SECRET|MYSQL_PASSWORD" frontend/src
  -> one hit, in PdfScreeningUpload.tsx, which prints the NAME of the variable
     in operator copy ("Set VISION_API_KEY in the backend environment").
     No value, and nothing read at runtime.
```

The only `NEXT_PUBLIC_*` variable in the project is `NEXT_PUBLIC_API_URL`, which
is a URL and is meant to be public. The browser never holds a provider
credential: the vision call is made by the API, from the server.

**Related, and worth stating because it is the property a marker will ask
about:** the athlete's name is redacted **on-device** before any page image
reaches the vision provider (`utils/redactName.js`). Hosted, this correctly
degrades to "pre-provider redaction" — the browser uploads the un-redacted PDF
to *our* API, so the name still never reaches the third party but does traverse
one more host. That is stated in `DEPLOY.md` rather than glossed.

---

## 3. Row-level security

**MySQL has no row-level security.** RLS is a PostgreSQL feature (and, through
it, what Supabase exposes); MySQL 8.4 offers no equivalent, so there is nothing
to switch on and no policy to write. Saying "we have RLS" here would be false.

What AIRMS has instead is **application-layer scoping**, and the honest framing
is that the *trust boundary is the API process*, not the database. That is a
weaker guarantee than RLS — a SQL-injection hole or a direct database connection
would bypass it entirely — and it is mitigated by three things rather than
asserted:

1. **Sequelize parameterises everything.** There are 11 `sequelize.query()` call
   sites in the whole backend; none interpolates a user value (checked for
   template-literal queries: zero matches). Every other read and write goes
   through the model layer.
2. **The scoping is enforced in the handler and AUDITED by calling it.**
   `npm run audit:access` signs in as each of the four non-admin roles and calls
   all 66 endpoints, then calls all 66 again with **no token**. It fails if a
   read-only role reaches a write, or if any endpoint but the four sign-in
   routes answers anything other than 401 anonymously.
3. **A refusal is itself scoped.** A coach asking for an unknown IC used to get
   404 and a foreign one 403 — which let them tell a real IC from an invented
   one, and an IC encodes date of birth, birth state and sex.
   `notFoundStatusFor(user)` now returns 403 for coach and athlete at all three
   scoped lookups and fails closed on a missing user (§43).

**Reading a record is itself an act and is logged.** `GET /athletes/:id` writes
an `athlete.view` row. That is the justification for leaving medical staff
*unscoped*: clinical cover is not organised by sport, so the answer is
accountability rather than restriction — which only works if the accountability
actually exists (§51).

---

## 4. Environment variables are not in GitHub

```
git ls-files | grep -Ei '(^|/)\.env'
  -> backend/.env.example
     frontend/.env.local.example        (both are placeholder TEMPLATES)
```

`.gitignore` uses `.env*` with an explicit negation for the two committed
templates, in all three of the root, `backend/` and `frontend/` files.

**The whole history was scanned, not just the working tree.** Every blob in
every commit on every ref was searched for real secret shapes
(`sk-…`, `sk-ant-…`, `AIza…`, `ghp_…`, `xox[baprs]-…`, `AKIA…`):

```
git rev-list --all | while read c; do git grep -I -n -E "<patterns>" $c; done
  -> no matches
```

The `.env.example` files contain only placeholders (`JWT_SECRET=change_this_…`,
`SMTP_PASS=<16-character app password>`).

**CI holds no secrets.** `.github/workflows/ci.yml` runs backend jest, frontend
jest, typecheck, lint, `npm run mutate`, and the real-Chrome CSP check. It needs
no database and references no `secrets.*` — every backend suite is DB-free. The
jobs that *would* need a live instance (`audit:access`, `verify:claims`, `e2e`)
are deliberately left out rather than half-wired: a green tick that skipped them
is a worse signal than no tick.

> **Still true and still the operational risk:** the hosted secrets live in
> Vercel's environment, which is write-only from outside. That is why the two
> pending migrations cannot be run from this machine.

---

## 5. Input validation and sanitisation

### 5.1 Query parameters — already handled

`utils/queryParams.js`. `str()` / `num()` / `date()` refuse the array Express
builds from `?p[]=` and the object from `?p[k]=` with a **400**, and
`assertPlainQuery()` checks the KEYS, because the hosted runtime does not parse
the bracket at all — a guard that held locally and not in production reported
success while the filter was silently ignored. `likeTerm()` escapes `%` and `_`,
which had made a search for `%` return the whole roster.

### 5.2 Request bodies — hand-rolled, and adequate

No validation library. Bodies are checked per route with explicit allow-lists
(`INVITABLE_ROLES`), `String()` coercion, and database ENUMs behind them
(`User.role`, `Athlete.gender`, `Athlete.program`, both `Screening` band
columns). `express.json()` rejects a malformed body with a **400** and an
oversized one with **413** — correctly, since 2026-09-13 (§91.1); it used to
report both as 500.

### 5.3 Output escaping — by construction, in three places

React escapes by construction (`dangerouslySetInnerHTML`, `.innerHTML`, `eval`
and `new Function`: **zero occurrences** in `frontend/src`). PDF text goes
through `winAnsiSafe`/`guardText` at the drawing boundary. SQL is parameterised.

### 5.4 GAP FOUND AND FIXED — the email address (2026-09-13)

`users.email` was `VARCHAR(160) NOT NULL UNIQUE` and nothing else; the route
checked only that it was non-empty. Measured against the live model:

```
"not-an-email"     ACCEPTED
"jc@@isn"          ACCEPTED
"a b@c.d"          ACCEPTED
"<script>@x.com"   ACCEPTED
```

This matters more here than it usually would, because of what the field *is*.
§85 shortened the invitation TTL from 7 days to 24 hours on exactly this
argument — the address is "typed by an administrator and validated by nothing,
so a typo puts a credential-establishing code in a stranger's inbox for exactly
as long as the TTL says" — and §88 added a confirm step to the athlete invite
for the same reason. **Both were treating the symptom.** The address itself was
never checked.

`utils/emailAddress.js` now holds one definition, used by the model (as a
backstop, because the routes are not the only writers) and by both invite
routes (for a readable message). It is a **typo catcher, not an authenticity
check** — only a round trip proves an address, and AIRMS's round trip *is* the
activation code. RFC 5322 is deliberately not implemented; the rules are the
pragmatic set, and each exists because it rejects something the model accepted.

Verified live:

```
POST /api/users            "nurin@isn"  -> 400 "That does not look like an email address — check for a typo."
POST /api/athletes/:id/invite  ""       -> 400 "An email address is required to send an invitation."
```

`+` tags are explicitly preserved — stripping them is a common "normalisation"
that would have merged this project's two deliverable demo inboxes into one
account and silently broken the one-email-per-sport demo.

---

## 6. No table defaults to public

### 6.1 Grants — clean

```
anonymous accounts (user = '')          -> (none)
schema-level grants to ''@% or to %     -> (none)
accounts on the server                  -> root@localhost, plus the three
                                           mysql.* internal accounts, all
                                           account_locked = Y
```

All nine tables are InnoDB in the `airms` schema. Nothing is world-readable, and
there is no anonymous login to read it with.

### 6.2 OPEN BY DECISION — the app connects as `root`

`MYSQL_USER=root`. Least privilege says the application should hold a role with
`SELECT, INSERT, UPDATE, DELETE` on `airms.*` and nothing else — in particular
no `DROP`, no `GRANT`, and no reach into other schemas.

Not changed unilaterally, because it alters the developer's local setup and the
seeder legitimately issues DDL (`npm run seed` drops and recreates tables,
`sequelize.sync()` under `SQL_SYNC=1`). The remedy, when JC wants it:

```sql
CREATE USER 'airms_app'@'localhost' IDENTIFIED BY '<strong password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON airms.* TO 'airms_app'@'localhost';
-- deliberately NOT granted: DROP, ALTER, CREATE, GRANT OPTION, or any *.* privilege
FLUSH PRIVILEGES;
```

…then point `MYSQL_USER`/`MYSQL_PASSWORD` at it for `npm run dev`, and keep the
`root` credentials for `npm run seed` and the migration scripts only. The hosted
Aiven database has its own managed account and is a separate change.

**Say this plainly in a viva rather than hiding it:** it is a known deviation
with a written remedy, not an oversight.

---

## 7. Authenticated protected routes

**Proven by calling them, not by reading them.** `cd backend; npm run audit:access`
(needs `npm run dev`), last run 2026-09-13:

```
coverage: every endpoint in the route table is probed.
anonymous: all 66 endpoints probed with no token; every guarded one answered 401.
no read-only role completed a write.
```

The anonymous half was added 2026-09-12 (§84b) and is the more interesting one.
Every other probe sends a token, so the matrix used to print "coverage: every
endpoint is probed" while making **no claim at all** about the anonymous caller
— a route registered without `auth` would have shown up working for all four
roles, exactly as intended, with nothing saying it was also open to the
internet.

Open by design, and derived from the EXEMPT map's own reason rather than listed
twice: the four sign-in routes, `GET /api/health` (liveness, returns an ok flag
and whether the database answered — and logs the driver error rather than
returning it), and `GET /` (a service descriptor, because "Cannot GET /" was
twice mistaken for a broken deployment).

**Static cross-check.** Every route declaration in `src/routes/*.js` carries
`auth`/`rbac` on its own line, except the five in `users.js`, which is mounted
behind a router-level `router.use(auth, rbac('admin'))`.

**Deactivation is immediate.** `middleware/auth.js` re-reads the user row on
every request and rejects an inactive one, so switching an account off ends its
session on the next click rather than at token expiry.

**The client-side gate is not the security boundary and does not pretend to be.**
`DashboardLayout` confirms the session with `/auth/me` on mount for every role —
`localStorage` answers "what does this browser claim?", not "who is this?", and
an expired 7-day token left the shell rendering while every panel 401'd.

---

## 8. Error messages carry no stack trace

`utils/httpError.js` decides once, on **intent** rather than status:

- a **4xx** keeps its message — it is a statement about the request, shaped
  deliberately by whoever threw it;
- an `expose`d error keeps its message — the operator needs "Could not render
  any pages from the PDF";
- **everything else** gets one generic sentence, and the real error plus stack
  goes to stderr as a structured `request.failed` line with the route.

Before this, 49 handlers returned `err.message` on a 500. Measured:

```
?from=not-a-date    -> 500 "Incorrect DATETIME value: 'Invalid date'"
?gender[$ne]=Male   -> 500 "Invalid value { '$ne': 'Male' }"
```

Neither is dangerous alone. Together they confirm the engine, the ORM, and that
a parameter reached a query unvalidated.

**`server.js`'s last-resort handler routes through the same function** (§91.1).
Under Express 5 this is the catch-all for every unhandled async rejection in all
67 routes, not just a body-parser backstop. Its log context is the **router**
(`GET /api/athletes`), never `req.path` — `context` is not in `logger.js`'s
FORBIDDEN_KEY list, so a full path would write an **IC number** into a
third-party log viewer.

**`logger.js` redacts by key and fails closed**: `/(name|athleteid|ic|note|token|password|secret|email|body|score|band)/i`,
plus any value shaped like a credential (`Bearer …`, `eyJ….`), and an
unrecognised object is replaced rather than serialised — so
`logger.error('x', { athlete })` cannot leak a roster row.

---

## 9. Audit logs

`AuditLog` is **append-only**: written by `utils/audit.js` from 18 call sites,
and only ever read back. There is no update or delete path anywhere. The
actor's name and role are **copied onto the row** rather than joined from
`users` — a trail that changes when somebody is renamed or deleted is not a
trail. 962 rows on the local database at time of writing.

Audited actions: `screening.import`, `screening.override`, `screening.reinstate`,
`athlete.injury`, `athlete.view`, `norm.restore`, `norm.pin`, `norm.unpin`,
`norm.member`, `settings.update`, `user.create`, `user.update`, `user.invite`,
`report.download`, `export.backup`, `mail.send`.

Three design properties worth being able to defend:

- **Reads are logged**, because for a read-only role reading is the only
  auditable act. They are counted **apart from** changes in the Staff-activity
  rollup (`ACCESS_ACTIONS`) — summing them would let an account that only reads
  outrank the clinicians.
- **Rows are written where the response commits**, so a 403 or 404 logs nothing.
- **Writes are fire-and-forget**, because logging must never fail the operation
  it describes. The cost is that a lost row is silent. That is the right trade
  for transparency logging and **the wrong one for anything the institution must
  prove** — stated here rather than left to be discovered.

Surfaced at **Admin → Activity Log** (`/admin/audit`, admin + executive) with
filters, a Staff-activity rollup and a PDF export.

---

## What is still open

| Item | Status |
|---|---|
| §6.2 `root` database user | Open by decision — remedy written above, JC's call |
| Hosted migration `migrate:norm-stamp` | **Required before `c3b4842` deploys** — no Aiven credentials on this machine |
| Hosted migration `migrate:drop-redundant-indexes` | Optional; local-only so far |
| Invitations send from a personal Gmail | Intended sender is `injriskdashboard@isn.gov.my` (JC, 2026-09-14). Blocked on ISN SMTP credentials: `SMTP_FROM` alone is rewritten by the provider, so `SMTP_HOST`/`USER`/`PASS` must move with it. `senderIdentity()` flags the mismatch on the admin Settings tile |
| `verify:claims --hosted` | Last run 10/10 on 2026-09-11; re-run after the next deploy |

## How to re-run the whole thing

```powershell
cd backend;  npm run dev                    # needed by the two live audits
cd backend;  npm run audit:access           # §7 — 66 endpoints x 4 roles + anonymous
cd backend;  npm run verify:claims          # operational claims against a running instance
cd backend;  npm run verify:claims -- --hosted   # ...and against the deployment
cd backend;  npx jest                       # includes emailAddress + visionThrottle
cd backend;  npm run mutate                 # every guard here can be made to fail
cd frontend; npm run verify:csp             # real Chrome, production build
cd frontend; npm run e2e                    # 110 checks
```
