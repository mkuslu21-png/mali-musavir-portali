begin;

create table public.client_invitations (
  client_id uuid primary key references public.clients(id) on delete cascade,
  email text not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null
);
alter table public.client_invitations enable row level security;
revoke all on public.client_invitations from public, anon, authenticated;

create function public.create_client_invitation(p_client uuid, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  email_address text := lower(btrim(p_email));
  code text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_portal_advisor() then raise exception 'Mali müşavir yetkisi gerekir.'; end if;
  if email_address is null or length(email_address) > 254 or email_address !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Geçerli bir e-posta girin.';
  end if;
  perform 1 from public.clients where id = p_client and advisor_id = actor and user_id is null for update;
  if not found then raise exception 'Firma bulunamadı veya bir hesaba zaten bağlı.'; end if;
  insert into public.client_invitations (client_id, email, token_hash, expires_at)
  values (p_client, email_address, sha256(convert_to(code,'UTF8')), now() + interval '48 hours')
  on conflict (client_id) do update set email = excluded.email, token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return code;
end;
$$;

create function public.accept_client_invitation(p_tax text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  account_email text;
  target_client uuid;
  digest bytea := sha256(convert_to(lower(btrim(p_code)), 'UTF8'));
begin
  if actor is null then raise exception 'Önce hesabınıza giriş yapın.'; end if;
  -- Serialize claims made by the same Auth account, including accounts without a profile.
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 62403));
  select lower(email) into account_email from auth.users where id = actor and email_confirmed_at is not null;
  if account_email is null then raise exception 'Önce e-posta adresinizi doğrulayın.'; end if;
  if exists (select 1 from public.profiles where id = actor and role <> 'client')
      or exists (select 1 from public.clients where user_id = actor) then
    raise exception 'Bu hesap bir firmaya bağlanamaz veya zaten bağlı.';
  end if;
  select c.id into target_client
  from public.clients c join public.client_invitations i on i.client_id = c.id
  where i.token_hash = digest and c.tax_number = btrim(p_tax)
    and i.email = account_email and i.expires_at > now() and c.user_id is null
  for update of c;
  -- A regeneration may have replaced the invitation while waiting for the client lock.
  if target_client is null or not exists (
    select 1 from public.client_invitations i where i.client_id = target_client
      and i.token_hash = digest and i.email = account_email and i.expires_at > clock_timestamp()
  ) then raise exception 'Davet kodu, vergi numarası veya e-posta eşleşmiyor. Davet süresi dolmuş olabilir.'; end if;
  insert into public.profiles (id, role) values (actor, 'client') on conflict (id) do nothing;
  if not exists (select 1 from public.profiles where id = actor and role = 'client') then
    raise exception 'Bu hesaba mükellef rolü atanamadı.';
  end if;
  update public.clients set user_id = actor where id = target_client;
  delete from public.client_invitations where client_id = target_client;
end;
$$;

create function public.delete_portal_records(p_client uuid, p_invoice bigint default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  period date;
begin
  if not public.is_portal_advisor() then raise exception 'Mali müşavir yetkisi gerekir.'; end if;
  -- Use the same advisor lock as import_invoices so a concurrent import cannot overwrite a recalculated summary.
  perform 1 from public.profiles where id = actor for update;
  perform 1 from public.clients where id = p_client and advisor_id = actor for update;
  if not found then raise exception 'Mükellef bulunamadı.'; end if;

  if p_invoice is null then
    delete from public.official_invoices where client_id = p_client;
    delete from public.monthly_summaries where client_id = p_client;
    delete from public.clients where id = p_client;
  else
    delete from public.official_invoices where client_id = p_client and id = p_invoice
    returning date_trunc('month', issued_on::timestamp)::date into period;
    if not found then raise exception 'Fatura bulunamadı.'; end if;
    delete from public.monthly_summaries where client_id = p_client and month = period;
    insert into public.monthly_summaries (client_id, month, sales, purchases, sales_vat, purchase_vat)
    select p_client, period,
      coalesce(sum(amount) filter (where direction='sale'),0),
      coalesce(sum(amount) filter (where direction='purchase'),0),
      coalesce(sum(vat) filter (where direction='sale'),0),
      coalesce(sum(vat) filter (where direction='purchase'),0)
    from public.official_invoices
    where client_id = p_client and issued_on >= period and issued_on < period + interval '1 month'
    having count(*) > 0;
    update public.clients set last_data_at = clock_timestamp() where id = p_client;
  end if;

  -- Keep shared batches and their fingerprints so reimporting the same file cannot duplicate surviving invoices.
  delete from public.import_batches b where b.advisor_id = actor
    and not exists (select 1 from public.official_invoices i where i.batch_id = b.id);
end;
$$;

revoke all on function public.create_client_invitation(uuid,text),
  public.accept_client_invitation(text,text), public.delete_portal_records(uuid,bigint)
  from public, anon, authenticated;
grant execute on function public.create_client_invitation(uuid,text),
  public.accept_client_invitation(text,text), public.delete_portal_records(uuid,bigint)
  to authenticated;
notify pgrst, 'reload schema';
commit;
