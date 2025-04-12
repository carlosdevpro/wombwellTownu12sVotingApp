const mongoose = require('mongoose');

const scorerSchema = new mongoose.Schema({
  name: String,
  goals: Number,
  assist: String, // ✅ This is what was missing
});

const cardSchema = new mongoose.Schema({
  name: String,
});

const matchSchema = new mongoose.Schema({
  homeTeam: String,
  awayTeam: String,
  homeScore: Number,
  awayScore: Number,
  scorers: [scorerSchema],
  yellowCards: [cardSchema],
  redCards: [cardSchema],
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Match', matchSchema);
