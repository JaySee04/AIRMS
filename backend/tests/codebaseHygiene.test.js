// The sweeps that had no home.
//
// Everything found on 2026-09-02 came from throwaway scripts in a temp folder.
// They found: a settings read that swallowed its own database error, three dead
// exports under a comment claiming every route used them, and a constant written
// out three times. Then they were deleted, which means the next person has to
// think of the same hypotheses again — and the whole argument of
// docs/SILENT_FAILURES.md is that this defect class is predictable enough to
// hunt on purpose.
//
// So the two hypotheses that were NOT already covered by a test live here. The
// rest are guarded where they belong: CSS tokens in cssTokens.test.ts, error
// leakage and query shapes in httpHardening.test.js, the cross-package pins in
// bands / periods / cohorts / accountLifecycle / riskIndicators.
//
// These are deliberately CONSERVATIVE. A hygiene check that cries wolf gets
// suppressed, and a suppressed check is worse than none — so each carries an
// explicit allow-list of the cases already reasoned about, and a new entry there
// is meant to be an argument, not a shrug.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

// A name mentioned only in prose is not a use. Without this, the historical
// names quoted in THIS file's own comments counted as callers, so the dead-export
// check could never flag the very examples it was written from — which a
// mutation run demonstrated rather than reasoning finding it.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*/g, '$1 ');
const FILES = walk(SRC).map((p) => ({ p, rel: rel(p), src: fs.readFileSync(p, 'utf8') }));

describe('H1 — a catch must not turn a failure into an empty success', () => {
  // `getSettings()` did exactly this: a database error became `[]`, every caller
  // got a complete settings object assembled from DEFAULTS, and a PINNED norm
  // silently released. Different clinical numbers, no error anywhere.
  //
  // The dangerous shape is a catch returning an empty VALUE, because that value
  // then stands in for data nobody fetched. An empty HANDLER — `.catch(() => {})`
  // — is a different thing: best-effort cleanup on a teardown path, where a
  // failure must not mask the outcome being reported. All three in this codebase
  // are that (closing a connection at exit, releasing a lock whose TTL expires
  // anyway, terminating an OCR worker), so `() => {}` is deliberately NOT
  // matched below.
  //
  // Getting that distinction wrong made the first version of this check fire
  // eleven times and find nothing — which is exactly how a hygiene check earns
  // being ignored.
  const ALLOWED = new Map([
    // Parsing an error RESPONSE body — the failure is already known and being
    // reported; this only guards against the body not being JSON.
    ['utils/visionClient.js', 'reads an error body as text for the message'],
  ]);

  it('has no unexplained swallow-to-empty', () => {
    // `\(\{\}\)` is `({})`, an empty object VALUE. Bare `{}` is an empty
    // function body and is intentionally absent from this alternation.
    const pattern = /catch\s*\(\s*\(?[a-z]*\)?\s*=>\s*(\[\]|\(\{\}\)|null|0|''|"")\s*\)/g;
    const found = [];
    for (const f of FILES) {
      const hits = f.src.match(pattern);
      if (hits && !ALLOWED.has(f.rel)) {
        found.push(`${f.rel}: ${hits.join(', ')}`);
      }
    }
    expect(found).toEqual([]);
  });

  // THE CANARY (2026-09-10, guardCanaries.test.js). The scan above reports "no
  // unexplained swallow-to-empty" across every source file. A floor on the
  // corpus size proves the walk works; nothing proved the PATTERN does. If it
  // stopped matching, this would report all-clear while another `getSettings()`
  // turned a database error into a complete, plausible settings object and
  // silently released a pinned norm.
  //
  // The distinction the pattern turns on is asserted too, because getting it
  // wrong is what made the first version fire eleven times and find nothing.
  it('can detect a swallow-to-empty — the planted case it exists to find', () => {
    const pattern = /catch\s*\(\s*\(?[a-z]*\)?\s*=>\s*(\[\]|\(\{\}\)|null|0|''|"")\s*\)/g;
    const matches = (s) => new RegExp(pattern.source).test(s);

    // Values that stand in for data nobody fetched — the dangerous shape.
    expect(matches('const rows = await q().catch(() => []);')).toBe(true);
    expect(matches('const cfg = await q().catch((e) => ({}));')).toBe(true);
    expect(matches('const v = await q().catch(() => null);')).toBe(true);

    // An empty HANDLER is a different thing and must NOT match: best-effort
    // cleanup on a teardown path, where a failure must not mask the outcome
    // being reported. All three in this codebase are that.
    expect(matches('await conn.close().catch(() => {});')).toBe(false);
  });

  it('is looking at a real corpus', () => {
    // Without this, a broken walker would make the check above pass vacuously —
    // which is the same defect shape it exists to find.
    expect(FILES.length).toBeGreaterThan(30);
    expect(FILES.some((f) => f.rel === 'utils/settings.js')).toBe(true);
  });
});

describe('H2 — an export with no caller is either dead or a guard nobody installed', () => {
  // `serializeGeneric`, `serializeMany` and `withStringId` sat exported with zero
  // callers, under a header asserting "every route emits its rows through one of
  // these helpers". No route did. The same shape hid `winAnsiSafe`, which was
  // defined, exported, unit-tested and never called while PDFs printed mojibake.
  //
  // Names used ONLY by tests are legitimate and listed here: they exist so a
  // property can be asserted rather than left as an absence.
  const TEST_ONLY = new Set([
    'RISK_INDICATORS', 'EXCLUDED_RISK_KEYS', 'REPORT_LABEL', 'REPORT_RISKS',
    'INDICATOR_LABEL', 'SHOWN_INDICATORS', 'isShownIndicator',
    'PERMISSION_LABELS', 'keyOf', 'DEFAULT_TTL_MS', 'acquireWaiting',
    'CLINICIAN_NOTE_FIELDS', 'NOTE_READER_ROLES', 'scopeHidesExistence',
    'GENERIC', 'badRequest', 'num', 'MAX_DELAY_MS',
    'LOCK_NAME', 'TTL_MS', 'WAIT_MS', 'RecomputeBusyError',
    'FALLBACK_DEAD_BAND', 'MIN_PAIRS', 'BALANCED_WITHIN', 'SUBITEM_REGIONS',
    'NOTABLE_GAP_PCT', 'REGIONS', 'CELLS', 'GRAINS', 'PERIOD_SCORES',
    'BAND_RANK', 'BAND_LABEL', 'COMPONENTS', 'SHOWN_RISK_KEYS', 'SMALL_COHORT',
    'INSTITUTION_TZ', 'periodKeyOf', 'grainCounts', 'median', 'sd',
    'consecutivePairs', 'pairedDifferences', 'meanSd', 'cohortKeyOf',
    'resolveFromMap', 'buildApprovedCohortMap', 'orientedComponents',
    'tierKeysFor', 'isEligibleForNorms', 'expose', 'str', 'date', 'likeTerm',
    'notFoundStatusFor', 'readsClinicianNotes', 'seasonality', 'asymmetryPct',
    'symmetryFindings', 'aggregateSubitems', 'scopeLabel', 'rescreenRecall',
    'stopScheduler', 'startScheduler', 'flushNow', 'sanitizePermissions',
    'isForeignAthleteRequest', 'canDownloadIndividualReport', 'hasPermission',
    'PERMISSION_KEYS', 'effectiveBand', 'atLeastAsBad', 'computeStats',
    'screeningMovement', 'cohortReview', 'pinDrift', 'resolvedCohortId',
    'belongsToCohort', 'cohortLabelFor', 'latestScreeningsByAthlete',
    'recomputeCohorts', 'recomputeIndicators', 'resolveCohortStats',
    'reliability', 'screeningPeriods', 'programmeActivityData', 'toIndicator',
    'recall', 'winAnsiSafe', 'guardText',
  ]);

  // Names exported from src and referenced nowhere else in src, tests or scripts.
  it('has no export that nothing anywhere references', () => {
    const ROOT = path.join(__dirname, '..');
    const haystack = [
      ...walk(SRC),
      ...walk(path.join(ROOT, 'tests')),
      ...(fs.existsSync(path.join(ROOT, 'scripts')) ? walk(path.join(ROOT, 'scripts')) : []),
    ].map((p) => ({ p, src: stripComments(fs.readFileSync(p, 'utf8')) }));

    const orphans = [];
    for (const f of FILES) {
      const block = f.src.match(/module\.exports\s*=\s*\{([\s\S]*?)\n\};/);
      if (!block) continue;
      const names = block[1]
        .split(',')
        .map((s) => s.replace(/\/\/[^\n]*/g, '').trim())
        .map((s) => (s.includes(':') ? s.split(':')[0].trim() : s))
        .filter((s) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s));

      // The file WITHOUT its export list, so a name can be checked for use in
      // the body.
      const body = stripComments(f.src.replace(block[0], ''));
      for (const name of names) {
        if (TEST_ONLY.has(name)) continue;
        const re = new RegExp(`\\b${name}\\b`, 'g');
        // COUNT, not presence. A dead function's own declaration is an
        // occurrence, so "appears in the body" is true even for something
        // nothing calls — the first version of this rule tested presence and
        // therefore could not catch a dead function at all, which a mutation
        // run demonstrated.
        //
        // Exactly one occurrence is the declaration alone. More than one means
        // the file uses it, which makes it over-exported: untidy, but the code
        // runs and the export surface is a style question. One occurrence and
        // no external reference is the winAnsiSafe / serializeGeneric shape —
        // defined, exported, sometimes unit-tested, and never reached.
        const inBody = (body.match(re) || []).length;
        if (inBody > 1) continue;
        const users = haystack.filter((h) => h.p !== f.p && new RegExp(`\\b${name}\\b`).test(h.src));
        if (users.length === 0) orphans.push(`${f.rel} exports ${name}, used nowhere at all`);
      }
    }
    expect(orphans).toEqual([]);
  });
});

// ── numbers the docs quote about the code ───────────────────────────────────
//
// Five documents said the permission matrix came from "calling all 52 endpoints
// as every role". The list in scripts/audit-access.js had 46 entries. Both
// numbers were written by someone reading the other, and neither recomputed.
//
// This is the H7 pattern applied to a claim ABOUT the code rather than about the
// data, and it is the cheaper half to fix: the code can check it. A figure a
// panel may ask about should not rest on prose agreeing with a list nobody
// re-counts.
describe('the docs quote the real endpoint count', () => {
  const fs = require('fs');
  const path = require('path');
  const ROOT = path.join(__dirname, '..', '..');

  // Counts PROBE ENTRIES in the audit's hand-written list.
  const probeCount = () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'audit-access.js'), 'utf8');
    const start = src.indexOf('const ROUTES = [');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n];', start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end).split('\n').filter((l) => /^\s*\['/.test(l)).length;
  };

  // Counts ENDPOINTS THAT EXIST, from the parser that generates SYSTEM_MAP.md.
  //
  // CHANGED 2026-09-09, and the change is the point. This check used to compare
  // the prose against the PROBE COUNT, which made "calling all N endpoints"
  // true-by-construction: a hand-written list that had fallen behind the routes
  // simply lowered N, and the docs followed it down. That is what happened —
  // the docs read 49 while the system had 62, and three files disagreed
  // (CLAUDE.md said both 49 and 59).
  //
  // The prose says ENDPOINTS, so it is now checked against endpoints. The
  // audit's own completeness is enforced where it belongs: audit-access.js
  // compares its probe list to this same parser at run time and exits non-zero
  // on any endpoint that is neither probed nor explicitly exempt.
  const endpointCount = () => require('../scripts/system-map').routes().length;

  // TWO KINDS OF DOCUMENT, checked differently — the distinction is the point.
  //
  // A REFERENCE describes the system as it is now, so every endpoint number in
  // it must be current. A LOG records what was true on a date: "audit:access
  // clean at 68 endpoints" inside a dated verification block was true when it
  // was written, and rewriting it would falsify the record — the same call §102
  // made about a historical audit rollup.
  //
  // So references get the WIDE scan below and logs keep the narrow one, which
  // only catches the present-tense "calling all N endpoints" phrasing.
  const REFERENCE_DOCS = [
    'CLAUDE.md',
    path.join('docs', 'PERMISSIONS.md'),
    path.join('docs', 'SECURITY.md'),
    path.join('docs', 'PROJECT_GUIDE.md'),
    // Added 2026-09-16. It is the documented ENTRY POINT — reading order and a
    // "before you say you're done" command block — and it had been quoting 5
    // backend and 2 frontend suites against a real 58 and 22.
    path.join('docs', 'README_FOR_CLAUDE_CODE.md'),
    // The two front doors, added the same day they were written. This list has
    // now been too short THREE times (SECURITY.md and PROJECT_GUIDE.md in §108,
    // README_FOR_CLAUDE_CODE.md above), so a new reference page goes in here
    // when it is created, not after it has gone stale.
    'README.md',
    path.join('docs', 'README.md'),
  ];
  const LOG_DOCS = [
    path.join('docs', 'DESIGN_DECISIONS.md'),
    path.join('docs', 'SILENT_FAILURES.md'),
  ];
  const DOCS = [...REFERENCE_DOCS, ...LOG_DOCS];

  it('audit-access.js still has a readable ROUTES list', () => {
    // A floor, so a parser that stops matching cannot make the check below pass
    // by comparing zero against zero.
    expect(probeCount()).toBeGreaterThan(20);
  });

  it('the route parser still finds routes', () => {
    // The same floor for the other side of the comparison.
    expect(endpointCount()).toBeGreaterThan(20);
  });

  it('the audit probes at least as many entries as there are endpoints to cover', () => {
    // Not an equality: some endpoints are probed twice (as SELF and as OTHER)
    // and seven are exempt from role-boundary testing, so the two numbers are
    // not meant to match. What would be alarming is the probe list falling far
    // BELOW the endpoint count, which is exactly the drift this section missed
    // for weeks. audit:access enforces the precise version at run time.
    expect(probeCount()).toBeGreaterThanOrEqual(endpointCount() - 10);
  });

  // THE PHRASE SCAN, added 2026-09-14 after five stale claims survived the
  // narrow check below. That one only matched "calling all N endpoints", so
  // "67/67 proven live", "the other 63 endpoints", "67 endpoints x 4 roles"
  // and two more went unnoticed when the count moved 68 -> 66 — and
  // SECURITY.md and PROJECT_GUIDE.md were not even in the list being scanned.
  //
  // EXPLICIT PHRASINGS, not a proximity window. The first attempt matched any
  // number within a few characters of "endpoint" and duly flagged "§42", the
  // day part of a 2026-09-12 date, and "27 role-boundary write endpoints" —
  // which is a real and different count. Enumerating the phrasings costs a
  // line when somebody invents a new one, and that is the right cost.
  //
  // `n - 1` is allowed because "the other N endpoints" means every endpoint
  // except the single throttled one, and that sentence is worth keeping.
  const TOTAL_PHRASES = [
    /all\s+(\d{2,3})\s+endpoints/gi,
    /the other\s+(\d{2,3})\s+endpoints/gi,
    /(\d{2,3})\s*\/\s*\d{2,3}\s+proven/gi,
    /(\d{2,3})\s+endpoints\s*(?:x|×)/gi,
    /(\d{2,3})\s+endpoints\s+probed/gi,
    /clean at\s+(\d{2,3})\s+endpoints/gi,
  ];

  it('no REFERENCE document quotes a stale endpoint count', () => {
    const n = endpointCount();
    const allowed = new Set([n, n - 1]);
    const wrong = [];
    for (const rel of REFERENCE_DOCS) {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      for (const re of TOTAL_PHRASES) {
        for (const m of src.matchAll(re)) {
          if (!allowed.has(Number(m[1]))) {
            wrong.push(`${rel}: "${m[0]}" — code declares ${n}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('the phrase scan can actually find something', () => {
    // The canary. A regex set that silently stops matching would make the
    // check above pass against any prose at all — §56.3, where a route parser
    // found 15 of 59 endpoints and rendered a perfectly plausible table.
    const sample = `calling all 99 endpoints, the other 98 endpoints, 97/97 proven,`
      + ` 96 endpoints x 4 roles, 95 endpoints probed, clean at 94 endpoints`;
    const hits = TOTAL_PHRASES.flatMap((re) => [...sample.matchAll(re)].map((m) => Number(m[1])));
    expect(hits.sort((a, b) => b - a)).toEqual([99, 98, 97, 96, 95, 94]);
  });
  it('no document claims a different number of audited endpoints', () => {
    const n = endpointCount();
    const wrong = [];
    for (const rel of DOCS) {
      const file = path.join(ROOT, rel);
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      // "calling all 46 endpoints" / "call all 46 endpoints" / "calling 46 endpoints"
      for (const m of src.matchAll(/calling?(?:\s+all)?\s+(\d+)\s+endpoints/g)) {
        if (Number(m[1]) !== n) wrong.push(`${rel} says ${m[1]} endpoints; the code declares ${n}`);
      }
    }
    // If this fails, decide which is right FIRST. Adding a route to the audit is
    // the usual answer; editing the prose to match a shrunken list is only right
    // when the endpoint genuinely went away.
    expect(wrong).toEqual([]);
  });

  // EVERY OTHER GENERATED COUNT, checked the same way (2026-09-16).
  //
  // §108 widened the endpoint scan and stopped at endpoints. The lesson did not
  // generalise, and it should have: every number below is derived from code and
  // quoted in prose, so every one drifts exactly the way the endpoint count did.
  // Four of them had, by the time this was written:
  //
  //   PROJECT_GUIDE.md          "npx jest  # 5 suites" / "# 2 suites"   (58 / 22)
  //   PROJECT_GUIDE.md          "npm run mutate (47 guards)", x3        (60)
  //   README_FOR_CLAUDE_CODE.md "# 5 suites" / "# 2 suites"             (58 / 22)
  //   CLAUDE.md                 "all 138 columns"                       (144)
  //
  // The suite counts are the ones worth pausing on. Both files put them in a
  // block headed "before you say you're done" — so a reader ran the command,
  // saw 58 where the page promised 5, and had nothing to tell them which number
  // was wrong. That is the endpoint defect again, in the document that teaches
  // people how to verify this project.
  const countFiles = (dir, re) => {
    if (!fs.existsSync(dir)) return 0;
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        n += countFiles(path.join(dir, e.name), re);
      } else if (re.test(e.name)) n += 1;
    }
    return n;
  };

  // Phrasings are ENUMERATED, never a proximity window — §108.3, where "any
  // number near the word endpoint" duly flagged "§42" and the day part of a
  // date. `all N columns` rather than `N columns` for the same reason:
  // PROJECT_GUIDE legitimately says a query names "~11 columns", which is a
  // different and correct number.
  const GENERATED_COUNTS = [
    {
      what: 'backend test suites',
      // Matches what jest reports (58/58 when written) because this package's
      // testMatch is tests/*.test.js and nothing else.
      measure: () => countFiles(path.join(ROOT, 'backend', 'tests'), /\.test\.js$/),
      phrases: [/(\d{1,3})\s+backend\s+suites/gi],
    },
    {
      what: 'frontend test suites',
      measure: () => countFiles(path.join(ROOT, 'frontend', 'src'), /\.test\.tsx?$/),
      phrases: [/(\d{1,3})\s+frontend\s+suites/gi],
    },
    {
      what: 'mutation guards',
      measure: () => (fs.readFileSync(
        path.join(__dirname, '..', 'scripts', 'mutation-check.js'), 'utf8',
      ).match(/^\s*find:/gm) || []).length,
      phrases: [/(\d{1,3})\s+guards/gi],
    },
    {
      what: 'model columns',
      // From SYSTEM_MAP.md, which is GENERATED from the models and held current
      // by systemMap.test.js — so this compares one doc against a code-derived
      // artefact, not against another sentence somebody typed. Reading the
      // models directly here would build a Sequelize instance at import time.
      measure: () => {
        const map = fs.readFileSync(path.join(ROOT, 'docs', 'SYSTEM_MAP.md'), 'utf8');
        const m = map.match(/\*\*(\d+)\s+columns\*\*/);
        expect(m).toBeTruthy();
        return Number(m[1]);
      },
      phrases: [/all\s+(\d{2,3})\s+columns/gi],
    },
  ];

  it('no REFERENCE document quotes a stale generated count', () => {
    const wrong = [];
    for (const c of GENERATED_COUNTS) {
      const n = c.measure();
      for (const rel of REFERENCE_DOCS) {
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) continue;
        const src = fs.readFileSync(file, 'utf8');
        for (const re of c.phrases) {
          for (const m of src.matchAll(re)) {
            if (Number(m[1]) !== n) {
              wrong.push(`${rel}: "${m[0].trim()}" — code declares ${n} ${c.what}`);
            }
          }
        }
      }
    }
    // As above: decide which side is right before editing either.
    expect(wrong).toEqual([]);
  });

  it('every generated count is measurable, and its phrases can find something', () => {
    // TWO canaries in one. A measure that silently returned 0, or a phrase set
    // that stopped matching, would make the check above pass against any prose
    // at all — the §56.3 failure, where a parser found 15 of 59 routes and
    // rendered a perfectly plausible table.
    for (const c of GENERATED_COUNTS) {
      expect(c.measure()).toBeGreaterThan(0);
      const sample = `77 backend suites, 77 frontend suites, 77 guards, all 77 columns`;
      const hits = c.phrases.flatMap((re) => [...sample.matchAll(re)].map((m) => Number(m[1])));
      expect(hits).toContain(77);
    }
  });

  it('the reference docs actually contain the counts being guarded', () => {
    // Without this, deleting every sentence would also make the scan pass.
    // Each count must be quoted SOMEWHERE in the reference set.
    for (const c of GENERATED_COUNTS) {
      const found = REFERENCE_DOCS.some((rel) => {
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) return false;
        const src = fs.readFileSync(file, 'utf8');
        // matchAll, not test(): these patterns carry /g, and `test` advances
        // lastIndex, so a second call against the same regex starts mid-string
        // and can answer false about a document that plainly contains it.
        return c.phrases.some((re) => [...src.matchAll(re)].length > 0);
      });
      expect(`${c.what}: ${found}`).toBe(`${c.what}: true`);
    }
  });
});
