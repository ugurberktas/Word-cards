# English Vocabulary

HTML, CSS ve Vanilla JavaScript ile çalışan kişisel İngilizce kelime ve gramer çalışma uygulaması.

## Çalıştırma

`index.html` dosyasını tarayıcıda açın. Yerel sunucu gerekmez. Geliştirme sırasında isterseniz proje klasöründe `python3 -m http.server 4185` çalıştırabilirsiniz.

## Bölümler

- Beş ana kategori, 45 alt kategori ve 1.248 kelime/ifade kartı
- Kart arşivi ve 3D kart çevirme
- Alt kategorideki tüm kelimeleri kapsayan ezber turu; bilinmeyen kartlar tekrar sıraya girer
- Beş aşamalı, 79 konuluk gramer çalışma planı

Kelime turu ve gramer tikleri tarayıcının `localStorage` alanında ayrı anahtarlarla saklanır. Tarayıcı verilerini temizlemek bu kayıtları kaldırır.

## Veri ve test

Kategoriler `js/categories.js`, kelimeler `js/words.js`, gramer planı `js/grammar.js` içindedir. Çalışma sırası ve tekrar mantığı `js/study.js` dosyasındadır.

Node.js kuruluysa veri ve algoritma kontrollerini çalıştırın:

```sh
node --test tests/data.test.js
```
