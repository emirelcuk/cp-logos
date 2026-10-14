# Yükleme Kuralları Editörü

Savaş uçaklarının istasyonlarına hangi **rack**, **subrack** ve **mühimmatın** takılabileceğini
tanımlamak ve bu kuralları **XML**'e çevirmek için bir uygulama.

## Çalıştırma

Kurulum gerektirmez, internet bağlantısı gerektirmez. `index.html` dosyasını tarayıcıda açın.

- Çalışma tarayıcıda otomatik saklanır (localStorage).
- **Kaydet (JSON)** / **Aç (JSON)** ile projeyi dosya olarak saklayıp paylaşabilirsiniz.
- Testler: `npm test` (Node 18+).

## Kavramlar

| Sekme | İçerik |
|---|---|
| Katalog | Mühimmat, rack ve subrack tanımları (kod, ağırlık, pozisyon sayısı, taşıma limiti) |
| Uçaklar ve İstasyonlar | Uçak → istasyonlar → her istasyon için izin verilen yükleme ağacı, istasyonlar arası kurallar |
| Doğrulama | Hatalar (tekrarlanan kod, geçersiz yerleşim, pozisyon aşımı…) ve uyarılar (ağırlık limiti…) |
| XML Çıktısı | Seçilen formatta XML önizleme ve indirme |

**Yükleme ağacı:** İstasyon altına rack / subrack / mühimmat, rack altına subrack / mühimmat,
subrack altına mühimmat eklenir. Aynı seviyedeki öğeler birbirinin *alternatifidir*.
"Maks. adet", öğenin üst seviyeye en fazla kaç adet takılabileceğidir ve üst öğenin pozisyon
sayısını aşamaz.

**İstasyonlar arası kurallar:** Simetrik, Birbirini dışlar, Gerektirir, Toplam üst sınır.

## Dosya yapısı

```
index.html          arayüz iskeleti
css/style.css
js/model.js         veri modeli, örnek veri, doğrulama
js/xml-export.js    XML dışa aktarım formatları (exporter'lar)
js/app.js           arayüz
tests/              Node testleri
```

## Hedef XML formatı

Şu anki "Genel XML" geçici bir formattır. Hedef yazılımın formatı için `js/xml-export.js`
içindeki `EXPORTERS` nesnesine yeni bir exporter eklenecek; kural tanımlama arayüzü değişmeyecek.
