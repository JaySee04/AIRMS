// Vercel Cron target for the scheduled mail (§36).
//
// The in-process hourly ticker cannot exist here: a serverless function is
// frozen between invocations, so a setInterval inside it never fires. Vercel
// Cron calls this route on the schedule in vercel.json, and it runs the SAME
// tick() that `npm run mail:tick` and the in-process ticker run — one
// definition, so a deployment cannot end up sending the digest and silently
// never sending the rescreen reminder.
//
// Nothing here decides whether mail is owed. tick() reads the persisted month
// markers, which is what makes a missed run send late rather than never, and
// both sends take the cross-process lock (utils/lock.js) — so an overlapping
// cron invocation produces one email, not two.
//
// Vercel Cron requests carry an Authorization: Bearer <CRON_SECRET> header when
// CRON_SECRET is set. It is checked when present, because this endpoint puts
// athlete-derived content into inboxes and is reachable by URL like any other.

const { tick } = require('../../src/utils/scheduler');
const { connectDB } = require('../../src/config/db');

let ready = null;
function ensureDb() {
  if (!ready) ready = connectDB().catch((err) => { ready = null; throw err; });
  return ready;
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.statusCode = 401;
    res.end(JSON.stringify({ message: 'Unauthorized' }));
    return;
  }

  res.setHeader('Content-Type', 'application/json');
  try {
    await ensureDb();
    await tick();
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, ranAt: new Date().toISOString() }));
  } catch (err) {
    // 500 so the run shows as failed in the Vercel dashboard. The markers are
    // written only after a successful send, so a failure here means the next
    // run retries rather than the month being lost.
    console.error('[cron] mail tick failed:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
};
