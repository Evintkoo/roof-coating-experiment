// Report sheet R15: the first screen. Verdict (the page's h1), the three recipes with number, interval and cost, the honesty
// statement and the limits link, all visible with every disclosure closed.
import { button } from "../atoms/button"
import { sectionLabel } from "../atoms/sectionLabel"
import { buildError, esc, oneOf, tag } from "../html"
import { callout } from "../molecules/callout"
import { linkTerms } from "../terms"
import { RECIPE_ROLES, type RecipeCardProps, recipeCard } from "./recipeCard"

export type HeroRecipe = Omit<
  RecipeCardProps,
  "variant" | "headingLevel" | "layers" | "metrics"
>
export type Recipe3 = readonly [HeroRecipe, HeroRecipe, HeroRecipe]

export type HeroVerdictProps = {
  verdict: string
  lead?: string
  /** What the shared cooling axis is (it starts above zero), shown beneath the three cards. */
  axisNote?: string
  /** One sentence that qualifies the cost positions of the cards, shown beneath them. */
  costNote?: string
  /** Terms already linked on the page; the lead and the notes link each controlled term once through it. */
  seen?: Set<string>
  eyebrow?: string
  recipes: Recipe3
  honesty: string
  limitsHref: string
  limitsText?: string
  id?: string
}

const C = "HeroVerdict"

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
  const seen = p.seen ?? new Set<string>()
  const para = (cls: string, text: string | undefined) =>
    text ? tag("p", { class: cls }, linkTerms(text, seen)) : ""
  const cards = p.recipes
    .map((r) => recipeCard({ ...r, variant: "summary", headingLevel: 2 }))
    .join("")
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
      para("tv-hero__lead", p.lead) +
      tag("div", { class: "tv-hero__recipes" }, cards) +
      para("tv-hero__note", p.axisNote) +
      para("tv-hero__note", p.costNote) +
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
