'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/model.js');
const X = require('../js/xml-export.js');

test('örnek proje hatasız doğrulanır', function () {
  const errors = M.validate(M.sampleProject()).filter(function (i) { return i.level === 'error'; });
  assert.deepStrictEqual(errors, []);
});

test('geçersiz yerleşim ve pozisyon aşımı yakalanır', function () {
  const p = M.sampleProject();
  const st = p.aircraft[0].stations[1];
  const pylon = st.loads[0];
  // Mühimmatın altına rack takılamaz.
  pylon.children[0].children.push(M.newLoadNode('rack', p.catalog.racks[0].id));
  // TER 3 pozisyonlu; 4 bomba takılamaz.
  pylon.children[2].children[0].qty = 4;
  const messages = M.validate(p).map(function (i) { return i.message; });
  assert.ok(messages.some(function (m) { return /altına takılamaz/.test(m); }));
  assert.ok(messages.some(function (m) { return /pozisyon sayısını \(3\) aşıyor/.test(m); }));
});

test('en kötü durum ağırlığı: kendi ağırlığı + en ağır alternatif', function () {
  const p = M.sampleProject();
  const pylonNode = p.aircraft[0].stations[1].loads[0];
  // pilon 120 + max(500, 1000, 90 + 3*250) = 1120
  assert.strictEqual(M.worstCaseWeight(p, pylonNode), 1120);
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
  assert.ok(xml.includes('<Constraint type="MAX_TOTAL" munition="FT-1100" value="2">'));
  assert.ok(xml.includes('<StationRef code="STA3"/>'));
});

test('normalizeProject eksik alanları tamamlar', function () {
  const p = M.normalizeProject({ name: 'x', aircraft: [{ code: 'A', stations: [{ code: 'S', loads: [{ kind: 'munition', refId: 'm' }] }] }] });
  assert.deepStrictEqual(p.catalog.racks, []);
  assert.strictEqual(p.aircraft[0].stations[0].loads[0].qty, 1);
  assert.deepStrictEqual(p.aircraft[0].constraints, []);
});
