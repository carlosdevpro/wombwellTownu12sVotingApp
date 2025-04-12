const mongoose = require('mongoose');

const scorerSchema = new mongoose.Schema({
  name: String,
  goals: Number,
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
  yellowCards: [cardSchema], // ✅ New
  redCards: [cardSchema], // ✅ New
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Match', matchSchema);
