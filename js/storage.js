// Saving: autosave, My Games, game info, file export/import, reset, and backups.
// Loaded as a plain script; files share one global scope (see index.html for the order).

// Silent reset (no confirm prompt, no init call)
function resetGameSilent(){
  HISTORY = [];
  hitWithErr = false;
  clearStorage();
  G = mkGame();
  resetOutState();
  ROSTERS = { home: [], away: [] };
  ROSTER_LOADING = { home: false, away: false };
  renderAll();
}

function resetGame(){
  showConfirm({
    title:'Reset game?',
    message:'Reset the entire game? All data will be cleared.',
    confirmLabel:'Reset',
    cancelLabel:'Keep playing',
    tone:'danger'
  }).then(function(ok){
    if(!ok) return;

    // Save the current game to its slot before resetting
    var activeId = gmGetActiveId();
    if(activeId && G.log.length > 0){
      gmSaveToSlot(activeId);
    }

    resetGameSilent();

    // Start a new game slot
    var newId = gmGenId();
    gmSetActiveId(newId);

    var undoBtn = document.getElementById('undoBtn');
    if(undoBtn) undoBtn.disabled = true;

    var hitErrBtn = document.getElementById('hitErrToggle');
    if(hitErrBtn) hitErrBtn.className = 'hit-err-toggle';
    var hitErrHint = document.getElementById('hitErrHint');
    if(hitErrHint) hitErrHint.textContent = '';

    init();
  });
}

// ── Local storage persistence ──
var STORAGE_KEY = 'baseball_scorecard_v1';

var _saveTimer = null;

function saveToStorage(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_doSave, 500);
}

// Immediate save (used by debounce and when we need sync save)
function _doSave(){
  try {
    var payload = {
      G: G,
      outState: outState,
      hitWithErr: hitWithErr,
      history: HISTORY,
      teamAway: document.getElementById('teamAway').value,
      teamHome: document.getElementById('teamHome').value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch(e){ warnSaveFailed(); }
  syncWakeLock();
}

// Storage writes fail silently (quota, private mode) — surface it so a
// 3-hour game doesn't vanish on reload. Throttled: saves fire constantly.
var _lastSaveWarn = 0;

function warnSaveFailed(){
  var now = Date.now();
  if(now - _lastSaveWarn < 5000) return;
  _lastSaveWarn = now;
  kbFlash('Save failed — storage full?', '#E24B4A');
}

function loadFromStorage(){
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    var payload = JSON.parse(raw);
    if(!payload || !payload.G) return false;
    G = migrateGame(payload.G);
    // Restore outState
    if(payload.outState){
      outState.type = payload.outState.type || null;
      outState.fielder = payload.outState.fielder || null;
      outState.throwTo = payload.outState.throwTo || null;
      outState.multiOut = payload.outState.multiOut || null;
      outState.sacType = payload.outState.sacType || null;
    }
    // Restore hitWithErr toggle
    if(payload.hitWithErr !== undefined) hitWithErr = !!payload.hitWithErr;
    // Restore undo history
    if(payload.history && Array.isArray(payload.history)){
      HISTORY = payload.history;
      var undoBtn = document.getElementById('undoBtn');
      if(undoBtn) undoBtn.disabled = HISTORY.length === 0;
    }
    // Restore team dropdowns
    if(payload.teamAway) document.getElementById('teamAway').value = payload.teamAway;
    if(payload.teamHome) document.getElementById('teamHome').value = payload.teamHome;
    return true;
  } catch(e){ return false; }
}

function clearStorage(){
  clearTimeout(_saveTimer);
  try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
}

// ── Multi-game manager ──
var GM_INDEX_KEY = 'baseball_scorecard_games';

var GM_GAME_PREFIX = 'baseball_scorecard_game_';

var GM_ACTIVE_KEY = 'baseball_scorecard_active';

function gmGenId(){
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function gmGetIndex(){
  try {
    var raw = localStorage.getItem(GM_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}

function gmSaveIndex(index){
  try { localStorage.setItem(GM_INDEX_KEY, JSON.stringify(index)); } catch(e){}
}

function gmGetActiveId(){
  try { return localStorage.getItem(GM_ACTIVE_KEY) || ''; } catch(e){ return ''; }
}

function gmSetActiveId(id){
  try { localStorage.setItem(GM_ACTIVE_KEY, id); } catch(e){}
}

// Build a summary object for the current game state
function gmCurrentSummary(){
  var away = document.getElementById('teamAway').value || '';
  var home = document.getElementById('teamHome').value || '';
  var awayLabel = (!away || away === '— Select Team —') ? 'Away' : away;
  var homeLabel = (!home || home === '— Select Team —') ? 'Home' : home;
  var inn = (G.half === 'top' ? 'T' : 'B') + G.inning;
  var status = G.log.length === 0 ? 'New' : inn;
  // Check if game is final
  var lastLog = G.log.length > 0 ? G.log[0] : null;
  if(lastLog && (lastLog.tag === 'Final' || (lastLog.text && lastLog.text.indexOf('FINAL') >= 0))){
    status = 'Final';
  }
  return {
    away: awayLabel,
    home: homeLabel,
    awayScore: G.rhe.away[0],
    homeScore: G.rhe.home[0],
    date: (G.notes && G.notes.date) || '',
    status: status,
    plays: G.log.length
  };
}

// Build the full payload to store for a game slot
function gmBuildPayload(){
  // No undo history in saved slots: it's ~30 full-game snapshots per save
  // and only meaningful for the active game (autosave keeps it).
  return {
    G: G,
    outState: outState,
    hitWithErr: hitWithErr,
    teamAway: document.getElementById('teamAway').value,
    teamHome: document.getElementById('teamHome').value
  };
}

// Save current game to a specific slot
function gmSaveToSlot(id){
  try {
    localStorage.setItem(GM_GAME_PREFIX + id, JSON.stringify(gmBuildPayload()));
  } catch(e){ warnSaveFailed(); }
  // Update the index entry
  var index = gmGetIndex();
  var summary = gmCurrentSummary();
  var found = false;
  for(var i = 0; i < index.length; i++){
    if(index[i].id === id){
      index[i].away = summary.away;
      index[i].home = summary.home;
      index[i].awayScore = summary.awayScore;
      index[i].homeScore = summary.homeScore;
      index[i].date = summary.date;
      index[i].status = summary.status;
      index[i].plays = summary.plays;
      index[i].savedAt = new Date().toISOString();
      found = true;
      break;
    }
  }
  if(!found){
    index.unshift({
      id: id,
      away: summary.away,
      home: summary.home,
      awayScore: summary.awayScore,
      homeScore: summary.homeScore,
      date: summary.date,
      status: summary.status,
      plays: summary.plays,
      savedAt: new Date().toISOString()
    });
  }
  gmSaveIndex(index);
  gmSetActiveId(id);
}

// Load a game from a slot
function gmLoadFromSlot(id){
  try {
    var raw = localStorage.getItem(GM_GAME_PREFIX + id);
    if(!raw) return false;
    var payload = JSON.parse(raw);
    if(!payload || !payload.G) return false;

    // Restore using the same logic as loadFromStorage
    G = migrateGame(payload.G);
    if(payload.outState){
      Object.assign(outState, payload.outState);
      if(outState.sacType === undefined) outState.sacType = null;
    } else { resetOutState(); }
    if(payload.hitWithErr !== undefined) hitWithErr = !!payload.hitWithErr;
    if(payload.history && Array.isArray(payload.history)){
      HISTORY = payload.history;
    } else { HISTORY = []; }
    var undoBtn = document.getElementById('undoBtn');
    if(undoBtn) undoBtn.disabled = HISTORY.length === 0;
    if(payload.teamAway) document.getElementById('teamAway').value = payload.teamAway;
    if(payload.teamHome) document.getElementById('teamHome').value = payload.teamHome;

    gmSetActiveId(id);
    // Also update the auto-save slot
    _doSave();

    // Re-fire team change for logos, rosters, stadium
    var away = document.getElementById('teamAway').value;
    var home = document.getElementById('teamHome').value;
    if(away && away !== '— Select Team —')fetchRoster('away', away);
    if(home && home !== '— Select Team —'){ fetchRoster('home', home); renderStadium(home); }
    onTeamChange();
    renderAll();
    return true;
  } catch(e){ return false; }
}

// Delete a saved game slot
function gmDeleteSlot(id){
  try { localStorage.removeItem(GM_GAME_PREFIX + id); } catch(e){}
  var index = gmGetIndex();
  index = index.filter(function(g){ return g.id !== id; });
  gmSaveIndex(index);
  // If we deleted the active game, clear the active marker
  if(gmGetActiveId() === id) gmSetActiveId('');
}

// ── Game Manager UI ──
function showGameManager(){
  // Auto-save current game to its slot before showing the list
  var activeId = gmGetActiveId();
  if(activeId){
    gmSaveToSlot(activeId);
  }

  var overlay = document.createElement('div');
  overlay.className = 'gm-overlay';
  overlay.id = 'gmOverlay';
  overlay.onclick = function(e){ if(e.target === overlay) closeGameManager(); };

  renderGameManagerContent(overlay);
  document.body.appendChild(overlay);
  focusModalClose(overlay, '.gm-close');
}

// Move keyboard/screen-reader focus into a freshly opened modal
function focusModalClose(overlay, sel){
  var btn = overlay.querySelector(sel);
  if(btn) btn.focus();
}

function closeGameManager(){
  var el = document.getElementById('gmOverlay');
  if(el) el.remove();
}

function renderGameManagerContent(overlay){
  if(!overlay) overlay = document.getElementById('gmOverlay');
  if(!overlay) return;

  var index = gmGetIndex();
  var activeId = gmGetActiveId();

  var html = '<div class="gm-modal">';
  html += '<div class="gm-hdr"><h3>📋 My Games</h3><button class="gm-close" onclick="closeGameManager()" aria-label="Close">&times;</button></div>';

  // Action buttons
  html += '<div class="gm-actions">';
  if(activeId){
    html += '<button class="gm-save-btn" onclick="gmSaveCurrentGame()">💾 Save current game</button>';
  }
  html += '<button class="gm-new-btn" onclick="gmNewGame()">+ New game</button>';
  html += '</div>';

  html += '<div class="gm-body">';

  html += psSeriesHtml();

  if(index.length === 0){
    html += '<div class="gm-empty">No saved games yet.<br>Tap "Save current game" to save your first one.</div>';
  } else {
    index.forEach(function(g){
      var isActive = g.id === activeId;
      var awayLogo = TEAM_LOGOS[g.away] || '';
      var homeLogo = TEAM_LOGOS[g.home] || '';

      html += '<div class="gm-card' + (isActive ? ' gm-active' : '') + '">';
      html += '<div class="gm-card-info">';

      // Teams row
      html += '<div class="gm-card-teams">';
      if(awayLogo) html += '<img class="gm-card-logo" src="' + awayLogo + '" alt="" />';
      html += esc(g.away);
      html += '<span class="gm-card-score">' + (g.awayScore || 0) + '</span>';
      html += '<span style="color:var(--muted);font-weight:400;font-size:11px">@</span>';
      if(homeLogo) html += '<img class="gm-card-logo" src="' + homeLogo + '" alt="" />';
      html += esc(g.home);
      html += '<span class="gm-card-score">' + (g.homeScore || 0) + '</span>';
      html += '</div>';

      // Meta row
      var metaParts = [];
      if(g.date) metaParts.push(g.date);
      if(g.status) metaParts.push(g.status);
      if(g.plays !== undefined) metaParts.push(g.plays + ' plays');
      if(g.savedAt){
        try {
          var sd = new Date(g.savedAt);
          var timeStr = sd.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
          metaParts.push('saved ' + timeStr);
        } catch(e){}
      }
      html += '<div class="gm-card-meta">' + metaParts.join(' · ') + '</div>';

      html += '</div>'; // card-info

      if(isActive){
        html += '<span class="gm-card-active-badge">Active</span>';
      }

      html += '<div class="gm-card-btns">';
      if(!isActive){
        html += '<button class="gm-card-btn gm-load" onclick="gmLoadGame(\'' + g.id + '\')">Load</button>';
      }
      html += '<button class="gm-card-btn gm-del" onclick="gmConfirmDelete(\'' + g.id + '\')">Delete</button>';
      html += '</div>';

      html += '</div>'; // gm-card
    });
  }

  html += '</div>'; // gm-body
  html += '</div>'; // gm-modal

  overlay.innerHTML = html;
}

function gmSaveCurrentGame(){
  var activeId = gmGetActiveId();
  if(!activeId){
    // No active slot — create one
    activeId = gmGenId();
  }
  gmSaveToSlot(activeId);
  kbFlash('Game saved', '#1D9E75');
  renderGameManagerContent();
}

function gmNewGame(){
  // Save current game first if it has data
  var activeId = gmGetActiveId();
  if(activeId && G.log.length > 0){
    gmSaveToSlot(activeId);
  }

  // Create a fresh game
  var newId = gmGenId();
  resetGameSilent();
  HISTORY = [];
  hitWithErr = false;
  var undoBtn = document.getElementById('undoBtn');
  if(undoBtn) undoBtn.disabled = true;
  var hitErrBtn = document.getElementById('hitErrToggle');
  if(hitErrBtn) hitErrBtn.className = 'hit-err-toggle';
  var hitErrHint = document.getElementById('hitErrHint');
  if(hitErrHint) hitErrHint.textContent = '';

  gmSetActiveId(newId);
  _doSave();

  // Save empty game to slot so it appears in the list
  gmSaveToSlot(newId);

  renderAll();
  closeGameManager();
  kbFlash('New game started', '#185FA5');
}

function gmLoadGame(id){
  // Save current game first
  var activeId = gmGetActiveId();
  if(activeId && activeId !== id){
    gmSaveToSlot(activeId);
  }

  var ok = gmLoadFromSlot(id);
  if(ok){
    closeGameManager();
    kbFlash('Game loaded', '#185FA5');
  } else {
    showAlert({ title:'Load failed', message:'Could not load this game. The save data may be corrupted.', tone:'danger' });
  }
}

function gmConfirmDelete(id){
  var index = gmGetIndex();
  var g = null;
  for(var i = 0; i < index.length; i++){
    if(index[i].id === id){ g = index[i]; break; }
  }
  var label = g ? (g.away + ' @ ' + g.home + (g.date ? ' (' + g.date + ')' : '')) : 'this game';
  showConfirm({
    title:'Delete game?',
    message:'Delete ' + label + '? This cannot be undone.',
    confirmLabel:'Delete',
    cancelLabel:'Keep',
    tone:'danger'
  }).then(function(ok){
    if(!ok) return;
    gmDeleteSlot(id);
    renderGameManagerContent();
    kbFlash('Game deleted', '#E24B4A');
  });
}

// ── Auto-assign active ID on first load ──
// If there's data in the old v1 slot but no active game ID, assign one
function gmEnsureActiveId(){
  var activeId = gmGetActiveId();
  if(activeId) return;
  // Check if there's existing game data worth saving
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      var payload = JSON.parse(raw);
      if(payload && payload.G && payload.G.log && payload.G.log.length > 0){
        // Migrate: assign an ID and save to the game index
        var newId = gmGenId();
        localStorage.setItem(GM_GAME_PREFIX + newId, raw);
        var g = payload.G;
        var away = payload.teamAway || 'Away';
        var home = payload.teamHome || 'Home';
        if(away === '— Select Team —') away = 'Away';
        if(home === '— Select Team —') home = 'Home';
        var index = gmGetIndex();
        index.unshift({
          id: newId,
          away: away,
          home: home,
          awayScore: g.rhe ? g.rhe.away[0] : 0,
          homeScore: g.rhe ? g.rhe.home[0] : 0,
          date: (g.notes && g.notes.date) || '',
          status: g.log.length > 0 ? ((g.half === 'top' ? 'T' : 'B') + g.inning) : 'New',
          plays: g.log.length,
          savedAt: new Date().toISOString()
        });
        gmSaveIndex(index);
        gmSetActiveId(newId);
      }
    }
  } catch(e){}
}

// Also hook into the existing _doSave to keep the active slot in sync
var _origDoSave = _doSave;

_doSave = function(){
  _origDoSave();
  renderBackupNudge();
  // Also update the active game slot
  var activeId = gmGetActiveId();
  if(activeId){
    try {
      localStorage.setItem(GM_GAME_PREFIX + activeId, JSON.stringify(gmBuildPayload()));
    } catch(e){ warnSaveFailed(); }
  }
};

function onTeamChange() {
  var away = document.getElementById('teamAway').value;
  var home = document.getElementById('teamHome').value;
  var awayLabel = away==='— Select Team —' ? 'Away' : away;
  var homeLabel = home==='— Select Team —' ? 'Home' : home;
  var awayLogo = TEAM_LOGOS[away] ? '<img src="'+TEAM_LOGOS[away]+'" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px;" alt="" />' : '';
  var homeLogo = TEAM_LOGOS[home] ? '<img src="'+TEAM_LOGOS[home]+'" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px;" alt="" />' : '';
  document.getElementById('awayLineupTitle').innerHTML = awayLogo + awayLabel;
  document.getElementById('homeLineupTitle').innerHTML = homeLogo + homeLabel;
  renderPitchers('home'); renderPitchers('away'); renderScore();
  renderStadium(home === '— Select Team —' ? null : home);
  // Auto-fill venue from home team stadium
  if(home && home !== '— Select Team —') autoFillVenue(home);
  // Fetch rosters when valid teams are selected
  if(away && away !== '— Select Team —') fetchRoster('away', away);
  else { ROSTERS['away']=[]; renderLineup('away'); }
  if(home && home !== '— Select Team —') fetchRoster('home', home);
  else { ROSTERS['home']=[]; renderLineup('home'); }
  renderAtBatBar();
  saveToStorage();
}

document.getElementById('teamHome').addEventListener('input',function(){ document.getElementById('homeLineupTitle').textContent=this.value||'Home'; renderPitchers('home');renderPitchers('away');renderScore(); saveToStorage(); });

document.getElementById('teamAway').addEventListener('input',function(){ document.getElementById('awayLineupTitle').textContent=this.value||'Away'; renderPitchers('home');renderPitchers('away');renderScore(); saveToStorage(); });

// ── Game info / notes ──
var giOpen = false;

function toggleGameInfo(){
  giOpen = !giOpen;
  var body = document.getElementById('giBody');
  var arrow = document.getElementById('giArrow');
  if(body) body.className = 'game-info-body' + (giOpen ? ' open' : '');
  if(arrow) arrow.className = 'game-info-arrow' + (giOpen ? ' open' : '');
}

function selectWeather(type){
  // Toggle: if already selected, deselect
  if(G.notes.weather === type) G.notes.weather = '';
  else G.notes.weather = type;
  renderWeatherBtns();
  saveNotes();
}

function renderWeatherBtns(){
  var btns = document.querySelectorAll('.gi-weather-btn');
  btns.forEach(function(btn){
    var w = btn.getAttribute('data-weather');
    btn.className = 'gi-weather-btn' + (w === G.notes.weather ? ' sel' : '');
  });
}

function saveNotes(){
  if(!G.notes) G.notes = mkNotes();
  scheduleScorecardRender(); // postseason badge follows game type
  G.notes.date = (document.getElementById('giDate') || {}).value || '';
  G.notes.firstPitch = (document.getElementById('giFirstPitch') || {}).value || '';
  G.notes.venue = (document.getElementById('giVenue') || {}).value || '';
  G.notes.attendance = (document.getElementById('giAttendance') || {}).value || '';
  G.notes.temp = (document.getElementById('giTemp') || {}).value || '';
  G.notes.windSpeed = (document.getElementById('giWindSpeed') || {}).value || '';
  G.notes.windDir = (document.getElementById('giWindDir') || {}).value || '';
  G.notes.umpHP = (document.getElementById('giUmpHP') || {}).value || '';
  G.notes.ump1B = (document.getElementById('giUmp1B') || {}).value || '';
  G.notes.ump2B = (document.getElementById('giUmp2B') || {}).value || '';
  G.notes.ump3B = (document.getElementById('giUmp3B') || {}).value || '';
  G.notes.gameType = (document.getElementById('giGameType') || {}).value || '';
  // Game # only applies to a postseason round; keep it within the series length
  var ps = POSTSEASON[G.notes.gameType];
  var sg = parseInt((document.getElementById('giSeriesGame') || {}).value, 10);
  G.notes.seriesGame = ps && sg >= 1 && sg <= ps.maxGames ? String(sg) : '';
  renderSeriesGamePicker();
  G.notes.attended = !!(document.getElementById('giAttended') || {}).checked;
  G.notes.text = (document.getElementById('giNotes') || {}).value || '';
  saveToStorage();
}

function restoreNotes(){
  if(!G.notes) G.notes = mkNotes();
  var n = G.notes;
  var el;
  el = document.getElementById('giDate'); if(el) el.value = n.date || '';
  el = document.getElementById('giFirstPitch'); if(el) el.value = n.firstPitch || '';
  el = document.getElementById('giVenue'); if(el) el.value = n.venue || '';
  el = document.getElementById('giAttendance'); if(el) el.value = n.attendance || '';
  el = document.getElementById('giTemp'); if(el) el.value = n.temp || '';
  el = document.getElementById('giWindSpeed'); if(el) el.value = n.windSpeed || '';
  el = document.getElementById('giWindDir'); if(el) el.value = n.windDir || '';
  el = document.getElementById('giUmpHP'); if(el) el.value = n.umpHP || '';
  el = document.getElementById('giUmp1B'); if(el) el.value = n.ump1B || '';
  el = document.getElementById('giUmp2B'); if(el) el.value = n.ump2B || '';
  el = document.getElementById('giUmp3B'); if(el) el.value = n.ump3B || '';
  el = document.getElementById('giGameType'); if(el) el.value = n.gameType || '';
  renderSeriesGamePicker();
  el = document.getElementById('giAttended'); if(el) el.checked = !!n.attended;
  el = document.getElementById('giNotes'); if(el) el.value = n.text || '';
  renderWeatherBtns();
  // Auto-open if any notes have been filled in
  var hasData = n.date || n.venue || n.attendance || n.weather || n.temp || n.windSpeed || n.umpHP || n.gameType || n.text || n.firstPitch;
  if(hasData && !giOpen) toggleGameInfo();
}

// Auto-fill venue when home team changes
function autoFillVenue(teamName){
  var venueEl = document.getElementById('giVenue');
  if(!venueEl) return;
  // Only auto-fill if the venue field is empty or matches a known stadium
  var cur = venueEl.value.trim();
  var allVenues = {};
  Object.keys(STADIUMS).forEach(function(t){ allVenues[STADIUMS[t].name] = true; });
  if(cur === '' || allVenues[cur]){
    var sd = STADIUMS[teamName];
    if(sd){
      venueEl.value = sd.name;
      G.notes.venue = sd.name;
      saveToStorage();
    }
  }
}

// Auto-fill today's date if date field is empty
function autoFillDate(){
  var el = document.getElementById('giDate');
  if(!el || el.value) return;
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  el.value = yyyy+'-'+mm+'-'+dd;
  G.notes.date = el.value;
}

// ── Save / Load menu ──
function toggleSaveMenu(){
  var menu = document.getElementById('saveMenu');
  if(!menu) return;
  var isOpen = menu.classList.contains('open');
  menu.classList.toggle('open', !isOpen);
  if(!isOpen){
    renderBackupHint();
    // Close on outside click
    setTimeout(function(){
      document.addEventListener('click', closeSaveMenuOutside);
    }, 10);
  }
}

function closeSaveMenu(){
  var menu = document.getElementById('saveMenu');
  if(menu) menu.classList.remove('open');
  document.removeEventListener('click', closeSaveMenuOutside);
}

function closeSaveMenuOutside(e){
  var wrap = document.querySelector('.save-menu-wrap');
  if(wrap && !wrap.contains(e.target)) closeSaveMenu();
}

// ── JSON export ──
function exportJSON(){
  var away = document.getElementById('teamAway').value || 'Away';
  var home = document.getElementById('teamHome').value || 'Home';

  var payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    teamAway: away,
    teamHome: home,
    G: G,
    outState: outState,
    hitWithErr: hitWithErr
  };

  var json = JSON.stringify(payload, null, 2);

  // Build descriptive filename
  var parts = [];
  if(away !== '— Select Team —') parts.push(away.replace(/\s+/g, '_'));
  if(home !== '— Select Team —') parts.push(home.replace(/\s+/g, '_'));
  var datePart = '';
  if(G.notes && G.notes.date){
    datePart = G.notes.date;
  } else {
    var d = new Date();
    datePart = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  var filename = (parts.length ? parts.join('_vs_') : 'scorecard') + '_' + datePart + '.json';

  shareOrDownloadJSON(json, filename, function(){ kbFlash('Game saved', '#1D9E75'); });
}

// On touch devices, use the native share sheet (AirDrop, Files, …) —
// anchor downloads are unreliable in installed home-screen apps.
// Desktop keeps the plain file download. onDone runs once the file has been
// handed off (not if the share sheet is dismissed).
function shareOrDownloadJSON(json, filename, onDone){
  if('ontouchend' in document && navigator.canShare){
    try {
      var file = new File([json], filename, {type: 'application/json'});
      if(navigator.canShare({files: [file]})){
        navigator.share({files: [file]})
          .then(function(){ if(onDone) onDone(); })
          .catch(function(err){
            // AbortError = user dismissed the sheet; anything else, fall back
            if(!err || err.name !== 'AbortError'){
              _downloadJSON(json, filename);
              if(onDone) onDone();
            }
          });
        return;
      }
    } catch(e){}
  }
  _downloadJSON(json, filename);
  if(onDone) onDone();
}

function _downloadJSON(json, filename){
  var blob = new Blob([json], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── JSON import ──
function triggerImport(){
  var inp = document.getElementById('jsonFileInput');
  if(inp){ inp.value = ''; inp.click(); }
}

function importJSON(evt){
  var file = evt.target.files && evt.target.files[0];
  if(!file) return;

  var reader = new FileReader();
  reader.onload = function(e){
    var payload;
    try {
      payload = JSON.parse(e.target.result);
    } catch(err){
      showAlert({ title:'Could not read file', message:(err.message || 'The file is not valid JSON.'), tone:'danger' });
      return;
    }

    // A full backup (every game) rather than a single game file
    if(payload && payload.kind === 'scorecard-backup'){
      restoreBackup(payload);
      return;
    }

    // Validate basic structure
    if(!payload || !payload.G){
      showAlert({ title:'Invalid file', message:'Scorecard file is missing game data.', tone:'danger' });
      return;
    }
    if(!payload.G.lineup || !payload.G.scores){
      showAlert({ title:'Invalid file', message:'Scorecard file has incomplete game state.', tone:'danger' });
      return;
    }

    // Confirm if there's existing game data
    if(G.log.length > 0){
      showConfirm({
        title:'Replace current game?',
        message:'Load this game file? Your current scorecard will be replaced.',
        confirmLabel:'Load',
        cancelLabel:'Cancel',
        tone:'warn'
      }).then(function(ok){
        if(ok) _applyImportedPayload(payload);
      });
      return;
    }
    _applyImportedPayload(payload);
  };
  reader.readAsText(file);
}

function _applyImportedPayload(payload){
  // Save current game before importing
  var activeId = gmGetActiveId();
  if(activeId && G.log.length > 0){
    gmSaveToSlot(activeId);
  }

  // Assign a new slot for the imported game
  var newId = gmGenId();
  gmSetActiveId(newId);

  // Load the game state
  G = migrateGame(payload.G);

  // Restore outState
  if(payload.outState){
    Object.assign(outState, payload.outState);
    if(outState.sacType === undefined) outState.sacType = null;
  } else {
    resetOutState();
  }

  // Restore hitWithErr
  hitWithErr = !!(payload.hitWithErr);

  // Clear undo history (doesn't make sense to carry over from file)
  HISTORY = [];
  var undoBtn = document.getElementById('undoBtn');
  if(undoBtn) undoBtn.disabled = true;

  // Set team dropdowns
  if(payload.teamAway){
    document.getElementById('teamAway').value = payload.teamAway;
  }
  if(payload.teamHome){
    document.getElementById('teamHome').value = payload.teamHome;
  }
  onTeamChange();
  renderAll();
  saveToStorage();

  var awayLabel = payload.teamAway || 'Away';
  var homeLabel = payload.teamHome || 'Home';
  addLog('Loaded from file: ' + awayLabel + ' vs ' + homeLabel, 'Game', 't-info');
  kbFlash('Game loaded', '#185FA5');
}

// ── Backup all games ──
// One file with every game in My Games (the current game is saved there
// first). Restoring merges: games already on this device are left alone.
// The reminder compares each game's fingerprint (plays/status/score) with
// what the last backup contained.
var BK_KEY = 'baseball_scorecard_backup';

var BK_STALE_MS = 7 * 24 * 3600 * 1000;

var BK_SNOOZE_MS = 24 * 3600 * 1000;

function bkState(){
  var st = null;
  try { st = JSON.parse(localStorage.getItem(BK_KEY) || 'null'); } catch(e){}
  st = st || {};
  st.sigs = st.sigs || {};
  st.nudged = st.nudged || {};
  return st;
}

function bkSaveState(st){
  try { localStorage.setItem(BK_KEY, JSON.stringify(st)); } catch(e){}
}

function bkSignature(e){ return [e.plays, e.status, e.awayScore, e.homeScore].join('|'); }

// Every game with plays, the current one summarized from live state
function bkGames(){
  var activeId = gmGetActiveId();
  var sawActive = false, list = [];
  gmGetIndex().forEach(function(e){
    if(e.id === activeId){ sawActive = true; e = Object.assign({}, e, gmCurrentSummary()); }
    if(e.plays > 0) list.push(e);
  });
  // A first game on a fresh install has no slot yet — still counts
  if(!sawActive && G.log.length > 0) list.push(Object.assign({id: activeId || '(current)'}, gmCurrentSummary()));
  return list;
}

// Games in neither the last backup file nor (on a synced device) the cloud
function bkUnbacked(){
  var st = bkState();
  var synced = typeof syncHasUploaded === 'function' ? syncHasUploaded : function(){ return false; };
  return bkGames().filter(function(e){ return st.sigs[e.id] !== bkSignature(e) && !synced(e.id); });
}

function backupAllGames(){
  // Flush autosave and make sure the current game is in My Games
  clearTimeout(_saveTimer);
  _doSave();
  var activeId = gmGetActiveId();
  if(G.log.length > 0){
    // Fresh installs have no active slot until a reset; give it one so this
    // game is in the backup and autosave keeps that slot current from now on.
    if(!activeId){ activeId = gmGenId(); gmSetActiveId(activeId); }
    gmSaveToSlot(activeId);
  }

  var games = [];
  gmGetIndex().forEach(function(e){
    var raw = null;
    try { raw = localStorage.getItem(GM_GAME_PREFIX + e.id); } catch(x){}
    if(!raw) return;
    try { games.push({ id: e.id, meta: e, payload: JSON.parse(raw) }); } catch(x){}
  });
  if(!games.length){
    showAlert({ title:'Nothing to back up', message:'There are no saved games yet.', tone:'info' });
    return;
  }

  var d = new Date();
  var ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  var json = JSON.stringify({ kind:'scorecard-backup', version:1, exportedAt:d.toISOString(), games:games });
  var sigs = {};
  games.forEach(function(g){ sigs[g.id] = bkSignature(g.meta); });

  shareOrDownloadJSON(json, 'scorecard-backup-' + ymd + '.json', function(){
    var st = bkState();
    st.at = Date.now();
    st.sigs = sigs;
    bkSaveState(st);
    renderBackupNudge();
    kbFlash('Backed up ' + games.length + ' game' + (games.length === 1 ? '' : 's'), '#1D9E75');
  });
}

function restoreBackup(backup){
  if(!Array.isArray(backup.games)){
    showAlert({ title:'Invalid backup', message:'This backup file has no games in it.', tone:'danger' });
    return;
  }
  var index = gmGetIndex();
  var have = {};
  index.forEach(function(e){ have[e.id] = true; });
  have[gmGetActiveId()] = true;
  var st = bkState();
  var added = 0, skipped = 0, bad = 0, failed = 0;

  backup.games.forEach(function(g){
    var ok = g && g.id && g.payload && g.payload.G && g.payload.G.lineup && g.payload.G.scores;
    if(!ok){ bad++; return; }
    if(have[g.id]){ skipped++; return; }
    try { localStorage.setItem(GM_GAME_PREFIX + g.id, JSON.stringify(g.payload)); }
    catch(e){ failed++; return; }
    var meta = Object.assign({ away:'Away', home:'Home', awayScore:0, homeScore:0, date:'', status:'', plays:0 }, g.meta || {}, { id: g.id });
    index.push(meta);
    st.sigs[g.id] = bkSignature(meta); // it came from a backup, so it's backed up
    have[g.id] = true;
    added++;
  });

  // Newest first, as My Games lists them
  index.sort(function(a, b){ return String(b.savedAt || '').localeCompare(String(a.savedAt || '')); });
  gmSaveIndex(index);
  bkSaveState(st);
  renderBackupNudge();

  var lines = [added + ' game' + (added === 1 ? '' : 's') + ' added to My Games.'];
  if(skipped) lines.push(skipped + ' already on this device (left unchanged).');
  if(bad) lines.push(bad + ' unreadable entr' + (bad === 1 ? 'y' : 'ies') + ' skipped.');
  if(failed) lines.push(failed + ' couldn\'t be saved — storage may be full.');
  showAlert({ title:'Backup restored', message: lines.join('\n'), tone: failed ? 'danger' : 'info' });
}

// Reminder banner: only between games (never mid-game), when something
// isn't backed up and either the game just finished or the last backup is
// over a week old. Dismissing snoozes it for a day.
// On a synced device, games count as backed up once they're in the cloud.
function backupNudgeCount(){
  var cur = gmCurrentSummary();
  if(G.log.length > 0 && cur.status !== 'Final') return 0;
  var unbacked = bkUnbacked();
  if(!unbacked.length) return 0;
  var st = bkState(), now = Date.now();
  var activeId = gmGetActiveId();
  var justFinished = cur.status === 'Final' && activeId && !st.nudged[activeId];
  var stale = now - (st.at || 0) > BK_STALE_MS;
  var snoozed = now - (st.dismissedAt || 0) < BK_SNOOZE_MS;
  return (justFinished || (stale && !snoozed)) ? unbacked.length : 0;
}

function renderBackupNudge(){
  var el = document.getElementById('backupNudge');
  if(!el) return;
  var n = backupNudgeCount();
  if(!n){ el.hidden = true; return; }
  el.innerHTML = '<span class="bn-text">💾 ' + n + ' game' + (n === 1 ? '' : 's') + ' not backed up</span>'
    + '<button class="bn-go" onclick="backupAllGames()">Back up now</button>'
    + '<button class="bn-x" onclick="dismissBackupNudge()" aria-label="Dismiss backup reminder">&times;</button>';
  el.hidden = false;
}

function dismissBackupNudge(){
  var st = bkState();
  st.dismissedAt = Date.now();
  var activeId = gmGetActiveId();
  if(activeId) st.nudged[activeId] = true;
  bkSaveState(st);
  renderBackupNudge();
}

// "Last backup: 3 days ago" under the menu item
function renderBackupHint(){
  var el = document.getElementById('backupHint');
  if(!el) return;
  var at = bkState().at;
  var cloud = typeof syncIsOn === 'function' && syncIsOn();
  if(!at){ el.textContent = cloud ? '☁ Backed up by sync' : 'Never backed up'; return; }
  var days = Math.floor((Date.now() - at) / (24 * 3600 * 1000));
  var when = days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
  el.textContent = cloud ? '☁ Backed up by sync · last file ' + when : 'Last backup: ' + when;
}
