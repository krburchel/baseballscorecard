// Follow MLB: keeps the scorecard caught up with MLB's play-by-play while watching.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadMlbGame, readJSON, tick, same } = require('./helpers/app');

function app(t){
  const w = loadApp();
  t.after(() => { w.clearTimeout(w._follow.timer); w.G.mlbFollow = null; w.close(); });
  return w;
}
const feedFetches = w => (w.fetchLog || []).filter(u => /\/feed\/live$/.test(u)).length;

test('catches the game up, then downloads the play-by-play again only when MLB has an update', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849839, '2026-10-05');
  w.mlbStamps = ['20261005_234153'];
  await w.startFollow();
  assert.ok(w.G.pas.length > 30, 'plays added');
  assert.equal(w.G.mlbFollow.device, w.followDevice(), 'this device is following');
  assert.equal(w.document.getElementById('followPill').textContent, '📡 Following MLB');
  assert.equal(feedFetches(w), 1);

  await w.followTick();
  assert.equal(feedFetches(w), 1, 'no new update at MLB: nothing downloaded');
  w.mlbStamps = ['20261005_234153', '20261005_234210'];
  await w.followTick();
  assert.equal(feedFetches(w), 2, 'MLB updated: downloaded again');
  assert.ok(w._follow.timer, 'next check scheduled');
});

test('moves the count of the at-bat in progress forward, never back', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849839, '2026-10-05');
  await w.startFollow();
  const feed = readJSON('feed-849839.json');
  const last = feed.liveData.plays.allPlays.at(-1);
  last.playEvents = [{ isPitch: true, details: { description: 'Ball' } }, { isPitch: true, details: { description: 'Called Strike' } }, { isPitch: true, details: { description: 'Ball' } }];
  last.count = { balls: 2, strikes: 1, outs: last.count.outs };
  w.followApply(feed);
  assert.deepEqual([w.G.balls, w.G.strikes], [2, 1], 'MLB ahead: count follows');
  w.G.balls = 3; w.G.strikes = 2;                              // the scorer is ahead of MLB's feed
  w.followApply(feed);
  assert.deepEqual([w.G.balls, w.G.strikes], [3, 2], 'scorer ahead: left alone');
});

test('waits while a dialog is open, and an Undo stops following so it sticks', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849839, '2026-10-05');
  const dlg = w.document.createElement('div'); dlg.className = 'rp-overlay'; w.document.body.appendChild(dlg);
  await w.startFollow();
  assert.equal(w.G.pas.length, 0, 'nothing changed while the dialog is open');
  dlg.remove();
  await w.followTick();
  assert.ok(w.G.pas.length > 30, 'caught up once it closed');

  w.undoAction();
  assert.equal(w.G.mlbFollow, null, 'stopped following');
  assert.equal(w.G.pas.length, 0, 'the catch-up was undone');
  assert.equal(w.document.getElementById('followPill').hidden, true);
});

test('a finished game: catches up, marks it final and stops following', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849830);
  await w.startFollow();
  assert.ok(w.G.log.some(l => l.tag === 'Final'), 'final');
  assert.equal(w.G.mlbFollow, null, 'stopped');
});

test('another device following: this one only shows it, and doesn\'t poll', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849839, '2026-10-05');
  w.G.mlbFollow = { device: 'Some other iPad', since: 1 };
  w.renderFollowPill();
  await w.followTick();
  assert.equal(feedFetches(w), 0, 'no downloads');
  assert.equal(w.document.getElementById('followPill').textContent, '📡 Following on Some other iPad');
});

// Regression: at an inning boundary MLB's live feed can briefly leave the
// previous half's runner on the new half's in-progress at-bat matchup. The
// scorecard must never show a fielding-team player on base (once seen as a
// Rays runner standing on base during a Guardians at-bat).
test('a runner stranded on the in-progress matchup from the half just ended never shows on base', async (t) => {
  const w = app(t);
  await loadMlbGame(w, 849839, '2026-10-05');     // Yankees @ Rays
  const feed = readJSON('feed-849839.json');
  const plays = feed.liveData.plays.allPlays;
  const clone = o => JSON.parse(JSON.stringify(o));

  // First top → bottom flip: home (Rays) start batting, away (Yankees) now field
  let flip = -1;
  for(let i = 1; i < plays.length; i++){
    if(plays[i - 1].about.halfInning === 'top' && plays[i].about.halfInning === 'bottom'){ flip = i; break; }
  }
  assert.ok(flip > 0, 'fixture has a top→bottom flip');

  const awayP = Object.values(feed.liveData.boxscore.teams.away.players)[0].person;  // a Yankee (fielding)
  const homeP = Object.values(feed.liveData.boxscore.teams.home.players).find(p => p.position && /[1-9]/.test(p.position.code || ''))?.person
             || Object.values(feed.liveData.boxscore.teams.home.players)[0].person;  // a Ray (batting)

  function snapshot(injectLeftover){
    const f = clone(feed);
    const p = f.liveData.plays.allPlays.slice(0, flip + 1);
    const cur = p[flip];
    cur.about.isComplete = false;                 // bottom-half at-bat in progress
    cur.result = { eventType: undefined };
    cur.matchup.postOnFirst = injectLeftover ? { id: awayP.id, fullName: awayP.fullName } : null;
    cur.matchup.postOnSecond = injectLeftover ? { id: homeP.id, fullName: homeP.fullName } : null;
    cur.matchup.postOnThird = null;
    f.liveData.plays.allPlays = p;
    return f;
  }

  w.mlbApplyCatchUp(snapshot(false));             // bottom half begins, bases empty
  assert.equal(w.G.half, 'bot', 'home team batting');
  same(w.G.bases, [null, null, null], 'no one on to start the half');

  w.mlbApplyCatchUp(snapshot(true));              // MLB leaves the previous half's runner on the matchup
  assert.ok(!w.G.bases.includes(awayP.fullName), 'the fielding-team runner is dropped, not shown on base');
  assert.equal(w.G.bases[1], homeP.fullName, 'a genuine batting-team runner is still kept');
});
