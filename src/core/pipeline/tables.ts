import { coerceCell, parseCsv } from "../csv"
import { ConfigError } from "../errors"

// ---- Column lists (plan 03 File Structure; CSV header order) ----

/** The five Pareto objectives (FR-4 order): maximise the first, minimise the rest. */
export const OBJECTIVE_COLUMNS = [
  "r_solar_pred",
  "t_max_pred",
  "corrosion_proxy",
  "delam_proxy",
  "cost_proxy",
] as const

export const PARETO_COLUMNS = [
  "candidate_id",
  ...OBJECTIVE_COLUMNS,
  "t_max_worst",
  "on_front",
  "pareto_freq",
  "role",
] as const

const CONTROL_OUTCOMES = [
  "r_solar_pred",
  "t_max_pred",
  "q_in_mean_w_m2",
  "corrosion_proxy",
  "wetting_proxy",
  "wetting_theta_pred",
  "delam_proxy",
  "cost_proxy",
  "gel_time_rel",
] as const

export const CONTROL_COLUMNS = [
  "control_id",
  "for_candidate",
  "scenario_id",
  ...CONTROL_OUTCOMES,
  "unmodelled",
] as const

/** Columns of controls.csv that may be an empty (NaN) cell: pass as CsvOpts.nanColumns (the thermal columns never). */
export const CONTROL_NAN_COLUMNS: ReadonlySet<string> = new Set([
  "corrosion_proxy",
  "wetting_proxy",
  "wetting_theta_pred",
  "delam_proxy",
  "cost_proxy",
  "gel_time_rel",
])

export const SENS_COLUMNS = [
  "output",
  "method",
  "variable",
  "index",
  "value",
  "conf",
] as const

export const DRAW_COLUMNS = [
  "draw",
  "candidate_id",
  ...OBJECTIVE_COLUMNS,
] as const

// ---- Row types ----

export const ROLES = ["high_performing", "balanced", "low_cost"] as const

type Obj = Record<(typeof OBJECTIVE_COLUMNS)[number], number>
export type ParetoRow = { candidate_id: string } & Obj & {
    t_max_worst: number
    on_front: boolean
    pareto_freq: number
    role: "" | (typeof ROLES)[number]
  }
/** Objective row (plan 03 name for a pareto.csv row). */
export type ObjRow = ParetoRow
export type ControlRow = {
  control_id: string
  for_candidate: string
  scenario_id: string
  unmodelled: string
} & Record<(typeof CONTROL_OUTCOMES)[number], number>
export type SensRow = {
  output: string
  method: "morris" | "sobol"
  variable: string
  index: "S1" | "ST" | "mu_star" | "sigma"
  value: number
  conf: number
}
export type DrawRow = { draw: number; candidate_id: string } & Obj

export type CurveSeries = {
  id: string
  kind: "candidate" | "control"
  scenario_id: string
  nominal_only: boolean
  t_c: number[]
  t_lo_c?: number[]
  t_hi_c?: number[]
}
export type CurvesJson = {
  time_s: number[]
  n_mc: number
  series: CurveSeries[]
}
export type SpectraSeries = {
  id: string
  kind: "candidate" | "control"
  nominal_only: boolean
  r: number[]
  r_lo?: number[]
  r_hi?: number[]
}
export type SpectraJson = {
  wl_um: number[]
  n_mc: number
  series: SpectraSeries[]
}

// ---- Validators ----

const ID = /^SP-\d{3}$/
type Rec = Record<string, unknown>

function keys(row: Rec, cols: readonly string[], where: string): void {
  for (const c of cols)
    if (!(c in row)) throw new ConfigError(c, `${where}: missing column ${c}`)
  const ok = new Set(cols)
  for (const k of Object.keys(row))
    if (!ok.has(k)) throw new ConfigError(k, `${where}: unexpected column ${k}`)
}

function fin(row: Rec, c: string, where: string): number {
  const v = row[c]
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new ConfigError(c, `${where}: ${c} must be a finite number`)
  return v
}

function str(row: Rec, c: string, where: string): string {
  const v = row[c]
  if (typeof v !== "string")
    throw new ConfigError(c, `${where}: ${c} must be a string`)
  return v
}

function candId(row: Rec, where: string): string {
  const id = str(row, "candidate_id", where)
  if (!ID.test(id))
    throw new ConfigError(
      "candidate_id",
      `${where}: candidate_id must match ^SP-\\d{3}$`,
    )
  return id
}

function objectives(row: Rec, where: string): Obj {
  const o = {} as Obj
  for (const c of OBJECTIVE_COLUMNS) o[c] = fin(row, c, where)
  if (o.r_solar_pred < 0 || o.r_solar_pred > 1)
    throw new ConfigError(
      "r_solar_pred",
      `${where}: r_solar_pred outside [0,1]`,
    )
  if (o.cost_proxy < 0 || o.cost_proxy > 1)
    throw new ConfigError("cost_proxy", `${where}: cost_proxy outside [0,1]`)
  return o
}

export function validatePareto(rows: readonly Rec[]): ParetoRow[] {
  return rows.map((row, i) => {
    const where = `pareto row ${i + 1}`
    keys(row, PARETO_COLUMNS, where)
    const id = candId(row, where)
    const o = objectives(row, where)
    const worst = fin(row, "t_max_worst", where)
    if (typeof row.on_front !== "boolean")
      throw new ConfigError("on_front", `${where}: on_front must be boolean`)
    const freq = fin(row, "pareto_freq", where)
    if (freq < 0 || freq > 1)
      throw new ConfigError(
        "pareto_freq",
        `${where}: pareto_freq outside [0,1]`,
      )
    const role = str(row, "role", where)
    if (role !== "" && !(ROLES as readonly string[]).includes(role))
      throw new ConfigError("role", `${where}: unknown role`)
    return {
      candidate_id: id,
      ...o,
      t_max_worst: worst,
      on_front: row.on_front,
      pareto_freq: freq,
      role: role as ParetoRow["role"],
    }
  })
}

/** NaN is allowed only in the columns the row itself lists in `unmodelled`, and every listed column must be NaN. */
export function validateControls(rows: readonly Rec[]): ControlRow[] {
  return rows.map((row, i) => {
    const where = `controls row ${i + 1}`
    keys(row, CONTROL_COLUMNS, where)
    const control_id = str(row, "control_id", where)
    const for_candidate = str(row, "for_candidate", where)
    const scenario_id = str(row, "scenario_id", where)
    if (control_id === "" || scenario_id === "" || for_candidate === "")
      throw new ConfigError("control_id", `${where}: ids must be non-empty`)
    const unmodelled = str(row, "unmodelled", where)
    const listed = unmodelled === "" ? [] : unmodelled.split(";")
    for (const c of listed)
      if (!CONTROL_NAN_COLUMNS.has(c))
        throw new ConfigError(
          "unmodelled",
          `${where}: ${c} cannot be unmodelled`,
        )
    const out: Rec = { control_id, for_candidate, scenario_id, unmodelled }
    for (const c of CONTROL_OUTCOMES) {
      const v = row[c]
      if (typeof v !== "number")
        throw new ConfigError(c, `${where}: ${c} must be a number`)
      if (Number.isNaN(v)) {
        if (!listed.includes(c))
          throw new ConfigError(
            c,
            `${where}: NaN in ${c} but it is not listed in unmodelled`,
          )
      } else {
        if (listed.includes(c))
          throw new ConfigError(
            "unmodelled",
            `${where}: ${c} is listed in unmodelled but has a value`,
          )
        if (!Number.isFinite(v) && !(c === "gel_time_rel" && v > 0))
          throw new ConfigError(c, `${where}: ${c} must be finite`)
      }
      out[c] = v
    }
    return out as ControlRow
  })
}

const INDEX_METHOD = {
  S1: "sobol",
  ST: "sobol",
  mu_star: "morris",
  sigma: "morris",
} as const

export function validateSens(rows: readonly Rec[]): SensRow[] {
  return rows.map((row, i) => {
    const where = `sensitivity row ${i + 1}`
    keys(row, SENS_COLUMNS, where)
    const index = str(row, "index", where)
    if (!(index in INDEX_METHOD))
      throw new ConfigError(
        "index",
        `${where}: index must be S1, ST, mu_star or sigma`,
      )
    const method = str(row, "method", where)
    if (method !== INDEX_METHOD[index as keyof typeof INDEX_METHOD])
      throw new ConfigError(
        "index",
        `${where}: index ${index} does not belong to method ${method}`,
      )
    const conf = fin(row, "conf", where)
    if (conf < 0) throw new ConfigError("conf", `${where}: conf must be >= 0`)
    return {
      output: str(row, "output", where),
      method: method as SensRow["method"],
      variable: str(row, "variable", where),
      index: index as SensRow["index"],
      value: fin(row, "value", where),
      conf,
    }
  })
}

export function validateDraws(rows: readonly Rec[]): DrawRow[] {
  return rows.map((row, i) => {
    const where = `draws row ${i + 1}`
    keys(row, DRAW_COLUMNS, where)
    const draw = fin(row, "draw", where)
    if (!Number.isInteger(draw) || draw < 0)
      throw new ConfigError(
        "draw",
        `${where}: draw must be a non-negative integer`,
      )
    return { draw, candidate_id: candId(row, where), ...objectives(row, where) }
  })
}

/** Parse draws.csv text (strict header, no empty cells) into validated rows. */
export function parseDrawsCsv(input: string): DrawRow[] {
  const raw = parseCsv(input).map((rec) => {
    const o: Rec = {}
    for (const [k, v] of Object.entries(rec))
      o[k] = k === "candidate_id" ? v : coerceCell(k, v)
    return o
  })
  return validateDraws(raw)
}

function nums(v: unknown, n: number, key: string, where: string): number[] {
  if (!Array.isArray(v) || v.length !== n)
    throw new ConfigError(key, `${where}: ${key} must have ${n} entries`)
  for (const x of v)
    if (typeof x !== "number" || !Number.isFinite(x))
      throw new ConfigError(key, `${where}: ${key} must be finite numbers`)
  return v as number[]
}

function band(
  s: Rec,
  nominal: string,
  lo: string,
  hi: string,
  n: number,
  where: string,
): void {
  const v = nums(s[nominal], n, nominal, where)
  const hasBand = lo in s || hi in s
  if (s.nominal_only === true) {
    if (hasBand)
      throw new ConfigError(lo, `${where}: nominal-only series carries a band`)
    return
  }
  if (!hasBand)
    throw new ConfigError(lo, `${where}: banded series needs ${lo} and ${hi}`)
  const l = nums(s[lo], n, lo, where)
  const h = nums(s[hi], n, hi, where)
  for (let i = 0; i < n; i++)
    if (
      !(
        (l[i] as number) <= (v[i] as number) &&
        (v[i] as number) <= (h[i] as number)
      )
    )
      throw new ConfigError(
        lo,
        `${where}: ${lo} <= ${nominal} <= ${hi} violated at ${i}`,
      )
}

function seriesCommon(s: unknown, i: number, where: string): Rec {
  if (typeof s !== "object" || s === null)
    throw new ConfigError("series", `${where}: series ${i} is not an object`)
  const r = s as Rec
  if (typeof r.id !== "string" || r.id === "")
    throw new ConfigError("id", `${where}: series ${i} needs an id`)
  if (r.kind !== "candidate" && r.kind !== "control")
    throw new ConfigError("kind", `${where}: series ${i} kind`)
  if (typeof r.nominal_only !== "boolean")
    throw new ConfigError("nominal_only", `${where}: series ${i} nominal_only`)
  return r
}

export function validateCurves(j: unknown): CurvesJson {
  const where = "curves"
  const r = j as Rec
  const time = nums(
    r?.time_s,
    (r?.time_s as unknown[] | undefined)?.length ?? -1,
    "time_s",
    where,
  )
  if (typeof r.n_mc !== "number" || !Array.isArray(r.series))
    throw new ConfigError("curves", "curves.json shape")
  r.series.forEach((raw: unknown, i: number) => {
    const s = seriesCommon(raw, i, `curves series ${i}`)
    if (typeof s.scenario_id !== "string")
      throw new ConfigError("scenario_id", `curves series ${i}: scenario_id`)
    band(s, "t_c", "t_lo_c", "t_hi_c", time.length, `curves series ${i}`)
  })
  return j as CurvesJson
}

export function validateSpectra(j: unknown): SpectraJson {
  const where = "spectra"
  const r = j as Rec
  const wl = nums(
    r?.wl_um,
    (r?.wl_um as unknown[] | undefined)?.length ?? -1,
    "wl_um",
    where,
  )
  if (typeof r.n_mc !== "number" || !Array.isArray(r.series))
    throw new ConfigError("spectra", "spectra.json shape")
  r.series.forEach((raw: unknown, i: number) => {
    const s = seriesCommon(raw, i, `spectra series ${i}`)
    band(s, "r", "r_lo", "r_hi", wl.length, `spectra series ${i}`)
  })
  return j as SpectraJson
}

const STRING_COLUMNS = new Set([
  "candidate_id",
  "role",
  "control_id",
  "for_candidate",
  "scenario_id",
  "unmodelled",
  "output",
  "method",
  "variable",
  "index",
])

function parseTable(
  input: string,
  columns: readonly string[],
  where: string,
  opts?: Parameters<typeof coerceCell>[2],
  bools: readonly string[] = [],
): Rec[] {
  const text = input.startsWith("﻿") ? input.slice(1) : input
  const first = text.split("\n", 1)[0]?.replace(/\r$/, "") ?? ""
  if (first !== columns.join(","))
    throw new ConfigError(
      "header",
      `${where}: header differs from the contract`,
    )
  return parseCsv(text).map((rec) => {
    const o: Rec = {}
    for (const [k, v] of Object.entries(rec)) {
      if (STRING_COLUMNS.has(k)) o[k] = v
      else if (bools.includes(k)) {
        if (v !== "true" && v !== "false")
          throw new ConfigError(k, `${where}: ${k} must be true or false`)
        o[k] = v === "true"
      } else o[k] = coerceCell(k, v, opts)
    }
    return o
  })
}

/** Parse pareto.csv text (strict header) into validated rows. */
export const parseParetoCsv = (input: string): ParetoRow[] =>
  validatePareto(
    parseTable(input, PARETO_COLUMNS, "pareto.csv", undefined, ["on_front"]),
  )

/** Parse sensitivity.csv text (strict header) into validated rows. */
export const parseSensCsv = (input: string): SensRow[] =>
  validateSens(parseTable(input, SENS_COLUMNS, "sensitivity.csv"))

/** Parse controls.csv text (strict header; empty cells only in the unmodelled columns) into validated rows. */
export const parseControlsCsv = (input: string): ControlRow[] =>
  validateControls(
    parseTable(input, CONTROL_COLUMNS, "controls.csv", {
      nanColumns: CONTROL_NAN_COLUMNS,
      infColumns: new Set(["gel_time_rel"]),
    }),
  )
