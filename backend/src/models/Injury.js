const mongoose = require('mongoose');

const injurySchema = new mongoose.Schema({
  athleteId: { type: String, required: true, ref: 'Athlete' },
  athleteName: { type: String },
  sport: { type: String },
  gender: { type: String },
  program: { type: String },
  athleteAge: { type: Number }, // denormalised for age-group filter on analytics

  bodyPart: {
    type: String,
    enum: ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'],
    required: true,
  },
  side: { type: String, enum: ['Left', 'Right', 'Both', 'N/A'], default: 'N/A' },
  injuryType: {
    type: String,
    enum: ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'],
    required: true,
  },
  severity: { type: String, enum: ['Minor', 'Moderate', 'Severe'], required: true },
  mechanism: { type: String, enum: ['Contact', 'Non-contact', 'Overuse', 'Recurrent'] },
  date: { type: Date, required: true },
  recoveryStatus: { type: String, enum: ['Recovering', 'Recovered', 'Chronic'], default: 'Recovering' },
  source: { type: String, enum: ['Medical Log', 'Athlete Self-Report'], default: 'Medical Log' },
  loggedBy: { type: String },
  notes: { type: String },
}, { timestamps: true });

injurySchema.index({ athleteId: 1 });
injurySchema.index({ date: -1 });
injurySchema.index({ sport: 1, program: 1 });
injurySchema.index({ bodyPart: 1 });

module.exports = mongoose.model('Injury', injurySchema);
