const mongoose = require('mongoose');
const User = require('./models/user');
require('dotenv').config();

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    const result = await User.deleteMany({ isPlayer: true });
    console.log(`🧼 Deleted ${result.deletedCount} player users`);

    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('❌ Error:', err);
  });
