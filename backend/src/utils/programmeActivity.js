// Programme Activity — the administrator's own performance view, gathered once.
//
// How many athletes were tested per period, which way population scores moved,
// what happens between an athlete's own successive tests, and how far the roster
// has been covered.
//
// Extracted from routes/athletes.js when the same figures had to appear in a
// downloadable PDF. Two code paths computing "the programme's KPIs" would be free
// to disagree, and the report is precisely the artefact someone files or signs
// off — the page and the document must not be able to quote different numbers.

const { Op } = require('sequelize');
const { Screening, Athlete, AthleteDiscipline } = require('../models');
const { screeningPeriods, GRAINS } = require('./screeningPeriods');

// The scope filters, as a sentence — for the PDF cover and the page's own note,
// so a printed copy says who it is about.
function scopeLabel(query = {}) {
  const parts = [];
  if (query.sport) parts.push(String(query.sport));
  if (query.program) parts.push(String(query.program));
  if (query.gender) parts.push(String(query.gender));
  if (query.discipline) parts.push(String(query.discipline));
  if (query.ageMin || query.ageMax) parts.push(`age ${query.ageMin || '0'}-${query.ageMax || '+'}`);
  if (query.from || query.to) parts.push(`${query.from ? `from ${query.from}` : ''}${query.to ? ` to ${query.to}` : ''}`.trim());
  return parts.length ? parts.join(' · ') : 'Whole institute, all time';
}

async function programmeActivityData(query = {}) {
  const {
    grain = 'quarter', sport, program, gender, discipline, ageMin, ageMax, from, to,
  } = query;
  if (!GRAINS.includes(String(grain))) {
    const err = new Error(`grain must be one of: ${GRAINS.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const where = { isActive: true };
  if (sport) where.sport = sport;
  if (program) where.program = program;
  if (gender) where.gender = gender;
  if (ageMin || ageMax) {
    where.age = {};
    if (ageMin) where.age[Op.gte] = Number(ageMin);
    if (ageMax) where.age[Op.lte] = Number(ageMax);
  }

  // Discipline is a separate table, so narrow the roster by a subquery on the
  // athletes who compete in it rather than joining every screening row.
  if (discipline) {
    const inDiscipline = await AthleteDiscipline.findAll({
      where: { discipline }, attributes: ['athleteId'], raw: true,
    });
    where.athleteId = { [Op.in]: inDiscipline.map((d) => d.athleteId) };
  }

  const roster = await Athlete.findAll({ where, attributes: ['athleteId'], raw: true });
  const ids = roster.map((r) => r.athleteId);
  const scope = scopeLabel(query);

  if (!ids.length) {
    return {
      grain,
      periods: [],
      betweenTests: null,
      seasonality: null,
      coverage: {
        rostered: roster.length, tested: 0, untested: roster.length, tests: 0,
      },
      scope,
    };
  }

  const scrWhere = { athleteId: { [Op.in]: ids } };
  if (from || to) {
    scrWhere.assessedAt = {};
    if (from) scrWhere.assessedAt[Op.gte] = new Date(from);
    if (to) scrWhere.assessedAt[Op.lte] = new Date(to);
  }
  const rows = await Screening.findAll({
    where: scrWhere,
    attributes: [
      'id', 'athleteId', 'assessedAt', 'totalScore', 'rom', 'stability', 'symmetry',
      'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand',
    ],
    order: [['assessedAt', 'ASC'], ['id', 'ASC']],
    raw: true,
  });

  const result = screeningPeriods(rows, { grain });
  const tested = new Set(rows.map((r) => r.athleteId)).size;
  return {
    ...result,
    // Coverage is the roster measured against the WINDOW, so a narrow from/to
    // correctly shows athletes as untested in that window.
    coverage: {
      rostered: roster.length,
      tested,
      untested: Math.max(0, roster.length - tested),
      tests: rows.length,
    },
    scope,
  };
}

module.exports = { programmeActivityData, scopeLabel };
