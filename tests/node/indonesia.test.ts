import { afterEach, beforeAll, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseCsv } from "../../src/core/csv"
import { ConfigError } from "../../src/core/errors"
import { setEventSink } from "../../src/core/events"
import {
  type HourlySeries,
  type IndonesiaConfig,
  type IndonesiaRow,
  type SiteConfig,
  validateSubstrate,
} from "../../src/core/indonesia/series"
import { simulateSeriesDay } from "../../src/core/models/thermalSeries"
import type { ModelContext } from "../../src/core/pipeline/context"
import {
  parseParetoCsv,
  shortlistFromPareto,
} from "../../src/core/pipeline/tables"
import { loadContext } from "../../src/node/context"
import {
  INDONESIA_COLUMNS,
  runIndonesia,
  weightedBenefit,
} from "../../src/node/indonesia"
import { loadIndonesiaConfig, loadSites } from "../../src/node/siteConfig"
import {
  copyRun,
  events,
  indonesiaConfigCopy,
  repoRoot,
  run,
  weatherSubset,
} from "../helpers"

// Fast tier: one site (Jakarta), two years (2023-2024), 4 draws. The full five-site, ten-year, 256-draw batch is
// indonesia.e2e.proof.test.ts and the real-data checks of indonesia.crosscheck.test.ts.
const NMC = 4
const SEED = 20261121
type Row = Record<string, string>
let ctx: ModelContext
let dir: string
let shortlist: Record<string, string>
let jakarta: SiteConfig
let cfg: IndonesiaConfig
let wx: string
let a: Row[]
const outs: string[] = []
const f = (r: Row, k: string): number => Number(r[k])

async function batch(
  out: string,
  o: { workers?: number; cfg?: IndonesiaConfig; ctx?: ModelContext } = {},
): Promise<void> {
  outs.push(out)
  await runIndonesia(o.ctx ?? ctx, shortlist, SEED, NMC, dir, {
    out,
    weatherDir: wx,
    sites: [jakarta],
    cfg: o.cfg ?? cfg,
    workers: o.workers ?? 2,
  })
}
const csv = (out: string, name = "indonesia_results.csv"): string =>
  readFileSync(join(out, name), "utf8")

beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  dir = await copyRun()
  shortlist = shortlistFromPareto(
    parseParetoCsv(readFileSync(join(dir, "pareto.csv"), "utf8")),
  )
  const cdir = indonesiaConfigCopy(2023, 2024)
  const sites = await loadSites(join(cdir, "sites.yaml"))
  jakarta = sites.find((s) => s.id === "jakarta") as SiteConfig
  cfg = await loadIndonesiaConfig(join(cdir, "indonesia.yaml"))
  wx = await weatherSubset(["jakarta"], 2023, 2024)
  const out = join(dir, "indonesia")
  await batch(out)
  a = parseCsv(csv(out))
}, 120_000)
afterEach(() => setEventSink(null))

const rows = (subject: string, state?: string): Row[] =>
  a.filter(
    (r) => r.subject === subject && (state === undefined || r.state === state),
  )

test("rowCountMatchesScenarios", () => {
  const scenarios = new Set(a.map((r) => `${r.site}|${r.season}|${r.bin}`))
  expect(scenarios.size).toBe(6) // one site, wet and dry, three day types
  expect(a.length).toBe(scenarios.size * (96 + 5) * 2)
  expect(Object.keys(a[0] as Row)).toEqual([...INDONESIA_COLUMNS])
  // D9 order: site, season (wet, dry), bin (hot, typical, overcast), subject (five uncertain, then the 96), state
  expect(a.slice(0, 12).map((r) => `${r.subject}/${r.state}`)).toEqual([
    "C0/initial",
    "C0/aged",
    "C1/initial",
    "C1/aged",
    "card_high/initial",
    "card_high/aged",
    "card_balanced/initial",
    "card_balanced/aged",
    "card_low/initial",
    "card_low/aged",
    "SP-001/initial",
    "SP-001/aged",
  ])
  expect(a.filter((r) => r.nominal_only === "true").length).toBe(
    scenarios.size * 96 * 2,
  )
})

test("c1AgedUsesDatasheetValues", () => {
  const k = ctx.controls
  const ini = rows("C1", "initial")
  const age = rows("C1", "aged")
  expect(ini.length).toBe(6)
  for (const r of ini) expect(f(r, "r_solar_eff")).toBe(k.c1_r_solar.value)
  for (const r of age) {
    expect(f(r, "r_solar_eff")).toBe(k.c1_r_solar_aged.value) // 0.77, not 0.90 x (1 - loss)
    // the loss draws do not touch C1: its interval is the single datasheet run
    expect(f(r, "t_max_lo")).toBe(f(r, "t_max_c"))
    expect(f(r, "t_max_hi")).toBe(f(r, "t_max_c"))
  }
  // the aged row is the series model with the aged datasheet reflectance and emittance, not a copy of the initial row
  const day = r1Day(age[0] as Row)
  const roof = ctx.weather.roof
  const direct = simulateSeriesDay(
    {
      r_solar: k.c1_r_solar_aged.value,
      emissivity: k.c1_emissivity_aged.value,
      t_inside_k: roof.t_inside_c.value + 273.15,
      r_total_m2k_w: roof.r_total_m2k_w.value,
      c_a_j_m2k: roof.c_substrate_j_m2k.value,
    },
    day,
    ctx.weather.h_conv_a.value,
    ctx.weather.h_conv_b.value,
  )
  expect(f(age[0] as Row, "t_max_c")).toBeCloseTo(direct.t_max_c, 9)
  expect(f(age[0] as Row, "t_max_c")).toBeGreaterThan(
    f(ini[0] as Row, "t_max_c"),
  )
})

/** The hourly series of the scenario a result row belongs to, from indonesia_days.json. */
function r1Day(r: Row): HourlySeries {
  const j = JSON.parse(csv(join(dir, "indonesia"), "indonesia_days.json"))
  const d = j.sites[0].days.find(
    (x: { season: string; bin: string }) =>
      x.season === r.season && x.bin === r.bin,
  )
  const s = d.series
  return {
    g_w_m2: Float64Array.from(s.g_w_m2),
    t_air_c: Float64Array.from(s.t_air_c),
    rh_pct: Float64Array.from(s.rh_pct),
    wind_m_s: Float64Array.from(s.wind_m_s),
    lw_down_w_m2: Float64Array.from(s.lw_down_w_m2),
  }
}

test("lossAppliesToCoatingOnly", () => {
  const mid = 0.5 * (cfg.loss_lo + cfg.loss_hi)
  // bare aluminium: no substrate ageing is modelled (BLOCKED-9), the aged row equals the initial row in every field
  const c0i = rows("C0", "initial")
  const c0a = rows("C0", "aged")
  c0i.forEach((r, i) => {
    for (const k of [
      "r_solar_eff",
      "t_max_c",
      "t_max_lo",
      "t_max_hi",
      "q_in_mean_w_m2",
      "q_lo",
      "q_hi",
    ])
      expect(f(c0a[i] as Row, k)).toBe(f(r, k))
  })
  // every coated stack: r_aged = r_initial x (1 - loss) with the nominal loss at the interval midpoint
  for (const s of [
    "card_high",
    "card_balanced",
    "card_low",
    "SP-001",
    "SP-050",
  ]) {
    const ini = rows(s, "initial")
    const age = rows(s, "aged")
    ini.forEach((r, i) => {
      if (Number.isNaN(f(r, "r_solar_eff"))) return
      expect(f(age[i] as Row, "r_solar_eff")).toBeCloseTo(
        f(r, "r_solar_eff") * (1 - mid),
        12,
      )
    })
  }
})

test("agedNeverCoolerThanInitial", () => {
  let n = 0
  for (const subject of new Set(a.map((r) => r.subject as string))) {
    if (subject === "C1") continue
    const ini = rows(subject, "initial")
    const age = rows(subject, "aged")
    ini.forEach((r, i) => {
      const g = age[i] as Row
      if (Number.isNaN(f(r, "t_max_c"))) return
      n++
      expect(f(g, "t_max_c")).toBeGreaterThanOrEqual(f(r, "t_max_c"))
      expect(f(g, "q_in_mean_w_m2")).toBeGreaterThanOrEqual(
        f(r, "q_in_mean_w_m2"),
      )
    })
  }
  expect(n).toBeGreaterThan(6 * 90) // non-vacuous: the feasible candidates and the four coated or bare subjects
  // the check can fail: a coating that ages by gaining reflectance would be caught by the same comparison
  const a0 = rows("card_balanced", "aged")[0] as Row
  const i0 = rows("card_balanced", "initial")[0] as Row
  expect(f(a0, "t_max_c") - f(i0, "t_max_c")).toBeGreaterThan(0.1)
})

test("noSteelConstantsInContext", () => {
  const c = ctx.weather.roof.c_substrate_j_m2k.value
  expect(
    Math.abs(c - 2730 * 893 * 0.0005) / (2730 * 893 * 0.0005),
  ).toBeLessThan(1e-4)
  expect(() => validateSubstrate(c)).not.toThrow()
  expect(() => validateSubstrate(1540)).toThrow(ConfigError) // the steel figure
  for (const bad of [1500, 1219.5, 1218.9 * 1.001, 0, Number.NaN])
    expect(() => validateSubstrate(bad)).toThrow(ConfigError)
})

test("steelContextIsRefusedBeforeAnyWork", async () => {
  const steel = structuredClone(ctx)
  steel.weather.roof.c_substrate_j_m2k.value = 1540
  let err: unknown
  try {
    await batch(join(dir, "indonesia-steel"), { ctx: steel })
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ConfigError)
  expect((err as ConfigError).key).toBe("substrate.c_j_m2k")
})

test("sameCsvOneAndTwoWorkers", async () => {
  const one = join(dir, "indonesia-one")
  const two = join(dir, "indonesia-two")
  await batch(one, { workers: 1 })
  await batch(two, { workers: 2 })
  for (const n of [
    "indonesia_results.csv",
    "indonesia_summary.csv",
    "indonesia_days.json",
    "indonesia_crosscheck.csv",
  ])
    expect(csv(one, n) === csv(two, n)).toBe(true)
  expect(csv(one) === csv(join(dir, "indonesia"))).toBe(true)
})

test("siteWithNoDryMonthsReported", async () => {
  const seen: Record<string, unknown>[] = []
  setEventSink((event, _l, fields) => {
    if (event === "indonesia.season.dropped") seen.push(fields)
  })
  const out = join(dir, "indonesia-allwet")
  await batch(out, { cfg: { ...cfg, wet_month_mm: 1 } }) // every month wetter than 1 mm: no dry month
  const r = parseCsv(csv(out))
  expect(new Set(r.map((x) => x.season))).toEqual(new Set(["wet"]))
  expect(r.length).toBe(3 * 101 * 2) // 3 scenarios instead of 6
  expect(seen).toEqual([{ site: "jakarta", season: "dry" }])
  const days = JSON.parse(csv(out, "indonesia_days.json"))
  expect(days.sites[0].season_share).toEqual({ wet: 1 })
})

test("weightedBenefitHandComputed", () => {
  const row = (
    season: "wet" | "dry",
    bin: "hot" | "typical" | "overcast",
    subject: string,
    q: number,
    w = 0,
  ): IndonesiaRow => ({
    site: "s",
    season,
    bin,
    subject,
    state: "initial",
    r_solar_eff: 0.5,
    t_max_c: 40,
    t_max_lo: 40,
    t_max_hi: 40,
    q_in_mean_w_m2: q,
    q_lo: q - w,
    q_hi: q + w,
    tow_hours: 0,
    nominal_only: false,
  })
  const c0 = [
    row("wet", "hot", "C0", 10),
    row("wet", "typical", "C0", 8),
    row("wet", "overcast", "C0", 6),
    row("dry", "hot", "C0", 12),
    row("dry", "typical", "C0", 9),
    row("dry", "overcast", "C0", 7),
  ]
  const x = [
    row("wet", "hot", "X", 4, 1),
    row("wet", "typical", "X", 3, 1),
    row("wet", "overcast", "X", 2, 1),
    row("dry", "hot", "X", 5, 1),
    row("dry", "typical", "X", 3, 1),
    row("dry", "overcast", "X", 1, 1),
  ]
  // wet: 0.2 (10-4) + 0.6 (8-3) + 0.2 (6-2) = 5.0 ; dry: 0.2 (12-5) + 0.6 (9-3) + 0.2 (7-1) = 6.2
  const [one] = weightedBenefit([...c0, ...x], { s: { wet: 0.25, dry: 0.75 } })
  expect(one?.site).toBe("s")
  expect(one?.subject).toBe("X")
  expect(one?.dq_w_m2).toBeCloseTo(0.25 * 5.0 + 0.75 * 6.2, 12) // 5.9
  // interval subtraction: C0 is exact, X is +-1 everywhere, so the bounds sit one W/m2 away
  expect(one?.dq_lo).toBeCloseTo(5.9 - 1, 12)
  expect(one?.dq_hi).toBeCloseTo(5.9 + 1, 12)
  // without shares the seasons present count equally
  expect(weightedBenefit([...c0, ...x])[0]?.dq_w_m2).toBeCloseTo(5.6, 12)
  // a season without scenarios is left out and the rest renormalised
  const wetOnly = [...c0, ...x].filter((r) => r.season === "wet")
  expect(
    weightedBenefit(wetOnly, { s: { wet: 0.25 } })[0]?.dq_w_m2,
  ).toBeCloseTo(5.0, 12)
  // nothing but C0 gives no row; C0 itself is never a subject
  expect(weightedBenefit(c0)).toEqual([])
})

test("unknownSiteIsExit2", async () => {
  const r = await run([
    "indonesia",
    "--in",
    dir,
    "--out",
    join(dir, "nope"),
    "--site",
    "Atlantis",
    "--max-load",
    "1000",
  ])
  expect(r.exitCode).toBe(2)
  const e = events(r).find((x) => x.event === "error.raised")
  expect(e?.phase).toBe("config")
  expect(e?.key).toBe("site")
})

// ---- H4 on real days (oracle committed once from the real cache; scipy DOP853 segmented at every hour) ----
// Same frozen thresholds as thermalSeries.test.ts (plan 02 T_q_w_m2, T_rk4_series_k; T_RK4_HOURLY_K frozen in plan 04 Task 3).
test("matchesOracleOnRealDays", async () => {
  type Case = {
    site: string
    params: Parameters<typeof simulateSeriesDay>[0]
    series: Record<keyof HourlySeries, number[]>
    t_max_c: number
    q_in_mean_w_m2: number
    t_surface_k: number[]
  }
  const o = (await Bun.file(
    join(repoRoot, "tests/fixtures/oracle/thermalSeriesReal.json"),
  ).json()) as { h_a: number; h_b: number; cases: Case[] }
  expect(o.cases.length).toBe(20)
  expect(new Set(o.cases.map((c) => c.site)).size).toBeGreaterThanOrEqual(3)
  let mt = 0
  let mq = 0
  let ms = 0
  for (const c of o.cases) {
    const s = c.series
    const r = simulateSeriesDay(
      c.params,
      {
        g_w_m2: Float64Array.from(s.g_w_m2),
        t_air_c: Float64Array.from(s.t_air_c),
        rh_pct: Float64Array.from(s.rh_pct),
        wind_m_s: Float64Array.from(s.wind_m_s),
        lw_down_w_m2: Float64Array.from(s.lw_down_w_m2),
      },
      o.h_a,
      o.h_b,
    )
    mt = Math.max(mt, Math.abs(r.t_max_c - c.t_max_c))
    mq = Math.max(mq, Math.abs(r.q_in_mean_w_m2 - c.q_in_mean_w_m2))
    for (let i = 0; i < 144; i++)
      ms = Math.max(
        ms,
        Math.abs((r.t_surface_k[i] as number) - (c.t_surface_k[i] as number)),
      )
  }
  console.log(
    `real-day oracle max errors: t_max ${mt} K, q ${mq} W/m2, series ${ms} K`,
  )
  expect(mt).toBeLessThanOrEqual(5e-3) // T_RK4_HOURLY_K (plan 04 Task 3, frozen)
  expect(mq).toBeLessThanOrEqual(1e-3) // T_q_w_m2
  expect(ms).toBeLessThanOrEqual(3e-4) // T_rk4_series_k
})
