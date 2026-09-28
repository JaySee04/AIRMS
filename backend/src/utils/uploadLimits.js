// HOW BIG A REPORT THIS INSTALLATION CAN ACTUALLY ACCEPT.
//
// THE PROBLEM, MEASURED. Real HoloMotion exports are far larger than the
// samples this project was built on:
//
//   thung.pdf (compact, 12p)      1.02 MB
//   the three demo reports        2.05 – 2.11 MB
//   nazwan.pdf (38p)              7.58 MB
//   a real 38p report             13.67 MB
//
// 12 of the 15 expanded reports measured are 7.7–13.2 MB. The backend accepts
// 20 MB, so all of them are fine on a server AIRMS actually runs on — and the
// HOSTED deployment is not one: a Vercel serverless function's request body is
// capped by the PLATFORM at 4.5 MB, and the request is refused before any code
// in this repository sees it. Nothing in the app can raise that; multer is
// never reached, so multer's limit is irrelevant there.
//
// WHAT THIS FILE IS FOR, THEN. Not to raise the cap — it cannot — but to stop
// the difference being invisible. Until now the cap was a sentence in
// DEPLOY.md, and the failure was a platform error page the uploader could not
// interpret: the operator saw a generic failure on a file that works perfectly
// on the install their institution will actually run.
//
// So the limit is DERIVED from the environment, reported by
// `GET /upload/screening/pdf/status`, and the uploader refuses an oversize file
// BEFORE spending a minute pushing it at a host that will drop it. One
// definition, because a client-side check and a server-side one that disagree
// is how you get a file rejected by the browser that the server would have
// taken, or the reverse.
//
// NOT A WORKAROUND FOR THE PLATFORM CAP. Making a 13 MB report importable on
// Vercel needs a different upload route entirely — direct-to-blob, or slicing
// the PDF in the browser — both of which are dependency decisions and neither
// of which is here. What IS here is that the operator is told which install to
// use, and that ISN's own server has no such problem.

// Vercel's documented request-body limit for a serverless function. Stated as
// bytes rather than "4.5 MB" because the check is on `file.size` and a rounded
// megabyte would refuse files the platform would have accepted.
const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024;

// What multer is configured with — the ceiling on a host with no platform limit
// in front of it. Kept here so the route and the status endpoint cannot drift.
const SELF_HOSTED_LIMIT = 20 * 1024 * 1024;

/**
 * The largest upload this process can actually receive, in bytes.
 *
 * `AIRMS_MAX_UPLOAD_BYTES` overrides both, for a deployment sitting behind a
 * reverse proxy with its own body limit — nginx's default `client_max_body_size`
 * is 1 MB, which would refuse every report, and an institution's IT department
 * is more likely to set that than to tell anybody.
 */
function maxUploadBytes(env = process.env) {
  const override = Number(env.AIRMS_MAX_UPLOAD_BYTES);
  if (Number.isFinite(override) && override > 0) return override;
  // The platform cap applies whether or not this code agrees with it, so it
  // wins over the multer limit rather than being the smaller of the two by
  // accident.
  if (env.VERCEL) return VERCEL_BODY_LIMIT;
  return SELF_HOSTED_LIMIT;
}

/**
 * For a human: "13.7 MB". One decimal, because 0.1 MB matters at this scale.
 *
 * `round` exists because of a sentence this file got wrong. A 4.54 MB file
 * against a 4.5 MB cap rendered as "This report is 4.5 MB and this server
 * accepts 4.5 MB" — a refusal that contradicts itself, and the operator's next
 * move is to report a bug in the uploader. Found by the test asserting the two
 * renderings differ.
 *
 * So the file size rounds UP and the limit rounds DOWN: both stay true, and the
 * two numbers can never print equal when the file is genuinely over.
 */
function mb(bytes, round = 'nearest') {
  const v = Number(bytes) / (1024 * 1024);
  const f = round === 'up' ? Math.ceil(v * 10) / 10
    : round === 'down' ? Math.floor(v * 10) / 10
      : v;
  return `${f.toFixed(1)} MB`;
}

/**
 * What to tell the operator about a file that is too large.
 *
 * The second sentence is the point and is why this is not a generic "file too
 * large": on a hosted instance the remedy is not to shrink the report — it is
 * to use the installation that has no such limit, which for ISN is the one on
 * their own server. Saying only "too large" invites somebody to re-export the
 * report at lower quality and lose the data.
 */
function tooLargeMessage(size, limit = maxUploadBytes(), env = process.env) {
  const head = `This report is ${mb(size, 'up')} and this server accepts ${mb(limit, 'down')}.`;
  if (env.VERCEL) {
    return `${head} The limit is the hosting platform's, not AIRMS's — the full-size `
      + 'report imports normally on an installation running on your own server '
      + '(see docs/DEPLOY_ISN.md). A compact 12-page export is small enough to use here.';
  }
  return `${head} Raise AIRMS_MAX_UPLOAD_BYTES if this server should accept more, `
    + 'and check any reverse proxy in front of it for its own body limit.';
}

module.exports = {
  maxUploadBytes, tooLargeMessage, mb, VERCEL_BODY_LIMIT, SELF_HOSTED_LIMIT,
};
