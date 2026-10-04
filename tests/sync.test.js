// Sync between two simulated devices sharing a fake Firebase backend.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, same } = require('./helpers/app');
const { createBackend, fakeFirebase } = require('./helpers/fake-firebase');

const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));

// A device: the app, its fake Firebase client, signed in to the shared backend
async function device(t, backend, name){
  const w = loadApp('https://' + name.toLowerCase() + '.scorecard.test/');
  t.after(() => w.close());
  w.FIREBASE_CONFIG = { projectId: 'test' };
  w.firebase = fakeFirebase(backend);
  w.SYNC_DELAY_MS = 0;
  w.syncRenameDevice(name);
  await w.syncSignIn('fan@example.test', 'correct-horse');
  await wait();
  return w;
}

// Score a few plays on a device and let it upload
async function scoreAndSync(w, plays){
  plays.forEach(p => p(w));
  w._doSave();
  await w.syncPush();
  await wait();
}
const single = w => w.recordHit(1);
const strikeout = w => w.recordKO('swinging');

test('a game scored on one device shows up on the other, in My Games and season stats', async (t) => {
  const backend = createBackend();
  const ipad = await device(t, backend, 'iPad');
  const mac = await device(t, backend, 'Mac');
  ipad.G.lineup.away[0].name = 'Ben Rice';
  await scoreAndSync(ipad, [single, strikeout]);

  const id = ipad.gmGetActiveId();
  const onMac = mac.gmGetIndex().find(e => e.id === id);
  assert.ok(onMac, 'game is in My Games on the Mac');
  const payload = JSON.parse(mac.localStorage.getItem(mac.GM_GAME_PREFIX + id));
  same(payload.G.pas.map(p => p.res), ['1B', 'K']);
  mac._ss.team = 'all'; mac._ss.attended = 'all'; mac._ss.type = 'all';
  const rice = mac.ssBatting(mac.ssGames()).find(r => r.name === 'Ben Rice');
  same([rice.ab, rice.h], [1, 1], 'season stats on the Mac include it');
});

test('a game open on both devices follows the device that is scoring it', async (t) => {
  const backend = createBackend();
  const ipad = await device(t, backend, 'iPad');
  const mac = await device(t, backend, 'Mac');
  await scoreAndSync(ipad, [single]);
  const id = ipad.gmGetActiveId();
  mac.gmLoadGame(id);
  assert.equal(mac.G.pas.length, 1);
  await scoreAndSync(ipad, [strikeout, strikeout]);
  same(mac.G.pas.map(p => p.res), ['1B', 'K', 'K'], 'the Mac shows the new plays');
});

test('deleting a game on one device deletes it everywhere', async (t) => {
  const backend = createBackend();
  const ipad = await device(t, backend, 'iPad');
  const mac = await device(t, backend, 'Mac');
  await scoreAndSync(ipad, [single]);
  const id = ipad.gmGetActiveId();
  ipad.resetGameSilent(); ipad.gmSetActiveId(ipad.gmGenId());          // move on to a new game
  ipad.gmDeleteSlot(id);
  await ipad.syncPush(); await wait();
  assert.ok(!mac.gmGetIndex().some(e => e.id === id), 'gone from My Games on the Mac');
  assert.equal(mac.localStorage.getItem(mac.GM_GAME_PREFIX + id), null);
  assert.equal(backend.docs.get('users/uid-1/games/' + id).deleted, true, 'stored as deleted, not erased');
});

test('changes made offline wait, then upload when the device is back online', async (t) => {
  const backend = createBackend();
  const ipad = await device(t, backend, 'iPad');
  const mac = await device(t, backend, 'Mac');
  await scoreAndSync(ipad, [single]);
  const id = ipad.gmGetActiveId();
  ipad.firebase._goOffline();
  ipad.recordKO('swinging'); ipad._doSave(); ipad.syncPush(); await wait();
  assert.equal(ipad.syncWaiting(), 1, 'one game waiting');
  assert.equal(JSON.parse(mac.localStorage.getItem(mac.GM_GAME_PREFIX + id)).G.pas.length, 1, 'Mac has not seen it yet');
  await ipad.firebase._goOnline(); await wait();
  assert.equal(ipad.syncWaiting(), 0, 'nothing waiting');
  assert.equal(JSON.parse(mac.localStorage.getItem(mac.GM_GAME_PREFIX + id)).G.pas.length, 2, 'Mac has the offline play');
});

test('same game changed on two devices: the newer version wins and the older is kept as a copy', async (t) => {
  const backend = createBackend();
  const ipad = await device(t, backend, 'iPad');
  const mac = await device(t, backend, 'Mac');
  await scoreAndSync(ipad, [single]);
  const id = ipad.gmGetActiveId();
  mac.gmLoadGame(id);

  ipad.firebase._goOffline();                                          // iPad edits offline (older)
  ipad.recordKO('swinging'); ipad._doSave(); ipad.syncPush(); await wait();
  await wait(5);
  await scoreAndSync(mac, [single, single]);                           // Mac edits later (newer)

  await ipad.firebase._goOnline(); await wait(40);
  same(JSON.parse(ipad.localStorage.getItem(ipad.GM_GAME_PREFIX + id)).G.pas.map(p => p.res), ['1B', '1B', '1B'], 'newest (Mac) version wins on the iPad');
  const copies = ipad.gmGetIndex().filter(e => /^Copy/.test(e.status || ''));
  assert.equal(copies.length, 1, 'exactly one copy kept');
  const copy = JSON.parse(ipad.localStorage.getItem(ipad.GM_GAME_PREFIX + copies[0].id));
  same(copy.G.pas.map(p => p.res), ['1B', 'K'], 'the copy is the iPad\'s offline version');
  same(JSON.parse(backend.docs.get('users/uid-1/games/' + id).payload).G.pas.map(p => p.res), ['1B', '1B', '1B'], 'cloud keeps the newer version');
  ipad._ss.team = 'all'; ipad._ss.attended = 'all'; ipad._ss.type = 'all';
  assert.ok(!ipad.ssGames().some(x => x.id === copies[0].id), 'copies are left out of season stats');
});

test('signing in with the wrong password shows a clear error', async (t) => {
  const w = loadApp('https://wrong.scorecard.test/');
  t.after(() => w.close());
  w.FIREBASE_CONFIG = { projectId: 'test' };
  w.firebase = fakeFirebase(createBackend());
  w.openSyncPanel();
  w.document.getElementById('syncEmail').value = 'fan@example.test';
  w.document.getElementById('syncPassword').value = 'nope';
  w.syncSubmitSignIn();
  await wait();
  assert.match(w.document.querySelector('.sync-err').textContent, /don't match/);
});

test('sync is invisible until it is set up and signed in', (t) => {
  const w = loadApp('https://fresh.scorecard.test/');
  t.after(() => w.close());
  assert.equal(w.document.getElementById('syncPill').hidden, true, 'no pill before signing in');
  w.openSyncPanel();
  assert.ok(w.document.getElementById('syncEmail'), 'configured: the panel offers sign-in');
  w.closeSyncPanel();
  w.FIREBASE_CONFIG = null;
  w.openSyncPanel();
  assert.match(w.document.querySelector('.sync-body').textContent, /isn't set up/, 'without a config it says so');
});
