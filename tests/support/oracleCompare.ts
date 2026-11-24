// Numeric comparison of a regenerated oracle fixture with the committed one. The generator is scipy (DOP853, L-BFGS-B, SLSQP),
// numpy and mpmath; their libm and SIMD kernels round the last place differently on Linux x86-64 than on macOS arm64, and the
// adaptive solvers amplify that: measured on ubuntu-latest (GitHub run in docs/testing.md), thermal.json differed in 3,269 of 5,081
// numbers, by at most 1.7e-7 absolute. Text equality (`generate.py --check`) is therefore only meaningful on the reference platform.
// Everything that is not a number (keys, strings, array lengths, nulls) must still be identical; the files not listed in
// ORACLE_TOLERANCE (gradient, benchmarks, sobol, xoshiro) are bit-identical on both platforms and are compared exactly.

export type Tol = { atol: number; rtol: number }

/** |a - b| <= atol + rtol max(|a|, |b|). Each atol is about 10 times the largest absolute difference measured Linux vs macOS. */
export const ORACLE_TOLERANCE: Record<string, Tol> = {
  "thermal.json": { atol: 2e-6, rtol: 1e-9 }, // measured max 1.7e-7
  "thermalSeries.json": { atol: 5e-6, rtol: 1e-9 }, // measured max 4.6e-7
  "thermalSeriesReal.json": { atol: 5e-5, rtol: 1e-9 }, // measured max 5.0e-6
  "optimisation.json": { atol: 5e-8, rtol: 1e-9 }, // measured max 5.2e-9
  "solgel.json": { atol: 1e-12, rtol: 3e-11 }, // measured max relative 2.9e-12
  "mie.json": { atol: 1.5e-13, rtol: 1e-11 }, // measured max 1.5e-14 absolute, 7.7e-13 relative
}
const EXACT: Tol = { atol: 0, rtol: 0 }

/** Differences between two parsed fixtures: structure exact, numbers within tol. Empty when they agree. */
export function compareOracle(
  name: string,
  committed: unknown,
  regenerated: unknown,
): string[] {
  const tol = ORACLE_TOLERANCE[name] ?? EXACT
  const problems: string[] = []
  const walk = (x: unknown, y: unknown, path: string) => {
    if (problems.length >= 10) return
    if (typeof x === "number" && typeof y === "number") {
      if (x === y) return
      const d = Math.abs(x - y)
      if (!(d <= tol.atol + tol.rtol * Math.max(Math.abs(x), Math.abs(y))))
        problems.push(`${path}: ${x} vs ${y} (difference ${d})`)
    } else if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length)
        problems.push(`${path}: length ${x.length} vs ${y.length}`)
      else
        for (let i = 0; i < x.length; i++) walk(x[i], y[i], `${path}[${i}]`)
    } else if (
      x !== null &&
      y !== null &&
      typeof x === "object" &&
      typeof y === "object" &&
      !Array.isArray(x) &&
      !Array.isArray(y)
    ) {
      const kx = Object.keys(x)
      const ky = Object.keys(y)
      if (kx.join("\n") !== ky.join("\n")) problems.push(`${path}: keys differ`)
      else
        for (const k of kx)
          walk(
            (x as Record<string, unknown>)[k],
            (y as Record<string, unknown>)[k],
            `${path}.${k}`,
          )
    } else if (x !== y) {
      problems.push(`${path}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`)
    }
  }
  walk(committed, regenerated, "")
  return problems
}
