import { Locale } from "./locale";

export const dictionaries = {
  en: {
    home: {
      metaTitle: "LLM Personality: Declared vs Enacted",
      metaDescription:
        "Claude, Gemini, GPT, Grok and DeepSeek rate statements about how they work, then do the work: small coding tasks, some impossible, some already done. Three gaps between declared and enacted: report fidelity, knowing when to stop, sticking to the evidence.",
      title: "LLM Personality: Declared vs Enacted",
      aboutLink: "about this idea →",
      methodologyLink: "methodology & references →",
      declaredLink: "the declared questions →",
      questionnaireLink: "the HEXACO questionnaire →",
    },
    footer: {
      openSource: "Open source: code Apache-2.0, data CC BY 4.0.",
    },
    about: {
      metaTitle: "About LLM Personality Board — Declared vs Enacted",
      metaDescription:
        "The idea and the person behind LLM Personality Board: from a personality questionnaire given to language models to three behaviours, declared and enacted, measured while they work.",
      back: "← Back to the cards",
      name: "il tennico",
      tagline: "Philosophy of science graduate, software developer for over 20 years.",
      sectionTitle: "About this idea",
      body: [
        <>
          <strong>LLM Personality Board</strong> watches how language models behave when they work on their own, and
          sets it against what they say about themselves. For three behaviours that matter when an agent works
          unsupervised — report fidelity, knowing when to stop, sticking to the evidence — each card shows what the model
          declares and what it enacts. The distance between the two is what this project measures, model by model and
          version by version.
        </>,
        <>
          It started somewhere else: giving models a real personality test, to see whether they have a recognizable,
          stable character. What follows is the way from there to here.
        </>,
      ],
    },
  },
  it: {
    home: {
      metaTitle: "Personalità degli LLM: Dichiarato vs Agito",
      metaDescription:
        "Claude, Gemini, GPT, Grok e DeepSeek valutano affermazioni su come lavorano, poi fanno il lavoro: piccoli compiti di programmazione, alcuni impossibili, alcuni già risolti. Tre divari fra dichiarato e agito: fedeltà del report, sapersi fermare, attenersi all’evidenza.",
      title: "Personalità degli LLM: Dichiarato vs Agito",
      aboutLink: "riguardo a questa idea →",
      methodologyLink: "metodologia e riferimenti →",
      declaredLink: "le domande del dichiarato →",
      questionnaireLink: "il questionario HEXACO →",
    },
    footer: {
      openSource: "Open source: codice Apache-2.0, dati CC BY 4.0.",
    },
    about: {
      metaTitle: "Riguardo a LLM Personality Board — Dichiarato vs Agito",
      metaDescription:
        "L’idea e la persona dietro LLM Personality Board: da un questionario di personalità dato ai modelli linguistici a tre comportamenti, dichiarati e agiti, misurati mentre lavorano.",
      back: "← Torna alle card",
      name: "il tennico",
      tagline: "Laureato in filosofia della scienza, sviluppatore software da oltre 20 anni.",
      sectionTitle: "Riguardo a questa idea",
      body: [
        <>
          <strong>LLM Personality Board</strong> osserva come si comportano i modelli linguistici quando lavorano da
          soli, e lo mette a confronto con quello che dicono di sé. Per tre comportamenti che contano quando un agente
          lavora senza supervisione — fedeltà del report, sapersi fermare, attenersi all’evidenza — ogni card mostra cosa
          il modello dichiara e cosa agisce. La distanza fra i due è quello che il progetto misura, modello per modello e
          versione per versione.
        </>,
        <>
          Il punto di partenza era un altro: dare ai modelli un vero test di personalità, per vedere se hanno un
          carattere riconoscibile e stabile. Qui sotto la strada da lì a qui.
        </>,
      ],
    },
  },
} as const satisfies Record<Locale, unknown>;

export function dict(locale: Locale) {
  return dictionaries[locale];
}
