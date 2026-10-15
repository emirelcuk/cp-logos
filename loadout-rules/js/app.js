/*
 * Arayüz. Bağımlılıksız; dosyayı doğrudan tarayıcıda açarak (file://) çalışır.
 * Metin alanları durumu yerinde günceller (yeniden çizim yok, odak kaybolmaz);
 * yapısal değişiklikler (ekle/sil/seç) görünümü yeniden çizer.
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
    aircraftId: null,
    stationId: null,
    exporter: 'generic',
  };

  /* ------------------------------------------------------------ yardımcılar */

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

  let saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project)); } catch (e) { /* depolama kapalı olabilir */ }
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

  /* Metin/sayı alanı: değişikliği nesneye yazar, yeniden çizmez. */
  function field(label, obj, key, opts) {
    opts = opts || {};
    const isNum = opts.type === 'number';
    const input = opts.multiline
      ? h('textarea', { rows: 2, value: obj[key] || '' })
      : h('input', { type: opts.type || 'text', value: obj[key] == null ? '' : obj[key], min: isNum ? 0 : undefined, step: opts.step });
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
    return window.confirm(what + ' silinsin mi?');
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function safeFileName(name) {
    return (name || 'proje').replace(/[^\w\-ğüşıöçĞÜŞİÖÇ]+/g, '_');
  }

  /* Bir mağazanın yükleme ağaçlarında kullanılıp kullanılmadığını sayar. */
  function usageCount(storeId) {
    let count = 0;
    const walk = function (n) { if (n.refId === storeId) count++; n.children.forEach(walk); };
    state.project.aircraft.forEach(function (ac) {
      ac.stations.forEach(function (st) { st.loads.forEach(walk); });
      ac.constraints.forEach(function (c) { if (c.munitionId === storeId) count++; });
    });
    return count;
  }

  /* ------------------------------------------------------------ sekmeler */

  const TABS = [
    { id: 'aircraft', label: 'Uçaklar' },
    { id: 'catalog', label: 'Katalog' },
    { id: 'validation', label: 'Doğrulama' },
    { id: 'xml', label: 'XML Çıktısı' },
  ];

  function renderTabs() {
    const issues = M.validate(state.project);
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    const warnings = issues.length - errors;
    const tabs = document.getElementById('tabs');
    tabs.replaceChildren.apply(tabs, TABS.map(function (t) {
      return h('button', {
        class: state.view === t.id ? 'active' : '',
        onclick: function () { state.view = t.id; render(); },
      }, [
        t.label,
        t.id === 'validation' && errors ? h('span', { class: 'badge' }, errors) : null,
        t.id === 'validation' && warnings ? h('span', { class: 'badge warn' }, warnings) : null,
      ]);
    }));
  }

  /* ------------------------------------------------------------ katalog */

  function renderCatalog() {
    const kind = state.catalogKind;
    const list = state.project.catalog[M.CATALOG_KEY[kind]];
    const isMunition = kind === 'munition';

    const nav = h('div', { class: 'panel' }, [
      h('h3', {}, 'Katalog'),
      h('ul', { class: 'list' }, M.KINDS.map(function (k) {
        return h('li', {
          class: k === kind ? 'selected' : '',
          onclick: function () { state.catalogKind = k; render(); },
        }, [M.KIND_LABELS[k], h('span', { class: 'sub' }, state.project.catalog[M.CATALOG_KEY[k]].length)]);
      })),
    ]);

    const headers = ['Kod', 'Ad', isMunition ? 'Kategori' : 'Pozisyon', 'Not', ''];

    const rows = list.map(function (s) {
      return h('tr', {}, [
        h('td', {}, field(null, s, 'code')),
        h('td', {}, field(null, s, 'name')),
        isMunition ? h('td', {}, field(null, s, 'category')) : h('td', { class: 'num' }, field(null, s, 'positions', { type: 'number' })),
        h('td', {}, field(null, s, 'notes')),
        h('td', {}, h('button', {
          class: 'small danger',
          onclick: function () {
            const used = usageCount(s.id);
            const msg = M.KIND_LABELS[kind] + ' ' + M.storeLabel(s) + (used ? ' (' + used + ' yerde kullanılıyor)' : '');
            if (confirmDelete(msg)) { removeFrom(list, s); rerender(); }
          },
        }, 'Sil')),
      ]);
    });

    const body = h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, M.KIND_LABELS[kind] + ' tanımları'),
        h('button', {
          title: 'MK-82, GBU-12, AIM-9, AIM-120, MAU-12, TER-9 vb. hazır tanımlardan eksik olanları ekler',
          onclick: function () {
            const added = M.mergeStandardCatalog(state.project);
            window.alert(added ? added + ' öğe eklendi.' : 'Standart katalogdaki tüm öğeler zaten mevcut.');
            rerender();
          },
        }, 'Standart katalogu ekle'),
        h('button', { class: 'primary', onclick: function () { list.push(M.newStore(kind)); rerender(); } }, '+ ' + M.KIND_LABELS[kind] + ' ekle'),
      ]),
      h('p', { class: 'hint' }, isMunition
        ? 'Uçaklara takılabilecek mühimmat, tank, pod vb. yükler.'
        : 'Pozisyon: bu ' + M.KIND_LABELS[kind].toLowerCase() + ' üzerine aynı anda takılabilecek en fazla öğe sayısı.'),
      list.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, [
          h('thead', {}, h('tr', {}, headers.map(function (x) { return h('th', {}, x); }))),
          h('tbody', {}, rows),
        ]))
        : h('div', { class: 'empty' }, 'Henüz kayıt yok.'),
    ]);

    return h('div', { class: 'layout' }, [nav, body]);
  }

  /* ------------------------------------------------------------ uçaklar */

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

  function renderAircraft() {
    const ac = currentAircraft();
    const nav = h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h3', {}, 'Uçaklar'),
        h('button', {
          class: 'small primary',
          onclick: function () {
            const a = M.newAircraft();
            a.code = 'UCAK-' + (state.project.aircraft.length + 1);
            state.project.aircraft.push(a);
            state.aircraftId = a.id; state.stationId = null;
            rerender();
          },
        }, '+ Ekle'),
      ]),
      state.project.aircraft.length
        ? h('ul', { class: 'list' }, state.project.aircraft.map(function (a) {
          return h('li', {
            class: ac && a.id === ac.id ? 'selected' : '',
            onclick: function () { state.aircraftId = a.id; state.stationId = null; render(); },
          }, [a.code || '(kodsuz)', h('span', { class: 'sub' }, a.stations.length + ' ist.')]);
        }))
        : h('div', { class: 'empty' }, 'Henüz uçak yok.'),
    ]);

    if (!ac) return h('div', { class: 'layout' }, [nav, h('div', { class: 'panel empty' }, 'Başlamak için soldan bir uçak ekleyin.')]);

    if (SH.arrangeStations(ac)) persist();
    const st = currentStation(ac);
    return h('div', { class: 'layout' }, [nav, h('div', {}, [
      renderAircraftInfo(ac),
      h('div', { class: 'stage' }, [
        renderDrawing(ac, st),
        st ? renderStationPanel(ac, st) : h('div', { class: 'panel empty' }, 'İstasyon eklemek için çizimin altındaki düğmeleri kullanın.'),
      ]),
      renderStations(ac, st),
      renderConstraints(ac),
    ])]);
  }

  function renderAircraftInfo(ac) {
    const shapeOptions = Object.keys(SH.SHAPES).map(function (k) { return { value: k, label: SH.SHAPES[k].label }; });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'Uçak bilgisi'),
        h('button', {
          class: 'small danger',
          onclick: function () {
            if (confirmDelete('Uçak ' + (ac.code || '(kodsuz)'))) {
              removeFrom(state.project.aircraft, ac); state.aircraftId = null; rerender();
            }
          },
        }, 'Uçağı sil'),
      ]),
      h('div', { class: 'grid3' }, [
        field('Kod', ac, 'code', { onInput: renderNavLater }),
        field('Ad', ac, 'name'),
        h('label', { class: 'field' }, [
          h('span', {}, 'Çizim'),
          select(ac, 'silhouette', shapeOptions, function () { SH.applyAutoLayout(ac); rerender(); }),
        ]),
      ]),
      field('Not', ac, 'notes', { multiline: true }),
    ]);
  }

  // Uçak kodu yazılırken sol listedeki adı güncellemek için, odak kaybetmeden.
  function renderNavLater() {
    const ac = currentAircraft();
    const li = document.querySelector('.layout .list li.selected');
    if (li && ac) li.firstChild.textContent = ac.code || '(kodsuz)';
  }

  /* ---- uçak çizimi */

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

  function loadSummary(st) {
    if (!st.loads.length) return 'Yük izni tanımlı değil';
    const lines = [];
    const walk = function (n, depth) {
      const store = M.findStore(state.project, n.kind, n.refId);
      lines.push(new Array(depth + 1).join('  ') + (store ? store.code : '?') + (n.qty > 1 ? ' ×' + n.qty : ''));
      n.children.forEach(function (c) { walk(c, depth + 1); });
    };
    st.loads.forEach(function (n) { walk(n, 0); });
    return lines.join('\n');
  }

  function renderDrawing(ac, selected) {
    const V = SH.VIEW;
    const shape = SH.shapeOf(ac.silhouette);
    const root = svg('svg', { viewBox: '0 0 ' + V.width + ' ' + V.height, class: 'aircraft-svg', role: 'img', 'aria-label': (ac.code || 'Uçak') + ' istasyon yerleşimi' });

    root.appendChild(svg('line', { x1: V.cx, y1: 4, x2: V.cx, y2: V.height - 4, class: 'centerline' }));
    const outline = SH.outlinePath(ac.silhouette);
    if (outline) root.appendChild(svg('path', { d: outline, class: 'airframe' }));
    shape.fins.forEach(function (f) {
      root.appendChild(svg('line', { x1: V.cx + f.x, y1: f.y1, x2: V.cx + f.x, y2: f.y2, class: 'fin' }));
    });
    if (shape.canopy) root.appendChild(svg('ellipse', { cx: V.cx, cy: shape.canopy.y, rx: shape.canopy.rx, ry: shape.canopy.ry, class: 'canopy' }));

    // Ana istasyonlar ek noktalarının üstünde çizilsin diye önce ek noktalar.
    const ordered = ac.stations.filter(function (s) { return s.parentId; }).concat(ac.stations.filter(function (s) { return !s.parentId; }));
    ordered.forEach(function (st) {
      const isSel = selected && st.id === selected.id;
      const isSide = !!st.parentId;
      const cls = 'station' + (isSide ? ' side' : '') + (st.loads.length ? ' loaded' : ' empty') + (isSel ? ' selected' : '');
      const r = isSide ? (isSel ? 9 : 7) : (isSel ? 13 : 10);
      let label = { x: 0, y: st.location === 'CENTER' || st.y < 60 ? 26 : -17, anchor: 'middle' };
      if (isSide) label = { x: 0, y: 20, anchor: 'middle' };
      const g = svg('g', { class: cls, transform: 'translate(' + st.x + ',' + st.y + ')', tabindex: 0 }, [
        svg('title', {}, 'İstasyon ' + st.code + (st.name ? ' — ' + st.name : '') + '\n' + loadSummary(st)),
        svg('circle', { r: r }),
        svg('text', { x: label.x, y: label.y, 'text-anchor': label.anchor }, st.code),
      ]);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.stationId = st.id; render(); }
      });
      makeDraggable(root, g, st, ac);
      root.appendChild(g);
    });

    const addButton = function (loc, label) {
      return h('button', { class: 'small', onclick: function () { addStation(ac, loc); } }, label);
    };

    return h('div', { class: 'panel drawing' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, (ac.code || 'Uçak') + ' — ' + ac.stations.filter(function (s) { return !s.parentId; }).length + ' istasyon'),
        h('button', {
          class: 'small',
          title: 'İstasyonları çizime göre eşit aralıklarla yeniden diz',
          onclick: function () { SH.applyAutoLayout(ac); rerender(); },
        }, 'Otomatik yerleştir'),
      ]),
      root,
      h('div', { class: 'legend' }, [
        h('span', {}, [h('i', { class: 'dot loaded' }), 'Yük izni var']),
        h('span', {}, [h('i', { class: 'dot none' }), 'Tanımsız']),
        h('span', { class: 'hint' }, 'Tıkla: seç · Sürükle: taşı · Numaralar soldan sağa otomatik'),
      ]),
      h('div', { class: 'add-row' }, [
        addButton('LEFT', '+ Sol kanat'),
        addButton('CENTER', '+ Gövde'),
        addButton('RIGHT', '+ Sağ kanat'),
      ]),
    ]);
  }

  /*
   * İstasyon işaretini sürükleyerek konumunu değiştirir; hareketsiz tıklama seçim yapar.
   * Ana istasyon taşınırken ek noktaları da birlikte taşınır. Bırakınca numaralar yenilenir.
   */
  function makeDraggable(svgRoot, g, st, ac) {
    g.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const ctm = svgRoot.getScreenCTM();
      if (!ctm) return;
      const inv = ctm.inverse();
      const toSvg = function (ev) {
        const p = svgRoot.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
        return p.matrixTransform(inv);
      };
      const start = toSvg(e);
      const followers = [st].concat(st.parentId ? [] : SH.sidesOf(ac, st));
      const origins = followers.map(function (s) { return { x: s.x, y: s.y }; });
      let moved = false;
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');

      const onMove = function (ev) {
        const p = toSvg(ev);
        const dx = p.x - start.x, dy = p.y - start.y;
        if (!moved && Math.hypot(dx, dy) < 3) return;
        moved = true;
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
   * Yeni ana istasyon ekler. Sol kanatta en dışa (yeni 1 numara), sağ kanatta en dışa, gövdede en
   * arkaya eklenir; aynı gruptaki istasyonlar yeniden aralıklandırılır, numaralar yenilenir.
   */
  function addStation(ac, location) {
    const s = M.newStation();
    s.location = location;
    if (location === 'LEFT') ac.stations.unshift(s); else ac.stations.push(s);
    SH.applyAutoLayout(ac, [location]);
    state.stationId = s.id;
    rerender();
  }

  /* Ana istasyona ek takma noktası (ör. 5L, 5R) ekler. */
  function addSideStation(ac, parent, suffix) {
    suffix = String(suffix || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(suffix)) { window.alert('Son ek 1-3 harf/rakam olmalı (ör. L, R, A).'); return; }
    if (SH.sidesOf(ac, parent).some(function (x) { return x.suffix === suffix; })) {
      window.alert(parent.code + suffix + ' zaten tanımlı.'); return;
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
    const removed = [st].concat(st.parentId ? [] : SH.sidesOf(ac, st));
    const extra = removed.length > 1 ? ' (ek noktalarıyla birlikte: ' + removed.slice(1).map(function (s) { return s.code; }).join(', ') + ')' : '';
    if (!confirmDelete('İstasyon ' + st.code + extra)) return;
    const ids = removed.map(function (s) { return s.id; });
    ac.stations = ac.stations.filter(function (s) { return ids.indexOf(s.id) < 0; });
    ac.constraints.forEach(function (c) { c.stationIds = c.stationIds.filter(function (id) { return ids.indexOf(id) < 0; }); });
    SH.arrangeStations(ac);
    state.stationId = st.parentId || null;
    rerender();
  }

  /* ---- seçili istasyon */

  function renderStationPanel(ac, st) {
    const related = ac.constraints.filter(function (c) { return c.stationIds.indexOf(st.id) >= 0; });
    const byId = {};
    ac.stations.forEach(function (s) { byId[s.id] = s; });
    const codeOf = function (id) { return byId[id] ? byId[id].code : '?'; };
    const parent = st.parentId ? byId[st.parentId] : null;
    const sides = parent ? [] : SH.sidesOf(ac, st);
    const pick = function (s) { return function () { state.stationId = s.id; render(); }; };

    return h('div', { class: 'panel station-panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'İstasyon ' + st.code),
        h('span', { class: 'muted' }, parent ? 'Ek takma noktası' : M.LOCATIONS[st.location]),
        h('button', { class: 'small danger', onclick: function () { deleteStation(ac, st); } }, 'Sil'),
      ]),
      field('Ad / açıklama', st, 'name'),
      parent
        ? h('p', { class: 'hint' }, [
          'Bağlı olduğu istasyon: ',
          h('button', { class: 'small', onclick: pick(parent) }, 'İstasyon ' + parent.code),
        ])
        : h('div', { class: 'side-row' }, [
          h('span', { class: 'muted' }, 'Ek takma noktaları:'),
          sides.map(function (s) { return h('button', { class: 'small chip-btn', onclick: pick(s) }, s.code); }),
          ['L', 'R'].filter(function (x) { return !sides.some(function (s) { return s.suffix === x; }); }).map(function (x) {
            return h('button', { class: 'small', onclick: function () { addSideStation(ac, st, x); } }, '+ ' + st.code + x);
          }),
          h('button', {
            class: 'small',
            onclick: function () {
              const sfx = window.prompt('Ek takma noktası son eki (ör. A, C, L2):', '');
              if (sfx != null) addSideStation(ac, st, sfx);
            },
          }, '+ Diğer…'),
        ]),
      h('h3', { style: 'margin-top:10px' }, 'İzin verilen yükler'),
      h('p', { class: 'hint' },
        'Aynı seviyedeki öğeler birbirinin alternatifidir. "Maks. adet", öğenin bir üst seviyeye en fazla kaç adet takılabileceğidir.'),
      renderNodeList(st.loads, 'station'),
      addButtons(st.loads, 'station'),
      related.length ? h('div', { class: 'related' }, [
        h('h3', {}, 'Bu istasyonu içeren kurallar'),
        h('ul', {}, related.map(function (c) {
          const def = M.CONSTRAINT_TYPES[c.type] || { label: c.type };
          return h('li', {}, [h('b', {}, def.label), ': ', c.stationIds.map(codeOf).join(', '), c.description ? ' — ' + c.description : '']);
        })),
      ]) : null,
    ]);
  }

  function renderStations(ac, selected) {
    const rows = ac.stations.map(function (st) {
      return h('tr', { class: (selected && st.id === selected.id ? 'selected' : '') + (st.parentId ? ' side-row-tr' : '') }, [
        h('td', { class: 'code-cell' }, (st.parentId ? '↳ ' : '') + st.code),
        h('td', {}, field(null, st, 'name')),
        h('td', {}, st.parentId ? 'Ek nokta' : M.LOCATIONS[st.location]),
        h('td', {}, st.loads.length ? st.loads.length + ' seçenek' : h('span', { class: 'muted' }, 'yok')),
        h('td', { style: 'white-space:nowrap' }, [
          h('button', { class: 'small', onclick: function () { state.stationId = st.id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Seç'),
          ' ',
          h('button', { class: 'small danger', onclick: function () { deleteStation(ac, st); } }, 'Sil'),
        ]),
      ]);
    });

    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [h('h2', {}, 'İstasyon listesi')]),
      h('p', { class: 'hint' }, 'İstasyonlar çizimdeki konuma göre soldan sağa 1\'den başlayarak otomatik numaralanır. Sırayı değiştirmek için istasyonu çizimde sürükleyin.'),
      ac.stations.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, [
          h('thead', {}, h('tr', {}, ['No', 'Ad', 'Konum', 'İzinli yük', ''].map(function (x) { return h('th', {}, x); }))),
          h('tbody', {}, rows),
        ]))
        : h('div', { class: 'empty' }, 'Henüz istasyon yok.'),
    ]);
  }

  /* ---- yükleme ağacı */

  function renderNodeList(nodes, parentKind) {
    if (!nodes.length) return h('div', { class: 'empty' }, parentKind === 'station' ? 'Bu istasyona henüz yük izni tanımlanmadı.' : null);
    return h('ul', { class: 'tree' }, nodes.map(function (n) {
      return h('li', {}, [
        renderNode(nodes, n),
        n.kind !== 'munition' ? h('ul', { class: 'tree' }, [
          n.children.length ? h('li', {}, renderNodeList(n.children, n.kind)) : null,
          h('li', {}, addButtons(n.children, n.kind)),
        ]) : null,
      ]);
    }));
  }

  function renderNode(siblings, n) {
    const list = state.project.catalog[M.CATALOG_KEY[n.kind]];
    const options = [{ value: '', label: '— seçin —' }].concat(list.map(function (s) { return { value: s.id, label: M.storeLabel(s) }; }));
    if (n.refId && !M.findStore(state.project, n.kind, n.refId)) options.push({ value: n.refId, label: '(silinmiş öğe)' });
    return h('div', { class: 'tree-node' }, [
      h('span', { class: 'kind ' + n.kind }, M.KIND_LABELS[n.kind]),
      select(n, 'refId', options, function () { rerender(); }),
      h('span', {}, 'Maks. adet'),
      (function () { const f = field(null, n, 'qty', { type: 'number' }); f.classList.add('qty'); f.min = 1; return f; })(),
      h('button', {
        class: 'small danger',
        onclick: function () {
          const extra = n.children.length ? ' (alt öğeleriyle birlikte)' : '';
          if (confirmDelete(M.KIND_LABELS[n.kind] + extra)) { removeFrom(siblings, n); rerender(); }
        },
      }, 'Sil'),
    ]);
  }

  function addButtons(list, parentKind) {
    const kinds = M.ALLOWED_CHILDREN[parentKind];
    return h('div', { class: 'tree-node' }, kinds.map(function (k) {
      return h('button', {
        class: 'small',
        onclick: function () { list.push(M.newLoadNode(k)); rerender(); },
      }, '+ ' + M.KIND_LABELS[k]);
    }));
  }

  /* ---- istasyonlar arası kurallar */

  function renderConstraints(ac) {
    const typeOptions = Object.keys(M.CONSTRAINT_TYPES).map(function (k) { return { value: k, label: M.CONSTRAINT_TYPES[k].label }; });
    const munOptions = [{ value: '', label: '— mühimmat seçin —' }].concat(state.project.catalog.munitions.map(function (s) { return { value: s.id, label: M.storeLabel(s) }; }));

    const items = ac.constraints.map(function (c, i) {
      const def = M.CONSTRAINT_TYPES[c.type] || { help: '' };
      return h('div', { class: 'panel', style: 'margin-bottom:10px;background:var(--bg)' }, [
        h('div', { class: 'panel-head' }, [
          h('h3', {}, 'Kural #' + (i + 1)),
          h('button', { class: 'small danger', onclick: function () { removeFrom(ac.constraints, c); rerender(); } }, 'Sil'),
        ]),
        h('div', { class: 'grid2' }, [
          h('label', { class: 'field' }, [h('span', {}, 'Tip'), select(c, 'type', typeOptions, rerender)]),
          c.type === 'MAX_TOTAL' ? h('label', { class: 'field' }, [h('span', {}, 'Mühimmat'), select(c, 'munitionId', munOptions)]) : null,
          c.type === 'MAX_TOTAL' ? field('En fazla adet', c, 'value', { type: 'number' }) : null,
        ]),
        h('p', { class: 'hint' }, def.help + (c.type === 'REQUIRES' ? ' Sıra: işaretleme sırası değil, istasyon listesindeki sıra geçerlidir.' : '')),
        h('div', { class: 'chips' }, ac.stations.map(function (st) {
          const on = c.stationIds.indexOf(st.id) >= 0;
          return h('label', { class: 'chip' + (on ? ' on' : '') }, [
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
            st.code || '(kodsuz)',
          ]);
        })),
        h('div', { style: 'margin-top:8px' }, field('Açıklama', c, 'description')),
      ]);
    });

    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'İstasyonlar arası kurallar'),
        h('button', { class: 'primary', onclick: function () { ac.constraints.push(M.newConstraint()); rerender(); } }, '+ Kural ekle'),
      ]),
      items.length ? h('div', {}, items) : h('div', { class: 'empty' }, 'Henüz kural yok.'),
    ]);
  }

  /* ------------------------------------------------------------ doğrulama */

  function renderValidation() {
    const issues = M.validate(state.project);
    issues.sort(function (a, b) { return (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1); });
    return h('div', { class: 'panel' }, [
      h('h2', {}, 'Doğrulama'),
      issues.length
        ? h('div', {}, issues.map(function (i) {
          return h('div', { class: 'issue ' + i.level }, [
            h('div', { class: 'lvl' }, i.level === 'error' ? 'HATA' : 'UYARI'),
            h('div', {}, [h('div', { class: 'where' }, i.where), h('div', {}, i.message)]),
          ]);
        }))
        : h('div', { class: 'ok' }, 'Sorun bulunamadı.'),
    ]);
  }

  /* ------------------------------------------------------------ XML */

  function renderXml() {
    const exporter = X.EXPORTERS[state.exporter];
    const errors = M.validate(state.project).filter(function (i) { return i.level === 'error'; });
    const xml = exporter.exportProject(state.project, M);
    const options = Object.keys(X.EXPORTERS).map(function (k) { return { value: k, label: X.EXPORTERS[k].label }; });
    return h('div', { class: 'panel' }, [
      h('div', { class: 'panel-head' }, [
        h('h2', {}, 'XML çıktısı'),
        h('label', {}, select(state, 'exporter', options, render)),
        h('button', { onclick: function () { navigator.clipboard && navigator.clipboard.writeText(xml); } }, 'Kopyala'),
        h('button', {
          class: 'primary',
          onclick: function () {
            if (errors.length && !window.confirm(errors.length + ' doğrulama hatası var. Yine de indirilsin mi?')) return;
            download(safeFileName(state.project.name) + '.' + exporter.fileExtension, xml, 'application/xml');
          },
        }, 'XML indir'),
      ]),
      errors.length ? h('p', { class: 'hint', style: 'color:var(--danger)' }, errors.length + ' doğrulama hatası var; Doğrulama sekmesine bakın.') : null,
      h('pre', { class: 'xml' }, xml),
    ]);
  }

  /* ------------------------------------------------------------ ana çizim */

  function render() {
    const nameInput = document.getElementById('project-name');
    if (document.activeElement !== nameInput) nameInput.value = state.project.name;
    renderTabs();
    const views = { catalog: renderCatalog, aircraft: renderAircraft, validation: renderValidation, xml: renderXml };
    const main = document.getElementById('main');
    main.replaceChildren(views[state.view]());
  }

  function arrangeAll(project) {
    project.aircraft.forEach(function (ac) { SH.arrangeStations(ac); });
    return project;
  }

  function setProject(p) {
    state.project = arrangeAll(M.normalizeProject(p));
    state.aircraftId = null;
    state.stationId = null;
    rerender();
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
      try { setProject(JSON.parse(text)); } catch (e) { window.alert('Dosya okunamadı: ' + e.message); }
      fileInput.value = '';
    });
  });

  document.querySelector('.actions').addEventListener('click', function (e) {
    const action = e.target.getAttribute('data-action');
    if (action === 'new' && window.confirm('Mevcut proje temizlensin mi? (Önce JSON olarak kaydetmeniz önerilir.)')) setProject(M.emptyProject());
    if (action === 'sample' && window.confirm('Mevcut proje örnek veriyle değiştirilsin mi?')) setProject(M.sampleProject());
    if (action === 'open') fileInput.click();
    if (action === 'save') download(safeFileName(state.project.name) + '.json', JSON.stringify(state.project, null, 2), 'application/json');
  });

  state.project = arrangeAll(loadFromStorage() || M.sampleProject());
  render();
})();
