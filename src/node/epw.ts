import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { inflateRawSync } from "node:zlib"
import { DataError, ResourceError } from "../core/errors"
import type { SiteConfig } from "../core/indonesia/series"
import { emit } from "./logging"
import { USER_AGENT } from "./power"

const HEADER_LINES = 8
const ROWS = 8760
/** EPW data field 13 (0-based) is global horizontal irradiance in Wh/m2 per hour; 9999 marks a missing value. */
const COL_MONTH = 1
const COL_GHI = 13
const GHI_MISSING = 9999

/**
 * Cross-check files of plan 04 (spike Q2 and ruling R10): free TMYx 2011-2025 EPW files of climate.onebuilding.org,
 * one airport weather station per site; solar radiation of TMYx comes from ERA5. Paths are relative to
 * TMYX_BASE_URL; `fetch-data --indonesia` downloads them (fetchTmyx) into <data dir>/tmyx/<site>.epw, registered in
 * SHA256SUMS. Not redistributed (no licence grant found); citation: Lawrie and Crawley 2026, TMYx.
 */
export const TMYX_BASE_URL =
  "https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/IDN_Indonesia"
export const TMYX_FILES: Readonly<Record<string, string>> = {
  jakarta:
    "JW_Jawa/IDN_JW_Jakarta-Soekarno-Hatta.Intl.AP.967490_TMYx.2011-2025.zip",
  surabaya: "JW_Jawa/IDN_JW_Surabaya-Juanda.Intl.AP.969350_TMYx.2011-2025.zip",
  medan: "SM_Sumatera/IDN_SM_Medan.Kualanamu.Intl.AP.960350_TMYx.2011-2025.zip",
  makassar:
    "SL_Sulawesi/IDN_SL_Makassar-Hasanuddin.Intl.AP.971800_TMYx.2011-2025.zip",
  bandung:
    "JW_Jawa/IDN_JW_Bandung-Sastranegara.Intl.AP.967810_TMYx.2011-2025.zip",
}

/**
 * Reads the typical-year file: 8 header lines, then exactly 8760 hourly rows (a TMY has no 29 February). Returns the
 * hourly global horizontal irradiance (Wh/m2 = mean W/m2) and the calendar month 1..12 of each row.
 */
export function parseEpw(text: string): {
  ghi: Float64Array
  month: Uint8Array
} {
  const lines = text.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
  if (
    !lines[0]?.startsWith("LOCATION,") ||
    !lines[HEADER_LINES - 1]?.startsWith("DATA PERIODS")
  ) {
    throw new DataError(
      "epw",
      "not an EPW file: LOCATION or DATA PERIODS header line missing",
    )
  }
  const rows = lines.length - HEADER_LINES
  if (rows !== ROWS) {
    throw new DataError(
      "epw",
      `EPW file has ${rows} hourly rows, expected ${ROWS}`,
    )
  }
  const ghi = new Float64Array(ROWS)
  const month = new Uint8Array(ROWS)
  for (let i = 0; i < ROWS; i++) {
    const f = (lines[HEADER_LINES + i] as string).split(",")
    const m = Number(f[COL_MONTH])
    const g = Number(f[COL_GHI])
    if (!(Number.isInteger(m) && m >= 1 && m <= 12)) {
      throw new DataError("epw", `row ${i + 1}: bad month ${f[COL_MONTH]}`)
    }
    if (!Number.isFinite(g) || g === GHI_MISSING || g < 0) {
      throw new DataError(
        "epw",
        `row ${i + 1}: GHI missing or negative (${f[COL_GHI]})`,
      )
    }
    ghi[i] = g
    month[i] = m
  }
  return { ghi, month }
}

/** Reads dir/tmyx/<site>.epw. */
export function readTmyx(
  dir: string,
  siteId: string,
): { ghi: Float64Array; month: Uint8Array } {
  const name = `tmyx/${siteId}.epw`
  let text: string
  try {
    text = readFileSync(join(dir, name), "utf8")
  } catch {
    throw new DataError(name, "cross-check file missing")
  }
  return parseEpw(text)
}

// ---- download (fetch-data --indonesia) ----

const MAX_ZIP_BYTES = 40 * 1024 * 1024
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"])

/**
 * Text of the first `.epw` member of a zip archive (central directory, stored or deflate). A TMYx zip holds the EPW next
 * to .stat, .ddy and other files; nothing else is read. Any structural problem is a DataError (exit 5).
 */
export function extractEpw(zip: Uint8Array): string {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const bad = (why: string): never => {
    throw new DataError("tmyx", `zip archive: ${why}`)
  }
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return bad("end of central directory not found")
  const n = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  for (let k = 0; k < n; k++) {
    if (p + 46 > zip.length || v.getUint32(p, true) !== 0x02014b50)
      return bad("bad central directory entry")
    const method = v.getUint16(p + 10, true)
    const csize = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(
      zip.subarray(p + 46, p + 46 + nameLen),
    )
    p += 46 + nameLen + extraLen + commentLen
    if (!name.toLowerCase().endsWith(".epw")) continue
    if (local + 30 > zip.length || v.getUint32(local, true) !== 0x04034b50)
      return bad("bad local header")
    const start =
      local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const body = zip.subarray(start, start + csize)
    if (body.length !== csize) return bad("truncated member")
    if (method === 0) return new TextDecoder().decode(body)
    if (method !== 8) return bad(`unsupported compression method ${method}`)
    try {
      return new TextDecoder().decode(inflateRawSync(body))
    } catch {
      return bad("member does not inflate")
    }
  }
  return bad("no .epw member")
}

/**
 * Downloads the TMYx zip of each site that has no <dir>/tmyx/<site>.epw yet (one request per file, sleepMs apart,
 * generic client name, https or loopback only, no redirect to another scheme) and stores the extracted EPW. The EPW is
 * parsed before it is written, so a bad file never reaches the cache. Returns the number of files downloaded.
 */
export async function fetchTmyx(
  sites: readonly SiteConfig[],
  dir: string,
  baseUrl: string = TMYX_BASE_URL,
  sleepMs = 2000,
): Promise<number> {
  const u = new URL(baseUrl)
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && LOOPBACK.has(u.hostname))
  )
    throw new DataError("url", "only https urls are allowed")
  let n = 0
  for (const site of sites) {
    const rel = TMYX_FILES[site.id]
    if (rel === undefined)
      throw new DataError("tmyx", `no TMYx file is registered for ${site.id}`)
    const dest = join(dir, `tmyx/${site.id}.epw`)
    if (existsSync(dest)) continue
    if (n > 0) await new Promise((r) => setTimeout(r, sleepMs))
    let res: Response
    try {
      res = await fetch(`${baseUrl.replace(/\/$/, "")}/${rel}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(120_000),
        redirect: "follow",
      })
    } catch {
      emit("indonesia.fetch.failed", "error", {
        site: site.id,
        year: 0,
        http_status: "refused",
      })
      throw new ResourceError(`${site.id} TMYx: connection refused or failed`)
    }
    if (res.status !== 200) {
      emit("indonesia.fetch.failed", "error", {
        site: site.id,
        year: 0,
        http_status: res.status,
      })
      throw new ResourceError(`${site.id} TMYx: HTTP ${res.status}`)
    }
    const zip = new Uint8Array(await res.arrayBuffer())
    if (zip.length > MAX_ZIP_BYTES)
      throw new DataError("tmyx", `${site.id}: archive larger than 40 MB`)
    const text = extractEpw(zip)
    parseEpw(text)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(`${dest}.part`, text)
    renameSync(`${dest}.part`, dest)
    n++
  }
  return n
}
