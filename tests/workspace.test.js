const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tick } = require('./helpers/app');

test('workspace views retain the game and support keyboard navigation without changing innings', async t => {
  const w = loadApp(); t.after(() => w.close());
  w.addBall();
  w.setWorkspaceView('lineups');
  assert.equal(w.document.getElementById('scoringPanel').hidden, true);
  assert.equal(w.document.getElementById('lineupsPanel').hidden, false);
  const tab = w.document.getElementById('tab-lineups');
  tab.dispatchEvent(new w.KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
  assert.equal(w.document.getElementById('tab-notes').getAttribute('aria-selected'), 'true');
  assert.equal(w.G.inning, 1, 'tab arrow does not trigger the inning shortcut');
  w.setWorkspaceView('live');
  assert.equal(w.G.balls, 1, 'count survives view changes');
  assert.equal(w.document.getElementById('scoringPanel').hidden, false);
  await tick(20);
  assert.match(w.document.getElementById('boardStatus').textContent, /SCORING IN PROGRESS/);
});

test('scoreboard reflects scoring, undo, game notes, and imported team selections', t => {
  const w = loadApp(); t.after(() => w.close());
  w.document.getElementById('teamAway').value = 'Seattle Mariners';
  w.document.getElementById('teamHome').value = 'Boston Red Sox';
  w.onTeamChange();
  assert.match(w.document.getElementById('matchup').textContent, /Seattle Mariners/);
  assert.equal(w.document.getElementById('setupTip').hidden, true);
  w.recordHit(4);
  assert.match(w.document.querySelector('.matchup-score').textContent, /1:0/);
  w.undoAction();
  assert.match(w.document.querySelector('.matchup-score').textContent, /0:0/);
  w.document.getElementById('giVenue').value = 'Fenway Park';
  w.saveNotes();
  assert.equal(w.document.getElementById('boardVenue').textContent, 'Fenway Park');
});

test('out indicators work with the keyboard and announce their state', t => {
  const w = loadApp(); t.after(() => w.close());
  const out = w.document.getElementById('o0');
  // Outside-only jsdom does not execute inline click handlers.
  out.onclick = () => w.toggleOut(0);
  out.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Enter',bubbles:true}));
  assert.equal(w.G.outs, 1);
  assert.equal(out.getAttribute('aria-pressed'), 'true');
});
