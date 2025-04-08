const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  position: {
    type: String,
    enum: ['GK', 'DEF', 'MID', 'ST'],
    required: true,
  },
  shirtNumber: {
    type: Number,
    required: true,
  },
  votes: {
    type: Number,
    default: 0,
  },
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
