// Preflight (plan 08 Execution contract): prints every missing item and exits non-zero; nothing is built on a guess.
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { root } from "./lib"

const need = [
  "src/web/anim/dayPlayer.ts",
  "src/web/pool.ts",
  "src/core/anim/screening.ts",
  "docs/proofs/plan-07.md",
  "configs/controls.yaml",
  "tests/fixtures/report-run",
  "node_modules",
]
const missing = need.filter((f) => !existsSync(join(root, f)))
const c = readFileSync(join(root, "configs/controls.yaml"), "utf8")
for (const k of ["c1_r_solar:", "c1_emissivity:"])
  if (!c.includes(k)) missing.push(`controls.yaml ${k}`)
if (missing.length > 0) {
  console.log(`FAIL preflight, missing: ${missing.join(", ")}`)
  process.exit(1)
}
console.log(
  "ok   preflight: plan 07 landed, controls.yaml has c1_r_solar and c1_emissivity, fixture and node_modules present",
)
