// Sheet A7 (and house rule 10): one glyph from the sliced brand asset set, decorative by definition; the labelled element
// carries the accessible name. The vectors come from the vendored code twin (vendor/torviello-design/brand/icons.ts, drift-
// checked by the vendor manifest), never from a path written here. Colour is `currentColor`; size is the consumer's job.
import { icons } from "../../../../vendor/torviello-design/brand/icons"
import { failState } from "../html"

export type IconName = keyof typeof icons
export const ICON_NAMES = Object.keys(icons) as readonly IconName[]

export type IconProps = { name: IconName }

export function icon(p: IconProps): string {
  const svg = Object.hasOwn(icons, p.name) ? icons[p.name] : undefined
  if (svg === undefined) return failState("Icon", p.name as never)
  return `<span class="tv-icon" aria-hidden="true">${svg.replace("<svg ", '<svg focusable="false" ')}</span>`
}
