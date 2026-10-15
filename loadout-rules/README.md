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
| Katalog | Mühimmat, rack, subrack, top ve top mühimmatı tanımları (arama destekli) |
| Doğrulama | Hatalar (tekrarlanan kod, geçersiz yerleşim, pozisyon aşımı…) ve uyarılar (yük izni tanımsız istasyon…) |
| XML Çıktısı | Seçilen formatta XML önizleme ve indirme |

**Yükleme ağacı:** İstasyon altına rack / subrack / mühimmat, rack altına subrack / mühimmat,
subrack altına mühimmat eklenir. Aynı seviyedeki öğeler birbirinin *alternatifidir*.
"Maks. adet", öğenin üst seviyeye en fazla kaç adet takılabileceğidir ve üst öğenin pozisyon
sayısını aşamaz.

**Uçak çizimi:** Her uçak için bir çizim tipi seçilir (tek motorlu, çift motorlu, delta kanat,
çizimsiz). İstasyon sayısı ve yeri uçağa göre serbesttir: "+ Sol kanat / + Gövde / + Sağ kanat"
ile istasyon eklenir, işaret sürüklenerek taşınır, "Otomatik yerleştir" eşit aralıklarla dizer.
Çizimler şematiktir, gerçek ölçü içermez.

**Numaralandırma:** Ana istasyonlar çizimdeki konuma göre soldan sağa 1'den başlayarak otomatik
numaralanır (taşıma, ekleme ve silmede yenilenir). Konum (sol / merkez / sağ) da çizimden çıkarılır.

**Ek takma noktaları:** Bir istasyona 5L, 5R veya özel son ekli (ör. 5A) ek noktalar eklenebilir.
Ek noktaların kendi yük kuralları vardır; XML'de `parent` özelliğiyle ana istasyona bağlanır.

**Top (gun):** "Top (GUN)" düğmesiyle numarasız bir top istasyonu eklenir (birden fazlaysa GUN1,
GUN2). Kural yapısı: Top istasyonu → Top → Top mühimmatı (Maks. mermi). Top podları (ör. GPU-5/A)
rack altına da takılabilir. Mermi adedi topun mermi kapasitesini aşarsa hata, top ile mühimmatın
çapı uyuşmazsa uyarı verilir. XML'de `<Station type="GUN">`, `<Gun caliber capacity>` ve
`<Ammo caliber type>` olarak yazılır.

**Standart katalog:** Katalog sekmesindeki "Standart katalogu ekle" düğmesi MK-82, GBU-12, AIM-9,
AIM-120, MAU-12, LAU-129, TER-9, BRU-57, M61A1, GAU-8/A, PGU-28/B gibi kamuya açık tanımlamalardan
eksik olanları ekler. Top kapasiteleri uçağa göre değişir; kendi verinizle doğrulayın.
Örnek projedeki uyumluluklar gösterim amaçlıdır; gerçek teknik verilerle doğrulanmalıdır.

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
