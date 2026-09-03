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
  await new Promise((r) => { setTimeout(r, 1200); });
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
