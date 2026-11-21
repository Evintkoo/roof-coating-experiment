import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  listFiles,
  missingMirrors,
  orphanTests,
  proofWithoutFastTwin,
  repoRoot,
} from "./helpers"

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
  "node/budgetWorker.ts",
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

test("guardAcceptsPlan4Files", () => {
  // plan 4 adds mirrored source files plus two cross-cutting tests (whitelisted above)
  const planSrc = [
    "core/models/thermalSeries.ts",
    "core/indonesia/days.ts",
    "core/indonesia/series.ts",
    "node/power.ts",
    "node/epw.ts",
    "node/indonesia.ts",
    "node/siteConfig.ts",
  ]
  const planTests = planSrc.map((f) => `${f.replace(/\.ts$/, "")}.test.ts`)
  expect(missingMirrors(planSrc, planTests, NO_MIRROR_NEEDED)).toEqual([])
  expect(missingMirrors(planSrc, [], NO_MIRROR_NEEDED)).toEqual(planSrc)
  const cross = ["indonesia.e2e.test.ts", "indonesia.crosscheck.test.ts"]
  expect(
    orphanTests(
      [...srcFiles, ...planSrc],
      [...planTests, ...cross],
      NON_MIRROR,
    ),
  ).toEqual([])
  // an unlisted cross-cutting test is still an orphan
  expect(orphanTests(planSrc, ["indonesia.stray.test.ts"], NON_MIRROR)).toEqual(
    ["indonesia.stray.test.ts"],
  )
})

test("proofFilesPairWithAFastTwin", () => {
  // bun run proof runs X.proof.test.ts, bun run check runs X.test.ts: every proof file has its small twin beside it
  expect(proofWithoutFastTwin(testFiles)).toEqual([])
  expect(
    testFiles.filter((f) => f.endsWith(".proof.test.ts")).length,
  ).toBeGreaterThan(0)
  // the guard can fail, and a proof file is judged as its fast twin
  expect(proofWithoutFastTwin(["a.proof.test.ts", "b.test.ts"])).toEqual([
    "a.proof.test.ts",
  ])
  expect(
    proofWithoutFastTwin([
      "a.proof.test.ts",
      "a.test.ts",
      "core/b.proof.test.ts",
    ]),
  ).toEqual(["core/b.proof.test.ts"])
  expect(orphanTests(srcFiles, ["stray.proof.test.ts"], NON_MIRROR)).toEqual([
    "stray.proof.test.ts",
  ])
  expect(
    orphanTests(srcFiles, ["refine.e2e.proof.test.ts"], NON_MIRROR),
  ).toEqual([])
})
