import { beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { loadContext } from "../../../src/node/context"
import {
  manifestCoreHash,
  writeManifest,
} from "../../../src/node/report/manifest"
import { repoRoot } from "../../helpers"

const CFG = join(repoRoot, "configs")
const DATA = join(repoRoot, "data", "literature")
let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(CFG, DATA)
})
const src = { runId: "run-test", configDir: CFG, dataDir: DATA }
const sha = (b: string | Uint8Array) =>
  createHash("sha256").update(b).digest("hex")

function outDir(): string {
  const d = mkdtempSync(join(tmpdir(), "spandek-man-"))
  mkdirSync(join(d, "candidate_cards"))
  writeFileSync(join(d, "results.csv"), "a,b\n1,2\n")
  writeFileSync(join(d, "curves.json"), '{"x":[1,2,3]}')
  writeFileSync(join(d, "candidate_cards", "balanced_SP-001.md"), "# card\n")
  return d
}
const FILES = [
  "results.csv",
  "curves.json",
  "candidate_cards/balanced_SP-001.md",
]
type Man = {
  run_id: string
  seed: number
  n_mc: number
  versions: { bun: string }
  git_commit: string
  bun_lock_sha256: string
  config_sha256: string
  config_files: Record<string, string>
  constants_sha256: string
  data_sha256: Record<string, string>
  files: { path: string; sha256: string; bytes: number }[]
  extra: unknown[]
  core_sha256: string
}
const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Man

test("manifestHashesMatchFiles", async () => {
  const d = outDir()
  const p = await writeManifest(d, ctx, 42, 256, FILES, src)
  const m = read(p)
  expect(m.run_id).toBe("run-test")
  expect(m.seed).toBe(42)
  expect(m.n_mc).toBe(256)
  expect(m.versions.bun).toBe(Bun.version)
  expect(m.git_commit).toMatch(/^([0-9a-f]{40}|unavailable)$/)
  expect(m.bun_lock_sha256).toBe(sha(readFileSync(join(repoRoot, "bun.lock"))))
  expect(m.files.map((f: { path: string }) => f.path)).toEqual(
    [...FILES].sort(),
  )
  for (const f of m.files) {
    const bytes = readFileSync(join(d, f.path))
    expect(f.sha256).toBe(sha(bytes))
    expect(f.bytes).toBe(bytes.length)
  }
  // every config and data file hash is the file's own
  for (const [name, h] of Object.entries(m.config_files))
    expect(h).toBe(sha(readFileSync(join(CFG, name))))
  expect(Object.keys(m.config_files).sort()).toEqual([
    "controls.yaml",
    "material_ranges.yaml",
    "materials.yaml",
    "weather_scenarios.yaml",
  ])
  expect(m.config_sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(Object.keys(m.data_sha256)).toContain("g173_global_tilt.csv")
  for (const [name, h] of Object.entries(m.data_sha256))
    expect(h).toBe(sha(readFileSync(join(DATA, name))))
  expect(m.extra).toEqual([])
  expect(m.core_sha256).toBe(manifestCoreHash(m))
  // a changed file is detected by recomputing
  writeFileSync(join(d, "results.csv"), "a,b\n1,3\n")
  expect(sha(readFileSync(join(d, "results.csv")))).not.toBe(
    m.files.find((f) => f.path === "results.csv")?.sha256,
  )
})

test("manifestCoreHashExcludesReportField", async () => {
  const d = outDir()
  const m = read(await writeManifest(d, ctx, 42, 256, FILES, src))
  const core = m.core_sha256
  // plan 0 appends report_sha256 as the last field: the core hash must not move
  const withReport = { ...m, report_sha256: "f".repeat(64) }
  expect(manifestCoreHash(withReport)).toBe(core)
  expect(manifestCoreHash({ ...m, report_sha256: "0".repeat(64) })).toBe(core)
  expect(Object.keys(withReport).at(-1)).toBe("report_sha256")
  // but every other field is covered
  expect(manifestCoreHash({ ...m, seed: 43 })).not.toBe(core)
  expect(
    manifestCoreHash({ ...m, extra: [{ path: "x", sha256: "a", bytes: 1 }] }),
  ).not.toBe(core)
  // same inputs, same manifest bytes
  const again = readFileSync(
    await writeManifest(d, ctx, 42, 256, FILES, src),
    "utf8",
  )
  expect(again).toBe(readFileSync(join(d, "run_manifest.json"), "utf8"))
  expect(read(join(d, "run_manifest.json")).core_sha256).toBe(core)
})

test("manifestChangesWhenConfigConstantEdited", async () => {
  const d = outDir()
  const base = read(await writeManifest(d, ctx, 42, 256, FILES, src))
  // a real edited copy of the configs, loaded through the real loader
  const cfg = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  cpSync(CFG, cfg, { recursive: true })
  const doc = parse(readFileSync(join(cfg, "materials.yaml"), "utf8"))
  doc.tio2.diameter_um.value = doc.tio2.diameter_um.value * 1.1
  writeFileSync(join(cfg, "materials.yaml"), stringify(doc))
  const edited = await loadContext(cfg, DATA)
  const m2 = read(
    await writeManifest(outDir(), edited, 42, 256, FILES, {
      ...src,
      configDir: cfg,
    }),
  )
  expect(m2.core_sha256).not.toBe(base.core_sha256)
  expect(m2.constants_sha256).not.toBe(base.constants_sha256)
  expect(m2.config_files["materials.yaml"]).not.toBe(
    base.config_files["materials.yaml"],
  )
  expect(m2.config_files["weather_scenarios.yaml"]).toBe(
    base.config_files["weather_scenarios.yaml"],
  )
})

test("manifestRejectsMissingAndEscapingPaths", async () => {
  const d = outDir()
  await expect(
    writeManifest(d, ctx, 1, 1, ["nope.csv"], src),
  ).rejects.toMatchObject({ code: 5 })
  await expect(
    writeManifest(d, ctx, 1, 1, ["../x.csv"], src),
  ).rejects.toMatchObject({ code: 2 })
  await expect(
    writeManifest(d, ctx, 1, 1, ["/etc/passwd"], src),
  ).rejects.toMatchObject({ code: 2 })
})
