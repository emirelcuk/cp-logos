'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/model.js');
const X = require('../js/xml-export.js');
const SH = require('../js/aircraft-shapes.js');

test('örnek proje hatasız doğrulanır', function () {
  const errors = M.validate(M.sampleProject()).filter(function (i) { return i.level === 'error'; });
  assert.deepStrictEqual(errors, []);
});

test('geçersiz yerleşim ve pozisyon aşımı yakalanır', function () {
  const p = M.sampleProject();
  const st = p.aircraft[0].stations[2]; // 3: MAU-12 → (MK-82 | … | TER-9 → 3×MK-82 | …)
  const mau = st.loads[0];
  const ter = mau.children.find(function (c) { return M.findStore(p, c.kind, c.refId).code === 'TER-9'; });
  // Mühimmatın altına rack takılamaz.
  mau.children[0].children.push(M.newLoadNode('rack', p.catalog.racks[0].id));
  // TER-9 3 pozisyonlu; 4 bomba takılamaz.
  ter.children[0].qty = 4;
  const messages = M.validate(p).map(function (i) { return i.message; });
  assert.ok(messages.some(function (m) { return /altına takılamaz/.test(m); }));
  assert.ok(messages.some(function (m) { return /pozisyon sayısını \(3\) aşıyor/.test(m); }));
});

test('tekrarlanan kodlar ve dangling referanslar hata verir', function () {
  const p = M.sampleProject();
  p.catalog.munitions[1].code = p.catalog.munitions[0].code;
  p.aircraft[0].constraints[0].stationIds.push('yok');
  const messages = M.validate(p).map(function (i) { return i.message; });
  assert.ok(messages.some(function (m) { return /Kod tekrar ediyor/.test(m); }));
  assert.ok(messages.some(function (m) { return /Silinmiş istasyona/.test(m); }));
});

test('genel XML çıktısı referansları kodla yazar ve özel karakterleri kaçırır', function () {
  const p = M.sampleProject();
  p.name = 'A & B <test>';
  const xml = X.EXPORTERS.generic.exportProject(p, M);
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('project="A &amp; B &lt;test&gt;"'));
  assert.ok(xml.includes('<Allow type="SUBRACK" ref="TER-9" maxQty="1">'));
  assert.ok(xml.includes('<Allow type="MUNITION" ref="MK-82" maxQty="3"/>'));
  assert.ok(xml.includes('<Constraint type="MAX_TOTAL" munition="MK-84" value="2">'));
  assert.ok(xml.includes('<Station code="5L" parent="5"'));
  assert.ok(!/weight|maxLoad/i.test(xml));
  assert.ok(xml.includes('<StationRef code="3"/>'));
});

test('normalizeProject eksik alanları tamamlar', function () {
  const p = M.normalizeProject({ name: 'x', aircraft: [{ code: 'A', stations: [{ code: 'S', loads: [{ kind: 'munition', refId: 'm' }] }] }] });
  assert.deepStrictEqual(p.catalog.racks, []);
  assert.strictEqual(p.aircraft[0].stations[0].loads[0].qty, 1);
  assert.deepStrictEqual(p.aircraft[0].constraints, []);
});

test('eski projelerdeki ağırlık alanları temizlenir', function () {
  const p = M.normalizeProject({
    catalog: { munitions: [{ id: 'm', code: 'M', weightKg: 100 }], racks: [{ id: 'r', code: 'R', weightKg: 5, maxLoadKg: 50 }] },
    aircraft: [{ code: 'A', stations: [{ code: 'S', maxLoadKg: 900 }] }],
  });
  assert.strictEqual('weightKg' in p.catalog.munitions[0], false);
  assert.strictEqual('maxLoadKg' in p.catalog.racks[0], false);
  assert.strictEqual('maxLoadKg' in p.aircraft[0].stations[0], false);
  assert.strictEqual(p.aircraft[0].silhouette, 'single');
});

test('otomatik yerleşim: sol uçtan sağ uca, merkez hatta gövde', function () {
  const p = M.sampleProject();
  const ac = p.aircraft[0];
  SH.applyAutoLayout(ac);
  const mains = ac.stations.filter(SH.isMain);
  const xs = mains.map(function (s) { return s.x; });
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'x sırası artmalı: ' + xs.join(','));
  const center = mains.find(function (s) { return s.location === 'CENTER'; });
  assert.strictEqual(center.x, SH.VIEW.cx);
  // Simetrik istasyonlar aynada.
  assert.strictEqual(mains[0].x + mains[8].x, 2 * SH.VIEW.cx);
  assert.strictEqual(mains[0].y, mains[8].y);
});

test('ensurePositions sadece konumu olmayan istasyonlara dokunur', function () {
  const ac = M.sampleProject().aircraft[1];
  SH.ensurePositions(ac);
  ac.stations[0].x = 11; ac.stations[0].y = 22;
  ac.stations[2].x = null;
  assert.strictEqual(SH.ensurePositions(ac), true);
  assert.deepStrictEqual([ac.stations[0].x, ac.stations[0].y], [11, 22]);
  assert.strictEqual(ac.stations[2].x, SH.VIEW.cx);
  assert.strictEqual(SH.ensurePositions(ac), false);
});

test('her çizim tipinin dış hattı üretilebilir', function () {
  Object.keys(SH.SHAPES).forEach(function (k) {
    const d = SH.outlinePath(k);
    if (SH.SHAPES[k].half.length) assert.ok(/^M[\d.,\s L]+Z$/.test(d), k);
  });
});

function codes(ac) { return ac.stations.map(function (s) { return s.code; }).join(' '); }

test('istasyonlar soldan sağa 1den numaralanır, ek noktalar ana istasyonun ardından gelir', function () {
  const ac = M.sampleProject().aircraft[0];
  SH.arrangeStations(ac);
  assert.strictEqual(codes(ac), '1 2 3 4 5 5L 5R 6 7 8 9 GUN');
  // 5L çizimde solda, 5R sağda.
  const byCode = {};
  ac.stations.forEach(function (s) { byCode[s.code] = s; });
  assert.ok(byCode['5L'].x < byCode['5'].x && byCode['5R'].x > byCode['5'].x);
});

test('istasyon sürüklenip yer değiştirince numaralar yenilenir', function () {
  const ac = M.sampleProject().aircraft[1];
  SH.arrangeStations(ac);
  const first = ac.stations[0];
  first.x = 390; // en sağa taşı
  assert.strictEqual(SH.arrangeStations(ac), true);
  assert.strictEqual(first.code, '5');
  assert.strictEqual(first.location, 'RIGHT');
  assert.strictEqual(codes(ac), '1 2 3 4 5');
});

test('sol kanada yeni istasyon eklenince 1 numara olur, diğerleri kayar', function () {
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

test('ana istasyonu silinen ek nokta bağımsız istasyona dönüşür', function () {
  const ac = M.sampleProject().aircraft[0];
  SH.arrangeStations(ac);
  const five = ac.stations.find(function (s) { return s.code === '5'; });
  ac.stations.splice(ac.stations.indexOf(five), 1);
  SH.arrangeStations(ac);
  assert.ok(ac.stations.every(function (s) { return !s.parentId; }));
  assert.strictEqual(ac.stations.length, 11);
});

test('standart katalog gerçek isimleri içerir ve tekrar eklemez', function () {
  const p = M.emptyProject();
  const added = M.mergeStandardCatalog(p);
  const all = p.catalog.munitions.concat(p.catalog.racks, p.catalog.subracks).map(function (s) { return s.code; });
  ['MK-82', 'GBU-12', 'AIM-9', 'AIM-120', 'MAU-12', 'TER-9', 'LAU-129'].forEach(function (c) { assert.ok(all.indexOf(c) >= 0, c); });
  assert.ok(added > 20);
  assert.strictEqual(M.mergeStandardCatalog(p), 0);
  assert.deepStrictEqual(M.validate(p).filter(function (i) { return i.level === 'error'; }), []);
});

test('top istasyonu numaralandırmaya girmez; birden fazla top GUN1, GUN2 olur', function () {
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

test('top: mermi kapasitesi aşımı hata, çap uyuşmazlığı uyarı verir', function () {
  const p = M.sampleProject();
  const gunStation = p.aircraft[0].stations.find(function (s) { return s.type === 'GUN'; });
  const gun = gunStation.loads[0];
  gun.children[0].qty = 9999;
  const ammo30 = p.catalog.ammo.find(function (a) { return a.code === 'PGU-13/B'; });
  gun.children.push(M.newLoadNode('ammo', ammo30.id));
  // Top istasyonuna doğrudan mühimmat takılamaz.
  gunStation.loads.push(M.newLoadNode('munition', p.catalog.munitions[0].id));
  const issues = M.validate(p);
  const msg = function (re) { return issues.some(function (i) { return re.test(i.message); }); };
  assert.ok(msg(/mermi kapasitesini \(511\) aşıyor/));
  assert.ok(issues.some(function (i) { return i.level === 'warning' && /Çap uyuşmuyor/.test(i.message); }));
  assert.ok(msg(/top istasyonu altına takılamaz/));
});

test('XML top ve mühimmatı içerir', function () {
  const p = M.sampleProject();
  p.aircraft.forEach(function (a) { SH.arrangeStations(a); });
  const xml = X.EXPORTERS.generic.exportProject(p, M);
  assert.ok(xml.includes('<Gun code="M61A1" name="Vulcan 20 mm altı namlulu top" caliber="20x102" capacity="511"/>'));
  assert.ok(xml.includes('<Ammo code="PGU-28/B"'));
  assert.ok(xml.includes('<Station code="GUN" type="GUN"'));
  assert.ok(xml.includes('<Allow type="AMMO" ref="PGU-28/B" maxQty="511"/>'));
});
