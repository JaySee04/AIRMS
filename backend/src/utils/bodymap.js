// Body-figure geometry for the PDF reports — the backend counterpart of
// frontend/src/components/dashboard/BodyMap.tsx's "muscle hero" figure.
//
// bodymapData.json is a GENERATED asset (not hand-written): it's the frontend
// bodymap-data/*.ts source (path data adapted from react-muscle-highlighter,
// https://github.com/soroojshehryar/react-muscle-highlighter, MIT License,
// Copyright (c) 2024 Sorooj Shehryar — see MASTER_CLARIFICATIONS.md, this
// asset is a locked decision) converted to plain JSON so the backend can
// require() it without a TypeScript toolchain. The frontend .ts files remain
// the canonical source; regenerate this JSON only if that source ever
// changes (it shouldn't — it's locked).
//
// This module only does GEOMETRY/DATA (which library slug belongs to which
// HoloMotion subitem region, and the worst-of-ROM/Stability raw value per
// region-side). Colour is deliberately NOT decided here — screeningReports.js
// already has its own TIERS/tierOf() for the Physical Fitness Subitem Score
// table, and the figure reuses that exact palette so the two stay visually
// consistent within the same PDF section.
const data = require('./bodymapData.json');

const { bodyFront, bodyBack, frontOutline, backOutline } = data;

// Same partition as BodyMap.tsx's SUBITEM_REGION_SLUGS — kept in sync by
// hand (small, stable list); see that file for the reasoning. Only "head"
// and "hair" are left out — HoloMotion has no subitem for either.
const SUBITEM_REGION_SLUGS = {
  neck: ['neck'],
  shoulder: ['trapezius', 'deltoids', 'biceps', 'triceps', 'forearm', 'hands'],
  torso: ['chest', 'abs', 'obliques', 'upper-back', 'lower-back'],
  pelvis: ['adductors', 'gluteal'],
  lowerLimbs: ['quadriceps', 'hamstring', 'knees', 'tibialis', 'calves', 'ankles', 'feet'],
};
const SLUG_TO_REGION = Object.fromEntries(
  Object.entries(SUBITEM_REGION_SLUGS).flatMap(([region, slugs]) => slugs.map((slug) => [slug, region])),
);
const SCOPED_SLUGS = new Set(Object.keys(SLUG_TO_REGION));

const { toNum: num } = require('./num');

// Worst (lower-scoring) of ROM/Stability for one region-side — same rule as
// the website figure: a region can only carry one colour, so it's judged by
// whichever of its two readings is worse.
function worstValue(row, side) {
  if (!row) return null;
  const rom = num(side === 'L' ? row.romL : row.romR);
  const stab = num(side === 'L' ? row.stabL : row.stabR);
  const vals = [rom, stab].filter((v) => v !== null);
  if (!vals.length) return null;
  return Math.min(...vals);
}

// Map<'slug:L'|'slug:R', number> — every slug in a region shares that
// region's value (the data doesn't distinguish deltoids from biceps —
// "Shoulder & Upper Limbs" is one score).
function worstValueBySlug(subitems) {
  const out = new Map();
  if (!subitems) return out;
  Object.entries(SUBITEM_REGION_SLUGS).forEach(([region, slugs]) => {
    const row = subitems[region];
    ['L', 'R'].forEach((side) => {
      const v = worstValue(row, side);
      if (v === null) return;
      slugs.forEach((slug) => out.set(`${slug}:${side}`, v));
    });
  });
  return out;
}

module.exports = {
  bodyFront, bodyBack, frontOutline, backOutline,
  SUBITEM_REGION_SLUGS, SLUG_TO_REGION, SCOPED_SLUGS,
  worstValueBySlug,
};
