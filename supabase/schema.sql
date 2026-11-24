begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('advisor','client')),
  last_portal_login_at timestamptz
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null default auth.uid() references public.profiles(id),
  user_id uuid unique references public.profiles(id) on delete set null,
  company text not null check (length(btrim(company)) > 0),
  tax_number text not null check (tax_number ~ '^[0-9]{10}([0-9])?$'),
  phone text not null check (length(btrim(phone)) > 0),
  last_data_at timestamptz,
  unique (advisor_id, tax_number)
);
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  advisor_id uuid not null references public.profiles(id),
  filename text not null,
  fingerprint text not null,
  row_count integer not null,
  created_at timestamptz not null default now(),
  unique (advisor_id, fingerprint)
);
create table public.official_invoices (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id),
  batch_id uuid not null references public.import_batches(id),
  issued_on date not null check (issued_on between date '1900-01-01' and date '9999-12-31'),
  company text not null check (length(btrim(company)) > 0),
  direction text not null check (direction in ('sale','purchase')),
  amount numeric(16,2) not null check (amount >= 0 and amount <> 'NaN'::numeric),
  vat numeric(16,2) not null check (vat >= 0 and vat <= amount and vat <> 'NaN'::numeric)
);
create index invoices_client_date on public.official_invoices(client_id, issued_on desc, id desc);
create table public.monthly_summaries (
  client_id uuid not null references public.clients(id),
  month date not null,
  sales numeric not null,
  purchases numeric not null,
  sales_vat numeric not null,
  purchase_vat numeric not null,
  estimated_vat numeric generated always as (sales_vat - purchase_vat) stored,
  primary key (client_id, month)
);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.import_batches enable row level security;
alter table public.official_invoices enable row level security;
alter table public.monthly_summaries enable row level security;
revoke all on public.profiles, public.clients, public.import_batches, public.official_invoices, public.monthly_summaries from public, anon, authenticated;
grant select on public.profiles, public.clients, public.import_batches, public.official_invoices, public.monthly_summaries to authenticated;
grant insert (company, tax_number, phone) on public.clients to authenticated;

create policy client_read on public.clients for select to authenticated
using (advisor_id = (select auth.uid()) or user_id = (select auth.uid()));
create policy profile_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or exists (select 1 from public.clients c where c.user_id = profiles.id and c.advisor_id = (select auth.uid())));
create function public.is_portal_advisor() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'advisor');
$$;
revoke all on function public.is_portal_advisor() from public, anon, authenticated;
grant execute on function public.is_portal_advisor() to authenticated;
create policy advisor_add on public.clients for insert to authenticated
with check (advisor_id = (select auth.uid()) and user_id is null and (select public.is_portal_advisor()));
create policy batch_read on public.import_batches for select to authenticated using (advisor_id = (select auth.uid()));
create policy invoice_read on public.official_invoices for select to authenticated
using (exists (select 1 from public.clients c where c.id = official_invoices.client_id));
create policy summary_read on public.monthly_summaries for select to authenticated
using (exists (select 1 from public.clients c where c.id = monthly_summaries.client_id));

create function public.record_portal_login() returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set last_portal_login_at = now()
  where id = auth.uid() and role = 'client';
$$;

create function public.import_invoices(p_filename text, p_rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  batch uuid;
  content_hash text;
  missing_tax text;
  total integer;
begin
  if not exists (select 1 from public.profiles where id = actor and role = 'advisor') then
    raise exception 'Bu işlem için mali müşavir yetkisi gerekir.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Fatura listesi geçersiz.';
  end if;
  total := jsonb_array_length(p_rows);
  if total < 1 or total > 10000 or length(coalesce(p_filename, '')) not between 1 and 255 then
    raise exception 'Dosya adı veya satır sayısı geçersiz.';
  end if;

  perform 1 from public.profiles where id = actor for update;
  select md5(jsonb_agg(entry order by entry)::text) into content_hash
  from jsonb_array_elements(p_rows) as rows(entry);
  insert into public.import_batches (advisor_id, filename, fingerprint, row_count)
  values (actor, p_filename, content_hash, total)
  on conflict (advisor_id, fingerprint) do nothing
  returning id into batch;
  if batch is null then
    return 0;
  end if;

  select coalesce(r.tax_number, '(boş)') into missing_tax
  from jsonb_to_recordset(p_rows) as r(tax_number text)
  where not exists (select 1 from public.clients c where c.advisor_id = actor and c.tax_number = r.tax_number)
  limit 1;
  if found then
    raise exception 'Mükellef bulunamadı: %', missing_tax;
  end if;

  insert into public.official_invoices (client_id, batch_id, issued_on, company, direction, amount, vat)
  select c.id, batch, r.issued_on, r.company, r.direction, r.amount, r.vat
  from jsonb_to_recordset(p_rows) as r(tax_number text, issued_on date, company text, direction text, amount numeric, vat numeric)
  join public.clients c on c.advisor_id = actor and c.tax_number = r.tax_number;

  insert into public.monthly_summaries (client_id, month, sales, purchases, sales_vat, purchase_vat)
  select i.client_id, affected.month,
    coalesce(sum(i.amount) filter (where i.direction = 'sale'), 0),
    coalesce(sum(i.amount) filter (where i.direction = 'purchase'), 0),
    coalesce(sum(i.vat) filter (where i.direction = 'sale'), 0),
    coalesce(sum(i.vat) filter (where i.direction = 'purchase'), 0)
  from (
    select distinct client_id, date_trunc('month', issued_on::timestamp)::date as month
    from public.official_invoices where batch_id = batch
  ) affected
  join public.official_invoices i on i.client_id = affected.client_id
    and i.issued_on >= affected.month and i.issued_on < affected.month + interval '1 month'
  group by i.client_id, affected.month
  on conflict (client_id, month) do update set sales = excluded.sales, purchases = excluded.purchases,
    sales_vat = excluded.sales_vat, purchase_vat = excluded.purchase_vat;

  update public.clients c set last_data_at = clock_timestamp()
  where exists (select 1 from public.official_invoices i where i.batch_id = batch and i.client_id = c.id);
  return total;
end;
$$;
revoke all on function public.record_portal_login(), public.import_invoices(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_portal_login(), public.import_invoices(text, jsonb) to authenticated;
commit;
