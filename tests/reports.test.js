// Postseason badge: the bundled official logo for the right round and year,
// the league logo everywhere else.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./helpers/app');

function badgeFor(w, gameType, date, seriesGame){
  Object.assign(w.G.notes, { gameType, date, seriesGame: seriesGame || '' });
  return w.postseasonBadge();
}

test('2026 ALDS games show the official ALDS logo and the game number', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const html = badgeFor(w, 'alds', '2026-10-04', '2');
  assert.match(html, /assets\/postseason\/alds-2026\.png/);
  assert.match(html, /alt="2026 ALDS"/);
  assert.match(html, /Game 2/);
});

test('2026 NLDS games show the official NLDS logo', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const html = badgeFor(w, 'nlds', '2026-10-04', '2');
  assert.match(html, /assets\/postseason\/nlds-2026\.png/);
  assert.match(html, /alt="2026 NLDS"/);
  assert.match(html, /Game 2/);
});

test('other years and rounds keep the league-logo badge', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  assert.match(badgeFor(w, 'alds', '2025-10-04'), /team-logos\/league-on-light\/103\.svg/, '2025 ALDS');
  assert.match(badgeFor(w, 'nlds', '2025-10-04'), /team-logos\/league-on-light\/104\.svg/, '2025 NLDS');
  assert.match(badgeFor(w, 'alcs', '2026-10-12'), /team-logos\/league-on-light\/103\.svg/, '2026 ALCS (no official logo yet)');
  assert.equal(badgeFor(w, 'regular', '2026-07-04'), '', 'regular season: no badge');
});

test('every bundled postseason logo exists and is cached for offline use', (t) => {
  const w = loadApp();
  t.after(() => w.close());
  const root = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for(const round of Object.values(w.POSTSEASON)){
    for(const file of Object.values(round.official || {})){
      assert.ok(fs.existsSync(path.join(root, file)), file + ' exists');
      assert.ok(sw.includes("'./" + file + "'"), file + ' is in the service worker cache list');
    }
  }
});
