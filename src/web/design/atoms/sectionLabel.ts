// Sheet A4: the small all-caps eyebrow above a heading. Casing is CSS only, so the text stays sentence case for screen
// readers. The vendor accent is `action-primary`; as text on the light theme that is 2.71:1, so the accent variant uses the
// contract-tested `link` ink (the same orange on dark).
import { cls, esc, oneOf, tag } from "../html"

export const SECTION_LABEL_VARIANTS = ["muted", "accent"] as const
export type SectionLabelVariant = (typeof SECTION_LABEL_VARIANTS)[number]

export type SectionLabelProps = {
  label: string
  variant?: SectionLabelVariant
  id?: string
}

export function sectionLabel(p: SectionLabelProps): string {
  const variant = oneOf(
    "SectionLabel",
    SECTION_LABEL_VARIANTS,
    p.variant ?? "muted",
  )
  return tag(
    "p",
    {
      id: p.id,
      class: cls(
        "tv-section-label",
        variant === "accent" && "tv-section-label--accent",
      ),
    },
    esc(p.label),
  )
}
