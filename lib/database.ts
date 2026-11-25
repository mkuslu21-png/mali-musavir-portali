import type { InvoiceInput } from "./import";
import type { Client, Invoice, Role, Summary } from "./portal";

type Table<Row, Insert = never> = { Row: Row; Insert: Insert; Update: never; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      clients: Table<Client & { advisor_id: string }, Pick<Client, "company" | "tax_number" | "phone">>;
      profiles: Table<{ id: string; role: Role; last_portal_login_at: string | null }>;
      official_invoices: Table<Invoice & { client_id: string; vat: number }>;
      monthly_summaries: Table<Summary & { month: string }>;
    };
    Views: Record<never, never>;
    Functions: {
      record_portal_login: { Args: Record<never, never>; Returns: undefined };
      create_client_invitation: { Args: { p_client: string; p_email: string }; Returns: string };
      accept_client_invitation: { Args: { p_tax: string; p_code: string }; Returns: undefined };
      delete_portal_records: { Args: { p_client: string; p_invoice?: number | null }; Returns: undefined };
      import_invoices: { Args: { p_filename: string; p_rows: InvoiceInput[] }; Returns: number };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
