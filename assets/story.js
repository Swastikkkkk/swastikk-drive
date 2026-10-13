/* Story mode: 50 levels in 5 chapters, each a real F1 circuit run against AI rivals.
   Progress lives in localStorage 'story-v1' (per browser). Stars: win 3, P2 2, inside the target 1. */
(function () {
  'use strict';
  var KEY = 'story-v1';
  var CHAPTERS = ['Rookie', 'Club Racer', 'Night Streets', 'Mountain Masters', 'World Tour'];
  var TARGET = [3, 3, 2, 2, 1];   // finish at or inside this place to clear the level
  var LAPS = [1, 1, 3, 3, 5];
  var cur = null;

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || '{}');
      return d && typeof d === 'object' && d.s && typeof d.s === 'object' ? d : { s: {} };
    } catch (e) { return { s: {} }; }
  }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function starsOf(d, n) { var v = d.s[n]; return typeof v === 'number' ? v : 0; }
  function unlocked(d, n) { return n === 1 || starsOf(d, n - 1) > 0; }
  function starsFor(lv, pos) {
    if (!pos || pos > lv.target) return 0;
    return pos === 1 ? 3 : pos === 2 ? 2 : 1;
  }
  function toast(t) { try { if (window.toastMsg) window.toastMsg(t); } catch (e) {} }

  function levels() {
    var L = (window.F1 && F1.list && F1.list()) || [];
    if (!L.length) return [];
    var C = L.slice().sort(function (a, b) { return (a.lengthM || 0) - (b.lengthM || 0); });
    var out = [];
    for (var i = 0; i < 50; i++) {
      var ch = Math.floor(i / 10), c = C[i % C.length];
      out.push({ n: i + 1, ch: ch, chapter: CHAPTERS[ch], circuit: c.id, name: c.name, laps: LAPS[ch], target: TARGET[ch] });
    }
    return out;
  }

  function onFinish(r) {
    window.__onRaceFinish = null;
    var lv = cur;
    if (!lv || !r) return;
    var st = starsFor(lv, r.pos | 0);
    var d = load(), prev = starsOf(d, lv.n);
    if (st > prev) { d.s[lv.n] = st; save(d); }
    if (st === 0) {
      toast('Level ' + lv.n + ' not cleared: P' + r.pos + ', you need P' + lv.target + ' or better');
    } else {
      var next = lv.n < 50 && prev === 0 ? ' · Level ' + (lv.n + 1) + ' unlocked' : '';
      toast('Level ' + lv.n + ' · P' + r.pos + ' · ' + '★'.repeat(st) + '☆'.repeat(3 - st) + next);
    }
  }

  function play(lv) {
    cur = lv;
    window.__onRaceFinish = onFinish;
    var go = function () {
      try {
        if (!window.F1 || !F1.build(lv.circuit, { race: true, laps: lv.laps })) {
          window.__onRaceFinish = null; toast('Could not load that circuit');
        }
      } catch (e) { window.__onRaceFinish = null; console.error('Story level failed', e); }
    };
    var close = window.__homeClose;
    if (typeof close === 'function') close(go); else go();
  }

  function open(container) {
    if (!container) return;
    var LV = levels(), d = load();
    var html = '<div class="hm"><button class="back" data-go="home">‹ Back</button><h1>Story</h1>' +
      '<p class="sub">Five chapters, fifty levels. Finish at the target place to clear a level: win for 3 stars, second for 2, target for 1.</p>';
    if (!LV.length) html += '<p class="sub">Circuits are still loading. Try again in a moment.</p>';
    CHAPTERS.forEach(function (name, ch) {
      html += '<h2 style="margin:18px 0 8px;font-size:16px">Chapter ' + (ch + 1) + ' · ' + name + '</h2>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px">';
      LV.filter(function (l) { return l.ch === ch; }).forEach(function (l) {
        var ok = unlocked(d, l.n), s = starsOf(d, l.n);
        var stars = s ? '★'.repeat(s) + '☆'.repeat(3 - s) : (ok ? 'Open' : 'Locked');
        html += '<button class="t" data-lvl="' + l.n + '"' + (ok ? '' : ' disabled style="opacity:.45;cursor:not-allowed"') + '>' +
          '<b>Level ' + l.n + '</b><span>' + stars + '</span></button>';
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('[data-lvl]').forEach(function (b) {
      b.onclick = function () { var n = +b.getAttribute('data-lvl'); if (LV[n - 1]) play(LV[n - 1]); };
    });
  }

  window.Story = { open: open };
})();
