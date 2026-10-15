# Loadout Rules Editor

An application for defining which **racks**, **subracks**, **stores** and **guns** may be fitted to
the stations of combat aircraft, and for converting those rules to **XML**.

## Running

No installation and no internet connection required. Open `index.html` in a browser.

Single-file version: `dist/loadout-rules.html` (can be carried on a USB stick). Rebuild it with
`npm run build` after changing the sources.

- Work is saved automatically in the browser (localStorage).
- **Save** (Ctrl+S) overwrites the same JSON file in Chrome/Edge; **Save as** picks a new file.
  Other browsers download the file instead. The top bar shows the open file name and a • when there
  are unsaved changes.
- **Undo / Redo** (Ctrl+Z / Ctrl+Y): the last 150 changes.
- Tests: `npm test` (Node 18+).

## Concepts

| Tab | Contents |
|---|---|
| Aircraft (home) | Stations on a top-view drawing of the aircraft; click a station to edit its allowed load tree; cross-station rules |
| Matrix | Item × station compatibility table (✓ / ×N, mounting path in the tooltip); Excel (CSV) and print / PDF |
| Presets | Load trees shared by several stations |
| Catalog | Store, rack, subrack, gun and gun ammunition definitions (search and filters) |
| Validation | Errors (duplicate codes, invalid nesting, position overflow…) and warnings (stations without loads…) |
| XML Output | Preview and download in the selected format |

**Load tree:** Racks / subracks / stores go under a station, subracks / stores under a rack, stores
under a subrack. Items on the same level are *alternatives*. "Max qty" is the most of that item on
its parent and may not exceed the parent's number of positions.

**Aircraft drawing:** Each aircraft has a drawing type: single-engine fighter (F-16 type), twin-engine
fighter (F-15 / F-4 type), Eurofighter Typhoon (canard delta), CALIDUS B-250 (turboprop light
attack), delta wing, or no drawing. The number and position of stations are free per aircraft: add
them with "Left wing / Fuselage / Right wing", drag markers to move them, "Auto layout" re-spaces
them. The drawings are schematic and not to scale.

**Numbering:** Main stations are numbered automatically from 1, left to right by their position on
the drawing (refreshed on move, add and delete). Location (left / centre / right) is also derived
from the drawing.

**Side stations:** A station can have side stations such as 5L, 5R or a custom suffix (e.g. 5A).
They have their own load rules and are linked to the parent with the `parent` attribute in XML.

**Guns:** "Gun (GUN)" adds an unnumbered gun station (GUN1, GUN2 when there are several). Rule
structure: gun station → gun → gun ammunition (max rounds). Gun pods (e.g. GPU-5/A) may also be
fitted under a rack. Exceeding the gun's round capacity is an error; a caliber mismatch between gun
and ammunition is a warning. In XML: `<Station type="GUN">`, `<Gun caliber capacity>` and
`<Ammo caliber type>`.

**Standard catalog:** 92 stores using public designations (air-to-air / air-to-ground / cruise
missiles, general purpose, laser- and GPS-guided bombs, Turkish guidance kits, cluster bombs,
rockets, practice bombs, tanks, pods), 15 racks (MAU-12, LAU-129, LAU-117, LAU-88, rocket
launchers…), 8 subracks (TER-9, MER-10, BRU-57, BRU-61…), 13 guns and 22 gun ammunition types. New
projects start with this catalog; older projects get the missing items on open, and untouched
entries still carrying the earlier Turkish names are translated to English (edited entries are
left alone). "Add standard catalog" does the same by hand. Gun capacities vary by aircraft; verify
them with your own data. The compatibilities in the sample project are for demonstration only and
must be checked against real technical data.

**Copying:** In the station panel, "→ 7" copies the rules to the symmetric station in one click;
"Copy…" copies them to selected stations (replace / append). "Duplicate" in the aircraft info copies
the aircraft with all its stations, loads and rules (to create a variant).

**Presets:** A shared load tree (e.g. AAM-RAIL: LAU-129 → AIM-9X / AIM-9M / AIM-120C) is defined
once and added to stations with "+ Preset"; changing the preset updates every station that uses it.
"Make preset" turns a station's loads into a preset. Presets are expanded in the XML and the matrix.
Projects saved by earlier versions (which called presets "packages") are converted automatically.

**Cross-station rules:** Symmetric, Mutually exclusive, Requires, Total limit.

## File structure

```
index.html             UI skeleton
css/style.css
js/model.js            data model, standard catalog, sample data, validation
js/aircraft-shapes.js  aircraft drawings and station layout
js/xml-export.js       XML export formats (exporters)
js/app.js              user interface
tools/build-single.js  single-file HTML build
dist/                  single-file version
tests/                 Node tests
```

## Target XML format

The current "Generic XML" is an interim format. For the target software's format a new exporter
will be added to the `EXPORTERS` object in `js/xml-export.js`; the rule editor will not change.
