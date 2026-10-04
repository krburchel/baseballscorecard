// Network-first service worker with a timeout: try GitHub Pages for the latest
// version, but if it hasn't answered within NETWORK_TIMEOUT_MS (weak stadium
// Wi-Fi) serve the cached copy instead. The network request keeps running in
// the background and refreshes the cache, so the next open is up to date.
// Fully offline, the cached copy is served right away.
var CACHE = 'scorecard-v5';
var NETWORK_TIMEOUT_MS = 3000;
// The Firebase libraries (js/vendor/firebase) aren't precached: only signed-in
// devices load them, and the fetch handler below caches them on first use.
var ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/data.js',
  './js/game.js',
  './js/scoring.js',
  './js/render.js',
  './js/scorecard.js',
  './js/mlb.js',
  './js/storage.js',
  './js/reports.js',
  './js/firebase-config.js',
  './js/sync.js',
  './js/ui.js',
  './assets/postseason/alds-2026.png',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function fromCache(request){
  return caches.match(request, { ignoreSearch: true }).then(function(hit){
    // Any page navigation falls back to the app shell
    return hit || (request.mode === 'navigate' ? caches.match('./index.html') : undefined);
  });
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  // Let cross-origin requests (MLB Stats API, team logos) pass through untouched.
  if(new URL(e.request.url).origin !== self.location.origin) return;

  // Always revalidate with the server (cheap 304s) so a new index.html never
  // runs with older scripts from the browser's HTTP cache.
  var network = fetch(e.request, { cache: 'no-cache' }).then(function(resp){
    if(resp && resp.ok){
      var copy = resp.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
    }
    return resp;
  });
  // Keep the worker alive until the background refresh finishes, even if the
  // cached copy was already served.
  e.waitUntil(network.catch(function(){}));

  e.respondWith(new Promise(function(resolve, reject){
    var settled = false;
    function finish(resp){
      if(settled || !resp) return false;
      settled = true;
      resolve(resp);
      return true;
    }

    // Slow network: serve the cached copy if there is one; otherwise keep waiting.
    var timer = setTimeout(function(){
      fromCache(e.request).then(finish);
    }, NETWORK_TIMEOUT_MS);

    network.then(function(resp){
      clearTimeout(timer);
      finish(resp);
    }).catch(function(){
      // Offline / request failed: cache now, or a real error if nothing cached.
      clearTimeout(timer);
      fromCache(e.request).then(function(hit){
        if(!finish(hit) && !settled) reject(new TypeError('offline and not cached'));
      });
    });
  }));
});
