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
    const base = { id: newId(kind), code: '', name: '', notes: '' };
    if (kind === 'munition') return Object.assign(base, { category: '' });
    return Object.assign(base, { positions: 1 });
  }

  function newAircraft() {
    return { id: newId('ac'), code: '', name: '', silhouette: 'single', notes: '', stations: [], constraints: [] };
  }

  function newStation() {
    // code ve location soldan sağa sıralamayla otomatik verilir (AircraftShapes.arrangeStations).
    // parentId/suffix: ek takma noktası ise bağlı olduğu ana istasyon ve son eki (ör. 5 + 'L' = 5L).
    // x, y: uçak çizimindeki konum (null ise otomatik yerleştirilir).
    return { id: newId('st'), code: '', name: '', parentId: null, suffix: '', location: 'CENTER', x: null, y: null, loads: [] };
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

  // Önceki sürümlerden kalan, artık kullanılmayan alanlar.
  const OBSOLETE_FIELDS = ['weightKg', 'maxLoadKg'];
  function stripObsolete(obj) {
    OBSOLETE_FIELDS.forEach(function (k) { delete obj[k]; });
    return obj;
  }

  /* Eski veya eksik projeleri güncel şemaya tamamlar. */
  function normalizeProject(p) {
    const out = Object.assign(emptyProject(), p || {});
    out.catalog = Object.assign({ munitions: [], racks: [], subracks: [] }, out.catalog || {});
    KINDS.forEach(function (kind) {
      out.catalog[CATALOG_KEY[kind]] = out.catalog[CATALOG_KEY[kind]].map(function (s) {
        return stripObsolete(Object.assign(newStore(kind), s));
      });
    });
    out.aircraft = (out.aircraft || []).map(function (a) {
      const ac = Object.assign(newAircraft(), a);
      ac.stations = (ac.stations || []).map(function (s) {
        const st = stripObsolete(Object.assign(newStation(), s));
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
      const stById = {};
      ac.stations.forEach(function (s) { stById[s.id] = s; });

      const stSeen = {};
      ac.stations.forEach(function (st) {
        const stWhere = acWhere + ' / İstasyon ' + (st.code || '(kodsuz)');
        if (!st.code) add('error', stWhere, 'İstasyon kodu boş olamaz.');
        else if (stSeen[st.code]) add('error', stWhere, 'İstasyon kodu tekrar ediyor.');
        stSeen[st.code] = true;
        if (st.parentId) {
          if (!stById[st.parentId]) add('error', stWhere, 'Bağlı olduğu ana istasyon bulunamadı.');
          if (!st.suffix) add('error', stWhere, 'Ek takma noktasının son eki boş olamaz.');
        }
        if (!st.loads.length) add('warning', stWhere, 'İstasyona hiçbir yük izni tanımlı değil.');

        st.loads.forEach(function (n) { validateNode(project, n, 'station', null, stWhere, add); });
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
      if (!(node.children || []).length) add('warning', here, 'Altına hiçbir yük izni tanımlı değil.');
    }
    (node.children || []).forEach(function (c) { validateNode(project, c, node.kind, store, where, add); });
  }

  /* ---------------------------------------------------------------- örnek veri */

  /*
   * Kamuya açık yaygın tanımlamalarla standart katalog. Pozisyon: rack/subrack üzerine
   * aynı anda takılabilecek en fazla öğe sayısı. Kendi envanterinize göre düzenleyin.
   */
  const STANDARD_CATALOG = {
    munition: [
      ['AIM-9', 'Sidewinder kısa menzil hava-hava füzesi', 'Hava-hava füzesi'],
      ['AIM-120', 'AMRAAM orta menzil hava-hava füzesi', 'Hava-hava füzesi'],
      ['AIM-7', 'Sparrow orta menzil hava-hava füzesi', 'Hava-hava füzesi'],
      ['AGM-65', 'Maverick hava-yer füzesi', 'Hava-yer füzesi'],
      ['AGM-88', 'HARM radar karşıtı füze', 'Hava-yer füzesi'],
      ['MK-82', '500 lb genel maksat bombası', 'Genel maksat bombası'],
      ['MK-83', '1000 lb genel maksat bombası', 'Genel maksat bombası'],
      ['MK-84', '2000 lb genel maksat bombası', 'Genel maksat bombası'],
      ['GBU-10', 'Lazer güdümlü bomba (MK-84 tabanlı)', 'Güdümlü bomba'],
      ['GBU-12', 'Lazer güdümlü bomba (MK-82 tabanlı)', 'Güdümlü bomba'],
      ['GBU-31', 'JDAM (MK-84 tabanlı)', 'Güdümlü bomba'],
      ['GBU-38', 'JDAM (MK-82 tabanlı)', 'Güdümlü bomba'],
      ['GBU-39', 'SDB küçük çaplı bomba', 'Güdümlü bomba'],
      ['CBU-105', 'Rüzgâr düzeltmeli misket bombası', 'Misket bombası'],
      ['HGK-84', 'Hassas güdüm kiti (MK-84)', 'Güdümlü bomba'],
      ['KGK-82', 'Kanatlı güdüm kiti (MK-82)', 'Güdümlü bomba'],
      ['TEBER-82', 'Lazer/GPS güdüm kiti (MK-82)', 'Güdümlü bomba'],
      ['FT-370', '370 galon harici yakıt tankı', 'Yakıt tankı'],
      ['FT-300', '300 galon harici yakıt tankı', 'Yakıt tankı'],
      ['AN/AAQ-33', 'Sniper hedefleme podu', 'Pod'],
      ['AN/AAQ-28', 'LITENING hedefleme podu', 'Pod'],
      ['AN/AAQ-13', 'LANTIRN navigasyon podu', 'Pod'],
      ['AN/ALQ-131', 'Elektronik harp podu', 'Pod'],
    ],
    rack: [
      ['MAU-12', 'Bomba askı rafı (pilon içi)', 1],
      ['LAU-129', 'Füze lançeri (AIM-9 / AIM-120)', 1],
      ['LAU-117', 'Tekli AGM-65 lançeri', 1],
      ['LAU-118', 'AGM-88 lançeri', 1],
      ['LAU-88', 'Üçlü AGM-65 lançeri', 3],
    ],
    subrack: [
      ['TER-9', 'Üçlü ejektör rack', 3],
      ['MER-10', 'Çoklu ejektör rack', 6],
      ['BRU-57', 'Akıllı çift ejektör rack', 2],
      ['BRU-61', 'GBU-39 dörtlü taşıyıcı', 4],
    ],
  };

  function standardCatalog() {
    const out = { munitions: [], racks: [], subracks: [] };
    STANDARD_CATALOG.munition.forEach(function (r) {
      out.munitions.push(Object.assign(newStore('munition'), { code: r[0], name: r[1], category: r[2] }));
    });
    ['rack', 'subrack'].forEach(function (kind) {
      STANDARD_CATALOG[kind].forEach(function (r) {
        out[CATALOG_KEY[kind]].push(Object.assign(newStore(kind), { code: r[0], name: r[1], positions: r[2] }));
      });
    });
    return out;
  }

  /* Standart katalogdan projede kodu bulunmayan öğeleri ekler; eklenen öğe sayısını döner. */
  function mergeStandardCatalog(project) {
    const std = standardCatalog();
    let added = 0;
    KINDS.forEach(function (kind) {
      const key = CATALOG_KEY[kind];
      const have = {};
      project.catalog[key].forEach(function (s) { have[s.code] = true; });
      std[key].forEach(function (s) { if (!have[s.code]) { project.catalog[key].push(s); added++; } });
    });
    return added;
  }

  /* Gösterim amaçlı örnek: uyumluluklar gerçek teknik verilerle doğrulanmalıdır. */
  function sampleProject() {
    const p = emptyProject();
    p.name = 'Örnek Proje';
    p.catalog = standardCatalog();
    const S = function (code) {
      const all = p.catalog.munitions.concat(p.catalog.racks, p.catalog.subracks);
      return all.find(function (x) { return x.code === code; });
    };
    const kindOf = function (code) {
      if (p.catalog.racks.indexOf(S(code)) >= 0) return 'rack';
      if (p.catalog.subracks.indexOf(S(code)) >= 0) return 'subrack';
      return 'munition';
    };
    // n('MAU-12', [n('MK-82'), n('TER-9', [n('MK-82', [], 3)])])
    const n = function (code, children, qty) {
      const node = newLoadNode(kindOf(code), S(code).id);
      node.qty = qty || 1; node.children = children || []; return node;
    };
    const st = function (code, name, loc) { return Object.assign(newStation(), { code: code, name: name, location: loc }); };
    const side = function (parent, suffix, name) {
      return Object.assign(newStation(), { code: parent.code + suffix, name: name, parentId: parent.id, suffix: suffix, location: 'CENTER' });
    };
    const rule = function (type, stations, extra) {
      return Object.assign(newConstraint(), { type: type, stationIds: stations.map(function (s) { return s.id; }) }, extra || {});
    };
    const aamRail = function () { return n('LAU-129', [n('AIM-9'), n('AIM-120')]); };

    // Uçak A: tek motorlu avcı, 9 istasyon + 5L / 5R.
    const a = Object.assign(newAircraft(), { code: 'UCAK-A', name: 'Örnek Uçak A (tek motorlu)', silhouette: 'single' });
    const a1 = st('1', 'Sol kanat ucu', 'LEFT');
    const a2 = st('2', 'Sol dış kanat', 'LEFT');
    const a3 = st('3', 'Sol orta kanat', 'LEFT');
    const a4 = st('4', 'Sol iç kanat', 'LEFT');
    const a5 = st('5', 'Gövde altı', 'CENTER');
    const a6 = st('6', 'Sağ iç kanat', 'RIGHT');
    const a7 = st('7', 'Sağ orta kanat', 'RIGHT');
    const a8 = st('8', 'Sağ dış kanat', 'RIGHT');
    const a9 = st('9', 'Sağ kanat ucu', 'RIGHT');
    const a5l = side(a5, 'L', 'Sol hava alığı yanı');
    const a5r = side(a5, 'R', 'Sağ hava alığı yanı');
    [a1, a2, a8, a9].forEach(function (s) { s.loads.push(aamRail()); });
    [a3, a7].forEach(function (s) {
      s.loads.push(
        n('MAU-12', [n('MK-82'), n('MK-84'), n('GBU-12'), n('GBU-31'), n('GBU-38'),
          n('TER-9', [n('MK-82', [], 3), n('GBU-12', [], 2)]),
          n('BRU-61', [n('GBU-39', [], 4)])]),
        n('LAU-117', [n('AGM-65')]),
        n('LAU-118', [n('AGM-88')]),
        aamRail()
      );
    });
    [a4, a6].forEach(function (s) {
      s.loads.push(n('MAU-12', [n('MK-82'), n('MK-84'), n('GBU-12'), n('GBU-31'), n('FT-370')]));
    });
    a5.loads.push(n('FT-300'), n('AN/ALQ-131'));
    a5l.loads.push(n('AN/AAQ-13'));
    a5r.loads.push(n('AN/AAQ-33'), n('AN/AAQ-28'));
    a.stations.push(a1, a2, a3, a4, a5, a5l, a5r, a6, a7, a8, a9);
    a.constraints.push(
      rule('SYMMETRIC', [a1, a9], { description: 'Kanat ucu füzeleri simetrik.' }),
      rule('SYMMETRIC', [a3, a7], { description: 'Orta kanat yükleri simetrik olmalı.' }),
      rule('SYMMETRIC', [a4, a6], { description: 'İç kanat yükleri simetrik olmalı.' }),
      rule('EXCLUSIVE', [a5l, a5r], { description: 'Aynı anda tek pod.' }),
      rule('MAX_TOTAL', [a3, a4, a6, a7], { munitionId: S('MK-84').id, value: 2, description: 'En fazla 2 adet MK-84.' })
    );

    // Uçak B: delta kanat, 5 istasyon.
    const b = Object.assign(newAircraft(), { code: 'UCAK-B', name: 'Örnek Uçak B (delta kanat)', silhouette: 'delta' });
    const b1 = st('1', 'Sol dış kanat', 'LEFT');
    const b2 = st('2', 'Sol iç kanat', 'LEFT');
    const b3 = st('3', 'Gövde altı', 'CENTER');
    const b4 = st('4', 'Sağ iç kanat', 'RIGHT');
    const b5 = st('5', 'Sağ dış kanat', 'RIGHT');
    [b1, b5].forEach(function (s) { s.loads.push(aamRail()); });
    [b2, b4].forEach(function (s) { s.loads.push(n('MAU-12', [n('MK-82'), n('GBU-12'), n('FT-370')])); });
    b3.loads.push(n('FT-300'), n('MAU-12', [n('MK-84'), n('GBU-31')]));
    b.stations.push(b1, b2, b3, b4, b5);
    b.constraints.push(
      rule('SYMMETRIC', [b2, b4], { description: 'İç kanat yükleri simetrik.' })
    );

    p.aircraft.push(a, b);
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
    standardCatalog: standardCatalog,
    mergeStandardCatalog: mergeStandardCatalog,
    normalizeProject: normalizeProject,
    newStore: newStore,
    newAircraft: newAircraft,
    newStation: newStation,
    newLoadNode: newLoadNode,
    newConstraint: newConstraint,
    findStore: findStore,
    storeLabel: storeLabel,
    validate: validate,
  };
});
