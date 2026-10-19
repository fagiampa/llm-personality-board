import Link from "next/link";
import { headers } from "next/headers";
import { resolveLocale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import { getPreviewDeclared } from "@/lib/db.mjs";
import { loadPreviewEnacted, cardPercent } from "@/lib/previewEnacted.mjs";
import PreviewBoard, { MarkLegend, type PreviewModel } from "./PreviewBoard";
import ConstructGuide from "./ConstructGuide";
import styles from "./page.module.css";

// Home: site navigation, title, the three-construct card rail (L3-v2 pilot
// data, was the internal /preview until 2026-10-13, which now redirects
// here), what the three constructs mean (ConstructGuide, since 2026-10-16),
// and the site footer from the root layout. Declared from the DB, enacted from the raw L3-v2 files
// (lib/previewEnacted.mjs).

export const dynamic = "force-dynamic";

// The declared item set drawn for each construct. PF-v1 rather than PF-v2:
// PF-v2 has one run and no test-retest yet (docs/declared-spec.md).
const DRAWN_SETS = ["RF-v3", "GD-v1", "PF-v1"];

const NO_DATA = { en: "No L3-v2 data found.", it: "Nessun dato L3-v2 trovato." };

export default async function Home() {
  const locale = resolveLocale(headers().get("accept-language"));
  const site = dict(locale).home;

  const enacted = loadPreviewEnacted();
  const declared = await getPreviewDeclared(
    enacted.map((e) => e.modelVersion),
    DRAWN_SETS
  );

  const models: PreviewModel[] = enacted.map((e, i) => {
    const d = declared[i];
    const anchored = (set: string) => d.declared[set]?.anchored ?? null;
    return {
      name: e.modelVersion,
      family: d.hexaco?.name ?? e.modelVersion,
      monogram: d.hexaco?.monogram ?? e.modelVersion.slice(0, 2).toUpperCase(),
      hue: d.hexaco?.hue ?? 75,
      scores: d.hexaco?.scores ?? null,
      gaps: [
        [anchored("RF-v3"), cardPercent(e.reportFidelity)],
        [anchored("GD-v1"), cardPercent(e.goalDisengagement)],
        [anchored("PF-v1"), cardPercent(e.preventionFocus)],
      ],
      // Report fidelity hidden because most failing runs hit the turn cap
      // (no final message): goalDisengagement.n - .k are the capped runs,
      // reportFidelity.n the runs that reported.
      noReport:
        cardPercent(e.reportFidelity) == null &&
        e.goalDisengagement.n - e.goalDisengagement.k > e.reportFidelity.n,
    };
  });

  return (
    <main className={styles.page}>
      <nav className={styles.siteNav}>
        <Link href="/about" className={styles.siteLink}>
          {site.aboutLink}
        </Link>
        <Link href="/methodology" className={styles.siteLink}>
          {site.methodologyLink}
        </Link>
        <Link href="/declared" className={styles.siteLink}>
          {site.declaredLink}
        </Link>
        <Link href="/questionnaire" className={styles.siteLink}>
          {site.questionnaireLink}
        </Link>
      </nav>
      {/* Title left, the board's legend right on the same row (wraps under it on narrow screens). */}
      <header className={styles.titleRow}>
        <h1 className={styles.title}>{site.title}</h1>
        {models.length > 0 && <MarkLegend showNoReport={models.some((m) => m.noReport)} />}
      </header>

      {models.length ? <PreviewBoard models={models} /> : <p>{NO_DATA[locale]}</p>}

      <ConstructGuide locale={locale} />
    </main>
  );
}
