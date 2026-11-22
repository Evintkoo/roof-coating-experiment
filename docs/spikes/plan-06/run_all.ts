// Runs every plan 06 spike script one after the other (never in parallel) and exits 0 only when all of them exit 0.
// Run: bun docs/spikes/plan-06/run_all.ts [scratch_dir]    Q2 needs uv and network on the first run; Q5 needs network.
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const HERE = dirname(new URL(import.meta.url).pathname)
const scratch = process.argv[2] ?? mkdtempSync(join(tmpdir(), "plan06-spike-"))
const steps: [string, string[]][] = [
  ["vendor-check", ["bun", join(HERE, "vendor-check.ts")]],
  [
    "vendor-check selftest",
    ["bun", join(HERE, "vendor-check.ts"), "--selftest"],
  ],
  [
    "Q2 fonts",
    [
      "uv",
      "run",
      "--no-project",
      "-q",
      "--python",
      "3.12",
      "--with",
      "fonttools==4.68.0",
      "--with",
      "brotli==1.2.1",
      "python",
      "-I",
      join(HERE, "q2_fonts.py"),
      join(scratch, "fonts"),
    ],
  ],
  ["Q3 light theme", ["bun", join(HERE, "q3_light_theme.ts")]],
  ["Q4 palette", ["bun", join(HERE, "q4_palette.ts")]],
  ["Q1 page budget", ["bun", join(HERE, "q1_page_budget.ts")]],
  ["Q5 svelte", ["bun", join(HERE, "q5_svelte.ts"), join(scratch, "svelte")]],
  ["Q6 comprehension harness", ["bun", join(HERE, "q6_selftest.ts")]],
]
let bad = 0
for (const [name, cmd] of steps) {
  const t0 = performance.now()
  const r = Bun.spawnSync(["nice", "-n", "10", ...cmd], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const ok = r.exitCode === 0
  if (!ok) {
    bad++
    console.log(
      r.stdout
        .toString()
        .split("\n")
        .filter((l) => l.startsWith("FAIL"))
        .join("\n"),
      r.stderr.toString().slice(-600),
    )
  }
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}  (${Math.round(performance.now() - t0)} ms)`,
  )
}
process.exit(bad ? 1 : 0)
