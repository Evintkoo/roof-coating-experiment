// Report sheet R1 (docs/design/report-sheets.md): the structural honesty label. One inline span; the label is required text so
// the meaning never rests on colour alone, and the tone is in `data-tone` so every badge can be found (H8).
import { SpandekError } from "../../../core/errors"
import { esc, oneOf, tag } from "../html"

export const BADGE_TONES = [
  "proxy",
  "scenario",
  "nominal",
  "neutral",
  "go",
  "stop",
] as const
export type BadgeTone = (typeof BADGE_TONES)[number]

export type BadgeProps = { tone: BadgeTone; label: string }

export function badge(p: BadgeProps): string {
  const tone = oneOf("Badge", BADGE_TONES, p.tone)
  if (typeof p.label !== "string" || p.label.trim() === "")
    throw new SpandekError(
      4,
      "design.component",
      "Badge",
      "a badge needs a visible label",
    )
  return tag(
    "span",
    { class: `tv-badge tv-badge--${tone}`, "data-tone": tone },
    esc(p.label),
  )
}
