# Ev Programi

Duvara monte tablet icin tasarlanmis, Turkce arayuze sahip aile gorev ve odul uygulamasi.

## Ozellikler

- Kiosk odakli ana ekran
- Ebeveyn PIN girisi
- Cocuklar icin profil secimi
- Gorev, harclik ve haftalik planlama
- Supabase tabanli veri modeli
- Framer Motion animasyonlari ve sesli geri bildirim
- Vercel uzerinde calisacak Next.js yapisi

## Kurulum

1. Bagimliliklari yukleyin:

```bash
npm install
```

2. Ortam degiskenlerini hazirlayin:

```bash
copy .env.example .env.local
```

3. `supabase/schema.sql` dosyasini Supabase SQL Editor uzerinden calistirin.

4. Gelistirme sunucusunu baslatin:

```bash
npm run dev
```

## Gerekli ortam degiskenleri

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

## Kurulum akisi

Uygulama ilk acilista aile adi, ebeveyn adi ve PIN ile baslangic kurulumu ister. Isterseniz ornek cocuklar, gorevler ve oduller de otomatik olusturulur.

Supabase baglantisi aktifse ve `families` tablosu bos ise, uygulama ilk `dashboard` yuklemesinde gercek Supabase tablolarina otomatik starter veri ekler. Varsayilan starter ebeveyn PIN'i `1234` olarak olusturulur.

## Kiosk modu

- Android tabletlerde uygulamayi ana ekrana ekleyin.
- iPad icin Safari uzerinden ana ekrana ekleyin.
- Uygulama icindeki `Tam Ekran` dugmesi Fullscreen API destekleyen tarayicilarda tarayici cercevesini gizler.
- Tam kiosk deneyimi icin cihaz seviyesinde tek uygulama modu kullanin.
