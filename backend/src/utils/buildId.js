// WHICH CODE IS THIS PROCESS ACTUALLY RUNNING?
//
// THE DEFECT CLASS. Twice in one day, measurements were taken against a build
// that was not the code being read:
//
//   1. §113 — the hosted API had been broken for six days because the deployed
//      build predated a migration. Every probe reasoned about it from the
//      WORKING TREE ("INDICATOR_ATTRS names those columns"), which was true of
//      the source and false of the thing answering. Settled in the end by
//      asking information_schema, which cannot be fooled that way.
//   2. §116.5 — a restart failed on a port the previous server still held, so
//      an "after" measurement came from the "before" build and reported no
//      change. Caught only because byte-identical output had no reason to be.
//
// Both are gotcha 1 generalised past ports: a running instance is a claim about
// code, and nothing was checking it. This makes the claim answerable — the
// process reports a fingerprint of the source it loaded, and a probe compares
// that against the tree it is reading.
//
// WHAT IS HASHED: every .js under backend/src, by CONTENT, sorted by path. Not
// mtime (a checkout rewrites those and says nothing about content), not the git
// SHA (the working tree is usually dirty, and a deployed bundle has no .git).
//
// LINE ENDINGS ARE NORMALISED FIRST, and that is not cosmetic: .gitattributes
// checks this repo out with `eol=lf`, so a Windows working copy holds CRLF and
// the deployed bundle holds LF. Hashing raw bytes would make every local/hosted
// comparison differ for a reason that has nothing to do with the code, which is
// precisely the false alarm that gets a check switched off.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Fingerprint one directory tree. EXPORTED so the rules below can be tested
 * against the real implementation rather than a copy of it.
 *
 * The first version of this lived inline and the test re-implemented it over a
 * temp directory. Every assertion passed and `npm run mutate` reported the
 * CRLF-normalisation guard as SURVIVED — correctly: breaking the production
 * function could not fail a test that never called it. A test that reimplements
 * its subject is testing the reimplementation.
 */
function hashTree(dir) {
  const h = crypto.createHash('sha256');
  for (const f of walk(dir).sort()) {
    // The path goes in too, so moving a file changes the answer — a rename is
    // a change to what runs even when every byte survives.
    h.update(path.relative(dir, f).replace(/\\/g, '/'));
    h.update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex').slice(0, 12);
}

/**
 * How many files went into the digest.
 *
 * Reported because the digest ALONE cannot explain a mismatch, and one showed up
 * immediately: after the 2026-10-01 deploy, local read 3b23ee218b83 and hosted
 * read 9e862a04c0c3 for what is byte-identical source. Line-ending
 * normalisation — the thing this file says makes local and hosted comparable —
 * cannot account for that.
 *
 * The likely reason is that a serverless build ships only the files its tracer
 * reached, so `walk(src)` sees a different SET on each side. A bare pair of
 * mismatched hashes cannot distinguish "different code" from "same code, fewer
 * files", and those need opposite responses. The count makes that visible.
 */
function fileCount(dir = SRC) {
  return walk(dir).length;
}

/**
 * The COMMIT this build came from, when the platform will say.
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA on every deployment, which is a far better
 * answer than a content digest for "is the deployed instance current": it
 * survives bundling, it needs no file-set agreement, and it is exactly what a
 * reader wants to compare against `git rev-parse`.
 *
 * Locally there is no such variable and the working tree is usually dirty, so
 * this returns null rather than a commit that would describe the last commit
 * instead of the files actually loaded — which is the precise confusion the
 * content digest exists to avoid. Null means "ask the digest".
 */
function commitSha() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null;
  return sha ? String(sha).slice(0, 12) : null;
}

let cached = null;

/**
 * A short, stable fingerprint of the backend source this process loaded.
 *
 * Computed ONCE. The files cannot change under a running process in any way
 * that matters — nodemon restarts it — and a boot-time cost paid per request
 * would be a strange price for a diagnostic.
 *
 * Returns `'unknown'` rather than throwing if the tree cannot be read. A
 * fingerprint is a diagnostic; it must never be the reason a server fails to
 * start, and a probe that sees `unknown` is told plainly it cannot compare.
 */
function buildId() {
  if (cached) return cached;
  try {
    cached = hashTree(SRC);
  } catch {
    cached = 'unknown';
  }
  return cached;
}

module.exports = {
  buildId, hashTree, fileCount, commitSha,
};
