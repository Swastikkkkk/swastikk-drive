/**
 * Track Drawer Subsystem: Path capturing, smoothing, loop normalization and validation
 */
(function(window) {
  var TrackDrawer = {
    canvas: null,
    ctx: null,
    points: [],
    isDrawing: false,
    onValidated: null,
    onError: null,

    init: function(canvasEl, onValidated, onError) {
      this.canvas = canvasEl;
      this.ctx = canvasEl ? canvasEl.getContext('2d') : null;
      this.onValidated = onValidated;
      this.onError = onError;
      this.bindEvents();
    },

    resize: function() {
      if (!this.canvas) return;
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.redraw();
    },

    clear: function() {
      this.points = [];
      this.isDrawing = false;
      if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    bindEvents: function() {
      var self = this;
      if (!this.canvas) return;

      var getPos = function(e) {
        var r = self.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };

      this.canvas.addEventListener('pointerdown', function(e) {
        self.isDrawing = true;
        self.points = [getPos(e)];
        if (self.ctx) self.ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
        try { self.canvas.setPointerCapture(e.pointerId); } catch(_) {}
      });

      this.canvas.addEventListener('pointermove', function(e) {
        if (!self.isDrawing) return;
        var p = getPos(e);
        var last = self.points[self.points.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 3.5) {
          self.points.push(p);
          self.redraw();
        }
      });

      var onEnd = function() {
        if (!self.isDrawing) return;
        self.isDrawing = false;
        self.validateAndFinish();
      };

      this.canvas.addEventListener('pointerup', onEnd);
      this.canvas.addEventListener('pointercancel', onEnd);
    },

    redraw: function() {
      if (!this.ctx || this.points.length < 2) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.strokeStyle = '#f2eee6';
      this.ctx.lineWidth = 4;
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      this.ctx.beginPath();
      this.ctx.moveTo(this.points[0].x, this.points[0].y);
      for (var i = 1; i < this.points.length; i++) {
        this.ctx.lineTo(this.points[i].x, this.points[i].y);
      }
      this.ctx.stroke();
    },

    validateAndFinish: function() {
      if (this.points.length < 8) {
        if (this.onError) this.onError('Draw a bigger loop.');
        return;
      }
      var first = this.points[0], last = this.points[this.points.length - 1];
      var closeDist = Math.hypot(last.x - first.x, last.y - first.y);
      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      this.points.forEach(function(p) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      });
      var diag = Math.hypot(maxX - minX, maxY - minY);
      if (diag < 100) {
        if (this.onError) this.onError('Draw a bigger loop.');
        return;
      }
      // Auto-connect if reasonably close, or alert
      var closed = this.points.slice();
      closed.push({ x: first.x, y: first.y });

      // Resample
      var rawLen = 0;
      for (var i = 1; i < closed.length; i++) {
        rawLen += Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y);
      }
      var step = Math.max(4, rawLen / 110);
      var rs = this.resample(closed, step);

      // Check self-intersections
      for (var i = 0; i < rs.length - 1; i++) {
        for (var j = i + 2; j < rs.length - 1; j++) {
          if (i === 0 && j === rs.length - 2) continue;
          if (this.segInt(rs[i], rs[i + 1], rs[j], rs[j + 1])) {
            if (this.onError) this.onError('Track crosses itself. Try a simpler loop.');
            return;
          }
        }
      }

      if (this.onValidated) {
        this.onValidated(rs.slice(0, rs.length - 1));
      }
    },

    resample: function(pts, step) {
      var out = [pts[0]];
      var acc = 0;
      for (var i = 1; i < pts.length; i++) {
        var a = pts[i - 1];
        var b = pts[i];
        var segLen = Math.hypot(b.x - a.x, b.y - a.y);
        while (acc + segLen >= step) {
          var t = (step - acc) / segLen;
          var nx = a.x + (b.x - a.x) * t;
          var ny = a.y + (b.y - a.y) * t;
          out.push({ x: nx, y: ny });
          a = { x: nx, y: ny };
          segLen = Math.hypot(b.x - a.x, b.y - a.y);
          acc = 0;
        }
        acc += segLen;
      }
      return out;
    },

    segInt: function(a, b, c, d) {
      var d1 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
      var d2 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
      var d3 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      var d4 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }
  };

  window.TrackDrawer = TrackDrawer;
})(window);
