/*
 * Data model, sample data and validation.
 * Used as window.LoadoutModel in the browser and via module.exports in Node.
 *
 * Project structure:
 *   catalog.munitions / racks / subracks / guns / ammo : defined stores
 *   presets[]                                          : reusable load trees
 *   aircraft[].stations[].loads                        : load tree allowed on a station
 *   aircraft[].constraints                             : cross-station rules
 *
 * Load tree (LoadNode):
 *   { id, kind: 'rack'|'subrack'|'munition'|'gun'|'ammo'|'preset', refId, qty, children: [LoadNode] }
 *   The children of a node are ALTERNATIVES (any one of them may be fitted).
 *   qty: maximum number of that item on its parent (rounds for gun ammunition).
 *
 * Station types: STATION (numbered station / side station) and GUN (internal gun, unnumbered).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoadoutModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  const KINDS = ['munition', 'rack', 'subrack', 'gun', 'ammo'];
  const KIND_LABELS = { munition: 'Store', rack: 'Rack', subrack: 'Subrack', gun: 'Gun', ammo: 'Gun ammunition', preset: 'Preset' };
  const CATALOG_KEY = { munition: 'munitions', rack: 'racks', subrack: 'subracks', gun: 'guns', ammo: 'ammo' };
  // Meaning of "positions": mounting points for racks/subracks, round capacity for guns.
  const HAS_POSITIONS = { rack: true, subrack: true, gun: true };

  // What may be fitted under what. Gun pods may hang under a rack.
  const ALLOWED_CHILDREN = {
    station: ['rack', 'subrack', 'munition', 'gun', 'preset'],
    gunStation: ['gun'],
    // Preset contents: same as a station, but no preset inside a preset.
    presetRoot: ['rack', 'subrack', 'munition', 'gun'],
    preset: [],
    rack: ['subrack', 'munition', 'gun'],
    subrack: ['munition'],
    gun: ['ammo'],
    munition: [],
    ammo: [],
  };
  const PARENT_LABELS = { station: 'a station', gunStation: 'a gun station', presetRoot: 'a preset' };

  const STATION_TYPES = { STATION: 'Station', GUN: 'Gun (GUN)' };

  const LOCATIONS = { LEFT: 'Left', CENTER: 'Centre', RIGHT: 'Right' };

  const CONSTRAINT_TYPES = {
    SYMMETRIC: { label: 'Symmetric', help: 'The listed stations must carry the same load.' },
    EXCLUSIVE: { label: 'Mutually exclusive', help: 'At most one of the listed stations may be loaded.' },
    REQUIRES: { label: 'Requires', help: 'If the first station is loaded, the others must be loaded too.' },
    MAX_TOTAL: { label: 'Total limit', help: 'At most N of the selected store in total across the listed stations.' },
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
      name: 'New Project',
      catalogVersion: 0,
      catalog: emptyCatalog(),
      // Presets: shared load trees used on several stations.
      presets: [],
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
    // code and location are assigned by left-to-right ordering (AircraftShapes.arrangeStations).
    // parentId/suffix: for a side station, its parent station and suffix (e.g. 5 + 'L' = 5L).
    // x, y: position on the aircraft drawing (null = placed automatically).
    return { id: newId('st'), type: 'STATION', code: '', name: '', parentId: null, suffix: '', location: 'CENTER', x: null, y: null, loads: [] };
  }

  function newLoadNode(kind, refId) {
    return { id: newId('ld'), kind: kind, refId: refId || '', qty: 1, children: [] };
  }

  function newConstraint() {
    return { id: newId('cn'), type: 'SYMMETRIC', stationIds: [], munitionId: '', value: 0, description: '' };
  }

  function newPreset() {
    return { id: newId('ps'), code: '', name: '', notes: '', loads: [] };
  }

  function findStore(project, kind, id) {
    const list = kind === 'preset' ? (project.presets || []) : (project.catalog[CATALOG_KEY[kind]] || []);
    return list.find(function (s) { return s.id === id; }) || null;
  }

  function storeLabel(store) {
    if (!store) return '(undefined)';
    return store.code ? store.code + (store.name ? ' — ' + store.name : '') : (store.name || '(unnamed)');
  }

  // Fields from earlier versions that are no longer used.
  const OBSOLETE_FIELDS = ['weightKg', 'maxLoadKg'];
  function stripObsolete(obj) {
    OBSOLETE_FIELDS.forEach(function (k) { delete obj[k]; });
    return obj;
  }

  /* Brings old or incomplete projects up to the current schema. */
  function normalizeProject(p) {
    const out = Object.assign(emptyProject(), p || {});
    out.catalog = Object.assign(emptyCatalog(), out.catalog || {});
    KINDS.forEach(function (kind) {
      out.catalog[CATALOG_KEY[kind]] = out.catalog[CATALOG_KEY[kind]].map(function (s) {
        return stripObsolete(Object.assign(newStore(kind), s));
      });
    });
    // Earlier versions called presets "packages" (kind 'package').
    const legacyPresets = out.packages || [];
    delete out.packages;
    out.presets = (out.presets || []).concat(legacyPresets).map(function (pk) {
      const preset = Object.assign(newPreset(), pk);
      preset.loads = (preset.loads || []).map(normalizeNode);
      return preset;
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
    if (node.kind === 'package') node.kind = 'preset';
    node.children = (node.children || []).map(normalizeNode);
    return node;
  }

  /* ---------------------------------------------------------------- copying, presets */

  /* Deep copy of a load tree with new ids. */
  function cloneLoads(loads) {
    return (loads || []).map(function (n) {
      return { id: newId('ld'), kind: n.kind, refId: n.refId, qty: n.qty, children: cloneLoads(n.children) };
    });
  }

  /* Replaces preset references with the preset contents (flat rule tree for XML, matrix etc.). */
  function expandLoads(project, loads) {
    const out = [];
    (loads || []).forEach(function (n) {
      if (n.kind === 'preset') {
        const preset = findStore(project, 'preset', n.refId);
        if (preset) cloneLoads(preset.loads).forEach(function (c) { out.push(c); });
        return;
      }
      out.push({ id: n.id, kind: n.kind, refId: n.refId, qty: n.qty, children: expandLoads(project, n.children) });
    });
    return out;
  }

  /* Stations that use a preset: [{ aircraft, station }]. */
  function presetUsage(project, presetId) {
    const out = [];
    project.aircraft.forEach(function (ac) {
      ac.stations.forEach(function (st) {
        if (st.loads.some(function (n) { return n.kind === 'preset' && n.refId === presetId; })) out.push({ aircraft: ac, station: st });
      });
    });
    return out;
  }

  /* Duplicates an aircraft with all its stations, loads and rules under new ids. */
  function duplicateAircraft(ac) {
    const idMap = {};
    const copy = Object.assign(newAircraft(), JSON.parse(JSON.stringify(ac)));
    copy.id = newId('ac');
    copy.code = (ac.code || 'AIRCRAFT') + '-COPY';
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
   * Compatibility matrix: which item fits which station, by which path and at most how many.
   * kinds: kinds shown as rows. Returns { stations, rows: [{ kind, store, cells: { stationId: { qty, paths } } }] }
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

  /* ---------------------------------------------------------------- validation */

  function validate(project) {
    const issues = [];
    const add = function (level, where, message) { issues.push({ level: level, where: where, message: message }); };

    KINDS.forEach(function (kind) {
      const list = project.catalog[CATALOG_KEY[kind]] || [];
      const seen = {};
      list.forEach(function (s) {
        const where = KIND_LABELS[kind] + ' ' + storeLabel(s);
        if (!s.code) add('error', where, 'Code must not be empty.');
        else if (seen[s.code]) add('error', where, 'Duplicate code: ' + s.code);
        seen[s.code] = true;
        if (HAS_POSITIONS[kind] && !(Number(s.positions) >= 1)) {
          add('error', where, kind === 'gun' ? 'Round capacity must be at least 1.' : 'Number of positions must be at least 1.');
        }
      });
    });

    const psSeen = {};
    (project.presets || []).forEach(function (preset) {
      const where = 'Preset ' + storeLabel(preset);
      if (!preset.code) add('error', where, 'Code must not be empty.');
      else if (psSeen[preset.code]) add('error', where, 'Duplicate code: ' + preset.code);
      psSeen[preset.code] = true;
      if (!preset.loads.length) add('warning', where, 'Preset is empty.');
      preset.loads.forEach(function (n) { validateNode(project, n, 'presetRoot', null, where, add); });
    });

    const acSeen = {};
    project.aircraft.forEach(function (ac) {
      const acWhere = 'Aircraft ' + (ac.code || '(no code)');
      if (!ac.code) add('error', acWhere, 'Aircraft code must not be empty.');
      else if (acSeen[ac.code]) add('error', acWhere, 'Duplicate aircraft code.');
      acSeen[ac.code] = true;
      if (!ac.stations.length) add('warning', acWhere, 'No stations defined.');
      const stById = {};
      ac.stations.forEach(function (s) { stById[s.id] = s; });

      const stSeen = {};
      ac.stations.forEach(function (st) {
        const stWhere = acWhere + ' / Station ' + (st.code || '(no code)');
        if (!st.code) add('error', stWhere, 'Station code must not be empty.');
        else if (stSeen[st.code]) add('error', stWhere, 'Duplicate station code.');
        stSeen[st.code] = true;
        if (st.parentId) {
          if (!stById[st.parentId]) add('error', stWhere, 'Parent station not found.');
          if (!st.suffix) add('error', stWhere, 'Side station suffix must not be empty.');
        }
        if (!st.loads.length) add('warning', stWhere, 'No loads are allowed on this station yet.');

        const parentKind = st.type === 'GUN' ? 'gunStation' : 'station';
        st.loads.forEach(function (n) { validateNode(project, n, parentKind, null, stWhere, add); });
      });

      const stationIds = {};
      ac.stations.forEach(function (s) { stationIds[s.id] = true; });
      ac.constraints.forEach(function (c, i) {
        const cWhere = acWhere + ' / Rule #' + (i + 1);
        if (!CONSTRAINT_TYPES[c.type]) add('error', cWhere, 'Unknown rule type: ' + c.type);
        const valid = c.stationIds.filter(function (id) { return stationIds[id]; });
        if (valid.length !== c.stationIds.length) add('error', cWhere, 'References a deleted station.');
        if (valid.length < 2) add('error', cWhere, 'Select at least 2 stations.');
        if (c.type === 'MAX_TOTAL') {
          if (!findStore(project, 'munition', c.munitionId)) add('error', cWhere, 'Select a store.');
          if (!(Number(c.value) >= 0)) add('error', cWhere, 'The limit must not be negative.');
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
      add('error', here, KIND_LABELS[node.kind] + ' cannot be fitted under ' + (KIND_LABELS[parentKind] ? 'a ' + KIND_LABELS[parentKind].toLowerCase() : PARENT_LABELS[parentKind]) + '.');
    }
    if (!store) add('error', here, 'References an item that is not in the catalog.');
    if (!(Number(node.qty) >= 1)) add('error', here, 'Quantity must be at least 1.');
    if (parentStore && Number(node.qty) > Number(parentStore.positions)) {
      add('error', here, 'Quantity (' + node.qty + ') exceeds the ' +
        (node.kind === 'ammo' ? 'round capacity (' : 'number of positions (') + parentStore.positions + ') of ' + storeLabel(parentStore) + '.');
    }
    if (store && node.kind === 'ammo' && parentStore && parentStore.caliber && store.caliber &&
        normCaliber(parentStore.caliber) !== normCaliber(store.caliber)) {
      add('warning', here, 'Caliber mismatch: gun ' + parentStore.caliber + ', ammunition ' + store.caliber + '.');
    }
    if (store && ALLOWED_CHILDREN[node.kind].length) {
      if (!(node.children || []).length) add('warning', here, 'Nothing is allowed under it yet.');
    }
    (node.children || []).forEach(function (c) { validateNode(project, c, node.kind, store, where, add); });
  }

  function normCaliber(c) { return String(c).toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x'); }

  /* ---------------------------------------------------------------- standard catalog */

  /*
   * Standard catalog using common public designations. Edit to match your own inventory.
   * When the version is raised, missing items are added to older projects on open (nothing is removed).
   */
  const STANDARD_CATALOG_VERSION = 3;

  const AAM = 'Air-to-air missile';
  const AGM = 'Air-to-ground missile';
  const ASM = 'Anti-ship missile';
  const CRUISE = 'Cruise missile';
  const GP = 'General purpose bomb';
  const PEN = 'Penetrator bomb';
  const LGB = 'Laser-guided bomb';
  const GPS = 'GPS/INS-guided bomb';
  const KIT = 'Guidance kit (Turkish)';
  const CBU = 'Cluster bomb';
  const ROCKET = 'Rocket';
  const PRACTICE = 'Practice bomb';
  const TANK = 'Fuel tank';
  const POD_T = 'Targeting pod';
  const POD_EW = 'Electronic warfare pod';
  const POD_O = 'Other pod';

  const STANDARD_CATALOG = {
    // [code, name, category]
    munition: [
      ['AIM-9L', 'Sidewinder short-range air-to-air missile', AAM],
      ['AIM-9M', 'Sidewinder short-range air-to-air missile', AAM],
      ['AIM-9X', 'Sidewinder (Block II) short-range air-to-air missile', AAM],
      ['AIM-120B', 'AMRAAM medium-range air-to-air missile', AAM],
      ['AIM-120C', 'AMRAAM medium-range air-to-air missile', AAM],
      ['AIM-120D', 'AMRAAM long-range air-to-air missile', AAM],
      ['AIM-7M', 'Sparrow medium-range air-to-air missile', AAM],
      ['AIM-132', 'ASRAAM short-range air-to-air missile', AAM],
      ['IRIS-T', 'Short-range air-to-air missile', AAM],
      ['METEOR', 'Ramjet long-range air-to-air missile', AAM],
      ['MICA-IR', 'Infrared-guided air-to-air missile', AAM],
      ['MICA-EM', 'Radar-guided air-to-air missile', AAM],
      ['PYTHON-5', 'Short-range air-to-air missile', AAM],
      ['DERBY', 'Medium-range air-to-air missile', AAM],
      ['R-73', 'Short-range air-to-air missile', AAM],
      ['R-77', 'Medium-range air-to-air missile', AAM],
      ['R-27', 'Medium-range air-to-air missile', AAM],
      ['BOZDOGAN', 'Bozdoğan within-visual-range air-to-air missile', AAM],
      ['GOKDOGAN', 'Gökdoğan beyond-visual-range air-to-air missile', AAM],

      ['AGM-65D', 'Maverick (IIR) air-to-ground missile', AGM],
      ['AGM-65G', 'Maverick (IIR, heavy warhead) air-to-ground missile', AGM],
      ['AGM-65H', 'Maverick (CCD) air-to-ground missile', AGM],
      ['AGM-65K', 'Maverick (CCD, heavy warhead) air-to-ground missile', AGM],
      ['AGM-88B', 'HARM anti-radiation missile', AGM],
      ['AGM-88E', 'AARGM anti-radiation missile', AGM],
      ['AGM-114', 'Hellfire air-to-ground missile', AGM],
      ['AGM-154A', 'JSOW glide weapon (submunitions)', AGM],
      ['AGM-154C', 'JSOW glide weapon (unitary warhead)', AGM],
      ['AGM-142', 'Popeye air-to-ground missile', AGM],
      ['BRIMSTONE', 'Air-to-ground missile', AGM],
      ['AGM-84D', 'Harpoon anti-ship missile', ASM],
      ['AGM-84H', 'SLAM-ER land/ship attack missile', AGM],
      ['AGM-158A', 'JASSM cruise missile', CRUISE],
      ['AGM-158B', 'JASSM-ER cruise missile', CRUISE],
      ['KEPD-350', 'Taurus cruise missile', CRUISE],
      ['STORM-SHADOW', 'Cruise missile', CRUISE],
      ['SOM-A', 'SOM cruise missile', CRUISE],
      ['SOM-J', 'SOM-J cruise missile (internal-bay capable)', CRUISE],

      ['MK-81', '250 lb general purpose bomb', GP],
      ['MK-82', '500 lb general purpose bomb', GP],
      ['MK-82AIR', '500 lb retarded general purpose bomb (BSU-49)', GP],
      ['MK-83', '1000 lb general purpose bomb', GP],
      ['MK-84', '2000 lb general purpose bomb', GP],
      ['MK-84AIR', '2000 lb retarded general purpose bomb (BSU-50)', GP],
      ['BLU-109', '2000 lb penetrator bomb body', PEN],
      ['BLU-110', '1000 lb thermally protected bomb body', GP],
      ['BLU-111', '500 lb thermally protected bomb body', GP],

      ['GBU-10', 'Paveway II laser-guided bomb (MK-84)', LGB],
      ['GBU-12', 'Paveway II laser-guided bomb (MK-82)', LGB],
      ['GBU-16', 'Paveway II laser-guided bomb (MK-83)', LGB],
      ['GBU-24', 'Paveway III laser-guided bomb (2000 lb)', LGB],
      ['GBU-27', 'Paveway III laser-guided penetrator bomb', LGB],
      ['GBU-28', '5000 lb laser-guided penetrator bomb', LGB],
      ['GBU-54', 'Laser JDAM (MK-82)', LGB],
      ['GBU-31', 'JDAM (MK-84 / BLU-109)', GPS],
      ['GBU-32', 'JDAM (MK-83)', GPS],
      ['GBU-38', 'JDAM (MK-82)', GPS],
      ['GBU-39', 'SDB small diameter bomb', GPS],
      ['GBU-53', 'SDB II small diameter bomb', GPS],

      ['HGK-82', 'Precision guidance kit (MK-82)', KIT],
      ['HGK-83', 'Precision guidance kit (MK-83)', KIT],
      ['HGK-84', 'Precision guidance kit (MK-84)', KIT],
      ['KGK-82', 'Wing-assisted guidance kit (MK-82)', KIT],
      ['KGK-83', 'Wing-assisted guidance kit (MK-83)', KIT],
      ['TEBER-81', 'Laser/GPS guidance kit (MK-81)', KIT],
      ['TEBER-82', 'Laser/GPS guidance kit (MK-82)', KIT],

      ['CBU-87', 'Combined effects cluster bomb', CBU],
      ['CBU-89', 'Gator mine-dispensing cluster bomb', CBU],
      ['CBU-97', 'Sensor-fuzed cluster bomb', CBU],
      ['CBU-103', 'Wind-corrected CBU-87', CBU],
      ['CBU-105', 'Wind-corrected CBU-97', CBU],

      ['HYDRA-70', '2.75 in unguided rocket', ROCKET],
      ['APKWS', '2.75 in laser-guided rocket', ROCKET],
      ['ZUNI', '5 in unguided rocket', ROCKET],
      ['CIRIT', '2.75 in laser-guided rocket', ROCKET],

      ['BDU-33', '25 lb practice bomb', PRACTICE],
      ['MK-106', '5 lb practice bomb', PRACTICE],
      ['BDU-50', '500 lb practice bomb (MK-82 shape)', PRACTICE],
      ['BDU-56', '2000 lb practice bomb (MK-84 shape)', PRACTICE],

      ['FT-300', '300 gal external fuel tank', TANK],
      ['FT-370', '370 gal external fuel tank', TANK],
      ['FT-600', '600 gal external fuel tank', TANK],

      ['AN/AAQ-33', 'Sniper targeting pod', POD_T],
      ['AN/AAQ-28', 'LITENING targeting pod', POD_T],
      ['AN/AAQ-14', 'LANTIRN targeting pod', POD_T],
      ['ASELPOD', 'ASELPOD targeting pod', POD_T],
      ['AN/AAQ-13', 'LANTIRN navigation pod', POD_O],
      ['AN/ASQ-213', 'HARM targeting system pod', POD_O],
      ['DB-110', 'Reconnaissance pod', POD_O],
      ['ACMI', 'Air combat manoeuvring instrumentation pod', POD_O],
      ['AN/ALQ-131', 'Electronic warfare pod', POD_EW],
      ['AN/ALQ-184', 'Electronic warfare pod', POD_EW],
    ],
    // [code, name, positions]
    rack: [
      ['MAU-12', 'Bomb rack (inside pylon)', 1],
      ['BRU-32', 'Bomb ejector rack', 1],
      ['LAU-129', 'Missile launcher (AIM-9 / AIM-120)', 1],
      ['LAU-127', 'Missile launcher (AIM-9 / AIM-120)', 1],
      ['LAU-114', 'AIM-9 launcher', 1],
      ['LAU-7', 'AIM-9 launcher', 1],
      ['LAU-106', 'AIM-7 / AIM-120 ejector launcher', 1],
      ['LAU-117', 'Single AGM-65 launcher', 1],
      ['LAU-88', 'Triple AGM-65 launcher', 3],
      ['LAU-118', 'AGM-88 launcher', 1],
      ['LAU-61', '19-tube 2.75 in rocket launcher', 19],
      ['LAU-68', '7-tube 2.75 in rocket launcher', 7],
      ['LAU-131', '7-tube 2.75 in rocket launcher', 7],
      ['LAU-10', '4-tube 5 in rocket launcher', 4],
      ['SUU-20', 'Practice bomb dispenser', 6],
    ],
    // [code, name, positions]
    subrack: [
      ['TER-9', 'TER-9/A triple ejector rack', 3],
      ['BRU-42', 'Improved triple ejector rack (ITER)', 3],
      ['MER-10', 'MER-10N multiple ejector rack', 6],
      ['BRU-41', 'Improved multiple ejector rack (IMER)', 6],
      ['BRU-33', 'Canted vertical ejector rack (CVER)', 2],
      ['BRU-55', 'Smart dual ejector rack', 2],
      ['BRU-57', 'Smart dual ejector rack', 2],
      ['BRU-61', 'GBU-39 / GBU-53 quad carriage', 4],
    ],
    // [code, name, caliber, round capacity] — capacity varies by aircraft; verify with your own data.
    gun: [
      ['M61A1', 'Vulcan 20 mm six-barrel cannon', '20x102', 511],
      ['M61A2', 'Lightweight Vulcan 20 mm cannon', '20x102', 480],
      ['M39', '20 mm revolver cannon', '20x102', 280],
      ['SUU-23', '20 mm external gun pod (GAU-4)', '20x102', 1200],
      ['GAU-22/A', '25 mm four-barrel cannon', '25x137', 182],
      ['GAU-12/U', 'Equalizer 25 mm five-barrel cannon', '25x137', 300],
      ['GAU-8/A', 'Avenger 30 mm seven-barrel cannon', '30x173', 1174],
      ['GPU-5/A', '30 mm external gun pod', '30x173', 353],
      ['BK-27', 'Mauser 27 mm revolver cannon', '27x145', 150],
      ['DEFA 554', '30 mm revolver cannon', '30x113', 125],
      ['GIAT 30', '30 mm revolver cannon (30M791)', '30x150', 125],
      ['GSh-23', '23 mm twin-barrel cannon', '23x115', 200],
      ['GSh-30-1', '30 mm single-barrel cannon', '30x165', 150],
    ],
    // [code, name, caliber, type]
    ammo: [
      ['M56A3', '20 mm high-explosive incendiary', '20x102', 'HEI'],
      ['M55A2', '20 mm target practice', '20x102', 'TP'],
      ['M53', '20 mm armour-piercing incendiary', '20x102', 'API'],
      ['M220', '20 mm target practice tracer', '20x102', 'TP-T'],
      ['PGU-28/B', '20 mm semi-armour-piercing high-explosive incendiary', '20x102', 'SAPHEI'],
      ['PGU-27/A', '20 mm target practice', '20x102', 'TP'],
      ['PGU-30/A', '20 mm target practice tracer', '20x102', 'TP-T'],
      ['PGU-20/U', '25 mm armour-piercing incendiary', '25x137', 'API'],
      ['PGU-23/U', '25 mm target practice', '25x137', 'TP'],
      ['PGU-25/U', '25 mm high-explosive incendiary', '25x137', 'HEI'],
      ['PGU-32/U', '25 mm semi-armour-piercing high-explosive incendiary', '25x137', 'SAPHEI-T'],
      ['PGU-47/U', '25 mm armour-piercing explosive', '25x137', 'APEX'],
      ['PGU-13/B', '30 mm high-explosive incendiary', '30x173', 'HEI'],
      ['PGU-14/B', '30 mm armour-piercing incendiary', '30x173', 'API'],
      ['PGU-15/B', '30 mm target practice', '30x173', 'TP'],
      ['27x145 HE', '27 mm high-explosive', '27x145', 'HE'],
      ['27x145 TP', '27 mm target practice', '27x145', 'TP'],
      ['30x113 HEI', '30 mm high-explosive incendiary (DEFA)', '30x113', 'HEI'],
      ['30x113 TP', '30 mm target practice (DEFA)', '30x113', 'TP'],
      ['30x150 HE', '30 mm high-explosive (GIAT 30)', '30x150', 'HE'],
      ['23x115 HEI', '23 mm high-explosive incendiary (OFZ)', '23x115', 'HEI'],
      ['30x165 HEI', '30 mm high-explosive incendiary (OFZ)', '30x165', 'HEI'],
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

  /* Adds standard catalog items whose code is not yet in the project; returns the number added. */
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

  /*
   * Translates standard catalog entries that still carry the Turkish names/categories of catalog
   * version 2 into English. Entries the user has edited are left alone. Returns the number changed.
   */
  function translateLegacyCatalog(project) {
    const std = standardCatalog();
    let changed = 0;
    KINDS.forEach(function (kind) {
      const key = CATALOG_KEY[kind];
      const byCode = {};
      std[key].forEach(function (s) { byCode[s.code] = s; });
      project.catalog[key].forEach(function (s) {
        const legacy = LEGACY_TR[kind + ':' + s.code];
        const en = byCode[s.code];
        if (!legacy || !en) return;
        let hit = false;
        if (s.name === legacy[0]) { s.name = en.name; hit = true; }
        if (legacy[1] && s.category === legacy[1]) { s.category = en.category; hit = true; }
        if (hit) changed++;
      });
    });
    return changed;
  }

  /* Brings an older project's catalog up to date: translation and missing items. */
  function upgradeCatalog(project) {
    if ((project.catalogVersion || 0) >= STANDARD_CATALOG_VERSION) return { added: 0, translated: 0 };
    const translated = translateLegacyCatalog(project);
    const added = mergeStandardCatalog(project);
    return { added: added, translated: translated };
  }

  /* ---------------------------------------------------------------- sample data */

  /* For demonstration only: compatibilities must be checked against real technical data. */
  function sampleProject() {
    const p = emptyProject();
    p.name = 'Sample Project';
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
    // Shared missile rail preset: the same rule on many stations, managed in one place.
    const railPreset = Object.assign(newPreset(), {
      code: 'AAM-RAIL', name: 'LAU-129 missile rail (AIM-9 / AIM-120)',
      loads: [n('LAU-129', [n('AIM-9X'), n('AIM-9M'), n('AIM-120C')])],
    });
    p.presets.push(railPreset);
    const aamRail = function () { return newLoadNode('preset', railPreset.id); };

    // Aircraft A: single-engine fighter, 9 stations + 5L / 5R.
    const a = Object.assign(newAircraft(), { code: 'SAMPLE-A', name: 'Sample aircraft A (single-engine)', silhouette: 'single' });
    const a1 = st('1', 'Left wing tip', 'LEFT');
    const a2 = st('2', 'Left outboard wing', 'LEFT');
    const a3 = st('3', 'Left mid wing', 'LEFT');
    const a4 = st('4', 'Left inboard wing', 'LEFT');
    const a5 = st('5', 'Centreline', 'CENTER');
    const a6 = st('6', 'Right inboard wing', 'RIGHT');
    const a7 = st('7', 'Right mid wing', 'RIGHT');
    const a8 = st('8', 'Right outboard wing', 'RIGHT');
    const a9 = st('9', 'Right wing tip', 'RIGHT');
    const a5l = side(a5, 'L', 'Left intake side');
    const a5r = side(a5, 'R', 'Right intake side');
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
    const aGun = Object.assign(newStation(), { type: 'GUN', code: 'GUN', name: 'Internal gun' });
    aGun.loads.push(n('M61A1', [n('PGU-28/B', [], 511), n('M56A3', [], 511), n('PGU-27/A', [], 511)]));
    a.stations.push(a1, a2, a3, a4, a5, a5l, a5r, a6, a7, a8, a9, aGun);
    a.constraints.push(
      rule('SYMMETRIC', [a1, a9], { description: 'Wing tip missiles symmetric.' }),
      rule('SYMMETRIC', [a3, a7], { description: 'Mid wing loads must be symmetric.' }),
      rule('SYMMETRIC', [a4, a6], { description: 'Inboard wing loads must be symmetric.' }),
      rule('EXCLUSIVE', [a5l, a5r], { description: 'Only one pod at a time.' }),
      rule('MAX_TOTAL', [a3, a4, a6, a7], { munitionId: S('MK-84').id, value: 2, description: 'At most 2 MK-84.' })
    );

    // Aircraft B: delta wing, 5 stations.
    const b = Object.assign(newAircraft(), { code: 'SAMPLE-B', name: 'Sample aircraft B (delta wing)', silhouette: 'delta' });
    const b1 = st('1', 'Left outboard wing', 'LEFT');
    const b2 = st('2', 'Left inboard wing', 'LEFT');
    const b3 = st('3', 'Centreline', 'CENTER');
    const b4 = st('4', 'Right inboard wing', 'RIGHT');
    const b5 = st('5', 'Right outboard wing', 'RIGHT');
    [b1, b5].forEach(function (s) { s.loads.push(aamRail()); });
    [b2, b4].forEach(function (s) { s.loads.push(n('MAU-12', [n('MK-82'), n('GBU-12'), n('FT-370')])); });
    b3.loads.push(n('FT-300'), n('MAU-12', [n('MK-84'), n('GBU-31'), n('GPU-5/A', [n('PGU-13/B', [], 353), n('PGU-15/B', [], 353)])]));
    b.stations.push(b1, b2, b3, b4, b5);
    b.constraints.push(
      rule('SYMMETRIC', [b2, b4], { description: 'Inboard wing loads symmetric.' })
    );

    // Aircraft C and D: show the Eurofighter and CALIDUS B-250 drawings. Stations are placed
    // automatically; loads are illustrative only.
    const stationsFor = function (left, centre, right, wingLoad, centreLoad) {
      const list = [];
      for (let i = 0; i < left; i++) list.push(st('', '', 'LEFT'));
      for (let i = 0; i < centre; i++) list.push(st('', '', 'CENTER'));
      for (let i = 0; i < right; i++) list.push(st('', '', 'RIGHT'));
      list.forEach(function (s, i) {
        s.code = String(i + 1);
        s.loads = s.location === 'CENTER' ? centreLoad() : wingLoad();
      });
      return list;
    };
    const c = Object.assign(newAircraft(), { code: 'SAMPLE-C', name: 'Sample aircraft C (Eurofighter drawing)', silhouette: 'eurofighter' });
    c.stations = stationsFor(4, 1, 4,
      function () { return [n('MAU-12', [n('GBU-12'), n('MK-82'), n('FT-370')]), aamRail()]; },
      function () { return [n('FT-300')]; });
    const cGun = Object.assign(newStation(), { type: 'GUN', code: 'GUN', name: 'Internal gun' });
    cGun.loads.push(n('BK-27', [n('27x145 HE', [], 150), n('27x145 TP', [], 150)]));
    c.stations.push(cGun);

    const d = Object.assign(newAircraft(), { code: 'SAMPLE-D', name: 'Sample aircraft D (CALIDUS B-250 drawing)', silhouette: 'calidus' });
    d.stations = stationsFor(3, 1, 3,
      function () { return [n('MAU-12', [n('MK-82'), n('GBU-12')]), n('LAU-68', [n('HYDRA-70', [], 7), n('CIRIT', [], 7)])]; },
      function () { return [n('FT-300')]; });

    p.aircraft.push(a, b, c, d);
    return p;
  }

  // Turkish names/categories used by standard catalog version 2 (for translateLegacyCatalog).
  const LEGACY_TR = {"munition:AIM-9L":["Sidewinder kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-9M":["Sidewinder kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-9X":["Sidewinder (Block II) kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-120B":["AMRAAM orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-120C":["AMRAAM orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-120D":["AMRAAM uzun menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-7M":["Sparrow orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:AIM-132":["ASRAAM kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:IRIS-T":["Kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:METEOR":["Ramjet itkili uzun menzil hava-hava füzesi","Hava-hava füzesi"],"munition:MICA-IR":["Kızılötesi güdümlü hava-hava füzesi","Hava-hava füzesi"],"munition:MICA-EM":["Radar güdümlü hava-hava füzesi","Hava-hava füzesi"],"munition:PYTHON-5":["Kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:DERBY":["Orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:R-73":["Kısa menzil hava-hava füzesi","Hava-hava füzesi"],"munition:R-77":["Orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:R-27":["Orta menzil hava-hava füzesi","Hava-hava füzesi"],"munition:BOZDOGAN":["Bozdoğan görüş içi hava-hava füzesi","Hava-hava füzesi"],"munition:GOKDOGAN":["Gökdoğan görüş ötesi hava-hava füzesi","Hava-hava füzesi"],"munition:AGM-65D":["Maverick (IIR) hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-65G":["Maverick (IIR, ağır harp başlığı) hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-65H":["Maverick (CCD) hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-65K":["Maverick (CCD, ağır harp başlığı) hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-88B":["HARM radar karşıtı füze","Hava-yer füzesi"],"munition:AGM-88E":["AARGM radar karşıtı füze","Hava-yer füzesi"],"munition:AGM-114":["Hellfire hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-154A":["JSOW süzülen silah (alt mühimmatlı)","Hava-yer füzesi"],"munition:AGM-154C":["JSOW süzülen silah (tekil harp başlığı)","Hava-yer füzesi"],"munition:AGM-142":["Popeye hava-yer füzesi","Hava-yer füzesi"],"munition:BRIMSTONE":["Hava-yer füzesi","Hava-yer füzesi"],"munition:AGM-84D":["Harpoon gemi karşıtı füze","Gemi karşıtı füze"],"munition:AGM-84H":["SLAM-ER kara/gemi taarruz füzesi","Hava-yer füzesi"],"munition:AGM-158A":["JASSM seyir füzesi","Seyir füzesi"],"munition:AGM-158B":["JASSM-ER seyir füzesi","Seyir füzesi"],"munition:KEPD-350":["Taurus seyir füzesi","Seyir füzesi"],"munition:STORM-SHADOW":["Seyir füzesi","Seyir füzesi"],"munition:SOM-A":["SOM seyir füzesi","Seyir füzesi"],"munition:SOM-J":["SOM-J seyir füzesi (iç bölmeye uygun)","Seyir füzesi"],"munition:MK-81":["250 lb genel maksat bombası","Genel maksat bombası"],"munition:MK-82":["500 lb genel maksat bombası","Genel maksat bombası"],"munition:MK-82AIR":["500 lb yavaşlatıcılı genel maksat bombası (BSU-49)","Genel maksat bombası"],"munition:MK-83":["1000 lb genel maksat bombası","Genel maksat bombası"],"munition:MK-84":["2000 lb genel maksat bombası","Genel maksat bombası"],"munition:MK-84AIR":["2000 lb yavaşlatıcılı genel maksat bombası (BSU-50)","Genel maksat bombası"],"munition:BLU-109":["2000 lb nüfuz edici bomba gövdesi","Nüfuz edici bomba"],"munition:BLU-110":["1000 lb ısıl korumalı bomba gövdesi","Genel maksat bombası"],"munition:BLU-111":["500 lb ısıl korumalı bomba gövdesi","Genel maksat bombası"],"munition:GBU-10":["Paveway II lazer güdümlü bomba (MK-84)","Lazer güdümlü bomba"],"munition:GBU-12":["Paveway II lazer güdümlü bomba (MK-82)","Lazer güdümlü bomba"],"munition:GBU-16":["Paveway II lazer güdümlü bomba (MK-83)","Lazer güdümlü bomba"],"munition:GBU-24":["Paveway III lazer güdümlü bomba (2000 lb)","Lazer güdümlü bomba"],"munition:GBU-27":["Paveway III lazer güdümlü nüfuz edici bomba","Lazer güdümlü bomba"],"munition:GBU-28":["5000 lb lazer güdümlü nüfuz edici bomba","Lazer güdümlü bomba"],"munition:GBU-54":["Lazer JDAM (MK-82)","Lazer güdümlü bomba"],"munition:GBU-31":["JDAM (MK-84 / BLU-109)","GPS/INS güdümlü bomba"],"munition:GBU-32":["JDAM (MK-83)","GPS/INS güdümlü bomba"],"munition:GBU-38":["JDAM (MK-82)","GPS/INS güdümlü bomba"],"munition:GBU-39":["SDB küçük çaplı bomba","GPS/INS güdümlü bomba"],"munition:GBU-53":["SDB II küçük çaplı bomba","GPS/INS güdümlü bomba"],"munition:HGK-82":["Hassas güdüm kiti (MK-82)","Güdüm kiti (yerli)"],"munition:HGK-83":["Hassas güdüm kiti (MK-83)","Güdüm kiti (yerli)"],"munition:HGK-84":["Hassas güdüm kiti (MK-84)","Güdüm kiti (yerli)"],"munition:KGK-82":["Kanatlı güdüm kiti (MK-82)","Güdüm kiti (yerli)"],"munition:KGK-83":["Kanatlı güdüm kiti (MK-83)","Güdüm kiti (yerli)"],"munition:TEBER-81":["Lazer/GPS güdüm kiti (MK-81)","Güdüm kiti (yerli)"],"munition:TEBER-82":["Lazer/GPS güdüm kiti (MK-82)","Güdüm kiti (yerli)"],"munition:CBU-87":["Kombine etkili misket bombası","Misket bombası"],"munition:CBU-89":["Gator mayın atar misket bombası","Misket bombası"],"munition:CBU-97":["Algılayıcı tapalı misket bombası","Misket bombası"],"munition:CBU-103":["Rüzgâr düzeltmeli CBU-87","Misket bombası"],"munition:CBU-105":["Rüzgâr düzeltmeli CBU-97","Misket bombası"],"munition:HYDRA-70":["2,75 inç güdümsüz roket","Roket"],"munition:APKWS":["2,75 inç lazer güdümlü roket","Roket"],"munition:ZUNI":["5 inç güdümsüz roket","Roket"],"munition:CIRIT":["2,75 inç lazer güdümlü roket","Roket"],"munition:BDU-33":["25 lb eğitim bombası","Eğitim bombası"],"munition:MK-106":["5 lb eğitim bombası","Eğitim bombası"],"munition:BDU-50":["500 lb eğitim bombası (MK-82 benzeri)","Eğitim bombası"],"munition:BDU-56":["2000 lb eğitim bombası (MK-84 benzeri)","Eğitim bombası"],"munition:FT-300":["300 galon harici yakıt tankı","Yakıt tankı"],"munition:FT-370":["370 galon harici yakıt tankı","Yakıt tankı"],"munition:FT-600":["600 galon harici yakıt tankı","Yakıt tankı"],"munition:AN/AAQ-33":["Sniper hedefleme podu","Hedefleme podu"],"munition:AN/AAQ-28":["LITENING hedefleme podu","Hedefleme podu"],"munition:AN/AAQ-14":["LANTIRN hedefleme podu","Hedefleme podu"],"munition:ASELPOD":["ASELPOD hedefleme podu","Hedefleme podu"],"munition:AN/AAQ-13":["LANTIRN navigasyon podu","Diğer pod"],"munition:AN/ASQ-213":["HARM hedefleme sistemi podu","Diğer pod"],"munition:DB-110":["Keşif podu","Diğer pod"],"munition:ACMI":["Eğitim / muharebe manevra kayıt podu","Diğer pod"],"munition:AN/ALQ-131":["Elektronik harp podu","Elektronik harp podu"],"munition:AN/ALQ-184":["Elektronik harp podu","Elektronik harp podu"],"rack:MAU-12":["Bomba askı rafı (pilon içi)",""],"rack:BRU-32":["Bomba ejektör rafı",""],"rack:LAU-129":["Füze lançeri (AIM-9 / AIM-120)",""],"rack:LAU-127":["Füze lançeri (AIM-9 / AIM-120)",""],"rack:LAU-114":["AIM-9 lançeri",""],"rack:LAU-7":["AIM-9 lançeri",""],"rack:LAU-106":["AIM-7 / AIM-120 ejektör lançeri",""],"rack:LAU-117":["Tekli AGM-65 lançeri",""],"rack:LAU-88":["Üçlü AGM-65 lançeri",""],"rack:LAU-118":["AGM-88 lançeri",""],"rack:LAU-61":["19 tüplü 2,75 inç roket lançeri",""],"rack:LAU-68":["7 tüplü 2,75 inç roket lançeri",""],"rack:LAU-131":["7 tüplü 2,75 inç roket lançeri",""],"rack:LAU-10":["4 tüplü 5 inç roket lançeri",""],"rack:SUU-20":["Eğitim bombası dağıtıcısı",""],"subrack:TER-9":["TER-9/A üçlü ejektör rack",""],"subrack:BRU-42":["Geliştirilmiş üçlü ejektör rack (ITER)",""],"subrack:MER-10":["MER-10N çoklu ejektör rack",""],"subrack:BRU-41":["Geliştirilmiş çoklu ejektör rack (IMER)",""],"subrack:BRU-33":["Eğik dikey ejektör rack (CVER)",""],"subrack:BRU-55":["Akıllı çift ejektör rack",""],"subrack:BRU-57":["Akıllı çift ejektör rack",""],"subrack:BRU-61":["GBU-39 / GBU-53 dörtlü taşıyıcı",""],"gun:M61A1":["Vulcan 20 mm altı namlulu top",""],"gun:M61A2":["Hafifletilmiş Vulcan 20 mm top",""],"gun:M39":["20 mm revolver top",""],"gun:SUU-23":["20 mm harici top podu (GAU-4)",""],"gun:GAU-22/A":["25 mm dört namlulu top",""],"gun:GAU-12/U":["Equalizer 25 mm beş namlulu top",""],"gun:GAU-8/A":["Avenger 30 mm yedi namlulu top",""],"gun:GPU-5/A":["30 mm harici top podu",""],"gun:BK-27":["Mauser 27 mm revolver top",""],"gun:DEFA 554":["30 mm revolver top",""],"gun:GIAT 30":["30 mm revolver top (30M791)",""],"gun:GSh-23":["23 mm çift namlulu top",""],"gun:GSh-30-1":["30 mm tek namlulu top",""],"ammo:M56A3":["20 mm yüksek infilaklı yakıcı","HEI"],"ammo:M55A2":["20 mm eğitim mermisi","TP"],"ammo:M53":["20 mm zırh delici yakıcı","API"],"ammo:M220":["20 mm izli eğitim mermisi","TP-T"],"ammo:PGU-28/B":["20 mm yarı zırh delici yüksek infilaklı yakıcı","SAPHEI"],"ammo:PGU-27/A":["20 mm eğitim mermisi","TP"],"ammo:PGU-30/A":["20 mm izli eğitim mermisi","TP-T"],"ammo:PGU-20/U":["25 mm zırh delici yakıcı","API"],"ammo:PGU-23/U":["25 mm eğitim mermisi","TP"],"ammo:PGU-25/U":["25 mm yüksek infilaklı yakıcı","HEI"],"ammo:PGU-32/U":["25 mm yarı zırh delici yüksek infilaklı yakıcı","SAPHEI-T"],"ammo:PGU-47/U":["25 mm zırh delici patlayıcı","APEX"],"ammo:PGU-13/B":["30 mm yüksek infilaklı yakıcı","HEI"],"ammo:PGU-14/B":["30 mm zırh delici yakıcı","API"],"ammo:PGU-15/B":["30 mm eğitim mermisi","TP"],"ammo:27x145 HE":["27 mm yüksek infilaklı","HE"],"ammo:27x145 TP":["27 mm eğitim mermisi","TP"],"ammo:30x113 HEI":["30 mm yüksek infilaklı yakıcı (DEFA)","HEI"],"ammo:30x113 TP":["30 mm eğitim mermisi (DEFA)","TP"],"ammo:30x150 HE":["30 mm yüksek infilaklı (GIAT 30)","HE"],"ammo:23x115 HEI":["23 mm yüksek infilaklı yakıcı (OFZ)","HEI"],"ammo:30x165 HEI":["30 mm yüksek infilaklı yakıcı (OFZ)","HEI"]};

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
    translateLegacyCatalog: translateLegacyCatalog,
    upgradeCatalog: upgradeCatalog,
    newPreset: newPreset,
    cloneLoads: cloneLoads,
    expandLoads: expandLoads,
    presetUsage: presetUsage,
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
