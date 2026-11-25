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

## Davetle mükellef kaydı ve veri yönetimi

Supabase SQL Editor'da temel şemanın ardından [portal yönetimi geçişini](supabase/migrations/202611240002_portal_management.sql) uygulayın. Yeni hesap açmak için Supabase Auth e-posta kaydı etkin olmalı ve portal adresi Auth yönlendirme adreslerine eklenmelidir.

Mali müşavir, mükellef tablosundaki **Yönet** düğmesinden firmanın e-posta adresi için 48 saatlik kod üretir. Mükellef, doğrulanmış hesabında vergi numarasını ve davet kodunu girerek kendi firmasına bağlanır. Daveti kabul eden hesap read-only olarak kendi faturalarını görür.

**Yönet** alanında seçili firma ve dönemin faturaları Excel'e indirilebilir. Excel dosyası portalın içe aktarma sütunlarıyla uyumludur. Fatura silmek dönem özetini yeniden hesaplar. Mükellefi silmek firmanın faturalarını, özetlerini ve davetini kaldırır, Auth hesabını korur.

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

## Üretim teknik durumu

### Ön yüz

Next.js App Router, React, TypeScript ve Tailwind CSS kullanır. `/` uygulamanın giriş noktasıdır. Oturumu olmayan ziyaretçiye giriş veya davetli kayıt formu gösterilir. Geçerli Auth oturumu olan hesabın portal rolü `profiles` tablosundan yüklenir. `/ornek` ana sayfaya yönlenir.

- **Mali müşavir paneli** dönem seçimi, firma adı ve VKN/TCKN araması, portal hesabı bağlantısı filtresi ve 25 satırlık tablo sayfaları sunar. Mükellef listesi ayrı yüklenir. Dönem değiştiğinde sadece görünür firmaların aylık özetleri ve son giriş bilgileri sorgulanır. Kapsam değiştiğinde eski sorgu iptal edilir. Hata durumunda yeniden deneme kullanılabilir.
- **Mükellef paneli** seçili dönemdeki satış ve alış toplamlarını, tahmini KDV'yi, son 20 faturayı ve son muhasebeci güncellemesini gösterir. Mali müşavir önizlemesi aynı görünümü kullanır. Firmaya bağlı olmayan mükellef, davetle firma bağlantısı formunu görür.
- **Veri yönetimi** doğrulanmış e-posta adresine bağlı davet kodu, dönem faturalarının sayfalanması, Excel dışa aktarma ve kalıcı silme öncesi kayıt bazlı onay sunar. Excel dışa aktarma firma ve dönem kapsamındadır. İlk çalışma sayfası yeniden içe aktarmayla uyumludur.
- **Doğrulama** giriş, kayıt, davet ve mükellef ekleme formlarında alanın yanında Türkçe mesaj gösterir. Veri API'si hataları kullanıcıya çevrilir. İç sorgu ayrıntıları ve ham hata mesajları ekrana veya uygulama konsoluna yazılmaz. İçe aktarma ilk sayfayı okur. 5 MB, 10.000 veri satırı ve 256 sütun sınırı vardır. İlk beş hatalı satır alan bilgisiyle gösterilir. Bir satır bile geçersizse aktarım başlamaz.

### Arka uç ve veri modeli

Vercel Next.js uygulamasını barındırır. Uygulama Supabase Auth ve PostgREST Data API ile çalışır. `lib/database.ts` arayüzün kullandığı tablo, sütun ve RPC sözleşmelerini TypeScript'te tanımlar. `NEXT_PUBLIC_SUPABASE_URL` ve `NEXT_PUBLIC_SUPABASE_ANON_KEY` tarayıcı yapılandırmasıdır. Üretim derlemesinde ortam ayarları eksik veya URL geçersizse mevcut portal projesinin yayınlanabilir anahtarı ve proje adresi kullanılır. Yayınlanabilir anahtarla erişimi kullanıcı JWT'si, PostgreSQL yetkileri ve RLS belirler.

| Nesne | Görevi |
| --- | --- |
| `auth.users` | Supabase Auth kimliği ve doğrulanmış e-posta |
| `profiles` | `advisor` veya `client` rolü ve mükellefin son giriş zamanı |
| `clients` | Firma, VKN/TCKN, telefon, sorumlu mali müşavir, bağlı Auth hesabı ve son veri güncellemesi |
| `import_batches` | Yükleme paketi ve aynı satır grubunun tekrar yazılmasını engelleyen parmak izi |
| `official_invoices` | Tarih, karşı firma, yön, brüt tutar, KDV ve aktarım ilişkisi |
| `monthly_summaries` | Firma ve ay bazında satış, alış, satış KDV'si, alış KDV'si ve üretilen tahmini KDV farkı |
| `client_invitations` | Firma başına e-posta, davet kodunun SHA-256 özeti ve son kullanma zamanı |

RLS, danışmanın sahibi olduğu firmalarla mükellefin hesabına bağlanan firmaların erişimini ayırır. Tarayıcıdaki firma sorguları ayrıca oturum kimliğiyle kapsamlanır. Mükellef önizlemesi rol değiştirme veya kimliğe bürünme yapmaz. Anonim kullanıcının finansal tablo erişimi ve davet kabul yetkisi kapalıdır.

`import_invoices` firma eşleşmesi, tekrar kontrolü, fatura yazımı ve dönem hesaplamasını tek işlemde yapar. `create_client_invitation` ve `accept_client_invitation` 48 saatlik tek kullanımlık daveti doğrulanmış e-postayla eşleştirir. `delete_portal_records` sahiplik ve rolü veritabanında doğrular, fatura silinince özeti yeniden hesaplar. Aktarım ve silme aynı mali müşavir profil kilidini kullanır. `record_portal_login` mükellefin kendi giriş zamanını kaydeder. Güvenlik belirleyicisi (`SECURITY DEFINER`) kullanan RPC'ler boş `search_path` ile çalışır ve erişimleri açıkça rol bazında verilir.

### Sürüm öncesi kontrol

- [ ] `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run lint` ve `npm run build` çalıştır.
- [ ] `npm audit --omit=dev` sonucunu ve Git diff'ini incele. Ortam dosyaları, kullanıcı verisi veya yönetici anahtarı commit'e girmemeli.
- [ ] Vercel hedef projesini, Supabase proje adresini ve doğru yayınlanabilir anahtarı doğrula. Yönetim geçişinin hedef veritabanında uygulandığını kontrol et.
- [ ] Önizleme ortamında iki ayrı mali müşavir ve bir mükellefle giriş, filtre, yeniden deneme, davet, içe/dışa aktarma ve silme onayını test et. Diğer firmaların verilerinin görünmediğini doğrula.
- [ ] Kuruluş dışındaki bir test adresiyle kayıt doğrulama e-postasının ulaştığını ve dönüş bağlantısının portala geldiğini doğrula. SMTP kullanılabilirliğini kontrol et.
- [ ] GitHub push sonrası Vercel'in doğru commit'i dağıttığını ve üretimde giriş sayfasının açıldığını doğrula.

### Bilinen operasyonel sınırlar

- Kayıt doğrulama e-postasının kuruluş dışına teslimi Supabase SMTP yapılandırmasına bağlıdır. Tarayıcı ve yerel PostgreSQL testleri e-posta teslimini doğrulamaz.
- Firma dizini sayfalı sorgularla alınır, arama tarayıcıda yapılır. Çok büyük müşteri listelerinde sunucu tarafı arama ve anahtar tabanlı sayfalama ayrı bir performans çalışması gerektirebilir.
- XLSX tarayıcıda ayrıştırılır. Boyut ve tablo sınırları vardır. Çok sıkıştırılmış veya hasarlı dosyaların açılış süresi tarayıcıya bağlıdır. Aynı dönemde eşzamanlı değişiklik yapılırken birden fazla sorguyla alınan Excel dışa aktarımı tek veritabanı anlık görüntüsü değildir.
- Silme kalıcıdır. Üretim verisinin geri yüklenebilirliği Supabase yedekleme ayarlarına bağlıdır. KDV, yüklenen satış KDV'si eksi alış KDV'sidir ve resmi beyanname niteliği taşımaz.
