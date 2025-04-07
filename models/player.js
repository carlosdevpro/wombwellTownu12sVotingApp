const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  position: { type: String, enum: ['GK', 'DEF', 'MID', 'ST'], required: true },
  votes: { type: Number, default: 0 }, // counts total MOTM votes
  goals: {
    type: Number,
    default: 0,
  },
  assists: {
    type: Number,
    default: 0,
  },
  motmWins: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model('Player', playerSchema);
