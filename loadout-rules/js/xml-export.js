/*
 * XML dışa aktarım katmanı.
 *
 * Her exporter { label, fileExtension, exportProject(project, model) -> string } biçimindedir.
 * Hedef yazılımın XML formatı netleştiğinde EXPORTERS içine yeni bir giriş eklenir;
 * kural tanımlama arayüzü ve veri modeli değişmeden kalır.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoadoutXml = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeXml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /* Basit XML düğüm kurucu: el(tag, attrs, children). Boş/undefined özellikler atlanır. */
  function el(tag, attrs, children) {
    return { tag: tag, attrs: attrs || {}, children: (children || []).filter(Boolean) };
  }

  function serialize(node, indent) {
    indent = indent || '';
    const attrs = Object.keys(node.attrs)
      .filter(function (k) { return node.attrs[k] !== undefined && node.attrs[k] !== null && node.attrs[k] !== ''; })
      .map(function (k) { return ' ' + k + '="' + escapeXml(node.attrs[k]) + '"'; })
      .join('');
    if (!node.children.length) return indent + '<' + node.tag + attrs + '/>';
    if (node.children.length === 1 && typeof node.children[0] === 'string') {
      return indent + '<' + node.tag + attrs + '>' + escapeXml(node.children[0]) + '</' + node.tag + '>';
    }
    const inner = node.children.map(function (c) {
      return typeof c === 'string' ? indent + '  ' + escapeXml(c) : serialize(c, indent + '  ');
    }).join('\n');
    return indent + '<' + node.tag + attrs + '>\n' + inner + '\n' + indent + '</' + node.tag + '>';
  }

  function toDocument(rootNode) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + serialize(rootNode) + '\n';
  }

  /* ------------------------------------------------------------ genel format */

  const TAG_BY_KIND = { munition: 'Munition', rack: 'Rack', subrack: 'Subrack', gun: 'Gun', ammo: 'Ammo' };

  function genericExport(project, model) {
    const codeOf = function (kind, id) {
      const s = model.findStore(project, kind, id);
      return s ? s.code : '';
    };

    const storeEl = function (kind, s) {
      return el(TAG_BY_KIND[kind], {
        code: s.code,
        name: s.name,
        category: kind === 'munition' ? s.category : undefined,
        type: kind === 'ammo' ? s.category : undefined,
        caliber: kind === 'gun' || kind === 'ammo' ? s.caliber : undefined,
        positions: kind === 'rack' || kind === 'subrack' ? s.positions : undefined,
        capacity: kind === 'gun' ? s.positions : undefined,
      }, s.notes ? [el('Notes', {}, [s.notes])] : []);
    };

    const loadEl = function (node) {
      return el('Allow', {
        type: node.kind.toUpperCase(),
        ref: codeOf(node.kind, node.refId),
        maxQty: node.qty,
      }, (node.children || []).map(loadEl));
    };

    const aircraftEl = function (ac) {
      const stationCode = {};
      ac.stations.forEach(function (s) { stationCode[s.id] = s.code; });
      return el('Aircraft', { code: ac.code, name: ac.name }, [
        ac.notes ? el('Notes', {}, [ac.notes]) : null,
        el('Stations', {}, ac.stations.map(function (st) {
          return el('Station', {
            code: st.code,
            type: st.type === 'GUN' ? 'GUN' : undefined,
            parent: st.parentId ? stationCode[st.parentId] : undefined,
            name: st.name,
            location: st.location,
          }, st.loads.map(loadEl));
        })),
        ac.constraints.length ? el('Constraints', {}, ac.constraints.map(function (c) {
          return el('Constraint', {
            type: c.type,
            munition: c.type === 'MAX_TOTAL' ? codeOf('munition', c.munitionId) : undefined,
            value: c.type === 'MAX_TOTAL' ? c.value : undefined,
          }, [
            c.description ? el('Description', {}, [c.description]) : null,
          ].concat(c.stationIds.map(function (id) { return el('StationRef', { code: stationCode[id] }); })));
        })) : null,
      ]);
    };

    return toDocument(el('LoadingRules', { project: project.name, schemaVersion: project.schemaVersion }, [
      el('Catalog', {}, [
        el('Munitions', {}, project.catalog.munitions.map(function (s) { return storeEl('munition', s); })),
        el('Racks', {}, project.catalog.racks.map(function (s) { return storeEl('rack', s); })),
        el('Subracks', {}, project.catalog.subracks.map(function (s) { return storeEl('subrack', s); })),
        el('Guns', {}, project.catalog.guns.map(function (s) { return storeEl('gun', s); })),
        el('Ammunition', {}, project.catalog.ammo.map(function (s) { return storeEl('ammo', s); })),
      ]),
      el('AircraftList', {}, project.aircraft.map(aircraftEl)),
    ]));
  }

  const EXPORTERS = {
    generic: {
      label: 'Genel XML (geçici format)',
      fileExtension: 'xml',
      exportProject: genericExport,
    },
    // target: { label: 'Hedef yazılım formatı', fileExtension: 'xml', exportProject: function (project, model) { ... } },
  };

  return {
    EXPORTERS: EXPORTERS,
    escapeXml: escapeXml,
    el: el,
    serialize: serialize,
    toDocument: toDocument,
  };
});
