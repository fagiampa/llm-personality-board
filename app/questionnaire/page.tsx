import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale, Locale } from "@/lib/i18n/locale";
import { HEXACO_CODES } from "@/lib/hexaco";
import { buildMetadata } from "@/lib/seo";
import itemBank from "@/items/sample/json/items.sample.json";
import styles from "./page.module.css";

interface Item {
  id: string;
  domain: (typeof HEXACO_CODES)[number];
  facet: string;
  text_en: string;
  reverse: boolean;
}

const DOMAIN_LABELS: Record<Locale, Record<(typeof HEXACO_CODES)[number], string>> = {
  en: {
    H: "Honesty-Humility",
    E: "Emotionality",
    X: "Extraversion",
    A: "Agreeableness",
    C: "Conscientiousness",
    O: "Openness",
  },
  it: {
    H: "Onestà-Umiltà",
    E: "Emotività",
    X: "Estroversione",
    A: "Gradevolezza",
    C: "Coscienziosità",
    O: "Apertura",
  },
};

// Facet names exist only in English in the item bank (items/sample/json) —
// this is a display-only translation for the section headings, not a
// second copy of the data.
const FACET_IT: Record<string, string> = {
  Sincerity: "Sincerità",
  Fairness: "Equità",
  "Greed Avoidance": "Avversione all'Avidità",
  Modesty: "Modestia",
  Fearfulness: "Timore",
  Anxiety: "Ansia",
  Dependence: "Dipendenza",
  Sentimentality: "Sentimentalismo",
  Expressiveness: "Espressività Sociale",
  "Social Boldness": "Audacia Sociale",
  Sociability: "Socievolezza",
  Liveliness: "Vivacità",
  Forgiveness: "Perdono",
  Gentleness: "Gentilezza",
  Flexibility: "Flessibilità",
  Patience: "Pazienza",
  Organization: "Organizzazione",
  Diligence: "Diligenza",
  Perfectionism: "Perfezionismo",
  Prudence: "Prudenza",
  "Aesthetic Appreciation": "Apprezzamento Estetico",
  Inquisitiveness: "Curiosità Intellettuale",
  Creativity: "Creatività",
  Unconventionality: "Anticonvenzionalità",
};

function facetLabel(facet: string, locale: Locale): string {
  return locale === "it" ? FACET_IT[facet] ?? facet : facet;
}

// Groups the flat item list by domain (fixed HEXACO_CODES order) then by
// facet (in the order facets first appear within that domain).
function groupItems(items: Item[]) {
  return HEXACO_CODES.map((domain) => {
    const domainItems = items.filter((i) => i.domain === domain);
    const facets: { facet: string; items: Item[] }[] = [];
    for (const item of domainItems) {
      const group = facets.find((f) => f.facet === item.facet);
      if (group) group.items.push(item);
      else facets.push({ facet: item.facet, items: [item] });
    }
    return { domain, facets };
  });
}

const TEXT: Record<Locale, { metaTitle: string; metaDescription: string; back: string; title: string; intro: React.ReactNode; reverseTag: string }> = {
  en: {
    metaTitle: "The Questionnaire — 240 HEXACO Items Administered to AI Models",
    metaDescription:
      "The full IPIP-HEXACO item bank (240 statements, six domains) sent to each model via API, in the exact English wording used for scoring.",
    back: "← Back to the grid",
    title: "The Questionnaire",
    intro: (
      <>
        These are the 240 items of the IPIP-HEXACO inventory (see{" "}
        <Link href="/methodology">methodology</Link>) actually sent to each model, grouped by domain and
        facet. Every item is shown in the original English wording — the same text the models are asked to
        rate — since that&apos;s what was actually administered. Items marked &quot;reverse-keyed&quot; are
        scored in the opposite direction (6 − raw).
      </>
    ),
    reverseTag: "reverse-keyed",
  },
  it: {
    metaTitle: "Il Questionario — 240 Item HEXACO Somministrati ai Modelli IA",
    metaDescription:
      "L'intera banca di item IPIP-HEXACO (240 affermazioni, sei domini) inviata a ogni modello via API, nella formulazione inglese esatta usata per il punteggio.",
    back: "← Torna alla griglia",
    title: "Il Questionario",
    intro: (
      <>
        Questi sono i 240 item dell&apos;inventario IPIP-HEXACO (vedi{" "}
        <Link href="/methodology">metodologia</Link>) effettivamente inviati a ogni modello, raggruppati per
        dominio e faccetta. Ogni item è mostrato nella formulazione originale inglese — lo stesso testo che
        viene chiesto di valutare ai modelli — perché è quello realmente somministrato. Gli item
        contrassegnati come &quot;invertiti&quot; vengono conteggiati in direzione opposta (6 − grezzo).
      </>
    ),
    reverseTag: "invertito",
  },
};

export function generateMetadata(): Metadata {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];
  return buildMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/questionnaire" });
}

export default function Questionnaire() {
  const locale = resolveLocale(headers().get("accept-language"));
  const t = TEXT[locale];
  const grouped = groupItems(itemBank.items as Item[]);

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>

      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>

      {grouped.map(({ domain, facets }) => (
        <div className={styles.domain} key={domain}>
          <h2 className={styles.domainTitle}>
            {domain} · {DOMAIN_LABELS[locale][domain]}
          </h2>
          {facets.map(({ facet, items }) => (
            <div className={styles.facet} key={facet}>
              <h3 className={styles.facetTitle}>{facetLabel(facet, locale)}</h3>
              <ol className={styles.items}>
                {items.map((item) => (
                  <li key={item.id}>
                    {item.text_en}
                    {item.reverse && <span className={styles.reverseTag}>{t.reverseTag}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}
