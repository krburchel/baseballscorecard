// Postseason series view at the top of My Games: saved postseason games grouped
// by year, round and teams, with the series score from finished games.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, same } = require('./helpers/app');

const NYY = 'New York Yankees', TB = 'Tampa Bay Rays', LAD = 'Los Angeles Dodgers', PHI = 'Philadelphia Phillies';

// Save a game to My Games directly: teams, score, round, game number, finished or not
function saveGame(w, id, { away, home, as, hs, type, num, date = '2026-10-04', final = true }){
  const G = JSON.parse(JSON.stringify(w.G));
  G.rhe = { away: [as, 0, 0], home: [hs, 0, 0] };
  G.log = [final ? { tag: 'Final', text: 'FINAL' } : { tag: 'Play', text: 'single' }];
  Object.assign(G.notes, { gameType: type, seriesGame: num ? String(num) : '', date });
  w.localStorage.setItem(w.GM_GAME_PREFIX + id, JSON.stringify({ G, teamAway: away, teamHome: home }));
  const index = w.gmGetIndex();
  index.push({ id, away, home, awayScore: as, homeScore: hs, date, status: final ? 'Final' : 'T5', plays: 1 });
  w.gmSaveIndex(index);
}

test('postseason games are grouped into series with the series score', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  saveGame(w, 'g1', { away: TB, home: NYY, as: 3, hs: 5, type: 'alds', num: 1, date: '2026-10-03' });
  saveGame(w, 'g2', { away: TB, home: NYY, as: 4, hs: 2, type: 'alds', num: 2, date: '2026-10-04' });
  saveGame(w, 'g3', { away: NYY, home: TB, as: 6, hs: 1, type: 'alds', num: 3, date: '2026-10-06' });
  saveGame(w, 'n1', { away: PHI, home: LAD, as: 2, hs: 7, type: 'nlds', num: 1, date: '2026-10-04' });
  saveGame(w, 'r1', { away: NYY, home: TB, as: 1, hs: 0, type: 'regular', date: '2026-07-04' });

  const list = w.psSeriesList();
  same(list.map(s => s.label), ['2026 ALDS', '2026 NLDS'], 'one card per series, newest first; regular season left out');
  const alds = list[0];
  same(alds.games.map(g => g.id), ['g1', 'g2', 'g3'], 'home and away flip within the series');
  assert.equal(w.psSeriesStatus(alds), 'Yankees lead 2–1');
  assert.equal(w.psSeriesStatus(list[1]), 'Dodgers lead 1–0');
  saveGame(w, 'n2', { away: PHI, home: LAD, as: 1, hs: 1, type: 'nlds', num: 2, date: '2026-10-05', final: false });
  assert.equal(w.psSeriesStatus(w.psSeriesList()[1]), 'Dodgers lead 1–0', 'a game still in progress doesn\'t make the score uncertain');

  saveGame(w, 'g4', { away: NYY, home: TB, as: 3, hs: 2, type: 'alds', num: 4, date: '2026-10-07' });
  assert.equal(w.psSeriesStatus(w.psSeriesList()[0]), 'Yankees win 3–1', 'three wins in a best-of-five clinches');
});

test('gaps and unfinished games are shown honestly', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  saveGame(w, 'g1', { away: TB, home: NYY, as: 3, hs: 5, type: 'alds', num: 1 });
  saveGame(w, 'g3', { away: NYY, home: TB, as: 1, hs: 4, type: 'alds', num: 3 });
  saveGame(w, 'g4', { away: NYY, home: TB, as: 2, hs: 2, type: 'alds', num: 4, final: false });
  const s = w.psSeriesList()[0];
  assert.equal(w.psSeriesStatus(s), 'Tied 1–1 in games you scored', 'Game 2 is missing, so it may not be the real score');
  const html = w.psSeriesHtml();
  assert.match(html, /G2 · not scored/);
  assert.match(html, /G1 · Yankees 5–3/);
  assert.match(html, /G4 · Yankees 2, Rays 2 · unfinished/);
});

test('My Games shows the series section, uses the official logo, and opens a game from it', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  saveGame(w, 'g1', { away: TB, home: NYY, as: 3, hs: 5, type: 'alds', num: 1 });
  w.showGameManager();
  const section = w.document.querySelector('#gmOverlay .ps-series-wrap');
  assert.ok(section, 'Postseason section is shown');
  assert.match(section.querySelector('.ps-series-logo').getAttribute('src'), /assets\/postseason\/alds-2026\.png/);
  // jsdom here doesn't run inline handlers: check the button's, then run it
  const onclick = section.querySelector('button.ps-game').getAttribute('onclick');
  assert.equal(onclick, "gmLoadGame('g1')");
  w.eval(onclick);
  assert.equal(w.gmGetActiveId(), 'g1', 'tapping a game opens it');
  same([w.G.rhe.away[0], w.G.rhe.home[0]], [3, 5]);
});

test('no postseason games: no series section', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  saveGame(w, 'r1', { away: NYY, home: TB, as: 1, hs: 0, type: 'regular' });
  assert.equal(w.psSeriesHtml(), '');
});
