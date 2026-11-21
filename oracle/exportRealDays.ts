// One-off exporter (plan 04 Task 5): the first 20 representative days (site, season, bin order of D9) of an
// `indonesia_days.json` written by the real `indonesia` command become oracle/real_days_input.json, the committed input of
// the scipy fixture thermalSeriesReal.json. The input is frozen once; the fixture generator never reads the weather cache.
//
//   bun oracle/exportRealDays.ts reports/<run>/indonesia/indonesia_days.json
import { writeFileSync } from "node:fs"
import { join } from "node:path"

const src = process.argv[2]
if (src === undefined) throw new Error("usage: bun oracle/exportRealDays.ts <indonesia_days.json>")
const doc = (await Bun.file(src).json()) as {
  sites: { id: string; days: { season: string; bin: string; date: string; series: unknown }[] }[]
}
const days = doc.sites
  .flatMap((s) => s.days.map((d) => ({ site: s.id, season: d.season, bin: d.bin, date: d.date, series: d.series })))
  .slice(0, 20)
if (days.length !== 20) throw new Error(`need 20 days, found ${days.length}`)
writeFileSync(join(import.meta.dir, "real_days_input.json"), `${JSON.stringify({ source: "NASA POWER hourly, 2015-2024, plan 04 representative days", days })}\n`)
