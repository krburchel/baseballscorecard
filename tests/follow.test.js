// Follow MLB: keeps the scorecard caught up with MLB's play-by-play while watching.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, loadMlbGame, readJSON, tick } = require('./helpers/app');

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
