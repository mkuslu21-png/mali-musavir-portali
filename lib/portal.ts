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
