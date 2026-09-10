// Who the shared dashboard components think they are talking to.
//
// THE BUG THIS EXISTS FOR, which shipped and was live. `OverallRiskBadge` and
// `ScreeningAlertBanner` are rendered by the athlete, coach and medical pages
// alike. They used to be second-person only, so the MEDICAL dashboard told a
// clinician that THEY were among the athletes most in need of attention, and to
// arrange an assessment with their own medical team. Nobody reported it — it
// reads perfectly until you notice who is holding the screen.
//
// The fix was an `audience` prop. That moved the failure rather than removing
// it: the prop defaults to `'staff'`, so **forgetting it on an athlete page
// reproduces the original bug exactly**, in the one direction where the words
// still scan as English. `OverallRiskBadge.test.tsx` pins what each value
// RENDERS; nothing pinned that the pages pass the right one.
//
// WHY THIS IS A SOURCE CHECK AND NOT A MOUNTED PAGE. Mounting these pages means
// standing up `next/navigation`, `@/lib/api` and a dozen fetches for
// `medical/dashboard`, which is 900 lines and makes many calls — a large,
// brittle investment to assert one prop. Reading the source is the same
// technique `backend/tests/athleteDisclosure.test.js` uses for route wiring, and
// for the same reason: the property is a fact about how the call site is
// written.
//
// Be clear about what that does NOT cover: this cannot see a prop computed at
// runtime, and it is not a substitute for a test that mounts a page. The
// remaining blind spot is still real and still stated in CLAUDE.md.
import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname);

/** Which audience each role's pages must declare. */
const EXPECTED: Record<string, 'self' | 'staff'> = {
  athlete: 'self',
  coach: 'staff',
  medical: 'staff',
  admin: 'staff',
};

/** The shared components that take an `audience`. */
const COMPONENTS = ['OverallRiskBadge', 'ScreeningAlertBanner'];

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) acc.push(full);
  }
  return acc;
}

/**
 * The opening tags of `name` in `src`.
 *
 * Brace-aware, because these props span lines and carry expressions:
 * `historical={!!picked}` and `onPick={(x) => setPicked(x)}` both contain
 * characters that a naive scan to the next '>' would stop on, truncating the
 * tag and losing the very prop being looked for.
 */
function openingTags(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?![A-Za-z0-9_])`, 'g');
  for (const m of src.matchAll(re)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

const roleOf = (file: string): string | null => {
  const rel = path.relative(APP, file).split(path.sep);
  return rel.length > 1 && EXPECTED[rel[0]] ? rel[0] : null;
};

describe('the shared dashboard components are told who is reading', () => {
  const files = walk(APP).filter((f) => roleOf(f) !== null);

  it('finds the role pages at all', () => {
    // A floor, so a broken walk cannot pass by checking nothing — the §56.3
    // lesson, where a parser found 15 of 59 endpoints and looked fine.
    expect(files.length).toBeGreaterThan(3);
  });

  const rendered: { file: string; role: string; comp: string; tag: string }[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const role = roleOf(file)!;
    for (const comp of COMPONENTS) {
      for (const tag of openingTags(src, comp)) rendered.push({ file, role, comp, tag });
    }
  }

  it('finds every render of the audience-taking components', () => {
    // 8 at the time of writing, across four pages. If this drops, the tag
    // scanner has stopped matching rather than the renders having gone away.
    expect(rendered.length).toBeGreaterThanOrEqual(7);
  });

  it('never omits the audience on a page that shows prose', () => {
    // The default is 'staff'. On an athlete page that is the original bug, so a
    // MISSING prop is the failure mode this file exists for — not just a wrong
    // one. `compact` is exempt: it returns a glyph, a number and an accessible
    // name, with no sentence addressed to anybody.
    const missing = rendered
      .filter((r) => !/\baudience=/.test(r.tag))
      .filter((r) => !/\bcompact\b/.test(r.tag))
      .map((r) => `${path.relative(APP, r.file)} renders <${r.comp}> with no audience`);
    expect(missing).toEqual([]);
  });

  it('passes the audience that matches the role owning the page', () => {
    const wrong: string[] = [];
    for (const r of rendered) {
      const m = r.tag.match(/\baudience=(?:"([^"]*)"|\{'([^']*)'\}|\{"([^"]*)"\})/);
      if (!m) continue; // absence is the previous test's business
      const value = m[1] ?? m[2] ?? m[3];
      const want = EXPECTED[r.role];
      if (value !== want) {
        wrong.push(`${path.relative(APP, r.file)} renders <${r.comp}> with audience="${value}"; a ${r.role} page must pass "${want}"`);
      }
    }
    // If this fails on a NEW page, the fix is the prop, not the expectation:
    // 'self' addresses the reader as the athlete at risk, and every non-athlete
    // role is reading about somebody else.
    expect(wrong).toEqual([]);
  });

  // THE CANARY (2026-09-10, backend/tests/guardCanaries.test.js). Both checks
  // above report "nothing wrong" over a corpus of page sources. If `openingTags`
  // stopped matching — a JSX shape it cannot parse, a renamed component — they
  // would report exactly the same thing while an athlete page addressed the
  // clinician as the at-risk athlete again. So the extractor is run against
  // planted markup covering the three shapes that actually occur.
  it('can detect the wiring cases it exists to find', () => {
    // A missing prop: the ORIGINAL bug, because `audience` defaults to 'staff'.
    const missingProp = openingTags('<OverallRiskBadge screening={s} />', 'OverallRiskBadge');
    expect(missingProp).toHaveLength(1);
    expect(/\baudience=/.test(missingProp[0])).toBe(false);

    // A present prop, read back correctly.
    const present = openingTags('<OverallRiskBadge audience="self" />', 'OverallRiskBadge');
    expect(present[0]).toMatch(/audience="self"/);

    // The brace-aware case this parser was written for: a prop containing `>`
    // inside an expression must not end the tag early, or the audience that
    // follows it becomes invisible and the tag reads as missing one.
    const braced = openingTags(
      '<OverallRiskBadge historical={!!picked} n={a > b} audience="staff" />',
      'OverallRiskBadge',
    );
    expect(braced[0]).toMatch(/audience="staff"/);

    // And it must not match a longer component name that merely starts the same.
    expect(openingTags('<OverallRiskBadgeCompact audience="self" />', 'OverallRiskBadge')).toEqual([]);
  });
});
