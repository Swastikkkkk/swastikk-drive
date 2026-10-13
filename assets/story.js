/* Story mode: 50 levels in 5 chapters on the real F1 circuits, against more and faster AI rivals as you go.
   Progress lives in localStorage 'story-v1' (per browser). Stars: win 3, P2 2, at or inside the target place 1. */
(function () {
  'use strict';
  var KEY = 'story-v1';
  // [name, blurb, finish target, laps, circuits (10), rivals first..last, pace first..last]
  var CHAPTERS = [
    ['Rookie', 'Short, gentle tracks against a few club drivers.', 3, 1, ['nl','ca','mx','hu','au','cn','it','es','mi','gb'], [2, 4], [.80, .86]],
    ['Club Racer', 'Proper race circuits, bigger fields.', 3, 2, ['gb','jp','es','at','br','us','it','cn','hu','nl'], [4, 7], [.86, .91]],
    ['Night & Streets', 'Walls close by, floodlights and city streets.', 2, 3, ['sg','bh','sa','qa','lv','ae','mc','az','mi','md'], [6, 9], [.90, .94]],
    ['Mountain Masters', 'The steepest climbs and drops on the calendar.', 2, 3, ['at','im','jp','br','us','hu','es','mc','az','be'], [9, 13], [.93, .97]],
    ['World Tour', 'A full grid of pros. Only wins count.', 1, 3, ['bh','sa','au','jp','mc','ca','gb','be','it','ae'], [15, 19], [.96, 1.0]]
  ];
  var cur = null;

  function load() {
    try { var d = JSON.parse(localStorage.getItem(KEY) || '{}'); return d && d.s && typeof d.s === 'object' ? d : { s: {} }; }
    catch (e) { return { s: {} }; }
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function starsOf(d, n) { var v = d.s[n]; return typeof v === 'number' ? v : 0; }
  // the first level of every chapter is always open; the rest of a chapter opens one level at a time
  function unlocked(d, n) { return (n - 1) % 10 === 0 || starsOf(d, n - 1) > 0; }
  function starsFor(lv, pos) { if (!pos || pos > lv.target) return 0; return pos === 1 ? 3 : pos === 2 ? 2 : 1; }
  function toast(t) { try { if (window.toastMsg) window.toastMsg(t); } catch (e) {} }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function levels() {
    var out = [];
    CHAPTERS.forEach(function (C, ch) {
      for (var i = 0; i < 10; i++) {
        var t = i / 9, id = C[4][i], c = window.F1 && F1.get ? F1.get(id) : null;
        out.push({ n: ch * 10 + i + 1, ch: ch, circuit: id, name: c ? c.name : id, target: C[2],
          laps: C[3] + (i >= 7 ? 1 : 0), rivals: Math.round(lerp(C[5][0], C[5][1], t)), skill: +lerp(C[6][0], C[6][1], t).toFixed(3) });
      }
    });
    return out;
  }

  function onFinish(r) {
    window.__onRaceFinish = null;
    var lv = cur; cur = null;
    if (!lv || !r) return;
    var st = starsFor(lv, r.pos | 0), d = load(), prev = starsOf(d, lv.n);
    if (st > prev) { d.s[lv.n] = st; save(d); }
    // the finish screen (assets/race-finish.js) shows this: stars, whether the next level just opened
    window.__storyResult = { n: lv.n, name: lv.name, chapter: CHAPTERS[lv.ch][0], stars: st, best: Math.max(st, prev), target: lv.target, cleared: st > 0,
      unlocked: st > 0 && !prev && lv.n < 50 ? lv.n + 1 : null, next: lv.n < 50 && (st > 0 || prev > 0) ? lv.n + 1 : null };
  }

  function play(lv) {
    cur = lv;
    window.__onRaceFinish = onFinish;
    var go = function () {
      try {
        window.__raceGrid = { n: lv.rivals, skill: lv.skill }; window.__storyLevel = lv.n; window.__storyResult = null;
        if (!window.F1 || !F1.build(lv.circuit, { race: true, laps: window.LapPick ? LapPick.laps(lv.laps) : lv.laps })) { window.__raceGrid = null; window.__onRaceFinish = null; toast('Could not load that circuit'); return; }
        toast('Level ' + lv.n + ' · ' + lv.name + ' · finish P' + lv.target + ' or better against ' + lv.rivals + ' rivals');
      } catch (e) { window.__raceGrid = null; window.__onRaceFinish = null; console.error('Story level failed', e); }
    };
    var ready = function () { if (window.F1 && F1.ready) F1.ready(lv.circuit, go); else go(); };
    var close = window.__homeClose, homeUp = window.__home && window.__home.on;
    if (homeUp && typeof close === 'function') close(ready); else ready();
  }

  function open(container) {
    if (!container) return;
    var LV = levels(), d = load(), total = 0;
    LV.forEach(function (l) { total += starsOf(d, l.n); });
    var html = '<div class="hm"><button class="back" data-go="home">‹ Back</button><h1>Story</h1>' +
      '<p class="sub">' + total + ' of 150 stars. Win for 3, second for 2, reach the target for 1.</p>' + (window.LapPick ? LapPick.html('Level') : '') + '<div class="lvwrap">';
    CHAPTERS.forEach(function (C, ch) {
      html += '<h2>' + (ch + 1) + '. ' + C[0] + '<small>' + C[1] + '</small></h2><div class="lvgrid">';
      LV.filter(function (l) { return l.ch === ch; }).forEach(function (l) {
        var ok = unlocked(d, l.n), s = starsOf(d, l.n);
        html += '<button class="lv' + (s ? ' done' : '') + '" data-lvl="' + l.n + '"' + (ok ? '' : ' disabled') +
          ' title="' + l.name + ' · ' + l.laps + ' lap' + (l.laps > 1 ? 's' : '') + ' · ' + l.rivals + ' rivals · finish P' + l.target + ' or better">' +
          '<b>' + l.n + '</b><span>' + l.circuit.toUpperCase() + '</span><i>' + (ok ? '★'.repeat(s) + '☆'.repeat(3 - s) : 'locked') + '</i></button>';
      });
      html += '</div>';
    });
    container.innerHTML = html + '</div></div>';
    if (window.LapPick) LapPick.bind(container);
    container.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); var n = +b.getAttribute('data-lvl'); if (LV[n - 1] && unlocked(load(), n)) play(LV[n - 1]); };
    });
  }

  window.Story = { open: open, levels: levels, play: function (n) { var L = levels()[n - 1]; if (L && unlocked(load(), n)) play(L); } };
})();
