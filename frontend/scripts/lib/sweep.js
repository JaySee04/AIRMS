// VISIT EVERY AUTHENTICATED PAGE AS A ROLE THAT CAN REACH IT, AND PROVE EACH
// VISIT HAPPENED.
//
// WHY THIS EXISTS. verify-contrast.js and verify-a11y.js were 500 and 308 lines
// with 91 lines identical between them — Chrome discovery, login and its error
// messages, the worker pool, per-visit browser contexts, the session seed, the
// landing assertions, the unmeasured bookkeeping, SIGINT teardown. One sweep
// written twice.
//
// It had already bitten. The "What's new" notice opens on a fresh context and
// its backdrop sits over the page, so both sweeps have to acknowledge it in
// their session seed — and that acknowledgement had to be written into two
// files. A second copy of a rule is a second place for it to go stale, which is
// what most of this repo's guards exist to prevent.
//
// WHAT THE HARNESS OWNS, because it is the same question for any sweep:
//   * which pages, as which role (scripts/lib/pages.js);
//   * a browser CONTEXT per visit — localStorage is per-origin, so concurrent
//     plain tabs trample each other's token and a visit silently reads another
//     role's screen (§121.8);
//   * the session seed, including the what's-new acknowledgement;
//   * EVERY VISIT PROVES IT WAS MEASURED. An expired session, a renamed route or
//     a role losing access all end on a screen with no findings, so a broken
//     sweep reports a confident green ZERO. A visit that cannot be measured is
//     collected as UNMEASURED and fails the run — it is never a pass.
//
// WHAT THE CALLER OWNS: what to measure (`inPage`), how to key a finding, and
// any extra landing assertion its own measurement needs — contrast cares that
// the page booted in the right THEME, a11y does not.
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { PAGES } = require('./pages');

const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  process.env.CHROME_PATH,
].filter(Boolean);

const ROLES = ['admin', 'medical', 'coach', 'athlete', 'executive'];

/** First line of an error. Puppeteer messages carry a stack; the rest is noise. */
const firstLine = (e) => String(e && e.message ? e.message : e).split(/\r?\n/)[0];

function chromePath() {
  return CHROMES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

async function login(api, email) {
  let r;
  try {
    r = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'airms2026' }),
    });
  } catch (e) {
    // fetch rejects for a dead host with a message naming no host at all
    // ("fetch failed"), which sends the reader to the wrong place entirely.
    throw new Error(`cannot reach the API at ${api} (${e.cause?.code || e.message})`);
  }
  if (r.status === 401) throw new Error(`login ${email} -> 401. The demo accounts are seeded by \`npm run seed\`.`);
  if (r.status === 429) throw new Error(`login ${email} -> 429. The auth throttle is engaged; loopback is exempt, so run against a local instance.`);
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  const s = await r.json();
  // A 200 with no token would boot every page signed-OUT and the sweep would
  // measure twenty-six sign-in screens. Refuse where the cause is still legible.
  if (!s || !s.token || !s.user) throw new Error(`login ${email} -> 200 but no token in the reply`);
  return s;
}

/** Sign in as every role, with one diagnostic if the instance is not ready. */
async function allSessions(api) {
  const who = {};
  for (const role of ROLES) who[role] = await login(api, `${role}@isn.gov.my`);
  return who;
}

/**
 * The session a page boots with.
 *
 * ONE definition, and the what's-new acknowledgement is the reason it has to be:
 * each visit gets a fresh context, so the notice would open on every single one
 * and its backdrop would sit over the page. Measured when it did — the contrast
 * sweep reported `.text-muted` at 2.32:1 on /coach/dashboard, which is not a
 * defect but the page's own text read through a translucent overlay.
 */
const SEED = (s, theme) => {
  localStorage.setItem('airms_token', s.token);
  localStorage.setItem('airms_user', JSON.stringify(s.user));
  if (theme) localStorage.setItem('airms_theme', theme);
  localStorage.setItem(`airms_whatsnew_v1:${s.user.id}`, '1');
};

/**
 * Run `inPage` over every page in `jobs` concurrent contexts.
 *
 * @param {object} o
 * @param {string}   o.web, o.api
 * @param {number}   o.settle ms after networkidle2 before measuring
 * @param {number}   o.jobs   concurrent contexts
 * @param {string[]} [o.themes] one pass per theme; omit for a single pass
 * @param {object[]} [o.viewports] one pass per {width,height}; omit for the
 *                   launch default. Multiplies with `themes`.
 * @param {Function} o.inPage evaluated in the page; must return
 *                   { findings[], scanned, path, ...extra }
 * @param {Function} o.keyOf  finding -> dedupe key
 * @param {Function} [o.check] (res, ctx) -> string|null, an extra landing
 *                   assertion; a string is treated as "could not measure"
 * @param {Function} [o.beforeMeasure] (page, ctx) -> void, for a canary
 * @param {object}   o.who    sessions by role
 * @param {number}   [o.minElements]
 */
async function run({
  web, api, settle, jobs, themes = [null], viewports = [null], inPage, keyOf,
  check, beforeMeasure, who, minElements = 10, browser,
}) {
  const all = new Map();
  const unmeasured = [];
  let scannedTotal = 0;

  const queue = [];
  for (const theme of themes) {
    for (const viewport of viewports) {
      for (const [role, route] of PAGES) queue.push({ theme, viewport, role, route });
    }
  }
  let cursor = 0;

  async function worker() {
    for (;;) {
      const job = queue[cursor];
      cursor += 1;
      if (!job) return;
      const { theme, viewport, role, route } = job;
      const label = `${theme ? `${theme} ` : ''}${viewport ? `${viewport.width}px ` : ''}${role} ${route}`;
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      try {
        // WIDTH IS AN AXIS OF THE SWEEP, not a property of the browser (added
        // 2026-10-06, §132). verify:layout needs the same 24 pages at three
        // widths, and the alternative was a third copy of login + seed + the
        // per-visit context + the unmeasured bookkeeping — which is the exact
        // duplication this file was extracted to end. Omitted by every existing
        // caller, so they keep the launch default.
        if (viewport) await page.setViewport(viewport);
        await page.evaluateOnNewDocument(SEED, who[role], theme);
        await page.goto(web + route, { waitUntil: 'networkidle2', timeout: 60000 })
          .catch((e) => { unmeasured.push(`${label} — navigation: ${firstLine(e)}`); });
        await new Promise((r) => { setTimeout(r, settle); });

        if (theme) {
          // Wait for the theme, do not snapshot it. The app stamps data-theme
          // after mount; a fixed settle is a bet on how long that takes and it
          // loses under concurrency. Waiting is not weakening — a theme that
          // never arrives still fails the check below, with the same message.
          await page.waitForFunction(
            (th) => document.documentElement.getAttribute('data-theme') === th,
            { timeout: 5000 }, theme,
          ).catch(() => {});
        }

        if (beforeMeasure) {
          const why = await beforeMeasure(page, job);
          if (why) { unmeasured.push(`${label} — ${why}`); continue; }
        }

        const res = await page.evaluate(inPage);

        if (res.path !== route) {
          unmeasured.push(`${label} — landed on ${res.path} (session refused, or the route moved)`);
          continue;
        }
        if ((res.scanned ?? 0) < minElements) {
          unmeasured.push(`${label} — only ${res.scanned} measurable elements; the page did not render`);
          continue;
        }
        const extra = check ? check(res, job) : null;
        if (extra) { unmeasured.push(`${label} — ${extra}`); continue; }

        scannedTotal += res.scanned;
        for (const f of res.findings) {
          const key = keyOf(f, job);
          if (!all.has(key)) all.set(key, { ...f, theme, where: `${route} (${role})`, count: 1 });
          else all.get(key).count += 1;
        }
      } catch (e) {
        // One page failing must not discard the others, and must not be
        // mistaken for one that measured clean.
        unmeasured.push(`${label} — ${firstLine(e)}`);
      } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
      }
    }
  }

  // allSettled: a worker that throws would otherwise take its whole share of the
  // queue with it and leave the run reporting a clean sweep of what survived.
  const results = await Promise.allSettled(Array.from({ length: jobs }, worker));
  for (const r of results) {
    if (r.status === 'rejected') unmeasured.push(`a sweep worker died — ${firstLine(r.reason)}`);
  }

  return {
    rows: [...all.values()],
    unmeasured: unmeasured.sort(),
    scannedTotal,
    visits: queue.length - unmeasured.length,
    total: queue.length,
  };
}

/** Launch Chrome, or exit 2 with the one line that says what to set. */
async function launch() {
  const path = chromePath();
  if (!path) { console.error('No Chrome found. Set CHROME_PATH to the executable.'); process.exit(2); }
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: path,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1440, height: 900 },
    });
  } catch (e) {
    console.error(`Could not start Chrome at ${path}: ${e.message}`);
    process.exit(2);
  }
  // Chrome outlives this process if it is killed mid-sweep, and a stray headless
  // browser per interrupted run is a slow leak on a dev machine.
  const bail = () => { browser.close().catch(() => {}); process.exit(2); };
  process.on('SIGINT', bail);
  process.on('SIGTERM', bail);
  return browser;
}

/** The "N could not be measured" block, identical for every sweep. */
function reportUnmeasured(unmeasured, total) {
  if (!unmeasured.length) return;
  console.log(`\n${unmeasured.length} of ${total} page-visits COULD NOT BE MEASURED:\n`);
  for (const u of unmeasured) console.log(`  ✗ ${u}`);
  console.log('\nThese are not passes. A page that did not render has no findings');
  console.log('in the same way an unplugged monitor has no dead pixels.');
}

module.exports = {
  run, launch, allSessions, reportUnmeasured, firstLine, PAGES, ROLES,
};
