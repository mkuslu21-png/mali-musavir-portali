"use client";

import { useId, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { portalError } from "../lib/portal-error";
import { fieldText, invitationError, taxNumberError } from "../lib/validation";
import FieldError, { errorAttributes } from "./field-error";

export async function activateClient(values: FormData) {
  const { error } = await supabase!.rpc("accept_client_invitation", {
    p_tax: fieldText(values, "tax"), p_code: fieldText(values, "code"),
  });
  if (error) throw error;
}

export function InvitationFields({ errors }: { errors?: { tax?: string; code?: string } }) {
  const id = useId();
  return <>
    <label>Vergi No / TCKN<input name="tax" inputMode="numeric" maxLength={11} required {...errorAttributes(id + "-tax", errors?.tax)} />
      <FieldError id={id + "-tax"} message={errors?.tax} /></label>
    <label>Davet kodu<input name="code" autoComplete="off" spellCheck={false} required maxLength={40} {...errorAttributes(id + "-code", errors?.code)} />
      <FieldError id={id + "-code"} message={errors?.code} /></label>
  </>;
}

export function ClientActivation({ linked }: { linked: () => void }) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ tax?: string; code?: string }>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const errors = { tax: taxNumberError(fieldText(values, "tax")), code: invitationError(fieldText(values, "code")) };
    setError("");
    setFieldErrors(errors);
    if (errors.tax || errors.code) return;
    setBusy(true);
    try {
      await activateClient(values);
      linked();
    } catch (error) {
      setError(portalError(error, "Firma bağlantısı tamamlanamadı. Tekrar deneyin."));
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel stack activation">
    <h2>Firma hesabınızı bağlayın</h2>
    <p className="muted">Mali müşavirinizden aldığınız davet kodunu ve firmanızın vergi numarasını girin.</p>
    <form className="stack" onSubmit={submit} noValidate>
      <InvitationFields errors={fieldErrors} />
      <button disabled={busy}>{busy ? "Bağlanıyor…" : "Firma panelini aç"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  </section>;
}
