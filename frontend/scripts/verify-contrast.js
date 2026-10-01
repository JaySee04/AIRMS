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
// Visiting, session seeding, concurrency, both themes and the proof that each
// visit actually happened live in lib/sweep.js — shared with verify-a11y.js,
// which was 91 identical lines before they were pulled apart.
const { run, launch, allSessions, reportUnmeasured } = require('./lib/sweep');

const WEB = process.env.CONTRAST_WEB || process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.CONTRAST_API || process.env.E2E_API || 'http://localhost:5000/api';
const SETTLE = Number(process.env.CONTRAST_SETTLE || 2200);
// Four concurrent visits, each in its OWN browser context. Accepted because
// serial and concurrent agree exactly on the element count; CONTRAST_JOBS=1
// forces the serial order back if a result ever needs reproducing.
const JOBS = Math.max(1, Number(process.env.CONTRAST_JOBS || 4));
const CANARY = process.argv.includes('--canary');

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

function report(rows, limit = 24) {
  for (const r of rows.slice(0, limit)) {
    console.log(`  ${r.ratio.toFixed(2)}:1 (needs ${r.need})  ${r.theme.padEnd(5)} ${r.size}px/${r.weight}  ${(r.cls || r.tag).slice(0, 26).padEnd(26)} ${r.color.padEnd(22)} x${r.count}`);
    console.log(`        "${r.text}"   first seen ${r.where}`);
  }
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
}

/** This sweep's own arguments to the shared harness. */
const sweepOpts = (who, browser, canary) => ({
  web: WEB,
  api: API,
  settle: SETTLE,
  jobs: JOBS,
  who,
  browser,
  // BOTH THEMES, as two passes rather than one flip. Measuring both off a single
  // navigation looks obviously right — the theme is a data-attribute and every
  // colour resolves from a custom property — and it is wrong: elements keep
  // computed colours from the theme the page BOOTED in. Tried, and it invented
  // five failures including .btn-outline at 1.18:1 in "light" while holding
  // dark's #e8edf2.
  themes: ['light', 'dark'],
  inPage: IN_PAGE,
  keyOf: (f, job) => `${job.theme}|${f.cls || f.tag}|${f.color}|${f.ratio}`,
  minElements: MIN_ELEMENTS,
  // The page must also carry enough TEXT to be that page — the backstop the
  // route assertion cannot provide, for the right URL rendering only its shell.
  check: (res) => (res.textLen < MIN_TEXT
    ? `only ${res.scanned} measurable elements / ${res.textLen} characters (floor ${MIN_ELEMENTS}/${MIN_TEXT}); the page did not render`
    : null),
  beforeMeasure: canary
    ? async (page) => {
      await page.addStyleTag({ content: CANARY_CSS });
      // VERIFIED BY EFFECT, NOT BY PRESENCE. Searching styleSheets for the
      // rule's cssText does not work and fails in the direction that matters:
      // Chrome serialises cssText with the colour NORMALISED to rgb(), so a
      // search for the hex never matches and every visit reports "the canary
      // did not attach" — the control refusing to vouch while its own detector
      // was broken.
      const applied = await page.evaluate((rgb) => {
        for (const el of document.querySelectorAll('.card *')) {
          if (getComputedStyle(el).color === rgb) return true;
        }
        return false;
      }, CANARY_RGB);
      return applied ? null : 'the canary stylesheet did not attach';
    }
    : undefined,
});

(async () => {
  let who;
  try {
    who = await allSessions(API);
  } catch (e) {
    console.error(`${e.message}\nAre both servers running (npm run dev) and the database seeded (npm run seed)?`);
    process.exit(2);
  }

  const browser = await launch();
  let failed = false;
  try {
    if (CANARY) {
      // THE CONTROL. Plant a known-bad rule and require the audit to see it.
      // The verdict is INVERTED: a clean run here means the check is broken.
      console.log(`\ncanary — every .card descendant forced to ${CANARY_INK}`);
      const { rows, unmeasured, visits, total: all } = await run(sweepOpts(who, browser, true));
      const instances = rows.reduce((n, r) => n + r.count, 0);
      console.log(`  caught ${rows.length} distinct styles / ${instances} instances across ${visits} page-visits`);
      reportUnmeasured(unmeasured, all);
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
      const { rows, unmeasured, scannedTotal, visits, total: all } = await run(sweepOpts(who, browser, false));
      rows.sort((a, b) => a.ratio - b.ratio);
      console.log(`\n${rows.length} text styles below WCAG AA`);
      console.log(`  (${scannedTotal} text elements across ${visits} page-visits)\n`);
      report(rows);
      reportUnmeasured(unmeasured, all);

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
