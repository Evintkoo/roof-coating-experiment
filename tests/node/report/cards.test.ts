import { beforeAll, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "yaml"
import {
  checkConstraints,
  lhsDesign,
  weatherL9,
} from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { buildControls } from "../../../src/core/pipeline/controls"
import { buildPareto } from "../../../src/core/pipeline/optimize"
import type { ControlRow, ParetoRow } from "../../../src/core/pipeline/tables"
import type { FlaggedDesignRow, ResultRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { STATIC_LIMITS, writeCard } from "../../../src/node/report/cards"
import { simulateAll } from "../../../src/node/simulate"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
let results: ResultRow[]
let pareto: ParetoRow[]
let controls: ControlRow[]
let short: Record<string, string>
const NMC = 8

beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  const design = checkConstraints(lhsDesign(24, ctx.ranges, 11), ctx.ranges)
    .filter((r) => r.feasible)
    .slice(0, 12) as FlaggedDesignRow[]
  const w = weatherL9(ctx.weather)
  const sim = await simulateAll(design, w, ctx, NMC, 20261121, 1)
  results = sim.results
  pareto = buildPareto(
    results,
    sim.drawObjectives,
    NMC,
    ctx.controls.c1_r_solar.value,
  )
  short = Object.fromEntries(
    pareto.filter((p) => p.role !== "").map((p) => [p.role, p.candidate_id]),
  )
  controls = buildControls(short, design, w, ctx)
})

const out = () => mkdtempSync(join(tmpdir(), "spandek-card-"))
const freq = (id: string) =>
  (pareto.find((p) => p.candidate_id === id) as ParetoRow).pareto_freq
const card = async (
  id: string,
  role: string,
  res = results,
  ctl = controls,
  f = freq(id),
) => readFileSync(await writeCard(id, role, res, ctl, ctx, out(), f), "utf8")
const section = (text: string, name: string): string => {
  const m = text.match(
    new RegExp(
      `### ${name.replace(/[/]/g, "\\/")}\\n([\\s\\S]*?)(?=\\n### |$)`,
    ),
  )
  if (!m) throw new Error(`no section ${name}`)
  return m[1] as string
}

/** Independent D6 (written from the plan text, not from controls.ts). */
function d6(rows: ResultRow[], pf: number): string {
  const mean = (k: "r_solar_hi" | "r_solar_pred" | "delam_proxy") =>
    rows.reduce((a, r) => a + r[k], 0) / rows.length
  if (rows.some((r) => !r.feasible)) return "reject"
  if (mean("r_solar_hi") < ctx.mat.substrate.r_solar.value) return "reject"
  if (
    pf >= 0.5 &&
    mean("r_solar_pred") > ctx.controls.c1_r_solar.value &&
    mean("delam_proxy") <= 0.5
  )
    return "go"
  return "revise"
}

test("cardHasSevenFields", async () => {
  expect(Object.keys(short).sort()).toEqual([
    "balanced",
    "high_performing",
    "low_cost",
  ])
  const id = short.balanced as string
  const text = await card(id, "balanced")
  for (const f of [
    "Candidate ID",
    "Primer chemistry",
    "Midcoat",
    "Topcoat",
    "Predictive outcome",
    "Limit / risk",
    "Decision",
  ]) {
    expect(text).toContain(`### ${f}\n`)
    expect(section(text, f).trim().length).toBeGreaterThan(0)
  }
  expect(section(text, "Candidate ID")).toContain(id)
  expect(section(text, "Decision").trim()).toMatch(/^(go|revise|reject)\b/)
  const r = results.find((x) => x.candidate_id === id) as ResultRow
  expect(section(text, "Primer chemistry")).toContain(
    String(r.primer_dft_um.toFixed(1)),
  )
})

test("decisionRederivedIndependently", async () => {
  const seen = new Set<string>()
  // the real shortlist
  for (const [role, id] of Object.entries(short)) {
    const text = await card(id, role)
    const want = d6(
      results.filter((r) => r.candidate_id === id),
      freq(id),
    )
    expect(section(text, "Decision").trim().split(/\s/)[0]).toBe(want)
    seen.add(want)
  }
  // forced variants so every branch of the rule is covered by a card
  const id = short.high_performing as string
  const rows = results.filter((r) => r.candidate_id === id)
  const lift = (patch: Partial<ResultRow>) =>
    results.map((r) => (r.candidate_id === id ? { ...r, ...patch } : r))
  const variants: [ResultRow[], number][] = [
    [
      lift({
        r_solar_pred: 0.95,
        r_solar_lo: 0.9,
        r_solar_hi: 0.97,
        delam_proxy: 0.2,
      }),
      0.9,
    ], // go
    [
      lift({
        r_solar_pred: 0.95,
        r_solar_lo: 0.9,
        r_solar_hi: 0.97,
        delam_proxy: 0.2,
      }),
      0.3,
    ], // revise (frequency)
    [
      lift({
        r_solar_pred: 0.95,
        r_solar_lo: 0.9,
        r_solar_hi: 0.97,
        delam_proxy: 0.9,
      }),
      0.9,
    ], // revise (delam)
    [lift({ r_solar_pred: 0.3, r_solar_lo: 0.2, r_solar_hi: 0.4 }), 0.9], // reject (hi below substrate)
    [lift({ feasible: false }), 0.9], // reject (infeasible)
  ]
  for (const [res, pf] of variants) {
    const text = await card(id, "high_performing", res, controls, pf)
    const want = d6(
      res.filter((r) => r.candidate_id === id),
      pf,
    )
    expect(section(text, "Decision").trim().split(/\s/)[0]).toBe(want)
    seen.add(want)
  }
  expect([...seen].sort()).toEqual(["go", "reject", "revise"])
  expect(rows.length).toBe(9)
})

test("limitsListScenarioConstantsAndStaticLimits", async () => {
  const text = await card(short.balanced as string, "balanced")
  const limit = section(text, "Limit / risk")
  // every scenario-status constant of materials.yaml, read from the file here
  const yaml = parse(
    readFileSync(join(repoRoot, "configs", "materials.yaml"), "utf8"),
  ) as Record<string, unknown>
  const scenario: string[] = []
  const walk = (o: unknown, path: string[]) => {
    if (typeof o !== "object" || o === null) return
    const r = o as Record<string, unknown>
    if ("status" in r && "value" in r) {
      if (r.status === "scenario") scenario.push(path.join("."))
      return
    }
    for (const [k, v] of Object.entries(r)) walk(v, [...path, k])
  }
  walk(yaml, [])
  expect(scenario.length).toBeGreaterThan(20)
  for (const p of scenario) expect(limit).toContain(`- ${p} = `)
  // vendor / literature constants are not listed as assumed
  expect(limit).not.toContain("- baso4.diameter_um = ")
  const low = limit.toLowerCase()
  for (const phrase of [
    "independent scattering",
    "no nir binder absorption",
    "300–2500 nm",
    "6 m/s",
    "mcadams",
    "uncalibrated",
    "parameter-uncertainty only",
    "water ratio has no effect in the range 1–5",
    "pH-independent".toLowerCase(),
    "lab-verified",
    "110°",
    "adhesion is unknown",
  ])
    expect(low).toContain(phrase)
  for (const l of STATIC_LIMITS) expect(limit).toContain(l)
  // whole card says it too
  expect(text).toContain("uncalibrated")
  expect(text).toContain("parameter uncertainty only")
})

test("noForbiddenPhrasesAndAllPredictionsHaveIntervals", async () => {
  const forbidden = /proven|safe|guaranteed|\d+\s*%\s*(safe|aman|self-clean)/i
  for (const [role, id] of Object.entries(short)) {
    const text = await card(id, role)
    expect(text).not.toMatch(forbidden)
    const rows = section(text, "Predictive outcome")
      .split("\n")
      .filter(
        (l) =>
          l.startsWith("| ") &&
          !l.startsWith("| Quantity") &&
          !l.startsWith("| Control") &&
          !l.startsWith("|---"),
      )
    const quantities = rows.filter((l) => !/^\| C[0-4] /.test(l))
    expect(quantities.length).toBe(10)
    for (const l of quantities) {
      // every prediction: an interval, or the explicit nominal-only label
      expect(
        /\[-?[\d.]+, -?[\d.]+\]/.test(l) ||
          l.includes("nominal only (no interval)"),
      ).toBe(true)
      if (/corrosion|delamination|cost|water-repellence|contact angle/i.test(l))
        expect(l).toContain("PROXY")
    }
    // controls always say what kind of number they are
    for (const l of rows.filter((l) => /^\| C[0-4] /.test(l)))
      expect(l).toMatch(/no interval|control not computed/)
  }
})

test("missingControlSaysNotComputed", async () => {
  const id = short.balanced as string
  const none = await card(id, "balanced", results, [])
  const lines = section(none, "Predictive outcome")
    .split("\n")
    .filter((l) => /^\| C[0-3] /.test(l))
  expect(lines.length).toBe(4)
  for (const l of lines) expect(l).toContain("control not computed")
  expect(none).not.toMatch(/\| +\|/) // never a blank cell
  // only C2 of this candidate missing: the others stay computed
  const partial = controls.filter(
    (c) => !(c.control_id === "C2" && c.for_candidate === id),
  )
  const p = section(
    await card(id, "balanced", results, partial),
    "Predictive outcome",
  )
  expect(p.split("\n").find((l) => l.startsWith("| C2"))).toContain(
    "control not computed",
  )
  expect(p.split("\n").find((l) => l.startsWith("| C0"))).not.toContain(
    "control not computed",
  )
  // an incomplete set of scenarios counts as not computed
  const short9 = controls.filter(
    (c) =>
      !(
        c.control_id === "C3" &&
        c.for_candidate === id &&
        c.scenario_id === "W1"
      ),
  )
  expect(
    section(await card(id, "balanced", results, short9), "Predictive outcome")
      .split("\n")
      .find((l) => l.startsWith("| C3")),
  ).toContain("control not computed")
})

test("cardFileNameAndUnknownCandidate", async () => {
  const dir = out()
  const id = short.low_cost as string
  const path = await writeCard(
    id,
    "low_cost",
    results,
    controls,
    ctx,
    dir,
    freq(id),
  )
  expect(path).toBe(join(dir, "candidate_cards", `low_cost_${id}.md`))
  await expect(
    writeCard("SP-999", "low_cost", results, controls, ctx, dir, 0.5),
  ).rejects.toMatchObject({ code: 5 })
})
