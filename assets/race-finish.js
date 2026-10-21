/* The finish screen for solo races (story levels, Grand Prix, daily and drawn tracks; rooms keep their shared card).
   race.js calls RaceFinish.show(RaceEngine) after the line. It shows a photo of your car taken at the finish, your place,
   time and best lap, a new-record banner, F1 points or story stars, the race classification and the best times for
   this race, then Next race / Race again / Menu.

   Records: every finish is posted to the global race board (Cloudflare D1, worker/src/boards.ts) and kept on this
   device; if the table is not there yet the device copy is used alone. */
(function () {
  'use strict';
  var POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
  var el = null;

  function fmt(ms) { if (!ms || ms <= 0) return '—'; var s = Math.floor(ms / 1000), m = Math.floor(s / 60), c = Math.floor((ms % 1000) / 10); return m + ':' + String(s % 60).padStart(2, '0') + '.' + String(c).padStart(2, '0'); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function myName() { try { return (localStorage.getItem('sl_name') || '').trim(); } catch (e) { return ''; } }

  // ---------- records: the global race board (Cloudflare D1, via assets/boards-api.js) ----------
  var DB = {
    submit: function (r) { return window.Boards ? Boards.post('race', r) : Promise.resolve(false); },
    // {top: global best per player, mine: this player's attempts, rank, players}
    board: function (track, mode, laps, name) { return window.Boards ? Boards.get('race', { track: track, mode: mode, laps: laps, name: name }) : Promise.resolve(null); }
  };

  function close() { if (el) { el.remove(); el = null; } try { window.RaceEngine.closeResultsModal(); } catch (e) {} }
  function goMenu() { location.href = location.origin + location.pathname; }

  function show(RE) {
    close();
    var ctx = window.__raceCtx || { track: 'unknown', name: 'Race', mode: 'race', laps: RE.totalLaps };
    var pos = RE.finalPosition || 1, total = RE.totalRaceTime, lap = RE.bestLapTime, laps = RE.totalLaps;
    var board = (RE.leaderboard || []).filter(function (r) { return r && typeof r === 'object' && r.name; });
    var field = board.length || (ctx.rivals || 0) + 1;
    var photo = window.__carPhoto ? window.__carPhoto() : null;
    var story = ctx.mode === 'story' ? window.__storyResult : null;
    var name = myName();

    // personal records on this device: total for this exact race, best lap on this track
    var kRace = 'rr:' + ctx.track + '|' + ctx.mode + '|' + laps, kLap = 'rrlap:' + ctx.track;
    var prevRace = lsGet(kRace), prevLap = lsGet(kLap);
    var newRace = total && (!prevRace || total < prevRace.ms), newLap = lap && (!prevLap || lap < prevLap.ms);
    if (newRace) lsSet(kRace, { ms: total, lap: lap, pos: pos, at: Date.now() });
    if (newLap) lsSet(kLap, { ms: lap, at: Date.now() });
    var hist = lsGet('rrlist:' + ctx.track + '|' + ctx.mode + '|' + laps) || [];
    hist.push({ name: name || 'You', ms: total, best_lap_ms: lap, pos: pos, field: field, me: 1 }); hist.sort(function (a, b) { return a.ms - b.ms; }); hist = hist.slice(0, 10);
    lsSet('rrlist:' + ctx.track + '|' + ctx.mode + '|' + laps, hist);

    var winner = board.filter(function (r) { return r.position === 1; })[0];
    var gap = pos > 1 && winner && winner.finishTime && total ? '+' + ((total - winner.finishTime) / 1000).toFixed(2) + ' s' : pos === 1 && field > 1 ? 'Winner' : '';
    var title = ctx.mode === 'gp' ? ctx.name + ' Grand Prix' : ctx.mode === 'story' && story ? 'Level ' + story.n + ' · ' + story.name : ctx.name;
    var accent = ctx.mode === 'gp' ? '#e10600' : ctx.mode === 'story' ? '#e8a317' : '#4d8dff';

    // what Next race means here
    var next = null;
    if (story && story.next) next = { label: 'Level ' + story.next, go: function () { close(); window.Story.play(story.next); } };
    else if (ctx.mode === 'gp' && window.F1) { var L = F1.list(), i = L.findIndex(function (c) { return c.id === ctx.f1; }), nc = L[(i + 1) % L.length];
      next = { label: nc.country, go: function () { close(); F1.ready(nc.id, function () { window.__f1GP = true; F1.build(nc.id, { race: true, laps: ctx.laps || 5 }); }); } }; }
    var again = function () { close();
      if (story) window.Story.play(story.n);
      else { if (ctx.mode === 'gp') window.__f1GP = true; if (window.restartSoloRace) window.restartSoloRace(); } };

    var banners = '';
    if (newRace && prevRace) banners += '<span class="rf-b gold">New record <i>' + ((prevRace.ms - total) / 1000).toFixed(2) + ' s faster</i></span>';
    else if (newRace) banners += '<span class="rf-b gold">First time set</span>';
    if (newLap && prevLap) banners += '<span class="rf-b">Fastest lap here</span>';
    if (story) banners += story.cleared ? '<span class="rf-b ok">Level cleared' + (story.unlocked ? ' <i>level ' + story.unlocked + ' unlocked</i>' : '') + '</span>' : '<span class="rf-b no">Finish ' + ord(story.target) + ' or better to clear</span>';

    var stats = [['Race time', fmt(total)], ['Best lap', fmt(lap)]];
    if (ctx.mode === 'gp') stats.push(['Points', String(POINTS[pos - 1] || 0)]);
    if (story) stats.push(['Stars', '<span class="rf-stars">' + '★'.repeat(story.stars) + '<i>' + '★'.repeat(3 - story.stars) + '</i></span>']);
    if (gap && pos > 1 && stats.length < 3) stats.push(['Gap to winner', gap]);

    // timing tower: the top of the field and you, with team colour slivers and three-letter codes
    var colors = window.__driverColors || {}, wt = winner && winner.finishTime;
    var rows = board.slice().sort(function (a, b) { return (a.position || 99) - (b.position || 99); });
    var shown = rows.filter(function (r, k) { return k < 6 || r.isMe; });
    var code = function (n) { return String(n || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DRV'; };
    var tower = shown.map(function (r) { var done = !r.racing && r.finishTime, c = r.isMe ? accent : '#' + ((colors[r.name] != null ? colors[r.name] : 0x5a5f69) >>> 0).toString(16).padStart(6, '0');
      var t = r.racing ? 'On track' : !done ? 'DNF' : r.position === 1 || !wt ? fmt(r.finishTime) : '+' + ((r.finishTime - wt) / 1000).toFixed(3);
      return '<li' + (r.isMe ? ' class="me"' : '') + '><b>' + (done ? r.position : '·') + '</b><i style="background:' + c + '"></i><span class="cd">' + esc(r.isMe ? code(name || 'You') : code(r.name)) + '</span><span class="nm">' + esc(r.isMe ? (name || 'You') : r.name) + '</span><span class="tm">' + t + '</span></li>'; }).join('');

    el = document.createElement('div'); el.id = 'rfin';
    
    var CF = '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",Poppins,"Helvetica Neue",Arial,sans-serif';
    el.innerHTML = '<style>' +
      '#rfin{--ac:' + accent + ';position:fixed;inset:0;z-index:2147482500;color:#f3f3f1;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#07080a;overflow:hidden;animation:rfFade .5s ease both}' +
      '@keyframes rfFade{from{opacity:0}}@keyframes rfSettle{from{transform:scale(1.07)}to{transform:scale(1)}}@keyframes rfRise{from{opacity:0;transform:translateY(18px)}}@keyframes rfGlow{0%{box-shadow:0 0 0 0 rgba(232,163,23,.55)}100%{box-shadow:0 0 0 14px rgba(232,163,23,0)}}' +
      '#rfin .bg{position:absolute;inset:0;background:#111 center/cover no-repeat;animation:rfSettle 2.4s cubic-bezier(.2,.7,.2,1) both}' +
      '#rfin .bg::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,8,10,.15) 0%,rgba(7,8,10,.35) 42%,rgba(7,8,10,.92) 62%,#07080a 100%),linear-gradient(0deg,rgba(7,8,10,.9) 0%,rgba(7,8,10,0) 40%)}' +
      '#rfin .hero{position:absolute;left:clamp(20px,5vw,72px);bottom:clamp(24px,7vh,80px);max-width:46vw;animation:rfRise .7s .2s both}' +
      '#rfin .hero .ev{font:600 15px/1.2 ' + CF + ';letter-spacing:.04em;color:rgba(243,243,241,.72);display:flex;align-items:center;gap:10px}' +
      '#rfin .hero .ev::before{content:"";width:28px;height:3px;background:var(--ac)}' +
      '#rfin .hero .p{font:italic 800 clamp(120px,19vw,240px)/.78 ' + CF + ';letter-spacing:-.02em;margin:14px 0 6px;text-shadow:0 10px 40px rgba(0,0,0,.45)}' +
      '#rfin .hero .p small{font-size:.32em;font-style:normal;font-weight:600;color:rgba(243,243,241,.55);margin-left:.2em;letter-spacing:0}' +
      '#rfin .hero h1{margin:0;font:700 clamp(24px,2.6vw,34px)/1.1 ' + CF + ';letter-spacing:.01em}' +
      '#rfin .pn{position:absolute;top:0;right:0;bottom:0;width:min(470px,100%);padding:clamp(22px,5vh,52px) clamp(20px,3vw,40px);display:flex;flex-direction:column;gap:22px;overflow-y:auto;animation:rfRise .7s .35s both}' +
      '#rfin .rf-bs{display:flex;flex-wrap:wrap;gap:8px}#rfin .rf-b{font:600 13px/1 -apple-system,sans-serif;padding:8px 12px;border-radius:99px;border:1px solid rgba(255,255,255,.14);color:rgba(243,243,241,.9)}#rfin .rf-b i{font-style:normal;opacity:.7;margin-left:4px}' +
      '#rfin .rf-b.gold{border-color:transparent;background:linear-gradient(135deg,#f6c453,#d99a12);color:#1d1404;animation:rfGlow 1.4s .9s ease-out 2}#rfin .rf-b.ok{border-color:rgba(84,190,120,.5);color:#9fe0b4}#rfin .rf-b.no{border-color:rgba(225,6,0,.5);color:#ff8f8a}' +
      '#rfin .st{display:grid;grid-template-columns:repeat(' + Math.min(stats.length, 3) + ',minmax(0,1fr));border-top:1px solid rgba(255,255,255,.12);border-bottom:1px solid rgba(255,255,255,.12)}' +
      '#rfin .st div{padding:14px 0 13px;padding-left:14px;border-left:1px solid rgba(255,255,255,.08)}#rfin .st div:first-child{padding-left:0;border-left:0}' +
      '#rfin .st span{display:block;font-size:12px;color:rgba(243,243,241,.5)}#rfin .st b{display:block;margin-top:4px;font:700 clamp(22px,2.1vw,28px)/1 ' + CF + ';font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:clip}' +
      '#rfin .rf-stars{color:#f0b429;letter-spacing:2px}#rfin .rf-stars i{font-style:normal;color:rgba(255,255,255,.16)}' +
      '#rfin h3{margin:0 0 8px;font:600 13px/1 -apple-system,sans-serif;color:rgba(243,243,241,.55)}' +
      '#rfin ol{list-style:none;margin:0;padding:0}#rfin li{display:grid;grid-template-columns:26px 4px 44px 1fr auto;align-items:center;gap:10px;height:38px;padding:0 10px 0 4px;font-size:14px;font-variant-numeric:tabular-nums;border-radius:6px}' +
      '#rfin li+li{margin-top:2px}#rfin li b{font:700 17px/1 ' + CF + ';text-align:right;color:rgba(243,243,241,.85)}#rfin li i{height:20px;border-radius:2px}' +
      '#rfin li .cd{font:700 16px/1 ' + CF + ';letter-spacing:.06em}#rfin li .nm{color:rgba(243,243,241,.5);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#rfin li .tm{font:600 15px/1 ' + CF + ';color:rgba(243,243,241,.8)}' +
      '#rfin li:nth-child(odd){background:rgba(255,255,255,.035)}#rfin li.me{background:linear-gradient(90deg,color-mix(in srgb,var(--ac) 30%,transparent),rgba(255,255,255,.03));}#rfin li.me .nm{color:#f3f3f1}' +
      '#rfin .rf-src{font-size:11.5px;color:rgba(243,243,241,.38);margin-top:6px}#rfin .rf-rank{float:right;color:#f3f3f1;font-weight:700}' +
      '#rfin .rf-name{display:flex;gap:8px}#rfin .rf-name input{flex:1;min-width:0;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#fff;font:inherit;font-size:14px}' +
      '#rfin .acts{display:flex;gap:10px;margin-top:auto;padding-top:4px}' +
      '#rfin button{all:unset;box-sizing:border-box;cursor:pointer;height:48px;padding:0 20px;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font:600 15px/1 -apple-system,sans-serif;border:1px solid rgba(255,255,255,.16);color:#f3f3f1;transition:background .15s,border-color .15s,transform .15s}' +
      '#rfin button:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.28)}#rfin button:active{transform:scale(.98)}' +
      '#rfin button.go{flex:1;background:var(--ac);border-color:transparent;color:#fff}#rfin button.go:hover{filter:brightness(1.08);background:var(--ac)}#rfin button:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
      '#rfin .rf-name button{height:auto}' +
      '@media (max-width:820px){#rfin{overflow-y:auto}#rfin .bg{position:relative;height:46vh}#rfin .bg::after{background:linear-gradient(0deg,#07080a 0%,rgba(7,8,10,0) 70%)}#rfin .hero{bottom:auto;top:calc(46vh - 150px);max-width:none}#rfin .hero .p{font-size:110px}#rfin .pn{position:relative;width:auto;overflow:visible}}' +
      '@media (prefers-reduced-motion:reduce){#rfin,#rfin .bg,#rfin .hero,#rfin .pn,#rfin .rf-b.gold{animation:none}}' +
      '</style>' +
      '<div class="bg"' + (photo ? ' style="background-image:url(' + photo + ')"' : '') + '></div>' +
      '<div class="hero"><div class="ev">' + esc(ctx.mode === 'gp' ? 'Grand Prix' : ctx.mode === 'story' && story ? story.chapter + ' · Level ' + story.n : ctx.mode === 'daily' ? 'Daily track' : 'Race') + ' · ' + laps + ' lap' + (laps > 1 ? 's' : '') + '</div>' +
        '<div class="p">P' + pos + (field > 1 ? '<small>/' + field + '</small>' : '') + '</div><h1>' + esc(ctx.mode === 'story' && story ? story.name : ctx.name) + '</h1></div>' +
      '<div class="pn">' + (banners ? '<div class="rf-bs">' + banners + '</div>' : '') +
      '<div class="st">' + stats.slice(0, 3).map(function (x) { return '<div><span>' + x[0] + '</span><b>' + x[1] + '</b></div>'; }).join('') + '</div>' +
      (tower && field > 1 ? '<div><h3>Classification</h3><ol>' + tower + '</ol></div>' : '') +
      '<div><h3>Global leaderboard <span class="rf-rank" id="rfRank"></span></h3><ol id="rfTop"><li><b></b><i></i><span class="cd"></span><span class="nm">Loading…</span><span class="tm"></span></li></ol><div class="rf-src" id="rfSrc"></div></div>' +
      '<div><h3>Your times</h3><ol id="rfMine"></ol></div>' +
      (name ? '' : '<div class="rf-name"><input id="rfNm" maxlength="20" placeholder="Your name for the leaderboard" aria-label="Your name for the leaderboard"><button id="rfPost">Post time</button></div>') +
      '<div class="acts">' + (next ? '<button class="go" id="rfNext">Next · ' + esc(next.label) + '</button>' : '') +
      '<button' + (next ? '' : ' class="go"') + ' id="rfAgain">Race again</button><button id="rfMenu">Menu</button></div></div>';
    document.body.appendChild(el);
    if (next) el.querySelector('#rfNext').onclick = next.go;
    el.querySelector('#rfAgain').onclick = again;
    el.querySelector('#rfMenu').onclick = goMenu;
    var first = el.querySelector('button.go'); if (first) try { first.focus({ preventScroll: true }); } catch (e) {}

    var rec = { track: ctx.track, mode: ctx.mode, laps: laps, ms: Math.round(total || 0), best_lap_ms: lap ? Math.round(lap) : null, pos: pos, field: field, story_level: story ? story.n : null };
    function row(r, k, me) {
      return '<li' + (me ? ' class="me"' : '') + '><b>' + (k + 1) + '</b><i style="background:' + (me ? accent : 'rgba(255,255,255,.18)') + '"></i><span class="cd">' + esc(String(r.name || 'Driver').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'DRV') + '</span><span class="nm">' + esc(r.name || 'Driver') + '</span><span class="tm">' + fmt(r.ms) + '</span></li>'; }
    var empty = function (t) { return '<li><b></b><i></i><span class="cd"></span><span class="nm">' + t + '</span><span class="tm"></span></li>'; };
    function fill(res, nm) { if (!el) return;
      var ol = el.querySelector('#rfTop'), mine = el.querySelector('#rfMine'), src = el.querySelector('#rfSrc'), rk = el.querySelector('#rfRank');
      var me = String(nm || '').toLowerCase();
      if (res) {
        ol.innerHTML = (res.top || []).slice(0, 8).map(function (r, k) { return row(r, k, me && String(r.name).toLowerCase() === me); }).join('') || empty('No times yet. Yours is the first.');
        var m = (res.mine && res.mine.length) ? res.mine : hist;
        mine.innerHTML = m.slice(0, 5).map(function (r, k) { return row(r, k, r.ms === rec.ms); }).join('') || empty('No times yet');
        if (rk) rk.textContent = res.rank ? '#' + res.rank + ' of ' + res.players : '';
        if (src) src.textContent = res.players ? res.players + ' driver' + (res.players > 1 ? 's' : '') + ' on this race' : '';
      } else {
        ol.innerHTML = empty('Leaderboard is offline right now. Try again in a bit.');
        mine.innerHTML = hist.slice(0, 5).map(function (r, k) { return row(r, k, r.ms === rec.ms); }).join('') || empty('No times yet');
        if (src) src.textContent = ''; if (rk) rk.textContent = '';
      } }
    function post(nm) { rec.name = nm || 'Driver';
      return DB.submit(rec).then(function () { return DB.board(ctx.track, ctx.mode, laps, rec.name); }).then(function (res) { fill(res, rec.name); }); }
    if (!total) DB.board(ctx.track, ctx.mode, laps, name).then(function (res) { fill(res, name); });
    else if (name) post(name);
    else { DB.board(ctx.track, ctx.mode, laps, '').then(function (res) { fill(res, ''); });
      el.querySelector('#rfPost').onclick = function () { var v = (el.querySelector('#rfNm').value || '').trim().slice(0, 20); if (!v) return;
        try { localStorage.setItem('sl_name', v); } catch (e) {} var box = el.querySelector('.rf-name'); if (box) box.remove(); post(v); }; }
  }

  window.RaceFinish = { show: show, close: close, db: DB };
})();
