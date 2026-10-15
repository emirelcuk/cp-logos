/*
 * Veri modeli, örnek veri ve doğrulama.
 * Tarayıcıda window.LoadoutModel, Node'da module.exports olarak kullanılır.
 *
 * Proje yapısı:
 *   catalog.munitions / racks / subracks / guns / ammo : tanımlı mağazalar (store)
 *   aircraft[].stations[].loads          : istasyona izin verilen yükleme ağacı
 *   aircraft[].constraints               : istasyonlar arası kurallar
 *
 * Yükleme ağacı (LoadNode):
 *   { id, kind: 'rack'|'subrack'|'munition'|'gun'|'ammo', refId, qty, children: [LoadNode] }
 *   Bir düğümün çocukları birbirinin ALTERNATİFİDİR (hangisi takılabilir).
 *   qty: o öğeden ebeveyne en fazla kaç adet takılabileceği (top mühimmatında mermi adedi).
 *
 * İstasyon tipleri: STATION (numaralı istasyon / ek nokta) ve GUN (dahili top, numarasız).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoadoutModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  const KINDS = ['munition', 'rack', 'subrack', 'gun', 'ammo'];
  const KIND_LABELS = { munition: 'Mühimmat', rack: 'Rack', subrack: 'Subrack', gun: 'Top', ammo: 'Top mühimmatı', package: 'Paket' };
  const CATALOG_KEY = { munition: 'munitions', rack: 'racks', subrack: 'subracks', gun: 'guns', ammo: 'ammo' };
  // Pozisyon alanının anlamı: rack/subrack için takma yeri sayısı, top için mermi kapasitesi.
  const HAS_POSITIONS = { rack: true, subrack: true, gun: true };

  // Hangi düğümün altına ne takılabilir. Top podları rack altına takılabilir.
  const ALLOWED_CHILDREN = {
    station: ['rack', 'subrack', 'munition', 'gun', 'package'],
    gunStation: ['gun'],
    // Yükleme paketi içeriği: istasyonla aynı, ancak paket içinde paket yok.
    packageRoot: ['rack', 'subrack', 'munition', 'gun'],
    package: [],
    rack: ['subrack', 'munition', 'gun'],
    subrack: ['munition'],
    gun: ['ammo'],
    munition: [],
    ammo: [],
  };
  const PARENT_LABELS = { station: 'istasyon', gunStation: 'top istasyonu', packageRoot: 'paket' };

  const STATION_TYPES = { STATION: 'İstasyon', GUN: 'Top (GUN)' };

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
      catalogVersion: 0,
      catalog: emptyCatalog(),
      // Yükleme paketleri: birden fazla istasyonda kullanılan ortak yük ağaçları.
      packages: [],
      aircraft: [],
    };
  }

  function emptyCatalog() {
    const c = {};
    KINDS.forEach(function (k) { c[CATALOG_KEY[k]] = []; });
    return c;
  }

  function newStore(kind) {
    const base = { id: newId(kind), code: '', name: '', notes: '' };
    if (kind === 'munition') return Object.assign(base, { category: '' });
    if (kind === 'ammo') return Object.assign(base, { caliber: '', category: '' });
    if (kind === 'gun') return Object.assign(base, { caliber: '', positions: 500 });
    return Object.assign(base, { positions: 1 });
  }

  function newAircraft() {
    return { id: newId('ac'), code: '', name: '', silhouette: 'single', notes: '', stations: [], constraints: [] };
  }

  function newStation() {
    // code ve location soldan sağa sıralamayla otomatik verilir (AircraftShapes.arrangeStations).
    // parentId/suffix: ek takma noktası ise bağlı olduğu ana istasyon ve son eki (ör. 5 + 'L' = 5L).
    // x, y: uçak çizimindeki konum (null ise otomatik yerleştirilir).
    return { id: newId('st'), type: 'STATION', code: '', name: '', parentId: null, suffix: '', location: 'CENTER', x: null, y: null, loads: [] };
  }

  function newLoadNode(kind, refId) {
    return { id: newId('ld'), kind: kind, refId: refId || '', qty: 1, children: [] };
  }

  function newConstraint() {
    return { id: newId('cn'), type: 'SYMMETRIC', stationIds: [], munitionId: '', value: 0, description: '' };
  }

  function newPackage() {
    return { id: newId('pk'), code: '', name: '', notes: '', loads: [] };
  }

  function findStore(project, kind, id) {
    const list = kind === 'package' ? (project.packages || []) : (project.catalog[CATALOG_KEY[kind]] || []);
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
    out.catalog = Object.assign(emptyCatalog(), out.catalog || {});
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
    out.packages = (out.packages || []).map(function (pk) {
      const pkg = Object.assign(newPackage(), pk);
      pkg.loads = (pkg.loads || []).map(normalizeNode);
      return pkg;
    });
    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  /* ---------------------------------------------------------------- kopyalama, paketler */

  /* Yük ağacının yeni kimliklerle derin kopyası. */
  function cloneLoads(loads) {
    return (loads || []).map(function (n) {
      return { id: newId('ld'), kind: n.kind, refId: n.refId, qty: n.qty, children: cloneLoads(n.children) };
    });
  }

  /* Paket referanslarını paket içeriğiyle değiştirir (XML, matris vb. için düz kural ağacı). */
  function expandLoads(project, loads) {
    const out = [];
    (loads || []).forEach(function (n) {
      if (n.kind === 'package') {
        const pkg = findStore(project, 'package', n.refId);
        if (pkg) cloneLoads(pkg.loads).forEach(function (c) { out.push(c); });
        return;
      }
      out.push({ id: n.id, kind: n.kind, refId: n.refId, qty: n.qty, children: expandLoads(project, n.children) });
    });
    return out;
  }

  /* Paketin kullanıldığı istasyonlar: [{ aircraft, station }]. */
  function packageUsage(project, pkgId) {
    const out = [];
    project.aircraft.forEach(function (ac) {
      ac.stations.forEach(function (st) {
        if (st.loads.some(function (n) { return n.kind === 'package' && n.refId === pkgId; })) out.push({ aircraft: ac, station: st });
      });
    });
    return out;
  }

  /* Uçağı tüm istasyon, yük ve kurallarıyla yeni kimliklerle çoğaltır. */
  function duplicateAircraft(ac) {
    const idMap = {};
    const copy = Object.assign(newAircraft(), JSON.parse(JSON.stringify(ac)));
    copy.id = newId('ac');
    copy.code = (ac.code || 'UCAK') + '-KOPYA';
    copy.stations = ac.stations.map(function (st) {
      const s = Object.assign({}, JSON.parse(JSON.stringify(st)), { id: newId('st') });
      idMap[st.id] = s.id;
      s.loads = cloneLoads(st.loads);
      return s;
    });
    copy.stations.forEach(function (s) { if (s.parentId) s.parentId = idMap[s.parentId] || null; });
    copy.constraints = ac.constraints.map(function (c) {
      return Object.assign({}, c, {
        id: newId('cn'),
        stationIds: c.stationIds.map(function (id) { return idMap[id]; }).filter(Boolean),
      });
    });
    return copy;
  }

  /*
   * Uyumluluk matrisi: hangi öğe hangi istasyona, hangi yolla ve en fazla kaç adet takılabilir.
   * kinds: satırlarda gösterilecek türler. Dönüş: { stations, rows: [{ kind, store, cells: { stationId: { qty, paths } } }] }
   */
  function compatibility(project, ac, kinds) {
    const rows = {};
    ac.stations.forEach(function (st) {
      const walk = function (nodes, path, mult) {
        nodes.forEach(function (n) {
          const store = findStore(project, n.kind, n.refId);
          if (!store) return;
          const qty = mult * (Number(n.qty) || 1);
          const label = store.code + (n.qty > 1 ? ' ×' + n.qty : '');
          const here = path.concat([label]);
          if (kinds.indexOf(n.kind) >= 0) {
            const key = n.kind + ':' + store.id;
            const row = rows[key] || (rows[key] = { kind: n.kind, store: store, cells: {} });
            const cell = row.cells[st.id] || (row.cells[st.id] = { qty: 0, paths: [] });
            cell.qty = Math.max(cell.qty, qty);
            cell.paths.push(here.join(' › '));
          }
          walk(n.children || [], here, qty);
        });
      };
      walk(expandLoads(project, st.loads), [], 1);
    });
    const order = function (r) {
      const list = project.catalog[CATALOG_KEY[r.kind]] || [];
      return KINDS.indexOf(r.kind) * 100000 + list.indexOf(r.store);
    };
    return {
      stations: ac.stations,
      rows: Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return order(a) - order(b); }),
    };
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
        if (HAS_POSITIONS[kind] && !(Number(s.positions) >= 1)) {
          add('error', where, kind === 'gun' ? 'Mermi kapasitesi en az 1 olmalı.' : 'Pozisyon sayısı en az 1 olmalı.');
        }
      });
    });

    const pkSeen = {};
    (project.packages || []).forEach(function (pkg) {
      const where = 'Paket ' + storeLabel(pkg);
      if (!pkg.code) add('error', where, 'Kod boş olamaz.');
      else if (pkSeen[pkg.code]) add('error', where, 'Kod tekrar ediyor: ' + pkg.code);
      pkSeen[pkg.code] = true;
      if (!pkg.loads.length) add('warning', where, 'Paket boş.');
      pkg.loads.forEach(function (n) { validateNode(project, n, 'packageRoot', null, where, add); });
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

        const parentKind = st.type === 'GUN' ? 'gunStation' : 'station';
        st.loads.forEach(function (n) { validateNode(project, n, parentKind, null, stWhere, add); });
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
      add('error', here, KIND_LABELS[node.kind] + ', ' + (KIND_LABELS[parentKind] || PARENT_LABELS[parentKind]) + ' altına takılamaz.');
    }
    if (!store) add('error', here, 'Katalogda bulunmayan öğeye referans.');
    if (!(Number(node.qty) >= 1)) add('error', here, 'Adet en az 1 olmalı.');
    if (parentStore && Number(node.qty) > Number(parentStore.positions)) {
      add('error', here, 'Adet (' + node.qty + '), ' + storeLabel(parentStore) +
        (node.kind === 'ammo' ? ' mermi kapasitesini (' : ' pozisyon sayısını (') + parentStore.positions + ') aşıyor.');
    }
    if (store && node.kind === 'ammo' && parentStore && parentStore.caliber && store.caliber &&
        normCaliber(parentStore.caliber) !== normCaliber(store.caliber)) {
      add('warning', here, 'Çap uyuşmuyor: top ' + parentStore.caliber + ', mühimmat ' + store.caliber + '.');
    }
    if (store && ALLOWED_CHILDREN[node.kind].length) {
      if (!(node.children || []).length) add('warning', here, 'Altına hiçbir yük izni tanımlı değil.');
    }
    (node.children || []).forEach(function (c) { validateNode(project, c, node.kind, store, where, add); });
  }

  function normCaliber(c) { return String(c).toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x'); }

  /* ---------------------------------------------------------------- örnek veri */

  /*
   * Kamuya açık yaygın tanımlamalarla standart katalog. Kendi envanterinize göre düzenleyin.
   * Sürüm artırıldığında, eski projelere açılışta eksik öğeler otomatik eklenir (silinmez).
   */
  const STANDARD_CATALOG_VERSION = 2;

  const AAM = 'Hava-hava füzesi';
  const AGM = 'Hava-yer füzesi';
  const ASM = 'Gemi karşıtı füze';
  const CRUISE = 'Seyir füzesi';
  const GP = 'Genel maksat bombası';
  const PEN = 'Nüfuz edici bomba';
  const LGB = 'Lazer güdümlü bomba';
  const GPS = 'GPS/INS güdümlü bomba';
  const KIT = 'Güdüm kiti (yerli)';
  const CBU = 'Misket bombası';
  const ROCKET = 'Roket';
  const PRACTICE = 'Eğitim bombası';
  const TANK = 'Yakıt tankı';
  const POD_T = 'Hedefleme podu';
  const POD_EW = 'Elektronik harp podu';
  const POD_O = 'Diğer pod';

  const STANDARD_CATALOG = {
    // [kod, ad, kategori]
    munition: [
      ['AIM-9L', 'Sidewinder kısa menzil hava-hava füzesi', AAM],
      ['AIM-9M', 'Sidewinder kısa menzil hava-hava füzesi', AAM],
      ['AIM-9X', 'Sidewinder (Block II) kısa menzil hava-hava füzesi', AAM],
      ['AIM-120B', 'AMRAAM orta menzil hava-hava füzesi', AAM],
      ['AIM-120C', 'AMRAAM orta menzil hava-hava füzesi', AAM],
      ['AIM-120D', 'AMRAAM uzun menzil hava-hava füzesi', AAM],
      ['AIM-7M', 'Sparrow orta menzil hava-hava füzesi', AAM],
      ['AIM-132', 'ASRAAM kısa menzil hava-hava füzesi', AAM],
      ['IRIS-T', 'Kısa menzil hava-hava füzesi', AAM],
      ['METEOR', 'Ramjet itkili uzun menzil hava-hava füzesi', AAM],
      ['MICA-IR', 'Kızılötesi güdümlü hava-hava füzesi', AAM],
      ['MICA-EM', 'Radar güdümlü hava-hava füzesi', AAM],
      ['PYTHON-5', 'Kısa menzil hava-hava füzesi', AAM],
      ['DERBY', 'Orta menzil hava-hava füzesi', AAM],
      ['R-73', 'Kısa menzil hava-hava füzesi', AAM],
      ['R-77', 'Orta menzil hava-hava füzesi', AAM],
      ['R-27', 'Orta menzil hava-hava füzesi', AAM],
      ['BOZDOGAN', 'Bozdoğan görüş içi hava-hava füzesi', AAM],
      ['GOKDOGAN', 'Gökdoğan görüş ötesi hava-hava füzesi', AAM],

      ['AGM-65D', 'Maverick (IIR) hava-yer füzesi', AGM],
      ['AGM-65G', 'Maverick (IIR, ağır harp başlığı) hava-yer füzesi', AGM],
      ['AGM-65H', 'Maverick (CCD) hava-yer füzesi', AGM],
      ['AGM-65K', 'Maverick (CCD, ağır harp başlığı) hava-yer füzesi', AGM],
      ['AGM-88B', 'HARM radar karşıtı füze', AGM],
      ['AGM-88E', 'AARGM radar karşıtı füze', AGM],
      ['AGM-114', 'Hellfire hava-yer füzesi', AGM],
      ['AGM-154A', 'JSOW süzülen silah (alt mühimmatlı)', AGM],
      ['AGM-154C', 'JSOW süzülen silah (tekil harp başlığı)', AGM],
      ['AGM-142', 'Popeye hava-yer füzesi', AGM],
      ['BRIMSTONE', 'Hava-yer füzesi', AGM],
      ['AGM-84D', 'Harpoon gemi karşıtı füze', ASM],
      ['AGM-84H', 'SLAM-ER kara/gemi taarruz füzesi', AGM],
      ['AGM-158A', 'JASSM seyir füzesi', CRUISE],
      ['AGM-158B', 'JASSM-ER seyir füzesi', CRUISE],
      ['KEPD-350', 'Taurus seyir füzesi', CRUISE],
      ['STORM-SHADOW', 'Seyir füzesi', CRUISE],
      ['SOM-A', 'SOM seyir füzesi', CRUISE],
      ['SOM-J', 'SOM-J seyir füzesi (iç bölmeye uygun)', CRUISE],

      ['MK-81', '250 lb genel maksat bombası', GP],
      ['MK-82', '500 lb genel maksat bombası', GP],
      ['MK-82AIR', '500 lb yavaşlatıcılı genel maksat bombası (BSU-49)', GP],
      ['MK-83', '1000 lb genel maksat bombası', GP],
      ['MK-84', '2000 lb genel maksat bombası', GP],
      ['MK-84AIR', '2000 lb yavaşlatıcılı genel maksat bombası (BSU-50)', GP],
      ['BLU-109', '2000 lb nüfuz edici bomba gövdesi', PEN],
      ['BLU-110', '1000 lb ısıl korumalı bomba gövdesi', GP],
      ['BLU-111', '500 lb ısıl korumalı bomba gövdesi', GP],

      ['GBU-10', 'Paveway II lazer güdümlü bomba (MK-84)', LGB],
      ['GBU-12', 'Paveway II lazer güdümlü bomba (MK-82)', LGB],
      ['GBU-16', 'Paveway II lazer güdümlü bomba (MK-83)', LGB],
      ['GBU-24', 'Paveway III lazer güdümlü bomba (2000 lb)', LGB],
      ['GBU-27', 'Paveway III lazer güdümlü nüfuz edici bomba', LGB],
      ['GBU-28', '5000 lb lazer güdümlü nüfuz edici bomba', LGB],
      ['GBU-54', 'Lazer JDAM (MK-82)', LGB],
      ['GBU-31', 'JDAM (MK-84 / BLU-109)', GPS],
      ['GBU-32', 'JDAM (MK-83)', GPS],
      ['GBU-38', 'JDAM (MK-82)', GPS],
      ['GBU-39', 'SDB küçük çaplı bomba', GPS],
      ['GBU-53', 'SDB II küçük çaplı bomba', GPS],

      ['HGK-82', 'Hassas güdüm kiti (MK-82)', KIT],
      ['HGK-83', 'Hassas güdüm kiti (MK-83)', KIT],
      ['HGK-84', 'Hassas güdüm kiti (MK-84)', KIT],
      ['KGK-82', 'Kanatlı güdüm kiti (MK-82)', KIT],
      ['KGK-83', 'Kanatlı güdüm kiti (MK-83)', KIT],
      ['TEBER-81', 'Lazer/GPS güdüm kiti (MK-81)', KIT],
      ['TEBER-82', 'Lazer/GPS güdüm kiti (MK-82)', KIT],

      ['CBU-87', 'Kombine etkili misket bombası', CBU],
      ['CBU-89', 'Gator mayın atar misket bombası', CBU],
      ['CBU-97', 'Algılayıcı tapalı misket bombası', CBU],
      ['CBU-103', 'Rüzgâr düzeltmeli CBU-87', CBU],
      ['CBU-105', 'Rüzgâr düzeltmeli CBU-97', CBU],

      ['HYDRA-70', '2,75 inç güdümsüz roket', ROCKET],
      ['APKWS', '2,75 inç lazer güdümlü roket', ROCKET],
      ['ZUNI', '5 inç güdümsüz roket', ROCKET],
      ['CIRIT', '2,75 inç lazer güdümlü roket', ROCKET],

      ['BDU-33', '25 lb eğitim bombası', PRACTICE],
      ['MK-106', '5 lb eğitim bombası', PRACTICE],
      ['BDU-50', '500 lb eğitim bombası (MK-82 benzeri)', PRACTICE],
      ['BDU-56', '2000 lb eğitim bombası (MK-84 benzeri)', PRACTICE],

      ['FT-300', '300 galon harici yakıt tankı', TANK],
      ['FT-370', '370 galon harici yakıt tankı', TANK],
      ['FT-600', '600 galon harici yakıt tankı', TANK],

      ['AN/AAQ-33', 'Sniper hedefleme podu', POD_T],
      ['AN/AAQ-28', 'LITENING hedefleme podu', POD_T],
      ['AN/AAQ-14', 'LANTIRN hedefleme podu', POD_T],
      ['ASELPOD', 'ASELPOD hedefleme podu', POD_T],
      ['AN/AAQ-13', 'LANTIRN navigasyon podu', POD_O],
      ['AN/ASQ-213', 'HARM hedefleme sistemi podu', POD_O],
      ['DB-110', 'Keşif podu', POD_O],
      ['ACMI', 'Eğitim / muharebe manevra kayıt podu', POD_O],
      ['AN/ALQ-131', 'Elektronik harp podu', POD_EW],
      ['AN/ALQ-184', 'Elektronik harp podu', POD_EW],
    ],
    // [kod, ad, pozisyon]
    rack: [
      ['MAU-12', 'Bomba askı rafı (pilon içi)', 1],
      ['BRU-32', 'Bomba ejektör rafı', 1],
      ['LAU-129', 'Füze lançeri (AIM-9 / AIM-120)', 1],
      ['LAU-127', 'Füze lançeri (AIM-9 / AIM-120)', 1],
      ['LAU-114', 'AIM-9 lançeri', 1],
      ['LAU-7', 'AIM-9 lançeri', 1],
      ['LAU-106', 'AIM-7 / AIM-120 ejektör lançeri', 1],
      ['LAU-117', 'Tekli AGM-65 lançeri', 1],
      ['LAU-88', 'Üçlü AGM-65 lançeri', 3],
      ['LAU-118', 'AGM-88 lançeri', 1],
      ['LAU-61', '19 tüplü 2,75 inç roket lançeri', 19],
      ['LAU-68', '7 tüplü 2,75 inç roket lançeri', 7],
      ['LAU-131', '7 tüplü 2,75 inç roket lançeri', 7],
      ['LAU-10', '4 tüplü 5 inç roket lançeri', 4],
      ['SUU-20', 'Eğitim bombası dağıtıcısı', 6],
    ],
    // [kod, ad, pozisyon]
    subrack: [
      ['TER-9', 'TER-9/A üçlü ejektör rack', 3],
      ['BRU-42', 'Geliştirilmiş üçlü ejektör rack (ITER)', 3],
      ['MER-10', 'MER-10N çoklu ejektör rack', 6],
      ['BRU-41', 'Geliştirilmiş çoklu ejektör rack (IMER)', 6],
      ['BRU-33', 'Eğik dikey ejektör rack (CVER)', 2],
      ['BRU-55', 'Akıllı çift ejektör rack', 2],
      ['BRU-57', 'Akıllı çift ejektör rack', 2],
      ['BRU-61', 'GBU-39 / GBU-53 dörtlü taşıyıcı', 4],
    ],
    // [kod, ad, çap, mermi kapasitesi] — kapasite uçağa göre değişir, kendi verinizle doğrulayın.
    gun: [
      ['M61A1', 'Vulcan 20 mm altı namlulu top', '20x102', 511],
      ['M61A2', 'Hafifletilmiş Vulcan 20 mm top', '20x102', 480],
      ['M39', '20 mm revolver top', '20x102', 280],
      ['SUU-23', '20 mm harici top podu (GAU-4)', '20x102', 1200],
      ['GAU-22/A', '25 mm dört namlulu top', '25x137', 182],
      ['GAU-12/U', 'Equalizer 25 mm beş namlulu top', '25x137', 300],
      ['GAU-8/A', 'Avenger 30 mm yedi namlulu top', '30x173', 1174],
      ['GPU-5/A', '30 mm harici top podu', '30x173', 353],
      ['BK-27', 'Mauser 27 mm revolver top', '27x145', 150],
      ['DEFA 554', '30 mm revolver top', '30x113', 125],
      ['GIAT 30', '30 mm revolver top (30M791)', '30x150', 125],
      ['GSh-23', '23 mm çift namlulu top', '23x115', 200],
      ['GSh-30-1', '30 mm tek namlulu top', '30x165', 150],
    ],
    // [kod, ad, çap, tip]
    ammo: [
      ['M56A3', '20 mm yüksek infilaklı yakıcı', '20x102', 'HEI'],
      ['M55A2', '20 mm eğitim mermisi', '20x102', 'TP'],
      ['M53', '20 mm zırh delici yakıcı', '20x102', 'API'],
      ['M220', '20 mm izli eğitim mermisi', '20x102', 'TP-T'],
      ['PGU-28/B', '20 mm yarı zırh delici yüksek infilaklı yakıcı', '20x102', 'SAPHEI'],
      ['PGU-27/A', '20 mm eğitim mermisi', '20x102', 'TP'],
      ['PGU-30/A', '20 mm izli eğitim mermisi', '20x102', 'TP-T'],
      ['PGU-20/U', '25 mm zırh delici yakıcı', '25x137', 'API'],
      ['PGU-23/U', '25 mm eğitim mermisi', '25x137', 'TP'],
      ['PGU-25/U', '25 mm yüksek infilaklı yakıcı', '25x137', 'HEI'],
      ['PGU-32/U', '25 mm yarı zırh delici yüksek infilaklı yakıcı', '25x137', 'SAPHEI-T'],
      ['PGU-47/U', '25 mm zırh delici patlayıcı', '25x137', 'APEX'],
      ['PGU-13/B', '30 mm yüksek infilaklı yakıcı', '30x173', 'HEI'],
      ['PGU-14/B', '30 mm zırh delici yakıcı', '30x173', 'API'],
      ['PGU-15/B', '30 mm eğitim mermisi', '30x173', 'TP'],
      ['27x145 HE', '27 mm yüksek infilaklı', '27x145', 'HE'],
      ['27x145 TP', '27 mm eğitim mermisi', '27x145', 'TP'],
      ['30x113 HEI', '30 mm yüksek infilaklı yakıcı (DEFA)', '30x113', 'HEI'],
      ['30x113 TP', '30 mm eğitim mermisi (DEFA)', '30x113', 'TP'],
      ['30x150 HE', '30 mm yüksek infilaklı (GIAT 30)', '30x150', 'HE'],
      ['23x115 HEI', '23 mm yüksek infilaklı yakıcı (OFZ)', '23x115', 'HEI'],
      ['30x165 HEI', '30 mm yüksek infilaklı yakıcı (OFZ)', '30x165', 'HEI'],
    ],
  };

  function standardCatalog() {
    const out = emptyCatalog();
    STANDARD_CATALOG.munition.forEach(function (r) {
      out.munitions.push(Object.assign(newStore('munition'), { code: r[0], name: r[1], category: r[2] }));
    });
    ['rack', 'subrack'].forEach(function (kind) {
      STANDARD_CATALOG[kind].forEach(function (r) {
        out[CATALOG_KEY[kind]].push(Object.assign(newStore(kind), { code: r[0], name: r[1], positions: r[2] }));
      });
    });
    STANDARD_CATALOG.gun.forEach(function (r) {
      out.guns.push(Object.assign(newStore('gun'), { code: r[0], name: r[1], caliber: r[2], positions: r[3] }));
    });
    STANDARD_CATALOG.ammo.forEach(function (r) {
      out.ammo.push(Object.assign(newStore('ammo'), { code: r[0], name: r[1], caliber: r[2], category: r[3] }));
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
    project.catalogVersion = STANDARD_CATALOG_VERSION;
    return added;
  }

  /* Gösterim amaçlı örnek: uyumluluklar gerçek teknik verilerle doğrulanmalıdır. */
  function sampleProject() {
    const p = emptyProject();
    p.name = 'Örnek Proje';
    p.catalog = standardCatalog();
    p.catalogVersion = STANDARD_CATALOG_VERSION;
    const kindOf = function (code) {
      return KINDS.find(function (k) { return p.catalog[CATALOG_KEY[k]].some(function (x) { return x.code === code; }); });
    };
    const S = function (code) {
      return p.catalog[CATALOG_KEY[kindOf(code)]].find(function (x) { return x.code === code; });
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
    // Ortak füze rayı paketi: birçok istasyonda aynı kural, tek yerden yönetilir.
    const railPkg = Object.assign(newPackage(), {
      code: 'AAM-RAY', name: 'LAU-129 füze rayı (AIM-9 / AIM-120)',
      loads: [n('LAU-129', [n('AIM-9X'), n('AIM-9M'), n('AIM-120C')])],
    });
    p.packages.push(railPkg);
    const aamRail = function () { return newLoadNode('package', railPkg.id); };

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
        n('LAU-117', [n('AGM-65D'), n('AGM-65G')]),
        n('LAU-118', [n('AGM-88B')]),
        aamRail()
      );
    });
    [a4, a6].forEach(function (s) {
      s.loads.push(n('MAU-12', [n('MK-82'), n('MK-84'), n('GBU-12'), n('GBU-31'), n('FT-370')]));
    });
    a5.loads.push(n('FT-300'), n('AN/ALQ-131'));
    a5l.loads.push(n('AN/AAQ-13'));
    a5r.loads.push(n('AN/AAQ-33'), n('AN/AAQ-28'), n('ASELPOD'));
    const aGun = Object.assign(newStation(), { type: 'GUN', code: 'GUN', name: 'Dahili top' });
    aGun.loads.push(n('M61A1', [n('PGU-28/B', [], 511), n('M56A3', [], 511), n('PGU-27/A', [], 511)]));
    a.stations.push(a1, a2, a3, a4, a5, a5l, a5r, a6, a7, a8, a9, aGun);
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
    b3.loads.push(n('FT-300'), n('MAU-12', [n('MK-84'), n('GBU-31'), n('GPU-5/A', [n('PGU-13/B', [], 353), n('PGU-15/B', [], 353)])]));
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
    HAS_POSITIONS: HAS_POSITIONS,
    STATION_TYPES: STATION_TYPES,
    LOCATIONS: LOCATIONS,
    CONSTRAINT_TYPES: CONSTRAINT_TYPES,
    newId: newId,
    emptyProject: emptyProject,
    sampleProject: sampleProject,
    standardCatalog: standardCatalog,
    STANDARD_CATALOG_VERSION: STANDARD_CATALOG_VERSION,
    mergeStandardCatalog: mergeStandardCatalog,
    newPackage: newPackage,
    cloneLoads: cloneLoads,
    expandLoads: expandLoads,
    packageUsage: packageUsage,
    duplicateAircraft: duplicateAircraft,
    compatibility: compatibility,
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
