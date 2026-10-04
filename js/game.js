// The game model: state shape and schema migrations, undo, plate-appearance records, run charging, pitch and play-log basics.
// Loaded as a plain script; files share one global scope (see index.html for the order).

function mkHits(){ return {s:0,d:0,t:0,hr:0,kl:0,ks:0,fo:0,go:0,sb:0,cs:0,err:0,roe:0,hbp:0,bb:0,sf:0,sac:0,fc:0,ibb:0,wp:0,r:0,rbi:0}; }

function mkSlot(){ return {name:'',pos:'—',hits:mkHits(),subs:[],pending:false}; }

function mkPitcher(){ return {name:'',pitches:0,balls:0,outs:0,h:0,r:0,er:0,bb:0,k:0,hr:0,active:true}; }

function mkNotes(){ return {date:'',firstPitch:'',venue:'',attendance:'',weather:'',temp:'',windSpeed:'',windDir:'',umpHP:'',ump1B:'',ump2B:'',ump3B:'',gameType:'',seriesGame:'',attended:false,text:''}; }

function mkGame(){
  return {
    inning:1, half:'top', outs:0, balls:0, strikes:0, fouls:0,
    bases:[null,null,null],
    totalInnings:9,
    scores:{home:Array(9).fill(null), away:Array(9).fill(null)},
    rhe:{home:[0,0,0], away:[0,0,0]},
    homeBatter:0, awayBatter:0,
    lineup:{home:Array(9).fill(null).map(mkSlot), away:Array(9).fill(null).map(mkSlot)},
    pitchers:{home:[mkPitcher()], away:[mkPitcher()]},
    log:[],
    batterLog:{home:{}, away:{}},
    pas:[], nextPaId:1,
    mlbGamePk:null, mlbGameTeams:'', // MLB's id for this game (Check vs MLB)
    mlbKeep:{},                      // MLB differences the scorer chose to keep
    notes:mkNotes(),
    abs:{home:{challenged:0,overturned:0}, away:{challenged:0,overturned:0}}
  };
}

// ── Schema migrations ──
// Given a (possibly old-shape) G loaded from JSON or localStorage, fill in any
// missing fields so downstream code can assume the current shape. Mutates and
// returns g. This is the SINGLE source of truth for backward compatibility —
// loadFromStorage, gmLoadFromSlot, and _applyImportedPayload all delegate here.
//
// When you add a new field to mkGame/mkHits/mkNotes/mkPitcher, add the matching
// default here too so games saved before the change still load correctly.
function migrateGame(g){
  if(!g) return g;

  // v1 → v2: batterLog added
  if(!g.batterLog) g.batterLog = { home:{}, away:{} };
  if(!g.batterLog.home) g.batterLog.home = {};
  if(!g.batterLog.away) g.batterLog.away = {};

  // v2 → v3: game notes added
  if(!g.notes) g.notes = mkNotes();

  // v3 → v4: ABS challenge tracking added
  if(!g.abs) g.abs = { home:{challenged:0,overturned:0}, away:{challenged:0,overturned:0} };
  if(!g.abs.home) g.abs.home = {challenged:0,overturned:0};
  if(!g.abs.away) g.abs.away = {challenged:0,overturned:0};

  // Backfill any newly-added hit keys on every lineup slot and sub.
  // Subs from old saves may have no hits object at all (pre-per-sub stats).
  var defaultHitKeys = Object.keys(mkHits());
  if(g.lineup){
    ['home','away'].forEach(function(side){
      if(!g.lineup[side]) return;
      g.lineup[side].forEach(function(sl){
        if(!sl) return;
        if(!sl.hits) sl.hits = mkHits();
        defaultHitKeys.forEach(function(k){
          if(sl.hits[k] === undefined) sl.hits[k] = 0;
        });
        if(sl.subs){
          sl.subs.forEach(function(sub){
            if(!sub) return;
            if(!sub.hits) sub.hits = mkHits();
            defaultHitKeys.forEach(function(k){
              if(sub.hits[k] === undefined) sub.hits[k] = 0;
            });
          });
        }
      });
    });
  }

  // v4 → v5: fuller pitching lines. Runs from older saves are assumed earned.
  var defaultPitcherKeys = Object.keys(mkPitcher());
  if(g.pitchers){
    ['home','away'].forEach(function(side){
      (g.pitchers[side] || []).forEach(function(p){
        if(!p) return;
        if(p.er === undefined) p.er = p.r || 0;
        defaultPitcherKeys.forEach(function(k){
          if(p[k] === undefined) p[k] = 0;
        });
      });
    });
  }

  // v4 → v5: per-PA records for the scorecard grid. Rebuild what we can from
  // batterLog (result + inning only — base paths and out numbers weren't kept).
  if(!g.pas){
    g.pas = [];
    ['away','home'].forEach(function(side){
      var log = (g.batterLog && g.batterLog[side]) || {};
      Object.keys(log).forEach(function(key){
        var half = key[0] === 'T' ? 'top' : 'bot';
        var inn = parseInt(key.slice(1), 10);
        (log[key] || []).forEach(function(entry){
          var cut = entry.lastIndexOf(' — ');
          if(cut < 0) return;
          var slot = _slotForName(g, side, entry.slice(0, cut));
          if(slot < 0) return;
          var res = entry.slice(cut + 3);
          g.pas.push({side:side, slot:slot, inn:inn, half:half, res:res,
            reached:paReachFor(res), out:0, pIdx:0, unearned:res[0] === 'E'});
        });
      });
    });
  }

  // v5 → v6: Check vs MLB
  if(!g.mlbKeep) g.mlbKeep = {};

  // v6 → v7: plate appearances get ids so play-log lines can point at them
  if(!g.nextPaId) g.nextPaId = 1;
  (g.pas || []).forEach(function(pa){ if(!pa.id) pa.id = g.nextPaId++; });

  // Very early saves stored bases as booleans; now we store runner names
  // (string) or null. Normalize either way.
  if(g.bases){
    for(var bi = 0; bi < 3; bi++){
      if(g.bases[bi] === true) g.bases[bi] = '?';
      else if(g.bases[bi] === false) g.bases[bi] = null;
    }
  }

  return g;
}

// Lineup slot for a player name (starter or any sub) in game g, or -1.
function _slotForName(g, side, name){
  var lu = g.lineup && g.lineup[side];
  if(!lu || !name) return -1;
  for(var i = 0; i < lu.length; i++){
    if(!lu[i]) continue;
    if((lu[i].name || 'Batter ' + (i + 1)) === name) return i;
    for(var s = 0; s < (lu[i].subs || []).length; s++){
      if((lu[i].subs[s].name || 'Sub') === name) return i;
    }
  }
  return -1;
}

function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;'); }

function posOpts(sel){ return POSITIONS.map(function(p){ return '<option value="'+p+'"'+(p===sel?' selected':'')+'>'+p+'</option>'; }).join(''); }

// Returns the hits object for whoever is currently active in a lineup slot
// (the last sub if subs exist, otherwise the starter)
function activeHits(side, idx){
  var sl = G.lineup[side][idx];
  if(sl.subs.length > 0){
    return sl.subs[sl.subs.length - 1].hits;
  }
  return sl.hits;
}

// Find the lineup slot index for a runner by name.
// Returns the slot index (0-8) or -1 if not found.
function findRunnerSlot(side, runnerName){
  if(!runnerName || runnerName === '?' || runnerName === true) return -1;
  for(var i = 0; i < 9; i++){
    if(curName(side, i) === runnerName) return i;
  }
  // Fallback: check starters and subs by raw name (handles edge cases)
  for(var i = 0; i < 9; i++){
    var sl = G.lineup[side][i];
    if(sl.name === runnerName) return i;
    for(var s = 0; s < sl.subs.length; s++){
      if(sl.subs[s].name === runnerName) return i;
    }
  }
  return -1;
}

// Credit a run scored to the runner who crossed home plate, and charge it to
// the pitcher who put that runner on base (inherited runners stay with the
// pitcher who allowed them).
// runnerName: the name string from the base, or null/unknown.
// unearned: true when the run scored because of an error or passed ball.
function creditRun(side, runnerName, unearned){
  var slot = findRunnerSlot(side, runnerName);
  if(slot >= 0) activeHits(side, slot).r++;
  var pa = paForRunner(side, runnerName);
  if(pa) pa.reached = 4;
  chargeRun(pa, unearned);
}

// Charge one run to the responsible pitcher. pa is the scoring runner's plate
// appearance (null when unknown → the current pitcher takes it).
function chargeRun(pa, unearned){
  var fSide = fielding();
  var staff = G.pitchers[fSide];
  var pIdx = pa && pa.pIdx < staff.length ? pa.pIdx : activePIdx(fSide);
  var p = staff[pIdx];
  p.r++;
  if(!unearned && !(pa && pa.unearned) && !inningOverWithoutErrors(pIdx)) p.er++;
  renderPitchers(fSide);
}

// Earned-run reconstruction (rule 9.16): count each batter who reached on an
// error as the out that should have been made. If those plus the real outs
// already reach three, the inning should have been over and the run is
// unearned. A reliever gets no benefit from misplays before he came in, so only
// errors while this pitcher or a later one was pitching count for him.
function inningOverWithoutErrors(pIdx){
  var bSide = batting(), missed = 0;
  G.pas.forEach(function(q){
    if(q.side === bSide && q.inn === G.inning && q.half === G.half && /^E\d?$/.test(q.res) && (q.pIdx || 0) >= pIdx) missed++;
  });
  return G.outs + missed >= 3;
}

function newPaId(){
  if(!G.nextPaId) G.nextPaId = 1;
  return G.nextPaId++;
}

// ── Plate appearances (scorecard grid) ──
// One record per PA in G.pas:
//   {side, slot, inn, half, res, reached, out, pIdx, unearned, outOnBases}
// reached: 0 = retired at the plate, 1-3 = furthest base, 4 = scored.
// out: which out of the half-inning (1-3) this player made, 0 if none.
var PA_OUT_RE = /^(K|ꓘ|F\d|G\d|SF|SAC|Out)/;

function paIsOut(res){ return PA_OUT_RE.test(res); }

function paIsHit(res){ return /^(1B|2B|3B|HR)/.test(res); }

// Plate appearances that count as at-bats (everything but walks, HBP, sacrifices, interference)
function paIsAB(res){ return !/^(BB|IBB|HBP|SF|SAC|CI)/.test(res); }

// Hits / at-bats with runners in scoring position; inn optional. PAs recorded
// before RISP was tracked (risp undefined) are left out.
function rispLine(side, inn){
  var h = 0, ab = 0;
  G.pas.forEach(function(pa){
    if(pa.side !== side || !pa.risp || (inn && pa.inn !== inn) || !paIsAB(pa.res)) return;
    ab++;
    if(paIsHit(pa.res)) h++;
  });
  return { h: h, ab: ab };
}

// Runners left on base in the half-innings this team has finished batting
function teamLOB(side){
  var half = side === 'away' ? 'top' : 'bot', total = 0;
  var final = G.log.some(function(l){ return l.tag === 'Final'; });
  G.pas.forEach(function(pa){
    if(pa.side !== side) return;
    var done = final || pa.inn < G.inning || (pa.inn === G.inning && half === 'top' && G.half === 'bot');
    if(done && pa.reached >= 1 && pa.reached <= 3 && !pa.out) total++;
  });
  return total;
}

function paReachFor(res){
  if(paIsOut(res)) return 0;
  if(/^HR/.test(res)) return 4;
  if(/^3B/.test(res)) return 3;
  if(/^2B/.test(res)) return 2;
  return 1; // 1B, BB, IBB, HBP, E#, FC
}

// The plate appearance a runner is currently on base from (this half-inning).
function paForRunner(side, runnerName){
  var slot = findRunnerSlot(side, runnerName);
  if(slot < 0) return null;
  for(var i = G.pas.length - 1; i >= 0; i--){
    var pa = G.pas[i];
    if(pa.inn !== G.inning || pa.half !== G.half) break;
    if(pa.side === side && pa.slot === slot){
      return (pa.reached >= 1 && pa.reached <= 3 && !pa.out) ? pa : null;
    }
  }
  return null;
}

// Mark a baserunner as retired. Call BEFORE the matching addOut() so the out
// number is right and the half-inning hasn't flipped yet.
function paRunnerOut(side, runnerName, outNum){
  var pa = paForRunner(side, runnerName);
  if(!pa) return;
  pa.out = Math.min(3, outNum || G.outs + 1);
  pa.outOnBases = true;
}

// Bases carry runner names; push each runner's PA out to the base they're on.
// Called from renderBases, which runs after every base change.
function syncPaBases(){
  var side = batting();
  for(var i = 0; i < 3; i++){
    var pa = paForRunner(side, G.bases[i]);
    if(pa && pa.reached < i + 1) pa.reached = i + 1;
  }
}

// Credit RBI(s) to the current batter.
function creditRBI(side, count){
  if(!count || count <= 0) return;
  var idx = abIdx(side);
  activeHits(side, idx).rbi += count;
}

var G = mkGame();

// ── Undo history ──
var HISTORY = [];

var MAX_HISTORY = 30;

// Helper: is a base occupied? Works with both old boolean and new name-string format
function baseOcc(i){ return !!G.bases[i]; }

// Helper: short name for runner labels (first initial + last name)
function shortName(n){
  if(!n) return '?';
  var parts = n.trim().split(/\s+/);
  if(parts.length === 1) return parts[0];
  // Keep a suffix with the surname: "Luis García Jr." → "L. García Jr."
  var suffix = '';
  if(parts.length > 2 && /^(jr|sr|ii|iii|iv|v)\.?$/i.test(parts[parts.length - 1])) suffix = ' ' + parts.pop();
  return parts[0][0] + '. ' + parts[parts.length - 1] + suffix;
}

// Snapshots leave out the play log and keep its length instead: entries are
// only ever added at the front, so the older part of the log never moves and
// the snapshot's log is the last `logLen` entries of the log at undo time.
// (A full game's log copied into 30 snapshots would be several MB.)
function saveState(){
  var g = Object.assign({}, G);
  delete g.log;
  g.logLen = G.log.length;
  HISTORY.push(JSON.stringify({
    G: g,
    outState: outState
  }));
  if(HISTORY.length > MAX_HISTORY) HISTORY.shift();
  var btn = document.getElementById('undoBtn');
  if(btn) btn.disabled = false;
  saveToStorage();
}

// Rebuild a full game from an undo snapshot (see saveState). Older snapshots
// carry their own full log; snapshots from storage may predate the schema.
function snapshotG(sg){
  if(!sg.log){
    var n = Math.min(sg.logLen || 0, G.log.length);
    sg.log = G.log.slice(G.log.length - n);
  }
  delete sg.logLen;
  return migrateGame(sg);
}

function undoAction(){
  if(!HISTORY.length) return;
  closeRunnerPicker(); // dismiss picker if open mid-hit
  var snapshot = JSON.parse(HISTORY.pop());
  G = snapshotG(snapshot.G);
  // Restore outState if it was saved, otherwise reset it
  if(snapshot.outState){
    Object.assign(outState, snapshot.outState);
    if(outState.sacType === undefined) outState.sacType = null;
  } else {
    resetOutState();
  }
  var btn = document.getElementById('undoBtn');
  if(btn) btn.disabled = HISTORY.length === 0;
  renderAll();
  saveToStorage();
}

// ── Current at-bat summary bar ──
function renderAtBatBar(){
  var el = document.getElementById('atbatBar');
  if(!el) return;

  var bSide = batting();
  var fSide = fielding();
  var bIdx = abIdx(bSide);
  var bName = curName(bSide, bIdx);
  var bSlot = G.lineup[bSide][bIdx];
  var bPos = bSlot.subs.length > 0 ? bSlot.subs[bSlot.subs.length - 1].pos : bSlot.pos;
  var bTeamName = team(bSide);
  var bLogo = TEAM_LOGOS[bTeamName] || '';
  var bHits = activeHits(bSide, bIdx);
  var bBadges = badges(bHits);

  // Pitcher info
  var pIdx = activePIdx(fSide);
  var pitcher = G.pitchers[fSide][pIdx];
  var pName = pitcher.name || 'Pitcher ' + (pIdx + 1);
  var pTeamName = team(fSide);
  var pLogo = TEAM_LOGOS[pTeamName] || '';

  // On-deck (next batter) and in-the-hole (batter after on-deck)
  var onDeckIdx = (bIdx + 1) % 9;
  var onDeckName = curName(bSide, onDeckIdx);
  var inHoleIdx = (bIdx + 2) % 9;
  var inHoleName = curName(bSide, inHoleIdx);

  // Count display
  var countHtml = '<span class="atbat-count-b">' + G.balls + '</span>'
    + '-'
    + '<span class="atbat-count-s">' + G.strikes + '</span>';

  var html = '';

  // Batter section
  html += '<div class="atbat-batter">';
  if(bLogo) html += '<img class="atbat-logo" src="' + bLogo + '" alt="" />';
  html += '<span class="atbat-name">' + esc(bName) + '</span>';
  if(bPos && bPos !== '—') html += '<span class="atbat-pos">' + esc(bPos) + '</span>';
  html += '<span class="atbat-detail">#' + (bIdx + 1) + '</span>';
  html += '</div>';

  // Badges
  if(bBadges) html += '<div class="atbat-badges">' + bBadges + '</div>';

  // Count
  html += '<span class="atbat-count">' + countHtml + '</span>';

  // Separator
  html += '<div class="atbat-sep"></div>';

  // Pitcher section
  html += '<div class="atbat-vs">';
  html += '<span class="atbat-vs-label">vs</span>';
  if(pLogo) html += '<img class="atbat-logo" src="' + pLogo + '" alt="" />';
  html += '<span class="atbat-pitcher">' + esc(shortName(pName)) + '</span>';
  html += '<span class="atbat-pc">' + pitcher.pitches + 'P</span>';
  html += '</div>';

  // On deck + in the hole
  html += '<span class="atbat-ondeck">On deck: ' + esc(shortName(onDeckName)) + '</span>';
  html += '<span class="atbat-inhole">In hole: ' + esc(shortName(inHoleName)) + '</span>';

  el.innerHTML = html;
}

function team(s){
  var v = s === 'home'
    ? document.getElementById('teamHome').value
    : document.getElementById('teamAway').value;
  return (!v || v === '— Select Team —')
    ? (s === 'home' ? 'Home' : 'Away')
    : v;
}

function fielding(){ return G.half==='top'?'home':'away'; }

function batting(){ return G.half==='top'?'away':'home'; }

function abIdx(side){ return side==='home'?G.homeBatter:G.awayBatter; }

function curName(side, i){
  var sl = G.lineup[side][i];
  if(sl.subs.length > 0){
    return sl.subs[sl.subs.length - 1].name || 'Sub';
  }
  return sl.name || 'Batter ' + (i + 1);
}

function activePIdx(side){
  var p = G.pitchers[side];
  for(var i = 0; i < p.length; i++){
    if(p[i].active) return i;
  }
  return 0;
}

function addPitch(side){
  var idx = activePIdx(side);
  var pp = G.pitchers[side][idx];
  var prev = pp.pitches;
  pp.pitches++;
  var n = pp.pitches;
  var el = document.getElementById(side + 'pc' + idx);
  if(el){
    el.textContent = n;
    el.className = 'pc' + pitchCountClass(n);
  }
  schedulePitchLines();
  // Cross-threshold heads-up toast. Only fires on the upward crossing edge so
  // undo + redo or manual adjustment doesn't nag. Uses the pitcher's name if
  // set, otherwise a generic label.
  if(prev < 75 && n >= 75 && n < 100){
    kbFlash((pp.name || 'Pitcher') + ' — 75 pitches', '#BA7517');
  } else if(prev < 100 && n >= 100){
    kbFlash((pp.name || 'Pitcher') + ' — 100 pitches', '#E24B4A');
  }
}

// Returns a CSS class suffix (empty, ' warn', or ' over') based on pitch count.
// Starters typically land ~85-100 pitches; crossing 75 is a useful heads-up
// and 100+ is the standard "watch out" threshold.
function pitchCountClass(n){
  if(n >= 100) return ' over';
  if(n >= 75)  return ' warn';
  return '';
}

// Track balls per pitcher; strikes = pitches − balls (balls in play count as strikes).
function addPitcherBall(side, d){
  var p = G.pitchers[side][activePIdx(side)];
  p.balls = Math.max(0, (p.balls || 0) + d);
  schedulePitchLines();
}

// Refresh just the stat lines (not the whole panel) — this runs on every pitch.
var _pitchLinesScheduled = false;

function schedulePitchLines(){
  if(_pitchLinesScheduled) return;
  _pitchLinesScheduled = true;
  var schedule = window.requestAnimationFrame || function(cb){ return setTimeout(cb, 0); };
  schedule(function(){
    _pitchLinesScheduled = false;
    ['home','away'].forEach(function(side){
      G.pitchers[side].forEach(function(p, i){
        var el = document.getElementById(side + 'pl' + i);
        if(el) el.innerHTML = pitchingLine(p);
      });
    });
  });
}

function addPitcherStat(side, stat){
  var idx = activePIdx(side);
  G.pitchers[side][idx][stat]++;
  renderPitchers(side);
}

function addLog(text, tag, cls){
  var inn = (G.half === 'top' ? 'T' : 'B') + G.inning;
  // Categorize for filtering
  var cat = 'info';
  if(cls === 't-hit' || cls === 't-hr' || cls === 't-hbp' || cls === 't-sb') cat = 'hits';
  else if(cls === 't-fo' || cls === 't-go' || cls === 't-out' || cls === 't-kl' || cls === 't-ks' || cls === 't-fc' || cls === 't-cs') cat = 'outs';
  else if(cls === 't-run') cat = 'runs';
  else if(cls === 't-ball' || cls === 't-k' || cls === 't-foul' || cls === 't-wp' || cls === 't-pb' || cls === 't-ibb') cat = 'pitches';
  else if(cls === 't-abs') cat = 'abs';
  // No cap: undo snapshots store only the log's length (see saveState), so a
  // full game's log stays cheap. New entries always go on the front.
  G.log.unshift({ text: inn + ' — ' + text, tag: tag, cls: cls, inn: inn, cat: cat });
  scheduleLogRender();
  haptic();
}
