/*
 * Gap-fill demo activity data.
 *
 * For each athlete in the DB, walks the 8-week window ending today and
 * inserts an Activity for any day that:
 *   (a) the athlete has no existing activity on, AND
 *   (b) the per-sport training-day probability accepts.
 *
 * Never overwrites or deletes existing rows — pure additive fill. Safe to
 * re-run. Anchored to the current real-world date, not a hardcoded seed
 * date, so charts always look populated up to "this week" on demo day.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Athlete = require('../src/models/Athlete');
const Activity = require('../src/models/Activity');

const WINDOW_DAYS = 56; // 8 weeks

// Sport-specific profiles. trainingDays = probability that a given day in
// the window is a training day. types/intensity tuned so each sport reads
// differently in the chart and tooltip breakdown.
const SPORT_PROFILES = {
  Badminton:  { trainingDays: 0.70, weights: { Skill: 3, Speed: 2, Match: 2, Endurance: 1, Strength: 1, Recovery: 1 } },
  Football:   { trainingDays: 0.72, weights: { Match: 3, Endurance: 3, Speed: 2, Strength: 2, Recovery: 1, Skill: 1 } },
  Swimming:   { trainingDays: 0.78, weights: { Endurance: 4, Skill: 2, Speed: 2, Strength: 1, Recovery: 1, Match: 1 } },
  Athletics:  { trainingDays: 0.68, weights: { Speed: 3, Endurance: 3, Strength: 2, Recovery: 1, Skill: 1, Match: 1 } },
  Karate:     { trainingDays: 0.65, weights: { Match: 3, Speed: 2, Skill: 2, Strength: 2, Recovery: 1, Endurance: 1 } },
  Squash:     { trainingDays: 0.68, weights: { Match: 3, Skill: 2, Speed: 2, Endurance: 2, Strength: 1, Recovery: 1 } },
  Cycling:    { trainingDays: 0.75, weights: { Endurance: 4, Speed: 2, Strength: 2, Recovery: 1, Skill: 1, Match: 1 } },
  Boxing:     { trainingDays: 0.68, weights: { Match: 3, Speed: 2, Strength: 2, Skill: 2, Endurance: 1, Recovery: 1 } },
  Hockey:     { trainingDays: 0.70, weights: { Match: 3, Endurance: 2, Speed: 2, Skill: 2, Strength: 1, Recovery: 1 } },
  Taekwondo:  { trainingDays: 0.65, weights: { Match: 3, Speed: 2, Skill: 2, Strength: 2, Recovery: 1, Endurance: 1 } },
};
const DEFAULT_PROFILE = { trainingDays: 0.65, weights: { Strength: 2, Endurance: 2, Skill: 2, Speed: 1, Match: 1, Recovery: 1 } };

const INTENSITY_RANGE = {
  Recovery: [3, 5],
  Skill: [4, 6],
  Speed: [6, 8],
  Strength: [6, 9],
  Endurance: [5, 8],
  Match: [7, 10],
};
const DURATION_RANGE = {
  Recovery: [30, 45],
  Skill: [50, 80],
  Speed: [40, 70],
  Strength: [55, 90],
  Endurance: [60, 110],
  Match: [60, 100],
};

// Deterministic PRNG seeded per athlete so re-runs produce identical fills
// (no drift between runs, no duplicate inserts since gap-check guards us).
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(weights, rand) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

function intInRange([min, max], rand) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

// Derive a stable numeric seed from "ATH0001" → 1, etc.
function seedForAthleteId(athleteId) {
  const n = parseInt(String(athleteId).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n * 9973 + 17 : 42;
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const athletes = await Athlete.find({}, { athleteId: 1, name: 1, sport: 1 }).lean();
  console.log(`Found ${athletes.length} athletes`);

  let totalInserted = 0;
  const perAthleteSummary = [];

  for (const ath of athletes) {
    const profile = SPORT_PROFILES[ath.sport] ?? DEFAULT_PROFILE;
    const rand = mulberry32(seedForAthleteId(ath.athleteId));

    // Load existing activities in the window so we never duplicate a day.
    const windowStart = new Date(today);
    windowStart.setUTCDate(today.getUTCDate() - WINDOW_DAYS + 1);
    const existing = await Activity.find(
      { athleteId: ath.athleteId, date: { $gte: windowStart, $lte: today } },
      { date: 1 },
    ).lean();
    const usedDays = new Set(existing.map((a) => dayKey(new Date(a.date))));

    const toInsert = [];
    for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - offset);
      const key = dayKey(d);
      if (usedDays.has(key)) continue;
      if (rand() > profile.trainingDays) continue;

      const type = pickWeighted(profile.weights, rand);
      const duration = intInRange(DURATION_RANGE[type], rand);
      const intensity = intInRange(INTENSITY_RANGE[type], rand);
      toInsert.push({
        athleteId: ath.athleteId,
        date: d,
        type,
        duration,
        intensity,
        load: duration * intensity,
      });
    }

    if (toInsert.length > 0) {
      await Activity.insertMany(toInsert);
      totalInserted += toInsert.length;
    }
    perAthleteSummary.push({
      athleteId: ath.athleteId,
      name: ath.name,
      sport: ath.sport,
      existing: existing.length,
      inserted: toInsert.length,
    });
  }

  console.log('\n— Summary —');
  perAthleteSummary
    .sort((a, b) => a.athleteId.localeCompare(b.athleteId))
    .forEach((r) => {
      console.log(
        `  ${r.athleteId.padEnd(8)} ${r.name.padEnd(22)} ${r.sport.padEnd(12)} existing=${String(r.existing).padStart(2)}  inserted=${String(r.inserted).padStart(2)}`,
      );
    });
  console.log(`\nTotal inserted: ${totalInserted} activities across ${athletes.length} athletes`);

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
