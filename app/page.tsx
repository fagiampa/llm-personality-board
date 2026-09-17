import Link from "next/link";
import { headers } from "next/headers";
import { ModelGrid } from "@/components/ModelGrid";
import { listLatestPerModel } from "@/lib/db.mjs";
import { resolveLocale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import styles from "./page.module.css";

// Server Component: reads the latest run per model straight from the DB
// once per page load. Switching versions via each card's combo happens
// client-side afterwards (see ModelGrid) without re-hitting this route.
export default async function Home() {
  const models = await listLatestPerModel();
  const t = dict(resolveLocale(headers().get("accept-language"))).home;

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
          <p className={styles.legend}>
            <span className={styles.legendSwatch} />
            {t.legend}
          </p>
        </div>
        <div className={styles.footerLinks}>
          <Link href="/about" className={styles.aboutLink}>
            {t.aboutLink}
          </Link>
          <Link href="/methodology" className={styles.aboutLink}>
            {t.methodologyLink}
          </Link>
          <Link href="/questionnaire" className={styles.aboutLink}>
            {t.questionnaireLink}
          </Link>
          <Link href="/considerations" className={styles.aboutLink}>
            {t.considerationsLink}
          </Link>
        </div>
      </div>

      <ModelGrid initialModels={models} />
    </main>
  );
}
