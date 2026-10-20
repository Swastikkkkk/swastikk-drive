import type { RoomEnv } from './room';

export { RaceRoom } from './room';

export interface Env extends RoomEnv {
  RACE_ROOM: DurableObjectNamespace;
  /** Comma-separated origins allowed to open a room socket. Empty allows any origin. */
  ALLOWED_ORIGINS?: string;
}

// Same alphabet the game uses for room codes (no I, O, 0 or 1).
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z0-9]{4,8}$/;

function newCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += ALPH[b % ALPH.length];
  return code;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function originAllowed(request: Request, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return true;
  const origin = request.headers.get('Origin');
  // Browsers always send Origin on a WebSocket, so this is what keeps other websites from opening rooms.
  // Non-browser clients (scripts, tests) send no Origin and are not blocked by this check.
  return !origin || list.includes(origin);
}

function stubFor(env: Env, code: string): DurableObjectStub {
  return env.RACE_ROOM.get(env.RACE_ROOM.idFromName(code));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/health') return new Response('ok', { headers: { 'cache-control': 'no-store' } });

      // Create a room: returns a code nobody is using yet. Joining is by code, the same way the game does it.
      if (path === '/api/rooms' && request.method === 'POST') {
        for (let attempt = 0; attempt < 5; attempt++) {
          const code = newCode();
          const info = await stubFor(env, code).fetch('https://room/info').then((r) => r.json<{ members: number }>());
          if (info.members === 0) return json({ code, ws: `/rooms/${code}/ws` }, 201);
        }
        return json({ error: 'could not find a free room code, try again' }, 503);
      }

      // Room info: how many drivers are in it right now.
      const info = path.match(/^\/api\/rooms\/([A-Za-z0-9]{4,8})$/);
      if (info && request.method === 'GET') {
        const code = info[1].toUpperCase();
        const r = await stubFor(env, code).fetch('https://room/info');
        const data = await r.json<{ members: number; max: number }>();
        return json({ code, ...data });
      }

      // Join a room over WebSocket: the Durable Object for this code takes it from here.
      const ws = path.match(/^\/rooms\/([A-Za-z0-9]{4,8})\/ws$/);
      if (ws) {
        if (!originAllowed(request, env)) return new Response('origin not allowed', { status: 403 });
        const code = ws[1].toUpperCase();
        if (!CODE_RE.test(code)) return new Response('bad room code', { status: 400 });
        const fwd = new URL('https://room/ws');
        url.searchParams.forEach((v, k) => fwd.searchParams.set(k, v));
        fwd.searchParams.set('code', code);
        return stubFor(env, code).fetch(new Request(fwd.toString(), request));
      }

      return new Response('not found', { status: 404 });
    } catch (err) {
      console.log(JSON.stringify({ ev: 'worker_error', message: String(err) }));
      return new Response('internal error', { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
