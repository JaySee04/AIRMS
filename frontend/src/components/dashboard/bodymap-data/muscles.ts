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
export type Box = { minX: number; minY: number; maxX: number; maxY: number };

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

export const unionBox = (ds: string[]): Box => (ds.length
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
 * A MUSCLE BELLY, not a mathematical form (JC, §138).
 *
 * `spindlePath` and `wedgePath` above are symmetric about their own axis: the
 * spindle's widest point is exactly at the middle, the wedge's sides are mirror
 * images. Nothing in anatomy is. JC looked at the rendered figure and called the
 * six deep muscles "shapes plastered on the existing shapes", and that is what a
 * symmetric primitive looks like next to the licensed atlas's traced outlines —
 * the eye reads an ellipse or a triangle, not tissue.
 *
 * This emits the three things that make a silhouette read as muscle:
 *
 *   `swell`   WHERE the belly is widest, as a fraction along the axis. A real
 *             belly sits off-centre — proximal on the iliopsoas, distal on the
 *             sartorius — and the asymmetry is most of what the eye uses.
 *   `tip`     how much half-width survives at the far end. A tendon, not a cut.
 *   `lean`    how much more convex one side is than the other. A belly bulges
 *             towards the side it is unopposed on; equal curves read as a leaf.
 *
 * Built from the same (cx, cy, rx, ry, rotDeg) the primitives take, so position,
 * extent and obliquity are unchanged and `fitInside` and every mirror guard keep
 * working on it untouched. Only the outline between the ends is different.
 *
 * Emits absolute M/C/Z: `fitInside`'s positional rescale requires every number
 * to be one coordinate of an (x, y) pair, which an `A` command would break.
 */
function bellyPath(
  cx: number, cy: number, rx: number, ry: number, rotDeg: number,
  { swell = 0.5, tip = 0.3, lean = 1.15, mirror = 1 }: {
    swell?: number; tip?: number; lean?: number; mirror?: 1 | -1;
  } = {},
): string {
  const r = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // THE ACROSS-AXIS SIGN MIRRORS TOO, and leaving it out is what the mirror
  // guard caught on the first run of §138 — |l + r| came back 3.99 against a
  // tolerance of 1.5.
  //
  // The symmetric spindle and wedge mirrored for free: flip the rotation and the
  // shape is its own reflection. This outline is deliberately NOT symmetric
  // across its axis — that is what `lean` and an off-centre `swell` are for — so
  // flipping only the rotation mirrors the COURSE and leaves the bulge on the
  // same side of it. The two sides then differ by more than a reflection, which
  // is anatomically wrong and invisible without measuring the principal axis.
  const fs = mirror < 0 ? -1 : 1;
  // Along-axis / across-axis -> absolute, so the caller only ever thinks about
  // the muscle's course.
  const P = (a: number, bRaw: number): [number, number] => {
    const b = bRaw * fs;
    return [cx + a * cos - b * sin, cy + a * sin + b * cos];
  };
  const n = (v: number) => v.toFixed(2);
  // `swell` is 0..1 along the axis; convert to the -rx..rx the helper works in.
  const sx = -rx + 2 * rx * Math.min(0.85, Math.max(0.15, swell));
  const far = ry * tip;

  const [ax, ay] = P(-rx, 0);            // origin — the narrow proximal end
  const [bx, by] = P(rx, 0);             // insertion — the tendon
  // Upper border: rises to the widest point at `sx`, then falls to the tendon.
  const [u1x, u1y] = P(-rx + (sx + rx) * 0.35, -ry * lean * 0.78);
  const [u2x, u2y] = P(sx, -ry * lean);
  const [u3x, u3y] = P(sx + (rx - sx) * 0.45, -ry * lean * 0.72);
  const [u4x, u4y] = P(rx - (rx - sx) * 0.18, -far);
  // Lower border, returning — flatter, which is the asymmetry `lean` creates.
  const [l1x, l1y] = P(rx - (rx - sx) * 0.18, far);
  const [l2x, l2y] = P(sx + (rx - sx) * 0.45, ry * 0.70);
  const [l3x, l3y] = P(sx, ry);
  const [l4x, l4y] = P(-rx + (sx + rx) * 0.35, ry * 0.74);

  return `M ${n(ax)} ${n(ay)} `
    + `C ${n(u1x)} ${n(u1y)} ${n(u2x)} ${n(u2y)} ${n(u3x)} ${n(u3y)} `
    + `C ${n(u4x)} ${n(u4y)} ${n(bx)} ${n(by)} ${n(bx)} ${n(by)} `
    + `C ${n(bx)} ${n(by)} ${n(l1x)} ${n(l1y)} ${n(l2x)} ${n(l2y)} `
    + `C ${n(l3x)} ${n(l3y)} ${n(l4x)} ${n(l4y)} ${n(ax)} ${n(ay)} Z`;
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
export function at(parent: Box, fx: number, fy: number): { cx: number; cy: number } {
  return {
    cx: parent.minX + (parent.maxX - parent.minX) * fx,
    cy: parent.minY + (parent.maxY - parent.minY) * fy,
  };
}

/**
 * A SHEET: a closed, smooth shape through fractional points of `parent`.
 *
 * `strap`, `spindle` and `wedge` all make BANDS, and several of these muscles
 * are sheets — a pectoralis or a latissimus drawn as a band is the "plastered
 * on" complaint (§138) in a different costume.
 *
 * SMOOTH BY CONSTRUCTION. Each VERTEX becomes a quadratic control point and
 * each EDGE MIDPOINT an anchor, which is the standard way to round a closed
 * polygon and guarantees tangent continuity at every midpoint — so the shape
 * has no corners anywhere. The first version drew straight lines between
 * vertices and every sheet read as a cut-out polygon.
 *
 * `bow` on a point offsets its control point perpendicular to the local
 * direction of travel, pushing that border in or out. IT MUST BE MIRRORED
 * BETWEEN SIDES: the two sides travel in opposite x-directions, so one fixed
 * sign bulges one side laterally and the other medially, and the pair stops
 * being a mirror image. Use `medialSign` for that.
 */
export function sheet(parent: Box, pts: Array<[number, number, number?]>): string {
  const P = pts.map(([fx, fy, bow]) => ({ ...at(parent, fx, fy), bow: bow ?? 0 }));
  const n = (v: number) => v.toFixed(2);
  const mid = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) =>
    ({ cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2 });

  const start = mid(P[P.length - 1], P[0]);
  let d = `M ${n(start.cx)} ${n(start.cy)}`;
  for (let i = 0; i < P.length; i += 1) {
    const v = P[i];
    const nxt = P[(i + 1) % P.length];
    const end = mid(v, nxt);
    let { cx, cy } = v;
    if (v.bow) {
      const prev = P[(i - 1 + P.length) % P.length];
      const dx = nxt.cx - prev.cx;
      const dy = nxt.cy - prev.cy;
      const len = Math.hypot(dx, dy) || 1;
      cx += (-dy / len) * len * v.bow;
      cy += (dx / len) * len * v.bow;
    }
    d += ` Q ${n(cx)} ${n(cy)} ${n(end.cx)} ${n(end.cy)}`;
  }
  return `${d} Z`;
}

/**
 * Which way is MEDIAL for a box, derived from the figure rather than assumed.
 *
 * Returns X(m): m = 1 at the body's midline, 0 at the far lateral edge.
 *
 * THE MIDLINE COMES FROM THE NECK, NOT THE HEAD. `midlineOf` below uses the
 * head, which is fine for the front but wrong behind: on the back figure the
 * head box centres at x 1050 while the true midline — where the left and right
 * necks meet — is 1084. Anchoring a back muscle on the head mirrors it.
 */
export function medialX(fig: Figure, box: Box): (m: number) => number {
  const nl = unionBox(paths(fig, 'neck', 'left'));
  const nr = unionBox(paths(fig, 'neck', 'right'));
  const midline = (nl.maxX + nr.minX) / 2;
  const toMaxX = (box.minX + box.maxX) / 2 < midline;
  return (m: number) => (toMaxX ? m : 1 - m);
}

/** +1 or -1, so a `bow` can be mirrored between sides. See `sheet`. */
export const medialSign = (X: (m: number) => number): number => (X(1) === 0 ? -1 : 1);

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

/**
 * A fusiform belly — widest near the middle, tapering to a tendon.
 *
 * Drawn by `bellyPath` since §138: the symmetric spindle it replaced put its
 * widest point exactly at the midpoint, which is the one place a real belly
 * almost never is. `swell` moves it; the default sits it slightly proximal,
 * which is where a fusiform muscle's mass actually lies.
 */
function deepSpindle(
  parent: Box, fx: number, fy: number, rxFrac: number, ryFrac: number, rotDeg: number,
  limit: Box = parent,
  form: { swell?: number; tip?: number; lean?: number; mirror?: 1 | -1 } = {},
): string[] {
  const w = parent.maxX - parent.minX;
  const h = parent.maxY - parent.minY;
  const { cx, cy } = at(parent, fx, fy);
  return [fitInside(
    bellyPath(cx, cy, w * rxFrac, h * ryFrac, rotDeg, { swell: 0.44, tip: 0.26, lean: 1.1, ...form }),
    limit, cx, cy,
  )];
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
  form: { swell?: number; lean?: number; mirror?: 1 | -1 } = {},
): string[] {
  const w = parent.maxX - parent.minX;
  const h = parent.maxY - parent.minY;
  const { cx, cy } = at(parent, fx, fy);
  // `swell` near the origin is what makes this a FAN rather than a triangle:
  // the fibres are broadest at the attachment and converge from there, so the
  // widest point belongs close to the broad end, not partway along it (§138).
  return [fitInside(
    bellyPath(cx, cy, w * rxFrac, h * ryFrac, rotDeg, {
      swell: 0.2, tip: tipFrac, lean: 1.18, ...form,
    }),
    limit, cx, cy,
  )];
}

// A strap muscle drawn as the band it is: a thin quad from origin to insertion.
// Used for sartorius, which really does run as a single diagonal strap and so
// reads better as a band than as two disconnected dots.
export function strap(
  parent: Box, from: [number, number], to: [number, number], w: number,
  { bow = 0, taper = 0.7 }: { bow?: number; taper?: number } = {},
): string {
  const a = at(parent, from[0], from[1]);
  const b = at(parent, to[0], to[1]);
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;        // along
  const nx = -uy, ny = ux;                   // across
  const n = (v: number) => v.toFixed(2);

  // A CURVE, NOT A RULER (JC, §138). This emitted a four-point quad, so the
  // sartorius — the longest muscle in the body and the one thing on the figure a
  // reader might actually recognise — was drawn as a perfectly straight bar of
  // constant width. On screen it read as a ruler laid over the thigh, which is
  // precisely the "plastered on" complaint.
  //
  // The real muscle spirals: it leaves the ASIS heading down and medially, crosses
  // the front of the thigh, and arrives at the medial knee from behind. `bow`
  // displaces the midline across the axis to give that sweep; `taper` narrows
  // both ends, because it begins and ends as tendon.
  const mid = { cx: (a.cx + b.cx) / 2 + nx * bow * len, cy: (a.cy + b.cy) / 2 + ny * bow * len };
  const edge = (s: number, half: number) => {
    // One side of the band, out and back along the bowed centre line.
    const p0 = { x: a.cx + nx * half * taper * s, y: a.cy + ny * half * taper * s };
    const pm = { x: mid.cx + nx * half * s, y: mid.cy + ny * half * s };
    const p1 = { x: b.cx + nx * half * taper * s, y: b.cy + ny * half * taper * s };
    return { p0, pm, p1 };
  };
  const hi = edge(1, w);
  const lo = edge(-1, w);
  // Quadratic through the bowed midpoint on each border; the control point is
  // placed so the curve passes close to it rather than merely leaning that way.
  const q = (p0: {x:number;y:number}, pm: {x:number;y:number}, p1: {x:number;y:number}) => {
    const cx2 = 2 * pm.x - (p0.x + p1.x) / 2;
    const cy2 = 2 * pm.y - (p0.y + p1.y) / 2;
    return `Q ${n(cx2)} ${n(cy2)} ${n(p1.x)} ${n(p1.y)} `;
  };
  return `M ${n(hi.p0.x)} ${n(hi.p0.y)} ${q(hi.p0, hi.pm, hi.p1)}`
    + `L ${n(lo.p1.x)} ${n(lo.p1.y)} ${q(lo.p1, lo.pm, lo.p0)}Z`;
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

// The two MEDIAL hamstrings. They are not in HoloMotion's vocabulary, so they
// are not flaggable - but they are real parts of the thigh and must still draw,
// or removing them from Biceps Femoris leaves a hole. Appended to INERT_BACK.
const MEDIAL_HAMSTRINGS: string[] = [];

function put(fig: Figure, muscle: string, side: Side, ds: string[]) {
  if (!ds.length) return;
  const cur = acc.get(muscle) ?? { fig, sided: { left: [], right: [] } };
  cur.sided[side] = cur.sided[side].concat(ds);
  acc.set(muscle, cur);
}

(['left', 'right'] as const).forEach((side) => {
  // -- 1:1 regions: the library part IS the HoloMotion muscle -----------------
  // PECTORALIS MAJOR: A FAN, NOT A PAD (2026-10-11).
  //
  // Origins are the medial half of the CLAVICLE, the sternum and the costal
  // cartilages of ribs 1-6; insertion is a narrow tendon on the humerus. So the
  // muscle is broad all down the midline and converges to a point at the arm,
  // and its inferior border sweeps UP to the axilla rather than straight across.
  //
  // The atlas sub-path is a rounded pad that stops short of the sternum, never
  // reaches the clavicle and does not converge. It is a pectoral REGION, not the
  // muscle. Measured on this asset (left): chest x 251..360, y 316..438.
  {
    const cb = unionBox(paths('front', 'chest', side));
    const db = unionBox(paths('front', 'deltoids', side));
    if (cb.maxX > cb.minX) {
      const box = { ...cb, minY: Math.min(cb.minY, db.minY + (db.maxY - db.minY) * 0.1) };
      const X = medialX('front', box);
      put('front', 'Pectoralis Major', side, [sheet(box, [
        [X(0.98), 0.10],          // sternoclavicular, at the midline
        [X(0.32), 0.04, -0.05],   // out along the clavicle, which rises laterally
        [X(0.03), 0.26],          // humeral insertion, the narrow end
        [X(0.20), 0.44, 0.08],    // inferior border leaving the axilla
        [X(0.92), 0.97, 0.07],    // down and medially to rib 6
        [X(1.00), 0.88, 0.01],    // up the sternal edge
      ])]);
    }
  }
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
  // UPPER TRAPEZIUS: THE NECK-TO-SHOULDER SLOPE (2026-10-11).
  //
  // Origin the occiput and the nuchal ligament, insertion the lateral clavicle
  // and the ACROMION, so the descending fibres run down and OUT and the muscle
  // forms the visible slope a clinician palpates for a stiff neck.
  //
  // The atlas sub-path is a vertical triangle pointing down the midline that
  // never reaches the shoulder: it occupies middle and lower trapezius territory
  // and misses the upper one entirely. Measured (left, back): neck x 1023..1078
  // y 219..294, trapezius x 1003..1080 y 297..473, deltoids x 914..981.
  {
    const tb = unionBox(paths('back', 'trapezius', side));
    const db = unionBox(paths('back', 'deltoids', side));
    const nb = unionBox(paths('back', 'neck', side));
    if (tb.maxX > tb.minX) {
      const nl = unionBox(paths('back', 'neck', 'left'));
      const nr = unionBox(paths('back', 'neck', 'right'));
      const midline = (nl.maxX + nr.minX) / 2;
      // The acromion is the deltoid MEDIAL third, not its outer edge. Spanning
      // to the outer edge overhung the silhouette and met its opposite number
      // as one cape across the back.
      const dW = db.maxX - db.minX;
      const acromion = db.minX < midline ? db.minX + dW * 0.30 : db.maxX - dW * 0.30;
      const box = {
        minX: Math.min(acromion, midline), maxX: Math.max(acromion, midline),
        minY: nb.minY + (nb.maxY - nb.minY) * 0.30,
        maxY: tb.minY + (tb.maxY - tb.minY) * 0.62,
      };
      const X = medialX('back', box);
      put('back', 'Upper Trapezius', side, [sheet(box, [
        [X(0.95), 0.04],          // occiput / nuchal line at the midline
        [X(0.95), 0.80],          // down the spine to C7-T1
        [X(0.14), 0.88, 0.05],    // out to the acromion, inferior border
        [X(0.18), 0.62],          // the acromial attachment
        [X(0.58), 0.22, 0.12],    // back up the slope, concave
      ])]);
    }
  }
  // BICEPS FEMORIS IS ONE OF THREE HAMSTRINGS (2026-10-11).
  //
  // It is the LATERAL one, running to the head of the fibula; semitendinosus and
  // semimembranosus occupy the medial half. Clinically a lateral and a medial
  // hamstring strain are different injuries, so the distinction is worth drawing.
  //
  // This used to assign the WHOLE hamstring region - all four sub-paths - so a
  // lateral finding lit the medial hamstrings too. The atlas already draws the
  // four separately, so this is a SELECTION, not new geometry: take the two most
  // lateral by measured distance from the midline. Measured centres (left):
  // 972, 999, 1033, 1044 against a midline of 1084.
  //
  // The medial pair still has to DRAW or the thigh gains a hole, so they go to
  // INERT_BACK - the same treatment the figure gives every part HoloMotion does
  // not report on.
  {
    const hs = paths('back', 'hamstring', side);
    if (hs.length) {
      const nl = unionBox(paths('back', 'neck', 'left'));
      const nr = unionBox(paths('back', 'neck', 'right'));
      const midline = (nl.maxX + nr.minX) / 2;
      const ranked = hs
        .map((d) => ({ d, dist: Math.abs(centreX(d) - midline) }))
        .sort((a, b) => b.dist - a.dist);
      put('back', 'Biceps Femoris', side, ranked.slice(0, 2).map((x) => x.d));
      MEDIAL_HAMSTRINGS.push(...ranked.slice(2).map((x) => x.d));
    }
  }

  // -- Deltoid: the figure already separates it ------------------------------
  // HoloMotion names "Lateral Deltoid" (myodynamia) and "Middle Deltoid"
  // (tension). Anatomically those are the SAME head, so both map to the front
  // deltoid; the posterior head is genuinely separate and lives on the back.
  // LATERAL DELTOID: ACROMION TO DELTOID TUBEROSITY (2026-10-11).
  //
  // Origin the acromion, insertion a third of the way down the lateral humerus,
  // so it is an inverted triangle that DESCENDS THE ARM. The atlas sub-path is a
  // cap sitting on top of the shoulder that stops where the arm begins: it has
  // neither attachment, which is why no deltoid was recognisable.
  // Measured (left): deltoids x 193..278 y 298..398, biceps x 181..223 y 404..493.
  {
    const db = unionBox(paths('front', 'deltoids', side));
    const bb = unionBox(paths('front', 'biceps', side));
    if (db.maxX > db.minX) {
      const box = {
        minX: Math.min(db.minX, bb.minX), maxX: Math.max(db.maxX, bb.maxX),
        minY: db.minY, maxY: bb.minY + (bb.maxY - bb.minY) * 0.42,
      };
      const X = medialX('front', box);
      put('front', 'Lateral Deltoid', side, [sheet(box, [
        [X(0.92), 0.08],          // acromion, medial end
        [X(0.22), 0.16, -0.05],   // over the cap to the outer acromion
        [X(0.14), 0.70, 0.03],    // down the lateral border of the arm
        [X(0.34), 0.97],          // deltoid tuberosity, the converging point
        [X(0.72), 0.52, -0.07],   // back up the medial border
      ])]);
    }
  }
  // POSTERIOR DELTOID: SPINE OF SCAPULA TO HUMERUS (2026-10-11).
  //
  // A triangle with its base MEDIAL along the scapular spine and its apex
  // LATERAL and low on the arm. The atlas sub-path is a rounded cap on the top
  // outer corner of the shoulder with neither attachment - the same fault the
  // front deltoid had. The scapular spine is not drawn by the atlas, so the
  // medial limit is the deltoid own medial edge.
  {
    const db = unionBox(paths('back', 'deltoids', side));
    const tb = unionBox(paths('back', 'triceps', side));
    if (db.maxX > db.minX) {
      const armBottom = tb.maxY > tb.minY
        ? tb.minY + (tb.maxY - tb.minY) * 0.34
        : db.maxY + (db.maxY - db.minY) * 0.45;
      const box = {
        minX: Math.min(db.minX, tb.minX > 0 ? tb.minX : db.minX),
        maxX: Math.max(db.maxX, tb.maxX > 0 ? tb.maxX : db.maxX),
        minY: db.minY + (db.maxY - db.minY) * 0.12,
        maxY: armBottom,
      };
      const X = medialX('back', box);
      put('back', 'Posterior Deltoid', side, [sheet(box, [
        [X(0.90), 0.10],          // medial edge toward the scapular spine
        [X(0.48), 0.02],          // out along the spine to the acromion
        [X(0.20), 0.34],          // over the posterior shoulder
        [X(0.36), 0.92],          // deltoid tuberosity, the apex
        [X(0.62), 0.50, 0.07],    // back up the inferior border
      ])]);
    }
  }

  // -- Quadriceps: three sub-paths = the three vasti --------------------------
  // Tallest sub-path runs hip→knee = rectus femoris. Of the remaining two, the
  // one nearer the midline is vastus medialis (the inner teardrop); the other
  // is vastus lateralis.
  {
    const q = paths('front', 'quadriceps', side);
    const { hit: rf, rest } = pick(q, height);
    // THE CENTRAL STRIP, NOT THE WHOLE ANTERIOR MASS (2026-10-11).
    //
    // The tallest quadriceps sub-path spans x 240..309 of a thigh running
    // 240..328 - i.e. most of the front of the thigh. It is in the right PLACE
    // and far too wide, so it swallowed the territory the two vasti should read
    // against. Rectus femoris is a fusiform strip from the AIIS to the patellar
    // tendon, with vastus lateralis outside it and vastus medialis inside.
    //
    // NOTE: an earlier review called the quads MISLABELLED. That was wrong and
    // was withdrawn after measuring - both vasti are correctly placed.
    const qbRF = unionBox(q);
    const Xr = medialX('front', qbRF);
    put('front', 'Rectus Femoris', side, [sheet(qbRF, [
      [Xr(0.44), 0.02],         // AIIS
      [Xr(0.30), 0.42, 0.04],   // lateral border, widest at mid-thigh
      [Xr(0.42), 0.94],         // patellar tendon
      [Xr(0.56), 0.94],
      [Xr(0.72), 0.42, 0.04],   // medial border
      [Xr(0.58), 0.02],
    ])]);
    void rf;
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

  // -- SCM: THE DIAGONAL (2026-10-11) ----------------------------------------
  //
  // Origins the manubrium and the medial clavicle; insertion the MASTOID
  // PROCESS, behind and below the ear. So it crosses the neck diagonally, and
  // that diagonal is the feature a clinician recognises.
  //
  // It used to be the TALLEST neck sub-path: a short near-vertical sliver in the
  // hollow of the throat that never reached the skull. Measured (front): head
  // x 298..427 y 125..259, neck x 326..400 y 240..317 — the skull is wider than
  // the neck, so the mastoid sits lateral to the throat. Only its HEIGHT is
  // inferred; the atlas draws no ear.
  {
    const nb = unionBox(paths('front', 'neck', side));
    const hb = unionBox(paths('front', 'head', side).concat(
      (bodyFront.find((bp) => bp.slug === 'head')?.path.common ?? []),
    ));
    if (nb.maxX > nb.minX && hb.maxX > hb.minX) {
      const span = { minX: hb.minX, maxX: hb.maxX, minY: hb.maxY - (hb.maxY - hb.minY) * 0.10, maxY: nb.maxY };
      const lateral = side === 'left' ? -1 : 1;
      put('front', 'Sternocleidomastoid', side, [strap(
        span,
        [0.5 + lateral * 0.30, 0.05],   // mastoid: lateral and high
        [0.5 + lateral * 0.10, 0.98],   // sternoclavicular: near the midline
        (nb.maxX - nb.minX) * 0.15,
        // NO BOW. Bow is perpendicular to travel, so one fixed sign mirrors
        // wrong: the two straps hooked inward and met at the throat, reading as
        // a single W rather than two muscles.
        { taper: 0.62 },
      )]);
    }
  }

  // -- LATISSIMUS DORSI: A CONVERGING SHEET (2026-10-11) ---------------------
  //
  // Origin is enormous and LOW: T7 to L5, the thoracolumbar fascia, the iliac
  // crest and the lower ribs. Insertion is a narrow tendon on the HUMERUS. So it
  // is a triangle converging upwards and laterally - wide at the hip, a tendon
  // at the axilla.
  //
  // It used to be the taller upper-back sub-path: a parallel-sided slab on the
  // mid-back with neither attachment and no convergence, sitting roughly where
  // the RHOMBOIDS are. Measured (left, back): upper-back x 955..1064 y 322..585,
  // lower-back x 979..1078 y 489..641, gluteal top y 615, deltoids x 914..981.
  {
    const ub = unionBox(paths('back', 'upper-back', side));
    const lb = unionBox(paths('back', 'lower-back', side));
    const gl = unionBox(paths('back', 'gluteal', side));
    const db = unionBox(paths('back', 'deltoids', side));
    if (ub.maxX > ub.minX) {
      const nl = unionBox(paths('back', 'neck', 'left'));
      const nr = unionBox(paths('back', 'neck', 'right'));
      const midline = (nl.maxX + nr.minX) / 2;
      const box = {
        minX: Math.min(ub.minX, db.minX + (db.maxX - db.minX) * 0.5),
        maxX: Math.max(midline, ub.maxX),
        minY: db.maxY - (db.maxY - db.minY) * 0.15,
        maxY: Math.min(gl.minY, lb.maxY),
      };
      const X = medialX('back', box);
      put('back', 'Latissimus Dorsi', side, [sheet(box, [
        [X(0.26), 0.02],          // humeral tendon at the axilla - the apex
        [X(0.14), 0.30, 0.04],    // lateral border descending over the flank
        [X(0.40), 0.96, 0.05],    // out along the iliac crest
        [X(0.96), 0.98],          // thoracolumbar fascia at the spine
        [X(0.96), 0.30, -0.03],   // up the spine to about T7
      ])]);
    }
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
        deepWedge(gb, side === 'left' ? 0.60 : 0.40, 0.30, 0.30, 0.055, 20 * mirror, 0.22, maxBox,
          { mirror }));
      // Gluteus minimus: a FAN — the deepest and smallest of the three, spreading
      // across the ilium and converging on the trochanter. A gentler taper, since
      // the muscular part stays broad for most of its length.
      put('back', 'Gluteus Minimus', side,
        deepWedge(gb, side === 'left' ? 0.34 : 0.66, 0.22, 0.20, 0.10, -40 * mirror, 0.45, maxBox,
          { mirror }));
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
      //
      // REBUILT AS A SHEET (2026-10-12, JC). It was a spindle confined to the
      // groin - roughly the last fifth of the muscle. Psoas major starts at
      // T12-L5, level with the bottom of the ribcage, and iliacus fills the iliac
      // fossa; they converge across the pelvic brim onto the lesser trochanter.
      //
      // THIS DELIBERATELY RELAXES TWO DEEP-MUSCLE CONVENTIONS. The old rules were
      // that a deep shape stays inside the single structure it lies under and
      // stays a minority of it, so the figure never asserts a large interior it
      // cannot see. JC chose anatomical truth over those: "screw that just change
      // them." Containment is now enforced by MUSCLE_CLIPS at render time rather
      // than by the geometry, which is a stronger guarantee - a clip cannot be
      // overshot - and the dashed deep edge still marks it as inferred.
      //
      // Measured: abs x 303..362 y 426..716, adductors x 274..351 y 647..899.
      const absB = unionBox(paths('front', 'abs', side));
      const ipBox = {
        minX: Math.min(absB.minX, ab.minX), maxX: Math.max(absB.maxX, ab.maxX),
        minY: absB.minY + (absB.maxY - absB.minY) * 0.06,
        maxY: ab.minY + (ab.maxY - ab.minY) * 0.26,
      };
      const Xi = medialX('front', ipBox);
      // The WIDTH is the iliacus. Psoas descends as a narrow belly beside the
      // spine, then iliacus fans across the whole iliac fossa before the two
      // converge on one tendon - so the shape is narrow at both ends and broad
      // at the pelvis. Drawn 0.22 of the box wide through the middle at first,
      // which rendered as a sliver and showed only the psoas half.
      put('front', 'Iliopsoas', side, [sheet(ipBox, [
        [Xi(0.93), 0.02],         // T12/L1 beside the spine
        [Xi(0.74), 0.05],         // psoas belly at its origin
        [Xi(0.55), 0.46, 0.03],   // psoas descending, still narrow
        [Xi(0.17), 0.70, 0.05],   // iliacus, widest across the iliac fossa
        [Xi(0.38), 0.92, 0.04],   // converging over the pelvic brim
        [Xi(0.54), 0.99],         // lesser trochanter, the tendon
        [Xi(0.66), 0.74, -0.04],  // back up the medial border
        [Xi(0.84), 0.44, -0.02],
      ])]);
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
      // REBUILT AS A SHEET (2026-10-12, JC) - same decision as the iliopsoas.
      // The wedge was a small blob mid-flank that reached neither the iliac crest
      // nor the ribs, and was too small to show a DIRECTION - which is the one
      // thing distinguishing it from the external oblique lying over it.
      const ioBox = {
        minX: bb.minX, maxX: bb.maxX,
        minY: bb.minY + (bb.maxY - bb.minY) * 0.16, maxY: bb.maxY,
      };
      const Xo = medialX('front', ioBox);
      put('front', 'Internal Oblique', side, [sheet(ioBox, [
        [Xo(0.08), 0.86],         // iliac crest, lateral end
        [Xo(0.70), 0.97, 0.04],   // along the crest / inguinal ligament
        [Xo(0.92), 0.58, 0.05],   // up to the linea semilunaris
        [Xo(0.48), 0.08, 0.06],   // to the lower ribs
        [Xo(0.10), 0.38, 0.05],   // back down the lateral border
      ])]);
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
        deepSpindle(nb, side === 'left' ? 0.70 : 0.30, 0.26, 0.13, 0.26, 8 * mirror, nb,
          // Short and almost parallel-sided: both ends are attachments.
          { mirror, swell: 0.5, tip: 0.5, lean: 1.05 }));
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
      // IT MUST CROSS THE THIGH (2026-10-11). Origin the ASIS at the front and
      // OUTSIDE of the hip; insertion the pes anserinus on the MEDIAL tibia. The
      // crossing is the entire identity of the muscle, and the previous shape
      // stayed lateral the whole way down, reading as a fourth quadriceps.
      //
      // The bow is MIRRORED off the medial axis. It is perpendicular to the
      // direction of travel and the two sides travel in opposite x-directions,
      // so one fixed sign bulges one leg laterally and the other medially - the
      // pair stops being a mirror image, which is visible as plain asymmetry.
      const Xs = medialX('front', qb);
      put('front', 'Sartorius', side, [strap(
        qb,
        [Xs(0.08), 0.02],   // ASIS: outer hip, high
        [Xs(0.88), 0.99],   // pes anserinus: inner knee, low
        (qb.maxX - qb.minX) * 0.13,
        { bow: 0.07 * medialSign(Xs), taper: 0.5 },
      )]);
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
/**
 * CONSTRUCTED MUSCLES ARE CLIPPED TO THE REGION THE ATLAS ALREADY DREW.
 *
 * A shape built from fractions of a bounding box can leave the body, because a
 * box is a rectangle and a body is not. Every overflow the 2026-10-11 rebuild
 * produced - square deltoid corners past the shoulder, a trapezius cape across
 * the back, a pectoralis reaching into the arm - was exactly that.
 *
 * Clipping to the atlas's own outline is exact and costs nothing: the shape is
 * authored freely and the licensed geometry decides where it stops. Whatever a
 * constructed muscle gets wrong, it can no longer escape the figure.
 *
 * Only muscles RECOVERED from sub-paths are absent here; they are already the
 * atlas's own geometry and cannot overflow.
 */
export const MUSCLE_CLIPS: Record<string, { fig: Figure; slugs: string[] }> = {
  'Sternocleidomastoid': { fig: 'front', slugs: ['neck', 'head'] },
  'Pectoralis Major': { fig: 'front', slugs: ['chest'] },
  'Lateral Deltoid': { fig: 'front', slugs: ['deltoids', 'biceps'] },
  'Latissimus Dorsi': { fig: 'back', slugs: ['upper-back', 'lower-back'] },
  // The two deep sheets (2026-10-12): containment is a CLIP now, not a geometry
  // constraint, so these must be listed or they can escape the body.
  // 'abs' because the internal oblique inserts into the rectus sheath at the
  // linea semilunaris, so its medial edge genuinely lies under the rectus
  // abdominis. Measured: with 'obliques' alone the left shape sat 5 units past
  // the strip's medial edge and the clip was cutting that insertion off.
  'Internal Oblique': { fig: 'front', slugs: ['obliques', 'abs'] },
  'Iliopsoas': { fig: 'front', slugs: ['abs', 'obliques', 'adductors'] },
  'Sartorius': { fig: 'front', slugs: ['quadriceps', 'adductors'] },
  'Rectus Femoris': { fig: 'front', slugs: ['quadriceps'] },
  'Upper Trapezius': { fig: 'back', slugs: ['trapezius', 'deltoids', 'neck'] },
  'Posterior Deltoid': { fig: 'back', slugs: ['deltoids', 'triceps'] },
};

/** The path data a muscle's clip is built from. Empty when it needs no clip. */
export function clipPathsFor(name: string): string[] {
  const spec = MUSCLE_CLIPS[name];
  if (!spec) return [];
  const src = spec.fig === 'front' ? bodyFront : bodyBack;
  return spec.slugs.flatMap((slug) => {
    const part = src.find((x) => x.slug === slug);
    return part ? [...(part.path.common ?? []), ...(part.path.left ?? []), ...(part.path.right ?? [])] : [];
  });
}

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
export const INERT_BACK: BodyPart[] = ([
  { slug: 'hamstring-medial', color: '', path: { common: MEDIAL_HAMSTRINGS } } as BodyPart,
]).concat(bodyBack.filter((p) => [
  'triceps', 'forearm', 'hands', 'calves', 'ankles', 'feet', 'head', 'hair', 'adductors', 'lower-back', 'trapezius', 'neck',
].includes(p.slug)));
