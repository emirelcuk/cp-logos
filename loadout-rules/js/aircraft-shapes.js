/*
 * Aircraft top-view drawings and station layout.
 * Drawings are schematic: nose up, coordinate system VIEW (400 x 500), centre line x = 200.
 * Each shape is defined by the outline points of its right half; the left half is mirrored.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AircraftShapes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VIEW = { width: 400, height: 500, cx: 200 };

  const SHAPES = {
    single: {
      label: 'Single-engine fighter (F-16 type)',
      half: [[0, 14], [7, 40], [13, 80], [17, 130], [21, 165], [34, 212], [160, 312], [168, 314], [168, 342],
        [40, 350], [30, 392], [92, 438], [94, 458], [28, 462], [17, 486], [0, 486]],
      canopy: { y: 92, rx: 9, ry: 28 },
      fins: [{ x: 0, y1: 400, y2: 482 }],
      // Line along which wing stations are spread (right half, root to tip) and the fuselage band.
      wing: { root: [36, 288], tip: [166, 328] },
      gun: [-20, 170],
      body: { y1: 250, y2: 340 },
    },
    twin: {
      label: 'Twin-engine fighter (F-15 / F-4 type)',
      half: [[0, 14], [9, 48], [17, 96], [22, 138], [44, 150], [48, 205], [172, 300], [176, 304], [176, 334],
        [50, 346], [50, 392], [116, 438], [116, 462], [44, 466], [38, 490], [0, 490]],
      canopy: { y: 100, rx: 10, ry: 30 },
      fins: [{ x: 36, y1: 395, y2: 478 }, { x: -36, y1: 395, y2: 478 }],
      wing: { root: [52, 282], tip: [168, 318] },
      gun: [44, 190],
      body: { y1: 240, y2: 360 },
    },
    eurofighter: {
      label: 'Eurofighter Typhoon (canard delta)',
      // Long nose, canards behind the cockpit, chin intake, cranked delta wing, single fin.
      half: [[0, 10], [6, 40], [11, 80], [14, 112], [16, 126], [54, 152], [56, 160], [19, 163], [26, 196],
        [30, 214], [170, 392], [173, 398], [173, 410], [44, 416], [36, 446], [30, 470], [0, 470]],
      canopy: { y: 96, rx: 9, ry: 26 },
      fins: [{ x: 0, y1: 350, y2: 466 }],
      wing: { root: [40, 330], tip: [152, 396] },
      gun: [30, 300],
      body: { y1: 250, y2: 390 },
    },
    calidus: {
      label: 'CALIDUS B-250 (turboprop light attack)',
      // Turboprop nose with propeller, tandem cockpit, straight tapered low wing, conventional tail.
      half: [[0, 34], [10, 42], [16, 60], [19, 102], [20, 178], [186, 192], [189, 196], [189, 214], [176, 220],
        [22, 246], [16, 340], [80, 410], [83, 416], [83, 430], [16, 436], [10, 474], [0, 476]],
      canopy: { y: 134, rx: 10, ry: 34 },
      fins: [{ x: 0, y1: 390, y2: 474 }],
      prop: { y: 32, half: 46 },
      wing: { root: [40, 216], tip: [172, 209] },
      gun: [0, 82],
      body: { y1: 210, y2: 280 },
    },
    delta: {
      label: 'Delta wing',
      half: [[0, 14], [9, 56], [17, 112], [22, 162], [150, 418], [152, 438], [26, 442], [19, 470], [0, 470]],
      canopy: { y: 104, rx: 9, ry: 30 },
      fins: [{ x: 0, y1: 360, y2: 466 }],
      wing: { root: [30, 360], tip: [130, 412] },
      gun: [-18, 180],
      body: { y1: 300, y2: 420 },
    },
    none: {
      label: 'No drawing (free layout)',
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

  // Stations this close to the centre line count as fuselage (CENTER) stations.
  const CENTER_TOLERANCE = 12;

  // Main station: numbered; not a side point and not a gun.
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

  /* Offset of a side station (e.g. 5L, 5R) from its parent station. */
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
   * Default layout (main stations only): left stations from wing tip to root, centre stations along
   * the fuselage, right stations from root to wing tip. Order within a group is list order.
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

  /* Gives stations without a position a default one; returns true if anything changed. */
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

  /* Auto layout; when locations is given only stations in those groups (LEFT/CENTER/RIGHT) move. */
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
   * Sorts and numbers stations left to right: main stations 1..N (by x, then y), side stations get
   * parent number + suffix (5L, 5R). Location (left/centre/right) is derived from x. The list order
   * is updated too (each main station followed by its side stations).
   * Returns true if order or codes changed.
   */
  function arrangeStations(aircraft) {
    ensurePositions(aircraft);
    const before = aircraft.stations.map(function (s) { return s.id + ':' + s.code + ':' + s.location; }).join('|');
    const byId = {};
    aircraft.stations.forEach(function (s) { byId[s.id] = s; });
    // Side stations whose parent was deleted become independent stations.
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
    // Guns are unnumbered: GUN when there is one, otherwise GUN1, GUN2... left to right.
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

  /*
   * Mirror station across the centre line (e.g. 3 <-> 7, 5L <-> 5R): the station of the same kind
   * (main / side) closest to the mirrored position and at most 40 units away; otherwise null.
   */
  function mirrorOf(aircraft, st) {
    if (isGun(st) || !hasPosition(st) || Math.abs(st.x - VIEW.cx) <= CENTER_TOLERANCE / 2) return null;
    const tx = 2 * VIEW.cx - st.x;
    let best = null, bestD = 40;
    aircraft.stations.forEach(function (s) {
      if (s === st || isGun(s) || !!s.parentId !== !!st.parentId || !hasPosition(s)) return;
      const d = Math.hypot(s.x - tx, s.y - st.y);
      if (d <= bestD) { best = s; bestD = d; }
    });
    return best;
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
    mirrorOf: mirrorOf,
    isGun: isGun,
    locationOf: locationOf,
  };
});
