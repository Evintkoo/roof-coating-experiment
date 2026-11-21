import { DataError } from "./errors"
import { RESULT_NAN_COLUMNS } from "./schema"

export type CsvOpts = {
  nanColumns?: ReadonlySet<string>
  infColumns?: ReadonlySet<string>
}

const DEFAULT_INF: ReadonlySet<string> = new Set(["gel_time_rel"])

function sets(opts?: CsvOpts) {
  return {
    nan: opts?.nanColumns ?? RESULT_NAN_COLUMNS,
    inf: opts?.infColumns ?? DEFAULT_INF,
  }
}

function cell(
  column: string,
  v: string | number | boolean | undefined,
  nan: ReadonlySet<string>,
  inf: ReadonlySet<string>,
): string {
  if (v === undefined) throw new DataError(column, "missing value")
  if (typeof v === "boolean") return v ? "true" : "false"
  if (typeof v === "string") {
    if (/[,"\r\n]/.test(v)) throw new DataError(column, "cell needs quoting")
    return v
  }
  if (Number.isNaN(v)) {
    if (nan.has(column)) return ""
    throw new DataError(column, "NaN not allowed in this column")
  }
  if (v === Number.POSITIVE_INFINITY) {
    if (inf.has(column)) return "inf"
    throw new DataError(column, "infinity not allowed in this column")
  }
  if (!Number.isFinite(v)) throw new DataError(column, "non-finite number")
  return String(v)
}

export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, string | number | boolean>[],
  opts?: CsvOpts,
): string {
  const { nan, inf } = sets(opts)
  for (const c of columns) cell("header", c, nan, inf)
  const lines = [columns.join(",")]
  for (const row of rows) {
    lines.push(columns.map((c) => cell(c, row[c], nan, inf)).join(","))
  }
  return `${lines.join("\n")}\n`
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  if (lines.length === 0) return []
  const header = (lines[0] as string).split(",")
  const out: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = (lines[i] as string).split(",")
    if (parts.length !== header.length) {
      throw new DataError("csv", `ragged row at line ${i + 1}`)
    }
    const rec: Record<string, string> = {}
    header.forEach((h, j) => {
      rec[h] = parts[j] as string
    })
    out.push(rec)
  }
  return out
}

export function coerceCell(
  column: string,
  text: string,
  opts?: CsvOpts,
): number {
  const { nan, inf } = sets(opts)
  if (text === "") {
    if (nan.has(column)) return Number.NaN
    throw new DataError(column, "empty cell not allowed in this column")
  }
  if (text === "inf") {
    if (inf.has(column)) return Number.POSITIVE_INFINITY
    throw new DataError(column, "inf not allowed in this column")
  }
  const n = Number(text)
  if (!Number.isFinite(n) || text.trim() !== text) {
    throw new DataError(column, "not a finite number")
  }
  return n
}
