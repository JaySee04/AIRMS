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
    guard: 'accountLifecycle: athlete is not an invitable role',
    why: 'an athlete account also needs a roster record to attach to',
    pkg: 'backend',
    file: 'src/routes/users.js',
    find: "const INVITABLE_ROLES = ['medical', 'coach', 'admin', 'executive'];",
    replace: "const INVITABLE_ROLES = ['medical', 'coach', 'admin', 'executive', 'athlete'];",
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
