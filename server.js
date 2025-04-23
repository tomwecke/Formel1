const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

const MONGO_URI = 'mongodb+srv://tomwecke:Biela33!@formel1.fev98qp.mongodb.net/?retryWrites=true&w=majority&appName=Formel1';
const PORT = process.env.PORT || 3000;

const fahrerListe = [ 'Verstappen', 'Leclerc', 'Hamilton', 'Norris', 'Russell', 'Perez',
  'Alonso', 'Sainz', 'Gasly', 'Ocon', 'Bottas', 'Zhou',
  'Piastri', 'Tsunoda', 'Ricciardo', 'Hülkenberg', 'Magnussen', 'Stroll', 'Albon', 'Sargeant'
];

app.use(bodyParser.json());
app.use(session({
  secret: 'f1geheim',
  resave: false,
  saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB verbunden'))
  .catch(err => console.error(err));

const userSchema = new mongoose.Schema({
  username: String,
  passwordHash: String,
  fahrer: [String]
});

const statusSchema = new mongoose.Schema({
  _id: String,
  aktuellerSpieler: String,
  reihenfolge: [String],
  index: Number
});

const User = mongoose.model('User', userSchema);
const Status = mongoose.model('Status', statusSchema);

async function initUsers() {
  const existing = await User.find();
  if (existing.length === 0) {
    const users = ['Tom', 'Hanno', 'Vincent', 'Martin'];
    for (let name of users) {
      const passwordHash = await bcrypt.hash('passwort', 10);
      await User.create({ username: name, passwordHash, fahrer: [] });
    }
    console.log('Spieler erstellt');
  }
  const status = await Status.findById('spielstatus');
  if (!status) {
    await Status.create({
      _id: 'spielstatus',
      aktuellerSpieler: 'Tom',
      reihenfolge: ['Tom', 'Hanno', 'Vincent', 'Martin'],
      index: 0
    });
    console.log('Spielstatus erstellt');
  }
}
initUsers();

async function getAllDrivers() {
  const users = await User.find();
  return users.flatMap(u => u.fahrer);
}

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(400).json({ error: 'Unbekannter Benutzer' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Falsches Passwort' });
  req.session.username = user.username;
  res.json({ message: 'Eingeloggt' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Ausgeloggt' });
  });
});

app.get('/me', async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const user = await User.findOne({ username: req.session.username });
  res.json({ username: user.username, fahrer: user.fahrer });
});

app.get('/status', async (req, res) => {
  const users = await User.find();
  const belegteFahrer = await getAllDrivers();
  const status = await Status.findById('spielstatus');
  res.json({
    spielstand: users.map(u => ({ name: u.username, fahrer: u.fahrer })),
    verbleibendeFahrer: fahrerListe.filter(f => !belegteFahrer.includes(f)),
    aktuellerSpieler: status.aktuellerSpieler
  });
});

app.post('/waehlen', async (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const { fahrerName } = req.body;
  const belegteFahrer = await getAllDrivers();
  const status = await Status.findById('spielstatus');
  if (req.session.username !== status.aktuellerSpieler) {
    return res.status(403).json({ error: 'Du bist nicht dran' });
  }
  if (belegteFahrer.includes(fahrerName)) {
    return res.status(400).json({ error: 'Fahrer bereits gewählt' });
  }
  const user = await User.findOne({ username: req.session.username });
  if (user.fahrer.length >= 5) {
    return res.status(400).json({ error: 'Bereits 5 Fahrer gewählt' });
  }
  user.fahrer.push(fahrerName);
  await user.save();

  const nextIndex = (status.index + 1) % status.reihenfolge.length;
  await Status.updateOne({ _id: 'spielstatus' }, {
    aktuellerSpieler: status.reihenfolge[nextIndex],
    index: nextIndex
  });

  res.json({ message: 'Fahrer gewählt', fahrer: user.fahrer });
});

app.post('/reset', async (req, res) => {
  await User.updateMany({}, { $set: { fahrer: [] } });
  await Status.updateOne({ _id: 'spielstatus' }, { $set: { aktuellerSpieler: 'Tom', index: 0 } });
  res.json({ message: 'Spiel zurückgesetzt' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
