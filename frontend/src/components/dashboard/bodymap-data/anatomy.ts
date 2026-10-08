// ONE LANDMARK SYSTEM. Every shape in the body map is derived from it.
//
// WHY THIS FILE EXISTS (2026-10-08, JC, DESIGN_DECISIONS §144).
//
// The figure used to be react-muscle-highlighter (MIT, Sorooj Shehryar) — a
// WORKOUT atlas whose parts are training regions. HoloMotion is a clinical
// postural instrument naming individual muscles, deep stabilisers included, so
// the two taxonomies never lined up. §4a re-sliced the licensed paths into
// HoloMotion's 22 muscles and §138 reshaped the six deep ones, but both worked
// by measuring the donated geometry and fitting shapes to it. JC's verdict,
// twice: "shapes plastered on the existing shapes".
//
// He is right, and the reason is structural rather than cosmetic. A shape fitted
// to somebody else's bounding box can only ever be as correct as that box, so
// sartorius — a strap crossing the whole thigh diagonally — was being fitted
// inside a quadriceps blob, and iliopsoas was an inset in a region that does not
// contain it. No amount of reshaping fixes a muscle whose ANCHORS are wrong.
//
// So the geometry is authored here instead, from anatomical landmarks. Muscles
// are placed by origin and insertion — the two points anatomy actually defines
// them by — and the region layer is built from the SAME landmarks, which is what
// guarantees a muscle sits inside the region that contains it. That is a
// property of the construction, not something a test has to chase.
//
// NOT TRACED FROM THE REPORT. HoloMotion's Muscle Imbalance page is the
// reference for WHICH muscles, which view each is drawn on, and the
// anterior/posterior pairing — all facts about anatomy and about the
// instrument's vocabulary. The paths are ours. Tracing a vendor's illustration
// into a submitted artifact is a licensing problem JC does not need, and
// anatomy itself is not anybody's copyright.
//
// COORDINATES. 724 x 1448 per figure, two figures in one 1448-wide space so the
// existing viewBox windowing still works: front at x 0..724, back at x
// 724..1448. BodyMap.tsx renders them as two <svg>s side by side.

export type Pt = [number, number];

// The per-figure box, and where the BACK figure's window starts. Both figures
// share one 1448-wide space so BodyMap's two <svg>s can window it by viewBox:
// front `0 0 724 1448`, back `724 0 724 1448`.
export const FIG_W = 724;
export const BACK_X0 = 724;

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------
// A 7.5-head standing figure, which is the proportion anatomical atlases use and
// close to what HoloMotion draws. Every number below is in FRONT-figure space;
// `onBack()` shifts a finished path into the back figure's window, so no shape
// is ever authored twice.
export const LM = {
  cx: 362,

  headTop: 56,
  headRx: 56,
  headRy: 78,
  chin: 228,

  neckTop: 214,
  neckBot: 312,
  neckHalf: 33,

  // Acromion (point of shoulder) and the deltoid cap that sits over it.
  shoulderY: 330,
  shoulderHalf: 172,

  chestTop: 344,
  chestBot: 500,
  chestHalf: 152,

  waistY: 606,
  waistHalf: 108,

  // Iliac crest and greater trochanter.
  crestY: 648,
  hipY: 700,
  hipHalf: 140,
  crotchY: 764,

  thighHalfTop: 92,
  kneeY: 1052,
  kneeHalf: 56,
  calfY: 1190,
  ankleY: 1340,
  ankleHalf: 30,
  footY: 1408,

  // Arm chain, as offsets from the centre line.
  shoulderJoint: [168, 356] as Pt,
  elbow: [224, 686] as Pt,
  wrist: [254, 918] as Pt,
  fingerTip: [262, 1012] as Pt,
  armHalfUpper: 46,
  armHalfFore: 34,
};

// ---------------------------------------------------------------------------
// Path construction
// ---------------------------------------------------------------------------

// A closed organic shape through the given points (Catmull-Rom converted to
// cubic Béziers). Muscles are specified as a handful of anatomical points and
// this makes them read as tissue rather than as polygons — which is the whole
// difference between an anatomical figure and the "shapes" JC objected to.
//
// `tension` 0 collapses to straight lines; 1 is the natural spline. Values
// above ~1.3 self-intersect on tight turns, so callers stay at or below it.
export function smooth(pts: Pt[], tension = 1): string {
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension;
    d += `C${r1(c1x)},${r1(c1y)} ${r1(c2x)},${r1(c2y)} ${r1(p2[0])},${r1(p2[1])}`;
  }
  return `${d}Z`;
}

// A muscle BELLY between its origin and insertion: the fusiform shape almost
// every skeletal muscle has — narrow at both tendons, widest a little past the
// midpoint toward the origin.
//
// This is the primitive the old file lacked. Fitting an ellipse to a bounding
// box cannot express "runs from here to there", so a muscle's DIRECTION was
// previously whatever the donated blob happened to be.
export function belly(
  origin: Pt,
  insertion: Pt,
  width: number,
  opts: { swell?: number; bulge?: number; originWidth?: number; insertWidth?: number } = {},
): string {
  const { swell = 0.45, bulge = 0, originWidth = 0.22, insertWidth = 0.18 } = opts;
  const [ox, oy] = origin;
  const [ix, iy] = insertion;
  const dx = ix - ox;
  const dy = iy - oy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Unit normal — the across-axis direction the belly widens along.
  const nx = -uy;
  const ny = ux;

  // `bulge` bows the whole muscle sideways, for the ones that wrap a bone
  // (sartorius crossing the thigh, the oblique sheets following the flank).
  const at = (t: number, w: number): [Pt, Pt] => {
    const bx = ox + dx * t + nx * bulge * Math.sin(Math.PI * t);
    const by = oy + dy * t + ny * bulge * Math.sin(Math.PI * t);
    return [
      [bx + nx * w, by + ny * w],
      [bx - nx * w, by - ny * w],
    ];
  };

  const wO = width * originWidth;
  const wMid = width;
  const wI = width * insertWidth;

  const [a0] = at(0, wO);
  const [a1, b1] = at(swell * 0.55, wMid * 0.85);
  const [a2, b2] = at(swell, wMid);
  const [a3, b3] = at(swell + (1 - swell) * 0.5, wMid * 0.72);
  const [a4] = at(1, wI);
  const [, b0] = at(0, wO);
  const [, b4] = at(1, wI);

  return smooth([a0, a1, a2, a3, a4, b4, b3, b2, b1, b0], 0.9);
}

// A flat STRAP or sheet: constant-ish width along a path of waypoints. For
// muscles that are bands rather than spindles — trapezius, the oblique sheets,
// latissimus.
export function sheet(spine: Pt[], halfWidth: number | number[]): string {
  const w = (i: number) => (Array.isArray(halfWidth)
    ? halfWidth[Math.min(i, halfWidth.length - 1)]
    : halfWidth);
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < spine.length; i += 1) {
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = w(i);
    left.push([spine[i][0] + nx * hw, spine[i][1] + ny * hw]);
    right.push([spine[i][0] - nx * hw, spine[i][1] - ny * hw]);
  }
  return smooth([...left, ...right.reverse()], 0.85);
}

// ---------------------------------------------------------------------------
// Mirroring
// ---------------------------------------------------------------------------

// Reflect a point list about the figure's centre line. Authoring every paired
// muscle ONCE and mirroring is what makes left and right provably symmetric —
// the §138 defect was a mirror that flipped rotation without flipping the
// across-axis sign, so the two sides were subtly different shapes.
export function mirrorPts(pts: Pt[], cx = LM.cx): Pt[] {
  return pts.map(([x, y]) => [2 * cx - x, y] as Pt);
}

// Shift a finished path string into the BACK figure's window. Operates on the
// numbers in the path, so a shape is authored once in front-space and placed in
// either figure.
export function onBack(d: string): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
    (_m, x: string, y: string) => `${r1(Number(x) + BACK_X0)},${y}`);
}

// ---------------------------------------------------------------------------
// Silhouette
// ---------------------------------------------------------------------------

// THE TORSO OUTLINE CARRIES NO ARMS, AND THE ARMS ARE THEIR OWN SHAPES.
//
// Tried it as one continuous contour first and it cannot work: with arms at the
// sides, the upper arm's INNER edge sits medial to the ribcage, so a single
// outline that runs down the outer arm and back up the inner one crosses into
// the torso and self-intersects at the armpit — which rendered as arms visibly
// detached from the body. Anatomical atlases draw the limb over the trunk for
// exactly this reason, and so does HoloMotion.
function halfProfile(): Pt[] {
  const L = LM;
  return [
    // neck → shoulder → armpit
    [L.cx + L.neckHalf, L.neckTop + 26],
    [L.cx + L.neckHalf + 6, L.neckBot - 18],
    [L.cx + 98, L.shoulderY - 16],
    [L.cx + L.shoulderHalf - 10, L.shoulderY + 14],
    [L.cx + L.shoulderHalf - 16, L.shoulderY + 72],
    [L.cx + L.chestHalf - 6, L.chestTop + 96],
    // torso
    [L.cx + L.chestHalf, L.chestBot - 76],
    [L.cx + L.waistHalf + 4, L.waistY],
    [L.cx + L.hipHalf - 14, L.crestY + 6],
    [L.cx + L.hipHalf, L.hipY + 10],
    // leg, outer
    [L.cx + L.thighHalfTop + 6, L.crotchY + 44],
    [L.cx + L.kneeHalf + 24, L.kneeY - 140],
    [L.cx + L.kneeHalf + 4, L.kneeY + 4],
    [L.cx + L.kneeHalf + 18, L.calfY - 40],
    [L.cx + L.ankleHalf + 8, L.ankleY - 54],
    [L.cx + L.ankleHalf + 2, L.ankleY + 6],
    // foot
    [L.cx + L.ankleHalf + 30, L.footY - 10],
    [L.cx + L.ankleHalf + 28, L.footY],
    [L.cx + 6, L.footY],
    // leg, inner, back up to the crotch
    [L.cx + 12, L.ankleY - 4],
    [L.cx + 22, L.kneeY + 50],
    [L.cx + 20, L.kneeY - 40],
    [L.cx + 30, L.crotchY + 96],
    [L.cx + 12, L.crotchY + 8],
  ];
}

export function silhouette(): string {
  const right = halfProfile();
  const left = mirrorPts(right).reverse();
  const head: Pt[] = [
    [LM.cx - LM.neckHalf, LM.neckTop + 26],
    [LM.cx - LM.neckHalf - 2, LM.chin - 2],
    [LM.cx - LM.headRx + 10, LM.chin - 30],
    [LM.cx - LM.headRx, LM.headTop + LM.headRy - 22],
    [LM.cx - LM.headRx + 18, LM.headTop + 12],
    [LM.cx, LM.headTop],
    [LM.cx + LM.headRx - 18, LM.headTop + 12],
    [LM.cx + LM.headRx, LM.headTop + LM.headRy - 22],
    [LM.cx + LM.headRx - 10, LM.chin - 30],
    [LM.cx + LM.neckHalf + 2, LM.chin - 2],
  ];
  return smooth([...head, ...right, ...left], 0.78);
}

// One arm, authored on the right and mirrored by the caller. Shoulder cap down
// the outer edge, round the hand, back up the inner edge to the armpit.
export function armOutline(): string {
  const L = LM;
  const [sjx, sjy] = L.shoulderJoint;
  const [ex, ey] = L.elbow;
  const [wx, wy] = L.wrist;
  const [fx, fy] = L.fingerTip;
  return smooth([
    [L.cx + 96, L.shoulderY - 14],
    [L.cx + L.shoulderHalf - 6, L.shoulderY + 16],
    [L.cx + L.shoulderHalf + 2, L.shoulderY + 76],
    [L.cx + sjx + L.armHalfUpper, sjy + 120],
    [L.cx + ex + L.armHalfFore + 6, ey - 40],
    [L.cx + ex + L.armHalfFore + 2, ey + 36],
    [L.cx + wx + L.armHalfFore - 8, wy - 44],
    [L.cx + wx + 18, wy + 14],
    [L.cx + fx + 12, fy - 44],
    [L.cx + fx + 2, fy],
    [L.cx + fx - 28, fy - 4],
    [L.cx + wx - 24, wy + 18],
    [L.cx + ex - L.armHalfFore + 4, ey + 30],
    [L.cx + sjx - L.armHalfUpper + 10, sjy + 110],
    [L.cx + 104, L.chestTop + 70],
    [L.cx + 92, L.shoulderY + 30],
  ], 0.8);
}
