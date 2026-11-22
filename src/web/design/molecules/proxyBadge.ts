// Report sheet R4 (docs/design/report-sheets.md): the one way a caveat is attached to a value. Wraps the Badge atom with the
// fixed wording; the tone is required, so a caveat cannot be left out by omission (FR-4).
import { badge } from "../atoms/badge"
import { oneOf, tag } from "../html"

export const PROXY_TONES = ["proxy", "scenario", "nominal"] as const
export type ProxyTone = (typeof PROXY_TONES)[number]

const WORDS: Record<ProxyTone, string> = {
  proxy: "PROXY",
  scenario: "scenario",
  nominal: "nominal only",
}

export type ProxyBadgeProps = { tone: ProxyTone; label?: string }

export function proxyBadge(p: ProxyBadgeProps): string {
  const tone = oneOf("ProxyBadge", PROXY_TONES, p.tone)
  return tag(
    "span",
    { class: "tv-proxy", "data-proxy-badge": tone },
    badge({ tone, label: p.label ?? WORDS[tone] }),
  )
}
