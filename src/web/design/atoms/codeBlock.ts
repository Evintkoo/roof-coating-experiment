// Report sheet R3 (docs/design/report-sheets.md): exact technical text in the mono face. A block can overflow, so it is a
// focusable named region (keyboard scroll); inline is a <code> inside a sentence. Text is escaped, never interpreted.
import { esc, oneOf, tag } from "../html"

export const CODE_VARIANTS = ["block", "inline"] as const
export type CodeVariant = (typeof CODE_VARIANTS)[number]

export type CodeBlockProps = {
  code: string
  /** Accessible name of the block region (default "Code"). */
  label?: string
  variant?: CodeVariant
}

export function codeBlock(p: CodeBlockProps): string {
  const variant = oneOf("CodeBlock", CODE_VARIANTS, p.variant ?? "block")
  if (variant === "inline")
    return tag("code", { class: "tv-code tv-code--inline" }, esc(p.code))
  return tag(
    "pre",
    {
      class: "tv-code",
      tabindex: 0,
      role: "region",
      "aria-label": p.label ?? "Code",
    },
    tag("code", {}, esc(p.code)),
  )
}
