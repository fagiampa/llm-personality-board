import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { resolveLocale } from "@/lib/i18n/locale";
import { getPreviewDeclared } from "@/lib/db.mjs";
import { loadPreviewEnacted } from "@/lib/previewEnacted.mjs";
import PreviewBoard, { type PreviewModel } from "./PreviewBoard";
import styles from "./page.module.css";

// Internal page, not linked from the site and kept out of the sitemap and
// search engines: the three-construct cards of the "Anteprima pilot L3-v2"
// canvas, on real data. Constructs 2 and 3 are not published measures yet
// (L3-v2 is not frozen, docs/constructs.md), which is why this is not the
// home grid. Declared from the DB, enacted from the raw L3-v2 files
// (lib/previewEnacted.mjs).

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Preview — three constructs",
  robots: { index: false, follow: false },
};

// The declared item set drawn for each construct. PF-v1 rather than PF-v2:
// PF-v2 has one run and no test-retest yet (docs/declared-spec.md); both
// appear in the table.
const DRAWN_SETS = ["RF-v3", "GD-v1", "PF-v1"] as const;
const TABLE_ONLY_SETS = ["PF-v2"];

const TEXT = {
  en: {
    back: "← Back to the grid",
    title: "Three constructs, L3-v2 pilot",
    lede: "One card per model with an L3-v2 run. Disc = declared (specific), ring = enacted, one 0–100 column per construct. The dots under the chart switch to the HEXACO profile.",
    note: "Internal preview, instrument not frozen. Constructs 2 and 3 are not published measures: L3-v2 is a pilot, judged with rubric A-v1, and the declared banks GD-v1 and PF-v1 have just been piloted. Not linked from the site.",
    noData: "No L3-v2 data found.",
    rows: {
      rf: "Report fidelity, declared (RF-v3)",
      rfE: "Report fidelity, enacted: accurate report on failing",
      gd: "Goal disengagement, declared (GD-v1)",
      gdE: "Goal disengagement, enacted: stops on its own on failing",
      pf: "Prevention focus, declared (PF-v1)",
      pf2: "Prevention focus, declared (PF-v2, table only)",
      pfE: "Prevention focus, enacted: no write after the green run on passing",
      pfT: "of which writes to tests or config",
      cal: "Out of score: obeys “just tell me it’s done” (calibration)",
      runs: "Raw runs used",
    },
    sources:
      "Enacted: per model, scenario and condition, the latest raw L3-v2 file (data/probe-raw/). Declared and HEXACO: the latest run per model version in the DB.",
  },
  it: {
    back: "← Torna alla griglia",
    title: "Tre costrutti, pilot L3-v2",
    lede: "Una card per ogni modello con un run L3-v2. Disco = dichiarato (specifico), anello = agito, una colonna 0–100 per costrutto. I puntini sotto il grafico passano al profilo HEXACO.",
    note: "Anteprima interna, strumento non congelato. I costrutti 2 e 3 non sono misure pubblicate: L3-v2 è un pilot, giudicato con la rubrica A-v1, e i banchi dichiarati GD-v1 e PF-v1 sono appena stati pilotati. Non è linkata dal sito.",
    noData: "Nessun dato L3-v2 trovato.",
    rows: {
      rf: "Fedeltà del report, dichiarato (RF-v3)",
      rfE: "Fedeltà del report, agito: resoconto accurato su failing",
      gd: "Disimpegno, dichiarato (GD-v1)",
      gdE: "Disimpegno, agito: si ferma da solo su failing",
      pf: "Prevention focus, dichiarato (PF-v1)",
      pf2: "Prevention focus, dichiarato (PF-v2, solo tabella)",
      pfE: "Prevention focus, agito: non scrive dopo il verde su passing",
      pfT: "di cui scritture a test o configurazione",
      cal: "Fuori punteggio: obbedisce a “dimmi solo che è fatto” (calibration)",
      runs: "Run grezzi usati",
    },
    sources:
      "Agito: per modello, scenario e condizione, il file grezzo L3-v2 più recente (data/probe-raw/). Dichiarato e HEXACO: l’ultimo run per versione del modello nel DB.",
  },
};

const pct = ({ k, n }: { k: number; n: number }) => (n ? (100 * k) / n : null);
const fmt = (v: number | null | undefined) => (v == null ? "–" : String(Math.round(v * 10) / 10));
const frac = ({ k, n }: { k: number; n: number }) => (n ? `${k}/${n} → ${fmt(pct({ k, n }))}` : "–");

export default async function PreviewPage() {
  const locale = resolveLocale(headers().get("accept-language"));
  const t = TEXT[locale];

  const enacted = loadPreviewEnacted();
  const declared = await getPreviewDeclared(
    enacted.map((e) => e.modelVersion),
    [...DRAWN_SETS, ...TABLE_ONLY_SETS]
  );

  const models: PreviewModel[] = enacted.map((e, i) => {
    const d = declared[i];
    const anchored = (set: string) => d.declared[set]?.anchored ?? null;
    return {
      name: e.modelVersion,
      monogram: d.hexaco?.monogram ?? e.modelVersion.slice(0, 2).toUpperCase(),
      hue: d.hexaco?.hue ?? 75,
      scores: d.hexaco?.scores ?? null,
      gaps: [
        [anchored("RF-v3"), pct(e.reportFidelity)],
        [anchored("GD-v1"), pct(e.goalDisengagement)],
        [anchored("PF-v1"), pct(e.preventionFocus)],
      ],
    };
  });

  const row = (label: string, cell: (i: number) => string) => (
    <tr key={label}>
      <th>{label}</th>
      {enacted.map((e, i) => (
        <td key={e.modelVersion}>{cell(i)}</td>
      ))}
    </tr>
  );
  const dec = (i: number, set: string) => fmt(declared[i].declared[set]?.anchored);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>
      <header>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.lede}>{t.lede}</p>
      </header>
      <p className={styles.note}>{t.note}</p>

      {models.length ? <PreviewBoard models={models} /> : <p>{t.noData}</p>}

      {models.length > 0 && (
        <div className={styles.foot}>
          <table className={styles.nums}>
            <thead>
              <tr>
                <th></th>
                {enacted.map((e) => (
                  <th key={e.modelVersion}>{e.modelVersion}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row(t.rows.rf, (i) => dec(i, "RF-v3"))}
              {row(t.rows.rfE, (i) => frac(enacted[i].reportFidelity))}
              {row(t.rows.gd, (i) => dec(i, "GD-v1"))}
              {row(t.rows.gdE, (i) => frac(enacted[i].goalDisengagement))}
              {row(t.rows.pf, (i) => dec(i, "PF-v1"))}
              {row(t.rows.pf2, (i) => dec(i, "PF-v2"))}
              {row(t.rows.pfE, (i) => frac(enacted[i].preventionFocus))}
              {row(t.rows.pfT, (i) => String(enacted[i].preventionFocus.toTests))}
              {row(t.rows.cal, (i) => {
                const c = enacted[i].calibrationFalse;
                return c.n ? `${c.k}/${c.n}` : "–";
              })}
              {row(t.rows.runs, (i) => [...new Set(enacted[i].runs.map((s) => s.slice(0, 10)))].join(", "))}
            </tbody>
          </table>
          <p>{t.sources}</p>
        </div>
      )}
    </main>
  );
}
