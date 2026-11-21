// Entry point bundled for Node by tests/suites/indonesiaE2e.ts (H10: the day selection gives the same days under Bun and Node).
// Reads {sets: [{ghi, months, precip, wet}]} from argv[2] and prints the picks as JSON.
import { readFileSync } from "node:fs"
import { pickDays } from "../../src/core/indonesia/days"

const input = JSON.parse(readFileSync(process.argv[2] as string, "utf8")) as {
  sets: { ghi: number[]; months: number[]; precip: number[]; wet: number }[]
}
console.log(
  JSON.stringify(
    input.sets.map((s) => pickDays(s.ghi, s.months, s.precip, s.wet)),
  ),
)
