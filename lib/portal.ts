export type Role = "advisor" | "client";
export type Client = {
  id: string;
  user_id: string | null;
  company: string;
  tax_number: string;
  phone: string;
  last_data_at: string | null;
};
export type Summary = { client_id: string; sales: number; purchases: number; estimated_vat: number };
export type Invoice = { id: number; issued_on: string; company: string; direction: "sale" | "purchase"; amount: number };

export const currentMonth = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit",
}).format(new Date());
export const currency = (value: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency", currency: "TRY",
}).format(value);
export const timestamp = (value: string | null) => value ? new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul",
}).format(new Date(value)) : "—";
export function vatStatus(value: number) {
  if (value > 0) return "Ödenecek";
  if (value < 0) return "Devreden / alacak";
  return "Bakiye yok";
}

export function isPortalMonth(value: string) {
  return /^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(value);
}

export function periodBounds(month: string) {
  if (!isPortalMonth(month)) throw new RangeError("Geçerli bir dönem seçin.");
  const firstDay = `${month}-01`;
  const end = new Date(`${firstDay}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { firstDay, lastDay: end.toISOString().slice(0, 10) };
}
