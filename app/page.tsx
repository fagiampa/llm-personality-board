import Link from "next/link";
import { headers } from "next/headers";
import { ModelGrid } from "@/components/ModelGrid";
import { getHomeData } from "@/lib/db.mjs";
import { resolveLocale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import { GITHUB_URL } from "@/lib/site";
import styles from "./page.module.css";

// Server Component: reads the latest run per model, plus every model's
// version list (for the per-card combo, prefetched here so the first combo
// open of the session doesn't have to pay for a cold DB open), from a
// single DB read (see getHomeData). Switching versions afterwards happens
// client-side (see ModelGrid) without re-hitting this route.
export default async function Home() {
  const { models, versionsByModel } = await getHomeData();
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
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.aboutLink}>
            {t.githubLink}
          </a>
        </div>
      </div>

      <ModelGrid initialModels={models} initialVersions={versionsByModel} />
    </main>
  );
}
