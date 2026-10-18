// Presentation and navigation for the scorebook. All scoring uses the existing game model.
var workspaceView = 'live';

function setWorkspaceView(view, focus){
  var views = ['live', 'scorecard', 'lineups', 'notes'];
  if(views.indexOf(view) < 0) return;
  workspaceView = view;
  document.querySelector('.app').dataset.view = view;
  document.getElementById('scoringPanel').hidden = view !== 'live';
  document.getElementById('scorecardPanel').hidden = view !== 'live' && view !== 'scorecard';
  document.getElementById('lineupsPanel').hidden = view !== 'lineups';
  document.getElementById('notesPanel').hidden = view !== 'notes';
  document.querySelectorAll('.view-tabs [role=tab]').forEach(function(tab){
    var selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if(selected && focus) tab.focus();
  });
  document.getElementById('workspace').setAttribute('aria-labelledby', 'tab-' + view);
  if(view === 'scorecard') scheduleScorecardRender();
}

document.querySelector('.view-tabs').addEventListener('keydown', function(e){
  var tabs = ['live', 'scorecard', 'lineups', 'notes'];
  var index = tabs.indexOf(workspaceView);
  if(e.key === 'ArrowRight') index = (index + 1) % tabs.length;
  else if(e.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
  else if(e.key === 'Home') index = 0;
  else if(e.key === 'End') index = tabs.length - 1;
  else return;
  e.preventDefault();
  e.stopPropagation();
  setWorkspaceView(tabs[index], true);
});

function workspaceTeam(side){
  var selected = document.getElementById(side === 'away' ? 'teamAway' : 'teamHome').value;
  return TEAM_IDS[selected] ? selected : (side === 'away' ? 'Away team' : 'Home team');
}

function toggleLineScore(){
  var open = document.querySelector('.scoreboard').classList.toggle('show-linescore');
  document.querySelector('.mobile-linescore').setAttribute('aria-expanded', String(open));
}

function ordinalInning(n){
  var rem = n % 100;
  return n + ((rem >= 11 && rem <= 13) ? 'th' : ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th'));
}

function renderWorkspace(){
  if(!document.getElementById('matchup')) return;
  var away = workspaceTeam('away'), home = workspaceTeam('home');
  document.querySelector('.app').classList.toggle('has-plays', G.log.length > 0);
  document.querySelector('.app').classList.toggle('has-matchup', !!(TEAM_IDS[away] && TEAM_IDS[home]));
  var half = G.half === 'top' ? 'Top' : 'Bottom';
  function teamMarkup(name, side){
    var badge = TEAM_LOGOS[name]
      ? '<img src="' + TEAM_LOGOS[name] + '" alt="" />'
      : (side === 'away' ? 'A' : 'H');
    return '<div class="matchup-team"><div class="matchup-badge">' + badge + '</div><div class="matchup-name">' + esc(name) + '</div><div class="matchup-side">' + side.toUpperCase() + '</div></div>';
  }
  var matchup = teamMarkup(away, 'away') + '<div><div class="matchup-score">' + G.rhe.away[0] + '<em>:</em>' + G.rhe.home[0] + '</div><div class="matchup-inning">' + half.toUpperCase() + ' ' + G.inning + '</div></div>' + teamMarkup(home, 'home');
  // Avoid replacing logos on every pitch, preserving image loads and focus.
  var el = document.getElementById('matchup');
  if(el.dataset.markup !== matchup){ el.innerHTML = matchup; el.dataset.markup = matchup; }
  var occupied = G.bases.filter(Boolean).length;
  var bases = occupied === 3 ? 'Bases loaded' : occupied ? occupied + ' on base' : 'Bases empty';
  document.getElementById('boardSituation').textContent = half + ' of the ' + ordinalInning(G.inning) + ' · ' + G.outs + (G.outs === 1 ? ' out' : ' outs') + ' · ' + bases;
  document.getElementById('boardStatus').textContent = G.mlbFollow ? 'FOLLOWING MLB LIVE' : G.log.length ? 'SCORING IN PROGRESS' : 'READY FOR FIRST PITCH';
  document.getElementById('liveFollowBtn').firstChild.textContent = G.mlbFollow ? 'Manage live follow ' : 'Follow MLB live ';
  document.getElementById('boardVenue').textContent = G.notes.venue || 'YOUR GAME. YOUR SCORECARD.';
  document.getElementById('setupTip').hidden = !!(TEAM_IDS[away] && TEAM_IDS[home]) || G.log.length > 0;
  document.querySelector('.linescore-title span').textContent = TEAM_IDS[away] && TEAM_IDS[home] ? 'Tap a score to edit' : 'Select your teams below';
  var rawDate = G.notes.date;
  var date = rawDate ? new Date(rawDate + 'T12:00:00') : new Date();
  document.getElementById('gameDate').textContent = Number.isNaN(date.getTime()) ? 'BASEBALL, ONE PLAY AT A TIME' : date.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).toUpperCase();
  // Outs are interactive controls as well as state indicators.
  for(var i = 0; i < 3; i++){
    var out = document.getElementById('o' + i);
    out.setAttribute('aria-pressed', String(i < G.outs));
  }
}

// These small renders run for both manual scoring and MLB live updates.
['renderScore', 'renderInn', 'renderOuts', 'renderCount', 'renderBases', 'restoreNotes', 'saveNotes', 'renderLog'].forEach(function(name){
  var original = window[name];
  window[name] = function(){
    var value = original.apply(this, arguments);
    renderWorkspace();
    return value;
  };
});

for(var oi = 0; oi < 3; oi++){
  var outDot = document.getElementById('o' + oi);
  outDot.setAttribute('role', 'button');
  outDot.setAttribute('aria-label', 'Set outs to ' + (oi + 1));
  outDot.tabIndex = 0;
  outDot.addEventListener('keydown', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); this.click(); }
  });
}
setWorkspaceView('live');
renderWorkspace();
