// Task list and ordered merge for the 96 x 9 screening (plan 07 D4): results are placed by
// task index, never by arrival, so the output cannot depend on worker count or timing.
import { ConfigError } from "../errors"

export type ScreeningTask = {
  readonly index: number
  readonly candidate: number
  readonly scenario: number
}

/** Row-major: index = candidate * nScenarios + scenario. */
export function screeningTasks(
  nCandidates: number,
  nScenarios: number,
): ScreeningTask[] {
  for (const n of [nCandidates, nScenarios])
    if (!Number.isInteger(n) || n < 0)
      throw new ConfigError("screening", "sizes must be non-negative integers")
  const out: ScreeningTask[] = []
  for (let c = 0; c < nCandidates; c++)
    for (let s = 0; s < nScenarios; s++)
      out.push({ index: c * nScenarios + s, candidate: c, scenario: s })
  return out
}

/** Place each part at its index; throws on an out-of-range, missing or duplicate index. */
export function mergeOrdered<T>(
  parts: readonly { index: number; value: T }[],
  n: number,
): T[] {
  const out = new Array<T>(n)
  const seen = new Uint8Array(n)
  for (const p of parts) {
    if (!Number.isInteger(p.index) || p.index < 0 || p.index >= n)
      throw new ConfigError("merge", `index ${p.index} outside 0..${n - 1}`)
    if (seen[p.index] === 1)
      throw new ConfigError("merge", `duplicate index ${p.index}`)
    seen[p.index] = 1
    out[p.index] = p.value
  }
  for (let i = 0; i < n; i++)
    if (seen[i] !== 1) throw new ConfigError("merge", `missing index ${i}`)
  return out
}
