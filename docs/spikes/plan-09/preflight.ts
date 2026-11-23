// Prints the missing preflight items and exits non-zero (plan 09 Task 1).
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { root } from "./lib"

const need = [
  "src/core/anim/compare.ts",
  "src/core/anim/sweep.ts",
  "src/web/anim/comparePanel.ts",
  "src/web/design/organisms/watchScreening.ts",
  "docs/proofs/plan-08.md",
  "src/web/anim/loop.ts",
  "src/web/anim/dayPlayer.ts",
  "docs/proofs/plan-07.md",
  "tests/fixtures/report-run",
  "node_modules",
]
const missing = need.filter((p) => !existsSync(join(root, p)))
if (
  !/DONE-LEAN/.test(
    readFileSync(
      join(
        root,
        "plans/01-digital/08-control-and-variable-comparison-animation.md",
      ),
      "utf8",
    ),
  )
)
  missing.push("plan 08 status DONE-LEAN")
if (missing.length > 0) {
  console.log(`FAIL preflight missing: ${missing.join(", ")}`)
  process.exit(1)
}
console.log("ok   preflight: nothing missing")
