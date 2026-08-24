#!/usr/bin/env node
// One scheduled-mail pass, then exit. `npm run mail:tick`.
//
// The digest and the rescreen reminder are monthly OBLIGATIONS, and a
// `setInterval` inside Express ties them to a web server's uptime. The marker
// design means a late process sends late rather than never — but "late" means
// "whenever somebody next opens the project", and not having to be opened is the
// whole point of these two.
//
// Runs the identical `tick()` the interval runs — one definition, so a deployment
// cannot send the digest and silently never the reminder — then exits. An OS
// scheduler drives it:
//
//   Windows   scripts/install-mail-task.ps1   (Task Scheduler, hourly, per-user)
//   Linux     0 * * * *  cd /srv/airms/backend && /usr/bin/node src/mailTick.js
//
// Set MAIL_SCHEDULER=off in the backend's environment when an OS scheduler is
// doing this, so the web process stops ticking too. If both tick anyway it is
// wasteful rather than wrong: both sends run under a cross-process lock
// (utils/lock.js), which is what makes "safe to run twice" true.
//
// EXIT CODES — an OS scheduler records these, and that is the only place a
// headless failure is visible besides the outcome row on the admin page:
//   0  nothing was owed, or something was sent successfully
//   1  an attempt failed (the month is NOT marked, so the next tick retries)
//   2  could not reach the database at all

require('dotenv').config();

const { sequelize } = require('./models');
const { tick } = require('./utils/scheduler');

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

(async () => {
  try {
    await sequelize.authenticate();
  } catch (e) {
    console.error(`[mail:tick ${stamp()}] database unreachable: ${e.message}`);
    process.exit(2);
  }

  let failed = false;
  try {
    const out = await tick();
    // `tick` already logs the sends. This line is what an operator sees in the
    // task history when NOTHING happened, which is the normal case 700-odd hours
    // a month — silence there is indistinguishable from a task that never ran.
    const say = (name, r) => {
      if (!r) return `${name}: no result`;
      if (r.failed) { failed = true; return `${name}: FAILED — ${r.reason}`; }
      return r.sent ? `${name}: sent` : `${name}: nothing owed (${r.reason})`;
    };
    console.log(`[mail:tick ${stamp()}] ${say('digest', out.digest)} · ${say('reminder', out.reminder)}`);
  } catch (e) {
    console.error(`[mail:tick ${stamp()}] unexpected: ${e.message}`);
    failed = true;
  }

  await sequelize.close().catch(() => {});
  process.exit(failed ? 1 : 0);
})();
