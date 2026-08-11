// Activity log — who changed what, for work transparency.
//
// Read-only by construction: there is no POST, PATCH or DELETE here and none
// anywhere else. Rows are written by utils/audit.js from the routes that
// perform the actions, and only ever read back through this file.
const express = require('express');
const { Op } = require('sequelize');
const { AuditLog, Screening } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// Actions the UI offers as filters, with the wording it shows. Kept here beside
// the route so a new audited action is declared in exactly one place.
const ACTION_LABELS = {
  'screening.import': 'Screening imported',
  'screening.override': 'Risk band overridden',
  'screening.reinstate': 'Screening reinstated',
  'athlete.injury': 'Injury status changed',
  'norm.restore': 'Norm set restored',
  'norm.pin': 'Norm set pinned',
  'norm.unpin': 'Norm pin released',
  'norm.member': 'Norm membership changed',
  'settings.update': 'Norm settings changed',
};

// GET /api/audit — newest first, with optional action / actor / date filtering.
//
// Admin AND executive: the executive exists to see how the institution is being
// run without being able to change it, which is precisely this page. It stays
// closed to medical and coach, who see their own athletes rather than everyone's
// administrative activity.
router.get('/', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    const where = {};
    if (req.query.action && ACTION_LABELS[req.query.action]) where.action = req.query.action;
    if (req.query.actorId) where.actorId = Number(req.query.actorId) || 0;
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(String(req.query.from));
      // `to` is a calendar day, so include everything up to its final moment
      // rather than midnight — otherwise "to: today" silently drops today.
      if (req.query.to) {
        const end = new Date(String(req.query.to));
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const { rows, count } = await AuditLog.findAndCountAll({
      where, order: [['createdAt', 'DESC']], limit, offset: Math.max(Number(req.query.offset) || 0, 0),
    });

    res.json({
      total: count,
      entries: rows.map((r) => ({
        _id: String(r.id),
        at: r.createdAt,
        actor: r.actorName || 'Unknown',
        actorRole: r.actorRole || null,
        action: r.action,
        actionLabel: ACTION_LABELS[r.action] || r.action,
        entity: r.entity,
        entityId: r.entityId,
        summary: r.summary,
        meta: r.meta || null,
      })),
      actions: Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/audit/staff — per-account activity for a window, with the same window
// immediately before it for comparison. "Who did what, how much, and is it going
// up or down."
//
// Two sources on purpose, because neither alone is honest:
//   - the audit log, which is complete from the day logging was added but knows
//     nothing before it;
//   - Screening.importedBy, which covers EVERY screening ever committed.
// Reporting screening counts from the audit log alone would silently undercount
// every import made before the log existed, so the response says where each
// number came from and from when the log is complete.
// Per-account activity for a window plus the equal window before it. Extracted
// from the route so the PDF export computes it the same way rather than growing a
// second, drifting copy.
async function staffActivity({ from: fromQ, to: toQ } = {}) {
  const to = toQ ? new Date(String(toQ)) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = fromQ ? new Date(String(fromQ)) : new Date(to.getTime() - 29 * 864e5);
  from.setHours(0, 0, 0, 0);
  // The preceding window of identical length — otherwise "progress" compares a
  // fortnight against a quarter and calls the difference performance.
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span - 1);
  const prevTo = new Date(from.getTime() - 1);

  const tally = async (a, b) => {
    const rows = await AuditLog.findAll({
      where: { createdAt: { [Op.gte]: a, [Op.lte]: b } },
      attributes: ['actorName', 'actorRole', 'action'],
      raw: true,
    });
    const by = new Map();
    for (const r of rows) {
      const name = r.actorName || 'Unknown';
      if (!by.has(name)) by.set(name, { actor: name, role: r.actorRole || null, total: 0, byAction: {} });
      const e = by.get(name);
      e.total += 1;
      e.byAction[r.action] = (e.byAction[r.action] || 0) + 1;
    }
    return by;
  };

  const [cur, prev] = await Promise.all([tally(from, to), tally(prevFrom, prevTo)]);

  // Screenings committed in the window, straight from the screenings table —
  // complete for all time, unlike the log.
  const screenings = await Screening.findAll({
    where: { createdAt: { [Op.gte]: from, [Op.lte]: to } },
    attributes: ['importedBy'],
    raw: true,
  });
  const imports = {};
  for (const sc of screenings) imports[sc.importedBy || 'Unknown'] = (imports[sc.importedBy || 'Unknown'] || 0) + 1;

  const first = await AuditLog.findOne({ order: [['createdAt', 'ASC']], attributes: ['createdAt'], raw: true });

  const staff = [...new Set([...cur.keys(), ...Object.keys(imports)])]
    // Seeded rows are not people.
    .filter((name) => !/^seed/i.test(name))
    .map((name) => {
      const c = cur.get(name);
      const p = prev.get(name);
      return {
        actor: name,
        role: c?.role ?? null,
        actions: c?.total ?? 0,
        previousActions: p?.total ?? 0,
        change: (c?.total ?? 0) - (p?.total ?? 0),
        byAction: c?.byAction ?? {},
        screeningsImported: imports[name] ?? 0,
      };
    })
    .sort((a, b) => (b.actions + b.screeningsImported) - (a.actions + a.screeningsImported));

  return Object.assign(staff, {
    meta: {
      window: { from, to },
      previousWindow: { from: prevFrom, to: prevTo },
      logCompleteFrom: first ? first.createdAt : null,
    },
  });
}

// GET /api/audit/staff — the same figures for the on-screen table.
router.get('/staff', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    const staff = await staffActivity(req.query);
    res.json({
      ...staff.meta,
      actionLabels: ACTION_LABELS,
      staff: [...staff],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
// Shared with the PDF export so the wording has ONE definition — a log that
// says 'Screening imported' on screen and something else on paper is worse
// than either alone.
module.exports.ACTION_LABELS = ACTION_LABELS;
module.exports.staffActivity = staffActivity;
