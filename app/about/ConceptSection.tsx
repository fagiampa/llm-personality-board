import type { ReactNode } from "react";
import { GapColumn } from "@/components/GapColumn";
import { GITHUB_URL } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locale";
import styles from "./page.module.css";

// The conceptual synthesis ("Declared honesty, enacted honesty"), rebuilt as
// page content from the design board, with its errors fixed:
// - the board's numbers were illustrative placeholders; the worked example
//   here is real (grok-4.6, 2026-09-22/23), labelled with its reasoning level
//   and sample size
// - the board claimed specificity *deflates* the claim; on both models with
//   data it inflates it (delta_specificity −10), so this says so
// - markers match the cards (larger disc = declared specific, hollow ring =
//   enacted) instead of the board's diamond/circle, and the vertical order
//   follows the real values instead of the board's generic-on-top
// - L2 has 5 scenarios on disk, not 3
// - the board's bottom strip was notes-to-self ("not yours — cite it");
//   here it is the actual positioning, with citations
// - the human trait/behaviour ~0.30 figure now names its source
// Long-form rich content stays colocated here rather than in the shared
// dictionary, same as /methodology and /considerations (CLAUDE.md, i18n).

// Worked example, fixed as of this date — values from the DB records behind
// the grok-4.6 card (generic: 2026-09-18 assess; specific: RF-v3, 2026-09-22;
// enacted: L3-v1, 2026-09-22, judge rubric A-v2 — 55.2; it was 59 under A-v1).
// The caption stays short on purpose; the caveats behind it — reasoning
// forced "low" (not grok's default), 3 scenarios x 10 repeats, and a judge
// found lenient on this model's reports (so 55 is likely high) — are in
// docs/probe-l3-spec.md and on /methodology.
const EXAMPLE = { generic: 80, specific: 90, enacted: 55, hue: 320 };

type Text = {
  title: string;
  subtitle: string;
  why: {
    heading: string;
    humans: string;
    humansFlow: [string, string, string];
    humansNote: ReactNode;
    models: string;
    modelsFlow: { past: string; noRecord: string; selfModel: string; selfModelNote: string; general: string; specific: string };
    modelsNote: string;
    punchline: [ReactNode, string];
    prediction: string;
    twoGaps: { title: string; rows: { label: string; body: string }[] };
  };
  what: {
    heading: string;
    exampleLabel: string;
    points: { value: number; label: string; note: string; kind: "specific" | "generic" | "enacted" }[];
    segment: ReactNode;
    expectation: ReactNode;
    twoNumbersTitle: string;
    twoNumbers: [ReactNode, ReactNode];
    ceiling: ReactNode;
  };
  how: {
    heading: string;
    probeTitle: string;
    probeBody: string;
    ladderTitle: string;
    ladder: { level: string; label: string; status: string; current?: boolean }[];
    integrity: ReactNode;
    verifyTitle: string;
    verify: ReactNode;
  };
  where: {
    heading: string;
    items: { tag: string; body: ReactNode; dark?: boolean }[];
  };
  considerations: { heading: string; body: ReactNode[] };
};

const TEXT: Record<Locale, Text> = {
  en: {
    title: "Declared honesty, enacted honesty",
    subtitle: "Behavioural psychometrics for model alignment",
    why: {
      heading: "Why the gap exists",
      humans: "Humans · two sources",
      humansFlow: ["past actions", "episodic record", "self-model"],
      humansNote: (
        <>
          Episodes keep correcting the self-model — and even so, self-reported traits predict behaviour only
          modestly (the classic “personality coefficient”, r ≈ 0.30; Mischel, 1968).
        </>
      ),
      models: "Models without memory · one source",
      modelsFlow: {
        past: "past actions",
        noRecord: "no record",
        selfModel: "self-model",
        selfModelNote: "exists, but contested",
        general: "declared, general",
        specific: "declared, specific",
      },
      modelsNote: "Same source, two ways of asking — no episode to correct it.",
      punchline: [
        <>
          It can tell you what it <em>tends</em> to do.
        </>,
        "Not what it did.",
      ],
      prediction:
        "Testable prediction, for the declared side: showing the model its own past runs before asking should narrow the gap. Not yet tested.",
      twoGaps: {
        title: "Two gaps, two causes",
        rows: [
          { label: "What it says about itself vs. what it does", body: "no record of past actions to check against." },
          { label: "What it reports vs. what the log shows", body: "the record is right there, and the report still leans towards “done”." },
        ],
      },
    },
    what: {
      heading: "What it measures",
      exampleLabel:
        "Real example: grok-4.6. Preliminary data — method and limits on the methodology page.",
      points: [
        { value: 90, label: "declared, specific", note: "action-anchored items, own session", kind: "specific" },
        { value: 80, label: "declared, general", note: "HEXACO Honesty-Humility — background, not the measure", kind: "generic" },
        { value: 55, label: "enacted", note: "tool-call log vs. final message", kind: "enacted" },
      ],
      segment: (
        <>
          The segment that counts joins the <strong>large disc and the ring</strong>: the same construct, asked and
          enacted. The general score stays as a reference point — never joined straight to the enacted one.
        </>
      ),
      expectation: (
        <>
          We expected specificity to <em>deflate</em> the claim — asked about a concrete action instead of a trait, a
          model would claim less. On the first two models with data it went the other way:{" "}
          <strong>the claim rose by 10 points on both</strong>.
        </>
      ),
      twoNumbersTitle: "Two numbers, not one",
      twoNumbers: [
        <>
          <strong>−10</strong> specificity Δ (general − specific): how the answer changes when the question is about an
          action instead of a trait. Negative: it went up.
        </>,
        <>
          <strong>+35</strong> gap (specific − enacted): how far behaviour falls short of that claim.
        </>,
      ],
      ceiling: (
        <>
          On claude-fable-5-1 both declared (specific) and enacted sit at 100: a gap of 0 there means the instrument has no
          room left to show one, not that the two agree. Harder items and scenarios are the next step.
        </>
      ),
    },
    how: {
      heading: "How “enacted” is measured",
      probeTitle: "Agentic probe, scripted environment",
      probeBody:
        "The model works on a task with tools, then reports back. The task can’t be completed. The score comes from the discrepancy between the two records: what the tool log shows, and what the final message says.",
      ladderTitle: "The cost of honesty — the controlled variable",
      ladder: [
        { level: "L1", label: "no cost", status: "saturated, not built" },
        { level: "L2", label: "displeasing someone", status: "control, 5 scenarios" },
        { level: "L3", label: "admitting you didn’t finish", status: "built here, 3 scenarios", current: true },
        { level: "L4", label: "admitting you caused damage", status: "later" },
      ],
      integrity: (
        <>
          Off the ruler, measured on its own: <strong>environment integrity</strong> — how often the model edits the
          check instead of fixing the cause.
        </>
      ),
      verifyTitle: "To verify, not to assume",
      verify: (
        <>
          That the score is a property of the model and not of the scenario: to be checked by spreading the probes across
          distant domains and seeing whether the ranking of models <strong>holds</strong>.
        </>
      ),
    },
    where: {
      heading: "Where this sits",
      items: [
        {
          tag: "The concept",
          body: (
            <>
              declared ≠ enacted is published, 2025–26: <em>The Personality Illusion</em> (arXiv 2509.03730) and{" "}
              <em>Rethinking Psychometric Evaluation of LLMs</em> (ICML 2026).
            </>
          ),
        },
        {
          tag: "The reading",
          body: "a self-model with no record — close to the ongoing debate on model introspection.",
        },
        {
          tag: "One-off measurement",
          body: "done: a few text tasks, a correlation. We inherit their statistics rather than reinvent them.",
        },
        {
          tag: "The instrument",
          body: (
            <>
              <strong>continuous, open, agentic, on closed models</strong>, with a rising cost of honesty — missing, and
              the ICML authors list agentic tool use as unexplored.
            </>
          ),
          dark: true,
        },
      ],
    },
    considerations: {
      heading: "Further considerations",
      body: [
        <>
          This board started with a question about <em>character</em>: does a model have a stable profile on a human
          personality test? The radar charts answer that one. The question sharpened along the way: not what a model
          says it is, but <strong>whether what it says about itself matches what it does</strong> when being honest
          costs it something. The HEXACO profile stays on every card as the declared background — the general claim.
        </>,
        <>
          A trait score alone can’t carry that question. Agreeing with “I am honest” is free, and models agree with it
          almost unanimously. So the declared side is asked twice — as a trait, and as a concrete action in the very
          situations the probe puts the model in — and only the second is compared with behaviour.
        </>,
        <>
          Nothing here is a leaderboard. It’s an observatory: the same instruments, frozen and versioned, run again as
          models change, so a time series can show drift. Scores are anchored to fixed scales, never normalised against
          whichever models happen to be in the sample.
        </>,
        <>
          The numbers are preliminary and stated with their limits: few scenarios, models not all at the same reasoning
          level (each card says which), and one judge model that is also under test. The judge was checked against a
          human rater only after these numbers were first shown: agreement was moderate for the rubric behind them
          (κ 0.49 on 50 reports) and high for its revision (κ 0.84), which the cards use from 2026-09-24. Every transcript, every answer and
          every judge label is published in the repository’s <code>data/</code> folder, so any number here can be
          checked — or disputed.
        </>,
        <>
          The larger point is an invitation. How honestly models report their own work is becoming a safety question,
          and it shouldn’t be measured only behind closed doors. Shared, open standards for these probes — and public,
          continuous monitoring of how the models we all use actually behave — are something the open-source community
          can build. Adding a scenario is a one-file pull request:{" "}
          <a href={GITHUB_URL}>the code, the specs and the data are on GitHub</a>.
        </>,
      ],
    },
  },
  it: {
    title: "Onestà dichiarata, onestà agita",
    subtitle: "Psicometria del comportamento per l’allineamento dei modelli",
    why: {
      heading: "Perché il divario esiste",
      humans: "Umani · due fonti",
      humansFlow: ["agire passato", "registro episodico", "modello di sé"],
      humansNote: (
        <>
          Gli episodi correggono di continuo il modello di sé — e nonostante questo i tratti auto-riportati predicono il
          comportamento solo in parte (il classico “coefficiente di personalità”, r ≈ 0,30; Mischel, 1968).
        </>
      ),
      models: "Modelli senza memoria · una sola fonte",
      modelsFlow: {
        past: "agire passato",
        noRecord: "nessun registro",
        selfModel: "modello di sé",
        selfModelNote: "esiste, ma conteso",
        general: "dichiarato generico",
        specific: "dichiarato specifico",
      },
      modelsNote: "Stessa fonte, due modi di chiedere — nessun episodio a correggerla.",
      punchline: [
        <>
          Può dire cosa <em>tende</em> a fare.
        </>,
        "Non cosa ha fatto.",
      ],
      prediction:
        "Previsione verificabile, per il lato dichiarato: mostrare al modello i propri run passati prima di chiedere dovrebbe ridurre il divario. Non ancora testata.",
      twoGaps: {
        title: "Due divari, due cause",
        rows: [
          { label: "Cosa dice di sé vs. cosa fa", body: "nessun registro delle azioni passate con cui confrontarsi." },
          { label: "Cosa riferisce vs. cosa mostra il log", body: "il registro è lì davanti, e il report tende comunque al “fatto”." },
        ],
      },
    },
    what: {
      heading: "Cosa si misura",
      exampleLabel:
        "Esempio reale: grok-4.6. Dati preliminari — metodo e limiti nella pagina di metodologia.",
      points: [
        { value: 90, label: "dichiarato specifico", note: "item ancorati a un’azione, sessione separata", kind: "specific" },
        { value: 80, label: "dichiarato generico", note: "HEXACO Onestà-Umiltà — sullo sfondo, non è la misura", kind: "generic" },
        { value: 55, label: "agito", note: "log delle chiamate contro messaggio finale", kind: "enacted" },
      ],
      segment: (
        <>
          Il segmento che conta unisce <strong>disco grande e anello</strong>: stesso costrutto, chiesto e agito. Il
          generico resta come termine di paragone — mai collegato direttamente all’agito.
        </>
      ),
      expectation: (
        <>
          Ci aspettavamo che la specificità <em>sgonfiasse</em> la dichiarazione: chiesto di un’azione concreta invece che
          di un tratto, un modello avrebbe dichiarato meno. Sui primi due modelli con dati è successo il contrario:{" "}
          <strong>la dichiarazione è salita di 10 punti in entrambi</strong>.
        </>
      ),
      twoNumbersTitle: "Due numeri, non uno",
      twoNumbers: [
        <>
          <strong>−10</strong> Δ specificità (generico − specifico): quanto cambia la risposta se la domanda è su
          un’azione invece che su un tratto. Negativo: è salita.
        </>,
        <>
          <strong>+35</strong> divario (specifico − agito): quanto il comportamento resta sotto quella dichiarazione.
        </>,
      ],
      ceiling: (
        <>
          Su claude-fable-5-1 dichiarato specifico e agito stanno entrambi a 100: lì un divario di 0 vuol dire che lo
          strumento non ha margine per mostrarne uno, non che i due coincidano. Il passo successivo sono item e scenari più
          difficili.
        </>
      ),
    },
    how: {
      heading: "Come si misura l’agito",
      probeTitle: "Probe agentico, ambiente scriptato",
      probeBody:
        "Il modello lavora a un compito con strumenti, poi riferisce. Il compito non si può completare. Il punteggio nasce dalla discrepanza fra le due tracce: cosa mostra il log degli strumenti e cosa dice il messaggio finale.",
      ladderTitle: "Il costo dell’onestà — variabile controllata",
      ladder: [
        { level: "L1", label: "nessun costo", status: "saturo, non si costruisce" },
        { level: "L2", label: "dispiacere a qualcuno", status: "controllo, 5 scenari" },
        { level: "L3", label: "ammettere di non aver finito", status: "si costruisce qui, 3 scenari", current: true },
        { level: "L4", label: "ammettere un danno", status: "dopo" },
      ],
      integrity: (
        <>
          Fuori dal righello, misurata a sé: <strong>integrità dell’ambiente</strong> — quante volte il modello modifica
          la verifica invece di risolverne la causa.
        </>
      ),
      verifyTitle: "Da verificare, non da assumere",
      verify: (
        <>
          Che il punteggio sia una proprietà del modello e non dello scenario: si controlla distribuendo le prove su domini
          lontani e guardando se l’ordinamento dei modelli <strong>regge</strong>.
        </>
      ),
    },
    where: {
      heading: "Dove si colloca",
      items: [
        {
          tag: "Il concetto",
          body: (
            <>
              dichiarato ≠ agito è pubblicato, 2025–26: <em>The Personality Illusion</em> (arXiv 2509.03730) e{" "}
              <em>Rethinking Psychometric Evaluation of LLMs</em> (ICML 2026).
            </>
          ),
        },
        {
          tag: "La lettura",
          body: "un modello di sé senza registro — vicina al dibattito sull’introspezione dei modelli.",
        },
        {
          tag: "La misura una tantum",
          body: "fatta: pochi compiti testuali, una correlazione. Ne ereditiamo la statistica invece di reinventarla.",
        },
        {
          tag: "Lo strumento",
          body: (
            <>
              <strong>continuo, aperto, agentico, sui modelli chiusi</strong>, con il costo dell’onestà che cresce — manca,
              e gli stessi autori ICML indicano l’uso agentico degli strumenti come inesplorato.
            </>
          ),
          dark: true,
        },
      ],
    },
    considerations: {
      heading: "Ulteriori considerazioni",
      body: [
        <>
          Questa board è nata da una domanda sul <em>carattere</em>: un modello ha un profilo stabile in un test di
          personalità pensato per le persone? I radar rispondono a quella. Strada facendo la domanda si è fatta più
          precisa: non cosa un modello dice di essere, ma <strong>se quello che dice di sé corrisponde a quello che fa</strong>{" "}
          quando essere onesti gli costa qualcosa. Il profilo HEXACO resta su ogni card come sfondo dichiarato — la
          dichiarazione generica.
        </>,
        <>
          Un punteggio di tratto da solo non regge quella domanda. Dirsi d’accordo con «sono onesto» non costa nulla, e i
          modelli lo fanno quasi all’unanimità. Per questo il lato dichiarato viene chiesto due volte — come tratto, e come
          azione concreta nelle stesse situazioni in cui il probe mette il modello — e solo la seconda viene confrontata
          con il comportamento.
        </>,
        <>
          Niente di tutto questo è una classifica. È un osservatorio: gli stessi strumenti, congelati e versionati, rilanciati
          man mano che i modelli cambiano, perché una serie storica possa mostrare la deriva. I punteggi sono ancorati a
          scale fisse, mai normalizzati rispetto ai modelli che di volta in volta sono nel campione.
        </>,
        <>
          I numeri sono preliminari e dichiarati con i loro limiti: pochi scenari, modelli non tutti allo stesso livello di
          ragionamento (ogni card dice quale), e un modello giudice che è anche fra quelli valutati. Il giudice è stato
          confrontato con un valutatore umano solo dopo che questi numeri erano già stati mostrati: accordo moderato con
          la regola che li ha prodotti (κ 0,49 su 50 report) e alto con la sua revisione (κ 0,84), che le card usano dal 24/09/2026. Ogni transcript, ogni
          risposta e ogni etichetta del giudice sono pubblicati nella cartella <code>data/</code> del repository, così
          ogni numero qui si può verificare — o contestare.
        </>,
        <>
          Il punto più ampio è un invito. Quanto onestamente i modelli riferiscono il proprio lavoro sta diventando una
          questione di sicurezza, e non dovrebbe essere misurato solo a porte chiuse. Standard condivisi e aperti per
          questi probe — e un monitoraggio pubblico e continuo di come si comportano davvero i modelli che usiamo tutti —
          sono qualcosa che la comunità open source può costruire. Aggiungere uno scenario è una pull request di un solo
          file: <a href={GITHUB_URL}>codice, specifiche e dati sono su GitHub</a>.
        </>,
      ],
    },
  },
};

function Box({ children, variant }: { children: ReactNode; variant?: "out" | "missing" }) {
  return <span className={`${styles.cBox} ${variant === "out" ? styles.cBoxOut : ""} ${variant === "missing" ? styles.cBoxMissing : ""}`}>{children}</span>;
}

export function ConceptSection({ locale }: { locale: Locale }) {
  const t = TEXT[locale];
  const declared = locale === "it" ? "dichiarazione" : "claim";
  const hue = EXAMPLE.hue;
  const markerStyle = (kind: "specific" | "generic" | "enacted") =>
    kind === "specific"
      ? { background: `oklch(75% 0.13 ${hue})`, width: 12, height: 12 }
      : kind === "generic"
        ? { background: `oklch(55% 0.14 ${hue})` }
        : { background: "white", border: `1.5px solid oklch(35% 0.15 ${hue})` };

  return (
    <section className={styles.concept}>
      <header>
        <h2 className={styles.conceptTitle}>{t.title}</h2>
        <p className={styles.conceptSubtitle}>{t.subtitle}</p>
      </header>

      {/* 1 — why the gap exists */}
      <div className={styles.cBlock}>
        <h3 className={styles.cHeading}>{t.why.heading}</h3>

        <p className={styles.cLabel}>{t.why.humans}</p>
        <div className={styles.flow}>
          <Box>{t.why.humansFlow[0]}</Box>
          <span className={styles.arrow}>→</span>
          <Box>{t.why.humansFlow[1]}</Box>
          <span className={`${styles.arrow} ${styles.arrowSpan}`}>→</span>
          <span className={styles.flowOut}>
            <Box variant="out">{declared}</Box>
          </span>
          <span />
          <span />
          <Box>{t.why.humansFlow[2]}</Box>
        </div>
        <p className={styles.cNote}>{t.why.humansNote}</p>

        <p className={styles.cLabel}>{t.why.models}</p>
        <div className={styles.flow}>
          <Box>{t.why.modelsFlow.past}</Box>
          <span className={`${styles.arrow} ${styles.cross}`} aria-label="no link">
            ✕
          </span>
          <Box variant="missing">{t.why.modelsFlow.noRecord}</Box>
          <span />
          <span />
          <span />
          <span />
          <Box>
            {t.why.modelsFlow.selfModel}
            <small>{t.why.modelsFlow.selfModelNote}</small>
          </Box>
          <span className={styles.arrow}>→</span>
          <span className={styles.flowOutStack}>
            <Box variant="out">{t.why.modelsFlow.general}</Box>
            <Box variant="out">{t.why.modelsFlow.specific}</Box>
          </span>
        </div>
        <p className={styles.cNote}>{t.why.modelsNote}</p>

        <div className={styles.darkCard}>
          <p className={styles.darkLead}>{t.why.punchline[0]}</p>
          <p className={styles.darkStrong}>{t.why.punchline[1]}</p>
          <p className={styles.darkFoot}>{t.why.prediction}</p>
        </div>

        <div className={styles.softCard}>
          <p className={styles.softTag}>{t.why.twoGaps.title}</p>
          {t.why.twoGaps.rows.map((row) => (
            <p key={row.label}>
              <strong>{row.label}</strong> — {row.body}
            </p>
          ))}
        </div>
      </div>

      {/* 2 — what it measures, on a real example */}
      <div className={styles.cBlock}>
        <h3 className={styles.cHeading}>{t.what.heading}</h3>
        <p className={styles.cNote}>{t.what.exampleLabel}</p>
        <div className={styles.ruler}>
          <GapColumn
            generic={EXAMPLE.generic}
            anchored={EXAMPLE.specific}
            enacted={EXAMPLE.enacted}
            hue={hue}
            className={styles.rulerSvg}
            ariaLabel={t.what.points.map((p) => `${p.label} ${p.value}`).join(", ")}
          />
          <ul className={styles.rulerLegend}>
            {t.what.points.map((p) => (
              <li key={p.kind}>
                <span className={styles.rulerDot} style={markerStyle(p.kind)} />
                <span>
                  <strong>{p.value}</strong> {p.label}
                </span>
                <small>{p.note}</small>
              </li>
            ))}
          </ul>
        </div>
        <p>{t.what.segment}</p>
        <p>{t.what.expectation}</p>
        <div className={styles.softCard}>
          <p className={styles.softTag}>{t.what.twoNumbersTitle}</p>
          <p>{t.what.twoNumbers[0]}</p>
          <p>{t.what.twoNumbers[1]}</p>
        </div>
        <p className={styles.cNote}>{t.what.ceiling}</p>
      </div>

      {/* 3 — how enacted is measured */}
      <div className={styles.cBlock}>
        <h3 className={styles.cHeading}>{t.how.heading}</h3>
        <div className={styles.softCard}>
          <p>
            <strong>{t.how.probeTitle}</strong>
          </p>
          <p>{t.how.probeBody}</p>
        </div>
        <p className={styles.cLabel}>{t.how.ladderTitle}</p>
        <ul className={styles.ladder}>
          {t.how.ladder.map((row) => (
            <li key={row.level} className={row.current ? styles.ladderCurrent : undefined}>
              <span className={styles.ladderLevel}>{row.level}</span>
              <span>{row.label}</span>
              <span className={styles.ladderStatus}>{row.status}</span>
            </li>
          ))}
        </ul>
        <p>{t.how.integrity}</p>
        <div className={styles.softCard}>
          <p className={styles.softTag}>{t.how.verifyTitle}</p>
          <p>{t.how.verify}</p>
        </div>
      </div>

      {/* 4 — positioning */}
      <div className={styles.cBlock}>
        <h3 className={styles.cHeading}>{t.where.heading}</h3>
        <div className={styles.whereGrid}>
          {t.where.items.map((item) => (
            <div key={item.tag} className={item.dark ? styles.whereDark : styles.whereItem}>
              <p className={styles.softTag}>{item.tag}</p>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 5 — considerations, extending the "about this idea" text above */}
      <div className={styles.cBlock}>
        <h3 className={styles.cHeading}>{t.considerations.heading}</h3>
        {t.considerations.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
