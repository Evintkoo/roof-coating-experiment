// Report sheet R15: the first screen. Verdict (the page's h1), the three recipes with number, interval and cost, the honesty
// statement and the limits link, all visible with every disclosure closed.
import { ROLE_LABELS } from "../../../core/report/outline"
import { badge } from "../atoms/badge"
import { button } from "../atoms/button"
import { codeBlock } from "../atoms/codeBlock"
import { sectionLabel } from "../atoms/sectionLabel"
import { buildError, cls, esc, oneOf, tag } from "../html"
import { callout } from "../molecules/callout"
import { stat } from "../molecules/stat"

export const RECIPE_ROLES = ["high_performing", "balanced", "low_cost"] as const
export type RecipeRole = (typeof RECIPE_ROLES)[number]

export type RecipeCooling = {
  value: number
  lo: number
  hi: number
  /** The shared scale of the comparison (K). */
  min: number
  max: number
  digits?: number
}
export type HeroRecipe = {
  role: RecipeRole
  /** The candidate id, for example SP-075. */
  name: string
  cooling: RecipeCooling
  /** Relative cost index (PROXY). */
  cost: { value: number; digits?: number }
  recommended?: boolean
}
export type Recipe3 = readonly [HeroRecipe, HeroRecipe, HeroRecipe]

export type HeroVerdictProps = {
  verdict: string
  lead?: string
  eyebrow?: string
  recipes: Recipe3
  honesty: string
  limitsHref: string
  limitsText?: string
  id?: string
}

const C = "HeroVerdict"

function recipeSummary(r: HeroRecipe, level: 2 | 3): string {
  const role = oneOf("RecipeCard", RECIPE_ROLES, r.role)
  return tag(
    "article",
    {
      class: cls(
        "tv-recipe",
        "tv-recipe--summary",
        r.recommended && "tv-recipe--recommended",
      ),
      "data-recipe": true,
      "data-role": role,
    },
    tag(
      "header",
      { class: "tv-recipe__head" },
      tag(`h${level}`, { class: "tv-recipe__role" }, esc(ROLE_LABELS[role])) +
        (r.recommended ? badge({ tone: "go", label: "Recommended" }) : "") +
        codeBlock({ code: r.name, variant: "inline", label: "Recipe" }),
    ) +
      stat({
        label: "Cooler than bare aluminium",
        value: r.cooling.value,
        unit: "K",
        tone: "interval",
        interval: { lo: r.cooling.lo, hi: r.cooling.hi },
        axis: { min: r.cooling.min, max: r.cooling.max },
        ...(r.cooling.digits === undefined ? {} : { digits: r.cooling.digits }),
      }) +
      stat({
        label: "Cost position (relative)",
        value: r.cost.value,
        tone: "proxy",
        ...(r.cost.digits === undefined ? {} : { digits: r.cost.digits }),
      }),
  )
}

export function heroVerdict(p: HeroVerdictProps): string {
  if (typeof p.verdict !== "string" || p.verdict.trim() === "")
    return buildError(C, "a verdict sentence is required")
  if (typeof p.honesty !== "string" || p.honesty.trim() === "")
    return buildError(C, "the honesty statement is required")
  if (
    p.recipes.length !== 3 ||
    new Set(p.recipes.map((r) => r.role)).size !== 3
  )
    return buildError(C, "exactly three recipes, one per role")
  for (const r of p.recipes) oneOf(C, RECIPE_ROLES, r.role)
  if (p.recipes.filter((r) => r.recommended).length > 1)
    return buildError(C, "at most one recipe is recommended (one accent)")
  const id = p.id ?? "verdict"
  const cards = p.recipes.map((r) => recipeSummary(r, 2)).join("")
  return tag(
    "section",
    {
      class: "tv-hero",
      id,
      "data-hero": true,
      "aria-labelledby": `${id}-title`,
    },
    (p.eyebrow ? sectionLabel({ label: p.eyebrow, variant: "accent" }) : "") +
      tag(
        "h1",
        {
          class: "tv-hero__verdict",
          id: `${id}-title`,
          "data-hero-verdict": true,
        },
        esc(p.verdict),
      ) +
      (p.lead ? tag("p", { class: "tv-hero__lead" }, esc(p.lead)) : "") +
      tag("div", { class: "tv-hero__recipes" }, cards) +
      tag(
        "div",
        { class: "tv-hero__honesty", "data-honesty": true },
        callout({ tone: "caution", title: "Read this first", body: p.honesty }),
      ) +
      tag(
        "p",
        { class: "tv-hero__limits" },
        button({
          label: p.limitsText ?? "Limits: what these models cannot say",
          href: p.limitsHref,
          variant: "ghost",
        }),
      ),
  )
}
