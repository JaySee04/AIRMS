const mongoose = require('mongoose');

// Sub-schema for muscle assessment entries (myodynamia / tension)
const muscleEntrySchema = new mongoose.Schema({
  muscle: { type: String, required: true },
  side: { type: String, enum: ['L', 'R', 'B'], required: true },
}, { _id: false });

const athleteSchema = new mongoose.Schema({
  athleteId: { type: String, required: true, unique: true }, // e.g. ATH0001
  name: { type: String, required: true, trim: true },
  age: { type: Number },
  gender: { type: String, enum: ['Male', 'Female'] },
  sex: { type: String, enum: ['M', 'F'] },
  weight: { type: Number }, // kg
  height: { type: Number }, // cm
  sport: { type: String, required: true },
  program: { type: String, enum: ['PODIUM', 'PELAPIS', 'OTHERS'], required: true },

  // Composite fitness scores (0–100 scale unless noted)
  overallActivityScore: { type: Number },
  injuryRiskIndex: { type: Number },   // 0–10 low risk, lower is better
  mobility: { type: Number },
  stability: { type: Number },
  symmetry: { type: Number },
  exerciseRiskScore: { type: Number },

  // 8 injury risk indicator values (lower = better)
  risks: {
    neckInjuryRisk: { type: Number, default: 0 },
    shoulderInjuryRisk: { type: Number, default: 0 },
    scoliosis: { type: Number, default: 0 },
    spinalDiscHerniation: { type: Number, default: 0 },
    lumbarPelvisInjury: { type: Number, default: 0 },
    jointPain: { type: Number, default: 0 },
    kneeInjuryRisk: { type: Number, default: 0 },
    ankleInjuryRisk: { type: Number, default: 0 },
  },

  // Muscle weakness flags (myodynamia)
  myodynamia: [muscleEntrySchema],

  // Muscle tension flags
  tension: [muscleEntrySchema],

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

athleteSchema.index({ sport: 1 });
athleteSchema.index({ program: 1 });
athleteSchema.index({ gender: 1 });

module.exports = mongoose.model('Athlete', athleteSchema);
