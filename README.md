# Baseball Scorecard

A live baseball scorecard for the browser, built for scoring MLB games pitch by pitch at the
ballpark or on TV. It installs to an iPad or phone home screen and works offline.

**Live:** https://krburchel.github.io/baseballscorecard/

## What it does

- **Score every pitch and play:** balls, strikes and fouls; hits, outs (F8, 6-3, double plays,
  fielder's choices, errors, sacrifices); walks, HBP, catcher's interference and strikeouts looking or swinging;
  steals, caught stealing, wild pitches, passed balls, balks, and runners put out on the bases.
- **ABS challenges**, including overturns that change the outcome of an at-bat.
- **Scorecard grid:** batters by innings, with a diamond for every plate appearance (result,
  bases reached, out number). Tap a cell to correct it.
- **Full stat lines:** batting (AB, R, H, RBI, BB, K, SB) and pitching (IP, H, R, ER, BB, K, HR,
  pitches-strikes), runners in scoring position, and left on base. Runs are charged to the
  pitcher who allowed the runner.
- **MLB integration (MLB Stats API):** load today's games and lineups; **Check vs MLB** compares
  your scorecard with MLB's official play-by-play (plays, pitching lines, runs and errors) and fixes differences with a tap; **Catch up**
  fills in plays you missed and moves the game to MLB's current batter and count.
- **Season stats** across every saved game, filtered by team, games attended, and game type.
- **Postseason series** at the top of My Games: saved playoff games grouped by round and teams,
  with the series score (e.g. "Yankees lead 2–1"), each game a tap away, and gaps marked
  "not scored".
- **Sharing and saving:** a share-ready final image, a PDF scorecard, My Games, game files,
  backups of every game with a reminder (on a synced device, games in the cloud count as backed
  up), and offline use (service worker).
- **Sync across devices** (Firebase): sign in once per device and My Games, season stats and
  backups are the same everywhere. Each device still saves locally first and works offline.

## Running it locally

There is no build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

Pushing to `main` deploys to GitHub Pages.

## Code layout

`index.html` holds the markup; `css/app.css` the styles. The JavaScript is split by feature into
plain scripts that share one global scope and load in this order:

| File | What's in it |
| --- | --- |
| `js/data.js` | Positions, MLB teams and ids, logos, ballparks and stadium photos, postseason rounds |
| `js/game.js` | Game state and schema migrations, undo, plate-appearance records, run charging, pitch and play-log basics |
| `js/scoring.js` | Scoring actions: pitches, hits, outs, baserunning, ABS, innings, walk-offs |
| `js/render.js` | Score strip, at-bat bar, play log, lineups, count, outs, infield, pitchers, pitching-line editor |
| `js/scorecard.js` | The scorecard grid, its cell editor, the inning popover |
| `js/mlb.js` | Today's games and lineups, Check vs MLB, catch-up |
| `js/storage.js` | Autosave, My Games, game info, file export/import, reset, backups |
| `js/reports.js` | PDF box score, Share final image, season stats, team pickers, stadium photo |
| `js/firebase-config.js` | Firebase project settings for sync (public by design) |
| `js/sync.js` | Sync: sign-in, uploading changed games, applying other devices' changes, conflict copies |
| `js/ui.js` | Dialogs, keyboard shortcuts, event delegation, wake lock, startup (loads last) |

Code that runs while a file loads may only use things defined in the same or an earlier file.
`sw.js` lists every file to cache for offline use; add new files there and bump `CACHE`.

When a saved game's shape changes, add the default to `migrateGame` (in `js/game.js`) so older
games and backups keep loading.

## Sync (Firebase)

Games are stored at `users/{uid}/games/{gameId}` in Firestore, one document per game (the saved
game as JSON plus a summary). `firestore.rules` lets each user read and write only their own
games and accepts an update only if it's newer than the stored one; deletions are stored as
`{ deleted: true }`. When an older edit loses, the app keeps it in My Games as a copy (left out
of season stats).

Setup: create a Firebase project with Firestore and Email/Password sign-in (turn off public
sign-ups and add the account in the console), paste `firestore.rules` into Firestore → Rules,
add the site's domain to Authentication → Authorized domains, and put the web app's
`firebaseConfig` in `js/firebase-config.js`. The Firebase compat libraries are bundled in
`js/vendor/firebase` (Apache 2.0) and load only on signed-in devices.

## Tests

```sh
npm install
npm test
```

The tests load the real `index.html` and scripts into jsdom, with MLB data served from
`tests/fixtures` (no network):

- `tests/mlb-games.test.js` catches up all four ALDS Game 1s of Oct 3, 2026 from an empty
  scorecard and checks the result against MLB: zero Check vs MLB differences (errors included), team RISP and
  left on base, the score, and every batter's and pitcher's line. ALDS Game 2 (Yankees–Rays,
  Oct 5, saved mid-game) checks that every kind of error is counted.
- `tests/scoring.test.js` covers the hand-scoring rules (ABS overturns, reaching on an error,
  double plays, catcher's interference, outs on the bases, counts kept on runner outs, RISP, innings pitched,
  inherited runners, Undo, the cell editor, and loading older saved games).

- `tests/sync.test.js` runs two simulated devices against an in-memory Firebase: games
  appearing on the other device, following a game being scored elsewhere, deletions,
  offline changes uploading later, the newer-wins-plus-copy conflict rule, and the backup
  reminder standing down for games already in the cloud.
- `tests/series.test.js` covers the postseason series view (grouping, series score, clinching,
  games not scored) and `tests/reports.test.js` the postseason logos.

The tests also run on every push (GitHub Actions).

## Credits

- Game data, lineups and team logos: [MLB Stats API](https://statsapi.mlb.com) and mlbstatic.com.
- Stadium photos: each ballpark's lead photo on Wikipedia / Wikimedia Commons, credited in the
  app with the photographer and license.
