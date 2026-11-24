# Mali Müşavir Portalı

Mali müşavirler için mükellef takibi ve toplu fatura aktarımı. Mükellefler giriş yaptıktan sonra kendi faturalarını ve aylık KDV tahminlerini izler.

## Yerel kurulum

Node.js 22 veya üzeri ile:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` mevcutsa kopyalama adımını atlayın. Proje kök URL'sini ve Supabase publishable veya anon anahtarını kullanın. Portal http://localhost:3000 adresinde açılır.

## Supabase ve hesaplar

1. Yeni projenin Supabase SQL Editor ekranında [şemayı](supabase/schema.sql) bir kere çalıştırın.
2. Supabase Authentication → Users bölümünde mali müşavir ve mükellef için e-posta/şifre hesabı oluşturun.
3. SQL Editor üzerinden kullanıcı UUID'leri ile rolleri atayın.
4. Mali müşavir panelinden mükellef kaydını ekleyin. Mükellef oturumunu ilgili kayda aşağıdaki sorguyla bağlayın.

```sql
insert into public.profiles (id, role) values
  ('ADVISOR_AUTH_UUID', 'advisor'),
  ('CLIENT_AUTH_UUID', 'client');

update public.clients
set user_id = 'CLIENT_AUTH_UUID'
where advisor_id = 'ADVISOR_AUTH_UUID' and tax_number = '0123456789';
```

Hesap ve rol atamalarını Supabase yöneticisi yapar. Portal, mükellef hesabına bağlı tek firmanın verilerini RLS ile sınırlar. Son portal girişi, mükellefin kimliğiyle açılan portal oturumunda kaydedilir.

## İçe aktarma

İlk Excel sayfası veya CSV başlık satırı içermelidir. Örnek CSV:

```csv
VKN;Tarih;Firma;Tür;Tutar;KDV
0123456789;2026-11-04;Örnek Alıcı;Satış;1200,00;200,00
0123456789;2026-11-06;Örnek Tedarikçi;Alış;600,00;100,00
```

- VKN/TCKN, paneldeki mükellefe ait olmalı. Baştaki sıfırları korumak için Excel hücresini metin olarak biçimlendirin.
- Tutar KDV dahil fatura toplamıdır. Tarih için Excel tarih hücresi, YYYY-AA-GG ya da GG.AA.YYYY kullanın.
- Dosya başına 5 MB ve 10.000 satır sınırı vardır. Geçersiz satır ya da eşleşmeyen VKN varsa aktarım geri alınır. Aynı satır grubu yeniden yüklenirse veritabanı onu tekrar eklemez. Kısmen örtüşen farklı dosyalardaki aynı faturalar ayrı kayıt sayılır.
- Tahmini KDV, satış KDV toplamından alış KDV toplamı çıkarılarak hesaplanır. Tarih ve saat gösterimi Türkiye saatine göredir.

## Kontroller

```sh
npx tsc --noEmit
npm run lint
npm run build
```
