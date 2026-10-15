# Yükleme Kuralları Editörü

Savaş uçaklarının istasyonlarına hangi **rack**, **subrack** ve **mühimmatın** takılabileceğini
tanımlamak ve bu kuralları **XML**'e çevirmek için bir uygulama.

## Çalıştırma

Kurulum gerektirmez, internet bağlantısı gerektirmez. `index.html` dosyasını tarayıcıda açın.

Tek dosyalık sürüm: `dist/yukleme-kurallari.html` (USB ile taşınabilir). Kaynak değiştiğinde
`npm run build` ile yeniden üretilir.

- Çalışma tarayıcıda otomatik saklanır (localStorage).
- **Kaydet (JSON)** / **Aç (JSON)** ile projeyi dosya olarak saklayıp paylaşabilirsiniz.
- Testler: `npm test` (Node 18+).

## Kavramlar

| Sekme | İçerik |
|---|---|
| Uçaklar (ana sayfa) | Uçağın üstten çizimi üzerinde istasyonlar; istasyona tıklayıp izin verilen yükleme ağacını düzenleme, istasyonlar arası kurallar |
| Katalog | Mühimmat, rack ve subrack tanımları (kod, ad, pozisyon sayısı) |
| Doğrulama | Hatalar (tekrarlanan kod, geçersiz yerleşim, pozisyon aşımı…) ve uyarılar (yük izni tanımsız istasyon…) |
| XML Çıktısı | Seçilen formatta XML önizleme ve indirme |

**Yükleme ağacı:** İstasyon altına rack / subrack / mühimmat, rack altına subrack / mühimmat,
subrack altına mühimmat eklenir. Aynı seviyedeki öğeler birbirinin *alternatifidir*.
"Maks. adet", öğenin üst seviyeye en fazla kaç adet takılabileceğidir ve üst öğenin pozisyon
sayısını aşamaz.

**Uçak çizimi:** Her uçak için bir çizim tipi seçilir (tek motorlu, çift motorlu, delta kanat,
çizimsiz). İstasyon sayısı ve yeri uçağa göre serbesttir: "+ Sol kanat / + Gövde / + Sağ kanat"
ile istasyon eklenir, işaret sürüklenerek taşınır, "Otomatik yerleştir" listedeki sıraya göre dizer.
Çizimler şematiktir, gerçek ölçü içermez.

**İstasyonlar arası kurallar:** Simetrik, Birbirini dışlar, Gerektirir, Toplam üst sınır.

## Dosya yapısı

```
index.html          arayüz iskeleti
css/style.css
js/model.js         veri modeli, örnek veri, doğrulama
js/aircraft-shapes.js  uçak çizimleri ve istasyon yerleşimi
js/xml-export.js    XML dışa aktarım formatları (exporter'lar)
js/app.js           arayüz
tools/build-single.js  tek dosyalık HTML üretimi
dist/               tek dosyalık sürüm
tests/              Node testleri
```

## Hedef XML formatı

Şu anki "Genel XML" geçici bir formattır. Hedef yazılımın formatı için `js/xml-export.js`
içindeki `EXPORTERS` nesnesine yeni bir exporter eklenecek; kural tanımlama arayüzü değişmeyecek.
