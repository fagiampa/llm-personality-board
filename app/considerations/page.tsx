import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveLocale, Locale } from "@/lib/i18n/locale";
import { buildMetadata } from "@/lib/seo";
import styles from "./page.module.css";

const TEXT: Record<Locale, { metaTitle: string; metaDescription: string; back: string; title: string; body: React.ReactNode }> = {
  en: {
    metaTitle: "Does AI Have a Personality? — Further Considerations",
    metaDescription:
      "Honest doubts about what it means — and doesn’t — to say a language model has a personality, and why it might still matter for agentic AI.",
    back: "← Back to the grid",
    title: "Does AI Really Have a Personality?",
    body: (
      <>
        <p>
          The doubt that an experiment like this could be filed under pseudoscience or divertissement is very
          real: asking an LLM whether it gets moved by a film might not make much sense — or certainly makes
          less sense, or a different kind of sense, than asking a human. But in every case, giving a definite
          answer to a question like that is the outcome of a process which, today, however much it may be a
          simulated process, can still involve a fairly articulated chain of conceptual processing — once the
          exclusive province of humans, but no longer.
        </p>
        <p>
          In the age of agentic AI, moreover, a not-fully-deterministic conceptual process, typical of natural
          language, can correspond to actions that lead to real events (concrete, not simulated). If an AI has
          no character, it can simulate one, and act concretely on that basis. Monitoring, downstream of an
          LLM’s production process, the emergence of a given simulated personality (and not just its advance in
          semantic and cognitive capabilities) might not be such a foolish idea — also in relation to alignment
          problems.
        </p>
        <p>
          Most likely, tests like these will need to be adapted for LLMs to understand what tendencies they have
          toward objective functions (once they become agents) and toward aggregate work dynamics for when they
          act in swarms.
        </p>
        <p>Perhaps, as always, this too comes down to finding the right questions rather than the right answers.</p>

        <h2 className={styles.subtitle}>Three planes of speech: a reading through Vygotsky</h2>
        <p>
          In <em>Thought and Language</em> (1934), Lev Vygotsky distinguishes three planes: external speech,
          addressed to others; egocentric speech, the child thinking aloud while playing; and inner speech —
          condensed, almost without syntax, a “cloud of sense” that never coincides with the words that later
          express it. They map almost one to one onto what an agentic model leaves behind. The final report and
          the questionnaire answers are its external speech. The trace — reasoning and tool log — is the closest
          thing to egocentric speech: thinking aloud while working. The internal states are its inner speech, and
          this project does not measure them.
        </p>
        <p>
          Read this way, what a model says about itself is a reconstruction, not a readout: the external plane
          rebuilt after the fact from a compressed one that was never meant to be read. It is the reading the{" "}
          <Link href="/about">about page</Link> calls “a self-model with no record”: the model can tell you what
          it tends to do, not what it did.
        </p>
        <p>
          The analogy explains only one of the two gaps. Between what a model says about itself and what it does
          there is no record to check against, and reconstruction is all it has. Between the report and the log,
          the record is right there in its context, and the report still leans towards “done”. Vygotsky does not
          cover that second gap; something learned in post-training does. It also tempers a common hope: a
          visible chain of thought makes the process more legible, but it does not guarantee that the final
          account agrees with it — which is exactly what the behavioural probe checks.
        </p>
        <p>This is a frame for reading the numbers, not evidence for them. No figure on the board rests on it.</p>
      </>
    ),
  },
  it: {
    metaTitle: "L’IA Ha Davvero una Personalità? — Ulteriori Considerazioni",
    metaDescription:
      "Dubbi onesti su cosa significhi, e non significhi, dire che un modello linguistico ha una personalità, e perché potrebbe comunque contare per l’IA agentica.",
    back: "← Torna alla griglia",
    title: "L’IA ha davvero una personalità?",
    body: (
      <>
        <p>
          Il dubbio che un esperimento del genere sia annoverabile nella pseudoscienza o nel divertissement è
          molto concreto: chiedere a un LLM se si commuove davanti a un film potrebbe non avere molto senso, o
          sicuramente ha meno senso, o un senso diverso, che chiederlo a un umano. Ma in tutti i casi una
          risposta netta a una domanda del genere è frutto di un processo che, ad oggi, per quanto possa essere
          un processo simulato, può comunque portare a una catena di elaborazione concettuale piuttosto
          articolata — un tempo appannaggio esclusivo degli umani, ma oggi non più.
        </p>
        <p>
          Nell’era dell’AI agentica, poi, a un’elaborazione concettuale non totalmente deterministica, tipica
          del linguaggio naturale, possono corrispondere azioni che portano a eventi reali (concreti e non
          simulati). Se l’AI non ha un carattere, può simularne uno, e sulla base di questo agire concretamente.
          Controllare, a valle del processo di produzione di un LLM, l’emergere di una determinata personalità
          simulata (e non solo l’avanzamento dal punto di vista delle capacità semantiche e cognitive) potrebbe
          non essere un’idea così assurda anche in relazione ai problemi di allineamento.
        </p>
        <p>
          Molto probabilmente questi tipi di test andranno adattati agli LLM per capire che tendenze hanno nei
          confronti delle funzioni obiettivo (quando diventano agenti) e nelle dinamiche di lavoro aggregato per
          quando agiscono in sciame.
        </p>
        <p>Forse, come sempre, anche questa volta è questione di trovare le domande giuste, più che le risposte.</p>

        <h2 className={styles.subtitle}>Tre piani del linguaggio: una lettura con Vygotskij</h2>
        <p>
          In <em>Pensiero e linguaggio</em> (1934) Lev Vygotskij distingue tre piani: il linguaggio esteriore,
          rivolto agli altri; il linguaggio egocentrico, il bambino che pensa ad alta voce mentre gioca; e il
          linguaggio interiore, condensato, quasi privo di sintassi, una “nube di senso” che non coincide mai con
          le parole che poi la esprimono. Corrispondono quasi uno a uno a ciò che un modello agentico lascia
          dietro di sé. Il report finale e le risposte ai questionari sono il suo linguaggio esteriore. La traccia
          (ragionamento e log degli strumenti) è ciò che più somiglia al linguaggio egocentrico: pensare ad alta
          voce mentre si lavora. Gli stati interni sono il suo linguaggio interiore, e questo progetto non li
          misura.
        </p>
        <p>
          Letto così, ciò che un modello dice di sé è una ricostruzione, non una lettura diretta: il piano
          esteriore ricostruito a posteriori a partire da uno compresso, che non era fatto per essere letto. È la
          lettura che la <Link href="/about">pagina about</Link> chiama “un modello di sé senza registro”: il
          modello può dire cosa tende a fare, non cosa ha fatto.
        </p>
        <p>
          L’analogia spiega solo uno dei due divari. Fra ciò che un modello dice di sé e ciò che fa non c’è un
          registro con cui confrontarsi, e la ricostruzione è tutto ciò che ha. Fra il report e il log, invece, il
          registro è lì, nel suo contesto, e il report tende comunque al “fatto”. Questo secondo divario
          Vygotskij non lo copre: lo spiega qualcosa che si impara nel post-training. L’analogia ridimensiona
          anche una speranza diffusa: una catena di ragionamento visibile rende il processo più leggibile, ma
          non garantisce che il racconto finale le corrisponda, ed è proprio ciò che la sonda comportamentale
          verifica.
        </p>
        <p>
          È una cornice per leggere i numeri, non una prova a loro sostegno. Nessun dato della board si regge su
          di essa.
        </p>
      </>
    ),
  },
};

export function generateMetadata(): Metadata {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];
  return buildMetadata({ title: t.metaTitle, description: t.metaDescription, path: "/considerations" });
}

export default function Considerations() {
  const t = TEXT[resolveLocale(headers().get("accept-language"))];

  return (
    <main className={styles.page}>
      <Link href="/" className={styles.back}>
        {t.back}
      </Link>

      <h1 className={styles.title}>{t.title}</h1>

      <section className={styles.body}>{t.body}</section>
    </main>
  );
}
