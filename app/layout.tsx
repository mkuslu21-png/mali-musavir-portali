import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mali Müşavir Portalı",
  description: "Mükellef takibi, resmi faturalar ve dönem özetleri.",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
