import { ConfigError } from "../core/errors"
import { OBJECTIVE_COLUMNS, type ObjRow } from "../core/pipeline/tables"
import { axisLabel } from "./figures"

export type Range = [number, number]
export type Ranges = Record<string, readonly Range[]>

/**
 * D9: read the brush of one axis as the property gd.data[0].dimensions[i].constraintrange (spike Q1):
 * undefined or null (no brush) -> [], flat [lo, hi] -> [[lo, hi]], nested [[lo, hi], ...] as is. Anything else throws.
 */
export function normaliseRanges(raw: unknown): Range[] {
  if (raw === undefined || raw === null) return []
  const bad = (): never => {
    throw new ConfigError("constraintrange", "unrecognised brush range shape")
  }
  const pair = (p: unknown): Range => {
    if (
      !Array.isArray(p) ||
      p.length !== 2 ||
      typeof p[0] !== "number" ||
      typeof p[1] !== "number" ||
      !Number.isFinite(p[0]) ||
      !Number.isFinite(p[1])
    )
      return bad()
    return p[0] <= p[1] ? [p[0], p[1]] : [p[1], p[0]]
  }
  if (!Array.isArray(raw)) return bad()
  if (raw.length === 0) return []
  if (typeof raw[0] === "number") return [pair(raw)]
  return raw.map(pair)
}

/** AND across axes, OR across the ranges of one axis, bounds inclusive. An axis with no range does not constrain. */
export function selectByRanges(
  rows: readonly ObjRow[],
  ranges: Ranges,
): Set<string> {
  const active = Object.entries(ranges).filter(([, r]) => r.length > 0)
  const out = new Set<string>()
  for (const row of rows) {
    const ok = active.every(([col, rs]) => {
      const v = (row as unknown as Record<string, number>)[col]
      return typeof v === "number" && rs.some(([lo, hi]) => v >= lo && v <= hi)
    })
    if (ok) out.add(row.candidate_id)
  }
  return out
}

/** The app-held brush: ranges per column plus the axis order. Plotly.react drops brushes (plotly.js 4.3.0, spike Q1), so this is the source of truth. */
export type BrushState = { ranges: Record<string, Range[]>; order: string[] }

export const emptyBrush = (): BrushState => ({
  ranges: {},
  order: [...OBJECTIVE_COLUMNS],
})

const columnOfLabel = (label: unknown): string | undefined =>
  OBJECTIVE_COLUMNS.find((c) => axisLabel(c) === label)

/** Read the brush and the axis order from `gd.data[0].dimensions` (indexed by label, so reordering is harmless). */
export function readBrush(
  dims: readonly { label?: unknown; constraintrange?: unknown }[],
): BrushState {
  const ranges: Record<string, Range[]> = {}
  const order: string[] = []
  for (const d of dims) {
    const col = columnOfLabel(d.label)
    if (col === undefined) continue
    order.push(col)
    const r = normaliseRanges(d.constraintrange)
    if (r.length > 0) ranges[col] = r
  }
  return { ranges, order }
}

type Dim = { label?: unknown; constraintrange?: unknown } & Record<
  string,
  unknown
>
type Spec = { data: object[]; layout: object; config?: object }

/** Return a copy of a parcoords spec with the held order and `constraintrange` re-injected (call before every Plotly.react). */
export function applyBrush<T extends Spec>(spec: T, brush: BrushState): T {
  const copy = structuredClone(spec)
  const trace = copy.data[0] as { dimensions?: Dim[] } | undefined
  const dims = trace?.dimensions
  if (!dims) return copy
  const pos = (d: Dim) => {
    const i = brush.order.indexOf(columnOfLabel(d.label) ?? "")
    return i < 0 ? brush.order.length : i
  }
  dims.sort((a, b) => pos(a) - pos(b))
  for (const d of dims) {
    const col = columnOfLabel(d.label)
    const r = col === undefined ? undefined : brush.ranges[col]
    if (r && r.length > 0)
      d.constraintrange = r.length === 1 ? (r[0] as Range) : r
    else delete d.constraintrange
  }
  return copy
}
