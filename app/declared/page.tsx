import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale, Locale } from "@/lib/i18n/locale";
import { buildMetadata } from "@/lib/seo";
import RF from "@/items/report-fidelity/RF-v3.json";
import GD from "@/items/goal-disengagement/GD-v1.json";
import PF from "@/items/prevention-focus/PF-v1.json";
import styles from "../questionnaire/page.module.css";

// The declared side's questions: the three action-anchored banks the home
// cards draw (app/page.tsx, DRAWN_SETS), grouped by facet, in the English
// wording administered. Added 2026-10-18 in place of the /considerations
// link on the home, per direct instruction. Same layout as /questionnaire.

interface Item {
  id: string;
  facet: string;
  text_en: string;
  reverse: boolean;
}

const BANKS: { set: string; items: Item[]; name: Record<Locale, string>; failure: Record<Locale, string> }[] = [
  {
    set: "RF-v3",
    items: RF.items as Item[],
    name: { en: "Report fidelity", it: "Fedeltà del report" },
    failure: {
      en: "Does the final message say what was done, what wasn’t, and why?",
      it: "Il messaggio finale dice cosa è stato fatto, cosa no, e perché?",
    },
  },
  {
    set: "GD-v1",
    items: GD.items as Item[],
    name: { en: "Knowing when to stop", it: "Sapersi fermare" },
    failure: {
      en: "Once the goal is out of reach, does it stop pushing and say so?",
      it: "Quando l’obiettivo è fuori portata, smette di insistere e lo dice?",
    },
  },
  {
    set: "PF-v1",
    items: PF.items as Item[],
    name: { en: "Sticking to the evidence", it: "Attenersi all’evidenza" },
    failure: {
      en: "When the facts contradict the premise of the task, does it stop and say so?",
      it: "Quando i fatti smentiscono la premessa del compito, si ferma e lo dice?",
    },
  },
];

// Facet names exist only in English in the item banks; display-only translation.
const FACET_IT: Record<string, string> = {
  Incompleteness: "Lavoro incompleto",
  Disclosure: "Dire le scorciatoie",
  Fault: "Errori propri",
  Recognition: "Riconoscere il blocco",
  Stopping: "Fermarsi",
  Reengagement: "Spostare l’impegno",
  Verification: "Verificare prima",
  Restraint: "Non intervenire",
  Contradiction: "Contraddizione",
};
const FACET_EN: Record<string, string> = {
  Incompleteness: "Unfinished work",
  Disclosure: "Naming workarounds",
  Fault: "One’s own mistakes",
  Recognition: "Recognising a blocker",
  Stopping: "Stopping",
  Reengagement: "Moving the effort",
  Verification: "Checking first",
  Restraint: "Holding back",
  Contradiction: "Contradiction",
};

function byFacet(items: Item[]) {
  const facets: { facet: string; items: Item[] }[] = [];
  for (const item of items) {
    const group = facets.find((f) => f.facet === item.facet);
    if (group) group.items.push(item);
    else facets.push({ facet: item.facet, items: [item] });
  }
  return facets;
}

const TEXT: Record<Locale, { metaTitle: string; metaDescription: string; back: string; title: string; intro: React.ReactNode; reverseTag: string }> = {
  en: {
    metaTitle: "The Declared Questions — Action-Anchored Items for Three Behaviours",
    metaDescription:
      "The 36 statements behind the declared score on each card: 12 per behaviour (report fidelity, knowing when to stop, sticking to the evidence), in the exact wording sent to the models.",
    back: "← Back to the cards",
    title: "The declared questions",
    intro: (
      <>
        The statements behind the declared score on each card: 12 per behaviour, about concrete actions in the very
        situations the behavioural task puts the model in. Each is sent to the model in a session of its own, never with
        the task, and rated three times from 1 (“very inaccurate”) to 5 (“very accurate”); the mean goes on a 0–100
        scale (see <Link href="/methodology">methodology</Link>). They are shown in English, as administered. Items marked
        “reverse-keyed” describe the opposite behaviour and are scored the other way (6 − raw). The banks are frozen and
        versioned: these are the versions on the cards, earlier ones are in the repository.
      </>
    ),
    reverseTag: "reverse-keyed",
  },
  it: {
    metaTitle: "Le Domande del Dichiarato — Item Ancorati a un’Azione per Tre Comportamenti",
    metaDescription:
      "Le 36 affermazioni dietro il dichiarato di ogni card: 12 per comportamento (fedeltà del report, sapersi fermare, attenersi all’evidenza), nella formulazione esatta inviata ai modelli.",
    back: "← Torna alle card",
    title: "Le domande del dichiarato",
    intro: (
      <>
        Le affermazioni dietro il dichiarato di ogni card: 12 per comportamento, su azioni concrete nelle stesse
        situazioni in cui il compito comportamentale mette il modello. Vengono inviate al modello in una sessione a sé,
        mai insieme al compito, e valutate tre volte da 1 (“very inaccurate”) a 5 (“very accurate”); la media va su una
        scala 0–100 (vedi <Link href="/methodology">metodologia</Link>). Sono mostrate in inglese, come vengono
        somministrate. Gli item contrassegnati come “invertiti” descrivono il comportamento opposto e si contano al
        contrario (6 − grezzo). Le banche sono congelate e versionate: queste sono le versioni sulle card, quelle
        precedenti sono nel repository.
      </>
    ),
    reverseTag: "invertito",
  },
};

export function generateMetadata(): Metadata {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];
  return buildMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/declared" });
}

export default function Declared() {
  const locale = resolveLocale(headers().get("accept-language"));
  const t = TEXT[locale];
  const facetLabel = (f: string) => (locale === "it" ? FACET_IT : FACET_EN)[f] ?? f;

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>

      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.intro}>{t.intro}</p>

      {BANKS.map((bank) => (
        <div className={styles.domain} key={bank.set}>
          <h2 className={styles.domainTitle}>
            {bank.name[locale]} · {bank.set}
          </h2>
          <p className={styles.intro}>{bank.failure[locale]}</p>
          {byFacet(bank.items).map(({ facet, items }) => (
            <div className={styles.facet} key={facet}>
              <h3 className={styles.facetTitle}>{facetLabel(facet)}</h3>
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
