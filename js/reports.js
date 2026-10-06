// Output: PDF box score, Share final image, season stats, team pickers and the stadium photo.
// Loaded as a plain script; files share one global scope (see index.html for the order).

function exportPDF(){
  var away = document.getElementById('teamAway').value || 'Away';
  var home = document.getElementById('teamHome').value || 'Home';
  var awayLogo = TEAM_LOGOS[away] ? '<img src="'+TEAM_LOGOS[away]+'" style="width:36px;height:36px;object-fit:contain;vertical-align:middle;margin-right:8px;" />' : '';
  var homeLogo = TEAM_LOGOS[home] ? '<img src="'+TEAM_LOGOS[home]+'" style="width:36px;height:36px;object-fit:contain;vertical-align:middle;margin-left:8px;" />' : '';
  var badge = postseasonBadge();
  document.getElementById('printHeader').innerHTML = (badge ? '<div>' + badge + '</div>' : '') + awayLogo + away + ' vs ' + home + homeLogo;

  // Build subheader: score, date, venue
  var subParts = [];
  var awayR = G.rhe.away[0], homeR = G.rhe.home[0];
  if(G.log.length > 0) subParts.push('Final: ' + awayR + ' – ' + homeR);
  if(G.notes && G.notes.date){
    try {
      var dp = G.notes.date.split('-');
      var dateObj = new Date(dp[0], dp[1]-1, dp[2]);
      subParts.push(dateObj.toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'}));
    } catch(e){ subParts.push(G.notes.date); }
  }
  if(G.notes && G.notes.venue) subParts.push(G.notes.venue);
  if(G.notes && G.notes.attendance) subParts.push('Att: ' + G.notes.attendance);
  document.getElementById('printSub').textContent = subParts.join('  •  ');

  // Hide empty game-info rows for cleaner print
  var giRows = document.querySelectorAll('.gi-row');
  giRows.forEach(function(row){
    var inputs = row.querySelectorAll('input, select, textarea');
    var hasValue = false;
    inputs.forEach(function(inp){
      if(inp.value && inp.value.trim() && inp.value !== '—') hasValue = true;
    });
    // Also check if a weather button is selected in this row
    var weatherBtns = row.querySelectorAll('.gi-weather-btn.sel');
    if(weatherBtns.length > 0) hasValue = true;
    row.classList.toggle('gi-row-empty', !hasValue);
  });

  // Build box score table
  buildPrintBoxScore();
  renderScorecard();

  window.print();

  // Clean up: remove gi-row-empty class
  giRows.forEach(function(row){ row.classList.remove('gi-row-empty'); });
}

function buildPrintBoxScore(){
  var el = document.getElementById('printBoxScore');
  if(!el) return;

  var html = '';
  ['away','home'].forEach(function(side){
    var tName = team(side);
    var logo = TEAM_LOGOS[tName] ? '<img src="'+TEAM_LOGOS[tName]+'" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:4px;" />' : '';

    html += '<table style="margin-bottom:6px">';
    html += '<tr><td class="bs-team-hdr" colspan="11">' + logo + tName + ' — Batting</td></tr>';
    html += '<tr><th style="text-align:left;padding-left:6px;min-width:100px">Player</th><th>Pos</th><th>AB</th><th>H</th><th>R</th><th>2B</th><th>3B</th><th>HR</th><th>BB</th><th>K</th><th>RBI</th></tr>';

    var totals = {ab:0,h:0,r:0,d:0,t:0,hr:0,bb:0,k:0,rbi:0};

    for(var i=0;i<9;i++){
      var sl = G.lineup[side][i];
      // Starter row
      var sh = sl.hits;
      var sAB = abFor(sh);
      var sH = sh.s + sh.d + sh.t + sh.hr;
      var sK = sh.kl + sh.ks;
      var sBB = sh.bb + sh.ibb;
      var sR = sh.r || 0;
      var sRBI = sh.rbi || 0;
      var sName = sl.name || 'Player ' + (i+1);
      var sPos = sl.pos || '—';
      var dimClass = sl.subs.length > 0 ? ' style="opacity:.5"' : '';

      html += '<tr'+dimClass+'><td style="text-align:left;padding-left:6px">' + esc(sName) + '</td>';
      html += '<td>'+sPos+'</td><td>'+sAB+'</td><td>'+sH+'</td><td>'+sR+'</td><td>'+sh.d+'</td><td>'+sh.t+'</td><td>'+sh.hr+'</td><td>'+sBB+'</td><td>'+sK+'</td><td>'+sRBI+'</td></tr>';

      totals.ab += sAB; totals.h += sH; totals.r += sR; totals.d += sh.d; totals.t += sh.t; totals.hr += sh.hr; totals.bb += sBB; totals.k += sK; totals.rbi += sRBI;

      // Sub rows
      sl.subs.forEach(function(sub, si){
        var subH = sub.hits || mkHits();
        var subAB = abFor(subH);
        var subHits = subH.s + subH.d + subH.t + subH.hr;
        var subK = subH.kl + subH.ks;
        var subBB = subH.bb + subH.ibb;
        var subR = subH.r || 0;
        var subRBI = subH.rbi || 0;
        var subName = sub.name || 'Sub';
        var subPos = sub.pos || '—';
        var isLast = si === sl.subs.length - 1;
        var subDim = !isLast ? ' style="opacity:.5"' : '';

        html += '<tr'+subDim+'><td style="text-align:left;padding-left:16px;font-style:italic">↳ ' + esc(subName) + '</td>';
        html += '<td>'+subPos+'</td><td>'+subAB+'</td><td>'+subHits+'</td><td>'+subR+'</td><td>'+subH.d+'</td><td>'+subH.t+'</td><td>'+subH.hr+'</td><td>'+subBB+'</td><td>'+subK+'</td><td>'+subRBI+'</td></tr>';

        totals.ab += subAB; totals.h += subHits; totals.r += subR; totals.d += subH.d; totals.t += subH.t; totals.hr += subH.hr; totals.bb += subBB; totals.k += subK; totals.rbi += subRBI;
      });
    }

    html += '<tr class="bs-totals"><td style="text-align:left;padding-left:6px">TOTALS</td><td></td>';
    html += '<td>'+totals.ab+'</td><td>'+totals.h+'</td><td>'+totals.r+'</td><td>'+totals.d+'</td><td>'+totals.t+'</td><td>'+totals.hr+'</td><td>'+totals.bb+'</td><td>'+totals.k+'</td><td>'+totals.rbi+'</td></tr>';
    var risp = rispLine(side);
    html += '<tr><td colspan="11" style="text-align:left;padding-left:6px;font-weight:400">With RISP: ' + risp.h + '-for-' + risp.ab + ' · Left on base: ' + teamLOB(side) + '</td></tr>';
    html += '</table>';

    // Pitching line
    html += '<table style="margin-bottom:10px">';
    html += '<tr><td class="bs-team-hdr" colspan="9">' + logo + tName + ' — Pitching</td></tr>';
    html += '<tr><th style="text-align:left;padding-left:6px;min-width:100px">Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>P-S</th></tr>';
    G.pitchers[side].forEach(function(p){
      var pName = p.name || '—';
      var activeMarker = p.active ? ' ●' : '';
      html += '<tr><td style="text-align:left;padding-left:6px">' + esc(pName) + activeMarker + '</td>';
      html += '<td>'+fmtIP(p.outs)+'</td><td>'+p.h+'</td><td>'+p.r+'</td><td>'+p.er+'</td><td>'+p.bb+'</td><td>'+p.k+'</td><td>'+p.hr+'</td><td>'+p.pitches+'-'+pitchStrikes(p)+'</td></tr>';
    });
    html += '</table>';
  });

  el.innerHTML = html;
}

function buildTeamOptions(selectedVal) {
  return MLB_TEAMS.map(function(t){
    return '<option value="'+t+'"'+(t===selectedVal?' selected':'')+'>'+t+'</option>';
  }).join('');
}

function populateTeamDropdowns() {
  var awayEl = document.getElementById('teamAway');
  var homeEl = document.getElementById('teamHome');
  awayEl.innerHTML = buildTeamOptions('— Select Team —');
  homeEl.innerHTML = buildTeamOptions('— Select Team —');
}

// "Game #" picker sits next to Game type; only shown for a postseason round
function renderSeriesGamePicker(){
  var el = document.getElementById('giSeriesGame');
  if(!el) return;
  var ps = POSTSEASON[G.notes && G.notes.gameType];
  if(!ps){ el.style.display = 'none'; el.innerHTML = ''; return; }
  var cur = String(G.notes.seriesGame || '');
  var html = '<option value="">Game —</option>';
  for(var n = 1; n <= ps.maxGames; n++){
    html += '<option value="' + n + '"' + (cur === String(n) ? ' selected' : '') + '>Game ' + n + '</option>';
  }
  el.innerHTML = html;
  el.style.display = '';
}

// The round's logo for this game: the official logo for that year when the app
// bundles one (it already says e.g. "2026 ALDS"), otherwise the league logo.
// The round's logo for a game's info (the current game's by default)
function postseasonLogo(notes){
  var n = notes || G.notes || {};
  var ps = POSTSEASON[n.gameType];
  if(!ps) return null;
  var yr = (n.date || '').slice(0, 4) || String(new Date().getFullYear());
  var official = ps.official && ps.official[yr];
  return { ps: ps, yr: yr, src: official || ps.logo, official: !!official, label: yr + ' ' + ps.label };
}

function postseasonBadge(){
  var pl = postseasonLogo();
  if(!pl) return '';
  var gameNo = G.notes.seriesGame ? 'Game ' + G.notes.seriesGame : '';
  if(pl.official){
    return '<span class="ps-badge ps-badge-official"><img src="' + pl.src + '" alt="' + esc(pl.label) + '" />' + gameNo + '</span>';
  }
  return '<span class="ps-badge"><img src="' + pl.src + '" alt="" />' + pl.label + (gameNo ? ' · ' + gameNo : '') + '</span>';
}

// ── Postseason series ──
// Saved postseason games grouped into series (year + round + the two teams),
// newest first. The series score counts games scored through the final out.
function teamShort(name){
  var m = /(Red Sox|White Sox|Blue Jays)$/.exec(name || '');
  return m ? m[1] : String(name || '').split(' ').pop();
}

function psSeriesList(){
  var map = {}, list = [];
  ssGames().forEach(function(x){
    var n = x.g.notes || {}, ps = POSTSEASON[n.gameType];
    if(!ps) return;
    var pl = postseasonLogo(n);
    var teams = [x.away, x.home].sort();
    var key = pl.yr + '|' + n.gameType + '|' + teams.join('|');
    var s = map[key];
    if(!s){
      s = map[key] = { key: key, label: pl.label, logo: pl.src, maxGames: ps.maxGames, teams: teams, wins: {}, games: [], lastDate: '' };
      s.wins[teams[0]] = 0; s.wins[teams[1]] = 0;
      list.push(s);
    }
    var as = x.g.rhe.away[0] || 0, hs = x.g.rhe.home[0] || 0, final = ssIsFinal(x.g);
    var winner = final && as !== hs ? (as > hs ? x.away : x.home) : '';
    if(winner) s.wins[winner]++;
    s.games.push({ id: x.id, num: parseInt(n.seriesGame, 10) || 0, date: n.date || '', away: x.away, home: x.home,
                   as: as, hs: hs, final: final, winner: winner, current: !!x.current });
    if((n.date || '') > s.lastDate) s.lastDate = n.date;
  });
  list.forEach(function(s){
    s.games.sort(function(a, b){ return (a.num || 99) - (b.num || 99) || a.date.localeCompare(b.date); });
    var a = s.teams[0], b = s.teams[1], wa = s.wins[a], wb = s.wins[b];
    s.leader = wa === wb ? '' : wa > wb ? a : b;
    s.clinched = Math.max(wa, wb) >= Math.ceil(s.maxGames / 2);
    // Every game from Game 1 on is here (only the latest may still be going): the score is the real series score
    var n = s.games.length;
    s.complete = s.games.every(function(g, i){ return g.num === i + 1 && (g.final || i === n - 1); });
  });
  list.sort(function(x, y){ return y.lastDate.localeCompare(x.lastDate); });
  return list;
}

function psSeriesStatus(s){
  var a = s.teams[0], b = s.teams[1];
  if(!s.wins[a] && !s.wins[b]) return 'No finished games yet';
  var hi = s.leader || a, lo = hi === a ? b : a;
  var score = s.wins[hi] + '–' + s.wins[lo];
  var text = !s.leader ? 'Tied ' + score : teamShort(hi) + (s.clinched ? ' win ' : ' lead ') + score;
  return text + (s.complete || s.clinched ? '' : ' in games you scored');
}

// The "Postseason" section at the top of My Games
function psSeriesHtml(){
  var list = psSeriesList();
  if(!list.length) return '';
  var html = '<div class="ps-series-wrap"><div class="ps-series-title">🏆 Postseason</div>';
  list.forEach(function(s){
    html += '<div class="ps-series">'
      + '<div class="ps-series-hdr"><img class="ps-series-logo" src="' + s.logo + '" alt="" /><span class="ps-series-round">' + esc(s.label) + '</span>'
      + '<span class="ps-series-teams">' + s.teams.map(function(t){
          var logo = TEAM_LOGOS[t];
          return (logo ? '<img class="gm-card-logo" src="' + logo + '" alt="" />' : '') + esc(teamShort(t));
        }).join(' <span class="ps-series-vs">vs</span> ') + '</span></div>'
      + '<div class="ps-series-status">' + esc(psSeriesStatus(s)) + '</div><div class="ps-series-games">';
    var last = 0;
    s.games.forEach(function(g){
      // Gaps in the numbering: games not scored
      for(var k = last + 1; g.num && k < g.num; k++) html += '<span class="ps-game ps-game-missing">G' + k + ' · not scored</span>';
      if(g.num) last = g.num;
      var lbl = (g.num ? 'G' + g.num : g.date || 'Game') + ' · ';
      if(g.final && g.winner) lbl += teamShort(g.winner) + ' ' + Math.max(g.as, g.hs) + '–' + Math.min(g.as, g.hs);
      else lbl += teamShort(g.away) + ' ' + g.as + ', ' + teamShort(g.home) + ' ' + g.hs + (g.final ? '' : ' · unfinished');
      if(g.current) html += '<span class="ps-game ps-game-active" title="Open now">' + esc(lbl) + '</span>';
      else html += '<button class="ps-game" onclick="gmLoadGame(\'' + g.id + '\')">' + esc(lbl) + '</button>';
    });
    html += '</div></div>';
  });
  return html + '</div>';
}

function teamLogoImg(side, cls){
  var url = TEAM_LOGOS[team(side)];
  return url ? '<img class="' + cls + '" src="' + url + '" alt="" />' : '';
}

function updateLogo(side) {
  var val = document.getElementById('team'+side.charAt(0).toUpperCase()+side.slice(1)).value;
  var imgId = 'logo'+side.charAt(0).toUpperCase()+side.slice(1);
  var img = document.getElementById(imgId);
  if(!img) return;
  var url = TEAM_LOGOS[val];
  if(url) { img.src=url; img.alt=val; img.className='team-logo visible'; }
  else { img.src=''; img.alt=''; img.className='team-logo'; }
}

function renderStadium(teamName){
  var wrap = document.getElementById('stadiumWrap');
  if(!wrap) return;
  var ph = STADIUM_PHOTOS[teamName], sd = STADIUMS[teamName];
  if(!ph){ wrap.innerHTML = ''; return; }
  var venue = (sd && sd.name) || teamName;
  wrap.innerHTML = '<figure class="stadium-photo">'
    + '<img src="' + esc(ph.img) + '" alt="' + esc(venue) + '" decoding="async" onerror="this.parentNode.classList.add(\'stadium-photo-off\')" />'
    + '<figcaption><span class="stadium-name">' + esc(venue) + '</span>'
    + '<a class="stadium-credit" href="' + esc(ph.page) + '" target="_blank" rel="noopener">Photo: ' + esc(ph.by) + ' · ' + esc(ph.lic) + '</a></figcaption>'
    + '</figure>';
}

// ══ Shareable final ══
// Draws the game as a PNG (score, line score, batting and pitching lines)
// for the share sheet. Always light-themed — it's meant to be posted.
var SF_W = 1080, SF_PAD = 48;

var SF_C = { bg:'#ffffff', ink:'#1a1a1a', muted:'#888780', line:'#e3e1d9', head:'#f5f4f0', accent:'#185FA5' };

var SF_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

var _sf = null;

 // { blob, url, filename }

// "New York Yankees" → "Yankees", "Toronto Blue Jays" → "Blue Jays"
function teamShort(name){
  var two = /(Red Sox|White Sox|Blue Jays)$/.exec(name);
  return two ? two[1] : name.split(' ').pop();
}

function sfLoadImg(url){
  return new Promise(function(resolve){
    if(!url) return resolve(null);
    var im = new Image();
    im.crossOrigin = 'anonymous'; // MLB serves logos with CORS, so the canvas stays exportable
    im.onload = function(){ resolve(im); };
    im.onerror = function(){ resolve(null); };
    setTimeout(function(){ resolve(null); }, 5000); // offline: draw without logos
    im.src = url;
  });
}

function sfContain(ctx, im, x, y, w, h){
  if(!im) return;
  var iw = im.naturalWidth || w, ih = im.naturalHeight || h;
  var s = Math.min(w / iw, h / ih), dw = iw * s, dh = ih * s;
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// Text cut to fit with an ellipsis
function sfFit(ctx, text, maxW){
  text = String(text);
  if(ctx.measureText(text).width <= maxW) return text;
  while(text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

function sfText(ctx, text, x, y, opts){
  opts = opts || {};
  ctx.font = (opts.weight || 400) + ' ' + (opts.size || 22) + 'px ' + SF_FONT;
  ctx.fillStyle = opts.color || SF_C.ink;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.maxW ? sfFit(ctx, text, opts.maxW) : String(text), x, y);
}

// Every player who appeared, starters then their subs, plus team totals
function sfBatting(side){
  var rows = [], tot = { ab:0, r:0, h:0, rbi:0, bb:0, k:0 };
  G.lineup[side].forEach(function(sl, i){
    var players = [{ name: sl.name || 'Batter ' + (i + 1), pos: sl.pos, h: sl.hits, sub: false }]
      .concat(sl.subs.map(function(s){ return { name: s.name || 'Sub', pos: s.subType === 'pr' ? 'PR' : s.pos, h: s.hits || mkHits(), sub: true }; }));
    players.forEach(function(p){
      var h = p.h;
      var r = { name: p.name, pos: p.pos && p.pos !== '—' ? p.pos : '', sub: p.sub,
        ab: abFor(h), r: h.r || 0, h: h.s + h.d + h.t + h.hr, rbi: h.rbi || 0,
        bb: (h.bb || 0) + (h.ibb || 0), k: (h.kl || 0) + (h.ks || 0) };
      rows.push(r);
      ['ab', 'r', 'h', 'rbi', 'bb', 'k'].forEach(function(k){ tot[k] += r[k]; });
    });
  });
  return { rows: rows, tot: tot };
}

// Pitchers who were used (or at least named)
function sfPitching(side){
  return G.pitchers[side].filter(function(p){ return p.pitches || p.outs || p.name; });
}

function sfStatus(){
  if(G.log.some(function(l){ return l.tag === 'Final'; })){
    return 'FINAL' + (G.inning > 9 || G.totalInnings > 9 ? '/' + G.inning : '');
  }
  return (G.half === 'top' ? 'TOP ' : 'BOT ') + G.inning;
}

function buildFinalImage(){
  var away = team('away'), home = team('home');
  var bat = { away: sfBatting('away'), home: sfBatting('home') };
  var pit = { away: sfPitching('away'), home: sfPitching('home') };
  var ps = POSTSEASON[G.notes && G.notes.gameType];
  var pl = postseasonLogo();
  return Promise.all([sfLoadImg(TEAM_LOGOS[away]), sfLoadImg(TEAM_LOGOS[home]), sfLoadImg(pl ? pl.src : null)]).then(function(imgs){
    var logo = { away: imgs[0], home: imgs[1] }, psLogo = imgs[2];
    var n = Math.max(9, G.totalInnings);
    var batRows = Math.max(bat.away.rows.length, bat.home.rows.length);
    var pitRows = Math.max(pit.away.length, pit.home.length, 1);
    var RH = 34;
    var H = SF_PAD + 44 + 24 + 150 + 30 + 46 * 3 + 44 + 44 + RH * batRows + 40 + 36 + 44 + RH * pitRows + 30 + 40 + SF_PAD;

    var scale = 2; // crisp on phones/retina
    var cv = document.createElement('canvas');
    cv.width = SF_W * scale; cv.height = H * scale;
    var ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = SF_C.bg;
    ctx.fillRect(0, 0, SF_W, H);

    var x0 = SF_PAD, x1 = SF_W - SF_PAD, y = SF_PAD;

    // ── Top line: postseason badge · date · venue
    var meta = [];
    if(G.notes && G.notes.date){
      try {
        var dp = G.notes.date.split('-');
        meta.push(new Date(dp[0], dp[1] - 1, dp[2]).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }));
      } catch(e){ meta.push(G.notes.date); }
    }
    if(G.notes && G.notes.venue) meta.push(G.notes.venue);
    var bx = x0;
    if(pl){
      var gameNo = G.notes.seriesGame ? 'Game ' + G.notes.seriesGame : '';
      if(pl.official && psLogo){
        // The official logo carries the year and round itself; just add the game
        sfContain(ctx, psLogo, bx, y - 10, 90, 60); bx += 102;
        if(gameNo) sfText(ctx, gameNo.toUpperCase(), bx, y + 20, { size:22, weight:800, color:SF_C.ink });
      } else {
        if(psLogo){ sfContain(ctx, psLogo, bx, y, 40, 40); bx += 50; }
        sfText(ctx, (pl.label + (gameNo ? ' · ' + gameNo : '')).toUpperCase(), bx, y + 20, { size:22, weight:800, color:SF_C.ink });
      }
    }
    if(meta.length) sfText(ctx, meta.join(' · '), x1, y + 20, { size:20, color:SF_C.muted, align:'right', maxW: ps ? 480 : x1 - x0 });
    y += 44 + 24;

    // ── Score: logo, name and runs for each team, status in the middle
    var aR = G.rhe.away[0], hR = G.rhe.home[0], final = sfStatus().indexOf('FINAL') === 0;
    var mid = SF_W / 2;
    [['away', away, aR, hR], ['home', home, hR, aR]].forEach(function(t){
      var left = t[0] === 'away', won = final && t[2] > t[3];
      var lx = left ? x0 : x1 - 120;
      sfContain(ctx, logo[t[0]], lx, y + 15, 120, 120);
      var nx = left ? x0 + 140 : x1 - 140;
      sfText(ctx, teamShort(t[1]), nx, y + 60, { size:40, weight:800, align: left ? 'left' : 'right', maxW: 250, color: SF_C.ink });
      sfText(ctx, t[1].replace(teamShort(t[1]), '').trim() || ' ', nx, y + 102, { size:20, color:SF_C.muted, align: left ? 'left' : 'right', maxW: 250 });
      sfText(ctx, t[2], left ? mid - 70 : mid + 70, y + 75, { size:96, weight:800, align: left ? 'right' : 'left', color: final && !won ? SF_C.muted : SF_C.ink });
    });
    // status pill
    ctx.font = '800 20px ' + SF_FONT;
    var st = sfStatus(), pw = ctx.measureText(st).width + 28;
    ctx.fillStyle = final ? SF_C.ink : SF_C.accent;
    sfRound(ctx, mid - pw / 2, y + 58, pw, 34, 17); ctx.fill();
    sfText(ctx, st, mid, y + 76, { size:20, weight:800, color:'#ffffff', align:'center' });
    y += 150 + 30;

    // ── Line score
    var teamW = 200, rheW = 64, innW = (x1 - x0 - teamW - rheW * 3) / n;
    ctx.fillStyle = SF_C.head; ctx.fillRect(x0, y, x1 - x0, 46);
    for(var c = 1; c <= n; c++) sfText(ctx, c, x0 + teamW + innW * (c - 0.5), y + 23, { size:20, weight:600, color:SF_C.muted, align:'center' });
    ['R', 'H', 'E'].forEach(function(k, i){ sfText(ctx, k, x1 - rheW * (3 - i) + rheW / 2, y + 23, { size:20, weight:700, color:SF_C.muted, align:'center' }); });
    ['away', 'home'].forEach(function(side, r){
      var ry = y + 46 * (r + 1);
      sfLine(ctx, x0, ry, x1, ry);
      sfContain(ctx, logo[side], x0 + 6, ry + 7, 32, 32);
      sfText(ctx, teamShort(team(side)), x0 + 48, ry + 23, { size:22, weight:700, maxW: teamW - 56 });
      for(var c = 1; c <= n; c++){
        var v = G.scores[side][c - 1];
        sfText(ctx, v === null || v === undefined ? '' : v, x0 + teamW + innW * (c - 0.5), ry + 23, { size:22, align:'center' });
      }
      G.rhe[side].forEach(function(v, i){ sfText(ctx, v, x1 - rheW * (3 - i) + rheW / 2, ry + 23, { size:22, weight:800, align:'center' }); });
    });
    sfLine(ctx, x0, y + 46 * 3, x1, y + 46 * 3);
    sfLine(ctx, x1 - rheW * 3, y, x1 - rheW * 3, y + 46 * 3);
    y += 46 * 3 + 44;

    // ── Batting and pitching, away on the left, home on the right
    var colW = (x1 - x0 - 40) / 2;
    var BAT_COLS = ['AB', 'R', 'H', 'RBI', 'BB', 'K'], BAT_KEYS = ['ab', 'r', 'h', 'rbi', 'bb', 'k'];
    var PIT_COLS = ['IP', 'H', 'R', 'ER', 'BB', 'K'];
    var statW = 44;
    var yBat = y;
    ['away', 'home'].forEach(function(side, ci){
      var cx = x0 + ci * (colW + 40), sx = cx + colW - statW * BAT_COLS.length;
      var yy = yBat;
      sfText(ctx, teamShort(team(side)) + ' batting', cx, yy + 20, { size:22, weight:800 });
      BAT_COLS.forEach(function(h, i){ sfText(ctx, h, sx + statW * (i + 0.5), yy + 20, { size:17, weight:700, color:SF_C.muted, align:'center' }); });
      yy += 44;
      sfLine(ctx, cx, yy - 4, cx + colW, yy - 4);
      bat[side].rows.forEach(function(r){
        var nm = shortName(r.name) + (r.pos ? '  ' + r.pos : '');
        sfText(ctx, (r.sub ? '↳ ' : '') + nm, cx + (r.sub ? 14 : 0), yy + RH / 2, { size: r.sub ? 18 : 20, weight: r.sub ? 400 : 500, color: r.sub ? '#444' : SF_C.ink, maxW: sx - cx - (r.sub ? 22 : 8) });
        BAT_KEYS.forEach(function(k, i){ sfText(ctx, r[k], sx + statW * (i + 0.5), yy + RH / 2, { size:20, align:'center', color: r[k] ? SF_C.ink : SF_C.muted }); });
        yy += RH;
      });
      yy = yBat + 44 + RH * batRows;
      sfLine(ctx, cx, yy + 2, cx + colW, yy + 2);
      sfText(ctx, 'Totals', cx, yy + 20, { size:20, weight:800 });
      BAT_KEYS.forEach(function(k, i){ sfText(ctx, bat[side].tot[k], sx + statW * (i + 0.5), yy + 20, { size:20, weight:800, align:'center' }); });
      var risp = rispLine(side);
      sfText(ctx, 'With RISP: ' + risp.h + '-for-' + risp.ab + '  ·  Left on base: ' + teamLOB(side), cx, yy + 52, { size:18, color:SF_C.muted });

      var yp = yBat + 44 + RH * batRows + 40 + 36;
      sfText(ctx, teamShort(team(side)) + ' pitching', cx, yp + 20, { size:22, weight:800 });
      PIT_COLS.forEach(function(h, i){ sfText(ctx, h, sx + statW * (i + 0.5), yp + 20, { size:17, weight:700, color:SF_C.muted, align:'center' }); });
      yp += 44;
      sfLine(ctx, cx, yp - 4, cx + colW, yp - 4);
      pit[side].forEach(function(p){
        sfText(ctx, shortName(p.name || 'Pitcher'), cx, yp + RH / 2, { size:20, weight:500, maxW: sx - cx - 8 });
        [fmtIP(p.outs || 0), p.h || 0, p.r || 0, p.er || 0, p.bb || 0, p.k || 0].forEach(function(v, i){
          sfText(ctx, v, sx + statW * (i + 0.5), yp + RH / 2, { size:20, align:'center' });
        });
        yp += RH;
      });
    });

    // ── Footer
    sfText(ctx, 'Scored live with Baseball Scorecard', SF_W / 2, H - SF_PAD + 6, { size:17, color:SF_C.muted, align:'center' });

    return new Promise(function(resolve, reject){
      cv.toBlob(function(blob){ blob ? resolve(blob) : reject(new Error('Couldn\'t create the image.')); }, 'image/png');
    });
  });
}

function sfLine(ctx, ax, ay, bx2, by){
  ctx.strokeStyle = SF_C.line; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx2, by); ctx.stroke();
}

function sfRound(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function sfFilename(){
  var d = (G.notes && G.notes.date) || new Date().toISOString().slice(0, 10);
  return (teamShort(team('away')) + '-at-' + teamShort(team('home')) + '-' + d).replace(/\s+/g, '-') + '.png';
}

// Preview with Share / Save / Copy
function openShareFinal(){
  closeShareFinal();
  var ov = document.createElement('div');
  ov.className = 'gm-overlay';
  ov.id = 'sfOverlay';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeShareFinal(); });
  ov.innerHTML = '<div class="gm-modal sf-modal" role="dialog" aria-modal="true" aria-labelledby="sfTitle">'
    + '<div class="gm-hdr"><h3 id="sfTitle">🖼 Share final</h3><button class="games-modal-close" onclick="closeShareFinal()" aria-label="Close">&times;</button></div>'
    + '<div class="gm-body"><div class="mlb-msg" id="sfBody">Drawing the scorecard…</div></div></div>';
  document.body.appendChild(ov);
  buildFinalImage().then(function(blob){
    if(!document.getElementById('sfOverlay')) return;
    _sf = { blob: blob, url: URL.createObjectURL(blob), filename: sfFilename() };
    var file = new File([blob], _sf.filename, { type:'image/png' });
    var canShare = !!(navigator.canShare && navigator.canShare({ files:[file] }));
    var canCopy = !!(navigator.clipboard && window.ClipboardItem);
    var el = document.getElementById('sfBody');
    el.className = 'sf-body';
    el.innerHTML = '<img class="sf-img" src="' + _sf.url + '" alt="Scorecard image: ' + esc(team('away')) + ' ' + G.rhe.away[0] + ', ' + esc(team('home')) + ' ' + G.rhe.home[0] + '" />'
      + '<div class="sf-acts">'
      + (canShare ? '<button class="mlb-use" onclick="shareFinalImage()">Share…</button>' : '')
      + '<button class="' + (canShare ? 'mlb-keep' : 'mlb-use') + '" onclick="saveFinalImage()">Save image</button>'
      + (canCopy ? '<button class="mlb-keep" onclick="copyFinalImage()">Copy image</button>' : '')
      + '</div>';
  }).catch(function(err){
    var el = document.getElementById('sfBody');
    if(el){ el.className = 'mlb-msg mlb-err'; el.textContent = (err && err.message) || 'Couldn\'t create the image.'; }
  });
}

function closeShareFinal(){
  var ov = document.getElementById('sfOverlay');
  if(ov) ov.remove();
  if(_sf && _sf.url) URL.revokeObjectURL(_sf.url);
  _sf = null;
}

function shareFinalImage(){
  if(!_sf) return;
  var file = new File([_sf.blob], _sf.filename, { type:'image/png' });
  navigator.share({ files:[file] }).catch(function(err){
    if(!err || err.name !== 'AbortError') saveFinalImage();
  });
}

function saveFinalImage(){
  if(!_sf) return;
  var a = document.createElement('a');
  a.href = _sf.url;
  a.download = _sf.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function copyFinalImage(){
  if(!_sf) return;
  navigator.clipboard.write([new ClipboardItem({ 'image/png': _sf.blob })])
    .then(function(){ kbFlash('Image copied', '#1D9E75'); })
    .catch(function(){ kbFlash('Couldn\'t copy — use Save image', '#BA7517'); });
}

// ══ Season stats ══
// Totals across every saved game (My Games) plus the one in progress:
// batting, pitching and a game list, filtered by team, attendance and game type.
var SS_PREFS_KEY = 'baseball_scorecard_stats_prefs';

var _ss = { team: 'all', attended: 'all', type: 'all', tab: 'batting', sort: {} };

try { Object.assign(_ss, JSON.parse(localStorage.getItem(SS_PREFS_KEY) || '{}')); } catch(e){}

function ssSavePrefs(){
  try { localStorage.setItem(SS_PREFS_KEY, JSON.stringify({ team:_ss.team, attended:_ss.attended, type:_ss.type, tab:_ss.tab, sort:_ss.sort })); } catch(e){}
}

function ssTeamLabel(v, fallback){ return (!v || v === '— Select Team —') ? fallback : v; }

// Every game with plays: saved slots, with the live game taken from memory
function ssGames(){
  var activeId = gmGetActiveId(), out = [];
  gmGetIndex().forEach(function(e){
    if(e.id === activeId) return;
    var payload = null;
    try { payload = JSON.parse(localStorage.getItem(GM_GAME_PREFIX + e.id) || 'null'); } catch(x){}
    if(!payload || !payload.G || payload.syncCopy) return;   // sync conflict copies don't count twice
    var g = migrateGame(payload.G);
    if(!g.log.length && !g.pas.length) return;
    out.push({ id: e.id, g: g, away: ssTeamLabel(payload.teamAway, 'Away'), home: ssTeamLabel(payload.teamHome, 'Home') });
  });
  if(G.log.length || G.pas.length) out.push({ id: activeId || '', g: G, away: team('away'), home: team('home'), current: true });
  return out;
}

function ssIsFinal(g){ return g.log.some(function(l){ return l.tag === 'Final'; }); }

function ssTypeOf(g){
  var t = (g.notes && g.notes.gameType) || '';
  return POSTSEASON[t] ? 'post' : t || 'unset';
}

function ssFiltered(){
  return ssGames().filter(function(x){
    if(_ss.team !== 'all' && x.away !== _ss.team && x.home !== _ss.team) return false;
    if(_ss.attended === 'yes' && !(x.g.notes && x.g.notes.attended)) return false;
    if(_ss.type !== 'all' && ssTypeOf(x.g) !== _ss.type) return false;
    return true;
  });
}

// Which player batted in a PA of game g (starter or sub), without touching G
function ssPaPlayer(g, pa){
  var sl = g.lineup[pa.side][pa.slot], who = pa.who;
  if(who === undefined){
    var at = pa.inn * 2 + (pa.half === 'bot' ? 1 : 0); who = -1;
    sl.subs.forEach(function(sub, si){ if(sub.inning * 2 + (sub.half === 'bot' ? 1 : 0) <= at) who = si; });
  }
  return who >= 0 && sl.subs[who] ? sl.subs[who].name : sl.name;
}

function ssBatting(games){
  var by = {};
  games.forEach(function(x){
    var seen = {};
    ['away', 'home'].forEach(function(side){
      var tm = x[side];
      x.g.lineup[side].forEach(function(sl){
        [{ name: sl.name, h: sl.hits }].concat(sl.subs.map(function(s){ return { name: s.name, h: s.hits || mkHits() }; })).forEach(function(p){
          if(!p.name) return;
          var h = p.h, pa = abFor(h) + (h.bb || 0) + (h.ibb || 0) + (h.hbp || 0) + (h.ci || 0) + (h.sf || 0) + (h.sac || 0);
          var k = tm + '|' + mlbNormName(p.name);
          var r = by[k] = by[k] || { name: p.name, team: tm, g: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, hbp: 0, sf: 0, rh: 0, rab: 0 };
          if(pa > 0 && !seen[k]){ r.g++; seen[k] = true; }
          r.ab += abFor(h); r.r += h.r || 0; r.h += h.s + h.d + h.t + h.hr; r.d += h.d; r.t += h.t; r.hr += h.hr;
          r.rbi += h.rbi || 0; r.bb += (h.bb || 0) + (h.ibb || 0); r.k += (h.kl || 0) + (h.ks || 0); r.sb += h.sb || 0;
          r.hbp += h.hbp || 0; r.sf += h.sf || 0;
        });
      });
    });
    x.g.pas.forEach(function(pa){
      if(!pa.risp || !paIsAB(pa.res)) return;
      var r = by[x[pa.side] + '|' + mlbNormName(ssPaPlayer(x.g, pa))];
      if(!r) return;
      r.rab++;
      if(paIsHit(pa.res)) r.rh++;
    });
  });
  return Object.keys(by).map(function(k){
    var r = by[k], singles = r.h - r.d - r.t - r.hr, obpDen = r.ab + r.bb + r.hbp + r.sf;
    r.avg = r.ab ? r.h / r.ab : null;
    r.obp = obpDen ? (r.h + r.bb + r.hbp) / obpDen : null;
    r.slg = r.ab ? (singles + 2 * r.d + 3 * r.t + 4 * r.hr) / r.ab : null;
    return r;
  }).filter(function(r){ return r.g > 0 && (_ss.team === 'all' || r.team === _ss.team); });
}

function ssPitching(games){
  var by = {};
  games.forEach(function(x){
    ['away', 'home'].forEach(function(side){
      var tm = x[side];
      x.g.pitchers[side].forEach(function(p){
        if(!p.name || !(p.pitches || p.outs)) return;
        var k = tm + '|' + mlbNormName(p.name);
        var r = by[k] = by[k] || { name: p.name, team: tm, g: 0, outs: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0, pitches: 0 };
        r.g++; r.outs += p.outs || 0; r.h += p.h || 0; r.r += p.r || 0; r.er += p.er || 0;
        r.bb += p.bb || 0; r.k += p.k || 0; r.hr += p.hr || 0; r.pitches += p.pitches || 0;
      });
    });
  });
  return Object.keys(by).map(function(k){
    var r = by[k], ip = r.outs / 3;
    r.era = ip ? r.er * 9 / ip : null;
    r.whip = ip ? (r.bb + r.h) / ip : null;
    return r;
  }).filter(function(r){ return _ss.team === 'all' || r.team === _ss.team; });
}

// ".250" style; "—" when there's nothing to divide by
function ssRate(v){ return v === null ? '—' : v.toFixed(3).replace(/^0/, ''); }

function ssDec(v){ return v === null ? '—' : v.toFixed(2); }

var SS_BAT_COLS = [
  ['name', 'Player'], ['team', 'Team'], ['g', 'G'], ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['d', '2B'], ['t', '3B'], ['hr', 'HR'],
  ['rbi', 'RBI'], ['bb', 'BB'], ['k', 'K'], ['sb', 'SB'], ['avg', 'AVG'], ['obp', 'OBP'], ['slg', 'SLG'], ['rab', 'RISP']
];

var SS_PIT_COLS = [
  ['name', 'Pitcher'], ['team', 'Team'], ['g', 'G'], ['outs', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['bb', 'BB'],
  ['k', 'K'], ['hr', 'HR'], ['era', 'ERA'], ['whip', 'WHIP'], ['pitches', 'P']
];

function ssSorted(rows, tab, def){
  var s = _ss.sort[tab] || def, key = s.key, dir = s.dir;
  return rows.slice().sort(function(a, b){
    var va = a[key], vb = b[key];
    if(typeof va === 'string' || typeof vb === 'string') return dir * String(va).localeCompare(String(vb));
    if(va === null) return 1;
    if(vb === null) return -1;
    return dir * (va - vb) || String(a.name).localeCompare(String(b.name));
  });
}

function ssSetSort(tab, key){
  var cur = _ss.sort[tab];
  var lowFirst = key === 'name' || key === 'team' || key === 'era' || key === 'whip';
  _ss.sort[tab] = { key: key, dir: cur && cur.key === key ? -cur.dir : (lowFirst ? 1 : -1) };
  ssSavePrefs();
  renderSeasonStats();
}

function ssHeader(cols, tab, def){
  var s = _ss.sort[tab] || def;
  return '<tr>' + cols.map(function(c){
    if(c[0] === 'team' && _ss.team !== 'all') return '';
    var on = s.key === c[0];
    return '<th' + (c[0] === 'name' ? ' class="ss-name"' : '') + ' aria-sort="' + (on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none') + '">'
      + '<button onclick="ssSetSort(\'' + tab + '\',\'' + c[0] + '\')">' + c[1] + (on ? (s.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
  }).join('') + '</tr>';
}

function openSeasonStats(){
  closeSeasonStats();
  clearTimeout(_saveTimer);
  _doSave();
  var ov = document.createElement('div');
  ov.className = 'gm-overlay';
  ov.id = 'ssOverlay';
  ov.addEventListener('click', function(e){ if(e.target === ov) closeSeasonStats(); });
  document.body.appendChild(ov);
  renderSeasonStats();
}

function closeSeasonStats(){
  var ov = document.getElementById('ssOverlay');
  if(ov) ov.remove();
}

function ssSet(field, value){
  _ss[field] = value;
  ssSavePrefs();
  renderSeasonStats();
}

function ssOpenGame(id){
  closeSeasonStats();
  if(id && id !== gmGetActiveId()) gmLoadGame(id);
}

function renderSeasonStats(){
  var ov = document.getElementById('ssOverlay');
  if(!ov) return;
  var all = ssGames();
  var teams = {};
  all.forEach(function(x){ teams[x.away] = true; teams[x.home] = true; });
  delete teams.Away; delete teams.Home;
  if(_ss.team !== 'all' && !teams[_ss.team]) _ss.team = 'all';
  var games = ssFiltered();

  var html = '<div class="gm-modal ss-modal" role="dialog" aria-modal="true" aria-labelledby="ssTitle">';
  html += '<div class="gm-hdr"><h3 id="ssTitle">📊 Season stats</h3><button class="games-modal-close" onclick="closeSeasonStats()" aria-label="Close">&times;</button></div>';
  html += '<div class="gm-body">';

  // Filters
  html += '<div class="ss-filters">';
  html += '<label>Team <select onchange="ssSet(\'team\', this.value)"><option value="all">All teams</option>'
    + Object.keys(teams).sort().map(function(t){ return '<option value="' + esc(t) + '"' + (_ss.team === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>';
  html += '<label>Games <select onchange="ssSet(\'attended\', this.value)"><option value="all">All games</option><option value="yes"' + (_ss.attended === 'yes' ? ' selected' : '') + '>Games I attended</option></select></label>';
  var types = [['all', 'All types'], ['post', 'Postseason'], ['regular', 'Regular season'], ['spring', 'Spring training'], ['unset', 'Not set']];
  html += '<label>Type <select onchange="ssSet(\'type\', this.value)">' + types.map(function(t){ return '<option value="' + t[0] + '"' + (_ss.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label>';
  html += '</div>';

  // Summary: games, and the record when a team is picked
  var finals = games.filter(function(x){ return ssIsFinal(x.g); });
  var sum = games.length + ' game' + (games.length === 1 ? '' : 's') + ' scored';
  if(finals.length < games.length) sum += ' · ' + (games.length - finals.length) + ' not final';
  var att = games.filter(function(x){ return x.g.notes && x.g.notes.attended; }).length;
  if(att) sum += ' · ' + att + ' attended';
  var rec = '';
  if(_ss.team !== 'all' && finals.length){
    var w = 0, l = 0, rf = 0, ra = 0;
    finals.forEach(function(x){
      var mine = x.away === _ss.team ? 'away' : 'home', theirs = mine === 'away' ? 'home' : 'away';
      var a = x.g.rhe[mine][0], b = x.g.rhe[theirs][0];
      rf += a; ra += b;
      if(a > b) w++; else if(b > a) l++;
    });
    rec = '<div class="ss-record"><b>' + w + '-' + l + '</b> <span>' + esc(_ss.team) + ' record · ' + rf + ' run' + (rf === 1 ? '' : 's') + ' scored, ' + ra + ' allowed</span></div>';
  }
  html += '<div class="ss-sum">' + rec + '<div>' + sum + '</div></div>';

  // Tabs
  html += '<div class="ss-tabs" role="tablist">' + [['batting', 'Batting'], ['pitching', 'Pitching'], ['games', 'Games']].map(function(t){
    return '<button role="tab" aria-selected="' + (_ss.tab === t[0]) + '" class="sc-tab' + (_ss.tab === t[0] ? ' sel' : '') + '" onclick="ssSet(\'tab\',\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join('') + '</div>';

  if(!games.length){
    html += '<div class="mlb-msg">No games match these filters yet.</div>';
  } else if(_ss.tab === 'batting'){
    var rows = ssSorted(ssBatting(games), 'batting', { key: 'ab', dir: -1 });
    html += '<div class="ss-scroll"><table class="ss-table"><thead>' + ssHeader(SS_BAT_COLS, 'batting', { key: 'ab', dir: -1 }) + '</thead><tbody>';
    rows.forEach(function(r){
      html += '<tr><td class="ss-name">' + esc(r.name) + '</td>' + (_ss.team === 'all' ? '<td class="ss-team">' + esc(teamShort(r.team)) + '</td>' : '')
        + [r.g, r.ab, r.r, r.h, r.d, r.t, r.hr, r.rbi, r.bb, r.k, r.sb].map(function(v){ return '<td>' + v + '</td>'; }).join('')
        + '<td><b>' + ssRate(r.avg) + '</b></td><td>' + ssRate(r.obp) + '</td><td>' + ssRate(r.slg) + '</td>'
        + '<td>' + (r.rab ? r.rh + '-' + r.rab : '—') + '</td></tr>';
    });
    html += '</tbody></table></div><div class="mlb-foot">RISP: hits-at bats with a runner on 2nd or 3rd, for plate appearances where it was recorded.</div>';
  } else if(_ss.tab === 'pitching'){
    var prow = ssSorted(ssPitching(games), 'pitching', { key: 'outs', dir: -1 });
    html += '<div class="ss-scroll"><table class="ss-table"><thead>' + ssHeader(SS_PIT_COLS, 'pitching', { key: 'outs', dir: -1 }) + '</thead><tbody>';
    prow.forEach(function(r){
      html += '<tr><td class="ss-name">' + esc(r.name) + '</td>' + (_ss.team === 'all' ? '<td class="ss-team">' + esc(teamShort(r.team)) + '</td>' : '')
        + '<td>' + r.g + '</td><td>' + fmtIP(r.outs) + '</td>'
        + [r.h, r.r, r.er, r.bb, r.k, r.hr].map(function(v){ return '<td>' + v + '</td>'; }).join('')
        + '<td><b>' + ssDec(r.era) + '</b></td><td>' + ssDec(r.whip) + '</td><td>' + r.pitches + '</td></tr>';
    });
    html += '</tbody></table></div>';
  } else {
    var list = games.slice().sort(function(a, b){ return String(b.g.notes.date || '').localeCompare(String(a.g.notes.date || '')); });
    html += '<div class="ss-scroll"><table class="ss-table ss-games"><thead><tr><th class="ss-name">Date</th><th class="ss-name">Game</th><th>Score</th><th>Type</th><th></th></tr></thead><tbody>';
    list.forEach(function(x){
      var g = x.g, ps = POSTSEASON[g.notes.gameType], fin = ssIsFinal(g);
      var score = g.rhe.away[0] + '-' + g.rhe.home[0];
      var res = '';
      if(fin && _ss.team !== 'all'){
        var me = x.away === _ss.team ? 'away' : 'home', a = g.rhe[me][0], b = g.rhe[me === 'away' ? 'home' : 'away'][0];
        res = a > b ? '<span class="ss-w">W</span> ' : b > a ? '<span class="ss-l">L</span> ' : '';
      }
      var typeLabel = ps ? ps.label + (g.notes.seriesGame ? ' G' + g.notes.seriesGame : '') : ({ regular: 'Regular', spring: 'Spring', asg: 'All-Star', other: 'Other' })[g.notes.gameType] || '—';
      html += '<tr><td class="ss-name">' + esc(g.notes.date || '—') + '</td>'
        + '<td class="ss-name">' + esc(teamShort(x.away)) + ' @ ' + esc(teamShort(x.home)) + (g.notes.attended ? ' <span class="ss-att">Attended</span>' : '') + (x.current ? ' <span class="ss-att">Open now</span>' : '') + '</td>'
        + '<td>' + res + score + (fin ? '' : ' <span class="ss-live">' + (g.half === 'top' ? 'T' : 'B') + g.inning + '</span>') + '</td>'
        + '<td>' + esc(typeLabel) + '</td>'
        + '<td>' + (x.current ? '' : '<button class="mlb-keep" onclick="ssOpenGame(\'' + esc(x.id) + '\')">Open</button>') + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div></div>';
  ov.innerHTML = html;
}
