// Report sheet R21: per-site benefit as small multiples on one shared axis, initial (PROXY) against aged (scenario), the loss
// range, and the data caveats next to the numbers.
import { chip } from "../atoms/chip"
import { buildError, esc, finite, fixed, tag } from "../html"
import { callout } from "../molecules/callout"
import { proxyBadge } from "../molecules/proxyBadge"
import { stat } from "../molecules/stat"

export type Estimate = { value: number; lo: number; hi: number }
export type SiteBenefit = {
  id: string
  name: string
  initial: Estimate
  aged: Estimate
}
export type SiteCaveat = { id: string; site?: string; text: string }

export type SiteBenefitPanelProps = {
  sites: readonly SiteBenefit[]
  /** The one scale of every bar. */
  axis: { min: number; max: number }
  /** The name of the ageing scenario, shown on a Chip above each aged value. */
  scenario: string
  /** The range of benefit lost under the scenario, in percent. */
  loss: { lo: number; hi: number }
  caveats?: readonly SiteCaveat[]
  unit?: string
  digits?: number
  id?: string
  headingLevel?: 3 | 4
}

const C = "SiteBenefitPanel"
const ID = /^[A-Za-z][A-Za-z0-9_-]*$/

export function siteBenefitPanel(p: SiteBenefitPanelProps): string {
  const id = p.id ?? "sites"
  if (!ID.test(id)) return buildError(C, "id must be a plain identifier")
  const level = p.headingLevel ?? 3
  if (level !== 3 && level !== 4) return buildError(C, "headingLevel is 3 or 4")
  if (typeof p.scenario !== "string" || p.scenario.trim() === "")
    return buildError(C, "the scenario needs a name")
  if (p.sites.length === 0) return buildError(C, "a panel needs sites")
  const lo = finite(C, "loss.lo", p.loss.lo)
  const hi = finite(C, "loss.hi", p.loss.hi)
  if (!(0 <= lo && lo <= hi && hi <= 100))
    return buildError(C, "the loss range is 0 <= lo <= hi <= 100")
  const unit = p.unit ?? "W/m²"
  const digits = p.digits ?? 1
  const names = new Map<string, string>()
  for (const s of p.sites) {
    if (!ID.test(s.id) || names.has(s.id))
      return buildError(C, "site ids must be distinct plain identifiers")
    if (typeof s.name !== "string" || s.name.trim() === "")
      return buildError(C, "a site needs a name")
    names.set(s.id, s.name)
  }
  for (const c of p.caveats ?? []) {
    if (c.site !== undefined && !names.has(c.site))
      return buildError(C, "a caveat names a site that is not in the panel")
  }
  const cards = p.sites
    .map((s) =>
      tag(
        "article",
        { class: "tv-site", "data-site": s.id },
        tag(`h${level}`, { class: "tv-site__name" }, esc(s.name)) +
          stat({
            label: "Initial (as applied)",
            value: s.initial.value,
            unit,
            digits,
            tone: "proxy",
            interval: { lo: s.initial.lo, hi: s.initial.hi },
            axis: p.axis,
          }) +
          tag(
            "p",
            { class: "tv-site__scenario" },
            chip({ label: p.scenario }),
          ) +
          stat({
            label: "Aged",
            value: s.aged.value,
            unit,
            digits,
            tone: "scenario",
            interval: { lo: s.aged.lo, hi: s.aged.hi },
            axis: p.axis,
          }),
      ),
    )
    .join("")
  const lossLine = tag(
    "p",
    { class: "tv-sites__loss" },
    `${esc(`Under the ageing scenario a recipe loses ${fixed(C, lo, 0)} to ${fixed(C, hi, 0)} % of its initial benefit (a scenario range, not a forecast). `)}${proxyBadge({ tone: "scenario" })}`,
  )
  const caveats =
    p.caveats === undefined || p.caveats.length === 0
      ? ""
      : tag(
          "div",
          { class: "tv-sites__caveats", "data-caveats": true },
          p.caveats
            .map((c) =>
              callout({
                tone: "caution",
                title:
                  c.site === undefined
                    ? "Data note"
                    : (names.get(c.site) as string),
                body: c.text,
              }),
            )
            .join(""),
        )
  return tag(
    "section",
    { class: "tv-sites", id, "data-site-panel": true },
    tag("div", { class: "tv-sites__grid" }, cards) + lossLine + caveats,
  )
}
