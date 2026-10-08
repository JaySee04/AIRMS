// The figure is ORIGINAL geometry now (§144), so these assertions changed in
// kind as well as in subject. The old suite checked that shapes fitted to a
// donated atlas landed in plausible places; this one checks that muscles are
// where ANATOMY puts them — which is answerable because each is placed by its
// origin and insertion rather than by a bounding box.
//
// Several invariants the old file had to police are now structural: left and
// right are one authored shape reflected, so symmetry cannot drift, and the
// region layer shares the landmark system, so containment is construction
// rather than coincidence. They are still pinned — a guard that holds "by
// construction" is one refactor away from holding by nothing.
import {
  muscleFront, muscleBack, regionFront, regionBack,
  RENDERABLE_MUSCLES, MARKER_MUSCLES, MUSCLE_ALIASES,
  FRONT_OUTLINE, BACK_OUTLINE,
} from '@/components/dashboard/bodymap-data/figure';
import { LM, FIG_W, BACK_X0 } from '@/components/dashboard/bodymap-data/anatomy';

function bbox(d: string) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let m: RegExpExecArray | null;
  const push = (px: number, py: number) => {
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  };
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const a = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    const rel = cmd === cmd.toLowerCase(); const C = cmd.toUpperCase();
    if (C === 'M' || C === 'L' || C === 'T') {
      for (let i = 0; i + 1 < a.length; i += 2) {
        x = rel ? x + a[i] : a[i]; y = rel ? y + a[i + 1] : a[i + 1];
        if (C === 'M' && i === 0) { sx = x; sy = y; } push(x, y);
      }
    } else if (C === 'H') { for (const v of a) { x = rel ? x + v : v; push(x, y); } }
    else if (C === 'V') { for (const v of a) { y = rel ? y + v : v; push(x, y); } }
    else if (C === 'C') {
      for (let i = 0; i + 5 < a.length; i += 6) {
        for (let k = 0; k < 6; k += 2) push(rel ? x + a[i + k] : a[i + k], rel ? y + a[i + k + 1] : a[i + k + 1]);
        const nx = rel ? x + a[i + 4] : a[i + 4]; const ny = rel ? y + a[i + 5] : a[i + 5]; x = nx; y = ny;
      }
    } else if (C === 'Z') { x = sx; y = sy; }
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const all = [...muscleFront, ...muscleBack];
const onFront = (slug: string) => muscleFront.find((p) => p.slug === slug);
const onBackFig = (slug: string) => muscleBack.find((p) => p.slug === slug);

// ALWAYS SAY WHICH LIST. `Upper Trapezius` is drawn on both views, so a lookup
// across the combined array silently returns the FRONT shape — which made the
// posterior side-convention test read the anterior geometry and fail for a
// reason that had nothing to do with what it was checking.
const box = (slug: string, side: 'left' | 'right' | 'common', from = muscleFront) => {
  const part = from.find((p) => p.slug === slug)!;
  const ds = part.path[side] ?? [];
  const bs = ds.map(bbox);
  return {
    minX: Math.min(...bs.map((b) => b.minX)), maxX: Math.max(...bs.map((b) => b.maxX)),
    minY: Math.min(...bs.map((b) => b.minY)), maxY: Math.max(...bs.map((b) => b.maxY)),
    cx: bs.reduce((s, b) => s + b.cx, 0) / bs.length,
    cy: bs.reduce((s, b) => s + b.cy, 0) / bs.length,
  };
};

// The midline of whichever figure a part belongs to: back shapes live in the
// 724..1448 window, so their centre line is BACK_X0 + cx.
const midOf = (from: typeof muscleFront) => LM.cx + (from === muscleBack || from === regionBack ? BACK_X0 : 0);

// Distance from the centre line — what "medial" and "lateral" actually mean.
// A raw x comparison cannot express them, because which screen direction is
// lateral flips between the anterior and posterior views.
const latOf = (b: { cx: number }, mid: number) => Math.abs(b.cx - mid);

// Which list holds a muscle. `Upper Trapezius` is on both views; front wins,
// which is what every caller below wants.
const listOf = (slug: string) => (onFront(slug) ? muscleFront : muscleBack);
const boxOf = (slug: string, side: 'left' | 'right') => box(slug, side, listOf(slug));
const midFor = (slug: string) => midOf(listOf(slug));

const HOLOMOTION_22 = [
  'Biceps Brachii', 'Pectoralis Major', 'Lateral Deltoid', 'Posterior Deltoid', 'Rectus Abdominis',
  'External Oblique', 'Internal Oblique', 'Latissimus Dorsi', 'Gluteus Maximus', 'Gluteus Medius',
  'Piriformis', 'Sartorius', 'Vastus Lateralis', 'Upper Trapezius', 'Rectus Femoris', 'Gluteus Minimus',
  'Sternocleidomastoid', 'Vastus Medialis', 'Rectus Capitis Anterior', 'Middle Deltoid', 'Iliopsoas',
  'Biceps Femoris',
];

describe('HoloMotion muscle coverage', () => {
  it('draws every documented muscle, directly or through an alias', () => {
    const missing = HOLOMOTION_22.filter(
      (m) => !RENDERABLE_MUSCLES.has(m) && !RENDERABLE_MUSCLES.has(MUSCLE_ALIASES[m] ?? ''),
    );
    expect(missing).toEqual([]);
  });

  it('gives every muscle BOTH sides with real geometry', () => {
    for (const p of all) {
      expect(p.path.left?.length ?? 0).toBeGreaterThan(0);
      expect(p.path.right?.length ?? 0).toBeGreaterThan(0);
      for (const d of [...(p.path.left ?? []), ...(p.path.right ?? [])]) {
        // A path with no curve commands is a degenerate shape that still renders.
        expect(d).toMatch(/C/);
        expect(d.length).toBeGreaterThan(60);
      }
    }
  });

  it('renders no muscle the instrument does not name', () => {
    const named = new Set([...HOLOMOTION_22, ...Object.values(MUSCLE_ALIASES)]);
    expect([...RENDERABLE_MUSCLES].filter((m) => !named.has(m))).toEqual([]);
  });
});

describe('which side of the body a finding lands on', () => {
  // THE DEFECT THIS CATCHES SHIPPED FOR ABOUT AN HOUR AND WAS FOUND BY LOOKING.
  //
  // In an ANTERIOR view the subject faces you, so their RIGHT limb is on the
  // VIEWER'S LEFT (lower x). In a POSTERIOR view the sides agree. The geometry
  // is authored on the +x side for both, so the front needs its sides swapped —
  // and before `anterior()` existed, every anterior flag was painted on the
  // wrong half of the body while the figure looked perfect.
  //
  // This is the §45 / SILENT_FAILURES 3i family: not a crash, not a blank, just
  // a confident wrong answer on a clinical screen. "Pectoralis Major R" over the
  // subject's left pectoral is worse than drawing nothing at all.
  it('puts an ANTERIOR right-side muscle on the VIEWER\'S LEFT', () => {
    for (const p of muscleFront) {
      const r = box(p.slug, 'right');
      const l = box(p.slug, 'left');
      expect({ muscle: p.slug, rightIsViewerLeft: r.cx < l.cx })
        .toEqual({ muscle: p.slug, rightIsViewerLeft: true });
    }
  });

  it('puts a POSTERIOR right-side muscle on the VIEWER\'S RIGHT', () => {
    for (const p of muscleBack) {
      const r = box(p.slug, 'right', muscleBack);
      const l = box(p.slug, 'left', muscleBack);
      expect({ muscle: p.slug, rightIsViewerRight: r.cx > l.cx })
        .toEqual({ muscle: p.slug, rightIsViewerRight: true });
    }
  });

  it('applies the same convention to the REGION layer', () => {
    // Subitem mode colours regions per side too, and the PDF reports draw from
    // this same data — so an inversion here would reach print as well as screen.
    for (const p of regionFront) {
      if (!p.path.left || !p.path.right) continue;
      const r = box(p.slug, 'right', regionFront);
      const l = box(p.slug, 'left', regionFront);
      expect({ region: p.slug, ok: r.cx < l.cx }).toEqual({ region: p.slug, ok: true });
    }
    for (const p of regionBack) {
      if (!p.path.left || !p.path.right) continue;
      const r = box(p.slug, 'right', regionBack);
      const l = box(p.slug, 'left', regionBack);
      expect({ region: p.slug, ok: r.cx > l.cx }).toEqual({ region: p.slug, ok: true });
    }
  });
});

describe('sides', () => {
  it('keeps every muscle on its own side of the midline', () => {
    for (const from of [muscleFront, muscleBack]) {
      const mid = midOf(from);
      for (const p of from) {
        // A tolerance, not zero: rectus abdominis and the trapezius legitimately
        // REACH the midline. What must not happen is a shape crossing it, which
        // would paint one side's finding onto the other half of the body.
        //
        // Stated in terms of each shape's own half rather than of `right`/`left`,
        // because which screen half holds the subject's right flips between views.
        const a = box(p.slug, 'right', from);
        const b = box(p.slug, 'left', from);
        const [nearer, farther] = a.cx < b.cx ? [a, b] : [b, a];
        expect({ m: p.slug, ok: nearer.maxX < mid + 14 }).toEqual({ m: p.slug, ok: true });
        expect({ m: p.slug, ok: farther.minX > mid - 14 }).toEqual({ m: p.slug, ok: true });
      }
    }
  });

  it('makes left and right exact mirrors', () => {
    for (const from of [muscleFront, muscleBack]) {
      const mid = midOf(from);
      for (const p of from) {
      const r = box(p.slug, 'right', from);
      const l = box(p.slug, 'left', from);
      // §138 shipped a mirror that flipped rotation without flipping the
      // across-axis sign, so the two sides were subtly different shapes and the
      // asymmetry was invisible at a glance. Reflection is exact now.
      expect(Math.abs((mid - r.cx) - (l.cx - mid))).toBeLessThan(0.6);
      expect(Math.abs(r.cy - l.cy)).toBeLessThan(0.6);
      expect(Math.abs((r.maxX - r.minX) - (l.maxX - l.minX))).toBeLessThan(0.6);
      }
    }
  });
});

describe('anatomical placement', () => {
  // MEDIAL and LATERAL are distances from the centre line, not screen
  // directions — which screen direction is lateral flips between the two views,
  // so a raw x comparison asserts the wrong thing on one of them.
  const MID = midOf(muscleFront);

  it('puts vastus medialis medial to vastus lateralis, on both legs', () => {
    for (const side of ['left', 'right'] as const) {
      expect(latOf(box('Vastus Medialis', side), MID))
        .toBeLessThan(latOf(box('Vastus Lateralis', side), MID));
    }
  });

  it('bulges vastus medialis LOW — the teardrop above the knee', () => {
    expect(box('Vastus Medialis', 'right').cy).toBeGreaterThan(box('Vastus Lateralis', 'right').cy);
  });

  it('puts gluteus medius above gluteus maximus', () => {
    expect(box('Gluteus Medius', 'right', muscleBack).cy)
      .toBeLessThan(box('Gluteus Maximus', 'right', muscleBack).cy);
  });

  it('runs sartorius ACROSS the thigh, which is the whole point of it', () => {
    // The longest muscle in the body: ASIS (lateral, high) to the medial tibia
    // (medial, low). The old figure fitted it INSIDE a quadriceps box, where it
    // could not express that diagonal at all — this is the assertion that most
    // directly encodes why the redraw happened.
    const r = box('Sartorius', 'right');
    const far = Math.max(Math.abs(r.minX - MID), Math.abs(r.maxX - MID));
    const near = Math.min(Math.abs(r.minX - MID), Math.abs(r.maxX - MID));
    expect(far).toBeGreaterThan(80);              // starts well lateral
    expect(near).toBeLessThan(40);                // finishes near the midline
    expect(r.maxY - r.minY).toBeGreaterThan(300); // and travels most of the thigh
  });

  it('inserts iliopsoas BELOW the hip joint, not inside the abdomen', () => {
    // Origin is lumbar, insertion is the lesser trochanter — so it must cross
    // the pelvic brim. An inset inside an abdominal box cannot, which is what
    // it used to be.
    expect(box('Iliopsoas', 'right').maxY).toBeGreaterThan(LM.crotchY);
  });

  it('keeps every deep muscle inside the structure it lies under', () => {
    const under: Record<string, string> = {
      Piriformis: 'Gluteus Maximus',
      'Gluteus Minimus': 'Gluteus Medius',
      'Internal Oblique': 'External Oblique',
    };
    for (const [deep, parent] of Object.entries(under)) {
      const d = boxOf(deep, 'right');
      const p = boxOf(parent, 'right');
      expect(d.minX).toBeGreaterThan(p.minX - 26);
      expect(d.maxX).toBeLessThan(p.maxX + 26);
      expect(d.minY).toBeGreaterThan(p.minY - 26);
      expect(d.maxY).toBeLessThan(p.maxY + 26);
    }
  });

  it('sizes a deep muscle as a minority of what covers it', () => {
    const area = (s: string) => {
      const b = boxOf(s, 'right');
      return (b.maxX - b.minX) * (b.maxY - b.minY);
    };
    expect(area('Piriformis')).toBeLessThan(area('Gluteus Maximus') * 0.75);
    expect(area('Gluteus Minimus')).toBeLessThan(area('Gluteus Medius') * 1.05);
  });

  it('draws upper trapezius on BOTH views, because it is visible from both', () => {
    // The old module could not: one shared accumulator held a muscle on a single
    // figure, and its test pinned that limitation as though it were anatomy.
    expect(onFront('Upper Trapezius')).toBeTruthy();
    expect(onBackFig('Upper Trapezius')).toBeTruthy();
  });

  it('keeps the neck muscles in the neck', () => {
    for (const s of ['Sternocleidomastoid', 'Rectus Capitis Anterior']) {
      expect(boxOf(s, 'right').minY).toBeGreaterThan(LM.headTop);
      expect(boxOf(s, 'right').maxY).toBeLessThan(LM.shoulderY + 10);
    }
  });
});

describe('figure integrity', () => {
  it('keeps every shape inside its own figure window', () => {
    for (const [from, origin] of [[muscleFront, 0], [muscleBack, BACK_X0]] as const) {
      for (const p of from) {
        for (const side of ['left', 'right'] as const) {
          const b = box(p.slug, side, from);
          expect(b.minX).toBeGreaterThanOrEqual(origin - 2);
          expect(b.maxX).toBeLessThanOrEqual(origin + FIG_W + 2);
          expect(b.minY).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('emits no elliptical arc anywhere — every curve is a cubic', () => {
    // `A` commands carry radii and a sweep flag, which is where a mirrored path
    // silently stops being a mirror. The whole module is built from C curves.
    const every = [...all, ...regionFront, ...regionBack]
      .flatMap((p) => [...(p.path.common ?? []), ...(p.path.left ?? []), ...(p.path.right ?? [])]);
    expect(every.filter((d) => /[Aa]/.test(d))).toEqual([]);
    expect(FRONT_OUTLINE).not.toMatch(/[Aa]/);
  });

  it('declares the deep set as muscles that are actually drawn', () => {
    for (const m of MARKER_MUSCLES) expect(RENDERABLE_MUSCLES.has(m)).toBe(true);
  });

  it('puts the back figure in the back window and the front in the front', () => {
    expect(bbox(FRONT_OUTLINE).maxX).toBeLessThanOrEqual(FIG_W + 2);
    expect(bbox(BACK_OUTLINE).minX).toBeGreaterThanOrEqual(BACK_X0 - 2);
  });
});

describe('region layer', () => {
  // Subitem (ROM & Stability) mode colours these, and BodyMap maps each to one
  // of HoloMotion's five reported regions. A slug missing here is a region that
  // silently highlights nothing.
  const NEEDED_FRONT = ['neck', 'trapezius', 'deltoids', 'biceps', 'forearm', 'hands',
    'chest', 'abs', 'obliques', 'gluteal', 'adductors', 'quadriceps', 'knees', 'tibialis', 'ankles', 'feet'];
  const NEEDED_BACK = ['neck', 'trapezius', 'deltoids', 'triceps', 'forearm', 'hands',
    'upper-back', 'lower-back', 'gluteal', 'hamstring', 'calves', 'ankles', 'feet'];

  it('provides every slug the front view needs', () => {
    const have = new Set(regionFront.map((p) => p.slug));
    expect(NEEDED_FRONT.filter((s) => !have.has(s))).toEqual([]);
  });

  it('provides every slug the back view needs', () => {
    const have = new Set(regionBack.map((p) => p.slug));
    expect(NEEDED_BACK.filter((s) => !have.has(s))).toEqual([]);
  });

  it('covers the PELVIS on the anterior view', () => {
    // Measured gap in the first draft: "Pelvis" maps to adductors + gluteal, and
    // both sat below the crotch or on the back, so selecting it lit almost
    // nothing on the view a clinician is actually looking at.
    const hip = box('gluteal', 'right', regionFront);
    expect(hip.minY).toBeLessThan(LM.crotchY);
    expect(hip.maxY).toBeGreaterThan(LM.crestY);
  });

  it('contains each muscle within the region layer it belongs to', () => {
    // The payoff of one landmark system: quadriceps heads inside the thigh
    // region, pectoralis inside the chest.
    const quad = box('quadriceps', 'right', regionFront);
    for (const m of ['Rectus Femoris', 'Vastus Lateralis', 'Vastus Medialis']) {
      expect(box(m, 'right').minY).toBeGreaterThan(quad.minY - 30);
      expect(box(m, 'right').maxY).toBeLessThan(quad.maxY + 30);
    }
    const chest = box('chest', 'right', regionFront);
    expect(box('Pectoralis Major', 'right').maxY).toBeLessThan(chest.maxY + 30);
  });
});
