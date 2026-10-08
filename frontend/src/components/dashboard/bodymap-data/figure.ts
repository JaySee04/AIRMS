// THE FIGURE: two layers, one landmark system (2026-10-08, JC, §144).
//
//   REGION layer  — 23 training/anatomical regions. Drives subitem (ROM &
//                   Stability) mode, where HoloMotion genuinely reports 5
//                   grouped regions, and provides the inert scaffolding that
//                   makes the body read as a body in flags mode.
//   MUSCLE layer  — HoloMotion's 22 named muscles. Drives flags mode.
//
// Both are derived from `anatomy.ts`'s landmarks, which is what guarantees a
// muscle sits inside the region containing it. Previously the muscle layer was
// fitted to a DONATED atlas's bounding boxes, so that containment was a
// coincidence that had to be policed by tests — and for sartorius and iliopsoas
// it was simply false.
//
// Everything here is authored in FRONT space and placed into the back figure
// with `onBack()`, so no shape exists twice.
import type { BodyPart } from './types';
import {
  LM, type Pt, smooth, belly, sheet, mirrorPts, onBack, silhouette, armOutline,
} from './anatomy';

const L = LM;
const INK = '#9fb3c8';

// Reflect every coordinate in a finished path about the centre line.
const flip = (d: string): string => d.replace(
  /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,
  (_m, x: string, y: string) => `${Math.round((2 * L.cx - Number(x)) * 10) / 10},${y}`,
);

// The silhouette is torso + head + legs; each arm is its own overlapping shape
// (see anatomy.ts — one continuous contour self-intersects at the armpit).
const ARM_R = armOutline();
const ARM_L = flip(ARM_R);
export const FRONT_OUTLINE = `${silhouette()} ${ARM_R} ${ARM_L}`;
export const BACK_OUTLINE = onBack(FRONT_OUTLINE);

// A paired structure: authored once on the figure's right, mirrored to the left.
// Symmetry is therefore structural rather than something a guard has to verify.
function pair(build: (sign: 1) => string, buildPts?: (s: 1) => Pt[]): { left: string[]; right: string[] } {
  if (buildPts) {
    const pts = buildPts(1);
    return { right: [smooth(pts, 0.9)], left: [smooth(mirrorPts(pts), 0.9)] };
  }
  const right = build(1);
  return { right: [right], left: [flip(right)] };
}

// ANATOMICAL SIDE IS NOT SCREEN SIDE, AND THE DIFFERENCE FLIPS BETWEEN VIEWS.
//
// In an ANTERIOR view the subject faces you, so their RIGHT limb appears on the
// VIEWER'S LEFT. In a POSTERIOR view they face away and the sides agree.
//
// `pair()` authors on the +x side of the midline, which is always the viewer's
// right — correct for the back figure, inverted for the front. Caught by
// screenshotting the real page and reading the findings list against the
// drawing: "Pectoralis Major R" was painted on the subject's LEFT, and so was
// every other anterior flag.
//
// This is the §45/3i family — a wrong answer that looks like a right one. The
// figure was beautiful and told a clinician the wrong side, which is worse than
// drawing nothing. Pinned by figure.test.ts.
const anterior = (p: { left?: string[]; right?: string[]; common?: string[] }) => ({
  left: p.right, right: p.left, common: p.common,
});

const part = (slug: string, p: { left?: string[]; right?: string[]; common?: string[] }): BodyPart => ({
  slug, color: INK, path: p,
});

const back = (p: { left?: string[]; right?: string[]; common?: string[] }) => ({
  left: p.left?.map(onBack),
  right: p.right?.map(onBack),
  common: p.common?.map(onBack),
});

// ===========================================================================
// REGION LAYER
// ===========================================================================

const headShape = smooth([
  [L.cx, L.headTop + 6],
  [L.cx + L.headRx - 16, L.headTop + 20],
  [L.cx + L.headRx - 4, L.headTop + L.headRy - 20],
  [L.cx + L.headRx - 20, L.chin - 36],
  [L.cx, L.chin - 10],
  [L.cx - L.headRx + 20, L.chin - 36],
  [L.cx - L.headRx + 4, L.headTop + L.headRy - 20],
  [L.cx - L.headRx + 16, L.headTop + 20],
], 0.85);

// A HAIRLINE, not a widow's peak. The first version dipped to a single centre
// point, which renders as a sharp V — at report scale that reads as a FACE
// marking on a figure that deliberately has no face. Two shallow points either
// side of centre give a gentle hairline instead.
const hairShape = smooth([
  [L.cx, L.headTop + 1],
  [L.cx + L.headRx - 8, L.headTop + 26],
  [L.cx + L.headRx - 14, L.headTop + 58],
  [L.cx + 24, L.headTop + 52],
  [L.cx - 24, L.headTop + 52],
  [L.cx - L.headRx + 14, L.headTop + 58],
  [L.cx - L.headRx + 8, L.headTop + 26],
], 0.85);

const neckShape = smooth([
  [L.cx - L.neckHalf, L.neckTop + 20],
  [L.cx + L.neckHalf, L.neckTop + 20],
  [L.cx + L.neckHalf + 6, L.neckBot],
  [L.cx - L.neckHalf - 6, L.neckBot],
], 0.6);

// Front slope of the shoulder; the back view's trapezius is the big diamond.
const trapFront = pair(() => sheet([
  [L.cx + L.neckHalf - 4, L.neckBot - 34],
  [L.cx + 96, L.shoulderY - 14],
  [L.cx + L.shoulderHalf - 34, L.shoulderY + 16],
], [16, 20, 14]));

const trapBack = pair(() => smooth([
  [L.cx + 4, L.neckBot - 54],
  [L.cx + L.shoulderHalf - 40, L.shoulderY + 10],
  [L.cx + 96, L.chestTop + 92],
  [L.cx + 10, L.chestBot - 34],
], 0.8));

const deltoidShape = pair(() => smooth([
  [L.cx + 104, L.shoulderY - 8],
  [L.cx + L.shoulderHalf - 2, L.shoulderY + 22],
  [L.cx + L.shoulderHalf - 6, L.shoulderY + 92],
  [L.cx + 118, L.shoulderY + 126],
  [L.cx + 100, L.shoulderY + 52],
], 0.85));

const bicepsShape = pair(() => belly(
  [L.cx + L.shoulderJoint[0] - 10, L.shoulderJoint[1] + 72],
  [L.cx + L.elbow[0] - 16, L.elbow[1] - 24],
  34, { swell: 0.46 },
));

const tricepsShape = pair(() => belly(
  [L.cx + L.shoulderJoint[0] + 14, L.shoulderJoint[1] + 60],
  [L.cx + L.elbow[0] + 6, L.elbow[1] - 10],
  36, { swell: 0.42 },
));

const forearmShape = pair(() => belly(
  [L.cx + L.elbow[0] - 4, L.elbow[1] + 2],
  [L.cx + L.wrist[0] - 2, L.wrist[1] - 6],
  32, { swell: 0.3, insertWidth: 0.42 },
));

const handsShape = pair(() => smooth([
  [L.cx + L.wrist[0] - 14, L.wrist[1] + 4],
  [L.cx + L.wrist[0] + 18, L.wrist[1] + 10],
  [L.cx + L.fingerTip[0] + 4, L.fingerTip[1] - 24],
  [L.cx + L.fingerTip[0] - 8, L.fingerTip[1] - 2],
  [L.cx + L.wrist[0] - 18, L.fingerTip[1] - 44],
], 0.85));

const chestShape = pair(() => smooth([
  [L.cx + 10, L.chestTop + 16],
  [L.cx + 112, L.chestTop + 10],
  [L.cx + L.chestHalf - 22, L.chestTop + 64],
  [L.cx + 96, L.chestTop + 128],
  [L.cx + 12, L.chestTop + 136],
], 0.85));

const absShape = smooth([
  [L.cx - 62, L.chestBot - 4],
  [L.cx + 62, L.chestBot - 4],
  [L.cx + 56, L.waistY + 30],
  [L.cx + 30, L.crestY + 18],
  [L.cx - 30, L.crestY + 18],
  [L.cx - 56, L.waistY + 30],
], 0.75);

const obliquesShape = pair(() => smooth([
  [L.cx + 64, L.chestBot + 2],
  [L.cx + L.chestHalf - 18, L.chestBot - 24],
  [L.cx + L.waistHalf + 2, L.waistY + 4],
  [L.cx + L.hipHalf - 28, L.crestY + 22],
  [L.cx + 58, L.crestY + 14],
], 0.82));

const upperBackShape = pair(() => smooth([
  [L.cx + 8, L.chestTop + 30],
  [L.cx + L.chestHalf - 26, L.chestTop + 46],
  [L.cx + L.chestHalf - 34, L.chestBot - 40],
  [L.cx + 8, L.chestBot - 10],
], 0.8));

const lowerBackShape = smooth([
  [L.cx - 70, L.chestBot - 4],
  [L.cx + 70, L.chestBot - 4],
  [L.cx + 76, L.waistY + 24],
  [L.cx + 44, L.crestY + 16],
  [L.cx - 44, L.crestY + 16],
  [L.cx - 76, L.waistY + 24],
], 0.75);

const glutealShape = pair(() => smooth([
  [L.cx + 8, L.crestY + 10],
  [L.cx + L.hipHalf - 12, L.crestY + 26],
  [L.cx + L.hipHalf - 6, L.hipY + 48],
  [L.cx + 70, L.crotchY + 20],
  [L.cx + 8, L.crotchY + 8],
], 0.85));

const adductorsShape = pair(() => belly(
  [L.cx + 22, L.crotchY - 6],
  [L.cx + 40, L.kneeY - 96],
  44, { swell: 0.34 },
));

const quadricepsShape = pair(() => smooth([
  [L.cx + 16, L.crotchY + 6],
  [L.cx + L.thighHalfTop + 2, L.crotchY + 30],
  [L.cx + L.kneeHalf + 20, L.kneeY - 150],
  [L.cx + L.kneeHalf + 2, L.kneeY - 36],
  [L.cx + 20, L.kneeY - 40],
], 0.85));

const hamstringShape = pair(() => smooth([
  [L.cx + 18, L.crotchY + 14],
  [L.cx + L.thighHalfTop - 4, L.crotchY + 36],
  [L.cx + L.kneeHalf + 16, L.kneeY - 140],
  [L.cx + L.kneeHalf - 2, L.kneeY - 44],
  [L.cx + 22, L.kneeY - 48],
], 0.85));

const kneesShape = pair(() => smooth([
  [L.cx + 18, L.kneeY - 34],
  [L.cx + L.kneeHalf + 4, L.kneeY - 30],
  [L.cx + L.kneeHalf, L.kneeY + 32],
  [L.cx + 20, L.kneeY + 36],
], 0.8));

const tibialisShape = pair(() => belly(
  [L.cx + 26, L.kneeY + 46],
  [L.cx + L.ankleHalf + 2, L.ankleY - 30],
  22, { swell: 0.34 },
));

const calvesShape = pair(() => belly(
  [L.cx + 40, L.kneeY + 40],
  [L.cx + L.ankleHalf + 6, L.ankleY - 40],
  38, { swell: 0.3 },
));

const anklesShape = pair(() => smooth([
  [L.cx + 12, L.ankleY - 26],
  [L.cx + L.ankleHalf + 8, L.ankleY - 24],
  [L.cx + L.ankleHalf + 6, L.ankleY + 16],
  [L.cx + 14, L.ankleY + 18],
], 0.8));

const feetShape = pair(() => smooth([
  [L.cx + 8, L.ankleY + 10],
  [L.cx + L.ankleHalf + 10, L.ankleY + 8],
  [L.cx + L.ankleHalf + 30, L.footY - 14],
  [L.cx + L.ankleHalf + 28, L.footY - 2],
  [L.cx + 6, L.footY],
], 0.75));

// THE FRONT OF THE PELVIS IS A REGION TOO. Subitem mode maps "Pelvis" to the
// `adductors` + `gluteal` slugs, and both of those sit below the crotch or on
// the back — so selecting Pelvis lit almost nothing on the anterior view, which
// is the half a clinician is looking at. The iliac crest and lateral hip ARE
// visible from the front, so the region is drawn there under the same slug.
const hipFrontShape = pair(() => smooth([
  [L.cx + 10, L.crestY - 8],
  [L.cx + L.hipHalf - 18, L.crestY - 2],
  [L.cx + L.hipHalf - 8, L.hipY + 26],
  [L.cx + 58, L.crotchY + 6],
  [L.cx + 10, L.crotchY - 4],
], 0.85));

// ===========================================================================
// MUSCLE LAYER — HoloMotion's 22
// ===========================================================================
// Each is placed by ORIGIN and INSERTION, the two points anatomy defines a
// muscle by. Those anchors are why this is a redraw and not a reshape: a shape
// fitted to a donated bounding box has no origin and no insertion, so it cannot
// be wrong in a way anybody could point at — or right.

// --- neck -----------------------------------------------------------------
// Mastoid process → sternal notch. The one neck muscle you can see on a person.
const sternocleidomastoid = pair(() => belly(
  [L.cx + 40, L.chin - 28],
  [L.cx + 12, L.neckBot - 4],
  13, { swell: 0.5, originWidth: 0.3, insertWidth: 0.3 },
));

// Deep anterior neck, in front of the cervical spine. Not visible on a surface
// atlas at all, which is exactly why the old file could only approximate it.
const rectusCapitisAnterior = pair(() => belly(
  [L.cx + 17, L.neckTop + 24],
  [L.cx + 11, L.neckTop + 70],
  9, { swell: 0.5, originWidth: 0.4, insertWidth: 0.4 },
));

// --- shoulder girdle ------------------------------------------------------
// Occiput + nuchal ligament → lateral clavicle and acromion. The UPPER fibres
// only: HoloMotion names the bundle, not the whole trapezius.
const upperTrapeziusFront = pair(() => sheet([
  [L.cx + L.neckHalf - 8, L.neckBot - 44],
  [L.cx + 92, L.shoulderY - 16],
  [L.cx + L.shoulderHalf - 44, L.shoulderY + 14],
], [13, 17, 12]));

const upperTrapeziusBack = pair(() => sheet([
  [L.cx + 6, L.neckTop + 58],
  [L.cx + 54, L.neckBot + 2],
  [L.cx + 112, L.shoulderY + 4],
  [L.cx + L.shoulderHalf - 40, L.shoulderY + 30],
], [18, 24, 22, 14]));

// Acromion/lateral clavicle → deltoid tuberosity. The lateral head; HoloMotion
// also prints "Middle Deltoid", which is the same structure (see ALIASES).
const lateralDeltoid = pair(() => belly(
  [L.cx + L.shoulderHalf - 24, L.shoulderY + 6],
  [L.cx + L.shoulderJoint[0] + 4, L.shoulderJoint[1] + 108],
  30, { swell: 0.4, originWidth: 0.55 },
));

// Spine of scapula → deltoid tuberosity. Posterior head, back view only.
const posteriorDeltoid = pair(() => belly(
  [L.cx + 112, L.shoulderY + 24],
  [L.cx + L.shoulderJoint[0] + 10, L.shoulderJoint[1] + 104],
  28, { swell: 0.4, originWidth: 0.6, bulge: 7 },
));

// --- trunk, anterior ------------------------------------------------------
// Sternum + clavicle → humerus. Drawn as the fan it is, converging laterally.
// A FAN, not a slab: broad along the sternum and clavicle, converging to a
// narrow tendon at the humerus. Drawn as a slab first and it read as a plate
// stuck on the chest — which is the exact complaint that started this redraw.
const pectoralisMajor = pair(() => smooth([
  [L.cx + 10, L.chestTop + 8],
  [L.cx + 76, L.chestTop - 2],
  [L.cx + 126, L.chestTop + 26],
  [L.cx + L.chestHalf - 18, L.chestTop + 58],
  [L.cx + 124, L.chestTop + 72],
  [L.cx + 86, L.chestTop + 112],
  [L.cx + 38, L.chestTop + 132],
  [L.cx + 10, L.chestTop + 128],
], 0.8));

// Pubic crest → 5th-7th costal cartilages. The strap down the midline; drawn as
// one belly per side, which is how the report shades it.
const rectusAbdominis = pair(() => belly(
  [L.cx + 30, L.chestBot - 10],
  [L.cx + 20, L.crestY + 14],
  26, { swell: 0.45, originWidth: 0.72, insertWidth: 0.6 },
));

// Lower ribs → iliac crest and linea alba, fibres running down-and-forward.
const externalOblique = pair(() => sheet([
  [L.cx + 76, L.chestBot - 26],
  [L.cx + L.waistHalf - 2, L.waistY - 6],
  [L.cx + 56, L.crestY + 18],
], [22, 24, 16]));

// Deep to the external, fibres running the other way — up-and-forward.
const internalOblique = pair(() => sheet([
  [L.cx + 58, L.crestY + 6],
  [L.cx + 84, L.waistY - 4],
  [L.cx + 74, L.chestBot + 10],
], [15, 17, 12]));

// T12-L5 and iliac fossa → lesser trochanter. Crosses the pelvic brim, which is
// why it CANNOT be an inset inside an abdominal box: its insertion is on the
// femur, below and behind the hip joint.
const iliopsoas = pair(() => belly(
  [L.cx + 34, L.waistY - 10],
  [L.cx + 50, L.crotchY + 24],
  17, { swell: 0.42, bulge: -9 },
));

// --- trunk, posterior -----------------------------------------------------
// Thoracolumbar fascia + lower thoracic spine → intertubercular groove. The
// big triangular sweep from the lower back up into the armpit.
const latissimusDorsi = pair(() => smooth([
  [L.cx + 8, L.waistY - 10],
  [L.cx + 86, L.waistY - 28],
  [L.cx + L.chestHalf - 10, L.chestBot - 46],
  [L.cx + L.chestHalf - 22, L.chestTop + 118],
  [L.cx + 126, L.chestTop + 72],
  [L.cx + 104, L.chestTop + 108],
  [L.cx + 70, L.chestBot - 52],
  [L.cx + 8, L.chestBot - 6],
], 0.8));

// --- hip ------------------------------------------------------------------
// Ilium + sacrum → gluteal tuberosity and IT band. The bulk of the buttock.
const gluteusMaximus = pair(() => smooth([
  [L.cx + 12, L.crestY + 18],
  [L.cx + L.hipHalf - 20, L.crestY + 34],
  [L.cx + L.hipHalf - 10, L.hipY + 44],
  [L.cx + 66, L.crotchY + 16],
  [L.cx + 12, L.crotchY + 2],
], 0.85));

// Outer ilium → greater trochanter. Sits ABOVE and LATERAL to maximus — the
// abductor, and the one the old single "gluteal" blob swallowed entirely.
const gluteusMedius = pair(() => belly(
  [L.cx + 58, L.crestY - 4],
  [L.cx + L.hipHalf - 16, L.hipY + 6],
  24, { swell: 0.5, originWidth: 0.6, insertWidth: 0.45 },
));

// Deep to medius, same fan, smaller. Shaded inside it on the report.
const gluteusMinimus = pair(() => belly(
  [L.cx + 68, L.crestY + 12],
  [L.cx + L.hipHalf - 26, L.hipY + 6],
  14, { swell: 0.5, originWidth: 0.6, insertWidth: 0.5 },
));

// Anterior sacrum → greater trochanter, passing through the sciatic notch.
// Nearly horizontal, which is what distinguishes it from everything around it.
const piriformis = pair(() => belly(
  [L.cx + 16, L.crestY + 44],
  [L.cx + L.hipHalf - 24, L.hipY - 4],
  13, { swell: 0.5, originWidth: 0.45, insertWidth: 0.45 },
));

// --- thigh ----------------------------------------------------------------
// ASIS → pes anserinus on the MEDIAL tibia. The longest muscle in the body, and
// the clearest example of why anchors matter: it crosses the whole thigh
// diagonally, so no shape fitted inside a quadriceps box can be it.
const sartorius = pair(() => sheet([
  [L.cx + L.hipHalf - 30, L.crestY + 24],
  [L.cx + 74, L.crotchY + 90],
  [L.cx + 44, L.kneeY - 150],
  [L.cx + 22, L.kneeY - 34],
], [11, 12, 11, 9]));

// AIIS → patella via the quadriceps tendon. Straight down the front.
const rectusFemoris = pair(() => belly(
  [L.cx + 50, L.crotchY + 2],
  [L.cx + 34, L.kneeY - 54],
  30, { swell: 0.42 },
));

// Greater trochanter / linea aspera → patella. The OUTER head.
const vastusLateralis = pair(() => belly(
  [L.cx + 80, L.crotchY + 26],
  [L.cx + 48, L.kneeY - 60],
  26, { swell: 0.44, bulge: 8 },
));

// Linea aspera → medial patella. The INNER head, and it bulges low — the
// teardrop just above the knee.
const vastusMedialis = pair(() => belly(
  [L.cx + 30, L.crotchY + 90],
  [L.cx + 26, L.kneeY - 40],
  24, { swell: 0.66, originWidth: 0.3 },
));

// Ischial tuberosity → head of fibula. Hamstring, back view.
const bicepsFemoris = pair(() => belly(
  [L.cx + 40, L.crotchY + 10],
  [L.cx + 52, L.kneeY - 52],
  28, { swell: 0.44, bulge: 6 },
));

// ===========================================================================
// Assembly
// ===========================================================================

export const INERT_FRONT: BodyPart[] = [
  part('head', { common: [headShape] }),
  part('hair', { common: [hairShape] }),
  part('triceps', anterior(tricepsShape)),
  part('forearm', anterior(forearmShape)),
  part('hands', anterior(handsShape)),
  part('knees', anterior(kneesShape)),
  part('tibialis', anterior(tibialisShape)),
  part('ankles', anterior(anklesShape)),
  part('feet', anterior(feetShape)),
  part('adductors', anterior(adductorsShape)),
];

export const INERT_BACK: BodyPart[] = [
  part('head', back({ common: [headShape] })),
  part('hair', back({ common: [hairShape] })),
  part('neck', back({ common: [neckShape] })),
  part('trapezius', back(trapBack)),
  part('triceps', back(tricepsShape)),
  part('forearm', back(forearmShape)),
  part('hands', back(handsShape)),
  part('calves', back(calvesShape)),
  part('ankles', back(anklesShape)),
  part('feet', back(feetShape)),
  part('adductors', back(adductorsShape)),
  part('lower-back', back({ common: [lowerBackShape] })),
];

// The REGION layer, used by subitem mode. Front and back carry the regions each
// view can actually show.
export const regionFront: BodyPart[] = [
  part('head', { common: [headShape] }),
  part('hair', { common: [hairShape] }),
  part('neck', { common: [neckShape] }),
  part('trapezius', anterior(trapFront)),
  part('deltoids', anterior(deltoidShape)),
  part('biceps', anterior(bicepsShape)),
  part('forearm', anterior(forearmShape)),
  part('hands', anterior(handsShape)),
  part('chest', anterior(chestShape)),
  part('abs', { common: [absShape] }),
  part('obliques', anterior(obliquesShape)),
  part('gluteal', anterior(hipFrontShape)),
  part('adductors', anterior(adductorsShape)),
  part('quadriceps', anterior(quadricepsShape)),
  part('knees', anterior(kneesShape)),
  part('tibialis', anterior(tibialisShape)),
  part('ankles', anterior(anklesShape)),
  part('feet', anterior(feetShape)),
];

export const regionBack: BodyPart[] = [
  part('head', back({ common: [headShape] })),
  part('hair', back({ common: [hairShape] })),
  part('neck', back({ common: [neckShape] })),
  part('trapezius', back(trapBack)),
  part('deltoids', back(deltoidShape)),
  part('triceps', back(tricepsShape)),
  part('forearm', back(forearmShape)),
  part('hands', back(handsShape)),
  part('upper-back', back(upperBackShape)),
  part('lower-back', back({ common: [lowerBackShape] })),
  part('gluteal', back(glutealShape)),
  part('hamstring', back(hamstringShape)),
  part('calves', back(calvesShape)),
  part('ankles', back(anklesShape)),
  part('feet', back(feetShape)),
];

// EVERY anterior part goes through `anterior()` — see the note on it. The
// subject's right is the viewer's left here, and getting it wrong paints a left
// finding on the right side of the body.
export const muscleFront: BodyPart[] = [
  part('Sternocleidomastoid', anterior(sternocleidomastoid)),
  part('Rectus Capitis Anterior', anterior(rectusCapitisAnterior)),
  part('Upper Trapezius', anterior(upperTrapeziusFront)),
  part('Lateral Deltoid', anterior(lateralDeltoid)),
  part('Pectoralis Major', anterior(pectoralisMajor)),
  part('Biceps Brachii', anterior(bicepsShape)),
  part('Rectus Abdominis', anterior(rectusAbdominis)),
  part('External Oblique', anterior(externalOblique)),
  part('Internal Oblique', anterior(internalOblique)),
  part('Iliopsoas', anterior(iliopsoas)),
  part('Sartorius', anterior(sartorius)),
  part('Rectus Femoris', anterior(rectusFemoris)),
  part('Vastus Lateralis', anterior(vastusLateralis)),
  part('Vastus Medialis', anterior(vastusMedialis)),
];

export const muscleBack: BodyPart[] = [
  part('Upper Trapezius', back(upperTrapeziusBack)),
  part('Posterior Deltoid', back(posteriorDeltoid)),
  part('Latissimus Dorsi', back(latissimusDorsi)),
  part('Gluteus Maximus', back(gluteusMaximus)),
  part('Gluteus Medius', back(gluteusMedius)),
  part('Gluteus Minimus', back(gluteusMinimus)),
  part('Piriformis', back(piriformis)),
  part('Biceps Femoris', back(bicepsFemoris)),
];

export const RENDERABLE_MUSCLES: Set<string> = new Set(
  [...muscleFront, ...muscleBack].map((p) => p.slug),
);

// The DEEP set: structures under another muscle, drawn with a dashed edge
// (.bodymap-deep) and hidden entirely when nothing is flagged. A surface muscle
// always draws because it IS the body; a deep one drawn unflagged would assert
// an interior the figure is otherwise not showing.
export const MARKER_MUSCLES: Set<string> = new Set([
  'Piriformis', 'Gluteus Minimus', 'Iliopsoas', 'Internal Oblique', 'Rectus Capitis Anterior',
]);

// HoloMotion names that are the same anatomical structure as a drawn muscle.
// Explicit so the collapse is visible in review rather than hidden in a lookup.
export const MUSCLE_ALIASES: Record<string, string> = {
  'Middle Deltoid': 'Lateral Deltoid',
};
