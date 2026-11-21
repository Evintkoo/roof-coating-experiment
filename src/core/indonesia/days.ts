import { DataError } from "../errors"
import { emitEvent } from "../events"
import type { HourlySeries, HourRecord } from "./series"

const HOUR_MS = 3_600_000

export type LocalDay = {
  /** Local civil date, YYYY-MM-DD. */
  date: string
  series: HourlySeries
  /** Sum of the 24 hourly precipitation values (mm). */
  precip_mm: number
}

export type Season = "wet" | "dry"
export type DayBin = "hot" | "typical" | "overcast"
export type DayPick = { season: Season; bin: DayBin; index: number }

const SEASONS: readonly Season[] = ["wet", "dry"]
const BINS: readonly DayBin[] = ["hot", "typical", "overcast"]

const isoDate = (localMs: number): string =>
  new Date(localMs).toISOString().slice(0, 10)

/**
 * Cuts a contiguous UTC hourly series into complete local days (D1: fixed civil offset, no daylight saving).
 * The first and the last local day of the series are dropped when they are partial: a series that starts or ends
 * at UTC midnight always has such a day (spike Q1, edge effect). Any hole, duplicate or off-grid stamp inside the
 * series is a DataError (F2), so a missing hour never shrinks a day silently.
 */
export function localDays(
  utcHours: readonly HourRecord[],
  utcOffsetH: number,
): LocalDay[] {
  const off = utcOffsetH * HOUR_MS
  type Group = { date: string; rows: HourRecord[]; firstLocalHour: number }
  const groups: Group[] = []
  let prev: number | undefined
  for (const r of utcHours) {
    if (!Number.isInteger(r.utc_ms / HOUR_MS)) {
      throw new DataError(
        "utc_ms",
        `time stamp ${r.utc_ms} is not on a full hour`,
      )
    }
    if (prev !== undefined && r.utc_ms - prev !== HOUR_MS) {
      throw new DataError(
        "utc_ms",
        `hourly series has a gap or duplicate after ${new Date(prev).toISOString()}`,
      )
    }
    prev = r.utc_ms
    const local = r.utc_ms + off
    const date = isoDate(local)
    let g = groups[groups.length - 1]
    if (!g || g.date !== date) {
      g = {
        date,
        rows: [],
        firstLocalHour: (((local / HOUR_MS) % 24) + 24) % 24,
      }
      groups.push(g)
    }
    g.rows.push(r)
  }
  const out: LocalDay[] = []
  groups.forEach((g, gi) => {
    const complete = g.rows.length === 24 && g.firstLocalHour === 0
    if (!complete) {
      if (gi === 0 || gi === groups.length - 1) return // boundary partial, dropped
      throw new DataError(
        "utc_ms",
        `local day ${g.date} has ${g.rows.length} hourly points, expected 24`,
      )
    }
    const col = (f: (r: HourRecord) => number) => Float64Array.from(g.rows, f)
    out.push({
      date: g.date,
      series: {
        g_w_m2: col((r) => r.g_w_m2),
        t_air_c: col((r) => r.t_air_c),
        rh_pct: col((r) => r.rh_pct),
        wind_m_s: col((r) => r.wind_m_s),
        lw_down_w_m2: col((r) => r.lw_down_w_m2),
      },
      precip_mm: g.rows.reduce((a, r) => a + r.precip_mm, 0),
    })
  })
  return out
}

/** Daily global horizontal irradiation in kWh/m2: the 24 hourly means (W/m2) summed over one hour each. */
export const dailyGhiKwhM2 = (s: HourlySeries): number => {
  let sum = 0
  for (const v of s.g_w_m2) sum += v
  return sum / 1000
}

/**
 * Ten-year mean monthly precipitation total (mm) for calendar months 1..12 (D2), from the mean over the years in which
 * the month is complete. A month of a year that lost a boundary day (January of the first year) is left out.
 */
export function monthlyPrecipMm(
  days: readonly { date: string; precip_mm: number }[],
): number[] {
  const perMonth = new Map<string, { n: number; mm: number }>()
  for (const d of days) {
    const key = d.date.slice(0, 7)
    const e = perMonth.get(key) ?? { n: 0, mm: 0 }
    e.n++
    e.mm += d.precip_mm
    perMonth.set(key, e)
  }
  const sums = new Array<number>(12).fill(0)
  const counts = new Array<number>(12).fill(0)
  for (const [key, e] of perMonth) {
    const y = Number(key.slice(0, 4))
    const m = Number(key.slice(5, 7))
    if (e.n !== new Date(Date.UTC(y, m, 0)).getUTCDate()) continue
    sums[m - 1] = (sums[m - 1] as number) + e.mm
    counts[m - 1] = (counts[m - 1] as number) + 1
  }
  return sums.map((s, i) => {
    if ((counts[i] as number) === 0)
      throw new DataError(
        "precip_mm",
        `no complete month ${i + 1} in the series`,
      )
    return s / (counts[i] as number)
  })
}

/**
 * FR-1 and D2. Months with a ten-year mean precipitation above wetMonthMm are wet, the others dry. In each season the
 * days are ranked by daily GHI (ties by index); with n days, ranks r < ceil((n-1)/5) are overcast (below the 20th
 * percentile of the linear-interpolation definition), r > floor(4(n-1)/5) are hot (above the 80th), the rest typical.
 * The pick of a bin is its lower-median rank. Order: wet then dry, hot, typical, overcast; a season without a
 * month, or an empty bin, yields no pick.
 */
export function pickDays(
  dailyGhi: readonly number[],
  months: readonly number[],
  monthlyPrecip: readonly number[],
  wetMonthMm = 150,
): DayPick[] {
  if (dailyGhi.length !== months.length) {
    throw new DataError("days", "dailyGhi and months differ in length")
  }
  if (monthlyPrecip.length !== 12) {
    throw new DataError("precip_mm", "monthlyPrecip must hold 12 values")
  }
  const picks: DayPick[] = []
  for (const season of SEASONS) {
    const idx: number[] = []
    for (let i = 0; i < dailyGhi.length; i++) {
      const wet =
        (monthlyPrecip[(months[i] as number) - 1] as number) > wetMonthMm
      if (wet === (season === "wet")) idx.push(i)
    }
    const n = idx.length
    if (n === 0) continue
    idx.sort(
      (a, b) => (dailyGhi[a] as number) - (dailyGhi[b] as number) || a - b,
    )
    const overcastEnd = Math.ceil((n - 1) / 5)
    const hotStart = Math.floor((4 * (n - 1)) / 5) + 1
    const ranges: Record<DayBin, [number, number]> = {
      overcast: [0, overcastEnd],
      typical: [overcastEnd, hotStart],
      hot: [hotStart, n],
    }
    for (const bin of BINS) {
      const [lo, hi] = ranges[bin]
      if (hi <= lo) continue
      picks.push({
        season,
        bin,
        index: idx[lo + Math.floor((hi - lo - 1) / 2)] as number,
      })
    }
  }
  return picks
}

export type SelectedDay = DayPick & { date: string; ghi_kwh_m2: number }

/** pickDays on local days of one site; emits indonesia.days.selected (info) per pick. */
export function selectSiteDays(
  site: string,
  days: readonly LocalDay[],
  wetMonthMm = 150,
): SelectedDay[] {
  const ghi = days.map((d) => dailyGhiKwhM2(d.series))
  const months = days.map((d) => Number(d.date.slice(5, 7)))
  const picks = pickDays(ghi, months, monthlyPrecipMm(days), wetMonthMm)
  return picks.map((p) => {
    const d = days[p.index] as LocalDay
    const out = { ...p, date: d.date, ghi_kwh_m2: ghi[p.index] as number }
    emitEvent("indonesia.days.selected", "info", {
      site,
      season: p.season,
      bin: p.bin,
      local_date: d.date,
      daily_ghi_kwh_m2: out.ghi_kwh_m2,
    })
    return out
  })
}

/** D7: hours with RH above rhAbove (%) and air temperature above tAbove (degC). */
export function timeOfWetnessHours(
  rh: Float64Array,
  tC: Float64Array,
  rhAbove = 80,
  tAbove = 0,
): number {
  if (rh.length !== tC.length) {
    throw new DataError("rh_pct", "rh and temperature differ in length")
  }
  let n = 0
  for (let i = 0; i < rh.length; i++) {
    if ((rh[i] as number) > rhAbove && (tC[i] as number) > tAbove) n++
  }
  return n
}
