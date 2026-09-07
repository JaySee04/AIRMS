// The test run happens in UTC, not in whatever zone the developer is sitting in.
//
// WHY THIS EXISTS. `lib/dates.ts` renders every institutional date in
// `INSTITUTION_TZ` (Asia/Kuala_Lumpur) rather than the viewer's zone. Its test
// was written, passed, and was then shown by mutation testing to be nearly
// worthless: deleting `timeZone: INSTITUTION_TZ` from the formatters — the exact
// defect the module exists to fix — was caught by nothing at all.
//
// The reason is that the development machine's own zone IS Asia/Kuala_Lumpur.
// A formatter that falls back to the system default produces byte-identical
// output there, so "the zone is stated explicitly" and "the zone happens to
// match" are indistinguishable. The assertions would have stayed green until the
// code ran somewhere else — which is exactly where it runs: the hosted API
// process is UTC.
//
// Setting TZ inside the test file does not work, and that is worth recording
// because it looks like it should. Jest initialises the environment before the
// test module is evaluated, so by the time an assignment in the file runs, the
// zone is already resolved; the meta-assertion in dates.test.ts caught this
// attempt too. globalSetup runs in the main process BEFORE the workers fork, so
// the variable is inherited by every worker.
//
// Running the whole suite in a fixed zone is the right default regardless: a
// test whose result depends on where the developer is sitting is not a test.
module.exports = async () => {
  process.env.TZ = 'UTC';
};
