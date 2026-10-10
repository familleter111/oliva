import type { Metadata, Viewport } from "next";
import { Geist, Newsreader } from "next/font/google";
import { I18nProvider } from "@/components/i18n";
import "./globals.css";

const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Oliva", template: "%s · Oliva" },
  description: "La carte du restaurant Oliva.",
};

export const viewport: Viewport = { themeColor: "#f8f9f5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${newsreader.variable} ${geist.variable}`}>
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
