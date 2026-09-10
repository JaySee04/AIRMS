// Every var(--token) must resolve to something.
//
// This guards a CLASS of bug rather than an instance. An undefined custom
// property does not warn, does not throw and does not fail a build: the
// declaration containing it becomes invalid at computed-value time and the
// property silently falls back to its inherited or initial value. The result
// looks like a styling choice.
//
// It has bitten this project three times:
//   - `--bg-subtle`, invented wholesale, silently dropped nine hover and pill
//     backgrounds;
//   - `--risk-med` drifted from `--risk-moderate` on the squad page;
//   - `--primary` on `.bm-card-item:focus-visible` computed `outline: none`,
//     and because that rule is MORE specific than the global
//     `button:focus-visible` gold ring, it removed the keyboard focus indicator
//     from six body-map rows. Measured in Chrome before the fix.
//
// A fallback (`var(--x, #ccc)`) is fine and is not reported: the declaration
// stays valid, which is the whole property being protected.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const CSS = path.join(SRC, 'styles', 'globals.css');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Custom properties DEFINED anywhere in the stylesheet, at any selector. */
// The two patterns this whole file rests on, named so the canary at the bottom
// can exercise THESE rather than a copy of them. A second copy that agreed on
// the day it was written is how the band vocabulary ended up defined four times.
const TOKEN_DEFINITION = /(--[a-zA-Z0-9-]+)\s*:/g;
const VAR_USE = /var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g;

function definedTokens(): Set<string> {
  const css = fs.readFileSync(CSS, 'utf8');
  const names = new Set<string>();
  for (const m of css.matchAll(TOKEN_DEFINITION)) names.add(m[1]);
  return names;
}

/**
 * Every var() USE that has no fallback, as [token, file, line].
 * A use with a fallback cannot invalidate its declaration, so it is skipped.
 */
function unguardedUses(): Array<[string, string, number]> {
  const uses: Array<[string, string, number]> = [];
  for (const file of walk(SRC)) {
    // Don't let this test's own documentation count as a use.
    if (file.endsWith('cssTokens.test.ts')) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // Skip comment-only lines: several tokens are NAMED in prose explaining
      // why they were removed, and a comment styles nothing.
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      for (const m of line.matchAll(VAR_USE)) {
        if (m[2] === ',') continue; // has a fallback
        uses.push([m[1], path.relative(SRC, file), i + 1]);
      }
    });
  }
  return uses;
}

describe('CSS custom properties', () => {
  it('defines every token used without a fallback', () => {
    const defined = definedTokens();
    const missing = unguardedUses().filter(([token]) => !defined.has(token));
    // Reported with file and line, because "some token is missing" is not
    // actionable and this test exists to be actioned.
    expect(missing.map(([t, f, l]) => `${t} used at ${f}:${l}`)).toEqual([]);
  });

  // THE CANARY (2026-09-10, backend/tests/guardCanaries.test.js). The check
  // above reports "no undefined tokens" across the whole corpus. If VAR_USE
  // stopped matching it would report the same thing while nine hover states
  // silently rendered with nothing — which is exactly what §E of
  // SILENT_FAILURES records happening. So both patterns are run against planted
  // input, including the distinction the checker turns on.
  it('can detect an undefined token — the planted case it exists to find', () => {
    const defs = [...':root { --real-token: #fff; }'.matchAll(TOKEN_DEFINITION)].map((m) => m[1]);
    expect(defs).toEqual(['--real-token']);

    const uses = [...'color: var(--made-up-token);'.matchAll(VAR_USE)];
    expect(uses).toHaveLength(1);
    expect(uses[0][1]).toBe('--made-up-token');
    // `)` means NO fallback — the case that can invalidate the declaration.
    expect(uses[0][2]).toBe(')');

    // A use WITH a fallback is the case the scanner must skip: it cannot
    // invalidate anything, and flagging it would fill the report with noise.
    const guarded = [...'color: var(--made-up-token, #000);'.matchAll(VAR_USE)];
    expect(guarded[0][2]).toBe(',');
  });

  it('finds a real corpus — the walker is not silently matching nothing', () => {
    // Without this, deleting the walk() body would make the test above pass.
    const uses = unguardedUses();
    expect(uses.length).toBeGreaterThan(200);
    expect(definedTokens().size).toBeGreaterThan(30);
  });

  it('keeps the focus ring on the body-map rows', () => {
    // The specific regression: this rule overrides the global gold ring by
    // specificity, so if its colour token ever goes undefined again the rows
    // lose their focus indicator with nothing on screen to say so.
    const css = fs.readFileSync(CSS, 'utf8');
    // The standalone outline rule, not the grouped hover/active/focus block
    // that precedes it and sets only a background.
    const rule = css.match(/\.bm-card-item:focus-visible \{[^}]*outline:[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/outline:\s*2px solid var\(--brand-gold/);
  });
});
