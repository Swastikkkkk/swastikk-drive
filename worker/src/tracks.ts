/*
 * Short links for drawn tracks. POST /api/tracks {code, name} stores the track code and returns an 8-character id
 * derived from the code itself (the same track always gets the same id, so sharing twice is free). GET
 * /api/tracks/:id returns {code, name}. The code is checked before it is kept: it must decode to a track with a
 * sensible number of points, and posts are rate limited per IP.
 */
import type { BoardsEnv } from './boards';

const MAX_CODE = 12000;
const PER_MIN = 6;
const ID_RE = /^[a-z2-7]{8}$/;
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

const posts = new Map<string, { n: number; t: number }>();
function allow(ip: string): boolean {
  const now = Date.now(), r = posts.get(ip);
  if (!r || now - r.t > 60_000) { posts.set(ip, { n: 1, t: now }); if (posts.size > 5000) posts.clear(); return true; }
  return ++r.n <= PER_MIN;
}

async function idFor(code: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
  let id = '';
  for (let i = 0; i < 8; i++) id += B32[h[i] & 31];
  return id;
}

/** The game's track code: base64 of JSON {name, points: "dx,dy;dx,dy;..." (base 36 steps)}. Returns the point count. */
function check(code: string): { points: number; name: string } | string {
  if (typeof code !== 'string' || code.length < 40 || code.length > MAX_CODE) return 'bad size';
  if (!/^[A-Za-z0-9+/=]+$/.test(code)) return 'not a track code';
  let data: any;
  try { data = JSON.parse(decodeURIComponent(escape(atob(code)))); } catch (_) { return 'not a track code'; }
  if (!data || typeof data !== 'object') return 'not a track code';
  let n = 0;
  if (typeof data.points === 'string') {
    const parts = data.points.split(';');
    if (!parts.every((p: string) => /^-?[0-9a-z]+,-?[0-9a-z]+$/.test(p))) return 'bad points';
    n = parts.length;
  } else if (Array.isArray(data.points)) {
    if (!data.points.every((p: unknown) => Array.isArray(p) && p.length >= 2 && p.every((v) => Number.isFinite(v)))) return 'bad points';
    n = data.points.length;
  } else return 'no points';
  if (n < 6 || n > 800) return 'bad point count';
  const name = String(data.name || 'Track').replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 40) || 'Track';
  return { points: n, name };
}

export async function handleTracks(request: Request, env: BoardsEnv, id: string | null, json: (b: unknown, s?: number) => Response): Promise<Response> {
  if (!env.DB) return json({ error: 'database not configured' }, 503);
  try {
    if (request.method === 'POST' && !id) {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!allow(ip)) return json({ error: 'slow down' }, 429);
      const text = await request.text();
      if (text.length > MAX_CODE + 500) return json({ error: 'too large' }, 413);
      let body: any;
      try { body = JSON.parse(text); } catch (_) { return json({ error: 'bad json' }, 400); }
      const c = check(body && body.code);
      if (typeof c === 'string') return json({ error: c }, 400);
      const tid = await idFor(body.code);
      await env.DB.prepare('INSERT OR IGNORE INTO tracks (id, code, name, points) VALUES (?, ?, ?, ?)').bind(tid, body.code, c.name, c.points).run();
      console.log(JSON.stringify({ ev: 'track_shared', id: tid, points: c.points }));
      return json({ id: tid }, 201);
    }
    if (request.method === 'GET' && id) {
      if (!ID_RE.test(id)) return json({ error: 'bad id' }, 400);
      const row = await env.DB.prepare('SELECT code, name FROM tracks WHERE id = ?').bind(id).first<{ code: string; name: string }>();
      if (!row) return json({ error: 'not found' }, 404);
      await env.DB.prepare('UPDATE tracks SET opens = opens + 1 WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify(row), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (err) {
    console.log(JSON.stringify({ ev: 'd1_error', where: 'tracks', message: String(err) }));
    return json({ error: 'database error' }, 500);
  }
}
