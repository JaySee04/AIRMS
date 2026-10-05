// WHAT "A COMPLETE PDF ARRIVED" MEANS, and WHO is entitled to each report.
//
// Two guards over the checks added on 2026-10-05, after every PDF report
// answered 500 on the deployed instance for twenty-three days
// (docs/SILENT_FAILURES.md 4a).
//
// Both of these are guards over a GUARD, which is worth being explicit about:
// `npm run verify:reports` is the only thing in this repo that can see a broken
// report download, and it has two ways to quietly stop working. Its idea of a
// complete document could be weakened to a status check, and its entitlement
// matrix could drift from the rbac lists it is supposed to mirror. Neither
// failure makes it red. Both make it useless while still printing 25/25.
const fs = require('fs');
const path = require('path');

const { inspectPdf, TRAILER_WINDOW } = require('../scripts/lib/pdfResponse');
const { ENTITLED } = require('../scripts/verify-report-downloads');

const ROUTE_SRC = path.join(__dirname, '..', 'src', 'routes', 'screeningReports.js');

describe('inspectPdf: a 200 is not evidence', () => {
  // These routes stream, so the status is written before any drawing. The
  // document's own structure is the only thing that can report a mid-draw
  // failure, and it has to distinguish the two ways a body can be wrong.
  const complete = Buffer.concat([Buffer.from('%PDF-1.3\nbody'), Buffer.from('\ntrailer\n%%EOF\n')]);

  it('accepts a document with both markers', () => {
    const v = inspectPdf(complete);
    expect(v).toMatchObject({ complete: true, magic: true, trailer: true });
    expect(v.bytes).toBe(complete.length);
  });

  it('REFUSES one that started and never finished', () => {
    // The failure this whole mechanism exists for: composition threw after the
    // headers went out, so the response is a 200 carrying half a document.
    const v = inspectPdf(Buffer.from('%PDF-1.3\nbody with no trailer'));
    expect(v).toMatchObject({ complete: false, magic: true, trailer: false });
  });

  it('REFUSES one that is not a PDF at all', () => {
    // A proxy or error page where a document was expected. Distinguished from
    // the case above on purpose — they point at different things to go and read.
    const v = inspectPdf(Buffer.from('<!DOCTYPE html><title>Gateway</title>%%EOF'));
    expect(v).toMatchObject({ complete: false, magic: false, trailer: true });
  });

  it('refuses an empty body without throwing', () => {
    // `buf.slice(-2048)` on an empty buffer is the kind of edge that turns a
    // check into a crash, and a crashing check gets switched off.
    expect(inspectPdf(Buffer.alloc(0))).toMatchObject({ complete: false, magic: false, trailer: false, bytes: 0 });
    expect(inspectPdf(null)).toMatchObject({ complete: false, bytes: 0 });
  });

  it('does not hunt for the trailer anywhere but the end', () => {
    // A document whose BODY happens to contain the bytes %%EOF — any report
    // embedding that string in text would — must not be read as finished. The
    // window is what makes this a trailer check rather than a substring search.
    const body = Buffer.concat([
      Buffer.from('%PDF-1.3\n%%EOF\n'),
      Buffer.alloc(TRAILER_WINDOW + 64, 0x41),
    ]);
    expect(inspectPdf(body).trailer).toBe(false);
  });
});

describe('the download matrix mirrors the routes it checks', () => {
  const src = fs.readFileSync(ROUTE_SRC, 'utf8');

  /**
   * The roles named in one route's `rbac(...)` call, read from the SOURCE.
   *
   * Read as text rather than by importing the router, for the reason
   * athleteDisclosure.test.js gives: the rbac list is an argument to a
   * middleware factory, so it is a perfectly valid value whether or not the
   * route is reachable, and nothing executable exposes it.
   */
  function rolesFor(routePath) {
    const line = src.split('\n').find((l) => l.includes(`router.get('${routePath}'`));
    if (!line) return null;
    const m = line.match(/rbac\(([^)]*)\)/);
    if (!m) return null;
    return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }

  const ROUTES = {
    holistic: '/holistic.pdf',
    'programme-activity': '/programme-activity.pdf',
    'activity-log': '/activity-log.pdf',
    team: '/team.pdf',
    individual: '/individual/:id.pdf',
  };

  it('names every report route, and no route it cannot find', () => {
    // A renamed or removed route must fail here rather than silently drop out of
    // the matrix — a check that stops checking something is the failure mode
    // this file is about.
    for (const [kind, routePath] of Object.entries(ROUTES)) {
      expect(rolesFor(routePath)).not.toBeNull();
      expect(ENTITLED[kind]).toBeDefined();
    }
    expect(Object.keys(ENTITLED).sort()).toEqual(Object.keys(ROUTES).sort());
  });

  it.each(Object.entries(ROUTES))('%s: the matrix equals the route rbac list', (kind, routePath) => {
    // BOTH DIRECTIONS, and they fail differently.
    //
    // A role on the route but missing from the matrix is the silent one: the
    // check simply never asks, so a capability can break for that role and
    // verify:reports still prints green. That is exactly how the coach's
    // team-report download — a LOCKED FYP II capability — could rot unnoticed.
    //
    // A role in the matrix but not on the route makes the check demand a
    // download that must be refused, which fails loudly and immediately.
    expect([...ENTITLED[kind]].sort()).toEqual([...rolesFor(routePath)].sort());
  });

  it('the source scan can actually find a role list', () => {
    // Positive control. `rolesFor` is a regex over source text, and the whole
    // suite above passes vacuously if it returns the same thing for everything
    // — including if a refactor moved rbac onto its own line and every match
    // became null while `expect(null).toEqual(null)` stayed green.
    expect(rolesFor('/holistic.pdf')).toEqual(['admin', 'executive']);
    expect(rolesFor('/individual/:id.pdf')).toContain('athlete');
    expect(rolesFor('/no-such-route.pdf')).toBeNull();
  });
});
