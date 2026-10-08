// At-bat bar extras: the batter in your other saved games, and career vs the pitcher.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tick } = require('./helpers/app');

// Save a finished game where the away leadoff hitter had the given hits
function saveGame(w, id, name, hits){
  const G = JSON.parse(JSON.stringify(w.G));
  G.lineup.away[0].name = name;
  Object.assign(G.lineup.away[0].hits, hits);
  G.log = [{ tag: 'Final', text: 'FINAL' }];
  w.localStorage.setItem(w.GM_GAME_PREFIX + id, JSON.stringify({ G, teamAway: 'New York Yankees', teamHome: 'Tampa Bay Rays' }));
  const index = w.gmGetIndex(); index.push({ id, away: 'New York Yankees', home: 'Tampa Bay Rays', savedAt: '2026-10-0' + index.length }); w.gmSaveIndex(index);
}

function setup(t){
  const w = loadApp();
  t.after(() => w.close());
  w.document.getElementById('teamAway').value = 'New York Yankees';
  w.document.getElementById('teamHome').value = 'Tampa Bay Rays';
  w.G.lineup.away[0].name = 'Aaron Judge';
  w.G.pitchers.home[0].name = 'Drew Rasmussen';
  return w;
}
const extra = w => (w.document.querySelector('#atbatBar .atbat-extra') || {}).textContent || '';

test('shows how the batter hit in your other saved games (not this one)', (t) => {
  const w = setup(t);
  saveGame(w, 'a', 'Aaron Judge', { s: 1, hr: 1, ks: 2 });        // 2-for-4, HR
  saveGame(w, 'b', 'Aaron Judge', { d: 1, go: 2, bb: 1 });        // 1-for-3, BB
  w.recordHit(1); w.addBall(); w.renderAtBatBar();                 // today's single isn't counted here
  w.G.awayBatter = 0; w.renderAtBatBar();
  assert.match(extra(w), /Your scorecards: 3-for-7 · 1 HR · 1 BB · 2 games/);
});

test('no saved games for the batter: no line', (t) => {
  const w = setup(t);
  w.renderAtBatBar();
  assert.equal(extra(w), '');
});

test('career vs the pitcher on the mound comes from MLB, once per matchup', async (t) => {
  const w = setup(t);
  w.ROSTERS.away = [{ id: 592450, name: 'Aaron Judge' }];
  w.ROSTERS.home = [{ id: 669373, name: 'Drew Rasmussen' }];
  const calls = [];
  w.fetch = url => {
    calls.push(url);
    const body = { stats: [{ type: { displayName: 'vsPlayerTotal' }, splits: [{ stat: { plateAppearances: 17, atBats: 15, hits: 7, homeRuns: 2, baseOnBalls: 2, strikeOuts: 5 } }] }] };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
  w.renderAtBatBar();
  await tick(); await tick();
  assert.match(extra(w), /vs D\. Rasmussen: 7-for-15 · 2 HR · 2 BB/);
  w.renderAtBatBar(); w.renderAtBatBar();
  assert.equal(calls.filter(u => /vsPlayer/.test(u)).length, 1, 'asked MLB once');
  assert.match(calls[0], /people\/592450\/stats\?stats=vsPlayer&opposingPlayerId=669373/);
});
