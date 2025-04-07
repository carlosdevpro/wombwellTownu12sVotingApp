const mongoose = require('mongoose');
const Player = require('./models/player');

mongoose
  .connect(
    'mongodb+srv://admin:MySecurePass123@voting-cluster.ycajzdq.mongodb.net/votingApp?retryWrites=true&w=majority&appName=voting-cluster'
  )
  .then(() => console.log('Connected to Atlas!'))
  .catch((err) => console.log('Connection error:', err));

const seedPlayers = async () => {
  await Player.deleteMany({}); // optional: clear existing

  const players = [
    { firstName: 'Adam', lastName: 'Broad', position: 'GK' },
    { firstName: 'Charlie', lastName: 'Heavey', position: 'DEF' },
    { firstName: 'Max', lastName: 'Ravenhill', position: 'DEF' },
    { firstName: 'Archie', lastName: 'Chappell', position: 'DEF' },
    { firstName: 'Oliver', lastName: 'Webb', position: 'DEF' },
    { firstName: 'Anthony', lastName: 'Chambers', position: 'MID' },
    { firstName: 'Lewis', lastName: 'Wood', position: 'MID' },
    { firstName: 'Charlie', lastName: 'Dickinson', position: 'MID' },
    { firstName: 'Kristian', lastName: 'Madura', position: 'MID' },
    { firstName: 'George', lastName: 'Johnson', position: 'MID' },
    { firstName: 'Taio', lastName: 'Anthony', position: 'MID' },
    { firstName: 'Mikey', lastName: 'Wilson', position: 'MID' },
    { firstName: 'Sebastian', lastName: 'Green', position: 'MID' },
    { firstName: 'Alex', lastName: 'Love', position: 'ST' },
    { firstName: 'Max', lastName: 'Longden', position: 'ST' },
  ];

  await Player.insertMany(players);
  console.log('Players seeded!');
  mongoose.connection.close();
};

seedPlayers();
