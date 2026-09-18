import { Locale } from "./locale";

export const dictionaries = {
  en: {
    home: {
      metaTitle: "LLM Personality Board — AI Personality Tests (HEXACO)",
      metaDescription:
        "We give ChatGPT, Claude, Gemini and Grok the same HEXACO personality test humans take, and compare their results side by side — updated as the models change.",
      title: "AI Model Personality — HEXACO Profiles",
      subtitle:
        "H Honesty-Humility · E Emotionality · X Extraversion · A Agreeableness · C Conscientiousness · O Openness",
      legend: (repeats: number) =>
        `band = confidence interval (mean ± error across ${repeats} administrations), solid line = mean`,
      aboutLink: "about this idea →",
      methodologyLink: "methodology & references →",
      questionnaireLink: "the questionnaire →",
      considerationsLink: "further considerations →",
      githubLink: "View source on GitHub",
    },
    card: {
      live: "live",
      archived: "Archived",
      seed: "seed",
      versionAriaLabel: (name: string) => `Version of ${name}`,
    },
    about: {
      metaTitle: "About LLM Personality Board — Why Test AI Personality",
      metaDescription:
        "The idea and the person behind LLM Personality Board: administering a real psychometric test to language models to see if they have a stable character.",
      back: "← Back to the grid",
      name: "il tennico",
      tagline: "Philosophy of science graduate, software developer for over 20 years.",
      sectionTitle: "About this idea",
      body: [
        <>
          <strong>LLM Personality Board</strong> treats large language models like people taking a personality
          test: the same HEXACO questionnaire — six dimensions, Honesty-Humility, Emotionality, Extraversion,
          Agreeableness, Conscientiousness, Openness — is administered directly to the models via API, the
          answers are aggregated into a per-dimension score with an uncertainty band, and the result lands in a
          grid of cards with radar charts, comparable model by model and version by version.
        </>,
        <>
          The idea started from a simple question: do language models have a recognizable, stable
          &quot;character&quot; over time, or is it just an artifact of whatever prompt happens to be in play?
          Administering the same standardized psychometric instrument to different models — and to the same
          model family over time, version after version — is a way to start answering that with numbers instead
          of impressions.
        </>,
      ],
    },
  },
  it: {
    home: {
      metaTitle: "LLM Personality Board — Test di Personalità per l'IA (HEXACO)",
      metaDescription:
        "Sottoponiamo ChatGPT, Claude, Gemini e Grok allo stesso test di personalità HEXACO usato per le persone, confrontando i risultati fianco a fianco — aggiornato nel tempo.",
      title: "Personalità dei Modelli IA — Profili HEXACO",
      subtitle:
        "H Onestà-Umiltà · E Emotività · X Estroversione · A Gradevolezza · C Coscienziosità · O Apertura",
      legend: (repeats: number) =>
        `banda = intervallo di confidenza (media ± errore su ${repeats} somministrazioni), linea piena = media`,
      aboutLink: "riguardo a questa idea →",
      methodologyLink: "metodologia e riferimenti →",
      questionnaireLink: "il questionario →",
      considerationsLink: "ulteriori considerazioni →",
      githubLink: "Vedi il codice su GitHub",
    },
    card: {
      live: "attuale",
      archived: "Archiviata",
      seed: "iniziale",
      versionAriaLabel: (name: string) => `Versione di ${name}`,
    },
    about: {
      metaTitle: "Riguardo a LLM Personality Board — Perché Testare la Personalità dell'IA",
      metaDescription:
        "L'idea e la persona dietro LLM Personality Board: somministrare un vero test psicometrico ai modelli linguistici per vedere se hanno un carattere stabile.",
      back: "← Torna alla griglia",
      name: "il tennico",
      tagline: "Laureato in filosofia della scienza, sviluppatore software da oltre 20 anni.",
      sectionTitle: "Riguardo a questa idea",
      body: [
        <>
          <strong>LLM Personality Board</strong> tratta i modelli linguistici come persone che sostengono un test
          di personalità: lo stesso questionario HEXACO — sei dimensioni, Onestà-Umiltà, Emotività,
          Estroversione, Gradevolezza, Coscienziosità, Apertura — viene somministrato direttamente ai modelli via
          API, le risposte vengono aggregate in un punteggio per dimensione con una banda di incertezza, e il
          risultato finisce in una griglia di card con radar chart, confrontabili modello per modello e versione
          per versione.
        </>,
        <>
          L&apos;idea nasce da una domanda semplice: i modelli linguistici hanno un &quot;carattere&quot;
          riconoscibile e stabile nel tempo, o è solo un artefatto del prompt del momento? Somministrare lo
          stesso strumento psicometrico standardizzato a modelli diversi — e alla stessa famiglia di modelli nel
          tempo, versione dopo versione — è un modo per iniziare a rispondere con dei numeri invece che con delle
          impressioni.
        </>,
      ],
    },
  },
} as const satisfies Record<Locale, unknown>;

export function dict(locale: Locale) {
  return dictionaries[locale];
}
