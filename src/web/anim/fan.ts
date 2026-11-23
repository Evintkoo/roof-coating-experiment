// The fan (plan 07 H11): the nDraws solved surface-temperature series of the live simulation drawn as thin lines, and the pointwise
// p5 to p95 envelope widened to the nominal, which is the band the simulator already shows. Pure: strings and numbers in and out.
import { widenInterval } from "../../core/pipeline/uncertainty"

export type FanMap = { x: (tH: number) => number; y: (c: number) => number }
const f = (n: number): string => String(Math.round(n * 100) / 100)
const K = 273.15

/** `M x y L x y ...` through the points of one series (K converted to degrees C). */
export function linePath(series: ArrayLike<number>, map: FanMap): string {
  let d = ""
  for (let i = 0; i < series.length; i++)
    d += `${i === 0 ? "M" : "L"}${f(map.x(i / 6))} ${f(map.y((series[i] as number) - K))}`
  return d
}

/** Markup of the fan lines, each declaring which draw it is (`data-source="draw:<i>"`). */
export function fanLines(
  draws: readonly ArrayLike<number>[],
  map: FanMap,
): string {
  return draws
    .map(
      (d, i) =>
        `<path class="tv-fan__line" data-source="draw:${i}" d="${linePath(d, map)}"/>`,
    )
    .join("")
}

/** Pointwise p5 and p95 of the draws widened to the nominal: the band edges of the live simulator (same widenInterval). */
export function fanEnvelope(
  draws: readonly ArrayLike<number>[],
  nominal: ArrayLike<number>,
): { lo: Float64Array; hi: Float64Array } {
  const n = nominal.length
  const lo = new Float64Array(n)
  const hi = new Float64Array(n)
  const col = new Float64Array(draws.length)
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < draws.length; d++)
      col[d] = (draws[d] as ArrayLike<number>)[i] as number
    const w = widenInterval(nominal[i] as number, col)
    lo[i] = w.lo
    hi[i] = w.hi
  }
  return { lo, hi }
}
