const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  date: {
    type: Date,
    default: Date.now,
  },
  scorers: [
    {
      name: String,
      goals: Number,
      assist: String,
    },
  ],
});

module.exports = mongoose.model('Match', matchSchema);
