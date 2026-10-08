// THE COUNTS MUST AGREE WITH THE ROSTER THEY SUMMARISE (§147)
//
// `/athletes/meta/counts` exists so a profile page can show three integers
// without downloading 44.2 KB of roster to count client-side (§139's shape, a
// second time). The risk it introduces is the one every derived aggregate
// carries: it can disagree with the thing it summarises, and a disagreement
// between "62 athletes under care" and a roster showing 61 is the kind of wrong
// answer that looks like a right one.
//
// The scope is what makes them agree — `isActive: true`, identical to
// `GET /athletes` and `/meta/roster` — so that is what these pin, by driving the
// real router against a mocked model and checking the WHERE clauses rather than
// trusting the numbers to line up by luck.
const express = require('express');
const request = require('supertest');

jest.mock('../src/middleware/auth', () => (req, _res, next) => {
  req.user = { id: 1, role: 'admin', name: 'Admin', permissions: null };
  next();
});
jest.mock('../src/middleware/rbac', () => () => (_req, _res, next) => next());
// The module is `permission.js`; `requirePermission` is the name it is imported
// under. Mocking the import name rather than the file resolves to nothing — and
// a jest.mock that matches nothing throws here rather than silently passing.
jest.mock('../src/middleware/permission', () => () => (_req, _res, next) => next());

const calls = [];
jest.mock('../src/models', () => ({
  Athlete: {
    count: jest.fn(async (opts) => { calls.push(opts); return calls.length * 10; }),
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findByPk: jest.fn(async () => null),
  },
  AthleteDiscipline: { findAll: jest.fn(async () => []) },
  Screening: { findAll: jest.fn(async () => []), findOne: jest.fn(async () => null) },
  MuscleFlag: { findAll: jest.fn(async () => []) },
  CohortThreshold: { findAll: jest.fn(async () => []) },
  Setting: { findAll: jest.fn(async () => []), findOne: jest.fn(async () => null) },
  AuditLog: { create: jest.fn(async () => ({})), findAll: jest.fn(async () => []) },
  User: { findByPk: jest.fn(async () => null), findAll: jest.fn(async () => []) },
  sequelize: { transaction: jest.fn(), fn: jest.fn(), col: jest.fn(), literal: jest.fn() },
}));

const { Op } = require('sequelize');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/athletes', require('../src/routes/athletes'));
  return a;
}

beforeEach(() => { calls.length = 0; });

describe('GET /athletes/meta/counts', () => {
  test('answers 200 with the four tiles a profile shows', async () => {
    const res = await request(app()).get('/api/athletes/meta/counts');
    expect(res.status).toBe(200);
    for (const k of ['active', 'screened', 'awaiting', 'sports']) {
      expect(typeof res.body[k]).toBe('number');
    }
  });

  test('counts ONLY active athletes — the same scope as the roster', async () => {
    // If this drifts, the profile tile and the roster disagree about who is on
    // it, which is exactly what a summary must never do.
    await request(app()).get('/api/athletes/meta/counts');
    expect(calls.length).toBe(3);
    for (const opts of calls) {
      expect(opts.where.isActive).toBe(true);
    }
  });

  test('"screened" means a reading exists, not a reading above zero', async () => {
    // The pages it replaced counted `overallActivityScore != null`. A `> 0` here
    // would silently drop a genuine zero — §54's rule that an unknown value and
    // a real 0 are different things, on the field the tile is about.
    await request(app()).get('/api/athletes/meta/counts');
    const screened = calls.find((c) => c.where.overallActivityScore);
    expect(screened).toBeTruthy();
    expect(screened.where.overallActivityScore).toEqual({ [Op.ne]: null });
  });

  test('counts sports DISTINCTLY, or every athlete is a sport', async () => {
    await request(app()).get('/api/athletes/meta/counts');
    const sports = calls.find((c) => c.col === 'sport');
    expect(sports).toBeTruthy();
    expect(sports.distinct).toBe(true);
  });

  test('awaiting is derived, so it cannot contradict active and screened', async () => {
    const res = await request(app()).get('/api/athletes/meta/counts');
    expect(res.body.awaiting).toBe(res.body.active - res.body.screened);
  });
});
