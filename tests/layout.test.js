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
  assert.equal(away.getAttribute('onchange'), 'onTeamChange()');
  w.onTeamChange();                                     // jsdom here doesn't run inline handlers
  assert.equal(w.team('away'), 'New York Yankees');
  assert.match(w.document.querySelector('#row-away img').getAttribute('src'), /147\.svg$/, 'box score shows the logo');
  w.recordHit(1); w.renderScore(); w.renderAll();
  const again = w.document.getElementById('teamAway');
  assert.equal(again, away, 'the same picker element, moved back in');
  assert.equal(again.value, 'New York Yankees', 'keeps its team');
  assert.ok(w.document.querySelector('#scoreTable #row-away #teamAway'), 'still in the box score');
  assert.equal(w.document.querySelectorAll('#teamAway').length, 1, 'only one');
});

test('dark mode shows the dark-background team logos, including ones drawn later; printing switches back', async (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const away = w.document.getElementById('teamAway');
  away.value = 'New York Yankees'; w.onTeamChange();
  const logo = () => w.document.querySelector('#row-away img').getAttribute('src');
  assert.equal(logo(), 'https://www.mlbstatic.com/team-logos/147.svg', 'light mode: regular logo');

  w.matchMedia = () => ({ matches: true, addEventListener(){}, removeEventListener(){} });   // switch to dark
  w.fixLogosIn(w.document.body);
  assert.equal(logo(), 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/147.svg');
  w.renderScore();                                        // redrawn: the new image follows along
  await new Promise(r => setTimeout(r, 0));
  assert.equal(logo(), 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/147.svg', 'after a redraw');

  w.dispatchEvent(new w.Event('beforeprint'));
  assert.equal(logo(), 'https://www.mlbstatic.com/team-logos/147.svg', 'printing: regular logo for white paper');
  w.dispatchEvent(new w.Event('afterprint'));
  assert.equal(logo(), 'https://www.mlbstatic.com/team-logos/team-cap-on-dark/147.svg', 'back after printing');
  w.document.querySelectorAll('img[src*="league-on-light"]').forEach(i => assert.ok(!/cap-on-dark/.test(i.src)));
});

test('Bases card: Full field draws the home park\'s wall and signs; the choice is remembered; no home team, no toggle', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const toggle = () => w.document.getElementById('fieldToggle');
  assert.equal(toggle().children.length, 0, 'no home team: infield only, no toggle');

  const home = w.document.getElementById('teamHome');
  home.value = 'Boston Red Sox'; w.onTeamChange();
  assert.equal(toggle().children.length, 2, 'toggle shown once there is a home park');
  w.setFieldView('full');
  const svg = w.document.querySelector('#infield svg');
  assert.equal(svg.getAttribute('aria-label'), 'Field');
  const signs = [...svg.querySelectorAll('text')].map(x => x.textContent);
  for(const n of ['310', '420', '302']) assert.ok(signs.includes(n), 'Fenway sign ' + n);
  assert.equal(w.localStorage.getItem('baseball_scorecard_field_view'), 'full', 'remembered');

  w.toggleBase(2);                                       // runners still work at this scale
  assert.ok(w.G.bases[1], 'runner on second');
  assert.equal(w.document.querySelectorAll('#infield .if-base').length, 3);

  w.setFieldView('infield');
  assert.equal(w.document.querySelector('#infield svg').getAttribute('aria-label'), 'Infield');
  for(const name of Object.keys(w.FIELD_WALLS)){
    const f = w.FIELD_WALLS[name];
    assert.ok(f.w.length >= 3 && f.w[0][0] < 0 && f.w.at(-1)[0] > 0, name + ': wall runs left pole to right pole');
  }
});
