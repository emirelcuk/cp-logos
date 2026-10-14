/*
 * Veri modeli, örnek veri ve doğrulama.
 * Tarayıcıda window.LoadoutModel, Node'da module.exports olarak kullanılır.
 *
 * Proje yapısı:
 *   catalog.munitions / racks / subracks : tanımlı mağazalar (store)
 *   aircraft[].stations[].loads          : istasyona izin verilen yükleme ağacı
 *   aircraft[].constraints               : istasyonlar arası kurallar
 *
 * Yükleme ağacı (LoadNode):
 *   { id, kind: 'rack'|'subrack'|'munition', refId, qty, children: [LoadNode] }
 *   Bir düğümün çocukları birbirinin ALTERNATİFİDİR (hangisi takılabilir).
 *   qty: o öğeden ebeveyne en fazla kaç adet takılabileceği.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoadoutModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  const KINDS = ['munition', 'rack', 'subrack'];
  const KIND_LABELS = { munition: 'Mühimmat', rack: 'Rack', subrack: 'Subrack' };
  const CATALOG_KEY = { munition: 'munitions', rack: 'racks', subrack: 'subracks' };

  // Hangi düğümün altına ne takılabilir.
  const ALLOWED_CHILDREN = {
    station: ['rack', 'subrack', 'munition'],
    rack: ['subrack', 'munition'],
    subrack: ['munition'],
    munition: [],
  };

  const LOCATIONS = { LEFT: 'Sol', CENTER: 'Merkez', RIGHT: 'Sağ' };

  const CONSTRAINT_TYPES = {
    SYMMETRIC: { label: 'Simetrik', help: 'Listelenen istasyonlar aynı yükü taşımalı.' },
    EXCLUSIVE: { label: 'Birbirini dışlar', help: 'Listelenen istasyonlardan en fazla biri yüklenebilir.' },
    REQUIRES: { label: 'Gerektirir', help: 'İlk istasyon yüklenirse diğerleri de yüklenmeli.' },
    MAX_TOTAL: { label: 'Toplam üst sınır', help: 'Seçilen mühimmattan listelenen istasyonlarda toplam en fazla N adet.' },
  };

  let idCounter = 0;
  function newId(prefix) {
    idCounter += 1;
    return (prefix || 'id') + '_' + Date.now().toString(36) + idCounter.toString(36) +
      Math.random().toString(36).slice(2, 6);
  }

  function emptyProject() {
    return {
      schemaVersion: SCHEMA_VERSION,
      name: 'Yeni Proje',
      catalog: { munitions: [], racks: [], subracks: [] },
      aircraft: [],
    };
  }

  function newStore(kind) {
    const base = { id: newId(kind), code: '', name: '', weightKg: 0, notes: '' };
    if (kind === 'munition') return Object.assign(base, { category: '' });
    return Object.assign(base, { positions: 1, maxLoadKg: 0 });
  }

  function newAircraft() {
    return { id: newId('ac'), code: '', name: '', notes: '', stations: [], constraints: [] };
  }

  function newStation() {
    return { id: newId('st'), code: '', name: '', location: 'CENTER', maxLoadKg: 0, loads: [] };
  }

  function newLoadNode(kind, refId) {
    return { id: newId('ld'), kind: kind, refId: refId || '', qty: 1, children: [] };
  }

  function newConstraint() {
    return { id: newId('cn'), type: 'SYMMETRIC', stationIds: [], munitionId: '', value: 0, description: '' };
  }

  function findStore(project, kind, id) {
    const list = project.catalog[CATALOG_KEY[kind]] || [];
    return list.find(function (s) { return s.id === id; }) || null;
  }

  function storeLabel(store) {
    if (!store) return '(tanımsız)';
    return store.code ? store.code + (store.name ? ' — ' + store.name : '') : (store.name || '(adsız)');
  }

  /* Bir düğümün en kötü durum (maksimum) ağırlığı: kendi ağırlığı + en ağır alternatif çocuk. */
  function worstCaseWeight(project, node) {
    const store = findStore(project, node.kind, node.refId);
    const own = store ? Number(store.weightKg) || 0 : 0;
    let heaviestChild = 0;
    (node.children || []).forEach(function (c) {
      heaviestChild = Math.max(heaviestChild, worstCaseWeight(project, c));
    });
    return (Number(node.qty) || 1) * (own + heaviestChild);
  }

  /* Sahiplik/şema farklarına karşı eski veya eksik projeleri tamamlar. */
  function normalizeProject(p) {
    const out = Object.assign(emptyProject(), p || {});
    out.catalog = Object.assign({ munitions: [], racks: [], subracks: [] }, out.catalog || {});
    out.aircraft = (out.aircraft || []).map(function (a) {
      const ac = Object.assign(newAircraft(), a);
      ac.stations = (ac.stations || []).map(function (s) {
        const st = Object.assign(newStation(), s);
        st.loads = (st.loads || []).map(normalizeNode);
        return st;
      });
      ac.constraints = (ac.constraints || []).map(function (c) {
        return Object.assign(newConstraint(), c);
      });
      return ac;
    });
    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  function normalizeNode(n) {
    const node = Object.assign(newLoadNode(n.kind, n.refId), n);
    node.children = (node.children || []).map(normalizeNode);
    return node;
  }

  /* ---------------------------------------------------------------- doğrulama */

  function validate(project) {
    const issues = [];
    const add = function (level, where, message) { issues.push({ level: level, where: where, message: message }); };

    KINDS.forEach(function (kind) {
      const list = project.catalog[CATALOG_KEY[kind]] || [];
      const seen = {};
      list.forEach(function (s) {
        const where = KIND_LABELS[kind] + ' ' + storeLabel(s);
        if (!s.code) add('error', where, 'Kod boş olamaz.');
        else if (seen[s.code]) add('error', where, 'Kod tekrar ediyor: ' + s.code);
        seen[s.code] = true;
        if (!(Number(s.weightKg) >= 0)) add('error', where, 'Ağırlık negatif olamaz.');
        if (kind !== 'munition' && !(Number(s.positions) >= 1)) add('error', where, 'Pozisyon sayısı en az 1 olmalı.');
      });
    });

    const acSeen = {};
    project.aircraft.forEach(function (ac) {
      const acWhere = 'Uçak ' + (ac.code || '(kodsuz)');
      if (!ac.code) add('error', acWhere, 'Uçak kodu boş olamaz.');
      else if (acSeen[ac.code]) add('error', acWhere, 'Uçak kodu tekrar ediyor.');
      acSeen[ac.code] = true;
      if (!ac.stations.length) add('warning', acWhere, 'Hiç istasyon tanımlı değil.');

      const stSeen = {};
      ac.stations.forEach(function (st) {
        const stWhere = acWhere + ' / İstasyon ' + (st.code || '(kodsuz)');
        if (!st.code) add('error', stWhere, 'İstasyon kodu boş olamaz.');
        else if (stSeen[st.code]) add('error', stWhere, 'İstasyon kodu tekrar ediyor.');
        stSeen[st.code] = true;
        if (!st.loads.length) add('warning', stWhere, 'İstasyona hiçbir yük izni tanımlı değil.');

        st.loads.forEach(function (n) { validateNode(project, n, 'station', null, stWhere, add); });

        const maxLoad = Number(st.maxLoadKg) || 0;
        if (maxLoad > 0) {
          st.loads.forEach(function (n) {
            const w = worstCaseWeight(project, n);
            if (w > maxLoad) {
              add('warning', stWhere, storeLabel(findStore(project, n.kind, n.refId)) +
                ' konfigürasyonu en kötü durumda ' + w + ' kg; istasyon limiti ' + maxLoad + ' kg.');
            }
          });
        }
      });

      const stationIds = {};
      ac.stations.forEach(function (s) { stationIds[s.id] = true; });
      ac.constraints.forEach(function (c, i) {
        const cWhere = acWhere + ' / Kural #' + (i + 1);
        if (!CONSTRAINT_TYPES[c.type]) add('error', cWhere, 'Bilinmeyen kural tipi: ' + c.type);
        const valid = c.stationIds.filter(function (id) { return stationIds[id]; });
        if (valid.length !== c.stationIds.length) add('error', cWhere, 'Silinmiş istasyona referans var.');
        if (valid.length < 2) add('error', cWhere, 'En az 2 istasyon seçilmeli.');
        if (c.type === 'MAX_TOTAL') {
          if (!findStore(project, 'munition', c.munitionId)) add('error', cWhere, 'Mühimmat seçilmeli.');
          if (!(Number(c.value) >= 0)) add('error', cWhere, 'Üst sınır negatif olamaz.');
        }
      });
    });

    return issues;
  }

  function validateNode(project, node, parentKind, parentStore, where, add) {
    const store = findStore(project, node.kind, node.refId);
    const label = KIND_LABELS[node.kind] + ' ' + storeLabel(store);
    const here = where + ' / ' + label;
    if (ALLOWED_CHILDREN[parentKind].indexOf(node.kind) < 0) {
      add('error', here, KIND_LABELS[node.kind] + ', ' + (KIND_LABELS[parentKind] || 'istasyon') + ' altına takılamaz.');
    }
    if (!store) add('error', here, 'Katalogda bulunmayan öğeye referans.');
    if (!(Number(node.qty) >= 1)) add('error', here, 'Adet en az 1 olmalı.');
    if (parentStore && Number(node.qty) > Number(parentStore.positions)) {
      add('error', here, 'Adet (' + node.qty + '), ' + storeLabel(parentStore) +
        ' pozisyon sayısını (' + parentStore.positions + ') aşıyor.');
    }
    if (store && node.kind !== 'munition') {
      const maxLoad = Number(store.maxLoadKg) || 0;
      if (maxLoad > 0) {
        (node.children || []).forEach(function (c) {
          const w = worstCaseWeight(project, c);
          if (w > maxLoad) add('warning', here, 'Taşıma limiti ' + maxLoad + ' kg; ' + storeLabel(findStore(project, c.kind, c.refId)) + ' yükü ' + w + ' kg.');
        });
      }
      if (!(node.children || []).length) add('warning', here, 'Altına hiçbir yük izni tanımlı değil.');
    }
    (node.children || []).forEach(function (c) { validateNode(project, c, node.kind, store, where, add); });
  }

  /* ---------------------------------------------------------------- örnek veri */

  function sampleProject() {
    const p = emptyProject();
    p.name = 'Örnek Proje';
    const m = function (code, name, category, w) { const s = newStore('munition'); return Object.assign(s, { code: code, name: name, category: category, weightKg: w }); };
    const r = function (kind, code, name, pos, w, max) { const s = newStore(kind); return Object.assign(s, { code: code, name: name, positions: pos, weightKg: w, maxLoadKg: max }); };

    const bomb = m('BMB-250', 'Genel maksat bombası 250', 'Bomba', 250);
    const bomb500 = m('BMB-500', 'Genel maksat bombası 500', 'Bomba', 500);
    const aam = m('AAM-S', 'Kısa menzil hava-hava füzesi', 'Füze', 90);
    const tank = m('FT-1100', 'Harici yakıt tankı', 'Yakıt tankı', 1000);
    p.catalog.munitions.push(bomb, bomb500, aam, tank);

    const pylon = r('rack', 'PYL-W', 'Kanat pilonu', 1, 120, 2500);
    const launcher = r('rack', 'LCH-1', 'Füze lançeri', 1, 30, 150);
    p.catalog.racks.push(pylon, launcher);

    const ter = r('subrack', 'TER', 'Üçlü ejektör rack', 3, 90, 900);
    p.catalog.subracks.push(ter);

    const ac = newAircraft();
    Object.assign(ac, { code: 'UCAK-A', name: 'Örnek Uçak A' });
    const st = function (code, name, loc, max) { return Object.assign(newStation(), { code: code, name: name, location: loc, maxLoadKg: max }); };
    const s1 = st('STA1', 'Sol kanat ucu', 'LEFT', 200);
    const s3 = st('STA3', 'Sol iç kanat', 'LEFT', 2500);
    const s5 = st('STA5', 'Gövde altı', 'CENTER', 1500);
    const s7 = st('STA7', 'Sağ iç kanat', 'RIGHT', 2500);
    const s9 = st('STA9', 'Sağ kanat ucu', 'RIGHT', 200);

    const node = function (kind, store, qty, children) {
      const n = newLoadNode(kind, store.id); n.qty = qty || 1; n.children = children || []; return n;
    };
    [s1, s9].forEach(function (s) { s.loads.push(node('rack', launcher, 1, [node('munition', aam, 1)])); });
    [s3, s7].forEach(function (s) {
      s.loads.push(node('rack', pylon, 1, [
        node('munition', bomb500, 1),
        node('munition', tank, 1),
        node('subrack', ter, 1, [node('munition', bomb, 3)]),
      ]));
    });
    s5.loads.push(node('munition', tank, 1));
    ac.stations.push(s1, s3, s5, s7, s9);

    ac.constraints.push(
      Object.assign(newConstraint(), { type: 'SYMMETRIC', stationIds: [s3.id, s7.id], description: 'İç kanat yükleri simetrik olmalı.' }),
      Object.assign(newConstraint(), { type: 'SYMMETRIC', stationIds: [s1.id, s9.id], description: 'Kanat ucu füzeleri simetrik.' }),
      Object.assign(newConstraint(), { type: 'MAX_TOTAL', stationIds: [s3.id, s5.id, s7.id], munitionId: tank.id, value: 2, description: 'En fazla 2 harici tank.' })
    );
    p.aircraft.push(ac);
    return p;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KINDS: KINDS,
    KIND_LABELS: KIND_LABELS,
    CATALOG_KEY: CATALOG_KEY,
    ALLOWED_CHILDREN: ALLOWED_CHILDREN,
    LOCATIONS: LOCATIONS,
    CONSTRAINT_TYPES: CONSTRAINT_TYPES,
    newId: newId,
    emptyProject: emptyProject,
    sampleProject: sampleProject,
    normalizeProject: normalizeProject,
    newStore: newStore,
    newAircraft: newAircraft,
    newStation: newStation,
    newLoadNode: newLoadNode,
    newConstraint: newConstraint,
    findStore: findStore,
    storeLabel: storeLabel,
    worstCaseWeight: worstCaseWeight,
    validate: validate,
  };
});
