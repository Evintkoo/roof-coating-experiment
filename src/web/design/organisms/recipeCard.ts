// Report sheet R16: one recipe with its numbers in a fixed order (R8). Summary for the hero, full for the Recipes section and the
// budget lookup.
import { LAYERS, ROLE_LABELS } from "../../../core/report/outline"
import { type BadgeProps, badge } from "../atoms/badge"
import { codeBlock } from "../atoms/codeBlock"
import { buildError, cls, esc, oneOf, tag } from "../html"
import type { ProxyTone } from "../molecules/proxyBadge"
import { stat } from "../molecules/stat"
import { dataTable } from "./dataTable"

export const RECIPE_ROLES = ["high_performing", "balanced", "low_cost"] as const
export const RECIPE_VARIANTS = ["summary", "full"] as const
export type RecipeRole = (typeof RECIPE_ROLES)[number]
export type RecipeVariant = (typeof RECIPE_VARIANTS)[number]

export type RecipeCooling = {
  value: number
  lo: number
  hi: number
  /** The shared scale of the comparison (K). */
  min: number
  max: number
  digits?: number
}
export type RecipeLayers = { primer: string; midcoat: string; topcoat: string }
export type RecipeMetric = {
  label: string
  value: number
  digits?: number
  unit?: string
  tone: ProxyTone
}

export type RecipeCardProps = {
  role: RecipeRole
  /** Replaces the plain-language role name as the heading (a budget recipe is named by its priority, not by a role). */
  roleLabel?: string
  /** The candidate id, for example SP-075. */
  name: string
  cooling: RecipeCooling
  /** Relative cost index (PROXY). */
  cost: { value: number; digits?: number }
  layers?: RecipeLayers
  metrics?: readonly RecipeMetric[]
  badges?: readonly BadgeProps[]
  recommended?: boolean
  variant?: RecipeVariant
  headingLevel?: 2 | 3 | 4
  /** Id of the layers table (default: derived from the name; give one when the same recipe is drawn twice on a page). */
  layersId?: string
}

const C = "RecipeCard"
const digitsOf = (d: number | undefined) =>
  d === undefined ? {} : { digits: d }

export function recipeCard(p: RecipeCardProps): string {
  const role = oneOf(C, RECIPE_ROLES, p.role)
  const variant = oneOf(C, RECIPE_VARIANTS, p.variant ?? "summary")
  const level = p.headingLevel ?? 3
  if (![2, 3, 4].includes(level))
    return buildError(C, "headingLevel is 2, 3 or 4")
  if (typeof p.name !== "string" || p.name.trim() === "")
    return buildError(C, "a recipe needs its id")
  if (variant === "full" && p.layers === undefined)
    return buildError(C, "the full card needs its layers")
  const head = tag(
    "header",
    { class: "tv-recipe__head" },
    tag(
      `h${level}`,
      { class: "tv-recipe__role" },
      esc(p.roleLabel ?? ROLE_LABELS[role]),
    ) +
      (p.recommended
        ? badge({ tone: "neutral", label: "Shown in the climate section" })
        : "") +
      codeBlock({ code: p.name, variant: "inline", label: "Recipe" }),
  )
  const numbers =
    stat({
      label: "Cooler than bare aluminium",
      value: p.cooling.value,
      unit: "K",
      tone: "interval",
      interval: { lo: p.cooling.lo, hi: p.cooling.hi },
      axis: { min: p.cooling.min, max: p.cooling.max },
      ...digitsOf(p.cooling.digits),
    }) +
    stat({
      label: "Cost position (relative)",
      value: p.cost.value,
      tone: "proxy",
      ...digitsOf(p.cost.digits),
    })
  const extra =
    variant === "full"
      ? (p.metrics ?? [])
          .map((m) =>
            stat({
              label: m.label,
              value: m.value,
              tone: m.tone,
              ...digitsOf(m.digits),
              ...(m.unit === undefined ? {} : { unit: m.unit }),
            }),
          )
          .join("")
      : ""
  const badges = (p.badges ?? []).map((b) => badge(b)).join("")
  const layerList =
    variant === "full" && p.layers !== undefined
      ? dataTable({
          id:
            p.layersId ??
            `layers-${p.name.replace(/[^A-Za-z0-9_-]/g, "") || "recipe"}`,
          caption: "Layers from the metal up",
          columns: [
            { key: "layer", label: "Layer", kind: "text", rowHeader: true },
            { key: "composition", label: "Composition", kind: "text" },
            { key: "thickness", label: "Thickness", kind: "text" },
          ],
          rows: LAYERS.map((l) => {
            const s = (p.layers as RecipeLayers)[l.id]
            const cut = s.lastIndexOf(", ")
            return {
              layer: l.title,
              composition: cut < 0 ? s : s.slice(0, cut),
              thickness: cut < 0 ? "" : s.slice(cut + 2),
            }
          }),
        })
      : ""
  return tag(
    "article",
    {
      class: cls(
        "tv-recipe",
        `tv-recipe--${variant}`,
        p.recommended && "tv-recipe--recommended",
      ),
      "data-recipe": true,
      "data-role": role,
    },
    head +
      numbers +
      extra +
      (badges ? tag("p", { class: "tv-recipe__badges" }, badges) : "") +
      layerList,
  )
}
