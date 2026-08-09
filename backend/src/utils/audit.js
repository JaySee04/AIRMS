const { AuditLog } = require('../models');

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
// The cost of that choice, stated plainly: a lost audit row is silent to the
// user. That is the right trade for transparency logging, and the wrong one for
// anything the institution must be able to prove. If AIRMS ever needs the
// latter, this becomes an awaited write inside the caller's transaction.
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
    console.error(`[audit] failed to record "${action}":`, e.message);
  });
}

module.exports = { recordAudit };
