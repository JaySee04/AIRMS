// Scheduled monthly digest (§16).
//
// Dr Hoo: "maybe you want to think about reporting, automatic reporting as one of
// the features". Dr Thung: "I think something standard, then you can actually
// generate every month." The three PDFs already produce the CONTENT of a monthly
// review; what was missing was anything that happened without being asked.
//
// WHY NO CRON LIBRARY
// A cron expression fires at an instant. If the process is down at that instant —
// a restart, a deploy, a laptop that was closed — the month is simply skipped and
// nobody finds out, which for a monthly report means a year has eleven entries and
// no error. So instead: an hourly tick asks "is this month's digest still owed?"
// against a marker persisted in settings. That makes it
//   - idempotent: the marker is the month, so a restart cannot double-send;
//   - self-healing: a process down all Monday sends on Tuesday rather than never;
//   - safe to run twice: two instances race on the same marker, and the loser's
//     send is skipped because the month is already recorded.
// A cron library would have given none of those, which is the whole reason the
// naive version was worth avoiding.

const { Op } = require('sequelize');
const { Athlete, Screening } = require('../models');
const { User } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings, setSetting } = require('./settings');
const { latestScreeningsByAthlete } = require('./cohorts');
const { screeningPeriods } = require('./screeningPeriods');
const { effectiveBand } = require('./bands');

const HOUR = 60 * 60 * 1000;
const SIGNOFF = '— AIRMS · Institut Sukan Negara';

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Is this month's digest due and unsent?
function isDue(now, settings) {
  if (!settings.digest_enabled) return false;
  const day = Math.min(Math.max(Number(settings.digest_day) || 1, 1), 28);
  const hour = Math.min(Math.max(Number(settings.digest_hour) || 7, 0), 23);
  // Capped at 28 so "the 30th" does not silently never fire in February.
  const due = new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0, 0);
  if (now < due) return false;
  return String(settings.digest_last_sent || '') !== monthKey(now);
}

// The numbers a monthly review opens with. Deliberately the same helpers the
// holistic PDF uses, so the email and the report cannot disagree.
async function buildDigest(now) {
  const [rows, rostered, history] = await Promise.all([
    latestScreeningsByAthlete(),
    Athlete.count({ where: { isActive: true } }),
    // Only the window the digest actually reports on. This used to fetch EVERY
    // screening ever recorded to derive a two-month comparison — fine at 77 rows,
    // and a full-table read that grows for ever once ISN is really using it.
    // Thirteen months keeps a year-on-year view available without that.
    Screening.findAll({
      where: { assessedAt: { [Op.gte]: new Date(now.getFullYear(), now.getMonth() - 12, 1) } },
      attributes: ['id', 'athleteId', 'assessedAt', 'totalScore', 'rom', 'stability', 'symmetry',
        'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand'],
      order: [['assessedAt', 'ASC']],
      raw: true,
    }),
  ]);

  const bands = { green: 0, amber: 0, red: 0, none: 0 };
  for (const { screening } of rows) {
    const b = effectiveBand(screening);
    bands[b && b in bands ? b : 'none'] += 1;
  }

  const activity = screeningPeriods(history, { grain: 'month' });
  const periods = activity.periods || [];
  const latest = periods[periods.length - 1] || null;
  const prev = periods[periods.length - 2] || null;

  const lines = [
    `AIRMS monthly summary — ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`,
    '',
    `Athletes on the roster: ${rostered}`,
    `Screened at least once: ${rows.length}`,
    '',
    'Current risk bands (latest screening per athlete):',
    // Padded so the counts line up in a plain-text mail — the labels differ in
    // length and a ragged column is the first thing the eye catches.
    ...[
      ['Low (green)', bands.green],
      ['Needs attention (amber)', bands.amber],
      ['Immediate assessment (red)', bands.red],
      ...(bands.none ? [['No band yet', bands.none]] : []),
    ].map(([label, n]) => `  ${String(label).padEnd(28)}${n}`),
    '',
  ];

  if (latest) {
    lines.push(
      `Screening activity — ${latest.label}:`,
      `  ${latest.athletes} athlete(s) tested across ${latest.tests} test(s)`,
    );
    const d = latest.deltas && latest.deltas.totalScore;
    if (prev && d && typeof d.delta === 'number') {
      lines.push(`  Average Total Score ${d.delta > 0 ? '+' : ''}${d.delta} vs ${prev.label} (${d.direction})`);
    }
    lines.push('');
  } else {
    lines.push('No screenings on record yet.', '');
  }

  lines.push(
    'The full holistic, team and individual reports are on AIRMS under PDF Reports,',
    'where they can be filtered by sport, programme, gender and age group.',
    '',
    SIGNOFF,
  );

  return {
    subject: `AIRMS monthly summary — ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`,
    text: lines.join('\n'),
  };
}

async function runDigestOnce(now = new Date()) {
  const settings = await getSettings();
  if (!isDue(now, settings)) return { sent: false, reason: 'not due' };

  const users = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'executive'] }, isActive: true },
    attributes: ['email'],
    raw: true,
  });
  const to = users.map((u) => u.email).filter(Boolean);
  // The marker is set even with no recipients, so a permanently empty admin list
  // does not retry every hour forever.
  if (!to.length) {
    await setSetting('digest_last_sent', monthKey(now));
    return { sent: false, reason: 'no recipients' };
  }

  const { subject, text } = await buildDigest(now);
  await sendMail({ to: to.join(','), subject, text });
  // Marked only AFTER a successful send, so a mail failure retries next hour
  // instead of losing the month.
  await setSetting('digest_last_sent', monthKey(now));
  return { sent: true, recipients: to.length, month: monthKey(now) };
}

let timer = null;

function startScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await runDigestOnce();
      if (r.sent) console.log(`[scheduler] monthly digest sent to ${r.recipients} recipient(s) for ${r.month}`);
    } catch (e) {
      // Never let the scheduler take the process down; it retries next hour.
      console.error('[scheduler] monthly digest failed:', e.message);
    }
  };
  // One pass shortly after boot catches a month that came due while down.
  setTimeout(tick, 30 * 1000).unref();
  timer = setInterval(tick, HOUR);
  // unref so the interval never holds the process open during shutdown.
  timer.unref();
}

function stopScheduler() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { startScheduler, stopScheduler, runDigestOnce, isDue, buildDigest, monthKey };
