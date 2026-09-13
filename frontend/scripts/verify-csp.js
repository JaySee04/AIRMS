// Prove the Content-Security-Policy does not break the app — in a real browser,
// against a PRODUCTION build.
//
// WHY THIS EXISTS. A CSP is the one hardening measure whose failure mode is
// indistinguishable from success in every cheap check. The header is present.
// The HTML is served, status 200, full length. `curl` sees a complete document.
// And the page is blank, or renders once and never hydrates, because the browser
// silently refused to execute the bootstrap script. Nothing server-side knows.
// That is docs/SILENT_FAILURES.md's defect class exactly, which is why the first
// pass DEFERRED the policy rather than ship one it had only reasoned about.
//
// So this asserts three different things, because any one of them alone passes
// against a broken policy:
//
//   1. ZERO securitypolicyviolation events. Registered BEFORE navigation via
//      evaluateOnNewDocument — a listener added after load misses every
//      violation that happened during it, which is all of the ones that matter.
//   2. The page HYDRATED. A CSP that blocks the bootstrap still serves Next's
//      server-rendered HTML, so "there is text on the page" proves nothing.
//      React must actually have attached.
//   3. The nonce is FRESH per request, and the policy is the strict one. A
//      policy that fell back to 'unsafe-inline' for scripts, or that reused one
//      nonce, would pass 1 and 2 while providing no protection.
//
// PRODUCTION BUILD, deliberately. `next dev` needs 'unsafe-eval' for React
// Refresh, so the dev policy is looser and a green run against it would prove
// nothing about what ships.
//
// EXIT CODES  0 all checks passed · 1 a check failed · 2 could not run
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const WEB = process.env.CSP_WEB || 'http://localhost:3210';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const chromePath = CHROME_CANDIDATES.find((p) => { try { return fs.existsSync(p); } catch { return false; } });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n          ${detail}`}`);
};

// Routes that need no session. An authenticated page would bounce to '/' before
// executing much, which is a weaker test of the policy, not a stronger one.
const ROUTES = ['/', '/activate', '/forgot-password'];

async function inspect(browser, route) {
  const page = await browser.newPage();
  const violations = [];

  // BEFORE navigation. This is the whole trick: violations fire during initial
  // parse, so a listener installed on 'load' sees none of them and reports a
  // clean run against a policy that blocked everything.
  await page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: String(e.blockedURI || '').slice(0, 120),
      });
    });
  });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

  const resp = await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise((r) => { setTimeout(r, 1200); });

  const found = await page.evaluate(() => window.__cspViolations || []);
  violations.push(...found);

  const csp = resp.headers()['content-security-policy'] || '';
  const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1] || null;

  // Did React actually attach? Next marks the hydrated tree; the reliable
  // signal across versions is that a React root exists on a DOM node.
  const hydrated = await page.evaluate(() => {
    const walk = (n) => {
      if (!n) return false;
      if (Object.keys(n).some((k) => k.startsWith('__reactContainer') || k.startsWith('__reactFiber'))) return true;
      return Array.from(n.children || []).some(walk);
    };
    return walk(document.body);
  });

  const text = await page.evaluate(() => document.body?.innerText || '');
  await page.close();
  return { violations, csp, nonce, hydrated, text, consoleErrors };
}

(async () => {
  if (!chromePath) {
    console.error('No Chrome found. Set CHROME_PATH to the executable.');
    process.exit(2);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1400, height: 900 },
    });
  } catch (e) {
    console.error(`Could not launch Chrome: ${e.message}`);
    process.exit(2);
  }

  const nonces = [];
  try {
    console.log(`\nCSP verification against ${WEB} (production build)\n`);

    for (const route of ROUTES) {
      let r;
      try {
        r = await inspect(browser, route);
      } catch (e) {
        check(`${route} loads`, false, `${e.message} — is \`next start\` running on ${WEB}?`);
        continue;
      }

      check(`${route} raises no CSP violation`, r.violations.length === 0,
        r.violations.map((v) => `${v.directive} blocked ${v.blocked}`).join('; '));
      check(`${route} hydrated (React attached)`, r.hydrated,
        'server HTML was served but React never attached — the classic blocked-bootstrap symptom');
      check(`${route} rendered real content`, r.text.trim().length > 50,
        `only ${r.text.trim().length} chars of text`);
      check(`${route} has no console errors`, r.consoleErrors.length === 0,
        r.consoleErrors.slice(0, 3).join(' | '));

      if (r.nonce) nonces.push(r.nonce);
    }

    // The policy itself, read off the wire rather than off the source file.
    const { csp } = await inspect(browser, '/');
    check('policy carries a script-src nonce', /script-src[^;]*'nonce-/.test(csp), csp.slice(0, 200));
    check("script-src does NOT allow 'unsafe-inline'", !/script-src[^;]*'unsafe-inline'/.test(csp),
      'a nonce plus unsafe-inline is no policy at all in CSP2 browsers');
    check("script-src does NOT allow 'unsafe-eval' in production", !/script-src[^;]*'unsafe-eval'/.test(csp),
      "'unsafe-eval' shipped to production");
    check("object-src is 'none'", /object-src 'none'/.test(csp));
    check("frame-ancestors is 'none'", /frame-ancestors 'none'/.test(csp));
    check('connect-src names the API origin',
      /connect-src[^;]*https?:\/\//.test(csp) || /connect-src[^;]*'self'/.test(csp), csp.slice(0, 240));

    // A reused nonce is a nonce-shaped constant, and defeats the entire scheme.
    check('the nonce is fresh per request', new Set(nonces).size === nonces.length,
      `${nonces.length} requests produced ${new Set(nonces).size} distinct nonces`);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILED:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
  }
  process.exit(failed.length ? 1 : 0);
})();
