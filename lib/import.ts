import type * as XLSX from "xlsx";
import { InputError, taxNumberError } from "./validation.ts";

export const fields = {
  tax_number: "Mükellef VKN / TCKN",
  issued_on: "Fatura tarihi",
  company: "Karşı firma",
  direction: "Satış / alış",
  amount: "KDV dahil toplam",
  vat: "KDV tutarı",
};

type Field = keyof typeof fields;
type Cell = string | number | boolean | undefined;
export type Mapping = Record<Field, string>;
export const emptyMapping: Mapping = {
  tax_number: "", issued_on: "", company: "", direction: "", amount: "", vat: "",
};
export type InvoiceInput = {
  tax_number: string;
  issued_on: string;
  company: string;
  direction: "sale" | "purchase";
  amount: number;
  vat: number;
};

const normalize = (value: string) =>
  value.toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]/g, "");
const aliases: Record<Field, string[]> = {
  tax_number: ["vkn", "tckn", "vergino", "verginumarasi", "mukellefvkn", "taxnumber"],
  issued_on: ["tarih", "faturatarihi", "issuedon", "date"],
  company: ["firma", "firmaadi", "unvan", "karsifirma", "company"],
  direction: ["tur", "tip", "faturaturu", "satisalis", "direction"],
  amount: ["tutar", "toplam", "kdvdahiltoplam", "amount"],
  vat: ["kdv", "kdvtutari", "vat"],
};

function decodeCsv(bytes: ArrayBuffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1254").decode(bytes);
  }
}

export async function readImport(file: File) {
  if (!/\.(xlsx|csv)$/i.test(file.name)) throw new InputError("Dosya türü CSV veya XLSX olmalı.");
  if (!file.size) throw new InputError("Dosya boş.");
  if (file.size > 5 * 1024 * 1024) throw new InputError("Dosya 5 MB sınırını aşıyor.");
  if (file.name.length > 255) throw new InputError("Dosya adı 255 karakteri aşamaz.");
  const sheetJs = await import("xlsx");
  const xlsx = "default" in sheetJs ? sheetJs.default as typeof sheetJs : sheetJs;
  const bytes = await file.arrayBuffer();
  const options = { raw: true, sheetRows: 10002, sheets: 0 };
  const workbook = /\.csv$/i.test(file.name)
    ? xlsx.read(decodeCsv(bytes), { ...options, type: "string" })
    : xlsx.read(bytes, { ...options, type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) throw new InputError("Dosyanın ilk sayfasında okunabilir veri yok.");
  const range = xlsx.utils.decode_range(sheet["!ref"]);
  if (range.e.c - range.s.c + 1 > 256) throw new InputError("İlk sayfa en fazla 256 sütun içerebilir.");
  const [heading, ...rows] = xlsx.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1, raw: true, blankrows: true,
  });
  if (!heading?.length || !rows.length || rows.length > 10000) {
    throw new InputError("İlk sayfa sütun başlıkları ve 1–10.000 fatura satırı içermelidir.");
  }
  const headers = Array.from(heading, (cell, index) => String(cell ?? "").trim() || `Sütun ${index + 1}`);
  const mapping = { ...emptyMapping };
  for (const field of Object.keys(fields) as Field[]) {
    const index = headers.findIndex((header) => aliases[field].includes(normalize(header)));
    if (index >= 0) mapping[field] = String(index);
  }
  return { headers, rows, mapping, xlsx, date1904: !!workbook.Workbook?.WBProps?.date1904 };
}

function dateValue(cell: Cell, xlsx: typeof XLSX, date1904: boolean) {
  const value = String(cell ?? "").trim();
  const serial = typeof cell === "number" ? xlsx.SSF.parse_date_code(cell, { date1904 }) : null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/.exec(value);
  const parts = serial ? [serial.y, serial.m, serial.d] : iso ? iso.slice(1) : local ? [local[3], local[2], local[1]] : [];
  if (!parts.length) throw new InputError("Fatura tarihi geçersiz.");
  const date = parts.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
  const parsed = new Date(date);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < "1900-01-01") {
    throw new InputError("Fatura tarihi geçersiz.");
  }
  return date;
}

function money(cell: Cell, field: string) {
  const raw = String(cell ?? "").trim().replace(/\s|₺/g, "");
  const decimal = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(raw)
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(",", ".");
  const result = typeof cell === "number" ? cell : Number(decimal);
  if ((typeof cell !== "number" && !/^\d+(\.\d{1,2})?$/.test(decimal)) ||
      !Number.isFinite(result) || result < 0 || result >= 1e14) {
    throw new InputError(`${field} sıfır veya pozitif bir para tutarı olmalı.`);
  }
  return Math.round(result * 100) / 100;
}

export function mapInvoices(file: Awaited<ReturnType<typeof readImport>>, mapping: Mapping) {
  const assigned = new Set<string>();
  for (const field of Object.keys(fields) as Field[]) {
    const column = mapping[field];
    if (!/^\d+$/.test(column) || !file.headers[Number(column)]) {
      throw new InputError(`${fields[field]} alanı için bir sütun seçin.`);
    }
    const index = String(Number(column));
    if (assigned.has(index)) throw new InputError(`${fields[field]} alanı için farklı bir sütun seçin.`);
    assigned.add(index);
  }
  const invoices: InvoiceInput[] = [];
  const issues: string[] = [];
  let invalid = 0;
  file.rows.forEach((row, index) => {
    if (row.every((cell) => String(cell ?? "").trim() === "")) return;
    const get = (field: Field) => row[Number(mapping[field])];
    try {
      const tax_number = String(get("tax_number") ?? "").trim();
      const taxError = taxNumberError(tax_number);
      if (taxError) throw new InputError(taxError);
      const company = String(get("company") ?? "").trim();
      if (!company || company.length > 200) throw new InputError("Karşı firma 1–200 karakter olmalı.");
      const type = normalize(String(get("direction") ?? ""));
      const direction = ["satis", "sale"].includes(type) ? "sale" : ["alis", "gider", "purchase"].includes(type) ? "purchase" : null;
      if (!direction) throw new InputError("Fatura türü Satış veya Alış olmalıdır.");
      const amount = money(get("amount"), fields.amount);
      const vat = money(get("vat"), fields.vat);
      if (vat > amount) throw new InputError("KDV, fatura toplamını aşamaz.");
      invoices.push({ tax_number, company, direction, amount, vat, issued_on: dateValue(get("issued_on"), file.xlsx, file.date1904) });
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      invalid += 1;
      if (issues.length < 5) issues.push(`Satır ${index + 2} · ${error.message}`);
    }
  });
  if (invalid) {
    const remaining = invalid - issues.length;
    throw new InputError(issues.join("\n") + (remaining ? `\nAyrıca ${remaining} hatalı satır var.` : ""));
  }
  if (!invoices.length) throw new InputError("Dosyada fatura satırı bulunamadı.");
  return invoices;
}
