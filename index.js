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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use(flash());

// 🟢 Set res.locals + update isOnline & lastSeen
app.use(async (req, res, next) => {
  res.locals.messages = req.flash();
  res.locals.currentUser = null;

  if (req.session.user_id) {
    try {
      const user = await User.findById(req.session.user_id);
      if (user) {
        const now = new Date();
        user.lastSeen = now;
        user.isOnline = true;
        await user.save();

        res.locals.currentUser = user;
      }
    } catch (err) {
      console.error('❌ Failed to update user activity:', err);
    }
  }

  next();
});

// 🛡 Route protection
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

// 🌐 Homepage
app.get('/', async (req, res) => {
  let user = null;
  if (req.session.user_id) {
    user = await User.findById(req.session.user_id).populate('linkedPlayer');
  }
  res.render('home', { user });
});

// 📝 Registration pages
app.get('/register', (req, res) => res.render('register'));

app.get('/register/parent', async (req, res) => {
  const players = await Player.find();
  const users = await User.find({ isParent: true }).populate('linkedPlayer');

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

app.get('/register/player', async (req, res) => {
  const allPlayers = await Player.find().sort({ firstName: 1 });
  const registeredUsers = await User.find({ isPlayer: true }, 'linkedPlayer');
  const usedIds = registeredUsers.map((u) => u.linkedPlayer.toString());

  const availablePlayers = allPlayers.filter(
    (p) => !usedIds.includes(p._id.toString())
  );
  res.render('registerPlayer', { players: availablePlayers });
});

// ✅ Register routes
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
    req.flash('success', 'Parent registered!');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Email already in use or error occurred.');
    res.redirect('/register/parent');
  }
});

app.post('/register/player', async (req, res) => {
  const { email, password, linkedPlayer, shirtNumber } = req.body;
  const player = await Player.findById(linkedPlayer);

  if (!player || player.shirtNumber !== parseInt(shirtNumber)) {
    req.flash('error', 'Invalid player or shirt number.');
    return res.redirect('/register/player');
  }

  const existing = await User.findOne({ linkedPlayer, isPlayer: true });
  if (existing) {
    req.flash('error', 'Player already registered.');
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
  req.flash('success', 'Player account created!');
  res.redirect('/');
});

// 🛠 Admin dashboard
app.get('/admin', requireLogin, requireAdmin, async (req, res) => {
  const parents = await User.find({ isParent: true }).populate('linkedPlayer');
  const players = await User.find({ isPlayer: true }).populate('linkedPlayer');

  const now = new Date();
  const threshold = 2 * 60 * 1000;

  const withStatus = (users) =>
    users.map((u) => {
      const isOnline = u.lastSeen && now - u.lastSeen < threshold;
      return { ...u.toObject(), isOnline };
    });

  res.render('admin', {
    parents: withStatus(parents),
    players: withStatus(players),
  });
});

// ✅ Logout
app.post('/logout', async (req, res) => {
  const user = await User.findById(req.session.user_id);
  if (user) {
    user.isOnline = false;
    user.lastActive = new Date();
    await user.save();
  }
  req.session.user_id = null;
  req.flash('success', 'Logged out.');
  res.redirect('/login');
});

// ✅ Login
app.get('/login', (req, res) => res.render('login'));
app.get('/login/player', (req, res) => res.render('playerLogin'));

app.post('/login/player', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, isPlayer: true });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Invalid credentials.');
    return res.redirect('/login/player');
  }

  req.session.user_id = user._id;
  user.isOnline = true;
  user.lastSeen = new Date();
  await user.save();

  res.redirect('/');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findAndValidate(email, password);

  if (!user) {
    req.flash('error', 'Invalid credentials.');
    return res.redirect('/login');
  }

  req.session.user_id = user._id;
  user.isOnline = true;
  user.lastSeen = new Date();
  await user.save();

  res.redirect('/');
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
app.post('/logout', async (req, res) => {
  const user = await User.findById(req.session.user_id);
  if (user) {
    user.isOnline = false;
    user.lastActive = new Date();
    await user.save();
  }
  req.session.user_id = null;
  req.flash('success', 'Logged out successfully.');
  res.redirect('/login');
});

// Admin: Send SMS Vote Reminders
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
