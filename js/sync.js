// Sync across devices (Firebase: Firestore + email/password sign-in).
// Each device keeps saving locally first; this file mirrors My Games to
// users/{uid}/games/{gameId}. Changes are found by fingerprinting each saved
// game, uploaded a few seconds after scoring pauses (right away when a game ends
// or the app goes to the background), and other devices' changes arrive through
// a live listener. If the same game changed on two devices, the newer version
// wins and the other is kept in My Games as a copy. The Firebase libraries load
// only on devices signed in to sync.

var SYNC_KEY = 'baseball_scorecard_sync';
var SYNC_DELAY_MS = 4000;
var SYNC_VENDOR = ['js/vendor/firebase/firebase-app-compat.js', 'js/vendor/firebase/firebase-auth-compat.js', 'js/vendor/firebase/firebase-firestore-compat.js'];
var _sync = { ready: false, loading: null, user: null, db: null, unsub: null, timer: null, pushing: false, error: '', lastSync: 0, applying: false };

// ── Local sync state: per game, what was last uploaded / downloaded ──
// One shared object, so concurrent uploads and downloads never overwrite each other's bookkeeping
function syncState(){
  if(_sync.state) return _sync.state;
  var st = null;
  try { st = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null'); } catch(e){}
  st = _sync.state = st || {};
  st.meta = st.meta || {};       // id → { sig, updatedAt, pushedSig, remoteUpdatedAt }
  if(!st.device) st.device = syncDefaultDevice();
  return st;
}
function syncSaveState(st){ try { localStorage.setItem(SYNC_KEY, JSON.stringify(st)); } catch(e){} }
function syncDefaultDevice(){
  var ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
  if(/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if(/iPhone/.test(ua)) return 'iPhone';
  if(/Mac/.test(ua)) return 'Mac';
  if(/Android/.test(ua)) return 'Android';
  if(/Win/.test(ua)) return 'Windows';
  return 'This device';
}
function syncConfigured(){ return typeof FIREBASE_CONFIG !== 'undefined' && !!FIREBASE_CONFIG && !!FIREBASE_CONFIG.projectId; }

// Small, stable fingerprint of a saved game (djb2 over its JSON)
function syncSig(str){
  var h = 5381;
  for(var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return str.length + ':' + (h >>> 0).toString(36);
}

// Every local game as { id, raw (payload JSON), entry (My Games summary) }
function syncLocalGames(){
  clearTimeout(_saveTimer);
  _doSave();
  var activeId = gmGetActiveId();
  if(!activeId && G.log.length){ activeId = gmGenId(); gmSetActiveId(activeId); }
  if(activeId && G.log.length) gmSaveToSlot(activeId);
  var out = [];
  gmGetIndex().forEach(function(e){
    var raw = null;
    try { raw = localStorage.getItem(GM_GAME_PREFIX + e.id); } catch(x){}
    if(raw) out.push({ id: e.id, raw: raw, entry: e });
  });
  return out;
}

// ── Loading Firebase ──
function syncLoadScript(src){
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = function(){ reject(new Error('Couldn\'t load ' + src)); };
    document.head.appendChild(s);
  });
}
function syncLoadFirebase(){
  if(window.firebase && firebase.firestore) return Promise.resolve();
  if(_sync.loading) return _sync.loading;
  _sync.loading = SYNC_VENDOR.reduce(function(p, src){ return p.then(function(){ return syncLoadScript(src); }); }, Promise.resolve());
  return _sync.loading;
}

function syncStart(){
  if(!syncConfigured()) return Promise.resolve(false);
  return syncLoadFirebase().then(function(){
    if(!_sync.ready){
      if(!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _sync.db = firebase.firestore();
      try { _sync.db.enablePersistence({ synchronizeTabs: true }).catch(function(){}); } catch(e){}
      firebase.auth().onAuthStateChanged(syncOnAuth);
      _sync.ready = true;
    }
    return true;
  }).catch(function(err){ _sync.error = (err && err.message) || 'Sync couldn\'t start.'; renderSyncStatus(); return false; });
}

function syncOnAuth(user){
  _sync.user = user || null;
  if(_sync.unsub){ _sync.unsub(); _sync.unsub = null; }
  var st = syncState();
  if(user){
    st.enabled = true; st.email = user.email || st.email; st.uid = user.uid;
    syncSaveState(st);
    _sync.unsub = syncGamesRef().onSnapshot(syncOnSnapshot, function(err){ _sync.error = syncErrorText(err); renderSyncStatus(); });
    syncSoon(0);
  }
  renderSyncStatus();
  renderSyncPanel();
}

function syncGamesRef(){ return _sync.db.collection('users').doc(_sync.user.uid).collection('games'); }

// ── Upload ──
// Called after every save; batches changes a few seconds after scoring pauses
function syncSoon(delay){
  if(!_sync.user) return;
  clearTimeout(_sync.timer);
  _sync.timer = setTimeout(syncPush, delay === undefined ? SYNC_DELAY_MS : delay);
}

// Uploads every changed game. `_sync.pushing` only covers the scan (so the saves
// it triggers don't reschedule); uploads still waiting on the network don't block
// later syncs. Resolves when this round's uploads have reached the server.
function syncPush(){
  if(!_sync.user || _sync.pushing || _sync.applying) return Promise.resolve({ uploaded: 0 });
  _sync.pushing = true;
  var st = syncState(), now = Date.now(), jobs = [];
  var games = syncLocalGames(), here = {};
  games.forEach(function(g){
    here[g.id] = true;
    var m = st.meta[g.id] = st.meta[g.id] || {};
    var sig = syncSig(g.raw);
    // updatedAt only ever grows: two edits queued in the same millisecond would
    // otherwise share a time, and the rules reject the second as not newer
    if(m.sig !== sig){ m.sig = sig; m.updatedAt = Math.max(now, (m.updatedAt || 0) + 1, (m.remoteUpdatedAt || 0) + 1); }
    if(m.pushedSig !== sig && m.inflightSig !== sig) jobs.push(syncUpload(g, m, st));
  });
  // Games that were synced but are gone here: deleted on this device
  Object.keys(st.meta).forEach(function(id){
    var m = st.meta[id];
    if(here[id] || m.deleted || !m.pushedSig) return;
    m.deleted = true; m.updatedAt = Math.max(now, (m.remoteUpdatedAt || 0) + 1);
    jobs.push(syncGamesRef().doc(id).set({ deleted: true, payload: null, updatedAt: m.updatedAt, device: st.device }).then(function(){
      m.remoteUpdatedAt = m.updatedAt; syncSaveState(st);
    }).catch(function(){}));
  });
  _sync.pushing = false;
  syncSaveState(st);
  renderSyncStatus();
  return Promise.all(jobs).then(function(){
    _sync.lastSync = Date.now();
    syncSaveState(st);
    renderSyncStatus();
    renderSyncPanel();
    return { uploaded: jobs.length };
  }, function(err){ renderSyncStatus(); renderSyncPanel(); throw err; });
}

function syncUpload(g, m, st){
  var e = g.entry, sig = m.sig;
  var doc = {
    payload: g.raw, updatedAt: m.updatedAt, device: st.device, deleted: false,
    away: e.away || '', home: e.home || '', awayScore: e.awayScore || 0, homeScore: e.homeScore || 0,
    date: e.date || '', status: e.status || '', plays: e.plays || 0
  };
  m.inflightSig = sig;
  return syncGamesRef().doc(g.id).set(doc).then(function(){
    m.pushedSig = sig; m.remoteUpdatedAt = m.updatedAt; m.inflightSig = null;
    _sync.error = '';
    syncSaveState(st);
  }).catch(function(err){
    m.inflightSig = null;
    if(err && err.code === 'permission-denied'){
      // A newer version is already in the cloud: keep ours as a copy, take theirs
      return syncGamesRef().doc(g.id).get().then(function(snap){
        if(!snap.exists) return;
        var d = snap.data();
        if((m.remoteUpdatedAt || 0) >= (d.updatedAt || 0)) return;   // the listener already handled it
        syncKeepCopyThenApply(g.id, d, st);
      });
    }
    _sync.error = syncErrorText(err);
  });
}

// ── Download ──
function syncOnSnapshot(snap){
  var st = syncState();
  _sync.cloud = _sync.cloud || {};
  snap.docChanges().forEach(function(ch){
    if(ch.type === 'removed') return;
    var id = ch.doc.id, d = ch.doc.data();
    _sync.cloud[id] = !d.deleted;
    if(ch.doc.metadata.hasPendingWrites) return;
    var m = st.meta[id] = st.meta[id] || {};
    if((d.updatedAt || 0) <= (m.remoteUpdatedAt || 0)) return;      // nothing new
    var localChanged = m.sig && m.pushedSig !== m.sig;
    if(localChanged && (m.updatedAt || 0) >= (d.updatedAt || 0)) return;  // ours is newer (or this is our own write)
    if(localChanged) syncKeepCopyThenApply(id, d, st);
    else syncApplyRemote(id, d, st);
  });
  _sync.lastSync = Date.now();
  syncSaveState(st);
  renderSyncStatus();
  renderSyncPanel();
}

// The losing (older) local version becomes a copy in My Games; the cloud version takes its place
function syncKeepCopyThenApply(id, d, st){
  var raw = null;
  try { raw = localStorage.getItem(GM_GAME_PREFIX + id); } catch(e){}
  if(raw){
    var copyId = gmGenId(), payload = JSON.parse(raw);
    payload.syncCopy = { of: id, device: st.device, at: Date.now() };
    try { localStorage.setItem(GM_GAME_PREFIX + copyId, JSON.stringify(payload)); } catch(e){}
    var index = gmGetIndex(), entry = index.filter(function(x){ return x.id === id; })[0] || {};
    var copyEntry = Object.assign({}, entry, { id: copyId, savedAt: new Date().toISOString() });
    copyEntry.status = 'Copy (' + st.device + ')';
    index.unshift(copyEntry);
    gmSaveIndex(index);
    kbFlash('Kept this device\'s version as a copy in My Games', '#BA7517');
  }
  syncApplyRemote(id, d, st);
}

function syncApplyRemote(id, d, st){
  var m = st.meta[id] = st.meta[id] || {};
  _sync.applying = true;
  try {
    var index = gmGetIndex().filter(function(x){ return x.id !== id; });
    if(d.deleted){
      if(gmGetActiveId() === id){
        // Open here but deleted elsewhere: keep it open as a new, unsynced game
        gmSetActiveId(gmGenId());
        kbFlash('This game was deleted on another device — kept here as a new game', '#BA7517');
      }
      try { localStorage.removeItem(GM_GAME_PREFIX + id); } catch(e){}
      gmSaveIndex(index);
      m.deleted = true; m.sig = null; m.pushedSig = null;
    } else {
      try { localStorage.setItem(GM_GAME_PREFIX + id, d.payload); } catch(e){ warnSaveFailed(); }
      index.unshift({ id: id, away: d.away, home: d.home, awayScore: d.awayScore, homeScore: d.homeScore,
                      date: d.date, status: d.status, plays: d.plays, savedAt: new Date(d.updatedAt).toISOString() });
      gmSaveIndex(index);
      m.sig = m.pushedSig = syncSig(d.payload); m.deleted = false;
      // The game open here was scored on another device: show its latest state
      if(gmGetActiveId() === id) gmLoadFromSlot(id);
    }
    m.updatedAt = m.remoteUpdatedAt = d.updatedAt || 0;
  } finally { _sync.applying = false; }
  if(document.getElementById('gmOverlay')) renderGameManagerContent();
}

function syncErrorText(err){
  var c = err && err.code;
  if(c === 'unavailable') return 'Offline — changes will upload when you\'re back online.';
  if(c === 'permission-denied') return 'The sync database refused the change.';
  return (err && err.message) || 'Sync error.';
}

// ── Sign in / out ──
function syncSignIn(email, password){
  _sync.error = '';
  return syncStart().then(function(ok){
    if(!ok) throw new Error(_sync.error || 'Sync isn\'t set up yet.');
    return firebase.auth().signInWithEmailAndPassword(email, password);
  });
}
function syncSignOut(){
  var st = syncState();
  st.enabled = false;
  syncSaveState(st);
  if(_sync.ready) return firebase.auth().signOut();
  return Promise.resolve();
}

// How many games have changes not uploaded yet
function syncWaiting(){
  if(!_sync.user) return 0;
  var st = syncState(), n = 0;
  gmGetIndex().forEach(function(e){
    var raw = null;
    try { raw = localStorage.getItem(GM_GAME_PREFIX + e.id); } catch(x){}
    var m = st.meta[e.id];
    if(raw && (!m || m.pushedSig !== syncSig(raw))) n++;
  });
  return n;
}

// Signed in to sync on this device (stays true offline and across restarts)
function syncIsOn(){ return syncConfigured() && !!syncState().enabled; }

// Is this game's saved version already in the cloud? Lets the backup reminder stand down.
function syncHasUploaded(id){
  if(!syncIsOn()) return false;
  var m = syncState().meta[id], raw = null;
  if(!m || !m.pushedSig) return false;
  try { raw = localStorage.getItem(GM_GAME_PREFIX + id); } catch(e){}
  return !!raw && syncSig(raw) === m.pushedSig;
}

// ── Status pill (header) and Sync panel ──
function renderSyncStatus(){
  renderBackupNudge();      // an upload finishing can settle the backup reminder
  var el = document.getElementById('syncPill');
  if(!el) return;
  var st = syncState();
  if(!syncConfigured() || !st.enabled){ el.hidden = true; return; }
  el.hidden = false;
  var waiting = syncWaiting(), online = navigator.onLine !== false, text, cls = '';
  if(!_sync.user) { text = '☁ Signing in…'; }
  else if(!online) { text = '☁ Offline' + (waiting ? ' · ' + waiting + ' waiting' : ''); cls = ' sync-warn'; }
  else if(_sync.pushing || waiting) { text = '☁ Syncing…'; }
  else { text = '☁ Synced'; cls = ' sync-ok'; }
  el.className = 'sync-pill' + cls;
  el.textContent = text;
  el.title = _sync.lastSync ? 'Last synced ' + new Date(_sync.lastSync).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : '';
}

function openSyncPanel(){
  closeSyncPanel();
  var ov = document.createElement('div');
  ov.className = 'gm-overlay';
  ov.id = 'syncOverlay';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeSyncPanel(); });
  document.body.appendChild(ov);
  renderSyncPanel();
  if(syncConfigured() && syncState().enabled) syncStart();
}
function closeSyncPanel(){ var ov = document.getElementById('syncOverlay'); if(ov) ov.remove(); }

function renderSyncPanel(){
  var ov = document.getElementById('syncOverlay');
  if(!ov) return;
  var st = syncState(), html = '<div class="gm-modal sync-modal" role="dialog" aria-modal="true" aria-labelledby="syncTitle">';
  html += '<div class="gm-hdr"><h3 id="syncTitle">☁ Sync</h3><button class="games-modal-close" onclick="closeSyncPanel()" aria-label="Close">&times;</button></div><div class="gm-body sync-body">';
  if(!syncConfigured()){
    html += '<p>Sync isn\'t set up for this app yet.</p>';
  } else if(_sync.user){
    var waiting = syncWaiting();
    var local = gmGetIndex().length, cloud = Object.keys(_sync.cloud || {}).filter(function(k){ return _sync.cloud[k]; }).length;
    html += '<p class="sync-line"><b>Signed in</b> as ' + esc(_sync.user.email || st.email || '') + '</p>'
      + '<p class="sync-line">On this device: <b>' + local + '</b> game' + (local === 1 ? '' : 's') + ' · In the cloud: <b>' + cloud + '</b></p>'
      + '<p class="sync-line">' + (waiting ? waiting + ' game' + (waiting === 1 ? '' : 's') + ' waiting to upload' : 'Everything on this device is uploaded')
      + (_sync.lastSync ? ' · last synced ' + new Date(_sync.lastSync).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : '') + '</p>'
      + (_sync.nowMsg ? '<p class="sync-ok-msg">' + esc(_sync.nowMsg) + '</p>' : '')
      + (_sync.error ? '<p class="sync-err">' + esc(_sync.error) + '</p>' : '')
      + '<label class="sync-field">This device\'s name <input id="syncDevice" value="' + esc(st.device) + '" onchange="syncRenameDevice(this.value)" /></label>'
      + '<p class="sync-note">Games scored on any signed-in device show up in My Games and season stats everywhere. If the same game changes on two devices, the newer version wins and the other is kept as a copy.</p>'
      + '<div class="pe-actions"><button class="pe-cancel" onclick="syncSignOut()">Sign out</button><button class="rp-confirm" id="syncNowBtn" onclick="syncNow()"' + (_sync.busyNow ? ' disabled' : '') + '>' + (_sync.busyNow ? 'Syncing…' : 'Sync now') + '</button></div>';
  } else {
    html += '<p class="sync-note">Sign in to keep My Games, season stats and backups the same on all your devices.</p>'
      + '<form onsubmit="event.preventDefault(); syncSubmitSignIn();" class="sync-form">'
      + '<label class="sync-field">Email <input id="syncEmail" type="email" autocomplete="username" required value="' + esc(st.email || '') + '" /></label>'
      + '<label class="sync-field">Password <input id="syncPassword" type="password" autocomplete="current-password" required /></label>'
      + (_sync.error ? '<p class="sync-err">' + esc(_sync.error) + '</p>' : '')
      + '<div class="pe-actions"><button type="button" class="pe-cancel" onclick="closeSyncPanel()">Cancel</button><button type="submit" class="rp-confirm" id="syncSignInBtn">Sign in</button></div></form>';
  }
  html += '</div></div>';
  ov.innerHTML = html;
}

// "Sync now": upload changes and say what happened (or that uploads are still queued)
function syncNow(){
  if(_sync.busyNow) return;
  _sync.busyNow = true; _sync.nowMsg = ''; _sync.error = '';
  renderSyncPanel();
  var done = false;
  var finish = function(msg, err){
    if(done) return; done = true;
    _sync.busyNow = false;
    _sync.nowMsg = msg || '';
    if(err) _sync.error = err;
    renderSyncStatus(); renderSyncPanel();
  };
  setTimeout(function(){ finish('', 'Still uploading — the connection is slow. Uploads are queued and will finish on their own.'); }, 12000);
  syncPush().then(function(r){
    var t = new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
    var n = (r && r.uploaded) || 0;
    finish('✓ Synced at ' + t + (n ? ' — ' + n + ' game' + (n === 1 ? '' : 's') + ' uploaded' : ' — nothing new to upload'));
  }, function(err){ finish('', syncErrorText(err)); });
}

function syncSubmitSignIn(){
  var email = (document.getElementById('syncEmail') || {}).value || '', pw = (document.getElementById('syncPassword') || {}).value || '';
  var btn = document.getElementById('syncSignInBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Signing in…'; }
  syncSignIn(email.trim(), pw).catch(function(err){
    var c = err && err.code;
    _sync.error = c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' ? 'That email and password don\'t match.'
      : c === 'auth/network-request-failed' ? 'Couldn\'t reach the sign-in server — check your connection.'
      : (err && err.message) || 'Couldn\'t sign in.';
    renderSyncPanel();
  });
}

function syncRenameDevice(name){
  var st = syncState();
  st.device = (name || '').trim() || syncDefaultDevice();
  syncSaveState(st);
}

// ── Hooks ──
// Every save schedules a sync; leaving the app or finishing a game syncs now
var _syncOrigDoSave = _doSave;
_doSave = function(){
  _syncOrigDoSave();
  // Saves made by sync itself (uploading, applying another device's change) don't reschedule
  if(!_sync.user || _sync.applying || _sync.pushing) return;
  var id = gmGetActiveId();
  if(id && id !== _sync.finalSent && G.log.some(function(l){ return l.tag === 'Final'; })){
    _sync.finalSent = id;     // game just ended: upload now
    syncSoon(0);
  } else {
    syncSoon();
  }
};
var _syncOrigDeleteSlot = gmDeleteSlot;
gmDeleteSlot = function(id){ _syncOrigDeleteSlot(id); syncSoon(); };

function syncInit(){
  if(_sync.inited) return;
  _sync.inited = true;
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'hidden' && _sync.user) syncPush(); });
  window.addEventListener('online', function(){ renderSyncStatus(); syncSoon(0); });
  window.addEventListener('offline', renderSyncStatus);
  renderSyncStatus();
  // Signed-in devices start syncing in the background once the scorecard is up
  if(syncConfigured() && syncState().enabled) setTimeout(syncStart, 0);
}
