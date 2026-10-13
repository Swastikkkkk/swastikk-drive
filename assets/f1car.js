/* A modern Formula 1 car, built from code (no model files): lofted nose, monocoque, engine cover with airbox and
   sidepods, floor and diffuser, a four-element front wing, rear wing with DRS flap and beam wing, halo, driver's
   helmet, mirrors, suspension arms, 18-inch wheels with covers and Pirelli compound stripes, rain light.

     F1Car.build({ primary, secondary, accent, compound, zf, zb, xw, r })
       -> { g, body, wheels: [{ w, spin }] (front two steer), tail, paint }   (the same shape every car builder in the
          game returns: g is placed on the road, body pitches, wheels spin, tail is the brake/rain light)

   Modelled at real size (5.6 m long, 2.0 m wide, 3.6 m wheelbase, 720 mm tyres) and scaled so the axles land on the
   asked-for zf / zb. Geometry is cached and shared by every car of a team, so a 22-car grid stays cheap: each car is
   a painted body, a vertex-coloured body (carbon, accents) and four wheels. */
(function () {
  'use strict';
  var T = window.THREE;
  var RWB = 3.6, RZF = 1.85, RZB = -1.75, RTF = .80, RTR = .78, RR = .36;   // real wheelbase, axles, half tracks, tyre radius

  // ---------- small geometry kit ----------
  // superellipse cross-sections lofted along z: [z, cx, cy, halfWidth, halfHeight, squareness]
  function loft(S, n, caps) {
    var pos = [], idx = [], ring = function (s, k) { var a = k / n * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), p = 2 / (s[5] || 2.5);
      return [s[1] + s[3] * Math.sign(c) * Math.pow(Math.abs(c), p), s[2] + s[4] * Math.sign(sn) * Math.pow(Math.abs(sn), p), s[0]]; };
    S.forEach(function (s) { for (var k = 0; k < n; k++) pos.push.apply(pos, ring(s, k)); });
    for (var i = 0; i < S.length - 1; i++) for (var k = 0; k < n; k++) { var a = i * n + k, b = i * n + (k + 1) % n, c = a + n, d = b + n; idx.push(a, c, b, b, c, d); }
    if (caps) [0, S.length - 1].forEach(function (i, e) { var s = S[i], ci = pos.length / 3; pos.push(s[1], s[2], s[0]);
      for (var k = 0; k < n; k++) { var a = i * n + k, b = i * n + (k + 1) % n; if (e === 0) idx.push(ci, b, a); else idx.push(ci, a, b); } });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function box(w, h, d, x, y, z, rx, ry, rz) { var g = new T.BoxGeometry(w, h, d); place(g, x, y, z, rx, ry, rz); return g; }
  function place(g, x, y, z, rx, ry, rz) { var m = new T.Matrix4().makeRotationFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)); m.setPosition(x || 0, y || 0, z || 0); g.applyMatrix4(m); return g; }
  function rod(a, b, r) {   // a thin cylinder between two points (suspension arms, pylons)
    var A = new T.Vector3().fromArray(a), B = new T.Vector3().fromArray(b), L = A.distanceTo(B), g = new T.CylinderGeometry(r, r, L, 5);
    var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyMatrix4(new T.Matrix4().compose(A.clone().add(B).multiplyScalar(.5), q, new T.Vector3(1, 1, 1))); return g; }
  function wing(span, chord, thick, x, y, z, aoa, sweepUp) {   // an aerofoil-ish slab: thick leading edge, thin trailing edge, tips curling up
    var n = 5, i, pos = [], idx = [], seg = 8;
    for (var j = 0; j <= seg; j++) { var u = j / seg * 2 - 1, xx = x + u * span / 2, lift = sweepUp ? Math.pow(Math.abs(u), 6) * sweepUp : 0;
      for (var i2 = 0; i2 <= n; i2++) { var t2 = i2 / n, zz = z + chord / 2 - chord * t2, th = thick * (1 - t2 * .8) * Math.sin(Math.PI * Math.min(1, t2 * 1.4 + .15));
        var yy = y + lift + (t2 * chord) * Math.sin(aoa); pos.push(xx, yy + th / 2, zz, xx, yy - th / 2, zz); } }
    var row = (n + 1) * 2;
    for (j = 0; j < seg; j++) for (i = 0; i < n; i++) { var a = j * row + i * 2, b = a + 2, c = a + row, d = c + 2;
      idx.push(a, c, b, b, c, d); idx.push(a + 1, b + 1, c + 1, b + 1, d + 1, c + 1); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function tint(g, hex) { var c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new T.BufferAttribute(a, 3)); return g; }
  function merge(list) {   // non-indexed merge of position / normal / colour
    var P = [], N = [], C = [];
    list.forEach(function (g) { g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals();
      var p = g.attributes.position.array, nn = g.attributes.normal.array, c = g.attributes.color ? g.attributes.color.array : null;
      for (var i = 0; i < p.length; i++) { P.push(p[i]); N.push(nn[i]); C.push(c ? c[i] : 1); } });
    var out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); out.setAttribute('color', new T.Float32BufferAttribute(C, 3)); return out;
  }

  // ---------- the painted shell (one shape for every team) ----------
  var SHELL = null;
  function shell() {
    if (SHELL) return SHELL;
    var parts = [];
    // nose + monocoque, tip at the front wing to the cockpit
    parts.push(loft([[2.98, 0, .27, .05, .04, 2.4], [2.75, 0, .29, .10, .07, 2.6], [2.3, 0, .34, .15, .11, 2.8], [1.8, 0, .40, .21, .15, 3], [1.3, 0, .46, .26, .19, 3.2],
      [.8, 0, .50, .31, .21, 3.6], [.35, 0, .52, .35, .22, 4], [-.25, 0, .53, .37, .24, 4]], 14, true));
    // engine cover rising into the airbox behind the driver and tapering down to the gearbox
    parts.push(loft([[-.2, 0, .58, .33, .27, 3.4], [-.45, 0, .70, .27, .36, 3], [-.8, 0, .66, .27, .31, 3], [-1.25, 0, .56, .24, .23, 3], [-1.7, 0, .47, .17, .16, 3],
      [-2.1, 0, .41, .09, .10, 2.6], [-2.3, 0, .38, .04, .05, 2.4]], 14, true));
    // shark fin
    parts.push(box(.02, .22, .9, 0, .86, -1.25, .18, 0, 0));
    // sidepods with the undercut (narrow at the bottom), each side
    [-1, 1].forEach(function (s) {
      parts.push(loft([[.5, s * .5, .43, .05, .08, 3], [.38, s * .55, .44, .22, .15, 4], [-.1, s * .56, .44, .26, .16, 4], [-.75, s * .5, .40, .21, .14, 3.5],
        [-1.35, s * .37, .35, .12, .10, 3], [-1.75, s * .27, .32, .05, .06, 2.6]], 10, true)); });
    // rear wing main plane, front wing upper flap and nose pylons in body colour
    parts.push(wing(1.0, .3, .05, 0, .82, -2.5, -.08, 0));
    parts.push(wing(1.86, .1, .015, 0, .24, 2.62, -.55, .1));
    SHELL = merge(parts.map(function (g) { return tint(g, 0xffffff); }));
    return SHELL;
  }

  // ---------- carbon, accents and details (vertex coloured, one per livery) ----------
  var DETAIL = {};
  function detail(acc, sec) {
    var key = acc + ':' + sec; if (DETAIL[key]) return DETAIL[key];
    var K = 0x141416, D = 0x0a0a0b, parts = [], add = function (g, c) { parts.push(tint(g, c)); };
    // floor, plank, floor edges and the diffuser ramp
    add(box(1.62, .03, 2.95, 0, .05, -.45), K); add(box(.3, .02, 2.6, 0, .03, -.4), 0x6b5a3a);
    [-1, 1].forEach(function (s) { add(box(.04, .07, 2.1, s * .8, .08, -.4), K); add(box(.03, .12, .5, s * .52, .1, -1.75, 0, 0, 0), K); });
    add(box(1.0, .03, .62, 0, .16, -2.05, -.42, 0, 0), K);
    for (var f = -2; f <= 2; f++) add(box(.015, .2, .55, f * .2, .17, -2.05, -.42, 0, 0), K);
    // front wing: carbon main planes, accent flaps, endplates
    add(wing(1.94, .26, .035, 0, .12, 2.82, -.08, .06), K);
    add(wing(1.9, .16, .022, 0, .16, 2.70, -.3, .08), sec);
    add(wing(1.88, .12, .018, 0, .2, 2.62, -.45, .09), acc);
    [-1, 1].forEach(function (s) { add(box(.02, .24, .55, s * .97, .19, 2.73), acc); add(box(.02, .18, .06, s * .14, .21, 2.82), K); });
    // rear wing: DRS flap, endplates, beam wing, swan-neck pylon, rain light housing
    add(wing(.98, .17, .02, 0, .96, -2.36, -.55, 0), sec);
    [-1, 1].forEach(function (s) { add(box(.02, .5, .62, s * .5, .78, -2.45), acc); });
    add(wing(.9, .15, .03, 0, .4, -2.25, -.2, 0), K);
    add(box(.04, .45, .14, 0, .62, -2.28, .25, 0, 0), K);
    // cockpit opening, headrest, halo, helmet and visor, steering wheel hint
    add(loft([[.35, 0, .69, .19, .02, 2.4], [-.15, 0, .73, .21, .02, 2.4]], 14, true), D);
    add(box(.5, .12, .2, 0, .72, -.2), sec);
    var halo = new T.TorusGeometry(.36, .035, 4, 12, Math.PI); place(halo, 0, .86, .02, Math.PI / 2, 0, Math.PI / 2); add(halo, K);
    add(rod([0, .9, .38], [0, .66, .62], .03), K);
    [-1, 1].forEach(function (s) { add(rod([s * .36, .86, .02], [s * .34, .66, -.12], .03), K); });
    var helmet = new T.SphereGeometry(.13, 8, 6); place(helmet, 0, .82, -.02); add(helmet, acc);
    add(box(.2, .045, .1, 0, .84, .07), D);
    // airbox intake, T-camera, mirrors, sidepod inlets
    var intake = new T.CylinderGeometry(.11, .13, .06, 8); place(intake, 0, 1.0, -.3, Math.PI / 2 - .2, 0, 0); add(intake, D);
    add(box(.08, .04, .12, 0, 1.08, -.48), 0x1a1a1a);
    [-1, 1].forEach(function (s) { add(rod([s * .28, .66, .48], [s * .44, .74, .44], .012), K); add(box(.12, .055, .03, s * .47, .76, .44), K); add(box(.03, .18, .18, s * .56, .44, .4), D); });
    // suspension: wishbones, push / pull rods, track rods (front and rear)
    [[RZF, RTF, .26], [RZB, RTR, .28]].forEach(function (A) { var z = A[0], tr = A[1], y = A[2];
      [-1, 1].forEach(function (s) { var hx = s * (tr - .17);
        add(rod([s * .2, y + .2, z + .25], [hx, y + .16, z], .016), K); add(rod([s * .2, y + .2, z - .25], [hx, y + .16, z], .016), K);
        add(rod([s * .18, y - .02, z + .28], [hx, y - .06, z], .016), K); add(rod([s * .18, y - .02, z - .28], [hx, y - .06, z], .016), K);
        add(rod([s * .22, y + .26, z - .1], [hx, y - .02, z + .02], .014), K); }); });
    DETAIL[key] = merge(parts); return DETAIL[key];
  }

  // ---------- wheels: tyre + compound stripe + rim + wheel cover, around the x axis ----------
  var WHEEL = {};
  function wheel(front, compound) {
    var key = (front ? 'f' : 'r') + compound; if (WHEEL[key]) return WHEEL[key];
    var w = front ? .3 : .38, r = RR, rim = .23, prof = [];
    for (var i = 0; i <= 6; i++) { var a = -Math.PI / 2 + Math.PI * i / 6; prof.push(new T.Vector2(rim + (r - rim) * (.55 + .45 * Math.cos(a)) + .02 * Math.cos(a), w / 2 * Math.sin(a) * 1.02)); }
    var tyre = new T.LatheGeometry(prof, 16); tyre.rotateZ(Math.PI / 2);
    var stripeC = { soft: 0xe10600, medium: 0xffd12e, hard: 0xf2f2f2, inter: 0x2fb34a, wet: 0x1f7ae0 }[compound] || 0xffd12e;
    var parts = [tint(tyre, 0x161616)];
    [-1, 1].forEach(function (s) { var st = new T.TorusGeometry(.29, .011, 3, 16); st.rotateY(Math.PI / 2); st.translate(s * (w / 2 + .004), 0, 0); parts.push(tint(st, stripeC)); });
    var cover = new T.CylinderGeometry(rim, rim, w * .82, 12); cover.rotateZ(Math.PI / 2); parts.push(tint(cover, 0x1d1e21));
    var hub = new T.CylinderGeometry(.06, .06, w + .02, 8); hub.rotateZ(Math.PI / 2); parts.push(tint(hub, 0x8a8d92));
    for (var k = 0; k < 5; k++) { var sp = new T.BoxGeometry(.012, .2, .03); sp.translate(0, .11, 0); sp.rotateX(k / 5 * Math.PI * 2); sp.translate(w * .42, 0, 0); parts.push(tint(sp, 0x3a3c40)); }
    WHEEL[key] = merge(parts); return WHEEL[key];
  }

  var CARBON = null, TYRE = null;
  function build(o) {
    o = o || {};
    var primary = o.primary != null ? o.primary : 0xdc0000, sec = o.secondary != null ? o.secondary : 0x111111, acc = o.accent != null ? o.accent : 0xf2f2f2;
    var zf = o.zf != null ? o.zf : 1.5, zb = o.zb != null ? o.zb : -1.5, k = (zf - zb) / RWB, xw = o.xw;
    var g = new T.Group(), body = new T.Group(), model = new T.Group(); g.add(body); body.add(model);
    model.scale.set(xw ? xw / RTF : k, k, k); model.position.z = (zf + zb) / 2 - (RZF + RZB) / 2 * k;
    var paint = new T.MeshStandardMaterial({ color: primary, metalness: .45, roughness: .32, envMap: window.CarBuilder && window.CarBuilder.CARENV || null, envMapIntensity: .6 });
    CARBON = CARBON || new T.MeshStandardMaterial({ vertexColors: true, metalness: .2, roughness: .55 });
    TYRE = TYRE || new T.MeshStandardMaterial({ vertexColors: true, metalness: .1, roughness: .85 });
    paint.vertexColors = true; var paintV = paint, a = new T.Mesh(shell(), paint);
    var b = new T.Mesh(detail(acc, sec), CARBON);
    // one shadow draw per car; the curved shell never receives shadows (it banded itself with stripes of shadow acne)
    a.castShadow = true; b.castShadow = false; a.receiveShadow = false; b.receiveShadow = true; model.add(a); model.add(b);
    var tail = new T.MeshLambertMaterial({ color: 0xff2a20, emissive: 0xff2a20, emissiveIntensity: .55 });
    var rl = new T.Mesh(new T.BoxGeometry(.08, .1, .03), tail); rl.position.set(0, .3, -2.32); model.add(rl);
    var wheels = [];
    if (!o.noWheels) [[RZF, RTF, true], [RZF, -RTF, true], [RZB, RTR, false], [RZB, -RTR, false]].forEach(function (W) {   // the player's car: the game draws its own wheels
      var w = new T.Group(); w.position.set(W[1], RR, W[0]); var spin = new T.Mesh(wheel(W[2], o.compound || 'medium'), TYRE); spin.castShadow = false; w.add(spin); model.add(w); wheels.push({ w: w, spin: spin }); });
    // ride height: tyres on the ground at the asked-for wheel radius (the game's r) when given
    if (o.r) model.position.y = o.r - RR * k;
    return { g: g, body: body, wheels: wheels, tail: tail, paint: paintV, f1: true, shell: a, detail: b };
  }

  // 2026 liveries, by team (primary body, secondary flaps, accent endplates / helmet)
  var TEAMS = {
    mclaren: [0xff8000, 0x111111, 0x47c7fc], ferrari: [0xdc0000, 0xf2f2f2, 0x111111], redbull: [0x1e2a5a, 0xdc0a2d, 0xffd12e], mercedes: [0x1c1c1f, 0x27f4d2, 0xc4c8cc],
    aston: [0x00594f, 0xcedc00, 0x111111], alpine: [0x0a5bd8, 0xff87bc, 0x111111], williams: [0x0a2a6b, 0x00a0de, 0xf2f2f2], rb: [0xf2f2f2, 0x1634cb, 0xdc0a2d],
    haas: [0xf2f2f2, 0x111111, 0xdc0a2d], audi: [0x9fa3a8, 0x111111, 0xd40000], cadillac: [0x111111, 0xf2f2f2, 0xc8102e]
  };
  // an F1 wheel on its own (axle along x, tyre radius 0.36 m) for the game's own spinning / steering wheel groups
  function wheelMesh(front, compound) { TYRE = TYRE || new T.MeshStandardMaterial({ vertexColors: true, metalness: .1, roughness: .85 }); var m = new T.Mesh(wheel(front, compound || 'soft'), TYRE); m.castShadow = false; return m; }
  window.F1Car = { build: build, wheelMesh: wheelMesh, TEAMS: TEAMS, RR: RR };
})();
