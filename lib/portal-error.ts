import { InputError } from "./validation.ts";

const errorMessages: Record<string, string> = {
  "42501": "Bu işlem için gerekli portal izniniz yok. Portal yöneticinize başvurun.",
  "23505": "Bu kayıt zaten mevcut. Vergi numarasını kontrol edin.",
  "23503": "Bağlı kayıt değişmiş olabilir. Listeyi yenileyip tekrar deneyin.",
  "23514": "Bir alan kayıt kurallarına uymuyor. Formdaki bilgileri kontrol edin.",
  "22003": "Tutarlardan biri desteklenen üst sınırı aşıyor.",
  PGRST202: "Bu işlem veritabanında henüz etkin değil. Portal yöneticinize başvurun.",
  PGRST301: "Oturum doğrulanamadı. Çıkış yapıp tekrar giriş yapın.",
  invalid_credentials: "E-posta veya şifre hatalı.",
  email_not_confirmed: "Giriş yapmak için e-posta adresinizi doğrulayın.",
  email_address_not_authorized: "Portal bu adrese doğrulama e-postası gönderemedi. Mali müşavirinizle iletişime geçin.",
  over_email_send_rate_limit: "Doğrulama e-postası gönderim sınırına ulaşıldı. Daha sonra tekrar deneyin.",
  over_request_rate_limit: "Çok sık istek gönderdiniz. Bir süre bekleyip tekrar deneyin.",
  signup_disabled: "Yeni hesap kaydı şu anda kapalı. Mali müşavirinizle iletişime geçin.",
  weak_password: "Daha güçlü bir şifre seçin.",
  user_already_exists: "Bu e-posta için zaten bir hesap var. Giriş ekranını kullanın.",
  request_timeout: "Bağlantı zaman aşımına uğradı. Tekrar deneyin.",
};

const knownRpcMessages = new Set([
  "Mali müşavir yetkisi gerekir.", "Bu işlem için mali müşavir yetkisi gerekir.",
  "Firma bulunamadı veya bir hesaba zaten bağlı.", "Mükellef bulunamadı.", "Fatura bulunamadı.",
  "Davet kodu, vergi numarası veya e-posta eşleşmiyor. Davet süresi dolmuş olabilir.",
  "Bu hesap bir firmaya bağlanamaz veya zaten bağlı.", "Önce e-posta adresinizi doğrulayın.",
  "Önce hesabınıza giriş yapın.", "Geçerli bir e-posta girin.",
]);

export function portalError(error: unknown, fallback: string) {
  if (error instanceof InputError) return error.message;
  if (!error || typeof error !== "object") return fallback;
  const details = error as { code?: unknown; message?: unknown; status?: unknown; name?: unknown };
  if (typeof details.code === "string" && Object.hasOwn(errorMessages, details.code)) return errorMessages[details.code];
  if (details.status === 401) return errorMessages.PGRST301;
  if (details.status === 403) return errorMessages["42501"];
  if (details.status === 429) return errorMessages.over_request_rate_limit;
  if (details.status === 0 || details.name === "AuthRetryableFetchError" ||
      (typeof details.message === "string" && /^(TypeError: )?(Failed to fetch|NetworkError|Load failed)/i.test(details.message))) {
    return "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.";
  }
  if (details.code === "P0001" && typeof details.message === "string") {
    if (knownRpcMessages.has(details.message)) return details.message;
    if (details.message.startsWith("Mükellef bulunamadı:")) {
      return "Dosyadaki bir VKN/TCKN için kayıt bulunamadı. Önce ilgili mükellefi ekleyin.";
    }
  }
  return fallback;
}
