// Follow MLB: keeps the scorecard caught up with MLB's live play-by-play while
// watching a game. Every FOLLOW_MS it asks MLB for the game's list of update
// times (a few KB) and downloads the play-by-play only when that changed. It
// adds the plays the scorecard doesn't have yet (the same code as Catch up, one
// Undo step per batch) and moves the count of the at-bat in progress forward —
// never back, so scoring pitches yourself ahead of MLB's feed is never undone.
// It waits while a dialog or an unfinished entry is open, pauses in the
// background, and stops at the final out. The game remembers which device is
// following (G.mlbFollow), so with sync on only one device polls.
// Loaded as a plain script; files share one global scope (see index.html for the order).

var FOLLOW_MS = 20000;
var _follow = { timer: null, busy: false, stamp: null, pk: null, error: '', checkedAt: 0 };

function followDevice(){ return (typeof syncState === 'function' && syncState().device) || 'This device'; }
function followIsMine(){ return !!(G.mlbFollow && G.mlbFollow.device === followDevice()); }
function followIsElsewhere(){ return !!(G.mlbFollow && G.mlbFollow.device !== followDevice()); }
function gameIsFinal(){ return G.log.some(function(l){ return l.tag === 'Final'; }); }

// Something the scorer is in the middle of: don't change the game under them
function followBlocked(){
  if(document.querySelector('.rp-overlay, .cf-overlay')) return true;
  var br = document.getElementById('brPicker');
  if(br && br.style.display !== 'none' && br.innerHTML) return true;
  return !!(outState && (outState.type || outState.fielder !== null));
}

function startFollow(){
  if(gameIsFinal()){ showAlert({ title: 'This game is over', message: 'There\'s nothing left to follow.', tone: 'info' }); return; }
  G.mlbFollow = { device: followDevice(), since: Date.now() };
  _follow.stamp = null; _follow.error = '';
  saveToStorage();
  renderFollowPill();
  kbFlash('Following MLB', '#185FA5');
  return followTick();
}

function stopFollow(msg){
  G.mlbFollow = null;
  clearTimeout(_follow.timer); _follow.timer = null;
  saveToStorage();
  renderFollowPill();
  if(msg) kbFlash(msg, '#BA7517');
}

function followSchedule(){
  clearTimeout(_follow.timer); _follow.timer = null;
  if(followIsMine()) _follow.timer = setTimeout(followTick, FOLLOW_MS);
}

// One check. Returns a promise (resolved when the check is done) for callers and tests.
function followTick(){
  clearTimeout(_follow.timer); _follow.timer = null;
  if(!followIsMine()){ renderFollowPill(); return Promise.resolve(); }
  if(document.visibilityState === 'hidden' || _follow.busy) return Promise.resolve();   // resumes when shown
  if(followBlocked()){ followSchedule(); return Promise.resolve(); }
  _follow.busy = true;
  return mlbGamePk().then(function(pk){
    if(pk !== _follow.pk){ _follow.pk = pk; _follow.stamp = null; }
    return mlbFetchJSON(MLB_FEED + pk + '/feed/live/timestamps').then(function(ts){
      var stamp = Array.isArray(ts) && ts.length ? ts[ts.length - 1] : null;
      if(stamp && stamp === _follow.stamp) return null;          // nothing new at MLB
      return mlbFetchJSON(MLB_FEED + pk + '/feed/live').then(function(feed){ return { feed: feed, stamp: stamp }; });
    });
  }).then(function(r){
    _follow.busy = false; _follow.error = ''; _follow.checkedAt = Date.now();
    if(r && r.feed && r.feed.liveData && followApply(r.feed)) _follow.stamp = r.stamp;
    renderFollowPill();
    followSchedule();
  }, function(err){
    _follow.busy = false;
    _follow.error = (err && err.message) || 'Couldn\'t reach MLB.';
    renderFollowPill();
    followSchedule();
  });
}

// Bring the scorecard up to MLB. Returns false if it had to wait (try the same data again).
function followApply(feed){
  if(!followIsMine()) return true;
  if(followBlocked()) return false;
  _mlb = { feed: feed, fetchedAt: Date.now() };     // Check vs MLB shows the same data
  var changed = false, n = mlbCatchUpCount(feed);
  if(n > 0){
    saveState();
    mlbApplyCatchUp(feed);
    addLog('Following MLB: ' + n + ' plate appearance' + (n === 1 ? '' : 's') + ' added', 'MLB', 't-info');
    changed = true;
  } else {
    var c = mlbCurrentAtBat(feed);
    if(c && followCountAhead(c)){ mlbApplyCount(c); changed = true; }
  }
  if(mlbMarkFinal(feed)) changed = true;
  if(changed){ renderAll(); saveToStorage(); renderMlbCheck(); }
  if(gameIsFinal()) stopFollow('Final — stopped following MLB');
  return true;
}

// MLB's count is further along than the scorecard's (balls + strikes, then fouls)
function followCountAhead(c){
  var mine = G.balls + G.strikes, theirs = c.balls + c.strikes;
  return theirs > mine || (theirs === mine && c.fouls > G.fouls);
}

// ── Header pill: shows following (and from where); tap to stop or to take over ──
function renderFollowPill(){
  var el = document.getElementById('followPill');
  if(!el) return;
  if(!G.mlbFollow || gameIsFinal()){ el.hidden = true; return; }
  el.hidden = false;
  if(followIsElsewhere()){
    el.textContent = '📡 Following on ' + G.mlbFollow.device;
    el.className = 'sync-pill';
    el.title = 'Another device is keeping this game caught up with MLB. Tap to follow here instead.';
  } else if(_follow.error){
    el.textContent = '📡 MLB: retrying';
    el.className = 'sync-pill sync-warn';
    el.title = _follow.error;
  } else {
    el.textContent = '📡 Following MLB';
    el.className = 'sync-pill sync-ok';
    el.title = _follow.checkedAt ? 'Checked ' + new Date(_follow.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) + ' · tap to stop' : 'Tap to stop';
  }
}

function followPillTap(){
  if(followIsElsewhere()){
    showConfirm({ title: 'Follow MLB on this device?', message: G.mlbFollow.device + ' is following this game now. Follow it here instead?', confirmLabel: 'Follow here', cancelLabel: 'Not now', tone: 'info' })
      .then(function(ok){ if(ok) startFollow(); });
  } else {
    showConfirm({ title: 'Stop following MLB?', message: 'The scorecard stops updating from MLB. You can start again from ☰ Menu or Check vs MLB.', confirmLabel: 'Stop', cancelLabel: 'Keep following', tone: 'info' })
      .then(function(ok){ if(ok) stopFollow(); });
  }
}

// Menu item: start, or stop
function toggleFollow(){
  if(followIsMine()) followPillTap();
  else if(followIsElsewhere()) followPillTap();
  else startFollow();
}

// ── Hooks ──
// Undo while following would be redone at the next check; pause following so it sticks
var _followOrigUndo = undoAction;
undoAction = function(){
  var was = followIsMine();
  _followOrigUndo();
  if(was){
    G.mlbFollow = null;
    stopFollow('Stopped following MLB so your Undo sticks');
  } else {
    renderFollowPill();
  }
};

// A different game loaded (My Games, another device's update): show its state,
// and keep checking if this device is the one following it
var _followOrigRenderAll = renderAll;
renderAll = function(){
  _followOrigRenderAll();
  renderFollowPill();
  if(followIsMine() && !_follow.timer && !_follow.busy && !gameIsFinal()) followSchedule();
};

function followInit(){
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && followIsMine()) followTick();
  });
  window.addEventListener('online', function(){ if(followIsMine()) followTick(); });
  renderFollowPill();
  if(followIsMine() && !gameIsFinal()) setTimeout(followTick, 0);      // resume after a reload
}
