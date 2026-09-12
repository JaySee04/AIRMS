// ONE NAME PER PAGE, IN ALL THREE PLACES IT IS WRITTEN DOWN.
//
// The sidebar entry, the topbar title and the user manual's navigation table are
// three independent copies of the same vocabulary, and on 2026-09-13 all three
// disagreed:
//
//   * `/medical/dashboard` was labelled **"Athlete Dashboard"** — the athlete's
//     own page is "My Dashboard", so the clinician's roster and worklist pane was
//     named after somebody else's screen. The manual meanwhile had a "Medical
//     Dashboard" section for it, so the document and the app used different
//     words for the page being documented.
//   * Report downloading was **"PDF Reports"** for admin and executive and
//     **"Reports"** for coach. One feature, two names — §33's band-vocabulary
//     failure in the navigation.
//   * **"Data Uploading"** was the only gerund among fourteen labels, and named
//     a mechanism rather than a subject.
//   * The manual's per-role table described the **FYP I** system: it listed
//     Injury Reporting, Injury Logging, Self-Report Review, Injury Analytics and
//     Staff Permissions — five features deleted on 2026-08-02 — and omitted the
//     coach and executive roles entirely.
//
// The last one is why this file exists rather than a careful edit. A navigation
// table that is a month stale is not a typo; it is a copy with nothing holding
// it to the original. DESIGN_DECISIONS §87.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SIDEBAR = path.join(ROOT, 'frontend', 'src', 'components', 'layout', 'Sidebar.tsx');
const MANUAL = path.join(ROOT, 'docs', 'USER_MANUAL.md');
const APP = path.join(ROOT, 'frontend', 'src', 'app');

const ROLES = ['athlete', 'medical', 'admin', 'coach', 'executive'];

/** { role: [{ href, label }] } read out of the NAV literal in Sidebar.tsx. */
function sidebarNav() {
  const src = fs.readFileSync(SIDEBAR, 'utf8').replace(/\r\n/g, '\n');
  const start = src.indexOf('const NAV');
  expect(start).toBeGreaterThanOrEqual(0);
  const body = src.slice(start);
  const nav = {};
  ROLES.forEach((role) => {
    // Each role's array runs from `role: [` to the matching `],`.
    const at = body.indexOf(`\n  ${role}: [`);
    expect(at).toBeGreaterThanOrEqual(0); // every shipped role has a nav list
    const open = body.indexOf('[', at);
    let depth = 0; let end = -1;
    for (let i = open; i < body.length; i += 1) {
      if (body[i] === '[') depth += 1;
      else if (body[i] === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const slice = body.slice(open, end);
    nav[role] = [...slice.matchAll(/href:\s*'([^']+)'[^}]*?label:\s*'([^']+)'/g)]
      .map((m) => ({ href: m[1], label: m[2] }));
  });
  return nav;
}

/** The `title` passed to DashboardLayout on one page, not any other title=. */
function layoutTitle(route) {
  const file = path.join(APP, route.replace(/^\//, ''), 'page.tsx');
  if (!fs.existsSync(file)) return null;
  let src = fs.readFileSync(file, 'utf8');
  // Follow a re-export, as /medical/cohort-norms is (one line pointing at the
  // admin page). Reading the local source alone finds no title at all.
  const re = src.match(/export\s*\{\s*default\s*\}\s*from\s*['"]([^'"]+)['"]/);
  if (re) {
    const target = path.resolve(path.dirname(file), re[1]);
    for (const cand of [`${target}.tsx`, path.join(target, 'index.tsx'), target]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { src = fs.readFileSync(cand, 'utf8'); break; }
    }
  }
  // Anchored on DashboardLayout: several pages carry `title="..."` on buttons
  // and table cells, and the system map's own parser takes the first match in
  // the file, which on the admin dashboard is a tooltip.
  const m = src.match(/<DashboardLayout[\s\S]{0,400}?title="([^"]*)"/);
  return m ? m[1] : null;
}

/** Every cell of the manual's per-role navigation table, by column. */
function manualNav() {
  const src = fs.readFileSync(MANUAL, 'utf8').replace(/\r\n/g, '\n');
  const head = '| Athlete | Medical | Admin | Coach | Executive |';
  expect(src.split(head).length - 1).toBe(1); // exactly one such table
  // Stop at the first line that is not a table row. Slicing to the end of the
  // file and filtering for lines beginning with "|" swept in every later table
  // in the manual — 16 rows for a 3-entry role, which is how this was caught.
  const after = src.slice(src.indexOf(head)).split('\n').slice(2);
  const stop = after.findIndex((l) => !l.startsWith('|'));
  const rows = (stop === -1 ? after : after.slice(0, stop))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  expect(rows.length).toBeGreaterThan(2); // floor: the table was actually read
  const out = {};
  ROLES.forEach((role, col) => {
    out[role] = rows.map((r) => r[col]).filter((c) => c && c.length > 0);
  });
  return out;
}

describe('one name per page, everywhere it is written', () => {
  const nav = sidebarNav();

  it('read a nav list for every shipped role', () => {
    // The floor. Without it a changed NAV shape yields empty lists and every
    // comparison below becomes [] === [] — the SILENT_FAILURES 3l shape.
    ROLES.forEach((r) => expect(nav[r].length).toBeGreaterThan(0));
    expect(nav.admin.length).toBeGreaterThanOrEqual(8);
    expect(nav.athlete.length).toBe(3);
  });

  it('every sidebar entry is headed by a noun, not a gerund', () => {
    // "Data Uploading" was the only one. A gerund names an activity; every
    // other label names the subject the page is about.
    //
    // The HEAD word only — the first version tested the whole label and failed
    // on "Screening History", "Screening Analytics" and "Screening Import",
    // where "screening" is an ordinary noun modifying the head. A rule that
    // rejects three correct labels to catch one wrong one is not the rule.
    Object.values(nav).flat().forEach(({ label }) => {
      const head = label.trim().split(/\s+/).pop();
      expect(head).not.toMatch(/ing$/);
    });
  });

  it('a page reached from two roles carries ONE label', () => {
    // /admin/reports is in the admin and executive lists; /admin/dashboard,
    // /admin/activity and /admin/audit likewise. "PDF Reports" for them and
    // "Reports" for coach was the same failure one step out.
    const byHref = {};
    Object.values(nav).flat().forEach(({ href, label }) => {
      byHref[href] = byHref[href] || new Set();
      byHref[href].add(label);
    });
    Object.entries(byHref).forEach(([href, labels]) => {
      expect([...labels]).toHaveLength(1);
      expect(href).toBeTruthy();
    });
  });

  it('the same feature on two routes is not given two names', () => {
    // Cohort Norms lives at /admin/thresholds and /medical/cohort-norms, and
    // report downloading at /admin/reports and /coach/reports. Different
    // routes, one concept each, so one word each.
    const labels = Object.values(nav).flat().map((n) => n.label);
    expect(labels.filter((l) => /report/i.test(l)).every((l) => l === 'Reports')).toBe(true);
    expect(labels.filter((l) => /norm/i.test(l)).every((l) => l === 'Cohort Norms')).toBe(true);
  });

  it('the topbar title matches the sidebar entry on every page', () => {
    let checked = 0;
    Object.values(nav).flat().forEach(({ href, label }) => {
      const title = layoutTitle(href);
      if (title === null) return; // no page.tsx — reported by the floor below
      expect(title).toBe(label);
      checked += 1;
    });
    // Floor: if the title parser stopped matching, every page would return null
    // and this test would assert nothing at all.
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it('the user manual\'s table is the sidebar, role for role', () => {
    const manual = manualNav();
    ROLES.forEach((role) => {
      expect(manual[role]).toEqual(nav[role].map((n) => n.label));
    });
  });

  it('the manual names no feature the HoloMotion cut deleted', () => {
    // Named, because these five sat in the navigation table for over a month
    // after the code that served them was removed.
    const manual = Object.values(manualNav()).flat().join(' · ');
    ['Injury Reporting', 'Injury Logging', 'Self-Report Review',
      'Injury Analytics', 'Staff Permissions'].forEach((gone) => {
      expect(manual).not.toContain(gone);
    });
    // ...and the floor: it still describes a real navigation.
    expect(manual).toContain('Squad Readiness');
    expect(manual).toContain('Cohort Norms');
  });
});
