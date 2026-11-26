// WHICH SIDE OF THE BODY A FINDING IS DRAWN ON (DD §168).
//
// A person facing you has their right on your left. The atlas keys its paths
// by where they sit on the PAGE, so the front figure must swap them and the
// back figure must not. `anterior()` did that inside the redraw's figure.ts;
// reverting the redraw (2026-10-09, §152) deleted it, and for seven weeks every
// front-view finding was painted on the opposite side of the body while the
// written list beside it said the right thing. Every unit test passed - nothing
// asserted WHERE a side was drawn, only that both sides existed. Dr Thung found
// it by looking at the drawing.
//
// So these render the real component and measure where the lit shape lands,
// rather than checking that sideTagFor returns the right letter: a correct
// helper that BodyMap stopped calling would pass a helper test (winAnsiSafe).
import { renderToStaticMarkup } from 'react-dom/server';
import BodyMap, { type MuscleEntry } from './BodyMap';
import { sideTagFor, unionBox } from './bodymap-data/muscles';

// Front viewBox is 0..724, back is 724..1448, so each midline is the centre.
const FRONT_MID = 362;
const BACK_MID = 1086;

function centreX(markup: string, slug: string, side: 'L' | 'R'): number {
  const g = new RegExp(`<g[^>]*data-slug="${slug}"[^>]*data-side="${side}"[^>]*>([\\s\\S]*?)</g>`).exec(markup);
  if (!g) throw new Error(`no ${slug}:${side} group rendered`);
  // unionBox parses relative commands too, which the atlas's own paths use.
  const b = unionBox([...g[1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]));
  return (b.minX + b.maxX) / 2;
}

const render = (myodynamia: MuscleEntry[], tension: MuscleEntry[] = []) =>
  renderToStaticMarkup(<BodyMap myodynamia={myodynamia} tension={tension} />);

describe('body map sides', () => {
  it('maps atlas halves to the subject: swapped on the front, not on the back', () => {
    expect(sideTagFor('front', 'left')).toBe('R');
    expect(sideTagFor('front', 'right')).toBe('L');
    expect(sideTagFor('back', 'left')).toBe('L');
    expect(sideTagFor('back', 'right')).toBe('R');
  });

  it('draws a LEFT front-view finding on the viewer\'s RIGHT', () => {
    const html = render([{ muscle: 'Rectus Femoris', side: 'L' }, { muscle: 'Biceps Brachii', side: 'L' }]);
    expect(centreX(html, 'Rectus Femoris', 'L')).toBeGreaterThan(FRONT_MID);
    expect(centreX(html, 'Biceps Brachii', 'L')).toBeGreaterThan(FRONT_MID);
  });

  it('draws a RIGHT front-view finding on the viewer\'s LEFT, deep muscles included', () => {
    // The iliopsoas is the case Dr Thung's screenshot showed.
    const html = render([], [{ muscle: 'Iliopsoas', side: 'R' }, { muscle: 'Pectoralis Major', side: 'R' }]);
    expect(centreX(html, 'Iliopsoas', 'R')).toBeLessThan(FRONT_MID);
    expect(centreX(html, 'Pectoralis Major', 'R')).toBeLessThan(FRONT_MID);
  });

  it('keeps back-view sides as they are: left is the viewer\'s left', () => {
    const html = render([{ muscle: 'Gluteus Medius', side: 'L' }, { muscle: 'Biceps Femoris', side: 'R' }]);
    expect(centreX(html, 'Gluteus Medius', 'L')).toBeLessThan(BACK_MID);
    expect(centreX(html, 'Biceps Femoris', 'R')).toBeGreaterThan(BACK_MID);
  });
});
