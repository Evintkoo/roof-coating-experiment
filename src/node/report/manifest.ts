import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, normalize } from "node:path"
import { ConfigError, DataError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import { configSha256 } from "../config"
import { listDataFiles, sha256Hex } from "../data"
import { emit } from "../logging"

export const MANIFEST_FILE = "run_manifest.json"
const CONFIG_FILES = [
  "controls.yaml",
  "material_ranges.yaml",
  "materials.yaml",
  "weather_scenarios.yaml",
] as const
const REPO_ROOT = join(import.meta.dir, "..", "..", "..")

/** An entry of `extra[]`: an output of a later command (path relative to the run directory, its hash, size and kind). */
export type ManifestExtraEntry = {
  path: string
  sha256: string
  bytes: number
  kind: string
}

export type ManifestSource = {
  runId: string
  configDir: string
  dataDir: string
}

/** JSON with object keys sorted at every level: the byte form that is hashed. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  if (typeof v === "object" && v !== null)
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`
  return JSON.stringify(v)
}

/** FR-8: sha256 of the manifest without `report_sha256` (and without the hash field itself). */
export function manifestCoreHash(m: Record<string, unknown>): string {
  const { report_sha256: _r, core_sha256: _c, ...core } = m
  return createHash("sha256").update(canonical(core)).digest("hex")
}

function gitCommit(): string {
  try {
    const p = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: REPO_ROOT })
    const out = p.stdout.toString().trim()
    return p.exitCode === 0 && /^[0-9a-f]{40}$/.test(out) ? out : "unavailable"
  } catch {
    return "unavailable"
  }
}

/**
 * run_manifest.json (plan 03 FR-8): run id, seed, n_mc, git commit, Bun version and bun.lock hash, sha256 of every config
 * file and of the constants the models actually used (the parsed context), sha256 and size of each listed output file (paths
 * relative to outDir), `extra[]` for the outputs of later commands (empty unless the caller passes the entries to keep), and
 * `core_sha256`. `setReportHash` appends `report_sha256` last; it is excluded from the core hash. Written atomically; returns its path.
 */
export async function writeManifest(
  outDir: string,
  ctx: ModelContext,
  seed: number,
  nMc: number,
  files: readonly string[],
  src: ManifestSource,
  extra: readonly ManifestExtraEntry[] = [],
): Promise<string> {
  const entries = [...new Set(files)]
    .filter((f) => f !== MANIFEST_FILE)
    .sort()
    .map((rel) => {
      const n = normalize(rel)
      if (
        isAbsolute(n) ||
        n.startsWith("..") ||
        n.split(/[\\/]/).includes("..")
      )
        throw new ConfigError(
          "files",
          `manifest path must be relative to the output directory: ${rel}`,
        )
      const path = join(outDir, n)
      if (!existsSync(path))
        throw new DataError(rel, "listed output file is missing")
      const bytes = readFileSync(path)
      return {
        path: n.split("\\").join("/"),
        sha256: sha256Hex(bytes),
        bytes: statSync(path).size,
      }
    })
  const configFiles: Record<string, string> = {}
  for (const f of CONFIG_FILES)
    configFiles[f] = await configSha256([join(src.configDir, f)])
  const dataFiles: Record<string, string> = {}
  for (const f of listDataFiles(src.dataDir))
    dataFiles[f] = sha256Hex(readFileSync(join(src.dataDir, f)))
  const lock = join(REPO_ROOT, "bun.lock")
  const configHash = await configSha256(
    CONFIG_FILES.map((f) => join(src.configDir, f)),
  )
  const manifest: Record<string, unknown> = {
    run_id: src.runId,
    seed,
    n_mc: nMc,
    git_commit: gitCommit(),
    versions: { bun: Bun.version },
    bun_lock_sha256: existsSync(lock)
      ? sha256Hex(readFileSync(lock))
      : "unavailable",
    config_sha256: configHash,
    config_files: configFiles,
    constants_sha256: sha256Hex(
      canonical({
        mat: ctx.mat,
        weather: ctx.weather,
        ranges: ctx.ranges,
        controls: ctx.controls,
      }),
    ),
    data_sha256: dataFiles,
    files: entries,
    extra: [...extra].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  }
  manifest.core_sha256 = manifestCoreHash(manifest)
  const path = join(outDir, MANIFEST_FILE)
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
  emit("manifest.written", "info", {
    path: MANIFEST_FILE,
    config_sha256: configHash,
  })
  return path
}

/**
 * Plan 00 D12: record the sha256 of report.html as the manifest's last field. The core hash does not change (it excludes this
 * field), which is why the page can show the core hash without depending on its own hash. Written atomically.
 */
export function setReportHash(outDir: string, sha256: string): void {
  const path = join(outDir, MANIFEST_FILE)
  const m = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  delete m.report_sha256
  m.report_sha256 = sha256
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
}
