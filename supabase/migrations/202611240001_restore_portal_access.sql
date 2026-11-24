-- Run against a database initialized with supabase/schema.sql.
begin;

-- Stop if the named portal policies are missing or any additional policies
-- could change who can use the restored privileges.
do $$
declare
  policy_mismatch boolean;
begin
  with expected(tablename, policyname, cmd) as (
    values ('profiles', 'profile_read', 'SELECT'),
           ('clients', 'client_read', 'SELECT'),
           ('clients', 'advisor_add', 'INSERT'),
           ('import_batches', 'batch_read', 'SELECT'),
           ('official_invoices', 'invoice_read', 'SELECT'),
           ('monthly_summaries', 'summary_read', 'SELECT')
  ), actual as (
    select tablename::text, policyname::text, cmd
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'clients', 'import_batches', 'official_invoices', 'monthly_summaries')
      and roles = array['authenticated']::name[]
      and permissive = 'PERMISSIVE'
  )
  select exists ((select * from expected except select * from actual)
              union all
                 (select * from actual except select * from expected))
    into policy_mismatch;

  if policy_mismatch or exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'clients', 'import_batches', 'official_invoices', 'monthly_summaries')
      and (roles <> array['authenticated']::name[] or permissive <> 'PERMISSIVE')
  ) then
    raise exception 'Portal policies differ from schema.sql. Inspect before restoring grants.';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.import_batches enable row level security;
alter table public.official_invoices enable row level security;
alter table public.monthly_summaries enable row level security;

-- Restore the same predicates as schema.sql before restoring table access.
alter policy client_read on public.clients
  using (advisor_id = (select auth.uid()) or user_id = (select auth.uid()));
alter policy profile_read on public.profiles
  using (id = (select auth.uid()) or exists (
    select 1 from public.clients c where c.user_id = profiles.id and c.advisor_id = (select auth.uid())
  ));
alter policy advisor_add on public.clients
  with check (advisor_id = (select auth.uid()) and user_id is null and (select public.is_portal_advisor()));
alter policy batch_read on public.import_batches
  using (advisor_id = (select auth.uid()));
alter policy invoice_read on public.official_invoices
  using (exists (select 1 from public.clients c where c.id = official_invoices.client_id));
alter policy summary_read on public.monthly_summaries
  using (exists (select 1 from public.clients c where c.id = monthly_summaries.client_id));

revoke all on table public.profiles, public.clients, public.import_batches,
  public.official_invoices, public.monthly_summaries from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles, public.clients, public.import_batches,
  public.official_invoices, public.monthly_summaries to authenticated;
grant insert (company, tax_number, phone) on public.clients to authenticated;

revoke all on function public.is_portal_advisor(), public.record_portal_login(),
  public.import_invoices(text, jsonb) from public, anon, authenticated;
grant execute on function public.is_portal_advisor(), public.record_portal_login(),
  public.import_invoices(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
