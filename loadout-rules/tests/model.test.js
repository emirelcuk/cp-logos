'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/model.js');
const X = require('../js/xml-export.js');
const SH = require('../js/aircraft-shapes.js');

test('sample project validates without errors', function () {
  const errors = M.validate(M.sampleProject()).filter(function (i) { return i.level === 'error'; });
  assert.deepStrictEqual(errors, []);
});

test('invalid nesting and position overflow are caught', function () {
  const p = M.sampleProject();
  const st = p.aircraft[0].stations[2]; // 3: MAU-12 → (MK-82 | … | TER-9 → 3×MK-82 | …)
  const mau = st.loads[0];
  const ter = mau.children.find(function (c) { return M.findStore(p, c.kind, c.refId).code === 'TER-9'; });
  // A rack cannot go under a store.
  mau.children[0].children.push(M.newLoadNode('rack', p.catalog.racks[0].id));
  // TER-9 has 3 positions; 4 bombs do not fit.
  ter.children[0].qty = 4;
  const messages = M.validate(p).map(function (i) { return i.message; });
  assert.ok(messages.some(function (m) { return /cannot be fitted under/.test(m); }));
  assert.ok(messages.some(function (m) { return /number of positions \(3\)/.test(m); }));
});

test('duplicate codes and dangling references are errors', function () {
  const p = M.sampleProject();
  p.catalog.munitions[1].code = p.catalog.munitions[0].code;
  p.aircraft[0].constraints[0].stationIds.push('yok');
  const messages = M.validate(p).map(function (i) { return i.message; });
  assert.ok(messages.some(function (m) { return /Duplicate code/.test(m); }));
  assert.ok(messages.some(function (m) { return /deleted station/.test(m); }));
});

test('generic XML references by code and escapes special characters', function () {
  const p = M.sampleProject();
  p.name = 'A & B <test>';
  const xml = X.EXPORTERS.generic.exportProject(p, M);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('project="A &amp; B &lt;test&gt;"'));
  assert.ok(xml.includes('<Allow type="SUBRACK" ref="TER-9" maxQty="1">'));
  assert.ok(xml.includes('<Allow type="MUNITION" ref="MK-82" maxQty="3"/>'));
  assert.ok(xml.includes('<Constraint type="MAX_TOTAL" munition="MK-84" value="2">'));
  assert.ok(xml.includes('<Station code="5L" parent="5"'));
  assert.ok(!/weightKg|maxLoadKg/.test(xml));
  assert.ok(xml.includes('<StationRef code="3"/>'));
});

test('normalizeProject fills in missing fields', function () {
  const p = M.normalizeProject({ name: 'x', aircraft: [{ code: 'A', stations: [{ code: 'S', loads: [{ kind: 'munition', refId: 'm' }] }] }] });
  assert.deepStrictEqual(p.catalog.racks, []);
  assert.strictEqual(p.aircraft[0].stations[0].loads[0].qty, 1);
  assert.deepStrictEqual(p.aircraft[0].constraints, []);
});

test('weight fields from old projects are removed', function () {
  const p = M.normalizeProject({
    catalog: { munitions: [{ id: 'm', code: 'M', weightKg: 100 }], racks: [{ id: 'r', code: 'R', weightKg: 5, maxLoadKg: 50 }] },
    aircraft: [{ code: 'A', stations: [{ code: 'S', maxLoadKg: 900 }] }],
  });
  assert.strictEqual('weightKg' in p.catalog.munitions[0], false);
  assert.strictEqual('maxLoadKg' in p.catalog.racks[0], false);
  assert.strictEqual('maxLoadKg' in p.aircraft[0].stations[0], false);
  assert.strictEqual(p.aircraft[0].silhouette, 'single');
});

test('auto layout: left tip to right tip, fuselage on the centre line', function () {
  const p = M.sampleProject();
  const ac = p.aircraft[0];
  SH.applyAutoLayout(ac);
  const mains = ac.stations.filter(SH.isMain);
  const xs = mains.map(function (s) { return s.x; });
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'x must increase: ' + xs.join(','));
  const center = mains.find(function (s) { return s.location === 'CENTER'; });
  assert.strictEqual(center.x, SH.VIEW.cx);
  // Symmetric stations are mirrored.
  assert.strictEqual(mains[0].x + mains[8].x, 2 * SH.VIEW.cx);
  assert.strictEqual(mains[0].y, mains[8].y);
});

test('ensurePositions only touches stations without a position', function () {
  const ac = M.sampleProject().aircraft[1];
  SH.ensurePositions(ac);
  ac.stations[0].x = 11; ac.stations[0].y = 22;
  ac.stations[2].x = null;
  assert.strictEqual(SH.ensurePositions(ac), true);
  assert.deepStrictEqual([ac.stations[0].x, ac.stations[0].y], [11, 22]);
  assert.strictEqual(ac.stations[2].x, SH.VIEW.cx);
  assert.strictEqual(SH.ensurePositions(ac), false);
});

test('every drawing type produces an outline', function () {
  Object.keys(SH.SHAPES).forEach(function (k) {
    const d = SH.outlinePath(k);
    if (SH.SHAPES[k].half.length) assert.ok(/^M[\d.,\s L]+Z$/.test(d), k);
  });
});

function codes(ac) { return ac.stations.map(function (s) { return s.code; }).join(' '); }

test('stations are numbered from 1 left to right, side stations follow their parent', function () {
  const ac = M.sampleProject().aircraft[0];
  SH.arrangeStations(ac);
  assert.strictEqual(codes(ac), '1 2 3 4 5 5L 5R 6 7 8 9 GUN');
  // 5L is on the left of the drawing, 5R on the right.
  const byCode = {};
  ac.stations.forEach(function (s) { byCode[s.code] = s; });
  assert.ok(byCode['5L'].x < byCode['5'].x && byCode['5R'].x > byCode['5'].x);
});

test('numbers are refreshed when a station is dragged past others', function () {
  const ac = M.sampleProject().aircraft[1];
  SH.arrangeStations(ac);
  const first = ac.stations[0];
  first.x = 390; // move to the far right
  assert.strictEqual(SH.arrangeStations(ac), true);
  assert.strictEqual(first.code, '5');
  assert.strictEqual(first.location, 'RIGHT');
  assert.strictEqual(codes(ac), '1 2 3 4 5');
});

test('a new left wing station becomes number 1 and the others shift', function () {
  const ac = M.sampleProject().aircraft[1];
  SH.arrangeStations(ac);
  const oldFirst = ac.stations[0];
  const s = M.newStation();
  s.location = 'LEFT';
  ac.stations.unshift(s);
  SH.applyAutoLayout(ac, ['LEFT']);
  assert.strictEqual(s.code, '1');
  assert.strictEqual(oldFirst.code, '2');
  assert.strictEqual(ac.stations.length, 6);
});

test('a side station whose parent is deleted becomes independent', function () {
  const ac = M.sampleProject().aircraft[0];
  SH.arrangeStations(ac);
  const five = ac.stations.find(function (s) { return s.code === '5'; });
  ac.stations.splice(ac.stations.indexOf(five), 1);
  SH.arrangeStations(ac);
  assert.ok(ac.stations.every(function (s) { return !s.parentId; }));
  assert.strictEqual(ac.stations.length, 11);
});

test('standard catalog contains real designations and is not added twice', function () {
  const p = M.emptyProject();
  const added = M.mergeStandardCatalog(p);
  const all = p.catalog.munitions.concat(p.catalog.racks, p.catalog.subracks).map(function (s) { return s.code; });
  ['MK-82', 'GBU-12', 'AIM-9X', 'AIM-120C', 'MAU-12', 'TER-9', 'LAU-129', 'BRU-61', 'LAU-61'].forEach(function (c) { assert.ok(all.indexOf(c) >= 0, c); });
  assert.ok(p.catalog.guns.length >= 10 && p.catalog.ammo.length >= 15);
  assert.ok(added > 100);
  assert.strictEqual(p.catalogVersion, M.STANDARD_CATALOG_VERSION);
  assert.strictEqual(M.mergeStandardCatalog(p), 0);
  assert.deepStrictEqual(M.validate(p).filter(function (i) { return i.level === 'error'; }), []);
});

test('gun stations are not numbered; several guns become GUN1, GUN2', function () {
  const ac = M.sampleProject().aircraft[1];
  const g1 = Object.assign(M.newStation(), { type: 'GUN' });
  const g2 = Object.assign(M.newStation(), { type: 'GUN' });
  ac.stations.push(g1, g2);
  SH.arrangeStations(ac);
  assert.strictEqual(codes(ac), '1 2 3 4 5 GUN1 GUN2');
  ac.stations.splice(ac.stations.indexOf(g2), 1);
  SH.arrangeStations(ac);
  assert.strictEqual(g1.code, 'GUN');
});

test('gun: round capacity overflow is an error, caliber mismatch a warning', function () {
  const p = M.sampleProject();
  const gunStation = p.aircraft[0].stations.find(function (s) { return s.type === 'GUN'; });
  const gun = gunStation.loads[0];
  gun.children[0].qty = 9999;
  const ammo30 = p.catalog.ammo.find(function (a) { return a.code === 'PGU-13/B'; });
  gun.children.push(M.newLoadNode('ammo', ammo30.id));
  // A store cannot be fitted directly to a gun station.
  gunStation.loads.push(M.newLoadNode('munition', p.catalog.munitions[0].id));
  const issues = M.validate(p);
  const msg = function (re) { return issues.some(function (i) { return re.test(i.message); }); };
  assert.ok(msg(/round capacity \(511\)/));
  assert.ok(issues.some(function (i) { return i.level === 'warning' && /Caliber mismatch/.test(i.message); }));
  assert.ok(msg(/cannot be fitted under a gun station/));
});

test('XML contains guns and ammunition', function () {
  const p = M.sampleProject();
  p.aircraft.forEach(function (a) { SH.arrangeStations(a); });
  const xml = X.EXPORTERS.generic.exportProject(p, M);
  assert.ok(xml.includes('<Gun code="M61A1" name="Vulcan 20 mm six-barrel cannon" caliber="20x102" capacity="511"/>'));
  assert.ok(xml.includes('<Ammo code="PGU-28/B"'));
  assert.ok(xml.includes('<Station code="GUN" type="GUN"'));
  assert.ok(xml.includes('<Allow type="AMMO" ref="PGU-28/B" maxQty="511"/>'));
});

test('standard catalog has no duplicate codes and ammunition for every gun caliber', function () {
  const c = M.standardCatalog();
  M.KINDS.forEach(function (k) {
    const codes = c[M.CATALOG_KEY[k]].map(function (s) { return s.code; });
    assert.strictEqual(new Set(codes).size, codes.length, k);
  });
  c.guns.forEach(function (g) {
    assert.ok(c.ammo.some(function (a) { return a.caliber === g.caliber; }), 'no ammunition for ' + g.code);
  });
});

test('presets: expanded in XML and matrix, a missing preset reference is an error', function () {
  const p = M.sampleProject();
  const ac = p.aircraft[0];
  SH.arrangeStations(ac);
  const one = ac.stations[0];
  assert.strictEqual(one.loads[0].kind, 'preset');
  const xml = X.EXPORTERS.generic.exportProject(p, M);
  assert.ok(!/type="PRESET"/.test(xml));
  assert.ok(/<Station code="1"[^>]*>\s*<Allow type="RACK" ref="LAU-129"/.test(xml));
  const mx = M.compatibility(p, ac, ['munition']);
  const aim9x = mx.rows.find(function (r) { return r.store.code === 'AIM-9X'; });
  assert.ok(aim9x.cells[one.id]);
  assert.strictEqual(aim9x.cells[one.id].paths[0], 'LAU-129 › AIM-9X');
  one.loads.push(M.newLoadNode('preset', 'missing'));
  assert.ok(M.validate(p).some(function (i) { return /not in the catalog/.test(i.message); }));
  assert.strictEqual(M.presetUsage(p, p.presets[0].id).length, 16); // A: 1,2,3,7,8,9 · B: 1,5 · C: 8 wing stations
});

test('matrix: nested quantities multiply, alternatives take the maximum', function () {
  const p = M.sampleProject();
  const ac = p.aircraft[0];
  SH.arrangeStations(ac);
  const three = ac.stations.find(function (s) { return s.code === '3'; });
  const mx = M.compatibility(p, ac, ['munition', 'subrack']);
  const mk82 = mx.rows.find(function (r) { return r.store.code === 'MK-82'; });
  assert.strictEqual(mk82.cells[three.id].qty, 3); // MAU-12 → MK-82 (1) | MAU-12 → TER-9 → 3×MK-82
  assert.strictEqual(mk82.cells[three.id].paths.length, 2);
  assert.ok(mx.rows.some(function (r) { return r.kind === 'subrack' && r.store.code === 'TER-9'; }));
  assert.ok(!mx.rows.some(function (r) { return r.kind === 'rack'; }));
});

test('duplicating an aircraft: new ids, side stations and rules point at the new stations', function () {
  const p = M.sampleProject();
  const ac = p.aircraft[0];
  const copy = M.duplicateAircraft(ac);
  assert.notStrictEqual(copy.id, ac.id);
  assert.strictEqual(copy.code, 'SAMPLE-A-COPY');
  const oldIds = ac.stations.map(function (s) { return s.id; });
  const newIds = copy.stations.map(function (s) { return s.id; });
  assert.ok(newIds.every(function (id) { return oldIds.indexOf(id) < 0; }));
  copy.stations.filter(function (s) { return s.parentId; }).forEach(function (s) { assert.ok(newIds.indexOf(s.parentId) >= 0); });
  copy.constraints.forEach(function (c) { c.stationIds.forEach(function (id) { assert.ok(newIds.indexOf(id) >= 0); }); });
  copy.stations[2].loads[0].qty = 99;
  assert.notStrictEqual(ac.stations[2].loads[0].qty, 99);
  p.aircraft.push(copy);
  assert.deepStrictEqual(M.validate(p).filter(function (i) { return i.level === 'error'; }), []);
});

test('mirror station: 3 <-> 7, 5L <-> 5R, none for centre and gun', function () {
  const ac = M.sampleProject().aircraft[0];
  SH.arrangeStations(ac);
  const by = {};
  ac.stations.forEach(function (s) { by[s.code] = s; });
  assert.strictEqual(SH.mirrorOf(ac, by['3']), by['7']);
  assert.strictEqual(SH.mirrorOf(ac, by['9']), by['1']);
  assert.strictEqual(SH.mirrorOf(ac, by['5L']), by['5R']);
  assert.strictEqual(SH.mirrorOf(ac, by['5']), null);
  assert.strictEqual(SH.mirrorOf(ac, by['GUN']), null);
});

test('cloneLoads makes a deep copy with new ids', function () {
  const p = M.sampleProject();
  const src = p.aircraft[0].stations[2].loads;
  const copy = M.cloneLoads(src);
  assert.strictEqual(JSON.stringify(copy.map(function (n) { return n.refId; })), JSON.stringify(src.map(function (n) { return n.refId; })));
  assert.notStrictEqual(copy[0].id, src[0].id);
  copy[0].children.pop();
  assert.notStrictEqual(copy[0].children.length, src[0].children.length);
});

test('legacy "packages" are migrated to presets', function () {
  const old = { packages: [{ id: 'p1', code: 'OLD', loads: [] }], aircraft: [{ code: 'A', stations: [{ code: '1', loads: [{ kind: 'package', refId: 'p1' }] }] }] };
  const p = M.normalizeProject(old);
  assert.strictEqual(p.packages, undefined);
  assert.strictEqual(p.presets[0].code, 'OLD');
  assert.strictEqual(p.aircraft[0].stations[0].loads[0].kind, 'preset');
});

test('catalog upgrade translates untouched Turkish standard entries only', function () {
  const p = M.normalizeProject({
    catalogVersion: 2,
    catalog: { munitions: [
      { code: 'MK-82', name: '500 lb genel maksat bombası', category: 'Genel maksat bombası' },
      { code: 'MK-84', name: 'My own name', category: 'Genel maksat bombası' },
      { code: 'X-1', name: 'Kendi kaydım', category: 'Diğer' },
    ] },
  });
  const r = M.upgradeCatalog(p);
  assert.strictEqual(r.translated, 2);
  const by = {};
  p.catalog.munitions.forEach(function (s) { by[s.code] = s; });
  assert.strictEqual(by['MK-82'].name, '500 lb general purpose bomb');
  assert.strictEqual(by['MK-84'].name, 'My own name');
  assert.strictEqual(by['MK-84'].category, 'General purpose bomb');
  assert.strictEqual(by['X-1'].name, 'Kendi kaydım');
  assert.ok(r.added > 100);
  assert.deepStrictEqual(M.upgradeCatalog(p), { added: 0, translated: 0 });
});

test('Eurofighter and CALIDUS B-250 drawings lay out stations left to right', function () {
  const p = M.sampleProject();
  ['eurofighter', 'calidus'].forEach(function (shape) {
    assert.ok(SH.SHAPES[shape], shape);
    const ac = p.aircraft.find(function (a) { return a.silhouette === shape; });
    SH.arrangeStations(ac);
    const mains = ac.stations.filter(SH.isMain);
    for (let i = 1; i < mains.length; i++) assert.ok(mains[i].x > mains[i - 1].x, shape);
    assert.strictEqual(mains[0].x + mains[mains.length - 1].x, 2 * SH.VIEW.cx, shape + ' symmetric');
  });
});
