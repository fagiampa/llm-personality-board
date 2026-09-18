import Link from "next/link";
import { headers } from "next/headers";
import { ModelGrid } from "@/components/ModelGrid";
import { getHomeData } from "@/lib/db.mjs";
import { ASSESS_REPEATS } from "@/lib/assessConfig.mjs";
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
            {t.legend(ASSESS_REPEATS)}
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

      <ModelGrid initialModels={models} initialVersions={versionsByModel} />

      <footer className={styles.footer}>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={styles.githubLink}>
          <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {t.githubLink}
        </a>
      </footer>
    </main>
  );
}
