/* Leaderboards client: talks to the room server's /api/boards endpoints (Cloudflare Worker + D1).
   Boards.get(board, params) -> {top, mine, rank, players} or null when the server can't be reached.
   Boards.post(board, row)   -> true when the result was saved. board is 'race', 'daily' or 'typing'. */
(function () {
  function base() {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8787';
    return String(window.SKR_API || '').replace(/\/+$/, '');
  }
  function qs(o) {
    return Object.keys(o || {}).filter(function (k) { return o[k] != null && o[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&');
  }
  function get(board, params) {
    var b = base(); if (!b) return Promise.resolve(null);
    return fetch(b + '/api/boards/' + board + '?' + qs(params), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function post(board, row) {
    var b = base(); if (!b) return Promise.resolve(false);
    return fetch(b + '/api/boards/' + board, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }
  window.Boards = { get: get, post: post, base: base };
})();
