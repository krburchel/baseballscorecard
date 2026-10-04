// App shell: dialogs, keyboard shortcuts, event delegation, wake lock, and startup (loads last).
// Loaded as a plain script; files share one global scope (see index.html for the order).

// ── Custom confirm / alert modals ──
// Replaces native alert()/confirm() which steal focus and look jarring on iOS.
// showConfirm returns Promise<boolean>; showAlert returns Promise<void>.
// opts: { title, message, confirmLabel, cancelLabel, tone: 'warn'|'danger'|'info' }

function _cfClose(overlay, resolve, value){
  if(!overlay || !overlay.parentNode) return;
  document.removeEventListener('keydown', overlay._kbHandler, true);
  overlay.parentNode.removeChild(overlay);
  if(resolve) resolve(value);
}

function _cfBuild(opts, onResolve){
  var tone = opts.tone || 'warn';
  var icon = tone === 'danger' ? '⚠' : tone === 'info' ? 'ⓘ' : '?';
  var title = esc(opts.title || '');
  var message = esc(opts.message || '').replace(/\n/g, '<br>');
  var confirmLabel = esc(opts.confirmLabel || 'OK');
  var cancelLabel = opts.cancelLabel === null ? null : esc(opts.cancelLabel || 'Cancel');
  var confirmClass = tone === 'danger' ? 'danger' : 'primary';

  var overlay = document.createElement('div');
  overlay.className = 'cf-overlay';

  var html = '<div class="cf-modal" role="dialog" aria-modal="true">';
  if(title){
    html += '<div class="cf-hdr">'
      + '<div class="cf-icon ' + tone + '">' + icon + '</div>'
      + '<div class="cf-title">' + title + '</div>'
      + '</div>';
  }
  html += '<div class="cf-body' + (title ? ' with-icon' : '') + '">' + message + '</div>';
  html += '<div class="cf-btns">';
  if(cancelLabel !== null){
    html += '<button type="button" class="cf-btn" data-cf="cancel">' + cancelLabel + '</button>';
  }
  html += '<button type="button" class="cf-btn ' + confirmClass + '" data-cf="confirm">' + confirmLabel + '</button>';
  html += '</div></div>';
  overlay.innerHTML = html;

  overlay.addEventListener('click', function(e){
    if(e.target === overlay){
      // Backdrop click = cancel (or OK if alert-only)
      _cfClose(overlay, onResolve, cancelLabel === null ? true : false);
    } else if(e.target.dataset && e.target.dataset.cf){
      _cfClose(overlay, onResolve, e.target.dataset.cf === 'confirm');
    }
  });

  overlay._kbHandler = function(e){
    if(e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      _cfClose(overlay, onResolve, cancelLabel === null ? true : false);
    } else if(e.key === 'Enter'){
      e.preventDefault(); e.stopPropagation();
      _cfClose(overlay, onResolve, true);
    }
  };
  document.addEventListener('keydown', overlay._kbHandler, true);

  document.body.appendChild(overlay);

  // Focus the primary button for keyboard users
  setTimeout(function(){
    var btn = overlay.querySelector('[data-cf="confirm"]');
    if(btn) btn.focus();
  }, 0);

  return overlay;
}

function showConfirm(opts){
  return new Promise(function(resolve){
    _cfBuild(opts || {}, resolve);
  });
}

function showAlert(opts){
  // opts can be a string for convenience
  if(typeof opts === 'string') opts = { message: opts };
  opts = opts || {};
  opts.cancelLabel = null;
  opts.confirmLabel = opts.confirmLabel || 'OK';
  opts.tone = opts.tone || 'info';
  return new Promise(function(resolve){
    _cfBuild(opts, function(){ resolve(); });
  });
}

// ── Keyboard shortcuts ──
var kbFlashTimer = null;

function kbFlash(msg, color){
  var el = document.getElementById('kbFlash');
  if(!el) return;
  el.textContent = msg;
  if(color) el.style.background = color;
  else el.style.background = '';
  el.classList.add('show');
  clearTimeout(kbFlashTimer);
  kbFlashTimer = setTimeout(function(){ el.classList.remove('show'); }, 900);
}

function isEditing(){
  var ae = document.activeElement;
  if(!ae) return false;
  var tag = ae.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable;
}

document.addEventListener('keydown', function(e){
  // Don't intercept when typing in inputs/selects
  if(isEditing()) return;
  // Don't intercept if a modal is open (except Escape to close it)
  if(document.getElementById('gamesOverlay')){
    if(e.key === 'Escape') closeTodaysGames();
    return;
  }
  if(document.getElementById('kbOverlay')){
    if(e.key === 'Escape') closeKBHelp();
    return;
  }
  if(document.getElementById('gmOverlay')){
    if(e.key === 'Escape') closeGameManager();
    return;
  }
  if(document.getElementById('peOverlay')){
    if(e.key === 'Escape') closePaEditor();
    return;
  }
  if(document.getElementById('pleOverlay')){
    if(e.key === 'Escape') closePitchLineEditor();
    return;
  }
  if(document.getElementById('mlbOverlay')){
    if(e.key === 'Escape') closeMlbCheck();
    return;
  }
  if(document.getElementById('sfOverlay')){
    if(e.key === 'Escape') closeShareFinal();
    return;
  }
  if(document.getElementById('ssOverlay')){
    if(e.key === 'Escape') closeSeasonStats();
    return;
  }
  // If runner placement picker is open, only allow Escape (auto-advance)
  if(document.getElementById('rpOverlay')){
    if(e.key === 'Escape'){ rpAutoAdvance(); }
    return;
  }

  var key = e.key.toLowerCase();
  var shift = e.shiftKey;

  // ── Count ──
  if(key === 'b' && !shift){ e.preventDefault(); addBall(); kbFlash('Ball ' + G.balls, '#1D9E75'); return; }
  if(key === 's' && !shift){ e.preventDefault(); addStrike(); kbFlash('Strike', '#E24B4A'); return; }
  if(key === 'f' && !shift){ e.preventDefault(); addFoul(); kbFlash('Foul', '#534AB7'); return; }

  // ── Hits ──
  if(key === '1' && !shift){ e.preventDefault(); recordHit(1); kbFlash('Single', '#0F6E56'); return; }
  if(key === '2' && !shift){ e.preventDefault(); recordHit(2); kbFlash('Double', '#185FA5'); return; }
  if(key === '3' && !shift){ e.preventDefault(); recordHit(3); kbFlash('Triple', '#534AB7'); return; }
  if(key === '4' && !shift){ e.preventDefault(); recordHit(4); kbFlash('Home Run!', '#E24B4A'); return; }

  // ── Strikeouts ──
  if(key === 'k' && !shift){ e.preventDefault(); recordKO('swinging'); kbFlash('K Swinging', '#E24B4A'); return; }
  if(key === 'k' && shift){ e.preventDefault(); recordKO('looking'); kbFlash('ꓘ Looking', '#993C1D'); return; }

  // ── Outs / special ──
  if(key === 'o' && !shift){ e.preventDefault(); manualOut(); kbFlash('Out ' + G.outs); return; }
  if(key === 'w' && !shift){ e.preventDefault(); recordHBP(); kbFlash('HBP', '#BA7517'); return; }
  if(key === 'w' && shift){ e.preventDefault(); recordIBB(); kbFlash('IBB', '#0F6E56'); return; }

  // ── Baserunning ──
  if(key === 'r' && !shift){ e.preventDefault(); addRun(); kbFlash('Run +1', '#185FA5'); return; }

  // ── Undo ──
  if(key === 'z' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); undoAction(); kbFlash('Undo'); return; }
  if(key === 'u' && !shift){ e.preventDefault(); undoAction(); kbFlash('Undo'); return; }

  // ── Inning navigation ──
  if(key === 'arrowleft'){ e.preventDefault(); changeInning(-1); kbFlash('← Inn ' + G.inning); return; }
  if(key === 'arrowright'){ e.preventDefault(); changeInning(1); kbFlash('→ Inn ' + G.inning); return; }
  if(key === 'h' && !shift){ e.preventDefault(); toggleHalf(); var hLabel = G.half==='top'?'Top':'Bot'; kbFlash(hLabel + ' ' + G.inning); return; }

  // ── Help ──
  if(key === '?' || (key === '/' && shift)){ e.preventDefault(); toggleKBHelp(); return; }
  if(key === 'escape'){ closeKBHelp(); closeRunnerPicker(); return; }
});

function toggleKBHelp(){
  if(document.getElementById('kbOverlay')) { closeKBHelp(); return; }
  var overlay = document.createElement('div');
  overlay.className = 'kb-overlay';
  overlay.id = 'kbOverlay';
  overlay.onclick = function(e){ if(e.target === overlay) closeKBHelp(); };

  var html = '<div class="kb-modal">'
    + '<div class="kb-modal-hdr"><h3>⌨ Keyboard Shortcuts</h3><button class="kb-modal-close" onclick="closeKBHelp()" aria-label="Close">&times;</button></div>'
    + '<div class="kb-modal-body">';

  html += '<div class="kb-section"><div class="kb-section-title">Pitch Count</div>'
    + '<div class="kb-row"><span>Ball</span><span class="kb-key">B</span></div>'
    + '<div class="kb-row"><span>Strike</span><span class="kb-key">S</span></div>'
    + '<div class="kb-row"><span>Foul</span><span class="kb-key">F</span></div>'
    + '</div>';

  html += '<div class="kb-section"><div class="kb-section-title">Hits</div>'
    + '<div class="kb-row"><span>Single</span><span class="kb-key">1</span></div>'
    + '<div class="kb-row"><span>Double</span><span class="kb-key">2</span></div>'
    + '<div class="kb-row"><span>Triple</span><span class="kb-key">3</span></div>'
    + '<div class="kb-row"><span>Home Run</span><span class="kb-key">4</span></div>'
    + '</div>';

  html += '<div class="kb-section"><div class="kb-section-title">Strikeouts</div>'
    + '<div class="kb-row"><span>Strikeout swinging</span><span class="kb-key">K</span></div>'
    + '<div class="kb-row"><span>Strikeout looking</span><span><span class="kb-key">Shift</span><span class="kb-key">K</span></span></div>'
    + '</div>';

  html += '<div class="kb-section"><div class="kb-section-title">Outs &amp; Baserunning</div>'
    + '<div class="kb-row"><span>Record out</span><span class="kb-key">O</span></div>'
    + '<div class="kb-row"><span>Add run</span><span class="kb-key">R</span></div>'
    + '<div class="kb-row"><span>Hit by pitch</span><span class="kb-key">W</span></div>'
    + '<div class="kb-row"><span>Intentional walk</span><span><span class="kb-key">Shift</span><span class="kb-key">W</span></span></div>'
    + '</div>';

  html += '<div class="kb-section"><div class="kb-section-title">Navigation</div>'
    + '<div class="kb-row"><span>Previous inning</span><span class="kb-key">←</span></div>'
    + '<div class="kb-row"><span>Next inning</span><span class="kb-key">→</span></div>'
    + '<div class="kb-row"><span>Switch half</span><span class="kb-key">H</span></div>'
    + '<div class="kb-row"><span>Undo</span><span><span class="kb-key">U</span> or <span class="kb-key">Ctrl</span><span class="kb-key">Z</span></span></div>'
    + '<div class="kb-row"><span>This help</span><span class="kb-key">?</span></div>'
    + '</div>';

  html += '</div></div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  focusModalClose(overlay, '.kb-modal-close');
}

function closeKBHelp(){
  var el = document.getElementById('kbOverlay');
  if(el) el.remove();
}

// ── Event delegation ──
// Single click/change handlers on container elements instead of per-element inline handlers.

function findAction(el, container){
  // Walk up from the clicked element to find the nearest data-action
  while(el && el !== container){
    if(el.dataset && el.dataset.action) return el;
    el = el.parentElement;
  }
  return null;
}

// init() runs again after Reset game, so each setup binds only once —
// otherwise every tap fires twice (e.g. "Add pitcher" adding two).
function setupLineupDelegation(side){
  var panel = document.getElementById(side+'Lineup');
  if(!panel || panel._bound) return;
  panel._bound = true;
  panel.addEventListener('click', function(e){
    var el = findAction(e.target, panel);
    if(!el) return;
    var act = el.dataset.action;
    var idx = parseInt(el.dataset.idx);
    if(act === 'at-bat') setAtBat(side, idx);
    else if(act === 'start-sub') startSub(side, idx);
    else if(act === 'confirm-sub') confirmSub(side, idx, el.dataset.subtype || 'ph');
    else if(act === 'cancel-sub') cancelSub(side, idx);
  });
  panel.addEventListener('change', function(e){
    var el = e.target;
    if(!el.dataset || !el.dataset.action) return;
    var act = el.dataset.action;
    var idx = parseInt(el.dataset.idx);
    if(act === 'set-pos') G.lineup[side][idx].pos = el.value;
    else if(act === 'set-name') G.lineup[side][idx].name = el.value;
    else if(act === 'select-player') onPlayerSelect(side, idx, el.value);
    else if(act === 'set-sub-pos') G.lineup[side][idx].subs[parseInt(el.dataset.sub)].pos = el.value;
    else if(act === 'set-sub-name') G.lineup[side][idx].subs[parseInt(el.dataset.sub)].name = el.value;
    saveToStorage();
  });
}

function setupPitcherDelegation(side){
  var panel = document.getElementById(side+'PitcherPanel');
  if(!panel || panel._bound) return;
  panel._bound = true;
  panel.addEventListener('click', function(e){
    var el = findAction(e.target, panel);
    if(!el) return;
    var act = el.dataset.action;
    var pidx = parseInt(el.dataset.pidx);
    // Stop propagation from inputs/selects to prevent set-active-p firing
    if(act === 'set-p-name' || act === 'adj-p' || act === 'add-p' || act === 'edit-p-line') e.stopPropagation();
    if(act === 'edit-p-line') openPitchLineEditor(el.dataset.side, pidx);
    else if(act === 'set-active-p') setActivePitcher(el.dataset.side, pidx);
    else if(act === 'adj-p') adj(el.dataset.side, pidx, parseInt(el.dataset.dir));
    else if(act === 'add-p') addPitcher(el.dataset.side);
  });
  panel.addEventListener('keydown', function(e){
    var el = e.target;
    if((e.key === 'Enter' || e.key === ' ') && el.dataset && el.dataset.action === 'edit-p-line'){
      e.preventDefault();
      openPitchLineEditor(el.dataset.side, parseInt(el.dataset.pidx));
    }
  });
  panel.addEventListener('change', function(e){
    var el = e.target;
    if(!el.dataset || el.dataset.action !== 'set-p-name') return;
    var s = el.dataset.side;
    var pidx = parseInt(el.dataset.pidx);
    G.pitchers[s][pidx].name = el.value;
    renderPitchers(s);
    saveToStorage();
  });
}

function setupFielderDelegation(){
  var fg = document.getElementById('fielderGrid');
  if(!fg || fg._bound) return;
  fg._bound = true;
  fg.addEventListener('click', function(e){
    var el = findAction(e.target, fg);
    if(!el || el.dataset.action !== 'sel-fielder') return;
    selectFielder(parseInt(el.dataset.num));
  });
  var tg = document.getElementById('throwToGrid');
  if(tg) tg.addEventListener('click', function(e){
    var el = findAction(e.target, tg);
    if(!el || el.dataset.action !== 'sel-throwto') return;
    selectThrowTo(parseInt(el.dataset.num));
  });
}

// ── Screen wake lock: keep the screen on while a game is being scored ──
// (iOS Safari 16.4+; silently does nothing where unsupported)
var _wakeLock = null;

function acquireWakeLock(){
  if(!('wakeLock' in navigator)) return;
  if(document.visibilityState !== 'visible') return;
  if(_wakeLock) return;
  navigator.wakeLock.request('screen').then(function(lock){
    _wakeLock = lock;
    lock.addEventListener('release', function(){ _wakeLock = null; });
  }).catch(function(){ _wakeLock = null; });
}

function releaseWakeLock(){
  if(_wakeLock){ _wakeLock.release().catch(function(){}); _wakeLock = null; }
}

// Hold the lock while the game is live, drop it once it's final.
// Called from _doSave, which runs after every state change.
function syncWakeLock(){
  if(isGameOver()) releaseWakeLock();
  else acquireWakeLock();
}

// The OS releases the lock whenever the app is backgrounded; re-acquire on return.
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible') syncWakeLock();
});

function init(){
  populateTeamDropdowns();
  // Set up event delegation (once — containers are stable, only innerHTML changes)
  setupLineupDelegation('home');
  setupLineupDelegation('away');
  setupPitcherDelegation('home');
  setupPitcherDelegation('away');
  setupFielderDelegation();
  setupInfieldDelegation();
  // Migrate existing save data to multi-game system if needed
  gmEnsureActiveId();
  var restored = loadFromStorage();
  if(restored){
    // Re-fire team change to reload logos, rosters, stadium
    var away = document.getElementById('teamAway').value;
    var home = document.getElementById('teamHome').value;
    if(away && away !== '— Select Team —'){ updateLogo('away'); fetchRoster('away', away); }
    if(home && home !== '— Select Team —'){ updateLogo('home'); fetchRoster('home', home); renderStadium(home); }
    onTeamChange();
  }
  renderAll();
  autoFillDate();
  restoreNotes();
  syncWakeLock();
  renderBackupNudge();
}

init();

// Ask the browser not to clear this site's storage on its own (iOS may evict
// data from apps that go unused). Best effort — backups are still the safety net.
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(function(p){ return p || navigator.storage.persist(); })
    .catch(function(){});
}

// Offline support: cache the app so it opens with no signal (e.g. at the ballpark).
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
