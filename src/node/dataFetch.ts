import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { ConfigError, DataError } from "../core/errors"
import {
  assembleTio2Nk,
  convertG173,
  convertRiiNk,
  nkToCsv,
  parseNk,
} from "../core/literature"
import { listDataFiles, SUMS_FILE, sha256Hex } from "./data"
import { emit } from "./logging"

const RII =
  "https://raw.githubusercontent.com/polyanskiy/refractiveindex.info-database/main/database/data/main/TiO2/nk"

export type Sources = {
  g173: string
  bondO: string
  bondE: string
  siefke: string
}

/** Public read-only URLs (verified in spike Q4). G173 is the pvlib-python redistributed copy of NREL's ASTMG173.csv. */
export const SOURCES: Sources = {
  g173: "https://raw.githubusercontent.com/pvlib/pvlib-python/main/pvlib/data/ASTMG173.csv",
  bondO: `${RII}/Bond-o.yml`,
  bondE: `${RII}/Bond-e.yml`,
  siefke: `${RII}/Siefke.yml`,
}

/** GET url, require HTTP 200, write the bytes to dest, return their sha256. */
export async function fetchTo(url: string, dest: string): Promise<string> {
  let host = "?"
  try {
    host = new URL(url).host
  } catch {
    throw new DataError("url", "invalid url")
  }
  let bytes: Uint8Array
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (res.status !== 200) throw new DataError(host, `HTTP ${res.status}`)
    bytes = new Uint8Array(await res.arrayBuffer())
  } catch (e) {
    if (e instanceof DataError) throw e
    throw new DataError(host, "network error")
  }
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
  const sha256 = sha256Hex(bytes)
  emit("data.fetched", "info", { host, bytes: bytes.length, sha256 })
  return sha256
}

/**
 * Download the raw public files into dir/raw, convert them to the project CSV forms and
 * write SHA256SUMS. Frozen once: refuses to run when SHA256SUMS already exists.
 */
export async function fetchData(
  dir: string,
  sources: Sources = SOURCES,
): Promise<void> {
  if (existsSync(join(dir, SUMS_FILE)))
    throw new ConfigError(
      "data-dir",
      "SHA256SUMS exists; the data set is frozen",
    )
  const raw = (name: string) => join(dir, "raw", name)
  await fetchTo(sources.g173, raw("ASTMG173.csv"))
  await fetchTo(sources.bondO, raw("TiO2_Bond-o.yml"))
  await fetchTo(sources.bondE, raw("TiO2_Bond-e.yml"))
  await fetchTo(sources.siefke, raw("TiO2_Siefke.yml"))
  const text = (p: string) => readFileSync(p, "utf8")
  const out = (name: string, body: string) =>
    writeFileSync(join(dir, name), body)

  out("g173_global_tilt.csv", convertG173(text(raw("ASTMG173.csv"))))
  const bondO = convertRiiNk(text(raw("TiO2_Bond-o.yml")), {})
  const bondE = convertRiiNk(text(raw("TiO2_Bond-e.yml")), {})
  const siefke = convertRiiNk(text(raw("TiO2_Siefke.yml")), {
    minWl: 0.3,
    maxWl: 2.5,
  })
  out("tio2_rutile_bond_o.csv", bondO)
  out("tio2_rutile_bond_e.csv", bondE)
  out("tio2_ald_film_siefke_0p3_2p5.csv", siefke)
  out(
    "tio2_nk.csv",
    nkToCsv(assembleTio2Nk(parseNk(siefke), parseNk(bondO), parseNk(bondE))),
  )

  const files = listDataFiles(dir)
  const sums = files.map(
    (f) => `${sha256Hex(readFileSync(join(dir, f)))}  ${f}`,
  )
  writeFileSync(join(dir, SUMS_FILE), `${sums.join("\n")}\n`)
}
