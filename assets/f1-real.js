/* Real surroundings for the F1 circuits: assets/real/<id>.json, made by scripts/build-real-world.js from
   OpenStreetMap (buildings, water, woods, roads, piers) and measured terrain. Everything is already in the game's
   centred circuit coordinates; this file loads it and draws it.
     F1Real.load(id)  -> Promise of the decoded data (cached)
     F1Real.get(id)   -> the decoded data if already loaded, else null
     F1Real.build(R, ctx) draws buildings, water, roads, piers and trees into the circuit (ctx from game.js F1 landmarks)
   Map data (c) OpenStreetMap contributors, ODbL. */
(function () {
  'use strict';
  var cache = {}, pending = {};
  function i16(b64) { var s = atob(b64), n = s.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = s.charCodeAt(i); return new Int16Array(u.buffer, 0, n >> 1); }
  function decode(j) {
    var h = i16(j.dem.h), H = new Float32Array(h.length), mn = 1e9;
    for (var i = 0; i < h.length; i++) { H[i] = h[i] / 10; if (H[i] < mn) mn = H[i]; }
    return { id: j.id, prof: j.prof, sea: j.sea, credit: j.credit,
      dem: { x0: j.dem.x0, z0: j.dem.z0, cell: j.dem.cell, nx: j.dem.nx, nz: j.dem.nz, h: H, min: mn, sea: j.sea },
      b: i16(j.b), w: i16(j.w), r: i16(j.r), p: i16(j.p), t: i16(j.t) };
  }
  function load(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    if (pending[id]) return pending[id];
    pending[id] = fetch('assets/real/' + id + '.json?v=1791879422').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { cache[id] = decode(j); delete pending[id]; return cache[id]; })
      .catch(function (e) { delete pending[id]; console.warn('real surroundings for', id, 'not loaded:', e.message); return null; });
    return pending[id];
  }

  // building colours by kind: housing, commercial/office, industrial, stands, open roofs
  var PAL = [[0xd8cbb4, 0xc9b79a, 0xe4ddd0, 0xbfa58a, 0xd6c3a5], [0xb9c0c8, 0xa7b3bf, 0xd2d5d8, 0x93a2b0], [0xa8a49c, 0x9a9890, 0xb8b2a6], [0xc8c8c8, 0xb0b4b8], [0x8e9196, 0xa0a3a8]];

  function build(R, ctx) {
    var T = ctx.THREE, ox = ctx.ox, oz = ctx.oz, Y0 = ctx.at(0).y, night = ctx.night, low = ctx.low;
    var ground = function (x, z) { return ctx.ground(x, z); };
    // already cleared of the track when the data was built: the game's own clearance pass must leave these whole
    var add = function (o) { o.userData.onTrack = true; return ctx.add(o); };
    var col = new T.Color(), n = 0, made = { buildings: 0, trees: 0, water: 0 };

    // ---------- buildings: walls + flat roofs, merged into a few big meshes ----------
    (function () {
      var B = R.b, LIM = low ? 4000 : 1e9, pos = [], clr = [], meshes = 0;
      var mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .05, flatShading: true,
        emissive: night ? 0x2a2620 : ctx.dusk ? 0x141210 : 0x000000 });
      ctx.own(mat);
      function flush() { if (!pos.length) return; var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(clr, 3)); g.computeVertexNormals();
        var m = new T.Mesh(g, mat); m.castShadow = !low; m.receiveShadow = true; m.name = 'real-buildings'; add(m); pos = []; clr = []; meshes++; }
      var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var k = 0, bi = 0; k < B.length && bi < LIM; bi++) {
        var nv = B[k], h = B[k + 1] / 10, mh = B[k + 2] / 10, cls = B[k + 3]; k += 4;
        var xs = [], zs = [], g0 = 1e9, gs = 0;
        for (var v = 0; v < nv; v++) { var x = ox + B[k] / 10, z = oz + B[k + 1] / 10; k += 2; xs.push(x); zs.push(z); var gy = ground(x, z); if (gy < g0) g0 = gy; gs += gy; }
        var ga = gs / nv, bot = mh > 0 ? ga + mh : g0 - 1.2, top = ga + h;
        var pal = PAL[cls] || PAL[0]; col.setHex(h > 45 && cls !== 2 ? [0x8fa3b5, 0x9fb0bf, 0x7f93a6][bi % 3] : pal[Math.floor(rnd() * pal.length)]).multiplyScalar(.9 + rnd() * .2);
        var wr = col.r, wg = col.g, wb = col.b, lit = night && rnd() < .55 ? 1 : 0;
        if (lit) { wr = wr * .55 + .45; wg = wg * .55 + .38; wb = wb * .55 + .22; }   // warm lit facades at night
        var ar = 0; for (v = 0; v < nv; v++) { var v2 = (v + 1) % nv; ar += xs[v] * zs[v2] - xs[v2] * zs[v]; }
        for (var e = 0; e < nv; e++) { var a = ar > 0 ? e : (e + 1) % nv, b = ar > 0 ? (e + 1) % nv : e;   // walls face outward
          pos.push(xs[a], bot, zs[a], xs[b], top, zs[b], xs[b], bot, zs[b], xs[a], bot, zs[a], xs[a], top, zs[a], xs[b], top, zs[b]);
          for (var q = 0; q < 6; q++) clr.push(wr * .92, wg * .92, wb * .92); }
        var cont = []; for (v = 0; v < nv; v++) cont.push(new T.Vector2(xs[v], zs[v]));
        var tri = T.ShapeUtils.triangulateShape(cont, []);
        var rr = col.r * .78, rg = col.g * .78, rb = col.b * .8;
        for (var t = 0; t < tri.length; t++) { var f = tri[t];
          // wind each roof triangle to face up
          var A = f[0], Bv = f[1], Cv = f[2], cr = (xs[Bv] - xs[A]) * (zs[Cv] - zs[A]) - (zs[Bv] - zs[A]) * (xs[Cv] - xs[A]);
          if (cr > 0) { var tmp = Bv; Bv = Cv; Cv = tmp; }
          pos.push(xs[A], top, zs[A], xs[Bv], top, zs[Bv], xs[Cv], top, zs[Cv]); clr.push(rr, rg, rb, rr, rg, rb, rr, rg, rb); }
        made.buildings++;
        if (pos.length > 540000) flush();
      }
      flush();
    })();

    // ---------- water surfaces (lakes, rivers, docks) ----------
    (function () {
      var Wt = R.w, mat = new T.MeshStandardMaterial({ color: 0x2c6d8c, roughness: .25, metalness: .15, side: T.DoubleSide }); ctx.own(mat);
      for (var k = 0; k < Wt.length;) {
        var lvl = Wt[k] / 10, rings = Wt[k + 1]; k += 2; var shape = null;
        for (var r = 0; r < rings; r++) { var nv = Wt[k++], pts = []; for (var v = 0; v < nv; v++) { pts.push(new T.Vector2(Wt[k] / 10, -Wt[k + 1] / 10)); k += 2; }
          if (r === 0) shape = new T.Shape(pts); else shape.holes.push(new T.Path(pts)); }
        try { var g = new T.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); var m = new T.Mesh(g, mat); m.position.set(ox, Y0 + lvl + .05, oz); m.receiveShadow = true; m.name = 'real-water'; add(m); made.water++; } catch (e) {}
      }
    })();

    // ---------- ribbons: nearby streets on the ground, piers over the water ----------
    function ribbons(S, widthOf, yOf, color, name) {
      var pos = [], mat = new T.MeshStandardMaterial({ color: color, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); ctx.own(mat);
      for (var k = 0; k < S.length;) {
        var nv = S[k], w = widthOf(S, k); k += widthOf.skip; var P = [];
        for (var v = 0; v < nv; v++) { P.push([ox + S[k] / 10, oz + S[k + 1] / 10]); k += 2; }
        for (v = 0; v < P.length - 1; v++) { var a = P[v], b = P[v + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
          var ya = yOf(a[0], a[1]), yb = yOf(b[0], b[1]);
          pos.push(a[0] + nx, ya, a[1] + nz, b[0] + nx, yb, b[1] + nz, b[0] - nx, yb, b[1] - nz, a[0] + nx, ya, a[1] + nz, b[0] - nx, yb, b[1] - nz, a[0] - nx, ya, a[1] - nz); }
      }
      if (!pos.length) return; var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      var m = new T.Mesh(g, mat); m.receiveShadow = true; m.material.side = T.DoubleSide; m.name = name; add(m);
    }
    var roadW = function (S, k) { return S[k + 1] / 10; }; roadW.skip = 2;
    ribbons(R.r, roadW, function (x, z) { return ground(x, z) + .14; }, 0x3f3f43, 'real-roads');
    var pierW = function () { return 7; }; pierW.skip = 1;
    ribbons(R.p, pierW, function (x, z) { return R.sea != null ? Math.max(Y0 + R.sea + 1.6, ground(x, z) + .3) : ground(x, z) + .3; }, 0x9a958a, 'real-piers');

    // ---------- trees in the real woods and parks ----------
    (function () {
      var Tt = R.t, cnt = Math.min(Tt.length / 3, low ? 2500 : 9000); if (!cnt) return;
      var crownM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .9, flatShading: true }), trunkM = new T.MeshStandardMaterial({ color: 0x5a4632, roughness: .95 }); ctx.own(crownM); ctx.own(trunkM);
      var crown = new T.InstancedMesh(new T.ConeGeometry(1, 1, 6).translate(0, .5, 0), crownM, cnt), trunk = new T.InstancedMesh(new T.CylinderGeometry(.12, .16, 1, 5).translate(0, .5, 0), trunkM, cnt);
      var M4 = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), Sx = new T.Vector3(), c = new T.Color(), seed = 11;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var i = 0; i < cnt; i++) { var x = ox + Tt[i * 3] / 10, z = oz + Tt[i * 3 + 1] / 10, h = Tt[i * 3 + 2] / 10, y = ground(x, z) - .2, round = rnd() < .45;
        P.set(x, y + h * .28, z); Sx.set(h * (round ? .34 : .27), h * .78, h * (round ? .34 : .27)); Q.setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * 6.28); M4.compose(P, Q, Sx); crown.setMatrixAt(i, M4);
        c.setHSL(.26 + rnd() * .08, .42 + rnd() * .2, .2 + rnd() * .12); crown.setColorAt(i, c);
        P.set(x, y, z); Sx.set(h * .1, h * .32, h * .1); M4.compose(P, Q, Sx); trunk.setMatrixAt(i, M4); }
      crown.frustumCulled = trunk.frustumCulled = false;   // instances span the whole area; the base cone's bounds would cull them
      crown.castShadow = !low; crown.name = 'real-trees'; add(crown); add(trunk); made.trees = cnt;
    })();
    return made;
  }

  window.F1Real = { load: load, get: function (id) { return cache[id] || null; }, build: build };
})();
