// Muscle-level partition of the body-map asset — the HoloMotion vocabulary.
//
// WHY THIS EXISTS
// The silhouette geometry comes from react-muscle-highlighter (MIT, Sorooj
// Shehryar — see bodyFront.ts for the attribution that must stay). That asset
// is a *workout* atlas: its parts are training regions (chest, biceps, quads,
// hamstring). HoloMotion is a *clinical postural* instrument whose Muscle
// Imbalance section names individual muscles, including deep stabilisers
// (piriformis, iliopsoas, rectus capitis anterior). The two taxonomies do not
// line up, so rendering HoloMotion flags on workout regions collapsed up to
// five distinct muscles into one shape — e.g. every glute finding, weak or
// tight, became a single blob. See docs/DESIGN_DECISIONS.md §4.
//
// WHAT THIS DOES
// Re-slices the SAME licensed path data into HoloMotion's muscles. Sixteen of
// the 22 muscles are recovered from sub-paths that already exist in the asset
// (the library draws the three vasti and the two glute heads as separate `d`
// strings — it just labels them all "quadriceps" / "gluteal"). No geometry is
// redrawn, so nothing can drift out of alignment with the silhouette.
//
// Sub-paths are selected by MEASURED GEOMETRY, not by array index: the asset's
// left and right limbs do not list their sub-paths in the same order (compare
// upper-back left [1]=large vs right [2]=large), so index-based slicing would
// silently mirror-swap muscles.
//
// The remaining 6 muscles are deep or absent from a surface atlas. They are
// drawn as schematic insets positioned inside their parent's measured bounding
// box — the same convention HoloMotion itself uses (its Muscle Imbalance figure
// shades piriformis *inside* the gluteal mass). Deriving them from the parent
// box keeps them anatomically contained rather than freehand-placed.
import { bodyFront } from './bodyFront';
import { bodyBack } from './bodyBack';
import type { BodyPart } from './types';

export type Figure = 'front' | 'back';
type Side = 'left' | 'right';
type Box = { minX: number; minY: number; maxX: number; maxY: number };

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

// Extents of a path's control + end points. Control points can overshoot the
// true curve, so this is a slight over-estimate — fine for ranking sub-paths
// and for placing insets, which is all it is used for.
function bbox(d: string): Box {
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let m: RegExpExecArray | null;
  const push = (px: number, py: number) => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  while ((m = re.exec(d))) {
    const cmd = m[1];
    const a = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M' || C === 'L' || C === 'T') {
      for (let i = 0; i + 1 < a.length; i += 2) {
        x = rel ? x + a[i] : a[i];
        y = rel ? y + a[i + 1] : a[i + 1];
        if (C === 'M' && i === 0) { sx = x; sy = y; }
        push(x, y);
      }
    } else if (C === 'H') {
      for (const v of a) { x = rel ? x + v : v; push(x, y); }
    } else if (C === 'V') {
      for (const v of a) { y = rel ? y + v : v; push(x, y); }
    } else if (C === 'C') {
      for (let i = 0; i + 5 < a.length; i += 6) {
        for (let k = 0; k < 6; k += 2) push(rel ? x + a[i + k] : a[i + k], rel ? y + a[i + k + 1] : a[i + k + 1]);
        const nx = rel ? x + a[i + 4] : a[i + 4];
        const ny = rel ? y + a[i + 5] : a[i + 5];
        x = nx; y = ny;
      }
    } else if (C === 'S' || C === 'Q') {
      for (let i = 0; i + 3 < a.length; i += 4) {
        for (let k = 0; k < 4; k += 2) push(rel ? x + a[i + k] : a[i + k], rel ? y + a[i + k + 1] : a[i + k + 1]);
        const nx = rel ? x + a[i + 2] : a[i + 2];
        const ny = rel ? y + a[i + 3] : a[i + 3];
        x = nx; y = ny;
      }
    } else if (C === 'A') {
      for (let i = 0; i + 6 < a.length; i += 7) {
        x = rel ? x + a[i + 5] : a[i + 5];
        y = rel ? y + a[i + 6] : a[i + 6];
        push(x, y);
      }
    } else if (C === 'Z') {
      x = sx; y = sy;
    }
  }
  return { minX, minY, maxX, maxY };
}

const EMPTY_BOX: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

const unionBox = (ds: string[]): Box => (ds.length
  ? ds.map(bbox).reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }))
  : EMPTY_BOX);

const height = (d: string) => { const b = bbox(d); return b.maxY - b.minY; };
const centreX = (d: string) => { const b = bbox(d); return (b.minX + b.maxX) / 2; };
const topY = (d: string) => bbox(d).minY;

// A circle as a path. `sweep` flips the winding direction, which is what lets
// two concentric circles fill as a ring under the default nonzero fill rule.
function circlePath(cx: number, cy: number, r: number, sweep: 0 | 1 = 0): string {
  return `M ${cx - r} ${cy} a ${r} ${r} 0 1 ${sweep} ${r * 2} 0 a ${r} ${r} 0 1 ${sweep} ${-r * 2} 0 Z`;
}

// Deep muscles are drawn as a MARKER — a ring with a centre dot — not as a
// pseudo-anatomical blob.
//
// Why: the licensed asset is a surface atlas and simply has no geometry for
// piriformis, iliopsoas, gluteus minimus, the internal oblique or rectus capitis
// anterior. The previous convention filled an ellipse inside the parent muscle,
// which looked like an attempt to draw the muscle and failed at it — and these
// are not rare edge cases: four of the eight muscles HoloMotion actually emits
// are in this set, so the instrument's commonest findings were exactly the ones
// rendered worst.
//
// A marker makes a different and truthful claim: "this structure, at this
// location" rather than "this is its shape". Fixed radius, so every deep finding
// reads at the same weight regardless of how big the parent happens to be.
const MARKER_R = 18;

function markerPaths(cx: number, cy: number): string[] {
  return [
    // Ring: outer circle + inner circle wound the other way, so the middle
    // stays hollow. One path, so it takes the flag colour like any other.
    `${circlePath(cx, cy, MARKER_R, 0)} ${circlePath(cx, cy, MARKER_R * 0.58, 1)}`,
    circlePath(cx, cy, MARKER_R * 0.26),
  ];
}

// Fractional point inside a parent's measured box.
function at(parent: Box, fx: number, fy: number): { cx: number; cy: number } {
  return {
    cx: parent.minX + (parent.maxX - parent.minX) * fx,
    cy: parent.minY + (parent.maxY - parent.minY) * fy,
  };
}

function marker(parent: Box, fx: number, fy: number): string[] {
  const { cx, cy } = at(parent, fx, fy);
  return markerPaths(cx, cy);
}

// A strap muscle drawn as the band it is: a thin quad from origin to insertion.
// Used for sartorius, which really does run as a single diagonal strap and so
// reads better as a band than as two disconnected dots.
function strap(parent: Box, from: [number, number], to: [number, number], w: number): string {
  const a = at(parent, from[0], from[1]);
  const b = at(parent, to[0], to[1]);
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w, ny = (dx / len) * w; // normal, scaled to half-width
  return `M ${a.cx + nx} ${a.cy + ny} L ${b.cx + nx} ${b.cy + ny} `
    + `L ${b.cx - nx} ${b.cy - ny} L ${a.cx - nx} ${a.cy - ny} Z`;
}

// ---------------------------------------------------------------------------
// Source lookup
// ---------------------------------------------------------------------------

const FRONT = new Map(bodyFront.map((p) => [p.slug, p]));
const BACK = new Map(bodyBack.map((p) => [p.slug, p]));

function paths(fig: Figure, slug: string, side: Side): string[] {
  const part = (fig === 'front' ? FRONT : BACK).get(slug);
  return part?.path?.[side] ?? [];
}

// Rank sub-paths by a scoring function and return the winner, plus the rest.
function pick(ds: string[], score: (d: string) => number): { hit: string[]; rest: string[] } {
  if (!ds.length) return { hit: [], rest: [] };
  let best = 0;
  ds.forEach((d, i) => { if (score(d) > score(ds[best])) best = i; });
  return { hit: [ds[best]], rest: ds.filter((_, i) => i !== best) };
}

// Midline of each figure, used to tell medial from lateral. Derived from the
// asset rather than hard-coded so it stays correct if the source is ever
// regenerated.
function midlineOf(fig: Figure): number {
  const head = (fig === 'front' ? FRONT : BACK).get('head')?.path.common ?? [];
  const b = unionBox(head);
  return (b.minX + b.maxX) / 2;
}
const MIDLINE: Record<Figure, number> = { front: midlineOf('front'), back: midlineOf('back') };

// ---------------------------------------------------------------------------
// The partition
// ---------------------------------------------------------------------------

// muscle slug → { front?: per-side paths, back?: per-side paths }
type SidedPaths = { left: string[]; right: string[] };
const acc = new Map<string, { fig: Figure; sided: SidedPaths }>();

function put(fig: Figure, muscle: string, side: Side, ds: string[]) {
  if (!ds.length) return;
  const cur = acc.get(muscle) ?? { fig, sided: { left: [], right: [] } };
  cur.sided[side] = cur.sided[side].concat(ds);
  acc.set(muscle, cur);
}

(['left', 'right'] as const).forEach((side) => {
  // -- 1:1 regions: the library part IS the HoloMotion muscle -----------------
  put('front', 'Pectoralis Major', side, paths('front', 'chest', side));
  put('front', 'Biceps Brachii', side, paths('front', 'biceps', side));
  put('front', 'Rectus Abdominis', side, paths('front', 'abs', side));
  put('front', 'Upper Trapezius', side, paths('front', 'trapezius', side));
  put('back', 'Biceps Femoris', side, paths('back', 'hamstring', side));

  // -- Deltoid: the figure already separates it ------------------------------
  // HoloMotion names "Lateral Deltoid" (myodynamia) and "Middle Deltoid"
  // (tension). Anatomically those are the SAME head, so both map to the front
  // deltoid; the posterior head is genuinely separate and lives on the back.
  put('front', 'Lateral Deltoid', side, paths('front', 'deltoids', side));
  put('back', 'Posterior Deltoid', side, paths('back', 'deltoids', side));

  // -- Quadriceps: three sub-paths = the three vasti --------------------------
  // Tallest sub-path runs hip→knee = rectus femoris. Of the remaining two, the
  // one nearer the midline is vastus medialis (the inner teardrop); the other
  // is vastus lateralis.
  {
    const q = paths('front', 'quadriceps', side);
    const { hit: rf, rest } = pick(q, height);
    put('front', 'Rectus Femoris', side, rf);
    if (rest.length) {
      const mid = MIDLINE.front;
      const medial = rest.reduce((a, b) => (Math.abs(centreX(a) - mid) < Math.abs(centreX(b) - mid) ? a : b));
      put('front', 'Vastus Medialis', side, [medial]);
      put('front', 'Vastus Lateralis', side, rest.filter((d) => d !== medial));
    }
  }

  // -- Gluteal: two sub-paths = medius (upper) + maximus (main mass) ----------
  {
    const g = paths('back', 'gluteal', side);
    if (g.length) {
      const upper = g.reduce((a, b) => (topY(a) <= topY(b) ? a : b));
      put('back', 'Gluteus Medius', side, [upper]);
      put('back', 'Gluteus Maximus', side, g.filter((d) => d !== upper));
    }
  }

  // -- Neck: superficial column = SCM ----------------------------------------
  {
    const n = paths('front', 'neck', side);
    const { hit: scm } = pick(n, height);
    put('front', 'Sternocleidomastoid', side, scm);
  }

  // -- Latissimus dorsi: the large lower sheet of the upper-back group -------
  {
    const ub = paths('back', 'upper-back', side);
    const { hit: lat } = pick(ub, height);
    put('back', 'Latissimus Dorsi', side, lat);
  }

  // -- External oblique: the superficial flank slips --------------------------
  put('front', 'External Oblique', side, paths('front', 'obliques', side));

  // -- Deep muscles: located by MARKER, not drawn as pseudo-anatomy -----------
  // See markerPaths above for why. Placement is still derived from the measured
  // box of the structure each one lies under, so the marker lands inside the
  // right region rather than being positioned freehand.
  {
    const glute = paths('back', 'gluteal', side);
    if (glute.length) {
      const gb = unionBox(glute);
      // Piriformis: deep, upper-medial third of the buttock, under max.
      put('back', 'Piriformis', side, marker(gb, side === 'left' ? 0.62 : 0.38, 0.30));
      // Gluteus minimus: deepest of the three, under medius.
      put('back', 'Gluteus Minimus', side, marker(gb, side === 'left' ? 0.34 : 0.66, 0.20));
    }
  }
  {
    const add = paths('front', 'adductors', side);
    if (add.length) {
      const ab = unionBox(add);
      // Iliopsoas: deep hip flexor at the groin — not the inner-thigh mass.
      put('front', 'Iliopsoas', side, marker(ab, side === 'left' ? 0.70 : 0.30, 0.10));
    }
  }
  {
    const ob = paths('front', 'obliques', side);
    if (ob.length) {
      const bb = unionBox(ob);
      // Internal oblique: deep to the external, same flank column.
      put('front', 'Internal Oblique', side, marker(bb, 0.5, 0.62));
    }
  }
  {
    const n = paths('front', 'neck', side);
    if (n.length) {
      const nb = unionBox(n);
      // Rectus capitis anterior: deep anterior neck flexor, high and medial.
      put('front', 'Rectus Capitis Anterior', side, marker(nb, side === 'left' ? 0.72 : 0.28, 0.28));
    }
  }
  {
    const q = paths('front', 'quadriceps', side);
    if (q.length) {
      const qb = unionBox(q);
      // Sartorius: long strap, ASIS (outer hip) → medial knee. It genuinely is
      // a single diagonal band, so it is drawn as one — clearer than the two
      // disconnected origin/insertion dots it used to be, which read as two
      // separate findings.
      const originFx = side === 'left' ? 0.22 : 0.78;
      const insertFx = side === 'left' ? 0.80 : 0.20;
      put('front', 'Sartorius', side, [strap(qb, [originFx, 0.08], [insertFx, 0.88], 7)]);
    }
  }
});

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function build(fig: Figure): BodyPart[] {
  return [...acc.entries()]
    .filter(([, v]) => v.fig === fig)
    .map(([slug, v]) => ({
      slug,
      color: '#3f3f3f',
      path: { left: v.sided.left, right: v.sided.right },
    }));
}

export const muscleFront: BodyPart[] = build('front');
export const muscleBack: BodyPart[] = build('back');

// Every muscle slug the figure can render, for scope checks in BodyMap.
export const RENDERABLE_MUSCLES: Set<string> = new Set([...acc.keys()]);

// Muscles drawn as a marker rather than as their own shape. BodyMap hides these
// entirely when nothing is flagged: a marker is an attention glyph, so leaving
// it on the figure unflagged reads as a finding that isn't there. The surface
// muscles have no such problem — they ARE the body, so they always draw.
export const MARKER_MUSCLES: Set<string> = new Set([
  'Piriformis', 'Gluteus Minimus', 'Iliopsoas', 'Internal Oblique', 'Rectus Capitis Anterior',
]);

// HoloMotion names that are the same anatomical structure as a rendered muscle
// and therefore share its shape. Kept explicit so the collapse is visible in
// code review rather than hidden in a lookup.
export const MUSCLE_ALIASES: Record<string, string> = {
  'Middle Deltoid': 'Lateral Deltoid',
};

// Inert scaffolding: parts of the silhouette HoloMotion never reports on. They
// still draw, so the body reads as a body — they just take no colour or hover.
export const INERT_FRONT: BodyPart[] = bodyFront.filter((p) => [
  'triceps', 'forearm', 'hands', 'knees', 'tibialis', 'calves', 'ankles', 'feet', 'head', 'hair', 'adductors',
].includes(p.slug));
export const INERT_BACK: BodyPart[] = bodyBack.filter((p) => [
  'triceps', 'forearm', 'hands', 'calves', 'ankles', 'feet', 'head', 'hair', 'adductors', 'lower-back', 'trapezius', 'neck',
].includes(p.slug));
