"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Building2, CalendarDays, FileSpreadsheet, Landmark, LogOut, ReceiptText, Users, UploadCloud } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { type Client, type Summary, type Invoice, type Role, currency, currentMonth, timestamp, vatStatus } from "../lib/portal";
import { supabase } from "../lib/supabase";
import { activateClient, ClientActivation, InvitationFields } from "./client-activation";
import ClientManagement from "./client-management";
import ClientOverview from "./client-overview";
import { emptyMapping, fields, type Mapping, readImport, mapInvoices } from "../lib/import";

export default function Portal() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [profile, setProfile] = useState<{ id: string; role: Role | null; error?: string }>();
  const [authError, setAuthError] = useState("");
  const [registration, setRegistration] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [authBusy, setAuthBusy] = useState(false);
  const loginPending = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (next && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) loginPending.current = true;
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    const db = supabase;
    if (!db || !userId) return;
    let active = true;
    async function loadProfile() {
      const { data, error } = await db!.from("profiles").select("role").eq("id", userId!).maybeSingle();
      if (!active) return;
      const role = data?.role === "advisor" || data?.role === "client" ? data.role : null;
      const message = error?.code === "42501"
        ? "Hesap profilini okumak için gereken veritabanı izni eksik (42501). Portal yöneticinize bildirin."
        : error ? "Hesap profili yüklenemedi. Tekrar deneyin." : undefined;
      setProfile({ id: userId!, role, error: message });

      if (role === "client" && loginPending.current) {
        loginPending.current = false;
        const visit = await db!.rpc("record_portal_login");
        if (active && visit.error) setAuthError("Son portal giriş zamanı kaydedilemedi.");
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, [userId, profileAttempt]);

  function reloadProfile() {
    setProfile(undefined);
    setProfileAttempt((attempt) => attempt + 1);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    try {
      const email = String(form.get("email")).trim();
      const password = String(form.get("password"));
      if (registration) {
        const { data, error } = await supabase!.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) {
          await activateClient(form);
          reloadProfile();
        } else {
          setAuthNotice("E-posta adresinizi doğrulayın. Ardından giriş yapıp vergi numaranızı ve davet kodunuzu girin.");
          setRegistration(false);
        }
        return;
      }
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) {
        setAuthError(error.code === "invalid_credentials" ? "E-posta veya şifre hatalı." :
          error.status && error.status < 500 ? error.message :
          "Kimlik doğrulama tamamlanamadı. Tekrar deneyin veya portal yöneticinize bildirin.");
      }
    } catch (error) {
      setAuthError((error as Error).message || "Kimlik doğrulama servisine ulaşılamadı. Tekrar deneyin.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthError("");
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error) setAuthError(error.message);
    else setProfile(undefined);
  }

  const role = profile?.id === userId ? profile?.role : undefined;
  return <>
    <header className="topbar"><div className="shell topbar-content">
      <div className="brand"><span className="brand-icon"><Landmark size={22} /></span><span>Mali Müşavir Portalı</span></div>
      {session && <button className="quiet" onClick={signOut}><LogOut size={17} /> Çıkış</button>}
    </div></header>
    <main className={session ? "shell main" : "shell main main-guest"}>
      {authError && <p className="error" role="alert">{authError}</p>}
      {authNotice && !session && <p className="success" role="status">{authNotice}</p>}
      {!supabase ? <p className="error" role="alert">Supabase bağlantı ayarları eksik veya geçersiz.</p> :
       session === undefined || (session && role === undefined) ? <p role="status">Oturum yükleniyor…</p> :
       !session ? <section className="panel login">
        <div className="login-intro">
          <span className="tile"><ReceiptText size={25} aria-hidden="true" /></span>
          <h1>{registration ? "Mükellef kaydı" : "Portala giriş"}</h1>
          <p>{registration ? "Mali müşavirinizin verdiği bilgilerle firma hesabınızı etkinleştirin." : "Mali müşavir veya mükellef hesabınızla giriş yapın."}</p>
        </div>
        <form onSubmit={signIn} className="stack login-form">
          <label>E-posta<input name="email" type="email" autoComplete="username" required /></label>
          <label>Şifre<input name="password" type="password" autoComplete={registration ? "new-password" : "current-password"} minLength={registration ? 8 : undefined} required /></label>
          {registration && <InvitationFields />}
          <button disabled={authBusy}>{authBusy ? "İşleniyor…" : registration ? "Mükellef hesabı oluştur" : "Giriş yap"}</button>
          <button type="button" className="secondary" disabled={authBusy} onClick={() => {
            setAuthError("");
            setAuthNotice("");
            setRegistration(!registration);
          }}>{registration ? "Giriş ekranına dön" : "Davet koduyla kayıt ol"}</button>
        </form>
      </section> : role ? <Dashboard key={userId} role={role} profileLinked={reloadProfile} /> :
      profile?.error ? <section className="panel stack">
        <p className="error" role="alert">{profile.error}</p>
        <button onClick={reloadProfile}>Profili yeniden yükle</button>
      </section> : <ClientActivation linked={reloadProfile} />}
    </main>
  </>;
}

type DashboardData = { clients: Client[]; summaries: Summary[]; invoices: Invoice[]; visits: Record<string, string | null> };
const initialData: DashboardData = { clients: [], summaries: [], invoices: [], visits: {} };

function Dashboard({ role, profileLinked }: { role: Role; profileLinked: () => void }) {
  const advisor = role === "advisor";
  const [preview, setPreview] = useState(false);
  const [managedId, setManagedId] = useState("");
  const [previewClientId, setPreviewClientId] = useState("");
  const showManagement = advisor && !preview;
  const [month, setMonth] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: DashboardData; error?: string }>();
  const requestKey = `${month}:${revision}:${preview}:${previewClientId}`;
  const data = result?.key === requestKey ? result.data : initialData;
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const db = supabase!;
    let active = true;
    async function load() {
      try {
        const clients: Client[] = [];
        for (let offset = 0; ; offset += 500) {
          const response = await db.from("clients").select("id, user_id, company, tax_number, phone, last_data_at").order("id").range(offset, offset + 499);
          if (response.error) throw response.error;
          clients.push(...response.data);
          if (response.data.length < 500) break;
        }
        const firstDay = `${month}-01`;
        const nextDate = new Date(`${firstDay}T00:00:00Z`);
        nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
        nextDate.setUTCDate(0);
        const lastDay = nextDate.toISOString().slice(0, 10);
        const summaries: Summary[] = [];
        const visits: DashboardData["visits"] = {};
        let invoices: Invoice[] = [];
        for (let offset = 0; offset < clients.length; offset += 100) {
          const group = clients.slice(offset, offset + 100);
          const ids = group.map((client) => client.id);
          const users = group.flatMap((client) => client.user_id ? [client.user_id] : []);
          const [summary, profiles] = await Promise.all([
            db.from("monthly_summaries").select("client_id, sales, purchases, estimated_vat").eq("month", firstDay).in("client_id", ids),
            showManagement && users.length ? db.from("profiles").select("id, last_portal_login_at").in("id", users) : null,
          ]);
          if (summary.error) throw summary.error;
          if (profiles?.error) throw profiles.error;
          summaries.push(...summary.data);
          for (const profile of profiles?.data ?? []) visits[profile.id] = profile.last_portal_login_at;
        }
        const viewedClient = clients.find((client) => client.id === previewClientId) ?? clients[0];
        if (!showManagement && viewedClient) {
          const response = await db.from("official_invoices").select("id, issued_on, company, direction, amount")
            .eq("client_id", viewedClient.id).gte("issued_on", firstDay).lte("issued_on", lastDay)
            .order("issued_on", { ascending: false }).order("id", { ascending: false }).limit(20);
          if (response.error) throw response.error;
          invoices = response.data;
        }
        if (active) setResult({ key: requestKey, data: { clients, summaries, visits, invoices } });
      } catch (error) {
        if (active) setResult({ key: requestKey, data: initialData, error: (error as Error).message });
      }
    }
    void load();
    return () => { active = false; };
  }, [showManagement, previewClientId, month, requestKey]);

  const summaryByClient = new Map(data.summaries.map((summary) => [summary.client_id, summary]));
  const client = data.clients.find((entry) => entry.id === previewClientId) ?? data.clients[0];
  const managedClient = result?.data.clients.find((entry) => entry.id === managedId);
  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  return <>
    {advisor && <nav className="portal-nav" aria-label="Panel görünümü">
      <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Mali müşavir paneli</button>
      <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>Mükellef önizlemesi</button>
    </nav>}
    <div className="page-heading">
      <div><p className="eyebrow">{showManagement ? "MALİ MÜŞAVİR PANELİ" : "MÜKELLEF PORTALI"}</p>
        <h1>{showManagement ? "Mükellef yönetimi" : client?.company ?? "Dönem özeti"}</h1></div>
      <label className="period"><span><CalendarDays size={16} /> Dönem</span>
        <input type="month" value={month} min="1900-01" max="9999-12" onChange={(event) => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value);
        }} />
      </label>
    </div>
    {advisor && preview && <section className="panel preview-controls">
      <p className="muted">Mali müşavir hesabıyla mükellefin salt okunur ekranını önizliyorsunuz.</p>
      {data.clients.length > 0 && <label>Mükellef seçin
        <select value={client?.id} onChange={(event) => setPreviewClientId(event.target.value)}>
          {data.clients.map((entry) => <option key={entry.id} value={entry.id}>{entry.company} · {entry.tax_number}</option>)}
        </select>
      </label>}
    </section>}
    {showManagement && <div className="management"><ClientForm refresh={refresh} /><ImportForm refresh={refresh} /></div>}
    {loading ? <p className="panel" role="status">Dönem verileri yükleniyor…</p> :
      error ? <section className="panel stack">
        <p className="error" role="alert">{error}</p>
        <button onClick={refresh}>Dönem verilerini yeniden yükle</button>
      </section> :
      showManagement ? <section className="panel">
        <h2><Users size={22} /> Mükellef takibi</h2>
        {data.clients.length ? <div className="table-scroll"><table>
          <thead><tr><th>Firma / VKN</th><th>Telefon</th><th>Son veri güncellemesi</th><th>Tahmini KDV</th><th>Son portal girişi</th><th>İşlemler</th></tr></thead>
          <tbody>{[...data.clients].sort((a, b) => a.company.localeCompare(b.company, "tr")).map((entry) => {
            const vat = summaryByClient.get(entry.id)?.estimated_vat;
            return <tr key={entry.id}><td><strong>{entry.company}</strong><span className="cell-note">{entry.tax_number}</span></td>
              <td>{entry.phone}</td><td>{timestamp(entry.last_data_at)}</td>
              <td>{vat === undefined ? "—" : <span className={vat > 0 ? "due" : vat < 0 ? "credit" : ""}>
                {currency(Math.abs(vat))}<span className="cell-note">{vatStatus(vat)}</span>
              </span>}</td><td>{timestamp(entry.user_id ? data.visits[entry.user_id] ?? null : null)}</td><td><button type="button" className="secondary" aria-expanded={managedId === entry.id} onClick={() => setManagedId(managedId === entry.id ? "" : entry.id)}>Yönet</button></td></tr>;
          })}</tbody>
        </table></div> : <p className="muted">Henüz mükellef eklenmedi.</p>}
      </section> : client ? <ClientOverview client={client} summary={summaryByClient.get(client.id)} invoices={data.invoices} /> :
      advisor ? <p className="panel">Önizleme için mali müşavir panelinden bir mükellef ekleyin.</p> :
      <ClientActivation linked={profileLinked} />}
    {showManagement && managedClient && <ClientManagement key={`${managedClient.id}:${month}`} client={managedClient} month={month} refresh={refresh} />}
  </>;
}

function ClientForm({ refresh }: { refresh: () => void }) {
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    try {
      const { error } = await supabase!.from("clients").insert({
        company: String(values.get("company")).trim(),
        tax_number: String(values.get("tax")).trim(),
        phone: String(values.get("phone")).trim(),
      });
      if (error) throw error;
      form.reset();
      setFeedback({ error: false, text: "Mükellef eklendi." });
      refresh();
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel"><h2><Building2 size={22} /> Mükellef ekle</h2>
    <form className="stack" onSubmit={submit}>
      <label>Firma adı<input name="company" maxLength={200} required /></label>
      <div className="form-columns"><label>Vergi No / VKN<input name="tax" inputMode="numeric" pattern="[0-9]{10,11}" title="10 haneli VKN veya 11 haneli TCKN" required /></label>
        <label>Telefon<input type="tel" name="phone" maxLength={32} required /></label></div>
      <button disabled={busy}>{busy ? "Kaydediliyor…" : "Mükellef ekle"}</button>
      <Feedback value={feedback} />
    </form>
  </section>;
}

function Feedback({ value }: { value?: { error: boolean; text: string } }) {
  return value ? <p className={value.error ? "error" : "success"} role={value.error ? "alert" : "status"}>{value.text}</p> : null;
}

function ImportForm({ refresh }: { refresh: () => void }) {
  const [parsed, setParsed] = useState<Awaited<ReturnType<typeof readImport>> & { name: string }>();
  const [mapping, setMapping] = useState<Mapping>(emptyMapping);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function select(file?: File) {
    if (!file || busy) return;
    setParsed(undefined);
    setFeedback(undefined);
    setBusy(true);
    try {
      const data = await readImport(file);
      setParsed({ ...data, name: file.name });
      setMapping(data.mapping);
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed || busy) return;
    setBusy(true);
    setFeedback(undefined);
    try {
      const rows = mapInvoices(parsed, mapping);
      const { data, error } = await supabase!.rpc("import_invoices", { p_filename: parsed.name, p_rows: rows });
      if (error) throw error;
      setFeedback({ error: false, text: data ? `${data} fatura aktarıldı, dönem özetleri güncellendi.` : "Bu kayıt grubu daha önce aktarıldı." });
      setParsed(undefined);
      refresh();
    } catch (error) {
      setFeedback({ error: true, text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel"><h2><FileSpreadsheet size={22} /> Fatura içe aktar</h2>
    <form className="stack" onSubmit={submit}>
      <input ref={input} type="file" accept=".xlsx,.csv" hidden disabled={busy} onChange={(event) => {
        void select(event.target.files?.[0]);
        event.target.value = "";
      }} />
      <button type="button" className={`drop ${dragging ? "dragging" : ""}`} disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void select(event.dataTransfer.files[0]); }}>
        <UploadCloud size={24} /> {busy ? "İşleniyor…" : parsed?.name ?? "Dosya seçin veya buraya sürükleyin"}
        <small>XLSX veya CSV · en fazla 5 MB</small>
      </button>
      {parsed && <>
        <div className="mapping">{(Object.keys(fields) as (keyof Mapping)[]).map((field) =>
          <label key={field}>{fields[field]}<select required value={mapping[field]} onChange={(event) => {
            const value = event.target.value;
            setMapping((previous) => ({ ...previous, [field]: value }));
          }}><option value="">Sütun seçin</option>{parsed.headers.map((header, index) =>
            <option key={index} value={index}>{index + 1}. {header}</option>)}</select></label>)}</div>
        <button disabled={busy}>{busy ? "Aktarılıyor…" : "Faturaları aktar"}</button>
      </>}
      <Feedback value={feedback} />
    </form>
  </section>;
}
