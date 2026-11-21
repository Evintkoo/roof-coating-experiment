import {
  DESIGN_COLUMNS,
  DESIGN_FLAG_COLUMNS,
  NOT_NAN,
  RESULT_COLUMNS,
  RESULT_NAN_COLUMNS,
} from "./columns"
import { coerceCell, parseCsv } from "./csv"
import { ConfigError } from "./errors"

type NumDesign = Exclude<(typeof DESIGN_COLUMNS)[number], "candidate_id">
export type DesignRow = { candidate_id: string } & Record<NumDesign, number>
export type FlaggedDesignRow = DesignRow & {
  feasible: boolean
  violations: string
}
type ResultStr = "candidate_id" | "scenario_id"
export type ResultRow = {
  [K in (typeof RESULT_COLUMNS)[number]]: K extends ResultStr
    ? string
    : K extends "feasible"
      ? boolean
      : number
}

export {
  DESIGN_COLUMNS,
  DESIGN_FLAG_COLUMNS,
  RESULT_COLUMNS,
  RESULT_NAN_COLUMNS,
}

const ID = /^SP-\d{3}$/

function checkKeys(
  row: Record<string, unknown>,
  cols: readonly string[],
  where: string,
): void {
  for (const c of cols) {
    if (!(c in row)) throw new ConfigError(c, `${where}: missing column ${c}`)
  }
  const allowed = new Set(cols)
  for (const k of Object.keys(row)) {
    if (!allowed.has(k))
      throw new ConfigError(k, `${where}: unexpected column ${k}`)
  }
}

function num(row: Record<string, unknown>, c: string, where: string): number {
  const v = row[c]
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ConfigError(c, `${where}: ${c} must be a finite number`)
  }
  return v
}

export function validateDesign(
  rows: readonly Record<string, unknown>[],
  withFlags?: false,
): DesignRow[]
export function validateDesign(
  rows: readonly Record<string, unknown>[],
  withFlags: true,
): FlaggedDesignRow[]
export function validateDesign(
  rows: readonly Record<string, unknown>[],
  withFlags = false,
): DesignRow[] | FlaggedDesignRow[] {
  const cols: readonly string[] = withFlags
    ? [...DESIGN_COLUMNS, ...DESIGN_FLAG_COLUMNS]
    : DESIGN_COLUMNS
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  rows.forEach((row, i) => {
    const where = `design row ${i + 1}`
    checkKeys(row, cols, where)
    const id = row.candidate_id
    if (typeof id !== "string" || !ID.test(id)) {
      throw new ConfigError(
        "candidate_id",
        `${where}: candidate_id must match ^SP-\\d{3}$`,
      )
    }
    if (seen.has(id))
      throw new ConfigError("candidate_id", `${where}: duplicate candidate_id`)
    seen.add(id)
    const o: Record<string, unknown> = { candidate_id: id }
    for (const c of DESIGN_COLUMNS)
      if (c !== "candidate_id") o[c] = num(row, c, where)
    if (withFlags) {
      if (typeof row.feasible !== "boolean") {
        throw new ConfigError("feasible", `${where}: feasible must be boolean`)
      }
      if (typeof row.violations !== "string") {
        throw new ConfigError(
          "violations",
          `${where}: violations must be a string`,
        )
      }
      o.feasible = row.feasible
      o.violations = row.violations
    }
    out.push(o)
  })
  return out as DesignRow[] | FlaggedDesignRow[]
}

const TRIPLES: readonly [string, string, string, number, number][] = [
  ["r_solar_pred", "r_solar_lo", "r_solar_hi", 0, 1],
  ["t_max_pred", "t_max_lo", "t_max_hi", -Infinity, Infinity],
  ["corrosion_proxy", "corrosion_proxy_lo", "corrosion_proxy_hi", 0, 1],
  ["wetting_proxy", "wetting_proxy_lo", "wetting_proxy_hi", 0, 1],
  ["wetting_theta_pred", "wetting_theta_lo", "wetting_theta_hi", 0, 180],
  [
    "q_in_mean_w_m2",
    "q_in_mean_w_m2_lo",
    "q_in_mean_w_m2_hi",
    -Infinity,
    Infinity,
  ],
  ["delam_proxy", "delam_proxy_lo", "delam_proxy_hi", 0, 1],
]

export function validateResults(
  rows: readonly Record<string, unknown>[],
): ResultRow[] {
  const out: ResultRow[] = []
  rows.forEach((row, i) => {
    const where = `results row ${i + 1}`
    checkKeys(row, RESULT_COLUMNS, where)
    const id = row.candidate_id
    if (typeof id !== "string" || !ID.test(id)) {
      throw new ConfigError(
        "candidate_id",
        `${where}: candidate_id must match ^SP-\\d{3}$`,
      )
    }
    if (typeof row.scenario_id !== "string" || row.scenario_id === "") {
      throw new ConfigError(
        "scenario_id",
        `${where}: scenario_id must be a non-empty string`,
      )
    }
    if (typeof row.feasible !== "boolean") {
      throw new ConfigError("feasible", `${where}: feasible must be boolean`)
    }
    const feasible = row.feasible
    const o: Record<string, unknown> = {
      candidate_id: id,
      scenario_id: row.scenario_id,
      feasible,
    }
    for (const c of RESULT_COLUMNS) {
      if (c === "candidate_id" || c === "scenario_id" || c === "feasible")
        continue
      if (NOT_NAN.has(c)) {
        o[c] = num(row, c, where)
        continue
      }
      const v = row[c]
      if (typeof v !== "number")
        throw new ConfigError(c, `${where}: ${c} must be a number`)
      if (Number.isNaN(v)) {
        if (feasible)
          throw new ConfigError(c, `${where}: NaN in ${c} on a feasible row`)
      } else if (v === Number.POSITIVE_INFINITY) {
        if (c !== "gel_time_rel")
          throw new ConfigError(c, `${where}: ${c} must be finite`)
      } else if (!Number.isFinite(v)) {
        throw new ConfigError(c, `${where}: ${c} must not be -Infinity`)
      }
      o[c] = v
    }
    const cost = o.cost_proxy as number
    if (!Number.isNaN(cost) && (cost < 0 || cost > 1)) {
      throw new ConfigError(
        "cost_proxy",
        `${where}: cost_proxy must be in [0,1]`,
      )
    }
    for (const [p, lo, hi, min, max] of TRIPLES) {
      const vals = [p, lo, hi].map((c) => [c, o[c] as number] as const)
      for (const [c, v] of vals) {
        if (!Number.isNaN(v) && (v < min || v > max)) {
          throw new ConfigError(c, `${where}: ${c} outside [${min},${max}]`)
        }
      }
      const [pv, lv, hv] = vals.map(([, v]) => v) as [number, number, number]
      if (!Number.isNaN(lv) && !Number.isNaN(pv) && lv > pv) {
        throw new ConfigError(lo, `${where}: ${lo} exceeds ${p}`)
      }
      if (!Number.isNaN(pv) && !Number.isNaN(hv) && pv > hv) {
        throw new ConfigError(hi, `${where}: ${hi} below ${p}`)
      }
      if (!Number.isNaN(lv) && !Number.isNaN(hv) && lv > hv) {
        throw new ConfigError(hi, `${where}: ${hi} below ${lo}`)
      }
    }
    out.push(o as ResultRow)
  })
  return out
}

function checkHeader(text: string): void {
  const first = text.split("\n", 1)[0] ?? ""
  const header = first.replace(/\r$/, "").split(",")
  if (header.length === 1 && header[0] === "") header.pop()
  const allowed = new Set<string>(RESULT_COLUMNS)
  const seen = new Set<string>()
  for (const h of header) {
    if (!allowed.has(h)) throw new ConfigError(h, `unexpected column ${h}`)
    if (seen.has(h)) throw new ConfigError(h, `duplicate column ${h}`)
    seen.add(h)
  }
  for (const c of RESULT_COLUMNS) {
    if (!seen.has(c)) throw new ConfigError(c, `missing column ${c}`)
  }
}

export function parseResultsCsv(input: string): ResultRow[] {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input
  checkHeader(text)
  const raw = parseCsv(text).map((rec) => {
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rec)) {
      if (k === "candidate_id" || k === "scenario_id") o[k] = v
      else if (k === "feasible") {
        if (v !== "true" && v !== "false") {
          throw new ConfigError("feasible", "feasible must be true or false")
        }
        o[k] = v === "true"
      } else o[k] = coerceCell(k, v)
    }
    return o
  })
  return validateResults(raw)
}
