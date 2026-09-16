const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
// The band columns ARE the band vocabulary — same source as every label,
// comparison and legend (shared/facts.js).
const { BANDS, RESPONSE_OUTCOME_KEYS } = require('../shared/facts');

// Immutable snapshot of one committed HoloMotion import. The `athletes` table
// still holds the LATEST snapshot (dashboards read it — backward compatible);
// every import ALSO writes one Screening row here so we keep full history for
// progress-over-time and report-to-report deltas. Rows are never mutated except
// for the clinician-override fields (which auto-expire when a newer screening
// arrives, i.e. a new row is created without an override).
//
// See docs/fyp/FYP2_REDESIGN_SPEC.md §3.1 for the design rationale.
const Screening = sequelize.define('Screening', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  athleteId: { type: DataTypes.STRING(16), allowNull: false, field: 'athlete_id' },
  assessedAt: { type: DataTypes.DATE, allowNull: true, field: 'assessed_at' },
  importedBy: { type: DataTypes.STRING(120), allowNull: true, field: 'imported_by' },

  // Headline gauges (0–100 higher-better, except exerciseRisks lower-better).
  totalScore: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'total_score' },
  exerciseRisks: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'exercise_risks' },
  rom: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  stability: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
  symmetry: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

  // Eight Exercise Risk Evaluation indicators (lower-better). spinalDiscHerniation
  // is Lumbar Disc Herniation — STORED here but excluded from every risk display
  // per Dr Thung (ISN facilities don't support that assessment).
  neckInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'neck_injury_risk' },
  shoulderInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'shoulder_injury_risk' },
  scoliosis: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0 },
  spinalDiscHerniation: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'spinal_disc_herniation' },
  lumbarPelvisInjury: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'lumbar_pelvis_injury' },
  jointPain: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'joint_pain' },
  kneeInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'knee_injury_risk' },
  ankleInjuryRisk: { type: DataTypes.DECIMAL(5, 2), defaultValue: 0, field: 'ankle_injury_risk' },

  // Physical Fitness Subitem Score — 5 regions × {romL,romR,stabL,stabR,sym}.
  // Gives per-region left/right asymmetry, which feeds the indicator's
  // asymmetry penalty and the coach attention table.
  subitems: { type: DataTypes.JSON, allowNull: true },
  // HoloMotion's own Training Prescription, read from the report's TEXT layer
  // (utils/prescription.js) — no model, no tokens. Null on the compact layout,
  // which does not print one; null is therefore "this report had none", not
  // "we failed to read it", and the UI shows no panel rather than an empty one.
  prescription: { type: DataTypes.JSON, allowNull: true },
  // Page-1 summary comment, shown verbatim as "what the report said".
  summaryText: { type: DataTypes.TEXT, allowNull: true, field: 'summary_text' },
  // Snapshot of the muscle lists at import time (the live body map still reads
  // the muscle_flags table for the latest; this preserves history).
  muscleFlags: { type: DataTypes.JSON, allowNull: true, field: 'muscle_flags' },

  // Overall risk indicator, computed at commit once a cohort exists (nullable
  // until then). See spec §5.
  overallIndicator: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'overall_indicator' },
  overallBand: { type: DataTypes.ENUM(...BANDS), allowNull: true, field: 'overall_band' },
  escalations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  // Human-readable reasons the athlete escalated (JSON array of strings), so the
  // dashboards can explain WHY a band is amber/red — including which indicator
  // triggered the per-indicator escalation. Recomputed with the indicator.
  factors: { type: DataTypes.JSON, allowNull: true },
  // The other half of the evidence — observations arguing AGAINST assessment.
  // Never a recommendation to skip one; the band stays the verdict.
  reasonsAgainst: { type: DataTypes.JSON, allowNull: true, field: 'reasons_against' },

  // The comparison behind the band, persisted rather than recomputed on read.
  //
  // Without them the dashboards have one abstract 0-100 number and no way to say
  // WHICH component drove it, or where the athlete sits among peers. Persisted
  // rather than derived on read for the reason every derived value here is: the
  // norms move when cohort membership changes, so a screening must carry the
  // comparison it was actually scored against.
  cohortZ: { type: DataTypes.DECIMAL(6, 3), allowNull: true, field: 'cohort_z' },
  cohortRank: { type: DataTypes.INTEGER, allowNull: true, field: 'cohort_rank' },
  cohortSize: { type: DataTypes.INTEGER, allowNull: true, field: 'cohort_size' },
  // Human label for the peer group, e.g. "Badminton · Male" — so the UI can name
  // who the athlete is being compared against without re-resolving the tier.
  cohortLabel: { type: DataTypes.STRING(160), allowNull: true, field: 'cohort_label' },
  // Per-component [{ key,label,value,mean,delta,z,lowerIsBetter }].
  cohortDeltas: { type: DataTypes.JSON, allowNull: true, field: 'cohort_deltas' },

  // WHICH RULER MEASURED THIS BAND, and when (2026-09-13, §96).
  //
  // `recomputeIndicators()` rescores only each athlete's LATEST screening, so an
  // older row keeps whatever band it was given the last time it happened to be
  // the latest. That is correct for the athlete's own record — a verdict formed
  // in August was formed in August — but it makes the ADMIN band-mix trend a
  // comparison across rulers rather than across time, and nothing said so.
  //
  // Measured on the live database before adding these: 2026 Q2 held 18 rows last
  // scored 2026-08-23 alongside 21 scored 2026-09-10, while Q3 was uniformly
  // 2026-09-10 — and the pinned norm version was created 2026-08-24, i.e.
  // BETWEEN them. The chart drew the difference as athlete change.
  //
  // `normVersionId` is the pinned CohortNormVersion in force at scoring time, or
  // NULL when norms were live/unpinned — and NULL is therefore not "missing", it
  // is "scored against an unversioned ruler", which is exactly the case that
  // cannot be proven comparable. `scoredAt` disambiguates two different
  // unpinned epochs, which would otherwise both read NULL.
  //
  // Both stay NULL on rows written before this existed. A period containing them
  // is reported as UNKNOWN rather than assumed comparable.
  normVersionId: { type: DataTypes.INTEGER, allowNull: true, field: 'norm_version_id' },
  scoredAt: { type: DataTypes.DATE, allowNull: true, field: 'scored_at' },

  // Clinician override (medical staff, after a real assessment). Auto-expires
  // when a newer Screening row is imported.
  overrideBand: { type: DataTypes.ENUM(...BANDS), allowNull: true, field: 'override_band' },
  overrideNote: { type: DataTypes.TEXT, allowNull: true, field: 'override_note' },
  overrideBy: { type: DataTypes.STRING(120), allowNull: true, field: 'override_by' },
  overrideAt: { type: DataTypes.DATE, allowNull: true, field: 'override_at' },

  // ── What a clinician DID about the escalation (§103) ────────────────────
  //
  // Deliberately shaped like the override block above, because it is the same
  // kind of thing: a clinician's act, attributed and timed, held on the row it
  // is about. What differs is what it MEANS. An override says "the band is
  // wrong"; a response says "the band is right and here is what I did". Before
  // this, agreeing with a red band and acting on it left no institutional
  // record at all — only disagreeing did.
  //
  // NOT a "mark reviewed" tick. That existed as `reviewed:<userId>` in
  // settings — a private per-reader bookmark, deliberately unaudited — and was
  // REMOVED in §107 precisely because it let a queue be cleared without a
  // record ever being opened. This is the institution's record instead, and
  // every write of it is an `escalation.response` audit row.
  //
  // These four hold the LATEST response; the audit log holds the history. Same
  // division as the override, and the reason a second response overwriting the
  // first loses nothing.
  //
  // An ENUM rather than a free string: Programme Activity counts these, and a
  // countable field whose values are whatever somebody typed is not countable.
  // The list is generated from shared/facts.js so the column, the route's
  // validation and the picker on screen cannot drift apart.
  responseOutcome: {
    type: DataTypes.ENUM(...RESPONSE_OUTCOME_KEYS),
    allowNull: true,
    field: 'response_outcome',
  },
  responseNote: { type: DataTypes.TEXT, allowNull: true, field: 'response_note' },
  responseBy: { type: DataTypes.STRING(120), allowNull: true, field: 'response_by' },
  responseAt: { type: DataTypes.DATE, allowNull: true, field: 'response_at' },
}, {
  tableName: 'screenings',
  underscored: true,
  indexes: [
    // UNIQUE, so a duplicate screening cannot exist even if two requests race.
    //
    // routes/upload.js checks for an existing row at the same assessedAt and
    // updates it, which handles the real case (two operators, minutes apart).
    // It cannot handle two commits landing in the same instant: the check and
    // the insert are separate statements, so both transactions can find nothing
    // and both insert. The engine closing that window is the only thing that
    // actually closes it.
    //
    // It matters because a duplicate is not a loud failure downstream — it is a
    // RETEST with a difference of zero on every score, which deflates the
    // typical error and can push the reliability engine over MIN_PAIRS into
    // claiming a derived dead band it has not earned (§45).
    //
    // NULL assessed_at is exempt, because MySQL treats NULLs as distinct in a
    // unique index — which is the behaviour wanted: an undated screening cannot
    // be matched to anything, so it always inserts.
    { name: 'screenings_athlete_assessed_unique', unique: true, fields: ['athlete_id', 'assessed_at'] },
  ],
});

module.exports = Screening;
