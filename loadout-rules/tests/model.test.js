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
  const st = p.aircraft[0].stations[2]; // STA3: pilon → (BMB-500 | TER → 3×BMB-250)
  const pylon = st.loads[0];
  // Mühimmatın altına rack takılamaz.
  pylon.children[0].children.push(M.newLoadNode('rack', p.catalog.racks[0].id));
  // TER 3 pozisyonlu; 4 bomba takılamaz.
  pylon.children[1].children[0].qty = 4;
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
  assert.ok(xml.includes('<Allow type="SUBRACK" ref="TER" maxQty="1">'));
  assert.ok(xml.includes('<Allow type="MUNITION" ref="BMB-250" maxQty="3"/>'));
  assert.ok(xml.includes('<Constraint type="MAX_TOTAL" munition="FT-1" value="2">'));
  assert.ok(!/weight|maxLoad/i.test(xml));
  assert.ok(xml.includes('<StationRef code="STA3"/>'));
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
  const xs = ac.stations.map(function (s) { return s.x; });
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1], 'x sırası artmalı: ' + xs.join(','));
  const center = ac.stations.find(function (s) { return s.location === 'CENTER'; });
  assert.strictEqual(center.x, SH.VIEW.cx);
  // Simetrik istasyonlar aynada.
  assert.strictEqual(ac.stations[0].x + ac.stations[8].x, 2 * SH.VIEW.cx);
  assert.strictEqual(ac.stations[0].y, ac.stations[8].y);
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
