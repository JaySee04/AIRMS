// Activity log — who changed what, for work transparency.
//
// Read-only by construction: there is no POST, PATCH or DELETE here and none
// anywhere else. Rows are written by utils/audit.js from the routes that
// perform the actions, and only ever read back through this file.
const express = require('express');
const { Op } = require('sequelize');
const { AuditLog } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

// Actions the UI offers as filters, with the wording it shows. Kept here beside
// the route so a new audited action is declared in exactly one place.
const ACTION_LABELS = {
  'screening.import': 'Screening imported',
  'screening.override': 'Risk band overridden',
  'athlete.injury': 'Injury status changed',
  'norm.restore': 'Norm set restored',
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

module.exports = router;
