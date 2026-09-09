// End-to-end smoke test: a real browser against a real server.
//
//   npm run dev                 # backend :5000 and frontend :3000, from the root
//   cd frontend; npm run e2e
//
// WHY THIS EXISTS
//
// Everything else in this project is a unit test with the awkward parts mocked.
// That is the right shape for logic, and it is exactly the shape that cannot
// catch: a page that throws on mount, a redirect that never fires in a real
// router, a chart that renders blank because a CSS token evaporated, or a
// percentage that is right in a function and wrong on screen.
//
// Three of this session's defects were only ever visible this way — the missing
// keyboard focus ring, the readiness tiles summing to 88%, and a guide PDF that
// shipped three times because nobody opened it.
//
// It drives the Chrome already installed on the machine through puppeteer-core,
// so there is no browser download and nothing to keep in sync.
//
// EXIT CODES
//   0  every check passed
//   1  a check failed — the failure is printed with what was expected
//   2  could not run (servers down, Chrome missing)
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const WEB = process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.E2E_API || 'http://localhost:5000/api';
const PW = process.env.E2E_PW || 'airms2026';
// How long to wait after networkidle2 before reading the page. See visit().
// Local default; against the hosted instance use E2E_SETTLE=4000 or more.
const SETTLE_MS = Number(process.env.E2E_SETTLE) || 1200;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

// Text no signed-out visitor may ever see.
const PRIVATE_TEXT = /roster|squad readiness|cohort norms|personnel|activity log|screening analytics/i;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  return r.json();
}

/** Open `route`, optionally seeding a session first, and report what happened. */
async function visit(browser, route, session) {
  const page = await browser.newPage();
  const apiCalls = [];
  page.on('response', (res) => {
    const u = res.url();
    if (!u.startsWith(API) || res.request().method() === 'OPTIONS') return;
    apiCalls.push({ path: u.slice(API.length).split('?')[0], status: res.status() });
  });
  let painted = '';
  const watch = setInterval(async () => {
    try {
      const t = await page.evaluate(() => document.body?.innerText || '');
      if (!painted && PRIVATE_TEXT.test(t)) painted = t.replace(/\s+/g, ' ').slice(0, 70);
    } catch { /* mid-navigation */ }
  }, 60);

  await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded' });
  if (session) {
    await page.evaluate((t, u) => {
      localStorage.setItem('airms_token', t);
      localStorage.setItem('airms_user', u);
    }, session.token, JSON.stringify(session.user));
  } else {
    await page.evaluate(() => localStorage.clear());
  }
  await page.goto(WEB + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  // Settle time AFTER networkidle2, because the panels fetch their own data once
  // mounted — so "the network went quiet" is reached before the page has its
  // content, and reading innerText too early sees the shell alone.
  //
  // 1200ms is right for localhost and WRONG for the hosted instance, which was
  // found by running this against it (2026-09-06): sections that render the
  // dashboards reported 125 and 186 characters, while a LATER section opened the
  // same athlete dashboard and drew 155 body-map regions. Both cannot be true of
  // the page, so the short read was the harness, not the product. A serverless
  // API with a cold start does not answer in the time a local nodemon does.
  //
  // Configurable rather than simply raised: paying 4s a page against localhost
  // would add minutes to the run that gates a commit, for nothing.
  await new Promise((r) => { setTimeout(r, SETTLE_MS); });
  clearInterval(watch);

  const url = new URL(page.url()).pathname;
  const text = await page.evaluate(() => document.body?.innerText || '');
  const leaked = apiCalls.filter((c) => c.status >= 200 && c.status < 300 && !c.path.startsWith('/auth/login'));
  return { page, url, text, apiCalls, leaked, painted };
}

(async () => {
  if (!chromePath) {
    console.error('No Chrome found. Set CHROME_PATH to the executable.');
    process.exit(2);
  }
  let sessions;
  try {
    sessions = {
      admin: await login('admin@isn.gov.my'),
      coach: await login('coach@isn.gov.my'),
      medical: await login('medical@isn.gov.my'),
      athlete: await login('athlete@isn.gov.my'),
    };
  } catch (e) {
    console.error(`${e.message}\nAre both servers running (npm run dev) and the database seeded?`);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1500, height: 1000 },
  });

  try {
    console.log('\n1. a signed-out visitor typing a URL');
    for (const route of ['/admin/dashboard', '/medical/dashboard', '/coach/dashboard', '/athlete/dashboard']) {
      const v = await visit(browser, route, null);
      check(`${route} bounces to the sign-in screen`, v.url === '/', `landed on ${v.url}`);
      check(`${route} paints nothing private`, !v.painted, v.painted);
      check(`${route} gets no data`, v.leaked.length === 0,
        v.leaked.map((c) => `${c.status} ${c.path}`).join(', '));
      await v.page.close();
    }

    console.log('\n2. a coach typing an admin URL');
    const v = await visit(browser, '/admin/personnel', sessions.coach);
    check('/admin/personnel bounces a coach', v.url === '/', `landed on ${v.url}`);
    check('/admin/personnel gives a coach no data', v.leaked.length === 0,
      v.leaked.map((c) => `${c.status} ${c.path}`).join(', '));
    await v.page.close();

    console.log('\n3. the pages a role owns actually render');
    for (const [role, route, expect] of [
      ['admin', '/admin/dashboard', /screening analytics/i],
      ['medical', '/medical/dashboard', /athlete/i],
      ['coach', '/coach/dashboard', /squad readiness/i],
    ]) {
      const r = await visit(browser, route, sessions[role]);
      check(`${route} renders for ${role}`, expect.test(r.text), r.text.slice(0, 60).replace(/\s+/g, ' '));
      const failed = r.apiCalls.filter((c) => c.status >= 400);
      check(`${route} makes no failing request`, failed.length === 0,
        failed.map((c) => `${c.status} ${c.path}`).join(', '));
      await r.page.close();
    }

    console.log('\n4. the readiness tiles account for everybody');
    // The 88% bug: three band tiles denominated over the whole squad while two
    // athletes had no screening. Read the rendered percentages back.
    const cd = await visit(browser, '/coach/dashboard', sessions.coach);
    const tiles = await cd.page.evaluate(() => Array.from(document.querySelectorAll('.stat-tile'))
      .map((el) => ({
        label: el.querySelector('.stat-tile-label')?.textContent?.trim() || '',
        value: el.querySelector('.stat-tile-value')?.textContent?.trim() || '',
      }))
      .filter((t) => /full-go|observation|restricted/i.test(t.label)));
    const pcts = tiles.map((t) => Number(String(t.value).replace('%', ''))).filter(Number.isFinite);
    const sum = pcts.reduce((a, b) => a + b, 0);
    check('three readiness tiles are rendered', pcts.length === 3, JSON.stringify(tiles));
    check('their percentages account for the screened squad', sum >= 99 && sum <= 101, `sum = ${sum}%`);
    check('the unscreened are stated rather than hidden',
      /screened athlete|never been screened|have a screening on record/i.test(cd.text));
    await cd.page.close();

    console.log('\n4b. the medical roster verdict agrees with the institution');
    // Module 6 shipped without a roster-level cohort verdict: the landing pane
    // ranked by HoloMotion's printed Exercise Risks score and told the clinician
    // to open an athlete one at a time for the actual band. The band counts are
    // now on the roster, and the thing worth checking is not that they RENDER
    // but that they AGREE — a second surface computing the same split slightly
    // differently is this project's whole defect class.
    //
    // Read from the API rather than the DOM, because the property under test is
    // the payload the page reads; the page rendering it is covered by section 6.
    {
      const res = await fetch(`${API}/athletes`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } });
      const list = await res.json();
      const c = { red: 0, amber: 0, green: 0, never: 0 };
      for (const a of list) {
        if (a.latestBand === 'red' || a.latestBand === 'amber' || a.latestBand === 'green') c[a.latestBand] += 1;
        else c.never += 1;
      }
      const banded = c.red + c.amber + c.green;
      check('the roster carries an effective band per athlete', banded > 0, JSON.stringify(c));
      // Every athlete is in exactly one bucket, including the never-screened —
      // the §33 rule that "not screened" is a state, not a quiet green.
      check('every athlete is accounted for exactly once', banded + c.never === list.length,
        `${banded} banded + ${c.never} never = ${list.length}`);
      // A never-screened athlete must NOT be given a band. Counting them green
      // is the reassurance failure §33 exists to prevent.
      const falseGreen = list.filter((a) => a.latestBand && a.overallActivityScore == null).length;
      check('a never-screened athlete carries no band', falseGreen === 0, `${falseGreen} with a band but no screening`);
    }

    console.log('\n4d. the programme comparison splits the institute rather than restating it');
    // Module 5's last deferred item. What is worth checking is not that a table
    // renders, but that its parts SUM to the whole the page states beside them —
    // a split that does not reconcile with its own headline is the two-surfaces
    // disagreement this project keeps finding.
    {
      const res = await fetch(`${API}/athletes/analytics/screening`, { headers: { Authorization: `Bearer ${sessions.admin.token}` } });
      const c = await res.json();
      const pts = c.points || [];
      check('every analytics point carries its programme', pts.length > 0 && pts.every((p) => 'programme' in p),
        `${pts.length} points`);

      const groups = {};
      for (const p of pts) { const k = p.programme || '(none)'; (groups[k] = groups[k] || []).push(p); }
      const summed = Object.values(groups).reduce((n, rows) => n + rows.length, 0);
      check('the programme groups account for every screened athlete', summed === c.screened,
        `${summed} grouped vs ${c.screened} screened`);

      // The institute mean recomputed from the same points must equal the
      // headline the page prints above the split.
      const all = pts.map((p) => p.totalScore).filter((v) => typeof v === 'number');
      const mean = all.length ? +(all.reduce((a, b) => a + b, 0) / all.length).toFixed(1) : null;
      check('the split reconciles with the institute headline', mean === c.averages.overallActivityScore,
        `points mean ${mean} vs headline ${c.averages.overallActivityScore}`);
    }

    console.log('\n4e. seasonality reaches the screen, and refuses to name a season it cannot support');
    // Added 2026-09-09. Seasonality sat on this page's payload from the day it
    // was built and only the PDF ever drew it, which broke the stated property
    // that the screen and the document cannot quote different KPIs off the same
    // util. The generalised lesson (SILENT_FAILURES 3n) is that a suite which
    // only asserts the ABSENCE of wrongness cannot tell a working panel from a
    // missing one — so this asserts PRESENCE, on the page, as the user sees it.
    {
      // /analytics/periods — the endpoint the page itself calls. The PDF is the
      // one named "programme-activity"; the JSON is not.
      const res = await fetch(`${API}/athletes/analytics/periods?grain=quarter`, {
        headers: { Authorization: `Bearer ${sessions.admin.token}` },
      });
      const data = await res.json();
      const season = data.seasonality;
      check('the activity payload carries seasonality', Boolean(season && season.buckets));

      const r = await visit(browser, '/admin/activity', sessions.admin);
      check('the seasonality card is on the page', /Seasonality/i.test(r.text));

      if (season) {
        // The refusal is the feature. Below two years a named "worst quarter" is
        // indistinguishable from the quarter the weaker squads were screened in,
        // and acting on it would move ISN's screening calendar for nothing.
        if (!season.sufficient) {
          check('it states plainly that this is not yet a seasonal reading',
            /not yet a seasonal reading/i.test(r.text));
          check('it names no worst quarter while insufficient',
            season.worst === null && !/highest flagged share/i.test(r.text));
          // The caveat must be READ FIRST. Underneath the table it arrives after
          // the reader has already picked a quarter out of the numbers.
          const low = r.text.toLowerCase();
          const caveatAt = low.indexOf('not yet a seasonal reading');
          const tableAt = low.indexOf('flagged share');
          check('the caveat is above the numbers, not below them',
            caveatAt > -1 && tableAt > -1 && caveatAt < tableAt, `caveat@${caveatAt} table@${tableAt}`);
        }
        // A quarter nobody screened in is not a quarter with no risk. Rendering
        // it as 0% would invent a reassuring reading out of an absence.
        const empty = season.buckets.filter((b) => b.tests === 0);
        if (empty.length) {
          check('quarters with no screening are not drawn as 0% risk', /not screened/i.test(r.text),
            `${empty.length} empty quarter(s)`);
        }
        // The screen must quote the same shares the util computed.
        const withData = season.buckets.filter((b) => b.flaggedShare !== null);
        const shown = withData.filter((b) => r.text.includes(`${Math.round(b.flaggedShare * 1000) / 10}%`));
        check('every computed share appears on the page', shown.length === withData.length,
          `${shown.length} of ${withData.length}`);
      }
    }

    console.log('\n4c. the personal watchlist is personal, and refuses the read-only roles');
    // Module 6's last deferred item. The properties worth checking in a live
    // system are the BOUNDARIES, not that a star renders: a watchlist is the
    // first per-user mutable state in AIRMS, so "whose is it" and "who may have
    // one" are the questions.
    {
      const call = async (token, method, path) => {
        const r = await fetch(`${API}${path}`, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(method === 'POST' ? { body: '{}' } : {}),
        });
        return r.status;
      };
      // coach and athlete are read-only roles; a watchlist is a write, and the
      // audit's headline property is that no read-only role completes one.
      check('a coach is refused a watchlist', await call(sessions.coach.token, 'GET', '/watchlist') === 403);
      check('an athlete is refused a watchlist', await call(sessions.athlete.token, 'GET', '/watchlist') === 403);

      const roster = await (await fetch(`${API}/athletes`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } })).json();
      const target = roster[0].athleteId;
      const before = await (await fetch(`${API}/watchlist`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } })).json();
      await call(sessions.medical.token, 'POST', `/watchlist/${target}`);
      // Twice, because a double-click must not produce two rows.
      await call(sessions.medical.token, 'POST', `/watchlist/${target}`);
      const after = await (await fetch(`${API}/watchlist`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } })).json();
      check('starring twice adds one entry', after.athletes.length === before.athletes.length + 1,
        `${before.athletes.length} -> ${after.athletes.length}`);
      // The admin has their own account, so their list must be unaffected.
      const adminList = await (await fetch(`${API}/watchlist`, { headers: { Authorization: `Bearer ${sessions.admin.token}` } })).json();
      check('another account does not see it', !adminList.athletes.some((a) => a.athleteId === target));

      await call(sessions.medical.token, 'DELETE', `/watchlist/${target}`);
      const cleaned = await (await fetch(`${API}/watchlist`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } })).json();
      check('unstarring removes it, leaving no residue', cleaned.athletes.length === before.athletes.length);
    }

    console.log('\n5. keyboard focus is visible where focus was removed once');
    const fp = await visit(browser, '/athlete/dashboard', sessions.athlete);
    const ring = await fp.page.evaluate(() => {
      const el = document.querySelector('.bm-card-item');
      if (!el) return { found: false };
      el.focus({ focusVisible: true });
      const cs = getComputedStyle(el);
      return { found: true, style: cs.outlineStyle, width: cs.outlineWidth };
    });
    if (ring.found) {
      check('body-map rows show a focus ring', ring.style !== 'none', `outline-style: ${ring.style}`);
    } else {
      check('body-map rows present to check', false, 'no .bm-card-item on the page');
    }
    await fp.page.close();
    console.log('\n6. nothing renders as a non-answer');
    // "NaN%", "undefined", "Invalid Date" and "[object Object]" are what a wrong
    // value looks like once it reaches a page. They are the visible end of this
    // project's whole defect class, they cost nothing to check, and no unit test
    // sees them because each one is produced by data meeting a template.
    const JUNK = ['NaN', 'undefined', 'Invalid Date', '[object Object]', 'null%', 'Infinity'];
    // Whole words, so "Green" is caught but "background" and a sport called
    // "Greenfield" are not. Shared with 6b so the two cannot drift apart.
    const COLOUR_WORDS = ['Green', 'Amber', 'Red'];
    for (const [role, route] of [
      ['admin', '/admin/dashboard'], ['admin', '/admin/activity'],
      ['admin', '/admin/audit'], ['admin', '/admin/reports'],
      ['admin', '/admin/thresholds'], ['admin', '/admin/personnel'],
      ['medical', '/medical/dashboard'], ['coach', '/coach/dashboard'],
      ['coach', '/coach/reports'],
      // The athlete pages carry the SCREENING DATES, and every other page in
      // this list happens not to. A mutation that broke date formatting passed
      // the whole section until these were added — the check was real, its page
      // list simply did not reach the code it guards.
      ['athlete', '/athlete/history'], ['athlete', '/athlete/dashboard'],
      ['athlete', '/athlete/squad'],
    ]) {
      const r = await visit(browser, route, sessions[role]);
      const found = JUNK.filter((j) => r.text.includes(j));
      check(`${route} shows no non-answer`, found.length === 0, found.join(', '));
      // A page that rendered its shell and nothing else is also a failure, and
      // reads as an ordinary empty state.
      check(`${route} rendered real content`, r.text.length > 400, `${r.text.length} chars`);
      // The colour-word check rides along on this SAME page load rather than
      // getting its own loop (§33 / SILENT_FAILURES 3i). It used to cover four
      // routes; this covers all twelve for no extra page visits and no extra
      // runtime, which is the cheapest coverage increase available here.
      //
      // 6b below still visits its four separately and deliberately — see the
      // note there: /athlete/dashboard is the only route that mounts
      // ScreeningHistory unconditionally, so it is the one that actually guards
      // that component. This pass is the wider net, not a replacement.
      const bare = COLOUR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(r.text));
      check(`${route} names no band by colour alone`, bare.length === 0, bare.join(', '));
      await r.page.close();
    }

    console.log('\n6b. a band is named clinically, never as a bare colour');
    // §33: a screening test cannot certify the absence of injury, so no surface
    // may reassure. "Green" in a table cell does exactly that, and the screening
    // history table did it until 2026-09-04 — from a FOURTH private band map,
    // which every unit test passed straight over because the wording was
    // internally consistent within that one file.
    //
    // Checked in the BROWSER because that is where the vocabulary is chosen: the
    // page picks the label, and a component reading the right constant and
    // rendering the wrong field would satisfy any source-level check.
    //
    // /athlete/dashboard is the route that carries the weight — it is the only
    // one here that mounts ScreeningHistory unconditionally. The coach and
    // medical dashboards mount it only once an athlete is selected, and
    // /athlete/history is a different page. Confirmed by restoring the colour
    // words and watching this fail; it fails on /athlete/dashboard alone, so do
    // not read the other three as covering that component.
    for (const [role, route] of [
      ['athlete', '/athlete/history'], ['athlete', '/athlete/dashboard'],
      ['coach', '/coach/dashboard'], ['admin', '/admin/dashboard'],
    ]) {
      const r = await visit(browser, route, sessions[role]);
      // COLOUR_WORDS, shared with the wider pass in section 6 — two lists of
      // band colours would be a fifth private band map, which is the very thing
      // SILENT_FAILURES 3i is about.
      const colours = COLOUR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(r.text));
      check(`${route} names no band by colour alone`, colours.length === 0, colours.join(', '));
      await r.page.close();
    }

    console.log('\n7. the body map and charts actually draw');
    // The body map is the licensed figure the whole product is built around, and
    // a chart that renders blank looks exactly like a chart with no data. Both
    // are geometry, so both can be counted. Thresholds are set well under what
    // was measured (2 figures, 156 regions) so ordinary content changes do not
    // trip them — this is asking "did it draw at all", not pinning a design.
    const drawn = async (label, session, route, click) => {
      const r = await visit(browser, route, session);
      if (click) {
        const clicked = await r.page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          el.click();
          return true;
        }, click);
        check(`${label}: an athlete can be opened`, clicked);
        await new Promise((x) => { setTimeout(x, 3500); });
      }
      const g = await r.page.evaluate(() => ({
        figures: document.querySelectorAll('.bm-fig').length,
        regions: document.querySelectorAll('.bodymap-region').length,
        richSvgs: Array.from(document.querySelectorAll('svg'))
          .filter((s) => s.querySelectorAll('path,rect,circle,line,polygon,polyline').length > 5).length,
      }));
      check(`${label}: body map draws its figures`, g.figures >= 2, `${g.figures} figure(s)`);
      check(`${label}: body map draws its regions`, g.regions > 50, `${g.regions} region(s)`);
      check(`${label}: charts carry geometry`, g.richSvgs >= 2, `${g.richSvgs} drawn svg(s)`);
      await r.page.close();
    };

    await drawn('athlete dashboard', sessions.athlete, '/athlete/dashboard', null);
    await drawn('coach detail', sessions.coach, '/coach/dashboard', '.athlete-row');
    await drawn('medical detail', sessions.medical, '/medical/dashboard', '.athlete-row');
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error('\nFAILED:');
    failed.forEach((f) => console.error(`  ${f.name}${f.detail ? `  — ${f.detail}` : ''}`));
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error(`\n${e.message}`);
  process.exit(2);
});
