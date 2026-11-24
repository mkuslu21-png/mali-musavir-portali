"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Landmark } from "lucide-react";
import type { Client, Invoice } from "../../lib/portal";
import ClientOverview from "../client-overview";

const workshop: Client = {
  id: "example-workshop",
  company: "Çınar Bisiklet Servisi",
  user_id: null,
  tax_number: "",
  phone: "",
  last_data_at: "2026-11-24T16:15:00+03:00",
};

type ExampleInvoice = Invoice & { vat: number };
const invoices: ExampleInvoice[] = [
  { id: 12, issued_on: "2026-11-24", company: "Site yönetimi · 6 bisikletin bakımı", direction: "sale", amount: 8400, vat: 1400 },
  { id: 11, issued_on: "2026-11-21", company: "Yedek parça toptancısı · Lastik ve fren balatası", direction: "purchase", amount: 9360, vat: 1560 },
  { id: 10, issued_on: "2026-11-18", company: "Perakende müşteriler · Bakım ve onarım", direction: "sale", amount: 15480, vat: 2580 },
  { id: 9, issued_on: "2026-11-13", company: "Yerel kurye işletmesi · Bisiklet bakımı", direction: "sale", amount: 21600, vat: 3600 },
  { id: 8, issued_on: "2026-11-09", company: "Bisiklet distribütörü · İki şehir bisikleti", direction: "purchase", amount: 22800, vat: 3800 },
  { id: 7, issued_on: "2026-11-06", company: "Perakende müşteriler · Bisiklet ve aksesuar", direction: "sale", amount: 31200, vat: 5200 },
  { id: 6, issued_on: "2026-11-03", company: "Sarf malzemesi tedarikçisi · Yağ ve temizlik seti", direction: "purchase", amount: 2520, vat: 420 },
  { id: 5, issued_on: "2026-10-29", company: "Perakende müşteriler · Servis ve aksesuar", direction: "sale", amount: 12360, vat: 2060 },
  { id: 4, issued_on: "2026-10-23", company: "Bisiklet distribütörü · Kış sezonu stok alımı", direction: "purchase", amount: 37800, vat: 6300 },
  { id: 3, issued_on: "2026-10-16", company: "Yerel kurye işletmesi · Bisiklet bakımı", direction: "sale", amount: 16800, vat: 2800 },
  { id: 2, issued_on: "2026-10-12", company: "Yedek parça toptancısı · Zincir ve vites seti", direction: "purchase", amount: 7800, vat: 1300 },
  { id: 1, issued_on: "2026-10-05", company: "Perakende müşteriler · Lastik değişimi", direction: "sale", amount: 5640, vat: 940 },
];

export default function ExamplePortal() {
  const [month, setMonth] = useState("2026-11");
  const periodInvoices = invoices.filter((invoice) => invoice.issued_on.startsWith(month));
  const sales = periodInvoices.filter((invoice) => invoice.direction === "sale");
  const purchases = periodInvoices.filter((invoice) => invoice.direction === "purchase");
  const salesVat = sales.reduce((total, invoice) => total + invoice.vat, 0);
  const purchaseVat = purchases.reduce((total, invoice) => total + invoice.vat, 0);
  const summary = {
    client_id: workshop.id,
    sales: sales.reduce((total, invoice) => total + invoice.amount, 0),
    purchases: purchases.reduce((total, invoice) => total + invoice.amount, 0),
    estimated_vat: salesVat - purchaseVat,
  };

  return <>
    <header className="topbar"><div className="shell topbar-content">
      <div className="brand"><span className="brand-icon"><Landmark size={22} /></span><span>Mali Müşavir Portalı</span></div>
      <Link className="quiet demo-link" href="/">Portala giriş</Link>
    </div></header>
    <main className="shell main">
      <div className="page-heading">
        <div><p className="eyebrow">ÖRNEK MÜKELLEF EKRANI</p><h1>{workshop.company}</h1></div>
        <label className="period"><span><CalendarDays size={16} /> Dönem</span>
          <select value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="2026-11">Kasım 2026</option>
            <option value="2026-10">Ekim 2026</option>
          </select>
        </label>
      </div>
      <p className="demo-note">Bu önizlemedeki işletme ve faturalar kurgusaldır.</p>
      <ClientOverview client={workshop} summary={summary} invoices={periodInvoices} />
    </main>
  </>;
}
