import { DataError } from "./errors"

export type Spectrum = { wl_um: Float64Array; irradiance_w_m2_um: Float64Array }
export type NKTable = { wl_um: Float64Array; n: Float64Array; k: Float64Array }

const lines = (csv: string): string[] =>
  csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

function num(s: string | undefined, key: string, row: number): number {
  const v = s === undefined || s === "" ? Number.NaN : Number(s)
  if (!Number.isFinite(v)) throw new DataError(key, `row ${row}: not a number`)
  return v
}

function checkIncreasing(wl: number[], key: string): void {
  for (let i = 1; i < wl.length; i++)
    if ((wl[i] as number) <= (wl[i - 1] as number))
      throw new DataError(
        key,
        `wavelength not strictly increasing at row ${i + 1}`,
      )
}

/** Project G173 CSV form: header `wl_um,irradiance_w_m2_um`, wavelengths strictly increasing, irradiance >= 0. */
export function parseG173(csv: string): Spectrum {
  const ls = lines(csv)
  if (ls[0] !== "wl_um,irradiance_w_m2_um")
    throw new DataError("g173", "header must be wl_um,irradiance_w_m2_um")
  const wl: number[] = []
  const e: number[] = []
  for (let i = 1; i < ls.length; i++) {
    const p = (ls[i] as string).split(",")
    if (p.length !== 2)
      throw new DataError("g173", `row ${i + 1}: need 2 columns`)
    const w = num(p[0], "g173", i + 1)
    const v = num(p[1], "g173", i + 1)
    if (w <= 0)
      throw new DataError("g173", `row ${i + 1}: wavelength must be > 0`)
    if (v < 0)
      throw new DataError("g173", `row ${i + 1}: irradiance must be >= 0`)
    wl.push(w)
    e.push(v)
  }
  if (wl.length < 2) throw new DataError("g173", "need at least 2 rows")
  checkIncreasing(wl, "g173")
  return {
    wl_um: Float64Array.from(wl),
    irradiance_w_m2_um: Float64Array.from(e),
  }
}

/** Project n,k CSV form: header `wl_um,n,k`; n > 0, k >= 0, wavelengths strictly increasing. */
export function parseNk(csv: string): NKTable {
  const ls = lines(csv)
  if (ls[0] !== "wl_um,n,k")
    throw new DataError("nk", "header must be wl_um,n,k")
  const wl: number[] = []
  const n: number[] = []
  const k: number[] = []
  for (let i = 1; i < ls.length; i++) {
    const p = (ls[i] as string).split(",")
    if (p.length !== 3)
      throw new DataError("nk", `row ${i + 1}: need 3 columns`)
    const w = num(p[0], "nk", i + 1)
    const nn = num(p[1], "nk", i + 1)
    const kk = num(p[2], "nk", i + 1)
    if (w <= 0)
      throw new DataError("nk", `row ${i + 1}: wavelength must be > 0`)
    if (nn <= 0) throw new DataError("nk", `row ${i + 1}: n must be > 0`)
    if (kk < 0) throw new DataError("nk", `row ${i + 1}: k must be >= 0`)
    wl.push(w)
    n.push(nn)
    k.push(kk)
  }
  if (wl.length < 1) throw new DataError("nk", "table has no rows")
  checkIncreasing(wl, "nk")
  return {
    wl_um: Float64Array.from(wl),
    n: Float64Array.from(n),
    k: Float64Array.from(k),
  }
}

/** Linear interpolation of n and k at the requested wavelengths; clamps outside the table. */
export function nkAt(
  t: NKTable,
  wl_um: Float64Array,
): { n: Float64Array; k: Float64Array } {
  const m = t.wl_um.length
  const n = new Float64Array(wl_um.length)
  const k = new Float64Array(wl_um.length)
  for (let q = 0; q < wl_um.length; q++) {
    const w = wl_um[q] as number
    if (w <= (t.wl_um[0] as number)) {
      n[q] = t.n[0] as number
      k[q] = t.k[0] as number
    } else if (w >= (t.wl_um[m - 1] as number)) {
      n[q] = t.n[m - 1] as number
      k[q] = t.k[m - 1] as number
    } else {
      let lo = 0
      let hi = m - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if ((t.wl_um[mid] as number) <= w) lo = mid
        else hi = mid
      }
      const f =
        (w - (t.wl_um[lo] as number)) /
        ((t.wl_um[hi] as number) - (t.wl_um[lo] as number))
      n[q] =
        (t.n[lo] as number) + f * ((t.n[hi] as number) - (t.n[lo] as number))
      k[q] =
        (t.k[lo] as number) + f * ((t.k[hi] as number) - (t.k[lo] as number))
    }
  }
  return { n, k }
}

const g = (x: number, digits: number): string =>
  String(Number(x.toPrecision(digits)))

/** Convert the NREL/pvlib ASTMG173.csv (nm, W/m2/nm; global tilt column) to the project form (um, W/m2/um). */
export function convertG173(raw: string): string {
  const ls = lines(raw)
  if (ls.length < 4 || !/wavelength|wvlgth/i.test(ls[1] as string))
    throw new DataError("g173", "unexpected ASTMG173.csv layout")
  const out = ["wl_um,irradiance_w_m2_um"]
  for (let i = 2; i < ls.length; i++) {
    const p = (ls[i] as string).split(",")
    if (p.length < 4)
      throw new DataError("g173", `row ${i + 1}: need 4 columns`)
    const wl = num(p[0], "g173", i + 1)
    const gl = num(p[2], "g173", i + 1)
    out.push(`${g(wl / 1000, 6)},${g(gl * 1000, 8)}`)
  }
  return `${out.join("\n")}\n`
}

/** Read the first `tabulated n` / `tabulated nk` block of a refractiveindex.info YAML file (regex, no YAML load of untrusted data). */
export function convertRiiNk(
  raw: string,
  opts: { minWl?: number; maxWl?: number },
): string {
  const m =
    /type: tabulated (n|nk)\s*\n\s*data: \|\n((?:[ \t]+[-\d.eE+ \t]+\n?)+)/.exec(
      raw,
    )
  if (!m) throw new DataError("rii", "no tabulated n or nk block")
  const hasK = m[1] === "nk"
  const out = ["wl_um,n,k"]
  const body = (m[2] as string).trim().split(/\r?\n/)
  for (let i = 0; i < body.length; i++) {
    const p = (body[i] as string).trim().split(/\s+/)
    const w = num(p[0], "rii", i + 1)
    const nn = num(p[1], "rii", i + 1)
    const kk = hasK ? num(p[2], "rii", i + 1) : 0
    if (opts.minWl !== undefined && w < opts.minWl) continue
    if (opts.maxWl !== undefined && w > opts.maxWl) continue
    out.push(`${g(w, 6)},${g(nn, 6)},${g(kk, 6)}`)
  }
  return `${out.join("\n")}\n`
}

/** Below this wavelength (um) the TiO2 table uses the Siefke film n,k (rule R2). */
export const TIO2_CRYSTAL_START_UM = 0.45

/**
 * TiO2 n,k assembly rule (ruling R2): wavelengths below 0.45 um take the Siefke ALD-film
 * n,k (scenario: rutile crystal data stop at 0.43-0.45 um); from 0.45 um take the mean of
 * the Bond ordinary and extraordinary n with k = 0 (transparent range).
 */
export function assembleTio2Nk(
  siefke: NKTable,
  bondO: NKTable,
  bondE: NKTable,
): NKTable {
  if (
    bondO.wl_um.length !== bondE.wl_um.length ||
    bondO.wl_um.some((w, i) => w !== bondE.wl_um[i])
  )
    throw new DataError("tio2", "Bond ordinary and extraordinary grids differ")
  if ((bondO.wl_um[0] as number) < TIO2_CRYSTAL_START_UM - 1e-9)
    throw new DataError("tio2", "Bond table starts below 0.45 um")
  const wl: number[] = []
  const n: number[] = []
  const k: number[] = []
  for (let i = 0; i < siefke.wl_um.length; i++) {
    const w = siefke.wl_um[i] as number
    if (w >= TIO2_CRYSTAL_START_UM) break
    wl.push(w)
    n.push(siefke.n[i] as number)
    k.push(siefke.k[i] as number)
  }
  if (wl.length === 0)
    throw new DataError("tio2", "Siefke table has no rows below 0.45 um")
  for (let i = 0; i < bondO.wl_um.length; i++) {
    wl.push(bondO.wl_um[i] as number)
    n.push(((bondO.n[i] as number) + (bondE.n[i] as number)) / 2)
    k.push(0)
  }
  checkIncreasing(wl, "tio2")
  return {
    wl_um: Float64Array.from(wl),
    n: Float64Array.from(n),
    k: Float64Array.from(k),
  }
}

export function nkToCsv(t: NKTable): string {
  const out = ["wl_um,n,k"]
  for (let i = 0; i < t.wl_um.length; i++)
    out.push(
      `${g(t.wl_um[i] as number, 6)},${g(t.n[i] as number, 6)},${g(t.k[i] as number, 6)}`,
    )
  return `${out.join("\n")}\n`
}
