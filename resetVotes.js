const mongoose = require('mongoose');
const Player = require('./models/player');
const User = require('./models/user');

mongoose
  .connect('mongodb://localhost:27017/votingApp')
  .then(() => console.log('MongoDB Connected'))
  .catch((err) => console.log(err));

const resetVotes = async () => {
  await Player.updateMany({}, { $set: { votes: 0 } });
  await User.updateMany({}, { $set: { hasVoted: false } });

  console.log('✅ All votes and user vote statuses reset!');
  mongoose.connection.close();
};

resetVotes();
