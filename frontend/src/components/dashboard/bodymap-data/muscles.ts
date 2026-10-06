// Muscle-level partition of the body-map asset — the HoloMotion vocabulary.
//
// The silhouette comes from react-muscle-highlighter (MIT, Sorooj Shehryar — see
// bodyFront.ts for the attribution that must stay), which is a *workout* atlas:
// its parts are training regions. HoloMotion is a clinical postural instrument
// naming individual muscles, deep stabilisers included. The taxonomies do not
// line up, so drawing HoloMotion flags on workout regions collapsed up to five
// muscles into one shape — every glute finding, weak or tight, became one blob.
// See docs/DESIGN_DECISIONS.md §4.
//
// This re-slices the SAME licensed paths into HoloMotion's 22 muscles. Sixteen
// come from sub-paths the asset already has (it draws the three vasti and both
// glute heads separately, then labels them all "quadriceps" / "gluteal"), so no
// geometry is redrawn and nothing can drift out of alignment.
//
// Sub-paths are selected by MEASURED GEOMETRY, not array index: left and right
// limbs do not list theirs in the same order (upper-back left [1] is the large
// one, right [2] is), so index slicing would silently mirror-swap muscles.
//
// The remaining 6 are deep or absent from a surface atlas, drawn as insets inside
// their parent's measured box — HoloMotion's own figure shades piriformis inside
// the gluteal mass. Deriving from the parent box keeps them contained.
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

// Deep muscles are drawn as oriented ovals in the place the structure occupies,
// replacing the ring-and-dot marker used until 2026-08-22.
//
// The licensed surface atlas has no geometry for piriformis, iliopsoas, gluteus
// minimus, the internal oblique or rectus capitis anterior — none is visible from
// the surface — which is why a marker was chosen first. Size, position and ANGLE
// now come from each muscle's real course instead: piriformis runs obliquely from
// sacrum to greater trochanter, iliopsoas descends near-vertically, the internal
// oblique fans up and medially against the external's grain.
//
// They stay marked as deep. BodyMap draws them with a dashed edge
// (.bodymap-deep), the illustration convention for a structure beneath the plane
// shown, so the figure does not promote an inference to a surface observation.
//
// Sizes are fractions of the PARENT's measured box, so a deep muscle stays
// contained by the structure it lies under at any scale. The old marker's fixed
// radius is not carried over — two muscles of different size should not be drawn
// identically once the figure claims to show shape.

// An ellipse as a path, rotated about its centre. Two half-arcs, because SVG's
// elliptical arc takes the x-axis rotation directly and needs no trigonometry
// beyond finding the two endpoints of the major axis.
function ovalPath(cx: number, cy: number, rx: number, ry: number, rotDeg: number): string {
  const r = (rotDeg * Math.PI) / 180;
  const dx = rx * Math.cos(r);
  const dy = rx * Math.sin(r);
  const x1 = cx - dx, y1 = cy - dy;
  const x2 = cx + dx, y2 = cy + dy;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} `
    + `A ${rx.toFixed(2)} ${ry.toFixed(2)} ${rotDeg} 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} `
    + `A ${rx.toFixed(2)} ${ry.toFixed(2)} ${rotDeg} 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

// A FUSIFORM (spindle) belly: widest in the middle, tapering to a point at each
// end, along an axis rotated `rotDeg` from the horizontal.
//
// The shape of a strap muscle with a tendon at both ends, and the iliopsoas is
// described in exactly those words — "fusiform (spindle-shaped)", set against the
// piriformis's pear (ScienceDirect; Wikipedia).
function spindlePath(cx: number, cy: number, rx: number, ry: number, rotDeg: number): string {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // Along-axis / across-axis -> absolute, so the caller only thinks about the
  // muscle's course and the whole shape rotates as one.
  const P = (a: number, b: number): [number, number] => [
    cx + a * cos - b * sin,
    cy + a * sin + b * cos,
  ];
  const n = (v: number) => v.toFixed(2);
  const [x1, y1] = P(-rx, 0);
  const [x2, y2] = P(rx, 0);
  const [c1x, c1y] = P(-rx * 0.5, -ry);
  const [c2x, c2y] = P(rx * 0.5, -ry);
  const [c3x, c3y] = P(rx * 0.5, ry);
  const [c4x, c4y] = P(-rx * 0.5, ry);
  return `M ${n(x1)} ${n(y1)} C ${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(x2)} ${n(y2)} `
    + `C ${n(c3x)} ${n(c3y)} ${n(c4x)} ${n(c4y)} ${n(x1)} ${n(y1)} Z`;
}

// A TAPERED WEDGE: broad at the negative end of the axis, narrowing to `tipFrac`
// of that half-width at the positive end, with gently convex sides.
//
// The piriformis is "a flat, pyramidally-shaped muscle" — the name is `pirum`
// (pear) + `forma` — broad across the anterior sacrum and converging to a tendon
// on the greater trochanter (Wikipedia; StatPearls). The gluteus minimus fans the
// same way. An ellipse is the same width at both ends, so the DIRECTION of the
// taper — the thing that identifies these muscles on sight — was simply absent.
function wedgePath(
  cx: number, cy: number, rx: number, ry: number, rotDeg: number, tipFrac: number,
): string {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const P = (a: number, b: number): [number, number] => [
    cx + a * cos - b * sin,
    cy + a * sin + b * cos,
  ];
  const n = (v: number) => v.toFixed(2);
  const tip = ry * tipFrac;
  const [ax, ay] = P(-rx, -ry);
  const [bx, by] = P(rx, -tip);
  const [dx, dy] = P(rx, tip);
  const [ex, ey] = P(-rx, ry);
  // Bowed slightly outward: a belly is convex, and straight edges read as a
  // drawn polygon rather than tissue.
  const [f1x, f1y] = P(0, -(ry + tip) * 0.62);
  const [f2x, f2y] = P(0, (ry + tip) * 0.62);
  return `M ${n(ax)} ${n(ay)} Q ${n(f1x)} ${n(f1y)} ${n(bx)} ${n(by)} `
    + `L ${n(dx)} ${n(dy)} Q ${n(f2x)} ${n(f2y)} ${n(ex)} ${n(ey)} Z`;
}

/**
 * Scale a shape about (cx, cy) until it sits inside `limit`.
 *
 * WHY THIS IS NEEDED AT ALL, and it is the thing the first attempt got wrong.
 * A rotated ellipse with half-extents (rx, ry) lies strictly INSIDE the rectangle
 * of those extents; a wedge puts real corners at (±rx, ±ry). So the same
 * fractions that fitted as an oval overflowed as a wedge — and the partition's
 * own containment test said so, which is the guard working.
 *
 * `limit` is passed SEPARATELY from the positioning box on purpose. The first fix
 * clamped to the box the muscle is positioned from — the whole gluteal mass — and
 * still failed, because the structure a deep muscle must stay inside is the one
 * COVERING it: piriformis lies deep to gluteus maximus, the internal oblique deep
 * to the external. Clamping to the union was looser than the anatomy and looser
 * than the test. Naming the covering muscle makes the code say the same thing the
 * anatomy and the test both say.
 */
function fitInside(d: string, limit: Box, cx: number, cy: number): string {
  const b = bbox(d);
  const ks = [
    b.minX < limit.minX ? (cx - limit.minX) / (cx - b.minX) : 1,
    b.maxX > limit.maxX ? (limit.maxX - cx) / (b.maxX - cx) : 1,
    b.minY < limit.minY ? (cy - limit.minY) / (cy - b.minY) : 1,
    b.maxY > limit.maxY ? (limit.maxY - cy) / (b.maxY - cy) : 1,
  ].filter((k) => Number.isFinite(k) && k > 0);
  const k = Math.min(1, ...ks);
  if (k >= 1) return d;
  // These builders emit absolute M/C/Q/L/Z only — every number is one coordinate
  // of an (x, y) pair — so a positional pass is safe. It would NOT be safe on an
  // `A` command, whose first three numbers are radii and an angle.
  let i = 0;
  return d.replace(/-?[\d.]+/g, (nStr) => {
    const c = i % 2 === 0 ? cx : cy;
    i += 1;
    return (c + (Number(nStr) - c) * k).toFixed(2);
  });
}

// Fractional point inside a parent's measured box.
function at(parent: Box, fx: number, fy: number): { cx: number; cy: number } {
  return {
    cx: parent.minX + (parent.maxX - parent.minX) * fx,
    cy: parent.minY + (parent.maxY - parent.minY) * fy,
  };
}

// A deep muscle: an oval placed at (fx, fy) of the parent box, with radii given
// as fractions of that box and an angle given in degrees clockwise from the
// horizontal. `rot` is mirrored by the caller for the right side, since a
// muscle's obliquity reverses across the midline.
function deep(
  parent: Box,
  fx: number, fy: number,
  rxFrac: number, ryFrac: number,
  rotDeg: number,
): string[] {
  const w = parent.maxX - parent.minX;
  const h = parent.maxY - parent.minY;
  const { cx, cy } = at(parent, fx, fy);
  return [ovalPath(cx, cy, w * rxFrac, h * ryFrac, rotDeg)];
}

// RESHAPED, NOT RECOLOURED (2026-10-06, §125). These two take the SAME
// box-fraction arguments `deep` takes — same position, same extents, same angle —
// and differ only in the outline emitted. Nothing about the fill is touched:
// BodyMap colours a part from its FLAG STATE, so the palette and every token
// behind it are untouched by this file.
//
// `limit` is the structure the muscle must stay inside, which is the one COVERING
// it and not necessarily the one it is positioned from. See fitInside.

/** A fusiform belly — pointed at both ends, widest in the middle. */
function deepSpindle(
  parent: Box, fx: number, fy: number, rxFrac: number, ryFrac: number, rotDeg: number,
  limit: Box = parent,
): string[] {
  const w = parent.maxX - parent.minX;
  const h = parent.maxY - parent.minY;
  const { cx, cy } = at(parent, fx, fy);
  return [fitInside(spindlePath(cx, cy, w * rxFrac, h * ryFrac, rotDeg), limit, cx, cy)];
}

/**
 * A tapered wedge — broad at the NEGATIVE end of the axis.
 *
 * `tipFrac` is how much of the broad half-width survives at the tip: ~0.2 is a
 * pronounced pear converging on a tendon, ~0.5 a gentle fan.
 */
function deepWedge(
  parent: Box, fx: number, fy: number, rxFrac: number, ryFrac: number, rotDeg: number,
  tipFrac = 0.3, limit: Box = parent,
): string[] {
  const w = parent.maxX - parent.minX;
  const h = parent.maxY - parent.minY;
  const { cx, cy } = at(parent, fx, fy);
  return [fitInside(wedgePath(cx, cy, w * rxFrac, h * ryFrac, rotDeg, tipFrac), limit, cx, cy)];
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
  // THE TRAPEZIUS IS A POSTERIOR MUSCLE AND WAS DRAWN ONLY ON THE FRONT
  // (fixed 2026-10-06, §125).
  //
  // It is "a large, triangular, paired muscle located on the posterior aspect of
  // the neck and thorax" and "the most superficial muscle on the posterior
  // aspect of the neck and thorax" (Kenhub; StatPearls NBK518994). So a flagged
  // upper trapezius lit a sliver at the front of the neck and left the whole
  // upper back blank — the region a clinician and a coach would both look at
  // first for it.
  //
  // THE BACK GEOMETRY WAS ALREADY IN THE ASSET AND UNUSED: bodyBack.ts carries a
  // `trapezius` slug with both sides. Nothing is redrawn here; the existing
  // licensed path is simply wired up, which is why this stays inside the locked
  // asset decision (CLAUDE.md — the source and MIT attribution are untouched).
  //
  // BACK ONLY, AND "BOTH FIGURES" WAS TRIED FIRST AND IS WRONG HERE.
  //
  // The descending fibres do reach the lateral third of the clavicle, so an
  // anterior sliver is defensible anatomically — but `acc` is keyed by SLUG
  // with a single `fig`, and `put` keeps the FIRST figure while CONCATENATING
  // paths. So putting the muscle on both appended back-figure coordinates to the
  // front entry: the front view would draw the back's geometry. Caught by the
  // placement test below, which is why that test asserts a BOX and not merely
  // that some paths exist.
  //
  // Supporting both figures properly means re-keying the accumulator on
  // fig|slug, which is a change to the whole partition for one muscle's sliver.
  // Not worth it: a surface atlas shows the trapezius on the posterior view, and
  // that is where a reader looks for it.
  put('back', 'Upper Trapezius', side, paths('back', 'trapezius', side));
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

  // -- Deep muscles: drawn as their own anatomy, marked as deep ---------------
  // See `deep` above. Position, size AND angle come from each muscle's real
  // course; the containing box is the structure it lies under, so a deep muscle
  // can never escape its parent however the asset is scaled. `mirror` flips
  // obliquity across the midline — a muscle that runs down-and-out on the left
  // runs down-and-out on the right, which is the opposite screen angle.
  const mirror = side === 'left' ? 1 : -1;
  {
    const glute = paths('back', 'gluteal', side);
    if (glute.length) {
      const gb = unionBox(glute);
      // The covering structure: gluteus maximus is the sheet both of these lie
      // deep to, and it is what they must stay inside — not the whole gluteal
      // union they are positioned from. `upper` is medius, so the rest is maximus,
      // exactly as the put() above splits them.
      const upperG = glute.reduce((a, b) => (topY(a) <= topY(b) ? a : b));
      const maxBox = unionBox(glute.filter((d) => d !== upperG));

      // Piriformis: a PEAR. "A flat, pyramidally-shaped muscle" whose name is
      // `pirum` + `forma`, broad across the anterior sacrum and converging to a
      // tendon on the greater trochanter (Wikipedia; StatPearls). So the axis runs
      // medial-and-higher (broad) to lateral-and-lower (narrow), and the broad end
      // is the negative end — which on the left side is medial.
      //
      // tip 0.22: the insertion is a tendon, not a belly. That taper is what
      // distinguishes it on sight from the glutes lying over it.
      put('back', 'Piriformis', side,
        deepWedge(gb, side === 'left' ? 0.60 : 0.40, 0.30, 0.30, 0.055, 20 * mirror, 0.22, maxBox));
      // Gluteus minimus: a FAN — the deepest and smallest of the three, spreading
      // across the ilium and converging on the trochanter. A gentler taper, since
      // the muscular part stays broad for most of its length.
      put('back', 'Gluteus Minimus', side,
        deepWedge(gb, side === 'left' ? 0.34 : 0.66, 0.22, 0.20, 0.10, -40 * mirror, 0.45, maxBox));
    }
  }
  {
    const add = paths('front', 'adductors', side);
    if (add.length) {
      const ab = unionBox(add);
      // Iliopsoas: descends from the lumbar spine across the pelvic brim to the
      // lesser trochanter — a long, near-vertical strap at the groin, NOT the
      // inner-thigh mass its parent box belongs to.
      // FUSIFORM — "spindle-shaped", explicitly contrasted with the piriformis's
      // pear (ScienceDirect). A long belly tapering to the tendon that reaches the
      // lesser trochanter, which is the form an ellipse cannot carry.
      put('front', 'Iliopsoas', side,
        deepSpindle(ab, side === 'left' ? 0.68 : 0.32, 0.12, 0.085, 0.13, 15 * mirror));
    }
  }
  {
    const ob = paths('front', 'obliques', side);
    if (ob.length) {
      const bb = unionBox(ob);
      // Internal oblique: deep to the external and running the OTHER way — up
      // and medially, where the external runs down and medially. Drawing the two
      // at opposing angles is the whole reason a reader can tell them apart.
      // A FAN: broad at the iliac crest and inguinal ligament, narrowing as the
      // fibres sweep up and medially to the linea alba. The taper shows the
      // direction of travel, and that direction — opposite to the external
      // oblique's — is the whole reason a reader can tell the two apart.
      //
      // Clamped to the external oblique, which is the sheet it lies deep to and
      // which is this same box, so the limit is explicit rather than incidental.
      put('front', 'Internal Oblique', side,
        deepWedge(bb, 0.5, 0.58, 0.30, 0.13, -30 * mirror, 0.5, bb));
    }
  }
  {
    const n = paths('front', 'neck', side);
    if (n.length) {
      const nb = unionBox(n);
      // Rectus capitis anterior: a short deep flexor from the atlas to the
      // occiput — small, near-vertical, high and medial on the anterior neck.
      // A short flat STRAP from the atlas to the occiput — fusiform, because both
      // ends are attachments and the belly is the middle.
      put('front', 'Rectus Capitis Anterior', side,
        deepSpindle(nb, side === 'left' ? 0.70 : 0.30, 0.26, 0.10, 0.20, 8 * mirror));
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

// The DEEP muscles: structures the licensed surface atlas cannot see, drawn
// from their known anatomy and marked with a dashed edge (.bodymap-deep).
//
// BodyMap hides these entirely when nothing is flagged, and that is still right
// now they have shapes. A surface muscle always draws because it IS the body;
// a deep one drawn unflagged would assert an interior the figure is otherwise
// not showing, and would read as a finding that isn't there.
//
// The name is kept as MARKER_MUSCLES to avoid a rename touching every caller
// days before assessment; it means "the deep set", and the 2026-08-22 change
// replaced how they are drawn, not which they are.
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
