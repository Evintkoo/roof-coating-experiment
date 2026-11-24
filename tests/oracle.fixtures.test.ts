import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { listFiles, repoRoot } from "./helpers"
import { compareOracle } from "./support/oracleCompare"

const dir = join(repoRoot, "tests/fixtures/oracle")

test("oracleFixtureHashesMatchSums", () => {
  const sums = readFileSync(join(dir, "SHA256SUMS"), "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l)
      if (!m) throw new Error(`bad SHA256SUMS line: ${l}`)
      return [m[2] as string, m[1] as string] as const
    })
  const fixtures = listFiles(dir).filter((f) => f !== "SHA256SUMS")
  expect(sums.map(([f]) => f).sort()).toEqual(fixtures)
  expect(fixtures.length).toBeGreaterThan(0)
  for (const [name, hash] of sums) {
    const got = createHash("sha256")
      .update(readFileSync(join(dir, name)))
      .digest("hex")
    expect(got).toBe(hash)
  }
})

// Regenerated in a temp dir and compared numerically (tests/support/oracleCompare.ts): scipy/numpy round the last place differently on
// Linux x86-64 and the adaptive solvers amplify it to 1.7e-7 absolute at most (docs/testing.md). `generate.py --check` (byte
// equality) stays available for the reference platform.
test("oracleFixturesAreFresh", () => {
  if (Bun.which("uv") === null) {
    throw new Error("uv missing: oracle freshness unproven")
  }
  const out = mkdtempSync(join(tmpdir(), "spandek-oracle-"))
  const p = Bun.spawnSync(
    ["uv", "run", "--project", "oracle", "oracle/generate.py", "--out", out],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  )
  expect(p.exitCode).toBe(0)
  const names = listFiles(dir).filter((f) => f !== "SHA256SUMS")
  expect(listFiles(out).filter((f) => f !== "SHA256SUMS")).toEqual(names)
  for (const name of names) {
    const a = JSON.parse(readFileSync(join(dir, name), "utf8"))
    const b = JSON.parse(readFileSync(join(out, name), "utf8"))
    expect({ name, problems: compareOracle(name, a, b) }).toEqual({
      name,
      problems: [],
    })
  }
}, 120000)

test("oracleCompareToleratesLastPlaceNoiseAndCatchesRealChanges", () => {
  const make = (t: number[], label = "a") => ({
    cases: [{ t, label, gel: null }],
  })
  const base = make([300.123456789, 0.07])
  expect(
    compareOracle("thermal.json", base, make([300.123456789 + 1e-7, 0.07])),
  ).toEqual([])
  expect(
    compareOracle("thermal.json", base, make([300.123456789, 0.07 + 1e-3])),
  ).toHaveLength(1)
  expect(
    compareOracle("thermal.json", base, make([300.123456789, 0.07], "b")),
  ).toHaveLength(1)
  expect(
    compareOracle("thermal.json", base, make([300.123456789])),
  ).toHaveLength(1)
  // files without a listed tolerance are compared exactly
  expect(
    compareOracle("gradient.json", base, make([300.123456789 + 1e-7, 0.07])),
  ).toHaveLength(1)
})
