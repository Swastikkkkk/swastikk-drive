/**
 * Daily Track catalogue: 1000 different circuits, one per UTC day, the same for every player.
 *
 * Nothing is fetched. A map is a pure function of its number (0..999), so it is "stored" as a seed and rebuilt
 * identically on every device, with no network round trip and nothing that can be down on race day.
 *
 *   id = (utcDay * 377) % 1000        377 is coprime with 1000, so every map comes up once per 1000 days, and
 *                                     because 377 % 10 = 7 the ten shape families cycle in a different order:
 *                                     no two neighbouring days ever share a family.
 *
 * Ten families, each a genuinely different layout (not one shape with a new colour):
 *   oval, bean, star, esses, peanut, speedway, blocks, serpentine, switchback, spiral
 * Every map also rolls its own theme, weather, time of day, road width, hills (flat to mountain), lap length and
 * a few obstacles. Each candidate is validated (no self-crossing, no tight corner, parallel stretches kept apart) and
 * the winning attempt number is baked into ATT below, so every browser builds the very same track even if two
 * engines round a borderline float differently. Rebuild ATT with: node scripts/build-daily-maps.js
 *
 * Output points are world-unit metres, centred on the origin, closed, <= 400 of them (the multiplayer limit).
 */
(function (root) {
  'use strict';

  var COUNT = 1000, MUL = 377, TAU = Math.PI * 2;
  var FAMILIES = ['oval', 'bean', 'star', 'esses', 'peanut', 'speedway', 'blocks', 'serpentine', 'switchback', 'spiral'];
  var FAMILY_LABEL = {
    oval: 'Flowing oval', bean: 'Bay loop', star: 'Many-cornered rosette', esses: 'Esses ring', peanut: 'Dumbbell',
    speedway: 'Speedway', blocks: 'Street grid', serpentine: 'Serpentine', switchback: 'Mountain switchbacks', spiral: 'Spiral'
  };
  var ELEV_LABEL = { flat: 'Flat', rolling: 'Rolling', hilly: 'Hilly', mountain: 'Mountain' };

  /* BEGIN ATT: winning attempt per map (-1 = none passed, safe oval used). Written by scripts/build-daily-maps.js */
  var ATT = [0,0,0,1,0,0,0,2,14,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,4,2,0,0,0,0,1,0,0,0,4,9,0,0,0,0,0,0,0,0,1,2,0,0,0,0,1,0,0,0,0,8,0,0,0,0,0,0,0,0,6,2,0,0,1,0,0,0,0,0,1,2,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,2,2,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,2,0,0,1,0,0,0,0,0,8,2,0,0,1,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,1,0,0,0,2,1,0,0,1,0,1,0,0,0,3,0,0,0,0,0,0,0,0,0,3,1,0,0,0,0,0,0,0,0,2,1,0,0,1,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,3,1,0,0,0,0,0,0,0,0,3,0,0,0,0,1,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,4,3,0,0,0,0,0,0,0,0,2,3,0,0,0,0,1,0,0,0,2,1,0,0,0,0,0,0,0,0,1,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,1,9,0,0,0,1,0,0,0,0,1,2,0,0,0,0,0,0,0,0,0,12,0,0,0,0,2,0,0,0,0,2,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,2,0,0,0,1,0,0,0,0,2,3,0,0,0,0,0,0,0,0,0,1,0,0,0,3,0,0,0,0,0,0,0,0,0,1,0,0,0,0,5,3,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,4,4,0,0,0,1,0,0,0,0,0,3,0,0,0,0,0,0,0,0,5,7,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,2,0,0,0,1,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,3,7,0,0,1,0,0,0,0,0,8,13,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,0,0,0,0,1,0,0,0,1,13,0,0,0,1,0,0,0,0,0,2,0,0,0,0,1,0,0,0,1,4,0,0,0,0,0,0,0,0,2,2,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,2,0,0,0,0,0,3,3,1,0,0,0,1,0,0,0,3,5,0,0,0,0,1,0,0,0,1,3,0,0,0,0,0,0,0,0,3,8,0,0,0,0,0,0,0,0,2,1,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,8,1,0,0,0,0,0,0,0,0,3,3,0,0,0,0,1,0,0,0,1,2,0,0,2,0,1,0,0,0,3,6,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,1,10,0,0,0,0,1,0,0,0,0,3,0,0,0,1,1,0,0,0,4,2,0,0,0,0,0,0,0,0,1,2,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1,6,0,0,0,1,3,0,0,0,1,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,2,0,0,1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,2,0,0,0,0,3,0,0,0,4,6,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,1,0,0,0,6,4,0];
  /* END ATT */

  /* ---------- small helpers ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngOf(id, attempt) {
    return mulberry32((Math.imul(id + 1, 2654435761) ^ Math.imul(attempt + 7, 40503) ^ 0x9e3779b9) >>> 0);
  }
  function ru(r, a, b) { return a + (b - a) * r(); }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function wpick(r, pairs) {
    var t = 0, i;
    for (i = 0; i < pairs.length; i++) t += pairs[i][1];
    var x = r() * t;
    for (i = 0; i < pairs.length; i++) { x -= pairs[i][1]; if (x <= 0) return pairs[i][0]; }
    return pairs[pairs.length - 1][0];
  }

  function perim(p) {
    var s = 0, n = p.length;
    for (var i = 0; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; s += Math.hypot(b.x - a.x, b.y - a.y); }
    return s;
  }
  function scaleTo(p, L) {
    var n = p.length, cx = 0, cy = 0, i;
    for (i = 0; i < n; i++) { cx += p[i].x; cy += p[i].y; }
    cx /= n; cy /= n;
    var k = L / perim(p);
    return p.map(function (q) { return { x: (q.x - cx) * k, y: (q.y - cy) * k }; });
  }
  function resampleClosed(p, N) {
    var n = p.length, cum = [0], i;
    for (i = 0; i < n; i++) { var a = p[i], b = p[(i + 1) % n]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.y - a.y)); }
    var L = cum[n], out = [], j = 0;
    for (i = 0; i < N; i++) {
      var d = L * i / N;
      while (j < n - 1 && cum[j + 1] < d) j++;
      var a2 = p[j], b2 = p[(j + 1) % n], seg = (cum[j + 1] - cum[j]) || 1, t = (d - cum[j]) / seg;
      out.push({ x: a2.x + (b2.x - a2.x) * t, y: a2.y + (b2.y - a2.y) * t });
    }
    return out;
  }
  function smoothClosed(p, passes) {
    var n = p.length;
    for (var k = 0; k < passes; k++) {
      var q = new Array(n);
      for (var i = 0; i < n; i++) {
        var a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
        q[i] = { x: .25 * a.x + .5 * b.x + .25 * c.x, y: .25 * a.y + .5 * b.y + .25 * c.y };
      }
      p = q;
    }
    return p;
  }
  function catmullClosed(c, per) {
    var n = c.length, out = [];
    for (var i = 0; i < n; i++) {
      var p0 = c[(i + n - 1) % n], p1 = c[i], p2 = c[(i + 1) % n], p3 = c[(i + 2) % n];
      for (var k = 0; k < per; k++) {
        var t = k / per, t2 = t * t, t3 = t2 * t;
        out.push({
          x: .5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: .5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    return out;
  }
  function chaikinClosed(p, it) {
    for (var k = 0; k < it; k++) {
      var n = p.length, q = [];
      for (var i = 0; i < n; i++) {
        var a = p[i], b = p[(i + 1) % n];
        q.push({ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y });
        q.push({ x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y });
      }
      p = q;
    }
    return p;
  }
  function chaikinOpen(p, it) {
    for (var k = 0; k < it; k++) {
      var n = p.length, q = [p[0]];
      for (var i = 0; i < n - 1; i++) {
        var a = p[i], b = p[i + 1];
        q.push({ x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y });
        q.push({ x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y });
      }
      q.push(p[n - 1]);
      p = q;
    }
    return p;
  }
  function lengthOpen(p) {
    var s = 0;
    for (var i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
    return s;
  }
  function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function polarShape(f, ax, ay) {
    var n = 360, out = [];
    for (var i = 0; i < n; i++) { var t = i / n * TAU, r = f(t); out.push({ x: Math.cos(t) * r * ax, y: Math.sin(t) * r * ay }); }
    return out;
  }

  /* an open centreline thickened into a closed loop: out along one side, round the end cap, back along the other */
  function ribbon(center, h) {
    var m = center.length, T = [], N = [], i, k;
    for (i = 0; i < m; i++) {
      var a = center[Math.max(0, i - 1)], b = center[Math.min(m - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      T.push({ x: dx / l, y: dy / l }); N.push({ x: -dy / l, y: dx / l });
    }
    var out = [], cM = center[m - 1], c0 = center[0], TM = T[m - 1], NM = N[m - 1], T0 = T[0], N0 = N[0];
    for (i = 0; i < m; i++) out.push({ x: center[i].x + N[i].x * h, y: center[i].y + N[i].y * h });
    for (k = 1; k < 12; k++) {
      var a1 = k / 12 * Math.PI;
      out.push({ x: cM.x + h * (NM.x * Math.cos(a1) + TM.x * Math.sin(a1)), y: cM.y + h * (NM.y * Math.cos(a1) + TM.y * Math.sin(a1)) });
    }
    for (i = m - 1; i >= 0; i--) out.push({ x: center[i].x - N[i].x * h, y: center[i].y - N[i].y * h });
    for (k = 1; k < 12; k++) {
      var a2 = k / 12 * Math.PI;
      out.push({ x: c0.x + h * (-N0.x * Math.cos(a2) - T0.x * Math.sin(a2)), y: c0.y + h * (-N0.y * Math.cos(a2) - T0.y * Math.sin(a2)) });
    }
    return out;
  }

  /* ---------- shape families. Each returns a closed polyline; the caller rescales to the lap length ---------- */
  var BLOCK_SHAPES = {
    L: [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]],
    U: [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3]],
    T: [[0, 2], [1, 2], [1, 0], [2, 0], [2, 2], [3, 2], [3, 3], [0, 3]],
    Z: [[0, 0], [2, 0], [2, 1], [3, 1], [3, 3], [1, 3], [1, 2], [0, 2]],
    plus: [[1, 0], [2, 0], [2, 1], [3, 1], [3, 2], [2, 2], [2, 3], [1, 3], [1, 2], [0, 2], [0, 1], [1, 1]],
    stairs: [[0, 0], [3, 0], [3, 1], [2, 1], [2, 2], [1, 2], [1, 3], [0, 3]]
  };

  function genShape(family, r, W, L) {
    var minGap = W + 29, h = minGap * ru(r, .6, .7), i, a;
    switch (family) {
      case 'oval': {
        var h2 = ru(r, .03, .1), h3 = ru(r, .02, .08), h4 = ru(r, 0, .05), p2 = ru(r, 0, TAU), p3 = ru(r, 0, TAU), p4 = ru(r, 0, TAU);
        return polarShape(function (t) { return 1 + h2 * Math.cos(2 * t + p2) + h3 * Math.cos(3 * t + p3) + h4 * Math.cos(5 * t + p4); }, 1, 1 / ru(r, 1.25, 2.4));
      }
      case 'bean': {
        var d = ru(r, .38, .7), w = ru(r, .38, .75), t0 = ru(r, 0, TAU), s1 = ru(r, .02, .1), p1 = ru(r, 0, TAU);
        return polarShape(function (t) { var u = wrapAngle(t - t0); return 1 - d * Math.exp(-(u * u) / (w * w)) + s1 * Math.cos(3 * t + p1); }, 1, 1 / ru(r, 1, 1.7));
      }
      case 'star': {
        var k = 3 + Math.floor(r() * 5), am = ru(r, .17, .33), ph = ru(r, 0, TAU), k2 = 2 + Math.floor(r() * 3), a2 = ru(r, .02, .09), ph2 = ru(r, 0, TAU);
        return polarShape(function (t) { return 1 + am * Math.cos(k * t + ph) + a2 * Math.cos(k2 * t + ph2); }, 1, 1 / ru(r, 1, 1.5));
      }
      case 'esses': {
        var kk = 6 + Math.floor(r() * 8), ar = ru(r, .045, .1), pp = ru(r, 0, TAU), asp = ru(r, 1.3, 2.3), ar2 = ru(r, 0, .05), kk2 = 2 + Math.floor(r() * 2);
        return polarShape(function (t) { return 1 + ar * Math.cos(kk * t + pp) + ar2 * Math.cos(kk2 * t); }, 1, 1 / asp);
      }
      case 'peanut': {
        var ap = ru(r, .4, .6), pq = ru(r, 0, TAU), tri = ru(r, 0, .1), p3b = ru(r, 0, TAU);
        return polarShape(function (t) { return 1 + ap * Math.cos(2 * t + pq) + tri * Math.cos(3 * t + p3b); }, 1, 1 / ru(r, 1, 1.5));
      }
      case 'speedway': {
        var n = ru(r, 2.4, 4.6), asp2 = ru(r, 1.6, 3.6), bow = ru(r, -.5, .5), out = [];
        for (i = 0; i < 360; i++) {
          a = i / 360 * TAU;
          var c = Math.cos(a), s = Math.sin(a);
          var x = (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), 2 / n) * asp2, y = (s < 0 ? -1 : 1) * Math.pow(Math.abs(s), 2 / n);
          y += bow * (1 - (x / asp2) * (x / asp2));
          out.push({ x: x, y: y });
        }
        return out;
      }
      case 'blocks': {
        var names = Object.keys(BLOCK_SHAPES), nm = names[Math.floor(r() * names.length)], base = BLOCK_SHAPES[nm];
        var cw = [ru(r, .7, 1.5), ru(r, .7, 1.5), ru(r, .7, 1.5)], ch = [ru(r, .7, 1.5), ru(r, .7, 1.5), ru(r, .7, 1.5)];
        var xs = [0, cw[0], cw[0] + cw[1], cw[0] + cw[1] + cw[2]], ys = [0, ch[0], ch[0] + ch[1], ch[0] + ch[1] + ch[2]];
        var poly = base.map(function (q) { return { x: xs[q[0]] + ru(r, -.06, .06), y: ys[q[1]] + ru(r, -.06, .06) }; });
        var cut = ru(r, .16, .26), fil = [], m = poly.length;
        for (i = 0; i < m; i++) {
          var pv = poly[(i + m - 1) % m], v = poly[i], nx = poly[(i + 1) % m];
          fil.push({ x: v.x + (pv.x - v.x) * cut, y: v.y + (pv.y - v.y) * cut });
          fil.push({ x: v.x + (nx.x - v.x) * cut, y: v.y + (nx.y - v.y) * cut });
        }
        return chaikinClosed(fil, 2);
      }
      case 'serpentine': {
        var Lc = (L - TAU * h / 2 * 1) / 2, hw = ru(r, 1.3, 3.4), ampR = ru(r, .22, .6), phs = ru(r, 0, TAU), second = r() < .5, ph3 = ru(r, 0, TAU), c3 = ru(r, .15, .4);
        var cen = [], M = 240;
        for (i = 0; i <= M; i++) {
          var t = i / M, yy = ampR * Math.sin(Math.PI * hw * t + phs);
          if (second) yy += ampR * c3 * Math.sin(Math.PI * hw * 2.3 * t + ph3);
          cen.push({ x: t, y: yy });
        }
        var kS = Lc / lengthOpen(cen);
        cen = cen.map(function (q) { return { x: q.x * kS, y: q.y * kS }; });
        return ribbon(cen, h);
      }
      case 'switchback': {
        var Lc2 = (L - Math.PI * h) / 2, dx = 2 * h + minGap + ru(r, 8, 45), feas = [], legs;
        for (legs = 3; legs <= 7; legs++) { var H = (Lc2 - (legs - 1) * 1.57 * dx) / legs; if (H >= 2.2 * dx) feas.push(legs); }
        if (!feas.length) feas = [3];
        legs = pick(r, feas);
        var HH = Math.max(2.2 * dx, (Lc2 - (legs - 1) * 1.57 * dx) / legs), lean = ru(r, -.18, .18), wob = ru(r, 0, .12), ctrl = [];
        for (i = 0; i < legs; i++) {
          var up = i % 2 === 0, y0 = up ? 0 : HH, y1 = up ? HH : 0, wb = wob * HH * ru(r, -1, 1);
          ctrl.push({ x: i * dx + lean * y0, y: y0 });
          ctrl.push({ x: i * dx + lean * y1 + wb, y: y1 });
        }
        var cen2 = chaikinOpen(ctrl, 4), kS2 = Lc2 / lengthOpen(cen2);
        cen2 = cen2.map(function (q) { return { x: q.x * kS2, y: q.y * kS2 }; });
        return ribbon(cen2, h);
      }
      case 'spiral': {
        var Lc3 = (L - Math.PI * h) / 2, pitch = 2 * h + minGap + ru(r, 14, 55), r0 = h + Math.max(24, W * 1.4) * 1.2 + ru(r, 0, 30), b = pitch / TAU;
        var cen3 = [], th = 0, len = 0, prev = null, dth = .02;
        while (len < Lc3 && th < 60) {
          var rr = r0 + b * th, q2 = { x: Math.cos(th) * rr, y: Math.sin(th) * rr };
          if (prev) len += Math.hypot(q2.x - prev.x, q2.y - prev.y);
          cen3.push(q2); prev = q2; th += dth;
        }
        return ribbon(cen3, h);
      }
    }
    return [];
  }

  /* ---------- validation: the same bar a hand-drawn track has to clear, plus room for barriers between stretches ---------- */
  function segInt(a, b, c, d) {
    var d1 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x), d2 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
    var d3 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x), d4 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }
  function curvatureAt(p, i, k) {
    var n = p.length, a = p[(i - k + n) % n], b = p[i], c = p[(i + k) % n];
    var ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    var area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return ab * bc * ca < 1e-9 ? 1 : 2 * area2 / (ab * bc * ca);   // 1 / circumradius
  }
  function validate(p, W) {
    var n = p.length, L = perim(p), step = L / n, minR = Math.max(24, W * 1.4), minGap = W + 29, i, j;
    var k = Math.max(2, Math.round(10 / step));
    var worst = 0;
    for (i = 0; i < n; i++) { var c = curvatureAt(p, i, k); if (c > worst) worst = c; }
    var minRadius = worst ? 1 / worst : 1e9;
    if (minRadius < minR * .9) return { ok: false, why: 'tight corner', minRadius: minRadius };
    for (i = 0; i < n; i++) {
      for (j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segInt(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return { ok: false, why: 'crosses itself', minRadius: minRadius };
      }
    }
    var exempt = Math.PI * minR * 1.15, minD = 1e9;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        var arc = Math.min(j - i, n - (j - i)) * step;
        if (arc <= exempt) continue;
        var d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
        if (d < minD) minD = d;
        if (d < minGap) return { ok: false, why: 'stretches too close', minRadius: minRadius, minGap: d };
      }
    }
    return { ok: true, minRadius: minRadius, minGap: minD, length: L };
  }

  /* ---------- per-map dressing ---------- */
  var THEME_CFG = {
    meadow:   { wx: [['day', 5], ['overcast', 2], ['rain', 2], ['fog', 1], ['storm', 1]],       el: [['rolling', 4], ['flat', 2], ['hilly', 3]] },
    forest:   { wx: [['day', 3], ['fog', 3], ['rain', 3], ['overcast', 2]],                       el: [['rolling', 3], ['hilly', 4], ['mountain', 1]] },
    desert:   { wx: [['day', 5], ['sand', 3], ['sunset', 2]],                                     el: [['flat', 3], ['rolling', 4], ['hilly', 2]] },
    snow:     { wx: [['snow', 5], ['blizzard', 2], ['overcast', 2], ['day', 2]],                  el: [['rolling', 3], ['hilly', 4], ['mountain', 3]] },
    volcanic: { wx: [['overcast', 3], ['day', 2], ['storm', 1], ['dusk', 2]],                     el: [['hilly', 4], ['mountain', 4], ['rolling', 2]] },
    coastal:  { wx: [['day', 5], ['overcast', 2], ['storm', 1], ['sunset', 2]],                   el: [['flat', 4], ['rolling', 4], ['hilly', 1]] },
    night:    { wx: [['day', 3], ['rain', 2], ['fog', 1]],                                        el: [['flat', 2], ['rolling', 4], ['hilly', 2]] },
    canyon:   { wx: [['day', 4], ['sunset', 3], ['sand', 1]],                                     el: [['hilly', 5], ['mountain', 3], ['rolling', 2]] },
    mountain: { wx: [['day', 3], ['fog', 3], ['overcast', 3], ['rain', 2], ['snow', 1]],          el: [['mountain', 6], ['hilly', 4]] },
    alpine:   { wx: [['snow', 3], ['day', 3], ['overcast', 2], ['blizzard', 1]],                  el: [['mountain', 6], ['hilly', 4]] },
    tropical: { wx: [['day', 4], ['rain', 3], ['storm', 1], ['sunset', 2]],                       el: [['rolling', 4], ['flat', 3], ['hilly', 2]] },
    rocky:    { wx: [['day', 3], ['overcast', 3], ['fog', 2], ['rain', 2]],                       el: [['hilly', 4], ['mountain', 4], ['rolling', 2]] },
    autumn:   { wx: [['autumn', 5], ['rain', 2], ['overcast', 2], ['fog', 2]],                    el: [['rolling', 4], ['hilly', 4], ['flat', 1]] },
    sunset:   { wx: [['sunset', 5], ['day', 3], ['dusk', 2]],                                     el: [['rolling', 4], ['hilly', 3], ['flat', 2]] },
    city:     { wx: [['day', 4], ['rain', 3], ['overcast', 2], ['fog', 1]],                       el: [['flat', 5], ['rolling', 3], ['hilly', 1]] },
    moon:     { wx: [['day', 1]],                                                                 el: [['rolling', 3], ['hilly', 3], ['flat', 2]] }
  };
  var ALL_THEMES = Object.keys(THEME_CFG);
  var FAMILY_THEMES = {
    oval:       ['meadow', 'coastal', 'forest', 'desert', 'sunset', 'tropical', 'autumn'],
    bean:       ['coastal', 'tropical', 'meadow', 'canyon', 'sunset', 'rocky'],
    star:       ['night', 'city', 'meadow', 'volcanic', 'sunset', 'moon'],
    esses:      ['forest', 'autumn', 'meadow', 'tropical', 'mountain', 'coastal'],
    peanut:     ['desert', 'canyon', 'rocky', 'meadow', 'snow', 'coastal'],
    speedway:   ['meadow', 'desert', 'night', 'city', 'coastal', 'sunset'],
    blocks:     ['city', 'night', 'coastal', 'snow', 'autumn', 'tropical'],
    serpentine: ['forest', 'alpine', 'tropical', 'autumn', 'meadow', 'canyon', 'snow'],
    switchback: ['mountain', 'alpine', 'volcanic', 'canyon', 'rocky', 'snow', 'forest'],
    spiral:     ['volcanic', 'mountain', 'alpine', 'rocky', 'desert', 'moon', 'snow']
  };
  var FAMILY_ELEV = { switchback: [['hilly', 4], ['mountain', 6]], spiral: [['hilly', 4], ['mountain', 5], ['rolling', 1]], speedway: [['flat', 5], ['rolling', 4], ['hilly', 1]] };
  var FAMILY_W = { oval: [14, 22], bean: [13, 20], star: [12, 18], esses: [12, 18], peanut: [14, 22], speedway: [16, 24], blocks: [12, 18], serpentine: [12, 18], switchback: [12, 16], spiral: [12, 16] };
  var FAMILY_LEN = { oval: [1800, 3000], bean: [1800, 3000], star: [2200, 3300], esses: [2000, 3200], peanut: [1800, 3000], speedway: [1800, 2800], blocks: [2000, 3200], serpentine: [2600, 3500], switchback: [2800, 3600], spiral: [2800, 3600] };
  var PLACE = {
    meadow: ['Clover', 'Willow', 'Larkfield', 'Heather', 'Greenfold', 'Daybreak'],
    forest: ['Pinewood', 'Mossy', 'Hollow', 'Fernwood', 'Deepwood', 'Timber'],
    desert: ['Dune', 'Mirage', 'Saffron', 'Sandstone', 'Oasis', 'Scorch'],
    snow: ['Frostline', 'Whiteout', 'Glacier', 'Icefall', 'Snowdrift', 'Polar'],
    volcanic: ['Ember', 'Magma', 'Cinder', 'Ashfall', 'Caldera', 'Obsidian'],
    coastal: ['Harbor', 'Seaside', 'Driftwood', 'Tidewater', 'Lighthouse', 'Pier'],
    night: ['Midnight', 'Neon', 'Moonlit', 'Starlight', 'Nocturne', 'Afterdark'],
    canyon: ['Red Rock', 'Mesa', 'Copper', 'Ridgeback', 'Redwall', 'Gorge'],
    mountain: ['Summit', 'Granite', 'Highland', 'Cloudbreak', 'Crag', 'Skyline'],
    alpine: ['Edelweiss', 'Alpenglow', 'Peakview', 'Snowline', 'Chalet', 'Pass'],
    tropical: ['Palm', 'Lagoon', 'Monsoon', 'Jungle', 'Coral', 'Bamboo'],
    rocky: ['Boulder', 'Flint', 'Shale', 'Cairn', 'Scree', 'Slate'],
    autumn: ['Amber', 'Harvest', 'Maple', 'Russet', 'Fallen Leaf', 'Orchard'],
    sunset: ['Golden Hour', 'Afterglow', 'Crimson', 'Horizon', 'Dusky', 'Vesper'],
    city: ['Downtown', 'Skyline', 'Metro', 'Uptown', 'Harbour Street', 'Boulevard'],
    moon: ['Lunar', 'Tranquility', 'Crater', 'Regolith', 'Selene', 'Orbit']
  };
  var NOUN = {
    oval: ['Oval', 'Circuit', 'Ring', 'Raceway'],
    bean: ['Bay Circuit', 'Crescent', 'Cove Loop', 'Lagoon Run'],
    star: ['Rosette', 'Starburst', 'Pinwheel', 'Cloverleaf'],
    esses: ['Ripple Ring', 'Esses Run', 'Wave Circuit', 'Chicane Ring'],
    peanut: ['Dumbbell', 'Twin Loop', 'Hourglass', 'Double Bowl'],
    speedway: ['Speedway', 'Superspeedway', 'Bowl', 'Fast Oval'],
    blocks: ['Grid Circuit', 'Street Circuit', 'Block Run', 'Grand Prix'],
    serpentine: ['Serpentine', 'Snake Run', 'S-Bend Road', 'Ribbon'],
    switchback: ['Switchbacks', 'Pass', 'Hairpin Run', 'Zigzag Ascent'],
    spiral: ['Spiral', 'Snail Loop', 'Whirl', 'Vortex']
  };

  function dress(family, r, W, minRadius) {
    var theme = r() < .7 ? pick(r, FAMILY_THEMES[family]) : pick(r, ALL_THEMES), cfg = THEME_CFG[theme];
    var weather = wpick(r, cfg.wx), elev = wpick(r, FAMILY_ELEV[family] && r() < .65 ? FAMILY_ELEV[family] : cfg.el);
    var time = theme === 'night' ? 'night' : theme === 'sunset' ? wpick(r, [['sunset', 5], ['dusk', 2], ['day', 1]])
      : (weather === 'storm' || weather === 'blizzard' || weather === 'fog' || weather === 'sand') ? wpick(r, [['day', 6], ['dusk', 3], ['night', 1]])
      : wpick(r, [['day', 50], ['sunset', 15], ['dusk', 12], ['night', 23]]);
    var name = pick(r, PLACE[theme]) + ' ' + pick(r, NOUN[family]);
    return { theme: theme, weather: weather, time: time, elev: elev, name: name };
  }

  function placeObstacles(r, p, W) {
    var n = p.length, k = Math.max(2, Math.round(10 / (perim(p) / n))), cand = [], i, out = [];
    var wanted = wpick(r, [[0, 3], [1, 3], [2, 3], [3, 2]]), ramps = r() < .3 ? (r() < .5 ? 1 : 2) : 0;
    for (i = 0; i < n; i++) {
      var u = i / n;
      if (u < .1 || u > .9) continue;
      var bad = false;
      for (var q = -8; q <= 8 && !bad; q++) if (curvatureAt(p, ((i + q) % n + n) % n, k) > 1 / 110) bad = true;
      if (!bad) cand.push(u);
    }
    function take(type, count) {
      var tries = 0;
      while (count > 0 && cand.length && tries++ < 60) {
        var u = cand[Math.floor(r() * cand.length)], ok = true;
        for (var j = 0; j < out.length; j++) { var dd = Math.abs(out[j].u - u); if (Math.min(dd, 1 - dd) < .09) ok = false; }
        if (!ok) continue;
        out.push({ t: type, u: +u.toFixed(4), s: type === 'ramp' ? (r() < .5 ? -1 : 1) : 0 });
        count--;
      }
    }
    take('ramp', ramps); take('speed_breaker', wanted);
    return out.sort(function (a, b) { return a.u - b.u; });
  }

  /* build one candidate for (id, attempt); validation outcome is returned alongside */
  function build(id, attempt) {
    var family = FAMILIES[id % 10], r = rngOf(id, attempt);
    var wr = FAMILY_W[family], lr = FAMILY_LEN[family];
    var W = Math.round(ru(r, wr[0], wr[1])), L = Math.round(ru(r, lr[0], lr[1]) / 10) * 10;
    var raw = genShape(family, r, W, L);
    var dense = scaleTo(raw, L);
    var N = Math.max(120, Math.min(330, Math.round(L / 11)));
    var pts = smoothClosed(resampleClosed(dense, N), 3);
    pts = scaleTo(pts, L);
    if (r() < .5) pts = pts.map(function (q) { return { x: -q.x, y: q.y }; });     // mirror
    if (r() < .5) pts = pts.slice().reverse();                                       // drive it the other way round
    var ang = ru(r, 0, TAU), ca = Math.cos(ang), sa = Math.sin(ang);
    pts = pts.map(function (q) { return { x: q.x * ca - q.y * sa, y: q.x * sa + q.y * ca }; });
    // start/finish on the straightest stretch, so the grid is never in a corner
    var n = pts.length, kk = Math.max(2, Math.round(10 / (L / n))), win = Math.max(4, Math.round(n * .035)), best = 0, bestScore = 1e9, i, j;
    var cur = [];
    for (i = 0; i < n; i++) cur.push(curvatureAt(pts, i, kk));
    for (i = 0; i < n; i++) {
      var sc = 0;
      for (j = -win; j <= win; j++) sc = Math.max(sc, cur[((i + j) % n + n) % n]);
      if (sc < bestScore - 1e-9) { bestScore = sc; best = i; }
    }
    pts = pts.slice(best).concat(pts.slice(0, best));
    pts = pts.map(function (q) { return { x: +q.x.toFixed(2), y: +q.y.toFixed(2) }; });
    return { family: family, W: W, L: L, pts: pts, r: r, check: validate(pts, W) };
  }

  function safeOval(id) {
    var r = rngOf(id, 999), W = 16, L = 2200, raw = polarShape(function (t) { return 1 + .06 * Math.cos(2 * t); }, 1, 1 / 1.6);
    var pts = smoothClosed(resampleClosed(scaleTo(raw, L), 200), 2);
    pts = scaleTo(pts, L).map(function (q) { return { x: +q.x.toFixed(2), y: +q.y.toFixed(2) }; });
    return { family: 'oval', W: W, L: L, pts: pts, r: r, check: validate(pts, W), fallback: true };
  }

  var MAX_ATTEMPTS = 80;
  function solve(id) {
    var a, c;
    if (ATT && ATT[id] != null) {
      if (ATT[id] < 0) return { cand: safeOval(id), attempt: -1 };
      return { cand: build(id, ATT[id]), attempt: ATT[id] };
    }
    for (a = 0; a < MAX_ATTEMPTS; a++) { c = build(id, a); if (c.check.ok) return { cand: c, attempt: a }; }
    return { cand: safeOval(id), attempt: -1 };
  }

  var memo = {};
  function generate(id) {
    id = ((id % COUNT) + COUNT) % COUNT;
    if (memo[id]) return memo[id];
    var s = solve(id), c = s.cand, r = rngOf(id, 5000 + Math.max(0, s.attempt));
    var d = dress(c.family, r, c.W, c.check.minRadius);
    if (c.fallback) d.name = 'Reserve ' + NOUN.oval[0];
    var m = {
      id: id, no: id + 1, name: d.name, family: c.family, familyLabel: FAMILY_LABEL[c.family], theme: d.theme, weather: d.weather, time: d.time,
      elev: d.elev, elevLabel: ELEV_LABEL[d.elev], width: c.W, lengthM: Math.round(c.check.length || c.L),
      seed: ((Math.imul(id + 1, 2246822519) ^ 0x2a2a2a2a) >>> 1) || 271828,
      pts: c.pts, obstacles: placeObstacles(r, c.pts, c.W), attempt: s.attempt, valid: !!c.check.ok, check: c.check
    };
    memo = {}; memo[id] = m;     // keep only the latest: a map is ~5-10 KB of points
    return m;
  }

  function dayNumber(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
    var t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Date.now();
    return Math.floor(t / 86400000);
  }
  function idForDay(n) { return (((n * MUL) % COUNT) + COUNT) % COUNT; }
  function forDate(dateStr) { return generate(idForDay(dayNumber(dateStr))); }

  var API = {
    COUNT: COUNT, FAMILIES: FAMILIES, generate: generate, forDate: forDate, idForDay: idForDay, dayNumber: dayNumber,
    validate: validate, build: build, solve: solve,
    setAttempts: function (a) { ATT = a; memo = {}; }, MAX_ATTEMPTS: MAX_ATTEMPTS
  };
  root.DailyMaps = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
