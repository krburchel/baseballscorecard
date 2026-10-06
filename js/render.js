// Rendering the live game: score strip, at-bat bar, play log, lineups, count, outs, infield, pitchers and the pitching-line editor.
// Loaded as a plain script; files share one global scope (see index.html for the order).

function renderAll(){
  renderScore();
  renderInn();
  renderCount();
  renderOuts();
  renderBases();
  renderLineup('home');
  renderLineup('away');
  renderPitchers('home');
  renderPitchers('away');
  renderLog();
  renderOutPanel();
  renderAtBatBar();
  restoreNotes();
  // Sync hitWithErr toggle UI
  var heb = document.getElementById('hitErrToggle');
  if(heb) heb.className = 'hit-err-toggle' + (hitWithErr ? ' on' : '');
  var heh = document.getElementById('hitErrHint');
  if(heh) heh.textContent = hitWithErr ? 'Next hit will also charge an E to fielding team' : '';
}

// ── Coalesced log rendering ──
// Multiple addLog() calls in a single play (e.g. "Ball 4", "Walk", "Run scores")
// would otherwise each trigger a full innerHTML rebuild. Batch them into one
// render per animation frame, which keeps the hot pitch path cheap on mobile.
var _logRenderScheduled = false;

function scheduleLogRender(){
  if(_logRenderScheduled) return;
  _logRenderScheduled = true;
  // rAF coalesces N calls in the current tick into one render next frame.
  // Fallback to setTimeout(0) for very old environments, though modern iOS
  // Safari and desktop browsers all have rAF.
  var schedule = window.requestAnimationFrame || function(cb){ return setTimeout(cb, 0); };
  schedule(function(){
    _logRenderScheduled = false;
    renderLog();
  });
}

var logFilter = { inn: '', cat: '' };

var logEditIdx = -1;

 // index into G.log currently being edited, -1 = none

function renderLog(){
  // If a frame-scheduled render was pending, this sync call satisfies it.
  _logRenderScheduled = false;
  var el = document.getElementById('logInner');
  var toggle = document.getElementById('logToggle');
  var filtersEl = document.getElementById('logFilters');
  if(!G.log.length){
    el.innerHTML = '<div class="empty-log">No plays logged yet</div>';
    if(toggle) toggle.style.display = 'none';
    if(filtersEl) filtersEl.style.display = 'none';
    return;
  }

  // Show filter bar
  if(filtersEl) filtersEl.style.display = '';

  // Update inning dropdown options
  var innSelect = document.getElementById('logFilterInn');
  if(innSelect){
    var innings = {};
    G.log.forEach(function(e){ if(e.inn) innings[e.inn] = true; });
    var innKeys = Object.keys(innings).sort(function(a, b){
      var na = parseInt(a.substring(1)), nb = parseInt(b.substring(1));
      if(na !== nb) return na - nb;
      return a < b ? -1 : 1; // T before B
    });
    var curVal = innSelect.value;
    innSelect.innerHTML = '<option value="">All innings</option>' + innKeys.map(function(k){
      return '<option value="'+k+'"'+(k===curVal?' selected':'')+'>'+k+'</option>';
    }).join('');
  }

  // Build filtered list with original indices
  var filtered = [];
  G.log.forEach(function(e, i){
    if(logFilter.inn && e.inn !== logFilter.inn) return;
    if(logFilter.cat && e.cat !== logFilter.cat) return;
    filtered.push({ entry: e, idx: i });
  });

  if(filtered.length === 0){
    el.innerHTML = '<div class="empty-log">No matching plays</div>';
  } else {
    el.innerHTML = filtered.map(function(f){
      var e = f.entry;
      var i = f.idx;

      if(i === logEditIdx){
        // Inline edit mode
        return '<div class="log-row log-editing">'
          + '<input class="log-edit-input" id="logEditInput" value="' + esc(e.text) + '" />'
          + '<span class="ltag ' + e.cls + '">' + e.tag + '</span>'
          + '<button class="log-edit-save" onclick="logEditSave()">Save</button>'
          + (logPaIndex(e) >= 0 ? '<button class="log-edit-play" onclick="logEditPlay(' + i + ')" title="Change the result, bases or out on the scorecard (stats follow)">Edit play</button>' : '')
          + '<button class="log-edit-del" onclick="logEditDelete(' + i + ')">Delete</button>'
          + '<button class="log-edit-cancel" onclick="logEditCancel()">Cancel</button>'
          + '</div>';
      }

      return '<div class="log-row log-cat-' + e.cat + '">'
        + '<span class="log-row-text">' + e.text + '</span>'
        + '<div class="log-row-actions">'
        + '<span class="ltag ' + e.cls + '">' + e.tag + '</span>'
        + '<button class="log-edit-btn" onclick="logEditStart(' + i + ')" title="Edit entry">✎</button>'
        + '</div>'
        + '</div>';
    }).join('');

    // Auto-focus the edit input if we just entered edit mode
    if(logEditIdx >= 0){
      var inp = document.getElementById('logEditInput');
      if(inp){
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
  }
  // Show toggle when log has enough entries to overflow
  if(toggle){
    toggle.style.display = G.log.length > 5 ? '' : 'none';
  }
}

function logEditStart(idx){
  logEditIdx = idx;
  renderLog();
}

function logEditCancel(){
  logEditIdx = -1;
  renderLog();
}

function logEditSave(){
  if(logEditIdx < 0 || logEditIdx >= G.log.length) return;
  var inp = document.getElementById('logEditInput');
  if(!inp) return;
  var newText = inp.value.trim();
  if(newText){
    G.log[logEditIdx].text = newText;
  }
  logEditIdx = -1;
  renderLog();
  saveToStorage();
}

// The scorecard plate appearance a log line records, or -1
function logPaIndex(entry){
  if(!entry || !entry.paId) return -1;
  for(var i = 0; i < G.pas.length; i++) if(G.pas[i].id === entry.paId) return i;
  return -1;
}

// "Edit play": the result belongs on the scorecard, where stats follow it
function logEditPlay(idx){
  var pi = logPaIndex(G.log[idx]);
  logEditIdx = -1;
  renderLog();
  if(pi >= 0) openPaEditor(pi);
}

// Deleting a result line asks whether the play itself should go too
function logEditDelete(idx){
  if(idx < 0 || idx >= G.log.length) return;
  var pi = logPaIndex(G.log[idx]);
  if(pi < 0){ deleteLogLine(idx); return; }
  var pa = G.pas[pi];
  showConfirm({
    title: 'Remove the play too?',
    message: 'This line records ' + curNameForPa(pa) + ': ' + paLabel(pa.res) + ' (' + (pa.half === 'top' ? 'T' : 'B') + pa.inn + '). Remove that plate appearance from the scorecard and stats as well?',
    confirmLabel: 'Remove play',
    cancelLabel: 'Just the log line',
    tone: 'warn'
  }).then(function(removePlay){
    var id = pa.id;
    deleteLogLine(idx);
    if(!removePlay) return;
    var at = -1;
    G.pas.forEach(function(q, i){ if(q.id === id) at = i; });
    if(at < 0) return;
    saveState();
    removePa(at, 'Log edit');
    renderAll();
    saveToStorage();
  });
}

function deleteLogLine(idx){
  if(idx < 0 || idx >= G.log.length) return;
  // Undo snapshots that already contained this entry now span one fewer
  var len = G.log.length;
  HISTORY = HISTORY.map(function(raw){
    var snap = JSON.parse(raw);
    var n = snap.G.logLen;
    if(n === undefined || idx < len - n) return raw;
    snap.G.logLen = n - 1;
    return JSON.stringify(snap);
  });
  G.log.splice(idx, 1);
  logEditIdx = -1;
  renderLog();
  saveToStorage();
}

var logExpanded = false;

function toggleLog(){
  logExpanded = !logExpanded;
  var el = document.getElementById('logInner');
  var toggle = document.getElementById('logToggle');
  if(logExpanded){
    el.classList.add('expanded');
    if(toggle) toggle.textContent = '▲ Collapse log';
  } else {
    el.classList.remove('expanded');
    if(toggle) toggle.textContent = '▼ Show full log';
  }
}

// Log filter event delegation
(function(){
  // Inning dropdown
  document.addEventListener('change', function(e){
    if(e.target.id === 'logFilterInn'){
      logFilter.inn = e.target.value;
      renderLog();
    }
  });
  // Category pill buttons
  document.addEventListener('click', function(e){
    if(e.target.classList && e.target.classList.contains('log-fpill')){
      var cat = e.target.dataset.filter;
      // Toggle: if already active, clear; otherwise set
      logFilter.cat = (logFilter.cat === cat) ? '' : cat;
      // Update pill active states
      var pills = document.querySelectorAll('.log-fpill');
      pills.forEach(function(p){ p.classList.toggle('active', p.dataset.filter === logFilter.cat); });
      renderLog();
    }
  });
  // Log edit input: Enter to save, Escape to cancel
  document.addEventListener('keydown', function(e){
    if(e.target.id === 'logEditInput'){
      if(e.key === 'Enter'){ e.preventDefault(); logEditSave(); }
      else if(e.key === 'Escape'){ e.preventDefault(); logEditCancel(); }
    }
  });
})();

// ── Haptic feedback ──
function haptic(ms){
  try { if(navigator.vibrate) navigator.vibrate(ms || 10); } catch(e){}
}

function badges(h){
  var b = '';
  var items = [
    { key:'s',   cls:'hb1',   label:'1B'      },
    { key:'d',   cls:'hb2',   label:'2B'      },
    { key:'t',   cls:'hb3',   label:'3B'      },
    { key:'hr',  cls:'hbhr',  label:'HR'      },
    { key:'bb',  cls:'hbbb',  label:'BB'      },
    { key:'hbp', cls:'hbhbp', label:'HBP'     },
    { key:'kl',  cls:'hbkl',  label:'&#x24C0;'},
    { key:'ks',  cls:'hbks',  label:'K'       },
    { key:'fo',  cls:'hbfo',  label:'F'       },
    { key:'go',  cls:'hbgo',  label:'G'       },
    { key:'sb',  cls:'hbsb',  label:'SB'      },
    { key:'cs',  cls:'hbcs',  label:'CS'      },
    { key:'err', cls:'hberr', label:'E'       },
    { key:'sf',  cls:'hbsf',  label:'SF'      },
    { key:'sac', cls:'hbsac', label:'SAC'     },
    { key:'fc',  cls:'hbfc',  label:'FC'      },
    { key:'ibb', cls:'hbibb', label:'IBB'     },
    { key:'wp',  cls:'hbwp',  label:'WP'      },
    { key:'r',   cls:'hbr',   label:'R'       },
    { key:'rbi', cls:'hbrbi', label:'RBI'     }
  ];
  items.forEach(function(it){
    if(h[it.key] > 0){
      b += '<span class="hbadge ' + it.cls + '">'
        + (h[it.key] > 1 ? h[it.key] : '')
        + it.label + '</span>';
    }
  });
  return b;
}

function playerOpts(side, selectedName, includeBlank) {
  var roster = ROSTERS[side];
  var html = includeBlank ? '<option value="">— Select player —</option>' : '';
  roster.forEach(function(p){
    var label = (p.jersey ? '#'+p.jersey+' ' : '') + p.name + ' ('+p.pos+')';
    html += '<option value="'+esc(p.name)+'"'+(p.name===selectedName?' selected':'')+'>'+label+'</option>';
  });
  if(!roster.length) html += '<option value="">No roster loaded</option>';
  return html;
}

function onPlayerSelect(side, slotIdx, val) {
  G.lineup[side][slotIdx].name = val;
  // auto-fill position from roster if blank
  var match = ROSTERS[side].filter(function(p){ return p.name===val; })[0];
  if(match && G.lineup[side][slotIdx].pos==='—') {
    G.lineup[side][slotIdx].pos = match.pos;
  }
  renderLineup(side);
}

function startSub(side,i){ G.lineup[side][i].pending=true; renderLineup(side); var el=document.getElementById(side+'_si_'+i)||document.getElementById(side+'_ss_'+i); if(el) el.focus(); }

function cancelSub(side,i){ G.lineup[side][i].pending=false; renderLineup(side); }

function confirmSub(side,i,subType){
  saveState();
  var st = subType || 'ph'; // default to pinch hitter
  // support both roster dropdown and free-text input
  var selEl = document.getElementById(side+'_ss_'+i);
  var inpEl = document.getElementById(side+'_si_'+i);
  var nm = selEl ? (selEl.value||'').trim() : (inpEl ? (inpEl.value||'').trim() : '');
  if(!nm){ if(selEl) selEl.focus(); else if(inpEl) inpEl.focus(); return; }
  var pos=(document.getElementById(side+'_sp_'+i)||{}).value||'—';
  // auto-fill position from roster if still blank
  if(pos==='—'){
    var match=ROSTERS[side].filter(function(p){return p.name===nm;})[0];
    if(match) pos=match.pos;
  }
  // For pinch runners, set position to PR
  if(st==='pr') pos='PR';
  var prev=curName(side,i);
  G.lineup[side][i].subs.push({name:nm,pos:pos,inning:G.inning,half:G.half,hits:mkHits(),subType:st});
  G.lineup[side][i].pending=false;
  var label = st==='pr' ? 'PR' : 'PH';
  addLog(nm+' ('+label+') replaces '+prev+' (spot '+(i+1)+')','Sub','t-sub');

  // If pinch runner, update the base they're on (replace the old runner name)
  if(st==='pr'){
    for(var bi=0;bi<3;bi++){
      if(G.bases[bi] && G.bases[bi] === prev){
        G.bases[bi] = nm;
        break;
      }
    }
    renderBases();
  }

  renderLineup(side);
  renderAtBatBar();
}

function renderLineup(side){
  scheduleScorecardRender();
  var panel=document.getElementById(side+'Lineup');
  var ab=side==='home'?G.homeBatter:G.awayBatter;
  var hasRoster = ROSTERS[side].length > 0;
  var isLoading = ROSTER_LOADING[side];
  var html='';
  for(var i=0;i<9;i++){
    var sl=G.lineup[side][i]; var hasSubs=sl.subs.length>0; var isActive=(i===ab);
    html+='<div class="lineup-slot">';
    html+='<div class="lineup-row'+(hasSubs?' dimmed':'')+'">';
    html+='<span class="bnum">'+(i+1)+'</span>';
    html+='<span class="ab-dot'+(isActive&&!hasSubs?'':' hidden')+'"></span>';
    html+='<select class="pos-sel" data-action="set-pos" data-side="'+side+'" data-idx="'+i+'"'+(hasSubs?' disabled':'')+'>'+posOpts(sl.pos)+'</select>';
    if(hasRoster && !hasSubs){
      html+='<select class="bname roster-sel" id="'+side+'_rs_'+i+'" data-action="select-player" data-side="'+side+'" data-idx="'+i+'">'
        +'<option value="">— Select player —</option>'
        +playerOpts(side, sl.name, false)
        +'</select>';
    } else if(isLoading && !hasSubs){
      html+='<input class="bname" value="'+esc(sl.name)+'" placeholder="Loading roster…" disabled />';
    } else {
      html+='<input class="bname" id="'+side+'_n_'+i+'" value="'+esc(sl.name)+'" placeholder="Player '+(i+1)+'"'+(hasSubs?' disabled':'')+' data-action="set-name" data-side="'+side+'" data-idx="'+i+'" />';
    }
    var hb=badges(sl.hits); if(hb) html+='<div class="hits">'+hb+'</div>';
    if(!hasSubs&&!sl.pending){ html+='<button class="set-btn" data-action="at-bat" data-side="'+side+'" data-idx="'+i+'">At bat</button><button class="sub-btn" data-action="start-sub" data-side="'+side+'" data-idx="'+i+'">Sub</button>'; }
    html+='</div>';
    for(var s=0;s<sl.subs.length;s++){
      var sub=sl.subs[s]; var isLast=(s===sl.subs.length-1); var inn=(sub.half==='top'?'T':'B')+sub.inning;
      html+='<div class="sub-row"><span class="sub-arrow">&#8627;</span><span class="sub-inn">'+inn+'</span>';
      html+='<select class="sub-pos" data-action="set-sub-pos" data-side="'+side+'" data-idx="'+i+'" data-sub="'+s+'">'+posOpts(sub.pos)+'</select>';
      html+='<input class="sub-name-el" value="'+esc(sub.name)+'" data-action="set-sub-name" data-side="'+side+'" data-idx="'+i+'" data-sub="'+s+'" />';
      var subBadges = sub.hits ? badges(sub.hits) : '';
      if(isLast){ if(subBadges) html+='<div class="hits">'+subBadges+'</div>'; html+='<span class="ab-dot'+(isActive&&isLast?'':' hidden')+'" style="margin-left:2px"></span>'; if(!sl.pending){ html+='<button class="set-btn" data-action="at-bat" data-side="'+side+'" data-idx="'+i+'">At bat</button><button class="sub-btn" data-action="start-sub" data-side="'+side+'" data-idx="'+i+'">Sub</button>'; } }
      else { if(subBadges) html+='<div class="hits">'+subBadges+'</div>'; }
      html+='</div>';
    }
    if(sl.pending){
      html+='<div class="sub-form"><span class="sub-form-lbl">&#8627; Sub in:</span>';
      html+='<select class="sub-form-pos" id="'+side+'_sp_'+i+'">'+posOpts('—')+'</select>';
      if(hasRoster){
        html+='<select class="sub-form-inp" id="'+side+'_ss_'+i+'"><option value="">— Select player —</option>'+playerOpts(side,'',false)+'</select>';
      } else {
        html+='<input class="sub-form-inp" id="'+side+'_si_'+i+'" placeholder="New player name" />';
      }
      html+='<button class="sub-ok" data-action="confirm-sub" data-side="'+side+'" data-idx="'+i+'" data-subtype="ph" title="Pinch Hitter">PH</button>';
      html+='<button class="sub-ok" style="border-color:var(--teal);color:var(--teal)" data-action="confirm-sub" data-side="'+side+'" data-idx="'+i+'" data-subtype="pr" title="Pinch Runner">PR</button>';
      html+='<button class="sub-cancel" data-action="cancel-sub" data-side="'+side+'" data-idx="'+i+'">Cancel</button>';
      html+='</div>';
    }
    html+='</div>';
  }
  panel.innerHTML=html;
}

function setAtBat(side, i){
  saveState();
  if(side === 'home') G.homeBatter = i;
  else G.awayBatter = i;
  addLog(curName(side, i) + ' up to bat', 'AB', 't-info');
  renderLineup(side);
  renderAtBatBar();
}

// Team pickers live in the box score's team cells. The table is rebuilt on every
// render, so park them first and put them back after (they keep their value).
function teamSelects(){ return { away: document.getElementById('teamAway'), home: document.getElementById('teamHome') }; }

// A native select is as wide as its longest option; size it to the chosen team instead
function sizeTeamSelect(sel){
  var c = sizeTeamSelect.c = sizeTeamSelect.c || document.createElement('canvas');
  var ctx = c.getContext && c.getContext('2d');
  if(!ctx || !window.getComputedStyle) return;
  var cs = getComputedStyle(sel), opt = sel.options[sel.selectedIndex];
  ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  sel.style.width = Math.ceil(ctx.measureText(opt ? opt.text : '').width + 22) + 'px';
}

function renderScore(){
  scheduleScorecardRender();
  var n = G.totalInnings;
  var tbl = document.getElementById('scoreTable');
  var sels = teamSelects(), holder = document.getElementById('teamSelHolder');
  ['away', 'home'].forEach(function(s){ if(sels[s] && holder && tbl.contains(sels[s])) holder.appendChild(sels[s]); });
  // Header row — clicking sets the inning AND shows the batter popover
  var hdr = '<thead><tr><th></th>';
  for(var i = 1; i <= n; i++){
    var hasData = (G.batterLog.away['T' + i] && G.batterLog.away['T' + i].length > 0)
              || (G.batterLog.home['B' + i] && G.batterLog.home['B' + i].length > 0);
    var dotHint = hasData ? '<span style="display:block;width:4px;height:4px;border-radius:50%;background:var(--blue);margin:2px auto 0;"></span>' : '';
    hdr += '<th id="h' + i + '" class="inning-cell' + (G.inning === i ? ' active-inn' : '') + '" onclick="setInning(' + i + ');showInningPopover(' + (i - 1) + ',event)">' + i + dotHint + '</th>';
  }
  hdr += '<th class="add-inn-cell"><button class="add-inn" onclick="addExtraInning()" title="Add an extra inning" aria-label="Add an extra inning">+</button></th>';
  hdr += '<th>R</th><th>H</th><th>E</th></tr></thead>';
  // Body rows
  var body = '<tbody>';
  ['away','home'].forEach(function(side){
    var tName = team(side);
    var logo = TEAM_LOGOS[tName] ? '<img src="' + TEAM_LOGOS[tName] + '" style="width:20px;height:20px;object-fit:contain;flex:none;" alt="" />' : '';
    var c = '<tr id="row-' + side + '"><td class="team-label"><span class="team-cell">' + logo
      + (sels[side] ? '<span class="team-sel-slot" data-side="' + side + '"></span>' : esc(tName)) + '</span></td>';
    for(var i = 0; i < n; i++){
      var v = G.scores[side][i];
      var a = (G.inning - 1) === i ? 'active-inn' : '';
      c += '<td class="inning-cell ' + a + '" onclick="editScore(\'' + side + '\',' + i + ',event)">' + (v === null ? '' : v) + '</td>';
    }
    c += '<td class="add-inn-cell"></td>';
    c += '<td class="total-cell">' + G.rhe[side][0] + '</td>';
    c += '<td class="total-cell">' + G.rhe[side][1] + '</td>';
    c += '<td class="total-cell">' + G.rhe[side][2] + '</td>';
    c += '</tr>';
    body += c;
  });
  body += '</tbody>';
  tbl.innerHTML = hdr + body;
  var slots = tbl.querySelectorAll('.team-sel-slot');
  for(var k = 0; k < slots.length; k++){
    var sel = sels[slots[k].getAttribute('data-side')];
    slots[k].appendChild(sel);
    sizeTeamSelect(sel);
  }
}

function renderInn(){
  document.getElementById('innNum').textContent = G.inning;
  var b = document.getElementById('halfPill');
  if(G.half === 'top'){
    b.textContent = 'Top';
    b.className = 'half-pill half-top';
  } else {
    b.textContent = 'Bot';
    b.className = 'half-pill half-bot';
  }
}

function renderCount(){
  for(var i = 0; i < 4; i++){
    document.getElementById('b' + i).className = 'dot ball' + (i < G.balls ? ' on' : '');
  }
  for(var i = 0; i < 2; i++){
    document.getElementById('s' + i).className = 'dot strike' + (i < G.strikes ? ' on' : '');
  }
  document.getElementById('f0').className = 'dot foul' + (G.fouls > 0 && G.strikes >= 2 ? ' on' : '');
  document.getElementById('foulNote').textContent = G.fouls > 0
    ? G.fouls + ' foul' + (G.fouls > 1 ? 's' : '') + ' this at-bat'
    : '';
  renderABSTally();
  renderAtBatBar();
}

function renderABSTally(){
  var el = document.getElementById('absTally');
  if(!el) return;
  if(!G.abs) { el.innerHTML = ''; return; }

  var parts = [];
  ['away','home'].forEach(function(side){
    var a = G.abs[side];
    if(!a || a.challenged === 0) return;
    var tName = team(side);
    var won = a.overturned;
    var lost = a.challenged - a.overturned;
    parts.push(tName + ': <span class="abs-tally-won">' + won + '✓</span> / <span class="abs-tally-lost">' + lost + '✕</span>');
  });

  el.innerHTML = parts.length > 0 ? 'ABS: ' + parts.join(' · ') : '';
}

function renderOuts(){
  for(var i = 0; i < 3; i++){
    document.getElementById('o' + i).className = 'dot out' + (i < G.outs ? ' on' : '');
  }
}

function renderBases(){
  syncPaBases();
  scheduleScorecardRender();
  var el = document.getElementById('infield');
  if(el) el.innerHTML = infieldSVG();
}

// ── Infield drawing (Bases card) ──
// To scale in feet: home at (0,0), 90 ft base paths, mound at 60 ft 6 in, infield
// dirt arc 95 ft around the rubber. Runners sit on the bases with name tags; each
// base is a button that adds or removes a runner (toggleBase).
var IF_BASES = [[63.64, 63.64], [0, 127.28], [-63.64, 63.64]];

 // 1B, 2B, 3B
var IF_VB = [-128, -176, 256, 210];

                              // feet, SVG coords (y down)
var IF_PX = 260;

                                                 // typical drawn width in CSS px (sizes the labels)
function ifP(x, y){ return Math.round(x * 10) / 10 + ',' + Math.round(-y * 10) / 10; }

function infieldSVG(){
  var k = IF_VB[2] / IF_PX;                 // feet per CSS px, to size labels in px
  var lpX = -280, rpX = 280;                // foul lines run off the drawing
  var s = '<svg viewBox="' + IF_VB.join(' ') + '" role="group" aria-label="Infield">';
  s += '<defs><clipPath id="ifFair"><polygon points="' + ifP(0, 0) + ' ' + ifP(lpX, -lpX) + ' ' + ifP(rpX, rpX) + '"/></clipPath></defs>';
  s += '<rect x="' + IF_VB[0] + '" y="' + IF_VB[1] + '" width="' + IF_VB[2] + '" height="' + IF_VB[3] + '" fill="var(--field-foul)"/>';
  s += '<polygon points="' + ifP(0, 0) + ' ' + ifP(lpX, -lpX) + ' ' + ifP(rpX, rpX) + '" fill="var(--field-grass)"/>';
  s += '<circle cx="0" cy="-60.5" r="95" fill="var(--field-dirt)" clip-path="url(#ifFair)"/>';
  s += '<polygon points="' + ifP(0, 13) + ' ' + ifP(50.6, 63.64) + ' ' + ifP(0, 114.28) + ' ' + ifP(-50.6, 63.64) + '" fill="var(--field-grass)"/>';
  s += '<circle cx="0" cy="0" r="13" fill="var(--field-dirt)"/>';
  s += '<circle cx="0" cy="-60.5" r="9" fill="var(--field-dirt)"/><rect x="-1.5" y="-61" width="3" height="1" fill="var(--field-chalk)"/>';
  s += '<line x1="0" y1="0" x2="' + lpX + '" y2="' + lpX + '" stroke="var(--field-chalk)" stroke-width="1"/>';
  s += '<line x1="0" y1="0" x2="' + rpX + '" y2="' + (-rpX) + '" stroke="var(--field-chalk)" stroke-width="1"/>';
  var b = 7;
  // home plate: point toward the catcher, flat edge toward the pitcher
  s += '<polygon points="' + ifP(-b / 2, b * 0.9) + ' ' + ifP(b / 2, b * 0.9) + ' ' + ifP(b / 2, b * 0.4) + ' ' + ifP(0, 0) + ' ' + ifP(-b / 2, b * 0.4) + '" fill="var(--field-chalk)"/>';
  IF_BASES.forEach(function(q, i){
    var occ = baseOcc(i), name = occ && typeof G.bases[i] === 'string' && G.bases[i] !== '?' ? shortName(G.bases[i]) : '';
    var label = ['First', 'Second', 'Third'][i] + ' base: ' + (occ ? (name || 'runner') + ' on. Tap to clear' : 'empty. Tap to put a runner on');
    s += '<g class="if-base" data-base="' + (i + 1) + '" role="button" tabindex="0" aria-label="' + esc(label) + '">';
    s += '<circle cx="' + q[0] + '" cy="' + (-q[1]) + '" r="24" fill="transparent"/>';
    s += '<rect x="' + (q[0] - b / 2) + '" y="' + (-q[1] - b / 2) + '" width="' + b + '" height="' + b + '" fill="var(--field-chalk)" transform="rotate(45 ' + q[0] + ' ' + (-q[1]) + ')"/>';
    if(occ){
      var r = 11 * k;
      s += '<circle cx="' + q[0] + '" cy="' + (-q[1]) + '" r="' + r + '" fill="var(--amber)" stroke="var(--surface)" stroke-width="' + (2 * k) + '"/>';
      if(name){
        var t = 11 * k, tw = (name.length * 0.56 * t) + 10 * k, th = t * 1.6;
        var ly = i === 1 ? -q[1] - r - 3 * k - th : -q[1] + r + 3 * k;
        var lx = Math.max(IF_VB[0] + 2, Math.min(IF_VB[0] + IF_VB[2] - tw - 2, q[0] - tw / 2));
        s += '<rect x="' + lx + '" y="' + ly + '" width="' + tw + '" height="' + th + '" rx="' + th / 2 + '" fill="var(--surface)" opacity=".92"/>';
        s += '<text x="' + (lx + tw / 2) + '" y="' + (ly + th / 2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + t + '" font-weight="600" fill="var(--text)">' + esc(name) + '</text>';
      }
    }
    s += '</g>';
  });
  return s + '</svg>';
}

// Taps / Enter / Space on a base toggle a runner (bound once; the SVG re-renders)
function setupInfieldDelegation(){
  var el = document.getElementById('infield');
  if(!el || el._bound) return;
  el._bound = true;
  function hit(e){
    var g = e.target.closest && e.target.closest('.if-base');
    if(!g) return false;
    var b = +g.dataset.base;
    toggleBase(b);
    var again = el.querySelector('.if-base[data-base="' + b + '"]');
    if(again && e.type === 'keydown') again.focus();
    return true;
  }
  el.addEventListener('click', hit);
  el.addEventListener('keydown', function(e){
    if((e.key === 'Enter' || e.key === ' ') && hit(e)) e.preventDefault();
  });
}

function setActivePitcher(side, idx){
  saveState();
  G.pitchers[side].forEach(function(p, i){
    p.active = (i === idx);
  });
  var name = G.pitchers[side][idx].name || 'P' + (idx + 1);
  addLog(name + ' pitching for ' + team(side), 'P', 't-info');
  renderPitchers(side);
  renderAtBatBar();
}

function pitcherOpts(side, selectedName) {
  var pitchers = ROSTERS[side].filter(function(p){ return p.pos==='P' || p.pos==='SP' || p.pos==='RP'; });
  if(!pitchers.length) return null; // no roster loaded — fall back to text input
  var html = '<option value="">— Select pitcher —</option>';
  pitchers.forEach(function(p){
    var label = (p.jersey ? '#'+p.jersey+' ' : '') + p.name;
    html += '<option value="'+esc(p.name)+'"'+(p.name===selectedName?' selected':'')+'>'+label+'</option>';
  });
  return html;
}

function renderPitchers(side){
  var panel=document.getElementById(side+'PitcherPanel');
  var pp=G.pitchers[side];
  var tName=team(side);
  var logo=TEAM_LOGOS[tName]?'<img src="'+TEAM_LOGOS[tName]+'" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:6px;" alt="" />':'';
  var html='<div class="ph">'+logo+'<span>'+tName+'</span><span class="ph-hint">tap row to set active</span></div>';
  pp.forEach(function(p,i){
    var a=p.active;
    var opts = pitcherOpts(side, p.name);
    html+='<div class="prow'+(a?' active-p':'')+'" data-action="set-active-p" data-side="'+side+'" data-pidx="'+i+'">';
    html+='<span class="p-dot'+(a?'':' hidden')+'"></span>';
    if(opts !== null){
      html+='<select class="p-name-sel" data-action="set-p-name" data-side="'+side+'" data-pidx="'+i+'">'+opts+'</select>';
    } else {
      html+='<input class="p-name" value="'+esc(p.name)+'" placeholder="Pitcher '+(i+1)+'" data-action="set-p-name" data-side="'+side+'" data-pidx="'+i+'" />';
    }
    html+='<span class="pc'+pitchCountClass(p.pitches)+'" id="'+side+'pc'+i+'">'+p.pitches+'</span>';
    html+='<div class="p-line" id="'+side+'pl'+i+'" data-action="edit-p-line" data-side="'+side+'" data-pidx="'+i+'" role="button" tabindex="0" title="Tap to edit this pitching line">'+pitchingLine(p)+'</div>';
    html+='<div class="padj"><button class="pb" data-action="adj-p" data-side="'+side+'" data-pidx="'+i+'" data-dir="-1">−</button><button class="pb" data-action="adj-p" data-side="'+side+'" data-pidx="'+i+'" data-dir="1">+</button></div>';
    html+='</div>';
  });
  html+='<div class="add-p" data-action="add-p" data-side="'+side+'"><span style="font-size:16px;margin-right:4px">+</span>Add pitcher</div>';
  var chk = staffOutsCheck(side);
  if(chk) html+='<div class="p-warn">⚠ Innings pitched add up to '+fmtIP(chk.credited)+', but this team has recorded '+fmtIP(chk.expected)+'. Tap a pitching line to fix it.</div>';
  panel.innerHTML=html;
}

// Innings pitched in baseball notation: 17 outs → "5.2"
// Outs the fielding side has actually recorded (3 per completed half it
// fielded, plus the current half's outs) vs. the outs credited to its
// pitchers. Returns null when they agree or the game is over (final halves
// can end early, so they're not checked).
function staffOutsCheck(side){
  if(G.log.some(function(l){ return l.tag === 'Final'; })) return null;
  var completed = side === 'home'
    ? (G.half === 'bot' ? G.inning : G.inning - 1)  // home fields the top halves
    : G.inning - 1;                                   // away fields the bottoms
  var expected = completed * 3 + (fielding() === side ? G.outs : 0);
  var credited = G.pitchers[side].reduce(function(n, p){ return n + (p.outs || 0); }, 0);
  return expected === credited ? null : { expected: expected, credited: credited };
}

function fmtIP(outs){ return Math.floor(outs / 3) + '.' + (outs % 3); }

function pitchStrikes(p){ return Math.max(0, p.pitches - (p.balls || 0)); }

// "5.2 IP · 4 H · 2 R · 1 ER · 1 BB · 7 K · 1 HR · 88-57"
function pitchingLine(p){
  if(!p.pitches && !p.outs) return '';
  var parts = [fmtIP(p.outs) + ' IP', p.h + ' H', p.r + ' R', p.er + ' ER', p.bb + ' BB', p.k + ' K'];
  if(p.hr > 0) parts.push(p.hr + ' HR');
  parts.push('<span title="Pitches-strikes">' + p.pitches + '-' + pitchStrikes(p) + '</span>');
  return parts.join(' · ');
}

// ── Pitching line editor ──
// Hand corrections for a pitcher's line (e.g. plays recorded before the app
// tracked IP/H per pitcher, or the official scorer changing a call).
var PLE_FIELDS = [
  {k:'outs', label:'IP'}, {k:'h', label:'H'}, {k:'r', label:'R'}, {k:'er', label:'ER'},
  {k:'bb', label:'BB'}, {k:'k', label:'K'}, {k:'hr', label:'HR'}
];

var _pleState = null;

 // {side, idx}

// "5.1" → 16 outs; null if it isn't baseball IP notation
function parseIP(str){
  var m = /^\s*(\d+)(?:\.([012]))?\s*$/.exec(str || '');
  return m ? parseInt(m[1], 10) * 3 + (m[2] ? parseInt(m[2], 10) : 0) : null;
}

function openPitchLineEditor(side, idx){
  var p = G.pitchers[side][idx];
  if(!p) return;
  closePitchLineEditor();
  _pleState = { side: side, idx: idx };
  var ov = document.createElement('div');
  ov.className = 'rp-overlay';
  ov.id = 'pleOverlay';
  ov.addEventListener('click', function(e){ if(e.target === ov) closePitchLineEditor(); });

  var chk = staffOutsCheck(side);
  var html = '<div class="rp-modal" role="dialog" aria-modal="true" aria-labelledby="pleTitle">';
  html += '<div class="rp-hdr"><h3 id="pleTitle">' + esc(p.name || 'Pitcher ' + (idx + 1)) + ' <span class="rp-hdr-sub">— ' + esc(team(side)) + '</span></h3>'
    + '<button class="inn-popover-close" style="position:static" onclick="closePitchLineEditor()" aria-label="Close">&times;</button></div>';
  html += '<div class="rp-body"><div class="ple-grid">';
  PLE_FIELDS.forEach(function(f){
    var v = f.k === 'outs' ? fmtIP(p.outs || 0) : (p[f.k] || 0);
    html += '<label>' + f.label + '<input id="ple_' + f.k + '" value="' + v + '" inputmode="' + (f.k === 'outs' ? 'decimal' : 'numeric') + '" autocomplete="off"'
      + ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();savePitchLineEditor();}else if(event.key===\'Escape\'){event.preventDefault();closePitchLineEditor();}" /></label>';
  });
  html += '</div>';
  html += '<div class="pe-note">IP uses baseball notation: 5.1 = 5⅓ innings, 5.2 = 5⅔.'
    + (chk ? ' This team has recorded <b>' + fmtIP(chk.expected) + '</b> innings of outs so far; its pitchers are credited with ' + fmtIP(chk.credited) + '.' : '')
    + ' Pitch counts are changed with − / + on the row.</div>';
  html += '<div class="pe-actions"><button class="pe-cancel" onclick="closePitchLineEditor()">Cancel</button>'
    + '<button class="rp-confirm" onclick="savePitchLineEditor()">Save</button></div>';
  html += '</div></div>';
  ov.innerHTML = html;
  document.body.appendChild(ov);
  var first = document.getElementById('ple_outs');
  if(first){ first.focus(); first.select(); }
}

function closePitchLineEditor(){
  _pleState = null;
  var ov = document.getElementById('pleOverlay');
  if(ov) ov.remove();
}

function savePitchLineEditor(){
  if(!_pleState) return;
  var side = _pleState.side, p = G.pitchers[side][_pleState.idx];
  var vals = {}, bad = null;
  PLE_FIELDS.forEach(function(f){
    var inp = document.getElementById('ple_' + f.k);
    inp.classList.remove('bad');
    var v = f.k === 'outs' ? parseIP(inp.value) : (/^\s*\d+\s*$/.test(inp.value) ? parseInt(inp.value, 10) : null);
    if(v === null){ inp.classList.add('bad'); bad = bad || inp; }
    vals[f.k] = v;
  });
  if(bad){
    bad.focus();
    kbFlash(bad.id === 'ple_outs' ? 'IP like 5, 5.1 or 5.2' : 'Whole numbers only', '#BA7517');
    return;
  }
  if(vals.er > vals.r){
    var er = document.getElementById('ple_er');
    er.classList.add('bad');
    er.focus();
    kbFlash('ER can\'t be more than R', '#BA7517');
    return;
  }
  var changes = [];
  PLE_FIELDS.forEach(function(f){
    var old = p[f.k] || 0;
    if(vals[f.k] !== old){
      changes.push(f.label + ' ' + (f.k === 'outs' ? fmtIP(old) + '→' + fmtIP(vals[f.k]) : old + '→' + vals[f.k]));
    }
  });
  closePitchLineEditor();
  if(!changes.length) return;
  saveState();
  PLE_FIELDS.forEach(function(f){ p[f.k] = vals[f.k]; });
  addLog('Pitching line edited: ' + (p.name || 'Pitcher') + ' — ' + changes.join(', '), 'Edit', 't-info');
  renderPitchers(side);
  saveToStorage();
}

function adj(side, i, d){
  G.pitchers[side][i].pitches = Math.max(0, G.pitchers[side][i].pitches + d);
  var n = G.pitchers[side][i].pitches;
  var el = document.getElementById(side + 'pc' + i);
  if(el){
    el.textContent = n;
    el.className = 'pc' + pitchCountClass(n);
  }
  schedulePitchLines();
}

function addPitcher(side){
  var p = mkPitcher();
  p.active = false;
  G.pitchers[side].push(p);
  renderPitchers(side);
}
