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
const {
  rankRoster, changesSince, resolveCutoff, headline,
} = require('../utils/decisionSupport');
const { getSettings } = require('../utils/settings');
const { sendError } = require('../utils/httpError');
const { num: numParam, str, assertPlainQuery } = require('../utils/queryParams');

const router = express.Router();

// Who may SEE a worklist. `executive` is deliberately absent, on exactly the
// §51 reasoning: oversight of the institution is the analytics and the three
// PDFs, and a per-athlete worklist is a clinical record in list form. The
// capability is not lost, it is funnelled through the audited report path.
const VIEW_ROLES = ['medical', 'admin', 'coach', 'athlete'];

// Who may record a CLINICAL RESPONSE to an escalation (§103). Must stay in step
// with the rbac list on POST /screenings/:id/response, which is the actual
// enforcement; this only decides whether the athlete page draws the control.
const RESPOND_ROLES = ['medical', 'admin'];

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

    // The caller's own "I last looked" moment, held in THEIR browser.
    //
    // Remembering it server-side would be a write, and `coach` is read-only by a
    // locked decision — the watchlist hit that wall and lost. Letting the caller
    // hold it means every role gets the feature, including the read-only one.
    // Filtering only: it narrows a set they could already request in full.
    const since = str(req.query.since, 'since');
    const now = Date.now();
    const { cutoff, basis } = resolveCutoff({ windowDays, since, now });

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

    const worklist = rankRoster(withScreening, { dueDays }).map((w) => {
      const pair = byAthlete.get(w.athleteId) || [];
      const screeningId = pair[0] ? pair[0].id : null;
      const s = pair[0];
      return {
        ...w,
        screeningId,
        // The INSTITUTION's answer (§103). Recorded on the athlete's own page;
        // the queue only reports it.
        //
        // The note is deliberately NOT sent. This payload is the roster-scale
        // worklist, and clinical free text about every flagged athlete does not
        // belong on a list view — it is on the athlete's own record.
        responseOutcome: s ? (s.responseOutcome ?? null) : null,
        responseBy: s ? (s.responseBy ?? null) : null,
        responseAt: s ? (s.responseAt ?? null) : null,
      };
    });

    const changes = changesSince(
      roster.map((r) => {
        const pair = byAthlete.get(r.athleteId) || [];
        return {
          athleteId: r.athleteId, name: r.name, latest: pair[0] || null, previous: pair[1] || null,
        };
      }),
      { windowDays, since, now },
    );

    // Everything flagged is open. The private "reviewed" tick that used to
    // narrow this was removed (§107) — it let a reader empty their own queue
    // without opening a single record.
    const open = worklist;
    res.json({
      scope: label,
      windowDays,
      // What the change list ACTUALLY covers, reported rather than left for the
      // page to infer. 'since' honoured the caller's marker, 'clamped' pulled a
      // stale one forward to the 90-day floor, 'window' means no usable marker
      // and the rolling window applied. The panel prints a different sentence
      // for each — a page that guessed would eventually tell a clinician it was
      // showing "everything since you last looked" when it was not.
      changesBasis: basis,
      changesFrom: new Date(cutoff).toISOString(),
      // Same roles as marking today, and a SEPARATE flag on purpose: these
      // gate different acts (a private tick versus an audited clinical record),
      // and one flag serving both would silently change who can do which if
      // either list ever moves. The authority is POST /screenings/:id/response,
      // which enforces it server-side; this only decides whether to draw the
      // control.
      canRecordResponse: RESPOND_ROLES.includes(req.user.role),
      headline: headline(open, req.user.role),
      worklist,
      changes,
    });
  } catch (err) { sendError(res, err, 'decisions.js'); }
});


module.exports = router;
