# 🏈 Flag Football Stat Tracker

A mobile-friendly web app ("Flag Stats") for tracking live flag football game stats. Multiple teams can create accounts, manage rosters, and track games in real time — all stored in a cloud database and accessible from any device. It installs as a PWA and keeps working when you lose signal.

## Features

- **Team Accounts** — Each team creates a login (team code + password). Multiple statisticians can log in with the same credentials.
- **Shared Data** — Players, rules, and game stats are stored in the cloud. Set up once, use from any device.
- **Season Management** — Create seasons with custom rules; copy a season (players + rules) into a new one.
- **Player Roster** — Add/edit players individually or **bulk-import** a whole roster by pasting a list.
- **Customizable Rules** — Field goals, extra points, punts, touchbacks, after-score field position, and safety handling.
- **Live Game Tracking** — Button-tap UI with a number keypad and a **visual field-position picker**, optimized for phones.
- **Play-by-Play** — Records every play with player numbers, yards, and results. Includes NFHS/NCAA-style rules (a sack counts as negative QB rushing yards).
- **Automatic Scoring** — Touchdowns (6), field goals (3), safeties (2), extra points (1 or 2).
- **Down & Distance** — Auto-calculated. Quarters, halftime possession flip, and overtime (1st & goal from the 10).
- **Special Situations** — Onside-kick option for a trailing team in the second half, free kick after a safety, quarter/overtime handling.
- **Box Score** — Downloadable / printable per-game box score with passing, rushing, receiving, defense, punting, and kicking stats (by quarter or full game).
- **Game History** — Resume an in-progress game, view summaries, end an unfinished game, or delete a game.
- **Fix a jersey number** — tap ✏️ on any play, either in the live game's Play Log (📝 Log) or from a finished game's summary, to correct a mis-entered player number; stats and the box score update automatically. In-game edits are offline-safe (they patch the pending sync queue too). (Play type, result, and yards aren't editable, since they drive the game engine.)
- **Installable PWA** — Add to your home screen as "Flag Stats" and launch it like a native app.
- **Offline-tolerant** — See [Offline Support](#offline-support) below.

## Tech Stack

- **Backend:** Node.js + Express (`server.js`)
- **Database:** Supabase (PostgreSQL), accessed over the **Supabase REST API** via HTTPS
- **Auth:** bcrypt password hashing (`bcryptjs`) + random session tokens
- **Frontend:** A single self-contained `public/index.html` — vanilla JS, mobile-first CSS, **no build step**
- **PWA:** `manifest.json` + `service-worker.js` for install and offline shell

> **Note:** Data is stored in Supabase over the REST API (not a direct Postgres connection). This avoids IPv6 connectivity issues on some hosts and needs no native database drivers.

## Requirements

- Node.js 18+
- A free [Supabase](https://supabase.com) project (for the database)

## Setup

### 1. Create the database tables

In your Supabase project, open the **SQL Editor** and run this once:

```sql
create table if not exists teams (
  id           bigserial primary key,
  team_name    text not null,
  login_code   text unique not null,
  password_hash text not null,
  security_question    text,
  security_answer_hash text,
  created_at   timestamptz default now()
);

create table if not exists sessions (
  token      text primary key,
  team_id    bigint references teams(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists seasons (
  id         bigserial primary key,
  team_id    bigint references teams(id) on delete cascade,
  name       text not null,
  rules      jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists players (
  id        bigserial primary key,
  season_id bigint references seasons(id) on delete cascade,
  number    integer,
  name      text not null,
  position  text default '',
  active    boolean default true
);

create table if not exists games (
  id           bigserial primary key,
  season_id    bigint references seasons(id) on delete cascade,
  opponent     text not null,
  home_away    text default 'home',
  field_length integer default 80,
  team_score   integer default 0,
  opp_score    integer default 0,
  completed    boolean default false,
  game_state   jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

create table if not exists plays (
  id             bigserial primary key,
  game_id        bigint references games(id) on delete cascade,
  play_number    integer default 0,
  possession     text default 'offense',
  play_type      text default '',
  result         text default '',
  players        jsonb default '{}'::jsonb,
  yards          integer default 0,
  down_before    integer default 1,
  ball_pos_before integer default 0,
  description    text default '',
  created_at     timestamptz default now()
);

create table if not exists contact_messages (
  id         bigserial primary key,
  name       text,
  email      text,
  message    text not null,
  handled    boolean default false,
  created_at timestamptz default now()
);
```

> The `plays.players` JSONB column also carries a few app-managed keys — the quarter (`_quarter`), a sync-dedupe id (`_clientUid`), return yards, and an undo snapshot — so no schema migration is needed to change those.

**Upgrading an existing database?** If your `teams` table predates the self-service password reset, add the two new columns:

```sql
alter table teams add column if not exists security_question    text;
alter table teams add column if not exists security_answer_hash text;
```

Teams created before these columns existed simply won't have a security question — those users fall back to the "contact admin" form on the login screen.

### 2. Configure environment variables

The server reads two environment variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your project URL, e.g. `https://abcdefgh.supabase.co` |
| `SUPABASE_KEY` | The Supabase **service_role** key (server-side only — keep it secret) |
| `PORT` | (optional) Port to listen on. Defaults to `3000`. |

### 3. Install & run locally

```bash
npm install
SUPABASE_URL=https://YOUR.supabase.co SUPABASE_KEY=YOUR_SERVICE_ROLE_KEY npm start
```

The app runs on `http://localhost:3000`.

### Deploy (Render)

This app is deployed on [Render](https://render.com):

1. Push the repo to GitHub and connect it as a new **Web Service**.
2. Build command: `npm install` — Start command: `npm start`.
3. Add the `SUPABASE_URL` and `SUPABASE_KEY` environment variables in the Render dashboard.
4. Render auto-deploys on every push to `main`.

A paid instance is recommended so the service doesn't cold-start (spin down) between uses.

## How It Works

1. **Create a team account** — pick a team name, unique login code, and password.
2. **Share login credentials** — anyone tracking stats logs in with the same code + password.
3. **Create a season** — set your league's rules.
4. **Add your roster** — jersey numbers, names, positions (or bulk-import).
5. **Start a game** — tap buttons to record plays in real time from your phone.
6. **Review** — download the box score and browse game history.

## Admin Panel

There is a built-in admin panel for managing team accounts (list teams, reset passwords, delete teams). It is protected by a secret key that only you know.

### Enable it

Set an `ADMIN_KEY` environment variable on the server (in the Render dashboard) to any long, random string:

```
ADMIN_KEY=some-long-random-secret-value
```

If `ADMIN_KEY` is not set, the admin panel is fully disabled and all admin endpoints refuse requests.

### Use it

1. Visit **`/admin`** on your deployed site (e.g. `https://your-app.onrender.com/admin`).
2. Enter your `ADMIN_KEY` to unlock. This grants a temporary admin session (expires after 1 hour).
3. From there you can, for each team:
   - **🔑 Reset Password** — type a new password; it's saved (bcrypt-hashed) and the team's existing logins are signed out. Give the new password to the team.
   - **🗑️ Delete Team** — permanently removes the team and all of its seasons, games, and stats (you must type the team name to confirm).
4. The **📨 Messages** tab shows help/contact requests submitted from the login screen (see below), with the sender's name, email (as a `mailto:` link for replying), and message. Delete each once handled.

### Contact form

The login screen has a **contact form** (name, email, message) for anyone who is locked out or needs help. Submitting it stores the message in the `contact_messages` table — no email service required. Read incoming requests in the admin panel's **Messages** tab.

The panel never exposes password hashes, and the admin key is compared with a timing-safe check and never sent back to the browser. Rotate the key anytime by changing the Render variable.

## Forgot Password (self-service)

Teams set a **security question** and answer when they create their account. If they forget their password, they can reset it themselves from the login screen:

1. Tap **Forgot password?**
2. Enter the team login code — the app shows the team's security question.
3. Answer the question and choose a new password.

The answer is stored bcrypt-hashed and matched case-/whitespace-insensitively. A successful reset also signs out any existing logins.

**Adding a security question to an existing account:** teams created before this feature (or who skipped it) can add one at any time while logged in — open the **🔐 Account Security** card on the home screen, pick a question, enter an answer, and save. Until a question is set, those users fall back to the contact form / admin reset below.

## Resetting a Password Manually (SQL)

If you'd rather not use the admin panel (or `ADMIN_KEY` isn't set), you can reset a password directly from the Supabase **SQL Editor**. Passwords are bcrypt-hashed, so you can't type a plaintext value into the table — use one of the options below.

First, find the team's login code:

```sql
select id, team_name, login_code from teams;
```

### Option A — Reset entirely inside Supabase (recommended)

Enable the `pgcrypto` extension once:

```sql
create extension if not exists pgcrypto;
```

Then set a new password (replace the password and login code):

```sql
update teams
set password_hash = crypt('newpass123', gen_salt('bf'))
where login_code = 'their-login-code';
```

`gen_salt('bf')` produces a standard bcrypt hash that the server's `bcryptjs` verifies correctly. Give the person their new password and they can log in.

### Option B — Generate the hash yourself

Generate a bcrypt hash locally with the same library the server uses:

```bash
node -e "console.log(require('bcryptjs').hashSync('newpass123', 10))"
```

Copy the output (it starts with `$2a$10$…`) and paste it in:

```sql
update teams set password_hash = '$2a$10$...paste-hash-here...'
where login_code = 'their-login-code';
```

## Offline Support

The app is built to survive losing signal mid-game (e.g. a field in a dead zone):

- **Set up the game while you have a connection** (WiFi or hotspot), then track the whole game offline.
- Every play updates the score, down, and field position **locally and instantly** — the game screen stays fully correct with no connection.
- Plays recorded offline are **saved on the device** and queued to sync. Each queued play is tagged with its game and given a unique id, so re-syncing can never duplicate a play or send it to the wrong game.
- When you get a connection back, the queue **syncs automatically** — on the browser's `online` event, on the next login/app launch, and via a periodic retry.
- A yellow banner shows **"⚠️ N plays not yet synced — tap to retry"** so you always know the true state. It clears once everything is uploaded.

> To reliably start offline, load and log into the app once while connected so the roster and game are available on the device.

## API

The app exposes a REST API (all responses are JSON). Every call except register/login requires an `x-auth-token` header with the session token.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/register` | Create a team account, returns a token |
| `POST` | `/api/login` | Log in, returns a token |
| `POST` | `/api/logout` | Invalidate the current session |
| `GET`  | `/api/me` | Current team info |
| `GET`  | `/api/seasons` | List seasons |
| `POST` | `/api/seasons` | Create a season |
| `PUT`  | `/api/seasons/:id` | Update a season's rules |
| `POST` | `/api/seasons/:id/copy` | Copy a season (players + rules) |
| `DELETE` | `/api/seasons/:id` | Delete a season |
| `GET`  | `/api/seasons/:id/players` | List players |
| `POST` | `/api/seasons/:id/players` | Add a player |
| `PUT`  | `/api/players/:id` | Update a player |
| `DELETE` | `/api/players/:id` | Remove a player |
| `GET`  | `/api/seasons/:id/games` | List games |
| `POST` | `/api/seasons/:id/games` | Create a game |
| `PUT`  | `/api/games/:id` | Update score / state / completed flag |
| `DELETE` | `/api/games/:id` | Delete a game and its plays |
| `GET`  | `/api/games/:id/plays` | Get play-by-play |
| `POST` | `/api/games/:id/plays` | Record a play (idempotent via `clientUid`) |
| `DELETE` | `/api/games/:id/plays/last` | Delete the last play (undo) |

## Project Structure

```
server.js            Express server + Supabase REST helpers + all API routes
public/index.html    The entire single-file frontend (also mirrored to ./index.html)
public/manifest.json PWA manifest (app name "Flag Stats")
public/service-worker.js  Offline shell + cache versioning
public/icon-192.png, icon-512.png  App icons
package.json         Dependencies (express, bcryptjs) and start script
```

> The frontend is edited in `public/index.html` and mirrored to the repo-root `index.html`; `manifest.json` and `service-worker.js` are likewise mirrored to the root. The server serves whichever it finds.
