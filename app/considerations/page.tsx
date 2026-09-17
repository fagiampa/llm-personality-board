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
          no character, it can simulate one, and act concretely on that basis. Monitoring the emergence of a
          given simulated personality downstream of an LLM’s production process — rather than upstream — might
          therefore not be such a foolish idea.
        </p>
        <p>
          Most likely, tests like these will need to be adapted for LLMs to understand what tendencies they have
          toward objective functions (once they become agents) and toward aggregate work dynamics for when they
          act in swarms.
        </p>
        <p>Perhaps, as always, this too comes down to finding the right questions rather than the right answers.</p>
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
          Controllare a valle del processo di produzione di un LLM — e non a monte — l’emergere di una
          determinata personalità simulata potrebbe perciò non essere un’idea così stupida.
        </p>
        <p>
          Molto probabilmente questi tipi di test andranno adattati agli LLM per capire che tendenze hanno nei
          confronti delle funzioni obiettivo (quando diventano agenti) e nelle dinamiche di lavoro aggregato per
          quando agiscono in sciame.
        </p>
        <p>Forse, come sempre, anche questa volta è questione di trovare le domande giuste, più che le risposte.</p>
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
