// Engine-independence artefact (H8). Bundled with `bun build --target=node` and run under
// Bun and Node: prints sha256 of the candidates.csv text and the weather.csv text.
// Uses only process.argv, node:fs and node:crypto; argv[2] = config dir, argv[3] = seed.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { DESIGN_COLUMNS, DESIGN_FLAG_COLUMNS } from "../../src/core/columns"
import { parseMaterialRanges, parseWeather } from "../../src/core/config"
import { toCsv } from "../../src/core/csv"
import { checkConstraints, lhsDesign, weatherL9 } from "../../src/core/design"

const dir = process.argv[2] as string
const seed = Number(process.argv[3] ?? "20261121")
const read = (f: string) => parse(readFileSync(`${dir}/${f}`, "utf8"))
const ranges = parseMaterialRanges(read("material_ranges.yaml"))
const weather = parseWeather(read("weather_scenarios.yaml"))

const rows = checkConstraints(lhsDesign(96, ranges, seed), ranges)
const candidates = toCsv([...DESIGN_COLUMNS, ...DESIGN_FLAG_COLUMNS], rows)
const wx = weatherL9(weather)
const weatherCsv = toCsv(
  [
    "scenario_id",
    "irradiance_w_m2",
    "t_air_c",
    "wind_m_s",
    "h_conv_w_m2k",
    "t_sky_k",
  ],
  wx,
)
const sha = (s: string) => createHash("sha256").update(s).digest("hex")
console.log(`candidates ${sha(candidates)}`)
console.log(`weather ${sha(weatherCsv)}`)
