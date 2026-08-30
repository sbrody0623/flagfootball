const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase config (set these as environment variables on Render)
const SUPABASE_URL = process.env.SUPABASE_URL; // e.g. https://abcdefgh.supabase.co
const SUPABASE_KEY = process.env.SUPABASE_KEY; // service_role key

// Admin panel secret. Set ADMIN_KEY as an environment variable on Render to
// enable the /admin panel. If unset, all admin endpoints are disabled.
const ADMIN_KEY = process.env.ADMIN_KEY;
// In-memory admin sessions (token -> expiry). Not persisted: an admin just
// re-enters the key after a server restart. Each session lasts 1 hour.
const adminSessions = new Map();
const ADMIN_TTL_MS = 60 * 60 * 1000; // 1 hour

// Constant-time-ish comparison to avoid trivially leaking the key length/prefix.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch (e) { return false; }
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!fs.existsSync(path.join(__dirname, 'public', 'index.html'))) {
  app.use(express.static(__dirname));
}

// ============================================================
// SUPABASE REST HELPER
// ============================================================
async function supaFetch(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation'
  };
  
  const fetchOpts = {
    method: options.method || 'GET',
    headers
  };
  if (options.body) fetchOpts.body = JSON.stringify(options.body);

  const res = await fetch(url, fetchOpts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// Helper: query with filters
async function supaGet(table, query = '') {
  return supaFetch(`${table}${query ? '?' + query : ''}`);
}

async function supaInsert(table, data) {
  const result = await supaFetch(table, { method: 'POST', body: data });
  return Array.isArray(result) ? result[0] : result;
}

async function supaUpdate(table, query, data) {
  const result = await supaFetch(`${table}?${query}`, { method: 'PATCH', body: data });
  return result;
}

async function supaDelete(table, query) {
  return supaFetch(`${table}?${query}`, { method: 'DELETE' });
}

// ============================================================
// INIT: Create tables via Supabase SQL Editor (run once)
// We'll auto-create via RPC if tables don't exist
// ============================================================
async function initDB() {
  try {
    // Test connection by querying teams table
    await supaGet('teams', 'select=id&limit=1');
    console.log('✅ Database connected');
  } catch (e) {
    console.log('⚠️  Database tables may not exist yet. Run the SQL setup in Supabase SQL Editor.');
    console.log('   See README.md for the setup SQL.');
  }
}

if (SUPABASE_URL && SUPABASE_KEY) {
  initDB();
} else {
  console.log('⚠️  Set SUPABASE_URL and SUPABASE_KEY environment variables');
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function authenticate(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  try {
    const sessions = await supaGet('sessions', `token=eq.${token}&select=team_id`);
    if (!sessions || sessions.length === 0) return res.status(401).json({ error: 'Invalid session' });
    req.teamId = sessions[0].team_id;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Auth error' });
  }
}

// Admin auth: requires a valid, unexpired admin token (issued by /api/admin/login).
function adminAuth(req, res, next) {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Admin panel not configured. Set ADMIN_KEY on the server.' });
  const token = req.headers['x-admin-token'];
  const exp = token && adminSessions.get(token);
  if (!exp || exp < Date.now()) {
    if (token) adminSessions.delete(token);
    return res.status(403).json({ error: 'Admin authorization required' });
  }
  next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

app.post('/api/register', async (req, res) => {
  try {
    const { teamName, loginCode, password } = req.body;
    if (!teamName || !loginCode || !password) return res.status(400).json({ error: 'Team name, login code, and password are required' });
    if (loginCode.length < 3) return res.status(400).json({ error: 'Login code must be at least 3 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = await supaGet('teams', `login_code=eq.${loginCode.toLowerCase()}&select=id`);
    if (existing && existing.length > 0) return res.status(400).json({ error: 'That login code is already taken.' });

    const hash = bcrypt.hashSync(password, 10);
    const team = await supaInsert('teams', { team_name: teamName, login_code: loginCode.toLowerCase(), password_hash: hash });

    const token = crypto.randomBytes(32).toString('hex');
    await supaInsert('sessions', { token, team_id: team.id });

    res.json({ token, teamId: team.id, teamName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { loginCode, password } = req.body;
    if (!loginCode || !password) return res.status(400).json({ error: 'Login code and password required' });

    const teams = await supaGet('teams', `login_code=eq.${loginCode.toLowerCase()}`);
    if (!teams || teams.length === 0) return res.status(401).json({ error: 'Invalid login code or password' });

    const team = teams[0];
    if (!bcrypt.compareSync(password, team.password_hash)) return res.status(401).json({ error: 'Invalid login code or password' });

    const token = crypto.randomBytes(32).toString('hex');
    await supaInsert('sessions', { token, team_id: team.id });

    res.json({ token, teamId: team.id, teamName: team.team_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers['x-auth-token'];
    await supaDelete('sessions', `token=eq.${token}`);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: true }); }
});

app.get('/api/me', authenticate, async (req, res) => {
  try {
    const teams = await supaGet('teams', `id=eq.${req.teamId}&select=id,team_name,login_code`);
    res.json(teams[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ADMIN ROUTES (gated by ADMIN_KEY env var)
// ============================================================

// Whether the admin panel is usable at all (used by the UI to show/hide it).
app.get('/api/admin/status', (req, res) => {
  res.json({ enabled: !!ADMIN_KEY });
});

// Exchange the admin key for a short-lived admin token.
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_KEY) return res.status(503).json({ error: 'Admin panel not configured. Set ADMIN_KEY on the server.' });
  const { key } = req.body || {};
  if (!key || !safeEqual(String(key), String(ADMIN_KEY))) {
    return res.status(403).json({ error: 'Incorrect admin key' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_TTL_MS);
  res.json({ token, expiresInMs: ADMIN_TTL_MS });
});

// Log out an admin session.
app.post('/api/admin/logout', adminAuth, (req, res) => {
  adminSessions.delete(req.headers['x-admin-token']);
  res.json({ ok: true });
});

// List every team with season/game counts (never returns password hashes).
app.get('/api/admin/teams', adminAuth, async (req, res) => {
  try {
    const teams = await supaGet('teams', 'select=id,team_name,login_code,created_at&order=created_at.desc');
    const out = [];
    for (const t of (teams || [])) {
      let seasonCount = 0, gameCount = 0;
      try {
        const seasons = await supaGet('seasons', `team_id=eq.${t.id}&select=id`);
        seasonCount = (seasons || []).length;
        for (const s of (seasons || [])) {
          const games = await supaGet('games', `season_id=eq.${s.id}&select=id`);
          gameCount += (games || []).length;
        }
      } catch (e) { /* counts are best-effort */ }
      out.push({ id: t.id, team_name: t.team_name, login_code: t.login_code, created_at: t.created_at, seasonCount, gameCount });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset a team's password to an admin-supplied value.
app.post('/api/admin/teams/:id/reset-password', adminAuth, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters' });
    }
    const teams = await supaGet('teams', `id=eq.${req.params.id}&select=id`);
    if (!teams || teams.length === 0) return res.status(404).json({ error: 'Team not found' });
    const hash = bcrypt.hashSync(String(newPassword), 10);
    await supaUpdate('teams', `id=eq.${req.params.id}`, { password_hash: hash });
    // Invalidate any existing login sessions for that team so old logins can't linger.
    try { await supaDelete('sessions', `team_id=eq.${req.params.id}`); } catch (e) {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a team and ALL of its data (seasons, games, plays, players, sessions).
app.delete('/api/admin/teams/:id', adminAuth, async (req, res) => {
  try {
    const tid = req.params.id;
    const teams = await supaGet('teams', `id=eq.${tid}&select=id`);
    if (!teams || teams.length === 0) return res.status(404).json({ error: 'Team not found' });
    // Cascade manually (in case DB-level ON DELETE CASCADE isn't set up).
    const seasons = await supaGet('seasons', `team_id=eq.${tid}&select=id`);
    for (const s of (seasons || [])) {
      const games = await supaGet('games', `season_id=eq.${s.id}&select=id`);
      for (const g of (games || [])) {
        try { await supaDelete('plays', `game_id=eq.${g.id}`); } catch (e) {}
      }
      try { await supaDelete('games', `season_id=eq.${s.id}`); } catch (e) {}
      try { await supaDelete('players', `season_id=eq.${s.id}`); } catch (e) {}
    }
    try { await supaDelete('seasons', `team_id=eq.${tid}`); } catch (e) {}
    try { await supaDelete('sessions', `team_id=eq.${tid}`); } catch (e) {}
    await supaDelete('teams', `id=eq.${tid}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// SEASON ROUTES
// ============================================================

app.get('/api/seasons', authenticate, async (req, res) => {
  try {
    const seasons = await supaGet('seasons', `team_id=eq.${req.teamId}&order=created_at.desc`);
    res.json(seasons);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons', authenticate, async (req, res) => {
  try {
    const { name, rules } = req.body;
    if (!name) return res.status(400).json({ error: 'Season name required' });
    const rulesObj = rules || {
      fgAllowed: true, xpKickAllowed: true, puntsAllowed: true,
      puntDeclaredYd: 40, afterScoreYd: 14, touchbackYd: 14,
      safetyMethod: 'freekick', safetyKickYd: 20, safetyPlaceYd: 40
    };
    const season = await supaInsert('seasons', { team_id: req.teamId, name, rules: rulesObj });
    res.json({ id: season.id, name, rules: rulesObj });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/seasons/:id', authenticate, async (req, res) => {
  try {
    const { name, rules } = req.body;
    const check = await supaGet('seasons', `id=eq.${req.params.id}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    const updates = {};
    if (name) updates.name = name;
    if (rules) updates.rules = rules;
    await supaUpdate('seasons', `id=eq.${req.params.id}`, updates);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/seasons/:id', authenticate, async (req, res) => {
  try {
    const check = await supaGet('seasons', `id=eq.${req.params.id}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    // Delete plays for games in this season
    const games = await supaGet('games', `season_id=eq.${req.params.id}&select=id`);
    for (const g of games) {
      await supaDelete('plays', `game_id=eq.${g.id}`);
    }
    await supaDelete('games', `season_id=eq.${req.params.id}`);
    await supaDelete('players', `season_id=eq.${req.params.id}`);
    await supaDelete('seasons', `id=eq.${req.params.id}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Copy a season (players + rules, no games)
app.post('/api/seasons/:id/copy', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const check = await supaGet('seasons', `id=eq.${req.params.id}&team_id=eq.${req.teamId}`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });

    const season = check[0];
    const newName = name || season.name + ' (Copy)';
    const newSeason = await supaInsert('seasons', { team_id: req.teamId, name: newName, rules: season.rules });

    // Copy active players
    const players = await supaGet('players', `season_id=eq.${req.params.id}&active=eq.true&select=number,name,position`);
    for (const p of players) {
      await supaInsert('players', { season_id: newSeason.id, number: p.number, name: p.name, position: p.position });
    }

    res.json({ id: newSeason.id, name: newName, playersCopied: players.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAYER ROUTES
// ============================================================

app.get('/api/seasons/:sid/players', authenticate, async (req, res) => {
  try {
    const check = await supaGet('seasons', `id=eq.${req.params.sid}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    const players = await supaGet('players', `season_id=eq.${req.params.sid}&active=eq.true&order=number.asc`);
    res.json(players);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons/:sid/players', authenticate, async (req, res) => {
  try {
    const { number, name, position } = req.body;
    if (number === undefined || !name) return res.status(400).json({ error: 'Number and name required' });
    const check = await supaGet('seasons', `id=eq.${req.params.sid}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    const player = await supaInsert('players', { season_id: parseInt(req.params.sid), number, name, position: position || '' });
    res.json({ id: player.id, number, name, position: position || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/players/:id', authenticate, async (req, res) => {
  try {
    const { number, name, position } = req.body;
    // Verify ownership through season
    const check = await supaGet('players', `id=eq.${req.params.id}&select=id,season_id,number,name,position`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Player not found' });
    const player = check[0];
    const seasonCheck = await supaGet('seasons', `id=eq.${player.season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Player not found' });
    await supaUpdate('players', `id=eq.${req.params.id}`, { number: number ?? player.number, name: name ?? player.name, position: position ?? player.position });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/players/:id', authenticate, async (req, res) => {
  try {
    const check = await supaGet('players', `id=eq.${req.params.id}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Player not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Player not found' });
    await supaUpdate('players', `id=eq.${req.params.id}`, { active: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// GAME ROUTES
// ============================================================

app.get('/api/seasons/:sid/games', authenticate, async (req, res) => {
  try {
    const check = await supaGet('seasons', `id=eq.${req.params.sid}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    const games = await supaGet('games', `season_id=eq.${req.params.sid}&order=created_at.desc`);
    res.json(games);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/seasons/:sid/games', authenticate, async (req, res) => {
  try {
    const { opponent, homeAway, fieldLength, gameState } = req.body;
    if (!opponent) return res.status(400).json({ error: 'Opponent required' });
    const check = await supaGet('seasons', `id=eq.${req.params.sid}&team_id=eq.${req.teamId}&select=id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Season not found' });
    const game = await supaInsert('games', { season_id: parseInt(req.params.sid), opponent, home_away: homeAway || 'home', field_length: fieldLength || 80, game_state: gameState || {} });
    res.json({ id: game.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/games/:id', authenticate, async (req, res) => {
  try {
    const { teamScore, oppScore, completed, gameState } = req.body;
    const check = await supaGet('games', `id=eq.${req.params.id}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Game not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Game not found' });
    const updates = {};
    if (teamScore !== undefined) updates.team_score = teamScore;
    if (oppScore !== undefined) updates.opp_score = oppScore;
    if (completed !== undefined) updates.completed = completed;
    if (gameState) updates.game_state = gameState;
    await supaUpdate('games', `id=eq.${req.params.id}`, updates);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a game (and all its plays)
app.delete('/api/games/:id', authenticate, async (req, res) => {
  try {
    const check = await supaGet('games', `id=eq.${req.params.id}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Game not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Game not found' });
    await supaDelete('plays', `game_id=eq.${req.params.id}`);
    await supaDelete('games', `id=eq.${req.params.id}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PLAY ROUTES
// ============================================================

app.get('/api/games/:gid/plays', authenticate, async (req, res) => {
  try {
    const check = await supaGet('games', `id=eq.${req.params.gid}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Game not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Game not found' });
    const plays = await supaGet('plays', `game_id=eq.${req.params.gid}&order=play_number.asc`);
    // Surface the quarter (stashed inside the players JSON) as a top-level field
    // so the client's box score / quarter filter can read play.quarter directly.
    const out = (plays || []).map(p => {
      const pl = p.players || {};
      return Object.assign({}, p, { quarter: (pl._quarter !== undefined ? pl._quarter : null) });
    });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/games/:gid/plays', authenticate, async (req, res) => {
  try {
    const { playNumber, possession, playType, result, players, yards, downBefore, ballPosBefore, description, quarter, clientUid } = req.body;
    const check = await supaGet('games', `id=eq.${req.params.gid}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Game not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Game not found' });

    // Build the players JSON blob. We stash `quarter` and a stable `clientUid`
    // INSIDE this JSON so we need NO Supabase schema changes (the plays table
    // has no dedicated quarter/client_uid columns). clientUid makes re-syncing
    // idempotent: if a play with the same uid already exists for this game we
    // do NOT insert a duplicate (guards against lost-response re-sends).
    const playersBlob = Object.assign({}, players || {});
    if (quarter !== undefined && quarter !== null) playersBlob._quarter = quarter;
    if (clientUid) playersBlob._clientUid = clientUid;

    // Idempotency check: has a play with this clientUid already been saved?
    if (clientUid) {
      try {
        const existing = await supaGet('plays', `game_id=eq.${req.params.gid}&players->>_clientUid=eq.${encodeURIComponent(clientUid)}&select=id`);
        if (existing && existing.length > 0) {
          return res.json({ id: existing[0].id, duplicate: true });
        }
      } catch (e) { /* if the filter isn't supported, fall through and just insert */ }
    }

    const play = await supaInsert('plays', {
      game_id: parseInt(req.params.gid), play_number: playNumber || 0, possession: possession || 'offense',
      play_type: playType || '', result: result || '', players: playersBlob,
      yards: yards || 0, down_before: downBefore || 1, ball_pos_before: ballPosBefore || 0, description: description || ''
    });
    res.json({ id: play.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/games/:gid/plays/last', authenticate, async (req, res) => {
  try {
    const check = await supaGet('games', `id=eq.${req.params.gid}&select=id,season_id`);
    if (!check || check.length === 0) return res.status(404).json({ error: 'Game not found' });
    const seasonCheck = await supaGet('seasons', `id=eq.${check[0].season_id}&team_id=eq.${req.teamId}&select=id`);
    if (!seasonCheck || seasonCheck.length === 0) return res.status(404).json({ error: 'Game not found' });
    const last = await supaGet('plays', `game_id=eq.${req.params.gid}&order=play_number.desc&limit=1`);
    if (last && last.length > 0) await supaDelete('plays', `id=eq.${last[0].id}`);
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
