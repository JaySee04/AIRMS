// TEMPORARY DIAGNOSTIC — to be reverted once it has answered its question.
//
// THE QUESTION. SILENT_FAILURES 3r established that the rate limiter's
// post-response decrement never landed on the hosted API. It did NOT establish
// why, and two mechanisms produce exactly that symptom while implying opposite
// fixes:
//
//   (a) the invocation is FROZEN once the response is flushed, so anything
//       scheduled for afterwards never executes. Then `postImport`'s
//       `setTimeout(flush, 1500).unref()` is doomed too, and running that work
//       inside the request is necessary.
//
//   (b) `res.on('finish')` never FIRES, because the platform hands the handler
//       a wrapped response object. Then the callback was never called at all,
//       ordinary timers are unaffected, and the postImport change is a
//       performance cost buying nothing.
//
// I have been asserting (a) in three documents without measuring it. This
// settles it.
//
// THE EXPERIMENT. One request schedules a write by each of three mechanisms and
// returns immediately. A LATER request reports which of them actually reached
// the database:
//
//   inflight  started DURING the handler, not awaited   — the CONTROL. If this
//             is missing, the write path itself is broken and the other two
//             results mean nothing.
//   finish    written from a `res.on('finish')` handler — the 3r shape exactly.
//   timer     written from `setTimeout(..., 1500).unref()` — the postImport shape.
//
// Rows are keyed under `diag:` in `settings`. `getSettings()` ignores unknown
// keys by construction, so they are invisible to the admin Settings page and to
// every consumer of institution settings — the same property the clinician
// watchlist relies on (§66).
//
// Admin-only, writes nothing an operator would see, reversible by deleting
// three rows.
const express = require('express');
const { Setting } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { sendError } = require('../utils/httpError');

const router = express.Router();

const KEYS = {
  inflight: 'diag:deferred:inflight',
  finish: 'diag:deferred:finish',
  timer: 'diag:deferred:timer',
};

// Same fire-and-forget contract as the audit writer: never allowed to affect
// the response it is describing.
function mark(key, runId) {
  Setting.upsert({ key, value: { runId, at: new Date().toISOString() } })
    // eslint-disable-next-line no-console
    .catch((e) => console.error(`[diag] ${key} write failed:`, e.message));
}

router.get('/deferred', auth, rbac('admin'), async (req, res) => {
  try {
    // What a PREVIOUS run managed to record. Read before this run overwrites.
    const rows = await Setting.findAll({ where: { key: Object.values(KEYS) }, raw: true });
    const seen = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const previous = Object.fromEntries(
      Object.entries(KEYS).map(([name, key]) => [name, seen[key] || null]),
    );

    const runId = `run-${Date.now()}`;

    // (control) started during the handler — the shape recordAudit uses, which
    // is already known to survive.
    mark(KEYS.inflight, runId);

    // (a) the 3r shape: scheduled for after the response is flushed.
    res.on('finish', () => mark(KEYS.finish, runId));

    // (b) the postImport shape: an unref'd timer.
    const t = setTimeout(() => mark(KEYS.timer, runId), 1500);
    if (t.unref) t.unref();

    res.json({
      runId,
      previous,
      note: 'call again after ~10s; `previous` then shows which mechanisms landed',
    });
  } catch (err) { sendError(res, err, 'diag.js'); }
});

// Remove the three rows, so the experiment leaves nothing behind.
router.delete('/deferred', auth, rbac('admin'), async (req, res) => {
  try {
    const removed = await Setting.destroy({ where: { key: Object.values(KEYS) } });
    res.json({ removed });
  } catch (err) { sendError(res, err, 'diag.js'); }
});

module.exports = router;
