// Report sheet R18: a real table with a caption, units in the headers, numbers right-aligned, an index value always labelled,
// and optional sorting from the header (a native button, aria-sort, TABLE_SORT_SCRIPT).
import { buildError, cls, esc, oneOf, tag } from "../html"
import { PROXY_TONES, type ProxyTone } from "../molecules/proxyBadge"
import { tableCell } from "../molecules/tableCell"

export const COLUMN_KINDS = ["text", "number", "index"] as const
export type ColumnKind = (typeof COLUMN_KINDS)[number]

type ColumnBase = {
  key: string
  label: string
  unit?: string
  sortable?: boolean
  /** The first text column may be the row header. */
  rowHeader?: boolean
}
export type Column =
  | (ColumnBase & { kind: "text"; mono?: boolean })
  | (ColumnBase & { kind: "number"; digits?: number })
  | (ColumnBase & { kind: "index"; tone: ProxyTone; digits?: number })

export type CellValue =
  | string
  | number
  | { value: number; lo: number; hi: number }
  | null
  | undefined

export type DataTableProps = {
  id: string
  caption: string
  columns: readonly Column[]
  rows: readonly Readonly<Record<string, CellValue>>[]
  /** The text column whose value becomes `data-id` on each row (the page script finds rows by it). */
  rowIdKey?: string
}

const C = "DataTable"

function cell(c: Column, v: CellValue): string {
  if (v === null || v === undefined) return tableCell({ kind: "empty" })
  if (c.kind === "text") {
    if (typeof v !== "string")
      return buildError(C, `column ${c.key} takes text`)
    return tableCell({
      kind: "text",
      value: v,
      ...(c.rowHeader ? { header: true } : {}),
      ...(c.mono ? { mono: true } : {}),
    })
  }
  const digits = c.digits === undefined ? {} : { digits: c.digits }
  if (c.kind === "index") {
    if (typeof v !== "number")
      return buildError(C, `column ${c.key} takes a number`)
    return tableCell({ kind: "index", value: v, tone: c.tone, ...digits })
  }
  if (typeof v === "number")
    return tableCell({ kind: "number", value: v, ...digits })
  if (typeof v === "object")
    return tableCell({
      kind: "number",
      value: v.value,
      interval: { lo: v.lo, hi: v.hi },
      ...digits,
    })
  return buildError(C, `column ${c.key} takes a number`)
}

export function dataTable(p: DataTableProps): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.id))
    return buildError(C, "id must be a plain identifier")
  if (typeof p.caption !== "string" || p.caption.trim() === "")
    return buildError(C, "a table needs a caption")
  if (p.columns.length === 0) return buildError(C, "a table needs columns")
  const keys = new Set<string>()
  for (const c of p.columns) {
    oneOf(C, COLUMN_KINDS, c.kind)
    if (keys.has(c.key)) return buildError(C, "column keys must be distinct")
    keys.add(c.key)
    if (c.kind === "index") oneOf(C, PROXY_TONES, (c as { tone: unknown }).tone)
  }
  const heads = p.columns
    .map((c) => {
      const text = esc(c.unit ? `${c.label} (${c.unit})` : c.label)
      const numeric = c.kind !== "text"
      return tag(
        "th",
        {
          scope: "col",
          class: cls("tv-cell", numeric && "tv-cell--number", "tv-table__head"),
          "aria-sort": c.sortable ? "none" : undefined,
          "data-kind": c.kind,
        },
        c.sortable
          ? tag("button", { type: "button", class: "tv-table__sort" }, text)
          : text,
      )
    })
    .join("")
  const idKey = p.rowIdKey
  if (idKey !== undefined && !keys.has(idKey))
    return buildError(C, "rowIdKey is not a column")
  const body = p.rows
    .map((r, i) =>
      tag(
        "tr",
        {
          "data-row": i,
          "data-id": idKey === undefined ? undefined : String(r[idKey] ?? ""),
        },
        p.columns.map((c) => cell(c, r[c.key])).join(""),
      ),
    )
    .join("")
  return tag(
    "div",
    { class: "tv-table", role: "region", "aria-label": p.caption, tabindex: 0 },
    tag(
      "table",
      { class: "tv-datatable", id: p.id },
      tag("caption", { class: "tv-datatable__caption" }, esc(p.caption)) +
        tag("thead", {}, tag("tr", {}, heads)) +
        tag("tbody", {}, body),
    ),
  )
}

/** Header sort: none, ascending, descending, none; numbers numerically, empty values last, ties and `none` in original order. */
export const TABLE_SORT_SCRIPT = `(function(){
function sortBy(th){var table=th.closest("table");var body=table.tBodies[0];var col=th.cellIndex;var cur=th.getAttribute("aria-sort");var next=cur==="none"?"ascending":cur==="ascending"?"descending":"none";var heads=table.querySelectorAll("th[aria-sort]");for(var i=0;i<heads.length;i++)heads[i].setAttribute("aria-sort","none");th.setAttribute("aria-sort",next);var numeric=th.getAttribute("data-kind")!=="text";var rows=[].slice.call(body.rows);function key(r){var c=r.cells[col];return c?c.getAttribute("data-sort"):""}
rows.sort(function(a,b){var ra=Number(a.getAttribute("data-row")),rb=Number(b.getAttribute("data-row"));if(next==="none")return ra-rb;var ka=key(a),kb=key(b);if(ka===""&&kb==="")return ra-rb;if(ka==="")return 1;if(kb==="")return -1;var d=numeric?Number(ka)-Number(kb):(ka<kb?-1:ka>kb?1:0);if(d===0)return ra-rb;return next==="ascending"?d:-d});
for(var j=0;j<rows.length;j++)body.appendChild(rows[j])}
document.addEventListener("click",function(ev){var b=ev.target&&ev.target.closest&&ev.target.closest(".tv-table__sort");if(b)sortBy(b.closest("th"))})})();`
