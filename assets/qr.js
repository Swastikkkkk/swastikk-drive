/**
 * Self-contained QR Code generator for browser canvas
 * Generates standards-compliant QR Code Matrix (Model 2, Byte Mode, Error Correction Level M/L)
 */
(function(window) {
  // QR Code generator implementation
  function QRCode(text, level) {
    this.text = text;
    this.level = level || 'M'; // 'L', 'M', 'Q', 'H'
    this.modules = null;
    this.moduleCount = 0;
    this.make();
  }

  // Polynomial & Galois Field math for Reed-Solomon
  var QRMath = {
    glog: function(n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function(n) {
      while (n < 0) n += 255;
      while (n >= 256) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };
  for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  function QRPolynomial(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[offset + i];
  }
  QRPolynomial.prototype = {
    get: function(index) { return this.num[index]; },
    getLength: function() { return this.num.length; },
    multiply: function(e) {
      var num = new Array(this.getLength() + e.getLength() - 1);
      for (var i = 0; i < num.length; i++) num[i] = 0;
      for (var i = 0; i < this.getLength(); i++) {
        for (var j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function(e) {
      if (this.getLength() - e.getLength() < 0) return this;
      var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      var num = new Array(this.getLength());
      for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (var i = 0; i < e.getLength(); i++) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }
  var RS_BLOCK_TABLE = [
    // L, M, Q, H
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9], // 1
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16], // 2
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13], // 3
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9], // 4
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12], // 5
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15], // 6
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14], // 7
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15], // 8
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13], // 9
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16] // 10
  ];

  function getRSBlocks(typeNumber, errorCorrectLevel) {
    var row = (typeNumber - 1) * 4 + errorCorrectLevel;
    var raw = RS_BLOCK_TABLE[row];
    var list = [];
    for (var i = 0; i < raw.length; i += 3) {
      for (var j = 0; j < raw[i]; j++) list.push(new QRRSBlock(raw[i + 1], raw[i + 2]));
    }
    return list;
  }

  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  QRBitBuffer.prototype = {
    get: function(index) { return ((this.buffer[Math.floor(index / 8)] >>> (7 - index % 8)) & 1) === 1; },
    put: function(num, length) {
      for (var i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    },
    putBit: function(bit) {
      if (this.length === this.buffer.length * 8) this.buffer.push(0);
      if (bit) this.buffer[Math.floor(this.length / 8)] |= (0x80 >>> (this.length % 8));
      this.length++;
    }
  };

  QRCode.prototype.make = function() {
    var textBytes = [];
    for (var i = 0; i < this.text.length; i++) {
      var c = this.text.charCodeAt(i);
      if (c < 128) textBytes.push(c);
      else if (c < 2048) { textBytes.push(192 | (c >> 6)); textBytes.push(128 | (c & 63)); }
      else { textBytes.push(224 | (c >> 12)); textBytes.push(128 | ((c >> 6) & 63)); textBytes.push(128 | (c & 63)); }
    }

    var ecLevel = { 'L': 1, 'M': 0, 'Q': 3, 'H': 2 }[this.level] || 0;
    var typeNumber = 1;
    for (; typeNumber <= 10; typeNumber++) {
      var blocks = getRSBlocks(typeNumber, ecLevel);
      var totalData = 0;
      for (var b = 0; b < blocks.length; b++) totalData += blocks[b].dataCount;
      if (textBytes.length + 3 <= totalData) break;
    }
    if (typeNumber > 10) typeNumber = 10;

    this.typeNumber = typeNumber;
    this.moduleCount = typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (var r = 0; r < this.moduleCount; r++) {
      this.modules[r] = new Array(this.moduleCount);
      for (var c = 0; c < this.moduleCount; c++) this.modules[r][c] = null;
    }

    // Patterns
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupTimingPattern();
    if (typeNumber >= 2) this.setupPositionAdjustPattern();

    // Data encoding
    var buffer = new QRBitBuffer();
    buffer.put(4, 4); // 8-bit byte mode
    buffer.put(textBytes.length, typeNumber < 10 ? 8 : 16);
    for (var i = 0; i < textBytes.length; i++) buffer.put(textBytes[i], 8);

    var rsBlocks = getRSBlocks(typeNumber, ecLevel);
    var totalDataCount = 0;
    for (var i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;

    if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.length % 8 !== 0) buffer.putBit(false);
    while (buffer.length < totalDataCount * 8) {
      buffer.put(0xec, 8);
      if (buffer.length < totalDataCount * 8) buffer.put(0x11, 8);
    }

    // Error correction code
    var offset = 0;
    var dcdata = new Array(rsBlocks.length);
    var ecdata = new Array(rsBlocks.length);
    for (var r = 0; r < rsBlocks.length; r++) {
      var dcCount = rsBlocks[r].dataCount;
      var ecCount = rsBlocks[r].totalCount - dcCount;
      dcdata[r] = new Array(dcCount);
      for (var i = 0; i < dcCount; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      offset += dcCount;

      var rsPoly = new QRPolynomial([1], 0);
      for (var i = 0; i < ecCount; i++) rsPoly = rsPoly.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      var modPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1).mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (var i = 0; i < ecdata[r].length; i++) {
        var modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
      }
    }

    var data = [];
    for (var i = 0; i < 150; i++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) data.push(dcdata[r][i]);
      }
    }
    for (var i = 0; i < 150; i++) {
      for (var r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) data.push(ecdata[r][i]);
      }
    }

    // Place data in matrix
    var bitIndex = 0;
    for (var col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var count = 0; count < this.moduleCount; count++) {
        for (var c = 0; c < 2; c++) {
          var row = ((col + 1) & 2) === 0 ? this.moduleCount - 1 - count : count;
          if (this.modules[row][col - c] === null) {
            var bit = false;
            if (bitIndex < data.length * 8) {
              bit = (((data[Math.floor(bitIndex / 8)] >>> (7 - bitIndex % 8)) & 1) === 1);
            }
            // Mask pattern 0: (row + col) % 2 === 0
            var mask = (row + (col - c)) % 2 === 0;
            this.modules[row][col - c] = bit ^ mask;
            bitIndex++;
          }
        }
      }
    }
    this.setupFormatInfo(ecLevel, 0);
  };

  QRCode.prototype.setupPositionProbePattern = function(row, col) {
    for (var r = -1; r <= 7; r++) {
      if (row + r < 0 || this.moduleCount <= row + r) continue;
      for (var c = -1; c <= 7; c++) {
        if (col + c < 0 || this.moduleCount <= col + c) continue;
        if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
            (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
          this.modules[row + r][col + c] = true;
        } else {
          this.modules[row + r][col + c] = false;
        }
      }
    }
  };

  QRCode.prototype.setupTimingPattern = function() {
    for (var r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] !== null) continue;
      this.modules[r][6] = (r % 2 === 0);
    }
    for (var c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] !== null) continue;
      this.modules[6][c] = (c % 2 === 0);
    }
  };

  QRCode.prototype.setupPositionAdjustPattern = function() {
    var pos = [6, this.moduleCount - 7];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var row = pos[i], col = pos[j];
        if (this.modules[row][col] !== null) continue;
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            this.modules[row + r][col + c] = (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0));
          }
        }
      }
    }
  };

  QRCode.prototype.setupFormatInfo = function(ecLevel, maskPattern) {
    var data = (ecLevel << 3) | maskPattern;
    var d = data << 10;
    while (QRMath.glog(d) >= QRMath.glog(1335)) {
      d ^= 1335 << (QRMath.glog(d) - QRMath.glog(1335));
    }
    var bits = ((data << 10) | d) ^ 0x5412;
    for (var i = 0; i < 15; i++) {
      var mod = ((bits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;

      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = true;
  };

  QRCode.prototype.drawToCanvas = function(canvas, scale, margin) {
    scale = scale || 6;
    margin = margin != null ? margin : 2;
    var size = (this.moduleCount + margin * 2) * scale;
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#06070b';

    for (var r = 0; r < this.moduleCount; r++) {
      for (var c = 0; c < this.moduleCount; c++) {
        if (this.modules[r][c]) {
          ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
        }
      }
    }
  };

  window.AppQR = {
    render: function(canvas, text, scale) {
      /* proven encoder (vendor/qrcode.js, qrcode-generator, MIT); the hand-rolled one below drew a blank code */
      if (window.qrcode) {
        try {
          var q = window.qrcode(0, 'M'); q.addData(text); q.make();
          var n = q.getModuleCount(), m = 2, s = scale || 6, size = (n + m * 2) * s;
          canvas.width = size; canvas.height = size;
          var g = canvas.getContext('2d');
          g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000000';
          for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + m) * s, (r + m) * s, s, s);
          return true;
        } catch (e) { console.error('QR Gen error:', e); }
      }
      try {
        var qr = new QRCode(text, 'M');
        qr.drawToCanvas(canvas, scale || 5, 2);
        return true;
      } catch (e) {
        console.error('QR Gen error:', e);
        return false;
      }
    }
  };
})(window);
