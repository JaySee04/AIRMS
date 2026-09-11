// GET /api/decisions — the worklist, the headline and what moved.
//
// One endpoint rather than three, because all three are views of one ranking
// (utils/decisionSupport.js) and splitting them would let a dashboard show a
// headline that disagreed with the list beneath it.
//
// SCOPE IS THE VIEWER'S, NOT A PARAMETER. A coach gets their own sport and
// cannot ask for another; medical and admin get the institution. Deriving scope
// from `req.user` rather than the query means there is no scope parameter to
// forget to validate — the §43 lesson, where a coach could separate a real IC
// number from an invented one because the check came after the lookup.
const express = require('express');
const { Op } = require('sequelize');
const { Athlete, Screening } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { INDICATOR_ATTRS, toIndicator } = require('../utils/indicatorPayload');
const { rankRoster, changesSince, headline } = require('../utils/decisionSupport');
const { getReviewed, markReviewed, clearReviewed, isReviewed } = require('../utils/reviewed');
const { getSettings } = require('../utils/settings');
const { sendError } = require('../utils/httpError');
const { num: numParam, assertPlainQuery } = require('../utils/queryParams');

const router = express.Router();

// Who may SEE a worklist. `executive` is deliberately absent, on exactly the
// §51 reasoning: oversight of the institution is the analytics and the three
// PDFs, and a per-athlete worklist is a clinical record in list form. The
// capability is not lost, it is funnelled through the audited report path.
const VIEW_ROLES = ['medical', 'admin', 'coach', 'athlete'];

// Who may MARK one reviewed. A write, so `coach` is absent — read-only by a
// LOCKED decision (MASTER_CLARIFICATIONS §12). The watchlist hit this exact
// wall and the lock was kept in preference to the feature; the same answer
// applies here, and `npm run audit:access` enforces it.
const MARK_ROLES = ['medical', 'admin'];

const MAX_WINDOW_DAYS = 90;

/** The rows this viewer is allowed to reason about. */
async function scopeFor(user) {
  const where = { isActive: true };
  if (user.role === 'coach') {
    if (!user.coachSport) return { where: null, label: null };
    where.sport = user.coachSport;
    return { where, label: user.coachSport };
  }
  if (user.role === 'athlete') {
    if (!user.athleteId) return { where: null, label: null };
    where.athleteId = user.athleteId;
    return { where, label: 'you' };
  }
  return { where, label: 'the institution' };
}

router.get('/', auth, rbac(...VIEW_ROLES), requirePermission('viewRecords'), async (req, res) => {
  try {
    assertPlainQuery(req.query);
    const windowDays = numParam(req.query.windowDays, 'windowDays') ?? 7;
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > MAX_WINDOW_DAYS) {
      return res.status(400).json({ message: `"windowDays" must be a whole number between 1 and ${MAX_WINDOW_DAYS}` });
    }

    const { where, label } = await scopeFor(req.user);
    if (!where) return res.json({ scope: null, headline: null, worklist: [], changes: [] });

    const roster = await Athlete.findAll({
      where, attributes: ['athleteId', 'name', 'sport', 'isInjured'], raw: true,
    });
    const ids = roster.map((r) => r.athleteId);
    if (!ids.length) return res.json({ scope: label, headline: null, worklist: [], changes: [] });

    const { rescreen_due_days: dueDays } = await getSettings();

    // One ordered fetch, newest first, keeping the two most recent per athlete:
    // the latest drives the worklist, the pair drives "what changed". Same
    // batching as the roster band query — a per-athlete round trip here would
    // cost one query per squad member.
    const rows = await Screening.findAll({
      where: { athleteId: { [Op.in]: ids } },
      attributes: ['athleteId', ...INDICATOR_ATTRS],
      order: [['assessedAt', 'DESC'], ['id', 'DESC']],
      raw: true,
    });
    const byAthlete = new Map();
    for (const s of rows) {
      const seen = byAthlete.get(s.athleteId) || [];
      if (seen.length < 2) { seen.push(s); byAthlete.set(s.athleteId, seen); }
    }

    const withScreening = roster.map((r) => {
      const pair = byAthlete.get(r.athleteId) || [];
      return { ...r, screening: pair[0] ? toIndicator(pair[0], dueDays) : null };
    });

    const reviewedMap = await getReviewed(req.user.id);
    const worklist = rankRoster(withScreening, { dueDays }).map((w) => {
      const pair = byAthlete.get(w.athleteId) || [];
      const screeningId = pair[0] ? pair[0].id : null;
      return {
        ...w,
        screeningId,
        // Keyed on the SCREENING: a tick taken in July must not silence an
        // athlete whose September import went red.
        reviewed: isReviewed(reviewedMap, w.athleteId, screeningId),
      };
    });

    const changes = changesSince(
      roster.map((r) => {
        const pair = byAthlete.get(r.athleteId) || [];
        return {
          athleteId: r.athleteId, name: r.name, latest: pair[0] || null, previous: pair[1] || null,
        };
      }),
      { windowDays },
    );

    // The headline describes what is still OPEN, so working the queue empties
    // it — otherwise "see 3 next" would stare back after all three were done.
    const open = worklist.filter((w) => !w.reviewed);
    res.json({
      scope: label,
      windowDays,
      canMarkReviewed: MARK_ROLES.includes(req.user.role),
      headline: headline(open, req.user.role),
      worklist,
      changes,
    });
  } catch (err) { sendError(res, err, 'decisions.js'); }
});

// Marking is scoped to the caller: there is deliberately no route by which one
// account can tick another's list, for the same reason there is none for
// notification preferences.
router.post('/reviewed/:athleteId', auth, rbac(...MARK_ROLES), requirePermission('viewRecords'), async (req, res) => {
  try {
    const screeningId = req.body && req.body.screeningId;
    if (screeningId === undefined || screeningId === null || String(screeningId).trim() === '') {
      // Required on purpose: a tick with no screening attached could never
      // expire, and would silence the athlete for ever.
      return res.status(400).json({ message: 'screeningId is required — a review is of one screening, not of an athlete.' });
    }
    // The athlete must EXIST before a tick is stored against them. Without this
    // the endpoint accepted any string and quietly filled the reader's map with
    // keys naming nobody — `npm run audit:access` caught it by aiming the write
    // at a deliberately invalid id and getting 200 where the convention is that
    // an allowed role reaches "not found" instead of changing anything.
    const athlete = await Athlete.findOne({
      where: { athleteId: req.params.athleteId }, attributes: ['athleteId'], raw: true,
    });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });

    const map = await markReviewed(req.user.id, athlete.athleteId, screeningId);
    res.json({ reviewed: Object.keys(map).length });
  } catch (err) { sendError(res, err, 'decisions.js'); }
});

router.delete('/reviewed/:athleteId', auth, rbac(...MARK_ROLES), requirePermission('viewRecords'), async (req, res) => {
  try {
    const map = await clearReviewed(req.user.id, req.params.athleteId);
    res.json({ reviewed: Object.keys(map).length });
  } catch (err) { sendError(res, err, 'decisions.js'); }
});

module.exports = router;
