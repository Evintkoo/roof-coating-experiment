import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DataError } from "../core/errors"

const HEADER_LINES = 8
const ROWS = 8760
/** EPW data field 13 (0-based) is global horizontal irradiance in Wh/m2 per hour; 9999 marks a missing value. */
const COL_MONTH = 1
const COL_GHI = 13
const GHI_MISSING = 9999

/**
 * Cross-check files of plan 04 (spike Q2 and ruling R10): free TMYx 2011-2025 EPW files of climate.onebuilding.org,
 * one airport weather station per site; solar radiation of TMYx comes from ERA5. Paths are relative to
 * TMYX_BASE_URL; the zips are downloaded by the operator into <data dir>/tmyx/<site>.epw and registered in
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
