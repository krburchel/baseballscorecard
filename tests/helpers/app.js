// Loads the real app (index.html + js/*.js, in index.html's order) into jsdom.
// MLB requests are answered from tests/fixtures, so tests run offline and give
// the same result every time.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, '..', 'fixtures');

function readJSON(file){ return JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8')); }

// Answers the app's fetch() calls: schedule and live feeds from fixtures,
// anything else (rosters, venues) with an empty but valid response.
function fakeFetch(url){
  let body = {};
  const feed = /\/game\/(\d+)\/feed\/live/.exec(url);
  if(feed) body = readJSON('feed-' + feed[1] + '.json');
  else if(/\/schedule\?/.test(url) && /date=2026-10-03/.test(url)) body = readJSON('schedule-2026-10-03.json');
  else if(/\/roster/.test(url)) body = { roster: [] };
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(body))) });
}

// url: each simulated device gets its own origin, so its own localStorage
function loadApp(url){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const dom = new JSDOM(html.replace(/<script src="[^"]+"><\/script>/g, '').replace(/<link rel="stylesheet"[^>]*>/, ''), {
    url: url || 'https://scorecard.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.fetch = fakeFetch;
  w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function(){};
  scripts.forEach(src => w.eval(fs.readFileSync(path.join(ROOT, src), 'utf8')));
  w.showConfirm = () => Promise.resolve(true);   // accept confirmation dialogs
  w.kbFlash = () => {};                         // no toasts
  return w;
}

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// Values from the jsdom window are from another JS realm (their arrays aren't
// Node's arrays), so compare plain copies.
const assert = require('node:assert/strict');
function same(actual, expected, msg){ assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg); }

// A fresh game loaded the way Today's Games does it, plus its MLB feed
async function loadMlbGame(w, gamePk){
  const sched = readJSON('schedule-2026-10-03.json');
  const game = sched.dates[0].games.find(g => g.gamePk === gamePk);
  w._doLoadTodaysGame(game);
  const feed = readJSON('feed-' + gamePk + '.json');
  w._mlb = { feed, fetchedAt: Date.now() };
  return feed;
}

const GAMES = readJSON('schedule-2026-10-03.json').dates[0].games.map(g => g.gamePk);

module.exports = { loadApp, loadMlbGame, tick, readJSON, GAMES, same };
