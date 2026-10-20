/* RoomNet: WebSocket client for rooms. Exposes window.RoomNet.open(opts). */
(function () {
  var warned = false;

  function baseUrl() {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return 'ws://localhost:8787';
    return String(window.SKR_ROOMS_WS || '').replace(/\/+$/, '');
  }

  function open(opts) {
    var closed = false, ws = null, timer = null, tries = 0;
    var base = baseUrl();
    var noop = { send: function () {}, close: function () {} };

    function emit(s) {
      if (opts.onStatus) { try { opts.onStatus(s); } catch (e) {} }
    }

    if (!base) {
      if (!warned) { warned = true; console.warn('RoomNet: no rooms server URL configured (SKR_ROOMS_WS)'); }
      setTimeout(function () { emit('down'); }, 0);
      return noop;
    }

    var url = base + '/rooms/' + encodeURIComponent(opts.code) + '/ws?pid=' + encodeURIComponent(opts.pid) +
      '&role=' + opts.role + (opts.tok ? '&tok=' + encodeURIComponent(opts.tok) : '');

    function scheduleRetry() {
      var delay = Math.min(5000, 400 * Math.pow(1.8, tries));
      tries++;
      emit(tries > 8 ? 'down' : 'retry');
      timer = setTimeout(connect, delay);
    }

    function connect() {
      timer = null;
      if (closed) return;
      try { ws = new WebSocket(url); } catch (e) { scheduleRetry(); return; }
      ws.onopen = function () { tries = 0; emit('up'); };
      ws.onmessage = function (ev) {
        var d = ev.data;
        if (typeof d !== 'string' || d.length > 600000) return;
        var msg;
        try { msg = JSON.parse(d); } catch (e) { return; }
        if (opts.onMsg) { try { opts.onMsg(msg); } catch (e) {} }
      };
      ws.onclose = function (ev) {
        ws = null;
        if (closed) return;
        if (ev.code === 4001) { emit('full'); closed = true; return; }
        if (ev.code === 4003 || ev.code === 4000) { emit('denied'); closed = true; return; }
        scheduleRetry();
      };
    }

    emit('connecting');
    connect();

    return {
      send: function (obj) {
        if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
      },
      close: function () {
        closed = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (ws) {
          var s = ws;
          ws = null;
          try { s.close(1000); } catch (e) {}
        }
      }
    };
  }

  window.RoomNet = { open: open };
})();
