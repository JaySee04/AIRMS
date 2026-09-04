// TEMPORARY — one-shot schema migration, to be REMOVED once applied.
//
// ── why this exists at all ──────────────────────────────────────────────────
//
// The hosted database's credentials are marked Sensitive on the `airms-api`
// Vercel project, which makes them write-only: `vercel env pull` returns the
// literal string "[SENSITIVE]" and nobody — CLI, API, dashboard or account
// owner — can read them back (docs/DEPLOY.md). Only the running function gets
// the real values.
//
// So a migration that must touch the hosted database cannot be driven from a
// development machine. It has to run where the credentials already are, which
// is here. JC chose this route on 2026-09-04 over pasting a production
// connection string into a terminal.
//
// ── why it is safe enough to exist briefly ──────────────────────────────────
//
//   * admin only, on top of the usual auth middleware, which re-reads the user
//     row every request so a deactivated account cannot call it;
//   * it runs utils/screeningUniqueIndex.js — the SAME function the CLI runs,
//     not a second copy — which is idempotent and REFUSES rather than
//     half-applying if duplicate rows exist, naming them instead;
//   * it adds an index and nothing else. There is no DROP, no DELETE, no
//     UPDATE and no user-supplied SQL anywhere in the path;
//   * GET reports the current state without changing anything, so the result
//     can be confirmed independently of the POST that produced it;
//   * it is audited, so the trail shows who ran it and when.
//
// ── REMOVE THIS ─────────────────────────────────────────────────────────────
//
// Delete this file and its `app.use('/api/migrate', ...)` line in server.js as
// soon as the index is confirmed present. A permanent endpoint that alters
// schema is not something this system should carry, and the whole argument
// above rests on it being short-lived. tests/httpHardening.test.js pins that
// removal so it cannot be forgotten quietly.

const express = require('express');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { sequelize } = require('../models');
const { recordAudit } = require('../utils/audit');
const { sendError } = require('../utils/httpError');
const {
  INDEX, applyScreeningUniqueIndex, indexPresent, duplicates,
} = require('../utils/screeningUniqueIndex');

const router = express.Router();

// GET /api/migrate/screening-unique — report, change nothing.
router.get('/screening-unique', auth, rbac('admin'), async (_req, res) => {
  try {
    const rows = await indexPresent(sequelize);
    const dupes = rows.length ? [] : await duplicates(sequelize);
    res.json({
      index: INDEX,
      present: rows.length > 0,
      columns: rows.sort((a, b) => a.Seq_in_index - b.Seq_in_index).map((r) => r.Column_name),
      duplicateGroups: dupes.length,
    });
  } catch (err) { sendError(res, err, 'migrate.js'); }
});

// POST /api/migrate/screening-unique — apply it. Idempotent.
router.post('/screening-unique', auth, rbac('admin'), async (req, res) => {
  try {
    const result = await applyScreeningUniqueIndex(sequelize);
    // Audited even when it was already present: "somebody ran the migration and
    // it was a no-op" is exactly what a reviewer wants to be able to see.
    recordAudit(req, {
      action: 'settings.update',
      entity: 'schema',
      entityId: INDEX,
      summary: `screenings unique index: ${result.status}`,
    });
    // A refusal is a 409: the request was understood and the database is not in
    // a state where it can be honoured.
    res.status(result.status === 'refused' ? 409 : 200).json(result);
  } catch (err) { sendError(res, err, 'migrate.js'); }
});

module.exports = router;
