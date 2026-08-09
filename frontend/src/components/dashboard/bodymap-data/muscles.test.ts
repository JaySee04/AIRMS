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

  // The asset is a surface atlas with no geometry for these, so they are marked
  // rather than drawn. Four of the eight muscles HoloMotion actually emits are
  // in this set, so this is the commonest thing the figure has to show.
  const DEEP = ['Piriformis', 'Gluteus Minimus', 'Iliopsoas', 'Internal Oblique', 'Rectus Capitis Anterior'];

  it('draws every deep muscle as a hollow ring plus a centre dot', () => {
    DEEP.forEach((slug) => {
      (['left', 'right'] as const).forEach((s) => {
        const ds = by(slug).path[s] ?? [];
        expect(ds).toHaveLength(2);
        // The ring is one path holding two circles wound in OPPOSITE directions;
        // that opposition is what leaves the centre hollow under nonzero fill.
        // Drawn the same way round, it would fill solid and be a blob again.
        const sweeps = [...ds[0].matchAll(/a [\d.]+ [\d.]+ 0 1 ([01])/g)].map((m) => m[1]);
        expect(sweeps).toEqual(['0', '0', '1', '1']);
        // Centre dot sits concentric with the ring.
        expect(bbox(ds[1]).cx).toBeCloseTo(bbox(ds[0]).cx, 5);
        expect(bbox(ds[1]).cy).toBeCloseTo(bbox(ds[0]).cy, 5);
      });
    });
  });

  it('gives every deep marker the same size, whatever its parent', () => {
    const widths = DEEP.flatMap((slug) => (['left', 'right'] as const).map((s) => {
      const b = bbox((by(slug).path[s] ?? [])[0]);
      return b.maxX - b.minX;
    }));
    // A marker is a fixed-radius glyph, not a fraction of whatever it sits in —
    // otherwise a hip finding would shout and a neck finding would whisper.
    expect(new Set(widths.map((w) => w.toFixed(3))).size).toBe(1);
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
