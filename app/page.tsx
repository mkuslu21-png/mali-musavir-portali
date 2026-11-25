"use client";

import { type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, FileSpreadsheet, Landmark, LogOut, ReceiptText, Users, UploadCloud } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { type Role, currency, currentMonth, isPortalMonth, timestamp, vatStatus } from "../lib/portal";
import { loadPeriod, loadRegistry, type PeriodData, type Registry } from "../lib/dashboard";
import { portalError } from "../lib/portal-error";
import { clientFieldErrors, emailError, fieldText, invitationError, taxNumberError } from "../lib/validation";
import { supabase } from "../lib/supabase";
import { activateClient, ClientActivation, InvitationFields } from "./client-activation";
import FieldError from "./field-error";
import ClientManagement from "./client-management";
import ClientOverview from "./client-overview";
import { emptyMapping, fields, type Mapping, readImport, mapInvoices } from "../lib/import";

export default function Portal() {
  const [session, setSession] = useState<Session | null | undefined>();
  const [profile, setProfile] = useState<{ id: string; role: Role | null; error?: string }>();
  const [authError, setAuthError] = useState("");
  const [registration, setRegistration] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [authFields, setAuthFields] = useState<Record<string, string | undefined>>({});
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
    const controller = new AbortController();
    async function loadProfile() {
      const { data, error } = await db!.from("profiles").select("role").eq("id", userId!).abortSignal(controller.signal).maybeSingle();
      if (!active) return;
      const role = data?.role === "advisor" || data?.role === "client" ? data.role : null;
      const message = error ? portalError(error, "Hesap profili yüklenemedi. Tekrar deneyin.") : undefined;
      setProfile({ id: userId!, role, error: message });

      if (role === "client" && loginPending.current) {
        loginPending.current = false;
        const visit = await db!.rpc("record_portal_login");
        if (active && visit.error) setAuthError("Son portal giriş zamanı kaydedilemedi.");
      }
    }
    void loadProfile().catch((error: unknown) => {
      if (active) setProfile({ id: userId, role: null, error: portalError(error, "Hesap profili yüklenemedi. Tekrar deneyin.") });
    });
    return () => { active = false; controller.abort(); };
  }, [userId, profileAttempt]);

  function reloadProfile() {
    setProfile(undefined);
    setProfileAttempt((attempt) => attempt + 1);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setAuthError("");
    setAuthNotice("");
    const email = fieldText(form, "email");
    const password = String(form.get("password") ?? "");
    const errors = {
      email: emailError(email),
      password: !password ? "Şifrenizi girin." : registration && password.length < 8 ? "En az 8 karakterlik bir şifre seçin." : undefined,
      tax: registration ? taxNumberError(fieldText(form, "tax")) : undefined,
      code: registration ? invitationError(fieldText(form, "code")) : undefined,
    };
    setAuthFields(errors);
    if (Object.values(errors).some(Boolean)) return;
    setAuthBusy(true);
    try {
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
      if (error) throw error;
    } catch (error) {
      setAuthError(portalError(error, "Kimlik doğrulama tamamlanamadı. Tekrar deneyin veya portal yöneticinize bildirin."));
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthError("");
    try {
      const { error } = await supabase!.auth.signOut({ scope: "local" });
      if (error) throw error;
      setProfile(undefined);
    } catch (error) {
      setAuthError(portalError(error, "Çıkış tamamlanamadı. Tekrar deneyin."));
    }
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
        <form onSubmit={signIn} className="stack login-form" noValidate>
          <label>E-posta<input name="email" type="email" autoComplete="username" required aria-invalid={!!authFields.email} aria-describedby={authFields.email ? "auth-email-error" : undefined} /><FieldError id="auth-email-error" message={authFields.email} /></label>
          <label>Şifre<input name="password" type="password" autoComplete={registration ? "new-password" : "current-password"} required aria-invalid={!!authFields.password} aria-describedby={authFields.password ? "auth-password-error" : undefined} /><FieldError id="auth-password-error" message={authFields.password} /></label>
          {registration && <InvitationFields errors={authFields} />}
          <button disabled={authBusy}>{authBusy ? "İşleniyor…" : registration ? "Mükellef hesabı oluştur" : "Giriş yap"}</button>
          <button type="button" className="secondary" disabled={authBusy} onClick={() => {
            setAuthError("");
            setAuthNotice("");
            setAuthFields({});
            setRegistration(!registration);
          }}>{registration ? "Giriş ekranına dön" : "Davet koduyla kayıt ol"}</button>
        </form>
      </section> : role ? <Dashboard key={`${userId}:${role}`} actor={userId!} role={role} profileLinked={reloadProfile} /> :
      profile?.error ? <section className="panel stack">
        <p className="error" role="alert">{profile.error}</p>
        <button onClick={reloadProfile}>Profili yeniden yükle</button>
      </section> : <ClientActivation linked={reloadProfile} />}
    </main>
  </>;
}

const pageSize = 25;
const emptyPeriod: PeriodData = { summaries: [], invoices: [], visits: {} };

function Dashboard({ actor, role, profileLinked }: { actor: string; role: Role; profileLinked: () => void }) {
  const advisor = role === "advisor";
  const [preview, setPreview] = useState(false);
  const [managedId, setManagedId] = useState("");
  const [managementNotice, setManagementNotice] = useState("");
  const [previewClientId, setPreviewClientId] = useState("");
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [page, setPage] = useState(0);
  const showManagement = advisor && !preview;
  const [month, setMonth] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const [registry, setRegistry] = useState<{ revision: number; data?: Registry; error?: string }>();
  const [period, setPeriod] = useState<{ key: string; data?: PeriodData; error?: string }>();
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    void loadRegistry(actor, role, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setRegistry({ revision, data }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setRegistry({ revision, error: portalError(error, "Mükellef listesi yüklenemedi. Tekrar deneyin.") });
      });
    return () => controller.abort();
  }, [actor, role, revision]);

  const registryReady = registry?.revision === revision && Boolean(registry.data);
  const clients = registry?.data?.clients;
  const deferredSearch = useDeferredValue(search).trim().toLocaleLowerCase("tr-TR");
  const matches = useMemo(() => (clients ?? []).filter((client) =>
    (linkFilter === "all" || Boolean(client.user_id) === (linkFilter === "linked")) &&
    (client.company.toLocaleLowerCase("tr-TR").includes(deferredSearch) || client.tax_number.includes(deferredSearch)),
  ).sort((a, b) => a.company.localeCompare(b.company, "tr-TR")), [clients, deferredSearch, linkFilter]);
  const lastPage = Math.max(0, Math.ceil(matches.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = useMemo(() => matches.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [matches, currentPage]);
  const client = clients?.find((entry) => entry.id === previewClientId) ?? clients?.[0];
  const managedClient = clients?.find((entry) => entry.id === managedId);
  const periodKey = `${month}:${revision}:${showManagement ? "management" : "overview"}:${showManagement ? visible.map((item) => item.id).join(",") : client?.id ?? ""}`;

  useEffect(() => {
    if (!registryReady) return;
    const controller = new AbortController();
    void loadPeriod(visible, month, client, showManagement, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setPeriod({ key: periodKey, data }); })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setPeriod({ key: periodKey, error: portalError(error, "Dönem verileri yüklenemedi. Tekrar deneyin.") });
      });
    return () => controller.abort();
  }, [client, month, periodKey, registryReady, showManagement, visible]);

  const data = period?.key === periodKey ? period.data ?? emptyPeriod : emptyPeriod;
  const summaryByClient = new Map(data.summaries.map((summary) => [summary.client_id, summary]));
  const error = registry?.revision === revision ? registry.error ?? (period?.key === periodKey ? period.error : undefined) : undefined;
  const loading = !error && (!registryReady || period?.key !== periodKey);
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
          if (isPortalMonth(event.target.value)) setMonth(event.target.value);
        }} />
      </label>
    </div>
    {advisor && preview && <section className="panel preview-controls">
      <p className="muted">Mali müşavir hesabıyla mükellefin salt okunur ekranını önizliyorsunuz.</p>
      {clients && clients.length > 0 && <label>Mükellef seçin
        <select value={client?.id} onChange={(event) => setPreviewClientId(event.target.value)}>
          {clients.map((entry) => <option key={entry.id} value={entry.id}>{entry.company} · {entry.tax_number}</option>)}
        </select>
      </label>}
    </section>}
    {showManagement && managementNotice && <p className="success" role="status">{managementNotice}</p>}
    {showManagement && <div className="management"><ClientForm refresh={refresh} /><ImportForm refresh={refresh} /></div>}
    {showManagement && <section className="panel stack">
      <div className="form-columns">
        <label>Firma adı veya VKN/TCKN ile ara<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
        <label>Portal hesabı<select value={linkFilter} onChange={(event) => {
          const value = event.target.value;
          if (value === "all" || value === "linked" || value === "unlinked") setLinkFilter(value);
          setPage(0);
        }}>
          <option value="all">Tüm mükellefler</option>
          <option value="linked">Hesabı bağlı</option>
          <option value="unlinked">Hesabı bağlı değil</option>
        </select></label>
      </div>
      {(search || linkFilter !== "all") && <button type="button" className="secondary" onClick={() => { setSearch(""); setLinkFilter("all"); setPage(0); }}>Filtreleri temizle</button>}
    </section>}
    {loading ? <section className="panel skeleton-panel" role="status" aria-busy="true">
      <span>Dönem verileri yükleniyor…</span><div aria-hidden="true" /><div aria-hidden="true" /><div aria-hidden="true" />
    </section> :
      error ? <section className="panel stack">
        <p className="error" role="alert">{error}</p>
        <button onClick={refresh}>Dönem verilerini yeniden yükle</button>
      </section> :
      showManagement ? <section className="panel">
        <h2><Users size={22} /> Mükellef takibi</h2>
        {visible.length ? <><div className="table-scroll"><table>
          <thead><tr><th>Firma / VKN</th><th>Telefon</th><th>Son veri güncellemesi</th><th>Tahmini KDV</th><th>Son portal girişi</th><th>İşlemler</th></tr></thead>
          <tbody>{visible.map((entry) => {
            const vat = summaryByClient.get(entry.id)?.estimated_vat;
            return <tr key={entry.id}><td><strong>{entry.company}</strong><span className="cell-note">{entry.tax_number}</span></td>
              <td>{entry.phone}</td><td>{timestamp(entry.last_data_at)}</td>
              <td>{vat === undefined ? "—" : <span className={vat > 0 ? "due" : vat < 0 ? "credit" : ""}>
                {currency(Math.abs(vat))}<span className="cell-note">{vatStatus(vat)}</span>
              </span>}</td><td>{timestamp(entry.user_id ? data.visits[entry.user_id] ?? null : null)}</td><td><button type="button" className="secondary" aria-expanded={managedId === entry.id} onClick={() => {
                setManagementNotice("");
                setManagedId(managedId === entry.id ? "" : entry.id);
              }}>Yönet</button></td></tr>;
          })}</tbody>
        </table></div>
        {lastPage > 0 && <div className="portal-nav pagination">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Önceki</button>
          <span>{currentPage + 1} / {lastPage + 1} · {matches.length} mükellef</span>
          <button type="button" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Sonraki</button>
        </div>}</> : <p className="muted">{clients?.length ? "Filtrelere uyan mükellef bulunamadı." : "Henüz mükellef eklenmedi. Başlamak için yukarıdaki formu kullanın."}</p>}
      </section> : client ? <ClientOverview client={client} summary={summaryByClient.get(client.id)} invoices={data.invoices} /> :
      advisor ? <p className="panel">Önizleme için mali müşavir panelinden bir mükellef ekleyin.</p> :
      <ClientActivation linked={profileLinked} />}
    {showManagement && managedClient && !error && <ClientManagement key={`${managedClient.id}:${month}`} client={managedClient} month={month} refresh={refresh}
      removed={() => { setManagedId(""); setManagementNotice("Mükellef ve bağlı faturalar silindi."); }} />}
  </>;
}

function ClientForm({ refresh }: { refresh: () => void }) {
  const [feedback, setFeedback] = useState<{ error: boolean; text: string }>();
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof clientFieldErrors>>();
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const entry = { company: fieldText(values, "company"), tax_number: fieldText(values, "tax"), phone: fieldText(values, "phone") };
    const errors = clientFieldErrors(entry);
    setFeedback(undefined);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    try {
      const { error } = await supabase!.from("clients").insert(entry);
      if (error) throw error;
      form.reset();
      setFeedback({ error: false, text: "Mükellef eklendi." });
      refresh();
    } catch (error) {
      setFeedback({ error: true, text: portalError(error, "Mükellef kaydedilemedi. Tekrar deneyin.") });
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel"><h2><Building2 size={22} /> Mükellef ekle</h2>
    <form className="stack" onSubmit={submit} noValidate>
      <label>Firma adı<input name="company" maxLength={200} required aria-invalid={!!fieldErrors?.company} aria-describedby={fieldErrors?.company ? "client-company-error" : undefined} /><FieldError id="client-company-error" message={fieldErrors?.company} /></label>
      <div className="form-columns"><label>Vergi No / VKN<input name="tax" inputMode="numeric" maxLength={11} required aria-invalid={!!fieldErrors?.tax_number} aria-describedby={fieldErrors?.tax_number ? "client-tax-error" : undefined} /><FieldError id="client-tax-error" message={fieldErrors?.tax_number} /></label>
        <label>Telefon<input type="tel" name="phone" maxLength={32} required aria-invalid={!!fieldErrors?.phone} aria-describedby={fieldErrors?.phone ? "client-phone-error" : undefined} /><FieldError id="client-phone-error" message={fieldErrors?.phone} /></label></div>
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
      setFeedback({ error: true, text: portalError(error, "Dosya okunamadı. Geçerli bir CSV veya XLSX dosyası seçin.") });
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
      setFeedback({ error: true, text: portalError(error, "Faturalar aktarılamadı. Dosyayı kontrol edip tekrar deneyin.") });
    } finally {
      setBusy(false);
    }
  }
  return <section className="panel"><h2><FileSpreadsheet size={22} /> Fatura içe aktar</h2>
    <form className="stack" onSubmit={submit} noValidate>
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
