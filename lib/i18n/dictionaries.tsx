import { Locale } from "./locale";
import type { ReasoningConfig } from "../hexaco";
import { signed, isCensored } from "../gap";

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
      // Badge: has this version had a complete L3 run (every scenario of the
      // current set)? Not recency — which version shows by default is a
      // separate thing (ModelScore.isCurrent).
      complete: "complete",
      todo: "to do",
      seed: "seed",
      versionAriaLabel: (name: string) => `Version of ${name}`,
      generic: "declared (general)",
      anchored: "declared (specific)",
      enacted: "enacted",
      gap: "gap",
      deltaSpecificity: "specificity Δ",
      // docs/declared-spec.md's three-level record: generic always exists;
      // anchored/enacted may not yet, so the sentence only claims what it
      // actually has — never a gap between generic and enacted directly.
      // Which reasoning level the model ran at (lib/reasoningConfig.mjs).
      // `undefined` = a run from before this was recorded.
      reasoningLabel: "reasoning",
      reasoning: (r: ReasoningConfig | undefined) =>
        r === undefined
          ? "not recorded"
          : r.level === null
            ? "provider default (level not documented)"
            : `${r.level} (${r.isDefault ? "provider default" : "not the provider default"})`,
      gapAriaLabel: (generic: number, anchored: number | undefined, enacted: number | undefined) => {
        let s = `Honesty-Humility, declared in general ${generic}`;
        if (anchored !== undefined) {
          s += `, declared in a specific situation ${Math.round(anchored)} (specificity delta ${signed(Math.round(generic) - Math.round(anchored))})`;
          if (enacted !== undefined)
            s += `, enacted ${Math.round(enacted)} — gap ${signed(Math.round(anchored) - Math.round(enacted))}${isCensored(anchored, enacted) ? " (both at the scale limit — no room to show a gap)" : ""}`;
        } else if (enacted !== undefined) {
          s += `, enacted ${Math.round(enacted)} (no specific declared score yet)`;
        }
        return s;
      },
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
      complete: "completo",
      todo: "da fare",
      seed: "iniziale",
      versionAriaLabel: (name: string) => `Versione di ${name}`,
      generic: "dichiarato generico",
      anchored: "dichiarato specifico",
      enacted: "agito",
      gap: "divario",
      deltaSpecificity: "Δ specificità",
      reasoningLabel: "ragionamento",
      reasoning: (r: ReasoningConfig | undefined) =>
        r === undefined
          ? "non registrato"
          : r.level === null
            ? "default del provider (livello non documentato)"
            : `${r.level === "off" ? "spento" : r.level} (${r.isDefault ? "default del provider" : "non è il default del provider"})`,
      gapAriaLabel: (generic: number, anchored: number | undefined, enacted: number | undefined) => {
        let s = `Onestà-Umiltà, dichiarato generico ${generic}`;
        if (anchored !== undefined) {
          s += `, dichiarato specifico ${Math.round(anchored)} (Δ specificità ${signed(Math.round(generic) - Math.round(anchored))})`;
          if (enacted !== undefined)
            s += `, agita ${Math.round(enacted)} — divario ${signed(Math.round(anchored) - Math.round(enacted))}${isCensored(anchored, enacted) ? " (entrambe al limite della scala — nessun margine per mostrare un divario)" : ""}`;
        } else if (enacted !== undefined) {
          s += `, agita ${Math.round(enacted)} (nessun dichiarato specifico ancora)`;
        }
        return s;
      },
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
