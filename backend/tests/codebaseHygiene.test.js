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
