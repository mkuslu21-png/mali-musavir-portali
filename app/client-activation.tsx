"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export async function activateClient(values: FormData) {
  const { error } = await supabase!.rpc("accept_client_invitation", {
    p_tax: String(values.get("tax")).trim(), p_code: String(values.get("code")).trim(),
  });
  if (error) throw error;
}

export function InvitationFields() {
  return <>
    <label>Vergi No / TCKN<input name="tax" inputMode="numeric" pattern="[0-9]{10,11}" required /></label>
    <label>Davet kodu<input name="code" autoComplete="off" spellCheck={false} required maxLength={40} /></label>
  </>;
}

export function ClientActivation({ linked }: { linked: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      await activateClient(values);
      linked();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel stack activation">
    <h2>Firma hesabınızı bağlayın</h2>
    <p className="muted">Mali müşavirinizden aldığınız davet kodunu ve firmanızın vergi numarasını girin.</p>
    <form className="stack" onSubmit={submit}>
      <InvitationFields />
      <button disabled={busy}>{busy ? "Bağlanıyor…" : "Firma panelini aç"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </section>;
}
