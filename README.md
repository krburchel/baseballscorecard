# baseballscorecard

A single-file baseball scorecard web app. The entire app — markup, styles, and
logic — lives in [`index.html`](index.html); just open it in a browser.

## Tests

The game-logic and schema-migration code is covered by a small
[Vitest](https://vitest.dev/) suite. The tests load the real `index.html` into a
[jsdom](https://github.com/jsdom/jsdom) window (see
`test/helpers/loadApp.js`), so they exercise the shipped code directly with no
build step or refactor required.

```sh
npm install   # one-time
npm test      # run the suite once
npm run test:watch
```

Current coverage focuses on the highest-risk pure logic:

- **Scoring rules** (`test/game-logic.test.js`): base-running advancement,
  forced advances on walks, run/RBI crediting, substitution-aware stats, and
  game-end / walk-off detection.
- **Schema migrations** (`test/migrate.test.js`): `migrateGame()`, the single
  source of truth for loading older saved/imported games.
