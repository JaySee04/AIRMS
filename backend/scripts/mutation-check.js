// Standing mutation check: break each guard on purpose, prove its test fails.
//
// WHY (2026-09-10). Four defects in this project have now had the same shape —
// a check and its own test agreeing with each other while both were wrong
// (SILENT_FAILURES 3l, 3n, 3o, 3p). The most recent: a port preflight that
// probed by BINDING loopback, and a test that held the port on loopback, so the
// pair was self-consistent and could not detect a real `next dev` on 0.0.0.0.
//
// The repo's stated remedy has always been right — "mutate the thing it guards
// and confirm it fails" — and has always been MANUAL. Every instance was caught
// because somebody remembered to do it by hand, which means the day nobody
// remembers is the day a guard ships inert. `winAnsiSafe` is what that looks
// like: defined, exported, unit-tested, never called, PDFs printing mojibake.
//
// So this runs it. Each entry names a guard, a mutation that must break it, and
// the test that must notice. A mutation that survives is a FAILURE — the test
// is not testing what it claims.
//
//   cd backend; npm run mutate
//
// Deliberately NOT part of `npx jest`: it spawns a jest run per mutation and
// takes tens of seconds. It is a gate before a commit that touches a guard, not
// a thing to pay for on every save.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

// find/replace must be UNIQUE in the file. `applyMutation` refuses otherwise,
// because a mutation that lands in two places is not the mutation described.
const MUTATIONS = [
  {
    guard: 'preflight-ports: probes by CONNECTING, not by binding',
    why: 'SILENT_FAILURES 3p — binding loopback cannot see a next dev on 0.0.0.0',
    pkg: 'backend',
    file: 'scripts/preflight-ports.js',
    from: ROOT,
    find: "    sock.connect(port, '127.0.0.1');",
    replace: "    sock.destroy(); resolve(false); return;",
    test: 'tests/preflightPorts.test.js',
  },
  {
    guard: 'logger: redacts forbidden KEYS',
    why: 'an athlete name in a platform log viewer is a disclosure',
    pkg: 'backend',
    file: 'src/utils/logger.js',
    find: "    if (FORBIDDEN_KEY.test(k)) { out[k] = '[redacted]'; continue; }",
    replace: '    if (false) { out[k] = null; continue; }',
    test: 'tests/logger.test.js',
  },
  {
    guard: 'logger: refuses to serialise a whole object',
    why: "logger.error('x', { athlete }) must not leak a roster row",
    pkg: 'backend',
    file: 'src/utils/logger.js',
    find: "      out[k] = `[${Array.isArray(v) ? 'array' : typeof v}]`;",
    replace: '      out[k] = JSON.stringify(v);',
    test: 'tests/logger.test.js',
  },
  {
    guard: 'rate-limit store: actually counts',
    why: 'a store that never counts leaves every doc claiming a limit nothing enforces',
    pkg: 'backend',
    file: 'src/utils/rateLimitStore.js',
    find: '    const hits = fresh ? 1 : Number(row.hits || 0) + 1;',
    replace: '    const hits = 1;',
    test: 'tests/rateLimitStore.test.js',
  },
  {
    guard: 'indicator payload: roster query omits summaryText',
    why: 'a TEXT column per athlete on the roster is a silent payload regression',
    pkg: 'backend',
    file: 'src/utils/indicatorPayload.js',
    find: '    ...(s.summaryText === undefined ? {} : { summaryText: s.summaryText || null }),',
    replace: '    summaryText: s.summaryText || null,',
    test: 'tests/reportSummaryPayload.test.js',
  },
  {
    guard: 'audit: a failed write is counted, not swallowed',
    why: 'athlete.view logging justifies leaving medical staff unscoped (§51)',
    pkg: 'backend',
    file: 'src/utils/audit.js',
    find: '    noteFailure(action, e);',
    replace: '    void e;',
    test: 'tests/auditHealth.test.js',
  },
  {
    guard: 'ScreeningPanel: resolves fields from .screening',
    why: 'SILENT_FAILURES 3n — three cards drew nothing for weeks',
    pkg: 'frontend',
    file: 'src/components/dashboard/ScreeningPanel.tsx',
    find: '  const summaryText = athlete.summaryText ?? athlete.screening?.summaryText ?? null;',
    replace: '  const summaryText = athlete.summaryText ?? null;',
    test: 'src/components/dashboard/ScreeningPanel.test.tsx',
  },
  // ── The six I claimed were safe BY READING THEM (2026-09-10) ─────────────
  //
  // SILENT_FAILURES 4e argued that these six already had a "bracketing positive"
  // — a negative assertion sandwiched between assertions that the scan found its
  // subject. That argument was made by eye, which is the one form of evidence
  // this project has repeatedly shown to be worthless. So each is registered
  // here and the claim is now checked rather than asserted.
  //
  // Note these mutate the GUARDED PROPERTY, not the guard: they make the real
  // defect the test exists to catch, which is a stronger check than breaking
  // the detector.
  {
    guard: 'athleteDisclosure: executive stays off the raw record endpoint',
    why: '§51 — executive is funnelled through the AUDITED individual PDF instead',
    pkg: 'backend',
    file: 'src/routes/athletes.js',
    find: "router.get('/:id', auth, rbac('athlete', 'medical', 'admin', 'coach')",
    replace: "router.get('/:id', auth, rbac('athlete', 'medical', 'admin', 'coach', 'executive')",
    test: 'tests/athleteDisclosure.test.js',
  },
  {
    guard: 'riskIndicators: LDH is excluded from every derived view',
    why: "Dr Thung's instruction — ISN cannot support the assessment, so it is never shown",
    pkg: 'backend',
    file: 'src/shared/facts.js',
    find: "const EXCLUDED_RISK_KEYS = ['spinalDiscHerniation'];",
    replace: 'const EXCLUDED_RISK_KEYS = [];',
    test: 'tests/riskIndicators.test.js',
  },
  {
    // The SAME clinical rule, in the other package, because the frontend is
    // what actually renders an indicator onto a clinician's screen. The two
    // copies are generated from shared/facts.js, so a bad edit to
    // shared/generate.js can drop the exclusion in ONE package while the other
    // stays correct and green — which is the §60 failure that already happened
    // once, in the direction where both suites passed with the value missing.
    // Mutating only the backend copy proved only the backend half.
    // REGISTERED AGAINST THE WRONG TEST FIRST, and duly reported SURVIVED.
    // screeningAlerts.indicators.test.ts pins LDH by the literal string, so it
    // is blind to this constant emptying — correctly, because EXCLUDED_RISK_KEYS
    // is an ASSERTION ANCHOR and not a filter: LDH is excluded by being absent
    // from RISK_INDICATORS, and no production code in either package filters on
    // this list. Emptying it removes the ability to state the rule, which is a
    // real loss and a different one from rendering LDH. The test that actually
    // reads it by value is the badge suite. See SILENT_FAILURES 3u.
    guard: 'LDH exclusion stays STATEABLE on the frontend (Dr Thung)',
    why: 'named as a value so the rule can be asserted rather than left as an absence',
    pkg: 'frontend',
    file: 'src/lib/shared/facts.ts',
    find: "export const EXCLUDED_RISK_KEYS: string[] = ['spinalDiscHerniation'];",
    replace: 'export const EXCLUDED_RISK_KEYS: string[] = [];',
    test: 'src/components/dashboard/OverallRiskBadge.test.tsx',
  },
  {
    // The mutation that asks the question that actually matters on the frontend:
    // if LDH were put BACK into the indicator list, would anything stop it
    // reaching a clinician's screen? Every frontend view (INDICATORS,
    // RADAR_AXES, REPORT_RISKS, RADAR_LABELS) derives from this one array.
    guard: 'LDH cannot re-enter the frontend indicator list',
    why: "Dr Thung's instruction — ISN cannot support the assessment, so it is never drawn",
    pkg: 'frontend',
    file: 'src/lib/shared/facts.ts',
    find: "export const RISK_INDICATORS: RiskIndicator[] = [\n  { key: 'neckInjuryRisk', region: 'Neck', reportLabel: 'Neck Pain' },",
    replace: "export const RISK_INDICATORS: RiskIndicator[] = [\n  { key: 'spinalDiscHerniation', region: 'Spine', reportLabel: 'Disc Herniation' },\n  { key: 'neckInjuryRisk', region: 'Neck', reportLabel: 'Neck Pain' },",
    test: 'src/lib/screeningAlerts.indicators.test.ts',
  },
  {
    guard: 'accountLifecycle: athlete is not an invitable role',
    why: 'an athlete account also needs a roster record to attach to',
    pkg: 'backend',
    file: 'src/routes/users.js',
    find: "const INVITABLE_ROLES = ['medical', 'coach', 'admin', 'executive'];",
    replace: "const INVITABLE_ROLES = ['medical', 'coach', 'admin', 'executive', 'athlete'];",
    test: 'tests/accountLifecycle.test.js',
  },
  {
    guard: 'accountLifecycle: athletes ARE invitable from the roster',
    why: 'the exclusion above is only defensible because this route exists — '
       + 'without it, "not invitable here" silently means "can never sign in"',
    pkg: 'backend',
    file: 'src/routes/athletes.js',
    find: "router.post('/:id/invite', auth, rbac('admin'), async (req, res) => {",
    replace: "router.post('/:id/invite-disabled', auth, rbac('admin'), async (req, res) => {",
    test: 'tests/accountLifecycle.test.js',
  },
  {
    guard: 'invite: the athlete account is BOUND to its roster row',
    why: 'an account with a null athleteId authenticates and is then refused '
       + 'from its own record — a working login onto a dashboard that resolves nothing',
    pkg: 'backend',
    file: 'src/routes/athletes.js',
    find: '      athleteId: athlete.athleteId,\n    });\n\n    try {\n      await sendInvite(user, req, { creating: true });',
    replace: '      athleteId: null,\n    });\n\n    try {\n      await sendInvite(user, req, { creating: true });',
    test: 'tests/accountLifecycle.test.js',
  },
  {
    guard: 'cohorts: SMALL_COHORT comes from shared facts, not a local copy',
    why: 'a fifth private copy is how the band vocabulary drifted four ways',
    // Registered against the wrong test on the first attempt (the frontend
    // facts suite, which does not look at this file) and duly reported
    // SURVIVED. That is the runner doing its job on its own registry — a
    // misregistered guard is indistinguishable from an absent one, and this is
    // the failure mode the registry was always most likely to have.
    pkg: 'backend',
    from: ROOT,
    file: 'frontend/src/components/dashboard/OverallRiskBadge.tsx',
    find: "import { SMALL_COHORT } from '@/lib/shared/facts';",
    replace: 'const SMALL_COHORT = 10;',
    test: 'tests/cohorts.test.js',
  },
  {
    guard: 'report summary: refuses a split that loses text',
    why: "a rearranged version of a clinician's report is worse than a paragraph",
    pkg: 'frontend',
    file: 'src/lib/reportSummary.ts',
    find: '  if (normalise(rebuilt) !== normalise(text)) return [];',
    replace: '  if (false) return [];',
    test: 'src/lib/reportSummary.test.ts',
  },
  {
    guard: 'worklist: never-screened ranks ABOVE green',
    why: 'an athlete nobody assessed is unknown, not low risk (§33)',
    pkg: 'backend',
    file: 'src/utils/decisionSupport.js',
    find: '  never: 2, // unknown, NOT low risk — deliberately above green',
    replace: '  never: 4,',
    test: 'tests/decisionSupport.test.js',
  },
  {
    guard: 'decisions: a future "since" falls back to the window',
    why: 'a wrong clock would otherwise report "nothing moved" over a red athlete',
    pkg: 'backend',
    file: 'src/utils/decisionSupport.js',
    find: '  if (!Number.isFinite(asked) || asked > now) {',
    replace: '  if (!Number.isFinite(asked)) {',
    test: 'tests/decisionSupport.test.js',
  },
  {
    guard: 'decisions: a stale "since" is clamped to 90 days',
    why: 'an untouched browser store must not turn one request into a full-history scan',
    pkg: 'backend',
    file: 'src/utils/decisionSupport.js',
    find: "  if (asked < floor) return { cutoff: floor, basis: 'clamped' };",
    replace: "  if (false) return { cutoff: floor, basis: 'clamped' };",
    test: 'tests/decisionSupport.test.js',
  },
  {
    guard: 'DecisionPanel: the heading reports the SERVER\'s basis',
    why: '"since you last looked" over a 7-day window turns "not shown" into "nothing happened"',
    pkg: 'frontend',
    file: 'src/components/dashboard/DecisionPanel.tsx',
    find: "            {data.changesBasis === 'since' ? 'Moved since you last looked'",
    replace: "            {true ? 'Moved since you last looked'",
    test: 'src/components/dashboard/DecisionPanel.test.tsx',
  },
  {
    guard: 'DecisionPanel: the "seen" marker is keyed per user',
    why: 'a shared clinic terminal would hand one reader\'s "seen" to the next',
    pkg: 'frontend',
    file: 'src/components/dashboard/DecisionPanel.tsx',
    find: '  return id ? `${SEEN_KEY_PREFIX}${id}` : null;',
    replace: '  return id ? SEEN_KEY_PREFIX : null;',
    test: 'src/components/dashboard/DecisionPanel.test.tsx',
  },
  {
    guard: 'DecisionPanel: "Marked as read" reflects the CLICK, not stored state',
    why: 'a returning reader was greeted as having read a list they had not opened',
    pkg: 'frontend',
    file: 'src/components/dashboard/DecisionPanel.tsx',
    find: '    sinceRef.current = readSeen();',
    replace: '    sinceRef.current = readSeen(); setJustMarked(Boolean(readSeen()));',
    test: 'src/components/dashboard/DecisionPanel.test.tsx',
  },
  {
    guard: 'postImport: the work runs in-request where deferring is unsafe',
    why: 'on serverless an unref\'d timer means the norms never refresh and nobody is emailed',
    pkg: 'backend',
    file: 'src/utils/postImport.js',
    find: 'const DEFERRED_WORK_SURVIVES = !process.env.VERCEL;',
    replace: 'const DEFERRED_WORK_SURVIVES = true;',
    test: 'tests/serverlessLifecycle.test.js',
  },
  {
    guard: 'postImport: every call site awaits it',
    why: 'a dropped promise is invisible and behaves correctly on the dev machine',
    pkg: 'backend',
    file: 'src/routes/upload.js',
    find: '    await queuePostImport(data.athleteId);',
    replace: '    queuePostImport(data.athleteId);',
    test: 'tests/serverlessLifecycle.test.js',
  },
  {
    guard: 'DashboardLayout: the session is confirmed once, not once per render',
    why: 'an array-identity dep made /auth/me fire 3x per page load in production',
    pkg: 'frontend',
    file: 'src/components/layout/DashboardLayout.tsx',
    find: '  }, [rolesKey, router]);',
    replace: '  }, [allowedRoles, router]);',
    test: 'src/components/layout/DashboardLayout.test.tsx',
  },
  {
    guard: 'role routing: every role reaches a profile page that admits it',
    why: 'executive had no entry, so <Link href={undefined}> threw and the account '
       + 'menu — the only sign-out in the app — never rendered. Live for five weeks.',
    pkg: 'frontend',
    file: 'src/components/layout/Topbar.tsx',
    find: "  executive: '/admin/profile',",
    replace: "  executive: '/coach/profile',",
    test: 'src/components/layout/roleRouting.test.ts',
  },
  {
    guard: 'role routing: every role lands on a page that admits it',
    why: 'a landing page that refuses its own role bounces the user between two routes',
    pkg: 'frontend',
    file: 'src/lib/auth.ts',
    find: "  executive: '/admin/dashboard',",
    replace: "  executive: '/medical/dashboard',",
    test: 'src/components/layout/roleRouting.test.ts',
  },
  {
    guard: 'ingestion: the text-layer fast path is actually consulted',
    why: 'a pure extractor is correct whether or not anybody calls it — winAnsiSafe '
       + 'shipped exported, unit-tested and never called. Unwired, every import '
       + 'silently goes back to ~11,400 vision tokens and nothing fails.',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '  const fast = await extractFromTextLayer(buffer).catch((err) => {',
    replace: '  const fast = await Promise.resolve({ ok: false }).catch((err) => {',
    test: 'tests/textLayerExtract.test.js',
  },
  {
    guard: 'ingestion: the Summary top-up renders ONE page, not six',
    why: 'the saving IS the page count. Dropping the limit leaves the fast path '
       + 'costing what the slow path costs while reporting itself as fast',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '  const images = await renderForExtraction(buffer, undefined, 1);',
    replace: '  const images = await renderForExtraction(buffer);',
    test: 'tests/textLayerExtract.test.js',
  },
  {
    guard: 'ingestion: the compact layout can still reach the vision path',
    why: 'the 12-page report carries no text at all. A fast path that swallowed '
       + 'the fallback would turn a readable report into an empty one',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: "    method: 'vision',",
    replace: "    method: 'text-layer',",
    test: 'tests/textLayerExtract.test.js',
  },
  {
    guard: 'ingestion: a text layer is not by itself a HoloMotion report',
    why: 'the gate WAS textLayerChars >= 400 and nothing else. Measured: '
       + 'AIRMS-System-Guide.pdf (21,017 chars) and reports/FYP-I-Report.pdf (3,622) '
       + 'both returned ok:true with every value null — and ok:true suppresses the '
       + 'vision fallback, so the path that would have read a real report never ran. '
       + 'The live hazard is a HoloMotion layout that keeps its text and moves the data',
    pkg: 'backend',
    file: 'src/utils/textLayerExtract.js',
    find: '  const shortfall = completenessShortfall({ cover, screening, risks });',
    replace: '  const shortfall = [];',
    test: 'tests/textLayerExtract.test.js',
  },
  {
    guard: 'ingestion: a real 0 is a reading, not a missing value',
    why: '§54 — an unknown value stays unknown and 0 is not unknown. A falsy test '
       + 'here sends a correctly-read report to the vision model, and teaches the '
       + 'gate that a genuine zero score means the parse failed',
    pkg: 'backend',
    file: 'src/utils/textLayerExtract.js',
    find: '  const need = (label, value) => { if (value == null) missing.push(label); };',
    replace: '  const need = (label, value) => { if (!value) missing.push(label); };',
    test: 'tests/textLayerExtract.test.js',
  },
  {
    guard: 'session boundary: a role this build does not know is refused',
    why: 'the snapshot is browser-held, so the role is INPUT. Measured 2026-09-17: with '
       + 'role "superuser" the gate refused the page, asked landingPathFor where to send '
       + 'them, got undefined and handed it to the router — blank page, token still set, '
       + 'no sign-out. A release that renames a role does this to every live session.',
    pkg: 'frontend',
    file: 'src/lib/auth.ts',
    find: "  if (!parsed || typeof parsed !== 'object' || !isRole((parsed as { role?: unknown }).role)) {",
    replace: '  if (false) {',
    test: 'src/lib/auth.test.ts',
  },
  {
    guard: 'session boundary: a refused snapshot is DISCARDED, not just ignored',
    why: 'left in place the browser holds a credential it can never use, and every page '
       + 'load re-reads it — bounced to sign-in from a state that still looks signed in',
    pkg: 'frontend',
    file: 'src/lib/auth.ts',
    find: '    // Refused snapshots are DISCARDED, not merely ignored. Left in place, the',
    replace: '    if (false)',
    test: 'src/lib/auth.test.ts',
  },
  {
    guard: 'session confirmation EXPIRES rather than standing for ever',
    why: 'the /auth/me cache must bound staleness, not remove the check. An unbounded '
       + 'marker would let an expired token survive a whole browsing session',
    pkg: 'frontend',
    file: 'src/lib/auth.ts',
    find: 'const CONFIRM_TTL_MS = 60_000;',
    replace: 'const CONFIRM_TTL_MS = Infinity;',
    test: 'src/lib/auth.test.ts',
  },
  {
    guard: 'auth throttle: /auth/me is exempt, so navigation is not rationed',
    why: 'DashboardLayout calls it per page mount — 30 page views locked a clinician out',
    pkg: 'backend',
    file: 'src/utils/authThrottle.js',
    find: "  '/me',\n",
    replace: '',
    test: 'tests/authThrottle.test.js',
  },
  {
    guard: 'auth throttle: an unauthenticated route cannot be exempted',
    why: 'exempting /login would remove brute-force protection with nothing saying so',
    pkg: 'backend',
    file: 'src/utils/authThrottle.js',
    find: "  '/change-password',",
    replace: "  '/change-password',\n  '/login',",
    test: 'tests/authThrottle.test.js',
  },
  {
    guard: 'change bars (PDF): rows are drawn in the caller\'s order',
    why: 'sorting by size buried Total Score, the one figure checkable against the report',
    pkg: 'backend',
    file: 'src/utils/pdfDraw.js',
    find: '    .map((d) => ({ ...d, gain: d.higherBetter === false ? -d.avgDelta : d.avgDelta }));',
    replace: '    .map((d) => ({ ...d, gain: d.higherBetter === false ? -d.avgDelta : d.avgDelta }))\n'
      + '    .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));',
    test: 'tests/pdfDraw.test.js',
  },
  {
    guard: 'MetricDeltas: rows render in the caller\'s order',
    why: 'the screen and the document must not order the same six scores differently',
    pkg: 'frontend',
    file: 'src/components/charts/Charts.tsx',
    // Single-line anchor: Charts.tsx is CRLF, so a `find` spanning two lines
    // matches nothing and `applyMutation` reports a stale registry rather than
    // a healthy guard. (It reports it LOUDLY, which is how this was caught —
    // see the same trap in SILENT_FAILURES 3s.)
    find: '  const max = Math.max(...rows.map((r) => Math.abs(r.gain)), 1);',
    replace: '  rows.sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));'
      + '  const max = Math.max(...rows.map((r) => Math.abs(r.gain)), 1);',
    test: 'src/components/charts/Charts.test.tsx',
  },
  {
    guard: 'score order: the frontend copies cannot drift from periodScores.js',
    why: 'three copies of one reading order, in two packages that cannot import each other',
    pkg: 'backend',
    file: '../frontend/src/components/admin/TrendStrip.tsx',
    // Puts the derived indicator back near the top, which is the drift this
    // guards against and the layout JC rejected. Single-line `find` (CRLF file),
    // and the insert keeps the list six long on purpose — so what fails is the
    // ORDER assertion and not merely the length floor beneath it.
    find: "  ['exerciseRisks', 'Exercise Risks', false],",
    replace: "  ['exerciseRisks', 'Exercise Risks', false],\r\n  ['overallIndicator', 'Overall indicator', true],",
    test: 'tests/scoreOrder.test.js',
  },
  {
    guard: 'score wording: one measure cannot have two names on two admin screens',
    why: '"Exercise risks" here and "Exercise Risks" on /admin/activity — §33 in miniature',
    pkg: 'backend',
    file: '../frontend/src/components/admin/TrendStrip.tsx',
    find: "  ['exerciseRisks', 'Exercise Risks', false],",
    replace: "  ['exerciseRisks', 'Exercise risks', false],",
    test: 'tests/scoreOrder.test.js',
  },
  {
    guard: 'score wording: a compact label may abbreviate, never rename',
    why: 'shorter is not the test — "Injury Risk" is shorter and is a different measure',
    pkg: 'backend',
    file: '../frontend/src/components/dashboard/ScreeningHistory.tsx',
    find: "  { key: 'exerciseRisks', label: 'Ex. Risks', higherBetter: false },",
    replace: "  { key: 'exerciseRisks', label: 'Injury Risk', higherBetter: false },",
    test: 'tests/scoreOrder.test.js',
  },
  {
    guard: 'score wording: HoloMotion\'s printed scores keep HoloMotion\'s spelling',
    why: '§21 rests on laying the screen beside the PDF and reading the same words',
    pkg: 'backend',
    file: 'src/utils/periodScores.js',
    find: "  ['totalScore', 'Total Score', true],",
    replace: "  ['totalScore', 'Total score', true],",
    test: 'tests/scoreOrder.test.js',
  },
  {
    guard: 'auth: the verifier pins its signing algorithm',
    why: 'the accepted set must be DECLARED, not inherited from the key type',
    pkg: 'backend',
    file: 'src/middleware/auth.js',
    find: "    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: JWT_ALGORITHMS });",
    replace: '    const decoded = jwt.verify(token, process.env.JWT_SECRET);',
    test: 'tests/authHardening.test.js',
  },
  {
    guard: 'auth: the process refuses to start without a signing secret',
    why: 'without it every login 500s and every request 401s — fatal and invisible',
    pkg: 'backend',
    file: 'src/server.js',
    find: 'if (!process.env.JWT_SECRET) {',
    replace: 'if (false) {',
    test: 'tests/authHardening.test.js',
  },
  {
    guard: 'athlete dashboard: the page asks for its own record by IC number',
    why: 'asking with the row id returns somebody else, or nobody',
    pkg: 'frontend',
    file: 'src/app/athlete/dashboard/page.tsx',
    find: '    setAthleteId(session.user.athleteId);',
    replace: '    setAthleteId(session.user.id);',
    test: 'src/app/athlete/dashboard/page.test.tsx',
  },
  {
    guard: 'athlete dashboard: the hero addresses the ATHLETE, not staff',
    why: 'the audience prop defaults to staff, so omitting it still scans as English',
    pkg: 'frontend',
    file: 'src/app/athlete/dashboard/page.tsx',
    // The value is "self", not "athlete" — I guessed and the registry said so
    // out loud rather than reporting a healthy guard. Anchored on the HERO
    // instance, since the page passes it twice.
    find: '<OverallRiskBadge screening={athlete.screening} hero audience="self" />',
    replace: '<OverallRiskBadge screening={athlete.screening} hero audience="staff" />',
    test: 'src/app/athlete/dashboard/page.test.tsx',
  },
  {
    guard: 'Chapter 4: the stated use-case count matches the table',
    why: 'the count read 47 against a 60-row table for five weeks',
    pkg: 'backend',
    file: '../docs/fyp/REPORT_TABLE_4-1.md',
    find: '| | UC-71 | Name the Athletes Awaiting Screening |',
    replace: '| | UC-72 | Name the Athletes Awaiting Screening |',
    test: 'tests/reportTable.test.js',
  },
  {
    guard: 'invitation: the code window is the standard\'s 24 hours',
    why: 'a credential-establishing code sitting in an unvalidated inbox',
    pkg: 'backend',
    file: 'src/utils/resetCodes.js',
    find: 'const INVITE_CODE_TTL_MIN = 24 * 60;',
    replace: 'const INVITE_CODE_TTL_MIN = 7 * 24 * 60;',
    test: 'tests/accountLifecycle.test.js',
  },
  {
    guard: 'invitation: the email never prints a 0 or plural-1 window',
    why: '"expires in 1 days" / "0 days" tells the reader a live code is dead',
    pkg: 'backend',
    file: 'src/utils/mailer.js',
    find: '  if (m % (60 * 24) === 0 && m / (60 * 24) >= 2) return plural(m / (60 * 24), \'day\');',
    replace: '  return `${Math.round(m / (60 * 24))} days`;',
    test: 'tests/accountLifecycle.test.js',
  },
  {
    guard: 'surface reach: a permitted role with no page is DECLARED',
    why: 'the watchlist named admin as an actor in Chapter 4 and admin cannot open it',
    pkg: 'backend',
    file: 'src/routes/watchlist.js',
    // Renamed from `ROLES` on 2026-09-17 (§111.6) — the role SET became a
    // shared fact and this is a permission, not the set. The rename left this
    // anchor stale and the runner ERRORED rather than reporting a pass, which
    // is the behaviour a stale registry is supposed to produce.
    find: "const WATCHLIST_ROLES = ['medical', 'admin'];",
    replace: "const WATCHLIST_ROLES = ['medical', 'admin', 'executive'];",
    test: 'tests/surfaceReach.test.js',
  },
  {
    guard: 'Chapter 4: the invitation window it states is the one the code uses',
    why: 'UC-49 said "seven days" in the commit that changed the window to 24 hours',
    pkg: 'backend',
    file: '../docs/fyp/REPORT_TABLE_4-1.md',
    find: 'The code is single-use, expires after 24 hours,',
    replace: 'The code is single-use, expires after 7 days,',
    test: 'tests/reportTable.test.js',
  },
  {
    guard: 'Chapter 4: no actor named who cannot reach the use case',
    why: 'UC-49 credited Athlete with activating an account; athlete is not invitable',
    pkg: 'backend',
    file: '../docs/fyp/REPORT_TABLE_4-1.md',
    find: 'themselves rather than asking an administrator. | Medical Staff, Administrator, Coach, Executive |',
    replace: 'themselves rather than asking an administrator. | Athlete, Medical Staff, Administrator, Coach, Executive |',
    test: 'tests/reportTable.test.js',
  },
  {
    guard: 'naming: the topbar title matches its sidebar entry',
    why: 'the clinician page was "Athlete Dashboard" in both, named after the athlete\'s screen',
    pkg: 'backend',
    file: '../frontend/src/app/medical/dashboard/page.tsx',
    find: 'title="Medical Dashboard"',
    replace: 'title="Athlete Dashboard"',
    test: 'tests/navigationNames.test.js',
  },
  {
    guard: 'naming: one feature does not get two labels',
    why: '"PDF Reports" for admin and "Reports" for coach — one concept, two names',
    pkg: 'backend',
    file: '../frontend/src/components/layout/Sidebar.tsx',
    find: "    { href: '/admin/reports',     label: 'Reports',            icon: <IconFileText /> },",
    replace: "    { href: '/admin/reports',     label: 'PDF Reports',        icon: <IconFileText /> },",
    test: 'tests/navigationNames.test.js',
  },
  {
    guard: 'naming: the user manual\'s nav table cannot go stale',
    why: 'it described the FYP I system for a month, naming five deleted features',
    pkg: 'backend',
    file: '../docs/USER_MANUAL.md',
    find: '| My Squad | Screening Import | Reports |  | Reports |',
    replace: '| My Squad | Data Uploading | Reports |  | Reports |',
    test: 'tests/navigationNames.test.js',
  },
  {
    guard: 'system map: a re-exported page is not reported as public',
    why: 'the norms editor was published as reachable by anybody',
    pkg: 'backend',
    file: 'scripts/system-map.js',
    find: '    const src = resolveReExport(file, read(file));',
    replace: '    const src = read(file);',
    test: 'tests/systemMap.test.js',
  },
  {
    guard: 'email: the address an activation code is sent to has a SHAPE',
    why: 'a typo delivers a credential-establishing code to a stranger (§85, §97.1)',
    pkg: 'backend',
    file: 'src/utils/emailAddress.js',
    // The realistic regression: somebody "simplifies" the rule to the usual
    // one-liner, which accepts "nurin@isn" (no TLD) and every doubled dot.
    find: '  if (!SHAPE.test(email)) return \'That does not look like an email address — check for a typo.\';',
    replace: '  if (!/.+@.+/.test(email)) return \'That does not look like an email address — check for a typo.\';',
    test: 'tests/emailAddress.test.js',
  },
  {
    guard: 'email: normalising does not strip a "+" tag',
    why: 'it would merge the two deliverable demo inboxes into one account',
    pkg: 'backend',
    file: 'src/utils/emailAddress.js',
    find: '  return String(value).trim().toLowerCase();',
    replace: '  return String(value).trim().toLowerCase().replace(/\\+[^@]*/, \'\');',
    test: 'tests/emailAddress.test.js',
  },
  {
    guard: 'vision throttle: the paid endpoint is actually MOUNTED behind it',
    why: 'the ONE endpoint that consumes a third-party quota had no cap at all (§97.2)',
    pkg: 'backend',
    file: 'src/routes/upload.js',
    // Un-wiring it, which is what a refactor does by accident. The limiter
    // stays defined, exported and unit-tested — the winAnsiSafe shape.
    find: "router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), visionThrottle, uploadPdf.single('file'), async (req, res) => {",
    replace: "router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), uploadPdf.single('file'), async (req, res) => {",
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'vision throttle: accounting is per USER, not per IP',
    why: 'one address is the whole institution — the §48 NAT lesson',
    pkg: 'backend',
    file: 'src/utils/visionThrottle.js',
    find: "const visionKey = (req) => (req.user && req.user.id ? `u:${req.user.id}` : 'anon');",
    replace: "const visionKey = (req) => String(req.ip || 'anon');",
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'athlete dashboard: the body map is not filed under "how you have changed"',
    why: 'deleting the closing heading silently mislabels a clinical figure (§98.2)',
    pkg: 'frontend',
    file: 'src/app/athlete/dashboard/page.tsx',
    // Removing the third heading. The page still renders, e2e still finds 155
    // body-map regions, and the only symptom is that the figure now sits under
    // a heading that describes a change view.
    find: '      <SectionHeading note="Flags from that same latest screening, drawn on the figure">',
    replace: '      <SectionHeading_REMOVED note="Flags from that same latest screening, drawn on the figure">',
    test: 'src/app/sectionHeadings.test.ts',
  },
  {
    guard: 'preflight: the refusal describes the port that is ACTUALLY held',
    why: 'it told the stale-frontend story while only :5000 was busy — found in real use',
    pkg: 'backend',
    file: 'scripts/preflight-ports.js',
    from: ROOT,
    find: '  if (webBusy) {',
    replace: '  if (true) {',
    test: 'tests/preflightPorts.test.js',
  },
  {
    guard: 'escalation response: a green band is not owed one',
    why: 'counting greens would drown the rate that matters — most athletes are green',
    pkg: 'backend',
    file: 'src/utils/escalationResponse.js',
    find: "const OWED_BANDS = new Set(['amber', 'red']);",
    replace: "const OWED_BANDS = new Set(['amber', 'red', 'green']);",
    test: 'tests/escalationResponse.test.js',
  },
  {
    guard: 'escalation response: the rate is null, never 0, when nothing was owed',
    why: '0% reads as total failure where the answer is "nothing to answer" (§71)',
    pkg: 'backend',
    file: 'src/utils/escalationResponse.js',
    find: '    rate: owed.length ? answered.length / owed.length : null,',
    replace: '    rate: owed.length ? answered.length / owed.length : 0,',
    test: 'tests/escalationResponse.test.js',
  },
  {
    guard: 'escalation response: reads the EFFECTIVE band, so an override counts',
    why: 'reading overallBand would miss every clinician-raised flag and chase answered ones',
    pkg: 'backend',
    file: 'src/utils/escalationResponse.js',
    find: '    if (!OWED_BANDS.has(effectiveBand(s))) continue;',
    replace: '    if (!OWED_BANDS.has(s.overallBand)) continue;',
    test: 'tests/escalationResponse.test.js',
  },
  {
    guard: 'sport compliance: ranks on SHARE, not on headcount',
    why: 'ranking by count sorts by squad size and calls it compliance (§71)',
    pkg: 'backend',
    file: 'src/utils/sportCompliance.js',
    // BOTH sides, because changing one produces a broken comparator rather than
    // a different ranking — and for this fixture it happened to yield the SAME
    // order, so the mutation survived while proving nothing. (V8's sort calls
    // the comparator as (Hockey, Badminton), not the written order.) A mutation
    // has to express the realistic mistake — "rank by headcount" — not a
    // corruption the data cannot see.
    find: '    const av = a.currentShare ?? -1;\n    const bv = b.currentShare ?? -1;',
    replace: '    const av = a.current ?? -1;\n    const bv = b.current ?? -1;',
    test: 'tests/sportCompliance.test.js',
  },
  {
    guard: 'sport compliance: the repeat rate divides by those EVER SCREENED',
    why: 'dividing by the roster punishes a squad for athletes with no first assessment',
    pkg: 'backend',
    file: 'src/utils/sportCompliance.js',
    find: '      repeatShare: screened ? s.repeat / screened : null,',
    replace: '      repeatShare: s.rostered ? s.repeat / s.rostered : null,',
    test: 'tests/sportCompliance.test.js',
  },
  {
    guard: 'sport compliance: the caveat names what the measure CANNOT separate',
    why: 'without it the table reads as a league table of athlete cooperation',
    pkg: 'backend',
    file: 'src/utils/sportCompliance.js',
    find: "    caveat: 'Measures whether screenings happened, which depends on scheduling, '",
    replace: "    caveat: 'Screening compliance per squad. '",
    test: 'tests/sportCompliance.test.js',
  },
  {
    guard: 'activity report: the PDF draws every KPI group the util returns',
    why: 'the document quoted a poorer set than the page for a whole release (§105)',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    // The realistic regression: a KPI group is added to the util and the report
    // is never updated. Renaming the reference reproduces "the report does not
    // know this group exists" exactly.
    find: '    const sc = data.sportCompliance;',
    replace: '    const sc = data.sportComplianceMISSING;',
    test: 'tests/activityReportParity.test.js',
  },
];

function pkgDir(pkg) {
  return path.join(ROOT, pkg);
}

function applyMutation(m) {
  const file = path.join(m.from || pkgDir(m.pkg), m.file);
  if (!fs.existsSync(file)) throw new Error(`no such file: ${m.file}`);
  const original = fs.readFileSync(file, 'utf8');
  const hits = original.split(m.find).length - 1;
  if (hits === 0) {
    // The registry has drifted from the code. Loud, because a mutation that
    // applies nothing would otherwise report the guard as healthy.
    throw new Error(`mutation target not found in ${m.file} — the registry is stale:\n    ${m.find}`);
  }
  if (hits > 1) throw new Error(`mutation target appears ${hits} times in ${m.file}; make it unique`);
  fs.writeFileSync(file, original.replace(m.find, m.replace));
  return { file, original };
}

function runTest(m) {
  const r = spawnSync('npx', ['jest', '--silent', m.test], {
    cwd: pkgDir(m.pkg), encoding: 'utf8', shell: process.platform === 'win32',
  });
  return r.status === 0; // true = tests PASSED, i.e. the mutation survived
}

function main() {
  const only = process.argv[2];
  const list = only ? MUTATIONS.filter((m) => m.guard.includes(only)) : MUTATIONS;
  if (!list.length) {
    console.error(`no mutation matches "${only}"`);
    process.exit(2);
  }

  console.log(`\nmutation check — ${list.length} guard(s)\n`);
  const survived = [];

  for (const m of list) {
    let restore = null;
    try {
      restore = applyMutation(m);
      const passed = runTest(m);
      if (passed) {
        survived.push(m);
        console.log(`  SURVIVED  ${m.guard}`);
        console.log(`            ${m.test} still passes with the guard broken.`);
        console.log(`            ${m.why}`);
      } else {
        console.log(`  caught    ${m.guard}`);
      }
    } catch (e) {
      survived.push(m);
      console.log(`  ERROR     ${m.guard}\n            ${e.message}`);
    } finally {
      // ALWAYS restore. A crashed run that leaves a mutated guard in the tree is
      // strictly worse than never running this at all.
      if (restore) fs.writeFileSync(restore.file, restore.original);
    }
  }

  console.log('');
  if (survived.length) {
    console.error(`${survived.length} of ${list.length} mutation(s) NOT caught.`);
    console.error('A surviving mutation means the test does not test what it says it does.');
    process.exit(1);
  }
  console.log(`all ${list.length} mutations caught — every guard listed here can fail.`);
  process.exit(0);
}

// Restore is in the finally above, but a SIGINT mid-jest would skip it. Node
// runs no finally on a signal, so refuse to die quietly: the handler exists so
// an interrupted run says what to check.
process.on('SIGINT', () => {
  console.error('\ninterrupted — if a guard file looks modified, `git checkout` it.');
  process.exit(130);
});

main();
