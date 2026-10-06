// The team pickers live in the box score's team cells and survive its redraws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app');

test('team pickers sit in the box score, keep their team through redraws, and change the game', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const away = w.document.getElementById('teamAway');
  assert.ok(w.document.querySelector('#scoreTable #row-away #teamAway'), 'away picker in the away row');
  assert.ok(w.document.querySelector('#scoreTable #row-home #teamHome'), 'home picker in the home row');

  away.value = 'New York Yankees';
  away.dispatchEvent(new w.Event('change'));
  assert.equal(w.team('away'), 'New York Yankees');
  w.recordHit(1); w.renderScore(); w.renderAll();
  const again = w.document.getElementById('teamAway');
  assert.equal(again, away, 'the same picker element, moved back in');
  assert.equal(again.value, 'New York Yankees', 'keeps its team');
  assert.ok(w.document.querySelector('#scoreTable #row-away #teamAway'), 'still in the box score');
  assert.equal(w.document.querySelectorAll('#teamAway').length, 1, 'only one');
});
