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
const { renderHolisticPdf } = require('./holisticReport');
const { recipientsFor } = require('./mailPrefs');
const { rescreenRecall } = require('./programmeActivity');

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
async function buildDigest(now, { attached = false } = {}) {
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

  // The wording follows what actually got attached. Claiming an attachment that
  // is not there sends the reader looking for a file, and is exactly the kind of
  // small lie that costs a report its credibility.
  lines.push(
    ...(attached
      ? ['The Holistic Screening Report for the whole institute is attached.']
      : ['The Holistic Screening Report could not be generated for this email —',
        'it is still available on AIRMS under PDF Reports.']),
    'Team and individual reports, and holistic reports filtered by sport, programme,',
    'gender or age group, are on AIRMS under PDF Reports.',
    '',
    SIGNOFF,
  );

  return {
    subject: `AIRMS monthly summary — ${now.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`,
    text: lines.join('\n'),
  };
}

// The holistic PDF, rendered for the digest. Non-fatal by design: the summary
// numbers are the point of the email, so a report that fails to render must
// downgrade the digest rather than cancel it — the alternative is a silent month
// with no report AND no numbers, which is the failure this whole feature exists
// to prevent.
async function digestAttachment(now) {
  try {
    // Deliberately unfiltered and monthly: this is the institute-wide review.
    const { buffer, filename } = await renderHolisticPdf({ grain: 'month' }, monthKey(now));
    return [{ filename, content: buffer, contentType: 'application/pdf' }];
  } catch (e) {
    console.error('[scheduler] holistic report render failed, sending summary only:', e.message);
    return null;
  }
}

async function runDigestOnce(now = new Date()) {
  const settings = await getSettings();
  if (!isDue(now, settings)) return { sent: false, reason: 'not due' };

  const users = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'executive'] }, isActive: true },
    attributes: ['email', 'notifyPrefs'],
    raw: true,
  });
  // An admin who has opted out of the digest is not a recipient. If that empties
  // the list the month is still MARKED below, so we do not retry hourly against a
  // deliberate choice.
  const to = recipientsFor(users, 'digest').map((u) => u.email).filter(Boolean);
  // The marker is set even with no recipients, so a permanently empty admin list
  // does not retry every hour forever.
  if (!to.length) {
    await setSetting('digest_last_sent', monthKey(now));
    return { sent: false, reason: 'no recipients' };
  }

  const attachments = await digestAttachment(now);
  const { subject, text } = await buildDigest(now, { attached: !!attachments });
  await sendMail({
    to: to.join(','), subject, text, attachments: attachments || undefined,
  });
  // Marked only AFTER a successful send, so a mail failure retries next hour
  // instead of losing the month.
  await setSetting('digest_last_sent', monthKey(now));
  return {
    sent: true, recipients: to.length, month: monthKey(now), attached: !!attachments,
  };
}


// ── Rescreen reminder ───────────────────────────────────────────────────────
// A screening programme runs on recall. Coverage answers "have we ever tested
// this athlete"; nobody was answering "and is what we hold on them still
// current". The Programme Activity page shows it, but a page only tells you
// something when you happen to open it — which is the wrong shape for a fact
// that decays quietly on its own.
//
// Reports against `rescreen_due_days` and NOTHING ELSE. It would have been easy
// to give the reminder its own threshold, and that is exactly how an email comes
// to say an athlete is overdue while the dashboard says they are current. One
// number, one meaning, three surfaces.
function isReminderDue(now, settings) {
  if (!settings.rescreen_reminder_enabled) return false;
  const day = Math.min(Math.max(Number(settings.rescreen_reminder_day) || 1, 1), 28);
  const hour = Math.min(Math.max(Number(settings.rescreen_reminder_hour) || 8, 0), 23);
  const due = new Date(now.getFullYear(), now.getMonth(), day, hour, 0, 0, 0);
  if (now < due) return false;
  return String(settings.rescreen_reminder_last_sent || '') !== monthKey(now);
}

// How many names to spell out before the email becomes a wall of text. The rest
// are counted, because a truncated list that does not admit it is truncated
// reads as "these are all of them".
const REMINDER_LIST_CAP = 40;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function buildReminder(now) {
  const roster = await Athlete.findAll({
    where: { isActive: true },
    attributes: ['athleteId', 'name', 'sport'],
    raw: true,
  });
  const recall = await rescreenRecall(roster);
  const byId = new Map(roster.map((a) => [a.athleteId, a]));

  const overdue = recall.athletes.filter((a) => a.status === 'overdue');
  const never = recall.athletes.filter((a) => a.status === 'never');
  const dueSoon = recall.athletes.filter((a) => a.status === 'due-soon');
  const needed = overdue.length + never.length;

  // "about 1 months" reads as a bug to the person receiving it.
  const m = recall.dueDays / 30;
  const months = `${m.toFixed(recall.dueDays % 30 ? 1 : 0)} ${m === 1 ? 'month' : 'months'}`;
  const L = [];
  L.push(`Rescreen status for ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.`);
  L.push('');
  L.push(`A screening counts as current for ${plural(recall.dueDays, 'day', 'days')} (about ${months}), `
    + 'which is an ISN setting rather than a clinical standard - an administrator can change it in Settings.');
  L.push('');
  L.push(`  Overdue a rescreen ....... ${overdue.length}`);
  L.push(`  Never screened ........... ${never.length}`);
  L.push(`  Due within the next 20% .. ${dueSoon.length}`);
  L.push(`  Current .................. ${recall.current}`);
  L.push(`  On the roster ............ ${roster.length}`);
  if (recall.medianAgeDays !== null) {
    L.push('');
    L.push(`Median age of the latest screening on file: ${plural(recall.medianAgeDays, 'day', 'days')}.`);
  }

  // Grouped by sport, because a recall list is worked through by whoever runs
  // that squad's schedule.
  const section = (title, rows, showAge) => {
    if (!rows.length) return;
    L.push('');
    L.push(`${title} (${rows.length})`);
    const bySport = new Map();
    for (const r of rows.slice(0, REMINDER_LIST_CAP)) {
      const a = byId.get(r.athleteId) || {};
      const key = a.sport || 'No sport recorded';
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key).push({ ...r, name: a.name || r.athleteId });
    }
    for (const [sport, list] of [...bySport.entries()].sort()) {
      L.push(`  ${sport}`);
      for (const r of list) {
        L.push(`    - ${r.name} (${r.athleteId})`
          + (showAge && r.ageDays !== null ? ` - last screened ${plural(r.ageDays, 'day', 'days')} ago` : ''));
      }
    }
    if (rows.length > REMINDER_LIST_CAP) {
      L.push(`  ... and ${rows.length - REMINDER_LIST_CAP} more not listed here.`);
    }
  };

  section('OVERDUE - due a rescreen now', overdue, true);
  // Kept apart from the overdue list on purpose: the action is a FIRST
  // assessment, not a call-back, and these athletes have no baseline to compare
  // anything against either.
  section('NEVER SCREENED - need a first assessment', never, false);

  if (!needed) {
    L.push('');
    L.push('Nothing needs a call-back this month - every athlete on the roster has a current screening.');
  }
  L.push('');
  L.push('Full detail, filterable by squad: Admin > Programme Activity.');
  L.push('');
  L.push(SIGNOFF);

  const subject = needed
    ? `AIRMS rescreen reminder - ${plural(needed, 'athlete', 'athletes')} need attention`
    : 'AIRMS rescreen reminder - roster fully current';
  return { subject, text: L.join('\n'), needed, recall };
}

async function runReminderOnce(now = new Date()) {
  const settings = await getSettings();
  if (!isReminderDue(now, settings)) return { sent: false, reason: 'not due' };

  const users = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'medical'] }, isActive: true },
    attributes: ['email', 'notifyPrefs'],
    raw: true,
  });
  const to = recipientsFor(users, 'rescreen_reminder').map((u) => u.email).filter(Boolean);
  // Marked even with no recipients, so an all-opted-out institute is not retried
  // every hour against a deliberate choice.
  if (!to.length) {
    await setSetting('rescreen_reminder_last_sent', monthKey(now));
    return { sent: false, reason: 'no recipients' };
  }

  const { subject, text, needed } = await buildReminder(now);
  await sendMail({ to: to.join(','), subject, text });
  // Only after a successful send, so a mail failure retries next hour rather
  // than losing the month.
  await setSetting('rescreen_reminder_last_sent', monthKey(now));
  return {
    sent: true, recipients: to.length, month: monthKey(now), needed,
  };
}

let timer = null;

function startScheduler() {
  if (timer) return;
  const tick = async () => {
    try {
      const r = await runDigestOnce();
      if (r.sent) {
        console.log(`[scheduler] monthly digest sent to ${r.recipients} recipient(s) for ${r.month}`
          + `${r.attached ? ' with the holistic report attached' : ' (summary only — report render failed)'}`);
      }
    } catch (e) {
      // Never let the scheduler take the process down; it retries next hour.
      console.error('[scheduler] monthly digest failed:', e.message);
    }
    // Separate try: a digest failure must not cost the reminder its month, and
    // vice versa. They share a tick, not a fate.
    try {
      const r = await runReminderOnce();
      if (r.sent) {
        console.log(`[scheduler] rescreen reminder sent to ${r.recipients} recipient(s) for ${r.month}`
          + ` (${r.needed} athlete(s) needing attention)`);
      }
    } catch (e) {
      console.error('[scheduler] rescreen reminder failed:', e.message);
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

module.exports = {
  isReminderDue, buildReminder, runReminderOnce,
  startScheduler, stopScheduler, runDigestOnce, isDue, buildDigest, digestAttachment, monthKey,
};
