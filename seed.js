const mongoose = require('mongoose');
const Player = require('./models/player');

mongoose
  .connect(
    process.env.MONGO_URI ||
      'mongodb+srv://admin:player123@voting-cluster.ycajzdq.mongodb.net/votingApp?retryWrites=true&w=majority&appName=voting-cluster'
  )
  .then(() => console.log('✅ Connected to MongoDB Atlas!'))
  .catch((err) => console.error('❌ Connection error:', err));

const players = [
  { firstName: 'Adam', lastName: 'Broad', position: 'GK', shirtNumber: 1 },
  { firstName: 'Charlie', lastName: 'Heavey', position: 'DEF', shirtNumber: 5 },
  { firstName: 'Max', lastName: 'Ravenhill', position: 'DEF', shirtNumber: 99 },
  {
    firstName: 'Archie',
    lastName: 'Chappell',
    position: 'DEF',
    shirtNumber: 2,
  },
  { firstName: 'Oliver', lastName: 'Webb', position: 'DEF', shirtNumber: 3 },
  {
    firstName: 'Anthony',
    lastName: 'Chambers',
    position: 'MID',
    shirtNumber: 12,
  },
  { firstName: 'Lewis', lastName: 'Wood', position: 'MID', shirtNumber: 6 },
  {
    firstName: 'Charlie',
    lastName: 'Dickinson',
    position: 'MID',
    shirtNumber: 7,
  },
  {
    firstName: 'Kristian',
    lastName: 'Madura',
    position: 'MID',
    shirtNumber: 11,
  },
  {
    firstName: 'George',
    lastName: 'Johnson',
    position: 'MID',
    shirtNumber: 8,
  },
  { firstName: 'Aston', lastName: 'Adcock', position: 'MID', shirtNumber: 14 },
  { firstName: 'Taio', lastName: 'Anthony', position: 'MID', shirtNumber: 17 },
  { firstName: 'Mikey', lastName: 'Wilson', position: 'MID', shirtNumber: 10 },
  {
    firstName: 'Sebastian',
    lastName: 'Green',
    position: 'MID',
    shirtNumber: 9,
  },
  { firstName: 'Alex', lastName: 'Love', position: 'ST', shirtNumber: 24 },
  { firstName: 'Max', lastName: 'Longden', position: 'ST', shirtNumber: 15 },
];

const seedPlayers = async () => {
  console.log('🚀 Seeding/updating players without deleting...');
  for (const data of players) {
    const player = await Player.findOneAndUpdate(
      { firstName: data.firstName, lastName: data.lastName }, // match criteria
      data,
      { new: true, upsert: true }
    );
    console.log(`✅ Upserted: ${player.firstName} ${player.lastName}`);
  }

  const total = await Player.countDocuments();
  console.log(`📦 Total players in DB: ${total}`);
  mongoose.connection.close();
};

seedPlayers();
