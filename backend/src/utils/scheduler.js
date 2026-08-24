// Scheduled monthly digest (§16). Asked for by Dr Hoo ("automatic reporting")
// and Dr Thung ("something standard ... generate every month") — the PDFs
// already produced the content; nothing happened without being asked.
//
// No cron library. A cron expression fires at an instant, and a process that is
// down at that instant skips the month with no error — for a monthly report,
// a year with eleven entries. Instead an hourly tick asks whether this month's
// digest is still owed, against a marker in settings: idempotent (the marker IS
// the month) and self-healing (down Monday, sends Tuesday).
//
// It was not safe to run twice, though this comment once said so: the marker is
// written only after a successful send, so concurrent ticks both send. Both sends
// now take a compare-and-swap lock (utils/lock.js), so it is enforced.
//
// startScheduler() ticks in-process, which suits `npm run dev` and not a
// deployment — it ties a monthly obligation to a web server's uptime. `npm run
// mail:tick` runs one tick and exits for an OS scheduler; set MAIL_SCHEDULER=off
// there so both do not tick (wasteful rather than wrong, given the lock).

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
const { withLock } = require('./lock');

const HOUR = 60 * 60 * 1000;
const SIGNOFF = '— AIRMS · Institut Sukan Negara';

// Record the outcome of an attempt — including a failed one.
//
// The error handling below was already correct: a failed send does NOT mark the
// month, so it retries next hour rather than losing it. What was missing is that
// nobody is TOLD. The failure reached `console.error` on a host that, by this
// module's own argument, is expected to run unattended. So the outcome is
// persisted where the admin page can render it — a month that quietly stopped
// arriving is otherwise indistinguishable from a month with nothing to say.
//
// Fire-and-forget in the same sense as the audit writes: recording the outcome
// must never be the reason a send is reported as failed.
async function recordOutcome(key, ok, detail) {
  try {
    await setSetting(key, JSON.stringify({ at: new Date().toISOString(), ok, detail: String(detail) }));
  } catch (e) { /* bookkeeping must not fail the thing it describes */ }
}

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

// `force` skips the DUE check only — an admin pressing "Send now" has decided
// the timing. It deliberately does NOT skip `digest_enabled`: that switch is the
// institution's answer to whether AIRMS sends this kind of mail at all, and a
// button that overrode it would be a second, contradictory gate.
// The lock is taken around the whole send, not just the marker write: the point
// is that the second process must not BUILD and SEND a duplicate, and by the
// time it could observe a marker the first one has already delivered.
async function runDigestOnce(now = new Date(), opts = {}) {
  return withLock('digest', () => digestPass(now, opts), {
    onBusy: { sent: false, reason: 'another process is already sending' },
  });
}

async function digestPass(now, { force = false } = {}) {
  const settings = await getSettings();
  if (force && !settings.digest_enabled) return { sent: false, reason: 'disabled' };
  if (!force && !isDue(now, settings)) return { sent: false, reason: 'not due' };

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
  try {
    await sendMail({
      to: to.join(','), subject, text, attachments: attachments || undefined,
    });
  } catch (e) {
    await recordOutcome('digest_last_result', false, e.message);
    throw e;
  }
  // Marked only AFTER a successful send, so a mail failure retries next hour
  // instead of losing the month.
  await setSetting('digest_last_sent', monthKey(now));
  await recordOutcome('digest_last_result', true,
    `sent to ${to.length} recipient(s)${attachments ? ' with the holistic report attached' : ' (summary only — report render failed)'}`);
  return {
    sent: true, recipients: to.length, to, month: monthKey(now), attached: !!attachments,
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

// `sport` narrows the whole email to one squad, for a coach. The recall itself is
// computed on the FULL roster by the caller and filtered here, so a coach's copy
// and the institution's copy can never disagree about who is overdue — they are
// literally the same rows, sliced.
async function buildReminder(now, { sport = null, recall = null, roster = null } = {}) {
  const fullRoster = roster || await Athlete.findAll({
    where: { isActive: true },
    attributes: ['athleteId', 'name', 'sport'],
    raw: true,
  });
  const fullRecall = recall || await rescreenRecall(fullRoster);
  const byId = new Map(fullRoster.map((a) => [a.athleteId, a]));

  const inScope = (a) => !sport || (byId.get(a.athleteId) || {}).sport === sport;
  const scoped = fullRecall.athletes.filter(inScope);
  const overdue = scoped.filter((a) => a.status === 'overdue');
  const never = scoped.filter((a) => a.status === 'never');
  const dueSoon = scoped.filter((a) => a.status === 'due-soon');
  const current = scoped.filter((a) => a.status === 'current').length;
  const rosterCount = sport ? fullRoster.filter((a) => a.sport === sport).length : fullRoster.length;
  const needed = overdue.length + never.length;
  // Scoped median: a coach reading the institution's figure would be told
  // something true about a population they cannot act on.
  const ages = overdue.concat(scoped.filter((a) => a.status !== 'never'))
    .map((a) => a.ageDays).filter((v) => v !== null && v !== undefined);
  const medianAge = ages.length
    ? [...new Set(ages)].length === 0 ? null
      : (() => { const q = [...ages].sort((x, y) => x - y); const mid = Math.floor(q.length / 2);
        return q.length % 2 ? q[mid] : Math.round((q[mid - 1] + q[mid]) / 2); })()
    : null;

  // "about 1 months" reads as a bug to the person receiving it.
  const m = fullRecall.dueDays / 30;
  const months = `${m.toFixed(fullRecall.dueDays % 30 ? 1 : 0)} ${m === 1 ? 'month' : 'months'}`;
  const L = [];
  L.push(`Rescreen status for ${sport ? `${sport} - ` : ''}`
    + `${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}.`);
  L.push('');
  L.push(`A screening counts as current for ${plural(fullRecall.dueDays, 'day', 'days')} (about ${months}), `
    + 'which is an ISN setting rather than a clinical standard - an administrator can change it in Settings.');
  L.push('');
  L.push(`  Overdue a rescreen ....... ${overdue.length}`);
  L.push(`  Never screened ........... ${never.length}`);
  L.push(`  Due within the next 20% .. ${dueSoon.length}`);
  L.push(`  Current .................. ${current}`);
  L.push(`  On the roster ............ ${rosterCount}`);
  if (medianAge !== null) {
    L.push('');
    L.push(`Median age of the latest screening on file: ${plural(medianAge, 'day', 'days')}.`);
  }

  // Grouped by sport, because a recall list is worked through by whoever runs
  // that squad's schedule.
  const section = (title, rows, showAge) => {
    if (!rows.length) return;
    L.push('');
    L.push(`${title} (${rows.length})`);
    const named = rows.slice(0, REMINDER_LIST_CAP).map((r) => {
      const a = byId.get(r.athleteId) || {};
      return { ...r, name: a.name || r.athleteId, sport: a.sport || 'No sport recorded' };
    });
    const line = (r, indent) => L.push(`${indent}- ${r.name} (${r.athleteId})`
      + (showAge && r.ageDays !== null ? ` - last screened ${plural(r.ageDays, 'day', 'days')} ago` : ''));
    if (sport) {
      // One squad: the sport heading would repeat on every line.
      named.forEach((r) => line(r, '  '));
    } else {
      const bySport = new Map();
      for (const r of named) {
        if (!bySport.has(r.sport)) bySport.set(r.sport, []);
        bySport.get(r.sport).push(r);
      }
      for (const [group, list] of [...bySport.entries()].sort()) {
        L.push(`  ${group}`);
        list.forEach((r) => line(r, '    '));
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
    L.push(sport
      ? `Nothing needs a call-back this month - every ${sport} athlete has a current screening.`
      : 'Nothing needs a call-back this month - every athlete on the roster has a current screening.');
  }
  L.push('');
  L.push(sport
    ? 'Your squad\'s screening detail: Coach > Squad Readiness.'
    : 'Full detail, filterable by squad: Admin > Programme Activity.');
  L.push('');
  L.push(SIGNOFF);

  const who = sport ? `${sport} ` : '';
  const subject = needed
    ? `AIRMS rescreen reminder - ${plural(needed, who ? `${who}athlete` : 'athlete', who ? `${who}athletes` : 'athletes')} need attention`
    : `AIRMS rescreen reminder - ${sport ? `${sport} squad` : 'roster'} fully current`;
  return { subject, text: L.join('\n'), needed, recall };
}

async function runReminderOnce(now = new Date(), opts = {}) {
  return withLock('rescreen_reminder', () => reminderPass(now, opts), {
    onBusy: { sent: false, reason: 'another process is already sending' },
  });
}

async function reminderPass(now, { force = false } = {}) {
  const settings = await getSettings();
  if (force && !settings.rescreen_reminder_enabled) return { sent: false, reason: 'disabled' };
  if (!force && !isReminderDue(now, settings)) return { sent: false, reason: 'not due' };

  const users = await User.findAll({
    where: { role: { [Op.in]: ['admin', 'medical', 'coach'] }, isActive: true },
    attributes: ['email', 'role', 'coachSport', 'notifyPrefs'],
    raw: true,
  });
  const willing = recipientsFor(users, 'rescreen_reminder');
  const wide = willing.filter((u) => u.role !== 'coach').map((u) => u.email).filter(Boolean);
  const coaches = willing.filter((u) => u.role === 'coach' && u.coachSport && u.email);

  // Marked even with no recipients, so an all-opted-out institute is not retried
  // every hour against a deliberate choice.
  if (!wide.length && !coaches.length) {
    await setSetting('rescreen_reminder_last_sent', monthKey(now));
    return { sent: false, reason: 'no recipients' };
  }

  // Computed ONCE on the full roster; every email below is a slice of it, so a
  // coach's copy cannot disagree with the institution's about who is overdue.
  const roster = await Athlete.findAll({
    where: { isActive: true },
    attributes: ['athleteId', 'name', 'sport'],
    raw: true,
  });
  const recall = await rescreenRecall(roster);
  const opts = { recall, roster };

  let sends = 0; let needed = 0;
  const sentTo = [];
  try {
    if (wide.length) {
      const m = await buildReminder(now, opts);
      await sendMail({ to: wide.join(','), subject: m.subject, text: m.text });
      sends += 1;
      needed = m.needed;
      sentTo.push(`institution-wide → ${wide.length} recipient(s)`);
    }

  // One email per sport, not per coach, so two coaches on the same squad get one
  // message between them rather than two identical ones.
  const bySport = new Map();
  for (const c of coaches) {
    if (!bySport.has(c.coachSport)) bySport.set(c.coachSport, []);
    bySport.get(c.coachSport).push(c.email);
  }
    for (const [sport, emails] of bySport) {
      const m = await buildReminder(now, { ...opts, sport });
      // A coach with nothing to chase does not need a monthly "nothing to do".
      // The institution-wide copy still sends when empty, because there "the
      // roster is current" is itself the assurance an administrator wants.
      if (!m.needed) continue;
      await sendMail({ to: emails.join(','), subject: m.subject, text: m.text });
      sends += 1;
      sentTo.push(`${sport} → ${emails.length} coach inbox(es)`);
    }
  } catch (e) {
    await recordOutcome('rescreen_reminder_last_result', false, e.message);
    throw e;
  }

  // Only after the sends, so a mail failure retries next hour rather than
  // losing the month.
  await setSetting('rescreen_reminder_last_sent', monthKey(now));
  await recordOutcome('rescreen_reminder_last_result', true,
    `${sends} email(s) — ${sentTo.join('; ') || 'none needed'} — ${needed} athlete(s) needing attention`);
  return {
    sent: sends > 0, emails: sends, sentTo, recipients: wide.length + coaches.length, month: monthKey(now), needed,
  };
}

let timer = null;

/**
 * One pass: is either scheduled email owed right now?
 *
 * Module-level rather than a closure inside `startScheduler`, because the CLI
 * (`src/mailTick.js`, driven by an OS scheduler) has to run the IDENTICAL pass.
 * Two definitions of "what a tick does" is how a deployment comes to send the
 * digest and silently never send the reminder — the same one-definition rule the
 * digest already follows for the holistic report it attaches.
 *
 * Returns what happened, so the CLI can report it; the interval ignores it.
 */
async function tick() {
  const out = { digest: null, reminder: null };
  try {
    out.digest = await runDigestOnce();
    if (out.digest.sent) {
      console.log(`[scheduler] monthly digest sent to ${out.digest.recipients} recipient(s) for ${out.digest.month}`
        + `${out.digest.attached ? ' with the holistic report attached' : ' (summary only — report render failed)'}`);
    }
  } catch (e) {
    // Never let the scheduler take the process down; it retries next hour.
    console.error('[scheduler] monthly digest failed:', e.message);
    await recordOutcome('digest_last_result', false, e.message);
    out.digest = { sent: false, reason: e.message, failed: true };
  }
  // Separate try: a digest failure must not cost the reminder its month, and
  // vice versa. They share a tick, not a fate.
  try {
    out.reminder = await runReminderOnce();
    if (out.reminder.sent) {
      console.log(`[scheduler] rescreen reminder: ${out.reminder.emails} email(s) to ${out.reminder.recipients} recipient(s)`
        + ` for ${out.reminder.month} (${out.reminder.needed} athlete(s) needing attention institution-wide)`);
    }
  } catch (e) {
    console.error('[scheduler] rescreen reminder failed:', e.message);
    await recordOutcome('rescreen_reminder_last_result', false, e.message);
    out.reminder = { sent: false, reason: e.message, failed: true };
  }
  return out;
}

// MAIL_SCHEDULER=off disables the in-process ticker, for a deployment whose OS
// scheduler runs `npm run mail:tick` instead. Default is ON, deliberately: the
// failure mode of a default-off switch is silence, which is the one failure this
// whole module exists to prevent.
function startScheduler() {
  if (String(process.env.MAIL_SCHEDULER || '').toLowerCase() === 'off') {
    console.log('[scheduler] in-process ticker disabled (MAIL_SCHEDULER=off) — expecting an OS scheduler to run `npm run mail:tick`');
    return;
  }
  if (timer) return;
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
  isReminderDue, buildReminder, runReminderOnce, recordOutcome, tick,
  startScheduler, stopScheduler, runDigestOnce, isDue, buildDigest, digestAttachment, monthKey,
};
