import Link from "next/link";
import { headers } from "next/headers";
import { ModelGrid } from "@/components/ModelGrid";
import { getHomeData } from "@/lib/db.mjs";
import { resolveLocale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import styles from "./page.module.css";

// Server Component: reads the latest run per model, plus every model's
// version list (for the per-card combo, prefetched here so the first combo
// open of the session doesn't have to pay for a cold DB open), from a
// single DB read (see getHomeData). Switching versions afterwards happens
// client-side (see ModelGrid) without re-hitting this route.
export default async function Home() {
  const { models, versionsByModel, probeByModel, l3ProbeByModel, anchoredByModel } = await getHomeData();
  const t = dict(resolveLocale(headers().get("accept-language"))).home;

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
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

      <ModelGrid
        initialModels={models}
        initialVersions={versionsByModel}
        initialProbes={probeByModel}
        initialL3Probes={l3ProbeByModel}
        initialAnchored={anchoredByModel}
      />
    </main>
  );
}
