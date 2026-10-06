// DOES THE PAGE STAY INSIDE THE SCREEN? Every authenticated page, three widths.
//
//   cd frontend; npm run verify:layout            needs `npm run dev`
//   cd frontend; npm run verify:layout -- --canary
//
// WHY IT EXISTS (§132). Nothing measured LAYOUT. `verify:contrast` reads
// colours, `verify:a11y` reads roles and names, `npm run e2e` drives behaviour,
// and all three run at one desktop width — so a table that takes the whole page
// sideways on a phone is invisible to every one of them and renders perfectly in
// a screenshot. Written as a throwaway probe while checking a padding change;
// it immediately found TWO pre-existing defects that had been shipping, so it
// stopped being throwaway.
//
// WHAT IT LOOKS FOR, and why each one is a real fault rather than a preference:
//
//   THE BODY SCROLLS SIDEWAYS. The rule in CLAUDE.md is that wide content
//   scrolls inside its own container and the page never does. A page that
//   scrolls horizontally on a phone hides the right-hand column of every table
//   on it, and nothing on screen says so.
//
//   CONTENT ESCAPES ITS CARD. `.card` clips nothing, so an over-wide table
//   simply draws across whatever is beside it. This is the cause; the sideways
//   scroll is the symptom, and reporting both is what names the fix.
//
//   A TITLE'S INLINE CHILDREN TOUCH. `.card-title` is a flex container since
//   §131 so the info tip can sit on the title's line. Flex gives its items no
//   gap and collapses the whitespace between them, so a title written
//   `Athletes <span>3</span>` would render "Athletes3". Reported rather than
//   assumed absent.
//
//   AN INFO TIP IS UNREACHABLE — zero width, or outside the viewport.
//
// 72 visits, ~6 minutes, serial. NOT in CI: it needs five live logins and a
// seeded database, and against an empty one it would report a confident zero
// about pages that drew nothing.
const { run, launch, allSessions, reportUnmeasured, PAGES } = require('./lib/sweep');

const WEB = process.env.LAYOUT_WEB || process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.LAYOUT_API || process.env.E2E_API || 'http://localhost:5000/api';
const SETTLE = Number(process.env.LAYOUT_SETTLE || 1800);
const CANARY = process.argv.includes('--canary');

// 1440 desktop · 1024 tablet · 390 the narrowest phone the design claims to
// support (the @media breakpoints in globals.css are 980px and 720px, so 390
// exercises the far side of both).
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
];

/**
 * Runs IN the page. Returns { findings, scanned, path } — the shape sweep.run
 * requires, where `scanned` is what proves the visit measured something.
 */
const IN_PAGE = () => {
  const findings = [];
  const de = document.documentElement;
  const cards = [...document.querySelectorAll('.card')];

  // The symptom. 1px of slack: sub-pixel rounding at some widths produces a
  // scrollWidth one larger than clientWidth with nothing actually overflowing.
  if (de.scrollWidth > de.clientWidth + 1) {
    findings.push({
      kind: 'page-scrolls-sideways',
      detail: `${de.scrollWidth} > ${de.clientWidth}`,
    });
  }

  // The cause. Only direct children: a cell inside an over-wide table would
  // otherwise report the same fault once per cell.
  for (const card of cards) {
    const cr = card.getBoundingClientRect();
    if (cr.width < 40) continue;
    for (const kid of card.children) {
      const kr = kid.getBoundingClientRect();
      if (kr.width === 0) continue;
      const over = Math.round(kr.right - cr.right);
      if (over > 2) {
        findings.push({
          kind: 'overflows-its-card',
          detail: `${kid.className || kid.tagName} by ${over}px`,
        });
      }
    }
  }

  for (const t of document.querySelectorAll('.card-title')) {
    // The info tip is the one element child that is MEANT to be a flex item
    // beside the text, and it carries its own margin.
    const kids = [...t.children].filter((n) => !n.classList.contains('infotip'));
    if (kids.length) {
      findings.push({
        kind: 'title-has-inline-children',
        detail: `"${t.textContent.trim().slice(0, 40)}" — flex items get no gap`,
      });
    }
  }

  for (const b of document.querySelectorAll('.infotip-btn')) {
    const r = b.getBoundingClientRect();
    if (r.width === 0) findings.push({ kind: 'infotip-invisible', detail: 'zero width' });
    else if (r.right > window.innerWidth + 1 || r.left < -1) {
      findings.push({ kind: 'infotip-offscreen', detail: `left ${Math.round(r.left)}, right ${Math.round(r.right)}` });
    }
  }

  // A page with no cards did not render. sweep.run turns a low `scanned` into an
  // UNMEASURED entry, which fails the run rather than passing it.
  return { findings, scanned: cards.length, path: window.location.pathname };
};

/**
 * THE CANARY, and the reason this script can be believed.
 *
 * A clean sweep and a broken sweep look identical from the outside — the §119
 * lesson, and the same control `verify:contrast` carries. This forces one card
 * on every page 600px wider than its column, which MUST produce both an
 * overflow and a sideways scroll. The verdict is inverted: a canary run that
 * comes back clean fails.
 *
 * Applied as a stylesheet with a width in `vw` rather than a fixed pixel count,
 * so it overflows at 390px exactly as it does at 1440px.
 */
const CANARY_CSS = '.card > *:first-child { min-width: 150vw !important; }';

async function main() {
  if (!CANARY) {
    // Said once, up front: a reader who sees "0 findings" needs to know what the
    // confidence rests on without reading this file.
    console.log('\nChecking layout. Re-run with --canary before trusting a clean result.');
  }
  let who;
  try {
    who = await allSessions(API);
  } catch (e) {
    console.error(`\nCould not sign in: ${e.message}`);
    process.exit(2);
  }
  const browser = await launch();
  let res;
  try {
    res = await run({
      web: WEB,
      api: API,
      settle: SETTLE,
      // Serial. Three widths of 24 pages is 72 contexts, and a narrow viewport
      // is where a slow render is most likely to be mistaken for a clean one.
      jobs: 1,
      viewports: VIEWPORTS,
      who,
      browser,
      minElements: 1,
      inPage: IN_PAGE,
      // Keyed by WIDTH as well as kind, because the same table is fine at 1440
      // and broken at 390 — merging them would report one finding and hide which
      // width it belongs to, which is the whole question.
      keyOf: (f, job) => `${job.viewport.width}|${f.kind}|${f.detail}`,
      beforeMeasure: CANARY
        ? async (page) => {
          await page.addStyleTag({ content: CANARY_CSS });
          // Proven BY EFFECT, not by searching the stylesheet. Chrome normalises
          // cssText, so a string search for the rule can pass against a sheet
          // that never attached (§121.8's version of this trap).
          const wide = await page.evaluate(() => {
            const el = document.querySelector('.card > *');
            if (!el) return false;
            return el.getBoundingClientRect().width > window.innerWidth;
          });
          return wide ? null : 'the canary stylesheet did not take effect';
        }
        : undefined,
    });
  } finally {
    await browser.close().catch(() => {});
  }

  const total = res.rows.length;
  console.log('');
  if (CANARY) {
    console.log(`canary — one card child forced to 150vw on every page`);
    console.log(`  caught ${total} distinct finding(s) across ${res.visits} visit(s)\n`);
    // INVERTED. A canary that comes back clean means the audit stopped looking.
    if (total === 0) {
      console.error('canary NOT caught — this audit would report a real failure of this shape as clean.');
      process.exit(1);
    }
    console.log('canary caught — a real failure of this shape would be reported.');
    reportUnmeasured(res.unmeasured, res.total);
    process.exit(res.unmeasured.length ? 1 : 0);
  }

  for (const r of res.rows.sort((a, b) => a.kind.localeCompare(b.kind))) {
    console.log(`  ${r.kind}  ${r.detail}`);
    console.log(`      ${r.where}${r.count > 1 ? ` (and ${r.count - 1} more)` : ''}`);
  }
  console.log(`\n${total} layout finding(s)`);
  console.log(`  (${res.visits} of ${res.total} page-visits · ${PAGES.length} pages x ${VIEWPORTS.length} widths)`);
  if (!total) console.log('\n  none — every page stays inside the screen at every width.');
  reportUnmeasured(res.unmeasured, res.total);
  process.exit(total || res.unmeasured.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
