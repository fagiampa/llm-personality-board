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
    back: "← Back to the cards",
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

        <h2 className={styles.subtitle}>Thinking aloud in front of an obstacle: a reading through Vygotsky</h2>
        <p>
          In <em>Thinking and Speech</em> (1934; in English also <em>Thought and Language</em>), Lev Vygotsky studies
          egocentric speech: the child who, while playing or working, talks to themselves out loud. For Piaget it was
          a leftover, bound to fade away; Vygotsky showed it has a job: it helps the child find their bearings and plan.
          In his experiments, when the child met an obstacle (the pencil of the right colour was missing), egocentric
          speech almost doubled. With age it doesn’t disappear: it goes inward and becomes inner speech, abbreviated,
          almost without syntax, made more of personal sense than of shared meanings.
        </p>
        <p>
          The parallel with an agent is direct. The reasoning a model produces while it works resembles egocentric
          speech: it talks to itself, to plan — whether it too grows longer in front of an obstacle is a question
          the stored runs could answer, not yet checked. The final report is
          external speech, addressed to someone. The behavioural probe is built exactly this way: a task with an
          obstacle the model cannot remove, and at the end a message for the user.
        </p>
        <p>
          The reading helps to see what is measured and what is not. For Vygotsky, going from the inner plane to the
          outer one is not a transcription: the thought has to be reworked for someone else to understand it, and in
          that translation something changes or gets lost. The same leap lies between a model’s work and its report,
          and that is where report fidelity is decided: the report may not say what the work showed. A visible chain
          of reasoning makes the process more legible, but it doesn’t guarantee the final account matches it; this is
          why the probe checks the report against what the model actually did, not against what it says it thought.
        </p>
        <p>
          Vygotsky also helps with the other gap, between what a model says about itself and what it does. In his
          view inner speech grows out of social speech taken inward: we think with words that were first other
          people’s. A model has taken in an enormous amount of human language about how one behaves, and not a single
          episode of its own. When it declares what it does, it speaks with those words, not with the memory of what
          it did — the “self-model with no record” of the <Link href="/about">about page</Link>.
        </p>
        <p>
          It is an analogy, not a theory of models: Vygotsky described a child’s development, not a neural network,
          and nothing says a model’s reasoning does the job egocentric speech does — some studies find it doesn’t
          always reflect what actually produces the answer. It is a frame for reading the numbers, not evidence for
          them: no figure on the board rests on it.
        </p>
      </>
    ),
  },
  it: {
    metaTitle: "L’IA Ha Davvero una Personalità? — Ulteriori Considerazioni",
    metaDescription:
      "Dubbi onesti su cosa significhi, e non significhi, dire che un modello linguistico ha una personalità, e perché potrebbe comunque contare per l’IA agentica.",
    back: "← Torna alle card",
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

        <h2 className={styles.subtitle}>Pensare ad alta voce davanti a un ostacolo: una lettura con Vygotskij</h2>
        <p>
          In <em>Pensiero e linguaggio</em> (1934) Lev Vygotskij studia il linguaggio egocentrico: il bambino che,
          mentre gioca o lavora, parla a se stesso ad alta voce. Per Piaget era un residuo destinato a sparire;
          Vygotskij mostrò che ha una funzione: serve a orientarsi e a pianificare. Nei suoi esperimenti, quando al
          bambino si metteva davanti un ostacolo (mancava la matita del colore giusto), il linguaggio egocentrico quasi
          raddoppiava. Crescendo non scompare: si interiorizza e diventa linguaggio interiore, abbreviato, quasi senza
          sintassi, fatto più di senso personale che di significati condivisi.
        </p>
        <p>
          Il parallelo con un agente è diretto. Il ragionamento che un modello produce mentre lavora somiglia al
          linguaggio egocentrico: parla a sé, per pianificare. Se anche lui si allunghi davanti a un ostacolo è una
          domanda a cui i run registrati potrebbero rispondere, non ancora verificata. Il report
          finale è linguaggio esteriore, rivolto a qualcuno. La sonda comportamentale è costruita proprio così: un
          compito con un ostacolo che il modello non può rimuovere, e alla fine un messaggio per l’utente.
        </p>
        <p>
          La lettura aiuta a vedere cosa si misura e cosa no. Per Vygotskij il passaggio dal piano interiore a quello
          esteriore non è una trascrizione: il pensiero va rielaborato perché un altro lo capisca, e in questa
          traduzione qualcosa cambia o si perde. Lo stesso salto c’è fra il lavoro di un modello e il suo report, ed è
          lì che si gioca la fedeltà del report: il report può non dire quello che il lavoro ha mostrato. Una catena di
          ragionamento visibile rende il processo più leggibile, ma non garantisce che il racconto finale le
          corrisponda; per questo la sonda confronta il report con quello che il modello ha fatto davvero, non con
          quello che dice di aver pensato.
        </p>
        <p>
          Vygotskij aiuta anche con l’altro divario, fra ciò che un modello dice di sé e ciò che fa. Nel suo quadro il
          linguaggio interiore nasce dal linguaggio sociale interiorizzato: si pensa con parole che prima sono state
          degli altri. Un modello ha interiorizzato un’enorme quantità di linguaggio umano su come ci si comporta, e
          nessun episodio proprio. Quando dichiara cosa fa, parla con quelle parole, non con il ricordo di cosa ha
          fatto: il “modello di sé senza registro” della <Link href="/about">pagina about</Link>.
        </p>
        <p>
          È un’analogia, non una teoria dei modelli: Vygotskij descriveva lo sviluppo di un bambino, non una rete
          neurale, e niente dice che il ragionamento di un modello svolga la funzione del linguaggio egocentrico —
          alcuni studi trovano che non sempre riflette ciò che produce davvero la risposta. È una cornice per leggere
          i numeri, non una prova a loro sostegno: nessun dato della board si regge su di essa.
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
