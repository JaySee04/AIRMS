#!/usr/bin/env node
/**
 * BODY MAP PROTOTYPE — proposed muscle geometry, beside what ships today.
 *
 *   npm run bodymap:prototype                      # all overrides, opens the sheet
 *   npm run bodymap:prototype -- --muscle "Sartorius"
 *   npm run bodymap:prototype -- --no-open
 *
 * NOTHING HERE IS WIRED INTO THE APP. The shipped figure is
 * frontend/src/components/dashboard/bodymap-data/muscles.ts and this script does
 * not modify it. It loads the real figure, swaps in proposed shapes, and renders
 * CURRENT and PROPOSED side by side so the difference can be judged by looking.
 *
 * WHY A PROTOTYPE AND NOT A BRANCH OF THE REAL FILE (JC, 2026-10-11: "Let us
 * make a prototype on the side before we deploy anything"). §144 rebuilt the
 * figure — ~900 lines, 25 tests, three doc sections — committed and deployed it,
 * and it was reverted on sight (§152). The loop was the fault: work was finished
 * before anyone saw a picture. So the picture comes first and the geometry stays
 * out of the app until it is accepted.
 *
 * THE GEOMETRY COMES FROM muscles.ts. `unionBox`, `at` and `strap` are imported
 * from the real module rather than reimplemented here, so a proposal is measured
 * against the figure exactly as the figure measures itself. The first version
 * did reimplement the bounding box and got it wrong — two definitions of a shape
 * primitive is how a figure drifts from itself, and it drifted within an hour.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FE = path.join(__dirname, '..', '..', 'frontend');
// RELATIVE, and tsc runs with cwd: FE. An absolute path cannot be used here:
// this repository lives under "VSCode Projects Folder/AIRMS (JC FYP)", and with
// shell: true on Windows the spaces and parentheses split every argument — tsc
// then reports "Could not resolve the path '(JC'". bodymap-proof.js sidesteps
// it the same way.
const SRC = 'src/components/dashboard/bodymap-data';
const OUT = path.join(__dirname, 'samples', 'bodymap-prototype.html');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// ── the real figure, compiled ────────────────────────────────────────────────

function loadFigure() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airms-proto-'));
  execFileSync('npx', ['tsc', '--ignoreConfig',
    `${SRC}/bodyFront.ts`, `${SRC}/bodyBack.ts`, `${SRC}/muscles.ts`,
    `${SRC}/outlines.ts`, `${SRC}/types.ts`,
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: FE, stdio: 'inherit', shell: process.platform === 'win32' });
  /* eslint-disable import/no-dynamic-require, global-require */
  return {
    muscles: require(path.join(tmp, 'muscles.js')),
    outlines: require(path.join(tmp, 'outlines.js')),
    front: require(path.join(tmp, 'bodyFront.js')),
    back: require(path.join(tmp, 'bodyBack.js')),
  };
}

// ── geometry ─────────────────────────────────────────────────────
//
// THESE COME FROM muscles.ts, NOT FROM A COPY HERE. The first version of this
// script reimplemented the bounding box by pairing every number in the path
// string, which is wrong on arcs and on relative commands - it put the head box
// at x -25..419 in a 0..724 viewBox and threw the proposed shape off the body.
// muscles.ts has a real parser; `unionBox`, `at` and `strap` are exported from
// it so the prototype measures the figure exactly as the figure does.

function partPaths(parts, slug) {
  const p = parts.find((x) => x.slug === slug);
  if (!p) return [];
  return [...(p.path.common ?? []), ...(p.path.left ?? []), ...(p.path.right ?? [])];
}

function sidePaths(parts, slug, side) {
  const p = parts.find((x) => x.slug === slug);
  return p ? (p.path[side] ?? []) : [];
}

/**
 * Which way is MEDIAL, derived rather than assumed.
 *
 * Returns X(m): m = 1 at the body's midline, 0 at the far lateral edge of the
 * given box, mapped to the right x fraction for whichever side this is.
 *
 * WHY THIS EXISTS. I got the medial direction wrong three times in a row — the
 * pectoralis (sternum drawn at the centre of a half-chest), the internal
 * oblique (fan apex pointing at the flank) and the iliopsoas (both straps
 * splaying outward instead of converging). Each time the fix was a different
 * ad-hoc comparison between two boxes, which is three chances to be wrong
 * rather than one. The midline is a property of the FIGURE, so take it from the
 * figure: muscles.ts derives it from the head, and so does this.
 */
function medialAxis(g, figure, box, which = 'front') {
  // FROM THE NECK, NOT THE HEAD, AND PER FIGURE.
  //
  // The head is a single `common` path and is not reliably centred: on the back
  // figure its box centres at x 1050 while the true midline — where the left and
  // right necks meet — is 1084. Using the head there would have mis-assigned
  // medial and lateral for every back muscle, which is the same error this
  // helper exists to stop, one figure over.
  //
  // The neck exists as separate left/right paths on both figures and straddles
  // the midline, so the gap between them IS the midline.
  const parts = figure[which];
  const nl = g.unionBox(sidePaths(parts, 'neck', 'left'));
  const nr = g.unionBox(sidePaths(parts, 'neck', 'right'));
  const midline = (nl.maxX + nr.minX) / 2;
  const boxCentre = (box.minX + box.maxX) / 2;
  const midlineAtMaxX = boxCentre < midline;
  return (m) => (midlineAtMaxX ? m : 1 - m);
}

/**
 * A closed shape through fractional points of `parent`, each segment optionally
 * bowed. `pts` is [[fx, fy, bow?], ...]; bow is a fraction of that segment's
 * length, positive bulging to the left of travel.
 *
 * Needed because `strap` makes bands and several of these muscles are SHEETS —
 * a pectoralis drawn as a band is the "plastered on" complaint again.
 */
function poly(at, parent, pts) {
  const P = pts.map(([fx, fy, bow]) => {
    const q = at(parent, fx, fy);
    return { ...q, bow: bow ?? 0 };
  });
  const n = (v) => v.toFixed(2);

  // SMOOTH, NOT FACETED. The first version drew straight lines between
  // vertices, so every sheet read as a cut-out polygon with visible corners —
  // which is the "plastered on" complaint in a different costume.
  //
  // Each VERTEX becomes a quadratic control point and each EDGE MIDPOINT
  // becomes an anchor. That is the standard way to round a closed polygon, and
  // it guarantees tangent continuity at every midpoint, so there are no corners
  // anywhere. A per-segment `bow` still offsets the control point to push a
  // border in or out.
  const mid = (a, b) => ({ cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2 });
  const start = mid(P[P.length - 1], P[0]);
  let d = `M ${n(start.cx)} ${n(start.cy)}`;
  for (let i = 0; i < P.length; i += 1) {
    const v = P[i];
    const nxt = P[(i + 1) % P.length];
    const end = mid(v, nxt);
    let { cx, cy } = v;
    if (v.bow) {
      const prev = P[(i - 1 + P.length) % P.length];
      const dx = nxt.cx - prev.cx, dy = nxt.cy - prev.cy;
      const len = Math.hypot(dx, dy) || 1;
      cx += (-dy / len) * len * v.bow;
      cy += (dx / len) * len * v.bow;
    }
    d += ` Q ${n(cx)} ${n(cy)} ${n(end.cx)} ${n(end.cy)}`;
  }
  return `${d} Z`;
}

// ── the proposals ────────────────────────────────────────────────────────────
//
// Each entry returns { left: [d], right: [d] } for one muscle, and carries the
// anatomy it is drawn from so a reviewer can check the claim and not just the
// picture.

const PROPOSALS = {
  'Sternocleidomastoid': {
    clip: { fig: 'front', slugs: ['neck','head'] },
    why: [
      'Origins: manubrium of the sternum AND the medial clavicle (two heads).',
      'Insertion: the mastoid process — BEHIND and BELOW the ear.',
      'So it crosses the neck DIAGONALLY, front-low to back-high. The shipped',
      'shape is the tallest sub-path of the asset\'s "neck" region: a short,',
      'near-vertical sliver in the hollow of the throat that never reaches the',
      'skull. The diagonal is the feature a clinician recognises.',
    ],
    build({ figure, g }) {
      // ANCHOR ON THE NECK, not on a head+neck union. The union is as wide as
      // the skull, so a fraction of it lands outside the throat entirely — which
      // is how the first attempt drew both straps off the side of the body.
      //
      // The neck box gives the width and the base; the head box contributes only
      // the mastoid HEIGHT, because the mastoid is a skull landmark the atlas
      // does not draw and can only be inferred.
      const neck = g.unionBox(partPaths(figure.front, 'neck'));
      const head = g.unionBox(partPaths(figure.front, 'head'));
      const headH = head.maxY - head.minY;

      // Measured on this asset: head 298..427 x, 125..259 y; neck 326..400 x,
      // 240..317 y. So the skull is WIDER than the neck, and the mastoid — the
      // superior attachment — sits lateral to the throat, roughly two-thirds
      // down the skull, just behind where an ear would be. The atlas draws no
      // ear, so that height is inferred; everything else is measured.
      //
      // The strap is expressed in a box spanning the HEAD's width (it needs the
      // lateral reach) and running from mastoid level down to the neck's base.
      const span = {
        minX: head.minX, maxX: head.maxX,
        // START AT THE JAWLINE, not two-thirds up the skull. The earlier
        // value put a quarter of the strap over the head, so at full size it
        // rode onto the jaw and read as a slab rather than a neck muscle.
        minY: head.maxY - headH * 0.10,
        maxY: neck.maxY,
      };

      const out = {};
      for (const side of ['left', 'right']) {
        // Simply "away from the midline" — anterior() handles which screen side
        // a subject-side lands on.
        const lateral = side === 'left' ? -1 : 1;
        const top = [0.5 + lateral * 0.30, 0.05];   // mastoid: lateral, high
        const bot = [0.5 + lateral * 0.10, 0.98];   // sternoclavicular: near midline, at the base
        // NO BOW. The first attempt bowed each side by 0.05 and the two straps
        // hooked inward and met at the throat, reading as a single W rather than
        // two muscles. A gentle bow is anatomically right but it needs the
        // normal direction checked per side; straight is honest and legible.
        // 0.26 of the neck width was 19 units on a 74-unit neck — half the throat.
        out[side] = [g.strap(span, top, bot, (neck.maxX - neck.minX) * 0.15, { taper: 0.62 })];
      }
      return out;
    },
  },

  'Pectoralis Major': {
    clip: { fig: 'front', slugs: ['chest'] },
    why: [
      'Origins: the MEDIAL HALF OF THE CLAVICLE, the sternum, and the costal',
      'cartilages of ribs 1-6. Insertion: a narrow tendon on the humerus.',
      'So the muscle is a FAN — broad all down the midline, converging to a',
      'point at the arm — and its inferior border sweeps UP and out to the',
      'axilla rather than running straight across.',
      '',
      'The shipped shape is the atlas\'s own "chest" sub-path: a rounded pad',
      'that stops short of the sternum, never reaches the clavicle, and does',
      'not converge toward the humerus. It reads as a pectoral PAD, not a fan.',
      '',
      'NOTE THE TRADE: this replaces TRACED artwork with constructed geometry,',
      'which is a bigger step than the two neck muscles. Judge it against the',
      'shipped shape beside it — a synthesized sheet that reads worse than the',
      'atlas\'s own is not an improvement.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const chest = g.unionBox(sidePaths(figure.front, 'chest', side));
        const delt = g.unionBox(sidePaths(figure.front, 'deltoids', side));
        if (!(chest.maxX > chest.minX)) { out[side] = []; continue; }

        // Widen the working box laterally to the deltoid, because the real
        // insertion is on the HUMERUS — outside the chest sub-path entirely,
        // which is one reason the atlas's pad cannot show the convergence.
        // THE CHEST BOX ALONE. Extending to the deltoid let the pec reach
        // x 213 on the left — deep into the shoulder — so pec and deltoid
        // merged into one red mass with no border between them. The humeral
        // tendon does pass under the deltoid in life; drawing it there costs
        // the separation a reader needs and buys nothing visible.
        const box = { ...chest, minY: Math.min(chest.minY, delt.minY + (delt.maxY - delt.minY) * 0.1) };

        // POINTS ARE WRITTEN ON A MEDIAL AXIS, not on the box's own x.
        //
        // These are PER-SIDE boxes, so the body's midline is an EDGE of the box,
        // never its centre. The first attempt wrote the sternal attachment at
        // fx 0.5 — the middle of one half-chest — and drew a sliver out at the
        // arm with the sternum bare. `m` is 1 at the midline and 0 at the
        // humerus, and which edge that is gets decided by measurement.
        const X = medialAxis(g, figure, chest);

        // Fractions read off the measured boxes rather than estimated. On the
        // left side that box is x 193..360, y 298..438, so e.g. the sternal
        // attachment at x 358 is m 0.99 and rib 6 at y 436 is fy 0.985.
        out[side] = [poly(g.at, box, [
          [X(0.98), 0.10],          // sternoclavicular — at the midline
          [X(0.32), 0.04, -0.05],   // out along the clavicle, which rises laterally
          [X(0.03), 0.26],          // humeral insertion — the narrow end
          [X(0.20), 0.44, 0.08],    // inferior border leaving the axilla
          [X(0.92), 0.97, 0.07],    // sweeping down and medially to rib 6
          [X(1.00), 0.88, 0.01],    // up the sternal edge
        ])];
      }
      return out;
    },
  },

  'Lateral Deltoid': {
    clip: { fig: 'front', slugs: ['deltoids','biceps'] },
    why: [
      'HoloMotion also calls this "Middle Deltoid"; they are the same head and',
      'share one shape via MUSCLE_ALIASES.',
      '',
      'Origin: the ACROMION — the bony point at the top and outside of the',
      'shoulder. Insertion: the DELTOID TUBEROSITY, roughly a third of the way',
      'down the lateral humerus. So it is an inverted triangle: broad across',
      'the shoulder, converging to a point ON THE ARM.',
      '',
      'The shipped shape is the atlas\'s "deltoids" sub-path, which is a rounded',
      'cap sitting on top of the shoulder and stopping where the arm begins. It',
      'never descends the humerus, so the convergence that makes a deltoid',
      'recognisable is missing.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const delt = g.unionBox(sidePaths(figure.front, 'deltoids', side));
        const bic = g.unionBox(sidePaths(figure.front, 'biceps', side));
        if (!(delt.maxX > delt.minX)) { out[side] = []; continue; }

        const armH = bic.maxY - bic.minY;
        const box = {
          minX: Math.min(delt.minX, bic.minX), maxX: Math.max(delt.maxX, bic.maxX),
          minY: delt.minY,
          // Down to the deltoid tuberosity: about a third along the upper arm.
          maxY: bic.minY + armH * 0.42,
        };

        // Medial axis again — 1 is toward the body, 0 is the outer edge of the
        // arm. Which x that is gets measured, never assumed (see the pec).
        const X = medialAxis(g, figure, delt);

        // Left side: deltoid x 193..278 y 298..398, biceps x 181..223 y 404..493,
        // so the working box is x 181..278, y 298..441. The acromion's outer
        // point is x 196 (m 0.15) and the tuberosity about x 210 (m 0.30) —
        // the previous 0.46 put the convergence halfway across the arm and
        // dragged the whole cap medially over the chest.
        out[side] = [poly(g.at, box, [
          // The -0.12 bow pushed the cap OUT past the shoulder outline, giving
          // square corners that overhung the body. Pulled in and flattened.
          [X(0.92), 0.08],          // acromion, medial end
          [X(0.22), 0.16, -0.05],   // over the cap to the outer acromion
          [X(0.14), 0.70, 0.03],    // down the lateral border of the arm
          [X(0.34), 0.97],          // deltoid tuberosity — the converging point
          [X(0.72), 0.52, -0.07],   // back up the medial border, bowed so the cap reads round
        ])];
      }
      return out;
    },
  },

  'Internal Oblique': {
    clip: { fig: 'front', slugs: ['obliques'] },
    why: [
      'Origin: the ILIAC CREST, the inguinal ligament and the thoracolumbar',
      'fascia — all LOW. Insertion: the lower three or four ribs, the linea',
      'alba and the pubis. So the fibres sweep UP and MEDIALLY, which is',
      'roughly PERPENDICULAR to the external oblique lying over it. That',
      'opposition is the whole reason a reader can tell the two apart.',
      '',
      'The shipped shape is a small wedge in the middle of the flank. Its own',
      'comment describes "a fan, broad at the iliac crest, narrowing as the',
      'fibres sweep up and medially" — but what draws reaches neither the crest',
      'nor the ribs, and is too small to show a direction at all.',
      '',
      'It is a deep muscle, so nothing traced is being replaced here.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const ob = g.unionBox(sidePaths(figure.front, 'obliques', side));
        const abs = g.unionBox(sidePaths(figure.front, 'abs', side));
        if (!(ob.maxX > ob.minX)) { out[side] = []; continue; }

        // Reach medially to the linea alba — the abs' inner edge — because the
        // aponeurosis inserts there. Measured: obliques x 255..309 on the left,
        // abs x 303..362, so the two already overlap at the linea semilunaris.
        // THE FLANK STRIP, not flank+abdomen. Unioning with the abs box made
        // this 107 units wide on a 54-unit flank, so it covered most of the
        // belly and read as a rectangle. It reaches the linea semilunaris,
        // which is the obliques' own medial edge, and stops there.
        const box = {
          minX: ob.minX, maxX: ob.maxX,
          minY: ob.minY + (ob.maxY - ob.minY) * 0.16, maxY: ob.maxY,
        };
        const X = medialAxis(g, figure, ob);

        // A fan: broad along the bottom (crest + inguinal ligament), narrowing
        // up and medially. Drawn anticlockwise from the lateral crest.
        out[side] = [poly(g.at, box, [
          [X(0.08), 0.86],          // iliac crest, lateral end
          [X(0.70), 0.97, 0.04],    // along the crest / inguinal ligament
          [X(0.92), 0.58, 0.05],    // up to the linea semilunaris
          [X(0.48), 0.08, 0.06],    // to the lower ribs — the superior attachment
          [X(0.10), 0.38, 0.05],    // back down the lateral border
        ])];
      }
      return out;
    },
  },

  'Iliopsoas': {
    clip: { fig: 'front', slugs: ['abs','obliques','adductors'] },
    why: [
      'Two muscles acting as one. PSOAS MAJOR runs from the LUMBAR SPINE',
      '(T12-L5) — level with the bottom of the ribcage — down alongside the',
      'vertebrae. ILIACUS fills the iliac fossa, the inner bowl of the pelvis.',
      'They converge, cross the pelvic brim, and insert together on the LESSER',
      'TROCHANTER of the femur, high on the inner thigh.',
      '',
      'So it is LONG: upper abdomen to inner thigh, running down-and-laterally',
      'from the spine, then turning down-and-medially to the femur.',
      '',
      'The shipped shape is a short sliver confined to the groin. Its own',
      'comment says "descends from the lumbar spine across the pelvic brim to',
      'the lesser trochanter" — the description is right and the shape covers',
      'perhaps the last fifth of it.',
      '',
      'Deep muscle: nothing traced is being replaced.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const abs = g.unionBox(sidePaths(figure.front, 'abs', side));
        const add = g.unionBox(sidePaths(figure.front, 'adductors', side));
        if (!(abs.maxX > abs.minX)) { out[side] = []; continue; }

        // Measured: abs x 303..362 y 426..716 (left), adductors x 274..351
        // y 647..899. The lumbar origin sits high in the abs box; the lesser
        // trochanter is high in the adductor box, which is why the muscle has
        // to span BOTH rather than live in either.
        const box = {
          minX: Math.min(abs.minX, add.minX), maxX: Math.max(abs.maxX, add.maxX),
          minY: abs.minY + (abs.maxY - abs.minY) * 0.06,   // L1, just under the ribs
          maxY: add.minY + (add.maxY - add.minY) * 0.26,   // lesser trochanter
        };
        // Medial is the side the abs sit on — measured, not assumed.
        const X = medialAxis(g, figure, abs);

        // A long tapering strap: broad beside the spine, narrowing to the
        // tendon at the trochanter. Drawn down the medial border first.
        out[side] = [poly(g.at, box, [
          [X(0.93), 0.02],          // T12/L1 beside the spine
          [X(0.74), 0.03],          // width of the psoas belly at its origin
          [X(0.40), 0.52, 0.05],    // out across the iliac fossa
          [X(0.46), 0.97],          // lesser trochanter — the tendon
          [X(0.58), 0.97],
          [X(0.62), 0.50, -0.04],   // back up the medial border
        ])];
      }
      return out;
    },
  },

  'Sartorius': {
    clip: { fig: 'front', slugs: ['quadriceps','adductors'] },
    why: [
      'The longest muscle in the body, and the one thing on this figure a',
      'reader might actually name. Origin: the ASIS — the bony point at the',
      'FRONT and OUTSIDE of the hip. Insertion: the pes anserinus on the',
      'MEDIAL tibia, just below the knee.',
      '',
      'So it CROSSES THE THIGH DIAGONALLY, lateral-high to medial-low. That',
      'crossing is the entire identity of the muscle.',
      '',
      'The shipped shape is a long bowed strap that stays LATERAL the whole way',
      'down. It has the length and the curve but never crosses, so it reads as',
      'a fourth quadriceps rather than as the sartorius.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const q = g.unionBox(sidePaths(figure.front, 'quadriceps', side));
        if (!(q.maxX > q.minX)) { out[side] = []; continue; }
        const X = medialAxis(g, figure, q);

        // Measured: quadriceps x 240..328, y 667..952 on the left. The ASIS is
        // the top LATERAL corner; the pes anserinus the bottom MEDIAL one.
        const w = q.maxX - q.minX;
        // MIRROR THE BOW. `bow` is perpendicular to the direction of travel,
        // and the two sides travel in opposite x-directions — so one fixed sign
        // bulges one leg laterally and the other medially, and the pair stops
        // being a mirror image. Visible as plain asymmetry at full size.
        const flip = X(1) === 0 ? -1 : 1;
        out[side] = [g.strap(q,
          [X(0.08), 0.02],   // ASIS — outer hip, high
          [X(0.88), 0.99],   // pes anserinus — inner knee, low
          w * 0.13,
          // Bowed so it sweeps rather than ruling straight across: the real
          // muscle leaves the ASIS heading down and medially and curves round
          // the thigh. Sign is checked by looking, not reasoned about.
          { bow: 0.07 * flip, taper: 0.5 })];
      }
      return out;
    },
  },

  'Rectus Femoris': {
    clip: { fig: 'front', slugs: ['quadriceps'] },
    why: [
      'Origin: the AIIS, just below the ASIS. Insertion: the tibial tuberosity',
      'via the patellar tendon. It is the CENTRAL quadriceps — a fusiform strip',
      'running straight down the middle of the anterior thigh, with vastus',
      'lateralis outside it and vastus medialis inside.',
      '',
      'The shipped shape is the atlas\'s largest quadriceps sub-path, which',
      'spans x 240..309 of a thigh that runs 240..328 — i.e. the whole anterior',
      'mass rather than the central strip. It is in the right place and far too',
      'wide, so it swallows the territory the vasti should read against.',
      '',
      'NOTE: an earlier review of this called the quads MISLABELLED. That was',
      'wrong and was withdrawn after measuring — vastus lateralis and medialis',
      'are both correctly placed. This is a width problem only.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const q = g.unionBox(sidePaths(figure.front, 'quadriceps', side));
        if (!(q.maxX > q.minX)) { out[side] = []; continue; }
        const X = medialAxis(g, figure, q);

        // A fusiform: narrow at both tendons, widest at mid-belly. Drawn down
        // the lateral border and back up the medial one.
        out[side] = [poly(g.at, q, [
          [X(0.44), 0.02],          // AIIS
          [X(0.30), 0.42, 0.04],    // lateral border, widest at mid-thigh
          [X(0.42), 0.94],          // patellar tendon
          [X(0.56), 0.94],
          [X(0.72), 0.42, 0.04],    // medial border
          [X(0.58), 0.02],
        ])];
      }
      return out;
    },
  },

  'Upper Trapezius': {
    clip: { fig: 'back', slugs: ['trapezius','deltoids','neck'] },
    why: [
      'Origin: the occipital bone and the nuchal ligament — the BACK OF THE',
      'SKULL and the cervical spine. Insertion: the lateral third of the',
      'CLAVICLE and the ACROMION.',
      '',
      'So the descending fibres run DOWN AND OUT, and the muscle forms the',
      'visible neck-to-shoulder SLOPE. That slope is the whole reason anyone',
      'recognises an upper trapezius, and it is the part a clinician palpates',
      'for a stiff neck.',
      '',
      'The shipped shape is the atlas\'s "trapezius" sub-path: a vertical',
      'triangle pointing DOWN the midline that never reaches the shoulder at',
      'all. It occupies the territory of the middle and lower trapezius while',
      'missing the upper one entirely.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const trap = g.unionBox(sidePaths(figure.back, 'trapezius', side));
        const delt = g.unionBox(sidePaths(figure.back, 'deltoids', side));
        const neck = g.unionBox(sidePaths(figure.back, 'neck', side));
        if (!(trap.maxX > trap.minX)) { out[side] = []; continue; }

        // Measured on the back figure (left): neck 1023..1078 / y 219..294,
        // trapezius 1003..1080 / y 297..473, deltoids 914..981 / y 309..397.
        // The acromion is the TOP of the deltoid; the occiput the top of the
        // neck. The muscle has to span from one to the other, which no single
        // existing sub-path does.
        const nl = g.unionBox(sidePaths(figure.back, 'neck', 'left'));
        const nr = g.unionBox(sidePaths(figure.back, 'neck', 'right'));
        const midline = (nl.maxX + nr.minX) / 2;
        // BOUNDED BY THE ACROMION, NOT THE ARM. Spanning to delt.minX/maxX
        // reached the outer edge of the shoulder, so the triangle overhung the
        // silhouette and met its opposite number as one cape across the back.
        // The acromion is the deltoid's MEDIAL quarter; that is the insertion.
        const deltW = delt.maxX - delt.minX;
        const acromion = delt.minX < midline ? delt.minX + deltW * 0.30 : delt.maxX - deltW * 0.30;
        const box = {
          minX: Math.min(acromion, midline), maxX: Math.max(acromion, midline),
          minY: neck.minY + (neck.maxY - neck.minY) * 0.30,
          maxY: trap.minY + (trap.maxY - trap.minY) * 0.62,
        };
        const X = medialAxis(g, figure, box, 'back');

        // Triangle: occiput at the midline, down the cervical spine to about
        // C7/T1, then out to the acromion and back up the sloping superior
        // border.
        out[side] = [poly(g.at, box, [
          [X(0.95), 0.04],          // occiput / nuchal line, at the midline
          [X(0.95), 0.80],          // down the spine to C7-T1
          [X(0.14), 0.88, 0.05],    // out to the acromion, inferior border
          [X(0.18), 0.62],          // the acromial attachment itself
          [X(0.58), 0.22, 0.12],    // back up the neck-shoulder SLOPE, concave
        ])];
      }
      return out;
    },
  },

  'Posterior Deltoid': {
    clip: { fig: 'back', slugs: ['deltoids','triceps'] },
    why: [
      'Origin: the SPINE OF THE SCAPULA — a bony ridge running medially across',
      'the shoulder blade. Insertion: the deltoid tuberosity of the humerus,',
      'the same point the lateral head reaches.',
      '',
      'So it is a triangle whose BASE is medial, along the scapular spine, and',
      'whose APEX is lateral and low, on the arm. The fibres run obliquely',
      'down and out — which is why pulling the arm backwards uses it.',
      '',
      'The shipped shape is the atlas\'s back "deltoids" sub-path: a rounded cap',
      'on the top outer corner of the shoulder. It does not reach the scapular',
      'spine medially and does not descend the arm, so it has neither of the',
      'muscle\'s two attachments — exactly the fault the front deltoid had.',
    ],
    build({ figure, g }) {
      const out = {};
      for (const side of ['left', 'right']) {
        const delt = g.unionBox(sidePaths(figure.back, 'deltoids', side));
        const tri = g.unionBox(sidePaths(figure.back, 'triceps', side));
        const ub = g.unionBox(sidePaths(figure.back, 'upper-back', side));
        if (!(delt.maxX > delt.minX)) { out[side] = []; continue; }

        // Measured (left, back): deltoids x 914..981 y 309..397, upper-back
        // x 955..1064 y 322..585. The scapular spine sits where those two meet,
        // so the origin reaches MEDIALLY into the upper-back box, and the
        // insertion reaches DOWN into the arm.
        const armBottom = tri.maxY > tri.minY
          ? tri.minY + (tri.maxY - tri.minY) * 0.34
          : delt.maxY + (delt.maxY - delt.minY) * 0.45;
        // STAY WITHIN THE SHOULDER AND ARM. Reaching 30% into the upper-back
        // box put the base over territory the atlas draws as back, and the
        // result collided with the trapezius above it. The scapular spine is
        // not drawn, so the medial limit is the deltoid's own medial edge.
        const box = {
          minX: Math.min(delt.minX, tri.minX || delt.minX),
          maxX: Math.max(delt.maxX, tri.maxX || delt.maxX),
          minY: delt.minY + (delt.maxY - delt.minY) * 0.12,
          maxY: armBottom,
        };
        const X = medialAxis(g, figure, box, 'back');

        out[side] = [poly(g.at, box, [
          [X(0.90), 0.10],          // medial edge, toward the scapular spine
          [X(0.48), 0.02],          // out along the spine to the acromion
          [X(0.20), 0.34],          // over the posterior shoulder
          [X(0.36), 0.92],          // deltoid tuberosity — the apex
          [X(0.62), 0.50, 0.07],    // back up the inferior border, bowed
        ])];
      }
      return out;
    },
  },

  'Biceps Femoris': {
    why: [
      'THE HAMSTRINGS ARE THREE MUSCLES AND HOLOMOTION NAMES ONE OF THEM.',
      'Biceps femoris is the LATERAL hamstring: it runs down the outer back of',
      'the thigh to the head of the FIBULA. Semitendinosus and semimembranosus',
      'occupy the medial half and insert on the medial tibia. Clinically these',
      'are different injuries with different mechanisms, which is why the',
      'distinction is worth drawing.',
      '',
      'The shipped code is `paths(back, hamstring, side)` — it assigns the WHOLE',
      'hamstring region, all four sub-paths, to biceps femoris. A lateral',
      'hamstring finding therefore lights the medial hamstrings too.',
      '',
      'The atlas already draws the four separately, so this is a SELECTION fix,',
      'not new geometry: take the two most lateral by measured distance from',
      'the midline. Measured (left, midline 1084): centres at 972, 999, 1033,',
      '1044 — so the lateral pair is unambiguous.',
      '',
      'The two medial sub-paths must still DRAW, or the thigh gains a hole.',
      'They are returned as inert here; in muscles.ts they would join',
      'INERT_BACK, the same treatment the figure already gives parts HoloMotion',
      'never reports on.',
    ],
    build({ figure, g }) {
      const nl = g.unionBox(sidePaths(figure.back, 'neck', 'left'));
      const nr = g.unionBox(sidePaths(figure.back, 'neck', 'right'));
      const midline = (nl.maxX + nr.minX) / 2;

      const out = { inert: [] };
      for (const side of ['left', 'right']) {
        const ds = sidePaths(figure.back, 'hamstring', side);
        if (!ds.length) { out[side] = []; continue; }
        const scored = ds.map((d) => {
          const b = g.unionBox([d]);
          return { d, dist: Math.abs((b.minX + b.maxX) / 2 - midline) };
        }).sort((a, b) => b.dist - a.dist);
        // Two lateral heads of biceps femoris; the rest are the medial pair.
        out[side] = scored.slice(0, 2).map((x) => x.d);
        out.inert.push(...scored.slice(2).map((x) => x.d));
      }
      return out;
    },
  },
};


let CLIP_SEQ = 0;

function clipPathsFor(spec, figure, name) {
  if (!spec.clip) return {};
  const parts = figure[spec.clip.fig];
  const ds = spec.clip.slugs.flatMap((slug) => partPaths(parts, slug));
  return ds.length ? { [name]: ds } : {};
}

// ── drawing ──────────────────────────────────────────────────────────────────

const FILLS = { lit: '#d0574a', none: 'var(--body)' };
const PART_STROKE = 0.55;

function svg(outline, parts, inert, litNames, viewBox, caption, clips = {}) {
  // CLIP EACH PROPOSAL TO THE REGION THE ATLAS ALREADY DREW.
  //
  // JC, 2026-10-11: "have the shape be within the initial borders." Every
  // overflow this prototype has produced — the deltoid's square corners past
  // the shoulder, the trapezius cape, the pectoralis reaching into the arm —
  // was a constructed shape escaping the territory its region occupies. Bounding
  // boxes cannot prevent that: a box is a rectangle and a body is not.
  //
  // An SVG clipPath is exact and costs nothing: the shape is authored freely and
  // the atlas's own outline decides where it stops. Whatever the geometry gets
  // wrong, it can no longer leave the body.
  // IDS MUST BE UNIQUE ACROSS THE WHOLE DOCUMENT, not within one panel.
  //
  // The first version keyed on the caption, so every "PROPOSED - front" panel
  // emitted clip-PROPOSEDfront-0. Eleven panels live in one HTML file, ids are
  // document-global, and the FIRST definition wins - so most proposals were
  // clipped to another muscle's region and several rendered as nothing at all.
  // An empty panel from a proposal that was built correctly, which is the worst
  // kind of wrong answer: it looks like the geometry failed.
  const clipDefs = Object.entries(clips).map(([name, ds]) => {
    CLIP_SEQ += 1;
    const id = `clip-${CLIP_SEQ}`;
    return { name, id, def: `<clipPath id="${id}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath>` };
  });
  const clipId = Object.fromEntries(clipDefs.map((c) => [c.name, c.id]));
  const inertSlugs = new Set(inert.map((p) => p.slug));
  const body = parts.map((p) => {
    const lit = litNames.has(p.slug.replace(/:(left|right)$/, '')) || litNames.has(p.slug);
    const ds = [...(p.path.common ?? []), ...(p.path.left ?? []), ...(p.path.right ?? [])];
    const cid = clipId[p.slug];
    const clip = cid ? ` clip-path="url(#${cid})"` : '';
    return ds.map((d) => `<path d="${d}"${clip} fill="${lit ? FILLS.lit : FILLS.none}" `
      + `stroke="#5b7c99" stroke-opacity="${PART_STROKE}" stroke-width="1.2"/>`).join('');
  }).join('');
  const inertPaths = inert.map((p) => [...(p.path.common ?? []), ...(p.path.left ?? []), ...(p.path.right ?? [])]
    .map((d) => `<path d="${d}" fill="var(--body)" stroke="#5b7c99" stroke-opacity="0.35" stroke-width="1"/>`).join('')).join('');
  return `<figure><figcaption>${caption}</figcaption>
    <svg viewBox="${viewBox}" width="430" style="--body:#ccd6e0">
      <defs>${clipDefs.map((c) => c.def).join('')}</defs>
      <path d="${outline}" fill="#eef2f6" stroke="#5b7c99" stroke-width="1.5"/>
      ${inertPaths}${body}
    </svg></figure>`;
}

function page(blocks) {
  return `<title>Body map prototype</title>
<style>
 body{margin:0;font:14px/1.5 system-ui,Segoe UI,Arial;background:#f4f7fa;color:#17293b}
 header{background:#17293b;color:#fff;padding:16px 24px}
 header h1{margin:0;font-size:18px} header p{margin:4px 0 0;opacity:.75;font-size:12.5px}
 .note{background:#fff8e1;border-bottom:1px solid #ecd9a0;padding:10px 24px;font-size:12.5px}
 section{margin:22px;background:#fff;border:1px solid #dde5ec;border-radius:10px;padding:18px 22px}
 h2{margin:0 0 4px;font-size:15px;letter-spacing:.4px}
 .why{font-size:12.5px;color:#4a5b6c;margin:0 0 14px;white-space:pre-line;border-left:3px solid #c9d6e2;padding-left:12px}
 .row{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start}
 figure{margin:0;text-align:center}
 figcaption{font-size:11.5px;font-weight:700;letter-spacing:.5px;color:#4a5b6c;margin-bottom:6px}
 svg{background:#fff;border:1px solid #e6ecf2;border-radius:8px}
</style>
<header><h1>Body map prototype — proposed geometry beside what ships</h1>
<p>Nothing here is wired into the app. Judge by looking; the anatomy each shape is drawn from is stated above it.</p></header>
<div class="note"><b>Red = the muscle under review</b>, drawn on both figures so the change is the only difference. Left pair is today's shipped figure; right pair is the proposal.</div>
${blocks}`;
}

// ── main ─────────────────────────────────────────────────────────────────────

function clone(parts) {
  return parts.map((p) => ({ ...p, path: { ...p.path } }));
}

function main() {
  const fig = loadFigure();
  const only = arg('--muscle', '');
  const names = only ? only.split(',').map((s) => s.trim()) : Object.keys(PROPOSALS);

  const unknown = names.filter((n) => !PROPOSALS[n]);
  if (unknown.length) {
    console.error(`no proposal for: ${unknown.join(', ')}`);
    console.error(`have: ${Object.keys(PROPOSALS).join(', ')}`);
    process.exit(2);
  }

  const figure = { front: fig.front.bodyFront ?? fig.front.default, back: fig.back.bodyBack ?? fig.back.default };
  const gHelpers = { unionBox: fig.muscles.unionBox, at: fig.muscles.at, strap: fig.muscles.strap };
  const blocks = [];

  for (const name of names) {
    const spec = PROPOSALS[name];
    const g = gHelpers;
    const built = spec.build({ figure, muscles: fig.muscles, g });
    // Some fixes REMOVE paths from a muscle rather than reshaping it. Those
    // paths still have to draw, or the figure gains a hole where a real body
    // part is — so a proposal can hand them back as `inert`.
    const extraInert = built.inert
      ? [{ slug: `${name}:unassigned`, color: '', path: { common: built.inert } }]
      : [];

    const curFront = clone(fig.muscles.muscleFront);
    const curBack = clone(fig.muscles.muscleBack);
    const newFront = clone(fig.muscles.muscleFront);
    const newBack = clone(fig.muscles.muscleBack);

    let found = false;
    for (const arr of [newFront, newBack]) {
      const part = arr.find((p) => p.slug === name);
      if (part) { part.path = { left: built.left, right: built.right }; found = true; }
    }
    if (!found) {
      console.error(`"${name}" is not a part on either figure — nothing to replace.`);
      process.exit(2);
    }

    const lit = new Set([name]);
    blocks.push(`<section><h2>${name}</h2><p class="why">${spec.why.join('\n')}</p><div class="row">
      ${svg(fig.outlines.FRONT_OUTLINE, curFront, fig.muscles.INERT_FRONT, lit, '0 0 724 1448', 'SHIPPED — front')}
      ${svg(fig.outlines.BACK_OUTLINE, curBack, fig.muscles.INERT_BACK, lit, '724 0 724 1448', 'SHIPPED — back')}
      ${svg(fig.outlines.FRONT_OUTLINE, newFront, [...fig.muscles.INERT_FRONT, ...extraInert], lit, '0 0 724 1448', 'PROPOSED — front', clipPathsFor(spec, figure, name))}
      ${svg(fig.outlines.BACK_OUTLINE, newBack, [...fig.muscles.INERT_BACK, ...extraInert], lit, '724 0 724 1448', 'PROPOSED — back', clipPathsFor(spec, figure, name))}
    </div></section>`);
    console.log(`  ${name.padEnd(26)} proposed`);
  }

  // ── the cumulative view ────────────────────────────────────────────────────
  //
  // Eleven separate panels show each change; none of them shows the FIGURE.
  // This applies every proposal at once so the whole thing can be judged as a
  // body rather than as a list of edits — which is the only way to see whether
  // the constructed shapes sit together or fight each other.
  if (names.length > 1) {
    const allFront = clone(fig.muscles.muscleFront);
    const allBack = clone(fig.muscles.muscleBack);
    const allInert = [];
    for (const n of names) {
      const b = PROPOSALS[n].build({ figure, muscles: fig.muscles, g: gHelpers });
      if (b.inert) allInert.push({ slug: `${n}:unassigned`, color: '', path: { common: b.inert } });
      for (const arr of [allFront, allBack]) {
        const part = arr.find((x) => x.slug === n);
        if (part) part.path = { left: b.left, right: b.right };
      }
    }
    const allClips = Object.assign({}, ...names.map((n) => clipPathsFor(PROPOSALS[n], figure, n)));
    const litAll = new Set(names);
    blocks.unshift(`<section><h2>All ${names.length} proposals together</h2>
      <p class="why">Every change applied at once, so the figure can be judged as a body rather than as a list of edits.</p><div class="row">
      ${svg(fig.outlines.FRONT_OUTLINE, clone(fig.muscles.muscleFront), fig.muscles.INERT_FRONT, litAll, '0 0 724 1448', 'SHIPPED — front')}
      ${svg(fig.outlines.BACK_OUTLINE, clone(fig.muscles.muscleBack), fig.muscles.INERT_BACK, litAll, '724 0 724 1448', 'SHIPPED — back')}
      ${svg(fig.outlines.FRONT_OUTLINE, allFront, [...fig.muscles.INERT_FRONT, ...allInert], litAll, '0 0 724 1448', 'PROPOSED — front', allClips)}
      ${svg(fig.outlines.BACK_OUTLINE, allBack, [...fig.muscles.INERT_BACK, ...allInert], litAll, '724 0 724 1448', 'PROPOSED — back', allClips)}
    </div></section>`);
  }

  fs.writeFileSync(OUT, page(blocks.join('')));
  console.log(`\n  written: ${OUT}\n`);

  if (!process.argv.includes('--no-open')) {
    try {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', OUT], { stdio: 'ignore' });
      else if (process.platform === 'darwin') execFileSync('open', [OUT], { stdio: 'ignore' });
      else execFileSync('xdg-open', [OUT], { stdio: 'ignore' });
    } catch { console.log('  (could not open a browser — open the path above)'); }
  }
}

main();
