import fs from 'fs';
import path from 'path';

// EVERY ALERT BOX IS ANNOUNCED (2026-10-14, DESIGN_DECISIONS §164, WCAG 4.1.3).
//
// Measured before: 64 `.alert` boxes across 32 files and not one carried a live
// role. "Download failed", "Saved", an import's result — all appeared on screen
// and a screen-reader user heard nothing, which for the clinician who just
// pressed "Declare injured" is the difference between knowing it worked and not.
//
// An error is `role="alert"` (assertive: interrupt, this matters now); success,
// warning and info are `role="status"` (polite: say it when you are free).
//
// Read as SOURCE because the property is "every site", and a mounted test can
// only see the pages it mounts. The role is required IMMEDIATELY before the
// className, which is where the sweep put it — so a new alert written without
// one, or with the wrong one, fails here naming the file and line.

const SRC = path.join(__dirname, '..');
const EXPECTED: Record<string, string> = { error: 'alert', success: 'status', warning: 'status', info: 'status' };

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}

function sites() {
  const out: Array<{ where: string; variant: string; before: string }> = [];
  const needle = 'className="alert alert-';
  for (const file of tsxFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    let i = text.indexOf(needle);
    while (i !== -1) {
      const variant = text.slice(i + needle.length).match(/^[a-z]+/)?.[0] ?? '';
      const line = text.slice(0, i).split('\n').length;
      out.push({ where: `${path.relative(SRC, file)}:${line}`, variant, before: text.slice(Math.max(0, i - 20), i) });
      i = text.indexOf(needle, i + 1);
    }
  }
  return out;
}

describe('alert boxes announce themselves', () => {
  const all = sites();

  it('finds the alert boxes it is meant to check', () => {
    // A positive control: a scanner that finds nothing passes everything.
    expect(all.length).toBeGreaterThanOrEqual(60);
  });

  it('every variant is one this test knows the right role for', () => {
    expect(all.filter((s) => !(s.variant in EXPECTED)).map((s) => `${s.where} alert-${s.variant}`)).toEqual([]);
  });

  it('every alert box carries the role its variant needs', () => {
    const wrong = all
      .filter((s) => s.variant in EXPECTED && !s.before.endsWith(`role="${EXPECTED[s.variant]}" `))
      .map((s) => `${s.where} alert-${s.variant} needs role="${EXPECTED[s.variant]}"`);
    expect(wrong).toEqual([]);
  });

  it('no alert box builds its class from a template, where this scan cannot see it', () => {
    const hidden = tsxFiles(SRC).filter((f) => /className=\{`alert/.test(fs.readFileSync(f, 'utf8')));
    expect(hidden.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('an alert box whose class is CHOSEN in an expression still carries a role', () => {
    // The literal scan above misses `className={ok ? 'alert alert-success' : …}`,
    // and the first sweep did miss one: the password-change modal, whose
    // "Password updated" / "Current password is wrong" stayed silent. Here the
    // role must sit on the same opening tag, before the class expression.
    const missing: string[] = [];
    for (const file of tsxFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      let i = text.indexOf("'alert alert-");
      while (i !== -1) {
        const tagStart = text.lastIndexOf('<', i);
        if (!/\brole=/.test(text.slice(tagStart, i))) {
          missing.push(`${path.relative(SRC, file)}:${text.slice(0, i).split('\n').length}`);
        }
        i = text.indexOf("'alert alert-", i + 1);
      }
    }
    expect(missing).toEqual([]);
  });
});
