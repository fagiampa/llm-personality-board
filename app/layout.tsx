import type { Metadata } from "next";
import { headers } from "next/headers";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import { resolveLocale } from "@/lib/i18n/locale";
import { LocaleProvider } from "@/lib/i18n/context";
import { dict } from "@/lib/i18n/dictionaries";
import { buildMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-heading",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
});

export function generateMetadata(): Metadata {
  const locale = resolveLocale(headers().get("accept-language"));
  const { metaTitle, metaDescription } = dict(locale).home;
  return {
    metadataBase: new URL(SITE_URL),
    ...buildMetadata({ title: metaTitle, description: metaDescription, path: "/" }),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale(headers().get("accept-language"));
  return (
    <html lang={locale} className={`${spaceGrotesk.variable} ${ibmPlexSans.variable}`}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
