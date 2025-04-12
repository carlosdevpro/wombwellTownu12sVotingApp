const mongoose = require('mongoose');

const scorerSchema = new mongoose.Schema({
  name: String,
  assist: String, // ✅ Add this if it's not already there
});

const cardSchema = new mongoose.Schema({
  name: String,
});

const matchSchema = new mongoose.Schema({
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  firstHalfScorers: [scorerSchema],
  secondHalfScorers: [scorerSchema],
  yellowCards: [cardSchema],
  redCards: [cardSchema],
  matchType: {
    type: String,
    enum: ['League', 'Cup', 'Friendly'],
    required: true,
  },

  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Match', matchSchema);
