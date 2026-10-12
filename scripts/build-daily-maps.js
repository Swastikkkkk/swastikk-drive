#!/usr/bin/env node
/*
 * Rebuilds the Daily Track catalogue check.
 *   node scripts/build-daily-maps.js            solve all 1000 maps, print a report, bake the winning attempts into assets/daily-maps.js
 *   node scripts/build-daily-maps.js --check    solve and report only (no file written)
 *   node scripts/build-daily-maps.js --sheet out.svg [perFamily]   also draw a contact sheet of the maps
 *
 * Run it again after changing any shape family or the validation thresholds, then commit assets/daily-maps.js.
 */
var fs = require('fs'), path = require('path');
var file = path.join(__dirname, '..', 'assets', 'daily-maps.js');
var DM = require(file);
DM.setAttempts(null);

var args = process.argv.slice(2), checkOnly = args.indexOf('--check') >= 0;
var sheetAt = args.indexOf('--sheet'), per = +(args[sheetAt + 2]) || 4;

var att = [], stats = {}, fails = [], t0 = Date.now();
DM.FAMILIES.forEach(function (f) { stats[f] = { n: 0, firstTry: 0, attempts: 0, fallback: 0, minGap: 1e9, minR: 1e9, len: [1e9, 0] }; });
for (var id = 0; id < DM.COUNT; id++) {
  var s = DM.solve(id), c = s.cand, st = stats[DM.FAMILIES[id % 10]];
  att.push(s.attempt);
  st.n++; st.attempts += s.attempt < 0 ? DM.MAX_ATTEMPTS : s.attempt + 1;
  if (s.attempt === 0) st.firstTry++;
  if (s.attempt < 0) { st.fallback++; fails.push(id); }
  if (c.check.ok) {
    st.minGap = Math.min(st.minGap, c.check.minGap); st.minR = Math.min(st.minR, c.check.minRadius);
    st.len[0] = Math.min(st.len[0], c.check.length); st.len[1] = Math.max(st.len[1], c.check.length);
  }
}
console.log('solved ' + DM.COUNT + ' maps in ' + (Date.now() - t0) + ' ms\n');
console.log('family       maps  tries/map  fallback  min gap  min radius  length m');
Object.keys(stats).forEach(function (f) {
  var s = stats[f];
  console.log(f.padEnd(12) + String(s.n).padStart(4) + String((s.attempts / s.n).toFixed(1)).padStart(11) + String(s.fallback).padStart(10) +
    String(Math.round(s.minGap)).padStart(9) + String(Math.round(s.minR)).padStart(12) + '   ' + Math.round(s.len[0]) + '-' + Math.round(s.len[1]));
});
if (fails.length) console.log('\nmaps that fell back to the safe oval: ' + fails.join(', '));

// distinctness: no two days in a row share a family, and every map has its own shape
var clash = 0;
for (var n = 0; n < 2000; n++) if (DM.idForDay(n) % 10 === DM.idForDay(n + 1) % 10) clash++;
var seen = {}, dup = 0;
for (var d = 0; d < DM.COUNT; d++) { var k = DM.idForDay(d); if (seen[k]) dup++; seen[k] = 1; }
console.log('\nconsecutive days with the same family: ' + clash + ' · maps repeated inside 1000 days: ' + dup);

if (!checkOnly) {
  var src = fs.readFileSync(file, 'utf8');
  var line = '  var ATT = [' + att.join(',') + '];';
  var next = src.replace(/(\/\* BEGIN ATT[^\n]*\*\/\n)[\s\S]*?(\n  \/\* END ATT \*\/)/, function (_, a, b) { return a + line + b; });
  if (next === src && src.indexOf(line) < 0) { console.error('ATT markers not found'); process.exit(1); }
  fs.writeFileSync(file, next);
  console.log('baked ' + att.length + ' attempts into assets/daily-maps.js');
}

if (sheetAt >= 0) {
  var out = args[sheetAt + 1] || 'daily-maps-sheet.svg', cell = 220, cols = per, rows = DM.FAMILIES.length, parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + cols * cell + '" height="' + rows * cell + '" style="background:#14161a">');
  DM.setAttempts(att);
  DM.FAMILIES.forEach(function (f, row) {
    for (var c2 = 0; c2 < cols; c2++) {
      var m = DM.generate(DM.FAMILIES.indexOf(f) + 10 * (c2 * 7 + 1)), xs = m.pts.map(function (p) { return p.x; }), ys = m.pts.map(function (p) { return p.y; });
      var minX = Math.min.apply(0, xs), maxX = Math.max.apply(0, xs), minY = Math.min.apply(0, ys), maxY = Math.max.apply(0, ys);
      var k = (cell - 40) / Math.max(maxX - minX, maxY - minY), ox = c2 * cell + cell / 2 - (minX + maxX) / 2 * k, oy = row * cell + cell / 2 + 6 - (minY + maxY) / 2 * k;
      var d = m.pts.map(function (p, i) { return (i ? 'L' : 'M') + (p.x * k + ox).toFixed(1) + ' ' + (p.y * k + oy).toFixed(1); }).join('') + 'Z';
      parts.push('<path d="' + d + '" fill="none" stroke="#f2eee6" stroke-width="3" stroke-linejoin="round"/>');
      parts.push('<circle cx="' + (m.pts[0].x * k + ox).toFixed(1) + '" cy="' + (m.pts[0].y * k + oy).toFixed(1) + '" r="4" fill="#ff4d3d"/>');
      parts.push('<text x="' + (c2 * cell + 8) + '" y="' + (row * cell + 16) + '" fill="#9aa3ad" font-family="monospace" font-size="11">' + m.family + ' #' + m.no + ' · ' + m.theme + ' · ' + m.elev + ' · ' + (m.lengthM / 1000).toFixed(1) + 'km</text>');
    }
  });
  parts.push('</svg>');
  fs.writeFileSync(out, parts.join(''));
  console.log('wrote ' + out);
}
