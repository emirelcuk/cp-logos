/*
 * User interface. No dependencies; works when the file is opened directly in a browser (file://).
 * Text fields update state in place (no re-render, focus is kept);
 * structural changes (add/delete/select) re-render the view.
 */
(function () {
  'use strict';

  const M = window.LoadoutModel;
  const X = window.LoadoutXml;
  const SH = window.AircraftShapes;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'loadout-rules.project.v1';

  const state = {
    project: null,
    view: 'aircraft',
    catalogKind: 'munition',
    catalogFilter: '',
    catalogGroup: '',
    presetId: null,
    matrixKinds: ['munition', 'ammo', 'gun'],
    matrixFilter: '',
    aircraftId: null,
    stationId: null,
    exporter: 'generic',
  };

  /* ------------------------------------------------------------ helpers */

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (k === 'class') node.className = v;
      else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'selected') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    const append = function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(append); return; }
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    };
    append(children);
    return node;
  }

  function svg(tag, attrs, children) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === undefined || attrs[k] === null) return;
      if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    [].concat(children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  // 24x24 line icons.
  const ICONS = {
    plane: 'M12 2l1.6 6.5L21 13v2l-7.3-2-.9 5.6L15 20v1.5l-3-.9-3 .9V20l2.2-1.4-.9-5.6L3 15v-2l7.4-4.5z',
    box: 'M3 7.5l9-4.5 9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
    check: 'M8.5 12.5l2.5 2.5 4.5-5M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6',
    open: 'M3 6.5h6l2 2h10V19H3z',
    save: 'M5 3.5h11l3.5 3.5v13.5H5zM8 3.5v5h8v-5M8 14h8v6.5H8z',
    file: 'M6 3h8l4 4v14H6zM14 3v4h4',
    spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    copy: 'M9 9h11v11H9zM5 15V4h11',
    download: 'M12 4v11M7 10.5l5 5 5-5M4 20h16',
    target: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4',
    alert: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.2v.3',
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13M20 20l-4.8-4.8',
    link: 'M10 14l4-4M8.5 15.5l-2 2a3.2 3.2 0 0 1-4.5-4.5l3.5-3.5a3.2 3.2 0 0 1 4.5 0M15.5 8.5l2-2a3.2 3.2 0 0 1 4.5 4.5l-3.5 3.5a3.2 3.2 0 0 1-4.5 0',
    info: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 11v6M12 7.5v.3',
    undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
    table: 'M3.5 4.5h17v15h-17zM3.5 9.5h17M3.5 14.5h17M9.5 4.5v15',
    print: 'M7 9V3.5h10V9M7 17H4.5V9.5h15V17H17M7 14h10v6.5H7z',
    mirror: 'M12 3v18M8 7l-5 5 5 5V7zM16 7l5 5-5 5V7z',
    close: 'M6 6l12 12M18 6L6 18',
    duplicate: 'M8 8h12v12H8zM4 16V4h12M14 11v6M11 14h6',
  };

  function icon(name, cls) {
    const filled = name === 'plane';
    return svg('svg', { viewBox: '0 0 24 24', class: 'icon' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, [
      svg('path', { d: ICONS[name], fill: filled ? 'currentColor' : 'none', stroke: filled ? 'none' : 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    ]);
  }

  function btn(label, opts) {
    opts = opts || {};
    return h('button', { class: (opts.class || '') + (label ? '' : ' icon-only'), title: opts.title || (label ? undefined : opts.aria), 'aria-label': opts.aria, onclick: opts.onclick, disabled: opts.disabled },
      [opts.icon ? icon(opts.icon) : null, label ? h('span', {}, label) : null]);
  }

  /*
   * Undo / redo: on every save (a 250 ms burst of changes) the previous snapshot is pushed on the stack.
   * File: with the File System Access API the same file is overwritten; otherwise it is downloaded.
   */
  const history = { undo: [], redo: [], last: null, limit: 150 };
  const fileState = { handle: null, name: '', saved: null };

  function commitHistory(cur) {
    if (history.last !== null && cur !== history.last) {
      history.undo.push(history.last);
      if (history.undo.length > history.limit) history.undo.shift();
      history.redo = [];
    }
    history.last = cur;
    updateTopbar();
  }

  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const cur = JSON.stringify(state.project);
    commitHistory(cur);
    try { localStorage.setItem(STORAGE_KEY, cur); } catch (e) { /* storage may be disabled */ }
  }

  function restore(json) {
    history.last = json;
    state.project = JSON.parse(json);
    try { localStorage.setItem(STORAGE_KEY, json); } catch (e) { /* storage may be disabled */ }
    render();
    updateTopbar();
  }

  function undo() {
    if (saveTimer) saveNow();
    if (!history.undo.length) return;
    history.redo.push(history.last);
    restore(history.undo.pop());
    toast('Undone.');
  }

  function redo() {
    if (saveTimer) saveNow();
    if (!history.redo.length) return;
    history.undo.push(history.last);
    restore(history.redo.pop());
    toast('Redone.');
  }

  function updateTopbar() {
    const u = document.querySelector('[data-action=undo]');
    const r = document.querySelector('[data-action=redo]');
    if (u) u.disabled = !history.undo.length;
    if (r) r.disabled = !history.redo.length;
    const fileEl = document.getElementById('file-status');
    if (!fileEl || !state.project) return;
    const dirty = fileState.saved !== null && fileState.saved !== (history.last || JSON.stringify(state.project));
    fileEl.textContent = fileState.name ? fileState.name + (dirty ? ' •' : '') : '';
    fileEl.title = fileState.name ? (dirty ? 'There are changes not yet saved to the file' : 'File is up to date') : '';
    fileEl.className = 'file-status' + (dirty ? ' dirty' : '') + (fileState.name ? '' : ' hidden');
  }

  const FILE_TYPES = [{ description: 'Loadout rules project (JSON)', accept: { 'application/json': ['.json'] } }];

  function markSaved(name) {
    if (saveTimer) saveNow();
    fileState.name = name;
    fileState.saved = JSON.stringify(state.project);
    updateTopbar();
  }

  async function saveToFile(saveAs) {
    const text = JSON.stringify(state.project, null, 2);
    const suggested = safeFileName(state.project.name) + '.json';
    if (!window.showSaveFilePicker) {
      download(suggested, text, 'application/json');
      markSaved(suggested);
      toast('Project downloaded (' + suggested + ').', 'ok');
      return;
    }
    try {
      if (!fileState.handle || saveAs) fileState.handle = await window.showSaveFilePicker({ suggestedName: suggested, types: FILE_TYPES });
      const w = await fileState.handle.createWritable();
      await w.write(text);
      await w.close();
      markSaved(fileState.handle.name);
      toast(fileState.handle.name + ' saved.', 'ok');
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Could not save: ' + e.message, 'error');
    }
  }

  async function openFromFile() {
    if (!window.showOpenFilePicker) { document.getElementById('file-input').click(); return; }
    try {
      const handles = await window.showOpenFilePicker({ types: FILE_TYPES });
      const f = await handles[0].getFile();
      setProject(JSON.parse(await f.text()));
      fileState.handle = handles[0];
      markSaved(f.name);
      toast(f.name + ' opened.', 'ok');
    } catch (e) {
      if (e && e.name !== 'AbortError') toast('Could not read the file: ' + e.message, 'error');
    }
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }
  window.addEventListener('pagehide', function () { if (saveTimer) saveNow(); });

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? M.normalizeProject(JSON.parse(raw)) : null;
    } catch (e) {
      return null;
    }
  }

  function changed() { persist(); renderTabs(); }
  function rerender() { persist(); render(); }

  let toastTimer = null;
  function toast(message, kind) {
    let el = document.getElementById('toast');
    if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.className = 'toast show ' + (kind || '');
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast ' + (kind || ''); }, 2600);
  }

  /* Text/number field: writes the change to the object without re-rendering. */
  function field(label, obj, key, opts) {
    opts = opts || {};
    const isNum = opts.type === 'number';
    const input = opts.multiline
      ? h('textarea', { rows: 2, value: obj[key] || '', placeholder: opts.placeholder })
      : h('input', { type: opts.type || 'text', value: obj[key] == null ? '' : obj[key], min: isNum ? (opts.min != null ? opts.min : 0) : undefined, step: opts.step, placeholder: opts.placeholder, class: opts.inputClass });
    input.addEventListener('input', function () {
      obj[key] = isNum ? (input.value === '' ? 0 : Number(input.value)) : input.value;
      changed();
      if (opts.onInput) opts.onInput();
    });
    return label ? h('label', { class: 'field' }, [h('span', {}, label), input]) : input;
  }

  function select(obj, key, options, onChange) {
    const sel = h('select', {}, options.map(function (o) {
      return h('option', { value: o.value, selected: obj[key] === o.value }, o.label);
    }));
    sel.addEventListener('change', function () {
      obj[key] = sel.value;
      if (onChange) onChange(); else changed();
    });
    return sel;
  }

  function removeFrom(list, item) {
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  }

  function confirmDelete(what) {
    return window.confirm('Delete ' + what + '?');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function safeFileName(name) {
    return (name || 'project').replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/g, '_');
  }

  function panel(title, opts, children) {
    opts = opts || {};
    return h('section', { class: 'panel ' + (opts.class || '') }, [
      title || opts.actions ? h('div', { class: 'panel-head' }, [
        opts.icon ? h('span', { class: 'panel-icon' }, icon(opts.icon)) : null,
        h('h2', {}, title),
        opts.extra || null,
        opts.actions ? h('div', { class: 'panel-actions' }, opts.actions) : null,
      ]) : null,
      children,
    ]);
  }

  /* Counts how often a store is used in load trees, presets and rules. */
  function usageCount(storeId) {
    let count = 0;
    const walk = function (n) { if (n.refId === storeId) count++; n.children.forEach(walk); };
    (state.project.presets || []).forEach(function (preset) { preset.loads.forEach(walk); });
    state.project.aircraft.forEach(function (ac) {
      ac.stations.forEach(function (st) { st.loads.forEach(walk); });
      ac.constraints.forEach(function (c) { if (c.munitionId === storeId) count++; });
    });
    return count;
  }

  function stationTitle(st) {
    if (st.type === 'GUN') return 'Gun ' + st.code;
    return (st.parentId ? 'Side station ' : 'Station ') + st.code;
  }

  function isGun(st) { return st.type === 'GUN'; }

  /* ------------------------------------------------------------ tabs */

  const TABS = [
    { id: 'aircraft', label: 'Aircraft', icon: 'plane' },
    { id: 'matrix', label: 'Matrix', icon: 'table' },
    { id: 'presets', label: 'Presets', icon: 'layers' },
    { id: 'catalog', label: 'Catalog', icon: 'box' },
    { id: 'validation', label: 'Validation', icon: 'check' },
    { id: 'xml', label: 'XML Output', icon: 'code' },
  ];

  function renderTabs() {
    const issues = M.validate(state.project);
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    const warnings = issues.length - errors;
    const tabs = document.getElementById('tabs');
    tabs.replaceChildren.apply(tabs, TABS.map(function (t) {
      return h('button', {
        class: 'tab' + (state.view === t.id ? ' active' : ''),
        onclick: function () { state.view = t.id; render(); },
      }, [
        icon(t.icon),
        h('span', {}, t.label),
        t.id === 'validation' && errors ? h('span', { class: 'badge', title: errors + ' errors' }, errors) : null,
        t.id === 'validation' && warnings ? h('span', { class: 'badge warn', title: warnings + ' warnings' }, warnings) : null,
      ]);
    }));
  }

  /* ------------------------------------------------------------ catalog */

  const CATALOG_COLUMNS = {
    munition: [['code', 'Code'], ['name', 'Name'], ['category', 'Category'], ['notes', 'Notes']],
    rack: [['code', 'Code'], ['name', 'Name'], ['positions', 'Positions', 'number'], ['notes', 'Notes']],
    subrack: [['code', 'Code'], ['name', 'Name'], ['positions', 'Positions', 'number'], ['notes', 'Notes']],
    gun: [['code', 'Code'], ['name', 'Name'], ['caliber', 'Caliber'], ['positions', 'Round capacity', 'number'], ['notes', 'Notes']],
    ammo: [['code', 'Code'], ['name', 'Name'], ['caliber', 'Caliber'], ['category', 'Type (HEI, TP…)'], ['notes', 'Notes']],
  };

  const CATALOG_HINTS = {
    munition: 'Bombs, missiles, fuel tanks, pods and other stores that can be carried.',
    rack: 'Racks and launchers fitted directly to a station. Positions: the most items it can carry at once.',
    subrack: 'Multiple carriers fitted under a rack (TER, MER, BRU…). Positions: the most items it can carry.',
    gun: 'Internal guns and gun pods. Round capacity limits the ammunition count; caliber is checked against the ammunition.',
    ammo: 'Gun ammunition. Validation warns when the caliber does not match the gun.',
  };

  function renderCatalog() {
    const kind = state.catalogKind;
    const list = state.project.catalog[M.CATALOG_KEY[kind]];
    const cols = CATALOG_COLUMNS[kind];
    const q = state.catalogFilter.trim().toLocaleLowerCase();
    // Stores are grouped by category, guns and gun ammunition by caliber.
    const groupKey = kind === 'munition' ? 'category' : (kind === 'gun' || kind === 'ammo') ? 'caliber' : null;
    const groups = groupKey ? list.map(function (s) { return s[groupKey] || '—'; }).filter(function (g, i, arr) { return arr.indexOf(g) === i; }) : [];
    const group = groups.indexOf(state.catalogGroup) >= 0 ? state.catalogGroup : '';

    const nav = panel('Catalog', { icon: 'box', class: 'nav-panel' }, h('ul', { class: 'list' }, M.KINDS.map(function (k) {
      return h('li', {
        class: k === kind ? 'selected' : '',
        onclick: function () { state.catalogKind = k; state.catalogGroup = ''; render(); },
      }, [h('i', { class: 'kind-dot ' + k }), h('span', { class: 'grow' }, M.KIND_LABELS[k]), h('span', { class: 'count' }, state.project.catalog[M.CATALOG_KEY[k]].length)]);
    })));

    const rowFor = function (s) {
      const text = cols.map(function (c) { return s[c[0]]; }).join(' ').toLocaleLowerCase();
      if (group && (s[groupKey] || '—') !== group) return null;
      return h('tr', { hidden: q && text.indexOf(q) < 0 ? true : undefined, 'data-search': text }, [
        cols.map(function (c) {
          return h('td', { class: c[2] === 'number' ? 'num' : (c[0] === 'code' ? 'code-col' : '') }, field(null, s, c[0], { type: c[2], min: c[2] === 'number' ? 1 : undefined }));
        }),
        h('td', { class: 'row-actions' }, btn('', {
          icon: 'trash', class: 'ghost danger', aria: 'Delete',
          onclick: function () {
            const used = usageCount(s.id);
            const msg = M.KIND_LABELS[kind] + ' ' + M.storeLabel(s) + (used ? ' (used in ' + used + ' places)' : '');
            if (confirmDelete(msg)) { removeFrom(list, s); rerender(); }
          },
        })),
      ]);
    };

    const search = h('label', { class: 'search' }, [
      icon('search'),
      h('input', {
        type: 'search', placeholder: 'Search…', value: state.catalogFilter,
        oninput: function (e) {
          state.catalogFilter = e.target.value;
          const qq = e.target.value.trim().toLocaleLowerCase();
          document.querySelectorAll('.catalog-table tbody tr').forEach(function (tr) {
            tr.hidden = !!qq && tr.getAttribute('data-search').indexOf(qq) < 0;
          });
        },
      }),
    ]);

    const body = panel(M.KIND_LABELS[kind] + ' definitions', {
      extra: h('span', { class: 'kind-pill ' + kind }, list.length + ' records'),
      actions: [
        search,
        btn('Add standard catalog', {
          icon: 'spark',
          title: 'Adds the missing items from the built-in definitions (MK-82, GBU-12, AIM-9, AIM-120, MAU-12, TER-9, M61A1, PGU-28/B …)',
          onclick: function () {
            const added = M.mergeStandardCatalog(state.project);
            rerender();
            toast(added ? added + ' items added to the catalog.' : 'All standard catalog items are already present.', added ? 'ok' : '');
          },
        }),
        btn('Add ' + M.KIND_LABELS[kind].toLowerCase(), { icon: 'plus', class: 'primary', onclick: function () { list.push(M.newStore(kind)); rerender(); } }),
      ],
    }, [
      h('p', { class: 'hint' }, CATALOG_HINTS[kind]),
      groups.length > 1 ? h('div', { class: 'group-chips' }, [
        h('button', { class: 'small group-chip' + (group ? '' : ' on'), onclick: function () { state.catalogGroup = ''; render(); } }, ['All ', h('span', { class: 'count' }, list.length)]),
        groups.map(function (g) {
          const n = list.filter(function (s) { return (s[groupKey] || '—') === g; }).length;
          return h('button', { class: 'small group-chip' + (g === group ? ' on' : ''), onclick: function () { state.catalogGroup = g; render(); } }, [g + ' ', h('span', { class: 'count' }, n)]);
        }),
      ]) : null,
      list.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'catalog-table' }, [
          h('thead', {}, h('tr', {}, cols.map(function (c) { return h('th', {}, c[1]); }).concat([h('th', {}, '')]))),
          h('tbody', {}, list.map(rowFor)),
        ]))
        : emptyState('box', 'No records yet', 'Start with "Add ' + M.KIND_LABELS[kind].toLowerCase() + '" or "Add standard catalog".'),
    ]);

    return h('div', { class: 'layout' }, [nav, body]);
  }

  function emptyState(iconName, title, text) {
    return h('div', { class: 'empty-state' }, [icon(iconName), h('b', {}, title), text ? h('span', {}, text) : null]);
  }

  /* ------------------------------------------------------------ aircraft */

  function currentAircraft() {
    const list = state.project.aircraft;
    let ac = list.find(function (a) { return a.id === state.aircraftId; });
    if (!ac && list.length) { ac = list[0]; state.aircraftId = ac.id; }
    return ac || null;
  }

  function currentStation(ac) {
    if (!ac) return null;
    let st = ac.stations.find(function (s) { return s.id === state.stationId; });
    if (!st && ac.stations.length) { st = ac.stations[0]; state.stationId = st.id; }
    return st || null;
  }

  function counts(ac) {
    const c = { main: 0, side: 0, gun: 0 };
    ac.stations.forEach(function (s) { if (isGun(s)) c.gun++; else if (s.parentId) c.side++; else c.main++; });
    return c;
  }

  function miniSilhouette(ac) {
    const d = SH.outlinePath(ac.silhouette);
    return svg('svg', { viewBox: '0 0 400 500', class: 'mini-plane', 'aria-hidden': 'true' }, d ? [svg('path', { d: d })] : [svg('circle', { cx: 200, cy: 250, r: 120 })]);
  }

  function renderAircraft() {
    const ac = currentAircraft();
    const nav = panel('Aircraft', {
      icon: 'plane', class: 'nav-panel',
      actions: [btn('', {
        icon: 'plus', class: 'primary small', aria: 'Add aircraft',
        onclick: function () {
          const a = M.newAircraft();
          a.code = 'AIRCRAFT-' + (state.project.aircraft.length + 1);
          state.project.aircraft.push(a);
          state.aircraftId = a.id; state.stationId = null;
          rerender();
        },
      })],
    }, state.project.aircraft.length
      ? h('ul', { class: 'aircraft-list' }, state.project.aircraft.map(function (a) {
        const c = counts(a);
        return h('li', {
          class: ac && a.id === ac.id ? 'selected' : '',
          onclick: function () { state.aircraftId = a.id; state.stationId = null; render(); },
        }, [
          miniSilhouette(a),
          h('div', { class: 'ac-meta' }, [
            h('b', { class: 'ac-code' }, a.code || '(no code)'),
            a.name ? h('span', { class: 'ac-name' }, a.name) : null,
            h('span', { class: 'ac-counts' }, c.main + ' stations' + (c.side ? ' · ' + c.side + ' side' : '') + (c.gun ? ' · ' + c.gun + ' gun' : '')),
          ]),
        ]);
      }))
      : emptyState('plane', 'No aircraft yet', 'Add the first one with +.'));

    if (!ac) return h('div', { class: 'layout' }, [nav, h('div', {}, panel('', {}, emptyState('plane', 'No aircraft selected', 'Add an aircraft on the left to start.')))]);

    if (SH.arrangeStations(ac)) persist();
    const st = currentStation(ac);
    return h('div', { class: 'layout' }, [nav, h('div', { class: 'content' }, [
      renderAircraftInfo(ac),
      h('div', { class: 'stage' }, [
        renderDrawing(ac, st),
        st ? renderStationPanel(ac, st) : panel('', {}, emptyState('target', 'No stations', 'Add stations with the buttons below the drawing.')),
      ]),
      renderStations(ac, st),
      renderConstraints(ac),
    ])]);
  }

  function renderAircraftInfo(ac) {
    const shapeOptions = Object.keys(SH.SHAPES).map(function (k) { return { value: k, label: SH.SHAPES[k].label }; });
    const c = counts(ac);
    const stat = function (value, label) { return h('div', { class: 'stat' }, [h('b', {}, value), h('span', {}, label)]); };
    return panel(ac.name || ac.code || 'Aircraft', {
      class: 'aircraft-info',
      extra: h('div', { class: 'stats' }, [
        stat(c.main, 'stations'), stat(c.side, 'side stations'), stat(c.gun, 'guns'), stat(ac.constraints.length, 'rules'),
      ]),
      actions: [btn('Duplicate', {
        icon: 'duplicate', class: 'small',
        title: 'Copy the aircraft with all its stations, loads and rules (e.g. to create a variant)',
        onclick: function () {
          const copy = M.duplicateAircraft(ac);
          const i = state.project.aircraft.indexOf(ac);
          state.project.aircraft.splice(i + 1, 0, copy);
          state.aircraftId = copy.id; state.stationId = null;
          rerender();
          toast(copy.code + ' created.', 'ok');
        },
      }), btn('', {
        icon: 'trash', class: 'ghost danger', aria: 'Delete aircraft',
        onclick: function () {
          if (confirmDelete('aircraft ' + (ac.code || '(no code)'))) {
            removeFrom(state.project.aircraft, ac); state.aircraftId = null; rerender();
          }
        },
      })],
    }, [
      h('div', { class: 'grid4' }, [
        field('Code', ac, 'code', { onInput: renderNavLater }),
        field('Name', ac, 'name'),
        h('label', { class: 'field' }, [
          h('span', {}, 'Drawing'),
          select(ac, 'silhouette', shapeOptions, function () { SH.applyAutoLayout(ac); rerender(); }),
        ]),
        field('Notes', ac, 'notes', { placeholder: 'Optional' }),
      ]),
    ]);
  }

  // Updates the name in the list on the left while the aircraft code is typed, keeping focus.
  function renderNavLater() {
    const ac = currentAircraft();
    const b = document.querySelector('.aircraft-list li.selected .ac-code');
    if (b && ac) b.textContent = ac.code || '(no code)';
  }

  /* ---- aircraft drawing */

  function loadLines(st) {
    const lines = [];
    const walk = function (n, depth) {
      const store = M.findStore(state.project, n.kind, n.refId);
      if (n.kind === 'preset') {
        lines.push({ depth: depth, kind: 'preset', text: 'Preset ' + (store ? store.code : '?') });
        if (store) store.loads.forEach(function (c) { walk(c, depth + 1); });
        return;
      }
      lines.push({ depth: depth, kind: n.kind, text: (store ? store.code : '?') + (n.qty > 1 ? ' ×' + n.qty : '') });
      n.children.forEach(function (c) { walk(c, depth + 1); });
    };
    st.loads.forEach(function (n) { walk(n, 0); });
    return lines;
  }

  let tooltipEl = null;
  function showTooltip(st, evt) {
    if (!tooltipEl) { tooltipEl = h('div', { class: 'map-tooltip', role: 'tooltip' }); document.body.appendChild(tooltipEl); }
    const lines = loadLines(st);
    tooltipEl.replaceChildren(
      h('div', { class: 'tt-head' }, [h('b', {}, stationTitle(st)), st.name ? h('span', {}, st.name) : null]),
      lines.length
        ? h('ul', {}, lines.slice(0, 14).map(function (l) {
          return h('li', { style: 'padding-left:' + (l.depth * 12) + 'px' }, [h('i', { class: 'kind-dot ' + l.kind }), l.text]);
        }).concat(lines.length > 14 ? [h('li', { class: 'more' }, '+' + (lines.length - 14) + ' more')] : []))
        : h('div', { class: 'tt-empty' }, 'No loads allowed yet')
    );
    tooltipEl.classList.add('show');
    moveTooltip(evt);
  }
  function moveTooltip(evt) {
    if (!tooltipEl) return;
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = tooltipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
  }
  function hideTooltip() { if (tooltipEl) tooltipEl.classList.remove('show'); }
  // pointerleave can be missed when a marker is re-rendered; hide whenever the pointer leaves markers.
  document.addEventListener('pointermove', function (e) {
    if (tooltipEl && tooltipEl.classList.contains('show') && !(e.target.closest && e.target.closest('.aircraft-svg .station'))) hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, { passive: true });

  function renderDrawing(ac, selected) {
    const V = SH.VIEW;
    const shape = SH.shapeOf(ac.silhouette);
    const root = svg('svg', { viewBox: '0 0 ' + V.width + ' ' + V.height, class: 'aircraft-svg', role: 'img', 'aria-label': (ac.code || 'Aircraft') + ' station layout' });

    root.appendChild(svg('defs', {}, [
      svg('pattern', { id: 'grid-s', width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, [svg('path', { d: 'M10 0H0V10', class: 'grid-minor' })]),
      svg('pattern', { id: 'grid-l', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, [
        svg('rect', { width: 50, height: 50, fill: 'url(#grid-s)' }),
        svg('path', { d: 'M50 0H0V50', class: 'grid-major' }),
      ]),
      svg('linearGradient', { id: 'airframe-fill', x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg('stop', { offset: '0', class: 'af-stop-1' }),
        svg('stop', { offset: '1', class: 'af-stop-2' }),
      ]),
    ]));
    root.appendChild(svg('rect', { width: V.width, height: V.height, fill: 'url(#grid-l)' }));
    root.appendChild(svg('line', { x1: V.cx, y1: 4, x2: V.cx, y2: V.height - 4, class: 'centerline' }));
    const outline = SH.outlinePath(ac.silhouette);
    if (outline) root.appendChild(svg('path', { d: outline, class: 'airframe' }));
    shape.fins.forEach(function (f) {
      root.appendChild(svg('line', { x1: V.cx + f.x, y1: f.y1, x2: V.cx + f.x, y2: f.y2, class: 'fin' }));
    });
    if (shape.prop) root.appendChild(svg('line', { x1: V.cx - shape.prop.half, y1: shape.prop.y, x2: V.cx + shape.prop.half, y2: shape.prop.y, class: 'prop' }));
    if (shape.canopy) root.appendChild(svg('ellipse', { cx: V.cx, cy: shape.canopy.y, rx: shape.canopy.rx, ry: shape.canopy.ry, class: 'canopy' }));
    root.appendChild(svg('text', { x: 12, y: 22, class: 'drawing-caption' }, (ac.code || 'AIRCRAFT') + ' · TOP VIEW'));
    root.appendChild(svg('text', { x: 12, y: V.height - 12, class: 'drawing-caption' }, 'LEFT'));
    root.appendChild(svg('text', { x: V.width - 12, y: V.height - 12, class: 'drawing-caption', 'text-anchor': 'end' }, 'RIGHT'));

    // Side stations first so that main stations are drawn on top of them.
    const ordered = ac.stations.filter(function (s) { return s.parentId; }).concat(ac.stations.filter(function (s) { return !s.parentId; }));
    ordered.forEach(function (st) {
      const isSel = selected && st.id === selected.id;
      const isSide = !!st.parentId;
      const gun = isGun(st);
      const cls = 'station' + (isSide ? ' side' : '') + (gun ? ' gun' : '') + (st.loads.length ? ' loaded' : ' empty') + (isSel ? ' selected' : '');
      const r = isSide ? 7 : 10;
      let labelY = st.location === 'CENTER' || st.y < 60 ? 27 : -17;
      if (isSide) labelY = 21;
      if (gun) labelY = -16;
      const mark = gun
        ? svg('rect', { x: -8, y: -8, width: 16, height: 16, rx: 2, transform: 'rotate(45)', class: 'mark' })
        : svg('circle', { r: r, class: 'mark' });
      const g = svg('g', { class: cls, transform: 'translate(' + st.x + ',' + st.y + ')', tabindex: 0, role: 'button', 'aria-label': stationTitle(st) }, [
        svg('circle', { r: r + 8, class: 'hit' }),
        isSel ? svg('circle', { r: r + 9, class: 'halo' }) : null,
        mark,
        svg('text', { y: labelY, 'text-anchor': 'middle' }, st.code),
      ]);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.stationId = st.id; render(); }
      });
      g.addEventListener('pointerenter', function (e) { showTooltip(st, e); });
      g.addEventListener('pointermove', moveTooltip);
      g.addEventListener('pointerleave', hideTooltip);
      makeDraggable(root, g, st, ac);
      root.appendChild(g);
    });

    const addButton = function (loc, label) {
      return btn(label, { icon: 'plus', class: 'small', onclick: function () { addStation(ac, loc); } });
    };
    const c = counts(ac);

    return panel('Layout', {
      class: 'drawing',
      extra: h('span', { class: 'muted small-text' }, c.main + ' stations' + (c.gun ? ' · ' + c.gun + ' gun' : '')),
      actions: [btn('Auto layout', {
        icon: 'grid', class: 'small ghost',
        title: 'Re-space the stations evenly on the drawing',
        onclick: function () { SH.applyAutoLayout(ac); rerender(); toast('Stations re-arranged.'); },
      })],
    }, [
      h('div', { class: 'svg-frame' }, root),
      h('div', { class: 'legend' }, [
        h('span', {}, [h('i', { class: 'dot loaded' }), 'Loads allowed']),
        h('span', {}, [h('i', { class: 'dot none' }), 'Undefined']),
        h('span', {}, [h('i', { class: 'dot gun' }), 'Gun']),
        h('span', { class: 'legend-hint' }, 'Click: select · Drag: move'),
      ]),
      h('div', { class: 'add-row' }, [
        addButton('LEFT', 'Left wing'),
        addButton('CENTER', 'Fuselage'),
        addButton('RIGHT', 'Right wing'),
        btn('Gun (GUN)', { icon: 'target', class: 'small gun-btn', onclick: function () { addGunStation(ac); } }),
      ]),
    ]);
  }

  /*
   * Dragging a station marker moves it; a click without movement selects it.
   * Side stations move together with their main station. Numbers are refreshed on drop.
   */
  function makeDraggable(svgRoot, g, st, ac) {
    g.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      hideTooltip();
      const ctm = svgRoot.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      const toSvg = function (ev) {
        const p = svgRoot.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
        return p.matrixTransform(inv);
      };
      const start = toSvg(e);
      const followers = [st].concat(st.parentId || isGun(st) ? [] : SH.sidesOf(ac, st));
      const origins = followers.map(function (s) { return { x: s.x, y: s.y }; });
      let moved = false;
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');

      const onMove = function (ev) {
        const p = toSvg(ev);
        const dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
        hideTooltip();
        followers.forEach(function (s, i) {
          s.x = clamp(Math.round(origins[i].x + dx), 8, SH.VIEW.width - 8);
          s.y = clamp(Math.round(origins[i].y + dy), 8, SH.VIEW.height - 8);
        });
        svgRoot.querySelectorAll('.station').forEach(function (node) {
          const s = node.__station;
          if (s && followers.indexOf(s) >= 0) node.setAttribute('transform', 'translate(' + s.x + ',' + s.y + ')');
        });
      };
      const onUp = function () {
        g.removeEventListener('pointermove', onMove);
        g.removeEventListener('pointerup', onUp);
        g.removeEventListener('pointercancel', onUp);
        hideTooltip();
        if (moved) SH.arrangeStations(ac);
        state.stationId = st.id;
        rerender();
      };
      g.addEventListener('pointermove', onMove);
      g.addEventListener('pointerup', onUp);
      g.addEventListener('pointercancel', onUp);
    });
    g.__station = st;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /*
   * Adds a main station: outermost on the left wing (becomes number 1), outermost on the right wing,
   * rearmost on the fuselage; stations in the same group are re-spaced and renumbered.
   */
  function addStation(ac, location) {
    const s = M.newStation();
    s.location = location;
    if (location === 'LEFT') ac.stations.unshift(s); else ac.stations.push(s);
    SH.applyAutoLayout(ac, [location]);
    state.stationId = s.id;
    rerender();
  }

  function addGunStation(ac) {
    const s = Object.assign(M.newStation(), { type: 'GUN', name: 'Internal gun' });
    ac.stations.push(s);
    SH.ensurePositions(ac);
    SH.arrangeStations(ac);
    state.stationId = s.id;
    rerender();
  }

  /* Adds a side station (e.g. 5L, 5R) to a main station. */
  function addSideStation(ac, parent, suffix) {
    suffix = String(suffix || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(suffix)) { toast('The suffix must be 1-3 letters/digits (e.g. L, R, A).', 'error'); return; }
    if (SH.sidesOf(ac, parent).some(function (x) { return x.suffix === suffix; })) {
      toast(parent.code + suffix + ' already exists.', 'error'); return;
    }
    const s = M.newStation();
    s.parentId = parent.id;
    s.suffix = suffix;
    ac.stations.push(s);
    SH.ensurePositions(ac);
    SH.arrangeStations(ac);
    state.stationId = s.id;
    rerender();
  }

  function deleteStation(ac, st) {
    const removed = [st].concat(st.parentId || isGun(st) ? [] : SH.sidesOf(ac, st));
    const extra = removed.length > 1 ? ' (together with side stations ' + removed.slice(1).map(function (s) { return s.code; }).join(', ') + ')' : '';
    if (!confirmDelete(stationTitle(st).toLowerCase() + extra)) return;
    const ids = removed.map(function (s) { return s.id; });
    ac.stations = ac.stations.filter(function (s) { return ids.indexOf(s.id) < 0; });
    ac.constraints.forEach(function (c) { c.stationIds = c.stationIds.filter(function (id) { return ids.indexOf(id) < 0; }); });
    SH.arrangeStations(ac);
    state.stationId = st.parentId || null;
    rerender();
  }

  /* ---- selected station */

  function renderStationPanel(ac, st) {
    const related = ac.constraints.filter(function (c) { return c.stationIds.indexOf(st.id) >= 0; });
    const byId = {};
    ac.stations.forEach(function (s) { byId[s.id] = s; });
    const codeOf = function (id) { return byId[id] ? byId[id].code : '?'; };
    const parent = st.parentId ? byId[st.parentId] : null;
    const gun = isGun(st);
    const sides = parent || gun ? [] : SH.sidesOf(ac, st);
    const pick = function (s) { return function () { state.stationId = s.id; render(); }; };
    const parentKind = gun ? 'gunStation' : 'station';
    const tag = gun ? 'Gun station' : parent ? 'Side station' : M.LOCATIONS[st.location];
    const mirror = SH.mirrorOf(ac, st);

    return h('section', { class: 'panel station-panel' }, [
      h('div', { class: 'station-head' }, [
        h('div', { class: 'station-badge' + (gun ? ' gun' : '') + (parent ? ' side' : '') }, st.code),
        h('div', { class: 'station-title' }, [
          h('h2', {}, stationTitle(st)),
          h('span', { class: 'tag' }, tag),
        ]),
        btn('', { icon: 'trash', class: 'ghost danger', aria: 'Delete station', onclick: function () { deleteStation(ac, st); } }),
      ]),
      field('Name / description', st, 'name', { placeholder: gun ? 'e.g. Internal gun' : 'e.g. Left inboard wing' }),
      parent
        ? h('div', { class: 'side-row' }, [
          h('span', { class: 'muted' }, 'Parent station:'),
          h('button', { class: 'small chip-btn', onclick: pick(parent) }, parent.code),
        ])
        : gun ? null : h('div', { class: 'side-row' }, [
          h('span', { class: 'muted' }, 'Side stations:'),
          sides.map(function (s) { return h('button', { class: 'small chip-btn', onclick: pick(s) }, s.code); }),
          ['L', 'R'].filter(function (x) { return !sides.some(function (s) { return s.suffix === x; }); }).map(function (x) {
            return btn(st.code + x, { icon: 'plus', class: 'small dashed', onclick: function () { addSideStation(ac, st, x); } });
          }),
          btn('Other…', {
            icon: 'plus', class: 'small dashed',
            onclick: function () {
              const sfx = window.prompt('Side station suffix (e.g. A, C, L2):', '');
              if (sfx != null) addSideStation(ac, st, sfx);
            },
          }),
        ]),
      h('div', { class: 'section-title' }, [
        h('h3', {}, 'Allowed loads'), h('span', { class: 'muted small-text' }, st.loads.length + ' options'),
        h('span', { class: 'grow' }),
        mirror ? btn('→ ' + mirror.code, {
          icon: 'mirror', class: 'small', title: 'Copy these rules to the symmetric station ' + mirror.code,
          disabled: !st.loads.length, onclick: function () { copyToMirror(ac, st); },
        }) : null,
        btn('Copy…', { icon: 'copy', class: 'small', title: 'Copy the rules to other stations', disabled: !st.loads.length, onclick: function () { openCopyDialog(ac, st); } }),
        gun ? null : btn('Make preset', {
          icon: 'layers', class: 'small', title: 'Turn these loads into a reusable preset',
          disabled: !st.loads.some(function (n) { return n.kind !== 'preset'; }), onclick: function () { makePresetFrom(ac, st); },
        }),
      ]),
      h('p', { class: 'hint' }, gun
        ? 'Select the gun, then add the ammunition it may use and the maximum number of rounds.'
        : 'Items on the same level are alternatives. "Max qty" is the most of that item on its parent.'),
      renderNodeList(st.loads, parentKind),
      addButtons(st.loads, parentKind),
      related.length ? h('div', { class: 'related' }, [
        h('h3', {}, [icon('link'), 'Rules involving this station']),
        h('ul', {}, related.map(function (c) {
          const def = M.CONSTRAINT_TYPES[c.type] || { label: c.type };
          return h('li', {}, [h('span', { class: 'rule-type ' + c.type }, def.label), ' ', c.stationIds.map(codeOf).join(', '), c.description ? h('span', { class: 'muted' }, ' — ' + c.description) : null]);
        })),
      ]) : null,
    ]);
  }

  function renderStations(ac, selected) {
    const rows = ac.stations.map(function (st) {
      return h('tr', {
        class: (selected && st.id === selected.id ? 'selected' : '') + (st.parentId ? ' side-row-tr' : '') + ' clickable',
        onclick: function (e) {
          if (e.target.closest('input,button')) return;
          state.stationId = st.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
        },
      }, [
        h('td', { class: 'code-cell' }, h('span', { class: 'code-chip' + (isGun(st) ? ' gun' : '') + (st.parentId ? ' side' : '') }, st.code)),
        h('td', {}, field(null, st, 'name', { placeholder: '—' })),
        h('td', {}, isGun(st) ? 'Gun' : st.parentId ? 'Side station' : M.LOCATIONS[st.location]),
        h('td', {}, st.loads.length ? h('span', { class: 'pill ok' }, st.loads.length + ' options') : h('span', { class: 'pill' }, 'undefined')),
        h('td', { class: 'row-actions' }, btn('', { icon: 'trash', class: 'ghost danger', aria: 'Delete', onclick: function () { deleteStation(ac, st); } })),
      ]);
    });

    return panel('Station list', { icon: 'grid' }, [
      h('p', { class: 'hint' }, 'Main stations are numbered automatically from 1, left to right by their position on the drawing; guns are not numbered. Drag a station on the drawing to change the order.'),
      ac.stations.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, [
          h('thead', {}, h('tr', {}, ['No', 'Name', 'Location', 'Allowed loads', ''].map(function (x) { return h('th', {}, x); }))),
          h('tbody', {}, rows),
        ]))
        : emptyState('grid', 'No stations yet'),
    ]);
  }

  /* ---- load tree */

  function renderNodeList(nodes, parentKind) {
    if (!nodes.length) {
      return parentKind === 'station' || parentKind === 'gunStation' || parentKind === 'presetRoot'
        ? h('div', { class: 'tree-empty' }, parentKind === 'presetRoot' ? 'The preset is empty; add items below.' : 'No loads allowed yet.')
        : null;
    }
    return h('ul', { class: 'tree' }, nodes.map(function (n) {
      const canHaveChildren = (M.ALLOWED_CHILDREN[n.kind] || []).length > 0;
      return h('li', { class: 'tree-item ' + n.kind }, [
        renderNode(nodes, n),
        canHaveChildren ? h('div', { class: 'tree-children' }, [
          renderNodeList(n.children, n.kind),
          addButtons(n.children, n.kind),
        ]) : null,
      ]);
    }));
  }

  function renderPresetNode(siblings, n) {
    const preset = M.findStore(state.project, 'preset', n.refId);
    const options = [{ value: '', label: state.project.presets.length ? '— select a preset —' : '— create a preset in the Presets tab first —' }]
      .concat(state.project.presets.map(function (p) { return { value: p.id, label: M.storeLabel(p) }; }));
    if (n.refId && !preset) options.push({ value: n.refId, label: '(deleted preset)' });
    const summary = [];
    const walk = function (nodes, depth) {
      nodes.forEach(function (c) {
        const s = M.findStore(state.project, c.kind, c.refId);
        summary.push(h('span', { class: 'preset-item d' + Math.min(depth, 3) }, [h('i', { class: 'kind-dot ' + c.kind }), (s ? s.code : '?') + (c.qty > 1 ? ' ×' + c.qty : '')]));
        walk(c.children || [], depth + 1);
      });
    };
    if (preset) walk(preset.loads, 0);
    return h('div', {}, [
      h('div', { class: 'tree-node' }, [
        h('span', { class: 'kind preset' }, 'Preset'),
        select(n, 'refId', options, function () { rerender(); }),
        preset ? btn('Edit', { icon: 'layers', class: 'small ghost', onclick: function () { state.view = 'presets'; state.presetId = preset.id; render(); } }) : null,
        btn('', {
          icon: 'trash', class: 'ghost danger small', aria: 'Remove the preset from this station',
          onclick: function () { removeFrom(siblings, n); rerender(); },
        }),
      ]),
      summary.length ? h('div', { class: 'preset-summary' }, summary) : null,
    ]);
  }

  function renderNode(siblings, n) {
    if (n.kind === 'preset') return renderPresetNode(siblings, n);
    const list = state.project.catalog[M.CATALOG_KEY[n.kind]];
    const extra = function (s) { return n.kind === 'ammo' || n.kind === 'gun' ? (s.caliber ? ' [' + s.caliber + ']' : '') : ''; };
    const options = [{ value: '', label: '— select —' }].concat(list.map(function (s) { return { value: s.id, label: M.storeLabel(s) + extra(s) }; }));
    if (n.refId && !M.findStore(state.project, n.kind, n.refId)) options.push({ value: n.refId, label: '(deleted item)' });
    const qtyLabel = n.kind === 'ammo' ? 'Max rounds' : 'Max qty';
    return h('div', { class: 'tree-node' }, [
      h('span', { class: 'kind ' + n.kind }, M.KIND_LABELS[n.kind]),
      select(n, 'refId', options, function () { rerender(); }),
      h('label', { class: 'qty-field' }, [h('span', {}, qtyLabel), field(null, n, 'qty', { type: 'number', min: 1, inputClass: 'qty' })]),
      btn('', {
        icon: 'trash', class: 'ghost danger small', aria: 'Delete',
        onclick: function () {
          const more = n.children.length ? ' (with everything under it)' : '';
          if (confirmDelete(M.KIND_LABELS[n.kind].toLowerCase() + more)) { removeFrom(siblings, n); rerender(); }
        },
      }),
    ]);
  }

  function addButtons(list, parentKind) {
    const kinds = M.ALLOWED_CHILDREN[parentKind];
    return h('div', { class: 'add-buttons' }, kinds.map(function (k) {
      return h('button', {
        class: 'small dashed add-' + k,
        onclick: function () { list.push(M.newLoadNode(k)); rerender(); },
      }, [icon('plus'), M.KIND_LABELS[k]]);
    }));
  }

  /* ---- cross-station rules */

  function renderConstraints(ac) {
    const typeOptions = Object.keys(M.CONSTRAINT_TYPES).map(function (k) { return { value: k, label: M.CONSTRAINT_TYPES[k].label }; });
    const munOptions = [{ value: '', label: '— select a store —' }].concat(state.project.catalog.munitions.map(function (s) { return { value: s.id, label: M.storeLabel(s) }; }));

    const items = ac.constraints.map(function (c, i) {
      const def = M.CONSTRAINT_TYPES[c.type] || { help: '' };
      return h('div', { class: 'rule-card' }, [
        h('div', { class: 'rule-head' }, [
          h('span', { class: 'rule-no' }, '#' + (i + 1)),
          h('label', { class: 'field inline' }, select(c, 'type', typeOptions, rerender)),
          c.type === 'MAX_TOTAL' ? h('label', { class: 'field inline' }, select(c, 'munitionId', munOptions)) : null,
          c.type === 'MAX_TOTAL' ? h('label', { class: 'qty-field' }, [h('span', {}, 'At most'), field(null, c, 'value', { type: 'number', inputClass: 'qty' })]) : null,
          h('span', { class: 'grow' }),
          btn('', { icon: 'trash', class: 'ghost danger small', aria: 'Delete rule', onclick: function () { removeFrom(ac.constraints, c); rerender(); } }),
        ]),
        h('p', { class: 'hint' }, def.help + (c.type === 'REQUIRES' ? ' Order: the station list order applies.' : '')),
        h('div', { class: 'chips' }, ac.stations.map(function (st) {
          const on = c.stationIds.indexOf(st.id) >= 0;
          return h('label', { class: 'chip' + (on ? ' on' : '') + (isGun(st) ? ' gun' : '') }, [
            h('input', {
              type: 'checkbox', checked: on,
              onchange: function () {
                if (on) c.stationIds = c.stationIds.filter(function (id) { return id !== st.id; });
                else {
                  c.stationIds.push(st.id);
                  const order = ac.stations.map(function (s) { return s.id; });
                  c.stationIds.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
                }
                rerender();
              },
            }),
            st.code || '(no code)',
          ]);
        })),
        h('div', { class: 'rule-desc' }, field(null, c, 'description', { placeholder: 'Description (optional)' })),
      ]);
    });

    return panel('Cross-station rules', {
      icon: 'link',
      actions: [btn('Add rule', { icon: 'plus', class: 'primary small', onclick: function () { ac.constraints.push(M.newConstraint()); rerender(); } })],
    }, items.length ? h('div', { class: 'rules' }, items) : emptyState('link', 'No rules yet', 'Add symmetry, mutual exclusion or total limit rules.'));
  }

  /* ------------------------------------------------------------ validation */

  function renderValidation() {
    const issues = M.validate(state.project);
    issues.sort(function (a, b) { return (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1); });
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    return panel('Validation', {
      icon: 'check',
      extra: h('div', { class: 'stats' }, [
        h('div', { class: 'stat err' }, [h('b', {}, errors), h('span', {}, 'errors')]),
        h('div', { class: 'stat warn' }, [h('b', {}, issues.length - errors), h('span', {}, 'warnings')]),
      ]),
    }, issues.length
      ? h('div', { class: 'issues' }, issues.map(function (i) {
        return h('div', { class: 'issue ' + i.level }, [
          icon(i.level === 'error' ? 'alert' : 'info'),
          h('div', {}, [h('div', { class: 'where' }, i.where), h('div', { class: 'msg' }, i.message)]),
        ]);
      }))
      : emptyState('check', 'No problems found', 'All rules look consistent.'));
  }

  /* ------------------------------------------------------------ XML */

  /* Simple XML highlighting: escape first, then mark tags/attributes. */
  function highlightXml(xml) {
    const esc = X.escapeXml(xml);
    return esc
      .replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="x-tag">$2</span>')
      .replace(/ ([\w:.-]+)=(&quot;.*?&quot;)/g, ' <span class="x-attr">$1</span>=<span class="x-val">$2</span>')
      .replace(/(&lt;\?.*?\?&gt;)/g, '<span class="x-decl">$1</span>');
  }

  function renderXml() {
    const exporter = X.EXPORTERS[state.exporter];
    const errors = M.validate(state.project).filter(function (i) { return i.level === 'error'; });
    const xml = exporter.exportProject(state.project, M);
    const options = Object.keys(X.EXPORTERS).map(function (k) { return { value: k, label: X.EXPORTERS[k].label }; });
    const pre = h('pre', { class: 'xml' });
    pre.innerHTML = highlightXml(xml);
    return panel('XML output', {
      icon: 'code',
      actions: [
        h('label', { class: 'field inline' }, select(state, 'exporter', options, render)),
        btn('Copy', {
          icon: 'copy', class: 'small',
          onclick: function () {
            if (navigator.clipboard) navigator.clipboard.writeText(xml).then(function () { toast('XML copied to the clipboard.', 'ok'); }, function () { toast('Could not copy.', 'error'); });
          },
        }),
        btn('Download XML', {
          icon: 'download', class: 'primary small',
          onclick: function () {
            if (errors.length && !window.confirm('There are ' + errors.length + ' validation errors. Download anyway?')) return;
            download(safeFileName(state.project.name) + '.' + exporter.fileExtension, xml, 'application/xml');
          },
        }),
      ],
    }, [
      errors.length ? h('div', { class: 'banner error' }, [icon('alert'), errors.length + ' validation errors; see the Validation tab.']) : null,
      pre,
    ]);
  }

  /* ------------------------------------------------------------ modal */

  function openModal(title, body, actions) {
    closeModal();
    const overlay = h('div', { class: 'modal-overlay', id: 'modal', onclick: function (e) { if (e.target === overlay) closeModal(); } }, [
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
        h('div', { class: 'modal-head' }, [h('h2', {}, title), btn('', { icon: 'close', class: 'ghost small', aria: 'Close', onclick: closeModal })]),
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'modal-actions' }, actions),
      ]),
    ]);
    document.body.appendChild(overlay);
    const first = overlay.querySelector('input, button.primary');
    if (first) first.focus();
  }

  function closeModal() {
    const m = document.getElementById('modal');
    if (m) m.remove();
  }

  /* ------------------------------------------------------------ copying rules */

  function copyLoadsTo(ac, src, targets, mode) {
    targets.forEach(function (t) {
      const copy = M.cloneLoads(src.loads);
      t.loads = mode === 'append' ? t.loads.concat(copy) : copy;
    });
    rerender();
    toast('Rules of ' + src.code + ' copied to ' + targets.map(function (t) { return t.code; }).join(', ') + '.', 'ok');
  }

  function copyToMirror(ac, st) {
    const m = SH.mirrorOf(ac, st);
    if (!m) return;
    if (m.loads.length && !window.confirm('Replace the ' + m.loads.length + ' options on station ' + m.code + ' with the rules of ' + st.code + '?')) return;
    copyLoadsTo(ac, st, [m], 'replace');
  }

  function openCopyDialog(ac, st) {
    const chosen = {};
    const opts = { mode: 'replace' };
    const targets = ac.stations.filter(function (s) { return s !== st && isGun(s) === isGun(st); });
    const mirror = SH.mirrorOf(ac, st);
    const chips = h('div', { class: 'chips' }, targets.map(function (s) {
      const cb = h('input', { type: 'checkbox', onchange: function () { chosen[s.id] = cb.checked; lab.classList.toggle('on', cb.checked); } });
      const lab = h('label', { class: 'chip' + (s === mirror ? ' mirror' : '') }, [cb, s.code, s.loads.length ? h('span', { class: 'muted' }, ' (' + s.loads.length + ')') : null]);
      return lab;
    }));
    const modeSel = select(opts, 'mode', [
      { value: 'replace', label: 'Replace the existing rules on the target' },
      { value: 'append', label: 'Add to the existing rules on the target' },
    ], function () {});
    openModal('Copy rules of ' + st.code, [
      h('p', { class: 'hint' }, st.loads.length + ' options are copied to the selected stations as independent copies. Use "Make preset" to manage them in one place.' + (mirror ? ' Symmetric station: ' + mirror.code + '.' : '')),
      h('div', { class: 'section-label' }, 'Target stations'),
      chips,
      h('label', { class: 'field', style: 'margin-top:14px' }, [h('span', {}, 'Mode'), modeSel]),
    ], [
      btn('Cancel', { onclick: closeModal }),
      btn('Copy', {
        icon: 'copy', class: 'primary',
        onclick: function () {
          const sel = targets.filter(function (s) { return chosen[s.id]; });
          if (!sel.length) { toast('Select at least one target station.', 'error'); return; }
          closeModal();
          copyLoadsTo(ac, st, sel, opts.mode);
        },
      }),
    ]);
  }

  /* Moves a station's loads into a new preset and leaves a reference to it on the station. */
  function makePresetFrom(ac, st) {
    const code = window.prompt('Preset code (e.g. AAM-RAIL, BOMB-STD):', '');
    if (code == null) return;
    if (!code.trim()) { toast('The preset code must not be empty.', 'error'); return; }
    if (state.project.presets.some(function (p) { return p.code === code.trim(); })) { toast('A preset with code ' + code.trim() + ' already exists.', 'error'); return; }
    const preset = Object.assign(M.newPreset(), {
      code: code.trim(),
      name: 'From ' + (ac.code || '') + ' station ' + st.code,
      loads: M.cloneLoads(st.loads.filter(function (n) { return n.kind !== 'preset'; })),
    });
    state.project.presets.push(preset);
    st.loads = st.loads.filter(function (n) { return n.kind === 'preset'; }).concat([M.newLoadNode('preset', preset.id)]);
    rerender();
    toast('Preset ' + preset.code + ' created. Add it to other stations with "+ Preset".', 'ok');
  }

  /* ------------------------------------------------------------ presets */

  function goToStation(ac, st) {
    state.view = 'aircraft'; state.aircraftId = ac.id; state.stationId = st.id; render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderPresets() {
    const list = state.project.presets;
    let preset = list.find(function (p) { return p.id === state.presetId; }) || list[0] || null;
    if (preset) state.presetId = preset.id;

    const nav = panel('Presets', {
      icon: 'layers', class: 'nav-panel',
      actions: [btn('', {
        icon: 'plus', class: 'primary small', aria: 'Add preset',
        onclick: function () {
          const p = Object.assign(M.newPreset(), { code: 'PRESET-' + (list.length + 1) });
          list.push(p); state.presetId = p.id; rerender();
        },
      })],
    }, list.length
      ? h('ul', { class: 'list' }, list.map(function (p) {
        return h('li', { class: preset && p.id === preset.id ? 'selected' : '', onclick: function () { state.presetId = p.id; render(); } }, [
          h('i', { class: 'kind-dot preset' }),
          h('span', { class: 'grow' }, p.code || '(no code)'),
          h('span', { class: 'count', title: 'Number of stations using it' }, M.presetUsage(state.project, p.id).length),
        ]);
      }))
      : emptyState('layers', 'No presets yet', 'Create one with + or use "Make preset" on a station.'));

    if (!preset) {
      return h('div', { class: 'layout' }, [nav, panel('Presets', { icon: 'layers' }, [
        h('p', { class: 'hint' }, 'A preset is a load tree used unchanged on several stations (e.g. "LAU-129 → AIM-9X / AIM-120C"). When you change a preset, every station that uses it is updated. Presets are expanded in the XML output.'),
        emptyState('layers', 'No preset selected'),
      ])]);
    }

    const usage = M.presetUsage(state.project, preset.id);
    const body = h('div', { class: 'content' }, [
      panel(preset.code || 'Preset', {
        icon: 'layers',
        extra: h('span', { class: 'kind-pill' }, 'Used on ' + usage.length + ' stations'),
        actions: [btn('', {
          icon: 'trash', class: 'ghost danger', aria: 'Delete preset',
          onclick: function () {
            const msg = 'preset ' + (preset.code || '') + (usage.length ? ' (and its references on ' + usage.length + ' stations)' : '');
            if (!confirmDelete(msg)) return;
            state.project.aircraft.forEach(function (ac) {
              ac.stations.forEach(function (st) { st.loads = st.loads.filter(function (n) { return !(n.kind === 'preset' && n.refId === preset.id); }); });
            });
            removeFrom(list, preset); state.presetId = null; rerender();
          },
        })],
      }, [
        h('div', { class: 'grid4' }, [
          field('Code', preset, 'code', { onInput: function () { const li = document.querySelector('.nav-panel .list li.selected .grow'); if (li) li.textContent = preset.code || '(no code)'; } }),
          field('Name', preset, 'name'),
          field('Notes', preset, 'notes', { placeholder: 'Optional' }),
        ]),
        h('div', { class: 'section-title' }, [h('h3', {}, 'Preset contents'), h('span', { class: 'muted small-text' }, preset.loads.length + ' options')]),
        h('p', { class: 'hint' }, 'Items on the same level are alternatives. Changes apply to every station that uses this preset.'),
        renderNodeList(preset.loads, 'presetRoot'),
        addButtons(preset.loads, 'presetRoot'),
      ]),
      panel('Used on stations', { icon: 'link' }, usage.length
        ? h('div', { class: 'chips' }, usage.map(function (u) {
          return h('button', { class: 'small chip-btn', onclick: function () { goToStation(u.aircraft, u.station); } }, (u.aircraft.code || '?') + ' / ' + u.station.code);
        }))
        : emptyState('link', 'Not used yet', 'Add it to a station with "+ Preset".')),
    ]);
    return h('div', { class: 'layout' }, [nav, body]);
  }

  /* ------------------------------------------------------------ compatibility matrix */

  const MATRIX_KINDS = [
    ['munition', 'Stores'], ['ammo', 'Gun ammunition'], ['gun', 'Guns'], ['subrack', 'Subracks'], ['rack', 'Racks'],
  ];

  function matrixData(ac) {
    const mx = M.compatibility(state.project, ac, state.matrixKinds);
    const q = state.matrixFilter.trim().toLocaleLowerCase();
    if (q) mx.rows = mx.rows.filter(function (r) { return (r.store.code + ' ' + r.store.name + ' ' + (r.store.category || '')).toLocaleLowerCase().indexOf(q) >= 0; });
    return mx;
  }

  function matrixCsv(ac, mx) {
    const esc = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [['Code', 'Name', 'Kind', 'Category / caliber'].concat(mx.stations.map(function (s) { return s.code; })).map(esc).join(';')];
    mx.rows.forEach(function (r) {
      lines.push([r.store.code, r.store.name, M.KIND_LABELS[r.kind], r.store.category || r.store.caliber || '']
        .concat(mx.stations.map(function (s) { return r.cells[s.id] ? r.cells[s.id].qty : ''; })).map(esc).join(';'));
    });
    // BOM so Excel opens non-ASCII characters correctly; ";" separator (works with European locales).
    return '﻿' + lines.join('\r\n');
  }

  function renderMatrix() {
    const ac = currentAircraft();
    if (!ac) return panel('Compatibility matrix', { icon: 'table' }, emptyState('plane', 'No aircraft', 'Add an aircraft first.'));
    SH.arrangeStations(ac);
    const mx = matrixData(ac);
    const kindChips = h('div', { class: 'chips no-print' }, MATRIX_KINDS.map(function (k) {
      const on = state.matrixKinds.indexOf(k[0]) >= 0;
      return h('label', { class: 'chip' + (on ? ' on' : '') }, [
        h('input', {
          type: 'checkbox', checked: on,
          onchange: function () {
            state.matrixKinds = on ? state.matrixKinds.filter(function (x) { return x !== k[0]; }) : state.matrixKinds.concat([k[0]]);
            render();
          },
        }),
        h('i', { class: 'kind-dot ' + k[0] }), k[1],
      ]);
    }));

    const acTabs = h('div', { class: 'seg no-print' }, state.project.aircraft.map(function (a) {
      return h('button', { class: 'small' + (a.id === ac.id ? ' on' : ''), onclick: function () { state.aircraftId = a.id; state.stationId = null; render(); } }, a.code || '(no code)');
    }));

    let lastGroup = null;
    const body = [];
    mx.rows.forEach(function (r) {
      const group = M.KIND_LABELS[r.kind] + (r.kind === 'munition' && r.store.category ? ' · ' + r.store.category : '') + (r.store.caliber ? ' · ' + r.store.caliber : '');
      if (group !== lastGroup) {
        body.push(h('tr', { class: 'group-row' }, h('td', { colspan: mx.stations.length + 1 }, [h('i', { class: 'kind-dot ' + r.kind }), group])));
        lastGroup = group;
      }
      body.push(h('tr', {}, [
        h('th', { class: 'row-head', scope: 'row', title: r.store.name }, [h('b', {}, r.store.code), h('span', {}, r.store.name)]),
        mx.stations.map(function (s) {
          const c = r.cells[s.id];
          return c
            ? h('td', { class: 'cell on', title: s.code + ' — ' + r.store.code + '\n' + c.paths.join('\n') }, c.qty > 1 ? '×' + c.qty : '✓')
            : h('td', { class: 'cell' }, '');
        }),
      ]));
    });

    const table = h('table', { class: 'matrix' }, [
      h('thead', {}, h('tr', {}, [h('th', { class: 'corner' }, 'Item \\ Station')].concat(mx.stations.map(function (s) {
        return h('th', { class: 'col-head' + (isGun(s) ? ' gun' : '') + (s.parentId ? ' side' : ''), title: (s.name || '') + ' — click to edit', onclick: function () { goToStation(ac, s); } }, s.code);
      })))),
      h('tbody', {}, body),
    ]);

    return panel('Compatibility matrix', {
      icon: 'table',
      extra: acTabs,
      actions: [
        h('label', { class: 'search no-print' }, [icon('search'), h('input', {
          type: 'search', placeholder: 'Search…', value: state.matrixFilter,
          onchange: function (e) { state.matrixFilter = e.target.value; render(); },
          onkeydown: function (e) { if (e.key === 'Enter') { state.matrixFilter = e.target.value; render(); } },
        })]),
        btn('Excel (CSV)', { icon: 'download', class: 'small no-print', onclick: function () { download(safeFileName((state.project.name || '') + '_' + (ac.code || '') + '_matrix') + '.csv', matrixCsv(ac, mx), 'text/csv'); } }),
        btn('Print / PDF', { icon: 'print', class: 'small no-print', onclick: function () { window.print(); } }),
      ],
    }, [
      h('p', { class: 'hint' }, 'Shows which item fits which station. ✓ allowed, ×N at most N (nested quantities are multiplied). Hover a cell for the mounting path (e.g. MAU-12 › TER-9 › MK-82 ×3); click a station header to open its editor.'),
      kindChips,
      h('div', { class: 'print-title' }, (state.project.name || '') + ' — ' + (ac.code || '') + ' ' + (ac.name || '') + ' compatibility matrix'),
      mx.rows.length
        ? h('div', { class: 'matrix-wrap' }, table)
        : emptyState('table', 'Nothing to show', 'Allow loads on stations or change the kind filter.'),
      h('div', { class: 'muted small-text', style: 'margin-top:8px' }, mx.rows.length + ' items × ' + mx.stations.length + ' stations'),
    ]);
  }

  /* ------------------------------------------------------------ main render */

  function render() {
    const nameInput = document.getElementById('project-name');
    if (document.activeElement !== nameInput) nameInput.value = state.project.name;
    hideTooltip();
    renderTabs();
    const views = { catalog: renderCatalog, aircraft: renderAircraft, matrix: renderMatrix, presets: renderPresets, validation: renderValidation, xml: renderXml };
    const main = document.getElementById('main');
    main.replaceChildren(views[state.view]());
  }

  function arrangeAll(project) {
    project.aircraft.forEach(function (ac) { SH.arrangeStations(ac); });
    return project;
  }

  /* Older projects: translates untouched standard entries and adds missing ones (nothing is removed). */
  function upgradeCatalog(project) {
    const r = M.upgradeCatalog(project);
    if (!r.added && !r.translated) return '';
    return 'Standard catalog updated: ' + r.added + ' new items added' + (r.translated ? ', ' + r.translated + ' translated to English' : '') + '.';
  }

  function setProject(p) {
    closeModal();
    fileState.handle = null; fileState.name = ''; fileState.saved = null;
    state.project = arrangeAll(M.normalizeProject(p));
    const upgradeMsg = upgradeCatalog(state.project);
    state.aircraftId = null;
    state.stationId = null;
    rerender();
    if (upgradeMsg) toast(upgradeMsg, 'ok');
  }

  function newProject() {
    const p = M.emptyProject();
    M.mergeStandardCatalog(p);
    return p;
  }

  document.getElementById('project-name').addEventListener('input', function (e) {
    state.project.name = e.target.value;
    persist();
  });

  const fileInput = document.getElementById('file-input');
  fileInput.addEventListener('change', function () {
    const file = fileInput.files[0];
    if (!file) return;
    file.text().then(function (text) {
      try { setProject(JSON.parse(text)); fileState.handle = null; markSaved(file.name); toast(file.name + ' opened.', 'ok'); } catch (e) { toast('Could not read the file: ' + e.message, 'error'); }
      fileInput.value = '';
    });
  });

  // Add icons to the top bar buttons.
  const ACTION_ICONS = { new: 'file', open: 'open', save: 'save', saveas: 'download', sample: 'spark', undo: 'undo', redo: 'redo' };
  document.querySelectorAll('.actions button[data-action]').forEach(function (b) {
    b.insertBefore(icon(ACTION_ICONS[b.getAttribute('data-action')]), b.firstChild);
  });
  const brandIcon = document.querySelector('.brand-icon');
  if (brandIcon) brandIcon.appendChild(icon('plane'));

  document.querySelector('.actions').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const action = b.getAttribute('data-action');
    if (action === 'new' && window.confirm('Clear the current project? (Saving it as JSON first is recommended.)')) setProject(newProject());
    if (action === 'sample' && window.confirm('Replace the current project with the sample data?')) setProject(M.sampleProject());
    if (action === 'open') openFromFile();
    if (action === 'save') saveToFile(false);
    if (action === 'saveas') saveToFile(true);
    if (action === 'undo') undo();
    if (action === 'redo') redo();
  });

  // Shortcuts: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z), Ctrl+S. In text fields the browser's own undo applies.
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) { if (e.key === 'Escape') closeModal(); return; }
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); saveToFile(e.shiftKey); return; }
    const t = e.target;
    const typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'checkbox'));
    if (typing) return;
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
  });

  state.project = arrangeAll(loadFromStorage() || M.sampleProject());
  const upgraded = upgradeCatalog(state.project);
  history.last = JSON.stringify(state.project);
  if (upgraded) persist();
  render();
  updateTopbar();
  if (upgraded) toast(upgraded, 'ok');
})();
