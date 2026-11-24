"use client";

import { useState, type FormEvent } from "react";
import { currency, type Client } from "../lib/portal";
import { supabase } from "../lib/supabase";

const pageSize = 50;
type ManagedInvoice = { id: number; issued_on: string; company: string; direction: "sale" | "purchase"; amount: number; vat: number };

async function invoicePage(client: Client, month: string, offset: number) {
  const firstDay = `${month}-01`;
  const next = new Date(`${firstDay}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  const { data, error } = await supabase!.from("official_invoices")
    .select("id, issued_on, company, direction, amount, vat")
    .eq("client_id", client.id).gte("issued_on", firstDay).lte("issued_on", next.toISOString().slice(0, 10))
    .order("issued_on", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  return data as ManagedInvoice[];
}

export default function ClientManagement({ client, month, refresh }: { client: Client; month: string; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invite, setInvite] = useState("");
  const [invoices, setInvoices] = useState<ManagedInvoice[]>();
  const [offset, setOffset] = useState(0);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await action(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  async function showPage(nextOffset: number) {
    const rows = await invoicePage(client, month, nextOffset);
    setInvoices(rows);
    setOffset(nextOffset);
  }

  function makeInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setInvite("");
    void run(async () => {
      const { data, error } = await supabase!.rpc("create_client_invitation", { p_client: client.id, p_email: values.get("email") });
      if (error) throw error;
      setInvite(data);
    });
  }

  function remove(invoice?: ManagedInvoice) {
    const message = invoice
      ? `${invoice.company} faturası kalıcı olarak silinsin mi?`
      : `${client.company} ve firmaya ait tüm faturalar kalıcı olarak silinsin mi? Hesabın firma bağlantısı da kalkar.`;
    if (!window.confirm(message)) return;
    void run(async () => {
      const { error } = await supabase!.rpc("delete_portal_records", { p_client: client.id, p_invoice: invoice?.id ?? null });
      if (error) throw error;
      refresh();
      if (invoice) await showPage(0);
    });
  }

  async function exportInvoices() {
    const rows: ManagedInvoice[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await invoicePage(client, month, offset);
      rows.push(...page);
      if (page.length < pageSize) break;
    }
    if (!rows.length) {
      setNotice("Seçili dönemde dışa aktarılacak fatura yok.");
      return;
    }
    const xlsx = await import("xlsx");
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
      ["VKN", "Tarih", "Firma", "Tür", "Tutar", "KDV"],
      ...rows.map((row) => [client.tax_number, row.issued_on, row.company, row.direction === "sale" ? "Satış" : "Alış", row.amount, row.vat]),
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, "Faturalar");
    xlsx.writeFile(workbook, `faturalar-${month}-${client.tax_number}.xlsx`);
  }

  return <section className="panel stack">
    <h2>{client.company} · Veri yönetimi</h2>
    {client.user_id ? <p className="muted">Firma bir mükellef hesabına bağlı.</p> :
      <form onSubmit={makeInvite} className="stack activation">
        <label>Mükellefin e-posta adresi<input name="email" type="email" required maxLength={254} /></label>
        <button disabled={busy}>48 saatlik davet kodu oluştur</button>
      </form>}
    {invite && <div className="success stack" role="status">
      <p>Davet kodunu ve vergi numarasını mükellefle paylaşın. Yeni kod, önceki kodu geçersiz kılar.</p>
      <input aria-label="Davet kodu" value={invite} readOnly onFocus={(event) => event.target.select()} />
    </div>}
    <div className="portal-nav">
      <button disabled={busy} onClick={() => void run(() => showPage(0))}>Dönem faturalarını aç</button>
      <button disabled={busy} onClick={() => void run(exportInvoices)}>Dönemi Excel olarak indir</button>
      <button className="danger" disabled={busy} onClick={() => remove()}>Mükellefi sil</button>
    </div>
    {invoices && <>
      {!invoices.length && <p className="muted">Bu sayfada fatura yok.</p>}
      <ul className="invoice-list">{invoices.map((invoice) => <li key={invoice.id}>
        <div><strong>{invoice.company}</strong><span className="cell-note">{invoice.issued_on} · {currency(invoice.amount)}</span></div>
        <button className="danger" disabled={busy} onClick={() => remove(invoice)}>Faturayı sil</button>
      </li>)}</ul>
      <div className="portal-nav">
        {offset > 0 && <button disabled={busy} onClick={() => void run(() => showPage(offset - pageSize))}>Önceki</button>}
        {invoices.length === pageSize && <button disabled={busy} onClick={() => void run(() => showPage(offset + pageSize))}>Sonraki</button>}
      </div>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {notice && <p className="muted" role="status">{notice}</p>}
  </section>;
}
