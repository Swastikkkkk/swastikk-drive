// Unit tests for assets/room-net.js (client WebSocket wrapper).
// Loads the browser script into a sandbox with fake window, location, WebSocket and timers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(
  fileURLToPath(new URL('../../assets/room-net.js', import.meta.url)),
  'utf8'
);

function makeEnv(hostname = 'localhost') {
  const sockets = [];
  const timers = [];
  let nextId = 1;

  class FakeWS {
    constructor(url) {
      this.url = url;
      this.readyState = 0; // CONNECTING
      this.sent = [];
      this.closeCalls = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      sockets.push(this);
    }
    send(data) { this.sent.push(data); }
    close(code) { this.closeCalls.push(code); this.readyState = 3; }
    open() { this.readyState = 1; this.onopen && this.onopen({}); }
    message(data) { this.onmessage && this.onmessage({ data }); }
    drop(code) { this.readyState = 3; this.onclose && this.onclose({ code, reason: '' }); }
  }

  const fakeSetTimeout = (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms }); return id; };
  const fakeClearTimeout = (id) => {
    const i = timers.findIndex((t) => t.id === id);
    if (i >= 0) timers.splice(i, 1);
  };
  const warnings = [];
  const fakeConsole = { warn: (...a) => warnings.push(a.join(' ')), log() {}, error() {} };

  const window = {};
  new Function('window', 'location', 'WebSocket', 'setTimeout', 'clearTimeout', 'console', SRC)(
    window, { hostname }, FakeWS, fakeSetTimeout, fakeClearTimeout, fakeConsole
  );

  // Runs every pending timer once (timers scheduled by those callbacks stay pending).
  const fireTimers = () => {
    const pending = timers.splice(0);
    pending.forEach((t) => t.fn());
  };

  return { window, sockets, timers, fireTimers, warnings };
}

function openRoom(env, opts = {}) {
  const statuses = [];
  const msgs = [];
  const handle = env.window.RoomNet.open({
    code: 'CODE',
    pid: 'p1',
    tok: 'T0k',
    role: 'p',
    onMsg: (m) => msgs.push(m),
    onStatus: (s) => statuses.push(s),
    ...opts,
  });
  return { handle, statuses, msgs };
}

test('1. builds ws URL with tok for role p, and omits tok for role c', () => {
  const env = makeEnv();
  openRoom(env);
  assert.equal(env.sockets[0].url, 'ws://localhost:8787/rooms/CODE/ws?pid=p1&role=p&tok=T0k');

  const env2 = makeEnv();
  openRoom(env2, { role: 'c', tok: undefined });
  assert.equal(env2.sockets[0].url, 'ws://localhost:8787/rooms/CODE/ws?pid=p1&role=c');
});

test('2. reports connecting, then up on open', () => {
  const env = makeEnv();
  const { statuses } = openRoom(env);
  assert.deepEqual(statuses, ['connecting']);
  env.sockets[0].open();
  assert.deepEqual(statuses, ['connecting', 'up']);
});

test('3. close code 4001 reports full and does not reconnect', () => {
  const env = makeEnv();
  const { statuses } = openRoom(env);
  env.sockets[0].open();
  env.sockets[0].drop(4001);
  assert.equal(statuses.at(-1), 'full');
  assert.equal(env.timers.length, 0, 'no reconnect timer scheduled');
  env.fireTimers();
  assert.equal(env.sockets.length, 1, 'no new socket created');
});

test('4. close code 4003 reports denied and does not reconnect', () => {
  const env = makeEnv();
  const { statuses } = openRoom(env);
  env.sockets[0].open();
  env.sockets[0].drop(4003);
  assert.equal(statuses.at(-1), 'denied');
  assert.equal(env.timers.length, 0, 'no reconnect timer scheduled');
  env.fireTimers();
  assert.equal(env.sockets.length, 1, 'no new socket created');
});

test('5. unexpected close reports retry and schedules a reconnect', () => {
  const env = makeEnv();
  const { statuses } = openRoom(env);
  env.sockets[0].open();
  env.sockets[0].drop(1006);
  assert.equal(statuses.at(-1), 'retry');
  assert.equal(env.timers.length, 1, 'one reconnect timer scheduled');
  assert.ok(env.timers[0].ms > 0);
  env.fireTimers();
  assert.equal(env.sockets.length, 2, 'reconnect opened a new socket');
  assert.equal(env.sockets[1].url, env.sockets[0].url);
});

test('6. send() is dropped before open and sends JSON after open', () => {
  const env = makeEnv();
  const { handle } = openRoom(env);
  handle.send({ t: 'early' });
  assert.deepEqual(env.sockets[0].sent, [], 'pre-open send dropped');
  env.sockets[0].open();
  handle.send({ t: 'hello', n: 1 });
  assert.deepEqual(env.sockets[0].sent, [JSON.stringify({ t: 'hello', n: 1 })]);
});

test('7. close() stops reconnects', () => {
  const env = makeEnv();
  const { handle, statuses } = openRoom(env);
  env.sockets[0].open();
  env.sockets[0].drop(1006); // schedules a reconnect
  assert.equal(env.timers.length, 1);
  handle.close();
  assert.equal(env.timers.length, 0, 'pending reconnect cleared');
  env.fireTimers();
  assert.equal(env.sockets.length, 1, 'no new socket after close()');
  assert.equal(statuses.at(-1), 'retry', 'no status change after close()');

  // close() on a live socket also stops it from reconnecting when it drops.
  const env2 = makeEnv();
  const r2 = openRoom(env2);
  env2.sockets[0].open();
  r2.handle.close();
  assert.deepEqual(env2.sockets[0].closeCalls, [1000]);
  env2.sockets[0].drop(1006);
  env2.fireTimers();
  assert.equal(env2.sockets.length, 1);
});

test('8. non-JSON frames are ignored, parsed frames reach onMsg', () => {
  const env = makeEnv();
  const { msgs } = openRoom(env);
  env.sockets[0].open();
  env.sockets[0].message('not json {');
  env.sockets[0].message(42);
  assert.deepEqual(msgs, []);
  env.sockets[0].message(JSON.stringify({ t: 'state', players: 2 }));
  assert.deepEqual(msgs, [{ t: 'state', players: 2 }]);
});
