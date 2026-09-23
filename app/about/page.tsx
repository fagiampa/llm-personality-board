import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import { buildMetadata } from "@/lib/seo";
import styles from "./page.module.css";
import { ConceptSection } from "./ConceptSection";

export function generateMetadata(): Metadata {
  const t = dict(resolveLocale(headers().get("accept-language"))).about;
  return buildMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/about" });
}

export default function About() {
  const locale = resolveLocale(headers().get("accept-language"));
  const t = dict(locale).about;

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>

      <section className={styles.author}>
        <div className={styles.monogram}>IT</div>
        <div>
          <h1 className={styles.name}>{t.name}</h1>
          <p className={styles.tagline}>{t.tagline}</p>
          <a className={styles.email} href="mailto:tennicodabar@gmail.com">
            tennicodabar@gmail.com
          </a>
        </div>
      </section>

      <section className={styles.about}>
        <h2 className={styles.sectionTitle}>{t.sectionTitle}</h2>
        {t.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </section>

      <ConceptSection locale={locale} />
    </main>
  );
}
