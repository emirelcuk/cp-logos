/*
 * Uygulamayı tek bir HTML dosyasında birleştirir (CSS ve JS satır içi).
 * Çıktı: dist/yukleme-kurallari.html — kurulum gerektirmeden çift tıklayarak açılır.
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
  if (/<\/script/i.test(js)) throw new Error(src + ' içinde </script> geçiyor; satır içi gömülemez.');
  return '<script>\n' + js + '</script>';
});

const out = path.join(root, 'dist', 'yukleme-kurallari.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('Yazıldı: ' + path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');
