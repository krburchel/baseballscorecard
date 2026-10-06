// Hand-scoring rules, driven through the same functions the buttons call.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, same } = require('./helpers/app');

// A fresh app with an empty game; closed after the test
function fresh(t){
  const w = loadApp();
  t.after(() => w.close());
  return w;
}
const pa = (w, i) => w.G.pas[i < 0 ? w.G.pas.length + i : i];

test('strike three from the Strike button is a strikeout for batter and pitcher', (t) => {
  const w = fresh(t);
  w.addStrike(); w.addStrike(); w.addStrike();
  assert.equal(pa(w, -1).res, 'K');
  assert.equal(w.G.lineup.away[0].hits.ks, 1);
  assert.equal(w.G.pitchers.home[0].k, 1);
  assert.equal(w.G.outs, 1);
});

test('ABS: a ball overturned to strike three is a called strikeout', (t) => {
  const w = fresh(t);
  w.addStrike(); w.addStrike(); w.addBall();
  Object.assign(w.absState, { open: true, side: 'home', callType: 'ball', result: 'overturned' });
  w.absConfirm();
  assert.equal(pa(w, -1).res, 'ꓘ');
  assert.equal(w.G.outs, 1);
  same([w.G.pitchers.home[0].pitches, w.G.pitchers.home[0].balls], [3, 0], 'three pitches, no balls');
});

test('ABS: overturning ball four turns the walk into a strikeout; one Undo restores the walk', (t) => {
  const w = fresh(t);
  w.addBall(); w.addBall(); w.addBall(); w.addStrike(); w.addStrike();
  w.addBall();                                   // ball four: walk
  assert.equal(pa(w, -1).res, 'BB');
  Object.assign(w.absState, { open: true, side: 'home', callType: 'ball', result: 'overturned' });
  w.absConfirm();
  assert.equal(pa(w, -1).res, 'ꓘ');
  assert.equal(w.G.bases[0], null, 'no runner');
  assert.equal(w.G.outs, 1);
  w.undoAction();
  assert.equal(pa(w, -1).res, 'BB', 'walk is back');
  assert.ok(w.G.bases[0], 'runner is back on first');
});

test('reaching on an error: batter to first, counts an at-bat, run that scores is unearned', (t) => {
  const w = fresh(t);
  w.outState.type = 'error'; w.outState.fielder = 6; w.recordOut();
  const h = w.G.lineup.away[0].hits;
  assert.ok(w.G.bases[0], 'on first');
  same([h.roe, w.abFor(h)], [1, 1], 'reached on error is an at-bat');
  w.recordHit(4);                                // home run scores him
  const p = w.G.pitchers.home[0];
  same([p.r, p.er], [2, 1], 'the runner who reached on the error is unearned');
});

test('double play: the runner from first is retired before the batter (out 1, batter out 2)', (t) => {
  const w = fresh(t);
  w.recordHit(1);
  const runner = pa(w, 0);
  Object.assign(w.outState, { type: 'ground', fielder: 6, throwTo: 4, multiOut: 'dp' });
  w.recordOut();
  same([w.G.outs, w.G.bases], [2, [null, null, null]]);
  same([runner.out, runner.outOnBases, pa(w, -1).out], [1, true, 2]);
  assert.equal(w.G.pitchers.home[0].outs, 2);
});

test('out on the bases: runner thrown out advancing; the batter keeps his count', (t) => {
  const w = fresh(t);
  w.recordHit(2);                                // runner on second
  const runner = pa(w, 0);
  w.addBall(); w.addStrike();                    // next batter 1-1
  w.startRunnerOut();
  w.executeRunnerOut(2);                         // out at third
  same([w.G.outs, w.G.balls, w.G.strikes], [1, 1, 1], 'out recorded, count kept');
  same([runner.res, runner.reached, runner.out], ['2B', 2, 1], 'cell keeps the double, gets the out');
  assert.equal(w.G.pitchers.home[0].outs, 1);
  assert.equal(w.G.lineup.away[0].hits.cs, 0, 'not a caught stealing');
});

test('caught stealing keeps the batter\'s count', (t) => {
  const w = fresh(t);
  w.recordHit(1);
  w.addBall(); w.addBall(); w.addStrike();       // 2-1
  w.executeBRAction('cs', 0);
  same([w.G.outs, w.G.balls, w.G.strikes], [1, 2, 1]);
});

test('RISP: a steal of second during the at-bat makes it a RISP at-bat; walks are not at-bats', (t) => {
  const w = fresh(t);
  w.recordHit(1);
  w.recordKO('swinging');
  assert.equal(pa(w, -1).risp, false, 'runner only on first');
  w.executeBRAction('sb', 0);
  w.outState.type = 'fly'; w.outState.fielder = 8; w.recordOut();
  assert.equal(pa(w, -1).risp, true, 'after the steal');
  w.addBall(); w.addBall(); w.addBall(); w.addBall();
  w.recordHit(2); if(w.document.getElementById('rpOverlay')) w.rpAutoAdvance();
  const l = w.rispLine('away');
  assert.equal(l.h + '-for-' + l.ab, '1-for-2', 'flyout + double; the walk is not an at-bat');
});

test('innings pitched: each out goes to the pitcher on the mound', (t) => {
  const w = fresh(t);
  for(let i = 0; i < 4; i++) w.recordKO('swinging');   // 3 outs top 1, 1 out bottom 1
  assert.equal(w.fmtIP(w.G.pitchers.home[0].outs), '1.0');
  assert.equal(w.fmtIP(w.G.pitchers.away[0].outs), '0.1');
});

test('a reliever is not charged for a runner he inherited', (t) => {
  const w = fresh(t);
  w.recordHit(1);                                // starter allows a single
  w.addPitcher('home'); w.setActivePitcher('home', 1);
  w.recordHit(4);                                // reliever allows a homer
  const [starter, reliever] = w.G.pitchers.home;
  same([starter.r, starter.er, reliever.r, reliever.er], [1, 1, 1, 1]);
});

test('Undo after deleting a play-log entry restores the right log', (t) => {
  const w = fresh(t);
  w.recordHit(1); w.recordKO('swinging');
  const before = JSON.stringify(w.G.log);
  w.addBall();
  w.deleteLogLine(w.G.log.length - 1);           // delete the oldest entry (text only)
  const expected = JSON.parse(before).slice(0, -1);
  w.undoAction();                                // undo the ball
  same(w.G.log, expected, 'log as before the ball, minus the deleted entry');
});

test('earned runs: with two outs, a batter who reaches on an error ends the inning for earned-run purposes', (t) => {
  const w = fresh(t);
  w.recordKO('swinging'); w.recordKO('swinging');                    // 2 outs
  w.outState.type = 'error'; w.outState.fielder = 6; w.recordOut();  // should have been the 3rd out
  w.recordHit(4);                                                    // two-run homer
  const p = w.G.pitchers.home[0];
  same([p.r, p.er], [2, 0], 'both runs unearned (the old rule made the homer earned)');
});

test('earned runs: with one out, the reconstructed inning is not over, so the homer is earned', (t) => {
  const w = fresh(t);
  w.recordKO('swinging');                                            // 1 out
  w.outState.type = 'error'; w.outState.fielder = 6; w.recordOut();
  w.recordHit(4);
  const p = w.G.pitchers.home[0];
  same([p.r, p.er], [2, 1], 'runner who reached on the error unearned, batter earned');
});

test('earned runs: a reliever does not get the benefit of an error made before he came in', (t) => {
  const w = fresh(t);
  w.recordKO('swinging'); w.recordKO('swinging');
  w.outState.type = 'error'; w.outState.fielder = 6; w.recordOut();  // error under the starter
  w.addPitcher('home'); w.setActivePitcher('home', 1);
  w.recordHit(4);
  const [starter, reliever] = w.G.pitchers.home;
  same([starter.r, starter.er, reliever.r, reliever.er], [1, 0, 1, 1], 'inherited runner unearned to the starter; homer earned to the reliever');
});

test('play log: a result line is linked to its play; "Edit play" opens the scorecard editor', (t) => {
  const w = fresh(t);
  w.recordHit(2);
  const line = w.G.log.findIndex(e => /Double/.test(e.text));
  assert.equal(w.G.log[line].paId, w.G.pas[0].id, 'linked');
  w.logEditStart(line);
  assert.ok(w.document.querySelector('.log-edit-play'), 'Edit play button shown');
  w.logEditPlay(line);
  assert.ok(w.document.getElementById('peOverlay'), 'cell editor open');
  w.closePaEditor();
});

test('play log: deleting a result line can remove the play and its stats (and Undo brings the play back)', async (t) => {
  const w = fresh(t);
  w.recordHit(1); w.recordKO('swinging');
  const line = w.G.log.findIndex(e => /Single/.test(e.text));
  w.showConfirm = () => Promise.resolve(true);     // "Remove play"
  w.logEditDelete(line);
  await new Promise(r => setTimeout(r, 0));
  same([w.G.pas.map(p => p.res), w.G.lineup.away[0].hits.s, w.G.rhe.away[1], w.G.pitchers.home[0].h], [['K'], 0, 0, 0]);
  assert.ok(!w.G.log.some(e => /Single/.test(e.text)), 'line gone');
  w.undoAction();
  same(w.G.pas.map(p => p.res), ['1B', 'K'], 'play restored');
});

test('play log: "Just the log line" leaves the play alone', async (t) => {
  const w = fresh(t);
  w.recordHit(1);
  const line = w.G.log.findIndex(e => /Single/.test(e.text));
  w.showConfirm = () => Promise.resolve(false);
  w.logEditDelete(line);
  await new Promise(r => setTimeout(r, 0));
  same([w.G.pas.length, w.G.lineup.away[0].hits.s], [1, 1]);
  assert.ok(!w.G.log.some(e => /Single/.test(e.text)), 'only the line is gone');
});

test('cell editor: changing a flyout to a single moves the batter, pitcher and team stats', (t) => {
  const w = fresh(t);
  w.outState.type = 'fly'; w.outState.fielder = 8; w.recordOut();
  w.openPaEditor(0); w.peSet('t', '1B'); w.savePaEditor();
  const h = w.G.lineup.away[0].hits;
  same([h.fo, h.s, w.abFor(h), w.G.pitchers.home[0].h, w.G.rhe.away[1]], [0, 1, 1, 1, 1]);
  w.undoAction();                                // Undo restores a fresh copy of the game
  const back = w.G.lineup.away[0].hits;
  same([back.fo, back.s, w.G.rhe.away[1]], [1, 0, 0], 'back to the flyout');
});

test('saved games from older versions load with the new fields', (t) => {
  const w = fresh(t);
  const old = JSON.parse(JSON.stringify(w.G));
  delete old.pas; delete old.mlbKeep;
  old.pitchers.home.forEach(p => { delete p.outs; delete p.er; delete p.balls; });
  old.lineup.away.forEach(sl => { delete sl.hits.roe; });
  const g = w.migrateGame(old);
  assert.ok(Array.isArray(g.pas));
  assert.equal(typeof g.mlbKeep, 'object');
  same([g.pitchers.home[0].outs, g.pitchers.home[0].balls, g.lineup.away[0].hits.roe], [0, 0, 0]);
});

test("catcher's interference: batter to first, not an at-bat, an error on the catcher's team", (t) => {
  const w = fresh(t);
  w.recordHit(1);                                // runner on first
  w.addStrike(); w.addStrike();                  // 0-2, as with Liam Hicks in ALDS Game 2
  w.recordCI();
  const p = pa(w, -1), h = w.G.lineup.away[1].hits;
  assert.equal(p.res, 'CI');
  same([h.ci, w.abFor(h), w.G.rhe.home[2], w.G.rhe.away[1]], [1, 0, 1, 1], 'CI, no at-bat, one error, still one hit');
  assert.ok(w.G.bases[0] && w.G.bases[1] && !w.G.bases[2], 'batter on first, runner forced to second');
  same([w.G.pitchers.home[0].pitches, w.G.pitchers.home[0].bb], [4, 0], 'the pitch counts; not a walk');
  same([w.G.balls, w.G.strikes, w.G.awayBatter], [0, 0, 2], 'count reset, next batter up');
  assert.equal(w.paLabelClass('CI'), ' sc-err');
});

test("catcher's interference with the bases loaded: run scores, RBI, unearned", (t) => {
  const w = fresh(t);
  w.recordHBP(); w.recordHBP(); w.recordHBP();       // three hit batters: bases loaded
  assert.ok(w.G.bases.every(Boolean), 'bases loaded');
  w.recordCI();
  same([w.G.rhe.away[0], w.G.lineup.away[3].hits.rbi], [1, 1], 'run forced in, RBI to the batter');
  same([w.G.pitchers.home[0].r, w.G.pitchers.home[0].er], [1, 0], 'unearned');
});

test("the cell editor can change a result to catcher's interference and back", (t) => {
  const w = fresh(t);
  w.recordHit(1);
  w.openPaEditor(0); w.peSet('t', 'CI'); w.savePaEditor();
  const h = w.G.lineup.away[0].hits;
  same([pa(w, 0).res, h.s, h.ci, w.G.rhe.away[1], w.G.rhe.home[2]], ['CI', 0, 1, 0, 1]);
  w.openPaEditor(0); w.peSet('t', '1B'); w.savePaEditor();
  same([h.s, h.ci, w.G.rhe.away[1], w.G.rhe.home[2]], [1, 0, 1, 0]);
});

test('a passed ball moves the runner up but is not an error; a run scoring on it is unearned', (t) => {
  const w = fresh(t);
  w.recordHBP(); w.recordHBP(); w.recordHBP();          // bases loaded
  w.executeBRAction('pb', 2);                          // runner on third scores on a passed ball
  same([w.G.rhe.home[2], w.G.rhe.away[0]], [0, 1], 'no error; the run counts');
  same([w.G.pitchers.home[0].r, w.G.pitchers.home[0].er], [1, 0], 'unearned');
});
