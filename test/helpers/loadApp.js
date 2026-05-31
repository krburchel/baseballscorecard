// Test harness for the single-file baseball scorecard app.
//
// The whole app lives in index.html as inline <script>. Rather than refactor it
// into modules, we load the real file into a jsdom window with scripts enabled.
// Every top-level `function foo(){}` and `var x` in that script becomes a
// property of the jsdom `window`, so tests can call the real game-logic
// functions (window.advanceRunners, window.migrateGame, ...) and read/mutate the
// real game state (window.G) exactly as the app does in a browser.
//
// init() runs on load. On a fresh DOM no team is selected, so init() never hits
// the network (fetch/StatsAPI) — it only touches the DOM, which jsdom provides.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, '..', '..', 'index.html');
const HTML = readFileSync(HTML_PATH, 'utf8');

// Load a fresh, fully-initialized copy of the app. Each call is isolated:
// a new jsdom window with its own DOM, its own `G`, and its own localStorage.
export function loadApp() {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    pretendToBeVisual: true, // provides requestAnimationFrame
    url: 'http://localhost/',
  });
  return dom.window;
}
