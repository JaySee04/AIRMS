import fs from 'fs';
import path from 'path';

// EVERY PASSWORD FIELD CAN BE REVEALED (2026-10-25, JC).
//
// Sign-in, reset, the profile's change-password form and Personnel all had a
// Show/Hide toggle; /activate — the first screen every invited account sees,
// and the one where a mistyped password costs a support call — had two fields
// without one. Read as SOURCE because the property is "every field", and a
// mounted test sees only the pages it mounts.
//
// A field passes when its type is the toggled form, `{X ? 'text' : 'password'}`,
// and the same file has a toggle button reporting X through `aria-pressed={X}` —
// which ties the button to THIS field's state, not merely to some button.

const SRC = path.join(__dirname, '..');

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}

const TOGGLED = /type=\{(\w+) \? 'text' : 'password'\}/g;

function scan() {
  const fixed: string[] = [];
  const fields: Array<{ where: string; flag: string; text: string }> = [];
  for (const file of tsxFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC, file);
    text.split('\n').forEach((line, i) => {
      if (/type=["']password["']/.test(line)) fixed.push(`${rel}:${i + 1}`);
    });
    for (const m of text.matchAll(TOGGLED)) {
      fields.push({ where: `${rel}:${text.slice(0, m.index).split('\n').length}`, flag: m[1], text });
    }
  }
  return { fixed, fields };
}

describe('password fields can be revealed', () => {
  const { fixed, fields } = scan();

  it('finds the password fields it is meant to check', () => {
    // A positive control: a scanner that finds nothing passes everything.
    expect(fields.length).toBeGreaterThanOrEqual(9);
  });

  it('no password field is fixed to type="password"', () => {
    expect(fixed).toEqual([]);
  });

  it('every toggled field has a button reporting its own state', () => {
    const orphaned = fields
      .filter((f) => !f.text.includes(`aria-pressed={${f.flag}}`))
      .map((f) => `${f.where} (${f.flag})`);
    expect(orphaned).toEqual([]);
  });
});
