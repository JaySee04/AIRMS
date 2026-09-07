// A clinician's personal watchlist — Module 6's last deferred item.
//
// Every route here addresses `req.user` and nothing else. There is deliberately
// NO path by which one account reads or edits another's list, for the same
// reason `notify_prefs` has none: it is a working note about the person looking,
// and an administrator editing a clinician's list would be changing what that
// clinician sees without telling them.
//
// Storage, and why it is the settings table rather than a user column, is
// explained in utils/watchlist.js. It needs no migration, which is what lets
// this ship to a deployment whose database cannot be migrated from here.

const express = require('express');
const { Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { canDownloadIndividualReport, notFoundStatusFor } = require('../utils/permissions');
const { getWatchlist, addToWatchlist, removeFromWatchlist } = require('../utils/watchlist');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// medical and admin only, and the exclusions are the interesting part.
//
// `athlete` has exactly one record; a shortcut to it is the page they are
// already on.
//
// `coach` was in this list and was REMOVED after the access audit flagged it.
// The audit's headline property is that **no read-only role completed a write**,
// and coach is read-only by a locked decision (MASTER_CLARIFICATIONS §12). A
// watchlist is a write — to the caller's own preference rather than to
// institutional data, which is a fair distinction, but making it would introduce
// the first exemption to a check whose whole value is that it has none. A panel
// asking "is the coach read-only?" would get a qualified answer where a crisp
// one used to exist. That is a bad trade for a convenience feature.
//
// `executive` likewise: its remit is institutional oversight, not a caseload,
// and it has no write reach anywhere by design.
//
// Extending to coach is this one line plus an audit-script category for
// preference writes — deliberately left as a decision for JC rather than taken
// here, because it changes what a locked role means.
const ROLES = ['medical', 'admin'];

// GET /api/watchlist — the caller's own list, with enough of each athlete to
// render a row without a second request per entry.
router.get('/', auth, rbac(...ROLES), async (req, res) => {
  try {
    const ids = await getWatchlist(req.user.id);
    if (!ids.length) return res.json({ athletes: [] });

    const rows = await Athlete.findAll({
      where: { athleteId: ids },
      attributes: ['athleteId', 'name', 'sport', 'isActive', 'isInjured'],
      raw: true,
    });
    const byId = new Map(rows.map((r) => [r.athleteId, r]));

    // Filtered by SCOPE on the way out, not only on the way in. A coach who is
    // reassigned to another sport keeps rows they may no longer see, and the
    // list must not become a way to read names outside their remit.
    //
    // Order follows the stored list, so the reader's own ordering survives.
    // An id whose athlete no longer exists is dropped silently: a deleted
    // athlete is not an error the watching clinician can act on.
    const athletes = ids
      .map((id) => byId.get(id))
      .filter((a) => a && canDownloadIndividualReport(req.user, a))
      .map((a) => ({
        athleteId: a.athleteId,
        name: a.name,
        sport: a.sport,
        isActive: a.isActive !== false,
        isInjured: Boolean(a.isInjured),
      }));
    res.json({ athletes });
  } catch (err) { sendError(res, err, 'watchlist.js'); }
});

// POST /api/watchlist/:athleteId — start watching.
router.post('/:athleteId', auth, rbac(...ROLES), async (req, res) => {
  try {
    const athlete = await Athlete.findOne({
      where: { athleteId: req.params.athleteId }, attributes: ['athleteId', 'sport'], raw: true,
    });
    // Same status a foreign athlete gets for a scoped role (§43): answering 404
    // for an unknown id and 403 for a real one lets a coach separate the two.
    if (!athlete) return res.status(notFoundStatusFor(req.user)).json({ message: 'Athlete not found' });
    if (!canDownloadIndividualReport(req.user, athlete)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const ids = await addToWatchlist(req.user.id, athlete.athleteId);
    res.json({ watching: true, count: ids.length });
  } catch (err) { sendError(res, err, 'watchlist.js'); }
});

// DELETE /api/watchlist/:athleteId — stop watching.
//
// No existence or scope check: removing an id from your own list cannot disclose
// anything, and a coach reassigned out of a sport must still be able to clear
// entries they can no longer see. Refusing here would leave them stuck.
router.delete('/:athleteId', auth, rbac(...ROLES), async (req, res) => {
  try {
    const ids = await removeFromWatchlist(req.user.id, req.params.athleteId);
    res.json({ watching: false, count: ids.length });
  } catch (err) { sendError(res, err, 'watchlist.js'); }
});

module.exports = router;
