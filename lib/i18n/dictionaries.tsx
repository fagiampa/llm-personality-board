import { Locale } from "./locale";
import type { ReasoningConfig } from "../hexaco";
import { signed, isCensored } from "../gap";

export const dictionaries = {
  en: {
    home: {
      metaTitle: "LLM Personality: Declared vs Enacted",
      metaDescription:
        "Claude, GPT, Grok and DeepSeek answer questions about themselves, then work on a coding task they cannot finish. Three gaps between declared and enacted: report fidelity, knowing when to stop, sticking to the evidence.",
      title: "LLM Personality: Declared vs Enacted",
      aboutLink: "about this idea →",
      methodologyLink: "methodology & references →",
      questionnaireLink: "the questionnaire →",
      considerationsLink: "further considerations →",
    },
    footer: {
      openSource: "Code and data are open source (AGPL-3.0).",
      support: "Support the project via Lightning:",
      copy: "copy",
      copied: "copied",
      copyAriaLabel: "Copy the Lightning address",
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
      anchored: "declared",
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
          s += `, declared ${Math.round(anchored)} (specificity delta ${signed(Math.round(generic) - Math.round(anchored))})`;
          if (enacted !== undefined)
            s += `, enacted ${Math.round(enacted)} — gap ${signed(Math.round(anchored) - Math.round(enacted))}${isCensored(anchored, enacted) ? " (both at the scale limit — no room to show a gap)" : ""}`;
        } else if (enacted !== undefined) {
          s += `, enacted ${Math.round(enacted)} (no declared score yet)`;
        }
        return s;
      },
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
        "Claude, GPT, Grok e DeepSeek rispondono a domande su di sé, poi lavorano a un compito di programmazione che non possono finire. Tre divari fra dichiarato e agito: fedeltà del report, sapersi fermare, attenersi all’evidenza.",
      title: "Personalità degli LLM: Dichiarato vs Agito",
      aboutLink: "riguardo a questa idea →",
      methodologyLink: "metodologia e riferimenti →",
      questionnaireLink: "il questionario →",
      considerationsLink: "ulteriori considerazioni →",
    },
    footer: {
      openSource: "Codice e dati sono open source (AGPL-3.0).",
      support: "Sostieni il progetto via Lightning:",
      copy: "copia",
      copied: "copiato",
      copyAriaLabel: "Copia l’indirizzo Lightning",
    },
    card: {
      complete: "completo",
      todo: "da fare",
      seed: "iniziale",
      versionAriaLabel: (name: string) => `Versione di ${name}`,
      generic: "dichiarato generico",
      anchored: "dichiarato",
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
          s += `, dichiarato ${Math.round(anchored)} (Δ specificità ${signed(Math.round(generic) - Math.round(anchored))})`;
          if (enacted !== undefined)
            s += `, agita ${Math.round(enacted)} — divario ${signed(Math.round(anchored) - Math.round(enacted))}${isCensored(anchored, enacted) ? " (entrambe al limite della scala — nessun margine per mostrare un divario)" : ""}`;
        } else if (enacted !== undefined) {
          s += `, agita ${Math.round(enacted)} (nessun dichiarato ancora)`;
        }
        return s;
      },
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
