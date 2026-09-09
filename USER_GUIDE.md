# 🏈 Flag Stats — User Guide

A complete, plain-English guide to using the **Flag Football Stat Tracker** app ("Flag Stats"). This covers everything from creating an account to tracking a live game, sharing it with parents, exporting stats, and managing the app as an admin.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Creating an Account](#2-creating-an-account)
3. [Logging In & the Home Screen](#3-logging-in--the-home-screen)
4. [Seasons](#4-seasons)
5. [Players (Roster)](#5-players-roster)
6. [Rules](#6-rules)
7. [Tracking a Live Game](#7-tracking-a-live-game)
8. [Scoring & Special Situations](#8-scoring--special-situations)
9. [Fixing Mistakes (Undo & Edit)](#9-fixing-mistakes-undo--edit)
10. [Game History & Box Score](#10-game-history--box-score)
11. [Exporting to MaxPreps](#11-exporting-to-maxpreps)
12. [Live Spectator View (for Parents)](#12-live-spectator-view-for-parents)
13. [Account Security & Password Reset](#13-account-security--password-reset)
14. [Offline Use](#14-offline-use)
15. [Installing as an App](#15-installing-as-an-app)
16. [Admin Panel](#16-admin-panel)
17. [Quick Reference](#17-quick-reference)

---

## 1. Getting Started

Flag Stats runs in your web browser on a phone, tablet, or computer. There's nothing to download to use it (though you can "install" it to your home screen — see [section 15](#15-installing-as-an-app)).

- **Coaches / statisticians** log in to track games.
- **Parents** use a separate watch link — no login needed.

You'll need an **invite code** (from the app admin) to create a new team account.

---

## 2. Creating an Account

1. Open the app and tap **Create Account**.
2. Fill in:
   - **Invite Code** — required. Ask the admin for one (each code works once).
   - **Team Name** — e.g. "Thunder".
   - **Login Code** — a unique code your team uses to log in (e.g. `thunder2026`).
   - **Password** — at least 4 characters.
   - **Security Question + Answer** — used to reset your password later if you forget it.
3. Tap **Create Team**.

> **Tip:** The same login code + password can be shared with anyone who helps track stats. Multiple people can log in with the same team account.

---

## 3. Logging In & the Home Screen

Log in with your **team login code** and **password**.

The **Home screen** shows:
- Your team name and a **Logout** button.
- A **Resume** button if a game is currently in progress.
- **+ New Season** button.
- Your list of **Seasons**.
- **📺 Share with Parents** — get the live watch link (see [section 12](#12-live-spectator-view-for-parents)).
- **🔐 Account Security** — set/update your security question (see [section 13](#13-account-security--password-reset)).

---

## 4. Seasons

Everything is organized under a **season** (players, rules, and games belong to a season).

- **Create a season:** tap **+ New Season**, name it (e.g. "Fall 2026"), and continue to add players.
- **Open a season:** tap **Open** on any season card to reach its dashboard.
- **Copy a season:** tap **📋 Copy** to duplicate its players and rules into a new season (handy year-to-year).
- **Delete a season:** tap **Delete** (removes the season and all its data — cannot be undone).

The **Season Dashboard** has: Start New Game, Players, Rules, and Game History.

---

## 5. Players (Roster)

From the season dashboard, tap **👥 Players**.

- **Add one player:** enter jersey #, name, and (optional) position, then **Add Player**.
- **Bulk import:** tap **📋 Bulk Import**, then paste one player per line as `number, name, position` (position optional). Comma or tab separated. Example:
  ```
  12, Jordan Smith, QB
  7, Alex Lee, WR
  22, Sam Ray
  ```
  Then tap **Import All**.
- **Edit / remove:** use the ✏️ and 🗑️ buttons on each player.

> **Important:** Jersey numbers here should match how you'll enter them during a game (and how they appear on MaxPreps).

---

## 6. Rules

From the season dashboard, tap **📋 Rules**. Set your league's rules once per season:

- **Field goals allowed?** and **XP kicks allowed?**
- **Punts allowed?** (and the yard line if a punt is just "declared")
- **After a score**, the opponent starts at their own ___ yard line (default 14).
- **Touchback** yard line (default 14).
- **Safety** handling — free kick from a yard line, or ball placed at a yard line.

Tap **Save Rules**.

---

## 7. Tracking a Live Game

From the season dashboard, tap **🏈 Start New Game**:

1. Enter the **opponent**, choose **Home/Away**, **Field Length** (80 or 100 yds, default 100), and who **starts on offense**.
2. Tap **Start Game!**

**The live game screen shows:**
- **Scoreboard** (your score vs. opponent) and the **quarter**.
- **Down & distance**, current **yard line**, and **possession**.
- A **play entry area** and **controls** (Switch, End Qtr, Undo, Log, Onside).

**Recording a play (step by step):**
1. Tap the **play type** (Pass, Run, Punt, Field Goal, Pre-Snap Penalty — or Punt Return / FG Block when on defense).
2. Tap the **result** (e.g. Complete, Incomplete, Interception, Sack, Gain, Loss…).
3. Enter **player number(s)** on the keypad when prompted (QB, receiver, runner, etc.).
4. Enter **yards** — either type them, or use the **visual field picker** (drag the football to where the play ended). On a loss/sack, movement is constrained backward.
5. Review the summary and tap **✓ Record Play**.

Tapping the wrong play type? Use **✗ Cancel / Change Play Type** to start that play over (this does *not* erase previously recorded plays).

**Other controls:**
- **🔄 Switch** — swap which team is on offense. Only available on the first play of the 1st half, the first play of the 2nd half, or in overtime.
- **🔔 End Qtr** — ends the current quarter (asks you to confirm to prevent accidental double-taps). Q3 automatically flips possession to the team that didn't start Q1. At the end of Q4, if tied, it offers **overtime**.
- **📝 Log** — show/hide the play-by-play list.

---

## 8. Scoring & Special Situations

- **Touchdown (6):** recorded automatically when a play reaches the end zone. You're then prompted for the **extra point**.
- **Extra point:** choose **1 or 2 points**, then the method (kick / set play), then the result. Enter the kicker/player number so it's credited.
- **Field goal (3):** pick Field Goal → result. Short/blocked/returned outcomes are supported.
- **Safety (2):** handled per your season rules; after a safety, play goes to a **free kick** for the team that was on offense.
- **Overtime:** teams start **1st & goal at the 10**, 4 downs to score (FG allowed). Use **Switch** if the other team should start.
- **Onside kick:** In the **2nd half**, a **trailing team** that just scored can elect an onside — they keep the ball with a **4th & 20 from their own 20** (one shot to gain 20+). The **🎯 Onside** button only appears right after a trailing team scores and disappears after that play.

> **Note on sacks:** Per high school/college rules, a sack is charged as **negative rushing yards** for the QB (not lost passing yards).

---

## 9. Fixing Mistakes (Undo & Edit)

- **↩️ Undo** (during a game): removes the **last recorded play** and restores the previous down, distance, ball position, and score. Use this if a play was entered wrong.
- **Fix a jersey number (✏️):** if a player number was mis-entered, tap the **✏️** next to a play — either in the live **📝 Log** or on a finished game's **Summary** — and correct the number. Stats update automatically. (Play type, result, and yards can't be edited after the fact, since they drive the game flow — use Undo for those during the game.)

---

## 10. Game History & Box Score

From the season dashboard, tap **📊 Game History**:

- **Resume** an in-progress game.
- **🏁 End Game** — mark an unfinished game as final.
- **🗑️ Delete** — remove a game and all its plays.
- **Summary** (on finished games) — view the full box score.

**On the Summary screen:**
- Scoreboard and game info.
- **📄 Download / Print Box Score** — opens a printable, detailed box score (passing, rushing, receiving, flag pulls, sacks, interceptions, punting, punt returns, kicking, scoring). Filter by quarter or full game.
- **📤 Export for MaxPreps (.txt)** — see next section.
- **Play-by-Play** list (tap ✏️ to fix a jersey number).

---

## 11. Exporting to MaxPreps

On a finished game's **Summary**, tap **📤 Export for MaxPreps (.txt)**.

- The first time, you'll be asked for your **32-character MaxPreps Stat Supplier ID** (it's remembered on your device). Leave it blank to produce an unaccredited file.
- A file named `maxpreps_<opponent>_<date>.txt` downloads.
- The file is **pipe-delimited** and contains **only that game's stats**, one line per jersey number, in MaxPreps' required format.

Then upload/import that `.txt` into MaxPreps.

> **Jersey match:** MaxPreps treats "02" and "2" as different. Make sure your jersey numbers here match your MaxPreps roster exactly.

---

## 12. Live Spectator View (for Parents)

Parents can watch plays as they happen — **no account needed**.

**Coach: share the link**
1. On the Home screen, open **📺 Share with Parents**.
2. **📋 Copy Link** and share it with your team (e.g. in your team's group chat or Facebook group). The link looks like `https://your-app.com/watch?code=abcd2345`.
3. **🔄 New Code** generates a fresh link if the old one should stop working.

**Parents: watch**
- Open the link. They'll see a **football field** with the ball, down & distance, score, possession, and each play with the player names/numbers involved.
- **🔴 Live** updates automatically every few seconds.
- **▶️ Replay a Game** lets them pick a finished game and watch it unfold play-by-play (auto-advances every 10 seconds), with **Pause/Resume** and Prev/Next. At the end, a **Win/Loss** celebration appears.
- **Exit** shows a friendly "Thank you for watching" screen.

> Player names are shown on the watch page, so share the link with your team community only.

**On Facebook:** you can post the watch link in your team's Facebook group and parents tap to open it in their browser. (Facebook can't embed the live view directly inside a post.)

---

## 13. Account Security & Password Reset

**Set a security question** (needed to reset your own password):
- On the Home screen, open **🔐 Account Security**, pick a question, enter the answer, and save. (New accounts set this at signup; older accounts can add it here.)

**Forgot your password?**
1. On the login screen, tap **Forgot password?**
2. Enter your team login code — the app shows your security question.
3. Answer it and set a new password.

**Can't log in at all?** Use the **📧 Contact admin** form on the login screen to send a message; the admin can reset you.

---

## 14. Offline Use

The app is built to survive losing signal during a game (e.g. a field with no cell service):

- **Set up and start the game while you have a connection** (WiFi or hotspot).
- You can then track the whole game **offline** — the score, downs, and field position update instantly on the device.
- Plays recorded offline are **saved on the device** and sync automatically when you're back online (on reconnect, on next login, and on a periodic retry).
- A yellow banner shows **"⚠️ N plays not yet synced — tap to retry"** so you always know the true state. It clears once everything uploads.

> **Tip:** Load and log in once while connected before heading to a no-signal field, so your roster and game are ready on the device.

---

## 15. Installing as an App

You can add Flag Stats to your home screen so it launches like a native app:

- **iPhone/iPad (Safari):** Share button → **Add to Home Screen**.
- **Android (Chrome):** menu (⋮) → **Install app** / **Add to Home screen**.

It installs as **"Flag Stats"** with its own icon. It also works offline as described above.

> After a new version is deployed, do one clean reload (or reinstall) to pick up the latest code.

---

## 16. Admin Panel

The admin panel is for whoever runs the app (not regular coaches). Reach it by going to **`/admin`** on the site and entering the **admin key**.

From there you can:
- **👥 Teams** — list every team; **🔑 Reset Password** (set a new one for a team) or **🗑️ Delete Team** (removes it and all its data; type the name to confirm).
- **📨 Messages** — read help requests submitted from the login screen's contact form, with a reply link. Delete once handled.
- **🎟️ Invites** — **generate single-use invite codes** required for new teams to sign up; see which are used/available; revoke unused ones.

---

## 17. Quick Reference

| I want to… | Where |
|---|---|
| Create a team | Login screen → **Create Account** (needs invite code) |
| Add players | Season dashboard → **👥 Players** (or Bulk Import) |
| Set league rules | Season dashboard → **📋 Rules** |
| Start a game | Season dashboard → **🏈 Start New Game** |
| Undo a wrong play | Live game → **↩️ Undo** |
| Fix a jersey number | Play log or Summary → **✏️** on the play |
| End a quarter / game | Live game → **🔔 End Qtr** |
| Resume a game | Home screen **Resume**, or History → **Resume** |
| See the box score | Game History → **Summary** → **📄 Download / Print** |
| Export to MaxPreps | Game Summary → **📤 Export for MaxPreps (.txt)** |
| Share with parents | Home → **📺 Share with Parents** → copy link |
| Reset my password | Login → **Forgot password?** |
| Manage teams / invites | Go to **/admin** with the admin key |

---

*Flag Stats — built for tracking live flag football and sharing it with your team. 🏈*
