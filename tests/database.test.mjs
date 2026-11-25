import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const readSql = (path) => readFile(new URL(`../supabase/${path}`, import.meta.url), "utf8");
const ids = Array.from({ length: 4 }, (_, index) => `00000000-0000-0000-0000-00000000000${index + 1}`);
const [firstAdvisor, secondAdvisor, client, otherClient] = ids;
const sale = { tax_number: "0123456789", issued_on: "2026-11-04", company: "Alıcı", direction: "sale", amount: 1200, vat: 200 };
const purchase = { ...sale, company: "Tedarikçi", direction: "purchase", amount: 600, vat: 100 };

test("PostgreSQL grants, RLS, invitations, atomic imports and deletion", async () => {
  const db = new PGlite();
  const query = (sql, values) => db.query(sql, values);
  const first = async (sql, values) => (await query(sql, values)).rows[0];
  const actor = async (id) => {
    await db.exec("reset role; set role authenticated");
    await query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  };
  const addClient = async () => (await first(`
    insert into public.clients(company, tax_number, phone)
    values ('Firma', '0123456789', '5551234567') returning id`)).id;
  const ingest = (rows) => first("select public.import_invoices('faturalar.csv', $1) as count", [JSON.stringify(rows)]);
  const accept = (tax, code) => query("select public.accept_client_invitation($1, $2)", [tax, code]);

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to authenticated;
    `);
    await db.exec(await readSql("schema.sql"));
    await db.exec("revoke select on public.profiles from authenticated");
    const repair = await readSql("migrations/202611240001_restore_portal_access.sql");
    await db.exec(repair);
    await db.exec(repair);
    await db.exec(await readSql("migrations/202611240002_portal_management.sql"));

    assert.equal((await first("select has_table_privilege('anon','public.profiles','select') as allowed")).allowed, false);
    assert.equal((await first("select has_function_privilege('anon','public.accept_client_invitation(text,text)','execute') as allowed")).allowed, false);
    for (const [index, id] of ids.entries()) {
      await query("insert into auth.users values ($1, $2, now())", [id, `test${index}@example.test`]);
    }
    for (const id of [firstAdvisor, secondAdvisor]) {
      await query("insert into public.profiles(id,role) values ($1,'advisor')", [id]);
    }

    await actor(firstAdvisor);
    const clientId = await addClient();
    assert.equal((await ingest([sale, purchase])).count, 2);
    assert.equal((await ingest([purchase, sale])).count, 0);
    await assert.rejects(ingest([sale, { ...purchase, tax_number: "1234567890" }]), /Mükellef bulunamadı/);
    assert.equal((await first("select count(*)::int as count from public.official_invoices")).count, 2);

    await actor(secondAdvisor);
    await addClient();
    assert.equal((await first("select count(*)::int as count from public.official_invoices")).count, 0);
    await assert.rejects(query("select public.delete_portal_records($1)", [clientId]), /Mükellef bulunamadı/);
    assert.equal((await ingest([{ ...sale, vat: 80 }])).count, 1);

    await actor(firstAdvisor);
    const invitation = async () => (await first("select public.create_client_invitation($1,'test2@example.test') as code", [clientId])).code;
    const oldCode = await invitation();
    const code = await invitation();

    await actor(otherClient);
    await assert.rejects(accept(sale.tax_number, code), /eşleşmiyor/);
    await actor(client);
    await assert.rejects(accept(sale.tax_number, oldCode), /eşleşmiyor/);
    await assert.rejects(accept("1234567890", code), /eşleşmiyor/);
    await accept(sale.tax_number, code);
    await assert.rejects(accept(sale.tax_number, code), /zaten bağlı/);
    assert.equal((await first("select id from public.clients")).id, clientId);
    assert.equal((await first("select count(*)::int as count from public.official_invoices")).count, 2);
    assert.equal((await first("select estimated_vat from public.monthly_summaries")).estimated_vat, "100.00");
    await assert.rejects(query("select public.delete_portal_records($1)", [clientId]), /Mali müşavir yetkisi/);
    await assert.rejects(db.exec("update public.official_invoices set amount = 0"), /permission denied/);
    await db.exec("select public.record_portal_login()");

    await actor(firstAdvisor);
    assert.ok((await first("select last_portal_login_at from public.profiles where role='client'")).last_portal_login_at);
    const invoice = await first("select id from public.official_invoices where direction='purchase'");
    await query("select public.delete_portal_records($1,$2)", [clientId, invoice.id]);
    assert.equal((await first("select estimated_vat from public.monthly_summaries")).estimated_vat, "200.00");
    await query("select public.delete_portal_records($1)", [clientId]);
    assert.equal((await first("select count(*)::int as count from public.import_batches")).count, 0);

    await actor(client);
    assert.equal((await first("select count(*)::int as count from public.clients")).count, 0);
    await actor(secondAdvisor);
    assert.equal((await first("select count(*)::int as count from public.official_invoices")).count, 1);
  } finally {
    await db.close();
  }
});
