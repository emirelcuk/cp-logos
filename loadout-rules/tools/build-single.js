/*
 * Bundles the app into a single HTML file (CSS and JS inlined).
 * Output: dist/loadout-rules.html — opens with a double click, no installation needed.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = function (rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); };

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', function () {
  return '<style>\n' + read('css/style.css') + '</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  const js = read(src);
  if (/<\/script/i.test(js)) throw new Error(src + ' contains </script>; it cannot be inlined.');
  return '<script>\n' + js + '</script>';
});

const out = path.join(root, 'dist', 'loadout-rules.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Written: ' + path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');
