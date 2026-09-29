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
// EXIT CODES  0 no failures · 1 a failure was found · 2 could not run
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

// Every authenticated page, under the role that can actually reach it. A page
// missing from this list is a page nobody is measuring, so add one here when you
// add one to the app.
const PAGES = [
  ['admin', '/admin/dashboard'], ['admin', '/admin/thresholds'],
  ['admin', '/admin/activity'], ['admin', '/admin/personnel'],
  ['admin', '/admin/settings'],
  ['medical', '/medical/dashboard'], ['medical', '/medical/data-upload'],
  ['coach', '/coach/dashboard'],
  ['athlete', '/athlete/dashboard'], ['athlete', '/athlete/history'],
  ['executive', '/executive/dashboard'],
];

// The canary is a real rule on a real element, not a synthetic node: it has to
// travel the same path a genuine defect would. Grey-on-white at ~1.4:1.
const CANARY_CSS = '.card, .card * { color: #eef0f3 !important; }';
const CANARY_MIN = 8;   // a page full of cards yields far more than this

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'airms2026' }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return r.json();
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
  return out;
};

async function sweep(browser, who, canary) {
  const all = new Map();
  for (const theme of ['light', 'dark']) {
    for (const [role, route] of PAGES) {
      const page = await browser.newPage();
      try {
        // SEED THE SESSION BEFORE THE DOCUMENT EXISTS. The obvious shape is to
        // navigate to the origin, write localStorage, then navigate to the page
        // — which costs a whole extra navigation per visit, 22 of them.
        // evaluateOnNewDocument runs before any of the page's own script, so the
        // app boots already signed in and already themed, in ONE navigation.
        await page.evaluateOnNewDocument((s, th) => {
          localStorage.setItem('airms_token', s.token);
          localStorage.setItem('airms_user', JSON.stringify(s.user));
          localStorage.setItem('airms_theme', th);
        }, who[role], theme);
        await page.goto(WEB + route, { waitUntil: 'networkidle2' });
        await new Promise((r) => { setTimeout(r, SETTLE); });

        // THE THEME IS SET AT BOOT, NOT FLIPPED AFTERWARDS, and that is not
        // fussiness. Measuring both themes off one navigation looks obviously
        // right — the theme is a data-attribute and every colour resolves from a
        // custom property — and it is wrong: elements keep computed colours from
        // the theme the page BOOTED in, and the app re-asserts its own attribute
        // on the next render. Tried, and it invented five failures that do not
        // exist, including .btn-outline reported at 1.18:1 in "light" while
        // holding the dark theme's #e8edf2. Halving the navigations is not worth
        // a measurement that reports the wrong theme's colours.
        if (canary) await page.addStyleTag({ content: CANARY_CSS });
        for (const f of await page.evaluate(IN_PAGE)) {
          const key = `${theme}|${f.cls || f.tag}|${f.color}|${f.ratio}`;
          if (!all.has(key)) all.set(key, { ...f, theme, where: route, count: 1 });
          else all.get(key).count += 1;
        }
      } finally {
        await page.close();
      }
    }
  }
  return [...all.values()].sort((a, b) => a.ratio - b.ratio);
}

function report(rows, limit = 24) {
  for (const r of rows.slice(0, limit)) {
    console.log(`  ${r.ratio.toFixed(2)}:1 (needs ${r.need})  ${r.theme.padEnd(5)} ${r.size}px/${r.weight}  ${(r.cls || r.tag).slice(0, 26).padEnd(26)} ${r.color.padEnd(22)} x${r.count}`);
    console.log(`        "${r.text}"   first seen ${r.where}`);
  }
  if (rows.length > limit) console.log(`  … and ${rows.length - limit} more`);
}

(async () => {
  const chromePath = CHROMES.find((p) => fs.existsSync(p));
  if (!chromePath) {
    console.error('Could not find Chrome. Set CHROME_PATH.');
    process.exit(2);
  }

  const who = {};
  for (const role of ['admin', 'medical', 'coach', 'athlete', 'executive']) {
    who[role] = await login(`${role}@isn.gov.my`);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });

  let failed = false;
  try {
    if (CANARY) {
      // THE CONTROL. Plant a known-bad rule and require the audit to see it.
      // The verdict is INVERTED: a clean run here means the check is broken.
      console.log(`\ncanary — every .card descendant forced to ${CANARY_CSS.match(/#\w+/)[0]}`);
      const rows = await sweep(browser, who, true);
      const total = rows.reduce((n, r) => n + r.count, 0);
      console.log(`  caught ${rows.length} distinct styles / ${total} instances`);
      if (rows.length < CANARY_MIN) {
        console.log(`\nCANARY NOT CAUGHT — expected at least ${CANARY_MIN} distinct styles, saw ${rows.length}.`);
        console.log('The audit is not measuring what it claims to. Do not trust a clean run.');
        failed = true;
      } else {
        console.log('\ncanary caught — a real failure of this shape would be reported.');
      }
    } else {
      const rows = await sweep(browser, who, false);
      console.log(`\n${rows.length} text styles below WCAG AA\n`);
      report(rows);
      if (rows.length) {
        console.log('\nSee DESIGN_DECISIONS §120/§121 for the three colour roles');
        console.log('(--risk-* fill · --risk-*-ink text on a card · --on-risk-* text on the fill).');
        failed = true;
      } else {
        console.log('  none — every page, both themes.');
        console.log('\n  Re-run with --canary before trusting this: a clean result and a');
        console.log('  broken audit look identical from here.');
      }
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
