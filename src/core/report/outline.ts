// Plan 06 Task 5: the plain-language outline of the report's reading path as data (no HTML here). Section titles follow
// FR-2; the page template (Task 6) renders them.

export type OutlineSection = {
  id: string
  title: string
  /** The reader's question the section answers (R8: the page follows questions, not the pipeline). */
  question: string
  /** True when the section is omitted if its result files are absent (refine, budget, indonesia). */
  optional: boolean
}

export const OUTLINE: readonly OutlineSection[] = [
  {
    id: "verdict",
    title: "Verdict",
    question: "Which coating, how much cooler, how sure?",
    optional: false,
  },
  {
    id: "recipes",
    title: "Recipes",
    question: "What are the three recommended recipes and how do they differ?",
    optional: false,
  },
  {
    id: "why",
    title: "Why it works",
    question: "What do the three layers do?",
    optional: false,
  },
  {
    id: "climate",
    title: "Indonesian climate",
    question: "How much does it help at five Indonesian sites?",
    optional: true,
  },
  {
    id: "budget",
    title: "Budget",
    question: "What does a bigger budget buy?",
    optional: true,
  },
  {
    id: "explore",
    title: "Explore all 96",
    question: "What else was screened?",
    optional: false,
  },
  {
    id: "limits",
    title: "Method and limits",
    question: "What do the numbers not tell me?",
    optional: false,
  },
  {
    id: "provenance",
    title: "Provenance",
    question: "Which run produced this page?",
    optional: false,
  },
]

/** Plain-language role names (the code roles are high_performing, balanced, low_cost). */
export const ROLE_LABELS = {
  high_performing: "Best cooling",
  balanced: "Balanced",
  low_cost: "Lowest cost",
} as const

export const ROLE_BLURBS = {
  high_performing: "Chosen for the largest modelled drop in roof temperature.",
  balanced: "Chosen to trade cooling, durability and cost evenly.",
  low_cost: "Chosen for the lowest relative cost while still cooling the roof.",
} as const

export type Layer = {
  id: "primer" | "midcoat" | "topcoat"
  title: string
  why: string
}

/** One sentence each: what the layer is for, in the order from the metal outwards. */
export const LAYERS: readonly Layer[] = [
  {
    id: "primer",
    title: "Primer",
    why: "A thin sol-gel layer that bonds the coating to the aluminium and, in the models, acts as the moisture barrier for the metal.",
  },
  {
    id: "midcoat",
    title: "Midcoat",
    why: "A thick white layer of titanium dioxide and barium sulfate particles that scatters sunlight back, which is the layer that mainly sets the solar reflectance in the models.",
  },
  {
    id: "topcoat",
    title: "Topcoat",
    why: "A very thin sol-gel skin that is meant to shed water; the models rate this with a wetting PROXY index, not a measurement.",
  },
]

/** The honesty statement shown on the first screen and kept visible when disclosures are closed (H9). */
export const HONESTY_STATEMENT =
  "These are model predictions for a freshly applied coating on bare aluminium, not a laboratory result and not a field measurement. Intervals show parameter uncertainty only. Every PROXY index is a relative ranking, not a measurement and not a probability. Ageing appears only as a labelled scenario."

export const LIMITS_LINK_TEXT = "Limits"
export const LIMITS_HREF = "#limits"

/** Page-wide forbidden wording ("proven" is word-bounded: the FR-2 section "Provenance" must not trip it): plan 00 honesty list, plan 04 additions, and the plan 06 words (ranks, not measures). */
export const OVERCLAIM_PATTERN =
  /\bproven\b|\bsafe\b|guarantee|\bbest\b|\bproves?\b|\bworks\b|validated|ground[- ]truth|station[- ]measured|measured in Indonesia|field[- ]tested|real[- ]world performance|\d+\s*%\s*(safe|aman|self-clean)/i

/** Exact labels the scan lets through: a role name and a section title fixed by the plan (FR-2), not claims. */
export const ALLOWED_LABELS: readonly string[] = [
  "Best cooling",
  "Why it works",
]

/** `text` with the allowed labels removed, ready for OVERCLAIM_PATTERN. */
export function withoutAllowedLabels(text: string): string {
  let t = text
  for (const l of ALLOWED_LABELS) t = t.split(l).join(" ")
  return t
}
