import { DurableObject } from 'cloudflare:workers';

/*
 * One RaceRoom Durable Object per room code. It owns the room's WebSocket connections and relays
 * the game's JSON messages between them. Physics still runs on each player's own machine (as it
 * always has), so the room validates what it can see: message shape and size, rate, sender
 * identity, pose sanity and finish times. It does not simulate the race.
 */

export interface RoomEnv {
  MAX_PLAYERS?: string;
}

type Role = 'p' | 'c'; // p = a driver in the room, c = a phone controller (not counted toward the room size)

interface Att {
  pid: string;
  tok: string;
  role: Role;
  code: string;
  j: number;
}

const MAX_MSG = 600_000;        // the game never sends more than this (a custom car photo is the largest message)
const RATE = 60;                // sustained messages per second per sender
const BURST = 120;              // allowed burst
const DROP_CLOSE = 2000;        // a sender dropped this many times is disconnected
const JUMP_LIMIT = 150;         // metres between consecutive poses before one counts as a jump
const JUMP_CONFIRM = 3;         // this many far-away poses in a row is a real respawn: accept it

const PLAYER_KINDS = new Set([
  'hi', 's', 'race', 'fin', 'pg', 'pk', 'kick', 'bye', 'em', 'trk', 'cc', 'hn', 'cfg', 'rdy', 'spec', 'chat',
]);
const CONTROLLER_KINDS = new Set(['ctrl']);

const ID_RE = /^[A-Za-z0-9_-]{4,32}$/;
const TOK_RE = /^[A-Za-z0-9_-]{8,40}$/;

function log(ev: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ev, t: Date.now(), ...fields }));
}

export class RaceRoom extends DurableObject<RoomEnv> {
  private readonly max: number;
  private buckets = new Map<string, { tokens: number; t: number; drops: number }>();
  private anchors = new Map<string, { x: number; z: number; far: number }>();

  constructor(ctx: DurableObjectState, env: RoomEnv) {
    super(ctx, env);
    this.max = Math.max(2, Math.min(16, Number(env.MAX_PLAYERS) || 8));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/info') {
      return Response.json({ members: this.drivers().length, max: this.max });
    }
    if (url.pathname !== '/ws' || request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket upgrade', { status: 426 });
    }

    const code = url.searchParams.get('code') || '';
    const pid = url.searchParams.get('pid') || '';
    const tok = url.searchParams.get('tok') || '';
    const role: Role = url.searchParams.get('role') === 'c' ? 'c' : 'p';
    if (!ID_RE.test(pid)) return new Response('bad player id', { status: 400 });
    if (role === 'p' && !TOK_RE.test(tok)) return new Response('bad session token', { status: 400 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const att: Att = { pid, tok, role, code, j: Date.now() };

    // The same player id coming back is a reconnect (same page, same secret token). A different token
    // on an id that is already in use is refused, so nobody can take over somebody else's seat.
    const same = this.ctx.getWebSockets().filter((s) => {
      const a = this.attOf(s);
      return !!a && a.role === role && a.pid === pid;
    });
    if (role === 'p' && same.length) {
      const first = this.attOf(same[0]);
      if (!first || first.tok !== tok) {
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment(att);
        server.close(4003, 'id in use');
        log('denied', { code, pid });
        return new Response(null, { status: 101, webSocket: client });
      }
      for (const s of same) {
        try { s.close(4000, 'replaced'); } catch (_) { /* already closing */ }
      }
    }

    const drivers = this.drivers().filter((s) => !same.includes(s)).length;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(att);
    if (role === 'p' && drivers >= this.max) {
      server.close(4001, 'room full');
      log('full', { code, pid, max: this.max });
      return new Response(null, { status: 101, webSocket: client });
    }
    log(role === 'p' ? 'join' : 'controller', { code, pid, drivers: drivers + 1, max: this.max });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const a = this.attOf(ws);
    if (!a) return;
    if (typeof message !== 'string' || message.length > MAX_MSG) return this.drop(ws, a, 'size');
    if (!this.take(a.pid)) return this.drop(ws, a, 'rate');

    let m: any;
    try { m = JSON.parse(message); } catch (_) { return this.drop(ws, a, 'json'); }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.k !== 'string') return this.drop(ws, a, 'shape');

    const allowed = a.role === 'c' ? CONTROLLER_KINDS.has(m.k) : PLAYER_KINDS.has(m.k);
    if (!allowed) return this.drop(ws, a, 'kind');

    if (m.k === 's' && !this.poseOk(a.pid, m)) return this.drop(ws, a, 'pose');
    if (m.k === 'fin') {
      const ok = Number.isFinite(m.ms) && m.ms >= 1000 && m.ms <= 3.6e6 && typeof m.rid === 'string' && m.rid.length <= 64;
      if (!ok) return this.drop(ws, a, 'fin');
      log('race_finish', { code: a.code, pid: a.pid, ms: Math.round(m.ms) });
    }
    if (m.k === 'race') {
      if (!(typeof m.rid === 'string' && m.rid.length <= 64 && Number.isFinite(m.startAt))) return this.drop(ws, a, 'race');
      log('race_start', { code: a.code, pid: a.pid, rid: m.rid, laps: m.laps });
    }

    // Senders can't speak as someone else: the id is always the one the socket registered with.
    const out = a.role === 'p' && m.id !== a.pid ? JSON.stringify({ ...m, id: a.pid }) : message;
    for (const other of this.ctx.getWebSockets()) {
      if (other === ws) continue;
      const b = this.attOf(other);
      if (!b || b.role !== 'p') continue; // phone controllers only send, they never receive
      try { other.send(out); } catch (_) { /* that socket is going away; its close handler cleans up */ }
    }
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    const a = this.attOf(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch (_) { /* already closed */ }
    if (!a) return;
    const stillHere = this.ctx.getWebSockets().some((s) => s !== ws && this.attOf(s)?.pid === a.pid);
    if (!stillHere) {
      this.buckets.delete(a.pid);
      this.anchors.delete(a.pid);
    }
    log('leave', { code: a.code, pid: a.pid, role: a.role, closeCode: code, drivers: this.drivers().length });
  }

  webSocketError(ws: WebSocket): void {
    const a = this.attOf(ws);
    log('socket_error', { code: a?.code, pid: a?.pid });
    try { ws.close(1011, 'socket error'); } catch (_) { /* already closed */ }
  }

  private attOf(ws: WebSocket): Att | null {
    return (ws.deserializeAttachment() as Att | null) ?? null;
  }

  private drivers(): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => this.attOf(s)?.role === 'p');
  }

  private take(pid: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(pid);
    if (!b) {
      b = { tokens: BURST, t: now, drops: 0 };
      this.buckets.set(pid, b);
    }
    b.tokens = Math.min(BURST, b.tokens + ((now - b.t) / 1000) * RATE);
    b.t = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  private drop(ws: WebSocket, a: Att, why: string): void {
    const b = this.buckets.get(a.pid);
    if (b) b.drops++;
    if (b && b.drops % 200 === 1) log('dropped', { code: a.code, pid: a.pid, why, total: b.drops });
    if (b && b.drops > DROP_CLOSE) {
      log('disconnect_abusive', { code: a.code, pid: a.pid });
      try { ws.close(1008, 'too many dropped messages'); } catch (_) { /* already closed */ }
    }
  }

  /** Pose sanity: finite numbers, inside the world, and no teleport unless several poses agree (a respawn). */
  private poseOk(pid: string, m: any): boolean {
    const p = m.p;
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v: unknown) => Number.isFinite(v))) return false;
    if (!Array.isArray(m.q) || m.q.length !== 4 || !m.q.every((v: unknown) => Number.isFinite(v))) return false;
    const [x, y, z] = p as number[];
    if (Math.abs(x) > 1e5 || Math.abs(z) > 1e5 || y < -500 || y > 2000) return false;

    const an = this.anchors.get(pid);
    if (!an) {
      this.anchors.set(pid, { x, z, far: 0 });
      return true;
    }
    if (Math.hypot(x - an.x, z - an.z) <= JUMP_LIMIT) {
      an.x = x; an.z = z; an.far = 0;
      return true;
    }
    an.far++;
    if (an.far >= JUMP_CONFIRM) {
      an.x = x; an.z = z; an.far = 0;
      return true;
    }
    return false;
  }
}
