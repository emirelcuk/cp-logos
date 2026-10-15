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
      gun: [-20, 170],
      body: { y1: 250, y2: 340 },
    },
    twin: {
      label: 'Çift motorlu avcı (F-15 / F-4 tipi)',
      half: [[0, 14], [9, 48], [17, 96], [22, 138], [44, 150], [48, 205], [172, 300], [176, 304], [176, 334],
        [50, 346], [50, 392], [116, 438], [116, 462], [44, 466], [38, 490], [0, 490]],
      canopy: { y: 100, rx: 10, ry: 30 },
      fins: [{ x: 36, y1: 395, y2: 478 }, { x: -36, y1: 395, y2: 478 }],
      wing: { root: [52, 282], tip: [168, 318] },
      gun: [44, 190],
      body: { y1: 240, y2: 360 },
    },
    delta: {
      label: 'Delta kanat',
      half: [[0, 14], [9, 56], [17, 112], [22, 162], [150, 418], [152, 438], [26, 442], [19, 470], [0, 470]],
      canopy: { y: 104, rx: 9, ry: 30 },
      fins: [{ x: 0, y1: 360, y2: 466 }],
      wing: { root: [30, 360], tip: [130, 412] },
      gun: [-18, 180],
      body: { y1: 300, y2: 420 },
    },
    none: {
      label: 'Çizimsiz (serbest yerleşim)',
      half: [],
      fins: [],
      wing: { root: [30, 250], tip: [170, 250] },
      gun: [0, 80],
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

  // Merkez hattına bu kadar yakın istasyonlar gövde (CENTER) sayılır.
  const CENTER_TOLERANCE = 12;

  // Ana istasyon: numaralı, ek nokta veya top değil.
  function isMain(s) { return !s.parentId && s.type !== 'GUN'; }
  function isGun(s) { return s.type === 'GUN'; }

  function placeGuns(aircraft, onlyMissing) {
    const shape = shapeOf(aircraft.silhouette);
    aircraft.stations.filter(isGun).forEach(function (g, i) {
      if (onlyMissing && hasPosition(g)) return;
      g.x = round(VIEW.cx + shape.gun[0] + (shape.gun[0] < 0 ? -1 : 1) * 18 * i);
      g.y = round(shape.gun[1] + 14 * i);
    });
  }

  function locationOf(x) {
    if (Math.abs(x - VIEW.cx) <= CENTER_TOLERANCE) return 'CENTER';
    return x < VIEW.cx ? 'LEFT' : 'RIGHT';
  }

  /* Ek takma noktasının (ör. 5L, 5R) ana istasyona göre konumu. */
  function sideOffset(side, siblings) {
    if (side.suffix === 'L') return [-24, 6];
    if (side.suffix === 'R') return [24, 6];
    const others = siblings.filter(function (x) { return x.suffix !== 'L' && x.suffix !== 'R'; });
    return [0, 26 + 20 * Math.max(0, others.indexOf(side))];
  }

  function sidesOf(aircraft, parent) {
    return aircraft.stations.filter(function (s) { return s.parentId === parent.id; });
  }

  function placeSides(aircraft, parent) {
    const sides = sidesOf(aircraft, parent);
    sides.forEach(function (side) {
      const o = sideOffset(side, sides);
      side.x = round(parent.x + o[0]);
      side.y = round(parent.y + o[1]);
    });
  }

  /*
   * Varsayılan yerleşim (yalnızca ana istasyonlar): sol istasyonlar kanat ucundan köke, merkez
   * istasyonlar gövde boyunca, sağ istasyonlar kökten kanat ucuna. Grup içi sıra liste sırasıdır.
   */
  function autoLayout(aircraft) {
    const shape = shapeOf(aircraft.silhouette);
    const groups = { LEFT: [], CENTER: [], RIGHT: [] };
    aircraft.stations.filter(isMain).forEach(function (s) { (groups[s.location] || groups.CENTER).push(s); });
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

  function hasPosition(s) { return typeof s.x === 'number' && typeof s.y === 'number'; }

  /* Konumu olmayan istasyonlara varsayılan konum atar; true dönerse değişiklik yapılmıştır. */
  function ensurePositions(aircraft) {
    let changed = false;
    const mains = aircraft.stations.filter(isMain);
    if (aircraft.stations.some(function (s) { return isGun(s) && !hasPosition(s); })) { placeGuns(aircraft, true); changed = true; }
    if (mains.some(function (s) { return !hasPosition(s); })) {
      const layout = autoLayout(aircraft);
      mains.forEach(function (s) {
        if (!hasPosition(s)) { s.x = layout[s.id].x; s.y = layout[s.id].y; changed = true; }
      });
    }
    mains.forEach(function (m) {
      if (sidesOf(aircraft, m).some(function (s) { return !hasPosition(s); })) {
        const keep = sidesOf(aircraft, m).filter(hasPosition).map(function (s) { return [s, s.x, s.y]; });
        placeSides(aircraft, m);
        keep.forEach(function (k) { k[0].x = k[1]; k[0].y = k[2]; });
        changed = true;
      }
    });
    return changed;
  }

  /* Otomatik yerleşim; locations verilirse yalnızca o gruplardaki (LEFT/CENTER/RIGHT) istasyonlar taşınır. */
  function applyAutoLayout(aircraft, locations) {
    const layout = autoLayout(aircraft);
    if (!locations) placeGuns(aircraft, false);
    aircraft.stations.filter(isMain).forEach(function (s) {
      if (locations && locations.indexOf(s.location) < 0) return;
      s.x = layout[s.id].x; s.y = layout[s.id].y;
      placeSides(aircraft, s);
    });
    arrangeStations(aircraft);
  }

  const SUFFIX_ORDER = { L: 0, R: 1 };
  function suffixCompare(a, b) {
    const ra = a.suffix in SUFFIX_ORDER ? SUFFIX_ORDER[a.suffix] : 2;
    const rb = b.suffix in SUFFIX_ORDER ? SUFFIX_ORDER[b.suffix] : 2;
    return ra - rb || String(a.suffix).localeCompare(String(b.suffix));
  }

  /*
   * İstasyonları soldan sağa sıralar ve numaralar: ana istasyonlar 1..N (x, eşitlikte y sırası),
   * ek takma noktaları ana istasyon numarası + son ek (5L, 5R). Konum (sol/merkez/sağ) x'ten türetilir.
   * Liste sırası da buna göre güncellenir (her ana istasyonun ardından kendi ek noktaları).
   * true dönerse sıra veya kodlar değişmiştir.
   */
  function arrangeStations(aircraft) {
    ensurePositions(aircraft);
    const before = aircraft.stations.map(function (s) { return s.id + ':' + s.code + ':' + s.location; }).join('|');
    const byId = {};
    aircraft.stations.forEach(function (s) { byId[s.id] = s; });
    // Ana istasyonu silinmiş ek noktalar bağımsız istasyon olur.
    aircraft.stations.forEach(function (s) {
      const parent = s.parentId ? byId[s.parentId] : null;
      if (s.parentId && (!parent || parent.parentId || isGun(parent))) { s.parentId = null; s.suffix = ''; }
      if (isGun(s)) { s.parentId = null; s.suffix = ''; }
    });
    const mains = aircraft.stations.filter(isMain).sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    const ordered = [];
    mains.forEach(function (m, i) {
      m.code = String(i + 1);
      m.location = locationOf(m.x);
      ordered.push(m);
      sidesOf(aircraft, m).sort(suffixCompare).forEach(function (side) {
        side.code = m.code + side.suffix;
        side.location = locationOf(side.x);
        ordered.push(side);
      });
    });
    // Toplar numarasız: tek ise GUN, birden fazla ise soldan sağa GUN1, GUN2...
    const guns = aircraft.stations.filter(isGun).sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    guns.forEach(function (g, i) {
      g.code = guns.length === 1 ? 'GUN' : 'GUN' + (i + 1);
      g.location = locationOf(g.x);
      ordered.push(g);
    });
    aircraft.stations.splice.apply(aircraft.stations, [0, aircraft.stations.length].concat(ordered));
    const after = aircraft.stations.map(function (s) { return s.id + ':' + s.code + ':' + s.location; }).join('|');
    return before !== after;
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
    arrangeStations: arrangeStations,
    placeSides: placeSides,
    sidesOf: sidesOf,
    isMain: isMain,
    isGun: isGun,
    locationOf: locationOf,
  };
});
