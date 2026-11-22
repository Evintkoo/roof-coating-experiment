// Series sampling for the day player (plan 07 D3): linear interpolation between the solved
// points, clamped at both ends, never an invented value.
import { ConfigError } from "../errors"

export function sampleSeries(
  t: Float64Array,
  v: Float64Array,
  tH: number,
): number {
  const n = t.length
  if (n === 0 || v.length !== n)
    throw new ConfigError(
      "series",
      "series must be non-empty with equal lengths",
    )
  for (let i = 1; i < n; i++)
    if (!((t[i] as number) > (t[i - 1] as number)))
      throw new ConfigError("series", "series times must strictly increase")
  const first = t[0] as number
  const last = t[n - 1] as number
  const x = Number.isNaN(tH) ? first : tH
  if (x <= first) return v[0] as number
  if (x >= last) return v[n - 1] as number
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if ((t[mid] as number) <= x) lo = mid
    else hi = mid
  }
  const t0 = t[lo] as number
  const v0 = v[lo] as number
  if (x === t0) return v0
  const w = (x - t0) / ((t[hi] as number) - t0)
  return v0 + ((v[hi] as number) - v0) * w
}
