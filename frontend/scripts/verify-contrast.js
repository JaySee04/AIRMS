// Measure TEXT CONTRAST on every authenticated page, in both themes, in a real
// browser — and FAIL if anything is below WCAG 2.2 AA.
//
// WHY THIS EXISTS. "Beautify" against a locked Figma UI is mostly not a licence
// to redesign; it is a licence to fix what is objectively wrong. Contrast is the
// part of visual quality that has a NUMBER — 4.5:1 for body text, 3:1 for large
// text (>=18.66px, or >=14px bold) — so it is the part that can be guarded
// rather than argued about. DESIGN_DECISIONS §120 and §121 rest entirely on this
// measurement, and until now it lived in a scratch folder: two sections of the
// record with no command behind them.
//
// WHY IT READS THE BROWSER AND NOT THE STYLESHEET. Every interesting failure
// here was invisible in the CSS:
//
//   - a bare <button> does not inherit `color`; the UA sets `buttontext`, which
//     is how the signed-in user's own name sat at 1.36:1 on the dark topbar of
//     ten pages (§120);
//   - `--brand-navy` is declared once, outside any theme block, so the score
//     line and its axis measured 14.19:1 light and 1.09:1 dark — invisible, not
//     merely low (§121.4);
//   - `.screening-strip-star` read `var(--secondary, #c89b3c)` and --secondary
//     is declared NOWHERE, so every render silently took the fallback (§121.5).
//
// None of those is a rule you can look at and call wrong. All three are obvious
// the moment you ask the browser what colour actually came out.
//
// THE SURFACE IS MEASURED, NOT INFERRED. The first version walked ANCESTORS for
// the first opaque background. That is a guess about what is behind an element,
// and it does not hold for anything positioned outside its parent's box:
// `.histogram-n` sits at top:-14px, entirely above its bar, and the walk called
// it 1.04:1 when it measures 5.28. Two non-defects were written into §120.5 as
// pending work on that basis. `bgOf` now takes the element's own background
// first, then asks `document.elementsFromPoint` — the layout engine's own answer
// — and only falls back to the walk for a point outside the viewport.
//
// --canary PROVES IT CAN STILL FAIL. A clean run is only worth something if a
// dirty one would have been caught, and this check is one bad selector away from
// silently measuring nothing. The canary plants a known-bad rule in the live
// page and requires the audit to report it; a canary that comes back CLEAN fails
// the run. Same standing-control shape as `npm run mutate`'s entry #1.
//
// NEEDS `npm run dev` (or any instance — set CONTRAST_WEB / CONTRAST_API).
// Unlike verify:csp this does NOT need a production build: contrast is a
// property of the stylesheet, which `next dev` serves unchanged.
//
// EVERY PAGE MUST PROVE IT WAS MEASURED. This is the failure mode that would
// make the whole thing worthless, and it is silent by construction: an expired
// session, a renamed route, a role losing access or a backend that stopped
// answering all end with the browser on the sign-in screen, which has about six
// text nodes and no contrast problems. The audit would sweep eleven of those and
// report a confident, green ZERO. So each visit asserts it LANDED on the route
// it asked for and that the page carries enough text and enough measurable
// elements to be the page — and a visit that cannot be measured FAILS the run
// rather than quietly contributing nothing to it.
//
// EXIT CODES  0 no failures · 1 a failure was found, or a page could not be
//             measured · 2 could not run at all
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const WEB = process.env.CONTRAST_WEB || process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.CONTRAST_API || process.env.E2E_API || 'http://localhost:5000/api';
const SETTLE = Number(process.env.CONTRAST_SETTLE || 2200);
const CANARY = process.argv.includes('--canary');
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  process.env.CHROME_PATH,
].filter(Boolean);

// The page list lives in scripts/lib/pages.js — one definition, shared with
// verify-a11y.js, and guarded against src/app by src/app/contrastPages.test.ts.
// It was a hand-kept list here and drifted: see §121.8.
const { PAGES } = require('./lib/pages');

// The canary is a real rule on a real element, not a synthetic node: it has to
// travel the same path a genuine defect would. Grey-on-white at ~1.4:1.
const CANARY_CSS = '.card, .card * { color: #eef0f3 !important; }';
const CANARY_INK = '#eef0f3';
// The same colour as getComputedStyle reports it. Written out rather than
// derived, so the two can be read side by side and checked by eye.
const CANARY_RGB = 'rgb(238, 240, 243)';
const CANARY_MIN = 8;   // a page full of cards yields far more than this

// A measured page must clear both. MEASURED, not guessed, because the first
// pass guessed and the floors then failed three pages that had rendered
// perfectly well:
//
//   signed-out sign-in screen    8 elements /  218 characters
//   Next's 404 page              4 elements /  153 characters
//   /medical/data-upload        12 elements /  555 characters  <- leanest real page
//   /admin/settings             32 elements / 2369 characters
//
// So the floors sit in the gap between a non-page and the thinnest real one. The
// route assertion is the primary guard — a bounce lands on '/' and is caught by
// path alone — and these are the backstop for the case it cannot see: the right
// URL rendering nothing but its shell.
const MIN_TEXT = 300;
const MIN_ELEMENTS = 10;

/** First line of an error, for a one-line report. Puppeteer's messages carry a
 *  whole stack and the useful part is always the first line. */
const firstLine = (e) => String(e && e.message ? e.message : e).split(/\r?\n/)[0];

async function login(email) {
  let r;
  try {
    r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'airms2026' }),
    });
  } catch (e) {
    // fetch rejects for a dead host with a message that names no host at all
    // ("fetch failed"), which sends the reader to the wrong place entirely.
    throw new Error(`cannot reach the API at ${API} (${e.cause?.code || e.message})`);
  }
  if (r.status === 401) throw new Error(`login ${email} -> 401. The demo accounts are seeded by \`npm run seed\`; this needs the seeded password.`);
  if (r.status === 429) throw new Error(`login ${email} -> 429. The auth throttle is engaged — wait for the window to clear, or run against a loopback instance, which is exempt.`);
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  const s = await r.json();
  // A 200 with no token would let every page boot signed-OUT and the sweep would
  // measure eleven sign-in screens. Refuse here, where the cause is still legible.
  if (!s || !s.token || !s.user) throw new Error(`login ${email} -> 200 but no token in the reply`);
  return s;
}

const IN_PAGE = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => {
    const l1 = lum(a); const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // What the text ACTUALLY sits on. See the header note — the element's own
  // background, then the layout engine, then the ancestor walk as a last resort.
  const bgOf = (el) => {
    const own = parse(getComputedStyle(el).backgroundColor);
    if (own && own.a > 0.85) return own;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    for (const n of document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2)) {
      if (n === el || el.contains(n)) continue;
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.85) return c;
    }
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.85) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };

  const out = [];
  // COUNTED, NOT ASSUMED. `scanned` is how many elements actually reached the
  // contrast test — the denominator behind a "0 findings" result. Without it,
  // zero findings and zero elements examined print the same thing.
  let scanned = 0;
  for (const el of document.querySelectorAll('body *')) {
    // Leaf nodes only: a wrapper's textContent is its children's, and blaming
    // the wrapper reports one defect per level of nesting.
    if (el.children.length) continue;
    const text = (el.textContent || '').trim();
    if (text.length < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    const fg = parse(cs.color);
    // Text that is nearly transparent is being faded out deliberately (a
    // transition, a disabled hint) and its contrast is not the real question.
    if (!fg || fg.a < 0.5) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 18.66 || (size >= 14 && weight >= 700);
    const need = large ? 3 : 4.5;
    scanned += 1;
    const r = ratio(fg, bgOf(el));
    if (r < need) {
      out.push({
        text: text.slice(0, 44),
        ratio: Math.round(r * 100) / 100,
        need,
        size: Math.round(size * 10) / 10,
        weight,
        color: cs.color,
        cls: (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.'),
        tag: el.tagName.toLowerCase(),
      });
    }
  }
  return {
    findings: out,
    scanned,
    path: location.pathname,
    textLen: (document.body?.innerText || '').trim().length,
    theme: document.documentElement.getAttribute('data-theme'),
  };
};

async function sweep(browser, who, canary) {
  const all = new Map();
  // Pages that could not be MEASURED, as opposed to pages that measured clean.
  // Kept apart on purpose: collapsing them is how a sweep of eleven sign-in
  // screens reports "no contrast problems".
  const unmeasured = [];
  let scannedTotal = 0;

  // Each visit is INDEPENDENT — its own tab, its own session seed, its own
  // reading — so they can run several at a time. Correcting the page list took
  // the sweep from 22 visits to 52 and the wall clock from 75s to 3m30, which is
  // long enough that people stop running it, and a check nobody runs is the same
  // as no check.
  //
  // Unlike the theme optimisation this changes nothing about WHAT is measured:
  // no page reads another's DOM, scrollIntoView is per-document, and the
  // elementsFromPoint surface lookup is a property of one page's own layout.
  // Verified rather than argued — serial and concurrent runs agree exactly on
  // the element count (8004) and on the findings.
  //
  // Four, not more: every tab holds a real Chrome renderer and its own React
  // tree, and past ~6 the settle stops being enough on a loaded machine, which
  // WOULD change the reading. CONTRAST_JOBS=1 forces the serial order back if a
  // result ever needs reproducing exactly.
  const jobs = Math.max(1, Number(process.env.CONTRAST_JOBS || 4));
  const queue = [];
  for (const theme of ['light', 'dark']) for (const [role, route] of PAGES) queue.push({ theme, role, route });

  let cursor = 0;
  async function worker() {
    for (;;) {
      const job = queue[cursor];
      cursor += 1;
      if (!job) return;
      const { theme, role, route } = job;
      // The role is part of the label because the same route is now measured
      // under two of them, and 'dark /admin/dashboard' failing would otherwise
      // not say WHICH reader saw it.
      const label = `${theme} ${role} ${route}`;
      // ITS OWN BROWSER CONTEXT, NOT JUST ITS OWN TAB.
      //
      // localStorage is per-ORIGIN, and every page here is the same origin — so
      // concurrent tabs share one `airms_token` and one `airms_theme` and
      // trample each other's seeds. Measured: with plain newPage() and four
      // workers, /athlete/profile and /athlete/squad landed on /admin/dashboard
      // and both coach pages landed on /athlete/dashboard. Four visits reading a
      // different role's screen, and the ONLY reason that is a failure line
      // rather than a silently smaller clean sweep is the landing assertion.
      // A context is an isolated storage partition, so each visit gets its own.
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      try {
        // SEED THE SESSION BEFORE THE DOCUMENT EXISTS. The obvious shape is to
        // navigate to the origin, write localStorage, then navigate to the page
        // — which costs a whole extra navigation per visit, 22 of them.
        // evaluateOnNewDocument runs before any of the page's own script, so the
        // app boots already signed in and already themed, in ONE navigation.
        await page.evaluateOnNewDocument((s, th) => {
          localStorage.setItem('airms_token', s.token);
          localStorage.setItem('airms_user', JSON.stringify(s.user));
          // Acknowledge the one-time "What's new" notice. Without this it opens
          // on every visit — each context is fresh — and its BACKDROP sits over
          // the page, so the sweep measures the page's own text through a
          // semi-transparent overlay and reports it as low contrast. Measured:
          // one such finding, `.text-muted` at 2.32:1 on /coach/dashboard, which
          // is not a defect — that text is dimmed because a dialog is over it.
          // These sweeps measure PAGES; the notice is checked on its own.
          localStorage.setItem('airms_whatsnew_v1:' + s.user.id, '1');
          localStorage.setItem('airms_theme', th);
        }, who[role], theme);
        // A navigation timeout is not fatal to the RUN — the other pages are
        // still worth measuring — but it must never pass for a measured page,
        // so it falls through to the landing assertions below, which refuse it.
        await page.goto(WEB + route, { waitUntil: 'networkidle2', timeout: 60000 })
          .catch((e) => { unmeasured.push(`${label} — navigation: ${firstLine(e)}`); });
        await new Promise((r) => { setTimeout(r, SETTLE); });

        // WAIT FOR THE THEME, DO NOT SNAPSHOT IT. The app stamps data-theme
        // after mount, and a fixed settle is a bet on how long that takes — one
        // that loses occasionally under concurrency, which showed up as
        // /medical/dashboard reporting "the page is in the default theme" on one
        // run in several. Waiting is not weakening: a theme that never arrives
        // still fails, on the assertion below, with the same message. A flaky
        // guard gets disabled by whoever is tired of it, which is the real risk.
        await page.waitForFunction(
          (th) => document.documentElement.getAttribute('data-theme') === th,
          { timeout: 5000 }, theme,
        ).catch(() => {});

        // THE THEME IS SET AT BOOT, NOT FLIPPED AFTERWARDS, and that is not
        // fussiness. Measuring both themes off one navigation looks obviously
        // right — the theme is a data-attribute and every colour resolves from a
        // custom property — and it is wrong: elements keep computed colours from
        // the theme the page BOOTED in, and the app re-asserts its own attribute
        // on the next render. Tried, and it invented five failures that do not
        // exist, including .btn-outline reported at 1.18:1 in "light" while
        // holding the dark theme's #e8edf2. Halving the navigations is not worth
        // a measurement that reports the wrong theme's colours.
        if (canary) {
          // A silently-failing addStyleTag would make the control report CLEAN,
          // i.e. "the audit is broken" — the exact wrong answer, from the check
          // whose whole job is to be trustworthy about that.
          await page.addStyleTag({ content: CANARY_CSS });
          // VERIFIED BY EFFECT, NOT BY PRESENCE. The obvious check — find the
          // rule in document.styleSheets and match its cssText — does not work
          // and fails in the direction that matters: Chrome serialises cssText
          // with the colour NORMALISED to rgb(), so a search for the hex never
          // matches and every visit reports "the canary did not attach". It read
          // as the control refusing to vouch for the run when in fact the
          // control's own detector was broken.
          //
          // Asking whether a real element actually COMPUTES to the canary colour
          // is both correct and stronger: it proves the rule attached, survived
          // the CSP, and won the cascade.
          const applied = await page.evaluate((rgb) => {
            for (const el of document.querySelectorAll('.card *')) {
              if (getComputedStyle(el).color === rgb) return true;
            }
            return false;
          }, CANARY_RGB);
          if (!applied) {
            unmeasured.push(`${label} — the canary stylesheet did not attach`);
            continue;
          }
        }

        const res = await page.evaluate(IN_PAGE);

        // DID WE MEASURE THE PAGE WE ASKED FOR?
        //
        // Three independent ways to end up somewhere else, all of them quiet:
        // the session was refused and DashboardLayout bounced to '/'; the route
        // was renamed and Next served a 404; the page threw on mount and
        // rendered its shell only. Each leaves a document that scans cleanly.
        if (res.path !== route) {
          unmeasured.push(`${label} — landed on ${res.path} instead (session refused, or the route moved)`);
          continue;
        }
        if (res.theme !== theme) {
          unmeasured.push(`${label} — the page is in the ${res.theme || 'default'} theme, so this reading is of the wrong palette`);
          continue;
        }
        if (res.textLen < MIN_TEXT || res.scanned < MIN_ELEMENTS) {
          unmeasured.push(`${label} — only ${res.scanned} measurable elements / ${res.textLen} characters (floor ${MIN_ELEMENTS}/${MIN_TEXT}); the page did not render`);
          continue;
        }

        scannedTotal += res.scanned;
        for (const f of res.findings) {
          const key = `${theme}|${f.cls || f.tag}|${f.color}|${f.ratio}`;
          if (!all.has(key)) all.set(key, { ...f, theme, where: `${route} (${role})`, count: 1 });
          else all.get(key).count += 1;
        }
      } catch (e) {
        // One page crashing must not discard the ten already measured, and must
        // not be mistaken for one that measured clean.
        unmeasured.push(`${label} — ${firstLine(e)}`);
      } finally {
        // A close failure is noise once the reading is taken; swallowing it here
        // keeps it from masking the result the run is actually about. The
        // context must go too, or a 52-visit run leaks 52 storage partitions.
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
      }
    }
  }

  // A worker that throws would otherwise take its whole share of the queue with
  // it and leave the run reporting a clean sweep of whatever survived.
  const results = await Promise.allSettled(Array.from({ length: jobs }, worker));
  for (const r of results) {
    if (r.status === 'rejected') unmeasured.push(`a sweep worker died — ${firstLine(r.reason)}`);
  }

  return {
    rows: [...all.values()].sort((a, b) => a.ratio - b.ratio),
    unmeasured: unmeasured.sort(),
    scannedTotal,
    pages: queue.length - unmeasured.length,
  };
}

function report(rows, limit = 24) {
  for (const r of rows.slice(0, limit)) {
    console.log(`  ${r.ratio.toFixed(2)}:1 (needs ${r.need})  ${r.theme.padEnd(5)} ${r.size}px/${r.weight}  ${(r.cls || r.tag).slice(0, 26).padEnd(26)} ${r.color.padEnd(22)} x${r.count}`);
    console.log(`        "${r.text}"   first seen ${r.where}`);
  }
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
}

function reportUnmeasured(unmeasured) {
  if (!unmeasured.length) return;
  console.log(`\n${unmeasured.length} of ${PAGES.length * 2} page-visits COULD NOT BE MEASURED:\n`);
  for (const u of unmeasured) console.log(`  ✗ ${u}`);
  console.log('\nThese are not passes. A page that did not render has no contrast');
  console.log('problems in the same way an unplugged monitor has no dead pixels.');
}

(async () => {
  // existsSync can throw on a malformed path from CHROME_PATH rather than
  // returning false, which would exit 2 with a stack instead of the one line
  // that tells the reader what to set.
  const chromePath = CHROMES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!chromePath) {
    console.error('No Chrome found. Set CHROME_PATH to the executable.');
    process.exit(2);
  }

  let who;
  try {
    who = {};
    for (const role of ['admin', 'medical', 'coach', 'athlete', 'executive']) {
      who[role] = await login(`${role}@isn.gov.my`);
    }
  } catch (e) {
    console.error(`${e.message}\nAre both servers running (npm run dev) and the database seeded (npm run seed)?`);
    process.exit(2);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1440, height: 900 },
    });
  } catch (e) {
    console.error(`Could not start Chrome at ${chromePath}: ${e.message}`);
    process.exit(2);
  }

  // Chrome outlives this process if it is killed mid-sweep, and a stray headless
  // browser per interrupted run is a slow leak on a dev machine.
  const bail = () => { browser.close().catch(() => {}); process.exit(2); };
  process.on('SIGINT', bail);
  process.on('SIGTERM', bail);

  let failed = false;
  try {
    if (CANARY) {
      // THE CONTROL. Plant a known-bad rule and require the audit to see it.
      // The verdict is INVERTED: a clean run here means the check is broken.
      console.log(`\ncanary — every .card descendant forced to ${CANARY_INK}`);
      const { rows, unmeasured, pages } = await sweep(browser, who, true);
      const total = rows.reduce((n, r) => n + r.count, 0);
      console.log(`  caught ${rows.length} distinct styles / ${total} instances across ${pages} page-visits`);
      reportUnmeasured(unmeasured);
      if (unmeasured.length) {
        console.log('\nCANARY INCONCLUSIVE — it cannot vouch for pages it never measured.');
        failed = true;
      } else if (rows.length < CANARY_MIN) {
        console.log(`\nCANARY NOT CAUGHT — expected at least ${CANARY_MIN} distinct styles, saw ${rows.length}.`);
        console.log('The audit is not measuring what it claims to. Do not trust a clean run.');
        failed = true;
      } else {
        console.log('\ncanary caught — a real failure of this shape would be reported.');
      }
    } else {
      const { rows, unmeasured, scannedTotal, pages } = await sweep(browser, who, false);
      console.log(`\n${rows.length} text styles below WCAG AA`);
      console.log(`  (${scannedTotal} text elements across ${pages} page-visits)\n`);
      report(rows);
      reportUnmeasured(unmeasured);

      // AN INCOMPLETE SWEEP IS A FAILURE, NOT A SMALLER PASS. Reporting "0
      // findings" over eight of twenty-two pages would be the most dangerous
      // output this script could produce — green, and about almost nothing.
      if (unmeasured.length) failed = true;
      if (rows.length) {
        console.log('\nSee DESIGN_DECISIONS §120/§121 for the three colour roles');
        console.log('(--risk-* fill · --risk-*-ink text on a card · --on-risk-* text on the fill).');
        failed = true;
      } else if (!unmeasured.length) {
        console.log('  none — every page, both themes.');
        console.log('\n  Re-run with --canary before trusting this: a clean result and a');
        console.log('  broken audit look identical from here.');
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  // Anything that reaches here is a fault in the harness, not a finding about
  // the app — exit 2, so a caller can tell "the UI has a contrast problem" from
  // "this check did not run".
  console.error(e);
  process.exit(2);
});
