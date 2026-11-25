export class InputError extends Error {}

export function fieldText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function emailError(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254
    ? undefined : "Geçerli bir e-posta adresi girin.";
}

export function taxNumberError(value: string) {
  return /^\d{10,11}$/.test(value) ? undefined : "10 haneli VKN veya 11 haneli TCKN girin.";
}

export function invitationError(value: string) {
  return /^[a-f\d]{32}$/i.test(value) ? undefined : "Mali müşavirinizin verdiği 32 karakterlik davet kodunu girin.";
}

export function clientFieldErrors(values: { company: string; tax_number: string; phone: string }) {
  return {
    company: values.company.length >= 1 && values.company.length <= 200 ? undefined : "Firma adı 1–200 karakter olmalı.",
    tax_number: taxNumberError(values.tax_number),
    phone: /^[+\d() ./-]{7,32}$/.test(values.phone) && values.phone.replace(/\D/g, "").length >= 7
      ? undefined : "En az 7 rakam içeren geçerli bir telefon numarası girin.",
  };
}
