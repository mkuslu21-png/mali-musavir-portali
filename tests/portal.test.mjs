import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { mapInvoices, readImport } from "../lib/import.ts";
import { periodBounds } from "../lib/portal.ts";
import { portalError } from "../lib/portal-error.ts";
import { clientFieldErrors, invitationError } from "../lib/validation.ts";

const header = "VKN;Tarih;Firma;Tür;Tutar;KDV";
const validRow = "0123456789;2026-11-04;Örnek Alıcı;Satış;1.200,00;200,00";
const csv = (rows) => new File([[header, ...rows].join("\n")], "faturalar.csv");

test("Turkish CSV retains leading zeroes and parses amounts", async () => {
  const file = await readImport(csv([validRow]));
  assert.deepEqual(mapInvoices(file, file.mapping), [{
    tax_number: "0123456789", issued_on: "2026-11-04", company: "Örnek Alıcı",
    direction: "sale", amount: 1200, vat: 200,
  }]);
});

test("native XLSX dates and valid VKN are preserved", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    header.split(";"), ["0123456789", new Date("2026-11-04T00:00:00Z"), "Firma", "Alış", 500, 50],
  ]));
  const file = await readImport(new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "faturalar.xlsx"));
  const [invoice] = mapInvoices(file, file.mapping);
  assert.equal(invoice.issued_on, "2026-11-04");
  assert.equal(invoice.direction, "purchase");
});

test("invalid rows block the whole import and report row and field", async () => {
  const file = await readImport(csv([validRow, "0123456789;2026-02-30;Alıcı;Satış;100;20", "0123456789;2026-11-05;Alıcı;Alış;100;bozuk"]));
  assert.throws(() => mapInvoices(file, file.mapping), /Satır 3.*tarihi geçersiz\.[\s\S]*Satır 4.*KDV tutarı/);
  assert.throws(() => mapInvoices(file, { ...file.mapping, vat: file.mapping.amount }), /KDV tutarı alanı için farklı/);
  assert.throws(() => mapInvoices(file, { ...file.mapping, vat: "999" }), /KDV tutarı alanı için bir sütun/);
});

test("empty and unsupported files are rejected with field guidance", async () => {
  await assert.rejects(readImport(new File([], "bos.csv")), /Dosya boş/);
  await assert.rejects(readImport(new File(["a"], "rapor.pdf")), /Dosya türü/);
});

test("period bounds include leap day and reject invalid selectors", () => {
  assert.deepEqual(periodBounds("2028-02"), { firstDay: "2028-02-01", lastDay: "2028-02-29" });
  assert.equal(periodBounds("9999-12").lastDay, "9999-12-31");
  assert.throws(() => periodBounds("2026-13"), RangeError);
});

test("validation handles leading-zero tax IDs and invalid contact fields", () => {
  assert.deepEqual(clientFieldErrors({ company: "Firma", tax_number: "0123456789", phone: "+90 (212) 555 12 34" }), {
    company: undefined, tax_number: undefined, phone: undefined,
  });
  const invalid = clientFieldErrors({ company: "", tax_number: "123", phone: "abc" });
  assert.ok(invalid.company && invalid.tax_number && invalid.phone);
  assert.equal(invitationError("a".repeat(32)), undefined);
  assert.ok(invitationError("x".repeat(32)));
});

test("UI errors redact backend details and recognize retryable failures", () => {
  assert.equal(portalError({ code: "XX000", message: "private tax ID and database details" }, "Güvenli hata."), "Güvenli hata.");
  assert.match(portalError({ code: "42501", message: "internal" }, ""), /izniniz yok/);
  assert.match(portalError({ message: "TypeError: Failed to fetch" }, ""), /İnternet bağlantınızı/);
  assert.match(portalError({ code: "invalid_credentials" }, ""), /şifre hatalı/);
  assert.doesNotMatch(portalError({ code: "P0001", message: "Mükellef bulunamadı: 0123456789" }, ""), /0123456789/);
});
