// WHICH GROUND-TRUTH ROWS ARE ALLOWED TO FAIL? (§146)
//
// `verify:textlayer` runs the HoloMotion ground-truth comparator and relays its
// table. Exactly one row fails BY DESIGN: the Summary presence check, because
// the text-layer path DECLINES the Summary rather than emitting the
// letter-spaced mush an earlier version produced (§112/§70).
//
// The script used to swallow that row by ignoring the comparator's exit code
// entirely:
//
//     process.exit(behaviourFailures ? 1 : (run.status === null ? 1 : 0));
//
// Every non-null status maps to 0, so the ground-truth comparison was computed,
// printed in red, and discarded. Measured: forcing `mobility` to 42 made the
// comparator exit 1 with a failing row, and verify:textlayer still exited 0.
// The guard standing between an "exact" import and a wrong clinical number
// could not fail.
//
// The predicate lives here, apart from the script, so jest can reach it: the
// script needs a real PDF and a subprocess, so an inverted predicate — one that
// treats every row as expected — would restore the original defect in silence.

// The only row the text-layer path is permitted to fail, and only when the
// Summary was genuinely declined rather than read.
const EXPECTED_DECLINE = 'summary read';

/**
 * Row names the comparator marked FAIL, read from its printed table.
 *
 * Line-based on purpose. The first version used one regex with the `m` flag
 * (`^\s+(\S.*?)\s{2,}.*✗\s*FAIL\s*$`) and matched a row ending in "✓ PASS",
 * reporting a clean report as broken — a check that cries wolf is on its way to
 * being ignored, which is how the original defect survived.
 */
function failedRows(stdout) {
  return String(stdout ?? '')
    .split(/\r?\n/)
    .filter((line) => line.includes('✗') && /\bFAIL\b/.test(line))
    .map((line) => line.trim().split(/\s{2,}/)[0].trim())
    .filter(Boolean);
}

/**
 * Of those, the ones that are NOT the sanctioned Summary decline.
 *
 * @param {string} stdout   the comparator's output
 * @param {boolean} declined  whether the Summary was genuinely declined
 */
function unexpectedDivergences(stdout, declined) {
  return failedRows(stdout).filter((row) => !(row === EXPECTED_DECLINE && declined));
}

/**
 * The verdict. `status` is the comparator's exit code; `null` means it never
 * ran, which must never read as clean (rule 2).
 */
function shouldFail({ behaviourFailures, stdout, declined, status }) {
  return Boolean(behaviourFailures)
    || unexpectedDivergences(stdout, declined).length > 0
    || status === null;
}

module.exports = {
  EXPECTED_DECLINE, failedRows, unexpectedDivergences, shouldFail,
};
