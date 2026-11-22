// The reading path of the report (plan 06 FR-2): Verdict, Recipes, How the layers work, Explore all 96, Method and limits, Provenance.
// Climate and Budget live in indonesia.ts and optimisation.ts. Every number on the page comes from the verified readers of the
// run directory through `findings()` and the files themselves; the wording is the plan 06 outline.
import { DataError } from "../../core/errors"
import { PARETO_COLUMNS, parseControlsCsv } from "../../core/pipeline/tables"
import {
  type Cooling,
  coolingOf,
  type Finding,
  type FindingsInput,
  findings,
  mean,
  ROLES,
  recipeIds,
} from "../../core/report/findings"
import {
  HONESTY_STATEMENT,
  LAYERS,
  LIMITS_HREF,
  LIMITS_LINK_TEXT,
  OUTLINE,
  ROLE_BLURBS,
  ROLE_LABELS,
} from "../../core/report/outline"
import { tag } from "../../web/design/html"
import { callout } from "../../web/design/molecules/callout"
import { disclosure } from "../../web/design/molecules/disclosure"
import { figureFrame } from "../../web/design/molecules/figureFrame"
import { layerSchematic } from "../../web/design/molecules/layerSchematic"
import { type Column, dataTable } from "../../web/design/organisms/dataTable"
import { findingList } from "../../web/design/organisms/findingList"
import { glossary } from "../../web/design/organisms/glossary"
import {
  type HeroRecipe,
  heroVerdict,
} from "../../web/design/organisms/heroVerdict"
import { provenance } from "../../web/design/organisms/provenance"
import { axisLabel } from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import { type Design, layerStrings } from "../../web/recipe"
import { STATIC_LIMITS, scenarioConstants } from "./cards"
import {
  esc,
  type ReportInput,
  type ReportSection,
  renderMarkdown,
} from "./html"
import { loadIndonesia } from "./indonesia"
import { extraEntries } from "./manifest"
import { loadOptimisation } from "./optimisation"

export type Role = (typeof ROLES)[number]

export type Derived = {
  c0Mean: number
  ids: Record<Role, string>
  cooling: Record<Role, Cooling>
  /** The one cooling scale of the three hero cards: zoomed to the three intervals, so it starts above zero. */
  axis: { min: number; max: number }
  /** How many weather scenarios the scenario mean averages (distinct scenario ids of the shortlisted recipes). */
  nScenarios: number
  findings: Finding[]
  /** Terms already linked on the page (each glossary term links once). */
  seen: Set<string>
}

const cache = new WeakMap<ReportInput, Derived>()

/** The feed of `findings()` from the verified readers: the run's results and controls, and the optional refine, budget and Indonesia files. */
export function findingsInputOf(input: ReportInput): FindingsInput {
  const out: FindingsInput = {
    shortlist: input.shortlist,
    results: input.results,
    controls: input.controls.map((c) => ({
      control_id: c.control_id,
      scenario_id: c.scenario_id,
      t_max_pred: c.t_max_pred,
    })),
  }
  const opt = loadOptimisation(input)
  if (opt?.recipes)
    out.refine = opt.recipes.map((r) => ({
      role: r.role ?? "",
      screened_id: r.screened_id ?? "",
      r_solar_pred: Number(r.r_solar_pred),
      t_max_pred: Number(r.t_max_pred),
      cost_proxy: Number(r.cost_proxy),
      status: r.status ?? "",
    }))
  if (opt?.data && opt.data.tables.length > 0)
    out.budget = {
      cost_unit: opt.data.cost_unit,
      tables: opt.data.tables.map((t) => ({
        profile: t.profile,
        c_min: t.c_min,
        c_max: t.c_max,
        knee_budget: t.knee_budget,
      })),
    }
  const ind = loadIndonesia(input)
  if (ind)
    out.indonesia = {
      loss_lo: ind.data.loss_lo,
      loss_hi: ind.data.loss_hi,
      summary: ind.data.summary,
    }
  return out
}

export function derive(input: ReportInput): Derived {
  const hit = cache.get(input)
  if (hit) return hit
  const fin = findingsInputOf(input)
  const f = findings(fin)
  const { ids } = recipeIds(fin)
  const c0 = input.controls
    .filter((c) => c.control_id === "C0")
    .map((c) => c.t_max_pred)
  const c0Mean = mean(c0)
  const cooling = {} as Record<Role, Cooling>
  for (const r of ROLES) cooling[r] = coolingOf(ids[r], input.results, c0Mean)
  // one shared axis, zoomed to the data: whole kelvin just outside the three intervals (never fewer than two kelvin wide)
  let lo = Math.min(...ROLES.map((r) => Math.floor(cooling[r].lo)))
  let hi = Math.max(...ROLES.map((r) => Math.ceil(cooling[r].hi)))
  if (hi - lo < 2) hi = lo + 2
  if (lo < 0) lo = 0
  const nScenarios = new Set(
    input.results
      .filter((x) => x.candidate_id === ids.high_performing)
      .map((x) => x.scenario_id),
  ).size
  const d: Derived = {
    c0Mean,
    ids,
    cooling,
    axis: { min: lo, max: hi },
    nScenarios,
    findings: f,
    seen: new Set(),
  }
  cache.set(input, d)
  return d
}

export const sec = (id: string, title: string, body: string): string =>
  `<section id="${id}" class="page-section" aria-labelledby="h-${id}">\n<h2 id="h-${id}">${esc(title)}</h2>\n${body}\n</section>`

const findingNum = (f: Finding, key: string): { v: number; d: number } => {
  const n = f.numbers.find((x) => x.key === key)
  if (!n) throw new DataError("findings", `finding ${f.id} has no ${key}`)
  return { v: n.value, d: n.digits }
}

/** The decision word of a candidate card. */
function decisionOf(cardText: string): string {
  const m = /### Decision\s+(\w+)/.exec(cardText)
  return m ? (m[1] as string) : "not stated"
}

/** The comparison table's plain wording of a card's decision word (display only; the card and the data keep the word). */
const NEXT_STEP: Record<string, string> = {
  go: "worth a coupon test",
  revise: "revise first",
  reject: "not worth a coupon test",
}
export const nextStep = (decision: string): string =>
  NEXT_STEP[decision] ?? decision

function designOf(input: ReportInput, id: string): Design {
  const r = input.results.find((x) => x.candidate_id === id)
  if (!r) throw new DataError("shortlist", `${id} is not in results`)
  return r
}

const cardFor = (input: ReportInput, id: string) =>
  input.cards.find((c) => c.name.includes(`_${id}.md`))

// ---- Verdict ----

export const verdictSection: ReportSection = {
  id: "verdict",
  title: "Verdict",
  order: 10,
  render: (i) => {
    const d = derive(i)
    const v = d.findings.find((f) => f.id === "verdict") as Finding
    const a = findingNum(v, "verdict.cooling_min")
    const b = findingNum(v, "verdict.cooling_max")
    const fa = a.v.toFixed(a.d)
    const fb = b.v.toFixed(b.d)
    const span = fa === fb ? `about ${fa} K` : `about ${fa} to ${fb} K`
    const recipes = ROLES.map(
      (r): HeroRecipe => ({
        role: r,
        name: d.ids[r],
        cooling: { ...d.cooling[r], ...d.axis, digits: 1 },
        cost: { value: d.cooling[r].cost, digits: 2 },
        ...(r === "high_performing" ? { recommended: true } : {}),
      }),
    ) as [HeroRecipe, HeroRecipe, HeroRecipe]
    const tradeoff = d.findings.find((f) => f.id === "cost-tradeoff")
    const words = [
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ]
    const nScen = words[d.nScenarios] ?? String(d.nScenarios)
    return heroVerdict({
      eyebrow: "Spandek coating screening",
      verdict: `Three recipes cool an aluminium roof by ${span} in the models`,
      lead: `Each card shows how much lower the peak surface temperature of the aluminium sheet itself (not the air indoors) is than bare aluminium, averaged over ${nScen} generic weather scenarios, in model predictions for a freshly applied coating. Bare aluminium has no interval, so each range covers coating parameter uncertainty only. The three differ little in cooling, so cost and the PROXY indices decide between them.`,
      axisNote: `The three bars share one zoomed axis from ${d.axis.min} K to ${d.axis.max} K; it starts at ${d.axis.min} K, not at zero, so the intervals can be seen.`,
      ...(tradeoff ? { costNote: tradeoff.sentence } : {}),
      seen: d.seen,
      recipes,
      honesty: HONESTY_STATEMENT,
      limitsHref: LIMITS_HREF,
      limitsText: `${LIMITS_LINK_TEXT}: what these models cannot say`,
    })
  },
}

// ---- Recipes ----

function controlMean(
  i: ReportInput,
  id: string,
  col:
    | "r_solar_pred"
    | "t_max_pred"
    | "corrosion_proxy"
    | "delam_proxy"
    | "cost_proxy",
): number | null {
  const v = i.controls
    .filter((c) => c.control_id === id)
    .map((c) => c[col])
    .filter((x) => Number.isFinite(x))
  return v.length === 0 ? null : mean(v)
}

export const recipesSection: ReportSection = {
  id: "recipes",
  title: "Recipes",
  order: 20,
  render: (i) => {
    const d = derive(i)
    const items = d.findings
      .filter((f) => f.id === "verdict" || f.id.startsWith("recipe-"))
      .map((f) => ({
        id: f.id,
        ...(f.label ? { label: f.label } : {}),
        sentence: f.sentence,
      }))
    const rows = ROLES.map((r) => {
      const id = d.ids[r]
      const rs = i.results.filter((x) => x.candidate_id === id)
      const m = (
        k: "r_solar" | "t_max" | "corrosion_proxy" | "delam_proxy",
      ) => {
        const p =
          k === "corrosion_proxy" || k === "delam_proxy" ? k : `${k}_pred`
        const g = (s: string) =>
          mean(
            rs.map(
              (x) => (x as unknown as Record<string, number>)[s] as number,
            ),
          )
        return {
          value: g(p),
          lo: g(`${k}_lo`),
          hi: g(`${k}_hi`),
        }
      }
      const t = m("t_max")
      const rr = m("r_solar")
      return {
        name: `${id}, ${ROLE_LABELS[r]}`,
        t_max: t,
        r_solar: rr,
        corrosion: m("corrosion_proxy").value,
        delam: m("delam_proxy").value,
        cost: d.cooling[r].cost,
        decision: nextStep(decisionOf(cardFor(i, id)?.text ?? "")),
      }
    })
    const ctl = (id: string, name: string) => ({
      name,
      t_max: controlMean(i, id, "t_max_pred"),
      r_solar: controlMean(i, id, "r_solar_pred"),
      corrosion: controlMean(i, id, "corrosion_proxy"),
      delam: controlMean(i, id, "delam_proxy"),
      cost: controlMean(i, id, "cost_proxy"),
      decision: "reference, nominal only",
    })
    const columns: Column[] = [
      { key: "name", label: "Recipe", kind: "text", rowHeader: true },
      {
        key: "t_max",
        label: "Peak surface temperature",
        unit: "°C, p5 to p95",
        kind: "number",
        digits: 1,
        sortable: true,
      },
      {
        key: "r_solar",
        label: "Solar reflectance",
        unit: "0 to 1, p5 to p95",
        kind: "number",
        digits: 3,
        sortable: true,
      },
      {
        key: "corrosion",
        label: axisLabel("corrosion_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 2,
      },
      {
        key: "delam",
        label: axisLabel("delam_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 2,
      },
      {
        key: "cost",
        label: axisLabel("cost_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 2,
      },
      { key: "decision", label: "Next step", kind: "text" },
    ]
    const table = dataTable({
      id: "tbl-recipes",
      caption:
        "The three recipes against the two reference controls (scenario means; the controls have no interval)",
      columns,
      rows: [
        ...rows.map((r) => ({ ...r })),
        ctl("C0", "C0 Bare aluminium (nominal only)"),
        ctl("C1", "C1 Commercial datasheet (nominal only)"),
      ],
    })
    const cards = ROLES.map((r) => {
      const id = d.ids[r]
      const c = cardFor(i, id)
      if (!c) return ""
      return disclosure({
        summary: `Full card of ${id} (${ROLE_LABELS[r]}): every number, the controls and the decision`,
        level: "detail",
      })(
        `<div class="page-cards" id="card-${esc(c.name.replace(/\.md$/, ""))}"><article>${renderMarkdown(c.text)}</article></div>`,
      )
    }).join("\n")
    return sec(
      "recipes",
      "Recipes",
      `<p class="page-lead">${ROLES.map((r) => `${ROLE_LABELS[r]}: ${ROLE_BLURBS[r].charAt(0).toLowerCase()}${ROLE_BLURBS[r].slice(1)}`).join(" ")}</p>
${findingList({ items, seen: d.seen })}
<h3>Side by side</h3>
${table}
<h3>Full cards</h3>
${cards}`,
    )
  },
}

// ---- How the layers work ----

/** The scenario of the day-2 figure: the one in which bare aluminium peaks highest. */
export function whyScenario(i: ReportInput): string {
  let best = ""
  let top = Number.NEGATIVE_INFINITY
  for (const s of i.curves.series)
    if (s.id === "C0") {
      const p = Math.max(...s.t_c)
      if (p > top) {
        top = p
        best = s.scenario_id
      }
    }
  if (best === "") throw new DataError("curves.json", "no C0 series in curves")
  return best
}

export const whySection: ReportSection = {
  id: "why",
  title: "How the layers work",
  order: 30,
  render: (i) => {
    const d = derive(i)
    const sc = whyScenario(i)
    const peak = (id: string): number | null => {
      const s = i.curves.series.find((x) => x.id === id && x.scenario_id === sc)
      return s ? Math.max(...s.t_c) : null
    }
    const c0 = peak("C0") as number
    const recipePeaks = ROLES.map((r) => peak(d.ids[r])).filter(
      (x): x is number => x !== null,
    )
    const range =
      recipePeaks.length === 0
        ? ""
        : ` and the three recipes at ${fmtValue(Math.min(...recipePeaks), 1)} to ${fmtValue(Math.max(...recipePeaks), 1)} °C`
    const message = `On the hottest modelled day (${sc}) bare aluminium peaks at ${fmtValue(c0, 1)} °C${range}`
    const layers = tag(
      "ul",
      { class: "page-layers" },
      LAYERS.map(
        (l) => `<li><strong>${esc(l.title)}</strong>${esc(l.why)}</li>`,
      ).join(""),
    )
    const schem = ROLES.map((r) => {
      const dsg = designOf(i, d.ids[r])
      return `<div><h3>${esc(ROLE_LABELS[r])}</h3>${layerSchematic({
        name: d.ids[r],
        primer_um: dsg.primer_dft_um,
        midcoat_um: dsg.midcoat_dft_um,
        topcoat_um: dsg.topcoat_dft_um,
      })}<p class="page-hint">${esc(Object.values(layerStrings(dsg)).join("; "))}</p></div>`
    }).join("")
    const fig = figureFrame({
      message,
      size: "medium",
      describe:
        "Surface temperature over the second simulated day, with the p5 to p95 band of parameter uncertainty",
      note: "Shaded band: p5 to p95, parameter uncertainty only. Bare aluminium is a nominal scenario value, not a measurement.",
    })(`<div id="fig-why-tofT" class="fig"></div>`)
    return sec(
      "why",
      "How the layers work",
      `<p class="page-lead">A recipe is three thin layers on the aluminium sheet. In the models each layer has one job.</p>
${layers}
<div class="page-grid page-grid--3">${schem}</div>
${fig}`,
    )
  },
  data: (i) => {
    const d = derive(i)
    return {
      scenario: whyScenario(i),
      only: [...ROLES.map((r) => d.ids[r]), "C0", "C1"],
      shortlist: d.ids,
    }
  },
}

// ---- Explore all 96 ----

const explore: ReportSection = {
  id: "explore",
  title: "Explore all 96",
  order: 60,
  render: (i) => {
    const scen = [...new Set(i.curves.series.map((s) => s.scenario_id))].sort()
    const columns: Column[] = [
      {
        key: "candidate_id",
        label: "Candidate",
        kind: "text",
        rowHeader: true,
        mono: true,
        sortable: true,
      },
      {
        key: "r_solar_pred",
        label: axisLabel("r_solar_pred"),
        kind: "number",
        digits: 3,
        sortable: true,
      },
      {
        key: "t_max_pred",
        label: axisLabel("t_max_pred"),
        kind: "number",
        digits: 2,
        sortable: true,
      },
      {
        key: "corrosion_proxy",
        label: axisLabel("corrosion_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 3,
        sortable: true,
      },
      {
        key: "delam_proxy",
        label: axisLabel("delam_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 3,
        sortable: true,
      },
      {
        key: "cost_proxy",
        label: axisLabel("cost_proxy"),
        kind: "index",
        tone: "proxy",
        digits: 3,
        sortable: true,
      },
      {
        key: "t_max_worst",
        label: axisLabel("t_max_worst"),
        kind: "number",
        digits: 2,
        sortable: true,
      },
      { key: "on_front", label: "On the Pareto front", kind: "text" },
      {
        key: "pareto_freq",
        label: axisLabel("pareto_freq"),
        kind: "number",
        digits: 2,
        sortable: true,
      },
      { key: "role", label: "Shortlist role", kind: "text" },
    ]
    if (columns.length !== PARETO_COLUMNS.length)
      throw new DataError("pareto.csv", "explore columns differ from the file")
    const rows = i.pareto.map((r) => ({
      candidate_id: r.candidate_id,
      r_solar_pred: r.r_solar_pred,
      t_max_pred: r.t_max_pred,
      corrosion_proxy: r.corrosion_proxy,
      delam_proxy: r.delam_proxy,
      cost_proxy: r.cost_proxy,
      t_max_worst: r.t_max_worst,
      on_front: r.on_front ? "yes" : "no",
      pareto_freq: r.pareto_freq,
      role: String(r.role),
    }))
    const table = dataTable({
      id: "tbl-explorer",
      caption: `All ${i.pareto.length} screened candidates (initial state; sort by any column header)`,
      columns,
      rows,
      rowIdKey: "candidate_id",
    })
    const explorer = disclosure({
      summary: "Select candidates by dragging on the parallel-coordinates plot",
      level: "detail",
      id: "details-explorer",
    })(
      `<p>Drag on an axis to select candidates; the scatter matrix dims the rest and the table lists exactly the selected ones. Line colour is the share of uncertainty draws in which the candidate is on the Pareto front.</p>
${figureFrame({ message: "Drag along an axis to keep only the candidates in that range", size: "tall", interactive: true, describe: "Parallel coordinates of the five objectives" })('<div id="fig-parcoords" class="fig fig--tall"></div>')}
${figureFrame({ message: "The same candidates as a scatter matrix: the selected ones stay bright", size: "tall", interactive: true, describe: "Scatter matrix of the five objectives; the shortlisted recipes have their own symbols" })('<div id="fig-splom" class="fig fig--tall"></div>')}`,
    )
    const curves = disclosure({
      summary: "Temperature and reflectance curves of the three recipes",
      level: "detail",
      id: "details-curves",
    })(
      `<div class="page-controls"><label for="sel-scenario">Weather scenario</label><select id="sel-scenario">${scen.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
${figureFrame({ message: "Surface temperature over day 2 in the chosen weather", size: "medium", describe: "Day-2 surface temperature with p5 to p95 bands", note: "Shaded band: p5 to p95, parameter uncertainty only." })('<div id="fig-tofT" class="fig"></div>')}
${figureFrame({ message: "Reflectance across the solar spectrum", size: "medium", describe: "Reflectance spectra with p5 to p95 bands and the solar reference", note: "Shaded band: p5 to p95, parameter uncertainty only. The grey area is sunlight, a reference and not a prediction." })('<div id="fig-spectrum" class="fig"></div>')}`,
    )
    const live = disclosure({
      summary:
        "Live simulator: move a slider and the models run again in your browser",
      level: "detail",
      id: "details-live",
    })(
      `<p>Bands are p5 to p95 over 32 uncertainty draws (this run's batch used ${i.meta.n_mc}); controls C0 and C1 are nominal only. Every index marked PROXY is a relative ranking, not a measurement.</p>
<div id="live-root" class="live" data-requested="0" data-shown="0">
<div id="live-controls"></div>
<div class="live-out">
<p id="live-status" class="page-hint" role="status" aria-live="polite"></p>
<div id="live-tiles" class="tiles"></div>
${figureFrame({ message: "Live surface temperature of the recipe you set", size: "medium", interactive: true, describe: "Live day-2 surface temperature with p5 to p95 band and controls" })('<div id="fig-live-tofT" class="fig"></div>')}
${figureFrame({ message: "Live reflectance of the recipe you set", size: "medium", interactive: true, describe: "Live reflectance spectrum with p5 to p95 band" })('<div id="fig-live-spectrum" class="fig"></div>')}
</div>
</div>
<details id="debug"><summary>Debug: last events and timings</summary>
<p id="debug-timing" class="page-hint">No live update yet.</p>
<pre id="debug-events"></pre>
</details>`,
    )
    const outs = [...new Set(i.sens.map((s) => s.output))].sort()
    const sensitivity = disclosure({
      summary: "Sensitivity: which inputs move each output most",
      level: "detail",
      id: "details-sensitivity",
    })(
      `<p>Sobol indices (error bars: 95 % confidence half-width of the estimate) and Morris screening for the full stack over eleven inputs.</p>
${outs
  .map(
    (o) =>
      `<h3>${esc(axisLabel(o))}</h3>
${figureFrame({ message: `Which inputs explain the spread of ${axisLabel(o).toLowerCase()} (Sobol)`, size: "medium", describe: `Sobol indices for ${o}` })(`<div id="fig-sobol-${esc(o)}" class="fig"></div>`)}
${figureFrame({ message: `Which inputs have non-linear or interacting effects on ${axisLabel(o).toLowerCase()} (Morris)`, size: "medium", describe: `Morris screening for ${o}` })(`<div id="fig-morris-${esc(o)}" class="fig"></div>`)}`,
  )
  .join("\n")}`,
    )
    return sec(
      "explore",
      "Explore all 96",
      `<p class="page-lead">Everything that was screened, behind the headline. Sort the table, brush the plot, or move the live sliders; none of it changes the answer above.</p>
${explorer}
<p id="tbl-count" class="page-hint" aria-live="polite">${i.pareto.length} of ${i.pareto.length} candidates</p>
<div class="page-explore tv-table-host">${table}</div>
<p id="tbl-empty" class="page-hint" hidden>No candidates match the current selection.</p>
${curves}
${live}
${sensitivity}
<p class="page-hint">The full card of each shortlisted recipe is under Recipes.</p>`,
    )
  },
  data: () => null,
}

// ---- Method and limits ----

const limits: ReportSection = {
  id: "limits",
  title: "Method and limits",
  order: 70,
  render: (i) => {
    const d = derive(i)
    const notModelled = d.findings.find((f) => f.id === "not-modelled")
    const constants = disclosure({
      summary: "Assumed constants (status: scenario)",
      level: "detail",
    })(
      `<ul>${scenarioConstants(i.ctx)
        .map(
          (k) =>
            `<li><code>${esc(k.path)}</code> = ${esc(k.value)}${k.unit ? ` ${esc(k.unit)}` : ""}</li>`,
        )
        .join("")}</ul>`,
    )
    const gloss = disclosure({
      summary: "Glossary: every term the page uses",
      level: "detail",
      id: "details-glossary",
    })(glossary({}))
    return sec(
      "limits",
      "Method and limits",
      `${callout({ tone: "limit", title: "PROXY statement", body: "Indices for corrosion, water repellence, delamination and cost are PROXY numbers from simple relations, not calibrated against experiments. Every PROXY index is uncalibrated: a relative ranking, not a measurement and not a probability. Intervals show parameter uncertainty only." })}
<h3>Method</h3>
<p>Optics: Mie scattering of TiO2 and BaSO4 pigments in a binder, a two-flux film model and the ASTM G173 spectrum. Heat: a one-dimensional surface balance (radiation, convection, conduction into the building) over two simulated days; the second day is shown. Uncertainty: ${i.meta.n_mc} Latin-hypercube draws of the uncertain material constants; intervals are p5 to p95 widened to include the nominal value (parameter uncertainty only).</p>
<p>${esc(
        loadIndonesia(i) !== null
          ? "The main results (recipes, explorer, live simulator, budget) describe the initial, as-applied state. Ageing appears only as a labelled scenario in the Indonesian climate section, never as a measurement."
          : "The results describe the initial, as-applied state; ageing is not part of them and is not measured.",
      )}</p>
<h3>Limits</h3>
<ul class="page-limits">${STATIC_LIMITS.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
${notModelled ? `<p>${esc(notModelled.sentence)}</p>` : ""}
${constants}
${gloss}`,
    )
  },
}

// ---- Provenance ----

const provenanceSection: ReportSection = {
  id: "provenance",
  title: "Provenance",
  order: 80,
  render: (i) => {
    const files = (i.manifest.files ?? []) as {
      path: string
      sha256: string
      bytes: number
    }[]
    const v = (i.manifest.versions ?? {}) as Record<string, string>
    return sec(
      "provenance",
      "Provenance",
      provenance({
        id: "provenance-run",
        runId: i.runId,
        seed: i.meta.seed,
        draws: i.meta.n_mc,
        coreHash: String(i.manifest.core_sha256 ?? ""),
        ...(i.manifest.git_commit
          ? { commit: String(i.manifest.git_commit) }
          : {}),
        build: v.bun ? [{ label: "Bun", value: String(v.bun) }] : [],
        extra: extraEntries(i.manifest),
        files,
        extraInDisclosure: true,
      }),
    )
  },
}

export const READING_PATH: readonly ReportSection[] = [
  verdictSection,
  recipesSection,
  whySection,
  explore,
  limits,
  provenanceSection,
]

/** Section titles for the rail, in the order of the plan 06 outline. */
export const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  OUTLINE.map((s) => [s.id, s.title]),
)
