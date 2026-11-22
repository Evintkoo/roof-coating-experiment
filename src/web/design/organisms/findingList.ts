// Report sheet R17: the computed headline sentences as an ordered list, with their sources and first-use glossary links.
import { buildError, esc, tag } from "../html"
import { linkTerms } from "../terms"

export type FindingListItem = {
  id: string
  label?: string
  sentence: string
  sources?: readonly string[]
}
export type FindingListProps = {
  items: readonly FindingListItem[]
  /** Terms already linked on the page; shared across lists so each term links once. */
  seen?: Set<string>
}

const C = "FindingList"

export function findingList(p: FindingListProps): string {
  if (p.items.length === 0) return buildError(C, "a finding list needs items")
  const ids = new Set<string>()
  const seen = p.seen ?? new Set<string>()
  const lis = p.items.map((it) => {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(it.id) || ids.has(it.id))
      return buildError(C, "ids must be distinct plain identifiers")
    ids.add(it.id)
    if (typeof it.sentence !== "string" || it.sentence.trim() === "")
      return buildError(C, "a finding needs its sentence")
    const sources =
      it.sources && it.sources.length > 0
        ? tag(
            "span",
            { class: "tv-finding__src" },
            esc(`Source: ${it.sources.join(", ")}`),
          )
        : ""
    return tag(
      "li",
      { class: "tv-finding", id: `finding-${it.id}`, "data-finding": it.id },
      (it.label
        ? `${tag("strong", { class: "tv-finding__label" }, esc(it.label))} `
        : "") +
        tag(
          "span",
          { class: "tv-finding__text" },
          linkTerms(it.sentence, seen),
        ) +
        sources,
    )
  })
  return tag(
    "ol",
    { class: "tv-findings", "data-findings": true },
    lis.join(""),
  )
}
