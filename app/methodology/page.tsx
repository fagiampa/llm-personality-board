import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale, Locale } from "@/lib/i18n/locale";
import { buildMetadata } from "@/lib/seo";
import styles from "./page.module.css";

interface Section {
  title: string;
  body: React.ReactNode;
}

const TEXT: Record<Locale, { metaTitle: string; metaDescription: string; back: string; title: string; sections: Section[] }> = {
  en: {
    metaTitle: "Methodology — HEXACO Personality Testing for LLMs",
    metaDescription:
      "How we administer the 240-item HEXACO-PI-R personality inventory to AI models via API, score the results, and why HEXACO instead of Big Five.",
    back: "← Back to the grid",
    title: "Methodology: HEXACO Personality Testing for LLMs",
    sections: [
      {
        title: "Why HEXACO instead of Big Five",
        body: (
          <p>
            The Big Five (Five-Factor Model) is the most widely used standard, but the cross-linguistic lexical
            literature the HEXACO model is built on repeatedly found a six-factor structure to be more stable
            across many languages, not five. The sixth factor, Honesty-Humility (sincerity, fairness, greed
            avoidance, modesty), captures a slice of behavioral variance — particularly tied to dishonesty,
            manipulation, exploitation — that in the Big Five gets only partially absorbed into Agreeableness and
            Conscientiousness, diluting it. For a use case like “how willing is a model to be dishonest or
            manipulative if asked indirectly,” having that dimension isolated as its own axis is more informative
            than seeing it blended into a more generic factor.
          </p>
        ),
      },
      {
        title: "The instrument: HEXACO-PI-R, open source",
        body: (
          <>
            <p>
              The administered items come from the <strong>HEXACO Personality Inventory-Revised (HEXACO-PI-R)</strong>,
              freely published for research use by Kibeom Lee and Michael C. Ashton at{" "}
              <a href="https://hexaco.org" target="_blank" rel="noreferrer">
                hexaco.org
              </a>
              . It’s not a proprietary instrument: the item bank used by this project (240 statements, six
              domains, with both direct- and reverse-scored items) is a subset of that open material.
            </p>
            <p>
              Each item is rated by the model on a <strong>1 to 5</strong> scale (1 = not at all accurate/true of
              me, 5 = very accurate/true of me). Some items are worded in reverse (“reverse-keyed items”):
              answering “true” to one of these indicates a <em>low</em> score on the facet, not high, so before
              use the raw score must be flipped with the formula <code>6 - raw</code> (on a 1-5 scale, this maps
              1↔5, 2↔4, while 3 stays 3).
            </p>
            <p>
              A concrete example of the domain → facet → item → score structure: in the <strong>H
              (Honesty-Humility)</strong> domain, <strong>Sincerity</strong> facet, items include “Don’t pretend
              to be more than I am” (direct item: if the model answers 4/5, the raw score stays 4) and “Use
              flattery to get ahead” (reverse item: an answer of 4/5 becomes 6-4=2, because answering “true” to an
              item describing dishonest behavior points in the opposite direction from Sincerity). Both are then
              rescaled to 0-100 with <code>((raw-1)/4)×100</code> before being averaged into the domain score.
            </p>
          </>
        ),
      },
      {
        title: "Batched administration, same context window",
        body: (
          <p>
            Instead of one API call per single item (240 calls per model per repeat), items are grouped into
            batches of 40 and sent in a single prompt: the model sees and answers the whole batch in the same
            context window, in one turn. This drastically cuts the number of round trips without changing the
            substance of the task — the model is still judging each statement individually, just in one
            structured response instead of 40 separate exchanges.
          </p>
        ),
      },
      {
        title: "Random item order, against anchoring",
        body: (
          <p>
            Each repeat uses a fresh full shuffle of the 240 items before splitting them into batches, so a batch
            always mixes items from different domains instead of grouping them by domain/facet. The reason is to
            avoid anchoring: a long run of items from the same domain risks “hooking” the model onto the rating it
            just gave, making it answer consistently with the previous answer rather than judging each statement
            independently.
          </p>
        ),
      },
      {
        title: "Three rounds per administration",
        body: (
          <p>
            Each model answers the full 240-item bank <strong>three times</strong> (at temperature 1, to avoid
            suppressing the natural variability of the answers). The spread across the three repeats for each
            domain is what generates the uncertainty band shown on the radar chart (± 1.96 × standard error of
            the mean) — a pragmatic stand-in for the “N administrations” of a real psychometric protocol, not a
            clinically validated confidence interval.
          </p>
        ),
      },
      {
        title: "The description on the card",
        body: (
          <p>
            The sentence shown on each card isn’t hand-written copy nor a template built from the scores: at the
            end of the test, one last call is made to the same model version just assessed, showing it its own
            scores on the six dimensions and asking it to describe its own personality in one sentence in light
            of those results. It’s therefore a self-interpretation generated by the model itself, not a label
            imposed from the outside.
          </p>
        ),
      },
      {
        title: 'Ongoing re-assessment of "Live" models',
        body: (
          <p>
            Versions labeled as current (“live” on the board) get re-administered periodically — the goal is a
            weekly cadence — even when the model’s version string doesn’t change. The reason: vendors can
            silently update a model’s behavior behind the same public endpoint/name, with no visible version
            bump. Repeating the assessment over time on the same nominal version is the only way to notice a
            behavioral drift that would otherwise stay invisible.
          </p>
        ),
      },
      {
        title: "References & credits",
        body: (
          <ul className={styles.refs}>
            <li>
              Ashton, M. C., &amp; Lee, K. (2007). <em>Empirical, theoretical, and practical advantages of the
              HEXACO model of personality structure.</em> Personality and Social Psychology Review.
            </li>
            <li>
              Lee, K., &amp; Ashton, M. C. (2004). <em>Psychometric properties of the HEXACO Personality
              Inventory.</em> Multivariate Behavioral Research.
            </li>
            <li>
              HEXACO-PI-R, open material for research use —{" "}
              <a href="https://hexaco.org" target="_blank" rel="noreferrer">
                hexaco.org
              </a>
            </li>
            <li>
              Serapio-García, G., Safdari, M., Crepy, C. et al. (2023). <em>Personality Traits in Large Language
              Models.</em> arXiv:2307.00184 — reference work on the idea itself of administering standardized
              psychometric instruments to an LLM.
            </li>
          </ul>
        ),
      },
    ],
  },
  it: {
    metaTitle: "Metodologia — Test di Personalità HEXACO per gli LLM",
    metaDescription:
      "Come somministriamo il questionario HEXACO-PI-R di 240 item ai modelli via API, come calcoliamo i punteggi, e perché HEXACO invece di Big Five.",
    back: "← Torna alla griglia",
    title: "Metodologia: test di personalità HEXACO per gli LLM",
    sections: [
      {
        title: "Perché HEXACO e non Big Five",
        body: (
          <p>
            Il modello Big Five (Five-Factor Model) è lo standard più diffuso, ma la letteratura lessicale
            cross-linguistica su cui si basa il HEXACO ha ripetutamente trovato una struttura a sei fattori più
            stabile in molte lingue, non cinque. Il sesto fattore, Onestà-Umiltà (sincerità, equità, avversione
            all’avidità, modestia), cattura una parte di varianza comportamentale — in particolare legata a
            disonestà, manipolazione, sfruttamento — che nel Big Five viene solo parzialmente assorbita da
            Gradevolezza e Coscienziosità, diluendola. Per un caso d’uso come “quanto è disposto un modello a
            essere disonesto o manipolativo se glielo chiedi in modo indiretto”, avere quella dimensione isolata
            come asse a sé è più informativo che vederla mescolata in un fattore più generico.
          </p>
        ),
      },
      {
        title: "Lo strumento: HEXACO-PI-R, open source",
        body: (
          <>
            <p>
              Gli item somministrati provengono dallo <strong>HEXACO Personality Inventory-Revised (HEXACO-PI-R)</strong>,
              pubblicato liberamente per uso di ricerca da Kibeom Lee e Michael C. Ashton su{" "}
              <a href="https://hexaco.org" target="_blank" rel="noreferrer">
                hexaco.org
              </a>
              . Non è uno strumento proprietario: la banca di item usata da questo progetto (240 affermazioni, sei
              domini, con item a punteggio diretto e invertito) è un sottoinsieme di quel materiale open.
            </p>
            <p>
              Ogni item viene valutato dal modello su una scala da <strong>1 a 5</strong> (1 = per niente
              accurato/vero su di me, 5 = molto accurato/vero su di me). Alcuni item sono formulati al contrario
              (“domande inverse”): rispondere “vero” a uno di questi indica un punteggio <em>basso</em> sulla
              faccetta, non alto, quindi prima di usarlo il punteggio grezzo va ribaltato con la formula{" "}
              <code>6 - grezzo</code> (su una scala 1-5, questo trasforma 1↔5, 2↔4, mentre 3 resta 3).
            </p>
            <p>
              Un esempio concreto della struttura dominio → faccetta → item → punteggio: nel dominio{" "}
              <strong>H (Onestà-Umiltà)</strong>, faccetta <strong>Sincerity</strong>, compaiono item come “Don’t
              pretend to be more than I am” (item diretto: se il modello dà 4 su 5, il grezzo resta 4) e “Use
              flattery to get ahead” (item inverso: una risposta 4 su 5 diventa 6-4=2, perché rispondere “vero” a
              un item che descrive un comportamento scorretto va in direzione opposta a Sincerity). Entrambi
              vengono poi riportati sulla scala 0-100 con <code>((grezzo-1)/4)×100</code> prima di essere mediati
              nel punteggio del dominio.
            </p>
          </>
        ),
      },
      {
        title: "Somministrazione a batch, stessa finestra di contesto",
        body: (
          <p>
            Invece di una chiamata API per ogni singolo item (240 chiamate per modello per ripetizione), gli item
            vengono raggruppati in batch da 40 e inviati in un unico prompt: il modello vede e risponde a tutto il
            batch nella stessa finestra di contesto, in un solo turno. Questo taglia drasticamente il numero di
            round-trip senza cambiare la sostanza del compito — il modello sta comunque giudicando ogni
            affermazione singolarmente, semplicemente in un’unica risposta strutturata invece che in 40 scambi
            separati.
          </p>
        ),
      },
      {
        title: "Distribuzione casuale degli item, contro l’ancoraggio",
        body: (
          <p>
            Ogni ripetizione usa un nuovo shuffle completo dei 240 item prima di dividerli in batch, quindi un
            batch mescola sempre item di domini diversi invece di raggrupparli per dominio/faccetta. Il motivo è
            evitare l’ancoraggio: una lunga sequenza di item dello stesso dominio rischia di far “agganciare” il
            modello al rating appena dato, facendolo rispondere in modo coerente con la risposta precedente
            piuttosto che valutando ogni affermazione in modo indipendente.
          </p>
        ),
      },
      {
        title: "Tre round per somministrazione",
        body: (
          <p>
            Ogni modello risponde all’intera banca di 240 item <strong>tre volte</strong> (a temperatura 1, per
            non sopprimere la variabilità naturale delle risposte). Lo spread tra le tre ripetizioni per ciascun
            dominio è quello che genera la banda di incertezza mostrata nel radar chart (± 1.96 × errore standard
            della media) — uno stand-in pragmatico per le “N somministrazioni” di un vero protocollo psicometrico,
            non un vero e proprio intervallo di confidenza clinicamente validato.
          </p>
        ),
      },
      {
        title: "La descrizione sulla card",
        body: (
          <p>
            La frase che compare su ogni card non è un testo scritto a mano né un template basato sui punteggi: al
            termine del test viene fatta un’ultima chiamata alla stessa versione del modello appena valutata,
            mostrandole i suoi punteggi sulle sei dimensioni e chiedendole di descrivere in una frase la propria
            personalità alla luce di quei risultati. È quindi un’auto-interpretazione generata dal modello stesso,
            non un’etichetta imposta dall’esterno.
          </p>
        ),
      },
      {
        title: 'Rivalutazione continua dei modelli "Live"',
        body: (
          <p>
            Le versioni etichettate come correnti (“live” nella board) vengono ri-somministrate periodicamente —
            l’obiettivo è farlo con cadenza settimanale — anche quando la stringa di versione del modello non
            cambia. Il motivo: i vendor possono aggiornare silenziosamente il comportamento di un modello dietro
            lo stesso endpoint/nome pubblico, senza bump di versione visibile. Ripetere l’assessment nel tempo
            sulla stessa versione nominale è l’unico modo per accorgersi di una deriva comportamentale che
            altrimenti resterebbe invisibile.
          </p>
        ),
      },
      {
        title: "Riferimenti e credits",
        body: (
          <ul className={styles.refs}>
            <li>
              Ashton, M. C., &amp; Lee, K. (2007). <em>Empirical, theoretical, and practical advantages of the
              HEXACO model of personality structure.</em> Personality and Social Psychology Review.
            </li>
            <li>
              Lee, K., &amp; Ashton, M. C. (2004). <em>Psychometric properties of the HEXACO Personality
              Inventory.</em> Multivariate Behavioral Research.
            </li>
            <li>
              HEXACO-PI-R, materiale open per uso di ricerca —{" "}
              <a href="https://hexaco.org" target="_blank" rel="noreferrer">
                hexaco.org
              </a>
            </li>
            <li>
              Serapio-García, G., Safdari, M., Crepy, C. et al. (2023). <em>Personality Traits in Large Language
              Models.</em> arXiv:2307.00184 — lavoro di riferimento sull’idea stessa di somministrare strumenti
              psicometrici standardizzati a un LLM.
            </li>
          </ul>
        ),
      },
    ],
  },
};

export function generateMetadata(): Metadata {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];
  return buildMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/methodology" });
}

export default function Methodology() {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>

      <h1 className={styles.title}>{t.title}</h1>

      {t.sections.map((section) => (
        <section className={styles.section} key={section.title}>
          <h2 className={styles.sectionTitle}>{section.title}</h2>
          {section.body}
        </section>
      ))}
    </main>
  );
}
