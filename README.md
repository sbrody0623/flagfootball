# 🏈 Flag Football Stat Tracker

A mobile-friendly web app for tracking live flag football game stats. Multiple teams can create accounts, manage rosters, and track games — all stored in a database accessible from any device.

## Features

- **Team Accounts** — Each team creates a login (team code + password). Multiple statisticians can log in with the same credentials.
- **Shared Data** — Players, rules, and game stats are stored server-side. Set up once, use everywhere.
- **Season Management** — Create seasons with custom rules
- **Player Roster** — Add/edit players with jersey numbers and positions
- **Customizable Rules** — Field goals, punts, touchbacks, safety handling, extra points
- **Live Game Tracking** — Button-tap UI with number keypad, optimized for phones
- **Play-by-Play** — Records every play with player numbers, yards, and results
- **Automatic Scoring** — Touchdowns, field goals, safeties, extra points
- **Down & Distance** — Auto-calculates based on 20-yard zone first downs
- **Game History** — View past games and summaries

## Setup

### Requirements
- Node.js 18+

### Install & Run

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` by default.

Set the `PORT` environment variable to change the port:
```bash
PORT=8080 npm start
```

### Deploy (free/cheap options)

- **Railway.app** — Push to GitHub, connect repo, auto-deploys
- **Render.com** — Free tier, connect GitHub repo
- **Fly.io** — Free tier, `fly launch` from the project folder
- **DigitalOcean App Platform** — $5/mo
- **Your own server** — Just `git clone`, `npm install`, `npm start`

All data is stored in a SQLite file (`flagfootball.db`) that lives alongside the server.

## How It Works

1. **Create a team account** — pick a team name, unique login code, and password
2. **Share login credentials** — give the code + password to anyone who will track stats
3. **Create a season** — set rules for your league
4. **Add your roster** — jersey numbers, names, positions
5. **Start a game** — tap buttons to record plays in real-time from your phone

## API

The app has a REST API if you want to build custom tools:

- `POST /api/register` — Create team account
- `POST /api/login` — Log in, get auth token
- `GET /api/seasons` — List seasons
- `POST /api/seasons` — Create season
- `GET /api/seasons/:id/players` — List players
- `POST /api/seasons/:id/players` — Add player
- `GET /api/seasons/:id/games` — List games
- `POST /api/seasons/:id/games` — Create game
- `POST /api/games/:id/plays` — Record a play
- `GET /api/games/:id/plays` — Get play-by-play

All API calls require `x-auth-token` header (except register/login).

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **Auth:** bcrypt password hashing + session tokens
- **Frontend:** Vanilla JS, mobile-first CSS
- **No build step** — just install and run
