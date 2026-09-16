import { Locale } from "./locale";

export const dictionaries = {
  en: {
    home: {
      metaTitle: "LLM Personality Board",
      metaDescription: "A grid of cards showing each LLM's HEXACO personality profile.",
      title: "Model Personality — HEXACO Profile",
      subtitle:
        "H Honesty-Humility · E Emotionality · X Extraversion · A Agreeableness · C Conscientiousness · O Openness",
      legend: "band = confidence interval (mean ± error across N administrations), solid line = mean",
      aboutLink: "about this idea →",
      methodologyLink: "methodology & references →",
      considerationsLink: "further considerations →",
    },
    card: {
      live: "live",
      archived: "Archived",
      seed: "seed",
      versionAriaLabel: (name: string) => `Version of ${name}`,
    },
    about: {
      metaTitle: "About this idea — LLM Personality Board",
      metaDescription: "The author and the idea behind LLM Personality Board.",
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
      metaTitle: "LLM Personality Board",
      metaDescription: "Una griglia di card che mostra il profilo di personalità HEXACO di ogni LLM.",
      title: "Personalità dei modelli — Profilo HEXACO",
      subtitle:
        "H Onestà-Umiltà · E Emotività · X Estroversione · A Gradevolezza · C Coscienziosità · O Apertura",
      legend: "banda = intervallo di confidenza (media ± errore su N somministrazioni), linea piena = media",
      aboutLink: "riguardo a questa idea →",
      methodologyLink: "metodologia e riferimenti →",
      considerationsLink: "ulteriori considerazioni →",
    },
    card: {
      live: "attuale",
      archived: "Archiviata",
      seed: "iniziale",
      versionAriaLabel: (name: string) => `Versione di ${name}`,
    },
    about: {
      metaTitle: "Riguardo a questa idea — LLM Personality Board",
      metaDescription: "L'autore e l'idea dietro LLM Personality Board.",
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
