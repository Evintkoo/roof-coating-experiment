import { z } from "zod"
import { Sourced } from "../config"
import { ConfigError, DataError } from "../errors"

/** One hourly record as stored in the raw cache (UTC hour start). */
export type HourRecord = {
  utc_ms: number
  g_w_m2: number
  lw_down_w_m2: number
  t_air_c: number
  rh_pct: number
  wind_m_s: number
  precip_mm: number
}

export type IndonesiaRow = {
  site: string
  season: "wet" | "dry"
  bin: "hot" | "typical" | "overcast"
  subject: string
  state: "initial" | "aged"
  r_solar_eff: number
  t_max_c: number
  t_max_lo: number
  t_max_hi: number
  q_in_mean_w_m2: number
  q_lo: number
  q_hi: number
  tow_hours: number
  nominal_only: boolean
}

/** 24 hourly points of one local day. */
export type HourlySeries = {
  g_w_m2: Float64Array
  t_air_c: Float64Array
  rh_pct: Float64Array
  wind_m_s: Float64Array
  lw_down_w_m2: Float64Array
}

export type SiteConfig = {
  id: string
  lat: number
  lon: number
  utc_offset_h: number
  elevation_m: number
}

export type IndonesiaConfig = {
  wet_month_mm: number
  first_year: number
  last_year: number
  loss_lo: number
  loss_hi: number
  tow_rh_above_pct: number
  tow_t_above_c: number
}

const SIGMA = 5.670374419e-8
/** NASA POWER fill value (spike Q1: header.fill_value). */
const FILL_VALUE = -999

/** Aluminium 3003 (plan 1 D5, plan 2 Q2): rho in kg/m3 and c_p in J/(kg K). */
const AL_RHO = 2730
const AL_CP = 893
const AL_THICKNESS_M: readonly number[] = [0.0005, 0.0007]
/**
 * Relative tolerance of the substrate guard. 1e-4 admits the five-figure value printed in
 * configs/materials.yaml (1218.9 against the exact 1218.945, 3.7e-5) and still rejects every
 * other constant, the steel figure 1540 (26 % away) included.
 */
const SUBSTRATE_RTOL = 1e-4

export function validateSubstrate(c_j_m2k: number): void {
  const ok = AL_THICKNESS_M.some(
    (t) =>
      Math.abs(c_j_m2k - AL_RHO * AL_CP * t) <=
      SUBSTRATE_RTOL * (AL_RHO * AL_CP * t),
  )
  if (!ok) {
    throw new ConfigError(
      "substrate.c_j_m2k",
      `substrate heat capacity ${c_j_m2k} J/(m2 K) is not aluminium rho*c_p*t for 0.5 or 0.7 mm (steel constants are rejected)`,
    )
  }
}

export function validateLossRange(lo: number, hi: number): void {
  if (
    !(
      Number.isFinite(lo) &&
      Number.isFinite(hi) &&
      lo >= 0 &&
      lo <= hi &&
      hi < 1
    )
  ) {
    throw new ConfigError(
      "ageing.loss_lo",
      `ageing loss range must satisfy 0 <= loss_lo <= loss_hi < 1, got ${lo} and ${hi}`,
    )
  }
}

type Column = keyof HourlySeries
const COLUMNS: readonly Column[] = [
  "g_w_m2",
  "lw_down_w_m2",
  "t_air_c",
  "rh_pct",
  "wind_m_s",
]

/** Column-specific legal test; `undefined` when the value is legal. */
function columnProblem(col: Column, v: number): string | undefined {
  if (!Number.isFinite(v)) return "not a finite number"
  if (col === "g_w_m2" && v < 0) return "irradiance below zero"
  if (col === "lw_down_w_m2" && v <= 0) return "longwave not above zero"
  if (col === "rh_pct" && (v < 0 || v > 100))
    return "relative humidity outside 0..100"
  if (col === "wind_m_s" && v < 0) return "wind speed below zero"
  return undefined
}

/**
 * Data check of one local day (F1, F2, F8): every failure is a DataError (exit 5) whose key is the column.
 * Fill values are reported first so a -999 irradiance is never read as a number.
 */
export function validateSeries(s: HourlySeries, site: string): void {
  for (const col of COLUMNS) {
    const a = s[col]
    if (a.length !== 24) {
      throw new DataError(
        col,
        `${site}: ${col} has ${a.length} points, expected 24`,
      )
    }
    for (let h = 0; h < 24; h++) {
      const v = a[h] as number
      if (v === FILL_VALUE) {
        throw new DataError(col, `${site}: ${col} fill value -999 at hour ${h}`)
      }
      const why = columnProblem(col, v)
      if (why)
        throw new DataError(col, `${site}: ${col} at hour ${h}: ${why} (${v})`)
    }
  }
}

/** Effective sky temperature (K) from the dataset's downward longwave (FR-3): (LW / sigma)^(1/4). */
export function skyTempK(lwDownWM2: number): number {
  if (!(Number.isFinite(lwDownWM2) && lwDownWM2 > 0)) {
    throw new DataError(
      "lw_down_w_m2",
      `downward longwave must be above zero, got ${lwDownWM2}`,
    )
  }
  return (lwDownWM2 / SIGMA) ** 0.25
}

// ---- config schemas (strictObject like plan 1; every value has unit, source and status) ----

const SiteSchema = z.strictObject({
  lat: Sourced.extend({ value: z.number().min(-90).max(90) }),
  lon: Sourced.extend({ value: z.number().min(-180).max(180) }),
  utc_offset_h: Sourced.extend({ value: z.number().min(-12).max(14) }),
  elevation_m: Sourced.extend({ value: z.number().min(-500).max(9000) }),
})

const SitesSchema = z.strictObject({
  sites: z
    .record(z.string().regex(/^[a-z][a-z0-9_]*$/), SiteSchema)
    .refine((r) => Object.keys(r).length > 0, {
      message: "at least one site is required",
    }),
})

const YearSchema = Sourced.extend({
  value: z.number().int().min(1980).max(2100),
})

const IndonesiaSchema = z
  .strictObject({
    scenario: z.strictObject({
      wet_month_mm: Sourced.extend({ value: z.number().gt(0) }),
    }),
    years: z.strictObject({ first: YearSchema, last: YearSchema }),
    ageing: z.strictObject({ loss_lo: Sourced, loss_hi: Sourced }),
    time_of_wetness: z.strictObject({
      rh_above_pct: Sourced.extend({ value: z.number().min(0).max(100) }),
      t_above_c: Sourced,
    }),
  })
  .refine((c) => c.years.first.value <= c.years.last.value, {
    path: ["years", "first"],
    message: "first year must not be after last year",
  })

function firstIssue(err: z.ZodError): ConfigError {
  const issue = err.issues[0]
  if (!issue) return new ConfigError("(root)", "invalid config")
  const path = issue.path.map(String)
  if (issue.code === "unrecognized_keys") path.push(String(issue.keys[0]))
  return new ConfigError(
    path.length === 0 ? "(root)" : path.join("."),
    issue.message,
  )
}

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T {
  const res = schema.safeParse(raw)
  if (!res.success) throw firstIssue(res.error)
  return res.data
}

/** Sites in file order (the report order of plan 04 D9). */
export function parseSites(raw: unknown): SiteConfig[] {
  const { sites } = parseWith(SitesSchema, raw)
  return Object.entries(sites).map(([id, s]) => ({
    id,
    lat: s.lat.value,
    lon: s.lon.value,
    utc_offset_h: s.utc_offset_h.value,
    elevation_m: s.elevation_m.value,
  }))
}

export function parseIndonesiaConfig(raw: unknown): IndonesiaConfig {
  const c = parseWith(IndonesiaSchema, raw)
  validateLossRange(c.ageing.loss_lo.value, c.ageing.loss_hi.value)
  return {
    wet_month_mm: c.scenario.wet_month_mm.value,
    first_year: c.years.first.value,
    last_year: c.years.last.value,
    loss_lo: c.ageing.loss_lo.value,
    loss_hi: c.ageing.loss_hi.value,
    tow_rh_above_pct: c.time_of_wetness.rh_above_pct.value,
    tow_t_above_c: c.time_of_wetness.t_above_c.value,
  }
}
