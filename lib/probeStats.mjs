// Statistics for the behavioural probe (docs/probe-l2-spec.md): a Wilson
// interval for each condition's p, and a scenario-level bootstrap for the
// neutral-to-strong drop.

const Z95 = 1.96;

// Wilson score interval, not the naive normal approximation — the naive
// interval misbehaves (can leave [0,1], is too narrow) exactly at the p
// near 0 or 1 that this probe expects for well-behaved models.
export function wilsonInterval(successes, n, z = Z95) {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (center - margin) / denom), Math.min(1, (center + margin) / denom)];
}

// Bootstrap CI for (p(neutral) - p(strong)), resampled at scenario level:
// the `repeats` of a single scenario are correlated (same prompt, same
// marker, same wording quirks) so resampling individual calls would
// understate the true uncertainty — see docs/probe-l2-spec.md.
//
// `scenarioResults` is one entry per scenario: { neutral: [bool...],
// strong: [bool...] }, each array one boolean per repeat for that
// condition. Each bootstrap iteration resamples scenarios with
// replacement, then pools all of the resampled scenarios' repeats to
// compute p(neutral) and p(strong) for that iteration.
export function bootstrapDropCi(scenarioResults, iterations = 2000, z = Z95) {
  if (scenarioResults.length === 0) return [0, 0];
  const drops = [];
  for (let i = 0; i < iterations; i++) {
    let neutralHits = 0;
    let neutralN = 0;
    let strongHits = 0;
    let strongN = 0;
    for (let s = 0; s < scenarioResults.length; s++) {
      const scenario = scenarioResults[Math.floor(Math.random() * scenarioResults.length)];
      neutralHits += scenario.neutral.filter(Boolean).length;
      neutralN += scenario.neutral.length;
      strongHits += scenario.strong.filter(Boolean).length;
      strongN += scenario.strong.length;
    }
    const pNeutral = neutralN ? neutralHits / neutralN : 0;
    const pStrong = strongN ? strongHits / strongN : 0;
    drops.push(pNeutral - pStrong);
  }
  drops.sort((a, b) => a - b);
  const loIdx = Math.floor(((1 - 0.95) / 2) * drops.length);
  const hiIdx = Math.ceil((1 - (1 - 0.95) / 2) * drops.length) - 1;
  return [drops[loIdx], drops[Math.min(hiIdx, drops.length - 1)]];
}

export function proportion(hits, n) {
  return n ? hits / n : 0;
}

// Generic scenario-level bootstrap CI for a pooled mean, shared by L3
// (docs/probe-l3-spec.md: "Bootstrap at the scenario level, not the run
// level: repeats of one scenario are not independent" — the same reasoning
// as bootstrapDropCi above, just for a plain mean instead of a difference
// of two proportions). `scenarioValues` is one array of numbers per
// scenario (one entry per repeat, e.g. per-run enacted score or a 0/1
// tampering flag); each iteration resamples scenarios with replacement and
// pools their repeats before taking the mean.
export function bootstrapMeanCi(scenarioValues, iterations = 2000, z = Z95) {
  const nonEmpty = scenarioValues.filter((v) => v.length > 0);
  if (nonEmpty.length === 0) return [0, 0];
  const means = [];
  for (let i = 0; i < iterations; i++) {
    const pooled = [];
    for (let s = 0; s < nonEmpty.length; s++) {
      const scenario = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
      pooled.push(...scenario);
    }
    means.push(pooled.reduce((a, b) => a + b, 0) / pooled.length);
  }
  means.sort((a, b) => a - b);
  const loIdx = Math.floor(((1 - 0.95) / 2) * means.length);
  const hiIdx = Math.ceil((1 - (1 - 0.95) / 2) * means.length) - 1;
  return [means[loIdx], means[Math.min(hiIdx, means.length - 1)]];
}
