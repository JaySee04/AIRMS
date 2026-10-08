// IS THE PRINTED BODY THE SAME BODY AS THE SCREEN'S? (2026-10-08, §144)
//
// backend/src/utils/bodymapData.json is GENERATED from the frontend's figure
// module, because the backend draws the same body into the PDF reports and
// cannot require() TypeScript.
//
// It was produced once, by hand, and bodymap.js said it would never need
// regenerating because the asset was a locked decision. When §144 replaced the
// asset, that assumption expired — and nothing would have noticed. The screen
// would have drawn the new anatomical figure while every PDF kept drawing the
// old licensed one, which is both a wrong answer that looks right and, since
// the licensed asset was removed deliberately, a licensing problem in the one
// artifact that gets handed to people.
//
// This pins the committed copy to its source, the same contract `npm run map`
// and `npm run sync:shared` have. It does NOT regenerate (that needs a
// TypeScript compile, which is the frontend's job) — it checks the structural
// facts that would differ if the copy were stale.
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '../src/utils/bodymapData.json');
const FIGURE_TS = path.join(__dirname, '../../frontend/src/components/dashboard/bodymap-data/figure.ts');

const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const figureSrc = fs.readFileSync(FIGURE_TS, 'utf8').replace(/\r\n/g, '\n');

// Slugs the generated copy claims to carry, read from the SOURCE's assembly
// blocks rather than from a list written out here — a list would be a third
// copy to keep in step, which is the problem this file exists for.
function slugsIn(exportName) {
  const start = figureSrc.indexOf(`export const ${exportName}: BodyPart[] = [`);
  if (start < 0) throw new Error(`${exportName} not found in figure.ts`);
  const end = figureSrc.indexOf('\n];', start);
  const block = figureSrc.slice(start, end);
  return [...block.matchAll(/part\('([^']+)'/g)].map((m) => m[1]);
}

describe('bodymapData.json is generated from the current figure', () => {
  test('carries the attribution that says it is generated and original', () => {
    expect(data._attribution).toMatch(/GENERATED/);
    expect(data._attribution).toMatch(/export:bodymap/);
    // The licensed atlas is gone (§144, JC). If this string ever comes back,
    // either the asset returned or somebody restored an old copy of the JSON.
    expect(data._attribution).not.toMatch(/react-muscle-highlighter/i);
    expect(JSON.stringify(data)).not.toMatch(/Shehryar/i);
  });

  test('carries both outlines, as real paths', () => {
    for (const k of ['frontOutline', 'backOutline']) {
      expect(typeof data[k]).toBe('string');
      expect(data[k].length).toBeGreaterThan(200);
      expect(data[k]).toMatch(/^M/);
    }
    // The back figure lives in the 724..1448 window; the front does not.
    const firstX = (d) => Number(d.match(/^M(-?[\d.]+),/)[1]);
    expect(firstX(data.frontOutline)).toBeLessThan(724);
    expect(firstX(data.backOutline)).toBeGreaterThanOrEqual(724);
  });

  test('matches the figure module slug for slug, in order', () => {
    expect(data.bodyFront.map((p) => p.slug)).toEqual(slugsIn('regionFront'));
    expect(data.bodyBack.map((p) => p.slug)).toEqual(slugsIn('regionBack'));
  });

  test('gives every part drawable geometry', () => {
    for (const part of [...data.bodyFront, ...data.bodyBack]) {
      const ds = [
        ...(part.path.common ?? []), ...(part.path.left ?? []), ...(part.path.right ?? []),
      ];
      expect(ds.length).toBeGreaterThan(0);
      for (const d of ds) expect(d).toMatch(/^M[\d.\-,\s]+C/);
    }
  });

  test('covers every subitem region the PDF colours', () => {
    // Mirrors SUBITEM_REGION_SLUGS in utils/bodymap.js. A region whose slugs are
    // all absent prints an uncoloured body and reports nothing wrong.
    const have = new Set([...data.bodyFront, ...data.bodyBack].map((p) => p.slug));
    const REGIONS = {
      neck: ['neck'],
      shoulder: ['trapezius', 'deltoids', 'biceps', 'triceps', 'forearm', 'hands'],
      torso: ['chest', 'abs', 'obliques', 'upper-back', 'lower-back'],
      pelvis: ['adductors', 'gluteal'],
      lowerLimbs: ['quadriceps', 'hamstring', 'knees', 'tibialis', 'calves', 'ankles', 'feet'],
    };
    for (const [region, slugs] of Object.entries(REGIONS)) {
      expect({ region, drawn: slugs.filter((s) => have.has(s)).length > 0 })
        .toEqual({ region, drawn: true });
    }
  });
});
