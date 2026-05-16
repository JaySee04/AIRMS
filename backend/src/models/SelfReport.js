const mongoose = require('mongoose');

const selfReportSchema = new mongoose.Schema({
  athleteId: { type: String, required: true, ref: 'Athlete' },
  athleteName: { type: String },
  sport: { type: String },

  bodyPart: { type: String, required: true },
  side: { type: String, enum: ['Left', 'Right', 'Both', 'N/A'], default: 'N/A' },
  injuryType: { type: String },
  severity: { type: String, enum: ['Minor', 'Moderate', 'Severe'] },
  description: { type: String },

  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewNote: { type: String },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
}, { timestamps: true });

selfReportSchema.index({ athleteId: 1 });
selfReportSchema.index({ status: 1 });

module.exports = mongoose.model('SelfReport', selfReportSchema);
