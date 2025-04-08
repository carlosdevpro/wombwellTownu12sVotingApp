require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const User = require('./models/user');
const Player = require('./models/player');
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const crypto = require('crypto');
const { sendPasswordReset } = require('./mailer');
const { sendVoteReminder } = require('./sms');

// Connect to MongoDB
console.log('Using MONGO_URI:', process.env.MONGO_URI);
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MONGO CONNECTION OPEN!'))
  .catch((err) => console.log('❌ MONGO CONNECTION ERROR:', err));

// Set up EJS and static views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

// Session setup for user login tracking
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Flash messages middleware
app.use(flash());

// Middleware to pass user and messages to all templates
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  res.locals.currentUser = req.session.user_id || null;
  next();
});

// Middleware for protecting routes
const requireLogin = (req, res, next) => {
  if (!req.session.user_id) return res.redirect('/login');
  next();
};

const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.session.user_id);
  if (!user || !user.isAdmin) {
    req.flash('error', 'Unauthorized access');
    return res.redirect('/');
  }
  next();
};

// Routes
app.get('/', async (req, res) => {
  let user = null;
  if (req.session.user_id) {
    user = await User.findById(req.session.user_id).populate('linkedPlayer');
  }
  res.render('home', { user });
});

// Main register chooser (parent or player)
app.get('/register', (req, res) => {
  res.render('register');
});

// Parent registration page
app.get('/register/parent', async (req, res) => {
  const players = await Player.find();
  const users = await User.find().populate('linkedPlayer');
  const playerCounts = {};
  users.forEach((user) => {
    const id = user.linkedPlayer?._id?.toString();
    if (id) playerCounts[id] = (playerCounts[id] || 0) + 1;
  });
  const availablePlayers = players.filter((p) => {
    const count = playerCounts[p._id.toString()] || 0;
    return count < 2;
  });
  res.render('registerParent', { players: availablePlayers });
});

// Player registration page
app.get('/register/player', async (req, res) => {
  try {
    const allPlayers = await Player.find().sort({ firstName: 1 });

    // Get all users who are players and extract their linkedPlayer IDs
    const registeredUsers = await User.find({ isPlayer: true }, 'linkedPlayer');
    const usedPlayerIds = registeredUsers.map((user) =>
      user.linkedPlayer.toString()
    );

    // Filter players to only include those NOT already registered
    const availablePlayers = allPlayers.filter(
      (p) => !usedPlayerIds.includes(p._id.toString())
    );

    res.render('registerPlayer', { players: availablePlayers });
  } catch (err) {
    console.error('❌ Error loading player registration:', err);
    req.flash('error', 'Could not load player list.');
    res.redirect('/');
  }
});

// POST route for parent registration
app.post('/register/parent', async (req, res) => {
  const { email, password, firstName, lastName, linkedPlayer, mobileNumber } =
    req.body;

  try {
    const user = new User({
      email,
      password,
      firstName,
      lastName,
      linkedPlayer,
      mobileNumber,
      isParent: true,
    });

    await user.save();
    req.session.user_id = user._id;
    req.flash('success', 'Parent account created successfully!');
    res.redirect('/');
  } catch (err) {
    if (err.code === 11000 && err.keyValue?.email) {
      // Mongo duplicate key error (email already exists)
      req.flash('error', 'That email address is already registered.');
    } else {
      console.error('❌ Parent registration error:', err);
      req.flash('error', 'Failed to register parent. Please try again.');
    }
    res.redirect('/register/parent');
  }
});

// POST route for player registration
app.post('/register/player', async (req, res) => {
  const { email, password, linkedPlayer, shirtNumber } = req.body;

  try {
    const player = await Player.findById(linkedPlayer);

    if (!player || player.shirtNumber !== parseInt(shirtNumber)) {
      req.flash('error', 'Invalid player or shirt number.');
      return res.redirect('/register/player');
    }

    // ✅ Only block registration if a PLAYER user already exists for this linked player
    const existingPlayerUser = await User.findOne({
      linkedPlayer,
      isPlayer: true,
    });
    if (existingPlayerUser) {
      req.flash('error', 'This player already has a player account.');
      return res.redirect('/register/player');
    }

    const user = new User({
      email,
      password,
      linkedPlayer,
      isPlayer: true,
      firstName: player.firstName,
      lastName: player.lastName,
    });

    await user.save();
    req.session.user_id = user._id;
    req.flash('success', 'Player account created successfully!');
    res.redirect('/');
  } catch (err) {
    console.error('❌ Error registering player:', err);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/register/player');
  }
});

// Admin dashboard
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  try {
    const parents = await User.find({ isParent: true }).populate(
      'linkedPlayer'
    );
    const players = await User.find({ isPlayer: true }).populate(
      'linkedPlayer'
    );
    res.render('admin', { parents, players });
  } catch (err) {
    console.error('❌ Admin dashboard error:', err);
    req.flash('error', 'Failed to load admin dashboard.');
    res.redirect('/');
  }
});

// Edit player stats
app.get('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  const players = await Player.find();
  res.render('adminStatsEdit', { players });
});

// 🔄 Reset all parent votes
app.post('/admin/reset-votes', requireLogin, requireAdmin, async (req, res) => {
  try {
    // Reset all parents' voting status
    await User.updateMany({ isParent: true }, { hasVoted: false });

    // Reset all players' vote counts
    await Player.updateMany({}, { votes: 0 });

    req.flash(
      'success',
      '✅ All parent votes and leaderboard results have been reset.'
    );
    res.redirect('/admin');
  } catch (err) {
    console.error('❌ Reset error:', err);
    req.flash('error', 'Something went wrong while resetting.');
    res.redirect('/admin');
  }
});

// Save edited player stats
app.post('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  const { goals = {}, assists = {}, motmWins = {} } = req.body;
  try {
    const updates = Object.keys(goals).map((playerId) => {
      return Player.findByIdAndUpdate(playerId, {
        goals: parseInt(goals[playerId]) || 0,
        assists: parseInt(assists[playerId]) || 0,
        motmWins: parseInt(motmWins[playerId]) || 0,
      });
    });
    await Promise.all(updates);
    req.flash('success', '✅ Player stats successfully updated!');
    res.redirect('/admin/stats-edit');
  } catch (err) {
    console.error('❌ Failed to update stats:', err);
    req.flash('error', 'Something went wrong while saving stats.');
    res.redirect('/admin/stats-edit');
  }
});

// Forgot password form
app.get('/forgot', (req, res) => {
  res.render('forgot');
});

// Password reset form
app.get('/reset/:token', async (req, res) => {
  const { token } = req.params;
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) {
    req.flash('error', 'Password reset link is invalid or has expired.');
    return res.redirect('/forgot');
  }
  res.render('reset', { token });
});

// Process forgot password
app.post('/forgot', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error', 'No account with that email.');
    return res.redirect('/forgot');
  }
  const token = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken = token;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();
  try {
    await sendPasswordReset(user.email, token);
    req.flash('success', 'Password reset link sent to your email.');
  } catch (err) {
    console.error('❌ EMAIL ERROR:', err);
    req.flash('error', 'Failed to send password reset email.');
  }
  res.redirect('/login');
});

// Reset password submission
app.post('/reset/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) {
    req.flash('error', 'Invalid or expired reset token.');
    return res.redirect('/forgot');
  }
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  req.session.user_id = user._id;
  req.flash('success', 'Password has been reset!');
  res.redirect('/');
});

// Login page and process
app.get('/login', (req, res) => res.render('login'));
// Player login page
app.get('/login/player', (req, res) => {
  res.render('playerLogin');
});
// Handle player login form
app.post('/login/player', async (req, res) => {
  const { email, password } = req.body;
  const player = await User.findOne({ email, isPlayer: true });

  if (!player) {
    req.flash('error', 'Player not found or not registered as a player.');
    return res.redirect('/login/player');
  }

  const validPassword = await bcrypt.compare(password, player.password);

  if (!validPassword) {
    req.flash('error', 'Invalid password.');
    return res.redirect('/login/player');
  }

  req.session.user_id = player._id;
  req.flash('success', 'Welcome, Player!');
  res.redirect('/'); // ✅ sends to home page now
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findAndValidate(email, password);

    if (!user) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/login');
    }

    req.session.user_id = user._id;

    // 👇 Remove isPlayer redirect — everyone goes to home
    res.redirect('/');
  } catch (err) {
    console.error('❌ Login error:', err);
    req.flash('error', 'Something went wrong.');
    res.redirect('/login');
  }
});

// Voting routes
app.get('/vote', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user_id);

  if (!user || user.isPlayer) {
    req.flash('error', 'Players cannot access the voting page.');
    return res.redirect('/');
  }

  const players = await Player.find();
  res.render('vote', { players, user });
});

app.post('/vote', requireLogin, async (req, res) => {
  const user = await User.findById(req.session.user_id);

  if (!user || user.isPlayer) {
    req.flash('error', 'Players are not allowed to vote.');
    return res.redirect('/');
  }

  if (user.hasVoted) {
    req.flash('error', 'You have already voted!');
    return res.redirect('/vote');
  }

  try {
    await Player.findByIdAndUpdate(req.body.playerId, { $inc: { votes: 1 } });
    user.hasVoted = true;
    await user.save();
    req.flash('success', '✅ Your vote has been submitted.');
  } catch (err) {
    console.error('❌ Vote submission error:', err);
    req.flash('error', 'Something went wrong. Please try again.');
  }

  res.redirect('/vote');
});

// Leaderboards
app.get('/leaderboard', async (req, res) => {
  const players = await Player.find().sort({ votes: -1 });
  res.render('leaderboard', { players });
});

app.get('/stats', requireLogin, async (req, res) => {
  const goals = await Player.find().sort({ goals: -1 });
  const assists = await Player.find().sort({ assists: -1 });
  const motmWins = await Player.find().sort({ motmWins: -1 });
  res.render('stats', { goals, assists, motmWins });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.user_id = null;
  req.flash('success', 'Logged out successfully.');
  res.redirect('/login');
});

app.post(
  '/admin/send-reminders',
  requireLogin,
  requireAdmin,
  async (req, res) => {
    try {
      const parents = await User.find({
        isParent: true,
        hasVoted: false,
      }).populate('linkedPlayer');

      const promises = parents.map((parent) => {
        if (!parent.mobileNumber || !parent.linkedPlayer) return null;
        return sendVoteReminder(
          parent.mobileNumber,
          parent.linkedPlayer.firstName
        );
      });

      await Promise.all(promises);
      req.flash(
        'success',
        '📤 SMS reminders sent to all parents who haven’t voted!'
      );
    } catch (err) {
      console.error('❌ Failed to send SMS reminders:', err);
      req.flash('error', 'Something went wrong while sending SMS.');
    }

    res.redirect('/admin');
  }
);

// Start server
app.listen(3000, () => {
  console.log('SERVING YOUR APP ON PORT 3000');
});
