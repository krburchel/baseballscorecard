// MLB Stats API: today's games and lineups, Check vs MLB, and catch-up.
// Loaded as a plain script; files share one global scope (see index.html for the order).

// ── Roster data ──
var ROSTERS = { home: [], away: [] };

 // [{name, pos, jersey}]
var ROSTER_LOADING = { home: false, away: false };

// ── Today's Games ──
function showTodaysGames(){
  var btn = document.getElementById('todayBtn');
  if(btn) btn.disabled = true;

  // Build the overlay immediately with loading state
  var overlay = document.createElement('div');
  overlay.className = 'games-overlay';
  overlay.id = 'gamesOverlay';
  overlay.onclick = function(e){ if(e.target === overlay) closeTodaysGames(); };
  overlay.innerHTML = '<div class="games-modal">'
    + '<div class="games-modal-hdr"><h3>📅 Today\'s Games</h3><button class="games-modal-close" onclick="closeTodaysGames()" aria-label="Close">&times;</button></div>'
    + '<div class="games-modal-body"><div class="games-loading">Loading today\'s schedule…</div></div>'
    + '</div>';
  document.body.appendChild(overlay);
  focusModalClose(overlay, '.games-modal-close');

  var today = new Date();
  var dateStr = today.getFullYear() + '-'
    + String(today.getMonth() + 1).padStart(2, '0') + '-'
    + String(today.getDate()).padStart(2, '0');

  fetch('https://statsapi.mlb.com/api/v1/schedule?date=' + dateStr + '&sportId=1&hydrate=lineups,probablePitcher')
    .then(function(r){ return r.json(); })
    .then(function(data){
      if(btn) btn.disabled = false;
      var games = [];
      if(data.dates && data.dates.length > 0){
        games = data.dates[0].games || [];
      }
      renderGamesModal(games);
    })
    .catch(function(err){
      if(btn) btn.disabled = false;
      var body = overlay.querySelector('.games-modal-body');
      if(body) body.innerHTML = '<div class="games-empty">Could not load schedule. Check your connection and try again.</div>';
    });
}

function closeTodaysGames(){
  var el = document.getElementById('gamesOverlay');
  if(el) el.remove();
}

function renderGamesModal(games){
  var overlay = document.getElementById('gamesOverlay');
  if(!overlay) return;
  var body = overlay.querySelector('.games-modal-body');
  if(!body) return;

  if(!games.length){
    body.innerHTML = '<div class="games-empty">No games scheduled for today.</div>';
    return;
  }

  var html = '';
  games.forEach(function(game, gi){
    var away = game.teams.away;
    var home = game.teams.home;
    var awayName = TEAM_NAMES[away.team.id] || away.team.name;
    var homeName = TEAM_NAMES[home.team.id] || home.team.name;
    var awayLogo = TEAM_LOGOS[awayName] || '';
    var homeLogo = TEAM_LOGOS[homeName] || '';

    // Game time
    var timeStr = '';
    var statusCls = 'pre';
    var statusLabel = '';
    var state = game.status && game.status.abstractGameState;
    if(state === 'Live'){
      statusCls = 'live';
      var inning = game.linescore ? game.linescore.currentInningOrdinal || '' : '';
      statusLabel = '● Live' + (inning ? ' ' + inning : '');
    } else if(state === 'Final'){
      statusCls = 'final';
      statusLabel = 'Final';
    } else {
      // Pre-game — show start time
      try {
        var d = new Date(game.gameDate);
        var h = d.getHours();
        var m = d.getMinutes();
        var ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        timeStr = h + ':' + String(m).padStart(2, '0') + ' ' + ampm;
      } catch(e){ timeStr = ''; }
      statusLabel = timeStr || 'Scheduled';
    }

    // Probable pitchers
    var awayPitcher = away.probablePitcher ? away.probablePitcher.fullName : '';
    var homePitcher = home.probablePitcher ? home.probablePitcher.fullName : '';
    var pitcherHint = '';
    if(awayPitcher || homePitcher){
      pitcherHint = '<div style="font-size:11px;color:var(--muted);margin-top:2px;margin-left:26px">'
        + (awayPitcher ? awayPitcher : 'TBD') + ' vs ' + (homePitcher ? homePitcher : 'TBD')
        + '</div>';
    }

    html += '<div class="game-card" onclick="loadTodaysGame(' + gi + ')">';
    html += '<div class="game-card-teams">';
    html += '<div class="game-card-away">'
      + (awayLogo ? '<img class="game-card-logo" src="' + awayLogo + '" alt="" />' : '')
      + awayName + '</div>';
    html += '<div class="game-card-at">at</div>';
    html += '<div class="game-card-home">'
      + (homeLogo ? '<img class="game-card-logo" src="' + homeLogo + '" alt="" />' : '')
      + homeName + '</div>';
    html += pitcherHint;
    html += '</div>';
    html += '<span class="game-card-status ' + statusCls + '">' + statusLabel + '</span>';
    html += '</div>';
  });

  body.innerHTML = html;

  // Stash games data for loadTodaysGame
  window._todaysGames = games;
}

function loadTodaysGame(gameIdx){
  var games = window._todaysGames;
  if(!games || !games[gameIdx]) return;
  var game = games[gameIdx];

  // Confirm if there's existing game data
  if(G.log.length > 0){
    showConfirm({
      title:'Replace current game?',
      message:'Load this game? Your current scorecard will be reset.',
      confirmLabel:'Load',
      cancelLabel:'Cancel',
      tone:'warn'
    }).then(function(ok){
      if(ok) _doLoadTodaysGame(game);
    });
    return;
  }
  _doLoadTodaysGame(game);
}

function _doLoadTodaysGame(game){
  // Save current game to its slot before loading a new one
  var activeId = gmGetActiveId();
  if(activeId && G.log.length > 0){
    gmSaveToSlot(activeId);
  }

  // Reset the game
  resetGameSilent();

  // Start a new game slot for this game
  var newId = gmGenId();
  gmSetActiveId(newId);

  var away = game.teams.away;
  var home = game.teams.home;
  var awayName = TEAM_NAMES[away.team.id] || away.team.name;
  var homeName = TEAM_NAMES[home.team.id] || home.team.name;

  // Set team dropdowns
  document.getElementById('teamAway').value = awayName;
  document.getElementById('teamHome').value = homeName;
  onTeamChange();

  // Remember MLB's id for Check vs MLB
  G.mlbGamePk = game.gamePk;
  G.mlbGameTeams = awayName + ' @ ' + homeName;

  // Populate lineups from game data
  populateLineupFromGame(game, 'away');
  populateLineupFromGame(game, 'home');

  // Set probable pitchers
  if(away.probablePitcher){
    G.pitchers.away[0].name = away.probablePitcher.fullName;
    renderPitchers('away');
  }
  if(home.probablePitcher){
    G.pitchers.home[0].name = home.probablePitcher.fullName;
    renderPitchers('home');
  }

  // Auto-populate game notes from API data
  try {
    // Date
    if(game.gameDate){
      var gd = new Date(game.gameDate);
      var yyyy = gd.getFullYear();
      var mm = String(gd.getMonth()+1).padStart(2,'0');
      var dd = String(gd.getDate()).padStart(2,'0');
      G.notes.date = yyyy+'-'+mm+'-'+dd;
      // First pitch time
      var hh = gd.getHours();
      var mi = gd.getMinutes();
      G.notes.firstPitch = String(hh).padStart(2,'0')+':'+String(mi).padStart(2,'0');
    }
    // Venue
    if(game.venue && game.venue.name){
      G.notes.venue = game.venue.name;
    }
    // Game type from seriesDescription or gameType
    if(game.gameType){
      var gtMap = {R:'regular',S:'spring',A:'asg',F:'wild',D:'alds',L:'alcs',W:'ws'};
      var mapped = gtMap[game.gameType];
      // D/L codes cover both leagues; seriesDescription says "NL Division Series" etc.
      if(/^NL\b|National League/.test(game.seriesDescription || '')){
        if(mapped === 'alds') mapped = 'nlds';
        else if(mapped === 'alcs') mapped = 'nlcs';
      }
      if(mapped) G.notes.gameType = mapped;
      if(POSTSEASON[mapped] && game.seriesGameNumber) G.notes.seriesGame = String(game.seriesGameNumber);
    }
    // Dome detection from venue
    var domeVenues = ['Tropicana Field','Chase Field','T-Mobile Park','Globe Life Field','LoanDepot Park','Minute Maid Park','Rogers Centre','American Family Field'];
    if(G.notes.venue && domeVenues.indexOf(G.notes.venue) >= 0){
      G.notes.weather = 'dome';
    }
    restoreNotes();
  } catch(e){}

  closeTodaysGames();
  saveToStorage();
  addLog('Loaded: ' + awayName + ' @ ' + homeName, 'Game', 't-info');
}

function populateLineupFromGame(game, side){
  // The lineups hydration puts lineup data on the game object
  var lineups = game.lineups;
  if(!lineups) return;

  var batters = side === 'away' ? lineups.awayPlayers : lineups.homePlayers;
  if(!batters || !batters.length) return;

  // batters is an array of player objects in batting order
  for(var i = 0; i < Math.min(batters.length, 9); i++){
    var player = batters[i];
    if(!player) continue;
    var name = player.fullName || '';
    G.lineup[side][i].name = name;
    // Try to find position from already-loaded roster
    var pos = findPlayerPos(side, name);
    if(pos) G.lineup[side][i].pos = pos;
  }
  renderLineup(side);

  // Stash the game so we can backfill positions once roster loads
  window._pendingLineupGame = window._pendingLineupGame || {};
  window._pendingLineupGame[side] = game;
}

function findPlayerPos(side, name){
  var roster = ROSTERS[side];
  if(!roster || !roster.length) return null;
  var match = roster.filter(function(r){ return r.name === name; })[0];
  return match ? match.pos : null;
}

// Returns true if this lineup slot has any recorded in-game activity that we
// should never overwrite (any hit/out/AB credited, or any sub brought in).
// Used by refreshLineups to preserve slots that already have stats attached.
function slotHasActivity(sl){
  if(!sl) return false;
  if(sl.subs && sl.subs.length > 0) return true;
  if(sl.hits){
    for(var k in sl.hits){
      if(sl.hits[k] > 0) return true;
    }
  }
  return false;
}

// Re-fetch today's schedule and diff-apply any lineup changes to the current
// teams. Skips slots that already have in-game activity, so mid-game scratches
// handled via the Sub button are never clobbered. Useful for pre-first-pitch
// scratches when the lineup card changes between when you pulled it and when
// the game actually starts.
function refreshLineups(){
  var awayName = document.getElementById('teamAway').value;
  var homeName = document.getElementById('teamHome').value;
  if(!awayName || awayName === '— Select Team —' || !homeName || homeName === '— Select Team —'){
    kbFlash('Select both teams first', '#BA7517');
    return;
  }

  var btn = document.getElementById('refreshLineupsBtn');
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Refreshing lineups…'; }

  var today = new Date();
  var dateStr = today.getFullYear() + '-'
    + String(today.getMonth() + 1).padStart(2, '0') + '-'
    + String(today.getDate()).padStart(2, '0');

  fetch('https://statsapi.mlb.com/api/v1/schedule?date=' + dateStr + '&sportId=1&hydrate=lineups,probablePitcher')
    .then(function(r){ return r.json(); })
    .then(function(data){
      var games = (data.dates && data.dates[0] && data.dates[0].games) || [];
      // Match by team names — order-sensitive so double-headers with flipped home/away resolve correctly
      var game = games.filter(function(g){
        var aN = TEAM_NAMES[g.teams.away.team.id] || g.teams.away.team.name;
        var hN = TEAM_NAMES[g.teams.home.team.id] || g.teams.home.team.name;
        return aN === awayName && hN === homeName;
      })[0];

      if(!game){
        kbFlash('Game not in today\'s schedule', '#BA7517');
        return;
      }

      var changes = applyLineupDiff(game, 'away') + applyLineupDiff(game, 'home');
      var pChanges = applyPitcherDiff(game, 'away') + applyPitcherDiff(game, 'home');

      if(changes === 0 && pChanges === 0){
        kbFlash('No lineup changes', '#185FA5');
      } else {
        var parts = [];
        if(changes > 0) parts.push(changes + ' lineup change' + (changes > 1 ? 's' : ''));
        if(pChanges > 0) parts.push(pChanges + ' pitcher change' + (pChanges > 1 ? 's' : ''));
        kbFlash(parts.join(', ') + ' applied', '#1D9E75');
        addLog('Refreshed lineups from MLB (' + parts.join(', ') + ')', 'Lineup', 't-info');
        saveToStorage();
      }
    })
    .catch(function(err){
      kbFlash('Refresh failed — check connection', '#E24B4A');
    })
    .then(function(){
      if(btn){ btn.disabled = false; btn.textContent = '🔄 Refresh lineups'; }
    });
}

// Apply lineup diff for one side. Returns number of slots changed.
function applyLineupDiff(game, side){
  var lineups = game.lineups;
  if(!lineups) return 0;
  var batters = side === 'away' ? lineups.awayPlayers : lineups.homePlayers;
  if(!batters || !batters.length) return 0;

  var changed = 0;
  for(var i = 0; i < Math.min(batters.length, 9); i++){
    var player = batters[i];
    if(!player) continue;
    var apiName = player.fullName || '';
    if(!apiName) continue;

    var sl = G.lineup[side][i];
    // Preserve any slot that already has in-game activity
    if(slotHasActivity(sl)) continue;
    // Skip if name already matches
    if(sl.name === apiName) continue;

    sl.name = apiName;
    var pos = findPlayerPos(side, apiName);
    if(pos) sl.pos = pos;
    changed++;
  }
  if(changed > 0) renderLineup(side);
  // Stash for position backfill once roster loads (matches populateLineupFromGame behavior)
  if(changed > 0){
    window._pendingLineupGame = window._pendingLineupGame || {};
    window._pendingLineupGame[side] = game;
  }
  return changed;
}

// Apply probable-pitcher diff. Only updates pitchers with 0 pitches thrown so
// far, so a pitcher who's already been in the game isn't renamed out from
// under you. Returns number of pitcher slots changed.
function applyPitcherDiff(game, side){
  var teamData = side === 'away' ? game.teams.away : game.teams.home;
  if(!teamData || !teamData.probablePitcher) return 0;
  var apiName = teamData.probablePitcher.fullName;
  if(!apiName) return 0;

  // Only touch pitcher slot 0 (the probable starter) if they haven't thrown.
  var p = G.pitchers[side][0];
  if(!p || p.pitches > 0) return 0;
  if(p.name === apiName) return 0;

  p.name = apiName;
  renderPitchers(side);
  return 1;
}

// Called after roster finishes loading to backfill positions
function backfillPositions(side){
  if(!window._pendingLineupGame || !window._pendingLineupGame[side]) return;
  var changed = false;
  for(var i = 0; i < 9; i++){
    var sl = G.lineup[side][i];
    if(sl.name && sl.pos === '—'){
      var pos = findPlayerPos(side, sl.name);
      if(pos){
        sl.pos = pos;
        changed = true;
      }
    }
  }
  if(changed) renderLineup(side);
  delete window._pendingLineupGame[side];
}

function fetchRoster(side, teamName) {
  var teamId = TEAM_IDS[teamName];
  if(!teamId){ ROSTERS[side]=[]; renderLineup(side); return; }
  ROSTER_LOADING[side] = true;
  ROSTERS[side] = [];
  renderLineup(side); // show loading state
  fetch('https://statsapi.mlb.com/api/v1/teams/'+teamId+'/roster?rosterType=40Man&season='+new Date().getFullYear())
    .then(function(r){ return r.json(); })
    .then(function(data){
      ROSTERS[side] = (data.roster||[]).map(function(p){
        return {
          id: p.person.id,
          name: p.person.fullName,
          pos: (p.position && p.position.abbreviation) || '—',
          jersey: p.jerseyNumber || ''
        };
      }).sort(function(a,b){ return a.name.localeCompare(b.name); });
      ROSTER_LOADING[side] = false;
      renderLineup(side);
      backfillPositions(side);
    })
    .catch(function(){
      ROSTER_LOADING[side] = false;
      ROSTERS[side] = [];
      renderLineup(side);
    });
}

// ══ Check vs MLB ══
// Compares the scorecard with MLB's official play-by-play (the public live
// feed) and lists the differences. Each one is fixed with a tap ("Use MLB's")
// or dismissed ("Keep mine"); nothing changes otherwise, and every fix is one
// undo step. Plays are matched per half-inning by lineup spot.
var MLB_API = 'https://statsapi.mlb.com/api/v1';

var MLB_FEED = 'https://statsapi.mlb.com/api/v1.1/game/';

var _mlb = null;

            // { loading } | { error } | { feed, fetchedAt }
var _mlbShowKept = false;

// Plate-appearance-ending events → how the app scores them. Anything else
// (steals, pickoffs, inning-ending caught stealing…) isn't a plate appearance.
var MLB_PA_EVENTS = {
  single:'1B', double:'2B', triple:'3B', home_run:'HR',
  walk:'BB', intent_walk:'IBB', hit_by_pitch:'HBP',
  strikeout:'K', strikeout_double_play:'K', strikeout_triple_play:'K',
  field_out:'OUT', double_play:'OUT', triple_play:'OUT',
  grounded_into_double_play:'GDP', grounded_into_triple_play:'GDP',
  force_out:'FC', fielders_choice:'FC', fielders_choice_out:'FC',
  sac_fly:'SF', sac_fly_double_play:'SF', sac_bunt:'SAC', sac_bunt_double_play:'SAC',
  field_error:'E', catcher_interf:'CI'
};

// "José Caballero Jr." → "jose caballero"
function mlbNormName(s){
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

// One MLB play → app notation (F8, 6-3 as G6-3, ꓘ, E6, FC6-4, SF9…)
function mlbNotation(play){
  var kind = MLB_PA_EVENTS[play.result.eventType];
  var batterId = play.matchup.batter.id;
  // Fielders in order — other runners' credits first, then the batter's, so a
  // double play reads 6-4-3. Errors are tracked separately.
  var seq = [], errPos = '', batterPutout = '';
  (play.runners || []).slice().sort(function(a, b){
    return (a.details.runner.id === batterId) - (b.details.runner.id === batterId);
  }).forEach(function(rn){
    (rn.credits || []).forEach(function(c){
      var pos = c.position && c.position.code;
      if(!pos || !/^\d$/.test(pos)) return;
      if(/error/.test(c.credit)){ if(!errPos) errPos = pos; return; }
      if(c.credit === 'f_putout' && rn.details.runner.id === batterId) batterPutout = pos;
      if(/^f_(putout|assist|fielded_ball)$/.test(c.credit) && seq[seq.length - 1] !== pos) seq.push(pos);
    });
  });
  var traj = '';
  (play.playEvents || []).forEach(function(e){ if(e.hitData && e.hitData.trajectory) traj = e.hitData.trajectory; });
  var pitches = (play.playEvents || []).filter(function(e){ return e.isPitch; });
  var lastCall = pitches.length ? ((pitches[pitches.length - 1].details || {}).call || {}).code : '';

  switch(kind){
    case 'K':   return lastCall === 'C' ? 'ꓘ' : 'K';
    case 'SF':  return 'SF' + (batterPutout || seq[0] || '');
    case 'FC':  return 'FC' + seq.join('-');
    case 'E':   return 'E' + (errPos || seq[0] || '');
    case 'GDP': return 'G' + seq.join('-');
    case 'OUT':
      var air = /fly|line|popup/.test(traj) || (!traj && seq.length === 1 && +seq[0] >= 7);
      return air ? 'F' + (batterPutout || seq[seq.length - 1] || '') : 'G' + seq.join('-');
    default:    return kind; // 1B 2B 3B HR BB IBB HBP SAC CI
  }
}

// Same result? Category must match; fielders only need the first to agree
// (a 6-4-3 double play may be stored as G6-4), and are skipped if either
// side didn't record them.
function mlbResCat(res){
  if(/^(1B|2B|3B|HR)/.test(res)) return res.slice(0, 2);
  if(/^SF/.test(res)) return 'SF';
  if(/^FC/.test(res)) return 'FC';
  if(/^E\d?$/.test(res)) return 'E';
  if(/^F\d/.test(res)) return 'F';
  if(/^G\d/.test(res)) return 'G';
  return res;
}

function mlbSameResult(a, b){
  var ca = mlbResCat(a);
  if(ca !== mlbResCat(b)) return false;
  if(!/^(F|G|SF|FC|E)$/.test(ca)) return true;
  var fa = (/\d/.exec(a) || [''])[0], fb = (/\d/.exec(b) || [''])[0];
  return !fa || !fb || fa === fb;
}

function mlbHalfOrder(inn, half){ return inn * 2 + (half === 'bot' ? 1 : 0); }

function mlbHalfName(inn, half){ return (half === 'top' ? 'Top ' : 'Bottom ') + inn; }

// Same as mlbPaText, as HTML, with the parts that differ highlighted — and
// spelled out when missing ("no out number"), so rows like "K" vs "K, out 1"
// read clearly.
var MLB_FIELD_LABELS = { result:'result', bases:'bases reached', out:'out number' };

function mlbPaHtml(res, reached, out, fields){
  function mark(on, text){ return on ? '<mark class="mlb-diff">' + esc(text) + '</mark>' : esc(text); }
  var diffBases = fields.indexOf('bases') >= 0, diffOut = fields.indexOf('out') >= 0;
  var html = mark(fields.indexOf('result') >= 0, paLabel(res));
  if(reached > 0 || diffBases){
    html += ', ' + mark(diffBases, reached === 4 ? 'scored' : reached > 0 ? 'reached ' + ['', '1st', '2nd', '3rd'][reached] : 'didn\'t reach');
  }
  if(out || diffOut) html += ', ' + mark(diffOut, out ? 'out ' + out : 'no out number');
  return html;
}

function mlbPaText(res, reached, out){
  return paLabel(res)
    + (reached === 4 ? ', scored' : reached > 0 ? ', reached ' + ['', '1st', '2nd', '3rd'][reached] : '')
    + (out ? ', out ' + out : '');
}

// MLB plate appearances by half-inning, each with how far the batter got
// (followed through later plays) and which out he made.
function mlbPlays(feed){
  var box = feed.liveData.boxscore.teams;
  var slotOf = {};
  ['away', 'home'].forEach(function(side){
    var pl = box[side].players || {};
    Object.keys(pl).forEach(function(k){
      var bo = pl[k].battingOrder;
      if(bo) slotOf[pl[k].person.id] = Math.floor(parseInt(bo, 10) / 100) - 1;
    });
  });
  var halves = {}, fates = {}, pos = 0, prevOrder = -1, prevBases = {};
  (feed.liveData.plays.allPlays || []).forEach(function(p){
    var a = p.about;
    if(!a) return;
    var half = a.halfInning === 'top' ? 'top' : 'bot';
    var order = mlbHalfOrder(a.inning, half);
    if(order > pos) pos = order;
    // RISP as MLB counts it: runners on base when the plate appearance ends — the
    // previous play's runners plus steals / wild pitches etc. during this at-bat.
    // (MLB's own splits.menOnBase describes the bases after the play.)
    var on = order === prevOrder ? Object.assign({}, prevBases) : {};
    var lastIdx = (p.playEvents || []).length - 1;
    (p.runners || []).slice().sort(function(x, y){ return (x.details.playIndex || 0) - (y.details.playIndex || 0); }).forEach(function(rn){
      if((rn.details.playIndex || 0) >= lastIdx) return;
      var mv = rn.movement || {};
      if(mv.start) delete on[mv.start];
      if(mv.end && mv.end !== 'score' && !mv.isOut) on[mv.end] = true;
    });
    var rispBefore = !!(on['2B'] || on['3B']);
    prevOrder = order;
    prevBases = {};
    if(p.matchup.postOnFirst) prevBases['1B'] = true;
    if(p.matchup.postOnSecond) prevBases['2B'] = true;
    if(p.matchup.postOnThird) prevBases['3B'] = true;
    if(MLB_PA_EVENTS[p.result.eventType] && a.isComplete !== false){
      var b = p.matchup.batter;
      var e = {
        inn: a.inning, half: half, side: half === 'top' ? 'away' : 'home', order: order,
        batterId: b.id, batter: b.fullName, slot: slotOf[b.id] !== undefined ? slotOf[b.id] : -1,
        atBat: a.atBatIndex, pitcher: p.matchup.pitcher.fullName, res: mlbNotation(p),
        reached: 0, out: 0, desc: p.result.description || '', risp: rispBefore
      };
      (halves[order] = halves[order] || []).push(e);
      fates[b.id] = e;
    }
    (p.runners || []).forEach(function(rn){
      var f = fates[rn.details.runner.id];
      if(!f || f.order !== order) return;
      var mv = rn.movement || {};
      if(mv.isOut) f.out = mv.outNumber || f.out;
      else {
        var to = {'1B':1, '2B':2, '3B':3, score:4}[mv.end];
        if(to > f.reached) f.reached = to;
      }
    });
  });
  // Slot fallback by name for batters MLB didn't give a batting order
  Object.keys(halves).forEach(function(k){
    halves[k].forEach(function(e){
      if(e.slot < 0) e.slot = mlbSlotByName(e.side, e.batter);
    });
  });
  return { halves: halves, pos: pos };
}

function mlbSlotByName(side, name){
  var n = mlbNormName(name);
  for(var i = 0; i < 9; i++){
    var sl = G.lineup[side][i];
    if(mlbNormName(sl.name) === n) return i;
    for(var s = 0; s < sl.subs.length; s++) if(mlbNormName(sl.subs[s].name) === n) return i;
  }
  return -1;
}

// Pair app and MLB plate appearances within a half by lineup spot, allowing
// for one missing or extra PA at a time.
function mlbAlign(app, mlb){
  var out = [], i = 0, j = 0;
  while(i < app.length || j < mlb.length){
    if(i >= app.length){ out.push({ mlb: mlb[j++] }); continue; }
    if(j >= mlb.length){ out.push({ app: app[i++] }); continue; }
    if(app[i].pa.slot === mlb[j].slot){ out.push({ app: app[i++], mlb: mlb[j++] }); continue; }
    if(j + 1 < mlb.length && app[i].pa.slot === mlb[j + 1].slot){ out.push({ mlb: mlb[j++] }); continue; }
    if(i + 1 < app.length && app[i + 1].pa.slot === mlb[j].slot){ out.push({ app: app[i++] }); continue; }
    out.push({ app: app[i++], mlb: mlb[j++] });
  }
  return out;
}

// Everything that differs, as a list of fixable rows.
// The at-bat MLB has in progress, when the scorecard is caught up and on the same
// batter: MLB's count, fouls, and the pitcher's line so far. Null otherwise.
function mlbCurrentAtBat(feed){
  var plays = feed.liveData.plays.allPlays || [], last = plays[plays.length - 1];
  if(!last || last.about.isComplete !== false || (feed.gameData.status || {}).abstractGameState === 'Final') return null;
  var a = last.about, half = a.halfInning === 'top' ? 'top' : 'bot', side = half === 'top' ? 'away' : 'home';
  if(a.inning !== G.inning || half !== G.half || mlbCatchUpCount(feed) > 0) return null;
  var batter = last.matchup.batter.fullName;
  if(mlbNormName(curName(side, abIdx(side))) !== mlbNormName(batter)) return null;
  var pitches = (last.playEvents || []).filter(function(e){ return e.isPitch; });
  var fSide = side === 'away' ? 'home' : 'away', pIdx = -1;
  G.pitchers[fSide].forEach(function(p, i){ if(pIdx < 0 && mlbNormName(p.name) === mlbNormName(last.matchup.pitcher.fullName)) pIdx = i; });
  var st = ((feed.liveData.boxscore.teams[fSide].players['ID' + last.matchup.pitcher.id] || {}).stats || {}).pitching || {};
  return {
    batter: batter, side: side, fSide: fSide, pIdx: pIdx, atBat: a.atBatIndex,
    balls: Math.min(3, last.count.balls || 0), strikes: Math.min(2, last.count.strikes || 0), n: pitches.length,
    fouls: pitches.filter(function(e){ return /^Foul(?! Tip)/i.test((e.details && e.details.description) || ''); }).length,
    pitches: st.numberOfPitches || 0, pBalls: Math.max(0, (st.numberOfPitches || 0) - (st.strikes || 0))
  };
}

// Take MLB's count for the at-bat in progress (and the pitcher's pitch count with it)
function mlbApplyCount(c){
  G.balls = c.balls; G.strikes = c.strikes; G.fouls = c.fouls;
  var p = c.pIdx >= 0 ? G.pitchers[c.fSide][c.pIdx] : null;
  if(p){ p.pitches = c.pitches; p.balls = c.pBalls; }
}

function mlbDiffs(feed){
  var m = mlbPlays(feed);
  var appPos = mlbHalfOrder(G.inning, G.half);
  var settled = Math.min(appPos, m.pos); // halves both sides have finished
  var res = { plays: [], pitchers: [], runs: [], count: [], matched: 0, pending: 0, behind: 0, mlbPos: m.pos, rispMissing: [] };

  var orders = {};
  Object.keys(m.halves).forEach(function(k){ orders[k] = true; });
  G.pas.forEach(function(pa){ orders[mlbHalfOrder(pa.inn, pa.half)] = true; });

  Object.keys(orders).map(Number).sort(function(a, b){ return a - b; }).forEach(function(order){
    var inn = Math.floor(order / 2), half = order % 2 ? 'bot' : 'top';
    var side = half === 'top' ? 'away' : 'home';
    var app = [];
    G.pas.forEach(function(pa, idx){ if(pa.side === side && pa.inn === inn && pa.half === half) app.push({ pa: pa, idx: idx }); });
    var mlb = m.halves[order] || [];
    var prevIdx = null, ordinal = 0;
    mlbAlign(app, mlb).forEach(function(pair){
      var a = pair.app, e = pair.mlb;
      var base = side + '|' + order + '|';
      if(a && e){
        if(a.pa.risp === undefined && e.risp !== undefined) res.rispMissing.push({ paIdx: a.idx, risp: e.risp });
        var fields = [];
        if(!mlbSameResult(a.pa.res, e.res)) fields.push('result');
        if(order < settled){
          if(a.pa.reached !== e.reached) fields.push('bases');
          if((a.pa.out || 0) !== (e.out || 0)) fields.push('out');
        }
        if(fields.length){
          res.plays.push({ type:'play', key:'p|' + base + ordinal + '|' + e.res + e.reached + e.out, inn:inn, half:half, side:side, paIdx:a.idx, mlb:e, fields:fields });
        } else res.matched++;
        prevIdx = a.idx;
        ordinal++;
      } else if(e){
        if(order >= appPos) res.behind++;
        else res.plays.push({ type:'missing', key:'m|' + base + ordinal + '|' + e.batterId + e.res, inn:inn, half:half, side:side, afterIdx:prevIdx, mlb:e });
        ordinal++;
      } else {
        if(order >= m.pos) res.pending++;
        else res.plays.push({ type:'extra', key:'x|' + base + a.idx + '|' + a.pa.slot + a.pa.res, inn:inn, half:half, side:side, paIdx:a.idx });
        prevIdx = a.idx;
      }
    });
  });

  // Pitching lines, matched by name (one unnamed pitcher pairs with one unmatched MLB pitcher)
  var box = feed.liveData.boxscore.teams;
  ['away', 'home'].forEach(function(side){
    var staff = G.pitchers[side];
    var used = {}, unmatchedMlb = [];
    var mlbStaff = (box[side].pitchers || []).map(function(id){
      var pl = box[side].players['ID' + id];
      var st = (pl && pl.stats && pl.stats.pitching) || {};
      return {
        name: pl ? pl.person.fullName : 'Pitcher', key: 'id' + id,
        line: { outs: parseIP(st.inningsPitched || '0') || 0, h: st.hits || 0, r: st.runs || 0, er: st.earnedRuns || 0,
                bb: st.baseOnBalls || 0, k: st.strikeOuts || 0, hr: st.homeRuns || 0,
                pitches: st.numberOfPitches || 0, balls: Math.max(0, (st.numberOfPitches || 0) - (st.strikes || 0)) }
      };
    });
    mlbStaff.forEach(function(mp){
      var n = mlbNormName(mp.name), idx = -1;
      staff.forEach(function(p, i){ if(idx < 0 && !used[i] && mlbNormName(p.name) === n) idx = i; });
      if(idx < 0){ unmatchedMlb.push(mp); return; }
      used[idx] = true;
      mp.appIdx = idx;
    });
    var unnamed = staff.map(function(p, i){ return i; }).filter(function(i){ return !used[i] && !mlbNormName(staff[i].name); });
    if(unmatchedMlb.length === 1 && unnamed.length === 1){ unmatchedMlb[0].appIdx = unnamed[0]; unmatchedMlb = []; }
    mlbStaff.forEach(function(mp){
      if(mp.appIdx === undefined){
        res.pitchers.push({ type:'pitcherNew', key:'n|' + side + '|' + mp.key, side:side, mlb:mp });
        return;
      }
      var p = staff[mp.appIdx], L = mp.line;
      var same = ['outs', 'h', 'r', 'er', 'bb', 'k', 'hr', 'pitches', 'balls'].every(function(k){ return (p[k] || 0) === L[k]; });
      if(same && mlbNormName(p.name)) return;
      res.pitchers.push({ type:'pitcher', key:'q|' + side + '|' + mp.key + '|' + JSON.stringify(L), side:side, appIdx:mp.appIdx, mlb:mp, nameOnly: same });
    });
  });

  // The count of the at-bat in progress
  var cur = mlbCurrentAtBat(feed);
  if(cur && (cur.balls !== G.balls || cur.strikes !== G.strikes)){
    res.count.push({ type:'count', key:'c|' + cur.atBat + '|' + cur.balls + '-' + cur.strikes, side:cur.side, mlb:cur });
  }

  // Errors by team (MLB's running totals). Only meaningful once the scorecard
  // has every play MLB has, so the panel shows them after catching up.
  res.errors = [];
  ['away', 'home'].forEach(function(side){
    var t = (feed.liveData.linescore && feed.liveData.linescore.teams && feed.liveData.linescore.teams[side]) || {};
    if(t.errors === undefined || t.errors === G.rhe[side][2]) return;
    res.errors.push({ type:'errors', key:'e|' + side + '|' + t.errors, side:side, app:G.rhe[side][2], mlb:t.errors });
  });

  // Runs by inning, for halves both have finished
  var innings = (feed.liveData.linescore && feed.liveData.linescore.innings) || [];
  innings.forEach(function(ln){
    ['away', 'home'].forEach(function(side){
      var order = mlbHalfOrder(ln.num, side === 'away' ? 'top' : 'bot');
      if(order >= settled || !ln[side] || ln[side].runs === undefined) return;
      var mine = G.scores[side][ln.num - 1] || 0;
      if(mine !== ln[side].runs){
        res.runs.push({ type:'runs', key:'r|' + side + '|' + ln.num + '|' + ln[side].runs, side:side, inn:ln.num, app:mine, mlb:ln[side].runs });
      }
    });
  });
  return res;
}

// ── Applying fixes (callers take the undo snapshot) ──
function mlbApply(d){
  if(d.type === 'play'){
    correctPa(G.pas[d.paIdx], d.mlb.res, d.mlb.reached, d.mlb.out, 'MLB check');
    if(d.mlb.risp !== undefined) G.pas[d.paIdx].risp = d.mlb.risp;
  } else if(d.type === 'extra'){
    removePa(d.paIdx, 'MLB check');
  } else if(d.type === 'missing'){
    mlbInsertPa(d);
  } else if(d.type === 'pitcher'){
    var p = G.pitchers[d.side][d.appIdx], L = d.mlb.line;
    if(!mlbNormName(p.name)) p.name = d.mlb.name;
    Object.keys(L).forEach(function(k){ p[k] = L[k]; });
    addLog('MLB check: ' + p.name + ' — pitching line set to ' + fmtIP(L.outs) + ' IP, ' + L.h + ' H, ' + L.r + ' R, ' + L.er + ' ER', 'Edit', 't-info');
    // Those pitches include the at-bat in progress: bring its count along so the two agree
    var cur = _mlb && _mlb.feed ? mlbCurrentAtBat(_mlb.feed) : null;
    if(cur && cur.fSide === d.side && cur.pIdx === d.appIdx && (cur.balls !== G.balls || cur.strikes !== G.strikes)){
      mlbApplyCount(cur);
      addLog('MLB check: count set to ' + cur.balls + '-' + cur.strikes + ' (' + cur.batter + ')', 'Edit', 't-info');
    }
  } else if(d.type === 'pitcherNew'){
    var np = mkPitcher();
    np.active = false;
    np.name = d.mlb.name;
    Object.keys(d.mlb.line).forEach(function(k){ np[k] = d.mlb.line[k]; });
    G.pitchers[d.side].push(np);
    addLog('MLB check: added pitcher ' + np.name + ' (' + team(d.side) + ')', 'Edit', 't-info');
  } else if(d.type === 'count'){
    mlbApplyCount(d.mlb);
    addLog('MLB check: count set to ' + d.mlb.balls + '-' + d.mlb.strikes + ' (' + d.mlb.batter + ')', 'Edit', 't-info');
  } else if(d.type === 'errors'){
    G.rhe[d.side][2] = d.mlb;
    addLog('MLB check: ' + team(d.side) + ' errors set to ' + d.mlb, 'Edit', 't-info');
  } else if(d.type === 'runs'){
    G.scores[d.side][d.inn - 1] = d.mlb;
    recalc();
    addLog('MLB check: ' + team(d.side) + ' runs in inning ' + d.inn + ' set to ' + d.mlb, 'Edit', 't-info');
  }
}

// Add a plate appearance MLB has that the scorecard doesn't — scorecard and
// stats only; runners, outs and the current batter are left alone.
function mlbInsertPa(d){
  var e = d.mlb, side = e.side, slot = e.slot;
  if(slot < 0) return;
  var sl = G.lineup[side][slot], n = mlbNormName(e.batter), who;
  if(mlbNormName(sl.name) === n) who = -1;
  sl.subs.forEach(function(sub, si){ if(mlbNormName(sub.name) === n) who = si; });
  var fSide = side === 'home' ? 'away' : 'home', pIdx = activePIdx(fSide);
  G.pitchers[fSide].forEach(function(p, i){ if(mlbNormName(p.name) === mlbNormName(e.pitcher)) pIdx = i; });
  var pa = { id: newPaId(), side:side, slot:slot, inn:e.inn, half:e.half, res:e.res, reached:e.reached, out:e.out,
             pIdx:pIdx, unearned: e.res[0] === 'E', risp: e.risp };
  if(who !== undefined) pa.who = who; // otherwise resolved by substitution timing

  // Chronological position: after the PA it followed in this half, else
  // before the first PA of any later half
  var at;
  if(d.afterIdx !== null && d.afterIdx !== undefined) at = d.afterIdx + 1;
  else {
    at = G.pas.length;
    for(var i = 0; i < G.pas.length; i++){
      if(mlbHalfOrder(G.pas[i].inn, G.pas[i].half) >= e.order){ at = i; break; }
    }
  }
  G.pas.splice(at, 0, pa);
  var key = (e.half === 'top' ? 'T' : 'B') + e.inn;
  var list = G.batterLog[side][key] = G.batterLog[side][key] || [];
  list.splice(paBatterLogIdx(pa), 0, curNameForPa(pa) + ' — ' + e.res);
  applyPaStats(pa, 1);
  addLog('MLB check: added ' + e.batter + ' ' + paLabel(e.res) + ' (' + key + ')', 'Edit', 't-info');
  G.log[0].paId = pa.id;
}

function mlbDiffList(diffs, kind){
  return kind === 'play' ? diffs.plays : kind === 'pitcher' ? diffs.pitchers : kind === 'errors' ? diffs.errors : kind === 'count' ? diffs.count : diffs.runs;
}

function mlbUse(kind, i){
  if(!_mlb || !_mlb.feed) return;
  var diffs = mlbDiffs(_mlb.feed);
  var d = mlbDiffList(diffs, kind)[i];
  if(!d) return;
  saveState();
  mlbApply(d);
  renderAll();
  saveToStorage();
  renderMlbCheck();
}

// Apply every play difference (not the ones kept), as one undo step
function mlbUseAllPlays(){
  if(!_mlb || !_mlb.feed) return;
  saveState();
  for(var n = 0; n < 300; n++){
    var d = mlbDiffs(_mlb.feed).plays.filter(function(x){ return !G.mlbKeep[x.key] && mlbCanApply(x); })[0];
    if(!d) break;
    mlbApply(d);
  }
  renderAll();
  saveToStorage();
  renderMlbCheck();
}

// Plate appearances recorded before RISP was tracked: take MLB's (never overrides one you set)
function mlbFillRisp(){
  if(!_mlb || !_mlb.feed) return;
  var list = mlbDiffs(_mlb.feed).rispMissing;
  if(!list.length) return;
  saveState();
  list.forEach(function(x){ G.pas[x.paIdx].risp = x.risp; });
  addLog('MLB check: RISP filled in for ' + list.length + ' plate appearance' + (list.length === 1 ? '' : 's'), 'Edit', 't-info');
  renderAll();
  saveToStorage();
  renderMlbCheck();
  kbFlash('RISP filled in', '#1D9E75');
}

function mlbCanApply(d){ return d.type !== 'missing' || d.mlb.slot >= 0; }

function mlbKeep(kind, i){
  if(!_mlb || !_mlb.feed) return;
  var diffs = mlbDiffs(_mlb.feed);
  var d = mlbDiffList(diffs, kind)[i];
  if(!d) return;
  G.mlbKeep[d.key] = true;
  saveToStorage();
  renderMlbCheck();
}

// ── Catch up from MLB ──
// Adds the plays MLB has after the scorecard's last plate appearance and moves
// the game forward: substitutions, pitching changes, results, runners, outs,
// runs (charged as MLB charges them), steals and pitch counts, ending on MLB's
// current batter and count. One undo step.

function mlbPlayerName(feed, id){
  var pl = feed.gameData.players['ID' + id];
  return pl ? pl.fullName : '';
}

// Index into allPlays where catching up starts, or -1 if the scorecard isn't behind.
// In the scorecard's current half-inning, skip as many MLB plate appearances as
// the scorecard already has.
function mlbCatchUpStart(feed){
  var appOrder = mlbHalfOrder(G.inning, G.half), side = batting();
  var have = G.pas.filter(function(pa){ return pa.side === side && pa.inn === G.inning && pa.half === G.half; }).length;
  var plays = feed.liveData.plays.allPlays || [], seen = 0;
  for(var i = 0; i < plays.length; i++){
    var a = plays[i].about, o = mlbHalfOrder(a.inning, a.halfInning === 'top' ? 'top' : 'bot');
    if(o < appOrder) continue;
    if(o === appOrder && seen < have){
      if(MLB_PA_EVENTS[plays[i].result.eventType] && a.isComplete !== false) seen++;
      continue;
    }
    return i;
  }
  return -1;
}

// How many completed plate appearances catching up would add
function mlbCatchUpCount(feed){
  var start = mlbCatchUpStart(feed);
  if(start < 0) return 0;
  return feed.liveData.plays.allPlays.slice(start).filter(function(p){
    return p.about.isComplete !== false && MLB_PA_EVENTS[p.result.eventType];
  }).length;
}

// Move the scorecard to a half-inning (closing out the one it's in)
function mlbGoToHalf(inn, half){
  var side = batting();
  if(G.scores[side][G.inning - 1] === null) G.scores[side][G.inning - 1] = 0;
  G.inning = inn; G.half = half;
  while(G.totalInnings < inn){ G.totalInnings++; G.scores.home.push(null); G.scores.away.push(null); }
  G.outs = 0; G.balls = 0; G.strikes = 0; G.fouls = 0;
  G.bases = [null, null, null];
}

function mlbActivatePitcher(side, name){
  var n = mlbNormName(name), idx = -1;
  G.pitchers[side].forEach(function(p, i){ if(idx < 0 && mlbNormName(p.name) === n) idx = i; });
  if(idx < 0){
    // An unnamed, unused slot takes the name; otherwise add the pitcher
    G.pitchers[side].forEach(function(p, i){ if(idx < 0 && !mlbNormName(p.name) && !p.pitches && !p.outs) idx = i; });
    if(idx < 0){ G.pitchers[side].push(mkPitcher()); idx = G.pitchers[side].length - 1; }
    G.pitchers[side][idx].name = name;
  }
  G.pitchers[side].forEach(function(p, i){ p.active = i === idx; });
  return idx;
}

// Put a player into a lineup spot as a sub unless he's already the one there
function mlbEnsureInSlot(side, slot, name, pos, subType){
  if(slot < 0 || slot > 8 || !name) return;
  if(mlbNormName(curName(side, slot)) === mlbNormName(name)) return;
  var sl = G.lineup[side][slot], prev = curName(side, slot);
  if(!sl.name && !sl.subs.length){ sl.name = name; if(pos) sl.pos = pos; return; }
  sl.subs.push({ name: name, pos: pos || '—', inning: G.inning, half: G.half, hits: mkHits(), subType: subType || 'ph' });
  addLog(name + ' (' + (subType === 'pr' ? 'PR' : subType === 'ph' ? 'PH' : pos || 'Sub') + ') replaces ' + prev + ' (spot ' + (slot + 1) + ')', 'Sub', 't-sub');
}

function mlbSideOfPlayer(feed, id){
  var t = feed.liveData.boxscore.teams;
  return t.away.players['ID' + id] ? 'away' : t.home.players['ID' + id] ? 'home' : null;
}

// Stats object for a runner by name (whoever holds that name in the lineup)
function mlbRunnerHits(side, name){
  var slot = findRunnerSlot(side, name);
  if(slot < 0) return null;
  var sl = G.lineup[side][slot], n = mlbNormName(name);
  for(var s = sl.subs.length - 1; s >= 0; s--) if(mlbNormName(sl.subs[s].name) === n) return sl.subs[s].hits || (sl.subs[s].hits = mkHits());
  return sl.hits;
}

function mlbApplyPlay(feed, p, entries){
  var a = p.about, half = a.halfInning === 'top' ? 'top' : 'bot';
  var side = half === 'top' ? 'away' : 'home', fSide = side === 'away' ? 'home' : 'away';
  if(G.inning !== a.inning || G.half !== half) mlbGoToHalf(a.inning, half);

  // Substitutions and pitching changes that happened during this play
  (p.playEvents || []).forEach(function(e){
    if(e.type !== 'action' || !e.details) return;
    var t = e.details.eventType, id = e.player && e.player.id;
    if(t === 'pitching_substitution' && id){
      mlbActivatePitcher(fSide, mlbPlayerName(feed, id));
      addLog(e.details.description || ('Pitching change: ' + mlbPlayerName(feed, id)), 'P', 't-info');
    } else if((t === 'offensive_substitution' || t === 'defensive_substitution') && id && e.battingOrder){
      var s = mlbSideOfPlayer(feed, id), pos = e.position && e.position.abbreviation;
      var st = pos === 'PR' ? 'pr' : pos === 'PH' ? 'ph' : 'def';
      mlbEnsureInSlot(s, Math.floor(parseInt(e.battingOrder, 10) / 100) - 1, mlbPlayerName(feed, id), pos, st);
      if(st === 'pr' && e.replacedPlayer){
        var old = mlbPlayerName(feed, e.replacedPlayer.id);
        G.bases = G.bases.map(function(b){ return b && mlbNormName(b) === mlbNormName(old) ? mlbPlayerName(feed, id) : b; });
      }
    }
  });
  if(a.isComplete === false) return;

  var pIdx = mlbActivatePitcher(fSide, p.matchup.pitcher.fullName), P = G.pitchers[fSide][pIdx];
  var pitches = (p.playEvents || []).filter(function(e){ return e.isPitch; });
  P.pitches += pitches.length;
  P.balls += pitches.filter(function(e){ var c = (e.details.call || {}).code; return e.details.isBall || c === 'H'; }).length;

  var isPA = !!MLB_PA_EVENTS[p.result.eventType], label = '', cls = 't-info';
  if(isPA){
    var e = entries[a.atBatIndex] || {};
    var slot = e.slot >= 0 ? e.slot : abIdx(side);
    mlbEnsureInSlot(side, slot, p.matchup.batter.fullName, null, 'ph');
    var res = mlbNotation(p);
    var pa = { id: newPaId(), side: side, slot: slot, inn: a.inning, half: half, res: res,
               reached: e.reached || 0, out: e.out || 0, pIdx: pIdx,
               who: G.lineup[side][slot].subs.length - 1, unearned: res[0] === 'E' || res === 'CI',
               risp: e.risp !== undefined ? e.risp : !!(G.bases[1] || G.bases[2]) };
    if(pa.out && !paIsOut(res)) pa.outOnBases = true;
    G.pas.push(pa);
    applyPaStats(pa, 1);
    if(p.result.rbi) paHits(pa).rbi = (paHits(pa).rbi || 0) + p.result.rbi;
    var key = (half === 'top' ? 'T' : 'B') + a.inning;
    (G.batterLog[side][key] = G.batterLog[side][key] || []).push(curName(side, slot) + ' — ' + res);
    if(side === 'home') G.homeBatter = (slot + 1) % 9; else G.awayBatter = (slot + 1) % 9;
    label = paLabel(res);
    cls = paIsHit(res) ? (/^HR/.test(res) ? 't-hr' : 't-hit') : paIsOut(res) ? 't-out' : 't-info';
  }

  // Errors on this play, as MLB credits them (each fielder's error once, however
  // many runners it moved). The batter's own E / CI / +E was counted with the PA.
  var errs = {};
  (p.runners || []).forEach(function(rn){
    (rn.credits || []).forEach(function(c){
      if(/error|catcher_interf/.test(c.credit || '')) errs[(c.player && c.player.id) + '|' + c.credit] = true;
    });
  });
  var extraErrs = Object.keys(errs).length - (isPA && paStatKeys(res).teamErr ? 1 : 0);
  if(extraErrs > 0) G.rhe[fSide][2] += extraErrs;

  // Runners: steals, caught stealing, runs (charged to MLB's responsible pitcher)
  (p.runners || []).forEach(function(rn){
    var d = rn.details || {}, mv = rn.movement || {}, name = d.runner && d.runner.fullName;
    var h = mlbRunnerHits(side, name);
    if(/^stolen_base/.test(d.eventType || '') && !mv.isOut && h) h.sb++;
    if(/^caught_stealing/.test(d.eventType || '') && mv.isOut && h) h.cs++;
    if(mv.end === 'score' && d.isScoringEvent){
      G.scores[side][a.inning - 1] = (G.scores[side][a.inning - 1] || 0) + 1;
      G.rhe[side][0]++;
      if(h) h.r = (h.r || 0) + 1;
      var rp = d.responsiblePitcher ? mlbPlayerName(feed, d.responsiblePitcher.id) : p.matchup.pitcher.fullName;
      var ri = pIdx;
      G.pitchers[fSide].forEach(function(q, i){ if(mlbNormName(q.name) === mlbNormName(rp)) ri = i; });
      G.pitchers[fSide][ri].r++;
      if(d.earned) G.pitchers[fSide][ri].er++;
    }
  });

  // Outs (credited to the pitcher on the mound) and runners left on base
  var outsAfter = (p.count && p.count.outs) || 0;
  if(outsAfter > G.outs) P.outs += outsAfter - G.outs;
  G.outs = outsAfter;
  var m = p.matchup;
  G.bases = [m.postOnFirst, m.postOnSecond, m.postOnThird].map(function(x){ return x ? x.fullName : null; });
  G.balls = 0; G.strikes = 0; G.fouls = 0;
  addLog('MLB: ' + (p.result.description || p.result.event || 'Play'), label || 'MLB', cls);
  if(isPA) G.log[0].paId = pa.id;

  if(G.outs >= 3){
    if(G.scores[side][a.inning - 1] === null) G.scores[side][a.inning - 1] = 0;
    if(half === 'top') mlbGoToHalf(a.inning, 'bot'); else mlbGoToHalf(a.inning + 1, 'top');
  }
}

function mlbCatchUp(){
  if(!_mlb || !_mlb.feed) return;
  var feed = _mlb.feed, start = mlbCatchUpStart(feed);
  if(start < 0) return;
  var n = mlbCatchUpCount(feed);
  showConfirm({
    title: 'Catch up from MLB?',
    message: 'Add the ' + n + ' plate appearance' + (n === 1 ? '' : 's') + ' MLB has after your last one — results, runners, outs, runs, substitutions, pitching changes and pitch counts — and move the game to MLB\'s current batter. One Undo reverses it.',
    confirmLabel: 'Catch up',
    cancelLabel: 'Not now',
    tone: 'info'
  }).then(function(ok){
    if(!ok) return;
    saveState();
    mlbApplyCatchUp(feed);
    addLog('Caught up from MLB: ' + n + ' plate appearance' + (n === 1 ? '' : 's') + ' added', 'MLB', 't-info');
    renderAll();
    saveToStorage();
    renderMlbCheck();
    kbFlash('Caught up — ' + n + ' play' + (n === 1 ? '' : 's') + ' added', '#1D9E75');
  });
}

// Add every play MLB has after the scorecard's last one and end on MLB's current
// batter and count. No confirmation and no undo snapshot (callers take one).
// Returns the number of plate appearances added.
function mlbApplyCatchUp(feed){
  var start = mlbCatchUpStart(feed), n = mlbCatchUpCount(feed);
  if(start < 0) return 0;
  var entries = {};
  var m = mlbPlays(feed);
  Object.keys(m.halves).forEach(function(k){ m.halves[k].forEach(function(e){ entries[e.atBat] = e; }); });
  var plays = feed.liveData.plays.allPlays, last = null;
  for(var i = start; i < plays.length; i++){ mlbApplyPlay(feed, plays[i], entries); last = plays[i]; }

  // End on MLB's current batter and count (an at-bat in progress)
  if(last && last.about.isComplete === false){
    var a = last.about, half = a.halfInning === 'top' ? 'top' : 'bot', side = half === 'top' ? 'away' : 'home';
    if(G.inning !== a.inning || G.half !== half) mlbGoToHalf(a.inning, half);
    var bo = mlbSlotByName(side, last.matchup.batter.fullName);
    var box = feed.liveData.boxscore.teams[side].players['ID' + last.matchup.batter.id];
    if(box && box.battingOrder) bo = Math.floor(parseInt(box.battingOrder, 10) / 100) - 1;
    if(bo >= 0){
      mlbEnsureInSlot(side, bo, last.matchup.batter.fullName, null, 'ph');
      if(side === 'home') G.homeBatter = bo; else G.awayBatter = bo;
    }
    mlbActivatePitcher(side === 'away' ? 'home' : 'away', last.matchup.pitcher.fullName);
    G.balls = Math.min(3, last.count.balls || 0); G.strikes = Math.min(2, last.count.strikes || 0);
    G.fouls = (last.playEvents || []).filter(function(e){ return e.isPitch && /^Foul(?! Tip)/i.test((e.details && e.details.description) || ''); }).length;
    var lm = last.matchup;
    G.bases = [lm.postOnFirst, lm.postOnSecond, lm.postOnThird].map(function(x){ return x ? x.fullName : null; });
    if(!lm.postOnFirst && !lm.postOnSecond && !lm.postOnThird){
      // In-progress play: MLB reports runners before it as the previous play's result
      var prev = plays[plays.length - 2];
      if(prev && prev.about.inning === a.inning && prev.about.halfInning === a.halfInning){
        var pm = prev.matchup;
        G.bases = [pm.postOnFirst, pm.postOnSecond, pm.postOnThird].map(function(x){ return x ? x.fullName : null; });
      }
    }
  }

  mlbMarkFinal(feed);
  return n;
}

// MLB has the game as final: mark it final here too (once)
function mlbMarkFinal(feed){
  if((feed.gameData.status || {}).abstractGameState !== 'Final' || G.log.some(function(l){ return l.tag === 'Final'; })) return false;
  var aw = G.rhe.away[0], hm = G.rhe.home[0];
  addLog('FINAL — ' + (hm > aw ? team('home') : team('away')) + ' wins ' + Math.max(aw, hm) + '-' + Math.min(aw, hm), 'Final', 't-run');
  return true;
}

// ── Fetching ──
function mlbFetchJSON(url){
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = ctl ? setTimeout(function(){ ctl.abort(); }, 15000) : null;
  return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function(r){
    if(timer) clearTimeout(timer);
    if(!r.ok) throw new Error('MLB returned ' + r.status);
    return r.json();
  }, function(err){
    if(timer) clearTimeout(timer);
    throw new Error(err && err.name === 'AbortError' ? 'MLB took too long to answer — check your connection.' : 'Couldn\'t reach MLB — check your connection.');
  });
}

// MLB's id for this game: saved by Today's Games, otherwise looked up by
// teams and the game date (today if none is set).
function mlbGamePk(){
  var matchup = team('away') + ' @ ' + team('home');
  if(G.mlbGamePk && G.mlbGameTeams === matchup) return Promise.resolve(G.mlbGamePk);
  var awayId = TEAM_IDS[team('away')], homeId = TEAM_IDS[team('home')];
  if(!awayId || !homeId) return Promise.reject(new Error('Pick both MLB teams first.'));
  var d = new Date();
  var date = (G.notes && G.notes.date) || (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
  return mlbFetchJSON(MLB_API + '/schedule?sportId=1&date=' + date).then(function(data){
    var games = ((data.dates && data.dates[0] && data.dates[0].games) || []).filter(function(g){
      return g.teams.away.team.id === awayId && g.teams.home.team.id === homeId;
    });
    if(!games.length) throw new Error('Couldn\'t find ' + team('away') + ' @ ' + team('home') + ' on ' + date + ' in MLB\'s schedule. Check the date in Game info.');
    // Doubleheader: prefer the one being played
    var live = games.filter(function(g){ return g.status && g.status.abstractGameState === 'Live'; })[0];
    G.mlbGamePk = (live || games[0]).gamePk;
    G.mlbGameTeams = matchup;
    saveToStorage();
    return G.mlbGamePk;
  });
}

function openMlbCheck(){
  closeMlbCheck();
  var ov = document.createElement('div');
  ov.className = 'gm-overlay';
  ov.id = 'mlbOverlay';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeMlbCheck(); });
  document.body.appendChild(ov);
  refreshMlbCheck();
}

function closeMlbCheck(){
  var ov = document.getElementById('mlbOverlay');
  if(ov) ov.remove();
}

function refreshMlbCheck(){
  _mlb = { loading: true };
  renderMlbCheck();
  mlbGamePk()
    .then(function(pk){ return mlbFetchJSON(MLB_FEED + pk + '/feed/live'); })
    .then(function(feed){
      if(!feed || !feed.liveData || !feed.liveData.plays) throw new Error('MLB hasn\'t posted play-by-play for this game yet.');
      _mlb = { feed: feed, fetchedAt: Date.now() };
      renderMlbCheck();
    })
    .catch(function(err){
      _mlb = { error: (err && err.message) || 'Couldn\'t reach MLB.' };
      renderMlbCheck();
    });
}

function renderMlbCheck(){
  var ov = document.getElementById('mlbOverlay');
  if(!ov) return;
  var html = '<div class="gm-modal mlb-modal" role="dialog" aria-modal="true" aria-labelledby="mlbTitle">';
  html += '<div class="gm-hdr"><h3 id="mlbTitle">⚾ Check vs MLB</h3><div class="mlb-hdr-btns">'
    + '<button class="mlb-btn" onclick="refreshMlbCheck()"' + (_mlb && _mlb.loading ? ' disabled' : '') + '>↻ Refresh</button>'
    + '<button class="games-modal-close" onclick="closeMlbCheck()" aria-label="Close">&times;</button></div></div>';
  html += '<div class="gm-body">';

  if(!_mlb || _mlb.loading){
    html += '<div class="mlb-msg">Getting MLB\'s play-by-play…</div>';
  } else if(_mlb.error){
    html += '<div class="mlb-msg mlb-err">' + esc(_mlb.error) + '</div>';
  } else {
    var d = mlbDiffs(_mlb.feed);
    var kept = 0;
    function visible(x){ if(G.mlbKeep[x.key]){ kept++; return _mlbShowKept; } return true; }
    var plays = d.plays.map(function(x, i){ return { d:x, i:i }; }).filter(function(x){ return visible(x.d); });
    // While the scorecard is behind MLB, pitching lines can't match yet — catching up settles them
    var behindN = mlbCatchUpCount(_mlb.feed);
    var pitchers = behindN ? [] : d.pitchers.map(function(x, i){ return { d:x, i:i }; }).filter(function(x){ return visible(x.d); });
    var runs = d.runs.map(function(x, i){ return { d:x, i:i }; }).filter(function(x){ return visible(x.d); });
    var errors = behindN ? [] : d.errors.map(function(x, i){ return { d:x, i:i }; }).filter(function(x){ return visible(x.d); });
    var count = d.count.map(function(x, i){ return { d:x, i:i }; }).filter(function(x){ return visible(x.d); });
    var total = plays.length + pitchers.length + runs.length + errors.length + count.length;
    var at = new Date(_mlb.fetchedAt);
    var ls = _mlb.feed.liveData.linescore || {};
    var mlbAt = d.mlbPos ? mlbHalfName(Math.floor(d.mlbPos / 2), d.mlbPos % 2 ? 'bot' : 'top') : '—';
    var state = (_mlb.feed.gameData.status || {}).detailedState || '';

    html += '<div class="mlb-sum">MLB: ' + esc(state) + (state === 'Final' ? '' : ' · ' + esc(mlbAt) + (ls.outs !== undefined ? ', ' + ls.outs + ' out' : ''))
      + ' · as of ' + at.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) + '<br>'
      + (total ? '<b>' + total + ' difference' + (total === 1 ? '' : 's') + '</b>' : '<b class="mlb-ok">✓ Everything ' + (behindN ? 'you\'ve recorded ' : '') + 'matches MLB</b>')
      + (d.matched ? ' · ' + d.matched + ' play' + (d.matched === 1 ? '' : 's') + ' match' : '')
      + (d.pending ? ' · ' + d.pending + ' not posted by MLB yet' : '')
      + (d.behind ? ' · MLB has ' + d.behind + ' play' + (d.behind === 1 ? '' : 's') + ' you haven\'t recorded yet' : '')
      + (behindN ? ' <button class="mlb-btn mlb-catchup" onclick="mlbCatchUp()">Catch up (' + behindN + ')</button><br>Pitching lines and errors are compared once you\'re caught up.' : '')
      + (state === 'Final' ? '' : '<br>' + (followIsMine() ? '📡 Following MLB live <button class="mlb-btn" onclick="stopFollow();renderMlbCheck()">Stop</button>'
          : '<button class="mlb-btn mlb-catchup" onclick="closeMlbCheck();startFollow()">📡 Follow live</button> keeps the game caught up while you watch'))
      + (d.rispMissing.length ? '<br>' + d.rispMissing.length + ' plate appearance' + (d.rispMissing.length === 1 ? ' has' : 's have') + ' no RISP recorded <button class="mlb-btn mlb-catchup" onclick="mlbFillRisp()">Fill in RISP (' + d.rispMissing.length + ')</button>' : '')
      + (kept ? ' · <button class="mlb-link" onclick="_mlbShowKept=!_mlbShowKept;renderMlbCheck()">' + (_mlbShowKept ? 'hide' : 'show') + ' ' + kept + ' kept as yours</button>' : '')
      + '</div>';

    if(count.length){
      html += '<div class="mlb-sec"><span>Current at-bat</span></div>';
      count.forEach(function(x){ html += mlbRowHtml(x.d, 'count', x.i); });
    }
    if(plays.length){
      var applicable = plays.filter(function(x){ return !G.mlbKeep[x.d.key] && mlbCanApply(x.d); }).length;
      html += '<div class="mlb-sec"><span>Plays</span>' + (applicable > 1 ? '<button class="mlb-btn" onclick="mlbUseAllPlays()">Use MLB\'s for all ' + applicable + '</button>' : '') + '</div>';
      plays.forEach(function(x){ html += mlbRowHtml(x.d, 'play', x.i); });
    }
    if(pitchers.length){
      html += '<div class="mlb-sec"><span>Pitchers</span></div>';
      pitchers.forEach(function(x){ html += mlbRowHtml(x.d, 'pitcher', x.i); });
    }
    if(runs.length){
      html += '<div class="mlb-sec"><span>Runs by inning</span></div>';
      runs.forEach(function(x){ html += mlbRowHtml(x.d, 'runs', x.i); });
    }
    if(errors.length){
      html += '<div class="mlb-sec"><span>Errors</span></div>';
      errors.forEach(function(x){ html += mlbRowHtml(x.d, 'errors', x.i); });
    }
    html += '<div class="mlb-foot">Fixes update the scorecard and stats only — runners, outs and the current batter stay as they are. Undo reverses each fix.</div>';
  }
  html += '</div></div>';
  ov.innerHTML = html;
}

function mlbRowHtml(d, kind, i){
  var where = '', who = '', you = '', them = '', desc = '', note = '', canUse = true;
  var youHtml = null, themHtml = null, differs = '';
  var useLabel = 'Use MLB\'s';
  if(d.type === 'play' || d.type === 'missing' || d.type === 'extra'){
    where = (d.half === 'top' ? 'T' : 'B') + d.inn;
  }
  if(d.type === 'play'){
    var pa = G.pas[d.paIdx];
    who = curNameForPa(pa);
    youHtml = mlbPaHtml(pa.res, pa.reached, pa.out, d.fields);
    themHtml = mlbPaHtml(d.mlb.res, d.mlb.reached, d.mlb.out, d.fields);
    differs = d.fields.map(function(f){ return MLB_FIELD_LABELS[f]; }).join(', ');
    desc = d.mlb.desc;
    if(mlbNormName(who) && mlbNormName(who) !== mlbNormName(d.mlb.batter)) note = 'MLB has ' + d.mlb.batter + ' batting here';
  } else if(d.type === 'missing'){
    who = d.mlb.batter;
    you = 'not recorded';
    them = mlbPaText(d.mlb.res, d.mlb.reached, d.mlb.out);
    desc = d.mlb.desc;
    useLabel = 'Add it';
    if(d.mlb.slot < 0){ canUse = false; note = 'Not in your lineup — add them as a sub first'; }
  } else if(d.type === 'extra'){
    var xp = G.pas[d.paIdx];
    who = curNameForPa(xp);
    you = mlbPaText(xp.res, xp.reached, xp.out);
    them = 'no plate appearance here';
    useLabel = 'Remove it';
  } else if(d.type === 'pitcher' || d.type === 'pitcherNew'){
    var L = d.mlb.line;
    // Pitching line with the stats that differ from `other` highlighted
    var line = function(p, other){
      function stat(v, ov, label){
        var t = v + label;
        return other && v !== ov ? '<mark class="mlb-diff">' + esc(t) + '</mark>' : esc(t);
      }
      var o = other || {};
      var ps = function(x){ return (x.pitches || 0) + '-' + Math.max(0, (x.pitches || 0) - (x.balls || 0)); };
      return stat(fmtIP(p.outs || 0), other ? fmtIP(o.outs || 0) : null, ' IP') + ' · ' + stat(p.h || 0, o.h || 0, ' H') + ' · '
        + stat(p.r || 0, o.r || 0, ' R') + ' · ' + stat(p.er || 0, o.er || 0, ' ER') + ' · ' + stat(p.bb || 0, o.bb || 0, ' BB') + ' · '
        + stat(p.k || 0, o.k || 0, ' K') + ((p.hr || o.hr) ? ' · ' + stat(p.hr || 0, o.hr || 0, ' HR') : '') + ' · '
        + stat(ps(p), other ? ps(o) : null, ' pitches');
    };
    who = d.mlb.name;
    if(d.type === 'pitcherNew'){ you = 'not in your pitchers'; useLabel = 'Add pitcher'; themHtml = line(L, null); }
    else {
      var ap = G.pitchers[d.side][d.appIdx];
      if(d.nameOnly){ you = 'unnamed (' + (ap.name || 'Pitcher ' + (d.appIdx + 1)) + ')'; useLabel = 'Use name'; themHtml = line(L, null); }
      else { youHtml = line(ap, L); themHtml = line(L, ap); }
    }
    where = d.side === 'away' ? team('away').split(' ').pop() : team('home').split(' ').pop();
  } else if(d.type === 'count'){
    where = 'Now';
    who = d.mlb.batter;
    you = G.balls + '-' + G.strikes;
    them = d.mlb.balls + '-' + d.mlb.strikes + ' (' + d.mlb.n + ' pitch' + (d.mlb.n === 1 ? '' : 'es') + ' this at-bat)';
  } else if(d.type === 'errors'){
    where = 'Game';
    who = team(d.side);
    you = d.app + ' error' + (d.app === 1 ? '' : 's');
    them = d.mlb + ' error' + (d.mlb === 1 ? '' : 's');
  } else if(d.type === 'runs'){
    where = 'Inn ' + d.inn;
    who = team(d.side);
    you = d.app + ' run' + (d.app === 1 ? '' : 's');
    them = d.mlb + ' run' + (d.mlb === 1 ? '' : 's');
  }
  var keptNow = !!G.mlbKeep[d.key];
  return '<div class="mlb-row' + (keptNow ? ' mlb-kept' : '') + '">'
    + '<div class="mlb-where">' + esc(where) + '</div>'
    + '<div class="mlb-cmp"><div class="mlb-who">' + esc(who) + '</div>'
    + '<div><span class="mlb-you">You: ' + (youHtml !== null ? youHtml : esc(you)) + '</span> · <span class="mlb-them">MLB: ' + (themHtml !== null ? themHtml : esc(them)) + '</span></div>'
    + (differs ? '<div class="mlb-differs">Differs: ' + esc(differs) + '</div>' : '')
    + (desc ? '<div class="mlb-desc">' + esc(desc) + '</div>' : '')
    + (note ? '<div class="mlb-note">' + esc(note) + '</div>' : '')
    + '</div>'
    + '<div class="mlb-acts">'
    + (canUse ? '<button class="mlb-use" onclick="mlbUse(\'' + kind + '\',' + i + ')">' + useLabel + '</button>' : '')
    + (keptNow ? '' : '<button class="mlb-keep" onclick="mlbKeep(\'' + kind + '\',' + i + ')">Keep mine</button>')
    + '</div></div>';
}
