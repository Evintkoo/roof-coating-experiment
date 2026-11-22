// The organisms part of the component gallery (FR-11, D9): every organism in every state, built by the same functions the report
// uses. A fragment, not a page. Browser and Node safe.
import { type BudgetTable, lookupBudget } from "../../../core/opt/budgetTable"
import { esc } from "../html"
import { budgetPanel } from "../organisms/budgetPanel"
import { dataTable } from "../organisms/dataTable"
import { findingList } from "../organisms/findingList"
import { glossary } from "../organisms/glossary"
import { type HeroRecipe, heroVerdict } from "../organisms/heroVerdict"
import { navRail } from "../organisms/navRail"
import { provenance } from "../organisms/provenance"
import { type RecipeCardProps, recipeCard } from "../organisms/recipeCard"
import { siteBenefitPanel } from "../organisms/siteBenefitPanel"
import { tv } from "../tokens"
import type { GalleryCell } from "./galleryAtoms"

const t = tv
export const GALLERY_ORGANISMS_CSS = `
.tv-gallery--organisms .tv-gallery__grid{grid-template-columns:minmax(0,1fr)}
.tv-gallery--organisms .tv-gallery__sample{display:block}
.tv-gallery--organisms .tv-gallery__sample .tv-rail{position:static;height:auto;flex-direction:row;overflow-x:auto;border:0}
.tv-gallery--organisms .tv-gallery__sample .tv-skip{position:static;transform:none;display:inline-block;margin-bottom:${t("space-2")}}
`

const H = (c: string) => c.repeat(64)
const hex = (n: number) => "0123456789abcdef"[n % 16] as string

function recipe(
  role: HeroRecipe["role"],
  name: string,
  v: number,
  cost: number,
): HeroRecipe {
  return {
    role,
    name,
    cooling: { value: v, lo: v - 0.1, hi: v + 0.1, min: 0, max: 20, digits: 1 },
    cost: { value: cost, digits: 2 },
  }
}
const LAYERS = {
  primer: "GPTES:TEOS mole fraction 0.62:0.38",
  midcoat: "TiO2:BaSO4 volume ratio 0.78:0.22, total PVC 0.338",
  topcoat: "MTES:TEOS mole fraction 0.62:0.38",
}
const FULL: RecipeCardProps = {
  ...recipe("high_performing", "SP-075", 14.4, 0.64),
  layers: LAYERS,
  metrics: [
    { label: "Corrosion index", value: 0.701, tone: "proxy" },
    { label: "Delamination index", value: 0.382, tone: "proxy" },
  ],
}
const NAV = [
  { id: "verdict", label: "Verdict" },
  { id: "recipes", label: "Recipes" },
  { id: "why", label: "How the layers work" },
  { id: "climate", label: "Climate" },
  { id: "budget", label: "Budget" },
  { id: "explore", label: "Explore all 96" },
  { id: "limits", label: "Method and limits" },
  { id: "provenance", label: "Provenance" },
]
const HONESTY =
  "PROXY results. Every number here is a prediction from uncalibrated scenario models. Intervals show parameter uncertainty only."
const HERO3 = [
  recipe("high_performing", "SP-075", 14.4, 0.64),
  recipe("balanced", "SP-031", 13.6, 0.59),
  recipe("low_cost", "SP-046", 13.4, 0.34),
] as const

const entry = (
  level: number,
  budget: number,
  cost: number,
  scalar: number,
) => ({
  level,
  budget,
  cost,
  x: [],
  objectives: [],
  lo: [],
  hi: [],
  scalar,
  repaired: false,
})
const TABLE: BudgetTable = {
  profile: "balanced",
  cost_unit: "relative",
  c_min: 0.3,
  c_max: 0.9,
  knee_budget: 0.6,
  entries: [
    entry(0, 0.3, 0.3, 1),
    entry(1, 0.5, 0.48, 0.6),
    entry(2, 0.7, 0.66, 0.4),
    entry(3, 0.9, 0.9, 0.38),
  ],
}
const lookup = (_profile: string, budget: number) => {
  const r = lookupBudget(TABLE, budget)
  if (r.status === "infeasible")
    return { status: "infeasible" as const, c_min: r.c_min }
  return {
    status: "ok" as const,
    cost: r.entry.cost,
    headroom: r.headroom,
    knee: TABLE.knee_budget,
    recipe: { ...FULL, cost: { value: r.entry.cost, digits: 2 } },
  }
}
const BUDGET = {
  id: "g-budget",
  profiles: [
    { id: "cooling", label: "Cooling first" },
    { id: "balanced", label: "Balanced" },
  ],
  profile: "balanced",
  budget: { min: 0.2, max: 1, step: 0.01, value: 0.5 },
  lookup,
}
const est = (v: number) => ({ value: v, lo: v - 1, hi: v + 1 })
const SITES = {
  sites: [
    { id: "medan", name: "Medan", initial: est(19.4), aged: est(15.1) },
    { id: "makassar", name: "Makassar", initial: est(18.7), aged: est(14.6) },
    { id: "bandung", name: "Bandung", initial: est(12.2), aged: est(9.8) },
  ],
  axis: { min: 0, max: 30 },
  scenario: "Ageing scenario",
  loss: { lo: 18, hi: 26 },
}
const COLS = [
  { key: "name", label: "Recipe", kind: "text" as const, rowHeader: true },
  {
    key: "cool",
    label: "Cooling vs bare Al",
    unit: "K",
    kind: "number" as const,
    digits: 1,
  },
  {
    key: "corr",
    label: "Corrosion",
    kind: "index" as const,
    tone: "proxy" as const,
    digits: 2,
  },
]
const ROWS = [
  { name: "SP-075", cool: { value: 14.4, lo: 14.3, hi: 14.5 }, corr: 0.701 },
  { name: "SP-031", cool: 13.6, corr: 0.55 },
  { name: "SP-046", cool: 13.4, corr: null },
]
const FILES = [{ path: "results.csv", bytes: 5000, sha256: H(hex(1)) }]

export function galleryOrganismCells(): GalleryCell[] {
  const cells: GalleryCell[] = []
  const add = (o: string, state: string, html: string, interactive = false) =>
    cells.push({ atom: o, state, interactive, html })
  add(
    "NavRail",
    "current section",
    navRail({
      brand: "Spandek report",
      items: NAV,
      current: "recipes",
      mainId: "main",
    }),
    true,
  )
  add(
    "NavRail",
    "no current section",
    navRail({ brand: "Spandek report", items: NAV, mainId: "main" }),
    true,
  )
  add(
    "HeroVerdict",
    "default",
    heroVerdict({
      eyebrow: "Spandek aluminium roof coating, digital screening",
      verdict:
        "Three coatings cool aluminium by 13.4 to 14.4 K in the models; none is measured yet",
      lead: "Highest cooling: SP-075 lowers the peak surface temperature against bare aluminium.",
      recipes: HERO3,
      honesty: HONESTY,
      limitsHref: "#limits",
    }),
    true,
  )
  add(
    "HeroVerdict",
    "one recommended",
    heroVerdict({
      id: "verdict-rec",
      verdict: "Three coatings cool aluminium in the models",
      recipes: [{ ...HERO3[0], recommended: true }, HERO3[1], HERO3[2]],
      honesty: HONESTY,
      limitsHref: "#limits",
    }),
    true,
  )
  add(
    "RecipeCard",
    "summary",
    recipeCard({
      ...recipe("balanced", "SP-031", 13.6, 0.59),
      variant: "summary",
    }),
  )
  add(
    "RecipeCard",
    "summary recommended",
    recipeCard({
      ...recipe("high_performing", "SP-075", 14.4, 0.64),
      recommended: true,
    }),
  )
  add("RecipeCard", "full", recipeCard({ ...FULL, variant: "full" }))
  add(
    "RecipeCard",
    "full with scenario badge",
    recipeCard({
      ...FULL,
      variant: "full",
      layersId: "layers-scenario",
      badges: [{ tone: "scenario", label: "ageing scenario" }],
    }),
  )
  add(
    "FindingList",
    "default",
    findingList({
      items: [
        {
          id: "verdict",
          sentence:
            "Three coatings lower the peak surface temperature by 13.4 to 14.4 K against bare aluminium (parameter uncertainty only).",
          sources: ["refine_recipes.csv"],
        },
        {
          id: "recipe-balanced",
          label: "Balanced",
          sentence: "SP-031 has a PROXY index for cost of 0.59.",
        },
      ],
    }),
  )
  add(
    "DataTable",
    "plain",
    dataTable({
      id: "g-table-plain",
      caption: "The three recipes",
      columns: COLS,
      rows: ROWS,
    }),
  )
  add(
    "DataTable",
    "sortable",
    dataTable({
      id: "g-table-sort",
      caption: "Sortable recipes",
      columns: COLS.map((c, i) => (i === 0 ? c : { ...c, sortable: true })),
      rows: ROWS,
    }),
    true,
  )
  add("Glossary", "default", glossary({}))
  add(
    "Provenance",
    "with extra files",
    provenance({
      runId: "20261121T172730601-6a7a8fba",
      seed: 20260101,
      draws: 256,
      coreHash: H("a"),
      commit: "ad40a46f8a75153ecbe6f4461612763688ef0de5",
      build: [{ label: "Bun", value: "1.3.14" }],
      extra: [
        {
          path: "refine_recipes.csv",
          kind: "refine",
          bytes: 1234,
          sha256: H("b"),
        },
      ],
      files: FILES,
      id: "g-prov-a",
    }),
    true,
  )
  add(
    "Provenance",
    "no extra files",
    provenance({
      runId: "20261121T172730601-6a7a8fba",
      seed: 20260101,
      draws: 256,
      coreHash: H("a"),
      extra: [],
      id: "g-prov-b",
    }),
  )
  add(
    "SiteBenefitPanel",
    "with caveats",
    siteBenefitPanel({
      ...SITES,
      id: "g-sites-a",
      caveats: [
        {
          id: "medan",
          site: "medan",
          text: "The weather for Medan is modelled, not measured.",
        },
        {
          id: "tmyx",
          text: "The TMYx typical-year files agree to within the stated tolerance.",
        },
      ],
    }),
  )
  add(
    "SiteBenefitPanel",
    "no caveats",
    siteBenefitPanel({ ...SITES, id: "g-sites-b" }),
  )
  add("BudgetPanel", "ok", budgetPanel(BUDGET), true)
  add(
    "BudgetPanel",
    "infeasible",
    budgetPanel({
      ...BUDGET,
      id: "g-budget-low",
      budget: { ...BUDGET.budget, value: 0.25 },
    }),
    true,
  )
  return cells
}

const ORDER = [
  "NavRail",
  "HeroVerdict",
  "RecipeCard",
  "FindingList",
  "DataTable",
  "Glossary",
  "Provenance",
  "SiteBenefitPanel",
  "BudgetPanel",
]

export function galleryOrganisms(): string {
  const cells = galleryOrganismCells()
  const sections = ORDER.map((o) => {
    const figs = cells
      .filter((c) => c.atom === o)
      .map(
        (c) =>
          `<figure class="tv-gallery__cell" data-atom="${esc(c.atom)}" data-state="${esc(c.state)}"><div class="tv-gallery__sample"${c.interactive ? ' data-interactive="true"' : ""}>${c.html}</div><figcaption class="tv-gallery__cap">${esc(c.state)}</figcaption></figure>`,
      )
      .join("")
    return `<section class="tv-gallery__atom" aria-labelledby="gallery-${esc(o)}"><h3 class="tv-gallery__title" id="gallery-${esc(o)}">${esc(o)}</h3><div class="tv-gallery__grid">${figs}</div></section>`
  }).join("\n")
  return `<section class="tv-gallery tv-gallery--organisms" aria-labelledby="gallery-organisms"><h2 id="gallery-organisms">Organisms</h2>\n${sections}\n</section>\n`
}
