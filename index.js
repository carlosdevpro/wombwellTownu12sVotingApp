const express = require('express');
const app = express();
const mongoose = require('mongoose');
const User = require('./models/user');
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const crypto = require('crypto');
const { sendPasswordReset } = require('./mailer');
const Player = require('./models/player');

mongoose
  .connect('mongodb://localhost:27017/votingApp')
  .then(() => console.log('MONGO CONNECTION OPEN!'))
  .catch((err) => console.log('MONGO CONNECTION ERROR:', err));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: 'notagoodsecret',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(flash());

// Global middleware for all views
app.use((req, res, next) => {
  res.locals.messages = req.flash();
  res.locals.currentUser = req.session.user_id || null;
  next();
});

const requireLogin = (req, res, next) => {
  if (!req.session.user_id) {
    return res.redirect('/login');
  }
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

// Home page
app.get('/', async (req, res) => {
  let user = null;
  if (req.session.user_id) {
    user = await User.findById(req.session.user_id).populate('linkedPlayer');
  }
  res.render('home', { user });
});

// Register page
app.get('/register', async (req, res) => {
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

  res.render('register', { players: availablePlayers });
});

app.get('/test', (req, res) => {
  res.render('test');
});

app.get('/forgot', (req, res) => {
  res.render('forgot');
});

app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const users = await User.find().populate('linkedPlayer');
  res.render('admin', { users });
});

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

app.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, linkedPlayer } = req.body;
  const user = new User({ email, password, firstName, lastName, linkedPlayer });
  await user.save();
  req.session.user_id = user._id;
  req.flash('success', 'Welcome! Your account has been created.');
  res.redirect('/');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const foundUser = await User.findAndValidate(email, password);
  if (foundUser) {
    req.session.user_id = foundUser._id;
    res.redirect('/');
  } else {
    req.flash('error', 'Invalid email or password');
    res.redirect('/login');
  }
});

app.get('/vote', requireLogin, async (req, res) => {
  const players = await Player.find({});
  const user = await User.findById(req.session.user_id);
  res.render('vote', { players, user });
});

app.get('/leaderboard', async (req, res) => {
  const players = await Player.find({}).sort({ votes: -1 });
  res.render('leaderboard', { players });
});

app.get('/stats', requireLogin, async (req, res) => {
  try {
    const goals = await Player.find({}).sort({ goals: -1 });
    const assists = await Player.find({}).sort({ assists: -1 });
    const motmWins = await Player.find({}).sort({ motmWins: -1 });
    res.render('stats', { goals, assists, motmWins });
  } catch (err) {
    console.error('❌ Error loading stats:', err);
    req.flash('error', 'Could not load player stats');
    res.redirect('/');
  }
});

app.get('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  const players = await Player.find();
  res.render('adminStatsEdit', { players });
});

app.post('/admin/stats-edit', requireLogin, requireAdmin, async (req, res) => {
  const { goals = {}, assists = {}, motmWins = {} } = req.body;

  try {
    // Loop over players submitted and update each one
    const updates = Object.keys(goals).map(async (playerId) => {
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

app.post('/logout', (req, res) => {
  req.session.user_id = null;
  req.flash('success', 'You have been logged out.');
  res.redirect('/login');
});

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
    console.log('✅ Email send attempted to:', user.email);
    req.flash('success', 'Password reset link has been sent to your email.');
  } catch (err) {
    console.error('❌ EMAIL ERROR:', err);
    req.flash('error', 'Something went wrong while sending the email.');
  }

  res.redirect('/login');
});

app.post('/reset/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    req.flash('error', 'Password reset link is invalid or has expired.');
    return res.redirect('/forgot');
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  req.session.user_id = user._id;
  req.flash('success', 'Your password has been reset!');
  res.redirect('/');
});

app.post('/vote', requireLogin, async (req, res) => {
  const { playerId } = req.body;
  const user = await User.findById(req.session.user_id);

  if (user.hasVoted) {
    req.flash('error', 'You have already voted!');
    return res.redirect('/vote');
  }

  try {
    await Player.findByIdAndUpdate(playerId, { $inc: { votes: 1 } });
    user.hasVoted = true;
    await user.save();
    req.flash('success', '✅ Your vote has been submitted.');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong. Please try again.');
  }

  res.redirect('/vote');
});

app.listen(3000, () => {
  console.log('SERVING YOUR APP ON PORT 3000');
});
