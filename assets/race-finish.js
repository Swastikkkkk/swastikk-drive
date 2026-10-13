/* The finish screen for solo races (story levels, Grand Prix, daily and drawn tracks; rooms keep their shared card).
   race.js calls RaceFinish.show(RaceEngine) after the line. It shows a photo of your car taken at the finish, your place,
   time and best lap, a new-record banner, F1 points or story stars, the race classification and the best times for
   this race, then Next race / Race again / Menu.

   Records: every finish is posted to Supabase (table race_results, see supabase/race_results.sql) and kept on this
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

  // ---------- records: Supabase table race_results, with this device as the fallback ----------
  var DB = {
    h: function () { var S = window.__SUPA; return S ? { 'Content-Type': 'application/json', apikey: S.key, Authorization: 'Bearer ' + S.key } : null; },
    url: function () { return window.__SUPA ? window.__SUPA.url + '/rest/v1/race_results' : null; },
    submit: function (r) { var u = this.url(), h = this.h(); if (!u) return Promise.resolve(false);
      return fetch(u, { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, h), body: JSON.stringify(r) }).then(function (x) { return x.ok; }).catch(function () { return false; }); },
    top: function (track, mode, laps) { var u = this.url(), h = this.h(); if (!u) return Promise.resolve(null);
      var q = '?select=name,ms,best_lap_ms,pos,field&track=eq.' + encodeURIComponent(track) + '&mode=eq.' + encodeURIComponent(mode) + '&laps=eq.' + laps + '&order=ms.asc&limit=10';
      return fetch(u + q, { headers: h }).then(function (x) { return x.ok ? x.json() : null; }).catch(function () { return null; }); }
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
      next = { label: nc.name.replace(/ Circuit$| International Circuit$/, ''), go: function () { close(); F1.ready(nc.id, function () { window.__f1GP = true; F1.build(nc.id, { race: true, laps: ctx.laps || 5 }); }); } }; }
    var again = function () { close();
      if (story) window.Story.play(story.n);
      else { if (ctx.mode === 'gp') window.__f1GP = true; if (window.restartSoloRace) window.restartSoloRace(); } };

    var banners = '';
    if (newRace && prevRace) banners += '<span class="rf-b gold">New record · ' + ((prevRace.ms - total) / 1000).toFixed(2) + ' s faster</span>';
    else if (newRace) banners += '<span class="rf-b gold">First time set</span>';
    if (newLap && prevLap) banners += '<span class="rf-b">Fastest lap here</span>';
    if (story) banners += story.cleared ? '<span class="rf-b ok">Level cleared' + (story.unlocked ? ' · level ' + story.unlocked + ' unlocked' : '') + '</span>' : '<span class="rf-b no">Finish ' + ord(story.target) + ' or better to clear</span>';

    var reward = '';
    if (ctx.mode === 'gp') reward = '<div class="rf-k"><span>Points</span><b>' + (POINTS[pos - 1] || 0) + '</b></div>';
    if (story) reward = '<div class="rf-k"><span>Stars</span><b class="rf-stars">' + '★'.repeat(story.stars) + '<i>' + '★'.repeat(3 - story.stars) + '</i></b></div>';

    // classification: the top of the field and you
    var rows = board.slice().sort(function (a, b) { return a.position - b.position; });
    var shown = rows.filter(function (r, k) { return k < 5 || r.isMe; });
    var cls = shown.map(function (r) { var done = !r.racing && r.finishTime;
      return '<li' + (r.isMe ? ' class="me"' : '') + '><span>' + (done ? r.position : '–') + '</span><span>' + esc(r.isMe ? (name || 'You') : r.name) + '</span><span>' + (r.racing ? 'on track' : done ? fmt(r.finishTime) : 'DNF') + '</span></li>'; }).join('');

    el = document.createElement('div'); el.id = 'rfin';
    el.innerHTML = '<style>' +
      '#rfin{position:fixed;inset:0;z-index:2147482500;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,1fr);background:#08090c;color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif;animation:rfIn .45s ease both}' +
      '@keyframes rfIn{from{opacity:0}}@keyframes rfUp{from{opacity:0;transform:translateY(14px)}}' +
      '#rfin .ph{position:relative;overflow:hidden;background:#111 center/cover no-repeat}' +
      '#rfin .ph::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 55%,#08090c 100%),linear-gradient(0deg,rgba(8,9,12,.85) 0%,transparent 45%)}' +
      '#rfin .pos{position:absolute;left:clamp(18px,4vw,48px);bottom:clamp(18px,5vh,52px);z-index:1;animation:rfUp .6s .15s both}' +
      '#rfin .pos b{display:block;font-size:clamp(84px,14vw,168px);line-height:.82;font-weight:800;font-style:italic;letter-spacing:-.04em}' +
      '#rfin .pos small{display:block;margin-top:10px;font-size:15px;color:rgba(244,244,246,.75)}' +
      '#rfin .pos .bar{display:block;width:72px;height:5px;background:' + accent + ';margin-bottom:14px}' +
      '#rfin .pn{padding:clamp(20px,4vh,44px) clamp(18px,3vw,40px);overflow-y:auto;display:flex;flex-direction:column;gap:18px;animation:rfUp .6s .25s both}' +
      '#rfin h2{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em}#rfin h2 small{display:block;font-size:13px;font-weight:400;color:rgba(244,244,246,.55);margin-top:4px}' +
      '#rfin .rf-bs{display:flex;flex-wrap:wrap;gap:6px}#rfin .rf-b{font-size:12.5px;font-weight:600;padding:6px 10px;border-radius:99px;background:rgba(255,255,255,.08)}' +
      '#rfin .rf-b.gold{background:#e8a317;color:#1a1204}#rfin .rf-b.ok{background:rgba(63,138,86,.35)}#rfin .rf-b.no{background:rgba(225,6,0,.25)}' +
      '#rfin .rf-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}' +
      '#rfin .rf-k{background:rgba(255,255,255,.05);border-radius:12px;padding:12px}#rfin .rf-k span{display:block;font-size:12px;color:rgba(244,244,246,.55)}' +
      '#rfin .rf-k b{display:block;margin-top:4px;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}#rfin .rf-stars{color:#e8a317;letter-spacing:2px}#rfin .rf-stars i{font-style:normal;color:rgba(255,255,255,.18)}' +
      '#rfin h3{margin:0 0 6px;font-size:13px;font-weight:600;color:rgba(244,244,246,.7)}' +
      '#rfin ol{list-style:none;margin:0;padding:0}#rfin li{display:grid;grid-template-columns:28px 1fr auto;gap:10px;padding:7px 8px;border-radius:8px;font-size:14px;font-variant-numeric:tabular-nums}' +
      '#rfin li:nth-child(odd){background:rgba(255,255,255,.03)}#rfin li.me{background:' + accent + '33;font-weight:700}#rfin li span:first-child{color:rgba(244,244,246,.5)}' +
      '#rfin .rf-src{font-size:11.5px;color:rgba(244,244,246,.4);margin-top:4px}' +
      '#rfin .rf-name{display:flex;gap:6px}#rfin .rf-name input{flex:1;min-width:0;padding:9px 10px;border-radius:9px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.05);color:#fff;font:inherit}' +
      '#rfin .acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto;padding-top:6px}' +
      '#rfin button{all:unset;cursor:pointer;padding:12px 16px;border-radius:11px;font-size:14px;font-weight:600;background:rgba(255,255,255,.08);transition:background .15s}' +
      '#rfin button:hover{background:rgba(255,255,255,.16)}#rfin button.go{background:' + accent + ';color:#fff;flex:1;text-align:center}#rfin button.go:hover{filter:brightness(1.1)}' +
      '#rfin button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
      '@media (max-width:760px){#rfin{grid-template-columns:1fr;grid-template-rows:38vh auto;overflow-y:auto}#rfin .ph::after{background:linear-gradient(0deg,#08090c 0%,transparent 60%)}#rfin .pn{overflow:visible}}' +
      '@media (prefers-reduced-motion:reduce){#rfin,#rfin .pos,#rfin .pn{animation:none}}' +
      '</style>' +
      '<div class="ph"' + (photo ? ' style="background-image:url(' + photo + ')"' : '') + '><div class="pos"><i class="bar"></i><b>P' + pos + '</b><small>' + (field > 1 ? 'of ' + field + ' · ' : '') + esc(title) + '</small></div></div>' +
      '<div class="pn"><h2>' + esc(title) + '<small>' + laps + ' lap' + (laps > 1 ? 's' : '') + (field > 1 ? ' · ' + field + ' cars' : '') + (gap ? ' · ' + gap : '') + '</small></h2>' +
      (banners ? '<div class="rf-bs">' + banners + '</div>' : '') +
      '<div class="rf-ks"><div class="rf-k"><span>Race time</span><b>' + fmt(total) + '</b></div><div class="rf-k"><span>Best lap</span><b>' + fmt(lap) + '</b></div>' + reward + '</div>' +
      (cls && field > 1 ? '<div><h3>Classification</h3><ol>' + cls + '</ol></div>' : '') +
      '<div><h3>Best times · this race</h3><ol id="rfTop"><li><span></span><span>Loading…</span><span></span></li></ol><div class="rf-src" id="rfSrc"></div></div>' +
      (name ? '' : '<div class="rf-name"><input id="rfNm" maxlength="20" placeholder="Your name for the leaderboard" aria-label="Your name for the leaderboard"><button id="rfPost">Post time</button></div>') +
      '<div class="acts">' + (next ? '<button class="go" id="rfNext">Next race · ' + esc(next.label) + '</button>' : '') +
      '<button' + (next ? '' : ' class="go"') + ' id="rfAgain">Race again</button><button id="rfMenu">Menu</button></div></div>';
    document.body.appendChild(el);
    if (next) el.querySelector('#rfNext').onclick = next.go;
    el.querySelector('#rfAgain').onclick = again;
    el.querySelector('#rfMenu').onclick = goMenu;
    var first = el.querySelector('button.go'); if (first) try { first.focus({ preventScroll: true }); } catch (e) {}

    var rec = { track: ctx.track, mode: ctx.mode, laps: laps, ms: Math.round(total || 0), best_lap_ms: lap ? Math.round(lap) : null, pos: pos, field: field, story_level: story ? story.n : null };
    function fill(list, src) { var ol = el && el.querySelector('#rfTop'); if (!ol) return;
      ol.innerHTML = (list || []).slice(0, 8).map(function (r, k) { var me = r.me || (r.ms === rec.ms && r.name === (myName() || 'Driver'));
        return '<li' + (me ? ' class="me"' : '') + '><span>' + (k + 1) + '</span><span>' + esc(r.name || 'Driver') + '</span><span>' + fmt(r.ms) + '</span></li>'; }).join('') || '<li><span></span><span>No times yet</span><span></span></li>';
      var s = el.querySelector('#rfSrc'); if (s) s.textContent = src; }
    function post(nm) { rec.name = nm || 'Driver';
      return DB.submit(rec).then(function (ok) { return DB.top(ctx.track, ctx.mode, laps).then(function (top) {
        if (ok && top) fill(top, 'Everyone’s times, saved online'); else fill(hist, 'Times on this device (online board not reachable)'); }); }); }
    if (!total) fill(hist, '');
    else if (name) post(name);
    else { fill(hist, 'Add your name to post this time online');
      el.querySelector('#rfPost').onclick = function () { var v = (el.querySelector('#rfNm').value || '').trim().slice(0, 20); if (!v) return;
        try { localStorage.setItem('sl_name', v); } catch (e) {} var box = el.querySelector('.rf-name'); if (box) box.remove(); post(v); }; }
  }

  window.RaceFinish = { show: show, close: close, db: DB };
})();
