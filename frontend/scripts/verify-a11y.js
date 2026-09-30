// WCAG conformance beyond contrast, measured in a real browser on every
// authenticated page.
//
// WHY THIS EXISTS. §120 established the rule for a locked Figma UI: "beautify"
// is not a licence to redesign, it is a licence to fix what is objectively
// wrong. Contrast was the first axis with a number behind it and is now at zero
// findings. This is the rest of the same axis — the WCAG success criteria that
// are decidable by inspection rather than by taste.
//
// It matters here more than on an ordinary site. AIRMS is used by an institution
// under a government health ministry, by clinicians who will be keyboard-driving
// a worklist, and a screen reader that cannot name a control is not a cosmetic
// problem: "button" instead of "Declare injured" is an unusable interface for
// the one role that changes clinical state.
//
// WHAT IT CHECKS, and each is a WCAG success criterion, not an opinion:
//   1.1.1  a meaningful image carries alt text
//   1.3.1  form controls have a programmatic label; headings do not skip levels
//   2.4.4  links and buttons have an accessible name
//   3.1.1  the document declares a language
//   4.1.1  ids are unique (a duplicate breaks label-for and aria-describedby)
//   4.1.2  a control with a role has the name that role requires
//
// WHAT IT DELIBERATELY DOES NOT CHECK: anything needing judgement. Whether alt
// text is GOOD, whether a heading is the right heading, whether focus order is
// sensible. Those are real and they are not decidable by a script, and a checker
// that guesses at them produces findings nobody can act on — which is how an
// audit gets ignored.
//
// EVERY VISIT PROVES IT WAS MEASURED, for the reason §121.8 records: an expired
// session or a renamed route lands on a screen with no violations, so a broken
// sweep reports a confident green ZERO. A visit that cannot be measured FAILS.
//
// EXIT CODES  0 clean · 1 a violation, or a page that could not be measured
//             · 2 could not run at all
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { PAGES } = require('./lib/pages');

const WEB = process.env.A11Y_WEB || process.env.E2E_WEB || 'http://localhost:3000';
const API = process.env.A11Y_API || process.env.E2E_API || 'http://localhost:5000/api';
const SETTLE = Number(process.env.A11Y_SETTLE || 2200);
const JOBS = Math.max(1, Number(process.env.A11Y_JOBS || 4));
const CANARY = process.argv.includes('--canary');
const CHROMES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  process.env.CHROME_PATH,
].filter(Boolean);

const MIN_ELEMENTS = 10;
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
    throw new Error(`cannot reach the API at ${API} (${e.cause?.code || e.message})`);
  }
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  const s = await r.json();
  if (!s || !s.token) throw new Error(`login ${email} -> 200 but no token`);
  return s;
}

const IN_PAGE = () => {
  const out = [];
  const seen = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const where = (el) => {
    const cls = (el.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };
  const add = (rule, node, detail) => out.push({ rule, node: where(node), detail: String(detail).slice(0, 70) });

  // An accessible name, by the rules a screen reader actually applies: an
  // explicit label, aria-label, aria-labelledby, a title, or — for a button or
  // link — its own text. Deliberately GENEROUS: a false finding on a control
  // that is in fact announced is how an audit gets switched off.
  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
      if (text) return text;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && lab.textContent.trim()) return lab.textContent.trim();
    }
    if (el.closest('label') && el.closest('label').textContent.trim()) return el.closest('label').textContent.trim();
    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();
    const t = (el.textContent || '').trim();
    if (t) return t;
    // An icon-only control is often an <img>/<svg> with its own label.
    const inner = el.querySelector('img[alt]:not([alt=""]), svg[aria-label], [aria-label]');
    if (inner) return 'inner-label';
    return '';
  };

  // 3.1.1 — the document declares a language.
  const lang = document.documentElement.getAttribute('lang');
  if (!lang || !lang.trim()) add('3.1.1 html lang', document.documentElement, 'missing lang attribute');

  // 4.1.1 — duplicate ids break label[for] and aria-describedby silently.
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) {
    ids.set(el.id, (ids.get(el.id) || 0) + 1);
  }
  for (const [id, n] of ids) if (n > 1) add('4.1.1 duplicate id', document.body, `#${id} appears ${n}x`);

  // 1.1.1 — a meaningful image needs alt. alt="" is CORRECT for decoration, so
  // only a MISSING attribute is reported.
  for (const img of document.querySelectorAll('img')) {
    if (!seen(img)) continue;
    if (img.getAttribute('alt') === null) add('1.1.1 image alt', img, img.getAttribute('src') || '(no src)');
  }

  // 2.4.4 / 4.1.2 — every operable control is announceable.
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="link"]')) {
    if (!seen(el)) continue;
    if (!nameOf(el)) add('4.1.2 control has no name', el, el.outerHTML.slice(0, 60));
  }

  // 1.3.1 — a form control needs a programmatic label. Hidden and submit-style
  // inputs carry their own name via value/text and are exempt.
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (!seen(el)) continue;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) continue;
    if (!nameOf(el)) add('1.3.1 input has no label', el, `type=${type || el.tagName.toLowerCase()}`);
  }

  // 1.3.1 — heading levels must not skip: h2 -> h4 tells a screen-reader user
  // a level exists that does not.
  const levels = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(seen).map((h) => ({ el: h, n: Number(h.tagName[1]) }));
  let prev = 0;
  for (const h of levels) {
    if (prev && h.n > prev + 1) add('1.3.1 heading skips a level', h.el, `h${prev} -> h${h.n}`);
    prev = h.n;
  }

  return {
    findings: out,
    scanned: document.querySelectorAll('body *').length,
    path: location.pathname,
    headings: levels.length,
  };
};

async function sweep(browser, who, canary) {
  const all = new Map();
  const unmeasured = [];
  let scannedTotal = 0;
  const queue = PAGES.map(([role, route]) => ({ role, route }));
  let cursor = 0;

  async function worker() {
    for (;;) {
      const job = queue[cursor];
      cursor += 1;
      if (!job) return;
      const { role, route } = job;
      const label = `${role} ${route}`;
      // Its own context: localStorage is per-origin, so concurrent plain tabs
      // trample each other's token and a visit silently reads another role's
      // screen (§121.8).
      const ctx = await browser.createBrowserContext();
      const page = await ctx.newPage();
      try {
        await page.evaluateOnNewDocument((s) => {
          localStorage.setItem('airms_token', s.token);
          localStorage.setItem('airms_user', JSON.stringify(s.user));
        }, who[role]);
        await page.goto(WEB + route, { waitUntil: 'networkidle2', timeout: 60000 })
          .catch((e) => { unmeasured.push(`${label} — navigation: ${firstLine(e)}`); });
        await new Promise((r) => { setTimeout(r, SETTLE); });

        if (canary) {
          // A control with no accessible name, planted in the live page. The
          // check must report it; a canary that comes back clean fails the run.
          await page.evaluate(() => {
            const b = document.createElement('button');
            b.style.cssText = 'width:20px;height:20px;position:fixed;left:0;top:0';
            document.body.appendChild(b);
          });
        }

        const res = await page.evaluate(IN_PAGE);
        if (res.path !== route) {
          unmeasured.push(`${label} — landed on ${res.path} (session refused, or the route moved)`);
          continue;
        }
        if (res.scanned < MIN_ELEMENTS) {
          unmeasured.push(`${label} — only ${res.scanned} elements; the page did not render`);
          continue;
        }
        scannedTotal += res.scanned;
        for (const f of res.findings) {
          const key = `${f.rule}|${f.node}|${f.detail}`;
          if (!all.has(key)) all.set(key, { ...f, where: `${route} (${role})`, count: 1 });
          else all.get(key).count += 1;
        }
      } catch (e) {
        unmeasured.push(`${label} — ${firstLine(e)}`);
      } finally {
        await page.close().catch(() => {});
        await ctx.close().catch(() => {});
      }
    }
  }

  const results = await Promise.allSettled(Array.from({ length: JOBS }, worker));
  for (const r of results) {
    if (r.status === 'rejected') unmeasured.push(`a sweep worker died — ${firstLine(r.reason)}`);
  }
  return {
    rows: [...all.values()].sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)),
    unmeasured: unmeasured.sort(),
    scannedTotal,
    visits: queue.length - unmeasured.length,
  };
}

(async () => {
  const chromePath = CHROMES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!chromePath) { console.error('No Chrome found. Set CHROME_PATH.'); process.exit(2); }

  let who;
  try {
    who = {};
    for (const role of ['admin', 'medical', 'coach', 'athlete', 'executive']) {
      who[role] = await login(`${role}@isn.gov.my`);
    }
  } catch (e) {
    console.error(`${e.message}\nAre both servers running (npm run dev) and the database seeded?`);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 },
  });
  const bail = () => { browser.close().catch(() => {}); process.exit(2); };
  process.on('SIGINT', bail);
  process.on('SIGTERM', bail);

  let failed = false;
  try {
    const { rows, unmeasured, scannedTotal, visits } = await sweep(browser, who, CANARY);
    const total = rows.reduce((n, r) => n + r.count, 0);

    if (CANARY) {
      const caught = rows.some((r) => r.rule.startsWith('4.1.2'));
      console.log(`\ncanary — an unlabelled <button> added to every page\n  ${caught ? 'caught' : 'NOT CAUGHT'}`);
      if (!caught) {
        console.log('\nThe check is not detecting an unnamed control. Do not trust a clean run.');
        failed = true;
      } else {
        console.log('  a control with no accessible name would be reported.');
      }
    } else {
      console.log(`\n${rows.length} distinct WCAG finding(s) · ${total} instance(s)`);
      console.log(`  (${scannedTotal} elements across ${visits} page-visits)\n`);
      for (const r of rows.slice(0, 30)) {
        console.log(`  ${String(r.count).padStart(3)}x  ${r.rule.padEnd(30)} ${r.node.slice(0, 28).padEnd(28)} ${r.detail}`);
        console.log(`        first seen ${r.where}`);
      }
      if (rows.length > 30) console.log(`  … and ${rows.length - 30} more`);
      if (rows.length) failed = true;
      else if (!unmeasured.length) console.log('  none — every authenticated page.\n\n  Re-run with --canary before trusting this.');
    }

    if (unmeasured.length) {
      console.log(`\n${unmeasured.length} page-visit(s) COULD NOT BE MEASURED:\n`);
      for (const u of unmeasured) console.log(`  ✗ ${u}`);
      console.log('\nThese are not passes. A page that did not render has no violations');
      console.log('in the same way an unplugged monitor has no dead pixels.');
      failed = true;
    }
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
