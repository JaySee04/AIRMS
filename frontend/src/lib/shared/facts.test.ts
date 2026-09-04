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
