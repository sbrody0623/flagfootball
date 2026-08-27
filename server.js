const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: also serve from root in case public/ folder doesn't exist
const fs = require('fs');
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  app.use(express.static(__dirname));
}

// ============================================================
// DATABASE SETUP
// ============================================================
const db = new Database(path.join(__dirname, 'flagfootball.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_name TEXT NOT NULL,
    login_code TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    rules TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    number INTEGER NOT NULL,
    name TEXT NOT NULL,
    position TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    opponent TEXT NOT NULL,
    home_away TEXT NOT NULL DEFAULT 'home',
    field_length INTEGER NOT NULL DEFAULT 80,
    team_score INTEGER DEFAULT 0,
    opp_score INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    game_state TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
  );

  CREATE TABLE IF NOT EXISTS plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    play_number INTEGER NOT NULL,
    possession TEXT NOT NULL,
    play_type TEXT NOT NULL,
    result TEXT NOT NULL,
    players TEXT DEFAULT '{}',
    yards INTEGER DEFAULT 0,
    down_before INTEGER DEFAULT 1,
    ball_pos_before INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    team_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );
`);

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authenticate(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const session = db.prepare('SELECT team_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid session' });

  req.teamId = session.team_id;
  next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

// Register a new team
app.post('/api/register', (req, res) => {
  const { teamName, loginCode, password } = req.body;
  if (!teamName || !loginCode || !password) {
    return res.status(400).json({ error: 'Team name, login code, and password are required' });
  }
  if (loginCode.length < 3) {
    return res.status(400).json({ error: 'Login code must be at least 3 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  // Check if login code already taken
  const existing = db.prepare('SELECT id FROM teams WHERE login_code = ?').get(loginCode.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'That login code is already taken. Choose another.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO teams (team_name, login_code, password_hash) VALUES (?, ?, ?)').run(teamName, loginCode.toLowerCase(), hash);

  // Auto-login
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, team_id) VALUES (?, ?)').run(token, result.lastInsertRowid);

  res.json({ token, teamId: result.lastInsertRowid, teamName });
});

// Login
app.post('/api/login', (req, res) => {
  const { loginCode, password } = req.body;
  if (!loginCode || !password) {
    return res.status(400).json({ error: 'Login code and password required' });
  }

  const team = db.prepare('SELECT * FROM teams WHERE login_code = ?').get(loginCode.toLowerCase());
  if (!team || !bcrypt.compareSync(password, team.password_hash)) {
    return res.status(401).json({ error: 'Invalid login code or password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, team_id) VALUES (?, ?)').run(token, team.id);

  res.json({ token, teamId: team.id, teamName: team.team_name });
});

// Logout
app.post('/api/logout', authenticate, (req, res) => {
  const token = req.headers['x-auth-token'];
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

// Get current team info
app.get('/api/me', authenticate, (req, res) => {
  const team = db.prepare('SELECT id, team_name, login_code FROM teams WHERE id = ?').get(req.teamId);
  res.json(team);
});

// ============================================================
// SEASON ROUTES
// ============================================================

app.get('/api/seasons', authenticate, (req, res) => {
  const seasons = db.prepare('SELECT * FROM seasons WHERE team_id = ? ORDER BY created_at DESC').all(req.teamId);
  res.json(seasons.map(s => ({ ...s, rules: JSON.parse(s.rules) })));
});

app.post('/api/seasons', authenticate, (req, res) => {
  const { name, rules } = req.body;
  if (!name) return res.status(400).json({ error: 'Season name required' });
  const rulesJson = JSON.stringify(rules || {
    fgAllowed: true, xpKickAllowed: true, puntsAllowed: true,
    puntDeclaredYd: 40, afterScoreYd: 14, touchbackYd: 20,
    safetyMethod: 'freekick', safetyKickYd: 20, safetyPlaceYd: 40
  });
  const result = db.prepare('INSERT INTO seasons (team_id, name, rules) VALUES (?, ?, ?)').run(req.teamId, name, rulesJson);
  res.json({ id: result.lastInsertRowid, name, rules: JSON.parse(rulesJson) });
});

app.put('/api/seasons/:id', authenticate, (req, res) => {
  const { name, rules } = req.body;
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  if (name) db.prepare('UPDATE seasons SET name = ? WHERE id = ?').run(name, req.params.id);
  if (rules) db.prepare('UPDATE seasons SET rules = ? WHERE id = ?').run(JSON.stringify(rules), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/seasons/:id', authenticate, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  db.prepare('DELETE FROM plays WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM games WHERE season_id = ?').run(req.params.id);
  db.prepare('DELETE FROM players WHERE season_id = ?').run(req.params.id);
  db.prepare('DELETE FROM seasons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Copy a season (players + rules, no games)
app.post('/api/seasons/:id/copy', authenticate, (req, res) => {
  const { name } = req.body;
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.id, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });

  const newName = name || season.name + ' (Copy)';
  const result = db.prepare('INSERT INTO seasons (team_id, name, rules) VALUES (?, ?, ?)').run(req.teamId, newName, season.rules);
  const newSeasonId = result.lastInsertRowid;

  // Copy all active players
  const players = db.prepare('SELECT number, name, position FROM players WHERE season_id = ? AND active = 1').all(req.params.id);
  const insertPlayer = db.prepare('INSERT INTO players (season_id, number, name, position) VALUES (?, ?, ?, ?)');
  for (const p of players) {
    insertPlayer.run(newSeasonId, p.number, p.name, p.position);
  }

  res.json({ id: newSeasonId, name: newName, playersCopied: players.length });
});

// ============================================================
// PLAYER ROUTES
// ============================================================

app.get('/api/seasons/:sid/players', authenticate, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.sid, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  const players = db.prepare('SELECT * FROM players WHERE season_id = ? AND active = 1 ORDER BY number').all(req.params.sid);
  res.json(players);
});

app.post('/api/seasons/:sid/players', authenticate, (req, res) => {
  const { number, name, position } = req.body;
  if (number === undefined || !name) return res.status(400).json({ error: 'Number and name required' });
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.sid, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  const result = db.prepare('INSERT INTO players (season_id, number, name, position) VALUES (?, ?, ?, ?)').run(req.params.sid, number, name, position || '');
  res.json({ id: result.lastInsertRowid, number, name, position: position || '' });
});

app.put('/api/players/:id', authenticate, (req, res) => {
  const { number, name, position } = req.body;
  const player = db.prepare(`SELECT p.* FROM players p JOIN seasons s ON p.season_id = s.id WHERE p.id = ? AND s.team_id = ?`).get(req.params.id, req.teamId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.prepare('UPDATE players SET number = ?, name = ?, position = ? WHERE id = ?').run(number ?? player.number, name ?? player.name, position ?? player.position, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/players/:id', authenticate, (req, res) => {
  const player = db.prepare(`SELECT p.* FROM players p JOIN seasons s ON p.season_id = s.id WHERE p.id = ? AND s.team_id = ?`).get(req.params.id, req.teamId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  db.prepare('UPDATE players SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================
// GAME ROUTES
// ============================================================

app.get('/api/seasons/:sid/games', authenticate, (req, res) => {
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.sid, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  const games = db.prepare('SELECT * FROM games WHERE season_id = ? ORDER BY created_at DESC').all(req.params.sid);
  res.json(games.map(g => ({ ...g, game_state: JSON.parse(g.game_state) })));
});

app.post('/api/seasons/:sid/games', authenticate, (req, res) => {
  const { opponent, homeAway, fieldLength, gameState } = req.body;
  if (!opponent) return res.status(400).json({ error: 'Opponent required' });
  const season = db.prepare('SELECT * FROM seasons WHERE id = ? AND team_id = ?').get(req.params.sid, req.teamId);
  if (!season) return res.status(404).json({ error: 'Season not found' });
  const state = JSON.stringify(gameState || {});
  const result = db.prepare('INSERT INTO games (season_id, opponent, home_away, field_length, game_state) VALUES (?, ?, ?, ?, ?)').run(req.params.sid, opponent, homeAway || 'home', fieldLength || 80, state);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/games/:id', authenticate, (req, res) => {
  const { teamScore, oppScore, completed, gameState } = req.body;
  const game = db.prepare(`SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = ? AND s.team_id = ?`).get(req.params.id, req.teamId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (teamScore !== undefined) db.prepare('UPDATE games SET team_score = ? WHERE id = ?').run(teamScore, req.params.id);
  if (oppScore !== undefined) db.prepare('UPDATE games SET opp_score = ? WHERE id = ?').run(oppScore, req.params.id);
  if (completed !== undefined) db.prepare('UPDATE games SET completed = ? WHERE id = ?').run(completed ? 1 : 0, req.params.id);
  if (gameState) db.prepare('UPDATE games SET game_state = ? WHERE id = ?').run(JSON.stringify(gameState), req.params.id);
  res.json({ ok: true });
});

// ============================================================
// PLAY ROUTES
// ============================================================

app.get('/api/games/:gid/plays', authenticate, (req, res) => {
  const game = db.prepare(`SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = ? AND s.team_id = ?`).get(req.params.gid, req.teamId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const plays = db.prepare('SELECT * FROM plays WHERE game_id = ? ORDER BY play_number').all(req.params.gid);
  res.json(plays.map(p => ({ ...p, players: JSON.parse(p.players) })));
});

app.post('/api/games/:gid/plays', authenticate, (req, res) => {
  const { playNumber, possession, playType, result, players, yards, downBefore, ballPosBefore, description } = req.body;
  const game = db.prepare(`SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = ? AND s.team_id = ?`).get(req.params.gid, req.teamId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const r = db.prepare('INSERT INTO plays (game_id, play_number, possession, play_type, result, players, yards, down_before, ball_pos_before, description) VALUES (?,?,?,?,?,?,?,?,?,?)').run(req.params.gid, playNumber || 0, possession || 'offense', playType || '', result || '', JSON.stringify(players || {}), yards || 0, downBefore || 1, ballPosBefore || 0, description || '');
  res.json({ id: r.lastInsertRowid });
});

app.delete('/api/games/:gid/plays/last', authenticate, (req, res) => {
  const game = db.prepare(`SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = ? AND s.team_id = ?`).get(req.params.gid, req.teamId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const last = db.prepare('SELECT id FROM plays WHERE game_id = ? ORDER BY play_number DESC LIMIT 1').get(req.params.gid);
  if (last) db.prepare('DELETE FROM plays WHERE id = ?').run(last.id);
  res.json({ ok: true });
});

// ============================================================
// CATCH-ALL: Serve frontend for any non-API route
// ============================================================
app.get('*', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicPath)) {
    res.sendFile(publicPath);
  } else if (fs.existsSync(rootPath)) {
    res.sendFile(rootPath);
  } else {
    res.status(404).send('index.html not found. Make sure public/index.html exists in your repo.');
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🏈 Flag Football Stat Tracker running on http://localhost:${PORT}`);
});
