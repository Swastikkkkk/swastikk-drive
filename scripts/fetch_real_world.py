#!/usr/bin/env python3
"""
Downloads the real surroundings of the 25 F1 circuits so the game can rebuild them:
  - OpenStreetMap (via the Overpass API): buildings with heights, water, parks, woods, beaches, piers, nearby roads
  - Terrain height (Mapzen/AWS "terrarium" elevation tiles), sea shows up as height <= 0

Run from the repo root (needs only Python 3, no installs):
    python scripts/fetch_real_world.py            # all 25 circuits
    python scripts/fetch_real_world.py mc sg      # only some

It writes data/real-raw/<id>.osm.json and data/real-raw/<id>.dem.json, then zips them to real-raw.zip in the repo
root. Already-downloaded circuits are skipped, so you can re-run it after a network error.
Map data (c) OpenStreetMap contributors, ODbL. Elevation: Mapzen terrain tiles (SRTM, GMTED, NED, ETOPO1 and others).
"""
import json, math, os, struct, sys, time, urllib.parse, urllib.request, zipfile, zlib

# lat_min, lon_min, lat_max, lon_max: each track's area plus 1 km on every side
BBOX = {"mc":[43.72332,7.40878,43.75016,7.4428],"sg":[1.27752,103.84258,1.30395,103.87341],"az":[40.35359,49.81914,40.38519,49.86698],"bh":[26.01704,50.50028,26.04593,50.52838],"sa":[21.61631,39.09119,21.65916,39.11622],"qa":[25.47479,51.43754,25.50616,51.46991],"au":[-37.86297,144.95076,-37.82896,144.98997],"cn":[31.32678,121.20444,31.35453,121.23837],"jp":[34.82991,136.51098,34.85742,136.55437],"im":[44.32746,11.68947,44.3541,11.73772],"mi":[25.94617,-80.25477,25.96964,-80.21977],"lv":[36.09888,-115.1843,36.13459,-115.14899],"es":[41.55514,2.24013,41.5838,2.27568],"md":[40.45523,-3.63715,40.48969,-3.60018],"ca":[45.48801,-73.54276,45.52334,-73.50913],"at":[47.21024,14.74084,47.23543,14.78388],"gb":[52.05447,-1.0389,52.08798,-0.99465],"be":[50.41863,5.9455,50.45526,5.99166],"nl":[52.37532,4.52402,52.40086,4.56778],"hu":[47.56852,19.22901,47.59752,19.26993],"it":[45.60281,9.26785,45.64041,9.3097],"mx":[19.388,-99.10637,19.41546,-99.07357],"us":[30.12098,-97.65385,30.1485,-97.61407],"br":[-23.71545,-46.71035,-23.68793,-46.68422],"ae":[24.45411,54.5917,24.48769,54.61943]}
OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
UA = {'User-Agent': 'swastikk-drive real-world fetch (github.com/Swastikkkkk/swastikk-drive)'}
OUT = os.path.join('data', 'real-raw')
KEEP = ('building', 'building:levels', 'height', 'min_height', 'building:min_level', 'roof:levels', 'natural', 'water',
        'waterway', 'landuse', 'leisure', 'man_made', 'highway', 'amenity', 'layer', 'tunnel', 'bridge', 'name')

def get(url, data=None, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=240) as r:
                return r.read()
        except Exception as e:
            print('   retry', i + 1, 'after', type(e).__name__, str(e)[:80]); time.sleep(10 * (i + 1))
    raise RuntimeError('could not download ' + url[:80])

def osm(cid):
    s, w, n, e = BBOX[cid]
    b = '(%f,%f,%f,%f)' % (s, w, n, e)
    q = ('[out:json][timeout:180];('
         'way["building"]%s;relation["building"]%s;'
         'way["natural"~"^(water|wood|beach|sand|scrub|bay)$"]%s;relation["natural"~"^(water|wood|bay)$"]%s;'
         'way["landuse"~"^(forest|reservoir|basin|grass|meadow|recreation_ground|residential|commercial|industrial)$"]%s;'
         'relation["landuse"~"^(forest|reservoir|basin)$"]%s;'
         'way["leisure"~"^(park|garden|golf_course|pitch|stadium|marina)$"]%s;relation["leisure"~"^(park|golf_course)$"]%s;'
         'way["waterway"~"^(riverbank|river|canal|dock)$"]%s;way["man_made"~"^(pier|breakwater|groyne)$"]%s;'
         'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service)$"]%s;'
         ');out geom qt;') % ((b,) * 11)
    for url in OVERPASS:
        try:
            raw = get(url, urllib.parse.urlencode({'data': q}).encode(), tries=2)
            data = json.loads(raw)
            break
        except Exception as ex:
            print('   ', url.split('/')[2], 'failed:', str(ex)[:80])
    else:
        raise RuntimeError('every Overpass server failed for ' + cid)
    els = []
    for el in data.get('elements', []):
        t = {k: v for k, v in (el.get('tags') or {}).items() if k in KEEP}
        if el['type'] == 'way' and 'geometry' in el:
            els.append({'t': t, 'g': [[round(p['lat'], 6), round(p['lon'], 6)] for p in el['geometry']]})
        elif el['type'] == 'relation':
            rings = [{'role': m.get('role', ''), 'g': [[round(p['lat'], 6), round(p['lon'], 6)] for p in m['geometry']]}
                     for m in el.get('members', []) if m.get('type') == 'way' and 'geometry' in m]
            if rings: els.append({'t': t, 'r': rings})
    return {'bbox': BBOX[cid], 'elements': els}

def png_rgb(buf):   # minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced (what terrarium tiles are)
    assert buf[:8] == b'\x89PNG\r\n\x1a\n'
    i, idat, w = 8, b'', 0
    while i < len(buf):
        ln, typ = struct.unpack('>I4s', buf[i:i + 8]); d = buf[i + 8:i + 8 + ln]; i += 12 + ln
        if typ == b'IHDR': w, h, bd, ct = struct.unpack('>IIBB', d[:10]); ch = 4 if ct == 6 else 3
        elif typ == b'IDAT': idat += d
        elif typ == b'IEND': break
    raw, stride, out, prev, p = zlib.decompress(idat), w * ch, [], bytearray(w * ch), 0
    for _ in range(h):
        f = raw[p]; line = bytearray(raw[p + 1:p + 1 + stride]); p += 1 + stride
        for x in range(stride):
            a = line[x - ch] if x >= ch else 0; b = prev[x]; c = prev[x - ch] if x >= ch else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        out.append(line); prev = line
    return w, ch, out

def dem(cid, z=14, step=12.0):
    s, w, n, e = BBOX[cid]
    def tile(lat, lon):
        k = 2 ** z; x = (lon + 180) / 360 * k
        y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * k
        return x, y
    x0, y1 = tile(s, w); x1, y0 = tile(n, e)
    tiles = {}
    for tx in range(int(x0), int(x1) + 1):
        for ty in range(int(y0), int(y1) + 1):
            tiles[(tx, ty)] = png_rgb(get('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/%d/%d/%d.png' % (z, tx, ty)))
    def height(lat, lon):
        x, y = tile(lat, lon); tx, ty = int(x), int(y); W, ch, rows = tiles[(tx, ty)]
        px, py = min(255, int((x - tx) * 256)), min(255, int((y - ty) * 256)); r = rows[py]
        return r[px * ch] * 256 + r[px * ch + 1] + r[px * ch + 2] / 256 - 32768
    lat0 = (s + n) / 2
    dlat, dlon = step / 110540, step / (111320 * math.cos(math.radians(lat0)))
    ny, nx = int((n - s) / dlat) + 1, int((e - w) / dlon) + 1
    h = [round(height(s + j * dlat, w + i * dlon), 1) for j in range(ny) for i in range(nx)]
    return {'south': s, 'west': w, 'dlat': dlat, 'dlon': dlon, 'nx': nx, 'ny': ny, 'h': h}

def main():
    ids = sys.argv[1:] or list(BBOX)
    os.makedirs(OUT, exist_ok=True)
    for n, cid in enumerate(ids):
        print('[%d/%d] %s' % (n + 1, len(ids), cid))
        for kind, fn in (('osm', osm), ('dem', dem)):
            path = os.path.join(OUT, cid + '.' + kind + '.json')
            if os.path.exists(path): print('   ', kind, 'already there'); continue
            data = fn(cid)
            with open(path, 'w') as f: json.dump(data, f, separators=(',', ':'))
            print('   ', kind, '%.0f KB' % (os.path.getsize(path) / 1024))
            if kind == 'osm': time.sleep(3)
    with zipfile.ZipFile('real-raw.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(OUT)): z.write(os.path.join(OUT, f), f)
    print('done: real-raw.zip %.1f MB' % (os.path.getsize('real-raw.zip') / 1e6))

if __name__ == '__main__':
    main()
