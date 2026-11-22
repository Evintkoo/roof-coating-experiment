// Report sheet R7: a statement the reader must not miss, in the flow. The tone is also a word (R5).
import { buildError, esc, oneOf, tag } from "../html"

export const CALLOUT_TONES = ["info", "caution", "limit"] as const
export type CalloutTone = (typeof CALLOUT_TONES)[number]
const WORDS: Record<CalloutTone, string> = {
  info: "Note",
  caution: "Caution",
  limit: "Limit",
}

export type CalloutProps = {
  tone: CalloutTone
  title?: string
  /** One paragraph, or several. */
  body: string | readonly string[]
}

export function callout(p: CalloutProps): string {
  const tone = oneOf("Callout", CALLOUT_TONES, p.tone)
  const paras = typeof p.body === "string" ? [p.body] : p.body
  if (
    paras.length === 0 ||
    paras.some((x) => typeof x !== "string" || x.trim() === "")
  )
    return buildError("Callout", "a callout needs a non-empty body")
  return tag(
    "div",
    {
      class: `tv-callout tv-callout--${tone}`,
      role: "note",
      "data-callout": tone,
    },
    tag("p", { class: "tv-callout__title" }, esc(p.title ?? WORDS[tone])) +
      paras.map((x) => tag("p", {}, esc(x))).join(""),
  )
}
