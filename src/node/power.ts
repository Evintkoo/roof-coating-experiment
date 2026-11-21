import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { DataError, ResourceError } from "../core/errors"
import type { HourRecord, SiteConfig } from "../core/indonesia/series"
import { listDataFiles, SUMS_FILE, sha256Hex } from "./data"
import { emit } from "./logging"

/** NASA POWER hourly point API (spike Q1: v2.10.5, community RE, JSON spans at most 5 years, fill value -999). */
export const POWER_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"
export const POWER_PARAMETERS = [
  "ALLSKY_SFC_SW_DWN",
  "ALLSKY_SFC_LW_DWN",
  "T2M",
  "RH2M",
  "WS2M",
  "PRECTOTCORR",
] as const
/** Generic client name: no personal data in the request (spike Q1). */
export const USER_AGENT = "roof-coating-research-client/1.0"
const FILL_VALUE = -999
const MAX_BYTES = 8 * 1024 * 1024
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"])

/** Cache path of one site-year relative to the data directory. */
export const rawName = (siteId: string, year: number): string =>
  `raw/${siteId}_${year}.json`

export type FetchOpts = {
  /** YYYYMMDD start and end (UTC days); default the whole UTC calendar year. */
  span?: { start: string; end: string }
  /** Back-off unit for HTTP 429 and 5xx (attempt k waits k times this), default 2000 ms. */
  retryDelayMs?: number
  maxAttempts?: number
}

function expectedHours(start: string, end: string): number {
  const ms = (s: string) =>
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
    )
  return ((ms(end) - ms(start)) / 86_400_000 + 1) * 24
}

type PowerJson = {
  header?: { time_standard?: string; fill_value?: number }
  properties?: { parameter?: Record<string, Record<string, unknown>> }
}

/**
 * Parses a cached or fetched NASA POWER response into hourly records (UTC hour start, key YYYYMMDDHH).
 * DataError (exit 5) unless the time standard is UTC (a local-solar-time file would shift every day cut), every
 * parameter has the same consecutive hours, and no value is the fill value or non-numeric.
 */
export function parsePowerJson(text: string, label: string): HourRecord[] {
  let doc: PowerJson
  try {
    doc = JSON.parse(text) as PowerJson
  } catch {
    throw new DataError(label, "response is not JSON")
  }
  if (String(doc.header?.time_standard).toUpperCase() !== "UTC") {
    throw new DataError(label, "time standard is not UTC")
  }
  const par = doc.properties?.parameter
  if (!par)
    throw new DataError(label, "no properties.parameter in the response")
  for (const name of POWER_PARAMETERS) {
    if (!par[name]) throw new DataError(label, `parameter ${name} missing`)
  }
  const keys = Object.keys(par.T2M as object)
  const out: HourRecord[] = []
  let prev = Number.NEGATIVE_INFINITY
  for (const k of keys) {
    if (!/^\d{10}$/.test(k)) throw new DataError(label, `bad time key ${k}`)
    const ms = Date.UTC(
      Number(k.slice(0, 4)),
      Number(k.slice(4, 6)) - 1,
      Number(k.slice(6, 8)),
      Number(k.slice(8, 10)),
    )
    if (ms - prev !== 3_600_000 && prev !== Number.NEGATIVE_INFINITY) {
      throw new DataError(label, `time keys not consecutive at ${k}`)
    }
    prev = ms
    const v = (name: (typeof POWER_PARAMETERS)[number]): number => {
      const x = (par[name] as Record<string, unknown>)[k]
      if (typeof x !== "number" || !Number.isFinite(x))
        throw new DataError(label, `${name} missing or not a number at ${k}`)
      if (x === FILL_VALUE)
        throw new DataError(label, `${name} fill value -999 at ${k}`)
      return x
    }
    out.push({
      utc_ms: ms,
      g_w_m2: v("ALLSKY_SFC_SW_DWN"),
      lw_down_w_m2: v("ALLSKY_SFC_LW_DWN"),
      t_air_c: v("T2M"),
      rh_pct: v("RH2M"),
      wind_m_s: v("WS2M"),
      precip_mm: v("PRECTOTCORR"),
    })
  }
  for (const name of POWER_PARAMETERS) {
    if (Object.keys(par[name] as object).length !== keys.length)
      throw new DataError(
        label,
        `${name} has a different number of hours than T2M`,
      )
  }
  return out
}

/** Reads the cached site-year (verify the cache against SHA256SUMS first). */
export function readSiteYear(
  dir: string,
  siteId: string,
  year: number,
): HourRecord[] {
  const name = rawName(siteId, year)
  let text: string
  try {
    text = readFileSync(join(dir, name), "utf8")
  } catch {
    throw new DataError(name, "cache file missing; run fetch-data --indonesia")
  }
  return parsePowerJson(text, name)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function requestUrl(
  site: SiteConfig,
  baseUrl: string,
  start: string,
  end: string,
): string {
  const q = new URLSearchParams({
    parameters: POWER_PARAMETERS.join(","),
    community: "RE",
    longitude: String(site.lon),
    latitude: String(site.lat),
    start,
    end,
    format: "JSON",
    "time-standard": "utc",
  })
  return `${baseUrl}?${q.toString()}`
}

function failed(
  site: string,
  year: number,
  status: number | "refused" | "timeout",
): void {
  emit("indonesia.fetch.failed", "error", { site, year, http_status: status })
}

/**
 * One request for the UTC year of one site (time-standard=utc named explicitly, spike Q1), written to
 * dir/raw/<site>_<year>.json as returned. Connection refused, timeout and HTTP failures are ResourceError
 * (exit 6, retry later); a response that is not a complete UTC year of the six parameters is DataError (exit 5).
 * https only (loopback http allowed for tests); no redirects.
 */
export async function fetchSiteYear(
  site: SiteConfig,
  year: number,
  dir: string,
  baseUrl: string = POWER_URL,
  opts: FetchOpts = {},
): Promise<{ rows: number; sha256: string }> {
  const u = new URL(baseUrl)
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && LOOPBACK.has(u.hostname))
  )
    throw new DataError("url", "only https urls are allowed")
  const span = opts.span ?? { start: `${year}0101`, end: `${year}1231` }
  const url = requestUrl(site, baseUrl, span.start, span.end)
  const attempts = opts.maxAttempts ?? 3
  let bytes: Uint8Array | undefined
  for (let attempt = 1; attempt <= attempts && !bytes; attempt++) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
        redirect: "manual",
      })
    } catch (e) {
      const timeout = e instanceof Error && e.name === "TimeoutError"
      failed(site.id, year, timeout ? "timeout" : "refused")
      throw new ResourceError(
        `${site.id} ${year}: ${timeout ? "request timed out" : "connection refused or failed"}`,
      )
    }
    if (res.status === 200) {
      const buf = new Uint8Array(await res.arrayBuffer())
      if (buf.length > MAX_BYTES) {
        throw new DataError(rawName(site.id, year), "response larger than 8 MB")
      }
      bytes = buf
    } else if (
      (res.status === 429 || res.status >= 500) &&
      attempt < attempts
    ) {
      await res.arrayBuffer().catch(() => undefined)
      await sleep((opts.retryDelayMs ?? 2000) * attempt)
    } else {
      failed(site.id, year, res.status)
      throw new ResourceError(`${site.id} ${year}: HTTP ${res.status}`)
    }
  }
  if (!bytes) throw new ResourceError(`${site.id} ${year}: no response`)
  const name = rawName(site.id, year)
  const rows = parsePowerJson(new TextDecoder().decode(bytes), name).length
  const want = expectedHours(span.start, span.end)
  if (rows !== want) {
    throw new DataError(name, `${rows} hourly rows, expected ${want}`)
  }
  const dest = join(dir, name)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(`${dest}.part`, bytes)
  renameSync(`${dest}.part`, dest)
  const sha256 = sha256Hex(bytes)
  emit("indonesia.fetch.done", "info", {
    site: site.id,
    year,
    rows,
    sha256: sha256.slice(0, 12),
  })
  return { rows, sha256 }
}

/** (Re)writes dir/SHA256SUMS over every file under dir (raw cache and cross-check files). */
export function writeSums(dir: string): number {
  const files = listDataFiles(dir)
  const lines = files.map(
    (f) => `${sha256Hex(readFileSync(join(dir, f)))}  ${f}`,
  )
  writeFileSync(join(dir, SUMS_FILE), `${lines.join("\n")}\n`)
  return files.length
}

/**
 * Sequential (one request at a time, sleepMs between requests), resumable per site-year (an existing cache file is
 * kept), then SHA256SUMS over the whole directory. Returns the number of site-years fetched in this call.
 */
export async function fetchIndonesiaData(
  sites: readonly SiteConfig[],
  firstYear: number,
  lastYear: number,
  dir: string,
  baseUrl: string = POWER_URL,
  sleepMs = 1000,
): Promise<number> {
  let fetched = 0
  for (const site of sites) {
    for (let year = firstYear; year <= lastYear; year++) {
      if (existsSync(join(dir, rawName(site.id, year)))) continue
      if (fetched > 0) await sleep(sleepMs)
      await fetchSiteYear(site, year, dir, baseUrl)
      fetched++
    }
  }
  writeSums(dir)
  return fetched
}
