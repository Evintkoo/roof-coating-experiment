// Report sheet R13: one table cell. Numbers right-aligned in the mono face, units in the header, an index value always with its
// PROXY label (FR-4). `data-sort` carries the raw value so the table can sort without parsing text.
import { buildError, cls, esc, finite, fixed, oneOf, tag } from "../html"
import { type ProxyTone, proxyBadge } from "./proxyBadge"

export const CELL_KINDS = ["text", "number", "index", "empty"] as const
export type CellKind = (typeof CELL_KINDS)[number]

export type TableCellProps =
  | { kind: "text"; value: string; header?: boolean; mono?: boolean }
  | {
      kind: "number"
      value: number
      digits?: number
      interval?: { lo: number; hi: number }
    }
  | { kind: "index"; value: number; digits?: number; tone: ProxyTone }
  | { kind: "empty" }

const C = "TableCell"

export function tableCell(p: TableCellProps): string {
  const kind = oneOf(C, CELL_KINDS, p.kind)
  if (p.kind === "text") {
    if (typeof p.value !== "string")
      return buildError(C, "text must be a string")
    return tag(
      p.header ? "th" : "td",
      {
        class: cls("tv-cell", "tv-cell--text", p.mono && "tv-cell--mono"),
        scope: p.header ? "row" : undefined,
        "data-sort": p.value.toLowerCase(),
      },
      esc(p.value),
    )
  }
  if (p.kind === "empty")
    return tag(
      "td",
      { class: "tv-cell tv-cell--empty", "data-sort": "" },
      `<span aria-hidden="true">–</span><span class="tv-visually-hidden">no value</span>`,
    )
  const value = finite(C, "value", p.value)
  const num = fixed(C, value, p.digits)
  if (p.kind === "index") {
    const tone = oneOf(C, ["proxy", "scenario", "nominal"] as const, p.tone)
    return tag(
      "td",
      {
        class: "tv-cell tv-cell--number tv-cell--index",
        "data-sort": String(value),
        "data-tone": tone,
      },
      esc(num) + " " + proxyBadge({ tone }),
    )
  }
  let iv = ""
  if (p.interval !== undefined) {
    const lo = finite(C, "interval.lo", p.interval.lo)
    const hi = finite(C, "interval.hi", p.interval.hi)
    if (lo > hi) return buildError(C, "interval.lo must not exceed interval.hi")
    iv = ` ${tag("span", { class: "tv-cell__interval" }, esc(`[${fixed(C, lo, p.digits)}, ${fixed(C, hi, p.digits)}]`))}`
  }
  void kind
  return tag(
    "td",
    { class: "tv-cell tv-cell--number", "data-sort": String(value) },
    esc(num) + iv,
  )
}
