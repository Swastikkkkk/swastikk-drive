/**
 * Daily Track extras: a streak for finishing the daily lap on consecutive UTC days, a personal best per day,
 * and a preview of today's map (outline, elevation profile, conditions) in the Daily Track menu.
 *
 * Everything lives on this device (localStorage 'sl_dstreak'). It is a convenience, not a ranking: the global
 * board stays the source of truth for times.
 *
 *   DailyExtras.record(day, totalMs)  called by race.js when a daily lap is finished; returns what changed
 *   DailyExtras.render(day)           called by game.js when the Daily Track menu opens
 */
(function (window) {
  'use strict';

  var KEY = 'sl_dstreak';
  var ELEV_M = { flat: 0, rolling: 5, hilly: 12, mountain: 22 };   // same peak heights as CIRC_ELEV in game.js
  var DAY = 86400000;

  /* ---------- dates (all UTC, matching the daily track) ---------- */
  function dayNum(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : NaN; }
  function dayStr(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  /* ---------- storage ---------- */
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    if (!s || typeof s !== 'object') s = {};
    if (typeof s.last !== 'string') s.last = '';
    s.cur = s.cur | 0; s.best = s.best | 0; s.total = s.total | 0;
    if (!s.pb || typeof s.pb !== 'object') s.pb = {};
    return s;
  }
  function save(s) {
    // keep only the last 60 days of personal bests
    var keys = Object.keys(s.pb).sort();
    while (keys.length > 60) delete s.pb[keys.shift()];
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* streak as it stands on `today`: alive if the last finish was today or yesterday */
  function status(today) {
    var s = load(), t = dayNum(today || todayStr()), l = dayNum(s.last);
    var gap = isNaN(l) ? Infinity : t - l;
    return {
      cur: gap <= 1 ? s.cur : 0,
      best: s.best,
      total: s.total,
      doneToday: gap === 0,
      atRisk: gap === 1 && s.cur > 0,
      pb: s.pb,
      last: s.last
    };
  }

  function record(day, ms) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !(ms > 0)) return null;
    var s = load(), d = dayNum(day), l = dayNum(s.last), out = { firstToday: false, streakUp: false, newPb: false, prevPb: null };
    if (isNaN(l) || d > l) {
      out.firstToday = true;
      s.cur = (d - l === 1) ? s.cur + 1 : 1;
      s.last = day;
      s.total += 1;
      out.streakUp = s.cur > 1;
    } else if (d < l) {
      // a lap on an older day's track (left open past midnight): it counts for that day's best, not the streak
    }
    if (s.cur > s.best) s.best = s.cur;
    var prev = s.pb[day];
    out.prevPb = prev || null;
    if (!prev || ms < prev) { s.pb[day] = Math.round(ms); out.newPb = !!prev; }
    save(s);
    out.cur = s.cur; out.best = s.best;
    return out;
  }

  /* the finish message: what this lap did for the streak and the personal best */
  function finishNote(r, fmt) {
    if (!r) return '';
    var bits = [];
    if (r.firstToday) bits.push(r.cur > 1 ? r.cur + '-day streak' : 'Streak started · come back tomorrow');
    if (r.newPb) bits.push('New personal best (was ' + fmt(r.prevPb) + ')');
    if (r.firstToday && r.cur === r.best && r.cur > 1) bits.push('your longest yet');
    return bits.join(' · ');
  }

  function fmtMs(ms) {
    if (!(ms > 0)) return '--:--.--';
    var m = Math.floor(ms / 60000), s = (ms % 60000) / 1000;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }

  /* ---------- elevation profile: the same formula buildCircuit uses, so the preview matches the road ---------- */
  function elevProfile(seed, elev, n) {
    var E = ELEV_M[elev] || 0, out = [];
    seed = Math.max(1, Math.floor(+seed) || 271828);
    var erng = (seed ^ 0x5bd1e995) >>> 0;
    var er = function () { erng = (Math.imul(erng, 1664525) + 1013904223) >>> 0; return erng / 4294967296; };
    var k1 = 2 + Math.floor(er() * 2), k2 = 3 + Math.floor(er() * 3), p1 = er() * 6.283, p2 = er() * 6.283;
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      if (!E) { out.push(0); continue; }
      var d = Math.min(u, 1 - u), f = Math.min(1, Math.max(0, (d - .03) / .07)), k = f * f * (3 - 2 * f);
      out.push(E * k * (.62 * Math.sin(6.283 * k1 * u + p1) + .38 * Math.sin(6.283 * k2 * u + p2) - (.62 * Math.sin(p1) + .38 * Math.sin(p2))));
    }
    return out;
  }

  /* ---------- drawing ---------- */
  function setupCanvas(cv) {
    var dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    return { x: x, w: w, h: h };
  }

  function drawOutline(cv, m) {
    if (!cv || !cv.getContext) return;
    var c = setupCanvas(cv), x = c.x, P = m.pts, pad = 14, i;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (i = 0; i < P.length; i++) { minX = Math.min(minX, P[i].x); maxX = Math.max(maxX, P[i].x); minY = Math.min(minY, P[i].y); maxY = Math.max(maxY, P[i].y); }
    var k = Math.min((c.w - pad * 2) / (maxX - minX || 1), (c.h - pad * 2) / (maxY - minY || 1));
    var ox = c.w / 2 - (minX + maxX) / 2 * k, oy = c.h / 2 - (minY + maxY) / 2 * k;
    var px = function (p) { return [p.x * k + ox, p.y * k + oy]; };
    // road: a wide dark band with a light centre line, so it reads as a track rather than a wire
    x.lineJoin = 'round'; x.lineCap = 'round';
    x.beginPath(); for (i = 0; i <= P.length; i++) { var q = px(P[i % P.length]); if (i) x.lineTo(q[0], q[1]); else x.moveTo(q[0], q[1]); }
    x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = Math.max(5, Math.min(10, m.width * k * 1.6)); x.stroke();
    x.strokeStyle = '#eef0f3'; x.lineWidth = 2; x.stroke();
    // obstacles
    for (i = 0; i < m.obstacles.length; i++) {
      var o = m.obstacles[i], q2 = px(P[Math.floor(o.u * P.length) % P.length]);
      x.fillStyle = o.t === 'ramp' ? '#ffb02e' : '#e6c34a';
      x.beginPath(); x.arc(q2[0], q2[1], 3, 0, Math.PI * 2); x.fill();
    }
    // start line and the direction of travel
    var a = px(P[0]), b = px(P[Math.min(P.length - 1, 4)]), dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    x.strokeStyle = '#ff4d3d'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(a[0] - dy * 7, a[1] + dx * 7); x.lineTo(a[0] + dy * 7, a[1] - dx * 7); x.stroke();
    x.fillStyle = '#ff4d3d';
    x.beginPath(); x.moveTo(a[0] + dx * 14, a[1] + dy * 14); x.lineTo(a[0] + dx * 7 - dy * 4, a[1] + dy * 7 + dx * 4); x.lineTo(a[0] + dx * 7 + dy * 4, a[1] + dy * 7 - dx * 4); x.closePath(); x.fill();
  }

  function drawProfile(cv, m) {
    if (!cv || !cv.getContext) return null;
    var c = setupCanvas(cv), x = c.x, N = 160, E = elevProfile(m.seed, m.elev, N), lo = Math.min.apply(0, E), hi = Math.max.apply(0, E);
    var span = Math.max(hi - lo, 8), mid = (hi + lo) / 2, top = 6, bot = c.h - 4;
    var y = function (v) { return bot - ((v - (mid - span / 2)) / span) * (bot - top); };
    x.beginPath(); x.moveTo(0, bot + 4);
    for (var i = 0; i <= N; i++) x.lineTo(i / N * c.w, y(E[i]));
    x.lineTo(c.w, bot + 4); x.closePath();
    var g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(77,141,255,.45)'); g.addColorStop(1, 'rgba(77,141,255,.04)');
    x.fillStyle = g; x.fill();
    x.beginPath(); for (i = 0; i <= N; i++) { if (i) x.lineTo(i / N * c.w, y(E[i])); else x.moveTo(0, y(E[0])); }
    x.strokeStyle = '#4d8dff'; x.lineWidth = 1.5; x.stroke();
    return Math.round(hi - lo);
  }

  /* ---------- the menu block ---------- */
  var WX = { day: 'Clear', dusk: 'Dusk', rain: 'Rain', snow: 'Snow', autumn: 'Autumn', night: 'Night', overcast: 'Overcast', sunset: 'Sunset', storm: 'Storm', fog: 'Fog', sand: 'Sandstorm', blizzard: 'Blizzard' };
  var THEME = { meadow: 'Meadow', forest: 'Forest', desert: 'Desert', snow: 'Snow', volcanic: 'Volcanic', coastal: 'Coastal', night: 'Night city', canyon: 'Canyon', mountain: 'Mountain', alpine: 'Alpine', tropical: 'Tropical', rocky: 'Rocky', autumn: 'Autumn', sunset: 'Sunset', city: 'City', moon: 'Moon' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(day) {
    var box = document.getElementById('ddaily-extras');
    if (!box) return;
    day = day || todayStr();
    var m = null;
    try { m = window.DailyMaps ? window.DailyMaps.forDate(day) : null; } catch (e) {}
    var venueRow = document.querySelector('#ddaily-info .dx-venue');   // the card below says the same thing, better
    if (venueRow) venueRow.style.display = m ? 'none' : '';
    if (!m) { box.style.display = 'none'; return; }
    box.style.display = '';

    var conds = [WX[m.weather] || m.weather];
    if (m.time !== m.weather && m.time !== 'day') conds.push(WX[m.time] || m.time);
    var chips = [
      (m.lengthM / 1000).toFixed(1) + ' km',
      m.elevLabel + (m.elev === 'flat' ? '' : ' hills'),
      THEME[m.theme] || m.theme,
      conds.join(' · '),
      m.width + ' m wide'
    ];
    var ramps = m.obstacles.filter(function (o) { return o.t === 'ramp'; }).length, humps = m.obstacles.length - ramps;
    if (ramps) chips.push(ramps + ' jump' + (ramps > 1 ? 's' : ''));
    if (humps) chips.push(humps + ' speed hump' + (humps > 1 ? 's' : ''));

    var tm = null;
    try { tm = window.DailyMaps.forDate(dayStr(dayNum(day) + 1)); } catch (e) {}

    var st = status(day), pb = st.pb[day];
    var dots = '', t = dayNum(day);
    for (var i = 6; i >= 0; i--) {
      var ds = dayStr(t - i), done = !!st.pb[ds], isT = i === 0;
      dots += '<span class="dx-dot' + (done ? ' on' : '') + (isT ? ' today' : '') + '" title="' + ds + (done ? ' · ' + fmtMs(st.pb[ds]) : '') + '">' +
        '<i></i><em>' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date((t - i) * DAY).getUTCDay()] + '</em></span>';
    }
    var streakLine = st.doneToday ? (st.cur > 1 ? 'Done for today · ' + st.cur + '-day streak' : 'Done for today · streak started')
      : st.atRisk ? 'Finish today to keep your ' + st.cur + '-day streak'
      : (st.best ? 'Finish today to start a new streak' : 'Finish a lap today to start a streak');

    box.innerHTML =
      '<div class="dx-top">' +
        '<canvas class="dx-map" id="dx-map" aria-label="Track outline"></canvas>' +
        '<div class="dx-meta">' +
          '<div class="dx-fam">' + esc(m.familyLabel) + ' · map ' + m.no + '/' + window.DailyMaps.COUNT + '</div>' +
          '<div class="dx-name">' + esc(m.name) + '</div>' +
          '<div class="dx-chips">' + chips.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dx-prof"><canvas id="dx-prof" aria-label="Elevation profile"></canvas><div class="dx-cap"><span>Start</span><span id="dx-climb"></span><span>Finish</span></div></div>' +
      '<div class="dx-streak">' +
        '<div class="dx-big"><b>' + st.cur + '</b><span>day streak</span></div>' +
        '<div class="dx-week">' + dots + '</div>' +
        '<div class="dx-side"><div>Best <b>' + st.best + '</b></div><div>Today <b>' + (pb ? fmtMs(pb) : '—') + '</b></div></div>' +
      '</div>' +
      '<div class="dx-line' + (st.atRisk ? ' warn' : '') + '">' + esc(streakLine) + (tm ? '<span class="dx-next">Tomorrow: ' + esc(tm.familyLabel) + '</span>' : '') + '</div>';

    drawOutline(document.getElementById('dx-map'), m);
    var climb = drawProfile(document.getElementById('dx-prof'), m);
    var cap = document.getElementById('dx-climb');
    if (cap) cap.textContent = m.elev === 'flat' ? 'Flat' : 'Elevation · ' + climb + ' m range';
  }

  var API = { record: record, render: render, status: status, finishNote: finishNote, fmt: fmtMs, elevProfile: elevProfile };
  window.DailyExtras = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
