// Report sheet R22: budget (number box and slider), priority profile, and the tabulated recipe at or below the budget. The lookup
// is a callback so the design layer stays pure; `budgetResult` is the one renderer for build time and the browser.
import { chip } from "../atoms/chip"
import { buildError, esc, finite, fixed, tag } from "../html"
import { callout } from "../molecules/callout"
import { sliderField, snapToBounds } from "../molecules/sliderField"
import { type RecipeCardProps, recipeCard } from "./recipeCard"

export const BUDGET_UNIT = "relative cost units (not IDR)"

export type BudgetLookupResult =
  | {
      status: "ok"
      cost: number
      headroom: number
      knee?: number
      recipe: RecipeCardProps
    }
  | { status: "infeasible"; c_min: number }
export type BudgetLookup = (
  profile: string,
  budget: number,
) => BudgetLookupResult

export type BudgetPanelProps = {
  id: string
  profiles: readonly { id: string; label: string }[]
  profile: string
  budget: { min: number; max: number; step: number; value: number }
  lookup: BudgetLookup
  unit?: string
  digits?: number
}

const C = "BudgetPanel"
const ID = /^[A-Za-z][A-Za-z0-9_-]*$/

/** The result region's content. */
export function budgetResult(
  r: BudgetLookupResult,
  o: { digits: number; id?: string },
): string {
  if (r === null || typeof r !== "object")
    return buildError(C, "the lookup returned nothing")
  if (r.status === "infeasible") {
    const cMin = finite(C, "c_min", r.c_min)
    if (cMin < 0) return buildError(C, "c_min must not be negative")
    return callout({
      tone: "caution",
      title: "No recipe at this budget",
      body: `The cheapest tabulated recipe costs ${fixed(C, cMin, o.digits)} ${BUDGET_UNIT}. Raise the budget to see a recipe.`,
    })
  }
  if (r.status !== "ok")
    return buildError(C, "the lookup returned an unknown status")
  const cost = fixed(C, finite(C, "cost", r.cost), o.digits)
  const head = fixed(C, finite(C, "headroom", r.headroom), o.digits)
  const knee =
    r.knee === undefined
      ? ""
      : `; knee of the curve at ${fixed(C, finite(C, "knee", r.knee), o.digits)}`
  return (
    tag(
      "p",
      { class: "tv-budget__sentence" },
      esc(
        `Recipe of the tabulated budget at or below the one chosen: cost ${cost} ${BUDGET_UNIT}, unspent headroom ${head}${knee}.`,
      ),
    ) +
    recipeCard({
      ...r.recipe,
      variant: "full",
      ...(o.id === undefined ? {} : { layersId: `${o.id}-layers` }),
    })
  )
}

export function budgetPanel(p: BudgetPanelProps): string {
  if (!ID.test(p.id)) return buildError(C, "id must be a plain identifier")
  if (p.profiles.length === 0) return buildError(C, "a panel needs profiles")
  const ids = new Set<string>()
  for (const pr of p.profiles) {
    if (!ID.test(pr.id) || ids.has(pr.id))
      return buildError(C, "profile ids must be distinct plain identifiers")
    ids.add(pr.id)
  }
  if (!ids.has(p.profile))
    return buildError(C, "the selected profile is not in the list")
  const digits = p.digits ?? 2
  const slider = sliderField({
    id: `${p.id}-budget`,
    label: "Budget",
    unit: p.unit ?? BUDGET_UNIT,
    ...p.budget,
    digits,
    numberInput: true,
  })
  const chips = p.profiles
    .map((pr) =>
      chip({
        label: pr.label,
        value: pr.id,
        state: pr.id === p.profile ? "on" : "off",
      }),
    )
    .join("")
  const result = budgetResult(p.lookup(p.profile, p.budget.value), {
    digits,
    id: p.id,
  })
  return tag(
    "section",
    {
      class: "tv-budget",
      id: p.id,
      "data-budget": true,
      "data-profile": p.profile,
      "data-digits": digits,
    },
    (p.profiles.length > 1
      ? tag(
          "fieldset",
          { class: "tv-budget__profiles" },
          tag("legend", {}, "Priority") +
            tag("div", { class: "tv-budget__chips" }, chips),
        )
      : "") +
      slider +
      tag(
        "div",
        {
          class: "tv-budget__result",
          role: "status",
          "aria-live": "polite",
          "aria-atomic": "true",
          "data-budget-result": true,
        },
        result,
      ),
  )
}

/**
 * Browser only: re-renders the result region when the slider changes (`slider-change`, see SLIDER_SCRIPT) or a profile chip
 * is pressed, keeping exactly one chip pressed. The lookup is the same callback the build used.
 */
export function mountBudgetPanel(
  root: HTMLElement,
  lookup: BudgetLookup,
): void {
  const digits = Number(root.dataset.digits ?? "2")
  const region = root.querySelector("[data-budget-result]")
  const range = root.querySelector(
    'input[type="range"]',
  ) as HTMLInputElement | null
  if (!region || !range) throw new Error("budget panel: markup not found")
  const update = (budget: number) => {
    try {
      region.innerHTML = budgetResult(
        lookup(root.dataset.profile ?? "", budget),
        { digits, ...(root.id ? { id: root.id } : {}) },
      )
    } catch {
      region.innerHTML = callout({
        tone: "caution",
        title: "Lookup unavailable",
        body: "The budget lookup could not run for this choice.",
      })
    }
  }
  root.addEventListener("slider-change", (e) =>
    update((e as CustomEvent<{ value: number }>).detail.value),
  )
  root.addEventListener("click", (e) => {
    const btn = (e.target as Element | null)?.closest?.(
      ".tv-chip--toggle",
    ) as HTMLElement | null
    if (!btn || !root.contains(btn)) return
    for (const c of root.querySelectorAll(".tv-chip--toggle"))
      c.setAttribute("aria-pressed", c === btn ? "true" : "false")
    root.dataset.profile = btn.dataset.value ?? ""
    update(
      snapToBounds(Number(range.value), Number(range.min), Number(range.max)),
    )
  })
}
