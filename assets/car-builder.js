/**
 * Procedural Vehicle 3D Mesh Generator: buildEV, buildCar, wheels, materials, and decals
 */
(function(window) {
  var CARENV = (function() {
    var cv = function(fn) {
      var c = document.createElement('canvas'); c.width = c.height = 64;
      fn(c.getContext('2d')); return c;
    };
    var side = cv(function(x) {
      var g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#566b82'); g.addColorStop(0.46, '#9aa6b0');
      g.addColorStop(0.52, '#3c3b37'); g.addColorStop(1, '#161513');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    var up = cv(function(x) {
      x.fillStyle = '#4e6178'; x.fillRect(0, 0, 64, 64);
      var g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, '#aab6c2'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    });
    var dn = cv(function(x) {
      x.fillStyle = '#22211e'; x.fillRect(0, 0, 64, 64);
    });
    var t = new THREE.CubeTexture([side, side, up, dn, side, side]);
    t.needsUpdate = true;
    return t;
  })();

  var CARMATS = [];
  var phong = function(c, o) {
    var m = new THREE.MeshPhongMaterial(Object.assign({ color: c, specular: 0x3a3a3a, shininess: 60, envMap: CARENV, reflectivity: 0.1, combine: THREE.MixOperation }, o || {}));
    CARMATS.push(m);
    return m;
  };

  var carGlassM = phong(0x080b0e, { specular: 0x8a8a8a, shininess: 110, reflectivity: 0.16, side: THREE.DoubleSide });
  var chromeM = phong(0xd2d4d6, { specular: 0xffffff, shininess: 120, reflectivity: 0.7 });
  var alloyM = phong(0xb2b5b8, { specular: 0xbbbbbb, shininess: 80, reflectivity: 0.42 });
  var trimM = new THREE.MeshPhongMaterial({ color: 0x131313, specular: 0x1c1c1c, shininess: 18, side: THREE.DoubleSide });
  var plateM = new THREE.MeshLambertMaterial({ color: 0xefece4 });
  var evGlassM = phong(0x040506, { specular: 0x9a9a9a, shininess: 120, reflectivity: 0.1 });
  var npcHeadM = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 1 });

  function bakeGroup(root) {
    root.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), byM = new Map(), kill = [], mx = new THREE.Matrix4();
    root.traverse(function(o) {
      if (!o.isMesh || o.userData.keep) return;
      var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      mx.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(mx);
      if (mx.determinant() < 0) {
        var p = g.attributes.position.array, n = g.attributes.normal.array;
        for (var i = 0; i < p.length; i += 9) {
          for (var k = 0; k < 3; k++) {
            var t = p[i+3+k]; p[i+3+k] = p[i+6+k]; p[i+6+k] = t;
            t = n[i+3+k]; n[i+3+k] = n[i+6+k]; n[i+6+k] = t;
          }
        }
      }
      if (!byM.has(o.material)) byM.set(o.material, []);
      byM.get(o.material).push(g);
      kill.push(o);
    });
    kill.forEach(function(o) { o.parent.remove(o); });
    byM.forEach(function(gs, m) {
      var n = 0;
      gs.forEach(function(g) { n += g.attributes.position.count; });
      var P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      var off = 0;
      gs.forEach(function(g) {
        P.set(g.attributes.position.array, off * 3);
        N.set(g.attributes.normal.array, off * 3);
        off += g.attributes.position.count;
        g.dispose();
      });
      var bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(P, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      bg.computeBoundingSphere();
      var me = new THREE.Mesh(bg, m);
      me.userData.keep = true;
      me.castShadow = (m !== carGlassM);
      me.receiveShadow = false;
      root.add(me);
    });
  }

  function crease(g, deg) {
    g = g.index ? g.toNonIndexed() : g;
    var p = g.attributes.position.array, cnt = p.length / 9, fn = [], map = new Map();
    var K = function(i) { return Math.round(p[i]*500)+'_'+Math.round(p[i+1]*500)+'_'+Math.round(p[i+2]*500); };
    var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (var f = 0; f < cnt; f++) {
      a.fromArray(p, f * 9); b.fromArray(p, f * 9 + 3); c.fromArray(p, f * 9 + 6);
      var n = c.clone().sub(b).cross(a.clone().sub(b)).normalize();
      fn.push(n);
      for (var k = 0; k < 3; k++) {
        var kk = K(f * 9 + k * 3);
        var L = map.get(kk);
        if (!L) map.set(kk, L = []);
        L.push(f);
      }
    }
    var N = new Float32Array(p.length), ct = Math.cos(deg * Math.PI / 180), sv = new THREE.Vector3();
    for (var f = 0; f < cnt; f++) {
      for (var k = 0; k < 3; k++) {
        sv.set(0, 0, 0);
        if (Math.abs(fn[f].x) > 0.975) {
          N[f*9+k*3] = fn[f].x; N[f*9+k*3+1] = fn[f].y; N[f*9+k*3+2] = fn[f].z;
          continue;
        }
        var L = map.get(K(f * 9 + k * 3));
        for (var q = 0; q < L.length; q++) {
          var m = fn[L[q]];
          if (m.dot(fn[f]) >= ct && Math.abs(m.x) <= 0.975) sv.add(m);
        }
        if (sv.lengthSq() < 1e-8) sv.copy(fn[f]);
        sv.normalize();
        N[f*9+k*3] = sv.x; N[f*9+k*3+1] = sv.y; N[f*9+k*3+2] = sv.z;
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }

  function extrudeSide(shape, width, bev) {
    var g = new THREE.ExtrudeGeometry(shape, { depth: width - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 3, curveSegments: 12 });
    g.translate(0, 0, -(width - bev * 2) / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  }

  var tyreM2 = new THREE.MeshPhongMaterial({ color: 0x161616, specular: 0x2c2c2c, shininess: 9 });
  var grooveM = new THREE.MeshLambertMaterial({ color: 0x060606 });
  var barrelM = new THREE.MeshLambertMaterial({ color: 0x0c0c0d, side: THREE.DoubleSide });
  var spokeM = phong(0x24272b, { specular: 0x9a9a9a, shininess: 85, reflectivity: 0.22 });
  var lipM = phong(0xc9ccd0, { specular: 0xffffff, shininess: 120, reflectivity: 0.55 });
  var discM2 = new THREE.MeshPhongMaterial({ color: 0x76746f, specular: 0x555555, shininess: 40 });
  var hatM = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
  var calM = new THREE.MeshPhongMaterial({ color: 0xb8322f, specular: 0x664444, shininess: 50 });

  function makeWheel(r, wd, sx, detail, aero) {
    var w = new THREE.Group(); w.rotation.order = 'YXZ';
    var spin = new THREE.Group(); w.add(spin);
    var inn = new THREE.Group(); inn.scale.x = sx; spin.add(inn);
    var put = function(geo, m, x, y, z, rx) {
      var o = new THREE.Mesh(geo, m); o.position.set(x, y || 0, z || 0);
      if (rx) o.rotation.x = rx;
      inn.add(o); return o;
    };
    var seg = detail ? 44 : 22, rr = r * 0.7;
    var pr = [[rr, -wd*0.47], [r*0.8, -wd*0.5], [r*0.9, -wd*0.49], [r*0.965, -wd*0.44], [r*0.993, -wd*0.34], [r, -wd*0.2], [r, wd*0.2], [r*0.993, wd*0.34], [r*0.965, wd*0.44], [r*0.9, wd*0.49], [r*0.8, wd*0.5], [rr, wd*0.47]].map(function(p) { return new THREE.Vector2(p[0], p[1]); });
    put(new THREE.LatheGeometry(pr, seg).rotateZ(Math.PI / 2), tyreM2, 0);
    if (detail) {
      [-0.12, 0, 0.12].forEach(function(o) { put(new THREE.CylinderGeometry(r * 1.001, r * 1.001, 0.018, seg, 1, true).rotateZ(Math.PI / 2), grooveM, wd * o); });
    }
    put(new THREE.CylinderGeometry(rr * 0.99, rr * 0.99, wd * 0.9, seg, 1, true).rotateZ(Math.PI / 2), barrelM, -wd * 0.02);
    put(new THREE.TorusGeometry(rr * 0.985, 0.02, 8, seg).rotateY(Math.PI / 2), lipM, wd * 0.43);

    var NS = 5, xi = wd * 0.24, xo = wd * 0.42, ri = r * 0.17, ro = rr * 0.95, L = Math.hypot(xo - xi, ro - ri), th = Math.atan2(xo - xi, ro - ri);
    var sg = new THREE.BoxGeometry(detail ? 0.05 : 0.06, L, detail ? 0.048 : 0.06);
    sg.rotateZ(-th); sg.translate((xi + xo) / 2, (ri + ro) / 2, 0);
    for (var k = 0; k < NS; k++) {
      var a0 = k / NS * Math.PI * 2;
      (detail ? [-0.11, 0.11] : [0]).forEach(function(d) {
        var m = new THREE.Mesh(sg, spokeM); m.rotation.x = a0 + d; inn.add(m);
      });
    }
    put(new THREE.CylinderGeometry(r * 0.19, r * 0.21, 0.06, 18).rotateZ(Math.PI / 2), spokeM, xi);
    put(new THREE.CylinderGeometry(r * 0.075, r * 0.075, 0.07, 12).rotateZ(Math.PI / 2), lipM, xi + 0.012);
    if (detail) {
      for (var k = 0; k < 5; k++) {
        var a = k / 5 * Math.PI * 2 + 0.3;
        put(new THREE.CylinderGeometry(0.013, 0.013, 0.07, 6).rotateZ(Math.PI / 2), lipM, xi + 0.01, Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12);
      }
      put(new THREE.CylinderGeometry(rr * 0.78, rr * 0.78, 0.03, 32).rotateZ(Math.PI / 2), discM2, wd * 0.02);
      put(new THREE.CylinderGeometry(r * 0.27, r * 0.27, 0.08, 20).rotateZ(Math.PI / 2), hatM, wd * 0.08);
    }
    bakeGroup(spin);
    if (detail) {
      var cg = new THREE.Group(); cg.scale.x = sx; w.add(cg);
      var c = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.66, 0.055, 6, 10, 1.1).rotateY(Math.PI / 2), calM);
      c.scale.set(1.6, 1, 1); c.rotation.x = -0.2; c.position.set(wd * 0.12, 0, 0); cg.add(c);
    }
    return { w: w, spin: spin };
  }

  function buildCar(o) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var r = o.r, zf = o.zf, zb = o.zb, F = o.F, B = o.B, W = o.W, A = r + 0.13, rc = r, sill = 0.27, belt = 0.9;
    var paint = phong(o.paint), roofM = o.roof != null ? phong(o.roof, { reflectivity: 0.1, specular: 0x3a3a3a }) : paint;
    var tailM2 = o.tail || new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0xff2a20, emissiveIntensity: 0.55 });
    var headM3 = o.head || npcHeadM;

    var s = new THREE.Shape();
    s.moveTo(F - 0.06, 0.3); s.lineTo(zf + A, 0.3); s.lineTo(zf + A, rc); s.absarc(zf, rc, A, 0, Math.PI, false); s.lineTo(zf - A, sill);
    s.lineTo(zb + A, sill); s.lineTo(zb + A, rc); s.absarc(zb, rc, A, 0, Math.PI, false); s.lineTo(zb - A, 0.3); s.lineTo(B + 0.08, 0.3);
    s.quadraticCurveTo(B - 0.04, 0.34, B - 0.02, 0.56); s.lineTo(B - 0.01, 0.78); s.quadraticCurveTo(B, belt + 0.03, B + 0.16, belt + 0.03);
    s.quadraticCurveTo(B + 0.6, belt + 0.05, zb + 0.2, belt + 0.02);
    if (o.ev) {
      s.lineTo(zf - 0.3, belt - 0.02); s.quadraticCurveTo(F - 0.45, belt - 0.14, F - 0.08, 0.64); s.quadraticCurveTo(F + 0.05, 0.61, F + 0.05, 0.52); s.lineTo(F + 0.04, 0.46);
    } else {
      s.lineTo(zf - 0.4, belt); s.quadraticCurveTo(F - 0.5, belt - 0.08, F - 0.12, 0.74); s.quadraticCurveTo(F + 0.03, 0.71, F + 0.04, 0.6); s.lineTo(F + 0.03, 0.5);
    }
    s.quadraticCurveTo(F + 0.02, 0.34, F - 0.06, 0.3);
    var bw = W - 0.04;
    var lb = new THREE.Mesh(crease(extrudeSide(s, bw, o.ev ? 0.12 : 0.09), 38), paint);
    body.add(lb);

    var wsB = zf - (o.ev ? 0.36 : 0.4), rf = o.ev ? -0.1 : o.wagon ? -0.25 : 0.02, rr = o.ev ? B + 0.95 : o.wagon ? B + 0.45 : B + 1.25, rb = o.ev ? B + 0.3 : o.wagon ? B + 0.25 : B + 0.52, rt = belt + (o.ev ? 0.5 : 0.54);
    var P0 = new THREE.Vector2(wsB, belt - 0.04), C0 = new THREE.Vector2(wsB - (o.ev ? 0.5 : 0.42), belt + (o.ev ? 0.44 : 0.44)), P1 = new THREE.Vector2(rf - 0.05, rt - 0.02);
    var C1 = new THREE.Vector2((rf + rr) / 2, rt + 0.06), P2 = new THREE.Vector2(rr, rt - 0.04), C2 = o.ev ? new THREE.Vector2(rr - 0.55, rt - 0.04) : o.wagon ? new THREE.Vector2(rb - 0.02, rt - 0.1) : new THREE.Vector2(rr - 0.4, belt + 0.34), P3 = new THREE.Vector2(rb, belt - 0.02);
    var cs = new THREE.Shape();
    cs.moveTo(P3.x, belt - 0.06); cs.lineTo(P0.x, belt - 0.06); cs.lineTo(P0.x, P0.y); cs.quadraticCurveTo(C0.x, C0.y, P1.x, P1.y); cs.quadraticCurveTo(C1.x, C1.y, P2.x, P2.y); cs.quadraticCurveTo(C2.x, C2.y, P3.x, P3.y);
    var cw = W - 0.32, cb = 0.1, TH = 0.3;
    var tumble = function(geo) {
      var p = geo.attributes.position;
      for (var i = 0; i < p.count; i++) {
        var y = p.getY(i);
        if (y > belt) p.setX(i, p.getX(i) * (1 - (y - belt) * TH));
      }
      p.needsUpdate = true;
      return geo;
    };
    var cab = new THREE.Mesh(crease(tumble(extrudeSide(cs, cw, cb)), 38), o.ev ? evGlassM : roofM);
    body.add(cab);

    bakeGroup(body);
    var wheels = [];
    if (o.wheels) {
      [[1, zf], [-1, zf], [1, zb], [-1, zb]].forEach(function(pair) {
        var sx = pair[0], z = pair[1];
        var k = makeWheel(r, o.ww || 0.3, sx, false);
        k.w.position.set(sx * o.xw, r, z);
        g.add(k.w);
        wheels.push(k);
      });
    }
    return { g: g, body: body, wheels: wheels, tail: tailM2, paint: paint };
  }

  function buildEV(o) {
    return buildCar(Object.assign({ ev: true }, o));
  }

  window.CarBuilder = {
    buildCar: buildCar,
    buildEV: buildEV,
    makeWheel: makeWheel,
    bakeGroup: bakeGroup,
    crease: crease,
    extrudeSide: extrudeSide,
    phong: phong,
    CARMATS: CARMATS
  };
})(window);
