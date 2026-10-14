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
    pending[id] = fetch('assets/real/' + id + '.json?v=1791891976').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
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

    // ---------- buildings: textured walls + roofs, merged per ~300 m chunk; grandstands as raked, packed stands ----------
    (function () {
      /* split into ~300 m chunks: off-screen chunks are culled, and nothing here casts a shadow (a whole city in
         the shadow pass every frame was the biggest cost) */
      var B = R.b, LIM = low ? 3500 : 1e9, CH = 300, chunks = {}, meshes = 0, MW = 3.2, MH = 3.4;   // one window bay is 3.2 m wide, a storey 3.4 m
      /* facade tile: wall frame round one window (light glass by day, warm when lit at night). Roofs and blank walls sample
         the solid frame at uv (0.04, 0.04); industrial sheds get vertical cladding by sampling only the top band */
      function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      var fc = cv(64, 64), fx = fc.getContext('2d');
      fx.fillStyle = '#fff'; fx.fillRect(0, 0, 64, 64);
      fx.fillStyle = '#e6e6e6'; fx.fillRect(0, 54, 64, 10);                                     // floor band
      fx.fillStyle = '#3b4652'; fx.fillRect(13, 14, 38, 32);                                    // glass
      fx.fillStyle = '#5d6b78'; fx.fillRect(13, 14, 38, 6);                                     // sky in the top of the pane
      fx.fillStyle = '#d0d0d0'; fx.fillRect(31, 14, 2, 32); fx.fillRect(13, 44, 38, 3);           // mullion, sill
      var ftex = new T.CanvasTexture(fc); if (T.sRGBEncoding) ftex.encoding = T.sRGBEncoding; ftex.wrapS = ftex.wrapT = T.RepeatWrapping; ftex.anisotropy = 4;
      var etex = null;
      if (night) { var ec = cv(64, 64), ex = ec.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, 64, 64); ex.fillStyle = '#ffcf86'; ex.fillRect(13, 14, 38, 32); etex = new T.CanvasTexture(ec); etex.wrapS = etex.wrapT = T.RepeatWrapping; }
      var mat = new T.MeshStandardMaterial({ vertexColors: true, map: ftex, roughness: .82, metalness: .05,
        emissive: night ? 0xffffff : ctx.dusk ? 0x141210 : 0x000000, emissiveIntensity: night ? .55 : 1, emissiveMap: etex });
      ctx.own(mat);
      /* the crowd on a raked stand: rows of seats in team colours with people in them, mapped one seat row per 0.8 m */
      var sc = cv(128, 128), sx = sc.getContext('2d'), CC = ['#e4572e', '#f3a712', '#e9e6dc', '#2f6f9e', '#3f8a56', '#b8322f', '#5c4b8a', '#e0bd58', '#ff8000', '#27f4d2', '#dc0000', '#1e41ff'];
      sx.fillStyle = '#2a2d33'; sx.fillRect(0, 0, 128, 128);
      for (var ry = 0; ry < 16; ry++) { sx.fillStyle = ry % 2 ? '#3a3f47' : '#454b54'; sx.fillRect(0, ry * 8 + 6, 128, 2);
        for (var rx = 0; rx < 32; rx++) { var sd = Math.sin(ry * 91.7 + rx * 13.3) * 43758.5, rr = sd - Math.floor(sd); if (rr < .18) continue;
          sx.fillStyle = CC[Math.floor(rr * 997) % CC.length]; sx.fillRect(rx * 4, ry * 8 + 1, 3, 5); sx.fillStyle = '#c99b78'; sx.fillRect(rx * 4 + .5, ry * 8, 2, 2); } }
      var stex = new T.CanvasTexture(sc); if (T.sRGBEncoding) stex.encoding = T.sRGBEncoding; stex.wrapS = stex.wrapT = T.RepeatWrapping; stex.anisotropy = 4;
      var smat = new T.MeshStandardMaterial({ map: stex, roughness: .95, emissive: night ? 0x222222 : 0x000000 }); ctx.own(smat);
      function flush(c) {
        if (c.pos.length) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(c.pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(c.clr, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(c.uv, 2)); g.computeVertexNormals(); g.computeBoundingSphere();
          var m = new T.Mesh(g, mat); m.castShadow = false; m.receiveShadow = !low; m.name = 'real-buildings'; add(m); meshes++; }
        if (c.spos.length) { var g2 = new T.BufferGeometry(); g2.setAttribute('position', new T.Float32BufferAttribute(c.spos, 3)); g2.setAttribute('uv', new T.Float32BufferAttribute(c.suv, 2)); g2.computeVertexNormals(); g2.computeBoundingSphere();
          var m2 = new T.Mesh(g2, smat); m2.castShadow = false; m2.receiveShadow = !low; m2.name = 'real-stands'; add(m2); meshes++; }
      }
      var seed = 7, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var k = 0, bi = 0; k < B.length && bi < LIM; bi++) {
        var nv = B[k], h = B[k + 1] / 10, mh = B[k + 2] / 10, cls = B[k + 3]; k += 4;
        var xs = [], zs = [], g0 = 1e9, gs = 0;
        for (var v = 0; v < nv; v++) { var x = ox + B[k] / 10, z = oz + B[k + 1] / 10; k += 2; xs.push(x); zs.push(z); var gy = ground(x, z); if (gy < g0) g0 = gy; gs += gy; }
        var ck = Math.floor(xs[0] / CH) + ',' + Math.floor(zs[0] / CH), C = chunks[ck] || (chunks[ck] = { pos: [], clr: [], uv: [], spos: [], suv: [] }), pos = C.pos, clr = C.clr, uv = C.uv;
        var ga = gs / nv, bot = mh > 0 ? ga + mh : g0 - 1.2;
        var pal = PAL[cls] || PAL[0]; col.setHex(h > 45 && cls !== 2 ? [0x8fa3b5, 0x9fb0bf, 0x7f93a6][bi % 3] : pal[Math.floor(rnd() * pal.length)]).multiplyScalar(.9 + rnd() * .2);
        var wr = col.r, wg = col.g, wb = col.b;
        /* a grandstand near the track: its top rakes up away from the circuit (low at the front, full height at the
           back) and that slope is the seating, packed with spectators */
        var stand = cls === 3 && ctx.trackDist, tops = [], dv = [], dmin = 1e9, dmax = -1e9;
        if (stand) { for (v = 0; v < nv; v++) { var d = ctx.trackDist(xs[v], zs[v]); dv.push(d); if (d < dmin) dmin = d; if (d > dmax) dmax = d; } if (dmin > 160 || dmax - dmin < 4) stand = false; }
        for (v = 0; v < nv; v++) tops.push(stand ? ga + Math.max(2.5, h) * (.14 + .86 * (dv[v] - dmin) / (dmax - dmin)) : ga + h);
        var ar = 0; for (v = 0; v < nv; v++) { var v2 = (v + 1) % nv; ar += xs[v] * zs[v2] - xs[v2] * zs[v]; }
        var windows = cls === 0 || cls === 1 || (cls !== 2 && cls !== 3 && h > 6), sideU = 0;
        for (var e = 0; e < nv; e++) { var a = ar > 0 ? e : (e + 1) % nv, b = ar > 0 ? (e + 1) % nv : e;   // walls face outward
          var L = Math.hypot(xs[b] - xs[a], zs[b] - zs[a]), ua = sideU / MW, ub = (sideU + L) / MW; sideU += L;
          var vb = (bot - ga) / MH, va = (tops[a] - ga) / MH, vt = (tops[b] - ga) / MH;
          if (!windows) { ua = ub = .04; vb = va = vt = .04; if (cls === 2) { ua = sideU / 1.1; ub = (sideU + L) / 1.1; vb = va = vt = .93; } }   // plain, or cladding stripes
          pos.push(xs[a], bot, zs[a], xs[b], tops[b], zs[b], xs[b], bot, zs[b], xs[a], bot, zs[a], xs[a], tops[a], zs[a], xs[b], tops[b], zs[b]);
          uv.push(ua, vb, ub, vt, ub, vb, ua, vb, ua, va, ub, vt);
          var sh = stand ? .62 : .92; for (var q = 0; q < 6; q++) clr.push(wr * sh, wg * sh, wb * sh); }
        var cont = []; for (v = 0; v < nv; v++) cont.push(new T.Vector2(xs[v], zs[v]));
        var tri = T.ShapeUtils.triangulateShape(cont, []);
        var rr = col.r * .78, rg = col.g * .78, rb = col.b * .8;
        for (var t = 0; t < tri.length; t++) { var f = tri[t];
          // wind each roof triangle to face up
          var A = f[0], Bv = f[1], Cv = f[2], cr = (xs[Bv] - xs[A]) * (zs[Cv] - zs[A]) - (zs[Bv] - zs[A]) * (xs[Cv] - xs[A]);
          if (cr > 0) { var tmp = Bv; Bv = Cv; Cv = tmp; }
          if (stand) {   // seating: texture rows run across the slope, so v follows distance from the track
            C.spos.push(xs[A], tops[A], zs[A], xs[Bv], tops[Bv], zs[Bv], xs[Cv], tops[Cv], zs[Cv]);
            [A, Bv, Cv].forEach(function (i) { C.suv.push((xs[i] + zs[i]) / 6.4, (dv[i] - dmin) / 12.8); });
          } else { pos.push(xs[A], tops[A], zs[A], xs[Bv], tops[Bv], zs[Bv], xs[Cv], tops[Cv], zs[Cv]); clr.push(rr, rg, rb, rr, rg, rb, rr, rg, rb); uv.push(.04, .04, .04, .04, .04, .04); }
        }
        made.buildings++; if (stand) made.stands = (made.stands || 0) + 1;
      }
      Object.keys(chunks).forEach(function (k) { flush(chunks[k]); }); made.chunks = meshes;
    })();

    // ---------- water surfaces (lakes, rivers, docks) ----------
    (function () {
      var Wt = R.w, mat = new T.MeshStandardMaterial({ color: 0x2c6d8c, roughness: .25, metalness: .15, side: T.DoubleSide }); ctx.own(mat);
      var all = [];
      for (var k = 0; k < Wt.length;) {
        var lvl = Wt[k] / 10, rings = Wt[k + 1]; k += 2; var shape = null;
        for (var r = 0; r < rings; r++) { var nv = Wt[k++], pts = []; for (var v = 0; v < nv; v++) { pts.push(new T.Vector2(Wt[k] / 10, -Wt[k + 1] / 10)); k += 2; }
          if (r === 0) shape = new T.Shape(pts); else shape.holes.push(new T.Path(pts)); }
        try { var g = new T.ShapeGeometry(shape).toNonIndexed(); g.rotateX(-Math.PI / 2); g.translate(ox, Y0 + lvl + .05, oz); var a = g.attributes.position.array; for (var q = 0; q < a.length; q++) all.push(a[q]); made.water++; } catch (e) {}
      }
      if (all.length) { var wg = new T.BufferGeometry(); wg.setAttribute('position', new T.Float32BufferAttribute(all, 3)); wg.computeVertexNormals();   // every lake and river in one draw
        var wm = new T.Mesh(wg, mat); wm.receiveShadow = !low; wm.name = 'real-water'; add(wm); }
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
      var m = new T.Mesh(g, mat); m.receiveShadow = !low; m.material.side = T.DoubleSide; m.name = name; add(m);
    }
    var roadW = function (S, k) { return S[k + 1] / 10; }; roadW.skip = 2;
    ribbons(R.r, roadW, function (x, z) { return ground(x, z) + .14; }, 0x3f3f43, 'real-roads');
    var pierW = function () { return 7; }; pierW.skip = 1;
    ribbons(R.p, pierW, function (x, z) { return R.sea != null ? Math.max(Y0 + R.sea + 1.6, ground(x, z) + .3) : ground(x, z) + .3; }, 0x9a958a, 'real-piers');

    // ---------- trees in the real woods and parks: broadleaf (lumpy two-blob crowns) and conifers (stacked tiers),
    //            one instanced set of each per ~300 m chunk, culled off screen ----------
    (function () {
      var Tt = R.t, cnt = Math.min(Tt.length / 3, low ? 1500 : 4000); if (!cnt) return;
      var crownM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true }), trunkM = new T.MeshLambertMaterial({ color: 0x4a3a2a }); ctx.own(crownM); ctx.own(trunkM);
      // broadleaf crown: two jittered icosahedra, merged (40 triangles), base at y = 0, about 1 wide and 1 tall
      var blob = (function () { var out = [], sd = 3, r = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        [[0, .52, 0, .5, .48], [.22, .7, .12, .36, .34]].forEach(function (b) { var g = new T.IcosahedronGeometry(1, 0).toNonIndexed(), a = g.attributes.position.array, jit = {};
          for (var i = 0; i < a.length; i += 3) { var key = a[i].toFixed(3) + a[i + 1].toFixed(3) + a[i + 2].toFixed(3), j = jit[key] || (jit[key] = .82 + r() * .3);
            out.push(b[0] + a[i] * b[3] * j, b[1] + a[i + 1] * b[4] * j, b[2] + a[i + 2] * b[3] * j); } });
        var g2 = new T.BufferGeometry(); g2.setAttribute('position', new T.Float32BufferAttribute(out, 3)); g2.computeVertexNormals(); return g2; })();
      // conifer: two stacked six-sided tiers
      var pine = (function () { var a = new T.ConeGeometry(.5, .62, 6).translate(0, .31, 0).toNonIndexed(), b = new T.ConeGeometry(.36, .5, 6).translate(0, .75, 0).toNonIndexed(), out = [];
        [a, b].forEach(function (g) { var p = g.attributes.position.array; for (var i = 0; i < p.length; i++) out.push(p[i]); });
        var g3 = new T.BufferGeometry(); g3.setAttribute('position', new T.Float32BufferAttribute(out, 3)); g3.computeVertexNormals(); return g3; })();
      var cyl = new T.CylinderGeometry(.1, .16, 1, 5).translate(0, .5, 0);
      var M4 = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), Sx = new T.Vector3(), c = new T.Color(), up = new T.Vector3(0, 1, 0), seed = 11, CH = 300, groups = {};
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (var i = 0; i < cnt; i++) { var x = ox + Tt[i * 3] / 10, z = oz + Tt[i * 3 + 1] / 10, k = Math.floor(x / CH) + ',' + Math.floor(z / CH); (groups[k] || (groups[k] = [])).push(i); }
      Object.keys(groups).forEach(function (k) { var L = groups[k], kinds = L.map(function () { return rnd() < .3 ? 1 : 0; }), nB = 0, nP = 0;
        kinds.forEach(function (q) { if (q) nP++; else nB++; });
        var gb = blob.clone(), gp = pine.clone(), gt = cyl.clone(), crownB = new T.InstancedMesh(gb, crownM, Math.max(1, nB)), crownP = new T.InstancedMesh(gp, crownM, Math.max(1, nP)), trunk = new T.InstancedMesh(gt, trunkM, L.length);
        var lo = new T.Vector3(1e9, 1e9, 1e9), hi = new T.Vector3(-1e9, -1e9, -1e9), jb = 0, jp = 0;
        L.forEach(function (i, j) { var x = ox + Tt[i * 3] / 10, z = oz + Tt[i * 3 + 1] / 10, h = Tt[i * 3 + 2] / 10, y = ground(x, z) - .2, isP = kinds[j];
          Q.setFromAxisAngle(up, rnd() * 6.28);
          if (isP) { P.set(x, y + h * .18, z); Sx.set(h * .42, h * .86, h * .42); M4.compose(P, Q, Sx); crownP.setMatrixAt(jp, M4); c.setHSL(.33 + rnd() * .06, .28 + rnd() * .14, .12 + rnd() * .07); crownP.setColorAt(jp++, c); }
          else { var w = .55 + rnd() * .25; P.set(x, y + h * .3, z); Sx.set(h * w, h * .74, h * w); M4.compose(P, Q, Sx); crownB.setMatrixAt(jb, M4); c.setHSL(.2 + rnd() * .1, .3 + rnd() * .18, .15 + rnd() * .1); crownB.setColorAt(jb++, c); }
          P.set(x, y, z); Sx.set(h * .08, h * .36, h * .08); M4.compose(P, Q, Sx); trunk.setMatrixAt(j, M4);
          lo.min(new T.Vector3(x, y, z)); hi.max(new T.Vector3(x, y + h * 1.1, z)); });
        crownB.count = jb; crownP.count = jp;
        // bounds of the whole chunk, so culling works on the instances rather than on one small mesh at the origin
        var sph = new T.Sphere(); new T.Box3(lo, hi).getBoundingSphere(sph); sph.radius += 12; gb.boundingSphere = sph; gp.boundingSphere = sph.clone(); gt.boundingSphere = sph.clone();
        crownB.castShadow = crownP.castShadow = trunk.castShadow = false; crownB.name = crownP.name = 'real-trees';
        if (jb) add(crownB); if (jp) add(crownP); add(trunk); });
      made.trees = cnt;
    })();
    return made;
  }

  window.F1Real = { load: load, get: function (id) { return cache[id] || null; }, build: build };
})();
