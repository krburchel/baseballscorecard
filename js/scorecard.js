// The scorecard grid, its cell editor and the inning popover.
// Loaded as a plain script; files share one global scope (see index.html for the order).

// ── Per-inning batter tracking ──
// Records which batters had plate appearances in each half-inning.
// Key format: "T1", "B1", "T2", "B2", etc.
// outsOnPlay: total outs the play makes (DP=2, TP=3); the batter is credited
// with the last of them, as on a standard 6-4-3.
function logBatter(side, batterIdx, result, outsOnPlay){
  var key = (G.half === 'top' ? 'T' : 'B') + G.inning;
  if(!G.batterLog[side][key]) G.batterLog[side][key] = [];
  var nm = curName(side, batterIdx);
  G.batterLog[side][key].push(nm + ' — ' + result);

  var isOut = paIsOut(result), id = newPaId();
  // The result line ("Díaz — Single") was just logged: point it at this PA
  if(G.log[0] && !G.log[0].paId && G.log[0].text.indexOf(nm) >= 0) G.log[0].paId = id;
  G.pas.push({
    id: id,
    side: side, slot: batterIdx, inn: G.inning, half: G.half, res: result,
    reached: paReachFor(result),
    out: isOut ? Math.min(3, G.outs + (outsOnPlay || 1)) : 0,
    pIdx: activePIdx(side === 'home' ? 'away' : 'home'),
    who: G.lineup[side][batterIdx].subs.length - 1, // -1 = starter, else sub index
    risp: !!(G.bases[1] || G.bases[2]),             // runner on 2nd or 3rd when the PA ended
    unearned: result[0] === 'E'
  });
  scheduleScorecardRender();
}

// ── Scorecard grid ──
// Batters down, innings across; one diamond per plate appearance.
// Follows the batting team each half-inning; tapping a tab overrides until the
// next half starts.
var scView = null, _scHalfSeen = null;

var _scRenderScheduled = false;

function scheduleScorecardRender(){
  if(_scRenderScheduled) return;
  _scRenderScheduled = true;
  var schedule = window.requestAnimationFrame || function(cb){ return setTimeout(cb, 0); };
  schedule(function(){
    _scRenderScheduled = false;
    renderScorecard();
  });
}

function setScorecardView(side){
  scView = side;
  _scHalfSeen = G.inning + G.half; // stick with this tab until the half changes
  renderScorecard();
  haptic(5);
}

// Display notation for a stored result: "G6-3" → "6-3", "G3" → "3U", "FC6-4" → "FC"
function paLabel(res){
  var m = /^G(\d(?:-\d)+)$/.exec(res);
  if(m) return m[1];
  m = /^G(\d)$/.exec(res);
  if(m) return m[1] + 'U';
  if(/^FC/.test(res)) return 'FC';
  if(res === '1B+E' || res === '2B+E' || res === '3B+E' || res === 'HR+E') return res.slice(0, 2);
  return res;
}

function paLabelClass(res){
  if(paIsHit(res)) return ' sc-hit';
  if(res === 'K' || res === 'ꓘ') return ' sc-k';
  if(res === 'BB' || res === 'IBB' || res === 'HBP') return ' sc-walk';
  if(res[0] === 'E') return ' sc-err';
  return '';
}

// Corners of the diamond: home → 1B → 2B → 3B → home
var SC_PTS = [[20,37],[37,20],[20,3],[3,20],[20,37]];

function paCellHtml(pa){
  var svg = '<svg class="sc-dia" viewBox="0 0 40 40" aria-hidden="true">'
    + '<polygon class="sc-dia-bg" points="20,37 37,20 20,3 3,20"/>';
  for(var k = 0; k < pa.reached && k < 4; k++){
    svg += '<line class="sc-path" x1="' + SC_PTS[k][0] + '" y1="' + SC_PTS[k][1]
      + '" x2="' + SC_PTS[k+1][0] + '" y2="' + SC_PTS[k+1][1] + '"/>';
  }
  svg += '</svg>';
  var label = paLabel(pa.res);
  var desc = label + (pa.reached === 4 ? ', scored' : pa.reached > 0 ? ', reached ' + ['','1st','2nd','3rd'][pa.reached] : '')
    + (pa.out ? ', out ' + pa.out + (pa.outOnBases ? ' on the bases' : '') : '');
  return '<div class="sc-pa' + (pa.reached === 4 ? ' sc-scored' : '') + '" role="button" tabindex="0" data-pa="' + G.pas.indexOf(pa)
    + '" title="' + esc(desc) + ' — tap to edit" aria-label="' + esc(desc) + ', edit">'
    + svg
    + '<span class="sc-res' + paLabelClass(pa.res) + '">' + esc(label) + '</span>'
    + (pa.out ? '<span class="sc-outn">' + pa.out + '</span>' : '')
    + '</div>';
}

// Same at-bat definition as the printed box score
// At-bats as officially scored: reaching on an error counts (roe), walks/HBP/sacrifices don't
function abFor(h){ return h.s + h.d + h.t + h.hr + h.kl + h.ks + h.fo + h.go + h.fc + (h.roe || 0); }

function scorecardTableHtml(side){
  var n = G.totalInnings;
  var bySlotInn = {};
  G.pas.forEach(function(pa){
    if(pa.side !== side) return;
    var key = pa.slot + '-' + pa.inn;
    (bySlotInn[key] = bySlotInn[key] || []).push(pa);
  });
  var batSide = batting();
  var curIdx = abIdx(side);

  var html = '<table class="sc-table' + (side === scView ? ' sc-active' : '') + '">';
  html += '<caption class="sc-print-hdr">' + teamLogoImg(side, 'sc-hdr-logo') + esc(team(side)) + '</caption>';
  html += '<thead><tr><th class="sc-name">' + teamLogoImg(side, 'sc-hdr-logo') + esc(team(side)) + '</th>';
  for(var c = 1; c <= n; c++) html += '<th>' + c + '</th>';
  html += '<th class="sc-tot sc-tot-first">AB</th><th class="sc-tot">R</th><th class="sc-tot">H</th><th class="sc-tot">RBI</th></tr></thead><tbody>';

  for(var i = 0; i < 9; i++){
    var sl = G.lineup[side][i];
    html += '<tr><td class="sc-name"><div class="sc-pname">' + esc(sl.name || 'Batter ' + (i + 1))
      + (sl.pos && sl.pos !== '—' ? '<span class="sc-ppos">' + esc(sl.pos) + '</span>' : '') + '</div>';
    sl.subs.forEach(function(sub){
      html += '<div class="sc-psub">↳ ' + esc(sub.name || 'Sub') + ' <span class="sc-ppos">'
        + esc(sub.subType === 'pr' ? 'PR' : sub.pos) + ' ' + (sub.half === 'top' ? 'T' : 'B') + sub.inning + '</span></div>';
    });
    html += '</td>';
    for(var c = 1; c <= n; c++){
      var cur = side === batSide && i === curIdx && c === G.inning;
      html += '<td class="sc-cell' + (cur ? ' sc-cur' : '') + '">';
      (bySlotInn[i + '-' + c] || []).forEach(function(pa){ html += paCellHtml(pa); });
      html += '</td>';
    }
    var t = {ab:0, r:0, h:0, rbi:0};
    [sl.hits].concat(sl.subs.map(function(sub){ return sub.hits || mkHits(); })).forEach(function(h){
      t.ab += abFor(h); t.r += h.r || 0; t.h += h.s + h.d + h.t + h.hr; t.rbi += h.rbi || 0;
    });
    html += '<td class="sc-tot sc-tot-first">' + t.ab + '</td><td class="sc-tot">' + t.r + '</td><td class="sc-tot">' + t.h + '</td><td class="sc-tot">' + t.rbi + '</td></tr>';
  }
  html += '</tbody>';

  // Per-inning R / H / LOB. LOB only once that half-inning is over.
  var half = side === 'away' ? 'top' : 'bot';
  var final = G.log.some(function(l){ return l.tag === 'Final'; });
  var hits = [], lob = [], hTot = 0, lobTot = 0;
  for(var c = 1; c <= n; c++){
    var inHalf = G.pas.filter(function(pa){ return pa.side === side && pa.inn === c; });
    var h = inHalf.filter(function(pa){ return paIsHit(pa.res); }).length;
    var done = final || c < G.inning || (c === G.inning && half === 'top' && G.half === 'bot');
    var l = inHalf.filter(function(pa){ return pa.reached >= 1 && pa.reached <= 3 && !pa.out; }).length;
    hits.push(inHalf.length ? h : '');
    lob.push(done && inHalf.length ? l : '');
    hTot += h;
    if(done) lobTot += l;
  }
  html += '<tfoot>';
  html += '<tr><td class="sc-name">Runs</td>' + G.scores[side].slice(0, n).map(function(v){ return '<td>' + (v === null ? '' : v) + '</td>'; }).join('')
    + '<td class="sc-tot sc-tot-first" colspan="4">' + G.rhe[side][0] + '</td></tr>';
  html += '<tr><td class="sc-name">Hits</td>' + hits.map(function(v){ return '<td>' + v + '</td>'; }).join('')
    + '<td class="sc-tot sc-tot-first" colspan="4">' + hTot + '</td></tr>';
  html += '<tr><td class="sc-name">Left on base</td>' + lob.map(function(v){ return '<td>' + v + '</td>'; }).join('')
    + '<td class="sc-tot sc-tot-first" colspan="4">' + lobTot + '</td></tr>';
  var rispCells = [];
  for(var c2 = 1; c2 <= n; c2++){
    var rl = rispLine(side, c2);
    rispCells.push(rl.ab ? rl.h + '-' + rl.ab : '');
  }
  var rt = rispLine(side);
  html += '<tr><td class="sc-name" title="Hits-at bats with a runner on 2nd or 3rd">With RISP</td>' + rispCells.map(function(v){ return '<td>' + v + '</td>'; }).join('')
    + '<td class="sc-tot sc-tot-first" colspan="4">' + rt.h + '-for-' + rt.ab + '</td></tr>';
  html += '</tfoot></table>';
  return html;
}

function renderScorecard(){
  _scRenderScheduled = false;
  var wrap = document.getElementById('scorecard');
  if(!wrap) return;
  setupScorecardDelegation();
  var halfKey = G.inning + G.half;
  if(_scHalfSeen !== halfKey || !scView){ _scHalfSeen = halfKey; scView = batting(); }

  var html = '<div class="sc-tabs" role="tablist">';
  ['away','home'].forEach(function(side){
    html += '<button class="sc-tab' + (side === scView ? ' sel' : '') + '" role="tab" aria-selected="' + (side === scView)
      + '" onclick="setScorecardView(\'' + side + '\')">' + teamLogoImg(side, 'sc-tab-logo') + esc(team(side)) + '</button>';
  });
  html += postseasonBadge() + '</div><div class="sc-scroll">' + scorecardTableHtml('away') + scorecardTableHtml('home') + '</div>';

  // Keep horizontal scroll position across re-renders
  var oldScroll = wrap.querySelector('.sc-scroll');
  var left = oldScroll ? oldScroll.scrollLeft : 0;
  wrap.innerHTML = html;
  wrap.querySelector('.sc-scroll').scrollLeft = left;
}

// ── Scorecard cell editor ──
// Corrects a recorded plate appearance after the fact: the result (batter,
// pitcher and team hit/error totals follow), how far the runner got, and the
// out number. It deliberately doesn't replay the game — runners on base, the
// current outs and runs stay as they are.

// Result "types" offered in the editor. fielders: true → needs a fielder string.
var PE_TYPES = [
  {t:'1B'}, {t:'2B'}, {t:'3B'}, {t:'HR'},
  {t:'BB'}, {t:'IBB'}, {t:'HBP'},
  {t:'K'}, {t:'ꓘ', label:'ꓘ'},
  {t:'F', label:'Fly', fielders:true}, {t:'G', label:'Ground', fielders:true},
  {t:'SF', fielders:true}, {t:'SAC'}, {t:'FC', fielders:true}, {t:'E', fielders:true},
  {t:'Out'}
];

// Split a stored result into editor parts: "G6-3" → {t:'G', f:'6-3'}, "1B+E" → {t:'1B', plusE:true}
function peParse(res){
  var m = /^(1B|2B|3B|HR)(\+E)?$/.exec(res);
  if(m) return {t:m[1], f:'', plusE:!!m[2]};
  m = /^(SF|FC|F|G|E)([\d-]*)$/.exec(res);
  if(m) return {t:m[1], f:m[2], plusE:false};
  return {t:res, f:'', plusE:false};
}

function peCompose(st){
  var type = PE_TYPES.filter(function(x){ return x.t === st.t; })[0];
  if(type && type.fielders) return st.t + (st.f || '').replace(/[^\d-]/g, '');
  if(/^(1B|2B|3B|HR)$/.test(st.t) && st.plusE) return st.t + '+E';
  return st.t;
}

// The batter / pitcher / team counters a result contributes to
function paStatKeys(res){
  var k = {bat:[], pit:[], teamHit:false, teamErr:false};
  var hit = /^(1B|2B|3B|HR)/.exec(res);
  if(hit){
    k.bat.push({'1B':'s','2B':'d','3B':'t','HR':'hr'}[hit[1]]);
    k.pit.push('h'); k.teamHit = true;
    if(hit[1] === 'HR') k.pit.push('hr');
    if(/\+E$/.test(res)){ k.bat.push('err'); k.teamErr = true; }
  }
  else if(res === 'K'){ k.bat.push('ks'); k.pit.push('k'); }
  else if(res === 'ꓘ'){ k.bat.push('kl'); k.pit.push('k'); }
  else if(res === 'BB'){ k.bat.push('bb'); k.pit.push('bb'); }
  else if(res === 'IBB'){ k.bat.push('ibb'); k.pit.push('bb'); }
  else if(res === 'HBP') k.bat.push('hbp');
  else if(/^SF/.test(res)) k.bat.push('sf');
  else if(res === 'SAC') k.bat.push('sac');
  else if(/^FC/.test(res)) k.bat.push('fc');
  else if(/^E/.test(res)){ k.bat.push('err'); k.bat.push('roe'); k.teamErr = true; }
  else if(/^F\d/.test(res)) k.bat.push('fo');
  else if(/^G\d/.test(res)) k.bat.push('go');
  return k;
}

// Hits object of the player who batted in this PA (starter or a sub).
// PAs recorded before `who` existed: the last sub in by that half-inning.
function paHits(pa){
  var sl = G.lineup[pa.side][pa.slot];
  var who = pa.who;
  if(who === undefined){
    var at = pa.inn * 2 + (pa.half === 'bot' ? 1 : 0);
    who = -1;
    sl.subs.forEach(function(sub, si){
      if(sub.inning * 2 + (sub.half === 'bot' ? 1 : 0) <= at) who = si;
    });
  }
  var p = who >= 0 ? sl.subs[who] : null;
  return p ? (p.hits = p.hits || mkHits()) : sl.hits;
}

// Add (sign = 1) or remove (sign = -1) a PA's result from every counter.
function applyPaStats(pa, sign){
  var k = paStatKeys(pa.res);
  var h = paHits(pa);
  k.bat.forEach(function(key){ h[key] = Math.max(0, (h[key] || 0) + sign); });
  var fSide = pa.side === 'home' ? 'away' : 'home';
  var p = G.pitchers[fSide][pa.pIdx] || G.pitchers[fSide][0];
  k.pit.forEach(function(key){ p[key] = Math.max(0, (p[key] || 0) + sign); });
  if(k.teamHit) G.rhe[pa.side][1] = Math.max(0, G.rhe[pa.side][1] + sign);
  if(k.teamErr) G.rhe[fSide][2] = Math.max(0, G.rhe[fSide][2] + sign);
}

// Keep the inning popover's batter list in step: entries are pushed in the
// same order as G.pas, so match by position within the half-inning.
function paBatterLogIdx(pa){
  var n = 0;
  for(var i = 0; i < G.pas.length && G.pas[i] !== pa; i++){
    var q = G.pas[i];
    if(q.side === pa.side && q.inn === pa.inn && q.half === pa.half) n++;
  }
  return n;
}

var _peState = null;

 // {idx, t, f, plusE, reached, out}

function openPaEditor(idx){
  var pa = G.pas[idx];
  if(!pa) return;
  var parts = peParse(pa.res);
  _peState = {idx:idx, t:parts.t, f:parts.f, plusE:parts.plusE, reached:pa.reached, out:pa.out || 0, risp:pa.risp};
  renderPaEditor();
}

function closePaEditor(){
  _peState = null;
  var el = document.getElementById('peOverlay');
  if(el) el.remove();
}

function peSet(field, val){
  if(!_peState) return;
  var wasOut = paIsOut(peCompose(_peState));
  _peState[field] = val;
  if(field === 't'){
    // Follow the new result with sensible defaults; still adjustable below.
    var res = peCompose(_peState), isOut = paIsOut(res);
    if(isOut && !wasOut){ _peState.reached = 0; }
    else if(!isOut && wasOut){ _peState.reached = paReachFor(res); _peState.out = 0; }
  }
  renderPaEditor();
  haptic(5);
}

function peFieldersInput(el){
  if(!_peState) return;
  _peState.f = el.value.replace(/[^\d-]/g, '');
  var prev = document.getElementById('pePreview');
  if(prev) prev.innerHTML = 'Scored as <b>' + esc(paLabel(peCompose(_peState))) + '</b>';
}

function renderPaEditor(){
  if(!_peState) return;
  var st = _peState, pa = G.pas[st.idx];
  var ov = document.getElementById('peOverlay');
  var refocus = document.activeElement && document.activeElement.id === 'peFielders';
  if(!ov){
    ov = document.createElement('div');
    ov.className = 'rp-overlay';
    ov.id = 'peOverlay';
    ov.addEventListener('click', function(e){ if(e.target === ov) closePaEditor(); });
    document.body.appendChild(ov);
  }
  var who = curNameForPa(pa);
  var type = PE_TYPES.filter(function(x){ return x.t === st.t; })[0];
  var isHit = /^(1B|2B|3B|HR)$/.test(st.t);

  var html = '<div class="rp-modal" role="dialog" aria-modal="true" aria-labelledby="peTitle">';
  html += '<div class="rp-hdr"><h3 id="peTitle">' + esc(who) + ' <span class="rp-hdr-sub">— ' + (pa.half === 'top' ? 'Top' : 'Bottom') + ' ' + pa.inn + '</span></h3>'
    + '<button class="inn-popover-close" style="position:static" onclick="closePaEditor()" aria-label="Close">&times;</button></div>';
  html += '<div class="rp-body">';

  html += '<div class="pe-field"><div class="pe-label">Result</div><div class="rp-opts">';
  PE_TYPES.forEach(function(x){
    html += '<button class="rp-opt' + (st.t === x.t ? ' sel' : '') + '" onclick="peSet(\'t\',\'' + x.t + '\')">' + esc(x.label || x.t) + '</button>';
  });
  html += '</div>';
  if(type && type.fielders){
    html += '<div class="pe-fielders"><label for="peFielders">Fielders</label><input id="peFielders" inputmode="numeric" placeholder="' + (st.t === 'G' || st.t === 'FC' ? 'e.g. 6-3' : 'e.g. 8') + '" value="' + esc(st.f) + '" oninput="peFieldersInput(this)" onkeydown="if(event.key===\'Escape\'){event.preventDefault();closePaEditor();}else if(event.key===\'Enter\'){event.preventDefault();savePaEditor();}" /></div>';
  }
  if(isHit){
    html += '<div class="pe-fielders"><button class="rp-opt' + (st.plusE ? ' sel' : '') + '" onclick="peSet(\'plusE\',' + !st.plusE + ')">+ error on the play</button></div>';
  }
  html += '<div class="pe-preview" id="pePreview">Scored as <b>' + esc(paLabel(peCompose(st))) + '</b></div></div>';

  html += '<div class="pe-field"><div class="pe-label">Got to</div><div class="rp-opts">';
  ['Didn\'t reach','1st','2nd','3rd','Scored'].forEach(function(lbl, r){
    html += '<button class="rp-opt' + (st.reached === r ? (r === 4 ? ' sel-score' : ' sel') : '') + '" onclick="peSet(\'reached\',' + r + ')">' + lbl + '</button>';
  });
  html += '</div></div>';

  html += '<div class="pe-field"><div class="pe-label">Runner on 2nd or 3rd</div><div class="rp-opts">';
  [[true, 'Yes'], [false, 'No']].forEach(function(o){
    html += '<button class="rp-opt' + (st.risp === o[0] ? ' sel' : '') + '" onclick="peSet(\'risp\',' + o[0] + ')">' + o[1] + '</button>';
  });
  if(st.risp === undefined) html += '<span class="pe-preview" style="margin:0 0 0 4px;align-self:center">Not recorded</span>';
  html += '</div></div>';

  html += '<div class="pe-field"><div class="pe-label">Out number</div><div class="rp-opts">';
  ['None','1','2','3'].forEach(function(lbl, o){
    html += '<button class="rp-opt' + (st.out === o ? (o ? ' sel-out' : ' sel') : '') + '" onclick="peSet(\'out\',' + o + ')">' + lbl + '</button>';
  });
  html += '</div></div>';

  html += '<div class="pe-note">Updates the scorecard and the batter/pitcher stats. Runners, outs and runs aren\'t replayed — fix those on the field or with Undo.</div>';
  html += '<div class="pe-actions"><button class="pe-remove" onclick="removePaFromEditor()">Remove</button>'
    + '<button class="pe-cancel" onclick="closePaEditor()">Cancel</button>'
    + '<button class="rp-confirm" onclick="savePaEditor()">Save</button></div>';
  html += '</div></div>';
  ov.innerHTML = html;

  var f = document.getElementById('peFielders');
  if(refocus && f){ f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
}

function savePaEditor(){
  if(!_peState) return;
  var st = _peState, pa = G.pas[st.idx];
  var newRes = peCompose(st);
  var type = PE_TYPES.filter(function(x){ return x.t === st.t; })[0];
  if(type && type.fielders && !st.f){
    var f = document.getElementById('peFielders');
    if(f) f.focus();
    kbFlash('Enter the fielder(s), e.g. ' + (st.t === 'G' ? '6-3' : '8'), '#BA7517');
    return;
  }
  saveState();
  if(st.risp !== undefined) pa.risp = st.risp;
  correctPa(pa, newRes, st.reached, st.out, 'Scorecard edit');
  closePaEditor();
  renderAll();
  saveToStorage();
}

// Change a recorded PA's result / bases / out number, keeping batter, pitcher
// and team totals and the inning popover in step. Caller takes the undo
// snapshot and re-renders. Shared by the cell editor and the MLB check.
function correctPa(pa, newRes, reached, out, logPrefix){
  var oldRes = pa.res;
  if(newRes !== oldRes){
    var bi = paBatterLogIdx(pa);
    applyPaStats(pa, -1);
    pa.res = newRes;
    pa.unearned = newRes[0] === 'E';
    applyPaStats(pa, 1);
    var key = (pa.half === 'top' ? 'T' : 'B') + pa.inn;
    var list = G.batterLog[pa.side][key];
    if(list && list[bi] !== undefined){
      var cut = list[bi].lastIndexOf(' — ');
      if(cut >= 0) list[bi] = list[bi].slice(0, cut + 3) + newRes;
    }
  }
  pa.reached = reached;
  pa.out = out;
  if(!out) pa.outOnBases = false;
  else if(!paIsOut(newRes)) pa.outOnBases = true;
  addLog(logPrefix + ': ' + curNameForPa(pa) + ' (' + (pa.half === 'top' ? 'T' : 'B') + pa.inn + ') '
    + (newRes !== oldRes ? paLabel(oldRes) + ' → ' + paLabel(newRes) : paLabel(newRes) + ' — bases/out corrected'), 'Edit', 't-info');
}

function removePaFromEditor(){
  if(!_peState) return;
  saveState();
  removePa(_peState.idx, 'Scorecard edit');
  closePaEditor();
  renderAll();
  saveToStorage();
}

// Remove a PA and back its result out of every total. Caller snapshots/renders.
function removePa(idx, logPrefix){
  var pa = G.pas[idx];
  applyPaStats(pa, -1);
  var bi = paBatterLogIdx(pa);
  var key = (pa.half === 'top' ? 'T' : 'B') + pa.inn;
  var list = G.batterLog[pa.side][key];
  if(list && list[bi] !== undefined) list.splice(bi, 1);
  G.pas.splice(idx, 1);
  addLog(logPrefix + ': removed ' + curNameForPa(pa) + ' ' + paLabel(pa.res) + ' (' + (pa.half === 'top' ? 'T' : 'B') + pa.inn + ')', 'Edit', 't-info');
}

function curNameForPa(pa){
  var sl = G.lineup[pa.side][pa.slot];
  var h = paHits(pa);
  for(var si = 0; si < sl.subs.length; si++){ if(sl.subs[si].hits === h) return sl.subs[si].name || 'Sub'; }
  return sl.name || 'Batter ' + (pa.slot + 1);
}

// One delegated listener for every cell (the grid re-renders constantly)
function setupScorecardDelegation(){
  var wrap = document.getElementById('scorecard');
  if(!wrap || wrap._peBound) return;
  wrap._peBound = true;
  function open(e){
    var cell = e.target.closest && e.target.closest('.sc-pa[data-pa]');
    if(!cell) return false;
    openPaEditor(parseInt(cell.dataset.pa, 10));
    return true;
  }
  wrap.addEventListener('click', open);
  wrap.addEventListener('keydown', function(e){
    if((e.key === 'Enter' || e.key === ' ') && open(e)) e.preventDefault();
  });
}

function showInningPopover(innIdx, evt){
  hideInningPopover();
  var innNum = innIdx + 1;
  var topKey = 'T' + innNum;
  var botKey = 'B' + innNum;
  var awaySide = 'away';
  var homeSide = 'home';
  var topBatters = G.batterLog[awaySide][topKey] || [];
  var botBatters = G.batterLog[homeSide][botKey] || [];

  if(topBatters.length === 0 && botBatters.length === 0) return;

  var awayName = team('away');
  var homeName = team('home');

  var html = '<button class="inn-popover-close" onclick="hideInningPopover()" aria-label="Close">&times;</button>';
  html += '<div class="inn-popover-title">Inning ' + innNum + '</div>';

  if(topBatters.length > 0){
    html += '<div class="inn-popover-half">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:2px">▲ ' + awayName + '</div>';
    topBatters.forEach(function(b){
      html += '<div class="inn-popover-batter">' + b + '</div>';
    });
    html += '</div>';
  }
  if(botBatters.length > 0){
    html += '<div class="inn-popover-half">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--amber);margin-bottom:2px">▼ ' + homeName + '</div>';
    botBatters.forEach(function(b){
      html += '<div class="inn-popover-batter">' + b + '</div>';
    });
    html += '</div>';
  }

  var pop = document.createElement('div');
  pop.className = 'inn-popover';
  pop.id = 'innPopover';
  pop.innerHTML = html;

  // Position near the clicked cell
  var rect = evt.target.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = (rect.bottom + 4) + 'px';
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 230)) + 'px';

  document.body.appendChild(pop);

  // Close on outside click
  setTimeout(function(){
    document.addEventListener('click', closePopoverOutside);
  }, 10);
}

function hideInningPopover(){
  var el = document.getElementById('innPopover');
  if(el) el.remove();
  document.removeEventListener('click', closePopoverOutside);
}

function closePopoverOutside(e){
  var pop = document.getElementById('innPopover');
  if(pop && !pop.contains(e.target)){
    hideInningPopover();
  }
}
