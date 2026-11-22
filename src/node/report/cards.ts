import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { DataError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import { type Decision, decide } from "../../core/pipeline/controls"
import type { ControlRow } from "../../core/pipeline/tables"
import type { ResultRow } from "../../core/schema"
import { emit } from "../logging"

/** Model limits that hold for every candidate (plan 03 Task 7); the card prints them verbatim. */
export const STATIC_LIMITS: readonly string[] = [
  "Optics assume independent scattering (no dependent-scattering correction); no NIR binder absorption is modelled and R is held outside the 300–2500 nm range.",
  "The wind level of 6 m/s is beyond the usual McAdams range of the convection correlation (about 5 m/s).",
  "Every PROXY index is uncalibrated: a relative ranking number, not a measurement and not a probability.",
  "Intervals are parameter-uncertainty only (p5–p95 over the uncertainty draws of the uncertain inputs); they exclude model-form error and are not prediction intervals for a real roof.",
  "The sol-gel water ratio has no effect in the range 1–5 in the model.",
  "Sol-gel condensation is taken as pH-independent in the model.",
  "Contact angle and sliding angle are lab-verified quantities; the smooth-film model rarely reaches 110°.",
  "Adhesion is unknown, binder compatibility is unknown, and optical constants for several materials are missing (scenario values stand in).",
  "All values are initial (as-applied); weathering and adhesion are not modelled and ageing is not measured (the Indonesia section, when present, shows it only as a labelled scenario).",
]

type Leaf = { path: string; value: string; unit: string }

/** Every constant of the context with `status: scenario` (leaf objects carrying status plus value or values). */
export function scenarioConstants(ctx: ModelContext): Leaf[] {
  const out: Leaf[] = []
  const walk = (o: unknown, path: string): void => {
    if (typeof o !== "object" || o === null || Array.isArray(o)) return
    const r = o as Record<string, unknown>
    if ("status" in r && ("value" in r || "values" in r)) {
      if (r.status === "scenario")
        out.push({
          path,
          value: String(r.value ?? JSON.stringify(r.values)),
          unit: typeof r.unit === "string" && r.unit !== "1" ? r.unit : "",
        })
      return
    }
    for (const [k, v] of Object.entries(r))
      walk(v, path === "" ? k : `${path}.${k}`)
  }
  walk(ctx.mat, "")
  walk({ weather: ctx.weather }, "")
  walk({ controls: ctx.controls }, "")
  return out
}

const f = (v: number, d = 3): string => v.toFixed(d)
const ival = (v: number, lo: number, hi: number, d = 3): string =>
  `${f(v, d)} [${f(lo, d)}, ${f(hi, d)}]`
const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length

type Col =
  | "r_solar"
  | "t_max"
  | "corrosion_proxy"
  | "wetting_proxy"
  | "q_in_mean_w_m2"
  | "delam_proxy"
const COL: Record<Col, [string, string, string]> = {
  r_solar: ["r_solar_pred", "r_solar_lo", "r_solar_hi"],
  t_max: ["t_max_pred", "t_max_lo", "t_max_hi"],
  corrosion_proxy: [
    "corrosion_proxy",
    "corrosion_proxy_lo",
    "corrosion_proxy_hi",
  ],
  wetting_proxy: ["wetting_proxy", "wetting_proxy_lo", "wetting_proxy_hi"],
  q_in_mean_w_m2: ["q_in_mean_w_m2", "q_in_mean_w_m2_lo", "q_in_mean_w_m2_hi"],
  delam_proxy: ["delam_proxy", "delam_proxy_lo", "delam_proxy_hi"],
}
const get = (r: ResultRow, k: string): number =>
  (r as unknown as Record<string, number>)[k] as number
const meanOf = (
  rows: readonly ResultRow[],
  k: Col,
): [number, number, number] => {
  const [p, l, h] = COL[k]
  return [
    mean(rows.map((r) => get(r, p))),
    mean(rows.map((r) => get(r, l))),
    mean(rows.map((r) => get(r, h))),
  ]
}

/** Scenario-mean of one control's column for this candidate; null when its rows are missing or incomplete. */
function controlMean(
  controls: readonly ControlRow[],
  id: string,
  forCandidate: string,
  col: "r_solar_pred" | "t_max_pred",
  nScenarios: number,
): number | null {
  const rows = controls.filter(
    (c) => c.control_id === id && c.for_candidate === forCandidate,
  )
  if (rows.length === 0 || rows.length !== nScenarios) return null
  return mean(rows.map((r) => r[col]))
}

export type CardInput = {
  candidateId: string
  role: string
  results: readonly ResultRow[]
  controls: readonly ControlRow[]
  ctx: ModelContext
  paretoFreq: number
}

/** The D6 decision for a candidate, from its rows of results.csv and its Pareto frequency. */
export function cardDecision(i: CardInput): Decision {
  const rows = i.results.filter((r) => r.candidate_id === i.candidateId)
  if (rows.length === 0)
    throw new DataError("results.csv", `${i.candidateId} not in results.csv`)
  const feasible = rows.every((r) => r.feasible)
  return decide(
    {
      feasible,
      r_solar_hi: Math.min(...rows.map((r) => r.r_solar_hi)),
      pareto_freq: i.paretoFreq,
      r_solar_pred_mean: mean(rows.map((r) => r.r_solar_pred)),
      delam_proxy: mean(rows.map((r) => r.delam_proxy)),
    },
    i.ctx.controls.c1_r_solar.value,
    i.ctx.mat.substrate.r_solar.value,
  )
}

const DECISION_TEXT: Record<Decision, string> = {
  go: "go to coupon lab. This means the candidate is worth a coupon test, not that it performs on a roof.",
  revise:
    "revise. At least one go criterion is not met; change the formulation and re-run before any coupon test.",
  reject:
    "reject. The candidate is infeasible, or even its upper r_solar bound is below the bare substrate.",
}

/** Card text (blueprint 5.4: seven fields). Pure; writeCard persists it. */
export function renderCard(i: CardInput): string {
  const { ctx } = i
  const rows = i.results
    .filter((r) => r.candidate_id === i.candidateId)
    .sort((a, b) => (a.scenario_id < b.scenario_id ? -1 : 1))
  if (rows.length === 0)
    throw new DataError("results.csv", `${i.candidateId} not in results.csv`)
  const c = rows[0] as ResultRow
  const decision = cardDecision(i)
  const n = rows.length

  const [rP, rL, rH] = meanOf(rows, "r_solar")
  const [tP, tL, tH] = meanOf(rows, "t_max")
  const hot = rows.reduce((a, b) => (b.t_max_pred > a.t_max_pred ? b : a))
  const [qP, qL, qH] = meanOf(rows, "q_in_mean_w_m2")
  const [cP, cL, cH] = meanOf(rows, "corrosion_proxy")
  const [wP, wL, wH] = meanOf(rows, "wetting_proxy")
  const [dP, dL, dH] = meanOf(rows, "delam_proxy")
  const th = mean(rows.map((r) => r.wetting_theta_pred))
  const thL = mean(rows.map((r) => r.wetting_theta_lo))
  const thH = mean(rows.map((r) => r.wetting_theta_hi))
  const reaches = th >= 110
  const tio2 = c.midcoat_tio2_fraction

  const ctl = (id: string, forC: string, label: string): string => {
    const r = controlMean(i.controls, id, forC, "r_solar_pred", n)
    const t = controlMean(i.controls, id, forC, "t_max_pred", n)
    if (r === null || t === null)
      return `| ${label} | control not computed | control not computed |`
    const un =
      i.controls.find((x) => x.control_id === id && x.for_candidate === forC)
        ?.unmodelled ?? ""
    const note = un === "" ? "" : ` (not modelled: ${un.split(";").join(", ")})`
    return `| ${label} | ${f(r)}, nominal, no interval | ${f(t, 1)}, nominal, no interval${note} |`
  }

  const c1T = controlMean(i.controls, "C1", "-", "t_max_pred", n)
  const c1Row = `| C1 commercial datasheet (${ctx.controls.c1_name}) | ${f(ctx.controls.c1_r_solar.value)}, datasheet, no interval | ${c1T === null ? "control not computed" : `${f(c1T, 1)}, nominal, no interval (thermal model on datasheet values)`} |`

  const lines: string[] = []
  lines.push(`# Candidate card ${i.candidateId} (${i.role})`, "")
  lines.push(
    "Initial-state predictions from uncalibrated scenario models. Every PROXY number is a relative index, and every interval covers parameter uncertainty only.",
    "",
  )
  lines.push("### Candidate ID", "", `${i.candidateId} (role: ${i.role})`, "")
  lines.push(
    "### Primer chemistry",
    "",
    `GPTES:TEOS mole fraction ${f(c.primer_gptes_molfrac, 2)}:${f(1 - c.primer_gptes_molfrac, 2)}, target dry film thickness ${f(c.primer_dft_um, 1)} µm.`,
    "",
  )
  lines.push(
    "### Midcoat",
    "",
    `TiO2:BaSO4 volume ratio ${f(tio2, 2)}:${f(1 - tio2, 2)}, total PVC ${f(c.midcoat_pvc, 3)}, target DFT ${f(c.midcoat_dft_um, 0)} µm.`,
    "",
  )
  lines.push(
    "### Topcoat",
    "",
    `MTES:TEOS mole fraction ${f(c.topcoat_mtes_molfrac, 2)}:${f(1 - c.topcoat_mtes_molfrac, 2)}, target DFT ${f(c.topcoat_dft_um, 1)} µm.`,
    "",
  )
  lines.push(
    "### Predictive outcome",
    "",
    `Scenario means over the ${n} weather scenarios (day-2 peak temperatures), interval = p5–p95 parameter uncertainty (mean of the per-scenario bounds).`,
    "",
    "| Quantity | Value |",
    "|---|---|",
    `| Solar reflectance r_solar, initial | ${ival(rP, rL, rH)} |`,
    `| Peak surface temperature, mean of scenarios (°C) | ${ival(tP, tL, tH, 1)} |`,
    `| Peak surface temperature, hottest scenario ${hot.scenario_id} (°C) | ${ival(hot.t_max_pred, hot.t_max_lo, hot.t_max_hi, 1)} |`,
    `| Mean heat flux into the building q_in (W/m²) | ${ival(qP, qL, qH, 1)} |`,
    `| Corrosion index (PROXY) | ${ival(cP, cL, cH)} |`,
    `| Water-repellence index (PROXY) | ${ival(wP, wL, wH)} |`,
    `| Contact angle (PROXY, uncalibrated, deg) | ${ival(th, thL, thH, 1)} |`,
    `| Delamination index (PROXY) | ${ival(dP, dL, dH)} |`,
    `| Cost index (PROXY) | ${f(c.cost_proxy)}, nominal only (no interval) |`,
    `| Relative gel time of the primer sol | ${Number.isFinite(c.gel_time_rel) ? f(c.gel_time_rel) : "inf"}, nominal only (no interval) |`,
    "",
    `Contact angle: the blueprint 8.1 target of 110° is ${reaches ? "reached" : "not reached"} by the nominal prediction (${f(th, 1)}°, upper bound ${f(thH, 1)}°). Contact angle and sliding are lab-verified.`,
    "",
    "Controls (nominal values from the same models or the datasheet; scenario means; no interval):",
    "",
    "| Control | r_solar | Peak temperature (°C) |",
    "|---|---|---|",
    ctl("C0", "-", "C0 bare aluminium substrate"),
    c1Row,
    ctl("C2", i.candidateId, "C2 primer + midcoat (no topcoat)"),
    ctl("C3", i.candidateId, "C3 midcoat + topcoat (no primer)"),
    `| C4 this candidate | ${f(rP)}, nominal, no interval | ${f(mean(rows.map((r) => r.t_max_pred)), 1)}, nominal, no interval |`,
    "",
  )
  lines.push("### Limit / risk", "", "Static model limits:", "")
  for (const l of STATIC_LIMITS) lines.push(`- ${l}`)
  lines.push(
    "",
    "Scenario constants used (status: scenario, i.e. assumed, not measured):",
    "",
  )
  for (const k of scenarioConstants(ctx))
    lines.push(`- ${k.path} = ${k.value}${k.unit ? ` ${k.unit}` : ""}`)
  lines.push("")
  lines.push(
    "### Decision",
    "",
    `${decision}`,
    "",
    DECISION_TEXT[decision],
    "",
    `Rule inputs: pareto frequency ${f(i.paretoFreq, 2)} (go needs at least 0.5), mean r_solar ${f(rP)} against C1 ${f(ctx.controls.c1_r_solar.value)}, delamination index ${f(dP)} (go needs at most 0.5), r_solar upper bound ${f(rH)} against substrate ${f(ctx.mat.substrate.r_solar.value)}.`,
    "",
  )
  return lines.join("\n")
}

/** Write candidate_cards/<role>_<id>.md atomically; returns its path. */
export async function writeCard(
  candidateId: string,
  role: string,
  results: readonly ResultRow[],
  controls: readonly ControlRow[],
  ctx: ModelContext,
  outDir: string,
  paretoFreq: number,
): Promise<string> {
  const input: CardInput = {
    candidateId,
    role,
    results,
    controls,
    ctx,
    paretoFreq,
  }
  const text = renderCard(input)
  const dir = join(outDir, "candidate_cards")
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${role}_${candidateId}.md`)
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, text)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
  emit("card.written", "info", {
    candidate_id: candidateId,
    role,
    decision: cardDecision(input),
  })
  return path
}
