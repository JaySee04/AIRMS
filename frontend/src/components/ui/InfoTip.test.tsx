/**
 * @jest-environment jsdom
 */
// THE INFO TIP, AND THE RULE ABOUT WHAT MAY GO IN IT (§131).
//
// Two different things are guarded here and they fail in opposite directions.
//
// 1. THE COMPONENT. jsdom covers the half that is logic — collapsed by default,
//    opens on focus, Escape dismisses, the button has a name. The POINTER half
//    (hover opens, the panel is reachable across the gap, an outside click
//    closes a pinned one) is not assertable here at all: jsdom computes no
//    layout, dispatches no real pointer, and `elementFromPoint` returns null. It
//    is covered by `npm run e2e` section 4l, which drives real Chrome. Stated
//    rather than left as a gap somebody later assumes is covered.
//
// 2. THE SPLIT. This is the one that matters. A caveat moved into a tip is
//    invisible — the page still looks right, every other test still passes, and
//    the default state of the screen has quietly become the un-caveated reading.
//    That is this project's defect class (a confident wrong answer that looks
//    like a right one) with an affordance bolted on, and §33 is the reason it
//    cannot be allowed: green must never read "Safe", and a §33 caveat behind a
//    toggle IS green reading "Safe" until somebody clicks.
//
//    So the caveats are pinned BY PHRASE to the part of each page that is NOT
//    inside an <InfoTip>. Moving one in turns this red.

import { fireEvent, render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import InfoTip from './InfoTip';

describe('InfoTip — the component', () => {
  it('is collapsed by default, which is the entire point', () => {
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    expect(screen.queryByText('Method text here.')).toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on keyboard focus, so it is not hover-only', () => {
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByText('Method text here.')).toBeTruthy();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('pins open on click, which is the only path a touch screen has', () => {
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    // Blur must NOT close it once pinned, or a tap would open and immediately
    // shut as focus moved on.
    fireEvent.blur(btn);
    expect(screen.getByText('Method text here.')).toBeTruthy();
  });

  it('dismisses on Escape (WCAG 1.4.13) without needing the pointer', () => {
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Method text here.')).toBeNull();
  });

  it('dismisses on Escape while the thing that opened it is STILL LIVE', () => {
    // THE CASE THE OTHER ESCAPE TEST CANNOT REACH, and the registry said so: the
    // mutation that reverts `open` to a bare `pinned || hover || focus` SURVIVED
    // against the test above, because a click in jsdom focuses nothing, so all
    // three inputs were already false when Escape arrived and closing them was
    // enough.
    //
    // A real reader never does that. They hover, or they Tab to it — the opener
    // is still true when they press Escape — and clearing the inputs cannot win,
    // because the next render puts them straight back from the live pointer or
    // the live focus. That is the whole reason `escaped` exists.
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByText('Method text here.')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Method text here.')).toBeNull();
  });

  it('comes back on a fresh gesture — dismissed is not disabled', () => {
    render(<InfoTip label="How this works"><p>Method text here.</p></InfoTip>);
    const btn = screen.getByRole('button');
    fireEvent.focus(btn);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Method text here.')).toBeNull();
    // Leave, then ask again. Without the revive this tip is dead for the rest of
    // the page's life, which trades one WCAG failure for another.
    fireEvent.blur(btn);
    fireEvent.click(btn);
    expect(screen.getByText('Method text here.')).toBeTruthy();
  });

  it('names the button for assistive tech — the glyph is only an "i"', () => {
    render(<InfoTip label="How the cells are banded"><p>x</p></InfoTip>);
    expect(screen.getByRole('button', { name: 'How the cells are banded' })).toBeTruthy();
  });

  it('says what is inside rather than making the reader press to find out', () => {
    // The default exists so a call site cannot ship a nameless tip, but a label
    // of "Info" would satisfy the test above while telling a reader nothing.
    render(<InfoTip><p>x</p></InfoTip>);
    const name = screen.getByRole('button').getAttribute('aria-label') ?? '';
    expect(name.split(/\s+/).length).toBeGreaterThan(2);
  });
});

// ── THE SPLIT ────────────────────────────────────────────────────────────────

const SRC = path.join(__dirname, '..', '..');

/**
 * A file's source with every <InfoTip>…</InfoTip> block and every comment
 * removed — i.e. what a reader sees on the card without opening anything.
 *
 * COMMENTS GO FIRST and that is not tidiness. ~13 guards in this repo read
 * source as TEXT, and twice a COMMENT has satisfied the assertion while the code
 * it described was wrong (§118). Several of these caveats have a comment beside
 * them saying "CAVEAT, so it stays on the card" — if one of those ever quoted
 * the phrase itself, this guard would pass against a page that had moved it.
 */
function visibleSource(rel: string): string {
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
  const noComments = raw
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  // Non-greedy per block, so two tips on one page do not swallow the card
  // between them.
  return noComments.replace(/<InfoTip[\s\S]*?<\/InfoTip>/g, ' ');
}

/**
 * Every phrase that must stay READABLE WITHOUT OPENING ANYTHING, with the wrong
 * conclusion each one prevents. If a phrase is reworded, change it here and keep
 * the property; if it is DELETED, that is the decision this test exists to stop
 * being made by accident.
 */
const CAVEATS: Array<[string, string, string]> = [
  ['app/medical/dashboard/page.tsx', 'reason to examine, not a diagnosis',
    'a breach of the Elevated cutoff read as a finding rather than a prompt'],
  ['app/medical/dashboard/page.tsx', 'not a clearance',
    'ยง33: no indicator flagged read as "this athlete is fine"'],
  ['app/admin/dashboard/page.tsx', 'medians, not fixed cut-offs',
    'a quadrant read as an absolute threshold rather than this cohort\'s middle'],
  ['app/admin/dashboard/page.tsx', 'separate judgement from either axis',
    'a red dot low on the chart read as a contradiction rather than extra information'],
  ['app/admin/dashboard/page.tsx', 'not by how many',
    'the squad figure read as magnitude, so one flagged athlete looks like nine'],
  // REWORDED 2026-10-06 (§134), not weakened. Both were multi-sentence
  // paragraphs; a reader skips those and reads a clause, so the clause is the
  // safer form. The phrases here follow the copy — the property each one
  // protects is in the third column and has not changed.
  ['app/coach/dashboard/page.tsx', 'fitness-to-play decision',
    'a readiness grouping read as clearance to play'],
  ['app/coach/dashboard/page.tsx', 'not any one athlete',
    'the squad figure read as a description of somebody in it'],
  ['app/coach/dashboard/page.tsx', 'remain with medical staff',
    'a coach reading a clinical screen as theirs to act on'],
  ['app/coach/dashboard/page.tsx', 'Confirm programming with your',
    'an auto-generated focus list read as a prescription'],
  ['app/medical/sport-assessment/page.tsx', 'not how severe it is',
    'a prevalence bar read as severity'],
  ['app/medical/sport-assessment/page.tsx', 'a mean is not the squad',
    'a squad mean read as a description of its members'],
  ['app/medical/sport-assessment/page.tsx', 'not a diagnosis',
    'a fired rule read as a clinical finding'],
  ['components/charts/Charts.tsx', 'better or worse',
    'an oriented bar read as having the sign backwards'],
];

describe('the three-way split — caveats never move into a tip', () => {
  it.each(CAVEATS)('%s keeps "%s" on the card', (file, phrase) => {
    expect(visibleSource(file)).toContain(phrase);
  });

  it('the dead band says whether it was measured or assumed, on the card', () => {
    // Not a phrase match: "steady within ±2" means a different thing depending
    // on whether the 2 was DERIVED from repeat screenings or is the documented
    // fallback. The column definitions moved into a tip; this did not go with
    // them, because a reader who never opens the tip still has to know which
    // claim is being made (reliability.js's whole reason for existing).
    const visible = visibleSource('app/coach/dashboard/page.tsx');
    expect(visible).toContain('deadBandDerived');
    // BOTH branches have to be on the card, not just the flag. Asserting only
    // `deadBandDerived` would pass against a page that printed "measured"
    // unconditionally — which is the exact wrong answer this guards, since
    // "steady within +/-2" means a different thing depending on which is true.
    // The TERNARY, not the first mention — `indexOf` finds the type declaration
    // at the top of the file, where of course neither word appears. Found by the
    // assertion failing against 200 characters of the Props interface.
    const at = visible.search(/deadBandDerived\s*\?\s*'/);
    expect(at).toBeGreaterThan(-1);
    const near = visible.slice(at, at + 200);
    expect(near).toMatch(/measured/);
    expect(near).toMatch(/assumed/);
  });

  it('strips comments before looking, or a comment could satisfy it (§118)', () => {
    // POSITIVE CONTROL. Without this, a stripper that silently matched nothing
    // would report all thirteen caveats present while reading the raw file —
    // and the guard would be measuring nothing at all. Proven by a string that
    // exists ONLY inside a comment in this repo.
    const raw = fs.readFileSync(path.join(SRC, 'components/ui/InfoTip.tsx'), 'utf8');
    expect(raw).toContain('reader least likely to press a button');
    expect(visibleSource('components/ui/InfoTip.tsx'))
      .not.toContain('reader least likely to press a button');
  });

  it('strips InfoTip bodies, or the split is unmeasured', () => {
    // The OTHER positive control, and the one that matters more: if the InfoTip
    // stripper matched nothing, every caveat assertion above would pass whether
    // the phrase was on the card or inside a tip — which is precisely the
    // failure this file exists to catch.
    const visible = visibleSource('app/admin/dashboard/page.tsx');
    expect(visible).not.toContain('move beautifully and still carry risk');
    const raw = fs.readFileSync(path.join(SRC, 'app/admin/dashboard/page.tsx'), 'utf8');
    expect(raw).toContain('move beautifully and still carry risk');
  });
});
