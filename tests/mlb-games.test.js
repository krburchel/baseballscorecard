// Real games: catch each ALDS Game 1 (Oct 3, 2026) up from an empty scorecard and
// compare the result with MLB's official play-by-play and box score.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadMlbGame, tick, GAMES, same } = require('./helpers/app');

// MLB's "Team RISP" / "Team LOB" lines from the box score
function mlbTeamInfo(feed, side){
  const out = {};
  (feed.liveData.boxscore.teams[side].info || []).forEach(b => (b.fieldList || []).forEach(f => {
    if(f.label === 'Team RISP') out.risp = f.value.replace(/\.$/, '');
    if(f.label === 'Team LOB') out.lob = Number(f.value.replace(/\.$/, ''));
  }));
  return out;
}

for(const gamePk of GAMES){
  test('game ' + gamePk + ': catch-up from an empty scorecard matches MLB', async (t) => {
    const w = loadApp();
    t.after(() => w.close());
    const feed = await loadMlbGame(w, gamePk);
    const label = w.team('away') + ' @ ' + w.team('home');

    assert.equal(w.G.pas.length, 0, 'starts empty');
    w.mlbCatchUp();
    await tick();

    await t.test('every plate appearance, pitching line and inning matches (Check vs MLB finds 0 differences)', () => {
      const d = w.mlbDiffs(feed);
      assert.equal(d.behind, 0, label + ': nothing left to catch up');
      same(d.plays.map(x => x.type + ' ' + x.half + x.inn), [], label + ': play differences');
      same(d.pitchers.map(x => x.mlb.name), [], label + ': pitcher differences');
      same(d.runs.map(x => x.side + ' ' + x.inn), [], label + ': run differences');
      assert.ok(w.G.log.some(l => l.tag === 'Final'), label + ': marked FINAL');
    });

    await t.test('team RISP and left on base equal MLB\'s box score', () => {
      for(const side of ['away', 'home']){
        const mlb = mlbTeamInfo(feed, side), r = w.rispLine(side);
        assert.equal(r.h + '-for-' + r.ab, mlb.risp, label + ' ' + side + ' RISP');
        assert.equal(w.teamLOB(side), mlb.lob, label + ' ' + side + ' LOB');
      }
    });

    await t.test('score matches MLB', () => {
      const ls = feed.liveData.linescore.teams;
      same([w.G.rhe.away[0], w.G.rhe.home[0]], [ls.away.runs, ls.home.runs]);
      same([w.G.rhe.away[1], w.G.rhe.home[1]], [ls.away.hits, ls.home.hits]);
    });

    await t.test('every batter and pitcher line equals MLB\'s box score (season stats over this game)', () => {
      w._ss.team = 'all'; w._ss.attended = 'all'; w._ss.type = 'all';
      const games = w.ssGames();
      const bat = w.ssBatting(games), pit = w.ssPitching(games);
      for(const side of ['away', 'home']){
        const tm = side === 'away' ? w.team('away') : w.team('home');
        for(const p of Object.values(feed.liveData.boxscore.teams[side].players)){
          const name = p.person.fullName, key = w.mlbNormName(name);
          const b = p.stats.batting, q = p.stats.pitching;
          if(b && b.plateAppearances){
            const a = bat.find(r => r.team === tm && w.mlbNormName(r.name) === key);
            assert.ok(a, name + ' is in the batting stats');
            same([a.ab, a.h, a.r, a.hr, a.rbi, a.bb, a.k, a.sb], [b.atBats, b.hits, b.runs, b.homeRuns, b.rbi, b.baseOnBalls, b.strikeOuts, b.stolenBases], name + ' AB H R HR RBI BB K SB');
          }
          if(q && q.numberOfPitches){
            const a = pit.find(r => r.team === tm && w.mlbNormName(r.name) === key);
            assert.ok(a, name + ' is in the pitching stats');
            same([w.fmtIP(a.outs), a.h, a.r, a.er, a.bb, a.k, a.pitches], [q.inningsPitched, q.hits, q.runs, q.earnedRuns, q.baseOnBalls, q.strikeOuts, q.numberOfPitches], name + ' IP H R ER BB K P');
          }
        }
      }
    });
  });
}

test('catch-up continues from a hand-scored start and ends mid at-bat on MLB\'s batter and count', async (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const full = await loadMlbGame(w, 849835);   // Yankees @ Rays

  // Hand-score the first 14 plate appearances with the scoring buttons
  const m = w.mlbPlays(full);
  const seq = Object.keys(m.halves).map(Number).sort((a, b) => a - b).flatMap(o => m.halves[o]);
  for(const e of seq.slice(0, 14)){
    if(e.side === 'away') w.G.awayBatter = e.slot; else w.G.homeBatter = e.slot;
    const r = e.res, fd = (r.match(/\d/g) || []).map(Number);
    if(/^(1B|2B|3B|HR)/.test(r)){ w.recordHit({ '1B':1, '2B':2, '3B':3, 'HR':4 }[r.slice(0, 2)]); if(w.document.getElementById('rpOverlay')) w.rpAutoAdvance(); }
    else if(r === 'K') w.recordKO('swinging');
    else if(r === 'ꓘ') w.recordKO('looking');
    else if(r === 'BB'){ w.G.balls = 3; w.addBall(); }
    else if(/^F\d/.test(r)){ w.outState.type = 'fly'; w.outState.fielder = fd[0]; w.recordOut(); }
    else if(/^G\d/.test(r)){ w.outState.type = 'ground'; w.outState.fielder = fd[0]; w.outState.throwTo = fd[1] || null; w.recordOut(); }
  }
  assert.equal(w.G.pas.length, 14);

  // MLB "live": the feed cut off three pitches into play 41
  const cut = JSON.parse(JSON.stringify(full));
  const plays = cut.liveData.plays.allPlays.slice(0, 41), live = plays[40], prev = plays[39];
  live.about.isComplete = false; live.result = { type: 'atBat' };
  live.count = { balls: 2, strikes: 1, outs: prev.about.halfInning === live.about.halfInning ? prev.count.outs : 0 };
  delete live.matchup.postOnFirst; delete live.matchup.postOnSecond; delete live.matchup.postOnThird;
  live.runners = [];
  cut.liveData.plays.allPlays = plays;
  cut.gameData.status = { abstractGameState: 'Live', detailedState: 'In Progress' };
  w._mlb = { feed: cut, fetchedAt: Date.now() };

  const adds = w.mlbCatchUpCount(cut);
  w.mlbCatchUp();
  await tick();

  assert.equal(w.G.pas.length, 14 + adds, 'adds only what was missing');
  const side = w.batting();
  assert.equal(w.curName(side, w.abIdx(side)), live.matchup.batter.fullName, 'current batter');
  const fSide = side === 'away' ? 'home' : 'away';
  assert.equal(w.G.pitchers[fSide][w.activePIdx(fSide)].name, live.matchup.pitcher.fullName, 'current pitcher');
  same([w.G.balls, w.G.strikes], [2, 1], 'count');
  assert.equal(w.G.inning, live.about.inning, 'inning');
  assert.ok(!w.G.log.some(l => l.tag === 'Final'), 'not final');

  w.undoAction();
  assert.equal(w.G.pas.length, 14, 'one Undo reverses the whole catch-up');
});
