import { FolderOpen, ReceiptText, TrendingDown, TrendingUp } from "lucide-react";
import { type Client, type Summary, type Invoice, currency, timestamp, vatStatus } from "../lib/portal";

export default function ClientOverview({ client, summary, invoices }: { client: Client; summary?: Summary; invoices: Invoice[] }) {
  const vat = summary?.estimated_vat;
  const cards = [
    { label: "Bu ay satış faturaları toplamı", amount: summary?.sales, Icon: TrendingUp },
    { label: "Bu ay alış/gider faturaları toplamı", amount: summary?.purchases, Icon: TrendingDown },
    { label: "Tahmini KDV durumu", amount: vat === undefined ? undefined : Math.abs(vat), Icon: ReceiptText },
  ];
  return <>
    <div className="cards">{cards.map(({ label, amount, Icon }, index) => <section className="panel metric" key={label}>
      <span className="tile"><Icon size={22} /></span><h2>{label}</h2>
      <strong className={index === 2 && vat ? (vat > 0 ? "due" : "credit") : ""}>
        {amount === undefined ? "—" : currency(amount)}
      </strong>
      {index === 2 && <span className="muted">{vat === undefined ? "Bu dönemde kayıt yok" : vatStatus(vat)}</span>}
    </section>)}</div>
    <section className="panel"><h2><FolderOpen size={22} /> Son faturalar</h2>
      {invoices.length ? <ul className="invoice-list">{invoices.map((invoice) => <li key={invoice.id}>
        <div><strong>{invoice.company}</strong><span className="cell-note">
          {invoice.issued_on.split("-").reverse().join(".")} · {invoice.direction === "sale" ? "Satış" : "Alış"}
        </span></div><strong>{currency(invoice.amount)}</strong>
      </li>)}</ul> : <p className="muted">Bu dönemde gösterilecek fatura yok.</p>}
    </section>
    <footer className="notice">
      <p><strong>Mali Müşavir Tarafından Son Güncelleme:</strong> {timestamp(client.last_data_at)}</p>
      <p>Bu veriler sisteme yüklenen kayıtlara dayalı ön bilgilendirmedir; kesin vergi tutarları resmi beyanname ile netleşir.</p>
    </footer>
  </>;
}
