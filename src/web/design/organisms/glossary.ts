// Report sheet R19: the glossary as a description list, anchors from terms.ts (`glossary-<id>`).
import { buildError, esc, tag } from "../html"
import { GLOSSARY, type GlossaryEntry } from "../terms"

export type GlossaryProps = { entries?: readonly GlossaryEntry[] }

const C = "Glossary"

export function glossary(p: GlossaryProps): string {
  const entries = p.entries ?? GLOSSARY
  if (entries.length === 0) return buildError(C, "a glossary needs entries")
  const ids = new Set<string>()
  for (const e of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(e.id) || ids.has(e.id))
      return buildError(C, "entry ids must be distinct plain identifiers")
    ids.add(e.id)
    for (const f of [e.label, e.definition, e.unit, e.meaning])
      if (typeof f !== "string" || f.trim() === "")
        return buildError(C, "every glossary field is required")
  }
  const sorted = [...entries].sort((a, b) =>
    a.label.toLowerCase() < b.label.toLowerCase()
      ? -1
      : a.label.toLowerCase() > b.label.toLowerCase()
        ? 1
        : 0,
  )
  const items = sorted
    .map((e) =>
      tag(
        "div",
        { class: "tv-glossary__entry" },
        tag("dt", { id: `glossary-${e.id}` }, esc(e.label)) +
          tag(
            "dd",
            {},
            tag("p", {}, esc(e.definition)) +
              tag("p", { class: "tv-glossary__unit" }, esc(`Unit: ${e.unit}`)) +
              tag("p", {}, esc(e.meaning)),
          ),
      ),
    )
    .join("")
  return tag(
    "div",
    { class: "tv-glossary", "data-glossary": true },
    tag("dl", { class: "tv-glossary__list" }, items),
  )
}
