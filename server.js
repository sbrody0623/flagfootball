const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: also serve from root in case public/ folder doesn't exist
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  app.use(express.static(__dirname));
}

// ============================================================
// DATABASE SETUP (PostgreSQL via Supabase)
// ============================================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Force IPv4 to fix Render free tier connection issues
  connectionTimeoutMillis: 10000
});

// Force DNS to resolve IPv4
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        team_name TEXT NOT NULL,
        login_code TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id),
        name TEXT NOT NULL,
        rules JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id),
        number INTEGER NOT NULL,
        name TEXT NOT NULL,
        position TEXT DEFAULT '',
        active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        season_id INTEGER NOT NULL REFERENCES seasons(id),
        opponent TEXT NOT NULL,
        home_away TEXT NOT NULL DEFAULT 'home',
        field_length INTEGER NOT NULL DEFAULT 80,
        team_score INTEGER DEFAULT 0,
        opp_score INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT false,
        game_state JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS plays (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES games(id),
        play_number INTEGER NOT NULL,
        possession TEXT NOT NULL,
        play_type TEXT NOT NULL,
        result TEXT NOT NULL,
        players JSONB DEFAULT '{}',
        yards INTEGER DEFAULT 0,
        down_before INTEGER DEFAULT 1,
        ball_pos_before INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        team_id INTEGER NOT NULL REFERENCES teams(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Database tables ready');
  } finally {
    client.release();
  }
}

initDB().catch(err => console.error('DB init error:', err));

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function authenticate(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  const result = await pool.query('SELECT team_id FROM sessions WHERE token = $1', [token]);
  if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid session' });

  req.teamId = result.rows[0].team_id;
  next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/register', async (req, res) => {
  try {
    const { teamName, loginCode, password } = req.body;
    if (!teamName || !loginCode || !password) {
      return res.status(400).json({ error: 'Team name, login code, and password are required' });
    }
    if (loginCode.length < 3) return res.status(400).json({ error: 'Login code must be at least 3 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = await pool.query('SELECT id FROM teams WHERE login_code = $1', [loginCode.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'That login code is already taken.' });

    const hash = bcrypt.hashSync(password, 10);
    const result = await pool.query('INSERT INTO teams (team_name, login_code, password_hash) VALUES ($1, $2, $3) RETURNING id', [teamName, loginCode.toLowerCase(), hash]);
    const teamId = result.rows[0].id;

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, team_id) VALUES ($1, $2)', [token, teamId]);

    res.json({ token, teamId, teamName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { loginCode, password } = req.body;
    if (!loginCode || !password) return res.status(400).json({ error: 'Login code and password required' });

    const result = await pool.query('SELECT * FROM teams WHERE login_code = $1', [loginCode.toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid login code or password' });

    const team = result.rows[0];
    if (!bcrypt.compareSync(password, team.password_hash)) return res.status(401).json({ error: 'Invalid login code or password' });

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions (token, team_id) VALUES ($1, $2)', [token, team.id]);

    res.json({ token, teamId: team.id, teamName: team.team_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', authenticate, async (req, res) => {
  const token = req.headers['x-auth-token'];
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
  res.json({ ok: true });
});

app.get('/api/me', authenticate, async (req, res) => {
  const result = await pool.query('SELECT id, team_name, login_code FROM teams WHERE id = $1', [req.teamId]);
  res.json(result.rows[0]);
});

// ============================================================
// SEASON ROUTES
// ============================================================

app.get('/api/seasons', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM seasons WHERE team_id = $1 ORDER BY created_at DESC', [req.teamId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons', authenticate, async (req, res) => {
  try {
    const { name, rules } = req.body;
    if (!name) return res.status(400).json({ error: 'Season name required' });
    const rulesObj = rules || {
      fgAllowed: true, xpKickAllowed: true, puntsAllowed: true,
      puntDeclaredYd: 40, afterScoreYd: 14, touchbackYd: 20,
      safetyMethod: 'freekick', safetyKickYd: 20, safetyPlaceYd: 40
    };
    const result = await pool.query('INSERT INTO seasons (team_id, name, rules) VALUES ($1, $2, $3) RETURNING id', [req.teamId, name, JSON.stringify(rulesObj)]);
    res.json({ id: result.rows[0].id, name, rules: rulesObj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/seasons/:id', authenticate, async (req, res) => {
  try {
    const { name, rules } = req.body;
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    if (name) await pool.query('UPDATE seasons SET name = $1 WHERE id = $2', [name, req.params.id]);
    if (rules) await pool.query('UPDATE seasons SET rules = $1 WHERE id = $2', [JSON.stringify(rules), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/seasons/:id', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    await pool.query('DELETE FROM plays WHERE game_id IN (SELECT id FROM games WHERE season_id = $1)', [req.params.id]);
    await pool.query('DELETE FROM games WHERE season_id = $1', [req.params.id]);
    await pool.query('DELETE FROM players WHERE season_id = $1', [req.params.id]);
    await pool.query('DELETE FROM seasons WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Copy a season (players + rules, no games)
app.post('/api/seasons/:id/copy', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });

    const season = check.rows[0];
    const newName = name || season.name + ' (Copy)';
    const result = await pool.query('INSERT INTO seasons (team_id, name, rules) VALUES ($1, $2, $3) RETURNING id', [req.teamId, newName, JSON.stringify(season.rules)]);
    const newSeasonId = result.rows[0].id;

    // Copy all active players
    const players = await pool.query('SELECT number, name, position FROM players WHERE season_id = $1 AND active = true', [req.params.id]);
    for (const p of players.rows) {
      await pool.query('INSERT INTO players (season_id, number, name, position) VALUES ($1, $2, $3, $4)', [newSeasonId, p.number, p.name, p.position]);
    }

    res.json({ id: newSeasonId, name: newName, playersCopied: players.rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAYER ROUTES
// ============================================================

app.get('/api/seasons/:sid/players', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.sid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    const result = await pool.query('SELECT * FROM players WHERE season_id = $1 AND active = true ORDER BY number', [req.params.sid]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons/:sid/players', authenticate, async (req, res) => {
  try {
    const { number, name, position } = req.body;
    if (number === undefined || !name) return res.status(400).json({ error: 'Number and name required' });
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.sid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    const result = await pool.query('INSERT INTO players (season_id, number, name, position) VALUES ($1, $2, $3, $4) RETURNING id', [req.params.sid, number, name, position || '']);
    res.json({ id: result.rows[0].id, number, name, position: position || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/players/:id', authenticate, async (req, res) => {
  try {
    const { number, name, position } = req.body;
    const check = await pool.query('SELECT p.* FROM players p JOIN seasons s ON p.season_id = s.id WHERE p.id = $1 AND s.team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Player not found' });
    const player = check.rows[0];
    await pool.query('UPDATE players SET number = $1, name = $2, position = $3 WHERE id = $4', [number ?? player.number, name ?? player.name, position ?? player.position, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/players/:id', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT p.* FROM players p JOIN seasons s ON p.season_id = s.id WHERE p.id = $1 AND s.team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Player not found' });
    await pool.query('UPDATE players SET active = false WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// GAME ROUTES
// ============================================================

app.get('/api/seasons/:sid/games', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.sid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    const result = await pool.query('SELECT * FROM games WHERE season_id = $1 ORDER BY created_at DESC', [req.params.sid]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons/:sid/games', authenticate, async (req, res) => {
  try {
    const { opponent, homeAway, fieldLength, gameState } = req.body;
    if (!opponent) return res.status(400).json({ error: 'Opponent required' });
    const check = await pool.query('SELECT * FROM seasons WHERE id = $1 AND team_id = $2', [req.params.sid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Season not found' });
    const result = await pool.query('INSERT INTO games (season_id, opponent, home_away, field_length, game_state) VALUES ($1, $2, $3, $4, $5) RETURNING id', [req.params.sid, opponent, homeAway || 'home', fieldLength || 80, JSON.stringify(gameState || {})]);
    res.json({ id: result.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/games/:id', authenticate, async (req, res) => {
  try {
    const { teamScore, oppScore, completed, gameState } = req.body;
    const check = await pool.query('SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = $1 AND s.team_id = $2', [req.params.id, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
    if (teamScore !== undefined) await pool.query('UPDATE games SET team_score = $1 WHERE id = $2', [teamScore, req.params.id]);
    if (oppScore !== undefined) await pool.query('UPDATE games SET opp_score = $1 WHERE id = $2', [oppScore, req.params.id]);
    if (completed !== undefined) await pool.query('UPDATE games SET completed = $1 WHERE id = $2', [completed, req.params.id]);
    if (gameState) await pool.query('UPDATE games SET game_state = $1 WHERE id = $2', [JSON.stringify(gameState), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAY ROUTES
// ============================================================

app.get('/api/games/:gid/plays', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = $1 AND s.team_id = $2', [req.params.gid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
    const result = await pool.query('SELECT * FROM plays WHERE game_id = $1 ORDER BY play_number', [req.params.gid]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/:gid/plays', authenticate, async (req, res) => {
  try {
    const { playNumber, possession, playType, result, players, yards, downBefore, ballPosBefore, description } = req.body;
    const check = await pool.query('SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = $1 AND s.team_id = $2', [req.params.gid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
    const r = await pool.query('INSERT INTO plays (game_id, play_number, possession, play_type, result, players, yards, down_before, ball_pos_before, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [req.params.gid, playNumber || 0, possession || 'offense', playType || '', result || '', JSON.stringify(players || {}), yards || 0, downBefore || 1, ballPosBefore || 0, description || '']);
    res.json({ id: r.rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/games/:gid/plays/last', authenticate, async (req, res) => {
  try {
    const check = await pool.query('SELECT g.* FROM games g JOIN seasons s ON g.season_id = s.id WHERE g.id = $1 AND s.team_id = $2', [req.params.gid, req.teamId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
    const last = await pool.query('SELECT id FROM plays WHERE game_id = $1 ORDER BY play_number DESC LIMIT 1', [req.params.gid]);
    if (last.rows.length > 0) await pool.query('DELETE FROM plays WHERE id = $1', [last.rows[0].id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CATCH-ALL: Serve frontend
// ============================================================
app.get('*', (req, res) => {
  const publicPath = path.join(__dirname, 'public', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicPath)) res.sendFile(publicPath);
  else if (fs.existsSync(rootPath)) res.sendFile(rootPath);
  else res.status(404).send('index.html not found.');
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`🏈 Flag Football Stat Tracker running on http://localhost:${PORT}`);
});
