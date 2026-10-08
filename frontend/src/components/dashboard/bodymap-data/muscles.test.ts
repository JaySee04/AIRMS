// Throwaway harness: prove the geometric partition assigns each HoloMotion
// muscle to the right place on the figure before it is wired into BodyMap.
import { muscleFront, muscleBack, RENDERABLE_MUSCLES } from '@/components/dashboard/bodymap-data/muscles';

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
    } else if (C === 'S' || C === 'Q') {
      for (let i = 0; i + 3 < a.length; i += 4) {
        for (let k = 0; k < 4; k += 2) push(rel ? x + a[i + k] : a[i + k], rel ? y + a[i + k + 1] : a[i + k + 1]);
        const nx = rel ? x + a[i + 2] : a[i + 2]; const ny = rel ? y + a[i + 3] : a[i + 3]; x = nx; y = ny;
      }
    } else if (C === 'A') {
      for (let i = 0; i + 6 < a.length; i += 7) { x = rel ? x + a[i + 5] : a[i + 5]; y = rel ? y + a[i + 6] : a[i + 6]; push(x, y); }
    } else if (C === 'Z') { x = sx; y = sy; }
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

const all = [...muscleFront, ...muscleBack];
const by = (slug: string) => all.find((p) => p.slug === slug)!;
const box = (slug: string, side: 'left' | 'right') => {
  const ds = by(slug).path[side] ?? [];
  const bs = ds.map(bbox);
  return {
    minX: Math.min(...bs.map((b) => b.minX)), maxX: Math.max(...bs.map((b) => b.maxX)),
    minY: Math.min(...bs.map((b) => b.minY)), maxY: Math.max(...bs.map((b) => b.maxY)),
    cx: bs.reduce((s, b) => s + b.cx, 0) / bs.length,
    cy: bs.reduce((s, b) => s + b.cy, 0) / bs.length,
  };
};

const HOLOMOTION_22 = [
  'Biceps Brachii', 'Pectoralis Major', 'Lateral Deltoid', 'Posterior Deltoid', 'Rectus Abdominis',
  'External Oblique', 'Internal Oblique', 'Latissimus Dorsi', 'Gluteus Maximus', 'Gluteus Medius',
  'Piriformis', 'Sartorius', 'Vastus Lateralis', 'Upper Trapezius', 'Rectus Femoris', 'Gluteus Minimus',
  'Sternocleidomastoid', 'Vastus Medialis', 'Rectus Capitis Anterior', 'Middle Deltoid', 'Iliopsoas',
  'Biceps Femoris',
];

describe('HoloMotion muscle partition', () => {
  it('covers every documented muscle (via alias where anatomically identical)', () => {
    const missing = HOLOMOTION_22.filter(
      (m) => !RENDERABLE_MUSCLES.has(m) && m !== 'Middle Deltoid',
    );
    expect(missing).toEqual([]);
  });

  it('gives every rendered muscle both sides with real geometry', () => {
    const bad = all.filter((p) => !(p.path.left?.length) || !(p.path.right?.length));
    expect(bad.map((p) => p.slug)).toEqual([]);
  });

  it('places vastus medialis medial to vastus lateralis on both legs', () => {
    // Left leg sits at lower x; medial = toward the midline = higher x.
    expect(box('Vastus Medialis', 'left').cx).toBeGreaterThan(box('Vastus Lateralis', 'left').cx);
    // Right leg mirrors: medial = lower x.
    expect(box('Vastus Medialis', 'right').cx).toBeLessThan(box('Vastus Lateralis', 'right').cx);
  });

  it('makes rectus femoris the full-length quadriceps head', () => {
    const rf = box('Rectus Femoris', 'left');
    expect(rf.maxY - rf.minY).toBeGreaterThan(box('Vastus Lateralis', 'left').maxY - box('Vastus Lateralis', 'left').minY);
    expect(rf.maxY - rf.minY).toBeGreaterThan(box('Vastus Medialis', 'left').maxY - box('Vastus Medialis', 'left').minY);
  });

  it('puts gluteus medius above gluteus maximus', () => {
    expect(box('Gluteus Medius', 'left').minY).toBeLessThan(box('Gluteus Maximus', 'left').minY);
    expect(box('Gluteus Medius', 'right').minY).toBeLessThan(box('Gluteus Maximus', 'right').minY);
  });

  it('contains every deep inset inside its parent muscle box', () => {
    const within = (child: ReturnType<typeof box>, parent: ReturnType<typeof box>) =>
      child.minX >= parent.minX && child.maxX <= parent.maxX
      && child.minY >= parent.minY && child.maxY <= parent.maxY;
    (['left', 'right'] as const).forEach((s) => {
      // Piriformis + minimus live inside the gluteal mass (max ∪ medius).
      const glute = {
        minX: Math.min(box('Gluteus Maximus', s).minX, box('Gluteus Medius', s).minX),
        maxX: Math.max(box('Gluteus Maximus', s).maxX, box('Gluteus Medius', s).maxX),
        minY: Math.min(box('Gluteus Maximus', s).minY, box('Gluteus Medius', s).minY),
        maxY: Math.max(box('Gluteus Maximus', s).maxY, box('Gluteus Medius', s).maxY),
        cx: 0, cy: 0,
      };
      expect(within(box('Piriformis', s), glute)).toBe(true);
      expect(within(box('Gluteus Minimus', s), glute)).toBe(true);
    });
  });

  // The asset is a surface atlas with no geometry for these. Until 2026-08-22
  // they were drawn as a ring-and-dot marker; they are now drawn as their own
  // anatomy, with a dashed edge in the UI saying the structure lies beneath the
  // plane shown. Four of the eight muscles HoloMotion actually emits are in this
  // set, so this is the commonest thing the figure has to show — and the shapes
  // are inferred rather than measured, which is exactly why they are pinned.
  const DEEP = ['Piriformis', 'Gluteus Minimus', 'Iliopsoas', 'Internal Oblique', 'Rectus Capitis Anterior'];

  it('draws every deep muscle as one closed shape', () => {
    DEEP.forEach((slug) => {
      (['left', 'right'] as const).forEach((s) => {
        const ds = by(slug).path[s] ?? [];
        // One path, not the two the marker needed. A second path here would
        // reintroduce the "two separate findings" reading the marker had.
        expect(ds).toHaveLength(1);
        expect(ds[0].trim().endsWith('Z')).toBe(true);
      });
    });
  });

  it('keeps every deep muscle inside the structure it lies under', () => {
    // The containment guarantee the marker had, kept now that size varies: a
    // deep muscle is positioned and scaled from its PARENT's measured box, so it
    // cannot drift outside the muscle it is supposed to be underneath however
    // the asset is scaled.
    const parentOf: Record<string, string> = {
      Piriformis: 'Gluteus Maximus',
      'Gluteus Minimus': 'Gluteus Maximus',
      'Internal Oblique': 'External Oblique',
    };
    Object.entries(parentOf).forEach(([slug, parent]) => {
      (['left', 'right'] as const).forEach((s) => {
        const d = box(slug, s);
        const q = box(parent, s);
        expect(d.minX).toBeGreaterThanOrEqual(q.minX - 1);
        expect(d.maxX).toBeLessThanOrEqual(q.maxX + 1);
        expect(d.minY).toBeGreaterThanOrEqual(q.minY - 1);
        expect(d.maxY).toBeLessThanOrEqual(q.maxY + 1);
      });
    });
  });

  it('sizes a deep muscle as a minority of its parent, never a blob', () => {
    // The old marker was fixed-radius so a hip finding could not shout over a
    // neck one. Anatomy legitimately differs in size, so the guard becomes
    // proportional instead: big enough to see, never big enough to read as the
    // parent muscle itself.
    const parentOf: Record<string, string> = {
      Piriformis: 'Gluteus Maximus',
      'Gluteus Minimus': 'Gluteus Maximus',
      'Internal Oblique': 'External Oblique',
    };
    Object.entries(parentOf).forEach(([slug, parent]) => {
      (['left', 'right'] as const).forEach((s) => {
        const d = box(slug, s);
        const q = box(parent, s);
        const share = ((d.maxX - d.minX) * (d.maxY - d.minY))
          / (((q.maxX - q.minX) * (q.maxY - q.minY)) || 1);
        expect(share).toBeGreaterThan(0.005);
        expect(share).toBeLessThan(0.5);
      });
    });
  });

  it('mirrors deep obliquity across the midline', () => {
    // A muscle that runs down-and-outward on the left runs down-and-outward on
    // the right, which is the opposite angle on screen. If both sides were built
    // with the same rotation the figure would show one of them lying the wrong
    // way — anatomically wrong, and invisible without measuring it.
    // MEASURED FROM THE GEOMETRY, via the principal axis.
    //
    // This read the rotation straight off the `A` command's parameters, which
    // worked while every deep muscle was an ellipse. §125 reshaped five of them
    // into wedges and spindles built from C/Q curves, so the regex matched
    // nothing and both sides came back NaN. `expect(NaN).toBeCloseTo(-NaN)`
    // FAILS, which is the only reason it was noticed — written as a truthiness
    // check it would have gone silently blind on the exact change it polices.
    //
    // The first replacement took the two most distant points, and that is the
    // WRONG ESTIMATOR for a wedge: its furthest-apart pair are the broad-end
    // corners, i.e. the diagonal, not the axis. It reported 19° of error on
    // correctly mirrored geometry. The principal axis — the direction of maximum
    // variance — is right for all three shapes, which is what makes this
    // shape-agnostic rather than shape-lucky.
    const axisAngle = (d: string) => {
      const pts = [...d.matchAll(/(-?[\d.]+)[, ]+(-?[\d.]+)/g)]
        .map((m) => [Number(m[1]), Number(m[2])] as const)
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      const n = pts.length;
      const mx = pts.reduce((s, p) => s + p[0], 0) / n;
      const my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of pts) {
        sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my);
      }
      // Principal direction of a 2x2 covariance matrix. Halved because the
      // double-angle form gives 2θ.
      let deg = (Math.atan2(2 * sxy, sxx - syy) * 90) / Math.PI;
      // An axis is a LINE, not a direction, so 170° and -10° are the same thing.
      while (deg > 90) deg -= 180;
      while (deg <= -90) deg += 180;
      return deg;
    };
    ['Piriformis', 'Gluteus Minimus', 'Internal Oblique'].forEach((slug) => {
      const l = axisAngle(by(slug).path.left?.[0] ?? '');
      const r = axisAngle(by(slug).path.right?.[0] ?? '');
      expect(Number.isFinite(l) && Number.isFinite(r)).toBe(true);
      // A tolerance rather than toBeCloseTo(5): the containment clamp can scale
      // the two sides by different factors, which shifts the measured axis by a
      // fraction of a degree. Sign OPPOSITION is the property under test; exact
      // equality never was.
      expect(Math.abs(l + r)).toBeLessThan(1.5);
      // And the obliquity is real — a muscle drawn flat would mirror trivially.
      expect(Math.abs(l)).toBeGreaterThan(1);
    });
  });

  it('draws sartorius as one continuous strap, not two loose dots', () => {
    (['left', 'right'] as const).forEach((s) => {
      const ds = by('Sartorius').path[s] ?? [];
      expect(ds).toHaveLength(1);
      // Runs corner to corner: outer hip down to medial knee, so it should span
      // a good part of the thigh in BOTH axes rather than sitting in one spot.
      const b = bbox(ds[0]);
      const q = box('Rectus Femoris', s);
      expect(b.maxY - b.minY).toBeGreaterThan((q.maxY - q.minY) * 0.5);
    });
  });

  it('separates left and right so no muscle straddles the midline', () => {
    all.forEach((p) => {
      const l = box(p.slug, 'left');
      const r = box(p.slug, 'right');
      expect(l.cx).toBeLessThan(r.cx);
    });
  });
});

// ── the trapezius is a POSTERIOR muscle (§125, 2026-10-06) ──────────────────
//
// It was drawn on the FRONT figure only, so a flagged upper trapezius lit a
// sliver at the front of the neck and left the whole upper back blank — the
// region a clinician or a coach looks at first for it.
//
// "A large, triangular, paired muscle located on the posterior aspect of the
// neck and thorax", and "the most superficial muscle on the posterior aspect of
// the neck and thorax" (Kenhub; StatPearls NBK518994). Its descending fibres
// insert on the LATERAL THIRD OF THE CLAVICLE, which is why the anterior sliver
// is also correct and both figures carry it.
//
// The back geometry was already in bodyBack.ts and unused, so nothing was
// redrawn — the asset and its MIT attribution are untouched, which is what
// keeps this inside the locked body-map decision.
describe('upper trapezius placement', () => {
  const trap = () => muscleBack.find((p) => p.slug === 'Upper Trapezius');

  it('is drawn on the BACK figure, where the muscle actually is', () => {
    const t = trap();
    expect(t).toBeDefined();
    // Both sides, like every other paired muscle here, with real geometry
    // rather than an empty placeholder.
    expect(t?.path.left ?? []).not.toHaveLength(0);
    expect(t?.path.right ?? []).not.toHaveLength(0);
    expect((t?.path.left ?? []).join('').length).toBeGreaterThan(50);
  });

  it('is NOT also on the front, because the accumulator cannot hold both', () => {
    // Not an anatomical claim — the anterior sliver is real, since the
    // descending fibres reach the lateral third of the clavicle.  is keyed
    // by slug with ONE figure and  CONCATENATES paths, so listing the
    // muscle twice appends back coordinates to the front entry and the front
    // view draws the back's geometry. That was tried and this test caught it.
    // Pinned so the next person re-keys the accumulator rather than adding a
    // second .
    expect(muscleFront.some((p) => p.slug === 'Upper Trapezius')).toBe(false);
  });

  it('sits in the upper half of the back figure', () => {
    // A PLACEMENT check, not a presence one: wiring the wrong slug would still
    // produce paths, and they would be somewhere else entirely. The trapezius
    // spans the occiput to the mid-thorax, so its top must sit above the
    // midline of everything drawn on this figure.
    // Y coordinates out of the path data. Written with the Edit tool, not a
    // shell heredoc: the first attempt went through `node -e "…"` and the shell
    // ate every backslash, so `\d` arrived as `d` and the class matched literal
    // letters. The regex then found nothing, Math.min(...[]) gave Infinity and
    // the comparison read `Infinity < NaN` — gotcha 9, exactly as documented.
    const ys = (ds: string[]) => ds
      .flatMap((d) => [...d.matchAll(/(-?[\d.]+)[, ]+(-?[\d.]+)/g)].map((m) => Number(m[2])))
      .filter((n) => Number.isFinite(n));
    const sides = (p: { path: { left?: string[]; right?: string[] } }) => [
      ...(p.path.left ?? []), ...(p.path.right ?? []),
    ];
    const all = ys(muscleBack.flatMap(sides));
    const mid = (Math.min(...all) + Math.max(...all)) / 2;
    const t = trap();
    expect(t).toBeDefined();
    expect(Math.min(...ys(sides(t!)))).toBeLessThan(mid);
  });
});

// ── the deep muscles are SHAPES now, not lozenges (§125, 2026-10-06) ─────────
//
// Position and angle were already derived from each muscle's real course; the
// FORM was not. Every one was an ellipse, so a pear, a fan and a spindle all drew
// the same lozenge and were distinguishable only by where they sat.
//
// ASSERTED ON THE GEOMETRY, not on which helper was called. A test that grepped
// the source for `deepWedge` would pass over a wedge builder that emitted a
// circle — which is the winAnsiSafe shape, and this file's whole subject is
// shapes that are not what they claim.
describe('deep muscle form', () => {
  // Half-width across the shape's own principal axis, sampled in thirds along
  // it. A taper is "narrower at one end than the other" and an ellipse is
  // symmetric, so this is the measurement that tells them apart.
  const spread = (d: string) => {
    const pts = [...d.matchAll(/(-?[\d.]+)[, ]+(-?[\d.]+)/g)]
      .map((m) => [Number(m[1]), Number(m[2])] as const);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let sxx = 0; let syy = 0; let sxy = 0;
    for (const [x, y] of pts) {
      sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my);
    }
    const th = Math.atan2(2 * sxy, sxx - syy) / 2;
    const c = Math.cos(th); const s = Math.sin(th);
    const proj = pts.map(([x, y]) => [
      (x - mx) * c + (y - my) * s, -(x - mx) * s + (y - my) * c,
    ] as const);
    const alongs = proj.map((p) => p[0]);
    const lo = Math.min(...alongs); const hi = Math.max(...alongs);
    const band = (a: number, b: number) => {
      const across = proj
        .filter((p) => p[0] >= lo + (hi - lo) * a && p[0] <= lo + (hi - lo) * b)
        .map((p) => Math.abs(p[1]));
      return across.length ? Math.max(...across) : 0;
    };
    return { start: band(0, 0.34), middle: band(0.34, 0.66), end: band(0.66, 1) };
  };

  it('draws piriformis and gluteus minimus as TAPERS, broad at one end', () => {
    for (const slug of ['Piriformis', 'Gluteus Minimus']) {
      (['left', 'right'] as const).forEach((s) => {
        const w = spread((by(slug).path[s] ?? [])[0] ?? '');
        const ratio = Math.max(w.start, w.end) / Math.max(1e-6, Math.min(w.start, w.end));
        // An ellipse reads ~1.0 here, which is exactly what this replaced.
        expect(ratio).toBeGreaterThan(1.5);
      });
    }
  });

  it('draws iliopsoas as a SPINDLE, fattest in the middle', () => {
    (['left', 'right'] as const).forEach((s) => {
      const w = spread((by('Iliopsoas').path[s] ?? [])[0] ?? '');
      expect(w.middle).toBeGreaterThan(w.start);
      expect(w.middle).toBeGreaterThan(w.end);
    });
  });

  it('emits no elliptical arc for any reshaped muscle', () => {
    // Reverting one call back to `deep` would silently restore the lozenge, and
    // the two form tests above would be the only thing to notice. This says it
    // directly: the oval builder is used by nothing in the deep set.
    for (const slug of ['Piriformis', 'Gluteus Minimus', 'Iliopsoas', 'Internal Oblique', 'Rectus Capitis Anterior']) {
      (['left', 'right'] as const).forEach((s) => {
        expect((by(slug).path[s] ?? [])[0] ?? '').not.toMatch(/\bA\s/);
      });
    }
  });
});
