import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { repoRoot, run } from "./helpers"

const SEED = "20261121"
const engine = join(repoRoot, "tests/fixtures/engineDesign.ts")
const cfg = join(repoRoot, "configs")
const sha = (s: string) => createHash("sha256").update(s).digest("hex")

async function exec(cmd: string[]): Promise<string> {
  const p = Bun.spawn(cmd, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ])
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed: ${err}`)
  return out
}

test("designBytesIdenticalUnderBunAndNode", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "spandek-eng-"))
  const underBun = await exec(["bun", "run", engine, cfg, SEED])
  const bundle = join(tmp, "e.mjs")
  await exec(["bun", "build", engine, "--target=node", "--outfile", bundle])
  const underNode = await exec(["node", bundle, cfg, SEED])
  expect(underNode).toBe(underBun)
  expect(underBun).toMatch(/^candidates [0-9a-f]{64}\nweather [0-9a-f]{64}\n$/)

  // and both equal the files the CLI writes
  const out = join(tmp, "out")
  const r = await run([
    "design",
    "--seed",
    SEED,
    "--out",
    out,
    "--max-load",
    "1000",
  ])
  expect(r.exitCode).toBe(0)
  const cli = `candidates ${sha(readFileSync(join(out, "candidates.csv"), "utf8"))}\nweather ${sha(readFileSync(join(out, "weather.csv"), "utf8"))}\n`
  expect(cli).toBe(underBun)
}, 60000)

test("coreBuildsForBrowser", async () => {
  const res = await Bun.build({
    entrypoints: [join(repoRoot, "src/core/design.ts")],
    target: "browser",
  })
  expect(res.success).toBe(true)
})
