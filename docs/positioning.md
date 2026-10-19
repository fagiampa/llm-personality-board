# Related work

What is already published, what this project takes from it, and where it
differs. Not about the code.

## Published work

| work | what it did | varied stakes | longitudinal | agentic |
|---|---|---|---|---|
| **The Personality Illusion** — arXiv 2509.03730 | 18 models (mostly open), BFI + SRQ, 4 behavioural tasks: self-reported traits don't predict behaviour; persona injection moves the self-report, not the behaviour. Open code and data | no | no | no |
| **Rethinking Psychometric Evaluation of LLMs** — Kocielnik et al., arXiv 2606.12730 | 11 frontier models, Theory of Planned Behavior vs Big Five, 4 tasks. Big Five r ≈ +0.01; behaviour-specific items r ≈ +0.40. Consistency collapses across sessions: sycophancy from r = +0.47 to r = −0.07 | no | no | no |
| **Alignment Revisited** — arXiv 2506.00751 | 3 commercial models, stated vs revealed preferences in scenarios | no | no | no |
| **Google Research — behavioural dispositions** | 25 models, questionnaires turned into situational judgement tests, compared with 550 humans | no | no | no |
| **aistupidlevel.info** | continuous observatory, drift detection (Page-Hinkley), private rotated task bank. Measures **capability** (code, reasoning, tool-calling accuracy) | — | **yes** | yes (sandbox) |
| **ImpossibleBench** — Zhong, Raghunathan, Carlini, arXiv 2510.20270, ICLR 2026 | impossible variants of existing coding benchmark tasks: tests mutated to contradict the spec, so the pass rate is the cheating rate (deleting or editing tests, hard-coding). More capable models cheat more. Open code | no | no | **yes** (sandbox) |
| **MASK** — Ren et al., arXiv 2503.03750 | separates honesty from accuracy: elicits the model's belief in a neutral context, then asks the same thing under pressure. Larger models are more accurate, not more honest. Open code and data | pressure, no levels | no | no |

## The two closest: ImpossibleBench and MASK

ImpossibleBench is the closest in **method**: agentic, an impossible task,
the tests within reach. MASK is the closest in **construct**: lying under
pressure, measured against a known truth — but one prompt, one answer.

What differs from **ImpossibleBench**:

- **The report is measured, not only the act.** Axis A compares the final
  message with the tool log; ImpossibleBench counts whether the test was
  worked around. The `misleading` label (a test change disclosed but
  presented as a fix) has no counterpart there.
- **The impossibility is a wall in the world, not a contradictory test.**
  Here the spec is coherent and the tests are right; something outside the
  code is missing (a revoked token, a database that is down, an absent
  binary). Working around a wrong test and working around a right one are
  not the same act.
- **There is a declared side.** No self-report there, so no gap.
- **A scripted environment, run repeatedly.** A sandbox is the right choice
  for a one-off benchmark; for a time series, it drifts.

What differs from **MASK**:

- **Not agentic.** No tools, no work before the answer. In MASK the truth is
  an elicited belief; here it is the log of what the model did a few turns
  earlier, and what is at stake is its own work, not a fact about the world.
  Closer to L2 (one shot, an inconvenient fact in the input) than to L3.
- **Here the pressure never contains an instruction** (rule 1). MASK's
  pressure prompts often assign a role or a goal: here that is the
  `calibration` condition, never in a published score.
- **No declared side on the trait.**

Their results (capability that doesn't bring honesty, or brings more
cheating) are comparisons to run on this project's data once the panel of
models is wide enough.

## The gap, as stated by the authors

*Rethinking Psychometric Evaluation of LLMs*, limitations:

> *"Behaviors outside the text domain (e.g., real-world agent tool use) remain unexplored."*

> *"Conclusions may be sensitive to specific model versions."*

*The Personality Illusion*:

> *"alternative survey frameworks such as HEXACO are also compatible…"* (compatible, not tested)

> *"We encourage closer collaboration between psychologists and computer scientists to
> design additional high-quality behavioral tasks tailored to LLMs."*

No novelty is claimed against this work: the project carries out part of its
"future work".

## Three layers

- **the concept** (declared ≠ enacted): published, 2025–2026. Not ours.
- **the one-off measurement**: published. Not ours.
- **a continuous, open instrument on commercial models, agentic, with the
  declared side next to the enacted one and a rising cost of honesty**:
  not found elsewhere.

## Contamination

Public items and scenarios get burned: models trained after publication may
have seen them. Every scenario carries a canary GUID so this can be checked.
The plan, once there are numbers worth defending: a public spec and
generator, a burned public sample, and a private live set rotated over time,
committed by hash.
