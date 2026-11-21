import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"
import { toCsv } from "../core/csv"
import { DataError, SpandekError } from "../core/errors"
import { emitEvent } from "../core/events"
import {
  type DayBin,
  dailyGhiKwhM2,
  type LocalDay,
  localDays,
  monthlyPrecipMm,
  type Season,
  type SelectedDay,
  selectSiteDays,
  timeOfWetnessHours,
} from "../core/indonesia/days"
import {
  type IndonesiaConfig,
  type IndonesiaRow,
  type SiteConfig,
  validateSeries,
  validateSubstrate,
} from "../core/indonesia/series"
import { safeJson } from "../core/json"
import type { ModelContext } from "../core/pipeline/context"
import { widenInterval } from "../core/pipeline/uncertainty"
import type { FlaggedDesignRow } from "../core/schema"
import { registerInManifest } from "./budget"
import { sha256Hex, verifyData } from "./data"
import { readTmyx } from "./epw"
import {
  type IndonesiaJob,
  type IndonesiaMsg,
  N_UNCERTAIN,
  OUT,
  STATES,
} from "./indonesiaWorker"
import { emit, levelEnabled } from "./logging"
import { readSiteYear } from "./power"
import { MANIFEST_FILE } from "./report/manifest"
import { effectiveWorkers, readDesign } from "./simulate"

export const INDONESIA_COLUMNS: readonly string[] = [
  "site",
  "season",
  "bin",
  "subject",
  "state",
  "r_solar_eff",
  "t_max_c",
  "t_max_lo",
  "t_max_hi",
  "q_in_mean_w_m2",
  "q_lo",
  "q_hi",
  "tow_hours",
  "nominal_only",
]
/** Candidates that fail the plan-1 constraints are not simulated (as in plan 3); nominal-only rows carry no interval. */
export const INDONESIA_NAN_COLUMNS: ReadonlySet<string> = new Set([
  "r_solar_eff",
  "t_max_c",
  "t_max_lo",
  "t_max_hi",
  "q_in_mean_w_m2",
  "q_lo",
  "q_hi",
])
export const SUMMARY_COLUMNS: readonly string[] = [
  "site",
  "bin",
  "subject",
  "state",
  "t_max_c",
  "t_max_lo",
  "t_max_hi",
  "q_in_mean_w_m2",
  "q_lo",
  "q_hi",
  "dq_w_m2",
  "dq_lo",
  "dq_hi",
]
export const CROSSCHECK_COLUMNS: readonly string[] = [
  "site",
  "month",
  "nasa_ghi_kwh_m2_day",
  "tmyx_ghi_kwh_m2_day",
  "ghi_rel_diff",
]
export const OUTPUT_FILES = [
  "indonesia_days.json",
  "indonesia_results.csv",
  "indonesia_summary.csv",
  "indonesia_crosscheck.csv",
] as const

/** FR-5 bin weights: the shares of the days in the hot (above the 80th percentile), typical and overcast bins. */
export const BIN_WEIGHT: Record<DayBin, number> = {
  hot: 0.2,
  typical: 0.6,
  overcast: 0.2,
}
export const UNCERTAIN_SUBJECTS = [
  "C0",
  "C1",
  "card_high",
  "card_balanced",
  "card_low",
] as const
const STATE_NAMES = ["initial", "aged"] as const
const BINS: readonly DayBin[] = ["hot", "typical", "overcast"]
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export type SeasonShares = Record<string, Partial<Record<Season, number>>>
export type Benefit = {
  site: string
  subject: string
  state: string
  dq_w_m2: number
  dq_lo: number
  dq_hi: number
}

const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

// ---- FR-5: weighted benefit ----

type Pick = (r: IndonesiaRow) => number

/** Normalised weights of the (season, bin) cells of one site: `weighted` uses season share x bin weight, a bin its season share. */
function cellWeights(
  rows: readonly IndonesiaRow[],
  bin: DayBin | "weighted",
  shares?: Partial<Record<Season, number>>,
): Map<string, number> {
  const seasons = [...new Set(rows.map((r) => r.season))]
  const raw = new Map<string, number>()
  for (const season of seasons) {
    const share = shares ? (shares[season] ?? 0) : 1 / seasons.length
    for (const b of BINS) {
      if (bin !== "weighted" && b !== bin) continue
      if (!rows.some((r) => r.season === season && r.bin === b)) continue
      raw.set(
        `${season}|${b}`,
        share * (bin === "weighted" ? BIN_WEIGHT[b] : 1),
      )
    }
  }
  const total = [...raw.values()].reduce((a, c) => a + c, 0)
  const out = new Map<string, number>()
  for (const [k, v] of raw) out.set(k, v / total)
  return out
}

function weighted(
  rows: readonly IndonesiaRow[],
  w: Map<string, number>,
  value: Pick,
): number {
  let sum = 0
  for (const [k, wt] of w) {
    const [season, bin] = k.split("|")
    const r = rows.find((x) => x.season === season && x.bin === bin)
    if (r === undefined) return Number.NaN
    sum += wt * value(r)
  }
  return sum
}

type Group = { c0: readonly IndonesiaRow[]; x: readonly IndonesiaRow[] }

/** dq = weighted (q(C0) - q(x)); the interval subtracts interval from interval (draws are not paired: conservative). */
function benefitOf(
  g: Group,
  bin: DayBin | "weighted",
  shares?: Partial<Record<Season, number>>,
): { dq: number; lo: number; hi: number } {
  const w = cellWeights(g.x, bin, shares)
  const at = (
    rows: readonly IndonesiaRow[],
    r: IndonesiaRow,
    f: (x: IndonesiaRow) => number,
  ) => {
    const m = rows.find((c) => c.season === r.season && c.bin === r.bin)
    if (m === undefined) throw new DataError("C0", "no C0 row for a scenario")
    return f(m)
  }
  return {
    dq: weighted(
      g.x,
      w,
      (r) => at(g.c0, r, (c) => c.q_in_mean_w_m2) - r.q_in_mean_w_m2,
    ),
    lo: weighted(g.x, w, (r) => at(g.c0, r, (c) => c.q_lo) - r.q_hi),
    hi: weighted(g.x, w, (r) => at(g.c0, r, (c) => c.q_hi) - r.q_lo),
  }
}

function grouped(
  rows: readonly IndonesiaRow[],
): { site: string; subject: string; state: string; g: Group }[] {
  const out: { site: string; subject: string; state: string; g: Group }[] = []
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.subject === "C0") continue
    const key = `${r.site}|${r.state}|${r.subject}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      site: r.site,
      subject: r.subject,
      state: r.state,
      g: {
        c0: rows.filter(
          (c) => c.site === r.site && c.state === r.state && c.subject === "C0",
        ),
        x: rows.filter(
          (c) =>
            c.site === r.site && c.state === r.state && c.subject === r.subject,
        ),
      },
    })
  }
  return out
}

/**
 * FR-5: per site, subject and state, dq = sum over seasons (share of the days of the season, from the data) and bins
 * (0.2 hot, 0.6 typical, 0.2 overcast) of q_in_mean(C0) - q_in_mean(x). A season or a bin without a scenario is left
 * out and the remaining weights are renormalised. Without `shares` the seasons present count equally.
 */
export function weightedBenefit(
  rows: readonly IndonesiaRow[],
  shares?: SeasonShares,
): Benefit[] {
  return grouped(rows).map(({ site, subject, state, g }) => {
    const b = benefitOf(g, "weighted", shares?.[site])
    return { site, subject, state, dq_w_m2: b.dq, dq_lo: b.lo, dq_hi: b.hi }
  })
}

type SummaryRow = Record<string, string | number>

/** indonesia_summary.csv: the five uncertain subjects, per site, day type (and the weighted view), initial and aged. */
export function summarise(
  rows: readonly IndonesiaRow[],
  shares: SeasonShares,
): SummaryRow[] {
  const out: SummaryRow[] = []
  const sites = [...new Set(rows.map((r) => r.site))]
  for (const site of sites) {
    for (const bin of [...BINS, "weighted"] as const) {
      for (const subject of UNCERTAIN_SUBJECTS) {
        for (const state of STATE_NAMES) {
          const mine = rows.filter(
            (r) =>
              r.site === site && r.subject === subject && r.state === state,
          )
          if (mine.length === 0) continue
          const w = cellWeights(mine, bin, shares[site])
          if (w.size === 0) continue
          const c0 = rows.filter(
            (r) => r.site === site && r.subject === "C0" && r.state === state,
          )
          const b =
            subject === "C0"
              ? { dq: 0, lo: 0, hi: 0 }
              : benefitOf({ c0, x: mine }, bin, shares[site])
          const avg = (f: Pick) => weighted(mine, w, f)
          out.push({
            site,
            bin,
            subject,
            state,
            t_max_c: avg((r) => r.t_max_c),
            t_max_lo: avg((r) => r.t_max_lo),
            t_max_hi: avg((r) => r.t_max_hi),
            q_in_mean_w_m2: avg((r) => r.q_in_mean_w_m2),
            q_lo: avg((r) => r.q_lo),
            q_hi: avg((r) => r.q_hi),
            dq_w_m2: b.dq,
            dq_lo: b.lo,
            dq_hi: b.hi,
          })
        }
      }
    }
  }
  return out
}

// ---- loading the cache ----

const loadErr = (key: string, message: string) =>
  new SpandekError(5, "indonesia.load", key, message)

function asLoad<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof DataError)
      throw new SpandekError(5, "indonesia.load", e.key, e.message)
    throw e
  }
}

export type SiteData = {
  site: SiteConfig
  days: LocalDay[]
  picks: SelectedDay[]
  tow_hours_per_year: number
  shares: Partial<Record<Season, number>>
  crosscheck: { month: number; nasa: number; tmyx: number }[]
}

/** One site: the ten years, local days, every day validated (F1, F2, F8), the representative days, TOW and the cross-check. */
export function loadSite(
  site: SiteConfig,
  weatherDir: string,
  cfg: IndonesiaConfig,
): SiteData {
  return asLoad(() => {
    const hours = []
    for (let y = cfg.first_year; y <= cfg.last_year; y++)
      for (const h of readSiteYear(weatherDir, site.id, y)) hours.push(h)
    const days = localDays(hours, site.utc_offset_h)
    for (const d of days) validateSeries(d.series, site.id)
    const picks = selectSiteDays(site.id, days, cfg.wet_month_mm)
    for (const season of ["wet", "dry"] as const)
      if (!picks.some((p) => p.season === season))
        emitEvent("indonesia.season.dropped", "warn", {
          site: site.id,
          season,
        })
    const precip = monthlyPrecipMm(days)
    let tow = 0
    const share: Record<Season, number> = { wet: 0, dry: 0 }
    const perMonth = new Array<{ sum: number; n: number }>(12)
    for (let m = 0; m < 12; m++) perMonth[m] = { sum: 0, n: 0 }
    for (const d of days) {
      tow += timeOfWetnessHours(
        d.series.rh_pct,
        d.series.t_air_c,
        cfg.tow_rh_above_pct,
        cfg.tow_t_above_c,
      )
      const m = Number(d.date.slice(5, 7)) - 1
      share[(precip[m] as number) > cfg.wet_month_mm ? "wet" : "dry"]++
      const e = perMonth[m] as { sum: number; n: number }
      e.sum += dailyGhiKwhM2(d.series)
      e.n++
    }
    const total = share.wet + share.dry
    const tmyx = readTmyx(weatherDir, site.id)
    const crosscheck = perMonth.map((e, i) => {
      let wh = 0
      for (let k = 0; k < tmyx.ghi.length; k++)
        if (tmyx.month[k] === i + 1) wh += tmyx.ghi[k] as number
      return {
        month: i + 1,
        nasa: e.sum / e.n,
        tmyx: wh / 1000 / (MONTH_DAYS[i] as number),
      }
    })
    const shares: Partial<Record<Season, number>> = {}
    for (const s of ["wet", "dry"] as const)
      if (share[s] > 0) shares[s] = share[s] / total
    return {
      site,
      days,
      picks,
      tow_hours_per_year: Math.round((tow / days.length) * 365.25 * 10) / 10,
      shares,
      crosscheck,
    }
  })
}

// ---- the batch ----

export type IndonesiaOpts = {
  /** Output directory; when it lies inside `dir` and `dir` holds a run manifest, the files are registered in extra[]. */
  out: string
  /** Directory with raw/, tmyx/ and SHA256SUMS (data/indonesia). */
  weatherDir: string
  sites: readonly SiteConfig[]
  cfg: IndonesiaConfig
  workers?: number
  signal?: AbortSignal
}

type Eval = {
  /** [eval][subject][state][day][field] */
  data: Float64Array
  nominal: Float64Array
  rEff: Float64Array
}

async function evaluate(
  job: Omit<IndonesiaJob, "lo" | "hi" | "forwardDebug">,
  workers: number,
  signal?: AbortSignal,
): Promise<Eval> {
  const nEval = job.nMc + 1
  const S = job.days.length
  const nW = Math.min(effectiveWorkers(workers), nEval)
  const perEval = N_UNCERTAIN * STATES * S * OUT
  const all = new Float64Array(nEval * perEval)
  let nominal: Float64Array | null = null
  let rEff: Float64Array | null = null
  let done = 0
  let progressSent = 0
  const size = Math.ceil(nEval / nW)
  const pool: Worker[] = []
  const stop = () => {
    for (const w of pool) w.terminate()
  }
  const forwardDebug = levelEnabled("debug")
  try {
    await new Promise<void>((resolve, reject) => {
      let pending = 0
      let failed = false
      const fail = (e: Error) => {
        if (failed) return
        failed = true
        stop()
        reject(e)
      }
      if (signal?.aborted) return fail(new Error("aborted"))
      signal?.addEventListener("abort", () => fail(new Error("aborted")), {
        once: true,
      })
      for (let i = 0; i < nW; i++) {
        const lo = i * size
        const hi = Math.min(nEval, lo + size)
        if (lo >= hi) continue
        pending++
        const w = new Worker(
          new URL("./indonesiaWorker.ts", import.meta.url).href,
        )
        pool.push(w)
        w.onmessage = (e: MessageEvent<IndonesiaMsg>) => {
          const m = e.data
          if (m.type === "events") {
            for (const ev of m.list) emit(ev.event, ev.level, ev.fields)
          } else if (m.type === "eval") {
            done++
            while (
              progressSent < 10 &&
              done >= Math.ceil(((progressSent + 1) * nEval) / 10)
            ) {
              progressSent++
              emit("sim.progress", "info", { done, total: nEval })
            }
          } else if (m.type === "done") {
            all.set(m.data, lo * perEval)
            if (m.nominal) nominal = m.nominal
            if (m.rEff) rEff = m.rEff
            w.terminate()
            if (--pending === 0 && !failed) resolve()
          } else {
            const x = m.error
            fail(
              x.code !== undefined
                ? new SpandekError(
                    x.code as 2 | 3 | 4 | 5 | 6,
                    x.phase ?? "model",
                    x.key,
                    x.message,
                  )
                : new Error(x.message),
            )
          }
        }
        w.onerror = (ev) => fail(new Error(ev.message || "worker crashed"))
        w.postMessage({ ...job, lo, hi, forwardDebug } satisfies IndonesiaJob)
      }
      if (pending === 0) resolve()
    })
  } finally {
    stop()
  }
  if (nominal === null || rEff === null)
    throw new Error("worker returned no nominal block")
  return { data: all, nominal, rEff }
}

const atomicWrite = (files: [string, string][]): void => {
  const tmps = files.map(([p]) => `${p}.tmp`)
  try {
    for (const [i, [, text]] of files.entries())
      writeFileSync(tmps[i] as string, text)
  } catch (e) {
    for (const t of tmps) rmSync(t, { force: true })
    throw e
  }
  for (const [i, [p]] of files.entries()) renameSync(tmps[i] as string, p)
}

/**
 * Plan 04 Task 5. `dir` is the plan-3 directory (candidates.csv). Verifies the cache (F3), loads and validates the
 * ten years of every site (F1, F2, F8), selects the representative days, runs every subject on every day initial and aged
 * with the series model (nominal for the 96 candidates, nMc draws plus the ageing loss for C0, C1 and the three cards),
 * and writes indonesia_days.json, indonesia_results.csv, indonesia_summary.csv and indonesia_crosscheck.csv into opts.out.
 * The output is byte-identical for one and two workers.
 */
export async function runIndonesia(
  ctx: ModelContext,
  shortlist: Record<string, string>,
  seed: number,
  nMc: number,
  dir: string,
  opts: IndonesiaOpts,
): Promise<void> {
  validateSubstrate(ctx.weather.roof.c_substrate_j_m2k.value) // H8, F9: aluminium, never steel
  const design = readCandidates(dir)
  const byId = new Map(design.map((r) => [r.candidate_id, r]))
  const cards = (["high_performing", "balanced", "low_cost"] as const).map(
    (role) => {
      const c = byId.get(shortlist[role] as string)
      if (c === undefined || !c.feasible)
        throw new SpandekError(
          2,
          "config",
          "shortlist",
          `${role} candidate is not a feasible design row`,
        )
      return c
    },
  )
  try {
    await verifyData(opts.weatherDir)
  } catch (e) {
    if (e instanceof DataError)
      throw new SpandekError(5, "indonesia.verify", e.key, e.message)
    throw e
  }
  const data = opts.sites.map((s) => loadSite(s, opts.weatherDir, opts.cfg))
  const scen: { site: SiteData; pick: SelectedDay }[] = []
  for (const sd of data)
    for (const pick of sd.picks) scen.push({ site: sd, pick })
  const days = scen.map((s) => (s.site.days[s.pick.index] as LocalDay).series)

  const crossRows: Record<string, string | number>[] = []
  for (const sd of data)
    for (const c of sd.crosscheck) {
      const rel = (c.nasa - c.tmyx) / c.tmyx
      emit("indonesia.epw.crosscheck", "info", {
        site: sd.site.id,
        month: c.month,
        ghi_rel_diff: rel,
      })
      crossRows.push({
        site: sd.site.id,
        month: c.month,
        nasa_ghi_kwh_m2_day: c.nasa,
        tmyx_ghi_kwh_m2_day: c.tmyx,
        ghi_rel_diff: rel,
      })
    }

  const candidates = [...design].sort((a, b) =>
    idCmp(a.candidate_id, b.candidate_id),
  )
  const ev = await evaluate(
    {
      ctx,
      cards,
      candidates,
      days,
      nMc,
      seed,
      lossLo: opts.cfg.loss_lo,
      lossHi: opts.cfg.loss_hi,
    },
    opts.workers ?? 2,
    opts.signal,
  )
  const S = days.length
  const perEval = N_UNCERTAIN * STATES * S * OUT
  const at = (e: number, u: number, st: number, s: number, f: number) =>
    ev.data[e * perEval + ((u * STATES + st) * S + s) * OUT + f] as number
  const draw = new Float64Array(nMc)
  const band = (u: number, st: number, s: number, f: number) => {
    const p = at(0, u, st, s, f)
    for (let d = 0; d < nMc; d++) draw[d] = at(d + 1, u, st, s, f)
    return { p, ...widenInterval(p, draw) }
  }

  const rows: IndonesiaRow[] = []
  scen.forEach(({ site, pick }, s) => {
    const base = {
      site: site.site.id,
      season: pick.season,
      bin: pick.bin,
      tow_hours: site.tow_hours_per_year,
    }
    UNCERTAIN_SUBJECTS.forEach((subject, u) => {
      STATE_NAMES.forEach((state, st) => {
        const t = band(u, st, s, 0)
        const q = band(u, st, s, 1)
        rows.push({
          ...base,
          subject,
          state,
          r_solar_eff: ev.rEff[u * STATES + st] as number,
          t_max_c: t.p,
          t_max_lo: t.lo,
          t_max_hi: t.hi,
          q_in_mean_w_m2: q.p,
          q_lo: q.lo,
          q_hi: q.hi,
          nominal_only: false,
        } as IndonesiaRow)
      })
    })
    candidates.forEach((c, ci) => {
      STATE_NAMES.forEach((state, st) => {
        const o = ((ci * STATES + st) * S + s) * OUT
        rows.push({
          ...base,
          subject: c.candidate_id,
          state,
          r_solar_eff: ev.rEff[
            N_UNCERTAIN * STATES + ci * STATES + st
          ] as number,
          t_max_c: ev.nominal[o] as number,
          t_max_lo: Number.NaN,
          t_max_hi: Number.NaN,
          q_in_mean_w_m2: ev.nominal[o + 1] as number,
          q_lo: Number.NaN,
          q_hi: Number.NaN,
          nominal_only: true,
        } as IndonesiaRow)
      })
    })
  })

  const shares: SeasonShares = {}
  for (const sd of data) shares[sd.site.id] = sd.shares
  const summary = summarise(rows, shares)
  const daysJson = {
    seed,
    n_mc: nMc,
    loss_lo: opts.cfg.loss_lo,
    loss_hi: opts.cfg.loss_hi,
    loss_nominal: 0.5 * (opts.cfg.loss_lo + opts.cfg.loss_hi),
    first_year: opts.cfg.first_year,
    last_year: opts.cfg.last_year,
    shortlist: {
      card_high: shortlist.high_performing,
      card_balanced: shortlist.balanced,
      card_low: shortlist.low_cost,
    },
    sites: data.map((sd) => ({
      id: sd.site.id,
      utc_offset_h: sd.site.utc_offset_h,
      elevation_m: sd.site.elevation_m,
      local_days: sd.days.length,
      tow_hours_per_year: sd.tow_hours_per_year,
      season_share: sd.shares,
      days: sd.picks.map((p) => ({
        season: p.season,
        bin: p.bin,
        date: p.date,
        ghi_kwh_m2: p.ghi_kwh_m2,
        series: {
          g_w_m2: Array.from((sd.days[p.index] as LocalDay).series.g_w_m2),
          t_air_c: Array.from((sd.days[p.index] as LocalDay).series.t_air_c),
          rh_pct: Array.from((sd.days[p.index] as LocalDay).series.rh_pct),
          wind_m_s: Array.from((sd.days[p.index] as LocalDay).series.wind_m_s),
          lw_down_w_m2: Array.from(
            (sd.days[p.index] as LocalDay).series.lw_down_w_m2,
          ),
        },
      })),
    })),
  }
  const nanOpts = { nanColumns: INDONESIA_NAN_COLUMNS }
  mkdirSync(opts.out, { recursive: true })
  const files: [string, string][] = [
    ["indonesia_days.json", `${safeJson(daysJson, 2)}\n`],
    [
      "indonesia_results.csv",
      toCsv(
        INDONESIA_COLUMNS,
        rows as unknown as Record<string, string | number | boolean>[],
        nanOpts,
      ),
    ],
    ["indonesia_summary.csv", toCsv(SUMMARY_COLUMNS, summary)],
    ["indonesia_crosscheck.csv", toCsv(CROSSCHECK_COLUMNS, crossRows)],
  ]
  atomicWrite(files.map(([n, t]) => [join(opts.out, n), t]))
  registerOutputs(dir, opts.out, files)
  console.log(
    `indonesia: ${rows.length} result rows, ${summary.length} summary rows, ${S} scenarios, ${nMc} draws`,
  )
}

/** Plan-3 candidates.csv (validated, D11 flag checked by the plan-3 reader). */
function readCandidates(dir: string): FlaggedDesignRow[] {
  try {
    return readDesign(dir)
  } catch (e) {
    if (e instanceof SpandekError && e.code === 5)
      throw loadErr(e.key ?? "candidates.csv", e.message)
    throw e
  }
}

/** extra[] of the manifest, so the report can refuse a changed file; skipped when the manifest or the nesting is absent. */
function registerOutputs(
  dir: string,
  out: string,
  files: [string, string][],
): void {
  const mp = join(dir, MANIFEST_FILE)
  if (!existsSync(mp)) return
  const rel = relative(resolve(dir), resolve(out))
  if (rel.startsWith("..") || isAbsolute(rel)) return
  for (const [name, text] of files)
    registerInManifest(mp, {
      path: join(rel, name).split("\\").join("/"),
      sha256: sha256Hex(text),
      bytes: Buffer.byteLength(text),
      kind: "indonesia",
    })
}

/**
 * The TMYx consistency check of one site (H2): monthly mean daily GHI of the ten NASA POWER years against the TMYx typical
 * year, relative difference (nasa - tmyx) / tmyx. Both products are modelled (reanalysis and satellite), so this checks that
 * they agree, not that either matches ground observations.
 */
export function siteCrossCheck(
  site: SiteConfig,
  weatherDir: string,
  cfg: IndonesiaConfig,
): { site: string; month: number; nasa: number; tmyx: number; rel: number }[] {
  return loadSite(site, weatherDir, cfg).crosscheck.map((c) => ({
    site: site.id,
    month: c.month,
    nasa: c.nasa,
    tmyx: c.tmyx,
    rel: (c.nasa - c.tmyx) / c.tmyx,
  }))
}
