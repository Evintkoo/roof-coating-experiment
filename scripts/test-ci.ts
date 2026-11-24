// The portable test tier for GitHub's runners: every fast test except (a) tests that drive Chrome, found by following imports
// from each test file into tests/suites and tests/support, and (b) the files in NOT_PORTABLE below, each with its reason.
// Chrome suites time out on cold shared runners and are run on the reference machine by `bun run check`.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const CHROME =
  /playwright|chromium|startQa|startPanel8|browserFixture|qaPage|panel8Page|poolBrowser/

/** Not portable for a reason other than Chrome (see docs/testing.md, Platform sensitivity). */
const NOT_PORTABLE: Record<string, string> = {
  "tests/node/indonesia.test.ts": "needs downloaded weather data (git-ignored)",
  "tests/indonesia.e2e.test.ts": "needs downloaded weather data (git-ignored)",
  "tests/node/epw.test.ts": "needs downloaded weather data (git-ignored)",
  "tests/honesty.test.ts": "needs downloaded weather data (git-ignored)",
  "tests/oracle.fixtures.test.ts": "thermal fixture differs on Linux",
  "tests/core/models/thermal.test.ts": "RK4 golden hash differs on Linux",
  "tests/node/refine.test.ts": "delamination-cap check differs on Linux",
  "tests/refine.baseline.test.ts": "optimiser outcome differs on Linux",
  "tests/core/pipeline/live.test.ts": "wall-clock bound",
  "tests/refine.e2e.test.ts": "hooks of up to an hour; unexplained hang",
  "tests/pipeline.e2e.test.ts": "hooks of up to an hour; unexplained hang",
  "tests/node/budget.test.ts": "hooks of up to an hour",
  "tests/budget.baseline.test.ts": "hooks of up to an hour",
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const memo = new Map<string, boolean>()
function usesChrome(file: string): boolean {
  const known = memo.get(file)
  if (known !== undefined) return known
  memo.set(file, false) // import cycles
  const src = readFileSync(file, "utf8")
  let hit = CHROME.test(src)
  if (!hit) {
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      const base = resolve(dirname(file), m[1] as string)
      const target = [`${base}.ts`, join(base, "index.ts")].find((c) => {
        try {
          return statSync(c).isFile()
        } catch {
          return false
        }
      })
      if (target?.startsWith(join(root, "tests")) && usesChrome(target)) {
        hit = true
        break
      }
    }
  }
  memo.set(file, hit)
  return hit
}

const tests = walk(join(root, "tests")).filter(
  (f) => f.endsWith(".test.ts") && !f.endsWith(".proof.test.ts"),
)
const rel = (f: string) => f.slice(root.length + 1)
const skipped = tests.filter((f) => usesChrome(f) || rel(f) in NOT_PORTABLE)
console.log(
  `portable tier: ${tests.length - skipped.length} of ${tests.length} test files (${skipped.length} left out: Chrome or listed in scripts/test-ci.ts)`,
)
const args = [
  "test",
  "--parallel=3",
  "--timeout",
  "30000",
  ...skipped.flatMap((f) => ["--path-ignore-patterns", rel(f)]),
  "--path-ignore-patterns",
  "**/*.proof.test.ts",
]
const p = Bun.spawnSync(["bun", ...args], {
  cwd: root,
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(p.exitCode ?? 1)
