# English Vocabulary

HTML, CSS ve Vanilla JavaScript ile çalışan kişisel İngilizce kelime ve gramer çalışma uygulaması.

## Çalıştırma

`index.html` dosyasını tarayıcıda açın. Yerel sunucu gerekmez. Geliştirme sırasında isterseniz proje klasöründe `python3 -m http.server 4185` çalıştırabilirsiniz.

## Bölümler

- Beş ana kategori, 45 alt kategori ve 1.248 kelime/ifade kartı
- Kart arşivi, en fazla 25 kelimelik dengeli partlar ve 3D kart çevirme
- En fazla 20 kelimelik ezber turu; bilinmeyen kartlar tekrar sıraya girer
- Beş aşamalı, 79 konuluk gramer çalışma planı

Kelime turu ve gramer tikleri tarayıcının `localStorage` alanında ayrı anahtarlarla saklanır. Tarayıcı verilerini temizlemek bu kayıtları kaldırır.

## Veri ve test

Kategoriler `js/categories.js`, kelimeler `js/words.js`, gramer planı `js/grammar.js` içindedir. Part ve çalışma seçim mantığı sırasıyla `js/parts.js` ve `js/study.js` dosyalarındadır.

Node.js kuruluysa veri ve algoritma kontrollerini çalıştırın:

```sh
node --test tests/data.test.js
```
