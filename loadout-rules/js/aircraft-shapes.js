/*
 * Uçak üstten görünüm çizimleri ve istasyon yerleşimi.
 * Çizimler şematiktir: burun yukarıda, koordinat sistemi VIEW (400 x 500), merkez hattı x = 200.
 * Her şekil sağ yarının dış hat noktalarıyla tanımlanır; sol yarı ayna ile üretilir.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AircraftShapes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VIEW = { width: 400, height: 500, cx: 200 };

  const SHAPES = {
    single: {
      label: 'Tek motorlu avcı (F-16 tipi)',
      half: [[0, 14], [7, 40], [13, 80], [17, 130], [21, 165], [34, 212], [160, 312], [168, 314], [168, 342],
        [40, 350], [30, 392], [92, 438], [94, 458], [28, 462], [17, 486], [0, 486]],
      canopy: { y: 92, rx: 9, ry: 28 },
      fins: [{ x: 0, y1: 400, y2: 482 }],
      // İstasyonların kanat üzerinde dizileceği hat (sağ yarı, kökten uca) ve gövde hattı.
      wing: { root: [36, 288], tip: [166, 328] },
      body: { y1: 250, y2: 340 },
    },
    twin: {
      label: 'Çift motorlu avcı (F-15 / F-4 tipi)',
      half: [[0, 14], [9, 48], [17, 96], [22, 138], [44, 150], [48, 205], [172, 300], [176, 304], [176, 334],
        [50, 346], [50, 392], [116, 438], [116, 462], [44, 466], [38, 490], [0, 490]],
      canopy: { y: 100, rx: 10, ry: 30 },
      fins: [{ x: 36, y1: 395, y2: 478 }, { x: -36, y1: 395, y2: 478 }],
      wing: { root: [52, 282], tip: [168, 318] },
      body: { y1: 240, y2: 360 },
    },
    delta: {
      label: 'Delta kanat',
      half: [[0, 14], [9, 56], [17, 112], [22, 162], [150, 418], [152, 438], [26, 442], [19, 470], [0, 470]],
      canopy: { y: 104, rx: 9, ry: 30 },
      fins: [{ x: 0, y1: 360, y2: 466 }],
      wing: { root: [30, 360], tip: [130, 412] },
      body: { y1: 300, y2: 420 },
    },
    none: {
      label: 'Çizimsiz (serbest yerleşim)',
      half: [],
      fins: [],
      wing: { root: [30, 250], tip: [170, 250] },
      body: { y1: 150, y2: 400 },
    },
  };

  function shapeOf(id) { return SHAPES[id] || SHAPES.single; }

  function outlinePath(id) {
    const half = shapeOf(id).half;
    if (!half.length) return '';
    const right = half.map(function (p) { return [VIEW.cx + p[0], p[1]]; });
    const left = half.slice().reverse().map(function (p) { return [VIEW.cx - p[0], p[1]]; });
    return 'M' + right.concat(left).map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + ' Z';
  }

  /*
   * Varsayılan yerleşim: sol istasyonlar kanat ucundan köke, merkez istasyonlar gövde boyunca,
   * sağ istasyonlar kökten kanat ucuna. Liste sırası korunur (ör. STA1 sol uç ... STA9 sağ uç).
   */
  function autoLayout(aircraft) {
    const shape = shapeOf(aircraft.silhouette);
    const groups = { LEFT: [], CENTER: [], RIGHT: [] };
    aircraft.stations.forEach(function (s) { (groups[s.location] || groups.CENTER).push(s); });
    const along = function (t) {
      const r = shape.wing.root, tip = shape.wing.tip;
      return [r[0] + (tip[0] - r[0]) * t, r[1] + (tip[1] - r[1]) * t];
    };
    const spread = function (n, i) { return n === 1 ? 0.6 : 1 - i * 0.85 / (n - 1); };
    const out = {};
    groups.LEFT.forEach(function (s, i) {
      const p = along(spread(groups.LEFT.length, i));
      out[s.id] = { x: round(VIEW.cx - p[0]), y: round(p[1]) };
    });
    groups.RIGHT.forEach(function (s, i) {
      const n = groups.RIGHT.length;
      const p = along(spread(n, n - 1 - i));
      out[s.id] = { x: round(VIEW.cx + p[0]), y: round(p[1]) };
    });
    groups.CENTER.forEach(function (s, i) {
      const n = groups.CENTER.length;
      const y = n === 1 ? (shape.body.y1 + shape.body.y2) / 2 : shape.body.y1 + (shape.body.y2 - shape.body.y1) * i / (n - 1);
      out[s.id] = { x: VIEW.cx, y: round(y) };
    });
    return out;
  }

  /* Konumu olmayan istasyonlara varsayılan konum atar; true dönerse değişiklik yapılmıştır. */
  function ensurePositions(aircraft) {
    const missing = aircraft.stations.filter(function (s) { return typeof s.x !== 'number' || typeof s.y !== 'number'; });
    if (!missing.length) return false;
    const layout = autoLayout(aircraft);
    missing.forEach(function (s) { s.x = layout[s.id].x; s.y = layout[s.id].y; });
    return true;
  }

  function applyAutoLayout(aircraft) {
    const layout = autoLayout(aircraft);
    aircraft.stations.forEach(function (s) { s.x = layout[s.id].x; s.y = layout[s.id].y; });
  }

  function round(v) { return Math.round(v * 10) / 10; }

  return {
    VIEW: VIEW,
    SHAPES: SHAPES,
    shapeOf: shapeOf,
    outlinePath: outlinePath,
    autoLayout: autoLayout,
    ensurePositions: ensurePositions,
    applyAutoLayout: applyAutoLayout,
  };
});
