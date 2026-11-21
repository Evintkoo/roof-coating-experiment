import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { listFiles, repoRoot } from "./helpers"

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

test("oracleFixturesAreFresh", () => {
  if (Bun.which("uv") === null) {
    throw new Error("uv missing: oracle freshness unproven")
  }
  const p = Bun.spawnSync(
    ["uv", "run", "--project", "oracle", "oracle/generate.py", "--check"],
    { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
  )
  const out = `${p.stdout.toString()}${p.stderr.toString()}`
  expect(out).toContain("oracle fixtures fresh")
  expect(p.exitCode).toBe(0)
}, 120000)
