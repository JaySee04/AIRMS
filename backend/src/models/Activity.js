const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  athleteId: { type: String, required: true, ref: 'Athlete' },
  date: { type: Date, required: true },
  type: {
    type: String,
    enum: ['Strength', 'Endurance', 'Speed', 'Skill', 'Match', 'Recovery'],
    required: true,
  },
  duration: { type: Number, required: true, min: 10, max: 240 }, // minutes
  intensity: { type: Number, required: true, min: 1, max: 10 }, // RPE scale
  load: { type: Number }, // computed: duration × intensity
  notes: { type: String },
}, { timestamps: true });

// Auto-compute load before saving
activitySchema.pre('save', function (next) {
  this.load = this.duration * this.intensity;
  next();
});

activitySchema.index({ athleteId: 1, date: -1 });

module.exports = mongoose.model('Activity', activitySchema);
