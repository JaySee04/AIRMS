const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

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
  overallBand: { type: DataTypes.ENUM('green', 'amber', 'red'), allowNull: true, field: 'overall_band' },
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

  // Clinician override (medical staff, after a real assessment). Auto-expires
  // when a newer Screening row is imported.
  overrideBand: { type: DataTypes.ENUM('green', 'amber', 'red'), allowNull: true, field: 'override_band' },
  overrideNote: { type: DataTypes.TEXT, allowNull: true, field: 'override_note' },
  overrideBy: { type: DataTypes.STRING(120), allowNull: true, field: 'override_by' },
  overrideAt: { type: DataTypes.DATE, allowNull: true, field: 'override_at' },
}, {
  tableName: 'screenings',
  underscored: true,
  indexes: [
    { fields: ['athlete_id', 'assessed_at'] },
  ],
});

module.exports = Screening;
