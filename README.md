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

Dağıtım ortamında `NEXT_PUBLIC_SUPABASE_URL` için Supabase'in HTTP(S) proje adresini, `NEXT_PUBLIC_SUPABASE_ANON_KEY` için publishable veya anon anahtarını girin. Next.js bu değerleri derleme sırasında uygulamaya ekler. Değerleri değiştirdikten sonra yeni bir derleme ve dağıtım yapın. Üretim derlemesinde URL geçersizse veya bir değer eksikse portal, varsayılan Supabase projesinin adresini ve tarayıcıya açık publishable anahtarını birlikte kullanır. Başka bir Supabase projesine bağlanmak için her iki değişkeni birlikte tanımlayın. Geliştirme ortamı yerel bağlantı ayarlarını gerektirir.

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

## Girişte profil erişimi (42501)

Auth oturumu açıldıktan sonra profil sorgusu `42501` döndürürse, Supabase SQL Editor'da önce izinleri kontrol edin:

```sql
select has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  as profile_select_allowed;
```

Veritabanı portalın şemasıyla kurulmuşsa [erişim onarımını](supabase/migrations/202611240001_restore_portal_access.sql) SQL Editor'da çalıştırın. Onarım, portalın RLS politikalarını doğrular ve oturum açmış kullanıcılar için gerekli izinleri geri yükler. Farklı politikalar algılarsa işlemi geri alır. Portal hesabına rol atanması yukarıdaki SQL adımıyla yapılır.

Hata oturum oluşmadan çıkıyorsa önce Supabase Auth ve Postgres loglarına bakın. Giriş isteği sırasında `auth.users` üzerinde çalışan özel bir tetikleyici `profiles` erişim hatası oluşturabilir. İlgili tetikleyiciyi bulmak için:

```sql
select t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as trigger_definition,
       t.tgfoid::regprocedure as trigger_function,
       p.prosecdef as security_definer
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
```

Auth tetikleyicileri API kullanıcı izinlerinden ayrı çalışır. Günlüklerde hata veren tetikleyicinin işlevini ve sahipliğini inceleyin.

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
