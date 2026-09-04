// src/shared/facts.js is GENERATED. This is what stops it going stale.
//
// The design trade is deliberate and worth restating, because the test only
// makes sense next to it: a real shared package at the repository root would be
// the textbook answer, and it does not work here. Vercel builds `airms-api`
// with Root Directory `backend` and `airms-web` with Root Directory `frontend`,
// so a root-level package is in NEITHER build context — it would resolve
// locally, pass every test, and fail on deploy. So the single source is
// generated into each package and committed, and each build context stays
// self-contained.
//
// The cost of that trade is exactly one hazard: somebody edits shared/facts.js
// and forgets to run `npm run sync:shared`, and the two packages quietly
// disagree — which is the whole class of defect the change was made to remove.
// This test regenerates in memory and fails if what is committed disagrees, so
// the hazard is a red suite rather than a wrong number on a dashboard.
//
// It also fails if somebody edits the GENERATED file directly, which is the
// other way a fix ends up in one package and not the other.
const fs = require('fs');
const path = require('path');

const gen = require('../../shared/generate');
const facts = require('../src/shared/facts');
const source = require('../../shared/facts');

const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

describe('generated shared facts are in sync', () => {
  it('the committed backend copy is what the generator produces', () => {
    // If this fails: run `npm run sync:shared` from the repository root.
    expect(read(gen.BACKEND_OUT)).toBe(gen.renderBackend());
  });

  it('the committed FRONTEND copy is too — one package syncing alone is the bug', () => {
    // The generator writes both, so a stale frontend copy means somebody ran
    // the sync, edited again, and committed half of it. Asserted from here as
    // well as from the frontend suite, because whichever suite a developer runs
    // should catch it.
    expect(read(gen.FRONTEND_OUT)).toBe(gen.renderFrontend());
  });

  it('the generator is idempotent — a second run changes nothing', () => {
    // A generator whose output depends on its own previous output would drift a
    // line at a time and every individual diff would look intentional.
    expect(gen.renderBackend()).toBe(gen.renderBackend());
    expect(gen.stale()).toEqual([]);
  });
});

describe('the generated module carries the source values', () => {
  // Guards the GENERATOR, not the sync. A `q()` that dropped an escape, or a
  // renderer that emitted a name it never assigned, would produce a file that
  // is perfectly in sync and carries the wrong values.
  it('every exported fact equals the source', () => {
    for (const [k, v] of Object.entries(source)) {
      expect({ [k]: facts[k] }).toEqual({ [k]: v });
    }
  });

  it('exports nothing the source does not define, except what it DERIVES', () => {
    const derived = ['BAND_RANK'];
    const extra = Object.keys(facts).filter((k) => !(k in source) && !derived.includes(k));
    expect(extra).toEqual([]);
  });

  it('derives BAND_RANK from the band ORDER rather than restating it', () => {
    // The one value here that could be written backwards and still look right.
    // If BANDS is reordered, the rank must follow — a hand-written rank map is
    // how "worse than" silently inverts.
    source.BANDS.forEach((b, i) => expect(facts.BAND_RANK[b]).toBe(i));
    expect(Object.keys(facts.BAND_RANK)).toHaveLength(source.BANDS.length);
  });
});

describe('the facts themselves hold their invariants', () => {
  it('excludes LDH from the shown indicators, and says so as a value', () => {
    // Dr Thung's instruction (§31). Asserted rather than left as an absence,
    // because a leaked indicator renders as an ordinary row.
    expect(facts.EXCLUDED_RISK_KEYS).toContain('spinalDiscHerniation');
    for (const k of facts.EXCLUDED_RISK_KEYS) {
      expect(facts.RISK_INDICATORS.map((i) => i.key)).not.toContain(k);
    }
  });

  it('gives every indicator a key, a region and HoloMotion\'s printed wording', () => {
    expect(facts.RISK_INDICATORS).toHaveLength(7);
    for (const i of facts.RISK_INDICATORS) {
      expect(typeof i.key).toBe('string');
      expect(i.key).toBeTruthy();
      expect(i.region).toBeTruthy();
      expect(i.reportLabel).toBeTruthy();
    }
  });

  it('has no duplicate indicator keys', () => {
    const keys = facts.RISK_INDICATORS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prints only characters pdfkit can render', () => {
    // DESIGN_DECISIONS §30f: a character outside WinAnsi measures ZERO WIDTH in
    // pdfkit's Helvetica and prints as mojibake, without throwing. Every string
    // here reaches a printed report — the band labels, the age-band labels and
    // HoloMotion's wording all appear on the page — so an en-dash typed into
    // shared/facts.js would silently corrupt three documents.
    const printable = (s) => [...s].every((c) => c.codePointAt(0) <= 0xFF);
    const strings = [
      ...Object.values(facts.BAND_LABEL),
      ...facts.AGE_GROUPS.map((g) => g.label),
      ...facts.RISK_INDICATORS.map((i) => i.reportLabel),
      ...facts.PROGRAMMES,
      ...facts.GENDERS,
    ];
    for (const s of strings) {
      expect({ [s]: printable(s) }).toEqual({ [s]: true });
    }
  });

  it('orders the age bands without a gap or an overlap', () => {
    // A gap buckets an athlete as null and drops them from a breakdown that
    // still prints a total; an overlap files them under whichever row comes
    // first. Both look like a plausible table.
    const g = facts.AGE_GROUPS;
    expect(g[0].min).toBeUndefined();
    expect(g[g.length - 1].max).toBeUndefined();
    for (let i = 1; i < g.length; i += 1) {
      expect(g[i].min).toBe(g[i - 1].max + 1);
    }
  });
});
