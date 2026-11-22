// Plan 06 Task 5: the controlled term list and the glossary, as data. A translation is another table of the same shape
// (BLOCKED-12), not a code change. Browser-safe and Node-safe: its only import is the pure escape helper.
import { esc } from "./html"

export type GlossaryEntry = {
  /** Stable id; the anchor is `glossary-<id>`. */
  id: string
  /** The term as the reader sees it. */
  label: string
  /** Lower-case phrases that count as a use of the term in running text. */
  matches: readonly string[]
  /** What it is, in plain language. */
  definition: string
  /** The unit, or "none" when the quantity has no unit. */
  unit: string
  /** What the number means for a roof owner (and what it does not mean). */
  meaning: string
}

export const GLOSSARY_LOCALE = "en"

export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "solar-reflectance",
    label: "Solar reflectance",
    matches: ["solar reflectance"],
    definition:
      "The share of the sun's energy that the surface bounces back instead of absorbing, from 0 (none) to 1 (all).",
    unit: "none (a fraction between 0 and 1)",
    meaning:
      "A higher value means less sunlight turns into heat in the roof. Here it is a model prediction for the freshly applied coating, not a lab reading.",
  },
  {
    id: "peak-surface-temperature",
    label: "Peak surface temperature",
    matches: ["peak surface temperature"],
    definition:
      "The hottest temperature the roof surface reaches during a modelled sunny day, averaged over nine weather scenarios unless stated.",
    unit: "degrees Celsius (°C); differences in kelvin (K), where 1 K equals 1 °C",
    meaning:
      "Lower is cooler to the touch and sends less heat into the building. A cooling number such as 14 K is the drop against bare aluminium in the same weather.",
  },
  {
    id: "bare-aluminium",
    label: "Bare aluminium",
    matches: ["bare aluminium", "bare aluminum"],
    definition:
      "Uncoated mill-finish aluminium sheet, the reference every recipe is compared with.",
    unit: "none",
    meaning:
      "Its optical properties are a nominal scenario value, because the sheet itself has not been measured, so a cooling number inherits that caveat.",
  },
  {
    id: "proxy-index",
    label: "PROXY index",
    matches: ["proxy index", "proxy indices", "proxy"],
    definition:
      "A relative ranking score between 0 and 1 from an uncalibrated model, used where no established physical model exists (corrosion, delamination, cost).",
    unit: "none (a relative index, higher means more of the thing named)",
    meaning:
      "Use it to compare recipes with each other. It is not a measurement and not a probability that the coating will fail.",
  },
  {
    id: "parameter-uncertainty",
    label: "Parameter uncertainty",
    matches: ["parameter uncertainty"],
    definition:
      "The spread of a prediction when the model's uncertain inputs are varied within their stated ranges (the 5th to 95th percentile).",
    unit: "same unit as the number it surrounds",
    meaning:
      "It shows how sure the model is of itself only. It does not include weathering, workmanship or errors in the model's structure, so the real spread is wider.",
  },
  {
    id: "nominal-only",
    label: "Nominal only",
    matches: ["nominal only"],
    definition:
      "A value computed once at the central input settings, with no interval attached.",
    unit: "same unit as the number",
    meaning:
      "Treat it as a ranking aid. How far it could move is not known from this run.",
  },
  {
    id: "scenario-ageing",
    label: "Scenario ageing",
    matches: ["scenario ageing", "ageing scenario"],
    definition:
      "A labelled what-if in which the coating loses part of its solar reflectance to dirt and weathering, using a range from published three-year US field pairs.",
    unit: "fraction of solar reflectance lost (0.14 to 0.26)",
    meaning:
      "It shows how much of the benefit could fade. It is not an Indonesian measurement, and the humid tropics may be worse.",
  },
  {
    id: "shortlist",
    label: "Shortlist",
    matches: ["shortlist", "shortlisted"],
    definition:
      "The three recipes picked from the 96 screened candidates, one each for cooling, balance and cost, with the Pareto front as the pool.",
    unit: "none",
    meaning:
      "These are the recipes worth testing first in the lab, candidates that still have to be tested.",
  },
  {
    id: "pareto",
    label: "Pareto front",
    matches: ["pareto front", "pareto"],
    definition:
      "The recipes that no other recipe beats on every objective at once; improving one of them means giving something up on another.",
    unit: "none",
    meaning:
      "Choosing among them is a trade-off decision (cooling against durability against cost), not a search for one right answer.",
  },
  {
    id: "dft-thickness",
    label: "Dry film thickness (DFT)",
    matches: ["dry film thickness", "dft"],
    definition:
      "How thick a layer is after it has dried, measured in micrometres.",
    unit: "micrometres (µm); 1 µm is a thousandth of a millimetre",
    meaning:
      "It tells the applicator how much coating to put on per layer; the midcoat is far thicker than the primer and topcoat.",
  },
  {
    id: "relative-cost-units",
    label: "Relative cost units",
    matches: [
      "relative cost units",
      "relative cost index",
      "relative cost unit",
    ],
    definition:
      "A cost score from 0 to 1 built from ingredient amounts and relative prices, with 0 the cheapest and 1 the dearest recipe in range.",
    unit: "relative units (not rupiah)",
    meaning:
      "It ranks recipes by cost. It is not a price per square metre, and a currency price needs supplier quotes.",
  },
  {
    id: "knee-budget",
    label: "Knee budget",
    matches: ["knee budget", "the knee", "knee"],
    definition:
      "The cost at which a bigger budget stops buying much more cooling: 95 % of the gain from the cheapest to the dearest recipe is reached.",
    unit: "relative cost units",
    meaning:
      "A sensible spending ceiling in the model. Beyond it, extra cost buys little.",
  },
  {
    id: "heat-flux",
    label: "Heat flux into the building",
    matches: ["heat flux"],
    definition:
      "The average rate at which heat passes through the roof surface into the space below, per square metre.",
    unit: "watts per square metre (W/m²)",
    meaning:
      "A benefit of 15 W/m² means 15 watts less heat enters through each square metre of roof compared with bare aluminium.",
  },
  {
    id: "weather-data",
    label: "TMYx and NASA POWER weather",
    matches: ["tmyx", "nasa power", "weather"],
    definition:
      "Ten years of hourly sun and temperature records for five Indonesian sites: NASA POWER satellite-based estimates, cross-checked against TMYx typical-year files.",
    unit: "irradiance in W/m², temperature in °C",
    meaning:
      "The climate numbers come from a model of the weather, not from a weather station on your roof.",
  },
] as const

const BY_ID = new Map(GLOSSARY.map((g) => [g.id, g]))

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const PATTERNS = GLOSSARY.map((g) => ({
  id: g.id,
  re: new RegExp(
    `(?<![A-Za-z0-9])(?:${[...g.matches]
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join("|")})(?![A-Za-z0-9])`,
    "i",
  ),
}))

/** Ids of the controlled terms used in `text`, in order of first use. */
export function termsIn(text: string): string[] {
  const hits: { id: string; at: number }[] = []
  for (const p of PATTERNS) {
    const m = p.re.exec(text)
    if (m) hits.push({ id: p.id, at: m.index })
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.id)
}

export function glossaryEntry(term: string): GlossaryEntry {
  const e = BY_ID.get(term)
  if (e === undefined) throw new Error(`unknown glossary term: ${term}`)
  return e
}

/** The anchor id of a term's glossary entry (no leading #). */
export function glossaryAnchor(term: string): string {
  return `glossary-${glossaryEntry(term).id}`
}

/** The in-page link to a term's glossary entry. */
export function glossaryLink(term: string): string {
  return `#${glossaryAnchor(term)}`
}

/**
 * `text` as escaped HTML in which the first use of each controlled term not yet in `seen` is an anchor to its glossary entry
 * (FR-8, H14). `seen` is updated, so one set shared across a page links each term once.
 */
export function linkTerms(text: string, seen: Set<string>): string {
  const spans: { start: number; end: number; id: string }[] = []
  for (const p of PATTERNS) {
    if (seen.has(p.id)) continue
    const m = p.re.exec(text)
    if (m) spans.push({ start: m.index, end: m.index + m[0].length, id: p.id })
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end)
  let out = ""
  let at = 0
  for (const s of spans) {
    if (s.start < at) continue // overlaps an earlier link: it stays plain text
    out += esc(text.slice(at, s.start))
    out += `<a class="tv-term" href="${glossaryLink(s.id)}">${esc(text.slice(s.start, s.end))}</a>`
    seen.add(s.id)
    at = s.end
  }
  return out + esc(text.slice(at))
}
