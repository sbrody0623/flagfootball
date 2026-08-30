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
```

> The `plays.players` JSONB column also carries a few app-managed keys — the quarter (`_quarter`), a sync-dedupe id (`_clientUid`), return yards, and an undo snapshot — so no schema migration is needed to change those.

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
