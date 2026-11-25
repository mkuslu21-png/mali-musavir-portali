import { periodBounds, type Client, type Invoice, type Role, type Summary } from "./portal";
import { supabase } from "./supabase";

export type Registry = { clients: Client[] };
export type PeriodData = { summaries: Summary[]; invoices: Invoice[]; visits: Record<string, string | null> };

export async function loadRegistry(actor: string, role: Role, signal: AbortSignal): Promise<Registry> {
  const pageSize = 500;
  const clients: Client[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase!.from("clients")
      .select("id, user_id, company, tax_number, phone, last_data_at")
      .eq(role === "advisor" ? "advisor_id" : "user_id", actor)
      .order("id").range(offset, offset + pageSize - 1).abortSignal(signal);
    if (error) throw error;
    clients.push(...data);
    if (data.length < pageSize) return { clients };
  }
}

export async function loadPeriod(clients: Client[], month: string, selected: Client | undefined, management: boolean, signal: AbortSignal): Promise<PeriodData> {
  const db = supabase!;
  const { firstDay, lastDay } = periodBounds(month);
  const summaries: Summary[] = [];
  const visits: PeriodData["visits"] = {};
  const scope = management ? clients : selected ? [selected] : [];
  if (!management && selected) {
    const [summary, invoices] = await Promise.all([
      db.from("monthly_summaries").select("client_id,sales,purchases,estimated_vat").eq("client_id", selected.id).eq("month", firstDay).abortSignal(signal).maybeSingle(),
      db.from("official_invoices").select("id,issued_on,company,direction,amount").eq("client_id", selected.id)
        .gte("issued_on", firstDay).lte("issued_on", lastDay).order("issued_on", { ascending: false })
        .order("id", { ascending: false }).limit(20).abortSignal(signal),
    ]);
    if (summary.error) throw summary.error;
    if (invoices.error) throw invoices.error;
    return { summaries: summary.data ? [summary.data] : [], visits, invoices: invoices.data };
  }
  for (let offset = 0; offset < scope.length; offset += 100) {
    const page = scope.slice(offset, offset + 100);
    const ids = page.map((client) => client.id);
    const users = page.flatMap((client) => client.user_id ? [client.user_id] : []);
    const [summary, profiles] = await Promise.all([
      db.from("monthly_summaries").select("client_id,sales,purchases,estimated_vat").eq("month", firstDay).in("client_id", ids).abortSignal(signal),
      users.length ? db.from("profiles").select("id,last_portal_login_at").in("id", users).abortSignal(signal) : null,
    ]);
    if (summary.error) throw summary.error;
    if (profiles?.error) throw profiles.error;
    summaries.push(...summary.data);
    for (const profile of profiles?.data ?? []) visits[profile.id] = profile.last_portal_login_at;
  }
  return { summaries, visits, invoices: [] };
}
