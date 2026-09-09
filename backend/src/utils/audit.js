const { AuditLog } = require('../models');
const logger = require('./logger');
const { setSetting } = require('./settings');

// Record one auditable action.
//
// Fire-and-forget by design: an audit write must never be able to fail the
// operation it is describing. If logging throws — table missing on an older dev
// DB, JSON too large, connection blip — the import or norm edit the user asked
// for still succeeds and we complain to the server console instead. The
// alternative (awaiting it inside the caller's transaction) means a broken audit
// table takes the whole app down, which trades a smaller problem for a bigger
// one.
//
// The cost of that choice, stated plainly: a lost audit row USED TO BE silent
// to the user. That is the right trade for transparency logging, and the wrong
// one for anything the institution must be able to prove.
//
// CHANGED 2026-09-10, and the change is deliberately NOT "make it blocking".
//
// The argument for awaiting it inside the caller's transaction is that
// `athlete.view` is the stated justification for leaving medical staff
// unscoped (§51): clinical cover is not organised by sport, so the answer to
// "why can any clinician open any record" is accountability rather than
// restriction — and that answer only holds if the accountability actually
// exists. A silently dropped row weakens a live viva argument.
//
// The argument against is stronger: a broken audit table would then take down
// the clinical read it describes. Refusing a physiotherapist an athlete's
// record because a logging table is full is a worse failure than an incomplete
// trail, and it is the failure that happens at 8am before a session.
//
// So the SILENCE goes, not the non-blocking property. Failures are counted,
// logged structurally so they can be alerted on, and surfaced to the
// administrator — the same shape §35 used for scheduled mail, where every send
// worked and none could be OBSERVED. A trail with a visible hole is honest; a
// trail with an invisible one is worse than no trail, because it is trusted.
function recordAudit(req, { action, entity = null, entityId = null, summary = null, meta = null }) {
  const user = req && req.user ? req.user : {};
  AuditLog.create({
    actorId: user.id ?? null,
    // Copied, not joined — see the model comment.
    actorName: user.name ?? null,
    actorRole: user.role ?? null,
    action,
    entity,
    entityId: entityId === null || entityId === undefined ? null : String(entityId),
    summary: summary ? String(summary).slice(0, 500) : null,
    meta,
  }).catch((e) => {
    noteFailure(action, e);
  });
}

// ── Making a lost row visible ───────────────────────────────────────────────
//
// In-process first, because it is the only counter that still works when the
// database is the thing that is broken — which is the most likely reason an
// audit write failed in the first place. Persisting is then attempted as a
// best effort, so the count survives a restart when the fault was narrower
// (the table missing, a meta payload too large).
const failures = { count: 0, lastAction: null, lastError: null, lastAt: null };

function noteFailure(action, err) {
  failures.count += 1;
  failures.lastAction = action;
  failures.lastError = err && err.message ? String(err.message).slice(0, 300) : 'unknown';
  failures.lastAt = new Date().toISOString();

  // Structured, so `event:"audit.write_failed"` is an alert condition rather
  // than a line in a wall of text. The ACTION is safe to log — it is a verb
  // like `athlete.view`, not the athlete. The logger redacts anything else.
  logger.error('audit.write_failed', { action, err: failures.lastError });

  // Best effort, and explicitly swallowed: if this throws we are already in the
  // failure path and the in-process counter above has the answer.
  setSetting(FAILURE_KEY, {
    count: failures.count,
    lastAction: action,
    lastError: failures.lastError,
    lastAt: failures.lastAt,
  }).catch(() => {});
}

const FAILURE_KEY = 'audit_write_failures';

/**
 * What the administrator is shown. Null when nothing has failed, so the tile
 * stays absent rather than reassuring — an "audit healthy" badge that is only
 * ever green teaches people not to read it.
 */
function auditFailures() {
  return failures.count === 0 ? null : { ...failures };
}

/** Test seam: reset the in-process counter. */
function resetAuditFailures() {
  failures.count = 0;
  failures.lastAction = null;
  failures.lastError = null;
  failures.lastAt = null;
}

module.exports = {
  recordAudit, auditFailures, resetAuditFailures, FAILURE_KEY,
};
