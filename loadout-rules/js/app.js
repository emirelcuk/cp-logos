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
    catalogFilter: '',
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

  // 24x24 çizgi ikonlar.
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

  let toastTimer = null;
  function toast(message, kind) {
    let el = document.getElementById('toast');
    if (!el) { el = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(el); }
    el.className = 'toast show ' + (kind || '');
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast ' + (kind || ''); }, 2600);
  }

  /* Metin/sayı alanı: değişikliği nesneye yazar, yeniden çizmez. */
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

  function stationTitle(st) {
    if (st.type === 'GUN') return 'Top ' + st.code;
    return (st.parentId ? 'Ek nokta ' : 'İstasyon ') + st.code;
  }

  function isGun(st) { return st.type === 'GUN'; }

  /* ------------------------------------------------------------ sekmeler */

  const TABS = [
    { id: 'aircraft', label: 'Uçaklar', icon: 'plane' },
    { id: 'catalog', label: 'Katalog', icon: 'box' },
    { id: 'validation', label: 'Doğrulama', icon: 'check' },
    { id: 'xml', label: 'XML Çıktısı', icon: 'code' },
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
        t.id === 'validation' && errors ? h('span', { class: 'badge', title: errors + ' hata' }, errors) : null,
        t.id === 'validation' && warnings ? h('span', { class: 'badge warn', title: warnings + ' uyarı' }, warnings) : null,
      ]);
    }));
  }

  /* ------------------------------------------------------------ katalog */

  const CATALOG_COLUMNS = {
    munition: [['code', 'Kod'], ['name', 'Ad'], ['category', 'Kategori'], ['notes', 'Not']],
    rack: [['code', 'Kod'], ['name', 'Ad'], ['positions', 'Pozisyon', 'number'], ['notes', 'Not']],
    subrack: [['code', 'Kod'], ['name', 'Ad'], ['positions', 'Pozisyon', 'number'], ['notes', 'Not']],
    gun: [['code', 'Kod'], ['name', 'Ad'], ['caliber', 'Çap'], ['positions', 'Mermi kapasitesi', 'number'], ['notes', 'Not']],
    ammo: [['code', 'Kod'], ['name', 'Ad'], ['caliber', 'Çap'], ['category', 'Tip (HEI, TP…)'], ['notes', 'Not']],
  };

  const CATALOG_HINTS = {
    munition: 'Uçağa takılabilen bomba, füze, yakıt tankı, pod vb. yükler.',
    rack: 'İstasyona doğrudan takılan askı/lançerler. Pozisyon: üzerine aynı anda takılabilecek en fazla öğe sayısı.',
    subrack: 'Rack altına takılan çoklu taşıyıcılar (TER, MER, BRU…). Pozisyon: üzerine takılabilecek en fazla öğe sayısı.',
    gun: 'Dahili toplar ve top podları. Mermi kapasitesi, mühimmat adedinin üst sınırıdır; çap, mühimmat uyumunu kontrol eder.',
    ammo: 'Top mühimmatı. Çap, topun çapıyla eşleşmezse doğrulama uyarı verir.',
  };

  function renderCatalog() {
    const kind = state.catalogKind;
    const list = state.project.catalog[M.CATALOG_KEY[kind]];
    const cols = CATALOG_COLUMNS[kind];
    const q = state.catalogFilter.trim().toLocaleLowerCase('tr');

    const nav = panel('Katalog', { icon: 'box', class: 'nav-panel' }, h('ul', { class: 'list' }, M.KINDS.map(function (k) {
      return h('li', {
        class: k === kind ? 'selected' : '',
        onclick: function () { state.catalogKind = k; render(); },
      }, [h('i', { class: 'kind-dot ' + k }), h('span', { class: 'grow' }, M.KIND_LABELS[k]), h('span', { class: 'count' }, state.project.catalog[M.CATALOG_KEY[k]].length)]);
    })));

    const rowFor = function (s) {
      const text = cols.map(function (c) { return s[c[0]]; }).join(' ').toLocaleLowerCase('tr');
      return h('tr', { hidden: q && text.indexOf(q) < 0 ? true : undefined, 'data-search': text }, [
        cols.map(function (c) {
          return h('td', { class: c[2] === 'number' ? 'num' : (c[0] === 'code' ? 'code-col' : '') }, field(null, s, c[0], { type: c[2], min: c[2] === 'number' ? 1 : undefined }));
        }),
        h('td', { class: 'row-actions' }, btn('', {
          icon: 'trash', class: 'ghost danger', aria: 'Sil',
          onclick: function () {
            const used = usageCount(s.id);
            const msg = M.KIND_LABELS[kind] + ' ' + M.storeLabel(s) + (used ? ' (' + used + ' yerde kullanılıyor)' : '');
            if (confirmDelete(msg)) { removeFrom(list, s); rerender(); }
          },
        })),
      ]);
    };

    const search = h('label', { class: 'search' }, [
      icon('search'),
      h('input', {
        type: 'search', placeholder: 'Ara…', value: state.catalogFilter,
        oninput: function (e) {
          state.catalogFilter = e.target.value;
          const qq = e.target.value.trim().toLocaleLowerCase('tr');
          document.querySelectorAll('.catalog-table tbody tr').forEach(function (tr) {
            tr.hidden = !!qq && tr.getAttribute('data-search').indexOf(qq) < 0;
          });
        },
      }),
    ]);

    const body = panel(M.KIND_LABELS[kind] + ' tanımları', {
      extra: h('span', { class: 'kind-pill ' + kind }, list.length + ' kayıt'),
      actions: [
        search,
        btn('Standart katalogu ekle', {
          icon: 'spark',
          title: 'MK-82, GBU-12, AIM-9, AIM-120, MAU-12, TER-9, M61A1, PGU-28/B vb. hazır tanımlardan eksik olanları ekler',
          onclick: function () {
            const added = M.mergeStandardCatalog(state.project);
            rerender();
            toast(added ? added + ' öğe kataloğa eklendi.' : 'Standart katalogdaki tüm öğeler zaten mevcut.', added ? 'ok' : '');
          },
        }),
        btn(M.KIND_LABELS[kind] + ' ekle', { icon: 'plus', class: 'primary', onclick: function () { list.push(M.newStore(kind)); rerender(); } }),
      ],
    }, [
      h('p', { class: 'hint' }, CATALOG_HINTS[kind]),
      list.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'catalog-table' }, [
          h('thead', {}, h('tr', {}, cols.map(function (c) { return h('th', {}, c[1]); }).concat([h('th', {}, '')]))),
          h('tbody', {}, list.map(rowFor)),
        ]))
        : emptyState('box', 'Henüz kayıt yok', '"' + M.KIND_LABELS[kind] + ' ekle" veya "Standart katalogu ekle" ile başlayın.'),
    ]);

    return h('div', { class: 'layout' }, [nav, body]);
  }

  function emptyState(iconName, title, text) {
    return h('div', { class: 'empty-state' }, [icon(iconName), h('b', {}, title), text ? h('span', {}, text) : null]);
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
    const nav = panel('Uçaklar', {
      icon: 'plane', class: 'nav-panel',
      actions: [btn('', {
        icon: 'plus', class: 'primary small', aria: 'Uçak ekle',
        onclick: function () {
          const a = M.newAircraft();
          a.code = 'UCAK-' + (state.project.aircraft.length + 1);
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
            h('b', { class: 'ac-code' }, a.code || '(kodsuz)'),
            a.name ? h('span', { class: 'ac-name' }, a.name) : null,
            h('span', { class: 'ac-counts' }, c.main + ' istasyon' + (c.side ? ' · ' + c.side + ' ek' : '') + (c.gun ? ' · ' + c.gun + ' top' : '')),
          ]),
        ]);
      }))
      : emptyState('plane', 'Henüz uçak yok', '+ ile ilk uçağı ekleyin.'));

    if (!ac) return h('div', { class: 'layout' }, [nav, h('div', {}, panel('', {}, emptyState('plane', 'Uçak seçilmedi', 'Başlamak için soldan bir uçak ekleyin.')))]);

    if (SH.arrangeStations(ac)) persist();
    const st = currentStation(ac);
    return h('div', { class: 'layout' }, [nav, h('div', { class: 'content' }, [
      renderAircraftInfo(ac),
      h('div', { class: 'stage' }, [
        renderDrawing(ac, st),
        st ? renderStationPanel(ac, st) : panel('', {}, emptyState('target', 'İstasyon yok', 'Çizimin altındaki düğmelerle istasyon ekleyin.')),
      ]),
      renderStations(ac, st),
      renderConstraints(ac),
    ])]);
  }

  function renderAircraftInfo(ac) {
    const shapeOptions = Object.keys(SH.SHAPES).map(function (k) { return { value: k, label: SH.SHAPES[k].label }; });
    const c = counts(ac);
    const stat = function (value, label) { return h('div', { class: 'stat' }, [h('b', {}, value), h('span', {}, label)]); };
    return panel(ac.name || ac.code || 'Uçak', {
      class: 'aircraft-info',
      extra: h('div', { class: 'stats' }, [
        stat(c.main, 'istasyon'), stat(c.side, 'ek nokta'), stat(c.gun, 'top'), stat(ac.constraints.length, 'kural'),
      ]),
      actions: [btn('', {
        icon: 'trash', class: 'ghost danger', aria: 'Uçağı sil',
        onclick: function () {
          if (confirmDelete('Uçak ' + (ac.code || '(kodsuz)'))) {
            removeFrom(state.project.aircraft, ac); state.aircraftId = null; rerender();
          }
        },
      })],
    }, [
      h('div', { class: 'grid4' }, [
        field('Kod', ac, 'code', { onInput: renderNavLater }),
        field('Ad', ac, 'name'),
        h('label', { class: 'field' }, [
          h('span', {}, 'Çizim'),
          select(ac, 'silhouette', shapeOptions, function () { SH.applyAutoLayout(ac); rerender(); }),
        ]),
        field('Not', ac, 'notes', { placeholder: 'İsteğe bağlı' }),
      ]),
    ]);
  }

  // Uçak kodu yazılırken sol listedeki adı güncellemek için, odak kaybetmeden.
  function renderNavLater() {
    const ac = currentAircraft();
    const b = document.querySelector('.aircraft-list li.selected .ac-code');
    if (b && ac) b.textContent = ac.code || '(kodsuz)';
  }

  /* ---- uçak çizimi */

  function loadLines(st) {
    const lines = [];
    const walk = function (n, depth) {
      const store = M.findStore(state.project, n.kind, n.refId);
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
        }).concat(lines.length > 14 ? [h('li', { class: 'more' }, '+' + (lines.length - 14) + ' daha')] : []))
        : h('div', { class: 'tt-empty' }, 'Yük izni tanımlı değil')
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
  // İşaret yeniden çizilince pointerleave kaçabilir; fare işaretten çıkınca her durumda gizle.
  document.addEventListener('pointermove', function (e) {
    if (tooltipEl && tooltipEl.classList.contains('show') && !(e.target.closest && e.target.closest('.aircraft-svg .station'))) hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, { passive: true });

  function renderDrawing(ac, selected) {
    const V = SH.VIEW;
    const shape = SH.shapeOf(ac.silhouette);
    const root = svg('svg', { viewBox: '0 0 ' + V.width + ' ' + V.height, class: 'aircraft-svg', role: 'img', 'aria-label': (ac.code || 'Uçak') + ' istasyon yerleşimi' });

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
    if (shape.canopy) root.appendChild(svg('ellipse', { cx: V.cx, cy: shape.canopy.y, rx: shape.canopy.rx, ry: shape.canopy.ry, class: 'canopy' }));
    root.appendChild(svg('text', { x: 12, y: 22, class: 'drawing-caption' }, (ac.code || 'UÇAK') + ' · ÜSTTEN GÖRÜNÜM'));
    root.appendChild(svg('text', { x: 12, y: V.height - 12, class: 'drawing-caption' }, 'SOL'));
    root.appendChild(svg('text', { x: V.width - 12, y: V.height - 12, class: 'drawing-caption', 'text-anchor': 'end' }, 'SAĞ'));

    // Ana istasyonlar ek noktalarının üstünde çizilsin diye önce ek noktalar.
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

    return panel('Yerleşim', {
      class: 'drawing',
      extra: h('span', { class: 'muted small-text' }, c.main + ' istasyon' + (c.gun ? ' · ' + c.gun + ' top' : '')),
      actions: [btn('Otomatik', {
        icon: 'grid', class: 'small ghost',
        title: 'İstasyonları çizime göre eşit aralıklarla yeniden diz',
        onclick: function () { SH.applyAutoLayout(ac); rerender(); toast('İstasyonlar yeniden yerleştirildi.'); },
      })],
    }, [
      h('div', { class: 'svg-frame' }, root),
      h('div', { class: 'legend' }, [
        h('span', {}, [h('i', { class: 'dot loaded' }), 'Yük izni var']),
        h('span', {}, [h('i', { class: 'dot none' }), 'Tanımsız']),
        h('span', {}, [h('i', { class: 'dot gun' }), 'Top']),
        h('span', { class: 'legend-hint' }, 'Tıkla: seç · Sürükle: taşı'),
      ]),
      h('div', { class: 'add-row' }, [
        addButton('LEFT', 'Sol kanat'),
        addButton('CENTER', 'Gövde'),
        addButton('RIGHT', 'Sağ kanat'),
        btn('Top (GUN)', { icon: 'target', class: 'small gun-btn', onclick: function () { addGunStation(ac); } }),
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

  function addGunStation(ac) {
    const s = Object.assign(M.newStation(), { type: 'GUN', name: 'Dahili top' });
    ac.stations.push(s);
    SH.ensurePositions(ac);
    SH.arrangeStations(ac);
    state.stationId = s.id;
    rerender();
  }

  /* Ana istasyona ek takma noktası (ör. 5L, 5R) ekler. */
  function addSideStation(ac, parent, suffix) {
    suffix = String(suffix || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{1,3}$/.test(suffix)) { toast('Son ek 1-3 harf/rakam olmalı (ör. L, R, A).', 'error'); return; }
    if (SH.sidesOf(ac, parent).some(function (x) { return x.suffix === suffix; })) {
      toast(parent.code + suffix + ' zaten tanımlı.', 'error'); return;
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
    const extra = removed.length > 1 ? ' (ek noktalarıyla birlikte: ' + removed.slice(1).map(function (s) { return s.code; }).join(', ') + ')' : '';
    if (!confirmDelete(stationTitle(st) + extra)) return;
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
    const gun = isGun(st);
    const sides = parent || gun ? [] : SH.sidesOf(ac, st);
    const pick = function (s) { return function () { state.stationId = s.id; render(); }; };
    const parentKind = gun ? 'gunStation' : 'station';
    const tag = gun ? 'Top istasyonu' : parent ? 'Ek takma noktası' : M.LOCATIONS[st.location];

    return h('section', { class: 'panel station-panel' }, [
      h('div', { class: 'station-head' }, [
        h('div', { class: 'station-badge' + (gun ? ' gun' : '') + (parent ? ' side' : '') }, st.code),
        h('div', { class: 'station-title' }, [
          h('h2', {}, stationTitle(st)),
          h('span', { class: 'tag' }, tag),
        ]),
        btn('', { icon: 'trash', class: 'ghost danger', aria: 'İstasyonu sil', onclick: function () { deleteStation(ac, st); } }),
      ]),
      field('Ad / açıklama', st, 'name', { placeholder: gun ? 'ör. Dahili top' : 'ör. Sol iç kanat' }),
      parent
        ? h('div', { class: 'side-row' }, [
          h('span', { class: 'muted' }, 'Bağlı olduğu istasyon:'),
          h('button', { class: 'small chip-btn', onclick: pick(parent) }, parent.code),
        ])
        : gun ? null : h('div', { class: 'side-row' }, [
          h('span', { class: 'muted' }, 'Ek takma noktaları:'),
          sides.map(function (s) { return h('button', { class: 'small chip-btn', onclick: pick(s) }, s.code); }),
          ['L', 'R'].filter(function (x) { return !sides.some(function (s) { return s.suffix === x; }); }).map(function (x) {
            return btn(st.code + x, { icon: 'plus', class: 'small dashed', onclick: function () { addSideStation(ac, st, x); } });
          }),
          btn('Diğer…', {
            icon: 'plus', class: 'small dashed',
            onclick: function () {
              const sfx = window.prompt('Ek takma noktası son eki (ör. A, C, L2):', '');
              if (sfx != null) addSideStation(ac, st, sfx);
            },
          }),
        ]),
      h('div', { class: 'section-title' }, [h('h3', {}, 'İzin verilen yükler'), h('span', { class: 'muted small-text' }, st.loads.length + ' seçenek')]),
      h('p', { class: 'hint' }, gun
        ? 'Topu seçin, altına kullanılabilecek mühimmatı ve en fazla mermi adedini ekleyin.'
        : 'Aynı seviyedeki öğeler birbirinin alternatifidir. "Maks. adet", öğenin üst seviyeye en fazla kaç adet takılabileceğidir.'),
      renderNodeList(st.loads, parentKind),
      addButtons(st.loads, parentKind),
      related.length ? h('div', { class: 'related' }, [
        h('h3', {}, [icon('link'), 'Bu istasyonu içeren kurallar']),
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
        h('td', {}, isGun(st) ? 'Top' : st.parentId ? 'Ek nokta' : M.LOCATIONS[st.location]),
        h('td', {}, st.loads.length ? h('span', { class: 'pill ok' }, st.loads.length + ' seçenek') : h('span', { class: 'pill' }, 'tanımsız')),
        h('td', { class: 'row-actions' }, btn('', { icon: 'trash', class: 'ghost danger', aria: 'Sil', onclick: function () { deleteStation(ac, st); } })),
      ]);
    });

    return panel('İstasyon listesi', { icon: 'grid' }, [
      h('p', { class: 'hint' }, 'Ana istasyonlar çizimdeki konuma göre soldan sağa 1\'den başlayarak otomatik numaralanır; toplar numaralandırmaya girmez. Sırayı değiştirmek için istasyonu çizimde sürükleyin.'),
      ac.stations.length
        ? h('div', { class: 'table-wrap' }, h('table', {}, [
          h('thead', {}, h('tr', {}, ['No', 'Ad', 'Konum', 'İzinli yük', ''].map(function (x) { return h('th', {}, x); }))),
          h('tbody', {}, rows),
        ]))
        : emptyState('grid', 'Henüz istasyon yok'),
    ]);
  }

  /* ---- yükleme ağacı */

  function renderNodeList(nodes, parentKind) {
    if (!nodes.length) {
      return parentKind === 'station' || parentKind === 'gunStation'
        ? h('div', { class: 'tree-empty' }, 'Henüz yük izni tanımlanmadı.')
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

  function renderNode(siblings, n) {
    const list = state.project.catalog[M.CATALOG_KEY[n.kind]];
    const extra = function (s) { return n.kind === 'ammo' || n.kind === 'gun' ? (s.caliber ? ' [' + s.caliber + ']' : '') : ''; };
    const options = [{ value: '', label: '— seçin —' }].concat(list.map(function (s) { return { value: s.id, label: M.storeLabel(s) + extra(s) }; }));
    if (n.refId && !M.findStore(state.project, n.kind, n.refId)) options.push({ value: n.refId, label: '(silinmiş öğe)' });
    const qtyLabel = n.kind === 'ammo' ? 'Maks. mermi' : 'Maks. adet';
    return h('div', { class: 'tree-node' }, [
      h('span', { class: 'kind ' + n.kind }, M.KIND_LABELS[n.kind]),
      select(n, 'refId', options, function () { rerender(); }),
      h('label', { class: 'qty-field' }, [h('span', {}, qtyLabel), field(null, n, 'qty', { type: 'number', min: 1, inputClass: 'qty' })]),
      btn('', {
        icon: 'trash', class: 'ghost danger small', aria: 'Sil',
        onclick: function () {
          const more = n.children.length ? ' (alt öğeleriyle birlikte)' : '';
          if (confirmDelete(M.KIND_LABELS[n.kind] + more)) { removeFrom(siblings, n); rerender(); }
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

  /* ---- istasyonlar arası kurallar */

  function renderConstraints(ac) {
    const typeOptions = Object.keys(M.CONSTRAINT_TYPES).map(function (k) { return { value: k, label: M.CONSTRAINT_TYPES[k].label }; });
    const munOptions = [{ value: '', label: '— mühimmat seçin —' }].concat(state.project.catalog.munitions.map(function (s) { return { value: s.id, label: M.storeLabel(s) }; }));

    const items = ac.constraints.map(function (c, i) {
      const def = M.CONSTRAINT_TYPES[c.type] || { help: '' };
      return h('div', { class: 'rule-card' }, [
        h('div', { class: 'rule-head' }, [
          h('span', { class: 'rule-no' }, '#' + (i + 1)),
          h('label', { class: 'field inline' }, select(c, 'type', typeOptions, rerender)),
          c.type === 'MAX_TOTAL' ? h('label', { class: 'field inline' }, select(c, 'munitionId', munOptions)) : null,
          c.type === 'MAX_TOTAL' ? h('label', { class: 'qty-field' }, [h('span', {}, 'En fazla'), field(null, c, 'value', { type: 'number', inputClass: 'qty' })]) : null,
          h('span', { class: 'grow' }),
          btn('', { icon: 'trash', class: 'ghost danger small', aria: 'Kuralı sil', onclick: function () { removeFrom(ac.constraints, c); rerender(); } }),
        ]),
        h('p', { class: 'hint' }, def.help + (c.type === 'REQUIRES' ? ' Sıra: istasyon listesindeki sıra geçerlidir.' : '')),
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
            st.code || '(kodsuz)',
          ]);
        })),
        h('div', { class: 'rule-desc' }, field(null, c, 'description', { placeholder: 'Açıklama (isteğe bağlı)' })),
      ]);
    });

    return panel('İstasyonlar arası kurallar', {
      icon: 'link',
      actions: [btn('Kural ekle', { icon: 'plus', class: 'primary small', onclick: function () { ac.constraints.push(M.newConstraint()); rerender(); } })],
    }, items.length ? h('div', { class: 'rules' }, items) : emptyState('link', 'Henüz kural yok', 'Simetri, birbirini dışlama veya toplam üst sınır kuralları ekleyin.'));
  }

  /* ------------------------------------------------------------ doğrulama */

  function renderValidation() {
    const issues = M.validate(state.project);
    issues.sort(function (a, b) { return (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1); });
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    return panel('Doğrulama', {
      icon: 'check',
      extra: h('div', { class: 'stats' }, [
        h('div', { class: 'stat err' }, [h('b', {}, errors), h('span', {}, 'hata')]),
        h('div', { class: 'stat warn' }, [h('b', {}, issues.length - errors), h('span', {}, 'uyarı')]),
      ]),
    }, issues.length
      ? h('div', { class: 'issues' }, issues.map(function (i) {
        return h('div', { class: 'issue ' + i.level }, [
          icon(i.level === 'error' ? 'alert' : 'info'),
          h('div', {}, [h('div', { class: 'where' }, i.where), h('div', { class: 'msg' }, i.message)]),
        ]);
      }))
      : emptyState('check', 'Sorun bulunamadı', 'Tüm kurallar tutarlı görünüyor.'));
  }

  /* ------------------------------------------------------------ XML */

  /* Basit XML renklendirme: önce kaçırılır, sonra etiket/özellikler işaretlenir. */
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
    return panel('XML çıktısı', {
      icon: 'code',
      actions: [
        h('label', { class: 'field inline' }, select(state, 'exporter', options, render)),
        btn('Kopyala', {
          icon: 'copy', class: 'small',
          onclick: function () {
            if (navigator.clipboard) navigator.clipboard.writeText(xml).then(function () { toast('XML panoya kopyalandı.', 'ok'); }, function () { toast('Kopyalanamadı.', 'error'); });
          },
        }),
        btn('XML indir', {
          icon: 'download', class: 'primary small',
          onclick: function () {
            if (errors.length && !window.confirm(errors.length + ' doğrulama hatası var. Yine de indirilsin mi?')) return;
            download(safeFileName(state.project.name) + '.' + exporter.fileExtension, xml, 'application/xml');
          },
        }),
      ],
    }, [
      errors.length ? h('div', { class: 'banner error' }, [icon('alert'), errors.length + ' doğrulama hatası var; Doğrulama sekmesine bakın.']) : null,
      pre,
    ]);
  }

  /* ------------------------------------------------------------ ana çizim */

  function render() {
    const nameInput = document.getElementById('project-name');
    if (document.activeElement !== nameInput) nameInput.value = state.project.name;
    hideTooltip();
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
      try { setProject(JSON.parse(text)); toast('Proje açıldı.', 'ok'); } catch (e) { toast('Dosya okunamadı: ' + e.message, 'error'); }
      fileInput.value = '';
    });
  });

  // Üst çubuk düğmelerine ikon ekle.
  const ACTION_ICONS = { new: 'file', open: 'open', save: 'save', sample: 'spark' };
  document.querySelectorAll('.actions button[data-action]').forEach(function (b) {
    b.insertBefore(icon(ACTION_ICONS[b.getAttribute('data-action')]), b.firstChild);
  });
  const brandIcon = document.querySelector('.brand-icon');
  if (brandIcon) brandIcon.appendChild(icon('plane'));

  document.querySelector('.actions').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const action = b.getAttribute('data-action');
    if (action === 'new' && window.confirm('Mevcut proje temizlensin mi? (Önce JSON olarak kaydetmeniz önerilir.)')) setProject(M.emptyProject());
    if (action === 'sample' && window.confirm('Mevcut proje örnek veriyle değiştirilsin mi?')) setProject(M.sampleProject());
    if (action === 'open') fileInput.click();
    if (action === 'save') {
      download(safeFileName(state.project.name) + '.json', JSON.stringify(state.project, null, 2), 'application/json');
      toast('Proje JSON olarak kaydedildi.', 'ok');
    }
  });

  state.project = arrangeAll(loadFromStorage() || M.sampleProject());
  render();
})();
