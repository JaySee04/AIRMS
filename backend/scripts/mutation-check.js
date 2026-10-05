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
const { plant } = require('./lib/plantedEdit');

const ROOT = path.join(__dirname, '..', '..');

// find/replace must be UNIQUE in the file. `applyMutation` refuses otherwise,
// because a mutation that lands in two places is not the mutation described.
const MUTATIONS = [
  {
    // THE CONTROL, and it runs first on purpose (2026-09-29, §119).
    //
    // Everything below asserts "break this, and a test goes red". That claim is
    // only worth anything if the runner can also report GREEN — and nothing was
    // checking it. If `runTest` ever returned "failed" unconditionally — a bad
    // jest invocation, a wrong path, a non-zero exit from something unrelated —
    // all 80-odd mutations would report `caught` and this script would certify
    // an empty registry as healthy. That is the largest possible vacuous pass
    // in this repo, and the file exists to prevent exactly that shape.
    //
    // CLAUDE.md claimed the runner "is itself verified: a control mutation that
    // edits only a comment reports SURVIVED". That was true — as a ONE-TIME
    // manual check, done once and never re-run. This makes it standing.
    //
    // `control: true` INVERTS the verdict: editing a comment cannot change
    // behaviour, so the test must still pass. A control that is "caught" fails
    // the run and says why.
    control: true,
    guard: 'the runner itself can report GREEN (control: a comment-only edit)',
    why: 'if this is "caught", every other result in the run is meaningless',
    pkg: 'backend',
    file: 'src/utils/num.js',
    find: '// Turning a stored value into a number, once.',
    replace: '// Turning a stored value into a number, once. (mutation-check control)',
    test: 'tests/numRound.test.js',
  },
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
    guard: 'summary: the recovered text is bounded by the paragraph, not the window',
    why: 'a fixed character window ran past the summary on nazwan.pdf and swept in '
       + '"Joint Illustration Wall Angel… Muscle Imbalance Myodynamia Deficiency ： '
       + 'Gluteus medius L". §70 renders this VERBATIM as the instrument\'s verdict on '
       + 'the athlete, so the overrun would have been shown to a clinician as clinical text',
    pkg: 'backend',
    file: 'src/utils/summaryRecover.js',
    find: '  const summary = pointsOnly(collapsed);',
    replace: '  const summary = collapsed;',
    test: 'tests/summaryRecover.test.js',
  },
  {
    guard: 'summary: a lone capital is never merged into the word before it',
    why: 'protects "weak In" from collapsing to "weakIn" when a spaced run meets a '
       + 'capital without terminating punctuation. MEASURED HONESTLY: across all 24 real '
       + 'reports this rule changes nothing inside the kept summary — it fires only in '
       + 'the muscle text pointsOnly discards — so it guards a shape not present in '
       + 'today\'s sample rather than a live defect. The obvious test for it ("E.G. In") '
       + 'does NOT exercise it, because the preceding "d;" already ends the run, and that '
       + 'test duly reported SURVIVED',
    pkg: 'backend',
    file: 'src/utils/summaryRecover.js',
    find: "    if (merging && /^\\w+$/.test(token) && !/^[A-Z]$/.test(token)) {",
    replace: "    if (merging && /^\\w+$/.test(token)) {",
    test: 'tests/summaryRecover.test.js',
  },
  {
    guard: 'summary: recovery is tried BEFORE the model is paid',
    why: 'the entire saving is not making the call. Recovering after a successful '
       + 'vision top-up spends ~1,500 image tokens and then discards the answer',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '    const recovered = recoverSummary(buffer);',
    replace: '    const recovered = { ok: false };',
    test: 'tests/summaryRecover.test.js',
  },
  {
    guard: 'ingestion: no vision provider still imports a readable report',
    why: 'the preview route refused EVERY import when VISION_API_KEY was unset — right '
       + 'while every report had to be looked at, wrong once most can be read. Measured '
       + 'with the provider unset: nazwan.pdf ingests fully at 0 tokens, thung.pdf is '
       + 'refused 503. Restoring the up-front refusal locks an ISN installation with no '
       + 'key out of a path that needs nothing',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '  if (!isVisionConfigured()) {',
    replace: '  if (false) {',
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
    find: "router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), visionThrottle, uploadPdf.single('file'), pdfUploadError, async (req, res) => {",
    replace: "router.post('/screening/pdf/preview', auth, rbac('medical', 'admin'), requirePermission('uploadData'), uploadPdf.single('file'), pdfUploadError, async (req, res) => {",
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
    guard: 'vision throttle: the gate does NOT spend the quota on the way in',
    why: 'since §112/§114 most previews call no provider; counting requests rationed free work (§115)',
    pkg: 'backend',
    file: 'src/utils/visionThrottle.js',
    // The old behaviour, restored: counting at the door rather than at the
    // point of spend. Every unit test on visionKey/LIMIT still passes and the
    // cap looks identical from outside — it just charges an ISN install
    // 60/hour for work that draws nothing.
    //
    // SINGLE-LINE, like every other entry here, and that is not a style rule.
    // The first version of this spanned two lines joined with `\r\n` and
    // reported ERROR: `.gitattributes` normalises the repo to LF, so what a
    // working copy holds depends on what git last touched — visionThrottle.js
    // had CRLF in the untouched parts and LF in the block just edited. A
    // multi-line pattern is matching against that lottery. The sibling
    // mutation in holomotionExtract.js matched on the same day with the same
    // `\r\n` and was therefore proving nothing durable either.
    find: '    const { hits, resetAt } = await readQuota(key);',
    replace: '    const { hits, resetAt } = await readQuota(key); await store.increment(key);',
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'vision throttle: no provider configured means no cap at all',
    why: 'an ISN install has no key, so nothing can draw the allowance the cap protects (§115)',
    pkg: 'backend',
    file: 'src/utils/visionThrottle.js',
    find: '    if (!isVisionConfigured()) return next();',
    replace: '    if (false) return next();',
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'vision throttle: the extractor is actually given a way to claim a call',
    why: 'reserveVisionCall is valid whether or not anything calls it — the winAnsiSafe shape (§115.6)',
    pkg: 'backend',
    file: 'src/routes/upload.js',
    find: '      reserveProviderCall: () => reserveVisionCall(req),',
    replace: '      reserveProviderCall: null,',
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'vision throttle: the compact layout still reports its one call',
    why: 'the one path that genuinely spends the allowance must not read as free (§115)',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    // `providerCalls: 1` also appears in summaryFromPage1, so this targets the
    // preceding `usage:` line instead — unique, and on ONE line for the
    // line-ending reason given above.
    //
    // A first attempt inserted a DUPLICATE `providerCalls: 0` key and SURVIVED.
    // The test was not at fault: a duplicate key in an object literal loses to
    // the later one, so the mutation changed no behaviour at all. A mutation
    // that does not mutate proves nothing about the guard.
    find: '    providerCalls: 1, // the compact layout always costs exactly one',
    replace: '    providerCalls: 0, // the compact layout always costs exactly one',
    test: 'tests/visionThrottle.test.js',
  },
  {
    guard: 'extract: an irrelevant PDF is refused BEFORE anything is transmitted',
    why: 'a 51-page university report reached Gemini — the gate is the only thing stopping it (§121.13)',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    // Neuter the relevance check. Every text-bearing non-report then falls
    // through to the vision path exactly as it did before the gate existed, and
    // nothing errors — the import simply succeeds on a document that should
    // never have left the machine.
    find: '    if (!id.relevant) {',
    replace: '    if (false) {',
    test: 'tests/extractGating.test.js',
  },
  {
    guard: 'extract: the no-text cover check still refuses a non-report',
    why: 'at 0 characters the fingerprint is the only local signal there is',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '    if (verdict.known && !verdict.relevant) {',
    replace: '    if (false) {',
    test: 'tests/extractGating.test.js',
  },
  {
    guard: 'extract: the Summary top-up stays off unless the institution says otherwise',
    why: 'the one provider call an already-read report can make, and it was invisible (§121)',
    pkg: 'backend',
    file: 'src/utils/holomotionExtract.js',
    find: '    if (!summary && allowTopUp && isVisionConfigured()) {',
    replace: '    if (!summary && isVisionConfigured()) {',
    test: 'tests/extractGating.test.js',
  },
  {
    guard: 'alerts: a coach is told about their OWN sport and no other',
    why: 'a coach reading another squad\'s flagged athletes is a disclosure, not a nuisance',
    pkg: 'backend',
    file: 'src/utils/alerts.js',
    // Drop the sport comparison and every coach receives every flagged athlete
    // in the institution. Nothing errors; the emails simply say too much.
    find: '      if (c && c.coachSport && item.athlete && c.coachSport === item.athlete.sport) add(c.email, item);',
    replace: '      if (c && c.coachSport && item.athlete) add(c.email, item);',
    test: 'tests/alerts.test.js',
  },
  {
    guard: 'alerts: the institution\'s band threshold is obeyed',
    why: 'a red-only policy that still mails every amber is the dial being ignored',
    pkg: 'backend',
    file: 'src/utils/alerts.js',
    find: '    if (!band || BAND_RANK[band] < BAND_RANK[threshold]) {',
    replace: '    if (!band) {',
    test: 'tests/alerts.test.js',
  },
  {
    guard: 'alerts: a per-user opt-out is honoured, not just stored',
    why: 'an opt-out that reads as consent is the failure mailPrefs.js was written about',
    pkg: 'backend',
    file: 'src/utils/alerts.js',
    // Skip the preference filter: everyone gets mail regardless of what they
    // asked for, and the setting page goes on showing their choice.
    find: "  const willing = recipientsFor(users, 'import_alerts');",
    replace: '  const willing = users;',
    test: 'tests/alerts.test.js',
  },
  {
    guard: 'planted edits: the corpus scan is not looking at an empty set',
    why: 'a scan that walks nothing reports every canary as guarded (§121.12)',
    pkg: 'backend',
    file: 'tests/plantedEdits.test.js',
    // Point the walker at a directory that does not exist. Every offender check
    // then iterates an empty list and passes — which is the defect the file is
    // about, reached through the file itself. The corpus-floor assertion is what
    // must notice.
    find: "  path.join(ROOT, 'backend', 'scripts'),",
    replace: "  path.join(ROOT, 'backend', 'no-such-directory'),",
    test: 'tests/plantedEdits.test.js',
  },
  {
    guard: 'planted edits: plantedEdit actually refuses an absent needle',
    why: 'if it silently replaced nothing, every canary in the repo would be inert',
    pkg: 'backend',
    file: 'scripts/lib/plantedEdit.js',
    // Make the count check permissive. plant() then behaves exactly like the
    // bare String.replace it exists to replace, and every caller goes back to
    // reporting success on an edit that never applied.
    find: '  if (hits !== opts.expect) {',
    replace: '  if (false) {',
    test: 'tests/plantedEdits.test.js',
  },
  {
    guard: 'prose blindness: the comment stripper is not inert',
    why: 'a stripper matching nothing reports every source assertion as code-backed (§118)',
    pkg: 'backend',
    file: 'tests/proseBlindness.test.js',
    // The classic inert-stripper mutation: drop the CRLF normalisation and the
    // line-comment strip matches nothing on this repo's files, so every
    // assertion checked below is compared raw against raw and passes.
    find: "  .replace(/\\r\\n/g, '\\n')\n  .replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')",
    replace: "  .replace(/\\r\\n/g, '\\r\\n')\n  .replace(/ZZNEVERMATCHZZ/g, '')",
    test: 'tests/proseBlindness.test.js',
  },
  {
    guard: 'build fingerprint: line endings do not make a build look stale',
    why: '.gitattributes checks out eol=lf, so a Windows tree is CRLF and the deploy is LF (§117)',
    pkg: 'backend',
    file: 'src/utils/buildId.js',
    // Drop the normalisation and every local-vs-hosted comparison reports
    // "stale" for a reason that has nothing to do with the code — the false
    // alarm that gets a check switched off rather than heeded.
    find: "    h.update(fs.readFileSync(f, 'utf8').replace(/\\r\\n/g, '\\n'));",
    replace: "    h.update(fs.readFileSync(f, 'utf8'));",
    test: 'tests/buildId.test.js',
  },
  {
    guard: 'build fingerprint: verify:claims refuses a stale instance',
    why: 'every claim it prints is read as a fact about the source (§113, §116.5)',
    pkg: 'backend',
    file: 'scripts/verify-claims.js',
    find: '  const fresh = await checkFresh(API);',
    replace: "  const fresh = { ok: true, reason: 'match', local: 'x', remote: 'x' };",
    test: 'tests/buildId.test.js',
  },
  {
    guard: 'cohorts payload: the parked stats blob is read, not shipped',
    why: '27.5 KB of 80.9 KB that no file in frontend/src names (§116)',
    pkg: 'backend',
    file: 'src/routes/cohorts.js',
    find: '        const { freshStats, ...rest } = r.get({ plain: true });',
    replace: '        const rest = r.get({ plain: true }); const freshStats = null;',
    test: 'tests/cohorts.test.js',
  },
  {
    guard: 'cohorts payload: freshStats is still SELECTED, so drift survives',
    why: 'dropping it from the QUERY empties the drift indicator instead of shrinking the payload (§116)',
    pkg: 'backend',
    file: 'src/routes/cohorts.js',
    // The trap, not the feature. This is the edit a reader makes when they see
    // a field being discarded after it was fetched and "tidies" the query —
    // pinDrift(r) consumes it right there, so the page silently stops showing
    // which cohorts have drifted from the pinned norm.
    find: '      CohortThreshold.findAll({',
    replace: "      CohortThreshold.findAll({\n        attributes: { exclude: ['freshStats'] },",
    test: 'tests/cohorts.test.js',
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
  // ── the three institutional reports' CONTENT claims (2026-10-05) ───────────
  //
  // routes/screeningReports.js was the largest remaining coverage gap (40.9%,
  // 249 uncovered statements) and it is the file that produces the documents
  // handed to a director. What was there asserted `status).not.toBe(403)`, which
  // passes over a 500 — the shape reportRoutes.test.js's own header warns about.
  {
    guard: 'activity log export: a one-account extract NAMES its subject',
    why: 'without the scope line a narrow extract is indistinguishable from the whole log',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: '      req.query.entityId ? `Subject: ${String(req.query.entityId)}` : null,',
    replace: '      null,',
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'activity log export: says it was CAPPED when more rows matched',
    why: 'a reviewer otherwise holds a truncated record believing it is complete',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: '    const LIMIT = 400;',
    replace: '    const LIMIT = 500;',
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'activity log export: an empty selection SAYS it is empty',
    why: 'a document that merely omits the table looks like one whose table failed to render',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: '    if (!rows.length) {',
    replace: '    if (rows.length < 0) {',
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'report downloads are audited as report.download',
    why: 'for coach and executive, reading IS the only act there is to hold them to (§20)',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: "    action: 'report.download',",
    replace: "    action: 'report.viewed',",
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'individual report: a clinician OVERRIDE is disclosed as one',
    why: 'printing the final band silently presents a judgement as an instrument reading',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: '    if (latest.overrideBand) {',
    replace: '    if (latest.overrideBand && false) {',
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'individual report: an empty trend says WHICH reason emptied it',
    why: 'a date window and a missing history need opposite responses from the reader',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: "          ? 'Only the latest screening falls in the selected window — widen the date range to see progress.'",
    replace: "          ? 'Only one screening on record — import a newer report to see progress.'",
    test: 'tests/reportRoutes.test.js',
  },
  {
    guard: 'individual report: a muscle flag keeps its SIDE',
    why: 'the body map paints the worse of L/R and discards it; this is where it survives',
    pkg: 'backend',
    file: 'src/routes/screeningReports.js',
    find: "      .text((mf.myodynamia || []).map((m) => `${m.muscle} ${m.side}`).join(', ') || 'none');",
    replace: "      .text((mf.myodynamia || []).map((m) => `${m.muscle}`).join(', ') || 'none');",
    test: 'tests/reportRoutes.test.js',
  },
];

function pkgDir(pkg) {
  return path.join(ROOT, pkg);
}

function applyMutation(m) {
  const file = path.join(m.from || pkgDir(m.pkg), m.file);
  if (!fs.existsSync(file)) throw new Error(`no such file: ${m.file}`);
  const original = fs.readFileSync(file, 'utf8');
  // Via the shared helper rather than inline. This logic — refuse on zero hits,
  // refuse on more than one — was correct here and NOWHERE ELSE, so every
  // hand-written canary reinvented the bug it prevents (§121.12). One definition,
  // in scripts/lib/plantedEdit.js, and the message it raises explains itself.
  const { text } = plant(original, m.find, m.replace, { expect: 1, label: `${m.guard} (${m.file})` });
  fs.writeFileSync(file, text);
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
      // A CONTROL IS INVERTED: it edits something that cannot change behaviour,
      // so the test MUST still pass. If a control is "caught", the runner is
      // reporting red for a change that did nothing — at which point every
      // "caught" above it means nothing either, and this whole script is the
      // vacuous pass it exists to prevent. See §119.
      if (m.control) {
        if (passed) {
          console.log(`  control   ${m.guard} — survived, as a no-op must`);
        } else {
          survived.push(m);
          console.log(`  BROKEN    CONTROL FAILED: ${m.guard}`);
          console.log(`            ${m.test} went RED for an edit that changes no behaviour.`);
          console.log('            Every "caught" in this run is therefore untrustworthy.');
        }
      } else if (passed) {
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
