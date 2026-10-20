// Relay tests for the room server. Start the server first (npm run dev), then: npm test
// Uses Node's built-in WebSocket and fetch, no extra dependencies.

import net from 'node:net';
import crypto from 'node:crypto';

const BASE = process.env.ROOMS || 'http://localhost:8787';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
let passes = 0;

function check(name, ok, detail = '') {
  if (ok) { passes++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const tok = () => 'tok' + Date.now().toString(36) + (seq++) + 'abcdef';
const uid = (p) => p + Math.random().toString(36).slice(2, 8);

// Opens a socket and records what it receives and how it closes.
function connect(code, pid, { role = 'p', token = tok(), origin } = {}) {
  const q = new URLSearchParams({ pid, role });
  if (role === 'p') q.set('tok', token);
  const opts = origin ? { headers: { Origin: origin } } : undefined;
  const ws = opts ? new WebSocket(`${WS}/rooms/${code}/ws?${q}`, opts) : new WebSocket(`${WS}/rooms/${code}/ws?${q}`);
  const c = { ws, pid, token, msgs: [], closed: null, open: false, error: null };
  ws.onmessage = (e) => { try { c.msgs.push(JSON.parse(e.data)); } catch (_) { c.msgs.push(e.data); } };
  ws.onclose = (e) => { c.closed = { code: e.code, reason: e.reason }; };
  ws.onerror = () => { c.error = true; };
  c.opened = new Promise((res) => {
    ws.onopen = () => { c.open = true; res(true); };
    ws.onclose = (e) => { c.closed = { code: e.code, reason: e.reason }; res(false); };
    // A refused handshake (e.g. 403 on a foreign origin) may only fire "error", so settle on that too.
    ws.onerror = () => { c.error = true; res(false); };
  });
  return c;
}

const send = (c, obj) => c.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));

// Raw RFC 6455 client. Node's WebSocket never fires onclose for the server's refusal closes (4000, 4001, 4003),
// so those checks read the close frame straight off the wire, which is what the game client receives.
function rawJoin(code, pid, tok) {
  const u = new URL(BASE);
  const raw = { closeCode: null, ws: null, buf: Buffer.alloc(0), headerDone: false };
  const sock = net.connect(Number(u.port) || 80, u.hostname);
  raw.ws = { close: () => sock.destroy() };
  const key = crypto.randomBytes(16).toString('base64');
  sock.write(`GET /rooms/${code}/ws?pid=${pid}&tok=${tok}&role=p HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`);
  sock.on('error', () => {});
  sock.on('data', (d) => {
    raw.buf = Buffer.concat([raw.buf, d]);
    if (!raw.headerDone) {
      const i = raw.buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      raw.buf = raw.buf.subarray(i + 4);
      raw.headerDone = true;
    }
    // Server frames are unmasked. Walk them, skipping payloads, and record the code of the first close frame.
    while (raw.buf.length >= 2) {
      const op = raw.buf[0] & 0x0f;
      let len = raw.buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (raw.buf.length < 4) return; len = raw.buf.readUInt16BE(2); off = 4; }
      if (raw.buf.length < off + len) return;
      if (op === 8 && len >= 2 && raw.closeCode === null) raw.closeCode = raw.buf.readUInt16BE(off);
      raw.buf = raw.buf.subarray(off + len);
    }
  });
  return raw;
}

async function main() {
  console.log('health');
  const h = await fetch(BASE + '/health');
  check('GET /health is ok', h.status === 200 && (await h.text()) === 'ok');

  console.log('create / info');
  const created = await fetch(BASE + '/api/rooms', { method: 'POST' }).then((r) => r.json());
  check('POST /api/rooms returns a 5 character code', /^[A-Z2-9]{5}$/.test(created.code), JSON.stringify(created));
  const empty = await fetch(BASE + '/api/rooms/' + created.code).then((r) => r.json());
  check('empty room reports 0 members', empty.members === 0 && empty.max === 8, JSON.stringify(empty));

  const code = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  console.log('relay, identity, validation  (room ' + code + ')');
  const pA = uid('pa'), pB = uid('pb');
  const A = connect(code, pA);
  const B = connect(code, pB);
  await Promise.all([A.opened, B.opened]);
  check('two players connect', A.open && B.open);
  await sleep(100);

  send(A, { k: 'hi', id: 'SPOOFED', n: 'Alice', j: 1 });
  await sleep(150);
  const hi = B.msgs.find((m) => m && m.k === 'hi');
  check('message is relayed to the other player', !!hi);
  check('sender id is forced to the socket id (no spoofing)', hi && hi.id === pA, hi && hi.id);
  check('sender does not receive its own message', !A.msgs.some((m) => m && m.k === 'hi'));

  const before = B.msgs.length;
  send(A, { k: 'evil', id: pA });
  await sleep(120);
  check('unknown message kind is dropped', B.msgs.length === before);

  send(A, 'not json{');
  send(A, '[1,2,3]');
  await sleep(120);
  check('malformed JSON and non-objects are dropped and the socket stays open', A.closed === null && B.msgs.length === before);

  console.log('pose validation');
  const pose = (x, z) => ({ k: 's', id: pA, p: [x, 0.5, z], q: [0, 0, 0, 1], n: 'Alice', j: 1 });
  const mid = B.msgs.length;
  send(A, pose(10, 10));
  await sleep(120);
  check('a normal pose is relayed', B.msgs.length === mid + 1);
  send(A, pose(9999, 10));    // 10 km teleport, first one: dropped
  await sleep(100);
  check('a single teleport is dropped', B.msgs.length === mid + 1);
  send(A, pose(9999, 10));
  send(A, pose(9999, 10));    // third far pose in a row (the teleport counts): a real respawn, accepted
  await sleep(150);
  check('a respawn is accepted once several poses agree', B.msgs.length === mid + 2, 'got ' + (B.msgs.length - mid));
  send(A, { k: 's', p: [NaN, 0, 0], q: [0, 0, 0, 1] });
  send(A, { k: 's', p: [0, 0, 0], q: [0, 0, 0] });
  send(A, { k: 's', p: [0, 9999, 0], q: [0, 0, 0, 1] });
  await sleep(120);
  check('NaN, wrong-length and out-of-range poses are dropped', B.msgs.length === mid + 2);

  console.log('finish and race messages');
  const mf = B.msgs.length;
  send(A, { k: 'fin', rid: 'r1', ms: 61234 });
  send(A, { k: 'fin', rid: 'r1', ms: -5 });
  send(A, { k: 'race', rid: 'r1', startAt: Date.now() + 3000, laps: 3 });
  send(A, { k: 'race', rid: 'r1', startAt: 'soon' });
  await sleep(150);
  check('valid finish and race are relayed', B.msgs.slice(mf).filter((m) => m.k === 'fin' || m.k === 'race').length === 2,
    JSON.stringify(B.msgs.slice(mf).map((m) => m.k)));

  console.log('size limit');
  const mb = B.msgs.length;
  send(A, { k: 'chat', id: pA, t: 'x'.repeat(700000) });
  await sleep(150);
  check('a message over the size limit is dropped', B.msgs.length === mb && A.closed === null);

  console.log('room cap, phone controller, reconnect');
  const cap = 'C' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const roster = [];
  for (let i = 0; i < 8; i++) { const c = connect(cap, uid('p' + i)); roster.push(c); }
  await Promise.all(roster.map((c) => c.opened));
  check('eight players fit in a room', roster.every((c) => c.open));
  const ninth = rawJoin(cap, uid('late'), tok());
  await sleep(250);
  check('the ninth player is refused with 4001 (room full)', ninth.closeCode === 4001, 'close code ' + ninth.closeCode);

  const phone = connect(cap, uid('ctl'), { role: 'c' });
  await phone.opened;
  check('a phone controller can still join a full room', phone.open && !(phone.closed && phone.closed.code === 4001));
  send(phone, { k: 'ctrl', to: roster[0].pid, token: 'secret', input: { f: 1, steerAnalog: 0.2 }, ts: 1 });
  await sleep(150);
  check('controller input reaches the players in the room', roster[0].msgs.some((m) => m && m.k === 'ctrl' && m.input && m.input.f === 1));
  check('phones receive nothing from the room', phone.msgs.length === 0, 'got ' + phone.msgs.length);
  const chatBefore = roster[0].msgs.filter((m) => m && m.k === 'chat').length;
  send(phone, { k: 'chat', t: 'hello' });
  await sleep(120);
  check('a phone may only send controller messages (chat is dropped)',
    roster[0].msgs.filter((m) => m && m.k === 'chat').length === chatBefore);

  console.log('reconnect and identity');
  const rc = 'R' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const t1 = tok();
  const owner = rawJoin(rc, 'ownerx1', t1);
  const other = connect(rc, 'other1', { token: tok() });
  await other.opened;
  await sleep(150);
  const imposter = rawJoin(rc, 'ownerx1', tok());
  await sleep(250);
  check('a different token cannot take an id in use (4003)', imposter.closeCode === 4003, 'close code ' + imposter.closeCode);
  check('the original owner is unaffected', owner.closeCode === null);

  const again = connect(rc, 'ownerx1', { token: t1 });
  await again.opened;
  await sleep(250);
  check('the same token reconnects and replaces the old socket (4000)', owner.closeCode === 4000, 'close code ' + owner.closeCode);
  check('the reconnected player is live again', again.open);
  send(again, { k: 'hi', n: 'Back', j: 2 });
  await sleep(120);
  check('reconnected player is relayed to others', other.msgs.some((m) => m && m.k === 'hi' && m.id === 'ownerx1'));

  console.log('rate limit');
  const rl = 'L' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const flood = connect(rl, uid('flood'));
  const watcher = connect(rl, uid('watch'));
  await Promise.all([flood.opened, watcher.opened]);
  for (let i = 0; i < 400; i++) send(flood, { k: 'em', e: 0 });
  await sleep(400);
  const got2 = watcher.msgs.filter((m) => m && m.k === 'em').length;
  check('a burst is rate limited (not all 400 delivered)', got2 > 0 && got2 < 200, 'delivered ' + got2);
  check('a flooding sender stays connected for now', flood.closed === null);

  console.log('origin');
  const oc = 'O' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  try {
    const bad = connect(oc, uid('evil'), { origin: 'https://evil.example' });
    await bad.opened;
    await sleep(120);
    check('a websocket from a foreign origin is refused', !bad.open, 'open=' + bad.open);
  } catch (e) {
    check('a websocket from a foreign origin is refused', true);
  }
  const good = connect(oc, uid('good'), { origin: 'http://localhost:8000' });
  await good.opened;
  check('a websocket from an allowed origin is accepted', good.open);

  for (const c of [A, B, ...roster, ninth, phone, owner, other, imposter, again, flood, watcher, good]) {
    try { c.ws.close(); } catch (_) { /* gone */ }
  }
  await sleep(100);

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
