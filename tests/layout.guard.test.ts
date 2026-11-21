import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { listFiles, missingMirrors, orphanTests, repoRoot } from "./helpers"

const srcFiles = listFiles(join(repoRoot, "src")).filter((f) =>
  f.endsWith(".ts"),
)
const testFiles = listFiles(join(repoRoot, "tests")).filter((f) =>
  f.endsWith(".test.ts"),
)

// Cross-cutting tests that are not mirrors of one source file.
const NON_MIRROR = new Set(
  [
    "layout.guard",
    "library.smoke",
    "oracle.fixtures",
    "crossModel",
    "determinism",
    "pipeline.e2e",
    "report.browser",
    "honesty",
    "indonesia.e2e",
    "indonesia.crosscheck",
    "refine.e2e",
    "refine.baseline",
    "budget.baseline",
  ].map((n) => `${n}.test.ts`),
)
// Source files that need no mirror (entry-point glue with no logic of its own).
const NO_MIRROR_NEEDED = new Set([
  "web/main.ts",
  "web/worker.ts",
  "web/budget.ts",
  "node/simWorker.ts",
  "node/refineWorker.ts",
])

test("everySourceFileHasOneMirror", () => {
  expect(missingMirrors(srcFiles, testFiles, NO_MIRROR_NEEDED)).toEqual([])
})

test("noOrphanTests", () => {
  expect(orphanTests(srcFiles, testFiles, NON_MIRROR)).toEqual([])
})

test("guardCanFail", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-"))
  try {
    const put = (rel: string) => {
      const p = join(dir, rel)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, "")
    }
    put("src/core/lonely.ts")
    put("src/core/paired.ts")
    put("tests/core/paired.test.ts")
    put("tests/core/orphan.test.ts")
    const src = listFiles(join(dir, "src"))
    const tests = listFiles(join(dir, "tests"))
    expect(missingMirrors(src, tests, new Set())).toEqual(["core/lonely.ts"])
    expect(orphanTests(src, tests, new Set())).toEqual(["core/orphan.test.ts"])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("guardAcceptsPlan5Files", () => {
  // src/web/budget.ts is slider glue (covered by report.browser); the three plan-5 e2e/baseline tests are cross-cutting.
  expect(
    missingMirrors([...srcFiles, "web/budget.ts"], testFiles, NO_MIRROR_NEEDED),
  ).toEqual([])
  const planTests = ["refine.e2e", "refine.baseline", "budget.baseline"].map(
    (n) => `${n}.test.ts`,
  )
  expect(
    orphanTests(srcFiles, [...testFiles, ...planTests], NON_MIRROR),
  ).toEqual([])
  // the guard can still fail for an unlisted glue file and an unlisted cross-cutting test
  expect(missingMirrors(["web/other.ts"], testFiles, NO_MIRROR_NEEDED)).toEqual(
    ["web/other.ts"],
  )
  expect(orphanTests(srcFiles, ["plan5.stray.test.ts"], NON_MIRROR)).toEqual([
    "plan5.stray.test.ts",
  ])
})
