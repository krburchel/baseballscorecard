// Scoring actions: pitches, hits, outs, baserunning, ABS challenges, innings, walk-offs.
// Loaded as a plain script; files share one global scope (see index.html for the order).

// ── Baserunner action picker ──
// For SB/WP/PB: pick which runner advances 1 base (or scores from 3B).
// For CS: pick which runner is out (removed from base).
// If only one runner on base, auto-act without showing picker.

function startBRAction(type){
  // Find occupied bases
  var runners = [];
  for(var i = 0; i < 3; i++){
    if(baseOcc(i)) runners.push(i);
  }

  if(runners.length === 0){
    // No runners — for WP/PB we can still record the event (ball gets away but nobody to advance)
    if(type === 'wp' || type === 'pb'){
      executeBRAction(type, -1);
    }
    return;
  }

  if(runners.length === 1){
    // Only one runner — auto-pick
    executeBRAction(type, runners[0]);
    return;
  }

  // Multiple runners — show picker
  var labels = ['1B','2B','3B'];
  var picker = document.getElementById('brPicker');
  if(!picker) return;

  var title = type === 'sb' ? 'Which runner steals?' :
              type === 'cs' ? 'Which runner caught stealing?' :
              'Which runner advances?';

  // For SB/WP/PB: show all runners (they advance forward).
  // For CS: show all runners (one gets out).
  var html = '<div class="br-picker-inner">';
  html += '<div class="br-picker-title">' + title + '</div>';
  html += '<div class="br-picker-btns">';
  // For advance actions, offer "All runners" when it makes sense (WP/PB)
  if((type === 'wp' || type === 'pb') && runners.length > 1){
    html += '<button class="br-pick" style="border-color:var(--blue);color:var(--blue)" onclick="executeBRAction(\''+type+'\',-2)">All runners</button>';
  }
  runners.forEach(function(bi){
    var rName = typeof G.bases[bi] === 'string' && G.bases[bi] !== '?' ? shortName(G.bases[bi]) : '';
    var label = labels[bi] + (rName ? ' · ' + esc(rName) : '');
    html += '<button class="br-pick" onclick="executeBRAction(\''+type+'\','+bi+')">' + label + '</button>';
  });
  html += '<button class="br-pick-cancel" onclick="cancelBRPicker()">Cancel</button>';
  html += '</div></div>';
  picker.innerHTML = html;
  picker.style.display = '';
}

function cancelBRPicker(){
  var picker = document.getElementById('brPicker');
  if(picker){ picker.innerHTML = ''; picker.style.display = 'none'; }
}

// baseIdx: 0=1B, 1=2B, 2=3B, -1=no runner (WP/PB only), -2=all runners (WP/PB)
function executeBRAction(type, baseIdx){
  cancelBRPicker();
  saveState();
  var side = batting();
  var idx = abIdx(side);
  var nm = curName(side, idx);
  var labels = ['1B','2B','3B'];

  if(type === 'sb'){
    // Stolen base: runner on baseIdx advances 1 base
    var runnerName = G.bases[baseIdx] || '?';
    // Credit SB to the runner, not the current batter
    var runnerSlot = findRunnerSlot(side, runnerName);
    if(runnerSlot >= 0){
      activeHits(side, runnerSlot).sb++;
    } else {
      // Fallback: credit batter if runner can't be identified
      activeHits(side, idx).sb++;
    }
    var fromBase = labels[baseIdx];
    if(baseIdx === 2){
      // Steal home — runner scores
      creditRun(side, runnerName);
      G.rhe[side][0]++;
      G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
      G.bases[2] = null;
      addLog((typeof runnerName === 'string' && runnerName !== '?' ? runnerName : nm) + ' — steals home!', 'SB', 't-sb');
      renderScore();
    } else {
      // Advance 1 base
      G.bases[baseIdx + 1] = G.bases[baseIdx]; // carry name
      G.bases[baseIdx] = null;
      addLog((typeof runnerName === 'string' && runnerName !== '?' ? runnerName : nm) + ' — stolen base (' + fromBase + ' → ' + labels[baseIdx+1] + ')', 'SB', 't-sb');
    }
    renderBases();
    renderLineup(side);

  } else if(type === 'cs'){
    // Caught stealing: runner on baseIdx is out, removed from base
    var csRunner = G.bases[baseIdx] || '?';
    // Credit CS to the runner, not the current batter
    var csSlot = findRunnerSlot(side, csRunner);
    if(csSlot >= 0){
      activeHits(side, csSlot).cs++;
    } else {
      activeHits(side, idx).cs++;
    }
    var csFrom = labels[baseIdx];
    paRunnerOut(side, csRunner);
    G.bases[baseIdx] = null;
    addLog((typeof csRunner === 'string' && csRunner !== '?' ? csRunner : nm) + ' — caught stealing (' + csFrom + ')', 'CS', 't-cs');
    addRunnerOut();
    renderBases();
    renderLineup(side);

  } else if(type === 'wp'){
    // Wild pitch: advance runner(s). Counts as a pitch.
    activeHits(side, idx).wp++;
    addPitch(fielding());
    addPitcherBall(fielding(), 1);
    if(baseIdx === -1){
      // No runners, just the event
      addLog('Wild pitch — charged to ' + team(fielding()) + ' pitcher', 'WP', 't-wp');
    } else if(baseIdx === -2){
      // All runners advance 1 base
      var wpRuns = advanceRunners(side, 1);
      addLog('Wild pitch — all runners advance', 'WP', 't-wp');
      if(wpRuns > 0){
        addLog(wpRuns + ' run' + (wpRuns > 1 ? 's' : '') + ' score on wild pitch', 'Run', 't-run');
        renderScore();
      }
    } else {
      // Single runner advances
      var wpRunner = G.bases[baseIdx] || '?';
      if(baseIdx === 2){
        creditRun(side, wpRunner);
        G.rhe[side][0]++;
        G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
        G.bases[2] = null;
        addLog('Wild pitch — runner scores from 3B', 'WP', 't-wp');
        renderScore();
      } else {
        G.bases[baseIdx + 1] = G.bases[baseIdx];
        G.bases[baseIdx] = null;
        addLog('Wild pitch — runner advances (' + labels[baseIdx] + ' → ' + labels[baseIdx+1] + ')', 'WP', 't-wp');
      }
    }
    renderBases();
    renderLineup(side);

  } else if(type === 'pb'){
    // Passed ball: advance runner(s). Charges error to catcher.
    var fSide = fielding();
    G.rhe[fSide][2]++;
    if(baseIdx === -1){
      addLog('Passed ball — E charged to ' + team(fSide) + ' C', 'PB', 't-pb');
    } else if(baseIdx === -2){
      var pbRuns = advanceRunners(side, 1, true);
      addLog('Passed ball — all runners advance', 'PB', 't-pb');
      if(pbRuns > 0){
        addLog(pbRuns + ' run' + (pbRuns > 1 ? 's' : '') + ' score on passed ball', 'Run', 't-run');
      }
    } else {
      var pbRunner = G.bases[baseIdx] || '?';
      if(baseIdx === 2){
        creditRun(side, pbRunner, true);
        G.rhe[side][0]++;
        G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
        G.bases[2] = null;
        addLog('Passed ball — runner scores from 3B', 'PB', 't-pb');
      } else {
        G.bases[baseIdx + 1] = G.bases[baseIdx];
        G.bases[baseIdx] = null;
        addLog('Passed ball — runner advances (' + labels[baseIdx] + ' → ' + labels[baseIdx+1] + ')', 'PB', 't-pb');
      }
    }
    renderBases();
    renderScore();
  }

  checkWalkoff();
}

// An out on a baserunner. Unlike a batter's out, the batter at the plate
// keeps his count (unless the out ends the inning).
function addRunnerOut(){
  var b = G.balls, s = G.strikes, f = G.fouls;
  var innOver = addOut();
  if(!innOver){ G.balls = b; G.strikes = s; G.fouls = f; renderCount(); }
  return innOver;
}

// ── Runner out on the bases ──
// Thrown out advancing (e.g. stretching a double), picked off, or doubled
// off. The runner's scorecard cell gets the out number and keeps its result;
// the pitcher gets the out; the batter at the plate keeps his turn.
var RO_BASES = ['1st', '2nd', '3rd', 'home'];

var _roBase = null;

 // base index of the runner being put out

function roRunnerName(bi){
  var n = G.bases[bi];
  return typeof n === 'string' && n !== '?' ? n : 'Runner';
}

function startRunnerOut(){
  var runners = [0, 1, 2].filter(baseOcc);
  if(!runners.length){ kbFlash('No runners on base', '#BA7517'); return; }
  if(runners.length === 1){ pickRunnerOutRunner(runners[0]); return; }
  var picker = document.getElementById('brPicker');
  if(!picker) return;
  var html = '<div class="br-picker-inner"><div class="br-picker-title">Which runner is out?</div><div class="br-picker-btns">';
  runners.forEach(function(bi){
    html += '<button class="br-pick" onclick="pickRunnerOutRunner(' + bi + ')">' + ['1B','2B','3B'][bi] + ' · ' + esc(shortName(roRunnerName(bi))) + '</button>';
  });
  html += '<button class="br-pick-cancel" onclick="cancelRunnerOut()">Cancel</button></div></div>';
  picker.innerHTML = html;
  picker.style.display = '';
}

function pickRunnerOutRunner(bi){
  _roBase = bi;
  var picker = document.getElementById('brPicker');
  if(!picker) return;
  var html = '<div class="br-picker-inner">';
  html += '<div class="br-picker-title">' + esc(roRunnerName(bi)) + ' (on ' + RO_BASES[bi] + ') — out where?</div>';
  html += '<div class="br-picker-btns" style="margin-bottom:6px">'
    + '<input class="ro-fielders" id="roFielders" inputmode="numeric" placeholder="Fielders, e.g. 9-6-5 (optional)" aria-label="Fielders (optional)" /></div>';
  html += '<div class="br-picker-btns">';
  for(var d = bi + 1; d <= 3; d++){
    html += '<button class="br-pick" onclick="executeRunnerOut(' + d + ')">Out at ' + RO_BASES[d] + '</button>';
  }
  html += '<button class="br-pick" onclick="executeRunnerOut(' + bi + ')">Picked off / doubled off at ' + RO_BASES[bi] + '</button>';
  html += '<button class="br-pick-cancel" onclick="cancelRunnerOut()">Cancel</button></div></div>';
  picker.innerHTML = html;
  picker.style.display = '';
}

function cancelRunnerOut(){
  _roBase = null;
  cancelBRPicker();
}

function executeRunnerOut(dest){
  if(_roBase === null || !baseOcc(_roBase)){ cancelRunnerOut(); return; }
  var bi = _roBase;
  var fEl = document.getElementById('roFielders');
  var fielders = fEl ? fEl.value.replace(/[^\d-]/g, '').replace(/^-+|-+$/g, '') : '';
  cancelRunnerOut();
  saveState();

  var side = batting(), name = roRunnerName(bi);
  var what = dest === bi ? 'picked off / doubled off at ' + RO_BASES[bi] : 'out at ' + RO_BASES[dest] + ' (from ' + RO_BASES[bi] + ')';
  paRunnerOut(side, G.bases[bi]);
  G.bases[bi] = null;
  addLog(name + ' — ' + what + (fielders ? ', ' + fielders : ''), 'Out', 't-out');
  addRunnerOut();
  renderBases();
  renderLineup(side);
}

function recordHBP(){
  saveState();
  var side = batting();
  var idx = abIdx(side);
  var nm = curName(side, idx);
  activeHits(side, idx).hbp++;
  addPitch(fielding());
  addPitcherBall(fielding(), 1);
  addLog(nm + ' — hit by pitch', 'HBP', 't-hbp');
  logBatter(side, idx, 'HBP');

  // Force-advance runners and place batter on 1B (same as walk)
  var runs = forceAdvance(side, nm);
  if(runs > 0){
    creditRBI(side, runs);
    addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score', 'Run', 't-run');
  }
  renderBases();
  renderScore();

  G.balls = 0;
  G.strikes = 0;
  G.fouls = 0;
  renderCount();
  renderLineup(side);
  if(!checkWalkoff()){
    nextBatter(side);
  }
}

function recordIBB(){
  saveState();
  var side = batting();
  var idx = abIdx(side);
  var nm = curName(side, idx);
  activeHits(side, idx).ibb++;
  // IBB doesn't count as a pitch in the traditional sense, but we track it
  addLog(nm + ' — intentional walk', 'IBB', 't-ibb');
  logBatter(side, idx, 'IBB');
  addPitcherStat(fielding(), 'bb');

  // Force-advance runners and place batter on 1B (same as walk)
  var runs = forceAdvance(side, nm);
  if(runs > 0){
    creditRBI(side, runs);
    addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score', 'Run', 't-run');
  }
  renderBases();
  renderScore();

  G.balls = 0;
  G.strikes = 0;
  G.fouls = 0;
  renderCount();
  renderLineup(side);
  if(!checkWalkoff()){
    nextBatter(side);
  }
}

// ── Defensive error (charge E to a fielder, optional runner advance) ──
// This is distinct from the batter-reaches-on-error flow in the Out panel.
// Use this when an error happens on a play that isn't an at-bat outcome —
// e.g. throwing error on a pickoff, dropped relay, botched rundown, etc.
// Flow: pick fielder (1-9) → (if runners) pick advance action → execute.

var _deState = null;

 // { fielder: number } while mid-flow

function startDefError(){
  _deState = {};
  var picker = document.getElementById('brPicker');
  if(!picker) return;

  var html = '<div class="br-picker-inner">';
  html += '<div class="br-picker-title">Which fielder made the error?</div>';
  html += '<div class="br-picker-btns">';
  FIELDERS.forEach(function(f){
    html += '<button class="br-pick" onclick="defErrorFielderPicked(' + f.num + ')">'
      + f.num + ' · ' + f.pos + '</button>';
  });
  html += '<button class="br-pick-cancel" onclick="cancelDefError()">Cancel</button>';
  html += '</div></div>';
  picker.innerHTML = html;
  picker.style.display = '';
}

function cancelDefError(){
  _deState = null;
  cancelBRPicker();
}

function defErrorFielderPicked(fielderNum){
  _deState = _deState || {};
  _deState.fielder = fielderNum;

  // Find runners on base
  var runners = [];
  for(var i = 0; i < 3; i++){
    if(baseOcc(i)) runners.push(i);
  }

  // No runners → record the error with no advance and finish
  if(runners.length === 0){
    defErrorExecute('none', -1);
    return;
  }

  // Runners on base → ask what the advance looks like
  var picker = document.getElementById('brPicker');
  if(!picker){ defErrorExecute('none', -1); return; }

  var fInfo = FIELDERS.filter(function(f){ return f.num === fielderNum; })[0];
  var fLabel = fielderNum + ' (' + fInfo.pos + ')';

  var html = '<div class="br-picker-inner">';
  html += '<div class="br-picker-title">E' + fLabel + ' — how do runners move?</div>';
  html += '<div class="br-picker-btns">';
  html += '<button class="br-pick" onclick="defErrorExecute(\'none\',-1)">No advance</button>';
  html += '<button class="br-pick" style="border-color:var(--blue);color:var(--blue)" onclick="defErrorExecute(\'all\',-1)">All advance 1</button>';
  // Only offer "pick runner" when there are multiple runners; otherwise it collapses to "single advance"
  if(runners.length === 1){
    var bi = runners[0];
    var labels = ['1B','2B','3B'];
    html += '<button class="br-pick" onclick="defErrorExecute(\'one\',' + bi + ')">Advance ' + labels[bi] + '</button>';
  } else {
    runners.forEach(function(bi){
      var rName = typeof G.bases[bi] === 'string' && G.bases[bi] !== '?' ? shortName(G.bases[bi]) : '';
      var labels = ['1B','2B','3B'];
      var label = labels[bi] + (rName ? ' · ' + esc(rName) : '');
      html += '<button class="br-pick" onclick="defErrorExecute(\'one\',' + bi + ')">Advance ' + label + '</button>';
    });
  }
  html += '<button class="br-pick-cancel" onclick="cancelDefError()">Cancel</button>';
  html += '</div></div>';
  picker.innerHTML = html;
  picker.style.display = '';
}

// advType: 'none' (no advance) | 'all' (all runners +1) | 'one' (single runner +1, scoring from 3B)
// baseIdx: only relevant for 'one' (which base the advancing runner starts on)
function defErrorExecute(advType, baseIdx){
  if(!_deState || !_deState.fielder){ cancelDefError(); return; }
  var fielderNum = _deState.fielder;
  cancelBRPicker();
  saveState();

  var fSide = fielding();
  var bSide = batting();
  var fInfo = FIELDERS.filter(function(f){ return f.num === fielderNum; })[0];
  var fLabel = 'E' + fielderNum;

  // Charge the error to the fielding team
  G.rhe[fSide][2]++;

  // Apply the advance action, logging each piece
  if(advType === 'all'){
    var runs = advanceRunners(bSide, 1, true);
    addLog(fLabel + ' — ' + fInfo.pos + ' error, all runners advance', fLabel, 't-err');
    if(runs > 0){
      addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score on error', 'Run', 't-run');
    }
  } else if(advType === 'one' && baseIdx >= 0 && baseOcc(baseIdx)){
    var labels = ['1B','2B','3B'];
    var runner = G.bases[baseIdx];
    if(baseIdx === 2){
      // Scores from 3B
      creditRun(bSide, runner, true);
      G.rhe[bSide][0]++;
      G.scores[bSide][G.inning - 1] = (G.scores[bSide][G.inning - 1] || 0) + 1;
      G.bases[2] = null;
      addLog(fLabel + ' — ' + fInfo.pos + ' error, ' + (runner || 'runner') + ' scores from 3B', fLabel, 't-err');
    } else {
      G.bases[baseIdx + 1] = G.bases[baseIdx];
      G.bases[baseIdx] = null;
      addLog(fLabel + ' — ' + fInfo.pos + ' error, ' + (runner || 'runner') + ' advances (' + labels[baseIdx] + ' → ' + labels[baseIdx+1] + ')', fLabel, 't-err');
    }
  } else {
    // No advance — just the bookkeeping error
    addLog(fLabel + ' — ' + fInfo.pos + ' error (no advance)', fLabel, 't-err');
  }

  _deState = null;
  renderBases();
  renderScore();
  renderLineup(bSide);
  saveToStorage();
}

function recordBalk(){
  saveState();
  var side = batting();
  var runners = [];
  for(var i = 0; i < 3; i++){
    if(baseOcc(i)) runners.push(i);
  }

  if(runners.length === 0){
    // No runners on base — balk is still recorded (ball on the batter? No — balk with no runners: just log it)
    addLog('Balk — no runners on base, no advancement', 'BLK', 't-abs');
    saveToStorage();
    return;
  }

  // All runners advance one base; anyone on 3B scores
  var runs = advanceRunners(side, 1);
  var runMsg = runs > 0 ? ' — ' + runs + ' run' + (runs > 1 ? 's' : '') + ' score' : '';
  addLog('Balk — all runners advance' + runMsg, 'BLK', 't-abs');
  if(runs > 0){
    renderScore();
  }
  renderBases();
  renderLineup(side);
  checkWalkoff();
  saveToStorage();
}

// ── Flyout / Groundout state ──
var outState = { type: null, fielder: null, throwTo: null, multiOut: null, sacType: null, runScores: false };

// Reset out-panel state and DOM to default
function resetOutState(){
  outState.type = null;
  outState.fielder = null;
  outState.throwTo = null;
  outState.multiOut = null;
  outState.sacType = null;
  outState.runScores = false;
  renderOutPanel();
}

// Sync out-recording panel DOM with current outState
function renderOutPanel(){
  document.getElementById('outTypeFly').className = 'out-type-btn otf' + (outState.type === 'fly' ? ' sel' : '');
  document.getElementById('outTypeGround').className = 'out-type-btn otg' + (outState.type === 'ground' ? ' sel' : '');
  document.getElementById('outTypeError').className = 'out-type-btn ote' + (outState.type === 'error' ? ' sel' : '');
  document.getElementById('outTypeFC').className = 'out-type-btn otfc' + (outState.type === 'fc' ? ' sel' : '');

  var dpBtn = document.getElementById('dpBtn');
  if(dpBtn) dpBtn.className = 'multi-out-btn' + (outState.multiOut === 'dp' ? ' sel' : '');
  var tpBtn = document.getElementById('tpBtn');
  if(tpBtn) tpBtn.className = 'multi-out-btn' + (outState.multiOut === 'tp' ? ' sel' : '');
  var moHint = document.getElementById('multiOutHint');
  if(moHint) moHint.textContent = outState.multiOut === 'dp' ? 'Records 2 outs total' : outState.multiOut === 'tp' ? 'Records 3 outs total' : '';

  var lbl = document.getElementById('fielderLabel');
  if(lbl) lbl.textContent = outState.type === 'error' ? 'Fielder who made the error:' : outState.type === 'fc' ? 'Fielder who made the play:' : 'Fielder who fielded the ball:';

  var wrap = document.getElementById('throwToWrap');
  if(wrap) wrap.style.display = (outState.type === 'ground' || outState.type === 'fc') ? '' : 'none';

  updateSacBtns();
  buildFielderGrid();
  updateOutBtn();
}

var FIELDERS = [
  {num:1, pos:'P'},  {num:2, pos:'C'},  {num:3, pos:'1B'},
  {num:4, pos:'2B'}, {num:5, pos:'3B'}, {num:6, pos:'SS'},
  {num:7, pos:'LF'}, {num:8, pos:'CF'}, {num:9, pos:'RF'}
];

function selectMultiOut(type){
  outState.multiOut = outState.multiOut===type ? null : type;
  // Sac and multi-out are mutually exclusive
  if(outState.multiOut) outState.sacType = null;
  document.getElementById('dpBtn').className = 'multi-out-btn'+(outState.multiOut==='dp'?' sel':'');
  document.getElementById('tpBtn').className = 'multi-out-btn'+(outState.multiOut==='tp'?' sel':'');
  updateSacBtns();
  var hint = document.getElementById('multiOutHint');
  if(hint) hint.textContent = outState.multiOut==='dp' ? 'Records 2 outs total' : outState.multiOut==='tp' ? 'Records 3 outs total' : '';
  updateOutBtn();
}

function selectSac(type){
  outState.sacType = outState.sacType === type ? null : type;
  // Sac and multi-out are mutually exclusive
  if(outState.sacType) outState.multiOut = null;
  // Sac and runScores are mutually exclusive
  outState.runScores = false;
  document.getElementById('dpBtn').className = 'multi-out-btn';
  document.getElementById('tpBtn').className = 'multi-out-btn';
  var moHint = document.getElementById('multiOutHint');
  if(moHint) moHint.textContent = '';
  updateSacBtns();
  updateOutBtn();
}

function toggleRunScores(){
  outState.runScores = !outState.runScores;
  updateSacBtns();
  updateOutBtn();
}

function updateSacBtns(){
  var sfBtn = document.getElementById('sfBtn');
  var sacBtn = document.getElementById('sacBtn');
  var runScoresBtn = document.getElementById('runScoresBtn');
  var hint = document.getElementById('sacHint');

  if(sfBtn) sfBtn.className = 'sac-toggle' + (outState.sacType === 'sf' ? ' sel-sf' : '');
  if(sacBtn) sacBtn.className = 'sac-toggle' + (outState.sacType === 'sac' ? ' sel-sac' : '');

  // Show "+R Run scores" only for groundout (not sac, not fly), and only when 3B is occupied
  var showRunScores = (outState.type === 'ground' || outState.type === 'fly') && !outState.sacType && baseOcc(2);
  if(runScoresBtn){
    runScoresBtn.style.display = showRunScores ? '' : 'none';
    if(!showRunScores) outState.runScores = false;
    runScoresBtn.className = 'sac-toggle' + (outState.runScores ? ' sel-sf' : '');
  }

  if(hint){
    if(outState.sacType === 'sf') hint.textContent = 'Sac fly — scores runner from 3B';
    else if(outState.sacType === 'sac') hint.textContent = 'Sac bunt — advances runner(s)';
    else if(outState.runScores) hint.textContent = 'Runner scores from 3B, RBI credited';
    else hint.textContent = '';
  }
}

function buildFielderGrid(){
  var g = document.getElementById('fielderGrid'); if(!g) return;
  var isErr = outState.type === 'error';
  g.innerHTML = FIELDERS.map(function(f){
    var selClass = outState.fielder===f.num ? (isErr ? ' sel-err' : ' sel') : '';
    return '<button class="fld-btn'+selClass+'" data-action="sel-fielder" data-num="'+f.num+'">'
      +'<span class="fld-num">'+f.num+'</span>'
      +'<span class="fld-pos-name">'+f.pos+'</span>'
      +'</button>';
  }).join('');
  // Show/hide throw-to grid for groundouts and FC
  var wrap = document.getElementById('throwToWrap');
  if(wrap) wrap.style.display = (outState.type==='ground' || outState.type==='fc') ? '' : 'none';
  buildThrowToGrid();
}

function buildThrowToGrid(){
  var g = document.getElementById('throwToGrid'); if(!g) return;
  g.innerHTML = FIELDERS.map(function(f){
    var isSelected = outState.throwTo===f.num;
    var isPrimary  = outState.fielder===f.num;
    var selClass   = isSelected ? ' sel' : '';
    return '<button class="fld-btn'+selClass+'" data-action="sel-throwto" data-num="'+f.num+'" '+(isPrimary?'style="opacity:.4"':'')+' title="'+f.pos+'">'
      +'<span class="fld-num">'+f.num+'</span>'
      +'<span class="fld-pos-name">'+f.pos+'</span>'
      +'</button>';
  }).join('');
}

function selectFielder(num){
  outState.fielder = outState.fielder===num ? null : num;
  // If throw-to was same position, clear it
  if(outState.throwTo===num) outState.throwTo=null;
  buildFielderGrid();
  updateOutBtn();
}

function selectThrowTo(num){
  // Toggle; don't allow same as primary fielder
  if(num===outState.fielder) return;
  outState.throwTo = outState.throwTo===num ? null : num;
  buildThrowToGrid();
  updateOutBtn();
}

function selectOutType(type){
  outState.type = outState.type===type ? null : type;
  // Clear throwTo when switching away from groundout/fc
  if(outState.type !== 'ground' && outState.type !== 'fc') outState.throwTo = null;
  renderOutPanel();
}

function updateOutBtn(){
  var btn = document.getElementById('recordOutBtn');
  var hint = document.getElementById('outHint');
  if(!btn) return;
  var isErr = outState.type === 'error';
  var isGround = outState.type === 'ground';
  var isFC = outState.type === 'fc';
  var sacLabel = outState.sacType === 'sf' ? 'Sac Fly — ' : outState.sacType === 'sac' ? 'Sac Bunt — ' : outState.runScores ? 'RBI — ' : '';
  btn.className = 'rec-out-btn' + (isErr ? ' rec-err-btn' : '');

  if(outState.type && outState.fielder){
    var tLabel = outState.type === 'fly' ? 'Flyout' : outState.type === 'ground' ? 'Groundout' : outState.type === 'fc' ? "Fielder's Choice" : 'Error';
    var fInfo = FIELDERS.filter(function(f){ return f.num === outState.fielder; })[0];
    var ttInfo = outState.throwTo ? FIELDERS.filter(function(f){ return f.num === outState.throwTo; })[0] : null;

    if(isErr){
      btn.disabled = false;
      btn.textContent = 'Record Error — E' + outState.fielder + ' (' + fInfo.pos + ')';
      hint.textContent = 'Does NOT record an out. Increments E column.';
    } else if(isFC){
      btn.disabled = false;
      if(ttInfo){
        btn.textContent = "Record FC — " + outState.fielder + '-' + outState.throwTo + ' (' + fInfo.pos + ' to ' + ttInfo.pos + ')';
      } else {
        btn.textContent = "Record FC — " + outState.fielder + ' (' + fInfo.pos + ')';
      }
      hint.textContent = 'Batter reaches; out recorded on another runner.';
    } else if(isGround && ttInfo){
      var dpTag = outState.multiOut === 'dp' ? ' — Double play' : outState.multiOut === 'tp' ? ' — Triple play' : '';
      btn.disabled = false;
      btn.textContent = 'Record ' + sacLabel + 'Groundout — ' + outState.fielder + '-' + outState.throwTo + ' (' + fInfo.pos + ' to ' + ttInfo.pos + ')' + dpTag;
      hint.textContent = outState.sacType === 'sac' ? 'Advances runner(s) 1 base' : outState.multiOut === 'dp' ? 'Records 2 outs' : outState.multiOut === 'tp' ? 'Records 3 outs' : '';
    } else {
      var moSuffix = outState.multiOut === 'dp' ? ' (DP)' : outState.multiOut === 'tp' ? ' (TP)' : '';
      btn.disabled = false;
      btn.textContent = 'Record ' + sacLabel + tLabel + ' — ' + outState.fielder + ' (' + fInfo.pos + ')' + moSuffix;
      var hintText = '';
      if(outState.sacType === 'sf') hintText = 'Scores runner from 3B';
      else if(outState.sacType === 'sac') hintText = 'Advances runner(s) 1 base';
      else if(outState.runScores) hintText = 'Runner scores from 3B, RBI credited to batter';
      else if(isGround) hintText = 'Tap "Thrown to" to add receiving fielder.';
      else if(outState.multiOut === 'dp') hintText = 'Records 2 outs';
      else if(outState.multiOut === 'tp') hintText = 'Records 3 outs';
      hint.textContent = hintText;
    }
  } else if(outState.type && !outState.fielder){
    btn.disabled = true;
    btn.textContent = 'Select fielder';
    hint.textContent = '';
  } else if(!outState.type && outState.fielder){
    btn.disabled = true;
    btn.textContent = 'Select out type (F / G / E / FC)';
    hint.textContent = '';
  } else {
    btn.disabled = true;
    btn.textContent = 'Select type & fielder to record';
    hint.textContent = '';
  }
}

// ── Record-out dispatch & helpers ──
// recordOut() is a thin dispatcher; the real work happens in _apply* helpers
// so each branch can be reasoned about on its own.

// Build a context bundle so helpers don't each recompute the same things.
function _buildOutCtx(){
  var side = batting();
  var idx = abIdx(side);
  return {
    side: side,
    idx: idx,
    nm: curName(side, idx),
    h: activeHits(side, idx),
    fInfo: FIELDERS.filter(function(f){ return f.num === outState.fielder; })[0],
    ttInfo: outState.throwTo ? FIELDERS.filter(function(f){ return f.num === outState.throwTo; })[0] : null,
    isSacFly: outState.sacType === 'sf',
    isSacBunt: outState.sacType === 'sac'
  };
}

// Score the runner on 3B (shared by sac fly / sac bunt / RBI groundout paths)
function _scoreRunnerFrom3B(side, label){
  if(!baseOcc(2)) return 0;
  var runner = G.bases[2];
  creditRun(side, runner);
  creditRBI(side, 1);
  G.bases[2] = null;
  G.rhe[side][0]++;
  G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
  addLog((runner || 'Runner') + ' ' + label, 'Run', 't-run');
  return 1;
}

// Common "what happens after the out is on the books" tail
function _finishAtBat(side){
  addPitch(fielding());
  var walkoff = checkWalkoff();
  var innOver = addOut();
  // Extra outs for DP/TP — stop early if the inning flips
  if(!innOver && (outState.multiOut === 'dp' || outState.multiOut === 'tp')){
    innOver = addOut();
    if(!innOver && outState.multiOut === 'tp') innOver = addOut();
  }
  renderLineup(side);
  if(!innOver && !walkoff){
    nextBatter(side);
  } else if(innOver){
    advanceBatterSilent(side);
  }
}

// Batter reached on a fielding error — charged to the defense, not the batter.
function _applyError(ctx){
  ctx.h.err++;
  ctx.h.roe = (ctx.h.roe || 0) + 1;
  G.rhe[fielding()][2]++;
  renderScore();
  var tag = 'E' + outState.fielder;
  addLog(ctx.nm + ' reached on ' + tag + ' — ' + ctx.fInfo.pos + ' error', tag, 't-err');
  logBatter(ctx.side, ctx.idx, tag);
  addPitch(fielding());
  // Batter takes 1B; forced runners move up. Runs that score are unearned
  // and no RBI is credited on an error.
  var runs = forceAdvance(ctx.side, ctx.nm, true);
  if(runs > 0) addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score on error', 'Run', 't-run');
  G.balls = 0; G.strikes = 0; G.fouls = 0;
  renderCount();
  renderBases();
  renderScore();
  renderLineup(ctx.side);
  if(!checkWalkoff()) nextBatter(ctx.side);
}

// Fielder's choice — batter to 1B, lead runner retired.
function _applyFieldersChoice(ctx){
  ctx.h.fc++;
  var fcTag = ctx.ttInfo ? 'FC' + outState.fielder + '-' + outState.throwTo : 'FC' + outState.fielder;
  var throwDesc = ctx.ttInfo
    ? outState.fielder + '-' + outState.throwTo + ' (' + ctx.fInfo.pos + ' to ' + ctx.ttInfo.pos + ')'
    : outState.fielder + ' (' + ctx.fInfo.pos + ')';
  addLog(ctx.nm + " — fielder's choice " + throwDesc, fcTag, 't-fc');
  logBatter(ctx.side, ctx.idx, fcTag);
  addPitch(fielding());

  // Retire the lead (most advanced) runner, then place batter on 1B.
  // The runner's PA is marked before addOut so the out number is right.
  var leadIdx = -1;
  for(var bi = 2; bi >= 0; bi--){
    if(baseOcc(bi)){ leadIdx = bi; break; }
  }
  if(leadIdx >= 0) paRunnerOut(ctx.side, G.bases[leadIdx]);

  var walkoff = checkWalkoff();
  var innOver = addOut();

  if(leadIdx >= 0) G.bases[leadIdx] = null;
  G.bases[0] = ctx.nm;

  renderBases();
  renderLineup(ctx.side);
  if(!innOver && !walkoff){
    nextBatter(ctx.side);
  } else if(innOver){
    advanceBatterSilent(ctx.side);
  }
}

// Flyout / groundout (including sac fly, sac bunt, RBI groundout, DP, TP).
function _applyRecordedOut(ctx){
  var dpSuffix = outState.multiOut === 'dp' ? ' (DP)' : outState.multiOut === 'tp' ? ' (TP)' : '';
  var outsOnPlay = outState.multiOut === 'dp' ? 2 : outState.multiOut === 'tp' ? 3 : 1;
  var sacPrefix = ctx.isSacFly ? 'SF — ' : ctx.isSacBunt ? 'SAC — ' : '';

  if(ctx.isSacFly) ctx.h.sf++;
  else if(ctx.isSacBunt) ctx.h.sac++;

  // ── Log + batter-cell tag
  if(outState.type === 'fly'){
    if(!ctx.isSacFly && !ctx.isSacBunt) ctx.h.fo++;
    var flyTag = ctx.isSacFly ? 'SF' + outState.fielder : 'F' + outState.fielder;
    var flyCls = ctx.isSacFly ? 't-sf' : 't-fo';
    addLog(ctx.nm + ' — ' + sacPrefix + 'flyout ' + outState.fielder + ' (' + ctx.fInfo.pos + ')' + dpSuffix, flyTag, flyCls);
    logBatter(ctx.side, ctx.idx, flyTag, outsOnPlay);
  } else {
    if(!ctx.isSacFly && !ctx.isSacBunt) ctx.h.go++;
    var goTag, goCls;
    if(ctx.isSacBunt){
      goTag = 'SAC'; goCls = 't-sac';
    } else {
      goTag = ctx.ttInfo ? 'G' + outState.fielder + '-' + outState.throwTo : 'G' + outState.fielder;
      goCls = 't-go';
    }
    var goDesc = ctx.ttInfo
      ? outState.fielder + '-' + outState.throwTo + ' (' + ctx.fInfo.pos + ' to ' + ctx.ttInfo.pos + ')'
      : outState.fielder + ' (' + ctx.fInfo.pos + ')';
    addLog(ctx.nm + ' — ' + sacPrefix + 'groundout ' + goDesc + dpSuffix, goTag, goCls);
    logBatter(ctx.side, ctx.idx, goTag, outsOnPlay);
  }

  // ── Runners advance / score, based on out type
  if(ctx.isSacFly){
    // Sac fly: runner on 3B scores
    if(_scoreRunnerFrom3B(ctx.side, 'scores on sac fly')){
      renderBases(); renderScore();
    }
  } else if(ctx.isSacBunt){
    // Sac bunt: all runners advance one base
    var sacRuns = advanceRunners(ctx.side, 1);
    if(sacRuns > 0){
      creditRBI(ctx.side, sacRuns);
      addLog(sacRuns + ' run' + (sacRuns > 1 ? 's' : '') + ' score on sac bunt', 'Run', 't-run');
    }
    renderBases(); renderScore();
  } else if(outState.runScores && baseOcc(2)){
    // RBI groundout/flyout — runner scores from 3B with no sac credit
    if(_scoreRunnerFrom3B(ctx.side, 'scores from 3B (RBI)')){
      renderBases(); renderScore();
    }
  }

  // DP/TP: the other out(s) are runners. Retire them starting from 1B (the
  // force), before the batter, so a 6-4-3 reads runner = out 1, batter = out 2.
  if(outsOnPlay > 1){
    var retired = 0;
    for(var bi = 0; bi < 3 && retired < outsOnPlay - 1; bi++){
      if(!baseOcc(bi)) continue;
      retired++;
      paRunnerOut(ctx.side, G.bases[bi], G.outs + retired);
      G.bases[bi] = null;
    }
    renderBases();
  }

  _finishAtBat(ctx.side);
}

function recordOut(){
  if(!outState.type || !outState.fielder) return;
  saveState();

  var ctx = _buildOutCtx();

  if(outState.type === 'error'){
    _applyError(ctx);
  } else if(outState.type === 'fc'){
    _applyFieldersChoice(ctx);
  } else {
    _applyRecordedOut(ctx);
  }

  resetOutState();
}

function nextBatter(side){
  var cur = side==='home' ? G.homeBatter : G.awayBatter;
  var next = (cur + 1) % 9;
  if(side==='home') G.homeBatter=next; else G.awayBatter=next;
  addLog(curName(side,next)+' up to bat','AB','t-info');
  renderLineup(side);
  renderAtBatBar();
}

// Advance the batter index without logging or rendering.
// Used when a PA ends on the 3rd out — the inning flips, but
// the batter's turn is still over, so the index must move forward
// for the next time this team comes up to bat.
function advanceBatterSilent(side){
  var cur = side==='home' ? G.homeBatter : G.awayBatter;
  var next = (cur + 1) % 9;
  if(side==='home') G.homeBatter=next; else G.awayBatter=next;
}

// Manual out: wraps addOut with batter advancement logic.
// Called by the "+ Out" button and the "O" keyboard shortcut.
function manualOut(){
  saveState();
  var side = batting();
  logBatter(side, abIdx(side), 'Out');
  var innOver = addOut();
  if(!innOver){
    nextBatter(side);
  } else {
    advanceBatterSilent(side);
  }
}

var hitWithErr = false;

function toggleHitErr(){
  hitWithErr = !hitWithErr;
  var btn = document.getElementById('hitErrToggle');
  var hint = document.getElementById('hitErrHint');
  if(btn) btn.className = 'hit-err-toggle' + (hitWithErr ? ' on' : '');
  if(hint) hint.textContent = hitWithErr ? 'Next hit will also charge an E to fielding team' : '';
}

// ── Runner advancement helpers ──
// advanceRunners: move all runners forward by `bases` positions.
// Any runner pushed past 3B scores a run. Batter placed on the given base.
// Returns the number of runs scored by runners (not counting the batter).
// unearned: true when the advance came on an error / passed ball.
function advanceRunners(side, bases, unearned){
  var runs = 0;
  // Work from 3B → 1B so we don't overwrite
  var newBases = [null, null, null];
  for(var i = 2; i >= 0; i--){
    if(baseOcc(i)){
      var newPos = i + bases; // 0-indexed: 0=1B, 1=2B, 2=3B, 3+=scores
      if(newPos >= 3){
        runs++;
        creditRun(side, G.bases[i], unearned); // credit R to the runner who scored
      } else {
        newBases[newPos] = G.bases[i]; // carry runner name
      }
    }
  }
  G.bases = newBases;

  // Score the runs
  if(runs > 0){
    G.rhe[side][0] += runs;
    G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + runs;
  }
  return runs;
}

// forceAdvance: for walks/HBP/IBB — only advance runners who are forced.
// Batter goes to 1B; runners on consecutive bases from 1B are pushed forward.
// Returns the number of runs scored.
function forceAdvance(side, batterName, unearned){
  var runs = 0;
  // Check how far the force chain goes
  if(baseOcc(0)){ // 1B occupied — force chain starts
    if(baseOcc(1)){ // 2B also occupied
      if(baseOcc(2)){ // bases loaded — 3B scores
        runs++;
        creditRun(side, G.bases[2], unearned); // credit R to runner from 3B
        G.rhe[side][0]++;
        G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
      }
      G.bases[2] = G.bases[1]; // 2B → 3B (carry name)
    }
    G.bases[1] = G.bases[0]; // 1B → 2B (carry name)
  }
  G.bases[0] = batterName || true; // batter → 1B
  return runs;
}

function recordHit(b){
  saveState();
  var side = batting();
  var idx = abIdx(side);
  var nm = curName(side, idx);
  var h = activeHits(side, idx);

  if(b === 1) h.s++;
  else if(b === 2) h.d++;
  else if(b === 3) h.t++;
  else h.hr++;

  G.rhe[side][1]++;

  var L = ['', 'Single', 'Double', 'Triple', 'Home Run'];
  var T = ['', '1B', '2B', '3B', 'HR'];
  var logText = nm + ' — ' + L[b];
  var logTag = T[b];
  var logCls = b === 4 ? 't-hr' : 't-hit';

  // If error toggle is on, also charge E to fielding team
  if(hitWithErr){
    h.err++;
    G.rhe[fielding()][2]++;
    logText += ' + E (fielder error)';
    logTag += '+E';
  }

  addPitch(fielding());
  addPitcherStat(fielding(), 'h');
  if(b === 4) addPitcherStat(fielding(), 'hr');
  addLog(logText, logTag, logCls);
  logBatter(side, idx, logTag);

  if(b === 4){
    // Home run: all runners + batter score — no picker needed
    var runnersOn = G.bases.filter(function(v){ return !!v; }).length;
    var runsScored = runnersOn + 1;
    // Credit R to each runner who was on base
    for(var bi = 0; bi < 3; bi++){
      if(baseOcc(bi)) creditRun(side, G.bases[bi]);
    }
    // Credit R to the batter (they score too)
    h.r++;
    // Credit all RBIs to the batter
    creditRBI(side, runsScored);
    G.rhe[side][0] += runsScored;
    G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + runsScored;
    chargeRun(G.pas[G.pas.length - 1]); // the batter's own run
    addLog(runsScored + ' run' + (runsScored > 1 ? 's' : '') + ' score', 'Run', 't-run');
    G.bases = [null, null, null];
    finishHit(side, nm, b);
  } else {
    // Single / Double / Triple — check if runners are on base
    var hasRunners = G.bases.some(function(v){ return !!v; });
    if(hasRunners){
      // Show runner placement picker
      showRunnerPicker(side, nm, b);
    } else {
      // No runners — just place batter
      G.bases[b - 1] = nm;
      finishHit(side, nm, b);
    }
  }
}

// Finishes a hit: resets count, renders, checks walkoff, advances batter
function finishHit(side, nm, b){
  G.balls = 0;
  G.strikes = 0;
  G.fouls = 0;
  renderCount();
  renderBases();
  renderScore();
  renderLineup(side);

  if(!checkWalkoff()){
    nextBatter(side);
  }

  // Auto-reset the error toggle after each hit
  if(hitWithErr){
    hitWithErr = false;
    var btn2 = document.getElementById('hitErrToggle');
    var hint2 = document.getElementById('hitErrHint');
    if(btn2) btn2.className = 'hit-err-toggle';
    if(hint2) hint2.textContent = '';
  }
}

// ── Runner Placement Picker ──
// Shows a modal after 1B/2B/3B with runners on base.
// Each runner gets destination options based on the hit type.
// The batter's destination is fixed (shown but not editable).

var _rpState = null;

 // { side, batterName, hitBases, runners: [{baseIdx, name, dest}] }

function showRunnerPicker(side, batterName, hitBases){
  var baseLabels = ['1B','2B','3B'];

  // Collect runners from 3B → 1B (display order: lead runner first)
  var runners = [];
  for(var i = 2; i >= 0; i--){
    if(baseOcc(i)){
      runners.push({
        baseIdx: i,
        name: typeof G.bases[i] === 'string' && G.bases[i] !== '?' ? G.bases[i] : 'Runner',
        dest: null // null = not yet chosen
      });
    }
  }

  _rpState = {
    side: side,
    batterName: batterName,
    hitBases: hitBases,
    runners: runners
  };

  renderRunnerPicker();
}

function renderRunnerPicker(){
  if(!_rpState) return;
  var rp = _rpState;
  var baseLabels = ['1B','2B','3B','Home'];

  var overlay = document.getElementById('rpOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.className = 'rp-overlay';
    overlay.id = 'rpOverlay';
    document.body.appendChild(overlay);
  }

  var hitLabel = rp.hitBases === 1 ? 'Single' : rp.hitBases === 2 ? 'Double' : 'Triple';
  var batterDest = rp.hitBases - 1; // 0=1B, 1=2B, 2=3B (0-indexed)
  var batterDestLabel = baseLabels[batterDest];

  // Build a set of bases that are already claimed:
  // - batter's destination is always claimed
  // - any runner whose dest is already chosen claims that base
  var claimed = {};
  claimed[batterDest] = 'batter';
  rp.runners.forEach(function(r, ri){
    if(r.dest !== null && r.dest >= 0 && r.dest <= 2){
      claimed[r.dest] = ri; // claimed by runner index ri
    }
  });

  var html = '<div class="rp-modal">';
  html += '<div class="rp-hdr"><h3>Place runners <span class="rp-hdr-sub">— ' + hitLabel + '</span></h3></div>';
  html += '<div class="rp-body">';

  // Show each runner (lead runner first)
  rp.runners.forEach(function(r, ri){
    var fromLabel = baseLabels[r.baseIdx];
    var dispName = shortName(r.name);
    html += '<div class="rp-runner">';
    html += '<div class="rp-runner-name">' + esc(dispName) + ' <span class="rp-runner-from">from ' + fromLabel + '</span></div>';
    html += '<div class="rp-opts">';

    // "Hold" option: stay on current base, only if not claimed by batter or another runner
    var holdBase = r.baseIdx;
    var holdAvail = (claimed[holdBase] === undefined || claimed[holdBase] === ri);
    if(holdAvail){
      var holdCls = r.dest === holdBase ? ' sel' : '';
      html += '<button class="rp-opt' + holdCls + '" onclick="rpSetDest(' + ri + ',' + holdBase + ')" title="Hold at ' + baseLabels[holdBase] + '">⏸ Hold</button>';
    }

    // Forward bases: from current+1 up through 3B (index 2)
    for(var d = r.baseIdx + 1; d <= 2; d++){
      var baseAvail = (claimed[d] === undefined || claimed[d] === ri);
      if(baseAvail){
        var selCls = r.dest === d ? ' sel' : '';
        html += '<button class="rp-opt' + selCls + '" onclick="rpSetDest(' + ri + ',' + d + ')">' + baseLabels[d] + '</button>';
      }
    }

    // Home (score) — always available
    var scoreCls = r.dest === 3 ? ' sel-score' : '';
    html += '<button class="rp-opt' + scoreCls + '" onclick="rpSetDest(' + ri + ',3)">🏠 Scores</button>';

    // Out on bases option
    var outCls = r.dest === -1 ? ' sel-out' : '';
    html += '<button class="rp-opt' + outCls + '" onclick="rpSetDest(' + ri + ',-1)">✕ Out</button>';

    html += '</div></div>';
  });

  // Show batter placement (fixed)
  html += '<div class="rp-batter">🏏 ' + esc(shortName(rp.batterName)) + ' → ' + batterDestLabel + '</div>';

  // Confirm button
  var allChosen = rp.runners.every(function(r){ return r.dest !== null; });
  html += '<button class="rp-confirm" id="rpConfirmBtn" onclick="rpConfirm()"' + (allChosen ? '' : ' disabled') + '>' + (allChosen ? 'Confirm placement' : 'Choose destination for each runner') + '</button>';
  html += '<button class="rp-skip" onclick="rpAutoAdvance()">Auto-advance (default)</button>';

  html += '</div></div>';
  overlay.innerHTML = html;
}

function rpSetDest(runnerIdx, dest){
  if(!_rpState) return;
  _rpState.runners[runnerIdx].dest = dest;
  // If this runner claimed a base (0-2), clear any other runner who had the same base
  if(dest >= 0 && dest <= 2){
    _rpState.runners.forEach(function(r, ri){
      if(ri !== runnerIdx && r.dest === dest) r.dest = null;
    });
  }
  renderRunnerPicker();
  haptic();
}

function rpConfirm(){
  if(!_rpState) return;
  var rp = _rpState;
  var side = rp.side;

  // Clear all bases first
  var newBases = [null, null, null];
  var runs = 0;
  var outsOnBases = 0;

  // Place each runner at their chosen destination
  rp.runners.forEach(function(r){
    if(r.dest === 3){
      // Scores
      runs++;
      creditRun(side, r.name); // credit R to the runner
    } else if(r.dest === -1){
      // Out on bases
      outsOnBases++;
      paRunnerOut(side, r.name, G.outs + outsOnBases);
    } else if(r.dest >= 0 && r.dest <= 2){
      // On a base
      newBases[r.dest] = r.name;
    }
  });

  // Place batter on the hit base
  newBases[rp.hitBases - 1] = rp.batterName;

  G.bases = newBases;

  // Score the runs
  if(runs > 0){
    creditRBI(side, runs); // batter's hit drove in the runs
    G.rhe[side][0] += runs;
    G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + runs;
    addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score', 'Run', 't-run');
  }

  // Handle outs on bases
  var innOver = false;
  if(outsOnBases > 0){
    for(var oi = 0; oi < outsOnBases; oi++){
      addLog('Runner out on basepaths', 'Out', 't-out');
      innOver = addOut();
      if(innOver) break; // inning flipped, stop adding outs
    }
  }

  closeRunnerPicker();
  if(!innOver){
    finishHit(side, rp.batterName, rp.hitBases);
  } else {
    // Inning ended on a runner out — batter's PA is complete, advance silently
    advanceBatterSilent(side);
    // Still need to reset count and error toggle
    G.balls = 0; G.strikes = 0; G.fouls = 0;
    renderCount(); renderBases(); renderScore(); renderLineup(side);
    if(hitWithErr){ hitWithErr = false;
      var btn2 = document.getElementById('hitErrToggle');
      var hint2 = document.getElementById('hitErrHint');
      if(btn2) btn2.className = 'hit-err-toggle';
      if(hint2) hint2.textContent = '';
    }
  }
}

// Auto-advance: use the old uniform advancement logic as a fallback
function rpAutoAdvance(){
  if(!_rpState) return;
  var rp = _rpState;
  var side = rp.side;

  var runs = advanceRunners(side, rp.hitBases);
  G.bases[rp.hitBases - 1] = rp.batterName;
  if(runs > 0){
    creditRBI(side, runs);
    addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score', 'Run', 't-run');
  }

  closeRunnerPicker();
  finishHit(side, rp.batterName, rp.hitBases);
}

function closeRunnerPicker(){
  _rpState = null;
  var overlay = document.getElementById('rpOverlay');
  if(overlay) overlay.remove();
}

// opts.noSave: caller already took the undo snapshot.
// opts.noPitch: the pitch was already counted (ABS overturn of a ball).
function recordKO(type, opts){
  opts = opts || {};
  if(!opts.noSave) saveState();
  var side = batting();
  var idx = abIdx(side);
  var nm = curName(side, idx);
  var h = activeHits(side, idx);
  if(!opts.noPitch) addPitch(fielding());
  addPitcherStat(fielding(), 'k');
  if(type === 'looking'){
    h.kl++;
    addLog(nm + ' — strikeout looking', '&#x24C0;', 't-kl');
    logBatter(side, idx, 'ꓘ');
  } else {
    h.ks++;
    addLog(nm + ' — strikeout swinging', 'K', 't-ks');
    logBatter(side, idx, 'K');
  }
  var innOver = addOut();
  renderLineup(side);
  if(!innOver){
    nextBatter(side);
  } else {
    // Inning flipped, but this batter's PA is complete — advance index silently
    // so next time this team bats, the correct batter leads off.
    advanceBatterSilent(side);
  }
}

function editScore(side, idx, evt){
  // Don't open if already editing
  if(evt && evt.target.classList.contains('score-edit')) return;

  var cell = evt ? evt.target : null;
  if(!cell || cell.tagName !== 'TD') return;

  var cur = G.scores[side][idx];
  var curVal = cur === null ? '' : cur;

  // Replace cell content with an input
  var inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'score-edit';
  inp.value = curVal;
  inp.min = '0';
  inp.max = '99';
  // inputmode hint helps iOS show a numeric keypad without the full number-row
  inp.setAttribute('inputmode', 'numeric');
  cell.textContent = '';
  cell.appendChild(inp);

  // Defer focus to the next frame so iOS Safari has settled any existing
  // virtual-keyboard focus transition from a previously-active input.
  // Focusing synchronously after appendChild can race on iOS and leave the
  // input mounted but un-focused.
  var raf = window.requestAnimationFrame || function(cb){ return setTimeout(cb, 0); };
  raf(function(){
    // Guard against the cell being torn down between frames (e.g., a re-render).
    if(!inp.isConnected) return;
    inp.focus();
    inp.select();
  });

  function commit(){
    var v = inp.value.trim();
    saveState();
    var n = parseInt(v);
    G.scores[side][idx] = (v === '' || isNaN(n)) ? null : n;
    recalc();
    renderScore();
  }

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      inp.blur();
    } else if(e.key === 'Escape'){
      inp.removeEventListener('blur', commit);
      renderScore();
    }
  });
}

function recalc(){
  ['home', 'away'].forEach(function(side){
    G.rhe[side][0] = G.scores[side].reduce(function(a, b){
      return a + (b || 0);
    }, 0);
  });
}

function setInning(n){
  saveState();
  G.inning = n;
  renderScore();
  renderInn();
}

// Scroll the score strip so the currently-active inning is visible.
// Handy in extras (10+ innings push the active cell off-screen) and after
// scrolling back to review an earlier inning.
function scrollToCurrentInning(){
  var strip = document.querySelector('.score-strip');
  if(!strip) return;
  var activeCell = strip.querySelector('th.active-inn');
  if(!activeCell) return;
  try {
    activeCell.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
  } catch(e){
    // Older browsers without smooth-scroll option fall back to instant.
    activeCell.scrollIntoView();
  }
  haptic(5);
}

function changeInning(d){
  saveState();
  G.inning = Math.max(1, Math.min(G.totalInnings, G.inning + d));
  renderScore();
  renderInn();
}

function addExtraInning(){
  saveState();
  G.totalInnings++;
  G.scores.home.push(null);
  G.scores.away.push(null);
  G.inning = G.totalInnings;
  renderScore();
  renderInn();
  addLog('Extra inning '+G.totalInnings+' added','Inn '+G.totalInnings,'t-info');
}

function toggleHalf(){
  saveState();
  if(G.half==='top'){
    G.half='bot';
  } else {
    G.half='top';
    G.inning++;
    if(G.inning > G.totalInnings){
      G.totalInnings = G.inning;
      G.scores.home.push(null);
      G.scores.away.push(null);
    }
  }
  G.outs = 0;
  G.balls = 0;
  G.strikes = 0;
  G.fouls = 0;
  G.bases = [null, null, null];
  renderInn();
  renderScore();
  renderCount();
  renderOuts();
  renderBases();
}

// opts: same as recordKO.
function addBall(opts){
  opts = opts || {};
  if(G.balls >= 4) return;
  if(!opts.noSave) saveState();
  if(!opts.noPitch) addPitch(fielding());
  addPitcherBall(fielding(), 1);
  G.balls++;
  addLog('Ball ' + G.balls, 'Ball', 't-ball');

  if(G.balls === 4){
    var bside = batting();
    var bidx = abIdx(bside);
    activeHits(bside, bidx).bb++;
    addLog('Walk', 'Walk', 't-ball');
    logBatter(bside, bidx, 'BB');
    addPitcherStat(fielding(), 'bb');

    // Force-advance runners and place batter on 1B
    var bnm = curName(bside, bidx);
    var runs = forceAdvance(bside, bnm);
    if(runs > 0){
      creditRBI(bside, runs);
      addLog(runs + ' run' + (runs > 1 ? 's' : '') + ' score', 'Run', 't-run');
    }
    renderBases();
    renderScore();

    G.balls = 0; G.strikes = 0; G.fouls = 0;
    renderCount();
    renderLineup(bside);
    if(!checkWalkoff()){
      nextBatter(bside);
    }
    return;
  }
  renderCount();
}

// opts: same as recordKO.
function addStrike(opts){
  // Strike three is a strikeout — record it as one so the batter, pitcher and
  // scorecard all get the K. (Use the K / backwards-K buttons to pick looking.)
  if(G.strikes>=2){ recordKO('swinging', opts); return; }
  opts = opts || {};
  if(!opts.noSave) saveState();
  if(!opts.noPitch) addPitch(fielding());
  G.strikes++;
  addLog('Strike ' + G.strikes, 'K', 't-k');
  renderCount();
}

function addFoul(){
  saveState();
  addPitch(fielding());
  G.fouls++;
  if(G.strikes < 2){
    G.strikes++;
    addLog('Foul — strike ' + G.strikes + ' (' + G.fouls + ' fouls)', 'Foul', 't-foul');
  } else {
    addLog('Foul — holds at 2 (' + G.fouls + ' fouls)', 'Foul', 't-foul');
  }
  renderCount();
}

function clearCount(){
  saveState();
  G.balls = 0; G.strikes = 0; G.fouls = 0;
  renderCount();
}

// ── ABS Challenge System ──
var absState = { open: false, side: null, callType: null, result: null };

// callType: 'ball' (challenging a ball call → wants strike) or 'strike' (challenging a strike → wants ball)
// result: 'overturned' or 'upheld'

function toggleABSPicker(){
  absState.open = !absState.open;
  if(!absState.open){
    absState.side = null;
    absState.callType = null;
    absState.result = null;
  } else {
    // Default to batting team
    absState.side = batting();
  }
  renderABSPicker();
}

function absSetSide(side){
  absState.side = side;
  renderABSPicker();
  haptic();
}

function renderABSPicker(){
  var el = document.getElementById('absPicker');
  if(!el) return;
  if(!absState.open){
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = '';

  var side = absState.side || batting();
  var nm = curName(side, abIdx(side));
  var awaySide = 'away', homeSide = 'home';
  var awayName = team('away'), homeName = team('home');

  var html = '<div class="abs-picker">';
  html += '<div class="abs-picker-title">ABS Challenge</div>';

  // Team selector
  html += '<div class="abs-picker-row">';
  html += '<span class="abs-picker-label">Team:</span>';
  html += '<button class="abs-opt' + (side === 'away' ? ' sel' : '') + '" onclick="absSetSide(\'away\')">' + esc(awayName) + '</button>';
  html += '<button class="abs-opt' + (side === 'home' ? ' sel' : '') + '" onclick="absSetSide(\'home\')">' + esc(homeName) + '</button>';
  html += '</div>';

  // Current batter label
  html += '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Batter: ' + esc(shortName(nm)) + '</div>';

  // What call is being challenged?
  html += '<div class="abs-picker-row">';
  html += '<span class="abs-picker-label">Call was:</span>';
  html += '<button class="abs-opt' + (absState.callType === 'ball' ? ' sel' : '') + '" onclick="absSetCall(\'ball\')">Ball</button>';
  html += '<button class="abs-opt' + (absState.callType === 'strike' ? ' sel' : '') + '" onclick="absSetCall(\'strike\')">Strike</button>';
  html += '</div>';

  // Result
  html += '<div class="abs-picker-row">';
  html += '<span class="abs-picker-label">Result:</span>';
  html += '<button class="abs-opt' + (absState.result === 'overturned' ? ' sel-over' : '') + '" onclick="absSetResult(\'overturned\')">Overturned ✓</button>';
  html += '<button class="abs-opt' + (absState.result === 'upheld' ? ' sel-upheld' : '') + '" onclick="absSetResult(\'upheld\')">Upheld ✕</button>';
  html += '</div>';

  // Confirm / Cancel
  var ready = absState.callType && absState.result;
  html += '<div class="abs-picker-row">';
  html += '<button class="abs-confirm"' + (ready ? '' : ' disabled') + ' onclick="absConfirm()">' + (ready ? 'Record challenge' : 'Select call & result') + '</button>';
  html += '<button class="abs-cancel" onclick="toggleABSPicker()">Cancel</button>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
}

function absSetCall(type){
  absState.callType = type;
  renderABSPicker();
  haptic();
}

function absSetResult(result){
  absState.result = result;
  renderABSPicker();
  haptic();
}

// If the challenged pitch is the one that just ended the last plate appearance
// (ball four → walk, strike three → strikeout), return the undo snapshot from
// right before that pitch; otherwise null. Count 0-0 with that PA on top means
// no pitch has been thrown to the next batter, so the challenge must be about it.
function _absEndingPitchSnapshot(callType){
  if(G.balls || G.strikes || !HISTORY.length || !G.pas.length) return null;
  var last = G.pas[G.pas.length - 1];
  var ended = callType === 'ball' ? last.res === 'BB' : (last.res === 'K' || last.res === 'ꓘ');
  if(!ended) return null;
  var snap = JSON.parse(HISTORY[HISTORY.length - 1]);
  if(!snap.G || !snap.G.pas || snap.G.pas.length !== G.pas.length - 1) return null;
  return snap;
}

function absConfirm(){
  if(!absState.callType || !absState.result) return;

  var side = absState.side || batting(); // team that challenged
  var overturned = absState.result === 'overturned';
  var callType = absState.callType;
  var rewind = overturned ? _absEndingPitchSnapshot(callType) : null;

  // One undo snapshot covers the whole challenge (including any rewind)
  saveState();
  if(rewind){
    closeRunnerPicker();
    G = snapshotG(rewind.G);
    if(rewind.outState) Object.assign(outState, rewind.outState);
  }

  // Ensure abs tracking exists (backward compat)
  if(!G.abs) G.abs = {home:{challenged:0,overturned:0}, away:{challenged:0,overturned:0}};
  if(!G.abs[side]) G.abs[side] = {challenged:0, overturned:0};

  G.abs[side].challenged++;
  if(overturned) G.abs[side].overturned++;

  var bSide = batting();
  var nm = curName(bSide, abIdx(bSide));
  var callLabel = callType === 'ball' ? 'ball' : 'strike';
  var newCall = callType === 'ball' ? 'strike' : 'ball';
  var resultLabel = overturned ? 'OVERTURNED → ' + newCall : 'UPHELD';
  addLog(nm + ' (' + team(side) + ') ABS challenge: ' + callLabel + ' call — ' + resultLabel, 'ABS', 't-abs');

  if(overturned){
    // After a rewind the pitch hasn't been counted yet; otherwise it has, and
    // only the call changes.
    var opts = { noSave: true, noPitch: !rewind };
    if(callType === 'ball'){
      // Ball → strike. Strike three is a called strikeout.
      if(!rewind){
        if(G.balls > 0) G.balls--;
        addPitcherBall(fielding(), -1);
      }
      if(G.strikes >= 2){
        recordKO('looking', opts);
      } else {
        addStrike(opts);
        addLog('Count adjusted: ball → strike (' + G.balls + '-' + G.strikes + ')', 'ABS', 't-abs');
      }
    } else {
      // Strike → ball. Ball four is a walk (addBall handles it).
      if(!rewind && G.strikes > 0) G.strikes--;
      var walked = G.balls >= 3;
      addBall(opts);
      if(!walked) addLog('Count adjusted: strike → ball (' + G.balls + '-' + G.strikes + ')', 'ABS', 't-abs');
    }
  }

  absState.open = false;
  absState.side = null;
  absState.callType = null;
  absState.result = null;
  renderABSPicker();
  if(rewind) renderAll();
  else renderCount();
  saveToStorage();
}

// ── Game-over detection ──
// Returns true if the game is decided and should not advance.
// Rules:
//   - Before 9 innings (or totalInnings if extras): never over on outs alone
//   - Mid-inning (bottom half, 9th+): home team leads → walk-off (checked after runs score)
//   - End of top half (9th+): if home leads, skip bottom half
//   - End of bottom half (9th+): if not tied, game over
function isGameOver(){
  var homeR = G.rhe.home[0];
  var awayR = G.rhe.away[0];
  var isLateInning = G.inning >= 9;

  if(!isLateInning) return false;

  // After bottom of 9th+ (3 outs): game is over unless tied
  if(G.half === 'bot' && G.outs === 3){
    return homeR !== awayR;
  }

  // After top of 9th+ (3 outs): if home already leads, bottom not needed
  if(G.half === 'top' && G.outs === 3){
    return homeR > awayR;
  }

  return false;
}

// Walk-off check: called after a run scores in the bottom of the 9th+.
// Returns true if the home team just took the lead (walk-off).
function checkWalkoff(){
  if(G.half !== 'bot') return false;
  if(G.inning < 9) return false;
  var homeR = G.rhe.home[0];
  var awayR = G.rhe.away[0];
  if(homeR > awayR){
    addLog('WALK-OFF! ' + team('home') + ' wins ' + homeR + '-' + awayR, 'Final', 't-run');
    renderScore();
    return true;
  }
  return false;
}

function addOut(){
  if(G.outs>=3) G.outs=0;
  G.outs++;
  // Credit the out to the pitcher on the mound (drives IP)
  var outSide = fielding();
  G.pitchers[outSide][activePIdx(outSide)].outs++;
  renderPitchers(outSide);
  addLog('Out — '+G.outs,'Out','t-out');
  if(G.outs===3){
    addLog('3 outs — inning over','Inn','t-info');

    // If no runs scored this half-inning, set the score cell to 0
    var battingSide = batting();
    if(G.scores[battingSide][G.inning - 1] === null){
      G.scores[battingSide][G.inning - 1] = 0;
    }

    // Check if game is over before advancing
    if(isGameOver()){
      var homeR = G.rhe.home[0];
      var awayR = G.rhe.away[0];
      var winner = homeR > awayR ? team('home') : team('away');
      addLog('FINAL — ' + winner + ' wins ' + Math.max(homeR, awayR) + '-' + Math.min(homeR, awayR), 'Final', 't-run');
      G.outs = 0;
      G.balls = 0;
      G.strikes = 0;
      G.fouls = 0;
      G.bases = [null, null, null];
      renderCount();
      renderOuts();
      renderBases();
      renderScore();
      kbFlash('FINAL — ' + winner + ' wins!', '#E24B4A');
      return true; // signals inning ended (game over, no advance)
    }

    // Auto-advance: top→bot, bot→next inning top
    if(G.half==='top'){
      G.half='bot';
    } else {
      G.half='top';
      G.inning++;
      // Auto-add extra inning if needed
      if(G.inning > G.totalInnings){
        G.totalInnings = G.inning;
        G.scores.home.push(null);
        G.scores.away.push(null);
      }
    }
    G.outs = 0;
    G.balls = 0;
    G.strikes = 0;
    G.fouls = 0;
    G.bases = [null, null, null];

    // Log the leadoff batter for the new half-inning
    var newSide = batting();
    var newIdx = abIdx(newSide);
    addLog(curName(newSide, newIdx) + ' up to bat', 'AB', 't-info');

    // Flash inning change toast
    var halfLabel = G.half === 'top' ? '▲ Top' : '▼ Bot';
    kbFlash(halfLabel + ' ' + G.inning, '#185FA5');

    renderInn();
    renderScore();
    renderCount();
    renderOuts();
    renderBases();
    renderLineup('home');
    renderLineup('away');
    return true; // signals inning flipped
  }
  G.balls = 0;
  G.strikes = 0;
  G.fouls = 0;
  renderCount();
  renderOuts();
  return false;
}

function clearOuts(){
  saveState();
  G.outs = 0;
  renderOuts();
}

function toggleOut(i){
  saveState();
  G.outs = (i + 1 <= G.outs) ? i : i + 1;
  renderOuts();
}

function toggleBase(b){
  saveState();
  G.bases[b - 1] = baseOcc(b - 1) ? null : '?';
  renderBases();
}

function clearBases(){
  saveState();
  G.bases = [null, null, null];
  renderBases();
}

function addRun(){
  saveState();
  var side = batting();
  G.rhe[side][0]++;
  G.scores[side][G.inning - 1] = (G.scores[side][G.inning - 1] || 0) + 1;
  addLog('Run scored — ' + team(side) + ' ' + G.rhe[side][0], 'Run', 't-run');
  chargeRun(null);
  renderScore();
  checkWalkoff();
}
