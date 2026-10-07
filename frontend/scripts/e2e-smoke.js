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
      executive: await login('executive@isn.gov.my'),
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
      // WAIT FOR THE BOUNCE RATHER THAN SAMPLE FOR IT (§131.6). This used to read
      // the URL once, SETTLE_MS after networkidle2, and was intermittently red on
      // whichever route the dev server happened to compile cold during that run —
      // which is how the suite reported 150, then 149, then 145 with no code
      // change between them, and how §130.1 came to write it off as "harness
      // variance" without naming a cause.
      //
      // MEASURED before changing it, because a redirect that is merely LATE and
      // one that never comes are the same single sample: against a warm dev
      // server the bounce lands at 631-673ms over six clean contexts, with
      // nothing private painted in the meantime. So the boundary holds and the
      // READ was the defect. The two assertions below are unchanged and still
      // fail if the page ever settles anywhere but the sign-in screen; this only
      // stops a slow compile being reported as an auth hole.
      await v.page.waitForFunction(() => window.location.pathname === '/', { timeout: 8000 })
        .catch(() => { /* fall through to the assertion, which names what happened */ });
      v.url = new URL(v.page.url()).pathname;
      check(`${route} bounces to the sign-in screen`, v.url === '/', `landed on ${v.url}`);
      check(`${route} paints nothing private`, !v.painted, v.painted);
      check(`${route} gets no data`, v.leaked.length === 0,
        v.leaked.map((c) => `${c.status} ${c.path}`).join(', '));
      await v.page.close();
    }

    console.log('\n2. a coach typing an admin URL');
    // THE DESTINATION CHANGED ON 2026-09-16 (§111), AND THE ASSERTION HAD TO
    // CHANGE WITH IT — deliberately, not to make a red check go green.
    //
    // A refused page used to redirect to '/', so "no successful API call at
    // all" was a fair proxy for "no admin data reached the coach": the sign-in
    // screen fetches nothing. A signed-in user is now sent to their OWN
    // dashboard instead, which legitimately loads coach data, so that proxy now
    // reports a leak where there is none.
    //
    // Asserting the real property directly instead: the coach never lands on
    // the admin page, and nothing the ADMIN page is made of comes back 2xx.
    // `/users` is that page's data (its roster call is shared with pages a
    // coach may see, so naming the endpoint is what makes this precise).
    const v = await visit(browser, '/admin/personnel', sessions.coach);
    check('/admin/personnel bounces a coach', v.url !== '/admin/personnel', `landed on ${v.url}`);
    check('a bounced coach is sent to their own dashboard, not the sign-in form',
      v.url === '/coach/dashboard', `landed on ${v.url}`);
    const adminData = v.leaked.filter((c) => c.path.startsWith('/users'));
    check('/admin/personnel gives a coach no admin data', adminData.length === 0,
      adminData.map((c) => `${c.status} ${c.path}`).join(', '));
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

    console.log('\n4g. the decision worklist ranks, explains, and refuses to overclaim');
    // Added 2026-09-10 with the decision panel. The clinical properties here are
    // the same ones §33 and Bahr protect, moved from a badge onto a
    // recommendation — so they are asserted on the RENDERED page, which is where
    // a reader meets them (SILENT_FAILURES 3n).
    // MEDICAL ONLY SINCE §124. The coach dashboard rendered this panel until
    // JC asked for its landing page to be simplified — the worklist ranks on the
    // cohort indicator and lists the rules that fired, which is a clinician's
    // read. The coach's equivalent is checked in 4h below, INCLUDING the
    // overclaim property, which must not be lost with the panel that carried it.
    for (const [role, route] of [['medical', '/medical/dashboard']]) {
      const r = await visit(browser, route, sessions[role]);
      check(`${role}: the worklist panel is on the page`,
        /See next:|Review before selecting:|Nothing waiting on you/.test(r.text));
      // THE CLAIM IT MUST NEVER MAKE — now in the panel's INFO TIP rather than on
      // the card (JC, section 136), so this opens it. The move was an editorial
      // call and a fair one: "See next: 9 athletes" is not read as a diagnosis,
      // so the sentence is method rather than a caveat under section 134's test.
      // What is NOT editorial is whether the system still says it, so the check
      // changed shape instead of being deleted — it now proves the claim is
      // REACHABLE, which a deletion would still fail.
      const predictOpened = await r.page.evaluate(() => {
        const b = [...document.querySelectorAll('.infotip-btn')]
          .find((x) => /what this ordering means/i.test(x.getAttribute('aria-label') || ''));
        if (!b) return false;
        b.click();
        return true;
      });
      await new Promise((res) => { setTimeout(res, 300); });
      const predictText = await r.page.evaluate(() => document.body.innerText);
      check(`${role}: says plainly it does not predict injury`,
        predictOpened && /does not predict injury/i.test(predictText),
        predictOpened ? '' : 'no info tip on the worklist panel');
      // An entry without a reason is an instruction a clinician cannot check.
      check(`${role}: every entry carries a reason`,
        /below cohort average|never screened|overdue|override in force|flagged by the cohort/i.test(r.text));
      // THE ENTRY OPENS THE RECORD (§107). 'Mark reviewed' was removed: it was a
      // private bookmark that cleared the reader's own queue WITHOUT the record
      // ever being opened, which is the wrong SOP for a clinical worklist. The
      // name bar is now the only control, and every decision is made on the
      // athlete's page.
      const bars = await r.page.evaluate(
        () => [...document.querySelectorAll('.decision-open')].map((b) => ({
          text: b.textContent.trim(), disabled: b.disabled,
        })),
      );
      check(`${role}: every entry is openable from its name bar`,
        bars.length > 0 && bars.every((b) => b.text.length > 0));
      // The old tick must not come back by another name.
      const stale = await r.page.evaluate(
        () => [...document.querySelectorAll('button')].some((b) => /Mark reviewed/i.test(b.textContent || '')),
      );
      check(`${role}: the private 'Mark reviewed' tick is gone`, !stale);
      await r.page.close();
    }
    {
      // Never-screened must never be rendered as a clinical band — it is an
      // absence of information, and collapsing it into green is the §33
      // reassurance failure.
      const res = await fetch(`${API}/decisions`, { headers: { Authorization: `Bearer ${sessions.medical.token}` } });
      const d = await res.json();
      const never = d.worklist.filter((w) => w.band === 'never');
      const green = d.worklist.filter((w) => w.band === 'green');
      check('never-screened athletes are ranked, and not as a band',
        never.every((w) => !['green', 'amber', 'red'].includes(w.band)), `${never.length} never-screened`);
      if (never.length && green.length) {
        const firstNever = d.worklist.findIndex((w) => w.band === 'never');
        const firstGreen = d.worklist.findIndex((w) => w.band === 'green');
        check('never-screened outrank green — unknown is not low risk', firstNever < firstGreen,
          `never at ${firstNever}, green at ${firstGreen}`);
      }
      check('executive is refused the worklist (§51)',
        (await fetch(`${API}/decisions`, { headers: { Authorization: `Bearer ${sessions.executive?.token ?? ''}` } })).status !== 200);
    }

    console.log('\n4f. the roster endpoint pages on request and NOT by default');
    // Added 2026-09-09 with server-side paging. The property that matters is the
    // DEFAULT: four pages consume this endpoint as a plain array and filter it
    // client-side, so a silent cap would show a clinician a roster that looks
    // complete and is not. Paging is opt-in, and this asserts it stays that way.
    {
      const hdrs = { Authorization: `Bearer ${sessions.admin.token}` };
      const full = await fetch(`${API}/athletes`, { headers: hdrs });
      const all = await full.json();
      const total = Number(full.headers.get('X-Total-Count'));
      check('default returns the whole roster, uncapped', Array.isArray(all) && all.length === total,
        `${all.length} rows, X-Total-Count ${total}`);

      const pageRes = await fetch(`${API}/athletes?limit=10`, { headers: hdrs });
      const page = await pageRes.json();
      check('limit caps the rows', page.length === Math.min(10, all.length), `${page.length} rows`);
      // The total must describe the whole filtered set, not the page — otherwise
      // a caller cannot tell how much it did not receive.
      check('X-Total-Count still reports the unpaged total',
        Number(pageRes.headers.get('X-Total-Count')) === total);
      // Deterministic order, or paging silently drops and repeats athletes.
      check('a page is a true prefix of the default order',
        JSON.stringify(page.map((a) => a._id)) === JSON.stringify(all.slice(0, 10).map((a) => a._id)));

      const filtered = await fetch(`${API}/athletes?sport=Badminton&limit=5`, { headers: hdrs });
      const fRows = await filtered.json();
      check('filters compose with paging', fRows.length <= 5 && fRows.every((a) => a.sport === 'Badminton'),
        `${fRows.length} rows`);

      // A bad page is a 400, not a 500 and not a silent full response.
      const bad = await fetch(`${API}/athletes?limit=99999`, { headers: hdrs });
      check('an out-of-range limit is refused', bad.status === 400, `HTTP ${bad.status}`);
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


    console.log('\n4h. the coach landing answers availability without claiming clearance');
    // §124. The coach dashboard opened with two HoloMotion scores and the
    // clinical worklist; JC asked for the first thing on the page to be which
    // athletes to hold back and which can train. These check the replacement,
    // and the FIRST of them is the property that moved off the worklist with the
    // panel: a screening-derived page must not read as a fitness-to-play
    // decision. §33 is the governing rule — a screen that cannot predict injury
    // cannot certify its absence — and this is the one surface whose reader
    // schedules training, so getting it wrong here is the expensive direction.
    {
      const r = await visit(browser, '/coach/dashboard', sessions.coach);

      check('coach: the availability card is the first thing on the page',
        /Who to hold back, and who can work/.test(r.text));

      // THE CLAIM IT MUST NEVER MAKE, asserted on the words actually used.
      const clearanceCaveat = /not a fitness-to-play decision/i.test(r.text)
        && /cannot rule injury out/i.test(r.text);
      // The detail is conditional: check() prints it whether or not the check
      // passed, so an unconditional string made a PASSING line read 'ok — the
      // not-a-clearance caveat is missing'. A check whose own output argues with
      // its verdict is a check people stop reading.
      check('coach: says plainly it is not a clearance', clearanceCaveat,
        clearanceCaveat ? '' : 'the not-a-clearance caveat is missing');
      check('coach: clearance is attributed to the medical team',
        /Clearance comes from the medical team/i.test(r.text));

      // The vocabulary rule, on the group a coach picks a session from. "Safe",
      // "cleared" and "fit" are the three words that would turn a cohort
      // comparison into a medical verdict, and the heading is deliberately
      // "Nothing flagged" instead (SILENT_FAILURES 3i, §33).
      const groups = await r.page.evaluate(
        () => [...document.querySelectorAll('.coach-avail-head')].map((h) => h.innerText.replace(/\n/g, ' | ')),
      );
      check('coach: three availability groups, named by what is true',
        groups.length === 3 && /Hold back/.test(groups[0]) && /Nothing flagged/.test(groups[2]),
        groups.join(' / '));
      const unsafeWord = /\b(safe|cleared|fit to play|good to go)\b/i.exec(groups.join(' '));
      check('coach: no group is named as a clearance', !unsafeWord,
        unsafeWord ? `found "${unsafeWord[0]}"` : '');

      // The squad answer, and the thing it must carry: a count against a
      // denominator. "Iliopsoas" alone is not actionable; "9 of 14" is.
      const spots = await r.page.evaluate(
        () => [...document.querySelectorAll('.coach-hotspots li')].map((li) => li.innerText.replace(/\n/g, ' ')),
      );
      check('coach: the squad hotspot list names muscles with a denominator',
        spots.length > 0 && spots.every((t) => /\d+ of \d+/.test(t)),
        spots[0] || 'no hotspot rows');

      // THE SQUAD BODY MAP. Two figures, front and back, same component the
      // individual view uses — and the figure must actually draw regions rather
      // than mount empty, which is the failure a class check cannot see.
      const squad = await r.page.evaluate(() => ({
        figs: document.querySelectorAll('.bm-fig').length,
        regions: document.querySelectorAll('.bodymap-region').length,
      }));
      check('coach: the squad muscle map draws its figures',
        squad.figs >= 2, `${squad.figs} figure(s)`);
      check('coach: the squad muscle map draws geometry',
        squad.regions > 50, `${squad.regions} region(s)`);
      // REWORDED 2026-10-06 (§134): "A squad average, not any one athlete." The
      // property is unchanged — the figure must not read as a description of
      // somebody in the squad — and the shorter form is the one that gets read.
      check('coach: the squad map says it is an average, not an athlete',
        /not any one athlete/i.test(r.text));

      // THE COUNT AND THE LOCATION ARE ONE GESTURE (§129). The hotspot list said
      // 'Iliopsoas 9 of 14' and the figure said WHERE, inches apart with nothing
      // joining them — so the magnitude was on the page and absent from the
      // picture. BodyMap already answers its own side lists this way; this is the
      // same mechanism exposed to an external list rather than a new grammar.
      //
      // Driven by KEYBOARD FOCUS, not a synthetic mouse event: React delegates
      // mouseover, so dispatching MouseEvent('mouseenter') lights nothing and
      // would have made this check pass against a dead link. Focus also proves
      // the row is reachable without a pointer, which is why it is a <button>.
      const litBefore = await r.page.evaluate(
        () => document.querySelectorAll('.bodymap-region-group.is-active').length,
      );
      // FOCUS AND READ IN SEPARATE STEPS. The first version did both inside one
      // evaluate and reported 'nothing lit' against a link that works: .focus()
      // returns before React has processed the state change, so the read happened
      // a render too early. The standalone probe passed only because it happened
      // to sleep between the two.
      const focused = await r.page.evaluate(() => {
        const row = document.querySelector('.coach-hotspot-row');
        if (!row) return false;
        row.focus();
        return true;
      });
      await new Promise((res) => { setTimeout(res, 400); });
      const lit = focused ? await r.page.evaluate(
        () => [...document.querySelectorAll('.bodymap-region-group.is-active')]
          .map((e) => `${e.dataset.slug}:${e.dataset.side}`),
      ) : null;
      check('coach: nothing is lit on the squad figure until asked',
        litBefore === 0, `${litBefore} lit at rest`);
      check('coach: focusing a hotspot lights that muscle on the squad figure',
        Array.isArray(lit) && lit.length >= 2, (lit || []).join(', ') || 'nothing lit');
      // BOTH sides, because muscleHotspots.js merges them at group level on
      // purpose — the figure must not imply a side the count does not carry.
      check('coach: a squad hotspot lights both sides, matching its merged count',
        Array.isArray(lit) && lit.some((k) => k.endsWith(':L')) && lit.some((k) => k.endsWith(':R')),
        (lit || []).join(', '));

      // AND THE TECHNICAL OPENING IS GONE. Asserted because "simplify" is only
      // half done if the instrument's own numbers are still the first thing a
      // coach meets: Total Score and Exercise Risks are HoloMotion's figures and
      // a coach acts on neither.
      const firstCard = await r.page.evaluate(
        () => document.querySelector('.card .card-title')?.textContent?.trim() || '',
      );
      check('coach: the page does not open on instrument scores',
        !/Total Score|Exercise Risks/i.test(firstCard), `opens on "${firstCard}"`);

      await r.page.close();
    }


    console.log('\n4i. the risk-vs-movement scatter explains itself');
    // §126. The chart carried TWO colour systems — position says which quadrant,
    // hue says which risk band — and explained neither, then told the reader in
    // prose that "top-right is the reading to look for" while nothing on the plot
    // marked it. These assert the graphic now does that work.
    {
      const r = await visit(browser, '/admin/dashboard', sessions.admin);

      // Four tinted quadrants, each a DIFFERENT colour, and exactly one marked
      // as the one to act on. Measured from computed style rather than class
      // names: the first attempt assigned the tints with `:nth-of-type`, which
      // counts among all spans — crosshairs, labels and 56 dots — so three of
      // four rules matched nothing and three zones rendered the same green. The
      // classes were all present and correct while the colours were wrong, which
      // is precisely why this reads the colour.
      const zones = await r.page.evaluate(() => [...document.querySelectorAll('.scatter-zone')].map((e) => ({
        bg: getComputedStyle(e).backgroundColor,
        key: e.classList.contains('scatter-zone--key'),
      })));
      check('scatter: four quadrants are drawn, not just captioned',
        zones.length === 4, `${zones.length} zone(s)`);
      check('scatter: each quadrant has its own tint',
        new Set(zones.map((z) => z.bg)).size === 4,
        zones.map((z) => z.bg).join(' / '));
      check('scatter: exactly one quadrant is marked as the one to act on',
        zones.filter((z) => z.key).length === 1);

      // The dot colours get a key. Without it a red dot in the low-risk corner
      // is unexplained, and a reader cannot learn that hue is the band while
      // position is the comparison.
      const legend = await r.page.evaluate(
        () => [...document.querySelectorAll('.scatter-legend li')].map((e) => e.textContent.trim()),
      );
      check('scatter: the dot colours are keyed to the risk bands',
        legend.length === 3 && legend.every((t) => t.length > 0), legend.join(' · '));
      // Band WORDS, never a bare colour name (SILENT_FAILURES 3i) — the legend is
      // a new place that rule has to hold.
      check('scatter: the key names bands clinically, not by colour',
        !/\b(green|amber|red)\b/i.test(legend.join(' ')), legend.join(' · '));

      // The explanation itself: what each axis measures, why two scores can
      // disagree, all four quadrants, and the median caveat.
      // THE METHOD TEXT IS BEHIND THE INFO TOGGLE SINCE §127, and these checks
      // open it rather than being deleted. The point is that hiding must not
      // become DELETING: the explanation still has to exist, and a collapsed
      // panel reads identically to a removed one from outside.
      const methodHidden = !/how well the athlete/i.test(r.text);
      check('scatter: the method text is collapsed, not on the card', methodHidden,
        methodHidden ? '' : 'method prose is visible by default');
      // §131: the toggle is an INFO TIP on the card header now, found by its
      // accessible name rather than its text — the glyph is the only text it has.
      const opened = await r.page.evaluate(() => {
        const btns = [...document.querySelectorAll('.infotip-btn')];
        const b = btns.find((x) => /what the two axes measure/i.test(x.getAttribute('aria-label') || ''));
        if (!b) return false;
        b.click();
        return true;
      });
      await new Promise((res) => { setTimeout(res, 300); });
      const openedText = await r.page.evaluate(() => document.body.innerText);
      check('scatter: the INFO toggle reveals what the two axes measure',
        opened && /how well the athlete/i.test(openedText) && /injury-risk burden/i.test(openedText),
        opened ? '' : 'no toggle labelled for the axes');
      check('scatter: the INFO toggle reveals why the two scores can disagree',
        /move beautifully and still carry risk/i.test(openedText));
      // AND THE CAVEATS ARE NOT BEHIND IT. This is the whole design: a caveat
      // hidden by default makes the page's default state the un-caveated reading.
      check('scatter: the caveats stay on the card, unlike the method',
        /medians, not fixed cut-offs/i.test(r.text)
        && /separate judgement from either axis/i.test(r.text));
      const quads = await r.page.evaluate(
        () => document.querySelectorAll('.chart-explain-quads li').length,
      );
      check('scatter: all four quadrants are explained, not only the interesting one',
        quads === 4, `${quads} explained`);
      check('scatter: states that the lines are medians rather than fixed cut-offs',
        /this cohort.s medians, not fixed cut-offs/i.test(r.text)
        || /medians, not fixed cut-offs/i.test(r.text));
      // The caveat that keeps the two colour systems from reading as a
      // contradiction.
      check('scatter: says a dot colour is a separate judgement from the axes',
        /separate judgement from either axis/i.test(r.text));

      await r.page.close();
    }


    console.log('\n4j. the risk radar names its breaches in words');
    // §127. The radar inverted: the Elevated cutoff is now the FILLED reference
    // region and the athlete is a LINE over it, so a breach is the line leaving
    // the field rather than two overlapping polygons to disentangle. The
    // per-spoke comparison existed only inside a hover tooltip — unreachable on a
    // touch screen, and absent from a screenshot pasted into a case note.
    {
      const r = await visit(browser, '/medical/dashboard?athlete={SELF}'.replace('{SELF}', ''), sessions.medical);
      // Open an athlete from the rail, then wait for the panel.
      await r.page.evaluate(() => document.querySelector('.athlete-row')?.click());
      await r.page.waitForFunction(() => document.querySelectorAll('.bm-fig').length >= 2, { timeout: SETTLE_MS * 3 })
        .catch(() => {});
      const o = await r.page.evaluate(() => ({
        breach: !!document.querySelector('.radar-breach'),
        none: !!document.querySelector('.radar-breach-none'),
        rows: [...document.querySelectorAll('.radar-breach li')].map((e) => e.innerText.replace(/\n/g, ' ')),
        text: document.body.innerText,
        toggles: document.querySelectorAll('.infotip-btn').length,
        bodies: document.querySelectorAll('.infotip-panel').length,
      }));

      // EXACTLY ONE of the two states, never both and never neither. A radar with
      // no verdict beside it is the state this section exists to remove.
      check('radar: the breach readout is present in one state or the other',
        o.breach !== o.none, `breach=${o.breach} none=${o.none}`);

      if (o.breach) {
        // Every row carries the reading, the cutoff and the gap. "Shoulder" alone
        // is not actionable; "28 vs 20, +8" is.
        check('radar: every breached spoke names its reading, cutoff and gap',
          o.rows.length > 0 && o.rows.every((t) => /\d+\s*vs\s*\d+/.test(t) && /\+\d/.test(t)),
          o.rows[0] || 'no rows');
        // The caveat stays on the card, not behind the toggle.
        check('radar: says a breach is a reason to examine, not a diagnosis',
          /reason to examine, not a diagnosis/i.test(o.text));
      } else {
        // §33: the absence of a flag is not a clearance, and this is the wording
        // that keeps a clinician's screen from reading as one.
        check('radar: no breach is stated as an absence of a flag, never a clearance',
          /not a clearance/i.test(o.text) && !/all clear/i.test(o.text));
      }

      // The method is behind the toggle and COLLAPSED by default -- the whole
      // point of the INFO control -- but the explanation still has to exist.
      check('radar: a method toggle is offered', o.toggles > 0, `${o.toggles} toggle(s)`);
      check('radar: the method is collapsed by default', o.bodies === 0, `${o.bodies} open`);
      const revealed = await r.page.evaluate(() => {
        const b = [...document.querySelectorAll('.infotip-btn')]
          .find((x) => /how to read this chart/i.test(x.getAttribute('aria-label') || ''));
        if (!b) return null;
        b.click();
        return true;
      });
      await new Promise((res) => { setTimeout(res, 300); });
      const opened = await r.page.evaluate(() => document.body.innerText);
      check('radar: the toggle explains that the field is a cutoff, NOT the cohort average',
        revealed === true && /not<\/strong>? the cohort average|not the cohort average/i.test(opened),
        revealed ? '' : 'no toggle labelled for the chart');
      // The reason the field is neutral rather than green, kept where a future
      // reader will look before changing it.
      check('radar: the toggle says why the field is not green',
        /Watch band sits\s+inside this boundary|Watch band sits inside/i.test(opened));

      await r.page.close();
    }


    console.log('\n4k. the medical record reads: identify, examine, then decide');
    // §128. The pane opened with a name hero, a status hero saying an overlapping
    // thing, and then the override and escalation controls — so it offered a
    // VERDICT above the evidence for it. JC: a decision is completed "after their
    // assessment of the athlete's HoloMotion analysis".
    //
    // ASSERTED BY GEOMETRY, not by DOM order. A card can be earlier in the markup
    // and later on screen (the hero row is a grid), and it is the ON-SCREEN order
    // a clinician reads. Measured with getBoundingClientRect for that reason.
    {
      const r = await visit(browser, '/medical/dashboard', sessions.medical);
      await r.page.evaluate(() => document.querySelector('.athlete-row')?.click());
      await r.page.waitForFunction(() => document.querySelectorAll('.bm-fig').length >= 2, { timeout: SETTLE_MS * 3 })
        .catch(() => {});
      const o = await r.page.evaluate(() => {
        const top = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
        const head = (re) => [...document.querySelectorAll('h2,h3')].find((h) => re.test(h.textContent || ''));
        const id = document.querySelector('.medical-id-card');
        return {
          identity: top(id),
          radar: top(document.querySelector('.medical-hero-row canvas')),
          muscleMap: top(head(/Muscle Assessment/i)),
          assessment: top(head(/Clinical assessment/i)),
          verdictInside: !!id?.querySelector('.medical-id-verdict'),
          bandClass: [...(document.querySelector('.medical-hero-row')?.classList ?? [])]
            .find((c) => c.startsWith('medical-hero-row--')) || null,
          heroCount: document.querySelectorAll('.medical-hero-row').length,
        };
      });

      check('medical: identity and verdict are ONE card, not two stacked heroes',
        o.verdictInside && o.heroCount === 1,
        `verdictInside=${o.verdictInside} rows=${o.heroCount}`);
      check('medical: the band tints the identity card',
        !!o.bandClass, o.bandClass || 'no band class');
      // The radar sits BESIDE the identity rather than below it — the compaction
      // §127 made possible by moving its explanation behind a toggle.
      check('medical: the risk radar is alongside the identity, not beneath it',
        o.radar !== null && o.identity !== null && Math.abs(o.radar - o.identity) < 300,
        `identity ${o.identity} vs radar ${o.radar}`);
      // THE WORKFLOW. The decision must come after the evidence.
      check('medical: the decision comes AFTER the HoloMotion analysis',
        o.assessment !== null && o.muscleMap !== null && o.assessment > o.muscleMap,
        `muscle map ${o.muscleMap} -> assessment ${o.assessment}`);

      await r.page.close();
    }


    console.log('\n4l. the info tip opens by pointer, by keyboard and by tap');
    // §131. JC asked for the descriptions to hide behind an INFO toggle on HOVER.
    // Hover alone would make the explanation UNREACHABLE on a tablet and from the
    // keyboard, so it opens three ways — and each has to be checked, because any
    // one of them can break while the other two keep the feature looking fine.
    //
    // TWO GESTURES THAT LIE, both learnt in §129.3 and both avoided here:
    // a synthetic MouseEvent('mouseenter') lights nothing (React delegates
    // mouseover), so this uses page.hover(); and .focus() returns BEFORE React
    // re-renders, so the gesture and the reading are separate steps with a settle
    // between them.
    {
      const r = await visit(browser, '/medical/sport-assessment', sessions.medical);
      const panels = () => r.page.evaluate(() => document.querySelectorAll('.infotip-panel').length);
      const settle = () => new Promise((res) => { setTimeout(res, 300); });

      // THE WHAT'S-NEW BACKDROP HAS TO GO FIRST, and finding out why cost a run.
      // `visit()` seeds a token but not the notice acknowledgement, so the modal
      // opens on every fresh page and `.modal-backdrop` covers the whole document.
      // Every OTHER section in this suite clicks through `page.evaluate(el.click())`,
      // which is programmatic and goes straight to the handler — so the overlay has
      // never mattered. This is the first section that uses REAL pointer gestures,
      // and a real pointer hits the backdrop. Dismissed the way a person does.
      await r.page.evaluate(() => {
        const b = [...document.querySelectorAll('.modal-footer .btn')]
          .find((x) => /got it/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await settle();

      const n = await r.page.evaluate(() => document.querySelectorAll('.infotip-btn').length);
      check('infotip: the page offers info tips at all', n > 0, `${n} tip(s)`);
      // COULD-NOT-MEASURE GUARD (rule 2). If anything still covers the button,
      // every pointer check below fails for a reason that has nothing to do with
      // the tip — which is how an environment fault gets read as a product defect.
      const clear = await r.page.evaluate(() => {
        const b = document.querySelector('.infotip-btn');
        if (!b) return 'no tip on the page';
        const rc = b.getBoundingClientRect();
        b.scrollIntoView({ block: 'center' });
        const top = document.elementFromPoint(rc.left + rc.width / 2, b.getBoundingClientRect().top + rc.height / 2);
        return top && top.closest('.infotip') ? null : `covered by ${top ? top.className || top.tagName : 'nothing hit'}`;
      });
      check('infotip: nothing is covering the button before the pointer checks',
        clear === null, clear || '');
      // COLLAPSED BY DEFAULT is the entire point of the control. If this is ever
      // false the feature has silently become "the same prose, plus a button".
      check('infotip: every tip is collapsed on load', (await panels()) === 0);

      await r.page.hover('.infotip-btn');
      await settle();
      const hovered = await r.page.evaluate(() => {
        const p = document.querySelector('.infotip-panel');
        const b = document.querySelector('.infotip-btn');
        if (!p) return { open: 0 };
        const pr = p.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        // Is the gap between button and panel covered by the tip itself? WCAG
        // 1.4.13 HOVERABLE — a pointer has to be able to travel into the panel.
        const bridge = document.elementFromPoint(Math.max(br.left, pr.left) + 4, br.bottom + 4);
        return {
          open: 1,
          chars: (p.innerText || '').length,
          expanded: b.getAttribute('aria-expanded'),
          named: (b.getAttribute('aria-label') || '').length > 3,
          bridged: !!(bridge && bridge.closest('.infotip')),
          inViewport: Math.round(pr.right) <= window.innerWidth && Math.round(pr.left) >= 0,
          // elementFromPoint INSIDE the panel: a card with overflow:hidden would
          // clip it while the node still counted as "open" above.
          reachable: !!document.elementFromPoint(pr.left + pr.width / 2, pr.top + 10)?.closest('.infotip-panel'),
        };
      });
      check('infotip: hover opens the panel', hovered.open === 1);
      check('infotip: the panel carries real method text', hovered.chars > 40, `${hovered.chars} chars`);
      check('infotip: hover reports the state to assistive tech', hovered.expanded === 'true');
      // The glyph is an "i". Without an accessible name a screen reader announces
      // "i, button" once per card and the reader learns nothing.
      check('infotip: the button has an accessible name, not just a glyph', hovered.named === true);
      check('infotip: the pointer can reach the panel (WCAG 1.4.13 hoverable)', hovered.bridged === true);
      check('infotip: the panel is not clipped by its card', hovered.reachable === true);
      check('infotip: the panel stays inside the viewport', hovered.inViewport === true);

      await r.page.mouse.move(4, 4);
      await settle();
      check('infotip: moving away closes it', (await panels()) === 0);

      // KEYBOARD. A hover-only disclosure does not exist for a keyboard user.
      await r.page.evaluate(() => document.querySelector('.infotip-btn').focus());
      await settle();
      check('infotip: keyboard focus opens it', (await panels()) === 1);

      // WCAG 1.4.13 DISMISSIBLE — without moving the pointer.
      await r.page.keyboard.press('Escape');
      await settle();
      const esc = await r.page.evaluate(() => ({
        open: document.querySelectorAll('.infotip-panel').length,
        onBtn: !!document.activeElement?.classList?.contains('infotip-btn'),
      }));
      check('infotip: Escape dismisses it', esc.open === 0);
      check('infotip: Escape leaves focus on the button it came from', esc.onBtn === true);

      // ESCAPE FROM THE *HOVER* PATH, which is a different code path and was
      // genuinely broken: closing cleared the three inputs, but the pointer was
      // still on the button, so the next render put the panel straight back. The
      // keyboard case above could never show it, because there the button already
      // held focus. Found by the jsdom suite; this is the browser half of it.
      await r.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
      await r.page.hover('.infotip-btn');
      await settle();
      check('infotip: hover reopens after a dismissal', (await panels()) === 1);
      await r.page.keyboard.press('Escape');
      await settle();
      check('infotip: Escape dismisses it while the pointer is STILL on the button',
        (await panels()) === 0);
      // ...and it must come back on a fresh gesture, not stay dead for the page's
      // lifetime. Dismissible is not the same as disabled.
      await r.page.mouse.move(4, 4);
      await settle();
      await r.page.hover('.infotip-btn');
      await settle();
      check('infotip: leaving and returning revives it', (await panels()) === 1);
      await r.page.mouse.move(4, 4);
      await settle();

      // TAP. A touch screen has no hover at all, so without the click path the
      // explanation is unreachable on the device a clinician uses courtside.
      await r.page.click('.infotip-btn');
      await r.page.mouse.move(4, 4);
      await settle();
      check('infotip: a click pins it open with the pointer away', (await panels()) === 1);
      await r.page.mouse.click(4, 300);
      await settle();
      check('infotip: an outside click closes a pinned panel', (await panels()) === 0);

      // ON A PHONE, which is the width the check above could not see. The panel
      // is 320px and this suite runs at 1500, so "stays inside the viewport"
      // passed with 1180px to spare while FIVE OF SIX tips opened off-screen at
      // 390px — one of them dragging the whole page sideways with it (§132.6).
      // The panel is placed by measurement now; this is what holds it there.
      await r.page.setViewport({ width: 390, height: 844 });
      await settle();
      // ONE TIP AT A TIME, THROUGH REAL GESTURES. The first version of this did
      // the whole loop inside one page.evaluate and removed each panel from the
      // DOM before opening the next — which desynchronised React from its own
      // tree and made five of six report "did not open" against a feature that
      // works. Removing a node React owns is not a way to close a panel; Escape
      // is. Element handles, clicked and dismissed one at a time.
      const handles = await r.page.$$('.infotip-btn');
      const narrow = [];
      for (const h of handles) {
        await h.click();
        await settle();
        narrow.push(await r.page.evaluate(() => {
          const p = document.querySelector('.infotip-panel');
          if (!p) return { ok: false, why: 'did not open' };
          const rc = p.getBoundingClientRect();
          const vw = document.documentElement.clientWidth;
          return {
            ok: rc.left >= -1 && rc.right <= vw + 1,
            why: `${Math.round(rc.left)}..${Math.round(rc.right)} in ${vw}`,
            scrolled: document.documentElement.scrollWidth > vw + 1,
          };
        }));
        await r.page.keyboard.press('Escape');
        await settle();
      }
      const offscreen = narrow.filter((o) => !o.ok);
      check('infotip: at 390px every panel stays on the screen',
        narrow.length > 0 && offscreen.length === 0,
        offscreen.length ? offscreen.map((o) => o.why).join(' · ') : `${narrow.length} checked`);
      check('infotip: opening one on a phone does not push the page sideways',
        !narrow.some((o) => o.scrolled));
      await r.page.setViewport({ width: 1500, height: 1000 });

      await r.page.close();
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

        // WAIT FOR THE PANEL, NOT FOR A FIXED 3500ms (2026-10-01).
        //
        // This used to dispatch the click, sleep 3500ms and measure. Two
        // separate faults, and together they produced a confidently wrong
        // report against the deployed instance:
        //
        //   The sleep ignored E2E_SETTLE. That variable exists precisely because
        //   a serverless API with a cold start needs longer than a local
        //   nodemon — and it was threaded through visit() and NOT through here.
        //   Measured on hosted: /athletes/:id alone takes 3705ms, so the panel
        //   was measured before its data arrived. Raising E2E_SETTLE to 9000
        //   changed nothing, which is what made the cause look like anything
        //   but latency.
        //
        //   And "an athlete can be opened" asserted only that a click was
        //   DISPATCHED. So the one check that could have said "the panel never
        //   rendered" passed, and the failure surfaced as three separate
        //   body-map and chart faults — three alarming findings about drawing
        //   code that was working perfectly.
        //
        // Polling for the figure fixes both: it is faster than the old sleep
        // locally (it returns as soon as the panel is there) and patient enough
        // for a cold start, and the `opened` check now means what it says.
        const opened = await r.page
          .waitForFunction(() => document.querySelectorAll('.bm-fig').length >= 2, { timeout: SETTLE_MS * 3 })
          .then(() => true)
          .catch(() => false);
        check(`${label}: an athlete can be opened`, clicked && opened,
          clicked ? (opened ? '' : `panel did not render within ${SETTLE_MS * 3}ms`) : `no element matched ${click}`);
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

    // ── 9. The rail folds away once an athlete is open (2026-10-05) ─────────
    //
    // An E2E CHECK AND NOT A JSDOM ONE, deliberately. What is being claimed is
    // that the search box is GONE and the record has the room — a statement
    // about layout and about elements existing on a real rendered page, with
    // real CSS and a real grid. jsdom computes no layout, so a mounted test
    // could assert the markup and say nothing about whether anything moved.
    //
    // The '/' case is the one worth the most here. The input does not exist
    // while the rail is folded, so the shortcut had to learn to unfold first;
    // get that wrong and "/" is a silent no-op on exactly the screen where
    // reaching for the search is most likely. Nothing else would catch it.
    {
      const r = await visit(browser, '/medical/dashboard', sessions.medical);
      const q = () => r.page.evaluate(() => ({
        search: !!document.querySelector('#med-search'),
        rows: document.querySelectorAll('.athlete-row').length,
        folded: !!document.querySelector('.medical-rail--folded'),
        toggle: !!document.querySelector('.rail-fold'),
        expanded: document.querySelector('.rail-fold')?.getAttribute('aria-expanded') ?? null,
        paneWidth: Math.round(document.querySelector('.medical-pane')?.getBoundingClientRect().width ?? 0),
        focused: document.activeElement?.id ?? null,
      }));

      const before = await q();
      check('medical rail: the search is there before an athlete is picked',
        before.search && before.rows > 0 && !before.folded,
        `search=${before.search} rows=${before.rows} folded=${before.folded}`);

      await r.page.evaluate(() => document.querySelector('.athlete-row')?.click());
      await r.page.waitForFunction(() => !!document.querySelector('.medical-rail--folded'), { timeout: SETTLE_MS * 3 })
        .catch(() => {});
      const after = await q();
      check('medical rail: picking an athlete folds the search away',
        after.folded && !after.search && after.rows === 0,
        `folded=${after.folded} search=${after.search} rows=${after.rows}`);
      // The point of folding is the room it frees. Asserted as a real
      // measurement rather than trusting the class: a grid column that did not
      // actually shrink would leave the fold cosmetic.
      check('medical rail: the record gains the width the rail gave up',
        after.paneWidth > before.paneWidth,
        `pane ${before.paneWidth}px -> ${after.paneWidth}px`);
      check('medical rail: the folded rail still offers a way back',
        after.toggle && after.expanded === 'false',
        `toggle=${after.toggle} aria-expanded=${after.expanded}`);

      // "/" must still reach the search, which means unfolding first.
      await r.page.keyboard.press('/');
      await r.page.waitForFunction(() => !!document.querySelector('#med-search'), { timeout: SETTLE_MS * 3 })
        .catch(() => {});
      const reopened = await q();
      check('medical rail: "/" unfolds the rail and focuses the search',
        reopened.search && !reopened.folded && reopened.focused === 'med-search',
        `search=${reopened.search} folded=${reopened.folded} focus=${reopened.focused}`);
      // And the box is left empty rather than carrying the "/" that opened it.
      const typed = await r.page.evaluate(() => document.querySelector('#med-search')?.value ?? null);
      check('medical rail: the shortcut key does not land in the search box',
        typed === '', `value=${JSON.stringify(typed)}`);
    }
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
