// Import-commit email alerts (redesign spec §9). When a newly-imported
// screening leaves an athlete at amber/red (or escalated), email the medical
// staff and the coaches assigned to that athlete's sport — so they assess
// immediately rather than letting the finding sit. Reuses utils/mailer.js
// (env SMTP, console fallback in dev). The body includes the escalation
// `factors` already computed at commit time (utils/overallIndicator.js), so
// the recipient sees WHY the band fired without opening AIRMS first.

const { User, Athlete, Screening } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const { BAND_RANK, BAND_LABEL, effectiveBand } = require('./bands');

// email → the flagged athletes that recipient should see. Medical staff cover
// the whole institute so they get everything; a coach gets only their own sport.
//
// Pure and exported purely so it can be tested: "who gets told about whom" is the
// part of this file that would break silently, and the rest of alertMany needs a
// database to run at all.
function groupByRecipient(flagged, medicalEmails, coaches) {
  const out = new Map();
  const add = (email, item) => {
    if (!email) return;
    if (!out.has(email)) out.set(email, []);
    // A coach who is also somehow listed twice must not receive the athlete twice.
    if (!out.get(email).includes(item)) out.get(email).push(item);
  };
  for (const item of flagged) {
    for (const e of medicalEmails) add(e, item);
    for (const c of coaches) {
      if (c && c.coachSport && item.athlete && c.coachSport === item.athlete.sport) add(c.email, item);
    }
  }
  return out;
}

// Batch form — one settings read, one recipients read, IN-queries for the
// athletes/screenings, then ONE EMAIL PER RECIPIENT covering every athlete they
// need to see.
//
// It used to send one email per flagged athlete. Importing 15 PDFs that all
// landed amber meant 15 separate emails into every medical inbox, and 15
// sequential SMTP round-trips. The burst was already coalesced one layer up —
// queuePostImport debounces so N commits produce ONE recompute — and that
// batching simply stopped short of the mailer. An alert that arrives 15 times
// gets filtered, which makes the feature worse than useless.
//
// Medical staff see every flagged athlete; a coach sees only their own sport's,
// so the grouping is per recipient rather than one blast to everyone.
async function alertMany(athleteIds) {
  const ids = [...new Set(athleteIds)].filter(Boolean);
  if (!ids.length) return [];

  const settings = await getSettings();
  if (!settings.alerts_enabled) return ids.map((id) => ({ athleteId: id, sent: false, reason: 'alerts disabled' }));
  const threshold = settings.alert_on_band || 'amber';

  const [athletes, screenings, users] = await Promise.all([
    Athlete.findAll({ where: { athleteId: ids }, raw: true }),
    Screening.findAll({ where: { athleteId: ids }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true }),
    User.findAll({ where: { role: ['medical', 'coach'], isActive: true }, attributes: ['email', 'role', 'coachSport'], raw: true }),
  ]);
  const athleteBy = new Map(athletes.map((a) => [a.athleteId, a]));
  const latestBy = new Map();
  for (const s of screenings) if (!latestBy.has(s.athleteId)) latestBy.set(s.athleteId, s);
  const medicalEmails = users.filter((u) => u.role === 'medical').map((u) => u.email).filter(Boolean);
  const coaches = users.filter((u) => u.role === 'coach' && u.coachSport);

  // Pass 1: decide who is flagged, and why. No mail yet.
  const flagged = [];
  const results = [];
  for (const id of ids) {
    const athlete = athleteBy.get(id);
    if (!athlete) { results.push({ athleteId: id, sent: false, reason: 'no athlete' }); continue; }
    const s = latestBy.get(id);
    if (!s) { results.push({ athleteId: id, sent: false, reason: 'no screening' }); continue; }

    const band = effectiveBand(s);
    if (!band || BAND_RANK[band] < BAND_RANK[threshold]) {
      results.push({ athleteId: id, sent: false, reason: 'below alert threshold', band });
      continue;
    }
    flagged.push({
      athlete,
      band,
      indicator: s.overallIndicator,
      escalations: s.escalations,
      // The escalation reasons are already computed and stored at commit time
      // (utils/overallIndicator.js) — surfaced so the recipient sees WHY
      // without opening AIRMS first.
      factors: Array.isArray(s.factors) ? s.factors : [],
    });
  }
  if (!flagged.length) return results;

  // Worst first: a red buried under six ambers is the one thing that must not
  // be missed in a digest.
  flagged.sort((a, b) => (BAND_RANK[b.band] - BAND_RANK[a.band])
    || a.athlete.name.localeCompare(b.athlete.name));

  // Pass 2: group by recipient. Medical get everything; each coach gets their
  // own sport only.
  const perRecipient = groupByRecipient(flagged, medicalEmails, coaches);

  const sentFor = new Set();
  for (const [email, items] of perRecipient) {
    const worst = items.some((i) => i.band === 'red') ? 'red' : 'amber';
    const subject = items.length === 1
      ? `AIRMS alert — ${items[0].athlete.name} (${items[0].athlete.athleteId}): ${BAND_LABEL[items[0].band]}`
      : `AIRMS alert — ${items.length} athletes flagged: ${BAND_LABEL[worst]}`;

    const lines = [];
    if (items.length === 1) {
      // Single finding keeps the full detail it always had — a digest format for
      // one athlete would be a step backwards.
      const it = items[0];
      const a = it.athlete;
      lines.push(
        `Screening alert for ${a.name} (${a.athleteId})`, '',
        `Sport: ${a.sport} · Programme: ${a.program} · ${a.gender ?? ''}`,
        `A new HoloMotion screening places this athlete at: ${BAND_LABEL[it.band]}.`,
        `Overall risk indicator: ${it.indicator ?? '—'}/100 vs cohort · ${it.escalations} escalation(s).`, '',
      );
      if (it.factors.length) lines.push('Why:', ...it.factors.map((f) => `  - ${f}`), '');
      lines.push(it.band === 'red'
        ? 'This athlete is flagged for immediate assessment. Please review before the next high-load session.'
        : 'This athlete needs attention. Please review at the next opportunity.');
    } else {
      lines.push(
        `${items.length} athletes were flagged by the latest screening import.`, '',
      );
      for (const it of items) {
        const a = it.athlete;
        lines.push(
          `${BAND_LABEL[it.band]} — ${a.name} (${a.athleteId})`,
          `  ${a.sport} · ${a.program}${a.gender ? ` · ${a.gender}` : ''} · indicator ${it.indicator ?? '—'}/100 · ${it.escalations} escalation(s)`,
        );
        for (const f of it.factors) lines.push(`    - ${f}`);
        lines.push('');
      }
      lines.push(items.some((i) => i.band === 'red')
        ? 'Athletes marked Immediate assessment should be reviewed before the next high-load session.'
        : 'Please review these athletes at the next opportunity.');
    }
    lines.push('', 'Open AIRMS → Athlete Dashboard to review the full screening and, after assessment, set the risk band.', '', '— AIRMS · Institut Sukan Negara');

    await sendMail({ to: email, subject, text: lines.join('\n') });
    for (const it of items) sentFor.add(it.athlete.athleteId);
  }

  // Per-athlete summary is kept: the caller discards it today, but "which
  // athletes did we alert on" is the useful answer, not "which emails went out".
  for (const it of flagged) {
    results.push({
      athleteId: it.athlete.athleteId,
      sent: sentFor.has(it.athlete.athleteId),
      band: it.band,
      reason: sentFor.has(it.athlete.athleteId) ? undefined : 'no recipients',
    });
  }
  return results;
}

// Single-athlete form (kept for direct callers/scripts). Same contract as
// before: non-fatal, returns a small summary.
async function alertIfNeeded(athleteId) {
  const [result] = await alertMany([athleteId]);
  return result || { sent: false, reason: 'no athlete id' };
}

module.exports = { alertIfNeeded, alertMany, groupByRecipient };
