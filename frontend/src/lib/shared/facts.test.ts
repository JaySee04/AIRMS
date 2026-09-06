// lib/shared/facts.ts is GENERATED. This is the frontend half of the guard.
//
// The backend suite asserts the same freshness (backend/tests/sharedFacts.test.js)
// and both check BOTH files, deliberately: a developer working on the frontend
// runs the frontend suite, and a stale copy in either package is the same bug.
//
// What this file adds on top is the part only TypeScript can check — that the
// generated types line up with the values, and that the frontend's own display
// wording covers every shared indicator. A missing label there renders as
// `undefined` in a table cell, which looks like a data problem rather than a
// code one.
import fs from 'fs';
import path from 'path';

import {
  BANDS, BAND_LABEL, BAND_RANK, GENDERS, PROGRAMMES, AGE_GROUPS, GRAINS,
  RISK_AXIS_MAX, EXCLUDED_RISK_KEYS, RISK_INDICATORS, INSTITUTION_TZ, SMALL_COHORT,
} from './facts';
import type { Band, Grain, RiskKey } from './facts';
// Namespace import so the arrival check below can enumerate what this package
// actually received, rather than a list somebody remembered to write down.
import * as generated from './facts';
import { INDICATORS } from '../screeningAlerts';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const gen = require(path.join(ROOT, 'shared', 'generate.js'));

const read = (p: string): string => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('generated shared facts are in sync', () => {
  it('the committed frontend copy is what the generator produces', () => {
    // If this fails: run `npm run sync:shared` from the repository root.
    expect(read(gen.FRONTEND_OUT)).toBe(gen.renderFrontend());
  });

  it('the committed BACKEND copy is too — syncing one package alone is the bug', () => {
    expect(read(gen.BACKEND_OUT)).toBe(gen.renderBackend());
  });
});

describe('every shared fact actually ARRIVES in this package', () => {
  // THE HOLE THIS CLOSES, found 2026-09-06 by adding a fact and watching nothing
  // happen. `shared/generate.js` renders each package from a HAND-WRITTEN
  // template that names every constant. Adding a fact to shared/facts.js and
  // forgetting the frontend template produced:
  //
  //   - `npm run sync:shared` reporting success
  //   - the backend suite green (11/11)
  //   - the frontend suite green (19/19)
  //   - and the constant missing from lib/shared/facts.ts entirely
  //
  // The backend was already guarded — its suite walks the source key by key, so
  // dropping a constant from the backend template fails immediately. This side
  // was not, because the tests above import a FIXED list of names: a fact nobody
  // thought to import is a fact nobody checks.
  //
  // The asymmetry is what made it dangerous. A fact that reaches one package and
  // not the other leaves the two runtimes disagreeing, which is the single thing
  // this whole mechanism exists to prevent (§53) — and it does so while every
  // signal a developer looks at says the sync worked.
  const source = require(path.join(ROOT, 'shared', 'facts.js'));

  it('exposes every value the source defines', () => {
    // Namespace import, NOT a fixed list — that is the entire point.
    const missing = Object.keys(source).filter((k) => !(k in (generated as Record<string, unknown>)));
    // If this fails: add the constant to the matching renderer in
    // shared/generate.js and re-run `npm run sync:shared`. Adding it to
    // shared/facts.js alone does nothing, which is exactly the trap.
    expect(missing).toEqual([]);
  });

  it('carries the same VALUE for each of them, not merely the same name', () => {
    for (const [k, v] of Object.entries(source)) {
      expect({ [k]: (generated as Record<string, unknown>)[k] }).toEqual({ [k]: v });
    }
  });

  it('exports nothing the source does not define, except what it DERIVES', () => {
    const derived = ['BAND_RANK'];
    const extra = Object.keys(generated)
      .filter((k) => !(k in source) && !derived.includes(k))
      // Types erase at runtime, so anything left here is a real extra value.
      .filter((k) => typeof (generated as Record<string, unknown>)[k] !== 'function');
    expect(extra).toEqual([]);
  });
});

describe('the generated values match the backend the app talks to', () => {
  // The end-to-end property. The freshness tests prove each file matches the
  // source; this proves the two runtimes hold the same values, which is what
  // actually goes wrong when they drift.
  const be = require(path.join(ROOT, 'backend', 'src', 'shared', 'facts.js'));

  it.each([
    ['BANDS', BANDS], ['GENDERS', GENDERS], ['PROGRAMMES', PROGRAMMES],
    ['GRAINS', GRAINS], ['EXCLUDED_RISK_KEYS', EXCLUDED_RISK_KEYS],
    ['AGE_GROUPS', AGE_GROUPS], ['RISK_INDICATORS', RISK_INDICATORS],
    ['BAND_LABEL', BAND_LABEL], ['BAND_RANK', BAND_RANK],
    ['RISK_AXIS_MAX', RISK_AXIS_MAX], ['INSTITUTION_TZ', INSTITUTION_TZ],
    ['SMALL_COHORT', SMALL_COHORT],
  ])('%s is identical on both sides', (name, value) => {
    expect(value).toEqual(be[name as string]);
  });
});

describe('the generated types describe the generated values', () => {
  // These assertions are mostly for the compiler. If a type and its array fall
  // out of step the file stops compiling, which is the point — but the runtime
  // checks keep the failure legible when it does.
  it('types each band, grain and indicator key from its own list', () => {
    const b: Band[] = BANDS;
    const g: Grain[] = GRAINS;
    const k: RiskKey[] = RISK_INDICATORS.map((i) => i.key);
    expect(b).toHaveLength(3);
    expect(g).toHaveLength(3);
    expect(k).toHaveLength(RISK_INDICATORS.length);
  });

  it('keys BAND_LABEL and BAND_RANK by exactly the bands', () => {
    expect(Object.keys(BAND_LABEL).sort()).toEqual([...BANDS].sort());
    expect(Object.keys(BAND_RANK).sort()).toEqual([...BANDS].sort());
  });
});

describe('this package covers every shared indicator', () => {
  it('gives all seven a UI label and an axis label', () => {
    // The composition in screeningAlerts.ts throws on a missing entry, so this
    // asserts the throw never fires — and names what to fix if it does.
    expect(INDICATORS.map((i) => i.key)).toEqual(RISK_INDICATORS.map((i) => i.key));
    for (const i of INDICATORS) {
      expect({ key: i.key, label: !!i.label, axis: !!i.axisLabel }).toEqual({
        key: i.key, label: true, axis: true,
      });
    }
  });

  it('keeps HoloMotion\'s printed wording exactly as shared, unimproved', () => {
    // reportLabel is the INSTRUMENT's vocabulary — a clinician checks a line
    // against the PDF in their hand. It is not ours to reword locally.
    const shared = new Map(RISK_INDICATORS.map((i) => [i.key as string, i.reportLabel]));
    for (const i of INDICATORS) expect(i.reportLabel).toBe(shared.get(i.key as string));
  });

  it('still excludes LDH after the composition', () => {
    for (const k of EXCLUDED_RISK_KEYS) {
      expect(INDICATORS.map((i) => i.key as string)).not.toContain(k);
    }
  });
});
