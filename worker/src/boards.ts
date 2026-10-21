/*
 * Leaderboards on D1. Three boards, one shape: GET returns the global top times plus, when a name is given,
 * that player's own best times and their global rank. POST adds one finished result. Validation happens
 * here and again in the table CHECKs, so neither layer alone has to be perfect.
 */

export interface BoardsEnv {
  DB: D1Database;
}

const MAX_BODY = 4096;          // a result is ~200 bytes; anything bigger is not a result
const POST_PER_MIN = 20;        // per IP, per isolate. Best effort, the CHECKs are the real guard
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const posts = new Map<string, { n: number; t: number }>();
function allowPost(ip: string): boolean {
  const now = Date.now();
  const r = posts.get(ip);
  if (!r || now - r.t > 60_000) {
    posts.set(ip, { n: 1, t: now });
    if (posts.size > 5000) posts.clear(); // keep the map bounded
    return true;
  }
  r.n++;
  return r.n <= POST_PER_MIN;
}

const cleanName = (v: unknown): string =>
  String(v ?? '').replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 24);
const int = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
const num = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
const today = (): string => new Date().toISOString().slice(0, 10);

// A daily result can only be for today or yesterday (UTC), so nobody back-fills old boards.
function dayOk(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z');
  const now = Date.now();
  return t <= now && now - t < 2 * 86_400_000;
}

type Json = (body: unknown, status?: number) => Response;

interface Board {
  /** columns returned to the client */
  cols: string;
  table: string;
  /** WHERE clause and its bindings, built from the query string; null means a bad request */
  where(q: URLSearchParams): { sql: string; args: unknown[] } | null;
  /** validated row to insert, or an error message */
  row(b: any): { cols: string[]; vals: unknown[] } | string;
  top: number;
}

const BOARDS: Record<string, Board> = {
  race: {
    table: 'race_results',
    cols: 'name, ms, best_lap_ms, pos, field',
    top: 10,
    where(q) {
      const track = String(q.get('track') || '').slice(0, 64);
      const mode = String(q.get('mode') || '');
      const laps = int(q.get('laps'));
      if (!track || !mode || laps == null) return null;
      return { sql: 'track = ? AND mode = ? AND laps = ?', args: [track, mode, laps] };
    },
    row(b) {
      const track = String(b.track || '').slice(0, 64);
      const mode = String(b.mode || '');
      const laps = int(b.laps), ms = int(b.ms), pos = int(b.pos), field = int(b.field);
      const best = b.best_lap_ms == null ? null : int(b.best_lap_ms);
      const story = b.story_level == null ? null : int(b.story_level);
      const name = cleanName(b.name) || 'Driver';
      if (!track || !['gp', 'story', 'daily', 'race', 'lap'].includes(mode)) return 'bad track or mode';
      if (laps == null || laps < 1 || laps > 80) return 'bad laps';
      if (ms == null || ms < 5000 || ms > 10_800_000) return 'bad time';
      if (ms < laps * 5000) return 'impossible time';
      if (best != null && (best < 5000 || best > ms)) return 'bad best lap';
      if (pos == null || field == null || pos < 1 || field < 1 || field > 60 || pos > field) return 'bad position';
      return {
        cols: ['track', 'mode', 'laps', 'name', 'ms', 'best_lap_ms', 'pos', 'field', 'story_level'],
        vals: [track, mode, laps, name, ms, best, pos, field, story],
      };
    },
  },
  daily: {
    table: 'daily_times',
    cols: 'name, ms, best_ms',
    top: 200,
    where(q) {
      const day = String(q.get('day') || today());
      const laps = int(q.get('laps') ?? 1);
      if (!DAY_RE.test(day) || laps == null) return null;
      return { sql: 'day = ? AND laps = ?', args: [day, laps] };
    },
    row(b) {
      const day = String(b.day || '');
      const name = cleanName(b.name);
      const ms = int(b.ms), laps = int(b.laps);
      const best = b.best_ms == null ? null : int(b.best_ms);
      if (!dayOk(day)) return 'bad day';
      if (!name) return 'bad name';
      if (laps == null || laps < 1 || laps > 10) return 'bad laps';
      if (ms == null || ms < 20000 || ms > 3_600_000 || ms < laps * 20000) return 'bad time';
      if (best != null && (best < 6000 || best > ms)) return 'bad best lap';
      return { cols: ['day', 'name', 'ms', 'best_ms', 'laps'], vals: [day, name, ms, best, laps] };
    },
  },
  typing: {
    table: 'typing_times',
    cols: 'name, ms, wpm, acc',
    top: 300,
    where(q) {
      const day = String(q.get('day') || today());
      if (!DAY_RE.test(day)) return null;
      return { sql: 'day = ?', args: [day] };
    },
    row(b) {
      const day = String(b.day || '');
      const name = cleanName(b.name);
      const ms = int(b.ms), chars = int(b.chars), keys = int(b.keys);
      const wpm = num(b.wpm), acc = num(b.acc);
      const kmh = b.max_kmh == null ? null : int(b.max_kmh);
      if (!dayOk(day)) return 'bad day';
      if (!name) return 'bad name';
      if (ms == null || ms < 3000 || ms > 600_000) return 'bad time';
      if (chars == null || chars < 20 || chars > 400) return 'bad chars';
      if (keys == null || keys < chars || keys > chars * 3) return 'bad keys';
      if (wpm == null || wpm <= 0 || wpm > 230 || Math.abs(wpm - (chars * 12000) / ms) > 2) return 'wpm does not match time';
      if (acc == null || acc < 50 || acc > 100 || Math.abs(acc - (chars * 100) / keys) > 1) return 'accuracy does not match keys';
      if (kmh != null && (kmh < 0 || kmh > 400)) return 'bad speed';
      return {
        cols: ['day', 'name', 'ms', 'wpm', 'acc', 'chars', 'keys', 'max_kmh'],
        vals: [day, name, ms, wpm, acc, chars, keys, kmh],
      };
    },
  },
};

export async function handleBoards(request: Request, env: BoardsEnv, which: string, json: Json): Promise<Response> {
  const board = BOARDS[which];
  if (!board) return json({ error: 'unknown board' }, 404);
  if (!env.DB) return json({ error: 'database not configured' }, 503);

  try {
    if (request.method === 'GET') {
      const q = new URL(request.url).searchParams;
      const w = board.where(q);
      if (!w) return json({ error: 'bad query' }, 400);
      const name = cleanName(q.get('name'));

      // One row per player on the global board: each player's best time only. One grouped pass over the day's rows
      // (SQLite takes the bare columns from the row that holds MIN(ms)); the old per-row subquery read N² rows.
      const sel = board.cols.split(',').map((c) => c.trim()).map((c) => (c === 'ms' ? 'MIN(ms) AS ms' : c)).join(', ');
      const top = await env.DB.prepare(
        `SELECT ${sel} FROM ${board.table} WHERE ${w.sql} GROUP BY lower(name) ORDER BY ms ASC LIMIT ?`,
      ).bind(...w.args, board.top).all();

      let mine: unknown[] = [];
      let rank: number | null = null;
      let players = 0;
      if (name) {
        mine = (await env.DB.prepare(
          `SELECT ${board.cols} FROM ${board.table} WHERE ${w.sql} AND lower(name) = lower(?) ORDER BY ms ASC LIMIT 10`,
        ).bind(...w.args, name).all()).results;
        const best = (mine[0] as { ms?: number } | undefined)?.ms;
        const counts = await env.DB.prepare(
          `SELECT COUNT(DISTINCT lower(name)) AS players,
                  COUNT(DISTINCT CASE WHEN ms < ? AND lower(name) <> lower(?) THEN lower(name) END) AS ahead
           FROM ${board.table} WHERE ${w.sql}`,
        ).bind(best ?? 0, name, ...w.args).first<{ players: number; ahead: number }>();
        players = counts?.players ?? 0;
        if (best != null) rank = (counts?.ahead ?? 0) + 1;
      } else {
        const c = await env.DB.prepare(`SELECT COUNT(DISTINCT lower(name)) AS players FROM ${board.table} WHERE ${w.sql}`)
          .bind(...w.args).first<{ players: number }>();
        players = c?.players ?? 0;
      }
      return json({ top: top.results, mine, rank, players });
    }

    if (request.method === 'POST') {
      const len = Number(request.headers.get('content-length') || 0);
      if (len > MAX_BODY) return json({ error: 'too large' }, 413);
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!allowPost(ip)) return json({ error: 'slow down' }, 429);
      const text = await request.text();
      if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
      let body: any;
      try { body = JSON.parse(text); } catch (_) { return json({ error: 'bad json' }, 400); }
      const r = board.row(body);
      if (typeof r === 'string') {
        console.log(JSON.stringify({ ev: 'board_reject', board: which, why: r }));
        return json({ error: r }, 400);
      }
      await env.DB.prepare(
        `INSERT INTO ${board.table} (${r.cols.join(', ')}) VALUES (${r.cols.map(() => '?').join(', ')})`,
      ).bind(...r.vals).run();
      console.log(JSON.stringify({ ev: 'board_insert', board: which }));
      return json({ ok: true }, 201);
    }

    return json({ error: 'method not allowed' }, 405);
  } catch (err) {
    console.log(JSON.stringify({ ev: 'd1_error', board: which, message: String(err) }));
    return json({ error: 'database error' }, 500);
  }
}
